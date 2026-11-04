# Capas NLA (DISENO §7): pista «EC Base» (neutra, caminar o la que sea, REPLACE) y «EC Expresión» (COMBINE) encima.
# Mientras se previsualiza se aparta la acción activa del rig y se silencian sus otras pistas; todo se guarda en
# rig.ecorp.previo y quitar() lo deja exactamente como estaba.
#
#   capas.previsualizar(rig, clave, base=None)     base: None/'neutra' | 'ninguna' | nombre de una acción
#   capas.quitar(rig)
#   capas.encadenar(rig, [claves], base=None, inicio=1, solape=None)
#   capas.aplicar_pose(rig, clave, fase='mantener', intensidad=1.0)   (pose estática, sin tocar la animación)
import bpy, math
from mathutils import Quaternion, Vector, Euler
from . import util as U
from . import perfil as PF

PISTA_BASE = 'EC Base'
PISTA_EXPR = 'EC Expresión'
PISTA_EXPR2 = 'EC Expresión 2'
PISTAS = (PISTA_BASE, PISTA_EXPR, PISTA_EXPR2)


def _es_nuestra(t):
    return t.name in PISTAS or t.name.startswith('EC_')


def estado(rig):
    return U.leer_json(U.props(rig).vista)


def activa(rig):
    ad = rig.animation_data
    return bool(ad and any(t.name in PISTAS for t in ad.nla_tracks))


def _guardar_estado(rig):
    pg = U.props(rig)
    if pg.previo:
        return
    ad = rig.animation_data_create()
    sc = bpy.context.scene
    d = {'accion': ad.action.name if ad.action else None,
         'slot': ad.action_slot.identifier if ad.action_slot else None,
         'mudas': {t.name: t.mute for t in ad.nla_tracks if not _es_nuestra(t)},
         'use_nla': ad.use_nla,
         'rango': [sc.use_preview_range, sc.frame_preview_start, sc.frame_preview_end]}
    pg.previo = U.escribir_json(d)


def _quitar_pistas(rig):
    ad = rig.animation_data
    if ad is None:
        return
    for t in list(ad.nla_tracks):
        if t.name in PISTAS:
            ad.nla_tracks.remove(t)


def quitar(rig):
    """quita la previsualización y devuelve el rig a su animación de antes."""
    pg = U.props(rig)
    _quitar_pistas(rig)
    d = U.leer_json(pg.previo)
    ad = rig.animation_data
    if d and ad is not None:
        a = bpy.data.actions.get(d.get('accion') or '')
        ad.action = a
        if a is not None and d.get('slot'):
            s = next((s for s in a.slots if s.identifier == d['slot']), None)
            if s is not None:
                ad.action_slot = s
        for t in ad.nla_tracks:
            if t.name in d.get('mudas', {}):
                t.mute = d['mudas'][t.name]
        ad.use_nla = d.get('use_nla', True)
        sc = bpy.context.scene
        r = d.get('rango')
        if r:
            sc.use_preview_range = r[0]
            sc.frame_preview_start, sc.frame_preview_end = r[1], r[2]
    pg.previo = ''
    pg.vista = ''
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    return {'quitada': True}


def _accion_base(rig, base):
    from . import generador as GE
    if base in (None, '', 'neutra', 'NEUTRA'):
        a = U.accion(rig, 'neutra')
        return a if a is not None else GE.generar(rig, 'neutra')
    if base in ('ninguna', 'NINGUNA'):
        return None
    a = bpy.data.actions.get(base)
    if a is None:
        raise RuntimeError(f'No existe la acción base «{base}»')
    return a


def _accion_expr(rig, clave):
    from . import generador as GE
    clave, _ = GE.datos_de(rig, clave)
    a = U.accion(rig, clave)
    return clave, (a if a is not None else GE.generar(rig, clave))


def _marcador(a, n, defecto=None):
    m = a.pose_markers.get(n)
    return m.frame if m is not None else defecto


def _pista_base(rig, ab, inicio, fin):
    ad = rig.animation_data
    t = ad.nla_tracks.new()
    t.name = PISTA_BASE
    if ab is None:
        return t
    f0, f1 = ab.frame_range
    largo = max(f1 - f0, 1.0)
    st = t.strips.new(ab.name, int(inicio), ab)
    st.blend_type = 'REPLACE'
    st.extrapolation = 'HOLD'
    st.repeat = max(1.0, math.ceil((fin - inicio + 1) / largo))
    return t


def _intensidad(st, k):
    if abs(k - 1.0) < 1e-6:
        return
    st.use_animated_influence = True
    if st.fcurves:
        f = st.fcurves[0]
        f.keyframe_points.clear()
        f.keyframe_points.insert(st.frame_start, k)


def _rango(inicio, fin):
    sc = bpy.context.scene
    sc.use_preview_range = True
    sc.frame_preview_start, sc.frame_preview_end = int(inicio), int(max(fin, inicio + 1))


def previsualizar(rig, clave, base=None, inicio=1, intensidad=1.0, fotograma=None):
    """pone base + expresión en el NLA para verla en la línea de tiempo (la neutra va sola, como base)."""
    PF.asegurar(rig)
    ab = _accion_base(rig, base)
    if clave == 'neutra':
        ae = None
    else:
        clave, ae = _accion_expr(rig, clave)
    _guardar_estado(rig)
    ad = rig.animation_data_create()
    ad.action = None
    ad.use_nla = True
    for t in ad.nla_tracks:
        if not _es_nuestra(t):
            t.mute = True
    _quitar_pistas(rig)
    largo = (ae.frame_range[1] - ae.frame_range[0]) if ae else (ab.frame_range[1] - ab.frame_range[0] if ab else 48)
    fin = inicio + largo
    _pista_base(rig, ab, inicio, fin)
    if ae is not None:
        te = ad.nla_tracks.new()
        te.name = PISTA_EXPR
        st = te.strips.new(ae.name, int(inicio), ae)
        st.blend_type = 'COMBINE'
        st.extrapolation = 'NOTHING'
        _intensidad(st, intensidad)
    _rango(inicio, fin)
    U.props(rig).vista = U.escribir_json({'clave': clave, 'base': base or 'neutra', 'inicio': inicio,
                                          'intensidad': intensidad})
    sc = bpy.context.scene
    if fotograma is not None:
        sc.frame_set(int(fotograma))
    elif not (inicio <= sc.frame_current <= fin):
        sc.frame_set(int(inicio))
    else:
        sc.frame_set(sc.frame_current)
    mk = {m.name: m.frame for m in ae.pose_markers} if ae else {}
    return {'clave': clave, 'base': ab.name if ab else None, 'expresion': ae.name if ae else None,
            'inicio': inicio, 'fin': fin, 'marcadores': mk}


def refrescar(rig):
    """tras regenerar: ajusta las tiras a la nueva duración de sus acciones y reevalúa el fotograma."""
    ad = rig.animation_data
    if ad is None:
        return
    for t in ad.nla_tracks:
        if t.name not in PISTAS:
            continue
        for st in t.strips:
            if st.action is None:
                continue
            f0, f1 = st.action.frame_range
            if t.name == PISTA_BASE:
                continue
            if (st.action_frame_start, st.action_frame_end) != (f0, f1):
                st.action_frame_start = f0
                st.action_frame_end = f1
                st.scale = 1.0
                st.frame_end = st.frame_start + (f1 - f0)
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)


def encadenar(rig, claves, base=None, inicio=1, solape=None, intensidad=1.0):
    """varias expresiones seguidas: cada una entra cuando la anterior empieza a salir (o con 'solape' fotogramas).
    Van alternando dos pistas COMBINE para poder solaparse: los deltas se suman y el fundido sale solo."""
    PF.asegurar(rig)
    ab = _accion_base(rig, base)
    acciones = [_accion_expr(rig, c) for c in claves if c != 'neutra']
    if not acciones:
        raise RuntimeError('Nada que encadenar')
    _guardar_estado(rig)
    ad = rig.animation_data_create()
    ad.action = None
    ad.use_nla = True
    for t in ad.nla_tracks:
        if not _es_nuestra(t):
            t.mute = True
    _quitar_pistas(rig)
    plan, f = [], float(inicio)
    for clave, a in acciones:
        f0, f1 = a.frame_range
        plan.append((clave, a, f, f + (f1 - f0)))
        sal = _marcador(a, 'salida', f1)
        s = (f1 - sal) if solape is None else float(solape)
        f = f + (f1 - f0) - s
    fin = max(x[3] for x in plan)
    _pista_base(rig, ab, inicio, fin)
    pistas = []
    for nom in (PISTA_EXPR, PISTA_EXPR2):
        t = ad.nla_tracks.new()
        t.name = nom
        pistas.append(t)
    out = []
    for i, (clave, a, f0, f1) in enumerate(plan):
        st = pistas[i % 2].strips.new(f'{clave}', int(round(f0)), a)
        st.blend_type = 'COMBINE'
        st.extrapolation = 'NOTHING'
        _intensidad(st, intensidad)
        out.append({'clave': clave, 'inicio': st.frame_start, 'fin': st.frame_end})
    _rango(inicio, fin)
    U.props(rig).vista = U.escribir_json({'clave': plan[0][0], 'cadena': [x['clave'] for x in out],
                                          'base': base or 'neutra', 'inicio': inicio})
    bpy.context.scene.frame_set(int(inicio))
    return {'cadena': out, 'fin': fin}


def colocar(rig, clave, frame, intensidad=1.0, base=None):
    """añade la expresión en la línea de tiempo empezando en 'frame' (sin quitar las que ya hubiera)."""
    PF.asegurar(rig)
    clave, ae = _accion_expr(rig, clave)
    ad = rig.animation_data_create()
    if not activa(rig):
        previsualizar(rig, clave, base=base, inicio=frame, intensidad=intensidad)
        return {'clave': clave, 'inicio': frame}
    largo = ae.frame_range[1] - ae.frame_range[0]
    for nom in (PISTA_EXPR, PISTA_EXPR2):
        t = ad.nla_tracks.get(nom) or ad.nla_tracks.new()
        t.name = nom
        if all(s.frame_end < frame or s.frame_start > frame + largo for s in t.strips):
            st = t.strips.new(clave, int(frame), ae)
            st.blend_type = 'COMBINE'
            st.extrapolation = 'NOTHING'
            _intensidad(st, intensidad)
            b = ad.nla_tracks.get(PISTA_BASE)
            if b is not None and b.strips:
                bs = b.strips[0]
                f0, f1 = bs.action.frame_range
                bs.repeat = max(bs.repeat, math.ceil((frame + largo - bs.frame_start + 1) / max(f1 - f0, 1.0)))
            sc = bpy.context.scene
            sc.frame_preview_end = int(max(sc.frame_preview_end, frame + largo))
            return {'clave': clave, 'inicio': st.frame_start, 'fin': st.frame_end, 'pista': nom}
    raise RuntimeError('Las dos pistas de expresión están ocupadas en ese tramo')


# ---------------------------------------------------------------- evaluar acciones a mano
def indice(a):
    """{hueso: {'q': [fc x4], 'e': [fc x3], 'l': [fc x3]}} de una acción."""
    out = {}
    if a is None:
        return out
    for f in U.fcurves(a):
        dp = f.data_path
        if not dp.startswith('pose.bones["'):
            continue
        h = dp[len('pose.bones["'):dp.index('"]')]
        prop = dp.rsplit('.', 1)[-1]
        k = {'rotation_quaternion': 'q', 'rotation_euler': 'e', 'location': 'l'}.get(prop)
        if k is None:
            continue
        d = out.setdefault(h, {})
        lst = d.setdefault(k, [None] * (4 if k == 'q' else 3))
        if f.array_index < len(lst):
            lst[f.array_index] = f
    return out


def _ev(lst, f, defecto):
    return [lst[i].evaluate(f) if lst[i] is not None else defecto[i] for i in range(len(defecto))]


def valor_accion(ix, pb, f):
    """(rotación como cuaternión, ubicación) que la acción da al hueso en f; None si no lo anima."""
    d = ix.get(pb.name)
    if not d:
        return None
    if 'q' in d:
        qq = Quaternion(_ev(d['q'], f, (1, 0, 0, 0)))
        qq = qq.normalized() if qq.magnitude > 1e-9 else Quaternion()
    elif 'e' in d:
        qq = Euler(_ev(d['e'], f, (0, 0, 0)), pb.rotation_mode if pb.rotation_mode not in ('QUATERNION', 'AXIS_ANGLE') else 'XYZ').to_quaternion()
    else:
        qq = Quaternion()
    l = Vector(_ev(d['l'], f, (0, 0, 0))) if 'l' in d else Vector()
    return qq, l, ('e' in d)


def _strip(rig, nombre_pista, f):
    ad = rig.animation_data
    t = ad.nla_tracks.get(nombre_pista) if ad else None
    if t is None:
        return None
    for st in t.strips:
        if st.frame_start <= f <= st.frame_end and st.action is not None:
            return st
    return None


def _tiempo_accion(st, f):
    f0, f1 = st.action_frame_start, st.action_frame_end
    largo = max(f1 - f0, 1e-6)
    t = (f - st.frame_start) / max(st.scale, 1e-6)
    if st.repeat > 1:
        t = t % largo
    return f0 + t


def esperado(rig, clave, frame):
    """pose local que el sistema da a cada hueso en 'frame' (base + delta): {hueso: (q, loc)}. Sirve para ver qué
    ha cambiado el usuario a mano (retoques)."""
    p = PF.asegurar(rig)
    a = U.accion(rig, clave)
    ixe = indice(a)
    sb = _strip(rig, PISTA_BASE, frame) if activa(rig) else None
    se = _strip(rig, PISTA_EXPR, frame) or _strip(rig, PISTA_EXPR2, frame) if activa(rig) else None
    ixb = indice(sb.action) if sb else {}
    fb = _tiempo_accion(sb, frame) if sb else None
    fe = _tiempo_accion(se, frame) if (se and se.action == a) else frame
    out = {}
    for pb in rig.pose.bones:
        if sb is not None:
            vb = valor_accion(ixb, pb, fb)
            bq, bl, be = (vb if vb else (Quaternion(), Vector(), False))
        else:
            bq, bl, be = PF.neutra_local(p, pb.name), Vector(), False
        vd = valor_accion(ixe, pb, fe)
        if vd is None:
            out[pb.name] = (bq, bl)
            continue
        dq, dl, de = vd
        if de and pb.rotation_mode not in ('QUATERNION', 'AXIS_ANGLE'):
            e0 = bq.to_euler(pb.rotation_mode)
            d = ixe[pb.name]['e']
            dv = _ev(d, fe, (0, 0, 0))
            qq = Euler([e0[i] + dv[i] for i in range(3)], pb.rotation_mode).to_quaternion()
        else:
            qq = bq @ dq
        out[pb.name] = (qq, bl + dl)
    return out


def aplicar_pose(rig, clave, fase='mantener', intensidad=1.0, frame=None):
    """pone la pose de la expresión (neutra + delta en el marcador 'fase') directamente en los huesos."""
    from . import generador as GE
    p = PF.asegurar(rig)
    if clave == 'neutra':
        a = None
    else:
        clave, a = _accion_expr(rig, clave)
    ix = indice(a)
    if frame is None and a is not None:
        m0, m1 = _marcador(a, 'mantener', 1), _marcador(a, 'salida', None)
        frame = _marcador(a, fase, m0) if fase != 'mantener' else m0
    n = 0
    for h in PF.huesos(p):
        pb = rig.pose.bones.get(h)
        if pb is None:
            continue
        nq = PF.neutra_local(p, h)
        v = valor_accion(ix, pb, frame) if a is not None else None
        if v is None:
            U.poner_local(pb, nq)
            continue
        dq, dl, de = v
        if de and pb.rotation_mode not in ('QUATERNION', 'AXIS_ANGLE'):
            e0 = nq.to_euler(pb.rotation_mode)
            dv = _ev(ix[h]['e'], frame, (0, 0, 0))
            pb.rotation_euler = [e0[i] + dv[i] * intensidad for i in range(3)]
        else:
            U.poner_local(pb, nq @ U.qpow(dq, intensidad))
        if dl.length > 0:
            pb.location = dl * intensidad
        n += 1
    bpy.context.view_layer.update()
    return {'clave': clave, 'huesos': n, 'frame': frame}
