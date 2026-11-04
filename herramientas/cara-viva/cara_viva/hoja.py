"""Hoja de contacto: todas las expresiones de la biblioteca en una sola imagen."""
import json
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Euler, Vector

from . import animar


def _render_a_pixeles(escena, ruta):
    escena.render.filepath = ruta
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(ruta)
    try:
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
    finally:
        bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def hoja_contacto(contexto, rig, bib, nombres, ruta_png, celda=300, columnas=5, ancho_vista=4.2,
                  distancia=1.0):
    """Renderiza cada expresión (Workbench, cámara ortográfica de frente) y las junta."""
    escena = contexto.scene
    iod = float(rig["cv_iod"])
    x0 = float(rig["cv_x0"])
    pts = json.loads(rig["cv_puntos"])
    cx = x0
    cz = 0.5 * (0.5 * (pts["OJO.L"][2] + pts["OJO.R"][2]) + pts["MENTON"][2])
    cy = pts["NARIZ"][1]

    antes = (escena.camera, escena.render.engine, escena.render.resolution_x, escena.render.resolution_y,
             escena.render.filepath, escena.render.film_transparent, escena.render.image_settings.file_format,
             escena.render.resolution_percentage)
    cam_datos = bpy.data.cameras.new("cv_tmp_cam")
    cam_datos.type = "ORTHO"
    cam_datos.ortho_scale = ancho_vista * iod
    cam = bpy.data.objects.new("cv_tmp_cam", cam_datos)
    escena.collection.objects.link(cam)
    cam.location = Vector((cx, cy - distancia, cz))
    cam.rotation_euler = Euler((math.radians(90), 0, 0))
    escena.camera = cam
    escena.render.engine = "BLENDER_WORKBENCH"
    escena.render.resolution_x = escena.render.resolution_y = celda
    escena.render.resolution_percentage = 100
    escena.render.film_transparent = False
    escena.render.image_settings.file_format = "PNG"
    escena.display.shading.light = "STUDIO"
    escena.display.shading.color_type = "MATERIAL"

    celdas = []
    try:
        with tempfile.TemporaryDirectory() as tmp:
            for i, nombre in enumerate(nombres):
                pesos, crudos = bib["expresiones"][nombre].get("canales", {}), bib["expresiones"][nombre].get("huesos", {})
                animar.aplicar_mezcla(rig, bib, pesos, crudos)
                contexto.view_layer.update()
                celdas.append(_render_a_pixeles(escena, os.path.join(tmp, "e%03d.png" % i)))
    finally:
        animar.reiniciar_pose(rig)
        (escena.camera, escena.render.engine, escena.render.resolution_x, escena.render.resolution_y,
         escena.render.filepath, escena.render.film_transparent, escena.render.image_settings.file_format,
         escena.render.resolution_percentage) = antes
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_datos)

    filas = int(math.ceil(len(celdas) / float(columnas)))
    h = w = celda
    lienzo = np.ones((filas * h, columnas * w, 4), dtype=np.float32)
    for i, c in enumerate(celdas):
        r, col = divmod(i, columnas)
        lienzo[(filas - 1 - r) * h:(filas - r) * h, col * w:(col + 1) * w, :] = c
    img = bpy.data.images.new("cv_hoja", columnas * w, filas * h, alpha=True)
    try:
        img.pixels.foreach_set(lienzo.ravel())
        img.filepath_raw = ruta_png
        img.file_format = "PNG"
        img.save()
    finally:
        bpy.data.images.remove(img)
    return {"ruta": ruta_png, "celdas": len(celdas), "filas": filas, "columnas": columnas}
