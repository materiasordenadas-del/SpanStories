"""Read-only source material graph vs baseline glTF audit. No export or save."""
import bpy
import collections
import hashlib
import json
import os
import struct

PROJECT = r'D:\Español\SpanStories-Ciudades'
SOURCE = r'D:\Español\imagen para animación\Primera ciudad\Barcelona_PasseigGracia\blender\BARCELONA_CIUDAD_ACTUAL.blend'
ASSETS = os.path.join(PROJECT, 'Mundo', 'Paises', 'Espana', 'Ciudades', 'Barcelona', 'Zonas', 'PasseigGracia', 'assets')

def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            h.update(block)
    return h.hexdigest()

def read_json_chunk(path):
    with open(path, 'rb') as stream:
        header = stream.read(20)
        length = struct.unpack_from('<I', header, 12)[0]
        return json.loads(stream.read(length))

def value(socket):
    try:
        default = socket.default_value
        return list(default) if hasattr(default, '__len__') and not isinstance(default, str) else default
    except Exception:
        return None

def upstream(socket, visited=None):
    visited = visited or set()
    result = []
    for link in socket.links:
        node = link.from_node
        if node.as_pointer() in visited:
            continue
        visited.add(node.as_pointer())
        result.append({'name': node.name, 'type': node.type, 'blIdname': node.bl_idname, 'output': link.from_socket.name,
                       **({'image': node.image.name if node.image else None} if node.type == 'TEX_IMAGE' else {}),
                       **({'attributeName': node.attribute_name} if node.type == 'ATTRIBUTE' else {}),
                       **({'layerName': node.layer_name} if node.type == 'VERTEX_COLOR' else {}),
                       **({'uvMap': node.uv_map} if node.type == 'UVMAP' else {})})
        for input_socket in node.inputs:
            result.extend(upstream(input_socket, visited))
    return result

def node_data(node):
    result = {'name': node.name, 'type': node.type, 'blIdname': node.bl_idname, 'inputs': [{'name': socket.name, 'identifier': socket.identifier, 'default': value(socket), 'links': [{'node': link.from_node.name, 'socket': link.from_socket.name} for link in socket.links]} for socket in node.inputs]}
    for prop in ('blend_type', 'operation', 'attribute_name', 'layer_name', 'uv_map', 'interpolation', 'extension', 'projection', 'vector_type'):
        if hasattr(node, prop):
            result[prop] = getattr(node, prop)
    if node.type == 'TEX_IMAGE':
        result['image'] = node.image.name if node.image else None
        result['imageColorSpace'] = node.image.colorspace_settings.name if node.image else None
    if node.type == 'VALTORGB':
        result['colorRamp'] = [{'position': element.position, 'color': list(element.color)} for element in node.color_ramp.elements]
    if node.type == 'GROUP' and node.node_tree:
        result['group'] = node.node_tree.name
    return result

before = sha_file(SOURCE)
doc = read_json_chunk(os.path.join(ASSETS, 'baseline.glb'))
gltf_materials = collections.defaultdict(list)
for index, material in enumerate(doc.get('materials', [])):
    gltf_materials[material.get('name', '')].append((index, material))
uses = collections.defaultdict(lambda: {'objects': set(), 'primitiveCount': 0, 'semantics': collections.Counter(), 'vertices': 0})
for node in doc.get('nodes', []):
    if 'mesh' not in node:
        continue
    for primitive in doc['meshes'][node['mesh']]['primitives']:
        if 'material' not in primitive:
            continue
        use = uses[primitive['material']]
        use['objects'].add(node.get('name', ''))
        use['primitiveCount'] += 1
        use['semantics'].update(primitive['attributes'].keys())
        use['vertices'] += doc['accessors'][primitive['attributes']['POSITION']]['count']

materials = []
for material in bpy.data.materials:
    source = {'name': material.name, 'diffuseColor': list(material.diffuse_color), 'useNodes': material.use_nodes, 'users': material.users}
    principled = []
    if material.node_tree:
        source['nodes'] = [node_data(node) for node in material.node_tree.nodes]
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                entry = {'name': node.name, 'inputs': {}}
                for key in ('Base Color', 'Metallic', 'Roughness', 'Alpha', 'Normal', 'Emission Color', 'Emission Strength'):
                    if key in node.inputs:
                        socket = node.inputs[key]
                        entry['inputs'][key] = {'default': value(socket), 'linked': socket.is_linked, 'upstream': upstream(socket)}
                principled.append(entry)
        source['principled'] = principled
        source['imageNodes'] = [{'node': node.name, 'image': node.image.name if node.image else None, 'upstreamVector': upstream(node.inputs['Vector'])} for node in material.node_tree.nodes if node.type == 'TEX_IMAGE']
    exported = []
    for index, gltf in gltf_materials[material.name]:
        use = uses[index]
        image_roles = {}
        def texture_info(key, info):
            if not info:
                return
            texture = doc['textures'][info['index']]
            image = doc['images'][texture['source']]
            image_roles[key] = {'image': image.get('name'), 'mimeType': image.get('mimeType'), 'texCoord': info.get('texCoord', 0), 'extensions': info.get('extensions', {}), 'scale': info.get('scale', 1)}
        texture_info('baseColor', gltf.get('pbrMetallicRoughness', {}).get('baseColorTexture'))
        texture_info('normal', gltf.get('normalTexture'))
        texture_info('metallicRoughness', gltf.get('pbrMetallicRoughness', {}).get('metallicRoughnessTexture'))
        exported.append({'index': index, 'material': gltf, 'textures': image_roles, 'objects': sorted(use['objects']), 'primitiveCount': use['primitiveCount'], 'semantics': dict(use['semantics']), 'vertices': use['vertices']})
    findings = []
    for shader in principled:
        for key, role in [('Base Color', 'baseColor'), ('Normal', 'normal')]:
            slot = shader['inputs'].get(key, {})
            image_names = sorted({n['image'] for n in slot.get('upstream', []) if n['type'] == 'TEX_IMAGE' and n.get('image')})
            exports_role = [entry['textures'].get(role, {}).get('image') for entry in exported if role in entry['textures']]
            if image_names and not exports_role and exported:
                findings.append({'kind': 'image_chain_not_exported', 'input': key, 'expectedImages': image_names})
            types = sorted({n['type'] for n in slot.get('upstream', [])})
            unsupported = [kind for kind in types if kind in ('TEX_NOISE', 'TEX_VORONOI', 'VALTORGB', 'TEX_BRICK', 'TEX_WAVE', 'GROUP', 'TEX_GRADIENT', 'OBJECT_INFO', 'NEW_GEOMETRY')]
            if unsupported and exported:
                findings.append({'kind': 'procedural_source_chain', 'input': key, 'nodeTypes': unsupported, 'exportedTexture': exports_role})
            attributes = sorted({n.get('attributeName') or n.get('layerName') for n in slot.get('upstream', []) if n['type'] in ('ATTRIBUTE', 'VERTEX_COLOR') and (n.get('attributeName') or n.get('layerName'))})
            if attributes and exported:
                findings.append({'kind': 'attribute_source_chain', 'input': key, 'attributes': attributes, 'gltfColor0Primitives': sum(e['semantics'].get('COLOR_0', 0) for e in exported), 'primitives': sum(e['primitiveCount'] for e in exported)})
    materials.append({'source': source, 'exported': exported, 'findings': findings})

after = sha_file(SOURCE)
report = {'source': {'path': SOURCE, 'sha256': before, 'hashAfterAudit': after, 'unchanged': before == after}, 'gltf': {'path': os.path.join(ASSETS, 'baseline.glb'), 'materials': len(doc.get('materials', [])), 'images': doc.get('images', [])}, 'sourceImages': [{'name': image.name, 'size': list(image.size), 'colorspace': image.colorspace_settings.name, 'packed': bool(image.packed_file)} for image in bpy.data.images if image.source != 'VIEWER'], 'materials': materials}
affected_names = {entry['source']['name'] for entry in materials if any(f['kind'] == 'attribute_source_chain' for f in entry['findings'])}
affected_objects = {name for entry in materials if entry['source']['name'] in affected_names for exported in entry['exported'] for name in exported['objects']}
dg = bpy.context.evaluated_depsgraph_get()
layer_reports = []
for name in sorted(affected_objects):
    obj = bpy.data.objects.get(name)
    if not obj or obj.type not in ('MESH', 'CURVE', 'FONT', 'SURFACE', 'META'):
        continue
    evaluated = obj.evaluated_get(dg)
    mesh = evaluated.to_mesh()
    color_layers = []
    for layer in mesh.color_attributes:
        color_layers.append({'name': layer.name, 'dataType': layer.data_type, 'domain': layer.domain, 'count': len(layer.data), 'firstColors': [list(element.color) for element in list(layer.data[:4])]})
    attributes = []
    for attribute in mesh.attributes:
        if attribute.name in ('H02_patron', 'BCN_albedo'):
            samples = []
            for element in attribute.data[:4]:
                samples.append(getattr(element, 'value', None) if attribute.data_type == 'FLOAT' else list(getattr(element, 'color', [])))
            attributes.append({'name': attribute.name, 'type': attribute.data_type, 'domain': attribute.domain, 'count': len(attribute.data), 'firstValues': samples})
    layer_reports.append({'name': name, 'colorLayers': color_layers, 'uvLayers': [layer.name for layer in mesh.uv_layers], 'attributes': attributes, 'renderColorIndex': mesh.color_attributes.render_color_index})
    evaluated.to_mesh_clear()
report['objectAttributeLayers'] = layer_reports
report['concreteLosses'] = [
    {'kind': 'wrong_color_channel', 'sourceMaterials': sorted(affected_names), 'source': 'BCN_albedo', 'gltf': 'COLOR_0 synthetic white; real layers exported subsequently COLOR_1/COLOR_2 according to objectAttributeLayers', 'cause': 'Blender glTF primitive_extract.py lines 811-839: all_vertex_colors creates forced COLOR_0 when graph mixes named Attribute.'},
    {'kind': 'atlas_branch_missing', 'material': 'BCN_fachada_atlas', 'missingImage': 'H02_esgrafiado_albedo_1024.png', 'missingFactor': 'H02_patron', 'formula': 'mix(mix(H01trencadis(H01_trencadisUV), BCN_albedo.rgb, BCN_albedo.a), H02esgrafiado(H02_esgrafiado_UV), H02_patron.Fac)'},
    {'kind': 'fallback_mix_missing', 'formula': 'mix(material.nodes[Mix].Color1(default), BCN_albedo.rgb, BCN_albedo.a)', 'note': 'The alpha is a blend factor, not transparency. Materials without the named layer must use source fallback.'},
    {'kind': 'procedural_brick_missing', 'materials': ['H06_ladrillo', 'H09_ladrillo'], 'missing': ['TEX_BRICK albedo', 'TEX_BRICK bump']},
    {'kind': 'procedural_noise_normal_missing', 'materials': ['H10_Pavimento_piedra', 'H10_Piedra_caliza', 'H10_Zinc_cubierta'], 'missing': ['TEX_NOISE bump']},
]
with open(os.path.join(PROJECT, 'reports', 'export-texture-audit.json'), 'w', encoding='utf8') as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
summary = [{'name': entry['source']['name'], 'findings': entry['findings'], 'baseColorDefault': [p['inputs'].get('Base Color', {}).get('default') for p in entry['source'].get('principled', [])], 'gltfBaseColor': [e['material'].get('pbrMetallicRoughness', {}) for e in entry['exported']], 'objects': sum(len(e['objects']) for e in entry['exported'])} for entry in materials if entry['findings']]
print('TEXTURE_AUDIT ' + json.dumps(summary, ensure_ascii=False), flush=True)
