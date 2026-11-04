# Densificar la banda de los párpados (0.6.6). En Tripo el párpado de arriba suele ser un abanico de 8–10 triángulos
# largos que convergen en un vértice del reborde (Martín L): al cerrar, ninguna deformación lo deja liso y sale una V
# con la punta en ese vértice. Se subdividen solo las caras de la banda (placa + piel que se estira) con
# subdivisión PLANA: los vértices nuevos caen sobre las mismas caras (en reposo la cara no cambia), van al final
# (índices de los demás intactos) y UV/atributos se interpolan. Se hace una vez, antes de calcular las keys.
import bmesh
import numpy as np


def banda(K, O, alc_sup=1.1, alc_inf=0.7):
    """vértices (índices de malla) de la banda de cada ojo: geodésica al borde < alcance × r."""
    sel = np.zeros(len(K.P), bool)
    for o in O.values():
        ds = np.where(np.isfinite(o.d_sup), o.d_sup, 1e3); di = np.where(np.isfinite(o.d_inf), o.d_inf, 1e3)
        b = (ds < alc_sup * o.r) | (di < alc_inf * o.r)
        b &= np.linalg.norm(K.p - o.c, axis=1) < 2.5 * o.r
        sel[K.zona[b]] = True
    return sel


def cortes_auto(cara, K, O, alc_sup=1.1, alc_inf=0.7):
    """2 cortes si el p90 de las aristas de las caras de la banda pasa de 0,12·r del ojo (Lamine: 4,6 mm con r≈12 mm
    y una línea de ~2 mm), si no 1. -> (cortes, p90 / r)"""
    sel = banda(K, O, alc_sup, alc_inf)
    me = cara.data
    ar = set()
    for p in me.polygons:
        if all(sel[v] for v in p.vertices):
            ar.update(p.edge_keys)
    if not ar:
        return 1, 0.0
    P = K.P
    L = np.array([np.linalg.norm(P[a] - P[b]) for a, b in ar])
    r = float(np.mean([o.r for o in O.values()]))
    q = float(np.percentile(L, 90)) / r
    return (2 if q > 0.12 else 1), round(q, 3)


def normales_suaves(me, mascara, pasadas=8, anillos=3):
    """normales de esquina suavizadas en los vértices de `mascara` (0.6.9, Lamine: las normales crudas por vértice de
    una malla subdividida en plano dejaban la piel del ojo granulada). Parte de las normales de esquina actuales,
    promedia por vértice, suaviza `pasadas` veces (vértice + vecinos por aristas, renormalizado) y las asigna a las
    esquinas. Fuera de la máscara hay `anillos` anillos de transición (mezcla lineal con la normal de antes) para que
    no quede escalón. -> nº de esquinas cambiadas (0 si la malla no tiene normales propias)."""
    if not me.has_custom_normals:
        return 0
    nv, nl = len(me.vertices), len(me.loops)
    N = np.zeros(nl * 3); me.corner_normals.foreach_get('vector', N); N = N.reshape(-1, 3)
    lv = np.zeros(nl, int); me.loops.foreach_get('vertex_index', lv)
    ed = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
    a, b = np.r_[ed[:, 0], ed[:, 1]], np.r_[ed[:, 1], ed[:, 0]]
    # peso: 1 dentro de la máscara, baja a 0 en `anillos` anillos hacia fuera
    w = np.asarray(mascara, bool).astype(float)
    cur = w > 0
    for k in range(1, anillos + 1):
        nuevo = np.zeros(nv, bool); nuevo[b[cur[a]]] = True
        nuevo &= w == 0
        w[nuevo] = 1.0 - k / (anillos + 1.0)
        cur = nuevo | cur
    zona = w > 0
    V = np.zeros((nv, 3)); np.add.at(V, lv, N)
    V /= np.maximum(np.linalg.norm(V, axis=1), 1e-12)[:, None]
    for _ in range(pasadas):
        S = V.copy(); np.add.at(S, a, V[b])
        S /= np.maximum(np.linalg.norm(S, axis=1), 1e-12)[:, None]
        V[zona] = S[zona]
    cam = zona[lv]
    ww = w[lv][cam][:, None]
    M = ww * V[lv[cam]] + (1 - ww) * N[cam]
    N[cam] = M / np.maximum(np.linalg.norm(M, axis=1), 1e-12)[:, None]
    me.normals_split_custom_set([tuple(v) for v in N])
    me.update()
    return int(cam.sum())


def normales_lisas(me, en):
    """en los vértices de `en`: normales suavizadas (con transición hacia fuera); fuera, las propias de siempre."""
    return normales_suaves(me, en)


UMBRAL_P90 = 0.10      # arista p90 de la banda / radio del ojo: por encima, la rejilla es gruesa
UMBRAL_ABANICO = 6     # triángulos en un mismo vértice de la banda: abanico de Tripo (8-10), con la V al cerrar
UMBRAL_TRI = 0.25      # fracción de triángulos en la banda: por encima no son quads de Tripo preparados para rig


def diagnostico(cara, K, O, alc_sup=1.1, alc_inf=0.7):
    """mide la banda del párpado: p90 de aristas / r, triángulos en total y el mayor abanico de triángulos en un vértice."""
    sel = banda(K, O, alc_sup, alc_inf)
    me = cara.data
    ar = set(); tri = {}; ntri = 0; ncaras = 0
    for p in me.polygons:
        if all(sel[v] for v in p.vertices):
            ncaras += 1
            ar.update(p.edge_keys)
            if len(p.vertices) == 3:
                ntri += 1
                for v in p.vertices:
                    tri[v] = tri.get(v, 0) + 1
    P = K.P
    r = float(np.mean([o.r for o in O.values()]))
    q = float(np.percentile([np.linalg.norm(P[a] - P[b]) for a, b in ar], 90)) / r if ar else 0.0
    return {'p90_r': round(q, 3), 'caras': ncaras, 'triangulos': ntri, 'abanico_max': max(tri.values(), default=0)}


def decidir(cara, K, O, modo=None):
    """(cortes, info). modo = cfg 'densificar': 'nunca' (POR DEFECTO desde 0.8.8: los párpados se dejan como están), 'auto' (0.8.3) o 'siempre' (el de antes).
    auto: la malla del párpado NO se retopologiza si ya está bien: párpados aprobados por la ruta de superficie UV
    (parpados_aislados) o banda en quads limpios. Solo se densifica con abanicos de triángulos (Tripo crudo) o una banda
    mayoritariamente triangulada. El tamaño de las aristas no decide: Ichigo (p90 0,39 r) cierra perfecto sin tocarla.
    cortes 0 = no densificar."""
    from .. import marco as MK
    modo = modo or MK.cfg(cara).get('densificar', 'nunca')
    cortes, q = cortes_auto(cara, K, O)
    d = diagnostico(cara, K, O)
    info = {'modo': modo, **d}
    if modo == 'nunca':
        cortes = 0
    elif modo == 'auto':
        aislados = bool(cara.get('rlb_parpados_uv_seeds')) and str(cara.get('rlb_parpados_metodo', '')).startswith('superficie_uv')
        tri = d['triangulos'] / max(d['caras'], 1)
        necesita = not aislados and (d['abanico_max'] >= UMBRAL_ABANICO or tri > UMBRAL_TRI)
        info['necesita'] = necesita
        info['motivo'] = ('párpados de superficie UV ya aprobados' if aislados else
                          f"abanico {d['abanico_max']}, triángulos {tri:.0%}")
        cortes = cortes if necesita else 0
    info['cortes'] = cortes
    return cortes, info


def densificar(cara, K, O, cortes=1, alc_sup=1.1, alc_inf=0.7):
    me = cara.data
    if cara.get('facs_densificado'):
        return {'densificado': 'ya estaba', **dict(cara['facs_densificado'])}
    sel = banda(K, O, alc_sup, alc_inf)
    n0 = len(me.vertices)
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    caras = [f for f in bm.faces if all(sel[v.index] for v in f.verts)]
    aristas = list({e for f in caras for e in f.edges})
    bmesh.ops.subdivide_edges(bm, edges=aristas, cuts=int(cortes), use_grid_fill=True, smooth=0.0)
    bm.to_mesh(me); bm.free(); me.update()
    # normales: Tripo trae normales propias (custom) y la subdivisión las interpola mal en las esquinas nuevas (el
    # reborde salía arrugado en reposo). En las caras de la banda se ponen las normales lisas de la malla; fuera,
    # las de siempre
    en = np.zeros(len(me.vertices), bool); en[:n0] = sel[:n0]; en[n0:] = True
    nrm = normales_lisas(me, en)
    info ={'caras': len(caras), 'v_antes': n0, 'v_despues': len(me.vertices), 'cortes': int(cortes),
            'esquinas_normal_lisa': nrm}
    cara['facs_densificado'] = info
    return info
