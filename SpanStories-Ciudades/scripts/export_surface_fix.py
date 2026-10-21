"""Restore lost source graph semantics on derivatives; preserve mesh/node data.

Read RAW node/primitive material names, since generic export dedup can otherwise
hide different original graphs. Original Blender is never opened or written.
"""
import copy
import hashlib
import json
import os
import numpy as np
from export_optimize import PROJECT, ZONE, read_glb, write_glb, accessor_array, json_hash

def attr_values(document, binary, index):
    result = accessor_array(document, binary, index).astype(np.float32)
    accessor = document['accessors'][index]
    if accessor.get('normalized'):
        component = accessor['componentType']
        result /= {5121:255,5123:65535,5120:127,5122:32767}[component]
    return result

def main():
    with open(os.path.join(PROJECT, 'reports', 'export-surface-source.json'), encoding='utf8') as stream:
        source = json.load(stream)
    with open(os.path.join(PROJECT, 'reports', 'export-texture-audit.json'), encoding='utf8') as stream:
        audit = json.load(stream)
    layers = {entry['name']: entry for entry in audit['objectAttributeLayers']}
    image_bytes = open(os.path.join(ZONE, source['secondaryImage']['path']), 'rb').read()
    with open(os.path.join(ZONE, 'zona.raw.json'), encoding='utf8') as stream:
        manifest = json.load(stream)
    report = []
    for sector in manifest['sectors']:
        path = os.path.join(ZONE, 'assets', sector['id'] + '.dedup.glb')
        document, binary = read_glb(path)
        raw, _ = read_glb(os.path.join(ZONE, 'assets', sector['id'] + '.raw.glb'))
        raw_nodes = {node['extras']['ssId']: node for node in raw['nodes']}
        original = copy.deepcopy(document)
        out = bytearray(binary)
        materials, material_cache = [], {}
        meshes, mesh_cache = [], {}
        fixed = {'attribute':0, 'atlas':0, 'brick':0, 'noise':0}
        source_bindings = []

        def append_view(data, target=None):
            out.extend(b'\0' * ((-len(out)) % 4))
            offset = len(out)
            out.extend(data)
            out.extend(b'\0' * ((-len(out)) % 4))
            view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
            if target:
                view['target'] = target
            document['bufferViews'].append(view)
            return len(document['bufferViews']) - 1

        def add_attribute(array, kind):
            array = np.ascontiguousarray(array, dtype='<f4')
            view = append_view(array.tobytes(), 34962)
            document['accessors'].append({'bufferView':view, 'componentType':5126, 'type':kind, 'count':len(array)})
            return len(document['accessors']) - 1

        secondary_texture = None
        def get_secondary_texture(primary_texture):
            nonlocal secondary_texture
            if secondary_texture is None:
                document.setdefault('images', []).append({'bufferView':append_view(image_bytes), 'mimeType':'image/png', 'name':'H02_esgrafiado_albedo_1024', 'extras':{'ssTexture':source['secondaryImage']['sha256']}})
                texture = {'source':len(document['images']) - 1}
                if primary_texture is not None and 'sampler' in document['textures'][primary_texture]:
                    texture['sampler'] = document['textures'][primary_texture]['sampler']
                document.setdefault('textures', []).append(texture)
                secondary_texture = len(document['textures']) - 1
            return secondary_texture

        for node in document['nodes']:
            if 'mesh' not in node:
                continue
            raw_node = raw_nodes[node['extras']['ssId']]
            raw_mesh = raw['meshes'][raw_node['mesh']]
            old_mesh = original['meshes'][node['mesh']]
            assert len(raw_mesh['primitives']) == len(old_mesh['primitives'])
            mesh = copy.deepcopy(old_mesh)
            bindings = []
            for primitive_index, primitive in enumerate(mesh['primitives']):
                original_primitive = raw_mesh['primitives'][primitive_index]
                raw_material = raw['materials'][original_primitive['material']] if 'material' in original_primitive else None
                source_name = raw_material.get('name', '') if raw_material else ''
                primitive.setdefault('extras', {})['ssSourceMaterial'] = source_name
                material = copy.deepcopy(original['materials'][primitive['material']]) if 'material' in primitive else None
                surface = copy.deepcopy(source['surfaces'].get(source_name))
                if surface:
                    fixed[surface['kind']] += 1
                    source_layers = layers.get(node['name'], {}).get('colorLayers', [])
                    index = next((i for i, layer in enumerate(source_layers) if layer['name'] == 'BCN_albedo'), None)
                    semantic = 'COLOR_' + str(index + 1) if index is not None else None
                    surface['colorAttribute'] = semantic.lower().replace('color_0', 'color') if semantic in primitive['attributes'] else None
                    surface['sourceColorPresent'] = surface['colorAttribute'] is not None
                    if surface['kind'] == 'atlas':
                        primary_info = raw_material.get('pbrMetallicRoughness', {}).get('baseColorTexture', {})
                        # RAW and optimized texture indices are unchanged by dedup.
                        primary_texture = primary_info.get('index')
                        surface['atlas'].update(primaryTexture=primary_texture, primaryUV='uv' if not primary_info.get('texCoord', 0) else 'uv' + str(primary_info['texCoord']), secondaryTexture=get_secondary_texture(primary_texture), primaryTextureId=document['images'][document['textures'][primary_texture]['source']]['extras']['ssTexture'] if primary_texture is not None else None, secondaryTextureId=source['secondaryImage']['sha256'], patternConstant=0.0, secondaryUV='uv')
                        if node['name'] == 'H02_esgrafiado':
                            uv_source = next(entry for entry in source['missingUVsExtracted'] if entry['ssId'] == node['extras']['ssId'] and entry['primitive'] == primitive_index)
                            missing_uv = np.load(os.path.join(ZONE, uv_source['npz']))['uv']
                            assert len(missing_uv) == document['accessors'][primitive['attributes']['POSITION']]['count']
                            primitive['attributes']['_SS_H02_UV'] = add_attribute(missing_uv, 'VEC2')
                            assert 'COLOR_2' in primitive['attributes'], 'Original H02 pattern channel missing'
                            colors = attr_values(original, binary, primitive['attributes']['COLOR_2'])
                            pattern = colors[:, :3].mean(axis=1).reshape(-1,1)
                            primitive['attributes']['_SS_H02_PATTERN'] = add_attribute(pattern, 'SCALAR')
                            surface['atlas'].update(secondaryUV='_ss_h02_uv', patternAttribute='_ss_h02_pattern')
                            primitive['extras']['ssGeometry'] = hashlib.sha256((primitive['extras']['ssGeometry'] + hashlib.sha256(missing_uv.tobytes()).hexdigest() + hashlib.sha256(pattern.tobytes()).hexdigest()).encode('ascii')).hexdigest()
                    if surface['kind'] == 'noise':
                        bounds = source['generatedBoundsBlender'].get(node['name'])
                        surface['generatedBoundsBlender'] = bounds
                        node['extras']['generatedBoundsBlender'] = bounds
                    primitive['extras']['ssSurface'] = surface
                    primitive['extras']['ssSurfaceId'] = json_hash(surface)
                    material.setdefault('extras', {})['ssSurface'] = surface
                    material['name'] = source_name
                    primitive['extras']['ssMaterial'] = json_hash({'baseMaterialHash':primitive['extras'].get('ssMaterial'), 'surface':surface})
                    material['extras']['ssMaterial'] = primitive['extras']['ssMaterial']
                    bindings.append({'primitive':primitive_index, 'sourceName':source_name, 'kind':surface['kind'], 'colorAttribute':surface['colorAttribute'], 'surfaceId':primitive['extras']['ssSurfaceId']})
                if material is not None:
                    key = json_hash(material)
                    if key not in material_cache:
                        material_cache[key] = len(materials)
                        materials.append(material)
                    primitive['material'] = material_cache[key]
            node['extras']['ssSurfaceIds'] = [primitive.get('extras', {}).get('ssSurfaceId') for primitive in mesh['primitives']]
            mesh_key = json_hash(mesh)
            if mesh_key not in mesh_cache:
                mesh_cache[mesh_key] = len(meshes)
                meshes.append(mesh)
            node['mesh'] = mesh_cache[mesh_key]
            if bindings:
                source_bindings.append({'ssId':node['extras']['ssId'], 'name':node['name'], 'primitives':bindings})
        document['meshes'] = meshes
        document['materials'] = materials
        document['buffers'] = [{'byteLength':len(out)}]
        document['asset'].setdefault('extras', {})['ssSurfaceRepair'] = 'Source named colors/alpha fallback + H02 image/UV/pattern + source procedural parameters; geometry/nodes preserved'
        write_glb(path, document, out)
        report.append({'id':sector['id'], 'fixedPrimitives':fixed, 'sourceBindings':source_bindings, 'secondaryImageAdded':secondary_texture is not None, 'materials':len(materials), 'meshes':len(meshes), 'bytesBefore':len(binary), 'bytesAfter':len(out)})
        print('SURFACE_FIXED ' + json.dumps({key:value for key,value in report[-1].items() if key != 'sourceBindings'}), flush=True)
    with open(os.path.join(PROJECT, 'reports', 'export-surface-fix.json'), 'w', encoding='utf8') as stream:
        json.dump({'source':source['source'], 'secondaryImage':source['secondaryImage'], 'sectors':report, 'geometryReexported':False, 'geometryChanged':False, 'colorsResolvedInViewer':True}, stream, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
