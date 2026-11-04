# Fachada del kit de escaparates + construcción en Blender (ver kit_base.py para las medidas y el constructor de módulos).
import bpy, bmesh, math, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_base import *   # noqa: F401,F403
from kit_base import MODULOS, MATERIALES, Mod, P, S, UV_FULL, RAIZ, ARGS
from kit_base import FAMILIAS_INTERIOR
from kit_base import W0, H0, D0, REMETIDO, PROF_MIN, PROF_MAX, CAPAS_Z, CAPAS_FRAC, ZOCALO_H, PUERTA_W, PUERTA_H, ROTULO_H, N_RAYAS

# ================================================================ 1. MARCOS (perfiles barridos)
# Perfil (across, out) centrado en el plano del vidrio; across -> ancho visto de frente.
PERFILES = {
    'aluminio': [(-.035, -.045), (.035, -.045), (.035, .045), (.045, .045), (.045, .065), (-.045, .065), (-.045, .045), (-.035, .045)],
    'madera':   [(-.06, -.05), (.06, -.05), (.06, .03), (.045, .03), (.045, .06), (-.045, .06), (-.045, .03), (-.06, .03)],
    'forja':    [(-.025, -.03), (.025, -.03), (.025, .03), (-.025, .03)],
    'piedra':   [(-.12, 0), (.12, 0), (.12, .06), (.08, .06), (.08, .10), (-.08, .10), (-.08, .06), (-.12, .06)],
}
ANCHO_PERFIL = {'aluminio': .09, 'madera': .12, 'forja': .05, 'piedra': .24}
for estilo, prof in PERFILES.items():
    mat = 'ss_tinte2' if estilo == 'piedra' else 'ss_marco'
    nota = {'aluminio': 'perfil fino de aluminio/hierro', 'madera': 'carpintería de madera con moldura', 'forja': 'ventanal metálico de despiece fino', 'piedra': 'recercado de piedra proyectado sobre el muro (z=0)'}[estilo]
    Mod(f'marco.{estilo}.jamba', 'marco', 'y', (1, H0, 1), nota + ' · jamba vertical').sweep(prof, 'y', mat)
    Mod(f'marco.{estilo}.dintel', 'marco', 'x', (W0, 1, 1), nota + ' · dintel horizontal').sweep(prof, 'x', mat)
    fino = S(prof, 0.7)
    Mod(f'marco.{estilo}.montante', 'marco', 'y', (1, H0, 1), nota + ' · montante intermedio').sweep(fino, 'y', mat)
    Mod(f'marco.{estilo}.travesano', 'marco', 'x', (W0, 1, 1), nota + ' · travesaño/imposta').sweep(fino, 'x', mat)
# Clave de arco de piedra y alféizar
m = Mod('marco.piedra.clave', 'marco', 'fijo', (1, 1, 1), 'clave/ménsula del dintel de piedra: 0,24×0,24, sale 0,14; origen en la arista inferior del dintel')
m.box(-.12, 0, 0, .12, .24, .14, 'ss_tinte2', skip=('-z', '-y'))

# ================================================================ 2. HUECO REMETIDO (jambas, dintel y alféizar del cierre hundido)
m = Mod('hueco.jamba_izq', 'hueco', 'y', (1, H0, 1), f'jamba izquierda del hueco: cara hacia +x, profundidad {REMETIDO} m')
m.quad((0, 0, 0), (0, 0, -REMETIDO), (0, 1, -REMETIDO), (0, 1, 0), 'ss_tinte2', n=(1, 0, 0))
m = Mod('hueco.jamba_der', 'hueco', 'y', (1, H0, 1), 'jamba derecha del hueco: cara hacia -x')
m.quad((0, 0, 0), (0, 0, -REMETIDO), (0, 1, -REMETIDO), (0, 1, 0), 'ss_tinte2', n=(-1, 0, 0))
m = Mod('hueco.dintel', 'hueco', 'x', (W0, 1, 1), 'intradós del dintel (cara hacia abajo)')
m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 0, -REMETIDO), (-.5, 0, -REMETIDO), 'ss_tinte2', n=(0, -1, 0))
m = Mod('hueco.alfeizar', 'hueco', 'x', (W0, 1, 1), 'plano inferior del hueco (cara hacia arriba)')
m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 0, -REMETIDO), (-.5, 0, -REMETIDO), 'ss_tinte2', n=(0, 1, 0))

# ================================================================ 3. ZÓCALOS (barridos en X, altura 0,5)
Mod('zocalo.liso', 'zocalo', 'x', (W0, 1, 1), 'zócalo liso 0,50 m').sweep(
    [(0, -.06), (0, .05), (ZOCALO_H, .05), (ZOCALO_H, -.06)], 'x', 'ss_marco')
Mod('zocalo.panel', 'zocalo', 'x', (W0, 1, 1), 'zócalo con panel remetido entre rodapié y cornisilla').sweep(
    [(0, -.06), (0, .05), (.08, .05), (.08, .03), (.44, .03), (.44, .05), (.5, .05), (.5, -.06)], 'x', 'ss_marco')
Mod('zocalo.piedra', 'zocalo', 'x', (W0, 1, 1), 'zócalo de piedra en tres hiladas con junta marcada').sweep(
    [(0, -.06), (0, .05), (.15, .05), (.15, .035), (.16, .035), (.16, .05), (.31, .05), (.31, .035), (.32, .035), (.32, .05), (.5, .05), (.5, -.06)], 'x', 'ss_tinte2')
Mod('zocalo.bisel', 'zocalo', 'x', (W0, 1, 1), 'zócalo biselado (cantonera inclinada)').sweep(
    [(0, -.06), (0, .06), (.40, .06), (.50, .02), (.50, -.06)], 'x', 'ss_marco')

# ================================================================ 4. PUERTAS (fijas; escala X admitida 0,9–1,4)
def hoja_vidrio(m, x0, x1, y0, y1, z=0.0):
    m.quad((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), 'ss_vidrio_escaparate', n=(0, 0, 1))

m = Mod('puerta.cristal', 'puerta', 'fijo', (1, 1, 1), 'hoja de cristal con marco fino, barra tirador y zócalo metálico (1,10×2,30)')
w, h, t = PUERTA_W, PUERTA_H, .06
for (a, b, c, d) in [(-w / 2, 0, -w / 2 + t, h), (w / 2 - t, 0, w / 2, h), (-w / 2 + t, h - t, w / 2 - t, h), (-w / 2 + t, 0, w / 2 - t, .22)]:
    m.box(a, b, -.025, c, d, .025, 'ss_marco')
hoja_vidrio(m, -w / 2 + t, w / 2 - t, .22, h - t)
m.box(w / 2 - .20, 1.0, .03, w / 2 - .17, 1.55, .06, 'ss_metal')

m = Mod('puerta.madera_vidrio', 'puerta', 'fijo', (1, 1, 1), 'hoja de madera con panel inferior moldurado y vidrio superior')
w, h, t = PUERTA_W, PUERTA_H, .09
for (a, b, c, d) in [(-w / 2, 0, -w / 2 + t, h), (w / 2 - t, 0, w / 2, h), (-w / 2 + t, h - t, w / 2 - t, h), (-w / 2 + t, 0, w / 2 - t, .10), (-w / 2 + t, .92, w / 2 - t, 1.00)]:
    m.box(a, b, -.03, c, d, .03, 'ss_marco')
m.box(-w / 2 + t, .10, -.015, w / 2 - t, .92, .015, 'ss_marco')               # panel bajo
m.box(-w / 2 + t + .06, .16, .015, w / 2 - t - .06, .86, .030, 'ss_marco')    # moldura aplicada
hoja_vidrio(m, -w / 2 + t, w / 2 - t, 1.00, h - t)
m.box(w / 2 - .20, 1.0, .035, w / 2 - .16, 1.20, .07, 'ss_metal')

m = Mod('puerta.doble', 'puerta', 'fijo', (1, 1, 1), 'puerta doble de cristal, 1,80×2,30, montante central')
w, h, t = 1.8, PUERTA_H, .06
for (a, b, c, d) in [(-w / 2, 0, -w / 2 + t, h), (w / 2 - t, 0, w / 2, h), (-w / 2 + t, h - t, w / 2 - t, h), (-.03, 0, .03, h), (-w / 2 + t, 0, -.03, .22), (.03, 0, w / 2 - t, .22)]:
    m.box(a, b, -.025, c, d, .025, 'ss_marco')
hoja_vidrio(m, -w / 2 + t, -.03, .22, h - t); hoja_vidrio(m, .03, w / 2 - t, .22, h - t)
m.box(-.10, 1.0, .03, -.07, 1.55, .06, 'ss_metal'); m.box(.07, 1.0, .03, .10, 1.55, .06, 'ss_metal')

m = Mod('puerta.metal_ciega', 'puerta', 'fijo', (1, 1, 1), 'puerta de servicio: hoja metálica ciega con mirilla y zócalo (1,00×2,10)')
w, h = 1.0, 2.1
m.box(-w / 2, 0, -.03, w / 2, h, .03, 'ss_marco', skip=('-z',))
m.box(-w / 2 + .1, 0, .03, w / 2 - .1, .30, .045, 'ss_metal')
m.box(-.15, 1.35, .03, .15, 1.65, .045, 'ss_metal')
hoja_vidrio(m, -.12, .12, 1.38, 1.62, z=.047)
m.box(w / 2 - .18, 1.0, .03, w / 2 - .14, 1.25, .065, 'ss_metal')

# ================================================================ 5. VIDRIO
m = Mod('vidrio.pano', 'vidrio', 'xy', (W0, H0, 1), 'paño de vidrio unidad (escala X=ancho, Y=alto); material BLEND compartido')
m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_vidrio_escaparate', n=(0, 0, 1))

# ================================================================ 6. RÓTULOS, CORNISAS Y BANDERAS
m = Mod('rotulo.fascia', 'rotulo', 'x', (W0, 1, 1), f'banda de rótulo {ROTULO_H} m con filetes; frente UV 0-1 sobre la celda del atlas de rótulos')
m.box(-.5, 0, 0, .5, .04, .09, 'ss_marco', skip=('-z', '+x', '-x'))
m.box(-.5, ROTULO_H - .04, 0, .5, ROTULO_H, .09, 'ss_marco', skip=('-z', '+x', '-x'))
m.quad((-.5, .04, .07), (.5, .04, .07), (.5, ROTULO_H - .04, .07), (-.5, ROTULO_H - .04, .07), 'ss_letrero', n=(0, 0, 1))
m.quad((-.5, .04, .0), (-.5, .04, .07), (-.5, ROTULO_H - .04, .07), (-.5, ROTULO_H - .04, 0), 'ss_marco', n=(-1, 0, 0))
m.quad((.5, .04, .0), (.5, .04, .07), (.5, ROTULO_H - .04, .07), (.5, ROTULO_H - .04, 0), 'ss_marco', n=(1, 0, 0))

m = Mod('rotulo.cajon', 'rotulo', 'x', (W0, 1, 1), 'rótulo de cajón 0,60 m con cantos de 0,18 m; frente UV 0-1')
m.box(-.5, 0, 0, .5, .60, .18, 'ss_marco', skip=('-z', '+z'))
m.quad((-.5, 0, .18), (.5, 0, .18), (.5, .60, .18), (-.5, .60, .18), 'ss_letrero', n=(0, 0, 1))

Mod('cornisa.simple', 'cornisa', 'x', (W0, 1, 1), 'cornisa escalonada de 0,20 m de vuelo').sweep(
    [(0, 0), (0, .10), (.04, .10), (.04, .14), (.10, .14), (.10, .18), (.18, .18), (.18, 0)], 'x', 'ss_tinte2')
m = Mod('cornisa.dentada', 'cornisa', 'x', (W0, 1, 1), 'cornisa con friso de 18 dentículos')
m.sweep([(.06, 0), (.06, .10), (.10, .10), (.10, .14), (.16, .14), (.16, .18), (.24, .18), (.24, 0)], 'x', 'ss_tinte2')
for i in range(18):
    a = -.5 + (i + .25) / 18; b = -.5 + (i + .75) / 18
    m.box(a, 0, .10, b, .06, .14, 'ss_tinte2', skip=('-z', '+y'))

def soporte(m, largo=.75):
    m.box(-.05, -.07, 0, .05, .05, .02, 'ss_metal', skip=('-z',))
    m.box(-.015, -.02, .02, .015, .02, largo, 'ss_metal')
    m.poly([(-.008, -.02, .03), (.008, -.02, .03), (.008, -.30, largo * .55), (-.008, -.30, largo * .55)], 'ss_metal', n=(1, 0, 0))
    m.poly([(.008, -.02, .03), (-.008, -.02, .03), (-.008, -.30, largo * .55), (.008, -.30, largo * .55)], 'ss_metal', n=(-1, 0, 0))

def panel_doble(m, pts, mat='ss_letrero', filo='ss_marco', esp=.025):
    """Placa vertical (plano YZ) con dos caras UV 0-1 y canto; pts = contorno convexo (y,z)."""
    ys = [p[0] for p in pts]; zs = [p[1] for p in pts]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
    uvf = lambda p: ((p[1] - z0) / (z1 - z0 or 1), (p[0] - y0) / (y1 - y0 or 1))
    for sx in (-1, 1):
        m.poly([(sx * esp, p[0], p[1]) for p in pts], mat, [uvf(p) if sx > 0 else (1 - uvf(p)[0], uvf(p)[1]) for p in pts], n=(sx, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        my, mz = (a[0] + b[0]) / 2 - cy, (a[1] + b[1]) / 2 - cz
        m.poly([(-esp, a[0], a[1]), (esp, a[0], a[1]), (esp, b[0], b[1]), (-esp, b[0], b[1])], filo, n=(0, my, mz))
    return m

m = Mod('bandera.cuadrada', 'bandera', 'fijo', (1, 1, 1), 'rótulo de bandera cuadrado 0,55 m con ménsula (cuelga bajo el brazo)')
soporte(m)
panel_doble(m, [(-.62, .15), (-.62, .70), (-.07, .70), (-.07, .15)])
m = Mod('bandera.circulo', 'bandera', 'fijo', (1, 1, 1), 'rótulo de bandera circular Ø0,55 m con ménsula')
soporte(m)
panel_doble(m, [(-.345 + .275 * math.sin(2 * math.pi * k / 20), .425 + .275 * math.cos(2 * math.pi * k / 20)) for k in range(20)])
m = Mod('bandera.cartela', 'bandera', 'fijo', (1, 1, 1), 'rótulo de bandera con cartela de esquinas cortadas 0,50×0,70')
soporte(m)
panel_doble(m, [(-.70, .20), (-.70, .60), (-.62, .68), (-.18, .68), (-.10, .60), (-.10, .20), (-.18, .12), (-.62, .12)])
m = Mod('bandera.cruz', 'bandera', 'fijo', (1, 1, 1), 'cruz luminosa de 0,60 m (verde neón, sin marca)')
soporte(m)
a, b = .10, .30   # semibrazo central / semilargo
c0y, c0z = -.40, .425
cruz = [(b, a), (a, a), (a, b), (-a, b), (-a, a), (-b, a), (-b, -a), (-a, -a), (-a, -b), (a, -b), (a, -a), (b, -a)]
cruz = [(c0y + p[1], c0z + p[0]) for p in cruz]
panel_doble(m, cruz, mat='ss_neon', filo='ss_neon', esp=.03)

# ================================================================ 7. TOLDOS (origen: arranque en el muro, y=0, z=0)
def franjas(m, trazo, x_ini=-.5, n=N_RAYAS):
    """trazo: lista de puntos (y,z) a lo largo de la lona (de la pared hacia fuera). Franjas alternas a/b."""
    for i in range(n):
        x0 = x_ini + i / n; x1 = x_ini + (i + 1) / n
        mat = 'ss_toldo_a' if i % 2 == 0 else 'ss_toldo_b'
        for k in range(len(trazo) - 1):
            (y0, z0), (y1, z1) = trazo[k], trazo[k + 1]
            m.quad((x0, y0, z0), (x0, y1, z1), (x1, y1, z1), (x1, y0, z0), mat, uv=UV_FULL, suave=True if len(trazo) > 2 else False)

def cheeks(m, perfil, mat='ss_toldo_b'):
    for sx in (-.5, .5):
        m.poly([(sx, y, z) for y, z in perfil], mat, n=(sx * 2, 0, 0), suave=False)

def volante(m, yf, zf, alto, mats=True, n=N_RAYAS):
    for i in range(n):
        x0 = -.5 + i / n; x1 = -.5 + (i + 1) / n
        m.quad((x0, yf - alto, zf), (x1, yf - alto, zf), (x1, yf, zf), (x0, yf, zf), 'ss_toldo_a' if i % 2 == 0 else 'ss_toldo_b', n=(0, 0, 1))

m = Mod('toldo.recto', 'toldo', 'x', (W0, 1, 1), 'toldo recto inclinado: vuelo 1,10 m, caída 0,55 m y volante 0,25 m')
franjas(m, [(0, 0), (-.55, 1.10)]); volante(m, -.55, 1.10, .25)
cheeks(m, [(0, 0), (-.55, 1.10), (-.80, 1.10), (-.80, 0)])
m.box(-.5, -.04, 0, .5, .04, .08, 'ss_metal', skip=('-z', '+x', '-x'))

arco = [(-.80 * (1 - math.cos(math.radians(a))), 1.0 * math.sin(math.radians(a))) for a in range(0, 91, 15)]
m = Mod('toldo.capota', 'toldo', 'x', (W0, 1, 1), 'toldo de capota en cuarto de círculo: vuelo 1,0 m, caída 0,80 m (sombreado suave)')
franjas(m, arco)
cheeks(m, arco + [(arco[-1][0], 0)])
m.box(-.5, -.04, 0, .5, .04, .08, 'ss_metal', skip=('-z', '+x', '-x'))

m = Mod('toldo.cajon', 'toldo', 'x', (W0, 1, 1), 'toldo retráctil con cofre 0,14×0,12: vuelo 1,70 m, caída 0,66 m, brazos metálicos')
m.box(-.5, -.12, 0, .5, 0, .14, 'ss_marco', skip=('-z', '+x', '-x'))
franjas(m, [(-.12, .14), (-.78, 1.70)]); volante(m, -.78, 1.70, .16)
cheeks(m, [(-.12, .14), (-.78, 1.70), (-.94, 1.70), (-.94, .14)])
m.box(-.5, -.82, 1.66, .5, -.78, 1.72, 'ss_metal', skip=('-z', '+x', '-x'))

m = Mod('toldo.festoneado', 'toldo', 'x', (W0, 1, 1), 'toldo recto con volante festoneado (12 medias lunas)')
franjas(m, [(0, 0), (-.55, 1.10)])
for i in range(N_RAYAS):
    x0 = -.5 + i / N_RAYAS; x1 = -.5 + (i + 1) / N_RAYAS; xm = (x0 + x1) / 2; r = (x1 - x0) / 2
    fan = [(x1, -.55, 1.10)] + [(xm + r * math.cos(math.pi * k / 6), -.55 - .22 * math.sin(math.pi * k / 6), 1.10) for k in range(1, 6)] + [(x0, -.55, 1.10)]
    m.poly(fan, 'ss_toldo_a' if i % 2 == 0 else 'ss_toldo_b', [(0, 0)] * len(fan), n=(0, 0, 1))
cheeks(m, [(0, 0), (-.55, 1.10), (-.80, 1.10), (-.80, 0)])
m.box(-.5, -.04, 0, .5, .04, .08, 'ss_metal', skip=('-z', '+x', '-x'))

m = Mod('toldo.marquesina', 'toldo', 'x', (W0, 1, 1), 'marquesina plana de vidrio sobre perfil de acero: vuelo 1,0 m, canto 0,10 m')
m.quad((-.5, 0, 0), (-.5, -.05, 1.0), (.5, -.05, 1.0), (.5, 0, 0), 'ss_vidrio_escaparate', n=(0, 1, .05))
m.box(-.5, -.15, .96, .5, -.05, 1.0, 'ss_metal', skip=('-z', '+x', '-x'))
m.box(-.5, -.08, 0, .5, .0, .06, 'ss_metal', skip=('-z', '+x', '-x'))

# ================================================================ 8. PERSIANAS
m = Mod('persiana.panel', 'persiana', 'xy', (W0, H0, 1), 'persiana cerrada: quad unidad con la tira de persiana del atlas (escala Y = lo bajada que esté)')
m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_persiana', n=(0, 0, 1))
Mod('persiana.cajon', 'persiana', 'x', (W0, 1, 1), 'cajón del rollo 0,30×0,24 sobre el dintel').sweep(
    [(0, 0), (0, .24), (.26, .24), (.30, .20), (.30, 0)], 'x', 'ss_metal')
Mod('persiana.guia', 'persiana', 'y', (1, H0, 1), 'guía lateral en U (0,08×0,05)').sweep(
    [(-.04, 0), (-.04, .05), (-.025, .05), (-.025, .015), (.025, .015), (.025, .05), (.04, .05), (.04, 0)], 'y', 'ss_metal')

# ================================================================ 9. CAJAS SOMERAS (interior; escala x=ancho, y=alto, z=profundidad)
def caja_base(m, poli_suelo, laterales, fondos, techo=True):
    fz = max(-p[1] for p in poli_suelo) or 1.0   # normaliza el fondo a 0-1 (la alcoba pasa de 1 m)
    uvp = lambda x, z: (x + .5, -z / fz)
    m.poly([(p[0], 0, p[1]) for p in poli_suelo], 'ss_int_suelo', [uvp(p[0], p[1]) for p in poli_suelo], n=(0, 1, 0))
    if techo:
        m.poly([(p[0], 1, p[1]) for p in poli_suelo], 'ss_int_techo', [uvp(p[0], p[1]) for p in poli_suelo], n=(0, -1, 0))
    for (a, b, hacia) in laterales:   # tramos de pared (a,b = (x,z)); u = profundidad normalizada
        m.poly([(a[0], 0, a[1]), (b[0], 0, b[1]), (b[0], 1, b[1]), (a[0], 1, a[1])], 'ss_int_lateral',
               [(-a[1] / fz, 0), (-b[1] / fz, 0), (-b[1] / fz, 1), (-a[1] / fz, 1)], n=(hacia, 0, 0))
    for (a, b) in fondos:
        m.poly([(a[0], 0, a[1]), (b[0], 0, b[1]), (b[0], 1, b[1]), (a[0], 1, a[1])], 'ss_int_fondo',
               [(a[0] + .5, 0), (b[0] + .5, 0), (b[0] + .5, 1), (a[0] + .5, 1)], n=(0, 0, 1))

m = Mod('caja.recta', 'caja', 'xyz', (W0, H0, D0), 'caja somera de cinco caras: ancho×alto×fondo unidad (0,5/-0,5; 0/1; 0/-1)')
caja_base(m, [(-.5, 0), (.5, 0), (.5, -1), (-.5, -1)], [((-.5, 0), (-.5, -1), 1), ((.5, -1), (.5, 0), -1)], [((-.5, -1), (.5, -1))])

c = .10  # chaflán en x
m = Mod('caja.biselada', 'caja', 'xyz', (W0, H0, D0), 'esquinas del fondo achaflanadas (evita la costura dura del rincón)')
caja_base(m, [(-.5, 0), (.5, 0), (.5, -1 + .20), (.5 - c, -1), (-.5 + c, -1), (-.5, -1 + .20)],
          [((-.5, 0), (-.5, -1 + .20), 1), ((.5, -1 + .20), (.5, 0), -1)],
          [((-.5, -1 + .20), (-.5 + c, -1)), ((-.5 + c, -1), (.5 - c, -1)), ((.5 - c, -1), (.5, -1 + .20))])

m = Mod('caja.fondo_curvo', 'caja', 'xyz', (W0, H0, D0), 'fondo en tres facetas (aspecto de ábside suave)')
caja_base(m, [(-.5, 0), (.5, 0), (.5, -.82), (.22, -1), (-.22, -1), (-.5, -.82)],
          [((-.5, 0), (-.5, -.82), 1), ((.5, -.82), (.5, 0), -1)],
          [((-.5, -.82), (-.22, -1)), ((-.22, -1), (.22, -1)), ((.22, -1), (.5, -.82))])

m = Mod('caja.nicho_central', 'caja', 'xyz', (W0, H0, D0), 'fondo con alcoba central de 0,16 m de hondo (almacén/trastienda sugerida, cerrada)')
caja_base(m, [(-.5, 0), (.5, 0), (.5, -1), (.2, -1), (.2, -1.12), (-.2, -1.12), (-.2, -1), (-.5, -1)],
          [((-.5, 0), (-.5, -1), 1), ((.5, -1), (.5, 0), -1), ((.2, -1), (.2, -1.12), -1), ((-.2, -1.12), (-.2, -1), 1)],
          [((-.5, -1), (-.2, -1)), ((-.2, -1.12), (.2, -1.12)), ((.2, -1), (.5, -1))])

m = Mod('caja.cenefa', 'caja', 'x', (W0, 1, 1), 'cenefa frontal de 0,36 m con franja de luz de 0,05 m (oculta la unión techo/vidrio); origen en su arista inferior')
m.quad((-.5, .05, -.02), (.5, .05, -.02), (.5, .41, -.02), (-.5, .41, -.02), 'ss_marco', n=(0, 0, 1))
m.quad((-.5, 0, -.02), (.5, 0, -.02), (.5, .05, -.02), (-.5, .05, -.02), 'ss_luz_franja', n=(0, 0, 1))

# ================================================================ 10. CAPAS RECORTADAS (z=0, ancho 1, alto 1; escala z = profundidad de la curvatura)
m = Mod('capa.plana', 'capa', 'xy', (W0, H0, 1), 'capa recortada plana (MASK); es la de commerce-scene.js')
m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_int_capa', n=(0, 0, 1))

def capa_facetas(m, puntos_xz, suave=False):
    for i in range(len(puntos_xz) - 1):
        (xa, za), (xb, zb) = puntos_xz[i], puntos_xz[i + 1]
        m.quad((xa, 0, za), (xb, 0, zb), (xb, 1, zb), (xa, 1, za), 'ss_int_capa', uv=((xa + .5, 0), (xb + .5, 0), (xb + .5, 1), (xa + .5, 1)), n=(0, 0, 1), suave=suave)
m = Mod('capa.curva', 'capa', 'xyz', (W0, H0, 1), 'capa cóncava de 8 tramos (bordes adelantados 0,12·Z); quita el aspecto de cartulina')
capa_facetas(m, [(-.5 + k / 8, -.12 * (1 - (2 * (k / 8 - .5)) ** 2)) for k in range(9)], suave=True)
m = Mod('capa.quebrada', 'capa', 'xyz', (W0, H0, 1), 'capa de tres facetas con alas atrás 0,15·Z (cierra el borde visto en oblicuo)')
capa_facetas(m, [(-.5, -.15), (-.30, 0), (.30, 0), (.5, -.15)])
m = Mod('capa.con_pie', 'capa', 'xyz', (W0, H0, 1), 'capa plana con zócalo de sombra de 0,18 m en el suelo (asienta la capa)')
m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_int_capa', n=(0, 0, 1))
m.quad((-.5, .004, 0), (.5, .004, 0), (.5, .004, .18), (-.5, .004, .18), 'ss_int_suelo', uv=((0, .0), (1, .0), (1, .12), (0, .12)), n=(0, 1, 0))

def nicho(m, estantes):
    h = .22   # profundidad (se escala con Z) ; fondo, laterales, techo, suelo
    m.quad((-.5, 0, -h), (.5, 0, -h), (.5, 1, -h), (-.5, 1, -h), 'ss_int_capa', n=(0, 0, 1))
    m.poly([(-.5, 0, 0), (-.5, 0, -h), (-.5, 1, -h), (-.5, 1, 0)], 'ss_int_lateral', [(0, 0), (1, 0), (1, 1), (0, 1)], n=(1, 0, 0))
    m.poly([(.5, 0, -h), (.5, 0, 0), (.5, 1, 0), (.5, 1, -h)], 'ss_int_lateral', [(1, 0), (0, 0), (0, 1), (1, 1)], n=(-1, 0, 0))
    m.poly([(-.5, 0, 0), (.5, 0, 0), (.5, 0, -h), (-.5, 0, -h)], 'ss_int_suelo', [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, 1, 0))
    m.poly([(-.5, 1, -h), (.5, 1, -h), (.5, 1, 0), (-.5, 1, 0)], 'ss_int_techo', [(0, 1), (1, 1), (1, 0), (0, 0)], n=(0, -1, 0))
    for y in estantes:
        e = .008
        m.poly([(-.5, y, 0), (.5, y, 0), (.5, y, -h), (-.5, y, -h)], 'ss_int_suelo', [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, 1, 0))
        m.poly([(-.5, y - e, -h), (.5, y - e, -h), (.5, y - e, 0), (-.5, y - e, 0)], 'ss_int_techo', [(0, 1), (1, 1), (1, 0), (0, 0)], n=(0, -1, 0))
        m.poly([(-.5, y - e, 0), (.5, y - e, 0), (.5, y, 0), (-.5, y, 0)], 'ss_marco', n=(0, 0, 1))
m = Mod('nicho.liso', 'nicho', 'xyz', (1.2, 2.0, 1), 'hornacina empotrada de 0,22·Z con fondo pintado (cuerpo cerrado: 5 caras)')
nicho(m, [])
m = Mod('nicho.estantes', 'nicho', 'xyz', (1.2, 2.0, 1), 'hornacina empotrada con 3 baldas de obra (paralaje real entre baldas)')
nicho(m, [.25, .50, .75])

# ================================================================ 11. VINILOS Y CARTELES DEL VIDRIO
def decal(m, w, h, mat, centrado_base=True):
    m.quad((-w / 2, 0, .004), (w / 2, 0, .004), (w / 2, h, .004), (-w / 2, h, .004), mat, n=(0, 0, 1))
decal(Mod('vinilo.cartel', 'vinilo', 'fijo', (1, 1, 1), 'cartel de lema 0,45×0,30 (celda de lema del atlas)'), .45, .30, 'ss_vinilo_lema')
decal(Mod('vinilo.estado', 'vinilo', 'fijo', (1, 1, 1), 'cartel Abierto/Cerrado 0,28×0,16'), .28, .16, 'ss_vinilo_estado')
decal(Mod('vinilo.esquina', 'vinilo', 'fijo', (1, 1, 1), 'vinilo de esquina 0,50×0,50'), .50, .50, 'ss_vinilo_lema')
m = Mod('vinilo.banda', 'vinilo', 'x', (W0, 1, 1), 'banda esmerilada 0,30 m (privacidad, a la altura de los ojos)')
m.quad((-.5, 0, .004), (.5, 0, .004), (.5, .30, .004), (-.5, .30, .004), 'ss_vinilo_banda', n=(0, 0, 1))

# ================================================================ 12. UMBRAL Y DETALLES
Mod('umbral.escalon', 'detalle', 'x', (PUERTA_W + .3, 1, 1), 'peldaño de umbral 0,05 m (sale 0,20 m, entra 0,35 m)').sweep(
    [(0, -.35), (0, .20), (.05, .20), (.05, -.35)], 'x', 'ss_tinte2')
Mod('repisa.alfeizar', 'detalle', 'x', (W0, 1, 1), 'alféizar de piedra bajo el vidrio con goterón').sweep(
    [(0, -.10), (0, .12), (.04, .12), (.07, .10), (.07, -.10)], 'x', 'ss_tinte2')
m = Mod('rejilla.ventilacion', 'detalle', 'fijo', (1, 1, 1), 'rejilla de ventilación 0,50×0,14 con 5 lamas')
m.box(-.25, 0, 0, .25, .14, .025, 'ss_metal', skip=('-z', '+z'))
for i in range(5):
    y = .015 + i * .022
    m.box(-.23, y, 0.005, .23, y + .012, .03, 'ss_marco', skip=('-z',))

# ---------------------------------------------------------------- kits (preajustes de gramática)
KITS = [
    dict(id='clasico_piedra', etiqueta='Clásico de piedra', perfiles=['historico', 'espana'],
         afines=['panaderia', 'libreria', 'servicios', 'cafe', 'bazar'],
         marco='piedra', zocalo='zocalo.piedra', puerta='puerta.madera_vidrio', rotulo='rotulo.fascia', cornisa='cornisa.dentada',
         toldos=['toldo.recto', 'toldo.festoneado', None], bandera='bandera.cartela', caja=['caja.recta', 'caja.biselada'], cenefa=True, capas=['capa.plana', 'capa.quebrada'], persiana='persiana.cajon'),
    dict(id='madera_barrio', etiqueta='Madera de barrio', perfiles=['historico', 'espana', 'latam'],
         afines=['panaderia', 'carniceria', 'fruteria', 'cafe', 'restaurante', 'bazar'],
         marco='madera', zocalo='zocalo.panel', puerta='puerta.madera_vidrio', rotulo='rotulo.cajon', cornisa=None,
         toldos=['toldo.recto', 'toldo.capota', None], bandera='bandera.circulo', caja=['caja.recta', 'caja.nicho_central'], cenefa=False, capas=['capa.plana', 'capa.curva'], persiana='persiana.guia'),
    dict(id='moderno_aluminio', etiqueta='Moderno de aluminio', perfiles=['moderno', 'espana', 'latam'],
         afines=['ropa', 'electronica', 'optica', 'belleza', 'servicios', 'calzado'],
         marco='aluminio', zocalo='zocalo.bisel', puerta='puerta.cristal', rotulo='rotulo.cajon', cornisa=None,
         toldos=[None, 'toldo.marquesina'], bandera='bandera.cuadrada', caja=['caja.recta', 'caja.fondo_curvo'], cenefa=True, capas=['capa.curva', 'capa.con_pie'], persiana='persiana.cajon'),
    dict(id='escaparate_ancho', etiqueta='Escaparate ancho sin zócalo', perfiles=['moderno'],
         afines=['ropa', 'calzado', 'optica', 'electronica'],
         marco='aluminio', zocalo=None, puerta='puerta.doble', rotulo='rotulo.fascia', cornisa=None,
         toldos=[None], bandera=None, caja=['caja.biselada', 'caja.recta'], cenefa=True, capas=['capa.con_pie', 'capa.plana'], persiana='persiana.cajon'),
    dict(id='latam_reja', etiqueta='Latam con cortina y capota', perfiles=['latam'],
         afines=['fruteria', 'supermercado', 'bazar', 'belleza', 'restaurante', 'electronica'],
         marco='forja', zocalo='zocalo.liso', puerta='puerta.metal_ciega', rotulo='rotulo.cajon', cornisa=None,
         toldos=['toldo.capota', 'toldo.cajon'], bandera='bandera.cuadrada', caja=['caja.recta', 'caja.nicho_central'], cenefa=False, capas=['capa.plana', 'capa.curva'], persiana='persiana.panel'),
    dict(id='farmacia_cruz', etiqueta='Farmacia con cruz', perfiles=['moderno', 'espana', 'latam'],
         afines=['farmacia', 'optica'],
         marco='aluminio', zocalo='zocalo.bisel', puerta='puerta.cristal', rotulo='rotulo.fascia', cornisa=None,
         toldos=['toldo.marquesina', None], bandera='bandera.cruz', caja=['caja.recta', 'caja.fondo_curvo'], cenefa=True, capas=['capa.plana', 'capa.con_pie'], persiana='persiana.cajon'),
    dict(id='cafe_terraza', etiqueta='Café con toldo de cofre', perfiles=['historico', 'espana', 'latam'],
         afines=['cafe', 'restaurante', 'panaderia'],
         marco='madera', zocalo='zocalo.liso', puerta='puerta.doble', rotulo='rotulo.fascia', cornisa='cornisa.simple',
         toldos=['toldo.cajon', 'toldo.festoneado'], bandera='bandera.circulo', caja=['caja.biselada', 'caja.fondo_curvo'], cenefa=True, capas=['capa.quebrada', 'capa.plana'], persiana='persiana.guia'),
    dict(id='mercado_vitrina', etiqueta='Mercado con hornacinas', perfiles=['historico', 'latam', 'espana'],
         afines=['carniceria', 'fruteria', 'floristeria', 'supermercado'],
         marco='forja', zocalo='zocalo.piedra', puerta='puerta.madera_vidrio', rotulo='rotulo.cajon', cornisa=None,
         toldos=['toldo.festoneado', 'toldo.recto'], bandera='bandera.cuadrada', caja=['caja.nicho_central', 'caja.recta'], cenefa=False, capas=['capa.curva', 'capa.plana'], persiana='persiana.panel', nichos=2),
]

# ================================================================ construcción en Blender
def crear_materiales():
    out = {}
    for nombre, d in MATERIALES.items():
        mat = bpy.data.materials.new(nombre)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        r, g, b = d['color']
        mat.diffuse_color = (r, g, b, d.get('alfa', 1.0))
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
            bsdf.inputs['Roughness'].default_value = .85
            bsdf.inputs['Metallic'].default_value = d.get('metal', 0.0)
            bsdf.inputs['Alpha'].default_value = d.get('alfa', 1.0)
            if d.get('emisivo'):
                bsdf.inputs['Emission Color'].default_value = (r, g, b, 1)
                bsdf.inputs['Emission Strength'].default_value = d['emisivo']
        mat['ss_rol'] = d['rol']
        out[nombre] = mat
    return out

def malla(mod, mats):
    nombres = []
    for f in mod.faces:
        if f[1] not in nombres:
            nombres.append(f[1])
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); cl = bm.loops.layers.color.new('Color'); vmap = {}
    def vert(p):
        k = tuple(round(c, 5) for c in p)
        if k not in vmap:
            vmap[k] = bm.verts.new(P(*p))
        return vmap[k]
    tris = 0
    for pts, mat, uv, suave, col in mod.faces:
        vs = [vert(p) for p in pts]
        if len(set(id(v) for v in vs)) != len(vs):
            continue
        try:
            fc = bm.faces.new(vs)
        except ValueError:
            continue
        fc.material_index = nombres.index(mat); fc.smooth = bool(suave)
        for lp, u in zip(fc.loops, uv):
            lp[uvl].uv = u
            c = col if col is not None else (1.0, 1.0, 1.0)
            lp[cl] = (c[0], c[1], c[2], 1.0)
        tris += len(pts) - 2
    bm.normal_update()
    me = bpy.data.meshes.new(mod.id)
    bm.to_mesh(me); bm.free()
    ca = me.color_attributes.get('Color')
    if ca is not None:
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = list(me.color_attributes).index(ca)
    for n in nombres:
        me.materials.append(mats[n])
    return me, nombres, tris

def caja_envolvente(mod):
    xs = [p[0] for f in mod.faces for p in f[0]]; ys = [p[1] for f in mod.faces for p in f[0]]; zs = [p[2] for f in mod.faces for p in f[0]]
    return [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)], [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)]

def principal():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    escena = bpy.context.scene
    escena.unit_settings.system = 'METRIC'; escena.unit_settings.scale_length = 1.0
    mats = crear_materiales()
    col_mod = bpy.data.collections.new('MODULOS'); escena.collection.children.link(col_mod)
    col_mue = bpy.data.collections.new('MUESTRARIO'); escena.collection.children.link(col_mue)
    objetos, registro = [], []
    for mod in MODULOS:
        me, nombres, tris = malla(mod, mats)
        ob = bpy.data.objects.new(mod.id, me); col_mod.objects.link(ob)
        ob['ss_modulo'] = mod.id; ob['ss_familia'] = mod.familia; ob['ss_estira'] = mod.estira
        objetos.append((mod, ob, me))
        lo, hi = caja_envolvente(mod)
        registro.append(dict(id=mod.id, familia=mod.familia, estira=mod.estira, escala_nominal=list(mod.nominal), nota=mod.nota,
                             materiales=nombres, triangulos=tris, caja=dict(min=lo, max=hi)))
    # exportar antes de ocultar: fachada e interior en GLB separados (el interior se carga aparte)
    os.makedirs(os.path.join(RAIZ, 'public', 'assets', 'kits-escaparate'), exist_ok=True)
    glbs = {}
    for clave, nombre, es_int in (('fachada', 'kit-escaparate.raw.glb', False), ('interior', 'kit-interior.raw.glb', True)):
        sel = [ob for mod, ob, _ in objetos if (mod.familia in FAMILIAS_INTERIOR) == es_int]
        if not sel:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for ob in sel:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = sel[0]
        glbs[clave] = os.path.join(RAIZ, 'public', 'assets', 'kits-escaparate', nombre)
        bpy.ops.export_scene.gltf(filepath=glbs[clave], export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                                  export_extras=True, export_cameras=False, export_lights=False, export_image_format='NONE',
                                  export_materials='EXPORT', export_texcoords=True, export_normals=True,
                                  export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)
    for r in registro:
        r['archivo'] = 'interior' if r['familia'] in FAMILIAS_INTERIOR else 'fachada'
    glb = glbs
    # muestrario: duplicados enlazados en rejilla, por familias, con la escala nominal
    familias = []
    for mod, _, _ in objetos:
        if mod.familia not in familias:
            familias.append(mod.familia)
    y_fila = 0.0; disposicion = {}; ANCHO_MAX = 15.0
    for fam in familias:
        x = 0.0; linea_h = 0.6; y = y_fila; ancho_fila = 0.0; y_min = y_fila; y_max = y_fila
        for mod, ob, me in [o for o in objetos if o[0].familia == fam]:
            nuevo = bpy.data.objects.new('m_' + mod.id, me); col_mue.objects.link(nuevo)
            sx, sy, sz = mod.nominal
            # escalar en coordenadas del generador: x->x, y(arriba)->Z de Blender, z(calle)->-Y
            nuevo.scale = (sx, sz, sy)
            lo, hi = caja_envolvente(mod)
            ancho = max((hi[0] - lo[0]) * sx, .6)
            alto = max((hi[1] - lo[1]) * sy, .6)
            if x > 0 and x + ancho > ANCHO_MAX:      # nueva línea del muestrario
                x = 0.0; y -= linea_h + .8; linea_h = 0.6
            nuevo.location = (x - lo[0] * sx, 0, y - lo[1] * sy)
            disposicion[mod.id] = (x, y, ancho, alto)
            x += ancho + .8; linea_h = max(linea_h, alto); ancho_fila = max(ancho_fila, x); y_min = min(y_min, y); y_max = max(y_max, y + alto)
        alto_fila = y_max - y_min
        disposicion['_fila_' + fam] = (0, y_min, ancho_fila, alto_fila)
        y_fila = y_min - 1.8
    for _, ob, _ in objetos:
        ob.hide_set(True); ob.hide_render = True
    return registro, disposicion, familias, glb

def guardar_blend():
    bpy.context.preferences.filepaths.save_version = 0
    destino = os.path.join(RAIZ, 'blender', 'kit-escaparates.blend')
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=destino, compress=True)
    return destino

def render_muestrario(disposicion, familias, carpeta):
    esc = bpy.context.scene
    esc.render.engine = 'BLENDER_WORKBENCH'
    esc.display.shading.light = 'FLAT'; esc.display.shading.color_type = 'MATERIAL'
    esc.display.shading.show_object_outline = True
    esc.world = bpy.data.worlds.new('mundo'); esc.world.color = (.93, .94, .95)
    esc.view_settings.view_transform = 'Standard'; esc.display.shading.single_color = (.8, .8, .8)
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.clip_end = 400
    cam = bpy.data.objects.new('cam', cam_d); esc.collection.objects.link(cam); esc.camera = cam
    os.makedirs(carpeta, exist_ok=True)
    from mathutils import Euler, Vector
    for fam in familias:
        x0, y0, ancho, alto = disposicion['_fila_' + fam]
        for nombre, ex, ez in (('frente', 90, 0), ('oblicuo', 74, -30)):
            cam.rotation_euler = Euler((math.radians(ex), 0, math.radians(ez)), 'XYZ')
            dir_ = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
            centro = Vector((x0 + ancho / 2, 0, y0 + alto / 2))
            cam.location = centro - dir_ * 60
            cam_d.ortho_scale = max(ancho + 1, (alto + 1) * 1.5) * (1.0 if nombre == 'frente' else 1.2)
            esc.render.resolution_x = 1800
            esc.render.resolution_y = max(500, min(1400, int(1800 * (alto + 1) / (ancho + 1) * (1.0 if nombre == 'frente' else 1.2))))
            esc.render.filepath = os.path.join(carpeta, f'{fam}_{nombre}.png')
            bpy.ops.render.render(write_still=True)

import kit_interior  # noqa: F401,E402  (registra los módulos de interior en MODULOS)
principal_resultado = principal()
registro, disposicion, familias, glb = principal_resultado

materiales_json = {n: {k: v for k, v in d.items() if k != 'color'} | {'color': list(d['color'])} for n, d in MATERIALES.items()}
manifiesto = dict(
    formato='spanstories-kit-escaparate', version=1,
    unidades='metros', ejes='X a lo largo de la fachada, Y arriba, +Z hacia la calle; origen centro inferior del hueco sobre el muro',
    medidas=dict(vano=W0, alto_vano=H0, caja_fondo=D0, remetido=REMETIDO, profundidad_min=PROF_MIN, profundidad_max=PROF_MAX,
                 capas_z=list(CAPAS_Z), capas_fraccion=list(CAPAS_FRAC), zocalo=ZOCALO_H, puerta=[PUERTA_W, PUERTA_H], rotulo_alto=ROTULO_H,
                 rayas_toldo=N_RAYAS, ancho_perfil=ANCHO_PERFIL),
    reglas=['Sin muebles ni productos 3D: lo pintado va en el atlas.', 'Los barridos solo se escalan a lo largo de su eje.', 'Sin matrices de escala negativa: el espejado lo da el módulo _izq/_der o el UV.',
            'El cierre (vidrio, marco) queda a z=-remetido; la caja somera arranca ahí.', 'Capas y caja llevan UV 0-1 por cara: el generador las remapea a la celda del atlas.'],
    materiales=materiales_json, modulos=registro, kits=KITS,
)
with open(os.path.join(RAIZ, 'public', 'assets', 'kits-escaparate', 'kit.json'), 'w', encoding='utf-8') as f:
    json.dump(manifiesto, f, ensure_ascii=False, indent=1)
destino_blend = guardar_blend()
if '--sin-render' not in ARGS:
    render_muestrario(disposicion, familias, os.path.join(RAIZ, 'reports', 'estudio', '0.17.0', 'kit-escaparate'))
print('KIT', len(MODULOS), 'modulos', sum(r['triangulos'] for r in registro), 'triangulos', destino_blend, glb)
