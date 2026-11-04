# Formas FACS de la boca calculadas sobre la malla («escultura por cálculo»).
# Cada forma es un campo de desplazamientos en la zona de la cara (K = cara.Cara), expresado en el marco de la
# boca (X hacia la comisura L, Z arriba, Y hacia dentro) y escalado con la media anchura de la boca (hw).
# Principios (lo que pidió el usuario: natural, sin romper la malla):
#   - la mandíbula GIRA alrededor de su pivote (no baja en línea recta); la piel la acompaña con un peso
#     armónico (mentón 1, labio superior 0, mejillas en degradado suave);
#   - la abertura de la boca tiene esquinas redondeadas: el borde de cada labio se reparte la apertura con un
#     perfil g(u) que vale 0 en la comisura (la comisura baja la mitad y se mete hacia dentro);
#   - todo desplazamiento se alisa sobre la malla (suavizado del campo, no de las posiciones);
#   - amplitudes moderadas: la forma a 1,0 es el máximo creíble; los gestos usan fracciones.
import numpy as np
from .grafo import ss, rot_eje

PARAM = {
    'jaw_grados': 13.0,          # giro máximo de la mandíbula (jawOpen = 1)
    'jaw_perfil_k': 2.2,         # perfil de la abertura: g(u) = (1 - |u|^k)^m
    'jaw_perfil_m': 0.45,
    'jaw_comisura_dentro': 0.07, # la comisura se mete hacia el centro al abrir (× hw)
    'jaw_mejilla_hundir': 0.035, # la mejilla junto a la boca se hunde un poco (volumen)
    'sonrisa': (0.28, 0.52, 0.28),   # comisura: fuera, arriba, atrás (× hw)
    'sonrisa_mejilla': 0.32,
    'triste': (0.08, -0.62, 0.06),
    'estirar': (0.32, -0.09, 0.10),
    'hoyuelo': (0.05, 0.03, 0.22),
    'puchero_delante': 0.48, 'puchero_dentro': 0.40,
    'embudo_delante': 0.34, 'embudo_dentro': 0.30, 'embudo_grados': 22.0,
    'subir_labio': 0.32, 'bajar_labio': 0.30,
    'lado': 0.32,
    'presionar': 0.16,
    'enrollar_grados': 48.0,
    'encoger_inf': 0.20, 'encoger_sup': 0.12,
    'inflar': 0.16,
    'nariz': 0.12,
    'mejilla_entornar': 0.10,
}


class Formas:
    def __init__(self, K, param=None):
        self.K = K
        self.P = dict(PARAM)
        if param:
            self.P.update(param)
        hw = K.hw
        self.de = K.d_boca / hw                     # distancia geodésica a los bordes de los labios (× hw)
        self.dsup = K.d_sup / hw
        self.dinf = K.d_inf / hw
        g = K.g
        # comisuras: vértice más cercano al marcador
        self.icL = int(np.argmin(np.linalg.norm(K.p - K.cL, axis=1)))
        self.icR = int(np.argmin(np.linalg.norm(K.p - K.cR, axis=1)))
        self.dcL = g.dijkstra([self.icL], R=6 * hw) / hw
        self.dcR = g.dijkstra([self.icR], R=6 * hw) / hw
        self.J = self._campo_mandibula()

    # ------------------------------------------------------------------ utilidades
    def _vec(self, x, y, z):
        """vector en el marco de la boca (× hw) -> espacio local."""
        K = self.K
        return (K.X * x + K.Z * y + K.Y * z) * K.hw

    def perfil(self, u, k=None, m=None):
        k = k or self.P['jaw_perfil_k']; m = m or self.P['jaw_perfil_m']
        a = np.clip(1 - np.abs(u) ** k, 0, 1)
        return a ** m

    def alisar(self, D, iters=6, lam=0.5, mascara=None):
        return self.K.g.suavizar(D, iters=iters, lam=lam, mascara=mascara)

    def lado(self, s):
        """máscara del lado: s = +1 (L) o −1 (R); cruza suave por el centro."""
        return ss(-0.18, 0.18, s * self.K.u)

    # ------------------------------------------------------------------ mandíbula
    def _campo_mandibula(self):
        K = self.K; u, v, w = K.u, K.v, K.w
        hw = K.hw
        g = self.perfil(u)
        fij, val = [], []
        lab_s = np.nonzero((K.S < 0.5) & (self.dsup < 0.12) & (np.abs(u) < 1.05))[0]
        lab_i = np.nonzero((K.S >= 0.5) & (self.dinf < 0.12) & (np.abs(u) < 1.05))[0]
        fij += list(lab_s); val += list(0.5 * (1 - g[lab_s]))
        fij += list(lab_i); val += list(0.5 * (1 + g[lab_i]))
        pw = (K.piv - K.C) @ K.Y / hw                  # profundidad del pivote
        uno = np.nonzero((v < -1.6) & (np.abs(u) < 2.4) & (w < pw - 0.6) & (v > -3.6))[0]
        cero = np.nonzero(((v > 1.05) & (np.abs(u) < 1.7)) | ((v > 0.55) & (np.abs(u) >= 1.7)) | (v > 2.4)
                          | (w > pw + 0.4) | (v < -4.3))[0]
        uno = np.setdiff1d(uno, fij); cero = np.setdiff1d(np.setdiff1d(cero, fij), uno)
        f = np.r_[np.array(fij, int), uno, cero]
        vv = np.r_[np.array(val), np.ones(len(uno)), np.zeros(len(cero))]
        J = K.g.armonico(f, vv)
        return np.clip(J, 0, 1)

    def jawOpen(self, peso=1.0):
        K = self.K; P = self.P
        th = np.radians(P['jaw_grados']) * peso
        nuevo = rot_eje(K.p, K.piv, K.X, th * self.J)        # +X: la barbilla baja (la cara mira a −Y)
        D = nuevo - K.p
        # la comisura se mete hacia el centro y la mejilla se hunde un poco
        cerca_com = np.exp(-(np.minimum(self.dcL, self.dcR) / 0.55) ** 2)
        D += -np.sign(K.u)[:, None] * K.X[None, :] * (P['jaw_comisura_dentro'] * K.hw * peso) * cerca_com[:, None]
        mej = ss(0.9, 1.4, np.abs(K.u)) * (1 - ss(2.4, 3.2, np.abs(K.u))) * np.exp(-((K.v + 0.5) / 1.2) ** 2)
        D += K.Y[None, :] * (P['jaw_mejilla_hundir'] * K.hw * peso) * mej[:, None]
        return self.alisar(D, iters=4)

    def rotar_mandibula(self, puntos, peso=1.0):
        """para dientes inferiores y lengua: giro rígido completo."""
        th = np.radians(self.P['jaw_grados']) * peso
        return rot_eje(np.asarray(puntos), self.K.piv, self.K.X, np.full(len(puntos), th)) - puntos

    # ------------------------------------------------------------------ comisuras
    def _comisura(self, s, vec, radio=1.25, labio=1.0, extra=None, p_sup=0.8, p_inf=0.8):
        """mueve la comisura del lado s con el vector (× hw) arrastrando los labios con perfil suave.
        p_sup / p_inf: exponente del perfil a lo largo de cada labio (más alto = el centro se mueve menos)."""
        K = self.K
        u = K.u * s
        dc = self.dcL if s > 0 else self.dcR
        # a lo largo del labio: 0 en el centro, 1 en la comisura (curva suave, sin pendiente en el centro)
        a = np.clip(u, 0, None)
        p = p_sup + (p_inf - p_sup) * ss(0.3, 0.7, K.S)
        f_lab = np.where(a <= 1.0, ss(0.0, 1.0, a) ** p, 1.0)
        # caída con la distancia vertical a la boca y con la distancia a la comisura; la de la comisura no llega
        # al centro de los labios (con radio 1,3 hw subía toda la boca ~5 mm y dejaba los dientes al aire)
        f_v = np.exp(-(self.de / (0.75 * radio)) ** 2)
        f_c = np.exp(-(dc / radio) ** 2) * ss(0.2, 0.9, a)
        W = np.maximum(f_lab * f_v * labio, f_c) * self.lado(s)
        v = np.array(vec, float).copy(); v[0] *= s
        D = W[:, None] * self._vec(*v)[None, :]
        if extra is not None:
            D += extra
        return self.alisar(D, iters=8)

    def mouthSmile(self, s):
        P = self.P
        K = self.K
        # mejilla: sube y se adelanta un poco por encima y por fuera de la comisura
        mej = (self.lado(s) * ss(0.55, 1.15, s * K.u) * (1 - ss(2.3, 3.0, s * K.u))
               * np.exp(-((K.v - 1.0) / 1.0) ** 2) * (1 - ss(0.3, 0.9, -K.v)))
        extra = mej[:, None] * self._vec(0.02 * s, P['sonrisa_mejilla'], -0.05)[None, :]
        # boca en «D»: las comisuras suben, el centro del labio superior casi no y el inferior aún menos (U)
        return self._comisura(s, P['sonrisa'], radio=1.3, extra=extra, p_sup=2.6, p_inf=1.9)

    def mouthFrown(self, s):
        K = self.K
        bajo = (self.lado(s) * ss(0.4, 1.0, s * K.u) * (1 - ss(1.8, 2.5, s * K.u))
                * np.exp(-((K.v + 1.0) / 0.8) ** 2))
        extra = bajo[:, None] * self._vec(0, -0.05, -0.03)[None, :]
        return self._comisura(s, self.P['triste'], radio=1.1, extra=extra)

    def mouthStretch(self, s):
        K = self.K
        # estirar = afín a lo largo del labio (u lineal), no solo la comisura
        a = np.clip(s * K.u, 0, None)
        f = np.where(a <= 1.0, a, np.exp(-((a - 1.0) / 0.9) ** 2))
        W = f * np.exp(-(self.de / 1.0) ** 2) * self.lado(s)
        v = np.array(self.P['estirar']); v[0] *= s
        return self.alisar(W[:, None] * self._vec(*v)[None, :], iters=8)

    def mouthDimple(self, s):
        return self._comisura(s, self.P['hoyuelo'], radio=0.9)

    # ------------------------------------------------------------------ labios
    def _labios_mask(self, ancho=1.0, alcance=0.55):
        K = self.K
        return (1 - ss(0.85 * ancho, 1.2 * ancho, np.abs(K.u))) * np.exp(-(self.de / alcance) ** 2)

    def mouthPucker(self):
        K = self.K; P = self.P
        m = self._labios_mask(1.0, 0.6)
        mm = np.exp(-(self.de / 1.1) ** 2) * (1 - ss(1.1, 1.8, np.abs(K.u)))
        u = np.clip(K.u, -1.3, 1.3)
        D = (m[:, None] * self._vec(0, 0, -P['puchero_delante'])[None, :]
             + (mm * u)[:, None] * self._vec(-P['puchero_dentro'], 0, 0)[None, :])
        # mejillas un poco hacia dentro
        mej = ss(1.0, 1.5, np.abs(K.u)) * (1 - ss(2.3, 3.0, np.abs(K.u))) * np.exp(-((K.v + 0.3) / 1.0) ** 2)
        D += mej[:, None] * self._vec(0, 0, 0.05)[None, :]
        return self.alisar(D, iters=8)

    def mouthFunnel(self):
        """«O»: los labios se evierten (giran hacia fuera sobre su raíz), avanzan y las comisuras se juntan.
        La abertura redonda sale de la eversión; los dientes quedan detrás."""
        K = self.K; P = self.P
        u = np.clip(K.u, -1.3, 1.3)
        mm = np.exp(-(self.de / 1.0) ** 2) * (1 - ss(1.1, 1.8, np.abs(K.u)))
        D = (mm * u)[:, None] * self._vec(-P['embudo_dentro'], 0, 0)[None, :]
        m = self._labios_mask(1.0, 0.7)
        D += m[:, None] * self._vec(0, 0, -P['embudo_delante'])[None, :]
        # eversión: giro contrario al de enrollar, más fuerte en el centro (abertura redonda)
        redondo = self.perfil(u / 0.95, k=2.0, m=0.6)
        for sup in (True, False):
            lado = (K.S < 0.5) if sup else (K.S >= 0.5)
            d = self.dsup if sup else self.dinf
            w = lado * np.exp(-(d / 0.5) ** 2) * redondo
            sgn = 1 if sup else -1
            piv = K.C + K.Z * (sgn * 0.35 * K.hw) + K.Y * (0.10 * K.hw)
            th = -np.radians(P['embudo_grados']) * w
            D += rot_eje(K.p, piv, K.X * sgn, th) - K.p
        return self.alisar(D, iters=8)

    def mouthClose(self):
        """con jawOpen (mismo peso) junta los labios: cada labio recorre la mitad del hueco de la mandíbula."""
        K = self.K
        Dj = self.jawOpen(1.0)
        lab = np.exp(-(self.de / 0.45) ** 2) * (1 - ss(1.0, 1.3, np.abs(K.u)))
        sup = (K.S < 0.5) * lab; inf = (K.S >= 0.5) * lab
        # hueco en cada u: diferencia del movimiento de la mandíbula entre el borde inferior y el superior
        bi = K.borde_inf
        o = np.argsort(K.u[bi])
        dz = np.interp(K.u, K.u[bi][o], (Dj[bi] @ K.Z)[o])         # bajada del borde inferior (negativa)
        dy = np.interp(K.u, K.u[bi][o], (Dj[bi] @ K.Y)[o])
        D = np.zeros_like(K.p)
        D += (sup * 0.5)[:, None] * (dz[:, None] * K.Z + dy[:, None] * K.Y)
        D += (inf * -0.5)[:, None] * (dz[:, None] * K.Z + dy[:, None] * K.Y)
        return self.alisar(D, iters=6)

    def mouthPress(self, s):
        K = self.K; P = self.P
        m = self._labios_mask(1.05, 0.45) * self.lado(s)
        hacia = np.where(K.S < 0.5, -1.0, 1.0)
        D = (m * hacia)[:, None] * self._vec(0, P['presionar'], 0)[None, :] + m[:, None] * self._vec(0, 0, 0.04)[None, :]
        return self.alisar(D, iters=6)

    def _enrollar(self, superior):
        K = self.K; P = self.P
        lado = (K.S < 0.5) if superior else (K.S >= 0.5)
        d = self.dsup if superior else self.dinf
        m = lado * np.exp(-(d / 0.42) ** 2) * (1 - ss(0.9, 1.15, np.abs(K.u)))
        # eje a lo largo del labio, en la raíz del labio (detrás y por encima/debajo del borde)
        sgn = 1 if superior else -1
        piv = K.C + K.Z * (sgn * 0.32 * K.hw) + K.Y * (0.15 * K.hw)
        th = np.radians(P['enrollar_grados']) * m
        nuevo = rot_eje(K.p, piv, K.X * sgn, th)
        return self.alisar(nuevo - K.p, iters=6)

    def mouthRollUpper(self):
        return self._enrollar(True)

    def mouthRollLower(self):
        return self._enrollar(False)

    def mouthShrugLower(self):
        K = self.K; P = self.P
        m = (K.S >= 0.5) * np.exp(-(self.dinf / 1.3) ** 2) * (1 - ss(1.0, 1.6, np.abs(K.u)))
        D = m[:, None] * self._vec(0, P['encoger_inf'], -0.04)[None, :]
        return self.alisar(D, iters=8)

    def mouthShrugUpper(self):
        K = self.K; P = self.P
        m = (K.S < 0.5) * np.exp(-(self.dsup / 0.7) ** 2) * (1 - ss(0.95, 1.4, np.abs(K.u)))
        D = m[:, None] * self._vec(0, P['encoger_sup'], -0.05)[None, :]
        return self.alisar(D, iters=8)

    def mouthUpperUp(self, s):
        K = self.K; P = self.P
        cam = np.exp(-((s * K.u - 0.45) / 0.42) ** 2) * self.lado(s)
        m = (K.S < 0.5) * cam * np.exp(-(self.dsup / 1.0) ** 2)
        D = m[:, None] * self._vec(0, P['subir_labio'], -0.03)[None, :]
        return self.alisar(D, iters=8)

    def mouthLowerDown(self, s):
        K = self.K; P = self.P
        cam = np.exp(-((s * K.u - 0.42) / 0.42) ** 2) * self.lado(s)
        m = (K.S >= 0.5) * cam * np.exp(-(self.dinf / 0.9) ** 2)
        D = m[:, None] * self._vec(0, -P['bajar_labio'], -0.03)[None, :]
        return self.alisar(D, iters=8)

    def mouthSide(self, s):
        """mouthLeft (s=+1, hacia la comisura L) / mouthRight."""
        K = self.K; P = self.P
        m = np.exp(-(self.de / 0.9) ** 2) * (1 - ss(1.3, 2.2, np.abs(K.u)))
        # la boca rodea la cara: el lado hacia el que va se mete, el otro sale
        prof = np.clip(s * K.u, -1.2, 1.2) * 0.10
        D = m[:, None] * self._vec(s * P['lado'], 0, 0)[None, :] + (m * prof)[:, None] * K.Y[None, :] * K.hw
        return self.alisar(D, iters=8)

    def cheekPuff(self):
        K = self.K; P = self.P
        mej = ss(0.7, 1.3, np.abs(K.u)) * (1 - ss(2.2, 3.0, np.abs(K.u))) * np.exp(-((K.v + 0.3) / 1.1) ** 2)
        lat = np.sign(K.u)[:, None] * K.X[None, :] * 0.6 - K.Y[None, :]
        lat /= np.linalg.norm(lat, axis=1, keepdims=True)
        D = (mej * P['inflar'] * K.hw)[:, None] * lat
        D += self._labios_mask(1.0, 0.5)[:, None] * self._vec(0, 0, -0.06)[None, :]
        return self.alisar(D, iters=8)

    # ------------------------------------------------------------------ correctivas de combinación
    # Se suman cuando las dos formas están a la vez (peso = producto). Corrigen lo que la suma lineal no da.
    def _bordes_mask(self, alcance=0.45):
        return np.exp(-(self.de / alcance) ** 2) * (1 - ss(0.95, 1.3, np.abs(self.K.u)))

    def corr_jaw_funnel(self):
        """O redonda: comisuras más juntas, laterales de los labios hacia el centro de la abertura."""
        K = self.K
        u = np.clip(K.u, -1.3, 1.3)
        cerca_com = np.exp(-(np.minimum(self.dcL, self.dcR) / 0.7) ** 2)
        D = -(np.sign(K.u) * cerca_com)[:, None] * K.X[None, :] * 0.20 * K.hw
        lat = ss(0.25, 0.85, np.abs(u)) * self._bordes_mask(0.5)
        hacia = np.where(K.S < 0.5, -1.0, 1.0)
        D += (lat * hacia)[:, None] * K.Z[None, :] * 0.12 * K.hw
        D += self._labios_mask(1.0, 0.6)[:, None] * self._vec(0, 0, -0.10)[None, :]
        return self.alisar(D, iters=8)

    def corr_jaw_pucker(self):
        K = self.K
        cerca_com = np.exp(-(np.minimum(self.dcL, self.dcR) / 0.7) ** 2)
        D = -(np.sign(K.u) * cerca_com)[:, None] * K.X[None, :] * 0.14 * K.hw
        D += self._labios_mask(1.0, 0.6)[:, None] * self._vec(0, 0, -0.08)[None, :]
        return self.alisar(D, iters=8)

    def corr_jaw_smile(self, s):
        """sonrisa abierta en «D»: el labio inferior se curva en U (baja el centro), el superior enseña algo
        más de dientes y la comisura sube un poco más."""
        K = self.K
        u = K.u
        lado = self.lado(s)
        inf = (K.S >= 0.5) * np.exp(-(self.dinf / 0.7) ** 2) * np.clip(1 - (u / 0.95) ** 2, 0, 1)
        sup = (K.S < 0.5) * np.exp(-(self.dsup / 0.5) ** 2) * np.clip(1 - (u / 0.9) ** 2, 0, 1)
        D = (inf * lado)[:, None] * self._vec(0, -0.22, 0.02)[None, :]
        D += (sup * lado)[:, None] * self._vec(0, 0.07, 0.0)[None, :]
        dc = self.dcL if s > 0 else self.dcR
        com = np.exp(-(dc / 0.6) ** 2) * lado
        D += com[:, None] * self._vec(0.05 * s, 0.10, 0.02)[None, :]
        return self.alisar(D, iters=8)
