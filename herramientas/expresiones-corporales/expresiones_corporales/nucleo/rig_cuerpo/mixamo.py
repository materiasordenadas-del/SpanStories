"""Esqueleto de Mixamo como recurso adicional (nunca obligatorio).

Si en la escena hay un esqueleto `mixamorig:*` del mismo personaje (aunque este desplazado a
un lado, como el que devuelve Mixamo junto a su copia de la malla), sus articulaciones sirven
de semilla para los marcadores ECB_*. Se alinea por la caja de su malla hija (o por la
altura total) y se puede mezclar con la deteccion propia. La malla procesada por Mixamo no
se usa para nada: la malla original, sus shape keys y el rig facial quedan intactos.
"""
import bpy
import numpy as np
from mathutils import Vector

# marcador -> (hueso Mixamo sin prefijo, 'h' cabeza | 't' cola)
MAPA = {
    'pelvis': ('Hips', 'h'), 'columna': ('Spine', 'h'), 'pecho': ('Spine1', 'h'),
    'pecho_alto': ('Spine2', 'h'), 'cuello': ('Neck', 'h'), 'cabeza': ('Head', 'h'),
    'coronilla': ('HeadTop_End', 'h'),
}
for _l, _m in (('L', 'Left'), ('R', 'Right')):
    MAPA.update({
        f'clavicula.{_l}': (f'{_m}Shoulder', 'h'), f'hombro.{_l}': (f'{_m}Arm', 'h'),
        f'codo.{_l}': (f'{_m}ForeArm', 'h'), f'muneca.{_l}': (f'{_m}Hand', 'h'),
        f'cadera.{_l}': (f'{_m}UpLeg', 'h'), f'rodilla.{_l}': (f'{_m}Leg', 'h'),
        f'tobillo.{_l}': (f'{_m}Foot', 'h'), f'bola_pie.{_l}': (f'{_m}ToeBase', 'h'),
        f'punta_pie.{_l}': (f'{_m}ToeBase', 't'),
    })
    for _d, _md in (('indice', 'Index'), ('medio', 'Middle'), ('anular', 'Ring'),
                    ('menique', 'Pinky'), ('pulgar', 'Thumb')):
        for _i in range(4):
            MAPA[f'{_d}_{_i}.{_l}'] = (f'{_m}Hand{_md}{_i + 1}', 'h')


def buscar():
    """Armaduras con huesos de Mixamo (con o sin prefijo `mixamorig:`)."""
    res = []
    for o in bpy.data.objects:
        if o.type == 'ARMATURE' and any(b.name.split(':')[-1] == 'Hips' for b in o.data.bones):
            res.append(o)
    return res


def _hueso(arm, nombre):
    for b in arm.data.bones:
        if b.name.split(':')[-1] == nombre:
            return b
    return None


def _caja(ob):
    co = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    return co.min(0), co.max(0)


def puntos(arm, mallas_destino):
    """Marcadores desde el esqueleto Mixamo, llevados encima del personaje destino.

    Alineacion: si el esqueleto tiene una malla hija, se casan las cajas (centro en planta,
    suelo y escala por altura); si no, solo la altura total contra la del esqueleto."""
    if not isinstance(mallas_destino, (list, tuple)):
        mallas_destino = [mallas_destino]
    cajas = [_caja(o) for o in mallas_destino]
    b0 = np.min([c[0] for c in cajas], 0)
    b1 = np.max([c[1] for c in cajas], 0)
    hijos = [c for c in arm.children if c.type == 'MESH']
    if hijos:
        a0, a1 = _caja(hijos[0])
    else:
        zs = [(arm.matrix_world @ b.head_local).z for b in arm.data.bones]
        top = _hueso(arm, 'HeadTop_End')
        a1 = np.array([0, 0, (arm.matrix_world @ top.head_local).z if top else max(zs)])
        a0 = np.array([0, 0, min(zs)])
        hips = arm.matrix_world @ _hueso(arm, 'Hips').head_local
        a0[:2] = a1[:2] = (hips.x, hips.y)
    esc = (b1[2] - b0[2]) / max(a1[2] - a0[2], 1e-6)
    ca = np.array([(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, a0[2]])
    cb = np.array([(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, b0[2]])
    out = {}
    for k, (n, ht) in MAPA.items():
        b = _hueso(arm, n)
        if b is None:
            continue
        p = np.array(arm.matrix_world @ (b.head_local if ht == 'h' else b.tail_local))
        out[k] = tuple(float(x) for x in (p - ca) * esc + cb)
    if 'cuello' in out and 'cabeza' in out:
        out['cuello_medio'] = tuple((np.array(out['cuello']) + np.array(out['cabeza'])) / 2)
    return {'puntos': out, 'escala': float(esc), 'desplazamiento': (cb - ca * esc).tolist()}


def mezclar(propios, de_mixamo, peso_mixamo=0.5):
    """Mezcla punto a punto; lo que solo tiene una fuente se queda como esta (talones, etc.)."""
    out = dict(propios)
    for k, p in de_mixamo.items():
        if k in propios:
            a, b = np.array(propios[k]), np.array(p)
            out[k] = tuple(float(x) for x in a + peso_mixamo * (b - a))
        else:
            out[k] = p
    return out


def comparar(propios, de_mixamo):
    """Distancia (cm) entre fuentes por marcador, para avisar de dudas grandes."""
    return {k: round(float(np.linalg.norm(np.array(propios[k]) - np.array(p))) * 100, 1)
            for k, p in de_mixamo.items() if k in propios}
