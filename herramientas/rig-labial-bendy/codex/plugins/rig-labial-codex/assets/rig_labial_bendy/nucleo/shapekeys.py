# Paso 5b: shape keys correctivas del lip roll hacia dentro (labio_sup_dentro / labio_inf_dentro).
# En la pose de roll in completo se suaviza (Taubin, solo dentro de cada labio), se recorta el pico central
# del labio superior contra una línea de cierre suave y se mete hacia dentro; el desplazamiento se pasa a
# reposo con crazyspace. Solo borra sus propias keys.
import bpy, math
import numpy as np
from mathutils import Vector
from . import util

ROLL_IN = {'sup': -35.0, 'inf': 35.0}
ITER = 12


def labio_dentro(cara, rig, M):
    util.modo_objeto()
    me = cara.data
    N = len(me.vertices)
    PUSH = M.L(0.0005)
    def group_sum(prefix):
        idx = {g.index for g in cara.vertex_groups if g.name.startswith(prefix)}
        w = np.zeros(N)
        for v in me.vertices:
            for g in v.groups:
                if g.group in idx: w[v.index] += g.weight
        return w
    MASK = {'sup': group_sum('DEF-labio_sup'), 'inf': group_sum('DEF-labio_inf')}
    LABEL = np.where(MASK['sup'] >= MASK['inf'], 0, 1)
    nbr = [[] for _ in range(N)]
    for e in me.edges:
        a, b = e.vertices
        if LABEL[a] == LABEL[b]:
            nbr[a].append(b); nbr[b].append(a)
    if not me.shape_keys:
        cara.shape_key_add(name='Basis', from_mix=False)
    kb = me.shape_keys.key_blocks
    ad = me.shape_keys.animation_data
    for lip in ('sup', 'inf'):
        n = f'labio_{lip}_dentro'
        if ad:
            fc = ad.drivers.find(f'key_blocks["{n}"].value')
            if fc: ad.drivers.remove(fc)
        if n in kb: cara.shape_key_remove(kb[n])
    cs = cara.modifiers.get('Suavizado boca')
    if cs: cs.show_viewport = False
    def evaluated():
        dg = bpy.context.evaluated_depsgraph_get()
        ev = cara.evaluated_get(dg)
        co = np.zeros(N * 3); ev.data.vertices.foreach_get('co', co)
        return co.reshape(-1, 3)
    PB = rig.pose.bones
    util.pose_reposo(rig)
    for n in ('boca', 'MCH-labio_sup_padre', 'MCH-labio_inf_padre', 'labio_sup', 'labio_inf'):
        PB[n].rotation_mode = 'XYZ'
    PB['boca'].rotation_euler = (math.radians(-80), 0, 0)
    bpy.context.view_layer.update()
    D = evaluated()
    FRONT_Y = M.Yc(-0.028)
    ms = (MASK['sup'] > 0.3) & (LABEL == 0) & (D[:, 1] < FRONT_Y)
    out = {}
    if ms.any():
        xs, zs = [], []
        xmax = np.abs(D[ms, 0] - M.cx).max()
        for b in np.linspace(-xmax, xmax, 25):
            sel = ms & (np.abs((D[:, 0] - M.cx) - b) < xmax / 24)
            if sel.any(): xs.append(b); zs.append(D[sel, 2].min())
        xs, zs = np.array(xs), np.array(zs)
        keep = np.ones(len(xs), bool)
        for _ in range(3):
            c = np.polyfit(xs[keep] ** 2, zs[keep], 1)
            keep = zs > np.polyval(c, xs ** 2) - M.L(0.0002)
        ZLINE = lambda x: np.polyval(c, x ** 2)
    else:
        ZLINE = None
    dg = bpy.context.evaluated_depsgraph_get()
    cara.crazyspace_eval(dg, bpy.context.scene)
    for lip, lab in (('sup', 0), ('inf', 1)):
        m = np.clip(MASK[lip] * 1.5, 0, 1) * (LABEL == lab)
        ids = np.nonzero(m > 1e-3)[0]
        Pp = D.copy()
        for it in range(ITER * 2):
            f = 0.5 if it % 2 == 0 else -0.53
            Q = Pp.copy()
            for i in ids:
                if nbr[i]:
                    Q[i] = Pp[i] + (Pp[nbr[i]].mean(0) - Pp[i]) * f * m[i]
            Pp = Q
        dz = np.zeros(N)
        if lip == 'sup' and ZLINE is not None:
            u = Pp[:, 0] - M.cx
            front = (Pp[:, 1] < FRONT_Y) & (np.abs(u) < 0.95 * M.hw)   # solo dentro del ancho de la boca
            dz = np.where(front, np.maximum(0, ZLINE(u) - Pp[:, 2]), 0) * (m > 1e-3)
            for _ in range(6):
                d2 = dz.copy()
                for i in ids:
                    if nbr[i]:
                        avg = dz[nbr[i]].mean()
                        if abs(avg) > abs(dz[i]) * 0.5:
                            d2[i] = (dz[i] + avg) / 2 if abs(avg) > abs(dz[i]) else dz[i]
                dz = d2
        Pp[:, 2] += dz
        Pp[ids, 1] += PUSH * m[ids]
        key = cara.shape_key_add(name=f'labio_{lip}_dentro', from_mix=False)
        co = np.zeros(N * 3); kb['Basis'].data.foreach_get('co', co); co = co.reshape(-1, 3)
        cap = M.L(0.002)          # donde la deformación casi aplasta (comisura) crazyspace amplifica: tope
        for i in ids:
            d = np.array(cara.crazyspace_displacement_to_original(vertex_index=int(i), displacement=Vector(Pp[i] - D[i])))
            ln = np.linalg.norm(d)
            if ln > cap: d *= cap / ln
            co[i] += d
        key.data.foreach_set('co', co.ravel())
        key.slider_min = 0.0; key.slider_max = 1.0
        out[lip] = {'verts': int(len(ids)), 'max_mm': round(float(np.abs(Pp[ids] - D[ids]).max()) * 1000, 3) if len(ids) else 0}
    cara.crazyspace_eval_clear()
    PB['boca'].rotation_euler = (0, 0, 0)
    if cs: cs.show_viewport = True
    for lip in ('sup', 'inf'):
        k = me.shape_keys.key_blocks[f'labio_{lip}_dentro']
        sign = '-' if ROLL_IN[lip] < 0 else ''
        util.driver_transform(k, 'value', f'{sign}(lip + prt) / {math.radians(abs(ROLL_IN[lip])):.4f}', rig,
                              [('lip', f'labio_{lip}', 'ROT_X'), ('prt', f'MCH-labio_{lip}_padre', 'ROT_X')])
    bpy.context.view_layer.update()
    return out
