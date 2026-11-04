# Borde real del párpado como lazo de aristas de la malla (0.8.45, Pegazo). Con la cuenca hundida el borde «sobre la esfera del
# globo» salía como puntos sueltos por toda la piel del ojo: el parpadeo y las formas giraban con un borde falso. La abertura vista
# de frente da semillas (nucleo/ojos.abertura_visible) y el lazo cerrado que pasa por ellas es el borde.
import json
import bpy
import numpy as np

MAX_LAZO = 48       # vértices: una abertura de ojo sin densificar; más, y el lazo sigue otra cosa (pelo, ceja, cuenca)


def _vecinos(me):
    n = len(me.vertices)
    ve = [set() for _ in range(n)]
    cv = [set() for _ in range(n)]
    for f in me.polygons:
        vs = list(f.vertices)
        for i, a in enumerate(vs):
            b = vs[(i + 1) % len(vs)]
            ve[a].add(b); ve[b].add(a)
            cv[a].add(f.index)
    return ve, cv


def _siguiente(prev, cur, ve, cv, P):
    """vértice que sigue la línea prev → cur: el vecino que no comparte cara con prev; si hay varios o ninguno, el más recto."""
    d0 = P[cur] - P[prev]; d0 = d0 / (np.linalg.norm(d0) + 1e-12)
    cand = [v for v in ve[cur] if v != prev]
    uso = [v for v in cand if not (cv[v] & cv[prev])] or cand
    if not uso:
        return None
    rec = [float((P[v] - P[cur]) @ d0 / (np.linalg.norm(P[v] - P[cur]) + 1e-12)) for v in uso]
    i = int(np.argmax(rec))
    return uso[i] if rec[i] > 0.0 else None


def _lazo(a, b, ve, cv, P, tope=120):
    c = [a, b]
    while len(c) < tope:
        n = _siguiente(c[-2], c[-1], ve, cv, P)
        if n is None:
            return None
        if n == a:
            return c
        if n in c:
            return None
        c.append(n)
    return None


def _rodea(P, lazo, centro, K, r, hueco=np.radians(100)):
    """el lazo da la vuelta al ojo y tiene el tamaño de una abertura."""
    q = P[lazo] - centro
    rxz = np.hypot(q @ K.X, q @ K.Z)
    if not (0.3 * r < np.median(rxz) < 1.4 * r):
        return False
    psi = np.sort(np.arctan2(q @ K.Z, q @ K.X))
    return float(np.diff(np.r_[psi, psi[0] + 2 * np.pi]).max()) < hueco


def _buscar(sem, ve, cv, P, centro, K, r, min_lazo=10):
    """de los lazos cerrados por las aristas de las semillas que rodean el ojo, el que pasa por más semillas."""
    S = {int(s) for s in sem}
    mejor, puntos, vistos = None, 0, set()
    for a in S:
        for b in ve[a]:
            if (a, b) in vistos:
                continue
            l = _lazo(a, b, ve, cv, P)
            if l is None or len(l) < min_lazo:
                continue
            for x, y in zip(l, l[1:] + l[:1]):
                vistos.add((x, y)); vistos.add((y, x))
            n = len(S & set(l))
            if n > puntos and _rodea(P, l, centro, K, r):
                mejor, puntos = l, n
    return mejor, puntos


def _pareja(K, a, b):
    """los dos lazos parecen el mismo borde en espejo. En Ichigo, Kakashi y Lamine la malla no tiene un lazo limpio: un lado no
    daba lazo o daba uno de 60–110 vértices que no era el borde; esas caras siguen con el borde medido en la esfera."""
    if len(a) > MAX_LAZO or len(b) > MAX_LAZO or abs(len(a) - len(b)) > 4:
        return False
    ancho = [float(np.ptp(K.P[l] @ K.X)) for l in (a, b)]
    return min(ancho) > 0.8 * max(ancho)


def medir(K, lado, centro, r):
    """vértices del lazo del borde (índices de la malla, en orden), o None. Mide los dos ojos juntos y solo los acepta en pareja:
    se guarda en cara['facs_anillo_L/R'], o cara['facs_anillo_no'] si no hay lazos fiables."""
    cara = K.obj
    if cara.get('facs_anillo_no'):
        return None
    if cara.get(f'facs_anillo_{lado}'):
        return json.loads(cara[f'facs_anillo_{lado}'])
    from .. import ojos as OJV, marco as MK, posicion
    Mi = cara.matrix_world.inverted()
    centros = {}
    for s in ('L', 'R'):
        piv = bpy.data.objects.get(f'{cara.name}_OjoPivote_{s}')
        if piv is not None:
            centros[s] = np.array((Mi @ piv.matrix_world.translation)[:])
        elif s in K.ojos:
            centros[s] = K.ojos[s][0]
    if len(centros) != 2:
        return None
    try:
        with posicion.en_origen(cara):
            bpy.context.view_layer.update()
            M = MK.Marco(cara)
            sem = {s: OJV.abertura_visible(cara, M, s) for s in centros}
    except Exception as e:
        print('anillo del párpado:', e)
        return None
    ve, cv = _vecinos(cara.data)
    lazos = {}
    for s, (a, b) in sem.items():
        semillas = np.r_[a, b].astype(int)
        lz, n = _buscar(semillas, ve, cv, K.P, centros[s], K, r) if len(semillas) >= 8 else (None, 0)
        if lz is None or n < 4 or (K.gi[np.array(lz, int)] < 0).any():
            lz = None
        lazos[s] = lz
    if lazos['L'] is None or lazos['R'] is None or not _pareja(K, lazos['L'], lazos['R']):
        cara['facs_anillo_no'] = 1
        return None
    for s, lz in lazos.items():
        cara[f'facs_anillo_{s}'] = json.dumps([int(v) for v in lz])
    return lazos[lado]
