"""Regresión real: albedo, UV y geometría idéntica a la conversión anterior."""
import json, struct, sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
from processor import convert

def document(path):
    data = path.read_bytes()
    return json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])

source, baseline, output = map(Path, sys.argv[sys.argv.index('--')+1:])
output.parent.mkdir(parents=True, exist_ok=True)
settings = json.loads((baseline/'settings.json').read_text())
convert(source, output, settings)
before = document(source)
after = document(output)
materials = {m['name'].removeprefix('SpanStories_'): m for m in after['materials']}
for original in before['materials']:
    result = materials[original['name']]
    pbr = original.get('pbrMetallicRoughness', {})
    actual = result['pbrMetallicRoughness']
    expected_factor = pbr.get('baseColorFactor', [1,1,1,1])
    assert all(abs(a-b) < 1e-5 for a,b in zip(expected_factor, actual.get('baseColorFactor', [1,1,1,1])))
    if 'baseColorTexture' in pbr:
        assert 'baseColorTexture' in actual, original['name']
    assert actual.get('metallicFactor', 1) == 0 and actual.get('roughnessFactor', 1) == 1
    assert 'normalTexture' not in result and 'occlusionTexture' not in result
    assert result.get('alphaMode', 'OPAQUE') == original.get('alphaMode', 'OPAQUE')
    if original.get('alphaMode') == 'MASK':
        assert result.get('alphaCutoff', .5) == original.get('alphaCutoff', .5)
for mesh in after['meshes']:
    for primitive in mesh['primitives']:
        mat = after['materials'][primitive['material']]
        if 'baseColorTexture' in mat['pbrMetallicRoughness']:
            assert 'TEXCOORD_0' in primitive['attributes']
assert after.get('images'), 'Faltan las texturas de albedo'
old_report = json.loads((baseline/'spanstories.json').read_text())
report = json.loads(output.with_suffix('.json').read_text())
assert report['output_triangles'] == old_report['output_triangles'], (report['output_triangles'], old_report['output_triangles'])
assert report['dimensions'] == old_report['dimensions']
assert all(max(change['after']) <= 512 for change in report['texture_changes'])
print('TEXTURES_OK: factores de color, albedos y UV conservados; geometría y medidas idénticas.', flush=True)
