"""Mapa persistente de regiones faciales en atributos de malla; Blender se importa solo al invocar."""
import json
from numbers import Integral

REGIONES = {
    'cejas': (1, (0.92, 0.58, 0.08, 1.0)),
    'pestanas': (2, (0.62, 0.30, 0.78, 1.0)),
    'labio_sup': (3, (0.88, 0.10, 0.12, 1.0)),
    'labio_inf': (4, (1.00, 0.38, 0.42, 1.0)),
    'nariz': (5, (0.10, 0.78, 0.86, 1.0)),
    'mandibula': (6, (0.18, 0.72, 0.30, 1.0)),
    'parpados_base_pestanas': (7, (0.62, 0.30, 0.78, 1.0)),
}
GRIS = (0.48, 0.48, 0.48, 1.0)
FACE_ATTR = 'RLB_region_id'
CORNER_ATTR = 'RLB_regiones'


def _prevalidar(cara, regiones, ojos):
    me = cara.data
    if not isinstance(regiones, dict):
        raise TypeError('regiones debe ser un diccionario nombre -> lista de índices de cara')
    desconocidas = set(regiones) - set(REGIONES)
    if desconocidas:
        raise ValueError('Regiones desconocidas: ' + ', '.join(sorted(map(str, desconocidas))))
    n = len(me.polygons)
    usados = {}
    normalized = {}
    for nombre, indices in regiones.items():
        current = []
        current_seen = set()
        for raw in indices:
            if isinstance(raw, bool) or not isinstance(raw, Integral):
                raise TypeError(f'Índice no entero en {nombre}: {raw!r}')
            raw = int(raw)
            if raw < 0 or raw >= n:
                raise IndexError(f'Índice de cara fuera de rango en {nombre}: {raw}')
            if raw in current_seen:
                raise ValueError(f'Índice repetido en {nombre}: {raw}')
            current.append(raw)
            current_seen.add(raw)
            if raw in usados:
                raise ValueError(f'Cara {raw} solapa {usados[raw]} y {nombre}')
            usados[raw] = nombre
        normalized[nombre] = current
    eye_indices = list(ojos)
    if not eye_indices:
        raise ValueError('Pasa explícitamente las caras de los ojos para mantenerlas grises')
    if len(eye_indices) != len(set(eye_indices)):
        raise ValueError('Índices oculares repetidos')
    eyes = set(eye_indices)
    for raw in eye_indices:
        if isinstance(raw, bool) or not isinstance(raw, Integral):
            raise TypeError(f'Índice de ojo no entero: {raw!r}')
        raw = int(raw)
        if raw < 0 or raw >= n:
            raise IndexError(f'Índice de ojo fuera de rango: {raw}')
        if raw in usados:
            raise ValueError(f'Cara ocular {raw} debe permanecer gris; también figura en {usados[raw]}')
    for name, typ, domain in ((FACE_ATTR, 'INT', 'FACE'), (CORNER_ATTR, 'FLOAT_COLOR', 'CORNER')):
        existing = me.attributes.get(name)
        if existing and (existing.data_type != typ or existing.domain != domain):
            raise ValueError(f'El atributo {name} ya existe con tipo/dominio incompatible')
    return normalized


def colorear(cara, regiones, ojos):
    """Pinta face-index lists without changing UVs, materials, polygons, or topology."""
    normalized = _prevalidar(cara, regiones, ojos)
    me = cara.data
    ids = [0] * len(me.polygons)
    for nombre, indices in normalized.items():
        value = REGIONES[nombre][0]
        for fi in indices:
            ids[fi] = value
    face_attr = me.attributes.get(FACE_ATTR) or me.attributes.new(FACE_ATTR, 'INT', 'FACE')
    face_attr.data.foreach_set('value', ids)
    corner_attr = me.attributes.get(CORNER_ATTR) or me.attributes.new(CORNER_ATTR, 'FLOAT_COLOR', 'CORNER')
    colors = [GRIS] * len(me.loops)
    for nombre, indices in normalized.items():
        color = REGIONES[nombre][1]
        for fi in indices:
            for li in me.polygons[fi].loop_indices:
                colors[li] = color
    flat = [component for color in colors for component in color]
    corner_attr.data.foreach_set('color', flat)
    counts = {name: len(indices) for name, indices in normalized.items()}
    for name, (rid, _) in REGIONES.items():
        counts.setdefault(name, 0)
    counts['gris'] = len(me.polygons) - sum(counts[name] for name in REGIONES)
    registry = {'face_attribute': FACE_ATTR, 'corner_attribute': CORNER_ATTR,
                'regions': {name: {'id': REGIONES[name][0], 'face_count': len(indices)} for name, indices in normalized.items()},
                'eyes_excluded_count': len(set(ojos)), 'counts': counts}
    cara['rlb_regiones'] = json.dumps(registry, ensure_ascii=False, separators=(',', ':'))
    return registry


def mostrar(cara, visible=True):
    """Toggle viewport display via vertex colors; hiding restores material display."""
    import bpy
    if visible and cara.data.attributes.get(CORNER_ATTR) is None:
        raise RuntimeError('Primero crea el mapa con marcar_regiones')
    if visible and hasattr(cara.data, 'color_attributes'):
        color_attr = cara.data.color_attributes.get(CORNER_ATTR)
        if color_attr is not None and hasattr(cara.data.color_attributes, 'active_color'):
            cara.data.color_attributes.active_color = color_attr
    changed = 0
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            shading = area.spaces.active.shading
            if visible:
                shading.color_type = 'VERTEX'
                if hasattr(shading, 'attribute_color'):
                    shading.attribute_color = CORNER_ATTR
            else:
                shading.color_type = 'MATERIAL'
            changed += 1
    return {'visible': bool(visible), 'viewports': changed, 'attribute': CORNER_ATTR}
