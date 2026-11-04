"""Controles por punto y máscaras manuales, sin normalizar otros grupos."""
import base64
import io
import json
import numpy as np
from . import ajustes_ojos as AO
from .mascaras_labios import _firma_malla

PROPIEDAD = 'rlb_pesos_parpados'
PREFIJO = 'RLB_Parpado_'


def datos(cara):
    return json.loads(cara.get(PROPIEDAD, '{}')) if cara else {}


def _validar(cara, estado):
    if cara is None or cara.type != 'MESH' or not AO.disponible(cara):
        raise RuntimeError('Elige una cara con párpados instalados')
    if cara.mode != 'OBJECT' or cara.data.users > 1:
        raise RuntimeError('Vuelve a modo Objeto y usa una malla de usuario único')
    if estado and estado.get('firma') != _firma_malla(cara):
        raise RuntimeError('Cambió Basis o la topología: los pesos editados se conservan, pero requieren reasignación; no se aplicarán índices antiguos')


def _nuevo(cara):
    kb = cara.data.shape_keys.key_blocks
    base = AO._co(cara.data.shape_keys.reference_key)
    anclas = dict(cara.get('aj_anclas', {}))
    ganancias = {}
    for punto in AO.ZONAS:
        if punto not in anclas:
            continue
        for direccion in AO.DIRECCIONES:
            nombre = f'aj_{punto}_{direccion}'
            if nombre in kb:
                ganancias[nombre] = float(np.linalg.norm((AO._co(kb[nombre]) - base)[int(anclas[punto])]))
    if not ganancias:
        raise RuntimeError('Primero crea los puntos de párpados')
    return {'version': 1, 'firma': _firma_malla(cara), 'puntos': {}, 'ganancias_base': ganancias, 'manuales': {}}


def _empaquetar(w):
    archivo = io.BytesIO(); np.savez_compressed(archivo, w=np.asarray(w, dtype=np.float32))
    return base64.b85encode(archivo.getvalue()).decode('ascii')


def _desempaquetar(texto, n):
    with np.load(io.BytesIO(base64.b85decode(texto)), allow_pickle=False) as f:
        w = np.asarray(f['w'], dtype=float)
    if w.shape != (n,) or not np.isfinite(w).all() or np.any(w < 0) or np.any(w > 1):
        raise RuntimeError('La máscara manual guardada no es válida')
    return w


def leer_opciones(cara, estado=None, permitir_topologia=False):
    estado = datos(cara) if estado is None else estado
    if not estado:
        return {'longitudinal': {}, 'transversal': {}, 'mascaras': {}, 'ganancias': {}, 'intensidades': {}}
    incompatible = estado.get('firma') != _firma_malla(cara)
    if incompatible and not permitir_topologia:
        _validar(cara, estado)
    puntos = estado.get('puntos', {})
    longi = {p: float(v.get('longitudinal', 1)) for p, v in puntos.items()}
    trans = {p: float(v.get('transversal', 1)) for p, v in puntos.items()}
    mascaras = {} if incompatible else {p: _desempaquetar(w, len(cara.data.vertices)) for p, w in estado.get('manuales', {}).items()
                                       if p not in estado.get('manuales_inactivos', [])}
    ganancias = {n: float(g) * float(puntos.get(n[3:].rsplit('_', 1)[0], {}).get('intensidad', 1))
                 for n, g in estado.get('ganancias_base', {}).items()}
    intensidad = {p: float(v.get('intensidad', 1)) for p, v in puntos.items()}
    return {'longitudinal': longi, 'transversal': trans, 'mascaras': mascaras, 'ganancias': ganancias, 'intensidades': intensidad,
            'incompatible': incompatible}


def opciones_punto(cara, punto):
    return dict({'intensidad': 1., 'longitudinal': 1., 'transversal': 1.}, **datos(cara).get('puntos', {}).get(punto, {}))


def reasignar(cara):
    anterior = datos(cara)
    if not anterior or anterior.get('firma') == _firma_malla(cara):
        raise RuntimeError('La topología no requiere reasignación')
    _validar(cara, {})
    nuevo = _nuevo(cara)
    nuevo['puntos'] = anterior.get('puntos', {})
    nuevo['ganancias_base'].update(anterior.get('ganancias_base', {}))
    historico = anterior.pop('juegos_anteriores', [])
    historico.append(anterior)
    nuevo['juegos_anteriores'] = historico
    cara[PROPIEDAD] = json.dumps(nuevo, separators=(',', ':'), ensure_ascii=False)


def grupo(cara, punto, crear=False):
    if punto not in AO.ZONAS or punto not in dict(cara.get('aj_anclas', {})):
        raise RuntimeError('Selecciona un punto de párpado existente')
    return cara.vertex_groups.get(PREFIJO + punto) or (cara.vertex_groups.new(name=PREFIJO + punto) if crear else None)


def pesos(cara, punto):
    g = grupo(cara, punto); w = np.zeros(len(cara.data.vertices))
    if g:
        for v in cara.data.vertices:
            for enlace in v.groups:
                if enlace.group == g.index:
                    w[v.index] = enlace.weight; break
    return w


def preparar_grupo(cara, punto):
    estado = datos(cara); _validar(cara, estado)
    g = grupo(cara, punto)
    if g is not None:
        return g
    op = leer_opciones(cara, estado)
    shapes, anchors = AO.plan(cara, extensiones_override=op['longitudinal'], extensiones_transversales_override=op['transversal'], mascaras_override=op['mascaras'])
    d = shapes[f'aj_{punto}_arriba']; a = anchors[punto]
    normal = float(np.linalg.norm(d[a]))
    if normal <= 1e-12: raise RuntimeError('Máscara automática sin ancla válida')
    w = np.clip(np.linalg.norm(d, axis=1) / normal, 0., 1.)
    g = grupo(cara, punto, crear=True)
    for i in np.flatnonzero(w): g.add([int(i)], float(w[i]), 'REPLACE')
    return g


def aplicar(cara, punto, intensidad, longitudinal, transversal, manual=False):
    return aplicar_varios(cara, [punto], intensidad, longitudinal, transversal, manual=manual)


def aplicar_varios(cara, puntos, intensidad, longitudinal, transversal, manual=False):
    estado = datos(cara); _validar(cara, estado)
    puntos = list(dict.fromkeys(puntos))
    if not puntos or any(p not in AO.ZONAS or p not in dict(cara.get('aj_anclas', {})) for p in puntos):
        raise RuntimeError('Selecciona un punto de párpado existente')
    if manual and len(puntos) != 1:
        raise RuntimeError('La pintura se aplica solo al punto activo')
    valores = (float(intensidad), float(longitudinal), float(transversal))
    if not np.isfinite(valores).all() or not 0 <= valores[0] <= 5 or not all(.25 <= x <= 2 for x in valores[1:]):
        raise RuntimeError('Intensidad o extensión fuera de rango')
    if not estado: estado = _nuevo(cara)
    for punto in puntos:
        estado['puntos'][punto] = dict(zip(('intensidad', 'longitudinal', 'transversal'), valores))
    if manual:
        punto = puntos[0]
        w = pesos(cara, punto); ancla = int(cara['aj_anclas'][punto])
        if w[ancla] < .999:
            raise RuntimeError('Pinta el ancla del punto con peso 1 para conservar su intensidad')
        estado['manuales'][punto] = _empaquetar(w)
        estado['manuales_inactivos'] = [p for p in estado.get('manuales_inactivos', []) if p != punto]
    op = leer_opciones(cara, estado)
    resultado = AO.actualizar(cara, aplicar=True, extensiones_override=op['longitudinal'],
        extensiones_transversales_override=op['transversal'], mascaras_override=op['mascaras'], ganancias_override=op['ganancias'], intensidades_override=op['intensidades'])
    cara[PROPIEDAD] = json.dumps(estado, separators=(',', ':'), ensure_ascii=False)
    return resultado


def volver_automatico(cara, punto):
    estado = datos(cara); _validar(cara, estado)
    if not estado or punto not in estado.get('manuales', {}): return
    estado.setdefault('manuales_inactivos', [])
    if punto not in estado['manuales_inactivos']: estado['manuales_inactivos'].append(punto)
    op = leer_opciones(cara, estado)
    r = AO.actualizar(cara, aplicar=True, extensiones_override=op['longitudinal'],
        extensiones_transversales_override=op['transversal'], mascaras_override=op['mascaras'], ganancias_override=op['ganancias'], intensidades_override=op['intensidades'])
    cara[PROPIEDAD] = json.dumps(estado, separators=(',', ':'), ensure_ascii=False)
    return r
