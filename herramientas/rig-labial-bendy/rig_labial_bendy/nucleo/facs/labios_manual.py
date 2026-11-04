"""Caras y pesos manuales alternativos. Los automáticos se conservan en el objeto.

No modifica FACS, acciones, materiales, UV ni los grupos de deformación del rig.
Las coordenadas originales se guardan como deltas dispersos comprimidos, con
validación de Basis/topología; el .blend contiene ambos juegos de influencias.
"""
import base64
import io
import json
import numpy as np
from mathutils import Vector, kdtree
from . import ajustes as AJ
from .mascaras_labios import _firma_malla

PROPIEDAD = 'rlb_labios_manual_datos'
PREFIJO = 'RLB_ManualLabios_'


def datos(cara):
    return json.loads(cara.get(PROPIEDAD, '{}')) if cara else {}


def _base(cara):
    return _coords(cara, cara.data.shape_keys.key_blocks[0])


def _coords(cara, kb):
    co = np.empty(len(cara.data.vertices) * 3, dtype=np.float32)
    puntos = getattr(kb, 'points', None)
    (puntos if puntos is not None and len(puntos) == len(cara.data.vertices) else kb.data).foreach_get('co', co)
    return co.astype(np.float64).reshape(-1, 3)


def _validar(cara, estado=None):
    if cara is None or cara.type != 'MESH' or cara.data.shape_keys is None:
        raise RuntimeError('Elige una cara con el rig labial construido')
    if cara.data.users > 1:
        raise RuntimeError('La malla está compartida. Hazla de usuario único antes de editar pesos manuales')
    if not cara.data.shape_keys.use_relative:
        raise RuntimeError('Este editor requiere las shape keys relativas del rig labial')
    if cara.mode != 'OBJECT':
        raise RuntimeError('Vuelve a Mover puntos antes de aplicar las influencias')
    estado = datos(cara) if estado is None else estado
    firma = _firma_malla(cara)
    if estado and estado.get('firma') != firma:
        raise RuntimeError('Cambió Basis o la topología. Este juego manual se conserva, pero no es compatible con la malla actual')
    if not estado:
        estado = {'version': 1, 'firma': firma, 'regiones': {'sup': [], 'inf': []},
                  'automaticos': {}, 'manuales': {}, 'activo': False,
                  'densidad_boca': AJ.densidad(cara)['boca']}
    estado.setdefault('densidad_boca', AJ.densidad(cara)['boca'])
    return estado


def _guardar(cara, estado):
    cara[PROPIEDAD] = json.dumps(estado, separators=(',', ':'), ensure_ascii=False)
    cara['rlb_manual_activo'] = bool(estado['activo'])


def puntos(cara):
    return {p: z for p, z in AJ.zonas(cara).items() if p.startswith(('labio_', 'comisura_'))}


def grupo(cara, punto, crear=False):
    if punto not in puntos(cara):
        raise RuntimeError('Elige un punto de los labios o una comisura')
    nombre = PREFIJO + punto
    return cara.vertex_groups.get(nombre) or (cara.vertex_groups.new(name=nombre) if crear else None)


def marcar_caras(cara, region, caras, retirar=False):
    estado = _validar(cara)
    if region not in ('sup', 'inf'):
        raise ValueError('Región labial no válida')
    caras = {int(i) for i in caras}
    if not caras or min(caras) < 0 or max(caras) >= len(cara.data.polygons):
        raise RuntimeError('Selecciona caras válidas del labio, incluidas las interiores que necesites')
    guardadas = set(estado['regiones'][region])
    estado['regiones'][region] = sorted(guardadas - caras if retirar else guardadas | caras)
    if not retirar:
        otra = 'inf' if region == 'sup' else 'sup'
        estado['regiones'][otra] = sorted(set(estado['regiones'][otra]) - caras)
    _guardar(cara, estado)
    return len(estado['regiones'][region])


def caras_permitidas(cara, punto, estado=None):
    estado = datos(cara) if estado is None else estado
    regiones = estado.get('regiones', {})
    if punto.startswith('labio_sup_'):
        return set(regiones.get('sup', []))
    if punto.startswith(('labio_inf_', 'labio_borde_inf_')):
        return set(regiones.get('inf', []))
    return set(regiones.get('sup', [])) | set(regiones.get('inf', []))


def _vertices(cara, caras):
    return {int(v) for i in caras for v in cara.data.polygons[int(i)].vertices}


def asignar_peso(cara, punto, caras, peso):
    estado = _validar(cara)
    if not np.isfinite(peso) or not 0 <= peso <= 1:
        raise ValueError('El peso debe estar entre 0 y 1')
    seleccion = set(int(i) for i in caras)
    if not seleccion or not seleccion <= caras_permitidas(cara, punto, estado):
        raise RuntimeError('Selecciona caras previamente marcadas para el labio de este punto')
    ids = sorted(_vertices(cara, seleccion))
    grupo(cara, punto, crear=True).add(ids, float(peso), 'REPLACE')
    return len(ids)


def pesos(cara, punto):
    w = np.zeros(len(cara.data.vertices))
    g = grupo(cara, punto)
    if g is not None:
        for v in cara.data.vertices:
            for enlace in v.groups:
                if enlace.group == g.index:
                    w[v.index] = enlace.weight
                    break
    return w


def _empaquetar(cara, punto, coordenadas=None, ancla=None):
    if punto not in puntos(cara):
        raise RuntimeError('Cambió la densidad: reasigna los pesos manuales al punto actual')
    P = _base(cara)
    nombres = [AJ.nombre(punto, d) for d in puntos(cara)[punto][2]]
    contenido = {'nombres': np.array(nombres)}
    for j, n in enumerate(nombres):
        if coordenadas is None:
            D = _coords(cara, cara.data.shape_keys.key_blocks[n]) - P
        else:
            D = coordenadas[n] - P
        ids = np.flatnonzero(np.any(D != 0, axis=1)).astype(np.int32)
        contenido[f'i{j}'], contenido[f'd{j}'] = ids, D[ids]
    archivo = io.BytesIO(); np.savez_compressed(archivo, **contenido)
    superficies = cara.get('aj_superficies_labios', {})
    s = superficies.get(punto)
    superficie = (s.to_dict() if hasattr(s, 'to_dict') else dict(s)) if s is not None else None
    indice = int(cara.get('aj_anclas', {}).get(punto, 0))
    if ancla is not None:
        indice, superficie = int(ancla), {'tri': [int(ancla)] * 3, 'w': [1., 0., 0.]}
    return {'co': base64.b85encode(archivo.getvalue()).decode('ascii'),
            'ancla': indice, 'superficie': superficie}


def _desempaquetar(cara, punto, entrada):
    if punto not in puntos(cara):
        raise RuntimeError('Cambió la densidad: reasigna los pesos manuales al punto actual')
    P = _base(cara)
    esperados = [AJ.nombre(punto, d) for d in puntos(cara)[punto][2]]
    resultado = {}
    with np.load(io.BytesIO(base64.b85decode(entrada['co'])), allow_pickle=False) as archivo:
        if archivo['nombres'].tolist() != esperados:
            raise RuntimeError('El respaldo manual no corresponde a los controles de este punto')
        for j, n in enumerate(esperados):
            if n not in cara.data.shape_keys.key_blocks:
                raise RuntimeError('Cambió la densidad de puntos; reasigna los pesos al punto actual')
            ids, D = archivo[f'i{j}'], archivo[f'd{j}']
            if D.shape != (len(ids), 3) or not np.isfinite(D).all() or (len(ids) and (ids.min() < 0 or ids.max() >= len(P))):
                raise RuntimeError('Datos manuales incompatibles con la malla')
            co = P.copy(); co[ids] += D; resultado[n] = co
    return resultado


def _escribir_juego(cara, entradas):
    # Toda la validación y descompresión precede a la escritura.
    cambios = [(p, e, _desempaquetar(cara, p, e)) for p, e in entradas.items()]
    originales = {n: _coords(cara, cara.data.shape_keys.key_blocks[n])
                  for _, _, cs in cambios for n in cs}
    anclas = dict(cara.get('aj_anclas', {}))
    superficies = cara.get('aj_superficies_labios', {})
    superficies = superficies.to_dict() if hasattr(superficies, 'to_dict') else dict(superficies)
    try:
        for p, entrada, coords in cambios:
            for n, co in coords.items():
                cara.data.shape_keys.key_blocks[n].data.foreach_set('co', co.ravel())
            anclas[p] = entrada['ancla']
            if entrada['superficie'] is None:
                superficies.pop(p, None)
            else:
                superficies[p] = entrada['superficie']
    except Exception:
        for n, co in originales.items():
            cara.data.shape_keys.key_blocks[n].data.foreach_set('co', co.ravel())
        raise
    cara['aj_anclas'], cara['aj_superficies_labios'] = anclas, superficies
    cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})


def cambiar_modo(cara, manual):
    estado = _validar(cara)
    if bool(manual) == estado['activo']:
        return {'manual': bool(manual), 'puntos': len(estado['manuales'])}
    if manual and not estado['manuales']:
        raise RuntimeError('Primero asigna caras y pesos a un punto y pulsa Aplicar pesos')
    if manual and estado.get('densidad_boca') != AJ.densidad(cara)['boca']:
        raise RuntimeError('Cambió la densidad. Elige el punto actual y vuelve a Aplicar pesos; el juego anterior se conservará')
    if manual:
        # Al entrar se conserva el automático actual, incluso si se retocó desde la última vez.
        estado['automaticos'] = {p: _empaquetar(cara, p) for p in estado['manuales']}
    _escribir_juego(cara, estado['manuales'] if manual else estado['automaticos'])
    estado['activo'] = bool(manual); _guardar(cara, estado)
    return {'manual': bool(manual), 'puntos': len(estado['manuales'])}


def aplicar_punto(cara, punto, simetria=True, fuerza=1.):
    estado = _validar(cara)
    if punto not in puntos(cara) or not np.isfinite(fuerza) or not 0 < fuerza <= 5:
        raise RuntimeError('Punto o intensidad manual no válidos')
    if estado.get('densidad_boca') != AJ.densidad(cara)['boca']:
        if estado['activo']:
            raise RuntimeError('Vuelve a Automático antes de reasignar los puntos')
        estado.setdefault('juegos_anteriores', []).append({
            'densidad_boca': estado.get('densidad_boca'),
            'automaticos': estado['automaticos'], 'manuales': estado['manuales']})
        estado['automaticos'], estado['manuales'] = {}, {}
        estado['densidad_boca'] = AJ.densidad(cara)['boca']
    P = _base(cara)
    permitidos = _vertices(cara, caras_permitidas(cara, punto, estado))
    w = pesos(cara, punto); fuera = np.ones(len(P), dtype=bool)
    if permitidos:
        fuera[list(permitidos)] = False
    ignorados = int(np.count_nonzero(w[fuera])); w[fuera] = 0
    if not w.any():
        raise RuntimeError('Asigna pesos a las caras marcadas de este punto, incluyendo el interior si lo necesitas')
    a = cara.get('aj_anclas', {})
    cx = (P[int(a['comisura_L']), 0] + P[int(a['comisura_R']), 0]) / 2
    hw = np.linalg.norm(P[int(a['comisura_L'])] - P[int(a['comisura_R'])]) / 2
    trabajos = {punto: w}
    lado, pareja = AJ.lado_par(punto, cara)
    if simetria and pareja:
        permitidos_par = sorted(_vertices(cara, caras_permitidas(cara, pareja, estado)))
        kd = kdtree.KDTree(len(permitidos_par))
        for i in permitidos_par: kd.insert(Vector(P[i]), i)
        kd.balance(); reflejado = np.zeros(len(P))
        sin_pareja = 0
        for i in np.flatnonzero(w):
            q = P[i].copy(); q[0] = 2 * cx - q[0]
            hit = kd.find(Vector(q)) if permitidos_par else None
            if hit is not None and hit[2] <= 0.12 * hw:
                reflejado[hit[1]] = max(reflejado[hit[1]], w[i])
            else:
                sin_pareja += 1
        if not reflejado.any() or sin_pareja:
            raise RuntimeError('Marca también todas las caras correspondientes del otro lado, incluidas las internas, o desactiva Simetría')
        trabajos[pareja] = reflejado
    for p, W in trabajos.items():
        if not estado['activo'] or p not in estado['automaticos']:
            estado['automaticos'][p] = _empaquetar(cara, p)
        origen = P[int(a[p])]
        candidatos = np.flatnonzero(W >= W.max() * 0.95)
        ancla = int(candidatos[np.linalg.norm(P[candidatos] - origen, axis=1).argmin()])
        s, _ = AJ.lado_par(p, cara)
        eje_lado = -1. if s == 'R' else 1.
        direcciones = {'arriba': (0, 0, 1), 'derecha': (1, 0, 0),
                       'adelante': (0, -1, 0), 'afuera': (eje_lado, 0, 0)}
        mm = AJ.MM['comisura' if p.startswith('comisura_') else 'labio'] * hw / 0.0135 / 1000
        coords = {AJ.nombre(p, d): P + W[:, None] * np.array(direcciones[d]) * mm * fuerza
                  for d in puntos(cara)[p][2]}
        estado['manuales'][p] = _empaquetar(cara, p, coords, ancla)
    # Usar manual es una operación explícita; no modifica los puntos que no tengan un juego manual.
    if not estado['activo']:
        for p in estado['manuales']:
            if p not in trabajos:
                estado['automaticos'][p] = _empaquetar(cara, p)
    _escribir_juego(cara, estado['manuales'])
    for p, W in trabajos.items():
        if p == punto:
            continue
        g = grupo(cara, p, crear=True)
        g.remove(list(range(len(P))))
        ids = np.flatnonzero(W)
        # Pesos reflejados pueden ser distintos, se conserva cada valor sin cuantizar.
        for i in ids: g.add([int(i)], float(W[i]), 'REPLACE')
    estado['activo'] = True; _guardar(cara, estado)
    return {'puntos': list(trabajos), 'vertices': int(np.count_nonzero(w)), 'fuera_ignorados': ignorados}
