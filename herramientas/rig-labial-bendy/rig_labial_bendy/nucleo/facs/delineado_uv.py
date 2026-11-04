# Delineado del párpado por UV (0.6.4): el delineado es COLOR de la propia piel del párpado, no otra malla.
# La franja de piel junto al borde del párpado superior recibe su propio material y su propia UV (u = a lo largo
# del borde, v = distancia al borde, con signo) y una textura pequeña y nítida: piel + línea oscura. Al ser la
# misma piel, sigue sola al parpadeo, a los huesos y a las shape keys, y en GLB es una textura normal
# (baseColorTexture). Sustituye a la cinta de delineado.py (otra malla rehecha en cada key, que se arrugaba).
# Reversible: UV y materiales originales de esas caras se guardan en cara['facs_delineado_uv'] (quitar()); no en
# atributos de la malla: un atributo FLOAT2 de esquina sale en el GLB como TEXCOORD_1.
import bpy
import numpy as np
from .geometria import basis


# perfil del delineado (× radio del globo) en t = lagrimal, 0,25, 0,5, 0,8, rabillo
ESTILOS = {   # de las referencias del usuario (2026-10-20): línea del párpado de arriba, sin pestañas sueltas.
    # grosor × r en t = (lagrimal, .25, .5, .8, rabillo). El usuario NO quiere puntas ni colitas en el rabillo: la línea
    # sigue el borde del párpado y acaba en él, redondeada (ala/sube quedan a 0; se pueden pasar a mano).
    'anime': dict(grosor=(0.035, 0.120, 0.160, 0.200, 0.170), color=(0.008, 0.007, 0.009), ala=0.0, sube=0.0),   # rubio
    'marcado': dict(grosor=(0.030, 0.110, 0.140, 0.170, 0.140), color=(0.020, 0.012, 0.010), ala=0.0, sube=0.0),  # pelirrojo
    'fino': dict(grosor=(0.020, 0.090, 0.110, 0.120, 0.080), color=(0.035, 0.020, 0.014), ala=0.0, sube=0.0),     # rizado
}


def _curva(o, B, K, n=240, ext=0.2):
    """borde superior suavizado: puntos C (n, 3) con su t (lagrimal 0 → rabillo 1), alargado `ext` por los dos
    lados siguiendo la tangente (las caras de los rabillos también necesitan su u)."""
    from .delineado import _curva_t
    M = K.zona[o.borde_sup]
    x = (B[M] - o.c) @ K.X
    tb = (x - o.x_in) / (o.x_out - o.x_in)
    ts = np.linspace(-ext, 1 + ext, n)
    dentro = (ts >= 0) & (ts <= 1)
    C = np.zeros((n, 3))
    C[dentro] = _curva_t(tb, B[M], ts[dentro])
    i0, i1 = np.nonzero(dentro)[0][[0, -1]]
    T0 = C[i0 + 1] - C[i0]; T1 = C[i1] - C[i1 - 1]
    for i in range(i0):
        C[i] = C[i0] - T0 * (i0 - i)
    for i in range(i1 + 1, n):
        C[i] = C[i1] + T1 * (i - i1)
    return C, ts


def borde_visible(o, B, K, bvh, paso=0.02, cols=48):
    """borde del párpado superior TAL COMO SE VE DE FRENTE: por columnas en X, subiendo desde el centro del ojo,
    la primera altura en la que la piel tapa el globo. En Tripo el borde de la malla (vértices pegados al globo)
    suele quedar por dentro de un reborde esculpido (Martín): medido así, la línea cae en el filo que se ve.
    -> (x_in, x_out, polinomio z(x)) en el marco del ojo (× m)."""
    from mathutils import Vector
    r = o.r
    X, Y, Z = K.X, K.Y, K.Z
    xs, zs = [], []
    for xl in np.linspace(-1.1 * r, 1.1 * r, cols):
        zt = None
        for dz in np.arange(-0.3 * r, 1.0 * r, paso * r):
            q = r * r - xl * xl - dz * dz
            if q <= 0:
                continue
            frente = (o.c @ Y) - np.sqrt(q)                     # superficie del globo en ese rayo
            p0 = o.c + X * xl + Z * dz - Y * (2 * r)
            h = bvh.ray_cast(Vector(p0), Vector(Y), 4 * r)
            if h[0] is None or (np.array(h[0][:]) @ Y) > frente - 1e-5:
                zt = dz                                          # se ve el globo: el borde está más arriba
            elif zt is not None:
                break
        if zt is not None and zt > -0.25 * r:
            xs.append(xl); zs.append(zt + 0.5 * paso * r)
    xs, zs = np.array(xs), np.array(zs)
    if len(xs) < 6:
        raise RuntimeError(f'No veo el borde del párpado {o.lado} de frente')
    pol = np.polyfit(xs, zs, 4)
    return float(xs.min()), float(xs.max()), pol


def _bvh_piel(cara, B, oc, cuenca):
    from mathutils.bvhtree import BVHTree
    me = cara.data
    # con la cuenca: su margen (apoyado en la lente) es el filo que se ve; la bolsa queda detrás del globo y no tapa
    tris = [tuple(p.vertices) for p in me.polygons if not oc[p.index]]
    return BVHTree.FromPolygons(B.tolist(), tris)


def _uv_banda(o, B, K, bvh, ext=0.2):
    """(t, v) de los vértices cerca del ojo: t = posición a lo largo del ojo (lagrimal 0 → rabillo 1) y v = altura
    sobre el borde visible del párpado, vistos de frente (+ encima, − debajo: la cara interior del párpado)."""
    x_a, x_b, pol = borde_visible(o, B, K, bvh)
    s = 1 if o.lado == 'L' else -1                      # el lagrimal es la X más cercana a la nariz
    x_in, x_out = (x_a, x_b) if s > 0 else (x_b, x_a)
    cerca = np.nonzero(np.linalg.norm(B - o.c, axis=1) < 2.0 * o.r)[0]
    q = B[cerca] - o.c
    x = q @ K.X; z = q @ K.Z
    xc = np.clip(x, x_a, x_b)
    zm = np.polyval(pol, xc)
    # más allá de los rabillos el borde sigue casi horizontal (con la pendiente del extremo la colita caía hacia
    # abajo en Martín R; en las referencias sale hacia fuera)
    dp = np.polyder(pol)
    zm = zm + np.clip(np.polyval(dp, xc), -0.25, 0.25) * (x - xc)
    t = (x - x_in) / (x_out - x_in)
    v = z - zm
    frente = q @ K.Y < 0.15 * o.r                       # nada de la parte de atrás de la cuenca
    return cerca, t, v, frente, {'x_in_mm': round(x_in * 1000, 1), 'x_out_mm': round(x_out * 1000, 1),
                                 'z_centro_mm': round(float(np.polyval(pol, 0.0)) * 1000, 1)}


def _material_piel(cara, caras):
    """material más usado por las caras de la franja y su imagen de color base (si la tiene)."""
    me = cara.data
    mi = np.array([me.polygons[f].material_index for f in caras])
    idx = int(np.bincount(mi).argmax())
    mat = me.materials[idx] if idx < len(me.materials) else None
    img, color = None, (0.8, 0.8, 0.8)
    if mat and mat.use_nodes:
        p = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p:
            bc = p.inputs['Base Color']
            color = tuple(bc.default_value[:3])
            if bc.is_linked:
                src = bc.links[0].from_node
                img = getattr(src, 'image', None)
    elif mat:
        color = tuple(mat.diffuse_color[:3])
    return idx, mat, img, color


def _muestrear(img, uv):
    """color de la imagen en uv (N, 2), vecino más cercano."""
    W, H = img.size
    px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    x = np.clip((uv[:, 0] % 1.0) * W, 0, W - 1).astype(int)
    y = np.clip((uv[:, 1] % 1.0) * H, 0, H - 1).astype(int)
    return px[y, x, :3]


def crear(cara, K, ojos, estilo='anime', grosor=None, color=None, solape=0.05, vmin=-0.35, vmax=0.36,
          ancho=1024, alto=256, ext=0.2, nombre=None, ala=None, sube=None, caras_sel=None):
    """ojos: {'L': Ojo, 'R': Ojo} (facs.ojos). grosor (× r) en t = (lagrimal, .25, .5, .8, rabillo); solape (× r):
    cuánto baja la línea por debajo del borde (la cara interior del párpado, se ve al cerrar). vmin/vmax (× r):
    alto de la franja que cambia de material (debajo/encima del borde).
    caras_sel (0.8.6): índices de las caras que el usuario marcó a mano; solo esas reciben el delineado (cada una en
    el ojo más cercano). Sin ella, la franja se busca sola junto al borde del párpado."""
    me = cara.data
    est = ESTILOS[estilo] if isinstance(estilo, str) else estilo
    grosor = grosor or est['grosor']; color = color or est['color']
    nombre = nombre or f'{cara.name}_Delineado'
    quitar(cara)
    B = basis(cara)
    npol = len(me.polygons)
    oc = np.zeros(npol, bool)
    if 'RLB_ocultar_ojos_uv' in me.attributes:
        me.attributes['RLB_ocultar_ojos_uv'].data.foreach_get('value', oc)
    cuenca = np.zeros(len(me.vertices), bool)
    if 'rlb_cuenca' in me.attributes and me.attributes['rlb_cuenca'].domain == 'POINT':
        a = me.attributes['rlb_cuenca']
        vals = np.zeros(len(me.vertices), int if a.data_type == 'INT' else (bool if a.data_type == 'BOOLEAN' else float))
        a.data.foreach_get('value', vals)
        cuenca = vals > 0
    lados = sorted(ojos)
    franja = {}           # cara -> (lado, r, [(t, v)…] por vértice)
    info = {}
    bvh = _bvh_piel(cara, B, oc, cuenca)
    zona = np.zeros(len(B), bool); zona[K.zona] = True
    manual = None
    if caras_sel is not None:
        manual = {int(f) for f in caras_sel if 0 <= int(f) < npol and not oc[int(f)]}
        if not manual:
            raise RuntimeError('No hay caras marcadas para el delineado')
        info['marcadas_en_ojo_oculto'] = sorted(int(f) for f in caras_sel if 0 <= int(f) < npol and oc[int(f)])
        cen = np.array([ojos[l].c for l in lados])
        asignada = {}
        for f in manual:
            pc = B[list(me.polygons[f].vertices)].mean(0)
            asignada[f] = int(np.argmin(np.linalg.norm(cen - pc, axis=1)))
    if manual is not None:
        # a mano (0.8.11): TODAS las caras marcadas se pintan enteras del color del delineado (negro), tal cual, sin
        # filtros de distancia, de zona ni de cuenca; cada una toma el ojo más cercano solo para repartir la textura
        for f in sorted(manual):
            li = asignada[f]
            franja[f] = (li, ojos[lados[li]].r, [(0.5, 0.0)] * len(me.polygons[f].vertices))
        for li, lado in enumerate(lados):
            info[lado] = {'caras': sum(1 for f in franja if franja[f][0] == li), 'r_mm': round(ojos[lado].r * 1000, 2)}
    for li, lado in enumerate(lados):
        if manual is not None:
            break
        o = ojos[lado]
        cerca, t, v, frente, med = _uv_banda(o, B, K, bvh, ext)
        T = {int(i): (float(np.clip(tt, -ext, 1 + ext)), float(np.clip(vv / o.r, vmin, vmax)), bool(f))
             for i, tt, vv, f in zip(cerca, t, v, frente)}
        dentro = {i for i, (tt, vv, f) in T.items() if -ext < tt < 1 + ext and vmin < vv < vmax and f}
        n = 0
        for p in me.polygons:
            if oc[p.index] or p.index in franja:
                continue
            vs = p.vertices
            # la cara interior del párpado y el margen de la cuenca también (por debajo del filo, se pintan oscuros:
            # sin ellos quedaba una tira gris que al cerrar se veía como una solapa suelta); la bolsa de detrás no
            if (any(v in dentro for v in vs) and all(v in T and zona[v] for v in vs)
                    and (not any(cuenca[v] for v in vs) or all(T[v][2] for v in vs))):
                franja[p.index] = (li, o.r, [(T[v][0], T[v][1] * o.r) for v in vs]); n += 1
        info[lado] = {'caras': n, 'r_mm': round(o.r * 1000, 2), **med}
    if not franja:
        raise RuntimeError('No encuentro la piel del borde del párpado')
    caras = np.array(sorted(franja))
    idx_piel, mat_piel, img_piel, color_piel = _material_piel(cara, caras)
    uvl = me.uv_layers.active
    uv0 = np.zeros(len(me.loops) * 2); uvl.data.foreach_get('uv', uv0); uv0 = uv0.reshape(-1, 2)
    loops = np.array([l for f in caras for l in me.polygons[f].loop_indices], int)
    orig = {'caras': caras.tolist(), 'mat': [me.polygons[f].material_index for f in caras],
            'loops': loops.tolist(), 'uv': uv0[loops].ravel().round(7).tolist()}
    # --- UV nueva: cada ojo en su mitad de la textura; u = t, v = distancia (× r)
    nl = len(lados)
    uv = uv0.copy()
    for f in caras:
        li, r, tv = franja[f]
        for k, l in enumerate(me.polygons[f].loop_indices):
            t, v = tv[k]
            uv[l, 0] = (li + (t + ext) / (1 + 2 * ext)) / nl
            uv[l, 1] = (v / r - vmin) / (vmax - vmin)
    uvl.data.foreach_set('uv', uv.ravel())
    # --- textura: piel (la de la imagen original o el color base) + línea
    W, H = ancho, alto
    U = (np.arange(W) + 0.5) / W; V = (np.arange(H) + 0.5) / H
    uu, vv = np.meshgrid(U, V)
    li_px = np.minimum((uu * nl).astype(int), nl - 1)
    t = (uu * nl - li_px) * (1 + 2 * ext) - ext
    v = vmin + vv * (vmax - vmin)                                     # × r
    ala = est.get('ala', 0.0) if ala is None else ala
    sube = est.get('sube', 0.0) if sube is None else sube
    g = np.interp(np.clip(t, 0, 1), [0, 0.25, 0.5, 0.8, 1.0], grosor)
    g = g * np.clip(t / 0.06 + 0.15, 0, 1)                           # lagrimal: se afina
    g = g * np.where(t <= 1, np.sqrt(np.clip((1 - t) / 0.05, 0, 1)) * 0.5 + 0.5, 1.0)   # rabillo: final romo, sin punta
    # colita del rabillo: sigue la curva del borde, se afina hasta 0 y sube un poco
    k = np.clip((t - 1) / max(ala, 1e-6), 0, 1)
    base = np.where(t > 1, sube * k ** 1.5, 0.0)                     # altura del filo de abajo (× r)
    g = np.where(t < 0, 0.0, np.where(t <= 1, g, np.where(k < 1, g * (1 - k) ** 0.8, 0.0)))
    sl = np.where((t >= 0) & (t <= 1), solape * np.clip(np.minimum(t, 1 - t) / 0.08, 0, 1), 0.0)
    px_v = (vmax - vmin) / H
    # cobertura con borde suave de ~1 píxel (arriba: grosor; abajo: solape)
    a_sup = np.clip((base + g - v) / px_v + 0.5, 0, 1)
    a_inf = np.clip((v - base + sl) / px_v + 0.5, 0, 1)
    alfa = np.where(g > 1e-6, a_sup * a_inf, 0.0)
    # por debajo del filo (cara interior del párpado, mira al ojo): oscuro en todo el ancho del ojo
    # solo una tira estrecha bajo el filo (hasta `fondo` × r) y apagada en los lagrimales: más abajo el lagrimal
    # se pintaba como una gota negra hasta el párpado de abajo. 0,12 r era demasiado: al cerrar, esa cara gira hacia
    # delante y el ojo cerrado parecía abierto (mancha negra de ~2 mm bajo la línea)
    fondo = 0.05
    dentro_t = np.clip(np.minimum(t, 1 - t) / 0.08, 0, 1)
    interior = (np.clip((base - v) / px_v + 0.5, 0, 1) * np.clip((v - base + fondo) / px_v + 0.5, 0, 1) * dentro_t)
    alfa = np.maximum(alfa, interior)
    if manual is not None:
        alfa = np.ones_like(alfa)                                      # caras marcadas: negro entero
        img_piel = None
    piel = np.broadcast_to(np.array(color_piel, np.float32), (H, W, 3)).copy()
    if img_piel is not None:
        # cada píxel toma el color de la textura original en el mismo punto de la piel: se rasteriza cada
        # triángulo de la franja en la UV nueva interpolando la UV original
        cubierto = np.zeros((H, W), bool)
        for f in caras:
            L = list(me.polygons[f].loop_indices)
            for k in range(1, len(L) - 1):
                tri = [L[0], L[k], L[k + 1]]
                A = uv[tri] * [W, H]; O = uv0[tri]
                x0, y0 = np.floor(A.min(0)).astype(int); x1, y1 = np.ceil(A.max(0)).astype(int)
                x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
                if x1 < x0 or y1 < y0:
                    continue
                gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                Pq = np.stack([gx.ravel(), gy.ravel()], 1)
                T_ = np.array([A[1] - A[0], A[2] - A[0]]).T
                if abs(np.linalg.det(T_)) < 1e-9:
                    continue
                l12 = np.linalg.solve(T_, (Pq - A[0]).T).T
                b = np.c_[1 - l12.sum(1), l12]
                m = (b >= -1e-3).all(1)
                if not m.any():
                    continue
                uvo = b[m] @ O
                ys = gy.ravel()[m].astype(int); xs = gx.ravel()[m].astype(int)
                piel[ys, xs] = _muestrear(img_piel, uvo); cubierto[ys, xs] = True
        # lo no cubierto (bordes): color medio de lo cubierto
        if cubierto.any():
            piel[~cubierto] = piel[cubierto].mean(0)
    col = piel * (1 - alfa[..., None]) + np.array(color, np.float32) * alfa[..., None]
    rgba = np.concatenate([col, np.ones((H, W, 1), np.float32)], 2).astype(np.float32)
    im = bpy.data.images.get(nombre)
    if im is None or tuple(im.size) != (W, H):
        if im:
            bpy.data.images.remove(im)
        im = bpy.data.images.new(nombre, W, H, alpha=False)
    im.colorspace_settings.name = 'sRGB'
    # la imagen guarda sRGB; los colores de arriba son lineales
    srgb = np.where(rgba[..., :3] <= 0.0031308, rgba[..., :3] * 12.92, 1.055 * np.power(np.clip(rgba[..., :3], 0, None), 1 / 2.4) - 0.055)
    rgba[..., :3] = srgb
    im.pixels.foreach_set(rgba.ravel())
    im.update(); im.pack()
    # --- material de la franja: el de la piel con la textura nueva en Base Color
    mat = bpy.data.materials.get(nombre)
    if mat is None:
        mat = mat_piel.copy() if mat_piel else bpy.data.materials.new(nombre)
        mat.name = nombre
    mat.use_nodes = True
    nt = mat.node_tree
    p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None) or nt.nodes.new('ShaderNodeBsdfPrincipled')
    tex = nt.nodes.get('Delineado') or nt.nodes.new('ShaderNodeTexImage')
    tex.name = 'Delineado'; tex.image = im; tex.interpolation = 'Linear'; tex.extension = 'EXTEND'
    tex.location = (p.location.x - 350, p.location.y)
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
    if manual is not None:
        # a mano: el delineado es SU material (copia independiente, no se pierde si luego se re-texturiza la piel)
        # con un relieve pequeño de tinta/maquillaje (bump suave de grano fino, ~0,3 mm)
        nz = nt.nodes.get('Delineado_relieve') or nt.nodes.new('ShaderNodeTexNoise')
        bp = nt.nodes.get('Delineado_bump') or nt.nodes.new('ShaderNodeBump')
        nz.name = 'Delineado_relieve'; bp.name = 'Delineado_bump'
        nz.inputs['Scale'].default_value = 900.0; nz.inputs['Detail'].default_value = 2.0
        nz.location = (p.location.x - 700, p.location.y - 300); bp.location = (p.location.x - 350, p.location.y - 300)
        bp.inputs['Strength'].default_value = 0.25; bp.inputs['Distance'].default_value = 0.0003
        nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
        p.inputs['Roughness'].default_value = 0.35            # tinta algo brillante, por encima de la piel
    mat.diffuse_color = (*(color if manual is not None else color_piel), 1)      # vista Sólido por color de material: negro a mano
    if mat.name not in me.materials:
        me.materials.append(mat)
    mi_new = list(me.materials).index(me.materials[mat.name])
    for f in caras:
        me.polygons[f].material_index = mi_new
    me.update()
    cara['facs_delineado_uv'] = {'material': mat.name, 'imagen': im.name, 'caras': int(len(caras)),
                                 'estilo': estilo if isinstance(estilo, str) else 'propio', 'orig': orig}
    # la cinta vieja (otra malla) ya no hace falta: se oculta
    vieja = bpy.data.objects.get(f'{cara.name}_Borde_Parpado')
    if vieja:
        vieja.hide_set(True); vieja.hide_render = True
    info.update({'caras': int(len(caras)), 'material': mat.name, 'imagen': f'{im.name} {W}×{H}',
                 'textura_piel': img_piel.name if img_piel else None})
    return info


def quitar(cara):
    """devuelve la UV y el material originales a la franja y borra material e imagen del delineado."""
    me = cara.data
    d = cara.get('facs_delineado_uv')
    if not d:
        return {'quitado': False}
    d = d.to_dict() if hasattr(d, 'to_dict') else dict(d)
    o = d.get('orig')
    if o:
        uvl = me.uv_layers.active
        uv = np.zeros(len(me.loops) * 2); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
        uv[np.array(o['loops'], int)] = np.array(o['uv']).reshape(-1, 2)
        uvl.data.foreach_set('uv', uv.ravel())
        for f, m in zip(o['caras'], o['mat']):
            me.polygons[int(f)].material_index = int(m)
    m = bpy.data.materials.get(d.get('material', ''))
    if m and m.name in me.materials:
        i = list(me.materials).index(m)
        if not any(p.material_index == i for p in me.polygons):
            me.materials.pop(index=i)
    if m and m.users == 0:
        bpy.data.materials.remove(m)
    im = bpy.data.images.get(d.get('imagen', ''))
    if im and im.users == 0:
        bpy.data.images.remove(im)
    del cara['facs_delineado_uv']
    me.update()
    return {'quitado': True}
