# Utilería interior A: estanterías con contenido, mostradores, vitrinas, horno, botica, lámparas, pizarras, espejos.
# Origen: centro del suelo bajo la pieza; el frente mira a +Z. Las piezas de pared tienen la espalda en z=0 y salen hacia +Z.
import math
from kit_geom import (C, mezcla, vari, azar, pieza, caja, torno, cilindro, bola, prisma, extruir_xy, anillo_xy, disco_xy, cilindro_x, barra)

MADERA = '#8a5f3a'; MADERA_OSC = '#4f3524'; MADERA_CLARA = '#c49a68'; LATON = '#c9a14a'
LIBROS = ['#a1452f', '#2f5d7a', '#d7b25a', '#3f6a4b', '#6f4a7a', '#e8e0cc', '#8c5a3a', '#c9693d', '#27394f']

# ---------------------------------------------------------------- estanterías
W, H, D = 1.2, 2.2, .34
ESTANTES = [.08, .52, .96, 1.40, 1.84]

def _marco_estanteria(m, r, madera=MADERA, fondo=MADERA_OSC):
    z0, z1 = -D / 2, D / 2
    caja(m, -W / 2, 0, z0, -W / 2 + .04, H, z1, vari(C(madera), r), skip=('-y',))
    caja(m, W / 2 - .04, 0, z0, W / 2, H, z1, vari(C(madera), r), skip=('-y',))
    caja(m, -W / 2 + .04, .04, z0, W / 2 - .04, H - .02, z0 + .012, C(fondo), skip=('-z',))
    for y in ESTANTES:
        caja(m, -W / 2 + .04, y, z0 + .012, W / 2 - .04, y + .03, z1, vari(C(madera, 1.1), r, .05))
    caja(m, -W / 2 - .02, H, z0 - .01, W / 2 + .02, H + .05, z1 + .02, C(madera, .85))
    caja(m, -W / 2 + .04, 0, z0 + .012, W / 2 - .04, .06, z1 - .01, C(fondo, .8))

def _cesto(m, cx, cz, y, r, h, r2, col):
    torno(m, cx, cz, [(r, y), (r2, y + h)], col, seg=8, tapa_arriba=False, suave=False)
    torno(m, cx, cz, [(r2, y + h), (r2 - .012, y + h), (r * .9, y + .02)], mezcla(col, C('#000000'), .35), seg=8, tapa_arriba=False, tapa_abajo=False, suave=False)

def _pan(m, r, y, x0, x1, z):
    tipo = r.choice(['cestas', 'baguettes', 'hogazas', 'bandeja'])
    dorado = [C('#d89a45'), C('#c27a34'), C('#e2b062'), C('#a85f2a')]
    if tipo == 'cestas':
        for i in range(3):
            cx = x0 + (i + .5) * (x1 - x0) / 3
            _cesto(m, cx, z, y, .12, .13, .15, C('#c79a52'))
            for k in range(3):
                bola(m, cx + (k - 1) * .075, y + .14, z + (r.random() - .5) * .05, .07, vari(r.choice(dorado), r), seg=6, achata=.7, nivel=0)
    elif tipo == 'baguettes':
        for i in range(2):
            cx = x0 + (i + .5) * (x1 - x0) / 2
            _cesto(m, cx, z, y, .13, .26, .17, C('#b98748'))
            for k in range(6):
                a = k / 6 * math.pi * 2
                cilindro(m, cx + .05 * math.cos(a), z + .035 * math.sin(a), y + .2, y + .66, .022, vari(r.choice(dorado), r), seg=5, r2=.02)
    elif tipo == 'hogazas':
        for i in range(3):
            cx = x0 + (i + .5) * (x1 - x0) / 3
            bola(m, cx, y + .09, z, .13, vari(r.choice(dorado), r), seg=7, achata=.68, nivel=0)
            for k in (-1, 0, 1):   # cortes de la hogaza
                m.quad((cx + k * .05 - .01, y + .165, z + .07), (cx + k * .05 + .01, y + .165, z + .07), (cx + k * .05 + .02, y + .13, z + .11), (cx + k * .05 - .02, y + .13, z + .11), 'ss_in', col=C('#f0d9a0'), n=(0, 1, 1))
    else:
        caja(m, x0 + .02, y, z - .12, x1 - .02, y + .018, z + .13, C('#9a9a98'))
        for i in range(6):
            for j in range(2):
                bola(m, x0 + .1 + i * (x1 - x0 - .2) / 5, y + .06, z - .05 + j * .11, .05, vari(r.choice(dorado), r), seg=6, achata=.8, nivel=0)

def _libros(m, r, y, x0, x1, z):
    x = x0
    while x < x1 - .1:
        if r.random() < .08 and x < x1 - .3:   # bloque tumbado
            for k in range(3):
                w, h = .24 + r.random() * .05, .035 + r.random() * .02
                caja(m, x + .02, y + k * .045, z - .12, x + .02 + w, y + k * .045 + h, z + .13, vari(C(r.choice(LIBROS)), r))
            x += .31
        else:
            w, h = .028 + r.random() * .04, .24 + r.random() * .1
            col = vari(C(r.choice(LIBROS)), r, .08)
            caja(m, x, y, z - .12, x + w, y + h, z + .13, col, skip=('-x', '+x', '-y'))
            m.quad((x + .003, y + h * .55, z + .1325), (x + w - .003, y + h * .55, z + .1325), (x + w - .003, y + h * .6, z + .1325), (x + .003, y + h * .6, z + .1325), 'ss_in', col=C('#e9d7a3'), n=(0, 0, 1))
            x += w + .002
        if r.random() < .06:
            x += .1   # hueco

def _botellas(m, r, y, x0, x1, z):
    cols = [C('#2d6a3e'), C('#a8692c'), C('#8fb4c4'), C('#6b2a38')]
    for i in range(6):
        cx = x0 + (i + .5) * (x1 - x0) / 6
        c = r.choice(cols); h = .2 + r.random() * .06
        torno(m, cx, z, [(.034, y), (.034, y + h * .58), (.014, y + h * .8), (.014, y + h)], c, seg=5, cols=[c, c, c])
        m.quad((cx - .026, y + .04, z + .034), (cx + .026, y + .04, z + .034), (cx + .026, y + .11, z + .034), (cx - .026, y + .11, z + .034), 'ss_in', col=C('#efe6cf'), n=(0, 0, 1))

def _cajas(m, r, y, x0, x1, z):
    x = x0 + .02
    bandas = [C('#2f8f6d'), C('#d9534a'), C('#3b6fa8'), C('#c9a14a')]
    while x < x1 - .12:
        w, h = .08 + r.random() * .05, .1 + r.random() * .06
        for k in range(2 if r.random() < .5 else 1):
            caja(m, x, y + k * (h + .004), z - .09, x + w, y + k * (h + .004) + h, z + .1, C('#f2efe6'), skip=('-y', '-z'))
            m.quad((x + .003, y + k * (h + .004) + h * .55, z + .1), (x + w - .003, y + k * (h + .004) + h * .55, z + .1), (x + w - .003, y + k * (h + .004) + h * .8, z + .1), (x + .003, y + k * (h + .004) + h * .8, z + .1), 'ss_in', col=r.choice(bandas), n=(0, 0, 1))
        x += w + .01

def _ropa_plegada(m, r, y, x0, x1, z):
    pal = ['#c9674a', '#2f5d7a', '#e0c07a', '#5d8a64', '#8a5a8f', '#ece6d8', '#3a3f4a']
    for i in range(3):
        cx = x0 + (i + .5) * (x1 - x0) / 3
        for k in range(r.randint(3, 6)):
            dx = (r.random() - .5) * .02
            caja(m, cx - .13 + dx, y + k * .037, z - .12, cx + .13 + dx, y + k * .037 + .034, z + .12, vari(C(r.choice(pal)), r), skip=('-y',))

def _zapatos(m, r, y, x0, x1, z):
    pal = ['#8a5a3a', '#2e2a2a', '#d9cdb5', '#a8403a', '#3a5a7a']
    sil = [(0, 0), (.26, 0), (.27, .025), (.22, .055), (.16, .085), (.12, .13), (.05, .135), (0, .11)]
    for i in range(3):
        cx = x0 + (i + .5) * (x1 - x0) / 3 - .13
        col = r.choice(pal)
        caja(m, cx, y, z - .05, cx + .27, y + .02, z + .05, C('#e6e0d2'), skip=('-y',))
        extruir_xy(m, [(cx + p[0], y + .02 + p[1]) for p in sil], z - .045, z + .045, vari(C(col), r, .06))

def _frascos(m, r, y, x0, x1, z):
    cols = ['#e8e2d0', '#5d8ab0', '#d9a441', '#79a98a', '#c9674a']
    for i in range(5):
        cx = x0 + (i + .5) * (x1 - x0) / 5; c = C(r.choice(cols)); h = .1 + r.random() * .05
        torno(m, cx, z, [(.05, y), (.052, y + h), (.034, y + h), (.034, y + h + .022)], c, seg=5, cols=[c, C('#6b4a2c'), C('#6b4a2c')])

CONTENIDO = {'pan': _pan, 'libros': _libros, 'botellas': _botellas, 'cajas': _cajas, 'ropa_plegada': _ropa_plegada, 'zapatos': _zapatos, 'frascos': _frascos}
for tipo, fn in CONTENIDO.items():
    for var in ('a', 'b'):
        m = pieza(f'estanteria.{tipo}.{var}', f'estantería 1,20×2,20×0,34 con {tipo} (5 baldas, variante {var})', (1, 1, 1))
        r = azar(f'est:{tipo}:{var}')
        _marco_estanteria(m, r, MADERA if var == 'a' else '#6e7a6a' if tipo in ('botellas', 'frascos') else '#a2754a')
        for k, y in enumerate(ESTANTES):
            fn(m, r, y + .03, -W / 2 + .06, W / 2 - .06, 0)

# ---------------------------------------------------------------- mostradores
CW, CH, CD = 1.8, .92, .6

def _carcasa(m, r, base, top, panel, remate=None):
    caja(m, -CW / 2, 0, -CD / 2, CW / 2, .1, CD / 2 - .04, C(base, .55), skip=('-y',))
    caja(m, -CW / 2 + .01, .1, -CD / 2, CW / 2 - .01, CH - .06, CD / 2 - .02, C(base), skip=('-y',))
    for i in range(4):
        x0 = -CW / 2 + .08 + i * (CW - .16) / 4
        caja(m, x0 + .03, .17, CD / 2 - .02, x0 + (CW - .16) / 4 - .03, CH - .14, CD / 2 + .005, vari(C(panel), r, .05), skip=('-y', '-z'))
        caja(m, x0 + .07, .22, CD / 2 + .005, x0 + (CW - .16) / 4 - .07, CH - .2, CD / 2 + .012, vari(C(base, .9), r, .04), skip=('-y', '-z'))
    caja(m, -CW / 2 - .03, CH - .06, -CD / 2 - .02, CW / 2 + .03, CH, CD / 2 + .05, C(top))
    if remate:
        caja(m, -CW / 2 - .03, CH - .075, CD / 2 + .03, CW / 2 + .03, CH - .04, CD / 2 + .05, C(remate))

def _mostrador(id, nota, base, top, panel, remate=None):
    m = pieza(id, nota, (1, 1, 1))
    _carcasa(m, azar(id), base, top, panel, remate)
_mostrador('mostrador.madera', 'mostrador de madera con cuarterones', '#7a5230', '#c49a68', '#8c6038')
_mostrador('mostrador.marmol', 'mostrador de mármol blanco sobre base verde botella', '#2f5a48', '#efece4', '#3d6e57', '#c9a14a')
_mostrador('mostrador.pintado', 'mostrador pintado granate con remate de latón', '#7d2f2b', '#d8cdb4', '#8d3a34', '#c9a14a')

def _vitrina(id, nota, base, relleno):
    m = pieza(id, nota, (1, 1, 1))
    r = azar(id)
    caja(m, -CW / 2, 0, -CD / 2, CW / 2, .1, CD / 2 - .04, C(base, .5), skip=('-y',))
    caja(m, -CW / 2 + .01, .1, -CD / 2, CW / 2 - .01, .86, CD / 2 - .02, C(base), skip=('-y',))
    for i in range(3):
        x0 = -CW / 2 + .08 + i * (CW - .16) / 3
        caja(m, x0 + .04, .16, CD / 2 - .02, x0 + (CW - .16) / 3 - .04, .8, CD / 2 + .006, vari(C(base, 1.15), r, .04), skip=('-y', '-z'))
    caja(m, -CW / 2 - .02, .86, -CD / 2 - .01, CW / 2 + .02, .9, CD / 2 + .03, C('#dcd3bd'))
    # bandejas escalonadas y producto
    caja(m, -CW / 2 + .05, .90, -CD / 2 + .06, CW / 2 - .05, .93, CD / 2 - .08, C('#e9e1ce'))
    caja(m, -CW / 2 + .1, .93, -CD / 2 + .08, CW / 2 - .1, .96, -CD / 2 + .26, C('#e9e1ce'))
    relleno(m, r)
    # marco metálico y vidrio (frente y techo inclinado) sobre el producto
    mt = C('#b8b4a8')
    for x in (-CW / 2 + .04, CW / 2 - .04):
        for z in (-CD / 2 + .05, CD / 2 - .06):
            caja(m, x - .012, .9, z - .012, x + .012, 1.42, z + .012, mt)
    caja(m, -CW / 2 + .03, 1.4, -CD / 2 + .04, CW / 2 - .03, 1.43, CD / 2 - .05, mt)
    m.quad((-CW / 2 + .04, .93, CD / 2 - .06), (CW / 2 - .04, .93, CD / 2 - .06), (CW / 2 - .04, 1.41, CD / 2 - .06), (-CW / 2 + .04, 1.41, CD / 2 - .06), 'ss_in_vidrio', n=(0, 0, 1))
    m.quad((-CW / 2 + .04, 1.41, CD / 2 - .06), (CW / 2 - .04, 1.41, CD / 2 - .06), (CW / 2 - .04, 1.41, -CD / 2 + .05), (-CW / 2 + .04, 1.41, -CD / 2 + .05), 'ss_in_vidrio', n=(0, 1, 0))

def _v_pan(m, r):
    oro = [C('#d89a45'), C('#c27a34'), C('#e2b062')]
    for j, y in enumerate((.93, .96)):
        for i in range(6 if j == 0 else 5):
            x = -CW / 2 + .16 + i * (CW - .32) / (5 if j == 0 else 4); z = (.12 if j == 0 else -.1)
            if i % 3 == 0:   # croissant: media luna de tres bolas
                for k, (dx, dz, s) in enumerate(((-.05, .0, .03), (0, .018, .042), (.05, .0, .03))):
                    bola(m, x + dx, y + .04, z + dz, s, vari(r.choice(oro), r), seg=6, achata=.85, nivel=0)
            elif i % 3 == 1:   # rosquilla glaseada
                cilindro(m, x, z, y, y + .035, .055, C('#c98a4a'), seg=8)
                cilindro(m, x, z, y + .035, y + .045, .046, r.choice([C('#e9b8c8'), C('#5a3a2a'), C('#f1e3b8')]), seg=8)
            else:   # magdalena
                cilindro(m, x, z, y, y + .045, .036, C('#d9c9a0'), seg=7, r2=.045)
                bola(m, x, y + .06, z, .045, C('#e7a9a0') if r.random() < .5 else C('#a8805a'), seg=6, achata=.7, nivel=0)
_vitrina('mostrador.vitrina_pan', 'vitrina de bollería: croissants, rosquillas y magdalenas sobre bandejas', '#6f8a64', _v_pan)

def _v_carne(m, r):
    for j, y in enumerate((.93, .96)):
        for i in range(6):
            x = -CW / 2 + .16 + i * (CW - .32) / 5; z = .12 if j == 0 else -.1
            col = r.choice([C('#a8403a'), C('#7a3a2a'), C('#d98a7a'), C('#c9a07a')])
            cilindro_x(m, x - .1, x + .1, y + .05, z, .035 + r.random() * .012, col, seg=6)
            cilindro_x(m, x - .1, x + .1, y + .05, z + .08, .03, vari(col, r), seg=6)
        if j == 0:
            for i in range(3):   # lonchas de jamón sobre bandeja
                x = -CW / 2 + .3 + i * .5
                caja(m, x, .93, -.04, x + .26, .945, .2, C('#d9d4c4'))
                bola(m, x + .13, .96, .08, .09, C('#e0897f'), seg=7, achata=.25, nivel=0)
_vitrina('mostrador.vitrina_carne', 'vitrina de charcutería: embutidos y bandejas de jamón', '#8c3a34', _v_carne)

def _v_queso(m, r):
    for i in range(4):
        x = -CW / 2 + .22 + i * .45
        cilindro(m, x, .1, .93, 1.0, .1, C('#e8c862'), seg=10)
        cilindro(m, x, .1, 1.0, 1.003, .1, C('#f2d98a'), seg=10)
        cilindro(m, x + .15, -.12, .93, .99, .07, C('#d9a441'), seg=8)
        prisma(m, [(x - .1, -.2), (x + .06, -.2), (x - .1, -.04)], .93, 1.0, C('#f0d070'))
_vitrina('mostrador.vitrina_queso', 'vitrina de quesos: ruedas, cuñas y piezas', '#c9a14a', _v_queso)

def _v_dulces(m, r):
    for j, y in enumerate((.93, .96)):
        for i in range(8):
            x = -CW / 2 + .14 + i * (CW - .28) / 7; z = .11 if j == 0 else -.1
            cilindro(m, x, z, y, y + .05, .034, r.choice([C('#e8e0c8'), C('#e9b8c8'), C('#bfd9c8')]), seg=6, r2=.04)
            bola(m, x, y + .075, z, .04, r.choice([C('#c9674a'), C('#f4d6a0'), C('#7a4a38'), C('#e9a0b8'), C('#9ac98a')]), seg=6, achata=.8, nivel=0)
_vitrina('mostrador.vitrina_dulces', 'vitrina de pastelería: tartaletas y pastelitos de colores', '#a8789a', _v_dulces)

# ---------------------------------------------------------------- horno de ladrillo
m = pieza('horno.ladrillo', 'horno de leña de ladrillo con boca en arco, brasas, bóveda, chimenea y pala', (1, 1, 1))
r = azar('horno')
ladr = C('#a8553a'); ladr2 = C('#b96a48')
caja(m, -.65, 0, -.38, .65, .5, .38, ladr, skip=('-y',))
for k in range(5):   # hiladas marcadas
    caja(m, -.655, k * .1 + .095, -.385, .655, k * .1 + .1, .385, C('#5a2b1d'), skip=('-y',))
caja(m, -.65, .5, -.38, .65, 1.1, .38, ladr2, skip=('-y',))
for k in range(6):
    caja(m, -.655, .5 + k * .1 + .095, -.385, .655, .5 + k * .1 + .1, .385, C('#5a2b1d'), skip=('-y',))
torno(m, 0, 0, [(.66, 1.1), (.6, 1.27), (.47, 1.42), (.27, 1.52), (.09, 1.56)], ladr, seg=12, tapa_arriba=False, tapa_abajo=False, ez=.57)
cilindro(m, 0, -.15, 1.5, 2.0, .09, C('#7a3e2a'), seg=8, r2=.08)
cilindro(m, 0, -.15, 2.0, 2.04, .11, C('#5a2b1d'), seg=8)
# boca en arco: hueco oscuro + brasas + marco de dovelas
R0, YC = .27, .72
m.poly([(x, y, .382) for x, y in [(-R0, .42), (R0, .42), (R0, YC)] + [(R0 * math.cos(math.pi * i / 10), YC + R0 * math.sin(math.pi * i / 10)) for i in range(1, 10)] + [(-R0, YC)]], 'ss_in', col=C('#1a1210'), n=(0, 0, 1))
m.poly([(-R0 * .8, .42, .384), (R0 * .8, .42, .384), (R0 * .7, .62, .384), (-R0 * .7, .62, .384)], 'ss_in_brasa', n=(0, 0, 1))
m.poly([(-R0 * .55, .62, .386), (R0 * .55, .62, .386), (R0 * .3, .86, .386), (-R0 * .3, .86, .386)], 'ss_in_brasa', n=(0, 0, 1))
for i in range(10):
    a0, a1 = math.pi * i / 10, math.pi * (i + 1) / 10
    ri, ro = R0, R0 + .1
    cc = C('#d9cdb2') if i % 2 else C('#c1b291')
    m.poly([(ri * math.cos(a0), YC + ri * math.sin(a0), .385), (ro * math.cos(a0), YC + ro * math.sin(a0), .385), (ro * math.cos(a1), YC + ro * math.sin(a1), .385), (ri * math.cos(a1), YC + ri * math.sin(a1), .385)], 'ss_in', col=cc, n=(0, 0, 1))
caja(m, -R0 - .1, .42, .383, -R0, YC, .39, C('#d9cdb2'), skip=('-y',)); caja(m, R0, .42, .383, R0 + .1, YC, .39, C('#c1b291'), skip=('-y',))
caja(m, -R0 - .12, .38, .383, R0 + .12, .42, .43, C('#9c8f78'))   # umbral
# leña apilada a un lado y pala apoyada
for j in range(3):
    for i in range(3 - j):
        cilindro_x(m, .72, 1.02, .05 + j * .09, -.15 + i * .1 + j * .05, .045, vari(C('#8a5a3a'), r), seg=6)
barra(m, (-.5, .0, .42), (-.47, 1.7, .39), .05, .02, C('#7a5a3a'))
caja(m, -.62, 1.62, .39, -.34, 1.7, .42, C('#9a7a50'))

# ---------------------------------------------------------------- botica (cajonera de farmacia antigua)
m = pieza('cajonera.botica', 'cajonera de farmacia 2,0×2,3 con 6×8 cajones, tiradores y etiquetas; cornisa con frascos', (1, 1, 1))
r = azar('botica')
BW, BH, BD = 2.0, 2.2, .36
caja(m, -BW / 2, 0, -BD / 2, BW / 2, BH, BD / 2, C('#5a3a24'), skip=('-y',))
for i in range(6):
    for j in range(8):
        x0 = -BW / 2 + .06 + i * (BW - .12) / 6; y0 = .1 + j * (BH - .52) / 8
        w, h = (BW - .12) / 6 - .02, (BH - .52) / 8 - .02
        cc = vari(C('#9a6a3e') if (i + j) % 2 else C('#a8753f'), r, .06)
        m.quad((x0 + .01, y0 + .01, BD / 2 + .004), (x0 + .01 + w, y0 + .01, BD / 2 + .004), (x0 + .01 + w, y0 + .01 + h, BD / 2 + .004), (x0 + .01, y0 + .01 + h, BD / 2 + .004), 'ss_in', col=cc, n=(0, 0, 1))
        cx = x0 + .01 + w / 2
        m.quad((cx - .035, y0 + .01 + h * .58, BD / 2 + .006), (cx + .035, y0 + .01 + h * .58, BD / 2 + .006), (cx + .035, y0 + .01 + h * .83, BD / 2 + .006), (cx - .035, y0 + .01 + h * .83, BD / 2 + .006), 'ss_in', col=C('#efe3c0'), n=(0, 0, 1))
        m.quad((cx - .012, y0 + .01 + h * .22, BD / 2 + .008), (cx + .012, y0 + .01 + h * .22, BD / 2 + .008), (cx + .012, y0 + .01 + h * .38, BD / 2 + .008), (cx - .012, y0 + .01 + h * .38, BD / 2 + .008), 'ss_in', col=C(LATON), n=(0, 0, 1))
caja(m, -BW / 2 - .03, BH - .42, -BD / 2 - .02, BW / 2 + .03, BH - .38, BD / 2 + .04, C('#3a2616'))
# vitrina baja de frascos arriba
caja(m, -BW / 2, BH - .38, -BD / 2, BW / 2, BH, BD / 2 - .02, C('#4a3220'), skip=('-y',))
for i in range(9):
    x = -BW / 2 + .12 + i * (BW - .24) / 8
    c = r.choice([C('#e8e2d0'), C('#79a98a'), C('#d9a441'), C('#5d8ab0')])
    torno(m, x, .02, [(.05, BH - .34), (.05, BH - .14), (.03, BH - .1)], c, seg=5)
caja(m, -BW / 2 - .04, BH, -BD / 2 - .03, BW / 2 + .04, BH + .06, BD / 2 + .05, C('#3a2616'))

# ---------------------------------------------------------------- pequeños de mostrador
m = pieza('caja.registradora', 'caja registradora de latón con teclas y cajón', (1, 1, 1))
caja(m, -.2, 0, -.16, .2, .16, .16, C('#c9a14a'))
caja(m, -.2, .16, -.1, .2, .26, .0, C('#b08a3a'))
caja(m, -.15, .26, -.1, .15, .3, -.02, C('#3a3a38'))
caja(m, -.17, .09, .16, .17, .115, .2, C('#6a4a2a'))
for i in range(5):
    for j in range(3):
        caja(m, -.14 + i * .06, .04 + j * .04, .16, -.1 + i * .06, .065 + j * .04, .18, C('#efe3c0') if (i + j) % 3 else C('#a8403a'), skip=('-y', '-z'))
m = pieza('balanza', 'balanza de platos con aguja', (1, 1, 1))
caja(m, -.16, 0, -.1, .16, .06, .1, C('#2f3a32'))
cilindro(m, 0, 0, .06, .3, .02, C('#c9a14a'), seg=6)
torno(m, -.2, 0, [(.12, .2), (.1, .17), (.0, .17)], C('#b8b4a8'), seg=10, tapa_abajo=False)
torno(m, .2, 0, [(.12, .2), (.1, .17), (.0, .17)], C('#b8b4a8'), seg=10, tapa_abajo=False)
barra(m, (-.2, .3, 0), (.2, .3, 0), .02, .02, C('#c9a14a'))
barra(m, (-.2, .3, 0), (-.2, .2, 0), .01, .01, C('#c9a14a')); barra(m, (.2, .3, 0), (.2, .2, 0), .01, .01, C('#c9a14a'))

# ---------------------------------------------------------------- lámparas (origen en el punto de cuelgue)
def _lamp(id, nota, construir):
    m = pieza(id, nota, (1, 1, 1))
    construir(m)
def _cupula(m):
    torno(m, 0, 0, [(.04, -.04), (.22, -.30)], C('#b5683a'), seg=10, tapa_arriba=False, tapa_abajo=False, suave=False)
    torno(m, 0, 0, [(.22, -.30), (.2, -.29), (.04, -.04)], C('#f2e2b8'), seg=10, tapa_arriba=False, tapa_abajo=False, suave=False)
    cilindro(m, 0, 0, -.06, 0, .03, C('#2a2a2a'), seg=6)
    bola(m, 0, -.24, 0, .06, C('#ffe6a8'), seg=6, mat='ss_in_luz', nivel=0)
    m.poly([(.2 * math.cos(2 * math.pi * i / 10), -.295, .2 * math.sin(2 * math.pi * i / 10)) for i in range(10)], 'ss_in_luz', n=(0, -1, 0))
_lamp('lampara.cupula', 'pantalla cónica de cobre con luz cálida', _cupula)
def _globo(m):
    cilindro(m, 0, 0, -.05, 0, .025, C('#2a2a2a'), seg=6)
    bola(m, 0, -.2, 0, .15, C('#fff0c8'), seg=8, mat='ss_in_luz', nivel=1)
    cilindro(m, 0, 0, -.08, -.05, .045, C('#b5683a'), seg=6)
_lamp('lampara.globo', 'globo opalino luminoso', _globo)
def _industrial(m):
    cilindro(m, 0, 0, -.1, 0, .03, C('#222222'), seg=6)
    torno(m, 0, 0, [(.05, -.1), (.26, -.28), (.27, -.31)], C('#26302e'), seg=10, tapa_arriba=False, tapa_abajo=False, suave=False)
    torno(m, 0, 0, [(.27, -.31), (.26, -.30), (.05, -.1)], C('#e9e4d4'), seg=10, tapa_arriba=False, tapa_abajo=False, suave=False)
    bola(m, 0, -.22, 0, .055, C('#ffe6a8'), seg=6, mat='ss_in_luz', nivel=0)
    m.poly([(.26 * math.cos(2 * math.pi * i / 10), -.305, .26 * math.sin(2 * math.pi * i / 10)) for i in range(10)], 'ss_in_luz', n=(0, -1, 0))
_lamp('lampara.industrial', 'pantalla industrial esmaltada verde oscuro', _industrial)
def _canasta(m):
    cilindro(m, 0, 0, -.06, 0, .03, C('#6a4a2a'), seg=6)
    torno(m, 0, 0, [(.06, -.06), (.34, -.36)], C('#c79a52'), seg=10, tapa_arriba=False, tapa_abajo=False, suave=False)
    torno(m, 0, 0, [(.34, -.36), (.3, -.35), (.06, -.06)], C('#f2e2b8'), seg=10, tapa_arriba=False, tapa_abajo=False, suave=False)
    bola(m, 0, -.28, 0, .07, C('#ffe6a8'), seg=6, mat='ss_in_luz', nivel=0)
    m.poly([(.33 * math.cos(2 * math.pi * i / 10), -.355, .33 * math.sin(2 * math.pi * i / 10)) for i in range(10)], 'ss_in_luz', n=(0, -1, 0))
_lamp('lampara.canasta', 'pantalla de mimbre ancha', _canasta)
def _gota(m):
    cilindro(m, 0, 0, -.03, 0, .015, C('#222222'), seg=6)
    torno(m, 0, 0, [(0, -.42), (.07, -.34), (.12, -.2), (.08, -.1), (.02, -.04)], C('#ffe3a0'), seg=8, mat='ss_in_luz', tapa_arriba=False, tapa_abajo=False)
_lamp('lampara.gota', 'lágrima de cristal luminosa', _gota)
m = pieza('lampara.cable', 'cable de cuelgue (se escala en Y: origen arriba, baja hacia -Y)', (1, 1, 1), estira='y')
caja(m, -.006, -1, -.006, .006, 0, .006, C('#1f1f1f'), skip=('+y', '-y'))
m = pieza('luz.riel', 'carril de focos con tres focos de latón (origen en el techo)', (1, 1, 1))
caja(m, -.5, -.03, -.02, .5, 0, .02, C('#2a2a2a'))
for x in (-.35, 0, .35):
    caja(m, x - .01, -.1, -.01, x + .01, -.03, .01, C('#2a2a2a'))
    torno(m, x, .0, [(.025, -.12), (.05, -.22)], C('#3a3a3a'), seg=7, tapa_arriba=False, tapa_abajo=False, suave=False)
    m.poly([(x + .05 * math.cos(2 * math.pi * i / 7), -.222, .05 * math.sin(2 * math.pi * i / 7)) for i in range(7)], 'ss_in_luz', n=(0, -1, 0))

# ---------------------------------------------------------------- pizarras, espejos y cuadros (espalda en z=0)
def _pizarra(id, nota, filas, dibujo):
    m = pieza(id, nota, (1, 1, 1))
    r = azar(id)
    caja(m, -.5, 0, 0, .5, .72, .04, C('#6a4a2a'), skip=('-z', '-y'))
    caja(m, -.45, .04, .035, .45, .68, .042, C('#25302d'), skip=('-z', '-y'))
    m.quad((-.3, .58, .045), (.3, .58, .045), (.3, .63, .045), (-.3, .63, .045), 'ss_in', col=C('#efe3c0'), n=(0, 0, 1))
    for k in range(filas):
        y = .5 - k * .06; w = .5 + r.random() * .25
        m.quad((-.4, y, .045), (-.4 + w * .6, y, .045), (-.4 + w * .6, y + .022, .045), (-.4, y + .022, .045), 'ss_in', col=C('#e8e2cc'), n=(0, 0, 1))
        m.quad((.25, y, .045), (.38, y, .045), (.38, y + .022, .045), (.25, y + .022, .045), 'ss_in', col=C('#e8d9a0'), n=(0, 0, 1))
    dibujo(m, r)
_pizarra('pizarra.menu_pan', 'pizarra de menú con título y espiga dibujada', 6, lambda m, r: [m.quad((-.02 + dx * .02, .16, .046), (.03 + dx * .02, .16, .046), (.01 + dx * .02, .34 + dx * .01, .046), (-.01 + dx * .02, .34, .046), 'ss_in', col=C('#efe3a8'), n=(0, 0, 1)) for dx in range(-3, 4)])
_pizarra('pizarra.menu_cafe', 'pizarra de menú con taza dibujada', 6, lambda m, r: (caja(m, -.04, .1, .045, .08, .2, .048, C('#efe8d6'), skip=('-z', '-y')), caja(m, .08, .13, .045, .12, .18, .048, C('#efe8d6'), skip=('-z', '-y'))))

def _espejo_redondo(m, rad=.42, cy=.5):
    anillo_xy(m, 0, cy, .02, rad, rad - .05, C(LATON), seg=16, grosor=.02)
    disco_xy(m, 0, cy, .025, rad - .05, 'ss_in_espejo', seg=16)
    cilindro(m, 0, .02, cy - rad - .0, cy - rad + .01, .02, C(LATON), seg=5)
m = pieza('espejo.redondo', 'espejo redondo con marco de latón (Ø0,84; centro a 0,5 m del origen)', (1, 1, 1)); _espejo_redondo(m)
m = pieza('espejo.arco', 'espejo alto de medio punto con marco de madera 0,7×1,8', (1, 1, 1))
arco_pts = [(-.35, 0), (.35, 0), (.35, 1.45)] + [(.35 * math.cos(math.pi * i / 10), 1.45 + .35 * math.sin(math.pi * i / 10)) for i in range(1, 10)] + [(-.35, 1.45)]
extruir_xy(m, arco_pts, 0, .04, C('#6a4a2a'))
ip = [(x * .86, y if y < 1 else 1.45 + (y - 1.45) * .86) for x, y in arco_pts]
ip = [(x, max(.07, y)) for x, y in ip]
m.poly([(x, y, .042) for x, y in ip], 'ss_in_espejo', n=(0, 0, 1))
m = pieza('cuadros.galeria', 'cinco cuadros de distinto tamaño en marcos de colores', (1, 1, 1))
r = azar('cuadros')
for (x, y, w, h, cc) in [(-.45, .5, .35, .45, '#2f5d7a'), (-.05, .62, .3, .3, '#c9693d'), (.3, .45, .4, .3, '#3f6a4b'), (-.12, .2, .22, .22, '#d7b25a'), (.35, .12, .24, .3, '#8a5a8f')]:
    caja(m, x - w / 2, y - h / 2, 0, x + w / 2, y + h / 2, .03, C(MADERA if r.random() < .5 else LATON), skip=('-z',))
    m.quad((x - w / 2 + .03, y - h / 2 + .03, .032), (x + w / 2 - .03, y - h / 2 + .03, .032), (x + w / 2 - .03, y + h / 2 - .03, .032), (x - w / 2 + .03, y + h / 2 - .03, .032), 'ss_in', col=C(cc), n=(0, 0, 1))
    m.quad((x - w / 2 + .03, y - h / 2 + .03, .034), (x + w / 2 - .03, y - h / 2 + .03, .034), (x + w / 2 - .03, y - h / 2 + .09, .034), (x - w / 2 + .03, y - h / 2 + .09, .034), 'ss_in', col=C('#e9dfc4'), n=(0, 0, 1))
