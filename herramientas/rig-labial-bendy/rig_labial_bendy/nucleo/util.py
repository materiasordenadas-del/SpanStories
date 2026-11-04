# Utilidades comunes del Rig Labial Bendy.
import bpy, bmesh, heapq
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree


def ss(e0, e1, x):
    """smoothstep vectorizado (e0 → 0, e1 → 1)."""
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def modo_objeto():
    o = bpy.context.object
    if o and o.mode != 'OBJECT':
        oculto = o.hide_viewport, o.hide_get()
        o.hide_viewport = False; o.hide_set(False)          # mode_set no funciona sobre objetos ocultos
        bpy.ops.object.mode_set(mode='OBJECT')
        o.hide_viewport = oculto[0]; o.hide_set(oculto[1])


def activar(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def pose_reposo(rig):
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def coleccion(nombre, padre=None):
    c = bpy.data.collections.get(nombre)
    if c is None:
        c = bpy.data.collections.new(nombre)
        (padre or bpy.context.scene.collection).children.link(c)
    return c


def borrar_objeto(nombre):
    o = bpy.data.objects.get(nombre)
    if not o:
        return
    d = o.data
    bpy.data.objects.remove(o)
    if d is not None and d.users == 0:
        if isinstance(d, bpy.types.Mesh): bpy.data.meshes.remove(d)
        elif isinstance(d, bpy.types.Armature): bpy.data.armatures.remove(d)
        elif isinstance(d, bpy.types.Camera): bpy.data.cameras.remove(d)


def coords(me, shape='Basis'):
    n = len(me.vertices); co = np.zeros(n * 3)
    if me.shape_keys and shape in me.shape_keys.key_blocks:
        me.shape_keys.key_blocks[shape].data.foreach_get('co', co)
    else:
        me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def asegurar_orig(me):
    """atributo rlb_orig (vértice original de cada vértice). Se crea con la identidad ANTES de cortar la malla:
    al partir aristas, las copias heredan el valor y siguen apuntando a su original."""
    if 'rlb_orig' not in me.attributes:
        me.attributes.new('rlb_orig', 'INT', 'POINT')
        me.attributes['rlb_orig'].data.foreach_set('value', list(range(len(me.vertices))))


def duplicados(me):
    """vértices partidos (copia y original en el mismo sitio) -> array de bool."""
    n = len(me.vertices); dup = np.zeros(n, bool)
    if 'rlb_orig' not in me.attributes:
        return dup
    o = np.zeros(n, int); me.attributes['rlb_orig'].data.foreach_get('value', o)
    nuevo = (o != np.arange(n)) & (o >= 0) & (o < n)
    dup[nuevo] = True; dup[o[nuevo]] = True
    return dup


def islas(me):
    """id de isla por vértice (conectividad por aristas)."""
    n = len(me.vertices)
    ev = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ev); ev = ev.reshape(-1, 2)
    par = np.arange(n)
    def raiz(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i
    for a, b in ev:
        ra, rb = raiz(a), raiz(b)
        if ra != rb: par[ra] = rb
    r = np.array([raiz(i) for i in range(n)])
    _, isl = np.unique(r, return_inverse=True)
    return isl


def vecinos(me):
    nb = [[] for _ in range(len(me.vertices))]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b); nb[b].append(a)
    return nb


def geodesica(P, nb, semillas, limite, bloqueado=None):
    """distancia geodésica (Dijkstra por aristas) desde las semillas. bloqueado(i, j) -> True corta la arista."""
    D = np.full(len(P), np.inf)
    h = [(0.0, int(i)) for i in semillas]
    for _, i in h: D[i] = 0.0
    heapq.heapify(h)
    while h:
        d, i = heapq.heappop(h)
        if d > D[i] or d > limite: continue
        for j in nb[i]:
            if bloqueado is not None and bloqueado(i, j): continue
            nd = d + float(np.linalg.norm(P[i] - P[j]))
            if nd < D[j]:
                D[j] = nd; heapq.heappush(h, (nd, j))
    return D


def bvh_de(P, me, mascara, excluir_caras=None):
    """BVH de la máscara de vértices, omitiendo opcionalmente caras ocultas por FACE bool."""
    polys = [tuple(p.vertices) for i, p in enumerate(me.polygons)
             if mascara[p.vertices[0]] and (excluir_caras is None or not excluir_caras[i])]
    return BVHTree.FromPolygons([Vector(c) for c in P], polys)


def kd_de(P, idx):
    kd = kdtree.KDTree(len(idx))
    for j, i in enumerate(idx): kd.insert(Vector(P[i]), int(i))
    kd.balance()
    return kd


def material(nombre, color, rough=0.5, spec=0.3):
    m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Base Color'].default_value = color
        bs.inputs['Roughness'].default_value = rough
        if 'Specular IOR Level' in bs.inputs:
            bs.inputs['Specular IOR Level'].default_value = spec
    m.diffuse_color = color
    m.roughness = rough
    return m


def color_hueso(b, col):
    b.color.palette = 'CUSTOM'
    b.color.custom.normal = col
    b.color.custom.select = tuple(min(1, c * 1.3 + 0.15) for c in col)
    b.color.custom.active = (1, 1, 1)


def driver_transform(id_owner, path, expr, rig, vars_, index=-1):
    """vars_ = [(nombre, hueso, canal)]; canal p. ej. 'LOC_Y', 'ROT_X'."""
    fc = id_owner.driver_add(path, index) if index >= 0 else id_owner.driver_add(path)
    d = fc.driver; d.type = 'SCRIPTED'
    for nm, bone, canal in vars_:
        v = d.variables.new(); v.name = nm; v.type = 'TRANSFORMS'
        t = v.targets[0]; t.id = rig; t.bone_target = bone; t.transform_type = canal
        t.transform_space = 'LOCAL_SPACE'
        if canal.startswith('ROT'): t.rotation_mode = 'XYZ'
    d.expression = expr
    return fc


def carpeta_revision(cara, *sub):
    """<carpeta del .blend (o temporal)>/RLB_revision/<cara>/...; 0.6.9: el nombre se sanea («Tronchatoro » con
    espacio al final no es una carpeta válida en Windows y el render no se podía guardar)."""
    import os, re
    import bpy
    base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
    nombre = re.sub(r'[<>:"/\|?*]', '_', cara.name).strip().rstrip('.') or 'cara'
    return os.path.join(base, 'RLB_revision', nombre, *sub)
