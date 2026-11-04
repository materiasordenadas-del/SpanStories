# Prueba de humo del add-on desde la fuente, sin tocar ningún .blend:
#   "D:\Blender 5.2\blender.exe" --background --factory-startup --python prueba_humo.py
# Importa el paquete, registra y desregistra las clases, ejecuta analizar sobre una esfera (con y sin centrar en
# X = 0) y comprueba que manifiesto, plugin.json y SKILL.md tengan la misma versión. Sale con código 1 si algo falla.
import os, sys, traceback

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
fallos = []


def caso(nombre, f):
    try:
        if f() is False:
            fallos.append(nombre); print('  FALLA', nombre)
        else:
            print('  ok ', nombre)
    except Exception:
        fallos.append(nombre)
        print('  FALLA', nombre); traceback.print_exc()


import bpy
import rig_labial_bendy as A
from rig_labial_bendy.nucleo import pasos, deteccion
import empaquetar

caso('register', A.register)
caso('version', lambda: print('    ', pasos.version()))


def analizar():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1)
    o = bpy.context.object
    r = pasos.analizar(o)
    assert r['transform_ok'] and r['centrado_x'], r
    o.data.transform(__import__('mathutils').Matrix.Translation((0.05, 0, 0)))
    r = pasos.analizar(o)
    assert not r['centrado_x'], r
    try:
        deteccion.boca(o, (0.05, -0.1, 0))
    except RuntimeError as e:
        assert 'no está centrada' in str(e), e
    else:
        raise AssertionError('boca() aceptó una cara fuera de X = 0')


caso('analizar y X = 0', analizar)
def forma():
    import numpy as np
    from rig_labial_bendy.nucleo import forma as FO
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, segments=48, ring_count=24)
    o = bpy.context.object
    o.name = 'CabezaPrueba'
    raiz = bpy.data.objects.new('CabezaPrueba_Ojos_ROOT', None); bpy.context.scene.collection.objects.link(raiz)
    for s_, x in (('L', 0.03), ('R', -0.03)):
        p = bpy.data.objects.new(f'CabezaPrueba_OjoPivote_{s_}', None); bpy.context.scene.collection.objects.link(p)
        p.parent = raiz; p.location = (x, -0.085, 0.02)
    bpy.context.view_layer.update()
    r = FO.preparar(o)
    assert r['keys'] == 36, r
    sk = o.data.shape_keys
    assert all(f.is_valid for f in sk.animation_data.drivers if 'fm_' in f.data_path)
    o['rlb_f_menton_forma'] = 100.0
    FO.evaluar(o)
    assert abs(sk.key_blocks['fm_menton_forma'].value - 1.0) < 1e-6
    FO.reiniciar(o)
    # ojos: x + = izquierda, y + = adelante (−Y), z + = arriba; espejo invierte el lateral
    FO.ojos_poner(o, 'L', 2.0, 1.0, 3.0, espejo=True)
    pl = FO.pivotes(o)['L'].matrix_world.translation; pr = FO.pivotes(o)['R'].matrix_world.translation
    assert abs(pl.x - 0.032) < 1e-6 and abs(pr.x + 0.032) < 1e-6 and abs(pl.y + 0.086) < 1e-6 and abs(pl.z - 0.023) < 1e-6, (pl, pr)
    FO.ojos_neutro(o)
    assert abs(FO.pivotes(o)['L'].matrix_world.translation.x - 0.03) < 1e-6
    FO.fijar(o)
    assert not [k for k in o.data.shape_keys.key_blocks if k.name.startswith('fm_')]


caso('forma de la cara y ojos', forma)
caso('versiones iguales', lambda: (lambda ok_v: (print('    ', ok_v[1]), ok_v[0])[1])(empaquetar.comprobar()))
caso('unregister', A.unregister)
print('PRUEBA DE HUMO:', 'BIEN' if not fallos else 'FALLAN ' + ', '.join(fallos))
sys.exit(1 if fallos else 0)
