"""Pesos del cuerpo sin tocar la malla original ni los grupos de la cara.

Las mallas de Tripo traen cientos de piezas sueltas y capas superpuestas (ropa, forros), y
el Bone Heat de Blender falla con eso. Por eso:
1. Se hace un proxy temporal: remallado por voxeles de la malla (una sola piel cerrada).
2. Bone Heat (pesos automaticos) sobre el proxy con los huesos de deformacion del rig.
3. Cada vertice de la malla original toma los pesos del punto mas cercano del proxy
   (interpolando entre los vertices de esa cara).
4. La cabeza (vertices del rig facial) va rigida al hueso de la cabeza, con un fundido en el
   cuello, para que la cara funcione exactamente igual que antes.
5. Maximo 4 influencias, normalizado. El proxy se borra.

Solo se crean/escriben grupos DEF-* del rig corporal; los demas grupos, la topologia, el
orden de vertices y las shape keys no se tocan. Los pesos automaticos de cada vertice se
guardan en el atributo `ecb_pesos_auto` del objeto (como JSON compacto) para poder volver
a ellos por zonas desde el panel de pesos.
"""
import json

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

MAX_INFLUENCIAS = 4
CABEZA = 'DEF-spine.006'
CUELLO = ('DEF-spine.004', 'DEF-spine.005')


def _coords(ob):
    n = len(ob.data.vertices)
    co = np.empty(n * 3)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


def huesos_deformacion(rig):
    return [b.name for b in rig.data.bones if b.use_deform]


def _proxy(malla, voxel):
    """Objeto temporal con la malla remallada por voxeles (piel unica y cerrada)."""
    me = malla.data.copy()
    if me.shape_keys:
        # el proxy no necesita las shape keys (y el remallado las ignoraria igual)
        tmp = bpy.data.objects.new('ECB_tmp_base', me)
        bpy.context.scene.collection.objects.link(tmp)
        tmp.shape_key_clear()
    else:
        tmp = bpy.data.objects.new('ECB_tmp_base', me)
        bpy.context.scene.collection.objects.link(tmp)
    tmp.matrix_world = malla.matrix_world
    mod = tmp.modifiers.new('voxel', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    ev = tmp.evaluated_get(dg)
    me_p = bpy.data.meshes.new_from_object(ev)
    # Bone Heat falla si quedan islas sueltas (rizos, forros, botones): solo la piel mayor
    import bmesh
    from . import medir
    tmp_ob = bpy.data.objects.new('ECB_tmp_lab', me_p)
    lab = medir.componentes(tmp_ob)
    bpy.data.objects.remove(tmp_ob)
    mayor = np.bincount(lab).argmax()
    bm = bmesh.new()
    bm.from_mesh(me_p)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if lab[v.index] != mayor], context='VERTS')
    bm.to_mesh(me_p)
    bm.free()
    prox = bpy.data.objects.new('ECB_tmp_proxy', me_p)
    bpy.context.scene.collection.objects.link(prox)
    prox.matrix_world = malla.matrix_world
    bpy.data.objects.remove(tmp)
    bpy.data.meshes.remove(me)
    return prox


def _bone_heat(prox, rig):
    """Pesos automaticos de Blender sobre el proxy (necesita contexto de seleccion)."""
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.hide_set(False)
    prox.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    prox.select_set(False)
    rig.select_set(False)


def _matriz(ob, nombres):
    """Pesos (n_vertices x n_huesos) de los grupos indicados."""
    col = {n: i for i, n in enumerate(nombres)}
    gi = {g.index: col[g.name] for g in ob.vertex_groups if g.name in col}
    W = np.zeros((len(ob.data.vertices), len(nombres)), np.float32)
    for v in ob.data.vertices:
        for g in v.groups:
            j = gi.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    return W


def _vertices_cabeza(malla, rig_facial_grupos=None):
    """Vertices que mueve el rig facial (o el grupo 'cabeza' de Rig Labial)."""
    nombres = set(rig_facial_grupos or [])
    if not nombres:
        for m in malla.modifiers:
            if m.type == 'ARMATURE' and m.object and m.object.name != '' and m.name != 'Rig cuerpo':
                nombres |= {b.name for b in m.object.data.bones if b.use_deform}
        if 'cabeza' in malla.vertex_groups:
            nombres.add('cabeza')
    gi = {g.index for g in malla.vertex_groups if g.name in nombres}
    sel = np.zeros(len(malla.data.vertices), bool)
    for v in malla.data.vertices:
        for g in v.groups:
            if g.group in gi and g.weight > 0.001:
                sel[v.index] = True
                break
    return sel


def _z_labios(malla, P):
    """Altura mas baja (percentil 1) de los grupos de labios/parpados del rig facial."""
    gi = {g.index for g in malla.vertex_groups if g.name.startswith(('DEF-labio', 'DEF-parp', 'DEF-lip'))}
    if not gi:
        return None
    zs = [P[v.index, 2] for v in malla.data.vertices
          if any(g.group in gi and g.weight > 0.05 for g in v.groups)]
    return float(np.percentile(zs, 1)) if zs else None


def calcular(malla, rig, marcadores=None, voxel=None, fundido_cuello=None):
    """Calcula y escribe los pesos del cuerpo. Devuelve un resumen."""
    defs = huesos_deformacion(rig)
    P = _coords(malla)
    H = float(np.ptp(P[:, 2]))
    voxel = voxel or H / 250.0
    prox = _proxy(malla, voxel)
    try:
        _bone_heat(prox, rig)
        W = _matriz(prox, defs)
        sin_peso = int((W.sum(1) < 1e-4).sum())
        # transferencia: punto mas cercano del proxy, interpolando en su cara
        Pp = _coords(prox)
        polys = [tuple(p.vertices) for p in prox.data.polygons]
        bvh = BVHTree.FromPolygons([Vector(p) for p in Pp], polys)
        out = np.zeros((len(P), len(defs)), np.float32)
        for i, p in enumerate(P):
            loc, nor, fi, d = bvh.find_nearest(Vector(p))
            if fi is None:
                continue
            vs = polys[fi]
            dd = np.linalg.norm(Pp[list(vs)] - np.array(loc), axis=1) + 1e-6
            w = 1.0 / dd
            out[i] = (W[list(vs)] * w[:, None]).sum(0) / w.sum()
    finally:
        me = prox.data
        bpy.data.objects.remove(prox)
        bpy.data.meshes.remove(me)
    col = {n: i for i, n in enumerate(defs)}
    # cabeza rigida + fundido en el cuello
    cab = _vertices_cabeza(malla)
    if not cab.any() and marcadores and 'cuello' in marcadores:
        cab = P[:, 2] > marcadores['cuello'][2]       # sin rig facial: lo que queda sobre el cuello
    if cab.any() and CABEZA in col:
        if fundido_cuello is None:
            if marcadores and 'cuello' in marcadores and 'cabeza' in marcadores:
                z_a, z_b = marcadores['cuello'][2], marcadores['cabeza'][2] - 0.01 * H
            else:
                zc = P[cab, 2]
                z_a, z_b = zc.min(), zc.min() + 0.06 * H
            # los labios (y lo que mueve el rig facial fino) siempre 100 % cabeza
            zf = _z_labios(malla, P)
            if zf is not None:
                z_b = min(z_b, zf - 0.005 * H)
                z_a = min(z_a, z_b - 0.02 * H)
        else:
            z_a, z_b = fundido_cuello
        t = np.clip((P[:, 2] - z_a) / max(z_b - z_a, 1e-6), 0, 1)
        t = t * t * (3 - 2 * t)
        t[~cab] = 0.0
        # lo que no es cabeza dentro del grupo de cabeza va a los huesos del cuello
        cuello = np.zeros(len(defs), np.float32)
        for n in CUELLO:
            if n in col:
                cuello[col[n]] = 0.5
        base = out.copy()
        base_cab = np.where(base[cab].sum(1, keepdims=True) > 1e-4, base[cab], cuello)
        nueva = np.zeros_like(base[cab])
        nueva[:, col[CABEZA]] = 1.0
        out[cab] = base_cab * (1 - t[cab, None]) + nueva * t[cab, None]
    # 4 influencias y normalizar
    if out.shape[1] > MAX_INFLUENCIAS:
        corte = np.partition(out, -MAX_INFLUENCIAS, axis=1)[:, -MAX_INFLUENCIAS][:, None]
        out[out < corte] = 0.0
    s = out.sum(1, keepdims=True)
    out = np.where(s > 1e-6, out / np.maximum(s, 1e-6), 0)
    escribir(malla, defs, out)
    guardar_auto(malla, defs, out)
    asegurar_modificador(malla, rig)
    return {'vertices': len(P), 'huesos': len(defs), 'proxy_sin_peso': sin_peso,
            'sin_peso': int((out.sum(1) < 1e-4).sum()), 'cabeza': int(cab.sum()), 'voxel': voxel}


def escribir(malla, defs, W, solo=None):
    """Escribe la matriz en grupos DEF-* (solo filas `solo` si se da). No toca otros grupos."""
    filas = np.arange(len(W)) if solo is None else np.nonzero(solo)[0]
    for j, n in enumerate(defs):
        g = malla.vertex_groups.get(n) or malla.vertex_groups.new(name=n)
        col = W[filas, j]
        nz = filas[col > 1e-4]
        z = filas[col <= 1e-4]
        if len(z):
            g.remove(z.tolist())
        for w in np.unique(np.round(col[col > 1e-4], 4)):
            idx = nz[np.round(W[nz, j], 4) == w]
            g.add(idx.tolist(), float(w), 'REPLACE')


def guardar_auto(malla, defs, W):
    """Copia de los pesos automaticos dentro del objeto (para «volver a lo automatico»)."""
    filas, cols = np.nonzero(W > 1e-4)
    malla['ecb_pesos_auto'] = json.dumps({'defs': defs, 'f': filas.tolist(), 'c': cols.tolist(),
                                          'w': np.round(W[filas, cols], 4).tolist()})


def leer_auto(malla):
    d = json.loads(malla['ecb_pesos_auto'])
    W = np.zeros((len(malla.data.vertices), len(d['defs'])), np.float32)
    W[d['f'], d['c']] = d['w']
    return d['defs'], W


def asegurar_modificador(malla, rig):
    """Modificador Armature del cuerpo, el primero de la pila (antes que los de la cara)."""
    m = malla.modifiers.get('Rig cuerpo')
    if m is None:
        m = malla.modifiers.new('Rig cuerpo', 'ARMATURE')
    m.object = rig
    m.use_vertex_groups = True
    m.use_deform_preserve_volume = True
    i = malla.modifiers.find('Rig cuerpo')
    if i > 0:
        malla.modifiers.move(i, 0)
    return m
