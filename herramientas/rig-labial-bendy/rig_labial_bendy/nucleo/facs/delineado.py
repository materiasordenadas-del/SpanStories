# Delineado del párpado superior: cinta lisa sobre la piel (con alita en el rabillo) que sustituye a la tira
# dentada de pestañas de Tripo (que se arruga y despega al parpadear). La tira de Tripo no se borra: se oculta
# con el atributo de ocultación del complemento (reversible). La cinta es otro objeto atado a los triángulos de
# la piel: en cada shape key se mueve con la piel (combinación baricéntrica de sus desplazamientos).
import bpy, json
import numpy as np
from mathutils import Vector
from .grafo import ss
from .geometria import leer_atr


def _skin(cara, ojos=None):
    """piel visible para apoyar la cinta: sin pestañas, sin lo oculto y sin la cuenca que queda dentro del
    globo (la pared de detrás del ojo también es «piel» y la cinta se pegaba a ella)."""
    from mathutils.bvhtree import BVHTree
    from .ojos import _piel_bvh
    from .geometria import basis
    P = basis(cara)
    bvh, tris, piel_v = _piel_bvh(cara, P)
    if ojos:
        cen = P[tris].mean(1)
        ok = np.ones(len(tris), bool)
        for o in ojos.values():
            ok &= np.linalg.norm(cen - o.c, axis=1) > o.r - 0.0003
        tris = tris[ok]
        bvh = BVHTree.FromPolygons(P.tolist(), [tuple(t) for t in tris])
    return P, bvh, tris


def _sobre_piel(bvh, p, hol, centro=None):
    """punto de la piel más cercano, separado `hol` hacia fuera (lejos del centro del ojo: las normales de
    Tripo no siempre miran afuera)."""
    loc, nor, ti, d = bvh.find_nearest(Vector(p))
    l = np.array(loc[:]); n = np.array(nor[:])
    if centro is not None and n @ (l - centro) < 0:
        n = -n
    return l + n * hol, ti, l


def ocultar_tira(cara, ocultar=True):
    me = cara.data
    rid = np.zeros(len(me.polygons), int); leer_atr(me, 'RLB_region_id', rid)
    at = me.attributes['RLB_ocultar_ojos_uv']
    oc = np.zeros(len(me.polygons), bool); at.data.foreach_get('value', oc)
    previo = json.loads(cara.get('facs_tira_oculta', '[]'))
    if ocultar:
        nuevas = np.nonzero((rid == 2) & ~oc)[0].tolist()
        oc[nuevas] = True
        cara['facs_tira_oculta'] = json.dumps(sorted(set(previo) | set(nuevas)))
    else:
        oc[previo] = False
        cara['facs_tira_oculta'] = '[]'
    at.data.foreach_set('value', oc)
    me.update()


def crear(cara, ojos, nombre=None, n=28, ancho=(0.04, 0.10, 0.085), ala=0.25, hol=0.00015, color=(0.16, 0.07, 0.2, 1)):
    """ojos: {'L': Ojo, 'R': Ojo}. ancho (× r del globo): en el lagrimal, en el centro, en el rabillo; ala: largo
    de la alita (× r)."""
    from .ojos import _bary
    P, bvh, tris = _skin(cara, ojos)
    K = next(iter(ojos.values())).K
    verts, caras, atad = [], [], []
    for lado, o in ojos.items():
        r = o.r
        # radio del borde respecto al centro del ojo
        Rm = float(np.median(np.linalg.norm(K.p[o.borde_sup] - o.c, axis=1)))
        xs = np.linspace(o.x_in, o.x_out, n)
        th = o.theta_sup(xs)
        def punto(x, t):
            rho = np.sqrt(max(Rm * Rm - x * x, 1e-8))
            return o.c + K.X * x + K.Z * rho * np.sin(t) - K.Y * rho * np.cos(t)
        s = np.linspace(0, 1, n)
        w = np.interp(s, [0, 0.5, 1], ancho) * r
        dentro, fuera = [], []
        for x, t, wi in zip(xs, th, w):
            rho = np.sqrt(max(Rm * Rm - x * x, 1e-8))
            a = punto(x, t + 0.15 / max(rho / r, 0.3) * 0.0)          # borde (sin cambio)
            b = punto(x, t + wi / rho)                                  # arriba por el párpado
            dentro.append(a); fuera.append(b)
        # alita: sigue la tangente del borde hacia fuera y arriba, afinándose
        tg = dentro[-1] - dentro[-3]; tg /= np.linalg.norm(tg)
        sube = K.Z * 0.45 + tg; sube /= np.linalg.norm(sube)
        na = 6
        for k in range(1, na + 1):
            f = k / na
            a = dentro[-1] + sube * ala * r * f
            b = a + (fuera[-1] - dentro[-1]) * (1 - f) * 0.9
            dentro.append(a); fuera.append(b if f < 1 else a + (b - a) * 0.05)
        base = len(verts)
        fila = []
        for a, b in zip(dentro, fuera):
            qa, ta, la = _sobre_piel(bvh, a, hol, o.c)
            qb, tb, lb = _sobre_piel(bvh, b, hol, o.c)
            fila.append((len(verts), len(verts) + 1))
            verts += [qa, qb]
            for (q, ti, l) in ((qa, ta, la), (qb, tb, lb)):
                A, B_, C_ = tris[ti]
                atad.append((int(A), int(B_), int(C_), _bary(l, P[A], P[B_], P[C_]).tolist(), (q - l).tolist()))
        for (a0, b0), (a1, b1) in zip(fila[:-1], fila[1:]):
            caras.append((a0, a1, b1, b0) if lado == 'L' else (a0, b0, b1, a1))
    nombre = nombre or f'{cara.name}_Delineado'
    viejo = bpy.data.objects.get(nombre)
    if viejo:
        me_v = viejo.data; bpy.data.objects.remove(viejo)
        if me_v.users == 0:
            bpy.data.meshes.remove(me_v)
    me = bpy.data.meshes.new(nombre)
    me.from_pydata([tuple(v) for v in verts], [], caras)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    mat = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Roughness'].default_value = 0.6
    me.materials.append(mat)
    ob = bpy.data.objects.new(nombre, me)
    for c in cara.users_collection:
        c.objects.link(ob)
    ob.parent = cara
    ob.matrix_parent_inverse = cara.matrix_world.inverted()
    ob['facs_atadura'] = json.dumps(atad)
    ob['facs_pieza'] = 'delineado'
    # normales hacia fuera de la piel
    from .geometria import basis
    return ob


def seguir_keys(cara, ob, nombres=None):
    """copia a la cinta cada shape key de la cara (moviéndose con sus triángulos de piel)."""
    from .geometria import basis
    at = json.loads(ob['facs_atadura'])
    T = np.array([a[:3] for a in at], int); W = np.array([a[3] for a in at], float)
    B = basis(cara)
    if ob.data.shape_keys is None:
        ob.shape_key_add(name='Basis', from_mix=False)
    Bo = np.zeros(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get('co', Bo); Bo = Bo.reshape(-1, 3)
    n = 0
    from .construir import marcar
    fk = set(cara.get('facs_keys', []))
    for k in cara.data.shape_keys.key_blocks[1:]:
        if k.name not in fk:
            continue
        if nombres is not None and k.name not in nombres:
            continue
        co = np.zeros(len(B) * 3); k.data.foreach_get('co', co); d = co.reshape(-1, 3) - B
        dd = (W[:, :, None] * d[T]).sum(1)
        if not np.any(np.abs(dd) > 1e-7):
            continue
        kk = ob.data.shape_keys.key_blocks.get(k.name) or ob.shape_key_add(name=k.name, from_mix=False)
        kk.data.foreach_set('co', (Bo + dd).ravel())
        marcar(ob, k.name)
        n += 1
    return n


def borde_visible(cara, ojo, paso=0.0001):
    """curva del borde del párpado superior TAL COMO SE VE de frente: para cada columna x (marco del ojo),
    la altura z donde termina el globo visible y empieza la piel. Devuelve (xs, zs) suavizados."""
    from mathutils.bvhtree import BVHTree
    from .geometria import basis
    me = cara.data
    n = len(me.polygons)
    oc = np.zeros(n, bool); leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    rid = np.zeros(n, int); leer_atr(me, 'RLB_region_id', rid)
    P = basis(cara)
    vis = [p.index for p in me.polygons if not oc[p.index] and rid[p.index] != 2]
    bvh = BVHTree.FromPolygons(P.tolist(), [tuple(me.polygons[i].vertices) for i in vis])
    K = ojo.K; c = ojo.c; r = ojo.r
    a, b = sorted((ojo.x_in, ojo.x_out))
    xs = np.arange(a, b, paso)
    zs = np.arange(-0.3 * r, 1.0 * r, paso)
    out_x, out_z = [], []
    for x in xs:
        top = None
        for z in zs:
            p0 = c + K.X * x + K.Z * z - K.Y * 0.05
            h = bvh.ray_cast(Vector(p0), Vector(K.Y), 0.1)
            q = p0 - c; bq = q @ K.Y; disc = bq * bq - (q @ q - r * r)
            tg = (-bq - np.sqrt(disc)) if disc >= 0 else np.inf
            ve_globo = np.isfinite(tg) and (h[0] is None or h[3] > tg - 1e-5)
            if ve_globo:
                top = z
        if top is not None:
            out_x.append(x); out_z.append(top + paso * 0.5)
    out_x = np.array(out_x); out_z = np.array(out_z)
    # suavizado: media móvil + polinomio suave
    if len(out_x) > 8:
        k = 7
        zz = np.convolve(np.pad(out_z, k // 2, mode='edge'), np.ones(k) / k, mode='valid')
        pol = np.polyfit(out_x, zz, 6)
        out_z = np.polyval(pol, out_x)
    return out_x, out_z, bvh, vis, P


def crear_borde(cara, ojos, nombre=None, n=40, grosor=(0.045, 0.085, 0.07), solape=0.012, hol=0.00012,
                color=(0.015, 0.012, 0.015, 1)):
    """franja negra lisa sobre el borde del párpado superior (el «borde grueso pintado de negro»).
    grosor × r (lagrimal, centro, rabillo) por encima del borde visible; solape × r por debajo (tapa el
    filo). Atada a los triángulos de piel que tiene debajo para seguir todas las shape keys."""
    from .ojos import _bary
    verts, caras, atad = [], [], []
    for lado, o in ojos.items():
        K = o.K; r = o.r
        xs_b, zs_b, bvh, vis, P = borde_visible(cara, o)
        me = cara.data
        xs = np.linspace(xs_b.min(), xs_b.max(), n)
        zm = np.interp(xs, xs_b, zs_b)
        t = (xs - o.x_in) / (o.x_out - o.x_in)
        g = np.interp(t, [0, 0.12, 0.5, 0.88, 1], [0.15, 1.0, 1.0, 1.0, 0.25]) * np.interp(t, [0, 0.5, 1], grosor) * r
        fila = []
        for x, z, gi in zip(xs, zm, g):
            par = []
            for zz in (z - solape * r, z + gi):
                p0 = o.c + K.X * x + K.Z * zz - K.Y * 0.05
                h = bvh.ray_cast(Vector(p0), Vector(K.Y), 0.1)
                # el borde inferior cae sobre el globo: se apoya en la piel del borde (misma x, z del borde)
                if h[0] is None or np.linalg.norm(np.array(h[0][:]) - o.c) < o.r + 0.0001:
                    h = (None,)
                    for dz in np.arange(0.3, 20, 0.5) * paso_def():
                        p1 = o.c + K.X * x + K.Z * (z + dz) - K.Y * 0.05
                        h = bvh.ray_cast(Vector(p1), Vector(K.Y), 0.1)
                        if h[0] is not None and np.linalg.norm(np.array(h[0][:]) - o.c) >= o.r + 0.0001:
                            break
                    if h[0] is None:
                        continue
                    loc = np.array(h[0][:]) + (K.Z * (zz - z - dz))
                else:
                    loc = np.array(h[0][:])
                f = vis[h[2]]
                vs = list(me.polygons[f].vertices)
                # triángulo de atadura: los 3 vértices de la cara más cercanos al punto
                d = np.linalg.norm(P[vs] - loc, axis=1); tri = [vs[i] for i in np.argsort(d)[:3]]
                nor = np.array(h[1][:])
                if nor @ (loc - o.c) < 0:
                    nor = -nor
                q = loc + nor * hol - K.Y * 0.00005
                par.append(len(verts)); verts.append(q)
                A, B_, C_ = tri
                atad.append((int(A), int(B_), int(C_), _bary(loc, P[A], P[B_], P[C_]).tolist(), (q - loc).tolist()))
            if len(par) == 2:
                fila.append(tuple(par))
        for (a0, b0), (a1, b1) in zip(fila[:-1], fila[1:]):
            caras.append((a0, a1, b1, b0))
    nombre = nombre or f'{cara.name}_Borde_Parpado'
    viejo = bpy.data.objects.get(nombre)
    if viejo:
        mv = viejo.data; bpy.data.objects.remove(viejo)
        if mv.users == 0:
            bpy.data.meshes.remove(mv)
    me2 = bpy.data.meshes.new(nombre)
    me2.from_pydata([tuple(v) for v in verts], [], caras); me2.update()
    for p in me2.polygons:
        p.use_smooth = True
    mat = bpy.data.materials.get(f'{cara.name}_Pestana') or bpy.data.materials.new(f'{cara.name}_Pestana')
    mat.diffuse_color = color
    me2.materials.append(mat)
    ob = bpy.data.objects.new(nombre, me2)
    for c in cara.users_collection:
        c.objects.link(ob)
    ob.parent = cara; ob.matrix_parent_inverse = cara.matrix_world.inverted()
    ob['facs_atadura'] = json.dumps(atad); ob['facs_pieza'] = 'borde_parpado'
    return ob


def paso_def():
    return 0.0001


# ---------------------------------------------------------------- delineado desde el borde real (v2)
def _curva_t(t, Q, ts, grado=4):
    """ajuste suave de los puntos Q (m, 3) con parámetro t (m) -> puntos en ts (n, 3)."""
    g = min(grado, max(1, len(t) - 2))
    return np.stack([np.polyval(np.polyfit(t, Q[:, i], g), ts) for i in range(3)], 1)


def _alisar_1d(X, iters=4, lam=0.5):
    X = X.copy()
    for _ in range(iters):
        X[1:-1] = X[1:-1] + lam * (0.5 * (X[:-2] + X[2:]) - X[1:-1])
    return X


def _cinta(o, Pk, bvh, ts, grosor, solape, hol, signo, filas=3, ala=0.10, ventana=3, borde=None, t_borde=None, sube_ala=0.35):
    """filas de la cinta (de abajo a arriba) para unas posiciones Pk de la cara. La curva es el borde real del
    párpado ajustado; cada fila se apoya en lo PRIMERO que ve la cámara de frente (rayos -> así tapa los restos
    dentados de las pestañas que sobresalen del párpado), con la profundidad filtrada (la más adelantada en una
    ventana) y alisada a lo largo de la cinta. ala: prolonga la curva más allá del rabillo (× ancho del ojo)."""
    K = o.K
    M = K.zona[o.borde_sup if borde is None else borde]
    Q = Pk[M]
    t2 = ts * (1 + ala)
    C = _curva_t(o._t_borde if t_borde is None else t_borde, Q, np.minimum(t2, 1.0))
    # ala: más allá del rabillo sigue la tangente final, subiendo un poco
    fin = t2 > 1.0
    if fin.any():
        T1 = C[-1 - fin.sum()] - C[-2 - fin.sum()]
        T1 /= np.linalg.norm(T1) + 1e-12
        anc = abs(o.x_out - o.x_in)
        k = (t2[fin] - 1.0) * anc
        C[fin] = C[~fin][-1] + T1[None, :] * k[:, None] + K.Z[None, :] * sube_ala * k[:, None]
    T = np.gradient(C, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-12
    R = C - o.c; R /= np.linalg.norm(R, axis=1)[:, None] + 1e-12
    up = np.cross(R, T) * signo
    up /= np.linalg.norm(up, axis=1)[:, None] + 1e-12
    out = []
    for f in np.linspace(0, 1, filas):
        X = C + up * (-solape + (solape + grosor) * f)[:, None]
        Y = X @ K.Y
        Yh = np.full(len(X), np.nan)
        for i in range(len(X)):
            o0 = X[i] - K.Y * 0.03
            h = bvh.ray_cast(Vector(o0), Vector(K.Y), 0.06)
            if h[0] is not None:
                Yh[i] = np.array(h[0][:]) @ K.Y
        # sin piel delante (sobre el globo): se queda en la curva, un pelo por delante del globo
        Yg = (C @ K.Y) - hol
        Yh = np.where(np.isnan(Yh), Yg, np.minimum(Yh, Yg + 0.0004))
        # la más adelantada en una ventana, y alisada
        Ym = np.array([Yh[max(0, i - ventana):i + ventana + 1].min() for i in range(len(Yh))])
        Ym = _alisar_1d(Ym[:, None], 6)[:, 0] - hol
        X = X + K.Y[None, :] * (Ym - Y)[:, None]
        out.append(_alisar_1d(X, 3))
    return out


def crear_delineado(cara, K, ojos, n=56, grosor=(0.012, 0.070, 0.095, 0.105, 0.0), solape=0.04, hol=0.00012,
                    nombre=None, umbral=1e-5, inferior=(0.0, 0.022, 0.028, 0.034, 0.0), solape_inf=0.03,
                    cerrar_inf=('eyeBlink',)):
    """Cinta negra del borde del párpado superior (sustituye a crear_borde). Se rehace en CADA shape key desde el
    borde real del párpado (los vértices del margen que detecta Ojo), ajustado con una curva suave: la cinta no se
    arruga ni se despega (la versión atada a triángulos por rayos hacía picos en el rabillo y huecos claros).
      grosor × r en t = (lagrimal, 0,25, 0,5, 0,8, rabillo): más gruesa hacia fuera y en punta en los extremos;
      solape × r: cuánto baja por debajo del borde (tapa el filo de la piel sobre el globo)."""
    from .geometria import basis
    from .construir import marcar
    from mathutils.bvhtree import BVHTree
    me = cara.data
    B = basis(cara)
    npol = len(me.polygons)
    oc = np.zeros(npol, bool)
    if 'RLB_ocultar_ojos_uv' in me.attributes:
        leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    rid = np.zeros(npol, int)
    if 'RLB_region_id' in me.attributes:
        leer_atr(me, 'RLB_region_id', rid)
    fk = [k for k in me.shape_keys.key_blocks[1:] if k.name in set(cara.get('facs_keys', []))]
    ts = np.linspace(0, 1, n)
    datos = []
    for lado, o in ojos.items():
        caras_ojo = [p.index for p in me.polygons if not oc[p.index] and rid[p.index] != 2
                     and np.linalg.norm(B[p.vertices[0]] - o.c) < 1.8 * o.r]
        tri = [tuple(me.polygons[i].vertices) for i in caras_ojo]
        vs_ojo = np.unique(np.concatenate([np.array(t_) for t_ in tri]))
        bvh0 = BVHTree.FromPolygons(B.tolist(), tri)
        # (borde, grosor, solape, ala, subida del ala, hacia): el ala inferior sube a juntarse con la superior y
        # cierra el rabillo (tapa los restos dentados de las pestañas que quedan ahí)
        bandas = [(o.borde_sup, grosor, solape, 0.10, 0.2, +1)]
        if inferior:
            bandas.append((o.borde_inf, inferior, solape_inf, 0.10, 0.6, -1))
        for borde, gr, so, ala, sube, hacia in bandas:
            M = K.zona[borde]
            x = (B[M] - o.c) @ K.X
            tb = (x - o.x_in) / (o.x_out - o.x_in)
            g = np.interp(ts, [0, 0.25, 0.5, 0.8, 1.0], gr) * o.r
            g = np.maximum(g, 0.0) * np.minimum(1, np.minimum(ts, 1 - ts) / 0.06 + 0.15)
            sl = so * o.r * np.minimum(1, np.minimum(ts, 1 - ts) / 0.08)
            kw = dict(borde=borde, t_borde=tb, ala=ala, sube_ala=sube)
            signo = 1.0
            F0 = _cinta(o, B, bvh0, ts, g, sl, hol, 1.0, **kw)
            if ((F0[-1] - F0[0]) @ K.Z)[n // 2] * hacia < 0:
                signo = -1.0
                F0 = _cinta(o, B, bvh0, ts, g, sl, hol, signo, **kw)
            por_key = {}
            for k in fk:
                co = np.zeros(len(B) * 3); k.data.foreach_get('co', co); Pk = co.reshape(-1, 3)
                if np.abs(Pk[vs_ojo] - B[vs_ojo]).max() < umbral:
                    continue
                bvh = BVHTree.FromPolygons(Pk.tolist(), tri)
                gk, sk_ = g, sl
                if hacia < 0 and k.name.startswith(cerrar_inf):
                    gk, sk_ = g * 0.0, sl * 0.0          # al cerrar, la línea inferior se recoge: una sola línea
                por_key[k.name] = _cinta(o, Pk, bvh, ts, gk, sk_, hol, signo, **kw)
            datos.append((F0, por_key))
    # malla: por ojo, filas × n
    verts, caras = [], []
    for F0, _ in datos:
        b0 = len(verts); nf = len(F0)
        for X in F0:
            verts += list(X)
        for j in range(nf - 1):
            for i in range(n - 1):
                a_ = b0 + j * n + i
                caras.append((a_, a_ + 1, a_ + n + 1, a_ + n))
    nombre = nombre or f'{cara.name}_Borde_Parpado'
    ob = bpy.data.objects.get(nombre)
    me2 = bpy.data.meshes.new(nombre + '_v2')
    me2.from_pydata([tuple(v) for v in verts], [], caras); me2.update()
    for p in me2.polygons:
        p.use_smooth = True
    mat = bpy.data.materials.get(f'{cara.name}_Pestana') or bpy.data.materials.new(f'{cara.name}_Pestana')
    mat.diffuse_color = (0.015, 0.012, 0.015, 1)
    me2.materials.append(mat)
    if ob is None:
        ob = bpy.data.objects.new(nombre, me2)
        for c in cara.users_collection:
            c.objects.link(ob)
    else:
        viejo = ob.data; ob.data = me2
        if viejo.users == 0:
            bpy.data.meshes.remove(viejo)
        me2.name = nombre
    ob.parent = cara; ob.matrix_parent_inverse = cara.matrix_world.inverted()
    ob['facs_pieza'] = 'borde_parpado'
    if 'facs_atadura' in ob.keys():
        del ob['facs_atadura']
    ob['facs_keys'] = []
    # keys
    ob.shape_key_add(name='Basis', from_mix=False)
    base = np.array(verts)
    nombres = sorted(set().union(*[set(pk) for _, pk in datos]))
    for nm in nombres:
        X = base.copy(); b0 = 0
        for F0, pk in datos:
            nf = len(F0)
            if nm in pk:
                X[b0:b0 + nf * n] = np.concatenate(pk[nm])
            b0 += nf * n
        kk = ob.shape_key_add(name=nm, from_mix=False)
        kk.data.foreach_set('co', X.ravel())
        marcar(ob, nm)
    return ob, len(nombres)

