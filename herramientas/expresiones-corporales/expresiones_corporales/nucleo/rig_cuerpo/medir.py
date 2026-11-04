"""Medir las articulaciones de un cuerpo desde su malla.

Se trabaja en el marco canonico del personaje: Z arriba, mirando a -Y y con su izquierda en
+X. Si la malla mira a otro lado se gira antes alrededor de Z (el adelante se detecta por
los pies: las punteras sobresalen hacia delante). Pensado para mallas de Tripo en pose A o T:
bajo la axila los brazos no tocan el torso y bajo la entrepierna las piernas van separadas.

Todo se mide por cortes: horizontales para piernas y torso, perpendiculares al eje del brazo
para el brazo y la mano. Las medidas salen como puntos con nombre; `crear_marcadores` los
pone como empties ECB_<personaje>_<punto> para que se puedan revisar y mover a mano antes de
construir el metarig (igual que los marcadores RLB_* del rig facial).
"""
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

LADOS = ('L', 'R')
DEPURAR = {}
DEDOS = ('indice', 'medio', 'anular', 'menique')


# ---------------------------------------------------------------- datos de la malla

def coords(objetos):
    """Vertices en espacio de mundo de varias mallas (sin modificadores) y su objeto."""
    trozos, dueno = [], []
    for i, ob in enumerate(objetos):
        me = ob.data
        n = len(me.vertices)
        co = np.empty(n * 3, np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        M = np.array(ob.matrix_world)
        trozos.append(co @ M[:3, :3].T + M[:3, 3])
        dueno.append(np.full(n, i))
    return np.concatenate(trozos), np.concatenate(dueno)


def componentes(ob):
    """Etiqueta de componente conexa por vertice (union-find vectorizado sobre aristas)."""
    me = ob.data
    n = len(me.vertices)
    ed = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', ed)
    ed = ed.reshape(-1, 2)
    lab = np.arange(n)
    while True:
        a, b = lab[ed[:, 0]], lab[ed[:, 1]]
        m = np.minimum(a, b)
        nuevo = lab.copy()
        np.minimum.at(nuevo, ed[:, 0], m)
        np.minimum.at(nuevo, ed[:, 1], m)
        nuevo = nuevo[nuevo]          # salto de punteros: acelera la convergencia
        if np.array_equal(nuevo, lab):
            break
        lab = nuevo
    _, lab = np.unique(lab, return_inverse=True)
    return lab


def _grupos_1d(vals, hueco):
    """Indices ordenados partidos donde hay un hueco mayor que `hueco`."""
    orden = np.argsort(vals)
    v = vals[orden]
    cortes = np.where(np.diff(v) > hueco)[0]
    return np.split(orden, cortes + 1)


def _grupos_2d(P2, radio):
    """Agrupamiento por enlace simple en 2D (pocos puntos por corte)."""
    n = len(P2)
    if n == 0:
        return []
    d = np.linalg.norm(P2[:, None, :] - P2[None, :, :], axis=2) < radio
    lab = -np.ones(n, int)
    k = 0
    for i in range(n):
        if lab[i] >= 0:
            continue
        pila = [i]
        lab[i] = k
        while pila:
            j = pila.pop()
            for o in np.nonzero(d[j] & (lab < 0))[0]:
                lab[o] = k
                pila.append(o)
        k += 1
    return [np.nonzero(lab == g)[0] for g in range(k)]


# ---------------------------------------------------------------- marco del personaje

def detectar_adelante(P, z0, H):
    """Angulo (rad) que hay que girar alrededor de Z para que el personaje mire a -Y.

    Las punteras sobresalen hacia delante del tobillo: se compara el centro de la huella
    (franja mas baja) con el de la pierna a media espinilla, en X y en Y."""
    pie = P[P[:, 2] < z0 + 0.025 * H]
    pierna = P[np.abs(P[:, 2] - (z0 + 0.15 * H)) < 0.01 * H]
    if len(pie) < 10 or len(pierna) < 10:
        return 0.0
    d = pie[:, :2].mean(0) - pierna[:, :2].mean(0)
    if np.linalg.norm(d) < 0.005 * H:
        return 0.0
    ang = math.atan2(d[1], d[0])          # direccion hacia delante en el plano
    return -math.pi / 2 - ang              # girar para que quede en -Y


def _rot_z(ang):
    c, s = math.cos(ang), math.sin(ang)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


# ---------------------------------------------------------------- medida principal

def medir(objetos, z_cabeza=None):
    """Mide el cuerpo. Devuelve {'puntos': {nombre: (x,y,z) mundo}, 'info': {...}, 'avisos': []}.

    objetos: mallas del cuerpo (ropa incluida). z_cabeza: altura (mundo) donde empieza la
    cabeza si ya se sabe (p. ej. el borde del grupo 'cabeza' del rig facial)."""
    if not isinstance(objetos, (list, tuple)):
        objetos = [objetos]
    P0, _ = coords(objetos)
    etiquetas, base = [], 0
    for ob in objetos:
        lab = componentes(ob)
        etiquetas.append(lab + base)
        base += int(lab.max()) + 1
    comp = np.concatenate(etiquetas)
    avisos = []
    z0, z1 = float(P0[:, 2].min()), float(P0[:, 2].max())
    H = z1 - z0
    centro = np.array([P0[:, 0].mean(), P0[:, 1].mean(), 0.0])
    ang = detectar_adelante(P0, z0, H)
    R = _rot_z(ang)
    P = (P0 - centro) @ R.T                 # marco canonico (origen en el centro en planta)
    pts = {}

    def franja(z, grosor=0.006):
        return P[np.abs(P[:, 2] - z) < grosor * H]

    hueco = 0.012 * H

    # --- entrepierna: subiendo desde el 30 % H, el ultimo corte en el que ningun grupo
    # cruza x=0 (las piernas van separadas); en cuanto un grupo cruza el centro, es cadera
    entrepierna = None
    for z in np.arange(z0 + 0.30 * H, z0 + 0.62 * H, 0.004 * H):
        F = franja(z, 0.003)
        if len(F) < 10:
            continue
        gs = _grupos_1d(F[:, 0], 0.005 * H)
        cruza = any(F[g, 0].min() < 0 < F[g, 0].max() for g in gs)
        if not cruza:
            entrepierna = z
        elif entrepierna is not None:
            break
    if entrepierna is None:
        entrepierna = z0 + 0.45 * H
        avisos.append('no se encontro la entrepierna: se usa el 45 % de la altura')

    # anchura del torso a media cintura (referencia para separar los brazos)
    F = franja(entrepierna + 0.10 * H, 0.005)
    gs = _grupos_1d(F[:, 0], hueco)
    torso_g = min(gs, key=lambda g: abs(F[g, 0].mean()))
    semi_torso = float(np.abs(F[torso_g, 0]).max())

    # --- piernas
    for lado, sg in (('L', 1), ('R', -1)):
        lado_p = P[(P[:, 0] * sg > 0.003 * H) & (P[:, 2] < entrepierna)]
        # huella: franja baja; puntera = punto mas adelantado; talon = mas atrasado
        huella = lado_p[lado_p[:, 2] < z0 + 0.03 * H]
        punta = huella[np.argmin(huella[:, 1])]
        talon = huella[np.argmax(huella[:, 1])]
        # tobillo: centro de la pierna a la altura del cuello del pie (5,5 % H)
        zt = z0 + 0.055 * H
        T = lado_p[np.abs(lado_p[:, 2] - zt) < 0.006 * H]
        # la puntera tira del centro hacia delante: usar la mitad trasera del corte
        ymed = np.median(T[:, 1])
        Tt = T[T[:, 1] >= ymed - 0.02 * H]
        tobillo = np.array([Tt[:, 0].mean(), 0.5 * (Tt[:, 1].min() + Tt[:, 1].max()), zt])
        # cadera (cabeza del femur): centro de la pierna bajo la entrepierna, algo mas arriba
        C = lado_p[np.abs(lado_p[:, 2] - (entrepierna - 0.04 * H)) < 0.006 * H]
        # con las manos a la altura de la entrepierna, la pierna es el grupo mas interior
        C = C[min(_grupos_1d(C[:, 0], hueco), key=lambda g: np.abs(C[g, 0]).min())]
        cadera = np.array([C[:, 0].mean(), 0.5 * (C[:, 1].min() + C[:, 1].max()),
                           entrepierna + 0.045 * H])
        # rodilla: a mitad, un poco adelantada para que el IK sepa hacia donde doblar
        zr = tobillo[2] + 0.5 * (cadera[2] - tobillo[2])
        K = lado_p[np.abs(lado_p[:, 2] - zr) < 0.006 * H]
        rodilla = np.array([K[:, 0].mean(), 0.5 * (K[:, 1].min() + K[:, 1].max()) - 0.012 * H, zr])
        # sobre la recta cadera-tobillo y solo adelantada: si se sale de lado, el IK dobla hacia fuera
        recta = 0.5 * (cadera + tobillo)
        rodilla[0] = recta[0]
        rodilla[1] = min(rodilla[1], recta[1] - 0.012 * H)
        bola = talon + 0.72 * (punta - talon)
        bola[2] = z0 + 0.02 * H
        punta = punta.copy(); punta[2] = z0 + 0.012 * H
        talon = talon.copy(); talon[2] = z0
        pts[f'cadera.{lado}'] = cadera
        pts[f'rodilla.{lado}'] = rodilla
        pts[f'tobillo.{lado}'] = tobillo
        pts[f'bola_pie.{lado}'] = bola
        pts[f'punta_pie.{lado}'] = punta
        pts[f'talon.{lado}'] = talon
        # anchura del pie para el hueso heel.02
        pts[f'talon_ext.{lado}'] = np.array([float(huella[:, 0].max() if sg > 0 else huella[:, 0].min()),
                                             talon[1] - 0.02 * H, z0])
        pts[f'talon_int.{lado}'] = np.array([float(huella[:, 0].min() if sg > 0 else huella[:, 0].max()),
                                             talon[1] - 0.02 * H, z0])

    # --- brazos: en cada corte por encima de la entrepierna, los grupos separados del grupo
    # central (el que cruza x=0) son trozos de brazo (pose A: bajo la axila no tocan el torso)
    # en cada corte, los grupos que no cruzan x=0; el brazo se sigue por continuidad desde
    # una semilla justo encima de la entrepierna (ahi el grupo mas exterior es el brazo:
    # los bolsillos ya van pegados a la cadera), hacia abajo hasta la mano y hacia arriba
    # hasta la axila (donde se une al torso y deja de aparecer suelto)
    zs_c = np.arange(z0 + 0.20 * H, z0 + 0.95 * H, 0.004 * H)
    cand_z = []
    for z in zs_c:
        F = franja(z, 0.002)
        gs = _grupos_1d(F[:, 0], hueco) if len(F) >= 5 else []
        # solo el grupo mas exterior de cada lado puede ser brazo (en pose A nada sobresale
        # mas que el brazo); asi no se cuelan forros, costuras o piezas sueltas del torso
        x_max, x_min = (float(F[:, 0].max()), float(F[:, 0].min())) if len(F) else (0, 0)
        cand_z.append([F[g] for g in gs if not (F[g, 0].min() < 0 < F[g, 0].max())
                       and (F[g, 0].max() >= x_max - 0.005 * H or F[g, 0].min() <= x_min + 0.005 * H)])
    piezas = {'L': [], 'R': []}
    i_sem = int(np.searchsorted(zs_c, entrepierna + 0.03 * H))
    for lado, sg in (('L', 1), ('R', -1)):
        # un trozo de brazo no llega cerca del centro: si llega es medio torso (p. ej. una
        # chaqueta abierta partida por la cremallera)
        lados = [[q for q in c if q[:, 0].mean() * sg > 0 and np.abs(q[:, 0]).min() > 0.6 * semi_torso]
                 for c in cand_z]
        sem = None
        for i in range(i_sem, min(i_sem + 25, len(zs_c))):
            if lados[i]:
                sem = i
                break
        if sem is None:
            continue
        q0 = max(lados[sem], key=lambda q: q[:, 0].mean() * sg)
        piezas[lado].append((zs_c[sem], q0))
        for paso_i in (-1, 1):
            x_prev = q0[:, 0].mean()
            i = sem + paso_i
            fallos = 0
            while 0 <= i < len(zs_c):
                if lados[i]:
                    q = min(lados[i], key=lambda q: abs(q[:, 0].mean() - x_prev))
                    if abs(q[:, 0].mean() - x_prev) < 0.03 * H:
                        piezas[lado].append((zs_c[i], q))
                        x_prev = q[:, 0].mean()
                        fallos = 0
                        i += paso_i
                        continue
                fallos += 1
                if fallos > 2:
                    break
                i += paso_i
    # una abertura de la ropa puede alargar el rastro de un brazo hasta el cuello: las dos
    # axilas van a la misma altura, manda la mas baja
    topes = [max(z for z, _ in piezas[l]) for l in LADOS if piezas[l]]
    if len(topes) == 2 and abs(topes[0] - topes[1]) > 0.03 * H:
        for l in LADOS:
            piezas[l] = [(z, q) for z, q in piezas[l] if z <= min(topes)]
    brazos = {}
    for lado, sg in (('L', 1), ('R', -1)):
        if not piezas[lado]:
            avisos.append(f'brazo {lado}: no se separa del torso (pose T o brazos pegados)')
            continue
        Q = np.concatenate([q for _, q in piezas[lado]])
        if len(Q) < 50:
            avisos.append(f'brazo {lado}: muy pocos puntos fuera del torso')
            continue
        # eje del brazo por PCA y punta (dedos) = extremo mas alejado del hombro
        c = Q.mean(0)
        u, s, vt = np.linalg.svd(Q - c, full_matrices=False)
        eje = vt[0]
        if eje[2] > 0:                 # que apunte hacia la mano (abajo en pose A, fuera en T)
            eje = -eje
        if abs(eje[2]) < 0.35 and eje[0] * sg < 0:
            eje = -eje
        t = (Q - c) @ eje
        punta = Q[np.argmax(t)]
        brazos[lado] = (Q, eje, punta)

    datos_brazo = {}
    for lado, (Q, eje, punta_brazo) in brazos.items():
        sg = 1 if lado == 'L' else -1
        # linea central con los centros de los trozos de brazo de cada corte horizontal
        # (en pose A bajo la axila el brazo va suelto: el corte no se contamina con el torso)
        zs_p = np.array([z for z, _ in piezas[lado]])
        cen_p = np.array([q.mean(0) for _, q in piezas[lado]])
        anc_p = np.array([np.ptp(q[:, 0]) for _, q in piezas[lado]])
        z_axila = float(zs_p.max())
        L_mano = 0.108 * H
        muneca = None
        # si la mano es una pieza suelta (pasa en Tripo), la muneca es su borde de arriba
        i_tip = int(np.argmin(np.linalg.norm(P - punta_brazo, axis=1)))
        Mpz = P[comp == comp[i_tip]]
        if len(Mpz) < 0.2 * len(P) and np.ptp(Mpz[:, 2]) < 0.2 * H:
            borde = Mpz[Mpz[:, 2] > np.percentile(Mpz[:, 2], 94)]
            muneca = borde.mean(0)
        z_mun = muneca[2] if muneca is not None else punta_brazo[2] + L_mano * abs(eje[2])
        m = (zs_p > z_mun + 0.02 * H) & (zs_p < z_axila - 0.02 * H)
        if m.sum() < 3:
            m = zs_p > z_mun
        C = cen_p[m]
        cc = C.mean(0)
        _, _, vt = np.linalg.svd(C - cc)
        eje_b = vt[0] if vt[0] @ eje > 0 else -vt[0]
        if muneca is None:
            muneca = cc + eje_b * ((z_mun - cc[2]) / eje_b[2])
        # trozos de la mano por debajo de la muneca: su centro corrige la muneca en planta
        axila = cen_p[np.argmax(zs_p)]
        grosor = float(np.median(anc_p[m])) * max(0.5, abs(eje_b[2]))
        datos_brazo[lado] = dict(punta=punta_brazo, eje=eje_b, muneca=muneca, axila=axila, grosor=grosor, cc=cc)

    # --- base del cuello: subiendo desde la axila, el primer corte cuyo grupo central es
    # mucho mas estrecho que el torso a la altura de la axila
    cuello_z = None
    if datos_brazo:
        z_ax = float(np.mean([d['axila'][2] for d in datos_brazo.values()]))
    else:
        z_ax = z0 + 0.70 * H
        avisos.append('sin brazos: axila al 70 % de la altura')
    # silueta completa del corte (brazos ya unidos al torso por encima de la axila); el
    # grupo central no sirve: una chaqueta abierta parte el corte en la cremallera
    def extension(z):
        F = franja(z, 0.002)
        F = F[np.abs(F[:, 0]) < semi_torso * 3]
        return (float(F[:, 0].max()), float(-F[:, 0].min())) if len(F) >= 5 else None
    e0 = extension(z_ax + 0.02 * H)
    semi_ax = 0.5 * (e0[0] + e0[1]) if e0 else semi_torso * 1.6
    perfil_ext = []          # (z, extension izquierda, extension derecha)
    for z in np.arange(z_ax + 0.02 * H, z0 + 0.97 * H, 0.004 * H):
        e = extension(z)
        if e is None:
            continue
        perfil_ext.append((z, e[0], e[1]))
        if max(e) < 0.55 * semi_ax:
            cuello_z = z
            break
    if cuello_z is None:
        cuello_z = z_ax + 0.16 * H
        avisos.append('no se encontro el cuello')
    if z_cabeza is not None:
        cuello_z = min(cuello_z, z_cabeza + 0.06 * H)
    perfil_ext = np.array(perfil_ext) if perfil_ext else np.zeros((0, 3))

    # --- hombro, codo y mano
    for lado, d in datos_brazo.items():
        sg = 1 if lado == 'L' else -1
        z_j = d['axila'][2] + 0.65 * (cuello_z - d['axila'][2])
        # borde exterior de la silueta a esa altura, metido medio grosor de brazo
        if len(perfil_ext):
            col = 1 if sg > 0 else 2
            x_out = float(np.interp(z_j, perfil_ext[:, 0], perfil_ext[:, col]))
        else:
            x_out = abs(d['axila'][0]) + 0.5 * d['grosor']
        x_j = sg * max(x_out - 0.5 * d['grosor'], semi_torso * 0.6)
        S = P[(np.abs(P[:, 0] - x_j) < 0.015 * H) & (np.abs(P[:, 2] - z_j) < 0.01 * H)]
        y_j = 0.5 * (S[:, 1].min() + S[:, 1].max()) if len(S) else d['axila'][1]
        hombro = np.array([x_j, y_j, z_j])
        muneca = d['muneca']
        codo = hombro + 0.53 * (muneca - hombro)
        codo[1] += 0.012 * H                      # codo un poco atras: el IK sabe hacia donde doblar
        pts[f'hombro.{lado}'] = hombro
        pts[f'codo.{lado}'] = codo
        pts[f'muneca.{lado}'] = muneca
        pts[f'axila.{lado}'] = d['axila']
        mano = _medir_mano(P, muneca, d['punta'], d['eje'], sg, H, avisos, lado)
        pts.update(mano)

    semi_hombros = np.mean([abs(pts[f'hombro.{l}'][0]) for l in LADOS if f'hombro.{l}' in pts]) if datos_brazo else semi_torso

    def centro_y(z, ancho=None):
        F = franja(z, 0.005)
        F = F[np.abs(F[:, 0]) < (ancho or semi_torso)]
        return 0.5 * (F[:, 1].min() + F[:, 1].max()) if len(F) else 0.0

    cad_z = np.mean([pts[f'cadera.{l}'][2] for l in LADOS])
    zs = {
        'pelvis': cad_z,
        'columna': cad_z + 0.24 * (cuello_z - cad_z),
        'pecho': cad_z + 0.50 * (cuello_z - cad_z),
        'pecho_alto': cad_z + 0.76 * (cuello_z - cad_z),
        'cuello': cuello_z,
    }
    for k, z in zs.items():
        # la columna va algo por detras del centro del corte
        y = centro_y(z) + 0.08 * (np.ptp(franja(z, 0.005)[:, 1]) if len(franja(z, 0.005)) else 0)
        pts[k] = np.array([0.0, y, z])
    cab_base = cuello_z + 0.36 * (z0 + H - cuello_z)
    pts['cuello_medio'] = np.array([0.0, centro_y(0.5 * (cuello_z + cab_base), semi_hombros * 0.6), 0.5 * (cuello_z + cab_base)])
    pts['cabeza'] = np.array([0.0, centro_y(cab_base, semi_hombros * 0.6), cab_base])
    pts['coronilla'] = np.array([0.0, pts['cabeza'][1], z0 + H])
    for lado, sg in (('L', 1), ('R', -1)):
        if f'hombro.{lado}' in pts:
            h = pts[f'hombro.{lado}']
            pts[f'clavicula.{lado}'] = np.array([sg * 0.02 * H, pts['cuello'][1] - 0.035 * H, h[2] + 0.01 * H])

    # volver al mundo
    Rt = R.T
    mundo = {k: tuple(float(x) for x in (np.asarray(v) @ Rt.T + centro)) for k, v in pts.items()}
    info = {'altura': H, 'z0': z0, 'giro_adelante_grados': math.degrees(ang), 'entrepierna': float(entrepierna + 0),
            'semi_torso': semi_torso, 'pose': 'T' if any(abs(b[1][2]) < 0.5 for b in brazos.values()) else 'A'}
    return {'puntos': mundo, 'info': info, 'avisos': avisos}


def _medir_mano(P, muneca, punta, eje, sg, H, avisos, lado):
    """Dedos en el marco de la mano: a = muneca->punta, w = ancho de la mano (hacia el pulgar,
    delante en pose A), n_palma = hacia la palma.

    Las puntas salen del corte distal mas proximal con 4 grupos (indice..menique); los
    nudillos se ponen al 46 % de la mano en la misma linea de cada dedo; el pulgar son los
    puntos del lado de la palma y del indice que sobresalen de la palma. Si algo falla se
    colocan por proporciones (avisando) y se corrigen moviendo los marcadores."""
    out = {}
    a = punta - muneca
    L = float(np.linalg.norm(a))
    a = a / L
    rel = P - muneca
    t = rel @ a
    radial = np.linalg.norm(rel - np.outer(t, a), axis=1)
    M = P[(t > -0.005 * H) & (t < L + 0.01 * H) & (radial < 0.6 * L)]
    rm = M - muneca
    tm = rm @ a
    Mp = rm - np.outer(tm, a)
    _, _, vt = np.linalg.svd(Mp - Mp.mean(0))
    w = vt[0] - (vt[0] @ a) * a
    w /= np.linalg.norm(w)
    if w[1] > 0:                      # el pulgar va delante (-Y) en pose A
        w = -w
    n = np.cross(a, w)
    n_palma = n * sg                  # mismo sentido fisico (hacia la palma) en las dos manos
    vw, vp = rm @ w, rm @ n_palma
    palma = (tm > 0.25 * L) & (tm < 0.5 * L)
    p_med = float(np.median(vp[palma])) if palma.any() else 0.0
    p_grosor = float(np.percentile(vp[palma], 95) - np.percentile(vp[palma], 5)) if palma.any() else 0.02 * H
    w_min, w_max = (float(np.percentile(vw[palma], 3)), float(np.percentile(vw[palma], 97))) if palma.any() else (-0.03 * H, 0.03 * H)

    wc = None
    for d in np.arange(0.55 * L, 0.97 * L, 0.003 * H):
        m = (np.abs(tm - d) < 0.002 * H) & (vp < p_med + 0.6 * p_grosor)
        if m.sum() < 8:
            continue
        P2 = np.stack([vw[m], vp[m]], 1)
        gs = [g for g in _grupos_2d(P2, 0.0035 * H) if len(g) >= 2]
        if len(gs) == 4:
            wc = sorted([float(P2[g, 0].mean()) for g in gs], reverse=True)
            break
    if wc is None:
        avisos.append(f'mano {lado}: no se separaron los 4 dedos; se colocan por proporciones')
        wc = list(np.linspace(w_max - 0.15 * (w_max - w_min), w_min + 0.15 * (w_max - w_min), 4))
    sep = max(abs(wc[0] - wc[-1]) / 3.0, 0.006 * H)
    for i, nombre in enumerate(DEDOS):
        sel = (np.abs(vw - wc[i]) < 0.5 * sep) & (tm > 0.45 * L) & (vp < p_med + 0.6 * p_grosor)
        if sel.sum() >= 3:
            S = M[sel]
            tip = S[np.argmax(tm[sel])]
            # linea del dedo: centros de sus puntos por tramos (sigue la curva si esta doblado)
            linea = []
            for f in (0.62, 0.74, 0.86):
                mm = sel & (np.abs(tm - f * L) < 0.03 * L)
                if mm.sum() >= 2:
                    linea.append(M[mm].mean(0))
        else:
            tip = muneca + a * L * (0.97 - 0.05 * abs(i - 1)) + w * wc[i]
            linea = []
        nud = muneca + a * 0.46 * L + w * wc[i] * 0.9 + n_palma * p_med
        tip = tip - a * 0.003 * H
        out.update(_cadena_dedo(nombre, lado, nud, np.array([nud] + linea), tip))
    # pulgar
    base_p = muneca + a * 0.10 * L + w * wc[0] * 0.55 + n_palma * (p_med + 0.15 * p_grosor)
    cand = (tm > 0.12 * L) & (tm < 0.85 * L) & (vw > wc[0] - 0.4 * sep) & (vp > p_med + 0.45 * p_grosor)
    if cand.sum() >= 10:
        C = M[cand]
        dist = np.linalg.norm(C - base_p, axis=1)
        tip_p = C[np.argmax(dist)]
        dir_p = (tip_p - base_p) / (np.linalg.norm(tip_p - base_p) + 1e-9)
        tip_p = tip_p - dir_p * 0.003 * H
        mid = C[np.abs((C - base_p) @ dir_p - 0.55 * np.linalg.norm(tip_p - base_p)) < 0.01 * H]
        linea = [base_p] + ([mid.mean(0)] if len(mid) else [])
        out.update(_cadena_dedo('pulgar', lado, base_p, np.array(linea), tip_p, pulgar=True))
    else:
        avisos.append(f'mano {lado}: pulgar por proporciones')
        tip_p = muneca + a * 0.60 * L + w * (wc[0] + 0.3 * sep) + n_palma * (p_med + 0.9 * p_grosor)
        out.update(_cadena_dedo('pulgar', lado, base_p, np.array([base_p]), tip_p, pulgar=True))
    out[f'mano_w.{lado}'] = muneca + w * 0.05 * H      # hacia el pulgar (para el roll)
    out[f'mano_n.{lado}'] = muneca + n_palma * 0.05 * H  # hacia la palma
    out[f'mano_punta.{lado}'] = punta
    return out


def _cadena_dedo(nombre, lado, base, linea, punta, pulgar=False):
    """Cuatro puntos (base, articulacion 1, articulacion 2, punta) a lo largo de la linea."""
    pol = np.vstack([base, linea[1:] if len(linea) > 1 else linea, punta])
    seg = np.linalg.norm(np.diff(pol, axis=0), axis=1)
    acum = np.concatenate([[0], np.cumsum(seg)])
    tot = acum[-1] if acum[-1] > 0 else 1.0
    fr = (0.0, 0.42, 0.72, 1.0) if not pulgar else (0.0, 0.40, 0.70, 1.0)
    res = {}
    for i, f in enumerate(fr):
        s = f * tot
        k = min(np.searchsorted(acum, s, side='right') - 1, len(seg) - 1)
        u = (s - acum[k]) / (seg[k] if seg[k] > 0 else 1)
        res[f'{nombre}_{i}.{lado}'] = pol[k] + u * (pol[k + 1] - pol[k])
    return res


# ---------------------------------------------------------------- marcadores

def coleccion(personaje):
    nombre = f'ECB {personaje} marcadores'
    col = bpy.data.collections.get(nombre)
    if col is None:
        col = bpy.data.collections.new(nombre)
        bpy.context.scene.collection.children.link(col)
    return col


def crear_marcadores(personaje, puntos, tam=0.008):
    """Empties ECB_<personaje>_<punto>; si ya existen se mueven (no se duplican)."""
    col = coleccion(personaje)
    hechos = []
    for k, p in puntos.items():
        nombre = f'ECB_{personaje}_{k}'
        e = bpy.data.objects.get(nombre)
        if e is None:
            e = bpy.data.objects.new(nombre, None)
            e.empty_display_type = 'SPHERE'
            col.objects.link(e)
        e.empty_display_size = tam
        e.location = Vector(p)
        e.show_in_front = True
        hechos.append(nombre)
    return hechos


def leer_marcadores(personaje):
    pre = f'ECB_{personaje}_'
    bpy.context.view_layer.update()      # empties recien creados: matrix_world aun sin calcular
    return {o.name[len(pre):]: tuple(o.matrix_world.translation)
            for o in bpy.data.objects if o.type == 'EMPTY' and o.name.startswith(pre)}


# ---------------------------------------------------------------- foto de revision

UNIONES = [('cadera.{l}', 'rodilla.{l}'), ('rodilla.{l}', 'tobillo.{l}'), ('tobillo.{l}', 'bola_pie.{l}'),
           ('bola_pie.{l}', 'punta_pie.{l}'), ('clavicula.{l}', 'hombro.{l}'), ('hombro.{l}', 'codo.{l}'),
           ('codo.{l}', 'muneca.{l}')] + \
          [(f'{d}_{i}.{{l}}', f'{d}_{i + 1}.{{l}}') for d in DEDOS + ('pulgar',) for i in range(3)] + \
          [('muneca.{l}', f'{d}_0.{{l}}') for d in DEDOS + ('pulgar',)]
COLUMNA = ['pelvis', 'columna', 'pecho', 'pecho_alto', 'cuello', 'cuello_medio', 'cabeza', 'coronilla']


def foto_marcadores(personaje, objetos, carpeta, puntos=None):
    """Renders Workbench (frente, lado, mano izquierda de cerca) con los marcadores como bolas
    y las uniones como palos, vistos a traves de la malla. Todo lo temporal se borra."""
    import os
    puntos = puntos or leer_marcadores(personaje)
    if not isinstance(objetos, (list, tuple)):
        objetos = [objetos]
    sc = bpy.context.scene
    os.makedirs(carpeta, exist_ok=True)
    import bmesh
    me = bpy.data.meshes.new('ECB_tmp_puntos')
    bm = bmesh.new()
    P0, _ = coords(objetos)
    H = float(np.ptp(P0[:, 2]))
    r = 0.0045 * H
    for k, p in puntos.items():
        if k.startswith(('mano_w', 'mano_n', 'talon_', 'axila')):
            continue
        m = Matrix.Translation(Vector(p))
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r * (0.6 if '_' in k and k[0] in 'impa' else 1.0), matrix=m)
    pares = [(a.format(l=l), b.format(l=l)) for a, b in UNIONES for l in LADOS]
    pares += list(zip(COLUMNA[:-1], COLUMNA[1:]))
    for a, b in pares:
        if a in puntos and b in puntos:
            pa, pb = Vector(puntos[a]), Vector(puntos[b])
            d = pb - pa
            if d.length < 1e-6:
                continue
            rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
            m = Matrix.Translation((pa + pb) / 2) @ rot
            bmesh.ops.create_cone(bm, segments=6, radius1=r * 0.35, radius2=r * 0.35, depth=d.length, matrix=m, cap_ends=True)
    bm.to_mesh(me)
    bm.free()
    obp = bpy.data.objects.new('ECB_tmp_puntos', me)
    obp.color = (1.0, 0.15, 0.1, 1.0)
    obp.show_in_front = True
    sc.collection.objects.link(obp)
    cam_d = bpy.data.cameras.new('ECB_tmp_cam')
    cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('ECB_tmp_cam', cam_d)
    sc.collection.objects.link(cam)
    r_ = sc.render
    sh = sc.display.shading
    viejo = (sc.camera, r_.engine, r_.resolution_x, r_.resolution_y, r_.filepath, sh.light, sh.color_type,
             sh.show_xray, sh.xray_alpha)
    sc.camera = cam
    r_.engine = 'BLENDER_WORKBENCH'
    r_.resolution_x = r_.resolution_y = 800
    sh.light = 'STUDIO'
    sh.color_type = 'OBJECT'
    sh.show_xray = True
    sh.xray_alpha = 0.55
    # en la foto solo el personaje: las mallas ocultas en el visor tambien salen en un render
    ajenas = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and o not in objetos and o is not obp]
    for o in ajenas:
        o.hide_render = True
    c = P0.mean(0)
    z0 = float(P0[:, 2].min())
    vistas = {
        'frente': ((c[0], c[1] - 3, z0 + H / 2), (math.pi / 2, 0, 0), H * 1.08),
        'lado': ((c[0] + 3, c[1], z0 + H / 2), (math.pi / 2, 0, math.pi / 2), H * 1.08),
    }
    if 'muneca.L' in puntos and 'mano_punta.L' in puntos:
        mc = (Vector(puntos['muneca.L']) + Vector(puntos['mano_punta.L'])) / 2
        vistas['mano_L'] = ((mc.x + 3, mc.y, mc.z), (math.pi / 2, 0, math.pi / 2), H * 0.18)
        vistas['mano_L_frente'] = ((mc.x, mc.y - 3, mc.z), (math.pi / 2, 0, 0), H * 0.18)
    rutas = {}
    try:
        for k, (loc, rot, esc) in vistas.items():
            cam.location = loc
            cam.rotation_euler = rot
            cam_d.ortho_scale = esc
            r_.filepath = os.path.join(carpeta, f'marcadores_{k}.png')
            bpy.ops.render.render(write_still=True)
            rutas[k] = r_.filepath
    finally:
        (sc.camera, r_.engine, r_.resolution_x, r_.resolution_y, r_.filepath, sh.light, sh.color_type,
         sh.show_xray, sh.xray_alpha) = viejo
        for o in ajenas:
            o.hide_render = False
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cam_d)
        bpy.data.objects.remove(obp)
        bpy.data.meshes.remove(me)
    return rutas
