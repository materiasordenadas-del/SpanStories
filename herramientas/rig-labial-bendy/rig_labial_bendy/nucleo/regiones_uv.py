"""Resolve UV-island face seeds into explicit face regions without importing Blender."""
import json
from numbers import Integral


def marcar_por_seed(cara, inventario, asignaciones, ojos_uv_seeds, aplicar, uv_layer, tolerance=1e-6):
    if not inventario.get('has_uv'):
        raise ValueError('La malla no tiene una capa UV activa')
    if not isinstance(asignaciones, dict):
        raise TypeError('asignaciones debe ser region -> lista de semillas UV')
    by_seed = {int(island['seed_face']): island for island in inventario.get('islas_uv', [])}
    usados = set()

    def resolver(values, label):
        seeds = list(values)
        faces = []
        for raw in seeds:
            if isinstance(raw, bool) or not isinstance(raw, Integral):
                raise TypeError(f'Semilla UV no entera en {label}: {raw!r}')
            seed = int(raw)
            if seed not in by_seed:
                raise ValueError(f'Semilla UV inexistente: {seed} ({label})')
            if seed in usados:
                raise ValueError(f'Semilla UV repetida o solapada: {seed}')
            usados.add(seed)
            faces.extend(by_seed[seed]['face_indices'])
        return seeds, faces

    resolved = {}
    trace_regions = {}
    for region, seeds in asignaciones.items():
        trace_regions[region], resolved[region] = resolver(seeds, str(region))
    eye_seeds, eye_faces = resolver(ojos_uv_seeds, 'ojos')

    # All seeds and overlaps have been validated before the callback can mutate mesh attributes.
    result = aplicar(cara, resolved, eye_faces)
    trace = {'uv_layer': str(uv_layer), 'tolerance': float(tolerance),
             'regions': trace_regions, 'eyes_uv_seeds': [int(x) for x in eye_seeds],
             'resolved_face_counts': {name: len(faces) for name, faces in resolved.items()},
             'resolved_eye_faces': len(eye_faces)}
    cara['rlb_regiones_uv'] = json.dumps(trace, ensure_ascii=False, separators=(',', ':'))
    return {'map': result, 'uv_trace': trace}
