# Interior de la boca por defecto = el de Tom Holland: dientes superiores e inferiores y lengua (biblioteca/boca_tom.blend,
# medidos en unidades de media anchura de boca desde el punto medio de las comisuras) y el fondo de boca de Tom, que es la
# bolsa de facs.interior.crear_bolsa (la misma función, así que sale idéntica en cualquier cara).
# Sustituye a las bandas procedurales de Vale: estas solo quedan de respaldo si falta la biblioteca.
import os, bpy
import numpy as np
from mathutils import Matrix

BIBLIOTECA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'biblioteca', 'boca_tom.blend')
PIEZAS = (('dientes_sup', 'Dientes_sup', 'cabeza'), ('dientes_inf', 'Dientes_inf', 'mandibula'), ('lengua', 'Lengua', 'mandibula'))
MARCA = 'rlb_plantilla_tom'
CURVA_MIN = 0.1     # en medias anchuras de boca: por debajo, la boca se considera recta y las piezas van a las comisuras
DIENTE_SUP, DIENTE_INF = 0.08, 0.22     # filo de los incisivos por debajo del contacto de los labios, en medias anchuras de boca


def disponible():
    return os.path.isfile(BIBLIOTECA)


def es_plantilla(obj):
    return obj is not None and bool(obj.get(MARCA))


def _cargar():
    """objetos y material de la biblioteca (el material se reutiliza si ya está en el .blend)."""
    with bpy.data.libraries.load(BIBLIOTECA, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith('RLB_Tom_')]
    return {o.name[len('RLB_Tom_'):]: o for o in dst.objects if o is not None}


def _material(nombre='RLB_Tom_Boca'):
    return bpy.data.materials.get(nombre)


def colocar(cara, K, rig=None, piezas=('dientes_sup', 'dientes_inf', 'lengua')):
    """crea (o rehace) <cara>_Dientes_sup, _Dientes_inf y _Lengua con la malla de Tom ajustada al marco de esta boca.
    Superior hacia el hueso 'cabeza' del rig, inferior y lengua hacia 'mandibula' (si hay rig; si no, hijas de la cara).
    Devuelve {pieza: n_vértices}. Si falta la biblioteca no toca nada."""
    if not disponible():
        return {'plantilla_tom': 'sin biblioteca'}
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    previo = _material()
    lib = _cargar()
    col = cara.users_collection[0] if cara.users_collection else bpy.context.scene.collection
    X, Y, Z, C = (np.asarray(v, float) for v in (K.X, K.Y, K.Z, K.C))
    hw = float(K.hw)
    F = np.array([X, Y, Z]).T                                       # columnas = ejes
    ls, li = getattr(K, 'ls', None), getattr(K, 'li', None)
    if ls is not None and li is not None:                           # boca curva: las comisuras no marcan la altura del contacto
        arco = float(((np.asarray(ls, float) + np.asarray(li, float)) / 2 - C) @ Z)
        if abs(arco) > CURVA_MIN * hw:
            C = C + Z * arco
    out = {}
    mat = previo or next((m for o in lib.values() for m in o.data.materials if m), None)
    for clave, sufijo, hueso in PIEZAS:
        if clave not in piezas or clave not in lib:
            continue
        nombre = f'{cara.name}_{sufijo}'
        viejo = bpy.data.objects.get(nombre)
        padre, tipo, hb = (rig, 'BONE', hueso) if rig is not None and hueso in rig.pose.bones else (cara, 'OBJECT', '')
        if viejo is not None:
            bpy.data.objects.remove(viejo)
        ob_lib = lib[clave]
        me = ob_lib.data
        me.name = nombre
        # normalizado -> espacio de la cara (mundo = cara.matrix_world @ ...)
        co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        co[:, 0] -= (co[:, 0].min() + co[:, 0].max()) / 2           # la plantilla viene algo descentrada en X
        P = C + (co @ F.T) * hw
        me.vertices.foreach_set('co', P.ravel())
        me.update()
        me.transform(cara.matrix_world)                              # a mundo
        me.materials.clear()
        if mat is not None:
            me.materials.append(mat)
        ob_lib.name = nombre
        ob_lib.matrix_world = Matrix.Identity(4)                    # la malla ya está en mundo; el padre se compensa abajo
        for c in list(ob_lib.users_collection):
            c.objects.unlink(ob_lib)
        col.objects.link(ob_lib)
        mw = ob_lib.matrix_world.copy()
        ob_lib.parent = padre; ob_lib.parent_type = tipo
        if tipo == 'BONE':
            ob_lib.parent_bone = hb
        bpy.context.view_layer.update()
        ob_lib.matrix_world = mw
        ob_lib[MARCA] = True
        for p in me.polygons:
            p.use_smooth = True
        out[sufijo] = len(me.vertices)
    for ob in lib.values():                                         # los que no se usaron
        if ob.users == 0:
            bpy.data.objects.remove(ob)
    return out


def a_contacto(cara, K):
    """0.8.45 (Pegazo): altura de los dientes medida en el contacto real de los labios, ya cerrados. Con la plantilla a las
    comisuras los dientes quedaban tapados por los labios al hablar. Solo sube o baja las piezas, con todas sus keys."""
    centro = lambda b: b[np.abs(K.u[b]) < 0.35]
    s, i = centro(K.borde_sup), centro(K.borde_inf)
    if not len(s) or not len(i):
        return None
    Z, X, C = np.asarray(K.Z, float), np.asarray(K.X, float), np.asarray(K.C, float)
    hw = float(K.hw)
    z0 = float(np.r_[K.p[s] @ Z, K.p[i] @ Z].mean())
    Mi = np.array(cara.matrix_world.inverted())
    out = {}
    subir = {}
    for sufijo, sup, hueco in (('Dientes_sup', True, DIENTE_SUP), ('Dientes_inf', False, DIENTE_INF)):
        o = bpy.data.objects.get(f'{cara.name}_{sufijo}')
        if not es_plantilla(o):
            continue
        M = Mi @ np.array(o.matrix_world)
        co = np.zeros(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', co)
        P = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        q = (P @ Z)[np.abs((P - C) @ X) < 0.35 * hw]
        if not len(q):
            continue
        borde = float(q.min() if sup else q.max())
        subir[sufijo] = z0 - hueco * hw - borde
        out[sufijo] = round(subir[sufijo] * 1000, 2)
    if 'Dientes_inf' in subir:
        subir['Lengua'] = subir['Dientes_inf']                     # la lengua sigue a los dientes de abajo
    for sufijo, dz in subir.items():
        o = bpy.data.objects.get(f'{cara.name}_{sufijo}')
        if o is None:
            continue
        M = Mi @ np.array(o.matrix_world)
        d = np.linalg.inv(M[:3, :3]) @ (Z * dz)
        n = len(o.data.vertices)
        bloques = list(o.data.shape_keys.key_blocks) if o.data.shape_keys else []
        for dat in [b.data for b in bloques] + [o.data.vertices]:
            co = np.zeros(n * 3); dat.foreach_get('co', co)
            dat.foreach_set('co', (co.reshape(-1, 3) + d).ravel())
        o.data.update()
    return out
