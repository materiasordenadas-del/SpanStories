# Contacto de párpados (0.4.1, Señor Gómez). Con párpados gruesos el borde superior y el inferior NO llegan a la
# misma curva 3D al cerrar: de frente parece una línea, pero quedan hasta 4–5 mm de desfase en profundidad y cruces
# (diagnóstico de la revisión externa de Gómez). Se arregla con:
#  1. una correctiva por ojo, parp_contacto.<lado>, activada por el cierre (c·c·(3−2c)): ambos bordes van a una
#     curva común (punto medio, cúbica suave en X), el tejido de alrededor sigue por una solución armónica
#     (pesos 1/longitud de arista) y se alisa un poco; el objetivo evaluado se pasa al espacio ANTES del Armature
#     midiendo el jacobiano de la deformación por vértice (3 perturbaciones de 1 mm; vale también con DQS);
#  2. un término cc·(K−lf)·d en los drivers del párpado superior, ajustado por nodo, para que con el inferior
#     subido (entornar, lf hasta ENT) los bordes sigan en contacto. Vale 0 en el parpadeo normal y abierto.
# medir() da la separación 3D máxima y el cruce vertical de los bordes al cerrar (comprobación objetiva).
import bpy, math, json
import numpy as np
from . import util, medidas, marco as MK, contacto_remap as CR

ALISAR = (0.65, 6)          # factor, iteraciones (como un Corrective Smooth de referencia, solo en la zona)
FIN_MM = 0.001              # se excluye este margen en cada rabillo al medir y al fijar la curva común
EXPR = 'c*c*(3-2*c)'


def _ev(cara):
    dg = bpy.context.evaluated_depsgraph_get(); e = cara.evaluated_get(dg)
    co = np.zeros(len(e.data.vertices) * 3); e.data.vertices.foreach_get('co', co)
    evaluated = co.reshape(-1, 3)
    attr = e.data.attributes.get('RLB_indice_base')
    if attr is None:
        base_ids = None
    elif attr.domain != 'POINT' or attr.data_type != 'INT':
        raise RuntimeError('RLB_indice_base evaluado debe ser INT/POINT')
    else:
        base_ids = np.zeros(len(e.data.vertices), dtype=np.int32)
        attr.data.foreach_get('value', base_ids)
    # El Geometry Nodes oculta caras sin reindexar la base. Los vértices no evaluados
    # conservan Basis; los visibles vuelven a su índice original por RLB_indice_base.
    return CR.reconstruir_indices(util.coords(cara.data), evaluated, base_ids)


def _upd():
    for _ in range(2): bpy.context.view_layer.update()     # drivers en cadena (control -> propiedad -> hueso)


def _pose(rig, lados, cierre=1.0, inf=0.0):
    util.pose_reposo(rig)
    for s in lados:
        for b, f in (('parpado', -cierre), ('parpado_inf', inf)):
            if not f: continue
            pb = rig.pose.bones[f'{b}.{s}']
            c = next(c for c in pb.constraints if c.type == 'LIMIT_LOCATION')
            pb.location.y = (c.max_y if f > 0 else -c.min_y) * f
    _upd()


def _grupo_suma(cara, prefijo):
    idx = {g.index for g in cara.vertex_groups if g.name.startswith(prefijo)}
    w = np.zeros(len(cara.data.vertices))
    for v in cara.data.vertices:
        for g in v.groups:
            if g.group in idx: w[v.index] += g.weight
    return w


def _bordes(cara, M, s):
    """(índices borde superior, borde inferior) del hueco del ojo, ordenados en X."""
    from .ojos import _borde_abertura, _pivotes, abertura_visible, caras_excluidas_abertura
    me = cara.data; P = util.coords(me)
    cara_m, _ = medidas.cara_mask(cara, M)
    piv = _pivotes(cara, M)
    C = np.array(piv[s].matrix_world.translation) if piv else np.array(M.ojo(s)[0])
    E = M.ojo(s)[1] / MK.R_OJO_V
    try:
        uv_trace = json.loads(cara.get('rlb_regiones_uv', '{}'))
    except Exception:
        uv_trace = {}
    pestañas_aprobadas_uv = bool(uv_trace.get('regions', {}).get('pestanas'))
    incluir_pestanas = not pestañas_aprobadas_uv
    excluir = caras_excluidas_abertura(me, incluir_pestanas)
    b = _borde_abertura(me, P, cara_m, C, 0.04 * E, excluir)     # con la cuenca puesta: piel visible, sin pestañas UV aprobadas
    ws = _grupo_suma(cara, f'DEF-parp_sup.{s}'); wi = _grupo_suma(cara, f'DEF-parp_inf.{s}')
    sup = b[ws[b] >= wi[b]]; inf = b[ws[b] < wi[b]]
    # 0.6.0 (Lian): el contacto se mide y se corrige en el borde VISIBLE (rayos de frente). El hueco de la malla
    # puede ser tan grande como el globo y meterse detrás de la ceja: medido allí la corrección llegaba a 20 mm y,
    # con la cuenca puesta, salían otros vértices que sin ella (separaciones distintas al medir y al corregir).
    vs, vi = abertura_visible(cara, M, s, incluir_pestanas=incluir_pestanas)
    if len(vs) >= 6 and len(vi) >= 6:
        return vs, vi
    return sup[np.argsort(P[sup, 0])], inf[np.argsort(P[inf, 0])]


def _curvas(X, sup, inf, n=128):
    """bordes interpolados a la misma X (muestras interiores) -> xs, (y,z) sup, (y,z) inf."""
    a = max(X[sup, 0].min(), X[inf, 0].min()) + FIN_MM; b = min(X[sup, 0].max(), X[inf, 0].max()) - FIN_MM
    xs = np.linspace(a, b, n)
    def it(ii):
        o = np.argsort(X[ii, 0]); xx = X[ii, 0][o]
        return np.c_[np.interp(xs, xx, X[ii, 1][o]), np.interp(xs, xx, X[ii, 2][o])]
    return xs, it(sup), it(inf)


def medir(cara, rig, M, lados=('L', 'R'), infs=(0.0, 0.25, 1.0)):
    """separación 3D máxima (mm) y mayor cruce vertical (mm, el superior por debajo del inferior) al cerrar."""
    out = {}
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    try:
        bordes = {s: _bordes(cara, M, s) for s in lados}
        for q in infs:
            _pose(rig, lados, 1.0, q); X = _ev(cara)
            for s in lados:
                xs, U, L = _curvas(X, *bordes[s])
                d = np.linalg.norm(U - L, axis=1); dz = U[:, 1] - L[:, 1]
                out[f'{s}_inf{q}'] = {'sep3d_mm': round(float(d.max()) * 1000, 3),
                                      'cruce_mm': round(float(max(0.0, -dz.min())) * 1000, 3)}
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
    return out


def _vecinos_zona(me, zona, P):
    ED = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ED); ED = ED.reshape(-1, 2)
    k = zona[ED[:, 0]] & zona[ED[:, 1]]
    a, b = ED[k, 0], ED[k, 1]
    w = 1.0 / np.maximum(np.linalg.norm(P[a] - P[b], axis=1), 0.0002)
    borde_z = np.zeros(len(zona), bool)
    fuera = zona[ED[:, 0]] != zona[ED[:, 1]]
    borde_z[ED[fuera, 0]] = True; borde_z[ED[fuera, 1]] = True
    return a, b, w, borde_z & zona


def _armonico(D, a, b, w, libre, it=1500):
    """desplazamiento armónico: los no libres quedan fijos, los libres = media ponderada de sus vecinos."""
    n = len(D); sw = np.zeros(n); np.add.at(sw, a, w); np.add.at(sw, b, w)
    D = D.copy()
    for _ in range(it):
        s_ = np.zeros_like(D)
        np.add.at(s_, a, D[b] * w[:, None]); np.add.at(s_, b, D[a] * w[:, None])
        nd = s_ / np.maximum(sw, 1e-12)[:, None]
        D[libre] = nd[libre]
    return D


def correctiva(cara, rig, M, s, K):
    """crea parp_contacto.<s> (ver cabecera). -> info."""
    from . import pestanas_uv
    me = cara.data; kb = me.shape_keys.key_blocks; n = len(me.vertices)
    nombre = f'parp_contacto.{s}'
    # el driver se borra con la key: si no, la key nueva hereda la curva vieja marcada como inválida
    ad = me.shape_keys.animation_data
    if ad:
        for fc in [fc for fc in ad.drivers if f'"{nombre}"' in fc.data_path]: ad.drivers.remove(fc)
    if nombre in kb: cara.shape_key_remove(kb[nombre])
    gz = cara.vertex_groups.get('RLB_parpados_zona')
    if gz is None: return {'error': 'sin zona de párpados'}
    P0 = util.coords(me)
    zona = np.zeros(n, bool)
    for v in me.vertices:
        for g in v.groups:
            if g.group == gz.index and g.weight > 0: zona[v.index] = True
    sx = 1 if s == 'L' else -1
    zona &= (sx * (P0[:, 0] - M.cx) > 0)
    ocultas = np.zeros(len(me.polygons), dtype=bool)
    ocult_attr = me.attributes.get('RLB_ocultar_ojos_uv')
    if ocult_attr is not None:
        if ocult_attr.domain != 'FACE' or ocult_attr.data_type != 'BOOLEAN':
            raise RuntimeError('RLB_ocultar_ojos_uv debe ser BOOLEAN/FACE')
        ocult_attr.data.foreach_get('value', ocultas)
    zona &= CR.vertices_visibles([p.vertices for p in me.polygons], ocultas, n)
    region_attr = me.attributes.get('RLB_region_id')
    if region_attr is not None:
        region_ids = np.zeros(len(me.polygons), dtype=np.int32)
        region_attr.data.foreach_get('value', region_ids)
        brow_vertices = {v for p in me.polygons if region_ids[p.index] == 1 for v in p.vertices}
        zona[list(brow_vertices)] = False
    cfg = MK.cfg(cara)
    root_map = cfg.get('pestanas_uv_roots', {}).get('mapping', {}).get(s, [])
    if root_map:
        roots_for_side = sorted({int(row[i]) for row in root_map for i in (1, 2)})
        if any(v < 0 or v >= n for v in roots_for_side):
            raise RuntimeError('El mapa root UV contiene índices fuera de rango; vuelve a sincronizar pestañas')
        zona[roots_for_side] = True
        zona[[int(row[0]) for row in root_map]] = True
        if region_attr is not None:
            if set(roots_for_side).intersection(brow_vertices):
                raise RuntimeError('Una raíz de pestaña pertenece a cejas: revisa el mapa UV antes del contacto')
            zona[list(brow_vertices)] = False
    sup, inf = _bordes(cara, M, s)
    _pose(rig, [s], 1.0, 0.0)
    E0 = _ev(cara)
    # 1) objetivo: curva común (punto medio de ambos bordes, cúbica en X); fuera del tramo común no se toca
    xs, U, L = _curvas(E0, sup, inf, 64)
    mid = (U + L) / 2
    cy, cz = np.polyfit(xs, mid[:, 0], 3), np.polyfit(xs, mid[:, 1], 3)
    a_, b_, w_, borde_z = _vecinos_zona(me, zona, E0)
    rim = np.r_[sup, inf]
    D = np.zeros((n, 3))
    xr = E0[rim, 0]
    # todo el tramo común entero (apagarlo cerca de los rabillos dejaba 1,2–1,7 mm de separación en las puntas)
    f = ((xr >= xs[0] - FIN_MM) & (xr <= xs[-1] + FIN_MM)).astype(float)
    D[rim, 1] = (np.polyval(cy, xr) - E0[rim, 1]) * f
    D[rim, 2] = (np.polyval(cz, xr) - E0[rim, 2]) * f
    fijo = np.zeros(n, bool); fijo[rim] = True; fijo |= borde_z
    # Las pestañas de borde son restricciones interpoladas entre roots; proyectar su target a esos
    # roots antes del armónico hace compatible la curva común con la posterior propagación UV.
    if root_map:
        # Todas las raíces comparten la curva, incluidas las que el raycast no eligió.
        # Mantener dos filas con profundidad finita evita colapsar el grosor al cerrar.
        escala_ojo = M.ojo(s)[1] / MK.R_OJO_V
        root_targets = pestanas_uv.objetivos_raices_suaves(P0, E0, roots_for_side, cy, cz,
                                                        grosor=0.00035 * escala_ojo)
        for vertex, delta in root_targets.items():
            D[vertex] = delta
            fijo[vertex] = True
        root_deltas = {v: D[v].copy() for v in roots_for_side}
        for v, delta in pestanas_uv.interpolar_deltas_root(root_map, root_deltas).items():
            D[v] = delta
            fijo[v] = True
    D = _armonico(D, a_, b_, w_, zona & ~fijo)
    # 2) alisado de referencia del tejido cerrado (bordes y límite de la zona fijos)
    T = E0 + D
    fac, itn = ALISAR
    sw = np.zeros(n); np.add.at(sw, a_, 1.0); np.add.at(sw, b_, 1.0)
    libre = zona & ~fijo & (sw > 0)
    for _ in range(itn):
        s_ = np.zeros_like(T); np.add.at(s_, a_, T[b_]); np.add.at(s_, b_, T[a_])
        T[libre] += fac * (s_[libre] / sw[libre][:, None] - T[libre])
    if root_map:
        center = np.asarray(M.ojo(s)[0], dtype=float)
        # Keep the closing skin outside the globe instead of shrinking the eyeball.
        lash_vertices = {int(row[0]) for row in root_map}
        skin_idx = np.array([v for v in np.where(zona)[0] if v not in lash_vertices], dtype=int)
        rel = T[skin_idx] - center
        radii = np.linalg.norm(rel, axis=1)
        # Reserve room for planar polygon chords between the projected vertices too.
        radius = M.ojo(s)[1] + 0.0005 * escala_ojo
        inside = (radii < radius) & (rel[:, 1] < 0) & (radii > 1e-9)
        T[skin_idx[inside]] = center + rel[inside] * (radius / radii[inside])[:, None]
        for vertex, target in pestanas_uv.objetivos_pestanas_evaluadas(P0, T, root_map, center).items():
            T[vertex] = target
    # 3) jacobiano de la deformación por vértice -> desplazamiento en el espacio de la key (antes del Armature)
    idx = np.where(zona)[0]
    solve_idx = idx
    tmp = cara.shape_key_add(name='rlb_tmp_jac', from_mix=False)
    J = np.zeros((len(solve_idx), 3, 3)); h = 0.001
    try:
        for k in range(3):
            co = P0.copy(); co[solve_idx, k] += h
            tmp.data.foreach_set('co', co.ravel()); tmp.value = 1.0; me.shape_keys.update_tag(); _upd()
            J[:, :, k] = (_ev(cara)[solve_idx] - E0[solve_idx]) / h
            tmp.value = 0.0
    finally:
        cara.shape_key_remove(tmp)
    dl = CR.resolver_incrementos(J, T[solve_idx] - E0[solve_idx])
    key = cara.shape_key_add(name=nombre, from_mix=False)
    co = P0.copy(); co[solve_idx] += dl
    key.data.foreach_set('co', co.ravel()); key.value = 1.0; key.slider_min = 0.0; me.shape_keys.update_tag()
    if not root_map:
        pestanas_uv.propagar_correctiva(cara, nombre, s)
    _upd(); Ecur = _ev(cara)
    tolerance = 0.00005
    residual = T[solve_idx] - Ecur[solve_idx]
    residual_max = float(np.linalg.norm(residual, axis=1).max(initial=0.0))
    iterations = 0
    for iteration in range(1, 9):
        if residual_max < tolerance: break
        # Diferencia local alrededor de la clave correctiva activa, no del Basis neutro.
        current = np.zeros(n * 3); key.data.foreach_get('co', current); current = current.reshape(-1, 3)
        Jlocal = np.zeros((len(solve_idx), 3, 3))
        for axis in range(3):
            perturbed = current.copy(); perturbed[solve_idx, axis] += h
            key.data.foreach_set('co', perturbed.ravel()); me.shape_keys.update_tag(); _upd()
            Jlocal[:, :, axis] = (_ev(cara)[solve_idx] - Ecur[solve_idx]) / h
        key.data.foreach_set('co', current.ravel()); me.shape_keys.update_tag(); _upd()
        step = CR.resolver_incrementos(Jlocal, residual, max_step=0.002)
        current[solve_idx] += step
        key.data.foreach_set('co', current.ravel()); key.value = 1.0; me.shape_keys.update_tag(); _upd()
        if not root_map:
            pestanas_uv.propagar_correctiva(cara, nombre, s)
        _upd(); Ecur = _ev(cara)
        residual = T[solve_idx] - Ecur[solve_idx]
        residual_max = float(np.linalg.norm(residual, axis=1).max(initial=0.0))
        iterations = iteration
    key.value = 0.0; _upd()
    final_co = np.zeros(n * 3); key.data.foreach_get('co', final_co); final_co = final_co.reshape(-1, 3)
    final_dl = final_co[solve_idx] - P0[solve_idx]
    fc = key.driver_add('value'); dr = fc.driver; dr.type = 'SCRIPTED'
    v = dr.variables.new(); v.name = 'c'; v.type = 'SINGLE_PROP'
    v.targets[0].id = rig; v.targets[0].data_path = f'["rlb_cierre_{s}"]'
    dr.expression = EXPR
    if root_map:
        cfg = MK.cfg(cara)
        names = set(cfg.get('pestanas_contacto_evaluado', [])); names.add(nombre)
        cfg['pestanas_contacto_evaluado'] = sorted(names)
        MK.guardar_cfg(cara, cfg)
    util.pose_reposo(rig)
    return {'vertices': int((np.linalg.norm(final_dl, axis=1) > 1e-7).sum()),
            'max_mm': round(float(np.linalg.norm(final_dl, axis=1).max(initial=0.0)) * 1000, 2),
            'residual_mm': round(residual_max * 1000, 3), 'iteraciones_newton': iterations,
            'convergio': bool(residual_max < tolerance)}


def _drivers_sup(rig, s):
    out = []
    for fc in rig.animation_data.drivers:
        if f'DEF-parp_sup.{s}.' in fc.data_path and fc.array_index == 0:
            out.append((fc.data_path.split('"')[1], fc))
    return [fc for _, fc in sorted(out)]


def _poner_d(fcs, K, d):
    for fc, dj in zip(fcs, d):
        e = fc.driver.expression
        base = e.split('+cc*(')[0] if '+cc*(' in e else e
        fc.driver.expression = f'{base}+cc*({K}-lf)*{dj:.5f}' if abs(dj) > 1e-6 else base


def ajustar_entornado(cara, rig, M, s, K, ENT, iter_=3):
    """d por hueso superior para que, cerrado y con el inferior subido (lf = ENT), los bordes se toquen."""
    from .parpados_huesos import N_HUESOS
    fcs = _drivers_sup(rig, s)
    if len(fcs) != N_HUESOS: return {'error': 'drivers'}
    sup, inf = _bordes(cara, M, s)
    # X real de cada hueso (en R los nodos van de fuera hacia dentro: emparejar por orden daba d al revés)
    xj = np.array([rig.data.bones[fc.data_path.split('"')[1]].head_local.x for fc in fcs])
    q = 1.0     # parpado_inf al máximo -> lf = ENT

    def gaps(d):
        _poner_d(fcs, K, d); _pose(rig, [s], 1.0, q); X = _ev(cara)
        xs, U, L = _curvas(X, sup, inf, 128)
        return np.interp(xj, xs, U[:, 1] - L[:, 1])       # >0 abierto, <0 cruzado
    d = np.zeros(N_HUESOS); h = 0.25
    for _ in range(iter_):
        g0 = gaps(d); g1 = gaps(d + h)
        sl = (g1 - g0) / h
        paso = np.where(np.abs(sl) > 1e-7, -g0 / np.where(np.abs(sl) > 1e-7, sl, 1), 0.0)
        d = np.clip(d + paso, -0.3, 0.8)
        d = np.convolve(np.r_[d[0], d, d[-1]], [0.25, 0.5, 0.25], 'valid')    # curvatura suave entre nodos
    _poner_d(fcs, K, d)
    util.pose_reposo(rig)
    return {'d': [round(float(x), 3) for x in d]}


def construir(cara, rig, M, P_):
    """correctivas + ajuste del entornado en los dos ojos. Se llama al final de parpados() en modo huesos."""
    lados = [s for s in ('L', 'R') if f'parpado.{s}' in rig.pose.bones]
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    out = {}
    try:
        out['antes'] = medir(cara, rig, M, lados)
        for s in lados:
            out[s] = correctiva(cara, rig, M, s, P_['cierre_k'])
            out[s].update(ajustar_entornado(cara, rig, M, s, P_['cierre_k'], P_['entornar']))
        out['despues'] = medir(cara, rig, M, lados)
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
    return out
