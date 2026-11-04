# Pasos 7 y 8: ojos (reutilizados de Vale o los del personaje) + párpados, pestañas, cejas y mejillas.
# Párpados: shape keys que giran cada vértice alrededor del eje X del ojo con su propio ángulo (el que lleva
# el borde a la línea de cierre), en PASOS keys intermedias para recorrer el arco por fuera del globo.
# Pestañas (materiales detectados) y rabillo giran ENTEROS con su párpado: bajan pegados, un solo movimiento.
# Corrector parp_corr: ojo cerrado + párpado inferior subido (risa, guiño) se encuentran sin cruzarse.
# Cejas: la isla de la ceja y la piel de debajo con el mismo campo (si no hay isla, una ceja «virtual»).
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree
from . import util, medidas, marco as MK, parpados_huesos as PH, mascaras_regiones as MR

BIBLIOTECA = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'biblioteca', 'ojos_vale.blend')
PARAM = {'cierre_k': 0.15, 'solape': 1.5, 'entornar': 0.40, 'abrir': 6.0, 'pasos': 4, 'holgura': 0.0004,
         'sup_rigido': 11.0, 'sup_estira': 18.0, 'inf_rigido': 4.0, 'inf_estira': 14.0,
         'alisar': 24, 'alisar_contorno': 2, 'modo': 'huesos', 'rabillo': 0.004, 'rabillo_ancho': 0.006,
         # pesos por distancia geodésica desde el borde del hueco del ojo (× E, en m): el párpado entero baja y
         # la piel hasta la ceja se estira. Medido en Gómez: rollo 0–6 mm, pliegue 7–9 mm, ceja 10–12 mm (E 0,75)
         'geo_rigido': 0.0085, 'geo_estira': 0.0095, 'geo_inf_rigido': 0.004, 'geo_inf_estira': 0.008,
         # las cejas acompañan al ojo: bajan al cerrar / entornar y suben al abrir mucho (fracción de su recorrido)
         # 0.6.0: el usuario no quiere que la ceja baje al cerrar el párpado (era 0.22 / 0.12 desde Gómez)
         'ceja_cierre': 0.0, 'ceja_abrir': 0.25, 'ceja_entornar': 0.0,
         # 0.6.0: pliegue párpado-ceja medido con rayos (la ceja no baja), grados de transición por encima de él
         'pliegue': True, 'pliegue_ancho': 6.0,
         # Conserva el recorte del flujo heredado; desactívalo explícitamente en inspecciones de máscara ocular.
         'recortar_globo': True}


def _mapa_piel(me, basis, cara_m, idx):
    """para cada vértice de idx: (vértices, baricéntricas) del punto más cercano de la piel (o None)."""
    from mathutils.interpolate import poly_3d_calc
    polys = [tuple(p.vertices) for p in me.polygons if cara_m[p.vertices[0]]]
    bvh = BVHTree.FromPolygons([Vector(c) for c in basis], polys)
    mapa = []
    for i in idx:
        loc, _, f, _ = bvh.find_nearest(Vector(basis[i]))
        if loc is None:
            mapa.append(None); continue
        vs = polys[f]
        w = poly_3d_calc([Vector(basis[v]) for v in vs], loc)
        mapa.append((list(vs), np.array(w)))
    return mapa


def _pegar_islas(cara, basis, cara_m, islas_m, claves):
    """cejas sueltas (islas medio hundidas en la piel): en cada key se mueven EXACTAMENTE como la piel que
    tienen debajo (punto más cercano de la superficie, baricéntricas). Nunca se despegan ni se hunden."""
    me = cara.data
    idx = np.where(islas_m)[0]
    mapa = _mapa_piel(me, basis, cara_m, idx)
    kb = me.shape_keys.key_blocks
    n = len(me.vertices)
    # 0.8.3 (Ichigo): cada isla se mueve RÍGIDA (el giro + traslación que mejor sigue a su piel). Vértice a vértice la ceja
    # copiaba los pliegues de la piel de debajo y se doblaba en gancho al subir/bajar
    lab = util.islas(me)[idx]
    grupos = [np.where(lab == g)[0] for g in np.unique(lab)]
    for nm in claves:
        k = kb.get(nm)
        if k is None: continue
        co = np.zeros(n * 3); k.data.foreach_get('co', co); co = co.reshape(-1, 3)
        dl = co - basis
        T = basis[idx].copy(); ok = np.zeros(len(idx), bool)
        for j, (i, m) in enumerate(zip(idx, mapa)):
            if m is None: continue
            T[j] = basis[i] + (dl[m[0]] * m[1][:, None]).sum(0); ok[j] = True
        for g in grupos:
            g = g[ok[g]]
            if len(g) < 3: continue
            A = basis[idx[g]]; Bt = T[g]
            ca, cb = A.mean(0), Bt.mean(0)
            U, _, Vt = np.linalg.svd((A - ca).T @ (Bt - cb))
            Rm = (U @ Vt).T
            if np.linalg.det(Rm) < 0:
                Vt[-1] *= -1; Rm = (U @ Vt).T
            todos = idx[lab == lab[g[0]]]
            co[todos] = (basis[todos] - ca) @ Rm.T + cb
        k.data.foreach_set('co', co.ravel())
    return len(idx)


def _media_movil(y, veces):
    """contorno del ojo medido con rayos: dientes de sierra que salían como bultos en el borde (Gómez)."""
    y = np.asarray(y, float)
    for _ in range(int(veces)):
        p = np.r_[y[:2][::-1], y, y[-2:][::-1]]
        y = np.convolve(p, np.ones(5) / 5, 'valid')
    return y


def _alisar_pesos(f, ed, grupo, fijo, it, k=0.5):
    """Laplaciano de los pesos sobre la malla, solo entre vértices del mismo párpado (no cruza al otro por
    los rabillos). Los fijos (borde rígido, pestañas) no cambian: el borde baja entero y la zona que se estira
    queda sin bultos, como alisar pesos en Weight Paint."""
    if it <= 0: return f
    a, b = ed[:, 0], ed[:, 1]
    keep = grupo[a] & grupo[b]; a, b = a[keep], b[keep]
    n = len(f); deg = np.zeros(n); np.add.at(deg, a, 1); np.add.at(deg, b, 1)
    mov = grupo & ~fijo & (deg > 0)
    f = f.copy()
    for _ in range(int(it)):
        s_ = np.zeros(n); np.add.at(s_, a, f[b]); np.add.at(s_, b, f[a])
        f = np.where(mov, f + k * (s_ / np.maximum(deg, 1) - f), f)
    return f


# ------------------------------------------------------------------ globos
def importar_ojos_vale(cara, M):
    n = M.n
    for k in ('ojos_raiz', 'piv_L', 'piv_R'):
        o = bpy.data.objects.get(n[k])
        if o:
            for ch in list(o.children_recursive): util.borrar_objeto(ch.name)
            util.borrar_objeto(o.name)
    with bpy.data.libraries.load(BIBLIOTECA, link=False) as (src, dst):
        dst.objects = [nm for nm in src.objects]
    col = util.coleccion(f'{cara.name} ojos')
    pref = cara.name
    for o in dst.objects:
        col.objects.link(o)
        base = o.name.split('.')[0] if o.name[-4:-3] == '.' and o.name[-3:].isdigit() else o.name
        o.name = base.replace('Vale_', pref + '_', 1)
        if o.name.startswith(pref + '_Eyes_ROOT'): o.name = n['ojos_raiz']
        elif o.name.startswith(pref + '_EyePivot_L'): o.name = n['piv_L']
        elif o.name.startswith(pref + '_EyePivot_R'): o.name = n['piv_R']
    raiz = bpy.data.objects[n['ojos_raiz']]
    raiz.constraints.clear()
    raiz.location = (0, 0, 0)
    for s in ('L', 'R'):
        p = bpy.data.objects[n['piv_' + s]]
        c, R = M.ojo(s)
        k = R / MK.R_OJO_V
        p.location = c; p.scale = (k, k, k); p['rlb_escala'] = k
    d = MK.cfg(cara); d['pivotes'] = [n['piv_L'], n['piv_R']]; d['ojos_raiz'] = n['ojos_raiz']; d['ojos_modo'] = 'VALE'
    MK.guardar_cfg(cara, d)
    return {'importados': [o.name for o in dst.objects]}


def usar_ojos_existentes(cara, M, piv_L, piv_R, raiz=None):
    # sin raíz (Gómez: pivotes sueltos) se crea una para colgar los ojos del hueso de la cabeza
    if not raiz:
        raiz = M.n['ojos_raiz']
        r = bpy.data.objects.get(raiz)
        if r is None:
            r = bpy.data.objects.new(raiz, None); r.empty_display_size = 0.01
            for c in bpy.data.objects[piv_L].users_collection: c.objects.link(r)
        for nm in (piv_L, piv_R):
            p = bpy.data.objects[nm]
            if p.parent is None:
                mw = p.matrix_world.copy(); p.parent = r; p.matrix_world = mw
    d = MK.cfg(cara); d['pivotes'] = [piv_L, piv_R]; d['ojos_raiz'] = raiz or ''
    MK.guardar_cfg(cara, d)
    for s, nm in (('L', piv_L), ('R', piv_R)):
        p = bpy.data.objects[nm]
        if 'rlb_escala' not in p: p['rlb_escala'] = p.scale[1]
        # el marcador se pone en el pivote y con el radio del globo (la malla hija más grande)
        hijos = [c for c in p.children_recursive if c.type == 'MESH']
        R = None
        if hijos:
            g = max(hijos, key=lambda o: len(o.data.vertices))
            c = p.matrix_world.translation
            dd = [((g.matrix_world @ v.co) - c).length for v in g.data.vertices]
            R = float(np.median(dd))
        e = bpy.data.objects.get(MK.nombre_marca(cara, 'ojo.' + s))
        if e:
            e.location = p.matrix_world.translation
            if R: e.empty_display_size = R; e.scale = (1, 1, 1)
    return {'pivotes': [piv_L, piv_R]}


def _recortar_en_globo(cara, P, C, lim, mascara, ejes=None):
    """-> (desplazamientos, caras borradas). Vértices de la máscara dentro de la esfera (C, lim) y por delante:
    los que tienen un vecino fuera van al punto donde esa arista cruza la esfera; los demás quedan hondos y sus
    caras se borran (solo caras: los índices no cambian). Con `ejes` (semiejes x, y, z) el globo es un elipsoide:
    se trabaja en el espacio donde es la esfera unidad (lim se ignora)."""
    if ejes is not None:
        ejes = np.asarray(ejes, float)
        d, n_ = _recortar_en_globo(cara, (P - C) / ejes, np.zeros(3), 1.0, mascara)
        return d * ejes, n_
    me = cara.data
    rel = P - C; r = np.linalg.norm(rel, axis=1)
    dentro = mascara & (r < lim - 1e-7) & (rel[:, 1] < 0.3 * lim)
    delta = np.zeros_like(P)
    if not dentro.any():
        return delta, 0
    nb = util.vecinos(me)
    hondo = dentro.copy()
    for i in np.where(dentro)[0]:
        pts = []
        for j in nb[i]:
            if dentro[j]: continue
            d = P[j] - P[i]; a = d @ d; b = 2 * rel[i] @ d; c = rel[i] @ rel[i] - lim ** 2
            t = (-b + math.sqrt(max(b * b - 4 * a * c, 0.0))) / (2 * a)
            pts.append(rel[i] + min(max(t, 0.0), 1.0) * d)
        if pts:
            q = np.mean(pts, 0); q *= lim / max(np.linalg.norm(q), 1e-9)
            delta[i] = q - rel[i]; hondo[i] = False
    n = 0
    if hondo.any():
        bm = bmesh.new(); bm.from_mesh(me)
        caras = [f for f in bm.faces if any(hondo[v.index] for v in f.verts)]
        ed = {e for f in caras for e in f.edges}
        n = len(caras)
        bmesh.ops.delete(bm, geom=caras, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[e for e in ed if e.is_valid and not e.link_faces], context='EDGES_FACES')
        bm.to_mesh(me); bm.free(); me.update()
    return delta, n


def _seleccion_lado(cfg, P, s, n, center_x=0.0):
    sel = cfg.get('parpado_sel_L')
    if not sel: return None
    m = np.zeros(n, bool)
    if s == 'L':
        m[sel] = True; return m
    kd = util.kd_de(P, np.arange(n))
    for i in sel:
        q = P[i].copy(); q[0] = 2 * center_x - q[0]
        m[kd.find(Vector(q))[1]] = True
    return m


def _borde_hueco(me, P, cara_m, C, lim, excluir_caras=None):
    """vértices del borde abierto del hueco del ojo (aristas con una sola cara) cerca del centro y por delante."""
    cnt = np.zeros(len(me.edges), int)
    ek = {e.key: e.index for e in me.edges}
    for i, p in enumerate(me.polygons):
        if excluir_caras is not None and excluir_caras[i]: continue
        for k in p.edge_keys: cnt[ek[k]] += 1
    out = set()
    for e in me.edges:
        if cnt[e.index] != 1: continue
        a, b = e.vertices
        if cara_m[a] and np.linalg.norm(P[a] - C) < lim and P[a][1] < C[1]: out |= {a, b}
    return np.array(sorted(out), int)


def _borde_abertura(me, P, cara_m, C, lim, excluir_caras=None):
    """borde del hueco del ojo; con la cuenca ya puesta (el hueco está cerrado) son los vértices de piel que tocan
    la cuenca, cerca del centro y por delante."""
    b = _borde_hueco(me, P, cara_m, C, lim, excluir_caras)
    if len(b) or 'rlb_cuenca' not in me.attributes: return b
    cu = np.zeros(len(me.vertices), int); me.attributes['rlb_cuenca'].data.foreach_get('value', cu)
    ED = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ED); ED = ED.reshape(-1, 2)
    toca = np.zeros(len(P), bool)
    toca[ED[cu[ED[:, 1]] == 1, 0]] = True; toca[ED[cu[ED[:, 0]] == 1, 1]] = True
    if excluir_caras is not None:
        visible_vertices = np.zeros(len(P), bool)
        for i, poly in enumerate(me.polygons):
            if not excluir_caras[i]: visible_vertices[list(poly.vertices)] = True
        toca &= visible_vertices
    toca &= (cu == 0) & cara_m & (np.linalg.norm(P - C, axis=1) < lim) & (P[:, 1] < C[1])
    return np.where(toca)[0]


def _columnas_abertura(bvh, C, sx, R_EYE, E):
    """rayos de frente sobre el globo: [(xl, dz más alto, dz más bajo que se ven del ojo)] por columna."""
    cols = []
    for xl in np.arange(-0.012 * E, 0.0215 * E, 0.0005 * E):
        x = C[0] + sx * xl; vis = []
        for dz in np.arange(-0.012 * E, 0.012 * E, 0.0001 * E):
            q = R_EYE ** 2 - xl ** 2 - dz ** 2
            if q <= 0: continue
            ys = C[1] - math.sqrt(q)
            h = bvh.ray_cast(Vector((x, C[1] - 1.0, C[2] + dz)), Vector((0, 1, 0)))
            if h[0] is None or h[0].y > ys: vis.append(dz)
        if len(vis) > 2: cols.append((float(xl), max(vis), min(vis)))
    return cols


def abertura_visible(cara, M, s, incluir_pestanas=True):
    """borde visible de la abertura en reposo, sin la cuenca (la piel que la rodea) -> (sup, inf) ordenados en X."""
    me = cara.data; P = util.coords(me)
    cara_m, _ = medidas.cara_mask(cara, M)
    if 'rlb_cuenca' in me.attributes:
        cu = np.zeros(len(P), int); me.attributes['rlb_cuenca'].data.foreach_get('value', cu); cara_m = cara_m & (cu == 0)
    piv = _pivotes(cara, M)
    C = np.array(piv[s].matrix_world.translation) if piv else np.array(M.ojo(s)[0])
    R_EYE = M.ojo(s)[1]; E = R_EYE / MK.R_OJO_V; sx = 1 if s == 'L' else -1
    excluir = caras_excluidas_abertura(me, incluir_pestanas)
    bvh = util.bvh_de(P, me, cara_m, excluir_caras=excluir)
    cols = _columnas_abertura(bvh, C, sx, R_EYE, E)
    sup, inf = _borde_visible(me, P, cara_m, C, sx, cols, 0.0002 * E, excluir)
    return sup[np.argsort(P[sup, 0])], inf[np.argsort(P[inf, 0])]


def caras_excluidas_abertura(me, incluir_pestanas=True):
    """Cara mask for eye-hidden GN faces and, optionally, UV-approved eyelash faces."""
    hidden = _caras_ocultas_uv(me)
    if incluir_pestanas:
        return hidden
    excluded = np.zeros(len(me.polygons), dtype=bool) if hidden is None else hidden.copy()
    region = me.attributes.get('RLB_region_id')
    if region and region.domain == 'FACE' and region.data_type == 'INT':
        ids = np.zeros(len(me.polygons), dtype=np.int32)
        region.data.foreach_get('value', ids)
        excluded |= ids == 2
    return excluded if excluded.any() else None


def _borde_visible(me, P, cara_m, C, sx, cols, paso, excluir_caras=None):
    """(0.6.0, Lian) borde de la abertura tal como se ve de frente: por cada columna (xl, dz_arriba, dz_abajo) de la
    medida con rayos, el vértice de piel que toca un rayo justo por encima / por debajo de lo que se ve del globo.
    En Tripo el hueco de la malla puede ser tan grande como el globo (Lian: llega detrás de la ceja) y los pesos
    medidos desde él bajaban la ceja con el párpado. -> (índices superiores, índices inferiores)."""
    polys = [tuple(p.vertices) for i, p in enumerate(me.polygons)
             if cara_m[p.vertices[0]] and (excluir_caras is None or not excluir_caras[i])]
    bvh = BVHTree.FromPolygons([Vector(c) for c in P], polys)
    sup, inf = set(), set()
    for xl, zt, zb in cols:
        x = C[0] + sx * xl
        for dz, dest in ((zt + paso, sup), (zb - paso, inf)):
            h = bvh.ray_cast(Vector((x, C[1] - 1.0, C[2] + dz)), Vector((0, 1, 0)))
            # por una rendija el rayo llegaba a la nuca (Lian L): solo vale la piel delante del centro del ojo
            if h[0] is None or h[0].y > C[1]: continue
            vs = polys[h[2]]
            dest.add(min(vs, key=lambda v: (Vector(P[v]) - h[0]).length))
    return np.array(sorted(sup), int), np.array(sorted(inf), int)


def _pliegue(bvh, C, sx, cols, E, R):
    """(0.6.0, Lian) pliegue entre el párpado superior y la ceja, medido con rayos de frente por columnas: subiendo
    desde el borde visible, la piel avanza (el borde), se mete (el pliegue: el punto más hundido) y vuelve a salir (la
    ceja). Lo que queda por encima del pliegue Y por delante de él es la ceja (también pegada a la piel) y no baja
    con el párpado; el forro de detrás (cerca del globo) sí, o atravesaría el ojo. Sin ceja que salga, la columna no
    cuenta. -> (xl, beta_pliegue en grados, y del fondo del pliegue respecto al centro) o None."""
    xs, bs, rs = [], [], []
    st = 0.0001 * E
    for xl, zt, zb in cols:
        x = C[0] + sx * xl
        zz = np.arange(zt + st, 2.0 * R, st); yy = np.full(len(zz), np.nan)
        for k, dz in enumerate(zz):
            h = bvh.ray_cast(Vector((x, C[1] - 1.0, C[2] + dz)), Vector((0, 1, 0)))
            if h[0] is not None: yy[k] = h[0].y
        ok = ~np.isnan(yy)
        if ok.sum() < 20: continue
        yy = np.interp(zz, zz[ok], yy[ok]); yy = _media_movil(yy, 3)
        # pico del borde (lo más saliente al principio) -> valle -> ceja (al menos 1,5 mm más saliente que el valle)
        lim = min(len(zz) - 1, int(0.012 * E / st))
        i_b = int(np.argmin(yy[:max(3, int(0.003 * E / st))]))
        if i_b >= lim - 2: continue
        i_v = i_b + int(np.argmax(yy[i_b:lim]))
        if i_v >= len(zz) - 3: continue
        if yy[i_v] - yy[i_v:].min() < 0.0015 * E: continue
        p = np.array([x - C[0], yy[i_v] - C[1], zz[i_v]])
        xs.append(xl); bs.append(math.degrees(math.atan2(p[2], -p[1]))); rs.append(float(p[1]))
    if len(xs) < 3: return None
    return np.array(xs), _media_movil(bs, 2), _media_movil(rs, 2)


def _radio_globo(p, C):
    """radio real de las piezas del ojo (globo, iris, brillos) por delante del centro."""
    R = 0.0
    for o in p.children_recursive:
        if o.type != 'MESH': continue
        V = np.array([o.matrix_world @ v.co for v in o.data.vertices])
        d = np.linalg.norm(V - C, axis=1)[V[:, 1] < C[1]]
        if len(d): R = max(R, float(d.max()))
    return R


def _ejes_globo(p, C):
    """semiejes del globo (la malla hija más grande) si es un elipsoide alineado con los ejes (Camilo: 12,9 × 7,8 mm);
    None si es casi una esfera o está girado (entonces vale el radio de _radio_globo)."""
    hijos = [o for o in p.children_recursive if o.type == 'MESH']
    if not hijos: return None
    g = max(hijos, key=lambda o: len(o.data.vertices))
    R3 = np.array(g.matrix_world.to_3x3().normalized())
    if np.abs(R3 - np.diag(np.diag(R3))).max() > 0.02: return None
    V = np.array([g.matrix_world @ v.co for v in g.data.vertices]) - C
    ej = np.abs(V).max(0)
    return ej if ej.max() / max(ej.min(), 1e-9) > 1.1 else None


def _pivotes(cara, M):
    d = MK.cfg(cara)
    pv = d.get('pivotes')
    if not pv:
        return None
    return {'L': bpy.data.objects[pv[0]], 'R': bpy.data.objects[pv[1]]}


def _caras_ocultas_uv(me):
    """Máscara FACE conservada por Geometry Nodes para excluir los ojos originales del diagnóstico."""
    attr = me.attributes.get('RLB_ocultar_ojos_uv')
    if not attr or attr.data_type != 'BOOLEAN' or attr.domain != 'FACE':
        return None
    hidden = np.zeros(len(me.polygons), dtype=bool)
    attr.data.foreach_get('value', hidden)
    return hidden


# ------------------------------------------------------------------ párpados, cejas, mejillas
def parpados(cara, rig, M, par=None):
    P_ = dict(PARAM, **(par or {}))
    util.modo_objeto()
    me = cara.data
    if not me.shape_keys:
        cara.shape_key_add(name='Basis', from_mix=False)
    PREF = ('parp_', 'ceja_', 'mejilla')
    ad = me.shape_keys.animation_data
    if ad:
        for fc in list(ad.drivers):
            if any('"%s' % p in fc.data_path for p in PREF): ad.drivers.remove(fc)
    for k in list(me.shape_keys.key_blocks):
        if k.name.startswith(PREF): cara.shape_key_remove(k)
    PH.limpiar(cara, rig)
    kb = me.shape_keys.key_blocks
    HUESOS = {}
    n = len(me.vertices)
    basis = util.coords(me)
    cfg = M.cfg
    cara_m, isl = medidas.cara_mask(cara, M)
    normales = np.array([v.normal[:] for v in me.vertices])
    region_attr = me.attributes.get('RLB_region_id')
    uv_region_map = bool(region_attr and region_attr.data_type == 'INT' and region_attr.domain == 'FACE')
    if uv_region_map:
        region_ids = np.zeros(len(me.polygons), dtype=np.int32)
        region_attr.data.foreach_get('value', region_ids)
        face_vertices = [p.vertices for p in me.polygons]
        pest_sup_all = MR.vertices_por_region(face_vertices, region_ids, n, 2)
        pest_inf_all = np.zeros(n, bool)  # La clasificación UV aprobada actual etiqueta pestañas superiores.
        ceja_uv_all = MR.vertices_por_region(face_vertices, region_ids, n, 1)
        pest_source = 'RLB_region_id:2 (UV)'
        brow_source = 'RLB_region_id:1 (UV)'
    else:
        pest_sup_all = np.zeros(n, bool); pest_inf_all = np.zeros(n, bool)
        for p in me.polygons:
            if p.material_index in cfg.get('pestanas_sup', []): pest_sup_all[list(p.vertices)] = True
            elif p.material_index in cfg.get('pestanas_inf', []): pest_inf_all[list(p.vertices)] = True
        ceja_uv_all = np.zeros(n, bool)
        pest_source = 'materiales (compatibilidad, sin mapa FACE)'
        brow_source = 'semillas/topología heredadas (sin mapa FACE)'
    pest_inf_all &= ~pest_sup_all
    pest_islas_tot = np.zeros(n, bool)
    excluir_caras = _caras_ocultas_uv(me)
    bvh = util.bvh_de(basis, me, cara_m, excluir_caras=excluir_caras)
    piv = _pivotes(cara, M)
    PASOS = int(P_['pasos'])
    nb_g = util.vecinos(me)
    # cejas: islas sueltas y la ceja pegada a la piel (Malcon, lado R). El párpado no tira de ellas.
    from . import partes
    pegada = None if uv_region_map else partes.separar_ceja_pegada(cara, M, solo_buscar=True)
    en_ceja = np.zeros(n, bool)
    if uv_region_map:
        en_ceja |= ceja_uv_all
    else:
        for v in cfg.get('cejas', {}).values():
            if v is not None and v >= 0: en_ceja |= isl == isl[v]
    if pegada: en_ceja[pegada[1]] = True
    d_ceja = np.full(n, np.inf); d_peg = np.full(n, np.inf)
    if en_ceja.any():
        q = basis[en_ceja].copy(); q2 = q.copy(); q2[:, 0] = 2 * M.cx - q2[:, 0]; q = np.r_[q, q2]
        kd_ce = util.kd_de(q, np.arange(len(q)))
        for i in np.where(cara_m)[0]: d_ceja[i] = kd_ce.find(Vector(basis[i]))[2]
    if pegada:
        kd_pg = util.kd_de(basis, pegada[1])
        for i in np.where(cara_m)[0]: d_peg[i] = kd_pg.find(Vector(basis[i]))[2]

    def mover_base(delta):
        nonlocal basis
        basis = basis + delta
        for k in kb:
            co = np.zeros(n * 3); k.data.foreach_get('co', co)
            k.data.foreach_set('co', (co.reshape(-1, 3) + delta).ravel())
        me.vertices.foreach_set('co', basis.ravel()); me.update()

    def nueva(nombre, desp, smin=0.0):
        k = cara.shape_key_add(name=nombre, from_mix=False)
        k.data.foreach_set('co', (basis + desp).ravel()); k.slider_min = smin; k.value = 0
        return k

    def girar(rel, ang):
        b = np.arctan2(rel[:, 2], -rel[:, 1]) - np.radians(ang)
        ryz = np.hypot(rel[:, 1], rel[:, 2])
        out = rel.copy(); out[:, 2] = ryz * np.sin(b); out[:, 1] = -ryz * np.cos(b)
        return out

    info = {}
    CTRL_R = {}
    for s in ('L', 'R'):
        sx = 1 if s == 'L' else -1
        pest_sup = MR.por_lado(pest_sup_all, basis[:, 0], M.cx, sx)
        pest_inf = MR.por_lado(pest_inf_all, basis[:, 0], M.cx, sx)
        if piv:
            C = np.array(piv[s].matrix_world.translation)
            R_EYE = M.ojo(s)[1]
        else:
            C = np.array(M.ojo(s)[0]); R_EYE = M.ojo(s)[1]
        E = R_EYE / MK.R_OJO_V
        xs, bu_t, bl_t = [], [], []
        cols = _columnas_abertura(bvh, C, sx, R_EYE, E)
        for xl, zt, zb in cols:
            def beta(dz):
                q = math.sqrt(max(R_EYE ** 2 - xl ** 2 - dz ** 2, 0))
                return math.degrees(math.atan2(dz, q))
            xs.append(xl); bu_t.append(beta(zt)); bl_t.append(beta(zb))
        if len(xs) < 3:
            info[s] = 'no se ve el globo por el hueco: revisa el marcador del ojo'
            continue
        xs = np.array(xs); x_in, x_out = xs.min(), xs.max()
        bu_t = _media_movil(bu_t, P_['alisar_contorno']); bl_t = _media_movil(bl_t, P_['alisar_contorno'])
        rel = basis - C; r = np.linalg.norm(rel, axis=1)
        xl = sx * rel[:, 0]
        beta = np.degrees(np.arctan2(rel[:, 2], -rel[:, 1]))
        bu = np.interp(xl, xs, bu_t); bl = np.interp(xl, xs, bl_t); bmid = (bu + bl) / 2
        # borde del párpado y pestañas SIEMPRE por fuera del globo, en reposo y al bajar (Tripo mete el borde
        # dentro y el ojo asomaba entre las pestañas). Se recorta la piel en la esfera (+ holgura): lo que cruza
        # el globo se queda justo en el cruce (la línea que se ve no cambia) y lo que queda entero dentro se
        # borra (no se veía). Al cerrar todo gira alrededor del centro: la distancia se conserva, sigue fuera.
        lim = (_radio_globo(piv[s], C) if piv else R_EYE) + P_['holgura'] * E
        ej = _ejes_globo(piv[s], C) if piv else None
        if P_.get('recortar_globo', True):
            delta, n_borr = _recortar_en_globo(cara, basis, C, lim, cara_m & (r < 0.034 * E),
                                               None if ej is None else ej + P_['holgura'] * E)
        else:
            delta, n_borr = np.zeros_like(basis), 0
        # 0.8.3 (Ichigo): el recorte quita décimas (el borde de Tripo apenas roza el globo). Milímetros = el globo está
        # por delante del párpado; recortar abriría la base y todas las expresiones saldrían con exoftalmos
        mov_max = float(np.linalg.norm(delta, axis=1).max()) if delta.any() else 0.0
        if mov_max > 0.002 * E:
            raise RuntimeError(f'Ojo {s}: el globo atraviesa el párpado {mov_max * 1000:.1f} mm. No se toca la base: '
                               f'retrasa ojo.{s} / {cara.name}_OjoPivote_{s} (o rehaz desde detectar) y repite.')
        if n_borr or delta.any():
            mover_base(delta)
            rel = basis - C; r = np.linalg.norm(rel, axis=1)
            beta = np.degrees(np.arctan2(rel[:, 2], -rel[:, 1]))
        recorte = {'movidos': int((np.abs(delta).sum(1) > 0).sum()), 'caras_borradas': n_borr}
        # rabillos: el giro se apaga desde unos mm DENTRO de la abertura (si baja entero hasta la esquina, la piel
        # de al lado queda quieta y se dobla al cerrar: pliegue en lagrimal y rabillo, Gómez)
        fuera = np.maximum(x_in - xl, xl - x_out)
        fx = 1 - util.ss(-P_['rabillo'] * E, P_['rabillo_ancho'] * E, fuera)
        # Párpado grueso (Gómez: un rollo que llega a 25–27 mm del centro): con un radio fijo el frente del rollo
        # se quedaba sin peso (bulto y muesca al cerrar) y con un radio amplio bajaba la cuenca entera. Si la malla
        # tiene hueco, los pesos van por distancia geodésica desde su borde (lo que es párpado baja entero).
        borde = _borde_hueco(me, basis, cara_m, C, 0.04 * E, excluir_caras)
        R1 = 0.034 * E
        if len(borde) >= 12:
            Dg = util.geodesica(basis, nb_g, borde, 0.03 * E)
            lim_g = (P_['geo_rigido'] + P_['geo_estira']) * E
            fr = np.ones(n)
            zona = cara_m & (rel[:, 1] < 0.005 * E) & (Dg < lim_g)
            R1 = float(r[zona].max()) if zona.any() else R1
        else:
            Dg = None
            fr = 1 - util.ss(0.026 * E, 0.034 * E, r)
            zona = cara_m & (rel[:, 1] < 0.005 * E) & (r < 0.034 * E)
        # selección a mano (cfg['parpado_sel_L'], del ojo L; el R en espejo): lo marcado baja entero y la piel de
        # alrededor se estira por distancia geodésica a la selección. Gómez: el usuario añadió los rabillos.
        sel_m = _seleccion_lado(cfg, basis, s, n, M.cx)
        if sel_m is not None:
            Ds = util.geodesica(basis, nb_g, np.where(sel_m)[0], 0.03 * E)
            zona = cara_m & (rel[:, 1] < 0.005 * E) & (sel_m | (Ds < max(P_['geo_estira'], P_['geo_inf_estira']) * E))
            fx = np.ones(n); fr = np.ones(n)
        else:
            sel_m = np.zeros(n, bool)
        # pestañas en islas sueltas (Camilo): la geodésica desde el hueco no llega a ellas; entran por cercanía
        pest_isla = (pest_sup | pest_inf) & (r < 0.04 * E) & ~zona
        zona |= pest_isla
        pest = pest_sup | pest_inf | sel_m
        base = np.where(zona, np.where(pest, 1.0, fx * fr), 0.0)
        # la ceja (también la pegada a la piel) no baja con el párpado: se frena la zona que se estira cerca
        # de la ceja, nunca el borde rígido (las pestañas de Tripo quedan a pocos mm de la ceja: salían picos)
        rig_ = P_['sup_rigido']
        m_ceja = np.maximum(util.ss(0.0015 * E, 0.006 * E, d_ceja), 1 - util.ss(rig_, rig_ + 4, beta - bu))
        base = base * np.where((beta >= bmid) & ~sel_m & ~pest_isla, m_ceja, 1.0)
        base = base * util.ss(0.0005 * E, 0.003 * E, d_peg)     # la ceja pegada, entera y quieta (más ancho ondula las pestañas)
        sup = np.where(pest_sup, True, np.where(pest_inf, False, beta >= bmid))
        if sel_m.any():
            gs = np.where(sel_m, 1.0, 1 - util.ss(0, P_['geo_estira'] * E, Ds))
            gi = np.where(sel_m, 1.0, 1 - util.ss(0, P_['geo_inf_estira'] * E, Ds))
        elif Dg is not None:
            gs = 1 - util.ss(P_['geo_rigido'] * E, (P_['geo_rigido'] + P_['geo_estira']) * E, Dg)
            gi = 1 - util.ss(P_['geo_inf_rigido'] * E, (P_['geo_inf_rigido'] + P_['geo_inf_estira']) * E, Dg)
        else:
            gs = 1 - util.ss(P_['sup_rigido'], P_['sup_rigido'] + P_['sup_estira'], beta - bu)
            gi = 1 - util.ss(P_['inf_rigido'], P_['inf_rigido'] + P_['inf_estira'], bl - beta)
        ED = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ED); ED = ED.reshape(-1, 2)
        g_ = cara_m & (r < R1 + 0.002 * E) & (rel[:, 1] < 0.006 * E)
        # 0.6.0 (Lian, como Serena): el párpado superior es una pieza RÍGIDA desde el borde hasta el pliegue que lo
        # separa de la ceja (medido con rayos); solo se estira el pliegue. Con los pesos geodésicos desde el hueco el
        # borde (la banda de pestañas) bajaba entero y la piel de encima a la mitad: pestaña y párpado se separaban,
        # y la ceja pegada a 3 mm del borde bajaba con ellos. Lo que está por encima del pliegue Y por delante del
        # fondo del valle (la ceja) no gira; el forro de detrás sí, o atravesaría el globo al cerrar. (El párpado
        # sobresale más que el valle: un límite por radio frenaba también su piel y asomaba el globo.)
        pl = _pliegue(bvh, C, sx, cols, E, R_EYE) if (P_.get('pliegue', True) and not sel_m.any()) else None
        if pl is not None:
            # el pliegue nunca por debajo del borde (en el lagrimal la medida caía a −9°: V rota bajo la ceja)
            b_c = np.maximum(np.interp(xl, pl[0], pl[1]), bu + 4.0); y_c = np.interp(xl, pl[0], pl[2])
            q = (util.ss(0.0, P_['pliegue_ancho'], beta - b_c)
                 * util.ss(0.0005 * E, 0.0025 * E, y_c - rel[:, 1]))
            gs = 1.0 - q
            recorte['pliegue_grados'] = [round(float(np.min(pl[1])), 1), round(float(np.max(pl[1])), 1)]
        f_sup = np.where(sup, np.where(pest_sup, 1.0, gs), 0.0) * base
        f_inf = np.where(~sup, gi, 0.0) * base
        f_sup = _alisar_pesos(f_sup, ED, g_ & sup, pest_sup | (f_sup > 0.995), P_['alisar'])
        f_inf = _alisar_pesos(f_inf, ED, g_ & ~sup, pest_inf | (f_inf > 0.995), P_['alisar'])
        if pl is not None:
            recorte['ceja_quieta_v'] = int((sup & zona & (f_sup < 0.05)).sum())
        # pestañas (material propio o islas sueltas): el MISMO peso que el borde del párpado al que pertenecen,
        # copiado por franjas de x (perfil del borde: máximo de la piel de ese párpado, alisado). Con peso 1 fijo
        # bajaban más que el borde en los rabillos y se separaban; vértice a vértice salía en zigzag (Camilo).
        for pm, f_, g2 in ((pest_sup | pest_isla, f_sup, sup), (pest_inf & ~pest_isla, f_inf, ~sup)):
            if not pm.any(): continue
            piel_s = cara_m & ~pm & g2 & (f_ > 0)
            if not piel_s.any(): continue
            bins = np.arange(xl[pm].min() - 0.001 * E, xl[pm].max() + 0.001 * E, 0.0005 * E)
            prof = np.array([f_[piel_s & (np.abs(xl - b) < 0.0005 * E)].max(initial=0.0) for b in bins])
            prof = _media_movil(prof, 2)
            f_[:] = np.where(pm, np.interp(xl, bins, prof), f_)
        if pest_isla.any():
            f_inf = np.where(pest_isla, 0.0, f_inf)
            pest_islas_tot |= pest_isla
        K, SOL, ENT = P_['cierre_k'], P_['solape'], P_['entornar']
        op = bu - bl
        a_sup = ((1 - K) * op + SOL) * f_sup - K * op * f_inf
        a_inf = ENT * op * f_inf
        if P_['modo'] == 'huesos':
            HUESOS[s] = {'C': C, 'sx': sx, 'xs': xs, 'bu': np.asarray(bu_t), 'bl': np.asarray(bl_t),
                         'f_sup': f_sup, 'f_inf': f_inf, 'xl': xl, 'R': R_EYE, 'rel': rel.copy()}
        else:
            for k in range(1, PASOS + 1):
                nueva(f'parp_sup.{s}_{k}', girar(rel, a_sup * k / PASOS) - rel)
            for k in (1, 2):
                nueva(f'parp_inf.{s}_{k}', girar(rel, -a_inf * k / 2) - rel)
            corr = (girar(rel, ((1 - ENT) * op + SOL) * f_sup) - girar(rel, ((1 - K) * op + SOL) * f_sup)
                    + rel - girar(rel, -K * op * f_inf))
            nueva(f'parp_corr.{s}', corr)
            f_ab = np.where(sup, 1 - util.ss(4, 18, beta - bu), 0.0) * base
            nueva(f'parp_abrir.{s}', girar(rel, -P_['abrir'] * f_ab) - rel)

        # --- cejas
        ax = np.abs(basis[:, 0] - M.cx)
        seed = cfg.get('cejas', {}).get(s, -1) if not uv_region_map else -1
        if uv_region_map:
            cb = MR.por_lado(ceja_uv_all, basis[:, 0], M.cx, sx)
            anc = basis[cb]
            if not len(anc):
                # Sin región UV para este lado, mantener ceja virtual heredada; no inferir por proximidad.
                cb = np.zeros(n, bool)
                pts = []
                for t in np.linspace(0, 1, 14):
                    x = C[0] + sx * (-0.0124 + 0.039 * t) * E
                    h = bvh.ray_cast(Vector((x, C[1] - 1.0, C[2] + 0.020 * E)), Vector((0, 1, 0)))
                    if h[0] is not None: pts.append(np.array(h[0]))
                anc = np.array(pts)
            xmin, xmax = np.abs(anc[:, 0] - M.cx).min(), np.abs(anc[:, 0] - M.cx).max()
        elif seed is not None and seed >= 0:
            cb = isl == isl[seed]
            anc = basis[cb]; xmin, xmax = np.abs(anc[:, 0] - M.cx).min(), np.abs(anc[:, 0] - M.cx).max()
        elif pegada and pegada[0] == s:
            cb = np.zeros(n, bool); cb[pegada[1]] = True
            anc = basis[cb]; xmin, xmax = np.abs(anc[:, 0] - M.cx).min(), np.abs(anc[:, 0] - M.cx).max()
        else:
            cb = np.zeros(n, bool)
            pts = []
            for t in np.linspace(0, 1, 14):
                x = C[0] + sx * (-0.0124 + 0.039 * t) * E
                h = bvh.ray_cast(Vector((x, C[1] - 1.0, C[2] + 0.020 * E)), Vector((0, 1, 0)))
                if h[0] is not None: pts.append(np.array(h[0]))
            anc = np.array(pts); xmin, xmax = np.abs(anc[:, 0] - M.cx).min(), np.abs(anc[:, 0] - M.cx).max()
        if len(anc) == 0:
            # Evita salir del ciclo de ojo sin registrar sus huesos/controladores.
            anc = np.array([C.copy()])
            xmin = xmax = abs(float(C[0]) - M.cx)
        kd_c = kdtree.KDTree(len(anc))
        for j, p in enumerate(anc): kd_c.insert(Vector(p), j)
        kd_c.balance()
        idx_p = np.where(cara_m)[0]
        kd_p = util.kd_de(basis, idx_p)
        u = np.zeros(n); w = np.zeros(n); nrm = np.zeros((n, 3))
        for i in np.where(cb)[0]:
            u[i] = (ax[i] - xmin) / max(xmax - xmin, 1e-9); w[i] = 1
            nrm[i] = normales[kd_p.find(Vector(basis[i]))[1]]
        piel = cara_m & (sx * (basis[:, 0] - M.cx) > -0.004 * E)
        for i in np.where(piel)[0]:
            co, j, d = kd_c.find(Vector(basis[i]))
            if d > 0.014 * E: continue
            u[i] = (abs(anc[j][0] - M.cx) - xmin) / max(xmax - xmin, 1e-9)
            arriba = basis[i, 2] > anc[j][2]
            w[i] = 1 - util.ss(0.002 * E, 0.013 * E, d) if arriba else 1 - util.ss(0.0015 * E, 0.009 * E, d)
            nrm[i] = normales[i]
        Z = np.array([0, 0, 1.0]); X = np.array([-sx, 0, 0.0])
        def tang(v):
            t = v - (nrm @ v)[:, None] * nrm
            Ln = np.linalg.norm(t, axis=1); Ln[Ln == 0] = 1
            return t / Ln[:, None]
        w_in = w * (1 - util.ss(0.15, 0.85, u)); w_out = w * util.ss(0.15, 0.85, u)
        CEJA_IN, CEJA_OUT, JUNTAR = 0.005 * E, 0.004 * E, 0.002 * E
        nueva(f'ceja_in.{s}', CEJA_IN * w_in[:, None] * tang(Z), -1)
        nueva(f'ceja_out.{s}', CEJA_OUT * w_out[:, None] * tang(Z), -1)
        nueva(f'ceja_juntar.{s}', JUNTAR * w_in[:, None] * tang(X))

        # --- mejilla
        cand = np.where(cara_m & (basis[:, 1] < C[1] - 0.0076 * E))[0]
        tx, tz = C[0] + sx * 0.0071 * E, C[2] - 0.0191 * E
        c0 = cand[np.argmin(np.hypot(basis[cand, 0] - tx, basis[cand, 2] - tz))]
        d = np.linalg.norm(basis - basis[c0], axis=1)
        com = np.array([M.cx + sx * abs(M.comisura.x - M.cx), M.comisura.y, M.comisura.z])
        dm = np.linalg.norm(basis - com, axis=1)
        wm = np.where(cara_m, (1 - util.ss(0.003 * E, 0.014 * E, d)) * util.ss(M.L(0.010), M.L(0.018), dm), 0.0)
        nueva(f'mejilla.{s}', wm[:, None] * (np.array([sx * 0.0003, -0.0006, 0.0022]) * E))
        if cb.any() and seed is not None and seed >= 0:
            _pegar_islas(cara, basis, cara_m, cb, [f'ceja_in.{s}', f'ceja_out.{s}', f'ceja_juntar.{s}', f'mejilla.{s}'])
        CTRL_R[s] = (C, E)
        info[s] = {'abertura_x_mm': [round(x_in * 1000, 1), round(x_out * 1000, 1)], 'borde_hueco_v': len(borde), 'giro_sup_max': round(float(a_sup.max()), 1),
                   'pestanas_v': int((pest & zona).sum()), 'borde_fuera_globo': recorte,
                   'ceja': ('pegada' if pegada and pegada[0] == s else 'isla') if cb.any() else 'virtual'}
    d_ = MK.cfg(cara)
    d_['abertura_mm'] = {s: v['abertura_x_mm'] for s, v in info.items() if 'abertura_x_mm' in v}
    d_['parpados_mascaras'] = {'pestanas': pest_source, 'cejas': brow_source,
                               'uv_trace': cara.get('rlb_regiones_uv', '') if uv_region_map else ''}
    MK.guardar_cfg(cara, d_)
    if not CTRL_R:
        return info
    E = np.mean([v[1] for v in CTRL_R.values()])
    CE_IN, CE_OUT, JU = 0.005 * E, 0.004 * E, 0.002 * E
    CLOSE, WIDE, SQ, CH = 0.004 * E, 0.0015 * E, 0.002 * E, 0.0022 * E
    CTRL = {'parpado': ((0.0, -0.034, 0.013), (-CLOSE, WIDE), False),
            'parpado_inf': ((0.0, -0.032, -0.012), (0.0, SQ), False),
            'ceja_in': ((-0.009, -0.035, 0.024), (-CE_IN, CE_IN), True),
            'ceja_out': ((0.015, -0.028, 0.023), (-CE_OUT, CE_OUT), False),
            'mejilla': ((0.008, -0.036, -0.021), (0.0, CH), False)}
    util.activar(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for nm in list(eb.keys()):
        if nm.split('.')[0] in CTRL and nm.endswith(('.L', '.R')): eb.remove(eb[nm])
    for s, (C, Es) in CTRL_R.items():
        sx = 1 if s == 'L' else -1
        for nm, (off, rng, libre_x) in CTRL.items():
            b = eb.new(f'{nm}.{s}')
            b.head = (C[0] + sx * off[0] * E, C[1] + off[1] * E, C[2] + off[2] * E)
            b.tail = b.head + Vector((0, 0, 0.004 * E))
            b.roll = 0; b.parent = eb['cabeza']; b.use_deform = False
            b.bbone_x = b.bbone_z = 0.001 * E
    bpy.ops.object.mode_set(mode='POSE')
    col = rig.data.collections_all['Controles']
    for s in CTRL_R:
        sx = 1 if s == 'L' else -1
        for nm, (off, rng, libre_x) in CTRL.items():
            pb = rig.pose.bones[f'{nm}.{s}']
            col.assign(pb.bone)
            util.color_hueso(pb.bone, (0.95, 0.15, 0.15))
            for c in list(pb.constraints): pb.constraints.remove(c)
            pb.rotation_mode = 'XYZ'
            pb.lock_location = (not libre_x, False, True)
            pb.lock_rotation = (True, True, True); pb.lock_rotation_w = True; pb.lock_scale = (True, True, True)
            c = pb.constraints.new('LIMIT_LOCATION'); c.owner_space = 'LOCAL'; c.use_transform_limit = True
            c.use_min_y = c.use_max_y = True; c.min_y, c.max_y = rng
            if libre_x:
                c.use_min_x = c.use_max_x = True
                c.min_x, c.max_x = (-JU, 0) if sx == 1 else (0, JU)
    bpy.ops.object.mode_set(mode='OBJECT')

    def drv(key, expr, bone, canal='LOC_Y', extra=None):
        vs = [('v', bone, canal)] + ([extra] if extra else [])
        util.driver_transform(kb[key], 'value', expr, rig, vs)
    for s in CTRL_R:
        sx = 1 if s == 'L' else -1
        if not HUESOS:
            c = f'clamp(-v/{CLOSE:.6g},0,1)'
            for k in range(1, PASOS):
                drv(f'parp_sup.{s}_{k}', f'max(0,1-abs({c}*{PASOS}-{k}))', 'parpado.' + s)
            drv(f'parp_sup.{s}_{PASOS}', f'clamp({c}*{PASOS}-{PASOS - 1},0,1)', 'parpado.' + s)
            drv('parp_abrir.' + s, f'clamp(v/{WIDE:.6g},0,1)', 'parpado.' + s)
            c = f'clamp(v/{SQ:.6g},0,1)'
            drv(f'parp_inf.{s}_1', f'max(0,1-abs({c}*2-1))', 'parpado_inf.' + s)
            drv(f'parp_inf.{s}_2', f'clamp({c}*2-1,0,1)', 'parpado_inf.' + s)
        # la ceja acompaña al ojo: baja un poco al cerrar y al entornar, sube al abrir mucho
        acomp = (f'-{P_["ceja_cierre"]}*clamp(-p/{CLOSE:.6g},0,1)+{P_["ceja_abrir"]}*clamp(p/{WIDE:.6g},0,1)'
                 f'-{P_["ceja_entornar"]}*clamp(q/{SQ:.6g},0,1)')
        for cj, rng in (('ceja_in', CE_IN), ('ceja_out', CE_OUT)):
            util.driver_transform(kb[f'{cj}.{s}'], 'value', f'clamp(v/{rng:.6g}{acomp},-1,1)', rig,
                                  [('v', f'{cj}.{s}', 'LOC_Y'), ('p', 'parpado.' + s, 'LOC_Y'),
                                   ('q', 'parpado_inf.' + s, 'LOC_Y')])
        drv('ceja_juntar.' + s, f'clamp({"-" if sx == 1 else ""}v/{JU:.6g},0,1)', 'ceja_in.' + s, 'LOC_X')
        drv('mejilla.' + s, f'clamp(v/{CH:.6g},0,1)', 'mejilla.' + s)
        if not HUESOS:
            drv('parp_corr.' + s, f'clamp(-v/{CLOSE:.6g},0,1)*clamp(w/{SQ:.6g},0,1)', 'parpado.' + s,
                extra=('w', 'parpado_inf.' + s, 'LOC_Y'))
    if HUESOS:
        info['huesos'] = PH.construir(cara, rig, HUESOS, {'CLOSE': CLOSE, 'WIDE': WIDE, 'SQ': SQ}, E, P_)
        if piv: PH.mirada_globos(rig, piv)
        if uv_region_map and pest_sup_all.any():
            # El primer contacto necesita el mapa de raíces antes de construir sus correctivas.
            from . import pestanas_uv as PUV
            info['pestanas_uv'] = PUV.sincronizar(cara, rig, keys=[])
        # bordes en contacto real al cerrar (correctiva parp_contacto + drivers con el inferior subido)
        if P_.get('contacto', True):
            from . import contacto
            info['contacto'] = contacto.construir(cara, rig, M, P_)
            if pest_islas_tot.any() and not uv_region_map:
                _pegar_islas(cara, util.coords(me), cara_m & ~pest_islas_tot, pest_islas_tot,
                             [f'parp_contacto.{s}' for s in CTRL_R])
    # ojos con la cabeza y globo que se aplana un poco al cerrar (el iris no asoma)
    if piv:
        raiz_n = cfg.get('ojos_raiz')
        raiz = bpy.data.objects.get(raiz_n) if raiz_n else None
        if raiz is not None:
            c = next((c for c in raiz.constraints if c.type == 'CHILD_OF'), None) or raiz.constraints.new('CHILD_OF')
            c.target = rig; c.subtarget = 'cabeza'
            bpy.context.view_layer.update()
            c.inverse_matrix = (rig.matrix_world @ rig.data.bones['cabeza'].matrix_local).inverted()
        for s in CTRL_R:
            p = piv[s]
            if 'rlb_escala' not in p: p['rlb_escala'] = p.scale[1]
            p.driver_remove('scale', 1)
            if uv_region_map and P_.get('recortar_globo') is False:
                # Con UV, la piel cierra sobre el globo real; no aplanar el ojo.
                p.scale[1] = p['rlb_escala']
                continue
            fc = p.driver_add('scale', 1); d = fc.driver; d.type = 'SCRIPTED'
            v = d.variables.new(); v.name = 'v'; v.type = 'TRANSFORMS'
            t = v.targets[0]; t.id = rig; t.bone_target = 'parpado.' + s; t.transform_type = 'LOC_Y'; t.transform_space = 'LOCAL_SPACE'
            v2 = d.variables.new(); v2.name = 'e'; v2.type = 'SINGLE_PROP'
            v2.targets[0].id = p; v2.targets[0].data_path = '["rlb_escala"]'
            # solo al final del cierre: a medio parpadeo el iris tiene que seguir por fuera del borde del párpado
            d.expression = f'e*(1-0.06*clamp((-v/{CLOSE:.6g}-0.6)/0.4,0,1))'
    info['escala_ojo'] = round(float(E), 3)
    return info


# ------------------------------------------------------------------ ajuste de iris y pupila
# Cada personaje tiene su tamaño de iris. De la imagen de referencia (de frente) se miden dos proporciones:
#   iris   = ancho del iris / ancho de la abertura del ojo (de lagrimal a rabillo)   (Vale ≈ 0.85)
#   pupila = ancho de la pupila / ancho del iris                                     (Vale ≈ 0.70)
# Iris, pupila y brillos son casquetes sobre el globo: se escalan en ÁNGULO alrededor del eje de la mirada
# (siguen pegados a la esfera). Siempre se parte de la forma original (atributo rlb_co0): repetible.
def _casquete(o):
    me = o.data
    if 'rlb_co0' not in me.attributes:
        a = me.attributes.new('rlb_co0', 'FLOAT_VECTOR', 'POINT')
        co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); a.data.foreach_set('vector', co)
    co = np.zeros(len(me.vertices) * 3); me.attributes['rlb_co0'].data.foreach_get('vector', co)
    Mx = np.array(o.matrix_parent_inverse) @ np.array(o.matrix_basis)      # objeto -> espacio del pivote
    q = co.reshape(-1, 3) @ Mx[:3, :3].T + Mx[:3, 3]
    return me, Mx, q


def _escala_angular(q, k):
    r = np.linalg.norm(q, axis=1); d = q / r[:, None]
    th = np.arccos(np.clip(-d[:, 1], -1, 1))
    lat = np.c_[d[:, 0], d[:, 2]]; ln = np.linalg.norm(lat, axis=1); ln[ln == 0] = 1; lat /= ln[:, None]
    th2 = th * k
    return r[:, None] * np.c_[lat[:, 0] * np.sin(th2), -np.cos(th2), lat[:, 1] * np.sin(th2)]


def ajustar_iris(cara, iris=None, pupila=None):
    """iris / pupila: proporciones medidas en la imagen de referencia (None = las de Vale)."""
    n = MK.nombres(cara); d = MK.cfg(cara)
    ab = d.get('abertura_mm', {})
    out = {}
    for s in ('L', 'R'):
        piv = bpy.data.objects.get(n['piv_' + s])
        obs = {k: bpy.data.objects.get(f'{cara.name}_{k}_{s}') for k in ('Eyeball', 'Iris', 'Pupil', 'Highlight_1', 'Highlight_2')}
        if piv is None or obs['Iris'] is None:
            continue
        _, _, qe = _casquete(obs['Eyeball'])
        Rg = float(np.percentile(np.linalg.norm(qe, axis=1), 90)) * piv.matrix_world.to_scale()[1]
        _, _, qi = _casquete(obs['Iris']); _, _, qp = _casquete(obs['Pupil'])
        ang = lambda q: float(np.arccos(np.clip(-(q[:, 1] / np.linalg.norm(q, axis=1)), -1, 1)).max())
        a_i0, a_p0 = ang(qi), ang(qp)
        W = (ab[s][1] - ab[s][0]) / 1000 if s in ab else 2 * Rg * math.sin(a_i0) / 0.85
        a_i = math.asin(min(0.97, iris * W / 2 / Rg)) if iris else a_i0
        a_p = math.asin(min(0.97, (pupila if pupila else math.sin(a_p0) / math.sin(a_i0)) * math.sin(a_i))) if (iris or pupila) else a_p0
        for k, kk in (('Iris', a_i / a_i0), ('Pupil', a_p / a_p0), ('Highlight_1', a_i / a_i0), ('Highlight_2', a_i / a_i0)):
            o = obs[k]
            if o is None: continue
            me, Mx, q = _casquete(o)
            if k.startswith('Highlight'):       # brillos: se mueven con el iris, sin cambiar de tamaño
                c = q.mean(0); q2 = q - c + _escala_angular(c[None], kk)[0]
            else:
                q2 = _escala_angular(q, kk)
            Mi = np.linalg.inv(Mx)
            me.vertices.foreach_set('co', (q2 @ Mi[:3, :3].T + Mi[:3, 3]).ravel()); me.update()
        out[s] = {'iris_grados': round(math.degrees(a_i), 1), 'pupila_grados': round(math.degrees(a_p), 1),
                  'abertura_mm': round(W * 1000, 1), 'iris_mm': round(2 * Rg * math.sin(a_i) * 1000, 1)}
    d['iris'] = {'iris': iris, 'pupila': pupila}; MK.guardar_cfg(cara, d)
    return out


# ------------------------------------------------------------------ superficie real del ojo
# Globo, córnea, iris… en reposo y en coordenadas de la cara. Sirve para esferas, elipsoides (Camilo) y córneas
# abombadas: la distancia del centro a la superficie se mide con rayos, no con un radio.
class Reposo:
    """rig en reposo y sin acción mientras se mide o se construye (la acción de gestos mueve los controles)."""
    def __init__(self, rig): self.rig = rig

    def __enter__(self):
        ad = self.rig.animation_data if self.rig else None
        self.act = ad.action if ad else None
        if self.act: ad.action = None
        if self.rig: util.pose_reposo(self.rig)
        bpy.context.view_layer.update()
        return self

    def __exit__(self, *a):
        if self.rig:
            util.pose_reposo(self.rig)
            if self.act: self.rig.animation_data.action = self.act
        bpy.context.view_layer.update()


def superficie_ojo(cara, p):
    """-> (C, bvh) del ojo colgado del pivote p, en coordenadas locales de la cara."""
    dg = bpy.context.evaluated_depsgraph_get()
    Mi = cara.matrix_world.inverted()
    V, F = [], []
    for o in p.children_recursive:
        if o.type != 'MESH': continue
        oe = o.evaluated_get(dg); me = oe.to_mesh()
        mw = Mi @ o.matrix_world
        b = len(V)
        V += [mw @ v.co for v in me.vertices]
        F += [[b + i for i in pl.vertices] for pl in me.polygons]
        oe.to_mesh_clear()
    return np.array(Mi @ p.matrix_world.translation), BVHTree.FromPolygons(V, F)


def radio_ojo(bvh, C, dirs, R):
    """distancia del centro a la superficie EXTERIOR del ojo en cada dirección (rayo desde fuera hacia el centro);
    donde no hay ojo (globo abierto por detrás) vale el radio R."""
    Cv = Vector(C); out = np.empty(len(dirs))
    for i, d in enumerate(dirs):
        d = Vector(d).normalized()
        h = bvh.ray_cast(Cv + d * 3 * R, -d, 3 * R)
        out[i] = (h[0] - Cv).length if h[0] is not None else R
    return out


# ------------------------------------------------------------------ lente de oclusión (como CC_Base_EyeOcclusion)
# Malla de anillos delante del globo que cubre la abertura del ojo, con el borde metido bajo los párpados. Lleva los
# pesos y las shape keys de la piel que tiene delante (rayo desde el centro del ojo): cada vértice gira igual que la
# piel de delante, así que baja con el párpado y nunca lo atraviesa. Personajes estilizados: nada de AO suave; la
# textura es una BANDA de contacto plana (más ancha arriba y en los rabillos, fina abajo) y alfa 0 en el centro.
# BLENDED, sin sombras, backface culling; la textura va empaquetada y exporta a GLB (alphaMode BLEND).
# banda_*: ancho de la banda más allá del borde, en unidades de v (1/6 = del borde al anillo 0,93·r)
OCL = {'anillos': 7, 'segmentos': 13, 'separacion': 0.0008, 'bajo_parpado': 0.0025, 'color': (0.08, 0.02, 0.015),
       'banda_arriba': 0.12, 'banda_abajo': 0.03, 'banda_rabillo': 0.08, 'alfa_arriba': 0.8, 'alfa_abajo': 0.45}


def _textura_oclusion(nombre, P_):
    W, H = 64, 32
    u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
    th = 2 * np.pi * u                        # 0 rabillo, π/2 arriba, π lagrimal, 3π/2 abajo (igual en los dos ojos)
    arriba = np.maximum(np.sin(th), 0) ** 1.5; rab = np.abs(np.cos(th)) ** 6
    borde = 2 / 6 + P_['banda_abajo'] + (P_['banda_arriba'] - P_['banda_abajo']) * arriba + P_['banda_rabillo'] * rab
    alfa = P_['alfa_abajo'] + (P_['alfa_arriba'] - P_['alfa_abajo']) * arriba
    # v = 0 en el anillo de fuera (bajo el párpado) y 1 en el centro; corte casi duro (plano, no degradado de AO)
    a = alfa[None, :] * (1 - util.ss(borde[None, :] - 0.03, borde[None, :] + 0.03, v[:, None]))
    px = np.zeros((H, W, 4), np.float32); px[..., :3] = P_['color']; px[..., 3] = a
    im = bpy.data.images.get(nombre)
    if im is None or tuple(im.size) != (W, H):
        if im: bpy.data.images.remove(im)
        im = bpy.data.images.new(nombre, W, H, alpha=True)
    im.pixels[:] = px.ravel(); im.update(); im.pack()
    return im


def _material_oclusion(nombre, im, color):
    m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (400, 0)
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); bs.location = (100, 0)
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.location = (-250, 0); tx.image = im; tx.extension = 'EXTEND'
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    nt.links.new(tx.outputs['Alpha'], bs.inputs['Alpha'])
    nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    bs.inputs['Roughness'].default_value = 1.0
    if 'Specular IOR Level' in bs.inputs: bs.inputs['Specular IOR Level'].default_value = 0.0
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = True
    if hasattr(m, 'use_transparent_shadow'): m.use_transparent_shadow = True
    m.diffuse_color = (*color, 0.0)          # Solid / Workbench: invisible (si no, tapa el ojo entero)
    return m


def _copiar_driver(src, owner, path):
    fc = owner.driver_add(path); d = fc.driver; s = src.driver
    d.type = s.type; d.use_self = s.use_self
    for v in s.variables:
        nv = d.variables.new(); nv.name = v.name; nv.type = v.type
        for t, nt in zip(v.targets, nv.targets):
            if v.type == 'SINGLE_PROP': nt.id_type = t.id_type
            nt.id = t.id; nt.data_path = t.data_path; nt.bone_target = t.bone_target
            nt.transform_type = t.transform_type; nt.transform_space = t.transform_space
            nt.rotation_mode = t.rotation_mode
    d.expression = s.expression
    if len(src.keyframe_points):
        for m in list(fc.modifiers): fc.modifiers.remove(m)
        for k in src.keyframe_points:
            nk = fc.keyframe_points.insert(k.co[0], k.co[1]); nk.interpolation = k.interpolation
    return fc


def oclusion(cara, rig, M, par=None):
    from mathutils.interpolate import poly_3d_calc
    P_ = dict(OCL, **(par or {}))
    util.modo_objeto()
    piv = _pivotes(cara, M)
    if not piv:
        raise RuntimeError('La lente de oclusión necesita los ojos (paso 7)')
    me = cara.data; n = len(me.vertices)
    NA, NS = int(P_['anillos']), int(P_['segmentos'])
    nm_mat = f'{cara.name}_Oclusion'
    mat = _material_oclusion(nm_mat, _textura_oclusion(nm_mat + '_tex', P_), P_['color'])
    info = {}
    with Reposo(rig):
        P = util.coords(me)
        cara_m, isl = medidas.cara_mask(cara, M)
        piel_m = isl == isl[M.cfg['seed']]               # con la cuenca: su margen también va delante de la lente
        excluir_caras = _caras_ocultas_uv(me)
        polys = [tuple(p.vertices) for i, p in enumerate(me.polygons)
                 if piel_m[p.vertices[0]] and (excluir_caras is None or not excluir_caras[i])]
        bvh_p = BVHTree.FromPolygons([Vector(c) for c in P], polys)
        kb = me.shape_keys.key_blocks if me.shape_keys else []
        KEYS = {}
        for k in kb:
            if k == me.shape_keys.reference_key: continue
            co = np.zeros(n * 3); k.data.foreach_get('co', co); KEYS[k.name] = co.reshape(-1, 3) - P
        ad = me.shape_keys.animation_data if me.shape_keys else None
        drv = {fc.data_path: fc for fc in (ad.drivers if ad else [])}
        for s in ('L', 'R'):
            sx = 1 if s == 'L' else -1
            nombre = f'{cara.name}_Oclusion_{s}'
            util.borrar_objeto(nombre)
            C, bvh_o = superficie_ojo(cara, piv[s])
            R = M.ojo(s)[1]; E = R / MK.R_OJO_V
            borde = _borde_abertura(me, P, cara_m, C, 0.04 * E, excluir_caras)
            if len(borde) < 6:
                info[s] = 'sin borde de hueco'; continue
            # contorno de la abertura TAL COMO SE VE de frente, en polares alrededor de su centro (x espejada en R): por
            # cada ángulo, rayos de frente hacia fuera hasta que la piel tapa el ojo. Con los vértices del borde, el de
            # Camilo (que se mete por una rendija en el rabillo) daba anillos fuera del globo y la lente se plegaba.
            Cv = Vector(C)
            th = np.arange(NS) * 2 * np.pi / NS
            q = P[borde]; c2 = np.array([q[:, 0].mean(), q[:, 2].mean()])

            def frente(X, Z):
                """-> (se ve el ojo, hay ojo) en el punto (X, Z) visto de frente."""
                o = Vector((X, C[1] - 3 * R, Z)); dv = Vector((0, 1, 0))
                ho = bvh_o.ray_cast(o, dv, 6 * R)
                if ho[0] is None: return False, False
                hp = bvh_p.ray_cast(o, dv, 6 * R)
                return hp[0] is None or hp[3] > ho[3], True
            paso = 0.0002 * E
            for _ in range(2):                          # el centro se recalcula con el contorno medido
                rb = np.zeros(NS); rs = np.zeros(NS)
                for j in range(NS):
                    cx, cz = sx * math.cos(th[j]), math.sin(th[j])
                    r_, vis_ok = 0.0, True
                    while r_ < 2 * R:
                        r_ += paso
                        vis, hay = frente(c2[0] + cx * r_, c2[1] + cz * r_)
                        if vis_ok and not vis: rb[j] = r_ - paso; vis_ok = False
                        if not hay: break
                    rs[j] = r_ - paso                   # silueta del ojo en esa dirección
                    if vis_ok: rb[j] = rs[j]
                pts = np.c_[c2[0] + sx * rb * np.cos(th), c2[1] + rb * np.sin(th)]
                c2 = pts.mean(0)
            rb = np.maximum((np.roll(rb, 1) + 2 * rb + np.roll(rb, -1)) / 4, paso)
            rb = np.minimum(rb, rs - 0.5 * paso)

            def dir_frente(X, Z):
                h = bvh_o.ray_cast(Vector((X, C[1] - 3 * R, Z)), Vector((0, 1, 0)), 6 * R)
                return None if h[0] is None else np.array((h[0] - Cv).normalized())
            # anillos en ÁNGULO sobre el ojo (como la cuenca): desde el eje de la abertura hacia fuera; los de fuera se
            # alejan del borde 'ext' por la superficie, bajo el párpado. Proyectados de frente, en el rabillo (abertura
            # casi en la silueta del globo) caían por el borde del ojo y la lente se plegaba en picos.
            a = dir_frente(*c2)
            if a is None: a = np.array((0.0, -1.0, 0.0))
            ext = float(np.clip(P_['bajo_parpado'] * E, 0.001, 0.003))
            FRAC = [None, None, 1.0, 0.93, 0.85, 0.6, 0.3][:NA]          # fracción del ángulo del borde (anillos 2…)
            D = np.zeros((NA, NS, 3)); RO = np.zeros((NA, NS)); G = np.zeros((NA, NS))
            for j in range(NS):
                cx, cz = sx * math.cos(th[j]), math.sin(th[j])
                d_b = dir_frente(c2[0] + cx * rb[j], c2[1] + cz * rb[j])
                if d_b is None: d_b = dir_frente(c2[0] + cx * (rs[j] - paso), c2[1] + cz * (rs[j] - paso))
                if d_b is None: d_b = a
                cb = float(np.clip(d_b @ a, -1, 1)); ph_b = math.acos(cb)
                t_ = d_b - cb * a; t_ /= max(np.linalg.norm(t_), 1e-9)
                ro_b = radio_ojo(bvh_o, C, [d_b], R)[0]
                for i in range(NA):
                    ph = ph_b + ext / ro_b * (1.0 if i == 0 else 0.5) if i < 2 else ph_b * FRAC[i]
                    d = math.cos(ph) * a + math.sin(ph) * t_
                    D[i, j] = d; RO[i, j] = ro = radio_ojo(bvh_o, C, [d], R)[0]
                    # hueco hasta la piel de delante (rayo hacia fuera): la lente queda justo debajo (el margen de la
                    # cuenca se apoya en ella) o a media altura si la piel casi toca el globo
                    hp = bvh_p.ray_cast(Vector(C + d * (ro + 1e-5)), Vector(d), 0.01)
                    cl = hp[3] if hp[0] is not None else 1.0
                    G[i, j] = max(min(P_['separacion'] * E, max(cl - 0.00012 * E, 0.5 * cl)), 2e-5)
            # el hueco se alisa (sin escalones bajo el borde) y nunca pasa del tope medido
            tope = G.copy()
            for _ in range(3):
                Gs = (np.roll(G, 1, 1) + np.roll(G, -1, 1) + 2 * G) / 4
                Gs[1:-1] = (Gs[:-2] + 2 * Gs[1:-1] + Gs[2:]) / 4
                G = np.minimum(Gs, tope)
            Vf = (C + D * (RO + G)[..., None]).reshape(-1, 3)
            # pesos y keys: la piel de delante (baricéntricas del rayo). En la abertura, la del borde del mismo
            # segmento con una rampa que se apaga hacia el centro (el centro queda quieto, el párpado pasa por delante)
            mapa = [None] * (NA * NS); rampa = np.ones(NA * NS)
            Df = D.reshape(-1, 3)
            for k_ in range(NA * NS):
                hp = bvh_p.ray_cast(Vector(Vf[k_]), Vector(Df[k_]), 0.01)
                if hp[0] is not None and k_ // NS <= 2:
                    vs = polys[hp[2]]
                    mapa[k_] = (list(vs), np.array(poly_3d_calc([Vector(P[v]) for v in vs], hp[0])))
            for j in range(NS):
                ult = None
                for i in range(NA):
                    k_ = i * NS + j
                    if mapa[k_] is not None:
                        ult = k_; continue
                    if ult is None:
                        loc, _, f, _ = bvh_p.find_nearest(Vector(Vf[k_]))
                        vs = polys[f]; mapa[k_] = (list(vs), np.array(poly_3d_calc([Vector(P[v]) for v in vs], loc)))
                        ult = k_
                    else:
                        mapa[k_] = mapa[ult]
                    if i > 2: rampa[k_] = float(util.ss(0.2, 1.0, FRAC[i]))
            # malla: anillos × segmentos; normales hacia fuera del ojo (backface culling)
            m2 = bpy.data.meshes.new(nombre)
            caras_ = [(i * NS + j, i * NS + (j + 1) % NS, (i + 1) * NS + (j + 1) % NS, (i + 1) * NS + j)
                      for i in range(NA - 1) for j in range(NS)]
            m2.from_pydata(Vf.tolist(), [], caras_)
            m2.update()
            if np.dot(np.array(m2.polygons[0].normal), Df[0]) < 0: m2.flip_normals()
            # UV radial: u = ángulo (costura en el segmento 0), v = anillo (0 fuera, 1 centro)
            uv = m2.uv_layers.new(name='UVMap'); luv = []
            for pl in m2.polygons:
                js = [m2.loops[li].vertex_index % NS for li in pl.loop_indices]
                cierra = 0 in js and NS - 1 in js
                for li in pl.loop_indices:
                    i, j = divmod(m2.loops[li].vertex_index, NS)
                    luv += [(NS if cierra and j == 0 else j) / NS, i / (NA - 1)]
            uv.data.foreach_set('uv', luv)
            for pl in m2.polygons: pl.use_smooth = True
            m2.materials.append(mat)
            ob = bpy.data.objects.new(nombre, m2)
            for c in cara.users_collection: c.objects.link(ob)
            ob.parent = cara.parent; ob.parent_type = cara.parent_type
            if cara.parent_type == 'BONE': ob.parent_bone = cara.parent_bone
            ob.matrix_parent_inverse = cara.matrix_parent_inverse.copy(); ob.matrix_basis = cara.matrix_basis.copy()
            ob.visible_shadow = False
            ob['rlb_oclusion'] = cara.name
            # grupos: los de la piel interpolados; en la abertura los DEF-parp_* se apagan con la rampa y lo que sobra
            # va a 'cabeza'. Toda la lente en la zona de los párpados (el modificador de la boca no la toca).
            gw = {}
            for v in sorted({v for m_ in mapa for v in m_[0]}):
                gw[v] = {cara.vertex_groups[g.group].name: g.weight for g in me.vertices[v].groups}
            W = {}
            for k_, (vs, w) in enumerate(mapa):
                for v, b in zip(vs, w):
                    for g, x in gw[v].items():
                        W.setdefault(g, np.zeros(NA * NS))[k_] += b * x
            quita = np.zeros(NA * NS)
            for g in list(W):
                if g.startswith('DEF-parp_'):
                    quita += W[g] * (1 - rampa); W[g] = W[g] * rampa
            W['cabeza'] = W.get('cabeza', np.zeros(NA * NS)) + quita
            W[PH.ZONA] = np.ones(NA * NS)
            for g, w in W.items():
                vg = ob.vertex_groups.new(name=g)
                for k_ in np.where(w > 1e-4)[0]: vg.add([int(k_)], float(min(w[k_], 1.0)), 'REPLACE')
            for m in cara.modifiers:
                if m.type != 'ARMATURE': continue
                nm_ = ob.modifiers.new(m.name, 'ARMATURE')
                for a in ('object', 'use_deform_preserve_volume', 'use_vertex_groups', 'use_bone_envelopes',
                          'use_multi_modifier', 'vertex_group', 'invert_vertex_group'):
                    setattr(nm_, a, getattr(m, a))
            # shape keys de la piel de delante, con sus drivers (párpado, cejas, correctivas…)
            nk = 0
            for knm, dl in KEYS.items():
                dd = np.array([(dl[vs] * w[:, None]).sum(0) for vs, w in mapa]) * rampa[:, None]
                if np.abs(dd).max() < 1e-7: continue
                if not ob.data.shape_keys: ob.shape_key_add(name='Basis', from_mix=False)
                src = kb[knm]
                k = ob.shape_key_add(name=knm, from_mix=False)
                k.data.foreach_set('co', (Vf + dd).ravel())
                k.slider_min, k.slider_max, k.value = src.slider_min, src.slider_max, src.value
                fc = drv.get(f'key_blocks["{knm}"].value')
                if fc: _copiar_driver(fc, k, 'value')
                nk += 1
            info[s] = {'objeto': nombre, 'v': NA * NS, 'hueco_mm': [round(float(G.min()) * 1000, 2), round(float(G.max()) * 1000, 2)],
                       'bajo_parpado_mm': round(ext * 1000, 2),
                       'abertura_mm': [round(float(rb.min()) * 1000, 1), round(float(rb.max()) * 1000, 1)], 'keys': nk, 'grupos': len(W)}
    d = MK.cfg(cara); d['oclusion'] = dict(P_, color=list(P_['color'])); MK.guardar_cfg(cara, d)
    return info


def quitar_oclusion(cara):
    for s in ('L', 'R'): util.borrar_objeto(f'{cara.name}_Oclusion_{s}')


def oclusion_seguir_keys(cara, nombres=None):
    """FACS (0.6.5): la lente se hizo antes que las keys FACS y seguía al rig viejo (armature + keys ceja_*/
    parp_contacto): al cerrar o entornar con las keys se quedaba quieta y asomaba en astillas grises sobre el ojo.
    Rehace sus keys copiando las de la piel de delante (mismo reparto que `oclusion`: rayo hacia fuera desde la lente,
    rampa hacia el centro), cada una con driver que copia el valor de la key de la cara, y apaga sus armatures."""
    from mathutils.interpolate import poly_3d_calc
    me = cara.data
    if not me.shape_keys:
        return {}
    M = MK.Marco(cara)
    piv = _pivotes(cara, M)
    kb = me.shape_keys.key_blocks
    fk = set(cara.get('facs_keys', []))
    nombres = nombres or [k.name for k in kb[1:] if k.name in fk]
    P = np.zeros(len(me.vertices) * 3); me.shape_keys.reference_key.data.foreach_get('co', P); P = P.reshape(-1, 3)
    cara_m, isl = medidas.cara_mask(cara, M)
    piel_m = isl == isl[M.cfg['seed']]
    excl = _caras_ocultas_uv(me)
    polys = [tuple(p.vertices) for i, p in enumerate(me.polygons)
             if piel_m[p.vertices[0]] and (excl is None or not excl[i])]
    bvh_p = BVHTree.FromPolygons([Vector(c) for c in P], polys)
    P_ = dict(OCL, **MK.cfg(cara).get('oclusion', {}))
    NA, NS = int(P_['anillos']), int(P_['segmentos'])
    FRAC = [None, None, 1.0, 0.93, 0.85, 0.6, 0.3][:NA]
    ksrc = me.shape_keys
    info = {}
    for s in ('L', 'R'):
        ob = bpy.data.objects.get(f'{cara.name}_Oclusion_{s}')
        if ob is None or s not in piv or len(ob.data.vertices) != NA * NS:
            continue
        C, _ = superficie_ojo(cara, piv[s])
        C = np.asarray(C, float)
        sk = ob.data.shape_keys
        V = np.zeros(len(ob.data.vertices) * 3)
        (sk.reference_key.data if sk else ob.data.vertices).foreach_get('co', V); V = V.reshape(-1, 3)
        U = V[(NA - 1) * NS:] - C
        eje = (U / np.linalg.norm(U, axis=1)[:, None]).mean(0); eje /= np.linalg.norm(eje)   # eje de la abertura
        mapa = [None] * (NA * NS); rampa = np.ones(NA * NS)
        for k_ in range(NA * NS):
            d = V[k_] - C; d /= max(np.linalg.norm(d), 1e-12)
            hp = bvh_p.ray_cast(Vector(V[k_]), Vector(d), 0.01)
            if hp[0] is not None and k_ // NS <= 2:
                vs = polys[hp[2]]
                mapa[k_] = (list(vs), np.array(poly_3d_calc([Vector(P[v]) for v in vs], hp[0])))
        for j in range(NS):
            ult = None
            for i in range(NA):
                k_ = i * NS + j
                if mapa[k_] is not None:
                    ult = k_; continue
                if ult is None:
                    loc, _, f, _ = bvh_p.find_nearest(Vector(V[k_]))
                    vs = polys[f]; mapa[k_] = (list(vs), np.array(poly_3d_calc([Vector(P[v]) for v in vs], loc)))
                    ult = k_
                else:
                    mapa[k_] = mapa[ult]
                if i > 2: rampa[k_] = float(util.ss(0.2, 1.0, FRAC[i]))
        # fuera las keys y drivers de antes; las del rig viejo tampoco valen con FACS
        if sk:
            if sk.animation_data:
                for f in list(sk.animation_data.drivers):
                    sk.animation_data.drivers.remove(f)
            for k in list(sk.key_blocks)[1:]:
                ob.shape_key_remove(k)
        else:
            ob.shape_key_add(name='Basis', from_mix=False)
        sk = ob.data.shape_keys
        nk = 0
        for knm in nombres:
            co = np.zeros(len(me.vertices) * 3); kb[knm].data.foreach_get('co', co); dl = co.reshape(-1, 3) - P
            dd = np.array([(dl[vs] * w[:, None]).sum(0) for vs, w in mapa])
            if np.abs(dd).max() < 1e-7:
                continue
            # sobre la esfera del ojo: la lente conserva su distancia al centro (los párpados giran sobre él)
            q = V + dd - C; r0 = np.linalg.norm(V - C, axis=1)
            N1 = C + q / np.maximum(np.linalg.norm(q, axis=1), 1e-12)[:, None] * r0[:, None]
            # anillos de dentro (3…): en abanico con el del borde (2), a su fracción del ángulo desde el eje de la
            # abertura. Con la rampa se quedaban quietos y el borde, al subir el párpado de abajo, los cruzaba.
            for j in range(NS):
                d2 = V[2 * NS + j] - C; d2 /= np.linalg.norm(d2)
                e2 = N1[2 * NS + j] - C; e2 /= np.linalg.norm(e2)
                ph0 = math.acos(float(np.clip(d2 @ eje, -1, 1)))
                ph1 = math.acos(float(np.clip(e2 @ eje, -1, 1)))
                t1 = e2 - (e2 @ eje) * eje; nt = np.linalg.norm(t1)
                if nt < 1e-9 or ph0 < 1e-6:
                    continue
                t1 /= nt
                for i in range(3, NA):
                    k_ = i * NS + j
                    di = V[k_] - C; ri = np.linalg.norm(di); di /= ri
                    f = math.acos(float(np.clip(di @ eje, -1, 1))) / ph0
                    ph = f * ph1
                    N1[k_] = C + (math.cos(ph) * eje + math.sin(ph) * t1) * ri
            dd = N1 - V
            k = ob.shape_key_add(name=knm, from_mix=False)
            k.data.foreach_set('co', (V + dd).ravel())
            k.slider_min, k.slider_max = kb[knm].slider_min, kb[knm].slider_max
            fc = k.driver_add('value'); dr = fc.driver; dr.type = 'AVERAGE'
            v = dr.variables.new(); v.name = 'w'; v.type = 'SINGLE_PROP'
            v.targets[0].id_type = 'KEY'; v.targets[0].id = ksrc
            v.targets[0].data_path = f'key_blocks["{knm}"].value'
            nk += 1
        for m in ob.modifiers:
            if m.type == 'ARMATURE':
                m.show_viewport = m.show_render = False
        info[s] = nk
    return info
