# Retoque de párpados por expresión (0.8.8). Los párpados NO se densifican por defecto: se dejan como están. Si en una
# expresión concreta (enojo, sorpresa...) el párpado sale mal, el usuario mueve a mano CADA vértice del párpado
# en modo edición, viendo la cara ya en esa expresión. El cambio se guarda como una shape key propia de esa expresión
# (`pp_<expr>`, canal `v_pp_<expr>`, driver como las demás): no toca el Basis ni las demás expresiones.
#   preparar(cara, expr)  -> entra en modo edición con la cara en la pose actual (los canales ya puestos por el editor)
#   guardar(cara, expr)   -> sale del modo edición y guarda lo movido (solo en la zona de los párpados)
#   quitar(cara, expr)    -> borra el retoque de esa expresión
import re
import bpy
import numpy as np
from . import biblioteca as BI
from .construir import marcar, _basis

PREF = 'pp_'
RADIO_R = 2.4          # zona editable: vértices a menos de RADIO_R × radio del globo del pivote, por delante del ojo
MIN_MM = 0.02          # por debajo de esto un vértice no cuenta como movido


def nombre(expr):
    return PREF + re.sub(r'[^0-9A-Za-z]+', '_', expr).strip('_')


def es_retoque(canal):
    return canal.startswith(PREF)


def _conectar(cara, ctrl, k):
    """canal v_<k> en el control y driver del valor de la key (igual que los ajustes finos)."""
    p = f'v_{k}'
    if p not in ctrl.keys():
        ctrl[p] = 0.0
    ctrl.id_properties_ui(p).update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0)
    sk = cara.data.shape_keys
    path = f'key_blocks["{k}"].value'
    if sk.animation_data:
        for f in [f for f in sk.animation_data.drivers if f.data_path == path]:
            sk.animation_data.drivers.remove(f)
    fc = sk.key_blocks[k].driver_add('value'); dr = fc.driver; dr.type = 'SCRIPTED'
    var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
    var.targets[0].id_type = 'OBJECT'; var.targets[0].id = ctrl; var.targets[0].data_path = f'["{p}"]'
    dr.expression = 'v'


def zona(cara):
    """máscara bool de los vértices de la zona de los párpados (ambos ojos), en espacio local."""
    P = _basis(cara.data)
    inv = cara.matrix_world.inverted()
    z = np.zeros(len(P), bool)
    for s in ('L', 'R'):
        piv = bpy.data.objects.get(f'{cara.name}_OjoPivote_{s}')
        if piv is None:
            continue
        c = np.array((inv @ piv.matrix_world.translation)[:])
        g = bpy.data.objects.get(f'{cara.name}_Globo_{s}')
        r = max(g.dimensions) / 2 / max(cara.matrix_world.to_scale()) if g is not None else 0.0127
        z |= (np.linalg.norm(P - c, axis=1) < RADIO_R * r) & (P[:, 1] < c[1] + 0.5 * r)
    if not z.any():
        raise RuntimeError('No encuentro los ojos (pivotes) para delimitar los párpados')
    return z


def _mezcla(cara, excluir):
    """posición de todos los vértices con las shape keys en su valor actual, sin la key `excluir` (sin armaduras)."""
    sk = cara.data.shape_keys
    n = len(cara.data.vertices)
    base = np.zeros(n * 3); sk.reference_key.data.foreach_get('co', base)
    M = base.reshape(-1, 3).copy()
    buf = np.zeros(n * 3); bufr = np.zeros(n * 3)
    for kb in sk.key_blocks:
        if kb == sk.reference_key or kb.name == excluir or kb.mute or abs(kb.value) < 1e-6:
            continue
        kb.data.foreach_get('co', buf); kb.relative_key.data.foreach_get('co', bufr)
        d = (buf - bufr).reshape(-1, 3)
        w = kb.value
        if kb.vertex_group and kb.vertex_group in cara.vertex_groups:
            gi = cara.vertex_groups[kb.vertex_group].index
            wv = np.array([next((g.weight for g in v.groups if g.group == gi), 0.0) for v in cara.data.vertices])
            d = d * wv[:, None]
        M += w * d
    return M


def _canal_pose(cara):
    cara.update_tag(); bpy.context.view_layer.update()


def _firma(cara):
    """(vértices, caras, suma de índices de esquina): cambia si se borran o añaden vértices/caras o se re-conectan."""
    me = cara.data
    lp = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lp)
    return [len(me.vertices), len(me.polygons), int(lp.sum() % 2147483647)]


def preparar(cara, expr):
    """Deja la key de retoque lista y entra en modo edición mostrando la expresión actual (con su retoque anterior, si lo
    hay). Antes hay que tener la expresión puesta en el control (el editor de expresiones ya lo hace)."""
    k = nombre(expr)
    ctrl = BI.control(cara)
    if ctrl is None:
        raise RuntimeError('Falta el control FACS de la cara')
    if cara.mode == 'EDIT':
        bpy.ops.object.mode_set(mode='OBJECT')
    sk = cara.data.shape_keys
    nuevo = sk is None or k not in sk.key_blocks
    if nuevo:
        base = _basis(cara.data)
        from .construir import poner_key
        poner_key(cara, k, np.zeros_like(base), 0.0, (0.0, 1.0))
        sk = cara.data.shape_keys
    _conectar(cara, ctrl, k)
    marcar(cara, k)
    kb = sk.key_blocks[k]
    ctrl[f'v_{k}'] = 0.0
    _canal_pose(cara)
    M = _mezcla(cara, k)
    bpy.app.driver_namespace['rlb_retoque_M'] = (cara.name, expr, M.copy())   # la MISMA mezcla se usa al guardar
    base = _basis(cara.data)
    retoque = np.zeros_like(base)
    if not nuevo:
        c = np.zeros(len(base) * 3); kb.data.foreach_get('co', c)
        retoque = c.reshape(-1, 3) - base
    # la key muestra, en modo edición, la cara en la expresión (más su retoque guardado)
    kb.data.foreach_set('co', (M + retoque).ravel())
    kb.value = 0.0
    cara.active_shape_key_index = list(sk.key_blocks).index(kb)
    cara.show_only_shape_key = False
    cara.use_shape_key_edit_mode = False
    bpy.context.view_layer.objects.active = cara
    bpy.ops.object.mode_set(mode='EDIT')
    cara['rlb_retoque_activo'] = expr
    cara['rlb_retoque_firma'] = _firma(cara)
    return {'key': k, 'vertices_zona': int(zona(cara).sum()), 'con_retoque_previo': not nuevo}


def guardar(cara, expr):
    """Sale del modo edición y guarda lo movido: solo cuenta la zona de los párpados. -> {'movidos', 'max_mm'}."""
    k = nombre(expr)
    sk = cara.data.shape_keys
    if sk is None or k not in sk.key_blocks:
        raise RuntimeError('No hay retoque en curso para esta expresión')
    ctrl = BI.control(cara)
    if cara.mode == 'EDIT':
        bpy.ops.object.mode_set(mode='OBJECT')
    f0 = list(cara.get('rlb_retoque_firma', []))
    if f0 and f0 != _firma(cara):
        raise RuntimeError('Cambiaste la topología (borraste o añadiste vértices/caras): eso afecta a TODAS las expresiones y no '
                           'se puede guardar como retoque de una sola. Deshaz ese cambio (Ctrl+Z) y mueve solo vértices')
    kb = sk.key_blocks[k]
    n = len(cara.data.vertices)
    E = np.zeros(n * 3); kb.data.foreach_get('co', E); E = E.reshape(-1, 3)
    kb.value = 0.0
    g = bpy.app.driver_namespace.get('rlb_retoque_M')
    if g and g[0] == cara.name and g[1] == expr and len(g[2]) == n:
        M = g[2]                   # la de preparar(): recalcularla aquí metía en el retoque cualquier cambio de pose (ruido de miles de vértices)
    else:
        M = _mezcla(cara, k)       # la key sigue en 0: la mezcla no la incluye
    base = _basis(cara.data)
    # M ya incluía el retoque guardado en k? No: se excluye. Lo editado E parte de M + retoque anterior, así que el nuevo
    # retoque es E - M (todo, no solo lo nuevo).
    D = E - M
    z = zona(cara)
    D[~z] = 0.0
    mov = np.linalg.norm(D, axis=1) > MIN_MM / 1000 * max(cara.matrix_world.to_scale())
    D[~mov] = 0.0
    kb.data.foreach_set('co', (base + D).ravel())
    kb.slider_min, kb.slider_max = 0.0, 1.0
    _conectar(cara, ctrl, k)       # el driver se podía perder al pasar por el modo edición: la key quedaba a 0 y el retoque no se veía
    ctrl[f'v_{k}'] = 1.0 if mov.any() else 0.0
    _canal_pose(cara)
    cara.active_shape_key_index = 0
    if 'rlb_retoque_activo' in cara.keys():
        del cara['rlb_retoque_activo']
    mm = float(np.linalg.norm(D, axis=1).max() * 1000 * max(cara.matrix_world.to_scale()))
    return {'movidos': int(mov.sum()), 'max_mm': round(mm, 2), 'key': k}


def quitar(cara, expr):
    k = nombre(expr)
    sk = cara.data.shape_keys
    ctrl = BI.control(cara)
    if cara.mode == 'EDIT':
        bpy.ops.object.mode_set(mode='OBJECT')
    if 'rlb_retoque_activo' in cara.keys():
        del cara['rlb_retoque_activo']
    if sk is None or k not in sk.key_blocks:
        return {'quitado': False}
    path = f'key_blocks["{k}"].value'
    if sk.animation_data:
        for f in [f for f in sk.animation_data.drivers if f.data_path == path]:
            sk.animation_data.drivers.remove(f)
    cara.shape_key_remove(sk.key_blocks[k])
    cara['facs_keys'] = [n for n in cara.get('facs_keys', []) if n != k]
    if ctrl is not None and f'v_{k}' in ctrl.keys():
        del ctrl[f'v_{k}']
    return {'quitado': True}
