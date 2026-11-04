"""Metarig humano de Rigify ajustado a los marcadores ECB_* y generacion del rig.

Se parte del metarig humano de Rigify, se borran cara y pecho (la cara ya tiene su propio
rig) y cada hueso se lleva a los marcadores. Los rolls se trasladan desde el metarig por
defecto con marcos locales (brazo, mano, pierna, pie), asi los ejes de doblar quedan como
Rigify espera aunque la malla venga en pose A y con las manos giradas.
"""
import bpy
from mathutils import Matrix, Vector

LADOS = ('L', 'R')
DEDOS_RIGIFY = {'indice': 'f_index', 'medio': 'f_middle', 'anular': 'f_ring', 'menique': 'f_pinky',
                'pulgar': 'thumb'}
PALMAS = {'indice': 'palm.01', 'medio': 'palm.02', 'anular': 'palm.03', 'menique': 'palm.04'}
COLUMNA = [('spine', 'pelvis', 'columna'), ('spine.001', 'columna', 'pecho'),
           ('spine.002', 'pecho', 'pecho_alto'), ('spine.003', 'pecho_alto', 'cuello'),
           ('spine.004', 'cuello', 'cuello_medio'), ('spine.005', 'cuello_medio', 'cabeza'),
           ('spine.006', 'cabeza', 'coronilla')]


def _posiciones(m):
    """{hueso: (cabeza, cola)} desde los marcadores."""
    V = {k: Vector(v) for k, v in m.items()}
    H = V['coronilla'].z - min(V['talon.L'].z, V['talon.R'].z)
    pos = {}
    for b, a, c in COLUMNA:
        pos[b] = (V[a], V[c])
    for l in LADOS:
        g = lambda k: V[f'{k}.{l}']
        pos[f'shoulder.{l}'] = (g('clavicula'), g('hombro'))
        pos[f'upper_arm.{l}'] = (g('hombro'), g('codo'))
        pos[f'forearm.{l}'] = (g('codo'), g('muneca'))
        pos[f'hand.{l}'] = (g('muneca'), g('medio_0'))
        for d, rd in DEDOS_RIGIFY.items():
            for i in range(3):
                pos[f'{rd}.0{i + 1}.{l}'] = (g(f'{d}_{i}'), g(f'{d}_{i + 1}'))
            if d in PALMAS:
                base = g('muneca').lerp(g(f'{d}_0'), 0.18)
                pos[f'{PALMAS[d]}.{l}'] = (base, g(f'{d}_0'))
        pos[f'thigh.{l}'] = (g('cadera'), g('rodilla'))
        pos[f'shin.{l}'] = (g('rodilla'), g('tobillo'))
        pos[f'foot.{l}'] = (g('tobillo'), g('bola_pie'))
        pos[f'toe.{l}'] = (g('bola_pie'), g('punta_pie'))
        pos[f'heel.02.{l}'] = (g('talon_int'), g('talon_ext'))
        pel = V['pelvis']
        pos[f'pelvis.{l}'] = (pel, Vector((g('cadera').x, pel.y - 0.04 * H, pel.z + 0.08 * H)))
    return pos


def _marco(eje, ref):
    """Base ortonormal (columnas x=eje, y, z) con z lo mas parecido posible a `ref`."""
    x = eje.normalized()
    z = (ref - ref.dot(x) * x)
    if z.length < 1e-6:
        z = x.orthogonal()
    z.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def _region(b):
    """Clave del marco local al que pertenece el hueso (None = minima rotacion)."""
    l = b[-1] if b[-2:] in ('.L', '.R') else None
    if l is None:
        return None
    if b.startswith(('upper_arm', 'forearm')):
        return 'brazo.' + l
    if b.startswith(('hand', 'palm', 'f_', 'thumb')):
        return 'mano.' + l
    if b.startswith(('thigh', 'shin')):
        return 'pierna.' + l
    if b.startswith(('foot', 'toe', 'heel')):
        return 'pie.' + l
    return None


def _marcos(pos_o_eb):
    """Marcos por region a partir de cabezas/colas de huesos (sirve para los dos metarigs)."""
    def hc(n):
        v = pos_o_eb[n]
        return v
    F = {}
    for l in LADOS:
        h_ua, _ = hc(f'upper_arm.{l}')
        h_h, t_h = hc(f'hand.{l}')
        F['brazo.' + l] = _marco(h_h - h_ua, Vector((0, -1, 0)))
        pinky = hc(f'f_pinky.01.{l}')[0]
        index = hc(f'f_index.01.{l}')[0]
        F['mano.' + l] = _marco(t_h - h_h, index - pinky)
        h_t, _ = hc(f'thigh.{l}')
        h_s, t_s = hc(f'shin.{l}')
        F['pierna.' + l] = _marco(t_s - h_t, Vector((0, -1, 0)))
        h_f, _ = hc(f'foot.{l}')
        _, t_toe = hc(f'toe.{l}')
        F['pie.' + l] = _marco(t_toe - h_f, Vector((0, 0, 1)))
    return F


def _conexiones_por_defecto():
    """use_connect del metarig humano de Rigify recien creado (no del que ya hay en la escena,
    que puede venir tocado de un intento anterior: un cuello conectado al pecho rompe Rigify)."""
    activo = bpy.context.view_layer.objects.active
    bpy.ops.object.armature_human_metarig_add()
    tmp = bpy.context.active_object
    con = {b.name: b.use_connect for b in tmp.data.bones}
    datos = tmp.data
    bpy.data.objects.remove(tmp)
    bpy.data.armatures.remove(datos)
    bpy.context.view_layer.objects.active = activo
    return con


def construir(personaje, marcadores, nombre_rig=None):
    """Crea (o reajusta) el metarig `ECB_<personaje>_metarig` sobre los marcadores."""
    nombre = f'ECB_{personaje}_metarig'
    pos = _posiciones(marcadores)
    vl = bpy.context.view_layer
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    conectado = _conexiones_por_defecto()
    mr = bpy.data.objects.get(nombre)
    if mr is None:
        bpy.ops.object.armature_human_metarig_add()
        mr = bpy.context.active_object
        mr.name = nombre
        mr.data.name = nombre
    mr.location = (0, 0, 0)
    mr.rotation_euler = (0, 0, 0)
    mr.scale = (1, 1, 1)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mr.hide_set(False)
    mr.select_set(True)
    vl.objects.active = mr
    bpy.ops.object.mode_set(mode='EDIT')
    eb = mr.data.edit_bones
    # fuera cara y pecho: la cara tiene su propio rig y el pecho no hace falta
    for b in list(eb):
        if b.name not in pos:
            eb.remove(b)
    # marcos y ejes Z del metarig por defecto (antes de mover nada)
    viejo = {b.name: (b.head.copy(), b.tail.copy(), b.z_axis.copy()) for b in eb}
    F0 = _marcos({k: (v[0], v[1]) for k, v in viejo.items()})
    F1 = _marcos(pos)
    for b in eb:
        b.use_connect = False
    for n, (h, t) in pos.items():
        b = eb[n]
        b.head, b.tail = h, t
    for n, (h, t) in pos.items():
        b = eb[n]
        h0, t0, z0 = viejo[n]
        reg = _region(n)
        if reg:
            z = F1[reg] @ F0[reg].transposed() @ z0
        else:
            z = (t0 - h0).rotation_difference(t - h).to_matrix() @ z0
        b.align_roll(z)
    # mismas conexiones que el metarig por defecto (Rigify reparte las cadenas segun ellas:
    # el cuello no va conectado al pecho porque es otro rig)
    for n in pos:
        eb[n].use_connect = conectado.get(n, False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mr['ecb_personaje'] = personaje
    if nombre_rig:
        mr['ecb_rig'] = nombre_rig
    return mr


def generar(personaje, nombre_rig=None):
    """Genera el rig con Rigify. Si ya existe se regenera encima (Rigify conserva el objeto)."""
    import addon_utils
    addon_utils.enable('rigify', default_set=True)
    mr = bpy.data.objects[f'ECB_{personaje}_metarig']
    nombre_rig = nombre_rig or f'{personaje}_Rig'
    rig = bpy.data.objects.get(nombre_rig)
    if rig is not None:
        mr.data.rigify_target_rig = rig
    for o in bpy.context.selected_objects:
        o.select_set(False)
    mr.hide_set(False)
    mr.select_set(True)
    bpy.context.view_layer.objects.active = mr
    accion = None
    if rig is not None and rig.animation_data:
        accion = rig.animation_data.action      # Rigify borra animation_data al regenerar
    bpy.ops.pose.rigify_generate()
    rig = mr.data.rigify_target_rig or bpy.context.active_object
    rig.name = nombre_rig
    rig.data.name = nombre_rig
    rig['ecb_personaje'] = personaje
    if accion is not None:
        rig.animation_data_create().action = accion
    mr.hide_set(True)
    return rig
