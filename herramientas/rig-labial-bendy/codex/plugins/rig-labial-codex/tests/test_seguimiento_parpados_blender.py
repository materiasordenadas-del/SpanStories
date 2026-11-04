"""Prueba aislada de la persistencia de IDs; aún no prueba reubicación."""
import importlib.util
import sys
import types
import json
import numpy as np
from pathlib import Path
import bpy
import bmesh

path = Path(__file__).parents[1] / 'assets/rig_labial_bendy/nucleo/facs/seguimiento_parpados.py'
pkg = types.ModuleType('seguimiento_test_pkg'); pkg.__path__ = [str(path.parent)]; sys.modules[pkg.__name__] = pkg
spec = importlib.util.spec_from_file_location('seguimiento_test_pkg.seguimiento_parpados', path)
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
sys.modules['seguimiento_test_pkg.editor'] = types.SimpleNamespace(_arr={})
me = bpy.data.meshes.new('seguimiento_test')
me.from_pydata([(x, 0, y) for y in range(3) for x in range(3)], [],
               [(0,1,4,3), (1,2,5,4), (3,4,7,6), (4,5,8,7)])
ob = bpy.data.objects.new('seguimiento_test', me); bpy.context.scene.collection.objects.link(ob)
uv = me.uv_layers.new(name='UVMap')
for loop in me.loops:
    co = me.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = (co.x / 2., co.z / 2.)
ob['rlb_borde_parpado'] = '{"sup_L": [0, 1, 2]}'
ob['aj_anclas'] = {'parpado_sup_1_L': 0, 'parpado_sup_2_L': 1, 'parpado_sup_3_L': 2}
ob['rlb_parpados_uv_seeds'] = [0, 3]
ob['rlb_delineado_caras'] = '[0, 3]'
M.preparar(ob)
assert not M.detectar(ob)['cambio']
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[0]], context='FACES_ONLY')
bm.to_mesh(me); bm.free(); me.update()
assert M.detectar(ob)['cambio']
refs = M.referencias_supervivientes(ob)
assert len(refs['semillas']) == 2 and refs['delineado'] == [2]
assert sorted(v.value for v in me.attributes[M.ATR_CARA].data) == [2, 3, 4]
assert sorted(v.value for v in me.attributes[M.ATR_VERTICE].data) == list(range(1,10))
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[0]], context='VERTS')
bm.to_mesh(me); bm.free(); me.update()
assert sorted(v.value for v in me.attributes[M.ATR_VERTICE].data) == list(range(2, 10))

seam = bpy.data.meshes.new('uv_fragmentada')
seam.from_pydata([(x, 0., z) for z in (0.,1.) for x in range(5)], [],
                 [(x,x+1,x+6,x+5) for x in range(4)])
obj = bpy.data.objects.new('uv_fragmentada', seam); bpy.context.scene.collection.objects.link(obj)
u = seam.uv_layers.new(name='UVMap')
for loop in seam.loops:
    co=seam.vertices[loop.vertex_index].co; u.data[loop.index].uv=(co.x/4.,co.z)
obj['rlb_borde_parpado'] = '{"sup_L": [0, 1, 2, 3, 4]}'
obj['aj_anclas'] = {'parpado_sup_1_L': 1, 'parpado_sup_2_L': 2, 'parpado_sup_3_L': 3}
obj['rlb_parpados_uv_seeds'] = [1]
M.preparar(obj)
bm=bmesh.new(); bm.from_mesh(seam); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[1]], context='FACES_ONLY'); bm.to_mesh(seam); bm.free(); seam.update()
try:
    M.referencias_supervivientes(obj)
    raise AssertionError('Debe rechazar UV fragmentada ambiguamente')
except RuntimeError as exc:
    assert 'ambigu' in str(exc)


def filas(borrar_vertices):
    from seguimiento_test_pkg import ajustes_ojos as AO
    verts = []
    num = 24
    for ring in range(5):
        r = 1 + .08 * ring
        for i in range(num):
            t = 2*np.pi*i/num
            verts.append((.03 + .01*r*np.cos(t), -.04, .90 + .006*r*np.sin(t)))
    faces = []
    for ring in range(4):
        for i in range(num):
            a=ring*num+i; b=ring*num+(i+1)%num
            faces.append((a,b,b+num,a+num))
    mesh = bpy.data.meshes.new('ojo_filas'); mesh.from_pydata(verts, [], faces); mesh.update()
    cara = bpy.data.objects.new('ojo_filas', mesh); bpy.context.scene.collection.objects.link(cara)
    ctrl = bpy.data.objects.new(cara.name+'_Cara_Control', None); bpy.context.scene.collection.objects.link(ctrl)
    cara['rlb_borde_parpado'] = json.dumps({'sup_L': list(range(12,-1,-1)), 'inf_L': list(range(12,24))+[0]})
    cara.shape_key_add(name='Basis'); blink=cara.shape_key_add(name='eyeBlink_L')
    for v, d in zip(verts, blink.data):
        d.co.z += -.003 if v[2] > .900001 else .003
    assert len(AO.asegurar(cara)) == 18
    ctrl['v_aj_parpado_sup_2_L_arriba'] = -.35
    ctrl.keyframe_insert(data_path='["v_aj_parpado_sup_2_L_arriba"]', frame=1)
    action = ctrl.animation_data.action.as_pointer()
    M.preparar(cara)
    registro_pre = cara[M.ESTADO]; bordes_pre = cara['rlb_borde_parpado']; anclas_pre = dict(cara['aj_anclas'])
    original_ciclos = M._ciclos
    M._ciclos = lambda obj: original_ciclos(obj) * 2
    try:
        try: M.actualizar(cara); raise AssertionError('Faltó rechazo por contorno ambiguo')
        except RuntimeError: pass
    finally: M._ciclos = original_ciclos
    assert cara[M.ESTADO] == registro_pre and cara['rlb_borde_parpado'] == bordes_pre and dict(cara['aj_anclas']) == anclas_pre
    ante = {k: mesh.attributes[M.ATR_VERTICE].data[int(i)].value for k, i in dict(cara['aj_anclas']).items()}
    props = {k: ctrl[k] for k in ctrl.keys()}
    keys = mesh.shape_keys.key_blocks
    ganancias = {n: np.linalg.norm((AO._co(keys[n])-AO._co(keys['Basis']))[int(cara['aj_anclas'][n[3:].rsplit('_',1)[0]])])
                 for n in AO.NOMBRES if n in keys}
    original_main = {mesh.attributes[M.ATR_VERTICE].data[i].value: tuple(v.co) for i, v in enumerate(keys['eyeBlink_L'].data)}
    if not borrar_vertices:
        reg = AO._registro(cara); quitar = sorted(reg)[:3]
        for n in quitar:
            cara.shape_key_remove(keys[n]); del reg[n]
        cara['aj_ojos_helpers'] = json.dumps(reg)
    for ring in range(2):
        bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
        bpy.context.view_layer.objects.active=cara; cara.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        M._timer()
        bm=bmesh.from_edit_mesh(mesh); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
        face_ids = bm.faces.layers.int.get(M.ATR_CARA)
        borrar = [f for f in bm.faces if 1+ring*num <= f[face_ids] <= (ring+1)*num]
        assert len(borrar)==num
        bmesh.ops.delete(bm, geom=borrar, context='FACES_ONLY')
        if borrar_vertices:
            vertex_ids = bm.verts.layers.int.get(M.ATR_VERTICE)
            vb = [v for v in bm.verts if 1+ring*num <= v[vertex_ids] <= (ring+1)*num]
            bmesh.ops.delete(bm, geom=vb, context='VERTS')
        bmesh.update_edit_mesh(mesh, loop_triangles=False, destructive=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        assert M.detectar(cara, True)['cambio']
        if ring == 0:
            old_border = cara['rlb_borde_parpado']; old_anclas = dict(cara['aj_anclas'])
            key = mesh.shape_keys.key_blocks['aj_parpado_sup_2_L_arriba']
            old_co = AO._co(key).copy(); original = AO.actualizar
            def fallar(obj, aplicar=False, **kw):
                if aplicar:
                    co = AO._co(key); co[0, 0] += .1; key.data.foreach_set('co', co.reshape(-1))
                    raise RuntimeError('fallo simulado')
                return original(obj, aplicar=aplicar, **kw)
            AO.actualizar = fallar
            try:
                try: M.actualizar(cara); raise AssertionError('Faltó fallo simulado')
                except RuntimeError: pass
            finally: AO.actualizar = original
            assert cara['rlb_borde_parpado'] == old_border and dict(cara['aj_anclas']) == old_anclas
            assert np.array_equal(AO._co(key), old_co)
            if not borrar_vertices:
                for objetivo in (1, 2):
                    antes_keys = {k.name for k in keys}; antes_reg = AO._registro(cara)
                    original_driver = AO._poner_driver; contador = [0]
                    def falla_driver(obj, nombre, expr, variables):
                        if nombre in quitar:
                            contador[0] += 1
                            if contador[0] == objetivo: raise RuntimeError('driver simulado')
                        return original_driver(obj, nombre, expr, variables)
                    AO._poner_driver = falla_driver
                    try:
                        try: M.actualizar(cara); raise AssertionError('Faltó fallo de driver')
                        except RuntimeError: pass
                    finally: AO._poner_driver = original_driver
                    assert {k.name for k in keys} == antes_keys and AO._registro(cara) == antes_reg
                    assert cara['rlb_borde_parpado'] == old_border and dict(cara['aj_anclas']) == old_anclas
        M._timer(); assert M.detectar(cara)['cambio']
        M._timer()
        assert not M.detectar(cara, True)['cambio'] and len(cara['aj_anclas']) == 6
        assert {k: ctrl[k] for k in ctrl.keys()} == props
        assert ctrl.animation_data.action.as_pointer() == action
        for n, ganancia in ganancias.items():
            a = int(cara['aj_anclas'][n[3:].rsplit('_',1)[0]])
            assert np.isclose(np.linalg.norm((AO._co(keys[n])-AO._co(keys['Basis']))[a]), ganancia, atol=1e-7)
        for i, key_v in enumerate(keys['eyeBlink_L'].data):
            ident = mesh.attributes[M.ATR_VERTICE].data[i].value
            assert tuple(key_v.co) == original_main[ident]
        nuevo = {k: mesh.attributes[M.ATR_VERTICE].data[int(i)].value for k, i in dict(cara['aj_anclas']).items()}
        assert nuevo != ante
        ante = nuevo
    return True


filas(False); filas(True)
print('RLB_SEGUIMIENTO_FILAS_OK')
