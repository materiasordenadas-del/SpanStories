# Preparación de la topología de los párpados ANTES del rig (0.8.46, Pegazo). Solo se ejecuta si se pide: cambia caras y aristas.
# 1) busca el lazo cerrado del borde del párpado, 2) quita lo que hay dentro (membrana de triángulos / medio globo),
# 3) deja los anillos del párpado en quads con el mismo número de vértices, 4) cierra con una cuenca HUNDIDA en quads: la zona interna
# no queda al ras de la cara, el borde se dobla hacia dentro y sigue por detrás del párpado.
# Un borde impar no se cierra solo con quads: queda 1 triángulo en el fondo, oculto. Con aplicar=False no se toca la malla.
import json
import math
from collections import Counter

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from . import util

ANILLOS = 5                   # como mucho, anillos del párpado que quedan iguales; los polos se van a la transición con la cara
CRECE = 1.25                    # un anillo con más vértices que esto respecto al lazo ya es la transición con la cara: no se toca
MIN_LAZO, MAX_LAZO = 10, 48     # vértices de una abertura sin densificar
MAX_INTERIOR = 800              # caras dentro del lazo; más, y el lazo no encierra un ojo
PARED = 0.6                     # cara interior con la normal por debajo de esto respecto al frente: pared, no superficie vista
# (ensanche respecto al lazo, profundidad en anchos medios del lazo): detrás del párpado se abre y luego se cierra
CUENCA = ((1.10, 0.29), (1.14, 0.62), (0.92, 0.95))
ABOMBADO = 0.24
VALENCIA_MAX = 7
FRENTE = Vector((0, -1, 0))     # las mallas de Tripo miran a -Y local
MIN_GLOBO = 30                  # vértices de una pieza suelta para tomarla por globo
ERROR_GLOBO = 0.12              # desvío máximo respecto a la esfera ajustada, en radios
HOPS_MARGEN = 4                 # saltos de malla que acompañan al lazo cuando se lleva al borde real
ITER_MARGEN = 60


# --- lazos cerrados ---

def _opuesta(e, v, tolerante):
    """arista que sigue a e al pasar por v; en un polo solo sigue en modo tolerante, por la más recta."""
    fs = set(e.link_faces)
    cand = [x for x in v.link_edges if x is not e and not (set(x.link_faces) & fs)]
    if len(v.link_edges) == 4:
        return cand[0] if len(cand) == 1 else None
    if not tolerante or not cand:
        return None
    d0 = (v.co - e.other_vert(v).co).normalized()
    mejor = max(cand, key=lambda x: (x.other_vert(v).co - v.co).normalized().dot(d0))
    return mejor if (mejor.other_vert(v).co - v.co).normalized().dot(d0) > 0.3 else None


def _caminar(e0, tolerante):
    vs = [e0.verts[0]]; e = e0; v = e0.verts[1]
    while len(vs) <= MAX_LAZO:
        if v is vs[0]:
            return vs
        if v in vs:
            return None
        vs.append(v)
        n = _opuesta(e, v, tolerante)
        if n is None:
            return None
        e = n; v = e.other_vert(v)
    return None


def _lados(lazo):
    """caras a cada lado del lazo, recorriéndolo: (izquierda, derecha)."""
    a, b = [], []
    for i, v in enumerate(lazo):
        w = lazo[(i + 1) % len(lazo)]
        e = next(x for x in v.link_edges if x.other_vert(v) is w)
        for l in e.link_loops:
            (a if l.vert is v else b).append(l.face)
    return a, b


def _inundar(semillas, lazo_set, tope):
    M = set(semillas); st = list(M)
    while st:
        f = st.pop()
        for e in f.edges:
            if e.verts[0] in lazo_set and e.verts[1] in lazo_set:
                continue
            for g in e.link_faces:
                if g not in M:
                    M.add(g); st.append(g)
        if len(M) > tope:
            return None
    return M


def _medir(lazo):
    """-> dict del lazo con su lado interior, o None si no encierra una zona acotada hacia atrás."""
    s = set(lazo)
    c = sum((v.co for v in lazo), Vector()) / len(lazo)
    n = Vector()
    for i, v in enumerate(lazo):
        n += (v.co - c).cross(lazo[(i + 1) % len(lazo)].co - c)
    if n.length < 1e-12:
        return None
    n.normalize()
    if abs(n.dot(FRENTE)) < 0.6:
        return None
    if n.dot(FRENTE) > 0:
        n = -n                          # n: hacia dentro de la cabeza
    a, b = _lados(lazo)
    if not a or not b:                  # hueco abierto: ya no hay nada dentro
        interior, borde = set(), []
    else:
        ia, ib = _inundar(a, s, MAX_INTERIOR), _inundar(b, s, MAX_INTERIOR)
        if ia is None and ib is None or (ia and ib and ia & ib):
            return None
        if ia is not None and ib is not None:   # acotado por los dos lados: pieza suelta (Hama: medio globo), no borde de la piel
            return None
        if ia is None or (ib is not None and len(ib) < len(ia)):
            interior, borde = ib, b
        else:
            interior, borde = ia, a
        cint = sum((f.calc_center_median() for f in interior), Vector()) / len(interior)
        if (cint - c).dot(n) < 0:       # interior por delante del lazo: mechón de pelo, no ojo
            return None
    ancho = max((v.co - w.co).length for v in lazo for w in lazo)
    if interior:
        rmax = max((v.co - c).length for f in interior for v in f.verts)
        if rmax > 1.2 * ancho:
            return None
    frente = sum(f.normal.dot(FRENTE) for f in borde) / len(borde) if borde else -1.0
    return {'vs': lazo, 'c': c, 'n': n, 'ancho': ancho, 'interior': interior, 'frente_dentro': frente}


def _lazos(bm, zmin, tolerante):
    vistos = set(); out = []
    for e in bm.edges:
        if e in vistos or e.verts[0].co.z < zmin:
            continue
        lz = _caminar(e, tolerante)
        if lz is None or len(lz) < MIN_LAZO:
            continue
        for i, v in enumerate(lz):
            w = lz[(i + 1) % len(lz)]
            vistos.add(next(x for x in v.link_edges if x.other_vert(v) is w))
        m = _medir(lz)
        if m:
            out.append(m)
    return out


def _tras_membrana(m, grupo):
    """m es un tubo interior (Hama: bolsa de 16 detrás de la membrana) si otro lazo lo encierra con un abanico de triángulos entre ambos."""
    for o in grupo:
        if o is m or m['vs'][0] not in {v for f in o['interior'] for v in f.verts}:
            continue
        if 2 * sum(len(f.verts) == 3 for f in o['interior'] - m['interior']) >= len(o['vs']):
            return True
    return False


def _borde_de(grupo):
    """del grupo de lazos concéntricos, el borde: el más interior cuya cara de dentro es pared o que ya está abierto. Una membrana
    que mira al frente queda descartada; sin pared clara, el lazo con la cara interior menos frontal."""
    orden = sorted(grupo, key=lambda m: m['ancho'])
    for m in orden:
        if m['frente_dentro'] < PARED and not _tras_membrana(m, grupo):
            return m, True
    return min(orden, key=lambda m: m['frente_dentro']), False


def _grupos(lazos):
    gr = []
    for m in sorted(lazos, key=lambda m: m['ancho']):
        for g in gr:
            if (g[0]['c'] - m['c']).length < 0.6 * g[0]['ancho']:
                g.append(m); break
        else:
            gr.append([m])
    return gr


def _pareja(gr, cx, ancho_malla):
    bordes = [_borde_de(g) for g in gr]
    mejor, puntos = None, 0.0
    for i, (a, _) in enumerate(bordes):
        for b, _ in bordes[i + 1:]:
            if abs(a['c'].z - b['c'].z) > 0.25 * a['ancho'] or abs(a['ancho'] - b['ancho']) > 0.35 * max(a['ancho'], b['ancho']):
                continue
            if (a['c'].x - cx) * (b['c'].x - cx) >= 0 or abs((a['c'].x + b['c'].x) / 2 - cx) > 0.15 * ancho_malla:
                continue
            if min(a['ancho'], b['ancho']) > puntos:
                puntos = min(a['ancho'], b['ancho'])
                mejor = (a, b) if a['c'].x > b['c'].x else (b, a)      # L en X positivo
    return mejor


def _buscar(bm, centros):
    zs = [v.co.z for v in bm.verts]; xs = [v.co.x for v in bm.verts]
    zmin = min(zs) + 0.4 * (max(zs) - min(zs)) if not centros else min(c[2] for c in centros.values()) - 0.1 * (max(zs) - min(zs))
    cx, ancho = (min(xs) + max(xs)) / 2, max(xs) - min(xs)
    for tolerante in (False, True):
        lz = _lazos(bm, zmin, tolerante)
        if centros:
            r = {}
            for s, c in centros.items():
                cerca = [m for m in lz if (m['c'] - Vector(c)).length < 0.75 * m['ancho']]
                if cerca:
                    r[s] = _borde_de(cerca)[0]
            if len(r) == 2:
                return r, tolerante
            continue
        par = _pareja(_grupos(lz), cx, ancho)
        if par:
            return {'L': par[0], 'R': par[1]}, tolerante
    return None, False


# --- anillos del párpado ---

def _islas_dentro(bm, m):
    """piezas sueltas metidas detrás del lazo (Hama: medio globo de Tripo, 97 vértices). -> caras."""
    vistos = {v for f in m['interior'] for v in f.verts} | set(m['vs']); out = set()
    for v0 in bm.verts:
        if v0 in vistos or (v0.co - m['c']).length > m['ancho']:
            continue
        isla = {v0}; st = [v0]
        while st:
            v = st.pop()
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in isla:
                    isla.add(w); st.append(w)
            if len(isla) > MAX_INTERIOR:
                break
        vistos |= isla
        if len(isla) > MAX_INTERIOR or isla & set(m['vs']):
            continue
        c = sum((v.co for v in isla), Vector()) / len(isla)
        if (c - m['c']).dot(m['n']) > 0 and all((v.co - m['c']).length <= m['ancho'] for v in isla):
            out |= {f for v in isla for f in v.link_faces}
    return out


def _anillos(lazo, N):
    used = set(lazo); F = set(); R = lazo; out = [(list(lazo), None)]
    for _ in range(N):
        strip = {f for v in R for f in v.link_faces} - F
        F |= strip
        nv = {v for f in strip for v in f.verts} - used
        used |= nv
        out.append((list(nv), strip)); R = list(nv)
    return out


def _fundir(bm, a, b):
    if len(a.link_edges) + len(b.link_edges) - 2 > VALENCIA_MAX:
        return False
    bmesh.ops.pointmerge(bm, verts=[a, b], merge_co=(a.co + b.co) / 2)
    return True


def _muesca(bm, ri, ro):
    """vértice de 3 aristas colgado del anillo interior: rehace sus tres quads como dos, sin mover nada."""
    for p in ro:
        if len(p.link_edges) != 3 or len(p.link_faces) != 3 or any(len(f.verts) != 4 for f in p.link_faces):
            continue
        vec = [e.other_vert(p) for e in p.link_edges]
        den = [v for v in vec if v in ri]; fue = [v for v in vec if v in ro]
        if len(den) != 2 or len(fue) != 1:
            continue
        g = fue[0]; a, b = den
        fx = next(f for f in p.link_faces if g not in f.verts)
        fa = next(f for f in p.link_faces if g in f.verts and a in f.verts)
        fb = next(f for f in p.link_faces if g in f.verts and b in f.verts)
        x = next(v for v in fx.verts if v not in (p, a, b))
        c = next(v for v in fa.verts if v not in (p, a, g))
        d = next(v for v in fb.verts if v not in (p, b, g))
        ref = fa.normal + fb.normal + fx.normal
        mat, suave = fa.material_index, fa.smooth
        bmesh.ops.delete(bm, geom=[p], context='VERTS')
        for orden in ((a, x, g, c), (x, b, d, g)):
            n = bm.faces.new(orden); n.material_index = mat; n.smooth = suave; n.normal_update()
            if n.normal.dot(ref) < 0:
                n.normal_flip()
        return True
    return False


def _anillos_parpado(lazo):
    """cuántos anillos son párpado de verdad: cerrados y sin crecer de más (Hanamichi: 2 de 5)."""
    K = 0
    for t in _informe_anillos(lazo, ANILLOS)[1:]:
        if not t['cerrado'] or t['vertices'] > CRECE * len(lazo):
            break
        K = t['k']
    return K


def _limpiar(bm, lazo, K):
    """Solo se actúa sobre triángulos reales: un rombo sin triángulo es crecimiento natural del anillo y se deja (colapsarlos
    encogía los anillos y creaba polos de 8). -> lista de operaciones."""
    log = []
    for _ in range(40):
        rs = _anillos(lazo, K + 1)
        accion = False
        for k in range(1, K + 1):
            ri, ro, S = set(rs[k - 1][0]), set(rs[k][0]), rs[k][1]
            if _muesca(bm, ri, ro):
                log.append((k, 'muesca')); accion = True; break
            tris = [f for f in S if len(f.verts) == 3]
            if not tris:
                continue
            par = next(((f, g) for f in tris for e in f.edges for g in e.link_faces if g is not f and g in tris), None)
            if par:
                bmesh.utils.face_join(list(par)); log.append((k, 'une')); accion = True; break
            crece = [f for f in tris if sum(v in ro for v in f.verts) == 2]
            hecho = False
            for f in crece:
                a, b = [v for v in f.verts if v in ro]
                if _fundir(bm, a, b):
                    log.append((k, 'empuja')); hecho = True; break
            if hecho:
                accion = True; break
            for t in tris:
                for f in S:
                    if len(f.verts) != 4 or sum(v in ri for v in f.verts) != 1:
                        continue
                    l = next(x for x in f.loops if x.vert in ri)
                    i, a, b, c = l.vert, l.link_loop_next.vert, l.link_loop_next.link_loop_next.vert, l.link_loop_prev.vert
                    if i in t.verts and (a in t.verts or c in t.verts):
                        x, y = (b, c) if a in t.verts else (a, b)
                        hecho = _fundir(bm, x, y)
                        if hecho:
                            log.append((k, 'rombo+tri')); break
                if hecho:
                    break
            if hecho:
                accion = True; break
        if not accion:
            break
    return log


def _informe_anillos(lazo, K=ANILLOS + 1):
    t = []
    for k, (r, s) in enumerate(_anillos(lazo, K)):
        c = set(r)
        e = {x for v in r for x in v.link_edges if x.other_vert(v) in c}
        g = Counter(v for x in e for v in x.verts)
        t.append({'k': k, 'vertices': len(r), 'cerrado': all(v == 2 for v in g.values()) and len(g) == len(r),
                  'triangulos': 0 if s is None else sum(len(f.verts) == 3 for f in s),
                  'valencia_max': max(len(v.link_edges) for v in r)})
    return t


# --- borde real del párpado (0.8.49, Hama): el lazo cerrado suele quedar fuera y lo que encierra incluye el párpado ---

def _esfera(cos):
    """-> (centro, radio, error máximo) del ajuste por mínimos cuadrados, o None si los puntos no la definen."""
    Q = np.array([tuple(c) for c in cos], dtype=float)
    A = np.c_[2 * Q, np.ones(len(Q))]
    s, _, rango, _ = np.linalg.lstsq(A, (Q * Q).sum(1), rcond=None)
    if rango < 4:
        return None
    r2 = s[3] + s[:3] @ s[:3]
    if r2 <= 0:
        return None
    r = float(np.sqrt(r2))
    return Vector(s[:3]), r, float(np.abs(np.linalg.norm(Q - s[:3], axis=1) - r).max())


def _globo(sueltas):
    """la mayor pieza suelta que sea un casquete de esfera. -> (centro, radio) o None."""
    resto = {v for f in sueltas for v in f.verts}; mejor = None
    while resto:
        isla = {resto.pop()}; st = list(isla)
        while st:
            v = st.pop()
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in isla:
                    isla.add(w); st.append(w)
        resto -= isla
        if len(isla) < MIN_GLOBO or (mejor and len(isla) <= mejor[0]):
            continue
        ajuste = _esfera([v.co for v in isla])
        if ajuste and ajuste[2] <= ERROR_GLOBO * ajuste[1]:
            mejor = (len(isla), ajuste[0], ajuste[1])
    return mejor[1:] if mejor else None


def _margen(m, c, r):
    """curva donde la piel del interior entra en el globo: cada cara cruzada aporta un tramo entre dos aristas. -> [Vector] cerrada o None."""
    d = {}
    def signo(v):
        if v not in d:
            d[v] = (v.co - c).length - r
        return d[v]
    punto = {}; ady = {}
    for f in m['interior']:
        cruz = [e for e in f.edges if (signo(e.verts[0]) < 0) != (signo(e.verts[1]) < 0)]
        if len(cruz) != 2:
            continue
        for e in cruz:
            a, b = e.verts
            punto[e] = a.co + (b.co - a.co) * (d[a] / (d[a] - d[b]))
        ady.setdefault(cruz[0], []).append(cruz[1]); ady.setdefault(cruz[1], []).append(cruz[0])
    vistos = set(); ciclos = []
    for e0 in ady:
        if e0 in vistos or len(ady[e0]) != 2:
            continue
        ciclo = [e0]; prev = None; e = e0
        while True:
            vistos.add(e)
            sig = [x for x in ady[e] if x is not prev]
            if len(ady[e]) != 2 or not sig:
                ciclo = None; break
            prev, e = e, sig[0]
            if e is e0:
                break
            if e in vistos:
                ciclo = None; break
            ciclo.append(e)
        if ciclo and len(ciclo) >= MIN_LAZO // 2:
            ciclos.append([punto[x] for x in ciclo])
    if not ciclos:
        return None
    return min(ciclos, key=lambda q: (sum(q, Vector()) / len(q) - c).dot(m['n']))     # el más adelantado; los demás van por detrás


def _comisuras(P):
    """par de puntos más alejados, con el de menor X primero."""
    i, j = max(((a, b) for a in range(len(P)) for b in range(a + 1, len(P))), key=lambda t: (P[t[0]] - P[t[1]]).length)
    return (i, j) if P[i].x < P[j].x else (j, i)


def _arcos(P):
    """índices de los dos arcos de comisura a comisura: (superior, inferior)."""
    a, b = _comisuras(P); n = len(P)
    uno = [a]
    while uno[-1] != b:
        uno.append((uno[-1] + 1) % n)
    dos = [b]
    while dos[-1] != a:
        dos.append((dos[-1] + 1) % n)
    dos.reverse()
    z = lambda ids: sum(P[i].z for i in ids) / len(ids)
    return (uno, dos) if z(uno) > z(dos) else (dos, uno)


def _fracciones(Q):
    L = [0.0]
    for a, b in zip(Q, Q[1:]):
        L.append(L[-1] + (b - a).length)
    return [x / L[-1] for x in L] if L[-1] > 0 else L


def _en_arco(Q, F, f):
    for i in range(1, len(F)):
        if f <= F[i]:
            t = (f - F[i - 1]) / max(F[i] - F[i - 1], 1e-12)
            return Q[i - 1].lerp(Q[i], t)
    return Q[-1].copy()


def _destinos(lazo, curva):
    """punto de la curva para cada vértice del lazo: comisura con comisura y arriba con arriba, repartido por longitud de arco."""
    P = [v.co.copy() for v in lazo]
    out = [None] * len(P)
    for arco, destino in zip(_arcos(P), _arcos(curva)):
        q = [curva[i] for i in destino]; Fq = _fracciones(q)
        for i, f in zip(arco, _fracciones([P[i] for i in arco])):
            out[i] = _en_arco(q, Fq, f)
    return out


def _superficie_con_parpado(bm, m, f0, capa, c, r):
    """piel + párpado: lo de dentro del lazo que no está dentro del globo. Se guarda antes de borrar. -> BVH."""
    from mathutils.bvhtree import BVHTree
    caras = _isla_uv(f0, capa) | {f for f in m['interior'] if sum((v.co - c).length for v in f.verts) / len(f.verts) >= r}
    cos, tris = [], []
    for t in bm.calc_loop_triangles():
        if t[0].face in caras:
            i = len(cos); cos += [l.vert.co.copy() for l in t]; tris.append((i, i + 1, i + 2))
    return BVHTree.FromPolygons(cos, tris, all_triangles=True)


def _al_margen(bm, m, curva, bvh, capa, K):
    """lleva el lazo a la curva y reparte los anillos entre esa curva y la piel que no se mueve, sobre la superficie original. La UV
    se queda en la isla de piel: nunca toma la textura pintada dentro del ojo. -> informe."""
    lazo = m['vs']
    f0 = next(f for v in lazo for f in v.link_faces)
    piel = _isla_uv(f0, capa)
    sup_uv = _superficie(bm, piel, capa)
    destino = dict(zip(lazo, _destinos(lazo, curva)))
    usados = set(lazo); fr = set(lazo); libres = set()
    for _ in range(max(K, HOPS_MARGEN)):
        fr = {w for v in fr for f in v.link_faces if f in piel for w in f.verts} - usados
        usados |= fr
        libres |= {v for v in fr if not v.is_boundary and all(f in piel for f in v.link_faces)}
    mover = max((destino[v] - v.co).length for v in lazo)
    for v in lazo:
        v.co = destino[v]
    for _ in range(ITER_MARGEN):
        pos = {v: sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges) for v in libres}
        for v, p in pos.items():
            v.co = bvh.find_nearest(p)[0]
    volteadas = 0
    bm.normal_update()
    tocadas = {f for v in libres | set(lazo) for f in v.link_faces}
    for f in tocadas:
        if f.normal.dot(bvh.find_nearest(f.calc_center_median())[1]) < -0.2:
            volteadas += 1
    for v in libres | set(lazo):
        uv = _proyectar(sup_uv, v.co)[1]
        for l in v.link_loops:
            if l.face in piel:
                l[capa].uv = uv
    return {'desplazamiento_max_mm': round(mover * 1000, 2), 'vertices_movidos': len(libres) + len(lazo), 'caras_volteadas': volteadas}


def _abertura(P):
    """[ancho, alto] en mm."""
    a, b = _comisuras(P)
    return [round((P[b] - P[a]).length * 1000, 1), round((max(p.z for p in P) - min(p.z for p in P)) * 1000, 1)]


# --- cuenca hundida ---

def _ordenar(lazo):
    """sentido tal que las caras existentes recorren A[i] → A[i+1]; las nuevas van al revés."""
    a, b = lazo[0], lazo[1]
    e = next(x for x in a.link_edges if x.other_vert(a) is b)
    return lazo if e.link_loops[0].vert is a else [lazo[0]] + lazo[:0:-1]


def _uv_de(bm, lazo):
    capa = bm.loops.layers.uv.active
    if capa is None:
        return None, {}
    return capa, {v: v.link_loops[0][capa].uv.copy() for v in lazo}


def _cuenca(bm, lazo, n_in):
    """rejilla que cierra el hueco: tres anillos + tapa Coons. -> (caras nuevas, triángulos)."""
    A = _ordenar(lazo); n = len(A)
    C = sum((v.co for v in A), Vector()) / n
    ancho = max((v.co - w.co).length for v in A for w in A) / 2
    ext = max(range(n), key=lambda i: abs(A[i].co.x))       # comisura externa: el vértice extra del fondo queda oculto ahí
    A = A[ext:] + A[:ext]
    capa, uv = _uv_de(bm, A)
    mat = next(iter(A[0].link_faces)).material_index
    origen = {}

    def anillo(s, h):
        out = []
        for v in A:
            d = v.co - C; pl = d - n_in * d.dot(n_in)
            nv = bm.verts.new(v.co + pl * (s - 1) + n_in * h * ancho)
            origen[nv] = v; out.append(nv)
        return out

    R1, R2, R3b = [anillo(s, h) for s, h in CUENCA]
    caras = []
    for ra, rb in ((A, R1), (R1, R2)):
        for i in range(n):
            j = (i + 1) % n
            caras.append(bm.faces.new((ra[j], ra[i], rb[i], rb[j])))
    tris = 0
    if n % 2:                               # borde impar: 1 triángulo en el anillo más profundo
        x = bm.verts.new((R3b[0].co + R3b[1].co) / 2); origen[x] = A[0]
        R3 = [R3b[0], x] + R3b[1:]
        caras.append(bm.faces.new((R2[0], R3[0], R3[1]))); tris = 1
        caras.append(bm.faces.new((R2[1], R2[0], R3[1], R3[2])))
        for i in range(1, n):
            j = (i + 1) % n
            caras.append(bm.faces.new((R2[j], R2[i], R3[i + 1], R3[(j + 1) if j else 0])))
    else:
        R3 = R3b
        for i in range(n):
            j = (i + 1) % n
            caras.append(bm.faces.new((R2[j], R2[i], R3[i], R3[j])))
    m = len(R3)
    b = max(2, round(m * 0.115)); a = m // 2 - b
    L = [R3[(k - 1) % m] for k in range(m)]
    bot = L[:a + 1]; der = L[a:a + b + 1]; top = L[a + b:2 * a + b + 1][::-1]; izq = (L[2 * a + b:] + [L[0]])[::-1]
    G = [[None] * (b + 1) for _ in range(a + 1)]
    for u in range(a + 1):
        G[u][0] = bot[u]; G[u][b] = top[u]
    for w in range(b + 1):
        G[0][w] = izq[w]; G[a][w] = der[w]
    for u in range(1, a):
        for w in range(1, b):
            s, t = u / a, w / b
            P = (1 - t) * bot[u].co + t * top[u].co + (1 - s) * izq[w].co + s * der[w].co
            P -= (1 - s) * (1 - t) * bot[0].co + s * (1 - t) * bot[a].co + (1 - s) * t * top[0].co + s * t * top[a].co
            P += n_in * ABOMBADO * ancho * math.sin(math.pi * s) * math.sin(math.pi * t)
            G[u][w] = bm.verts.new(P)
            origen[G[u][w]] = min(A, key=lambda v: (v.co - P).length)
    for u in range(a):
        for w in range(b):
            caras.append(bm.faces.new((G[u][w + 1], G[u + 1][w + 1], G[u + 1][w], G[u][w])))
    for f in caras:
        f.smooth = True; f.material_index = mat
        if capa is not None:
            for l in f.loops:
                l[capa].uv = uv[origen.get(l.vert, l.vert)]
    return caras, tris


# --- entrada ---

def preparar(cara, aplicar=False, centros=None, forzar=False, conservar_globo=False):
    """centros={'L':(x,y,z),'R':(...)} locales si la búsqueda automática se equivoca. aplicar=False: ensayo, malla intacta.
    conservar_globo=True (0.8.50): el globo suelto se usa para medir el borde, pero no se borra (ojos_tripo lo reutiliza)."""
    if cara.type != 'MESH' or cara.data.users != 1:
        raise ValueError('Se requiere una malla propia')
    me = cara.data
    if me.shape_keys or cara.modifiers:
        raise ValueError('Los párpados se preparan antes del rig: esta malla ya tiene shape keys o modificadores.')
    if cara.get('rlb_parpados_preparados') and not forzar:
        raise RuntimeError('Los párpados de esta malla ya están preparados.')
    util.modo_objeto()
    bm = bmesh.new(); bm.from_mesh(me)
    try:
        return _ejecutar(cara, me, bm, aplicar, centros, conservar_globo)
    finally:
        bm.free()


def _ejecutar(cara, me, bm, aplicar, centros, conservar_globo=False):
    bm.normal_update(); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    v0, f0 = len(bm.verts), len(bm.faces)
    ojos, tolerante = _buscar(bm, centros)
    if ojos is None:
        return {'aplicado': False, 'error': 'No hay un lazo cerrado por ojo. En Edit Mode revisa el borde o pasa centros={L,R} locales.'}
    r = {'aplicado': False, 'lazo_tolerante': tolerante, 'ojos': {}}
    for s, m in ojos.items():
        r['ojos'][s] = {'centro': [round(c, 4) for c in m['c']], 'ancho_mm': round(m['ancho'] * 1000, 1), 'lazo': len(m['vs']),
                        'caras_dentro': len(m['interior']), 'triangulos_dentro': sum(len(f.verts) == 3 for f in m['interior']),
                        'pared_clara': m['frente_dentro'] < PARED, 'frente_dentro': round(m['frente_dentro'], 2)}
    invertidas0 = sum(1 for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous)
    borrar = {f for m in ojos.values() for f in m['interior']}
    capa = bm.loops.layers.uv.active
    margenes = {}
    for s, m in ojos.items():
        sueltas = _islas_dentro(bm, m)
        d = r['ojos'][s]
        d['caras_sueltas_dentro'] = len(sueltas)
        if not conservar_globo:
            borrar |= sueltas
        d['abertura_lazo_mm'] = _abertura([v.co for v in m['vs']])
        globo = _globo(sueltas)
        curva = _margen(m, *globo) if globo and capa else None
        if curva:                               # todo esto se mide antes de borrar: después el párpado ya no existe
            fuera = next(f for v in m['vs'] for f in v.link_faces if f not in m['interior'])
            margenes[s] = (curva, _superficie_con_parpado(bm, m, fuera, capa, *globo))
            d.update(globo={'centro': [round(c, 4) for c in globo[0]], 'radio_mm': round(globo[1] * 1000, 2)},
                     abertura_margen_mm=_abertura(curva))
        elif m['interior'] and not m['frente_dentro'] < PARED:
            d['aviso'] = 'Sin globo suelto ni pared clara: comprueba a ojo que el lazo sea el borde real antes de aplicar; lo de dentro se borra.'
    if borrar:
        bmesh.ops.delete(bm, geom=list(borrar), context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for s, m in ojos.items():
        d = r['ojos'][s]
        d['anillos_antes'] = _informe_anillos(m['vs'])
        K = _anillos_parpado(m['vs'])
        d['anillos_parpado'] = K
        zona = [f for _, st in _anillos(m['vs'], K)[1:] for f in st if len(f.verts) == 3]
        bmesh.ops.join_triangles(bm, faces=zona, cmp_seam=False, cmp_sharp=False, cmp_uvs=False, cmp_vcols=False,
                                 cmp_materials=False, angle_face_threshold=math.radians(35), angle_shape_threshold=math.radians(50))
        ops = _limpiar(bm, m['vs'], K)
        bm.normal_update()
        d.update(operaciones=len(ops), anillos=_informe_anillos(m['vs']))     # antes de la cuenca, que también toca el lazo
        if s in margenes:
            d['al_margen'] = _al_margen(bm, m, margenes[s][0], margenes[s][1], capa, K)
            d['abertura_final_mm'] = _abertura([v.co for v in m['vs']])
            bm.normal_update()
            if d['al_margen']['caras_volteadas']:
                d['aviso'] = 'Hay caras volteadas alrededor del párpado: revisa la zona antes de seguir.'
        if not conservar_globo:     # con el globo dentro la cuenca quedaría metida en él: el borde se queda abierto sobre el globo
            caras, tris = _cuenca(bm, m['vs'], m['n'])
            bm.normal_update()
            d.update(caras_cuenca=len(caras), triangulos_cuenca=tris)
    invertidas = sum(1 for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous) - invertidas0
    r.update(vertices=[v0, len(bm.verts)], caras=[f0, len(bm.faces)], aristas_invertidas=invertidas, valida=bm.is_valid)
    if invertidas > 0:
        r['error'] = 'La cuenca salió con normales invertidas: no se aplica.'
        return r
    if not aplicar:
        return r
    bm.to_mesh(me); me.update()
    for k in ('facs_anillo_L', 'facs_anillo_R', 'facs_anillo_no'):
        if k in cara:
            del cara[k]
    cara['rlb_parpados_preparados'] = json.dumps({s: d['lazo'] for s, d in r['ojos'].items()})
    r['aplicado'] = True
    return r


# --- anillos concéntricos alrededor del ojo (0.8.48, Hama): banda nueva sobre la piel original ---

RINGS_T = (0.17, 0.34, 0.51, 0.68, 0.84)    # posición de los anillos iguales al lazo, entre el lazo y el contorno


def _clave_uv(l, capa):
    return tuple(round(x, 6) for x in l[capa].uv)


def _isla_uv(f0, capa):
    M = {f0}; st = [f0]
    while st:
        for l in st.pop().loops:
            o = l.link_loop_radial_next
            if o is l or o.face in M:
                continue
            if _clave_uv(l, capa) == _clave_uv(o.link_loop_next, capa) and _clave_uv(l.link_loop_next, capa) == _clave_uv(o, capa):
                M.add(o.face); st.append(o.face)
    return M


def _separar(bm, ajenas, piel):
    """suelta de la piel las piezas de otra isla UV (la ceja) dándoles vértices propios, sin mover nada. -> vértices separados."""
    copia = {}
    for f in list(ajenas):
        if not any(g in piel for v in f.verts for g in v.link_faces):
            continue
        vs = []
        for v in f.verts:
            if any(g in piel for g in v.link_faces):
                if v not in copia:
                    w = bm.verts.new(v.co); w.hide = v.hide; copia[v] = w
                vs.append(copia[v])
            else:
                vs.append(v)
        n = bm.faces.new(vs, f)
        for a, b in zip(n.loops, f.loops):
            a.copy_from(b)
        n.hide = f.hide
        bm.faces.remove(f)
    return len(copia)


def _region(lazo, interior, piel, K):
    F = set(); fr = set(lazo); usados = set(lazo)
    for _ in range(K):
        st = {f for v in fr for f in v.link_faces if f in piel} - F - interior
        F |= st
        fr = {v for f in st for v in f.verts} - usados; usados |= fr
    return F


def _contorno(F, lazo):
    """ciclo exterior de la región, o None si no es uno solo y simple."""
    s = set(lazo)
    be = {e for f in F for e in f.edges if sum(g in F for g in e.link_faces) == 1 and not (e.verts[0] in s and e.verts[1] in s)}
    ady = {}
    for e in be:
        for v in e.verts:
            ady.setdefault(v, []).append(e.other_vert(v))
    if not ady or any(len(x) != 2 for x in ady.values()):
        return None
    v0 = next(iter(ady)); ciclo = [v0]; prev = None; v = v0
    while True:
        w = ady[v][0] if ady[v][0] is not prev else ady[v][1]
        if w is v0:
            break
        ciclo.append(w); prev, v = v, w
    return ciclo if len(ciclo) == len(ady) else None


def _ajustar_paridad(F, lazo, piel, interior):
    """el contorno y el lazo deben tener la misma paridad: sumar un triángulo vecino la iguala."""
    for f in list(F):
        for e in f.edges:
            for g in e.link_faces:
                if g not in F and g in piel and g not in interior and len(g.verts) == 3:
                    G = F | {g}
                    c = _contorno(G, lazo)
                    if c and (len(c) - len(lazo)) % 2 == 0:
                        return G, c
    return None, None


def _reparto(A, O):
    """aristas del contorno (1 o 3) que tocan a cada arista del lazo, repartidas por longitud. -> índices en O."""
    M, N = len(A), len(O)
    la = [(A[(i + 1) % M].co - A[i].co).length for i in range(M)]; ta = sum(la)
    lo = [(O[(i + 1) % N].co - O[i].co).length for i in range(N)]; to = sum(lo)
    idx = [0]; j = 0; acum = acum_o = 0.0
    for i in range(M):
        acum += la[i] / ta
        quedan = M - i - 1
        resto = N - j
        d1 = acum_o + lo[j % N] / to
        d3 = d1 + (lo[(j + 1) % N] + lo[(j + 2) % N]) / to
        puede1 = resto - 1 <= 3 * quedan
        puede3 = resto - 3 >= quedan
        paso = 3 if puede3 and (not puede1 or abs(d3 - acum) < abs(d1 - acum)) else 1
        acum_o = d3 if paso == 3 else d1
        j += paso; idx.append(j)
    return idx


def _superficie(bm, piel, capa):
    from mathutils.bvhtree import BVHTree
    cos, tris, uvs = [], [], []
    for t in bm.calc_loop_triangles():
        if t[0].face in piel:
            i = len(cos); cos += [l.vert.co.copy() for l in t]
            tris.append((i, i + 1, i + 2)); uvs.append([l[capa].uv.copy() for l in t])
    return BVHTree.FromPolygons(cos, tris, all_triangles=True), cos, tris, uvs


def _proyectar(sup, p):
    from mathutils import geometry
    bvh, cos, tris, uvs = sup
    q, _, i, _ = bvh.find_nearest(p)
    a, b, c = [cos[k] for k in tris[i]]
    w = geometry.barycentric_transform(q, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    u = uvs[i]
    return q, u[0] * w.x + u[1] * w.y + u[2] * w.z


def _reanillar_ojo(bm, m, F, O, sup, capa, mat):
    A = list(m['vs'])
    e = next(x for x in A[0].link_edges if x.other_vert(A[0]) is A[1])
    cu = next((l for l in e.link_loops if l.face in m['interior']), None)
    # la banda nueva recorre el lazo al revés que la cuenca; con el borde abierto (0.8.50), igual que la piel que sustituye
    if (cu.vert is A[0]) if cu is not None else (e.link_loops[0].vert is not A[0]):
        A = [A[0]] + A[:0:-1]
    ext = max(range(len(A)), key=lambda i: abs(A[i].co.x))
    A = A[ext:] + A[:ext]
    j0 = min(range(len(O)), key=lambda j: (O[j].co - A[0].co).length)
    O = O[j0:] + O[:j0]
    giro = lambda L: sum((L[i].co - m['c']).cross(L[(i + 1) % len(L)].co - m['c']).dot(m['n']) for i in range(len(L)))
    if giro(A) * giro(O) < 0:
        O = [O[0]] + O[:0:-1]
    idx = _reparto(A, O)
    M, N = len(A), len(O)
    if idx[-1] != N:
        raise RuntimeError(f'Reparto de anillos inexacto: {idx[-1]} de {N}')
    uv = {v: _proyectar(sup, v.co)[1] for v in A + O}
    Opos = [O[idx[i]].co.copy() for i in range(M)]
    Apos = [v.co.copy() for v in A]
    fijos = set(A) | set(O)
    bmesh.ops.delete(bm, geom=list(F), context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[x for x in bm.edges if not x.link_faces and x.verts[0] not in fijos], context='EDGES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces and v not in fijos], context='VERTS')
    anillos = [A]
    for t in RINGS_T:
        r = []
        for i in range(M):
            p = _proyectar(sup, Apos[i].lerp(Opos[i], t))
            w = bm.verts.new(p[0]); uv[w] = p[1]; r.append(w)
        anillos.append(r)
    for _ in range(4):                          # reparte a lo largo de cada anillo sin salir de la piel
        for r in anillos[1:]:
            pos = [v.co.copy() for v in r]
            for i, v in enumerate(r):
                p = _proyectar(sup, pos[i].lerp((pos[i - 1] + pos[(i + 1) % M]) / 2, 0.5))
                v.co = p[0]; uv[v] = p[1]
    caras = []
    for ra, rb in zip(anillos, anillos[1:]):
        for i in range(M):
            j = (i + 1) % M
            caras.append(bm.faces.new((ra[i], ra[j], rb[j], rb[i])))
    R = anillos[-1]
    for i in range(M):
        a, b = R[i], R[(i + 1) % M]
        s0, s1 = idx[i], idx[i + 1]
        p0, p3 = O[s0 % N], O[s1 % N]
        if s1 - s0 == 1:
            caras.append(bm.faces.new((a, b, p3, p0)))
            continue
        p1, p2 = O[(s0 + 1) % N], O[(s0 + 2) % N]
        m1 = _proyectar(sup, (a.co.lerp(b.co, 1 / 3) + p1.co) / 2)
        m2 = _proyectar(sup, (a.co.lerp(b.co, 2 / 3) + p2.co) / 2)
        v1 = bm.verts.new(m1[0]); v2 = bm.verts.new(m2[0]); uv[v1] = m1[1]; uv[v2] = m2[1]
        caras += [bm.faces.new(q) for q in ((a, b, v2, v1), (a, v1, p1, p0), (v1, v2, p2, p1), (v2, b, p3, p2))]
    for f in caras:
        f.smooth = True; f.material_index = mat
        for l in f.loops:
            l[capa].uv = uv[l.vert]
    return caras, anillos


def reanillar(cara, aplicar=False, K=4):
    """rehace la banda de piel alrededor de cada ojo: 5 anillos iguales al lazo y una fila de transición en quads hasta la malla de
    fuera. Las piezas de otra isla UV pegadas a esa piel (la ceja) se sueltan. Va después de preparar(). aplicar=False: ensayo."""
    if cara.type != 'MESH' or cara.data.users != 1 or cara.data.shape_keys or cara.modifiers:
        raise ValueError('Los anillos se rehacen antes del rig: malla propia, sin shape keys ni modificadores.')
    util.modo_objeto()
    me = cara.data
    bm = bmesh.new(); bm.from_mesh(me)
    try:
        bm.normal_update(); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
        ojos, _ = _buscar(bm, None)
        capa = bm.loops.layers.uv.active
        if ojos is None or capa is None:
            return {'aplicado': False, 'error': 'No hay lazos de párpado o la malla no tiene UV.'}
        f0 = next(f for v in ojos['L']['vs'] for f in v.link_faces if f not in ojos['L']['interior'])
        piel = _isla_uv(f0, capa)
        mat = f0.material_index
        sueltos = 0; r = {'aplicado': False, 'ojos': {}}
        for m in ojos.values():
            fx = {g for f in _region(m['vs'], m['interior'], piel, K) for v in f.verts for g in v.link_faces} - piel - m['interior']
            ajenas = set()
            for g in fx:
                if g not in ajenas:
                    ajenas |= _isla_uv(g, capa)
            sueltos += _separar(bm, ajenas, piel)
        sup = _superficie(bm, piel, capa)
        planes = {}
        for s, m in ojos.items():
            F = _region(m['vs'], m['interior'], piel, K)
            O = _contorno(F, m['vs'])
            if O and (len(O) - len(m['vs'])) % 2:
                F, O = _ajustar_paridad(F, m['vs'], piel, m['interior'])
            if not O:
                return {'aplicado': False, 'error': f'{s}: el contorno de la banda no es un ciclo simple con K={K}.'}
            if len(O) > 3 * len(m['vs']):
                return {'aplicado': False, 'error': f'{s}: contorno de {len(O)} vértices, demasiado para un lazo de {len(m["vs"])}.'}
            planes[s] = (F, O)
            r['ojos'][s] = {'contorno': len(O), 'caras_antes': len(F), 'triangulos_antes': sum(len(f.verts) == 3 for f in F)}
        inv0 = sum(1 for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous)
        for s, m in ojos.items():
            caras, anillos = _reanillar_ojo(bm, m, *planes[s], sup, capa, mat)
            bm.normal_update()
            r['ojos'][s].update(caras_despues=len(caras), triangulos=sum(len(f.verts) != 4 for f in caras),
                                valencia_anillos=max(len(v.link_edges) for a in anillos[:-1] for v in a),
                                valencia_max=max(len(v.link_edges) for f in caras for v in f.verts),
                                separacion_mm=[round(1000 * sum((a[i].co - b[i].co).length for i in range(len(a))) / len(a), 2)
                                               for a, b in zip(anillos, anillos[1:])])
        r.update(ceja_vertices_separados=sueltos, vertices=len(bm.verts), caras=len(bm.faces), valida=bm.is_valid,
                 aristas_invertidas=sum(1 for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous) - inv0)
        if r['aristas_invertidas'] > 0:
            r['error'] = 'Banda con normales invertidas: no se aplica.'
            return r
        if aplicar:
            bm.to_mesh(me); me.update()
            cara['rlb_anillos_parpado'] = len(RINGS_T)
            r['aplicado'] = True
        return r
    finally:
        bm.free()
