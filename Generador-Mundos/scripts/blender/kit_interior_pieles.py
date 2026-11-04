# Pieles del interior: suelos, fondos (también laterales, girados 90°) y techos. Color de vértice; sin atlas.
# Suelo: x -0,5..0,5, z 0..-1, y=0 (cara +Y). Fondo: x -0,5..0,5, y 0..1, z=0 (cara +Z). Techo: x -0,5..0,5, z 0..-1, y=0 (cara -Y).
from kit_geom import C, mezcla, vari, azar, pieza, caja

D_SUELO = (3.6, 1, 1.4)

def _suelo(id, nota, nx, nz, color, familia='piel'):
    m = pieza(id, nota, D_SUELO, familia, 'xz')
    r = azar(id)
    for i in range(nx):
        for j in range(nz):
            x0, x1 = -.5 + i / nx, -.5 + (i + 1) / nx; z0, z1 = -j / nz, -(j + 1) / nz
            col = color(i, j, r)
            m.quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1), 'ss_in', n=(0, 1, 0), col=col)
    return m

_suelo('suelo.damero_crema', 'damero de baldosa crema y salvia 8×4', 8, 4, lambda i, j, r: vari(C('#e8dcc0') if (i + j) % 2 else C('#9fae8a'), r, .06))
_suelo('suelo.damero_negro', 'damero blanco y negro 8×4 (bar, café)', 8, 4, lambda i, j, r: vari(C('#ece8de') if (i + j) % 2 else C('#2b2a2c', 1.3), r, .05))
_suelo('suelo.baldosa_roja', 'baldosa de barro cocido con juntas 8×4', 8, 4, lambda i, j, r: vari(C('#b2573a'), r, .14))
_suelo('suelo.terrazo', 'terrazo claro con tonos', 8, 4, lambda i, j, r: vari(mezcla(C('#d9d3c6'), C('#b8b0a0'), r.random() * .6), r, .05))
_suelo('suelo.tablones_roble', 'tablones de roble a lo largo (10)', 10, 1, lambda i, j, r: vari(C('#b98a55'), r, .12))
_suelo('suelo.tablones_oscuro', 'tablones de nogal oscuro (10)', 10, 1, lambda i, j, r: vari(C('#5a3a24'), r, .12))

def _hidraulico(id, nota, c1, c2, c3, c4):
    m = pieza(id, nota, D_SUELO, 'piel', 'xz')
    nx, nz = 6, 3
    for i in range(nx):
        for j in range(nz):
            x0, x1 = -.5 + i / nx, -.5 + (i + 1) / nx; z0, z1 = -j / nz, -(j + 1) / nz; xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
            m.quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1), 'ss_in', n=(0, 1, 0), col=C(c1))
            hx, hz = (x1 - x0) / 2, (z0 - z1) / 2
            m.quad((xm, .002, z0), (x1, .002, zm), (xm, .002, z1), (x0, .002, zm), 'ss_in', n=(0, 1, 0), col=C(c2))
            s = .42
            m.quad((xm, .003, zm + hz * s), (xm + hx * s, .003, zm), (xm, .003, zm - hz * s), (xm - hx * s, .003, zm), 'ss_in', n=(0, 1, 0), col=C(c3))
            for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):   # florón en las esquinas
                cx, cz = xm + dx * hx * .72, zm + dz * hz * .72; q = .09
                m.quad((cx - hx * q, .003, cz - hz * q), (cx + hx * q, .003, cz - hz * q), (cx + hx * q, .003, cz + hz * q), (cx - hx * q, .003, cz + hz * q), 'ss_in', n=(0, 1, 0), col=C(c4))
    return m
_hidraulico('suelo.hidraulico_turquesa', 'baldosa hidráulica turquesa/crema con rombos', '#e9dfc4', '#2f8f92', '#d9a441', '#2f8f92')
_hidraulico('suelo.hidraulico_terracota', 'baldosa hidráulica terracota/azul', '#efe3c8', '#b5563a', '#25507a', '#c99a3d')

def _fondo(id, nota, construir):
    m = pieza(id, nota, (3.6, 3.0, 1), 'piel', 'xy')
    construir(m, azar(id))
    return m

def _franjas_h(m, ys, colores, x0=-.5, x1=.5):
    for k in range(len(ys) - 1):
        m.quad((x0, ys[k], 0), (x1, ys[k], 0), (x1, ys[k + 1], 0), (x0, ys[k + 1], 0), 'ss_in', n=(0, 0, 1), col=colores(k))

def _azulejo(blanco, cabo, yeso, banda):
    def f(m, r):
        n = 14; tope = .42
        ys = [tope * i / n for i in range(n + 1)]
        _franjas_h(m, ys, lambda k: vari(C(blanco), r, .04) if k % 2 else vari(C(blanco, .96), r, .04))
        for i in range(0, 12):   # juntas verticales alternadas como medio punto (rombos de junta)
            x = -.5 + (i + .5) / 12
            for k in range(0, n, 2):
                m.quad((x - .0018, ys[k], .001), (x + .0018, ys[k], .001), (x + .0018, ys[k + 1], .001), (x - .0018, ys[k + 1], .001), 'ss_in', n=(0, 0, 1), col=C(blanco, .8))
        m.quad((-.5, tope, .002), (.5, tope, .002), (.5, tope + .012, .002), (-.5, tope + .012, .002), 'ss_in', n=(0, 0, 1), col=C(cabo))
        m.quad((-.5, tope + .012, 0), (.5, tope + .012, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_in', n=(0, 0, 1), col=C(yeso))
        m.quad((-.5, .86, .001), (.5, .86, .001), (.5, .875, .001), (-.5, .875, .001), 'ss_in', n=(0, 0, 1), col=C(banda))
    return f
_fondo('fondo.azulejo_blanco', 'azulejo metro blanco hasta 1,26 m, remate salvia, enlucido crema', _azulejo('#f1eee6', '#7f9b7c', '#eadfc4', '#c3a05a'))
_fondo('fondo.azulejo_verde', 'azulejo metro verde botella, remate crema, enlucido ocre', _azulejo('#3d6e57', '#e9dfc4', '#e1c98f', '#7a2e2a'))

def _ladrillo(m, r):
    n = 24
    ys = [i / n for i in range(n + 1)]
    _franjas_h(m, ys, lambda k: vari(C('#a8553a') if k % 2 else C('#b46544'), r, .08))
    for k in range(n):
        off = (k % 2) * .5
        for i in range(10):
            x = -.5 + (i + off) / 9.6
            if -.5 < x < .5:
                m.quad((x - .0016, ys[k], .001), (x + .0016, ys[k], .001), (x + .0016, ys[k + 1], .001), (x - .0016, ys[k + 1], .001), 'ss_in', n=(0, 0, 1), col=C('#5a2b1d'))
    # veta clara en la parte alta (hilada de remate)
    m.quad((-.5, .94, .002), (.5, .94, .002), (.5, 1, .002), (-.5, 1, .002), 'ss_in', n=(0, 0, 1), col=C('#d9cdb2'))
_fondo('fondo.ladrillo_visto', 'ladrillo visto en 24 hiladas con juntas y remate claro', _ladrillo)

def _listones(m, r):
    n = 24
    for i in range(n):
        x0, x1 = -.5 + i / n, -.5 + (i + 1) / n
        m.quad((x0, 0, 0), (x1 - .003, 0, 0), (x1 - .003, 1, 0), (x0, 1, 0), 'ss_in', n=(0, 0, 1), col=vari(C('#a97c50'), r, .10))
    m.quad((-.5, .0, .01), (.5, 0, .01), (.5, .08, .01), (-.5, .08, .01), 'ss_in', n=(0, 0, 1), col=C('#5a3a24'))
_fondo('fondo.listones_madera', 'listones verticales de madera tostada con rodapié', _listones)

def _empapelado(m, r):
    n = 20
    for i in range(n):
        x0, x1 = -.5 + i / n, -.5 + (i + 1) / n
        m.quad((x0, .33, 0), (x1, .33, 0), (x1, 1, 0), (x0, 1, 0), 'ss_in', n=(0, 0, 1), col=C('#e6d3a0') if i % 2 else C('#d9b9a0'))
    m.quad((-.5, 0, 0), (.5, 0, 0), (.5, .31, 0), (-.5, .31, 0), 'ss_in', n=(0, 0, 1), col=C('#5b3a4e'))
    for i in range(6):
        x0 = -.5 + i / 6
        m.quad((x0 + .01, .04, .004), (x0 + .15, .04, .004), (x0 + .15, .27, .004), (x0 + .01, .27, .004), 'ss_in', n=(0, 0, 1), col=C('#6e4a60'))
    m.quad((-.5, .31, .006), (.5, .31, .006), (.5, .335, .006), (-.5, .335, .006), 'ss_in', n=(0, 0, 1), col=C('#caa56a'))
_fondo('fondo.empapelado_rayas', 'papel pintado a rayas con dado de madera ciruela', _empapelado)

def _dado(m, r):
    m.quad((-.5, .36, 0), (.5, .36, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_in', n=(0, 0, 1), col=C('#ddd2b9'))
    m.quad((-.5, 0, 0), (.5, 0, 0), (.5, .36, 0), (-.5, .36, 0), 'ss_in', n=(0, 0, 1), col=C('#6f5a4a'))
    for i in range(8):
        x0 = -.5 + i / 8
        m.quad((x0 + .012, .04, .004), (x0 + .113, .04, .004), (x0 + .113, .33, .004), (x0 + .012, .33, .004), 'ss_in', n=(0, 0, 1), col=C('#7e664f'))
    m.quad((-.5, .36, .008), (.5, .36, .008), (.5, .385, .008), (-.5, .385, .008), 'ss_in', n=(0, 0, 1), col=C('#a98f6d'))
    m.quad((-.5, .82, .004), (.5, .82, .004), (.5, .836, .004), (-.5, .836, .004), 'ss_in', n=(0, 0, 1), col=C('#c3a982'))
_fondo('fondo.enlucido_dado', 'enlucido crema con dado de madera moldurado y moldura de cuadros', _dado)

def _sillar(m, r):
    n = 8
    ys = [i / n for i in range(n + 1)]
    _franjas_h(m, ys, lambda k: vari(C('#cdbf9f') if k % 2 else C('#c1b291'), r, .06))
    for k in range(n):
        off = (k % 2) * .5
        for i in range(5):
            x = -.5 + (i + off) / 4.2
            if -.5 < x < .5:
                m.quad((x - .002, ys[k], .001), (x + .002, ys[k], .001), (x + .002, ys[k + 1], .001), (x - .002, ys[k + 1], .001), 'ss_in', n=(0, 0, 1), col=C('#7d705a'))
_fondo('fondo.piedra_sillar', 'sillares de arenisca en 8 hiladas', _sillar)

def _pizarra(m, r):
    m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 1, 0), (-.5, 1, 0), 'ss_in', n=(0, 0, 1), col=C('#2a4a52'))
    m.quad((-.5, .46, .004), (.5, .46, .004), (.5, .48, .004), (-.5, .48, .004), 'ss_in', n=(0, 0, 1), col=C('#c9a14a'))
    m.quad((-.5, 0, .004), (.5, 0, .004), (.5, .12, .004), (-.5, .12, .004), 'ss_in', n=(0, 0, 1), col=C('#1c3238'))
_fondo('fondo.pintura_petroleo', 'pintura petróleo con friso dorado y rodapié', _pizarra)

# ---------------------------------------------------------------- techos (cara -Y, y=0 es el techo; las vigas cuelgan hacia -Y)
def _techo(id, nota, construir):
    m = pieza(id, nota, (3.6, 1, 1.4), 'piel', 'xz')
    construir(m, azar(id))
    return m

def _t_liso(m, r):
    m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 0, -1), (-.5, 0, -1), 'ss_in', n=(0, -1, 0), col=C('#e9e1cf'))
_techo('techo.liso', 'techo liso claro', _t_liso)

def _t_vigas(m, r):
    m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 0, -1), (-.5, 0, -1), 'ss_in', n=(0, -1, 0), col=C('#e3d9c2'))
    for i in range(5):
        x = -.5 + (i + .5) / 5
        caja(m, x - .025, -.15, -1, x + .025, 0, 0, vari(C('#6a4a30'), r, .1), skip=('+y', '-z', '+z'))
_techo('techo.vigas', 'cinco vigas de madera vistas de 0,15 m', _t_vigas)

def _t_casetones(m, r):
    nx, nz = 6, 3
    for i in range(nx):
        for j in range(nz):
            x0, x1 = -.5 + i / nx + .006, -.5 + (i + 1) / nx - .006; z0, z1 = -j / nz - .01, -(j + 1) / nz + .01
            m.quad((x0, -.03, z0), (x1, -.03, z0), (x1, -.03, z1), (x0, -.03, z1), 'ss_in', n=(0, -1, 0), col=C('#efe5cd'))
            caja(m, x0, -.03, z1, x1, 0, z0, C('#c9b98f'), skip=('+y', '-y'))
    m.quad((-.5, 0, 0), (.5, 0, 0), (.5, 0, -1), (-.5, 0, -1), 'ss_in', n=(0, -1, 0), col=C('#c9b98f'))
_techo('techo.casetones', 'casetones 6×3 de escayola con marco', _t_casetones)

def _t_estano(m, r):
    nx, nz = 12, 6
    for i in range(nx):
        for j in range(nz):
            x0, x1 = -.5 + i / nx, -.5 + (i + 1) / nx; z0, z1 = -j / nz, -(j + 1) / nz
            m.quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1), 'ss_in', n=(0, -1, 0), col=C('#d8cfa8') if (i + j) % 2 else C('#c6bd95'))
_techo('techo.estano', 'techo de chapa estampada a cuadros (12×6)', _t_estano)
