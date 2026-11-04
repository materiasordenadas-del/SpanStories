"""Poses de prueba para ver como deforman los pesos (no se guardan como animacion).

Los giros se dan en el marco del cuerpo (personaje mirando a -Y, su izquierda en +X) y se
aplican a los controles FK de Rigify alrededor de su cabeza. `quitar` deja todo en reposo
y devuelve los interruptores IK/FK como estaban.
"""
import math

import bpy
from mathutils import Matrix, Vector

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# nombre: [(hueso, eje(lado), grados)], eje como funcion del signo del lado (L=+1, R=-1)
POSES = {
    'reposo': [],
    'brazos_arriba': [('upper_arm_fk.{l}', lambda s: -Y * s, 80)],
    'brazos_frente': [('upper_arm_fk.{l}', lambda s: X, -80)],
    'codos': [('upper_arm_fk.{l}', lambda s: X, -30), ('forearm_fk.{l}', lambda s: X, -100)],
    'hombros_arriba': [('shoulder.{l}', lambda s: -Y * s, 20)],
    'torso_girado': [('chest', lambda s: Z, 30), ('torso', lambda s: Z, 10)],
    'torso_inclinado': [('chest', lambda s: X, 25), ('torso', lambda s: X, 10)],
    'cabeza': [('neck', lambda s: Z, 20), ('head', lambda s: X, 20)],
    'munecas': [('hand_fk.{l}', lambda s: X, -50)],
    'punos': [],          # se hace con los dedos (abajo)
    'piernas': [('thigh_fk.{l}', lambda s: X, -60), ('shin_fk.{l}', lambda s: X, 90)],
}
DEDOS = ['thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky']
_GUARDADO = {}


def _girar(rig, nombre, eje, grados):
    pb = rig.pose.bones.get(nombre)
    if pb is None:
        return False
    bpy.context.view_layer.update()
    M = pb.matrix.copy()
    h = M.translation.copy()
    R = Matrix.Rotation(math.radians(grados), 4, eje)
    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ M
    bpy.context.view_layer.update()
    return True


def _fk(rig, activar=True):
    """Brazos y piernas en FK mientras dura la prueba."""
    for n in ('upper_arm_parent.L', 'upper_arm_parent.R', 'thigh_parent.L', 'thigh_parent.R'):
        pb = rig.pose.bones.get(n)
        if pb is None or 'IK_FK' not in pb:
            continue
        if activar:
            _GUARDADO.setdefault(rig.name, {})[n] = pb['IK_FK']
            pb['IK_FK'] = 1.0
        elif n in _GUARDADO.get(rig.name, {}):
            pb['IK_FK'] = _GUARDADO[rig.name][n]


def quitar(rig):
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    _fk(rig, False)
    bpy.context.view_layer.update()


def poner(rig, pose):
    quitar(rig)
    _fk(rig, True)
    for nombre, eje, g in POSES[pose]:
        for l, s in (('L', 1), ('R', -1)):
            n = nombre.format(l=l)
            _girar(rig, n, eje(s), g)
            if '{l}' not in nombre:
                break
    if pose == 'punos':
        for l in ('L', 'R'):
            for d in DEDOS:
                for i in (1, 2, 3):
                    pb = rig.pose.bones.get(f'{d}.0{i}.{l}')
                    if pb is not None:
                        pb.rotation_mode = pb.rotation_mode
                        pb.rotation_quaternion = Matrix.Rotation(math.radians(55 if d != 'thumb' else 30), 4, 'X').to_quaternion()
    bpy.context.view_layer.update()
    return pose


def hoja(rig, malla, ruta, poses=None, lado=420):
    """Mosaico de renders Workbench (3/4 frontal) de las poses de prueba; un solo PNG que se
    sobrescribe. Devuelve la ruta."""
    import os
    import numpy as np
    poses = poses or [p for p in POSES if p != 'reposo']
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('ECB_tmp_cam')
    cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('ECB_tmp_cam', cam_d)
    sc.collection.objects.link(cam)
    r = sc.render
    sh = sc.display.shading
    viejo = (sc.camera, r.engine, r.resolution_x, r.resolution_y, r.filepath, sh.light, sh.color_type, sh.show_xray,
             r.film_transparent)
    sc.camera = cam
    r.engine = 'BLENDER_WORKBENCH'
    r.resolution_x = r.resolution_y = lado
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_xray = False
    bb = [malla.matrix_world @ Vector(c) for c in malla.bound_box]
    zmin, zmax = min(v.z for v in bb), max(v.z for v in bb)
    H = zmax - zmin
    c = sum(bb, Vector()) / 8
    c.z = zmin + H / 2
    # en la hoja solo el personaje: las mallas ocultas en el visor tambien salen en un render
    ajenas = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and o is not malla]
    for o in ajenas:
        o.hide_render = True
    cam_d.ortho_scale = H * 1.25
    az = math.radians(35)
    cam.location = c + Vector((math.sin(az) * 3, -math.cos(az) * 3, 0.3))
    cam.rotation_euler = (math.radians(84), 0, az)
    tmp = os.path.join(os.path.dirname(ruta), '_tmp_pose.png')
    tiles = []
    try:
        for p in poses:
            poner(rig, p)
            r.filepath = tmp
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(tmp, check_existing=False)
            px = np.array(im.pixels[:], np.float32).reshape(lado, lado, 4)
            bpy.data.images.remove(im)
            tiles.append(px)
    finally:
        quitar(rig)
        (sc.camera, r.engine, r.resolution_x, r.resolution_y, r.filepath, sh.light, sh.color_type, sh.show_xray,
         r.film_transparent) = viejo
        for o in ajenas:
            o.hide_render = False
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cam_d)
        if os.path.exists(tmp):
            os.remove(tmp)
    cols = min(5, len(tiles))
    filas = (len(tiles) + cols - 1) // cols
    big = np.zeros((filas * lado, cols * lado, 4), np.float32)
    for i, t in enumerate(tiles):
        f, cc = divmod(i, cols)
        big[(filas - 1 - f) * lado:(filas - f) * lado, cc * lado:(cc + 1) * lado] = t
    im = bpy.data.images.new('ECB_tmp_hoja', cols * lado, filas * lado, alpha=True)
    im.pixels = big.ravel()
    im.filepath_raw = ruta
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)
    return ruta
