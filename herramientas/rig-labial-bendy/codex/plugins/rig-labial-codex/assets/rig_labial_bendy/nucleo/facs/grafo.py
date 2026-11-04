# Herramientas de malla para esculpir formas por cálculo: vecinos, distancia geodésica, Laplaciano
# cotangente (con pesos recortados a positivos), solución armónica con restricciones y suavizado de campos.
# Solo numpy (Blender no trae scipy de serie).
import heapq
import numpy as np


class Grafo:
    def __init__(self, co, edges, tris):
        self.co = np.asarray(co, float)
        self.n = len(self.co)
        E = np.asarray(edges, int).reshape(-1, 2)
        self.E = E
        self.lon = np.linalg.norm(self.co[E[:, 0]] - self.co[E[:, 1]], axis=1)
        self.w = self._cot(np.asarray(tris, int).reshape(-1, 3))
        # vecinos (CSR) para Dijkstra
        a = np.concatenate([E[:, 0], E[:, 1]]); b = np.concatenate([E[:, 1], E[:, 0]])
        d = np.concatenate([self.lon, self.lon])
        o = np.argsort(a, kind='stable')
        self._a, self._b, self._d = a[o], b[o], d[o]
        self._ptr = np.searchsorted(self._a, np.arange(self.n + 1))

    def _cot(self, T):
        """peso cotangente por arista (recortado: los triángulos obtusos de Tripo dan pesos negativos)."""
        P = self.co
        key = {}
        for i, (a, b) in enumerate(self.E):
            key[(a, b) if a < b else (b, a)] = i
        w = np.zeros(len(self.E))
        for k in range(3):
            i, j, o = T[:, k], T[:, (k + 1) % 3], T[:, (k + 2) % 3]
            u = P[i] - P[o]; v = P[j] - P[o]
            c = np.einsum('ij,ij->i', u, v)
            s = np.linalg.norm(np.cross(u, v), axis=1) + 1e-12
            cot = c / s
            for e, val in zip(zip(i, j), cot):
                kk = (e[0], e[1]) if e[0] < e[1] else (e[1], e[0])
                idx = key.get(kk)
                if idx is not None:
                    w[idx] += 0.5 * val
        # mezcla con pesos uniformes para estabilidad en mallas irregulares
        w = np.clip(w, 0.05, 4.0)
        return w

    def vecinos(self, i):
        s, e = self._ptr[i], self._ptr[i + 1]
        return self._b[s:e], self._d[s:e]

    def dijkstra(self, fuentes, R=np.inf, inicial=None):
        dist = np.full(self.n, np.inf)
        h = []
        for k, s in enumerate(fuentes):
            d0 = 0.0 if inicial is None else float(inicial[k])
            if d0 < dist[s]:
                dist[s] = d0; h.append((d0, int(s)))
        heapq.heapify(h)
        ptr, bb, dd = self._ptr, self._b, self._d
        while h:
            d, x = heapq.heappop(h)
            if d > dist[x] or d > R:
                continue
            for k in range(ptr[x], ptr[x + 1]):
                y = bb[k]; nd = d + dd[k]
                if nd < dist[y]:
                    dist[y] = nd; heapq.heappush(h, (nd, y))
        return dist

    def armonico(self, fijos, valores, region=None, it=4000, tol=1e-10, uniforme=False):
        """Resuelve L x = 0 en la región con x[fijos] = valores (valores: (k,) o (k, d)).
        Fuera de la región (si se da) x = 0 y actúa como borde libre (Neumann)."""
        n = self.n
        valores = np.asarray(valores, float)
        dim = 1 if valores.ndim == 1 else valores.shape[1]
        V = valores.reshape(len(fijos), dim)
        reg = np.ones(n, bool) if region is None else np.asarray(region, bool).copy()
        reg[fijos] = True
        es_fijo = np.zeros(n, bool); es_fijo[fijos] = True
        libre = reg & ~es_fijo
        E = self.E
        w = np.ones(len(E)) if uniforme else self.w
        m = reg[E[:, 0]] & reg[E[:, 1]]
        E, w = E[m], w[m]
        X = np.zeros((n, dim)); X[fijos] = V
        idx = -np.ones(n, int); li = np.nonzero(libre)[0]; idx[li] = np.arange(len(li))
        if len(li) == 0:
            return X if dim > 1 else X[:, 0]
        diag = np.zeros(n); np.add.at(diag, E[:, 0], w); np.add.at(diag, E[:, 1], w)
        # b = sum w * x_fijo para cada libre
        b = np.zeros((n, dim))
        for (s, t) in ((0, 1), (1, 0)):
            mm = libre[E[:, s]] & es_fijo[E[:, t]]
            np.add.at(b, E[mm, s], w[mm, None] * X[E[mm, t]])
        b = b[li]
        ff = libre[E[:, 0]] & libre[E[:, 1]]
        Ea, Eb, wf = idx[E[ff, 0]], idx[E[ff, 1]], w[ff]
        D = diag[li]
        D[D == 0] = 1.0

        def A(x):
            y = D[:, None] * x
            np.add.at(y, Ea, -wf[:, None] * x[Eb])
            np.add.at(y, Eb, -wf[:, None] * x[Ea])
            return y
        x = b / D[:, None]
        r = b - A(x); z = r / D[:, None]; p = z.copy()
        rz = np.sum(r * z, axis=0)
        b2 = np.sum(b * b, axis=0) + 1e-30
        for _ in range(it):
            Ap = A(p)
            alpha = rz / (np.sum(p * Ap, axis=0) + 1e-30)
            x += alpha * p; r -= alpha * Ap
            if np.all(np.sum(r * r, axis=0) / b2 < tol):
                break
            z = r / D[:, None]
            rz2 = np.sum(r * z, axis=0)
            p = z + (rz2 / (rz + 1e-30)) * p
            rz = rz2
        X[li] = x
        return X if dim > 1 else X[:, 0]

    def suavizar(self, campo, iters=10, lam=0.5, mascara=None, fijos=None):
        """suavizado laplaciano (pesos cotangente) de un campo por vértice; la máscara (0..1) limita dónde actúa."""
        F = np.asarray(campo, float).copy()
        sq = F.ndim == 1
        if sq:
            F = F[:, None]
        E, w = self.E, self.w
        diag = np.zeros(self.n); np.add.at(diag, E[:, 0], w); np.add.at(diag, E[:, 1], w)
        diag[diag == 0] = 1
        mk = np.ones(self.n) if mascara is None else np.asarray(mascara, float)
        if fijos is not None:
            mk = mk.copy(); mk[fijos] = 0
        for _ in range(iters):
            acc = np.zeros_like(F)
            np.add.at(acc, E[:, 0], w[:, None] * F[E[:, 1]])
            np.add.at(acc, E[:, 1], w[:, None] * F[E[:, 0]])
            media = acc / diag[:, None]
            F += (lam * mk)[:, None] * (media - F)
        return F[:, 0] if sq else F


def ss(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def rot_eje(P, piv, eje, ang):
    """rota los puntos P (n,3) alrededor del eje (unitario) por el pivote con ángulos ang (n,) — Rodrigues."""
    v = P - piv
    k = eje / np.linalg.norm(eje)
    c = np.cos(ang)[:, None]; s = np.sin(ang)[:, None]
    kxv = np.cross(k[None, :], v)
    kdv = (v @ k)[:, None]
    return piv + v * c + kxv * s + k[None, :] * kdv * (1 - c)
