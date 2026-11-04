# Generador (DISENO §5–7): parámetros + vida + tiempos + retoques -> acción <Rig>_EC_<clave>.
#
# La acción es un DELTA local sobre la pose base (se pone en una pista NLA COMBINE: cuaternión = base @ delta,
# Euler = base + delta; medido en Blender 5.2). Cómo se calcula:
#   1. con los parámetros de cada fotograma se construye, para cada hueso semántico, su rotación de MUNDO respecto a la
#      neutra (D), en el marco del cuerpo y en cadena FK (la cabeza va respecto al pecho, el brazo respecto al hombro...);
#   2. se resta lo que el rig real ya le transmite desde arriba (matriz T medida en perfil.medir: en Rigify la cabeza no
#      hereda del pecho y el cuello hereda la mitad): G = (prod T-ancestros)^-1 · D;
#   3. se pasa al espacio local del hueso: Q = N^-1 · G · N (N = orientación del hueso en la neutra).
# Así «torso_inclinar 10» deja el pecho 10° adelante en Rigify, Mixamo o un rig genérico, sin tablas por rig.
# Los eslabones (desfase) se escalonan moviendo las claves de cada hueso, y el mantener es periódico (ciclos enteros)
# para que el bucle no tenga costura.
#
#   generador.generar(rig, clave, intensidad=1.0, grupos=None, estilo=None) -> bpy.types.Action
#   generador.generar_todas(rig, estilo) -> dict
import bpy, math
from mathutils import Vector, Quaternion, Matrix
from . import util as U
from . import perfil as PF

FRACCION_TORSO = {'cadera': (0.15, 0.0, 0.0), 'columna': (0.5, 0.35, 0.3), 'pecho': (1.0, 1.0, 1.0)}
CIERRE_MAX = 210.0              # grados de curva total de un dedo de relajado a puño
REPARTO_DEDO = (0.40, 0.35, 0.25)
REPARTO_PULGAR = (0.30, 0.40, 0.30)
ESCALON = {'indice': 0.9, 'medio': 1.0, 'anular': 1.05, 'menique': 1.1}    # puño escalonado índice -> meñique
ABRIR_DEDO = {'indice': 12.0, 'medio': 2.0, 'anular': -8.0, 'menique': -16.0, 'pulgar': 20.0}
ESLABON = {
    'torso_primero': {'cadera': 0, 'columna': 1, 'pecho': 2, 'hombro': 3, 'cuello': 3, 'cabeza': 4, 'brazo': 4,
                      'antebrazo': 5, 'mano': 6, 'dedo': 7},
    'cabeza_primero': {'cabeza': 0, 'cuello': 1, 'pecho': 2, 'columna': 3, 'cadera': 4, 'hombro': 3, 'brazo': 4,
                       'antebrazo': 5, 'mano': 6, 'dedo': 7},
    'manos_primero': {'mano': 0, 'dedo': 1, 'antebrazo': 1, 'brazo': 2, 'hombro': 3, 'pecho': 4, 'columna': 5,
                      'cadera': 6, 'cuello': 5, 'cabeza': 6},
}


# ================================================================ modelo del rig (todo lo que no cambia por fotograma)
class Modelo:
    def __init__(self, rig, p):
        self.rig, self.p = rig, p
        med = p['medidas']
        self.F, self.U, self.L = (Vector(p['marco'][k]) for k in 'FUL')
        self.mapa, self.dedos, self.inter = p['mapa'], p.get('dedos', {}), p.get('intermedios', {})
        self.N = {h: Quaternion(v) for h, v in med['N'].items()}
        self.pos = {h: Vector(v) for h, v in med['pos'].items()}
        self.cola = {h: Vector(v) for h, v in med['cola'].items()}
        self.T = med['T']
        self.orden = [h for h in med['orden'] if h in rig.pose.bones]
        rank = {h: i for i, h in enumerate(self.orden)}
        self.anc = {b: sorted((a for a in self.orden if b in self.T.get(a, {})), key=rank.get) for b in self.orden}
        self.sem = PF.semantico_de(p)
        self.largo = med.get('largo_brazo', {})
        self.altura = med.get('altura', 1.7)
        self.lado = {}
        for l in U.LADOS:
            self.lado[l] = self._lado(l)

    def h(self, sem):
        h = self.mapa.get(sem)
        return h if h in self.N else None

    def dir(self, h):
        d = self.cola[h] - self.pos[h]
        return d.normalized() if d.length > 1e-9 else Vector((0, 0, -1))

    def _lado(self, l):
        s = U.SIGNO[l]
        out = self.L * s
        hb, ha, hm = self.h(f'brazo.{l}'), self.h(f'antebrazo.{l}'), self.h(f'mano.{l}')
        d = {'s': s, 'out': out}
        if hb:
            d['du'] = self.dir(hb)
        if ha:
            d['df'] = self.dir(ha)
        if hb and ha:
            c = d['du'].cross(d['df'])
            d['h'] = c.normalized() if c.length > math.sin(math.radians(3)) else d['df'].cross(self.F).normalized()
            d['phi_n'] = d['du'].angle(d['df'])
        if hm:
            d['dm'] = self.dir(hm)
            n_p = PF._palma(self.rig, self.p, l, med=self.p['medidas'])
            d['np'] = n_p if n_p is not None else (-out)
            t = d['np'].cross(d['dm'])
            t = t.normalized() if t.length > 1e-9 else self.F.copy()
            pul = self.dedos.get(f'pulgar.{l}')
            if pul and pul[0] in self.pos and t.dot(self.pos[pul[0]] - self.pos[hm]) < 0:
                t = -t
            d['t'] = t
        return d


def modelo(rig, p=None):
    p = p or PF.asegurar(rig)
    return Modelo(rig, p)


# ================================================================ parámetros -> rotaciones de mundo
def _torso(M, P, f, fe, fa):
    inc = P.get('torso_inclinar', 0.0) * f + P.get('torso_encorvar', 0.0) * fe - P.get('pecho_abrir', 0.0) * fa
    return U.rot(M.U, P.get('torso_girar', 0.0) * f) @ U.rot(-M.F, P.get('torso_lateral', 0.0) * f) @ U.rot(M.L, inc)


def _ik(M, P, l, d, S, Dp, Dh):
    """IK analítico de dos huesos hacia mano_objetivo (relativo al pecho); devuelve (D_brazo, rot_codo) completas."""
    v = P[f'mano_objetivo_{l}']
    a, b = M.largo.get(l, (0.3, 0.25))
    lon = a + b
    out, F, Uv = d['out'], M.F, M.U
    Pt = S + Dp @ ((out * v[0] + F * v[1] + Uv * v[2]) * lon)
    dv = Pt - S
    dist = min(max(dv.length, abs(a - b) * 1.02 + 1e-4), lon * 0.999)
    dn = dv.normalized() if dv.length > 1e-9 else (Dp @ -Uv)
    pole = Dp @ (-Uv - F * 0.3 + out * 0.3).normalized()
    cd = U.valor(P, 'codo_direccion', l)
    if abs(cd) > 1e-6:
        eje = dn if dn.cross(pole - dn * pole.dot(dn)).dot(out) >= 0 else -dn
        pole = U.rot(eje, cd) @ pole
    pp = pole - dn * pole.dot(dn)
    pp = pp.normalized() if pp.length > 1e-9 else (Dp @ -F)
    cb = max(-1.0, min(1.0, (a * a + dist * dist - b * b) / (2 * a * dist)))
    beta = math.acos(cb)
    E = S + (dn * math.cos(beta) + pp * math.sin(beta)) * a
    un = (E - S).normalized()
    fn = (S + dn * dist - E).normalized()
    hn = un.cross(fn)
    hn = hn.normalized() if hn.length > 1e-6 else un.cross(-pp).normalized()
    phi = un.angle(fn)
    du, h = d['du'], d['h']
    def marco(x, y):
        y = (y - x * y.dot(x)).normalized()
        return Matrix((x, y, x.cross(y))).transposed()
    Db = (marco(un, hn) @ marco(du, h).transposed()).to_quaternion()
    return Db, U.rot(h, math.degrees(phi - d['phi_n']))


def mundo(M, P):
    """rotaciones de mundo D (respecto a la neutra) de cada hueso real del perfil."""
    D = {}
    F, Uv, L = M.F, M.U, M.L
    for sem, fr in FRACCION_TORSO.items():
        h = M.h(sem)
        if h:
            D[h] = _torso(M, P, *fr)
    Dp = _torso(M, P, 1.0, 1.0, 1.0)
    DpH = _torso(M, P, 1.0, 1.0, 0.0)
    hi, hl, hg = P.get('cabeza_inclinar', 0.0), P.get('cabeza_lateral', 0.0), P.get('cabeza_girar', 0.0)
    ca = P.get('cuello_adelantar', 0.0)
    if M.h('cuello'):
        D[M.h('cuello')] = DpH @ U.rot(Uv, 0.4 * hg) @ U.rot(-F, 0.4 * hl) @ U.rot(L, 0.4 * hi + ca)
    if M.h('cabeza'):
        D[M.h('cabeza')] = DpH @ U.rot(Uv, hg) @ U.rot(-F, hl) @ U.rot(L, hi)
    for h, (a, b, t) in M.inter.items():
        ha, hb = M.h(a), M.h(b)
        if h in M.N and ha in D and hb in D:
            D[h] = D[ha] @ U.qpow(D[ha].inverted() @ D[hb], t)
    posD = {}

    def posicion(h):
        """cabeza del hueso con la pose: sigue al último ancestro que lo arrastra entero."""
        if h in posD:
            return posD[h]
        padre = next((a for a in reversed(M.anc.get(h, [])) if M.T[a].get(h, 0) >= 0.9 and a in D), None)
        if padre is None:
            r = M.pos[h].copy()
        else:
            r = posicion(padre) + D[padre] @ (M.pos[h] - M.pos[padre])
        posD[h] = r
        return r

    abr = P.get('pecho_abrir', 0.0)
    for l, d in M.lado.items():
        s = d['s']
        hh, hb, ha, hm = M.h(f'hombro.{l}'), M.h(f'brazo.{l}'), M.h(f'antebrazo.{l}'), M.h(f'mano.{l}')
        Dh = Dp @ U.rot(F * s, U.valor(P, 'hombro_subir', l)) @ \
            U.rot(-Uv * s, U.valor(P, 'hombro_adelante', l) - 0.4 * abr)
        if hh:
            D[hh] = Dh
        if not (hb and ha):
            continue
        du, df, hinge = d['du'], d['df'], d['h']
        pron = U.rot(df * s, U.valor(P, 'antebrazo_girar', l))
        if f'mano_objetivo_{l}' in P and P.get('_ik', 0.0) != 0.0:
            amp = P.get('_ik', 1.0)
            D[hb] = Dh  # provisional, para la posición del hombro
            S = posicion(hb)
            Dbf, Rc = _ik(M, P, l, d, S, Dp, Dh)
            Db = Dh @ U.qpow(Dh.inverted() @ Dbf, amp) @ U.rot(du * s, U.valor(P, 'brazo_girar', l))
            Da = Db @ U.qpow(Rc, amp) @ pron
        else:
            ab = du.cross(d['out'])
            ad = du.cross(F)
            Db = Dh @ U.rot(ad, U.valor(P, 'brazo_adelantar', l)) @ U.rot(ab, U.valor(P, 'brazo_abrir', l)) @ \
                U.rot(du * s, U.valor(P, 'brazo_girar', l))
            Da = Db @ U.rot(hinge, U.valor(P, 'codo', l)) @ pron
        D[hb], D[ha] = Db, Da
        if not hm:
            continue
        dm, n_p, t = d['dm'], d['np'], d['t']
        Dm = Da @ U.rot(dm.cross(n_p), U.valor(P, 'muneca_doblar', l)) @ U.rot(dm.cross(t), U.valor(P, 'muneca_desviar', l))
        D[hm] = Dm
        cerrar, abrir, pulgar = (U.valor(P, k, l) for k in ('dedos_cerrar', 'dedos_abrir', 'pulgar_cerrar'))
        for dedo in PF.DEDOS:
            lst = [x for x in M.dedos.get(f'{dedo}.{l}', []) if x in M.N]
            if not lst:
                continue
            d1 = M.dir(lst[0])
            eje = d1.cross(n_p)
            if dedo == 'pulgar':
                total, rep = pulgar * 100.0 - abrir * 10.0, REPARTO_PULGAR
            else:
                total, rep = cerrar * CIERRE_MAX * ESCALON[dedo] - abrir * 25.0, REPARTO_DEDO
            Rsp = U.rot(d1.cross(t), abrir * ABRIR_DEDO[dedo])
            acum = 0.0
            for i, h in enumerate(lst):
                acum += total * rep[min(i, len(rep) - 1)]
                D[h] = Dm @ U.rot(eje, acum) @ Rsp
    return D


def locales(M, D, retoques=None):
    """de rotaciones de mundo a deltas locales, restando lo que el rig ya transmite (ver cabecera)."""
    G, Q = {}, {}
    for b in M.orden:
        if b not in D:
            continue
        I = Quaternion()
        for a in M.anc[b]:
            if a in G:
                I = I @ U.qpow(G[a], M.T[a][b])
        G[b] = I.inverted() @ D[b]
        Q[b] = U.conj(G[b], M.N[b])
    if retoques:
        for b, (X, w) in retoques.items():
            if abs(w) > 1e-6:
                Q[b] = Q.get(b, Quaternion()) @ U.qpow(X, w)
    return Q


# ================================================================ tiempos y envolventes
def curva(nombre, u):
    u = min(1.0, max(0.0, u))
    if nombre == 'rapida':
        return 1 - (1 - u) ** 3
    if nombre == 'lenta':
        return u * u * u * (u * (u * 6 - 15) + 10)
    if nombre == 'elastica':
        c1 = 1.2; c3 = c1 + 1
        return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2
    return u * u * (3 - 2 * u)


class Tiempos:
    """tiempos en fotogramas de la escena (reescalados desde 24 fps) y marcadores."""
    def __init__(self, t, links, neutra=False):
        k = U.escala_tiempo()
        g = lambda n: t.get(n, U.TIEMPOS_DEF[n])
        self.E = 0 if neutra else max(0, round(g('entrada') * k))
        self.A = 0 if neutra else max(0, round(g('asentar') * k))
        self.M = max(2, round(g('mantener') * k))
        self.S = 0 if neutra else max(0, round(g('salida') * k))
        self.ant = 0.0 if neutra else float(g('anticipacion'))
        self.sob = 0.0 if neutra else float(g('sobrepaso'))
        self.ce, self.cs = g('curva_entrada'), g('curva_salida')
        self.des = 0.0 if neutra else float(g('desfase')) * k
        self.off = max(links.values(), default=0) * self.des
        self.offi = math.ceil(self.off - 1e-6)
        self.h0 = self.E + self.A + self.offi            # inicio del mantener (sin desplazar)
        self.h1 = self.h0 + self.M
        self.T = self.h1 + self.S                         # fin sin desplazar
        self.marcadores = {'entrada': 1, 'pico': 1 + self.E, 'mantener': 1 + self.h0, 'salida': 1 + self.h1,
                           'fin': 1 + self.T + self.offi}

    def fase(self, tau):
        if tau < self.E:
            return 'entrada', tau / max(self.E, 1e-9)
        if tau < self.E + self.A:
            return 'asentar', (tau - self.E) / max(self.A, 1e-9)
        if tau <= self.h1:
            return 'mantener', 0.0
        if tau < self.T:
            return 'salida', (tau - self.h1) / max(self.S, 1e-9)
        return 'fin', 1.0

    def amp(self, tau):
        """amplitud limpia 0–1 (para la vida y los retoques 'todas')."""
        f, u = self.fase(tau)
        if f == 'entrada':
            return min(1.0, max(0.0, curva(self.ce, u)))
        if f in ('asentar', 'mantener'):
            return 1.0
        if f == 'salida':
            return 1.0 - curva(self.cs, u)
        return 0.0

    def peso_retoque(self, tau, fase):
        f, u = self.fase(tau)
        if fase == 'pico':
            if f == 'entrada':
                return curva(self.ce, u)
            if f == 'asentar':
                return 1.0 - U.ss(u)
            return 1.0 if (f == 'mantener' and self.A == 0 and tau <= self.E) else 0.0
        if fase == 'mantener':
            if f == 'entrada':
                return 0.0 if self.A > 0 else curva(self.ce, u)
            if f == 'asentar':
                return U.ss(u)
        return self.amp(tau)


def _escalar(P, k):
    return {n: (v * k if not isinstance(v, (list, tuple)) else list(v)) for n, v in P.items()}


def _mezcla(A, B, wa, wb):
    out = {}
    for n in set(A) | set(B):
        a, b = A.get(n, 0.0), B.get(n, 0.0)
        if isinstance(a, (list, tuple)) or isinstance(b, (list, tuple)):
            continue
        out[n] = a * wa + b * wb
    return out


def _vectores(Pv, Pk, w):
    """mano_objetivo: del vector del pico al del mantener (lineal, w = peso del pico)."""
    out = {}
    for n in set(Pv) | set(Pk):
        if not n.startswith('mano_objetivo'):
            continue
        a, b = Pv.get(n), Pk.get(n)
        if a is None:
            out[n] = list(b)
        elif b is None:
            out[n] = list(a)
        else:
            w2 = min(1.0, max(0.0, w))
            out[n] = [x * (1 - w2) + y * w2 for x, y in zip(a, b)]
    return out


def params_en(T, P, Pk, tau):
    """parámetros del fotograma tau (sin vida)."""
    f, u = T.fase(tau)
    if f == 'entrada':
        if T.ant > 0:
            if u < 0.3:
                x = -T.ant * math.sin(math.pi / 2 * u / 0.3) ** 2
                R = _escalar(P, x)
            else:
                c = curva(T.ce, (u - 0.3) / 0.7)
                R = _mezcla(P, Pk, -T.ant * (1 - c), c)
        else:
            R = _escalar(Pk, curva(T.ce, u))
        R.update(_vectores({}, Pk, 1.0) or _vectores(P, {}, 0.0))
        return R
    if f == 'asentar':
        if T.sob > 0:
            g = (1 - u) ** 2 * math.cos(2.2 * math.pi * u)
        else:
            g = 1 - U.ss(u)
        R = _mezcla(P, Pk, 1 - g, g)
        R.update(_vectores(P, Pk, g))
        return R
    if f == 'mantener':
        R = _escalar(P, 1.0)
        return R
    if f == 'salida':
        R = _escalar(P, 1.0 - curva(T.cs, u))
        R.update(_vectores(P, {}, 0.0))
        return R
    return {}


def _sumar(R, n, inc, lado=None):
    if lado:
        R[f'{n}_{lado}'] = U.valor(R, n, lado) + inc
    else:
        R[n] = R.get(n, 0.0) + inc
        for l in U.LADOS:
            if f'{n}_{l}' in R:
                R[f'{n}_{l}'] += inc


def _ciclos(M, periodo_s):
    return max(1, round(M / max(periodo_s * U.fps(), 1e-6)))


def gesto_repetido(datos):
    return datos.get('gesto_repetido') or datos.get('vida', {}).get('gesto_repetido')


def vida_en(T, vida, rep, tau, k_global, k_grupos, env):
    """incrementos de parámetros de la vida (periódicos en el mantener: ciclos enteros, sin costura)."""
    R = {}
    if env <= 1e-9:
        return R
    phi = tau - T.h0
    Mf = T.M
    w = lambda n: 2 * math.pi * n / Mf
    g = lambda n: vida.get(n, U.VIDA_DEF.get(n, 0.0))
    k = env * k_global
    r = g('respiracion')
    if r:
        b = 0.5 - 0.5 * math.cos(w(_ciclos(Mf, g('respiracion_periodo'))) * phi)
        _sumar(R, 'pecho_abrir', r * b * k)
        _sumar(R, 'hombro_subir', 0.45 * r * b * k)
    ba = g('balanceo')
    if ba:
        om = w(_ciclos(Mf, g('balanceo_periodo')))
        _sumar(R, 'torso_lateral', ba * math.sin(om * phi) * k)
        _sumar(R, 'cabeza_lateral', -0.6 * ba * math.sin(om * phi) * k)
        _sumar(R, 'torso_girar', 0.35 * ba * math.sin(om * phi + 1.3) * k)
    te = g('temblor')
    if te:
        n1 = max(1, round(g('temblor_frecuencia') * Mf / U.fps()))
        ns = (n1, round(n1 * 1.37) + 1, max(1, round(n1 * 0.71)) + 1)
        tabla = (('hombro_subir', 0.6, 'L'), ('hombro_subir', 0.6, 'R'), ('cabeza_girar', 0.5, None),
                 ('cabeza_inclinar', 0.4, None), ('muneca_doblar', 1.5, 'L'), ('muneca_doblar', 1.5, 'R'),
                 ('codo', 1.0, 'L'), ('codo', 1.0, 'R'), ('torso_girar', 0.2, None))
        for i, (n, a, lado) in enumerate(tabla):
            ruido = (math.sin(w(ns[0]) * phi + 1.7 * i) + 0.6 * math.sin(w(ns[1]) * phi + 2.9 * i + 0.5)
                     + 0.4 * math.sin(w(ns[2]) * phi + 4.1 * i + 1.1)) / 2.0
            _sumar(R, n, te * a * ruido * k, lado)
    rb = g('rebote')
    if rb:
        b = 0.5 - 0.5 * math.cos(w(_ciclos(Mf, g('rebote_periodo'))) * phi)
        _sumar(R, 'hombro_subir', rb * b * k)
        _sumar(R, 'torso_inclinar', 0.3 * rb * b * k)
        _sumar(R, 'cabeza_inclinar', -0.2 * rb * b * k)
    if rep and rep.get('params'):
        n = _ciclos(Mf, float(rep.get('periodo', 1.0)))
        fr = (n * phi / Mf) % 1.0
        if rep.get('forma') == 'golpe':
            sh = U.ss(fr / 0.1) if fr < 0.1 else (1 - U.ss((fr - 0.1) / 0.35) if fr < 0.45 else 0.0)
        else:
            sh = 0.5 - 0.5 * math.cos(2 * math.pi * fr)
        for pn, v in rep['params'].items():
            if isinstance(v, (list, tuple)):
                continue
            base = pn[:-2] if pn[-2:] in ('_L', '_R') else pn
            lado = pn[-1] if pn[-2:] in ('_L', '_R') else None
            kg = k_grupos.get(U.grupo_de(base) or '', 1.0)
            _sumar(R, base, v * sh * k * kg, lado)
    return R


# ================================================================ datos de la expresión
def datos_de(rig, clave, estilo=None, copiar=True):
    """(clave_real, datos): del rig si los tiene; si no, de la biblioteca (y se copian al rig para editarlos)."""
    from . import biblioteca as BI
    estilo = estilo or U.props(rig).estilo
    cands = [clave] if (clave == 'neutra' or U.estilo_de(clave)) else [f'{clave}_{estilo}', clave]
    for c in cands:
        d = U.leer_expr(rig, c)
        if d is not None:
            return c, d
    lib = BI.cargar()['expresiones']
    for c in cands:
        if c in lib:
            d = BI.copia_limpia(lib[c])
            if copiar:
                U.escribir_expr(rig, c, d)
            return c, d
    raise RuntimeError(f'No hay expresión «{clave}» en el rig ni en la biblioteca')


def _preparar(datos, intensidad, grupos):
    kg = {g: 1.0 for g in U.GRUPOS}
    kg.update(datos.get('grupos') or {})
    if grupos:
        for g, v in grupos.items():
            kg[g] = kg.get(g, 1.0) * v
    kt = float(datos.get('intensidad', 1.0)) * float(intensidad)

    def escala(src):
        out = {}
        for n, v in (src or {}).items():
            if isinstance(v, (list, tuple)):
                out[n] = list(v); continue
            base = n[:-2] if n[-2:] in ('_L', '_R') else n
            if base in U.SIN_ESCALA:
                out[n] = float(v); continue
            out[n] = float(v) * kt * kg.get(U.grupo_de(base) or '', 1.0)
        return out
    P = escala(datos.get('params'))
    Pk = dict(P)
    Pk.update(escala(datos.get('pico')))
    hay_ik = any(n.startswith('mano_objetivo') for n in list(P) + list(Pk))
    if hay_ik:
        P['_ik'] = kt * kg.get('brazos', 1.0)
        Pk['_ik'] = P['_ik']
    return P, Pk, kt, kg


def _links(M, orden):
    tabla = ESLABON.get(orden, ESLABON['torso_primero'])
    out = {}
    for h in M.orden:
        s = M.sem.get(h, '')
        base = s.split('#')[0].split('~')[0].split('.')[0]
        if '#' in s:
            base = 'dedo'
        if '~' in s:
            base = 'columna'
        if base in tabla:
            out[h] = tabla[base]
    return out


def _retoques_locales(M, datos):
    """retoques guardados (marco del cuerpo, semánticos) -> {hueso: (X_local, fase, dloc_local)}."""
    from . import retoques as RT
    return RT.a_locales(M, datos.get('retoques') or {})


# ================================================================ generar
def generar(rig, clave, intensidad=1.0, grupos=None, estilo=None, ligero=False):
    """crea o rehace la acción <Rig>_EC_<clave> (delta para COMBINE; la neutra es absoluta)."""
    p = PF.asegurar(rig)
    M = Modelo(rig, p)
    clave, datos = datos_de(rig, clave, estilo)
    it = U.item_expr(rig, clave)
    nombre = U.nombre_accion(rig, clave)
    a = bpy.data.actions.get(nombre)
    if it is not None and it.bloqueada and a is not None:
        return a
    neutra = clave == 'neutra'
    links = {} if neutra else _links(M, datos.get('tiempos', {}).get('orden', 'torso_primero'))
    T = Tiempos(datos.get('tiempos', {}), links, neutra=neutra)
    P, Pk, kt, kg = _preparar(datos, intensidad, grupos)
    vida, rep = datos.get('vida', {}), gesto_repetido(datos)
    ret = {} if neutra else _retoques_locales(M, datos)
    paso = 2 if ligero else 1
    taus = list(range(0, T.T + 1, paso))
    if taus[-1] != T.T:
        taus.append(T.T)
    if neutra:
        taus = list(range(0, T.M + 1, paso))
        if taus[-1] != T.M:
            taus.append(T.M)
    series = {h: [] for h in M.orden}
    locs = {h: [] for h in ret}
    for tau in taus:
        env = 1.0 if neutra else T.amp(tau)
        R = {} if neutra else params_en(T, P, Pk, tau)
        for n, v in vida_en(T, vida, rep, tau, kt if not neutra else float(intensidad), kg, env).items():
            _sumar(R, n[:-2] if n[-2:] in ('_L', '_R') else n, v, n[-1] if n[-2:] in ('_L', '_R') else None)
        if '_ik' not in R and '_ik' in P:
            R['_ik'] = 0.0
        D = mundo(M, R)
        rr = {h: (x[0], T.peso_retoque(tau, x[1])) for h, x in ret.items()}
        Q = locales(M, D, rr)
        for h in M.orden:
            series[h].append(Q.get(h, Quaternion()))
        for h, x in ret.items():
            locs[h].append(x[2] * T.peso_retoque(tau, x[1]))
    if a is None:
        a = bpy.data.actions.new(nombre)
    a.use_fake_user = True
    cb, slot = U.channelbag(a, rig, limpiar=True)
    while a.pose_markers:
        a.pose_markers.remove(a.pose_markers[0])
    fijos = set(T.marcadores.values())
    nclaves = 0
    for h, serie in series.items():
        pb = rig.pose.bones.get(h)
        if pb is None:
            continue
        o = 0.0 if neutra else links.get(h, 0) * T.des
        frames = [1 + t + o for t in taus]
        nq = PF.neutra_local(p, h)
        if not neutra and h not in ret and all(qq.angle < 1e-5 for qq in serie):
            continue
        ruta = U.ruta_rot(pb)
        if ruta is None:
            continue
        if not neutra and o > 0:
            frames = [1.0] + frames
            serie = [Quaternion()] + serie
        if pb.rotation_mode == 'QUATERNION':
            prev = None
            vals = [[], [], [], []]
            for qq in serie:
                qa = (nq @ qq) if neutra else qq.copy()
                if prev is not None and prev.dot(qa) < 0:
                    qa.negate()
                prev = qa
                for i in range(4):
                    vals[i].append(qa[i])
            canales = vals
        else:
            ne = nq.to_euler(pb.rotation_mode)
            prev = ne.copy()
            vals = [[], [], []]
            for qq in serie:
                e = (nq @ qq).to_euler(pb.rotation_mode, prev)
                prev = e
                for i in range(3):
                    vals[i].append(e[i] if neutra else e[i] - ne[i])
            canales = vals
        for i, v in enumerate(canales):
            fr, vv = (frames, v) if ligero else U.reducir(frames, v, fijos=fijos)
            U.poner_claves(cb, ruta, i, fr, vv, grupo=h)
            nclaves += len(fr)
    for h, serie in locs.items():
        pb = rig.pose.bones.get(h)
        if pb is None or all(v.length < 1e-7 for v in serie):
            continue
        o = links.get(h, 0) * T.des
        frames = [1 + t + o for t in taus]
        for i in range(3):
            U.poner_claves(cb, f'pose.bones["{h}"].location', i, frames, [v[i] for v in serie], grupo=h)
    if neutra:
        for n, f in (('entrada', 1), ('mantener', 1), ('salida', 1 + T.M), ('fin', 1 + T.M)):
            a.pose_markers.new(n).frame = f
    else:
        for n, f in T.marcadores.items():
            a.pose_markers.new(n).frame = int(f)
    a['ecorp_clave'] = clave
    a['ecorp_rig'] = rig.name
    a['ecorp_tipo'] = 'absoluta' if neutra else 'delta'
    a['ecorp_claves'] = nclaves
    if it is None:
        it = U.item_expr(rig, clave, crear=True)
    it.accion = a.name
    return a


def generar_todas(rig, estilo=None, claves=None):
    """la neutra y todas las expresiones del estilo (biblioteca + las propias del rig)."""
    from . import biblioteca as BI
    estilo = estilo or U.props(rig).estilo
    if estilo in ('M', 'F'):
        U.props(rig).estilo = estilo
    if claves is None:
        lib = BI.cargar()['expresiones']
        claves = [c for c in lib if U.estilo_de(c) == estilo]
        claves += [it.name for it in U.props(rig).expresiones if U.estilo_de(it.name) == estilo and it.name not in claves]
    out = {'neutra': generar(rig, 'neutra').name, 'acciones': {}, 'errores': {}}
    for c in claves:
        try:
            out['acciones'][c] = generar(rig, c).name
        except Exception as e:
            import traceback; traceback.print_exc()
            out['errores'][c] = str(e)
    out['n'] = len(out['acciones'])
    return out
