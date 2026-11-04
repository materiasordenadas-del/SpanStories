"""Inventario puro de islas UV ligadas a continuidad topológica de aristas."""
import hashlib
import json
import math


def inventariar(vertices, edges, face_vertices, face_uvs, tolerance=1e-6):
    """Group faces only across a shared mesh edge whose endpoint UVs are continuous.

    Face vertex lists and loop UV lists must be parallel. UV matching follows endpoint
    vertex identity, so flipped edge winding is handled and coincident UVs on unrelated
    edges never merge islands.
    """
    if len(face_vertices) != len(face_uvs):
        raise ValueError('Debe existir una lista de UV por cara')
    if tolerance < 0 or not math.isfinite(tolerance):
        raise ValueError('tolerance debe ser finita y no negativa')
    mesh_edges = {tuple(sorted((int(a), int(b)))) for a, b in edges}
    edge_faces = {}
    for fi, (vs, uvs) in enumerate(zip(face_vertices, face_uvs)):
        if len(vs) != len(uvs):
            raise ValueError(f'La cara {fi} no tiene un UV por loop')
        for uv in uvs:
            if len(uv) < 2 or not math.isfinite(float(uv[0])) or not math.isfinite(float(uv[1])):
                raise ValueError(f'UV no finito o incompleto en cara {fi}')
        for i, a in enumerate(vs):
            b = vs[(i + 1) % len(vs)]
            edge = tuple(sorted((int(a), int(b))))
            if edge not in mesh_edges:
                continue
            # Bind each endpoint UV to its geometric vertex, independent of winding.
            edge_faces.setdefault(edge, []).append((fi, {int(a): uvs[i], int(b): uvs[(i + 1) % len(vs)]}))

    adjacency = [[] for _ in face_vertices]
    for edge, entries in edge_faces.items():
        a, b = edge
        for i, (fa, ua) in enumerate(entries):
            for fb, ub in entries[i + 1:]:
                continuous = all(abs(float(ua[v][axis]) - float(ub[v][axis])) <= tolerance
                                 for v in (a, b) for axis in (0, 1))
                if continuous:
                    adjacency[fa].append(fb)
                    adjacency[fb].append(fa)

    seen, components = set(), []
    for seed in range(len(face_vertices)):
        if seed in seen:
            continue
        seen.add(seed); stack = [seed]; faces = []
        while stack:
            fi = stack.pop(); faces.append(fi)
            for other in adjacency[fi]:
                if other not in seen:
                    seen.add(other); stack.append(other)
        components.append(sorted(faces))

    result = []
    for faces in components:
        uvs = [uv for fi in faces for uv in face_uvs[fi]]
        item = {'seed_face': faces[0], 'face_indices': faces, 'n_faces': len(faces),
                'uv_bounds_min': [round(min(float(uv[a]) for uv in uvs), 8) for a in (0, 1)],
                'uv_bounds_max': [round(max(float(uv[a]) for uv in uvs), 8) for a in (0, 1)]}
        if vertices is not None:
            vids = sorted({int(v) for fi in faces for v in face_vertices[fi]})
            coords = [vertices[i] for i in vids]
            item['n_vertices'] = len(vids)
            item['bounds_min'] = [round(float(min(p[j] for p in coords)), 6) for j in range(3)]
            item['bounds_max'] = [round(float(max(p[j] for p in coords)), 6) for j in range(3)]
        item['key'] = hashlib.sha256(json.dumps(item, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:16]
        result.append(item)
    result.sort(key=lambda x: (-x['n_faces'], x['seed_face']))
    return {'has_uv': True, 'n_uv_islas': len(result), 'islas_uv': result}
