# Estantería de expresiones con miniaturas (como la biblioteca de poses de Serena): cada expresión es un asset
# Action con su miniatura y la etiqueta 'FACS'; sale abajo del visor 3D (estantería propia del complemento) y al
# hacer clic se aplica a los canales v_<forma> del control. La biblioteca de poses de Blender no sirve aquí: solo
# aplica transformaciones de huesos y nuestros canales son propiedades del objeto de control.
# Las acciones guardan los canales por nombre ARKit, así que una expresión de un personaje vale para cualquier otro
# hecho con el complemento (también desde otro .blend marcado como biblioteca de assets).
#
#   from <complemento>.nucleo.facs import poses as PO
#   PO.crear(cara)                      # las 42 de expresiones_facs.json, con miniatura
#   PO.aplicar(cara, accion, peso=1.0, frame=None)
import bpy, os, math
from mathutils import Vector
from . import biblioteca as BI
from .. import util

ETIQUETA = 'FACS'


def nombre_accion(cara, expr):
    return f'{cara.name}_FACS_{expr}'


def _channelbag(a):
    from bpy_extras import anim_utils
    slot = a.slots[0] if a.slots else a.slots.new(id_type='OBJECT', name='Control')
    return anim_utils.action_ensure_channelbag_for_slot(a, slot)


def _guardar(a, pesos, mirada):
    """los pesos van como F-curves constantes sobre ["v_<forma>"] del control (las que valen 0 no se guardan)."""
    cb = _channelbag(a)
    for f in list(cb.fcurves):
        cb.fcurves.remove(f)
    for n, v in sorted(pesos.items()):
        if abs(v) < 1e-4:
            continue
        f = cb.fcurves.new(f'["v_{n}"]')
        f.keyframe_points.insert(1, float(v)).interpolation = 'CONSTANT'
    a['mirada'] = [float(mirada[0]), float(mirada[1])]
    a.use_fake_user = True


def leer_crudo(a):
    """los canales tal cual están guardados (sin la intensidad general de la expresión)."""
    pesos = {}
    for l in a.layers:
        for s in l.strips:
            for cb in s.channelbags:
                for f in cb.fcurves:
                    if f.data_path.startswith('["v_'):
                        pesos[f.data_path[4:-2]] = f.evaluate(1)
    return {'pesos': pesos, 'mirada': list(a.get('mirada', (0.0, 0.0)))}


def leer(a):
    """{'pesos': {forma: valor}, 'mirada': [h, v]} de una acción de la estantería, con su intensidad general
    (propiedad 'intensidad' de la acción, la pone el editor de expresiones)."""
    e = leer_crudo(a)
    k = float(a.get('intensidad', 1.0))
    if abs(k - 1.0) > 1e-6:
        e['pesos'] = {n: v * k for n, v in e['pesos'].items()}
        e['mirada'] = [m * k for m in e['mirada']]
    return e


def aplicar(cara, a, peso=1.0, frame=None):
    return BI.aplicar(cara, leer(a), peso, True, frame)


def cara_de(context, a=None):
    """la cara a la que se aplica: el objeto activo (cara, control o rig de la cara) o la de la acción."""
    ob = context.object
    if ob is not None:
        n = ob.get('facs_cara') or ob.name
        for cand in (n, n.removesuffix('_Cara_Control'), n.removesuffix('_Rig_Labios')):
            o = bpy.data.objects.get(cand)
            if o is not None and o.type == 'MESH' and BI.control(o) is not None:
                return o
    if a is not None and a.get('rlb_facs_cara') in bpy.data.objects:
        return bpy.data.objects[a['rlb_facs_cara']]
    caras = [o for o in bpy.data.objects if o.type == 'MESH' and BI.control(o) is not None]
    return caras[0] if len(caras) == 1 else None


# ---------------------------------------------------------------- miniaturas
def _encuadre(cara):
    """cámara ortográfica de frente, de la barbilla a la frente, medida con los pivotes de los ojos (siguen al
    personaje; los marcadores RLB_* se quedan donde se pusieron si luego se mueve)."""
    pL = bpy.data.objects.get(f'{cara.name}_OjoPivote_L')
    pR = bpy.data.objects.get(f'{cara.name}_OjoPivote_R')
    if not (pL and pR):
        raise RuntimeError('Faltan los pivotes de los ojos <cara>_OjoPivote_L/R')
    a, b = pL.matrix_world.translation, pR.matrix_world.translation
    m, d = (a + b) / 2, (a - b).length
    return Vector((m.x, m.y - 1.0, m.z - d * 0.5)), d * 3.3


def _render_miniatura(cara, ruta, tam, color):
    sc = bpy.context.scene
    centro, orto = _encuadre(cara)
    cam_d = bpy.data.cameras.new('rlb_mini'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = orto
    cam = bpy.data.objects.new('rlb_mini', cam_d); sc.collection.objects.link(cam)
    cam.location = centro; cam.rotation_euler = (math.radians(90), 0, 0)
    r, sh = sc.render, sc.display.shading
    keep = (sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath, r.film_transparent)
    keep_sh = (sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity)
    ocultos = [o for o in bpy.data.objects if o.type in ('ARMATURE', 'EMPTY') and not o.hide_render]
    try:
        sc.camera = cam
        r.resolution_x = r.resolution_y = tam; r.resolution_percentage = 100
        r.engine = 'BLENDER_WORKBENCH'; r.film_transparent = False; r.filepath = ruta
        sh.light = 'STUDIO'; sh.color_type = color; sh.show_object_outline = False; sh.show_cavity = True
        for o in ocultos:
            o.hide_render = True
        bpy.ops.render.render(write_still=True)
    finally:
        for o in ocultos:
            o.hide_render = False
        sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath, r.film_transparent = keep
        sh.light, sh.color_type, sh.show_object_outline, sh.show_cavity = keep_sh
        bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_d)


def _poner_miniatura(a, ruta):
    im = bpy.data.images.load(ruta, check_existing=False)
    try:
        w, h = im.size
        pv = a.preview_ensure()
        pv.image_size = (w, h)
        pv.image_pixels_float = im.pixels[:]
    finally:
        bpy.data.images.remove(im)


# ---------------------------------------------------------------- crear
def crear(cara, nombres=None, miniaturas=True, tam=256, color='TEXTURE', carpeta=None):
    """una acción-asset por expresión de la biblioteca (o las nombres dadas), con miniatura renderizada. 0.8.2: con las
    miniaturas, lo que no es del personaje se oculta del render (con varios personajes en el .blend salían todos)."""
    from .. import posicion
    with posicion.aislado(cara):
        return _crear(cara, nombres, miniaturas, tam, color, carpeta)


def _crear(cara, nombres=None, miniaturas=True, tam=256, color='TEXTURE', carpeta=None):
    lib = BI.cargar()['expresiones']
    nombres = nombres or list(lib)
    ctrl = BI.control(cara)
    if ctrl is None:
        raise RuntimeError('Falta el control FACS: construye la cara FACS primero')
    disp = set(BI.keys_facs(cara))
    base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
    carpeta = carpeta or util.carpeta_revision(cara, 'miniaturas')
    os.makedirs(carpeta, exist_ok=True)
    # estado actual del control, para dejarlo igual
    ad = ctrl.animation_data
    act = ad.action if ad else None
    antes = {k: ctrl[k] for k in ctrl.keys() if k.startswith('v_')}
    if ad:
        ad.action = None
    hechas = []
    try:
        for n in nombres:
            e = lib[n]
            pesos = BI.expandir(e.get('pesos', {}), disp)
            an = nombre_accion(cara, n)
            a = bpy.data.actions.get(an) or bpy.data.actions.new(an)
            _guardar(a, pesos, e.get('mirada', (0.0, 0.0)))
            a['rlb_facs_cara'] = cara.name
            a['rlb_facs_expr'] = n
            if a.asset_data is None:
                a.asset_mark()
            ad_ = a.asset_data
            if ETIQUETA not in [t.name for t in ad_.tags]:
                ad_.tags.new(ETIQUETA)
            ad_.description = n.replace('_', ' ')
            if miniaturas:
                aplicar(cara, a)
                ruta = os.path.join(carpeta, f'{n}.png')
                _render_miniatura(cara, ruta, tam, color)
                _poner_miniatura(a, ruta)
            hechas.append(an)
    finally:
        for k, v in antes.items():
            ctrl[k] = v
        if ad:
            ad.action = act
        BI.mirada(cara, 0.0, 0.0)
        bpy.context.view_layer.update()
    return hechas


def quitar(cara):
    n = 0
    for a in list(bpy.data.actions):
        if a.get('rlb_facs_cara') == cara.name and a.name.startswith(f'{cara.name}_FACS_'):
            bpy.data.actions.remove(a); n += 1
    return n
