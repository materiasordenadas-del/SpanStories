"""Prueba aislada de influencias y protección de grupos; no abre un .blend."""
import ast
import importlib
import types
from pathlib import Path
import bpy
import numpy as np

fixture = Path(__file__).with_name('test_regenerar_parpados_blender.py')
arbol = ast.parse(fixture.read_text(encoding='utf-8'))
seleccion = [n for n in arbol.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.Assign)) or
             isinstance(n, ast.FunctionDef) and n.name == 'crear']
ns = {'__file__': str(fixture)}
exec(compile(ast.Module(body=seleccion, type_ignores=[]), str(fixture), 'exec'), ns)
AO = ns['AO']; PP = importlib.import_module(ns['pkg'].__name__ + '.pesos_parpados')
UI = importlib.import_module(ns['pkg'].__name__ + '.pesos_parpados_ui')
cara, ctrl = ns['crear'](1., 1., 1., 'test_pesos')
AO.asegurar(cara)
ctrl['prueba'] = .37; ctrl.keyframe_insert(data_path='["prueba"]', frame=1)
accion = ctrl.animation_data.action
kb = cara.data.shape_keys.key_blocks; punto = 'parpado_sup_2_L'; nombre = f'aj_{punto}_arriba'
ancla = int(cara['aj_anclas'][punto]); base = AO._co(kb['Basis'])
ganancia = np.linalg.norm(AO._co(kb[nombre])[ancla] - base[ancla])
ajeno = AO._co(kb['aj_user_boca']).copy(); otro = AO._co(kb['aj_parpado_inf_2_R_arriba']).copy()
g_ajeno = cara.vertex_groups.new(name='grupo_ajeno'); g_ajeno.add([0], .4, 'REPLACE'); g_ajeno.lock_weight = False
helpers = sorted(n for n in AO._registro(cara) if n.startswith('apc_' + punto + '_'))
assert helpers
helpers_base = {n: AO._co(kb[n]) - base for n in helpers}
PP.aplicar(cara, punto, 0., 1., 1.)
assert np.linalg.norm(AO._co(kb[nombre])[ancla] - base[ancla]) < 1e-9
assert all(np.allclose(AO._co(kb[n]) - base, 0., atol=1e-9) for n in helpers)
PP.aplicar(cara, punto, 2., 1., 1.)
assert np.isclose(np.linalg.norm(AO._co(kb[nombre])[ancla] - base[ancla]), 2 * ganancia, rtol=1e-4)
assert all(np.allclose(AO._co(kb[n]) - base, 2 * helpers_base[n], atol=1e-8) for n in helpers)
normal = AO._co(kb[nombre]).copy()
PP.aplicar(cara, punto, 2., 1.6, 1.6)
assert not np.allclose(AO._co(kb[nombre]), normal, atol=1e-8)
PP.aplicar(cara, punto, 2., 1., 1.)
assert np.allclose(AO._co(kb[nombre]), normal, atol=1e-8)
g = PP.preparar_grupo(cara, punto)
g.add([ancla], 1., 'REPLACE')
pesos_auto = PP.pesos(cara, punto)
soporte = next(i for i, w in enumerate(pesos_auto) if i != ancla and w > .3)
g.add([soporte], .2, 'REPLACE')
PP.aplicar(cara, punto, 2., 1., 1., manual=True)
assert punto in PP.leer_opciones(cara)['mascaras']
assert not np.allclose(AO._co(kb[nombre])[soporte], normal[soporte], atol=1e-8)
PP.volver_automatico(cara, punto)
assert punto not in PP.leer_opciones(cara)['mascaras'] and punto in PP.datos(cara)['manuales']
assert np.allclose(AO._co(kb[nombre]), normal, atol=1e-8)

def instantanea():
    drivers = tuple(sorted((f.data_path, f.driver.expression,
                     tuple(sorted((v.name, v.targets[0].id.name, v.targets[0].data_path) for v in f.driver.variables)))
                     for f in cara.data.shape_keys.animation_data.drivers))
    return (tuple((k.name, AO._co(k).tobytes(), k.value) for k in kb),
            cara.get('aj_ojos_helpers'), cara.get(PP.PROPIEDAD), drivers)

antes = instantanea(); poner_driver = AO._poner_driver; fallos = []
def falla_una_vez(*args, **kwargs):
    if not fallos:
        fallos.append(True)
        raise RuntimeError('fallo de driver inyectado')
    return poner_driver(*args, **kwargs)
AO._poner_driver = falla_una_vez
try:
    try: PP.aplicar(cara, punto, 1.5, 1.2, 1.2)
    except RuntimeError as exc: assert 'fallo de driver inyectado' in str(exc)
    else: raise AssertionError('No se produjo el fallo inyectado')
finally:
    AO._poner_driver = poner_driver
despues = instantanea()
assert fallos and despues == antes, ('Rollback no restauró coordenadas, registro, configuración o drivers',
    [i for i, (a, b) in enumerate(zip(antes, despues)) if a != b],
    list(set(antes[3]) - set(despues[3]))[:2], list(set(despues[3]) - set(antes[3]))[:2])
assert np.array_equal(AO._co(kb['aj_user_boca']), ajeno)
assert np.array_equal(AO._co(kb['aj_parpado_inf_2_R_arriba']), otro)
assert ctrl.animation_data.action == accion and abs(g_ajeno.weight(0)-.4) < 1e-6

class Addons(list):
    def get(self, name): return next((a for a in self if a.module == name), None)
prefs = types.SimpleNamespace(**{n: True for n in UI.EASY})
addon = types.SimpleNamespace(module='bl_ext.user_default.easyweight', preferences=prefs)
ctx = types.SimpleNamespace(scene=bpy.context.scene, preferences=types.SimpleNamespace(addons=Addons([addon])))
ts = ctx.scene.tool_settings
anterior = {n: getattr(ts, n) for n in ('use_auto_normalize', 'use_multipaint')}
UI._proteger(cara, punto, ctx)
assert all(not getattr(prefs, n) for n in UI.EASY) and g_ajeno.lock_weight and not g.lock_weight
assert not ts.use_auto_normalize and not ts.use_multipaint
UI._restaurar(cara, ctx)
assert all(getattr(prefs, n) for n in UI.EASY) and not g_ajeno.lock_weight
assert all(getattr(ts, n) == v for n, v in anterior.items())
print('OK: intensidad 0/2, extensiones reversibles, manual, acción y grupos ajenos, protección EasyWeight simulada')
