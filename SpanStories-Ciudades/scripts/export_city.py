"""Read a saved Blender city and produce independently editable GLB derivatives.

Run in a SEPARATE Blender --background --factory-startup process. Never saves .blend.
Optimizations and outline attributes are subsequently prepared by export_optimize.py.
"""
import bpy
import collections
import hashlib
import json
import math
import os
import time
import numpy as np
from mathutils import Matrix, Vector

PROJECT = r'D:\Español\SpanStories-Ciudades'
SOURCE = r'D:\Español\imagen para animación\Primera ciudad\Barcelona_PasseigGracia\blender\BARCELONA_CIUDAD_ACTUAL.blend'
ZONE = os.path.join(PROJECT, 'Mundo', 'Paises', 'Espana', 'Ciudades', 'Barcelona', 'Zonas', 'PasseigGracia')
ASSETS = os.path.join(ZONE, 'assets')
COORD = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))

def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            h.update(block)
    return h.hexdigest()

def stable_path(obj):
    parts = []
    while obj:
        parts.append(obj.name)
        obj = obj.parent
    return '/'.join(reversed(parts))

def stable_id(obj):
    return 'bcn-' + hashlib.sha256(stable_path(obj).encode('utf8')).hexdigest()[:16]

def bounds_of(evaluated):
    points = [COORD @ (evaluated.matrix_world @ Vector(corner)) for corner in evaluated.bound_box]
    return {'min': [min(p[i] for p in points) for i in range(3)], 'max': [max(p[i] for p in points) for i in range(3)]}

def merge_bounds(bounds):
    return {'min': [min(b['min'][i] for b in bounds) for i in range(3)], 'max': [max(b['max'][i] for b in bounds) for i in range(3)]}

def root_obj(obj):
    while obj.parent:
        obj = obj.parent
    return obj

def collection_disabled(collection, disabled):
    disabled = disabled or collection.hide_render
    if disabled:
        hidden_collections.add(collection.name)
    for child in collection.children:
        collection_disabled(child, disabled)

def collision_for(obj, bounds):
    name = obj.name.lower()
    size = [bounds['max'][i] - bounds['min'][i] for i in range(3)]
    ground_names = ('terreno', 'subsuelo', 'viario', 'calzada', 'acera', 'asfalto', 'panot', 'solar', 'zocalo', 'base', 'cubierta', 'tejado', 'barand', 'rotulo', 'esgrafiado', 'bordillo', 'marcas', 'bici_pintura')
    return obj.type in ('MESH', 'CURVE') and not any(n in name for n in ground_names) and size[0] >= 1.5 and size[2] >= 1.5 and size[1] >= 1.3 and bounds['min'][1] <= 3.5

def export(filepath, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_extras=True,
        export_materials='EXPORT', export_texcoords=True, export_normals=True,
        export_animations=False, export_cameras=False, export_lights=False,
        export_image_format='AUTO', export_keep_originals=False,
    )

started = time.time()
source_hash = file_hash(SOURCE)
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(os.path.join(PROJECT, 'reports'), exist_ok=True)
hidden_collections = set()
collection_disabled(bpy.context.scene.collection, False)
all_objects = list(bpy.context.scene.objects)
in_layer = set(bpy.context.view_layer.objects)
visible = [obj for obj in all_objects if obj in in_layer and not obj.hide_render and not any(c.name in hidden_collections for c in obj.users_collection)]
active = set(visible)
for obj in list(active):
    parent = obj.parent
    while parent:
        active.add(parent)
        parent = parent.parent
active = sorted(active, key=stable_path)
dg = bpy.context.evaluated_depsgraph_get()
by_object = {}
groups = collections.defaultdict(list)
triangles_by_collection = collections.Counter()
road_samples = []
for obj in active:
    matrix = COORD @ obj.matrix_world @ COORD.inverted()
    geom = obj.type in ('MESH', 'CURVE', 'FONT', 'META', 'SURFACE')
    evaluated = obj.evaluated_get(dg)
    bounds = bounds_of(evaluated) if geom else None
    triangles = 0
    if geom:
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles = len(mesh.loop_triangles)
        if '_viario_' in obj.name and any(c.name == 'BCN_F3_viario' for c in obj.users_collection):
            for polygon in mesh.polygons:
                world_normal = evaluated.matrix_world.to_3x3() @ polygon.normal
                if world_normal.z > .95:
                    p = COORD @ (evaluated.matrix_world @ polygon.center)
                    road_samples.append([float(p.x), float(p.z), float(p.y)])
        evaluated.to_mesh_clear()
        triangles_by_collection[(obj.users_collection[0].name if obj.users_collection else '')] += triangles
    by_object[obj] = {
        'id': stable_id(obj), 'name': obj.name, 'type': obj.type,
        'parentId': stable_id(obj.parent) if obj.parent in active else None,
        'worldMatrix': [matrix[row][column] for column in range(4) for row in range(4)],
        'bounds': bounds,
        'collections': [c.name for c in obj.users_collection],
        'collision': bool(bounds and collision_for(obj, bounds)),
        'trianglesEvaluated': triangles,
    }
    groups[root_obj(obj)].append(obj)

sectors = collections.defaultdict(list)
for root, objects in groups.items():
    geom_bounds = [by_object[obj]['bounds'] for obj in objects if by_object[obj]['bounds']]
    bounds = merge_bounds(geom_bounds) if geom_bounds else None
    if bounds:
        center = [(bounds['min'][i] + bounds['max'][i]) * .5 for i in range(3)]
        size = [bounds['max'][i] - bounds['min'][i] for i in range(3)]
        sector = 'base' if max(size[0], size[2]) > 220 else 's%d%d' % (min(2, max(0, int((center[0] + 265) / 175))), min(2, max(0, int((center[2] + 265) / 175))))
    else:
        v = COORD @ root.matrix_world.translation
        sector = 's%d%d' % (min(2, max(0, int((v.x + 265) / 175))), min(2, max(0, int((v.z + 265) / 175))))
    for obj in objects:
        item = by_object[obj]
        item['sector'] = sector
        obj['ssId'] = item['id']
        obj['ssSector'] = sector
        obj['ssType'] = item['type']
        obj['sourceName'] = obj.name
        obj['ssParentId'] = item['parentId'] or ''
        sectors[sector].append(obj)

baseline_path = os.path.join(ASSETS, 'baseline.glb')
print('CITY_EXPORT_BASELINE_START', flush=True)
export(baseline_path, active)
baseline_bytes = os.path.getsize(baseline_path)
ground = {'origin': [0, 0, 0], 'slope': [0, 0], 'method': 'fallback horizontal'}
if len(road_samples) >= 3:
    samples = np.asarray(road_samples, dtype=np.float64)
    design = np.column_stack((samples[:, :2], np.ones(len(samples))))
    coefficients, _, _, _ = np.linalg.lstsq(design, samples[:, 2], rcond=None)
    residual = samples[:, 2] - design @ coefficients
    ground = {'origin': [0, float(coefficients[2]), 0], 'slope': [float(coefficients[0]), float(coefficients[1])], 'method': 'least-squares evaluated upper road faces', 'samples': len(samples), 'maxResidual': float(abs(residual).max()), 'rmsResidual': float(np.sqrt((residual * residual).mean()))}
manifest = {
    'version': 1, 'id': 'barcelona-passeig-gracia', 'cityId': 'barcelona', 'countryId': 'es',
    'label': 'Barcelona · Passeig de Gràcia',
    'source': {'path': SOURCE, 'sha256': source_hash, 'bytes': os.path.getsize(SOURCE)},
    'coordinates': {'up': 'Y', 'unit': 'meter', 'conversion': 'Blender (x,y,z) -> Three (x,z,-y)'},
    'bounds': merge_bounds([item['bounds'] for item in by_object.values() if item['bounds']]),
    'spawn': [0, ground['origin'][1] + 1.7, 0], 'ground': ground, 'sectors': [], 'objects': [by_object[obj] for obj in active],
    'baseline': {'url': 'assets/baseline.glb', 'bytes': baseline_bytes},
}
for sector_id in sorted(sectors):
    objects = sectors[sector_id]
    bounds = [by_object[obj]['bounds'] for obj in objects if by_object[obj]['bounds']]
    if not bounds:
        # Empty-only sectors still preserve nodes; give a conservative point box.
        coords = [(COORD @ obj.matrix_world.translation)[:] for obj in objects]
        bounds = [{'min': list(c), 'max': list(c)} for c in coords]
    path = os.path.join(ASSETS, sector_id + '.raw.glb')
    print('CITY_EXPORT_SECTOR_START ' + sector_id + ' objects=' + str(len(objects)), flush=True)
    export(path, objects)
    manifest['sectors'].append({'id': sector_id, 'label': 'Terreno compartido' if sector_id == 'base' else 'Sector ' + sector_id[1:], 'url': 'assets/' + sector_id + '.glb', 'bounds': merge_bounds(bounds), 'bytes': os.path.getsize(path), 'objects': len(objects)})

after_hash = file_hash(SOURCE)
assert source_hash == after_hash, 'Original source changed during background export'
with open(os.path.join(ZONE, 'zona.raw.json'), 'w', encoding='utf8') as stream:
    json.dump(manifest, stream, ensure_ascii=False, separators=(',', ':'))
report = {'source': manifest['source'], 'hashAfterExport': after_hash, 'unchanged': source_hash == after_hash,
          'objectsExported': len(active), 'excludedHiddenObjects': [obj.name for obj in all_objects if obj not in active],
          'trianglesEvaluated': sum(item['trianglesEvaluated'] for item in by_object.values()),
          'trianglesByCollection': dict(triangles_by_collection), 'baselineBytes': baseline_bytes,
          'sectors': manifest['sectors'], 'durationSeconds': time.time() - started,
          'preserved': ['object identities', 'parent hierarchy', 'pivots', 'evaluated existing modifiers', 'world transforms', 'materials', 'UVs'],
          'limitations': ['GN and FONT exported as evaluated meshes inside each original node; edit parameters in original Blender only.', 'Toon and Blender-specific shader procedures adapted by viewer separately.']}
with open(os.path.join(PROJECT, 'reports', 'export-blender.json'), 'w', encoding='utf8') as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
print('CITY_EXPORT_DONE ' + json.dumps({'objects': len(active), 'triangles': report['trianglesEvaluated'], 'baselineBytes': baseline_bytes, 'sectors': len(sectors), 'durationSeconds': report['durationSeconds'], 'trianglesByCollection': dict(triangles_by_collection)}, ensure_ascii=False), flush=True)
