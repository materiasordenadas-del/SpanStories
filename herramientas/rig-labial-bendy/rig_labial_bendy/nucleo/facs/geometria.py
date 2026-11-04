# Arreglos de geometría en el Basis antes de las formas:
#  - descuantizar: Tripo guarda los vértices en una rejilla de 1/2048 m (0,49 mm): los labios salen en
#    escalera. Se alisa la superficie sin salir de la celda de cada vértice (±media celda): la cara sigue
#    siendo la misma (error < 0,25 mm) pero sin facetas.
#  - sellar_labios: Tripo deja la boca entreabierta para generar dientes; el neutro del personaje tiene los
#    labios juntos. Se cierran con una deformación armónica desde los bordes de contacto.
# El Basis original se guarda en el atributo `facs_basis_original` (no se exporta) y se puede restaurar.
# Al cambiar el Basis se suma el mismo desplazamiento a todas las shape keys (conservan su delta).
import numpy as np
from .grafo import ss

ATTR = 'facs_basis_original'


def _keys(me):
    return list(me.shape_keys.key_blocks) if me.shape_keys else []


def guardar_original(cara):
    me = cara.data
    if ATTR in me.attributes:
        return False
    n = len(me.vertices); co = np.zeros(n * 3)
    ks = _keys(me)
    (ks[0].data if ks else me.vertices).foreach_get('co', co)
    a = me.attributes.new(ATTR, 'FLOAT_VECTOR', 'POINT')
    a.data.foreach_set('vector', co)
    return True


def basis(cara):
    me = cara.data
    n = len(me.vertices); co = np.zeros(n * 3)
    ks = _keys(me)
    (ks[0].data if ks else me.vertices).foreach_get('co', co)
    return co.reshape(-1, 3)


def poner_basis(cara, nuevo, ignorar=()):
    """escribe el Basis y arrastra el mismo desplazamiento a las demás keys (las de `ignorar` no)."""
    me = cara.data
    viejo = basis(cara)
    d = (np.asarray(nuevo) - viejo).ravel()
    ks = _keys(me)
    for k in ks[1:]:
        if k.name in ignorar:
            continue
        c = np.zeros(len(d)); k.data.foreach_get('co', c)
        k.data.foreach_set('co', c + d)
    if ks:
        ks[0].data.foreach_set('co', np.asarray(nuevo).ravel())
    me.vertices.foreach_set('co', np.asarray(nuevo).ravel())
    me.update()


def restaurar_original(cara):
    me = cara.data
    if ATTR not in me.attributes:
        return False
    co = np.zeros(len(me.vertices) * 3); me.attributes[ATTR].data.foreach_get('vector', co)
    poner_basis(cara, co.reshape(-1, 3))
    return True


def paso_rejilla(P, mascara=None):
    """detecta la rejilla de cuantización (Tripo: 1/2048). Devuelve el paso o None. `mascara`: solo esos puntos
    cuentan (los vértices nuevos de la densificación no están en la rejilla)."""
    if mascara is not None and np.any(mascara):
        P = P[mascara]
    for q in (1 / 2048, 1 / 1024, 1 / 4096):
        f = np.mod(P / q, 1.0)
        # cada eje concentrado en un único valor de fase
        ok = all(np.mean(np.abs(((f[:, k] - np.median(f[:, k])) + 0.5) % 1.0 - 0.5) < 0.02) > 0.9 for k in range(3))
        if ok:
            return q
    return None


def descuantizar(K, iters=120, lam=0.6, margen=0.5):
    """devuelve nuevas posiciones de la zona: alisadas dentro de la celda (±margen·paso por eje)."""
    # 0.6.9: solo los vértices de Tripo (índice < v_antes de la densificación) cuentan para detectar la rejilla
    dens = K.obj.get('facs_densificado')
    mk = (K.zona < int(dens['v_antes'])) if dens and 'v_antes' in dens else None
    q = paso_rejilla(K.p, mk)
    if q is None:
        return None, None
    g = K.g
    x0 = K.p.copy(); x = x0.copy()
    h = margen * q
    # borde de la zona fijo (no hay costura con lo de fuera)
    deg = np.zeros(g.n); np.add.at(deg, g.E[:, 0], 1); np.add.at(deg, g.E[:, 1], 1)
    lejos = np.linalg.norm(K.p - K.C, axis=1) > 0.93 * np.linalg.norm(K.p - K.C, axis=1).max()
    E, w = g.E, g.w
    diag = np.zeros(g.n); np.add.at(diag, E[:, 0], w); np.add.at(diag, E[:, 1], w); diag[diag == 0] = 1
    for _ in range(iters):
        acc = np.zeros_like(x)
        np.add.at(acc, E[:, 0], w[:, None] * x[E[:, 1]])
        np.add.at(acc, E[:, 1], w[:, None] * x[E[:, 0]])
        x = x + lam * (acc / diag[:, None] - x)
        x = np.clip(x, x0 - h, x0 + h)
        x[lejos] = x0[lejos]
    return x, q


def _camino(adj, a, b, largo):
    """camino más corto de a a b por el grafo adj {vértice: vecinos}; None si no lo hay."""
    import heapq
    dist, prev, pq = {a: 0.0}, {}, [(0.0, a)]
    while pq:
        d, x = heapq.heappop(pq)
        if x == b:
            break
        if d > dist.get(x, np.inf):
            continue
        for y in adj.get(x, ()):
            nd = d + largo(x, y)
            if nd < dist.get(y, np.inf):
                dist[y] = nd; prev[y] = x; heapq.heappush(pq, (nd, y))
    if b not in dist:
        return None
    c = [b]
    while c[-1] != a:
        c.append(prev[c[-1]])
    return c[::-1]


def bordes_silueta(K, banda=0.9, min_abierta=0.05):
    """0.8.45 (Pegazo): los dos bordes de la abertura de la boca tal como se ven de frente, medidos en la topología: aristas con
    una cara que mira a cámara y otra que no. Devuelve (sup, inf), índices de la zona ordenados de la comisura R a la L, o None
    si la boca no tiene abertura limpia (ya cerrada, o silueta sin dos caminos entre comisuras)."""
    me = K.obj.data
    p, hw = K.p, K.hw
    caras = {}
    for f in me.polygons:
        vs = K.gi[list(f.vertices)]
        if (vs < 0).any():
            continue
        q = p[vs]
        fr = bool(np.cross(q, np.roll(q, -1, axis=0)).sum(0) @ K.Y < 0)
        for a, b in zip(vs.tolist(), np.roll(vs, -1).tolist()):
            caras.setdefault((min(a, b), max(a, b)), []).append(fr)
    v_ls = float((K.ls - K.C) @ K.Z) / hw; v_li = float((K.li - K.C) @ K.Z) / hw
    vc = 0.5 * (v_ls + v_li)
    adj = {}
    for (a, b), fr in caras.items():
        if len(fr) != 2 or fr[0] == fr[1]:
            continue
        m = (a, b)
        if (np.abs(K.u[list(m)]) < 1.3).all() and (np.abs(K.v[list(m)] - vc) < banda).all() and (K.w[list(m)] < 1.0).all():
            adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    # componente mayor, sin las ramas sueltas
    vis, mayor = set(), []
    for v in adj:
        if v in vis:
            continue
        st, cc = [v], []
        while st:
            x = st.pop()
            if x not in vis:
                vis.add(x); cc.append(x); st.extend(adj[x])
        if len(cc) > len(mayor):
            mayor = cc
    adj = {v: set(adj[v]) for v in mayor}
    hojas = [v for v, s in adj.items() if len(s) < 2]
    while hojas:
        v = hojas.pop()
        for w in adj.pop(v, ()):
            adj[w].discard(v)
            if len(adj[w]) < 2:
                hojas.append(w)
    if len(adj) < 8:
        return None
    vs = np.array(list(adj))
    a, b = int(vs[np.argmin(K.u[vs])]), int(vs[np.argmax(K.u[vs])])
    if K.u[a] > -0.75 or K.u[b] < 0.75:
        return None
    largo = lambda x, y: float(np.linalg.norm(p[x] - p[y]))
    c1 = _camino(adj, a, b, largo)
    if c1 is None or len(c1) < 3:
        return None
    resto = {v: {w for w in s if w not in c1[1:-1]} for v, s in adj.items() if v not in c1[1:-1]}
    c2 = _camino(resto, a, b, largo)
    if c2 is None or len(c2) < 3:
        return None
    sup, inf = (c1, c2) if K.v[c1].mean() > K.v[c2].mean() else (c2, c1)
    if K.v[sup].mean() - K.v[inf].mean() < min_abierta:
        return None
    return np.array(sup, int), np.array(inf, int)


def sellar_labios(K, solape=0.012, alcance=0.5, cadenas=None):
    """posiciones de la zona con los labios juntos. solape y alcance en unidades de hw. cadenas (bordes_silueta): los dos
    bordes reales; cada vértice va a la curva media y las comisuras no se mueven."""
    hw = K.hw
    p = K.p
    if cadenas is not None:
        bs, bi = cadenas
        solape = max(solape, 0.018)     # polilíneas con columnas distintas: con 0,012 hw quedaban rendijas (Vale 2); con 0,03 asomaba el forro (Pegazo)
        polos = {int(bs[0]), int(bs[-1])}
        def _curva(c):
            o = np.argsort(K.u[c], kind='stable'); return K.u[c][o], p[c][o]
        us, ps = _curva(bs); ui, pi = _curva(bi)
        D = {}
        for c, uu, pp, sg in ((bs, ui, pi, -1), (bi, us, ps, 1)):
            for i in c:
                i = int(i)
                if i in polos:
                    D[i] = np.zeros(3); continue
                q = np.array([np.interp(K.u[i], uu, pp[:, k]) for k in range(3)])
                D[i] = 0.5 * (q - p[i]) + sg * K.Z * solape * hw * _amort(K.u[i])
        d = K.g.dijkstra(np.r_[bs, bi], R=8 * hw)
        reg = d < 3 * hw
        fij = np.array(list(D.keys()), int)
        lejos = np.nonzero((d > alcance * hw) & reg)[0]
        f = np.r_[fij, lejos]
        v = np.r_[np.array([D[i] for i in fij]), np.zeros((len(lejos), 3))]
        Dz = K.g.armonico(f, v, region=reg)
        Dz[~reg] = 0
        return p + Dz, Dz
    bs, bi = K.borde_sup, K.borde_inf
    # pareja de cada borde: punto del otro borde a la misma u (interpolado)
    def _curva(idx):
        o = np.argsort(K.u[idx]); return K.u[idx][o], p[idx][o]
    us, ps = _curva(bs); ui, pi = _curva(bi)
    def _interp(uq, uu, pp):
        uq = np.atleast_1d(uq)
        return np.stack([np.interp(uq, uu, pp[:, k]) for k in range(3)], axis=1)
    D = {}
    for i in bs:
        q = _interp(K.u[i], ui, pi)[0]
        D[i] = 0.5 * (q - p[i]) - K.Z * solape * hw * _amort(K.u[i])
    for i in bi:
        q = _interp(K.u[i], us, ps)[0]
        D[i] = 0.5 * (q - p[i]) + K.Z * solape * hw * _amort(K.u[i])
    fij = list(D.keys())
    val = np.array([D[i] for i in fij])
    # lejos de la boca: quieto
    lejos = np.nonzero((K.d_boca > alcance * hw) & (K.d_boca < 3 * hw))[0]
    reg = K.d_boca < 3 * hw
    f = np.r_[np.array(fij, int), lejos]
    v = np.r_[val, np.zeros((len(lejos), 3))].reshape(-1, 3)
    Dz = K.g.armonico(f, v, region=reg)
    Dz[~reg] = 0
    return p + Dz, Dz


def crear_cavidad(cara, K, anillos=((0.30, 0.92), (0.65, 0.72), (0.90, 0.40)), material='Boca_Interior'):
    """cose una cavidad oscura al agujero del forro de los labios (extruyendo su borde hacia la garganta).
    anillos: (fondo × hw, encogimiento hacia el centro del agujero). Los vértices nuevos van al final
    (los índices de siempre no cambian) y se marcan con el atributo `facs_cavidad`."""
    import bmesh
    me = cara.data
    if 'facs_cavidad' in me.attributes:
        return {'ya': True}
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    zona = set(K.zona.tolist())
    C = K.C
    # agujero: componente más grande de aristas de borde cerca de la boca y por detrás de los labios
    bd = [e for e in bm.edges if e.is_boundary and all(v.index in zona for v in e.verts)
          and np.linalg.norm((np.array(e.verts[0].co) + np.array(e.verts[1].co)) / 2 - C) < 2.5 * K.hw]
    comp, vis = [], set()
    vec = {}
    for e in bd:
        for v in e.verts:
            vec.setdefault(v.index, []).append(e)
    for e in bd:
        if e.index in vis:
            continue
        st, cc = [e], []
        while st:
            x = st.pop()
            if x.index in vis:
                continue
            vis.add(x.index); cc.append(x)
            for v in x.verts:
                st.extend(vec[v.index])
        comp.append(cc)
    hole = max(comp, key=len)
    hv = list({v for e in hole for v in e.verts})
    cen = np.mean([np.array(v.co) for v in hv], axis=0)
    shape_layers = list(bm.verts.layers.shape.values())
    nuevos_total = []
    edges = hole
    prev = {v: v for v in hv}
    for (fondo, enc) in anillos:
        r = bmesh.ops.extrude_edge_only(bm, edges=edges)
        nv = [x for x in r['geom'] if isinstance(x, bmesh.types.BMVert)]
        ne = [x for x in r['geom'] if isinstance(x, bmesh.types.BMEdge)]
        # origen de cada vértice nuevo: el vértice del anillo anterior unido por una arista lateral
        for v in nv:
            src = None
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in nv:
                    src = o; break
            base = np.array(src.co) if src is not None else np.array(v.co)
            # posición: hacia el centro del agujero y hacia atrás
            p0 = None
            # el anillo se calcula desde el borde original (no acumulado)
            orig = src
            while orig is not None and orig not in hv and orig in prev:
                orig = prev[orig]
            pb = np.array(orig.co) if orig is not None else base
            p = cen + (pb - cen) * enc + K.Y * fondo * K.hw
            v.co = p
            prev[v] = src
            for sl in shape_layers:
                v[sl] = v.co.copy()
            nuevos_total.append(v)
        edges = [e for e in ne if e.is_boundary]
    # tapa: abanico al centro
    ultimo = list({v for e in edges for v in e.verts})
    c = bm.verts.new(cen + K.Y * (anillos[-1][0] + 0.2) * K.hw)
    for sl in shape_layers:
        c[sl] = c.co.copy()
    nuevos_total.append(c)
    for e in edges:
        a, b = e.verts
        f0 = e.link_faces[0]
        # orden consistente con la cara vecina
        lp = [l for l in f0.loops if l.edge == e][0]
        if lp.vert == a:
            vs = (b, a, c)
        else:
            vs = (a, b, c)
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    mi = next((i for i, m in enumerate(me.materials) if m and material in m.name), 0)
    nset = set(nuevos_total)
    for f in bm.faces:
        if any(v in nset for v in f.verts):
            f.material_index = mi
            f.smooth = True
    n_old = len(me.vertices)
    bm.to_mesh(me); bm.free()
    a = me.attributes.new('facs_cavidad', 'BOOLEAN', 'POINT')
    flags = np.zeros(len(me.vertices), bool); flags[n_old:] = True
    a.data.foreach_set('value', flags)
    me.update()
    return {'agujero': len(hv), 'nuevos': int(len(me.vertices) - n_old)}


def _amort(u):
    """el solape se apaga hacia las comisuras (allí los labios ya se tocan)."""
    return float(1 - ss(0.75, 1.0, abs(u)))


def leer_atr(me, nombre, arr):
    """lee el atributo `nombre` en arr si existe (personajes sin regiones UV de Codex: se queda en ceros)."""
    a = me.attributes.get(nombre)
    if a is not None:
        a.data.foreach_get('value', arr)
    return arr
