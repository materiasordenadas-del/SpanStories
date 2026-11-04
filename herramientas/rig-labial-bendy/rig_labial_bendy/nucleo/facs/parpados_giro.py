# Párpados por GIRO PURO (0.6.5). Cada vértice gira alrededor del eje horizontal del ojo (por el centro del globo)
# un ángulo propio: un campo escalar suave (placa del párpado = ángulo entero del borde; se apaga con la distancia
# geodésica; arriba/abajo se mezclan solo en los rabillos y en la cuenca). Un giro conserva la distancia al centro:
# la piel nunca entra en el globo y la cuenca nunca sale (no hace falta empujar nada, que era lo que rompía).
# Las keys horneadas del rig radial (parpado_in/out) hundían la frente en Martín y el reborde salía en astillas.
# Las combinaciones parpadeo + entornar/enfadado/triste/mirar abajo/mejilla se pasaban del cierre: llevan correctivas
# `eyeBlink_<X>_<lado>` (driver v0*v1) que dejan el borde superior en el inferior, sin cruzarlo.
import numpy as np
from .grafo import ss, rot_eje

PARAM = {
    'cierre_linea': 0.22,     # dónde se juntan (fracción de la abertura desde el borde inferior)
    'alcance_sup': 0.75, 'alcance_inf': 0.50, 'rigido': 0.38,
    'mezcla': 0.12,
    'rabillo': 0.10,
    'reparto': 2.0,           # rigidizar: alcance (× el del parpadeo) donde la otra forma vuelve a ser ella          # caída del giro fuera de los rabillos (× ancho del ojo)           # ancho (× r) de la mezcla arriba/abajo (rabillos y cuenca)
    'entornar_inf': 0.42, 'entornar_sup': 0.10,
    'abrir': 0.16,            # eyeWide: el superior sube (× abertura)
    'mirar_abajo_sup': 0.38, 'mirar_abajo_inf': 0.10,
    'mirar_arriba_sup': 0.14, 'mirar_arriba_inf': 0.10,
    'enfadado': 0.42, 'triste': 0.36,     # caída del superior en el lado de la nariz / de fuera (× abertura)
    # 0.6.6: el giro de cada vértice es función de SU ALTURA (ángulo sobre el borde, en su columna x), no de la
    # geodésica (que en Tripo va en zigzag: el párpado cerrado salía en V hasta la ceja y el cierre dentado)
    'placa': 0.17, 'placa_inf': 0.10,     # rad sobre/bajo el borde que giran enteros (el reborde de Tripo)
    'alcance_sup_ang': 0.95, 'alcance_inf_ang': 0.55,   # rad donde el giro llega a 0 (si no hay ceja antes)
    'contacto_alcance': 0.55,             # × r: tejido que sigue a la corrección de contacto (armónica)
    'alisar': 12,                         # pasadas de alisado del ángulo (bordes fijos)
    'ceja_margen': 0.06,                 # rad: el giro acaba antes del filo de abajo de la ceja (la ceja no se mueve)
}


AP_MIN = 0.25               # fracción de la abertura máxima por debajo de la cual un borde no entra en el ajuste de _frac_suave
FRAC_MAX = 1.2              # ninguna forma mueve un borde más que la abertura entera


class Giro:
    def __init__(self, ojo, param=None):
        self.o = ojo; self.K = ojo.K
        self.P = dict(PARAM)
        if param:
            self.P.update(param)
        o, K, P = ojo, ojo.K, self.P
        r = o.r
        self.x = o._x(K.p)
        a, b = sorted((o.x_in, o.x_out))
        sg = 1 if o.lado == 'L' else -1
        # t: 0 en el lagrimal, 1 en el rabillo
        self.t = np.clip((self.x - o.x_in) / (o.x_out - o.x_in + 1e-12), 0, 1)
        # se apaga FUERA de los rabillos (con la mezcla por altura no hace falta frenar dentro: con el freno de
        # antes, 12 % del ancho, los rabillos no cerraban y se veía el ojo)
        w = b - a
        self.dentro = ss(a - P['rabillo'] * w, a + 0.01 * w, self.x) * (1 - ss(b - 0.01 * w, b + P['rabillo'] * w, self.x))
        ds = np.where(np.isfinite(o.d_sup), o.d_sup, 1e3); di = np.where(np.isfinite(o.d_inf), o.d_inf, 1e3)
        self.ds, self.di = ds, di
        self.fijos = np.unique(np.r_[o.borde_sup, o.borde_inf])
        self.ap = o.apertura(self.x)                       # abertura suave (bordes ajustados a un polinomio)
        # --- campo por ALTURA (0.6.6). En cada columna x: th = ángulo de elevación sobre el centro del ojo.
        # Bordes reales (interpolados entre sus vértices, con el zigzag de Tripo) y suaves (polinomio): el parpadeo
        # gira cada columna lo justo para que el borde REAL caiga en la línea de cierre SUAVE (cierre limpio por
        # construcción); las demás formas giran lo que dicen sus fracciones de la abertura suave.
        xc = np.clip(self.x, a, b)
        self.s_act = np.interp(xc, o._xs, o._ths); self.i_act = np.interp(xc, o._xi, o._thi)
        self.jag_s = self.s_act - o.theta_sup(self.x); self.jag_i = self.i_act - o.theta_inf(self.x)
        q = K.p - o.c
        dist = np.linalg.norm(q, axis=1)
        th = o._ang(K.p)
        ap_act = np.maximum(self.s_act - self.i_act, 1e-3)
        u = (th - self.i_act) / ap_act                     # 0 borde inferior, 1 superior
        arriba, abajo = u >= 1, u <= 0
        s_s = th - self.s_act; s_i = self.i_act - th       # ángulo sobre / bajo cada borde
        # el giro del superior acaba antes de la ceja (islas de Tripo): la ceja no se mueve y la piel entre medias
        # se estira lisa (con la geodésica y el freno por distancia a la ceja salía una V hasta la ceja)
        top = np.full(len(K.p), P['alcance_sup_ang'])
        cej, Bm = islas_cejas(K.obj, K, {o.lado: o})
        self.ceja = None
        if cej.any():
            # la ceja de Tripo sobresale: medida por su propio ángulo quedaba a 5° del borde (Martín). Se mide la
            # PIEL que tiene debajo (a menos de 0,25 r de la isla): su altura más baja por columnas
            from mathutils.kdtree import KDTree
            Qb = Bm[cej]; kd = KDTree(len(Qb))
            for i_, p_ in enumerate(Qb):
                kd.insert(p_, i_)
            kd.balance()
            dB = np.array([kd.find(p_)[2] for p_ in K.p])
            fr = arriba & (q @ K.Y < 0) & (dB < 0.25 * r) & (dist < 3.0 * r)
            if fr.sum() > 10:
                xb = self.x[fr]; tb = th[fr]
                bins = np.linspace(xb.min(), xb.max(), 16)
                xs_, ts_ = [], []
                for k in range(len(bins) - 1):
                    m = (xb >= bins[k]) & (xb < bins[k + 1])
                    if m.sum() > 2:
                        xs_.append(xb[m].mean()); ts_.append(tb[m].min())
                if len(xs_) > 4:
                    pc = np.polyfit(xs_, ts_, 2)
                    tb_x = np.polyval(pc, np.clip(self.x, min(xs_), max(xs_)))
                    top = np.clip(tb_x - P['ceja_margen'] - self.s_act, P['placa'] + 0.15, P['alcance_sup_ang'])
                    self.ceja = {'x_mm': [round(min(xs_) * 1000, 1), round(max(xs_) * 1000, 1)],
                                 'piel_deg': np.degrees(ts_).round(0).tolist()}
        # cuánto gira (caída) va por la distancia sobre la piel al borde: con el ángulo, la piel de un arco
        # superciliar saliente (Martín: 1,7 r delante del centro) tenía «poca altura» y giraba entera (pico de 22 mm).
        # Encima, se apaga antes de la piel que hay bajo la ceja (la ceja ya no baja con el párpado).
        geo_s = 1 - ss(P['rigido'] * P['alcance_sup'] * r, P['alcance_sup'] * r, ds)
        geo_i = 1 - ss(P['rigido'] * P['alcance_inf'] * r, P['alcance_inf'] * r, di)
        ang_s = 1 - ss(P['placa'], top, s_s)
        self.ws = np.where(arriba, np.minimum(geo_s, np.where(ds <= P['rigido'] * P['alcance_sup'] * r, 1.0, ang_s)),
                           np.where(abajo, 0.0, 1.0))
        self.wi = np.where(abajo, geo_i, np.where(arriba, 0.0, 1.0))
        # la piel de debajo de la ceja no gira nada (un giro hacia abajo la lleva hacia DELANTE: atravesaba la ceja)
        self.bajo_ceja = np.zeros(len(K.p), bool)
        if cej.any():
            # dónde empieza la piel de debajo de la ceja, en distancia sobre la piel al borde y por COLUMNAS (curva
            # suave en x): el giro se apaga antes. Con el freno por la distancia de cada vértice a la ceja, en el
            # lado de la nariz (ceja muy cerca del reborde) el reborde se doblaba en V
            placa = ds <= P['rigido'] * P['alcance_sup'] * r
            bc = arriba & (dB < 0.15 * r) & np.isfinite(ds) & (ds < 3 * r)
            if bc.sum() > 8:
                xb, db_ = self.x[bc], ds[bc]
                bins = np.linspace(xb.min(), xb.max(), 12)
                xs_, ds_ = [], []
                for k in range(len(bins) - 1):
                    mk = (xb >= bins[k]) & (xb < bins[k + 1])
                    if mk.sum() > 1:
                        xs_.append(xb[mk].mean()); ds_.append(db_[mk].min())
                if len(xs_) > 3:
                    lim = np.polyval(np.polyfit(xs_, ds_, 2), np.clip(self.x, min(xs_), max(xs_)))
                    r0 = P['rigido'] * P['alcance_sup'] * r
                    alc = np.clip(lim - 0.08 * r, r0 + 0.2 * r, P['alcance_sup'] * r)
                    self.ws = np.where(arriba & ~placa, np.minimum(self.ws, 1 - ss(r0, alc, ds)), self.ws)
                    self.ceja = self.ceja or {}
                    self.ceja['alcance_mm'] =[round(float(alc.min()) * 1000, 1), round(float(alc.max()) * 1000, 1)]
            self.bajo_ceja = ~placa & (dB < 0.15 * r)
            self.ws = np.where(self.bajo_ceja, 0.0, self.ws)
        # arriba/abajo: por los bordes SUAVES y, entre ellos, por la distancia sobre la piel a cada borde. Con el
        # borde real un vértice del zigzag 2,5 mm más alto (Martín L, x = −2,3 mm) dejaba el reborde de debajo «entre
        # los bordes»: mezclaba el giro del inferior, se quedaba atrás y el párpado salía con una V
        u_s = (th - o.theta_inf(self.x)) / np.maximum(self.ap, 1e-3)
        mz0 = P['mezcla'] * r
        b_geo = ss(-mz0, mz0, di - ds)
        self.b = np.where(u_s >= 1, 1.0, np.where(u_s <= 0, 0.0, b_geo))
        # bolsa/cuenca de Tripo o del complemento (detrás del borde, dentro de la esfera): gira entera con su párpado
        # (si su fondo se quedaba quieto salía una cuchilla gris por delante del iris); al girar sigue dentro del globo
        # bolsa = lo que el globo tapa visto de frente (dentro de su silueta y detrás de su cara delantera); con
        # «cerca de la esfera y detrás» entraba piel de encima del ojo y salía un pico hasta la ceja (Martín L)
        rxz = np.hypot(q @ K.X, q @ K.Z)
        bolsa = (rxz < 0.98 * r) & (q @ K.Y > -np.sqrt(np.clip(r * r - rxz * rxz, 0, None)))
        me = K.obj.data
        if 'rlb_cuenca' in me.attributes:
            cu = np.zeros(len(me.vertices)); me.attributes['rlb_cuenca'].data.foreach_get('value', cu)
            bolsa |= (cu[K.zona] > 0) & (dist < 1.5 * r)
        mz = P['mezcla'] * r
        self.b = np.where(bolsa, ss(-mz, mz, q @ K.Z), self.b)
        self.ws = np.where(bolsa, 1.0, self.ws); self.wi = np.where(bolsa, 1.0, self.wi)
        self.lejos = 1 - ss(2.2 * r, 3.0 * r, dist)

    def campo(self, f_sup, f_inf, cierre=0.0):
        """ángulo por vértice (+ = hacia abajo). f_sup/f_inf: fracción de la abertura en cada vértice (por su x).
        cierre (0–1): cuánto se lleva además el zigzag de los bordes reales a la curva suave (el parpadeo: 1)."""
        Ds = np.asarray(f_sup, float) * self.ap + cierre * self.jag_s
        Di = np.asarray(f_inf, float) * self.ap + cierre * self.jag_i
        A = (self.b * self.ws * Ds + (1 - self.b) * self.wi * Di) * self.dentro * self.lejos
        # alisado del ángulo sobre la malla (sigue siendo giro puro: nada entra en el globo); los bordes quedan fijos
        # para que el cierre siga exacto. Sin esto la rejilla gruesa de Tripo salía en facetas y con una muesca
        # fijos también lo que no gira (bajo la ceja y fuera del alcance): el alisado no lo arrastra
        quieto = np.nonzero(self.bajo_ceja | (np.abs(A) < 1e-6) & ((self.ws + self.wi) * self.dentro * self.lejos < 1e-3))[0]
        return self.K.g.suavizar(A, iters=self.P['alisar'], lam=0.5, fijos=np.union1d(self.fijos, quieto))

    def D(self, A):
        o, K = self.o, self.K
        return rot_eje(K.p, o.c, K.X, A) - K.p

    # --- formas (ángulos)
    def a_blink(self, f=1.0):
        k = self.P['cierre_linea']
        return self.campo((1 - k) * f, -k * f)

    def a_squint(self):
        return self.campo(self.P['entornar_sup'], -self.P['entornar_inf'])

    def a_wide(self):
        return self.campo(-self.P['abrir'], 0.04)

    def a_down(self):
        return self.campo(self.P['mirar_abajo_sup'], self.P['mirar_abajo_inf'])

    def a_up(self):
        return self.campo(-self.P['mirar_arriba_sup'], -self.P['mirar_arriba_inf'])

    def a_angry(self):
        w = (1 - self.t) ** 1.3
        return self.campo(self.P['enfadado'] * w, -0.06 * w)

    def a_sad(self):
        w = self.t ** 1.3
        return self.campo(self.P['triste'] * w, 0.0)

    # --- combinación con el parpadeo cerrado: el superior baja hasta el inferior, sin cruzarlo
    def frac_borde(self, D, borde):
        """giro de un borde con los desplazamientos D, en fracción de abertura (+ = abajo), por x de cada vértice."""
        o = self.o
        P0 = self.K.p[borde]
        v = -(o._ang(P0 + D[borde]) - o._ang(P0)) / np.maximum(self.ap[borde], 1e-9)
        xs = self.x[borde]; orden = np.argsort(xs)
        return np.interp(self.x, xs[orden], v[orden])

    def correctiva_blink(self, D_x, D_blink):
        """correctiva de eyeBlink × X (X a 1): objetivo = X y encima el giro que falta para cerrar en la línea
        más alta de las dos (la del parpadeo o la que sube X); correctiva = objetivo − X − parpadeo."""
        k = self.P['cierre_linea']
        o, K = self.o, self.K
        fs = self._frac_suave(D_x, o.borde_sup)
        sube = -self._frac_suave(D_x, o.borde_inf)           # lo que X sube el inferior (curva suave: sin zigzag)
        linea = np.maximum(k, sube)
        A = self.campo(np.clip(1 - linea - fs, 0, None), -(linea - sube))
        obj = rot_eje(K.p + D_x, o.c, K.X, A) - K.p
        return obj - D_x - D_blink

    # --- cualquier otra forma (cejas, mejilla, nariz, boca) en la zona del párpado: solo giro
    def _frac_suave(self, D, borde, grado=3):
        """giro de un borde (fracción de abertura, + = abajo) ajustado a una curva suave en x: los bordes de Tripo
        van en zigzag y cada diente salía como un escalón."""
        o = self.o
        P0 = self.K.p[borde]
        v = -(o._ang(P0 + D[borde]) - o._ang(P0)) / np.maximum(self.ap[borde], 1e-9)
        xs = self.x[borde]
        # 0.8.50 («Ojos y textura»): en los rabillos de un ojo rasgado la abertura tiende a 0; esas fracciones disparaban el ajuste y
        # una sonrisa giraba el párpado izquierdo 23 mm. El ajuste se hace donde la abertura es real y la fracción queda acotada
        real = self.ap[borde] > AP_MIN * self.ap[borde].max()
        if real.sum() < 4:
            real = np.ones(len(xs), bool)
        c = np.polyfit(xs[real], v[real], grado if real.sum() > grado + 3 else 1)
        return np.clip(np.polyval(c, np.clip(self.x, xs[real].min(), xs[real].max())), -FRAC_MAX, FRAC_MAX)

    def rigidizar(self, D):
        """las placas de los párpados y la cuenca se mueven SOLO girando sobre el centro del ojo, con el giro que la
        forma da a cada borde; lejos (fuera del alcance) la forma no cambia. Las cejas subían el borde estirándolo:
        se despegaba del globo y salía un escalón con la cuenca a la vista."""
        fs = self._frac_suave(D, self.o.borde_sup)
        fi = self._frac_suave(D, self.o.borde_inf)
        Dr = self.D(self.campo(fs, fi))
        # placas (hasta la distancia rígida) y cuenca: giro puro; fuera del alcance: la forma tal cual; entre medias
        # la DIFERENCIA se reparte armónica (con una mezcla por pesos, la sonrisa doblaba la piel bajo el ojo)
        P = self.P; r = self.o.r
        ds = np.where(np.isfinite(self.o.d_sup), self.o.d_sup, 1e3); di = np.where(np.isfinite(self.o.d_inf), self.o.d_inf, 1e3)
        placa = ((self.b > 0.5) & (ds <= P['rigido'] * P['alcance_sup'] * r)) |                 ((self.b <= 0.5) & (di <= P['rigido'] * P['alcance_inf'] * r)) | (self.ws * self.wi >= 1)
        placa &= self.dentro > 0.99
        q = P['reparto']                 # la transición, más larga que la del parpadeo: la sonrisa sube la mejilla 8 mm
        lejos = ((ds > q * P['alcance_sup'] * r) & (di > q * P['alcance_inf'] * r)) | (self.dentro < 0.01)
        reg = ~lejos | (ds < (q + 0.5) * P['alcance_sup'] * r) | (di < (q + 0.5) * P['alcance_inf'] * r)
        fij = np.nonzero(placa | (lejos & reg))[0]
        val = np.where(placa[fij, None], (Dr - D)[fij], 0.0)
        X = self.K.g.armonico(fij, val, region=reg, uniforme=True)
        X[~reg] = 0
        return D + X


def islas_cejas(cara, K, ojos):
    """máscara (vértices de la malla) de las islas sueltas encima de los ojos fuera de la zona: las cejas de Tripo."""
    from .. import pestanas_tripo as PT
    me = cara.data
    n = len(me.vertices)
    B = np.zeros(n * 3)
    (me.shape_keys.reference_key.data if me.shape_keys else me.vertices).foreach_get('co', B); B = B.reshape(-1, 3)
    lab = PT._islas(me)
    piel = set(np.unique(lab[K.zona]).tolist())
    sel = np.zeros(n, bool)
    for o in ojos.values():
        cerca = np.linalg.norm(B - o.c, axis=1) < 2.5 * o.r
        for k in np.unique(lab[cerca & (lab >= 0)]):
            if int(k) in piel:
                continue
            m = lab == k
            if m.sum() > 0.05 * n or (B[m] - o.c)[:, 2].mean() < 0.3 * o.r:
                continue                       # pelo/cuerpo, o no está encima del ojo
            sel |= m
    return sel, B


def pegar_islas(cara, K, ojos, claves=None):
    """islas sueltas encima de los ojos (cejas de Tripo: Martín, 140 vértices cada una) fuera de la zona de la cara:
    ninguna key las movía y, al subir la ceja o cerrar el ojo, la piel se las tragaba o la punta quedaba como una bola.
    En cada key FACS se mueven como la piel que tienen debajo (punto más cercano, baricéntricas)."""
    from .. import ojos as OJV
    me = cara.data
    if not me.shape_keys:
        return 0
    sel, B = islas_cejas(cara, K, ojos)
    zona = np.zeros(len(me.vertices), bool); zona[K.zona] = True
    if not sel.any():
        return 0
    fk = set(cara.get('facs_keys', []))
    claves = claves or [k.name for k in me.shape_keys.key_blocks[1:] if k.name in fk]
    OJV._pegar_islas(cara, B, zona, sel, claves)
    me.update()
    return int(sel.sum())
