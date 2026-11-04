# Paso 6: interior de la boca, reutilizado de Vale (estilo anime) y ajustado a cada boca:
#  - quita las piezas sueltas del modelo dentro de la boca (dientes de Tripo…): solo caras, los índices no cambian
#  - forro del modelo: la franja junto a los labios conserva su material, luego oscuro, y el resto se quita
#  - dientes: una banda continua arriba (hueso cabeza) y otra abajo (mandíbula), extremos recogidos
#  - lengua (mandíbula) y fondo: bolsa oscura abierta por delante, cosida al borde del forro (copia sus pesos)
# Las medidas son las de Vale escaladas al marco; AJUSTES permite moverlas sin tocar el código.
import bpy, bmesh, math, heapq
import numpy as np
from mathutils import Vector
from . import util, medidas, marco as MK

AJUSTES = {'dientes_y': 0.0, 'dientes_z': 0.0, 'dientes_ancho': 1.0, 'dientes_alto': 1.0,
           'lengua_escala': 1.0, 'lengua_y': 0.0, 'lengua_z': 0.0, 'quitar_piezas': True,
           'dientes_del_modelo': True}


def medir_dientes_modelo(P, isl, islas_d, cx=0.0):
    """tamaño de los dientes que trae el modelo (Tripo: arcadas humanas con encía) para que las bandas no
    salgan ni más grandes ni más pequeñas: frente, ancho y fondo de la arcada y alto de la corona.
    La corona es la parte densa de la malla desde el borde de mordida; la encía son caras grandes y sueltas."""
    arcos = [P[isl == k] for k in islas_d]
    arcos = [A for A in arcos if len(A) >= 50]
    # solo arcadas: cruzan x = 0 y son casi tan anchas como la más ancha (la cavidad o la lengua no)
    U = [A[:, 0] - cx for A in arcos]
    W = max((np.abs(u).max() for u in U), default=0)
    arcos = [A for A, u in zip(arcos, U) if u.min() < -0.5 * W and u.max() > 0.5 * W and np.abs(u).max() > 0.7 * W]
    if len(arcos) < 2:
        return None
    zm = [A[:, 2].mean() for A in arcos]
    thr = (min(zm) + max(zm)) / 2
    out = {}
    for nom, sel in (('sup', [A for A, z in zip(arcos, zm) if z > thr]), ('inf', [A for A, z in zip(arcos, zm) if z <= thr])):
        if not sel: return None
        A = np.concatenate(sel)
        u = A[:, 0] - cx
        hw = np.abs(u).max()
        cen = A[np.abs(u) < 0.2 * hw]
        borde = np.percentile(cen[:, 2], 2) if nom == 'sup' else np.percentile(cen[:, 2], 98)
        paso = 0.0005
        d = (A[:, 2] - borde) if nom == 'sup' else (borde - A[:, 2])
        h, _ = np.histogram(d, np.arange(0, d.max() + paso, paso))
        hs = np.convolve(h, np.ones(7) / 7, 'same')          # los huecos entre dientes no cortan la corona
        k = 0
        while k + 1 < len(hs) and hs[k + 1] >= 0.12 * h.max():
            k += 1
        alto = (k + 1) * paso
        cor = A[(d >= -paso) & (d <= alto)]
        ccen = cor[np.abs(cor[:, 0] - cx) < 0.2 * hw]
        front = float(ccen[:, 1].min())
        half_w = float(np.abs(cor[:, 0] - cx).max())
        depth = float((cor[:, 1].max() - front) / (1 - math.cos(math.radians(95))))
        top, bottom = (borde + alto, borde) if nom == 'sup' else (borde, borde - alto)
        out[nom] = dict(front_y=front, half_w=half_w, depth=depth, top=float(top), bottom=float(bottom))
    return out


def _band(name, Pd, upper, mat, col):
    bm_ = bmesh.new()
    NU, NV = 36, 4
    t_max = math.radians(95)
    H = Pd['top'] - Pd['bottom']
    rows = []
    for k in range(NV + 1):
        row = []
        for i in range(NU + 1):
            t = -t_max + 2 * t_max * i / NU
            x = Pd.get('cx', 0.0) + Pd['half_w'] * math.sin(t)
            y = Pd['front_y'] + Pd['depth'] * (1 - math.cos(t))
            s = min(1.0, max(0.0, (abs(t) / t_max - 0.55) / 0.45)); s = s * s * (3 - 2 * s)
            if upper:
                zb = Pd['bottom'] + 0.75 * H * s; z = zb + (Pd['top'] - zb) * k / NV
            else:
                zt = Pd['top'] - 0.75 * H * s; z = Pd['bottom'] + (zt - Pd['bottom']) * k / NV
            row.append(bm_.verts.new((x, y, z)))
        rows.append(row)
    for k in range(NV):
        for i in range(NU):
            bm_.faces.new((rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]))
    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
    fc = min(bm_.faces, key=lambda f: abs(f.calc_center_median().x - Pd.get('cx', 0.0)))
    if fc.normal.y > 0:
        bmesh.ops.reverse_faces(bm_, faces=bm_.faces)
    o = _new_obj(name, bm_, mat, col)
    s = o.modifiers.new('Grosor', 'SOLIDIFY'); s.thickness = Pd['thick']; s.offset = -1.0
    s.use_even_offset = True; s.use_rim = True
    sub = o.modifiers.new('Suave', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    return o


def _new_obj(name, bm_, mat, col):
    m = bpy.data.meshes.new(name); bm_.to_mesh(m); bm_.free()
    for p in m.polygons: p.use_smooth = True
    m.materials.append(mat)
    o = bpy.data.objects.new(name, m); col.objects.link(o)
    return o


def _parent_bone(o, rig, bone):
    mw = o.matrix_world.copy()
    o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = bone
    bpy.context.view_layer.update()
    o.matrix_world = mw


def construir(cara, rig, M, MED, aj=None):
    aj = dict(AJUSTES, **(aj or {}))
    util.modo_objeto()
    me = cara.data
    n = M.n
    col = cara.users_collection[0] if cara.users_collection else bpy.context.scene.collection
    L = M.L
    M_TEETH = util.material(n['mat_dientes'], (0.93, 0.93, 0.90, 1.0), rough=0.35, spec=0.4)
    M_TONGUE = util.material(n['mat_lengua'], (0.62, 0.22, 0.24, 1.0), rough=0.45, spec=0.4)
    M_INNER = util.material(n['mat_interior'], (0.10, 0.025, 0.03, 1.0), rough=0.8, spec=0.1)
    M_BAG = util.material(n['mat_fondo'], (0.07, 0.015, 0.02, 1.0), rough=0.9, spec=0.05)
    M_BAG.use_backface_culling = False
    for k in ('dientes_sup', 'dientes_inf', 'lengua', 'fondo'):
        util.borrar_objeto(n[k])
    util.pose_reposo(rig)

    I = medidas.medir_interior(cara, M, MED)
    if M_INNER.name not in me.materials:
        me.materials.append(M_INNER)
    mi_inner = [m.name if m else None for m in me.materials].index(M_INNER.name)
    # cavidad de la boca del modelo (Tripo: una isla que va de los labios a la garganta, color piel): al abrir
    # hasta las comisuras asoma por los lados de la bolsa -> se oscurece como el forro
    isl = util.islas(me); P0 = util.coords(me); hw, mc = M.hw, M.mc
    # antes de quitarlos: el tamaño de los dientes del modelo manda sobre las medidas de Vale
    # (se guardan en la configuración: al repetir el paso ya no están en la malla)
    ref = medir_dientes_modelo(P0, isl, I['islas_boca'], M.cx) if aj['dientes_del_modelo'] and I['islas_boca'] else None
    if ref:
        d_ = MK.cfg(cara); d_['dientes_ref'] = ref; MK.guardar_cfg(cara, d_)
    elif aj['dientes_del_modelo']:
        ref = MK.cfg(cara).get('dientes_ref')
    cav = set()
    for k in np.unique(isl):
        if k == isl[M.cfg['seed']]: continue
        q = P0[isl == k]; lo, hi = q.min(0), q.max(0)
        if (lo[0] < M.cx < hi[0] and lo[2] < mc.z < hi[2] and lo[1] > mc.y - 0.5 * hw and hi[1] > mc.y + 2.0 * hw
                and max(M.cx - lo[0], hi[0] - M.cx) < 4.0 * hw
                # la cáscara interior de la cabeza (Camilo: de la boca a la coronilla) no es cavidad
                and hi[2] < mc.z + 3.0 * hw):
            cav.add(int(k))
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    n_cav = 0
    if cav:
        # solo lo que tapa la piel de la cara vista de frente (la isla sigue por el cuello, que se ve)
        bvh_c = util.bvh_de(P0, me, isl == isl[M.cfg['seed']])
        for f in bm.faces:
            if isl[f.verts[0].index] not in cav: continue
            c = f.calc_center_median()
            if bvh_c.ray_cast(c + Vector((0, -0.02 * hw, 0)), Vector((0, -1, 0)))[0] is not None:
                f.material_index = mi_inner; n_cav += 1
    n_old = 0
    if aj['quitar_piezas'] and I['dientes_v']:
        teeth = set(I['dientes_v'])
        old_faces = [f for f in bm.faces if f.verts[0].index in teeth]
        old_edges = {e for i in teeth for e in bm.verts[i].link_edges}
        n_old = len(old_faces)
        bmesh.ops.delete(bm, geom=old_faces, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[e for e in old_edges if e.is_valid], context='EDGES_FACES')
        bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    forro = set(I['forro'])
    D = {i: 0.0 for i in I['contacto']}
    h = [(0.0, i) for i in I['contacto']]; heapq.heapify(h)
    while h:
        d, i = heapq.heappop(h)
        if d > D.get(i, 1e9): continue
        for e in bm.verts[i].link_edges:
            j = e.other_vert(bm.verts[i]).index
            if j not in forro: continue
            nd = d + e.calc_length()
            if nd < D.get(j, 1e9):
                D[j] = nd; heapq.heappush(h, (nd, j))
    n_dark = 0; cut = []
    for f in bm.faces:
        ids = [v.index for v in f.verts]
        if all(i in forro for i in ids):
            dmin = min(D.get(i, 1e9) for i in ids)
            if dmin > L(0.0045): cut.append(f)
            elif dmin > L(0.0022): f.material_index = mi_inner; n_dark += 1
    cut_edges = {e for f in cut for e in f.edges}
    bmesh.ops.delete(bm, geom=cut, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[e for e in cut_edges if e.is_valid and not e.link_faces], context='EDGES_FACES')
    bm.to_mesh(me); bm.free(); me.update()

    # --- dientes y lengua: por defecto los de Tom (biblioteca/boca_tom.blend, ajustados al marco de esta boca);
    # las bandas de Vale solo quedan de respaldo si falta la biblioteca o el marco FACS no se puede medir
    from . import boca_tom as BT
    info_dientes = None
    if aj.get('plantilla_tom', True) and BT.disponible():
        try:
            from .facs import cara as CAF
            info_dientes = {'plantilla': 'Tom', **BT.colocar(cara, CAF.Cara(cara), rig)}
        except Exception as e:
            info_dientes = None
            print('plantilla de Tom no aplicada, se usan las bandas:', e)
    if info_dientes is None:
        dy, dz = L(aj['dientes_y']), L(aj['dientes_z'])
        def dientes(front_y, half_w, depth, top, bottom, thick):
            zc = M.Zc((top + bottom) / 2) + dz
            hh = L((top - bottom) / 2) * aj['dientes_alto']
            return dict(front_y=M.Yc(front_y) + dy, half_w=L(half_w) * aj['dientes_ancho'], depth=L(depth),
                        top=zc + hh, bottom=zc - hh, thick=L(thick))
        def dientes_ref(r):
            zc = (r['top'] + r['bottom']) / 2 + dz
            hh = (r['top'] - r['bottom']) / 2 * aj['dientes_alto']
            return dict(front_y=r['front_y'] + dy, half_w=r['half_w'] * aj['dientes_ancho'], depth=r['depth'],
                        top=zc + hh, bottom=zc - hh, thick=L(0.0011))
        if ref:
            Ps, Pi = dientes_ref(ref['sup']), dientes_ref(ref['inf'])
        else:
            Ps = dientes(-0.0310, 0.0130, 0.0130, 0.8465, 0.8418, 0.0011)
            Pi = dientes(-0.0296, 0.0118, 0.0122, 0.8420, 0.8374, 0.0011)
        Ps['cx'] = Pi['cx'] = M.cx
        up = _band(n['dientes_sup'], Ps, True, M_TEETH, col)
        lo = _band(n['dientes_inf'], Pi, False, M_TEETH, col)
        info_dientes = {k: {c: round(v * 1000, 1) for c, v in p.items()} for k, p in (('sup', Ps), ('inf', Pi))}
        info_dientes['del_modelo'] = bool(ref)
        _parent_bone(up, rig, 'cabeza'); _parent_bone(lo, rig, 'mandibula')
        bm_ = bmesh.new()
        bmesh.ops.create_uvsphere(bm_, u_segments=24, v_segments=12, radius=1.0)
        c = M.P(0.0, -0.0160, 0.8386) + Vector((0, L(aj['lengua_y']), L(aj['lengua_z'])))
        rx, ry, rz = (L(r) * aj['lengua_escala'] for r in (0.0085, 0.0110, 0.0028))
        for v in bm_.verts:
            x, y, z = v.co
            taper = 1.0 - 0.25 * max(0.0, -y)
            groove = 0.25 * math.exp(-(x / 0.35) ** 2) if z > 0 else 0.0
            v.co = Vector((c.x + rx * x * taper, c.y + ry * y, c.z + rz * (z - groove * z)))
        tongue = _new_obj(n['lengua'], bm_, M_TONGUE, col)
        tongue.modifiers.new('Suave', 'SUBSURF').levels = 1
        _parent_bone(tongue, rig, 'mandibula')

    # --- fondo: bolsa abierta por delante cosida al borde del forro recortado
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    X30, Z1, Z2, Y4 = M.X(0.03), M.Zc(0.815), M.Zc(0.86), M.Yc(-0.04)
    bnd = [e for e in bm.edges if e.is_boundary and all(abs(v.co.x - M.cx) < X30 and Z1 < v.co.z < Z2 and v.co.y > Y4 for v in e.verts)]
    adj = {}
    for e in bnd:
        a_, b_ = e.verts[0].index, e.verts[1].index
        adj.setdefault(a_, []).append(b_); adj.setdefault(b_, []).append(a_)
    info = {'piezas_quitadas_caras': n_old, 'forro_oscuro': n_dark, 'forro_quitado': len(cut), 'cavidad_oscura': n_cav,
            'dientes_mm': info_dientes}
    if not adj:
        bm.free(); info['fondo'] = 'sin borde (boca sin abertura)'
        return info
    # el lazo más largo que rodea el centro de la boca
    comps, seen = [], set()
    for s0 in adj:
        if s0 in seen: continue
        st = [s0]; comp = []; seen.add(s0)
        while st:
            x = st.pop(); comp.append(x)
            for y in adj[x]:
                if y not in seen: seen.add(y); st.append(y)
        comps.append(comp)
    # el lazo de la boca: el más cercano al centro de la boca (el más largo puede ser otro agujero de la
    # malla, p. ej. detrás de la cabeza en Malcon)
    def _dist(cp):
        c_ = sum((bm.verts[i].co for i in cp), Vector()) / len(cp)
        return (c_ - M.mc).length
    comps = [cp for cp in comps if len(cp) >= 4] or comps
    comp = set(min(comps, key=_dist))
    start = max(comp, key=lambda i: bm.verts[i].co.z)
    loop = [start]; prev = None; cur = start
    while True:
        nx = [k for k in adj[cur] if k != prev and k != start and k in comp]
        if not nx: break
        prev, cur = cur, nx[0]
        if cur in loop: break
        loop.append(cur)
    rim = [bm.verts[i].co.copy() for i in loop]
    bm.free()
    C = sum(rim, Vector()) / len(rim)
    nr = len(rim)
    Ls = [0.0]
    for i in range(nr): Ls.append(Ls[-1] + (rim[(i + 1) % nr] - rim[i]).length)
    s_par = [Ls[i] / Ls[-1] for i in range(nr)]
    th0 = math.atan2(rim[0].z - C.z, rim[0].x - C.x)
    area = sum(rim[i].x * rim[(i + 1) % nr].z - rim[(i + 1) % nr].x * rim[i].z for i in range(nr))
    sgn = 1 if area > 0 else -1
    xs = [p.x for p in rim]; ys = [p.y for p in rim]
    A0 = max(abs(x - C.x) for x in xs); B0 = max(abs(p.z - C.z) for p in rim)
    us = [x - C.x for x in xs]
    sx2 = sum(x * x for x in us) / nr; sx4 = sum(x ** 4 for x in us) / nr
    sy = sum(ys) / nr; sx2y = sum(x * x * y for x, y in zip(us, ys)) / nr
    bq = (sx2y - sx2 * sy) / max(sx4 - sx2 * sx2, 1e-18); aq = sy - bq * sx2
    RINGS = [(0.0, 1.0, 1.0), (0.003, 1.08, 1.15), (0.009, 1.18, 1.30), (0.016, 1.12, 1.25), (0.021, 0.85, 0.95), (0.024, 0.45, 0.5)]
    PW = 2.6
    def sup(t, a, b):
        c_, s_ = math.cos(t), math.sin(t)
        return (a * math.copysign(abs(c_) ** (2 / PW), c_), b * math.copysign(abs(s_) ** (2 / PW), s_))
    bm_ = bmesh.new()
    # boca sellada que se cortó (Malcon): el borde no tiene alto; cosida, la bolsa se arruga y asoma en
    # picos -> cavidad oscura sin coser, desde el 3er anillo (detrás de los labios), más alta que la abertura
    # (también si el borde es casi todo rendija partida: un agujerito en medio y labios cortados hasta la comisura)
    sellada = B0 < L(0.0005) or B0 < 0.1 * A0
    R0 = 2 if sellada else 1
    ring_v = [] if sellada else [[bm_.verts.new(p) for p in rim]]
    for dyr, fa, fb in RINGS[R0:]:
        b_ = max(B0, L(0.0045)) * fb if sellada else B0 * fb
        row = []
        for i in range(nr):
            t = th0 + sgn * 2 * math.pi * s_par[i]
            ddx, ddz = sup(t, A0 * fa, b_)
            x = C.x + ddx
            row.append(bm_.verts.new((x, aq + bq * ddx * ddx + L(dyr), C.z + ddz)))
        ring_v.append(row)
    back = bm_.verts.new((C.x, aq + L(RINGS[-1][0] + 0.003), C.z))
    for k in range(len(ring_v) - 1):
        for i in range(nr):
            j = (i + 1) % nr
            bm_.faces.new((ring_v[k][i], ring_v[k][j], ring_v[k + 1][j], ring_v[k + 1][i]))
    for i in range(nr):
        bm_.faces.new((ring_v[-1][i], ring_v[-1][(i + 1) % nr], back))
    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
    fc = max(bm_.faces, key=lambda f: f.calc_center_median().y)
    if fc.normal.y > 0:
        bmesh.ops.reverse_faces(bm_, faces=bm_.faces)
    bag = _new_obj(n['fondo'], bm_, M_BAG, col)
    names = {g.index: g.name for g in cara.vertex_groups}
    rim_w = [{names[g.group]: g.weight for g in me.vertices[i].groups if names[g.group] != 'suavizado_boca'} for i in loop]
    VG = {}
    def add(vi, name, w):
        if w < 1e-4: return
        if name not in VG: VG[name] = bag.vertex_groups.new(name=name)
        VG[name].add([vi], w, 'REPLACE')
    for k in range(len(ring_v)):
        f = 1.0 if sellada else min(1.0, k / 2.0)
        for i in range(nr):
            vi = k * nr + i
            t = min(1.0, max(0.0, (C.z + L(0.002) - bag.data.vertices[vi].co.z) / L(0.006))); t = t * t * (3 - 2 * t)
            w = {nm: (1 - f) * x for nm, x in rim_w[i].items()}
            w['cabeza'] = w.get('cabeza', 0) + f * (1 - t); w['mandibula'] = w.get('mandibula', 0) + f * t
            s_ = sum(w.values()) or 1.0
            for nm, x in w.items(): add(vi, nm, x / s_)
    add(len(bag.data.vertices) - 1, 'cabeza', 0.5); add(len(bag.data.vertices) - 1, 'mandibula', 0.5)
    bag.parent = rig
    am = bag.modifiers.new('Rig labios', 'ARMATURE'); am.object = rig
    bpy.context.view_layer.update()
    info['fondo_borde'] = nr
    info['keys_seguidas'] = seguir_keys(cara, rig, M)
    return info


FACTOR_SEGUIR = {'sup': 0.5, 'inf': 1.0, 'lengua': 0.8, 'fondo': 0.8}
KEYS_NO_BOCA = ('ceja', 'parp', 'mejilla', 'ojo', 'dentro')   # 'dentro' esconde el labio tras los dientes: no se copia


def seguir_keys(cara, rig=None, M=None, factores=None, n_vecinos=24):
    """Dientes y lengua siguen las shape keys de la boca (visemas, risa, sorpresa...), no solo el hueso de la mandíbula.
    Cada key de la cara crea otra con el mismo nombre en las piezas; el movimiento sale de los vértices de piel del
    labio de su lado (arriba: z sobre la línea de la boca; abajo y lengua: bajo ella). Un driver copia el valor de la
    key de la cara, y en GLB se animan juntas por nombre. El factor de cada pieza amortigua: la fila de arriba sigue
    la mitad (el labio sube y deja ver los dientes), la de abajo entera."""
    from mathutils import kdtree
    fac = dict(FACTOR_SEGUIR); fac.update(factores or {})
    sk = cara.data.shape_keys
    cfg = MK.cfg(cara)
    pre = cara.name + '_'
    objs = {'sup': bpy.data.objects.get(pre + 'Dientes_sup'), 'inf': bpy.data.objects.get(pre + 'Dientes_inf'),
            'lengua': bpy.data.objects.get(pre + 'Lengua'), 'fondo': bpy.data.objects.get(pre + 'Boca_Fondo')}
    objs = {k: o for k, o in objs.items() if o}
    if not sk or not objs:
        return {'keys': 0}
    rig = rig or next((o.parent for o in objs.values() if o.parent), None)
    pos0 = rig.data.pose_position if rig else None
    if rig: rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    try:
        Mc = cara.matrix_world.copy(); Mci = Mc.inverted()
        basis = sk.reference_key
        nb = len(basis.data)
        B = np.empty(nb * 3); basis.data.foreach_get('co', B); B = B.reshape(-1, 3)
        # solo piel cerca de la boca
        vs = {}
        for k, o in objs.items():
            W = np.array([(Mci @ (o.matrix_world @ v.co))[:] for v in o.data.vertices])
            vs[k] = W
        allp = np.vstack(list(vs.values()))
        lo, hi = allp.min(0) - 0.015, allp.max(0) + 0.015
        zm = 0.5 * (vs['sup'][:, 2].min() + vs['inf'][:, 2].max()) if 'sup' in vs and 'inf' in vs else allp[:, 2].mean()
        zs = lambda a: a[:, 2]
        en = np.where(np.all((B >= lo) & (B <= hi), axis=1))[0]
        lado = {'sup': en[B[en, 2] >= zm], 'inf': en[B[en, 2] < zm]}
        lado['lengua'] = lado['inf']
        arboles = {}
        for k, ids in lado.items():
            t = kdtree.KDTree(len(ids))
            for j, i in enumerate(ids): t.insert(Vector(B[i]), j)
            t.balance(); arboles[k] = t
        vec = {}
        for k, W in vs.items():
            idx, w = [], []
            for p in W:
                kk = k if k != 'fondo' else ('sup' if p[2] >= zm else 'inf')   # la bolsa abarca los dos labios
                r = arboles[kk].find_n(Vector(p), n_vecinos)
                lado_k = lado[kk]
                idx.append([lado_k[j] for _, j, _ in r])
                d = np.array([x[2] for x in r]) + 0.001
                ww = 1.0 / d; w.append(ww / ww.sum())
            vec[k] = (np.array(idx), np.array(w))
        hechas = []
        for kb in sk.key_blocks:
            if kb == basis or any(s in kb.name for s in KEYS_NO_BOCA): continue
            K = np.empty(nb * 3); kb.data.foreach_get('co', K); K = K.reshape(-1, 3)
            R = np.empty(nb * 3); kb.relative_key.data.foreach_get('co', R); R = R.reshape(-1, 3)
            D = K - R
            if np.abs(D[en]).max() < 5e-5: continue
            for k, o in objs.items():
                idx, w = vec[k]
                d = (D[idx] * w[:, :, None]).sum(1) * fac[k]
                Dl = np.array([(o.matrix_world.to_3x3().inverted() @ (Mc.to_3x3() @ Vector(x)))[:] for x in d])
                if o.data.shape_keys is None: o.shape_key_add(name='Basis', from_mix=False)
                nk = o.data.shape_keys.key_blocks.get(kb.name) or o.shape_key_add(name=kb.name, from_mix=False)
                P0 = np.empty(len(o.data.vertices) * 3); o.data.shape_keys.reference_key.data.foreach_get('co', P0)
                nk.data.foreach_set('co', (P0.reshape(-1, 3) + Dl).ravel())
                nk.slider_min, nk.slider_max = kb.slider_min, kb.slider_max
                nk.value = 0.0
                kd = o.data.shape_keys
                if kd.animation_data:
                    for f in [f for f in kd.animation_data.drivers if f.data_path == f'key_blocks["{kb.name}"].value']:
                        kd.animation_data.drivers.remove(f)
                f = nk.driver_add('value')
                f.driver.type = 'SCRIPTED'; f.driver.expression = 'v'
                var = f.driver.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
                var.targets[0].id_type = 'KEY'; var.targets[0].id = sk
                var.targets[0].data_path = f'key_blocks["{kb.name}"].value'
            hechas.append(kb.name)
    finally:
        if rig: rig.data.pose_position = pos0
        bpy.context.view_layer.update()
    return {'keys': len(hechas), 'nombres': hechas, 'factores': fac}
