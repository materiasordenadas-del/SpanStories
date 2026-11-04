"""Apariencia dental: Anatómico (Rig) / Anime (Final), sin tocar geometría, rig ni expresiones.

Los dientes del personaje traen sus divisiones y su encía en una textura (atlas). El modo Anime NO cambia la malla:
cambia el material de la ranura por otro con una textura derivada donde los dientes son una banda blanca continua.

La delimitación diente/encía no depende del color en el momento del cambio. Se calcula UNA vez a partir de la textura
anatómica original (color + silueta de cada diente + huella UV de la malla) y se guarda como imagen-máscara en espacio UV
(`RLB_mascara_dientes_<pieza>_<n>`), junto a la textura anime. La máscara sigue ahí aunque se cambie la textura activa.

Exportación: el material Anime es un Principled normal con UVMap → Mapping → Imagen (se exporta a glTF como textura con
KHR_texture_transform); no usa nodos exclusivos de Blender. El material anatómico original no se modifica ni se borra.
"""
import contextlib
import json
import bpy
import numpy as np
from bpy.props import EnumProperty

CLAVE = 'rlb_dental'                 # en el objeto: JSON con las ranuras preparadas
PROP = 'rlb_apariencia_dental'       # en la escena
BLANCO = (0.967, 0.967, 0.953)       # sRGB codificado (≈ 0,93 / 0,93 / 0,90 lineal, como las bandas de Vale)
ROUGH = 0.4
SUAVIZADO = 4                        # píxeles de punta de papila que se cierran (0 = límite exacto de la textura; más = borde menos dentado)
_error = ['']
_aplicando = [False]


# ------------------------------------------------------------------ piezas
def _nombre_diente(o):
    n = o.name.casefold()
    return any(p in n for p in ('diente', 'teeth', 'tooth'))


def piezas(todas=False):
    """mallas dentales de la escena: visibles, o también las ya preparadas aunque estén ocultas."""
    out = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        if o.get(CLAVE):
            out.append(o)
        elif _nombre_diente(o) and (todas or not o.hide_viewport and not o.hide_get()):
            out.append(o)
    return out


def _datos(o):
    try:
        return json.loads(o.get(CLAVE, '{}'))
    except ValueError:
        return {}


# ------------------------------------------------------------------ textura del material
def _imagen_color(mat):
    """imagen sRGB que alimenta el Base Color (primera entrada de color de cada mezcla)."""
    if not mat or not mat.use_nodes:
        return None
    pr = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if pr is None:
        return None
    visto = set()

    def buscar(sock):
        for l in sock.links:
            n = l.from_node
            if n.name in visto:
                continue
            visto.add(n.name)
            if n.type == 'TEX_IMAGE':
                return n.image
            for s in n.inputs:
                r = buscar(s)
                if r is not None:
                    return r
        return None
    return buscar(pr.inputs['Base Color'])


# ------------------------------------------------------------------ raster / máscara
def _rellenar(tris, w, h):
    """triángulos en píxeles de la recorte → bool (h, w)."""
    out = np.zeros((h, w), bool)
    for a, b, c in tris:
        x0, x1 = int(max(np.floor(min(a[0], b[0], c[0])) - 1, 0)), int(min(np.ceil(max(a[0], b[0], c[0])) + 1, w))
        y0, y1 = int(max(np.floor(min(a[1], b[1], c[1])) - 1, 0)), int(min(np.ceil(max(a[1], b[1], c[1])) + 1, h))
        if x1 <= x0 or y1 <= y0:
            continue
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / den
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / den
        e = 0.5 / max(np.hypot(b[0] - a[0], b[1] - a[1]), 1.0)
        out[y0:y1, x0:x1] |= (l1 >= -e) & (l2 >= -e) & (1 - l1 - l2 >= -e)
    return out


def _otsu(v, bins=64):
    hist, edges = np.histogram(v, bins=bins, range=(0.0, 1.0))
    tot = hist.sum()
    if tot == 0:
        return 0.2
    p = hist / tot
    c = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(p); m = np.cumsum(p * c); mt = m[-1]
    with np.errstate(divide='ignore', invalid='ignore'):
        sb = (mt * w0 - m) ** 2 / (w0 * (1 - w0))
    return float(c[np.nanargmax(np.nan_to_num(sb))])


def _abrir(m):
    """apertura 3×3: quita motas aisladas."""
    p = np.pad(m, 1)
    e = np.ones_like(m)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            e &= p[dy:dy + m.shape[0], dx:dx + m.shape[1]]
    p = np.pad(e, 1)
    d = np.zeros_like(m)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            d |= p[dy:dy + m.shape[0], dx:dx + m.shape[1]]
    return d


def _cerrar(m, eje, k):
    """cierre 1D: rellena los huecos de hasta k píxeles entre dos píxeles de diente a lo largo de `eje`."""
    if eje == 1:
        return _cerrar(m.T, 0, k).T
    n = m.shape[0]
    idx = np.arange(n)[:, None]
    ant = np.maximum.accumulate(np.where(m, idx, -1), axis=0)
    sig = np.minimum.accumulate(np.where(m, idx, n + 10 ** 6)[::-1], axis=0)[::-1]
    return m | ((ant >= 0) & (sig < n) & (sig - ant - 1 <= k))


def _banda(T, F, suave=SUAVIZADO):
    """T: píxeles de diente, F: huella de la isla (eje largo primero = filas; los dientes se suceden por filas).
    Quita las líneas que separan los dientes cerrando, columna a columna, los huecos del grosor de esas líneas. Los huecos
    más anchos (las papilas de encía entre dos dientes, junto al borde gingival) no se cierran: el blanco se queda en el
    límite real del diente. `suave` (px) cierra además la punta de cada papila para que el borde
    gingival no quede dentado; 0 = límite exacto de la textura. Nunca sale de la huella de la malla ni pasa del primer/
    último diente."""
    tiene = T.any(1)
    if not tiene.any():
        return np.zeros_like(T)
    filas = np.nonzero(tiene)[0]
    seg = tiene[filas[0]:filas[-1] + 1].astype(np.int8)
    tramos = np.split(seg, np.nonzero(np.diff(seg))[0] + 1)
    huecos = [len(r) for r in tramos if r[0] == 0] or [0]
    k = max(huecos) + 2
    k += int(suave)
    out = _cerrar(T, 0, k)                      # líneas entre dientes (+ punta de las papilas)
    out = _cerrar(out, 1, 4)                   # motas y brillos dentro del diente
    return out & F


def _suavizar(m):
    p = np.pad(m.astype(np.float32), 1, mode='edge')
    h, w = m.shape
    s = sum(p[dy:dy + h, dx:dx + w] for dy in (0, 1, 2) for dx in (0, 1, 2)) / 9.0
    return np.where(m, np.maximum(s, 0.5), np.minimum(s, 0.5))      # borde suave que no encoge ni invade


def _islas(me, poly_ids):
    """agrupa polígonos que comparten vértice y UV (islas UV)."""
    uv = me.uv_layers.active.data
    padre = {p: p for p in poly_ids}

    def raiz(a):
        while padre[a] != a:
            padre[a] = padre[padre[a]]
            a = padre[a]
        return a
    claves = {}
    for p in poly_ids:
        for l in me.polygons[p].loop_indices:
            k = (me.loops[l].vertex_index, round(uv[l].uv[0], 5), round(uv[l].uv[1], 5))
            if k in claves:
                padre[raiz(p)] = raiz(claves[k])
            else:
                claves[k] = p
    g = {}
    for p in poly_ids:
        g.setdefault(raiz(p), []).append(p)
    return list(g.values())


def _px(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def _imagen_nueva(nombre, w, h, rgb, cs):
    viejo = bpy.data.images.get(nombre)
    if viejo:
        bpy.data.images.remove(viejo)
    im = bpy.data.images.new(nombre, w, h, alpha=False)
    im.colorspace_settings.name = cs
    buf = np.ones((h, w, 4), np.float32)
    buf[..., :3] = rgb
    im.pixels.foreach_set(buf.ravel())
    im.pack()
    im.use_fake_user = True
    return im


def _material_anime(nombre, imagen, uvname, u0, v0, du, dv, original):
    viejo = bpy.data.materials.get(nombre)
    if viejo:
        bpy.data.materials.remove(viejo)
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    salida = nt.nodes.new('ShaderNodeOutputMaterial'); salida.location = (500, 0)
    pr = nt.nodes.new('ShaderNodeBsdfPrincipled'); pr.location = (200, 0)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = uvname; uv.location = (-600, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.vector_type = 'POINT'; mp.location = (-400, 0)
    mp.inputs['Location'].default_value = (-u0 / du, -v0 / dv, 0.0)
    mp.inputs['Scale'].default_value = (1.0 / du, 1.0 / dv, 1.0)
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = imagen; tx.interpolation = 'Linear'
    tx.extension = 'EXTEND'; tx.location = (-150, 0)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
    nt.links.new(tx.outputs['Color'], pr.inputs['Base Color'])
    nt.links.new(pr.outputs['BSDF'], salida.inputs['Surface'])
    pr.inputs['Roughness'].default_value = ROUGH
    pr.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = original.use_backface_culling
    m['rlb_dental_anatomico'] = original.name
    m.use_fake_user = True
    return m


# ------------------------------------------------------------------ preparación (una vez por pieza)
def preparar(obj, rehacer=False):
    """crea máscara UV + textura anime + material anime de cada ranura con textura. Devuelve el diccionario guardado."""
    me = obj.data
    if not me.uv_layers.active:
        raise ValueError(f'{obj.name} no tiene UV')
    previo = _datos(obj)
    ranuras = {} if rehacer else previo
    me.calc_loop_triangles()
    uvl = me.uv_layers.active
    for i, mat in enumerate(me.materials):
        if str(i) in ranuras and bpy.data.materials.get(ranuras[str(i)]['anime']):
            continue
        orig = mat
        if rehacer and str(i) in previo:
            orig = bpy.data.materials.get(previo[str(i)]['anatomico']) or mat
        img = _imagen_color(orig)
        polys = [p.index for p in me.polygons if p.material_index == i]
        if img is None or not polys:
            continue
        W, H = img.size
        px = _px(img)
        coords = np.array([uvl.data[l].uv[:] for p in polys for l in me.polygons[p].loop_indices], np.float64)
        x0 = int(max(np.floor(coords[:, 0].min() * W) - 2, 0)); x1 = int(min(np.ceil(coords[:, 0].max() * W) + 2, W))
        y0 = int(max(np.floor(coords[:, 1].min() * H) - 2, 0)); y1 = int(min(np.ceil(coords[:, 1].max() * H) + 2, H))
        w, h = x1 - x0, y1 - y0
        if w < 4 or h < 4:
            continue
        crop = px[y0:y1, x0:x1, :3].copy()
        mx, mn = crop.max(2), crop.min(2)
        sat = (mx - mn) / np.maximum(mx, 1e-4)
        islas = _islas(me, polys)
        huellas = []
        for isl in islas:
            sset = set(isl)
            tris = []
            for t in me.loop_triangles:
                if t.polygon_index in sset:
                    tris.append([((uvl.data[l].uv[0] * W - x0), (uvl.data[l].uv[1] * H - y0)) for l in t.loops])
            huellas.append(_rellenar(tris, w, h))
        total = np.zeros((h, w), bool)
        for f in huellas:
            total |= f
        umbral = min(max(_otsu(sat[total]), 0.08), 0.45)
        diente = (sat < umbral) & (mx > 0.35) & total
        diente = _abrir(diente) & total
        banda = np.zeros((h, w), bool)
        for f in huellas:
            ys, xs = np.nonzero(f)
            if len(ys) == 0:
                continue
            ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            T = (diente & f)[ya:yb, xa:xb]
            F = f[ya:yb, xa:xb]
            if (yb - ya) < (xb - xa):                              # eje largo primero
                b = _banda(T.T, F.T).T
            else:
                b = _banda(T, F)
            banda[ya:yb, xa:xb] |= b
        if not banda.any():
            continue
        m = _suavizar(banda) * total.astype(np.float32)
        blanco = np.array(BLANCO, np.float32)
        anime = crop * (1 - m[..., None]) + blanco * m[..., None]
        base = f'{obj.name}_{i}'
        nm_m = f'RLB_mascara_dientes_{base}'
        nm_a = f'RLB_anime_dientes_{base}'
        _imagen_nueva(nm_m, w, h, np.repeat(m[..., None], 3, 2), 'Non-Color')
        im_a = _imagen_nueva(nm_a, w, h, anime, 'sRGB')
        nm_mat = f'RLB_Dientes_Anime_{base}'
        _material_anime(nm_mat, im_a, uvl.name, x0 / W, y0 / H, w / W, h / H, orig)
        ranuras[str(i)] = {'anatomico': orig.name, 'anime': nm_mat, 'mascara': nm_m, 'textura': nm_a,
                           'umbral': round(umbral, 3), 'banda_px': int(banda.sum()), 'huella_px': int(total.sum())}
    obj[CLAVE] = json.dumps(ranuras)
    return ranuras


# ------------------------------------------------------------------ cambio de modo
def _poner(obj, modo):
    n = 0
    for k, d in _datos(obj).items():
        i = int(k)
        if i >= len(obj.material_slots):
            continue
        mat = bpy.data.materials.get(d['anime'] if modo == 'ANIME' else d['anatomico'])
        if mat is not None and obj.material_slots[i].material is not mat:
            obj.material_slots[i].material = mat
            n += 1
    return n


def aplicar_modo(modo, rehacer=False):
    """cambia todas las piezas dentales. No toca geometría, huesos, shape keys ni acciones."""
    _error[0] = ''
    objs = piezas()
    if not objs:
        raise ValueError('No hay dientes en la escena')
    hechas = 0
    for o in objs:
        if modo == 'ANIME' and (rehacer or not _datos(o)):
            preparar(o, rehacer=rehacer)
        if _poner(o, modo):
            hechas += 1
        o.data.update_tag()
    if modo == 'ANIME' and not any(_datos(o) for o in objs):
        raise ValueError('Los dientes no tienen textura con divisiones: el aspecto ya es liso, no hace falta el modo Anime')
    return hechas


@contextlib.contextmanager
def anatomico():
    """el sistema trabaja con las referencias anatómicas (revisión, interior, expresiones): vuelve a Anatómico y restaura
    el modo que tenía el usuario al terminar."""
    sc = bpy.context.scene
    previo = getattr(sc, PROP, 'ANATOMICO')
    cambiado = False
    try:
        if previo == 'ANIME':
            _aplicando[0] = True
            try:
                aplicar_modo('ANATOMICO'); setattr(sc, PROP, 'ANATOMICO'); cambiado = True
            finally:
                _aplicando[0] = False
        yield
    finally:
        if cambiado:
            _aplicando[0] = True
            try:
                aplicar_modo('ANIME'); setattr(sc, PROP, 'ANIME')
            except Exception as e:
                _error[0] = str(e)
            finally:
                _aplicando[0] = False


# ------------------------------------------------------------------ interfaz
def _cambiar(self, context):
    if _aplicando[0]:
        return
    modo = getattr(self, PROP)
    try:
        aplicar_modo(modo)
    except Exception as e:
        _error[0] = str(e)
        _aplicando[0] = True
        try:
            setattr(self, PROP, 'ANATOMICO')
            aplicar_modo('ANATOMICO')
        except Exception:
            pass
        finally:
            _aplicando[0] = False


class RLB_OT_dientes_mascara(bpy.types.Operator):
    bl_idname = 'rlb.dientes_mascara'
    bl_label = 'Rehacer máscara dental'
    bl_description = ('Vuelve a calcular la máscara diente/encía desde la textura anatómica original y regenera la textura Anime. '
                      'No cambia la malla ni el material anatómico')
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        try:
            modo = getattr(context.scene, PROP)
            _aplicando[0] = True
            try:
                aplicar_modo('ANATOMICO')
                for o in piezas(todas=True):
                    if _datos(o) or o in piezas():
                        preparar(o, rehacer=True)
                aplicar_modo(modo)
            finally:
                _aplicando[0] = False
            _error[0] = ''
        except Exception as e:
            _error[0] = str(e)
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        return {'FINISHED'}


class RLB_PT_apariencia_dental(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Rig labial'
    bl_label = 'Apariencia dental'
    bl_order = 5

    @classmethod
    def poll(cls, context):
        return bool(piezas())

    def draw(self, context):
        lay = self.layout
        r = lay.row()
        r.scale_y = 1.5
        r.prop(context.scene, PROP, expand=True)
        modo = getattr(context.scene, PROP)
        from .asistente import _parrafo
        if modo == 'ANIME':
            _parrafo(lay, context, 'Anime: dientes como banda blanca lisa. Es solo el material; la malla, el rig y las expresiones son los mismos.', 'INFO')
        else:
            _parrafo(lay, context, 'Anatómico: textura original con dientes y encías. Úsalo para ajustar expresiones.', 'INFO')
        if _error[0]:
            _parrafo(lay, context, _error[0], 'ERROR', alert=True)
        if any(_datos(o) for o in piezas()):
            lay.operator('rlb.dientes_mascara', icon='FILE_REFRESH')


CLASES = (RLB_OT_dientes_mascara, RLB_PT_apariencia_dental)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Scene.rlb_apariencia_dental = EnumProperty(
        name='Apariencia dental',
        items=[('ANATOMICO', 'Anatómico (Rig)', 'Textura original de dientes y encías, para trabajar el rig y las expresiones', 'MESH_DATA', 0),
               ('ANIME', 'Anime (Final)', 'Dientes como banda blanca continua; encías y malla intactas. Para ver y exportar', 'SHADING_RENDERED', 1)],
        default='ANATOMICO', update=_cambiar)


def unregister():
    del bpy.types.Scene.rlb_apariencia_dental
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
