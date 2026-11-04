# Paso 3: arreglos de malla que el rig necesita (aprendidos con Vale). Todos se pueden repetir:
#  - respaldo: copia de la malla la primera vez (las coordenadas siempre se recuperan de ahí)
#  - cuantización: mallas de Tripo/Meshy con las coordenadas en rejilla (Vale: 1/2048 m) -> labios en
#    escalera. Se suaviza la boca SIN salir de la celda de cada vértice (Taubin + recorte).
#  - solapas: triángulos sueltos en la comisura (aristas con 3 caras) -> picos al abrir. Se borran las
#    caras; el vértice queda suelto (no cambian los índices).
#  - normales personalizadas: en la boca se igualan a las automáticas (se recalculan al deformar).
#  - dientes de Tripo pegados a los labios (boca sellada) -> se buscan en la malla y se borran (Malcon).
#  - rendija: si el agujero de la boca no llega a la comisura (labios soldados), se parte la línea de la boca.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from . import util, marco as MK


def respaldo(cara):
    d = MK.cfg(cara)
    nm = d.get('respaldo') or MK.nombres(cara)['respaldo']
    me = cara.data
    bk = bpy.data.meshes.get(nm)
    # con la malla ya cortada (rlb_orig) el respaldo sigue siendo el original: no se rehace
    if bk is None or (len(bk.vertices) != len(me.vertices) and 'rlb_orig' not in me.attributes):
        bk = me.copy(); bk.name = nm; bk.use_fake_user = True
        if bk.shape_keys:
            pass
    d['respaldo'] = bk.name; MK.guardar_cfg(cara, d)
    return bk


def analizar(cara):
    """informe para el paso 1 (sin cambiar nada)."""
    me = cara.data
    rep = {}
    mw = cara.matrix_world
    rep['transform_ok'] = all(abs(mw[i][j] - (1.0 if i == j else 0.0)) < 1e-5 for i in range(4) for j in range(4))
    P = util.coords(me)
    rep['vertices'] = len(P)
    isl = util.islas(me)
    grande = np.bincount(isl).argmax()           # la isla más grande suele ser la cara/cabeza
    from .deteccion import centrado
    cx, w = centrado(P[isl == grande])
    rep['centro_x_mm'] = round(cx * 1000, 2)
    rep['centrado_x'] = abs(cx) <= max(0.06 * w, 0.004)   # lo exige la detección (deteccion.exigir_centrado)
    rep['paso_cuantizacion'] = paso_cuantizacion(P)
    rep['normales_custom'] = 'custom_normal' in me.attributes
    rep['shape_keys'] = [k.name for k in me.shape_keys.key_blocks] if me.shape_keys else []
    bm = bmesh.new(); bm.from_mesh(me)
    rep['aristas_no_manifold'] = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bm.free()
    rep['modificadores'] = [(m.type, m.name) for m in cara.modifiers]
    return rep


def paso_cuantizacion(P, muestra=4000):
    rng = np.random.default_rng(0)
    q = P[rng.choice(len(P), min(muestra, len(P)), replace=False)]
    for k in range(6, 15):
        st = 1.0 / (2 ** k)
        r = np.abs(q / st - np.round(q / st))
        if r.max() < 1e-3:
            return st
    return 0.0


def desquantizar(cara, M, iteraciones=80):
    me = cara.data
    bk = respaldo(cara)
    co0 = np.zeros(len(bk.vertices) * 3); bk.vertices.foreach_get('co', co0); co0 = co0.reshape(-1, 3)
    st = paso_cuantizacion(co0)
    if st == 0.0:
        return {'cuantizada': False}
    if me.shape_keys:
        cara.shape_key_clear()
    if len(me.vertices) != len(co0):             # rendija ya cortada: los vértices nuevos copian a su original
        orig = np.zeros(len(me.vertices), int); me.attributes['rlb_orig'].data.foreach_get('value', orig)
        cur = util.coords(me)                      # -1: vértice nuevo a media franja, se queda donde está
        co0 = np.where((orig < 0)[:, None], cur, co0[np.maximum(orig, 0)])
    N = len(co0)
    ev = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ev); ev = ev.reshape(-1, 2)
    isl = util.islas(me)
    face = isl == isl[M.cfg['seed']]
    C = np.array(M.P(0.0, -0.030, 0.842))
    d = np.linalg.norm(co0 - C, axis=1)
    reg = np.where(face, util.ss(M.L(0.034), M.L(0.024), d), 0.0)
    # una celda entera de la rejilla detectada (Vale: rejilla real 1/4096, se suavizó ±1/4096 y quedó bien)
    LIM = (1.0 * st * reg)[:, None]
    E2 = np.concatenate([ev, ev[:, ::-1]])
    deg = np.bincount(E2[:, 0], minlength=N).astype(float); deg[deg == 0] = 1
    def lap(x):
        s = np.zeros_like(x); np.add.at(s, E2[:, 0], x[E2[:, 1]])
        return s / deg[:, None] - x
    co = co0.copy()
    for _ in range(iteraciones):
        for f in (0.5, -0.53):
            co = np.clip(co + f * lap(co), co0 - LIM, co0 + LIM)
    me.vertices.foreach_set('co', co.ravel()); me.update()
    return {'cuantizada': True, 'paso_mm': st * 1000, 'max_mm': float(np.abs(co - co0).max() * 1000)}


def quitar_solapas(cara, M):
    me = cara.data
    if me.shape_keys:
        cara.shape_key_clear()
    bm = bmesh.new(); bm.from_mesh(me)
    mc = M.mc; R = 2.5 * M.hw
    caras, aristas = set(), set()
    for e in bm.edges:
        if len(e.link_faces) <= 2: continue
        if (e.verts[0].co - mc).length > R: continue
        ev = set(e.verts)
        for f in e.link_faces:
            for v in f.verts:
                if v in ev: continue
                if len(v.link_faces) <= 3:            # vértice de la solapa: solo lo usan sus triángulos
                    caras |= set(v.link_faces); aristas |= set(v.link_edges)
    n = len(caras)
    bmesh.ops.delete(bm, geom=list(caras), context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[e for e in aristas if e.is_valid], context='EDGES_FACES')
    bm.to_mesh(me); bm.free(); me.update()
    return {'caras_borradas': n}


def normales_boca(cara, M):
    me = cara.data
    if 'custom_normal' not in me.attributes:
        return {'normales_custom': False}
    nl = len(me.loops)
    cur = np.zeros(nl * 3); me.corner_normals.foreach_get('vector', cur); cur = cur.reshape(-1, 3)
    tmp = me.copy()
    tmp.attributes.remove(tmp.attributes['custom_normal'])
    auto = np.zeros(nl * 3); tmp.corner_normals.foreach_get('vector', auto); auto = auto.reshape(-1, 3)
    bpy.data.meshes.remove(tmp)
    lv = np.zeros(nl, int); me.loops.foreach_get('vertex_index', lv)
    co = util.coords(me)
    C = np.array(M.P(0.0, -0.030, 0.842))
    w = util.ss(M.L(0.030), M.L(0.020), np.linalg.norm(co[lv] - C, axis=1))[:, None]
    n = cur * (1 - w) + auto * w
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    me.normals_split_custom_set(n.tolist()); me.update()
    return {'normales_custom': True, 'loops_boca': int((w[:, 0] > 0.99).sum())}


def quitar_dientes_tripo(cara, M, solo_buscar=False):
    """Tripo/Meshy pegan los dientes a los labios: entre el borde de contacto de arriba y el de abajo hay
    una pared plana (los dientes), unas caras de alto, metida detrás del frente del labio. La boca no puede
    abrir. Igual que con el medio globo del ojo, se busca en la malla y se borra (solo caras: los índices
    no cambian). Queda una abertura de verdad; la bolsa se cose a su borde y van los dientes del complemento."""
    from . import medidas
    me = cara.data
    if me.shape_keys:
        cara.shape_key_clear()
    R = medidas.medir_labios(cara, M)['rendija']
    xs = np.array(R['x'])
    zst = np.array([p.z for p in R['ST']]); zsb = np.array([p.z for p in R['SB']])
    yfr = np.array([min(a.y, b.y) for a, b in zip(R['ST'], R['SB'])])
    hw = M.hw
    f_zst = lambda x: float(np.interp(abs(x), xs, zst))
    f_zsb = lambda x: float(np.interp(abs(x), xs, zsb))
    f_yfr = lambda x: float(np.interp(abs(x), xs, yfr))
    isl = util.islas(me); face = isl == isl[M.cfg['seed']]
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    tol = 0.05 * hw

    def pared(f):
        if not all(face[v.index] for v in f.verts): return False
        c = f.calc_center_median()
        if abs(c.x) > 0.97 * hw or f.normal.y > -0.6: return False
        if c.y < f_yfr(c.x) + 0.02 * hw: return False                  # metida detrás del frente del labio
        return all(f_zsb(v.co.x) - tol < v.co.z < f_zst(v.co.x) + tol for v in f.verts)
    zm = (f_zst(0) + f_zsb(0)) / 2
    sem = [f for f in bm.faces if pared(f)]
    if not sem:
        bm.free(); return set() if solo_buscar else {'dientes_tripo': 0}
    f0 = min(sem, key=lambda f: abs(f.calc_center_median().x) + abs(f.calc_center_median().z - zm))
    seen = {f0}; st = [f0]
    while st:
        f = st.pop()
        for e in f.edges:
            for g in e.link_faces:
                if g not in seen and pared(g):
                    seen.add(g); st.append(g)
    if solo_buscar:
        r = {f.index for f in seen}; bm.free(); return r
    ed = {e for f in seen for e in f.edges}
    bmesh.ops.delete(bm, geom=list(seen), context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[e for e in ed if e.is_valid and not e.link_faces], context='EDGES_FACES')
    bm.to_mesh(me); bm.free(); me.update()
    return {'dientes_tripo': len(seen)}


def abrir_rendija(cara, M):
    """labios soldados entre el final del agujero de la boca y la comisura (Malcon: la pared de dientes solo
    llegaba a 2/3 de la boca y el último tercio no abría). Se parten las aristas de la línea de la boca desde
    el extremo del agujero hasta el polo de la comisura (que sigue entero). Los vértices nuevos van al final
    y rlb_orig dice de cuál salen. -> {'L': aristas, 'R': aristas}."""
    from . import medidas
    import heapq
    me = cara.data
    if me.shape_keys:
        cara.shape_key_clear()
    R = medidas.medir_labios(cara, M)['rendija']
    xs = np.array(R['x']); zs = np.array(R['z'])
    zsl = lambda x: float(np.interp(abs(x), xs, zs))
    face, _ = medidas.cara_mask(cara, M)
    hw, mc, cx = M.hw, M.mc, abs(M.comisura.x)
    util.asegurar_orig(me)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    en_zona = lambda v: (v.index < len(face) and face[v.index] and abs(v.co.x) < cx + 0.3 * hw
                         and abs(v.co.z - zsl(v.co.x)) < 0.4 * hw and v.co.y < mc.y + 0.8 * hw)
    borde = [v for v in bm.verts if v.is_boundary and en_zona(v)]
    out, cortar = {}, set()
    for s, sx in (('L', 1), ('R', -1)):
        lado = [v for v in borde if sx * v.co.x > 0]
        if not lado:
            continue
        v0 = max(lado, key=lambda v: sx * v.co.x)
        if sx * v0.co.x > cx - 0.15 * hw:
            out[s] = 0; continue                      # el agujero ya llega a la comisura
        obj = Vector((sx * cx, M.comisura.y, M.comisura.z))
        vc = min((v for v in bm.verts if en_zona(v) and not v.is_boundary), key=lambda v: (v.co - obj).length)
        # camino más corto por aristas pegado a la línea de la boca (sin ir por el borde del agujero)
        dist = {v0: 0.0}; prev = {}; h = [(0.0, v0.index, v0)]
        while h:
            d, _, v = heapq.heappop(h)
            if v is vc: break
            if d > dist.get(v, 1e9): continue
            for e in v.link_edges:
                w = e.other_vert(v)
                if e.is_boundary or not en_zona(w) or sx * w.co.x < sx * v0.co.x - 0.05 * hw: continue
                m = (v.co + w.co) / 2
                c = e.calc_length() * (1 + ((m.z - zsl(m.x)) / (0.04 * hw)) ** 2)
                if d + c < dist.get(w, 1e9):
                    dist[w] = d + c; prev[w] = (v, e); heapq.heappush(h, (d + c, w.index, w))
        if vc not in prev:
            out[s] = 'sin camino'; continue
        v, n = vc, 0
        while v is not v0:
            v, e = prev[v]; cortar.add(e); n += 1
        out[s] = n
    if cortar:
        # el camino va en zigzag por los triángulos: se endereza sobre la línea de la boca (si no, al abrir
        # el borde de los labios sale en dientes de sierra)
        for v in {v for e in cortar for v in e.verts}:
            if v.is_boundary: continue
            v.co.z = zsl(v.co.x)
        bmesh.ops.split_edges(bm, edges=list(cortar))
        bm.to_mesh(me); me.update()
    bm.free()
    return out


# ------------------------------------------------------------------ cuenca del ojo
# Tripo deja el ojo como un AGUJERO: por detrás del borde del párpado no hay nada (se ve el interior de la cabeza
# y, de lado, el borde flota en el aire). Business girl (CC4) tiene la piel que sigue hacia dentro y cierra una
# cuenca detrás del globo. Aquí el borde del hueco se extruye: primero un margen de párpado de 1–1,5 mm apoyado en
# el globo (sobre la lente de oclusión: el grosor del párpado que toca el ojo) y luego una bolsa oscura y lisa que sigue la superficie del ojo
# a r − prof hasta detrás del centro, donde se cierra. Los vértices nuevos van AL FINAL (no cambia ningún índice)
# y quedan marcados en el atributo rlb_cuenca; llevan los pesos y las shape keys del vértice del borde del que
# salen (la bolsa, desde el primer anillo, solo 'cabeza': queda quieta).
CUENCA = 'rlb_cuenca'
SUBIDA = 'rlb_cuenca_subida'     # lo que se levantó el borde del párpado (para deshacerlo)
# apoyo: altura del margen sobre el globo (× E). Como en CC, el párpado se apoya en la lente de oclusión (0,0008)
# y no en el globo: si el margen quedara por debajo de la lente, al bajar el párpado la lente asomaría por encima.
CUENCA_P = {'margen': 0.002, 'margen_min': 0.001, 'margen_max': 0.0015, 'apoyo': 0.001, 'prof': 0.0008,
            'anillos_bolsa': 4, 'fin_grados': 150.0, 'color': (0.08, 0.02, 0.015)}


def quitar_cuenca(cara):
    """borra la cuenca (los vértices marcados están al final: los demás índices no cambian)."""
    me = cara.data
    if CUENCA not in me.attributes: return 0
    m = np.zeros(len(me.vertices), int); me.attributes[CUENCA].data.foreach_get('value', m)
    if m.any():
        if cara.get('facs_densificado'):
            raise RuntimeError('La malla ya está densificada: la cuenca no se puede quitar ni rehacer (la subdivisión '
                               'parte sus aristas y la máscara deja de ser fiable). Hace falta el modelo original.')
        bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.where(m)[0]], context='VERTS')
        bm.to_mesh(me); bm.free(); me.update()
    me.attributes.remove(me.attributes[CUENCA])
    if SUBIDA in me.attributes:                    # el borde del párpado vuelve a donde estaba
        n = len(me.vertices); d = np.zeros(n * 3); me.attributes[SUBIDA].data.foreach_get('vector', d)
        _mover(cara, -d.reshape(-1, 3))
        me.attributes.remove(me.attributes[SUBIDA])
    return int(m.sum())


def _mover(cara, delta):
    """suma delta a la malla y a todas las shape keys (la forma de cada key respecto a Basis no cambia)."""
    me = cara.data; n = len(me.vertices)
    co = np.zeros(n * 3); me.vertices.foreach_get('co', co); me.vertices.foreach_set('co', co + delta.ravel())
    if me.shape_keys:
        for k in me.shape_keys.key_blocks:
            co = np.zeros(n * 3); k.data.foreach_get('co', co); k.data.foreach_set('co', co + delta.ravel())
    me.update()


def _lazos_borde(me, sel):
    """lazos del borde abierto entre los vértices sel, en el sentido de las caras de la piel: [(v, cara)]."""
    nxt = {}
    for p in me.polygons:
        vs = list(p.vertices)
        for a, b in zip(vs, vs[1:] + vs[:1]):
            if a in sel and b in sel: nxt.setdefault((a, b), p.index)
    dirig = {(a, b): f for (a, b), f in nxt.items() if (b, a) not in nxt}      # arista con una sola cara
    sig = {}
    for (a, b), f in dirig.items(): sig.setdefault(a, []).append((b, f))
    lazos, usado = [], set()
    for a0 in list(sig):
        for b0, f0 in sig[a0]:
            if (a0, b0) in usado: continue
            lazo = []; a, b, f = a0, b0, f0
            while (a, b) not in usado:
                usado.add((a, b)); lazo.append((a, f))
                op = [x for x in sig.get(b, []) if (b, x[0]) not in usado]
                if not op: break
                a, (b, f) = b, op[0]
            if len(lazo) >= 3: lazos.append((lazo, b == a0))
    return lazos


def cuenca(cara, M, rig=None, par=None):
    from . import ojos, medidas
    P_ = dict(CUENCA_P, **(par or {}))
    util.modo_objeto()
    quitada = quitar_cuenca(cara)
    me = cara.data
    piv = ojos._pivotes(cara, M)
    if not piv:
        raise RuntimeError('La cuenca necesita los ojos (paso 7)')
    info = {'quitada_antes': quitada}
    with ojos.Reposo(rig):
        P = util.coords(me)
        n0 = len(P)
        cara_m, _ = medidas.cara_mask(cara, M)
        nuevos = {}                                     # lado -> datos de los anillos
        lazos_cara = None
        subida = np.zeros_like(P)
        for s in ('L', 'R'):
            C, bvh_o = ojos.superficie_ojo(cara, piv[s])
            R = M.ojo(s)[1]; E = R / MK.R_OJO_V
            borde = ojos._borde_hueco(me, P, cara_m, C, 0.04 * E)
            if len(borde) < 6:
                info[s] = 'sin hueco abierto (no hace falta cuenca)'; continue
            # el lazo entero, también lo que va por detrás del centro (Camilo L: el rabillo se mete hasta y = +6 mm).
            # Si el lazo sigue por una rendija hasta otro agujero (Camilo R: 82 mm), se queda el tramo junto al ojo.
            if lazos_cara is None: lazos_cara = _lazos_borde(me, set(np.where(cara_m)[0].tolist()))
            bset = set(borde.tolist()); lazos = []
            for lz, cerr in lazos_cara:
                if not any(v in bset for v, _ in lz): continue
                dentro = np.linalg.norm(P[[v for v, _ in lz]] - C, axis=1) < 0.04 * E
                if cerr and dentro.all():
                    lazos.append((lz, True)); continue
                k0 = int(np.argmin(dentro)) if cerr else 0          # empezar fuera: los tramos no se parten
                lz = lz[k0:] + lz[:k0]; dentro = np.r_[dentro[k0:], dentro[:k0]]
                tramo = []
                for (v, f_), dn in zip(lz, dentro):
                    if dn: tramo.append((v, f_))
                    elif tramo: lazos.append((tramo, False)); tramo = []
                if tramo: lazos.append((tramo, False))
            lazos = [(lz, c) for lz, c in lazos if len(lz) >= 3 and sum(v in bset for v, _ in lz) >= 3]
            if not lazos:
                info[s] = 'el borde no forma un lazo'; continue
            lazo, cerrado = max(lazos, key=lambda x: sum(v in bset for v, _ in x[0]))
            vs = np.array([v for v, _ in lazo])
            rel = P[vs] - C; d0 = rel / np.linalg.norm(rel, axis=1)[:, None]
            a = d0.mean(0); a /= np.linalg.norm(a)                      # eje de la abertura
            cos0 = np.clip(d0 @ a, -1, 1); phi0 = np.arccos(cos0)
            t = d0 - cos0[:, None] * a; t /= np.maximum(np.linalg.norm(t, axis=1), 1e-9)[:, None]
            ro0 = ojos.radio_ojo(bvh_o, C, d0, R)
            marg = float(np.clip(P_['margen'] * E, P_['margen_min'], P_['margen_max']))
            apoyo, prof = P_['apoyo'] * E, P_['prof'] * E
            fin = math.radians(P_['fin_grados'])
            # ángulos de cada anillo (desde el eje de la abertura hacia fuera, bajo el párpado)
            phis = [phi0 + 0.25 * marg / ro0, phi0 + marg / ro0]
            p1 = phi0 + (marg + 0.4 * E * 0.001) / ro0
            for k in range(int(P_['anillos_bolsa'])):
                phis.append(p1 + (np.maximum(fin, p1 + 0.2) - p1) * k / max(int(P_['anillos_bolsa']) - 1, 1))
            anillos = []
            for k, ph in enumerate(phis):
                dk = np.cos(ph)[:, None] * a + np.sin(ph)[:, None] * t
                rk = ojos.radio_ojo(bvh_o, C, dk, R)
                anillos.append(C + dk * (rk + (apoyo if k < 2 else -prof))[:, None])
            # el borde del párpado que toca el globo (Tripo: 0,03 mm) se levanta hasta apoyarse en la lente (si no, la
            # lente tendría que meterse por debajo y se cruzaría con las facetas del globo: esquirlas oscuras)
            sube = np.maximum(ro0 + apoyo - np.linalg.norm(rel, axis=1), 0.0)
            sube[np.linalg.norm(rel, axis=1) - ro0 < -0.5 * prof] = 0.0          # los que van por dentro (rendija): no
            subida[vs] += d0 * sube[:, None]
            ro_t = ojos.radio_ojo(bvh_o, C, [-a], R)[0]
            tapa = C - a * (ro_t - prof)
            # el margen gira con el párpado; la bolsa queda quieta (si gira, en un globo elipsoide como el de Camilo
            # sale por delante al acercarse al frente; quieta, la cuerda hasta el margen pasa por dentro del globo)
            fades = [1.0, 1.0] + [0.0] * (len(phis) - 2)
            nuevos[s] = {'lazo': lazo, 'cerrado': cerrado, 'anillos': anillos, 'tapa': tapa, 'fades': fades}
            info[s] = {'borde_v': len(vs), 'lazos': len(lazos), 'cerrado': cerrado, 'margen_mm': round(marg * 1000, 2),
                       'hueco_borde_globo_mm': [round(float(x) * 1000, 2) for x in np.percentile(
                           np.linalg.norm(rel, axis=1) - ro0, [0, 50, 100])]}
        if not nuevos:
            return info
        if subida.any():
            _mover(cara, subida)
            a_ = me.attributes.new(SUBIDA, 'FLOAT_VECTOR', 'POINT'); a_.data.foreach_set('vector', subida.ravel())
            P = util.coords(me)
        info['borde_subido_v'] = int((np.abs(subida).sum(1) > 0).sum())
        info['borde_subido_max_mm'] = round(float(np.linalg.norm(subida, axis=1).max()) * 1000, 2)
        # material oscuro y liso para la bolsa
        nm_mat = f'{cara.name}_Cuenca'
        mat = util.material(nm_mat, (*P_['color'], 1.0), rough=1.0, spec=0.0)
        if nm_mat not in [m.name for m in me.materials if m]: me.materials.append(mat)
        i_mat = [m.name if m else '' for m in me.materials].index(nm_mat)
        bm = bmesh.new(); bm.from_mesh(me)
        bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
        dl = bm.verts.layers.deform.verify()
        sh = list(bm.verts.layers.shape)
        uvl = bm.loops.layers.uv.active
        ilay = bm.verts.layers.int
        orig = ilay.get('rlb_orig'); cl = ilay.get(CUENCA) or ilay.new(CUENCA)
        g_cab = cara.vertex_groups.get('cabeza') or cara.vertex_groups.new(name='cabeza')
        es_parp = {g.index for g in cara.vertex_groups if g.name.startswith('DEF-parp_')}
        n_v = n_f = 0
        for s, dd in nuevos.items():                 # antes de crear nada (las tablas de índices caducan)
            dd['rim'] = [bm.verts[v] for v, _ in dd['lazo']]
            dd['uv'] = {}
            for (v, fi) in dd['lazo']:
                for lp in bm.faces[fi].loops:
                    if lp.vert.index == v and uvl: dd['uv'][v] = lp[uvl].uv.copy()
            dd['mat'] = {v: bm.faces[fi].material_index for v, fi in dd['lazo']}
        for s, dd in nuevos.items():
            lazo, anillos, fades, rim = dd['lazo'], dd['anillos'], dd['fades'], dd['rim']

            def nuevo(co, src, f):
                v = bm.verts.new(Vector(co))
                w = dict(src[dl]); q = 0.0
                for g in list(w):
                    if g in es_parp: q += w[g] * (1 - f); w[g] *= f
                if q: w[g_cab.index] = w.get(g_cab.index, 0.0) + q
                for g, x in w.items(): v[dl][g] = min(x, 1.0)
                for L in sh: v[L] = Vector(co) + f * (src[L] - src.co)
                v[cl] = 1
                if orig: v[orig] = -1
                return v
            filas = [rim] + [[nuevo(anillos[k][j], rim[j], fades[k]) for j in range(len(rim))] for k in range(len(anillos))]
            vt = nuevo(dd['tapa'], rim[0], 0.0)
            n_v += len(anillos) * len(rim) + 1
            uv_rim, mat_rim = dd['uv'], dd['mat']
            N = len(rim)
            for k in range(len(filas) - 1):
                A, B = filas[k], filas[k + 1]
                for j in range(N):
                    j2 = (j + 1) % N
                    if j2 == 0 and not dd['cerrado']:
                        continue                                    # lazo abierto: no se cierra
                    try:
                        f = bm.faces.new((A[j2], A[j], B[j], B[j2]))
                    except ValueError:
                        continue
                    f.smooth = True
                    f.material_index = mat_rim[lazo[j][0]] if k < 2 else i_mat
                    if uvl:
                        for lp in f.loops: lp[uvl].uv = uv_rim.get(lazo[j][0], lp[uvl].uv)
                    n_f += 1
            U = filas[-1]
            for j in range(N if dd['cerrado'] else N - 1):
                try:
                    f = bm.faces.new((U[(j + 1) % N], U[j], vt)); f.smooth = True; f.material_index = i_mat; n_f += 1
                except ValueError:
                    pass
        bm.to_mesh(me); bm.free(); me.update()
    assert np.allclose(util.coords(me)[:n0], P), 'la cuenca movió vértices existentes'
    d = MK.cfg(cara); d['cuenca'] = dict(P_, color=list(P_['color'])); MK.guardar_cfg(cara, d)
    info['vertices_nuevos'] = n_v; info['caras_nuevas'] = n_f
    return info


def arreglar(cara, M, cuant=True, solapas=True, normales=True, dientes=True, rendija=True):
    util.modo_objeto()
    out = {}
    respaldo(cara)
    if cuant: out['cuantizacion'] = desquantizar(cara, M)
    if solapas: out['solapas'] = quitar_solapas(cara, M)
    if dientes: out['dientes_tripo'] = quitar_dientes_tripo(cara, M)
    if rendija: out['rendija'] = abrir_rendija(cara, M)
    if normales: out['normales'] = normales_boca(cara, M)
    return out
