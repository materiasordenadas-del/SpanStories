# Ojos de Lian (0.6.4): globo, iris, pupila y córnea generados, sin texturas (iris con COLOR_0, exportable a GLB).
# Es el generador que se hizo para Camilo y se midió en Lian (crear_ojos_camilo.py / crear_ojos_lian.py en
# Nueva carpeta), escalado al radio del globo. Las piezas cuelgan de los mismos pivotes que los ojos de Vale
# (<cara>_OjoPivote_L/R bajo <cara>_Ojos_ROOT): la mirada, los párpados, la cuenca y la lente no cambian.
import math
import bpy, bmesh
from mathutils import Vector
from . import util, marco as MK

# medidas de Lian en fracciones del radio del globo (r = 16,16 mm)
IRIS_R = 0.3466        # radio del iris
IRIS_Z = -0.0495       # iris un poco por debajo del centro
IRIS_X = 0.0619        # y hacia la nariz (mirada que converge)
PUPILA = 0.472         # radio de la pupila / radio del iris
CORNEA = 0.068         # abombado de la córnea delante del iris

COLORES = {   # (oscuro, claro, aro): el iris mezcla oscuro→claro con ruido; arriba más oscuro (sombra del párpado)
    'turquesa': ((0.002, 0.045, 0.10), (0.010, 0.265, 0.40), (0.001, 0.008, 0.017)),     # Lian
    'castano': ((0.085, 0.026, 0.008), (0.215, 0.084, 0.025), (0.025, 0.009, 0.0035)),   # Camilo, Martín
    'verde': ((0.020, 0.060, 0.020), (0.090, 0.230, 0.070), (0.006, 0.016, 0.006)),
    'gris': ((0.060, 0.070, 0.080), (0.260, 0.290, 0.320), (0.015, 0.017, 0.020)),
}
PIEZAS = ('Globo', 'Iris', 'Pupila', 'Cornea')
VALE = ('Eyeball', 'Iris', 'Pupil', 'Highlight_1', 'Highlight_2')


def _mat(nombre, color, rugosidad=0.3):
    m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    m.diffuse_color = (*color, 1); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rugosidad
    return m


def _materiales(pref, capa):
    blanco = _mat(f'{pref}_Esclerotica', (0.83, 0.82, 0.76), 0.25)
    negro = _mat(f'{pref}_Pupila', (0.0015, 0.0009, 0.0006), 0.22)
    iris = _mat(f'{pref}_Iris_Procedural', (0.14, 0.055, 0.017), 0.35)
    nt = iris.node_tree
    vc = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = capa
    nt.links.new(vc.outputs['Color'], nt.nodes.get('Principled BSDF').inputs['Base Color'])
    cornea = _mat(f'{pref}_Cornea', (0.98, 0.99, 1.0), 0.12)
    p = cornea.node_tree.nodes.get('Principled BSDF')
    p.inputs['Transmission Weight'].default_value = 0
    p.inputs['IOR'].default_value = 1.376
    p.inputs['Alpha'].default_value = 0.065
    p.inputs['Specular IOR Level'].default_value = 0.35
    cornea.diffuse_color = (0.98, 0.99, 1.0, 0.065)
    cornea.surface_render_method = 'BLENDED'
    cornea.use_transparency_overlap = False
    return blanco, negro, iris, cornea


def _malla(nombre, V, F, mat, col, piv):
    viejo = bpy.data.objects.get(nombre)
    if viejo:
        util.borrar_objeto(nombre)
    me = bpy.data.meshes.new(nombre); me.from_pydata(V, [], F); me.update()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(nombre, me); col.objects.link(ob)
    ob.parent = piv
    return ob


def _frente(ob):
    """caras hacia -Y (hacia fuera de la cara)."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if sum(f.normal.y for f in bm.faces) > 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data); bm.free()


def crear(cara, color='castano', iris=None, pupila=None, n=64, radios=None):
    """sustituye las piezas de los pivotes (de Vale o de una vez anterior) por los ojos de Lian.
    iris: radio del iris en fracciones del radio del globo (Lian 0,347); pupila: radio pupila / radio iris."""
    M = MK.Marco(cara) if radios is None else None
    if radios is not None and any(s not in radios or not math.isfinite(radios[s]) or radios[s]<=0 for s in ('L','R')):
        raise ValueError('Se requieren radios positivos para ambos ojos')
    d = MK.cfg(cara)
    pv = d.get('pivotes')
    if not pv:
        raise RuntimeError('Faltan los pivotes de los ojos: paso 7 (ojos de Vale) primero')
    iris_r = IRIS_R if iris is None else iris
    pup = PUPILA if pupila is None else pupila
    oscuro, claro, aro = COLORES[color] if isinstance(color, str) else color
    capa = f'{cara.name}IrisColor'
    blanco, negro, mat_iris, mat_cornea = _materiales(cara.name, capa)
    col = util.coleccion(f'{cara.name} ojos')
    hechos = []
    for s, piv_n in zip(('L', 'R'), pv):
        piv = bpy.data.objects[piv_n]
        sg = 1 if s == 'L' else -1
        for k in VALE:
            util.borrar_objeto(f'{cara.name}_{k}_{s}')
        for ch in list(piv.children):
            if ch.type == 'MESH' and not ch.name.startswith(f'{cara.name}_Oclusion'):
                util.borrar_objeto(ch.name)
        R = (M.ojo(s)[1] if radios is None else radios[s]) / piv.matrix_world.to_scale()[0]
        # globo
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=R)
        me = bpy.data.meshes.new(f'{cara.name}_Globo_{s}'); bm.to_mesh(me); bm.free()
        me.materials.append(blanco)
        for p in me.polygons:
            p.use_smooth = True
        g = bpy.data.objects.new(me.name, me); col.objects.link(g); g.parent = piv
        ri = iris_r * R; zi = IRIS_Z * R; xi = -sg * IRIS_X * R

        def sup(x, z, off=0.0):
            return -R * math.sqrt(max(0.01, 1 - (x / R) ** 2 - (z / R) ** 2)) - off * R
        # iris (anillos sobre la superficie del globo; el aro exterior oscuro)
        rs = [.47, .52, .63, .76, .89, .96, 1.0]
        V, F = [], []
        for rr in rs:
            for k in range(n):
                a = 2 * math.pi * k / n; x = xi + ri * rr * math.cos(a); z = zi + ri * rr * math.sin(a)
                V.append((x, sup(x, z, 0.0034), z))
        for j in range(len(rs) - 1):
            for k in range(n):
                F.append((j * n + k, j * n + (k + 1) % n, (j + 1) * n + (k + 1) % n, (j + 1) * n + k))
        io = _malla(f'{cara.name}_Iris_{s}', V, F, mat_iris, col, piv)
        at = io.data.color_attributes.new(name=capa, type='BYTE_COLOR', domain='POINT')
        for j, rr in enumerate(rs):
            for k in range(n):
                v = (math.sin(k * 2.399) + math.sin(k * .71 + j * .8) + 2) / 4
                luz = 0.30 + 0.70 * (1 - math.sin(2 * math.pi * k / n)) / 2
                c = [(o_ + (c_ - o_) * v) * luz for o_, c_ in zip(oscuro, claro)]
                at.data[j * n + k].color = (*(aro if rr >= .96 else c), 1)
        # pupila
        V = [(xi, sup(xi, zi, 0.005), zi)]
        for k in range(n):
            a = 2 * math.pi * k / n; x = xi + ri * pup * math.cos(a); z = zi + ri * pup * math.sin(a)
            V.append((x, sup(x, z, 0.005), z))
        po = _malla(f'{cara.name}_Pupila_{s}', V, [(0, 1 + k, 1 + (k + 1) % n) for k in range(n)], negro, col, piv)
        # córnea (lente transparente abombada delante del iris)
        V, F = [(xi, sup(xi, zi, CORNEA), zi)], []
        for j in range(1, 9):
            rr = j / 8
            for k in range(n):
                a = 2 * math.pi * k / n; x = xi + ri * rr * math.cos(a); z = zi + ri * rr * math.sin(a)
                V.append((x, sup(x, z, 0.0062 + (CORNEA - 0.0062) * (1 - rr * rr)), z))
        for k in range(n):
            F.append((0, 1 + k, 1 + (k + 1) % n))
        for j in range(7):
            for k in range(n):
                F.append((1 + j * n + k, 1 + (j + 1) * n + k, 1 + (j + 1) * n + (k + 1) % n, 1 + j * n + (k + 1) % n))
        co = _malla(f'{cara.name}_Cornea_{s}', V, F, mat_cornea, col, piv)
        for ob in (io, po, co):
            _frente(ob)
        hechos += [g.name, io.name, po.name, co.name]
    d['ojos_modo'] = 'LIAN'; d['ojos_lian'] = {'color': color if isinstance(color, str) else list(map(list, color)),
                                               'iris': iris_r, 'pupila': pup}
    MK.guardar_cfg(cara, d)
    return {'piezas': hechos}
