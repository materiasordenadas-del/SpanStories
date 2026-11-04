# Detección automática de los puntos de la cara (paso 2). Coloca marcadores que el usuario puede corregir.
#  - Boca: perfil de rayos desde delante en columnas X; la línea de la boca es la zona más hundida entre
#    dos labios salientes. La comisura es donde ese hundimiento se acaba (y se pega al vértice polo).
#  - Centro de cada labio: entre la línea de la boca y lo más saliente del labio (calibrado en Vale:
#    58 % arriba, 69 % abajo). Las cadenas del rig van por ahí, no por el borde de contacto.
#  - Ojos: lazos de borde de la cara encima de la boca (hueco del ojo); globo calibrado en Vale.
#  - Cejas: islas pequeñas encima de cada ojo. Pestañas: materiales distintos de la piel junto al ojo.
# Supone el personaje mirando a −Y, con Z arriba y la cara centrada en X = 0.
import bpy, bmesh
import numpy as np
from mathutils import Vector
from . import util, marco as MK, ojos_esculpidos as OE

H_VALE = 0.209          # alto de la isla de la cara de Vale
F_SUP, F_INF = 0.58, 0.69


def _perfil(bvh, y0, x, z0, z1, dz):
    zs = np.arange(z0, z1, dz); ys = np.empty(len(zs))
    for i, z in enumerate(zs):
        h = bvh.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)))
        ys[i] = h[0].y if h[0] is not None else 1e3
    return zs, ys


def _columna(bvh, y0, x, zc, S, ventana):
    zs, ys = _perfil(bvh, y0, x, zc - 0.009 * S, zc + 0.009 * S, 0.0001 * S)
    w = np.abs(zs - zc) < ventana
    if not w.any():
        return None
    i = np.where(w)[0][np.argmax(ys[w])]; zsl = zs[i]
    up = (zs > zsl) & (zs < zsl + 0.008 * S); lo = (zs < zsl) & (zs > zsl - 0.008 * S)
    if not up.any() or not lo.any():
        return None
    bu, bl = ys[up].min(), ys[lo].min()
    zbu = zs[up][np.abs(ys[up] - bu) < 0.0001 * S].mean()
    zbl = zs[lo][np.abs(ys[lo] - bl) < 0.0001 * S].mean()
    front = max(bu, bl)
    depth = min(ys[i], front + 0.01 * S) - front
    thr = front + 0.5 * depth
    j = i
    while j + 1 < len(zs) and ys[j + 1] > thr: j += 1
    k = i
    while k - 1 >= 0 and ys[k - 1] > thr: k -= 1
    jt = min(j + 1, len(zs) - 1); kb = max(k - 1, 0)
    ST = Vector((x, ys[jt], zs[jt])); SB = Vector((x, ys[kb], zs[kb]))
    if ys[jt] > 10: ST.y = front
    if ys[kb] > 10: SB.y = front
    return {'z': (ST.z + SB.z) / 2, 'ST': ST, 'SB': SB, 'zbu': zbu, 'zbl': zbl, 'bu': bu, 'bl': bl,
            'depth': depth}


def _hit(bvh, y0, x, z):
    h = bvh.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)))
    return Vector((x, h[0].y, z)) if h[0] is not None else None


def radio_comun(a, b):
    """mismo radio para los dos globos: el mayor, pero como mucho un 8 % más que el menor (con el mayor de Martín,
    17 frente a 13,8 mm, el recorte en el globo se comió el borde del párpado)."""
    return min(max(a, b), 1.08 * min(a, b))


def centrado(Pf):
    """(centro X de la isla, media anchura). La detección lanza rayos por x = 0, crea la comisura R como -x de la L
    y decide el lado del ojo por el signo de x: la cara tiene que estar centrada en X = 0 (coordenadas locales)."""
    cx = 0.5 * (float(Pf[:, 0].max()) + float(Pf[:, 0].min()))
    return cx, 0.5 * (float(Pf[:, 0].max()) - float(Pf[:, 0].min()))


def exigir_centrado(Pf, tol=0.06):
    # 0.8.2: 0,03 descartaba en silencio la cara de Ichigo (centro a -2,9 mm con media anchura de 91 mm: un mechón de pelo
    # de la isla basta) y la búsqueda automática acababa en la cintura. Un desvío de 6 % o 4 mm no cambia la detección.
    cx, w = centrado(Pf)
    if abs(cx) > max(tol * w, 0.004):
        raise RuntimeError(f'La cara no está centrada en X = 0 (su centro está en x = {cx * 1000:.1f} mm). '
                           'Mueve la malla (no solo el objeto) para que el centro de la cara quede en X = 0, aplica la '
                           'transformación y repite. Al terminar se puede devolver el personaje a su sitio.')


def boca(cara, hint, isl=None, P=None):
    """-> dict con comisura, labio_sup, labio_inf, columnas (para medidas) y escala."""
    me = cara.data
    P = util.coords(me) if P is None else P
    isl = util.islas(me) if isl is None else isl
    kd = util.kd_de(P, range(len(P)))
    _, seed, _ = kd.find(Vector(hint))
    face = isl == isl[seed]
    # 0.8.2 (Ichigo/Kakashi, cuerpo entero en una sola isla de piel): cfg['cabeza_zmin'] (m) recorta la isla a la cabeza;
    # sin él la escala sale de la altura de todo el cuerpo (escala_vs_vale 5) y la boca/ojos se miden mal.
    zmin = MK.cfg(cara).get('cabeza_zmin')
    if zmin is not None:
        face = face & (P[:, 2] >= float(zmin))
    Pf = P[face]
    if zmin is None:
        exigir_centrado(Pf)           # con cabeza_zmin el recorte incluye pelo/orejas y su centro no vale (la cara sí está centrada)
        # 0.8.3 (Ichigo: la piel sigue hasta el pecho, S = 2,5): sin cabeza_zmin la escala salía del cuerpo y las ventanas
        # de los labios llegaban a la nariz y al mentón. La cabeza no baja de la boca más de 0,6 veces lo que sube.
        corte = hint[2] - 0.6 * (float(Pf[:, 2].max()) - hint[2])
        if Pf[:, 2].min() < corte:
            face = face & (P[:, 2] >= corte); Pf = P[face]
    H = Pf[:, 2].max() - Pf[:, 2].min()
    S = H / H_VALE
    bvh = util.bvh_de(P, me, face)
    y0 = Pf[:, 1].min() - 1.0
    x0 = 0.0005 * S
    # línea de la boca en el centro: el hundimiento entre labios más cercano al cursor
    zs, ys = _perfil(bvh, y0, x0, hint[2] - 0.035 * S, hint[2] + 0.035 * S, 0.0001 * S)
    cands = []
    for i in range(len(zs)):
        win = np.abs(zs - zs[i]) < 0.0015 * S
        if ys[i] < ys[win].max(): continue
        up = (zs > zs[i]) & (zs < zs[i] + 0.008 * S); lo = (zs < zs[i]) & (zs > zs[i] - 0.008 * S)
        if not up.any() or not lo.any(): continue
        if ys[up].min() < ys[i] - 0.0008 * S and ys[lo].min() < ys[i] - 0.0008 * S:
            cands.append(zs[i])
    if not cands:
        raise RuntimeError('No encuentro la línea de la boca cerca del cursor 3D')
    zc = min(cands, key=lambda z: abs(z - hint[2]))
    c0 = _columna(bvh, y0, x0, zc, S, 0.002 * S)
    d0 = c0['depth']
    cols = [(x0, c0)]
    x, prev = x0, c0
    while True:
        x2 = x + 0.0005 * S
        c = _columna(bvh, y0, x2, prev['z'], S, 0.003 * S)
        if c is None or c['depth'] < 0.25 * d0 or x2 > 0.06 * S:
            lo_, hi_ = x, x2
            for _ in range(6):
                xm = (lo_ + hi_) / 2
                cm = _columna(bvh, y0, xm, prev['z'], S, 0.003 * S)
                if cm is not None and cm['depth'] >= 0.25 * d0:
                    lo_, prev = xm, cm
                else:
                    hi_ = xm
            x = lo_
            break
        cols.append((x2, c)); x, prev = x2, c
    corner = _hit(bvh, y0, x, prev['z'])
    # 0.8.3 (Ichigo, boca entreabierta): el rayo de la comisura pasaba por la rendija y daba en la nuca (y = +49 mm);
    # de ahí salían también mandíbula y mentón detrás de la cabeza. Más hondo que los labios no es la comisura.
    frente = max(prev['bu'], prev['bl'])
    if corner is None or corner.y > frente + 0.006 * S:
        corner = Vector((x, frente, prev['z']))
    # pegar al polo de la comisura (vértice de muchas aristas) si hay uno cerca
    nb = util.vecinos(me)
    best = None
    for co, i, d in kd.find_range(corner, 0.0015 * S):
        if face[i] and len(nb[i]) >= 6 and (best is None or d < best[1]):
            best = (i, d)
    if best:
        corner = Vector(P[best[0]]); corner.x = abs(corner.x)
    ls = _hit(bvh, y0, 0.0, c0['z'] + F_SUP * (c0['zbu'] - c0['z']))
    li = _hit(bvh, y0, 0.0, c0['z'] + F_INF * (c0['zbl'] - c0['z']))
    return {'seed': int(seed), 'S': S, 'H': H, 'comisura': corner, 'labio_sup': ls, 'labio_inf': li,
            'z_boca': c0['z'], 'face': face, 'P': P, 'isl': isl}


def _lazos_borde(me, mask):
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    adj = {}
    for e in bm.edges:
        if e.is_boundary and mask[e.verts[0].index]:
            a, b = e.verts[0].index, e.verts[1].index
            adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    bm.free()
    out, vis = [], set()
    for s in adj:
        if s in vis: continue
        comp, st = [], [s]; vis.add(s)
        while st:
            x = st.pop(); comp.append(x)
            for y in adj[x]:
                if y not in vis: vis.add(y); st.append(y)
        out.append(comp)
    return out


def ojos(cara, B, rapido=False):
    """centro y radio de cada globo (desde el hueco del ojo) + cejas y pestañas (rapido: solo los globos, para
    buscar_boca)."""
    me = cara.data; P, face, isl = B['P'], B['face'], B['isl']
    hw = B['comisura'].x
    zb = B['z_boca']
    res = {'hueco': False, 'esculpidos': False}
    cand = {'L': None, 'R': None}
    bvh = util.bvh_de(P, me, face)
    for comp in _lazos_borde(me, face):
        if len(comp) < 8: continue
        c = P[comp]
        cx, cz = c[:, 0].mean(), c[:, 2].mean()
        if cz < zb + 2.0 * hw or abs(cx) < 0.5 * hw: continue
        # un hueco de ojo de verdad se ve a través; un agujerito junto a un ojo esculpido, no
        h = bvh.ray_cast(Vector((cx, -10.0, cz)), Vector((0, 1, 0)))
        if h[0] is not None and h[0].y < c[:, 1].mean() + 0.3 * hw: continue
        lado = 'L' if cx > 0 else 'R'
        if cand[lado] is None or len(comp) > len(cand[lado]):
            cand[lado] = comp
    eyes = {}
    if cand['L'] and cand['R']:
        res['hueco'] = True
        res['cobertura'] = 1.0
        for lado, comp in cand.items():
            c = P[comp]; sx = 1 if lado == 'L' else -1
            hwe = (c[:, 0].max() - c[:, 0].min()) / 2
            cxb = (c[:, 0].max() + c[:, 0].min()) / 2
            eyes[lado] = (Vector((cxb - sx * 0.41 * hwe, c[:, 1].mean() + 0.735 * hwe,
                                  (c[:, 2].max() + c[:, 2].min()) / 2 - 0.05 * hwe)), 1.40 * hwe)
        # la malla no suele ser simétrica: manda el hueco más grande (un globo pequeño deja asomar el forro)
        ref = max(('L', 'R'), key=lambda k: eyes[k][1])
        c, R = eyes[ref]
        cx = abs(c.x)
        # 0.8.3 (Ichigo): la profundidad de Vale (0,735 hwe) dejaba el globo 8 mm por delante del borde del párpado
        # (exoftalmos); luego cuenca() empujaba ese borde hasta apoyarlo en el globo y la base quedaba con los ojos
        # abiertos de más. El globo va como mucho hasta tocar el borde del hueco (más la holgura de apoyo de la
        # cuenca), así el borde no se mueve y la abertura de la base es la del original.
        # holgura: la de apoyo de la cuenca o lo que la córnea de los ojos de Lian sobresale del globo más la holgura de
        # parpados() (≈ 8,5 % de R), lo que sea mayor: si el borde queda dentro, parpados() lo recorta y abre la base
        hol = max(0.001 * R / MK.R_OJO_V, 0.09 * R)
        y = c.y
        for lado, comp in cand.items():
            q = P[comp]; sx = 1 if lado == 'L' else -1
            rho2 = (q[:, 0] - sx * cx) ** 2 + (q[:, 2] - c.z) ** 2
            y = max(y, float(np.max(q[:, 1] + np.sqrt(np.maximum((R + hol) ** 2 - rho2, 0.0)))))
        res['ojo_retrasado_mm'] = round((y - c.y) * 1000, 2)
        eyes = {'L': (Vector((cx, y, c.z)), R), 'R': (Vector((-cx, y, c.z)), R)}
    else:
        s = hw / MK.HW_V
        mc = Vector((0, B['comisura'].y, B['comisura'].z))
        c = mc + (MK.OJO_V - MK.MC_V) * s
        eyes = {'L': (c, MK.R_OJO_V * s), 'R': (Vector((-c.x, c.y, c.z)), MK.R_OJO_V * s)}
        # ¿ojos esculpidos en la piel? (bulto esférico): se ajusta una esfera a cada uno
        # Tripo: el ojo es medio globo dentro de la malla de la cara -> se busca en la geometría
        # (0.6.4) Martín: ojos pequeños para su boca (r = 0,42 del de Vale a su escala): el límite era 0,4
        fits = {k: v for k, v in OE.buscar_en_malla(me, P, face, mc, hw, isl).items()
                if 0.25 * MK.R_OJO_V * s < v[1] < 2.5 * MK.R_OJO_V * s}
        if len(fits) == 2:
            res['esculpidos'] = True
            res['cobertura'] = round(min(fits['L'][3], fits['R'][3]), 3)
            sim = OE.simetria_ojos(fits['L'], fits['R'])
            if not sim['ok']:
                res['aviso_ojos'] = (f"Los ojos L y R no se parecen en espejo (desvío {sim['desvio_mm']} mm, radios "
                                     f"×{sim['razon_radios']}): mira la foto de partes y corrige ojo.L/R antes de seguir")
            # cada ojo en su centro (Tripo no es simétrico: en Martín 3,6 mm de diferencia en X) y el mismo radio
            R = radio_comun(fits['L'][1], fits['R'][1])
            eyes = {k: (Vector(fits[k][0]), R) for k in ('L', 'R')}
    res['ojos'] = eyes
    if rapido:
        return res
    R = eyes['L'][1]
    # cejas: islas pequeñas encima de cada ojo
    cejas = {}
    for lado, (c, _) in eyes.items():
        best = None
        for k in np.unique(isl):
            if k == isl[B['seed']]: continue
            ids = np.where(isl == k)[0]
            if len(ids) > 1500: continue
            q = P[ids]; qc = (q.min(0) + q.max(0)) / 2
            if not (c.z + 0.4 * R < qc[2] < c.z + 1.6 * R): continue
            if abs(qc[0] - c.x) > 1.0 * R: continue
            # una ceja es más ancha que alta (Lian: un mechón de 84 mm de alto pasaba por ceja y bajaba el párpado)
            ext = q.max(0) - q.min(0)
            # 0.6.9 (Tronchatoro): una ceja gruesa mide 0,89 R de alto y se descartaba con el límite de 0,8
            if ext[2] > 1.3 * R or ext[0] < 1.2 * ext[2]: continue
            sc = abs(qc[0] - c.x) + abs(qc[2] - c.z - R)
            if best is None or sc < best[1]: best = (int(ids[0]), sc)
        cejas[lado] = best[0] if best else -1
    res['cejas'] = cejas
    # pestañas: materiales de la cara distintos de la piel cerca de cada ojo
    mi = np.zeros(len(me.polygons), int); me.polygons.foreach_get('material_index', mi)
    fv = [p.vertices[0] for p in me.polygons]
    fmask = face[fv]
    piel = int(np.bincount(mi[fmask]).argmax())
    cen = np.array([P[list(p.vertices)].mean(0) for p in me.polygons])
    sup, inf = set(), set()
    for k in np.unique(mi[fmask]):
        if k == piel: continue
        sel = fmask & (mi == k)
        dz = []
        for lado, (c, _) in eyes.items():
            near = sel & (np.linalg.norm(cen - np.array(c), axis=1) < 1.7 * R)
            if near.any(): dz.extend(cen[near, 2] - c.z)
        if len(dz) < 4: continue
        nm = me.materials[k].name.lower() if me.materials[k] else ''
        if 'boca' in nm or 'interior' in nm: continue
        if nm.startswith(cara.name.lower() + '_') or any(t in nm for t in ('cuenca', 'delineado', 'boca', 'oclusion')): continue
        (sup if np.mean(dz) > 0 else inf).add(int(k))
    res['pestanas_sup'] = sorted(sup); res['pestanas_inf'] = sorted(inf); res['piel'] = piel
    return res


def mandibula(cara, B, O):
    """0.6.9 (Lamine): pivote y mentón desde la malla. Escalados de Vale con el ancho de la boca caían mal en
    cabezas de otras proporciones (Lamine: pivote 50 mm detrás de la oreja, mentón en el cuello).
      mentón: perfil de frente en x = 0 bajo la boca; el mentón es lo más saliente antes del salto al cuello;
              el marcador va dentro, entre esa superficie y la profundidad de las comisuras (Vale).
      pivote: delante de la oreja (lo más ancho de la cabeza entre boca y ojos, por detrás de las comisuras), a la
              altura de Vale. -> (pivote, mentón, avisos); lo que no se encuentra queda de Vale a escala."""
    P, face, me = B['P'], B['face'], cara.data
    c = B['comisura']; hw = c.x; S = hw / MK.HW_V
    mc = Vector((0, c.y, c.z))
    piv = mc + (MK.JAW_PIV_V - MK.MC_V) * S
    men = mc + (MK.JAW_END_V - MK.MC_V) * S
    av = []
    bvh = util.bvh_de(P, me, face)
    Pf = P[face]
    zs, ys = _perfil(bvh, Pf[:, 1].min() - 1.0, 0.0, B['z_boca'] - 6 * hw, B['z_boca'] - 0.5 * hw, 0.02 * hw)
    # mentón = lo más saliente entre 1 y 4 hw bajo la boca; bajando desde ahí, donde la piel ya se ha ido 1 hw
    # hacia atrás empieza el cuello (borde de abajo del mentón)
    zona = (zs > B['z_boca'] - 4 * hw) & (zs < B['z_boca'] - 1 * hw) & (ys < 10)
    debajo = np.array([], int)
    if zona.any():
        k = np.where(zona)[0][np.argmin(ys[zona])]
        y_frente, z_frente = ys[k], zs[k]
        debajo = np.where((zs < z_frente) & ((ys > y_frente + 1.0 * hw)))[0]
    if len(debajo):
        z_bajo = zs[debajo[-1]]
        men = Vector((0.0, y_frente + 0.5 * (c.y - y_frente), z_bajo + 0.5 * (z_frente - z_bajo)))
    else:
        av.append('No encuentro el borde del mentón en el perfil: «menton» es de Vale a escala; míralo en la foto.')
    ojo_z = O['ojos']['L'][0].z if O.get('ojos') else c.z + 3 * hw
    # 0.8.2 (Ichigo): desde 1,5 hw detrás de la boca, no desde la boca: patillas y mechones de delante son «lo más ancho»
    # y el pivote caía sobre la mejilla (a la altura de la boca, sin ninguna profundidad), con lo que la mandíbula giraba mal
    sel = (Pf[:, 2] > c.z) & (Pf[:, 2] < ojo_z) & (Pf[:, 1] > c.y + 1.5 * hw) & (Pf[:, 1] < c.y + 8 * hw)
    if sel.sum() > 20:
        q = Pf[sel]
        oreja = q[np.argmax(np.abs(q[:, 0]))]
        if abs(oreja[0]) > 2.0 * hw:
            # z: tercio bajo de la parte ancha de la oreja (altura del trago, no la hélice), dentro de boca..ojos
            zo = float(np.percentile(q[np.abs(q[:, 0]) > 0.8 * abs(oreja[0]), 2], 30))
            zo = min(max(zo, c.z + 0.5 * hw), ojo_z)
            # y: delante del trago = borde delantero de la parte ancha de la oreja menos 0,3 hw
            yo = float(q[np.abs(q[:, 0]) > 0.8 * abs(oreja[0]), 1].min())
            piv = Vector((0.0, yo - 0.3 * hw, zo))
        else:
            av.append('No encuentro la oreja: «mandibula» es de Vale a escala; míralo en la foto (va delante de la oreja).')
    return piv, men, av


def crear_marcadores(cara, B, O):
    col = util.coleccion(MK.coleccion_marcas(cara))
    hw = B['comisura'].x
    c = B['comisura']
    pos = {'comisura.L': c, 'comisura.R': Vector((-c.x, c.y, c.z)),
           'labio_sup': B['labio_sup'], 'labio_inf': B['labio_inf']}
    pos['mandibula'], pos['menton'], O['avisos_mandibula'] = mandibula(cara, B, O)
    for lado in ('L', 'R'):
        pos['ojo.' + lado] = O['ojos'][lado][0]
    for k, p in pos.items():
        nm = MK.nombre_marca(cara, k)
        e = bpy.data.objects.get(nm)
        if e is None:
            e = bpy.data.objects.new(nm, None); col.objects.link(e)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = O['ojos']['L'][1] if k.startswith('ojo') else 0.08 * hw
        e.scale = (1, 1, 1); e.rotation_euler = (0, 0, 0)
        e.location = p
        e.show_in_front = True
    d = MK.cfg(cara)
    d.update({'seed': B['seed'], 'cejas': O['cejas'], 'pestanas_sup': O['pestanas_sup'],
              'pestanas_inf': O['pestanas_inf'], 'piel': O['piel'], 'ojos_hueco': O['hueco'],
              'ojos_esculpidos': O['esculpidos']})
    MK.guardar_cfg(cara, d)
    return pos


def simetrizar(cara):
    for a, b in (('comisura.L', 'comisura.R'), ('ojo.L', 'ojo.R')):
        ea = bpy.data.objects.get(MK.nombre_marca(cara, a)); eb = bpy.data.objects.get(MK.nombre_marca(cara, b))
        if ea and eb:
            p = ea.location.copy(); eb.location = (-p.x, p.y, p.z)
            eb.empty_display_size = ea.empty_display_size; eb.scale = ea.scale
    for k in ('labio_sup', 'labio_inf', 'mandibula', 'menton'):
        e = bpy.data.objects.get(MK.nombre_marca(cara, k))
        if e: e.location.x = 0.0


def _surcos(zs, ys, S):
    """z de los hundimientos entre dos salientes (la regla de boca(), en todo el perfil)."""
    out = []
    for i in range(len(zs)):
        win = np.abs(zs - zs[i]) < 0.0015 * S
        if ys[i] > 10 or ys[i] < ys[win].max(): continue
        up = (zs > zs[i]) & (zs < zs[i] + 0.008 * S); lo = (zs < zs[i]) & (zs > zs[i] - 0.008 * S)
        if not up.any() or not lo.any(): continue
        if ys[up].min() < ys[i] - 0.0008 * S and ys[lo].min() < ys[i] - 0.0008 * S:
            out.append((float(zs[i]), float(ys[i])))
    # surcos seguidos (la misma boca en varias muestras): uno por grupo
    limpio = []
    for z, y in out:
        if limpio and z - limpio[-1][0] < 0.002 * S:
            continue
        limpio.append((z, y))
    return limpio


def _cobertura_creible(B, O, hw):
    """cobertura de los ojos si caben con esta boca (encima, a 1–6 medias anchuras, y no más atrás que ellos); si no, 0."""
    cob = O.get('cobertura', 0.0) if (O['hueco'] or O['esculpidos']) and not O.get('aviso_ojos') else 0.0
    if cob and O.get('ojos'):
        oj = O['ojos']['L'][0]
        dz = (oj.z - B['z_boca']) / hw
        # los ojos van ENCIMA de la boca (Vale 3,0; Carlitos 2,3) y la boca no está detrás de los ojos (Ichigo: un surco
        # del cuello, de espaldas, con «ojos» encima)
        if not 1.0 < dz < 6.0 or B['comisura'].y > oj.y + 1.0 * hw:
            cob = 0.0
    return cob


def _boca_desde_ojos(cara, isl, P):
    """boca a partir de los pivotes de ojo que ya tiene el personaje: separación Vale (boca a 1,88 veces la media separación
    de los ojos por debajo, ancho 1,7). Prueba tres profundidades y se queda con la que dé una boca creíble."""
    piv = MK.cfg(cara).get('pivotes')
    if not piv or len(piv) < 2:
        return None
    ob = [bpy.data.objects.get(n) for n in piv[:2]]
    if any(o is None for o in ob):
        return None
    a, b = ob[0].matrix_world.translation, ob[1].matrix_world.translation
    e = abs(a.x - b.x) / 2
    if e < 1e-4:
        return None
    ez, ey = 0.5 * (a.z + b.z), 0.5 * (a.y + b.y)
    mejor = None
    for k in (1.0, 1.6, 2.2):
        hint = (0.0, ey - k * e, ez - 1.88 * e)
        try:
            B = boca(cara, hint, isl, P)
            O = ojos(cara, B, rapido=True)
        except Exception:
            continue
        hw = B['comisura'].x
        cob = _cobertura_creible(B, O, hw)
        if cob and (mejor is None or cob > mejor['cobertura_ojos']):
            mejor = {'punto': [round(v, 5) for v in hint], 'cobertura_ojos': cob,
                     'media_anchura_mm': round(hw * 1000, 1), 'isla': -1, 'desde_ojos': True}
    return mejor


def buscar_boca(cara, max_islas=8):
    """0.6.9: el punto cerca de la boca sin cursor ni rayos a mano. En cada isla grande que cruza x = 0 busca los
    surcos entre dos salientes del perfil de frente, prueba boca() en cada uno y se queda con el que tiene
    ojos encima (hueco o globo de Tripo que se parecen en espejo). -> {'punto', 'seguro', 'candidatos'}"""
    me = cara.data
    P = util.coords(me)
    isl = util.islas(me)
    cuenta = np.bincount(isl)
    probados, vistas, descartes = [], [], []     # 0.8.2: descartes = por qué se saltó cada isla/surco (antes en silencio)
    for k in np.argsort(-cuenta)[:max_islas]:
        face = isl == k
        Pf = P[face]
        if cuenta[k] < 200 or not (Pf[:, 0].min() < 0 < Pf[:, 0].max()):
            continue
        H = Pf[:, 2].max() - Pf[:, 2].min(); S = H / H_VALE
        bvh = util.bvh_de(P, me, face)
        y0 = Pf[:, 1].min() - 1.0
        zs, ys = _perfil(bvh, y0, 0.0005 * S, Pf[:, 2].min(), Pf[:, 2].max(), 0.0002 * S)
        for z, y in _surcos(zs, ys, S):
            # con la boca abierta el rayo del surco entra hasta el fondo (Carlitos: y = +47 mm): el punto se pone
            # en el frente de los labios, si no la semilla caía en la lengua
            cerca = (np.abs(zs - z) < 0.004 * S) & (ys < 10)
            hint = (0.0, float(ys[cerca].min()) if cerca.any() else y, z)
            try:
                B = boca(cara, hint, isl, P)
            except Exception as e:
                descartes.append({'isla': int(k), 'z': round(float(z), 3), 'motivo': str(e)[:90]})
                continue
            hw = B['comisura'].x
            if not (0.25 * MK.HW_V * S < hw < 4 * MK.HW_V * S):
                descartes.append({'isla': int(k), 'z': round(float(z), 3), 'motivo': f'anchura de boca fuera de rango ({hw * 1000:.0f} mm)'})
                continue
            # varios surcos dan la misma boca (labio, bigote): la misma comisura no se vuelve a probar
            if any((B['comisura'] - c).length < 0.1 * hw for c in vistas):
                continue
            vistas.append(B['comisura'].copy())
            try:
                O = ojos(cara, B, rapido=True)
            except Exception:
                O = {'hueco': False, 'esculpidos': False}
            cob = _cobertura_creible(B, O, hw)
            probados.append({'punto': [round(v, 5) for v in hint], 'cobertura_ojos': cob,
                             'media_anchura_mm': round(hw * 1000, 1), 'isla': int(k)})
    if not any(c['cobertura_ojos'] >= 0.5 for c in probados):
        # 0.8.2 (Ichigo): el pelo cuelga delante de la cara y el perfil de frente no ve los labios; si el personaje ya tiene
        # ojos puestos (pivotes), la boca se busca a la distancia de Vale por debajo de ellos.
        extra = _boca_desde_ojos(cara, isl, P)
        if extra is not None:
            probados.append(extra)
    if not probados:
        raise RuntimeError('No encuentro ninguna boca (surco entre dos labios) en x = 0. Pon el cursor 3D en la boca '
                           f'y usa detectar(cara, cursor). Descartes: {descartes[:4]}')
    # 0.6.9 (Carlitos con cuerpo): no vale la primera con «ojos»: en el pecho los pectorales encajan dos esferas
    # simétricas. Gana la de ojos con más cobertura (un globo de Tripo ≥ 0,5 de media esfera; un pectoral, poco)
    m = max(probados, key=lambda c: (c['cobertura_ojos'], c['media_anchura_mm']))
    seguro = m['cobertura_ojos'] >= 0.5
    return {'punto': tuple(m['punto']), 'seguro': seguro, 'descartes': descartes[:6],
            'candidatos': sorted(probados, key=lambda c: -c['cobertura_ojos'])[:5]}


def detectar(cara, hint):
    B = boca(cara, hint)
    O = ojos(cara, B)
    crear_marcadores(cara, B, O)
    avisos = ([O['aviso_ojos']] if O.get('aviso_ojos') else []) + O.get('avisos_mandibula', [])
    if not O['hueco'] and not O['esculpidos']:
        avisos.append('No encuentro los ojos (ni hueco ni globo en la malla): ojo.L/R son de Vale a escala; '
                      'compruébalos en la foto antes de seguir')
    return {'avisos': avisos,
            'comisura_mm': [round(v * 1000, 2) for v in B['comisura']],
            'escala_vs_vale': round(B['comisura'].x / MK.HW_V, 3),
            'ojos_hueco': O['hueco'], 'ojos_esculpidos': O['esculpidos'], 'radio_ojo_mm': round(O['ojos']['L'][1] * 1000, 2),
            'cejas': O['cejas'], 'pestanas_sup': O['pestanas_sup'], 'pestanas_inf': O['pestanas_inf']}
