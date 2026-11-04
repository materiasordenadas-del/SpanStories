"""Identidades persistentes para detectar ediciones de topología palpebral.

La reubicación automática requiere resolver y validar el nuevo contorno antes
de escribir anclas o deformaciones. Este módulo no modifica esas estructuras.
"""
import json
import hashlib
import numpy as np
import bpy

ATR_VERTICE = 'rlb_id_vertice_persistente'
ATR_CARA = 'rlb_id_cara_persistente'
ATR_ISLA = 'rlb_isla_uv_persistente'
ESTADO = 'rlb_seguimiento_parpados'
AVISO = 'rlb_seguimiento_aviso'
_modos = {}
_pendientes = {}


def _firma(me, vi, fi):
    h = hashlib.sha256()
    for poly, ident in zip(me.polygons, fi):
        h.update(np.asarray([ident, len(poly.vertices)], dtype=np.int32).tobytes())
        h.update(vi[list(poly.vertices)].tobytes())
    return h.hexdigest()


def _componentes(me):
    parent = list(range(len(me.vertices))); usado = set()
    def raiz(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for face in me.polygons:
        vs = list(face.vertices); usado.update(vs)
        for v in vs[1:]:
            a, b = raiz(vs[0]), raiz(v)
            if a != b: parent[b] = a
    return {v: raiz(v) for v in usado}


def _ids(mesh, nombre, dominio, cantidad, crear=False):
    attr = mesh.attributes.get(nombre)
    if attr is None:
        if not crear:
            raise RuntimeError(f'Falta el atributo de identidad {nombre}')
        attr = mesh.attributes.new(nombre, 'INT', dominio)
        attr.data.foreach_set('value', np.arange(1, cantidad + 1, dtype=np.int32))
    if attr.domain != dominio or attr.data_type != 'INT' or len(attr.data) != cantidad:
        raise RuntimeError(f'El atributo {nombre} no es compatible')
    out = np.empty(cantidad, dtype=np.int32); attr.data.foreach_get('value', out)
    if np.any(out <= 0) or len(np.unique(out)) != cantidad:
        # Subdividir, extruir o duplicar copia/interpola el ID en los elementos nuevos: conserva el primero
        # (el original, de menor índice) y da IDs frescos al resto en lugar de perder el seguimiento.
        _, primero = np.unique(out, return_index=True)
        nuevo = np.ones(cantidad, dtype=bool); nuevo[primero] = False
        nuevo |= out <= 0
        out[nuevo] = np.arange(max(int(out.max()), 0) + 1, max(int(out.max()), 0) + 1 + int(nuevo.sum()), dtype=np.int32)
        attr.data.foreach_set('value', out)
    return out


def preparar(cara):
    """Registra IDs de vértices y caras e índices que no pueden sobrevivir renumeración."""
    if cara.type != 'MESH' or cara.mode != 'OBJECT':
        raise RuntimeError('Selecciona una malla en modo objeto')
    me = cara.data
    if me.users != 1:
        raise RuntimeError('La malla está compartida; no se instala seguimiento')
    raw = cara.get('rlb_borde_parpado', '{}')
    bordes = json.loads(raw) if isinstance(raw, str) else dict(raw)
    anclas = {k: int(v) for k, v in dict(cara.get('aj_anclas', {})).items()}
    superficies = cara.get('aj_superficies_labios', {})
    superficies = superficies.to_dict() if hasattr(superficies, 'to_dict') else dict(superficies)
    semillas = list(map(int, cara.get('rlb_parpados_uv_seeds', [])))
    delineado = json.loads(cara.get('rlb_delineado_caras') or '[]')
    n, f = len(me.vertices), len(me.polygons)
    if not bordes or any(not 0 <= int(i) < n for valores in bordes.values() for i in valores):
        raise RuntimeError('Los bordes palpebrales no son válidos')
    if any(not 0 <= i < n for i in anclas.values()) or any(not 0 <= int(i) < n for d in superficies.values() for i in d.get('tri', [])) or any(not 0 <= int(i) < f for i in semillas + delineado):
        raise RuntimeError('Una referencia facial no es válida')
    vi = _ids(me, ATR_VERTICE, 'POINT', n, crear=True)
    fi = _ids(me, ATR_CARA, 'FACE', f, crear=True)
    grupos = _islas_uv(me) if semillas else np.zeros(f, dtype=np.int32)
    isla = me.attributes.get(ATR_ISLA) or me.attributes.new(ATR_ISLA, 'INT', 'FACE')
    if isla.domain != 'FACE' or isla.data_type != 'INT':
        raise RuntimeError('El atributo de islas UV no es compatible')
    isla.data.foreach_set('value', grupos)
    from . import ajustes_ojos as AO, mascaras_parpados as MP
    if me.shape_keys:
        p = AO._co(me.shape_keys.reference_key)
    else:
        p = np.empty(n * 3); me.vertices.foreach_get('co', p); p = p.reshape(-1, 3)
    adj = [[] for _ in range(n)]
    for edge in me.edges:
        a, b = edge.vertices; dist = float(np.linalg.norm(p[a] - p[b]))
        adj[a].append((b, dist)); adj[b].append((a, dist))
    posiciones = {}
    for zona, ids in bordes.items():
        arc, dist = MP._arco(p, adj, ids)
        for i in range(1, AO.MAX_PUNTOS + 1):
            punto = 'parpado_' + zona.split('_')[0] + '_' + str(i) + '_' + zona[-1]
            if punto in anclas and anclas[punto] in arc:
                posiciones[punto] = float(dist[np.where(arc == anclas[punto])[0][0]] / dist[-1])
    ganancias = {}
    if me.shape_keys:
        base = AO._co(me.shape_keys.reference_key)
        for nombre in AO.NOMBRES:
            punto = nombre[3:].rsplit('_', 1)[0]
            if nombre in me.shape_keys.key_blocks and punto in anclas:
                ganancias[nombre] = float(np.linalg.norm((AO._co(me.shape_keys.key_blocks[nombre]) - base)[anclas[punto]]))
    componentes = _componentes(me); piel = {}
    for s in ('L', 'R'):
        ids = list(bordes.get('sup_'+s, [])) + list(bordes.get('inf_'+s, []))
        if not ids: continue
        presentes = [componentes[int(i)] for i in ids if int(i) in componentes]
        if not presentes: raise RuntimeError(f'El borde del ojo {s} no pertenece a una superficie')
        principal = max(set(presentes), key=presentes.count)
        q = p[ids]; ancho = float(np.ptp(q[:, 0])); centro = q.mean(axis=0)
        piel[s] = [int(vi[i]) for i, c in componentes.items() if c == principal and
                   abs(p[i, 0]-centro[0]) <= .85*ancho and abs(p[i, 2]-centro[2]) <= 1.1*ancho and abs(p[i, 1]-centro[1]) <= .8*ancho]
    centros = {s: p[bordes['sup_'+s] + bordes.get('inf_'+s, [])].mean(axis=0) for s in ('L', 'R') if 'sup_'+s in bordes}
    lados_semillas = []
    for idx in semillas:
        pos = p[list(me.polygons[idx].vertices)].mean(axis=0)
        lados_semillas.append(min(centros, key=lambda s: np.linalg.norm(centros[s] - pos)) if centros else '')
    datos = {'version': 1, 'vertices': n, 'caras': f, 'firma': _firma(me, vi, fi),
             'bordes': {k: [int(vi[int(i)]) for i in v] for k, v in bordes.items()},
             'borde_pos': {k: [p[int(i)].tolist() for i in v] for k, v in bordes.items()},
             'anclas': {k: int(vi[v]) for k, v in anclas.items()},
             'superficies': {k: {'tri': [int(vi[int(i)]) for i in d['tri']], 'w': list(d['w'])} for k, d in superficies.items()},
             'semillas': [int(fi[i]) for i in semillas], 'islas_semillas': [int(grupos[i]) for i in semillas],
             'lados_semillas': lados_semillas, 'delineado': [int(fi[int(i)]) for i in delineado],
             'posiciones': posiciones, 'ganancias': ganancias, 'piel': piel}
    cara[ESTADO] = json.dumps(datos, sort_keys=True)
    return {'vertices': n, 'caras': f, 'bordes': len(bordes)}


def _islas_uv(me):
    uv = me.uv_layers.active
    if not uv:
        raise RuntimeError('Faltan UV para conservar las semillas')
    aristas = {}; vecinos = [[] for _ in me.polygons]
    for poly in me.polygons:
        loops = list(poly.loop_indices)
        for a, b in zip(loops, loops[1:] + loops[:1]):
            va, vb = me.loops[a].vertex_index, me.loops[b].vertex_index
            ua = tuple(float(x) for x in uv.data[a].uv); ub = tuple(float(x) for x in uv.data[b].uv)
            key = tuple(sorted((va, vb))); actuales = {va: ua, vb: ub}
            for otra, anteriores in aristas.get(key, []):
                if all(abs(actuales[v][axis] - anteriores[v][axis]) <= 1e-6 for v in key for axis in (0, 1)):
                    vecinos[poly.index].append(otra); vecinos[otra].append(poly.index)
            aristas.setdefault(key, []).append((poly.index, actuales))
    grupos = np.zeros(len(me.polygons), dtype=np.int32); numero = 0
    for i in range(len(grupos)):
        if grupos[i]: continue
        numero += 1; grupos[i] = numero; pila = [i]
        while pila:
            for j in vecinos[pila.pop()]:
                if not grupos[j]: grupos[j] = numero; pila.append(j)
    return grupos


def detectar(cara, verificar_firma=False):
    """Conteo barato; verificar_firma se reserva para la salida del modo edición."""
    raw = cara.get(ESTADO)
    if not raw:
        return {'preparado': False, 'cambio': False}
    datos = json.loads(raw)
    me = cara.data
    cambio = len(me.vertices) != datos['vertices'] or len(me.polygons) != datos['caras']
    if verificar_firma and not cambio:
        v = _ids(me, ATR_VERTICE, 'POINT', len(me.vertices))
        f = _ids(me, ATR_CARA, 'FACE', len(me.polygons))
        cambio = _firma(me, v, f) != datos['firma']
    return {'preparado': True, 'cambio': cambio}


def referencias_supervivientes(cara):
    """Devuelve equivalencias, sin aplicarlas; rechaza pérdidas no oculares."""
    datos = json.loads(cara[ESTADO]); me = cara.data
    v = _ids(me, ATR_VERTICE, 'POINT', len(me.vertices))
    f = _ids(me, ATR_CARA, 'FACE', len(me.polygons))
    vm = {int(x): i for i, x in enumerate(v)}; fm = {int(x): i for i, x in enumerate(f)}
    anclas = {}
    for nombre, ident in datos['anclas'].items():
        if ident in vm:
            anclas[nombre] = vm[ident]
        elif not nombre.startswith('parpado_'):
            raise RuntimeError(f'Se perdió el ancla facial {nombre}')
    superficies = {}
    if datos['superficies']:
        me.calc_loop_triangles()
        triangulos = {tuple(sorted(t.vertices)) for t in me.loop_triangles}
    for nombre, d in datos['superficies'].items():
        if any(ident not in vm for ident in d['tri']):
            raise RuntimeError(f'Se perdió la superficie labial {nombre}')
        superficies[nombre] = {'tri': [vm[ident] for ident in d['tri']], 'w': d['w']}
        if tuple(sorted(superficies[nombre]['tri'])) not in triangulos:
            raise RuntimeError(f'Se perdió la cara de la superficie labial {nombre}')
    isla = me.attributes.get(ATR_ISLA)
    grupos = np.empty(len(me.polygons), dtype=np.int32)
    if not isla or isla.domain != 'FACE' or isla.data_type != 'INT':
        raise RuntimeError('Se perdió la identidad de las islas UV')
    isla.data.foreach_get('value', grupos)
    semillas = []
    lados = datos.get('lados_semillas', [''] * len(datos['semillas']))
    grupos_actuales = _islas_uv(me) if any(ident not in fm for ident in datos['semillas']) else None
    for ident, grupo, lado in zip(datos['semillas'], datos['islas_semillas'], lados):
        if ident in fm:
            semillas.append(fm[ident]); continue
        candidatas = np.flatnonzero(grupos == grupo)
        if grupo == 0 or not len(candidatas):
            raise RuntimeError('Se perdió la isla UV de una semilla palpebral')
        piel = set(datos.get('piel', {}).get(lado, []))
        fragmentos = {}
        for i in candidatas:
            if any(int(v[j]) in piel for j in me.polygons[int(i)].vertices):
                fragmentos.setdefault(int(grupos_actuales[i]), []).append(int(i))
        if len(fragmentos) != 1:
            raise RuntimeError('La isla UV de la semilla se dividió de forma ambigua')
        semillas.append(next(iter(fragmentos.values()))[0])
    return {'anclas': anclas, 'superficies': superficies,
            'semillas': semillas,
            'delineado': [fm[ident] for ident in datos.get('delineado', []) if ident in fm],
            'bordes': {k: [vm[ident] for ident in ids if ident in vm] for k, ids in datos['bordes'].items()}}


def _ciclos(me):
    incidencias = {}
    for poly in me.polygons:
        v = list(poly.vertices)
        for a, b in zip(v, v[1:] + v[:1]):
            e = tuple(sorted((a, b))); incidencias[e] = incidencias.get(e, 0) + 1
    adj = {}
    for (a, b), count in incidencias.items():
        if count == 1:
            adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    restantes = set(adj); ciclos = []
    while restantes:
        seed = next(iter(restantes)); pila = [seed]; comp = set()
        while pila:
            a = pila.pop()
            if a in comp: continue
            comp.add(a); pila.extend(adj[a])
        restantes.difference_update(comp)
        if len(comp) < 6 or any(len(adj[a]) != 2 for a in comp):
            continue
        orden = [seed]; anterior = -1; actual = seed
        while True:
            siguiente = next(x for x in adj[actual] if x != anterior)
            if siguiente == seed: break
            if siguiente in orden: break
            orden.append(siguiente); anterior, actual = actual, siguiente
        if len(orden) == len(comp): ciclos.append(orden)
    return ciclos


def _arcos(ciclo, p):
    izquierda = min(range(len(ciclo)), key=lambda i: p[ciclo[i], 0])
    derecha = max(range(len(ciclo)), key=lambda i: p[ciclo[i], 0])
    ciclo = ciclo[izquierda:] + ciclo[:izquierda]
    derecha = ciclo.index(max(ciclo, key=lambda v: p[v, 0]))
    a = ciclo[:derecha+1]; b = [ciclo[0]] + list(reversed(ciclo[derecha:]))
    if min(len(a), len(b)) < 5:
        raise RuntimeError('El nuevo borde no tiene suficientes vértices por párpado')
    if np.mean(p[a, 2]) < np.mean(p[b, 2]): a, b = b, a
    return {'sup': a, 'inf': b}


def resolver(cara):
    """Planifica nuevo contorno y referencias sin modificar geometría ni metadatos."""
    from . import ajustes_ojos as AO
    if cara.mode != 'OBJECT': raise RuntimeError('Termina la edición antes de seguir los párpados')
    datos = json.loads(cara[ESTADO]); refs = referencias_supervivientes(cara)
    if len(datos.get('posiciones', {})) < 6 or not datos.get('ganancias'):
        raise RuntimeError('El seguimiento debe prepararse antes de editar')
    p = AO._co(cara.data.shape_keys.reference_key); ciclos = _ciclos(cara.data)
    componentes = _componentes(cara.data)
    vi = _ids(cara.data, ATR_VERTICE, 'POINT', len(cara.data.vertices))
    inverso = {int(v): i for i, v in enumerate(vi)}
    bordes = {}; anclas = dict(refs['anclas'])
    for s in ('L', 'R'):
        nombres = [f'{lab}_{s}' for lab in ('sup', 'inf')]
        if any(n not in datos['borde_pos'] for n in nombres): continue
        viejo = np.asarray(datos['borde_pos'][nombres[0]] + datos['borde_pos'][nombres[1]])
        ancho = float(np.ptp(viejo[:, 0])); centro = viejo.mean(axis=0)
        if ancho <= 1e-8: raise RuntimeError('El borde anterior no define el ojo')
        sobrevivientes = [componentes[inverso[i]] for i in datos.get('piel', {}).get(s, []) if i in inverso and inverso[i] in componentes]
        if not sobrevivientes: raise RuntimeError(f'No queda una superficie identificable del ojo {s}')
        principal = max(set(sobrevivientes), key=sobrevivientes.count)
        candidatos = []
        for ciclo in ciclos:
            if componentes.get(ciclo[0]) != principal: continue
            q = p[ciclo]
            if (np.min(q[:, 0]) < np.min(viejo[:, 0])-.35*ancho or np.max(q[:, 0]) > np.max(viejo[:, 0])+.35*ancho or
                    np.max(np.abs(q[:, 2]-centro[2])) > 1.1*ancho or np.max(np.abs(q[:, 1]-centro[1])) > .8*ancho): continue
            try: arcos = _arcos(ciclo, p)
            except RuntimeError: continue
            dist = np.linalg.norm(q[:, None, :] - viejo[None, :, :], axis=2)
            score = float(np.mean(np.min(dist, axis=1)))
            if score < .45*ancho: candidatos.append((score, arcos))
        candidatos.sort(key=lambda x: x[0])
        if not candidatos or (len(candidatos) > 1 and candidatos[1][0] - candidatos[0][0] < .03*ancho):
            raise RuntimeError(f'El contorno del ojo {s} es ambiguo o inexistente')
        for lab, arco in candidatos[0][1].items():
            bordes[f'{lab}_{s}'] = arco
            dist = np.r_[0., np.cumsum(np.linalg.norm(np.diff(p[arco], axis=0), axis=1))]; u = dist/dist[-1]
            disponibles = list(range(1, len(arco)-1)); elegidos = []
            npts = AO.npuntos(datos['anclas'], lab, s)
            for i in range(1, npts + 1):
                punto = f'parpado_{lab}_{i}_{s}'
                if punto not in datos['posiciones']: raise RuntimeError(f'Falta la posición anterior de {punto}')
                limite = elegidos[-1] if elegidos else 0
                opciones = [j for j in disponibles if j > limite and j < len(arco)-1-(npts-i)]
                if not opciones: raise RuntimeError('No se pueden separar las anclas del párpado')
                elegido = min(opciones, key=lambda j: abs(u[j]-datos['posiciones'][punto])); elegidos.append(elegido)
                disponibles.remove(elegido); anclas[punto] = int(arco[elegido])
    if not bordes: raise RuntimeError('No se encontró ningún contorno ocular')
    refs['anclas'] = anclas; refs['bordes'] = bordes
    AO.actualizar(cara, bordes_override=bordes, anclas_override=anclas, ganancias_override=datos['ganancias'])
    return refs


def actualizar(cara):
    """Reubica solo después de validar el contorno y todas las referencias."""
    from . import ajustes_ojos as AO
    from . import pesos_parpados as PP
    refs = resolver(cara); datos = json.loads(cara[ESTADO]); kb = cara.data.shape_keys.key_blocks
    registro = AO._registro(cara)
    nombres_antes = {k.name for k in kb}
    nombres = [n for n in AO.NOMBRES if n in kb] + list(registro)
    coords = {n: AO._co(kb[n]).copy() for n in nombres}
    campos = ('rlb_borde_parpado', 'aj_anclas', 'aj_superficies_labios', 'rlb_parpados_uv_seeds', 'rlb_delineado_caras',
              'aj_ojos_helpers', 'aj_ojos_version', ESTADO, PP.PROPIEDAD, AVISO)
    def simple(v):
        return v.to_dict() if hasattr(v, 'to_dict') else v.to_list() if hasattr(v, 'to_list') else v
    viejos = {k: simple(cara[k]) for k in campos if k in cara}
    try:
        cara['rlb_borde_parpado'] = json.dumps(refs['bordes'])
        cara['aj_anclas'] = refs['anclas']
        if 'aj_superficies_labios' in cara: cara['aj_superficies_labios'] = refs['superficies']
        if 'rlb_parpados_uv_seeds' in cara: cara['rlb_parpados_uv_seeds'] = refs['semillas']
        if 'rlb_delineado_caras' in cara: cara['rlb_delineado_caras'] = json.dumps(refs['delineado'])
        res = AO.actualizar(cara, aplicar=True, bordes_override=refs['bordes'],
                            anclas_override=refs['anclas'], ganancias_override=datos['ganancias'])
        estado_pesos = PP.datos(cara)
        obsoletos = bool(estado_pesos.get('manuales')) and estado_pesos.get('firma') != PP._firma_malla(cara)
        if estado_pesos and estado_pesos.get('firma') != PP._firma_malla(cara):
            PP.reasignar(cara)
        preparar(cara)
        return {'actualizado': True, 'keys': res['keys'], 'anclas': len(refs['anclas']), 'manuales_obsoletos': obsoletos}
    except Exception:
        nuevos = {k.name for k in kb if k.name not in nombres_antes and AO._helper_valido(k.name)}
        for nombre in nuevos:
            if nombre in kb: cara.shape_key_remove(kb[nombre])
        for nombre, co in coords.items():
            if nombre in kb: kb[nombre].data.foreach_set('co', co.reshape(-1))
        for nombre, spec in registro.items():
            if nombre in kb: AO._poner_driver(cara, nombre, spec['expresion'], spec['variables'])
        for k in campos:
            if k in viejos: cara[k] = viejos[k]
            elif k in cara: del cara[k]
        cara.data.shape_keys.update_tag(); cara.update_tag(refresh={'DATA'})
        raise


def _timer():
    from . import editor
    for cara in bpy.data.objects:
        if cara.type != 'MESH' or ESTADO not in cara:
            continue
        token = cara.as_pointer(); editando = cara.mode != 'OBJECT'
        salio = _modos.get(token, editando) and not editando
        _modos[token] = editando
        if editando:
            _pendientes.pop(token, None)
            continue
        if editor._arr:
            continue
        if _pendientes.get(token) == -1 and not salio:
            continue
        try:
            cambio = detectar(cara, verificar_firma=salio or token in _pendientes)['cambio']
            if not cambio:
                _pendientes.pop(token, None); continue
            if token not in _pendientes:
                _pendientes[token] = 1
                continue
            resultado = actualizar(cara)
            cara[AVISO] = ('Puntos actualizados. Los pesos manuales anteriores se conservaron, pero requieren revisión y aplicación.'
                           if resultado.get('manuales_obsoletos') else 'Puntos de párpados actualizados después de editar la malla')
            _pendientes.pop(token, None)
        except Exception as exc:
            cara[AVISO] = 'No se actualizaron los puntos: ' + str(exc)
            _pendientes[token] = -1
    return .5


def register():
    anterior = bpy.app.driver_namespace.get('rlb_seguimiento_timer')
    if anterior and bpy.app.timers.is_registered(anterior):
        bpy.app.timers.unregister(anterior)
    bpy.app.driver_namespace['rlb_seguimiento_timer'] = _timer
    if not bpy.app.timers.is_registered(_timer): bpy.app.timers.register(_timer, first_interval=.5, persistent=True)


def unregister():
    anterior = bpy.app.driver_namespace.pop('rlb_seguimiento_timer', None)
    if anterior and bpy.app.timers.is_registered(anterior): bpy.app.timers.unregister(anterior)
    _modos.clear(); _pendientes.clear()
