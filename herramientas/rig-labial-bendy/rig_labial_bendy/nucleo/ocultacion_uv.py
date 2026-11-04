"""Reversible Geometry Nodes eye hiding selected by reviewed UV-island seeds."""
import bpy
import numpy as np
from numbers import Integral
from . import inventario_uv, util

FACE_ATTR = 'RLB_ocultar_ojos_uv'
INDEX_ATTR = 'RLB_indice_base'
MODIFIER = 'RLB_OcultarOjosUV'


def preparar_indice_base(cara):
    """Ensure POINT INT original indices exist; never rewrite a conflicting attribute."""
    me = cara.data
    attr = me.attributes.get(INDEX_ATTR)
    identity = np.arange(len(me.vertices), dtype=np.int32)
    created = attr is None
    if attr is None:
        attr = me.attributes.new(INDEX_ATTR, 'INT', 'POINT')
        attr.data.foreach_set('value', identity)
    elif attr.data_type != 'INT' or attr.domain != 'POINT':
        raise RuntimeError(f'{INDEX_ATTR} existe con tipo o dominio incompatible')
    else:
        values = np.zeros(len(me.vertices), dtype=np.int32)
        attr.data.foreach_get('value', values)
        if not np.array_equal(values, identity):
            raise RuntimeError(f'{INDEX_ATTR} ya existe y no es el mapeo identidad esperado')
    return {'attribute': INDEX_ATTR, 'vertices': len(identity), 'created': created}


def _resueltas_por_seed(cara, semillas, tolerancia=1e-6):
    me = cara.data
    layer = me.uv_layers.active
    if layer is None:
        raise ValueError('La malla no tiene una capa UV activa')
    vertices = util.coords(me)
    edges = [tuple(int(v) for v in e.vertices) for e in me.edges]
    face_vertices, face_uvs = [], []
    for poly in me.polygons:
        face_vertices.append([int(v) for v in poly.vertices])
        face_uvs.append([tuple(float(x) for x in layer.data[li].uv) for li in poly.loop_indices])
    inv = inventario_uv.inventariar(vertices, edges, face_vertices, face_uvs, tolerancia)
    by_seed = {int(item['seed_face']): item for item in inv['islas_uv']}
    faces, seen_seeds = set(), set()
    for raw in semillas:
        if isinstance(raw, bool) or not isinstance(raw, Integral):
            raise TypeError(f'Semilla UV no entera: {raw!r}')
        seed = int(raw)
        if seed not in by_seed:
            raise ValueError(f'Semilla UV inexistente: {seed}')
        if seed in seen_seeds:
            raise ValueError(f'Semilla UV repetida: {seed}')
        seen_seeds.add(seed)
        faces.update(by_seed[seed]['face_indices'])
    if not faces:
        raise ValueError('Selecciona al menos una isla UV')
    return sorted(faces), layer.name


def crear_ocultacion_ojos_uv(cara, semillas, tolerancia=1e-6):
    """Add a non-applied FACE Delete Geometry modifier for explicitly reviewed UV seeds."""
    if cara.type != 'MESH':
        raise TypeError('cara debe ser un objeto MESH')
    if cara.modifiers.get(MODIFIER):
        raise RuntimeError(f'Ya existe el modificador {MODIFIER}; retíralo con restaurar_ojos_uv antes de rehacerlo')
    face_indices, uv_layer = _resueltas_por_seed(cara, semillas, tolerancia)
    me = cara.data
    if me.attributes.get(FACE_ATTR):
        raise RuntimeError(f'{FACE_ATTR} ya existe; se conserva y no se sobrescribe')

    group = bpy.data.node_groups.new(f'{cara.name}_{MODIFIER}', 'GeometryNodeTree')
    modifier = None
    created_index = False
    try:
        group.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
        group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        nodes = group.nodes
        inp = nodes.new('NodeGroupInput')
        out = nodes.new('NodeGroupOutput')
        delete = nodes.new('GeometryNodeDeleteGeometry')
        delete.domain = 'FACE'
        named = nodes.new('GeometryNodeInputNamedAttribute')
        named.data_type = 'BOOLEAN'
        named.inputs['Name'].default_value = FACE_ATTR
        group.links.new(inp.outputs['Geometry'], delete.inputs['Geometry'])
        group.links.new(named.outputs['Attribute'], delete.inputs['Selection'])
        group.links.new(delete.outputs['Geometry'], out.inputs['Geometry'])

        index_info = preparar_indice_base(cara)
        created_index = index_info['created']
        cara['rlb_ocultacion_indice_creado'] = created_index
        attr = me.attributes.new(FACE_ATTR, 'BOOLEAN', 'FACE')
        values = np.zeros(len(me.polygons), dtype=bool)
        values[face_indices] = True
        attr.data.foreach_set('value', values)
        modifier = cara.modifiers.new(MODIFIER, 'NODES')
        modifier.node_group = group
    except Exception:
        if modifier and cara.modifiers.get(MODIFIER): cara.modifiers.remove(modifier)
        if me.attributes.get(FACE_ATTR): me.attributes.remove(me.attributes[FACE_ATTR])
        if created_index and me.attributes.get(INDEX_ATTR): me.attributes.remove(me.attributes[INDEX_ATTR])
        if 'rlb_ocultacion_indice_creado' in cara: del cara['rlb_ocultacion_indice_creado']
        if group.users == 0: bpy.data.node_groups.remove(group)
        raise
    return {'modifier': MODIFIER, 'uv_layer': uv_layer, 'seed_faces': list(semillas),
            'n_faces_hidden': len(face_indices), 'face_indices': face_indices,
            'topology_applied': False}


def restaurar_ocultacion_ojos_uv(cara):
    """Remove only this module's unapplied modifier and its two source attributes."""
    modifier = cara.modifiers.get(MODIFIER)
    group = modifier.node_group if modifier and modifier.type == 'NODES' else None
    if modifier:
        cara.modifiers.remove(modifier)
    for name in (FACE_ATTR,):
        attr = cara.data.attributes.get(name)
        if attr:
            cara.data.attributes.remove(attr)
    if cara.get('rlb_ocultacion_indice_creado', False):
        attr = cara.data.attributes.get(INDEX_ATTR)
        if attr: cara.data.attributes.remove(attr)
    if 'rlb_ocultacion_indice_creado' in cara:
        del cara['rlb_ocultacion_indice_creado']
    if group and group.users == 0:
        bpy.data.node_groups.remove(group)
    return {'restaurado': True, 'topology_applied': False}
