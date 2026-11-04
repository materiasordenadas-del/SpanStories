"""Integración aislada: regeneración y respaldo de ajustes palpebrales."""
import bpy
import importlib
import json
import sys
import tempfile
import types
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parents[1]
pkg = types.ModuleType('rlb_regresion_pesos')
pkg.__path__ = [str(ROOT / 'assets/rig_labial_bendy/nucleo/facs')]
sys.modules[pkg.__name__] = pkg
AO = importlib.import_module(pkg.__name__ + '.ajustes_ojos')
C = importlib.import_module(pkg.__name__ + '.construir')


def crear(scale, curva, reflejo, sufijo, topologia=False):
    verts, faces, bordes, domains = [], [], {}, {}
    for s, cx in (('R', -.025), ('L', .025)):
        domains[s] = []
        for lab, sg in (('sup', 1.), ('inf', -1.)):
            inicio = len(verts)
            for j in range(3):
                for x in np.linspace(-.01, .01, 11):
                    verts.append((reflejo * scale * (cx + x), scale * (-.035 + curva*.003*(x/.01)**2), scale * (sg*(.006-.003*(x/.01)**2+j*.001))))
                    domains[s].append(len(verts)-1)
            bordes[lab+'_'+s] = list(range(inicio, inicio+11))
            for j in range(2):
                for i in range(10):
                    a = inicio+j*11+i
                    faces.append((a, a+1, a+12, a+11))
    if topologia:
        faces[0] = (0, 1, 12)  # Misma Basis y cantidad de vértices, distinta conectividad.
    verts.append((0., 0., -.2*scale))
    mesh = bpy.data.meshes.new('piel_'+sufijo)
    mesh.from_pydata(verts, [], faces); mesh.update()
    cara = bpy.data.objects.new('Cara_'+sufijo, mesh)
    bpy.context.scene.collection.objects.link(cara)
    ctrl = bpy.data.objects.new(cara.name+'_Cara_Control', None)
    bpy.context.scene.collection.objects.link(ctrl)
    cara['rlb_borde_parpado'] = json.dumps(bordes)
    cara.shape_key_add(name='Basis')
    B = np.array(verts)
    for s, ids in domains.items():
        delta = np.zeros_like(B)
        for i in ids:
            delta[i, 2] = -np.sign(B[i, 2]) * .004 * scale
        C.poner_key(cara, 'eyeBlink_'+s, delta, .45)
    delta = np.zeros_like(B); delta[-1, 0] = .001*scale
    C.poner_key(cara, 'aj_user_boca', delta, .25, (-1., 1.))
    return cara, ctrl


def estado(cara, ctrl):
    sk = cara.data.shape_keys
    return (tuple((k.name, AO._co(k).tobytes(), k.value, k.relative_key.name) for k in sk.key_blocks),
            json.dumps({k: (cara[k].to_dict() if hasattr(cara[k], 'to_dict') else cara[k]) for k in cara.keys()}, sort_keys=True),
            json.dumps({k: ctrl[k] for k in ctrl.keys()}, sort_keys=True),
            tuple((f.data_path, f.driver.expression, tuple((v.name, v.targets[0].id.name, v.targets[0].data_path) for v in f.driver.variables)) for f in sk.animation_data.drivers),
            ctrl.animation_data.action.as_pointer())


def rechazo(fn, cara, ctrl):
    antes = estado(cara, ctrl)
    try:
        fn()
    except RuntimeError:
        pass
    else:
        raise AssertionError('Se esperaba rechazo')
    assert estado(cara, ctrl) == antes, 'El rechazo modificó datos'


def caso(scale, curva, reflejo, sufijo, temp):
    cara, ctrl = crear(scale, curva, reflejo, sufijo)
    assert len(AO.asegurar(cara)) == 36
    assert cara['aj_ojos_version'] == AO.VERSION
    assert AO.asegurar(cara) == []
    kb = cara.data.shape_keys.key_blocks
    ctrl['expresion_prueba'] = .37
    ctrl.keyframe_insert(data_path='["expresion_prueba"]', frame=1)
    for n in sorted(AO.NOMBRES):
        ctrl['v_'+n] = .27
    ctrl.update_tag(); bpy.context.view_layer.update()
    # Simula pesos anteriores sin alterar la ganancia en las anclas.
    anclas = dict(cara['aj_anclas']); base = AO._co(kb['Basis'])
    for n in AO.NOMBRES:
        punto = n[3:].rsplit('_', 1)[0]; a = int(anclas[punto])
        co = AO._co(kb[n]); delta = co-base; ancla = delta[a].copy()
        delta *= .3; delta[a] = ancla
        kb[n].data.foreach_set('co', (base+delta).reshape(-1))
    cara['aj_ojos_version'] = 1
    viejo = estado(cara, ctrl)
    assert AO.asegurar(cara) == [] and estado(cara, ctrl) == viejo
    preview = AO.actualizar(cara)
    assert preview['keys'] == 36 and not preview['aplicado']
    assert estado(cara, ctrl) == viejo, 'La previsualización escribió datos'
    ganancias = {n: np.linalg.norm(AO._co(kb[n])[int(anclas[n[3:].rsplit('_', 1)[0]])]-base[int(anclas[n[3:].rsplit('_', 1)[0]])]) for n in AO.NOMBRES}
    aplicado = AO.actualizar(cara, aplicar=True)
    assert aplicado['keys'] == 36 and aplicado['aplicado']
    nuevo = estado(cara, ctrl)
    assert nuevo[2:] == viejo[2:] and dict(cara['aj_anclas']) == anclas
    assert cara['aj_ojos_version'] == AO.VERSION
    for n in AO.NOMBRES:
        a = int(anclas[n[3:].rsplit('_', 1)[0]])
        assert np.isclose(np.linalg.norm(AO._co(kb[n])[a]-base[a]), ganancias[n], rtol=1e-5, atol=1e-9)
        anterior = next(x for x in viejo[0] if x[0] == n)
        posterior = next(x for x in nuevo[0] if x[0] == n)
        assert posterior[2:] == anterior[2:]
    for n in ('Basis', 'eyeBlink_R', 'eyeBlink_L', 'aj_user_boca'):
        old = next(x for x in viejo[0] if x[0] == n)
        assert next(x for x in nuevo[0] if x[0] == n) == old
    assert AO.actualizar(cara, aplicar=True)['keys'] == 0
    assert estado(cara, ctrl) == nuevo
    ruta = str(Path(temp) / (sufijo+'.npz'))
    assert AO.respaldar(cara, ruta)['keys'] == 36
    respaldo = {n: AO._co(kb[n]).copy() for n in AO.NOMBRES}
    h_nombre = next(iter(AO._registro(cara)))
    h_antes = AO._co(kb[h_nombre]).copy()
    h_modificado = h_antes.copy(); h_modificado[0, 0] += .001 * scale
    kb[h_nombre].data.foreach_set('co', h_modificado.reshape(-1))
    for n in AO.NOMBRES:
        co = AO._co(kb[n]); co[0, 0] += .001*scale
        kb[n].data.foreach_set('co', co.reshape(-1))
    AO.restaurar(cara, ruta)
    assert all(np.array_equal(AO._co(kb[n]), respaldo[n]) for n in AO.NOMBRES)
    assert np.array_equal(AO._co(kb[h_nombre]), h_antes)
    key = kb[sorted(AO.NOMBRES)[0]]
    key.relative_key = kb['aj_user_boca']
    rechazo(lambda: AO.actualizar(cara, aplicar=True), cara, ctrl)
    rechazo(lambda: AO.restaurar(cara, ruta), cara, ctrl)
    key.relative_key = kb['Basis']
    basis = AO._co(kb['Basis']); cambiado = basis.copy(); cambiado[0, 0] += .001*scale
    kb['Basis'].data.foreach_set('co', cambiado.reshape(-1))
    rechazo(lambda: AO.restaurar(cara, ruta), cara, ctrl)
    kb['Basis'].data.foreach_set('co', basis.reshape(-1))
    otra, otro_ctrl = crear(scale, curva, reflejo, sufijo+'_topologia', True)
    AO.asegurar(otra)
    otro_ctrl['expresion_prueba'] = .37; otro_ctrl.keyframe_insert(data_path='["expresion_prueba"]', frame=1)
    nombre = cara.name; cara.name = nombre+'_original'; otra.name = nombre
    rechazo(lambda: AO.restaurar(otra, ruta), otra, otro_ctrl)
    return {'escala': scale, 'curva': curva, 'reflejo': reflejo, 'keys': aplicado['keys']}


def instalacion_parcial():
    cara, ctrl = crear(1., 1., 1., 'parcial')
    shapes, _ = AO.plan(cara)
    n = sorted(shapes)[0]
    C.poner_key(cara, n, shapes[n] * .4, .33, (-1., 1.))
    antes = AO._co(cara.data.shape_keys.key_blocks[n]).copy()
    cara['aj_ojos_version'] = 1
    assert len(AO.asegurar(cara)) == 35
    assert cara['aj_ojos_version'] == 1
    assert np.array_equal(antes, AO._co(cara.data.shape_keys.key_blocks[n]))
    assert AO.asegurar(cara) == []
    assert cara['aj_ojos_version'] == 1


def prueba_cierre(temp):
    cara, ctrl = crear(1., 1., 1., 'cierre')
    kb = cara.data.shape_keys.key_blocks; base = AO._co(kb['Basis'])
    ctrl['blink'] = 0.; ctrl['wide'] = 0.
    ctrl['expresion_prueba'] = .37; ctrl.keyframe_insert(data_path='["expresion_prueba"]', frame=1)
    reglas = {}
    for s in ('L', 'R'):
        main = AO._co(kb['eyeBlink_'+s])-base
        for name, delta in (('eyeBlink_mid_'+s, main*.14), ('eyeWide_'+s, -main*.18),
                            ('eyeBlink_safe_250000_'+s, main*.06), ('eyeWide_safe_500000_'+s, main*.09)):
            C.poner_key(cara, name, delta, 0., (-1., 1.))
        reglas['eyeBlink_safe_250000_'+s] = {'tipo':'blink_hat', 'a':0., 't':.25, 'b':.5}
        reglas['eyeWide_safe_500000_'+s] = {'tipo':'wide_hat', 'a':0., 't':.5, 'b':1.}
        for n, path, expr in (('eyeBlink_'+s,'blink','v'), ('eyeBlink_mid_'+s,'blink','max(0,min(2*v,2*(1-v)))'),
                              ('eyeBlink_safe_250000_'+s,'blink','max(0,min(v/.25,(.5-v)/.25))'),
                              ('eyeWide_'+s,'wide','v'), ('eyeWide_safe_500000_'+s,'wide','max(0,min(v/.5,(1-v)/.5))')):
            d = kb[n].driver_add('value').driver; var=d.variables.new(); var.name='v'; var.type='SINGLE_PROP'
            var.targets[0].id = ctrl; var.targets[0].data_path = f'["{path}"]'; d.expression=expr
    cara['rlb_parpados_reglas'] = json.dumps(reglas)
    assert len(AO.asegurar(cara)) == 36
    anclas = dict(cara['aj_anclas']); helpers = AO._registro(cara)
    assert helpers and len(AO.NOMBRES) == 36
    props_antes = set(ctrl.keys())
    def posicion(i):
        ctrl.update_tag(); bpy.context.view_layer.update()
        return np.asarray(cara.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices[i].co[:])
    for lab in ('sup', 'inf'):
        punto = f'parpado_{lab}_2_L'; idx = int(anclas[punto]); prop='v_aj_'+punto+'_arriba'
        dmain = AO._co(kb['eyeBlink_L'])[idx]-base[idx]
        prim = AO._co(kb['aj_'+punto+'_arriba'])[idx]-base[idx]
        for b in (0., .5, 1.):
            for w in (0., .6):
                ctrl['blink']=b; ctrl['wide']=w; ctrl[prop]=0.; posicion(idx)
                ctrl[prop]=-1. if lab == 'sup' else 1.
                esperado = base[idx]+dmain + prim*b*(-1 if lab == 'sup' else 1)
                np.testing.assert_allclose(posicion(idx), esperado, atol=2e-6)
                if b == 1.:
                    ctrl[prop] = 0.; sin_punto = posicion(idx)
                    ctrl[prop] = -1. if lab == 'sup' else 1.
                    movimiento = posicion(idx) - sin_punto
                    assert movimiento[2] * (-1 if lab == 'sup' else 1) > 1e-6, 'El cierre general anuló el punto'
        ctrl['blink']=0.; ctrl['wide']=0.; ctrl[prop]=0.; neutral=posicion(idx)
        ctrl[prop]=1. if lab == 'sup' else -1.
        apertura=posicion(idx); prim=AO._co(kb['aj_'+punto+'_arriba'])[idx]-base[idx]
        np.testing.assert_allclose(apertura-neutral, prim*(1 if lab=='sup' else -1), atol=2e-6)
        ctrl[prop]=0.
    assert set(ctrl.keys()) == props_antes
    # Respaldo antiguo sin helpers y restauración selectiva tras regeneración explícita.
    for n in list(helpers): cara.shape_key_remove(kb[n])
    cara['aj_ojos_helpers']='{}'; cara['aj_ojos_version']=1
    nombres=sorted(AO.NOMBRES); coords=np.asarray([AO._co(kb[n]).reshape(-1) for n in nombres])
    from rlb_regresion_pesos.mascaras_labios import _firma_malla
    ruta=str(Path(temp)/'legacy.npz')
    np.savez_compressed(ruta, nombres=np.asarray(nombres), coords=coords, cara=np.asarray(cara.name),
                        firma=np.asarray(_firma_malla(cara)), anclas=np.asarray(json.dumps(anclas)), version=np.asarray(1))
    estado_antes=estado(cara, ctrl)
    assert AO.actualizar(cara)['correctivas'] > 0
    AO.actualizar(cara, aplicar=True)
    assert AO.actualizar(cara)['keys'] == 0
    AO.restaurar(cara, ruta)
    despues=estado(cara, ctrl)
    assert despues[0] == estado_antes[0] and despues[2:] == estado_antes[2:]
    assert AO._registro(cara) == {} and cara['aj_ojos_version'] == 1


def prueba_driver_intervalo_irregular():
    cara, ctrl = crear(1., 1., 1., 'driver_intervalo')
    base = AO._co(cara.data.shape_keys.reference_key)
    main = AO._co(cara.data.shape_keys.key_blocks['eyeBlink_L']) - base
    C.poner_key(cara, 'eyeBlink_safe_981250_L', main*.03, 0., (-1., 1.))
    cara['rlb_parpados_reglas'] = json.dumps({'eyeBlink_safe_981250_L':
        {'tipo': 'blink_hat', 'a': .9375, 't': .98125, 'b': .984375}})
    AO.asegurar(cara)
    kb = cara.data.shape_keys.key_blocks
    for n, spec in AO._registro(cara).items():
        f = next(f for f in cara.data.shape_keys.animation_data.drivers if f.data_path == kb[n].path_from_id('value'))
        assert f.driver.expression == spec['expresion'] and len(f.driver.expression.encode('utf8')) <= 255
        compile(f.driver.expression, '<driver de Blender>', 'eval')
    # Las hats retiradas del cierre no pueden seguir activas en los puntos.
    cara['rlb_parpados_reglas'] = json.dumps({'eyeBlink_safe_981250_L': {'tipo': 'inactivo'}})
    AO.actualizar(cara, aplicar=True)
    for n, spec in AO._registro(cara).items():
        if n.endswith('_bs981250'):
            assert spec['expresion'] == '0' and np.array_equal(AO._co(kb[n]), base)


with tempfile.TemporaryDirectory(prefix='rlb_regresion_') as temp:
    resultados = [caso(*v, temp) for v in ((.5, 0., 1., 'plano'), (1., 1., 1., 'curvo'), (2., 2., -1., 'reflejado'))]
    instalacion_parcial()
    prueba_cierre(temp)
    prueba_driver_intervalo_irregular()
print('RLB_REGENERAR_TEST_OK '+json.dumps(resultados))
