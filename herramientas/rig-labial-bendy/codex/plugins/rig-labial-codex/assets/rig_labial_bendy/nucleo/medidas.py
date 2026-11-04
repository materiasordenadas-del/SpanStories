# Medidas de la boca para el rig (equivalen a medidas_labios.py / medidas_boca_interior.py de Vale, pero
# sin índices de vértices: perfiles de rayos guiados por los marcadores).
#  JT / JB: 4 juntas de cada cadena (centro, .001, .002, comisura) por la línea MEDIA de cada labio
#  CR / ST / SB: pliegue entre labios y bordes de contacto en la X de cada columna de huesos
#  MID_T / MID_B: líneas medias densas (para los pesos)
import numpy as np
from mathutils import Vector
from . import util, deteccion as DT, eje_boca


def _resample(pts, n):
    L = [0.0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + (b - a).length)
    out = []
    for k in range(n + 1):
        t = L[-1] * k / n
        for i in range(len(pts) - 1):
            if L[i + 1] >= t - 1e-12:
                f = (t - L[i]) / max(L[i + 1] - L[i], 1e-12)
                out.append(pts[i].lerp(pts[i + 1], f)); break
    return out


def cara_mask(cara, M):
    me = cara.data
    isl = util.islas(me)
    m = isl == isl[M.cfg['seed']]
    if 'rlb_cuenca' in me.attributes:        # la bolsa del ojo (malla.cuenca) no es piel: ni se recorta ni se pesa
        c = np.zeros(len(me.vertices), int); me.attributes['rlb_cuenca'].data.foreach_get('value', c)
        m &= c == 0
    return m, isl


def medir_labios(cara, M):
    me = cara.data
    P = util.coords(me)
    face, isl = cara_mask(cara, M)
    bvh = util.bvh_de(P, me, face)
    y0 = P[face, 1].min() - 1.0
    S, xc = M.s, M.hw
    corner = M.comisura.copy()
    c0 = DT._columna(bvh, y0, M.cx + 0.0005 * S, (M.labio_sup.z + M.labio_inf.z) / 2, S, 0.003 * S)
    if c0 is None:
        raise RuntimeError('No encuentro la línea de la boca entre los marcadores de los labios')
    f_sup = (M.labio_sup.z - c0['z']) / max(c0['zbu'] - c0['z'], 1e-6)
    f_inf = (M.labio_inf.z - c0['z']) / min(c0['zbl'] - c0['z'], -1e-6)
    cols = []
    zc = c0['z']
    for u in np.linspace(0.0005 * S, 0.97 * xc, 24):
        x = M.cx + u
        c = DT._columna(bvh, y0, x, zc, S, 0.003 * S)
        if c is None:
            break
        cols.append((x, c)); zc = c['z']
    if len(cols) < 4:
        raise RuntimeError('La línea de la boca se pierde muy pronto: revisa los marcadores de las comisuras')

    def linea(f, clave):
        pts = []
        frente = 'bu' if clave == 'zbu' else 'bl'
        for x, c in cols:
            z = c['z'] + f * (c[clave] - c['z'])
            u = x - M.cx
            w = float(util.ss(0.65 * xc, 0.97 * xc, u))
            z = (1 - w) * z + w * (z + (corner.z - z) * (x / xc))
            h = DT._hit(bvh, y0, x, z)
            # un rayo que se cuela por un hueco de la malla (cerca de la comisura) no vale
            if h is not None and h.y < c[frente] + 0.003 * S:
                pts.append(h)
        pts[0].x = M.cx
        pts.append(corner.copy())
        return pts
    mid = {'sup': linea(f_sup, 'zbu'), 'inf': linea(f_inf, 'zbl')}
    J = {lip: _resample(mid[lip], 3) for lip in mid}
    xs = np.array([x for x, _ in cols])
    def interp(clave, x):
        a = np.array([[c[clave].y, c[clave].z] for _, c in cols])
        return Vector((x, float(np.interp(x, xs, a[:, 0])), float(np.interp(x, xs, a[:, 1]))))
    CR, ST, SB = [], [], []
    for k in range(4):
        x = (J['sup'][k].x + J['inf'][k].x) / 2
        st, sb = interp('ST', x), interp('SB', x)
        ST.append(st); SB.append(sb); CR.append((st + sb) / 2)
    CR[3] = corner.copy(); ST[3] = corner.copy(); SB[3] = corner.copy()
    for k in (0,):
        ST[k].x = SB[k].x = CR[k].x = M.cx
    rendija = {'x': (xs - M.cx).tolist() + [xc], 'z': [c['z'] for _, c in cols] + [corner.z],
               'y': [((c['ST'].y + c['SB'].y) / 2) for _, c in cols] + [corner.y],
               'ST': [c['ST'] for _, c in cols] + [corner.copy()], 'SB': [c['SB'] for _, c in cols] + [corner.copy()]}
    return {'JT': J['sup'], 'JB': J['inf'], 'CORNER': corner, 'CR': CR, 'ST': ST, 'SB': SB,
            'MID_T': _resample(mid['sup'], 40), 'MID_B': _resample(mid['inf'], 40), 'rendija': rendija,
            'abierta': bool(c0['depth'] > 0.004 * S)}


def islas_boca(cara, M, isl, face):
    """islas sueltas que caben en la caja de la boca (dientes del modelo, lengua del modelo…)."""
    P = util.coords(cara.data)
    hw, mc = M.hw, M.mc
    out = []
    for k in np.unique(isl):
        if k == isl[M.cfg['seed']]: continue
        q = P[isl == k]
        mn, mx = q.min(0), q.max(0)
        # 0.6.9 (Carlitos, sonrisa con dientes): los dientes de Tripo llegaban a +1,5 hw y la cavidad a −1,5 hw y
        # 3,6 hw de fondo; se quedaban (inmóviles) y al abrir la mandíbula asomaban por la barba. Caja más amplia,
        # pero el centro de la pieza detrás de las comisuras (bigote y barba quedan delante)
        if (abs(mn[0] - M.cx) < 2.5 * hw and abs(mx[0] - M.cx) < 2.5 * hw and mn[2] > mc.z - 2.0 * hw and mx[2] < mc.z + 2.0 * hw
                and mn[1] > mc.y - 1.2 * hw and mx[1] < mc.y + 4.5 * hw and q[:, 1].mean() > mc.y):
            out.append(int(k))
    # 0.6.9: más las islas que el inventario de la detección nombró dientes / lengua / cavidad
    for i in M.cfg.get('islas', []):
        if i['nombre'] in ('dientes', 'lengua', 'cavidad') and i['semilla'] < len(isl):
            k = int(isl[i['semilla']])
            if k != isl[M.cfg['seed']] and k not in out:
                out.append(k)
    return out


def medir_interior(cara, M, MED):
    """forro (bolsa de la boca del modelo, desde el borde de contacto hacia dentro), contacto, dientes."""
    me = cara.data
    P = util.coords(me)
    face, isl = cara_mask(cara, M)
    nb = util.vecinos(me)
    hw = M.hw
    R = MED['rendija']
    idx = np.where(face)[0]
    kd = util.kd_de(P, idx)
    contacto = set()
    for lst in (R['ST'], R['SB']):
        pts = []
        for a, b in zip(lst, lst[1:]):
            for t in np.linspace(0, 1, 4, endpoint=False):
                pts.append(a.lerp(b, t))
        pts.append(lst[-1])
        for p in pts:
            for q in (p, Vector((eje_boca.reflejar(p.x, M.cx), p.y, p.z))):
                co, i, d = kd.find(q)
                if d < 0.15 * hw: contacto.add(int(i))
    xs = np.array(R['x']); ys = np.array(R['y'])
    ax = np.abs(eje_boca.radial(P[:, 0], M.cx))
    yfront = np.interp(ax, xs, ys) - 0.15 * hw
    yfront = np.where(ax > xs[-1], yfront + (ax - xs[-1]) * 6.0, yfront)
    cand = face & (P[:, 1] > yfront) & (np.linalg.norm(P - np.array(M.mc), axis=1) < 2.6 * hw)
    # el forro queda tapado por los labios visto de frente; la piel del mentón (aunque esté más atrás que
    # el frente del labio, como en Malcon) se ve -> no es forro
    bvh = util.bvh_de(P, me, face)
    for i in np.where(cand)[0]:
        o = Vector(P[i]) + Vector((0, -0.02 * hw, 0))
        if bvh.ray_cast(o, Vector((0, -1, 0)))[0] is None:
            cand[i] = False
    seen = set(i for i in contacto if cand[i]); st = list(seen)
    while st:
        i = st.pop()
        for j in nb[i]:
            if j not in seen and cand[j]:
                seen.add(j); st.append(j)
    dientes = islas_boca(cara, M, isl, face)
    return {'forro': sorted(seen), 'contacto': sorted(contacto), 'islas_boca': dientes,
            'dientes_v': sorted(int(i) for i in np.where(np.isin(isl, dientes))[0])}
