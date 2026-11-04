"""Read-only Blender audit. Import with runpy; no CLI dependencies or scene edits."""
import math
from collections import Counter

import bpy
import bmesh
from mathutils import Vector


def region_ids(points, regions):
    result = {}
    for name, spec in (regions or {}).items():
        center = Vector(spec['center'])
        radius = float(spec['radius'])
        if len(center) != 3 or not all(math.isfinite(x) for x in center):
            raise ValueError('Region center must be finite WORLD xyz')
        if not math.isfinite(radius) or radius <= 0:
            raise ValueError('Region radius must be finite and positive')
        result[name] = {i for i, co in enumerate(points) if (co - center).length <= radius}
    return result


def audit(mesh_names, regions=None, max_influences=None, weight_tolerance=0.001,
          weight_jump_limit=0.75, leakage_tolerance=0.01):
    if bpy.context.mode not in {'OBJECT', 'POSE'}:
        raise ValueError('Audit requires OBJECT or POSE mode; no automatic mode change')
    if not mesh_names or len(set(mesh_names)) != len(mesh_names):
        raise ValueError('Provide unique explicit mesh names')
    if max_influences is not None and max_influences < 1:
        raise ValueError('max_influences must be positive')
    if not 0 <= weight_tolerance < 1 or not 0 < weight_jump_limit <= 1 or not 0 <= leakage_tolerance < 1:
        raise ValueError('Invalid weight thresholds')
    report = {'blender': bpy.app.version_string, 'meshes': [],
              'visual_review': 'required', 'anatomy_detection': 'not_performed'}
    for name in mesh_names:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != 'MESH':
            raise ValueError('Not a mesh: ' + name)
        bm = bmesh.new()
        try:
            bm.from_mesh(obj.data)
            bm.verts.ensure_lookup_table()
            bm.verts.index_update()
            coords = [obj.matrix_world @ v.co for v in bm.verts]
            finite = sum(not all(math.isfinite(x) for x in co) for co in coords)
            # Scale-relative area epsilon; does not label thin valid faces by aspect ratio.
            extent = max((max(co[k] for co in coords) - min(co[k] for co in coords)
                          for k in range(3)), default=0) if coords and not finite else 0
            eps = max(extent * extent * 1e-12, 1e-30)
            # Full polygon area in WORLD coordinates, including non-triangles.
            def bad_face(f):
                vs = [obj.matrix_world @ v.co for v in f.verts]
                normal = Vector((0, 0, 0))
                for a, b in zip(vs, vs[1:] + vs[:1]):
                    normal += a.cross(b)
                return normal.length / 2 <= eps
            def topology(ids):
                faces = [f for f in bm.faces if any(v.index in ids for v in f.verts)]
                edges = [e for e in bm.edges if any(v.index in ids for v in e.verts)]
                return {'vertices': len(ids), 'touching_faces': len(faces),
                        'face_sides': dict(Counter(str(len(f.verts)) for f in faces)),
                        'boundary_edges': sum(e.is_boundary for e in edges),
                        'wire_edges': sum(e.is_wire for e in edges),
                        'edges_over_two_faces': sum(len(e.link_faces) > 2 for e in edges),
                        'degenerate_faces': sum(bad_face(f) for f in faces),
                        'loose_vertices': sum(not bm.verts[i].link_edges for i in ids),
                        'valence_over_5': sum(len(bm.verts[i].link_edges) > 5 for i in ids)}
            zones = region_ids(coords, regions)
            arm_mods = [m for m in obj.modifiers if m.type == 'ARMATURE']
            weight_reports = []
            for mod in arm_mods:
                arm = mod.object
                wr = {'modifier': mod.name, 'armature': arm.name if arm else None,
                      'viewport_enabled': mod.show_viewport,
                      'vertex_groups_enabled': mod.use_vertex_groups,
                      'envelopes_enabled': mod.use_bone_envelopes}
                if arm and arm.type == 'ARMATURE' and mod.use_vertex_groups:
                    names = {b.name for b in arm.data.bones if b.use_deform}
                    indices = {g.index for g in obj.vertex_groups if g.name in names}
                    group_names = {g.index: g.name for g in obj.vertex_groups if g.index in indices}
                    missing = sorted(names - {g.name for g in obj.vertex_groups})
                    no_weights, bad_sums, too_many = set(), set(), set()
                    maps = []
                    for vertex in obj.data.vertices:
                        weights_by_name = {group_names[g.group]: g.weight for g in vertex.groups
                                           if g.group in indices and g.weight > 1e-8}
                        maps.append(weights_by_name)
                        weights = list(weights_by_name.values())
                        if not weights:
                            no_weights.add(vertex.index)
                        elif abs(sum(weights) - 1) > weight_tolerance:
                            bad_sums.add(vertex.index)
                        if max_influences is not None and len(weights) > max_influences:
                            too_many.add(vertex.index)
                    wr.update(unweighted_vertices=len(no_weights),
                              unnormalized_vertices=len(bad_sums),
                              over_influence_limit=len(too_many),
                              regions={zone: {'unweighted': len(ids & no_weights),
                                              'unnormalized': len(ids & bad_sums),
                                              'over_limit': len(ids & too_many)}
                                       for zone, ids in zones.items()},
                              missing_deform_groups_count=len(missing),
                              missing_deform_groups_sample=missing[:8])
                    for zone, ids in zones.items():
                        zr = wr['regions'][zone]
                        allowed = (regions or {})[zone].get('allowed_bones')
                        if allowed is not None:
                            unknown = set(allowed) - names
                            if unknown:
                                raise ValueError('Region allows unknown/nondeform bones: ' + ', '.join(sorted(unknown)))
                            zr['vertices_with_unexpected_weights'] = sum(
                                sum(w for bone, w in maps[i].items() if bone not in allowed) > leakage_tolerance
                                for i in ids)
                        else:
                            zr['anatomical_weight_check'] = 'not_configured'
                        jumps = []
                        for edge in bm.edges:
                            a, b = (v.index for v in edge.verts)
                            if a not in ids and b not in ids:
                                continue
                            keys = maps[a].keys() | maps[b].keys()
                            jumps.append(max((abs(maps[a].get(k, 0) - maps[b].get(k, 0))
                                              for k in keys), default=0))
                        zr['edges_with_abrupt_weight_change'] = sum(j > weight_jump_limit for j in jumps)
                        zr['max_weight_jump'] = round(max(jumps, default=0), 5)
                else:
                    wr['weight_check'] = 'not_applicable_or_invalid_target'
                weight_reports.append(wr)
            report['meshes'].append({
                'name': name, 'shared_mesh_users': obj.data.users,
                'empty': not coords, 'nonfinite_vertices': finite,
                'negative_transform': obj.matrix_world.determinant() < 0,
                'scale': [round(x, 6) for x in obj.scale],
                'shape_keys': len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0,
                'topology': topology(set(range(len(coords)))),
                'regions': {zone: topology(ids) for zone, ids in zones.items()},
                'armature_modifiers': weight_reports,
                'multiple_armature_modifiers': len(arm_mods) > 1,
                'rest_pose_review': 'manual_required',
            })
        finally:
            bm.free()
    return report
