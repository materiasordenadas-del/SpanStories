# Línea de trabajo del complemento (0.6.7): pasos NUMERADOS en orden fijo; cada uno solo se puede pulsar cuando el
# anterior está hecho. Este módulo solo sabe QUÉ pasos hay, EN QUÉ ORDEN y SI están hechos; los pasos en sí los hacen
# los operadores de siempre (rlb.paso, rlb.facs, rlb.solo_parpados).
#
# Estado de un paso = su marca en cara['rlb_hechos'] (lista JSON de ids, la escribe cada operador al terminar bien).
# Si la cara aún no tiene esa propiedad (archivos hechos antes de la 0.6.7) el estado se deduce de lo que ya existe
# (objetos <cara>_…, marcadores, shape keys, propiedades facs_*) y esa deducción se guarda como punto de partida en la
# primera marca. Todo es barato (sin mallas, sin bucles sobre vértices): se llama desde draw().
import json
import bpy
from . import marco as MK

# (id, título, operador, argumento, qué hace)   operador: 'paso' -> rlb.paso(paso=arg), 'facs' -> rlb.facs(paso=arg),
# 'solo' -> rlb.solo_parpados, 'medir' -> rlb.medir_parpados
COMPLETA = [
    ('analizar', 'Analizar UV, malla e islas', 'paso', 'analizar', 'Inventario de UV, topología y materiales (solo lee)'),
    ('detectar', 'Detectar marcadores', 'paso', 'detectar', 'Boca, comisuras, labios, ojos, cejas y partes de la malla'),
    ('arreglar', 'Arreglar malla', 'paso', 'arreglar', 'Cuantización, solapas de las comisuras, normales de la boca (borra shape keys)'),
    ('abrir_ojos', 'Abrir ojos esculpidos', 'paso', 'abrir_ojos', 'Si los ojos son un bulto de la piel, lo quita y deja el hueco'),
    ('rig', 'Rig de labios', 'paso', 'rig', 'Armature con Bendy Bones (partes 1-3 del tutorial)'),
    ('pesos', 'Pesos + labio dentro', 'paso', 'pesos', 'Pesos de la cara y shape keys del roll hacia dentro'),
    ('interior', 'Interior de la boca', 'paso', 'interior', 'Dientes anime, lengua y fondo de la boca'),
    ('ojos', 'Ojos', 'paso', 'ojos', 'Globo, iris y pupila (modo elegido en el panel)'),
    ('parpados', 'Párpados, cejas y mejillas (rig)', 'paso', 'parpados', 'Huesos radiales, shape keys, controles y drivers'),
    ('cuenca', 'Cuenca del ojo', 'paso', 'cuenca', 'Opcional: AÑADE caras (margen del párpado y bolsa oscura). Solo si se ve el interior por el hueco'),
    ('oclusion', 'Lente de oclusión', 'paso', 'oclusion', 'Banda de contacto plana delante del globo (solo con hueco)'),
    ('F_preparar', 'Cara FACS: preparar malla', 'facs', 'preparar', 'Guarda el original, alisa la rejilla y cierra los labios'),
    ('F_boca', 'Cara FACS: boca', 'facs', 'boca', 'Bolsa, forro, dientes en banda, lengua y formas de la boca'),
    ('F_ojos', 'Cara FACS: ojos, cejas, mejillas', 'facs', 'ojos', 'Densifica, párpados (0.6.7), cejas, mejillas, nariz y lente'),
    ('F_delineado', 'Cara FACS: delineado', 'facs', 'delineado', 'Pestañas pintadas en la piel del párpado'),
    ('F_controles', 'Cara FACS: controles', 'facs', 'controles', 'Huesos en la cara y canales v_<forma>'),
    ('F_terminar', 'Cara FACS: drivers y terminar', 'facs', 'terminar', 'Piezas copian la cara, correctivas, rig viejo apagado'),
    ('F_expresiones', 'Expresiones para el editor', 'facs', 'miniaturas', 'Las 42 expresiones de la biblioteca como acciones con miniatura: se editan en «Editor de expresiones»'),
    ('F_habla', 'Probar que hable', 'facs', 'habla', 'Frase de prueba en español y hoja con los visemas A E I O U M-B-P F-V de frente y perfil (se mira antes de seguir)'),
]

SOLO = [
    ('detectar', 'Marcadores', 'paso', 'detectar', 'Boca, ojos y cejas (con el cursor 3D en la boca)'),
    ('abrir_ojos', 'Abrir ojos esculpidos', 'paso', 'abrir_ojos', 'Quita el bulto de Tripo y deja el hueco (si no hace falta, se da por hecho)'),
    ('ojos', 'Ojos', 'paso', 'ojos', 'Globo, iris y pupila (modo elegido en el panel)'),
    ('S_parpados', 'Párpados + delineado', 'solo', None, 'Densifica, párpados 0.6.7 y delineado; mide al terminar'),
    ('S_medida', 'Medida', 'medir', None, 'Vértices dentro del globo, triángulos invertidos y ojo visible al cerrar'),
]

EXTRAS_ID = ('sincronizar_pestanas_uv', 'iris', 'corte', 'gestos', 'expresiones', 'glb', 'revisar')


def ids(ruta):
    return [s[0] for s in (SOLO if ruta == 'SOLO' else COMPLETA)]


def _todos():
    out = []
    for s in COMPLETA + SOLO:
        if s[0] not in out:
            out.append(s[0])
    return out


# ---------------------------------------------------------------- estado
def _kb(cara):
    sk = cara.data.shape_keys
    return sk.key_blocks if sk else None


def derivado(cara):
    """qué pasos parecen hechos según lo que existe (para archivos sin marcas)."""
    O = bpy.data.objects
    n = MK.nombres(cara)
    d = MK.cfg(cara)
    kb = _kb(cara)
    keys = cara.get('facs_keys') or []
    hay = lambda k: bool(kb and kb.get(k) is not None)
    marc = all(O.get(MK.nombre_marca(cara, k)) is not None for k in ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf'))
    r = {}
    r['detectar'] = bool(marc and not d.get('semiauto_boca_pendiente'))
    r['analizar'] = r['detectar']
    r['arreglar'] = bool(O.get(n['rig']) or (d.get('respaldo') and r['detectar']))
    r['abrir_ojos'] = bool(d.get('ojos_abiertos') or (r['detectar'] and not d.get('ojos_esculpidos')))
    r['rig'] = O.get(n['rig']) is not None
    r['pesos'] = hay('labio_sup_dentro')
    r['interior'] = O.get(n['dientes_sup']) is not None or O.get(n['fondo']) is not None
    r['ojos'] = d.get('ojos_modo') == 'NINGUNO' or O.get(n['piv_L']) is not None
    rig = O.get(n['rig'])
    r['parpados'] = bool(rig and any(b.name.startswith('DEF-parp') for b in rig.data.bones))
    hueco = bool(d.get('ojos_hueco'))
    r['cuenca'] = bool(r['parpados'] and (not hueco or d.get('cuenca')))
    r['oclusion'] = bool(r['parpados'] and (not hueco or d.get('oclusion')))
    r['F_preparar'] = bool(cara.get('facs_preparada'))
    r['F_boca'] = 'jawOpen' in keys
    r['F_ojos'] = 'eyeBlink_L' in keys or 'eyeBlink_R' in keys
    r['F_delineado'] = cara.get('facs_delineado_uv') is not None
    r['F_controles'] = O.get(f'{cara.name}_Cara_Control') is not None
    apagado = False
    if rig:
        ms = [m for m in cara.modifiers if m.type == 'ARMATURE' and m.object == rig]
        apagado = bool(ms) and not any(m.show_viewport for m in ms)
    r['F_terminar'] = bool(apagado and r['F_controles'])
    r['F_expresiones'] = any(a.name.startswith(f'{cara.name}_FACS_') for a in bpy.data.actions)
    r['F_habla'] = False          # siempre se propone: la prueba de habla se mira a ojo antes de darla por buena
    r['S_parpados'] = bool(r['F_ojos'] and r['F_delineado'])
    r['S_medida'] = False
    return r


def no_aplica(cara, hec):
    """pasos que en esta cara no hay nada que hacer (se dan por hechos, el panel lo dice)."""
    na = set()
    if 'detectar' in hec:
        d = MK.cfg(cara)
        if d.get('ojos_abiertos') or not d.get('ojos_esculpidos'):
            na.add('abrir_ojos')
        if not d.get('ojos_hueco'):
            na.update(('cuenca', 'oclusion'))
        elif not (d.get('cuenca_pedida') or d.get('cuenca')):
            # 0.8.5: la cuenca añade caras y sube el borde del párpado; la malla del personaje no se cambia sin pedirlo
            na.add('cuenca')
    return na


def _marcas(cara):
    """las marcas tal cual (o la deducción si la cara aún no tiene), sin los pasos que no aplican."""
    raw = cara.get('rlb_hechos')
    if raw is None:
        return {k for k, v in derivado(cara).items() if v}
    try:
        return set(json.loads(raw))
    except (TypeError, ValueError):
        return set()


def hechos(cara):
    """conjunto de ids hechos: las marcas + los pasos que en esta cara no hay nada que hacer."""
    h = _marcas(cara)
    return h | no_aplica(cara, h)


def marcar(cara, *claves):
    """apunta pasos hechos. Repetir 'arreglar' borra las shape keys: los pasos de después dejan de estar hechos."""
    if cara is None:
        return
    h = _marcas(cara)      # la primera vez parte de lo deducido
    for c in claves:
        h.add(c)
        if c == 'arreglar':
            orden = _todos()
            for x in orden[orden.index('arreglar') + 1:]:
                if x not in claves:
                    h.discard(x)
    cara['rlb_hechos'] = json.dumps(sorted(h))


def olvidar(cara, *claves):
    h = _marcas(cara)
    for c in claves:
        h.discard(c)
    cara['rlb_hechos'] = json.dumps(sorted(h))


def reiniciar(cara):
    if 'rlb_hechos' in cara:
        del cara['rlb_hechos']


def abierto(cara, ruta, hec=None):
    """lista [(paso, hecho, habilitado)]: un paso se puede pulsar solo si el anterior está hecho."""
    hec = hechos(cara) if hec is None else hec
    out = []
    prev = True
    for s in (SOLO if ruta == 'SOLO' else COMPLETA):
        hecho = s[0] in hec
        out.append((s, hecho, prev))
        prev = hecho
    return out


def siguiente(cara, ruta):
    """primer paso pendiente de la ruta (o None si está todo hecho)."""
    for s, hecho, _ in abierto(cara, ruta):
        if not hecho:
            return s
    return None


def hay_rig(cara):
    return bpy.data.objects.get(MK.nombres(cara)['rig']) is not None
