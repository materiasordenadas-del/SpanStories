"""Aplicar poses y escribir animación en el rig estándar (huesos y/o shape keys)."""
import json
import math
import os

import bpy

from .nucleo import biblioteca, vida

NOMBRE_ARCHIVO = "biblioteca_usuario.json"


# ------------------------------------------------------------- biblioteca

def carpeta_usuario():
    try:
        base = bpy.utils.extension_path_user(__package__, path="biblioteca", create=True)
    except Exception:
        base = os.path.join(bpy.utils.user_resource("CONFIG"), "cara_viva")
        os.makedirs(base, exist_ok=True)
    return base


def ruta_usuario():
    return os.path.join(carpeta_usuario(), NOMBRE_ARCHIVO)


def cargar_biblioteca():
    """Estándar + lo que el usuario guardó (su archivo manda)."""
    bib = biblioteca.por_defecto()
    ruta = ruta_usuario()
    if os.path.exists(ruta):
        bib = biblioteca.fusionar(bib, biblioteca.cargar(ruta))
    return bib


def guardar_biblioteca(bib):
    biblioteca.guardar(ruta_usuario(), biblioteca.solo_cambios(bib))


# --------------------------------------------------------------- ganancias

def leer_ganancias(rig):
    try:
        return json.loads(rig.get("cv_ganancias", "{}"))
    except ValueError:
        return {}


def guardar_ganancias(rig, g):
    rig["cv_ganancias"] = json.dumps(g, ensure_ascii=False)


# -------------------------------------------------------------------- pose

def reiniciar_pose(rig):
    for pb in rig.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


def poner_huesos(rig, huesos_norm):
    """Aplica {hueso: {"loc": en IOD, "rot": en grados}} a la pose."""
    iod = float(rig["cv_iod"])
    for nombre, d in huesos_norm.items():
        pb = rig.pose.bones.get(nombre)
        if pb is None:
            continue
        loc = d.get("loc", (0.0, 0.0, 0.0))
        rot = d.get("rot", (0.0, 0.0, 0.0))
        pb.location = [x * iod for x in loc]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = [math.radians(x) for x in rot]


def aplicar_mezcla(rig, bib, pesos, crudos=None):
    """Pose completa a partir de pesos de canal. -> canales desconocidos."""
    reiniciar_pose(rig)
    huesos, desc = biblioteca.mezclar_huesos(bib["canales"], pesos, leer_ganancias(rig), crudos)
    poner_huesos(rig, huesos)
    return desc


def leer_pose(rig):
    """-> {hueso: (loc en unidades del armature, rot en grados)} de lo que se mueve."""
    out = {}
    for pb in rig.pose.bones:
        loc = tuple(pb.location)
        rot = tuple(math.degrees(a) for a in pb.rotation_euler)
        if max(abs(x) for x in loc) > 1e-9 or max(abs(x) for x in rot) > 1e-6:
            out[pb.name] = (loc, rot)
    return out


# -------------------------------------------------------------- animación

def iter_fcurves(accion):
    if hasattr(accion, "fcurves"):
        yield from accion.fcurves
        return
    for capa in accion.layers:
        for tira in capa.strips:
            for bolsa in tira.channelbags:
                yield from bolsa.fcurves


def sumar_curvas(*capas):
    """Suma curvas {canal: [(t, v)]} de varias capas muestreando en la unión de tiempos."""
    canales = {}
    for capa in capas:
        for c, curva in capa.items():
            canales.setdefault(c, []).append(curva)
    out = {}
    for c, lista in canales.items():
        if len(lista) == 1:
            out[c] = list(lista[0])
            continue
        tiempos = sorted({t for cu in lista for t, _ in cu})
        out[c] = [(t, sum(vida.lineal(cu, t) for cu in lista)) for t in tiempos]
    return out


def escribir(rig, malla, bib, curvas, cabeza=None, fps=24.0, frame0=1, modo="HUESOS",
             nombre="CV_Animacion", limite=1.4):
    """Escribe las curvas de canal como fotogramas clave.

    ``curvas``: {canal: [(segundos, valor)]}. ``cabeza``: [(t, (yaw, pitch, roll))] en grados.
    """
    escena = bpy.context.scene
    escena.render.fps = int(round(fps))
    ganancias = leer_ganancias(rig)
    cabeza = cabeza or []

    marcas = set()
    for cu in curvas.values():
        marcas.update(t for t, _ in cu)
    marcas.update(t for t, _ in cabeza)
    marcas = sorted(marcas)
    if not marcas:
        raise ValueError("no hay nada que animar")

    accion = bpy.data.actions.new(nombre)
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = accion

    kb = None
    if modo in ("SHAPEKEYS", "AMBOS") and malla is not None and malla.data.shape_keys:
        kb = malla.data.shape_keys.key_blocks
    llaves = 0
    reiniciar_pose(rig)
    for t in marcas:
        frame = frame0 + t * fps
        pesos = {c: max(-limite, min(limite, vida.lineal(cu, t))) for c, cu in curvas.items()}
        if modo in ("HUESOS", "AMBOS"):
            huesos, _ = biblioteca.mezclar_huesos(bib["canales"], pesos, ganancias)
            if cabeza:
                yaw, pitch, roll = _en(cabeza, t)
                h = huesos.setdefault("cv_cabeza", {"loc": [0.0, 0.0, 0.0], "rot": [0.0, 0.0, 0.0]})
                h["rot"][0] += pitch; h["rot"][1] += yaw; h["rot"][2] += roll
            reiniciar_pose(rig)
            poner_huesos(rig, huesos)
            for nombre_h in huesos:
                pb = rig.pose.bones.get(nombre_h)
                if pb is None:
                    continue
                pb.keyframe_insert("location", frame=frame, group=nombre_h)
                pb.keyframe_insert("rotation_euler", frame=frame, group=nombre_h)
                llaves += 2
        if kb is not None:
            for c, w in pesos.items():
                k = kb.get(c)
                if k is not None:
                    k.value = w
                    k.keyframe_insert("value", frame=frame)
                    llaves += 1
    escena.frame_start = frame0
    escena.frame_end = int(math.ceil(frame0 + marcas[-1] * fps)) + 1
    return {"accion": accion.name, "llaves": llaves, "marcas": len(marcas)}


def _en(serie, t):
    """Interpola la curva de cabeza [(t, (a, b, c))] en t."""
    if t <= serie[0][0]:
        return serie[0][1]
    if t >= serie[-1][0]:
        return serie[-1][1]
    for (t0, v0), (t1, v1) in zip(serie, serie[1:]):
        if t0 <= t <= t1:
            k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            return tuple(a + (b - a) * k for a, b in zip(v0, v1))
    return serie[-1][1]
