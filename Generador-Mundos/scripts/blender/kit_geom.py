# Helpers de geometría para los interiores del kit: color de vértice, tornos, prismas y formas de baja poligonación.
# Todo en coordenadas del generador (X a lo largo, Y arriba, +Z a la calle); el origen de cada pieza es el centro del suelo.
import math, random
from kit_base import Mod

def srgb(h):
    h = h.lstrip('#')
    v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((c + .055) / 1.055) ** 2.4 if c > .04045 else c / 12.92 for c in v)

def C(h, k=1.0):
    """Hex sRGB -> color lineal de vértice, con factor de luminosidad."""
    return tuple(min(1.0, c * k) for c in srgb(h))

def mezcla(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))

def vari(col, r, a=.10):
    k = 1 + (r.random() * 2 - 1) * a
    return tuple(min(1.0, c * k) for c in col)

def azar(semilla):
    return random.Random(semilla)

def pieza(id, nota, nominal=(1, 1, 1), familia='utileria', estira='fijo'):
    return Mod(id, familia, estira, nominal, nota)

def caja(m, x0, y0, z0, x1, y1, z1, col, skip=(), mat='ss_in', cols=None, completa=False):
    """Caja con color; cols = {'+y': color} para caras concretas. El visitante siempre mira desde +Z: sin completa=True se omiten
    la cara trasera y, por debajo de 1 m, la inferior (presupuesto de triángulos)."""
    if not completa:
        skip = tuple(set(skip) | {'-z'} | ({'-y'} if y0 < 1.0 else set()))
    if not cols:
        return m.box(x0, y0, z0, x1, y1, z1, mat, skip=skip, col=col)
    f = {'+z': ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)), '-z': ((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)),
         '+x': ((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)), '-x': ((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)),
         '+y': ((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)), '-y': ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))}
    for k, q in f.items():
        if k not in skip:
            m.quad(*q, mat, col=cols.get(k, col))
    return m

def torno(m, cx, cz, perfil, col, seg=8, mat='ss_in', y0=0.0, tapa_arriba=True, tapa_abajo=False, suave=True, cols=None, ex=1.0, ez=1.0):
    """Superficie de revolución. perfil = [(radio, y), ...] de abajo arriba. cols = lista de colores por tramo."""
    angs = [2 * math.pi * i / seg for i in range(seg + 1)]
    for t in range(len(perfil) - 1):
        (r0, ya), (r1, yb) = perfil[t], perfil[t + 1]
        c = cols[t] if cols else col
        for i in range(seg):
            a0, a1 = angs[i], angs[i + 1]; am = (a0 + a1) / 2
            p = lambda r, y, a: (cx + ex * r * math.cos(a), y0 + y, cz + ez * r * math.sin(a))
            pts = [p(r0, ya, a0), p(r0, ya, a1), p(r1, yb, a1), p(r1, yb, a0)]
            if r0 < 1e-6:
                pts = [p(0, ya, am), p(r1, yb, a1), p(r1, yb, a0)]
            elif r1 < 1e-6:
                pts = [p(r0, ya, a0), p(r0, ya, a1), p(0, yb, am)]
            m.poly(pts, mat, [(0, 0)] * len(pts), n=(math.cos(am), (r0 - r1) / max(abs(yb - ya), 1e-3), math.sin(am)), suave=suave, col=c)
    if tapa_arriba and perfil[-1][0] > 1e-6:
        r, y = perfil[-1]
        m.poly([(cx + ex * r * math.cos(a), y0 + y, cz + ez * r * math.sin(a)) for a in angs[:-1]], mat, [(0, 0)] * seg, n=(0, 1, 0), suave=False, col=cols[-1] if cols else col)
    if tapa_abajo and perfil[0][0] > 1e-6:
        r, y = perfil[0]
        m.poly([(cx + ex * r * math.cos(a), y0 + y, cz + ez * r * math.sin(a)) for a in angs[:-1]], mat, [(0, 0)] * seg, n=(0, -1, 0), suave=False, col=cols[0] if cols else col)
    return m

def cilindro(m, cx, cz, y0, y1, r, col, seg=8, r2=None, **kw):
    return torno(m, cx, cz, [(r, y0), (r if r2 is None else r2, y1)], col, seg=seg, suave=kw.pop('suave', False), **kw)

def bola(m, cx, cy, cz, r, col, seg=6, achata=1.0, mat='ss_in', nivel=0):
    """Esfera de baja poligonación; nivel 0 = bipirámide (12 triángulos: fruta, panes, flores), 1 = dos anillos (36)."""
    perfil = [(0, -r * achata), (r, 0), (0, r * achata)] if nivel == 0 else [(0, -r * achata), (r * .86, -r * achata * .5), (r, 0), (r * .86, r * achata * .5), (0, r * achata)]
    return torno(m, cx, cz, perfil, col, seg=seg, mat=mat, y0=cy, tapa_arriba=False, tapa_abajo=False, suave=True)

def prisma(m, pts_xz, y0, y1, col, mat='ss_in', tapas=True):
    """Extrusión vertical de un polígono (x, z) ya ordenado en sentido antihorario visto desde arriba (+Y)."""
    n = len(pts_xz)
    for i in range(n):
        a, b = pts_xz[i], pts_xz[(i + 1) % n]
        mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        cx = sum(p[0] for p in pts_xz) / n; cz = sum(p[1] for p in pts_xz) / n
        m.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], mat, [(0, 0)] * 4, n=(mx - cx, 0, mz - cz), col=col)
    if tapas:
        m.poly([(p[0], y1, p[1]) for p in pts_xz], mat, [(0, 0)] * n, n=(0, 1, 0), col=col)
        m.poly([(p[0], y0, p[1]) for p in pts_xz], mat, [(0, 0)] * n, n=(0, -1, 0), col=col)
    return m

def extruir_xy(m, pts_xy, z0, z1, col, mat='ss_in'):
    """Silueta (x, y) extruida en z: perchas, zapatos, ropa colgada. pts en sentido antihorario visto desde +Z."""
    n = len(pts_xy)
    cx = sum(p[0] for p in pts_xy) / n; cy = sum(p[1] for p in pts_xy) / n
    m.poly([(p[0], p[1], z1) for p in pts_xy], mat, [(0, 0)] * n, n=(0, 0, 1), col=col)
    m.poly([(p[0], p[1], z0) for p in pts_xy], mat, [(0, 0)] * n, n=(0, 0, -1), col=col)
    for i in range(n):
        a, b = pts_xy[i], pts_xy[(i + 1) % n]
        mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
        m.poly([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], mat, [(0, 0)] * 4, n=(mx, my, 0), col=col)
    return m

def anillo_xy(m, cx, cy, z, r_ext, r_int, col, seg=10, grosor=.01, mat='ss_in', borde=True):
    """Aro plano (marcos redondos, gafas) en el plano XY."""
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        P = lambda r, a, zz: (cx + r * math.cos(a), cy + r * math.sin(a), zz)
        m.poly([P(r_int, a0, z + grosor), P(r_ext, a0, z + grosor), P(r_ext, a1, z + grosor), P(r_int, a1, z + grosor)], mat, [(0, 0)] * 4, n=(0, 0, 1), col=col)
        if borde:
            m.poly([P(r_ext, a0, z - grosor), P(r_ext, a0, z + grosor), P(r_ext, a1, z + grosor), P(r_ext, a1, z - grosor)], mat, [(0, 0)] * 4,
                   n=(math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0), col=col)
    return m

def disco_xy(m, cx, cy, z, r, mat, col=None, seg=14, mirando=1):
    m.poly([(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)], mat,
           [(.5 + .5 * math.cos(2 * math.pi * i / seg), .5 + .5 * math.sin(2 * math.pi * i / seg)) for i in range(seg)], n=(0, 0, mirando), col=col)
    return m

def cilindro_x(m, x0, x1, cy, cz, r, col, seg=6, mat='ss_in', tapas=True):
    """Cilindro horizontal a lo largo de X (barras, embutidos, troncos)."""
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg; am = (a0 + a1) / 2
        q = lambda x, a: (x, cy + r * math.sin(a), cz + r * math.cos(a))
        m.poly([q(x0, a0), q(x1, a0), q(x1, a1), q(x0, a1)], mat, [(0, 0)] * 4, n=(0, math.sin(am), math.cos(am)), suave=True, col=col)
    if tapas:
        m.poly([(x1, cy + r * math.sin(2 * math.pi * i / seg), cz + r * math.cos(2 * math.pi * i / seg)) for i in range(seg)], mat, [(0, 0)] * seg, n=(1, 0, 0), col=col)
        m.poly([(x0, cy + r * math.sin(2 * math.pi * i / seg), cz + r * math.cos(2 * math.pi * i / seg)) for i in range(seg)], mat, [(0, 0)] * seg, n=(-1, 0, 0), col=col)
    return m

def barra(m, p0, p1, ancho, grueso, col, mat='ss_in', lado=(1, 0, 0)):
    """Barra de sección rectangular entre dos puntos (patas, escaleras, brazos). `lado` fija la orientación del ancho."""
    d = [p1[i] - p0[i] for i in range(3)]
    s = list(lado)
    t = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]]
    ln = math.sqrt(sum(c * c for c in t)) or 1.0
    t = [c / ln for c in t]
    def V(p, a, b):
        return tuple(p[i] + s[i] * ancho / 2 * a + t[i] * grueso / 2 * b for i in range(3))
    A = [V(p0, -1, -1), V(p0, 1, -1), V(p0, 1, 1), V(p0, -1, 1)]
    B = [V(p1, -1, -1), V(p1, 1, -1), V(p1, 1, 1), V(p1, -1, 1)]
    cen = [(p0[i] + p1[i]) / 2 for i in range(3)]
    for i in range(4):
        j = (i + 1) % 4
        quad = [A[i], A[j], B[j], B[i]]
        mid = [sum(q[k] for q in quad) / 4 - cen[k] for k in range(3)]
        m.poly(quad, mat, [(0, 0)] * 4, n=mid, col=col)
    m.poly(A, mat, [(0, 0)] * 4, n=[-c for c in d], col=col)
    m.poly(B, mat, [(0, 0)] * 4, n=d, col=col)
    return m
