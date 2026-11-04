# Controles de la cara (capa del animador) + canales de datos (capa del lip sync y de la biblioteca).
# Cada shape key FACS de la cara vale clamp(v_<forma> + aporte_del_control, 0, 1):
#   - v_<forma>: propiedad del objeto de control; aquí escriben el lip sync y las expresiones (keyframes).
#   - controles: huesos en la cara con Limit Location; su desplazamiento normalizado suma a la forma.
# Las piezas (dientes, lengua, bolsa, borde del párpado) copian el valor de la cara (construir.drivers_espejo)
# y las correctivas siguen su regla (producto / campana). Para exportar se hornean los valores de las keys.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix

# hueso -> (posición en el marco de la boca/ojo, [(eje, signo, forma, recorrido × hw)])
#   eje: 'x' (lateral, + hacia la comisura L), 'z' (arriba), 'y' (hacia dentro). recorrido = desplazamiento
#   del hueso que da la forma a 1.
def _definicion(K, ojos):
    hw = K.hw
    d = {}
    def boca(u, v, w=-0.4):
        return K.C + K.X * u * hw + K.Z * v * hw + K.Y * w * hw
    d['CTRL_mandibula'] = (boca(0, -2.3, -0.6), [('z', -1, 'jawOpen', 0.8), ('x', 1, 'mouthLeft', 0.5), ('x', -1, 'mouthRight', 0.5)])
    for s, lado in ((1, 'L'), (-1, 'R')):
        d[f'CTRL_comisura.{lado}'] = (boca(1.15 * s, 0, -0.1), [('z', 1, f'mouthSmile_{lado}', 0.5), ('z', -1, f'mouthFrown_{lado}', 0.4),
                                                               ('x', s, f'mouthStretch_{lado}', 0.35), ('y', 1, f'mouthDimple_{lado}', 0.3)])
        d[f'CTRL_labio_sup.{lado}'] = (boca(0.5 * s, 0.55, -0.5), [('z', 1, f'mouthUpperUp_{lado}', 0.35), ('z', -1, f'mouthPress_{lado}', 0.25)])
        d[f'CTRL_labio_inf.{lado}'] = (boca(0.5 * s, -0.6, -0.5), [('z', -1, f'mouthLowerDown_{lado}', 0.35)])
        o = ojos[lado]; r = o.r / hw
        def ojo(u, v, w=-1.15):
            return o.c + K.X * u * hw + K.Z * v * hw + K.Y * w * o.r
        d[f'CTRL_parpado.{lado}'] = (ojo(0, 0.55 * r), [('z', -1, f'eyeBlink_{lado}', 0.55), ('z', 1, f'eyeWide_{lado}', 0.25)])
        d[f'CTRL_parpado_inf.{lado}'] = (ojo(0, -0.55 * r), [('z', 1, f'eyeSquint_{lado}', 0.3)])
        d[f'CTRL_ceja_in.{lado}'] = (ojo(-0.45 * r * s, 1.05 * r), [('z', 1, f'browInnerUp_{lado}', 0.35), ('z', -1, f'browDown_{lado}', 0.3)])
        d[f'CTRL_ceja_out.{lado}'] = (ojo(0.45 * r * s, 1.05 * r), [('z', 1, f'browOuterUp_{lado}', 0.35)])
        d[f'CTRL_mejilla.{lado}'] = (ojo(0.25 * r * s, -1.05 * r, -1.0), [('z', 1, f'cheekSquint_{lado}', 0.3)])
        al = K.aletas()
        d[f'CTRL_nariz.{lado}'] = (boca(0.45 * s, 1.65, -0.9) if al is None else al[lado] - K.Y * 0.25 * hw, [('z', 1, f'noseSneer_{lado}', 0.25)])
    d['CTRL_boca'] = (boca(0, 0, -1.3), [('y', -1, 'mouthPucker', 0.35), ('y', 1, 'mouthFunnel', 0.35),
                                          ('z', 1, 'mouthShrugLower', 0.3), ('z', -1, 'mouthRollLower', 0.3)])
    return d


def _forma_circulo(nombre='WGT_facs_circulo', r=1.0, n=24):
    o = bpy.data.objects.get(nombre)
    if o:
        return o
    me = bpy.data.meshes.new(nombre)
    vs = [(r * math.cos(2 * math.pi * i / n), 0.0, r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    es = [(i, (i + 1) % n) for i in range(n)]
    me.from_pydata(vs, es, []); me.update()
    o = bpy.data.objects.new(nombre, me)
    return o


def crear(cara, K, ojos, canales):
    """crea (o rehace) el objeto de control y los drivers de las keys FACS de la cara."""
    nombre = f'{cara.name}_Cara_Control'
    viejo = bpy.data.objects.get(nombre)
    if viejo:
        arm = viejo.data; bpy.data.objects.remove(viejo)
        if arm.users == 0:
            bpy.data.armatures.remove(arm)
    arm = bpy.data.armatures.new(nombre)
    ob = bpy.data.objects.new(nombre, arm)
    for c in cara.users_collection:
        c.objects.link(ob)
    ob.show_in_front = True
    arm.display_type = 'STICK'
    defi = _definicion(K, ojos)
    Mw = cara.matrix_world
    act = bpy.context.view_layer.objects.active
    bpy.context.view_layer.objects.active = ob
    modo_previo = cara.mode
    bpy.ops.object.mode_set(mode='EDIT')
    L = 0.12 * K.hw
    for nb, (p, _) in defi.items():
        eb = arm.edit_bones.new(nb)
        q = Mw @ Vector(p)
        eb.head = q; eb.tail = q + Vector((0, -L, 0))      # el hueso mira a la cámara (−Y); los ejes se miden luego
        eb.roll = 0
    bpy.ops.object.mode_set(mode='POSE')
    # ejes del mundo de la cara (X lateral, Z arriba, Y hacia dentro) -> eje local del hueso y signo
    R = np.array(ob.data.bones[next(iter(defi))].matrix_local.to_3x3())
    def local(v):
        l = R.T @ np.asarray(v, float); i = int(np.argmax(np.abs(l)))
        return 'xyz'[i], (1 if l[i] > 0 else -1)
    mapa = {'x': local(K.X), 'y': local(K.Y), 'z': local(K.Z)}
    wgt = _forma_circulo()
    for nb, (p, ejes) in defi.items():
        pb = ob.pose.bones[nb]
        pb.custom_shape = wgt
        pb.lock_rotation = (True, True, True); pb.lock_rotation_w = True; pb.lock_scale = (True, True, True)
        lim = pb.constraints.new('LIMIT_LOCATION'); lim.owner_space = 'LOCAL'; lim.use_transform_limit = True
        rng = {'x': [0.0, 0.0], 'y': [0.0, 0.0], 'z': [0.0, 0.0]}
        for eje, sg, forma, rec in ejes:
            le, ls = mapa[eje]
            val = sg * ls * rec * K.hw
            if val < 0: rng[le][0] = min(rng[le][0], val)
            else: rng[le][1] = max(rng[le][1], val)
        lim.use_min_x = lim.use_max_x = lim.use_min_y = lim.use_max_y = lim.use_min_z = lim.use_max_z = True
        lim.min_x, lim.max_x = rng['x']; lim.min_y, lim.max_y = rng['y']; lim.min_z, lim.max_z = rng['z']
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = act
    # canales de datos
    for c in canales:
        ob[f'v_{c}'] = 0.0
        ui = ob.id_properties_ui(f'v_{c}'); ui.update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0)
    # drivers de la cara
    aporte = {}
    for nb, (p, ejes) in defi.items():
        for eje, sg, forma, rec in ejes:
            aporte.setdefault(forma, []).append((nb, eje, sg, rec * K.hw))
    sk = cara.data.shape_keys
    hechos = 0
    for c in canales:
        k = sk.key_blocks.get(c)
        if k is None:
            continue
        path = f'key_blocks["{c}"].value'
        if sk.animation_data:
            for f in list(sk.animation_data.drivers):
                if f.data_path == path:
                    sk.animation_data.drivers.remove(f)
        fc = k.driver_add('value'); d = fc.driver; d.type = 'SCRIPTED'
        v = d.variables.new(); v.name = 'v'; v.type = 'SINGLE_PROP'
        v.targets[0].id_type = 'OBJECT'; v.targets[0].id = ob; v.targets[0].data_path = f'["v_{c}"]'
        partes = ['v']
        for j, (nb, eje, sg, rec) in enumerate(aporte.get(c, [])):
            t = d.variables.new(); t.name = f'b{j}'; t.type = 'TRANSFORMS'
            t.targets[0].id = ob; t.targets[0].bone_target = nb
            le, ls = mapa[eje]
            t.targets[0].transform_type = {'x': 'LOC_X', 'y': 'LOC_Y', 'z': 'LOC_Z'}[le]
            t.targets[0].transform_space = 'LOCAL_SPACE'
            partes.append(f'max(0,{sg * ls}*b{j}/{rec:.6g})')
        d.expression = f'min(1,max(0,{"+".join(partes)}))'
        hechos += 1
    ob['facs_cara'] = cara.name
    refrescar_drivers(cara)
    return ob, hechos


def refrescar_drivers(cara):
    """los drivers recién creados quedan marcados como no válidos hasta que se reescribe su expresión."""
    from .construir import Piezas
    for o in [cara] + Piezas(cara).todas() + [x for x in bpy.data.objects if x.get('facs_pieza') and x.parent == cara]:
        sk = o.data.shape_keys
        if not sk or not sk.animation_data:
            continue
        for fc in sk.animation_data.drivers:
            fc.driver.expression = fc.driver.expression
            fc.is_valid = True
    bpy.context.view_layer.update()


def poner(ob, valores, frame=None, limpiar=True, canales=None):
    """valores {canal: peso} en los canales de datos (con keyframe si frame no es None)."""
    canales = canales or [k[2:] for k in ob.keys() if k.startswith('v_')]
    for c in canales:
        if limpiar or c in valores:
            ob[f'v_{c}'] = float(valores.get(c, 0.0))
            if frame is not None:
                ob.keyframe_insert(f'["v_{c}"]', frame=frame)
