# Paso 4: rig de labios con Bendy Bones (partes 1, 2 y 3 del tutorial, con las correcciones de Vale).
#  Parte 1: cadenas DEF + tweakers, cadena bendy grande, intermedios, controles.
#  Parte 2: forma de boca abierta (asas naranjas), comisuras, control «boca» + trackers, pinch, cerrar_ctrl.
#  Parte 3: pucker / gruñido por escala de «boca», masticar, lev_labio / baj_labio, roll out / in.
# Todas las medidas salen del marco (marcadores) y de medidas.medir_labios.
import bpy, math
from mathutils import Vector
from . import util, eje_boca

SIDES = ('L', 'R')
LIPS = ('sup', 'inf')
UP = Vector((0, 0, 1))
FWD = Vector((0, -1, 0))


def M_(v, s):
    return Vector((abs(v.x) * (1 if s == 'L' else -1), v.y, v.z))


def construir(cara, M, MED, pinch_follow=0.1, chew=0.75):
    util.modo_objeto()
    L = M.L
    # Reflection in world coordinates around the user's measured facial center.
    def M_(v, s):
        return Vector((v.x if s == 'L' else eje_boca.reflejar(v.x, M.cx), v.y, v.z))
    JT, JB = MED['JT'], MED['JB']
    CR, ST, SB = MED['CR'], MED['ST'], MED['SB']
    LT = L(0.0025)
    RIG = M.n['rig']
    MAX_JAW = L(-0.02)
    PINCH_MAX = L(0.003)
    RAISE_MAX = L(0.002)

    # ------------------------------------------------------------ armature
    old = bpy.data.objects.get(RIG)
    if old:
        ad = old.data; bpy.data.objects.remove(old)
        if ad.users == 0: bpy.data.armatures.remove(ad)
    arm = bpy.data.armatures.new(RIG)
    rig = bpy.data.objects.new(RIG, arm)
    (cara.users_collection[0] if cara.users_collection else bpy.context.scene.collection).objects.link(rig)
    arm.display_type = 'BBONE'; rig.show_in_front = True; rig.display_type = 'WIRE'
    COLS = {}
    for n in ('Base', 'DEF labios', 'Tweakers', 'Cadena bendy', 'Intermedios', 'Controles', 'Mecanismo', 'Trackers', 'Pinch'):
        COLS[n] = arm.collections.new(n)
    util.activar(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    EB = arm.edit_bones

    def bone(name, head, tail, parent=None, col='Mecanismo', deform=False, thick=0.0005, roll=None, roll_up=True):
        b = EB.new(name)
        b.head = head; b.tail = tail
        if roll is not None: b.roll = roll
        elif roll_up: b.align_roll(UP)
        b.parent = EB[parent] if isinstance(parent, str) else parent
        b.use_connect = False; b.use_deform = deform
        b.bbone_x = b.bbone_z = L(thick)
        COLS[col].assign(b)
        return b

    def along(p, d, l):
        return p + d.normalized() * l

    def dup(src, name, parent, col, scale=1.0, head=None, thick=None):
        s = EB[src]
        h = head.copy() if head is not None else s.head.copy()
        b = bone(name, h, h + (s.tail - s.head) * scale, parent, col, roll=s.roll)
        b.bbone_x = b.bbone_z = L(thick) if thick else s.bbone_x
        return b

    # --- base
    J_PIV, J_END = M.jaw_piv, M.jaw_end
    bone('cabeza', M.P(0, 0.02, 0.78), M.P(0, 0.02, 0.95), col='Base', deform=True, thick=0.003)
    bone('mandibula', J_PIV, J_END, 'cabeza', col='Base', deform=True, thick=0.002)
    mc = M.P(0, -0.042, 0.812)
    bone('mandibula_ctrl', mc, mc + Vector((0, -L(0.01), 0)), 'cabeza', col='Controles', thick=0.002)
    bone('MCH-mandibula_obj', J_END, J_END + Vector((0, -L(0.003), 0)), 'mandibula_ctrl', thick=0.0008)
    bone('MCH-boca', M.P(0, 0.0, 0.842), M.P(0, -0.028, 0.842), None, thick=0.0015)
    bone('labio_sup', M.P(0, -0.029, 0.851), M.P(0, -0.036, 0.851), 'cabeza', col='Controles', thick=0.0012)
    bone('labio_inf', M.P(0, -0.029, 0.832), M.P(0, -0.036, 0.832), 'mandibula', col='Controles', thick=0.0012)

    LIPJ = {'sup': JT, 'inf': JB}
    for lip, J in LIPJ.items():
        c0 = J[0]
        bone(f'MCH-labio_{lip}_medio', c0, c0 + FWD * LT * 0.8, f'labio_{lip}', col='Cadena bendy', thick=0.0007)
        bone(f'int_labio_{lip}', c0, c0 + FWD * LT * 1.1, f'MCH-labio_{lip}_medio', col='Intermedios', thick=0.0006)
        bone(f'tweak_labio_{lip}', c0, c0 + FWD * LT, f'int_labio_{lip}', col='Tweakers', thick=0.0005)
    for s in SIDES:
        d3 = M_(JT[3], s) - M_(JT[2], s)
        bone(f'comisura.{s}', M_(JT[3], s), along(M_(JT[3], s), d3, LT * 2.5), 'MCH-boca', col='Controles', thick=0.0012)
        for lip, J in LIPJ.items():
            Pp = [M_(p, s) for p in J]
            d = [Pp[i + 1] - Pp[i] for i in range(3)]
            tw = [f'tweak_labio_{lip}', f'tweak_labio_{lip}.{s}.001', f'tweak_labio_{lip}.{s}.002',
                  f'tweak_labio_{lip}_comisura.{s}']
            for k in (1, 2):
                bone(tw[k], Pp[k], along(Pp[k], d[k - 1], LT), None, col='Tweakers', thick=0.0005)
            bone(f'asa_labio_{lip}.{s}', Pp[3], along(Pp[3], d[2], LT * 1.6), f'comisura.{s}', col='Cadena bendy', thick=0.0006)
            bone(tw[3], Pp[3], along(Pp[3], d[2], LT), f'asa_labio_{lip}.{s}', col='Tweakers', thick=0.0005)
            bone(f'asa_labio_{lip}_inicio.{s}', Pp[0], along(Pp[0], d[0], LT * 0.8), tw[0], col='Tweakers', thick=0.0004)
            for k in range(3):
                b = bone(f'DEF-labio_{lip}.{s}.00{k+1}', Pp[k], Pp[k + 1], tw[k], col='DEF labios', deform=True, thick=0.00035)
                b.bbone_segments = 5
                b.bbone_handle_type_start = b.bbone_handle_type_end = 'TANGENT'
                b.bbone_custom_handle_start = EB[f'asa_labio_{lip}_inicio.{s}'] if k == 0 else EB[tw[k]]
                b.bbone_custom_handle_end = EB[tw[k + 1]]
            bone(f'asa_cadena_{lip}_ini.{s}', Pp[0], along(Pp[0], d[0], LT * 0.8), f'MCH-labio_{lip}_medio', col='Cadena bendy', thick=0.0004)
            c = bone(f'cadena_labio_{lip}.{s}', Pp[0], Pp[3], f'MCH-labio_{lip}_medio', col='Cadena bendy', thick=0.0004)
            c.bbone_segments = 10
            c.bbone_handle_type_start = c.bbone_handle_type_end = 'TANGENT'
            c.bbone_custom_handle_start = EB[f'asa_cadena_{lip}_ini.{s}']
            c.bbone_custom_handle_end = EB[f'asa_labio_{lip}.{s}']
            for k in (1, 2):
                bone(f'MCH-labio_{lip}_cadena.{s}.00{k}', Pp[k], along(Pp[k], d[k - 1], LT * 0.6), None, col='Cadena bendy', thick=0.0007)

    bpy.ops.object.mode_set(mode='POSE')
    PB = rig.pose.bones

    def con(pb, typ, sub, top=False, **kw):
        cs = PB[pb].constraints
        c = cs.new(typ); c.target = rig; c.subtarget = sub
        for k, v in kw.items(): setattr(c, k, v)
        if top: cs.move(len(cs) - 1, 0)
        return c

    con('mandibula', 'DAMPED_TRACK', 'MCH-mandibula_obj')
    a = PB['MCH-boca'].constraints.new('ARMATURE')
    for t in ('cabeza', 'mandibula'):
        tg = a.targets.new(); tg.target = rig; tg.subtarget = t; tg.weight = 0.5
    for lip in LIPS:
        for s in SIDES:
            tw = [f'tweak_labio_{lip}', f'tweak_labio_{lip}.{s}.001', f'tweak_labio_{lip}.{s}.002', f'tweak_labio_{lip}_comisura.{s}']
            for k in range(3):
                n = f'DEF-labio_{lip}.{s}.00{k+1}'
                con(n, 'DAMPED_TRACK', tw[k + 1]); con(n, 'STRETCH_TO', tw[k + 1], rest_length=0.0)
            n = f'cadena_labio_{lip}.{s}'
            con(n, 'DAMPED_TRACK', f'asa_labio_{lip}.{s}'); con(n, 'STRETCH_TO', f'asa_labio_{lip}.{s}', rest_length=0.0)
            con(f'MCH-labio_{lip}_medio', 'COPY_LOCATION', f'comisura.{s}', name=f'Copy Location {s}',
                target_space='LOCAL_OWNER_ORIENT', owner_space='LOCAL', influence=0.1)
    bpy.context.view_layer.update()

    def place_green(n, chain, goal):
        c = con(n, 'COPY_TRANSFORMS', chain, use_bbone_shape=True)
        best = (1e9, 0.5)
        for i in range(201):
            c.head_tail = i / 200
            bpy.context.view_layer.update()
            dd = ((rig.matrix_world @ PB[n].head) - goal).length
            best = min(best, (dd, i / 200))
        c.head_tail = best[1]; bpy.context.view_layer.update()
        return best

    GREEN = {}
    for lip, J in LIPJ.items():
        for s in SIDES:
            for k in (1, 2):
                n = f'MCH-labio_{lip}_cadena.{s}.00{k}'
                GREEN[n] = place_green(n, f'cadena_labio_{lip}.{s}', M_(J[k], s))
    for pb in PB: pb.select = pb.name in GREEN
    bpy.ops.pose.armature_apply(selected=True)

    bpy.ops.object.mode_set(mode='EDIT'); EB = arm.edit_bones
    for lip in LIPS:
        for s in SIDES:
            for k in (1, 2):
                tw = EB[f'tweak_labio_{lip}.{s}.00{k}']
                y = bone(f'int_labio_{lip}.{s}.00{k}', tw.head.copy(), tw.head + (tw.tail - tw.head) * 1.1,
                         f'MCH-labio_{lip}_cadena.{s}.00{k}', col='Intermedios', thick=0.0006, roll_up=False)
                y.roll = tw.roll; tw.parent = y

    # ================================================================ parte 2
    bpy.ops.object.mode_set(mode='POSE'); PB = rig.pose.bones
    OPEN = {'sup': (-35.0, L(-0.0006), L(0.0003)), 'inf': (35.0, L(-0.0006), L(-0.0003))}
    for lip in LIPS:
        rx, ly, lz = OPEN[lip]
        for s in SIDES:
            n = f'asa_labio_{lip}.{s}'
            PB[n].rotation_mode = 'XYZ'
            for kind in ('LOCATION', 'ROTATION'):
                c = con(n, 'TRANSFORM', 'mandibula_ctrl', name='abrir_' + ('loc' if kind == 'LOCATION' else 'rot'),
                        owner_space='LOCAL', target_space='LOCAL', map_from='LOCATION', map_to=kind,
                        map_to_x_from='Z', map_to_y_from='Z', map_to_z_from='Z')
                c.from_min_z = MAX_JAW; c.from_max_z = 0.0
                if kind == 'LOCATION': c.to_min_y = ly; c.to_min_z = lz
                else: c.to_min_x_rot = math.radians(rx)

    bpy.ops.object.mode_set(mode='EDIT'); EB = arm.edit_bones
    for s in SIDES:
        dup(f'tweak_labio_sup_comisura.{s}', f'tweak_comisura.{s}', f'comisura.{s}', 'Tweakers', scale=1.8, thick=0.0008)
        dup(f'tweak_labio_sup_comisura.{s}', f'MCH-pinch_comisura.{s}', None, 'Pinch', scale=1.2, thick=0.0005)
        for lip in LIPS:
            g = dup(f'tweak_labio_{lip}_comisura.{s}', f'MCH-labio_{lip}_comisura.{s}', f'tweak_comisura.{s}', 'Intermedios', scale=1.15, thick=0.0006)
            EB[f'tweak_labio_{lip}_comisura.{s}'].parent = g
    PIV = EB['MCH-boca'].head.copy()
    BOCA = Vector((M.cx, M.Yc(-0.047), (JT[0].z + JB[0].z) / 2))
    bone('boca', BOCA, BOCA + FWD * L(0.008), 'cabeza', 'Controles', thick=0.0015)
    bone('MCH-tracker', PIV, BOCA, 'MCH-boca', 'Trackers', thick=0.0008)
    bone('MCH-tracker_sup', PIV, BOCA, 'cabeza', 'Trackers', thick=0.0008)
    bone('MCH-tracker_inf', PIV, BOCA, 'mandibula', 'Trackers', thick=0.0008)
    bone('MCH-tracker_obj', BOCA, BOCA + FWD * L(0.002), 'MCH-boca', 'Trackers', thick=0.0006)
    bone('MCH-tracker_inf_obj', BOCA, BOCA + FWD * L(0.002), 'mandibula', 'Trackers', thick=0.0006)
    for lip, trk in (('sup', 'MCH-tracker_sup'), ('inf', 'MCH-tracker_inf')):
        p = dup(f'labio_{lip}', f'MCH-labio_{lip}_padre', trk, 'Controles', scale=1.2, thick=0.0014)
        EB[f'labio_{lip}'].parent = p
    for s in SIDES:
        EB[f'comisura.{s}'].parent = EB['MCH-tracker']
    dup('mandibula', 'MCH-pinch_base', 'MCH-tracker', 'Pinch', thick=0.0006)
    for s in SIDES:
        EB[f'MCH-pinch_comisura.{s}'].parent = EB['MCH-pinch_base']
    bone('MCH-pinch_medio', CR[0], CR[0] + FWD * LT * 0.8, 'MCH-pinch_base', 'Pinch', thick=0.0007)
    for s in SIDES:
        C = [M_(p, s) for p in CR]
        bone(f'asa_cadena_pinch_ini.{s}', C[0], C[0] + (C[1] - C[0]).normalized() * LT * 0.8, 'MCH-pinch_medio', 'Pinch', thick=0.0004)
        c = bone(f'cadena_pinch.{s}', C[0], C[3], 'MCH-pinch_medio', 'Pinch', thick=0.0004)
        c.bbone_segments = 10
        c.bbone_handle_type_start = c.bbone_handle_type_end = 'TANGENT'
        c.bbone_custom_handle_start = EB[f'asa_cadena_pinch_ini.{s}']
        c.bbone_custom_handle_end = EB[f'MCH-pinch_comisura.{s}']
        for k in (1, 2):
            bone(f'MCH-pinch_cadena.{s}.00{k}', C[k], C[k] + (C[k] - C[k - 1]).normalized() * LT * 0.6, None, 'Pinch', thick=0.0007)
    for s in SIDES:
        sx = 1 if s == 'L' else -1
        corner = M_(JT[3], s)
        h = corner + Vector((L(0.007) * sx, -L(0.010), 0))
        d = Vector((corner.x - h.x, corner.y - h.y, 0)).normalized()
        bone(f'pinch.{s}', h, h + d * L(0.004), 'MCH-tracker', 'Controles', thick=0.0010)
    off = Vector((0, 0, -L(0.008)))
    dup('mandibula_ctrl', 'cerrar_ctrl', 'mandibula_ctrl', 'Controles', head=EB['mandibula_ctrl'].head + off, thick=0.0015)
    dup('mandibula_ctrl', 'MCH-cerrar', 'mandibula_ctrl', 'Mecanismo', scale=0.5, head=EB['mandibula_ctrl'].head + off, thick=0.0006)

    bpy.ops.object.mode_set(mode='POSE'); PB = rig.pose.bones
    for s in SIDES:
        for lip in LIPS:
            n = f'MCH-labio_{lip}_comisura.{s}'
            con(n, 'COPY_LOCATION', f'asa_labio_{lip}.{s}', owner_space='LOCAL', target_space='LOCAL')
            con(n, 'COPY_ROTATION', f'asa_labio_{lip}.{s}', owner_space='LOCAL', target_space='LOCAL')
    # cierre con la mandíbula abierta: la línea de cierre sigue solo pinch_follow del giro de la mandíbula
    bpy.context.view_layer.update()
    q0 = PB['mandibula'].matrix.to_quaternion()
    pc = PB['mandibula_ctrl']
    pc.location = pc.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, MAX_JAW))
    bpy.context.view_layer.update()
    dq = q0.rotation_difference(PB['mandibula'].matrix.to_quaternion())
    ax = PB['mandibula'].bone.matrix_local.to_3x3().inverted() @ dq.axis
    jaw_deg = math.degrees(dq.angle) * (1 if ax.x >= 0 else -1)
    pc.location = (0, 0, 0); bpy.context.view_layer.update()
    c = con('MCH-pinch_base', 'TRANSFORM', 'mandibula_ctrl', name='cierre_alto', owner_space='LOCAL',
            target_space='LOCAL', map_from='LOCATION', map_to='ROTATION', map_to_x_from='Z', map_to_y_from='Z', map_to_z_from='Z')
    c.from_min_z = MAX_JAW; c.from_max_z = 0.0
    c.to_min_x_rot = math.radians(jaw_deg) * (0.5 - pinch_follow)
    for s in SIDES:
        for typ in ('COPY_LOCATION', 'COPY_ROTATION'):
            con(f'MCH-pinch_comisura.{s}', typ, f'comisura.{s}', owner_space='LOCAL', target_space='LOCAL_OWNER_ORIENT')
    for trk, tgt in (('MCH-tracker', 'MCH-tracker_obj'), ('MCH-tracker_sup', 'boca'), ('MCH-tracker_inf', 'MCH-tracker_inf_obj')):
        con(trk, 'COPY_ROTATION', 'boca', use_x=False, use_z=False, owner_space='LOCAL', target_space='LOCAL')
        con(trk, 'DAMPED_TRACK', tgt)
    for t in ('MCH-tracker_obj', 'MCH-tracker_inf_obj'):
        con(t, 'COPY_TRANSFORMS', 'boca', owner_space='LOCAL', target_space='LOCAL')
    for s in SIDES:
        con(f'cadena_pinch.{s}', 'DAMPED_TRACK', f'MCH-pinch_comisura.{s}')
        con(f'cadena_pinch.{s}', 'STRETCH_TO', f'MCH-pinch_comisura.{s}', rest_length=0.0)
    bpy.context.view_layer.update()
    GREEN2 = {}
    for s in SIDES:
        for k in (1, 2):
            n = f'MCH-pinch_cadena.{s}.00{k}'
            GREEN2[n] = place_green(n, f'cadena_pinch.{s}', M_(CR[k], s))
    for pb in PB: pb.select = pb.name in GREEN2
    bpy.ops.pose.armature_apply(selected=True)

    bpy.ops.object.mode_set(mode='EDIT'); EB = arm.edit_bones
    def gap_point(k, lip, s):
        p = (JT[k] + (CR[k] - ST[k])) if lip == 'sup' else (JB[k] + (CR[k] - SB[k]))
        return M_(p, s)
    for lip in LIPS:
        dup(f'int_labio_{lip}', f'MCH-pinch_{lip}', 'MCH-pinch_medio', 'Pinch',
            head=Vector((M.cx, *tuple(gap_point(0, lip, 'L'))[1:])), thick=0.0005)
        for s in SIDES:
            for k in (1, 2):
                dup(f'int_labio_{lip}.{s}.00{k}', f'MCH-pinch_{lip}.{s}.00{k}', f'MCH-pinch_cadena.{s}.00{k}', 'Pinch',
                    head=gap_point(k, lip, s), thick=0.0005)

    bpy.ops.object.mode_set(mode='POSE'); PB = rig.pose.bones
    def solo_y(pb, lo, hi):
        pb.rotation_mode = 'XYZ'
        pb.lock_location = (True, False, True)
        pb.lock_rotation = (True, True, True); pb.lock_rotation_w = True; pb.lock_scale = (True, True, True)
        c = pb.constraints.new('LIMIT_LOCATION')
        c.use_min_y = c.use_max_y = True; c.min_y, c.max_y = lo, hi
        c.owner_space = 'LOCAL'; c.use_transform_limit = True
    for s in SIDES:
        solo_y(PB[f'pinch.{s}'], 0.0, PINCH_MAX)
    PB['cerrar_ctrl'].rotation_mode = 'XYZ'
    c = con('MCH-cerrar', 'TRANSFORM', 'cerrar_ctrl', name='cerrar', owner_space='LOCAL', target_space='LOCAL',
            map_from='SCALE', map_to='LOCATION', map_to_x_from='X', map_to_y_from='X', map_to_z_from='X')
    c.from_min_x_scale = c.from_min_y_scale = c.from_min_z_scale = 0.5
    c.from_max_x_scale = c.from_max_y_scale = c.from_max_z_scale = 1.0
    c.to_min_z = 1.0; c.to_max_z = 0.0
    boca = PB['boca']; boca.rotation_mode = 'XYZ'
    for s in SIDES:
        p = f'pinch_{s}'
        boca[p] = 0.0
        boca.id_properties_ui(p).update(min=0.0, max=3.0, soft_min=0.0, soft_max=3.0)
        util.driver_transform(boca, f'["{p}"]', f'pinch * {3.0 / PINCH_MAX:.6f}', rig, [('pinch', f'pinch.{s}', 'LOC_Y')])

    def close_driver(con_obj, expr, sides):
        dr = con_obj.driver_add('influence').driver; dr.type = 'SCRIPTED'
        for name, s in sides:
            v = dr.variables.new(); v.name = name; v.type = 'SINGLE_PROP'
            v.targets[0].id = rig; v.targets[0].data_path = f'pose.bones["boca"]["pinch_{s}"]'
        v = dr.variables.new(); v.name = 'close'; v.type = 'TRANSFORMS'
        v.targets[0].id = rig; v.targets[0].bone_target = 'MCH-cerrar'
        v.targets[0].transform_type = 'LOC_Z'; v.targets[0].transform_space = 'LOCAL_SPACE'
        dr.expression = expr
    for lip in LIPS:
        c = con(f'int_labio_{lip}', 'COPY_TRANSFORMS', f'MCH-pinch_{lip}', name='cerrar')
        close_driver(c, '(pinch + pinchR) / 6 + close', (('pinch', 'L'), ('pinchR', 'R')))
        for s in SIDES:
            c = con(f'int_labio_{lip}.{s}.002', 'COPY_TRANSFORMS', f'MCH-pinch_{lip}.{s}.002', name='cerrar')
            close_driver(c, 'pinch + close', (('pinch', s),))
            c = con(f'int_labio_{lip}.{s}.001', 'COPY_TRANSFORMS', f'MCH-pinch_{lip}.{s}.001', name='cerrar')
            close_driver(c, 'pinch / 2 + close', (('pinch', s),))
            typ = 'COPY_TRANSFORMS' if lip == 'sup' else 'COPY_LOCATION'
            c = con(f'MCH-labio_{lip}_comisura.{s}', typ, f'MCH-pinch_comisura.{s}', name='cerrar')
            close_driver(c, 'pinch * 1.5 + close', (('pinch', s),))

    # ================================================================ parte 3
    bpy.ops.object.mode_set(mode='EDIT'); EB = arm.edit_bones
    for s in SIDES:
        sx = 1 if s == 'L' else -1
        for name, h in (('lev_labio', M.P(0.018 * sx, -0.047, 0.856)), ('baj_labio', M.P(0.018 * sx, -0.042, 0.830))):
            b = EB.new(f'{name}.{s}')
            b.head = h; b.tail = h + UP * L(0.004)
            b.align_roll(Vector((0, -1, 0)))
            b.parent = EB['MCH-tracker']; b.use_deform = False
            b.bbone_x = b.bbone_z = L(0.0010)
            COLS['Controles'].assign(b)
    bpy.ops.object.mode_set(mode='POSE'); PB = rig.pose.bones

    def to_local(name, dw):
        return arm.bones[name].matrix_local.to_3x3().inverted() @ dw

    def transform(owner, target, name, map_from, map_to, top=False):
        return con(owner, 'TRANSFORM', target, top=top, name=name, owner_space='LOCAL', target_space='LOCAL',
                   map_from=map_from, map_to=map_to)
    def mir(v, s):
        return Vector((v.x * (1 if s == 'L' else -1), v.y, v.z))
    PUCKER = {'comisura.L': Vector((-0.0035, -0.0015, 0.0)) * M.s,
              'MCH-labio_sup_padre': Vector((0, -0.0022, 0.0003)) * M.s,
              'MCH-labio_inf_padre': Vector((0, -0.0022, -0.0002)) * M.s}
    for n, dw in PUCKER.items():
        for s in (SIDES if n.endswith('.L') else (None,)):
            bn = n[:-2] + '.' + s if s else n
            loc = to_local(bn, mir(dw, s) if s else dw)
            c = transform(bn, 'boca', 'pucker', 'SCALE', 'LOCATION')
            c.from_min_x_scale = c.from_min_y_scale = c.from_min_z_scale = 0.5
            c.from_max_x_scale = c.from_max_y_scale = c.from_max_z_scale = 1.0
            c.to_min_x, c.to_min_y, c.to_min_z = loc
    c = transform('boca', 'mandibula_ctrl', 'masticar', 'LOCATION', 'SCALE')
    c.map_to_x_from = c.map_to_y_from = c.map_to_z_from = 'Z'
    c.from_min_z = MAX_JAW; c.from_max_z = 0.0
    c.to_min_x_scale = c.to_min_y_scale = c.to_min_z_scale = chew
    c.to_max_x_scale = c.to_max_y_scale = c.to_max_z_scale = 1.0
    c.mix_mode_scale = 'MULTIPLY'
    dr = c.driver_add('influence').driver; dr.type = 'AVERAGE'
    v = dr.variables.new(); v.name = 'close'; v.type = 'TRANSFORMS'
    v.targets[0].id = rig; v.targets[0].bone_target = 'MCH-cerrar'
    v.targets[0].transform_type = 'LOC_Z'; v.targets[0].transform_space = 'LOCAL_SPACE'
    for s in SIDES:
        for name, lo, hi in (('lev_labio', 0.0, RAISE_MAX), ('baj_labio', -RAISE_MAX, 0.0)):
            pb = PB[f'{name}.{s}']
            solo_y(pb, lo, hi)
            g = transform(f'{name}.{s}', 'boca', 'gruñido', 'SCALE', 'LOCATION', top=True)
            g.map_to_x_from = g.map_to_y_from = g.map_to_z_from = 'Y'
            g.from_min_x_scale = g.from_min_y_scale = g.from_min_z_scale = 1.0
            g.from_max_x_scale = g.from_max_y_scale = g.from_max_z_scale = 1.5
            g.to_max_y = hi if hi > 0 else lo
    GROWL = {'sup': {'.002': (0, -0.0002, 0.0010), '.001': (0, -0.0003, 0.0016), 'medio': (0, -0.0003, 0.0010)},
             'inf': {'.002': (0, -0.0002, -0.0010), '.001': (0, -0.0003, -0.0014), 'medio': (0, -0.0003, -0.0010)}}
    for lip, ctrl_name, cname in (('sup', 'lev_labio', 'raise'), ('inf', 'baj_labio', 'pull')):
        for s in SIDES:
            tgt = f'{ctrl_name}.{s}'
            ext = RAISE_MAX if lip == 'sup' else -RAISE_MAX
            items = [(f'int_labio_{lip}.{s}.002', GROWL[lip]['.002'], cname, 1.0),
                     (f'int_labio_{lip}.{s}.001', GROWL[lip]['.001'], cname, 1.0),
                     (f'int_labio_{lip}', GROWL[lip]['medio'], f'{cname} {s}', 0.5)]
            for bn, dw, nm, infl in items:
                loc = to_local(bn, mir(Vector(dw) * M.s, s))
                c = transform(bn, tgt, nm, 'LOCATION', 'LOCATION', top=True)
                c.map_to_x_from = c.map_to_y_from = c.map_to_z_from = 'Y'
                c.influence = infl
                if ext > 0:
                    c.from_max_y = ext; c.to_max_x, c.to_max_y, c.to_max_z = loc
                else:
                    c.from_min_y = ext; c.to_min_x, c.to_min_y, c.to_min_z = loc
    ROLL = {'sup': (20.0, -35.0), 'inf': (-20.0, 35.0)}
    for lip in LIPS:
        n = f'MCH-labio_{lip}_padre'
        PB[n].rotation_mode = 'XYZ'; PB[f'labio_{lip}'].rotation_mode = 'XYZ'
        out_deg, in_deg = ROLL[lip]
        c = transform(n, 'boca', 'roll out', 'ROTATION', 'ROTATION')
        c.from_max_x_rot = math.radians(80.0); c.to_max_x_rot = math.radians(out_deg)
        c = transform(n, 'boca', 'roll in', 'ROTATION', 'ROTATION')
        c.from_min_x_rot = math.radians(-80.0); c.to_min_x_rot = math.radians(in_deg)

    # ------------------------------------------------------------ colores (como en el vídeo)
    COLOR = {'DEF': (0.1, 0.85, 0.95), 'tweak': (0.9, 0.9, 0.9), 'cadena': (0.55, 0.25, 0.85), 'asa': (1.0, 0.5, 0.05),
             'verde': (0.15, 0.8, 0.25), 'int': (1.0, 0.85, 0.1), 'azul': (0.15, 0.45, 1.0), 'rojo': (0.95, 0.15, 0.15),
             'base': (0.3, 0.75, 0.75), 'verde_claro': (0.6, 1.0, 0.6)}
    def kind(n):
        if n.startswith('DEF'): return 'DEF'
        if n.startswith('MCH-labio_') and '_comisura.' in n: return 'verde_claro'
        if n.startswith('tweak') or '_inicio' in n: return 'tweak'
        if n.startswith('cadena'): return 'cadena'
        if n.startswith('asa_cadena_pinch'): return 'int'
        if n.startswith('asa'): return 'asa'
        if '_cadena.' in n: return 'verde'
        if n.startswith('int_'): return 'int'
        if n.endswith('_medio'): return 'azul'
        if n == 'boca': return 'int'
        if n in ('MCH-tracker', 'MCH-tracker_obj'): return 'azul'
        if n == 'MCH-tracker_sup': return 'rojo'
        if n.startswith('MCH-tracker_inf'): return 'verde'
        if n.startswith('MCH-pinch_'): return 'int'
        if (n.startswith(('labio_', 'comisura', 'pinch.', 'lev_labio', 'baj_labio')) or n in ('mandibula_ctrl', 'cerrar_ctrl')
                or n.endswith('_padre')): return 'rojo'
        return 'base'
    for b in arm.bones:
        util.color_hueso(b, COLOR[kind(b.name)])
    for pb in PB:
        if kind(pb.name) in ('rojo', 'tweak', 'asa') or pb.name == 'MCH-boca':
            pb.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig, {'huesos': len(arm.bones),
                 'error_verdes_mm': round(max(v[0] for v in list(GREEN.values()) + list(GREEN2.values())) * 1000, 3)}
