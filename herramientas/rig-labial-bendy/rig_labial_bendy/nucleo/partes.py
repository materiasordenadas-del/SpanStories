# Inspección rápida: qué trae la malla de Tripo en la cara y con qué nombre.
#  Tripo suele traer en UNA malla: piel, medio globo de cada ojo (pegado a la piel), dientes (a veces pared
#  pegada a los labios, a veces islas), cavidad de la boca, lengua, cejas (sueltas o pegadas), mechones.
#  - clasificar: grupos de vértices RLB_<parte> + atributo de color RLB_partes (hoja de colores).
#  - separar_ceja_pegada: si una ceja es isla y la otra está pegada a la piel, la pegada se recorta con la
#    otra en espejo y se tapa el hueco de debajo (las dos se riggean igual).
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector
from . import util, marco as MK, ojos_esculpidos as OE

COLORES = {'piel': (0.80, 0.80, 0.80), 'ojo_tripo.L': (0.15, 0.35, 0.95), 'ojo_tripo.R': (0.15, 0.55, 0.95),
           'dientes_tripo': (0.95, 0.95, 0.20), 'dientes': (1.0, 0.85, 0.1), 'lengua': (0.95, 0.25, 0.30),
           'cavidad': (0.45, 0.10, 0.15), 'ceja.L': (0.45, 0.25, 0.10), 'ceja.R': (0.60, 0.35, 0.10),
           'pestanas': (0.1, 0.1, 0.1), 'mechon': (0.65, 0.20, 0.85), 'otros': (0.35, 0.75, 0.40)}


def _islas_uv_en(bm, caras):
    """islas UV (caras unidas por aristas con la misma UV a los dos lados) dentro de `caras`. -> [set de BMFace]."""
    uv = bm.loops.layers.uv.active
    if uv is None:
        return []
    caras = set(caras); hecho = set(); out = []
    for f0 in caras:
        if f0 in hecho: continue
        isla = {f0}; hecho.add(f0); st = [f0]
        while st:
            f = st.pop(); uf = {l.vert: l[uv].uv for l in f.loops}
            for e in f.edges:
                for g in e.link_faces:
                    if g is f or g in hecho or g not in caras: continue
                    ug = {l.vert: l[uv].uv for l in g.loops}
                    if all((uf[v] - ug[v]).length < 1e-5 for v in e.verts):
                        hecho.add(g); isla.add(g); st.append(g)
        out.append(isla)
    return out


def separar_ceja_pegada(cara, M, solo_buscar=False):
    """-> {'separada': lado, 'caras': n, 'metodo'} o {} si no hace falta. solo_buscar -> (lado, vértices) o None.
    0.8.43 (Pegazo): el espejo es respecto al centro de la cara (M.cx), no a x = 0: con la cara 4 mm descentrada no
    encontraba la ceja, el párpado la arrastraba al cerrar y la piel de debajo salía como una solapa. Si la malla no
    es simétrica (espejo a más de 1 mm), la ceja pegada se busca como ISLA UV propia dentro de la piel."""
    cfg = MK.cfg(cara); cj = cfg.get('cejas', {})
    lados = [s for s in ('L', 'R') if cj.get(s, -1) is not None and cj.get(s, -1) >= 0]
    if len(lados) != 1:
        return None if solo_buscar else {}
    suelta = lados[0]; pegada = 'R' if suelta == 'L' else 'L'
    sx = 1 if pegada == 'L' else -1
    me = cara.data
    if me.shape_keys and not solo_buscar:
        cara.shape_key_clear()
    if not solo_buscar:
        util.asegurar_orig(me)                      # las copias del borde heredan su original
    isl = util.islas(me); face = isl == isl[cfg['seed']]; kc = isl[cj[suelta]]
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    bf = [f for f in bm.faces if isl[f.verts[0].index] == kc]
    C = np.array([f.calc_center_median()[:] for f in bf]); N = np.array([f.normal[:] for f in bf])
    C[:, 0] = 2 * M.cx - C[:, 0]; N[:, 0] *= -1
    kd = util.kd_de(C, np.arange(len(C)))
    E = M.se()

    def en_piel(f):
        return all(v.index < len(face) and face[v.index] for v in f.verts)

    def ok(f, tol):
        if not en_piel(f): return False
        c = f.calc_center_median()
        if sx * (c.x - M.cx) <= 0: return False
        _, j, dd = kd.find(c)
        return dd < tol and f.normal.dot(Vector(N[j])) > 0.6
    sel = {f for f in bm.faces if ok(f, 0.0012 * E)}
    st = list(sel)
    while st:
        f = st.pop()
        for e in f.edges:
            for g in e.link_faces:
                if g not in sel and ok(g, 0.003 * E):
                    sel.add(g); st.append(g)
    metodo = 'espejo'
    # la isla UV de la piel, de ese lado, que en espejo cae sobre la ceja suelta y tiene su tamaño, manda: su borde es
    # el que dibujó el artista (el espejo en una malla asimétrica cortaba la ceja a medias: Pegazo 72 de 213 vértices)
    lado = [f for f in bm.faces if en_piel(f) and sx * (f.calc_center_median().x - M.cx) > 0]
    mejor = None
    for isla in _islas_uv_en(bm, lado):
        if not 0.5 * len(bf) <= len(isla) <= 2.0 * len(bf): continue
        d = np.array([kd.find(f.calc_center_median())[2] for f in isla])
        cerca = float((d < 0.006 * E).mean()); med = float(np.median(d))
        if cerca > 0.7 and med < 0.004 * E and (mejor is None or med < mejor[0]):
            mejor = (med, isla)
    if mejor is not None:
        sel, metodo = mejor[1], 'isla_uv'
    if len(sel) < 0.4 * len(bf):
        bm.free(); return None if solo_buscar else {'separada': None, 'caras': len(sel)}
    if solo_buscar:
        r = (pegada, sorted({v.index for f in sel for v in f.verts})); bm.free(); return r
    # aristas con caras de fuera (también las no manifold, de 3 o más caras)
    borde = list({e for f in sel for e in f.edges if any(g not in sel for g in e.link_faces)})
    if borde:
        bmesh.ops.split_edges(bm, edges=borde)
    # 0.8.43 (Pegazo): la ceja puede tocar la piel solo por vértices sueltos (sin aristas comunes): se parten también
    sueltos = 0
    for v in list({v for f in sel for v in f.verts}):
        if v.is_valid and any(g not in sel for g in v.link_faces):
            es = [e for e in v.link_edges if e.link_faces and all(g in sel for g in e.link_faces)]
            if es:
                bmesh.utils.vert_separate(v, es); sueltos += 1
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    # tapa el hueco de la piel de debajo (lazo de borde que no pertenece a la ceja)
    selv = {v for f in sel for v in f.verts}
    kb = util.kd_de(np.array([v.co[:] for v in selv]), np.arange(len(selv)))
    junto = lambda v: kb.find(v.co)[2] < 1e-6        # copia de la piel en el mismo sitio que el borde de la ceja
    hueco = [e for e in bm.edges if e.is_boundary and not any(v in selv for v in e.verts)
             and all(junto(v) for v in e.verts)]
    tapa = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=hueco)['geom'] if hueco else []
    tapa = [g for g in tapa if isinstance(g, bmesh.types.BMFace)]
    if tapa:
        bmesh.ops.recalc_face_normals(bm, faces=tapa)
        if sum(f.normal.y for f in tapa) > 0:                 # la tapa mira hacia delante, como la piel
            bmesh.ops.reverse_faces(bm, faces=tapa)
    semilla = next(iter(selv)).index
    bm.to_mesh(me); bm.free(); me.update()
    cj[pegada] = int(semilla); cfg['cejas'] = cj; MK.guardar_cfg(cara, cfg)
    isl2 = util.islas(me)
    if isl2[semilla] == isl2[cfg['seed']]:
        raise RuntimeError(f'La ceja {pegada} sigue unida a la piel tras separarla.')
    return {'separada': pegada, 'caras': len(sel), 'tapa': len(tapa), 'borde_hueco': len(hueco), 'metodo': metodo,
            'vertices_sueltos': sueltos}


def clasificar(cara, M):
    """grupos RLB_<parte> en la cara. -> {parte: nº de vértices}."""
    from . import malla
    me = cara.data; cfg = MK.cfg(cara)
    P = util.coords(me); isl = util.islas(me); n = len(P)
    hw = M.hw; mc = np.array(M.mc)
    k_piel = isl[cfg['seed']]; face = isl == k_piel
    partes = {}
    # dentro de la isla de la piel: medio globo de Tripo y pared de dientes (antes de borrarlos)
    if not cfg.get('ojos_abiertos'):
        for s, (C, R, *_) in OE.buscar_en_malla(me, P, face, M.mc, hw).items():
            bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
            partes['ojo_tripo.' + s] = sorted({v.index for f in OE._bulto(bm, C, R) for v in f.verts}); bm.free()
    fd = malla.quitar_dientes_tripo(cara, M, solo_buscar=True)
    if fd:
        partes['dientes_tripo'] = sorted({v for i in fd for v in me.polygons[i].vertices})
    cp = separar_ceja_pegada(cara, M, solo_buscar=True)
    if cp:
        partes['ceja.' + cp[0]] = cp[1]
    # 0.6.9: pestañas = ISLAS en arco junto al globo (pestanas_tripo.buscar). Se nombran aquí, en el inventario, y
    # quitar_pestanas borra lo que lleva ese nombre (nunca caras de la piel)
    if M.ojos:
        from . import pestanas_tripo as PT
        hall, _ = PT.buscar(me, {s: (np.array(M.ojo(s)[0]), M.ojo(s)[1]) for s in ('L', 'R')}, P)
        for s, r in hall.items():
            ids = [int(v) for f in ('sup', 'inf') for i in r[f] for v in i['vertices']]
            if ids:
                partes['pestanas.' + s] = ids
    # islas
    cj = cfg.get('cejas', {})
    k_ceja = {isl[v]: 'ceja.' + s for s, v in cj.items() if v is not None and v >= 0}
    ojo_z = M.ojo('L')[0].z if M.ojos else mc[2] + 3.6 * hw
    R_ojo = M.ojo('L')[1] if M.ojos else 1.1 * hw
    ya = np.zeros(n, bool)                 # 0.6.9: un ojo de Tripo que es isla suelta (Carlitos R) salía «mechon»
    for l in partes.values():
        ya[l] = True
    for k in np.unique(isl):
        if k == k_piel: continue
        ids = np.where(isl == k)[0]
        if len(ids) < 4 or ya[ids].mean() > 0.5: continue
        q = (P[ids] - mc) / hw; lo, hi = q.min(0), q.max(0); c = (lo + hi) / 2
        if k in k_ceja: nom = k_ceja[k]
        elif abs(c[0]) < 1.5 and abs(c[2]) < 1.3 and -0.5 < c[1] < 3.5:
            ancho = hi[0] - lo[0]
            if lo[0] < -0.3 < 0.3 < hi[0] and (hi[1] - lo[1]) > 1.2 and ancho > 1.2 and lo[2] < -0.3 < 0.3 < hi[2]:
                nom = 'cavidad'
            elif c[2] < 0.1 and (hi[1] - lo[1]) > 0.8 * ancho:
                nom = 'lengua'
            else:
                nom = 'dientes'
        elif (hi[2] * hw + mc[2] > ojo_z + 0.5 * R_ojo and lo[2] * hw + mc[2] < ojo_z + 0.6 * R_ojo
              and abs(c[0]) < 2.5 and lo[1] < (M.ojo('L')[0].y - mc[1]) / hw + 0.5 if M.ojos else False):
            nom = 'mechon'
        else:
            nom = 'otros'
        partes.setdefault(nom, []).extend(ids.tolist())
    usados = set(v for k, l in partes.items() for v in l)
    # inventario: CADA isla con su nombre (la de más vértices de ese nombre manda; la piel es la de la semilla)
    nombre_v = {}
    for nom, l in partes.items():
        for v in l:
            nombre_v[v] = nom
    inv = []
    con_caras = np.zeros(n, bool)
    for p in me.polygons:
        con_caras[p.vertices[0]] = True
    z_ojo = ojo_z
    for k in np.unique(isl):
        ids = np.where(isl == k)[0]
        if not con_caras[ids].any():          # vértices sueltos que dejan las caras borradas: no son piezas
            continue
        if k == k_piel:
            nom = 'piel'
        else:
            noms = [nombre_v.get(int(v), 'otros') for v in ids]
            nom = max(set(noms), key=noms.count)
            if nom == 'otros':
                zz = P[ids, 2]
                if zz.min() > z_ojo - 0.5 * R_ojo:
                    nom = 'pelo'
                elif zz.max() < mc[2] - 4.0 * hw:
                    nom = 'cuerpo'
        inv.append({'isla': int(k), 'semilla': int(ids[0]), 'n': int(len(ids)), 'nombre': nom})
    cfg['islas'] = sorted(inv, key=lambda i: -i['n'])
    partes['piel'] = [i for i in np.where(face)[0].tolist() if i not in usados]
    # escribir grupos y colores
    for g in [g for g in cara.vertex_groups if g.name.startswith('RLB_')]:
        cara.vertex_groups.remove(g)
    col = np.tile(np.array([0.3, 0.3, 0.3, 1.0]), (n, 1))
    for nom, l in partes.items():
        if not l: continue
        cara.vertex_groups.new(name='RLB_' + nom).add(l, 1.0, 'REPLACE')
        col[l, :3] = COLORES.get(nom, (0.3, 0.3, 0.3))
    a = me.color_attributes.get('RLB_partes') or me.color_attributes.new('RLB_partes', 'FLOAT_COLOR', 'POINT')
    a.data.foreach_set('color', col.ravel())
    cfg['partes'] = {k: len(v) for k, v in partes.items()}; MK.guardar_cfg(cara, cfg)
    return cfg['partes']


def vertices_de(cara, nombres):
    """vértices de las partes con esos nombres (grupos RLB_<nombre> que dejó clasificar). -> {nombre: [índices]}"""
    out = {}
    for nom in nombres:
        g = cara.vertex_groups.get('RLB_' + nom)
        if g is None:
            continue
        gi = g.index
        ids = [v.index for v in cara.data.vertices if any(e.group == gi for e in v.groups)]
        if ids:
            out[nom] = ids
    return out


def resumen_islas(cara):
    """{nombre: [nº de islas, vértices]} del inventario de la detección (cfg['islas'])."""
    out = {}
    for i in MK.cfg(cara).get('islas', []):
        a = out.setdefault(i['nombre'], [0, 0]); a[0] += 1; a[1] += i['n']
    return out


def foto(cara, M, ruta=None):
    """render de frente con los colores de las partes -> ruta del PNG."""
    me = cara.data
    if 'RLB_partes' not in me.color_attributes:
        return None
    base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
    ruta = ruta or util.carpeta_revision(cara, 'partes.png')
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    sc = bpy.context.scene; r = sc.render; sh = sc.display.shading
    keep = (r.resolution_x, r.resolution_y, r.engine, r.filepath, sh.light, sh.color_type, sc.camera)
    act = me.color_attributes.active_color_name if hasattr(me.color_attributes, 'active_color_name') else None
    me.color_attributes.active_color = me.color_attributes['RLB_partes']
    cam_d = bpy.data.cameras.new('rlb_cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = M.hw * 11
    cam = bpy.data.objects.new('rlb_cam', cam_d); sc.collection.objects.link(cam)
    oz = M.ojo('L')[0].z if M.ojos else M.mc.z + 3.6 * M.hw
    cam.location = (0, M.mc.y - 1, (M.mc.z + oz) / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
    try:
        sc.camera = cam; r.resolution_x, r.resolution_y = 640, 640; r.engine = 'BLENDER_WORKBENCH'
        sh.light = 'FLAT'; sh.color_type = 'VERTEX'; r.filepath = ruta
        bpy.ops.render.render(write_still=True)
    finally:
        r.resolution_x, r.resolution_y, r.engine, r.filepath, sh.light, sh.color_type, sc.camera = keep
        bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_d)
        if act and act in me.color_attributes: me.color_attributes.active_color = me.color_attributes[act]
    return ruta
