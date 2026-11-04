"""Pure remapping helpers for evaluated meshes with reversible face deletion."""
import numpy as np


def reconstruir_indices(base_coords, evaluated_coords, base_ids=None):
    base = np.asarray(base_coords, dtype=float)
    ev = np.asarray(evaluated_coords, dtype=float)
    if base.ndim != 2 or base.shape[1] != 3 or ev.ndim != 2 or ev.shape[1] != 3:
        raise ValueError('Las coordenadas deben tener forma (n, 3)')
    if base_ids is None:
        if len(ev) != len(base):
            raise RuntimeError(f'La malla evaluada tiene {len(ev)} vértices y la base {len(base)}; falta RLB_indice_base')
        return ev.copy()
    ids = np.asarray(base_ids)
    if ids.ndim != 1 or len(ids) != len(ev):
        raise RuntimeError('RLB_indice_base debe contener un índice por vértice evaluado')
    if not np.issubdtype(ids.dtype, np.integer):
        if not np.isfinite(ids).all() or not np.equal(ids, np.floor(ids)).all():
            raise RuntimeError('RLB_indice_base contiene índices no enteros')
    ids = ids.astype(np.int64, copy=False)
    if np.any(ids < 0) or np.any(ids >= len(base)):
        raise RuntimeError('RLB_indice_base contiene índices fuera de rango')
    if len(np.unique(ids)) != len(ids):
        raise RuntimeError('RLB_indice_base contiene índices duplicados')
    out = base.copy()
    out[ids] = ev
    return out


def vertices_visibles(face_vertices, hidden_faces, n_vertices):
    if len(face_vertices) != len(hidden_faces):
        raise ValueError('Se requiere una bandera de ocultación por cara')
    visible = np.zeros(int(n_vertices), dtype=bool)
    for face, hidden in zip(face_vertices, hidden_faces):
        if hidden:
            continue
        for raw in face:
            i = int(raw)
            if i < 0 or i >= n_vertices:
                raise IndexError(f'Vertice fuera de rango: {i}')
            visible[i] = True
    return visible


def resolver_incrementos(jacobiano, residual, max_step=0.002, regularizacion=1e-6):
    """Damped least-squares increments per vertex, capped to a safe Newton step."""
    J = np.asarray(jacobiano, dtype=float)
    r = np.asarray(residual, dtype=float)
    if J.ndim != 3 or J.shape[1:] != (3, 3) or r.shape != (len(J), 3):
        raise ValueError('Se espera J=(n,3,3) y residual=(n,3)')
    if not np.isfinite(J).all() or not np.isfinite(r).all():
        raise ValueError('Jacobiano o residual no finito')
    if max_step <= 0 or regularizacion < 0:
        raise ValueError('max_step debe ser positivo y regularizacion no negativa')
    out = np.zeros_like(r)
    I = np.eye(3)
    for i, (Ji, ri) in enumerate(zip(J, r)):
        A = Ji.T @ Ji + (regularizacion ** 2) * I
        b = Ji.T @ ri
        try:
            out[i] = np.linalg.solve(A, b)
        except np.linalg.LinAlgError:
            out[i] = np.linalg.pinv(Ji, rcond=1e-6) @ ri
    lengths = np.linalg.norm(out, axis=1)
    scale = np.minimum(1.0, max_step / np.maximum(lengths, 1e-30))
    out *= scale[:, None]
    return out
