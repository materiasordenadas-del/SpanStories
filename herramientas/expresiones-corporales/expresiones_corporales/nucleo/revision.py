# Hoja de revisión: mosaico de renders Workbench rápidos de cada expresión en el pico y en el mantener, de frente y
# en 3/4. Mismos nombres de archivo (se sobrescriben) para no llenar el disco. Al lado va un .json con el orden de la
# rejilla (fila = expresión; columnas = pico frente, pico 3/4, mantener frente, mantener 3/4).
#
#   revision.hoja(rig, claves=None, ruta=None) -> ruta_png
import bpy, os, math, json, time
import numpy as np
from mathutils import Vector, Matrix
from . import util as U
from . import perfil as PF

COLUMNAS = ('pico_frente', 'pico_34', 'mantener_frente', 'mantener_34')


def _encuadre(rig, p):
    """centro y tamaño del personaje (mallas del rig en la neutra, o los huesos si no hay malla)."""
    pts = []
    for o in U.mallas_del_rig(rig):
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not pts:
        pts = [rig.matrix_world @ b.head_local for b in rig.data.bones] + \
              [rig.matrix_world @ b.tail_local for b in rig.data.bones]
    lo = Vector(tuple(min(v[i] for v in pts) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in pts) for i in range(3)))
    return (lo + hi) / 2, max((hi - lo).length * 0.62, 0.1)


def _camara(sc, centro, tam, F, Uv, grados):
    d = Matrix.Rotation(math.radians(grados), 3, Uv) @ F
    cd = bpy.data.cameras.new('ecorp_rev')
    cd.type = 'ORTHO'
    cd.ortho_scale = tam * 1.15
    cam = bpy.data.objects.new('ecorp_rev', cd)
    sc.collection.objects.link(cam)
    cam.location = centro + d * tam * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cd.clip_end = tam * 20
    return cam, cd


def _leer_png(ruta, tam):
    """píxeles (tam, tam, 4) de un PNG recién renderizado. La imagen se carga perezosa: hasta que no se pide su
    tamaño no tiene píxeles (foreach_get fallaba con «expected sequence size 0»); además el archivo puede tardar
    un momento en aparecer en disco."""
    for _ in range(50):
        if os.path.exists(ruta) and os.path.getsize(ruta) > 0:
            break
        time.sleep(0.05)
    im = bpy.data.images.load(ruta, check_existing=False)
    try:
        w, h = im.size                      # fuerza la carga
        if w * h == 0:
            im.reload()
            w, h = im.size
        if (w, h) != (tam, tam):
            im.scale(tam, tam)
        px = np.array(im.pixels[:], np.float32)
    finally:
        bpy.data.images.remove(im)
    return px.reshape(tam, tam, 4)


def hoja(rig, claves=None, ruta=None, tam=200):
    from . import capas as CA, generador as GE
    p = PF.asegurar(rig)
    pg = U.props(rig)
    if claves is None:
        from . import biblioteca as BI
        claves = [it.name for it in pg.expresiones if U.estilo_de(it.name) == pg.estilo] or \
                 [c for c in BI.cargar()['expresiones'] if U.estilo_de(c) == pg.estilo]
    if not claves:
        raise RuntimeError('No hay expresiones que revisar')
    if ruta is None:
        ruta = os.path.join(U.carpeta_salida('revision_cuerpo'), f'{rig.name}_hoja.png')
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    cuadro = os.path.join(os.path.dirname(os.path.abspath(ruta)), '_cuadro.png')
    sc = bpy.context.scene
    Mw = rig.matrix_world.to_3x3()
    F = (Mw @ Vector(p['marco']['F'])).normalized()
    Uv = (Mw @ Vector(p['marco']['U'])).normalized()
    previa = CA.estado(rig) if CA.activa(rig) else None
    frame0 = sc.frame_current
    r, sh = sc.render, sc.display.shading
    guard = (sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath,
             r.film_transparent, r.image_settings.file_format)
    guard_sh = (sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity)
    from . import exportar as EX
    propios = set(EX.objetos_exportar(rig))
    # solo el personaje: fuera huesos, vacíos y cualquier otra malla de la escena (suelo, decorado, otros)
    ocultos = [o for o in bpy.data.objects if not o.hide_render and o not in propios
               and o.type in ('ARMATURE', 'EMPTY', 'LIGHT', 'MESH', 'CURVE', 'SURFACE', 'META', 'FONT', 'GPENCIL',
                              'GREASEPENCIL', 'CURVES', 'POINTCLOUD', 'VOLUME')] +               [o for o in propios if o.type in ('ARMATURE', 'EMPTY') and not o.hide_render]
    camaras = []
    filas = []
    mosaico = np.zeros((len(claves) * tam, len(COLUMNAS) * tam, 4), np.float32)
    try:
        CA.previsualizar(rig, claves[0] if claves else 'neutra')
        centro, tamano = _encuadre(rig, p)
        camaras = [_camara(sc, centro, tamano, F, Uv, 0), _camara(sc, centro, tamano, F, Uv, 35)]
        r.resolution_x = r.resolution_y = tam
        r.resolution_percentage = 100
        r.engine = 'BLENDER_WORKBENCH'
        r.film_transparent = False
        r.image_settings.file_format = 'PNG'
        r.filepath = cuadro
        sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity = 'STUDIO', 'MATERIAL', True, True
        for o in ocultos:
            o.hide_render = True
        for i, c in enumerate(claves):
            info = CA.previsualizar(rig, c)
            mk = info['marcadores']
            # el pico del primer eslabón; los demás llegan con el desfase: se mira a mitad de camino
            fp = (mk.get('pico', 1) + min(mk.get('mantener', 1), mk.get('pico', 1) + 6)) // 2
            fm = (mk.get('mantener', 1) + mk.get('salida', 1)) // 2
            filas.append(info['clave'])
            for j, (f, cam) in enumerate(((fp, 0), (fp, 1), (fm, 0), (fm, 1))):
                sc.frame_set(int(f))
                sc.camera = camaras[cam][0]
                if os.path.exists(cuadro):
                    os.remove(cuadro)
                bpy.ops.render.render(write_still=True)
                px = _leer_png(cuadro, tam)
                y0 = (len(claves) - 1 - i) * tam      # las filas de píxeles van de abajo arriba
                mosaico[y0:y0 + tam, j * tam:(j + 1) * tam] = px
        h, w = mosaico.shape[:2]
        im = bpy.data.images.new('ecorp_hoja', w, h, alpha=True)
        try:
            im.pixels.foreach_set(mosaico.ravel())
            im.filepath_raw = ruta
            im.file_format = 'PNG'
            im.save()
        finally:
            bpy.data.images.remove(im)
        with open(os.path.splitext(ruta)[0] + '.json', 'w', encoding='utf-8') as f:
            json.dump({'filas': filas, 'columnas': list(COLUMNAS), 'celda': tam}, f, ensure_ascii=False, indent=1)
    finally:
        for o in ocultos:
            o.hide_render = False
        (sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath,
         r.film_transparent, r.image_settings.file_format) = guard
        sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity = guard_sh
        for cam, cd in camaras:
            bpy.data.objects.remove(cam)
            bpy.data.cameras.remove(cd)
        if os.path.exists(cuadro):
            try:
                os.remove(cuadro)
            except OSError:
                pass
        if previa:
            CA.previsualizar(rig, previa.get('clave', 'neutra'), base=previa.get('base'))
        else:
            CA.quitar(rig)
        sc.frame_set(frame0)
    return ruta
