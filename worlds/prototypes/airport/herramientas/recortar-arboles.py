# Recorta los árboles/arbustos del atlas del usuario.
# - Quitar fondo negro con de-alpha premultiplicado (sin halo).
# - Cortar cada árbol en el hueco entre copas; plumear (feather) el borde del
#   corte para que las hojas del vecino no queden chirriadas.
# - Recentrar el tronco y exportar un manifiesto JS con el pivote de cada PNG.
import json
from pathlib import Path
import numpy as np
from PIL import Image

# Rutas relativas a este script: se puede ejecutar desde cualquier carpeta.
OUT = str(Path(__file__).resolve().parent.parent / 'assets' / 'trees')
SRC = OUT + '/fuente-atlas.png'

img = Image.open(SRC).convert('RGB')
a = np.asarray(img).astype(np.float32)
maxc = a.max(axis=2)
alpha = np.clip((maxc - 10.0) / 30.0, 0, 1)
rgb = np.clip(a / np.maximum(alpha[..., None], 0.06), 0, 255)
rgba = np.dstack([rgb, alpha * 255]).astype(np.float32)

TREE_SEAMS = [0, 497, 980, 1391, 1774]
BUSH_SEAMS = [0, 444, 470, 758, 779, 988, 1000, 1499, 1527, 1774]
BUSH_SEAMS = [0, 457, 768, 983, 1499, 1527, 1774]  # pares: inicio de cada hueco
TREE_Y = (0, 683)
BUSH_Y = (684, 887)

def feather(rgba, x0, x1, amount):
    """Suaviza alpha verticalmente cerca de los bordes de celda."""
    out = rgba.copy()
    W = out.shape[1]
    for (edge, direction) in ((x0, 1), (x1, -1)):
        for i in range(amount):
            x = edge + direction * i
            if 0 <= x < W:
                k = (i + 1) / (amount + 1)
                out[:, x, 3] *= (1 - k) if direction == 1 else k
    return out

def trunk_center(cell, y0, y1):
    band = cell[y0:y1]
    brown = (band[..., 0] > 70) & (band[..., 0] > band[..., 1] * 1.25) & (band[..., 1] > band[..., 2] * 1.3)
    ys, xs = np.where(brown)
    if len(xs) < 30:
        return cell.shape[1] / 2
    return float(np.median(xs))

def tight(rgba_cell, mask_thresh=40):
    m = rgba_cell[..., 3] > mask_thresh
    ys, xs = np.where(m)
    if len(xs) == 0:
        return rgba_cell, (0, rgba_cell.shape[1])
    pad = 3
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, rgba_cell.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, rgba_cell.shape[1])
    return rgba_cell[y0:y1, x0:x1], (x0, x1)

def recolor_alpha(cell):
    im = Image.fromarray(cell[..., :3].astype(np.uint8), 'RGB')
    al = Image.fromarray(cell[..., 3].astype(np.uint8), 'L')
    out = Image.merge('RGBA', (*im.split(), al))
    return out

def despeckle(cell, min_area):
    """Elimina fragmentos de alfa desconectados (hojas del vecino aisladas)."""
    from scipy import ndimage
    m = cell[..., 3] > 40
    lab, n = ndimage.label(m)
    if n <= 1:
        return cell
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = {i + 1 for i, s in enumerate(sizes) if s >= min_area}
    drop = ~np.isin(lab, list(keep)) & m
    cell = cell.copy()
    cell[drop, 3] = 0
    return cell

def layered_atlas(idx):
    """Divide el árbol en 3 capas de profundidad según su luminancia (la
    pintura ya está hecha por capas: base oscura, tonos medios, highlights).
    Apiladas en Z con offsets pequeños producen parallax real al moverse."""
    from scipy.ndimage import gaussian_filter
    im = np.asarray(Image.open(f'{OUT}/tree-{idx}.png').convert('RGBA')).astype(np.float32)
    r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
    L = .2126 * r + .7152 * g + .0722 * b
    soft = 20
    a_mid = a * np.clip((L - 112 + soft) / (2 * soft), 0, 1)
    a_front = a * np.clip((L - 148 + soft) / (2 * soft), 0, 1)
    a_mid = gaussian_filter(a_mid, 1.4)
    a_front = gaussian_filter(a_front, 1.4)
    back = np.dstack([np.clip(r * .72, 0, 255), np.clip(g * .74, 0, 255), np.clip(b * .72, 0, 255), a])
    mid = np.dstack([r, g, b, a_mid])
    front = np.dstack([np.clip(r * 1.05, 0, 255), np.clip(g * 1.05, 0, 255), np.clip(b * 1.02, 0, 255), a_front])
    atlas = np.concatenate([back, mid, front], axis=1)
    Image.fromarray(atlas.astype(np.uint8)).save(f'{OUT}/tree-{idx}-layers.png')
    print(f'tree-{idx}-layers.png', atlas.shape[1], atlas.shape[0])

manifest = {'trees': {}, 'bushes': {}}

# --- Árboles ---
for i in range(4):
    x0, x1 = TREE_SEAMS[i], TREE_SEAMS[i + 1]
    cell = rgba[TREE_Y[0]:TREE_Y[1], x0:x1]
    cell = feather(cell, 0, cell.shape[1] - 1, 24)
    cell = despeckle(cell, 900)
    cx = trunk_center(cell, int(cell.shape[0] * .6), cell.shape[0])
    cropped, (cx0, cx1) = tight(cell)
    pivot = (cx - cx0) / cropped.shape[1]
    im = recolor_alpha(cropped)
    H = 640
    W = max(2, round(im.size[0] * H / im.size[1] / 2) * 2)
    im = im.resize((W, H), Image.LANCZOS)
    im.save(f'{OUT}/tree-{i+1}.png')
    layered_atlas(i + 1)
    manifest['trees'][f'tree-{i+1}'] = {'aspect': round(W / H, 4), 'pivotX': round(pivot, 4)}
    print(f'tree-{i+1}.png', im.size, 'pivotX', round(pivot, 3))

# --- Arbustos ---
seams = [(0, 444), (470, 758), (779, 988), (1000, 1499), (1527, 1774)]
for i, (x0, x1) in enumerate(seams):
    cell = rgba[BUSH_Y[0]:BUSH_Y[1], x0:x1]
    cell = feather(cell, 0, cell.shape[1] - 1, 12)
    cell = despeckle(cell, 350)
    cropped, _ = tight(cell)
    im = recolor_alpha(cropped)
    H = 300
    W = max(2, round(im.size[0] * H / im.size[1] / 2) * 2)
    im = im.resize((W, H), Image.LANCZOS)
    im.save(f'{OUT}/bush-{i+1}.png')
    manifest['bushes'][f'bush-{i+1}'] = {'aspect': round(W / H, 4), 'pivotX': 0.5}
    print(f'bush-{i+1}.png', im.size)

with open(f'{OUT}/manifest.json', 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print('manifest.json ok')
