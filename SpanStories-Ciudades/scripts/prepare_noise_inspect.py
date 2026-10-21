"""Inspect implicit Generated Noise/Bump chains in a fresh background process.

Loads only referenced library datablocks, never saves or contacts live Blender.
"""
import bpy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).parents[1]
SOURCE = Path(r'D:\Español\imagen para animación\Primera ciudad\Barcelona_PasseigGracia\blender\BARCELONA_CIUDAD_ACTUAL.blend')
audit = json.loads((ROOT / 'reports/export-texture-audit.json').read_text(encoding='utf-8-sig'))
records = [m for m in audit['materials'] if any(n['type'] == 'TEX_NOISE' for n in m['source']['nodes'])]
names = [m['source']['name'] for m in records]
objects = sorted({name for m in records for e in m['exported'] for name in e['objects']})
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
with bpy.data.libraries.load(str(SOURCE), link=False) as (available, loaded):
    loaded.materials = [name for name in names if name in available.materials]
    loaded.objects = [name for name in objects if name in available.objects]

materials = []
for material in loaded.materials:
    graph = material.node_tree
    noise = next(n for n in graph.nodes if n.type == 'TEX_NOISE')
    bump = next(n for n in graph.nodes if n.type == 'BUMP')
    materials.append({
        'name': material.name,
        'noise': {'dimensions': noise.noise_dimensions, 'type': noise.noise_type,
                  'normalize': noise.normalize,
                  'inputs': {socket.name: (list(socket.default_value) if hasattr(socket.default_value, '__len__') else socket.default_value)
                             for socket in noise.inputs if not socket.is_linked},
                  'vectorLinked': noise.inputs['Vector'].is_linked,
                  'implicitCoordinate': 'Generated' if not noise.inputs['Vector'].is_linked else 'linked'},
        'bump': {'invert': bump.invert,
                 'inputs': {socket.name: (list(socket.default_value) if hasattr(socket.default_value, '__len__') else socket.default_value)
                            for socket in bump.inputs if not socket.is_linked},
                 'heightSource': [f'{link.from_node.name}.{link.from_socket.name}' for link in bump.inputs['Height'].links]},
    })

coordinates = []
for obj in loaded.objects:
    if obj is None or obj.type not in {'MESH', 'CURVE', 'FONT', 'SURFACE', 'META'}:
        continue
    coordinates.append({
        'name': obj.name, 'sourceType': obj.type,
        'materials': [slot.material.name if slot.material else None for slot in obj.material_slots],
        'uvLayers': [uv.name for uv in getattr(obj.data, 'uv_layers', [])],
        'textureSpaceLocationBlender': list(getattr(obj.data, 'texspace_location', (0, 0, 0))),
        'textureSpaceSizeBlender': list(getattr(obj.data, 'texspace_size', (1, 1, 1))),
        'hasSourceTextureSpace': hasattr(obj.data, 'texspace_size'),
        'autoTextureSpace': getattr(obj.data, 'use_auto_texspace', None),
        'localBoundsBlender': {'min': [min(v[i] for v in obj.bound_box) for i in range(3)],
                               'max': [max(v[i] for v in obj.bound_box) for i in range(3)]},
        'dimensionsBlender': list(obj.dimensions),
    })

report = {
    'source': str(SOURCE), 'sourceSha256': source_hash,
    'sourceUnchanged': hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash,
    'process': 'fresh --factory-startup --background; library datablocks only; no save/live UI',
    'materials': materials, 'objectCount': len(coordinates),
    'objectsWithoutUv': sum(not obj['uvLayers'] for obj in coordinates),
    'coordinates': coordinates,
    'generatedFormula': '(localPositionBlender - texspace_location) / (2 * texspace_size) + .5; use original mesh texture space, not arbitrary Three world bounds',
    'recommendedPreservation': 'Per-object tangent NORMAL bake from original Noise/Bump on derived UVs; export same derived UV coordinates and normal texture on that object.',
    'sharedTileRejected': '3D Generated depends original per-object texture space; no universal 2D UV tile preserves all faces, orientations and object scales.',
    'samplingAlternative': 'Blender-evaluated scalar 3D height LUT plus original Generated coordinates and original Bump settings; interpolation/derivative approximation must be measured and disclosed.',
    'notImplemented': ['no approximate GLSL noise substitute', 'no GLB mutation', 'no shared fake 2D normals', 'no source change'],
}
(ROOT / 'reports/noise-source-inspection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'materials': materials, 'objects': len(coordinates), 'objectsWithoutUv': report['objectsWithoutUv'],
                  'sourceUnchanged': report['sourceUnchanged'], 'report': 'reports/noise-source-inspection.json'}, ensure_ascii=False), flush=True)
