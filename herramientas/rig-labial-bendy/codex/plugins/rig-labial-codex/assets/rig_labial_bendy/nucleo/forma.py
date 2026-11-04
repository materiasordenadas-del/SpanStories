# Forma de la cara (0.8.0): ojos en posición neutra y retoque de la forma del mentón, la mandíbula y las orejas.
#
#   from <complemento>.nucleo import forma as FO
#   FO.ojos_poner(cara, 'L', x_mm, y_mm, z_mm)   # ojo completo (globo, iris, pupila, córnea) en mm; x: + = izquierda del
#                                                #   personaje, y: + = adelante, z: + = arriba (posición NEUTRA, no gesto)
#   FO.preparar(cara)    # mide la cara, pone los puntos RLB_<cara>_fm_* y crea las shape keys fm_* con sus deslizadores
#   FO.reiniciar(cara)   # deslizadores a 0 (la forma original)
#   FO.fijar(cara)       # hornea la forma en la malla y quita keys y deslizadores (antes de exportar al GLB)
#
# Cada ajuste es una shape key suave (fm_<zona>[_L|_R]_<modo>) limitada a una zona de la PIEL, con su deslizador en
# propiedades de la propia cara (rlb_f_<zona>_<modo> = «los dos lados», más rlb_f_..._L / _R = diferencia de cada lado).
# Las dos mitades salen del mismo cálculo (espejo exacto): lo que se hace en «los dos lados» es simétrico por construcción.
# La piel se toma de las islas UV (las semillas de párpados, rlb_parpados_uv_seeds, y las islas pegadas a ellas), así
# que el pelo y la ropa no se mueven. Para cambiarlas: cara['rlb_forma_semillas'] = [cara_semilla, ...].
# Las shape keys no cambian la topología (los quads de Tripo quedan intactos) ni el Basis.
import json, math
import bpy
import numpy as np
from mathutils import Vector, Matrix
from . import marco as MK
from . import util

PREF = 'fm_'
PROP = 'rlb_f_'
CFG = 'rlb_forma'
ATTR = 'RLB_forma_piel'
MIN_COMPARTIDOS = 8        # vértices que una isla vecina comparte con la cara para contar como piel

# zona -> (título, con lados, [(modo, texto, +, −)])   (el + va a la derecha del deslizador)
ZONAS = {
    'menton': ('Mentón', False, [
        ('forma', 'Forma', 'Cuadrado', 'En V'),
        ('redondo', 'Redondez', 'Redondo', 'Anguloso'),
        ('punta', 'Punta', 'Puntiagudo', 'Plano'),
        ('alto', 'Largo', 'Largo', 'Corto'),
        ('ancho', 'Ancho', 'Ancho', 'Estrecho'),
        ('adelante', 'Saliente', 'Adelante', 'Atrás')]),
    'mandibula': ('Mandíbula', True, [
        ('forma', 'Forma', 'Cuadrada', 'En V'),
        ('redondo', 'Redondez', 'Redonda', 'Angulosa'),
        ('ancho', 'Ancho', 'Ancha', 'Estrecha'),
        ('largo', 'Largo', 'Larga', 'Corta')]),
    'oreja': ('Orejas', True, [
        ('forma', 'Forma', 'Cuadrada', 'Puntiaguda'),
        ('redondo', 'Redondez', 'Redonda', 'Angulosa'),
        ('tamano', 'Tamaño', 'Grande', 'Pequeña'),
        ('alto', 'Alto', 'Alta', 'Baja (achatada)'),
        ('ancho', 'Ancho', 'Ancha', 'Estrecha'),
        ('separar', 'Separación', 'Separada', 'Pegada'),
        ('punta', 'Punta', 'Punta (élfica)', 'Sin punta'),
        ('lobulo', 'Lóbulo', 'Largo', 'Corto'),
        ('subir', 'Posición', 'Arriba', 'Abajo'),
        ('adelante', 'Posición', 'Adelante', 'Atrás'),
        ('inclinar', 'Inclinación', 'Hacia delante', 'Hacia atrás')]),
}
LADOS = ('L', 'R')


# ------------------------------------------------------------------ nombres
def clave(zona, modo, lado=''):
    return f'{PREF}{zona}{"_" + lado if lado else ""}_{modo}'


def prop(zona, modo, lado=''):
    return f'{PROP}{zona}_{modo}{"_" + lado if lado else ""}'


def todas_las_props(cara=None):
    out = []
    for z, (_, pares, modos) in ZONAS.items():
        for m, *_ in modos:
            out.append(prop(z, m))
            if pares:
                out += [prop(z, m, 'L'), prop(z, m, 'R')]
    return out + props_locales()


def _ss(e0, e1, x):
    return util.ss(e0, e1, x)


def _campana(d, r):
    t = np.clip(d / r, 0, 1)
    return (1 - t * t) ** 2


# ------------------------------------------------------------------ geometría base
def _coords(cara):
    return util.coords(cara.data)


def _a_local(cara, w):
    return np.array(cara.matrix_world.inverted() @ Vector(w), float)


def _a_mundo(cara, p):
    return cara.matrix_world @ Vector(tuple(map(float, p)))


def pivotes(cara):
    n = MK.nombres(cara)
    return {s: bpy.data.objects[n['piv_' + s]] for s in LADOS if n['piv_' + s] in bpy.data.objects}


def _centros_ojos(cara):
    """centros de los ojos en espacio de la cara, SIN el desplazamiento neutro (el marco no se mueve con él)."""
    out = {}
    P = pivotes(cara)
    off = _ojos_guardados(cara)
    for s in LADOS:
        if s in P:
            c = _a_local(cara, P[s].matrix_world.translation)
            d = off.get(s)
            if d:
                c = c - np.array(_mm_a_local(cara, d))
            out[s] = c
        else:
            e = bpy.data.objects.get(MK.nombre_marca(cara, 'ojo.' + s))
            if e is not None:
                out[s] = _a_local(cara, e.matrix_world.translation)
    if len(out) < 2:
        raise RuntimeError('Faltan los ojos (pivotes del complemento o marcadores ojo.L/ojo.R)')
    return out


# ------------------------------------------------------------------ ojos en posición neutra
def _mm_a_local(cara, mm):
    """(x, y, z) en mm → vector en espacio de la cara (x + = izquierda del personaje, y + = adelante, z + = arriba).
    La cara mira a −Y (requisito del complemento), así que adelante es −Y."""
    k = 0.001 / max(float(np.mean(cara.matrix_world.to_scale())), 1e-9)
    return (mm[0] * k, -mm[1] * k, mm[2] * k)


def _signo_L(cara):
    c = _centros_ojos(cara)
    return 1.0 if c['L'][0] >= c['R'][0] else -1.0


def _ojos_guardados(cara):
    try:
        return {k: list(map(float, v)) for k, v in json.loads(cara.get('rlb_ojos_pos', '{}')).items()}
    except Exception:
        return {}


def ojos_estado(cara):
    """{'L': [x, y, z], 'R': [...]} en mm (0 = posición original)."""
    d = _ojos_guardados(cara)
    return {s: d.get(s, [0.0, 0.0, 0.0]) for s in LADOS}


def _matriz_basis(cara, piv, rig_reposo=True):
    """3×3 que pasa un desplazamiento del MUNDO a la base de `piv` (cacheado la primera vez, con el rig en reposo)."""
    c = piv.get('rlb_P3inv')
    if c is not None and len(c) == 9:
        return Matrix((c[0:3], c[3:6], c[6:9]))
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    prev = None
    if rig is not None and rig.type == 'ARMATURE' and rig_reposo:
        prev = rig.data.pose_position
        rig.data.pose_position = 'REST'
        bpy.context.view_layer.update()
    try:
        par = piv.parent.matrix_world if piv.parent else Matrix.Identity(4)
        m = (par @ piv.matrix_parent_inverse).to_3x3().inverted()
    finally:
        if prev is not None:
            rig.data.pose_position = prev
            bpy.context.view_layer.update()
    piv['rlb_P3inv'] = [m[i][j] for i in range(3) for j in range(3)]
    return m


def _aplicar_ojo(cara, s, mm):
    piv = pivotes(cara).get(s)
    if piv is None:
        return None
    M = _matriz_basis(cara, piv)
    off_prev = Vector(piv.get('rlb_off_basis', (0.0, 0.0, 0.0)))
    loc0 = piv.get('rlb_loc0')
    actual = Vector(piv.location)
    if loc0 is None:
        loc0 = actual - off_prev
    else:
        loc0 = Vector(loc0)
        if (actual - (loc0 + off_prev)).length > 1e-7:     # alguien movió el pivote (p. ej. «ajustar espacio ocular»)
            loc0 = actual - off_prev
    q = cara.matrix_world.to_quaternion()
    d_mundo = q @ Vector(_mm_a_local(cara, mm))
    off = M @ d_mundo
    piv['rlb_loc0'] = list(loc0)
    piv['rlb_off_basis'] = list(off)
    piv.location = loc0 + off
    return off


def mirada_al_pivote(cara):
    """0.8.45: los objetivos mirada.L/R delante de cada ojo, a su misma x y z: si el ojo se movió y el objetivo no, mira torcido."""
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    piv = pivotes(cara)
    if rig is None or not all(f'mirada.{s}' in rig.data.bones for s in piv):
        return False
    vl = bpy.context.view_layer
    act, oculto = vl.objects.active, rig.hide_get()
    rig.hide_set(False); vl.objects.active = rig
    Mi = rig.matrix_world.inverted()
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        for s, p in piv.items():
            eb = rig.data.edit_bones[f'mirada.{s}']
            q = Mi @ p.matrix_world.translation
            d = Vector((q.x - eb.head.x, 0.0, q.z - eb.head.z))
            eb.head += d; eb.tail += d
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
        rig.hide_set(oculto); vl.objects.active = act
    vl.update()
    return True


def ojos_poner(cara, lado, x=None, y=None, z=None, espejo=False):
    """pone el ojo `lado` ('L'/'R') a (x, y, z) mm de su sitio original (None = no cambia ese eje).
    espejo=True mueve también el otro ojo igual (el eje lateral se invierte, para que sea simétrico)."""
    est = ojos_estado(cara)
    cur = est[lado]
    nuevo = [cur[0] if x is None else float(x), cur[1] if y is None else float(y), cur[2] if z is None else float(z)]
    est[lado] = nuevo
    if espejo:
        o = 'R' if lado == 'L' else 'L'
        est[o] = [-nuevo[0], nuevo[1], nuevo[2]]
    for s in LADOS:
        if s in pivotes(cara):
            _aplicar_ojo(cara, s, est[s])
    cara['rlb_ojos_pos'] = json.dumps({s: [round(v, 4) for v in est[s]] for s in LADOS})
    bpy.context.view_layer.update()
    mirada_al_pivote(cara)
    return aviso_parpados(cara)


def ojos_neutro(cara):
    """los dos ojos de vuelta a donde estaban."""
    for s in LADOS:
        if s in pivotes(cara):
            _aplicar_ojo(cara, s, [0.0, 0.0, 0.0])
    cara['rlb_ojos_pos'] = json.dumps({s: [0.0, 0.0, 0.0] for s in LADOS})
    bpy.context.view_layer.update()
    mirada_al_pivote(cara)


def radio_ojo(cara, s='L'):
    """radio del globo (m, espacio de la cara) midiendo las piezas del pivote (se guarda en el pivote)."""
    piv = pivotes(cara).get(s)
    if piv is None:
        return 0.0
    r = piv.get('rlb_radio')
    if r:
        return float(r)
    inv = cara.matrix_world.inverted()
    c = _a_local(cara, piv.matrix_world.translation)
    r = 0.0
    for ch in piv.children_recursive:
        if ch.type == 'MESH' and ('Globo' in ch.name or 'Eyeball' in ch.name):
            for v in ch.data.vertices:
                r = max(r, float(np.linalg.norm(np.array(inv @ (ch.matrix_world @ v.co)) - c)))
    if r > 0:
        try:
            piv['rlb_radio'] = r
        except AttributeError:
            pass    # se llama también desde draw(), donde Blender no deja escribir en objetos: solo es una caché
    return r


def aviso_parpados(cara):
    """texto si el desplazamiento es lo bastante grande como para rehacer los párpados (los ojos se mueven, la piel no)."""
    est = ojos_estado(cara)
    r = max(radio_ojo(cara, 'L'), 1e-6)
    mx = max(float(np.linalg.norm(est[s])) for s in LADOS) * 0.001
    if mx > 0.12 * r:
        return ('El ojo se movió más de un 12 % de su radio: los párpados siguen donde estaban. '
                'Rehaz los párpados para que cierren bien sobre el ojo nuevo.')
    return ''


def rehacer_parpados(cara):
    """rehace los párpados sobre los ojos ya colocados (ruta de superficie UV; en el rig completo, paso 8 del panel)."""
    from . import pasos
    if str(cara.get('rlb_parpados_metodo', '')).startswith('superficie_uv'):
        return pasos.parpados_aislados(cara, list(cara['rlb_parpados_uv_seeds']), reemplazar=True)
    raise RuntimeError('Este personaje usa el rig completo: rehaz los párpados con el paso «8. Párpados» de Avanzado')


# ------------------------------------------------------------------ piel (islas UV)
def semillas_piel(cara):
    s = cara.get('rlb_forma_semillas')
    if s is None:
        s = cara.get('rlb_parpados_uv_seeds')
    return [int(x) for x in s] if s else []


def _islas(cara, P):
    from . import inventario_uv
    me = cara.data
    uv = me.uv_layers.active
    if uv is None:
        return None, None
    faces = [tuple(p.vertices) for p in me.polygons]
    edges = [tuple(e.vertices) for e in me.edges]
    inv = inventario_uv.inventariar(P, edges, faces, [[uv.data[l].uv[:] for l in p.loop_indices] for p in me.polygons])
    return inv['islas_uv'], faces


def _componente(cara, P, centros):
    """sin UV: la parte de la malla (conectada por aristas) que toca los ojos."""
    me = cara.data
    n = len(me.vertices)
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', e)
    e = e.reshape(-1, 2)
    lab = np.arange(n)
    while True:
        m = np.minimum(lab[e[:, 0]], lab[e[:, 1]])
        nuevo = lab.copy()
        np.minimum.at(nuevo, e[:, 0], m)
        np.minimum.at(nuevo, e[:, 1], m)
        nuevo = nuevo[nuevo]
        if (nuevo == lab).all():
            break
        lab = nuevo
    # la parte con más vértices alrededor de la cara (la semilla del ojo puede caer en una pieza suelta: pestañas, globo)
    m = np.mean(list(centros.values()), axis=0)
    ipd = float(np.linalg.norm(centros['L'] - centros['R']))
    cerca = np.linalg.norm(P - m, axis=1) < 2.5 * ipd
    cuenta = np.bincount(lab[cerca], minlength=n)
    return lab == int(cuenta.argmax())


def piel(cara, P, centros, forzar=False):
    """(máscara de vértices de piel, info). Se guarda como atributo de la malla para no recalcular."""
    me = cara.data
    n = len(me.vertices)
    a = me.attributes.get(ATTR)
    if a is not None and not forzar and len(a.data) == n:
        v = np.zeros(n, dtype=bool)
        a.data.foreach_get('value', v)
        return v, {'origen': 'atributo'}
    sem = semillas_piel(cara)
    info = {}
    if sem and me.uv_layers.active is not None:
        islas, faces = _islas(cara, P)
        base = set()
        ids_base = []
        for k, i in enumerate(islas):
            if any(s in i['face_indices'] for s in sem):
                ids_base.append(k)
        if not ids_base:
            raise ValueError(f'Las semillas UV {sem} no están en ninguna isla')
        V = [np.unique([v for fi in i['face_indices'] for v in faces[fi]]) for i in islas]
        piel_v = np.zeros(n, bool)
        for k in ids_base:
            piel_v[V[k]] = True
        base_v = piel_v.copy()
        vecinas = []
        for k, v in enumerate(V):
            if k in ids_base:
                continue
            if int(base_v[v].sum()) >= MIN_COMPARTIDOS:
                piel_v[v] = True
                vecinas.append(k)
        info = {'origen': 'uv', 'islas_base': ids_base, 'islas_vecinas': len(vecinas), 'cara_base': int(base_v.sum())}
        info['_base'] = base_v
        info['_V'] = V
        info['_vecinas'] = vecinas
    elif cara.vertex_groups.get('RLB_piel') is not None:
        g = cara.vertex_groups['RLB_piel'].index
        piel_v = np.zeros(n, bool)
        for v in me.vertices:
            for ge in v.groups:
                if ge.group == g and ge.weight > 0.5:
                    piel_v[v.index] = True
                    break
        info = {'origen': 'grupo RLB_piel'}
    else:
        piel_v = _componente(cara, P, centros)
        info = {'origen': 'componente'}
    if a is None or a.domain != 'POINT' or a.data_type != 'BOOLEAN':
        if a is not None:
            me.attributes.remove(a)
        a = me.attributes.new(ATTR, 'BOOLEAN', 'POINT')
    a.data.foreach_set('value', piel_v)
    return piel_v, info


# ------------------------------------------------------------------ medir la cara
def evaluar(cara):
    """fuerza que los drivers de las keys se reevalúen tras escribir una propiedad desde Python (si no, van un paso tarde)."""
    cara.update_tag()
    for _ in range(2):
        bpy.context.view_layer.update()
        bpy.context.evaluated_depsgraph_get().update()


def _marca(cara, k):
    return bpy.data.objects.get(MK.nombre_marca(cara, k))


def _crear_marca(cara, k, loc_local, tam, forzar=False):
    nm = MK.nombre_marca(cara, k)
    e = bpy.data.objects.get(nm)
    nuevo = e is None
    if nuevo:
        e = bpy.data.objects.new(nm, None)
        col = util.coleccion(MK.coleccion_marcas(cara))
        col.objects.link(e)
    if nuevo or forzar:
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = float(tam)
        e.scale = (1, 1, 1)
        e.rotation_euler = (0, 0, 0)
        e.location = _a_mundo(cara, loc_local)
        e.show_in_front = True
        e.color = (1.0, 0.45, 0.8, 1.0)
    return e


def _leer_marca(cara, k):
    e = _marca(cara, k)
    if e is None:
        return None
    bpy.context.view_layer.update()
    return _a_local(cara, e.matrix_world.translation), float(e.empty_display_size * max(e.scale))


def _exceso(P, piel_v, cx, ipd, ze, ye, sg):
    """cuánto sobresale cada vértice del lado `sg` de la cabeza respecto a la piel de alrededor (mediana de la distancia
    a la línea media en un disco de 0,45·ipd visto de lado). La oreja sobresale ~1 cm; la cabeza y el pelo pegado, casi
    nada. 0 fuera de la ventana de búsqueda (a los lados, a la altura de los ojos, por detrás de ellos)."""
    lat = sg * (P[:, 0] - cx)
    win = piel_v & (lat > 0.6 * ipd) & (P[:, 2] > ze - 1.7 * ipd) & (P[:, 2] < ze + 0.8 * ipd) & \
        (P[:, 1] > ye - 0.3 * ipd) & (P[:, 1] < ye + 3.0 * ipd)
    idx = np.where(win)[0]
    ex = np.zeros(len(P))
    if len(idx) < 30:
        return ex
    Q, L = P[idx][:, 1:], lat[idx]
    R = 0.45 * ipd
    for i0 in range(0, len(idx), 512):
        d = np.linalg.norm(Q[i0:i0 + 512, None, :] - Q[None, :, :], axis=2)
        ex[idx[i0:i0 + 512]] = L[i0:i0 + 512] - np.nanmedian(np.where(d < R, L[None, :], np.nan), axis=1)
    return ex


def _componentes(E, sel):
    """etiqueta de componente conexa (por aristas) de los vértices `sel`."""
    e = E[sel[E[:, 0]] & sel[E[:, 1]]]
    lab = np.arange(len(sel))
    while True:
        m = np.minimum(lab[e[:, 0]], lab[e[:, 1]])
        nuevo = lab.copy()
        np.minimum.at(nuevo, e[:, 0], m)
        np.minimum.at(nuevo, e[:, 1], m)
        nuevo = nuevo[nuevo]
        if (nuevo == lab).all():
            return lab
        lab = nuevo


def _buscar_oreja_saliente(P, E, piel_v, cx, ipd, ze, ye, sg):
    """(centro, semialto, ancho/alto) de la oreja como el bulto que más sobresale de la cabeza por detrás de los ojos.
    Más fiable que «lo más saliente»: el pelo y la mejilla también están a los lados (en Tronchatoro la elipse quedaba
    1 cm alta y el punto de arriba caía en el pelo)."""
    ex = _exceso(P, piel_v, cx, ipd, ze, ye, sg)
    sel = ex > 0.08 * ipd
    if sel.sum() < 15:
        return None
    lab = _componentes(E, sel)
    lat = sg * (P[:, 0] - cx)
    mejor, puntos_ = None, -1.0
    for u in np.unique(lab[sel]):
        v = np.where(sel & (lab == u))[0]
        if len(v) < 15:
            continue
        q = P[v]
        if (q[:, 1].min() + q[:, 1].max()) / 2 < ye + 0.5 * ipd:       # delante: mejilla, ceja
            continue
        p = float(np.median(lat[v])) * math.sqrt(len(v))
        if p > puntos_:
            mejor, puntos_ = v, p
    if mejor is None:
        return None
    q = P[mejor]
    c = np.array([q[:, 0].mean(), (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2])
    alto = q[:, 2].max() - q[:, 2].min()
    b = 0.55 * alto                                   # el bulto deja fuera la raíz: un 10 % más
    ab = float(np.clip((q[:, 1].max() - q[:, 1].min()) / max(alto, 1e-9), 0.35, 1.0))
    return c, float(np.clip(b, 0.2 * ipd, 0.6 * ipd)), ab


def _buscar_oreja(P, piel_v, cx, ipd, ze, ye, sg):
    """(centro, semialto) de la oreja como la parte más saliente de la piel a los lados de la cabeza, a la altura de los
    ojos y por detrás de ellos. None si no hay piel suficiente."""
    lat = sg * (P[:, 0] - cx)
    win = piel_v & (lat > 0.8 * ipd) & (P[:, 2] > ze - 1.5 * ipd) & (P[:, 2] < ze + 0.15 * ipd) &         (P[:, 1] > ye + 0.1 * ipd) & (P[:, 1] < ye + 2.6 * ipd)
    if win.sum() < 30:
        return None
    lm = lat[win].max()
    Q = P[win & (lat > lm - 0.22 * ipd)]
    c0 = np.median(Q, axis=0)
    d = np.linalg.norm(Q[:, 1:] - c0[1:], axis=1)
    Q = Q[d < np.percentile(d, 80)]
    c = np.array([Q[:, 0].mean(), (Q[:, 1].min() + Q[:, 1].max()) / 2, (Q[:, 2].min() + Q[:, 2].max()) / 2])
    ancho = win & (lat > lm - 0.45 * ipd) & (np.linalg.norm(P[:, 1:] - c[1:], axis=1) < 1.0 * ipd)
    W = P[ancho]
    b = float((W[:, 2].max() - W[:, 2].min()) / 2) if len(W) > 5 else 0.4 * ipd
    return c, float(np.clip(b, 0.25 * ipd, 0.42 * ipd))


def medir(cara, forzar=False):
    """mide el marco de la cara y propone orejas y mentón. Respeta los puntos que el usuario ya movió.
    Devuelve el marco (dict serializable) y lo guarda en cara['rlb_forma']."""
    P = _coords(cara)
    E = _centros_ojos(cara)
    sL = _signo_L(cara)
    cx = float((E['L'][0] + E['R'][0]) / 2)
    ipd = float(abs(E['L'][0] - E['R'][0]))
    ze = float((E['L'][2] + E['R'][2]) / 2)
    ye = float((E['L'][1] + E['R'][1]) / 2)
    v_piel, info = piel(cara, P, E, forzar=forzar)
    base = info.get('_base')
    av = []
    # --- mentón: borde de abajo de la isla de la cara, en la línea media
    ref = base if base is not None else v_piel
    central = ref & (np.abs(P[:, 0] - cx) < 0.6 * ipd) & (P[:, 2] < ze - 0.8 * ipd)
    if base is None and central.sum() >= 3:
        # sin isla de cara: el cuello sigue por debajo, así que el mentón es lo más bajo que aún está delante
        # (por debajo de la punta del mentón la línea media se mete hacia atrás: es la garganta)
        franja = central & (P[:, 2] > ze - 1.7 * ipd)
        if franja.sum() >= 3:
            y_ref = float(np.percentile(P[franja][:, 1], 10))
            central = central & (P[:, 1] < y_ref + 0.6 * ipd)
    if central.sum() >= 3:
        z_chin = float(P[central][:, 2].min())
        sel = central & (P[:, 2] < z_chin + 0.35 * ipd)
        y_chin = float(np.median(P[sel][:, 1]))
    else:
        z_chin = ze - 1.85 * ipd
        y_chin = ye - 1.0 * ipd
        av.append('No pude medir el mentón: uso proporciones del ojo (mueve el punto fm_menton si hace falta).')
    # --- boca: marcadores de comisura si existen; si no, proporción entre el ojo y el mentón
    cl, cr = _leer_marca(cara, 'comisura.L'), _leer_marca(cara, 'comisura.R')
    if cl and cr:
        z_boca = float((cl[0][2] + cr[0][2]) / 2)
    else:
        z_boca = z_chin + 0.40 * (ze - z_chin)
    H = z_boca - z_chin
    # --- ancho de la mandíbula (a media altura entre mentón y boca, parte de delante)
    cand = v_piel & (P[:, 2] > z_chin + 0.15 * H) & (P[:, 2] < z_boca + 0.5 * H) & (P[:, 1] < ye + 1.0 * ipd)
    aj = float(np.percentile(np.abs(P[cand][:, 0] - cx), 92)) if cand.sum() > 20 else 1.25 * ipd
    # --- mentón (zona): elipse cuyo borde de abajo toca la punta del mentón
    b_c = 0.42 * H
    a_c = 0.5 * aj
    cc = np.array([cx, y_chin + 0.3 * ipd, z_chin + b_c])
    m = _leer_marca(cara, 'fm_menton')
    if m is None or forzar:
        _crear_marca(cara, 'fm_menton', cc, b_c, forzar=True)
    else:
        cc, b_c = m
        a_c = max(a_c, 1e-6)
    ratio_c = a_c / max(b_c, 1e-9)
    # --- orejas: isla UV lateral vecina de la cara (si hay UV) o proporciones del ojo
    orejas = {}
    V, vec = info.get('_V'), info.get('_vecinas') or []
    for s in LADOS:
        sg = sL if s == 'L' else -sL
        mk = _leer_marca(cara, f'fm_oreja.{s}')
        if mk is not None and not forzar:
            c, b = mk
            orejas[s] = {'c': c.tolist(), 'b': b, 'a_b': float(cara.get('rlb_forma_oreja_ab', 0.6))}
            continue
        mejor = None
        for k in vec:
            v = V[k]
            ctr = P[v].mean(0)
            lat = sg * (ctr[0] - cx)
            if lat > 0.9 * ipd and abs(ctr[2] - ze) < 1.5 * ipd and len(v) >= 40:
                if mejor is None or len(v) > len(V[mejor]):
                    mejor = k
        if mejor is not None:
            q = P[V[mejor]]
            c = np.array([q[:, 0].mean(), (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2])
            b = float((q[:, 2].max() - q[:, 2].min()) / 2)
            ab = float(np.clip((q[:, 1].max() - q[:, 1].min()) / max(q[:, 2].max() - q[:, 2].min(), 1e-9), 0.35, 1.0))
        else:
            g = _buscar_oreja_saliente(P, aristas(cara), v_piel, cx, ipd, ze, ye, sg)
            g2 = None if g is not None else _buscar_oreja(P, v_piel, cx, ipd, ze, ye, sg)
            if g is not None:
                c, b, ab = g
                av.append(f'Oreja {s}: sin isla UV; la busqué por el bulto que sobresale de la cabeza. Revísala '
                          f'(punto fm_oreja.{s}).')
            elif g2 is not None:
                c, b = g2
                ab = 0.6
                av.append(f'Oreja {s}: sin isla UV; la busqué por lo más saliente de la cabeza. Revísala (punto fm_oreja.{s}).')
            else:
                c = np.array([cx + sg * 1.5 * ipd, ye + 1.1 * ipd, ze - 0.05 * ipd])
                b = 0.45 * ipd
                ab = 0.6
                av.append(f'Oreja {s}: no la encontré; la puse por proporciones. Muévela con el punto fm_oreja.{s}.')
        orejas[s] = {'c': c.tolist(), 'b': b, 'a_b': ab}
        _crear_marca(cara, f'fm_oreja.{s}', c, b, forzar=True)
    marco = {'cx': cx, 'ipd': ipd, 'ze': ze, 'ye': ye, 'sL': sL, 'z_chin': z_chin, 'y_chin': y_chin, 'z_boca': z_boca,
             'aj': aj, 'menton': {'c': list(map(float, cc)), 'b': float(b_c), 'a_b': float(ratio_c)},
             'orejas': orejas, 'piel': {k: v for k, v in info.items() if not k.startswith('_')}, 'avisos': av}
    cara[CFG] = json.dumps(marco)
    return marco


def marco(cara):
    try:
        return json.loads(cara[CFG])
    except Exception:
        return None


def _marco_vivo(cara):
    """marco guardado, con la posición/tamaño ACTUALES de los puntos fm_* (que el usuario puede haber movido)."""
    M = marco(cara)
    if M is None:
        raise RuntimeError('Primero prepara la edición de la forma')
    m = _leer_marca(cara, 'fm_menton')
    if m is not None:
        c, b = m
        M['menton']['c'] = c.tolist()
        M['menton']['b'] = b
    for s in LADOS:
        m = _leer_marca(cara, f'fm_oreja.{s}')
        if m is not None:
            c, b = m
            M['orejas'][s]['c'] = c.tolist()
            M['orejas'][s]['b'] = b
    return M


# ------------------------------------------------------------------ deformaciones
def _diag(u, w, rho, k, amp):
    """empuje radial (en coordenadas normalizadas) que lleva los rincones de una elipse hacia una caja (k > 0) o hacia
    una V/rombo (k < 0): los rincones (diagonales) salen o entran y los ejes casi no se mueven (el tamaño apenas cambia).
    Crece con la distancia al centro (el borde se mueve, el centro no)."""
    th = np.arctan2(w, u)
    d = 1.25 * (np.sin(2 * th) ** 2 - 0.2)    # +1 en las diagonales, −0,25 en los ejes
    rc = np.clip(rho, 0, 1.25)
    push = k * amp * rc ** 3 * d
    r = np.maximum(rho, 1e-9)
    return push * u / r, push * w / r


def aristas(cara):
    me = cara.data
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', e)
    return e.reshape(-1, 2)


def _suavizado(P, E, w, ejes, iters=22, lam=0.55):
    """desplazamiento que REDONDEA: cada vértice se acerca al promedio de sus vecinos, solo donde pesa `w` y solo en los
    ejes dados. Sirve parta cualquier forma de partida (una V se redondea, una caja pierde los rincones)."""
    n = len(P)
    deg = np.bincount(E.ravel(), minlength=n).astype(float)
    deg[deg == 0] = 1.0
    X = P.copy()
    ax = list(ejes)
    for _ in range(iters):
        s = np.zeros((n, len(ax)))
        np.add.at(s, E[:, 0], X[E[:, 1]][:, ax])
        np.add.at(s, E[:, 1], X[E[:, 0]][:, ax])
        X[:, ax] += lam * w[:, None] * (s / deg[:, None] - X[:, ax])
    return X - P


def _compensar(P, S, w, c, ejes):
    """el suavizado encoge la forma: la vuelve a escalar alrededor de `c` para que conserve su tamaño medio."""
    ax = list(ejes)
    m = w > 0.3
    if m.sum() < 5:
        return S
    c = np.asarray(c, float)
    r0 = np.linalg.norm(P[m][:, ax] - c[ax], axis=1).mean()
    r1 = np.linalg.norm((P + S)[m][:, ax] - c[ax], axis=1).mean()
    f = r0 / max(r1, 1e-12)
    S = S.copy()
    S[:, ax] += (P[:, ax] + S[:, ax] - c[ax]) * (f - 1.0) * w[:, None]
    return S


def _mascara_oreja(P, piel_v, cx, c, b, ab, sg, borde=1.3):
    """peso 0..1 de la oreja: dentro de su elipse (vista de lado) y separada de la línea media. La caída termina en
    `borde` (antes 1,9: arrastraba la piel y el pelo de alrededor, y al mover un control se movía media cabeza)."""
    a = max(b * ab, 1e-9)
    dy, dz = (P[:, 1] - c[1]) / a, (P[:, 2] - c[2]) / b
    rho = np.sqrt(dy ** 2 + dz ** 2)
    lat = sg * (P[:, 0] - cx)
    latc = abs(c[0] - cx)
    m = piel_v * (1 - _ss(1.0, borde, rho)) * _ss(0.55 * latc, 0.8 * latc, lat)
    return m, dy, dz, rho, lat, latc


def _deltas_oreja(P, E, piel_v, cx, c, b, ab, sg, modo, k):
    a = max(b * ab, 1e-9)
    D = np.zeros_like(P)
    y, z = P[:, 1] - c[1], P[:, 2] - c[2]
    m, dy, dz, rho, lat, latc = _mascara_oreja(P, piel_v, cx, c, b, ab, sg)
    gy = np.exp(-(dy / 0.6) ** 2)
    if modo == 'forma':
        du, dw = _diag(dy, dz, rho, k, 0.20)
        D[:, 1] = a * du * m
        D[:, 2] = b * dw * m
    elif modo == 'redondo':
        D = _compensar(P, _suavizado(P, E, m, (1, 2), iters=16), m, c, (1, 2)) * k
    elif modo == 'tamano':
        D[:, 1] = y * 0.28 * k * m
        D[:, 2] = z * 0.28 * k * m
    elif modo == 'alto':
        D[:, 2] = z * 0.32 * k * m
    elif modo == 'ancho':
        D[:, 1] = y * 0.32 * k * m
    elif modo == 'subir':
        D[:, 2] = b * 0.6 * k * m
    elif modo == 'adelante':
        D[:, 1] = -a * 0.9 * k * m
    elif modo == 'separar':
        D[:, 0] = sg * a * 0.7 * k * m * _ss(-1.0, 0.8, dy) * np.clip(rho, 0, 1)
    elif modo == 'punta':
        D[:, 2] = b * 0.9 * k * m * _ss(0.3, 1.0, dz) * gy
    elif modo == 'lobulo':
        D[:, 2] = -b * 0.8 * k * m * _ss(0.3, 1.0, -dz) * np.exp(-(dy / 0.8) ** 2)
    elif modo == 'inclinar':
        f = 0.38 * k
        cs, sn = math.cos(f), math.sin(f)
        D[:, 1] = ((y * cs - z * sn) - y) * m
        D[:, 2] = ((y * sn + z * cs) - z) * m
    return D


# ------------------------------------------------------------------ modelar la oreja a mano (puntos locales)
# Los controles de arriba cambian la oreja ENTERA (tamaño, redondez…). Para modelarla hace falta mover solo una parte:
# 8 puntos en el borde de cada oreja; cada uno tiene 3 keys (fuera, atrás, arriba) con un peso que cae a 0 antes de
# llegar al punto vecino, medido POR LA SUPERFICIE (así el borde no arrastra la piel de la cabeza que tiene detrás).
A_LOCAL = (90, 135, 180, 225, 270, 315, 0, 45)       # ángulo en la oreja vista de lado (0 = atrás, 90 = arriba)
N_LOCAL = {90: 'Arriba', 135: 'Arriba delante', 180: 'Delante', 225: 'Abajo delante', 270: 'Lóbulo',
           315: 'Abajo atrás', 0: 'Atrás', 45: 'Arriba atrás'}
EJES_LOCAL = ('x', 'y', 'z')       # x + = hacia fuera de la cabeza, y + = hacia atrás, z + = arriba
UNIDAD_LOCAL = 0.5                 # 100 % = media vez el semialto de la oreja
TOPE_LOCAL = 2.0                   # ±200 %


def clave_local(h, eje, lado):
    return f'{PREF}oreja_{lado}_p{h}{eje}'


def prop_local(h, eje, lado=''):
    return f'{PROP}oreja_p{h}{eje}{"_" + lado if lado else ""}'


def props_locales():
    return [prop_local(h, e, s) for h in range(len(A_LOCAL)) for e in EJES_LOCAL for s in ('',) + LADOS]


def _geodesica(P, E, fuente, permitido, corte):
    """distancia por las aristas desde `fuente`, solo por vértices `permitido`, hasta `corte` (inf más allá)."""
    import heapq
    from collections import defaultdict
    ok = permitido[E[:, 0]] & permitido[E[:, 1]]
    vec = defaultdict(list)
    L = np.linalg.norm(P[E[ok, 0]] - P[E[ok, 1]], axis=1)
    for (i, j), l in zip(E[ok], L):
        vec[int(i)].append((int(j), float(l)))
        vec[int(j)].append((int(i), float(l)))
    dist = {int(fuente): 0.0}
    cola = [(0.0, int(fuente))]
    while cola:
        d, v = heapq.heappop(cola)
        if d > dist.get(v, 1e18) or d > corte:
            continue
        for w, l in vec[v]:
            nd = d + l
            if nd < dist.get(w, 1e18) and nd <= corte:
                dist[w] = nd
                heapq.heappush(cola, (nd, w))
    out = np.full(len(P), np.inf)
    out[list(dist.keys())] = list(dist.values())
    return out


def oreja_saliente(P, E, piel_v, M, lado):
    """vértices de la oreja propiamente dicha (lo que sobresale de la cabeza dentro de la elipse), con 2 anillos de
    margen hacia la raíz. Así ningún punto cae en el pelo o en la piel de al lado aunque la elipse no esté perfecta."""
    o = M['orejas'][lado]
    c, b = np.array(o['c']), o['b']
    sg = M['sL'] if lado == 'L' else -M['sL']
    _, dy, dz, rho, lat, latc = _mascara_oreja(P, piel_v, M['cx'], c, b, o['a_b'], sg)
    ex = _exceso(P, piel_v, M['cx'], M['ipd'], M['ze'], M['ye'], sg)
    nucleo = (ex > 0.05 * M['ipd']) & (rho < 1.45)
    if nucleo.sum() < 15:                 # sin bulto claro (oreja muy pegada): la elipse manda
        nucleo = piel_v & (rho < 1.05) & (lat > 0.8 * latc)
    lab = _componentes(E, nucleo)
    u, n = np.unique(lab[nucleo], return_counts=True)
    nucleo = nucleo & np.isin(lab, u[n >= max(8, 0.15 * n.max())])      # fuera las motas sueltas (pelo)
    # la concha (el hueco de dentro) apenas sobresale: todo lo que queda dentro del contorno del bulto es oreja
    # (si no, al mover la oreja entera la concha se quedaba quieta y se abría una grieta)
    q = P[nucleo]
    cy, cz = (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2
    ry, rz = max((q[:, 1].max() - q[:, 1].min()) / 2, 1e-9), max((q[:, 2].max() - q[:, 2].min()) / 2, 1e-9)
    dentro = np.sqrt(((P[:, 1] - cy) / ry) ** 2 + ((P[:, 2] - cz) / rz) ** 2) < 0.95
    nucleo = nucleo | (piel_v & dentro & (lat > 0.75 * latc))
    zona = nucleo.copy()
    for _ in range(3):
        a = zona[E[:, 0]] | zona[E[:, 1]]
        zona[E[a].ravel()] = True
    return nucleo, zona & piel_v & (rho < 1.6)


def anclas_locales(P, piel_v, M, lado, nucleo=None):
    """vértice de cada punto local: el más saliente del borde de la oreja en su ángulo."""
    o = M['orejas'][lado]
    c, b = np.array(o['c']), o['b']
    sg = M['sL'] if lado == 'L' else -M['sL']
    m, dy, dz, rho, lat, latc = _mascara_oreja(P, piel_v, M['cx'], c, b, o['a_b'], sg)
    # el ángulo se mide desde el centro del bulto (si lo hay), no desde el de la elipse
    if nucleo is not None and nucleo.sum() >= 15:
        q = P[nucleo]
        cy, cz = (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2
        a_, b_ = max((q[:, 1].max() - q[:, 1].min()) / 2, 1e-9), max((q[:, 2].max() - q[:, 2].min()) / 2, 1e-9)
        dy, dz = (P[:, 1] - cy) / a_, (P[:, 2] - cz) / b_
        rho = np.sqrt(dy ** 2 + dz ** 2)
        ok = nucleo & (rho > 0.4)
    else:
        ok = (m > 0.5) & (rho > 0.45) & (rho < 1.1)
    ang = np.degrees(np.arctan2(dz, dy))
    out, usados = [], set()
    for th in A_LOCAL:
        dif = np.abs((ang - th + 180) % 360 - 180)
        idx = np.where(ok & (dif < 15))[0]
        if len(idx) == 0:
            idx = np.where(ok & (dif < 35))[0]
        if len(idx) == 0:
            idx = np.where(ok)[0]
        # lo más afuera (borde de la hélice) y lo más lejos del centro
        orden = idx[np.argsort(-(lat[idx] / max(latc, 1e-9) + 0.5 * rho[idx]))]
        v = next((int(x) for x in orden if int(x) not in usados), int(orden[0]))
        usados.add(v)
        out.append(v)
    return out


def _pesos_locales(P, E, piel_v, M, lado, anc, zona=None):
    """[peso por vértice] de cada punto local de la oreja `lado` (`zona`: vértices por los que puede llegar)."""
    o = M['orejas'][lado]
    c, b = np.array(o['c']), o['b']
    sg = M['sL'] if lado == 'L' else -M['sL']
    _, dy, dz, rho, lat, latc = _mascara_oreja(P, piel_v, M['cx'], c, b, o['a_b'], sg)
    # el borde de la oreja (rho ≈ 1) es justo lo que se modela: aquí no se atenúa por la elipse, solo se limita la
    # región; el radio por la superficie es el que decide hasta dónde llega cada punto
    m = piel_v * _ss(0.55 * latc, 0.8 * latc, lat)
    permitido = (m > 0.02) & (rho < 1.4) if zona is None else (zona & (m > 0.02))
    for v in anc:
        permitido[v] = True
    G = [_geodesica(P, E, v, permitido, 2.5 * b) for v in anc]
    out = []
    for i, v in enumerate(anc):
        # el vecino más cercano se mueve ~¼ (las orejas de Tripo tienen pocos vértices: con menos queda un pico)
        vecino = min(float(G[j][v]) for j in range(len(anc)) if j != i)
        r = float(np.clip(1.3 * vecino, 0.6 * b, 1.0 * b)) if np.isfinite(vecino) else 0.7 * b
        out.append(_campana(G[i], r) * m / max(float(m[v]), 0.3))
    return [np.clip(w, 0.0, 1.0) for w in out]


def _ejes_locales(M, lado):
    sg = M['sL'] if lado == 'L' else -M['sL']
    return {'x': np.array([sg, 0.0, 0.0]), 'y': np.array([0.0, 1.0, 0.0]), 'z': np.array([0.0, 0.0, 1.0])}


def unidad_local(M, lado):
    return UNIDAD_LOCAL * M['orejas'][lado]['b']


def _pesos_mandibula(P, piel_v, M):
    """peso 0..1 de la parte baja de la cara (mandíbula + mentón), sin repartir entre lados."""
    cx, zb, zc, aj = M['cx'], M['z_boca'], M['z_chin'], M['aj']
    ipd, ye = M['ipd'], M['ye']
    H = max(zb - zc, 1e-9)
    u = (P[:, 0] - cx) / aj
    v = (zb - P[:, 2]) / H                    # 0 en la boca, 1 en la punta del mentón
    rho = np.sqrt(u ** 2 + np.maximum(v, 0) ** 2)
    w = piel_v * _ss(-0.25, 0.1, v) * (1 - _ss(1.0, 1.6, v)) * (1 - _ss(1.1, 1.5, np.abs(u)))
    w = w * (1 - _ss(ye + 1.4 * ipd, ye + 2.0 * ipd, P[:, 1]))     # nada de la nuca ni del cuello de atrás
    return w, u, v, rho


def _factor_lado(u, M, lado):
    """reparto entre izquierda y derecha: suave alrededor de la línea media (los dos lados suman 1)."""
    s = M['sL'] if lado == 'L' else -M['sL']
    return _ss(-0.25, 0.25, s * u)


def _deltas_mandibula(P, E, piel_v, M, lado, modo, k):
    D = np.zeros_like(P)
    w0, u, v, rho = _pesos_mandibula(P, piel_v, M)
    w = w0 * _factor_lado(u, M, lado)
    aj, H = M['aj'], max(M['z_boca'] - M['z_chin'], 1e-9)
    s = M['sL'] if lado == 'L' else -M['sL']
    if modo == 'forma':
        du, dw = _diag(u, -np.maximum(v, 0), rho, k, 0.16)       # coordenada vertical hacia arriba (v crece hacia abajo)
        D[:, 0] = aj * du * w
        D[:, 2] = H * dw * w
    elif modo == 'redondo':
        wr = w0 * _ss(0.3, 0.55, v)               # sin tocar los labios
        S = _compensar(P, _suavizado(P, E, wr, (0, 2), iters=26), wr, np.array([M['cx'], 0.0, M['z_boca']]), (0, 2))
        D = S * k * _factor_lado(u, M, lado)[:, None]
    elif modo == 'ancho':
        D[:, 0] = s * 0.10 * aj * k * w * _ss(0.15, 0.75, np.abs(u))
    elif modo == 'largo':
        D[:, 2] = -0.35 * H * k * w * _ss(0.1, 0.9, v)
    return D


def _deltas_menton(P, E, piel_v, M, modo, k):
    D = np.zeros_like(P)
    c = np.array(M['menton']['c'])
    b = M['menton']['b']
    a = b * M['menton']['a_b']
    u = (P[:, 0] - c[0]) / a
    wn = (P[:, 2] - c[2]) / b
    rho = np.sqrt(u ** 2 + wn ** 2)
    ipd = M['ipd']
    zb, H = M['z_boca'], max(M['z_boca'] - M['z_chin'], 1e-9)
    m = piel_v * (1 - _ss(0.95, 1.6, rho)) * (1 - _ss(zb - 0.35 * H, zb - 0.1 * H, P[:, 2]))
    m = m * (1 - _ss(M['y_chin'] + 0.9 * ipd, M['y_chin'] + 1.6 * ipd, P[:, 1]))
    if modo == 'forma':
        du, dw = _diag(u, wn, rho, k, 0.22)
        D[:, 0] = a * du * m
        D[:, 2] = b * dw * m
    elif modo == 'redondo':
        D = _compensar(P, _suavizado(P, E, m, (0, 2), iters=26), m, c, (0, 2)) * k
    elif modo == 'punta':
        D[:, 2] = -b * 0.6 * k * m * np.exp(-(u / 0.55) ** 2) * _ss(-0.3, 1.0, -wn)
        D[:, 1] = -b * 0.15 * k * m * np.exp(-(u / 0.55) ** 2) * _ss(-0.3, 1.0, -wn)
    elif modo == 'alto':
        D[:, 2] = -b * 0.45 * k * m * _ss(-1.0, 0.9, -wn)
    elif modo == 'ancho':
        D[:, 0] = (P[:, 0] - c[0]) * 0.30 * k * m
    elif modo == 'adelante':
        D[:, 1] = -a * 0.5 * k * m
    return D


def _delta(P, E, piel_v, M, zona, modo, lado):
    if zona == 'menton':
        return _deltas_menton(P, E, piel_v, M, modo, 1.0)
    if zona == 'mandibula':
        return _deltas_mandibula(P, E, piel_v, M, lado, modo, 1.0)
    o = M['orejas'][lado]
    sg = M['sL'] if lado == 'L' else -M['sL']
    D = _deltas_oreja(P, E, piel_v, M['cx'], np.array(o['c']), o['b'], o['a_b'], sg, modo, 1.0)
    z = M.get('_zona_oreja', {}).get(lado)
    return D if z is None else D * z[:, None]


def _zona_suave(E, nucleo, zona, pasadas=3):
    """máscara 0..1 de la oreja: 1 en la oreja, difuminada unos anillos hacia la raíz (que se estira) y 0 en el pelo
    o la piel de al lado."""
    n = len(zona)
    deg = np.bincount(E.ravel(), minlength=n).astype(float)
    deg[deg == 0] = 1.0
    w = zona.astype(float)
    for _ in range(pasadas):
        s = np.zeros(n)
        np.add.at(s, E[:, 0], w[E[:, 1]])
        np.add.at(s, E[:, 1], w[E[:, 0]])
        w = (0.5 * w + 0.5 * s / deg) * zona
    return np.maximum(w, nucleo.astype(float))


# ------------------------------------------------------------------ keys y drivers
def _asegurar_basis(cara):
    if cara.data.shape_keys is None:
        cara.shape_key_add(name='Basis', from_mix=False)


def _poner_key(cara, nombre, D, tope=1.0):
    sk = cara.data.shape_keys
    k = sk.key_blocks.get(nombre) or cara.shape_key_add(name=nombre, from_mix=False)
    base = util.coords(cara.data)
    k.data.foreach_set('co', (base + D).ravel())
    k.slider_min, k.slider_max = -tope, tope
    return k


def _driver(cara, k, vars_, expr):
    sk = cara.data.shape_keys
    path = f'key_blocks["{k.name}"].value'
    if sk.animation_data:
        for f in list(sk.animation_data.drivers):
            if f.data_path == path:
                sk.animation_data.drivers.remove(f)
    fc = k.driver_add('value')
    d = fc.driver
    d.type = 'SCRIPTED'
    for nm, pr in vars_:
        v = d.variables.new()
        v.name = nm
        v.type = 'SINGLE_PROP'
        v.targets[0].id_type = 'OBJECT'
        v.targets[0].id = cara
        v.targets[0].data_path = f'["{pr}"]'
    d.expression = expr


def _prop_inicial(cara, nombre, tope=100.0):
    if nombre not in cara.keys():
        cara[nombre] = 0.0
    try:
        cara.id_properties_ui(nombre).update(min=-tope, max=tope, soft_min=-tope, soft_max=tope, step=100,
                                              precision=0, subtype='PERCENTAGE')
    except Exception:
        try:
            cara.id_properties_ui(nombre).update(min=-tope, max=tope, soft_min=-tope, soft_max=tope)
        except Exception:
            pass


def crear_keys(cara, M=None):
    """(re)crea todas las shape keys fm_* y sus drivers a partir del marco y de los puntos actuales."""
    M = M or _marco_vivo(cara)
    P = _coords(cara)
    piel_v, _ = piel(cara, P, _centros_ojos(cara))
    E = aristas(cara)
    _asegurar_basis(cara)
    hechas = []
    orejas = {s: oreja_saliente(P, E, piel_v, M, s) for s in LADOS}
    M = dict(M, _zona_oreja={s: _zona_suave(E, *orejas[s]) for s in LADOS})
    for z, (_, pares, modos) in ZONAS.items():
        for modo, *_ in modos:
            _prop_inicial(cara, prop(z, modo))
            if pares:
                for s in LADOS:
                    _prop_inicial(cara, prop(z, modo, s))
                    k = _poner_key(cara, clave(z, modo, s), _delta(P, E, piel_v, M, z, modo, s))
                    _driver(cara, k, [('b', prop(z, modo)), ('d', prop(z, modo, s))],
                            'max(-1,min(1,(b+d)/100))')
                    hechas.append(k.name)
            else:
                k = _poner_key(cara, clave(z, modo), _delta(P, E, piel_v, M, z, modo, ''))
                _driver(cara, k, [('b', prop(z, modo))], 'max(-1,min(1,b/100))')
                hechas.append(k.name)
    # puntos locales de las orejas (modelar a mano)
    t = TOPE_LOCAL
    locales = {}
    for s in LADOS:
        nucleo, zona = orejas[s]
        anc = anclas_locales(P, piel_v, M, s, nucleo)
        W = _pesos_locales(P, E, piel_v, M, s, anc, zona)
        ejes, u = _ejes_locales(M, s), unidad_local(M, s)
        for h, w in enumerate(W):
            locales[f'{h}|{s}'] = anc[h]
            for e in EJES_LOCAL:
                _prop_inicial(cara, prop_local(h, e), 100 * t)
                _prop_inicial(cara, prop_local(h, e, s), 100 * t)
                k = _poner_key(cara, clave_local(h, e, s), w[:, None] * (u * ejes[e])[None, :], tope=t)
                _driver(cara, k, [('b', prop_local(h, e)), ('d', prop_local(h, e, s))],
                        f'max(-{t:g},min({t:g},(b+d)/100))')
                hechas.append(k.name)
    cara['rlb_forma_keys'] = hechas
    cara['rlb_forma_anclas'] = anclas(P, piel_v, M)
    cara['rlb_forma_locales'] = json.dumps(locales)
    # los drivers recién creados quedan sin evaluar hasta que se reescribe su expresión (como en controles.refrescar_drivers)
    for f in cara.data.shape_keys.animation_data.drivers:
        if f.data_path.startswith('key_blocks["fm_'):
            f.driver.expression = f.driver.expression
            f.is_valid = True
    cara.data.shape_keys.update_tag()
    cara.update_tag()
    cara.data.update()
    bpy.context.view_layer.update()
    return hechas


# ------------------------------------------------------------------ un punto por control, anclado a un vértice
# (dy, dz) en unidades del semiancho/semialto de la oreja (dy + = atrás); (u, v) en la mandíbula (u: semiancho lateral,
# v: 0 en la boca y 1 en el mentón); (du, dw) en el mentón (dw + = arriba)
# ángulo (grados) sobre el contorno de la oreja visto de lado: 0 = hacia atrás, 90 = arriba, 180 = hacia delante, −90 = abajo
A_OREJA = {'alto': 90, 'punta': 62, 'forma': 32, 'tamano': 5, 'separar': -22, 'redondo': -50, 'lobulo': -90,
           'adelante': -135, 'ancho': 180, 'subir': 142, 'inclinar': 117}
T_MANDIBULA = {'forma': (0.8, 0.7), 'redondo': (0.5, 1.0), 'ancho': (1.05, 0.3), 'largo': (0.2, 1.05)}
T_MENTON = {'forma': (0.85, -0.5), 'redondo': (-0.85, -0.5), 'punta': (0.0, -1.0), 'alto': (0.0, 0.15),
            'ancho': (1.25, 0.0), 'adelante': (-0.35, -0.2)}
EJE_ARRASTRE = {'ancho': 'h', 'separar': 'h', 'adelante': 'h'}      # el resto, vertical


def id_punto(zona, modo, lado=''):
    return f'{zona}|{modo}|{lado}'


def _elegir(P, piel_v, usados, centro, ejes, radio, criterio):
    """vértice de piel cerca de `centro` (en los ejes dados); entre los cercanos, el que gana por `criterio`."""
    d = np.linalg.norm(P[:, ejes] - centro[ejes], axis=1)
    d = np.where(piel_v, d, 1e9)
    ok = np.where(d < radio)[0]
    if len(ok) == 0:
        ok = np.argsort(d)[:30]
    orden = ok[np.argsort(criterio(P[ok]))]
    for v in orden:
        if int(v) not in usados:
            usados.add(int(v)); return int(v)
    return int(orden[0])


def anclas(P, piel_v, M):
    out, usados = {}, set()
    for s in LADOS:
        o = M['orejas'][s]
        c, b = np.array(o['c']), o['b']
        a = b * o['a_b']
        sg = M['sL'] if s == 'L' else -M['sL']
        dy_ = (P[:, 1] - c[1]) / a
        dz_ = (P[:, 2] - c[2]) / b
        rho = np.sqrt(dy_ ** 2 + dz_ ** 2)
        ang = np.degrees(np.arctan2(dz_, dy_))
        lat = sg * (P[:, 0] - M['cx'])
        latc = abs(c[0] - M['cx'])
        ok = piel_v & (rho < 1.12) & (rho > 0.35) & (lat > 0.7 * latc)
        for modo, th in A_OREJA.items():
            dif = np.abs((ang - th + 180) % 360 - 180)
            cand = ok & (dif < 14)
            if cand.sum() == 0:
                cand = ok & (dif < 30)
            if cand.sum() == 0:
                cand = ok
            idx = np.where(cand)[0]
            orden = idx[np.argsort(-rho[idx])]           # el más cercano al borde de la oreja
            v = next((int(x) for x in orden if int(x) not in usados), int(orden[0]))
            usados.add(v)
            out[id_punto('oreja', modo, s)] = v
    aj, H, zb, cx = M['aj'], max(M['z_boca'] - M['z_chin'], 1e-9), M['z_boca'], M['cx']
    for s in LADOS:
        sg = M['sL'] if s == 'L' else -M['sL']
        for modo, (u, v) in T_MANDIBULA.items():
            t = np.array([cx + sg * u * aj, 0.0, zb - v * H])
            out[id_punto('mandibula', modo, s)] = _elegir(P, piel_v, usados, t, [0, 2], 0.2 * H, lambda Q: Q[:, 1])
    c, b = np.array(M['menton']['c']), M['menton']['b']
    a = b * M['menton']['a_b']
    for modo, (du, dw) in T_MENTON.items():
        t = np.array([c[0] + du * a, 0.0, c[2] + dw * b])
        out[id_punto('menton', modo, '')] = _elegir(P, piel_v, usados, t, [0, 2], 0.25 * b, lambda Q: Q[:, 1])
    return out


def puntos(cara, zona, por_lado):
    """[(id, zona, modo, lado, texto, propiedad, posición_mundo)] de los puntos de una zona (posición con la forma actual)."""
    an = cara.get('rlb_forma_anclas')
    sk = cara.data.shape_keys
    if not an or sk is None:
        return []
    titulo, pares, modos = ZONAS[zona]
    lados = LADOS if pares else ('',)
    items = []
    for modo, texto, mas, menos in modos:
        for s in lados:
            i = id_punto(zona, modo, s)
            if i in an:
                items.append((i, zona, modo, s, f'{texto}: {menos} ↔ {mas}',
                              prop(zona, modo, s if (pares and por_lado) else ''), int(an[i])))
    kb = sk.key_blocks
    vs = [it[6] for it in items]
    P0 = np.array([kb[0].data[v].co for v in vs])
    P = P0.copy()
    for k in kb[1:]:
        if k.value and k.name.startswith(PREF + zona):
            P += (np.array([k.data[v].co for v in vs]) - P0) * k.value
    Mw = np.array(cara.matrix_world)
    W = P @ Mw[:3, :3].T + Mw[:3, 3]
    return [it[:6] + (Vector(w),) for it, w in zip(items, W)]


def puntos_locales(cara, por_lado):
    """[(id, 'oreja', 'p<h>', lado, texto, prefijo_prop, posición_mundo)] de los puntos de modelar a mano. El prefijo
    lleva el eje al final (prefijo.format(eje)): la propiedad «los dos lados» o la de ese lado."""
    try:
        loc = json.loads(cara.get('rlb_forma_locales', '{}'))
    except Exception:
        loc = {}
    sk = cara.data.shape_keys
    if not loc or sk is None:
        return []
    items = []
    for key, v in loc.items():
        h, s = key.split('|')
        h = int(h)
        pre = prop_local(h, '{}', s if por_lado else '')
        items.append((f'oreja|p{h}|{s}', 'oreja', f'p{h}', s, f'{N_LOCAL[A_LOCAL[h]]} ({"izq." if s == "L" else "der."})',
                      pre, int(v)))
    kb = sk.key_blocks
    vs = [it[6] for it in items]
    P0 = np.array([kb[0].data[v].co for v in vs])
    P = P0.copy()
    for k in kb[1:]:
        if k.value and k.name.startswith(PREF + 'oreja'):
            P += (np.array([k.data[v].co for v in vs]) - P0) * k.value
    Mw = np.array(cara.matrix_world)
    W = P @ Mw[:3, :3].T + Mw[:3, 3]
    return [it[:6] + (Vector(w),) for it, w in zip(items, W)]


def ejes_mundo_local(cara, lado):
    """{eje: vector del MUNDO que recorre la key de ese eje a 100 %} (para pasar un arrastre del ratón a %)."""
    M = marco(cara)
    E, u = _ejes_locales(M, lado), unidad_local(M, lado)
    R = cara.matrix_world.to_3x3()
    return {e: R @ Vector(tuple(map(float, E[e] * u))) for e in EJES_LOCAL}


def reiniciar_locales(cara):
    for pr in props_locales():
        if pr in cara.keys():
            cara[pr] = 0.0
    evaluar(cara)


def preparar(cara, forzar=False):
    """mide la cara, pone los puntos fm_* y crea las keys. Se puede repetir (respeta los puntos movidos)."""
    if cara.type != 'MESH':
        raise ValueError('Elige la malla de la cara')
    if cara.mode != 'OBJECT':
        raise ValueError('Pasa la cara a modo Objeto')
    M = medir(cara, forzar=forzar)
    keys = crear_keys(cara, _marco_vivo(cara))
    return {'keys': len(keys), 'piel': M['piel'], 'ipd_mm': round(M['ipd'] * 1000, 1), 'avisos': M['avisos']}


def actualizar(cara):
    """rehace las keys con la posición actual de los puntos fm_* (tras moverlos); los deslizadores se conservan."""
    M = _marco_vivo(cara)
    keys = crear_keys(cara, M)
    return {'keys': len(keys)}


def preparada(cara):
    sk = cara.data.shape_keys
    if sk is None or marco(cara) is None:
        return False
    return all(n in sk.key_blocks for n in cara.get('rlb_forma_keys', [])) and bool(cara.get('rlb_forma_keys'))


# modos por defecto: valores (en %) de «los dos lados» para dejar una zona con un aspecto conocido
PRESETS = {
    'oreja': [('redondas', 'Orejas redondas (caricatura)',
               {'redondo': 100, 'tamano': 80, 'ancho': 50, 'separar': 80, 'lobulo': 15})],
    'mandibula': [('cuadrada', 'Mandíbula cuadrada', {'forma': 70, 'ancho': 25}),
                  ('redonda', 'Mandíbula redonda', {'redondo': 100, 'ancho': 15})],
    'menton': [('cuadrado', 'Mentón cuadrado', {'forma': 70, 'punta': -30}),
               ('redondo', 'Mentón redondo', {'redondo': 100, 'punta': -20})],
}


def aplicar_preset(cara, zona, nombre):
    """pone los deslizadores «los dos lados» de la zona según el preset (el resto de la zona vuelve a 0)."""
    for n, _, valores in PRESETS[zona]:
        if n != nombre:
            continue
        reiniciar(cara, zona, a_mano=False)
        for modo, v in valores.items():
            cara[prop(zona, modo)] = float(v)
        evaluar(cara)
        return valores
    raise KeyError(f'preset {nombre} no existe en {zona}')


def reiniciar(cara, zona=None, a_mano=True):
    """deslizadores a 0; con a_mano=False se respetan los puntos de modelar a mano de las orejas."""
    if a_mano and zona in (None, 'oreja'):
        for pr in props_locales():
            if pr in cara.keys():
                cara[pr] = 0.0
    for z, (_, pares, modos) in ZONAS.items():
        if zona and z != zona:
            continue
        for modo, *_ in modos:
            for pr in ([prop(z, modo)] + ([prop(z, modo, 'L'), prop(z, modo, 'R')] if pares else [])):
                if pr in cara.keys():
                    cara[pr] = 0.0
    evaluar(cara)


def puntos_visibles(cara, ver=None):
    out = []
    for k in ('fm_menton', 'fm_oreja.L', 'fm_oreja.R'):
        e = _marca(cara, k)
        if e is not None:
            if ver is not None:
                e.hide_viewport = not ver
                e.hide_set(not ver)
            out.append(not e.hide_get())
    return all(out) if out else False


def fijar(cara):
    """hornea la forma actual en la malla (Basis y todas las keys) y quita las keys fm_*, sus drivers y deslizadores.
    No cambia la topología. Hazlo antes de exportar al GLB (si no, cada key fm_* saldría como morph)."""
    sk = cara.data.shape_keys
    if sk is None:
        return {'fijado': 0}
    n = len(cara.data.vertices)
    base = util.coords(cara.data)
    tot = np.zeros_like(base)
    nombres = list(cara.get('rlb_forma_keys', []))
    for nm in nombres:
        k = sk.key_blocks.get(nm)
        if k is None:
            continue
        co = np.zeros(n * 3)
        k.data.foreach_get('co', co)
        tot += (co.reshape(-1, 3) - base) * k.value
    for k in sk.key_blocks:
        if k.name in nombres:
            continue
        co = np.zeros(n * 3)
        k.data.foreach_get('co', co)
        k.data.foreach_set('co', (co.reshape(-1, 3) + tot).ravel())
    if sk.animation_data:
        for f in list(sk.animation_data.drivers):
            if any(f.data_path == f'key_blocks["{nm}"].value' for nm in nombres):
                sk.animation_data.drivers.remove(f)
    for nm in nombres:
        k = sk.key_blocks.get(nm)
        if k is not None:
            cara.shape_key_remove(k)
    cara.data.vertices.foreach_set('co', (base + tot).ravel())
    cara.data.update()
    for pr in todas_las_props():
        if pr in cara.keys():
            del cara[pr]
    for pr in ('rlb_forma_keys', CFG, 'rlb_forma_locales'):
        if pr in cara.keys():
            del cara[pr]
    a = cara.data.attributes.get(ATTR)
    if a is not None:
        cara.data.attributes.remove(a)
    return {'fijado': len(nombres), 'desplazamiento_max_mm': round(float(np.abs(tot).max()) * 1000, 2)}


# ------------------------------------------------------------------ hoja de comparación (para mirar de cerca)
def _vistas_zona(cara, M, zona):
    """[(nombre, centro_local, ojo_de_buey_escala, dirección)] — dirección: 'frente', 'L' o 'R' (desde fuera)."""
    cx = M['cx']
    if zona == 'oreja':
        out = []
        for s in LADOS:
            o = M['orejas'][s]
            out.append((f'oreja_{s}', np.array(o['c']), 5.0 * o['b'], s))
        return out
    if zona == 'menton':
        c = np.array(M['menton']['c'])
        b = M['menton']['b']
        return [('frente', np.array([cx, c[1], c[2]]), 7.0 * b, 'frente'), ('perfil', c, 7.0 * b, 'L')]
    zc = (M['z_chin'] + M['z_boca']) / 2
    c = np.array([cx, M['y_chin'], zc])
    return [('frente', c, 3.4 * M['aj'], 'frente'), ('perfil', c + np.array([0, 0.5 * M['aj'], 0]), 3.4 * M['aj'], 'L')]


def foto_forma(cara, zona, modo, valores=(-100, 0, 100), carpeta=None):
    """hoja PNG: una fila por vista y una columna por valor del deslizador «los dos lados». Deja todo como estaba."""
    import os
    from . import revision
    M = _marco_vivo(cara)
    pr = prop(zona, modo)
    antes = cara.get(pr, 0.0)
    carpeta = carpeta or util.carpeta_revision(cara)
    os.makedirs(carpeta, exist_ok=True)
    vistas = _vistas_zona(cara, M, zona)
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('rlb_cam')
    cam_d.type = 'ORTHO'
    cam_d.clip_start, cam_d.clip_end = 0.001, 1000
    cam = bpy.data.objects.new('rlb_cam', cam_d)
    sc.collection.objects.link(cam)
    r, sh = sc.render, sc.display.shading
    keep = (sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath)
    keep_sh = (sh.light, sh.color_type, sh.show_object_outline)
    files = []
    q = cara.matrix_world.to_quaternion()
    try:
        sc.camera = cam
        r.resolution_x = r.resolution_y = 420
        r.resolution_percentage = 100
        r.engine = 'BLENDER_WORKBENCH'
        sh.light = 'STUDIO'
        sh.color_type = 'MATERIAL'
        sh.show_object_outline = False
        for nom, c, esc_, d in vistas:
            for v in valores:
                cara[pr] = float(v)
                evaluar(cara)
                w = cara.matrix_world @ Vector(tuple(map(float, c)))
                sg = {'frente': 0.0, 'L': M['sL'], 'R': -M['sL']}[d]
                if d == 'frente':
                    cam.location = w + q @ Vector((0, -1, 0))
                    cam.rotation_euler = (math.radians(90), 0, 0)
                else:
                    cam.location = w + q @ Vector((sg, 0, 0))
                    cam.rotation_euler = (math.radians(90), 0, math.radians(90 * sg))
                cam_d.ortho_scale = float(esc_)
                r.filepath = os.path.join(carpeta, f'forma_{zona}_{modo}_{nom}_{int(v)}.png')
                bpy.ops.render.render(write_still=True)
                files.append(r.filepath)
    finally:
        cara[pr] = antes
        evaluar(cara)
        sc.camera, r.resolution_x, r.resolution_y, r.resolution_percentage, r.engine, r.filepath = keep
        sh.light, sh.color_type, sh.show_object_outline = keep_sh
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cam_d)
    dest = os.path.join(carpeta, f'hoja_forma_{zona}_{modo}.png')
    revision._hoja(files, dest, len(valores), 1)
    return dest
