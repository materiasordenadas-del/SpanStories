"""Caché de pesos y restauración de calidad en Blender aislado."""
import bpy
import importlib
import json
import sys
import types
import time
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parents[1] / 'assets/rig_labial_bendy/nucleo'
pkg = types.ModuleType('rlb_latencia')
pkg.__path__ = [str(ROOT)]
sys.modules[pkg.__name__] = pkg
facs = types.ModuleType(pkg.__name__ + '.facs')
facs.__path__ = [str(ROOT / 'facs')]
sys.modules[facs.__name__] = facs
E = importlib.import_module(facs.__name__ + '.editor')

mesh = bpy.data.meshes.new('sintetica')
mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], [], [(0, 1, 2, 3)])
obj = bpy.data.objects.new('test', mesh)
bpy.context.scene.collection.objects.link(obj)
obj.shape_key_add(name='Basis')
key = obj.shape_key_add(name='aj_punto_arriba')
key.data[0].co.z += .5

ahora = [10.]
reloj = E.time.monotonic
E.time.monotonic = lambda: ahora[0]
try:
    w, tris = E._datos_pesos(obj, 'punto', [key])
    assert w[0] == 1. and len(tris) == 2
    assert tris == [list(t.vertices) for t in mesh.loop_triangles if max(w[i] for i in t.vertices) > .02]
    # Cien redibujados retornan los mismos arrays sin releer geometría.
    token = E._pesos_cache['token']
    for _ in range(100):
        w2, tris2 = E._datos_pesos(obj, 'punto', [key])
        assert w2 is w and tris2 is tris
    assert E._pesos_cache['token'] is token
    key.data[1].co.z += 1.
    ahora[0] += .51
    w3, _ = E._datos_pesos(obj, 'punto', [key])
    assert np.isclose(w3[0], .5) and w3[1] == 1.
    # Una operación interna puede invalidar al instante, sin esperar el reloj.
    key.data[1].co.z += 1.
    E._pesos_cache.clear()
    w4, _ = E._datos_pesos(obj, 'punto', [key])
    assert np.isclose(w4[0], .25) and w4[1] == 1.
    # Cambiar el conjunto de keys invalida inmediatamente.
    otra = obj.shape_key_add(name='otra', from_mix=False); otra.data[2].co.z += 1.
    w5, _ = E._datos_pesos(obj, 'punto', [otra])
    assert w5[2] == 1. and w5[0] == 0.
finally:
    E.time.monotonic = reloj

sub = obj.modifiers.new('Subdivisión', 'SUBSURF')
oculto = obj.modifiers.new('Oculto', 'SUBSURF'); oculto.show_viewport = False
ed = types.SimpleNamespace(rapido=True)
E._pausar_calidad(obj, ed)
assert not sub.show_viewport and not oculto.show_viewport
E._restaurar_calidad()
assert sub.show_viewport and not oculto.show_viewport and not E._rapido
ed.rapido = False
E._pausar_calidad(obj, ed)
assert sub.show_viewport and not oculto.show_viewport
E._restaurar_calidad()

# Calibración: ambas anclas se consultan juntas y se restauran los valores.
from bpy_extras import view3d_utils
from mathutils import Vector
class Control(dict):
    def update_tag(self):
        pass
ctrl = Control({'v_aj_p_arriba': .2, 'v_aj_q_arriba': .3,
                'v_aj_p_derecha': -.1, 'v_aj_q_derecha': .1})
channels = {f'aj_p_{d}': types.SimpleNamespace(name=f'aj_p_{d}', par=f'aj_q_{d}') for d in ('arriba', 'derecha')}
ed = types.SimpleNamespace(enlazar=True, canales=channels, intensidad=100.)
updates = []
context = types.SimpleNamespace(view_layer=types.SimpleNamespace(update=lambda: updates.append(1)))
aj = types.SimpleNamespace(lado_par=lambda p, cara: ('', 'q'), nombre=lambda p, d: f'aj_{p}_{d}')
llamadas = []
def posiciones(context, cara, ids):
    llamadas.append(tuple(ids))
    return ids, [Vector((ctrl[f'v_aj_{p}_derecha']*100, ctrl[f'v_aj_{p}_arriba']*100, 0)) for p in ids]
originales = (E._ajustes, E._ctrl, E._pos_eval, view3d_utils.location_3d_to_region_2d)
try:
    E._ajustes = lambda: aj; E._ctrl = lambda ed: ctrl; E._pos_eval = posiciones
    view3d_utils.location_3d_to_region_2d = lambda reg, rv3d, pos: pos
    antes = dict(ctrl)
    ganancias = E._ganancias(context, obj, ed, 'p', None, None)
    assert dict(ctrl) == antes and len(llamadas) == 3 and all(ids == ('p', 'q') for ids in llamadas)
    assert len(updates) == 4  # basal, dos perturbaciones, restauración final
    assert set(ganancias) == {'arriba', 'par_arriba', 'derecha', 'par_derecha'}
finally:
    E._ajustes, E._ctrl, E._pos_eval, view3d_utils.location_3d_to_region_2d = originales

# Los eventos solo etiquetan el control; soltar evalúa y guarda el último valor.
sub.show_viewport = False
real_ctrl = bpy.data.objects.new('control_latencia', None)
bpy.context.scene.collection.objects.link(real_ctrl)
real_ctrl['v_aj_punto_arriba'] = 0.
driver = key.driver_add('value').driver
variable = driver.variables.new(); variable.name = 'v'; variable.type = 'SINGLE_PROP'
variable.targets[0].id = real_ctrl; variable.targets[0].data_path = '["v_aj_punto_arriba"]'
driver.expression = 'v'
updates_real = []
def actualizar():
    updates_real.append(1); bpy.context.view_layer.update()
scene = types.SimpleNamespace(rlb_editor=types.SimpleNamespace(activo=True))
ctx = types.SimpleNamespace(scene=scene, window=object(), view_layer=types.SimpleNamespace(update=actualizar))
token = object(); bpy.app.driver_namespace['rlb_arrastre_token'] = token
operador = types.SimpleNamespace(_token=token, report=lambda *args: None)
evento = types.SimpleNamespace(type='LEFTMOUSE', value='RELEASE')
guardado = []
originales2 = (E._ctrl, E._cara, E._gesto_fin, E._tag_redraw)
try:
    E._ctrl = lambda ed: real_ctrl; E._cara = lambda context: obj
    E._gesto_fin = lambda ed: guardado.append(real_ctrl['v_aj_punto_arriba'])
    E._tag_redraw = lambda context: None
    E._arr.update(punto='p')
    for valor in (.1, .2, .3, .4, .6, .8):
        E._poner_en_cara(ctx, scene.rlb_editor, {'aj_punto_arriba': valor}, (0, 0))
    assert len(updates_real) == 0 and np.isclose(real_ctrl['v_aj_punto_arriba'], .8)
    assert E.RLB_OT_exp_arrastrar.modal(operador, ctx, evento) == {'RUNNING_MODAL'}
    assert guardado == [.8] and len(updates_real) == 1 and not E._arr
    evaluada = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    assert np.isclose(evaluada.data.vertices[0].co.z, .4, atol=1e-6)
finally:
    E._arr.clear()
    E._ctrl, E._cara, E._gesto_fin, E._tag_redraw = originales2

# Malla densa: compara exactamente el filtrado vectorizado con el anterior.
lado = 180
verts = [(float(x), float(y), 0.) for y in range(lado) for x in range(lado)]
faces = [(y*lado+x, y*lado+x+1, (y+1)*lado+x+1, (y+1)*lado+x)
         for y in range(lado-1) for x in range(lado-1)]
dense = bpy.data.meshes.new('densa'); dense.from_pydata(verts, [], faces); dense.update()
ob = bpy.data.objects.new('densa', dense); bpy.context.scene.collection.objects.link(ob)
ob.shape_key_add(name='Basis'); k = ob.shape_key_add(name='punto', from_mix=False)
co = np.array(verts, dtype=np.float32)
co[:, 2] = np.maximum(0., 1. - np.linalg.norm(co[:, :2] - (90, 90), axis=1) / 25.)
k.data.foreach_set('co', co.reshape(-1)); dense.calc_loop_triangles()
E._pesos_cache.clear(); inicio = time.perf_counter()
w, tri = E._datos_pesos(ob, 'p', [k]); frio_ms = (time.perf_counter()-inicio)*1000
inicio = time.perf_counter()
esperados = [list(t.vertices) for t in dense.loop_triangles if max(w[i] for i in t.vertices) > .02]
anterior_ms = (time.perf_counter()-inicio)*1000
assert tri == esperados
inicio = time.perf_counter(); dense.calc_loop_triangles(); triangulacion_ms = (time.perf_counter()-inicio)*1000
tiempos = []
for _ in range(3):
    E._pesos_cache.clear(); inicio = time.perf_counter(); E._datos_pesos(ob, 'p', [k]); tiempos.append(round((time.perf_counter()-inicio)*1000, 2))
triarr = np.empty(len(dense.loop_triangles)*3, dtype=np.int32)
inicio = time.perf_counter(); dense.loop_triangles.foreach_get('vertices', triarr); lectura_ms = (time.perf_counter()-inicio)*1000
print('RLB_EDITOR_LATENCIA_OK '+json.dumps({'redibujados_cache': 100, 'cambios_externos_segundos': .5, 'subsurf_restaurado': True, 'consultas_calibracion': len(llamadas), 'pose_restaurada': True, 'triangulos': len(dense.loop_triangles), 'seleccionados': len(tri), 'frio_ms': round(frio_ms, 2), 'frio_repetido_ms': tiempos, 'filtrado_anterior_ms': round(anterior_ms, 2), 'triangulacion_ms': round(triangulacion_ms, 2), 'lectura_triangulos_ms': round(lectura_ms, 2)}))
