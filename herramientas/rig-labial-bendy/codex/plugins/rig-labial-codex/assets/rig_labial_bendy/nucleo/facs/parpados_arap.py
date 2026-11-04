# Parpadeo limpio (0.6.7, Martín 2026-10-20). El giro (parpados_giro.py) daba el movimiento, pero en un reborde
# grueso de Tripo el cierre salía con arrugas, picos en V y una banda negra: cada vértice decidía su giro por
# distancias y ángulos y vecinos de la misma piel recibían giros distintos. Aquí el parpadeo se RESUELVE:
#   1. borde visible de frente en toda la abertura (también los lagrimales; el detector de Vale se quedaba a 3 mm
#      del lagrimal y ahí el ojo cerrado dejaba un agujero) y unido en cadena por la malla;
#   2. el REBORDE (borde + labio + cara de abajo, hasta d_rig del borde) gira entero sobre el eje X del ojo hasta una
#      curva común de cierre (sup 75 %, inf 25 %); se juntan las crestas de los labios, no los bordes de dentro, y
#      la cara de abajo queda escondida;
#   3. la piel de encima (hasta w_sup / w_inf × r del borde) se estira por ARAP (lo más rígida posible: no se
#      comprime ni se arruga), con el ojo como colisión: el globo y un casquete que cubre la córnea mire a donde mire;
#   4. Taubin suave encima (sin encoger).
# El reborde además se APRIETA al cerrar (comprime = 0,4 de su alto): la línea negra del delineado está pintada en él;
# sin apretarlo, al girar hacia delante salía cerrada como una mancha de 3–4 mm (y pintarla más fina estropeaba la
# línea gruesa del ojo abierto, que es la que se quiere). Así abierto se ve igual y cerrado queda una línea fina.
# Además, las normales propias de Tripo NO siguen a las shape keys (las «arrugas» de Codex y mías eran en buena parte
# eso): en la zona que se mueve se cambian por las de la malla (normales_auto).
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from .grafo import ss

# w_sup 0,55 → 1,2 (0.7.2, Tronchatoro): con 0,55 r la piel libre de encima se estiraba ×1,9 de mediana (p95 ×4) y arrugaba;
# con 1,2 baja a ×1,2 (p95 ×2) y la normal gira menos.
PARAM = dict(w_sup=1.2, w_inf=0.8, cierre=0.25, grado=4, iters=40, holgura=0.0004, lam=50.0, alisar=25,
             d_rig=0.25, cresta=True, casquete=58, comprime=0.4, empuje_suave=4, mezcla_lados=0.5)


def cil(q):
    """(x, θ, ρ) alrededor del eje X del ojo: θ = 0 mirando de frente (-Y), + arriba."""
    return q[:, 0], np.arctan2(q[:, 2], -q[:, 1]), np.hypot(q[:, 1], q[:, 2])


def de_cil(x, th, rho):
    return np.stack([x, -rho * np.cos(th), rho * np.sin(th)], 1)


# ---------------------------------------------------------------- solver lineal del ARAP (0.7.2)
def _acum(idx, vals, n):
    """lo mismo que np.add.at(out, idx, vals) pero con bincount (varias veces más rápido): vals (m, ...) -> (n, ...)"""
    v = np.asarray(vals).reshape(len(idx), -1)
    out = np.empty((n, v.shape[1]))
    for c in range(v.shape[1]):
        out[:, c] = np.bincount(idx, v[:, c], n)
    return out.reshape((n,) + np.asarray(vals).shape[1:])


class Laplaciano:
    """(L + diag(pen)) X = B con L fija: Laplaciano de las aristas de la región libre (la diagonal cuenta también a los
    vecinos fijos). El ARAP resuelve 40 veces el mismo sistema: L se factoriza UNA vez (LU dispersa si hay scipy; si no,
    una inversa densa) y la penalización de colisión, que solo toca unos pocos vértices, entra como actualización de
    rango bajo (Woodbury) con columnas de L⁻¹ guardadas entre vueltas, y entre eyeBlink y eyeBlink_mid.
    Sin scipy y con más de LIMITE vértices libres vuelve al solve denso de siempre."""
    LIMITE = 3500

    def __init__(self, free, E, w):
        self.free = np.asarray(free, bool)
        self.nE = len(E)
        self.F = np.nonzero(self.free)[0]
        self.n = n = len(self.F)
        loc = -np.ones(len(self.free), int); loc[self.F] = np.arange(n)
        ii = np.concatenate([E[:, 0], E[:, 1]]); jj = np.concatenate([E[:, 1], E[:, 0]]); ww = np.concatenate([w, w])
        fi = self.free[ii]
        self.diag = np.bincount(loc[ii[fi]], weights=ww[fi], minlength=n)
        ff = fi & self.free[jj]
        r, c, v = loc[ii[ff]], loc[jj[ff]], -ww[ff]
        self.loc = loc
        try:
            import scipy.sparse as sp
            import scipy.sparse.linalg as sl
            A = (sp.coo_matrix((v, (r, c)), shape=(n, n)) + sp.diags(self.diag)).tocsc()
            self._A = A; self._lu = sl.splu(A); self._inv = None
        except Exception:
            self._A = self._lu = None
            M = np.zeros((n, n)); np.add.at(M, (r, c), v); M[np.arange(n), np.arange(n)] += self.diag
            self._A = M
            self._inv = np.linalg.inv(M) if n <= self.LIMITE else None
        self._cols = {}

    def _base(self, B):
        if self._lu is not None:
            return self._lu.solve(np.ascontiguousarray(B))
        return self._inv @ B

    def _col(self, S):
        falta = [k for k in S if k not in self._cols]
        if falta:
            if self._lu is not None:
                E = np.zeros((self.n, len(falta))); E[falta, np.arange(len(falta))] = 1.0
                Z = self._lu.solve(E)
            else:
                Z = self._inv[:, falta]
            for j, k in enumerate(falta):
                self._cols[k] = Z[:, j].copy()
        return np.stack([self._cols[k] for k in S], 1)

    def resolver(self, pen, B):
        S = np.nonzero(pen)[0]
        if self._lu is None and self._inv is None:                       # grande y sin scipy: como antes
            A = self._A.copy() if not hasattr(self._A, 'tocsc') else self._A.toarray()
            return np.linalg.solve(A + np.diag(pen), B)
        Y = self._base(B)
        if len(S) == 0:
            return Y
        if len(S) > 0.3 * self.n:                                         # demasiados puntos para el rango bajo
            if self._lu is not None:
                import scipy.sparse as sp, scipy.sparse.linalg as sl
                return sl.splu((self._A + sp.diags(pen)).tocsc()).solve(np.ascontiguousarray(B))
            return np.linalg.solve(self._A + np.diag(pen), B)
        Z = self._col(S.tolist())
        M = np.diag(1.0 / pen[S]) + Z[S, :]
        return Y - Z @ np.linalg.solve(M, Y[S, :])


# ---------------------------------------------------------------- el ojo y su borde
def bvh_ojo(cara, lado):
    """BVH (espacio local de la cara) de todas las piezas del ojo: globo, iris, córnea, pupila."""
    piv = bpy.data.objects.get(f'{cara.name}_OjoPivote_{lado}')
    if piv is None:
        return None
    Minv = cara.matrix_world.inverted()
    V = []; F = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in piv.children_recursive:
        if o.type != 'MESH':
            continue
        oe = o.evaluated_get(dg); me = oe.to_mesh()
        M = Minv @ o.matrix_world
        base = len(V)
        V += [M @ v.co for v in me.vertices]
        F += [tuple(base + i for i in p.vertices) for p in me.polygons]
        oe.to_mesh_clear()
    return BVHTree.FromPolygons(V, F) if F else None


def radio_ojo(bvh, c, Q, r):
    """distancia del centro a la superficie más externa del ojo en la dirección de cada punto Q (n, 3)."""
    out = np.full(len(Q), r)
    c = Vector(c)
    for i, q in enumerate(Q):
        d = Vector(q) - c
        if d.length < 1e-9:
            continue
        d.normalize()
        h = bvh.ray_cast(c + d * (3 * r), -d, 3 * r)
        if h[0] is not None:
            out[i] = max(r * 0.5, (h[0] - c).length)
    return out


def _camino(g, a, b, R):
    d = g.dijkstra([a], R=R)
    if not np.isfinite(d[b]):
        return [a, b]
    path = [b]; cur = b
    while cur != a and len(path) < 200:
        nb, ln = g.vecinos(cur)
        cur = int(nb[np.argmin(np.abs(d[nb] + ln - d[cur]))]); path.append(cur)
    return path[::-1]


def cadena(g, ids, P):
    """une los vértices del borde (ordenados en X, índices de la zona) en una cadena continua por la malla: sin los
    vértices de en medio, la fila del borde quedaba con dientes al cerrar."""
    ids = list(ids)
    if not ids:
        return np.array([], int)
    out = [ids[0]]
    for a, b in zip(ids[:-1], ids[1:]):
        out += _camino(g, a, b, 4 * np.linalg.norm(P[a] - P[b]) + 1e-4)[1:]
    return np.array(list(dict.fromkeys(out)), int)


def bordes_finos(cara, K, lado, o, paso_x=0.0003, paso_z=0.00008):
    """borde visible de frente en TODA la abertura: por columna, el vértice de piel justo encima / debajo de lo que
    se ve del ojo (con sus piezas reales) -> (sup, inf) índices de malla ordenados en X."""
    me = cara.data
    zl = np.zeros(len(me.vertices), bool); zl[K.zona] = True
    piel = getattr(K, 'skin_faces', None)
    polys = [tuple(p.vertices) for p in me.polygons
             if (p.index in piel if piel is not None else zl[list(p.vertices)].all())]
    bf = BVHTree.FromPolygons([Vector(v) for v in K.P], polys)
    bo = bvh_ojo(cara, lado)
    if bo is None:
        raise RuntimeError(f'Faltan las piezas del ojo {lado}')
    c = o.c; r = o.r
    up = Vector((0, 1, 0))
    sup, inf = [], []

    def vert(h):
        vs = polys[h[2]]
        P = K.P[list(vs)]
        return int(vs[int(np.argmin(np.linalg.norm(P - np.array(h[0][:]), axis=1)))])
    zs = np.arange(-0.9 * r, 0.9 * r, paso_z)
    for x in np.arange(-r, r, paso_x):
        vis = []
        for z in zs:
            org = Vector((c[0] + x, c[1] - 0.3, c[2] + z))
            ho = bo.ray_cast(org, up, 0.5)
            if ho[0] is None:
                vis.append(False); continue
            hf = bf.ray_cast(org, up, 0.5)
            vis.append(hf[0] is None or hf[0].y > ho[0].y)
        vis = np.array(vis)
        if vis.sum() < 2:
            continue
        iz = np.nonzero(vis)[0]
        t = max(np.split(iz, np.nonzero(np.diff(iz) > 1)[0] + 1), key=len)    # tramo principal
        if len(t) < 2:
            continue
        for z, lst in ((zs[t[-1]] + paso_z, sup), (zs[t[0]] - paso_z, inf)):
            h = bf.ray_cast(Vector((c[0] + x, c[1] - 0.3, c[2] + z)), up, 0.5)
            # 0.8.45 (Pegazo L): sin piel delante del rabillo, el rayo acertaba en la nuca (7 cm detrás) y esa
            # «esquina» arrastraba la cadena del borde 90 mm por la malla -> el párpado superior se estiraba como una lámina
            if h[0] is not None and float(np.linalg.norm(np.array(h[0][:]) - c)) < 1.8 * r:
                lst.append(vert(h))
    sup = np.array(list(dict.fromkeys(sup)), int); inf = np.array(list(dict.fromkeys(inf)), int)
    if len(sup) < 6 or len(inf) < 6:
        raise RuntimeError(f'No encuentro el borde visible del ojo {lado}')
    return sup[np.argsort(K.P[sup, 0])], inf[np.argsort(K.P[inf, 0])]


# ---------------------------------------------------------------- el cierre
class Cierre:
    def __init__(self, cara, K, o, P=None):
        self.K, self.o = K, o
        self.P = dict(PARAM)
        if P:
            self.P.update(P)
        self.bvh = bvh_ojo(cara, o.lado)
        r = o.r; c = o.c
        gi = K.gi
        if cara.get(f'facs_anillo_{o.lado}'):          # 0.8.45: el lazo real del borde (anillo.py), ya continuo
            U, L = o.borde_sup.copy(), o.borde_inf.copy()
            self.bordes = (K.zona[U], K.zona[L])
            self.P['cresta'] = False                   # el lazo ya es lo que se ve: las crestas solo hacen falta con bordes medidos por dentro
        else:
            bs = bordes_finos(cara, K, o.lado, o)
            self.bordes = bs
            U = gi[bs[0]]; L = gi[bs[1]]
            U = cadena(K.g, U[U >= 0], K.p); L = cadena(K.g, L[L >= 0], K.p)
            comun = np.intersect1d(U, L)
            if len(comun) < min(len(U), len(L)):
                U = np.setdiff1d(U, comun); L = np.setdiff1d(L, comun)
        self.U, self.L = U, L
        q = K.p - c
        x, th, rho = cil(q)
        g_ = self.P['grado']
        Lf = L
        if cara.get(f'facs_anillo_{o.lado}'):          # los rabillos son de los dos bordes: si no, el inferior acaba antes y el cierre no llega al rabillo
            Lf = np.r_[L, U[[np.argmin(x[U]), np.argmax(x[U])]]]
        self.fu = np.polyfit(x[U], th[U], g_); self.fl = np.polyfit(x[Lf], th[Lf], g_)
        self.ru = np.polyfit(x[U], np.linalg.norm(q[U], axis=1), 2)
        self.rl = np.polyfit(x[Lf], np.linalg.norm(q[Lf], axis=1), 2)
        self.xa = max(x[U].min(), x[Lf].min()); self.xb = min(x[U].max(), x[Lf].max())
        self.rejilla = None
        if Lf is not L:
            # 0.8.45: con el lazo real, las curvas son los bordes tal cual (el polinomio no llega a la esquina de un rabillo casi
            # vertical y quedaba una rendija). Los dos bordes coinciden en los rabillos y la curva común sale de ellos.
            gx = np.linspace(self.xa, self.xb, 61)
            ou, ol = np.argsort(x[U], kind='stable'), np.argsort(x[Lf], kind='stable')
            gu = np.interp(gx, x[U][ou], th[U][ou]); gl = np.interp(gx, x[Lf][ol], th[Lf][ol])
            gc = gl + self.P['cierre'] * np.maximum(gu - gl, 0)
            for _ in range(6):
                gc[1:-1] = 0.25 * gc[:-2] + 0.5 * gc[1:-1] + 0.25 * gc[2:]
            self.rejilla = (gx, gu, gl, gc)
        self.dU = K.g.dijkstra(U); self.dL = K.g.dijkstra(L)
        self.sup = self.dU <= self.dL
        cerca = np.linalg.norm(q, axis=1) < 2.0 * r
        self.reg = cerca & np.where(self.sup, self.dU < self.P['w_sup'] * r, self.dL < self.P['w_inf'] * r)
        self.dentro_globo = np.linalg.norm(q, axis=1) < r - 0.0002     # la cuenca esculpida, detrás del globo
        self.Re0 = self.reye(K.p)
        self._crestas()

    def _crestas(self):
        """cresta del labio de cada párpado: el punto más bajo (sup) / más alto (inf) del reborde que todavía mira
        hacia fuera; por debajo está su cara de abajo (de frente, la media luna oscura)."""
        K, o, P = self.K, self.o, self.P
        me = K.obj.data
        N = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', N); N = N.reshape(-1, 3)[K.zona]
        q = K.p - o.c
        x, th, rho = cil(q)
        tht = np.stack([np.zeros_like(th), np.sin(th), np.cos(th)], 1)
        rr = np.stack([np.zeros_like(th), -np.cos(th), np.sin(th)], 1)
        dr = P['d_rig'] * o.r
        self.cr = {}
        for lado, dist, sg in (('s', self.dU, -1.0), ('i', self.dL, 1.0)):
            side = self.sup if lado == 's' else ~self.sup
            rim = (dist <= dr) & side & ~self.dentro_globo
            fuera = np.einsum('ij,ij->i', N, rr) >= np.einsum('ij,ij->i', N, sg * tht)
            cand = np.nonzero(rim & fuera)[0]
            xs, ts, ds = [], [], []
            for b0 in np.arange(self.xa, self.xb, 0.0006):
                m = cand[(x[cand] >= b0) & (x[cand] < b0 + 0.0006)]
                if not len(m):
                    # 0.7.2: sin vértice que «mire hacia fuera» en este tramo (Tronchatoro L: la cresta inferior solo se
                    # muestreaba en la mitad de la abertura): se toma el extremo del reborde sin mirar la normal
                    m = np.nonzero(rim & (x >= b0) & (x < b0 + 0.0006))[0]
                if len(m):
                    j = m[np.argmin(th[m])] if lado == 's' else m[np.argmax(th[m])]
                    xs.append(x[j]); ts.append(th[j]); ds.append(np.linalg.norm(q[j]))
            if len(xs) > 6:
                # 0.7.2: se guarda el rango de x con muestras: fuera de él el polinomio de grado 4 se dispara (Tronchatoro L:
                # cresta inferior con muestras en -10,6…2,3 mm de un borde de -10,7…12,6 → 69°, 299° y 767° en el rabillo)
                self.cr[lado] = (np.polyfit(xs, ts, P['grado']), np.polyfit(xs, ds, 2), len(xs), min(xs), max(xs))

    def reye(self, Q):
        """radio de colisión por dirección: el globo y, delante, un casquete que cubre la córnea con el ojo mirando
        a cualquier lado (liso: el párpado cerrado no depende de la mirada)."""
        r = self.o.r
        if self.bvh is None:
            return np.full(len(Q), r)
        if not hasattr(self, '_bulto'):
            dirs = [self.o.c + np.array([np.sin(a), -np.cos(a) * np.cos(b), np.sin(b)]) * r
                    for a in np.linspace(-0.7, 0.7, 15) for b in np.linspace(-0.7, 0.7, 15)]
            self._bulto = max(0.0, float(radio_ojo(self.bvh, self.o.c, np.array(dirs), r).max()) - r)
        d = np.asarray(Q) - self.o.c
        f = -d[:, 1] / np.maximum(np.linalg.norm(d, axis=1), 1e-9)
        return r + self._bulto * ss(np.cos(np.radians(self.P['casquete'])), np.cos(np.radians(30)), f)

    def _cresta(self, lado, xc, f_borde, r_borde):
        """(θ, r) de la cresta en xc. Dentro del rango con muestras es el polinomio de siempre; fuera, se queda en el
        último valor medido y sigue la forma del borde (que sí cubre toda la abertura): sin extrapolar el polinomio."""
        pt, pr, _, a, b = self.cr[lado]
        xs = np.clip(xc, a, b)
        return (np.polyval(pt, xs) + np.polyval(f_borde, xc) - np.polyval(f_borde, xs),
                np.polyval(pr, xs) + np.polyval(r_borde, xc) - np.polyval(r_borde, xs))

    def _curvas(self, x):
        P = self.P
        xc = np.clip(x, self.xa, self.xb)
        tu = np.polyval(self.fu, xc); tl = np.polyval(self.fl, xc)
        ru = np.polyval(self.ru, xc); rl = np.polyval(self.rl, xc)
        if P['cresta'] and 's' in self.cr and 'i' in self.cr:
            # lo que se junta son las crestas: los bordes de dentro pasan de largo y quedan detrás
            tu, ru = self._cresta('s', xc, self.fu, self.ru)
            tl, rl = self._cresta('i', xc, self.fl, self.rl)
        tc = tl + P['cierre'] * np.maximum(tu - tl, 0)
        if self.rejilla is not None:
            gx, gu, gl, gc = self.rejilla
            tu, tl, tc = np.interp(xc, gx, gu), np.interp(xc, gx, gl), np.interp(xc, gx, gc)
        return xc, tu, tl, tc, ru, rl

    def objetivos(self, k):
        """posiciones fijas con el párpado a k: el reborde gira entero hasta la curva común y se acerca/aleja en radio
        lo justo para que los dos labios se toquen."""
        K, o, P = self.K, self.o, self.P
        q = K.p - o.c
        x, th, rho = cil(q)
        xc, tu, tl, tc, ru, rl = self._curvas(x)
        Rc = 0.5 * (ru + rl)
        Yc = de_cil(xc, tc, np.sqrt(np.maximum(Rc ** 2 - xc ** 2, 1e-12))) + o.c
        Rc = np.maximum(Rc, self.reye(Yc) + P['holgura'])
        dr = P['d_rig'] * o.r
        T = {}
        mz = P['mezcla_lados'] * o.r

        def calc(ids, tf, rf):
            d0 = np.linalg.norm(q[ids], axis=1)
            dk = d0 + k * (Rc - rf)[ids]
            # el reborde se aprieta al cerrar (comprime × su alto): la línea pintada en él queda fina con el ojo
            # cerrado y conserva su grosor abierto
            th_c = tc[ids] + P['comprime'] * (th[ids] - tf[ids])
            return de_cil(x[ids], th[ids] + k * (th_c - th[ids]), np.sqrt(np.maximum(dk ** 2 - x[ids] ** 2, 1e-12))) + o.c
        base = self.reg & ~self.dentro_globo
        if self.rejilla is not None:                   # en el rabillo el globo asoma por fuera del borde: el borde cierra igual
            base = base | np.isin(np.arange(len(q)), np.r_[self.U, self.L])
        ids = np.nonzero(base & (((self.dU <= dr) & self.sup) | ((self.dL <= dr) & ~self.sup)))[0]
        Ys = calc(ids, tu, ru); Yi = calc(ids, tl, rl)
        if mz > 0:
            # 0.7.2: en los rabillos «arriba» y «abajo» se decidía con un corte duro (dU ≤ dL) y vértices vecinos recibían
            # objetivos de curvas distintas (Tronchatoro: el 70 % de los triángulos invertidos del reborde estaban ahí).
            # Ahora se mezclan con una transición suave de ±mezcla_lados × r alrededor de dU = dL.
            # 0.8.45 (Pegazo): cerca del rabillo los dos bordes están a menos de mz; sin acotar la transición, cada borde se
            # mezclaba con el otro y el rabillo no cerraba. Cada borde sigue entero su curva.
            du, dl = self.dU[ids], self.dL[ids]
            mv = np.minimum(mz, np.maximum(np.maximum(du, dl), 1e-6))
            a = np.clip(0.5 + 0.5 * (dl - du) / mv, 0, 1)
            a = (a * a * (3 - 2 * a))[:, None]
            Y = a * Ys + (1 - a) * Yi
        else:
            Y = np.where(self.sup[ids][:, None], Ys, Yi)
        if not P['empuje_suave']:
            dd = np.linalg.norm(Y - o.c, axis=1); rm = self.reye(Y) + 0.5 * P['holgura']
            Y = np.where((dd < rm)[:, None], o.c + (Y - o.c) * (rm / dd)[:, None], Y)
        T.update(dict(zip(ids.tolist(), Y)))
        return self._empuje(T, k) if P['empuje_suave'] else T

    def _empuje(self, T, k=1.0):
        """0.7.2: el globo no se atraviesa, pero el empuje hacia fuera se SUAVIZA sobre la malla en vez de recortar cada
        vértice por separado. El recorte duro (Y → radio mínimo) reordenaba vértices vecinos del reborde al entrar en el
        casquete del ojo y volteaba triángulos enteros (Tronchatoro: el 60–90 % de los invertidos del reborde, con todos
        sus vértices fijos). Con el empuje suave: la mitad de invertidos y plegados, 0 vértices dentro del globo."""
        K, o, P = self.K, self.o, self.P
        ids = np.fromiter(T.keys(), int, len(T)); Y = np.array([T[i] for i in ids])
        q = Y - o.c; dd = np.linalg.norm(q, axis=1)
        rm = self.reye(Y) + 0.5 * P['holgura']
        if self.rejilla is not None:                   # lo que en reposo ya estaba dentro de la esfera (rabillo) sale poco a poco con el cierre
            d0 = np.linalg.norm(K.p[ids] - o.c, axis=1)
            rm = np.where(d0 < rm, d0 + k * (rm - d0), rm)
        d = np.maximum(rm - dd, 0.0)
        if not d.any():
            return T
        push = np.zeros((len(K.p), 3)); mk = np.zeros(len(K.p))
        push[ids] = q / np.maximum(dd, 1e-9)[:, None] * d[:, None]; mk[ids] = 1.0
        Y = Y + K.g.suavizar(push, iters=int(P['empuje_suave']), lam=0.5, mascara=mk)[ids]
        q = Y - o.c; dd = np.linalg.norm(q, axis=1); rmin = rm - 0.0002      # red de seguridad: nunca >0,2 mm dentro
        Y = np.where((dd < rmin)[:, None], o.c + q * (rmin / np.maximum(dd, 1e-9))[:, None], Y)
        return dict(zip(ids.tolist(), Y))

    def _inicial(self, k):
        """arranque de ARAP: cada vértice de la banda gira con su borde (menos cuanto más lejos)."""
        K, o, P = self.K, self.o, self.P
        q = K.p - o.c
        x, th, rho = cil(q)
        xc, tu, tl, tc, ru, rl = self._curvas(x)
        r = o.r
        h = np.where(self.sup, 1 - ss(0, P['w_sup'] * r, self.dU), 1 - ss(0, P['w_inf'] * r, self.dL))
        e = 0.1 * r
        kx = ss(self.xa - e, self.xa, x) * (1 - ss(self.xb, self.xb + e, x))
        dth = np.where(self.sup, tc - tu, tc - tl) * h * kx * self.reg
        return de_cil(x, th + k * dth, rho) + o.c

    def resolver(self, k=1.0):
        """posiciones de la zona con el párpado a k (0 abierto, 1 cerrado)."""
        K, o, P = self.K, self.o, self.P
        g = K.g
        T = self.objetivos(k)
        con = np.zeros(len(K.p), bool); con[list(T.keys())] = True
        reg = self.reg | con
        E = g.E; w = g.w
        m = reg[E[:, 0]] | reg[E[:, 1]]
        E = E[m]; w = w[m]
        p0 = K.p
        X = self._inicial(k)
        for i, v in T.items():
            X[i] = v
        free = reg & ~con
        F = np.nonzero(free)[0]
        locF = -np.ones(len(K.p), int); locF[F] = np.arange(len(F))
        nF = len(F)
        lap = getattr(self, '_lap', None)           # eyeBlink y eyeBlink_mid comparten región libre: una sola factorización
        if lap is None or lap.nE != len(E) or not np.array_equal(lap.free, free):
            lap = self._lap = Laplaciano(free, E, w)
        Lm_diag = lap.diag
        fuera = ~self.dentro_globo
        dist0 = np.linalg.norm(p0 - o.c, axis=1)
        clear = np.clip(dist0 - self.Re0, 0, P['holgura'])     # lo que estaba más pegado al ojo, sigue igual de pegado

        def rmin(Xc, ids):
            return self.reye(Xc[ids]) + clear[ids]
        pen = np.zeros(nF); tgt = np.zeros((nF, 3))
        e0 = p0[E[:, 0]] - p0[E[:, 1]]
        R = np.nonzero(reg)[0]
        I3 = np.tile(np.eye(3), (len(K.p), 1, 1))
        for _ in range(P['iters']):
            # local: rotación óptima de cada vértice
            e1 = X[E[:, 0]] - X[E[:, 1]]
            outer = w[:, None, None] * e0[:, :, None] * e1[:, None, :]
            Sm = _acum(E[:, 0], outer, len(K.p)) + _acum(E[:, 1], outer, len(K.p))
            Rr = I3.copy()
            Uu, _, Vt = np.linalg.svd(Sm[R])
            Rot = np.einsum('nij,njk->nik', Vt.transpose(0, 2, 1), Uu.transpose(0, 2, 1))
            neg = np.linalg.det(Rot) < 0
            if neg.any():
                Uu[neg, :, 2] *= -1
                Rot[neg] = np.einsum('nij,njk->nik', Vt[neg].transpose(0, 2, 1), Uu[neg].transpose(0, 2, 1))
            Rr[R] = Rot
            # global
            bvec = np.zeros((nF, 3))
            re = np.einsum('nij,nj->ni', 0.5 * (Rr[E[:, 0]] + Rr[E[:, 1]]), e0) * w[:, None]
            for ii, jj, sg in ((E[:, 0], E[:, 1], 1.0), (E[:, 1], E[:, 0], -1.0)):
                fi = free[ii]
                bvec += _acum(locF[ii[fi]], sg * re[fi], nF)
                fj = fi & ~free[jj]
                bvec += _acum(locF[ii[fj]], w[fj][:, None] * X[jj[fj]], nF)
            X[F] = lap.resolver(pen, bvec + pen[:, None] * tgt)
            # colisión: lo de fuera no entra en el ojo; se proyecta y queda fijado (suave) en la vuelta siguiente
            qx = X[F] - o.c
            dd = np.linalg.norm(qx, axis=1)
            rmF = rmin(X, F)
            dentro = fuera[F] & (dd < rmF - 1e-6)
            pen = np.where(dentro | (pen > 0), P['lam'] * np.median(Lm_diag), 0.0)
            proj = o.c + qx * (np.maximum(dd, rmF) / np.maximum(dd, 1e-9))[:, None]
            tgt = np.where(pen[:, None] > 0, proj, tgt)
            X[F] = np.where(dentro[:, None], proj, X[F])
        if P['alisar']:
            r = o.r
            dside = np.where(self.sup, self.dU / (P['w_sup'] * r), self.dL / (P['w_inf'] * r))
            mk = (1 - ss(0.45, 0.95, dside)) * free * fuera
            ids = np.nonzero(fuera & reg)[0]
            for _ in range(P['alisar']):
                X = g.suavizar(X, iters=1, lam=0.5, mascara=mk)
                X = g.suavizar(X, iters=1, lam=-0.53, mascara=mk)
                qx = X[ids] - o.c; dd = np.linalg.norm(qx, axis=1); rm = rmin(X, ids)
                bad = dd < rm
                X[ids[bad]] = o.c + qx[bad] * (rm[bad] / dd[bad])[:, None]
        return X


# ---------------------------------------------------------------- lo que usa el pipeline
def cerrar(cara, K, FO, O, P=None):
    """escribe eyeBlink_<lado> y eyeBlink_mid_<lado> (residual del medio, el driver de siempre 4·w·(1-w)).
    -> ({lado: Cierre}, info)"""
    from . import construir as C
    G, info = {}, {}
    for l, o in O.items():
        g = Cierre(cara, K, o, P)
        Xf = g.resolver(1.0); Xh = g.resolver(0.5)
        Df = Xf - K.p; Dh = Xh - K.p
        C.escribir(cara, K, FO, f'eyeBlink_{l}', Df)
        C.escribir(cara, K, FO, f'eyeBlink_mid_{l}', Dh - 0.5 * Df)
        g.Df = Df
        G[l] = g
        info[l] = {'borde_sup': len(g.U), 'borde_inf': len(g.L), 'region': int(g.reg.sum()),
                   'crestas': {k: v[2] for k, v in g.cr.items()}, 'max_mm': round(float(np.abs(Df).max() * 1000), 2)}
    return G, info


def correctivas(cara, K, FO, G, claves):
    """parpadeo × otra forma de párpado: con el ojo cerrado esa forma ya no mueve el párpado (si no, entornar o
    mirar abajo abrían el cierre limpio); fuera del párpado sigue igual. -> nombres escritos."""
    from . import construir as C
    kb = cara.data.shape_keys.key_blocks
    me = cara.data
    n = len(me.vertices)
    B = np.zeros(n * 3); me.shape_keys.reference_key.data.foreach_get('co', B)
    hechas = []
    for l, g in G.items():
        # 0.8.45 (Pegazo, risa): con el corte a 0,5 mm la mejilla subía entera justo al lado del párpado quieto; sonrisa + mejilla
        # suman 15 mm y la piel se plegaba en una grieta bajo el ojo. La transición va a un 25 % del movimiento máximo.
        f = np.linalg.norm(g.Df, axis=1)
        m = np.clip(f / (0.25 * f.max() + 1e-12), 0, 1)
        m = K.g.suavizar(m, iters=12, lam=0.5)
        for x in claves:
            nm = f'{x}_{l}'
            if nm not in kb:
                continue
            co = np.zeros(n * 3); kb[nm].data.foreach_get('co', co)
            Dx = (co - B).reshape(-1, 3)[K.zona]
            C.escribir(cara, K, FO, f'eyeBlink_{x}_{l}', -Dx * m[:, None])
            hechas.append(f'eyeBlink_{x}_{l}')
    return hechas


def normales_auto(cara, K, G):
    """en los vértices que mueven los párpados, la normal propia (Tripo) pasa a ser una normal SUAVIZADA de la malla (0.6.9,
    con transición hacia fuera; las crudas dejaban la piel granulada en la malla subdividida): las propias no
    siguen a las shape keys y el párpado cerrado salía lleno de manchas y arrugas. Fuera, como estaban."""
    me = cara.data
    if not me.has_custom_normals:
        return 0
    en = np.zeros(len(me.vertices), bool)
    for g in G.values():
        en[K.zona[g.reg | (np.linalg.norm(g.Df, axis=1) > 1e-6)]] = True
    from .densificar import normales_lisas
    return normales_lisas(me, en)


def tope_desde_malla(cara, K, O, **kw):
    """delineado_tope en la ruta completa (0.6.9): los objetos de cierre no sobreviven entre llamadas, así que se
    rehacen aquí (borde y distancias salen de la malla; las keys no hacen falta). -> nº de esquinas cambiadas o 0."""
    G = {}
    for l, o in O.items():
        try:
            G[l] = Cierre(cara, K, o)
        except Exception:
            continue
    return delineado_tope(cara, K, G, **kw) if G else 0


def delineado_tope(cara, K, G, vmin=-0.35, vmax=0.36, alisar=20, beta=1.0):
    """(opcional, NO va en el pipeline) el delineado mide su alto de frente; en la cara de abajo del reborde eso son mm
    de piel que al cerrar giran hacia delante. Aquí la altura de la UV pasa a ser como mínimo la distancia por la piel
    al borde. Probado en Martín: cerrado mejora, pero abierto la línea sale más fina y dentada; lo que se usa es
    apretar el reborde al cerrar (PARAM comprime)."""
    info = cara.get('facs_delineado_uv')
    if not info:
        return 0
    me = cara.data
    caras = list(info['orig']['caras'])
    uvl = me.uv_layers.active
    uv = np.zeros(len(me.loops) * 2); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    lv = np.zeros(len(me.loops), int); me.loops.foreach_get('vertex_index', lv)
    dU = {l: K.g.suavizar(np.where(np.isfinite(g.dU), g.dU, 1.0), iters=alisar, lam=0.5) for l, g in G.items()}
    n = 0
    for f in caras:
        for lp in me.polygons[f].loop_indices:
            z = K.gi[lv[lp]]
            if z < 0:
                continue
            l = min(G, key=lambda s: np.linalg.norm(K.p[z] - G[s].o.c))
            g = G[l]; r = g.o.r
            vf = (uv[lp, 1] * (vmax - vmin) + vmin) * r
            if vf >= 0 and g.sup[z]:
                vn = max(vf, beta * dU[l][z])
                if vn > vf + 1e-7:
                    uv[lp, 1] = (min(vn / r, vmax) - vmin) / (vmax - vmin); n += 1
    uvl.data.foreach_set('uv', uv.ravel()); me.update()
    return n
