"""Localidad de los ajustes labiales. No cambia pesos del rig ni formas FACS.

Una banda labial se obtiene de las anclas de superficie de cada personaje.
La distancia es tridimensional: una columna X no identifica un labio y puede
atravesar el otro labio, la mejilla o el forro oculto de la boca.
"""
import hashlib
import json
from pathlib import Path
import numpy as np

VERSION = 1


def _firma_malla(cara):
    co = np.empty(len(cara.data.vertices) * 3, dtype=np.float32)
    cara.data.shape_keys.key_blocks[0].data.foreach_get('co', co)
    loops = np.empty(len(cara.data.loops), dtype=np.int32)
    cara.data.loops.foreach_get('vertex_index', loops)
    return hashlib.sha256(co.tobytes() + loops.tobytes()).hexdigest()


def respaldar(cara, ruta=None):
    """Respaldo explícito solo de aj_labio_*; nunca sobreescribe un archivo existente."""
    nombres = [k.name for k in cara.data.shape_keys.key_blocks if k.name.startswith('aj_labio_')]
    coords = []
    for n in nombres:
        co = np.empty(len(cara.data.vertices) * 3, dtype=np.float32)
        cara.data.shape_keys.key_blocks[n].data.foreach_get('co', co)
        coords.append(co)
    meta = {k: (cara[k].to_dict() if hasattr(cara[k], 'to_dict') else cara[k])
            for k in cara.keys() if k.startswith('aj_mascaras_labios_')}
    if ruta is None:
        import bpy, re
        from datetime import datetime, timezone
        from uuid import uuid4
        base = Path(bpy.data.filepath).parent if bpy.data.filepath else Path(bpy.app.tempdir)
        nombre = re.sub(r'[<>:"/\\|?*]', '_', cara.name).strip().rstrip('.') or 'cara'
        ruta = base / 'RLB_revision' / nombre / 'mascaras_labios' / (
            datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_') + uuid4().hex[:8] + '.npz')
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with ruta.open('xb') as archivo:
        np.savez_compressed(archivo, nombres=np.asarray(nombres), coords=np.asarray(coords),
                            cara=np.asarray(cara.name), firma=np.asarray(_firma_malla(cara)),
                            metadata=np.asarray(json.dumps(meta, sort_keys=True)))
    cara['aj_respaldo_mascaras_labios'] = str(ruta)
    return {'archivo': str(ruta), 'keys': len(nombres), 'sha256': hashlib.sha256(ruta.read_bytes()).hexdigest()}


def restaurar(cara, ruta=None):
    """Restaura solo geometría/metadata labial propia; conserva los valores actuales de la expresión."""
    ruta = ruta or cara.get('aj_respaldo_mascaras_labios')
    if not ruta:
        raise RuntimeError('No hay un respaldo explícito de los ajustes labiales de este objeto')
    with np.load(ruta, allow_pickle=False) as datos:
        if str(datos['cara']) != cara.name or str(datos['firma']) != _firma_malla(cara):
            raise RuntimeError('El respaldo no corresponde a este objeto/topología/Basis')
        nombres, coords = datos['nombres'].tolist(), datos['coords']
        meta = json.loads(str(datos['metadata']))
        if any(not n.startswith('aj_labio_') or n not in cara.data.shape_keys.key_blocks for n in nombres):
            raise RuntimeError('El respaldo contiene keys ausentes o ajenas a los ajustes labiales')
        if coords.shape != (len(nombres), len(cara.data.vertices) * 3):
            raise RuntimeError('El tamaño del respaldo no coincide con la malla')
        # Toda la validación precede a la escritura.
        for n, co in zip(nombres, coords):
            cara.data.shape_keys.key_blocks[n].data.foreach_set('co', co)
    for k in [k for k in cara.keys() if k.startswith('aj_mascaras_labios_')]:
        del cara[k]
    for k, valor in meta.items():
        cara[k] = valor
    cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})
    return {'restauradas': len(nombres), 'valores_expresion_conservados': True}


def _distancia_linea(P, curva):
    distancia = np.full(len(P), np.inf)
    for a, b in zip(curva, curva[1:]):
        ab = b - a
        u = np.clip((P - a) @ ab / max(float(ab @ ab), 1e-20), 0., 1.)
        distancia = np.minimum(distancia, np.linalg.norm(P - a - u[:, None] * ab, axis=1))
    return distancia


def bandas(P, superficies, semiancho=None):
    """Devuelve máscaras sup/inf a partir de puntos sobre la superficie, sin Blender."""
    P = np.asarray(P, dtype=float)
    curvas = {}
    for lab in ('sup', 'inf'):
        puntos = [np.asarray(d['w']) @ P[np.asarray(d['tri'], dtype=int)]
                  for p, d in superficies.items()
                  if p.startswith(f'labio_{lab}_') or (lab == 'inf' and p.startswith('labio_borde_inf_'))]
        if len(puntos) < 3:
            raise RuntimeError(f'Faltan anclas de superficie del labio {lab}')
        curvas[lab] = np.array(sorted(puntos, key=lambda q: q[0]))
    xmin = min(q[:, 0].min() for q in curvas.values())
    xmax = max(q[:, 0].max() for q in curvas.values())
    hw = float(semiancho) if semiancho is not None else (xmax - xmin) / 2
    if hw <= 1e-9:
        raise RuntimeError('La banda labial no tiene anchura')
    cx = (xmax + xmin) / 2
    centros = [np.array([cx, np.interp(cx, q[:, 0], q[:, 1]), np.interp(cx, q[:, 0], q[:, 2])])
               for q in curvas.values()]
    separacion = float(np.linalg.norm(centros[0] - centros[1]))
    radio = max(0.075 * hw, min(0.14 * hw, 0.45 * separacion))
    ds = {lab: _distancia_linea(P, q) for lab, q in curvas.items()}
    out = {}
    for lab, otro in (('sup', 'inf'), ('inf', 'sup')):
        t = np.clip(ds[lab] / radio, 0., 1.)
        banda = (1. - t * t) ** 2
        # Cero en la frontera compartida: nunca extender un control por el labio opuesto.
        frontera = np.clip((ds[otro] - ds[lab]) / (0.25 * radio), 0., 1.)
        out[lab] = banda * frontera * frontera * (3. - 2. * frontera)
    return out, {'semiancho': float(hw), 'radio_banda': float(radio)}


def actualizar(cara, aplicar=False):
    """Ensayo por defecto; aplicar=True modifica exclusivamente las keys aj_labio_*.

    Conserva la amplitud de cada key en su ancla y su valor actual. Calcula y
    valida todas las correcciones antes de escribir. No altera canales, acciones,
    grupos de vértices, topología, UV, materiales ni las otras secciones faciales.
    """
    from . import ajustes as AJ
    sk = cara.data.shape_keys
    if sk is None:
        return {'keys': 0, 'aplicado': False}
    superficies = cara.get('aj_superficies_labios', {})
    kb = sk.key_blocks
    P = np.empty(len(cara.data.vertices) * 3)
    kb[0].data.foreach_get('co', P)
    P = P.reshape(-1, 3)
    anclas = cara.get('aj_anclas', {})
    hw = None
    if 'comisura_L' in anclas and 'comisura_R' in anclas:
        hw = float(np.linalg.norm(P[int(anclas['comisura_L'])] - P[int(anclas['comisura_R'])]) / 2)
    limites, medidas = bandas(P, superficies, hw)
    serial = superficies.to_dict() if hasattr(superficies, 'to_dict') else dict(superficies)
    parametros = {'version': VERSION, 'medidas': medidas, 'radio_min': 0.075, 'radio_max': 0.14,
                  'fraccion_separacion': 0.45, 'caida_frontera': 0.25}
    contexto = hashlib.sha256(P.astype(np.float32).tobytes() + json.dumps(serial, sort_keys=True).encode()
                             + json.dumps(parametros, sort_keys=True).encode()).hexdigest()
    firmas = dict(cara.get('aj_mascaras_labios_firmas', {})) if cara.get('aj_mascaras_labios_contexto') == contexto else {}
    nuevas_firmas = dict(firmas)
    cambios = []
    por_key = []
    for p in AJ.zonas(cara):
        if not p.startswith('labio_') or p not in superficies:
            continue
        lab = 'sup' if p.startswith('labio_sup_') else 'inf'
        datos = superficies[p]
        tri, pesos = np.asarray(datos['tri'], dtype=int), np.asarray(datos['w'])
        for d in ('arriba', 'adelante', 'derecha'):
            nombre = AJ.nombre(p, d)
            k = kb.get(nombre)
            if k is None:
                continue
            C = np.empty(P.size); k.data.foreach_get('co', C)
            firma = hashlib.sha256(C.astype(np.float32).tobytes()).hexdigest()
            if firmas.get(nombre) == firma:
                continue
            D = C.reshape(-1, 3) - P
            anterior = float(np.linalg.norm(pesos @ D[tri]))
            nuevo = D * limites[lab][:, None]
            amplitud = float(np.linalg.norm(pesos @ nuevo[tri]))
            if anterior > 1e-10:
                if amplitud < anterior * 0.05:
                    raise RuntimeError(f'La banda no contiene el ancla de {nombre}; no se escribe ninguna key')
                nuevo *= anterior / amplitud
            fuera = limites[lab] == 0
            otros = limites['inf' if lab == 'sup' else 'sup'] > 0
            max_antes = float(np.linalg.norm(D[fuera], axis=1).max(initial=0))
            max_despues = float(np.linalg.norm(nuevo[fuera], axis=1).max(initial=0))
            por_key.append({'key': nombre, 'valor': float(k.value), 'vertices_antes': int(np.count_nonzero(np.linalg.norm(D, axis=1) > 1e-9)),
                            'vertices_despues': int(np.count_nonzero(np.linalg.norm(nuevo, axis=1) > 1e-9)),
                            'fuga_fuera_antes': max_antes, 'fuga_fuera_despues': max_despues,
                            'fuga_otro_labio_despues': float(np.linalg.norm(nuevo[otros], axis=1).max(initial=0)),
                            'amplitud_ancla_antes': anterior, 'amplitud_ancla_despues': float(np.linalg.norm(pesos @ nuevo[tri]))})
            co_final = (P + nuevo).ravel().astype(np.float32)
            nuevas_firmas[nombre] = hashlib.sha256(co_final.tobytes()).hexdigest()
            cambios.append((k, co_final))
    if aplicar:
        for k, co in cambios:
            k.data.foreach_set('co', co)
        sk.update_tag()
        cara.update_tag(refresh={'DATA'})
        cara['aj_mascaras_labios_version'] = VERSION
        cara['aj_mascaras_labios_contexto'] = contexto
        cara['aj_mascaras_labios_firmas'] = nuevas_firmas
    return {'keys': len(cambios), 'aplicado': aplicar, 'medidas': medidas, 'por_key': por_key}
