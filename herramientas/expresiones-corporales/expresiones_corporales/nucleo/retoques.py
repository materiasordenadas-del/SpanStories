# Retoques manuales (DISENO §6): lo que el usuario gira o mueve a mano encima de la expresión generada se guarda como
# delta en espacio de la armadura relativo al reposo, escrito en el MARCO DEL CUERPO (L, F, U) y con el nombre
# SEMÁNTICO del hueso ('brazo.L', 'indice.R#2'). Así sobrevive a regenerar y vale para otro personaje aunque mire a
# otro lado o tenga otros nombres de huesos:  delta_local = R_reposo^-1 · delta_arm · R_reposo.
#
#   retoques.capturar(rig, clave, fase='mantener')   fase: 'pico' | 'mantener' | 'todas'
#   retoques.borrar(rig, clave, hueso=None)
#   retoques.convertir(retoques, perfil_destino)
import bpy, math
from mathutils import Quaternion, Matrix, Vector
from . import util as U
from . import perfil as PF

FASES = ('pico', 'mantener', 'todas')


def _base(p):
    F, Uv, L = (Vector(p['marco'][k]) for k in 'FUL')
    return Matrix((L, F, Uv)).transposed()          # columnas L, F, U: cuerpo -> armadura


def _reposo(rig, h):
    return rig.data.bones[h].matrix_local.to_3x3()


def a_cuerpo(rig, p, h, X_local, dl_local):
    """delta local del hueso h -> (cuaternión en el marco del cuerpo, ubicación en el marco del cuerpo / altura)."""
    R = _reposo(rig, h)
    B = _base(p)
    q_arm = R @ X_local.to_matrix() @ R.inverted()
    q_cu = (B.transposed() @ q_arm @ B).to_quaternion()
    alt = p.get('medidas', {}).get('altura', 1.0)
    l_cu = B.transposed() @ (R @ dl_local) / max(alt, 1e-6)
    return q_cu, l_cu


def a_local(rig, p, h, q_cu, l_cu):
    R = _reposo(rig, h)
    B = _base(p)
    q_arm = B @ Quaternion(q_cu).to_matrix() @ B.transposed()
    X = (R.inverted() @ q_arm @ R).to_quaternion()
    alt = p.get('medidas', {}).get('altura', 1.0)
    dl = R.inverted() @ (B @ Vector(l_cu) * alt)
    return X, dl


def a_locales(M, ret):
    """retoques guardados -> {hueso real: (X_local, fase, dloc_local)} para el generador."""
    out = {}
    for k, r in (ret or {}).items():
        h = PF.hueso_de(M.p, k)
        if h is None or h not in M.rig.pose.bones:
            continue
        X, dl = a_local(M.rig, M.p, h, r.get('q', (1, 0, 0, 0)), r.get('loc', (0, 0, 0)))
        out[h] = (X, r.get('fase', 'mantener'), dl)
    return out


def capturar(rig, clave, fase='mantener', umbral=0.3, frame=None):
    """compara la pose actual con la generada en el fotograma actual y guarda las diferencias como retoques;
    luego regenera la acción (los retoques ya van dentro)."""
    from . import generador as GE, capas as CA
    if fase not in FASES:
        raise RuntimeError(f'fase debe ser una de {FASES}')
    p = PF.asegurar(rig)
    clave, datos = GE.datos_de(rig, clave)
    if U.accion(rig, clave) is None:
        GE.generar(rig, clave)
    sc = bpy.context.scene
    frame = sc.frame_current if frame is None else frame
    esp = CA.esperado(rig, clave, frame)
    sem = PF.semantico_de(p)
    ret = datos.setdefault('retoques', {})
    alt = p.get('medidas', {}).get('altura', 1.0)
    hechos = {}
    for pb in rig.pose.bones:
        if pb.name not in esp:
            continue
        eq, el = esp[pb.name]
        uq = U.local_quat(pb)
        X = eq.inverted() @ uq
        if X.w < 0:
            X.negate()
        dl = pb.location - el
        ang = math.degrees(X.angle)
        if ang < umbral and dl.length < 1e-4 * alt:
            continue
        k = sem.get(pb.name, '#' + pb.name)
        viejo = ret.get(k)
        if viejo:
            X0, dl0 = a_local(rig, p, pb.name, viejo['q'], viejo.get('loc', (0, 0, 0)))
            X, dl = X0 @ X, dl0 + dl
        q_cu, l_cu = a_cuerpo(rig, p, pb.name, X, dl)
        ret[k] = {'q': U.ql(q_cu), 'loc': [round(x, 6) for x in l_cu], 'fase': fase}
        hechos[k] = round(ang, 2)
    U.escribir_expr(rig, clave, datos)
    if hechos:
        GE.generar(rig, clave)
        if CA.activa(rig):
            CA.refrescar(rig)
    return {'clave': clave, 'retoques': hechos, 'n': len(hechos), 'total': len(ret)}


def borrar(rig, clave, hueso=None):
    """quita los retoques de un hueso (nombre real o semántico) o todos, y regenera."""
    from . import generador as GE, capas as CA
    p = PF.asegurar(rig)
    clave, datos = GE.datos_de(rig, clave)
    ret = datos.get('retoques') or {}
    if hueso is None:
        n = len(ret); ret = {}
    else:
        sem = PF.semantico_de(p)
        k = hueso if hueso in ret else sem.get(hueso, '#' + hueso)
        n = 1 if ret.pop(k, None) is not None else 0
    datos['retoques'] = ret
    U.escribir_expr(rig, clave, datos)
    GE.generar(rig, clave)
    if CA.activa(rig):
        CA.refrescar(rig)
    return {'clave': clave, 'borrados': n, 'quedan': len(ret)}


def listar(rig, clave):
    d = U.leer_expr(rig, clave) or {}
    out = {}
    for k, r in (d.get('retoques') or {}).items():
        out[k] = {'grados': round(math.degrees(Quaternion(r['q']).angle), 2), 'fase': r.get('fase', 'mantener')}
    return out


def convertir(retoques, perfil_destino):
    """los retoques ya son portables (marco del cuerpo + nombres semánticos): solo se quitan los de huesos
    sueltos ('#nombre') que el otro rig no tiene."""
    out = {}
    for k, r in (retoques or {}).items():
        if PF.hueso_de(perfil_destino, k) is not None:
            out[k] = dict(r)
    return out
