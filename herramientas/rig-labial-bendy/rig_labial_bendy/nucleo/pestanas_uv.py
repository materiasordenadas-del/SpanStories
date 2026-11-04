"""Root-edge transfer from UV-labeled lashes to the adjacent facial skin boundary."""
import json
import numpy as np


def proyectar_segmento(point, a, b):
    p, a, b = (np.asarray(v, dtype=float) for v in (point, a, b))
    d = b - a
    t = float(np.clip(np.dot(p - a, d) / max(float(np.dot(d, d)), 1e-20), 0.0, 1.0))
    q = a + t * d
    return float(np.dot(p - q, p - q)), t


def derivar_raices(vertices, edges, face_vertices, region_ids, uv_inventory, center_x):
    """Find lash-to-largest-adjacent-UV-skin edges and map nonroot lash vertices to segments."""
    P = np.asarray(vertices, dtype=float)
    if len(face_vertices) != len(region_ids):
        raise ValueError('Se requiere un ID por cara')
    edge_set = {tuple(sorted((int(a), int(b)))) for a, b in edges}
    face_island = {}
    islands = uv_inventory.get('islas_uv', [])
    for island in islands:
        for fi in island['face_indices']:
            face_island[int(fi)] = island
    lash_faces = {i for i, rid in enumerate(region_ids) if int(rid) == 2}
    if not lash_faces:
        raise ValueError('No hay caras de pestañas con RLB_region_id=2')
    edge_faces = {}
    for fi, vs in enumerate(face_vertices):
        for j, a in enumerate(vs):
            b = vs[(j + 1) % len(vs)]
            edge = tuple(sorted((int(a), int(b))))
            if edge in edge_set:
                edge_faces.setdefault(edge, []).append(fi)

    candidates = {}
    for edge, adjacent in edge_faces.items():
        if not any(fi in lash_faces for fi in adjacent):
            continue
        for fi in adjacent:
            if fi in lash_faces or fi not in face_island:
                continue
            island = face_island[fi]
            seed = int(island['seed_face'])
            entry = candidates.setdefault(seed, {'island': island, 'edges': set()})
            entry['edges'].add(edge)
    if not candidates:
        raise ValueError('Las caras de pestaña no comparten aristas con una isla UV de piel')
    skin_seed, skin = max(candidates.items(), key=lambda item:
                          (int(item[1]['island']['n_faces']), len(item[1]['edges']), -int(item[0])))
    root_edges = sorted(skin['edges'])
    lash_vertices = sorted({int(v) for fi in lash_faces for v in face_vertices[fi]})
    mapping = {'L': [], 'R': []}
    root_by_side = {'L': set(), 'R': set()}
    edges_by_side = {'L': [], 'R': []}
    for side, sx in (('L', 1), ('R', -1)):
        edges_side = []
        for a, b in root_edges:
            if sx * ((P[a, 0] + P[b, 0]) * 0.5 - center_x) <= 0:
                continue
            edges_side.append((a, b))
            edges_by_side[side].append((a, b))
            root_by_side[side].update((a, b))
        if not edges_side:
            raise ValueError(f'No hay aristas raíz UV de pestaña para lado {side}')
        side_vertices = [v for v in lash_vertices if sx * (P[v, 0] - center_x) > 0]
        roots = root_by_side[side]
        for vertex in side_vertices:
            if vertex in roots:
                continue
            best = None
            for a, b in edges_side:
                d2, t = proyectar_segmento(P[vertex], P[a], P[b])
                if best is None or d2 < best[0]:
                    best = (d2, a, b, t)
            if best is None:
                raise ValueError(f'No se pudo proyectar pestaña {vertex} lado {side}')
            _, a, b, t = best
            mapping[side].append([vertex, a, b, t])
    return {'skin_seed_face': int(skin_seed), 'skin_face_count': int(skin['island']['n_faces']),
            'shared_root_edges': {s: len(edges_by_side[s]) for s in ('L', 'R')},
            'root_edges': {s: [list(e) for e in edges_by_side[s]] for s in ('L', 'R')},
            'root_vertices': {s: sorted(root_by_side[s]) for s in ('L', 'R')},
            'mapping': mapping, 'n_lash_faces': len(lash_faces)}


def interpolar_pesos(wa, wb, t):
    return (1.0 - float(t)) * float(wa) + float(t) * float(wb)


def objetivos_raices_suaves(basis, evaluated, roots, curva_y, curva_z, grosor=0.00035):
    """Closed root curve; keep distinct root rows as finite depth, never edit Basis."""
    roots = np.asarray(roots, dtype=int)
    base = np.asarray(basis, dtype=float)[roots]
    current = np.asarray(evaluated, dtype=float)[roots]
    if len(roots) < 4 or len(np.unique(base[:, 0])) < 4:
        raise ValueError('Se necesitan cuatro posiciones X distintas para suavizar raíces UV')
    neutral_z = np.polynomial.Polynomial.fit(base[:, 0], base[:, 2], 3)
    depth = -float(grosor) * np.tanh((base[:, 2] - neutral_z(base[:, 0])) / 0.001)
    target = current.copy()
    target[:, 1] = np.polyval(curva_y, current[:, 0]) + depth
    target[:, 2] = np.polyval(curva_z, current[:, 0])
    return {int(vertex): target[i] - current[i] for i, vertex in enumerate(roots)}


def proyectar_objetivos_root(mapping, rim_vertices, desired, current, regularizacion=1e-8):
    """Least-squares root displacements satisfying mapped lash-rim targets, near current roots."""
    rim = set(int(v) for v in rim_vertices)
    constraints = [row for row in mapping if int(row[0]) in rim]
    if not constraints:
        return {}
    roots = sorted({int(row[i]) for row in constraints for i in (1, 2)})
    col = {v: i for i, v in enumerate(roots)}
    A = np.zeros((len(constraints), len(roots)), dtype=float)
    B = np.zeros((len(constraints), 3), dtype=float)
    for r, (vertex, a, b, t) in enumerate(constraints):
        A[r, col[int(a)]] += 1.0 - float(t)
        A[r, col[int(b)]] += float(t)
        B[r] = np.asarray(desired[int(vertex)], dtype=float)
    x0 = np.asarray([current.get(i, np.zeros(3)) for i in roots], dtype=float)
    gram = A.T @ A + regularizacion * np.eye(len(roots))
    rhs = A.T @ B + regularizacion * x0
    try:
        X = np.linalg.solve(gram, rhs)
    except np.linalg.LinAlgError:
        X = np.linalg.pinv(gram, rcond=1e-10) @ rhs
    return {root: X[i] for i, root in enumerate(roots)}


def objetivos_pestanas_evaluadas(basis, targets, mapping, centro):
    """Transport each original lash offset with the closing lid's radial frame."""
    base = np.asarray(basis, dtype=float)
    goal = np.asarray(targets, dtype=float)
    center = np.asarray(centro, dtype=float)
    out = {}
    for vertex, a, b, t in mapping:
        root0 = (1.0 - t) * base[a] + t * base[b]
        root1 = (1.0 - t) * goal[a] + t * goal[b]
        d0, d1 = root0 - center, root1 - center
        angle = np.arctan2(d0[2], -d0[1]) - np.arctan2(d1[2], -d1[1])
        offset = base[vertex] - root0
        cs, sn = np.cos(angle), np.sin(angle)
        rotated = np.array([offset[0], cs * offset[1] - sn * offset[2],
                            sn * offset[1] + cs * offset[2]])
        out[int(vertex)] = root1 + rotated
    return out


def interpolar_deltas_root(mapping, root_deltas):
    return {int(v): (1.0 - float(t)) * np.asarray(root_deltas[int(a)], dtype=float)
            + float(t) * np.asarray(root_deltas[int(b)], dtype=float)
            for v, a, b, t in mapping}


def aplicar_delta_lash(basis, key_coords, mapping):
    """Interpolate root displacement while retaining each lash vertex's original geometric offset."""
    base = np.asarray(basis, dtype=float)
    key = np.asarray(key_coords, dtype=float).copy()
    if base.shape != key.shape or base.ndim != 2 or base.shape[1] != 3:
        raise ValueError('Basis y key deben compartir forma (n, 3)')
    for vertex, a, b, t in mapping:
        if min(vertex, a, b) < 0 or max(vertex, a, b) >= len(base):
            raise IndexError('Índice de transferencia de pestaña fuera de rango')
        key[vertex] = base[vertex] + (1.0 - t) * (key[a] - base[a]) + t * (key[b] - base[b])
    return key


def _weight_map(vertex):
    return {int(g.group): float(g.weight) for g in vertex.groups}


def sincronizar(cara, rig, keys=None):
    """Transfer lash deform weights from UV-adjacent root edges and propagate contact keys."""
    from . import util, marco as MK, inventario_uv
    me = cara.data
    attr = me.attributes.get('RLB_region_id')
    if not attr or attr.domain != 'FACE' or attr.data_type != 'INT':
        raise RuntimeError('Falta el mapa FACE INT RLB_region_id con pestañas UV aprobadas')
    region_ids = np.zeros(len(me.polygons), dtype=np.int32)
    attr.data.foreach_get('value', region_ids)
    uv = me.uv_layers.active
    if uv is None:
        raise RuntimeError('Falta una capa UV activa')
    vertices = util.coords(me)
    edges = [tuple(int(v) for v in e.vertices) for e in me.edges]
    face_vertices = [tuple(int(v) for v in p.vertices) for p in me.polygons]
    face_uvs = [[tuple(float(x) for x in uv.data[li].uv) for li in p.loop_indices] for p in me.polygons]
    inv = inventario_uv.inventariar(vertices, edges, face_vertices, face_uvs)
    M = MK.Marco(cara)
    roots = derivar_raices(vertices, edges, face_vertices, region_ids, inv, M.cx)
    deform_groups = [g for g in cara.vertex_groups if g.name.startswith('DEF-parp_')]
    head = cara.vertex_groups.get('cabeza')
    transfer_groups = deform_groups + ([head] if head else [])
    plans = []
    for side in ('L', 'R'):
        for vertex, a, b, t in roots['mapping'][side]:
            wa, wb = _weight_map(me.vertices[a]), _weight_map(me.vertices[b])
            for group in transfer_groups:
                value = interpolar_pesos(wa.get(group.index, 0.0), wb.get(group.index, 0.0), t)
                plans.append((group, int(vertex), value))
    # All topology, side, and root assignments are valid before changing any vertex-group weights.
    for group, vertex, value in plans:
        current = _weight_map(me.vertices[vertex])
        if value > 1e-8:
            group.add([vertex], value, 'REPLACE')
        elif group.index in current:
            group.remove([vertex])
    d = MK.cfg(cara)
    d['pestanas_uv_roots'] = {'uv_layer': uv.name, 'region_id': 2, **roots}
    MK.guardar_cfg(cara, d)

    blocks = me.shape_keys.key_blocks if me.shape_keys else []
    key_names = list(keys) if keys is not None else [k.name for k in blocks
                 if k.name.startswith('parp_contacto.')]
    for name in key_names:
        for side in ('L', 'R'):
            propagar_correctiva(cara, name, side)
    return {'uv_layer': uv.name, 'skin_seed_face': roots['skin_seed_face'],
            'shared_root_edges': roots['shared_root_edges'],
            'transferred_vertices': {s: len(roots['mapping'][s]) for s in ('L', 'R')},
            'keys_propagated': key_names}


def propagar_correctiva(cara, key_name, side):
    from . import util
    d = json.loads(cara.get('rlb_cfg', '{}'))
    if key_name in d.get('pestanas_contacto_evaluado', []):
        return 0  # Already solved after Armature; key-space copying would undo radial transport.
    roots = d.get('pestanas_uv_roots')
    if not roots:
        return 0
    key = cara.data.shape_keys.key_blocks.get(key_name)
    if key is None:
        return 0
    basis = util.coords(cara.data)
    co = np.zeros(len(key.data) * 3); key.data.foreach_get('co', co); co = co.reshape(-1, 3)
    updated = aplicar_delta_lash(basis, co, roots['mapping'][side])
    key.data.foreach_set('co', updated.ravel())
    cara.data.shape_keys.update_tag()
    return len(roots['mapping'][side])
