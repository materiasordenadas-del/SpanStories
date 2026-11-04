"""Cambio real de personaje con el editor abierto y acciones independientes."""
import bpy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / 'assets'))
import rig_labial_bendy as addon
import addon_utils
addon_utils.enable('rig_labial_bendy', default_set=False)
assert addon.__addon_enabled__
from rig_labial_bendy.nucleo import auto as AU
from rig_labial_bendy.nucleo.facs import editor as ED, integracion as IN, poses as PO, pipeline as FP


def personaje(nombre, offset):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata([(offset, 0, 0), (offset + 1, 0, 0), (offset, 0, 1)], [], [(0, 1, 2)])
    cara = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(cara)
    cara.shape_key_add(name='Basis')
    ctrl = bpy.data.objects.new(nombre + '_Cara_Control', None)
    bpy.context.scene.collection.objects.link(ctrl)
    ctrl['facs_cara'] = nombre
    for name in ('jawOpen', 'mouthSmile_L', 'mouthSmile_R', 'aj_nariz_punta_arriba'):
        key = cara.shape_key_add(name=name)
        key.data[0].co.z += .1
        ctrl['v_' + name] = 0.
        dr = key.driver_add('value').driver
        var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
        var.targets[0].id = ctrl; var.targets[0].data_path = '["v_' + name + '"]'
        dr.expression = 'v'
    cara['facs_keys'] = ['jawOpen', 'mouthSmile_L', 'mouthSmile_R', 'aj_nariz_punta_arriba']
    cara['aj_anclas'] = {'nariz_punta': 0}
    cara['rlb_hechos'] = json.dumps(['F_terminar'])
    terminado = FP.terminar(cara)
    assert len(terminado['editor']['expresiones_creadas']) == 42
    return cara, ctrl


a, ca = personaje('Personaje A', 0)
b, cb = personaje('Personaje B', 2)
ed = bpy.context.scene.rlb_editor
bpy.context.view_layer.objects.active = a
AU.aplicar(bpy.context)
assert len(ED._acciones(bpy.context)) == 42
ed.control = ca.name
ed.activo = True
ED._cargar(bpy.context, ed, bpy.data.actions[a.name + '_FACS_sonrisa_leve'])
ed.enlazar = False; ed.zona = 'nariz'; ed.mas = True
channel = next(c for c in ed.canales if c.name == 'aj_nariz_punta_arriba')
channel.fino = 27.
value_a = ca['v_aj_nariz_punta_arriba']
assert abs(value_a - .27) < 1e-5
ca['v_jawOpen'] = .43  # Pose en curso que todavía no está escrita en la acción.
ca.update_tag()

# El caso que antes se bloqueaba: selección distinta durante una edición válida.
bpy.context.view_layer.objects.active = b
AU.aplicar(bpy.context)
assert bpy.context.scene.rlb.cara is b
assert ed.activo and ed.control == cb.name
assert ca['v_aj_nariz_punta_arriba'] == value_a
assert all(x.name.startswith(b.name + '_FACS_') for x in ED._acciones(bpy.context))
ed.expr = b.name + '_FACS_sorpresa'
ed.zona = 'boca'; ed.enlazar = True; ed.mas = False
next(c for c in ed.canales if c.name == 'aj_nariz_punta_arriba').fino = -19.
assert abs(cb['v_aj_nariz_punta_arriba'] + .19) < 1e-5
assert ca['v_aj_nariz_punta_arriba'] == value_a

# El selector del panel usa la misma transición, aunque no cambie la selección.
bpy.context.scene.rlb.cara = a
assert ed.control == ca.name and ed.accion.endswith('_FACS_sonrisa_leve')
assert not ed.enlazar and ed.zona == 'nariz' and ed.mas
assert abs(ca['v_aj_nariz_punta_arriba'] - .27) < 1e-5
assert abs(ca['v_jawOpen'] - .43) < 1e-5
assert abs(cb['v_aj_nariz_punta_arriba'] + .19) < 1e-5

# Añadir una expresión faltante no sobrescribe una expresión ya editada.
accion = bpy.data.actions[a.name + '_FACS_sonrisa_leve']
antes = PO.leer_crudo(accion)
IN.preparar(a)
assert PO.leer_crudo(accion) == antes
assert IN.verificar(a)['errores'] == []

# Una acción de otro personaje jamás se puede escribir con estos canales.
ed.accion = b.name + '_FACS_sorpresa'
try:
    ED._guardar_accion(ed)
except RuntimeError:
    pass
else:
    raise AssertionError('Se permitió escribir en la acción de otro personaje')
ed.accion = a.name + '_FACS_sonrisa_leve'

# Resolver piezas con varios padres y mantener las opciones existentes.
grupo = bpy.data.objects.new('Grupo sin prefijo', None)
bpy.context.scene.collection.objects.link(grupo); grupo.parent = b
pieza = bpy.data.objects.new('Pieza sin prefijo', None)
bpy.context.scene.collection.objects.link(pieza); pieza.parent = grupo
assert AU.cara_de_objeto(pieza) is b
assert all(hasattr(ed, n) for n in ED._OPCIONES_SESION)

# Compatibilidad real: una piel con dos cuencas, sin UV ni bordes registrados.
from rig_labial_bendy.nucleo.facs import ajustes_ojos as AO
from mathutils import Matrix
vs = [(x / 8 - 3, -.5, z / 8 - 2) for z in range(33) for x in range(49)]
fs = []
for z in range(32):
    for x in range(48):
        cx, cz = (x + .5) / 8 - 3, (z + .5) / 8 - 2
        if abs(cz) < .5 and (abs(cx - 1.5) < .5 or abs(cx + 1.5) < .5):
            continue
        i = z * 49 + x
        fs.append((i, i + 1, i + 50, i + 49))
me = bpy.data.meshes.new('Piel sin UV'); me.from_pydata(vs, [], fs)
skin = bpy.data.objects.new('Rig heredado', me); bpy.context.scene.collection.objects.link(skin)
skin['rlb_cfg'] = json.dumps({'seed': 0})
skin.shape_key_add(name='Basis')
for side, cx in (('L', 1.5), ('R', -1.5)):
    key = skin.shape_key_add(name='eyeBlink_' + side)
    for v in key.data:
        if abs(v.co.x - cx) < .85 and abs(v.co.z) < .85:
            v.co.z += -.1 if v.co.z > 0 else .1
    pivot = bpy.data.objects.new(skin.name + '_OjoPivote_' + side, None)
    bpy.context.scene.collection.objects.link(pivot); pivot.location.x = cx
    gm = bpy.data.meshes.new('Globo de prueba ' + side)
    gm.from_pydata([(0, 0, .7), (.7, 0, 0), (-.7, 0, 0), (0, 0, -.7)], [], [])
    globe = bpy.data.objects.new(skin.name + '_Globo_' + side, gm)
    bpy.context.scene.collection.objects.link(globe); globe.parent = pivot
bpy.context.view_layer.update()
shapes, anchors = AO.plan(skin)
assert len(shapes) == 36 and len(anchors) == 12
assert not me.uv_layers and 'rlb_borde_parpado' not in skin
raw = json.dumps({'sup_L': [0, 4, 13], 'inf_L': [50, 60, 70]})
skin['rlb_borde_parpado'] = raw
try:
    AO.plan(skin)
except RuntimeError:
    pass
else:
    raise AssertionError('Se aceptó un borde explícito desconectado')
assert skin['rlb_borde_parpado'] == raw
print('RLB_PERSONAJES_PANEL_OK: 42 expresiones por personaje, edición independiente y sin cruce de acciones')
addon_utils.disable('rig_labial_bendy', default_set=False)
