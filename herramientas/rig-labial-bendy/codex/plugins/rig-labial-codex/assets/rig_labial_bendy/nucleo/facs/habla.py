# Habla en español para las formas FACS: texto -> fonemas (reglas del español, no letras) -> visemas ->
# tiempos -> coarticulación por dominancia (Cohen-Massaro) -> curvas de canales -> keyframes editables
# (canales v_<forma> del objeto de control) + JSON para three.js.
#
# Tiempos, de mejor a peor:
#   1. alineación dada (JSON con fonemas o palabras y tiempos; p. ej. de Montreal Forced Aligner, Vosk o de los
#      eventos de fonema de SAPI);
#   2. solo audio + texto: se detectan los tramos de voz del WAV (energía) y se reparten los fonemas por
#      duraciones típicas del español, encajando las pausas del texto en los silencios del audio.
# Nunca se abre la boca «según el volumen»: el volumen solo sirve para saber dónde hay voz.
import json, math, re, wave
import numpy as np

# ---------------------------------------------------------------- texto -> fonemas
# Símbolos: vocales a e i o u; semivocales j w; p b B(β) t d D(ð) k g G(ɣ) f s T(θ) x tS(ch) J(ʝ: y/ll)
# m n N(ñ) l r(ɾ) R(rr) ; pausa '_'.
_ACENTO = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u'}
VOCALES = set('aeiou')


def _silabas_acento(pal):
    """índice (en la lista de vocales) de la vocal tónica: tilde o reglas llana/aguda."""
    vs = [i for i, ch in enumerate(pal) if ch in VOCALES or ch in _ACENTO]
    if not vs:
        return None
    for k, i in enumerate(vs):
        if pal[i] in 'áéíóú':
            return k
    # núcleos silábicos aproximados: grupos de vocales seguidas cuentan como uno; dentro del grupo manda la
    # vocal fuerte (a, e, o) o, si las dos son débiles, la segunda (cui-da-do, ciu-dad)
    grupos, prev = [], -2
    for k, i in enumerate(vs):
        if i != prev + 1:
            grupos.append([])
        grupos[-1].append(k)
        prev = i
    def nucleo(g):
        fuertes = [k for k in g if _ACENTO.get(pal[vs[k]], pal[vs[k]]) in 'aeo']
        return fuertes[0] if fuertes else g[-1]
    if len(grupos) == 1:
        return nucleo(grupos[0])
    llana = pal[-1] in 'aeiouns'
    return nucleo(grupos[-2] if llana else grupos[-1])


def g2p_palabra(pal, seseo=True):
    pal = pal.lower()
    tonica = _silabas_acento(pal)
    s = pal
    out, i, nv = [], 0, 0
    def sig(k):
        return s[k] if k < len(s) else ''
    while i < len(s):
        ch = s[i]; nx = sig(i + 1)
        base = _ACENTO.get(ch, ch)
        if base in VOCALES:
            out.append(('V', base, nv == tonica)); nv += 1; i += 1; continue
        if ch == 'c' and nx == 'h':
            out.append(('C', 'tS')); i += 2; continue
        if ch == 'l' and nx == 'l':
            out.append(('C', 'J')); i += 2; continue
        if ch == 'r' and nx == 'r':
            out.append(('C', 'R')); i += 2; continue
        if ch == 'q' and nx == 'u':
            out.append(('C', 'k')); i += 2; continue
        if ch == 'g' and nx == 'u' and sig(i + 2) in ('e', 'i', 'é', 'í'):
            out.append(('C', 'g')); i += 2; continue
        if ch == 'g' and nx == 'ü':
            out.append(('C', 'g')); out.append(('S', 'w')); i += 2; continue
        if ch == 'c':
            out.append(('C', ('s' if seseo else 'T') if _ACENTO.get(nx, nx) in ('e', 'i') else 'k')); i += 1; continue
        if ch == 'z':
            out.append(('C', 's' if seseo else 'T')); i += 1; continue
        if ch == 'g':
            out.append(('C', 'x' if _ACENTO.get(nx, nx) in ('e', 'i') else 'g')); i += 1; continue
        if ch == 'j':
            out.append(('C', 'x')); i += 1; continue
        if ch == 'h':
            i += 1; continue
        if ch == 'y':
            if nx == '' or _ACENTO.get(nx, nx) not in VOCALES:
                out.append(('V', 'i', False)); nv += 1
            else:
                out.append(('C', 'J'))
            i += 1; continue
        if ch == 'x':
            out.append(('C', 'k')); out.append(('C', 's')); i += 1; continue
        if ch == 'ñ':
            out.append(('C', 'N')); i += 1; continue
        if ch == 'v' or ch == 'b':
            out.append(('C', 'b')); i += 1; continue
        if ch == 'w':
            out.append(('S', 'w')); i += 1; continue
        if ch == 'r':
            prev = s[i - 1] if i > 0 else ''
            out.append(('C', 'R' if i == 0 or prev in 'nls' else 'r')); i += 1; continue
        if ch in 'ptdkfslmn':
            out.append(('C', ch)); i += 1; continue
        i += 1
    # semivocales: i/u átonas junto a otra vocal
    for k, t in enumerate(out):
        if t[0] == 'V' and t[1] in 'iu' and not t[2]:
            vecina = any(0 <= k + d < len(out) and out[k + d][0] == 'V' for d in (-1, 1))
            if vecina:
                out[k] = ('S', 'j' if t[1] == 'i' else 'w')
    return out


def g2p(texto, seseo=True):
    """texto -> lista de (palabra, fonemas) y pausas ('_', duración). Asimilación n->m ante p/b/m, lenición
    b/d/g entre vocales (β ð ɣ: cierre más débil)."""
    tokens = re.findall(r"[a-záéíóúüñ]+|[.,;:!?¡¿…]", texto.lower())
    seq = []
    for t in tokens:
        if re.match(r"[.,;:!?¡¿…]", t):
            if t in '¡¿':
                continue
            seq.append(('_', 0.32 if t in '.!?…' else 0.18))
        else:
            seq.append((t, g2p_palabra(t, seseo)))
    # fonética entre palabras: n -> m ante bilabial, lenición intervocálica
    plano = []
    for w, f in seq:
        if w == '_':
            plano.append(('_', f)); continue
        for ph in f:
            plano.append((w, ph))
    for k in range(len(plano)):
        w, ph = plano[k]
        if w == '_' or ph == '_':
            continue
        nxt = next((plano[j][1] for j in range(k + 1, min(k + 3, len(plano))) if plano[j][0] != '_'), None)
        prv = plano[k - 1][1] if k > 0 and plano[k - 1][0] != '_' else None
        if ph == ('C', 'n') and nxt and nxt[0] == 'C' and nxt[1] in ('p', 'b', 'm'):
            plano[k] = (w, ('C', 'm'))
        if ph[0] == 'C' and ph[1] in ('b', 'd', 'g') and prv and prv[0] in 'VS' and nxt and nxt[0] in 'VS':
            plano[k] = (w, ('C', ph[1].upper()))
    out, cur, curw = [], [], None
    for w, ph in plano:
        if w == '_':
            if cur:
                out.append((curw, cur)); cur = []
            out.append(('_', ph)); curw = None
            continue
        if curw is not None and w != curw:
            out.append((curw, cur)); cur = []
        curw = w; cur.append(ph)
    if cur:
        out.append((curw, cur))
    return out


# ---------------------------------------------------------------- fonema -> visema
VISEMA = {'a': 'A', 'e': 'E', 'i': 'I', 'o': 'O', 'u': 'U', 'j': 'I', 'w': 'U',
          'p': 'MBP', 'b': 'MBP', 'm': 'MBP', 'B': 'BL', 'f': 'FV',
          's': 'S', 'T': 'TH', 'x': 'K', 'tS': 'CH', 'J': 'CH',
          't': 'TDNL', 'd': 'TDNL', 'D': 'TDNL', 'n': 'TDNL', 'N': 'TDNL', 'l': 'TDNL', 'r': 'TDNL', 'R': 'TDNL',
          'k': 'K', 'g': 'K', 'G': 'K'}
# duración típica (s)
DUR = {'V': 0.085, 'Vt': 0.11, 'S': 0.045, 'p': 0.065, 't': 0.06, 'k': 0.065, 'b': 0.055, 'd': 0.05, 'g': 0.055,
       'B': 0.04, 'D': 0.035, 'G': 0.04, 'm': 0.06, 'n': 0.055, 'N': 0.07, 'l': 0.055, 'r': 0.03, 'R': 0.08,
       's': 0.09, 'f': 0.085, 'T': 0.085, 'x': 0.085, 'tS': 0.1, 'J': 0.07}
# fuerza (cuánto «manda») por grupo de canales: mandíbula, redondeo, estiramiento, cierre de labios, lengua
DOM = {'A': (1.0, 0.7, 1.0, 1.0, 0.3), 'E': (1.0, 0.7, 1.0, 1.0, 0.3), 'I': (1.0, 0.8, 1.2, 1.0, 0.3),
       'O': (1.0, 1.3, 0.8, 1.0, 0.3), 'U': (1.0, 1.4, 0.8, 1.0, 0.3),
       'MBP': (3.0, 0.5, 0.4, 6.0, 0.2), 'FV': (2.0, 0.4, 0.5, 5.0, 0.2), 'S': (1.4, 0.3, 0.6, 0.6, 1.0),
       'TH': (1.4, 0.3, 0.6, 0.6, 3.0), 'CH': (1.2, 2.0, 0.3, 0.8, 1.0), 'TDNL': (0.5, 0.15, 0.2, 0.3, 4.0),
       'K': (0.4, 0.1, 0.1, 0.3, 0.5),
       # 0.7.2 (Lamine): b/v entre vocales ([β], «hoy vamos») acerca los labios sin cerrarlos
       'BL': (1.2, 0.4, 0.4, 2.5, 0.2), 'REST': (1.2, 1.2, 1.2, 1.2, 1.2)}
# los bilabiales y labiodentales mandan mucho pero solo cerca de su centro (grupos mandíbula y cierre)
ESTRECHO = {'MBP': (0, 3), 'FV': (0, 3), 'BL': (3,)}
GRUPO = {'jawOpen': 0, 'mouthClose': 3,
         'mouthFunnel': 1, 'mouthPucker': 1, 'mouthShrugUpper': 1,
         'mouthStretch': 2, 'mouthSmile': 2, 'mouthUpperUp': 2, 'mouthLowerDown': 2,
         'mouthPress': 3, 'mouthRollUpper': 3, 'mouthRollLower': 3,
         'tongueUp': 4, 'tongueOut': 4}
# anticipación / arrastre (s) por grupo: el redondeo se adelanta mucho (coarticulación de la U/O)
ANT = (0.06, 0.12, 0.07, 0.03, 0.05)
ARR = (0.08, 0.10, 0.08, 0.04, 0.05)


def _canal_base(n):
    return n[:-2] if n.endswith(('_L', '_R')) else n


def secuencia(texto, tiempos=None, audio=None, seseo=True, inicio=0.0, avisos=None):
    """-> lista de segmentos {'f': fonema, 'v': visema, 't0', 't1', 'tonica', 'palabra'} (s).
    0.7.2 (Lamine): `avisos` (lista opcional) recibe los textos de aviso, p. ej. si el texto no encaja con el audio."""
    pals = g2p(texto, seseo)
    # duraciones estimadas
    est = []
    for w, f in pals:
        if w == '_':
            est.append(('_', [('_', f, False)], None)); continue
        segs = []
        for ph in f:
            if ph[0] == 'V':
                segs.append((ph[1], DUR['Vt'] if ph[2] else DUR['V'], ph[2]))
            elif ph[0] == 'S':
                segs.append((ph[1], DUR['S'], False))
            else:
                segs.append((ph[1], DUR.get(ph[1], 0.06), False))
        est.append((w, segs, True))
    if tiempos is not None and tiempos.get('fonemas'):
        return _con_fonemas(est, tiempos['fonemas'])
    if tiempos is not None and tiempos.get('palabras'):
        return _con_palabras(est, tiempos['palabras'])
    if audio is not None:
        return _con_audio(est, audio, inicio, avisos)
    t, out = inicio, []
    for w, segs, _ in est:
        for ph, d, ton in segs:
            if ph == '_':
                out.append({'f': '_', 'v': 'REST', 't0': t, 't1': t + d, 'tonica': False, 'palabra': None}); t += d; continue
            out.append({'f': ph, 'v': VISEMA.get(ph, 'K'), 't0': t, 't1': t + d, 'tonica': ton, 'palabra': w}); t += d
    return out


def _con_palabras(est, palabras):
    out, k = [], 0
    for w, segs, es in est:
        if w == '_':
            continue
        if k >= len(palabras):
            break
        t0, t1 = palabras[k]['inicio'], palabras[k]['fin']; k += 1
        tot = sum(d for _, d, _ in segs)
        t = t0
        for ph, d, ton in segs:
            dd = d / tot * (t1 - t0)
            out.append({'f': ph, 'v': VISEMA.get(ph, 'K'), 't0': t, 't1': t + dd, 'tonica': ton, 'palabra': w}); t += dd
    return out


def _con_fonemas(est, fon):
    """fonemas dados (lista {'p', 'inicio', 'fin'}); 'p' en nuestros símbolos o IPA aproximada."""
    ipa = {'β': 'B', 'ð': 'D', 'ɣ': 'G', 'θ': 'T', 'ʝ': 'J', 'ʎ': 'J', 'ɲ': 'N', 'ɾ': 'r', 'r': 'R', 'tʃ': 'tS',
           'χ': 'x', 'x': 'x', 'ŋ': 'n', 'ʃ': 'tS'}
    out = []
    for f in fon:
        p = ipa.get(f['p'], f['p'])
        if p in ('_', 'sil', 'sp', ''):
            out.append({'f': '_', 'v': 'REST', 't0': f['inicio'], 't1': f['fin'], 'tonica': False, 'palabra': None}); continue
        out.append({'f': p, 'v': VISEMA.get(p, 'K'), 't0': f['inicio'], 't1': f['fin'], 'tonica': bool(f.get('tonica')),
                    'palabra': f.get('palabra')})
    return out


def leer_wav(ruta):
    with wave.open(ruta, 'rb') as w:
        sr = w.getframerate(); n = w.getnframes(); ch = w.getnchannels(); sw = w.getsampwidth()
        raw = w.readframes(n)
    dt = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    x = np.frombuffer(raw, dtype=dt).astype(np.float32)
    if ch > 1:
        x = x.reshape(-1, ch).mean(1)
    x /= float(np.iinfo(dt).max)
    return x, sr


def tramos_voz(x, sr, hop=0.01, umbral=0.06, hueco=0.14, minimo=0.05):
    """tramos [(t0, t1)] con voz: energía RMS por ventanas de 10 ms; umbral relativo al percentil 95."""
    n = int(sr * hop)
    m = len(x) // n
    rms = np.sqrt((x[:m * n].reshape(m, n) ** 2).mean(1) + 1e-12)
    ref = np.percentile(rms, 95)
    voz = rms > max(umbral * ref, 1e-4)
    tramos, t = [], 0
    while t < m:
        if voz[t]:
            a = t
            while t < m and voz[t]:
                t += 1
            tramos.append([a * hop, t * hop])
        t += 1
    unidos = []
    for a, b in tramos:
        if unidos and a - unidos[-1][1] < hueco:
            unidos[-1][1] = b
        else:
            unidos.append([a, b])
    return [(a, b) for a, b in unidos if b - a >= minimo], rms, hop


# 0.7.2 (Lamine): razón voz del WAV / voz estimada del texto fuera de este rango = el texto no es lo que dice el audio
# (el habla real va entre ~0,8 y ~1,5 veces la duración típica de DUR)
RAZON_TEXTO_AUDIO = (0.75, 1.45)


def aviso_texto_audio(est, tramos):
    """-> texto de aviso o None. Compara la voz del audio (suma de tramos) con la duración estimada del texto sin pausas."""
    txt = sum(d for w, segs, _ in est if w != '_' for _, d, _ in segs)
    voz = sum(b - a for a, b in tramos)
    if txt <= 0 or voz <= 0:
        return None
    r = voz / txt
    if RAZON_TEXTO_AUDIO[0] <= r <= RAZON_TEXTO_AUDIO[1]:
        return None
    return (f'El texto no parece ser lo que dice el audio (texto ≈ {txt:.1f} s, voz ≈ {voz:.1f} s). '
            'Escribe exactamente lo que se oye.')


def _con_audio(est, audio, inicio=0.0, avisos=None):
    """reparte los fonemas en los tramos de voz del WAV. Las pausas del texto caen en los silencios; si hay más
    silencios que pausas, se eligen los cortes entre palabras que mejor encajan con las duraciones esperadas."""
    x, sr = leer_wav(audio)
    tramos, rms, hop = tramos_voz(x, sr)
    if not tramos:
        return secuencia_sin_tiempos(est, inicio)
    av = aviso_texto_audio(est, tramos)
    if av and avisos is not None:
        avisos.append(av)
    palabras = [(w, segs) for w, segs, es in est if w != '_']
    pausas_texto = set()
    k = 0
    for w, segs, es in est:
        if w == '_':
            pausas_texto.add(k)
        else:
            k += 1
    dur = np.array([sum(d for _, d, _ in segs) for _, segs in palabras])
    n_tr = len(tramos)
    # cortes: n_tr-1 fronteras entre palabras; preferir las pausas del texto; DP por proporción de duraciones
    acum = np.r_[0, np.cumsum(dur)] / dur.sum()
    voz_tot = sum(b - a for a, b in tramos)
    obj = np.cumsum([b - a for a, b in tramos])[:-1] / voz_tot
    cortes, ult = [], 0
    for o in obj:
        cand = range(ult + 1, len(palabras))
        if not cand:
            cortes.append(len(palabras)); continue
        best = min(cand, key=lambda c: abs(acum[c] - o) - (0.08 if c in pausas_texto else 0.0))
        cortes.append(best); ult = best
    grupos, a = [], 0
    for c in cortes + [len(palabras)]:
        grupos.append(palabras[a:c]); a = c
    out = []
    t_prev = inicio
    for (t0, t1), g in zip(tramos, grupos):
        t0 += inicio; t1 += inicio
        if t0 > t_prev + 1e-3:
            out.append({'f': '_', 'v': 'REST', 't0': t_prev, 't1': t0, 'tonica': False, 'palabra': None})
        tot = sum(sum(d for _, d, _ in segs) for _, segs in g) or 1.0
        t = t0
        for w, segs in g:
            for ph, d, ton in segs:
                dd = d / tot * (t1 - t0)
                out.append({'f': ph, 'v': VISEMA.get(ph, 'K'), 't0': t, 't1': t + dd, 'tonica': ton, 'palabra': w}); t += dd
        t_prev = t1
    return out


def secuencia_sin_tiempos(est, inicio):
    t, out = inicio, []
    for w, segs, _ in est:
        for ph, d, ton in segs:
            v = 'REST' if ph == '_' else VISEMA.get(ph, 'K')
            out.append({'f': ph, 'v': v, 't0': t, 't1': t + d, 'tonica': ton, 'palabra': None if ph == '_' else w}); t += d
    return out


# ---------------------------------------------------------------- coarticulación
def curvas(seq, visemas, fps=24, intensidad=1.0, rest=None, pre=0.25, post=0.35, tonica=1.15):
    """Modelo de dominancia: cada segmento tira de cada grupo de canales hacia su visema con una fuerza que
    decae (gaussiana) antes y después de su centro; el valor es la media ponderada. Los bilabiales mandan
    mucho y en poco tiempo (los labios llegan a cerrarse); los linguales casi no tocan los labios (heredan la
    forma de las vocales vecinas); el redondeo de O/U se adelanta. Devuelve (tiempos, {canal: valores})."""
    if not seq:
        return np.zeros(0), {}
    t_ini = seq[0]['t0'] - pre; t_fin = seq[-1]['t1'] + post
    T = np.arange(math.floor(t_ini * fps), math.ceil(t_fin * fps) + 1) / fps
    canales = sorted({c for v in visemas.values() for c in v})
    num = {c: np.zeros(len(T)) for c in canales}
    den = {g: np.zeros(len(T)) for g in range(5)}
    rest = rest or {}
    # el silencio también es un segmento (manda hacia la boca neutra)
    segs = list(seq)
    segs.insert(0, {'v': 'REST', 't0': t_ini, 't1': seq[0]['t0'], 'tonica': False})
    segs.append({'v': 'REST', 't0': seq[-1]['t1'], 't1': t_fin, 'tonica': False})
    for s in segs:
        tc = 0.5 * (s['t0'] + s['t1']); d = max(s['t1'] - s['t0'], 1.0 / fps)
        tgt = visemas.get(s['v'], {}) if s['v'] != 'REST' else rest
        dom = DOM.get(s['v'], DOM['K'])
        amp = intensidad * (tonica if s.get('tonica') else 1.0)
        for g in range(5):
            sl = 0.5 * d + ANT[g]; sr = 0.5 * d + ARR[g]
            if g in ESTRECHO.get(s['v'], ()):
                sl = sr = 0.35 * d + 0.02
            sig = np.where(T < tc, sl, sr)
            D = dom[g] * np.exp(-((T - tc) / sig) ** 2)
            den[g] += D
            for c in canales:
                if GRUPO.get(_canal_base(c), 2) != g:
                    continue
                v = tgt.get(c, 0.0)
                if g == 0 or c.startswith('mouthLowerDown') or c.startswith('mouthUpperUp'):
                    v *= amp
                num[c] += D * v
    out = {}
    for c in canales:
        g = GRUPO.get(_canal_base(c), 2)
        out[c] = np.clip(num[c] / (den[g] + 1e-6), 0, 1)
    # 0.7.2 (Lamine): mandíbula y labios verticales sin castañeteo: filtro de ~2 fotogramas (quita picos de 1-2 fotogramas)
    # y suelo dentro de cada tramo continuo de habla (entre pausas); los bilabiales cierran después, encima del suelo
    vert = [c for c in out if _canal_base(c) in ('jawOpen', 'mouthLowerDown', 'mouthUpperUp')]
    for c in vert:
        out[c] = _suave(out[c])
    r = 2.0 / fps
    piso = np.zeros(len(T))
    for a, b in _corridas(seq):
        x = np.minimum(np.clip((T - a) / r, 0, 1), np.clip((b - T) / r, 0, 1))
        piso = np.maximum(piso, x * x * (3 - 2 * x))
    for c in vert:
        b = _canal_base(c)
        suelo = PISO_MANDIBULA if b == 'jawOpen' else PISO_LABIO if b == 'mouthLowerDown' else 0.0
        if suelo:
            out[c] = np.maximum(out[c], suelo * piso)
    # bilabiales: en su centro la boca se cierra seguro (sin abertura artificial); la mandíbula y los labios verticales
    # entran y salen del cierre en ~2-3 fotogramas (sigma mínima 0,06 s) en vez de a golpe
    for s in seq:
        if s['v'] == 'MBP':
            tc = 0.5 * (s['t0'] + s['t1'])
            d = s['t1'] - s['t0']
            w = np.exp(-((T - tc) / (0.5 * d + 0.02)) ** 2)
            wv = np.exp(-((T - tc) / max(0.5 * d + 0.02, SIGMA_CIERRE)) ** 2)
            for c in out:
                b = _canal_base(c)
                if b in ('jawOpen', 'mouthLowerDown', 'mouthUpperUp'):
                    out[c] = out[c] * (1 - 0.94 * wv)
                elif b == 'mouthFunnel':
                    out[c] = out[c] * (1 - 0.92 * w)
    # 0.7.2 (Lamine): el cierre de labios (mouthPress, etc.) sube y baja con rampa de ~3 fotogramas a cada lado
    mbp = visemas.get('MBP', {})
    for s in seq:
        if s['v'] != 'MBP':
            continue
        tc = 0.5 * (s['t0'] + s['t1']); d = s['t1'] - s['t0']
        x = np.clip((np.abs(T - tc) - 0.25 * d) / (RAMPA_CIERRE / fps), 0, 1)
        e = 1 - x * x * (3 - 2 * x)
        for c in out:
            if GRUPO.get(_canal_base(c), 2) == 3 and mbp.get(c, 0) > 0:
                out[c] = np.maximum(out[c], 0.95 * mbp[c] * e)
    # 0.7.2 (Lamine): asimetría natural leve (±5-8 %, fija por canal y lado) en los canales de boca _L/_R
    rng = np.random.default_rng(23)
    for c in sorted(out):
        if c.startswith('mouth') and c.endswith(('_L', '_R')):
            f = 1 + rng.choice([-1.0, 1.0]) * rng.uniform(0.05, 0.08)
            out[c] = np.clip(out[c] * f, 0, 1)
    return T, out


# 0.7.2 (Lamine): ajustes del lip sync natural
PISO_MANDIBULA = 0.07     # apertura mínima de la mandíbula dentro de un tramo continuo de habla
PISO_LABIO = 0.025        # idem mouthLowerDown
SIGMA_CIERRE = 0.075      # s: anchura mínima de la entrada/salida del cierre bilabial en mandíbula y labios verticales
RAMPA_CIERRE = 4.0        # fotogramas: rampa del cierre de labios (mouthPress...) a cada lado


def _suave(y):
    """filtro [1 2 1]/4 (≈2 fotogramas), con los bordes repetidos."""
    if len(y) < 3:
        return y
    p = np.r_[y[0], y, y[-1]]
    return 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]


def _corridas(seq):
    """[(t0, t1)] de los tramos continuos de habla: segmentos que no son silencio, uno detrás de otro."""
    out = []
    for s in seq:
        if s['v'] == 'REST':
            continue
        if out and s['t0'] - out[-1][1] < 1e-3:
            out[-1][1] = s['t1']
        else:
            out.append([s['t0'], s['t1']])
    return [tuple(x) for x in out]


def parpadeos(T, cada=(2.2, 4.8), dur=0.16, semilla=7):
    """parpadeos naturales (deterministas): curva 0..1 rápida al cerrar, más lenta al abrir."""
    rng = np.random.default_rng(semilla)
    b = np.zeros(len(T))
    if len(T) == 0:
        return b
    t = T[0] + rng.uniform(0.6, 1.4)
    while t < T[-1]:
        x = (T - t) / dur
        cierre = np.where(x < 0.35, np.clip(x / 0.35, 0, 1), np.clip(1 - (x - 0.35) / 0.65, 0, 1))
        b = np.maximum(b, np.where((x >= 0) & (x <= 1), cierre ** 0.8, 0))
        t += rng.uniform(*cada)
    return b


# ---------------------------------------------------------------- simplificar y escribir
def rdp(x, y, tol):
    """Ramer-Douglas-Peucker: índices de los puntos que se conservan."""
    keep = np.zeros(len(x), bool); keep[0] = keep[-1] = True
    pila = [(0, len(x) - 1)]
    while pila:
        a, b = pila.pop()
        if b <= a + 1:
            continue
        xs, ys = x[a:b + 1], y[a:b + 1]
        lin = ys[0] + (ys[-1] - ys[0]) * (xs - xs[0]) / (xs[-1] - xs[0] + 1e-12)
        err = np.abs(ys - lin); i = int(np.argmax(err))
        if err[i] > tol:
            keep[a + i] = True
            pila += [(a, a + i), (a + i, b)]
    return np.nonzero(keep)[0]


def escribir(ctrl, T, canales, fps, frame0=1, tol=0.012, borrar=True):
    """keyframes (Bézier AUTO_CLAMPED, sin rebotes) en los canales v_<forma> del objeto de control."""
    import bpy
    if ctrl.animation_data is None:
        ctrl.animation_data_create()
    ad = ctrl.animation_data
    act = ad.action
    if act is None:
        act = bpy.data.actions.new(f'{ctrl.name}_Habla'); ad.action = act
    n = 0
    for c, y in canales.items():
        prop = f'v_{c}'
        if prop not in ctrl.keys():
            continue
        path = f'["{prop}"]'
        if borrar:
            try:
                ctrl.keyframe_delete(path)
            except Exception:
                pass
            fc = None
            for f in _fcurves(act):
                if f.data_path == path:
                    fc = f
            if fc is not None:
                while fc.keyframe_points:
                    fc.keyframe_points.remove(fc.keyframe_points[0])
        fr = T * fps + frame0
        idx = rdp(fr, y, tol)
        for i in idx:
            ctrl[prop] = float(y[i])
            ctrl.keyframe_insert(path, frame=float(fr[i]))
            n += 1
        for f in _fcurves(act):
            if f.data_path == path:
                for kp in f.keyframe_points:
                    kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
                f.update()
    return n


def _fcurves(act):
    """fcurves de una acción (Blender 5: dentro de capas/ranuras)."""
    try:
        return list(act.fcurves)
    except AttributeError:
        out = []
        for lay in act.layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    out.extend(cb.fcurves)
        return out


def contrato(personaje, audio, seq, T, canales, fps, extra=None):
    """JSON para three.js (schemaVersion 1): visemas con tiempo y peso + curvas densas de las formas."""
    d = {'schemaVersion': 1, 'character': personaje, 'audio': audio, 'fps': fps,
         'visemes': [{'time': round(0.5 * (s['t0'] + s['t1']), 4), 'start': round(s['t0'], 4), 'end': round(s['t1'], 4),
                      'name': s['v'], 'phoneme': s['f'], 'weight': 1.0, 'stressed': bool(s.get('tonica'))} for s in seq],
         'morphs': {'times': [round(float(t), 4) for t in T],
                    'weights': {c: [round(float(v), 3) for v in y] for c, y in canales.items()}}}
    if extra:
        d.update(extra)
    return d


def montar(ctrl, bloques, visemas, fps=24, frame0=1, accion=None, separacion=0.5, parpadear=True, intensidad=1.0,
           seseo=True, escena=None, actuacion=None, mirada_fn=None, avisos=None):
    """Monta una pista completa en el objeto de control. bloques: lista de dicts
       {'nombre', 'texto', 'audio' (opcional), 'tiempos' (opcional: dict con 'fonemas' o 'palabras')}
       o {'nombre', 'fonemas': [(símbolo, duración), ...]} para pruebas a mano.
    Escribe keyframes en v_<forma>, pone el audio en el editor de vídeo y marcadores con el nombre de cada
    bloque. Devuelve (seq, T, canales, colocaciones). 0.7.2 (Lamine): `avisos` (lista opcional) recibe los avisos de
    cada bloque (p. ej. texto que no encaja con su audio); no bloquea nada."""
    import bpy
    sc = escena or bpy.context.scene
    seq, t, coloc = [], 0.2, []
    for b in bloques:
        t0 = t
        if 'fonemas' in b:
            fl = []
            for p, dur in b['fonemas']:
                fl.append({'p': p, 'inicio': t, 'fin': t + dur}); t += dur
            s = secuencia('', tiempos={'fonemas': fl}, seseo=seseo)
        elif b.get('audio'):
            tiempos = b.get('tiempos')
            if tiempos:
                tiempos = _desplazar(tiempos, t)
            s = secuencia(b['texto'], tiempos=tiempos, audio=None if tiempos else b['audio'], seseo=seseo, inicio=t, avisos=avisos)
            x, sr = leer_wav(b['audio']); t = t + len(x) / sr
        else:
            s = secuencia(b['texto'], seseo=seseo, inicio=t)
            t = s[-1]['t1'] if s else t
        seq += s
        coloc.append((b['nombre'], t0, b.get('audio')))
        t += separacion
    T, can = curvas(seq, visemas, fps=fps, intensidad=intensidad)
    mirada = []
    if actuacion is not False:
        disp = set(k[2:] for k in ctrl.keys() if k.startswith('v_'))
        can, mirada = actuar(T, can, seq, coloc, disp, actuacion if isinstance(actuacion, dict) else None)
    if parpadear:
        bl = parpadeos(T)
        hablando = np.zeros(len(T), bool)
        for nombre, t0, audio in coloc:
            if audio:
                hablando |= T >= t0
        bl[~hablando] = 0
        for lado in ('L', 'R'):
            k = f'eyeBlink_{lado}'
            can[k] = np.maximum(can.get(k, np.zeros(len(T))), bl)
    if ctrl.animation_data is None:
        ctrl.animation_data_create()
    if accion:
        viejo = bpy.data.actions.get(accion)
        if viejo is not None:
            if ctrl.animation_data.action == viejo:
                ctrl.animation_data.action = None
            bpy.data.actions.remove(viejo)
        act = bpy.data.actions.new(accion); act.use_fake_user = True
        ctrl.animation_data.action = act
    n = escribir(ctrl, T, can, fps, frame0=frame0)
    sc.sequence_editor_create(); se = sc.sequence_editor
    col = se.strips if hasattr(se, 'strips') else se.sequences
    canal = 1
    for nombre, t0, audio in coloc:
        for st in list(col):
            if st.name == nombre:
                col.remove(st)
        if audio:
            col.new_sound(nombre, audio, canal, int(round(t0 * fps)) + frame0); canal += 1
        for m in list(sc.timeline_markers):
            if m.name == nombre:
                sc.timeline_markers.remove(m)
        sc.timeline_markers.new(nombre, frame=int(round(t0 * fps)) + frame0)
    sc.frame_start = frame0; sc.frame_end = int(round(T[-1] * fps)) + frame0
    if mirada_fn is not None and mirada:
        mirada_fn(mirada, fps, frame0)
    return seq, T, can, coloc


def _desplazar(tiempos, t):
    out = {}
    for k in ('fonemas', 'palabras'):
        if tiempos.get(k):
            out[k] = [dict(x, inicio=x['inicio'] + t, fin=x['fin'] + t) for x in tiempos[k]]
    return out


PRUEBAS = [
    {'nombre': 'Prueba_A', 'fonemas': [('_', 0.5), ('a', 0.6), ('_', 0.6)]},
    {'nombre': 'Prueba_B', 'fonemas': [('_', 0.5), ('o', 0.45), ('u', 0.45), ('_', 0.6)]},
    {'nombre': 'Prueba_C', 'fonemas': [('_', 0.5), ('i', 0.4), ('a', 0.4), ('o', 0.4), ('_', 0.6)]},
    {'nombre': 'Prueba_D', 'fonemas': [('m', 0.25), ('a', 0.3), ('m', 0.2), ('a', 0.4), ('_', 0.5)]},
    {'nombre': 'Prueba_E', 'fonemas': [('_', 0.3), ('m', 0.1), ('a', 0.14), ('m', 0.09), ('a', 0.2), ('_', 0.15), ('o', 0.14),
                                       ('s', 0.1), ('o', 0.12), ('b', 0.06), ('l', 0.05), ('a', 0.13), ('n', 0.05), ('k', 0.06),
                                       ('o', 0.16), ('_', 0.15), ('u', 0.12), ('f', 0.1), ('a', 0.18), ('_', 0.5)]},
]


# ---------------------------------------------------------------- actuación (capa sobre los visemas)
# v2 (2026-10-19): más expresiva (referencias del usuario: vídeo de Gemini, Storm/Elle): sonrisa de fondo con
# mejillas y ojos (Duchenne), cejas en casi todas las tónicas y miradas más amplias
ACTUACION = {'base': {'mouthSmile': 0.48, 'cheekSquint': 0.38, 'eyeSquint': 0.28, 'mouthDimple': 0.12, 'browInnerUp': 0.08},
             'cejas': 0.6, 'cejas_cada': 1, 'mirada': 10.0, 'semilla': 3}


def _campana(T, t0, t1, sube=0.12, baja=0.25):
    a = np.clip((T - (t0 - sube)) / sube, 0, 1); b = np.clip(((t1 + baja) - T) / baja, 0, 1)
    x = np.minimum(a, b)
    return x * x * (3 - 2 * x)


def actuar(T, can, seq, coloc, disponibles, act=None):
    """Expresividad natural mientras habla (como el vídeo de referencia): una expresión de fondo (sonrisa leve
    con mejillas y ojos), cejas que suben en sílabas acentuadas (a veces solo una), y miradas a un lado entre
    frases. Devuelve (canales nuevos, curva de mirada [(t, h, v)])."""
    act = dict(ACTUACION, **(act or {}))
    rng = np.random.default_rng(act['semilla'])
    def ex(nombre):
        out = []
        for s in ('_L', '_R'):
            if nombre + s in disponibles:
                out.append(nombre + s)
        if nombre in disponibles:
            out.append(nombre)
        return out
    habla = np.zeros(len(T))
    bloques = []
    for nombre, t0, audio in coloc:
        if not audio:
            continue
        ss = [s for s in seq if s['t0'] >= t0 - 1e-6 and s.get('palabra')]
        if not ss:
            continue
        a, b = ss[0]['t0'], max(s['t1'] for s in ss if s['t0'] < t0 + 60)
        bloques.append((a, b))
        habla = np.maximum(habla, _campana(T, a, b, 0.35, 0.5))
    # 1. expresión de fondo; el redondeo (O/U) recoge un poco la sonrisa
    red = np.maximum(can.get('mouthPucker', 0 * T), can.get('mouthFunnel', 0 * T))
    for canal, w in act['base'].items():
        for c in ex(canal):
            v = w * habla
            if canal in ('mouthSmile', 'mouthDimple'):
                # 0.7.2 (Lamine): con 0.65 la sonrisa de fondo tapaba el redondeo de O/U («bue» salía ancho)
                v = v * np.clip(1 - 1.5 * red, 0.1, 1)
            can[c] = np.clip(can.get(c, 0 * T) + v, 0, 1)
    # 2. cejas en sílabas tónicas (una de cada `cejas_cada` palabras), alternando ambas / una sola
    k = 0
    for s in seq:
        if not (s.get('tonica') and s.get('palabra')):
            continue
        k += 1
        if k % act['cejas_cada']:
            continue
        amp = act['cejas'] * rng.uniform(0.6, 1.0)
        bump = amp * _campana(T, s['t0'], s['t1'], 0.1, 0.35)
        modo = rng.choice(['ambas', 'ambas', 'L', 'R'])
        for c in ex('browInnerUp') + ex('browOuterUp'):
            if modo == 'ambas' or c.endswith('_' + modo):
                f = 1.0 if 'Inner' in c else 0.7
                can[c] = np.clip(can.get(c, 0 * T) + f * bump, 0, 1)
    # 3. mirada: pequeños cambios al empezar cada frase y vuelta al frente
    mir = []
    for a, b in bloques:
        h = rng.uniform(-1, 1) * act['mirada']; v = rng.uniform(-0.4, 0.4) * act['mirada']
        mir += [(a - 0.3, 0.0, 0.0), (a - 0.1, h, v), (a + 0.6 * (b - a), h * 0.4, v * 0.3), (b + 0.4, 0.0, 0.0)]
    return can, mir
