"""Lossless offline GLB deduplication and outline preparation; no Blender edits.

Original nodes, names, hierarchy, transforms, geometry values and texture pixels
are preserved. Content-addressed resources are shared, not object identities.
"""
import copy
import hashlib
import json
import os
import struct
import time
import numpy as np

PROJECT = r'D:\Español\SpanStories-Ciudades'
ZONE = os.path.join(PROJECT, 'Mundo', 'Paises', 'Espana', 'Ciudades', 'Barcelona', 'Zonas', 'PasseigGracia')
DTYPES = {5120: np.dtype('i1'), 5121: np.dtype('u1'), 5122: np.dtype('<i2'), 5123: np.dtype('<u2'), 5125: np.dtype('<u4'), 5126: np.dtype('<f4')}
COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}

def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()

def json_hash(value):
    return digest_bytes(json.dumps(value, sort_keys=True, separators=(',', ':')).encode('utf8'))

def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546c67 and version == 2 and length == len(data)
    n, tag = struct.unpack_from('<II', data, 12)
    assert tag == 0x4e4f534a
    document = json.loads(data[20:20 + n])
    offset = 20 + n
    size, tag = struct.unpack_from('<II', data, offset)
    assert tag == 0x004e4942
    return document, memoryview(data)[offset + 8:offset + 8 + size]

def write_glb(path, document, binary):
    js = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    js += b' ' * ((-len(js)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, 'wb') as stream:
        stream.write(struct.pack('<III', 0x46546c67, 2, total))
        stream.write(struct.pack('<II', len(js), 0x4e4f534a))
        stream.write(js)
        stream.write(struct.pack('<II', len(binary), 0x004e4942))
        stream.write(binary)

def accessor_array(document, binary, index):
    a = document['accessors'][index]
    assert not a.get('sparse'), 'Sparse accessor requires explicit handling'
    v = document['bufferViews'][a['bufferView']]
    dtype = DTYPES[a['componentType']]
    components = COMPONENTS[a['type']]
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', dtype.itemsize * components)
    return np.ndarray((a['count'], components), dtype=dtype, buffer=binary, offset=offset, strides=(stride, dtype.itemsize))

def smooth_outline(position, normal):
    keys = np.rint(position.astype(np.float64) * 10000).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    sums = np.zeros((int(inverse.max()) + 1, 3), dtype=np.float64)
    np.add.at(sums, inverse, normal)
    lengths = np.linalg.norm(sums, axis=1)
    sums /= np.maximum(lengths[:, None], 1e-12)
    return sums[inverse].astype('<f4')

def exact_weld(arrays, indices):
    """Merge only byte-identical vertices across EVERY existing attribute."""
    count = len(arrays['POSITION'])
    rows = np.concatenate([np.ascontiguousarray(a).view(np.uint8).reshape(count, -1) for _, a in sorted(arrays.items())], axis=1)
    keys = rows.view(np.dtype((np.void, rows.shape[1]))).reshape(-1)
    _, first, inverse = np.unique(keys, return_index=True, return_inverse=True)
    order = np.argsort(first)
    first = first[order]
    index_remap = np.empty(len(first), dtype=np.uint32)
    index_remap[order] = np.arange(len(first), dtype=np.uint32)
    inverse = index_remap[inverse]
    reduced = {semantic: array[first] for semantic, array in arrays.items()}
    # Exact proof preserves sharp normals, all seams, colors and vertex payload.
    for semantic, source in arrays.items():
        assert np.array_equal(reduced[semantic][inverse], source, equal_nan=True), 'Weld changed attribute ' + semantic
    mapped = inverse[indices.reshape(-1)]
    return reduced, mapped.astype('<u2' if len(first) <= 65535 else '<u4').reshape(-1, 1), first

def optimize(path, output):
    started = time.time()
    doc, binary = read_glb(path)
    result = copy.deepcopy(doc)
    out = bytearray()
    views, accessors = [], []
    accessor_cache, remap = {}, {}
    original_mesh_count = len(doc.get('meshes', []))
    image_hashes = []
    for image in doc.get('images', []):
        view = doc['bufferViews'][image['bufferView']]
        image_hashes.append(digest_bytes(binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]))

    def texture_key(index):
        texture = doc['textures'][index]
        return {'image': image_hashes[texture['source']], 'sampler': doc.get('samplers', [{}])[texture.get('sampler', 0)] if doc.get('samplers') else {}, 'extensions': texture.get('extensions', {})}

    def material_content(material):
        def normalize(value):
            if isinstance(value, dict):
                if 'index' in value and isinstance(value['index'], int):
                    return {k: (texture_key(v) if k == 'index' else normalize(v)) for k, v in value.items()}
                return {k: normalize(v) for k, v in value.items() if k not in ('name', 'extras')}
            if isinstance(value, list):
                return [normalize(x) for x in value]
            return value
        return normalize(material)

    material_hashes = [json_hash(material_content(m)) for m in doc.get('materials', [])]
    unique_materials, material_remap, material_cache = [], {}, {}
    for index, material in enumerate(doc.get('materials', [])):
        key = material_hashes[index]
        if key not in material_cache:
            material_cache[key] = len(unique_materials)
            item = copy.deepcopy(material)
            item.setdefault('extras', {})['ssMaterial'] = key
            unique_materials.append(item)
        material_remap[index] = material_cache[key]
    result['materials'] = unique_materials

    def add_array(array, template, target=None):
        array = np.ascontiguousarray(array)
        byte_stride = None
        if template['componentType'] == 5120 and template['type'] == 'VEC3':
            padded = np.zeros((len(array), 4), dtype=np.int8)
            padded[:, :3] = array
            data = padded.tobytes()
            byte_stride = 4
        else:
            data = array.tobytes()
        fields = {k: template[k] for k in ('componentType', 'count', 'type', 'normalized') if k in template}
        key = json_hash(fields) + ':' + digest_bytes(data)
        if key in accessor_cache:
            return accessor_cache[key]
        offset = len(out)
        out.extend(data)
        out.extend(b'\0' * ((-len(out)) % 4))
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if byte_stride:
            view['byteStride'] = byte_stride
        if target:
            view['target'] = target
        views.append(view)
        a = {k: copy.deepcopy(v) for k, v in template.items() if k not in ('bufferView', 'byteOffset', 'sparse')}
        a['bufferView'] = len(views) - 1
        accessor_cache[key] = len(accessors)
        accessors.append(a)
        return len(accessors) - 1

    def convert_accessor(index, target):
        if index not in remap:
            remap[index] = add_array(accessor_array(doc, binary, index), doc['accessors'][index], target)
        return remap[index]

    mesh_cache, mesh_remap, meshes, outline_cache = {}, {}, [], {}
    source_geometry_hashes = set()
    vertices_before, vertices_after, primitive_triangles = 0, 0, 0
    for mesh_index, mesh in enumerate(doc.get('meshes', [])):
        converted = copy.deepcopy(mesh)
        primitive_keys = []
        for p in converted['primitives']:
            original_attributes = p['attributes'].copy()
            arrays = {semantic: accessor_array(doc, binary, index) for semantic, index in original_attributes.items()}
            count_before = len(arrays['POSITION'])
            original_indices = accessor_array(doc, binary, p['indices']) if 'indices' in p else np.arange(count_before, dtype=np.uint32).reshape(-1, 1)
            outline = smooth_outline(arrays['POSITION'], arrays['NORMAL']) if 'NORMAL' in arrays else None
            arrays, welded_indices, first = exact_weld(arrays, original_indices)
            vertices_before += count_before
            vertices_after += len(first)
            primitive_triangles += len(welded_indices) // 3
            resource_hash = hashlib.sha256()
            for semantic, index in sorted(original_attributes.items()):
                a = {**doc['accessors'][index], 'count': len(first)}
                resource_hash.update(semantic.encode('ascii'))
                resource_hash.update(json.dumps({k: a[k] for k in ('componentType', 'type', 'count', 'normalized') if k in a}, sort_keys=True).encode('ascii'))
                resource_hash.update(np.ascontiguousarray(arrays[semantic]).tobytes())
            resource_hash.update(welded_indices.tobytes())
            geometry_hash = resource_hash.hexdigest()
            source_geometry_hashes.add(geometry_hash)
            p['attributes'] = {semantic: add_array(arrays[semantic], {**doc['accessors'][index], 'count': len(first)}, 34962) for semantic, index in original_attributes.items()}
            p['indices'] = add_array(welded_indices, {'componentType': 5123 if welded_indices.dtype.itemsize == 2 else 5125, 'type': 'SCALAR', 'count': len(welded_indices)}, 34963)
            if 'POSITION' in original_attributes and 'NORMAL' in original_attributes:
                if geometry_hash not in outline_cache:
                    normals = np.rint(outline[first] * 127).astype(np.int8)
                    outline_cache[geometry_hash] = add_array(normals, {'componentType': 5120, 'type': 'VEC3', 'count': len(normals), 'normalized': True}, 34962)
                p['attributes']['_OUTLINE_NORMAL'] = outline_cache[geometry_hash]
            material_hash = material_hashes[p['material']] if 'material' in p else 'none'
            source_material_name = doc['materials'][p['material']].get('name', '') if 'material' in p else ''
            if 'material' in p:
                p['material'] = material_remap[p['material']]
            p.setdefault('extras', {}).update(ssGeometry=geometry_hash, ssMaterial=material_hash, ssSourceMaterial=source_material_name)
            primitive_keys.append([geometry_hash, material_hash, p.get('mode', 4)])
        key = json_hash(primitive_keys)
        converted.setdefault('extras', {}).update(ssGeometry=key, ssMaterials=[p['extras']['ssMaterial'] for p in converted['primitives']])
        if key not in mesh_cache:
            mesh_cache[key] = len(meshes)
            meshes.append(converted)
        mesh_remap[mesh_index] = mesh_cache[key]
    result['meshes'] = meshes
    for node in result.get('nodes', []):
        if 'mesh' in node:
            node['mesh'] = mesh_remap[node['mesh']]
            mesh = meshes[node['mesh']]
            node.setdefault('extras', {}).update(ssGeometry=mesh['extras']['ssGeometry'], ssMaterials=mesh['extras']['ssMaterials'])

    image_views = {}
    for image in result.get('images', []):
        old_view = doc['bufferViews'][image['bufferView']]
        data = bytes(binary[old_view.get('byteOffset', 0):old_view.get('byteOffset', 0) + old_view['byteLength']])
        key = digest_bytes(data)
        if key not in image_views:
            offset = len(out)
            out.extend(data)
            out.extend(b'\0' * ((-len(out)) % 4))
            image_views[key] = len(views)
            views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)})
        image['bufferView'] = image_views[key]
        image.setdefault('extras', {})['ssTexture'] = key
    result['accessors'] = accessors
    result['bufferViews'] = views
    result['buffers'] = [{'byteLength': len(out)}]
    result['asset'].setdefault('extras', {}).update(ssOptimization='exact lossless vertex weld + content deduplication + offline signed-byte outline normals', ssSourceBytes=os.path.getsize(path), ssOutlineNormalErrorMaxPerComponent=1/254)
    write_glb(output, result, out)
    geometry_bytes = sum(view['byteLength'] for view in views if 'target' in view)
    return {'rawBytes': os.path.getsize(path), 'deduplicatedBytes': os.path.getsize(output), 'geometryBytesEstimated': geometry_bytes, 'nodes': len(result['nodes']), 'meshesBefore': original_mesh_count, 'meshesAfter': len(meshes), 'geometriesUnique': len(source_geometry_hashes), 'materialsBefore': len(doc.get('materials', [])), 'materialsAfter': len(unique_materials), 'accessorsBefore': len(doc['accessors']), 'accessorsAfter': len(accessors), 'durationSeconds': time.time() - started, 'outlineGeometries': len(outline_cache), 'outlineFormat': 'normalized signed BYTE VEC3 stride4', 'outlineComponentErrorBound': 1/254, 'verticesBefore': vertices_before, 'verticesAfter': vertices_after, 'trianglesPreserved': primitive_triangles, 'exactWeldVerified': True}

def main():
    with open(os.path.join(ZONE, 'zona.raw.json'), encoding='utf8') as f:
        manifest = json.load(f)
    reports = []
    for sector in manifest['sectors']:
        raw = os.path.join(ZONE, 'assets', sector['id'] + '.raw.glb')
        output = os.path.join(ZONE, 'assets', sector['id'] + '.dedup.glb')
        report = {'id': sector['id'], **optimize(raw, output)}
        reports.append(report)
        print('CITY_OPTIMIZED ' + json.dumps(report), flush=True)
    with open(os.path.join(PROJECT, 'reports', 'export-optimization.json'), 'w', encoding='utf8') as f:
        json.dump({'method': 'lossless exact vertex weld and content deduplication; original geometry/normals/colors/UV values preserved; added outline vectors quantized signed byte only', 'sectors': reports}, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
