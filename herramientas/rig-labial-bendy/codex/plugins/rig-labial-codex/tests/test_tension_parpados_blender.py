"""Pruebas aisladas de composición y transacción AU7."""
import ast
import importlib
from pathlib import Path
import numpy as np

fixture = Path(__file__).with_name('test_regenerar_parpados_blender.py')
arbol = ast.parse(fixture.read_text(encoding='utf-8'))
seleccion = [n for n in arbol.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.Assign)) or
             isinstance(n, ast.FunctionDef) and n.name == 'crear']
ns = {'__file__': str(fixture)}
exec(compile(ast.Module(body=seleccion, type_ignores=[]), str(fixture), 'exec'), ns)
AO, C = ns['AO'], ns['C']
T = importlib.import_module(ns['pkg'].__name__ + '.tension_parpados')
cara, ctrl = ns['crear'](1., 1., 1., 'AU7')
base = AO._co(cara.data.shape_keys.reference_key)
for lado in ('L', 'R'):
    C.poner_key(cara, 'eyeSquint_' + lado, np.zeros_like(base), .0)
    d = np.zeros_like(base); d[-1, 2] = .0007
    C.poner_key(cara, 'cheekSquint_' + lado, d, .7)
ctrl['prueba'] = .37; ctrl.keyframe_insert(data_path='["prueba"]', frame=1)
action = ctrl.animation_data.action; kb = cara.data.shape_keys.key_blocks
import bpy
par=bpy.data.objects.new(cara.name+'_Control_Parpados',None);bpy.context.scene.collection.objects.link(par)
enlaces={}
for lado in ('L','R'):
    ctrl['v_eyeBlink_'+lado]=0.;ctrl['v_eyeSquint_'+lado]=0.
    ruta='["parpadeo_'+lado+'"]';par['parpadeo_'+lado]=0.
    f=par.driver_add(ruta);f.driver.expression='min(1,max(0,b+.42*s))'
    for n,prop in (('b','v_eyeBlink_'+lado),('s','v_eyeSquint_'+lado)):
        v=f.driver.variables.new();v.name=n;v.type='SINGLE_PROP';v.targets[0].id=ctrl;v.targets[0].data_path='["'+prop+'"]'
    enlaces[ruta]=f.driver.expression
cheeks = {s: AO._co(kb['cheekSquint_' + s]).copy() for s in ('L', 'R')}
fuentes = [f'{n}_{s}' for n in ('eyeBlink', 'eyeSquint') for s in ('L', 'R')]
deltas = {}
for lado in ('L', 'R'):
    d = np.zeros_like(base); d[5 if lado == 'R' else 71, 2] = .0004
    deltas['eyeSquint_' + lado] = d
plan = {'firma': T.RC.firma(cara), 'fuentes': fuentes, 'digest': T._digest(cara, fuentes),
        'deltas': deltas, 'soportes': {n: np.any(d != 0., axis=1) for n, d in deltas.items()},
        'informe': {s: {'poses': 25, 'fallos': []} for s in ('L', 'R')}}
for b in (0., .25, .5, .75, 1.):
    for s in (0., .25, .5, .75, 1.):
        blink = np.ones_like(base) * b
        t = deltas['eyeSquint_L']
        assert np.array_equal(T.combinar(blink, t, b, s), blink + (1-b)*s*t)
        if b == 1. or s == 0.: assert np.array_equal(T.combinar(blink, t, b, s), blink)
co_antes = {n: AO._co(kb[n]).copy() for n in kb.keys()}
setter = T.RC._set_driver; calls = []
def falla(*args, **kwargs):
    if not calls:
        calls.append(1); raise RuntimeError('fallo inyectado')
    return setter(*args, **kwargs)
T.RC._set_driver = falla
try:
    try: T.aplicar_plan(cara, plan)
    except RuntimeError as e: assert 'inyectado' in str(e)
    else: raise AssertionError('Falló la prueba de rollback')
finally: T.RC._set_driver = setter
assert set(kb.keys()) == set(co_antes) and T.PROPIEDAD not in cara
assert all(np.array_equal(AO._co(kb[n]), co) for n, co in co_antes.items())
T.aplicar_plan(cara, plan)
for ruta in enlaces:
    exp=T.RC._drivers(par)[ruta].driver.expression
    assert abs(eval(exp,{'min':min,'max':max},{'b':.2,'s':.8})-.2)<1e-9
for lado in ('L', 'R'):
    assert np.allclose(AO._co(kb['eyeSquint_' + lado]) - base, deltas['eyeSquint_' + lado], atol=1e-8)
    assert np.allclose(AO._co(kb['eyeBlink_eyeSquint_' + lado]) - base, -deltas['eyeSquint_' + lado], atol=1e-8)
    f = T.RC._drivers(cara.data.shape_keys)[kb['eyeBlink_eyeSquint_' + lado].path_from_id('value')]
    assert f.driver.expression == 'b*s'
    assert np.array_equal(AO._co(kb['cheekSquint_' + lado]), cheeks[lado])
    assert kb['cheekSquint_' + lado].value == np.float32(.7)
assert ctrl.animation_data.action == action
T.restaurar(cara)
assert all(T.RC._drivers(par)[ruta].driver.expression==exp for ruta,exp in enlaces.items())
assert set(kb.keys()) == set(co_antes) and T.PROPIEDAD not in cara
assert all(np.array_equal(AO._co(kb[n]), co) for n, co in co_antes.items())

# Compatibilidad con correctivas del pipeline FACS ya construidas.
for lado in ('L','R'):
    n='eyeBlink_eyeSquint_'+lado
    C.poner_key(cara,n,-deltas['eyeSquint_'+lado]*.5)
    C.driver_producto(cara,n,('eyeBlink_'+lado,'eyeSquint_'+lado))
anteriores={n:AO._co(kb[n]).copy() for n in ('eyeBlink_eyeSquint_L','eyeBlink_eyeSquint_R')}
T.aplicar_plan(cara,plan);T.restaurar(cara)
for n,co in anteriores.items():
    assert np.array_equal(AO._co(kb[n]),co)
    assert T.RC._drivers(cara.data.shape_keys)[kb[n].path_from_id('value')].driver.expression=='v0*v1'
print('OK AU7 composición 25 combinaciones, preservar mejillas y acción, rollback y restauración')
