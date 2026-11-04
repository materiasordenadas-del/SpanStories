"""Grosor del personaje, independiente de los canales de expresión.

Solo añade dos morphs neutros. No regenera puntos, pesos ni formas existentes.
"""
import bpy
import numpy as np
from . import mascaras_labios as ML

NOMBRES = {'sup': 'rlb_grosor_labio_sup', 'inf': 'rlb_grosor_labio_inf'}
VERSION = 2


def calcular(cara):
    if cara.type != 'MESH' or cara.mode != 'OBJECT':
        raise RuntimeError('La cara debe estar en modo Objeto para preparar el grosor')
    sk = cara.data.shape_keys
    if sk is None or not sk.use_relative:
        raise RuntimeError('Se necesitan las shape keys relativas del rig facial')
    if cara.data.users != 1 or cara.library or cara.data.library:
        raise RuntimeError('La cara debe ser una malla local sin datos compartidos')
    superficies = cara.get('aj_superficies_labios', {})
    P = np.empty(len(cara.data.vertices) * 3)
    sk.key_blocks[0].data.foreach_get('co', P)
    P = P.reshape(-1, 3)
    # Validación explícita: nunca reutilizar índices que ya no pertenecen a la malla.
    for datos in superficies.values():
        tri, w = np.asarray(datos['tri']), np.asarray(datos['w'], dtype=float)
        if (tri.shape != (3,) or not np.issubdtype(tri.dtype, np.integer)
                or np.any(tri < 0) or np.any(tri >= len(P)) or w.shape != (3,)
                or not np.isfinite(w).all() or np.any(w < 0) or abs(w.sum() - 1.) > 1e-5):
            raise RuntimeError('Las anclas labiales no corresponden a una superficie válida')
    anclas = cara.get('aj_anclas', {})
    hw = None
    if all(n in anclas for n in ('comisura_L', 'comisura_R')):
        ids = [int(anclas[n]) for n in ('comisura_L', 'comisura_R')]
        if min(ids) < 0 or max(ids) >= len(P):
            raise RuntimeError('Las comisuras necesitan revisión tras editar la topología')
        hw = float(np.linalg.norm(P[ids[0]] - P[ids[1]]) / 2.)
    bandas, medidas = ML.bandas(P, superficies, hw)
    hw = medidas['semiancho']
    # Las máscaras de los puntos son demasiado estrechas para modelar volumen:
    # el suavizado del personaje elimina casi por completo esa deformación.
    # Usar una banda propia de grosor, sin modificar las máscaras de los puntos.
    curvas = {lab: np.array(sorted(
        [np.asarray(d['w']) @ P[np.asarray(d['tri'], dtype=int)]
         for n, d in superficies.items() if n.startswith('labio_' + lab + '_')],
        key=lambda q: q[0])) for lab in NOMBRES}
    radio = .55 * hw
    distancias = {lab: ML._distancia_linea(P, q) for lab, q in curvas.items()}
    for lab, otro in (('sup', 'inf'), ('inf', 'sup')):
        t = np.clip(distancias[lab] / radio, 0., 1.)
        frontera = np.clip((distancias[otro] - distancias[lab]) / (.25 * radio), 0., 1.)
        bandas[lab] = (1. - t * t) ** 2 * frontera ** 2 * (3. - 2. * frontera)
    # La proximidad geométrica puede incluir el forro del labio opuesto.
    # Respetar la separación anatómica que ya tiene el rig, sin editar sus pesos.
    from . import ajustes as AJ
    pesos = {lab: AJ._peso_grupos(cara, 'DEF-labio_' + lab) for lab in NOMBRES}
    for lab, otro in (('sup', 'inf'), ('inf', 'sup')):
        t = np.clip((pesos[lab] - pesos[otro]) / .8, 0., 1.)
        propio = t * t * (3. - 2. * t)
        propio[pesos[otro] > .001] = 0.
        if not np.any(propio * bandas[lab] > 0):
            raise RuntimeError('Faltan pesos exclusivos del labio ' + lab + '; no se mezclan ambos labios')
        bandas[lab] *= propio
    # Excluir islas desconectadas aunque estén cerca de los labios.
    vecinos = [[] for _ in P]
    for e in cara.data.edges:
        a, b = e.vertices
        vecinos[a].append(b); vecinos[b].append(a)
    deltas = {}
    for lab in NOMBRES:
        puntos = [np.asarray(d['w']) @ P[np.asarray(d['tri'], dtype=int)]
                  for n, d in superficies.items() if n.startswith('labio_' + lab + '_')]
        curva = np.array(sorted(puntos, key=lambda q: q[0]))
        if len(curva) < 3 or np.any(np.diff(curva[:, 0]) <= 1e-10):
            raise RuntimeError('Faltan anclas labiales ordenadas para calcular el grosor')
        permitidos = bandas[lab] > 0
        semillas = {int(i) for n, d in superficies.items()
                    if n.startswith('labio_' + lab + '_') for i in d['tri'] if permitidos[int(i)]}
        visitados = set(semillas); cola = list(semillas)
        while cola:
            for j in vecinos[cola.pop()]:
                if permitidos[j] and j not in visitados:
                    visitados.add(j); cola.append(j)
        if not visitados:
            raise RuntimeError('No hay superficie conectada en el labio ' + lab)
        mascara = np.zeros(len(P))
        ids = list(visitados); mascara[ids] = bandas[lab][ids]
        # Desvanecer antes de las comisuras; nunca cambiar el ancho de boca.
        cx = (curva[0, 0] + curva[-1, 0]) / 2.
        t = np.clip((np.abs(P[:, 0] - cx) / hw - .65) / .35, 0., 1.)
        mascara *= 1. - t * t * (3. - 2. * t)
        centro_z = np.interp(P[:, 0], curva[:, 0], curva[:, 2])
        D = np.zeros_like(P)
        D[:, 2] = .8 * (P[:, 2] - centro_z) * mascara
        D[:, 1] = -.12 * hw * mascara
        # Alisar el campo dentro del mismo labio, manteniendo a cero el otro.
        # Evita pliegues en la frontera de los pesos exclusivos sin expandirla.
        activos = np.flatnonzero(mascara > 0)
        for _ in range(3):
            suave = D.copy()
            for i in activos:
                if vecinos[i]: suave[i] = .5 * D[i] + .5 * D[vecinos[i]].mean(axis=0)
            D = suave
        if not np.isfinite(D).all() or np.max(np.linalg.norm(D, axis=1)) < hw * 1e-7:
            raise RuntimeError('El labio no tiene una banda válida para ajustar su grosor')
        deltas[lab] = D
    # Validar ambos extremos y las mezclas antes de escribir las dos keys.
    cara.data.calc_loop_triangles()
    T = np.asarray([t.vertices[:] for t in cara.data.loop_triangles], dtype=int)
    if not len(T):
        raise RuntimeError('Falta superficie triangular para validar los labios')
    normal = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for superior in (-1., 0., 1.):
        for inferior in (-1., 0., 1.):
            delta = superior * deltas['sup'] + inferior * deltas['inf']
            Q = P + delta
            movidos = np.any(np.abs(delta[T]) > 1e-12, axis=(1, 2))
            nuevo = np.cross(Q[T[:, 1]] - Q[T[:, 0]], Q[T[:, 2]] - Q[T[:, 0]])
            if np.any((np.sum(normal * nuevo, axis=1) <= 0) & movidos):
                raise RuntimeError('El grosor invertiría una cara; no se modifica ninguna key')
    return P, deltas


def actualizar(cara):
    """Migra exclusivamente las dos keys propias, conservando sus valores actuales."""
    sk = cara.data.shape_keys
    if (sk is None or cara.get('rlb_grosor_version') not in (1, VERSION)
            or any(n not in sk.key_blocks for n in NOMBRES.values())):
        raise RuntimeError('No hay un par de controles de grosor propios para actualizar')
    for n in NOMBRES.values():
        k = sk.key_blocks[n]
        path = k.path_from_id('value')
        if (k.relative_key != sk.key_blocks[0] or k.vertex_group
                or (sk.animation_data and any(f.data_path == path for f in sk.animation_data.drivers))):
            raise RuntimeError('El control de grosor tiene una configuración ajena; no se reemplaza')
    P, deltas = calcular(cara)
    anteriores = {}
    for n in NOMBRES.values():
        co = np.empty(P.size); sk.key_blocks[n].data.foreach_get('co', co)
        anteriores[n] = co
    try:
        for lab, n in NOMBRES.items():
            sk.key_blocks[n].data.foreach_set('co', (P + deltas[lab]).ravel())
        cara['rlb_grosor_version'] = VERSION
    except Exception:
        for n, co in anteriores.items(): sk.key_blocks[n].data.foreach_set('co', co)
        raise
    finally:
        sk.update_tag(); cara.update_tag(refresh={'DATA'})
    return list(NOMBRES.values())


def crear(cara):
    """Idempotente: nunca sustituye una key preexistente ni modifica una expresión."""
    sk = cara.data.shape_keys
    existentes = [n for n in NOMBRES.values() if sk and n in sk.key_blocks]
    if existentes:
        if len(existentes) == 2 and cara.get('rlb_grosor_version') in (1, VERSION):
            return actualizar(cara) if cara.get('rlb_grosor_version') == 1 else []
        raise RuntimeError('Ya existen keys de grosor sin un par propio completo; no se reemplazan')
    P, deltas = calcular(cara)
    creadas = []
    indice = cara.active_shape_key_index
    try:
        for lab, n in NOMBRES.items():
            k = cara.shape_key_add(name=n, from_mix=False)
            creadas.append(k)
            k.data.foreach_set('co', (P + deltas[lab]).ravel())
            k.relative_key = sk.key_blocks[0]
            k.slider_min = -1.; k.slider_max = 1.; k.value = 0.
        cara['rlb_grosor_version'] = VERSION
    except Exception:
        for k in reversed(creadas):
            cara.shape_key_remove(k)
        raise
    finally:
        cara.active_shape_key_index = indice
    sk.update_tag(); cara.update_tag(refresh={'DATA'})
    return [k.name for k in creadas]


class RLB_OT_grosor_labios(bpy.types.Operator):
    bl_idname = 'rlb.grosor_labios'
    bl_label = 'Activar grosor de labios'
    bl_description = 'Añade dos controles neutros de grosor sin cambiar las expresiones ni la malla base'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import editor
        cara = editor._cara(context)
        if cara is None:
            self.report({'ERROR'}, 'Selecciona la cara del personaje'); return {'CANCELLED'}
        try:
            crear(cara)
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}
        return {'FINISHED'}


def dibujar(layout, cara):
    b = layout.box()
    b.label(text='Grosor de los labios', icon='MOD_SMOOTH')
    kb = cara.data.shape_keys.key_blocks if cara.data.shape_keys else {}
    if cara.get('rlb_grosor_version') in (1, VERSION) and all(n in kb for n in NOMBRES.values()):
        c = b.column(align=True)
        c.enabled = cara.mode == 'OBJECT'
        for lab, texto in (('sup', 'Superior'), ('inf', 'Inferior')):
            c.prop(kb[NOMBRES[lab]], 'value', text=texto, slider=True)
        b.label(text='− Delgado · 0 Original · + Grueso')
        b.label(text='Se conserva al cambiar de expresión')
        if cara.get('rlb_grosor_version') < VERSION:
            b.operator('rlb.grosor_labios', text='Actualizar efecto de grosor', icon='FILE_REFRESH')
    else:
        b.operator('rlb.grosor_labios', icon='ADD')


def register():
    bpy.utils.register_class(RLB_OT_grosor_labios)


def unregister():
    bpy.utils.unregister_class(RLB_OT_grosor_labios)
