# Revisión: renders Workbench de cerca (boca de frente y de 3/4, comisura, ojos, cara entera) en varias
# poses, juntados en una hoja PNG. Es lo que hay que mirar antes de dar el rig por bueno: comisuras sin
# picos ni desgarros, pestañas pegadas al párpado, labios sin deformar.
import bpy, os, math, time
import numpy as np
from mathutils import Vector
from . import util, gestos as GS

POSES = ['reposo', 'boca_abierta', 'sonrisa', 'sorpresa', 'risa', 'triste', 'enojo', 'furia', 'parpadeo_medio', 'guino']


def _pose(nombre, M):
    s_b, s_o = M.s, M.se()
    if nombre == 'reposo': return {}
    if nombre == 'boca_abierta': return GS.escalar(GS.jaw(-0.012), s_b, s_o)
    if nombre == 'parpadeo_medio': return GS.escalar(GS.par('parpado', -0.002), s_b, s_o)
    return GS.escalar(GS.cargar_gestos(cfg=M.cfg)[nombre], s_b, s_o)


# 0.6.9: con la cara FACS terminada el rig de huesos está apagado (pipeline.apagar_rig_viejo) y posar huesos no
# movía nada: las hojas salían iguales en todas las poses. Entonces cada pose es una expresión de la biblioteca
# (canales v_<forma> del control) con los mismos nombres de pose de siempre.
POSES_FACS = {'reposo': 'neutro', 'boca_abierta': {'pesos': {'jawOpen': 0.6}}, 'sonrisa': 'sonrisa_leve',
              'sorpresa': 'sorpresa', 'risa': 'risa_fuerte', 'triste': 'triste', 'enojo': 'enojado',
              'furia': 'enojado_boca_abierta', 'parpadeo_medio': {'pesos': {'eyeBlink': 0.5}}, 'guino': 'guino'}


def es_facs(cara):
    return bool(cara.get('facs_keys')) and bpy.data.objects.get(f'{cara.name}_Cara_Control') is not None


def _posar_facs(cara, nombre):
    from .facs import biblioteca as BI
    e = POSES_FACS.get(nombre, nombre)
    if isinstance(e, str):
        e = BI.cargar()['expresiones'][e]
    BI.aplicar(cara, e)


def _hoja(files, dest, cols, scale):
    tiles = []
    for f in files:
        im = bpy.data.images.load(f, check_existing=False)
        w, h = im.size
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(im)
        k = max(1, int(round(1 / scale)))
        tiles.append(px[::k, ::k])
    th, tw = tiles[0].shape[:2]
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.ones((rows * th, cols * tw, 4), np.float32)
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * th
        sheet[y0:y0 + th, c * tw:(c + 1) * tw] = t
    out = bpy.data.images.new('rlb_hoja_tmp', cols * tw, rows * th, alpha=True)
    out.pixels[:] = sheet.ravel()
    out.filepath_raw = dest; out.file_format = 'PNG'; out.save()
    bpy.data.images.remove(out)


def render(cara, rig, M, poses=None, vistas=None, carpeta=None, color='TEXTURE'):
    poses = poses or POSES
    hw = M.hw
    mc = M.mc
    ojo = M.ojo('L')[0] if M.ojos else mc + Vector((hw * 1.7, 0, hw * 3.2))
    cz = (mc.z + ojo.z) / 2
    V = {'cara': ((0, mc.y - 1, cz), (90, 0, 0), hw * 11),
         'boca': ((0, mc.y - 1, mc.z), (90, 0, 0), hw * 4),
         'boca_34': ((math.sin(math.radians(37)), mc.y - math.cos(math.radians(37)), mc.z), (90, 0, 37), hw * 4),
         'ojo': ((ojo.x, mc.y - 1, ojo.z), (90, 0, 0), hw * 4.5),
         'ojo_R': ((-ojo.x, mc.y - 1, ojo.z), (90, 0, 0), hw * 4.5)}
    vistas = vistas or ['cara', 'boca', 'boca_34', 'ojo', 'ojo_R']
    base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
    carpeta = carpeta or util.carpeta_revision(cara)
    os.makedirs(carpeta, exist_ok=True)
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('rlb_cam'); cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('rlb_cam', cam_d); sc.collection.objects.link(cam)
    old_cam = sc.camera; sc.camera = cam
    r = sc.render
    keep = (r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath)
    sh = sc.display.shading
    keep_sh = (sh.light, sh.color_type, sh.show_object_outline)
    r.resolution_x, r.resolution_y, r.resolution_percentage = 640, 480, 100
    r.engine = 'BLENDER_WORKBENCH'
    sh.light = 'STUDIO'; sh.show_object_outline = False; sh.color_type = color
    hid = rig.hide_render; rig.hide_render = True
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    facs = es_facs(cara)
    ctrl = bpy.data.objects.get(f'{cara.name}_Cara_Control')
    ad = ctrl.animation_data if (facs and ctrl) else None
    act_c = ad.action if ad else None
    if act_c: ad.action = None
    files = []
    try:
        for v in vistas:
            for p in poses:
                util.pose_reposo(rig)
                if facs:
                    _posar_facs(cara, p)
                else:
                    GS.aplicar(rig, _pose(p, M))
                bpy.context.view_layer.update()
                loc, rot, orto = V[v]
                cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]; cam_d.ortho_scale = orto
                r.filepath = os.path.join(carpeta, f'{v}_{p}.png')
                bpy.ops.render.render(write_still=True)
                files.append(r.filepath)
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
        if facs:
            _posar_facs(cara, 'reposo')
            if act_c: ad.action = act_c
        sc.camera = old_cam
        bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_d)
        r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath = keep
        sh.light, sh.color_type, sh.show_object_outline = keep_sh
        rig.hide_render = hid
    hojas = {}
    for v in vistas:
        fs = [f for f in files if os.path.basename(f).startswith(v + '_') and
              (v not in ('boca', 'ojo') or not os.path.basename(f).startswith(v + '_34') and not os.path.basename(f).startswith(v + '_R'))]
        dest = os.path.join(carpeta, f'hoja_{v}.png')
        _hoja(fs, dest, 5, 0.5)
        hojas[v] = dest
    return {'carpeta': carpeta, 'hojas': hojas, 'poses': poses, 'modo': 'FACS' if facs else 'huesos',
            'carpeta_temporal': not bpy.data.filepath}


def resumen(cara, rig, M, carpeta=None, color='TEXTURE'):
    """0.8.2: UNA hoja (hoja_resumen.png, 2 filas de 5 casillas) en lugar de cinco hojas de diez poses: arriba la boca
    (reposo, abierta, sonrisa, risa, sorpresa), abajo el ojo (reposo, medio cerrado, enojo, guiño, sorpresa). 10 renders
    en vez de 50 y una sola imagen que leer. -> {'carpeta', 'hojas': {'resumen': ruta}, 'carpeta_temporal'}"""
    carpeta = carpeta or util.carpeta_revision(cara)
    a = render(cara, rig, M, poses=['reposo', 'boca_abierta', 'sonrisa', 'risa', 'sorpresa'], vistas=['boca'],
               carpeta=carpeta, color=color)
    b = render(cara, rig, M, poses=['reposo', 'parpadeo_medio', 'enojo', 'guino', 'sorpresa'], vistas=['ojo'],
               carpeta=carpeta, color=color)
    dest = os.path.join(carpeta, 'hoja_resumen.png')
    _apilar([a['hojas']['boca'], b['hojas']['ojo']], dest)
    for f in os.listdir(carpeta):                       # casillas sueltas y hojas intermedias: ya no hacen falta
        if f.startswith(('boca_', 'ojo_')) or f in ('hoja_boca.png', 'hoja_ojo.png'):
            try:
                os.remove(os.path.join(carpeta, f))
            except OSError:
                pass
    return {'carpeta': carpeta, 'hojas': {'resumen': dest}, 'carpeta_temporal': a['carpeta_temporal']}


def _apilar(files, dest):
    tiles = []
    for f in files:
        im = bpy.data.images.load(f, check_existing=False)
        w, h = im.size
        tiles.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    ancho = max(t.shape[1] for t in tiles)
    filas = []
    for t in tiles:                                   # en el array la fila 0 es la de abajo: la primera hoja va arriba
        if t.shape[1] < ancho:
            pad = np.ones((t.shape[0], ancho - t.shape[1], 4), np.float32)
            t = np.concatenate([t, pad], axis=1)
        filas.append(t)
    sheet = np.concatenate(filas[::-1], axis=0)
    out = bpy.data.images.new('rlb_hoja_tmp', sheet.shape[1], sheet.shape[0], alpha=True)
    out.pixels[:] = sheet.ravel()
    out.filepath_raw = dest; out.file_format = 'PNG'; out.save()
    bpy.data.images.remove(out)


# 0.6.9 (Lamine): foto de los marcadores para revisarlos a ojo ANTES de construir (un modelo pequeño no sabe leer
# coordenadas): cara de frente y de perfil con una bolita de color en cada marcador. No cambia nada del archivo.
COLOR_MARCA = {'comisura': (1, 0.1, 0.1), 'labio': (0.1, 0.5, 1), 'ojo': (0.1, 0.9, 0.2), 'mandibula': (1, 0.8, 0),
               'menton': (1, 0.4, 0), 'ceja': (0.8, 0.2, 1)}


def foto_marcadores(cara, M, carpeta=None):
    from . import marco as MK
    hw, mc = M.hw, M.mc
    ojo = M.ojo('L')[0] if M.ojos else mc + Vector((hw * 1.7, 0, hw * 3.2))
    cz = (mc.z + ojo.z) / 2
    carpeta = carpeta or util.carpeta_revision(cara)
    os.makedirs(carpeta, exist_ok=True)
    bpy.context.view_layer.update()
    sc = bpy.context.scene
    tmp, mats = [], []
    for e in [o for o in bpy.data.objects if o.name.startswith(MK.nombre_marca(cara, '')) and o.type == 'EMPTY']:
        clave = e.name[len(MK.nombre_marca(cara, '')):]
        col = next((c for k, c in COLOR_MARCA.items() if clave.startswith(k)), (1, 1, 1))
        es_ojo = clave.startswith('ojo')
        me = bpy.data.meshes.new('rlb_marca_tmp')
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8,
                                  radius=(e.empty_display_size if es_ojo else 0.12 * hw))
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('rlb_marca_tmp', me); sc.collection.objects.link(ob)
        ob.location = e.matrix_world.translation; ob.color = (*col, 0.35 if es_ojo else 1)
        ob.show_in_front = True
        tmp.append(ob)
    cam_d = bpy.data.cameras.new('rlb_cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = hw * 9
    cam = bpy.data.objects.new('rlb_cam', cam_d); sc.collection.objects.link(cam)
    r, sh = sc.render, sc.display.shading
    keep = (sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath)
    keep_sh = (sh.light, sh.color_type, sh.show_xray, sh.xray_alpha)
    files = []
    ocultos = []
    for o in bpy.data.objects:                      # solo cara y bolitas: lo demás fuera del render
        if o is not cara and o not in tmp and o is not cam and not o.hide_render:
            ocultos.append(o); o.hide_render = True
    try:
        sc.camera = cam; r.resolution_x = r.resolution_y = 480; r.resolution_percentage = 100
        r.engine = 'BLENDER_WORKBENCH'; sh.light = 'STUDIO'; sh.color_type = 'OBJECT'
        sh.show_xray = True; sh.xray_alpha = 0.75          # los marcadores de dentro (ojo, mandíbula) se ven a través
        for nom, loc, rot in (('frente', (0, mc.y - 1, cz), (90, 0, 0)),
                              ('perfil', (1, mc.y + 2 * hw, cz), (90, 0, 90))):
            cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
            r.filepath = os.path.join(carpeta, f'marcadores_{nom}.png')
            bpy.ops.render.render(write_still=True)
            files.append(r.filepath)
    finally:
        for o in ocultos:
            try: o.hide_render = False
            except Exception: pass
        sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath = keep
        sh.light, sh.color_type, sh.show_xray, sh.xray_alpha = keep_sh
        bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_d)
        for ob in tmp:
            me = ob.data; bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    dest = os.path.join(carpeta, 'hoja_marcadores.png')
    _hoja(files, dest, 2, 1)
    return dest


# 0.7.1: hoja de visemas del habla (A E I O U M-B-P F-V) de frente y de perfil, muy de cerca. Sirve para ver de un vistazo
# si la boca hace bien cada forma: labios cerrados en MBP, redondos y adelantados en O y U, abierta con dientes en A,
# diente de arriba sobre el labio de abajo en FV. No cambia nada del archivo (todo se restaura al terminar).
VISEMAS_HOJA = [('A', 'A'), ('E', 'E'), ('I', 'I'), ('O', 'O'), ('U', 'U'), ('MBP', 'MBP'), ('FV', 'FV')]

_FUENTE = {   # letras de 5x7 puntos para rotular cada casilla de la hoja
    'A': ('01110', '10001', '10001', '11111', '10001', '10001', '10001'),
    'E': ('11111', '10000', '10000', '11110', '10000', '10000', '11111'),
    'I': ('11111', '00100', '00100', '00100', '00100', '00100', '11111'),
    'O': ('01110', '10001', '10001', '10001', '10001', '10001', '01110'),
    'U': ('10001', '10001', '10001', '10001', '10001', '10001', '01110'),
    'M': ('10001', '11011', '10101', '10101', '10001', '10001', '10001'),
    'B': ('11110', '10001', '10001', '11110', '10001', '10001', '11110'),
    'P': ('11110', '10001', '10001', '11110', '10000', '10000', '10000'),
    'F': ('11111', '10000', '10000', '11110', '10000', '10000', '10000'),
    'V': ('10001', '10001', '10001', '10001', '10001', '01010', '00100'),
}


def _rotular(px, texto, escala=5, x0=10, y0=10):
    """escribe `texto` (letras de _FUENTE) en la esquina superior izquierda de la casilla px (alto, ancho, 4)."""
    h = px.shape[0]
    x = x0
    for ch in texto:
        g = _FUENTE.get(ch)
        if g is None:
            continue
        for j, fila in enumerate(g):
            for i, b in enumerate(fila):
                if b == '1':
                    ya = h - (y0 + (j + 1) * escala); yb = h - (y0 + j * escala)
                    px[ya:yb, x + i * escala:x + (i + 1) * escala] = (0.9, 0.1, 0.1, 1.0)
        x += 6 * escala


def foto_habla(cara, M, carpeta=None, lado=360, color='TEXTURE'):
    """hoja PNG: fila de arriba de frente, fila de abajo de perfil, una casilla por visema (orden de VISEMAS_HOJA).
    Aplica los pesos de biblioteca['visemas'] a los canales v_<forma> del control con su acción quitada un momento;
    al terminar devuelve todo como estaba (acción, valores de los canales, mirada, cámara, render). -> ruta del PNG."""
    from .facs import biblioteca as BI
    ctrl = BI.control(cara)
    if ctrl is None:
        raise RuntimeError('Esta cara no tiene el control FACS (termina antes la línea del rig).')
    hw, mc = M.hw, M.mc
    carpeta = carpeta or util.carpeta_revision(cara)
    os.makedirs(carpeta, exist_ok=True)
    lib = BI.cargar()['visemas']
    sc = bpy.context.scene
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    cam_d = bpy.data.cameras.new('rlb_cam'); cam_d.type = 'ORTHO'; cam_d.clip_start = 0.001; cam_d.clip_end = 1000
    cam = bpy.data.objects.new('rlb_cam', cam_d); sc.collection.objects.link(cam)
    r, sh = sc.render, sc.display.shading
    keep = (sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath, r.use_sequencer)
    keep_sh = (sh.light, sh.color_type, sh.show_object_outline, sh.show_xray)
    # estado a devolver
    vals = {k: float(ctrl[k]) for k in ctrl.keys() if k.startswith('v_') and isinstance(ctrl[k], (int, float))}
    adc = ctrl.animation_data
    act_c = adc.action if adc else None
    slot_c = adc.action_slot if (adc and act_c) else None
    adr = rig.animation_data if rig is not None else None
    act_r = adr.action if adr else None
    slot_r = adr.action_slot if (adr and act_r) else None
    pb = rig.pose.bones.get('mirada') if rig is not None else None
    loc_mirada = pb.location.copy() if pb is not None else None
    rig_oculto = rig.hide_render if rig is not None else None
    files = []
    try:
        r.resolution_x = r.resolution_y = lado; r.resolution_percentage = 100
        r.engine = 'BLENDER_WORKBENCH'; r.use_sequencer = False
        sh.light = 'STUDIO'; sh.color_type = color; sh.show_object_outline = False; sh.show_xray = False
        sc.camera = cam
        if act_c: adc.action = None
        if adr and act_r: adr.action = None
        if rig is not None: rig.hide_render = True
        vistas = (('frente', (mc.x, mc.y - 1, mc.z), (90, 0, 0), hw * 4),
                  ('perfil', (mc.x + 1, mc.y, mc.z), (90, 0, 90), hw * 5))
        for nom, loc, rot, orto in vistas:
            for clave, _ in VISEMAS_HOJA:
                BI.aplicar(cara, {'pesos': lib[clave]})
                cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]; cam_d.ortho_scale = orto
                r.filepath = os.path.join(carpeta, f'_habla_{nom}_{clave}.png')
                bpy.ops.render.render(write_still=True)
                files.append(r.filepath)
    finally:
        sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath, r.use_sequencer = keep
        sh.light, sh.color_type, sh.show_object_outline, sh.show_xray = keep_sh
        bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_d)
        if rig is not None: rig.hide_render = rig_oculto
        if pb is not None: pb.location = loc_mirada
        if adr and act_r:
            adr.action = act_r
            if slot_r is not None:
                try: adr.action_slot = slot_r
                except Exception: pass
        for k, v in vals.items():
            try: ctrl[k] = v
            except Exception: pass
        if adc and act_c:
            adc.action = act_c
            if slot_c is not None:
                try: adc.action_slot = slot_c
                except Exception: pass
        ctrl.update_tag()
        bpy.context.view_layer.update()
    # hoja: se leen las casillas, se rotulan y se juntan
    tiles = []
    for f in files:
        im = bpy.data.images.load(f, check_existing=False)
        w, h = im.size
        tiles.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    n = len(VISEMAS_HOJA)
    for i, (_, rot) in enumerate(VISEMAS_HOJA):
        _rotular(tiles[i], rot)
        _rotular(tiles[n + i], rot)
    th, tw = tiles[0].shape[:2]
    sheet = np.ones((2 * th, n * tw, 4), np.float32)
    for i, t in enumerate(tiles):
        rw, c = divmod(i, n)
        y0 = (1 - rw) * th
        sheet[y0:y0 + th, c * tw:(c + 1) * tw] = t
    dest = os.path.join(carpeta, 'hoja_habla.png')
    out = bpy.data.images.new('rlb_hoja_tmp', n * tw, 2 * th, alpha=True)
    out.pixels[:] = sheet.ravel()
    out.filepath_raw = dest; out.file_format = 'PNG'; out.save()
    bpy.data.images.remove(out)
    for f in files:
        try: os.remove(f)
        except OSError: pass
    return dest


# Hoja de párpados: el cierre en varios pasos visto de frente, de 3/4 y de perfil, muy de cerca. Es donde se
# ve si el párpado baja «roto» (picos en el borde, piel que atraviesa el globo, escalón con el inferior).
POSES_OJO = [('reposo', {}), ('abierto', {'parpado': 1.0}), ('cierre_25', {'parpado': -0.25}),
             ('cierre_50', {'parpado': -0.5}), ('cierre_75', {'parpado': -0.75}), ('cerrado', {'parpado': -1.0}),
             ('inf_arriba', {'parpado_inf': 1.0}), ('cerrado_inf', {'parpado': -1.0, 'parpado_inf': 1.0}),
             ('ceja_arriba', {'ceja_in': 1.0, 'ceja_out': 1.0}), ('ceja_ceno', {'ceja_in': -1.0, 'ceja_juntar': 1.0})]


def _pose_ojo(rig, valores, lado='L'):
    """valores = fracción del recorrido de cada control (-1..1), leída de su Limit Location."""
    for nm, f in valores.items():
        if nm == 'ceja_juntar':
            pb = rig.pose.bones.get('ceja_in.' + lado)
            c = next((c for c in pb.constraints if c.type == 'LIMIT_LOCATION'), None) if pb else None
            if c: pb.location.x = c.min_x if c.min_x < 0 else c.max_x
            continue
        pb = rig.pose.bones.get(f'{nm}.{lado}')
        if pb is None: continue
        c = next((c for c in pb.constraints if c.type == 'LIMIT_LOCATION'), None)
        if c is None: continue
        pb.location.y = (c.max_y if f > 0 else -c.min_y) * f


def render_ojos(cara, rig, M, lado='L', poses=None, carpeta=None, vistas=None, color='MATERIAL'):
    poses = poses or POSES_OJO
    piv = M.cfg.get('pivotes')
    C = (bpy.data.objects[piv[0 if lado == 'L' else 1]].matrix_world.translation.copy() if piv
         else M.ojo(lado)[0])
    R = M.ojo(lado)[1]
    sx = 1 if lado == 'L' else -1
    a34 = math.radians(40)
    V = {'frente': ((C.x, C.y - 1, C.z + 0.25 * R), (90, 0, 0), R * 4.2),
         '34': ((C.x + sx * math.sin(a34), C.y - math.cos(a34), C.z + 0.25 * R), (90, 0, sx * 40), R * 4.2),
         'perfil': ((C.x + sx * 1, C.y - 0.2 * R, C.z + 0.25 * R), (90, 0, sx * 90), R * 4.2)}
    base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
    carpeta = carpeta or util.carpeta_revision(cara)
    os.makedirs(carpeta, exist_ok=True)
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('rlb_cam'); cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('rlb_cam', cam_d); sc.collection.objects.link(cam)
    old_cam = sc.camera; sc.camera = cam
    r = sc.render
    keep = (r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath)
    sh = sc.display.shading
    keep_sh = (sh.light, sh.color_type, sh.show_object_outline)
    r.resolution_x, r.resolution_y, r.resolution_percentage = 480, 400, 100
    r.engine = 'BLENDER_WORKBENCH'; sh.light = 'STUDIO'; sh.show_object_outline = False; sh.color_type = color
    hid = rig.hide_render; rig.hide_render = True
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    hojas = {}
    try:
        for v, (loc, rot, orto) in V.items():
            if vistas and v not in vistas: continue
            files = []
            for nombre, val in poses:
                util.pose_reposo(rig)
                if callable(val): val(lado)          # 0.7.2: pose por shape keys (foto_parpadeo)
                else: _pose_ojo(rig, val, lado)
                bpy.context.view_layer.update()
                cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]; cam_d.ortho_scale = orto
                r.filepath = os.path.join(carpeta, f'_ojo_{v}_{nombre}.png')    # se sobrescriben siempre
                bpy.ops.render.render(write_still=True)
                files.append(r.filepath)
            # nombre nuevo en cada revisión (los visores guardan la imagen vieja); se borra la anterior
            for f in os.listdir(carpeta):
                if f.startswith(f'hoja_parpados_{lado}_{v}_'): os.remove(os.path.join(carpeta, f))
            dest = os.path.join(carpeta, f'hoja_parpados_{lado}_{v}_{int(time.time()) % 100000}.png')
            _hoja(files, dest, 5, 1.0)
            for f in files: os.remove(f)
            hojas[v] = dest
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
        sc.camera = old_cam
        bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_d)
        r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath = keep
        sh.light, sh.color_type, sh.show_object_outline = keep_sh
        rig.hide_render = hid
    return {'hojas': hojas, 'poses': [p[0] for p in poses]}


# Corte lateral por x = centro del ojo: piel (carne), cuenca (granate), globo y piezas del ojo (azul), lente de
# oclusión (verde) y pestañas (negro), abierto / a medias / cerrado. Se ve lo que de frente no: bordes que flotan
# delante del globo, piel que lo atraviesa, la lente por delante del párpado.
POSES_CORTE = [('abierto', {}), ('medio', {'parpado': -0.5}), ('cerrado', {'parpado': -1.0}),
               ('cerrado_inf', {'parpado': -1.0, 'parpado_inf': 1.0})]
COL_CORTE = {'piel': (0.85, 0.55, 0.42), 'cuenca': (0.55, 0.05, 0.08), 'ojo': (0.15, 0.35, 0.95),
             'lente': (0.0, 0.7, 0.2), 'pestanas': (0.0, 0.0, 0.0)}


def _malla_mundo(ob, dg):
    """(vértices en mundo, triángulos, material de cada triángulo) de la malla evaluada."""
    oe = ob.evaluated_get(dg); me = oe.to_mesh()
    me.calc_loop_triangles()
    n = len(me.vertices); co = np.zeros(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    mw = np.array(ob.matrix_world); co = co @ mw[:3, :3].T + mw[:3, 3]
    nt = len(me.loop_triangles); tv = np.zeros(nt * 3, int); me.loop_triangles.foreach_get('vertices', tv)
    tv = tv.reshape(-1, 3); mi = np.zeros(nt, int); me.loop_triangles.foreach_get('material_index', mi)
    oe.to_mesh_clear()
    return co, tv, mi


def _bvh_mundo(ob, dg, sin_mat=()):
    from mathutils.bvhtree import BVHTree
    co, tv, mi = _malla_mundo(ob, dg)
    if sin_mat: tv = tv[~np.isin(mi, list(sin_mat))]
    return BVHTree.FromPolygons([Vector(c) for c in co], tv.tolist())


def _tris_corte(ob, dg, x0):
    """segmentos (y, z) del corte de la malla evaluada por el plano x = x0, con el índice de cada triángulo."""
    co, tv, mi = _malla_mundo(ob, dg)
    d = co[:, 0] - x0
    segs, idx = [], []
    for t in np.where(~((d[tv] > 0).all(1) | (d[tv] <= 0).all(1)))[0]:
        a, b, c = tv[t]
        pts = []
        for p, q in ((a, b), (b, c), (c, a)):
            if (d[p] > 0) != (d[q] > 0):
                u = d[p] / (d[p] - d[q]); pts.append(co[p] + u * (co[q] - co[p]))
        if len(pts) == 2:
            segs.append((pts[0][1:], pts[1][1:])); idx.append(t)
    return segs, tv, mi, idx


def _pintar(img, segs, col, y0, z0, esc, grosor=1):
    H, W = img.shape[:2]
    for p, q in segs:
        L = int(max(abs(q[0] - p[0]), abs(q[1] - p[1])) * esc) + 2
        t = np.linspace(0, 1, L)[:, None]
        pts = p + t * (q - p)
        X = ((pts[:, 0] - y0) * esc).astype(int); Y = ((pts[:, 1] - z0) * esc).astype(int)
        for dx in range(grosor):
            for dy in range(grosor):
                ok = (X + dx >= 0) & (X + dx < W) & (Y + dy >= 0) & (Y + dy < H)
                img[Y[ok] + dy, X[ok] + dx, :3] = col


def corte_ojo(cara, rig, M, lado='L', poses=None, carpeta=None, px=360, dx=0.0):
    """dx: el corte se desplaza dx m hacia el rabillo (+) o el lagrimal (−) desde el centro del ojo."""
    poses = poses or POSES_CORTE
    cfg = M.cfg
    piv = cfg.get('pivotes')
    p = bpy.data.objects[piv[0 if lado == 'L' else 1]] if piv else None
    C = p.matrix_world.translation.copy() if p else M.ojo(lado)[0]
    C = C.copy(); C.x += (1 if lado == 'L' else -1) * dx
    R = M.ojo(lado)[1]
    base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
    carpeta = carpeta or util.carpeta_revision(cara)
    os.makedirs(carpeta, exist_ok=True)
    me = cara.data
    cu = np.zeros(len(me.vertices), int)
    if 'rlb_cuenca' in me.attributes: me.attributes['rlb_cuenca'].data.foreach_get('value', cu)
    pest = set(cfg.get('pestanas_sup', [])) | set(cfg.get('pestanas_inf', []))
    lente = bpy.data.objects.get(f'{cara.name}_Oclusion_{lado}')
    ojo_obs = [o for o in p.children_recursive if o.type == 'MESH'] if p else []
    L = 1.7 * R; esc = px / (2 * L)
    y0, z0 = C.y - L, C.z - L                       # delante (−Y) a la izquierda
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    tiles = []
    try:
        for nombre, val in poses:
            util.pose_reposo(rig); _pose_ojo(rig, val, lado)
            for _ in range(2): bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            img = np.ones((px, px, 4), np.float32)
            img[int((C.z - z0) * esc), :, :3] = 0.85; img[:, int((C.y - y0) * esc), :3] = 0.85    # ejes del ojo
            for o in ojo_obs:
                segs, *_ = _tris_corte(o, dg, C.x); _pintar(img, segs, COL_CORTE['ojo'], y0, z0, esc)
            segs, tv, mi, idx = _tris_corte(cara, dg, C.x)
            grupos = {'piel': [], 'cuenca': [], 'pestanas': []}
            for sg, t in zip(segs, idx):
                k = 'pestanas' if mi[t] in pest else ('cuenca' if cu[tv[t]].any() else 'piel')
                grupos[k].append(sg)
            _pintar(img, grupos['piel'], COL_CORTE['piel'], y0, z0, esc, 2)
            _pintar(img, grupos['cuenca'], COL_CORTE['cuenca'], y0, z0, esc, 2)
            if lente:
                segs, *_ = _tris_corte(lente, dg, C.x); _pintar(img, segs, COL_CORTE['lente'], y0, z0, esc)
            _pintar(img, grupos['pestanas'], COL_CORTE['pestanas'], y0, z0, esc, 2)
            img[:, :2, :3] = 0.3                        # separación entre viñetas
            tiles.append(img)
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
    sheet = np.concatenate(tiles, axis=1)
    for f in os.listdir(carpeta):
        if f.startswith(f'corte_ojo_{lado}_'): os.remove(os.path.join(carpeta, f))
    dest = os.path.join(carpeta, f'corte_ojo_{lado}_{int(time.time()) % 100000}.png')
    out = bpy.data.images.new('rlb_corte_tmp', sheet.shape[1], sheet.shape[0], alpha=True)
    out.pixels[:] = sheet.ravel(); out.filepath_raw = dest; out.file_format = 'PNG'; out.save()
    bpy.data.images.remove(out)
    return {'hoja': dest, 'poses': [p_[0] for p_ in poses],
            'colores': 'piel carne, cuenca granate, ojo azul, lente verde, pestañas negro; delante a la izquierda'}


def medir_oclusion(cara, rig, M, poses=None):
    """'delante_de_la_piel': vértices de la lente con piel entre ellos y el globo y ninguna piel por delante (se verían
    sobre el párpado): tiene que dar 0 en todas las poses. 'dentro_del_ojo': metidos en el globo (los tapa el ojo; con
    un globo elipsoide pasa al cerrar, porque el párpado gira sobre una esfera)."""
    poses = poses or POSES_CORTE
    piv = M.cfg.get('pivotes')
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    out = {}
    try:
        for nombre, val in poses:
            util.pose_reposo(rig)
            for s in ('L', 'R'): _pose_ojo(rig, val, s)
            for _ in range(2): bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            piel = _bvh_mundo(cara, dg, set(M.cfg.get('pestanas_sup', [])) | set(M.cfg.get('pestanas_inf', [])))
            for i, s in enumerate(('L', 'R')):
                lente = bpy.data.objects.get(f'{cara.name}_Oclusion_{s}')
                if lente is None: continue
                p = bpy.data.objects[piv[i]]; C = p.matrix_world.translation
                ojo = [_bvh_mundo(o, dg) for o in p.children_recursive if o.type == 'MESH']
                V, _, _ = _malla_mundo(lente, dg)
                delante = dentro = 0
                for q in V:
                    q = Vector(q); d = (q - C).normalized(); r = (q - C).length
                    # superficie del ojo en esa dirección (lo de dentro, como la bolsa de la cuenca, no cuenta)
                    hs = [h for b in ojo if (h := b.ray_cast(q + d * 0.05, -d, 0.05 + r))[0] is not None]
                    ro = max(((h[0] - C).length for h in hs), default=0.0)
                    if ro > r + 1e-6:
                        dentro += 1; continue          # dentro del globo: lo tapa el ojo (no se ve)
                    fuera = piel.ray_cast(q + d * 1e-6, d, 0.02)[0] is None
                    if fuera and piel.ray_cast(C + d * (ro + 1e-6), d, max(r - ro - 2e-6, 1e-7))[0] is not None:
                        delante += 1
                out[f'{nombre}.{s}'] = {'lente_v': len(V), 'delante_de_la_piel': delante, 'dentro_del_ojo': dentro}
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
    return out


# Cierre medido (0.6.0, Lian): abierto / medio / cerrado con la mirada al frente, arriba, abajo y a los lados.
# (a) vértices del párpado (zona + pestañas, sin la bolsa de la cuenca) DENTRO del ojo: la superficie real del ojo
#     evaluado (globo, córnea, iris: gira con la mirada) en la dirección radial de cada vértice; tiene que dar 0;
# (b) con el ojo cerrado, rayos de frente sobre la abertura que tocan el ojo antes que la piel (rendija); 0.
MIRADAS = {'frente': (0, 0), 'arriba': (0, 20), 'abajo': (0, -20), 'izq': (-25, 0), 'der': (25, 0)}
POSES_CIERRE = [('abierto', {}), ('medio', {'parpado': -0.5}), ('cerrado', {'parpado': -1.0}),
                ('cerrado_inf', {'parpado': -1.0, 'parpado_inf': 1.0}), ('entornado', {'parpado_inf': 1.0}),
                # a mano (animador): superior casi cerrado con el inferior arriba y forma de enojo / tristeza
                ('medio_inf', {'parpado': -0.7, 'parpado_inf': 1.0}),
                ('enojo_inf', {'parpado': -0.7, 'parpado_in': -1.0, 'parpado_inf': 1.0}),
                ('triste_inf', {'parpado': -0.7, 'parpado_out': -1.0, 'parpado_inf': 1.0})]


def _mirar(rig, C, h, v):
    """mirada h grados a la derecha del personaje (−X... +X = su izquierda) y v hacia arriba."""
    pb = rig.pose.bones.get('mirada')
    if pb is None: return
    dist = C.y - rig.data.bones['mirada'].head_local.y
    pb.location = (math.tan(math.radians(h)) * dist, math.tan(math.radians(v)) * dist, 0)


def _zona_parpado(cara, M, s):
    me = cara.data; n = len(me.vertices)
    g = cara.vertex_groups.get('RLB_parpados_zona')
    z = np.zeros(n, bool)
    if g:
        for v in me.vertices:
            for gg in v.groups:
                if gg.group == g.index and gg.weight > 0: z[v.index] = True
    pm = set(M.cfg.get('pestanas_sup', [])) | set(M.cfg.get('pestanas_inf', []))
    for p in me.polygons:
        if p.material_index in pm: z[list(p.vertices)] = True
    if 'rlb_cuenca' in me.attributes:
        cu = np.zeros(n, int); me.attributes['rlb_cuenca'].data.foreach_get('value', cu); z &= cu == 0
    # vértices sueltos (sus caras las borró el recorte en el globo: no se ven) fuera
    usa = np.zeros(n, bool)
    for p in me.polygons: usa[list(p.vertices)] = True
    z &= usa
    P = util.coords(me)
    return z & ((P[:, 0] > 0) if s == 'L' else (P[:, 0] < 0))


def medir_cierre(cara, rig, M, poses=None, miradas=None, rendija=True, paso=None, tol=0.00005):
    """-> {pose.mirada.lado: {dentro, hondo_mm, ojo_visible (solo cerrado)}} y 'total_dentro', 'total_visible'."""
    from mathutils.bvhtree import BVHTree
    poses = poses or POSES_CIERRE
    miradas = miradas or MIRADAS
    piv = M.cfg.get('pivotes')
    pivs = {s: bpy.data.objects[piv[i]] for i, s in enumerate(('L', 'R'))} if piv else {}
    zonas = {s: np.where(_zona_parpado(cara, M, s))[0] for s in pivs}
    from . import contacto as CT
    bordes = {s: CT._bordes(cara, M, s) for s in pivs}
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    out = {}; tot_d = tot_v = 0; cruce_max = 0.0; sep_max = 0.0
    try:
        for mn, (h, v) in miradas.items():
            for nombre, val in poses:
                util.pose_reposo(rig)
                for s in pivs: _pose_ojo(rig, val, s)
                for _ in range(2): bpy.context.view_layer.update()
                C0 = next(iter(pivs.values())).matrix_world.translation.copy()
                _mirar(rig, C0, h, v)
                for _ in range(2): bpy.context.view_layer.update()
                dg = bpy.context.evaluated_depsgraph_get()
                X, tv, _ = _malla_mundo(cara, dg)
                piel = None
                for s, p in pivs.items():
                    C = p.matrix_world.translation.copy()
                    ojos = [_bvh_mundo(o, dg) for o in p.children_recursive if o.type == 'MESH']
                    rmax = _radio_globo(p, np.array(C)) + 0.001
                    dentro = 0; hondo = 0.0
                    for i in zonas[s]:
                        q = Vector(X[i]); r = (q - C).length
                        if r > rmax or r < 1e-6: continue
                        d = (q - C) / r
                        hs = [hh for b in ojos if (hh := b.ray_cast(C + d * rmax, -d, rmax))[0] is not None]
                        ro = max(((hh[0] - C).length for hh in hs), default=0.0)
                        if ro > r + tol:
                            dentro += 1; hondo = max(hondo, ro - r)
                    rec = {'dentro': dentro, 'hondo_mm': round(hondo * 1000, 2)}
                    # bordes: cruce (el superior por debajo del inferior, de frente) y separación 3D si está cerrado
                    xs, U, L = CT._curvas(X, *bordes[s])
                    cr = float(max(0.0, -(U[:, 1] - L[:, 1]).min())) * 1000
                    rec['cruce_mm'] = round(cr, 2); cruce_max = max(cruce_max, cr)
                    if val.get('parpado', 0) <= -1.0:
                        sp = float(np.linalg.norm(U - L, axis=1).max()) * 1000
                        rec['sep3d_mm'] = round(sp, 2); sep_max = max(sep_max, sp)
                    if rendija and val.get('parpado', 0) <= -1.0:
                        if piel is None: piel = BVHTree.FromPolygons([Vector(c) for c in X], tv.tolist())
                        R = M.ojo(s)[1] * 1.1; st = paso or R / 40
                        n_ = vis = 0
                        for x in np.arange(-R, R, st):
                            for z in np.arange(-R, R, st):
                                o = Vector((C.x + x, C.y - 1, C.z + z)); dv = Vector((0, 1, 0))
                                best = min((hh[3] for b in ojos if (hh := b.ray_cast(o, dv))[0] is not None), default=None)
                                if best is None: continue
                                n_ += 1; hp = piel.ray_cast(o, dv)
                                if hp[0] is None or hp[3] > best: vis += 1
                        rec['ojo_visible'] = vis; rec['rayos'] = n_; tot_v += vis
                    tot_d += dentro
                    out[f'{nombre}.{mn}.{s}'] = rec
    finally:
        util.pose_reposo(rig)
        if act: rig.animation_data.action = act
    out['total_dentro'] = tot_d; out['total_visible'] = tot_v
    out['cruce_max_mm'] = round(cruce_max, 2); out['sep3d_max_mm'] = round(sep_max, 2)
    return out


def _radio_globo(p, C):
    R = 0.0
    for o in p.children_recursive:
        if o.type != 'MESH': continue
        V = np.array([o.matrix_world @ v.co for v in o.data.vertices])
        if len(V): R = max(R, float(np.linalg.norm(V - C, axis=1).max()))
    return R
