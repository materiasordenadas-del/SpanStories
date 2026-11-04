# Genera los árboles del jardín en el estilo del arte de referencia del
# usuario: copas de racimos esculpidos (no círculos), 3 tonos de verde,
# tronco marrón con ramas. Cada racimo pertenece ENTERO a una capa de
# profundidad (fondo oscuro / medio / highlights) -> atlas de 3 celdas que
# PorticoGarden apila en Z para el parallax 2.5D. Sin cortes ni artefactos.
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

# Rutas relativas a este script: se puede ejecutar desde cualquier carpeta.
OUT = str(Path(__file__).resolve().parent.parent / 'assets' / 'trees')
W, H = 480, 640  # celda (el atlas es 3*W x H)

TONES = {
    'dark':  ((46, 106, 52), (34, 82, 40)),
    'mid':   ((87, 160, 71), (66, 128, 54)),
    'light': ((164, 212, 95), (128, 172, 64)),
}
BARK = {'base': (122, 82, 54), 'lit': (154, 111, 73), 'dark': (82, 54, 38)}


def rng(seed):
    s = seed
    while True:
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        yield s / 0x7FFFFFFF


def clump(draw, mask_draw, cx, cy, r, tone, rand, sy=.9, jit=12):
    """Racimo esculpido: pétalos redondeados superpuestos con borde dibujado.
    Dibuja el relleno en `draw` y su máscara en `mask_draw` (para el shading).
    `jit` varía ligeramente el tono por racimo para que se lean las formas."""
    fill0, edge0 = TONES[tone]
    j = (next(rand) - .5) * 2 * jit
    fill = tuple(max(0, min(255, int(c + j))) for c in fill0)
    edge = tuple(max(0, min(255, int(c + j))) for c in edge0)
    n = 8 + int(next(rand) * 3)
    petals = []
    for i in range(n):
        a = 2 * math.pi * i / n + next(rand) * .45
        rr = r * (.5 + next(rand) * .5)
        px, py = cx + math.cos(a) * r * .5, cy + math.sin(a) * r * .5 * sy
        petals.append((px, py, rr))
    petals.append((cx, cy, r * .95))
    # Borde: pétalos inflados en color de contorno.
    for (px, py, rr) in petals:
        d = rr + 2.5
        draw.ellipse([px - d, py - d * sy, px + d, py + d * sy], fill=edge + (255,))
    # Relleno.
    for (px, py, rr) in petals:
        draw.ellipse([px - rr, py - rr * sy, px + rr, py + rr * sy], fill=fill + (255,))
        mask_draw.ellipse([px - rr, py - rr * sy, px + rr, py + rr * sy], fill=(255,))


def shade(cell, mask, spots):
    """Sombreado suave (luz arriba-izquierda, penumbra abajo) recortado a la máscara."""
    arr = np.asarray(cell).astype(np.float32)
    m = (np.asarray(mask) > 40).astype(np.float32)
    h, w = m.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    add = np.zeros((h, w, 3), np.float32)
    for (cx, cy, r, kind) in spots:
        if kind == 'light':
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (r * 1.25)
            f = np.clip(1 - d, 0, 1) ** 1.7
            add += f[..., None] * np.array([34, 52, 16], np.float32)
        else:
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (r * 1.3)
            f = np.clip(1 - d, 0, 1) ** 1.9
            add -= f[..., None] * np.array([22, 38, 24], np.float32)
    arr[..., :3] = np.clip(arr[..., :3] + add * m[..., None], 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def trunk_and_branches(draw, cx, base_y, top_y, rand, spread=1.0):
    def branch(x0, y0, x1, y1, w0, w1, col):
        steps = 14
        pts_l, pts_r = [], []
        for i in range(steps + 1):
            t = i / steps
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t - math.sin(t * math.pi) * 10
            wdt = w0 + (w1 - w0) * t
            nx, ny = (y1 - y0), -(x1 - x0)
            ln = math.hypot(nx, ny) or 1
            nx, ny = nx / ln * wdt / 2, ny / ln * wdt / 2
            pts_l.append((x + nx, y + ny)); pts_r.append((x - nx, y - ny))
        draw.polygon(pts_l + pts_r[::-1], fill=col + (255,))
    split_y = base_y - (base_y - top_y) * .52
    branch(cx, base_y, cx, split_y, 34, 20, BARK['base'])
    # Las ramas terminan DENTRO de la copa (nunca asoman desnudas).
    for (dx, ty, w) in [(-.30 * spread, .10, 13), (.32 * spread, .06, 12), (.04, -.16, 11)]:
        branch(cx, split_y, cx + dx * (base_y - top_y) * .7, split_y - (split_y - top_y) * (.55 + ty), 15, 5, BARK['base'])
    # Luz a la izquierda, sombra a la derecha.
    branch(cx - 5, base_y, cx - 4, split_y, 7, 4, BARK['lit'])
    branch(cx + 6, base_y, cx + 5, split_y, 6, 4, BARK['dark'])


def build_tree(idx, seed):
    rand = rng(seed)
    cells = [Image.new('RGBA', (W, H), (0, 0, 0, 0)) for _ in range(3)]
    cx = W * .5
    base_y = H - 14
    top_y = H * .16
    # Disposición de racimos: anillo inferior + corona superior, con hueco
    # central para que el tronco se lea entre follaje.
    clumps = []
    n_low = 6 + int(next(rand) * 2)
    for i in range(n_low):
        a = math.pi * (.12 + .76 * i / max(1, n_low - 1)) + next(rand) * .18
        rr = W * (.26 + next(rand) * .06)
        clumps.append((cx - math.cos(a) * rr, H * .55 + math.sin(a) * H * .11,
                       W * (.14 + next(rand) * .04), 'low'))
    crown_n = 5 + int(next(rand) * 2)
    for i in range(crown_n):
        a = -math.pi / 2 + (i - (crown_n - 1) / 2) * .55 + next(rand) * .2
        rr = W * (.16 + next(rand) * .05)
        clumps.append((cx + math.cos(a) * rr * 1.5, H * .31 + math.sin(a) * H * .10 + next(rand) * 10,
                       W * (.13 + next(rand) * .04), 'crown'))
    clumps.append((cx + next(rand) * 8 - 4, H * .25, W * .16, 'crown'))

    # Celda 0 (fondo): silueta completa en tono oscuro; el tronco se dibuja
    # DESPUÉS para que quede visible sobre el follaje oscuro (como la fuente).
    d0, m0 = ImageDraw.Draw(cells[0]), ImageDraw.Draw(m0_img := Image.new('L', (W, H), 0))
    for (x, y, r, kind) in clumps:
        clump(d0, m0, x, y, r, 'dark', rand)
    for (x, y, r, kind) in clumps[:3]:
        clump(d0, m0, x + (next(rand) * 30 - 15), y + r * .8, r * .42, 'dark', rand)
    trunk_and_branches(d0, cx, base_y, top_y, rand)
    cells[0] = shade(cells[0], m0_img, [(cx, H * .66, W * .5, 'dark')])

    # Celda 1 (medio): racimos de corona en tono medio + copetes claros.
    d1, m1 = ImageDraw.Draw(cells[1]), ImageDraw.Draw(m1_img := Image.new('L', (W, H), 0))
    for (x, y, r, kind) in clumps:
        if kind == 'crown':
            clump(d1, m1, x, y, r * .96, 'mid', rand)
            clump(d1, m1, x - r * .10, y - r * .26, r * .34, 'light', rand)
    cells[1] = shade(cells[1], m1_img, [(cx - W * .1, H * .26, W * .4, 'light'), (cx, H * .55, W * .4, 'dark')])

    # Celda 2 (frente): pequeños acentos de luz apenas desplazados (parallax).
    d2, m2 = ImageDraw.Draw(cells[2]), ImageDraw.Draw(m2_img := Image.new('L', (W, H), 0))
    for (x, y, r, kind) in clumps:
        if kind == 'crown' and next(rand) < .6:
            clump(d2, m2, x - r * .04, y - r * .34, r * .20, 'light', rand)
    cells[2] = shade(cells[2], m2_img, [(cx - W * .1, H * .24, W * .35, 'light')])

    atlas = Image.new('RGBA', (W * 3, H), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        atlas.paste(c, (W * i, 0))
    atlas.save(f'{OUT}/tree-{idx}-layers.png')
    print(f'tree-{idx}-layers.png', atlas.size)


for i, seed in enumerate([11, 23, 37], 1):
    build_tree(i, seed)

with open(f'{OUT}/tree-manifest.js', 'w', encoding='utf-8') as f:
    f.write('// Generado por generar-arboles.py: árboles estilo SpanStories en el\n'
            '// mismo lenguaje del arte de referencia del usuario (racimos esculpidos,\n'
            '// 3 tonos, tronco con ramas). aspect = ancho/alto de celda; pivotX = 0.5\n'
            '// (tronco centrado en la celda).\n'
            'export const TREES = {\n'
            + ''.join(f"  'tree-{i}': {{ aspect: {round(W/H, 4)}, pivotX: 0.5 }},\n" for i in (1, 2, 3))
            + '};\n'
            "export const TREE_ORDER = ['tree-1', 'tree-2', 'tree-3'];\n")
print('tree-manifest.js ok')
