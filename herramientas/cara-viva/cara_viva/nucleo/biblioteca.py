"""Biblioteca de canales, expresiones y visemas que viaja entre personajes.

Formato JSON ``caraviva.biblioteca/1``::

    {"esquema": "caraviva.biblioteca/1",
     "canales":     {"mouthSmileLeft": {"cv_comisura.L": {"loc": [..], "rot": [..]}}},
     "expresiones": {"Feliz": {"canales": {"mouthSmileLeft": 0.9}, "huesos": {...},
                               "descripcion": "..."}},
     "visemas":     {"A": {"jawOpen": 0.85}}}

Los desplazamientos están en fracciones de IOD y los giros en grados, así que
el mismo archivo sirve para cualquier personaje construido con el estándar.
Solo se guarda lo que el usuario cambia: lo que falta se toma del estándar.
"""
import json
import os
import random

from . import estandar

ESQUEMA = "caraviva.biblioteca/1"


def por_defecto():
    return {"esquema": ESQUEMA,
            "canales": estandar.canales_por_defecto(),
            "expresiones": {k: {"canales": v, "descripcion": "estándar"}
                            for k, v in estandar.expresiones_por_defecto().items()},
            "visemas": estandar.visemas_es()}


def vacia():
    return {"esquema": ESQUEMA, "canales": {}, "expresiones": {}, "visemas": {}}


def cargar(ruta):
    with open(ruta, "r", encoding="utf-8") as f:
        d = json.load(f)
    if d.get("esquema") != ESQUEMA:
        raise ValueError("no es una biblioteca Cara Viva: " + str(d.get("esquema")))
    for k in ("canales", "expresiones", "visemas"):
        d.setdefault(k, {})
    return d


def guardar(ruta, bib):
    carpeta = os.path.dirname(ruta)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(bib, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, ruta)


def fusionar(base, otra, sobrescribir=True):
    """Devuelve ``base`` + ``otra`` (sin tocar los originales)."""
    out = json.loads(json.dumps(base))
    for k in ("canales", "expresiones", "visemas"):
        for nombre, valor in otra.get(k, {}).items():
            if sobrescribir or nombre not in out[k]:
                out[k][nombre] = json.loads(json.dumps(valor))
    return out


def solo_cambios(bib):
    """La parte de ``bib`` que difiere del estándar (lo único que merece guardarse)."""
    est = por_defecto()
    out = vacia()
    for k in ("canales", "expresiones", "visemas"):
        for nombre, valor in bib.get(k, {}).items():
            if est[k].get(nombre) != valor:
                out[k][nombre] = valor
    return out


# --------------------------------------------------------------- resolver

def resolver_expresion(bib, nombre):
    """-> (pesos de canal, huesos crudos) de una expresión."""
    e = bib["expresiones"][nombre]
    return dict(e.get("canales", {})), dict(e.get("huesos", {}))


def resolver_viseme(bib, clave):
    return dict(bib["visemas"].get(clave, {}))


def sumar_pesos(*mezclas, factores=None):
    out = {}
    for i, m in enumerate(mezclas):
        f = 1.0 if factores is None else factores[i]
        for k, v in m.items():
            out[k] = out.get(k, 0.0) + v * f
    return out


def intercambiar_lados(pesos):
    """Izquierda <-> derecha (para espejar una expresión)."""
    out = {}
    for k, v in pesos.items():
        if k.endswith("Left"): k = k[:-4] + "Right"
        elif k.endswith("Right"): k = k[:-5] + "Left"
        out[k] = v
    return out


def asimetria(pesos, cantidad=0.08, semilla=1):
    """Pequeña diferencia entre lados: ninguna cara real es perfectamente simétrica."""
    rnd = random.Random(semilla)
    factor = {}
    out = {}
    for k, v in pesos.items():
        base = k[:-4] if k.endswith("Left") else (k[:-5] if k.endswith("Right") else None)
        if base is None:
            out[k] = v
            continue
        if base not in factor:
            factor[base] = 1.0 + rnd.uniform(-cantidad, cantidad)
        lado = 1.0 if k.endswith("Left") else -1.0
        out[k] = v * (1.0 + lado * (factor[base] - 1.0))
    return out


# ------------------------------------------------------------------ mezcla

def mezclar_huesos(canales, pesos, ganancias=None, crudos=None):
    """Suma los canales ponderados.

    -> {hueso: {"loc": [x, y, z] en IOD, "rot": [x, y, z] en grados}}.
    Los canales desconocidos se ignoran (se devuelven en ``desconocidos``).
    """
    acum = {}
    desconocidos = []
    for nombre, w in pesos.items():
        if abs(w) < 1e-6:
            continue
        canal = canales.get(nombre)
        if canal is None:
            desconocidos.append(nombre)
            continue
        g = (ganancias or {}).get(nombre, 1.0)
        for hueso, d in canal.items():
            a = acum.setdefault(hueso, {"loc": [0.0, 0.0, 0.0], "rot": [0.0, 0.0, 0.0]})
            for clave in ("loc", "rot"):
                if clave in d:
                    for i in range(3):
                        a[clave][i] += d[clave][i] * w * g
    for hueso, d in (crudos or {}).items():
        a = acum.setdefault(hueso, {"loc": [0.0, 0.0, 0.0], "rot": [0.0, 0.0, 0.0]})
        for clave in ("loc", "rot"):
            if clave in d:
                for i in range(3):
                    a[clave][i] += d[clave][i]
    return acum, desconocidos


def pose_a_crudos(huesos_pose, iod):
    """De una pose real a la forma portable.

    ``huesos_pose``: {hueso: (loc_xyz en unidades del armature, rot_xyz en grados)}.
    Se descartan los huesos que casi no se mueven.
    """
    out = {}
    for hueso, (loc, rot) in huesos_pose.items():
        loc_n = [round(x / iod, 5) for x in loc]
        rot_n = [round(x, 3) for x in rot]
        if max(abs(x) for x in loc_n) < 1e-4 and max(abs(x) for x in rot_n) < 1e-2:
            continue
        out[hueso] = {"loc": loc_n, "rot": rot_n}
    return out


def validar(bib, huesos_disponibles=None):
    """Lista de avisos: canales que apuntan a huesos que no existen, pesos fuera de rango..."""
    avisos = []
    for nombre, canal in bib["canales"].items():
        for hueso in canal:
            if huesos_disponibles is not None and hueso not in huesos_disponibles:
                avisos.append("canal %s usa el hueso inexistente %s" % (nombre, hueso))
    for tipo in ("expresiones", "visemas"):
        for nombre, valor in bib[tipo].items():
            pesos = valor.get("canales", {}) if tipo == "expresiones" else valor
            for c, w in pesos.items():
                if c not in bib["canales"]:
                    avisos.append("%s %s usa el canal desconocido %s" % (tipo[:-1], nombre, c))
                if abs(w) > 1.6:
                    avisos.append("%s %s: peso %s muy grande en %s" % (tipo[:-1], nombre, w, c))
    return avisos
