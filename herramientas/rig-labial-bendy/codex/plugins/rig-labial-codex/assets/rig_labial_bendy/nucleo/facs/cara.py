# Análisis de la cara para las formas FACS: marco de la boca, zona de trabajo, labio superior/inferior,
# bordes de contacto de los labios, campo de mandíbula y regiones (mejillas, nariz, cejas, ojos).
# Todo se mide en la malla (Basis, espacio local del objeto) y se escala con la media anchura de la boca (hw)
# y el radio del ojo, así que vale para personajes de otra topología.
import bpy, json
import numpy as np
from mathutils import Vector
from .grafo import Grafo, ss


def _marca(cara, k):
    o = bpy.data.objects.get(f'RLB_{cara.name}_{k}')
    if o is None:
        return None
    return np.array((cara.matrix_world.inverted() @ o.matrix_world.translation)[:])


def _basis(me):
    n = len(me.vertices); co = np.zeros(n * 3)
    if me.shape_keys:
        me.shape_keys.key_blocks[0].data.foreach_get('co', co)
    else:
        me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


class Cara:
    def __init__(self, cara, radio_hw=9.0, pivote=None, ojos=None):
        bpy.context.view_layer.update()
        self.obj = cara
        me = cara.data
        self.P = _basis(me)
        cL, cR = _marca(cara, 'comisura.L'), _marca(cara, 'comisura.R')
        ls, li = _marca(cara, 'labio_sup'), _marca(cara, 'labio_inf')
        if cL is None or cR is None:
            raise RuntimeError('Faltan los marcadores de las comisuras (paso 2)')
        self.cL, self.cR = cL, cR
        self.C = (cL + cR) / 2
        self.hw = float(np.linalg.norm(cL - cR) / 2)
        X = (cL - cR) / np.linalg.norm(cL - cR)
        Z = np.array((0, 0, 1.0)); Z = Z - X * (Z @ X); Z /= np.linalg.norm(Z)
        Y = np.cross(Z, X)                     # hacia atrás (+Y si la cara mira a −Y)
        self.X, self.Y, self.Z = X, Y, Z
        self.ls = ls if ls is not None else self.C - Y * 0.6 * self.hw + Z * 0.25 * self.hw
        self.li = li if li is not None else self.C - Y * 0.5 * self.hw - Z * 0.2 * self.hw
        # pivote de la mandíbula
        if pivote is None:
            rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
            if rig and 'mandibula' in rig.data.bones:
                pivote = np.array((cara.matrix_world.inverted() @ rig.matrix_world @ rig.data.bones['mandibula'].head_local)[:])
            else:
                pivote = self.C + Y * 4.3 * self.hw + Z * 1.2 * self.hw
        self.piv = np.asarray(pivote, float)
        # ojos
        self.ojos = {}
        for lado in ('L', 'R'):
            o = bpy.data.objects.get(f'RLB_{cara.name}_ojo.{lado}')
            if o is not None:
                c = np.array((cara.matrix_world.inverted() @ o.matrix_world.translation)[:])
                self.ojos[lado] = (c, float(o.empty_display_size * max(o.scale)))
        # zona de trabajo: isla de la boca dentro de un radio
        R = radio_hw * self.hw
        d = np.linalg.norm(self.P - self.C, axis=1)
        cerca = d < R
        E = np.array([e.vertices[:] for e in me.edges]) if len(me.edges) else np.zeros((0, 2), int)
        m = cerca[E[:, 0]] & cerca[E[:, 1]]
        Ez = E[m]
        # isla conectada a la comisura
        sem = int(np.argmin(np.linalg.norm(self.P - cL, axis=1)))
        isla = self._isla(sem, Ez)
        self.zona = np.nonzero(isla)[0]
        self.gi = -np.ones(len(self.P), int); self.gi[self.zona] = np.arange(len(self.zona))
        Ez = Ez[isla[Ez[:, 0]] & isla[Ez[:, 1]]]
        me.calc_loop_triangles()
        T = np.zeros(len(me.loop_triangles) * 3, int); me.loop_triangles.foreach_get('vertices', T)
        T = T.reshape(-1, 3)
        T = T[isla[T].all(axis=1)]
        self.g = Grafo(self.P[self.zona], self.gi[Ez], self.gi[T])
        self.p = self.P[self.zona]                      # posiciones de la zona
        rel = self.p - self.C
        self.u = rel @ X / self.hw                       # horizontal (−1 comisura R, +1 comisura L)
        self.v = rel @ Z / self.hw                       # vertical
        self.w = rel @ Y / self.hw                       # profundidad (+ hacia dentro)
        self._labios()

    def _isla(self, sem, E):
        n = len(self.P)
        vec = [[] for _ in range(n)]
        for a, b in E:
            vec[a].append(b); vec[b].append(a)
        vis = np.zeros(n, bool); st = [sem]
        while st:
            x = st.pop()
            if vis[x]:
                continue
            vis[x] = True
            st.extend(vec[x])
        return vis

    def aletas(self):
        """alas de la nariz medidas en la malla: {'L', 'R', 'punta'}, o None si no se encuentran. La punta es lo más
        adelantado sobre la boca; las alas, lo más ancho de la nariz a esa altura."""
        if not hasattr(self, '_aletas'):
            self._aletas = None
            q = self.p - self.C
            u, v, w = q @ self.X / self.hw, q @ self.Z / self.hw, q @ self.Y / self.hw
            i = np.nonzero((np.abs(u) < 0.35) & (v > 0.4) & (v < 2.5))[0]
            if len(i):
                t = i[np.argmin(w[i])]
                du = u - u[t]
                banda = (v > v[t] - 0.15) & (v < v[t] + 0.2) & (w < w[t] + 0.75) & (np.abs(du) < 1.0)
                izq, der = np.nonzero(banda & (du > 0))[0], np.nonzero(banda & (du < 0))[0]
                if len(izq) and len(der):
                    a, b = izq[np.argmax(du[izq])], der[np.argmin(du[der])]
                    if du[a] > 0.2 and du[b] < -0.2:
                        self._aletas = {'L': self.p[a], 'R': self.p[b], 'punta': self.p[t]}
        return self._aletas

    def cerca(self, punto, r):
        return np.nonzero(np.linalg.norm(self.p - punto, axis=1) < r)[0]

    def cerca_piel(self, punto, r):
        """vértices a menos de r SOBRE LA PIEL del más cercano al punto (0.8.50). Con los labios solapados, la bola en el aire del
        labio inferior atrapaba el borde del superior («Ojos y textura»: la mandíbula bajaba medio labio de arriba y tapaba los dientes)."""
        i = int(np.argmin(np.linalg.norm(self.p - punto, axis=1)))
        return np.nonzero(self.g.dijkstra(np.array([i]), R=2 * r) <= r)[0]

    def _labios(self):
        hw = self.hw
        u, v, w = self.u, self.v, self.w
        g = self.g
        # campo «inferior» S: 0 en el labio superior y la nariz, 1 en el labio inferior y el mentón
        sup = list(self.cerca_piel(self.ls, 0.12 * hw)) + list(np.nonzero((v > 1.5) & (np.abs(u) < 1.0) & (w < 0.8))[0])
        inf = list(self.cerca_piel(self.li, 0.12 * hw)) + list(np.nonzero((v < -1.6) & (np.abs(u) < 1.0) & (w < 0.8))[0])
        reg = np.linalg.norm(self.p - self.C, axis=1) < 4.5 * hw
        f = np.array(sup + inf); val = np.r_[np.zeros(len(sup)), np.ones(len(inf))]
        self.S = g.armonico(f, val, region=reg)
        self.S[~reg] = np.where(v[~reg] > 0, 0.0, 1.0)
        # bordes de contacto: los vértices de cada labio más cercanos al otro labio (columna a columna).
        # El forro de Tripo sube por detrás del labio superior y baja por detrás del inferior: el criterio de
        # «el más bajo / el más alto» elegía vértices del forro.
        # 0.6.9 (Tronchatoro): con las comisuras altas el labio inferior queda a v = −0,63 y la caja |v| < 0,5
        # (centrada en las comisuras) no lo cogía: sin vértices del labio inferior. Centro entre los dos labios
        v_ls = float((self.ls - self.C) @ self.Z) / hw; v_li = float((self.li - self.C) @ self.Z) / hw
        vc, mv = 0.5 * (v_ls + v_li), max(0.5, 0.5 * (v_ls - v_li) + 0.25)
        boca = (np.abs(u) < 1.03) & (np.abs(v - vc) < mv) & (w < 0.3)
        ms = np.nonzero(boca & (self.S < 0.5))[0]
        mi = np.nonzero(boca & (self.S >= 0.5))[0]
        if len(ms) == 0 or len(mi) == 0:
            raise RuntimeError('No encuentro vértices del labio ' + ('superior' if len(ms) == 0 else 'inferior') +
                               ' junto a la boca: revisa los marcadores labio_sup / labio_inf (paso 2)')
        from mathutils import kdtree

        def _cruce(A, B):
            kd = kdtree.KDTree(len(B))
            for k, i in enumerate(B):
                kd.insert(self.p[i], k)
            kd.balance()
            return np.array([kd.find(self.p[i])[2] for i in A])
        dcs, dci = _cruce(ms, mi), _cruce(mi, ms)
        tol = 0.02 * hw

        def _borde(A, dc):
            out = []
            for k, i in enumerate(A):
                vec = np.abs(u[A] - u[i]) < 0.075
                if dc[k] <= dc[vec].min() + tol:
                    out.append(int(i))
            return np.array(sorted(set(out)), int)
        self.borde_sup, self.borde_inf = _borde(ms, dcs), _borde(mi, dci)
        fijos = self.obj.get('facs_bordes_labios')                # 0.8.45: los medidos con la boca abierta (geometria.bordes_silueta)
        if fijos:
            f = json.loads(fijos)
            s, i = self.gi[np.array(f['sup'], int)], self.gi[np.array(f['inf'], int)]
            if (s >= 0).all() and (i >= 0).all():
                self.borde_sup, self.borde_inf = np.unique(s), np.unique(i)
        self.hueco = {int(i): float(d) for i, d in zip(ms, dcs)}
        # distancia geodésica a los bordes
        self.d_sup = g.dijkstra(self.borde_sup, R=8 * hw)
        self.d_inf = g.dijkstra(self.borde_inf, R=8 * hw)
        self.d_boca = np.minimum(self.d_sup, self.d_inf)

    # --- utilidades
    def a_global(self, D):
        """campo de la zona -> array (n_total, 3)"""
        out = np.zeros((len(self.P), 3)); out[self.zona] = D
        return out

    def info(self):
        return {'hw_mm': round(self.hw * 1000, 2), 'zona': int(len(self.zona)), 'borde_sup': int(len(self.borde_sup)),
                'borde_inf': int(len(self.borde_inf)), 'piv': np.round(self.piv, 4).tolist()}
