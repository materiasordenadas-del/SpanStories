# Paso 5a: pesos de la cara para el rig de labios (como rig_labios_pesos.py de Vale).
#  - labios: distancia geodésica a la línea media de cada labio y a su borde de contacto -> máscara;
#    dentro de la máscara, reparto entre los 3 DEF de cada lado por la posición a lo largo de la cadena.
#  - superior / inferior: geodésica desde los bordes de contacto con una BARRERA en la línea de la boca
#    (si la malla tiene los labios unidos, sin ella se mezclarían).
#  - resto de la cara: cabeza o mandíbula por el ángulo alrededor del pivote de la mandíbula.
#  - piezas sueltas dentro de la boca: por encima de la línea de la boca cabeza, por debajo mandíbula.
# Solo la isla de la cara y las piezas de la boca reciben pesos; el resto del objeto queda sin deformar.
import bpy
import numpy as np
from mathutils import Vector
from . import util, medidas, eje_boca, asignacion_piezas


def pesos(cara, rig, M, MED, I=None):
    util.modo_objeto()
    me = cara.data
    P = util.coords(me)
    N = len(P)
    face, isl = medidas.cara_mask(cara, M)
    nb = util.vecinos(me)
    L = M.L
    hw = M.hw
    R = MED['rendija']
    xs = np.array(R['x']); zs_ = np.array(R['z']); ys_ = np.array(R['y'])
    ax = np.abs(eje_boca.radial(P[:, 0], M.cx))
    zsl = np.interp(ax, xs, zs_); ysl = np.interp(ax, xs, ys_)
    lado = np.sign(P[:, 2] - zsl)
    # rendija partida en la malla: copia y original están en la línea; cada uno es del labio de sus vecinos
    dup = util.duplicados(me)
    for i in np.where(dup & face)[0]:
        t = sum(P[j, 2] - zsl[j] for j in nb[i] if not dup[j])
        if t: lado[i] = np.sign(t)
    zona = (ax < xs[-1] * 1.02) & (P[:, 1] < ysl + 1.0 * hw) & face

    def bloqueado(i, j):
        return zona[i] and zona[j] and lado[i] != lado[j]

    idx = np.where(face)[0]
    kd = util.kd_de(P, idx)

    def cercanos(pts, signo=None):
        ids = set()
        for p in pts:
            for q in (p, Vector((eje_boca.reflejar(p.x, M.cx), p.y, p.z))):
                for co, j, d in kd.find_n(q, 3):
                    if signo is None or lado[j] == signo:
                        ids.add(int(j)); break
        return ids
    def densos(lst):
        out = []
        for a, b in zip(lst, lst[1:]):
            for t in np.linspace(0, 1, 3, endpoint=False): out.append(a.lerp(b, t))
        return out + [lst[-1]]
    SEED_T = cercanos(densos(R['ST'][:-1]), 1)
    SEED_B = cercanos(densos(R['SB'][:-1]), -1)
    MID_T = cercanos(MED['MID_T']); MID_B = cercanos(MED['MID_B'])
    LIM = L(0.03)
    DT = util.geodesica(P, nb, SEED_T, LIM, bloqueado)
    DB = util.geodesica(P, nb, SEED_B, LIM, bloqueado)
    D = np.minimum.reduce([util.geodesica(P, nb, MID_T, LIM, bloqueado), util.geodesica(P, nb, MID_B, LIM, bloqueado), DT, DB])
    mask = np.where(face, 1 - util.ss(L(0.0035), L(0.0085), D), 0.0)
    with np.errstate(invalid='ignore', over='ignore'):
        sup = 1 / (1 + np.exp(-(DB - DT) / L(0.0004)))
    sup = np.nan_to_num(sup, nan=1.0)
    sup = np.where(np.isinf(DT) & np.isinf(DB), (lado > 0).astype(float), sup)
    # más allá de la comisura la geodésica no distingue bien: manda la altura respecto a la comisura
    with np.errstate(over='ignore'):
        alto = 1 / (1 + np.exp(-(P[:, 2] - M.comisura.z) / L(0.0008)))
    wfuera = util.ss(xs[-1], xs[-1] + L(0.003), ax)
    sup = sup * (1 - wfuera) + alto * wfuera

    ab = rig.data.bones
    def joints(lip):
        j = [rig.matrix_world @ ab[f'DEF-labio_{lip}.L.00{k}'].head_local for k in (1, 2, 3)]
        j.append(rig.matrix_world @ ab[f'DEF-labio_{lip}.L.003'].tail_local)
        return [np.array(v) for v in j]
    JNT = {'sup': joints('sup'), 'inf': joints('inf')}

    def chain_param(p, J):
        best = (1e9, 0.0)
        for k in range(3):
            a, b = J[k], J[k + 1]; ab_ = b - a
            t = float(np.clip(np.dot(p - a, ab_) / np.dot(ab_, ab_), 0, 1))
            d = float(np.linalg.norm(a + t * ab_ - p))
            if d < best[0]: best = (d, k + t)
        return best[1]

    def bone_split(u, band=0.2):
        w = np.zeros(3); k = min(int(u), 2); w[k] = 1.0
        for j in (1, 2):
            if j - band < u < j + band:
                f = (u - (j - band)) / (2 * band); w[:] = 0; w[j - 1] = 1 - f; w[j] = f
        return w

    JP = np.array(rig.matrix_world @ ab['mandibula'].head_local)
    dy = P[:, 1] - JP[1]; dz = P[:, 2] - JP[2]
    theta = np.degrees(np.arctan2(-dz, -dy))
    corner_x = abs(JNT['sup'][3][0] - M.cx)
    th_s = 13.0 + 3.4 * np.clip(ax / corner_x, 0, 1)
    delta = 3.0 + (600.0 / M.s) * np.maximum(0, ax - L(0.012))
    jaw_rule = util.ss(0, 1, (theta - th_s) / delta + 0.5)
    jaw_rule *= 1 - util.ss(0, 1, (P[:, 1] - M.Yc(0.015)) / L(0.025))
    jaw_rule *= util.ss(0, 1, (P[:, 2] - M.Zc(0.792)) / L(0.016))
    jaw_rule = np.where(face, jaw_rule, 0.0)
    piezas = np.zeros(N, bool)
    if I:
        piece_mask, piece_jaw = asignacion_piezas.por_isla(P[:, 2].tolist(), isl.tolist(), I['dientes_v'], M.mc.z)
        piezas = np.asarray(piece_mask, dtype=bool)
        jaw_rule = np.where(piezas, np.asarray(piece_jaw), jaw_rule)
    s_mix = np.clip(mask / 0.3, 0, 1)
    rem_jaw = s_mix * (1 - sup) + (1 - s_mix) * jaw_rule

    for g in list(cara.vertex_groups):
        if g.name in ('cabeza', 'mandibula', 'suavizado_boca') or g.name.startswith('DEF-labio_'):
            cara.vertex_groups.remove(g)
    names = ['cabeza', 'mandibula'] + [f'DEF-labio_{l}.{s}.00{k}' for l in ('sup', 'inf') for s in ('L', 'R') for k in (1, 2, 3)]
    VG = {n: cara.vertex_groups.new(name=n) for n in names}
    acc = {n: {} for n in names}
    for i in np.where(face | piezas)[0]:
        m = float(mask[i]); rest = 1 - m
        wj = rest * float(rem_jaw[i]); wh = rest - wj
        if wh > 1e-4: acc['cabeza'][i] = wh
        if wj > 1e-4: acc['mandibula'][i] = wj
        if m > 1e-4:
            side = 'L' if P[i, 0] >= M.cx else 'R'
            q = P[i].copy(); q[0] = M.cx + abs(q[0] - M.cx)
            for lip, f in (('sup', float(sup[i])), ('inf', 1 - float(sup[i]))):
                if f * m < 1e-4: continue
                w = bone_split(chain_param(q, JNT[lip]))
                for k in range(3):
                    if w[k] > 0:
                        key = f'DEF-labio_{lip}.{side}.00{k+1}'
                        acc[key][i] = acc[key].get(i, 0) + m * f * w[k]
    for n, d in acc.items():
        by = {}
        for i, w in d.items(): by.setdefault(round(w, 4), []).append(int(i))
        for w, ids in by.items(): VG[n].add(ids, w, 'REPLACE')
    mod = cara.modifiers.get('Rig labios') or cara.modifiers.new('Rig labios', 'ARMATURE')
    mod.object = rig; mod.use_vertex_groups = True; mod.use_bone_envelopes = False
    ws = {}
    for n, d in acc.items():
        if n.startswith('DEF-') or n == 'mandibula':
            for i, w in d.items(): ws[i] = ws.get(i, 0) + w
    vg = cara.vertex_groups.new(name='suavizado_boca')
    by = {}
    for i, w in ws.items(): by.setdefault(round(min(1.0, w * 2), 3), []).append(int(i))
    for w, ids in by.items(): vg.add(ids, w, 'REPLACE')
    cs = cara.modifiers.get('Suavizado boca') or cara.modifiers.new('Suavizado boca', 'CORRECTIVE_SMOOTH')
    cs.vertex_group = 'suavizado_boca'; cs.factor = 0.5; cs.iterations = 5
    cs.rest_source = 'ORCO'; cs.smooth_type = 'LENGTH_WEIGHTED'
    # el Corrective Smooth va después del Armature
    mods = list(cara.modifiers)
    ia, ic = mods.index(mod), mods.index(cs)
    if ic < ia:
        cara.modifiers.move(ic, ia)
    return {n: len(d) for n, d in acc.items()}
