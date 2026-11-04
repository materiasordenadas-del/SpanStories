"""Pure helpers for deriving vertex masks from persistent face-region IDs."""
import numpy as np


def vertices_por_region(face_vertices, region_ids, n_vertices, region_id):
    if len(face_vertices) != len(region_ids):
        raise ValueError('Se requiere un ID por cara')
    mask = np.zeros(int(n_vertices), dtype=bool)
    for vertices, rid in zip(face_vertices, region_ids):
        if int(rid) == int(region_id):
            for vertex in vertices:
                vertex = int(vertex)
                if vertex < 0 or vertex >= n_vertices:
                    raise IndexError(f'Vertice fuera de rango: {vertex}')
                mask[vertex] = True
    return mask


def por_lado(mask, x_coords, center_x, side):
    if side not in (-1, 1):
        raise ValueError('side debe ser -1 o 1')
    if len(mask) != len(x_coords):
        raise ValueError('mask y x_coords deben tener igual longitud')
    return np.asarray(mask, dtype=bool) & (side * (np.asarray(x_coords) - float(center_x)) > 0)
