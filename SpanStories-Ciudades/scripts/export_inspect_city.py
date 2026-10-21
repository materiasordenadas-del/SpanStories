import bpy
import collections
import hashlib
import json
import os
import sys
from mathutils import Vector

PROJECT = r'D:\Español\SpanStories-Ciudades'
SOURCE = r'D:\Español\imagen para animación\Primera ciudad\Barcelona_PasseigGracia\blender\BARCELONA_CIUDAD_ACTUAL.blend'

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def main():
    before = sha256_file(SOURCE)
    objects = list(bpy.context.scene.objects)
    meshes = [o for o in objects if o.type == 'MESH']
    report = {
        'source': {'path': SOURCE, 'bytes': os.path.getsize(SOURCE), 'sha256': before},
        'scene': bpy.context.scene.name,
        'units': {'system': bpy.context.scene.unit_settings.system, 'scaleLength': bpy.context.scene.unit_settings.scale_length},
        'objects': len(objects),
        'types': dict(collections.Counter(o.type for o in objects)),
        'collections': [{'name': c.name, 'objects': len(c.objects), 'allObjects': len(c.all_objects), 'hideViewport': c.hide_viewport, 'hideRender': c.hide_render} for c in bpy.data.collections],
        'meshData': len(set(o.data.as_pointer() for o in meshes)),
        'verticesSource': sum(len(o.data.vertices) for o in meshes),
        'trianglesSource': sum(sum(max(0, len(p.vertices) - 2) for p in o.data.polygons) for o in meshes),
        'sharedMeshes': [{'name': m.name, 'users': m.users, 'vertices': len(m.vertices)} for m in bpy.data.meshes if m.users > 1],
        'materials': len(bpy.data.materials),
        'materialUse': [{'name': m.name, 'users': m.users, 'nodes': m.use_nodes} for m in bpy.data.materials],
        'images': [{'name': i.name, 'size': list(i.size), 'source': i.source, 'filepath': i.filepath, 'packed': bool(i.packed_file)} for i in bpy.data.images],
        'modifiers': dict(collections.Counter(mod.type for o in objects for mod in o.modifiers)),
        'parents': sum(bool(o.parent) for o in objects),
        'hiddenViewport': sum(o.hide_viewport for o in objects),
        'hiddenRender': sum(o.hide_render for o in objects),
        'animationData': [o.name for o in objects if o.animation_data],
        'negativeScale': [o.name for o in objects if o.matrix_world.to_3x3().determinant() < 0],
        'objectsSample': [{'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None, 'collections': [c.name for c in o.users_collection], 'location': list(o.location), 'scale': list(o.scale), 'props': {k: str(v) for k, v in o.items()}, 'data': o.data.name if o.data else None} for o in objects[:35]],
        'rootObjects': [{'name': o.name, 'type': o.type, 'collections': [c.name for c in o.users_collection]} for o in objects if not o.parent],
    }
    dg = bpy.context.evaluated_depsgraph_get()
    bounds_min, bounds_max = [float('inf')] * 3, [float('-inf')] * 3
    triangles = 0
    invalid = []
    sector_prefix = collections.Counter()
    for o in objects:
        if o.type not in ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META'):
            continue
        evaluated = o.evaluated_get(dg)
        for corner in evaluated.bound_box:
            v = evaluated.matrix_world @ Vector(corner)
            for axis in range(3):
                bounds_min[axis] = min(bounds_min[axis], v[axis])
                bounds_max[axis] = max(bounds_max[axis], v[axis])
        try:
            mesh = evaluated.to_mesh()
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            evaluated.to_mesh_clear()
        except Exception as err:
            invalid.append({'name': o.name, 'error': str(err)})
        sector_prefix[o.name.split('_')[0]] += 1
    report.update(boundsBlender={'min': bounds_min, 'max': bounds_max}, trianglesEvaluated=triangles, evaluationErrors=invalid, prefixes=dict(sector_prefix))
    report['hashAfterInspection'] = sha256_file(SOURCE)
    os.makedirs(os.path.join(PROJECT, 'reports'), exist_ok=True)
    with open(os.path.join(PROJECT, 'reports', 'export-inspection.json'), 'w', encoding='utf8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    print('CITY_INSPECTION ' + json.dumps({k: report[k] for k in ('objects','types','meshData','materials','images','modifiers','parents','boundsBlender','trianglesEvaluated','prefixes')}, ensure_ascii=False))

main()
