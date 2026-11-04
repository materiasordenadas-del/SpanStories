"""Regresión de caras interiores, pesos alternativos, simetría y vuelta exacta."""
import bpy
import bmesh
import hashlib
import importlib
import json
import sys
import types
from pathlib import Path
import numpy as np

raiz = Path(__file__).parents[1] / 'assets/rig_labial_bendy/nucleo/facs'
paquete = types.ModuleType('rlb_facs_manual_test'); paquete.__path__ = [str(raiz)]
sys.modules[paquete.__name__] = paquete
AJ = importlib.import_module(paquete.__name__ + '.ajustes')
M = importlib.import_module(paquete.__name__ + '.labios_manual')


def firmas(cara):
    return {k.name: hashlib.sha256(M._coords(cara, k).astype(np.float32).tobytes()).hexdigest()
            for k in cara.data.shape_keys.key_blocks}


def fixture(nombre, cx, hw):
    vertices, caras = [], []
    for lab, signo in (('sup', 1), ('inf', -1)):
        for interior in (False, True):
            inicio = len(vertices)
            for x in np.linspace(-1, 1, 9):
                for dz in (-0.035, 0.035):
                    vertices.append((cx + x * hw, (-0.3 + (0.16 if interior else 0.)) * hw,
                                     0.7 + (signo * 0.2 * (1 - x * x) + dz) * hw))
            for i in range(8):
                a = inicio + 2 * i; caras.append((a, a + 2, a + 3, a + 1))
    me = bpy.data.meshes.new(nombre); me.from_pydata(vertices, [], caras); me.update()
    cara = bpy.data.objects.new(nombre, me); bpy.context.scene.collection.objects.link(cara)
    cara.shape_key_add(name='Basis')
    P = M._base(cara)
    anclas = {'comisura_L': 16, 'comisura_R': 0}
    for lab, offset in (('sup', 0), ('inf', 36)):
        for s, i in (('L', 12), ('R', 4)):
            p = f'labio_{lab}_{s}'; anclas[p] = offset + i
            w = np.exp(-((P[:, 0] - P[offset + i, 0]) / (0.3 * hw)) ** 2)
            for d, eje in (('arriba', (0, 0, 1)), ('derecha', (1, 0, 0)), ('adelante', (0, -1, 0))):
                AJ.poner_key(cara, AJ.nombre(p, d), w[:, None] * np.array(eje) * 0.08 * hw, 0.17, (-1., 1.))
    AJ.poner_key(cara, 'eyeBlink_L', np.ones_like(P) * hw * 0.001, 0.31)
    cara['aj_anclas'] = anclas
    cara['aj_superficies_labios'] = {p: {'tri': [i] * 3, 'w': [1., 0., 0.]}
                                    for p, i in anclas.items() if p.startswith('labio_')}
    g = cara.vertex_groups.new(name='DEF_Centinela'); g.add(list(range(len(P))), 0.83, 'REPLACE')
    return cara


resultados = []
for nombre, cx, hw in [('Manual_pequeno', 0., 0.0135), ('Manual_grande', 0.35, 0.2),
                       ('Manual_desplazado', 1.72, 0.017)]:
    cara = fixture(nombre, cx, hw)
    inicial = firmas(cara)
    valores = {k.name: k.value for k in cara.data.shape_keys.key_blocks}
    anclas = cara['aj_anclas'].to_dict(); superficies = cara['aj_superficies_labios'].to_dict()
    grupos = [(v.index, [(g.group, g.weight) for g in v.groups]) for v in cara.data.vertices]
    M.marcar_caras(cara, 'sup', range(16)); M.marcar_caras(cara, 'inf', range(16, 32))
    assert inicial == firmas(cara), 'Marcar caras modificó las influencias existentes'
    seleccion = [5, 6, 13, 14]  # Dos caras externas y dos internas del labio superior.
    M.asignar_peso(cara, 'labio_sup_L', seleccion, 0.7)
    assert inicial == firmas(cara), 'Preparar pesos alteró el automático'
    r = M.aplicar_punto(cara, 'labio_sup_L', simetria=True)
    assert set(r['puntos']) == {'labio_sup_L', 'labio_sup_R'}
    despues = firmas(cara)
    assert despues['Basis'] == inicial['Basis'] and despues['eyeBlink_L'] == inicial['eyeBlink_L']
    P = M._base(cara); k = cara.data.shape_keys.key_blocks['aj_labio_sup_L_arriba']
    D = M._coords(cara, k) - P
    internos = {v for f in (13, 14) for v in cara.data.polygons[f].vertices}
    assert any(np.linalg.norm(D[i]) > 1e-6 * hw for i in internos), 'El interior no recibe peso manual'
    assert not np.any(D[36:]), 'Se afectó el otro labio'
    assert max(abs(D[:, 0])) == 0 and max(abs(D[:, 1])) == 0
    WL, WR = M.pesos(cara, 'labio_sup_L'), M.pesos(cara, 'labio_sup_R')
    for i in np.flatnonzero(WL):
        objetivo = P[i].copy(); objetivo[0] = 2 * cx - objetivo[0]
        j = np.linalg.norm(P - objetivo, axis=1).argmin()
        assert abs(WL[i] - WR[j]) < 1e-6
    assert valores == {k.name: k.value for k in cara.data.shape_keys.key_blocks}
    # Datos portables: ambos juegos están en el objeto y vuelven exactos sin archivos externos.
    assert M.datos(cara)['manuales'] and M.datos(cara)['automaticos']
    M.cambiar_modo(cara, False)
    assert inicial == firmas(cara), 'No se restauró el automático bit a bit'
    assert anclas == cara['aj_anclas'].to_dict()
    assert superficies == cara['aj_superficies_labios'].to_dict()
    M.cambiar_modo(cara, True)
    assert despues == firmas(cara), 'No se restauró el juego manual'
    M.cambiar_modo(cara, False)
    M.asignar_peso(cara, 'labio_inf_L', [21, 22, 29, 30], 0.4)
    M.aplicar_punto(cara, 'labio_inf_L', simetria=False)
    assert firmas(cara)['aj_labio_inf_R_arriba'] == inicial['aj_labio_inf_R_arriba']
    M.cambiar_modo(cara, False)
    assert inicial == firmas(cara)
    for i, gs in grupos:
        actuales = {g.group: g.weight for g in cara.data.vertices[i].groups}
        assert all(actuales[g] == w for g, w in gs), 'Se alteró un grupo del rig'
    # Reaplicar el mismo manual es determinista; cambiar densidad se rechaza antes de mutar.
    M.aplicar_punto(cara, 'labio_sup_L', simetria=True)
    f1 = firmas(cara); M.aplicar_punto(cara, 'labio_sup_L', simetria=True)
    assert f1 == firmas(cara)
    try: AJ.cambiar_densidad(cara, 'boca', 12)
    except RuntimeError: pass
    else: raise AssertionError('Se regeneraron puntos mientras estaba activo Manual')
    assert f1 == firmas(cara)
    M.cambiar_modo(cara, False)
    # No sustituir caras internas por piel externa al reflejar una selección incompleta.
    M.marcar_caras(cara, 'sup', [9, 10], retirar=True)
    previo_error = firmas(cara)
    try: M.aplicar_punto(cara, 'labio_sup_L', simetria=True)
    except RuntimeError: pass
    else: raise AssertionError('El espejo aceptó una región sin las caras internas correspondientes')
    assert previo_error == firmas(cara)
    M.marcar_caras(cara, 'sup', [9, 10])
    resultados.append({'fixture': nombre, 'caras_internas': True, 'simetria': True,
                       'sin_simetria': True, 'automatico_exacto': True, 'manual_exacto': True,
                       'facs_y_grupos_intactos': True, 'valores_intactos': True})

# Operadores reales de selección/asignación/pintura sin tocar personajes del usuario.
cara = bpy.data.objects['Manual_pequeno']
stub = types.ModuleType(paquete.__name__ + '.editor')
stub._cara = lambda context: cara; stub._arr = {}; stub._pesos_cache = {}
stub._tag_redraw = lambda context: None
ctrl = bpy.data.objects.new('Control_seleccion', None); bpy.context.scene.collection.objects.link(ctrl)
ctrl['v_jawOpen'] = 0.23; ctrl['v_mouthClose'] = 0.2
stub._ctrl = lambda ed: ctrl
P = M._base(cara)
delta = np.zeros_like(P); delta[36:, 2] = -0.01
AJ.poner_key(cara, 'jawOpen', delta, 0.)
f = cara.data.shape_keys.key_blocks['jawOpen'].driver_add('value')
v = f.driver.variables.new(); v.name = 'apertura'; v.targets[0].id = ctrl
v.targets[0].data_path = '["v_jawOpen"]'; f.driver.expression = 'apertura'
ref = bpy.data.objects.new('Referencia_seleccion', None); bpy.context.scene.collection.objects.link(ref)
ref.empty_display_type = 'IMAGE'; ref.data = bpy.data.images.new('Referencia_test', width=8, height=8)
ref.location = (1., 2., 3.); ref.color[3] = 0.45
ref.hide_set(True)
for a in bpy.context.screen.areas:
    if a.type == 'VIEW_3D': a.spaces.active.overlay.show_overlays = False
sys.modules[stub.__name__] = stub
class EditorPrueba(bpy.types.PropertyGroup):
    activo: bpy.props.BoolProperty(default=True)
    punto: bpy.props.StringProperty(default='labio_inf_L')
    zona: bpy.props.StringProperty(default='boca')
    enlazar: bpy.props.BoolProperty(default=False)
    referencia: bpy.props.PointerProperty(type=bpy.types.Object)
bpy.utils.register_class(EditorPrueba)
bpy.types.Scene.rlb_editor = bpy.props.PointerProperty(type=EditorPrueba)
UI = importlib.import_module(paquete.__name__ + '.labios_manual_ui'); UI.register()
try:
    for o in bpy.context.selected_objects: o.select_set(False)
    cara.select_set(True); bpy.context.view_layer.objects.active = cara
    p = bpy.context.scene.rlb_labios_manual; p.region = 'inf'; p.peso = 0.3
    suave = cara.modifiers.new('Suavizado de prueba', 'SMOOTH')
    suave.show_in_editmode = False; suave.show_on_cage = False
    sub = cara.modifiers.new('Subdivision de prueba', 'SUBSURF')
    sub.levels = 1; sub.show_in_editmode = True; sub.show_on_cage = False
    oculto = cara.modifiers.new('Modificador desactivado', 'DISPLACE')
    oculto.show_viewport = False; oculto.show_in_editmode = False; oculto.show_on_cage = False
    modificadores_ui = {m.name: (m.show_viewport, m.show_in_editmode, m.show_on_cage) for m in cara.modifiers}
    cara.show_only_shape_key = True; cara.use_shape_key_edit_mode = False
    inicial_ui = firmas(cara)
    referencia_ui = (tuple(ref.location), float(ref.color[3]))
    assert bpy.ops.rlb.labios_manual(accion='EDITAR') == {'FINISHED'}
    assert ctrl['v_jawOpen'] == 0.9 and ctrl['v_mouthClose'] == 0.0
    assert cara.use_shape_key_edit_mode and not cara.show_only_shape_key
    assert all(m.show_in_editmode and m.show_on_cage for m in cara.modifiers if m.show_viewport)
    assert not oculto.show_in_editmode and not oculto.show_on_cage and not oculto.show_viewport
    assert not ref.hide_get() and bpy.context.scene.rlb_editor.referencia == ref
    assert all(a.spaces.active.overlay.show_overlays for a in bpy.context.screen.areas if a.type == 'VIEW_3D')
    assert referencia_ui == (tuple(ref.location), float(ref.color[3]))
    assert abs(cara.data.shape_keys.key_blocks['jawOpen'].value - 0.9) < 1e-6
    bm = bmesh.from_edit_mesh(cara.data); bm.faces.ensure_lookup_table()
    for f in bm.faces: f.select_set(f.index in (21, 29))
    bmesh.update_edit_mesh(cara.data, loop_triangles=False, destructive=False)
    assert bpy.ops.rlb.labios_manual(accion='PESO') == {'FINISHED'}
    assert cara.mode == 'EDIT'
    assert bpy.ops.rlb.labios_manual(accion='MOVER') == {'FINISHED'}
    assert ctrl['v_jawOpen'] == 0.23 and ctrl['v_mouthClose'] == 0.2
    assert not cara.use_shape_key_edit_mode and cara.show_only_shape_key
    assert modificadores_ui == {m.name: (m.show_viewport, m.show_in_editmode, m.show_on_cage) for m in cara.modifiers}
    assert inicial_ui == firmas(cara), 'Seleccionar en la pose abierta alteró las coordenadas'
    locks = {g.name: g.lock_weight for g in cara.vertex_groups}
    ajustes = {n: getattr(bpy.context.scene.tool_settings, n) for n in ('use_auto_normalize', 'use_multipaint')
               if hasattr(bpy.context.scene.tool_settings, n)}
    assert bpy.ops.rlb.labios_manual(accion='PINTAR') == {'FINISHED'}
    assert cara.mode == 'WEIGHT_PAINT'
    assert ctrl['v_jawOpen'] == 0.9
    assert cara.vertex_groups['DEF_Centinela'].lock_weight
    assert bpy.ops.rlb.labios_manual(accion='MOVER') == {'FINISHED'}
    assert locks == {g.name: g.lock_weight for g in cara.vertex_groups}
    assert ajustes == {n: getattr(bpy.context.scene.tool_settings, n) for n in ajustes}
    assert ctrl['v_jawOpen'] == 0.23 and ctrl['v_mouthClose'] == 0.2
    assert bpy.ops.rlb.labios_manual(accion='EDITAR') == {'FINISHED'}
    bpy.ops.object.mode_set(mode='OBJECT'); UI._vigilar_pintura()
    assert ctrl['v_jawOpen'] == 0.23 and ctrl['v_mouthClose'] == 0.2
    # Si se mueve un deslizador durante la selección, conservar el nuevo valor real al cerrar la vista temporal.
    assert bpy.ops.rlb.labios_manual(accion='EDITAR') == {'FINISHED'}
    ctrl['v_jawOpen'] = 0.41; ctrl['v_mouthClose'] = 0.12
    UI.S.mantener(cara)
    assert ctrl['v_jawOpen'] == 0.9
    assert bpy.ops.rlb.labios_manual(accion='MOVER') == {'FINISHED'}
    assert ctrl['v_jawOpen'] == 0.41 and ctrl['v_mouthClose'] == 0.12
    assert inicial_ui == firmas(cara)
    resultados.append({'operadores_ui': True, 'seleccion_cara_interna': True,
                       'pintura_protegida': True, 'bloqueos_y_ajustes_restaurados': True,
                       'boca_abierta_temporal': True, 'referencia_visible': True, 'base_intacta': True,
                       'jaula_sigue_superficie': True, 'modificadores_restaurados': True})
finally:
    if cara.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    UI.unregister(); del bpy.types.Scene.rlb_editor; bpy.utils.unregister_class(EditorPrueba)

print('RLB_MANUAL_OK ' + json.dumps(resultados))
