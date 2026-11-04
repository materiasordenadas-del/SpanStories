"""Inventario de componentes sin acceso a Blender, marcadores, grupos ni render."""
import hashlib
import json


def inventariar(vertices, edges, polygons):
    n = len(vertices)
    parent = list(range(n))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in edges:
        ra, rb = root(a), root(b)
        if ra != rb:
            parent[ra] = rb
    groups = {}
    for i in range(n):
        groups.setdefault(root(i), []).append(i)
    vertex_materials = [set() for _ in range(n)]
    for poly in polygons:
        for vi in poly.vertices:
            vertex_materials[vi].add(int(poly.material_index))
    result = []
    for ids in groups.values():
        coords = [vertices[i] for i in ids]
        mats = sorted({m for i in ids for m in vertex_materials[i]})
        seed = min(ids)
        item = {'seed': seed, 'n_vertices': len(ids),
                'bounds_min': [round(float(min(p[j] for p in coords)), 6) for j in range(3)],
                'bounds_max': [round(float(max(p[j] for p in coords)), 6) for j in range(3)],
                'material_indices': mats}
        item['key'] = hashlib.sha256(json.dumps(item, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:16]
        result.append(item)
    # Surface components use face adjacency by a shared edge, independently of vertex islands.
    mesh_edges = {tuple(sorted((int(a), int(b)))) for a, b in edges}
    edge_faces = {}
    for fi, poly in enumerate(polygons):
        vs = list(poly.vertices)
        for a, b in zip(vs, vs[1:] + vs[:1]):
            e = tuple(sorted((int(a), int(b))))
            if e in mesh_edges:
                edge_faces.setdefault(e, []).append(fi)
    adj = [[] for _ in polygons]
    for fs in edge_faces.values():
        for i, a in enumerate(fs):
            adj[a].extend(fs[:i] + fs[i + 1:])
    seen = set()
    comps = []
    for seed in range(len(polygons)):
        if seed in seen:
            continue
        seen.add(seed); stack = [seed]; comp = []
        while stack:
            fi = stack.pop(); comp.append(fi)
            for fj in adj[fi]:
                if fj not in seen:
                    seen.add(fj); stack.append(fj)
        comps.append(comp)
    vertex_surfaces = {}
    for si, comp in enumerate(comps):
        for fi in comp:
            for vi in polygons[fi].vertices:
                vertex_surfaces.setdefault(int(vi), set()).add(si)
    surfaces = []
    for si, comp in enumerate(comps):
        ids = sorted({int(vi) for fi in comp for vi in polygons[fi].vertices})
        coords = [vertices[i] for i in ids]
        shared = sorted(i for i in ids if len(vertex_surfaces[i]) > 1)
        mats = sorted({int(polygons[fi].material_index) for fi in comp})
        item = {'seed_face': min(comp), 'n_faces': len(comp), 'n_vertices': len(ids),
                'bounds_min': [round(float(min(p[j] for p in coords)), 6) for j in range(3)],
                'bounds_max': [round(float(max(p[j] for p in coords)), 6) for j in range(3)],
                'material_indices': mats, 'shared_vertices': shared, 'n_shared_vertices': len(shared)}
        item['key'] = hashlib.sha256(json.dumps(item, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:16]
        surfaces.append(item)
    return {'n_islas': len(result), 'islas': sorted(result, key=lambda x: (-x['n_vertices'], x['seed'])),
            'n_superficies': len(surfaces), 'superficies': sorted(surfaces, key=lambda x: (-x['n_faces'], x['seed_face']))}
