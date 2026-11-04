# Utilería interior B: ropa, mesas y asientos, frutería, charcutería, flores, electrónica, nevera, góndola, barbero, banco, óptica.
import math
from kit_geom import C, mezcla, vari, azar, pieza, caja, torno, cilindro, bola, extruir_xy, anillo_xy, cilindro_x, barra

PAL_ROPA = ['#c9674a', '#2f5d7a', '#e0c07a', '#5d8a64', '#8a5a8f', '#ece6d8', '#3a3f4a', '#d98a9a', '#a8403a']
LATON = '#c9a14a'; MADERA = '#8a5f3a'

# ---------------------------------------------------------------- ropa
CAMISA = [(-.07, 0), (-.22, -.07), (-.30, -.30), (-.22, -.34), (-.15, -.20), (-.15, -.70), (.15, -.70), (.15, -.20), (.22, -.34), (.30, -.30), (.22, -.07), (.07, 0)]
VESTIDO = [(-.07, 0), (-.18, -.06), (-.16, -.30), (-.12, -.40), (-.27, -.95), (.27, -.95), (.12, -.40), (.16, -.30), (.18, -.06), (.07, 0)]
CHAQUETA = [(-.07, 0), (-.23, -.07), (-.33, -.50), (-.26, -.54), (-.17, -.30), (-.17, -.78), (.17, -.78), (.17, -.30), (.26, -.54), (.33, -.50), (.23, -.07), (.07, 0)]

def _percha(m, x, y, sil, col, z=0.0):
    caja(m, x - .004, y - .004, z - .004, x + .004, y + .06, z + .004, C('#2a2a2a'))
    caja(m, x - .18, y - .012, z - .004, x + .18, y, z + .004, C('#b8a27a'))
    extruir_xy(m, [(x + p[0], y - .012 + p[1]) for p in sil], z - .014, z + .014, col)
    if sil is not VESTIDO:   # botones/cuello
        caja(m, x - .02, y - .08, z + .014, x + .02, y - .03, z + .016, mezcla(col, C('#ffffff'), .4), skip=('-z', '-y'))

def _perchero(id, nota, semilla):
    m = pieza(id, nota, (1, 1, 1))
    r = azar(semilla)
    for x in (-.62, .62):
        cilindro(m, x, 0, 0, 1.55, .014, C('#3a3a3a'), seg=5)
        cilindro(m, x, 0, 0, .02, .12, C('#3a3a3a'), seg=8)
        bola(m, x, 1.57, 0, .028, C(LATON), seg=5, nivel=0)
    cilindro_x(m, -.62, .62, 1.5, 0, .012, C(LATON), seg=6)
    xs = [-.52 + i * .13 for i in range(9)]
    prev = None
    for x in xs:
        col = r.choice([c for c in PAL_ROPA if c != prev]); prev = col
        sil = r.choice([CAMISA, CAMISA, VESTIDO, CHAQUETA])
        _percha(m, x, 1.48, sil, vari(C(col), r, .06), z=(r.random() - .5) * .04)
_perchero('perchero.rail_a', 'perchero con 9 prendas (camisas, vestidos, chaquetas) en colores no contiguos', 'perchero-a')
_perchero('perchero.rail_b', 'perchero con 9 prendas, otra paleta y orden', 'perchero-b')

def _maniqui(id, nota, tipo):
    m = pieza(id, nota, (1, 1, 1))
    r = azar(id)
    cilindro(m, 0, 0, 0, .025, .22, C('#2a2a2a'), seg=10)
    cilindro(m, 0, 0, .025, 1.0, .012, C('#8a8a88'), seg=5)
    piel = C('#e6ddd0')
    tela = C(r.choice(['#c9674a', '#2f5d7a', '#5d8a64', '#8a5a8f', '#d98a9a']))
    torno(m, 0, 0, [(.12, .74), (.10, .95), (.14, 1.20), (.165, 1.36), (.10, 1.44)], tela, seg=8, tapa_abajo=False, tapa_arriba=False)
    cilindro(m, 0, 0, 1.44, 1.53, .04, piel, seg=6)
    bola(m, 0, 1.64, 0, .095, piel, seg=7, achata=1.15, nivel=1)
    if tipo == 'vestido':
        torno(m, 0, 0, [(.34, .42), (.26, .60), (.12, .74)], tela, seg=10, tapa_abajo=False, tapa_arriba=False, suave=False)
        torno(m, 0, 0, [(.34, .42), (.325, .41), (.12, .70)], mezcla(tela, C('#000000'), .3), seg=10, tapa_abajo=False, tapa_arriba=False, suave=False)
    else:
        for sx in (-1, 1):
            cilindro(m, sx * .06, 0, .05, .76, .06, C('#37507a'), seg=6, r2=.052)
            barra(m, (sx * .17, 1.34, 0), (sx * .24, 1.0, .02), .075, .075, tela)
    return m
_maniqui('maniqui.vestido', 'maniquí con vestido acampanado sobre base redonda', 'vestido')
_maniqui('maniqui.vaquero', 'maniquí con chaqueta y vaqueros', 'vaquero')

m = pieza('mesa.expositora', 'mesa de madera 1,0×0,7 con tres pilas de ropa plegada y un jarrón', (1, 1, 1))
r = azar('mesa-exp')
caja(m, -.5, .72, -.35, .5, .76, .35, C('#c49a68'))
for sx in (-1, 1):
    for sz in (-1, 1):
        caja(m, sx * .44 - .02, 0, sz * .29 - .02, sx * .44 + .02, .72, sz * .29 + .02, C('#6a4a2a'))
for i in range(3):
    cx = -.3 + i * .3
    for k in range(r.randint(3, 6)):
        caja(m, cx - .12, .76 + k * .04, -.14, cx + .12, .76 + k * .04 + .037, .14, vari(C(r.choice(PAL_ROPA)), r), skip=('-y',))
torno(m, .42, .22, [(.03, .76), (.06, .84), (.035, .94), (.05, 1.0)], C('#d9cdb2'), seg=7, tapa_arriba=False)

m = pieza('percha.pared', 'riel de pared con seis prendas colgadas (espalda en z=0)', (1, 1, 1))
r = azar('percha-pared')
caja(m, -.55, 0, 0, .55, .06, .06, C('#5a3a24'))
for i in range(6):
    x = -.44 + i * .176
    caja(m, x - .008, -.01, .0, x + .008, .0, .12, C(LATON))
    _percha(m, x, -.05, r.choice([CAMISA, VESTIDO, CHAQUETA]), vari(C(r.choice(PAL_ROPA)), r), z=.13)

# ---------------------------------------------------------------- mesas y asientos
def _silla(m, cx, cz, col, giro=0):
    caja(m, cx - .2, .44, cz - .2, cx + .2, .48, cz + .2, C(col))
    for dx in (-.17, .17):
        for dz in (-.17, .17):
            caja(m, cx + dx - .015, 0, cz + dz - .015, cx + dx + .015, .44, cz + dz + .015, C('#4a3220'))
    zb = cz - .19 if giro == 0 else cz + .19
    for dx in (-.17, .17):
        caja(m, cx + dx - .015, .48, zb - .012, cx + dx + .015, .92, zb + .012, C('#4a3220'))
    caja(m, cx - .17, .74, zb - .014, cx + .17, .88, zb + .014, C(col))

m = pieza('mesa.cafe', 'mesa redonda de mármol con dos sillas de bistró', (1, 1, 1))
cilindro(m, 0, 0, .72, .75, .36, C('#e9e5da'), seg=12)
cilindro(m, 0, 0, .03, .72, .03, C('#2f2f2f'), seg=6)
cilindro(m, 0, 0, 0, .03, .2, C('#2f2f2f'), seg=10)
_silla(m, 0, .36, '#a8403a', 1); _silla(m, 0, -.36, '#2f5d7a', 0)
cilindro(m, .1, .05, .75, .79, .04, C('#f1ece0'), seg=7, r2=.05)

m = pieza('mesa.puesta', 'mesa de restaurante 1,0×0,7 con mantel, platos, copas y vela', (1, 1, 1))
r = azar('mesa-puesta')
caja(m, -.5, .73, -.35, .5, .76, .35, C('#f3eee0'))
for sx in (-1, 1):
    caja(m, sx * .5 - .004, .3, -.35, sx * .5 + .004, .73, .35, C('#e8e1cd'))
caja(m, -.5, .3, .346, .5, .73, .354, C('#e8e1cd'))
for sx in (-1, 1):
    cilindro(m, sx * .42, 0, 0, .3, .02, C('#3a2a1e'), seg=6)
for dx in (-.28, .28):
    for dz in (-.17, .17):
        cilindro(m, dx, dz, .76, .766, .095, C('#f7f4ec'), seg=10)
        cilindro(m, dx, dz, .766, .77, .06, C('#d9d3c2'), seg=10)
        torno(m, dx + .12 * (1 if dz > 0 else -1) * 0, dz + (-.14 if dz > 0 else .14), [(.025, .76), (.03, .82), (.03, .86)], C('#c9e2ea'), seg=6, tapa_arriba=False)
cilindro(m, 0, 0, .76, .84, .03, C('#c9674a'), seg=6)
bola(m, 0, .87, 0, .018, C('#ffd27a'), seg=5, mat='ss_in_luz', nivel=0)
_silla(m, 0, .36, '#7a4a3a', 1); _silla(m, 0, -.36, '#7a4a3a', 0)

m = pieza('mesa.libros', 'mesa de lectura con pilas de libros, un libro abierto y una lámpara de sobremesa', (1, 1, 1))
r = azar('mesa-libros')
caja(m, -.55, .72, -.32, .55, .76, .32, C('#7a5230'))
for sx in (-1, 1):
    for sz in (-1, 1):
        caja(m, sx * .5 - .025, 0, sz * .26 - .025, sx * .5 + .025, .72, sz * .26 + .025, C('#4a3220'))
for cx in (-.35, -.05):
    for k in range(r.randint(3, 6)):
        w = .2 + r.random() * .06
        caja(m, cx - w / 2, .76 + k * .045, -.12, cx + w / 2, .76 + k * .045 + .042, .12, vari(C(r.choice(['#a1452f', '#2f5d7a', '#d7b25a', '#3f6a4b', '#6f4a7a'])), r))
m.poly([(.1, .762, .15), (.3, .762, .15), (.3, .79, -.08), (.1, .79, -.08)], 'ss_in', col=C('#efe6cc'), n=(0, 1, .2))
torno(m, .42, -.18, [(.07, .76), (.02, .78), (.02, 1.0)], C('#c9a14a'), seg=7, tapa_arriba=False)
torno(m, .42, -.18, [(.03, 1.0), (.12, 1.1), (.13, 1.1)], C('#2f5d4a'), seg=8, tapa_arriba=False, tapa_abajo=False, suave=False)
bola(m, .42, 1.02, -.18, .035, C('#ffe6a8'), seg=5, mat='ss_in_luz', nivel=0)

m = pieza('mesa.tecnologia', 'mesa de demostración con dos portátiles y tres tabletas encendidos', (1, 1, 1))
caja(m, -.6, .7, -.35, .6, .74, .35, C('#2a2d33'))
for sx in (-1, 1):
    caja(m, sx * .55 - .025, 0, -.3, sx * .55 + .025, .7, -.26, C('#1f2126')); caja(m, sx * .55 - .025, 0, .26, sx * .55 + .025, .7, .3, C('#1f2126'))
for x in (-.3, .3):
    caja(m, x - .17, .74, -.08, x + .17, .755, .17, C('#c9c9c6'))
    m.poly([(x - .17, .755, -.08), (x + .17, .755, -.08), (x + .17, .98, -.15), (x - .17, .98, -.15)], 'ss_in', col=C('#c9c9c6'), n=(0, .3, 1))
    m.poly([(x - .15, .77, -.085), (x + .15, .77, -.085), (x + .15, .965, -.145), (x - .15, .965, -.145)], 'ss_in_pantalla', n=(0, .3, 1))
for i, x in enumerate((-.12, 0, .12)):
    caja(m, x - .05, .74, .22, x + .05, .748, .32, C('#d9d9d6'))
    m.poly([(x - .045, .75, .225), (x + .045, .75, .225), (x + .045, .75, .315), (x - .045, .75, .315)], 'ss_in_pantalla', n=(0, 1, 0))

def _taburete(m, cx, cz, col='#2f5d4a'):
    cilindro(m, cx, cz, .62, .68, .17, C(col), seg=10)
    cilindro(m, cx, cz, .05, .62, .02, C('#b8b4a8'), seg=6)
    cilindro(m, cx, cz, 0, .03, .19, C('#b8b4a8'), seg=10)
    cilindro(m, cx, cz, .2, .22, .15, C('#b8b4a8'), seg=10)
m = pieza('taburete.bar', 'taburete alto de bar, asiento verde y pie cromado', (1, 1, 1)); _taburete(m, 0, 0)

m = pieza('mostrador.bar_cafe', 'barra de café 2,2 m con cafetera de dos grupos, tazas, molinillo y tres taburetes', (1, 1, 1))
r = azar('barra')
caja(m, -1.1, 0, -.3, 1.1, .1, .26, C('#3a2a1e'), skip=('-y',))
caja(m, -1.09, .1, -.3, 1.09, 1.0, .24, C('#5a3a2a'), skip=('-y',))
for i in range(5):
    x0 = -1.0 + i * .4
    caja(m, x0 + .04, .16, .24, x0 + .36, .92, .252, C('#6e4a34') if i % 2 else C('#7a5238'), skip=('-y', '-z'))
caja(m, -1.14, 1.0, -.34, 1.14, 1.05, .34, C('#d8cdb4'))
caja(m, -1.14, .6, .245, 1.14, .66, .34, C('#c9a14a'))   # reposapiés/barra latón
cilindro_x(m, -1.1, 1.1, .2, .3, .018, C('#c9a14a'), seg=6)
# cafetera
caja(m, -.45, 1.05, -.2, .1, 1.35, .1, C('#b8b4a8'))
caja(m, -.45, 1.35, -.2, .1, 1.42, .1, C('#2f2f2f'))
for x in (-.32, -.02):
    caja(m, x - .04, 1.19, .1, x + .04, 1.23, .16, C('#2f2f2f'))
    caja(m, x - .012, 1.1, .12, x + .012, 1.19, .14, C('#7a7a78'))
bola(m, -.17, 1.32, .1, .03, C('#d9534a'), seg=5, nivel=0)
for i in range(5):
    x = .25 + i * .12
    cilindro(m, x, .05, 1.05, 1.11, .04, C('#f1ece0') if i % 2 else C('#2f5d4a'), seg=7, r2=.047)
torno(m, .95, 0, [(.07, 1.05), (.1, 1.2), (.1, 1.3), (.04, 1.36)], C('#2a2a2a'), seg=8, tapa_arriba=False)
for x in (-.65, 0, .65):
    _taburete(m, x, .42)

# ---------------------------------------------------------------- frutería y charcutería
def _caja_fruta(m, x0, x1, y, z0, z1, col_madera='#c49a68'):
    caja(m, x0, y, z0, x1, y + .02, z1, C(col_madera, .7))
    caja(m, x0, y, z1 - .018, x1, y + .17, z1, C(col_madera))
    caja(m, x0, y, z0, x1, y + .26, z0 + .018, C(col_madera, .9))
    caja(m, x0, y, z0, x0 + .018, y + .17, z1, C(col_madera, .85)); caja(m, x1 - .018, y, z0, x1, y + .17, z1, C(col_madera, .85))

def _fruta(m, r, x0, x1, y, z0, z1, tipo):
    n = int((x1 - x0) / .125); filas = 2
    cols = {'manzanas': ['#c0392b', '#d94a3a', '#8fb04a'], 'naranjas': ['#e8892a', '#f0a030'], 'tomates': ['#c9392b', '#d95a3a'], 'peras': ['#c8c24a', '#a8b83a'],
            'verduras': ['#4f8a3a', '#6aa04a', '#8a4fa0'], 'limones': ['#f0d84a', '#e8c93a']}[tipo]
    for j in range(filas):
        for i in range(n):
            x = x0 + .05 + i * (x1 - x0 - .1) / max(1, n - 1); z = z0 + .05 + j * (z1 - z0 - .1) / max(1, filas - 1)
            rad = .045 if tipo not in ('verduras',) else .06
            bola(m, x + (r.random() - .5) * .015, y + .02 + rad * .8 + (.04 if j % 2 else 0) * 0, z + (r.random() - .5) * .015, rad, vari(C(r.choice(cols)), r, .07), seg=5, achata=.92, nivel=0)

def _fruteria(id, nota, tipos, semilla):
    m = pieza(id, nota, (1, 1, 1))
    r = azar(semilla)
    # expositor escalonado de tres cajones con tablón trasero inclinado y rótulos de tiza
    for k, (y, z0, z1) in enumerate([(.0, .0, .48), (.3, -.2, .12), (.6, -.4, -.1)]):
        _caja_fruta(m, -.62, .62, y, z0, z1)
        _fruta(m, r, -.62, .62, y, z0, z1, tipos[k % len(tipos)])
        for sx in (-1, 1):
            caja(m, sx * .62 - (.02 if sx > 0 else 0), 0, z0 + (.02), sx * .62 + (0 if sx > 0 else .02), y, z0 + .06, C('#6a4a2a'))
    caja(m, -.62, .6, -.42, .62, 1.42, -.4, C('#6a4a2a'), skip=('-y', '-z'))
    for k in range(3):   # cartelitos de precio en tiza
        x = -.4 + k * .4
        caja(m, x - .1, .38 + k * .3, .5 if k == 0 else (.14 if k == 1 else -.08), x + .1, .5 + k * .3, (.52 if k == 0 else (.16 if k == 1 else -.06)), C('#25302d'), skip=('-y', '-z'))
        m.quad((x - .07, .43 + k * .3, (.521 if k == 0 else (.161 if k == 1 else -.059))), (x + .07, .43 + k * .3, (.521 if k == 0 else (.161 if k == 1 else -.059))), (x + .07, .45 + k * .3, (.521 if k == 0 else (.161 if k == 1 else -.059))), (x - .07, .45 + k * .3, (.521 if k == 0 else (.161 if k == 1 else -.059))), 'ss_in', col=C('#efe8d0'), n=(0, 0, 1))
    return m
_fruteria('fruteria.escalonada_a', 'expositor de tres cajones con manzanas, naranjas y tomates', ['manzanas', 'naranjas', 'tomates'], 'fru-a')
_fruteria('fruteria.escalonada_b', 'expositor de tres cajones con peras, verduras y limones', ['peras', 'verduras', 'limones'], 'fru-b')

m = pieza('jamones.rail', 'barra de techo con siete jamones y una cadena de chorizos (origen: arriba)', (1, 1, 1))
r = azar('jamones')
cilindro_x(m, -.7, .7, 0, 0, .014, C('#3a3a3a'), seg=5)
for x in (-.7, .7):
    caja(m, x - .01, 0, -.01, x + .01, .3, .01, C('#3a3a3a'))
for i in range(7):
    x = -.57 + i * .19; L = .5 + r.random() * .12
    caja(m, x - .004, -.14, -.004, x + .004, 0, .004, C('#c9b98f'))
    torno(m, x, 0, [(.0, -.14 - L), (.05, -.14 - L + .05), (.095, -.14 - L * .55), (.07, -.14 - .08), (.03, -.14 - .02), (.015, -.14)],
          vari(C('#8a3a2a'), r, .12), seg=7, tapa_abajo=False, tapa_arriba=False, cols=[C('#e8dcc0'), C('#8a3a2a'), C('#7a2f22'), C('#8a3a2a'), C('#6a4a2a')])
m = pieza('salchichas.cadena', 'cadena de chorizos en curva, de barra a barra (curva de 1,0 m)', (1, 1, 1))
r = azar('chorizos')
pts = [(-.5 + i / 8, -.18 * math.sin(math.pi * i / 8)) for i in range(9)]
for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
    barra(m, (x0, y0 - .0, 0), (x1, y1, 0), .09, .08, vari(C('#a8403a'), r, .12), lado=(0, 0, 1))
    bola(m, (x0 + x1) / 2, (y0 + y1) / 2 + .0, 0, .045, vari(C('#b8483a'), r, .1), seg=5, nivel=0)
cilindro_x(m, -.5, .5, 0, 0, .012, C('#3a3a3a'), seg=5)

m = pieza('mostrador.bascula_hielo', 'cajón de hielo con pescado entero (3 piezas) y marisco', (1, 1, 1))
r = azar('hielo')
caja(m, -.7, 0, -.35, .7, .8, .35, C('#cfd6d8'), skip=('-y',))
caja(m, -.65, .78, -.3, .65, .86, .3, C('#e8f0f2'))
for i in range(3):
    x = -.4 + i * .4
    bola(m, x, .9, 0, .15, vari(C('#8aa3b0'), r), seg=7, achata=.4, nivel=0)
    m.poly([(x + .12, .88, 0), (x + .26, .95, .06), (x + .26, .85, -.06)], 'ss_in', col=C('#7a93a0'), n=(0, 1, 0))
    bola(m, x - .08, .92, .02, .02, C('#222222'), seg=4, nivel=0)
for i in range(5):
    bola(m, -.5 + i * .25 + (i % 2) * .05, .88, .22, .04, vari(C('#e07a5a'), r), seg=5, achata=.8, nivel=0)

# ---------------------------------------------------------------- flores (cubos con ramos), óptica, electrónica
def _flores(id, nota, semilla, pal):
    m = pieza(id, nota, (1, 1, 1))
    r = azar(semilla)
    for bx in (-.4, 0, .4):
        torno(m, bx, 0, [(.12, 0), (.15, .32)], C('#9aa5aa') if r.random() < .5 else C('#b87a5a'), seg=8, suave=False, tapa_arriba=False)
        torno(m, bx, 0, [(.15, .32), (.14, .32), (.11, .02)], C('#4a5560'), seg=8, suave=False, tapa_arriba=False, tapa_abajo=False)
        col = r.choice(pal)
        for k in range(7):
            a = k / 7 * math.pi * 2; rr = r.random() * .08
            x, z = bx + rr * math.cos(a), rr * math.sin(a)
            h = .55 + r.random() * .3
            barra(m, (bx + .02 * math.cos(a), .2, .02 * math.sin(a)), (x + .06 * math.cos(a), .2 + h, z + .06 * math.sin(a)), .008, .008, C('#4f7a3a'))
            bola(m, x + .06 * math.cos(a), .2 + h + .02, z + .06 * math.sin(a), .035 + r.random() * .02, vari(C(col if k % 3 else r.choice(pal)), r, .08), seg=6, nivel=0)
        bola(m, bx, .45, 0, .12, C('#5d8a64'), seg=6, achata=.8, nivel=0)
    return m
_flores('cubos.flores_a', 'tres cubos con ramos de rojos, rosas y amarillos', 'flo-a', ['#c9392b', '#e8a0b0', '#f0d84a'])
_flores('cubos.flores_b', 'tres cubos con ramos de azules, blancos y lilas', 'flo-b', ['#5d7ad0', '#efece4', '#b08ad0'])

m = pieza('expositor.gafas', 'panel de madera con ocho monturas en clavijas (espalda en z=0)', (1, 1, 1))
r = azar('gafas')
caja(m, -.62, 0, 0, .62, .6, .03, C('#6a4a2a'), skip=('-z', '-y'))
caja(m, -.58, .04, .03, .58, .56, .034, C('#d9cdb2'), skip=('-z', '-y'))
for k in range(8):
    x = -.47 + (k % 4) * .31; y = .38 - (k // 4) * .26
    col = C(r.choice(['#2a2a2a', '#a8403a', '#c9a14a', '#2f5d7a', '#6a4a2a', '#5d8a64']))
    for dx in (-.065, .065):
        anillo_xy(m, x + dx, y, .06, .05, .04, col, seg=8, grosor=.006, borde=False)
        m.poly([(x + dx + .04 * math.cos(2 * math.pi * i / 8), y + .04 * math.sin(2 * math.pi * i / 8), .058) for i in range(8)], 'ss_in_vidrio', n=(0, 0, 1))
    caja(m, x - .02, y + .01, .054, x + .02, y + .022, .066, col)
    caja(m, x - .001, y + .045, .03, x + .001, y + .05, .06, C(LATON))

m = pieza('pantallas.pared', 'pared de pantallas 3×2 sobre panel oscuro con repisa de dispositivos (espalda en z=0)', (1, 1, 1))
r = azar('pantallas')
caja(m, -.95, 0, 0, .95, 1.35, .05, C('#23262c'), skip=('-z', '-y'))
for i in range(3):
    for j in range(2):
        x0, y0 = -.9 + i * .6, .06 + j * .63
        caja(m, x0, y0, .05, x0 + .56, y0 + .58, .09, C('#14161a'), skip=('-z', '-y'))
        m.poly([(x0 + .03, y0 + .03, .092), (x0 + .53, y0 + .03, .092), (x0 + .53, y0 + .55, .092), (x0 + .03, y0 + .55, .092)], 'ss_in_pantalla' if (i + j) % 2 == 0 else 'ss_in', col=C('#1f3c58') if (i + j) % 2 else None, n=(0, 0, 1))
caja(m, -.95, 1.33, 0, .95, 1.4, .12, C('#c9a14a'))

# ---------------------------------------------------------------- supermercado: góndola y nevera
m = pieza('gondola.doble', 'góndola de doble cara 1,2×1,6 con cinco baldas de productos y cabecera', (1, 1, 1))
r = azar('gondola')
caja(m, -.6, 0, -.25, .6, 1.62, -.23, C('#b8b4a8'), skip=('-y',))
for sx in (-.6, .58):
    caja(m, sx, 0, -.26, sx + .02, 1.62, .26, C('#8a867a'))
for k in range(5):
    y = .12 + k * .32
    caja(m, -.6, y, -.26, .6, y + .02, .26, C('#d9d5c8'))
    for cara, zc in ((1, .1), (-1, -.1)):
        x = -.57
        while x < .52:
            w = .07 + r.random() * .06; h = .12 + r.random() * .1
            c = C(r.choice(['#c9392b', '#2f5d7a', '#e0c07a', '#5d8a64', '#efe8d6', '#d98a2a', '#8a5a8f']))
            z0, z1 = (.02, .24) if cara > 0 else (-.24, -.02)
            caja(m, x, y + .02, z0, x + w, y + .02 + h, z1, c, skip=('-y', '-z' if cara > 0 else '+z'))
            x += w + .006
caja(m, -.65, 1.62, -.3, .65, 1.82, .3, C('#d9534a'))
caja(m, -.62, 1.64, .302, .62, 1.8, .306, C('#f3e8c8'), skip=('-z', '-y'))

m = pieza('nevera.vitrina', 'nevera de puertas de vidrio 1,0×2,0 con botellas, latas y tira LED', (1, 1, 1))
r = azar('nevera')
caja(m, -.5, 0, -.32, .5, 2.0, .32, C('#b8bcc0'), skip=('+z', '-y'))
caja(m, -.5, 0, .28, .5, .1, .34, C('#6f757a'))
caja(m, -.5, 1.9, .28, .5, 2.0, .34, C('#2f3338'))
m.poly([(-.45, 1.88, .3), (.45, 1.88, .3), (.45, 1.9, .3), (-.45, 1.9, .3)], 'ss_in_luz', n=(0, 0, 1))
for k in range(5):
    y = .12 + k * .35
    caja(m, -.48, y, -.3, .48, y + .015, .28, C('#e8ecee'))
    for i in range(8):
        x = -.42 + i * .12
        c = C(r.choice(['#2d6a3e', '#c9392b', '#e8a02a', '#2f5d7a', '#e9e4d4']))
        cilindro(m, x, .1, y + .015, y + (.24 if k % 2 == 0 else .13), .033, c, seg=5, r2=.025 if k % 2 == 0 else None)
m.poly([(-.5, .1, .345), (.0, .1, .345), (.0, 1.88, .345), (-.5, 1.88, .345)], 'ss_in_vidrio', n=(0, 0, 1))
m.poly([(.0, .1, .345), (.5, .1, .345), (.5, 1.88, .345), (.0, 1.88, .345)], 'ss_in_vidrio', n=(0, 0, 1))
caja(m, -.015, .1, .34, .015, 1.88, .352, C('#2f3338'))
for sx in (-.06, .06):
    caja(m, sx - .008, .8, .346, sx + .008, 1.3, .36, C('#2f3338'))

m = pieza('cajas.apiladas', 'pila de cajas de cartón y cajones de plástico con producto', (1, 1, 1))
r = azar('cajas-ap')
for i in range(3):
    for j in range(3 - i):
        c = C(r.choice(['#b8905a', '#c9a070', '#a8804a']))
        caja(m, -.55 + j * .37 + i * .18, i * .3, -.18, -.2 + j * .37 + i * .18, i * .3 + .28, .18, c)
        caja(m, -.55 + j * .37 + i * .18, i * .3 + .13, .179, -.2 + j * .37 + i * .18, i * .3 + .15, .182, C('#e9dcc0'), skip=('-z', '-y'))

m = pieza('sacos.harina', 'sacos de harina atados, pila de seis sobre palé', (1, 1, 1))
r = azar('sacos')
caja(m, -.5, 0, -.3, .5, .02, .3, C('#8a6a44'))
for k in range(5):
    caja(m, -.5, .02, -.3 + k * .15, .5, .06, -.25 + k * .15, C('#7a5a38'))
for lv in range(3):
    for i in range(2 if lv < 2 else 1):
        x = -.24 + i * .5 - (0 if lv < 2 else -.24); y = .06 + lv * .26
        torno(m, x, 0, [(.16, y), (.22, y + .08), (.2, y + .2), (.14, y + .27), (.05, y + .3), (.04, y + .33)], vari(C('#efe6d0'), r, .04), seg=8, tapa_arriba=False, suave=True)

# ---------------------------------------------------------------- barbero, banco, librería
m = pieza('silla.barbero', 'sillón de barbero de cuero rojo con reposapiés y base cromada', (1, 1, 1))
cilindro(m, 0, 0, 0, .04, .26, C('#b8b4a8'), seg=10)
cilindro(m, 0, 0, .04, .42, .06, C('#b8b4a8'), seg=8)
caja(m, -.26, .42, -.28, .26, .52, .26, C('#8a2a28'))
caja(m, -.24, .52, -.3, .24, .56, .22, C('#a23b34'))
caja(m, -.27, .52, -.32, .27, 1.05, -.2, C('#a23b34'))
caja(m, -.2, 1.05, -.31, .2, 1.28, -.24, C('#8a2a28'))
for sx in (-1, 1):
    caja(m, sx * .3 - .03, .52, -.28, sx * .3 + .03, .72, .24, C('#2a2a2a'))
    caja(m, sx * .3 - .035, .7, -.28, sx * .3 + .035, .75, .24, C('#a23b34'))
barra(m, (0, .42, .26), (0, .12, .5), .22, .03, C('#b8b4a8'))
caja(m, -.14, .1, .46, .14, .14, .6, C('#2a2a2a'))

m = pieza('poste.barbero', 'poste de barbero rayado rojo/blanco/azul con remates', (1, 1, 1))
cols = [C('#d9534a'), C('#f1ece0'), C('#3b6fa8')] * 3
torno(m, 0, 0, [(.07, .5 + i * .14) for i in range(10)], C('#ffffff'), seg=8, cols=cols, tapa_abajo=False, tapa_arriba=False, suave=False)
cilindro(m, 0, 0, .44, .5, .09, C(LATON), seg=8); cilindro(m, 0, 0, 1.76, 1.82, .09, C(LATON), seg=8)
bola(m, 0, 1.9, 0, .08, C('#f1ece0'), seg=7, nivel=0)

m = pieza('banco.espera', 'banco corrido de tres plazas con asientos azules y patas de acero', (1, 1, 1))
caja(m, -.75, .42, -.2, .75, .48, .2, C('#2f5d7a'))
caja(m, -.75, .48, -.22, .75, .9, -.17, C('#2f5d7a'))
for x in (-.7, 0, .7):
    caja(m, x - .02, 0, -.2, x + .02, .42, .2, C('#b8b4a8'))
for x in (-.25, .25):
    caja(m, x - .004, .48, -.2, x + .004, .5, .2, C('#1f3c58'))

m = pieza('ventanilla.banco', 'mostrador de ventanilla con cristal, rejilla de latón y ranura (2,0×1,2 sobre 0,9)', (1, 1, 1))
caja(m, -1, 0, -.35, 1, .95, .3, C('#4a5870'), skip=('-y',))
caja(m, -1.04, .95, -.4, 1.04, 1.0, .35, C('#d8cdb4'))
for sx in (-1, 0, 1):
    caja(m, sx * .98 - .02 if sx else -.02, 1.0, -.12, (sx * .98 + .02) if sx else .02, 2.1, -.08, C('#b8b4a8'))
m.poly([(-.96, 1.12, -.1), (-.04, 1.12, -.1), (-.04, 2.05, -.1), (-.96, 2.05, -.1)], 'ss_in_vidrio', n=(0, 0, 1))
m.poly([(.04, 1.12, -.1), (.96, 1.12, -.1), (.96, 2.05, -.1), (.04, 2.05, -.1)], 'ss_in_vidrio', n=(0, 0, 1))
caja(m, -.3, 1.0, -.14, .3, 1.12, -.06, C('#2a2a2a'))

m = pieza('escalera.libros', 'escalera corrediza de biblioteca con peldaños y carro (2,4 m)', (1, 1, 1))
for sx in (-.2, .2):
    barra(m, (sx, 0, .5), (sx, 2.25, -.05), .035, .03, C('#6a4a2a'))
for k in range(7):
    t = k / 6
    y = .15 + t * 1.9; z = .5 - (.55) * (y / 2.25)
    caja(m, -.21, y, z - .06, .21, y + .03, z + .06, C('#8a5f3a'))
for sx in (-.2, .2):
    cilindro(m, sx, .5, 0, .06, .05, C('#2a2a2a'), seg=6)
caja(m, -.22, 2.2, -.1, .22, 2.28, 0, C(LATON))

m = pieza('zapatos.escalonado', 'expositor de tres peldaños con zapatos en pares (1,2×1,0)', (1, 1, 1))
r = azar('zapatos-esc')
sil = [(0, 0), (.26, 0), (.27, .025), (.22, .055), (.16, .085), (.12, .13), (.05, .135), (0, .11)]
for k, (y, z0, z1) in enumerate([(0, .0, .5), (.28, -.2, .0), (.56, -.45, -.2)]):
    caja(m, -.6, y, z0, .6, y + .28, z1, C('#c49a68') if k % 2 else C('#a8804a'))
    caja(m, -.6, y + .28, z0, .6, y + .295, z1 + .0, C('#e9e1ce'))
    for i in range(3):
        cx = -.52 + i * .38
        col = C(r.choice(['#8a5a3a', '#2e2a2a', '#d9cdb5', '#a8403a', '#3a5a7a', '#e9a02a']))
        zz = (z0 + z1) / 2
        caja(m, cx, y + .295, zz - .05, cx + .27, y + .315, zz + .05, C('#f1ece0'), skip=('-y',))
        extruir_xy(m, [(cx + p[0], y + .315 + p[1]) for p in sil], zz - .045, zz + .045, vari(col, r, .05))
