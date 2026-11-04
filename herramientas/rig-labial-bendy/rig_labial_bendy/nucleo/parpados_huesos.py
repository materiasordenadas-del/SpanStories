# Párpados con huesos (0.4.0, Señor Gómez). Sustituye a las shape keys parp_* cuando PARAM['modo'] = 'huesos'.
# Huesos RADIALES: la cabeza está en el eje X que pasa por el centro del ojo y la cola en el borde del párpado,
# N por párpado repartidos de lagrimal a rabillo. Giran sobre ese eje: el borde resbala por fuera del globo y
# nunca lo atraviesa (una cadena Bendy como la de la boca, que se desliza por la superficie, lo cortaría).
# Los pesos son el mismo campo alisado de las keys (f_sup / f_inf) repartido en X entre los dos huesos vecinos
# (sombreros lineales) + 'cabeza' = 1 - f. Un modificador Armature propio con Dual Quaternion (Preserve Volume)
# y máscara RLB_parpados_zona: peso f = giro f·ángulo, como las keys, sin hundir la piel que se estira bajo la
# ceja. El de la boca lleva la misma máscara invertida: cada vértice lo deforma un solo modificador.
# Controles: parpado (cerrar / abrir), parpado_in / parpado_out (forma: enfado, tristeza), parpado_inf
# (entornar) y mirada (los globos la siguen y el párpado acompaña la mirada vertical).
import bpy, math
import numpy as np
from mathutils import Vector
from . import util

N_HUESOS = 9
ZONA = 'RLB_parpados_zona'
MOD = 'Rig parpados'
FORMA = 0.45          # ángulo máximo de parpado_in / parpado_out, en fracción de la abertura central
SIGUE_MIRADA = (0.55, 0.30)   # el párpado superior / inferior sigue esta fracción del giro vertical del ojo
SOLAPE_MM = 0.0013    # × E: lo que el borde superior pasa por delante del inferior al cerrar (visto de frente)


def excluir_cejas_uv(cara):
    """Deja las caras UV de ceja bajo `cabeza` y fuera de pesos/máscara de párpado.

    Se puede reaplicar sobre un rig existente: no reconstruye huesos ni cambia malla, UV o shape keys.
    """
    import numpy as np
    me = cara.data
    attr = me.attributes.get('RLB_region_id')
    if not attr or attr.data_type != 'INT' or attr.domain != 'FACE':
        return {'aplicado': False, 'vertices': 0}
    from . import mascaras_regiones as MR
    ids = np.zeros(len(me.polygons), dtype=np.int32)
    attr.data.foreach_get('value', ids)
    brow = MR.vertices_por_region([p.vertices for p in me.polygons], ids, len(me.vertices), 1)
    indices = np.where(brow)[0]
    if not len(indices):
        return {'aplicado': True, 'vertices': 0}
    deform = [g for g in cara.vertex_groups if g.name.startswith('DEF-parp_')]
    zona = cara.vertex_groups.get(ZONA)
    head = cara.vertex_groups.get('cabeza') or cara.vertex_groups.new(name='cabeza')
    deform_ids = {g.index for g in deform}
    for i in indices:
        i = int(i)
        for membership in list(me.vertices[i].groups):
            if membership.group in deform_ids and membership.weight > 0:
                cara.vertex_groups[membership.group].remove([i])
        if zona:
            try:
                if zona.weight(i) > 0:
                    zona.remove([i])
            except RuntimeError:
                pass
        head.add([i], 1.0, 'REPLACE')
    return {'aplicado': True, 'vertices': int(len(indices))}


def _giro(yz, a):
    """giro alrededor del eje X del ojo; a > 0 baja lo que está delante (−Y)."""
    c, s_ = np.cos(a), np.sin(a)        # a: escalar o un ángulo por vértice (peso · giro, como el Dual Quaternion)
    return np.c_[yz[:, 0] * c - yz[:, 1] * s_, yz[:, 0] * s_ + yz[:, 1] * c]


def _cierre_medido(d, xj, op, K, ENT, E):
    """ángulo de cierre de cada hueso medido en la malla: el giro con el que el borde superior, visto de frente,
    llega justo al inferior (subido lf·op) y lo pasa SOLAPE_MM. Con párpados gruesos el borde superior gira más
    lejos del centro que el inferior: al mismo ángulo se pasaba (V al cerrar y domo en el centro, Gómez).
    -> (A, B): cierre = A − B·lf (lf = subida del inferior, K al parpadear, ENT entornado)."""
    rel, xl = d['rel'], d['xl']
    paso = (xj[-1] - xj[0]) / (len(xj) - 1)
    A = op + 0.0; B = op + 0.0
    for j, x in enumerate(xj):
        col = (np.abs(xl - x) < 0.6 * paso) & (rel[:, 1] < 0)
        su = col & (d['f_sup'] > 0.3); in_ = col & (d['f_inf'] > 0.3)
        if su.sum() < 2 or in_.sum() < 2: continue
        yu = rel[su][:, 1:]; yl = rel[in_][:, 1:]; wu = d['f_sup'][su]; wl = d['f_inf'][in_]
        def theta(lf):
            # cada vértice gira con su peso: los de 0,85–0,99 se quedaban atrás y dejaban una rendija
            tope = _giro(yl, -lf * op[j] * wl)[:, 1].max() - SOLAPE_MM * E
            lo, hi = 0.0, 1.7
            for _ in range(40):
                m = (lo + hi) / 2
                if _giro(yu, m * wu)[:, 1].min() > tope: lo = m
                else: hi = m
            return (lo + hi) / 2
        tk, te = theta(K), theta(ENT)
        B[j] = max(0.0, (tk - te) / max(ENT - K, 1e-6)); A[j] = tk + B[j] * K
    return A, B


def _nombres(s):
    return ([f'DEF-parp_sup.{s}.{j + 1:03d}' for j in range(N_HUESOS)],
            [f'DEF-parp_inf.{s}.{j + 1:03d}' for j in range(N_HUESOS)])


def limpiar(cara, rig):
    """borra huesos, grupos, modificador y drivers de una versión anterior (repetible)."""
    util.modo_objeto()
    for g in [g for g in cara.vertex_groups if g.name.startswith('DEF-parp_') or g.name == ZONA]:
        cara.vertex_groups.remove(g)
    m = cara.modifiers.get(MOD)
    if m: cara.modifiers.remove(m)
    for m in cara.modifiers:
        if m.type == 'ARMATURE' and m.vertex_group == ZONA: m.vertex_group = ''; m.invert_vertex_group = False
    ad = rig.animation_data
    if ad:
        for fc in list(ad.drivers):
            if 'DEF-parp_' in fc.data_path or fc.data_path.startswith('["rlb_'): ad.drivers.remove(fc)
    util.activar(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for nm in [b.name for b in eb if b.name.startswith(('DEF-parp_', 'parpado_in.', 'parpado_out.', 'mirada'))]:
        eb.remove(eb[nm])
    bpy.ops.object.mode_set(mode='OBJECT')


def construir(cara, rig, D, CTRL, E, P_):
    """D[s] = {C, sx, xs, bu, bl, f_sup, f_inf, xl} (de ojos.parpados); CTRL = rangos de los controles."""
    me = cara.data; n = len(me.vertices)
    CLOSE, WIDE, SQ = CTRL['CLOSE'], CTRL['WIDE'], CTRL['SQ']
    K, SOL, ENT, AB = P_['cierre_k'], math.radians(P_['solape']), P_['entornar'], math.radians(P_['abrir'])
    # ---------------------------------------------------------------- huesos
    util.activar(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    nodos = {}
    for s, d in D.items():
        C, sx = d['C'], d['sx']
        xs = d['xs']; xj = np.linspace(xs.min(), xs.max(), N_HUESOS)
        bu = np.interp(xj, xs, d['bu']); bl = np.interp(xj, xs, d['bl'])
        R = d['R'] * 1.25
        op = np.radians(bu - bl)
        A_, B_ = _cierre_medido(d, xj, op, K, ENT, E) if 'rel' in d else (op + SOL, op)
        nodos[s] = {'xj': xj, 'op': op, 'A': A_, 'B': B_}
        for nombres, bb in zip(_nombres(s), (bu, bl)):
            for j, nm in enumerate(nombres):
                b = eb.new(nm)
                x = C[0] + sx * xj[j]
                a = math.radians(bb[j])
                b.head = (x, C[1], C[2])
                b.tail = (x, C[1] - R * math.cos(a), C[2] + R * math.sin(a))
                # eje X local = X global: el giro es alrededor del eje del ojo (las colas no tienen componente X)
                b.align_roll(Vector((1, 0, 0)).cross(b.tail - b.head))
                b.parent = eb['cabeza']; b.use_deform = True
                b.bbone_x = b.bbone_z = 0.0004 * E
        # controles de forma del párpado superior, a los lados del control parpado
        p = eb[f'parpado.{s}']
        for nm, dx in (('parpado_in', -0.006), ('parpado_out', 0.006)):
            b = eb.new(f'{nm}.{s}')
            b.head = p.head + Vector((sx * dx * E, 0, 0)); b.tail = b.head + Vector((0, 0, 0.003 * E))
            b.roll = 0; b.parent = eb['cabeza']; b.use_deform = False
    # mirada: control delante de la cara y un objetivo por ojo
    Cm = (D['L']['C'] + D['R']['C']) / 2 if 'R' in D else D['L']['C']
    DIST = 0.30 * E / 0.75
    m = eb.new('mirada'); m.head = (Cm[0], Cm[1] - DIST, Cm[2]); m.tail = m.head + Vector((0, 0, 0.012 * E))
    m.roll = 0; m.parent = eb['cabeza']; m.use_deform = False
    for s, d in D.items():
        t = eb.new(f'mirada.{s}'); t.head = (d['C'][0], Cm[1] - DIST, d['C'][2]); t.tail = t.head + Vector((0, 0, 0.006 * E))
        t.roll = 0; t.parent = m; t.use_deform = False
    bpy.ops.object.mode_set(mode='POSE')
    cols = rig.data.collections_all
    c_def = cols.get('DEF parpados') or rig.data.collections.new('DEF parpados')
    c_def.is_visible = False
    c_ctrl = cols['Controles']
    for s in D:
        for nombres in _nombres(s):
            for nm in nombres:
                pb = rig.pose.bones[nm]; c_def.assign(pb.bone); pb.rotation_mode = 'XYZ'
        for nm in ('parpado_in', 'parpado_out'):
            pb = rig.pose.bones[f'{nm}.{s}']; c_ctrl.assign(pb.bone); util.color_hueso(pb.bone, (0.95, 0.45, 0.15))
            for c in list(pb.constraints): pb.constraints.remove(c)
            pb.lock_location = (True, False, True); pb.lock_rotation = (True, True, True); pb.lock_rotation_w = True
            pb.lock_scale = (True, True, True)
            c = pb.constraints.new('LIMIT_LOCATION'); c.owner_space = 'LOCAL'; c.use_transform_limit = True
            c.use_min_y = c.use_max_y = True; c.min_y, c.max_y = -CLOSE * 0.5, CLOSE * 0.5
    for nm in ['mirada'] + [f'mirada.{s}' for s in D]:
        pb = rig.pose.bones[nm]; c_ctrl.assign(pb.bone)
        util.color_hueso(pb.bone, (0.2, 0.7, 0.95) if nm == 'mirada' else (0.5, 0.85, 1.0))
        pb.lock_rotation = (True, True, True); pb.lock_rotation_w = True
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---------------------------------------------------------------- pesos
    zona = np.zeros(n, bool)
    cab = cara.vertex_groups.get('cabeza') or cara.vertex_groups.new(name='cabeza')
    W = {}
    for s, d in D.items():
        xj = nodos[s]['xj']
        u = np.clip((d['xl'] - xj[0]) / (xj[-1] - xj[0]), 0, 1) * (N_HUESOS - 1)
        j0 = np.minimum(np.floor(u).astype(int), N_HUESOS - 2); fr = u - j0
        for f, nombres in ((d['f_sup'], _nombres(s)[0]), (d['f_inf'], _nombres(s)[1])):
            f = np.where(f > 1e-4, f, 0.0)
            zona |= f > 0
            for j, nm in enumerate(nombres):
                w = f * np.where(j0 == j, 1 - fr, 0) + f * np.where(j0 + 1 == j, fr, 0)
                W[nm] = w
    # anillo de seguridad: un vértice más alrededor de la zona (la máscara corta donde los pesos ya son 0)
    ED = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ED); ED = ED.reshape(-1, 2)
    z2 = zona.copy(); z2[ED[zona[ED[:, 0]], 1]] = True; z2[ED[zona[ED[:, 1]], 0]] = True; zona = z2
    total = np.zeros(n)
    for nm, w in W.items():
        g = cara.vertex_groups.new(name=nm)
        for i in np.where(w > 1e-4)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
        total += w
    gz = cara.vertex_groups.new(name=ZONA)
    for i in np.where(zona)[0]:
        gz.add([int(i)], 1.0, 'REPLACE')
        cab.add([int(i)], float(max(0.0, 1.0 - total[i])), 'REPLACE')
    # Las caras de ceja identificadas por UV no reciben DEF de párpado; su peso íntegro sigue en cabeza.
    excluir_cejas_uv(cara)
    # ---------------------------------------------------------------- modificadores
    boca = next((m for m in cara.modifiers if m.type == 'ARMATURE' and m.object == rig and m.name != MOD), None)
    if boca:
        boca.vertex_group = ZONA; boca.invert_vertex_group = True
    mod = cara.modifiers.new(MOD, 'ARMATURE')
    mod.object = rig; mod.use_deform_preserve_volume = True; mod.vertex_group = ZONA
    i_boca = list(cara.modifiers).index(boca) if boca else -1
    util.activar(cara)
    bpy.ops.object.modifier_move_to_index(modifier=MOD, index=i_boca + 1)
    # ---------------------------------------------------------------- drivers
    def var(dr, nm, bone, canal='LOC_Y'):
        v = dr.variables.new(); v.name = nm; v.type = 'TRANSFORMS'
        t = v.targets[0]; t.id = rig; t.bone_target = bone; t.transform_type = canal; t.transform_space = 'LOCAL_SPACE'
    # valores intermedios en propiedades del rig (una expresión de driver no pasa de 256 caracteres)
    GR = DIST     # mirada: LOC_Y del control / distancia = tangente del giro vertical del ojo
    SM, IM = SIGUE_MIRADA

    def prop(nombre, expr, vars_):
        rig[nombre] = 0.0
        rig.driver_remove(f'["{nombre}"]')
        fc = rig.driver_add(f'["{nombre}"]'); dr = fc.driver; dr.type = 'SCRIPTED'
        for a, b in vars_: var(dr, a, b)
        dr.expression = expr

    def var_p(dr, nm, prop_):
        v = dr.variables.new(); v.name = nm; v.type = 'SINGLE_PROP'
        v.targets[0].id = rig; v.targets[0].data_path = f'["{prop_}"]'
    prop('rlb_mirada', f'atan(g/{GR:.5f})', [('g', 'mirada')])
    for s in D:
        prop(f'rlb_cierre_{s}', f'clamp(-c/{CLOSE:.6g},0,1)', [('c', f'parpado.{s}')])
        prop(f'rlb_abrir_{s}', f'clamp(c/{WIDE:.6g},0,1)', [('c', f'parpado.{s}')])
        prop(f'rlb_inf_{s}', f'max({K}*clamp(-c/{CLOSE:.6g},0,1),{ENT}*clamp(q/{SQ:.6g},0,1))',
             [('c', f'parpado.{s}'), ('q', f'parpado_inf.{s}')])
        op = nodos[s]['op']; FA = FORMA * float(op.max()); F = FA / (CLOSE * 0.5)
        for j in range(N_HUESOS):
            uj = j / (N_HUESOS - 1)
            T, O = nodos[s]['A'][j], nodos[s]['B'][j]
            # superior (+X baja): cerrar hasta el inferior, abrir, forma y seguir la mirada (menos al cerrar)
            fc = rig.pose.bones[_nombres(s)[0][j]].driver_add('rotation_euler', 0); dr = fc.driver; dr.type = 'SCRIPTED'
            for a, b in (('cc', f'rlb_cierre_{s}'), ('oo', f'rlb_abrir_{s}'), ('lf', f'rlb_inf_{s}'), ('mi', 'rlb_mirada')):
                var_p(dr, a, b)
            var(dr, 'ki', f'parpado_in.{s}'); var(dr, 'ko', f'parpado_out.{s}')
            dr.expression = (f'min(cc*({T:.5f}-{O:.5f}*lf)-oo*{AB:.5f}-(ki*{1 - uj:.3f}+ko*{uj:.3f})*{F:.4f}'
                             f'-{SM}*mi*(1-cc),{T:.5f}-{O:.5f}*lf)')
            # inferior (−X sube): entornar / acompañar el cierre y seguir la mirada
            fc = rig.pose.bones[_nombres(s)[1][j]].driver_add('rotation_euler', 0); dr = fc.driver; dr.type = 'SCRIPTED'
            for a, b in (('cc', f'rlb_cierre_{s}'), ('lf', f'rlb_inf_{s}'), ('mi', 'rlb_mirada')):
                var_p(dr, a, b)
            dr.expression = f'-{op[j]:.5f}*lf-{IM}*mi*(1-cc)'
    return {'huesos_por_parpado': N_HUESOS, 'zona_v': int(zona.sum()), 'mirada_dist_m': round(DIST, 3)}


def mirada_globos(rig, piv):
    """los pivotes de los ojos miran a mirada.L / mirada.R (Damped Track, −Y es el frente del ojo)."""
    for s, p in piv.items():
        for c in [c for c in p.constraints if c.name == 'RLB mirada']: p.constraints.remove(c)
        c = p.constraints.new('DAMPED_TRACK'); c.name = 'RLB mirada'
        c.target = rig; c.subtarget = f'mirada.{s}'; c.track_axis = 'TRACK_NEGATIVE_Y'


def medir_rendija(cara, rig, piv, R, poses=None, paso=0.0004):
    """con el ojo cerrado no debe verse el globo: rayos de frente sobre la abertura; cuenta los que tocan el ojo
    antes que la piel (0 = cerrado del todo). poses: {nombre: {hueso: loc_y}}."""
    from mathutils.bvhtree import BVHTree
    poses = poses or {'cerrado': {'parpado': -1.0}, 'cerrado_inf': {'parpado': -1.0, 'parpado_inf': 1.0}}
    out = {}
    for nombre, val in poses.items():
        util.pose_reposo(rig)
        for s in piv:
            for b, f in val.items():
                pb = rig.pose.bones[f'{b}.{s}']
                c = next(c for c in pb.constraints if c.type == 'LIMIT_LOCATION')
                pb.location.y = (c.max_y if f > 0 else -c.min_y) * f
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        piel = BVHTree.FromObject(cara, dg)
        for s, p in piv.items():
            ojos = [BVHTree.FromObject(o, dg) for o in p.children_recursive if o.type == 'MESH']
            mw = [o.matrix_world for o in p.children_recursive if o.type == 'MESH']
            C = p.matrix_world.translation
            n = vis = 0
            for x in np.arange(-R, R, paso):
                for z in np.arange(-R, R, paso):
                    o = Vector((C.x + x, C.y - 1, C.z + z)); dvec = Vector((0, 1, 0))
                    hp = piel.ray_cast(o, dvec)
                    best = None
                    for t, m in zip(ojos, mw):
                        mi = m.inverted(); h = t.ray_cast(mi @ o, (mi.to_3x3() @ dvec).normalized())
                        if h[0] is not None:
                            dd = ((m @ h[0]) - o).length
                            best = dd if best is None else min(best, dd)
                    if best is None: continue
                    n += 1
                    if hp[0] is None or hp[3] > best: vis += 1
            out[f'{nombre}.{s}'] = {'rayos_ojo': n, 'ojo_visible': vis}
    util.pose_reposo(rig)
    return out
