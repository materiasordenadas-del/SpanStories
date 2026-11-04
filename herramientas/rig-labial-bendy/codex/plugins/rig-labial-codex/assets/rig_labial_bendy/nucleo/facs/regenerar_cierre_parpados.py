"""Plan aislado para cierre: no instala controles ni modifica el Basis.

Las operaciones son deliberadamente conservadoras: se rechazan drivers que
no sean exactamente los propios del generador antes de tocar cualquier dato.
"""
import hashlib
import json
import re
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import bpy
import numpy as np

from . import ajustes_ojos as AO
from . import parpados_aislados as PA

PRINCIPALES = {f'{n}_{s}' for s in ('L', 'R') for n in ('eyeBlink', 'eyeBlink_mid', 'eyeWide')}
PATRON = re.compile(r'eye(?:Blink|Wide)_safe_\d+_[LR]$')
TENSION = {f'{n}_{s}' for n in ('eyeSquint','eyeBlink_eyeSquint') for s in ('L','R')}
CAMPOS = ('rlb_parpados_generadas', 'rlb_parpados_reglas', 'aj_ojos_helpers',
          'aj_ojos_version', 'rlb_seguimiento_parpados', 'rlb_seguimiento_aviso',
          'rlb_pesos_parpados', 'aj_anclas', 'rlb_parpados_parametros', 'rlb_respaldo_cierre_parpados',
          'rlb_parpados_proporcion_medida', 'rlb_tension_parpados')
ATRIBUTOS = ('rlb_id_vertice_persistente', 'rlb_id_cara_persistente', 'rlb_isla_uv_persistente')


def firma(cara):
    """Firma Basis y conectividad ordenada, incluidos límites de polígonos."""
    me = cara.data
    h = hashlib.sha256()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.shape_keys.reference_key.data.foreach_get('co', co)
    h.update(co.tobytes())
    for seq, attr in ((me.edges, 'vertices'), (me.loops, 'vertex_index'),
                      (me.polygons, 'loop_start'), (me.polygons, 'loop_total')):
        width = 2 if attr == 'vertices' else 1
        arr = np.empty(len(seq) * width, dtype=np.int32)
        seq.foreach_get(attr, arr)
        h.update(np.asarray([len(seq)], dtype=np.int64).tobytes()); h.update(arr.tobytes())
    return h.hexdigest()


def calcular(cara, parametros_override=None, tension=False):
    semillas = list(cara.get('rlb_parpados_uv_seeds', []))
    if not semillas:
        raise RuntimeError('Esta cara no tiene el cierre por superficie UV (no hay semillas de párpado). '
                           'Genera primero los párpados aislados (paso de párpados con piel UV); '
                           '«Recalcular cierre» solo actualiza uno ya generado')
    params = json.loads(cara.get('rlb_parpados_parametros', '{}'))
    if parametros_override is not None:
        if set(parametros_override) - {'aporte_superior'}:
            raise RuntimeError('Este ajuste solo modifica la proporción de parpadeo')
        params.update(parametros_override)
    params.setdefault('contacto_extremos', True)
    antes = firma(cara)
    K, keys, info = PA.calcular(cara, semillas, params)
    if firma(cara) != antes:
        raise RuntimeError('La malla cambió durante el cálculo')
    K.firma_cierre = antes
    K.parametros_cierre = params
    if tension or cara.get('rlb_tension_parpados'):
        from . import tension_parpados as TP
        K.plan_tension=TP.calcular(cara,mainkeys_override=keys,maininfo_override=info,param_override=params)
    return K, keys, info


def _reglas(info):
    return {n: r for s in ('L', 'R') for n, r in info[s].get('reglas', {}).items()}


def _expresion(n, reglas):
    c, op = 'max(0,v)', 'max(0,-v/.2)'
    if n in reglas:
        r = reglas[n]
        if r['tipo'] == 'inactivo': return '0'
        if r['tipo'] not in ('blink_hat', 'wide_hat') or not 0 <= r['a'] < r['t'] < r['b'] <= 1:
            raise RuntimeError('Regla inválida: ' + n)
        v = op if r['tipo'] == 'wide_hat' else c
        return f"max(0,min((({v})-{r['a']})/{r['t']-r['a']},({r['b']}-({v}))/{r['b']-r['t']}))"
    if n.startswith('eyeBlink_mid'): return f'max(0,min(2*({c}),2*(1-({c}))))'
    if n.startswith('eyeBlink'): return c
    return op


def _drivers(idblock):
    return {f.data_path: f for f in idblock.animation_data.drivers} if idblock.animation_data else {}


def _verificar(cara, managed, reglas):
    sk = cara.data.shape_keys; kb = sk.key_blocks
    ctrl = bpy.data.objects.get(cara.name + '_Control_Parpados')
    if ctrl is None: raise RuntimeError('Falta el controlador palpebral existente')
    if not PRINCIPALES <= managed: raise RuntimeError('Keys principales no están administradas')
    ds = _drivers(sk)
    for n in managed:
        if n not in PRINCIPALES and not PATRON.fullmatch(n): raise RuntimeError('Nombre administrado desconocido: ' + n)
        k = kb.get(n)
        if k is None or k.relative_key != sk.reference_key: raise RuntimeError('Key administrada ausente o no relativa: ' + n)
        f = ds.get(k.path_from_id('value'))
        if f is None or len(f.modifiers) or f.driver.type != 'SCRIPTED' or f.driver.expression != _expresion(n, reglas):
            raise RuntimeError('Driver palpebral modificado: ' + n)
        vs = list(f.driver.variables)
        if len(vs) != 1 or vs[0].name != 'v' or vs[0].type != 'SINGLE_PROP' or vs[0].targets[0].id != ctrl or vs[0].targets[0].data_path != f'["_rlb_efectivo_{n[-1]}"]':
            raise RuntimeError('Variables palpebrales modificadas: ' + n)
    expected = 'min(1,max(0,b))-.2*min(1,max(0,a))*(1-min(1,max(0,b)))'
    for s in ('L', 'R'):
        f = _drivers(ctrl).get(f'["_rlb_efectivo_{s}"]')
        if f is None or len(f.modifiers) or f.driver.type != 'SCRIPTED' or f.driver.expression != expected:
            raise RuntimeError('Driver efectivo modificado: ' + s)
        actual = {v.name: (v.type, v.targets[0].id, v.targets[0].data_path) for v in f.driver.variables}
        if actual != {'b': ('SINGLE_PROP', ctrl, f'["parpadeo_{s}"]'), 'a': ('SINGLE_PROP', ctrl, f'["apertura_{s}"]')}:
            raise RuntimeError('Variables del driver efectivo modificadas: ' + s)
    AO._verificar_propios(cara, AO._registro(cara))
    return ctrl


def _snapshot_driver(f):
    if f is None: return None
    if len(f.modifiers) or f.driver.type != 'SCRIPTED': raise RuntimeError('Driver no restaurable')
    variables = []
    for v in f.driver.variables:
        if v.type not in ('SINGLE_PROP','TRANSFORMS'): raise RuntimeError('Variable no restaurable')
        t = v.targets[0]; spec=(v.name, t.id_type, t.id, t.data_path)
        if v.type=='TRANSFORMS':
            spec+=({'tipo':v.type,'bone_target':t.bone_target,'transform_type':t.transform_type,
                    'transform_space':t.transform_space,'rotation_mode':t.rotation_mode},)
        variables.append(spec)
    return (f.driver.expression, variables, f.mute)


def _set_driver(key, spec, data_path='value'):
    path = key.path_from_id(data_path)
    existing = _drivers(key.id_data).get(path)
    if spec is None:
        if existing is not None: key.driver_remove(data_path)
        return
    exp, variables, mute = spec
    f = existing if existing is not None else key.driver_add(data_path)
    d = f.driver; d.type = 'SCRIPTED'
    while d.variables: d.variables.remove(d.variables[0])
    for variable in variables:
        name,id_type,target,path=variable[:4];extra=variable[4] if len(variable)>4 else {}
        v = d.variables.new(); v.name = name; v.type = extra.get('tipo','SINGLE_PROP')
        if v.type=='SINGLE_PROP':
            v.targets[0].id_type=id_type;v.targets[0].data_path=path
        elif id_type!='OBJECT':
            raise RuntimeError('Destino de transformación incompatible')
        v.targets[0].id=target
        for campo in ('bone_target','transform_type','transform_space','rotation_mode'):
            if campo in extra:setattr(v.targets[0],campo,extra[campo])
    d.expression = exp; f.mute = mute


def _meta(cara):
    result = {}
    for n in CAMPOS:
        if n in cara:
            v = cara[n]; result[n] = v.to_dict() if hasattr(v, 'to_dict') else v
    return result


def _snap(cara, nombres):
    sk = cara.data.shape_keys; ds = _drivers(sk); kb = sk.key_blocks
    coords = {n: AO._co(kb[n]).copy() for n in nombres if n in kb}
    drivers = {n: _snapshot_driver(ds.get(kb[n].path_from_id('value'))) for n in coords}
    attrs = {}
    for n in ATRIBUTOS:
        a = cara.data.attributes.get(n)
        if a is not None:
            if a.data_type != 'INT': raise RuntimeError('Atributo de seguimiento incompatible: ' + n)
            vals = np.empty(len(a.data), dtype=np.int32); a.data.foreach_get('value', vals)
            attrs[n] = (a.domain, vals)
    ctrl=bpy.data.objects.get(cara.name+'_Control_Parpados')
    control_drivers={ruta:_snapshot_driver(_drivers(ctrl).get(ruta)) for ruta in
                     ('["parpadeo_L"]','["parpadeo_R"]')} if ctrl else {}
    return {'firma': firma(cara), 'coords': coords, 'drivers': drivers, 'meta': _meta(cara),
            'control_drivers':control_drivers,
            'keys_antes': set(kb.keys()), 'attrs': attrs}


def _restaurar(cara, snap):
    if firma(cara) != snap['firma']: raise RuntimeError('No se puede restaurar: Basis o topología cambiaron')
    ctrl=bpy.data.objects.get(cara.name+'_Control_Parpados')
    if snap.get('control_drivers') and ctrl is None:raise RuntimeError('Falta el controlador del respaldo')
    kb = cara.data.shape_keys.key_blocks
    for n in set(kb.keys()) - snap['keys_antes']:
        if n in PRINCIPALES or n in TENSION or PATRON.fullmatch(n) or AO._helper_valido(n): cara.shape_key_remove(kb[n])
        else: raise RuntimeError('Nueva key ajena durante la transacción: ' + n)
    for n, co in snap['coords'].items():
        if n not in kb: raise RuntimeError('Falta una key para restaurar: ' + n)
        kb[n].data.foreach_set('co', co.reshape(-1)); _set_driver(kb[n], snap['drivers'][n])
    for n in CAMPOS:
        if n in snap['meta']: cara[n] = snap['meta'][n]
        elif n in cara: del cara[n]
    for n in ATRIBUTOS:
        a = cara.data.attributes.get(n)
        if n not in snap['attrs']:
            if a is not None: cara.data.attributes.remove(a)
        else:
            domain, values = snap['attrs'][n]
            if a is None: a = cara.data.attributes.new(n, 'INT', domain)
            if a.domain != domain or a.data_type != 'INT' or len(a.data) != len(values):
                raise RuntimeError('Atributo de seguimiento no restaurable: ' + n)
            a.data.foreach_set('value', values)
    for ruta,spec in snap.get('control_drivers',{}).items():_set_driver(ctrl,spec,data_path=ruta)
    cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})


def guardar_respaldo(cara, snap, ruta=None):
    """Guarda coords, configuración y drivers selectivos sin sobrescribir archivos."""
    if ruta is None:
        root = Path(bpy.data.filepath).parent if bpy.data.filepath else Path(bpy.app.tempdir)
        ruta = root / 'RLB_revision' / (re.sub(r'[<>:"/\\|?*]', '_', cara.name).strip().rstrip('.') or 'cara') / 'cierre_parpados' / (uuid4().hex + '.npz')
    ruta = Path(ruta); ruta.parent.mkdir(parents=True, exist_ok=True)
    names = sorted(snap['coords'])
    drivers = {}
    todos=dict(snap['drivers']);todos.update({'control:'+n:spec for n,spec in snap.get('control_drivers',{}).items()})
    for n, spec in todos.items():
        if spec is None: drivers[n] = None; continue
        exp, variables, mute = spec
        drivers[n] = [exp, [[v[0],v[1],v[2].name_full if v[2] else None,v[3]]+([v[4]] if len(v)>4 else [])
                            for v in variables], bool(mute)]
    attrs = {n: [domain, values.tolist()] for n, (domain, values) in snap['attrs'].items()}
    metadata = {'cara': cara.name_full, 'firma': snap['firma'], 'nombres': names,
                'drivers': drivers, 'meta': snap['meta'], 'keys_antes': sorted(snap['keys_antes']), 'attrs': attrs}
    arrays = np.asarray([snap['coords'][n] for n in names])
    with ruta.open('xb') as stream:
        np.savez_compressed(stream, metadata=np.asarray(json.dumps(metadata)), coords=arrays)
    return str(ruta)


def cargar_respaldo(cara, ruta):
    with np.load(ruta, allow_pickle=False) as saved:
        data = json.loads(str(saved['metadata'])); coords = np.array(saved['coords'])
    if data['cara'] != cara.name_full or data['firma'] != firma(cara):
        raise RuntimeError('El respaldo no corresponde al objeto y malla actuales')
    names = data['nombres']
    if len(names) != len(set(names)) or coords.shape != (len(names), len(cara.data.vertices), 3) or not np.isfinite(coords).all():
        raise RuntimeError('Coordenadas del respaldo inválidas')
    drivers = {}
    for n, spec in data['drivers'].items():
        if spec is None: drivers[n] = None; continue
        exp, variables, mute = spec; loaded = []
        for variable in variables:
            name,typ,target_name,path=variable[:4]
            collection = {'OBJECT': bpy.data.objects, 'KEY': bpy.data.shape_keys}.get(typ)
            if collection is None or (target_name is not None and collection.get(target_name) is None):
                raise RuntimeError('Destino de driver del respaldo no disponible')
            loaded.append((name, typ, collection.get(target_name) if target_name else None, path)+
                          ((variable[4],) if len(variable)>4 else ()))
        drivers[n] = (exp, loaded, mute)
    controles={n[8:]:spec for n,spec in drivers.items() if n.startswith('control:')}
    drivers={n:spec for n,spec in drivers.items() if not n.startswith('control:')}
    if set(drivers) != set(names): raise RuntimeError('Drivers incompletos en respaldo')
    return {'firma': data['firma'], 'coords': dict(zip(names, coords)), 'drivers': drivers,
            'meta': data['meta'], 'keys_antes': set(data['keys_antes']), 'control_drivers':controles,
            'attrs': {n: (value[0], np.asarray(value[1], dtype=np.int32)) for n, value in data['attrs'].items()}}


def aplicar_plan(cara, K, keys, info, ruta_respaldo=None):
    """Aplica únicamente un plan validado con su firma; revierte al fallar."""
    if not getattr(K, 'firma_cierre', None) or K.firma_cierre != firma(cara):
        raise RuntimeError('Firma del plan ausente o incompatible')
    sk = cara.data.shape_keys; kb = sk.key_blocks; base = AO._co(sk.reference_key)
    if not np.array_equal(np.asarray(K.P, dtype=np.float32), base.astype(np.float32)):
        raise RuntimeError('Basis del plan incompatible')
    managed = set(json.loads(cara.get('rlb_parpados_generadas', '[]')))
    old_rules = json.loads(cara.get('rlb_parpados_reglas', '{}'))
    ctrl = _verificar(cara, managed, old_rules)
    if not PRINCIPALES <= set(keys): raise RuntimeError('Plan sin las seis keys principales')
    rules = _reglas(info)
    for s in ('L', 'R'):
        report = info[s]
        if report.get('validacion', {}).get('poses') != 325 or report['validacion'].get('fallos'):
            raise RuntimeError('Plan sin validación de trayectoria: ' + s)
        if report.get('combinaciones_ambos_ojos') != 36 or report.get('miradas', {}).get('fallos') != 0:
            raise RuntimeError('Plan sin validación de miradas: ' + s)
        views = report.get('cierre_visible', {})
        if any(views.get(str(a), {}).get('muestras_reposo', 0) <= 0 or views[str(a)].get('visibles_cerrado') != 0 for a in (0, 32, -32)):
            raise RuntimeError('Plan sin validación de oclusión: ' + s)
    for n, delta in keys.items():
        if n not in PRINCIPALES and not PATRON.fullmatch(n): raise RuntimeError('Key no autorizada: ' + n)
        if PATRON.fullmatch(n) and n not in rules: raise RuntimeError('Falta la regla correctiva: ' + n)
        if n in kb and n not in managed: raise RuntimeError('La key existente no está administrada: ' + n)
        if np.shape(delta) != base.shape or not np.isfinite(delta).all(): raise RuntimeError('Delta inválido: ' + n)
        _expresion(n, rules)
    obsolete = managed - set(keys)
    rules.update({n: {'tipo': 'inactivo'} for n in obsolete})
    affected = managed | set(AO.NOMBRES) | set(AO._registro(cara))
    if hasattr(K,'plan_tension'):affected|=TENSION
    snap = _snap(cara, affected)
    archivo = guardar_respaldo(cara, snap, ruta_respaldo)
    try:
        for n in sorted(set(keys) | obsolete):
            if n not in kb: cara.shape_key_add(name=n, from_mix=False)
            delta = keys.get(n, np.zeros_like(base))
            kb[n].data.foreach_set('co', (base + delta).reshape(-1))
            expression = _expresion(n, rules)
            prior = snap['drivers'].get(n)
            if prior is None or prior[0] != expression:
                _set_driver(kb[n], (expression, [('v', 'OBJECT', ctrl, f'["_rlb_efectivo_{n[-1]}"]')], prior[2] if prior else False))
        cara['rlb_parpados_generadas'] = json.dumps(sorted(set(keys) | obsolete))
        cara['rlb_parpados_reglas'] = json.dumps(rules, sort_keys=True)
        if hasattr(K, 'parametros_cierre'):
            cara['rlb_parpados_parametros'] = json.dumps(K.parametros_cierre, sort_keys=True)
        mediciones={s:info[s]['aporte_superior_medido'] for s in ('L','R') if 'aporte_superior_medido' in info[s]}
        if mediciones:
            objetivo=float(K.parametros_cierre['aporte_superior'])
            if any(abs(m['centro']-objetivo)>.03 for m in mediciones.values()):
                raise RuntimeError('La proporción medida se aleja del objetivo; no se aplicó el cierre')
            cara['rlb_parpados_proporcion_medida']=json.dumps(mediciones,sort_keys=True)
        resultado = AO.actualizar(cara, aplicar=True)
        tension_resultado=None
        if hasattr(K,'plan_tension'):
            from . import tension_parpados as TP
            tension_resultado=TP.aplicar_plan(cara,K.plan_tension)
        return {'keys': len(keys), 'obsoletas': len(obsolete), 'ajustes': resultado,
                'respaldo': snap, 'archivo_respaldo': archivo, 'tension':tension_resultado}
    except Exception:
        _restaurar(cara, snap)
        raise


def restaurar_plan(cara, respaldo):
    if isinstance(respaldo, (str, Path)): respaldo = cargar_respaldo(cara, respaldo)
    _restaurar(cara, respaldo)
