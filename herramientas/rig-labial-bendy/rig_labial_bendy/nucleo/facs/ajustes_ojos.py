"""Puntos de párpados que reutilizan el dominio del cierre instalado.

No reconstruye el cierre ni reemplaza gestos, correctivas o drivers existentes.
Los ajustes parten de cero y se guardan en cada expresión como los labiales.
"""
import json
import re
import bpy
import numpy as np
from . import biblioteca as BI
from .construir import poner_key

VERSION = 6
DIRECCIONES = ('arriba', 'derecha', 'adelante')
MAX_PUNTOS = 6      # por párpado; cada cara usa los que tenga en aj_anclas (3 por defecto)
ZONAS = {
    f'parpado_{lab}_{i}_{s}': (f'{titulo} {i} {lado}', 'ojos', DIRECCIONES)
    for s, lado in (('R', 'der.'), ('L', 'izq.'))
    for lab, titulo in (('sup', 'Superior'), ('inf', 'Inferior'))
    for i in range(1, MAX_PUNTOS + 1)
}
REJILLA = [[f'parpado_{lab}_{i}_{s}' for i in range(1, MAX_PUNTOS + 1)]
           for lab in ('sup', 'inf') for s in ('R', 'L')]
GESTOS = ('eyeBlink', 'eyeSquint', 'eyeWide', 'lidAngry', 'lidSad', 'eyeLookUp', 'eyeLookDown')
NOMBRES = frozenset(f'aj_{p}_{d}' for p in ZONAS for d in DIRECCIONES)


def npuntos(anclas, lab, lado):
    """puntos de ese párpado: el mayor índice guardado en las anclas (3 si no hay más)."""
    return max([3] + [i for i in range(1, MAX_PUNTOS + 1) if f'parpado_{lab}_{i}_{lado}' in anclas])


def _co(key):
    out = np.empty(len(key.data) * 3)
    key.data.foreach_get('co', out)
    return out.reshape(-1, 3)


def disponible(cara):
    sk = cara.data.shape_keys if cara is not None and cara.type == 'MESH' else None
    return bool(sk and any(f'eyeBlink_{s}' in sk.key_blocks for s in ('L', 'R')))


def bordes_desde_superficie(cara):
    """Obtiene arcos de agujeros reales de la piel; no infiere puntos por pesos.

    Compatibilidad con rigs FACS anteriores que no guardaban los bordes. Nunca
    sustituye bordes explícitos ni modifica malla, globos o cierre existente.
    """
    from collections import defaultdict, Counter
    from .. import marco as MK
    me = cara.data
    lazos = {s: cara.get(f'facs_anillo_{s}') for s in ('L', 'R') if f'eyeBlink_{s}' in me.shape_keys.key_blocks}
    if lazos and all(lazos.values()):           # 0.8.45: con la cuenca cerrada no hay agujero: el borde es el lazo medido (anillo.py)
        base, borders = _co(me.shape_keys.reference_key), {}
        for side, raw_lazo in lazos.items():
            loop = np.asarray(json.loads(raw_lazo), dtype=int)
            loop = np.roll(loop, -int(np.argmin(base[loop, 0])))
            end = int(np.argmax(base[loop, 0]))
            first, second = loop[:end + 1], np.r_[loop[end:], loop[0]]
            upper, lower = (first, second) if base[first, 2].mean() > base[second, 2].mean() else (second, first)
            corners = {int(loop[0]), int(loop[end])}
            borders['sup_' + side] = [int(v) for v in upper if v not in corners]
            borders['inf_' + side] = [int(v) for v in lower if v not in corners]
        return borders
    seed = MK.cfg(cara).get('seed')
    if seed is None:
        raise RuntimeError('Falta la semilla de piel del rig para identificar los bordes')
    faces = [tuple(p.vertices) for p in me.polygons]
    edge_faces = defaultdict(list)
    for fi, vs in enumerate(faces):
        for a, b in zip(vs, vs[1:] + vs[:1]):
            edge_faces[tuple(sorted((a, b)))].append(fi)
    start = next((i for i, vs in enumerate(faces) if int(seed) in vs), None)
    if start is None:
        raise RuntimeError('La semilla de piel ya no corresponde a esta topología')
    skin, stack = {start}, [start]
    while stack:
        vs = faces[stack.pop()]
        for a, b in zip(vs, vs[1:] + vs[:1]):
            for fi in edge_faces[tuple(sorted((a, b)))]:
                if fi not in skin:
                    skin.add(fi); stack.append(fi)
    counts, adj = Counter(), defaultdict(set)
    for fi in skin:
        vs = faces[fi]
        counts.update(tuple(sorted(e)) for e in zip(vs, vs[1:] + vs[:1]))
    for (a, b), count in counts.items():
        if count == 1:
            adj[a].add(b); adj[b].add(a)
    loops, seen = [], set()
    for first in adj:
        if first in seen:
            continue
        comp, stack = [], [first]; seen.add(first)
        while stack:
            a = stack.pop(); comp.append(a)
            for b in adj[a]:
                if b not in seen:
                    seen.add(b); stack.append(b)
        if len(comp) < 8 or any(len(adj[i]) != 2 for i in comp):
            continue
        order, previous, current = [comp[0]], None, comp[0]
        while True:
            following = next(v for v in sorted(adj[current]) if v != previous)
            if following == order[0]:
                break
            order.append(following); previous, current = current, following
        loops.append(np.asarray(order, dtype=int))
    base, borders = _co(me.shape_keys.reference_key), {}
    inverse = cara.matrix_world.inverted()
    for side in ('L', 'R'):
        if f'eyeBlink_{side}' not in me.shape_keys.key_blocks:
            continue
        pivot = bpy.data.objects.get(cara.name + '_OjoPivote_' + side)
        globe = next((o for o in pivot.children_recursive if o.type == 'MESH' and 'Globo' in o.name), None) if pivot else None
        if globe is None:
            raise RuntimeError('Falta el globo existente para identificar el borde ' + side)
        center = np.asarray((inverse @ pivot.matrix_world.translation)[:])
        radius = max(np.linalg.norm(np.asarray((inverse @ globe.matrix_world @ v.co)[:]) - center) for v in globe.data.vertices)
        candidates = [loop for loop in loops if np.ptp(base[loop, 0]) < 3 * radius
                      and np.linalg.norm(base[loop].mean(0) - center) < 1.8 * radius]
        if len(candidates) != 1:
            raise RuntimeError(f'Borde {side} ambiguo: {len(candidates)} contornos; requiere revisión')
        loop = candidates[0]
        loop = np.roll(loop, -int(np.argmin(base[loop, 0])))
        end = int(np.argmax(base[loop, 0]))
        first, second = loop[:end + 1], np.r_[loop[end:], loop[0]]
        upper, lower = (first, second) if base[first, 2].mean() > base[second, 2].mean() else (second, first)
        corners = {int(loop[0]), int(loop[end])}
        borders['sup_' + side] = [int(v) for v in upper if v not in corners]
        borders['inf_' + side] = [int(v) for v in lower if v not in corners]
    return borders


def plan(cara, bordes_override=None, anclas_override=None, extensiones_override=None,
         extensiones_transversales_override=None, mascaras_override=None):
    """Calcula todo antes de escribir. Solo influye donde el cierre ya mueve piel."""
    if cara.mode != 'OBJECT':
        raise RuntimeError('Termina primero la edición de vértices de los párpados')
    sk = cara.data.shape_keys
    if not disponible(cara) or not sk.use_relative:
        raise RuntimeError('Primero crea los párpados del personaje')
    base = _co(sk.reference_key)
    raw = cara.get('rlb_borde_parpado')
    bordes = bordes_override if bordes_override is not None else (json.loads(raw) if isinstance(raw, str) and raw else dict(raw or {}))
    if not bordes:
        bordes = bordes_desde_superficie(cara)
    from . import mascaras_parpados as MP
    edges = np.empty(len(cara.data.edges) * 2, dtype=np.int32)
    cara.data.edges.foreach_get('vertices', edges)
    edges = edges.reshape(-1, 2)
    cara.data.calc_loop_triangles()
    tris = np.empty(len(cara.data.loop_triangles) * 3, dtype=np.int32)
    cara.data.loop_triangles.foreach_get('vertices', tris)
    tris = tris.reshape(-1, 3)
    shapes, anchors = {}, {}
    for s in ('L', 'R'):
        key = sk.key_blocks.get(f'eyeBlink_{s}')
        if key is None:
            continue
        if key.relative_key != sk.reference_key:
            raise RuntimeError('El cierre ocular debe ser relativo al Basis')
        delta = _co(key) - base
        anteriores = dict(anclas_override if anclas_override is not None else cara.get('aj_anclas', {}))
        previas = {(lab, i): int(anteriores[f'parpado_{lab}_{i}_{s}'])
                   for lab in ('sup', 'inf') for i in range(1, MAX_PUNTOS + 1)
                   if f'parpado_{lab}_{i}_{s}' in anteriores}
        opciones = {}
        if extensiones_override:
            opciones['extensiones'] = {(lab, i): float(extensiones_override.get(f'parpado_{lab}_{i}_{s}', 1.))
                                      for lab in ('sup', 'inf') for i in range(1, MAX_PUNTOS + 1)}
        if extensiones_transversales_override:
            opciones['extensiones_transversales'] = {(lab, i): float(extensiones_transversales_override.get(f'parpado_{lab}_{i}_{s}', 1.))
                                                    for lab in ('sup', 'inf') for i in range(1, MAX_PUNTOS + 1)}
        mascaras, elegidas, ancho = MP.calcular(base, edges, delta,
            {lab: bordes.get(f'{lab}_{s}', []) for lab in ('sup', 'inf')}, previas, tris, **opciones)
        for lab in ('sup', 'inf'):
            for i, a in enumerate(elegidas[lab], 1):
                punto = f'parpado_{lab}_{i}_{s}'
                anchors[punto] = a
                peso = mascaras[(lab, i)]
                if mascaras_override and punto in mascaras_override:
                    peso = np.asarray(mascaras_override[punto], dtype=float)
                    if peso.shape != (len(base),) or not np.isfinite(peso).all() or np.any(peso < 0.) or np.any(peso > 1.) or abs(peso[a] - 1.) > 1e-6:
                        raise RuntimeError(f'Los pesos manuales de {punto} deben estar entre 0 y 1 y conservar el ancla a 1')
                paso = .06 * ancho
                for d, eje in (('arriba', (0., 0., 1.)), ('derecha', (1., 0., 0.)), ('adelante', (0., -1., 0.))):
                    shapes[f'aj_{punto}_{d}'] = peso[:, None] * np.array(eje) * paso
    if not anchors:
        raise RuntimeError('El rig no contiene un cierre ocular con desplazamiento')
    return shapes, anchors


def _reglas(cara):
    raw = cara.get('rlb_parpados_reglas', '{}')
    return json.loads(raw) if isinstance(raw, str) else dict(raw)


def _helpers_plan(cara, shapes, anchors, ganancias=None, intensidades=None):
    """Calcula correctivas privadas y drivers sin escribir en la escena."""
    sk = cara.data.shape_keys; kb = sk.key_blocks; base = _co(sk.reference_key)
    reglas = _reglas(cara); resultado = {}
    for punto, a in anchors.items():
        s = punto[-1]; lab = punto.split('_')[1]
        prim = f'aj_{punto}_arriba'
        if prim not in shapes:
            continue
        nueva = float(np.linalg.norm(shapes[prim][a]))
        ganancia = float(ganancias[prim]) if ganancias and prim in ganancias else (float(np.linalg.norm((_co(kb[prim]) - base)[a])) if prim in kb else nueva)
        if ganancia < 0. or not np.isfinite(ganancia) or nueva <= 1e-12:
            raise RuntimeError(f'Ganancia inválida en {prim}')
        dprim = shapes[prim] * (ganancia / nueva)
        mask = np.linalg.norm(shapes[prim], axis=1) / nueva
        intensidad = float((intensidades or {}).get(punto, 1.))
        if not np.isfinite(intensidad) or not 0. <= intensidad <= 5.:
            raise RuntimeError(f'Intensidad inválida en {punto}')
        mask *= intensidad
        cierre = 'min(1,max(0,-v))' if lab == 'sup' else 'min(1,max(0,v))'
        b = 'min(1,max(0,b))'; w = 'min(1,max(0,w))'
        e = f'(1-(1-{b})*(1-{cierre}))'
        prop = f'["v_{prim}"]'
        def agregar(sufijo, delta, expresion, variables):
            nombre = f'apc_{punto}_{sufijo}'
            if len(nombre) > 63 or not np.isfinite(delta).all():
                raise RuntimeError('Correctiva palpebral inválida')
            if len(expresion.encode('utf8')) > 255:
                raise RuntimeError(f'La expresión del driver {nombre} excede el límite de Blender')
            compile(expresion, '<driver palpebral>', 'eval')
            resultado[nombre] = (delta, expresion, variables)
        # El punto conserva recorrido aun con el parpadeo principal al máximo.
        # Antes la compensación anulaba todo el descenso cuando b == 1.
        vars_comp = {'v': ('ctrl', prop), 'b': ('key', kb[f'eyeBlink_{s}'].path_from_id('value'))}
        agregar('comp', dprim if lab == 'sup' else -dprim, f'({cierre})*(1-({b}))', vars_comp)
        def fuente(nombre):
            k = kb.get(nombre)
            if k is None:
                return None
            if k.relative_key != sk.reference_key:
                raise RuntimeError(f'{nombre} no es relativa al Basis')
            return (_co(k) - base) * mask[:, None]
        variables = {'v': ('ctrl', prop), 'b': ('key', kb[f'eyeBlink_{s}'].path_from_id('value'))}
        agregar('blink', fuente(f'eyeBlink_{s}'), f'{e}-{b}', variables)
        mid = fuente(f'eyeBlink_mid_{s}')
        if mid is not None:
            hat = lambda x: f'max(0,min(2*({x}),2*(1-({x}))))'
            agregar('mid', mid, f'{hat(e)}-{hat(b)}', variables)
        wide = fuente(f'eyeWide_{s}')
        if wide is not None:
            vars_w = {'v': ('ctrl', prop), 'w': ('key', kb[f'eyeWide_{s}'].path_from_id('value'))}
            agregar('wide', -wide, f'{w}*({cierre})', vars_w)
        for nombre, regla in sorted(reglas.items()):
            if not re.fullmatch(r'eye(?:Blink|Wide)_safe_\d+_' + s, nombre):
                continue
            tipo = regla.get('tipo')
            if tipo == 'inactivo':
                continue
            if tipo not in ('blink_hat', 'wide_hat') or not 0 <= float(regla['a']) < float(regla['t']) < float(regla['b']) <= 1:
                raise RuntimeError(f'Regla palpebral inválida: {nombre}')
            delta = fuente(nombre)
            if delta is None:
                raise RuntimeError(f'Falta la correctiva {nombre}')
            x0, x1, x2 = (float(regla[k]) for k in ('a', 't', 'b'))
            def hat(x):
                return f'max(0,min((({x})-{x0:.12g})/{x1-x0:.12g},({x2:.12g}-({x}))/{x2-x1:.12g}))'
            if tipo == 'blink_hat':
                expresion = f'{hat(e)}-{hat(b)}'; variables_hat = variables
            else:
                expresion = f'{hat(f"{w}*(1-({cierre}))")}-{hat(w)}'
                variables_hat = {'v': ('ctrl', prop), 'w': ('key', kb[f'eyeWide_{s}'].path_from_id('value'))}
            agregar(('bs' if tipo == 'blink_hat' else 'ws') + nombre.split('_')[2], delta, expresion, variables_hat)
    # Al regenerar el cierre pueden desaparecer hats antiguos. Sus correctivas
    # locales tampoco deben seguir aportando la trayectoria anterior.
    for nombre in _registro(cara):
        if nombre not in resultado and _helper_valido(nombre):
            resultado[nombre] = (np.zeros_like(base), '0', {})
    return resultado


def _poner_driver(cara, nombre, expresion, variables):
    sk = cara.data.shape_keys; ctrl = BI.control(cara)
    d = sk.key_blocks[nombre].driver_add('value').driver
    d.type = 'SCRIPTED'
    while d.variables:
        d.variables.remove(d.variables[0])
    for n, (tipo, ruta) in variables.items():
        var = d.variables.new(); var.name = n; var.type = 'SINGLE_PROP'
        var.targets[0].id_type = 'OBJECT' if tipo == 'ctrl' else 'KEY'
        var.targets[0].id = ctrl if tipo == 'ctrl' else sk
        var.targets[0].data_path = ruta
    d.expression = expresion


def _registro(cara):
    raw = cara.get('aj_ojos_helpers', '{}')
    return json.loads(raw) if isinstance(raw, str) else dict(raw)


def _helper_valido(nombre):
    return any(re.fullmatch(r'apc_' + re.escape(p) + r'_(?:comp|blink|mid|wide|bs\d+|ws\d+)', nombre) for p in ZONAS)


def _verificar_propios(cara, helpers):
    sk = cara.data.shape_keys; ad = sk.animation_data
    drivers = {f.data_path: f.driver for f in ad.drivers} if ad else {}
    ctrl = BI.control(cara)
    for n, spec in helpers.items():
        if not _helper_valido(n) or n not in sk.key_blocks:
            raise RuntimeError('Registro de correctivas palpebrales inválido')
        key = sk.key_blocks[n]; driver = drivers.get(key.path_from_id('value'))
        if key.relative_key != sk.reference_key or driver is None or driver.type != 'SCRIPTED' or driver.expression != spec['expresion']:
            raise RuntimeError(f'El driver de {n} fue modificado')
        actuales = {v.name: ['ctrl' if v.targets[0].id == ctrl else 'key' if v.targets[0].id == sk else '', v.targets[0].data_path] for v in driver.variables if v.type == 'SINGLE_PROP'}
        if len(actuales) != len(driver.variables) or actuales != spec['variables']:
            raise RuntimeError(f'Las entradas del driver {n} fueron modificadas')


def _aplicar_helpers(cara, plan_helpers):
    kb = cara.data.shape_keys.key_blocks; registro = _registro(cara)
    for nombre in plan_helpers:
        if nombre in kb and nombre not in registro:
            raise RuntimeError(f'Existe una key ajena con el nombre {nombre}')
        if nombre in kb and kb[nombre].relative_key != cara.data.shape_keys.reference_key:
            raise RuntimeError(f'{nombre} no es relativa al Basis')
    for nombre, (delta, expresion, variables) in plan_helpers.items():
        if nombre not in kb:
            poner_key(cara, nombre, delta, 0., (-1., 1.))
        else:
            kb[nombre].data.foreach_set('co', (_co(cara.data.shape_keys.reference_key) + delta).reshape(-1))
        _poner_driver(cara, nombre, expresion, variables)
        registro[nombre] = {'expresion': expresion, 'variables': variables}
    cara['aj_ojos_helpers'] = json.dumps(registro, sort_keys=True)


def _preparar_seguimiento(cara, refrescar=False):
    from . import seguimiento_parpados as SP
    try:
        if SP.ESTADO in cara:
            if not refrescar or SP.detectar(cara, verificar_firma=True)['cambio']:
                return
        SP.preparar(cara)
    except (RuntimeError, ValueError, KeyError) as exc:
        cara[SP.AVISO] = 'No se preparó el seguimiento: ' + str(exc)


def asegurar(cara):
    """Añade solo los ajustes que faltan, conservando las keys y valores previos."""
    ctrl = BI.control(cara)
    if ctrl is None or not disponible(cara):
        return []
    kb = cara.data.shape_keys.key_blocks
    presentes = set(cara.get('aj_anclas', {}).keys()) & set(ZONAS)
    lados = {s for s in ('L', 'R') if f'eyeBlink_{s}' in kb}
    anclas_prev = cara.get('aj_anclas', {})
    esperados = {p for p in ZONAS if p[-1] in lados and int(p.split('_')[2]) <= npuntos(anclas_prev, p.split('_')[1], p[-1])}
    if esperados <= presentes and all(f'aj_{p}_{d}' in kb for p in esperados for d in DIRECCIONES):
        _preparar_seguimiento(cara)
        return []
    shapes, anchors = plan(cara)
    if not cara.get('rlb_borde_parpado'):
        cara['rlb_borde_parpado'] = json.dumps(bordes_desde_superficie(cara))
    nuevo = not any(n in kb for n in shapes)
    helpers = _helpers_plan(cara, shapes, anchors) if nuevo else {}
    hechas = []
    for name, delta in shapes.items():
        if name not in kb:
            poner_key(cara, name, delta, 0., (-1., 1.))
            hechas.append(name)
        prop = 'v_' + name
        if prop not in ctrl:
            ctrl[prop] = 0.
        ctrl.id_properties_ui(prop).update(min=-1., max=1., soft_min=-1., soft_max=1.)
        path = kb[name].path_from_id('value')
        ad = cara.data.shape_keys.animation_data
        if not ad or not any(f.data_path == path for f in ad.drivers):
            dr = kb[name].driver_add('value').driver
            dr.type = 'SCRIPTED'
            var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
            var.targets[0].id_type = 'OBJECT'; var.targets[0].id = ctrl
            var.targets[0].data_path = f'["{prop}"]'
            dr.expression = 'v'
    anclas = dict(cara.get('aj_anclas', {}))
    for punto, ancla in anchors.items():
        anclas.setdefault(punto, ancla)
    cara['aj_anclas'] = anclas
    if len(hechas) == len(shapes):
        _aplicar_helpers(cara, helpers)
        cara['aj_ojos_version'] = VERSION
    _preparar_seguimiento(cara)
    ctrl.update_tag()
    return hechas


def respaldar(cara, ruta=None):
    """Guarda exclusivamente las coordenadas de ajustes oculares existentes."""
    from pathlib import Path
    from datetime import datetime, timezone
    from uuid import uuid4
    from .mascaras_labios import _firma_malla
    nombres = sorted(k.name for k in cara.data.shape_keys.key_blocks if k.name in NOMBRES)
    if not nombres:
        raise RuntimeError('No hay ajustes palpebrales para respaldar')
    if ruta is None:
        base = Path(bpy.data.filepath).parent if bpy.data.filepath else Path(bpy.app.tempdir)
        seguro = re.sub(r'[<>:"/\\|?*]', '_', cara.name).strip().rstrip('.') or 'cara'
        ruta = base / 'RLB_revision' / seguro / 'mascaras_parpados' / (datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_') + uuid4().hex[:8] + '.npz')
    ruta = Path(ruta); ruta.parent.mkdir(parents=True, exist_ok=True)
    coords = np.asarray([_co(cara.data.shape_keys.key_blocks[n]).reshape(-1) for n in nombres])
    anclas = {k: int(v) for k, v in dict(cara.get('aj_anclas', {})).items() if k in ZONAS}
    helpers = _registro(cara)
    if any(not _helper_valido(n) or n not in cara.data.shape_keys.key_blocks for n in helpers):
        raise RuntimeError('Registro de correctivas palpebrales inválido')
    _verificar_propios(cara, helpers)
    hcoords = np.asarray([_co(cara.data.shape_keys.key_blocks[n]).reshape(-1) for n in helpers])
    if not helpers:
        hcoords = np.empty((0, len(cara.data.vertices) * 3))
    with ruta.open('xb') as f:
        np.savez_compressed(f, nombres=np.asarray(nombres), coords=coords, cara=np.asarray(cara.name),
                            firma=np.asarray(_firma_malla(cara)), anclas=np.asarray(json.dumps(anclas)),
                            version=np.asarray(int(cara.get('aj_ojos_version', 0))),
                            helpers=np.asarray(json.dumps(helpers)), hcoords=hcoords,
                            pesos_config=np.asarray(cara.get('rlb_pesos_parpados', '')))
    cara['aj_respaldo_mascaras_parpados'] = str(ruta)
    return {'archivo': str(ruta), 'keys': len(nombres)}


def restaurar(cara, ruta=None):
    """Restaura solo coordenadas y anclas oculares tras validar el respaldo completo."""
    from .mascaras_labios import _firma_malla
    ruta = ruta or cara.get('aj_respaldo_mascaras_parpados')
    if not ruta:
        raise RuntimeError('No hay respaldo de máscaras palpebrales')
    with np.load(ruta, allow_pickle=False) as d:
        nombres, coords = d['nombres'].tolist(), d['coords']
        anclas = json.loads(str(d['anclas'])); version = int(d['version'])
        helpers = json.loads(str(d['helpers'])) if 'helpers' in d else {}
        pesos_config = str(d['pesos_config']) if 'pesos_config' in d else ''
        if pesos_config:
            if not isinstance(json.loads(pesos_config), dict):
                raise RuntimeError('Configuración palpebral del respaldo inválida')
        hcoords = d['hcoords'] if 'hcoords' in d else np.empty((0, len(cara.data.vertices) * 3))
        actuales_helpers = _registro(cara)
        _verificar_propios(cara, actuales_helpers)
        kb = cara.data.shape_keys.key_blocks
        if str(d['cara']) != cara.name or str(d['firma']) != _firma_malla(cara):
            raise RuntimeError('El respaldo no corresponde al objeto o su malla')
        if len(set(nombres)) != len(nombres) or any(n not in NOMBRES or n not in kb or kb[n].relative_key != cara.data.shape_keys.reference_key for n in nombres) or coords.shape != (len(nombres), len(cara.data.vertices) * 3) or not np.isfinite(coords).all() or any(k not in ZONAS or not 0 <= int(v) < len(cara.data.vertices) for k, v in anclas.items()):
            raise RuntimeError('Respaldo palpebral inválido')
        if (any(not _helper_valido(n) for n in set(helpers) | set(actuales_helpers)) or
                hcoords.shape != (len(helpers), len(cara.data.vertices) * 3) or not np.isfinite(hcoords).all() or
                any(n in kb and n not in actuales_helpers for n in helpers) or
                any(n not in kb or kb[n].relative_key != cara.data.shape_keys.reference_key for n in actuales_helpers) or
                any(not isinstance(spec, dict) or not isinstance(spec.get('expresion'), str) or
                    not isinstance(spec.get('variables'), dict) or
                    any(not isinstance(v, (list, tuple)) or len(v) != 2 or v[0] not in ('key', 'ctrl') for v in spec['variables'].values())
                    for spec in helpers.values())):
            raise RuntimeError('Respaldo de correctivas palpebrales inválido')
        for n, co in zip(nombres, coords):
            kb[n].data.foreach_set('co', co)
        for n in set(actuales_helpers) - set(helpers):
            cara.shape_key_remove(kb[n])
        for (n, spec), co in zip(helpers.items(), hcoords):
            if n not in kb:
                base = _co(cara.data.shape_keys.reference_key)
                poner_key(cara, n, co.reshape(-1, 3) - base, 0., (-1., 1.))
            else:
                kb[n].data.foreach_set('co', co)
            _poner_driver(cara, n, spec['expresion'], spec['variables'])
    cara['aj_ojos_helpers'] = json.dumps(helpers, sort_keys=True)
    if pesos_config:
        cara['rlb_pesos_parpados'] = pesos_config
    elif 'rlb_pesos_parpados' in cara:
        del cara['rlb_pesos_parpados']
    actuales = {k: int(v) for k, v in dict(cara.get('aj_anclas', {})).items() if k not in ZONAS}
    cara['aj_anclas'] = dict(actuales, **anclas); cara['aj_ojos_version'] = version
    cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})
    return {'restauradas': len(nombres), 'valores_expresion_conservados': True}


def actualizar(cara, aplicar=False, bordes_override=None, anclas_override=None, ganancias_override=None,
               extensiones_override=None, extensiones_transversales_override=None,
               mascaras_override=None, intensidades_override=None):
    """Previsualiza o regenera únicamente las keys de los puntos oculares existentes."""
    from . import pesos_parpados as PP
    opciones = PP.leer_opciones(cara, permitir_topologia=anclas_override is not None)
    if extensiones_override is None:
        extensiones_override = opciones.get('longitudinal')
    if extensiones_transversales_override is None:
        extensiones_transversales_override = opciones.get('transversal')
    if mascaras_override is None:
        mascaras_override = opciones.get('mascaras')
    if ganancias_override is None:
        ganancias_override = opciones.get('ganancias')
    if intensidades_override is None:
        intensidades_override = opciones.get('intensidades')
    shapes, anchors = plan(cara, bordes_override, anclas_override, extensiones_override,
                          extensiones_transversales_override, mascaras_override)
    kb = cara.data.shape_keys.key_blocks
    base = _co(cara.data.shape_keys.reference_key)
    anteriores = dict(anclas_override if anclas_override is not None else cara.get('aj_anclas', {})); cambios = []; informe = []
    for nombre, delta in shapes.items():
        if nombre not in kb:
            continue
        if kb[nombre].relative_key != cara.data.shape_keys.reference_key:
            raise RuntimeError(f'{nombre} no es relativa al Basis')
        punto = nombre[3:].rsplit('_', 1)[0]
        a = int(anteriores.get(punto, anchors[punto]))
        if not 0 <= a < len(base) or a != anchors[punto]:
            raise RuntimeError(f'El ancla anterior de {punto} ya no es válida')
        viejo = _co(kb[nombre]) - base
        ganancia = float(ganancias_override[nombre]) if ganancias_override and nombre in ganancias_override else float(np.linalg.norm(viejo[a]))
        nueva = float(np.linalg.norm(delta[a]))
        if ganancia < 0. or not np.isfinite(ganancia) or nueva <= 1e-12:
            raise RuntimeError(f'Ganancia inválida en el ancla de {nombre}')
        delta = delta * (ganancia / nueva)
        co = base + delta
        if not np.isfinite(co).all():
            raise RuntimeError(f'Máscara inválida para {nombre}')
        tolerancia = max(ganancia * 1e-6, float(np.max(np.abs(base))) * np.finfo(np.float32).eps * 2, 1e-12)
        if np.max(np.abs(co - (base + viejo))) <= tolerancia:
            continue
        cambios.append((nombre, co.reshape(-1)))
        informe.append({'key': nombre, 'valor': float(kb[nombre].value), 'ancla': a,
                        'vertices_antes': int(np.count_nonzero(np.linalg.norm(viejo, axis=1) > 1e-9)),
                        'vertices_despues': int(np.count_nonzero(np.linalg.norm(delta, axis=1) > 1e-9))})
    helpers = _helpers_plan(cara, shapes, anchors, ganancias_override, intensidades_override)
    registro = _registro(cara)
    _verificar_propios(cara, registro)
    for n in helpers:
        if n in kb and (n not in registro or kb[n].relative_key != cara.data.shape_keys.reference_key):
            raise RuntimeError(f'La correctiva {n} no pertenece al complemento o no es relativa al Basis')
    helper_cambios = []
    for n, (delta, expr, variables) in helpers.items():
        spec = {'expresion': expr, 'variables': {k: list(v) for k, v in variables.items()}}
        if n not in kb or registro.get(n) != spec:
            helper_cambios.append(n); continue
        co = base + delta
        tol = max(float(np.max(np.abs(base))) * np.finfo(np.float32).eps * 2, 1e-12)
        if np.max(np.abs(_co(kb[n]) - co)) > tol:
            helper_cambios.append(n)
    if aplicar:
        nombres_antes = set(kb.keys())
        coords_antes = {n: _co(kb[n]) for n in set(n for n, _ in cambios) | set(helper_cambios) if n in kb}
        campos = ('aj_ojos_helpers', 'aj_ojos_version', 'rlb_seguimiento_parpados', 'rlb_seguimiento_aviso')
        meta_antes = {k: cara[k] for k in campos if k in cara}
        try:
            for nombre, co in cambios:
                kb[nombre].data.foreach_set('co', co)
            if helper_cambios:
                _aplicar_helpers(cara, helpers)
            if (cambios or helper_cambios) and all(n in kb for n in shapes):
                cara['aj_ojos_version'] = VERSION
            cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})
            if cambios or helper_cambios:
                _preparar_seguimiento(cara, refrescar=True)
        except Exception:
            for n in set(kb.keys()) - nombres_antes:
                if _helper_valido(n):
                    cara.shape_key_remove(kb[n])
            for n, co in coords_antes.items():
                kb[n].data.foreach_set('co', co.reshape(-1))
            for n, spec in registro.items():
                _poner_driver(cara, n, spec['expresion'], spec['variables'])
            for k in campos:
                if k in meta_antes:
                    cara[k] = meta_antes[k]
                elif k in cara:
                    del cara[k]
            cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})
            raise
    return {'keys': len(cambios) + len(helper_cambios), 'aplicado': bool(aplicar), 'por_key': informe,
            'correctivas': len(helper_cambios)}


def regenerar(cara, aplicar=False):
    return actualizar(cara, aplicar=aplicar)


def nombre_basal(expr, parte, lado):
    return 'ob_' + parte + '_' + lado + '_'


def es_basal(nombre):
    return nombre.startswith(('ob_sup_', 'ob_inf_'))


def basal_de(nombre, expr):
    return es_basal(nombre) and nombre.split('_', 4)[-1] == re.sub(r'[^0-9A-Za-z]+', '_', expr).strip('_')


def _mascaras_basales(cara):
    """Transición sobre la piel palpebral, independiente de la sonrisa y de Tom."""
    shapes, _ = plan(cara)
    escala = max(float(np.max(np.abs(d[:, 2]))) for n, d in shapes.items() if n.endswith('_arriba'))
    if escala <= 1e-12: raise RuntimeError('Falta una máscara palpebral válida')
    resultado = {}
    for parte in ('sup', 'inf'):
        for lado in ('L', 'R'):
            w = np.clip(sum(shapes[f'aj_parpado_{parte}_{i}_{lado}_arriba'][:, 2]
                            for i in range(1, MAX_PUNTOS + 1) if f'aj_parpado_{parte}_{i}_{lado}_arriba' in shapes) / escala, 0., 1.)
            resultado[parte, lado] = w*w*(3.-2.*w)
    return resultado


def suavizar_basales(cara, aplicar=False):
    """Migra correcciones antiguas explícitamente, sin cambiar canales ni drivers."""
    from pathlib import Path
    from uuid import uuid4
    from . import regenerar_cierre_parpados as RC
    if cara.mode != 'OBJECT': raise RuntimeError('Termina la edición de vértices')
    kb = cara.data.shape_keys.key_blocks
    hechos = set(json.loads(cara.get('rlb_basales_suaves', '[]')))
    nombres = [k.name for k in kb if es_basal(k.name) and k.name not in hechos]
    if not nombres: return {'keys': [], 'aplicado': False}
    mascaras = _mascaras_basales(cara); base = _co(kb[0])
    previos = {n: _co(kb[n]) for n in nombres}
    nuevos = {}
    for n in nombres:
        _, parte, lado, *_ = n.split('_')
        if kb[n].relative_key != kb[0]: raise RuntimeError('Basal no relativa al Basis: '+n)
        nuevos[n] = base+(previos[n]-base)*mascaras[parte,lado][:,None]
    if not aplicar: return {'keys': nombres, 'aplicado': False}
    carpeta = Path(bpy.data.filepath).parent/'RLB_revision'/(re.sub(r'[<>:"/\\|?*]', '_', cara.name).strip().rstrip('.') or 'cara')/'basales'
    carpeta.mkdir(parents=True, exist_ok=True)
    archivo = carpeta/(uuid4().hex+'.npz')
    np.savez_compressed(archivo, metadata=np.asarray(json.dumps({'firma':RC.firma(cara),'cara':cara.name})), **previos)
    try:
        for n, co in nuevos.items(): kb[n].data.foreach_set('co', co.ravel())
        cara['rlb_basales_suaves'] = json.dumps(sorted(hechos|set(nombres)))
        cara['rlb_respaldo_basales'] = str(archivo)
    except Exception:
        for n, co in previos.items(): kb[n].data.foreach_set('co', co.ravel())
        raise
    cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})
    return {'keys': nombres, 'aplicado': True, 'respaldo': str(archivo)}


def basal(cara, expr, parte, lados, intensidad=1.):
    """Retoque aditivo de ESTA expresión: resta la mezcla visible en ese párpado.

    Se usa la región explícita del cierre instalado, sin cambiar Basis ni controles
    globales, de modo que el párpado opuesto conserva su expresión.
    """
    from . import retoque_parpados as RP
    if cara.mode != 'OBJECT':
        raise RuntimeError('Termina primero la edición de vértices')
    ctrl = BI.control(cara)
    base = _co(cara.data.shape_keys.reference_key)
    mascaras = _mascaras_basales(cara)
    pendientes = []
    for s in lados:
        peso = mascaras[parte, s]
        if not peso.any():
            raise RuntimeError(f'No hay región de párpado {parte} {s}')
        # Cada clic conserva su correctiva anterior para que Deshacer restaure
        # también un basal previo sin sobrescribir coordenadas de otra operación.
        serial = str(len(cara.data.shape_keys.key_blocks))
        n = nombre_basal(expr, parte, s) + serial + '_' + re.sub(r'[^0-9A-Za-z]+', '_', expr).strip('_')
        mezcla = RP._mezcla(cara, n)
        delta = np.zeros_like(base)
        if intensidad > 1e-8:
            delta = (base - mezcla) * peso[:, None] / intensidad
        pendientes.append((n, delta))
    for n, delta in pendientes:
        poner_key(cara, n, delta)
        RP._conectar(cara, ctrl, n)
        ctrl['v_' + n] = 1.
    hechos = set(json.loads(cara.get('rlb_basales_suaves', '[]')))
    cara['rlb_basales_suaves'] = json.dumps(sorted(hechos|{n for n, _ in pendientes}))
    ctrl.update_tag()
    return [n for n, _ in pendientes]


def piezas_vinculadas(cara):
    """Piezas externas que siguen este rig mediante padres, restricciones o drivers."""
    raiz = {cara, BI.control(cara), bpy.data.objects.get(cara.name + '_Rig_Labios'),
            bpy.data.objects.get(cara.name + '_Control_Parpados'), cara.data.shape_keys}
    raiz.discard(None)
    vinculadas = set()
    pendientes = True
    while pendientes:
        pendientes = False
        for ob in bpy.context.scene.objects:
            if ob in raiz or ob in vinculadas:
                continue
            targets = {ob.parent} | {getattr(c, 'target', None) for c in ob.constraints}
            if ob.animation_data:
                targets.update(t.id for f in ob.animation_data.drivers for v in f.driver.variables for t in v.targets)
            if targets & (raiz | vinculadas):
                vinculadas.add(ob); pendientes = True
    return vinculadas
