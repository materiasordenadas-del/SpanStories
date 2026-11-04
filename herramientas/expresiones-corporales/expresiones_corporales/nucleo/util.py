# Utilidades comunes de Expresiones Corporales: catálogo de parámetros (DISENO §5), cuaterniones, acceso a los datos
# guardados en el rig (Object.ecorp) y escritura rápida de F-curves en acciones con capas (Blender 5.x: no existe
# action.fcurves; todo va por action.layers[0].strips[0].channelbag(slot)).
import bpy, json, math, os
from contextlib import contextmanager
from mathutils import Quaternion, Matrix, Vector, Euler

PAQUETE = __package__.rsplit('.', 1)[0]          # 'bl_ext.user_default.expresiones_corporales' o 'expresiones_corporales'
VERSION_DATOS = 1
FPS_BASE = 24.0
LADOS = ('L', 'R')
SIGNO = {'L': 1.0, 'R': -1.0}

# ---------------------------------------------------------------- catálogo de parámetros
# (nombre, grupo, min, max, bilateral, texto). Ángulos en grados; dedos 0–1; mano_objetivo en longitudes de brazo.
PARAMS = [
    ('torso_inclinar', 'torso', -45, 60, False, 'Inclinar (+ adelante)'),
    ('torso_lateral', 'torso', -40, 40, False, 'Lateral (+ a su izquierda)'),
    ('torso_girar', 'torso', -60, 60, False, 'Girar (+ a su izquierda)'),
    ('torso_encorvar', 'torso', -30, 45, False, 'Encorvar (+ encorvarse)'),
    ('pecho_abrir', 'torso', -30, 30, False, 'Pecho (+ fuera / - hundido)'),
    ('hombro_subir', 'hombros', -20, 35, True, 'Subir hombro'),
    ('hombro_adelante', 'hombros', -30, 30, True, 'Hombro adelante (- atrás)'),
    ('brazo_abrir', 'brazos', -30, 120, True, 'Abrir brazo (de lado)'),
    ('brazo_adelantar', 'brazos', -60, 160, True, 'Adelantar brazo (- atrás)'),
    ('brazo_girar', 'brazos', -80, 80, True, 'Girar brazo (+ interna)'),
    ('codo', 'brazos', -10, 150, True, 'Codo (+ flexión)'),
    ('antebrazo_girar', 'brazos', -90, 90, True, 'Antebrazo (+ pronación)'),
    ('codo_direccion', 'brazos', -90, 90, True, 'Dirección del codo (+ fuera, modo objetivo)'),
    ('muneca_doblar', 'manos', -80, 80, True, 'Muñeca (+ hacia la palma)'),
    ('muneca_desviar', 'manos', -40, 40, True, 'Desviar muñeca (+ hacia el pulgar)'),
    ('dedos_cerrar', 'manos', 0, 1, True, 'Cerrar dedos (puño)'),
    ('dedos_abrir', 'manos', 0, 1, True, 'Abrir dedos'),
    ('pulgar_cerrar', 'manos', 0, 1, True, 'Cerrar pulgar'),
    ('cabeza_inclinar', 'cabeza', -45, 45, False, 'Inclinar cabeza (+ barbilla abajo)'),
    ('cabeza_lateral', 'cabeza', -40, 40, False, 'Ladear cabeza (+ a su izquierda)'),
    ('cabeza_girar', 'cabeza', -70, 70, False, 'Girar cabeza (+ a su izquierda)'),
    ('cuello_adelantar', 'cabeza', -25, 25, False, 'Cuello (+ barbilla adelante)'),
]
PARAM = {p[0]: p for p in PARAMS}
GRUPOS = ('torso', 'hombros', 'brazos', 'manos', 'cabeza')
# no se escalan con la intensidad (son direcciones, no amplitudes)
SIN_ESCALA = {'codo_direccion'}

VIDA = [
    ('respiracion', 0, 6, 0.0, 'Respiración (grados)'),
    ('respiracion_periodo', 0.5, 12, 3.6, 'Periodo respiración (s)'),
    ('balanceo', 0, 6, 0.0, 'Balanceo (grados)'),
    ('balanceo_periodo', 1, 14, 7.0, 'Periodo balanceo (s)'),
    ('temblor', 0, 3, 0.0, 'Temblor (grados)'),
    ('temblor_frecuencia', 1, 20, 8.0, 'Frecuencia temblor (Hz)'),
    ('rebote', 0, 6, 0.0, 'Rebote (grados)'),
    ('rebote_periodo', 0.3, 4, 1.0, 'Periodo rebote (s)'),
]
VIDA_DEF = {v[0]: v[3] for v in VIDA}

CURVAS = ('suave', 'rapida', 'elastica', 'lenta')
ORDENES = ('torso_primero', 'cabeza_primero', 'manos_primero')
TIEMPOS = [
    ('entrada', 0, 240, 12, 'Entrada (fotogramas)'),
    ('asentar', 0, 240, 8, 'Asentar'),
    ('mantener', 1, 960, 48, 'Mantener'),
    ('salida', 0, 240, 14, 'Salida'),
    ('anticipacion', 0, 0.3, 0.0, 'Anticipación'),
    ('sobrepaso', 0, 0.3, 0.0, 'Sobrepaso'),
    ('desfase', 0, 8, 1.0, 'Desfase por eslabón (fotogramas)'),
]
TIEMPOS_DEF = {t[0]: t[3] for t in TIEMPOS}
TIEMPOS_DEF.update({'curva_entrada': 'suave', 'curva_salida': 'suave', 'orden': 'torso_primero'})


def valor(P, nombre, lado=None, defecto=0.0):
    """parámetro de un lado: el sufijo _L/_R gana sobre el nombre sin sufijo (DISENO §5)."""
    if lado is not None and f'{nombre}_{lado}' in P:
        return P[f'{nombre}_{lado}']
    return P.get(nombre, defecto)


def grupo_de(clave_param):
    base = clave_param[:-2] if clave_param[-2:] in ('_L', '_R') else clave_param
    if base.startswith('mano_objetivo'):
        return 'brazos'
    p = PARAM.get(base)
    return p[1] if p else None


# ---------------------------------------------------------------- cuaterniones
def q(lst):
    return Quaternion(lst)


def ql(qu):
    return [round(float(x), 7) for x in qu]


def rot(eje, grados):
    """rotación de 'grados' alrededor de 'eje' (Vector, se normaliza)."""
    e = Vector(eje)
    if e.length < 1e-9 or abs(grados) < 1e-9:
        return Quaternion()
    return Quaternion(e.normalized(), math.radians(grados))


def qpow(qu, t):
    """qu^t (permite t < 0 y t > 1: anticipación y sobrepaso del IK)."""
    if abs(t - 1.0) < 1e-9:
        return qu.copy()
    a = qu.copy()
    if a.w < 0:
        a.negate()
    ang = a.angle
    if ang < 1e-9:
        return Quaternion()
    return Quaternion(a.axis, ang * t)


def entre(a, b):
    """rotación mínima que lleva el vector a sobre b."""
    a, b = Vector(a).normalized(), Vector(b).normalized()
    return a.rotation_difference(b)


def conj(qu, N):
    """expresa la rotación de mundo qu en el marco local N: N^-1 · qu · N."""
    return N.inverted() @ qu @ N


def angulo_grados(qa, qb):
    d = qa.inverted() @ qb
    if d.w < 0:
        d.negate()
    return math.degrees(d.angle)


# ---------------------------------------------------------------- datos en el rig
def es_rig(o):
    return o is not None and o.type == 'ARMATURE'


def props(rig):
    try:
        return rig.ecorp
    except AttributeError:
        raise RuntimeError('Expresiones Corporales no está registrado (Object.ecorp no existe)')


def leer_json(texto, defecto=None):
    if not texto:
        return {} if defecto is None else defecto
    try:
        return json.loads(texto)
    except Exception:
        return {} if defecto is None else defecto


def escribir_json(d):
    return json.dumps(d, ensure_ascii=False, separators=(',', ':'))


def item_expr(rig, clave, crear=False):
    pg = props(rig)
    it = pg.expresiones.get(clave)
    if it is None and crear:
        it = pg.expresiones.add()
        it.name = clave
    return it


def leer_expr(rig, clave):
    it = item_expr(rig, clave)
    return leer_json(it.datos) if it is not None else None


def escribir_expr(rig, clave, datos):
    it = item_expr(rig, clave, crear=True)
    it.datos = escribir_json(datos)
    return it


def estilo_de(clave):
    if clave.endswith('_M') or clave.endswith('_F'):
        return clave[-1]
    return None


def gesto_de(clave):
    return clave[:-2] if estilo_de(clave) else clave


def nombre_accion(rig, clave):
    return f'{rig.name}_EC_Neutra' if clave == 'neutra' else f'{rig.name}_EC_{clave}'


def accion(rig, clave):
    return bpy.data.actions.get(nombre_accion(rig, clave))


def fps():
    r = bpy.context.scene.render
    return r.fps / max(r.fps_base, 1e-6)


def escala_tiempo():
    """los tiempos de la biblioteca están a 24 fps y se reescalan a los de la escena."""
    return fps() / FPS_BASE


# ---------------------------------------------------------------- acciones con capas
def channelbag(a, rig, limpiar=False):
    """canales de la acción para el slot del objeto rig (lo crea si falta)."""
    slot = next((s for s in a.slots if s.target_id_type == 'OBJECT'), None)
    if slot is None:
        slot = a.slots.new(id_type='OBJECT', name=rig.name)
    if not a.layers:
        a.layers.new('Capa')
    ly = a.layers[0]
    st = ly.strips[0] if ly.strips else ly.strips.new(type='KEYFRAME')
    cb = st.channelbag(slot, ensure=True)
    if limpiar:
        for f in list(cb.fcurves):
            cb.fcurves.remove(f)
    return cb, slot


def channelbags(a):
    for ly in a.layers:
        for st in ly.strips:
            for cb in st.channelbags:
                yield cb


def fcurves(a):
    for cb in channelbags(a):
        for f in cb.fcurves:
            yield f


def poner_claves(cb, ruta, indice, frames, valores, grupo=None):
    """escribe una F-curve completa de golpe (foreach_set) con interpolación lineal."""
    f = cb.fcurves.find(ruta, index=indice)
    if f is None:
        f = cb.fcurves.new(ruta, index=indice, group_name=grupo or '')
    else:
        f.keyframe_points.clear()
    n = len(frames)
    f.keyframe_points.add(n)
    co = [0.0] * (2 * n)
    co[0::2] = frames
    co[1::2] = valores
    f.keyframe_points.foreach_set('co', co)
    f.keyframe_points.foreach_set('interpolation', [1] * n)   # 1 = LINEAR
    f.update()
    return f


def reducir(frames, valores, tol=2e-5, fijos=()):
    """quita las muestras que la interpolación lineal ya reproduce (con tolerancia); conserva los extremos y fijos."""
    n = len(frames)
    if n <= 2:
        return list(frames), list(valores)
    fijos = set(fijos)
    keep = [0]
    for i in range(1, n - 1):
        a = keep[-1]
        if frames[i] in fijos:
            keep.append(i); continue
        t = (frames[i] - frames[a]) / max(frames[i + 1] - frames[a], 1e-9)
        lin = valores[a] + (valores[i + 1] - valores[a]) * t
        if abs(valores[i] - lin) > tol:
            keep.append(i)
    keep.append(n - 1)
    return [frames[i] for i in keep], [valores[i] for i in keep]


def ruta_rot(pb):
    return f'pose.bones["{pb.name}"].rotation_quaternion' if pb.rotation_mode == 'QUATERNION' \
        else (None if pb.rotation_mode == 'AXIS_ANGLE' else f'pose.bones["{pb.name}"].rotation_euler')


def local_quat(pb):
    """rotación local actual del hueso como cuaternión (respeta rotation_mode)."""
    m = pb.rotation_mode
    if m == 'QUATERNION':
        return pb.rotation_quaternion.copy()
    if m == 'AXIS_ANGLE':
        aa = pb.rotation_axis_angle
        return Quaternion(Vector(aa[1:]), aa[0])
    return pb.rotation_euler.to_quaternion()


def poner_local(pb, qu, compat=None):
    m = pb.rotation_mode
    if m == 'QUATERNION':
        pb.rotation_quaternion = qu
    elif m == 'AXIS_ANGLE':
        ax, an = qu.to_axis_angle()
        pb.rotation_axis_angle = (an, ax.x, ax.y, ax.z)
    else:
        pb.rotation_euler = qu.to_euler(m, compat) if compat is not None else qu.to_euler(m)


# ---------------------------------------------------------------- estado temporal del rig
@contextmanager
def sin_animacion(rig):
    """aparta acción activa y NLA (y la pose actual) mientras se mide; lo deja todo como estaba."""
    ad = rig.animation_data
    prev = None
    if ad is not None:
        prev = (ad.action, ad.action_slot, ad.use_nla, ad.use_tweak_mode)
    pose = guardar_pose(rig)
    try:
        if ad is not None:
            if ad.use_tweak_mode:
                ad.use_tweak_mode = False
            ad.action = None
            ad.use_nla = False
        yield
    finally:
        if ad is not None:
            a, s, nla, _tw = prev
            ad.use_nla = nla
            ad.action = a
            if a is not None and s is not None:
                try:
                    ad.action_slot = s
                except Exception:
                    pass
        poner_pose(rig, pose)
        bpy.context.view_layer.update()


def guardar_pose(rig):
    return {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.rotation_euler.copy(),
                      tuple(pb.rotation_axis_angle), pb.scale.copy()) for pb in rig.pose.bones}


def poner_pose(rig, pose):
    for pb in rig.pose.bones:
        v = pose.get(pb.name)
        if v is None:
            continue
        pb.location, pb.rotation_quaternion, pb.rotation_euler, pb.rotation_axis_angle, pb.scale = v


def pose_identidad(rig):
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.rotation_axis_angle = (0, 0, 1, 0)
        pb.scale = (1, 1, 1)


def mallas_del_rig(rig, visibles=True):
    """mallas deformadas por el rig (modificador Armature) o hijas suyas."""
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        if visibles:
            try:
                if not o.visible_get():
                    continue
            except Exception:
                continue
        if any(m.type == 'ARMATURE' and m.object == rig for m in o.modifiers) or o.parent == rig:
            out.append(o)
    return out


def carpeta_salida(sub=''):
    """junto al .blend si está guardado; si no, en la carpeta temporal de Blender."""
    base = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else bpy.app.tempdir
    c = os.path.join(base, sub) if sub else base
    os.makedirs(c, exist_ok=True)
    return c


def ss(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)
