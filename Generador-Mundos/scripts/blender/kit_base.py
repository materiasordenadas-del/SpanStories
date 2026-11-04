# Kit modular de escaparates para el generador procedural (Atlas).
# Uso:  blender -b --python construir_kit_escaparate.py -- <raiz-del-proyecto>
# Salidas: blender/kit-escaparates.blend, public/assets/kits-escaparate/kit-escaparate.raw.glb,
#          kit.json (paso siguiente: scripts/kit-escaparate-postproceso.mjs fija alfa/roles y escribe el GLB final).
#
# Convención (la misma que elements.js): X a lo largo de la fachada, Y arriba, Z hacia la calle.
# Origen: centro inferior del hueco. Plano del muro z=0; el vidrio queda remetido a z=-REMETIDO (norma 2.2.8).
# Todo se modela en esas coordenadas (función P) y Blender lo exporta en glTF Y-arriba sin cambios.
import bpy, bmesh, math, json, sys, os

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RAIZ = ARGS[0] if ARGS else os.getcwd()

# ---------------------------------------------------------------- medidas del kit
W0, H0, D0 = 3.6, 3.0, 1.4          # vano, alto del vano y caja somera nominales
REMETIDO = 0.25                      # cierre hundido respecto al muro (0,20–0,40)
PROF_MIN, PROF_MAX = 1.0, 1.8        # profundidad admitida de la caja, medida desde el vidrio
CAPAS_Z = (0.3, 0.7, 1.0)            # metros desde el vidrio en la caja nominal (apéndice A.1)
CAPAS_FRAC = (0.22, 0.50, 0.78)      # fracciones de la profundidad que ya usa commerce-scene.js
ZOCALO_H = 0.5
PUERTA_W, PUERTA_H = 1.1, 2.3
ROTULO_H = 0.55
N_RAYAS = 12                         # franjas de toldo por ancho nominal (0,30 m a 3,6 m)

def P(x, y, z):
    """Coordenadas del generador -> Blender (Z arriba, la calle en -Y): glTF vuelve a (x, y, z)."""
    return (x, -z, y)

UV_FULL = ((0, 0), (1, 0), (1, 1), (0, 1))

# ---------------------------------------------------------------- materiales (roles ss_*)
# tinte: 1 = toma el color de instancia (carpintería, lona, rótulo); 2 = segundo tinte (piedra, muro)
MATERIALES = {
    'ss_marco':            dict(rol='marco',              color=(0.86, 0.86, 0.84), tinte=1),
    'ss_tinte2':           dict(rol='piedra',             color=(0.80, 0.74, 0.64), tinte=2),
    'ss_metal':            dict(rol='metal',              color=(0.18, 0.19, 0.21), metal=0.6),
    'ss_vidrio_escaparate': dict(rol='vidrio_escaparate', color=(0.71, 0.85, 0.90), alfa=0.11, modo='BLEND', doble=True),
    'ss_int_fondo':        dict(rol='luz_interior',       color=(0.90, 0.84, 0.70), modo='MASK', doble=True, emisivo=0.28, slot='tile.fondo'),
    'ss_int_capa':         dict(rol='luz_interior',       color=(0.75, 0.55, 0.35), modo='MASK', doble=True, emisivo=0.28, slot='tile.capa'),
    'ss_int_suelo':        dict(rol='luz_interior',       color=(0.78, 0.66, 0.46), modo='MASK', doble=True, emisivo=0.28, slot='tira.suelo'),
    'ss_int_techo':        dict(rol='luz_interior',       color=(0.82, 0.76, 0.66), modo='MASK', doble=True, emisivo=0.28, slot='tira.techo'),
    'ss_int_lateral':      dict(rol='luz_interior',       color=(0.70, 0.62, 0.50), modo='MASK', doble=True, emisivo=0.28, slot='tira.lateral'),
    'ss_letrero':          dict(rol='letrero_luminoso',   color=(0.95, 0.90, 0.75), modo='MASK', doble=True, emisivo=0.12, slot='rotulo.celda'),
    'ss_persiana':         dict(rol='persiana',           color=(0.57, 0.59, 0.60), modo='MASK', doble=True, slot='tira.persiana'),
    'ss_toldo_a':          dict(rol='toldo',              color=(0.70, 0.20, 0.18), tinte=1, doble=True),
    'ss_toldo_b':          dict(rol='toldo',              color=(0.95, 0.93, 0.88), doble=True),
    'ss_luz_franja':       dict(rol='luz_interior',       color=(1.00, 0.86, 0.60), emisivo=1.0),
    'ss_neon':             dict(rol='letrero_luminoso',   color=(0.30, 0.85, 0.45), emisivo=0.8),
    'ss_vinilo_lema':      dict(rol='vinilo',             color=(0.95, 0.95, 0.90), modo='MASK', doble=True, slot='rotulo.lema'),
    'ss_vinilo_estado':    dict(rol='vinilo',             color=(0.30, 0.55, 0.40), modo='MASK', doble=True, slot='rotulo.estado'),
    'ss_vinilo_banda':     dict(rol='vinilo',             color=(0.92, 0.94, 0.95), alfa=0.55, modo='BLEND', doble=True),
    # --- interiores con volumen: color de vértice (la pintura va en la malla, sin atlas)
    'ss_in':               dict(rol='interior',           color=(1.00, 1.00, 1.00), vcol=True, doble=True),
    'ss_in_luz':           dict(rol='luz_interior',       color=(1.00, 0.84, 0.55), emisivo=1.0),
    'ss_in_brasa':         dict(rol='luz_interior',       color=(1.00, 0.45, 0.12), emisivo=1.6),
    'ss_in_pantalla':      dict(rol='luz_interior',       color=(0.35, 0.80, 0.95), emisivo=1.1),
    'ss_in_vidrio':        dict(rol='vidrio_vitrina',     color=(0.75, 0.90, 0.95), alfa=0.22, modo='BLEND', doble=True),
    'ss_in_espejo':        dict(rol='espejo',             color=(0.70, 0.82, 0.86), metal=0.4),
}
FAMILIAS_INTERIOR = {'piel', 'utileria', 'conjunto'}

# ---------------------------------------------------------------- constructor de módulos
MODULOS = []

class Mod:
    def __init__(s, id, familia, estira='fijo', nominal=(1, 1, 1), nota='', suave=False):
        s.id, s.familia, s.estira, s.nominal, s.nota = id, familia, estira, nominal, nota
        s.faces = []        # (puntos, material, uv por punto, suave, color rgb lineal o None)
        s.suave = suave
        MODULOS.append(s)

    def poly(s, pts, mat, uv=None, n=None, suave=None, col=None):
        pts = [tuple(p) for p in pts]
        if uv is None:
            uv = list(UV_FULL) if len(pts) == 4 else [(0, 0)] * len(pts)
        uv = [tuple(u) for u in uv]
        if n is not None:   # orientar por la normal deseada (Newell)
            nx = ny = nz = 0.0
            for i, a in enumerate(pts):
                b = pts[(i + 1) % len(pts)]
                nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
            if nx * n[0] + ny * n[1] + nz * n[2] < 0:
                pts.reverse(); uv.reverse()
        if col is not None:   # color de vértice con sombreado de caras ya horneado (arriba claro, abajo oscuro)
            nx = ny = nz = 0.0
            for i, a in enumerate(pts):
                b = pts[(i + 1) % len(pts)]
                nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
            ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            k = 0.80 + 0.17 * (ny / ln) + 0.05 * (nz / ln) if mat != 'ss_in_luz' else 1.0
            col = tuple(min(1.0, c * k) for c in col)
        s.faces.append((pts, mat, uv, s.suave if suave is None else suave, col))
        return s

    def quad(s, a, b, c, d, mat, uv=UV_FULL, n=None, suave=None, col=None):
        return s.poly([a, b, c, d], mat, list(uv), n, suave, col)

    def box(s, x0, y0, z0, x1, y1, z1, mat, skip=(), mats=None, col=None):
        mats = mats or {}
        m = lambda k: mats.get(k, mat)
        f = {
            '+z': ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)),
            '-z': ((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)),
            '+x': ((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)),
            '-x': ((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)),
            '+y': ((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)),
            '-y': ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)),
        }
        for k, q in f.items():
            if k not in skip:
                s.quad(*q, m(k), col=col)
        return s

    def sweep(s, prof, eje, mat, t0=None, t1=None, suave=False):
        """Perfil cerrado barrido a lo largo de un eje. prof en coordenadas del generador:
        eje x -> (y, z); eje y -> (x, z); eje z -> (x, y). Longitud unidad (se escala al colocar)."""
        t0 = (-0.5 if eje == 'x' else 0.0) if t0 is None else t0
        t1 = (0.5 if eje == 'x' else 1.0) if t1 is None else t1
        ab = [(p[1], p[0]) if eje == 'y' else (p[0], p[1]) for p in prof]
        mats = mat if isinstance(mat, (list, tuple)) else [mat] * len(ab)
        edges = [(ab[i], ab[(i + 1) % len(ab)], mats[i]) for i in range(len(ab))]
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b, _ in edges)
        if area < 0:
            edges = [(b, a, m) for a, b, m in reversed(edges)]
        pt = {'x': lambda a, b, t: (t, a, b), 'y': lambda a, b, t: (b, t, a), 'z': lambda a, b, t: (a, b, t)}[eje]
        for a, b, m in edges:
            s.quad(pt(*a, t0), pt(*b, t0), pt(*b, t1), pt(*a, t1), m, uv=UV_FULL, suave=suave)
        return s

def S(prof, k):   # escalar un perfil
    return [(a * k, b * k) for a, b in prof]

