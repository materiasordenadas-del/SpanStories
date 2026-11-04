"""Transacción de cierre sin ejecutar el solver costoso: ejecutar con Blender background."""
import bpy
import importlib
import json
import sys
import types
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parents[1]
pkg = types.ModuleType('rlb_transaccion_test')
pkg.__path__ = [str(ROOT / 'assets/rig_labial_bendy/nucleo/facs')]
sys.modules[pkg.__name__] = pkg
M = importlib.import_module(pkg.__name__ + '.regenerar_cierre_parpados')

mesh = bpy.data.meshes.new('transaccion_piel')
mesh.from_pydata([(0,0,0), (1,0,0), (0,1,0), (1,1,0)], [], [(0,1,2),(1,3,2)])
cara = bpy.data.objects.new('transaccion_cara', mesh)
bpy.context.scene.collection.objects.link(cara)
cara.shape_key_add(name='Basis')
for n in sorted(M.PRINCIPALES): cara.shape_key_add(name=n)
ctrl = bpy.data.objects.new(cara.name + '_Control_Parpados', None)
bpy.context.scene.collection.objects.link(ctrl)
M.PA._controles(cara, {n: None for n in M.PRINCIPALES}, {})
cara['rlb_parpados_generadas'] = json.dumps(sorted(M.PRINCIPALES))
cara['rlb_parpados_reglas'] = '{}'
cara['rlb_pesos_parpados'] = 'config-inalterada'
cara['aj_ojos_helpers'] = '{}'
M.AO._verificar_propios = lambda *args: None
base = M.AO._co(mesh.shape_keys.reference_key)
keys = {n: np.ones_like(base)*.01 for n in M.PRINCIPALES}
extra = 'eyeBlink_safe_250000_L'
keys[extra] = np.ones_like(base)*.002
info = {s: {'reglas': {}, 'validacion': {'poses':325,'fallos':[]},
            'combinaciones_ambos_ojos':36, 'miradas':{'fallos':0},
            'cierre_visible':{str(a): {'muestras_reposo':1,'visibles_cerrado':0} for a in (0,32,-32)}} for s in ('L','R')}
info['L']['reglas'][extra] = {'tipo':'blink_hat','a':0.,'t':.25,'b':.5}
K = types.SimpleNamespace(P=base.copy(), firma_cierre=M.firma(cara))
original = {n: M.AO._co(mesh.shape_keys.key_blocks[n]).copy() for n in M.PRINCIPALES}
def fallo(cara, aplicar):
    cara['aj_ojos_helpers'] = '{"alterado":true}'
    attr = cara.data.attributes.new('rlb_isla_uv_persistente', 'INT', 'FACE')
    attr.data.foreach_set('value', np.ones(len(attr.data),dtype=np.int32))
    raise RuntimeError('fallo inyectado')
M.AO.actualizar = fallo
try:
    M.aplicar_plan(cara, K, keys, info)
    raise AssertionError('No rechazó fallo inyectado')
except RuntimeError as exc:
    assert 'fallo inyectado' in str(exc)
assert extra not in mesh.shape_keys.key_blocks
assert cara['aj_ojos_helpers'] == '{}' and cara['rlb_pesos_parpados'] == 'config-inalterada'
assert mesh.attributes.get('rlb_isla_uv_persistente') is None
for n, co in original.items(): np.testing.assert_array_equal(M.AO._co(mesh.shape_keys.key_blocks[n]), co)
M._verificar(cara, set(M.PRINCIPALES), {})
M.AO.actualizar = lambda cara, aplicar: {'aplicado': aplicar}
result = M.aplicar_plan(cara, K, keys, info)
assert extra in mesh.shape_keys.key_blocks and result['ajustes']['aplicado']
assert cara['rlb_pesos_parpados'] == 'config-inalterada'
M.restaurar_plan(cara, result['archivo_respaldo'])
assert extra not in mesh.shape_keys.key_blocks
for n, co in original.items(): np.testing.assert_array_equal(M.AO._co(mesh.shape_keys.key_blocks[n]), co)
f = M._drivers(mesh.shape_keys)[mesh.shape_keys.key_blocks['eyeBlink_L'].path_from_id('value')]
f.driver.expression = '0.5'
try:
    M.aplicar_plan(cara, K, keys, info)
    raise AssertionError('Se aceptó un driver modificado')
except RuntimeError as exc:
    assert 'Driver palpebral modificado' in str(exc)
f.driver.expression = 'max(0,v)'
assert extra not in mesh.shape_keys.key_blocks
K.firma_cierre = 'incorrecta'
try:
    M.aplicar_plan(cara, K, keys, info)
    raise AssertionError('Firma incompatible aceptada')
except RuntimeError as exc:
    assert 'Firma' in str(exc)

# El canal de tensión existente también puede depender de un hueso/transform.
# El respaldo debe recuperar ese driver sin convertirlo en SINGLE_PROP.
key=cara.shape_key_add(name='eyeSquint_L')
f=key.driver_add('value');f.driver.type='SCRIPTED';f.driver.expression='v+z'
v=f.driver.variables.new();v.name='v';v.type='SINGLE_PROP';v.targets[0].id=ctrl;v.targets[0].data_path='["parpadeo_L"]'
v=f.driver.variables.new();v.name='z';v.type='TRANSFORMS';v.targets[0].id=ctrl;v.targets[0].transform_type='LOC_Z';v.targets[0].transform_space='LOCAL_SPACE'
snap=M._snap(cara,{'eyeSquint_L'});ruta=M.guardar_respaldo(cara,snap)
f.driver.expression='0';M.restaurar_plan(cara,ruta)
f=M._drivers(mesh.shape_keys)[key.path_from_id('value')]
assert f.driver.expression=='v+z'
v=next(v for v in f.driver.variables if v.name=='z')
assert v.type=='TRANSFORMS' and v.targets[0].id==ctrl and v.targets[0].transform_type=='LOC_Z' and v.targets[0].transform_space=='LOCAL_SPACE'
print('TRANSACCION_CIERRE_OK')
