# Perfil de rig (DISENO §3–4): traduce huesos semánticos (cadera, pecho, brazo.L...) a los huesos reales, encuentra el
# marco del cuerpo (F adelante, U arriba, L izquierda del personaje) y mide cómo se transmite la rotación entre huesos
# en el rig real. Lo último es lo que hace que el generador sirva en cualquier rig: en Rigify la cabeza NO sigue al
# pecho (head_follow = 0) y el cuello lo sigue a medias (neutral_follow 0.5); en Mixamo todo es jerarquía simple. En vez
# de suponerlo, se rota cada hueso 20° y se mira cuánto giran los demás (matriz T).
#
#   perfil.detectar(rig) -> dict          (tipo, mapa, dedos, marco, avisos; no toca nada)
#   perfil.asegurar(rig) -> dict          (detecta si hace falta, calibra la neutra y mide; lo guarda en rig.ecorp.perfil)
#   perfil.calibrar_neutra(rig, malla=None, separacion=None) -> dict
#   perfil.capturar_neutra(rig) -> dict
import bpy, math
from mathutils import Vector, Quaternion, kdtree
from . import util as U

VERSION = 2
CUERPO = ['cadera', 'columna', 'pecho', 'cuello', 'cabeza'] + \
         [f'{s}.{l}' for s in ('hombro', 'brazo', 'antebrazo', 'mano') for l in U.LADOS]
DEDOS = ('pulgar', 'indice', 'medio', 'anular', 'menique')

RIGIFY = {'cadera': 'torso', 'columna': 'spine_fk.001', 'pecho': 'chest', 'cuello': 'neck', 'cabeza': 'head'}
for _l in U.LADOS:
    RIGIFY.update({f'hombro.{_l}': f'shoulder.{_l}', f'brazo.{_l}': f'upper_arm_fk.{_l}',
                   f'antebrazo.{_l}': f'forearm_fk.{_l}', f'mano.{_l}': f'hand_fk.{_l}'})
# Rigify: el «master» de cada dedo gira el dedo entero sin doblarlo (lo medimos); el cierre va por las falanges FK.
RIGIFY_DEDOS = {'pulgar': 'thumb', 'indice': 'f_index', 'medio': 'f_middle', 'anular': 'f_ring', 'menique': 'f_pinky'}

MIXAMO = {'cadera': 'Hips', 'columna': 'Spine', 'pecho': 'Spine2', 'cuello': 'Neck', 'cabeza': 'Head'}
_MX_LADO = {'L': 'Left', 'R': 'Right'}
for _l, _n in _MX_LADO.items():
    MIXAMO.update({f'hombro.{_l}': f'{_n}Shoulder', f'brazo.{_l}': f'{_n}Arm', f'antebrazo.{_l}': f'{_n}ForeArm',
                   f'mano.{_l}': f'{_n}Hand'})
MIXAMO_DEDOS = {'pulgar': 'Thumb', 'indice': 'Index', 'medio': 'Middle', 'anular': 'Ring', 'menique': 'Pinky'}

# nombres genéricos (en minúsculas, sin lado) para rigs desconocidos
GENERICO = {
    'cadera': ('hips', 'pelvis', 'hip'), 'columna': ('spine', 'spine1', 'spine_01', 'spine01', 'abdomen'),
    'pecho': ('chest', 'spine2', 'upperchest', 'spine_02', 'spine02', 'spine_03', 'thorax'),
    'cuello': ('neck', 'neck1', 'neck_01'), 'cabeza': ('head',),
    'hombro': ('shoulder', 'clavicle', 'clav', 'collar'), 'brazo': ('upperarm', 'upper_arm', 'arm', 'uparm'),
    'antebrazo': ('forearm', 'lowerarm', 'lower_arm', 'elbow', 'loarm'), 'mano': ('hand', 'wrist'),
}


# ---------------------------------------------------------------- guardar / leer
def leer(rig):
    return U.leer_json(U.props(rig).perfil)


def guardar(rig, d):
    U.props(rig).perfil = U.escribir_json(d)
    return d


def huesos(perfil):
    """todos los huesos reales que mueve el sistema: cuerpo + intermedios + falanges."""
    out = list(perfil['mapa'].values()) + list(perfil.get('intermedios', {}))
    for lst in perfil.get('dedos', {}).values():
        out += lst
    return [h for h in dict.fromkeys(out)]


def semantico_de(perfil):
    """hueso real -> nombre semántico portable ('brazo.L', 'indice.L#2')."""
    inv = {h: s for s, h in perfil['mapa'].items()}
    for s, lst in perfil.get('dedos', {}).items():
        for i, h in enumerate(lst):
            inv[h] = f'{s}#{i + 1}'
    for h, (a, b, t) in perfil.get('intermedios', {}).items():
        inv[h] = f'{a}~{b}'
    return inv


def hueso_de(perfil, sem):
    if sem.startswith('#'):
        return sem[1:]
    if '#' in sem:
        s, i = sem.split('#')
        lst = perfil.get('dedos', {}).get(s, [])
        i = int(i) - 1
        return lst[i] if 0 <= i < len(lst) else None
    if '~' in sem:
        a, b = sem.split('~')
        return next((h for h, v in perfil.get('intermedios', {}).items() if v[0] == a and v[1] == b), None)
    return perfil['mapa'].get(sem)


# ---------------------------------------------------------------- detectar
def _lado_generico(nombre):
    n = nombre.lower()
    if n.endswith(('.l', '_l', '-l')) or n.startswith(('l_', 'l.', 'left')) or 'left' in n:
        return 'L'
    if n.endswith(('.r', '_r', '-r')) or n.startswith(('r_', 'r.', 'right')) or 'right' in n:
        return 'R'
    return None


def _limpio(nombre):
    n = nombre.lower().split(':')[-1]
    for t in ('left', 'right', '.l', '.r', '_l', '_r', '-l', '-r', 'l_', 'r_', 'def-', 'def_', 'mixamorig'):
        n = n.replace(t, '')
    return n.strip('._- ')


def _detectar_generico(rig, avisos):
    mapa = {}
    nombres = [b.name for b in rig.data.bones if not b.name.startswith(('MCH', 'ORG', 'WGT', 'VIS'))]
    for sem, cands in GENERICO.items():
        lados = (None,) if sem in ('cadera', 'columna', 'pecho', 'cuello', 'cabeza') else U.LADOS
        for lado in lados:
            elegido = None
            for c in cands:
                for n in nombres:
                    if _limpio(n) == c and (_lado_generico(n) == lado):
                        elegido = n; break
                if elegido:
                    break
            if elegido:
                mapa[sem if lado is None else f'{sem}.{lado}'] = elegido
    falta = [s for s in CUERPO if s not in mapa]
    if falta:
        avisos.append('rig genérico: faltan ' + ', '.join(falta) + ' (rellena la tabla del perfil)')
    return mapa


def _prefijo_mixamo(rig):
    for b in rig.data.bones:
        if b.name.endswith('Hips') and (b.name[:-4] + 'LeftArm') in rig.data.bones:
            return b.name[:-4]
    return None


def detectar(rig):
    """tipo de rig, mapa semántico -> hueso, falanges, marco del cuerpo y avisos. No cambia nada."""
    if not U.es_rig(rig):
        raise RuntimeError('Elige un objeto armadura')
    B = rig.data.bones
    avisos, intermedios, dedos = [], {}, {}
    pre = ''
    if all(h in B for h in ('torso', 'chest', 'upper_arm_fk.L', 'upper_arm_fk.R')):
        tipo = 'rigify'
        mapa = {s: h for s, h in RIGIFY.items() if h in B}
        for s, base in RIGIFY_DEDOS.items():
            for l in U.LADOS:
                lst = [f'{base}.0{i}.{l}' for i in (1, 2, 3) if f'{base}.0{i}.{l}' in B]
                if lst:
                    dedos[f'{s}.{l}'] = lst
    elif _prefijo_mixamo(rig) is not None:
        tipo = 'mixamo'
        pre = _prefijo_mixamo(rig)
        mapa = {s: pre + h for s, h in MIXAMO.items() if pre + h in B}
        if pre + 'Spine1' in B:
            intermedios[pre + 'Spine1'] = ['columna', 'pecho', 0.5]
        for s, base in MIXAMO_DEDOS.items():
            for l, n in _MX_LADO.items():
                lst = [f'{pre}{n}Hand{base}{i}' for i in (1, 2, 3) if f'{pre}{n}Hand{base}{i}' in B]
                if lst:
                    dedos[f'{s}.{l}'] = lst
    else:
        tipo = 'generico'
        mapa = _detectar_generico(rig, avisos)
    falta = [s for s in CUERPO if s not in mapa]
    if falta and tipo != 'generico':
        avisos.append('faltan huesos: ' + ', '.join(falta))
    marco = _marco(rig, mapa, avisos)
    d = {'version': VERSION, 'tipo': tipo, 'prefijo': pre, 'mapa': mapa, 'dedos': dedos, 'intermedios': intermedios,
         'marco': marco, 'avisos': avisos}
    d.update(_pose_reposo(rig, mapa, marco))
    if tipo == 'rigify':
        for l in U.LADOS:
            pb = rig.pose.bones.get(f'upper_arm_parent.{l}')
            if pb is not None and 'IK_FK' in pb.keys() and float(pb['IK_FK']) < 0.999:
                avisos.append(f'brazo {l} en IK (IK_FK = {float(pb["IK_FK"]):.2f}): se pone en FK (1.0)')
    return d


def _marco(rig, mapa, avisos):
    """F, U, L en espacio de la armadura, medidos con los huesos en reposo (L = U x F)."""
    B = rig.data.bones
    def cab(s):
        h = mapa.get(s)
        return B[h].head_local.copy() if h else None
    abajo = cab('cadera') or cab('columna')
    arriba = cab('cabeza') or cab('cuello')
    up = (arriba - abajo).normalized() if (abajo is not None and arriba is not None and (arriba - abajo).length > 1e-6) \
        else Vector((0, 0, 1))
    izq = None
    for par in (('brazo.L', 'brazo.R'), ('hombro.L', 'hombro.R'), ('mano.L', 'mano.R')):
        a, b = cab(par[0]), cab(par[1])
        if a is not None and b is not None and (a - b).length > 1e-6:
            izq = a - b; break
    if izq is None:
        avisos.append('sin brazos para el marco: se supone que mira a -Y')
        izq = Vector((1, 0, 0))
    up = _ajustar_eje(up)
    izq = (izq - up * izq.dot(up)).normalized()
    izq = _ajustar_eje(izq)
    izq = (izq - up * izq.dot(up)).normalized()
    adelante = izq.cross(up).normalized()      # F = L x U
    return {'F': list(adelante), 'U': list(up), 'L': list(izq)}


def _ajustar_eje(v, grados=20.0):
    """los personajes se modelan alineados con los ejes: si el eje medido está a menos de 'grados' de uno de la
    armadura, se toma ese (la cabeza de Rigify está 5° por delante de la cadera y no por eso mira al suelo)."""
    mejor = max((Vector(e) * s for e in ((1, 0, 0), (0, 1, 0), (0, 0, 1)) for s in (1, -1)), key=lambda e: e.dot(v))
    return mejor if math.degrees(mejor.angle(v)) < grados else v


def _pose_reposo(rig, mapa, marco):
    B = rig.data.bones
    up = Vector(marco['U'])
    angs = []
    for l in U.LADOS:
        h = mapa.get(f'brazo.{l}')
        if h:
            d = (B[h].tail_local - B[h].head_local).normalized()
            angs.append(math.degrees(d.angle(-up)))
    if not angs:
        return {'pose_reposo': 'desconocida', 'angulo_brazo_reposo': None}
    a = sum(angs) / len(angs)
    return {'pose_reposo': 'T' if a > 75 else ('A' if a > 25 else 'colgando'), 'angulo_brazo_reposo': round(a, 1)}


def editar_mapa(rig, semantico, hueso):
    """tabla editable para rigs genéricos: cambia (o quita con hueso='') un hueso semántico y vuelve a medir."""
    p = leer(rig) or detectar(rig)
    if hueso:
        if hueso not in rig.data.bones:
            raise RuntimeError(f'No existe el hueso {hueso}')
        p['mapa'][semantico] = hueso
    else:
        p['mapa'].pop(semantico, None)
    p['marco'] = _marco(rig, p['mapa'], p.setdefault('avisos', []))
    guardar(rig, p)
    return medir(rig, p)


# ---------------------------------------------------------------- pose neutra y medidas
def _fk_rigify(rig, p):
    if p.get('tipo') != 'rigify':
        return
    for l in U.LADOS:
        pb = rig.pose.bones.get(f'upper_arm_parent.{l}')
        if pb is not None and 'IK_FK' in pb.keys() and float(pb['IK_FK']) < 0.999:
            pb['IK_FK'] = 1.0


def _poner_neutra(rig, p):
    U.pose_identidad(rig)
    for h, v in p.get('neutra', {}).items():
        pb = rig.pose.bones.get(h)
        if pb is not None:
            U.poner_local(pb, Quaternion(v))
    bpy.context.view_layer.update()


def _eje_prueba(pb):
    d = (pb.tail - pb.head)
    d = d.normalized() if d.length > 1e-9 else Vector((0, 1, 0))
    e = Vector((1, 0, 0))
    if abs(d.dot(e)) > 0.8:
        e = Vector((0, 0, 1))
    return (e - d * d.dot(e)).normalized()


def medir(rig, p=None):
    """con la neutra puesta: orientación N (espacio armadura), cabeza/cola de cada hueso, transmisión T y largos."""
    p = p or leer(rig)
    hs = [h for h in huesos(p) if h in rig.pose.bones]
    PB = rig.pose.bones
    med = {'N': {}, 'pos': {}, 'cola': {}, 'T': {}}
    with U.sin_animacion(rig):
        _fk_rigify(rig, p)
        _poner_neutra(rig, p)
        base = {h: PB[h].matrix.to_quaternion() for h in hs}
        for h in hs:
            med['N'][h] = U.ql(base[h])
            med['pos'][h] = list(PB[h].head)
            med['cola'][h] = list(PB[h].tail)
        ang = 20.0
        for a in hs:
            pb = PB[a]
            q0 = U.local_quat(pb)
            W = U.rot(_eje_prueba(pb), ang)
            U.poner_local(pb, q0 @ U.conj(W, base[a]))
            bpy.context.view_layer.update()
            fila = {}
            for b in hs:
                if b == a:
                    continue
                d = PB[b].matrix.to_quaternion() @ base[b].inverted()
                if d.w < 0:
                    d.negate()
                r = math.degrees(d.angle) / ang
                if r > 0.03:
                    fila[b] = round(min(r, 1.0), 3)
            med['T'][a] = fila
            U.poner_local(pb, q0)
        bpy.context.view_layer.update()
    # orden topológico: un hueso va después de todos los que lo mueven
    entra = {h: {a for a in hs if h in med['T'].get(a, {})} for h in hs}
    orden, hecho = [], set()
    while len(orden) < len(hs):
        listos = [h for h in hs if h not in hecho and entra[h] <= hecho]
        if not listos:   # ciclo (no debería): por profundidad en la jerarquía
            listos = sorted((h for h in hs if h not in hecho), key=lambda h: len(rig.data.bones[h].parent_recursive))[:1]
        for h in listos:
            orden.append(h); hecho.add(h)
    med['orden'] = orden
    mp = p['mapa']
    pos = lambda s: Vector(med['pos'][mp[s]]) if s in mp and mp[s] in med['pos'] else None
    largos = {}
    for l in U.LADOS:
        a, b, c = pos(f'brazo.{l}'), pos(f'antebrazo.{l}'), pos(f'mano.{l}')
        if a is not None and b is not None and c is not None:
            largos[l] = [(b - a).length, (c - b).length]
    med['largo_brazo'] = largos
    zs = [Vector(rig.data.bones[h].head_local).dot(Vector(p['marco']['U'])) for h in rig.data.bones.keys()]
    tope = max(Vector(b.tail_local).dot(Vector(p['marco']['U'])) for b in rig.data.bones)
    med['altura'] = max(tope - min(zs), 1e-3)
    p['medidas'] = med
    p['version'] = VERSION
    guardar(rig, p)
    return p


def asegurar(rig, forzar=False):
    """el perfil completo (detectado, con neutra calibrada y medido); lo guarda en el rig."""
    p = leer(rig)
    if forzar or not p or p.get('version') != VERSION or 'mapa' not in p:
        neutra = p.get('neutra') if p and not forzar else None
        p = detectar(rig)
        guardar(rig, p)
        if neutra:
            p['neutra'] = neutra
            guardar(rig, p)
        else:
            calibrar_neutra(rig)
            p = leer(rig)
    _fk_rigify(rig, p)
    if 'medidas' not in p:
        p = medir(rig, p)
    return p


def _deform_movidos(rig, hueso):
    """huesos de deformación que se mueven al girar 'hueso' (para separar brazo y cuerpo en la malla)."""
    PB = rig.pose.bones
    defs = [b.name for b in rig.data.bones if b.use_deform]
    antes = {n: PB[n].matrix.copy() for n in defs}
    pb = PB[hueso]
    q0 = U.local_quat(pb)
    U.poner_local(pb, q0 @ Quaternion((1, 0, 0), math.radians(30)))
    bpy.context.view_layer.update()
    out = {n for n in defs if (PB[n].matrix.to_quaternion().rotation_difference(antes[n].to_quaternion())).angle > 1e-3}
    U.poner_local(pb, q0)
    bpy.context.view_layer.update()
    return out


def _brazos_neutra(rig, p, alfa, codo=8.0, relax=1.0):
    """rotaciones locales de la neutra: brazo colgando separado 'alfa' grados, codo 'codo' grados adelante, dedos
    relajados. Se calcula desde la pose de reposo evaluada (identidad), sea A, T o colgando."""
    PB = rig.pose.bones
    F, Uv, L = (Vector(p['marco'][k]) for k in 'FUL')
    mp = p['mapa']
    neutra = {}
    for l in U.LADOS:
        s = U.SIGNO[l]
        hb, ha, hm = mp.get(f'brazo.{l}'), mp.get(f'antebrazo.{l}'), mp.get(f'mano.{l}')
        if not (hb and ha):
            continue
        b, a = PB[hb], PB[ha]
        du0 = (b.tail - b.head).normalized()
        df0 = (a.tail - a.head).normalized()
        Nu0, Nf0 = b.matrix.to_quaternion(), a.matrix.to_quaternion()
        out = L * s
        dt = (-Uv * math.cos(math.radians(alfa)) + out * math.sin(math.radians(alfa))).normalized()
        Wu = U.entre(du0, dt)
        neutra[hb] = U.ql(U.conj(Wu, Nu0))
        dft = U.rot(dt.cross(F), codo) @ dt
        Wf = U.entre(Wu @ df0, dft)
        neutra[ha] = U.ql(U.conj(Wf, Wu @ Nf0))
        W = Wf @ Wu
        # dedos relajados, curvados hacia la palma
        if hm:
            n_p = _palma(rig, p, l, rest=True)
            if n_p is not None:
                n_p = W @ n_p
                for i_d, dedo in enumerate(DEDOS):
                    lst = p.get('dedos', {}).get(f'{dedo}.{l}', [])
                    if not lst:
                        continue
                    k = (0.6, 0.85, 1.0, 1.1, 1.25)[i_d] * relax
                    angs = (6, 8, 6) if dedo == 'pulgar' else (10, 13, 9)
                    d1 = W @ (PB[lst[0]].tail - PB[lst[0]].head).normalized()
                    eje = d1.cross(n_p)
                    for h, ang in zip(lst, angs):
                        Nh = W @ PB[h].matrix.to_quaternion()
                        neutra[h] = U.ql(U.conj(U.rot(eje, ang * k), Nh))
    return neutra


def _palma(rig, p, lado, rest=False, med=None):
    """normal de la palma (sale por la palma) con la regla de la mano: índice delante del meñique."""
    s = U.SIGNO[lado]
    d = p.get('dedos', {})
    hm = p['mapa'].get(f'mano.{lado}')
    i, m = d.get(f'indice.{lado}'), d.get(f'menique.{lado}') or d.get(f'anular.{lado}')
    if not (hm and i and m):
        return None
    if med is not None:
        w, a, b = Vector(med['pos'][hm]), Vector(med['pos'][i[0]]), Vector(med['pos'][m[0]])
    else:
        PB = rig.pose.bones
        w, a, b = PB[hm].head, PB[i[0]].head, PB[m[0]].head
    n = (a - w).cross(b - w)
    if n.length < 1e-9:
        return None
    return (-s * n).normalized()


def _malla_distancia(rig, malla, brazo_def, mano_def, altura):
    """distancia mínima entre antebrazo/mano y el resto del cuerpo en la malla deformada (espacio armadura)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = malla.evaluated_get(dg)
    me = ev.to_mesh()
    try:
        M = rig.matrix_world.inverted() @ malla.matrix_world
        idx = {g.index: g.name for g in malla.vertex_groups}
        cuerpo, mano = [], []
        orig = malla.data.vertices
        for v in me.vertices:
            pesos_b = pesos_m = total = 0.0
            if v.index < len(orig):
                for g in orig[v.index].groups:
                    n = idx.get(g.group)
                    total += g.weight
                    if n in brazo_def:
                        pesos_b += g.weight
                    if n in mano_def:
                        pesos_m += g.weight
            co = M @ v.co
            if total > 0 and pesos_m / total > 0.5:
                mano.append(co)
            elif total == 0 or pesos_b / total < 0.3:
                cuerpo.append(co)
    finally:
        ev.to_mesh_clear()
    if not cuerpo or not mano:
        return None
    kd = kdtree.KDTree(len(cuerpo))
    for i, c in enumerate(cuerpo):
        kd.insert(c, i)
    kd.balance()
    return min(kd.find(c)[2] for c in mano)


def calibrar_neutra(rig, malla=None, separacion=None, codo=8.0):
    """pose neutra automática (DISENO §4): brazos colgando sin atravesar la cadera, codo ~8° adelante, dedos
    relajados. Con la malla se mide la distancia mano/cuerpo y se abre el brazo de 2 en 2 grados hasta dejar margen."""
    p = leer(rig)
    if not p or 'mapa' not in p:
        p = detectar(rig)
    p.pop('medidas', None)
    info = {'separacion': None, 'codo': codo, 'medido_con_malla': False, 'distancia_mano_cuerpo': None}
    if malla is None:
        cands = [m for m in U.mallas_del_rig(rig) if m.vertex_groups]
        malla = max(cands, key=lambda m: len(m.data.vertices)) if cands else None
    with U.sin_animacion(rig):
        _fk_rigify(rig, p)
        U.pose_identidad(rig)
        bpy.context.view_layer.update()
        altura = max(b.tail_local.z for b in rig.data.bones) - min(b.head_local.z for b in rig.data.bones)
        margen = 0.012 * altura
        if separacion is not None:
            alfas = [float(separacion)]
        else:
            alfas = [5.0 + 2.0 * i for i in range(14)]
        defs = {}
        if malla is not None and separacion is None:
            for l in U.LADOS:
                hb, ha = p['mapa'].get(f'brazo.{l}'), p['mapa'].get(f'antebrazo.{l}')
                if hb and ha:
                    defs[l] = (_deform_movidos(rig, hb), _deform_movidos(rig, ha))
        elegido, dist = alfas[0], None
        for alfa in alfas:
            neutra = _brazos_neutra(rig, p, alfa, codo)
            if not defs:
                elegido = alfa if separacion is not None else 10.0
                break
            p['neutra'] = neutra
            _poner_neutra(rig, p)
            ds = [_malla_distancia(rig, malla, b, m, altura) for b, m in defs.values()]
            ds = [d for d in ds if d is not None]
            dist = min(ds) if ds else None
            elegido = alfa
            info['medido_con_malla'] = dist is not None
            if dist is None or dist >= margen:
                break
            U.pose_identidad(rig)
            bpy.context.view_layer.update()
        U.pose_identidad(rig)
        bpy.context.view_layer.update()
        p['neutra'] = _brazos_neutra(rig, p, elegido, codo)
    info.update({'separacion': elegido, 'distancia_mano_cuerpo': None if dist is None else round(dist, 4),
                 'margen': round(margen, 4), 'malla': malla.name if malla is not None else None})
    p['neutra_info'] = info
    guardar(rig, p)
    medir(rig, p)
    return info


def capturar_neutra(rig):
    """la pose actual de los huesos del perfil pasa a ser la neutra."""
    p = leer(rig)
    if not p or 'mapa' not in p:
        p = detectar(rig)
    p['neutra'] = {h: U.ql(U.local_quat(rig.pose.bones[h])) for h in huesos(p) if h in rig.pose.bones}
    p['neutra_info'] = {'capturada': True}
    guardar(rig, p)
    medir(rig, p)
    return {'huesos': len(p['neutra'])}


def neutra_local(p, hueso):
    v = p.get('neutra', {}).get(hueso)
    return Quaternion(v) if v else Quaternion()


def resumen(p):
    """lo que cabe en un informe."""
    return {'tipo': p.get('tipo'), 'huesos': len(p.get('mapa', {})), 'dedos': len(p.get('dedos', {})),
            'adelante': [round(x, 3) for x in p.get('marco', {}).get('F', [])], 'pose_reposo': p.get('pose_reposo'),
            'avisos': p.get('avisos', []), 'neutra': p.get('neutra_info')}
