# Biblioteca de expresiones de referencia (Serena + ARKit de Business girl) -> gestos del rig.
# biblioteca/expresiones_ref.json guarda, por expresión, el desplazamiento de 23 puntos faciales normalizado
# (boca / media anchura de boca, resto / media distancia entre ojos). Aquí:
#   1. se buscan esos puntos en la cara del personaje (marcadores RLB + disposición de Serena escalada);
#   2. se mide el jacobiano: cuánto mueve cada canal de control a cada punto (malla evaluada);
#   3. se resuelve por mínimos cuadrados con regularización -> pose de controles, con amplitud de caricatura.
# El resultado tiene el formato de gestos.GESTOS (metros de Vale) y se pasa a gestos.crear.
import bpy, json, os
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from . import util, marco as MK, gestos

RUTA = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'biblioteca', 'expresiones_ref.json')
BOCA = ('comisura', 'labio', 'menton')
# canales: (hueso, tipo, eje) ; tipo 'loc_w' = mundo, 'loc' = local
CANALES = [(f'comisura.{s}', 'loc_w', i) for s in 'LR' for i in range(3)] + [('mandibula_ctrl', 'loc_w', i) for i in (1, 2)] +     [(n, 'loc_w', i) for n in ('labio_sup', 'labio_inf') for i in (1, 2)] + \
    [(f'{n}.{s}', 'loc', 1) for n in ('lev_labio', 'baj_labio', 'mejilla', 'parpado', 'parpado_inf', 'ceja_in', 'ceja_out')
     for s in 'LR'] + [(f'ceja_in.{s}', 'loc', 0) for s in 'LR']
PESO_Y = 0.35       # la profundidad apenas se ve de frente y cada cara tiene otra pendiente de frente/mejilla
PASO = 0.002        # metros de prueba para el jacobiano
PESO = {'parpado_sup': 0.5, 'parpado_inf': 0.5}   # el cierre de párpados es de otro módulo: poco peso
DEFECTO = ('alegria', 'tristeza', 'rabia', 'sorpresa', 'miedo', 'asco', 'desprecio', 'duda', 'sonrisa_torcida',
           'sonrisa_picara', 'sonrisa_de_lado', 'vis_A', 'vis_E', 'vis_O', 'vis_U', 'vis_MBP', 'vis_FV', 'vis_TH_D', 'vis_R')


def cargar(ruta=RUTA):
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def _mw(o): return o.matrix_world


def _unidades(M):
    c = {}
    for k in MK.MARCAS:
        o = bpy.data.objects.get(MK.nombre_marca(M.cara, k))
        if o is not None: c[k] = _mw(o).translation.copy()
    hw = (c['comisura.L'] - c['comisura.R']).length / 2
    he = (c['ojo.L'] - c['ojo.R']).length / 2 if 'ojo.L' in c and 'ojo.R' in c else hw * 1.6
    return c, hw, he


def puntos(cara, M, lib):
    """índice de vértice de cada punto en la cara: disposición de reposo de Serena escalada a los marcadores."""
    c, hw, he = _unidades(M)
    ref = lib['_reposo_serena']
    sb, se = lib['fuentes']['serena']['media_boca_m'], lib['fuentes']['serena']['media_ojos_m']
    mc_s = (Vector(ref['comisura.L']) + Vector(ref['comisura.R'])) / 2
    mc = (c['comisura.L'] + c['comisura.R']) / 2
    oj_s = (Vector(lib['_ojos_serena'][0]) + Vector(lib['_ojos_serena'][1])) / 2
    oj = (c['ojo.L'] + c['ojo.R']) / 2 if 'ojo.L' in c else mc + Vector((0, 0, 2.2 * hw))
    pred = {k: (mc + (Vector(v) - mc_s) * (hw / sb)) if k.startswith(BOCA) else (oj + (Vector(v) - oj_s) * (he / se))
            for k, v in ref.items()}
    for k in ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf', 'menton'):
        if k in c: pred[k] = c[k]
    P = [_mw(cara) @ v.co for v in cara.data.vertices]
    kd = KDTree(len(P))
    for i, p in enumerate(P):
        kd.insert(p, i)
    kd.balance()
    idx = {k: kd.find(p)[1] for k, p in pred.items()}
    rig = bpy.data.objects.get(M.n['rig'])
    if rig is not None:
        with sin_nodos(cara):
            _anclar(cara, rig, pred, idx, kd, he)
    return idx, hw, he


# puntos de la mitad superior que se buscan por respuesta: el vértice cercano que más mueve su control
# (cejas, mejilla y párpados de un personaje estilizado no caen donde la disposición de Serena los predice)
ANCLA = {'ceja_in': ('ceja_in', 1), 'ceja_mid': ('ceja_in', 1), 'ceja_out': ('ceja_out', 1),
         'mejilla': ('mejilla', 1), 'parpado_inf': ('parpado_inf', 1), 'parpado_sup': ('parpado', -1)}


def _desp_total(cara, rig, hueso, v):
    def todo():
        for _ in range(2):
            bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get(); dg.update()
        e = cara.evaluated_get(dg); me = e.to_mesh()
        a = np.array([tuple(x.co) for x in me.vertices]); e.to_mesh_clear(); return a
    util.pose_reposo(rig); a = todo()
    rig.pose.bones[hueso].location[1] = v; b = todo()
    util.pose_reposo(rig)
    return np.linalg.norm(b - a, axis=1)


def _anclar(cara, rig, pred, idx, kd, he):
    cache = {}
    for k, p in pred.items():
        base, sd = k.split('.')[0], k.split('.')[-1]
        if base not in ANCLA or '.' not in k: continue
        h = f'{ANCLA[base][0]}.{sd}'
        if h not in rig.pose.bones: continue
        if h not in cache: cache[h] = _desp_total(cara, rig, h, ANCLA[base][1] * PASO)
        d = cache[h]
        cerca = kd.find_range(p, 0.6 * he)
        if not cerca or d.max() < 1e-6: continue
        # máximo de respuesta, con preferencia por lo cercano a la predicción
        idx[k] = max(cerca, key=lambda c: d[c[1]] * (1 - 0.5 * c[2] / (0.6 * he)))[1]


class sin_nodos:
    """apaga en viewport los modificadores que cambian el nº de vértices (nodos, máscara, subdivisión): así los
    índices de la malla evaluada son los de la original."""
    TIPOS = ('NODES', 'MASK', 'SUBSURF', 'MULTIRES', 'DECIMATE', 'WELD', 'TRIANGULATE')

    def __init__(self, cara): self.cara, self.off = cara, []

    def __enter__(self):
        for m in self.cara.modifiers:
            if m.type in self.TIPOS and m.show_viewport:
                m.show_viewport = False; self.off.append(m.name)
        return self

    def __exit__(self, *a):
        for n in self.off: self.cara.modifiers[n].show_viewport = True


def _eval(cara, idx):
    for _ in range(2):          # dos pasadas: los drivers de las shape keys leen la pose de la pasada anterior
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    e = cara.evaluated_get(dg); me = e.to_mesh()
    out = {k: _mw(cara) @ me.vertices[i].co for k, i in idx.items()}
    e.to_mesh_clear()
    return out


def _poner(rig, canal, v):
    n, t, i = canal
    pb = rig.pose.bones[n]
    d = Vector((0, 0, 0)); d[i] = v
    if t == 'loc_w': pb.location = pb.location + pb.bone.matrix_local.to_3x3().inverted() @ d
    else: pb.location[i] += v


def jacobiano(rig, cara, idx):
    """una columna por canal y sentido (+ y -): muchos controles tienen límites y solo responden hacia un lado."""
    canales = [(c, sg) for c in CANALES if c[0] in rig.pose.bones for sg in (1, -1)]
    util.pose_reposo(rig)
    base = _eval(cara, idx)
    claves = list(idx)
    J = np.zeros((3 * len(claves), len(canales)))
    for j, (c, sg) in enumerate(canales):
        util.pose_reposo(rig); _poner(rig, c, sg * PASO)
        p = _eval(cara, idx)
        J[:, j] = np.concatenate([np.array(p[k] - base[k]) for k in claves]) / PASO
    util.pose_reposo(rig)
    return canales, claves, J


def nnls(A, b, it=300):
    """mínimos cuadrados con x >= 0 (Lawson-Hanson, solo numpy)."""
    n = A.shape[1]; x = np.zeros(n); P = np.zeros(n, bool)
    w = A.T @ (b - A @ x)
    for _ in range(it):
        if P.all() or w[~P].max(initial=0) <= 1e-10: break
        j = np.argmax(np.where(P, -np.inf, w)); P[j] = True
        while True:
            z = np.zeros(n); z[P] = np.linalg.lstsq(A[:, P], b, rcond=None)[0]
            if (z[P] > 0).all(): x = z; break
            m = P & (z <= 0)
            a = np.min(x[m] / (x[m] - z[m]))
            x = x + a * (z - x); P &= x > 1e-12
        w = A.T @ (b - A @ x)
    return x


REG = (('parpado', 8.0), ('labio_sup', 10.0), ('labio_inf', 10.0), ('baj_labio', 3.0), ('lev_labio', 3.0))


def resolver(expr, canales, claves, J, hw, he, amplitud=1.0, lam=0.02):
    d, w = [], []
    for k in claves:
        v = expr['puntos'].get(k, (0, 0, 0))
        u = hw if k.startswith(BOCA) else he
        d.extend(c * u * amplitud for c in v)
        pk = PESO.get(k.split('.')[0], 1.0)
        w.extend([pk, pk * PESO_Y, pk])
    W = np.array(w)
    # párpados y centro de los labios: lo último (si no, el ajuste los usa de parche: labio doblado, ojo cerrado)
    reg = np.array([lam * next((f for p, f in REG if c[0].startswith(p)), 1.0) for c, sg in canales])
    A = np.vstack([J * W[:, None], np.diag(np.sqrt(reg))])
    b = np.concatenate([np.array(d) * W, np.zeros(len(canales))])
    # un canal no puede ir a la vez hacia + y hacia -: en el modelo lineal se compensan, pero las correctivas
    # (sonrisa.*) y los límites solo responden a un lado. Se quita el sentido más débil y se vuelve a resolver.
    activo = np.ones(len(canales), bool)
    for _ in range(len(canales)):
        x = np.zeros(len(canales)); x[activo] = nnls(A[:, activo], b)
        pares = {}
        for j, (c, sg) in enumerate(canales):
            if x[j] > 1e-7: pares.setdefault(c, []).append(j)
        dobles = [js for js in pares.values() if len(js) > 1]
        if not dobles: break
        for js in dobles: activo[min(js, key=lambda j: x[j])] = False
    err = float(np.sqrt(np.mean((J @ x - np.array(d)) ** 2)) / max(1e-9, np.sqrt(np.mean(np.array(d) ** 2))))
    return x, err


def espejo(n): return n[:-2] + {'.L': '.R', '.R': '.L'}[n[-2:]] if n[-2:] in ('.L', '.R') else n


def expr_espejo(e):
    return {'puntos': {espejo(k): (-v[0], v[1], v[2]) for k, v in e['puntos'].items()}}


def _limites(rig):
    """límites de LIMIT_LOCATION (espacio local) por hueso: {nombre: [(min,max)]*3}."""
    L = {}
    for pb in rig.pose.bones:
        for c in pb.constraints:
            if c.type == 'LIMIT_LOCATION' and c.owner_space == 'LOCAL':
                L[pb.name] = [(c.min_x if c.use_min_x else -1, c.max_x if c.use_max_x else 1),
                              (c.min_y if c.use_min_y else -1, c.max_y if c.use_max_y else 1),
                              (c.min_z if c.use_min_z else -1, c.max_z if c.use_max_z else 1)]
    return L


def resolver_simetrico(expr, canales, claves, J, hw, he, amplitud=1.0):
    """se resuelve solo la mitad L (+ centro) y se refleja: la referencia es casi simétrica pero el rig y los
    puntos de cada lado no lo son, y el ajuste completo sale torcido. Las expresiones asimétricas también salen
    bien: el lado R es la mitad L de la expresión reflejada. Devuelve {(hueso, tipo, eje): valor en metros}."""
    ci = [j for j, (c, sg) in enumerate(canales) if not c[0].endswith('.R')]
    ki = [i for i, k in enumerate(claves) if not k.endswith('.R')]
    filas = [3 * i + a for i in ki for a in range(3)]
    Jh = J[np.ix_(filas, ci)]; ch = [canales[j] for j in ci]; kh = [claves[i] for i in ki]
    val, errs = {}, []
    for lado, e in (('L', expr), ('R', expr_espejo(expr))):
        x, err = resolver(e, ch, kh, Jh, hw, he, amplitud); errs.append(err)
        for ((n, t, i), sg), v in zip(ch, x):
            v = sg * float(v)
            if lado == 'R':
                if not n.endswith('.L'): v *= 0.5          # centro: media de las dos mitades
                n = espejo(n)
                if i == 0: v = -v                          # eje X reflejado (loc_w y loc de ceja_in)
            elif not n.endswith('.L'): v *= 0.5
            val[(n, t, i)] = val.get((n, t, i), 0.0) + v
    return val, float(np.mean(errs))


def a_pose(val, s_b, s_o, rig=None):
    """{(hueso, tipo, eje): metros del personaje} -> pose en formato gestos (metros de Vale), con los límites."""
    lim = _limites(rig) if rig is not None else {}
    pose = {}
    for (n, t, i), v in val.items():
        if t == 'loc' and n in lim:
            lo, hi = lim[n][i]; v = min(max(v, lo), hi)
        k = s_o if n.startswith(gestos.OJO) else s_b
        e = pose.setdefault(n, {}).setdefault(t, [0.0, 0.0, 0.0])
        e[i] += v / k
    return {n: {t: tuple(v) for t, v in d.items()} for n, d in pose.items()}


# --- sonrisa amplia: en caras con pesos de comisura estrechos, subir la comisura solo pellizca la esquina
# (pliegue y boca en V). Correctiva sonrisa.<lado> con caída suave alrededor de la comisura (el labio se curva
# hacia arriba hacia la esquina, la mejilla acompaña), conducida por la subida de la comisura. Con ella el
# ajuste usa menos hueso y el pliegue se reduce.
SONRISA = {'alto': 0.6, 'radio': 1.5, 'ganancia': 2.0}   # alto y radio en medias anchuras de boca


def sonrisa_amplia(cara, rig, M, alto=None, radio=None, ganancia=None):
    alto = alto or SONRISA['alto']; radio = radio or SONRISA['radio']; ganancia = ganancia or SONRISA['ganancia']
    if cara.data.shape_keys is None: cara.shape_key_add(name='Basis')
    kb = cara.data.shape_keys.key_blocks
    base = np.empty(len(cara.data.vertices) * 3); kb[0].data.foreach_get('co', base); base = base.reshape(-1, 3)
    mw = np.array(_mw(cara)); Pw = base @ mw[:3, :3].T + mw[:3, 3]
    c = {}
    for k in ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf'):
        o = bpy.data.objects.get(MK.nombre_marca(cara, k))
        if o is not None: c[k] = np.array(o.matrix_world.translation)
    cx = (c['comisura.L'][0] + c['comisura.R'][0]) / 2
    hw = abs(c['comisura.L'][0] - c['comisura.R'][0]) / 2
    inv = np.linalg.inv(mw[:3, :3])
    hechos = []
    for s, sx in (('L', 1), ('R', -1)):
        cc = c['comisura.' + s]
        r = np.linalg.norm((Pw - cc) * np.array([1.0, 0.6, 1.0]), axis=1) / (radio * hw)
        w = np.clip(1 - r, 0, 1); w = w * w * (3 - 2 * w)                       # caída suave
        lado = np.clip(sx * (Pw[:, 0] - cx) / hw, 0, 1) ** 0.8                   # el centro de la boca no sube
        w *= lado
        dirw = np.array([sx * 0.35, 0.25, 1.0]); dirw /= np.linalg.norm(dirw)    # arriba, afuera y un poco atrás
        d = (w[:, None] * dirw * alto * hw) @ inv.T
        n = 'sonrisa.' + s
        k = kb.get(n) or cara.shape_key_add(name=n, from_mix=False)
        k.data.foreach_set('co', (base + d).ravel()); k.value = 0.0
        # driver: subida de la comisura en el eje local que apunta hacia arriba en el mundo
        pb = rig.pose.bones['comisura.' + s]
        up = pb.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
        ax = max(range(3), key=lambda i: abs(up[i])); sg = 1 if up[ax] > 0 else -1
        z1 = alto * hw / ganancia
        k.driver_remove('value')
        fc = k.driver_add('value'); dr = fc.driver; dr.type = 'SCRIPTED'
        v = dr.variables.new(); v.name = 'z'; v.type = 'TRANSFORMS'
        t = v.targets[0]; t.id = rig; t.bone_target = pb.name; t.transform_type = 'LOC_' + 'XYZ'[ax]
        t.transform_space = 'LOCAL_SPACE'
        dr.expression = f'clamp({sg}*z/{z1:.6g},0,1)'
        hechos.append(n)
    cara.data.update()
    return {'correctivas': hechos, 'max_vertices': int((w > 0).sum())}


def retarget(cara, nombres=DEFECTO, amplitud=1.0, crear=True, sonrisa=True):
    """poses ref_<nombre> a partir de la biblioteca; si crear, hace las acciones <rig>_Gesto_ref_<nombre>
    (con gestos.crear, junto a los gestos propios). amplitud > 1 exagera para caricatura."""
    M = MK.Marco(cara)
    rig = bpy.data.objects[M.n['rig']]
    lib = cargar()
    ad = rig.animation_data or rig.animation_data_create()
    prev, prev_slot = ad.action, ad.action_slot
    ad.action = None
    try:
        if sonrisa: sonrisa_amplia(cara, rig, M)
        idx, hw, he = puntos(cara, M, lib)
        with sin_nodos(cara):
            canales, claves, J = jacobiano(rig, cara, idx)
    finally:
        ad.action = prev
        if prev is not None and prev_slot is not None: ad.action_slot = prev_slot
    s_b, s_o = M.s, M.se()
    G, errores = {}, {}
    for n in nombres:
        e = lib['expresiones'].get(n)
        if e is None: continue
        val, err = resolver_simetrico(e, canales, claves, J, hw, he, amplitud)
        G['ref_' + n] = a_pose(val, s_b, s_o, rig); errores[n] = round(err, 2)
    if crear:
        gestos.crear(rig, M, {**gestos.cargar_gestos(cfg=M.cfg), **G})
    return {'gestos': list(G), 'canales': len(canales), 'puntos': len(claves), 'error_relativo': errores}


# --- GLB / three.js: los Bendy Bones, los drivers y las restricciones no viajan en glTF. Cada gesto se hornea
# como shape key GLB_<gesto> (deformación completa del rig sobre la cara) -> morph target en three.js
# (mesh.morphTargetDictionary['GLB_alegria']). En Blender valen 0: no se suman al rig.
PREF_GLB = 'GLB_'


def _co_eval(cara):
    for _ in range(2):
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    e = cara.evaluated_get(dg); me = e.to_mesh()
    a = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', a); e.to_mesh_clear()
    return a.reshape(-1, 3)


def hornear(cara, nombres=None):
    """shape keys GLB_<gesto> desde las acciones <rig>_Gesto_<gesto> (todas si nombres es None)."""
    M = MK.Marco(cara)
    rig = bpy.data.objects[M.n['rig']]
    pre = f'{rig.name}_Gesto_'
    acts = [a for a in bpy.data.actions if a.name.startswith(pre)]
    if nombres: acts = [a for a in acts if a.name[len(pre):] in nombres]
    ad = rig.animation_data or rig.animation_data_create()
    prev, prev_slot = ad.action, ad.action_slot
    if cara.data.shape_keys is None: cara.shape_key_add(name='Basis')
    kb = cara.data.shape_keys.key_blocks
    base = np.empty(len(cara.data.vertices) * 3); kb[0].data.foreach_get('co', base); base = base.reshape(-1, 3)
    hechos = []
    with sin_nodos(cara):
        ad.action = None; util.pose_reposo(rig)
        r0 = _co_eval(cara)
        for a in acts:
            ad.action = a
            if a.slots and ad.action_slot is None: ad.action_slot = a.slots[0]
            bpy.context.scene.frame_set(1)
            d = _co_eval(cara) - r0
            n = PREF_GLB + a.name[len(pre):]
            k = kb.get(n) or cara.shape_key_add(name=n, from_mix=False)
            k.data.foreach_set('co', (base + d).ravel()); k.value = 0.0; k.slider_min = 0.0; k.slider_max = 1.0
            hechos.append(n)
        ad.action = prev
        if prev is not None and prev_slot is not None: ad.action_slot = prev_slot
    cara.data.update()
    return {'shape_keys': hechos}


def exportar_glb(cara, ruta):
    """GLB de la cara (con sus morph targets GLB_*) y sus piezas (ojos, dientes...). Sin rig: en three.js los
    gestos son morphs; los ojos se giran como objetos."""
    from . import pestanas_tripo as PT
    pest = PT.preparar_exportacion(cara)          # 0.7.2: las pestañas de Tripo borradas u ocultas no vuelven al GLB
    M = MK.Marco(cara)
    rig = bpy.data.objects.get(M.n['rig'])
    mods = [m for m in cara.modifiers if m.show_viewport and (m.type == 'ARMATURE' or m.type in sin_nodos.TIPOS)]
    for m in mods: m.show_viewport = False
    vis = {o: o.select_get() for o in bpy.context.view_layer.objects}
    try:
        for o in vis: o.select_set(False)
        cara.select_set(True)
        # piezas del personaje: hijos y objetos del complemento (<cara>_Globo, _Iris, _Dientes...) visibles
        for o in bpy.context.view_layer.objects:
            if o.type in ('MESH', 'EMPTY') and o.visible_get() and (o in cara.children_recursive or o.name.startswith(cara.name + '_')):
                o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=ruta, export_format='GLB', use_selection=True, export_apply=False,
                                  export_morph=True, export_morph_normal=False, export_skins=False,
                                  export_animations=False, export_yup=True)
    finally:
        for m in mods: m.show_viewport = True
        for o, s in vis.items(): o.select_set(s)
    return {'glb': ruta, 'pestanas_tripo': pest}
