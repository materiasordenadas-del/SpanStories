"""Etapa 1: colocar el esqueleto a mano de forma sencilla antes de confirmarlo.

Los marcadores ECB_<personaje>_* son empties. Encima se dibuja un esqueleto de vista previa
(una malla de palos y bolas con un modificador Hook por punto), asi al mover un marcador el
esqueleto se ve cambiar al instante sobre el personaje, sin tocar la malla original.

- Simetria: con `simetria` activa, mover un marcador .L mueve su pareja .R en espejo (y al
  reves); los de la columna se quedan en x=0.
- Grupos: hombros, brazos, manos, dedos, columna, pelvis, rodillas, pies y cabeza se pueden
  subir/bajar, abrir/cerrar, adelantar/atrasar y, en brazos y piernas, alargar, con un solo
  control.
- Cada marcador guarda su posicion automatica (`ecb_auto`) para volver a ella.
- Confirmar: construye el metarig, genera el rig y oculta marcadores y vista previa.
"""
import bpy
from mathutils import Vector

from . import medir

DEDOS = ('indice', 'medio', 'anular', 'menique', 'pulgar')
GRUPOS = {
    'columna': ['pelvis', 'columna', 'pecho', 'pecho_alto'],
    'cabeza': ['cuello', 'cuello_medio', 'cabeza', 'coronilla'],
    'pelvis': ['pelvis', 'cadera.{l}'],
    'hombros': ['clavicula.{l}', 'hombro.{l}'],
    'brazos': ['hombro.{l}', 'codo.{l}', 'muneca.{l}', 'mano_punta.{l}', 'mano_w.{l}', 'mano_n.{l}']
              + [f'{d}_{i}.{{l}}' for d in DEDOS for i in range(4)],
    'codos': ['codo.{l}'],
    'manos': ['muneca.{l}', 'mano_punta.{l}', 'mano_w.{l}', 'mano_n.{l}'] + [f'{d}_{i}.{{l}}' for d in DEDOS for i in range(4)],
    'dedos': [f'{d}_{i}.{{l}}' for d in DEDOS for i in range(4)],
    'rodillas': ['rodilla.{l}'],
    'pies': ['tobillo.{l}', 'bola_pie.{l}', 'punta_pie.{l}', 'talon.{l}', 'talon_ext.{l}', 'talon_int.{l}'],
    'piernas': ['cadera.{l}', 'rodilla.{l}', 'tobillo.{l}', 'bola_pie.{l}', 'punta_pie.{l}', 'talon.{l}',
                'talon_ext.{l}', 'talon_int.{l}'],
}
# raiz de cada cadena para «alargar» (escala desde ese punto)
RAIZ_CADENA = {'brazos': 'hombro.{l}', 'piernas': 'cadera.{l}', 'manos': 'muneca.{l}', 'dedos': 'muneca.{l}'}
# puntos de ayuda que no se ven en la vista previa ni se ofrecen para mover
AYUDA = ('mano_w', 'mano_n', 'talon_ext', 'talon_int', 'axila', 'mano_punta')

_bloqueo = False


def _emp(personaje, k):
    return bpy.data.objects.get(f'ECB_{personaje}_{k}')


def _pareja(k):
    if k.endswith('.L'):
        return k[:-2] + '.R'
    if k.endswith('.R'):
        return k[:-2] + '.L'
    return None


# ---------------------------------------------------------------- marcadores

def poner_marcadores(personaje, puntos, guardar_auto=True):
    """Crea/mueve los marcadores y recuerda la posicion automatica."""
    medir.crear_marcadores(personaje, puntos)
    for k, p in puntos.items():
        e = _emp(personaje, k)
        if guardar_auto:
            e['ecb_auto'] = list(p)
        e.hide_set(k.split('.')[0] in AYUDA)
    return len(puntos)


def reiniciar(personaje, grupo=None):
    """Vuelve a la posicion automatica (todo o un grupo)."""
    claves = _claves_grupo(personaje, grupo) if grupo else list(medir.leer_marcadores(personaje))
    n = 0
    for k in claves:
        e = _emp(personaje, k)
        if e is not None and 'ecb_auto' in e:
            e.location = Vector(e['ecb_auto'])
            n += 1
    return n


def _claves_grupo(personaje, grupo, lado=None):
    lados = (lado,) if lado else ('L', 'R')
    out = []
    for k in GRUPOS[grupo]:
        if '{l}' in k:
            out += [k.format(l=l) for l in lados]
        elif lado is None or grupo in ('columna', 'cabeza', 'pelvis'):
            out.append(k)
    return [k for k in dict.fromkeys(out) if _emp(personaje, k) is not None]


def mover_grupo(personaje, grupo, arriba=0.0, afuera=0.0, adelante=0.0, alargar=0.0, lado=None):
    """Mueve un grupo entero. `afuera` abre en espejo (+ separa del centro), `adelante` hacia
    donde mira (-Y), `alargar` es un factor (0.05 = +5 %) desde la raiz de la cadena."""
    for k in _claves_grupo(personaje, grupo, lado):
        e = _emp(personaje, k)
        sg = 1 if k.endswith('.L') else (-1 if k.endswith('.R') else 0)
        d = Vector((afuera * sg, -adelante, arriba))
        if alargar and grupo in RAIZ_CADENA and sg:
            r = _emp(personaje, RAIZ_CADENA[grupo].format(l=k[-1]))
            if r is not None and r is not e:
                d += (e.location - r.location) * alargar
        e.location += d
    return True


def seleccionar(personaje, k, mover=False):
    """Selecciona un marcador (y su pareja si hay simetria) y, si se pide, lo coge para mover
    con el raton como con la tecla G."""
    e = _emp(personaje, k)
    if e is None:
        return False
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    e.hide_set(False)
    e.select_set(True)
    bpy.context.view_layer.objects.active = e
    if mover:
        bpy.ops.transform.translate('INVOKE_DEFAULT')
    return True


# ---------------------------------------------------------------- vista previa

def _pares(puntos):
    pares = [(a.format(l=l), b.format(l=l)) for a, b in medir.UNIONES for l in ('L', 'R')]
    pares += list(zip(medir.COLUMNA[:-1], medir.COLUMNA[1:]))
    pares += [(f'clavicula.{l}', 'pecho_alto') for l in ('L', 'R')]
    pares += [(f'cadera.{l}', 'pelvis') for l in ('L', 'R')]
    pares += [(f'talon.{l}', f'tobillo.{l}') for l in ('L', 'R')]
    return [(a, b) for a, b in pares if a in puntos and b in puntos]


def vista_previa(personaje):
    """Esqueleto de palos que sigue a los marcadores en vivo (Hooks). Se rehace entero."""
    quitar_vista(personaje)
    puntos = {k: v for k, v in medir.leer_marcadores(personaje).items() if k.split('.')[0] not in AYUDA}
    claves = list(puntos)
    idx = {k: i for i, k in enumerate(claves)}
    me = bpy.data.meshes.new(f'ECB_{personaje}_vista')
    me.from_pydata([Vector(puntos[k]) for k in claves], [(idx[a], idx[b]) for a, b in _pares(puntos)], [])
    ob = bpy.data.objects.new(f'ECB_{personaje}_vista', me)
    medir.coleccion(personaje).objects.link(ob)
    ob.show_in_front = True
    ob.display_type = 'WIRE'
    ob.hide_select = True               # que los clics caigan en los marcadores
    ob.color = (1.0, 0.35, 0.1, 1.0)
    for k in claves:
        h = ob.modifiers.new(f'h_{k}', 'HOOK')
        h.object = _emp(personaje, k)
        h.vertex_indices_set([idx[k]])
        # el hook trabaja relativo al empty: partir de su posicion actual
        h.matrix_inverse = h.object.matrix_world.inverted()
    # grosor visible (solo visor): skin al final, despues de los hooks
    sk = ob.modifiers.new('grosor', 'SKIN')
    sk.show_render = False
    for v in me.skin_vertices[0].data:
        v.radius = (0.003, 0.003)
    return ob


def quitar_vista(personaje):
    ob = bpy.data.objects.get(f'ECB_{personaje}_vista')
    if ob is not None:
        me = ob.data
        bpy.data.objects.remove(ob)
        if me.users == 0:
            bpy.data.meshes.remove(me)


def mostrar_marcadores(personaje, visible=True):
    for k in medir.leer_marcadores(personaje):
        e = _emp(personaje, k)
        e.hide_set((not visible) or k.split('.')[0] in AYUDA)
    v = bpy.data.objects.get(f'ECB_{personaje}_vista')
    if v is not None:
        v.hide_set(not visible)


# ---------------------------------------------------------------- simetria en vivo

def _al_cambiar(scene, depsgraph):
    """Con la simetria activa, el marcador que se mueve arrastra a su pareja en espejo."""
    global _bloqueo
    if _bloqueo:
        return
    p = getattr(scene, 'ecorp_rig', None)
    if p is None or not p.simetria or not p.personaje:
        return
    pre = f'ECB_{p.personaje}_'
    activos = [u.id for u in depsgraph.updates if u.is_updated_transform and isinstance(u.id, bpy.types.Object)
               and u.id.name.startswith(pre) and u.id.type == 'EMPTY']
    if not activos:
        return
    _bloqueo = True
    try:
        for idb in activos:
            e = bpy.data.objects.get(idb.name)
            if e is None or not e.select_get():
                continue
            k = e.name[len(pre):]
            q = _pareja(k)
            if q is None:
                if abs(e.location.x) > 1e-6:
                    e.location.x = 0.0          # la columna va por el centro
                continue
            o = _emp(p.personaje, q)
            if o is None or o.select_get():
                continue
            nuevo = Vector((-e.location.x, e.location.y, e.location.z))
            if (o.location - nuevo).length > 1e-6:
                o.location = nuevo
    finally:
        _bloqueo = False


def simetrizar(personaje, desde='L'):
    """Copia un lado al otro en espejo (una vez)."""
    for k in medir.leer_marcadores(personaje):
        if k.endswith('.' + desde):
            e, o = _emp(personaje, k), _emp(personaje, _pareja(k))
            if o is not None:
                o.location = Vector((-e.location.x, e.location.y, e.location.z))
    return True


# ---------------------------------------------------------------- confirmar

def confirmar(personaje, nombre_rig=None):
    """Metarig sobre los marcadores y rig generado. Nada de la malla se toca aqui."""
    from . import metarig
    m = medir.leer_marcadores(personaje)
    mr = metarig.construir(personaje, m)
    rig = metarig.generar(personaje, nombre_rig)
    mostrar_marcadores(personaje, False)
    return rig


def registrar_handler():
    if _al_cambiar not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(_al_cambiar)


def quitar_handler():
    if _al_cambiar in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_al_cambiar)
