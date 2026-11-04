# Ojos esculpidos en la piel (Tripo/Meshy suelen hacerlos así: un bulto esférico dentro del párpado, sin globo).
#  ajustar_esfera: rayos desde delante en una elipse -> esfera por mínimos cuadrados.
#  ajustar_esfera_auto: ajuste pequeño -> bulto (caras pegadas a la esfera, unidas al frente del ojo) ->
#    la ventana se centra en el bulto visible (el centro de la esfera queda más alto) -> reajuste.
#  abrir: borra las caras del bulto -> queda el hueco con párpados de verdad para los ojos de Vale.
#  Solo caras: los índices de vértices no cambian.
import bmesh
import numpy as np
from mathutils import Vector


def ajustar_esfera(P, bvh, cx, cz, ax, az):
    pts = []
    for x in np.linspace(cx - ax, cx + ax, 25):
        for z in np.linspace(cz - az, cz + az, 17):
            if ((x - cx) / ax) ** 2 + ((z - cz) / az) ** 2 < 0.5:
                h = bvh.ray_cast(Vector((x, -10.0, z)), Vector((0, 1, 0)))
                if h[0] is not None: pts.append(h[0][:])
    if len(pts) < 12:
        return None
    A = np.array(pts)
    M = np.c_[2 * A, np.ones(len(A))]; b = (A ** 2).sum(1)
    sol = np.linalg.lstsq(M, b, rcond=None)[0]
    C = sol[:3]; R = float(np.sqrt(max(sol[3] + C @ C, 1e-12)))
    return Vector(C), R, float(np.abs(np.linalg.norm(A - C, axis=1) - R).mean())


def _bulto(bm, C, R, tol_rel=0.03):
    TOL = tol_rel * R
    near = lambda v: abs((v.co - C).length - R) < TOL
    front = C + Vector((0, -R, 0))
    cands = [f for f in bm.faces if all(near(v) for v in f.verts)]
    if not cands:
        return set()
    f0 = min(cands, key=lambda f: (f.calc_center_median() - front).length)
    seen = {f0}; st = [f0]
    while st:
        f = st.pop()
        for e in f.edges:
            for g in e.link_faces:
                if g in seen: continue
                if sum(near(v) for v in g.verts) >= len(g.verts) - 1 and (g.calc_center_median() - C).length < R * 1.075:
                    seen.add(g); st.append(g)
    return seen


def ajustar_esfera_auto(me, P, bvh, c, hw_ojo):
    """c = centro aproximado (x, z); hw_ojo = media anchura aproximada. -> (C, R, residuo) o None."""
    # la posición de partida (plantilla de Vale) puede caer lejos: rejilla de ventanas medianas y la que
    # mejor encaja una esfera de tamaño razonable
    Rt = 1.4 * hw_ojo
    f, mejor = None, None
    for cx in np.linspace(c[0] - 0.6 * hw_ojo, c[0] + 0.6 * hw_ojo, 9):
        for cz in np.linspace(c[2] - 0.5 * hw_ojo, c[2] + 0.7 * hw_ojo, 9):
            g = ajustar_esfera(P, bvh, cx, cz, 0.5 * hw_ojo, 0.3 * hw_ojo)
            if g is None or not (0.5 * Rt < g[1] < 1.6 * Rt): continue
            if mejor is None or g[2] / g[1] < mejor:
                mejor, f = g[2] / g[1], g
    if f is None or mejor > 0.01:
        return None
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    try:
        for _ in range(3):
            C, R, _r = f
            blob = _bulto(bm, C, R)
            if len(blob) < 6:
                return None
            q = np.array([v.co[:] for g in blob for v in g.verts])
            cx, cz = (q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2
            ax, az = 0.8 * (q[:, 0].max() - q[:, 0].min()) / 2, 0.8 * (q[:, 2].max() - q[:, 2].min()) / 2
            g = ajustar_esfera(P, bvh, cx, cz, ax, az)
            if g is None:
                break
            f = g
    finally:
        bm.free()
    return f


def _esfera_puntos(A):
    M = np.c_[2 * A, np.ones(len(A))]; b = (A ** 2).sum(1)
    sol = np.linalg.lstsq(M, b, rcond=None)[0]
    C = sol[:3]; R = float(np.sqrt(max(sol[3] + C @ C, 1e-12)))
    return Vector(C), R, float(np.abs(np.linalg.norm(A - C, axis=1) - R).mean())


def buscar_en_malla(me, P, face, mc, hw, isl=None):
    """busca los ojos en la propia malla (sin rayos): vecindarios de vértices de la zona de los ojos que
    encajan en una esfera -> bulto (caras unidas pegadas a esa esfera); el bulto más grande de cada lado.
    -> {'L': (C, R, n_caras, cobertura), 'R': ...} o {} si no hay (cobertura = área del bulto / media esfera)."""
    # vecindario TOPOLÓGICO (2 anillos de aristas): por distancia se cuelan párpados y pestañas de otras capas
    nrm = np.array([v.normal[:] for v in me.vertices])
    caja = ((P[:, 2] > mc[2] + 1.5 * hw) & (P[:, 2] < mc[2] + 6.0 * hw)
            & (np.abs(P[:, 0]) > 0.3 * hw) & (np.abs(P[:, 0]) < 3.5 * hw))
    # 0.6.9 (Carlitos): Tripo puede dejar un ojo como ISLA SUELTA (el R, 181 vért.) y el otro dentro de la piel:
    # buscando solo en la isla de la cara, el R encajaba una esfera de 23 mm en la mejilla. Entran también las islas
    # pequeñas que caen enteras en la zona de los ojos
    face = face.copy()
    from . import util
    isl = util.islas(me) if isl is None else isl
    sueltas = []
    for k in np.unique(isl[caja & ~face]):
        m = isl == k
        if m.sum() < 3000 and caja[m].mean() > 0.9:
            face |= m; sueltas.append(np.where(m)[0])
    zona = face & caja & (nrm[:, 1] < -0.3)
    idx = np.where(zona)[0]
    if len(idx) == 0:
        return {}
    ed = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ed)
    nb = {}
    for a, b in ed.reshape(-1, 2):
        nb.setdefault(a, []).append(b); nb.setdefault(b, []).append(a)

    def anillos(i, n=2):
        s = {i}; fr = {i}
        for _ in range(n):
            fr = {k for j in fr for k in nb.get(j, ())} - s; s |= fr
        return list(s)
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    cands = {'L': [], 'R': []}
    cobertura = {}                                     # id(candidato) -> área del bulto / área de media esfera

    def anotar(lado, C, R, caras):
        a = sum(f.calc_area() for f in caras)
        c = (C, R, len(caras)); cobertura[id(c)] = a / (2 * np.pi * R * R)
        cands[lado].append(c)
    try:
        # isla suelta con forma de globo: la esfera se ajusta a TODA la isla (por vecindarios salía de 9–10 mm
        # en un globo de 11,7 y el bulto quedaba a trozos)
        for ids in sueltas:
            C, R, res = _esfera_puntos(P[ids])
            if not (0.6 * hw < R < 2.5 * hw) or res > 0.05 * R:
                continue
            st = set(ids.tolist())
            caras = [f for f in bm.faces if f.verts[0].index in st]
            anotar('L' if C.x > 0 else 'R', C, R, caras)
        for i in idx[::max(1, len(idx) // 400)]:
            vec = anillos(int(i))
            if len(vec) < 10: continue
            C, R, res = _esfera_puntos(P[vec])
            if not (0.6 * hw < R < 2.5 * hw) or res > 0.01 * R: continue
            if C.y < P[i][1]: continue                 # convexa hacia delante (el centro queda detrás)
            lado = 'L' if P[i][0] > 0 else 'R'
            if any((C - c[0]).length < 0.1 * R for c in cands[lado]):
                continue
            blob = _bulto(bm, C, R)
            if len(blob) < 8: continue
            q = np.array([v.co[:] for g in blob for v in g.verts])
            C2, R2, res2 = _esfera_puntos(q)          # reajuste con todo el bulto
            blob2 = _bulto(bm, C2, R2)
            anotar(lado, C2, R2, blob2)
    finally:
        bm.free()
    if not cands['L'] or not cands['R']:
        return {}
    # 0.6.9: manda la COBERTURA (área del bulto / media esfera): un globo de Tripo es ~media esfera o más (Carlitos
    # 1,4) y un pómulo, un casquete de una esfera grande (0,1). Con «más caras» ganaban las mejillas (22–26 mm).
    # De las parejas que se parecen en espejo, la de mejor cobertura; si ninguna, la mejor de cada lado (quien
    # llama ve la asimetría con simetria_ojos())
    cob = lambda c: cobertura[id(c)]
    pares = [(a, b) for a in cands['L'] for b in cands['R'] if simetria_ojos(a, b)['ok']]
    if pares:
        a, b = max(pares, key=lambda p: min(cob(p[0]), cob(p[1])))
        return {'L': a + (cob(a),), 'R': b + (cob(b),)}
    return {s: (lambda c: c + (cob(c),))(max(cands[s], key=cob)) for s in ('L', 'R')}


def simetria_ojos(fL, fR, tol_c=0.5, tol_r=1.35):
    """¿los dos globos se parecen en espejo? (centro de R reflejado a menos de tol_c·r del de L y radios con
    razón < tol_r). En Tripo los ojos no son exactos (Martín: 3,6 mm en X), pero un ojo de 23 mm junto a uno de
    11,7 o 15 mm más bajo es un error de detección."""
    (CL, RL), (CR, RR) = (Vector(fL[0]), fL[1]), (Vector(fR[0]), fR[1])
    d = (CL - Vector((-CR.x, CR.y, CR.z))).length
    razon = max(RL, RR) / max(min(RL, RR), 1e-9)
    return {'ok': d < tol_c * min(RL, RR) and razon < tol_r, 'desvio_mm': round(d * 1000, 1),
            'razon_radios': round(razon, 2)}


def abrir(cara, esferas):
    """esferas = {'L': (C, R), 'R': (C, R)}. Borra el bulto de cada ojo."""
    me = cara.data
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    borrar, info = set(), {}
    for s, (C, R) in esferas.items():
        b = _bulto(bm, Vector(C), R)
        borrar |= b; info[s] = len(b)
    # restos: trozos de la cuenca que quedan sueltos al quitar el bulto (Malcon, ojo derecho: un casquete
    # dentro del hueco, «isla 99») -> también se borran. Son los trozos pequeños cerca del ojo que tocaban
    # el bulto y ya no se unen al resto de la piel.
    tocados = {v for f in borrar for v in f.verts}
    vistas = set(borrar)
    for f0 in bm.faces:
        if f0 in vistas or not any(v in tocados for v in f0.verts): continue
        comp = {f0}; st = [f0]
        while st and len(comp) <= 600:
            f = st.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g not in comp and g not in borrar:
                        comp.add(g); st.append(g)
        vistas |= comp
        if len(comp) > 600: continue
        cerca = any(all((v.co - Vector(C)).length < 1.3 * R for f in comp for v in f.verts)
                    for C, R in esferas.values())
        if cerca:
            borrar |= comp
            info.setdefault('restos', []).append(len(comp))
    # (0.6.4, Martín R) trozos del ojo de Tripo que ni tocaban el bulto: islas pequeñas sueltas pegadas a la
    # esfera del globo por delante (se veían como una esquirla sobre el iris y tapaban el borde del párpado)
    vistas = set(borrar)
    for f0 in bm.faces:
        if f0 in vistas: continue
        comp = {f0}; st = [f0]
        while st and len(comp) <= 600:
            f = st.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g not in comp and g not in borrar:
                        comp.add(g); st.append(g)
        vistas |= comp
        if len(comp) > 600: continue
        for C, R in esferas.values():
            C = Vector(C); n_en = 0
            for f in comp:
                q = f.calc_center_median() - C
                if q.y < 0 and abs(q.length - R) < 0.35 * R and (q.x * q.x + q.z * q.z) ** 0.5 < 0.95 * R:
                    n_en += 1
            if n_en >= 0.4 * len(comp):
                borrar |= comp
                info.setdefault('islas_sueltas', []).append(len(comp))
                break
    ed = {e for f in borrar for e in f.edges}
    bmesh.ops.delete(bm, geom=list(borrar), context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[e for e in ed if e.is_valid and not e.link_faces], context='EDGES_FACES')
    bm.to_mesh(me); bm.free(); me.update()
    return info
