"""Extract neutral surface parameters/one missing UV from saved source, read-only."""
import bpy
import hashlib
import json
import os
import sys
import numpy as np
from mathutils import Vector

PROJECT = r'D:\Español\SpanStories-Ciudades'
sys.path.insert(0, os.path.join(PROJECT, 'scripts'))
from export_optimize import ZONE, read_glb, accessor_array

def shader_input(node, name, fallback=None):
    if name not in node.inputs:
        return fallback
    value = node.inputs[name].default_value
    return list(value) if hasattr(value, '__len__') and not isinstance(value, str) else value

def convert(p):
    return np.asarray([p[0], p[2], -p[1]], dtype=np.float32)

def coord_from(node):
    links = node.inputs['Vector'].links
    return links[0].from_socket.name.lower() if links else 'generated'

with open(os.path.join(PROJECT, 'reports', 'export-texture-audit.json'), encoding='utf8') as stream:
    audit = json.load(stream)
affected = {entry['source']['name'] for entry in audit['materials'] if entry['findings']}
source_path = bpy.data.filepath
source_hash = hashlib.sha256(open(source_path, 'rb').read()).hexdigest()
surfaces = {}
for name in affected:
    material = bpy.data.materials.get(name)
    nodes = material.node_tree.nodes
    shader = next((node for node in nodes if node.type == 'BSDF_PRINCIPLED'), None)
    if not shader:
        continue
    surface = {'sourceName': name, 'fallbackColor': shader_input(shader, 'Base Color')[:3]}
    brick = next((node for node in nodes if node.type == 'TEX_BRICK'), None)
    noise = next((node for node in nodes if node.type == 'TEX_NOISE'), None)
    bump = next((node for node in nodes if node.type == 'BUMP'), None)
    attribute = next((node for node in nodes if node.type == 'ATTRIBUTE' and node.attribute_name == 'BCN_albedo'), None)
    if brick:
        surface.update(kind='brick', brick={
            'coordinate': coord_from(brick), 'scale': shader_input(brick, 'Scale'), 'color1': shader_input(brick, 'Color1')[:3],
            'color2': shader_input(brick, 'Color2')[:3], 'mortar': shader_input(brick, 'Mortar')[:3],
            'mortarSize': shader_input(brick, 'Mortar Size'), 'mortarSmooth': shader_input(brick, 'Mortar Smooth'),
            'bias': shader_input(brick, 'Bias'), 'brickWidth': shader_input(brick, 'Brick Width'), 'rowHeight': shader_input(brick, 'Row Height'),
            'offset': brick.offset, 'offsetFrequency': brick.offset_frequency, 'squash': brick.squash, 'squashFrequency': brick.squash_frequency,
        })
    elif noise:
        surface.update(kind='noise', noise={
            'coordinate': coord_from(noise), 'scale': shader_input(noise, 'Scale'), 'detail': shader_input(noise, 'Detail'),
            'roughness': shader_input(noise, 'Roughness'), 'lacunarity': shader_input(noise, 'Lacunarity'),
            'distortion': shader_input(noise, 'Distortion'), 'dimensions': noise.noise_dimensions,
            'type': noise.noise_type, 'normalize': noise.normalize,
        })
        if noise.inputs['Vector'].is_linked:
            coordinates = noise.inputs['Vector'].links[0].from_node
            if coordinates.type == 'TEX_COORD' and coordinates.object:
                raise ValueError('External Object texture coordinates need an explicit transform adapter')
        base_link = shader.inputs['Base Color'].links
        ramp = base_link[0].from_node if base_link else None
        if ramp and ramp.type == 'VALTORGB':
            assert ramp.inputs['Fac'].is_linked and ramp.inputs['Fac'].links[0].from_node == noise
            surface['colorRamp'] = {'mode': ramp.color_ramp.color_mode,
                                    'interpolation': ramp.color_ramp.interpolation,
                                    'elements': [{'position': e.position, 'color': list(e.color)} for e in ramp.color_ramp.elements]}
    elif attribute:
        mix = next(node for node in nodes if node.type == 'MIX_RGB' and node.inputs[0].is_linked and node.inputs[0].links[0].from_node == attribute)
        surface.update(kind='atlas' if name == 'BCN_fachada_atlas' else 'attribute', sourceColorName='BCN_albedo', useColorAlpha=True)
        if not mix.inputs[1].is_linked:
            surface['fallbackColor'] = list(mix.inputs[1].default_value)[:3]
        if surface['kind'] == 'atlas':
            surface['atlas'] = {'primaryImage': 'H01_trencadis_albedo_512.png', 'secondaryImage': 'H02_esgrafiado_albedo_1024.png', 'primaryUVSource': 'H01_trencadis', 'secondaryUVSource': 'H02_esgrafiado_UV', 'patternSource': 'H02_patron'}
    else:
        continue
    if bump:
        surface['bump'] = {'strength': shader_input(bump, 'Strength'), 'distance': shader_input(bump, 'Distance'), 'filterWidth': shader_input(bump, 'Filter Width'), 'invert': bump.invert}
    surfaces[name] = surface

os.makedirs(os.path.join(ZONE, 'assets', 'surface-source'), exist_ok=True)
image = bpy.data.images['H02_esgrafiado_albedo_1024.png']
image_bytes = bytes(image.packed_file.data)
image_path = os.path.join(ZONE, 'assets', 'surface-source', 'H02_esgrafiado_albedo_1024.png')
with open(image_path, 'wb') as stream:
    stream.write(image_bytes)

dg = bpy.context.evaluated_depsgraph_get()
generated_bounds = {}
for obj in bpy.context.scene.objects:
    if obj.type not in ('MESH', 'CURVE', 'FONT', 'SURFACE', 'META'):
        continue
    if any(slot.material and slot.material.name in surfaces and surfaces[slot.material.name]['kind'] == 'noise' for slot in obj.material_slots):
        corners = list(obj.bound_box)
        generated_bounds[obj.name] = {'min': [min(c[i] for c in corners) for i in range(3)], 'max': [max(c[i] for c in corners) for i in range(3)]}

# Existing glTF contains H02_patron as COLOR_2, but it omitted the UV layer/image.
obj = bpy.data.objects['H02_esgrafiado']
evaluated = obj.evaluated_get(dg)
mesh = evaluated.to_mesh()
mesh.calc_loop_triangles()
target_layer = mesh.uv_layers['H02_esgrafiado_UV']
records = []
lookup = {}
for index, loop in enumerate(mesh.loops):
    position = convert(mesh.vertices[loop.vertex_index].co)
    normal = convert(mesh.corner_normals[index].vector)
    target_uv = [target_layer.data[index].uv.x, 1 - target_layer.data[index].uv.y]
    uv_candidates = [[layer.data[index].uv.x, 1 - layer.data[index].uv.y] for layer in mesh.uv_layers]
    record = {'position': position, 'normal': normal, 'targetUV': target_uv, 'uvCandidates': uv_candidates}
    records.append(record)
    lookup.setdefault(tuple(np.rint(position.astype(np.float64) * 10000).astype(np.int64)), []).append(record)
matched = []
for sector in ('s00','s01','s02','s10','s11','s12','s20','s21','s22'):
    document, binary = read_glb(os.path.join(ZONE, 'assets', sector + '.dedup.glb'))
    for node in document['nodes']:
        if node.get('name') != 'H02_esgrafiado':
            continue
        for primitive_index, primitive in enumerate(document['meshes'][node['mesh']]['primitives']):
            positions = accessor_array(document, binary, primitive['attributes']['POSITION'])
            normals = accessor_array(document, binary, primitive['attributes']['NORMAL'])
            uv = accessor_array(document, binary, primitive['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in primitive['attributes'] else None
            result = []
            worst_error = 0.0
            for vertex, position in enumerate(positions):
                key = tuple(np.rint(position.astype(np.float64) * 10000).astype(np.int64))
                candidates = lookup.get(key, [])
                assert candidates, 'Missing source corner at glTF vertex ' + str(vertex)
                def error(record):
                    normal_error = float(np.linalg.norm(record['normal'] - normals[vertex]))
                    uv_error = min(float(np.linalg.norm(np.asarray(source_uv) - uv[vertex])) for source_uv in record['uvCandidates']) if uv is not None else 0
                    return normal_error + uv_error
                chosen = min(candidates, key=error)
                worst_error = max(worst_error, error(chosen))
                result.append(chosen['targetUV'])
            assert worst_error < .002, 'Source UV association not exact: ' + str(worst_error)
            npz_path = os.path.join(ZONE, 'assets', 'surface-source', 'H02-esgrafiado-p%d.npz' % primitive_index)
            np.savez(npz_path, uv=np.asarray(result, dtype='<f4'))
            matched.append({'sector': sector, 'name': node['name'], 'ssId': node['extras']['ssId'], 'primitive': primitive_index, 'vertices': len(result), 'npz': os.path.relpath(npz_path, ZONE).replace('\\', '/'), 'worstAssociationError': worst_error})
evaluated.to_mesh_clear()
result = {'source': {'path': source_path, 'sha256': source_hash}, 'surfaces': surfaces, 'secondaryImage': {'path': os.path.relpath(image_path, ZONE).replace('\\', '/'), 'sha256': hashlib.sha256(image_bytes).hexdigest(), 'bytes': len(image_bytes), 'width': image.size[0], 'height': image.size[1], 'colorSpace': image.colorspace_settings.name}, 'generatedBoundsBlender': generated_bounds, 'missingUVsExtracted': matched}
with open(os.path.join(PROJECT, 'reports', 'export-surface-source.json'), 'w', encoding='utf8') as stream:
    json.dump(result, stream, ensure_ascii=False, indent=2)
print('SOURCE_SURFACES_DONE ' + json.dumps({'surfaces': len(surfaces), 'secondaryImageBytes': len(image_bytes), 'missingUVsExtracted': matched}, ensure_ascii=False), flush=True)
