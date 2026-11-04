# Reutilizar los globos de Tripo en vez de sustituirlos (0.8.50, «Ojos y textura»): ya encajan en su cuenca. Cada medio globo sale de la
# cara a su propio objeto, con el pivote en el centro de su esfera (así la mirada lo gira sin salirse del párpado), y recibe iris y pupila
# como imagen en una UV plana: exporta a GLB sin nodos procedurales. La órbita la optimiza preparar_parpados, conservando el globo.
import bmesh
import bpy
import numpy as np
from mathutils import Vector

from . import marco as MK, ojos_lian as OL, preparar_parpados as PP, util

IRIS = 0.47         # radio del iris / radio del globo
PUPILA = 0.45       # radio de la pupila / radio del iris
ALCANCE = 1.5       # media anchura de la imagen, en radios del globo: cabe el globo entero aunque el iris vaya descentrado
PX = 1024
ESCLERA = (0.83, 0.82, 0.76)
DESCENTRADO = 0.4   # el iris se centra en la abertura, sin alejarse del polo del globo más que esto (en radios)


def _islas_cerca(bm, c, R):
    """piezas sueltas con forma de casquete de esfera alrededor de c. -> [(vértices, (centro, radio, error))]."""
    vistos, out = set(), []
    for v0 in bm.verts:
        if v0 in vistos or (v0.co - c).length > 1.5 * R:
            continue
        isla = {v0}; st = [v0]
        while st and len(isla) <= PP.MAX_INTERIOR:
            v = st.pop()
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in isla:
                    isla.add(w); st.append(w)
        vistos |= isla
        if PP.MIN_GLOBO <= len(isla) <= PP.MAX_INTERIOR and all((v.co - c).length < 1.5 * R for v in isla):
            a = PP._esfera([v.co for v in isla])
            if a and a[2] <= PP.ERROR_GLOBO * a[1]:
                out.append((isla, a))
    return out


def _centro_iris(bm, isla, c, r):
    """desplazamiento (x, z) del iris desde el centro del globo: el centro de la curva por donde la piel toca el globo."""
    tol = 0.03 * r
    Q = [v.co - c for v in bm.verts if v not in isla and abs((v.co - c).length - r) < tol and v.co.y < c.y]
    if not Q:
        return 0.0, 0.0
    x, z = sum(q.x for q in Q) / len(Q), sum(q.z for q in Q) / len(Q)
    d = (x * x + z * z) ** 0.5
    k = min(1.0, DESCENTRADO * r / d) if d else 1.0
    return x * k, z * k


def _a_srgb(c):
    c = np.clip(np.asarray(c, float), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def _rampa(x, a, b):
    t = np.clip((x - a) / max(b - a, 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def _pintar(nombre, color, iris, pupila):
    oscuro, claro, aro = (np.array(c) for c in (OL.COLORES[color] if isinstance(color, str) else color))
    borde = 2 * ALCANCE / PX * 1.5
    y, x = np.mgrid[0:PX, 0:PX]
    x = ((x + 0.5) / PX * 2 - 1) * ALCANCE; y = ((y + 0.5) / PX * 2 - 1) * ALCANCE
    rho, ang = np.hypot(x, y), np.arctan2(y, x)
    rp = iris * pupila
    t = np.clip((rho - rp) / max(iris - rp, 1e-6), 0, 1)
    fibra = 0.5 + 0.25 * np.sin(ang * 37 + 1.0) + 0.15 * np.sin(ang * 61 + 2.1) + 0.1 * np.sin(ang * 97 + 0.7)
    mezcla = (fibra * (1 - 0.6 * t))[..., None]
    col = oscuro + (claro - oscuro) * mezcla
    col = col + (aro - col) * _rampa(rho, iris * 0.8, iris)[..., None]
    col = col * _rampa(rho, rp - borde, rp + borde)[..., None] + np.array((0.0015, 0.0009, 0.0006)) * (1 - _rampa(rho, rp - borde, rp + borde))[..., None]
    fuera = _rampa(rho, iris - borde, iris + borde)[..., None]
    col = col * (1 - fuera) + np.array(ESCLERA) * fuera
    img = bpy.data.images.get(nombre) or bpy.data.images.new(nombre, PX, PX, alpha=False)
    if tuple(img.size) != (PX, PX):
        img.scale(PX, PX)
    rgba = np.ones((PX, PX, 4), np.float32); rgba[..., :3] = _a_srgb(col)
    img.pixels.foreach_set(rgba.ravel()); img.update(); img.pack()
    return img


def _material(nombre, img):
    m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    m.use_nodes = True
    m.diffuse_color = (*ESCLERA, 1)
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.25
    return m


def _crear(cara, s, nombre, isla, c, r, desv, mat, piv, col):
    idx = {v: i for i, v in enumerate(isla)}
    V = [tuple((v.co - c).normalized() * r) for v in isla]      # sobre su esfera exacta: girando, ninguna irregularidad asoma por el párpado
    F = [[idx[w] for w in f.verts] for f in {f for v in isla for f in v.link_faces}]
    me = bpy.data.meshes.new(nombre); me.from_pydata(V, [], F); me.update()
    capa = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        p.use_smooth = True
        for li, vi in zip(p.loop_indices, p.vertices):
            q = me.vertices[vi].co
            capa.data[li].uv = (0.5 + (q.x - desv[0]) / (2 * ALCANCE * r), 0.5 + (q.z - desv[1]) / (2 * ALCANCE * r))
    me.materials.append(mat)
    o = bpy.data.objects.new(nombre, me); col.objects.link(o); o.parent = piv
    return o


def reutilizar(cara, color='castano', iris=IRIS, pupila=PUPILA):
    """saca los globos de la cara a <cara>_Ojo_Tripo_L/R colgados de los pivotes de siempre. La cara pierde esos vértices, nada más."""
    util.modo_objeto()
    n = MK.nombres(cara)
    if any(bpy.data.objects.get(n[k]) for k in ('ojos_raiz', 'piv_L', 'piv_R')):
        raise ValueError('Ya existen pivotes oculares: no se reemplazan automáticamente.')
    M = MK.Marco(cara)
    me = cara.data
    bm = bmesh.new(); bm.from_mesh(me)
    try:
        bm.verts.ensure_lookup_table()
        hallados = {}
        for s in ('L', 'R'):
            c, R = M.ojo(s)
            cand = _islas_cerca(bm, Vector(c), R)
            if not cand:
                return {'error': f'Ojo {s}: no hay un casquete de esfera suelto cerca del marcador.'}
            hallados[s] = max(cand, key=lambda t: len(t[0]))
        img = _pintar(f'{cara.name}_Iris_Tripo', color, iris, pupila)
        mat = _material(f'{cara.name}_Ojo_Tripo', img)
        col = util.coleccion(f'{cara.name} ojos')
        raiz = bpy.data.objects.new(n['ojos_raiz'], None); col.objects.link(raiz); raiz.parent = cara
        out = {}
        for s, (isla, (c, r, err)) in hallados.items():
            piv = bpy.data.objects.new(n['piv_' + s], None); col.objects.link(piv)
            piv.parent = raiz; piv.location = c; piv['rlb_escala'] = 1.0; piv.empty_display_size = r
            desv = _centro_iris(bm, isla, c, r)
            _crear(cara, s, f'{cara.name}_Globo_{s}', isla, c, r, desv, mat, piv, col)      # el editor busca «Globo» en el nombre
            out[s] = {'centro': [round(x, 4) for x in c], 'radio_mm': round(r * 1000, 2), 'desvio_max_mm': round(err * 1000, 2),
                      'vertices': len(isla), 'iris_desplazado_mm': [round(x * 1000, 2) for x in desv]}
        for isla, _ in hallados.values():
            bmesh.ops.delete(bm, geom=list(isla), context='VERTS')
        bm.to_mesh(me); me.update()
    finally:
        bm.free()
    d = MK.cfg(cara)
    d.update(pivotes=[n['piv_L'], n['piv_R']], ojos_raiz=n['ojos_raiz'], ojos_modo='EXISTENTES', ojos_abiertos=True, ojos_hueco=True,
             ojos_tripo={'color': color, 'iris': iris, 'pupila': pupila})
    MK.guardar_cfg(cara, d)
    bpy.context.view_layer.update()
    return out


def ajustar(cara, iris=None, pupila=None, color=None):
    """repinta la imagen del iris; la malla y la UV no cambian."""
    d = MK.cfg(cara); t = d['ojos_tripo']
    t.update({k: v for k, v in (('iris', iris), ('pupila', pupila), ('color', color)) if v is not None})
    _pintar(f'{cara.name}_Iris_Tripo', t['color'], t['iris'], t['pupila'])
    d['ojos_tripo'] = t; MK.guardar_cfg(cara, d)
    return dict(t)


def preparar(cara, aplicar=False, color='castano', iris=IRIS, pupila=PUPILA, K=4):
    """optimiza la órbita y deja los ojos listos antes del rig. aplicar=False: ensayo de preparar_parpados, malla intacta."""
    d = MK.cfg(cara)
    semilla = cara.data.vertices[d['seed']].co.copy() if aplicar and 'seed' in d else None
    r = {'parpados': PP.preparar(cara, aplicar=aplicar, conservar_globo=True)}
    if not aplicar or not r['parpados'].get('aplicado'):
        return r
    r['ojos'] = reutilizar(cara, color, iris, pupila)
    if 'error' not in r['ojos']:
        r['anillos'] = PP.reanillar(cara, aplicar=True, K=K)
    if semilla is not None:         # la topología nueva renumera los vértices: la semilla de la piel se busca por posición
        P = util.coords(cara.data)
        d = MK.cfg(cara); d['seed'] = int(np.argmin(np.linalg.norm(P - np.array(semilla), axis=1))); MK.guardar_cfg(cara, d)
        r['cejas'] = registrar_cejas(cara)
    if 'error' not in r['ojos']:
        r['uv_parpados'] = limpiar_uv_parpados(cara)
    return r


def limpiar_uv_parpados(cara, anillos=7, oscuro=0.62, claro=1.3, gris=0.16, vueltas=4):
    """el atlas de Tripo pinta el ojo y la línea de pestañas en la piel del pliegue: al cerrar, salían manchas negras y blancas sobre el
    párpado. Las esquinas UV de la banda del borde que caen en esa pintura se llevan a la piel limpia más cercana. No toca la geometría
    ni la imagen. Repetirlo no cambia nada. -> {lado: esquinas movidas}."""
    me = cara.data
    capa = me.uv_layers.active
    img = next((n.image for m in me.materials if m and m.use_nodes for n in m.node_tree.nodes
                if n.type == 'TEX_IMAGE' and n.image), None)
    if capa is None or img is None:
        return {}
    W, H = img.size
    px = np.zeros(W * H * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)[..., :3]
    def color(uv):
        uv = np.asarray(uv)
        return px[np.clip((uv[..., 1] % 1 * H).astype(int), 0, H - 1), np.clip((uv[..., 0] % 1 * W).astype(int), 0, W - 1)]
    UV = np.zeros(len(me.loops) * 2); capa.data.foreach_get('uv', UV); UV = UV.reshape(-1, 2)
    base = (me.shape_keys.reference_key.data if me.shape_keys else me.vertices)
    P = np.zeros(len(me.vertices) * 3); base.foreach_get('co', P); P = P.reshape(-1, 3)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    M = MK.Marco(cara); out = {}
    try:
        for s in ('L', 'R'):
            c, R = M.ojo(s); c = np.array(c)
            frente = {v for v in bm.verts if v.is_boundary and abs(np.linalg.norm(P[v.index] - c) - R) < 0.05 * R}
            usados = set(frente); capas = [frente]
            for _ in range(anillos + 3):
                capas.append({w for v in capas[-1] for f in v.link_faces for w in f.verts} - usados)
                usados |= capas[-1]
            banda = [v for a in capas[:anillos] for v in a]
            ref = np.median([color(UV[l.index]) for a in capas[anillos:] for v in a for l in v.link_loops], axis=0)
            lum0 = ref.mean()
            def sucio(col):
                lum = col.mean(-1); sat = (col.max(-1) - col.min(-1)) / np.maximum(col.max(-1), 1e-6)
                return (lum < oscuro * lum0) | (lum > claro * lum0) | (sat < gris)
            movidas = 0
            caras = {f for v in banda for f in v.link_faces}
            for _ in range(vueltas):
                limpios = [l.index for v in usados for l in v.link_loops if not sucio(color(UV[l.index]))]
                if not limpios:
                    break
                Q = np.array([P[me.loops[i].vertex_index] for i in limpios]); U = UV[limpios]
                hubo = 0
                for f in caras:
                    ls = [l.index for l in f.loops]
                    if sucio(color(UV[ls])).any() or sucio(color(UV[ls].mean(0))):
                        for i in ls:
                            if sucio(color(UV[i])) or sucio(color(UV[ls].mean(0))):
                                j = int(np.argmin(((Q - P[me.loops[i].vertex_index]) ** 2).sum(1)))
                                if (UV[i] != U[j]).any():
                                    UV[i] = U[j]; hubo += 1
                movidas += hubo
                if not hubo:
                    break
            out[s] = movidas
    finally:
        bm.free()
    capa.data.foreach_set('uv', UV.ravel()); me.update()
    return out


def registrar_cejas(cara):
    """reanillar suelta la ceja de la piel: ya es isla propia y se apunta en cfg['cejas'] (en la malla original salía -1)."""
    M = MK.Marco(cara)
    P = util.coords(cara.data); isl = util.islas(cara.data)
    d = MK.cfg(cara); cejas = dict(d.get('cejas') or {})
    piel = isl[d['seed']]
    for s in ('L', 'R'):
        c, R = M.ojo(s); c = np.array(c)
        mejor = None
        for k in np.unique(isl[np.linalg.norm(P - c, axis=1) < 2.5 * R]):
            q = P[isl == k]
            if k == piel or len(q) < PP.MIN_GLOBO or np.ptp(q[:, 0]) < 1.5 * R or q.mean(0)[2] < c[2]:
                continue
            if mejor is None or len(q) > (isl == mejor).sum():
                mejor = k
        if mejor is not None:
            cejas[s] = int(np.nonzero(isl == mejor)[0][0])
    d['cejas'] = cejas; MK.guardar_cfg(cara, d)
    return cejas
