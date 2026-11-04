"""Tiempos: del audio y del texto a una línea de tiempo de visemas.

Todo en Python estándar (wave/json) para poder probarlo fuera de Blender.

Idea central: el texto da el orden y el peso de cada sonido; el audio da DÓNDE
hay voz. Se recortan silencios al principio, al final y entre frases, y se
reparten los sonidos solo sobre el tiempo con voz. Así la boca se cierra
exactamente cuando la persona calla, sin depender de adivinar la velocidad.
"""
import array
import json
import wave

from .fonemas_es import contar_frases

UNIDAD_S = 0.082                # segundos por unidad de peso sin audio
PAUSA_S = {False: 0.22, True: 0.45}


# ------------------------------------------------------------------ audio

def leer_wav(ruta):
    """-> (muestras mono en -1..1, tasa). PCM de 8, 16, 24 o 32 bits."""
    w = wave.open(ruta, "rb")
    try:
        canales, ancho, tasa, n = (w.getnchannels(), w.getsampwidth(),
                                   w.getframerate(), w.getnframes())
        crudo = w.readframes(n)
    finally:
        w.close()
    if ancho == 2:
        a = array.array("h"); a.frombytes(crudo[:len(crudo) - len(crudo) % 2])
        escala = 32768.0
        v = list(a)
    elif ancho == 1:
        v = [b - 128 for b in crudo]; escala = 128.0
    elif ancho == 3:
        v = []
        for i in range(0, len(crudo) - 2, 3):
            x = crudo[i] | (crudo[i + 1] << 8) | (crudo[i + 2] << 16)
            v.append(x - (1 << 24) if x & 0x800000 else x)
        escala = 8388608.0
    elif ancho == 4:
        a = array.array("i"); a.frombytes(crudo[:len(crudo) - len(crudo) % 4])
        v = list(a); escala = 2147483648.0
    else:
        raise ValueError("WAV no soportado (%d bytes por muestra)" % ancho)
    if canales > 1:
        v = [sum(v[i:i + canales]) / canales for i in range(0, len(v) - canales + 1, canales)]
    return [x / escala for x in v], tasa


def envolvente(muestras, tasa, paso=0.01):
    """RMS cada ``paso`` segundos (lista de floats >= 0)."""
    por = max(1, int(tasa * paso))
    env = []
    for i in range(0, len(muestras), por):
        bloque = muestras[i:i + por]
        env.append((sum(x * x for x in bloque) / len(bloque)) ** 0.5)
    return env


def _percentil(vals, p):
    if not vals:
        return 0.0
    s = sorted(vals)
    return s[min(len(s) - 1, int(p * (len(s) - 1)))]


def normalizar(env):
    """0..1 respecto al percentil 95 (un golpe fuerte no aplasta el resto)."""
    ref = _percentil(env, 0.95) or max(env or [1.0]) or 1.0
    return [min(1.0, e / ref) for e in env]


def segmentos_voz(env, paso=0.01, umbral=0.10, min_silencio=0.16, min_voz=0.06):
    """Tramos con voz: [(t0, t1)] en segundos."""
    if not env:
        return []
    suave = [sum(env[max(0, i - 1):i + 2]) / len(env[max(0, i - 1):i + 2])
             for i in range(len(env))]
    ruido, techo = _percentil(suave, 0.10), _percentil(suave, 0.95)
    thr = ruido + umbral * max(techo - ruido, 1e-9)
    thr = max(thr, 1e-4)
    segs, ini = [], None
    for i, e in enumerate(suave):
        if e >= thr and ini is None:
            ini = i
        elif e < thr and ini is not None:
            segs.append([ini * paso, i * paso]); ini = None
    if ini is not None:
        segs.append([ini * paso, len(suave) * paso])
    fund = []
    for s in segs:
        if fund and s[0] - fund[-1][1] < min_silencio:
            fund[-1][1] = s[1]
        else:
            fund.append(s)
    return [(a, b) for a, b in fund if b - a >= min_voz]


def energia(env_norm, paso, t0, t1):
    """Energía media 0..1 del audio entre t0 y t1."""
    if not env_norm:
        return 0.6
    a = max(0, int(t0 / paso)); b = min(len(env_norm), max(a + 1, int(t1 / paso)))
    trozo = env_norm[a:b] or [0.6]
    return sum(trozo) / len(trozo)


# ------------------------------------------------------------- asignación

def _copiar(e, t0, t1):
    d = dict(e); d["t0"] = t0; d["t1"] = t1
    return d


def sin_audio(eventos, inicio=0.0):
    t, out = inicio, []
    for e in eventos:
        dur = PAUSA_S[e["fuerte"]] if e["v"] == "_" else e["w"] * UNIDAD_S
        out.append(_copiar(e, t, t + dur)); t += dur
    return out


def _repartir(grupo, t0, t1):
    total = sum(e["w"] for e in grupo) or 1.0
    t, out = t0, []
    for e in grupo:
        dt = (t1 - t0) * e["w"] / total
        out.append(_copiar(e, t, t + dt)); t += dt
    return out


def _por_grupos(eventos, segs, solo_fuertes):
    grupos, actual = [], []
    for e in eventos:
        if e["v"] == "_":
            if (e["fuerte"] or not solo_fuertes) and actual:
                grupos.append(actual); actual = []
        else:
            actual.append(e)
    if actual:
        grupos.append(actual)
    out = []
    for g, (a, b) in zip(grupos, segs):
        out.extend(_repartir(g, a, b))
    return out


def _global(voz, segs):
    """Reparte los sonidos sobre el eje de 'tiempo con voz' y lo devuelve al tiempo real."""
    largos = [b - a for a, b in segs]
    total_voz = sum(largos)
    total_w = sum(e["w"] for e in voz) or 1.0
    acum = [0.0]
    for L in largos:
        acum.append(acum[-1] + L)

    def mapa(x, fin):
        x = min(max(x, 0.0), total_voz)
        for k in range(len(segs)):
            lo, hi = acum[k], acum[k + 1]
            dentro = (lo < x <= hi) if fin else (lo <= x < hi)
            if dentro or k == len(segs) - 1:
                return segs[k][0] + min(max(x - lo, 0.0), largos[k])
        return segs[-1][1]

    out, w = [], 0.0
    for e in voz:
        x0 = w * total_voz / total_w
        w += e["w"]
        x1 = w * total_voz / total_w
        out.append(_copiar(e, mapa(x0, False), mapa(x1, True)))
    for e in out:
        if e["t1"] < e["t0"]:
            e["t1"] = e["t0"]
    return out


def con_segmentos(eventos, segs):
    """Eventos con t0/t1 reales según los tramos de voz del audio."""
    voz = [e for e in eventos if e["v"] != "_"]
    if not segs:
        return sin_audio(eventos)
    for solo in (True, False):
        if contar_frases(eventos, solo) == len(segs):
            sonidos = _por_grupos(eventos, segs, solo)
            break
    else:
        sonidos = _global(voz, segs)
    return _insertar_pausas(eventos, sonidos)


def _insertar_pausas(eventos, sonidos):
    """Devuelve sonidos + pausas con t0/t1 pegados a los vecinos."""
    it = iter(sonidos)
    out, prev_fin = [], None
    pendientes = []
    for e in eventos:
        if e["v"] == "_":
            pendientes.append(e)
        else:
            s = next(it)
            for p in pendientes:
                out.append(_copiar(p, prev_fin if prev_fin is not None else s["t0"], s["t0"]))
            pendientes = []
            out.append(s); prev_fin = s["t1"]
    fin = prev_fin if prev_fin is not None else 0.0
    for p in pendientes:
        out.append(_copiar(p, fin, fin))
    return out


# --------------------------------------------------------------- Rhubarb

_RHUBARB = {"A": "M", "B": "C", "C": "E", "D": "A", "E": "O", "F": "U",
            "G": "F", "H": "C", "X": "_"}


def leer_rhubarb(ruta):
    """Importa el JSON de Rhubarb Lip Sync como eventos ya temporizados."""
    with open(ruta, "r", encoding="utf-8") as f:
        datos = json.load(f)
    out = []
    for c in datos["mouthCues"]:
        v = _RHUBARB.get(c["value"], "C")
        out.append({"v": v, "w": 1.0, "amp": 0.0 if v == "_" else 1.0,
                    "frase": 0, "fuerte": v == "_",
                    "t0": float(c["start"]), "t1": float(c["end"])})
    return out
