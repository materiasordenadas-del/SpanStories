"""Temporary relative pose tests; compact heuristic metrics, no keys/save/operators."""
import math

import bpy
from mathutils import Vector, Quaternion


def _snapshot(obj, graph):
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    try:
        return ([evaluated.matrix_world @ v.co for v in mesh.vertices],
                [tuple(e.vertices) for e in mesh.edges],
                [tuple(p.vertices) for p in mesh.polygons])
    finally:
        evaluated.to_mesh_clear()


def _area(coords, ids):
    normal = Vector((0, 0, 0))
    for a, b in zip(ids, ids[1:] + ids[:1]):
        normal += coords[a].cross(coords[b])
    return normal.length / 2


def stress(armature_name, mesh_names, cases, regions=None,
           edge_ratio_limit=3.0, collapse_ratio=0.05, capture=None):
    """capture(case_name) optional synchronous visual capture, inside temporary pose.

    Capture should return JSON-serialisable evidence and not edit scene state.
    Regions use initial evaluated WORLD coordinates. Direct-bone relative transforms
    do not guarantee IK controller coverage. Animation is not advanced or keyed.
    """
    if bpy.context.mode not in {'OBJECT', 'POSE'}:
        raise ValueError('Stress requires OBJECT or POSE mode')
    arm = bpy.data.objects.get(armature_name)
    if arm is None or arm.type != 'ARMATURE':
        raise ValueError('Explicit armature required')
    if not mesh_names or len(set(mesh_names)) != len(mesh_names) or not cases:
        raise ValueError('Explicit unique meshes and at least one pose case required')
    if not math.isfinite(edge_ratio_limit) or edge_ratio_limit <= 1:
        raise ValueError('edge_ratio_limit must exceed 1')
    if not 0 < collapse_ratio < 1:
        raise ValueError('collapse_ratio must lie between 0 and 1')
    objects = []
    for name in mesh_names:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != 'MESH':
            raise ValueError('Not a mesh: ' + name)
        objects.append(obj)
    # Validate all cases before any mutation.
    prepared = []
    for case in cases:
        rotations = []
        if not case.get('rotations'):
            raise ValueError('Each case needs explicit relative rotations')
        for name, spec in case['rotations'].items():
            bone = arm.pose.bones.get(name)
            axis = Vector(spec['axis'])
            degrees = float(spec['degrees'])
            if bone is None or len(axis) != 3 or axis.length < 1e-8:
                raise ValueError('Invalid bone or axis: ' + name)
            if not math.isfinite(degrees) or not all(math.isfinite(x) for x in axis):
                raise ValueError('Pose rotation must be finite')
            rotations.append((bone, Quaternion(axis.normalized(), math.radians(degrees))))
        prepared.append((case['name'], rotations))
    if len({name for name, _ in prepared}) != len(prepared):
        raise ValueError('Case names must be unique')
    bases = {b.name: b.matrix_basis.copy() for b in arm.pose.bones}
    # Matrix assignment can alter Euler representations; restore channels exactly.
    channels = {b.name: (b.location.copy(), b.rotation_euler.copy(),
                         b.rotation_quaternion.copy(), tuple(b.rotation_axis_angle),
                         b.scale.copy(), b.rotation_mode) for b in arm.pose.bones}
    def restore():
        for b in arm.pose.bones:
            loc, euler, quat, angle, scale, mode = channels[b.name]
            b.rotation_mode = mode
            b.location = loc
            b.rotation_euler = euler
            b.rotation_quaternion = quat
            b.rotation_axis_angle = angle
            b.scale = scale
        bpy.context.view_layer.update()
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    baseline = {o.name: _snapshot(o, graph) for o in objects}
    zone_ids = {}
    for name, (coords, _, _) in baseline.items():
        zone_ids[name] = {}
        if any(not all(math.isfinite(x) for x in co) for co in coords):
            raise ValueError('Nonfinite baseline: ' + name)
        for label, spec in (regions or {}).items():
            center, radius = Vector(spec['center']), float(spec['radius'])
            if (len(center) != 3 or not all(math.isfinite(x) for x in center)
                    or not math.isfinite(radius) or radius <= 0):
                raise ValueError('Invalid WORLD region: ' + label)
            zone_ids[name][label] = {i for i, co in enumerate(coords)
                                    if (co - center).length <= radius}
    report = {'blender': bpy.app.version_string, 'armature': arm.name,
              'baseline': 'initial_evaluated_state', 'cases': [],
              'thresholds': {'edge_ratio_limit': edge_ratio_limit,
                             'collapse_ratio': collapse_ratio},
              'visual_review': 'required', 'volume_measurement': 'not_performed'}
    try:
        for name, rotations in prepared:
            restore()
            for bone, rotation in rotations:
                bone.matrix_basis = bases[bone.name] @ rotation.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            case_result = {'name': name, 'meshes': []}
            for obj in objects:
                base, edges, faces = baseline[obj.name]
                coords, posed_edges, posed_faces = _snapshot(obj, graph)
                if (len(base) != len(coords) or edges != posed_edges or faces != posed_faces):
                    case_result['meshes'].append({'name': obj.name,
                                                 'status': 'inconclusive_topology_changed'})
                    continue
                extent = max((max(co[k] for co in base) - min(co[k] for co in base)
                              for k in range(3)), default=0) if base else 0
                eps = max(extent * 1e-7, 1e-15)
                finite = sum(not all(math.isfinite(x) for x in co) for co in coords)
                def metrics(ids):
                    displacement = [(coords[i] - base[i]).length for i in ids]
                    ratios = []
                    for a, b in edges:
                        if a not in ids and b not in ids:
                            continue
                        before = (base[a] - base[b]).length
                        if before > eps:
                            ratios.append((coords[a] - coords[b]).length / before)
                    collapsed = 0
                    for face in faces:
                        if not any(i in ids for i in face):
                            continue
                        area = _area(base, face)
                        if area > eps * eps and _area(coords, face) < area * collapse_ratio:
                            collapsed += 1
                    moved = sum(d > eps for d in displacement)
                    stretched = sum(r > edge_ratio_limit for r in ratios)
                    compressed = sum(r < 1 / edge_ratio_limit for r in ratios)
                    return {'vertices': len(ids), 'moved_vertices': moved,
                            'coverage': 'measured' if moved else 'unproven_no_motion',
                            'max_displacement': round(max(displacement, default=0), 7),
                            'max_edge_ratio': round(max(ratios, default=1), 5),
                            'stretched_edges': stretched, 'compressed_edges': compressed,
                            'collapsed_faces': collapsed}
                overall = metrics(set(range(len(base))))
                status = 'needs_review' if (finite or overall['stretched_edges'] or
                         overall['compressed_edges'] or overall['collapsed_faces']) else 'no_numeric_flags'
                if not overall['moved_vertices']:
                    status = 'inconclusive_no_motion'
                if finite:
                    status = 'invalid_nonfinite'
                case_result['meshes'].append({'name': obj.name, 'status': status,
                    'nonfinite_vertices': finite, 'metrics': overall,
                    'regions': {label: metrics(ids) for label, ids in zone_ids[obj.name].items()}})
            if capture is not None:
                case_result['evidence'] = capture(name)
            report['cases'].append(case_result)
    finally:
        restore()
    report['pose_restored'] = True
    return report
