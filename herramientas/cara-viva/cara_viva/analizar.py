"""Paso 0: analizar la malla de la cabeza y decir qué zonas conviene retopologizar.

Todo se mide en fracciones de la distancia entre ojos (IOD), así que los umbrales valen
para cualquier tamaño de personaje. No modifica la malla salvo ``corregir_seguras``.
"""
import bmesh
import numpy as np

from . import construir

VERDE, AMARILLO, ROJO = 0, 1, 2
NIVELES = ("bien", "revisar", "retopologizar")

# longitud media de arista (en IOD): (límite verde, límite amarillo)
UMBRAL_ARISTA = {"boca": (0.07, 0.12), "ojo": (0.05, 0.09), "nariz": (0.07, 0.12),
                 "frente": (0.12, 0.20), "mejilla": (0.12, 0.20), "mentón": (0.10, 0.18)}
MIN_VERTICES = {"boca": 60, "ojo": 25, "nariz": 20, "frente": 20, "mejilla": 25, "mentón": 12}


def _zonas(lm):
    u, x0 = lm["_iod"], lm["_x0"]
    ls, li = np.array(lm["LABIO_SUP"]), np.array(lm["LABIO_INF"])
    xcom = abs(lm["COMISURA.L"][0] - x0)
    zboca = 0.5 * (ls[2] + li[2])
    ceja_z = 0.5 * (lm["CEJA_INT.L"][2] + lm["CEJA_EXT.L"][2])
    ojo = np.array(lm["OJO.L"])
    return {
        "boca": ((x0, 0.5 * (ls[1] + li[1]), zboca), (1.3 * xcom, 0.9 * u, 0.55 * u)),
        "ojo L": (tuple(lm["OJO.L"]), (0.45 * u,) * 3),
        "ojo R": (tuple(lm["OJO.R"]), (0.45 * u,) * 3),
        "nariz": (tuple(lm["NARIZ"]), (0.4 * u, 0.5 * u, 0.45 * u)),
        "frente": ((x0, ojo[1], ceja_z + 0.45 * u), (1.0 * u, 0.9 * u, 0.5 * u)),
        "mejilla L": ((x0 + 0.9 * u, ojo[1], 0.5 * (ojo[2] + zboca)), (0.5 * u, 0.8 * u, 0.45 * u)),
        "mejilla R": ((x0 - 0.9 * u, ojo[1], 0.5 * (ojo[2] + zboca)), (0.5 * u, 0.8 * u, 0.45 * u)),
        "mentón": (tuple(lm["MENTON"]), (0.6 * u, 0.7 * u, 0.35 * u)),
    }


def _dentro(V, c, r):
    return ((((V - np.array(c)) / np.array(r)) ** 2).sum(axis=1)) <= 1.0


def _base(zona):
    return zona.split()[0]


def _lazos_frontera(bm, V, mascara):
    """Componentes conexas de aristas abiertas con ambos vértices dentro de la máscara."""
    adj = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts[0].index, e.verts[1].index
            if mascara[a] and mascara[b]:
                adj.setdefault(a, []).append(b)
                adj.setdefault(b, []).append(a)
    visto, lazos = set(), []
    for s in adj:
        if s in visto:
            continue
        pila, comp = [s], []
        while pila:
            x = pila.pop()
            if x in visto:
                continue
            visto.add(x)
            comp.append(x)
            pila.extend(y for y in adj[x] if y not in visto)
        lazos.append(comp)
    return lazos


def _caras_malas(bm, V, u, umbral_estirado=4.0):
    """Índices de triángulos muy estirados y de caras de área casi cero."""
    estirados, degeneradas = [], []
    for f in bm.faces:
        p = [V[v.index] for v in f.verts]
        if len(p) == 3:
            a, b, c = p
            l = [np.linalg.norm(b - a), np.linalg.norm(c - b), np.linalg.norm(a - c)]
            area = 0.5 * np.linalg.norm(np.cross(b - a, c - a))
            if area < 1e-9 * u * u:
                degeneradas.append(f.index)
            elif max(l) ** 2 / (2.0 * area) > umbral_estirado:
                estirados.append(f.index)
        else:
            area = sum(np.linalg.norm(np.cross(p[i] - p[0], p[i + 1] - p[0])) for i in range(1, len(p) - 1)) * 0.5
            if area < 1e-9 * u * u:
                degeneradas.append(f.index)
    return estirados, degeneradas


def analizar(malla, lm):
    """-> {"zonas": [...], "globales": [...], "peor": int, "marcas": {vértice: nivel}, "iod": u}."""
    u = lm["_iod"]
    V = construir._vertices_mundo(malla)
    bm = bmesh.new()
    try:
        bm.from_mesh(malla.data)
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        valencia = np.array([len(v.link_edges) for v in bm.verts])
        triangulos = sum(1 for f in bm.faces if len(f.verts) == 3) > 0.8 * max(1, len(bm.faces))
        es_polo = (valencia >= 8) | (valencia <= 3) if triangulos else (valencia >= 5)
        frontera_v = np.zeros(len(V), dtype=bool)
        for e in bm.edges:
            if e.is_boundary:
                frontera_v[e.verts[0].index] = frontera_v[e.verts[1].index] = True
        pares = np.array([(e.verts[0].index, e.verts[1].index) for e in bm.edges], dtype=np.int64).reshape(-1, 2)
        largo = np.linalg.norm(V[pares[:, 0]] - V[pares[:, 1]], axis=1) / u if len(pares) else np.zeros(0)
        estirados, degeneradas = _caras_malas(bm, V, u, 7.0 if triangulos else 4.0)
        cara_v = {}
        for fi in estirados:
            for v in bm.faces[fi].verts:
                cara_v[v.index] = True

        zonas, marcas = [], {}
        for nombre, (c, r) in _zonas(lm).items():
            m = _dentro(V, c, r)
            n = int(m.sum())
            base = _base(nombre)
            motivos, nivel, accion = [], VERDE, "sin cambios"
            if n == 0:
                zonas.append({"zona": nombre, "nivel": ROJO, "vertices": 0, "arista": 0.0,
                              "motivos": ["no hay malla en esta zona (¿puntos mal colocados?)"],
                              "accion": "revisa los puntos de referencia"})
                continue
            ar = largo[m[pares[:, 0]] & m[pares[:, 1]]]
            media = float(ar.mean()) if len(ar) else 9.0
            verde, amar = UMBRAL_ARISTA[base]
            if media > amar:
                nivel = ROJO
                motivos.append("aristas muy largas (%.3f IOD, límite %.2f)" % (media, amar))
            elif media > verde:
                nivel = max(nivel, AMARILLO)
                motivos.append("aristas algo largas (%.3f IOD, ideal ≤ %.2f)" % (media, verde))
            if n < MIN_VERTICES[base]:
                nivel = max(nivel, AMARILLO if n >= MIN_VERTICES[base] // 2 else ROJO)
                motivos.append("pocos vértices (%d, ideal ≥ %d)" % (n, MIN_VERTICES[base]))
            polos = int((es_polo & m & ~frontera_v).sum())
            if n and polos / n > 0.22:
                nivel = max(nivel, AMARILLO)
                motivos.append("muchos polos (vértices con valencia anómala: %d de %d)" % (polos, n))
            malos = sum(1 for v in cara_v if m[v])
            if n and malos / n > 0.08:
                nivel = max(nivel, AMARILLO)
                motivos.append("triángulos muy estirados (%d vértices implicados)" % malos)

            if base == "boca":
                lazos = _lazos_frontera(bm, V, m)
                if not lazos:
                    nivel = ROJO
                    motivos.append("la boca no tiene abertura: labios soldados")
                    accion = "abrir la boca (separar los labios) antes de construir"
                else:
                    cerca = [lz for lz in lazos if len(lz) >= 4]
                    if len(cerca) > 2:
                        nivel = ROJO
                        motivos.append("la abertura está hecha de %d piezas sueltas (debería ser 1 o 2 lazos)" % len(cerca))
                        accion = "unir los labios en un solo lazo continuo"
                    pequeños = [lz for lz in lazos if len(lz) < 4]
                    if pequeños:
                        nivel = max(nivel, AMARILLO)
                        motivos.append("%d fragmentos de borde abierto muy cortos" % len(pequeños))
                    if construir.detectar_rim(malla, V, lm) is None and len(cerca) <= 2:
                        nivel = max(nivel, AMARILLO)
                        motivos.append("no se pudo partir el lazo de la boca en labio superior e inferior")
                        accion = accion if nivel == ROJO else "comprobar comisuras y labios"
                if nivel == ROJO and accion == "sin cambios":
                    accion = "añadir bucles alrededor de la boca o rehacerla"
            elif base == "ojo":
                lazos = _lazos_frontera(bm, V, m)
                if not any(len(lz) >= 8 for lz in lazos):
                    nivel = max(nivel, AMARILLO)
                    motivos.append("párpados cerrados (ojo esculpido): al parpadear la malla se deformará, no se abrirá")
            if nivel != VERDE and accion == "sin cambios":
                accion = ("añadir bucles de aristas en la zona" if media > verde
                          else "ordenar el flujo de aristas (menos polos / triángulos)")
            for i in np.nonzero(m)[0]:
                marcas[int(i)] = max(marcas.get(int(i), 0), nivel)
            zonas.append({"zona": nombre, "nivel": nivel, "vertices": n, "arista": round(media, 4),
                          "motivos": motivos or ["densidad y flujo correctos"], "accion": accion})

        globales = []
        me = malla.data
        sueltos = sum(1 for v in bm.verts if not v.link_edges)
        no_var = sum(1 for e in bm.edges if len(e.link_faces) > 2)
        if degeneradas:
            globales.append({"nivel": AMARILLO, "texto": "%d caras de área cero (costuras degeneradas)" % len(degeneradas),
                             "arreglo": "corregir_seguras"})
        if sueltos:
            globales.append({"nivel": AMARILLO, "texto": "%d vértices sueltos" % sueltos, "arreglo": "corregir_seguras"})
        if no_var:
            globales.append({"nivel": AMARILLO, "texto": "%d aristas compartidas por más de 2 caras" % no_var, "arreglo": ""})
        if getattr(me, "has_custom_normals", False):
            globales.append({"nivel": AMARILLO, "texto": "normales personalizadas: se pueden ver costuras al deformar",
                             "arreglo": ""})
        if estirados:
            globales.append({"nivel": VERDE, "texto": "%d triángulos estirados en toda la malla" % len(estirados),
                             "arreglo": ""})
    finally:
        bm.free()
    peor = max([z["nivel"] for z in zonas] + [g["nivel"] for g in globales] + [VERDE])
    return {"zonas": zonas, "globales": globales, "peor": peor, "marcas": marcas, "iod": u,
            "caras": len(malla.data.polygons), "vertices": len(V)}


def marcar(malla, informe, nombre="cv_revisar"):
    """Grupo de vértices: 1.0 donde hay que retopologizar, 0.5 donde conviene revisar."""
    grupo = malla.vertex_groups.get(nombre) or malla.vertex_groups.new(name=nombre)
    grupo.remove(range(len(malla.data.vertices)))
    rojo = [i for i, n in informe["marcas"].items() if n == ROJO]
    amar = [i for i, n in informe["marcas"].items() if n == AMARILLO]
    if rojo:
        grupo.add(rojo, 1.0, "REPLACE")
    if amar:
        grupo.add(amar, 0.5, "REPLACE")
    return len(rojo), len(amar)


def corregir_seguras(malla):
    """Disuelve caras degeneradas y borra vértices sueltos. -> (caras, sueltos) eliminados."""
    bm = bmesh.new()
    try:
        bm.from_mesh(malla.data)
        antes_f = len(bm.faces)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges[:])
        sueltos = [v for v in bm.verts if not v.link_edges]
        bmesh.ops.delete(bm, geom=sueltos, context="VERTS")
        bm.to_mesh(malla.data)
        malla.data.update()
        return antes_f - len(bm.faces), len(sueltos)
    finally:
        bm.free()
