"""Del texto temporizado a curvas de canales de habla.

Entrada: eventos con ``t0``/``t1`` (de ``tiempos``). Salida: para cada canal una
lista ``[(segundos, valor)]`` con la misma lista de tiempos en todos (así se
puede escribir como fotogramas clave sin que un canal «adivine» a otro).

Qué hace para que no parezca un muñeco de ventrílocuo:
* Coarticulación: una consonante hereda el redondeo de labios de la vocal que
  la rodea (decir «mu» ya redondea en la «m»).
* Las bilabiales (m, b, p) cierran de verdad los labios y sin mandíbula.
* Las consonantes muy cortas se funden: un sonido de 20 ms no se anima.
* La apertura de la mandíbula sigue la energía del audio, no solo la vocal.
* Las vocales acentuadas dan golpes de énfasis (ceja y cabeza).
"""
from . import estandar

LABIOS = tuple(estandar.LABIOS_REDONDOS)
CONSONANTES_BLANDAS = ("C", "S", "CH")


def _pesos_viseme(bib, v, amp, energia, intensidad):
    base = bib["visemas"].get(v, {})
    fuerza = amp * (0.62 + 0.55 * energia) * intensidad
    return {k: w * fuerza for k, w in base.items()}


def _vocal_vecina(sonidos, i):
    """Pesos de la vocal más cercana (siguiente; si no hay, la anterior)."""
    for j in range(i + 1, min(len(sonidos), i + 4)):
        if sonidos[j]["v"] in "AEIOU" and len(sonidos[j]["v"]) == 1:
            return j
    for j in range(i - 1, max(-1, i - 4), -1):
        if sonidos[j]["v"] in "AEIOU" and len(sonidos[j]["v"]) == 1:
            return j
    return None


def construir(eventos, bib, env_norm=None, paso_env=0.01, fps=24.0, intensidad=1.0,
              coart=0.6, reposo=0.14):
    from .tiempos import energia

    cuadro = 1.0 / fps
    sonidos = [e for e in eventos if e["v"] != "_"]
    # fundir consonantes blandas demasiado cortas
    utiles = []
    for e in sonidos:
        dur = e["t1"] - e["t0"]
        if e["v"] in CONSONANTES_BLANDAS and dur < 1.4 * cuadro:
            continue
        utiles.append(e)
    sonidos = utiles
    if not sonidos:
        return {"canales": {}, "tiempos": [], "enfasis": []}

    en = []
    for e in sonidos:
        en.append(energia(env_norm, paso_env, e["t0"], e["t1"]) if env_norm else 0.6)

    objetivo = []
    for i, e in enumerate(sonidos):
        w = _pesos_viseme(bib, e["v"], e.get("amp", 1.0) or 1.0, en[i], intensidad)
        if e["v"] in CONSONANTES_BLANDAS or e["v"] == "F":
            j = _vocal_vecina(sonidos, i)
            if j is not None and e["v"] != "F":
                vec = sonidos[j]
                wv = _pesos_viseme(bib, vec["v"], vec.get("amp", 1.0) or 1.0, en[j], intensidad)
                for ch in LABIOS:
                    w[ch] = (1 - coart) * w.get(ch, 0.0) + coart * wv.get(ch, 0.0)
                w["jawOpen"] = w.get("jawOpen", 0.0) + 0.35 * wv.get("jawOpen", 0.0)
        if e["v"] == "M":
            w["jawOpen"] = 0.0
            for ch in LABIOS:
                w[ch] = 0.0
        objetivo.append(w)

    claves = []     # (t, pesos)
    zero = {}
    t_ini = sonidos[0]["t0"]
    claves.append((max(0.0, t_ini - 0.10), zero))
    for i, (e, w) in enumerate(zip(sonidos, objetivo)):
        d = e["t1"] - e["t0"]
        if e["v"] == "M":
            # el cierre llega antes que la vocal siguiente: se sostiene todo el sonido
            claves.append((e["t0"] + 0.15 * d, w)); claves.append((e["t1"] - 0.15 * d, w))
        elif d >= 5 * cuadro:
            claves.append((e["t0"] + 0.25 * d, w)); claves.append((e["t1"] - 0.25 * d, w))
        else:
            claves.append((0.5 * (e["t0"] + e["t1"]), w))
        sig = sonidos[i + 1] if i + 1 < len(sonidos) else None
        if sig is not None and sig["t0"] - e["t1"] > 0.14:
            # silencio entre frases: la boca se relaja
            claves.append((e["t1"] + 0.06, zero))
            claves.append((sig["t0"] - 0.08, zero))
    claves.append((sonidos[-1]["t1"] + reposo, zero))

    # ordenar y separar tiempos casi iguales
    claves.sort(key=lambda c: c[0])
    ordenadas = []
    for t, w in claves:
        if ordenadas and t - ordenadas[-1][0] < 0.4 * cuadro:
            t = ordenadas[-1][0] + 0.4 * cuadro
        ordenadas.append((t, w))

    nombres = sorted({k for _t, w in ordenadas for k in w})
    tiempos = [t for t, _w in ordenadas]
    canales = {n: [w.get(n, 0.0) for _t, w in ordenadas] for n in nombres}

    enfasis = []
    for e, ener in zip(sonidos, en):
        if e["v"] in "AEIOU" and len(e["v"]) == 1 and (e.get("amp", 1.0) >= 1.2 or ener > 0.92):
            enfasis.append((0.5 * (e["t0"] + e["t1"]), min(1.0, 0.6 + 0.4 * ener)))
    return {"canales": canales, "tiempos": tiempos, "enfasis": enfasis}
