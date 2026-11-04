"""Máscaras independientes sobre arcos palpebrales y su superficie conectada."""
import heapq
import numpy as np


def _arco(P, adj, ids):
    ids = set(map(int, ids))
    if any(i < 0 or i >= len(P) for i in ids):
        raise RuntimeError('Índice de borde palpebral inválido')
    vecinos = {i: [j for j, _ in adj[i] if j in ids] for i in ids}
    extremos = [i for i, v in vecinos.items() if len(v) == 1]
    if len(ids) < 3 or len(extremos) != 2 or any(len(v) not in (1, 2) for v in vecinos.values()):
        raise RuntimeError('El borde palpebral debe ser una cadena conectada y sin bifurcaciones')
    inicio = min(extremos, key=lambda i: P[i, 0])
    camino, anterior, actual = [], -1, inicio
    while True:
        camino.append(actual)
        siguientes = [j for j in vecinos[actual] if j != anterior]
        if not siguientes:
            break
        anterior, actual = actual, siguientes[0]
        if len(camino) > len(ids):
            raise RuntimeError('Borde palpebral cíclico')
    if len(camino) != len(ids):
        raise RuntimeError('Borde palpebral desconectado')
    arco = np.asarray(camino, dtype=int)
    largo = np.r_[0., np.cumsum(np.linalg.norm(np.diff(P[arco], axis=0), axis=1))]
    if largo[-1] <= 1e-8 or np.any(np.diff(largo) <= 1e-12):
        raise RuntimeError('Borde palpebral degenerado')
    return arco, largo


def calcular(P, edges, delta, bordes, anclas=None, triangulos=None, extensiones=None, extensiones_transversales=None):
    """Devuelve máscaras por punto. No difunde fuera del cierre ni entre islas."""
    P = np.asarray(P, float); edges = np.asarray(edges, int); delta = np.asarray(delta, float)
    n = len(P)
    if P.shape != (n, 3) or delta.shape != P.shape or edges.ndim != 2 or edges.shape[1] != 2 or not np.isfinite(P).all() or not np.isfinite(delta).all() or np.any(edges < 0) or np.any(edges >= n):
        raise RuntimeError('Geometría palpebral inválida')
    adj = [[] for _ in range(n)]
    for a, b in edges:
        d = float(np.linalg.norm(P[a] - P[b]))
        if d > 1e-12:
            adj[a].append((int(b), d)); adj[b].append((int(a), d))
    arcs = {lab: _arco(P, adj, bordes[lab]) for lab in ('sup', 'inf')}
    ancho = max(np.ptp(P[arcs[k][0], 0]) for k in arcs)
    if ancho <= 1e-8:
        raise RuntimeError('Anchura ocular inválida')
    def medio(arco, largo):
        t = largo[-1] * .5
        return np.array([np.interp(t, largo, P[arco, e]) for e in range(3)])
    apertura = float(np.linalg.norm(medio(*arcs['sup']) - medio(*arcs['inf'])))
    limites = (min(.32 * ancho, max(.12 * ancho, .52 * apertura)),
               min(.22 * ancho, max(.08 * ancho, .36 * apertura)))
    limite_comun = 2. * max(limites) + .16 * ancho
    amplitud = np.linalg.norm(delta, axis=1)
    if amplitud.max() < 1e-7:
        raise RuntimeError('El cierre ocular no tiene desplazamiento')
    dominio = amplitud > max(1e-8, amplitud.max() * 1e-5)
    tris = None
    if triangulos is not None:
        tris = np.asarray(triangulos, dtype=int)
        if tris.ndim != 2 or tris.shape[1] != 3 or np.any(tris < 0) or np.any(tris >= n):
            raise RuntimeError('Triángulos palpebrales inválidos')
    dist = np.full((2, n), np.inf); origen = np.full((2, n), -1, int)
    semillas = np.zeros((2, n), bool)
    for li, lab in enumerate(('sup', 'inf')):
        arc, largo = arcs[lab]
        cola = []
        for i, v in enumerate(arc):
            if dominio[v]:
                dist[li, v] = 0.; origen[li, v] = i; semillas[li, v] = True; heapq.heappush(cola, (0., int(v)))
        if len(cola) < 3:
            raise RuntimeError('El borde no pertenece al dominio del cierre')
        if tris is not None and len(tris):
            # Componente del cierre conectada al borde: no sembrar islas ajenas.
            conectada = np.zeros(n, bool); pila = [int(v) for v in arc if dominio[v]]
            conectada[pila] = True
            while pila:
                v = pila.pop()
                for w, _ in adj[v]:
                    if dominio[w] and not conectada[w]:
                        conectada[w] = True; pila.append(w)
            tt = tris[np.all(conectada[tris], axis=1)]
            if len(tt):
                xyz = P[tt]; a = xyz[:, 0, :][:, (0, 2)]; b = xyz[:, 1, :][:, (0, 2)]; c = xyz[:, 2, :][:, (0, 2)]
                ab = b - a; ac = c - a
                det = ab[:, 0] * ac[:, 1] - ab[:, 1] * ac[:, 0]
                valido = np.abs(det) > ancho * ancho * 1e-12
                for i, v in enumerate(arc):
                    if not dominio[v]:
                        continue
                    q = P[v, (0, 2)] - a
                    den = np.where(valido, det, 1.)
                    u = (q[:, 0] * ac[:, 1] - q[:, 1] * ac[:, 0]) / den
                    t = (ab[:, 0] * q[:, 1] - ab[:, 1] * q[:, 0]) / den
                    y = xyz[:, 0, 1] + u * (xyz[:, 1, 1] - xyz[:, 0, 1]) + t * (xyz[:, 2, 1] - xyz[:, 0, 1])
                    posibles = valido & (u >= -1e-8) & (t >= -1e-8) & (u + t <= 1. + 1e-8)
                    posibles &= (y < P[v, 1] - ancho * 1e-5) & (y >= P[v, 1] - .75 * ancho)
                    # Evita que triángulos grandes y lejanos trasladen la semilla.
                    posibles &= np.max(np.linalg.norm(xyz - P[v], axis=2), axis=1) <= .75 * ancho
                    ids = np.flatnonzero(posibles)
                    if not len(ids):
                        continue
                    hit = ids[np.argmin(y[ids])]; punto = P[v].copy(); punto[1] = y[hit]
                    for w in tt[hit]:
                        distancia = float(np.linalg.norm(P[w] - punto))
                        if distancia < dist[li, w]:
                            dist[li, w] = distancia; origen[li, w] = i
                            semillas[li, w] = True
                            heapq.heappush(cola, (distancia, int(w)))
        while cola:
            d, v = heapq.heappop(cola)
            if d != dist[li, v]:
                continue
            for w, paso in adj[v]:
                nd = d + paso
                if dominio[w] and nd < limite_comun and nd < dist[li, w]:
                    dist[li, w] = nd; origen[li, w] = origen[li, v]; semillas[li, w] = False
                    heapq.heappush(cola, (nd, w))
    masks, elegidas = {}, {}
    for li, lab in enumerate(('sup', 'inf')):
        arc, largo = arcs[lab]; limite = limites[li]
        elegidas[lab] = []
        npts = max([3] + [i for (l, i) in (anclas or {}) if l == lab])
        for i in range(1, npts + 1):
            u = (.18, .5, .82)[i - 1] if npts == 3 else .18 + .64 * (i - 1) / (npts - 1)
            anterior = (anclas or {}).get((lab, i))
            candidatos = [int(v) for v in arc[1:-1] if dominio[v] and int(v) not in elegidas[lab]]
            if len(candidatos) < npts - len(elegidas[lab]):
                raise RuntimeError('Faltan anclas palpebrales válidas')
            # Un ancla elegida a mano puede estar fuera del borde: vale si el cierre la mueve y está dentro del alcance.
            libre = (anterior is not None and 0 <= int(anterior) < n and dominio[int(anterior)] and np.isfinite(dist[li, int(anterior)])
                     and int(anterior) not in (int(arc[0]), int(arc[-1])) and int(anterior) not in elegidas[lab])
            a = int(anterior) if libre else min(candidatos, key=lambda v: abs(largo[np.where(arc == v)[0][0]] / largo[-1] - u))
            elegidas[lab].append(a)
        idx = np.maximum(origen[li], 0)
        coord_inicial = largo[idx] / largo[-1]
        fija = semillas[li]
        def suave(t):
            t = np.clip(t, 0., 1.)
            return t * t * (3. - 2. * t)
        nodos = [0.] + [float(coord_inicial[a]) for a in elegidas[lab]] + [1.]
        if any(b - a <= 1e-9 for a, b in zip(nodos, nodos[1:])):
            raise RuntimeError('Las anclas palpebrales deben estar ordenadas y separadas')
        otra = dist[1 - li]; propia = dist[li]
        lado = np.ones(n); ambos = np.isfinite(propia) & np.isfinite(otra)
        lado[ambos] = suave(.5 + (otra[ambos] - propia[ambos]) / (.16 * ancho))
        for i, a in enumerate(elegidas[lab], 1):
            anterior, pos, siguiente = nodos[i-1:i+2]
            extension = float((extensiones or {}).get((lab, i), 1.))
            if not np.isfinite(extension) or not .25 <= extension <= 2.:
                raise RuntimeError('Extensión longitudinal fuera de rango (0.25 a 2)')
            ext_t = float((extensiones_transversales or {}).get((lab, i), 1.))
            if not np.isfinite(ext_t) or not .25 <= ext_t <= 2.:
                raise RuntimeError('Extensión transversal fuera de rango (0.25 a 2)')
            fuera = float(dist[li, a])    # distancia del ancla al borde (0 si está en él): hasta ahí el peso es pleno
            limite_punto = fuera + limite * ext_t
            soporte = dominio & (dist[li] < limite_punto)
            aristas = edges[soporte[edges[:, 0]] & soporte[edges[:, 1]]]
            coord = coord_inicial.copy()
            fija_punto = fija.copy(); fija_punto[a] = True    # el ancla conserva su coordenada aunque no esté en el borde
            for _ in range(24):
                suma = np.zeros(n); cuenta = np.zeros(n)
                np.add.at(suma, aristas[:, 0], coord[aristas[:, 1]])
                np.add.at(suma, aristas[:, 1], coord[aristas[:, 0]])
                np.add.at(cuenta, aristas[:, 0], 1); np.add.at(cuenta, aristas[:, 1], 1)
                movibles = soporte & ~fija_punto & (cuenta > 0)
                coord[movibles] = .5 * coord[movibles] + .5 * suma[movibles] / cuenta[movibles]
            transversal = 1. - suave(np.clip(np.maximum(dist[li] - fuera, 0.) / (limite * ext_t), 0., 1.))
            longitudinal = np.where(coord <= pos, suave(1. - (pos-coord)/((pos-anterior)*extension)),
                                    suave(1. - (coord-pos)/((siguiente-pos)*extension)))
            # Las comisuras permanecen inmóviles incluso al ampliar el soporte.
            longitudinal[arc[0]] = 0.; longitudinal[arc[-1]] = 0.
            peso = longitudinal * transversal * lado
            peso[~soporte] = 0.
            if peso[a] < 1. - 1e-8:
                # cerca de una esquina o del otro párpado el peso del ancla queda por debajo de 1: se reescala para que valga 1
                if peso[a] < .05:
                    raise RuntimeError('Ancla palpebral ambigua: demasiado cerca del otro párpado o de la esquina del ojo')
                peso = np.clip(peso / peso[a], 0., 1.)
            masks[(lab, i)] = peso
    return masks, elegidas, ancho
