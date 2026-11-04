"""Clasificación rígida de componentes sueltos por centroide vertical."""


def por_isla(z_coords, island_ids, selected_vertices, z_split):
    if len(z_coords) != len(island_ids):
        raise ValueError('z_coords e island_ids deben tener el mismo tamaño')
    selected_vertices = list(selected_vertices)
    if any(isinstance(i, bool) or not isinstance(i, int) or i < 0 or i >= len(z_coords)
           for i in selected_vertices):
        raise IndexError('Índice seleccionado fuera de rango o no entero')
    selected_islands = {island_ids[i] for i in selected_vertices}
    piece_mask = [False] * len(z_coords)
    jaw_weight = [0.0] * len(z_coords)
    for island in selected_islands:
        ids = [i for i, value in enumerate(island_ids) if value == island]
        is_jaw = sum(float(z_coords[i]) for i in ids) / len(ids) < z_split
        for i in ids:
            piece_mask[i] = True
            jaw_weight[i] = 1.0 if is_jaw else 0.0
    return piece_mask, jaw_weight
