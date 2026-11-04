"""Vida de fondo: parpadeo, mirada, ceja y cabeza que nunca están del todo quietas.

Todo es determinista (misma ``semilla`` -> misma interpretación) y sale como
curvas por canal ``[(segundos, valor)]``, más una curva de cabeza en grados.
Ningún valor depende de huesos: sirve para cualquier personaje del estándar.
"""
import math
import random

CAMARA = (0.0, 0.0)             # mirada «a cámara»


def _lineal(curva, t):
    if not curva:
        return 0.0
    if t <= curva[0][0]:
        return curva[0][1]
    if t >= curva[-1][0]:
        return curva[-1][1]
    for (t0, v0), (t1, v1) in zip(curva, curva[1:]):
        if t0 <= t <= t1:
            return v0 if t1 == t0 else v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    return curva[-1][1]


lineal = _lineal


def _unir_max(a, b):
    tiempos = sorted({t for t, _ in a} | {t for t, _ in b})
    return [(t, max(_lineal(a, t), _lineal(b, t))) for t in tiempos]


def _parpadeos(rnd, duracion, pausas_fuertes, saltos, ritmo):
    """Instantes de parpadeo. ``ritmo`` > 1 parpadea más."""
    ts = []
    t = 0.7 + rnd.random() * 1.2
    while t < duracion:
        ts.append(t)
        if rnd.random() < 0.12:
            ts.append(t + 0.28)
        t += max(1.3, rnd.gauss(3.8 / ritmo, 1.2 / ritmo))
    for p in pausas_fuertes:
        if rnd.random() < 0.6:
            ts.append(p + 0.05)
    for s in saltos:
        if rnd.random() < 0.5:
            ts.append(s)
    ts.sort()
    out = []
    for t in ts:
        if not out or t - out[-1] >= 0.45 or abs(t - out[-1] - 0.28) < 0.02:
            if t < duracion:
                out.append(t)
    return out


def _curva_parpadeo(ts, asim):
    c = []
    for t in ts:
        cierre = 0.06 + asim
        c += [(t, 0.0), (t + cierre, 1.0), (t + cierre + 0.035, 1.0), (t + cierre + 0.035 + 0.13, 0.0)]
    # quitar solapes: si dos parpadeos se pisan, se queda el máximo
    c.sort()
    limpio = []
    for t, v in c:
        if limpio and t <= limpio[-1][0]:
            t = limpio[-1][0] + 1e-3
        limpio.append((t, v))
    return limpio


def _mirada(rnd, duracion, mirar_camara):
    """-> ([(t, x, y)], saltos). x + = izquierda del personaje, y + = arriba."""
    pts = [(0.0, 0.0, 0.0)]
    t = 0.0
    saltos = []
    actual = CAMARA
    while t < duracion:
        fija = rnd.uniform(0.9, 3.2)
        t_sac = t + fija
        # microsacadas mientras dura la fijación
        m = t + rnd.uniform(0.3, 0.8)
        while m < t_sac - 0.3 and m < duracion:
            j = (actual[0] + rnd.uniform(-0.03, 0.03), actual[1] + rnd.uniform(-0.025, 0.025))
            pts.append((m, actual[0], actual[1]))
            pts.append((m + 0.04, j[0], j[1]))
            actual = j
            m += rnd.uniform(0.4, 0.9)
        if rnd.random() < mirar_camara:
            nuevo = CAMARA
        else:
            nuevo = (rnd.uniform(-0.6, 0.6), rnd.uniform(-0.3, 0.35))
        cambio = abs(nuevo[0] - actual[0]) + abs(nuevo[1] - actual[1])
        if cambio < 0.12:
            t = t_sac
            continue
        sac = 0.05 + 0.07 * min(1.0, cambio)
        pts.append((t_sac, actual[0], actual[1]))
        pts.append((t_sac + sac, nuevo[0], nuevo[1]))
        if abs(nuevo[0] - actual[0]) > 0.45:
            saltos.append(t_sac)
        actual = nuevo
        t = t_sac + sac
    pts.append((max(duracion, pts[-1][0] + 0.01), actual[0], actual[1]))
    return pts, saltos


def generar(duracion, semilla=1, pausas_fuertes=(), enfasis=(), parpadeo=1.0,
            mirada=1.0, mirar_camara=0.6, cabeza_grados=0.7, ceja=1.0, cabeza_sigue_mirada=0.12):
    rnd = random.Random(semilla)
    curvas = {}

    # mirada
    pts, saltos = _mirada(rnd, duracion, mirar_camara)
    gx = [(t, x * mirada) for t, x, _y in pts]
    gy = [(t, y * mirada) for t, _x, y in pts]
    pos_x = [(t, max(0.0, v)) for t, v in gx]
    neg_x = [(t, max(0.0, -v)) for t, v in gx]
    pos_y = [(t, max(0.0, v)) for t, v in gy]
    neg_y = [(t, max(0.0, -v)) for t, v in gy]
    curvas["eyeLookOutLeft"] = pos_x;  curvas["eyeLookInRight"] = pos_x
    curvas["eyeLookInLeft"] = neg_x;   curvas["eyeLookOutRight"] = neg_x
    curvas["eyeLookUpLeft"] = pos_y;   curvas["eyeLookUpRight"] = pos_y
    curvas["eyeLookDownLeft"] = neg_y; curvas["eyeLookDownRight"] = neg_y

    # parpadeo (con los párpados acompañando a la mirada hacia abajo)
    ts = _parpadeos(rnd, duracion, pausas_fuertes, saltos, parpadeo)
    seguir = [(t, 0.30 * v) for t, v in neg_y]
    for lado, asim in (("Left", 0.0), ("Right", rnd.choice((0.0, 0.0, 0.01)))):
        curva = _curva_parpadeo(ts, asim) or [(0.0, 0.0)]
        curvas["eyeBlink" + lado] = _unir_max(curva, seguir)
        curvas["eyeWide" + lado] = [(t, 0.18 * v) for t, v in pos_y]

    # énfasis: ceja
    for t, f in enfasis:
        for nombre, k in (("browInnerUp", 0.30), ("browOuterUpLeft", 0.22), ("browOuterUpRight", 0.22)):
            curvas.setdefault(nombre, [])
            curvas[nombre] += [(t - 0.12, 0.0), (t, k * f * ceja), (t + 0.30, 0.0)]
    for nombre in ("browInnerUp", "browOuterUpLeft", "browOuterUpRight"):
        if nombre in curvas:
            curvas[nombre] = _ordenar(curvas[nombre])

    # cabeza: ruido suave + cabeceo en el énfasis + sigue un poco la mirada
    f1 = [(rnd.uniform(0.17, 0.45), rnd.uniform(0, 6.28)) for _ in range(3)]
    f2 = [(rnd.uniform(0.11, 0.30), rnd.uniform(0, 6.28)) for _ in range(3)]
    cabeza = []
    n = max(2, int(duracion * 8))
    for i in range(n + 1):
        t = duracion * i / n
        yaw = cabeza_grados * (0.6 * math.sin(6.28 * f1[0][0] * t + f1[0][1])
                               + 0.4 * math.sin(6.28 * f2[0][0] * t + f2[0][1]))
        pitch = cabeza_grados * (0.5 * math.sin(6.28 * f1[1][0] * t + f1[1][1])
                                 + 0.3 * math.sin(6.28 * f2[1][0] * t + f2[1][1]))
        roll = 0.4 * cabeza_grados * math.sin(6.28 * f1[2][0] * t + f1[2][1])
        yaw += cabeza_sigue_mirada * 10.0 * _lineal(gx, t - 0.10)
        pitch -= cabeza_sigue_mirada * 8.0 * _lineal(gy, t - 0.10)
        for te, f in enfasis:
            d = t - te
            if -0.10 <= d <= 0.30:
                k = math.sin(math.pi * (d + 0.10) / 0.40)
                pitch += 1.6 * f * k * cabeza_grados / 0.7
        cabeza.append((t, (yaw, pitch, roll)))
    return {"curvas": curvas, "cabeza": cabeza, "parpadeos": ts}


def _ordenar(c):
    c = sorted(c)
    out = []
    for t, v in c:
        if out and t <= out[-1][0]:
            out[-1] = (out[-1][0], max(out[-1][1], v))
        else:
            out.append((t, v))
    return out
