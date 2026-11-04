"""Verifica el resultado real del sofá, no una maqueta del procesador."""
import json, struct, sys
from pathlib import Path

folder = Path(sys.argv[1])
data = (folder / 'spanstories.glb').read_bytes()
length = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20 + length])
report = json.loads((folder / 'spanstories.json').read_text(encoding='utf-8'))
source_data = (folder / 'original.glb').read_bytes()
source_doc = json.loads(source_data[20:20 + struct.unpack_from('<I', source_data, 12)[0]])
settings = json.loads((folder / 'settings.json').read_text())
preserve_albedo = settings.get('palette', 'source') == 'source'
if preserve_albedo and any('baseColorTexture' in m.get('pbrMetallicRoughness', {}) for m in source_doc.get('materials', [])):
    assert doc.get('images') and doc.get('textures')
assert not doc.get('cameras') and not doc.get('animations') and not doc.get('skins')
assert not doc.get('extensions', {}).get('KHR_lights_punctual')
assert report['removed'] == ['FLOOR']
assert report['output_triangles'] < report['object_triangles_before']
assert abs(report['base_z']) < 1e-5
expected = (2.26656, 1.05872, .86192)
assert all(abs(a-b) < .002 for a,b in zip(report['dimensions'], expected)), report['dimensions']
assert len(doc['meshes']) == 3
root_index = next(i for i,n in enumerate(doc['nodes']) if n.get('extras', {}).get('id') == 'articulo-001')
assert len(doc['nodes'][root_index]['children']) == 3
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        material = doc['materials'][primitive['material']]
        if 'baseColorTexture' in material['pbrMetallicRoughness']:
            assert 'TEXCOORD_0' in primitive['attributes']
for material in doc['materials']:
    pbr = material['pbrMetallicRoughness']
    assert pbr.get('roughnessFactor', 1) == 1
    assert pbr['metallicFactor'] == 0
    if not preserve_albedo:
        assert 'baseColorTexture' not in pbr
print(json.dumps({'verified': True, 'bytes': len(data), 'triangles': report['output_triangles'], 'dimensions': report['dimensions']}, ensure_ascii=False))
