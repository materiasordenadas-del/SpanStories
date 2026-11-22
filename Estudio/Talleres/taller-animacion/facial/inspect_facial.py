"""Read-only GLB audit: names, non-zero exported deltas, hashes and clip ownership."""
import argparse, hashlib, json, math, pathlib, struct

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
folder = pathlib.Path(__file__).resolve().parent
path = folder / 'rachel.glb'
data = path.read_bytes()
json_length, _ = struct.unpack_from('<II', data, 12)
doc = json.loads(data[20:20+json_length])
binary_start = 20 + json_length + 8
binary = memoryview(data)[binary_start:]
contract = json.loads((folder / 'rachel.json').read_text(encoding='utf-8'))
canonical = contract['morphs']['arkit']

def delta_stats(index):
    accessor = doc['accessors'][index]
    if accessor['componentType'] != 5126 or accessor['type'] != 'VEC3':
        return {'status': 'unexpected accessor: not measured'}
    values = [(0, 0, 0)] * accessor['count']
    if 'bufferView' in accessor:
        view = doc['bufferViews'][accessor['bufferView']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', 12)
        values = [struct.unpack_from('<fff', binary, offset+i*stride) for i in range(accessor['count'])]
    sparse = accessor.get('sparse')
    if sparse:
        iv = doc['bufferViews'][sparse['indices']['bufferView']]
        vv = doc['bufferViews'][sparse['values']['bufferView']]
        io = iv.get('byteOffset', 0) + sparse['indices'].get('byteOffset', 0)
        vo = vv.get('byteOffset', 0) + sparse['values'].get('byteOffset', 0)
        fmt = {5121: 'B', 5123: 'H', 5125: 'I'}[sparse['indices']['componentType']]
        size = struct.calcsize('<'+fmt)
        for k in range(sparse['count']):
            index = struct.unpack_from('<'+fmt, binary, io+k*size)[0]
            values[index] = struct.unpack_from('<fff', binary, vo+k*12)
    maximum = 0.0
    nonzero = 0
    for xyz in values:
        length = math.sqrt(sum(v*v for v in xyz))
        maximum = max(maximum, length)
        nonzero += length > 1e-8
    return {'maxDeltaMeters': maximum, 'nonzeroVertices': nonzero}

meshes = []
for mesh in doc['meshes']:
    names = mesh.get('extras', {}).get('targetNames', [])
    channels = {}
    for name in canonical:
        if name not in names:
            continue
        target_index = names.index(name)
        stats = []
        for primitive in mesh['primitives']:
            target = primitive.get('targets', [])[target_index]
            if 'POSITION' in target:
                stats.append(delta_stats(target['POSITION']))
        channels[name] = stats
    meshes.append({'name': mesh.get('name'), 'primitives': len(mesh['primitives']), 'targetCount': len(names), 'present': list(channels), 'missing': [n for n in canonical if n not in channels], 'channels': channels})
clips = []
for a in doc.get('animations', []):
    paths = {}
    for c in a['channels']:
        prop = c['target']['path']
        paths[prop] = paths.get(prop, 0)+1
    clips.append({'name': a.get('name'), 'propertyTracks': paths})
report = {'schema': 'spanstories.arkit-file-audit', 'version': 1, 'character': 'rachel', 'file': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'canonicalCount': len(canonical), 'meshes': meshes, 'animations': clips, 'visualApproval': False, 'note': 'Non-zero exported deltas prove data, not correct anatomical motion or absence of clipping. Inspect rendered character separately.'}
output = pathlib.Path(args.output)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
face = meshes[0]
zero = [n for n, stats in face['channels'].items() if not any(s.get('nonzeroVertices', 0) for s in stats)]
print(json.dumps({'sha256': report['sha256'], 'faceChannels': len(face['present']), 'zeroDeltaFaceChannels': zero, 'animations': clips, 'report': str(output)}, ensure_ascii=False))
