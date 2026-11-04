# Interior de la boca para las formas FACS: bolsa oscura elipsoidal (abierta por delante, metida dentro del
# forro de los labios) y peso de mandíbula de las piezas sueltas (bolsa, dientes, lengua).
# La bolsa no va cosida a la cara: el forro de Tripo termina en un agujero con forma de silla de montar que
# no se puede cerrar limpio. Es oscura por las dos caras, así que cualquier línea de visión que entre por la
# boca termina en ella.
import bpy, bmesh
import numpy as np
from .grafo import ss, rot_eje
from .geometria import leer_atr


def crear_bolsa(cara, K, obj=None, centro=None, radios=(1.8, 1.95, 1.42), apertura=40.0, seg=(24, 14)):
    """radios en × hw (x, y, z); centro por defecto detrás de la boca. Sustituye la malla del objeto bolsa.
    rx 1,8 (antes 1,55): con la banda de dientes estirada en la sonrisa, sus extremos quedaban fuera de la bolsa y
    la pared de la bolsa los cruzaba como rayas rojas (parecían colmillos)."""
    hw = K.hw
    c = np.asarray(centro) if centro is not None else K.C + K.Y * 1.85 * hw - K.Z * 0.15 * hw
    rx, ry, rz = (r * hw for r in radios)
    nu, nv = seg
    bm = bmesh.new()
    filas = []
    a0 = np.radians(apertura)
    for j in range(nv + 1):
        th = a0 + (np.pi - a0) * j / nv                     # ángulo desde el polo delantero (−Y)
        fila = []
        if j == nv:
            p = c + K.Y * ry
            fila = [bm.verts.new(p)]
        else:
            for i in range(nu):
                ph = 2 * np.pi * i / nu
                p = c + K.X * rx * np.sin(th) * np.cos(ph) - K.Y * ry * np.cos(th) + K.Z * rz * np.sin(th) * np.sin(ph)
                fila.append(bm.verts.new(p))
        filas.append(fila)
    for j in range(nv):
        a, b = filas[j], filas[j + 1]
        for i in range(nu):
            if len(b) == 1:
                bm.faces.new((a[i], a[(i + 1) % nu], b[0]))
            else:
                bm.faces.new((a[i], a[(i + 1) % nu], b[(i + 1) % nu], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # normales hacia dentro (se ve desde la boca)
    for f in bm.faces:
        f.normal_flip()
    for f in bm.faces:
        f.smooth = True
    if obj is None:
        obj = bpy.data.objects.get(f'{cara.name}_Boca_Fondo')
    viejo = obj.data
    me = bpy.data.meshes.new(f'{cara.name}_Boca_Fondo_facs')
    bm.to_mesh(me); bm.free()
    for m in viejo.materials:
        me.materials.append(m)
    # la malla se escribe en espacio de la cara; el objeto puede tener otra matriz
    M = np.array(obj.matrix_world.inverted() @ cara.matrix_world)
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    co = co @ M[:3, :3].T + M[:3, 3]
    me.vertices.foreach_set('co', co.ravel())
    obj.data = me
    for mod in list(obj.modifiers):
        if mod.type == 'ARMATURE':
            obj.modifiers.remove(mod)
    obj.hide_render = False; obj.hide_viewport = False
    obj['facs_bolsa'] = True
    if viejo.users == 0:
        bpy.data.meshes.remove(viejo)
    return obj


def vaciar_forro(cara, K, claves=('jawOpen',), labio=0.2, pasadas=8, paso=0.05, radios=(1.8, 1.95, 1.42), exterior=()):
    """0.8.50 («Ojos y textura»): la cavidad y el forro de Tripo quedaban delante de los dientes. Con la boca abierta se lanzan rayos por
    la abertura real, entre los bordes de los labios: lo primero que tocan y no es labio (a más de `labio` × hw de su borde, sobre la
    piel) se quita, capa a capa. Solo caras: vértices, pesos y keys no cambian. Lo que quede detrás lo cubre la bolsa. `exterior`
    (piel_exterior): caras que se ven desde fuera con la boca cerrada; nunca se quitan (junto a la comisura salía un agujero). -> caras quitadas."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    me = cara.data
    kb = me.shape_keys.key_blocks if me.shape_keys else None
    if kb is None or not any(c in kb for c in claves):
        return 0
    hw = K.hw
    n = len(me.vertices)
    d = np.full(n, np.inf); d[K.zona] = K.d_boca
    F = [tuple(p.vertices) for p in me.polygons]
    s, i = K.zona[K.borde_sup], K.zona[K.borde_inf]
    centro = K.C + K.Y * 1.85 * hw - K.Z * 0.15 * hw
    rx, ry, rz = (r * hw for r in radios)
    quitar = set()
    fuera = set(exterior)
    for clave in claves:
        if clave not in kb:
            continue
        P = np.zeros(n * 3); kb[clave].data.foreach_get('co', P); P = P.reshape(-1, 3)
        Q = P - K.C
        def borde(ids):
            o = np.argsort(Q[ids] @ K.X)
            return (Q[ids] @ K.X)[o] / hw, (Q[ids] @ K.Z)[o] / hw
        us, vs = borde(s); ui, vi = borde(i)
        w0 = float(np.r_[Q[s] @ K.Y, Q[i] @ K.Y].mean())
        dirs = [K.Y + K.X * a + K.Z * e for a, e in ((0, 0), (0.35, 0), (-0.35, 0), (0, 0.2), (0, -0.2))]
        for _ in range(pasadas):
            vivas = [k for k in range(len(F)) if k not in quitar]
            bvh = BVHTree.FromPolygons(P.tolist(), [F[k] for k in vivas])
            nuevas = set()
            for u in np.arange(-0.95, 0.951, paso):
                a, b = np.interp(u, ui, vi) + 0.04, np.interp(u, us, vs) - 0.04
                for v in np.arange(a, b, paso):
                    p0 = K.C + K.X * u * hw + K.Z * v * hw + K.Y * w0
                    for dv in dirs:
                        h = bvh.ray_cast(Vector(p0 - dv * 3 * hw), Vector(dv / np.linalg.norm(dv)), 10 * hw)
                        if h[0] is None:
                            continue
                        rel = np.array(h[0][:]) - centro
                        dentro = (rel @ K.X / rx) ** 2 + (rel @ K.Y / ry) ** 2 + (rel @ K.Z / rz) ** 2 < 1.15
                        k = vivas[h[2]]
                        if (dentro or rel @ K.Y < 0) and k not in fuera and d[list(F[k])].min() > labio * hw:
                            nuevas.add(k)
            if not nuevas:
                break
            quitar |= nuevas
    if not quitar:
        return 0
    normales = {(p.index, int(v)): tuple(me.corner_normals[l].vector) for p in me.polygons
                for v, l in zip(p.vertices, p.loop_indices)} if me.has_custom_normals else None
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    capa = bm.faces.layers.int.new('_rlb_cara_original')
    for f in bm.faces:
        f[capa] = f.index
    bmesh.ops.delete(bm, geom=[bm.faces[k] for k in sorted(quitar)], context='FACES_ONLY')
    orig = [f[capa] for f in bm.faces]
    bm.faces.layers.int.remove(capa)
    bm.to_mesh(me); bm.free(); me.update()
    if normales:
        me.normals_split_custom_set([normales[(fi, int(v))] for fi, p in zip(orig, me.polygons) for v in p.vertices])
    return len(quitar)


def oscurecer_forro(cara, K, material='Boca_Interior', alcance=(1.35, 1.3), dist=0.05):
    """material del interior a las caras del forro: las que los labios (cerrados en el Basis) tapan desde
    todas las direcciones de cámara de delante. Así no se ve piel gris dentro de la boca abierta."""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    me = cara.data
    P = K.P
    me.calc_loop_triangles()
    bvh = BVHTree.FromPolygons([tuple(v.co) for v in me.vertices] if False else P.tolist(),
                               [tuple(p.vertices) for p in me.polygons])
    mi = next((i for i, m in enumerate(me.materials) if m and material in m.name), None)
    if mi is None:
        return {'error': 'sin material ' + material}
    dirs = []
    for az in (-50, -25, 0, 25, 50):
        for el in (-30, 0, 30):
            a, e = np.radians(az), np.radians(el)
            d = -K.Y * np.cos(a) * np.cos(e) + K.X * np.sin(a) * np.cos(e) + K.Z * np.sin(e)
            dirs.append(Vector(d))
    zona = set(K.zona.tolist())
    ocultas = set()
    for p in me.polygons:
        vs = p.vertices
        if not all(v in zona for v in vs):
            continue
        c = P[list(vs)].mean(0)
        rel = c - K.C
        u, v, w = rel @ K.X / K.hw, rel @ K.Z / K.hw, rel @ K.Y / K.hw
        if abs(u) > alcance[0] or abs(v) > alcance[1] or w < -0.7:
            continue
        oculto = True
        for d in dirs:
            o = Vector(c) + d * 0.00025
            hit = bvh.ray_cast(o, d, dist)
            if hit[0] is None:
                oculto = False
                break
        if oculto:
            ocultas.add(p.index)
    # 0.6.9 (Carlitos): en una barba esculpida los huecos entre mechones también quedan tapados desde todas las
    # cámaras y salían manchas rojo oscuro por toda la barba. El forro de verdad sigue al labio hacia dentro:
    # solo cuentan las caras tapadas unidas (por caras tapadas) al borde de los labios
    forro = conexas_al_borde(me, dentro_de_boca(K, ocultas, me), K.zona[np.r_[K.borde_sup, K.borde_inf]])
    cambiadas = 0
    for i in forro:
        p = me.polygons[i]
        if p.material_index != mi:
            p.material_index = mi
            cambiadas += 1
    me.update()
    return {'cambiadas': cambiadas, 'tapadas_sueltas': len(ocultas) - len(forro)}


def despintar_forro(cara, K, material='Boca_Interior'):
    """0.8.45: al rehacer la boca el forro se vuelve a medir desde cero; lo pintado con unos labios mal cerrados no se queda."""
    me = cara.data
    mi = next((i for i, m in enumerate(me.materials) if m and material in m.name), None)
    if mi is None:
        return 0
    mat = np.zeros(len(me.polygons), int); me.polygons.foreach_get('material_index', mat)
    if not (mat != mi).any():
        return 0
    piel = int(np.bincount(mat[mat != mi]).argmax())
    pintadas = np.nonzero(mat == mi)[0]                 # en toda la malla: en Pegazo había pelo pintado de versiones anteriores
    mat[pintadas] = piel
    me.polygons.foreach_set('material_index', mat)
    me.update()
    return len(pintadas)


def limpiar_forro_suelto(cara, K, material='Boca_Interior'):
    """caras de la piel con el material del interior que NO siguen al labio hacia dentro (pintadas por versiones
    anteriores en los surcos de una barba): vuelven al material de la piel."""
    me = cara.data
    mi = next((i for i, m in enumerate(me.materials) if m and material in m.name), None)
    if mi is None:
        return 0
    zona = np.zeros(len(K.P), bool); zona[K.zona] = True
    mat = np.zeros(len(me.polygons), int); me.polygons.foreach_get('material_index', mat)
    en_zona = np.array([zona[list(p.vertices)].all() for p in me.polygons])
    piel = int(np.bincount(mat[en_zona & (mat != mi)]).argmax()) if (en_zona & (mat != mi)).any() else 0
    pintadas = set(np.where(en_zona & (mat == mi))[0].tolist())
    sueltas = pintadas - conexas_al_borde(me, dentro_de_boca(K, pintadas, me), K.zona[np.r_[K.borde_sup, K.borde_inf]])
    for i in sueltas:
        me.polygons[i].material_index = piel
    me.update()
    return len(sueltas)


def dentro_de_boca(K, caras, me, pend=0.6, holgura=0.35):
    """filtro de forma: el forro solo se aleja del borde de los labios (hacia abajo, arriba o los lados) a medida que
    se mete hacia dentro. Una cara a `a` medias anchuras fuera de la abertura tiene que estar al menos pend·a por
    detrás del borde. Los surcos de la barba bajo el labio (Carlitos: 0,3–1,5 hw por debajo, casi a ras) no pasan."""
    n = len(K.P)
    U = np.full(n, np.nan); V = np.full(n, np.nan); W = np.full(n, np.nan)
    U[K.zona], V[K.zona], W[K.zona] = K.u, K.v, K.w
    bs, bi = K.zona[K.borde_sup], K.zona[K.borde_inf]
    os_, oi = np.argsort(U[bs]), np.argsort(U[bi])
    u_max = max(np.abs(U[bs]).max(), np.abs(U[bi]).max())
    out = set()
    for i in caras:
        vs = list(me.polygons[i].vertices)
        if np.isnan(U[vs]).all():                     # fuera de la zona de la cara: no es forro
            continue
        u, v, w = np.nanmean(U[vs]), np.nanmean(V[vs]), np.nanmean(W[vs])
        vsup = np.interp(u, U[bs][os_], V[bs][os_]); wsup = np.interp(u, U[bs][os_], W[bs][os_])
        vinf = np.interp(u, U[bi][oi], V[bi][oi]); winf = np.interp(u, U[bi][oi], W[bi][oi])
        fuera = max(vinf - v, v - vsup, abs(u) - u_max, 0.0)
        if fuera <= holgura or w - max(wsup, winf) >= pend * fuera:
            out.add(i)
    return out


def conexas_al_borde(me, caras, borde, anillo=2):
    """de las caras dadas, las unidas (por aristas, solo a través de esas caras) a alguna que toque el borde de los
    labios o esté a `anillo` caras de él."""
    borde = set(int(v) for v in borde)
    v2f = {}
    for i in caras:
        for v in me.polygons[i].vertices:
            v2f.setdefault(v, []).append(i)
    # semillas: caras del conjunto que tocan el borde o lo tienen a pocos anillos (el forro empieza justo detrás)
    cerca = set(borde)
    if anillo:
        ed = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
        nb = {}
        for a, b in ed:
            nb.setdefault(a, []).append(b); nb.setdefault(b, []).append(a)
        fr = set(borde)
        for _ in range(anillo):
            fr = {k for j in fr for k in nb.get(j, ())} - cerca; cerca |= fr
    vistas = {i for i in caras if any(v in cerca for v in me.polygons[i].vertices)}
    st = list(vistas)
    while st:
        i = st.pop()
        for v in me.polygons[i].vertices:
            for j in v2f.get(v, ()):
                if j not in vistas:
                    vistas.add(j); st.append(j)
    return vistas


def _forro_y(bvh, x, z, y0, K, n_max=4):
    """profundidades de las superficies que cruza un rayo de delante a atrás en (x, z)."""
    from mathutils import Vector
    hits = []
    o = Vector((x, y0, z)); d = Vector(K.Y)
    for _ in range(n_max):
        h = bvh.ray_cast(o, d, 0.2)
        if h[0] is None:
            break
        hits.append(h[0].y)
        o = h[0] + d * 0.00005
    return hits


# Proporciones del interior de la boca medidas en las referencias (Pruebas de Rig, 2026-10-19), en medias anchuras
# de boca (hw = media distancia entre comisuras), origen en el punto medio de las comisuras:
#   Serena (Jaw - Stylized) y Business girl (CC_Base_Teeth): arcada superior delante en w = −0,23…−0,35, filo en
#   z ≈ 0 y recto, ancho de la arcada 0,57 (delante) → 0,78 (w 0,4) → 0,99 (w 0,5–1) → 1,04–1,11 (máx., no crece más),
#   fondo 1,4–2,2; alto superior 0,71–0,95 e inferior 0,71–0,91 (con encía); tope inferior +0,05 (se solapa con el
#   superior); lengua de 1,41–1,53 de ancho, de w ≈ 0 a 2,2 y con el dorso a la altura del filo (+0,07…+0,14).
#   Jinx (Arcane): dientes en banda de ~90 vértices por arcada, rígidos. Todas: superior fija al cráneo, inferior y
#   lengua con la mandíbula; CC añade huesos laterales de los dientes (aquí: estirar_banda con las comisuras).
REF_BOCA = {'ancho_max': 1.10, 'alto_sup': 0.80, 'alto_inf': 0.75, 'encia': 0.20, 'lengua_ancho': 1.45}


def planta_herradura(n, xs=0.85, a=0.67, lado=0.20, w_fin=2.0):
    """planta de la arcada en medias anchuras de boca: delante una parábola w = a·x² hasta |x| = xs y luego los
    lados van hacia atrás por dentro de las mejillas (x crece lado × lo que avanza w) hasta w_fin. Columnas a
    distancias iguales a lo largo de la curva. Devuelve (x, w, s) con s = posición a lo largo (−1…1)."""
    w_s = a * xs * xs
    xa = np.linspace(0, xs, 200); wa = a * xa * xa
    wb = np.linspace(w_s, w_fin, 200)[1:]; xb = xs + lado * (wb - w_s)
    X = np.r_[xa, xb]; W = np.r_[wa, wb]
    seg = np.r_[0, np.cumsum(np.hypot(np.diff(X), np.diff(W)))]
    t = np.linspace(-1, 1, n)
    xi = np.interp(np.abs(t) * seg[-1], seg, X) * np.sign(t)
    wi = np.interp(np.abs(t) * seg[-1], seg, W)
    return xi, wi, t


def dientes_arcada(cara, K, superior=True, n_u=73, filas=8, borde=-0.08, encia=0.62, hueco=0.0005,
                   inclinacion=0.14, inf_alto=0.70, detras=0.0010, colmillo=None, inf_sube=-0.02,
                   herradura=(0.85, 0.67, 0.20, 2.0), punta=0.93, herradura_inf=(0.85, 0.67, 0.20, 0.75),
                   punta_inf=0.6):
    """Arcada de dientes RÍGIDA y regular (banda tipo anime): herradura parabólica en planta, filo recto, alto
    constante. No se moldea al labio (molde al forro = dientes ondulados que «siguen la boca»; el usuario lo
    rechazó): solo se mide en el forro cuánto adelantarla sin atravesar los labios.
      planta: y(u) = y_frente + fondo·hw·(u/ancho)² (u en medias anchuras de boca; los extremos se meten fondo × hw);
      superior: del filo (borde × hw bajo el centro de la línea de los labios, ~1,5 mm) a la encía (encía × hw);
      inferior: detrás de la superior (detras, m), del tope (0,3·borde) hacia abajo inf_alto × hw;
      inclinación: la encía va inclinacion × alto más atrás que el filo (incisivos proinclinados);
      arco: la pieza entera sube arco × hw × |u|^1,2 hacia los lados (arco natural de la dentadura, suave; así al
      hablar se ve una banda pareja bajo el labio superior y sobre la U del labio inferior, como en la referencia
      del usuario). No es un arco de sonrisa: con 0,45 hw los dientes parecían una banana que «sigue la boca».
      punta: desde |u| = punta los dos bordes de la banda convergen y el extremo acaba redondeado (cápsula) detrás
      de la comisura. De 3/4 un extremo recto se veía como un poste blanco; si solo baja un borde, sale una joroba
      que parece un colmillo.
    v4 (2026-10-19, NORMA DEL USUARIO): una BANDA LISA y rígida (sin formas de dientes, sin deformarse, sin seguir
    la forma del labio: rechazado dos veces) y LARGA: sigue por dentro hasta las mejillas, no solo hasta la comisura.
    Así, por mucho que se abra o se ensanche la sonrisa, siempre hay banda detrás del labio (con una banda corta en
    las sonrisas solo había dientes en el centro, «como un bebé»; las puntas cortas asomaban como colmillos).
    Planta en herradura (planta_herradura): parábola delante y lados hacia atrás POR DENTRO de las mejillas; una
    parábola abierta salía por fuera de la pared de la boca (barras rojas cruzando la banda en las sonrisas).
    punta: fracción del largo desde la que se estrecha (solo el final, muy dentro). La inferior va detras m por
    dentro de la superior con la misma planta.
    Cuánto se ve (referencia del usuario): poco, una línea fina; la superior más que la inferior. borde −0,08 hw
    (~1 mm bajo la línea de los labios); la inferior con el tope ~0,5 mm por debajo. Con −0,13 y +0,10 se veían
    «muy gruesos, muy grandes».
    Devuelve (verts, caras, vs) en el espacio de la cara."""
    from mathutils.bvhtree import BVHTree
    me = cara.data
    P = K.P
    n = len(me.polygons)
    oc = np.zeros(n, bool)
    if 'RLB_ocultar_ojos_uv' in me.attributes:
        leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    bvh = BVHTree.FromPolygons(P.tolist(), [tuple(p.vertices) for p in me.polygons if not oc[p.index]])
    hw = K.hw
    if not superior:
        # la inferior se ve poco: acaba justo detrás de las comisuras con la punta hacia la raíz (larga, de 3/4 se
        # veía su lado como una cinta enroscada)
        herradura_sup, punta_sup = herradura, punta
        herradura, punta = herradura_inf, punta_inf
    xh, wh, sh = planta_herradura(n_u, *herradura)
    us = xh
    bs = K.borde_sup; sel = np.abs(K.u[bs]) <= 0.3
    z0 = np.full(n_u, K.C[2] + float(np.median(K.v[bs][sel])) * hw)   # filo recto: altura del centro de los labios
    if superior:
        vs = np.linspace(borde, encia, filas)                   # de abajo (filo) a arriba (encía)
        t_atras = np.linspace(0, 1, filas)                      # la encía, más atrás
    else:
        vs = np.linspace(0.3 * borde + inf_sube - inf_alto, 0.3 * borde + inf_sube, filas)
        t_atras = np.linspace(1, 0, filas)                      # la raíz (abajo), más atrás
    sube = np.zeros(n_u)
    alto = (vs[-1] - vs[0]) * hw
    planta = wh * hw
    atras = inclinacion * alto * t_atras
    # adelantar la arcada lo justo: detrás del forro de los labios (2.ª superficie que cruza un rayo de frente)
    y0 = K.C[1] - 0.1
    lim = []
    for j, v in enumerate(vs):
        for i, u in enumerate(us):
            if abs(u) > 0.95:
                continue
            x = K.C[0] + u * hw
            hits = _forro_y(bvh, x, z0[i] + v * hw + sube[i], y0, K)
            if len(hits) >= 2 and hits[1] < K.C[1] + 0.35 * hw:
                lim.append(hits[1] + hueco - planta[i] - atras[j])
    y_frente = float(np.percentile(lim, 97)) if lim else K.C[1] - 0.42 * hw
    if not superior:
        sup = dientes_arcada(cara, K, True, n_u, filas, borde, encia, hueco, inclinacion, herradura=herradura_sup,
                             punta=punta_sup)[0]
        y_frente = max(y_frente, sup.reshape(filas, n_u, 3)[0, n_u // 2, 1] + detras)
    G = np.zeros((filas, n_u, 3))
    f = 0.85 * ss(punta, 1.0, np.abs(sh))                       # 0 en casi todo el largo, 0,85 en los extremos
    lo, hi = vs[0], vs[-1]
    # hacia donde convergen los bordes en los extremos: la superior hacia la encía; la inferior casi hasta la raíz
    # (su punta a media altura asomaba de 3/4 como un diente suelto)
    mid = lo + (0.55 if superior else 0.12) * (hi - lo)
    lo_u = lo + (mid - lo) * f; hi_u = hi - (hi - mid) * f
    t = np.linspace(0, 1, filas)
    for j in range(filas):
        vv = lo_u + (hi_u - lo_u) * t[j]
        G[j, :, 0] = K.C[0] + us * hw
        G[j, :, 1] = y_frente + planta + atras[j]
        G[j, :, 2] = z0 + vv * hw + sube
    verts = G.reshape(-1, 3)
    caras = []
    for j in range(filas - 1):
        for i in range(n_u - 1):
            a = j * n_u + i
            caras.append((a, a + 1, a + 1 + n_u, a + n_u))          # normal hacia delante (el Solidify engorda hacia atrás)
    return verts, caras, vs


def estirar_banda(K, FO, D_zona, Pc, delante=(0.85, 1.25)):
    """Opción del usuario: la banda de dientes se alarga en horizontal cuando la boca se ensancha (la sonrisa
    aumenta el diámetro transverso de la boca y la banda no: quedaban las comisuras sin dientes). Cada lado se
    escala en x con lo que se abre su comisura (x' = x · comisura_k / comisura_reposo), y sus lados se van hacia
    atrás con ella. Es un estiramiento uniforme de una banda lisa (no copia la forma del labio) y es EXACTO al
    combinar formas (lineal en el movimiento de la comisura). Solo la parte de delante: desde |x| = delante[0] hasta
    delante[1] × hw deja de estirarse (los lados de dentro de las mejillas no se mueven, para no salirse por la pared
    de la boca). Depende solo de x: toda la columna se estira igual (por profundidad salía un pliegue)."""
    from .grafo import ss
    Dz = np.asarray(D_zona)
    cL, cR = K.p[FO.icL], K.p[FO.icR]
    hL = (cL - K.C) @ K.X; hR = -((cR - K.C) @ K.X)
    dxL = Dz[FO.icL] @ K.X; dxR = -(Dz[FO.icR] @ K.X)
    dyL = Dz[FO.icL] @ K.Y; dyR = Dz[FO.icR] @ K.Y
    if max(abs(dxL), abs(dxR), abs(dyL), abs(dyR)) < 1e-7:
        return np.zeros_like(Pc)
    x = (Pc - K.C) @ K.X; w = (Pc - K.C) @ K.Y / K.hw
    lado = ss(-0.15 * K.hw, 0.15 * K.hw, x)                     # 1 a la izquierda (L), 0 a la derecha (R)
    k = lado * dxL / hL + (1 - lado) * dxR / hR
    dy = lado * dyL + (1 - lado) * dyR
    g = 1 - ss(delante[0] * K.hw, delante[1] * K.hw, np.abs(x))   # solo la parte de delante
    r = np.clip(np.abs(x) / ((lado * hL + (1 - lado) * hR)), 0, 1.3)
    return (x * k * g)[:, None] * K.X[None, :] + (dy * r * r * g)[:, None] * K.Y[None, :]


def sombrear_dientes(o, cara, K, color=(0.97, 0.96, 0.94, 1), lados=0.5):
    """color de los dientes: blanco roto y más oscuro hacia los lados (la boca les da sombra), con un atributo de
    color por vértice (`facs_sombra`, se exporta como COLOR_0 en el GLB) que multiplica el color base."""
    from .construir import puntos_en_cara
    from .grafo import ss
    me = o.data
    Pc = puntos_en_cara(o, cara)
    u = np.abs((Pc - K.C) @ K.X) / (K.hw * 0.93)
    f = 1 - lados * ss(0.6, 1.3, u)
    at = me.color_attributes.get('facs_sombra') or me.color_attributes.new('facs_sombra', 'FLOAT_COLOR', 'POINT')
    col = np.ones((len(f), 4)); col[:, :3] = f.clip(0, 1)[:, None]
    at.data.foreach_set('color', col.ravel())
    me.color_attributes.active_color = at
    m = me.materials[0] if me.materials else None
    if m is not None and m.use_nodes:
        nt = m.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        m.diffuse_color = color
        if b is not None:
            ca = nt.nodes.get('facs_sombra') or nt.nodes.new('ShaderNodeVertexColor'); ca.name = 'facs_sombra'
            ca.layer_name = 'facs_sombra'; ca.location = (b.location.x - 400, b.location.y)
            mix = nt.nodes.get('facs_mezcla') or nt.nodes.new('ShaderNodeMix'); mix.name = 'facs_mezcla'
            mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
            mix.location = (b.location.x - 200, b.location.y)
            mix.inputs[6].default_value = color
            nt.links.new(ca.outputs['Color'], mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
            b.inputs['Roughness'].default_value = 0.45
    return float(f.min())


def rehacer_dientes(cara, K, encia_color=(0.55, 0.22, 0.25, 1), grosor=0.0005):
    """sustituye la malla de Lian_Dientes_sup / _inf por arcadas nuevas (mismos objetos, materiales y
    modificadores). La fila de arriba de la superior y la de abajo de la inferior llevan color de encía."""
    from .construir import Piezas
    pz = Piezas(cara)
    out = {}
    for sup, o in ((True, pz.dsup), (False, pz.dinf)):
        if o is None:
            continue
        V, Fc, vs = dientes_arcada(cara, K, superior=sup)
        M = np.array(o.matrix_world.inverted() @ cara.matrix_world)
        Vl = V @ M[:3, :3].T + M[:3, 3]
        viejo = o.data
        me = bpy.data.meshes.new(o.name + '_facs')
        me.from_pydata([tuple(v) for v in Vl], [], Fc); me.update()
        for p in me.polygons:
            p.use_smooth = True
        # sin la encía de la vez anterior (cada rehacer añadía otra ranura: Lian llegó a 23)
        mats = [m for m in viejo.materials if m is not None and m.name != f'{cara.name}_Encia'][:1]
        for m in mats:
            me.materials.append(m)
        from ..util import material
        enc = material(f'{cara.name}_Encia', encia_color, rough=0.5)   # color también en el nodo (GLB)
        me.materials.append(enc)
        nf = len(Fc); filas = len(vs) - 1; cols = nf // filas
        # encía: la parte de la banda más allá de REF_BOCA['encia'] × hw desde la raíz (como en las referencias)
        alto = abs(vs[-1] - vs[0]); n_enc = max(1, int(round(filas * REF_BOCA['encia'] / max(alto, 1e-6))))
        for k, p in enumerate(me.polygons):
            j = k // cols
            if (sup and j >= filas - n_enc) or (not sup and j < n_enc):
                p.material_index = len(mats)
        o.data = me
        if viejo.users == 0:
            bpy.data.meshes.remove(viejo)
        sombrear_dientes(o, cara, K)
        for md in o.modifiers:
            if md.type == 'SOLIDIFY':
                md.thickness = grosor                   # banda fina (con 1 mm de 3/4 se veía gruesa)
        out[o.name] = len(me.vertices)
    return out


def colisiones(cara, obj, holgura=0.0, evaluado=True):
    """vértices de obj (dientes, lengua) metidos en la piel de la cara (lado de dentro de su superficie).
    Usa la cara y la pieza evaluadas (shape keys activas). Devuelve número, máximo (mm) y lista."""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    dg = bpy.context.evaluated_depsgraph_get()
    ce = cara.evaluated_get(dg); mc = ce.to_mesh()
    Mc = cara.matrix_world
    bvh = BVHTree.FromPolygons([tuple(Mc @ v.co) for v in mc.vertices], [tuple(p.vertices) for p in mc.polygons])
    ce.to_mesh_clear()
    oe = obj.evaluated_get(dg) if evaluado else obj
    mo = oe.to_mesh()
    Mo = obj.matrix_world
    dentro = []
    for v in mo.vertices:
        p = Mo @ v.co
        loc, nor, idx, d = bvh.find_nearest(p)
        if loc is None:
            continue
        s = (p - loc).dot(nor)
        if s < -holgura and d < 0.004:
            dentro.append(d)
    oe.to_mesh_clear()
    return {'n': len(dentro), 'max_mm': round(max(dentro) * 1000, 2) if dentro else 0.0}


def mover_pieza(obj, delta):
    """traslada la pieza (Basis y todas sus keys) en su espacio local."""
    me = obj.data
    n = len(me.vertices)
    d = np.tile(np.asarray(delta, float), n)
    if me.shape_keys:
        for k in me.shape_keys.key_blocks:
            c = np.zeros(n * 3); k.data.foreach_get('co', c); k.data.foreach_set('co', c + d)
    c = np.zeros(n * 3); me.vertices.foreach_get('co', c); me.vertices.foreach_set('co', c + d)
    me.update()


def peso_mandibula_suelto(K, P, banda=0.25):
    """peso de mandíbula para puntos sueltos (bolsa): por debajo del plano bisagra (pivote + línea de la
    boca) = 1, por encima = 0, banda suave de ±banda·hw."""
    n = np.cross(K.X, K.C - K.piv); n /= np.linalg.norm(n)       # normal del plano que contiene el eje X
    if n @ K.Z < 0:
        n = -n
    d = (np.asarray(P) - K.C) @ n / K.hw
    return 1 - ss(-banda, banda, d)


def oscurecer_comisuras(cara, K, material='Boca_Interior', alcance=1.0, cerca=0.6, detras=0.05):
    """forro de las comisuras: caras cerca del borde de los labios (d_boca < cerca × hw), por detrás de él
    (w > w_borde + detras × hw) y que no miran a cámara. oscurecer_forro no las coge porque con la boca cerrada
    se ven de lado; con la boca abierta de 3/4 salían como un poste blanco dentro de la comisura."""
    me = cara.data
    mi = next((i for i, m in enumerate(me.materials) if m and material in m.name), None)
    if mi is None:
        return {'error': 'sin material ' + material}
    n = len(K.P)
    zona = np.zeros(n, bool); zona[K.zona] = True
    rim = np.r_[K.borde_sup, K.borde_inf]
    ur = K.u[rim]; wr = K.w[rim]; o = np.argsort(ur)
    def lleno(x, fuera=0.0):
        a = np.full(n, fuera); a[K.zona] = x; return a
    d = lleno(K.d_boca / K.hw, 9.0); u = lleno(K.u); w = lleno(K.w)
    nrm = np.zeros(len(me.polygons) * 3); me.polygons.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
    cand = set()
    for p in me.polygons:
        vs = list(p.vertices)
        if not zona[vs].all():
            continue
        uu = u[vs].mean()
        if abs(uu) > alcance or d[vs].mean() > cerca:
            continue
        if w[vs].mean() > np.interp(uu, ur[o], wr[o]) + detras and nrm[p.index] @ (-K.Y) < 0.5:
            cand.add(p.index)
    # 0.6.9: como en oscurecer_forro, solo lo unido al borde de los labios (no los surcos del bigote o la barba)
    cand |= {p.index for p in me.polygons if p.material_index == mi}
    cambiadas = 0
    for i in conexas_al_borde(me, dentro_de_boca(K, cand, me), K.zona[rim]):
        p = me.polygons[i]
        if p.material_index != mi:
            p.material_index = mi; cambiadas += 1
    me.update()
    return {'cambiadas': cambiadas}


def ajustar_lengua(cara, K, subir=0.18, ensanchar=1.15):
    """sube la lengua (subir × hw) y la ensancha para que, con la boca abierta, asome rosada detrás de los
    dientes inferiores (en Lian quedaba 1–4 mm por debajo y la boca se veía negra). Siempre parte de la forma
    original (atributo facs_lengua_original) y arrastra el cambio a todas sus keys; después hay que rehacer las
    keys FACS de la lengua (formas_lengua + construir.crear)."""
    from .construir import Piezas, puntos_en_cara
    from .geometria import poner_basis
    lg = Piezas(cara).lengua
    if lg is None:
        return None
    me = lg.data
    n = len(me.vertices)
    if 'facs_lengua_original' not in me.attributes:
        co = np.zeros(n * 3); (me.shape_keys.key_blocks[0].data if me.shape_keys else me.vertices).foreach_get('co', co)
        at = me.attributes.new('facs_lengua_original', 'FLOAT_VECTOR', 'POINT'); at.data.foreach_set('vector', co)
    co = np.zeros(n * 3); me.attributes['facs_lengua_original'].data.foreach_get('vector', co); co = co.reshape(-1, 3)
    M = np.array(cara.matrix_world.inverted() @ lg.matrix_world)
    Pc = co @ M[:3, :3].T + M[:3, 3]
    x0 = K.C @ K.X
    ux = Pc @ K.X
    Pn = Pc + K.X[None, :] * ((ux - x0) * (ensanchar - 1))[:, None] + K.Z[None, :] * subir * K.hw
    Mi = np.linalg.inv(M)
    poner_basis(lg, Pn @ Mi[:3, :3].T + Mi[:3, 3])
    return {'subir_mm': round(subir * K.hw * 1000, 2)}


def _reposo(objs):
    """los rigs de armadura de estos objetos en REST mientras dura el bloque (las keys están en el espacio de
    reposo; con el cuerpo posado la relación entre objetos sale mal: Lian caminando estaba a 4 m)."""
    from contextlib import contextmanager

    @contextmanager
    def cm():
        rigs = {md.object for o in objs for md in o.modifiers if md.type == 'ARMATURE' and md.object}
        rigs |= {o.parent for o in objs if o.parent is not None and o.parent.type == 'ARMATURE'}
        antes = {r: r.data.pose_position for r in rigs}
        for r in rigs:
            r.data.pose_position = 'REST'
        bpy.context.view_layer.update()
        try:
            yield
        finally:
            for r, v in antes.items():
                r.data.pose_position = v
            bpy.context.view_layer.update()
    return cm()


def reparar_piel(cara, K, radio=3.0, max_lados=6):
    """Defectos de Tripo junto a la boca que se veían como manchas oscuras en la mejilla (Lian, 2026-10-19):
    - agujeros pequeños (lazos de borde de <= max_lados aristas, fuera de la abertura de la boca): se tapan con una
      cara de piel; por ellos se veía la bolsa del fondo;
    - solapas: un vértice con solo 2 aristas deja una cara doblada hacia fuera, oscura con la luz de arriba; el
      vértice va al punto medio de sus dos vecinos en Basis y en todas las keys (no se borra: los índices se
      guardan en la configuración).
    Solo dentro de `radio` × hw del centro de la boca. No mueve ningún otro vértice."""
    import bmesh, collections
    from .construir import _basis
    me = cara.data
    base = _basis(me)
    C0 = np.asarray(K.C); R = radio * K.hw
    cerca = lambda i: ((base[i] - C0) ** 2).sum() < R * R
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    # 1. solapas (vértices de valencia 2)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    pares = {v.index: [e.other_vert(v).index for e in v.link_edges] for v in bm.verts
             if len(v.link_edges) == 2 and cerca(v.index)}
    bm.free()
    if pares:
        kbs = me.shape_keys.key_blocks if me.shape_keys else []
        for kb in kbs:
            co = np.zeros(len(me.vertices) * 3); kb.data.foreach_get('co', co); co = co.reshape(-1, 3)
            for vi, nb in pares.items():
                co[vi] = co[nb].mean(0)
            kb.data.foreach_set('co', co.ravel())
        co = _basis(me)
        if not kbs:
            for vi, nb in pares.items():
                co[vi] = co[nb].mean(0)
        me.vertices.foreach_set('co', co.ravel()); me.update()
    # 2. agujeros pequeños
    activa = cara.active_shape_key_index
    cara.active_shape_key_index = 0
    vl = bpy.context.view_layer
    antes_activo = vl.objects.active
    vl.objects.active = cara
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bm = bmesh.from_edit_mesh(me)
        borde = [e for e in bm.edges if e.is_boundary and cerca(e.verts[0].index) and cerca(e.verts[1].index)]
        adj = collections.defaultdict(list)
        for e in borde:
            adj[e.verts[0]].append(e); adj[e.verts[1]].append(e)
        vis, grupos = set(), []
        for e in borde:
            if e in vis:
                continue
            st, comp = [e], []
            while st:
                x = st.pop()
                if x in vis:
                    continue
                vis.add(x); comp.append(x)
                for v in x.verts:
                    st += adj[v]
            grupos.append(comp)
        piel = 0
        nuevas = []
        for g in grupos:
            if len(g) <= max_lados:
                nuevas += bmesh.ops.holes_fill(bm, edges=g, sides=max_lados)['faces']
        uvs = list(bm.loops.layers.uv.values())
        for f in nuevas:
            f.material_index = piel; f.smooth = True
            vec = [l for e in f.edges for l in e.link_faces if l is not f]
            if vec and f.normal.dot(sum((v.normal for v in vec), f.normal * 0)) < 0:
                f.normal_flip()
            for uvl in uvs:
                for loop in f.loops:
                    otros = [l for l in loop.vert.link_loops if l.face is not f]
                    if otros:
                        loop[uvl].uv = otros[0][uvl].uv.copy()
        bmesh.update_edit_mesh(me)
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
        cara.active_shape_key_index = activa
        vl.objects.active = antes_activo
    return {'solapas': len(pares), 'agujeros': len(nuevas)}


def piel_exterior(cara, K, radio=7.0, direcciones=160, rejilla=36):
    """caras de piel de la cabeza que se ven desde fuera, en Basis: primer impacto de rayos que llegan desde
    todas las direcciones. El forro de Tripo sigue hacia la garganta con material de piel, pero con la boca
    cerrada no se ve desde fuera. Por la normal no se distinguía: el rayo de la mandíbula chocaba con el cuello
    y el del forro salía por la rendija de los labios."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .construir import _basis
    base = _basis(cara.data)
    R = radio * K.hw
    C0 = np.asarray(K.C)
    # 0.8.45 (Pegazo): los rayos chocan con toda la cabeza. Con solo las caras del radio, en una cabeza más alta que el radio el
    # rayo entraba por la coronilla que faltaba y daba por piel lo de dentro: la bolsa se arrugaba contra esa pared interior
    R2 = 2.5 * R
    d2 = ((np.array([base[list(p.vertices)].mean(0) for p in cara.data.polygons]) - C0) ** 2).sum(1)
    sel = np.nonzero(d2 < R2 * R2)[0].tolist()
    bvh = BVHTree.FromPolygons([tuple(v) for v in base], [tuple(cara.data.polygons[i].vertices) for i in sel])
    # los rayos que suben no pueden contar con el pecho: taparía la piel de debajo de la mandíbula y la bolsa saldría por ahí
    cerca = np.nonzero(d2 < R * R)[0].tolist()
    bvh_c = BVHTree.FromPolygons([tuple(v) for v in base], [tuple(cara.data.polygons[i].vertices) for i in cerca])
    vis = set()
    g = (1 + 5 ** 0.5) / 2
    ab = np.linspace(-R, R, rejilla)
    for k in range(direcciones):
        z = 1 - 2 * (k + 0.5) / direcciones; r = (1 - z * z) ** 0.5; t = 2 * np.pi * k / g
        d = Vector((r * np.cos(t), r * np.sin(t), z))
        u = d.orthogonal().normalized(); v = d.cross(u)
        o0 = Vector(C0) - d * (2 * R2)
        sube = z > 0.2
        for a in ab:
            for b in ab:
                _, nh, idx, _ = (bvh_c if sube else bvh).ray_cast(o0 + u * a + v * b, d, 4 * R2)
                if idx is None or (sube and nh.dot(d) > 0):    # subiendo por el hueco del cuello se ve la piel por dentro: no cuenta
                    continue
                i = cerca[idx] if sube else sel[idx]
                if d2[i] < R * R:
                    vis.add(i)
    no_piel = {i for i, m in enumerate(cara.data.materials)
               if m is None or m.name.endswith(('_Boca_Interior', '_Boca_Fondo', '_Pestana'))}
    return sorted(i for i in vis if cara.data.polygons[i].material_index not in no_piel)


def oscurecer_paredes(cara, K, material='Boca_Interior', radios=(1.8, 1.95, 1.42), hondo=1.0):
    """0.8.45 (Pegazo): restos de piel de Tripo dentro de la bolsa (una pared detrás de la boca) se veían blancos con la boca
    abierta. Las caras por detrás de los labios y dentro de la bolsa que ningún rayo puede ver desde fuera llevan el material del
    interior. La malla de rayos de piel_exterior es gruesa para esto: dejaba caras pequeñas de la mandíbula sin ver."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .construir import _basis
    me = cara.data
    mi = next((i for i, m in enumerate(me.materials) if m and material in m.name), None)
    if mi is None:
        return 0
    base = _basis(me)
    c = K.C + K.Y * 1.85 * K.hw - K.Z * 0.15 * K.hw
    rx, ry, rz = (r * K.hw for r in radios)
    # solo la cabeza: con el pecho y los hombros, la piel de debajo de la mandíbula tampoco veía el exterior y se pintaba
    alto = (base @ K.Z) > K.C @ K.Z - 3.0 * K.hw
    bvh = BVHTree.FromPolygons(base.tolist(), [tuple(p.vertices) for p in me.polygons if alto[list(p.vertices)].all()])
    # rayos casi horizontales: dentro de la cabeza todos chocan con la piel; el cuello y la mandíbula ven fuera por debajo de la barbilla
    dirs = [Vector((np.cos(a) * np.cos(e), np.sin(a) * np.cos(e), np.sin(e)))
            for a in np.radians(np.arange(0, 360, 15)) for e in np.radians((-20, 0, 20))]
    n = 0
    for p in me.polygons:
        if p.material_index == mi:
            continue
        cen = base[list(p.vertices)].mean(0)
        q = cen - K.C
        if q @ K.Y < hondo * K.hw:
            continue
        q = cen - c
        if (q @ K.X / rx) ** 2 + (q @ K.Y / ry) ** 2 + (q @ K.Z / rz) ** 2 >= 1:
            continue
        o = Vector(cen)
        c3 = base[list(p.vertices)]
        nv = Vector(np.cross(c3, np.roll(c3, -1, axis=0)).sum(0)).normalized()
        if sum(bvh.ray_cast(o + d * 0.0002, d, 10.0)[0] is None for d in dirs) < 3 and \
                all(bvh.ray_cast(o + d * 0.0002, d, 10.0)[0] is not None for d in (nv, -nv)):
            p.material_index = mi; n += 1
    me.update()
    return n


def contener_bolsa(cara, K, margen=0.12, exterior=None):
    """La bolsa del fondo no debe salir por la piel. Ancha (rx 1,8 hw) y estirada con las comisuras, en Lian
    asomaba por el lado de la cara en reposo y al sonreír (manchas oscuras que parecían un agujero en la mejilla).
    En Basis y en cada key de la bolsa, los vértices que quedan fuera de la piel exterior, o a menos de
    `margen` × hw de ella, vuelven hacia el centro de la bolsa (se mide con la piel de esa misma key).
    Va al final del paso de la boca, cuando la bolsa ya tiene todas sus keys."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .construir import Piezas, _basis
    fondo = Piezas(cara).fondo
    if fondo is None or fondo.data.shape_keys is None:
        return None
    ext = exterior if exterior is not None else piel_exterior(cara, K)
    polis = [tuple(cara.data.polygons[i].vertices) for i in ext]
    m = margen * K.hw
    with _reposo((cara, fondo)):
        M = np.array(cara.matrix_world.inverted() @ fondo.matrix_world)
    Mi = np.linalg.inv(M)
    kc = cara.data.shape_keys.key_blocks if cara.data.shape_keys else None
    base_c = _basis(cara.data)
    n_c = len(cara.data.vertices)
    out = {}
    for kb in fondo.data.shape_keys.key_blocks:
        co = np.zeros(len(kb.data) * 3); kb.data.foreach_get('co', co)
        P = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        if kc is not None and kb.name in kc and kb != fondo.data.shape_keys.key_blocks[0]:
            cc = np.zeros(n_c * 3); kc[kb.name].data.foreach_get('co', cc); F = cc.reshape(-1, 3)
        else:
            F = base_c
        bvh = BVHTree.FromPolygons([tuple(v) for v in F], polis)
        c = Vector(P.mean(0))
        movidos = 0
        for i, p in enumerate(P):
            # rayo desde el centro de la bolsa: si choca con la piel de fuera antes de llegar al vértice (menos el
            # margen), el vértice vuelve por el mismo rayo. Solo encoge. Con el punto más cercano y su normal salía
            # mal en los pliegues (la mejilla al sonreír) y en la oreja: movía la bolsa hasta 33 mm.
            d = Vector(p) - c
            L = d.length
            if L < 1e-9:
                continue
            d /= L
            hit = bvh.ray_cast(c, d, L + m)[0]
            if hit is not None:
                t = (hit - c).length - m
                if t < L:
                    P[i] = np.array(c + d * max(t, 0.2 * L)); movidos += 1
        if movidos:
            kb.data.foreach_set('co', (P @ Mi[:3, :3].T + Mi[:3, 3]).ravel())
            out[kb.name] = movidos
    _malla_igual_basis(fondo)
    return {'piel_exterior': len(polis), 'movidos': out}


def _malla_igual_basis(obj):
    kb = obj.data.shape_keys.key_blocks[0]
    co = np.zeros(len(kb.data) * 3); kb.data.foreach_get('co', co)
    obj.data.vertices.foreach_set('co', co); obj.data.update()


def poses_riesgo(cara):
    """combinaciones que más empujan la bolsa hacia fuera + todas las expresiones de la biblioteca."""
    from . import biblioteca as BI
    P = {}
    for L in ('L', 'R'):
        o = 'Left' if L == 'L' else 'Right'
        P[f'sonrisa_{L}_mandibula'] = {f'mouthSmile_{L}': 1, 'jawOpen': .7, f'mouthUpperUp_{L}': 1, f'mouthLowerDown_{L}': .8}
        P[f'sonrisa_{L}_lado'] = {f'mouthSmile_{L}': 1, f'mouth{o}': 1}
        P[f'estirar_{L}_mandibula'] = {f'mouthStretch_{L}': 1, 'jawOpen': 1, f'mouth{o}': .6}
    P['risa'] = {'mouthSmile': 1, 'jawOpen': .7, 'mouthUpperUp': 1, 'mouthLowerDown': .8, 'cheekSquint': 1}
    P['terror'] = {'jawOpen': .8, 'mouthStretch': 1, 'mouthLowerDown': 1, 'mouthUpperUp': .8, 'mouthFrown': .5}
    P['mejillas'] = {'cheekPuff': 1, 'mouthPucker': 1}
    for n, e in BI.cargar()['expresiones'].items():
        P['expr_' + n] = e.get('pesos', {})
    return P


def contener_combinaciones(cara, K, poses=None, exterior=None, margen=0.12, factor=0.6, vueltas=6):
    """Cada key de la bolsa queda dentro por separado (contener_bolsa), pero sumadas (sonrisa + mandíbula, sonrisa
    a un lado) la pared de atrás aún salía bajo la mandíbula. Con las poses combinadas evaluadas: en los vértices
    que salen, las keys activas que no son de la mandíbula mueven ese vértice `factor` veces menos; se repite hasta
    que no salga ninguno. Solo toca la pared de atrás: delante (junto a los dientes) no sale nunca."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .construir import Piezas
    from . import biblioteca as BI
    fondo = Piezas(cara).fondo
    if fondo is None or fondo.data.shape_keys is None:
        return None
    ext = exterior if exterior is not None else piel_exterior(cara, K)
    poses = poses or poses_riesgo(cara)
    m = margen * K.hw
    kbs = fondo.data.shape_keys.key_blocks
    basis = np.zeros(len(kbs[0].data) * 3); kbs[0].data.foreach_get('co', basis); basis = basis.reshape(-1, 3)
    ctrl = BI.control(cara)
    ad = ctrl.animation_data if ctrl else None
    act = ad.action if ad else None
    gn = [md for md in cara.modifiers if md.type == 'NODES' and md.show_viewport]
    hechos = {}

    def puntos(o):
        dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); me = e.to_mesh()
        P = np.array([v.co[:] for v in me.vertices]); e.to_mesh_clear(); return P
    try:
        if ad:
            ad.action = None
        for md in gn:
            md.show_viewport = False
        with _reposo((cara, fondo)):
            M = np.array(cara.matrix_world.inverted() @ fondo.matrix_world)
            for vuelta in range(vueltas):
                malos_total = 0
                for n, pesos in poses.items():
                    BI.aplicar(cara, {'pesos': pesos}, 1.0, True, None)
                    bpy.context.view_layer.update()
                    F = puntos(cara); S = puntos(fondo) @ M[:3, :3].T + M[:3, 3]
                    bvh = BVHTree.FromPolygons([tuple(v) for v in F], [tuple(cara.data.polygons[i].vertices) for i in ext])
                    c = Vector(S.mean(0)); malos = []; falta = {}
                    for i, p in enumerate(S):
                        d = Vector(p) - c; L = d.length; d /= max(L, 1e-9)
                        hit = bvh.ray_cast(c, d, L + m)[0]
                        if hit is not None and (hit - c).length - m < L:
                            malos.append(i); falta[i] = (L - ((hit - c).length - m), np.array(d))
                    if not malos:
                        continue
                    malos_total += len(malos)
                    if vuelta >= 3:
                        # lo que queda lo empuja la piel (la sonrisa mete la piel de la mandíbula): ese vértice vuelve
                        # hacia el centro de la bolsa en todas las keys (también Basis y la mandíbula)
                        Ri = np.linalg.inv(M[:3, :3])
                        for kb in kbs:
                            co = np.zeros(len(kb.data) * 3); kb.data.foreach_get('co', co); co = co.reshape(-1, 3)
                            for i, (f, d) in falta.items():
                                co[i] -= Ri @ (d * f)
                            kb.data.foreach_set('co', co.ravel())
                        basis = np.zeros(len(kbs[0].data) * 3); kbs[0].data.foreach_get('co', basis); basis = basis.reshape(-1, 3)
                        fondo.data.update()
                        continue
                    dg = bpy.context.evaluated_depsgraph_get()
                    kev = fondo.data.shape_keys.evaluated_get(dg).key_blocks
                    for kb in list(kbs)[1:]:
                        if kev[kb.name].value <= 1e-4 or kb.name == 'jawOpen':
                            continue
                        co = np.zeros(len(kb.data) * 3); kb.data.foreach_get('co', co); co = co.reshape(-1, 3)
                        co[malos] = basis[malos] + (co[malos] - basis[malos]) * factor
                        kb.data.foreach_set('co', co.ravel())
                        hechos[kb.name] = hechos.get(kb.name, 0) + len(malos)
                    fondo.data.update()
                if malos_total == 0:
                    break
    finally:
        for md in gn:
            md.show_viewport = True
        BI.aplicar(cara, {'pesos': {}}, 1.0, True, None)
        if ad:
            ad.action = act
        bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    _malla_igual_basis(fondo)
    return {'vueltas': vuelta + 1, 'quedan': malos_total, 'keys_tocadas': hechos}


def comprobar_bolsa(cara, K, poses, exterior=None):
    """{pose: (vértices de la bolsa fuera de la piel exterior, cuánto en mm)} con las formas combinadas
    evaluadas (pesos sobre el control), cuerpo en reposo y sin el modificador de nodos que cambia los índices."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .construir import Piezas
    from . import biblioteca as BI
    fondo = Piezas(cara).fondo
    ext = exterior if exterior is not None else piel_exterior(cara, K)
    ctrl = BI.control(cara)
    ad = ctrl.animation_data if ctrl else None
    act = ad.action if ad else None
    gn = [md for md in cara.modifiers if md.type == 'NODES' and md.show_viewport]
    out = {}

    def puntos(o):
        dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); me = e.to_mesh()
        P = np.array([v.co[:] for v in me.vertices]); e.to_mesh_clear(); return P
    try:
        if ad:
            ad.action = None
        for md in gn:
            md.show_viewport = False
        with _reposo((cara, fondo)):
            M = np.array(cara.matrix_world.inverted() @ fondo.matrix_world)
            for n, pesos in poses.items():
                BI.aplicar(cara, {'pesos': pesos}, 1.0, True, None)
                bpy.context.view_layer.update()
                F = puntos(cara); S = puntos(fondo) @ M[:3, :3].T + M[:3, 3]
                bvh = BVHTree.FromPolygons([tuple(v) for v in F], [tuple(cara.data.polygons[i].vertices) for i in ext])
                c = Vector(S.mean(0)); s = []
                for p in S:
                    d = Vector(p) - c; L = d.length; d /= max(L, 1e-9)
                    hit = bvh.ray_cast(c, d, L)[0]
                    s.append(L - (hit - c).length if hit is not None else -1.0)
                s = np.array(s)
                out[n] = (int((s > 0).sum()), round(float(s.max()) * 1000, 2))
    finally:
        for md in gn:
            md.show_viewport = True
        BI.aplicar(cara, {'pesos': {}}, 1.0, True, None)
        if ad:
            ad.action = act
        bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    return out


def colores_boca(cara, interior=(0.30, 0.09, 0.10, 1), fondo=(0.15, 0.04, 0.05, 1)):
    """interior de la boca rojo oscuro (no negro): con negro la boca abierta parecía un agujero."""
    for nombre, c in ((f'{cara.name}_Boca_Interior', interior), (f'{cara.name}_Boca_Fondo', fondo)):
        m = bpy.data.materials.get(nombre)
        if m is None:
            continue
        m.diffuse_color = c
        if m.use_nodes:
            b = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
            if b is not None and not b.inputs['Base Color'].is_linked:
                b.inputs['Base Color'].default_value = c


def formas_lengua(cara, K, grados_arriba=20.0, fuera=0.27):
    """Lengua: tongueUp (la punta sube detrás de los incisivos: T, D, N, L, R) y tongueOut (asoma entre los
    dientes: la Z/C de España). Giro/traslado de la parte delantera, con caída suave hacia atrás. En la cara se
    crean las mismas keys vacías para que el canal exista (los drivers de las piezas copian su valor)."""
    from .construir import poner_key, Piezas, puntos_en_cara, a_local
    lg = Piezas(cara).lengua
    if lg is None:
        return None
    Pc = puntos_en_cara(lg, cara)
    prof = Pc @ K.Y                         # profundidad (+ hacia dentro)
    p_tip, p_back = prof.min(), prof.max()
    largo = p_back - p_tip
    w = 1 - ss(p_tip + 0.35 * largo, p_tip + 0.65 * largo, prof)     # 1 en la punta, 0 al fondo
    piv = Pc[np.argmin(np.abs(prof - (p_tip + 0.5 * largo)))].copy()
    piv = K.C + K.Y * ((piv - K.C) @ K.Y) + K.Z * ((Pc - K.C) @ K.Z).mean()
    th = -np.radians(grados_arriba) * w
    D_up = rot_eje(Pc, piv, K.X, th) - Pc
    D_out = (w[:, None] * (-K.Y * fuera * K.hw - K.Z * 0.06 * K.hw)[None, :])
    n = len(K.P)
    for nombre, D in (('tongueUp', D_up), ('tongueOut', D_out)):
        poner_key(lg, nombre, a_local(lg, cara, D))
        poner_key(cara, nombre, np.zeros((n, 3)))
    return {'punta_mm': round(float(np.linalg.norm(D_up, axis=1).max()) * 1000, 2)}
