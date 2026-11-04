"""Hornear canales a shape keys (morph targets para la web) y hoja de contacto."""
import numpy as np

from . import animar
from .nucleo import biblioteca


def _coords_evaluadas(contexto, obj):
    dg = contexto.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    try:
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
    finally:
        ev.to_mesh_clear()
    return co


def hornear(contexto, rig, malla, bib, canales=None, sustituir=True, escala=1.0):
    """Un shape key por canal, con el nombre del canal. -> informe.

    Se mide la malla ya deformada (armature + modificadores) con el canal al 100 %
    y se guarda la diferencia respecto al reposo. Todas las claves quedan con
    valor 0; la animación posterior las mueve.
    """
    canales = list(canales or bib["canales"].keys())
    n = len(malla.data.vertices)
    animar.reiniciar_pose(rig)
    contexto.view_layer.update()
    base = _coords_evaluadas(contexto, malla)
    if len(base) != n * 3:
        raise ValueError("los modificadores de %s cambian el número de vértices; "
                         "no se puede hornear" % malla.name)
    if malla.data.shape_keys is None:
        malla.shape_key_add(name="Basis", from_mix=False)
    reposo = np.empty(n * 3, dtype=np.float64)
    malla.data.vertices.foreach_get("co", reposo)

    ganancias = animar.leer_ganancias(rig)
    hechos, vacios = [], []
    for canal in canales:
        animar.reiniciar_pose(rig)
        huesos, _ = biblioteca.mezclar_huesos(bib["canales"], {canal: 1.0}, ganancias)
        animar.poner_huesos(rig, huesos)
        contexto.view_layer.update()
        co = _coords_evaluadas(contexto, malla)
        delta = (co - base) * escala
        movidos = int((np.abs(delta.reshape(-1, 3)).max(axis=1) > 1e-7).sum())
        if movidos == 0:
            vacios.append(canal)
            continue
        kb = malla.data.shape_keys.key_blocks
        if canal in kb:
            if not sustituir:
                continue
            malla.shape_key_remove(kb[canal])
        k = malla.shape_key_add(name=canal, from_mix=False)
        k.data.foreach_set("co", reposo + delta)
        k.slider_min, k.slider_max, k.value = 0.0, 1.0, 0.0
        hechos.append((canal, movidos))
    animar.reiniciar_pose(rig)
    contexto.view_layer.update()
    return {"creados": len(hechos), "sin_efecto": vacios,
            "vertices_movidos": {c: m for c, m in hechos}}
