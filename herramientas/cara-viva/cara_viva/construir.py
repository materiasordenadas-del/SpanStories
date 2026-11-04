"""Construcción del rig facial estándar en Blender (rig, pesos, ojos, dientes, lengua).

Se parte de PUNTOS DE REFERENCIA que el usuario coloca sobre la cara (empties
``CV_*``). Con ellos se colocan los 29 huesos del estándar y se calculan los pesos
con campos de influencia, sin transferir pesos de otro personaje (ahí estaban
las trampas de los rigs anteriores: simetría, huesos conectados, pesos copiados).
"""
import json
from collections import deque

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from .nucleo import estandar

COLECCION_PUNTOS = "CaraViva_Puntos"
PREFIJO = "CV_"


# ------------------------------------------------------------ puntos (empties)

def coleccion_puntos(escena):
    col = bpy.data.collections.get(COLECCION_PUNTOS)
    if col is None:
        col = bpy.data.collections.new(COLECCION_PUNTOS)
        escena.collection.children.link(col)
    return col


def poner_punto(escena, nombre, mundo):
    """Crea o mueve el empty ``CV_<nombre>`` a la posición ``mundo``."""
    col = coleccion_puntos(escena)
    obj = bpy.data.objects.get(PREFIJO + nombre)
    if obj is None:
        obj = bpy.data.objects.new(PREFIJO + nombre, None)
        obj.empty_display_type = "SPHERE"
        obj.empty_display_size = 0.004
        obj.show_in_front = True
        col.objects.link(obj)
    obj.location = mundo
    return obj


def leer_puntos():
    """-> {nombre: (x, y, z) en mundo} de los empties existentes."""
    out = {}
    # las posiciones recién cambiadas por código no están en matrix_world hasta actualizar
    bpy.context.view_layer.update()
    for nombre in estandar.nombres_puntos():
        obj = bpy.data.objects.get(PREFIJO + nombre)
        if obj is not None:
            p = obj.matrix_world.translation
            out[nombre] = (p.x, p.y, p.z)
    return out


def puntos_desde_ojos(escena, ojo_l, ojo_r):
    """Pone OJO.L / OJO.R en el centro de las cajas de los globos oculares."""
    for obj, lado in ((ojo_l, "L"), (ojo_r, "R")):
        if obj is None:
            continue
        esq = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        c = sum(esq, Vector()) / 8.0
        poner_punto(escena, "OJO." + lado, c)


def comprobar_orientacion(lm):
    """El estándar exige que el personaje mire hacia -Y."""
    ojo_y = 0.5 * (lm["OJO.L"][1] + lm["OJO.R"][1])
    if not lm["NARIZ"][1] < ojo_y:
        raise ValueError("el personaje debe mirar hacia -Y (la nariz tiene que estar "
                         "más a -Y que los ojos). Gíralo antes de continuar.")
    if not lm["OJO.L"][0] > lm["OJO.R"][0]:
        raise ValueError("OJO.L debe estar en +X (la izquierda del personaje).")


# ------------------------------------------------------------------ pesos

def _suave(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _caida(V, c, r):
    d = np.sqrt(((V[:, 0] - c[0]) / r[0]) ** 2 + ((V[:, 1] - c[1]) / r[1]) ** 2
                + ((V[:, 2] - c[2]) / r[2]) ** 2)
    return _suave(1.0 - d)


def _islas(n, aristas):
    """Etiqueta de isla (componente conexa) por vértice."""
    padre = np.arange(n)

    def raiz(x):
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    for a, b in aristas.tolist():
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padre[ra] = rb
    return np.array([raiz(i) for i in range(n)])


def detectar_rim(malla, V, lm):
    """Borde real de la abertura de la boca: {"sup": [...], "inf": [...]} o None.

    Busca los lazos de aristas abiertas (frontera) junto a los labios. Si los dos
    labios forman un único lazo (boca cerrada, unidos en las comisuras) lo parte
    por los vértices más a izquierda y derecha; el arco más alto es el labio superior.
    """
    u, x0 = lm["_iod"], lm["_x0"]
    ls, li = np.array(lm["LABIO_SUP"]), np.array(lm["LABIO_INF"])
    xcom = abs(lm["COMISURA.L"][0] - x0)
    zc = 0.5 * (ls[2] + li[2])
    bm = bmesh.new()
    try:
        bm.from_mesh(malla.data)
        bm.edges.ensure_lookup_table()
        pares = [(e.verts[0].index, e.verts[1].index) for e in bm.edges if e.is_boundary]
    finally:
        bm.free()

    def en_boca(i):
        c = V[i]
        return abs(c[0] - x0) < 1.6 * xcom and abs(c[2] - zc) < 0.7 * u and c[1] < ls[1] + 0.5 * u

    adj = {}
    for a, b in pares:
        if en_boca(a) and en_boca(b):
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    if not adj:
        return None
    visto, lazos = set(), []
    for s0 in adj:
        if s0 in visto:
            continue
        pila, comp = [s0], []
        while pila:
            x = pila.pop()
            if x in visto:
                continue
            visto.add(x)
            comp.append(x)
            pila.extend(y for y in adj[x] if y not in visto)
        lazos.append(comp)
    ids = np.array(list(adj.keys()))
    vs = int(ids[np.argmin(np.linalg.norm(V[ids] - ls, axis=1))])
    vi = int(ids[np.argmin(np.linalg.norm(V[ids] - li, axis=1))])
    ls_lazo = next(l for l in lazos if vs in l)
    li_lazo = next(l for l in lazos if vi in l)
    if ls_lazo is not li_lazo:
        return {"sup": ls_lazo, "inf": li_lazo, "modo": "dos lazos"}
    lazo = ls_lazo
    if any(len(adj[v]) != 2 for v in lazo) or len(lazo) < 8:
        return None
    a = min(lazo, key=lambda i: V[i][0])
    b = max(lazo, key=lambda i: V[i][0])
    camino, prev, cur = [], a, adj[a][0]
    while cur != b and len(camino) <= len(lazo):
        camino.append(cur)
        nxt = [y for y in adj[cur] if y != prev]
        prev, cur = cur, nxt[0]
    arco1 = camino
    arco2 = [v for v in lazo if v not in set(arco1) and v not in (a, b)]
    if not arco1 or not arco2:
        return None
    z1 = np.mean([V[i][2] for i in arco1])
    z2 = np.mean([V[i][2] for i in arco2])
    sup, inf = (arco1, arco2) if z1 >= z2 else (arco2, arco1)
    return {"sup": sup, "inf": inf, "modo": "lazo unico", "esquinas": [a, b]}


def propagar_lados(n, aristas, rim, anillos=12):
    """BFS multifuente desde el borde de cada labio. -> (lado +1/-1/0, anillo)."""
    vecinos = [[] for _ in range(n)]
    for a, b in aristas.tolist():
        vecinos[a].append(b)
        vecinos[b].append(a)
    lado = np.zeros(n, dtype=np.int8)
    anillo = np.full(n, 10 ** 6, dtype=np.int32)
    q = deque()
    for i in rim["sup"]:
        lado[i], anillo[i] = 1, 0
        q.append(i)
    for i in rim["inf"]:
        lado[i], anillo[i] = -1, 0
        q.append(i)
    while q:
        x = q.popleft()
        if anillo[x] >= anillos:
            continue
        for y in vecinos[x]:
            if anillo[y] > anillo[x] + 1:
                anillo[y] = anillo[x] + 1
                lado[y] = lado[x]
                q.append(y)
    return lado, anillo


def calcular_pesos(V, aristas, huesos, lm, ajustes=None):
    """-> (dict hueso->pesos (N,), informe). ``V``: (N,3) vértices en mundo."""
    aj = {"suavizado": 2, "lambda": 0.35, "radio": 1.0, "pivote_parpado": 0.0, "cuello": True}
    aj.update(ajustes or {})
    u, x0 = lm["_iod"], lm["_x0"]
    n = len(V)
    ls, li = np.array(lm["LABIO_SUP"]), np.array(lm["LABIO_INF"])
    com = np.array(lm["COMISURA.L"])
    xcom = max(abs(com[0] - x0), 1e-6)
    zc = 0.5 * (ls[2] + li[2])
    dx = V[:, 0] - x0
    seam = zc + (com[2] - zc) * np.minimum(1.0, (np.abs(dx) / xcom) ** 2)
    sobre = _suave((V[:, 2] - seam) / (0.05 * u) + 0.5)       # 1 por encima de la comisura de los labios
    rim = aj.get("rim")
    mezcla_rim = np.zeros(n)
    lado_rim = np.zeros(n)
    if rim:
        lado_rim, anillo = propagar_lados(n, aristas, rim)
        cerca = (lado_rim != 0)
        # la topología manda cerca de la boca; lejos vuelve a mandar la altura
        mezcla_rim = np.where(cerca, np.clip(1.0 - anillo / 12.0, 0.0, 1.0), 0.0)
        por_topologia = (lado_rim > 0).astype(float)
        sobre = mezcla_rim * por_topologia + (1.0 - mezcla_rim) * sobre
    bajo = 1.0 - sobre
    R = aj["radio"]

    def r(a, b, c):
        return (a * u * R, b * u * R, c * u * R)

    def lado_ok(nombre):
        if nombre.endswith(".L"):
            return _suave(dx / (0.15 * u) + 0.5)
        if nombre.endswith(".R"):
            return _suave(-dx / (0.15 * u) + 0.5)
        return 1.0

    w = {}
    for nombre, d in huesos.items():
        base = nombre.split(".")[0]
        c = d["head"]
        if base == "cv_labio_sup":
            w[nombre] = _caida(V, c, r(0.20, 0.22, 0.22)) * sobre
        elif base == "cv_labio_sup_med":
            w[nombre] = _caida(V, c, r(0.20, 0.22, 0.22)) * sobre * lado_ok(nombre)
        elif base == "cv_labio_inf":
            w[nombre] = _caida(V, c, r(0.20, 0.22, 0.24)) * bajo
        elif base == "cv_labio_inf_med":
            w[nombre] = _caida(V, c, r(0.20, 0.22, 0.24)) * bajo * lado_ok(nombre)
        elif base == "cv_comisura":
            w[nombre] = 1.15 * _caida(V, c, r(0.30, 0.30, 0.30)) * lado_ok(nombre)
        elif base in ("cv_ceja_int", "cv_ceja_med", "cv_ceja_ext"):
            # la ceja es una línea: se pesa por distancia al segmento interior-exterior,
            # así un punto colocado unos milímetros fuera de la pieza sigue funcionando
            lado = nombre[-1]
            ci = np.array(huesos["cv_ceja_int." + lado]["head"])
            ce = np.array(huesos["cv_ceja_ext." + lado]["head"])
            seg = ce - ci
            largo2 = max(float(seg @ seg), 1e-12)
            t = ((V - ci) @ seg) / largo2
            proy = ci + np.clip(t, -0.2, 1.2)[:, None] * seg
            perp = np.linalg.norm(V - proy, axis=1)
            pos = {"cv_ceja_int": 0.0, "cv_ceja_med": 0.5, "cv_ceja_ext": 1.0}[base]
            w[nombre] = (_suave(1.0 - perp / (0.30 * u * R)) * _suave(1.0 - np.abs(t - pos) / 0.62)
                         * lado_ok(nombre))
        elif base == "cv_mejilla":
            w[nombre] = _caida(V, c, r(0.42, 0.50, 0.40)) * lado_ok(nombre)
        elif base == "cv_nariz":
            w[nombre] = _caida(V, c, r(0.16, 0.20, 0.16)) * lado_ok(nombre)
        elif base in ("cv_parpado_sup", "cv_parpado_inf"):
            piv = np.array(c) + np.array([0.0, 0.0, aj["pivote_parpado"] * u])
            dd = np.sqrt(((V[:, 0] - piv[0]) / (0.65 * u * R)) ** 2 + ((V[:, 2] - piv[2]) / (0.55 * u * R)) ** 2)
            dy = np.abs(V[:, 1] - c[1]) < 0.6 * u
            if base == "cv_parpado_sup":
                mitad = _suave((V[:, 2] - (c[2] - 0.03 * u)) / (0.06 * u) + 0.5)
            else:
                mitad = _suave(((c[2] + 0.03 * u) - V[:, 2]) / (0.06 * u) + 0.5)
            w[nombre] = _suave(1.0 - dd) * mitad * dy * lado_ok(nombre)
    # reparto entre lo que cuelga de la mandíbula (labio inferior) y el resto
    A = sum((v for k, v in w.items() if k.startswith("cv_labio_inf")), np.zeros(n))
    B = sum((v for k, v in w.items() if not k.startswith("cv_labio_inf")), np.zeros(n))
    S = A + B
    f = np.where(S > 1.0, 1.0 / np.maximum(S, 1e-9), 1.0)
    T = np.minimum(S, 1.0)
    for k in w:
        w[k] = w[k] * f
    # las comisuras acompañan a la mandíbula en parte (como en una cara real)
    extra_mand = np.zeros(n)
    for k in list(w):
        if k.startswith("cv_comisura"):
            extra_mand += 0.25 * w[k]
            w[k] = 0.75 * w[k]

    piv = np.array(huesos["cv_mandibula"]["head"])
    mand = np.array(lm["MANDIBULA.L"])
    xj = abs(mand[0] - x0)
    J = _suave((seam - V[:, 2]) / (0.30 * u) + 0.33)
    J *= _suave((piv[1] - V[:, 1]) / (0.5 * u) + 0.5)
    J *= _suave((xj + 0.45 * u - np.abs(dx)) / (0.55 * u))
    # bajo la barbilla la piel se estira hacia el cuello: la mandíbula se apaga en 0,9 IOD
    J *= 1.0 - _suave((lm["MENTON"][2] - V[:, 2]) / (0.9 * u))
    if rim:
        # junto a la boca la mandíbula es del labio de abajo, nunca del de arriba
        J = mezcla_rim * (lado_rim < 0).astype(float) + (1.0 - mezcla_rim) * J
    J = np.clip(J, 0.0, 1.0)
    w["cv_mandibula"] = (1.0 - T) * J + extra_mand
    w["cv_cabeza"] = (1.0 - T) * (1.0 - J)

    names = list(w.keys())
    W = np.stack([w[k] for k in names], axis=1)
    # lo que queda muy atrás (cráneo, nuca) no se deforma
    lejos = V[:, 1] > piv[1] + 0.35 * u
    W[lejos, :] = 0.0
    W[lejos, names.index("cv_cabeza")] = 1.0
    # piezas sueltas dentro de la boca (dientes, encías, lengua fusionados en la malla):
    # se mueven rígidas, arriba con la cabeza y abajo con la mandíbula
    fijos = lejos.copy()
    interior = 0
    if aj.get("interior_boca", True) and len(aristas):
        etiq = _islas(n, aristas)
        i_cab, i_man = names.index("cv_cabeza"), names.index("cv_mandibula")
        for e in np.unique(etiq):
            idx = np.nonzero(etiq == e)[0]
            if len(idx) > 8000 or len(idx) < 12:
                continue
            c = V[idx].mean(axis=0)
            p = V[idx]
            # la pieza entera debe caber dentro de la boca; una isla que abarca más
            # (la cara frontal, los labios) es piel y se deforma
            dentro = (p[:, 0].max() - x0 < 1.15 * xcom and x0 - p[:, 0].min() < 1.15 * xcom
                      and p[:, 2].min() > li[2] - 0.9 * u and p[:, 2].max() < ls[2] + 0.9 * u
                      and p[:, 1].min() > ls[1] - 0.35 * u)
            if dentro:
                W[idx, :] = 0.0
                W[idx, i_cab if c[2] >= zc else i_man] = 1.0
                fijos[idx] = True
                interior += 1
    # suavizado de pesos por la topología
    if aj["suavizado"] and len(aristas):
        e0, e1 = aristas[:, 0], aristas[:, 1]
        deg = np.bincount(np.concatenate([e0, e1]), minlength=n).astype(float)
        libres = (~fijos) & (deg > 0)
        for _ in range(aj["suavizado"]):
            acum = np.zeros_like(W)
            np.add.at(acum, e0, W[e1])
            np.add.at(acum, e1, W[e0])
            media = acum / np.maximum(deg, 1.0)[:, None]
            W[libres] = (1 - aj["lambda"]) * W[libres] + aj["lambda"] * media[libres]
    s = W.sum(axis=1, keepdims=True)
    W = np.where(s > 1e-9, W / np.maximum(s, 1e-9), 0.0)
    W[W < 0.004] = 0.0
    s = W.sum(axis=1, keepdims=True)
    sin = (s[:, 0] < 1e-9)
    W[sin, names.index("cv_cabeza")] = 1.0
    s = W.sum(axis=1, keepdims=True)
    W = W / s
    if aj["cuello"]:
        # cuerpo completo: por debajo de la barbilla el peso se apaga; ahí manda el rig del cuerpo
        zc_m = lm["MENTON"][2]
        W *= _suave((V[:, 2] - (zc_m - 1.0 * u)) / (0.7 * u))[:, None]
    informe = {"vertices": int(n), "sin_peso_propio": int(sin.sum()), "piezas_interior_boca": int(interior),
               "rim": (rim or {}).get("modo", "no detectado"),
               "huesos_con_peso": {k: int((W[:, i] > 0.5).sum()) for i, k in enumerate(names) if (W[:, i] > 0.5).any()}}
    return {k: W[:, i] for i, k in enumerate(names)}, informe


def asignar_pesos(malla, pesos):
    """Escribe los grupos de vértices de ``malla`` (borra los de los huesos cv_)."""
    for vg in list(malla.vertex_groups):
        if vg.name.startswith("cv_"):
            malla.vertex_groups.remove(vg)
    grupos = {k: malla.vertex_groups.new(name=k) for k in pesos}
    n = len(malla.data.vertices)
    for k, arr in pesos.items():
        idx = np.nonzero(arr > 0)[0]
        g = grupos[k]
        for i in idx.tolist():
            g.add([i], float(arr[i]), "REPLACE")
    return n


def _aristas(malla):
    me = malla.data
    a = np.empty(len(me.edges) * 2, dtype=np.int32)
    me.edges.foreach_get("vertices", a)
    return a.reshape(-1, 2)


def _vertices_mundo(malla):
    me = malla.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(malla.matrix_world)
    return co @ m[:3, :3].T + m[:3, 3]


# -------------------------------------------------------------------- rig

def _modificador_armature(malla, rig):
    for m in malla.modifiers:
        if m.type == "ARMATURE" and m.object == rig:
            return m
    m = malla.modifiers.new("CaraViva", "ARMATURE")
    m.object = rig
    # primero en la pila: la deformación esquelética va antes de suavizados.
    # API de datos, no el operador: el operador actúa sobre el objeto ACTIVO (el rig) y
    # devolvía CANCELLED sin error, así que el bucle no acababa nunca.
    malla.modifiers.move(list(malla.modifiers).index(m), 0)
    return m


def _rigido(obj, rig, hueso):
    """Todo el objeto (ojo, dientes) sigue a un solo hueso."""
    for vg in list(obj.vertex_groups):
        if vg.name.startswith("cv_"):
            obj.vertex_groups.remove(vg)
    g = obj.vertex_groups.new(name=hueso)
    g.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    _modificador_armature(obj, rig)


def construir(contexto, malla, lm_mundo, nombre="CaraViva_Rig", ojos=(None, None),
              dientes_sup=None, dientes_inf=None, lengua=None, ajustes=None):
    """Crea el armature y los pesos. -> (objeto armature, informe)."""
    lm = estandar.completar(lm_mundo)
    comprobar_orientacion(lm)
    huesos = estandar.colocar(lm)
    escena = contexto.scene

    if bpy.data.objects.get(nombre) is not None:
        raise ValueError("ya existe el objeto %s; bórralo o usa otro nombre" % nombre)
    datos = bpy.data.armatures.new(nombre)
    rig = bpy.data.objects.new(nombre, datos)
    escena.collection.objects.link(rig)
    contexto.view_layer.objects.active = rig
    rig.select_set(True)
    datos.display_type = "OCTAHEDRAL"
    rig.show_in_front = True

    bpy.ops.object.mode_set(mode="EDIT")
    try:
        pend = dict(huesos)
        creados = {}
        while pend:
            listos = [k for k, d in pend.items() if d["parent"] is None or d["parent"] in creados]
            if not listos:
                raise ValueError("ciclo de padres en el estándar")
            for k in listos:
                d = pend.pop(k)
                eb = datos.edit_bones.new(k)
                eb.head = Vector(d["head"])
                eb.tail = Vector(d["tail"])
                eb.roll = 0.0
                if d["parent"]:
                    eb.parent = creados[d["parent"]]
                eb.use_connect = False
                creados[k] = eb
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"

    rig["cv_version"] = 1
    rig["cv_iod"] = float(lm["_iod"])
    rig["cv_x0"] = float(lm["_x0"])
    rig["cv_malla"] = malla.name
    rig["cv_puntos"] = json.dumps({k: list(v) for k, v in lm.items() if isinstance(v, tuple)})
    rig["cv_ganancias"] = "{}"

    informe = reponderar(malla, rig, lm, huesos, ajustes)

    for obj, hueso in ((ojos[0], "cv_ojo.L"), (ojos[1], "cv_ojo.R"),
                       (dientes_sup, "cv_cabeza"), (dientes_inf, "cv_mandibula")):
        if obj is not None:
            _rigido(obj, rig, hueso)
    if lengua is not None:
        _pesar_lengua(lengua, rig, huesos)
    informe["huesos"] = len(huesos)
    return rig, informe


def reponderar(malla, rig, lm, huesos=None, ajustes=None):
    """Recalcula los pesos de la cabeza (útil tras mover un punto)."""
    huesos = huesos or estandar.colocar(lm)
    V = _vertices_mundo(malla)
    ajustes = dict(ajustes or {})
    if ajustes.get("rim_topologico", True):
        ajustes["rim"] = detectar_rim(malla, V, lm)
    pesos, informe = calcular_pesos(V, _aristas(malla), huesos, lm, ajustes)
    asignar_pesos(malla, pesos)
    _modificador_armature(malla, rig)
    return informe


def _pesar_lengua(lengua, rig, huesos):
    for vg in list(lengua.vertex_groups):
        if vg.name.startswith("cv_"):
            lengua.vertex_groups.remove(vg)
    ys = [huesos["cv_lengua.%d" % i]["head"][1] for i in (1, 2, 3)]
    me = lengua.data
    m = lengua.matrix_world
    grupos = [lengua.vertex_groups.new(name="cv_lengua.%d" % i) for i in (1, 2, 3)]
    for v in me.vertices:
        y = (m @ v.co).y
        # y decrece hacia la punta; reparto lineal entre huesos vecinos
        if y >= ys[0]:
            reparto = {0: 1.0}
        elif y <= ys[2]:
            reparto = {2: 1.0}
        elif y >= ys[1]:
            t = (ys[0] - y) / (ys[0] - ys[1]); reparto = {0: 1 - t, 1: t}
        else:
            t = (ys[1] - y) / (ys[1] - ys[2]); reparto = {1: 1 - t, 2: t}
        for i, wt in reparto.items():
            grupos[i].add([v.index], wt, "REPLACE")
    _modificador_armature(lengua, rig)


def borrar_rig(rig):
    """Quita el armature y los grupos cv_ de sus mallas (para reconstruir)."""
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for m in list(obj.modifiers):
            if m.type == "ARMATURE" and m.object == rig:
                obj.modifiers.remove(m)
        for vg in list(obj.vertex_groups):
            if vg.name.startswith("cv_"):
                obj.vertex_groups.remove(vg)
    bpy.data.objects.remove(rig, do_unlink=True)


def distancia_ojos(rig):
    return float(rig["cv_iod"])
