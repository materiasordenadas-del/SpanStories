# Biblioteca portable de expresiones y visemas: pesos de las formas FACS por nombre (ARKit + lidAngry/lidSad).
# Las claves sin sufijo _L/_R valen para los dos lados. 'mirada' = [horizontal, vertical] en grados.
import bpy, json, os, math
from mathutils import Vector

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'biblioteca', 'expresiones_facs.json')
LADOS = ('_L', '_R')
BASE = 'tom'                # la base de expresiones la decide el usuario (2026-10-28); cambiarla exige cambiar esta línea a propósito


def cargar(ruta=RUTA):
    with open(ruta, encoding='utf-8') as f:
        d = json.load(f)
    if ruta == RUTA and d.get('base') != BASE:      # 0.8.50: las recetas de Tom se quedaron fuera del add-on y los personajes nuevos heredaban las viejas
        raise RuntimeError(f"expresiones_facs.json no es la base aprobada ({BASE}): lleva «{d.get('base')}». No se generan expresiones con otra base.")
    return d


def expandir(pesos, disponibles):
    """{'mouthSmile': .5, 'eyeBlink_L': 1} -> {'mouthSmile_L': .5, 'mouthSmile_R': .5, 'eyeBlink_L': 1}"""
    out = {}
    for k, v in pesos.items():
        if k in disponibles:
            out[k] = max(out.get(k, 0.0), v) if False else v
        else:
            for s in LADOS:
                if k + s in disponibles:
                    out[k + s] = v
    return out


def overrides_visemas(cara):
    """0.8.11: formas de boca propias de este personaje ({visema: {canal: peso}}), editadas con el editor de habla."""
    try:
        return {k: dict(v) for k, v in json.loads(cara.get('rlb_visemas') or '{}').items()}
    except (TypeError, ValueError, AttributeError):
        return {}


def visemas_de(cara, lib=None):
    """visemas de la biblioteca con los cambios propios del personaje por encima (el visema editado sustituye al entero)."""
    lib = lib or cargar()
    out = {k: dict(v) for k, v in lib['visemas'].items() if k != 'nota'}
    for k, v in overrides_visemas(cara).items():
        if k in out:
            out[k] = {c: float(x) for c, x in v.items()}
    return out


def keys_facs(cara):
    sk = cara.data.shape_keys
    if not sk:
        return []
    from .construir import CORRECTIVAS
    fk = set(cara.get('facs_keys', []))
    return [k.name for k in sk.key_blocks[1:] if k.name in fk and k.name not in CORRECTIVAS]


def mirada(cara, h=0.0, v=0.0):
    """gira los ojos (hueso 'mirada' del rig de la cara) h/v grados."""
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    if rig is None or 'mirada' not in rig.pose.bones:
        return
    pb = rig.pose.bones['mirada']
    b = pb.bone
    piv = bpy.data.objects.get(f'{cara.name}_OjoPivote_L')
    dist = (rig.matrix_world @ b.head_local - piv.matrix_world.translation).length if piv else 0.3
    off = Vector((dist * math.tan(math.radians(h)), 0.0, dist * math.tan(math.radians(v))))
    off = rig.matrix_world.inverted().to_3x3() @ off
    pb.location = b.matrix_local.to_3x3().inverted() @ off


def control(cara):
    return bpy.data.objects.get(f'{cara.name}_Cara_Control')


def aplicar(cara, expr, peso=1.0, limpiar=True, frame=None):
    """pone la expresión: en los canales v_<forma> del objeto de control si existe (las keys tienen drivers),
    si no directamente en las keys. Con frame inserta keyframes."""
    from .construir import Piezas
    # 0.6.9 (Carlitos): tras recargar el complemento los drivers de las keys volvían a quedar «no válidos» y las
    # expresiones no movían la cara (las hojas de revisión salían todas en reposo)
    ad = cara.data.shape_keys.animation_data if cara.data.shape_keys else None
    if ad and any(not f.driver.is_valid for f in ad.drivers):
        from .controles import refrescar_drivers
        refrescar_drivers(cara)
    disp = keys_facs(cara)
    pesos = expandir(expr.get('pesos', {}), set(disp))
    ctrl = control(cara)
    if ctrl is not None:
        for n in disp:
            p = f'v_{n}'
            if p not in ctrl.keys():
                continue
            if limpiar or n in pesos:
                ctrl[p] = min(1.0, pesos.get(n, 0.0) * peso)
                if frame is not None:
                    ctrl.keyframe_insert(f'["{p}"]', frame=frame)
        ctrl.update_tag()
    else:
        for o in [cara] + Piezas(cara).todas():
            sk = o.data.shape_keys
            if not sk:
                continue
            for n in disp:
                k = sk.key_blocks.get(n)
                if k is not None and (limpiar or n in pesos):
                    k.value = pesos.get(n, 0.0) * peso
    h, v = expr.get('mirada', (0.0, 0.0))
    mirada(cara, h * peso, v * peso)
    bpy.context.view_layer.update()
    return pesos
