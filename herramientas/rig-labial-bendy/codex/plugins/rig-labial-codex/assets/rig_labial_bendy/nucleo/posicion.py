# Posición del personaje en la escena (0.8.2). RLB lee y escribe todo en coordenadas locales = mundo (marcadores, cámaras de
# revisión, detección por rayos): con el personaje desplazado, o con otros personajes en el mismo .blend, las hojas salían de
# otro personaje y la detección fallaba. Aquí se resuelve de forma automática:
#   traer_al_origen(cara)  el personaje (malla, rig, ojos, piezas y marcadores) se lleva a X=Y=Z=0 recordando dónde estaba
#   devolver(cara)         lo vuelve a su sitio
#   en_origen(cara)        contexto: trae, ejecuta y devuelve (aunque falle)
#   aislado(cara)          contexto: oculta del render todo lo que no es del personaje
# El desplazamiento se guarda en cara['rlb_offset_mundo'] (lista x, y, z). Solo se mueven objetos raíz del conjunto: los hijos
# (por parent o por Child Of) siguen solos.
import contextlib
import bpy
from mathutils import Vector, Matrix

CLAVE = 'rlb_offset_mundo'
_SIGUEN = ('CHILD_OF', 'COPY_LOCATION', 'COPY_TRANSFORMS')


def _nombres_marca(cara):
    from . import marco as MK
    return MK.nombre_marca(cara, '')


def conjunto(cara):
    """objetos del personaje: los que empiezan por su nombre (rig, control, ojos, piezas, oclusión...) y sus marcadores
    RLB_<cara>_ (salvo los fm_* de la forma, que gestiona forma.py)."""
    pref = cara.name
    mpref = _nombres_marca(cara)
    out = []
    for o in bpy.data.objects:
        if o is cara or o.name.startswith(pref) or (o.name.startswith(mpref) and not o.name[len(mpref):].startswith('fm_')):
            out.append(o)
    return out


def _sigue(o, nombres):
    if o.parent is not None and o.parent.name in nombres:
        return True
    for c in o.constraints:
        if c.type in _SIGUEN and getattr(c, 'target', None) is not None and c.target.name in nombres and not c.mute:
            return True
    return False


def _normalizar(cara, objs):
    """un objeto con padre dentro del conjunto Y un Child Of al rig dentro del conjunto se desplazaría dos veces (pasaba con
    <cara>_Ojos_ROOT): se le quita el padre dejando el Child Of, que ya lo lleva. Solo si el mundo no cambia."""
    nombres = {o.name for o in objs}
    for o in objs:
        if o.parent is not None and o.parent.name in nombres and any(
                c.type in _SIGUEN and getattr(c, 'target', None) is not None and c.target.name in nombres for c in o.constraints):
            antes = o.matrix_world.copy()
            hijo_loc = o.location.copy()
            par, inv = o.parent, o.matrix_parent_inverse.copy()
            o.parent = None
            o.matrix_parent_inverse.identity()
            o.location = (0, 0, 0)
            bpy.context.view_layer.update()
            if any(abs(a - b) > 1e-5 for ra, rb in zip(antes, o.matrix_world) for a, b in zip(ra, rb)):
                o.parent = par; o.matrix_parent_inverse = inv; o.location = hijo_loc
                bpy.context.view_layer.update()


def raices(cara):
    objs = conjunto(cara)
    _normalizar(cara, objs)
    nombres = {o.name for o in objs}
    return [o for o in objs if not _sigue(o, nombres)]


def offset(cara):
    v = cara.get(CLAVE)
    return Vector(v) if v is not None else Vector((0, 0, 0))


def _desplazar(cara, d):
    for o in raices(cara):
        o.location = o.location + d
    bpy.context.view_layer.update()


def traer_al_origen(cara):
    """lleva el personaje a X=Y=Z=0 (guarda dónde estaba). Si la malla tiene rotación/escala, esas se hornean en la malla
    (sin mover lo que se ve). -> el desplazamiento aplicado (x, y, z)."""
    if cara.get(CLAVE) is not None and offset(cara).length > 1e-9 and cara.matrix_world.translation.length < 1e-6:
        return list(offset(cara))               # ya está en el origen
    bpy.context.view_layer.update()
    T = cara.matrix_world.translation.copy()
    M = cara.matrix_world.copy()
    RS = M.copy(); RS.translation = (0, 0, 0)
    objs = conjunto(cara)
    _normalizar(cara, objs)
    hijos = [(o, o.matrix_world.copy()) for o in objs if o is not cara and o.parent is cara]
    if any(abs(RS[i][j] - (1.0 if i == j else 0.0)) > 1e-6 for i in range(3) for j in range(3)):
        cara.data.transform(RS)                          # rotación y escala dentro de la malla
    # la malla vuelve a la identidad y su traslación se guarda; los demás raíz del conjunto se mueven con ella
    otros = [o for o in raices(cara) if o is not cara]
    cara.matrix_world = Matrix.Identity(4)
    if T.length > 1e-9:
        for o in otros:
            o.location = o.location - T
    bpy.context.view_layer.update()
    for o, mw in hijos:
        o.matrix_world = Matrix.Translation(-T) @ mw
    bpy.context.view_layer.update()
    if T.length > 1e-9:                    # dónde estaba = su traslación; si ya estaba en el origen se conserva lo guardado
        cara[CLAVE] = list(T)
    elif CLAVE not in cara.keys():
        cara[CLAVE] = [0.0, 0.0, 0.0]
    return list(cara[CLAVE])


def devolver(cara):
    """vuelve el personaje a su sitio original. -> el desplazamiento aplicado."""
    off = offset(cara)
    if off.length < 1e-9 or cara.matrix_world.translation.length > 1e-6:
        return list(off)
    _desplazar(cara, off)
    return list(off)


@contextlib.contextmanager
def en_origen(cara):
    """trae el personaje al origen, ejecuta y lo devuelve a su sitio (también si falla)."""
    estaba = cara.get(CLAVE) is not None and offset(cara).length > 1e-9 and cara.matrix_world.translation.length > 1e-6
    traer = estaba or cara.matrix_world.translation.length > 1e-6
    if traer:
        traer_al_origen(cara)
    try:
        yield
    finally:
        if traer:
            devolver(cara)


@contextlib.contextmanager
def aislado(cara):
    """solo el personaje (y sus marcadores) se ve en el render: lo demás se oculta un momento."""
    pref = cara.name
    mpref = _nombres_marca(cara)
    ocultos = []
    for o in bpy.data.objects:
        if o.name.startswith(pref) or o.name.startswith(mpref) or o.name.startswith('rlb_'):
            continue
        if o.type in ('MESH', 'CURVE', 'EMPTY', 'ARMATURE', 'SURFACE', 'FONT', 'GPENCIL', 'LIGHT') and not o.hide_render:
            ocultos.append(o); o.hide_render = True
    try:
        yield
    finally:
        for o in ocultos:
            try:
                o.hide_render = False
            except ReferenceError:
                pass


def centrar_x(cara, cx):
    """desplaza la MALLA (y lo que ya cuelga de ella: ojos, piezas) -cx en X para dejar la cara centrada. cx en metros: el
    centro actual que dio `analizar`. No mueve el objeto."""
    d = Vector((-cx, 0, 0))
    objs = conjunto(cara)
    _normalizar(cara, objs)
    otros = [(o, o.matrix_world.copy()) for o in objs if o is not cara]
    cara.data.transform(Matrix.Translation(d))
    bpy.context.view_layer.update()
    for o, mw in otros:                                    # lo ya construido sobre la cara acompaña al cambio
        if o.parent is cara or o.type == 'EMPTY' or o.name.endswith(('_Ojos_ROOT',)):
            try:
                o.matrix_world = Matrix.Translation(d) @ mw
            except Exception:
                pass
    bpy.context.view_layer.update()
