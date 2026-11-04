"""Anclas sobre la superficie labial, guiadas por el rig de cada personaje.

El máximo de un peso NO identifica el labio: puede estar en la piel o en el
forro. Se proyecta la línea media anatómica del rig sobre la piel frontal y se
guarda un triángulo con coordenadas baricéntricas, que sigue la deformación.
"""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def resolver(cara, AJ):
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    if rig is None:
        raise RuntimeError('Falta el rig de labios para colocar sus puntos sobre la superficie')
    kb = cara.data.shape_keys.key_blocks
    P = np.empty(len(cara.data.vertices) * 3)
    kb[0].data.foreach_get('co', P)
    P = P.reshape(-1, 3)
    M = cara.matrix_world.inverted() @ rig.matrix_world

    def guia(nombre):
        b = rig.data.bones.get(nombre)
        if b is None:
            raise RuntimeError(f'Falta la guía labial {nombre}')
        return np.array(M @ b.head_local)

    cl = guia('tweak_labio_sup_comisura.L')
    cr = guia('tweak_labio_sup_comisura.R')
    cx, hw = (cl[0] + cr[0]) / 2, abs(cl[0] - cr[0]) / 2
    if hw < 1e-8:
        raise RuntimeError('Las comisuras no definen una boca válida')
    W = AJ._peso_grupos(cara, 'DEF-labio_sup') + AJ._peso_grupos(cara, 'DEF-labio_inf')
    cara.data.calc_loop_triangles()
    tris = [tuple(t.vertices) for t in cara.data.loop_triangles
            if min(W[i] for i in t.vertices) > 0.001
            and all(abs(P[i, 0] - cx) < hw * 1.3 for i in t.vertices)]
    if not tris:
        raise RuntimeError('No hay superficie labial con pesos; no se colocan puntos en la piel por aproximación')
    bvh = BVHTree.FromPolygons(P.tolist(), tris, all_triangles=True)
    origen_y = float(P[:, 1].min() - hw)
    superficies, objetivos = {}, {}
    nl = AJ.densidad(cara)['boca'] // 2
    for lab in ('sup', 'inf'):
        curva = [guia(f'tweak_labio_{lab}')]
        for s in ('R', 'L'):
            curva.extend(guia(f'tweak_labio_{lab}.{s}.{i:03}') for i in (1, 2))
            curva.append(guia(f'tweak_labio_{lab}_comisura.{s}'))
        curva = np.array(sorted(curva, key=lambda q: q[0]))
        puntos = list(AJ._pts_labio(lab, nl))
        if lab == 'inf':
            puntos += [('labio_borde_inf_R', -0.68), ('labio_borde_inf_L', 0.68)]
        for nombre, u in puntos:
            x = cx + u * hw
            z = float(np.interp(x, curva[:, 0], curva[:, 2]))
            y = float(np.interp(x, curva[:, 0], curva[:, 1]))
            hit, normal, ti, _ = bvh.ray_cast(Vector((x, origen_y, z)), Vector((0, 1, 0)))
            if hit is None or normal.y > 0.1 or abs(hit.y - y) > hw * 0.45:
                raise RuntimeError(f'No encuentro la superficie frontal del labio para {nombre}; revisa las guías')
            tri = tris[ti]
            a, b, c = P[list(tri)]
            uv = np.linalg.lstsq(np.stack((b - a, c - a), axis=1), np.array(hit) - a, rcond=None)[0]
            pesos = np.clip(np.array((1 - uv.sum(), uv[0], uv[1])), 0, 1)
            pesos /= pesos.sum()
            superficies[nombre] = {'tri': list(tri), 'w': pesos.tolist()}
            objetivos[nombre] = np.array(hit)
    return superficies, objetivos, P, hw


def aplicar(cara, AJ, rehacer_bordes=False):
    superficies, objetivos, P, hw = resolver(cara, AJ)
    anclas = dict(cara.get('aj_anclas', {}))
    for p, datos in superficies.items():
        # Compatibilidad con herramientas antiguas que requieren un índice.
        anclas[p] = int(datos['tri'][int(np.argmax(datos['w']))])
    cara['aj_anclas'] = anclas
    cara['aj_superficies_labios'] = superficies
    if rehacer_bordes:
        W = AJ._peso_grupos(cara, 'DEF-labio_inf')
        from .construir import poner_key
        kb = cara.data.shape_keys.key_blocks
        for s in ('L', 'R'):
            p = f'labio_borde_inf_{s}'
            m = W * AJ._campana(np.linalg.norm(P - objetivos[p], axis=1), 0.34 * hw)
            datos = superficies[p]
            pico = sum(m[i] * v for i, v in zip(datos['tri'], datos['w']))
            if pico < 1e-6:
                raise RuntimeError(f'El control {p} no tiene influencia sobre el labio')
            # Igual amplitud en ambos puntos, independiente de la densidad/peso del vértice.
            m /= pico
            for d, eje in (('arriba', (0, 0, 1)), ('adelante', (0, -1, 0))):
                n = AJ.nombre(p, d)
                valor = kb[n].value if n in kb else 0.0
                poner_key(cara, n, m[:, None] * np.array(eje) * AJ.MM['labio'] * hw / 0.0135 / 1000,
                          valor, (-1., 1.))
    cara['aj_anclas_labios_version'] = 2
    return superficies
