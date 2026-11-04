# Formas FACS de la parte de arriba: párpados (parpadeo, entornar, abrir, seguir la mirada), cejas, mejillas
# y nariz. Los párpados GIRAN alrededor del centro del globo (eje horizontal del ojo): el borde se desliza por
# la esfera y no la atraviesa. Las pestañas giran rígidas con su punto del borde (sin picos en los rabillos).
# Como una shape key interpola en línea recta, el parpadeo lleva una intermedia `eyeBlink_mid_<lado>` con
# regla «campana» (peso = 4·w·(1−w)) que devuelve el borde a la esfera a mitad de cierre.
import bpy
import json
import numpy as np
from .grafo import ss, rot_eje
from .geometria import leer_atr
from . import anillo as AN

PARAM = {
    'cierre_linea': 0.22,     # dónde se juntan los párpados (fracción de la abertura desde el borde inferior)
    'alcance_sup': 0.75,      # caída del giro del párpado superior (× radio del globo, geodésica desde el borde)
    'alcance_inf': 0.45,
    'rigido': 0.40,           # fracción del alcance que gira entera (placa del párpado)
    'abrir_grados': 9.0,      # eyeWide: el superior sube
    'entornar_inf': 0.42,     # eyeSquint: el inferior sube (fracción de la abertura)
    'entornar_sup': 0.10,
    'mirar_abajo_sup': 0.38, 'mirar_abajo_inf': 0.10,
    'mirar_arriba_sup': 0.14, 'mirar_arriba_inf': 0.10,
    # × r: distancia al borde del párpado a la que la ceja ya arrastra la piel entera. 0,45 dejaba el borde quieto y la piel de
    # encima moviéndose hasta 6 mm en 0,4 r: aristas vecinas con desplazamientos ×2,5 su longitud (anillos que se mueven y
    # anillos que no, vídeo del habla en Tronchatoro R). Con 1,2 las aristas bruscas bajan de 105 a ~11.
    'ceja_fade': 1.2,
    'ceja_suavizar': 4,
    # 0.8.3 (Ichigo): bajar 0,44 r (7 mm) metía la ceja en el párpado: 0,28 r
    'ceja_subir_in': 0.72, 'ceja_subir_out': 0.58, 'ceja_bajar': 0.28, 'ceja_juntar': 0.20,
    'mejilla_subir': 0.42,          # 0,26 apenas se veía (la sonrisa Duchenne necesita la mejilla arriba)
    'nariz_subir': 0.32,            # 0,16 apenas se veía
}


def _lado_signo(lado):
    return 1 if lado == 'L' else -1


class Ojo:
    def __init__(self, K, lado, param=None):
        self.K = K; self.lado = lado
        self.P = dict(PARAM)
        if param:
            self.P.update(param)
        cara = K.obj
        b = cara.name
        piv = bpy.data.objects.get(f'{b}_OjoPivote_{lado}')
        if piv is not None:
            self.c = np.array((cara.matrix_world.inverted() @ piv.matrix_world.translation)[:])
        else:
            self.c = K.ojos[lado][0]
        glob = None
        for o in (piv.children if piv else []):
            if 'Globo' in o.name:
                glob = o
        if glob is not None:
            M = cara.matrix_world.inverted() @ glob.matrix_world
            G = np.array([(M @ v.co)[:] for v in glob.data.vertices])
            self.r = float(np.linalg.norm(G - self.c, axis=1).max())
        else:
            self.r = K.ojos[lado][1]
        self._margen()
        self._pestanas()

    # --- geometría
    def _ang(self, p):
        q = np.asarray(p) - self.c
        K = self.K
        th = np.arctan2(q @ K.Z, -(q @ K.Y))               # elevación (positivo = arriba)
        return th

    def _margen(self):
        K = self.K; me = K.obj.data
        n = len(me.polygons)
        oc = np.zeros(n, bool)
        if 'RLB_ocultar_ojos_uv' in me.attributes:
            leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
        rid = np.zeros(n, int)
        if 'RLB_region_id' in me.attributes:
            leer_atr(me, 'RLB_region_id', rid)
        # borde del párpado: piel visible apoyada en el globo (|p−c| ≈ r) y, en cada sector alrededor del eje
        # del ojo, la más cercana al eje (la más interior). El medio globo de Tripo es otra isla (oculta) y las
        # pestañas no cuentan.
        vis_v = np.zeros(len(K.P), bool)
        for p in me.polygons:
            if not oc[p.index] and rid[p.index] != 2:
                vis_v[list(p.vertices)] = True
        # la cuenca (0.5.0) no es borde: su bolsa queda más cerca del eje y en Martín el «borde» superior salía a
        # 70° (el real, a 25–33°): la abertura medida era el doble y al cerrar el párpado se pasaba y se doblaba
        q = K.P - self.c
        rxz = np.hypot(q @ K.X, q @ K.Z)
        dist = np.linalg.norm(q, axis=1)
        cand = np.zeros(0, int)
        nsec = 72
        ventana = (vis_v & (dist > self.r - 0.0015) & (dist < self.r + 0.003) & (q @ K.Y < -0.2 * self.r)
                   & (rxz > 0.3 * self.r) & (rxz < 1.2 * self.r))
        if 'rlb_cuenca' in me.attributes:
            # con cuenca, el borde es la piel cosida a ella (el agujero original); en Martín R el borde real
            # quedaba a más de 3 mm de la esfera y solo se encontraban 6 puntos de arriba
            cu = np.zeros(len(K.P)); me.attributes['rlb_cuenca'].data.foreach_get('value', cu)
            vis_v &= cu <= 0
            E = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
            m = (cu[E[:, 0]] > 0) != (cu[E[:, 1]] > 0)
            cos = np.zeros(len(K.P), bool); cos[E[m].ravel()] = True
            cand = np.nonzero(cos & vis_v & (dist < 1.6 * self.r) & (q @ K.Y < -0.2 * self.r)
                              & (rxz > 0.3 * self.r) & (rxz < 1.2 * self.r))[0]
        sector = lambda ids: ((np.arctan2(q[ids] @ K.Z, q[ids] @ K.X) + np.pi) / (2 * np.pi) * nsec).astype(int) % nsec
        if len(cand) < 20:
            cand = np.nonzero(ventana)[0]
        else:
            # 0.7.2 (Tronchatoro): la cuenca puede cubrir solo una parte del contorno (L: solo el párpado de arriba) y sin
            # borde abajo la abertura salía sin párpado inferior. Los sectores sin borde de cuenca se completan con
            # el borde medido sobre la esfera; donde la cuenca sí llega, no cambia nada.
            resto = np.nonzero(ventana)[0]
            falta = ~np.isin(sector(resto), sector(cand)) if len(resto) else np.zeros(0, bool)
            cand = np.concatenate([cand, resto[falta]])
        cand = cand[K.gi[cand] >= 0]
        psi = np.arctan2(q[cand] @ K.Z, q[cand] @ K.X)
        sec = ((psi + np.pi) / (2 * np.pi) * nsec).astype(int) % nsec
        borde = []
        for k in range(nsec):
            m = np.nonzero(sec == k)[0]
            if len(m):
                borde.append(cand[m[np.argmin(rxz[cand[m]])]])
        borde = np.unique(np.array(borde, int))
        # 0.8.45: el lazo de la malla que forma la abertura, si lo hay, manda sobre los puntos medidos en la esfera
        lazo = AN.medir(K, self.lado, self.c, self.r)
        bz = K.gi[np.array(lazo, int) if lazo else borde]; bz = bz[bz >= 0]
        P = K.p[bz]
        x = (P - self.c) @ K.X
        th = self._ang(P)
        i_in = np.argmin(x * _lado_signo(self.lado)); i_out = np.argmax(x * _lado_signo(self.lado))
        x_in, x_out = x[i_in], x[i_out]
        if lazo:                   # los dos tramos del lazo entre los rabillos
            a, b = sorted((i_in, i_out))
            tramo = np.zeros(len(bz), bool); tramo[a:b + 1] = True
            sup = tramo if th[tramo].mean() >= th[~tramo].mean() else ~tramo
            sup[[i_in, i_out]] = True
        else:
            # línea entre los rabillos: arriba / abajo
            t = (x - x_in) / (x_out - x_in + 1e-12)
            th_lin = th[i_in] + t * (th[i_out] - th[i_in])
            sup = th >= th_lin
        self.borde_sup = bz[sup]; self.borde_inf = bz[~sup]
        self.x_in, self.x_out = float(x_in), float(x_out)
        o = np.argsort(x[sup]); self._xs, self._ths = x[sup][o], th[sup][o]
        o = np.argsort(x[~sup]); self._xi, self._thi = x[~sup][o], th[~sup][o]
        g = K.g
        self.d_sup = g.dijkstra(self.borde_sup, R=3 * self.r)
        self.d_inf = g.dijkstra(self.borde_inf, R=3 * self.r)

    def _pestanas(self):
        """pestañas: vértices de las caras de la región 2 (UV) cerca de este ojo, con su raíz en el borde."""
        K = self.K; me = K.obj.data
        self.pest = np.zeros(0, int); self.pest_raiz = np.zeros(0, int)
        if 'RLB_region_id' not in me.attributes:
            return
        rid = np.zeros(len(me.polygons), int); leer_atr(me, 'RLB_region_id', rid)
        vs = set()
        for p in me.polygons:
            if rid[p.index] == 2:
                vs.update(p.vertices)
        vs = np.array(sorted(vs), int)
        vs = vs[np.linalg.norm(K.P[vs] - self.c, axis=1) < 1.6 * self.r]
        vz = K.gi[vs]; vz = vz[vz >= 0]
        # raíz: vértice del borde superior más cercano
        B = K.p[self.borde_sup]
        raiz = np.array([self.borde_sup[np.argmin(np.linalg.norm(B - K.p[i], axis=1))] for i in vz], int)
        self.pest, self.pest_raiz = vz, raiz

    def _ajuste(self, xs, ths):
        """curva suave del borde (polinomio de grado 3 en x); los bordes de Tripo salen en zigzag."""
        if not hasattr(self, '_pol'):
            self._pol = {}
        k = id(xs)
        if k not in self._pol:
            self._pol[k] = np.polyfit(xs, ths, 3 if len(xs) > 6 else 1)
        return self._pol[k]

    def theta_sup(self, x):
        a, b = sorted((self.x_in, self.x_out))
        return np.polyval(self._ajuste(self._xs, self._ths), np.clip(x, a, b))

    def theta_inf(self, x):
        a, b = sorted((self.x_in, self.x_out))
        return np.polyval(self._ajuste(self._xi, self._thi), np.clip(x, a, b))

    def apertura(self, x):
        return np.clip(self.theta_sup(x) - self.theta_inf(x), 0, None)

    def _x(self, p):
        return (np.asarray(p) - self.c) @ self.K.X

    def _dentro(self, x):
        """1 entre los rabillos, 0 fuera (suave)."""
        a, b = sorted((self.x_in, self.x_out))
        w = b - a
        return ss(a - 0.02 * w, a + 0.12 * w, x) * (1 - ss(b - 0.12 * w, b + 0.02 * w, x))

    # --- giro de párpados
    def _giro(self, ang_sup, ang_inf, alc_sup=None, alc_inf=None):
        """Desplazamientos de los párpados. ang_sup(x), ang_inf(x): giro (rad, + = hacia abajo) del borde.
        La placa del párpado (del borde al pliegue) y las pestañas giran enteras alrededor del centro del
        globo; la piel de encima/debajo se estira como una membrana (solución armónica) hasta la zona quieta,
        y nada entra en la esfera del ojo."""
        K = self.K
        alc_sup = (alc_sup or self.P['alcance_sup']) * self.r
        alc_inf = (alc_inf or self.P['alcance_inf']) * self.r
        rig = self.P['rigido']
        x = self._x(K.p)
        dentro = self._dentro(x)
        es_sup = self.d_sup <= self.d_inf
        A = np.where(es_sup, ang_sup(x), ang_inf(x)) * dentro
        if len(self.pest):
            xr = x[self.pest_raiz]
            A[self.pest] = ang_sup(xr) * self._dentro(xr)
        Drot = rot_eje(K.p, self.c, K.X, A) - K.p
        placa = np.where(es_sup, self.d_sup < rig * alc_sup, self.d_inf < rig * alc_inf)
        placa[self.pest] = True
        lejos = np.where(es_sup, self.d_sup > alc_sup, self.d_inf > alc_inf)
        reg = (self.d_sup < 1.6 * alc_sup) | (self.d_inf < 1.6 * alc_inf)
        fij = np.nonzero(reg & (placa | lejos))[0]
        val = np.where(placa[fij, None], Drot[fij], 0.0)
        D = K.g.armonico(fij, val, region=reg)
        D[~reg] = 0
        # nada dentro del globo: se empuja hacia fuera conservando la holgura de reposo
        P1 = K.p + D
        q0 = K.p - self.c; q1 = P1 - self.c
        d0 = np.linalg.norm(q0, axis=1); d1 = np.linalg.norm(q1, axis=1)
        hol = np.clip(d0 - self.r, 0.0002, 0.003)
        lim = self.r + hol
        m = reg & (d1 < lim) & (q1 @ K.Y < 0.3 * self.r)
        if m.any():
            P1[m] = self.c + q1[m] / d1[m, None] * lim[m, None]
        return P1 - K.p

    def _aplicar(self, D):
        return D

    def blink(self, frac=1.0):
        k = self.P['cierre_linea']
        a_s = lambda x: (1 - k) * self.apertura(x) * frac
        a_i = lambda x: -k * self.apertura(x) * frac
        return self._aplicar(self._giro(a_s, a_i))

    def blink_mid(self):
        return self.blink(0.5) - 0.5 * self.blink(1.0)

    def squint(self):
        P = self.P
        a_s = lambda x: P['entornar_sup'] * self.apertura(x)
        a_i = lambda x: -P['entornar_inf'] * self.apertura(x)
        D = self._giro(a_s, a_i, alc_inf=0.9)
        # la mejilla de debajo sube un poco con el párpado
        K = self.K
        q = K.p - self.c
        deb = np.exp(-((q @ K.Z + 1.25 * self.r) / (0.6 * self.r)) ** 2) * np.exp(-((q @ K.X) / (1.0 * self.r)) ** 2)
        deb *= (self.d_sup > self.d_inf)
        D += (deb * 0.08 * self.r)[:, None] * K.Z[None, :]
        return self.K.g.suavizar(D, iters=3, lam=0.4)

    def wide(self):
        P = self.P
        th = np.radians(P['abrir_grados'])
        a_s = lambda x: -th * np.ones_like(x)
        a_i = lambda x: 0.25 * th * np.ones_like(x)
        return self._aplicar(self._giro(a_s, a_i))

    def look_down(self):
        P = self.P
        a_s = lambda x: P['mirar_abajo_sup'] * self.apertura(x)
        a_i = lambda x: P['mirar_abajo_inf'] * self.apertura(x)
        return self._aplicar(self._giro(a_s, a_i))

    def look_up(self):
        P = self.P
        a_s = lambda x: -P['mirar_arriba_sup'] * self.apertura(x)
        a_i = lambda x: -P['mirar_arriba_inf'] * self.apertura(x)
        return self._aplicar(self._giro(a_s, a_i))

    # --- medida del cierre
    def medir_cierre(self, D):
        """separación (mm) entre el borde superior cerrado y el inferior en la misma x."""
        K = self.K
        S = K.p[self.borde_sup] + D[self.borde_sup]
        I = K.p[self.borde_inf] + D[self.borde_inf]
        xs = (S - self.c) @ K.X
        dentro = self._dentro(xs) > 0.9
        gap = []
        for s, ok in zip(S, dentro):
            if not ok:
                continue
            gap.append(np.min(np.linalg.norm(I - s, axis=1)))
        return {'sep_max_mm': round(float(np.max(gap)) * 1000, 2) if gap else None,
                'sep_media_mm': round(float(np.mean(gap)) * 1000, 2) if gap else None}

    def dentro_globo(self, D, holgura=0.0002):
        """vértices de piel visibles que entran en el globo (radio − holgura)."""
        K = self.K
        P = K.p + D
        d = np.linalg.norm(P - self.c, axis=1)
        cerca = (self.d_sup < 0.8 * self.r) | (self.d_inf < 0.6 * self.r)
        return int(np.sum(cerca & (d < self.r - holgura) & (P[:, 1] < self.c[1])))


# ---------------------------------------------------------------- hornear el rig de párpados (huesos radiales)
def _ctrl(rig, nm, lado, f):
    pb = rig.pose.bones.get(f'{nm}.{lado}')
    if pb is None:
        return
    c = next((c for c in pb.constraints if c.type == 'LIMIT_LOCATION'), None)
    if c is None:
        return
    pb.location.y = (c.max_y if f > 0 else -c.min_y) * f


def _pose_cero(rig):
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)


def hornear_parpados(K, ojo, rig, controles):
    """desplazamientos de la zona con los controles del rig de párpados puestos (p. ej. {'parpado': -1}).
    Las pestañas no se copian: giran rígidas con su raíz (el giro que hizo ese punto del borde)."""
    cara = K.obj
    mods = [m for m in cara.modifiers if m.type in ('NODES', 'CORRECTIVE_SMOOTH')]
    vis = [m.show_viewport for m in mods]
    for m in mods:
        m.show_viewport = False
    ad = rig.animation_data
    act = ad.action if ad else None
    if ad:
        ad.action = None
    try:
        _pose_cero(rig)
        for nm, f in controles.items():
            _ctrl(rig, nm, ojo.lado, f)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = cara.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
        ev.to_mesh_clear()
        co = co.reshape(-1, 3)
    finally:
        _pose_cero(rig)
        if ad:
            ad.action = act
        for m, v in zip(mods, vis):
            m.show_viewport = v
        bpy.context.view_layer.update()
    D = co[K.zona] - K.p
    # solo cerca de este ojo
    lejos = np.linalg.norm(K.p - ojo.c, axis=1) > 2.2 * ojo.r
    D[lejos] = 0
    # pestañas rígidas con su raíz: mismo giro alrededor del eje X del ojo
    if len(ojo.pest):
        def ang(p):
            q = p - ojo.c
            return np.arctan2(q @ K.Z, -(q @ K.Y))
        r0 = K.p[ojo.pest_raiz]; r1 = r0 + D[ojo.pest_raiz]
        a = -(ang(r1) - ang(r0))
        nuevo = rot_eje(K.p[ojo.pest], ojo.c, K.X, a)
        D[ojo.pest] = nuevo - K.p[ojo.pest]
    return D


# ---------------------------------------------------------------- pestañas pegadas a la piel
def _piel_bvh(cara, P, excluir_region=(2,)):
    from mathutils.bvhtree import BVHTree
    me = cara.data
    n = len(me.polygons)
    oc = np.zeros(n, bool)
    if 'RLB_ocultar_ojos_uv' in me.attributes:
        leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    rid = np.zeros(n, int)
    if 'RLB_region_id' in me.attributes:
        leer_atr(me, 'RLB_region_id', rid)
    me.calc_loop_triangles()
    tris, piel_v = [], np.zeros(len(P), bool)
    for t in me.loop_triangles:
        if oc[t.polygon_index] or rid[t.polygon_index] in excluir_region:
            continue
        tris.append(tuple(t.vertices)); piel_v[list(t.vertices)] = True
    bvh = BVHTree.FromPolygons(P.tolist(), tris)
    return bvh, np.array(tris, int), piel_v


def _bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01 + 1e-30
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.array([1 - v - w, v, w])


def apoyar_pestanas(cara, holgura=0.00012):
    """Basis: cada vértice de la tira de pestañas (región 2) que no es de la piel se apoya sobre la piel
    (punto más cercano + holgura por la normal). Devuelve la atadura {vértice: (tri, bary, offset)}."""
    from mathutils import Vector
    from .geometria import basis, poner_basis
    me = cara.data
    P = basis(cara)
    bvh, tris, piel_v = _piel_bvh(cara, P)
    rid = np.zeros(len(me.polygons), int); leer_atr(me, 'RLB_region_id', rid)
    pest = set()
    for p in me.polygons:
        if rid[p.index] == 2:
            pest.update(p.vertices)
    pest = np.array(sorted(v for v in pest if not piel_v[v]), int)
    nuevo = P.copy()
    atadura = {}
    for v in pest:
        loc, nor, ti, d = bvh.find_nearest(Vector(P[v]))
        if loc is None:
            continue
        q = np.array(loc[:]) + np.array(nor[:]) * holgura
        nuevo[v] = q
        a, b, c = tris[ti]
        atadura[int(v)] = (int(a), int(b), int(c), _bary(np.array(loc[:]), P[a], P[b], P[c]).tolist())
    poner_basis(cara, nuevo)
    cara['facs_pestanas'] = json.dumps(atadura)
    return {'pestanas': len(pest), 'mov_max_mm': round(float(np.linalg.norm(nuevo - P, axis=1).max()) * 1000, 2)}


def alisar_parpados(cara, ojos, dentro=0.0005, fuera=0.004, iters=30, lam=0.5, mu=-0.53, hol=0.0002, aplicar=True):
    """Alisa en el Basis la franja de piel visible alrededor del hueco del ojo (puntas y escalones que deja
    la tira de pestañas de Tripo). Solo vértices de caras visibles (sin lo oculto ni la tira) entre
    r−dentro y r+fuera del centro del globo, delante y fuera del eje; las cejas no se tocan. Taubin
    (λ/μ) para no encoger; nada entra en el globo (r + hol). Devuelve cuántos vértices se movieron."""
    from .geometria import basis, poner_basis
    me = cara.data
    n = len(me.polygons)
    oc = np.zeros(n, bool); leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    rid = np.zeros(n, int); leer_atr(me, 'RLB_region_id', rid)
    P = basis(cara); X = P.copy()
    vis_v = np.zeros(len(P), bool); ceja = np.zeros(len(P), bool)
    E = set()
    for p in me.polygons:
        vs = list(p.vertices)
        if rid[p.index] == 1:
            ceja[vs] = True
        if oc[p.index] or rid[p.index] == 2:
            continue
        vis_v[vs] = True
        for i in range(len(vs)):
            a, b = vs[i], vs[(i + 1) % len(vs)]
            E.add((a, b) if a < b else (b, a))
    E = np.array(sorted(E), int)
    mov = np.zeros(len(P), float)
    for o in ojos.values():
        K = o.K
        q = P - o.c
        d = np.linalg.norm(q, axis=1)
        rxz = np.hypot(q @ K.X, q @ K.Z)
        sel = (vis_v & ~ceja & (d > o.r - dentro) & (d < o.r + fuera) & (q @ K.Y < -0.15 * o.r)
               & (rxz > 0.2 * o.r) & (rxz < 1.35 * o.r))
        # fuerza: entera junto al globo, se apaga hacia fuera de la franja
        w = 1 - ss(0.5 * fuera, fuera, d - o.r)
        mov = np.maximum(mov, sel * w)
    m = mov > 0.01
    deg = np.zeros(len(P)); np.add.at(deg, E[:, 0], 1); np.add.at(deg, E[:, 1], 1); deg[deg == 0] = 1
    def paso(X, f):
        acc = np.zeros_like(X)
        np.add.at(acc, E[:, 0], X[E[:, 1]]); np.add.at(acc, E[:, 1], X[E[:, 0]])
        L_ = acc / deg[:, None] - X
        return X + (f * mov)[:, None] * L_
    for _ in range(iters):
        X = paso(X, lam)
        X = paso(X, mu)
        for o in ojos.values():
            q = X - o.c; d = np.linalg.norm(q, axis=1)
            mm = m & (d < o.r + hol) & (q[:, 1] < 0)
            X[mm] = o.c + q[mm] / d[mm, None] * (o.r + hol)
    X[~m] = P[~m]
    if not aplicar:
        return X
    poner_basis(cara, X)
    dm = np.linalg.norm(X - P, axis=1)
    return {'vertices': int(m.sum()), 'mov_max_mm': round(float(dm.max()) * 1000, 2),
            'mov_medio_mm': round(float(dm[m].mean()) * 1000, 3) if m.any() else 0}


PARPADO_KEYS = ('eyeBlink', 'eyeBlink_mid', 'eyeSquint', 'eyeWide', 'eyeLookDown', 'eyeLookUp', 'lidAngry', 'lidSad')


def suavizar_keys_parpado(cara, ojos, iters=10, lam=0.5, mu=-0.52, radio=1.5, hol=0.0002):
    """Suaviza los DESPLAZAMIENTOS de las keys de párpado sobre la piel visible del ojo (Taubin): los
    vértices vecinos del borde se mueven juntos y el párpado cerrado no se arruga. El reposo no cambia.
    Nada entra en el globo en la pose de la key."""
    from .geometria import basis
    me = cara.data
    n = len(me.polygons)
    oc = np.zeros(n, bool); leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    rid = np.zeros(n, int); leer_atr(me, 'RLB_region_id', rid)
    B = basis(cara)
    E = set(); vis_v = np.zeros(len(B), bool)
    for p in me.polygons:
        if oc[p.index] or rid[p.index] == 2:
            continue
        vs = list(p.vertices); vis_v[vs] = True
        for i in range(len(vs)):
            a, b = vs[i], vs[(i + 1) % len(vs)]
            E.add((a, b) if a < b else (b, a))
    E = np.array(sorted(E), int)
    deg = np.zeros(len(B)); np.add.at(deg, E[:, 0], 1); np.add.at(deg, E[:, 1], 1); deg[deg == 0] = 1
    hechas = 0
    for lado, o in ojos.items():
        d = np.linalg.norm(B - o.c, axis=1)
        w = vis_v * (1 - ss(0.75 * radio * o.r, radio * o.r, d))
        for base in PARPADO_KEYS:
            k = me.shape_keys.key_blocks.get(f'{base}_{lado}')
            if k is None:
                continue
            co = np.zeros(len(B) * 3); k.data.foreach_get('co', co); D = co.reshape(-1, 3) - B
            for _ in range(iters):
                for f in (lam, mu):
                    acc = np.zeros_like(D)
                    np.add.at(acc, E[:, 0], D[E[:, 1]]); np.add.at(acc, E[:, 1], D[E[:, 0]])
                    D = D + (f * w)[:, None] * (acc / deg[:, None] - D)
            X = B + D
            if base != 'eyeBlink_mid':
                q = X - o.c; dd = np.linalg.norm(q, axis=1)
                mm = (w > 0) & (dd < o.r + hol) & (q[:, 1] < 0) & (np.linalg.norm(B - o.c, axis=1) >= o.r - 0.0003)
                X[mm] = o.c + q[mm] / dd[mm, None] * (o.r + hol)
            k.data.foreach_set('co', X.ravel())
            hechas += 1
    me.update()
    return hechas


def contacto_parpadeo(cara, K, ojo, bordes, alcance=0.55, fin=0.001, grado=3):
    """Receta de contacto del complemento (contacto.py, revisión de Gómez) aplicada en espacio de shape key:
    con eyeBlink = 1, el borde superior y el inferior van a una curva común (punto medio en Y/Z, polinomio de
    grado 3 en X) y el tejido de alrededor sigue por una solución armónica hasta `alcance` × r. Las keys FACS
    se aplican antes de cualquier Armature, así que no hace falta jacobiano. bordes = (sup, inf) índices de
    vértice del borde VISIBLE (contacto._bordes / ojos.abertura_visible del complemento)."""
    me = cara.data
    k = me.shape_keys.key_blocks.get(f'eyeBlink_{ojo.lado}')
    B = K.P
    co = np.zeros(len(B) * 3); k.data.foreach_get('co', co); X = co.reshape(-1, 3)
    X2, info = contacto_pos(K, ojo, X, bordes, alcance, fin, grado)
    k.data.foreach_set('co', X2.ravel())
    me.update()
    return info


def _borde_monotono(K, X, ii, arriba, tol):
    """borde ordenado en X (reposo) sin vértices a menos de `tol` en X de otro: de cada grupo, el más cercano a la
    abertura."""
    ii = np.asarray(ii, int)
    if len(ii) < 3 or tol <= 0:
        return ii
    P0 = K.P[ii]
    o = np.argsort(P0[:, 0]); ii, P0 = ii[o], P0[o]
    out, grupo = [], [0]
    for k in range(1, len(ii) + 1):
        if k < len(ii) and P0[k, 0] - P0[grupo[0], 0] < tol:
            grupo.append(k); continue
        g = np.array(grupo)
        out.append(ii[g[np.argmin(P0[g, 2])] if arriba else g[np.argmax(P0[g, 2])]])
        grupo = [k]
    return np.array(out, int)


def contacto_pos(K, ojo, X, bordes, alcance=0.55, fin=0.001, grado=3, alisar=8, hol=0.0003, dx_min=0.0):
    """lo mismo sobre unas posiciones cualesquiera X (n, 3) de un ojo cerrado (parpadeo combinado con otra forma)
    -> (X corregidas, info)."""
    sup, inf = (np.asarray(b, int) for b in bordes)
    # 0.6.6: dos vértices del borde casi en la misma X (Martín L: −2,3 y −1,8 mm, a 6,7 y 6,2 mm de alto) iban al
    # MISMO punto de la curva: su arista se aplastaba, los triángulos se daban la vuelta y el párpado cerrado salía
    # con una V. Se queda solo el que toca la abertura (el más bajo arriba, el más alto abajo); el otro sigue al tejido
    sup = _borde_monotono(K, X, sup, arriba=True, tol=dx_min)
    inf = _borde_monotono(K, X, inf, arriba=False, tol=dx_min)
    a = max(X[sup, 0].min(), X[inf, 0].min()) + fin
    b = min(X[sup, 0].max(), X[inf, 0].max()) - fin
    def curva(ii):
        o = np.argsort(X[ii, 0]); return X[ii, 0][o], X[ii, 1][o], X[ii, 2][o]
    xs_u, yu, zu = curva(sup); xs_l, yl, zl = curva(inf)
    xs = np.linspace(a, b, 64)
    ym = 0.5 * (np.interp(xs, xs_u, yu) + np.interp(xs, xs_l, yl))
    zm = 0.5 * (np.interp(xs, xs_u, zu) + np.interp(xs, xs_l, zl))
    py = np.polyfit(xs, ym, grado); pz = np.polyfit(xs, zm, grado)
    fij, val = [], []
    w_ext = 0.004
    for i in np.r_[sup, inf]:
        x = X[i, 0]
        t = ss(a - w_ext, a + w_ext, x) * (1 - ss(b - w_ext, b + w_ext, x))
        objetivo = np.array([x, np.polyval(py, np.clip(x, a, b)), np.polyval(pz, np.clip(x, a, b))])
        zi = K.gi[i]
        if zi < 0:
            continue
        fij.append(zi); val.append(t * (objetivo - X[i]))
    fij = np.array(fij, int); val = np.array(val)
    # zona: piel del párpado cerca de los bordes (geodésica en reposo)
    d = K.g.dijkstra(fij, R=2 * alcance * ojo.r)
    zona = d < alcance * ojo.r
    lejos = np.nonzero((d >= alcance * ojo.r) & (d < 1.5 * alcance * ojo.r))[0]
    f_all = np.r_[fij, lejos]
    v_all = np.r_[val, np.zeros((len(lejos), 3))]
    D = K.g.armonico(f_all, v_all, region=zona | np.isin(np.arange(K.g.n), lejos))
    D[~zona] = 0
    D[fij] = val
    Xz = X[K.zona] + D
    # 0.6.6 (paso 2 de la receta de Gómez: objetivo cerrado alisado): el reborde de Tripo trae abolladuras en
    # reposo que, giradas 50°, quedan de frente (Martín L: una V en el párpado cerrado). Taubin de POSICIONES en la
    # zona, más fuerte junto al borde, con el borde fijo (el contacto no cambia); lo que se acerque al globo sale.
    if alisar:
        mk = np.clip(1 - d / (alcance * ojo.r), 0, 1) * zona
        for _ in range(int(alisar)):
            Xz = K.g.suavizar(Xz, iters=1, lam=0.5, mascara=mk, fijos=fij)
            Xz = K.g.suavizar(Xz, iters=1, lam=-0.53, mascara=mk, fijos=fij)
        q = Xz - ojo.c; dq = np.linalg.norm(q, axis=1)
        fuera0 = np.linalg.norm(K.p - ojo.c, axis=1) >= ojo.r - 0.0002
        m = zona & fuera0 & (dq < ojo.r + hol)
        Xz[m] = ojo.c + q[m] / dq[m, None] * (ojo.r + hol)
    X2 = X.copy(); X2[K.zona] = Xz
    return X2, {'mov_max_mm': round(float(np.linalg.norm(Xz - X[K.zona], axis=1).max()) * 1000, 2), 'vertices': int(zona.sum())}


def rabillos(o):
    """puntos aproximados de los rabillos (dentro y fuera) sobre el globo."""
    K = o.K
    out = []
    for x in (o.x_in, o.x_out):
        th = 0.5 * (o.theta_sup(x) + o.theta_inf(x))
        rho = np.sqrt(max(o.r * o.r - x * x, 1e-10)) + 0.0005
        out.append(o.c + K.X * x + K.Z * rho * np.sin(th) - K.Y * rho * np.cos(th))
    return out


def alisar_rabillos(cara, ojos, radio=0.0025, iters=25, lam=0.5, mu=-0.53, hol=0.0002, aplicar=True):
    """Taubin solo cerca de cada rabillo (radio): aplana los pliegues de la esquina sin tocar el resto del
    párpado. Nada entra en el globo."""
    from .geometria import basis, poner_basis
    me = cara.data
    n = len(me.polygons)
    oc = np.zeros(n, bool); leer_atr(me, 'RLB_ocultar_ojos_uv', oc)
    rid = np.zeros(n, int); leer_atr(me, 'RLB_region_id', rid)
    P = basis(cara); X = P.copy()
    vis_v = np.zeros(len(P), bool); E = set()
    for p in me.polygons:
        if oc[p.index] or rid[p.index] == 2:
            continue
        vs = list(p.vertices); vis_v[vs] = True
        for i in range(len(vs)):
            a, b = vs[i], vs[(i + 1) % len(vs)]
            E.add((a, b) if a < b else (b, a))
    E = np.array(sorted(E), int)
    mov = np.zeros(len(P))
    for o in ojos.values():
        for pc in rabillos(o):
            d = np.linalg.norm(P - pc, axis=1)
            mov = np.maximum(mov, vis_v * (1 - ss(0.6 * radio, radio, d)))
    m = mov > 0.01
    deg = np.zeros(len(P)); np.add.at(deg, E[:, 0], 1); np.add.at(deg, E[:, 1], 1); deg[deg == 0] = 1
    def paso(X, f):
        acc = np.zeros_like(X)
        np.add.at(acc, E[:, 0], X[E[:, 1]]); np.add.at(acc, E[:, 1], X[E[:, 0]])
        return X + (f * mov)[:, None] * (acc / deg[:, None] - X)
    for _ in range(iters):
        X = paso(X, lam); X = paso(X, mu)
        for o in ojos.values():
            q = X - o.c; dd = np.linalg.norm(q, axis=1)
            mm = m & (dd < o.r + hol) & (q[:, 1] < 0)
            X[mm] = o.c + q[mm] / dd[mm, None] * (o.r + hol)
    X[~m] = P[~m]
    if not aplicar:
        return X
    previo = json.loads(cara.get('facs_rabillos_orig', '{}'))
    for v in np.nonzero(m)[0]:
        previo.setdefault(str(int(v)), P[v].tolist())
    cara['facs_rabillos_orig'] = json.dumps(previo)
    poner_basis(cara, X)
    return {'vertices': int(m.sum()), 'mov_max_mm': round(float(np.linalg.norm(X - P, axis=1).max()) * 1000, 2)}


def borde_negro_visible(cara, ojos, grosor=(0.035, 0.08, 0.075), paso=0.00012, material=None,
                        color=(0.015, 0.012, 0.015, 1), ocultar_pestanas=True):
    """Pestaña simplificada: el borde del párpado superior pintado de negro, elegido POR LO QUE SE VE.
    Rayos desde delante sobre cada ojo: en cada columna, la piel que queda justo encima del globo visible es
    el borde del párpado; se pintan las caras de piel de una franja de `grosor` (× r: lagrimal, centro,
    rabillo) por encima. La tira de pestañas de Tripo se oculta (reversible). Guarda las caras y su material
    anterior en cara['facs_borde_negro'] para poder deshacerlo."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .geometria import basis
    me = cara.data
    n = len(me.polygons)
    rid = np.zeros(n, int); leer_atr(me, 'RLB_region_id', rid)
    at = me.attributes['RLB_ocultar_ojos_uv']
    oc = np.zeros(n, bool); at.data.foreach_get('value', oc)
    if ocultar_pestanas:
        prev = set(json.loads(cara.get('facs_tira_oculta', '[]')))
        nuevas = set(np.nonzero((rid == 2) & ~oc)[0].tolist())
        oc[list(nuevas)] = True; at.data.foreach_set('value', oc)
        cara['facs_tira_oculta'] = json.dumps(sorted(prev | nuevas))
    P = basis(cara)
    vis = [p.index for p in me.polygons if not oc[p.index] and rid[p.index] != 2]
    bvh = BVHTree.FromPolygons(P.tolist(), [tuple(me.polygons[i].vertices) for i in vis])
    pintar = {}
    for lado, o in ojos.items():
        K = o.K; c = o.c; r = o.r
        s = 1 if lado == 'L' else -1
        xs = np.arange(-1.25 * r, 1.25 * r, paso)
        zs = np.arange(-0.2 * r, 1.0 * r, paso)
        dirv = Vector(K.Y)                      # hacia dentro (la cara mira a −Y)
        ext = (o.x_in, o.x_out)
        for x in xs:
            col = []
            for z in zs:
                p0 = c + K.X * x + K.Z * z - K.Y * 0.05
                h = bvh.ray_cast(Vector(p0), dirv, 0.1)
                # globo: intersección analítica
                q = p0 - c; b = q @ K.Y; cc = q @ q - r * r; disc = b * b - cc
                tg = (-b - np.sqrt(disc)) if disc >= 0 else np.inf
                if h[0] is not None and h[3] < tg - 1e-5:
                    col.append(vis[h[2]])
                elif np.isfinite(tg):
                    col.append(-1)                 # se ve el globo
                else:
                    col.append(-2)                 # nada
            col = np.array(col)
            g = np.nonzero(col == -1)[0]
            if len(g) == 0:
                continue
            arriba = g.max() + 1                     # primera celda de piel por encima del globo
            if arriba >= len(col) or col[arriba] < 0:
                continue
            tt = np.clip((x - ext[0]) / (ext[1] - ext[0] + 1e-12), 0, 1)
            gr = np.interp(tt, [0, 0.5, 1], grosor) * r
            ncel = max(1, int(round(gr / paso)))
            for k in range(arriba, min(len(col), arriba + ncel)):
                if col[k] >= 0:
                    pintar[col[k]] = pintar.get(col[k], 0) + 1
    # caras con al menos 2 impactos (evita motas sueltas)
    caras = [f for f, nn in pintar.items() if nn >= 2]
    nombre = material or f'{cara.name}_Pestana'
    mat = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    mat.diffuse_color = color
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Base Color'].default_value = color; bs.inputs['Roughness'].default_value = 0.7
    if me.materials.find(nombre) < 0:
        me.materials.append(mat)
    mi = me.materials.find(nombre)
    previo = json.loads(cara.get('facs_borde_negro', '{}'))
    for f in caras:
        if str(f) not in previo:
            previo[str(f)] = me.polygons[f].material_index
        me.polygons[f].material_index = mi
    cara['facs_borde_negro'] = json.dumps(previo)
    me.update()
    return {'caras': len(caras)}


def quitar_borde_negro(cara):
    me = cara.data
    previo = json.loads(cara.get('facs_borde_negro', '{}'))
    for f, m in previo.items():
        me.polygons[int(f)].material_index = m
    cara['facs_borde_negro'] = '{}'
    me.update()


def borde_negro(cara, ojos, filas=1, engrosar=0.00035, material=None, color=(0.015, 0.012, 0.015, 1),
                ocultar_pestanas=True):
    """Pestaña simplificada (lo que pidió el usuario): sin tira de pestañas; el borde del párpado superior un
    poco más grueso y pintado de negro. El borde es el borde abierto de la piel visible (sin lo oculto, sin la
    tira de pestañas y sin la cuenca de dentro del globo). Devuelve cuántas caras se pintaron."""
    import bmesh
    from .geometria import basis, poner_basis
    me = cara.data
    n = len(me.polygons)
    rid = np.zeros(n, int); leer_atr(me, 'RLB_region_id', rid)
    at = me.attributes['RLB_ocultar_ojos_uv']
    oc = np.zeros(n, bool); at.data.foreach_get('value', oc)
    if ocultar_pestanas:
        prev = set(json.loads(cara.get('facs_tira_oculta', '[]')))
        nuevas = set(np.nonzero((rid == 2) & ~oc)[0].tolist())
        oc[list(nuevas)] = True; at.data.foreach_set('value', oc)
        cara['facs_tira_oculta'] = json.dumps(sorted(prev | nuevas))
    P = basis(cara)
    cen = np.array([P[list(p.vertices)].mean(0) for p in me.polygons])
    dentro_globo = np.zeros(n, bool)
    for o in ojos.values():
        dentro_globo |= np.linalg.norm(cen - o.c, axis=1) < o.r - 0.0003
    piel = ~oc & (rid != 2) & ~dentro_globo
    nombre = material or f'{cara.name}_Pestana'
    mat = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    mat.diffuse_color = color
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Base Color'].default_value = color; bs.inputs['Roughness'].default_value = 0.7
    if me.materials.find(nombre) < 0:
        me.materials.append(mat)
    mi = me.materials.find(nombre)
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    pintadas, mover = set(), {}
    for lado, o in ojos.items():
        K = o.K
        # aristas de borde de la piel visible alrededor de este ojo
        borde = set()
        for e in bm.edges:
            fs = [f for f in e.link_faces if piel[f.index]]
            if len(fs) != 1:
                continue
            a, b = e.verts
            m = (np.array(a.co) + np.array(b.co)) / 2
            q = m - o.c
            if np.linalg.norm(q) < 1.35 * o.r and q @ K.Y < 0:
                borde.update((a.index, b.index))
        if not borde:
            continue
        bv = np.array(sorted(borde))
        x = (P[bv] - o.c) @ K.X
        th = np.arctan2((P[bv] - o.c) @ K.Z, -((P[bv] - o.c) @ K.Y))
        i_in = np.argmin(x * (1 if lado == 'L' else -1)); i_out = np.argmax(x * (1 if lado == 'L' else -1))
        t = (x - x[i_in]) / (x[i_out] - x[i_in] + 1e-12)
        sup = th >= th[i_in] + t * (th[i_out] - th[i_in])
        sup_v = set(bv[sup].tolist()) | {int(bv[i_in]), int(bv[i_out])}
        # caras de piel que tocan el borde superior (filas)
        anillo = set(sup_v)
        for _ in range(filas):
            caras = {f.index for v in anillo for f in bm.verts[v].link_faces if piel[f.index]}
            pintadas |= caras
            anillo = {v.index for fi in caras for v in bm.faces[fi].verts}
        # engrosar: el borde sale un poco hacia fuera (lejos del centro del ojo)
        for v in sup_v:
            d = P[v] - o.c; d /= np.linalg.norm(d)
            mover[v] = d * engrosar
    for fi in pintadas:
        bm.faces[fi].material_index = mi
    bm.to_mesh(me); bm.free()
    if mover and engrosar:
        nuevo = basis(cara).copy()
        for v, d in mover.items():
            nuevo[v] += d
        poner_basis(cara, nuevo)
    me.update()
    cara['facs_borde_negro'] = json.dumps(sorted(pintadas))
    return {'caras': len(pintadas), 'borde_v': len(mover)}


def atar_pestanas(cara, ojos):
    """atadura de la tira de pestañas (región 2) a la piel SIN moverla: triángulo de piel más cercano
    (fuera de la cuenca del globo), coordenadas baricéntricas y desplazamiento en el marco del triángulo."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from .geometria import basis
    me = cara.data
    P = basis(cara)
    bvh, tris, piel_v = _piel_bvh(cara, P)
    cen = P[tris].mean(1)
    ok = np.ones(len(tris), bool)
    for o in ojos.values():
        ok &= np.linalg.norm(cen - o.c, axis=1) > o.r - 0.0003
    tris = tris[ok]
    bvh = BVHTree.FromPolygons(P.tolist(), [tuple(t) for t in tris])
    rid = np.zeros(len(me.polygons), int); leer_atr(me, 'RLB_region_id', rid)
    pest = set()
    for p in me.polygons:
        if rid[p.index] == 2:
            pest.update(p.vertices)
    pest = sorted(v for v in pest if not piel_v[v])
    at = {}
    for v in pest:
        loc, nor, ti, d = bvh.find_nearest(Vector(P[v]))
        if loc is None:
            continue
        a, b, c = tris[ti]
        l = np.array(loc[:])
        F0 = _marco_tri(P[a], P[b], P[c])
        at[int(v)] = (int(a), int(b), int(c), _bary(l, P[a], P[b], P[c]).tolist(), (F0.T @ (P[v] - l)).tolist())
    cara['facs_pestanas'] = json.dumps(at)
    return len(at)


def _marco_tri(a, b, c):
    e1 = b - a; e1 /= np.linalg.norm(e1) + 1e-12
    n = np.cross(b - a, c - a); n /= np.linalg.norm(n) + 1e-12
    e2 = np.cross(n, e1)
    return np.stack([e1, e2, n], axis=1)          # columnas = ejes


def pegar_pestanas(cara, nombres=None):
    """en cada shape key, cada vértice de pestaña = punto baricéntrico del triángulo deformado + su
    desplazamiento girado con el triángulo (así la tira acompaña al párpado sin despegarse ni rajarse)."""
    from .geometria import basis
    at = json.loads(cara.get('facs_pestanas', '{}'))
    if not at:
        return 0
    me = cara.data
    B = basis(cara)
    vs = np.array([int(k) for k in at], int)
    T = np.array([at[k][:3] for k in at], int)
    W = np.array([at[k][3] for k in at], float)
    OFF = np.array([at[k][4] if len(at[k]) > 4 else (0, 0, 0) for k in at], float)
    n = 0
    for k in me.shape_keys.key_blocks[1:]:
        if nombres is not None and k.name not in nombres:
            continue
        co = np.zeros(len(B) * 3); k.data.foreach_get('co', co); co = co.reshape(-1, 3)
        if not np.any(np.abs(co[T].reshape(-1, 3) - B[T].reshape(-1, 3)) > 1e-7):
            continue
        A, Bb, Cc = co[T[:, 0]], co[T[:, 1]], co[T[:, 2]]
        base = W[:, 0, None] * A + W[:, 1, None] * Bb + W[:, 2, None] * Cc
        e1 = Bb - A; e1 /= np.linalg.norm(e1, axis=1, keepdims=True) + 1e-12
        nn = np.cross(Bb - A, Cc - A); nn /= np.linalg.norm(nn, axis=1, keepdims=True) + 1e-12
        e2 = np.cross(nn, e1)
        co[vs] = base + OFF[:, 0, None] * e1 + OFF[:, 1, None] * e2 + OFF[:, 2, None] * nn
        k.data.foreach_set('co', co.ravel())
        n += 1
    me.update()
    return n


def pegar_pestanas_viejo(cara, nombres=None):
    """en cada shape key, las pestañas se mueven con su triángulo de piel (combinación de sus deltas)."""
    from .geometria import basis
    at = json.loads(cara.get('facs_pestanas', '{}'))
    if not at:
        return 0
    me = cara.data
    B = basis(cara)
    vs = np.array([int(k) for k in at], int)
    T = np.array([at[k][:3] for k in at], int)
    W = np.array([at[k][3] for k in at], float)
    n = 0
    for k in me.shape_keys.key_blocks[1:]:
        if nombres is not None and k.name not in nombres:
            continue
        co = np.zeros(len(B) * 3); k.data.foreach_get('co', co); co = co.reshape(-1, 3)
        d = co - B
        co[vs] = B[vs] + (W[:, :, None] * d[T]).sum(1)
        k.data.foreach_set('co', co.ravel())
        n += 1
    me.update()
    return n


# ---------------------------------------------------------------- cejas, mejillas, nariz
class Arriba:
    def __init__(self, K, ojos, param=None):
        self.K = K; self.ojos = ojos
        self.P = dict(PARAM)
        if param:
            self.P.update(param)
        me = K.obj.data
        rid = np.zeros(len(me.polygons), int)
        if 'RLB_region_id' in me.attributes:
            leer_atr(me, 'RLB_region_id', rid)
        vs = set()
        for p in me.polygons:
            if rid[p.index] == 1:
                vs.update(p.vertices)
        vs = np.array(sorted(vs), int)
        self.ceja = {}
        for lado, o in ojos.items():
            s = _lado_signo(lado)
            sel = vs[((K.P[vs] - K.C) @ K.X) * s > 0]
            z = K.gi[sel]; z = z[z >= 0]
            if len(z) == 0:
                # sin región UV de cejas (Martín): ceja virtual = franja de piel encima del ojo
                q = K.p - o.c
                z = np.nonzero((q @ K.Z > 0.8 * o.r) & (q @ K.Z < 1.5 * o.r) & (np.abs(q @ K.X) < 1.1 * o.r)
                               & (q @ K.Y < 0))[0]
            self.ceja[lado] = z
        self.dceja = {l: K.g.dijkstra(z, R=4 * ojos[l].r) for l, z in self.ceja.items()}

    def _t_ceja(self, lado, p):
        """0 en el extremo de dentro de la ceja, 1 en el de fuera."""
        K = self.K; s = _lado_signo(lado)
        xc = ((K.p[self.ceja[lado]] - K.C) @ K.X) * s
        x = ((np.asarray(p) - K.C) @ K.X) * s
        return np.clip((x - xc.min()) / (xc.max() - xc.min() + 1e-12), 0, 1)

    def _ceja(self, lado, f_t, vec_fn, alcance=1.1):
        """desplaza la ceja (rígida con su perfil a lo largo) y arrastra la piel con caída geodésica.
        No toca el borde del párpado."""
        K = self.K; o = self.ojos[lado]
        t = self._t_ceja(lado, K.p)
        d = self.dceja[lado]
        w = np.exp(-(d / (alcance * o.r)) ** 2)
        # el borde del párpado y las pestañas quietos
        w *= ss(0.05 * o.r, self.P['ceja_fade'] * o.r, np.minimum(o.d_sup, o.d_inf))
        w[self.ceja[lado]] = 1.0
        amp = f_t(t) * w
        D = amp[:, None] * vec_fn(t)
        return K.g.suavizar(D, iters=int(self.P['ceja_suavizar']), lam=0.4, mascara=(d < 2.5 * o.r).astype(float))

    def browInnerUp(self, lado):
        K = self.K; o = self.ojos[lado]; s = _lado_signo(lado)
        a = self.P['ceja_subir_in'] * o.r
        return self._ceja(lado, lambda t: (1 - t) ** 1.3,
                          lambda t: (K.Z[None, :] * a + K.X[None, :] * (-s) * 0.15 * a) * np.ones((len(t), 1)))

    def browOuterUp(self, lado):
        K = self.K; o = self.ojos[lado]
        a = self.P['ceja_subir_out'] * o.r
        return self._ceja(lado, lambda t: t ** 1.3, lambda t: K.Z[None, :] * a * np.ones((len(t), 1)))

    def browDown(self, lado):
        K = self.K; o = self.ojos[lado]; s = _lado_signo(lado)
        a = self.P['ceja_bajar'] * o.r; j = self.P['ceja_juntar'] * o.r
        return self._ceja(lado, lambda t: 1.0 - 0.45 * t,
                          lambda t: (-K.Z[None, :] * a + (K.X[None, :] * (-s) * j - K.Y[None, :] * 0.25 * a) * (1 - t)[:, None]),
                          alcance=1.0)

    def cheekSquint(self, lado):
        K = self.K; o = self.ojos[lado]
        q = K.p - o.c
        m = (np.exp(-((q @ K.Z + 1.5 * o.r) / (0.75 * o.r)) ** 2) * np.exp(-((q @ K.X) / (1.2 * o.r)) ** 2)
             * (o.d_sup > o.d_inf) * (q[:, 1] < 0.3 * o.r))
        D = m[:, None] * (K.Z * self.P['mejilla_subir'] * o.r - K.Y * 0.05 * o.r)[None, :]
        return K.g.suavizar(D, iters=6, lam=0.5)

    def noseSneer(self, lado):
        K = self.K; s = _lado_signo(lado)
        # ala de la nariz: por encima de la boca, junto al centro
        q = K.p - K.C
        u = (q @ K.X) / K.hw * s; v = (q @ K.Z) / K.hw
        al = K.aletas()
        u0, v0 = (0.55, 1.6) if al is None else (((al[lado] - K.C) @ K.X) / K.hw * s, ((al[lado] - K.C) @ K.Z) / K.hw + 0.25)
        m = np.exp(-((u - u0) / 0.45) ** 2) * np.exp(-((v - v0) / 0.6) ** 2) * (q @ K.Y < 0.5 * K.hw)
        D = m[:, None] * (K.Z * self.P['nariz_subir'] * K.hw)[None, :]
        return K.g.suavizar(D, iters=6, lam=0.5)
