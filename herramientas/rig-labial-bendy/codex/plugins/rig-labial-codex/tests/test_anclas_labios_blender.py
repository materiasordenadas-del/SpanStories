"""Ejecutar con Blender --background --factory-startup --python <archivo>."""
import bpy
import importlib.util
import importlib
import json
import sys
import types
from pathlib import Path
import numpy as np

SOURCE = Path(__file__).parents[1] / 'assets/rig_labial_bendy/nucleo/facs/anclas_labios.py'
spec = importlib.util.spec_from_file_location('anclas_labios_prueba', SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
package = types.ModuleType('rlb_facs_test')
package.__path__ = [str(SOURCE.parent)]
sys.modules[package.__name__] = package
AJ = importlib.import_module('rlb_facs_test.ajustes')


def caso(nombre, cx, escala):
    def punto(x, z):
        return (cx + escala * x, escala * (-0.3 + 0.15 * x * x), 0.7 + escala * z)

    vs, fs = [], []
    for signo in (1., -1.):
        offset = len(vs)
        for x in np.linspace(-1., 1., 81):
            z = signo * 0.25 * (1 - x * x)
            for dz in (-0.07, 0.07):
                vs.append(punto(x, z + dz))
        for j in range(80):
            a = offset + 2 * j
            fs.append((a, a + 2, a + 3, a + 1))
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(vs, [], fs); me.update()
    cara = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(cara)
    cara.shape_key_add(name='Basis')
    arm = bpy.data.armatures.new(nombre + '_Rig_Labios')
    rig = bpy.data.objects.new(arm.name, arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for lab, signo in (('sup', 1.), ('inf', -1.)):
        posiciones = [(f'tweak_labio_{lab}', 0.)]
        for s, sx in (('L', 1.), ('R', -1.)):
            posiciones.extend([(f'tweak_labio_{lab}.{s}.001', sx * 0.5),
                               (f'tweak_labio_{lab}.{s}.002', sx * 0.8),
                               (f'tweak_labio_{lab}_comisura.{s}', sx)])
        for n, x in posiciones:
            b = arm.edit_bones.new(n)
            b.head = punto(x, signo * 0.25 * (1 - x * x))
            b.tail = b.head + __import__('mathutils').Vector((0, -escala * 0.1, 0))
    bpy.ops.object.mode_set(mode='OBJECT')
    cara['aj_densidad'] = {'boca': 12, 'cejas': 2}
    for lab in ('sup', 'inf'):
        grupo = cara.vertex_groups.new(name=f'DEF-labio_{lab}.L.001')
        grupo.add(list(range(len(me.vertices))), 1., 'REPLACE')
    ctrl = bpy.data.objects.new(nombre + '_Cara_Control', None)
    bpy.context.scene.collection.objects.link(ctrl)
    superficies, objetivos, P, hw = mod.resolver(cara, AJ)
    assert len(superficies) == 14
    for n, datos in superficies.items():
        w = np.array(datos['w'])
        assert min(w) >= 0 and abs(w.sum() - 1.) < 1e-8
        q = np.array(datos['w']) @ P[datos['tri']]
        assert np.linalg.norm(q - objetivos[n]) < escala * 1e-5
    L, R = objetivos['labio_borde_inf_L'], objetivos['labio_borde_inf_R']
    assert abs((L[0] + R[0]) / 2 - cx) < escala * 1e-5
    assert np.linalg.norm(L[1:] - R[1:]) < escala * 1e-5
    assert abs((L[0] - cx) / hw - 0.68) < 1e-5
    # Ruta real de actualización de un rig previo: cuatro keys y drivers nuevos, sin reconstruirlo.
    assert len(AJ.asegurar_bordes(cara)) == 4
    assert len(me.shape_keys.animation_data.drivers) == 4
    assert AJ.asegurar_bordes(cara) == []
    assert len(me.shape_keys.animation_data.drivers) == 4
    amplitudes = []
    for s in ('L', 'R'):
        n = AJ.nombre(f'labio_borde_inf_{s}', 'arriba')
        k = me.shape_keys.key_blocks[n]
        datos = cara['aj_superficies_labios'][f'labio_borde_inf_{s}']
        dz = sum(float(w) * (k.data[int(i)].co.z - me.shape_keys.key_blocks[0].data[int(i)].co.z)
                 for i, w in zip(datos['tri'], datos['w']))
        amplitudes.append(dz)
        assert 'v_' + n in ctrl
    assert abs(amplitudes[0] - amplitudes[1]) < escala * 1e-5
    assert len(AJ.asegurar_horizontal(cara)) == 2
    assert AJ.asegurar_horizontal(cara) == []
    assert len(me.shape_keys.animation_data.drivers) == 6
    for s in ('L', 'R'):
        z = f'labio_borde_inf_{s}'
        xkey = me.shape_keys.key_blocks[AJ.nombre(z, 'derecha')]
        zkey = me.shape_keys.key_blocks[AJ.nombre(z, 'arriba')]
        xco = np.array([v.co for v in xkey.data]) - P
        zco = np.array([v.co for v in zkey.data]) - P
        assert np.max(np.abs(xco[:, 0] - zco[:, 2])) < escala * 1e-5
        assert np.max(np.abs(xco[:, 1:])) < escala * 1e-5
    return {'personaje': nombre, 'eje_x': cx, 'semiancho': float(hw),
            'anclas_sobre_triangulo': len(superficies), 'simetria': True,
            'keys_y_drivers_nuevos': 6, 'amplitud_simetrica': True, 'idempotente': True,
            'movimiento_horizontal': True}


resultados = [caso('Labios_pequenos', 0., 0.0135), caso('Labios_grandes', 0.35, 0.2),
              caso('Labios_fuera_del_origen', 1.72, 0.017)]
print('RLB_ANCLAS_OK ' + json.dumps(resultados))
