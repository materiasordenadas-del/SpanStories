# Pestañas de Tripo (0.6.4; detección en cascada 0.7.2): Tripo las genera, según la imagen, como islas sueltas de la
# malla (Camilo: un arco fino de 130 vértices pegado a la mitad de arriba del globo) o como una tira pegada a la piel.
# Al bajar el párpado no lo siguen: se buscan y se borran, y el delineado del párpado (facs/delineado_uv.py) las
# sustituye. NUNCA se usan las de Tripo. La identificación es solo geométrica y UV (nada de mirar el visor):
#   1. isla geométrica suelta junto al globo (buscar);
#   2. isla UV (inventario_uv) cuyas caras rodean el globo como una tira fina, aunque comparta vértices con la piel;
#   3. si ninguna de las dos lo asegura: 'ninguna' (el delineado se genera igual) o, si hay candidatas dudosas,
#      selección manual (seleccionar / quitar_manual: el usuario marca las caras).
# Se borran solo CARAS y aristas (los vértices quedan sueltos: los índices no cambian) y se guardan en la
# configuración para poder devolverlas (restaurar). Nunca se borran caras de una isla UV de piel.
import json
import bmesh
import numpy as np
from . import util, marco as MK


def _islas(me):
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    lab = -np.ones(len(bm.verts), int); k = 0
    for v in bm.verts:
        if lab[v.index] >= 0 or not v.link_faces:
            continue
        st = [v]; lab[v.index] = k
        while st:
            x = st.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if lab[y.index] < 0:
                    lab[y.index] = k; st.append(y)
        k += 1
    bm.free()
    return lab


def _esfera(Q):
    A = np.c_[2 * Q, np.ones(len(Q))]; b = (Q ** 2).sum(1)
    s = np.linalg.lstsq(A, b, rcond=None)[0]
    c = s[:3]; r = float(np.sqrt(max(s[3] + c @ c, 0.0)))
    return c, r, float(np.abs(np.linalg.norm(Q - c, axis=1) - r).mean() / max(r, 1e-9))


AREA_MAX = 2.5      # × R²: una cinta de pestañas mide ~1–1,7 R²; el iris 3,8 R², el globo 11 R², la ceja 2,8 R² (Tronchatoro)


def _motivo(Q, C, R, nmax, area=None):
    """por qué un conjunto de vértices Q NO es una tira de pestañas junto al globo (centro C, radio R), o None si lo es.
    Vale igual para una isla geométrica y para una isla UV (0.7.2). Con `area` (superficie real de la isla, solo UV) el
    grosor se mide por el área y no por la caja: una cinta curva sobre el párpado tiene caja gorda y es fina."""
    q = Q - C
    d = np.linalg.norm(q, axis=1)
    ext = Q.max(0) - Q.min(0)
    n = len(Q)
    if n > nmax:
        return 'grande (piel)'
    if n < 6:
        return 'diminuta'
    if np.mean((d > 0.8 * R) & (d < 1.5 * R)) < 0.7:
        return 'lejos del globo (ceja u otra pieza)'
    if n >= 10:
        esf = _esfera(Q)
        if esf[2] < 0.04 and 0.7 * R < esf[1] < 1.4 * R:
            return 'es el globo'
    if np.mean(q[:, 1] < 0.35 * R) < 0.7:
        return 'detrás del ojo'
    if ext[0] < 0.8 * R:
        return 'corta (no cruza el ojo)'
    if area is None:
        if min(ext[1], ext[2]) > 0.55 * R:
            return 'gruesa (no es una tira)'
    elif area > AREA_MAX * R * R:
        return 'gruesa (no es una tira)'
    if abs(Q[:, 0].mean() - C[0]) > 0.6 * R:
        return 'descentrada'
    return None


def _fila(Q, C, R):
    return 'sup' if np.median((Q - C)[:, 2]) > -0.1 * R else 'inf'


def buscar(me, ojos, P=None):
    """ojos = {'L': (C, R), 'R': (C, R)} (centro y radio del globo; la cara mira a −Y, Z arriba).
    -> {'L': {'sup': [isla…], 'inf': [...]}, ...} con cada isla {'id', 'n', 'vertices'}; y las descartadas cerca
    del ojo con el motivo (para revisar)."""
    P = util.coords(me) if P is None else P
    lab = _islas(me)
    nmax = 0.05 * len(P)
    out, descartes = {}, []
    for s, (C, R) in ojos.items():
        C = np.asarray(C, float)
        res = {'sup': [], 'inf': []}
        cerca = np.unique(lab[(np.linalg.norm(P - C, axis=1) < 1.6 * R) & (lab >= 0)])
        for k in cerca:
            idx = np.nonzero(lab == k)[0]
            Q = P[idx]
            motivo = _motivo(Q, C, R, nmax)
            if motivo:
                descartes.append({'lado': s, 'id': int(k), 'n': int(len(idx)), 'motivo': motivo})
                continue
            res[_fila(Q, C, R)].append({'id': int(k), 'n': int(len(idx)), 'vertices': idx})
        out[s] = res
    return out, descartes


# ---------------------------------------------------------------- 0.7.2: pestañas pegadas a la piel (por UV)
def _islas_uv(me, P):
    """islas UV de la malla (continuidad por aristas, inventario_uv) -> (caras_vertices, islas)."""
    from . import inventario_uv
    uvl = me.uv_layers.active
    if uvl is None:
        return None, []
    nf = len(me.polygons)
    ls = np.zeros(nf, int); lt = np.zeros(nf, int)
    me.polygons.foreach_get('loop_start', ls); me.polygons.foreach_get('loop_total', lt)
    vi = np.zeros(len(me.loops), int); me.loops.foreach_get('vertex_index', vi)
    uv = np.zeros(len(me.loops) * 2); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    fv = [vi[a:a + n] for a, n in zip(ls, lt)]
    fu = [uv[a:a + n] for a, n in zip(ls, lt)]
    edges = [tuple(e.vertices) for e in me.edges]
    inv = inventario_uv.inventariar(P, edges, [tuple(v) for v in fv], fu)
    return fv, inv['islas_uv']


def _area(P, fv, caras):
    """superficie real de las caras (abanico de triángulos)."""
    A = 0.0
    for f in caras:
        v = fv[f]
        for i in range(1, len(v) - 1):
            A += 0.5 * float(np.linalg.norm(np.cross(P[v[i]] - P[v[0]], P[v[i + 1]] - P[v[0]])))
    return A


def candidatas_uv(P, fv, islas, ojos, nmax=None):
    """islas UV que son una cinta de pestañas junto al globo, aunque compartan vértices con la piel (mismas reglas que
    las islas geométricas: _motivo, con el grosor por área). Después se suman los FRAGMENTOS: islas pequeñas (< 40
    caras) de la misma zona que comparten vértices con una cinta ya aceptada (la colita del rabillo, los trozos que
    Tripo parte al desplegar). La piel es una isla UV enorme y se descarta sola.
    -> ({'L': {'sup': [...], 'inf': [...]}, ...}, descartes); cada candidata {'id' (cara semilla), 'n' (vértices),
    'caras', 'vertices'}."""
    P = np.asarray(P, float)
    nmax = 0.05 * len(P) if nmax is None else nmax
    out = {s: {'sup': [], 'inf': []} for s in ojos}
    descartes, tomadas, frag = [], {}, []
    for it in islas:
        if it['n_faces'] < 4:
            continue
        lo, hi = np.asarray(it['bounds_min'], float), np.asarray(it['bounds_max'], float)
        for s, (C, R) in ojos.items():
            C = np.asarray(C, float)
            if np.linalg.norm(np.clip(C, lo, hi) - C) >= 1.6 * R:
                continue
            caras = it['face_indices']
            idx = np.unique(np.concatenate([fv[f] for f in caras]))
            Q = P[idx]
            motivo = _motivo(Q, C, R, nmax, area=_area(P, fv, caras) if it['n_faces'] < 400 else None)
            cand = {'id': int(it['seed_face']), 'n': int(len(idx)), 'caras': list(caras), 'vertices': idx}
            if motivo:
                descartes.append({'lado': s, 'id': int(it['seed_face']), 'n': int(len(idx)), 'motivo': motivo,
                                  'tipo': 'uv'})
                d = np.linalg.norm(Q - C, axis=1)
                if (motivo.startswith('corta') or motivo == 'diminuta') and it['n_faces'] < 40 and                         np.mean((d > 0.8 * R) & (d < 1.5 * R)) >= 0.7:
                    frag.append((s, cand, motivo))
                continue
            d = float(np.linalg.norm(Q.mean(0) - C))
            if it['seed_face'] in tomadas and tomadas[it['seed_face']][0] <= d:
                continue
            tomadas[it['seed_face']] = (d, s, _fila(Q, C, R), cand)
    for _, (d, s, fila, c) in tomadas.items():
        out[s][fila].append(c)
    # fragmentos pegados a una cinta aceptada del mismo ojo (hasta que no entre ninguno más)
    cambio = True
    while cambio and frag:
        cambio = False
        for item in list(frag):
            s, cand, motivo = item
            C, R = ojos[s]
            for fila in ('sup', 'inf'):
                if any(set(cand['vertices'].tolist()) & set(c['vertices'].tolist()) for c in out[s][fila]):
                    out[s][fila].append(cand)
                    frag.remove(item)
                    descartes[:] = [d for d in descartes if not (d['lado'] == s and d['id'] == cand['id'])]
                    cambio = True
                    break
    return out, descartes


def _seguridad(hall):
    """'alta' si los dos ojos traen pestañas parecidas (1–8 islas, con fragmentos; nº de vértices a menos de 1,6×);
    si falta un lado o no se parecen, 'baja' (se pide revisión manual en vez de borrar a ciegas)."""
    n = {s: sum(len(r[f]) for f in ('sup', 'inf')) for s, r in hall.items()}
    v = {s: sum(i['n'] for f in ('sup', 'inf') for i in r[f]) for s, r in hall.items()}
    if len(n) < 2 or min(n.values()) == 0 or max(n.values()) > 8:
        return 'baja'
    a, b = sorted(v.values())
    return 'alta' if b <= 1.6 * a else 'baja'


def _ojos_marco(cara, ojos=None):
    if ojos is not None:
        return ojos
    M = MK.Marco(cara)
    return {s: (np.array(M.ojo(s)[0]), M.ojo(s)[1]) for s in ('L', 'R')}


def _inventario(cara, ojos, P=None):
    """todo lo que se sabe de las pestañas de Tripo, en cascada (solo lee): geométricas → UV → ninguna.
    Interno: trae índices; diagnosticar() lo resume."""
    util.modo_objeto()                                # en modo edición las UV y las caras no están volcadas
    me = cara.data
    P = util.coords(me) if P is None else P
    hall, desc_g = buscar(me, ojos, P)
    rep = {'P': P, 'geo': hall, 'desc_geo': desc_g, 'uv': None, 'desc_uv': [], 'metodo': 'ninguna',
           'seguridad': 'alta'}
    if any(r[f] for r in hall.values() for f in ('sup', 'inf')):
        rep['metodo'] = 'geometrica'
        return rep
    fv, islas = _islas_uv(me, P)
    if fv is None:
        return rep                                   # sin UV no hay segunda vía
    uv, desc_u = candidatas_uv(P, fv, islas, ojos)
    rep.update(uv=uv, desc_uv=desc_u, fv=fv)
    if any(r[f] for r in uv.values() for f in ('sup', 'inf')):
        rep['metodo'] = 'uv'
        rep['seguridad'] = _seguridad(uv)
    return rep


_DUDOSAS = ('corta (no cruza el ojo)', 'gruesa (no es una tira)', 'descentrada', 'detrás del ojo')


def _dudosa(d):
    """islas junto al ojo que casi parecen pestañas. En UV, «gruesa» es el iris, el globo o la ceja (área grande): no
    cuenta; en islas geométricas sí (un bulto de pestañas)."""
    return d['motivo'] in _DUDOSAS and not (d.get('tipo') == 'uv' and d['motivo'].startswith('gruesa'))


def diagnosticar(cara, ojos=None):
    """0.7.2. ¿Tiene pestañas de Tripo y cómo se identifican? Solo geometría y UV (nunca el visor). No cambia nada.
    -> {'metodo': 'geometrica' | 'uv' | 'ninguna', 'seguridad': 'alta' | 'baja', 'lados': {L: {sup: [n vértices], inf: [...]}},
        'dudosas': [islas cercanas al ojo que casi lo parecen], 'accion': texto}"""
    ojos = _ojos_marco(cara, ojos)
    rep = _inventario(cara, ojos)
    hall = rep['geo'] if rep['metodo'] == 'geometrica' else (rep['uv'] or {})
    lados = {s: {f: [i['n'] for i in r[f]] for f in ('sup', 'inf')} for s, r in hall.items()}
    dud = [d for d in rep['desc_geo'] + rep['desc_uv'] if _dudosa(d)]
    if rep['metodo'] == 'ninguna':
        accion = 'Sin pestañas de Tripo: se sigue directo con el delineado.' if not dud else (
            'Sin pestañas claras; hay islas dudosas junto al ojo (dudosas): si son pestañas, '
            'pasos.pestanas_seleccionar(cara) y pasos.quitar_pestanas_manual(cara).')
    elif rep['seguridad'] == 'alta':
        accion = f"Pestañas por {'isla geométrica' if rep['metodo'] == 'geometrica' else 'isla UV'}: se borran solas."
    else:
        accion = ('Pestañas por UV dudosas (un solo lado o muy distintas): no se borran solas. '
                  'pasos.pestanas_seleccionar(cara), ajusta las caras y pasos.quitar_pestanas_manual(cara).')
    return {'metodo': rep['metodo'], 'seguridad': rep['seguridad'], 'lados': lados, 'dudosas': dud, 'accion': accion}


# ---------------------------------------------------------------- borrar / devolver
def _borrar_caras(cara, caras, metodo):
    """borra esas caras (por índice de polígono) y las aristas que quedan sueltas: los vértices se quedan (índices
    intactos, pesos y keys también). Guarda lo borrado en la configuración (restaurar). -> nº de caras."""
    me = cara.data
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    normals={(p.index,int(v)):tuple(me.corner_normals[l].vector) for p in me.polygons for v,l in zip(p.vertices,p.loop_indices)} if me.has_custom_normals else None
    original_layer=bm.faces.layers.int.new('_rlb_pestanas_original_face')
    for f in bm.faces:f[original_layer]=f.index
    uv = bm.loops.layers.uv.active
    borrar = [bm.faces[i] for i in sorted(set(int(i) for i in caras))]
    guard = [{'v': [v.index for v in f.verts], 'm': f.material_index, 's': f.smooth,
              'uv': [list(l[uv].uv) for l in f.loops] if uv else None} for f in borrar]
    ed = {e for f in borrar for e in f.edges}
    bmesh.ops.delete(bm, geom=borrar, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[e for e in ed if e.is_valid and not e.link_faces], context='EDGES_FACES')
    original_faces=[f[original_layer] for f in bm.faces]
    bm.faces.layers.int.remove(original_layer)
    bm.to_mesh(me); bm.free(); me.update()
    if normals:me.normals_split_custom_set([normals[(fi,int(v))] for fi,p in zip(original_faces,me.polygons) for v in p.vertices])
    d = MK.cfg(cara)
    previas = json.loads(d.get('pestanas_tripo_quitadas', '[]'))
    d['pestanas_tripo_quitadas'] = json.dumps(previas + guard)
    d['pestanas_tripo_metodo'] = metodo
    MK.guardar_cfg(cara, d)
    return len(borrar)


def quitar(cara, ojos=None, inferiores=True, uv=True):
    """borra las pestañas de Tripo de los dos ojos, en cascada (0.7.2): 1) ISLAS geométricas (las que la detección
    nombró pestanas.L/R en cfg['islas']; si no hay inventario, las que encuentra buscar()); 2) si no hay, islas UV que
    rodean el globo como una tira (aunque estén pegadas a la piel) cuando los dos ojos coinciden; 3) si no, no se
    toca nada ('metodo': 'ninguna', o 'manual' si hay candidatas dudosas: seleccionar() / quitar_manual()).
    Nunca caras de una isla UV de piel: en 0.6.9 se probó a quitar «solapas finas» pegadas al párpado y en
    Tronchatoro se comió el borde del párpado (483 caras de piel).
    ojos por defecto: los marcadores ojo.L/R."""
    util.modo_objeto()
    me = cara.data
    ojos = _ojos_marco(cara, ojos)
    rep = _inventario(cara, ojos)
    hall, desc = rep['geo'], rep['desc_geo']
    vs = set()
    for s, r in hall.items():
        for fila in ('sup', 'inf') if inferiores else ('sup',):
            for isla in r[fila]:
                vs.update(isla['vertices'].tolist())
    info = {s: {f: [i['n'] for i in r[f]] for f in ('sup', 'inf')} for s, r in hall.items()}
    # las islas que el inventario de la detección llamó pestañas (partes.clasificar) también
    from . import partes
    for nom, ids in partes.vertices_de(cara, ('pestanas.L', 'pestanas.R')).items():
        vs.update(ids); info.setdefault('inventario', {})[nom] = len(ids)
    if vs:
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        caras = [f.index for f in bm.faces if all(v.index in vs for v in f.verts)]
        bm.free()
        n = _borrar_caras(cara, caras, 'geometrica')
        return {'pestanas': info, 'metodo': 'geometrica', 'caras_borradas': n, 'descartes': desc}
    if not uv or rep['metodo'] != 'uv':
        dud = [d for d in desc + rep['desc_uv'] if _dudosa(d)]
        res = {'pestanas': 'no tiene (ninguna isla ni isla UV de pestañas)', 'metodo': 'ninguna',
               'descartes': desc + rep['desc_uv']}
        if dud and not MK.cfg(cara).get('pestanas_tripo_metodo'):
            res['dudosas'] = len(dud)
            res['aviso'] = ('Hay islas dudosas junto al ojo: si son pestañas, pasos.pestanas_seleccionar / '
                            'pasos.quitar_pestanas_manual.')
        return res
    cu = rep['uv']
    info = {s: {f: [i['n'] for i in r[f]] for f in ('sup', 'inf')} for s, r in cu.items()}
    if rep['seguridad'] != 'alta':
        return {'pestanas': info, 'metodo': 'manual', 'manual': True, 'seguridad': 'baja', 'caras_borradas': 0,
                'aviso': 'Pestañas por UV dudosas (falta un lado o no se parecen): no se borran solas. '
                         'pasos.pestanas_seleccionar(cara), ajusta las caras y pasos.quitar_pestanas_manual(cara).'}
    caras = [f for s, r in cu.items() for fila in ('sup', 'inf') if inferiores or fila == 'sup'
             for i in r[fila] for f in i['caras']]
    n = _borrar_caras(cara, caras, 'uv')
    return {'pestanas': info, 'metodo': 'uv', 'caras_borradas': n, 'descartes': desc + rep['desc_uv']}


def _marcar_caras(cara, caras):
    """deja seleccionadas SOLO esas caras (para verlas / ajustarlas en modo edición)."""
    me = cara.data
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    for f in bm.faces: f.select_set(False)
    for e in bm.edges: e.select_set(False)
    for v in bm.verts: v.select_set(False)
    for i in caras:
        bm.faces[int(i)].select_set(True)
    bm.select_flush_mode()
    bm.to_mesh(me); bm.free(); me.update()


def seleccionar(cara, ojos=None):
    """0.7.2, herramienta manual (1/2): marca las caras que parecen pestañas (las detectadas o, si no hay, las islas
    dudosas junto al ojo). Pasa a modo edición/caras para ajustar la selección a mano (añadir o quitar caras) y
    luego quitar_manual(). -> {'seleccionadas': n, 'origen': ...}"""
    util.modo_objeto()
    ojos = _ojos_marco(cara, ojos)
    rep = _inventario(cara, ojos)
    me = cara.data
    caras = []
    if rep['metodo'] == 'geometrica':
        vs = {int(v) for r in rep['geo'].values() for f in ('sup', 'inf') for i in r[f] for v in i['vertices']}
        caras = [p.index for p in me.polygons if all(v in vs for v in p.vertices)]
        origen = 'islas geométricas'
    elif rep['metodo'] == 'uv':
        caras = [f for r in rep['uv'].values() for fila in ('sup', 'inf') for i in r[fila] for f in i['caras']]
        origen = 'islas UV'
    else:
        origen = 'islas dudosas junto al ojo'
        lab = _islas(me)
        for d in [d for d in rep['desc_geo'] if _dudosa(d)]:
            vs = set(np.nonzero(lab == d['id'])[0].tolist())
            caras += [p.index for p in me.polygons if all(v in vs for v in p.vertices)]
        sem = {d['id'] for d in rep['desc_uv'] if _dudosa(d)}
        if sem:
            fv, islas = _islas_uv(me, rep['P'])
            for it in islas:
                if it['seed_face'] in sem:
                    caras += list(it['face_indices'])
    caras = sorted(set(caras))
    _marcar_caras(cara, caras)
    try:
        import bpy
        if bpy.context.view_layer.objects.active is cara:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_mode(type='FACE')
    except Exception:
        pass
    return {'seleccionadas': len(caras), 'origen': origen if caras else 'nada que marcar: selecciona las caras tú',
            'siguiente': 'Ajusta la selección en modo edición y pulsa «Quitar pestañas = selección» (quitar_manual).'}


def quitar_manual(cara, caras=None, ojos=None, forzar=False):
    """0.7.2, herramienta manual (2/2): borra las caras seleccionadas (o `caras`, índices de polígono) como pestañas de
    Tripo. Protege la piel: se niega si alguna cara queda a más de 3 radios del ojo más cercano o si son más del 5 % de
    la malla (forzar=True lo salta). Se puede devolver con restaurar()."""
    util.modo_objeto()
    me = cara.data
    if caras is None:
        sel = np.zeros(len(me.polygons), bool); me.polygons.foreach_get('select', sel)
        caras = np.nonzero(sel)[0].tolist()
    caras = sorted(set(int(i) for i in caras))
    if not caras:
        raise RuntimeError('No hay caras seleccionadas: en modo edición (caras) selecciona las de las pestañas.')
    ojos = _ojos_marco(cara, ojos)
    P = util.coords(me)
    cen = np.array([P[list(me.polygons[i].vertices)].mean(0) for i in caras])
    dmin = np.min([np.linalg.norm(cen - np.asarray(C), axis=1) / R for C, R in ojos.values()], axis=0)
    lejos = int((dmin > 3.0).sum())
    if (lejos or len(caras) > 0.05 * len(me.polygons)) and not forzar:
        raise RuntimeError(f'La selección tiene {len(caras)} caras ({lejos} a más de 3 radios del ojo): no parece solo '
                           'pestañas. Revisa la selección (o forzar=True si estás seguro).')
    n = _borrar_caras(cara, caras, 'manual')
    return {'pestanas': 'quitadas a mano', 'metodo': 'manual', 'caras_borradas': n}


def preparar_exportacion(cara):
    """0.7.2. Garantiza que las pestañas de Tripo no reaparecen en el GLB. Borradas = caras que ya no existen (los
    vértices sueltos no se exportan: solo van triángulos). Ocultas por el atributo RLB_ocultar_ojos_uv (modificador de
    Geometry Nodes, vía antigua) SÍ reaparecen, porque la exportación apaga los nodos: aquí se borran de verdad (queda
    guardado para restaurar). -> {'ocultas_borradas', 'pestanas_guardadas', 'reaparecidas', 'vertices_sueltos'}"""
    util.modo_objeto()
    me = cara.data
    n_oc = 0
    at = me.attributes.get('RLB_ocultar_ojos_uv')
    if at is not None and at.domain == 'FACE' and at.data_type == 'BOOLEAN':
        oc = np.zeros(len(me.polygons), bool); at.data.foreach_get('value', oc)
        idx = np.nonzero(oc)[0]
        if len(idx):
            n_oc = _borrar_caras(cara, idx, 'ocultas_exportar')
    guard = json.loads(MK.cfg(cara).get('pestanas_tripo_quitadas', '[]'))
    vivas = {tuple(sorted(p.vertices)) for p in cara.data.polygons}
    reap = sum(1 for g in guard if tuple(sorted(g['v'])) in vivas)
    usado = np.zeros(len(me.vertices), bool)
    for p in me.polygons:
        usado[list(p.vertices)] = True
    return {'ocultas_borradas': n_oc, 'pestanas_guardadas': len(guard), 'reaparecidas': reap,
            'vertices_sueltos': int((~usado).sum())}


def restaurar(cara):
    """devuelve las caras de pestañas borradas (los vértices nunca se borraron)."""
    util.modo_objeto()
    me = cara.data
    d = MK.cfg(cara)
    guard = json.loads(d.get('pestanas_tripo_quitadas', '[]'))
    if not guard:
        return {'restauradas': 0}
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    n = 0
    for g in guard:
        try:
            f = bm.faces.new([bm.verts[i] for i in g['v']])
        except ValueError:
            continue
        f.material_index = g['m']; f.smooth = g['s']
        if uv and g['uv']:
            for l, u in zip(f.loops, g['uv']):
                l[uv].uv = u
        n += 1
    bm.to_mesh(me); bm.free(); me.update()
    d['pestanas_tripo_quitadas'] = '[]'
    d.pop('pestanas_tripo_metodo', None)
    MK.guardar_cfg(cara, d)
    return {'restauradas': n}
