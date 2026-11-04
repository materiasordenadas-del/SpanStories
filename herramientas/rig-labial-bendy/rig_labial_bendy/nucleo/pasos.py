# API de pasos: lo que llama el panel y lo que puede llamar Claude por código (MCP de Blender).
#   from rig_labial_bendy.nucleo import pasos
#   pasos.analizar(cara); pasos.detectar(cara, cursor); ...; pasos.todo(cara)
# Cada paso se puede repetir. Arreglar la malla borra las shape keys: después hay que rehacer 5 y 8.
import bpy
import json
import numpy as np
from . import util, marco as MK, ojos_esculpidos as OE, deteccion, malla, medidas, labios, pesos as PS, shapekeys, interior, ojos, gestos, revision, partes, contrato_semiauto
from . import ojos_lian as OL, pestanas_tripo as PT
from . import inventario, inventario_uv, regiones as RG, regiones_uv, ocultacion_uv as OUV, pestanas_uv as PUV, ruta_parpados
from . import posicion as PO, validar as VA


def _sello_disco():
    """(nº de archivos .py, tamaño total, mtime máximo) del add-on en disco."""
    import os
    raiz = os.path.dirname(os.path.dirname(__file__))
    n = tam = 0
    mt = 0.0
    for r, dirs, files in os.walk(raiz):
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for f in files:
            if f.endswith('.py') or f == 'blender_manifest.toml':
                s = os.stat(os.path.join(r, f))
                n += 1; tam += s.st_size; mt = max(mt, s.st_mtime)
    return (n, tam, round(mt, 2))


_SELLO_CARGADO = _sello_disco()


def codigo_al_dia():
    """0.8.7: False si los archivos del add-on cambiaron en disco DESPUÉS de cargarse en este Blender (se actualizó el zip o se
    sincronizó la fuente sin reiniciar): lo que corre en memoria es la versión VIEJA aunque `version()` diga la nueva
    (KAKA 2: el delineado seguía generándose solo, aunque el 0.8.6 en disco ya lo hacía manual)."""
    return _sello_disco() == _SELLO_CARGADO


def exigir_codigo_al_dia():
    if not codigo_al_dia():
        raise RuntimeError('El add-on cambió en disco después de cargarse: Blender está ejecutando código VIEJO. Reinicia Blender '
                           '(o recarga con sincronizar.py) antes de seguir; no se ha tocado el personaje.')


def version():
    """versión del add-on instalado (blender_manifest.toml). El skill la compara con la suya antes de empezar.
    Si el código en memoria no es el del disco, devuelve '<versión> (¡código viejo cargado: reinicia Blender!)'."""
    import os, re
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'blender_manifest.toml'), encoding='utf-8') as f:
        v = re.search(r'^version\s*=\s*"([^"]+)"', f.read(), re.M).group(1)
    return v if codigo_al_dia() else v + ' (¡código viejo cargado: reinicia Blender!)'


# ---------------------------------------------------------------- 0.8.0: ojos en posición neutra y forma de la cara (forma.py)
def ojos_poner(cara, lado, x=None, y=None, z=None, espejo=False):
    """ojo completo en mm respecto a su sitio original (x: + = izquierda del personaje, y: + = adelante, z: + = arriba).
    Devuelve el aviso de párpados ('' si no hace falta rehacerlos)."""
    from . import forma
    return forma.ojos_poner(cara, lado, x, y, z, espejo)


def forma_preparar(cara, forzar=False):
    """mide mentón/mandíbula/orejas por las islas UV de piel, pone los puntos fm_* y crea los deslizadores rlb_f_*."""
    from . import forma
    return forma.preparar(cara, forzar)


def forma_hoja(cara, zona, modo, valores=(-100, 0, 100)):
    """hoja PNG de comparación (−100 / 0 / +100) de un deslizador: ÁBRELA con Read antes de dar la forma por buena."""
    from . import forma
    return forma.foto_forma(cara, zona, modo, valores)


def _rig(M):
    rig = bpy.data.objects.get(M.n['rig'])
    if rig is None:
        raise RuntimeError('Todavía no hay rig: paso 4')
    return rig


def preparar_copia(origen, nombre=None):
    """SOLO si el usuario pide una copia en ese momento (norma: nunca copias). Copia de trabajo: malla propia con la transformación aplicada y centrada en X = 0 (el original no se
    toca y se oculta). La X original queda en ['rlb_origen_x'] para devolverla a su sitio al final."""
    util.modo_objeto()
    nombre = nombre or origen.name + 'R'
    if bpy.data.objects.get(nombre):
        raise RuntimeError(f'Ya existe {nombre}: usa quitar() antes')
    me = origen.data.copy(); me.name = nombre + '_malla'
    me.transform(origen.matrix_world)
    x0 = origen.matrix_world.translation.x
    from mathutils import Matrix
    me.transform(Matrix.Translation((-x0, 0, 0)))
    cara = bpy.data.objects.new(nombre, me)
    for c in origen.users_collection: c.objects.link(cara)
    cara['rlb_origen_x'] = x0
    origen.hide_set(True)
    return cara


def quitar(cara, tambien_cara=False):
    """borra todo lo que el complemento creó para esta cara (rig, piezas, ojos, marcadores, respaldo)."""
    util.modo_objeto()
    pre = (cara.name + '_', 'RLB_' + cara.name + '_')
    n = 0
    for o in [o for o in bpy.data.objects if o.name.startswith(pre)]:
        bpy.data.objects.remove(o); n += 1
    for c in [c for c in bpy.data.collections if c.name.startswith('RLB ' + cara.name)]:
        bpy.data.collections.remove(c)
    for a in [a for a in bpy.data.actions if a.name.startswith(pre)]:
        bpy.data.actions.remove(a)
    if tambien_cara:
        bpy.data.objects.remove(cara)
    return {'objetos_borrados': n}


def analizar(cara, detalle=False):
    """paso 1, solo lee. Por defecto un resumen corto (con detalle=True, las listas de caras de cada isla UV y de
    malla: decenas de KB, solo para depurar)."""
    uv = inventariar_uv(cara); isl = inventariar_islas(cara)
    r = dict(malla.analizar(cara))
    if detalle:
        r['uv'] = uv; r['islas'] = isl
    else:
        r['uv'] = {'has_uv': uv['has_uv'], 'n_uv_islas': uv['n_uv_islas']}
        r['islas'] = {'n_islas': isl['n_islas'], 'mayores': [
            {k: i[k] for k in ('seed', 'n_vertices', 'bounds_min', 'bounds_max')}
            for i in sorted(isl['islas'], key=lambda i: -i['n_vertices'])[:6]]}
    r['avisos'] = _avisos_malla(cara, r)
    return r


def duplicados(cara, tol=None):
    """vértices que coinciden con otro (costuras UV abiertas del GLB de Tripo). Solo lee."""
    P = util.coords(cara.data)
    tol = tol or 1e-6 * max(float(np.ptp(P, axis=0).max()), 1e-9)
    kd = util.kd_de(P, range(len(P)))
    n = 0
    for i in range(len(P)):
        if len(kd.find_range(P[i], tol)) > 1:
            n += 1
    return n


def soldar(cara, tol=None):
    """0.6.9 (Carlitos del GLB): Tripo exporta la malla con los vértices partidos en cada costura UV: la piel de la
    cara salía en cientos de islas (1569 vértices de la cara) y la detección, los pesos y las keys solo veían un
    trozo. Une los vértices que coinciden (Merge by Distance): no cambia el aspecto, conserva UV, materiales y
    grupos. Va ANTES de detectar (cambia los índices); con shape keys no se hace."""
    import bmesh
    util.modo_objeto()
    me = cara.data
    if me.shape_keys:
        raise RuntimeError('La malla tiene shape keys: no se sueldan los vértices (pregunta al usuario)')
    P = util.coords(me)
    tol = tol or 1e-6 * max(float(np.ptp(P, axis=0).max()), 1e-9)
    n0 = len(me.vertices)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=tol)
    bm.to_mesh(me); bm.free(); me.update()
    return {'vertices_antes': n0, 'vertices_despues': len(me.vertices)}


def _avisos_malla(cara, r):
    """lo que hay que resolver (o preguntar) antes de detectar, en frases cortas."""
    av = []
    r['vertices_duplicados'] = duplicados(cara)
    if r['vertices_duplicados'] > 0.01 * r['vertices']:
        av.append(f"{r['vertices_duplicados']} vértices partidos en costuras UV: pasos.soldar(cara) antes de detectar "
                  "(siguiente() lo hace solo).")
    if not r['transform_ok']:
        av.append('La transformación no está aplicada: pide permiso para aplicarla (Ctrl+A > All Transforms).')
    if not r['centrado_x']:
        av.append(f"La cara no está centrada en X = 0 (centro a {r['centro_x_mm']} mm): pasos.centrar(cara) la mueve "
                  "sin cambiar lo que se ve (pide permiso).")
    if r['shape_keys']:
        av.append('Ya tiene shape keys: arreglar() las borra. Pregunta si son del usuario antes de seguir.')
    if any(t == 'ARMATURE' for t, _ in r['modificadores']):
        av.append('Ya tiene un modificador Armature (rig de cuerpo): pregunta de qué hueso colgar el rig facial.')
    if not bpy.data.filepath:
        av.append('El .blend no está guardado: las hojas de revisión irán a la carpeta temporal (la ruta sale en '
                  'cada resultado).')
    return av


def inventariar_islas(cara):
    """Inventario de conectividad/materiales, solo lectura; no crea marcas ni grupos."""
    me = cara.data
    P = util.coords(me)
    edges = [(int(e.vertices[0]), int(e.vertices[1])) for e in me.edges]
    return inventario.inventariar(P, edges, me.polygons)


def inventariar_uv(cara, tolerance=1e-6):
    """Inventario de continuidad UV sobre aristas geométricas compartidas, solo lectura."""
    me = cara.data
    uv_layer = me.uv_layers.active
    if uv_layer is None:
        return {'has_uv': False, 'n_uv_islas': 0, 'islas_uv': []}
    vertices = util.coords(me)
    edge_list = [(int(e.vertices[0]), int(e.vertices[1])) for e in me.edges]
    face_vertices, face_uvs = [], []
    for poly in me.polygons:
        face_vertices.append([int(v) for v in poly.vertices])
        face_uvs.append([tuple(float(c) for c in uv_layer.data[li].uv) for li in poly.loop_indices])
    return inventario_uv.inventariar(vertices, edge_list, face_vertices, face_uvs, tolerance)


def marcar_regiones_uv(cara, asignaciones, ojos_uv_seeds, tolerance=1e-6):
    uv_layer = cara.data.uv_layers.active
    if uv_layer is None:
        raise ValueError('La malla no tiene una capa UV activa')
    inv = inventariar_uv(cara, tolerance)
    return regiones_uv.marcar_por_seed(cara, inv, asignaciones, ojos_uv_seeds,
                                       RG.colorear, uv_layer.name, tolerance)


def ocultar_ojos_uv(cara, semillas, tolerance=1e-6):
    """Ocultación reversible y no aplicada de islas UV aprobadas mediante Geometry Nodes."""
    return OUV.crear_ocultacion_ojos_uv(cara, semillas, tolerance)


def restaurar_ojos_uv(cara):
    return OUV.restaurar_ocultacion_ojos_uv(cara)


def sincronizar_pestanas_uv(cara, rig=None, keys=None):
    """Iguala el campo de pestañas UV con el root topológico y propaga correctivas de contacto."""
    if rig is None:
        rig = _rig(MK.Marco(cara))
    return PUV.sincronizar(cara, rig, keys)


def marcar_regiones(cara, regiones, ojos):
    return RG.colorear(cara, regiones, ojos)


def mostrar_regiones(cara, visible=True):
    return RG.mostrar(cara, visible)


_PUNTOS_SEMIAUTO = ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf')


def _coordenadas_marcadores(cara):
    bpy.context.view_layer.update()
    out = {}
    for k in _PUNTOS_SEMIAUTO:
        obj = bpy.data.objects.get(MK.nombre_marca(cara, k))
        if obj is None: raise RuntimeError('Falta marcador ' + k)
        out[k] = [round(float(v), 7) for v in obj.matrix_world.translation]
    return out


def detectar_boca(cara, cursor=None):
    cursor = cursor if cursor is not None else bpy.context.scene.cursor.location.copy()
    B = deteccion.boca(cara, tuple(cursor))
    pos = {'comisura.L': B['comisura'], 'comisura.R': (-B['comisura'].x, B['comisura'].y, B['comisura'].z),
           'labio_sup': B['labio_sup'], 'labio_inf': B['labio_inf']}
    nombres = [MK.nombre_marca(cara, k) for k in pos]
    colisiones = [n for n in nombres if bpy.data.objects.get(n) is not None and bpy.data.objects[n].type != 'EMPTY']
    if colisiones:
        raise RuntimeError('Hay objetos que impiden crear marcadores sin reemplazar datos: ' + ', '.join(colisiones))
    col = util.coleccion(MK.coleccion_marcas(cara))
    for k, p in pos.items():
        name = MK.nombre_marca(cara, k); obj = bpy.data.objects.get(name)
        if obj is None: obj = bpy.data.objects.new(name, None); col.objects.link(obj)
        obj.empty_display_type = 'SPHERE'; obj.empty_display_size = 0.08 * abs(B['comisura'].x)
        obj.scale = (1, 1, 1); obj.show_in_front = True; obj.location = p
    d = MK.cfg(cara); d['seed'] = int(B['seed']); d['semiauto_boca_pendiente'] = True; d.pop('semiauto_boca_aprobada', None)
    MK.guardar_cfg(cara, d)
    return {'marcadores': {k: [round(float(v), 6) for v in p] for k, p in pos.items()}, 'requiere_aprobacion': True}


def aprobar_marcadores(cara):
    d = MK.cfg(cara)
    actuales = _coordenadas_marcadores(cara)
    if not d.get('semiauto_boca_pendiente') and 'semiauto_boca_aprobada' not in d:
        raise RuntimeError('No hay una detección semiautomática pendiente')
    contrato_semiauto.validar_reaprobacion(d, actuales)
    d['semiauto_boca_aprobada'] = actuales
    d['semiauto_boca_pendiente'] = False
    MK.guardar_cfg(cara, d)
    return {'aprobados': True, 'coordenadas': d['semiauto_boca_aprobada']}


AVISO_MALLA_PROCESADA = ('La malla ya está modificada: se conservan los marcadores (la detección automática solo funciona en la malla original). Si alguno está mal, muévelo a mano.')


def malla_procesada(cara):
    """True si la malla ya no es la original de Tripo (arreglada, ojos abiertos, cuenca, densificada, piezas del
    complemento...): ahí la detección automática da basura."""
    from . import linea as LN
    d = MK.cfg(cara)
    if 'arreglar' in LN.hechos(cara) or d.get('ojos_abiertos') or d.get('respaldo') or d.get('cuenca'):
        return True
    if cara.get('facs_densificado'):
        return True
    ext = (f'{cara.name}_Cuenca', f'{cara.name}_Boca_Interior', f'{cara.name}_Delineado')
    try:
        mats = [m.name for m in cara.data.materials if m]
    except Exception:
        mats = []
    return any(m == e or m.startswith(e) for m in mats for e in ext)


def _procesada_firme(cara):
    """True si la malla ya tiene lo que los pasos tempranos no sobreviven repetidos (rig, ojos abiertos, cuenca, densificada)."""
    d = MK.cfg(cara)
    return bool(d.get('ojos_abiertos') or d.get('cuenca') or cara.get('facs_densificado')
                or bpy.data.objects.get(MK.nombres(cara)['rig']) is not None)


def primer_paso_seguro(cara):
    """id del primer paso de la línea que se puede REPETIR sobre la malla tal como está. Pasos que añaden o borran
    vértices o caras, o usan índices guardados (arreglar: solapas, dientes de Tripo, rendija; abrir_ojos: borra el
    bulto; cuenca: añade vértices; parpados: rehace la cuenca; detectar: semillas) no se repiten sobre malla
    procesada. Con la malla densificada (FACS) la máscara de la cuenca ya no es fiable (la subdivisión parte sus
    aristas) y rehacer el rig tiraría los huesos de los párpados: solo se repiten la lente y los pasos FACS."""
    return 'oclusion' if cara.get('facs_densificado') else 'rig'


def _titulo_paso(pid):
    from . import linea as LN
    return next((s[1] for s in LN.COMPLETA if s[0] == pid), pid)


def detectar(cara, cursor=None, foto=True, forzar=False):
    """marcadores desde la geometría (boca por rayos, ojos = globo/hueco en la malla, cejas = islas). foto solo pinta
    lo detectado para revisarlo a ojo; no cambia nada. Sobre una malla ya procesada lanza RuntimeError salvo forzar=True."""
    if not forzar and malla_procesada(cara):
        raise RuntimeError(AVISO_MALLA_PROCESADA)
    cursor = cursor if cursor is not None else bpy.context.scene.cursor.location.copy()
    r = deteccion.detectar(cara, tuple(cursor))
    r['partes'] = inspeccionar(cara, foto=foto)
    return r


def inspeccionar(cara, foto=True):
    """nombra las partes de la malla (grupos RLB_<parte>) y deja una foto de colores para revisarlas."""
    M = MK.Marco(cara)
    out = {'partes': partes.clasificar(cara, M)}
    if foto:
        out['foto'] = partes.foto(cara, M)
    return out


def foto_marcadores(cara):
    """hoja PNG de frente y perfil con una bolita de color en cada marcador (no cambia nada). -> ruta."""
    with PO.en_origen(cara), PO.aislado(cara):
        return revision.foto_marcadores(cara, MK.Marco(cara))


def hablar(cara, texto, audio=None):
    """0.7.1: hace que la cara diga `texto` (español) con los visemas de la biblioteca, sin contrato JSON. Crea la acción
    <cara>_Habla en el control (reemplaza la anterior), pone el audio WAV si se da (sin audio usa tiempos típicos del
    español) y ajusta el rango de fotogramas de la escena. -> resumen corto: acción, frames y canales que se mueven
    (con su máximo) y 'avisos' (0.7.2: p. ej. el texto no encaja con el audio; no bloquea). Después, foto_habla(cara) saca la hoja de visemas para mirarla."""
    from .facs import pipeline as FP, biblioteca as BI, habla as H
    if not (texto or '').strip():
        raise ValueError('hablar: falta el texto de la frase')
    if BI.control(cara) is None:
        raise RuntimeError('Esta cara no tiene el control FACS: termina antes la línea del rig (pasos.siguiente).')
    b = {'nombre': 'frase', 'texto': texto.strip()}
    if audio:
        import os
        audio = bpy.path.abspath(audio)
        if not os.path.isfile(audio):
            raise FileNotFoundError(f'hablar: no encuentro el audio {audio}')
        b['audio'] = audio
    r = FP.hablar(cara, [b], contrato=False)
    ctrl = BI.control(cara)
    act = ctrl.animation_data.action if ctrl.animation_data else None
    mov = {}
    if act is not None:
        for f in H._fcurves(act):
            if f.data_path.startswith('["v_') and len(f.keyframe_points):
                m = max(abs(k.co[1]) for k in f.keyframe_points)
                if m > 0.05:
                    mov[f.data_path[4:-2]] = round(float(m), 2)
    top = dict(sorted(mov.items(), key=lambda kv: -kv[1])[:14])
    sc = bpy.context.scene
    out = {'accion': act.name if act else None, 'frames': [sc.frame_start, sc.frame_end],
           'canales_que_se_mueven': len(mov), 'maximos': top, 'audio': bool(audio)}
    if not mov:
        out['aviso'] = 'Ningún canal se mueve: ¿tiene la cara los canales v_<forma>?'
    out['avisos'] = list(r.get('avisos', []))   # 0.7.2 (Lamine): p. ej. el texto no encaja con el audio
    return out


def foto_habla(cara, color='TEXTURE'):
    """hoja PNG de los visemas A, E, I, O, U, MBP y FV (de izquierda a derecha, rotulados) de frente (fila de arriba) y
    de perfil (abajo), muy de cerca. No cambia nada: restaura acción, canales, mirada, cámara y render. color='MATERIAL': sin
    texturas, para juzgar la forma. -> ruta."""
    with PO.en_origen(cara), PO.aislado(cara):
        return revision.foto_habla(cara, MK.Marco(cara), color=color)


def simetrizar(cara):
    deteccion.simetrizar(cara)
    return {'ok': True}


def ceja_pegada(cara):
    """¿una ceja suelta y la otra pegada a la piel? -> {'lado', 'vertices'} o None. No cambia nada."""
    r = partes.separar_ceja_pegada(cara, MK.Marco(cara), solo_buscar=True)
    return {'lado': r[0], 'vertices': len(r[1])} if r else None


def arreglar(cara, cuant=True, solapas=True, normales=True, dientes=True, separar_cejas=None, rendija=True):
    """separar_cejas=None (0.8.43): si una ceja está pegada a la piel se separa SIEMPRE como isla propia. Pegada, el
    párpado la arrastraba al cerrar (Pegazo: 16 mm) y la piel de debajo salía como solapa. False: no se toca."""
    if _procesada_firme(cara):
        raise RuntimeError('La malla ya está modificada: arreglarla otra vez la rompería. Hace falta el modelo original.')
    malla.quitar_cuenca(cara); ojos.quitar_oclusion(cara)      # se rehacen en el paso 8
    out = malla.arreglar(cara, MK.Marco(cara), cuant, solapas, normales, dientes, rendija)
    if separar_cejas is None:
        separar_cejas = ceja_pegada(cara) is not None
    if separar_cejas:
        try:
            out['ceja_pegada'] = partes.separar_ceja_pegada(cara, MK.Marco(cara))
        except RuntimeError as e:
            out['ceja_pegada'] = {'separada': None, 'error': str(e)}
    return out


def ajustar_iris(cara, iris=None, pupila=None):
    """ojos de Vale: iris = ancho iris / ancho abertura del ojo; pupila = ancho pupila / ancho iris (de la imagen de
    referencia). Ojos de Lian: iris = radio del iris / radio del globo; pupila = radio pupila / radio iris."""
    d = MK.cfg(cara)
    if d.get('ojos_tripo'):
        from . import ojos_tripo as OT
        return OT.ajustar(cara, iris, pupila)
    if d.get('ojos_modo') == 'LIAN':
        ol = d.get('ojos_lian', {})
        return OL.crear(cara, ol.get('color', 'castano'), iris if iris is not None else ol.get('iris'),
                        pupila if pupila is not None else ol.get('pupila'))
    return ojos.ajustar_iris(cara, iris, pupila)


def abrir_ojos(cara):
    """ojos esculpidos en la piel: borra el bulto de cada ojo (queda el hueco para los ojos de Vale)."""
    util.modo_objeto()
    M = MK.Marco(cara)
    if not M.ojos:
        raise RuntimeError('Faltan los marcadores de los ojos')
    me = cara.data
    P = util.coords(me)
    face, _ = medidas.cara_mask(cara, M)
    # el medio globo de Tripo se busca en la propia malla; el que esté más cerca de cada marcador
    hallados = OE.buscar_en_malla(me, P, face, M.mc, M.hw)
    esf = {}
    for s in ('L', 'R'):
        c, R = M.ojo(s)
        f = hallados.get(s)
        if f is None or (f[0] - c).length > 0.5 * R:
            raise RuntimeError(f'El ojo {s} no parece un medio globo en la malla (o ya está abierto)')
        esf[s] = (f[0], f[1])
    # 0.6.6: el bulto de Tripo de un lado puede encajar en una esfera mayor (Martín R: 17 frente a 13,4 mm) y con
    # ese radio se borraba también el reborde del párpado hacia el lagrimal (ojo roto, astillas). Antes de borrar,
    # el mayor se limita al +8 % del menor (deteccion.radio_comun); el menor no se toca (con otro radio no se encuentra)
    rmin = min(R for _, R in esf.values())
    esf = {s: (C, min(R, deteccion.radio_comun(R, rmin))) for s, (C, R) in esf.items()}
    info = OE.abrir(cara, esf)
    # los globos nuevos: cada uno en su centro, el mismo radio (deteccion.radio_comun)
    Rc = deteccion.radio_comun(esf['L'][1], esf['R'][1])
    esf = {s: (C, Rc) for s, (C, R) in esf.items()}
    for s, (C, R) in esf.items():
        e = bpy.data.objects.get(MK.nombre_marca(cara, 'ojo.' + s))
        if e: e.location = C; e.empty_display_size = R; e.scale = (1, 1, 1)
    d = MK.cfg(cara); d['ojos_hueco'] = True; d['ojos_abiertos'] = True; MK.guardar_cfg(cara, d)
    return {'caras_borradas': info, 'radio_mm': {s: round(v[1] * 1000, 2) for s, v in esf.items()}}


def rig_labios(cara, pinch_follow=0.1, chew=0.75):
    _validar_revision_marcadores(cara)
    M = MK.Marco(cara)
    MED = medidas.medir_labios(cara, M)
    rig, info = labios.construir(cara, M, MED, pinch_follow, chew)
    info['boca_abierta_en_reposo'] = MED['abierta']
    return info


def _validar_revision_marcadores(cara):
    d = MK.cfg(cara)
    contrato_semiauto.validar_antes_de_rig(
        d, _coordenadas_marcadores(cara) if d.get('semiauto_boca_aprobada') is not None else {})


def pesos(cara):
    M = MK.Marco(cara); rig = _rig(M)
    MED = medidas.medir_labios(cara, M)
    I = medidas.medir_interior(cara, M, MED)
    out = {'pesos': PS.pesos(cara, rig, M, MED, I)}
    out['labio_dentro'] = shapekeys.labio_dentro(cara, rig, M)
    return out


def boca_interior(cara, ajustes=None):
    from . import dientes_apariencia as DA
    with DA.anatomico():                       # el interior se mide con los dientes anatómicos
        M = MK.Marco(cara); rig = _rig(M)
        MED = medidas.medir_labios(cara, M)
        return interior.construir(cara, rig, M, MED, ajustes)


def quitar_pestanas(cara, inferiores=True):
    """3c (0.6.4). Pestañas de Tripo (islas sueltas junto al globo): se borran sus caras (los vértices quedan:
    índices intactos). Las sustituye el delineado (F4). Sin pestañas no hace nada. Deshacer: restaurar_pestanas."""
    return PT.quitar(cara, inferiores=inferiores)


def restaurar_pestanas(cara):
    return PT.restaurar(cara)


def diagnosticar_pestanas(cara):
    """0.7.2. ¿Tiene pestañas de Tripo y cómo se identifican (isla geométrica → isla UV → ninguna)? Solo lee."""
    return PT.diagnosticar(cara)


def pestanas_seleccionar(cara):
    """0.7.2, herramienta manual 1/2: marca las caras candidatas a pestañas y entra en modo edición (caras) para
    ajustar la selección a mano. Luego quitar_pestanas_manual."""
    return PT.seleccionar(cara)


BORDE_PARPADO = 'rlb_borde_parpado'     # json {'sup_L': [v...], 'inf_L': [...], 'sup_R': ..., 'inf_R': ...}


def bordes_parpado(cara):
    raw = cara.get(BORDE_PARPADO)
    try:
        return json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}


def marcar_borde_parpado(cara, cual, vertices=None):
    """0.8.5, semiautomático: los vértices seleccionados en modo edición (o `vertices`) son el borde del párpado
    superior (cual='sup') o inferior ('inf'), de rabillo a rabillo. Se reparten por ojo (pivote más cercano); el ojo que
    no se marcó se copia en espejo. Los párpados por superficie UV usan estos bordes en vez de buscarlos."""
    import bmesh
    from mathutils.kdtree import KDTree
    if cual not in ('sup', 'inf'):
        raise ValueError("cual = 'sup' o 'inf'")
    me = cara.data
    if vertices is None:
        if cara.mode == 'EDIT':
            bm = bmesh.from_edit_mesh(me); sel = [v.index for v in bm.verts if v.select]
        else:
            sel = [v.index for v in me.vertices if v.select]
    else:
        sel = [int(v) for v in vertices]
    if len(sel) < 4:
        raise ValueError('Selecciona al menos 4 vértices del borde del párpado (de rabillo a rabillo)')
    n = len(me.vertices); B = np.empty(n * 3)
    (me.shape_keys.reference_key.data if me.shape_keys else me.vertices).foreach_get('co', B); B = B.reshape(-1, 3)
    inv = cara.matrix_world.inverted(); cen = {}
    for s in ('L', 'R'):
        piv = bpy.data.objects.get(f'{cara.name}_OjoPivote_{s}')
        if piv is not None: cen[s] = np.array((inv @ piv.matrix_world.translation)[:])
    x0 = 0.5 * (cen['L'][0] + cen['R'][0]) if len(cen) == 2 else 0.0
    sx = {'L': 1.0, 'R': -1.0}
    if len(cen) == 2 and cen['L'][0] < cen['R'][0]: sx = {'L': -1.0, 'R': 1.0}
    por = {'L': [], 'R': []}
    for v in sel:
        por['L' if (B[v, 0] - x0) * sx['L'] > 0 else 'R'].append(v)
    # el espejo se agarra al borde abierto (el hueco del ojo) si el marcado está en él: la malla de Tripo no es
    # simétrica vértice a vértice y el más cercano a veces es la fila de detrás (Ichigo: 5 de 11 en el borde superior)
    from collections import Counter
    cnt = Counter(e for p in me.polygons for e in p.edge_keys)
    borde = {v for e, k in cnt.items() if k == 1 for v in e}
    cand = sorted(borde) if sum(v in borde for v in sel) >= 0.8 * len(sel) else range(n)
    kd = KDTree(len(cand))
    for i in cand: kd.insert(B[i], i)
    kd.balance()
    tol = 0.08 * float(np.ptp(B[sel], axis=0).max() + 1e-9) + 1e-4
    d = bordes_parpado(cara); out = {}
    for s, otro in (('L', 'R'), ('R', 'L')):
        if len(por[s]) >= 4:
            d[f'{cual}_{s}'] = sorted(por[s]); out[s] = {'marcados': len(por[s])}
            if len(por[otro]) < 4:
                esp, lejos = [], 0
                for v in por[s]:
                    q = B[v].copy(); q[0] = 2 * x0 - q[0]
                    _, j, dist = kd.find(q)
                    if dist <= tol: esp.append(j)
                    else: lejos += 1
                if len(set(esp)) >= 4:
                    d[f'{cual}_{otro}'] = sorted(set(esp)); out[otro] = {'espejo': len(set(esp)), 'sin_pareja': lejos}
    if not out:
        raise ValueError('La selección no tiene 4 vértices en ningún ojo')
    cara[BORDE_PARPADO] = json.dumps(d)
    return {'borde': cual, **out, 'guardado': sorted(d)}


def borrar_bordes_parpado(cara):
    """vuelve a la búsqueda automática del borde del párpado."""
    if BORDE_PARPADO in cara: del cara[BORDE_PARPADO]
    return {'bordes': 'automáticos'}


def ver_borde_parpado(cara, cual):
    """selecciona en modo edición los vértices marcados como borde 'sup' o 'inf' (los dos ojos), para revisarlos."""
    import bmesh
    d = bordes_parpado(cara); ids = set(d.get(f'{cual}_L', []) + d.get(f'{cual}_R', []))
    util.activar(cara)
    if cara.mode != 'EDIT': bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='VERT')
    bm = bmesh.from_edit_mesh(cara.data)
    for v in bm.verts: v.select = v.index in ids
    bm.select_flush_mode(); bmesh.update_edit_mesh(cara.data)
    return {'seleccionados': len(ids)}


def quitar_pestanas_manual(cara, caras=None, forzar=False):
    """0.7.2, herramienta manual 2/2: borra como pestañas de Tripo las caras seleccionadas (o `caras`). Se niega si no
    parecen pestañas (lejos del ojo, demasiadas caras). Deshacer: restaurar_pestanas."""
    return PT.quitar_manual(cara, caras, forzar=forzar)


def ojos_vale(cara):
    return ojos.importar_ojos_vale(cara, MK.Marco(cara))


def ojos_lian(cara, color='castano', iris=None, pupila=None):
    """7 (0.6.4, por defecto). Ojos de Lian: globo, iris por color de vértice, pupila y córnea, sin texturas.
    Usa los pivotes de los ojos de Vale (los importa si faltan) y cambia sus piezas.
    color: 'castano', 'turquesa' (Lian), 'verde', 'gris' o (oscuro, claro, aro) RGB."""
    d = MK.cfg(cara)
    if not d.get('pivotes') or not bpy.data.objects.get(d['pivotes'][0]):
        ojos.importar_ojos_vale(cara, MK.Marco(cara))
    return OL.crear(cara, color, iris, pupila)


def ojos_existentes(cara, piv_L, piv_R, raiz=None):
    return ojos.usar_ojos_existentes(cara, MK.Marco(cara), piv_L, piv_R, raiz)


def preparar_ojos_aislados(cara, semillas_ojos_uv, color='castano', aplicar=False, semillas_pestanas_uv=None):
    """Preparación estándar desde globos Tripo identificados por UV, sin boca."""
    from .preparacion_ocular import preparar
    return preparar(cara, semillas_ojos_uv, color=color, aplicar=aplicar, semillas_pestanas_uv=semillas_pestanas_uv)


def retirar_pestanas_uv(cara, semillas_uv, aplicar=False):
    """Retirada estándar de pestañas Tripo identificadas por UV, sin boca."""
    from .preparacion_ocular import retirar_pestanas_uv as retirar
    return retirar(cara, semillas_uv, aplicar=aplicar)


def preparar_ojos_desde_cuencas(cara, semillas_piel_uv, color='castano', aplicar=False):
    """Ojos procedurales cuando ya se retiraron globos y pestañas Tripo."""
    from .preparacion_ocular import preparar_desde_cuencas
    return preparar_desde_cuencas(cara, semillas_piel_uv, color=color, aplicar=aplicar)


def reanillar_parpados(cara, aplicar=False, K=4):
    """0.8.48: tras preparar_parpados, 5 anillos en quads alrededor del ojo sobre la piel original. aplicar=False: ensayo."""
    from .preparar_parpados import reanillar
    return reanillar(cara, aplicar=aplicar, K=K)


def preparar_parpados(cara, aplicar=False, centros=None, forzar=False):
    """0.8.46, solo si se pide y antes del rig: lazo cerrado del borde, fuera lo de dentro, anillos en quads y cuenca hundida.
    aplicar=False: ensayo con el informe, malla intacta. centros={'L':(x,y,z),'R':(...)} locales si la búsqueda falla."""
    from .preparar_parpados import preparar
    return preparar(cara, aplicar=aplicar, centros=centros, forzar=forzar)


def reconocer(cara, mediapipe=False):
    """0.8.50: regiones por UV y topología + confianza por marcador. Solo lee. mediapipe=True contrasta con MediaPipe si está instalado."""
    from . import reconocimiento
    return reconocimiento.reconocer(cara, mediapipe)


def corregir_punto(cara, punto, pos):
    """0.8.50: mueve solo un marcador dudoso y vuelve a puntuar."""
    from . import reconocimiento
    return reconocimiento.corregir(cara, punto, pos)


def ojos_tripo(cara, aplicar=False, color='castano', iris=None, pupila=None, K=4):
    """0.8.50: reutiliza los globos de Tripo y optimiza la órbita. Va después de «arreglar» y antes del rig. aplicar=False: ensayo."""
    from . import ojos_tripo as OT
    return OT.preparar(cara, aplicar, color, iris or OT.IRIS, pupila or OT.PUPILA, K)


def reparar_intersecciones_oculares(cara, semillas_uv, aplicar=False):
    """Conectar cruces existentes de piel ocular conservando su superficie."""
    from .reparacion_superficie_ocular import reparar
    return reparar(cara, semillas_uv, aplicar=aplicar)


def preparar_cuencas_aisladas(cara, semillas_uv, aplicar=False):
    """Excepción ocular: preparar interior sin modificar contorno ni pestañas."""
    from .cuencas_aisladas import preparar
    return preparar(cara, semillas_uv, aplicar=aplicar)


def ajustar_espacio_ojos(cara, semillas_uv, aplicar=False, limite=.2, acercar=False):
    """Diagnosticar contacto ocular; aplicar=True solo tras autorizar el ajuste de profundidad.
    acercar=True también avanza ojos que quedaron hundidos lejos de la abertura (rehacer luego los párpados)."""
    from .facs.parpados_aislados import ajustar_espacio_ojos as ajustar
    return ajustar(cara, semillas_uv, aplicar=aplicar, limite=limite, acercar=acercar)


def medir_parpados_aislados(cara):
    from .facs.parpados_aislados import medir
    return medir(cara)


def parpados_aislados(cara, semillas_uv, parametros=None, reemplazar=False):
    """Seis keys oculares, sin rig de boca, densificación, delineado ni cambios de Basis.

    semillas_uv: índices de cara de las islas de piel revisadas; los ojos del
    complemento deben existir. No recupera ni conserva globos antiguos de Tripo.
    """
    from .facs.parpados_aislados import aplicar
    return aplicar(cara, semillas_uv, parametros, reemplazar=reemplazar)


def parpados(cara, parametros=None):
    """los párpados se calculan sobre la piel sin cuenca ni lente; si ya estaban, se rehacen al final."""
    M = MK.Marco(cara); rig = _rig(M)
    d = MK.cfg(cara)
    uv_pestanas_aprobadas = False
    try:
        traza = json.loads(cara.get('rlb_regiones_uv', '{}'))
        attr = cara.data.attributes.get('RLB_region_id')
        if (traza.get('regions', {}).get('pestanas') and attr and
                attr.data_type == 'INT' and attr.domain == 'FACE'):
            ids = np.zeros(len(cara.data.polygons), dtype=np.int32)
            attr.data.foreach_get('value', ids)
            uv_pestanas_aprobadas = bool(np.any(ids == 2))
    except (TypeError, ValueError, AttributeError):
        # Una traza ausente o dañada conserva el enrutamiento heredado.
        pass
    parametros = ruta_parpados.parametros_seguros(parametros, uv_pestanas_aprobadas)
    if d.get('ojos_tripo'):         # 0.8.50: el borde ya está sobre el globo; recortarlo abriría la órbita
        parametros = dict(parametros or {}, recortar_globo=False)
    malla.quitar_cuenca(cara); ojos.quitar_oclusion(cara)
    out = ojos.parpados(cara, rig, M, parametros)
    if d.get('cuenca'): out['cuenca'] = malla.cuenca(cara, MK.Marco(cara), rig, d['cuenca'])
    if d.get('oclusion'): out['oclusion'] = ojos.oclusion(cara, rig, MK.Marco(cara), d['oclusion'])
    return out


def cuenca(cara, parametros=None):
    """8c (opcional desde 0.8.5). Ojo de Tripo con agujero: margen del párpado apoyado en el globo + bolsa oscura cerrada
    detrás del ojo. AÑADE caras a la malla y sube el borde del párpado: solo cuando se pide (botón del paso)."""
    M = MK.Marco(cara)
    d = MK.cfg(cara); d['cuenca_pedida'] = True; MK.guardar_cfg(cara, d)
    return malla.cuenca(cara, M, bpy.data.objects.get(M.n['rig']), parametros)


def oclusion(cara, parametros=None):
    """8d. Lente de oclusión delante de cada globo (banda de contacto plana bajo los párpados)."""
    M = MK.Marco(cara)
    return ojos.oclusion(cara, bpy.data.objects.get(M.n['rig']), M, parametros)


def corte_ojo(cara, lado='L', poses=None, dx=0.0):
    """corte lateral por x = centro del ojo (piel, cuenca, globo, lente, pestañas) abierto, a medias y cerrado."""
    M = MK.Marco(cara); rig = _rig(M)
    return revision.corte_ojo(cara, rig, M, lado, poses, dx=dx)


def medir_oclusion(cara):
    """vértices de la lente por delante de la piel (se verían sobre el párpado): tiene que dar 0 en todas las poses."""
    M = MK.Marco(cara); rig = _rig(M)
    return revision.medir_oclusion(cara, rig, M)


def medir_cierre(cara, poses=None, miradas=None, rendija=True):
    """vértices del párpado dentro del ojo (abierto, medio, cerrado; mirada al frente, arriba, abajo, lados) y
    rendija al cerrar: 'total_dentro' y 'total_visible' tienen que dar 0."""
    M = MK.Marco(cara); rig = _rig(M)
    return revision.medir_cierre(cara, rig, M, poses, miradas, rendija)


def seguir_keys(cara, factores=None):
    """dientes y lengua copian las shape keys de la boca (rehacer tras crear_gestos o arreglar)."""
    M = MK.Marco(cara); rig = _rig(M)
    return interior.seguir_keys(cara, rig, M, factores)


def crear_gestos(cara):
    M = MK.Marco(cara); rig = _rig(M)
    return gestos.crear(rig, M)


def revisar(cara, poses=None, vistas=None, color='TEXTURE', completo=False):
    """hojas de revisión. Por defecto UNA hoja resumen (10 renders); completo=True o poses/vistas dadas: las hojas de siempre.
    El personaje se trae al origen y se oculta lo demás del render solo (con varios personajes en el .blend las hojas
    salían de otro)."""
    from . import dientes_apariencia as DA
    with DA.anatomico(), PO.en_origen(cara), PO.aislado(cara):
        M = MK.Marco(cara); rig = _rig(M)
        if completo or poses or vistas:
            return revision.render(cara, rig, M, poses, vistas, color=color)
        return revision.resumen(cara, rig, M, color=color)


def todo(cara, cuant=True, solapas=True, normales=True, ojos_modo='LIAN', pivotes=None, ajustes=None,
         parametros=None, pinch_follow=0.1, chew=0.75, iris=None, pupila=None, cuenca_=False, oclusion_=True,
         color_ojos='castano'):
    """pasos 3 a 9 seguidos (con los marcadores ya colocados)."""
    _validar_revision_marcadores(cara)
    out = {}
    out['3_malla'] = arreglar(cara, cuant, solapas, normales)
    d = MK.cfg(cara)
    out['3c_pestanas'] = quitar_pestanas(cara)           # 0.7.2: primero se retiran las pestañas de Tripo
    if d.get('ojos_esculpidos') and not d.get('ojos_abiertos') and ojos_modo in ('VALE', 'LIAN'):
        out['3b_abrir_ojos'] = abrir_ojos(cara)
    out['4_rig'] = rig_labios(cara, pinch_follow, chew)
    out['5_pesos'] = pesos(cara)
    out['6_interior'] = boca_interior(cara, ajustes)
    if ojos_modo == 'LIAN':
        out['7_ojos'] = ojos_lian(cara, color_ojos, iris, pupila)
    elif ojos_modo == 'VALE':
        out['7_ojos'] = ojos_vale(cara)
    elif ojos_modo == 'EXISTENTES' and pivotes:
        out['7_ojos'] = ojos_existentes(cara, *pivotes)
    out['8_parpados'] = parpados(cara, parametros)
    if ojos_modo in ('VALE', 'LIAN', 'EXISTENTES'):
        if cuenca_ and 'cuenca' not in out['8_parpados']: out['8c_cuenca'] = cuenca(cara)
        if oclusion_ and 'oclusion' not in out['8_parpados']: out['8d_oclusion'] = oclusion(cara)
    if ojos_modo == 'VALE' and (iris or pupila):
        out['8b_iris'] = ajustar_iris(cara, iris, pupila)
    out['9_gestos'] = crear_gestos(cara)
    rig = bpy.data.objects[MK.nombres(cara)['rig']]
    util.activar(rig)
    return out


# ---------------------------------------------------------------- 0.6.9: un paso por llamada (para modelos pequeños)
def _corto(x, prof=0):
    """resultado compacto y serializable en JSON (sin np.float64, listas y dicts recortados)."""
    if isinstance(x, (np.floating, float)):
        return round(float(x), 3)
    if isinstance(x, (np.integer, bool, int)):
        return x if isinstance(x, bool) else int(x)
    if isinstance(x, str):
        return x if len(x) <= 160 else x[:157] + '...'
    if isinstance(x, dict):
        if prof >= 2 and not (len(x) <= 4 and all(isinstance(v, (int, float, np.number, str)) for v in x.values())):
            return f'{{{len(x)} claves}}'
        return {str(k): _corto(v, prof + 1) for k, v in list(x.items())[:12]}
    if isinstance(x, (list, tuple, np.ndarray)):
        x = list(x)
        escalares = all(isinstance(v, (int, float, np.number, str)) for v in x)
        if len(x) > 6 or (prof >= 2 and not (escalares and prof < 4)):
            return f'[{len(x)} elementos]'
        return [_corto(v, prof + 1) for v in x]
    if hasattr(x, 'name'):
        return x.name
    return str(x)[:80]


def estado(cara):
    """qué pasos de la línea completa están hechos y cuál toca. Solo lee."""
    from . import linea as LN
    hec = LN.hechos(cara)
    ids = LN.ids('COMPLETA')
    sig = LN.siguiente(cara, 'COMPLETA')
    return {'hechos': [i for i in ids if i in hec], 'siguiente': sig[0] if sig else None,
            'n': ids.index(sig[0]) if sig else len(ids), 'de': len(ids)}


def _quitar_drivers(ob, nombres):
    """borra los drivers de value de esas shape keys de ob. -> cuántos."""
    sk = ob.data.shape_keys
    n = 0
    if sk and sk.animation_data:
        for f in list(sk.animation_data.drivers):
            if f.data_path.startswith('key_blocks["') and f.data_path.split('"')[1] in nombres:
                sk.animation_data.drivers.remove(f); n += 1
    return n


def _quitar_keys(ob, nombres):
    """borra esas shape keys de ob (y el Basis si es lo único que queda). -> cuántas."""
    sk = ob.data.shape_keys
    if not sk:
        return 0
    n = 0
    for k in [k for k in sk.key_blocks[1:] if k.name in nombres]:
        ob.shape_key_remove(k); n += 1
    if ob.data.shape_keys and len(ob.data.shape_keys.key_blocks) == 1:
        ob.shape_key_remove(ob.data.shape_keys.key_blocks[0])
    return n


def rehacer(cara, desde):
    """0.6.9: deshace lo que hicieron los pasos de la línea completa desde `desde` (id de linea.COMPLETA) hasta el
    final y los olvida, para repetirlos con siguiente() sin restos. Solo toca lo de la cara FACS (keys FACS y
    correctivas, drivers, <cara>_Cara_Control, delineado, rig viejo apagado, original guardado); marcadores, rig de
    labios, ojos y piezas se quedan (sus pasos toleran repetirse). facs_densificado se conserva (la topología no vuelve).
    F_boca y F_ojos comparten keys: desde cualquiera de ellos (o antes) se deshace toda la malla FACS.
    Con la malla ya procesada el `desde` se sube a primer_paso_seguro() (los pasos que tocan vértices quedan hechos)."""
    from . import linea as LN
    from .facs import geometria as G, construir as C, delineado_uv as DU
    util.modo_objeto()
    ids = LN.ids('COMPLETA')
    if desde not in ids:
        raise ValueError(f'desde debe ser uno de {ids}')
    k = ids.index(desde)
    pos = lambda i: ids.index(i)
    conservar = None
    if malla_procesada(cara):
        seguro = primer_paso_seguro(cara)
        if k < pos(seguro):
            k = pos(seguro)
            conservar = f'La malla ya está modificada: se rehace desde «{_titulo_paso(seguro)}». Para volver al principio hace falta el modelo original.'
    fk = set(cara.get('facs_keys', []))
    piezas = [o for o in bpy.data.objects if o.parent == cara and o.get('facs_pieza')]
    piezas_keys = [o for o in C.Piezas(cara).todas() if o is not None]
    hecho = {}
    if k <= pos('F_terminar'):
        n = 0
        for o in piezas_keys + piezas:
            n += _quitar_drivers(o, set(o.data.shape_keys.key_blocks.keys()) & (fk | set(C.CORRECTIVAS))) if o.data.shape_keys else 0
        n += _quitar_drivers(cara, set(C.CORRECTIVAS))
        rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
        for m in cara.modifiers:
            if (m.type == 'ARMATURE' and m.object == rig) or m.type == 'CORRECTIVE_SMOOTH':
                m.show_viewport = m.show_render = True
        if rig is not None:
            try:
                rig.hide_set(False)
            except Exception:
                pass
        sk = cara.data.shape_keys
        if sk:
            for kb in sk.key_blocks[1:]:
                if kb.name not in fk and kb.mute:
                    kb.mute = False
        hecho['terminar'] = {'drivers_quitados': n, 'rig_viejo': 'encendido'}
    if k <= pos('F_controles'):
        n = _quitar_drivers(cara, fk)
        ctl = bpy.data.objects.get(f'{cara.name}_Cara_Control')
        if ctl is not None:
            d = ctl.data; bpy.data.objects.remove(ctl)
            if d is not None and getattr(d, 'users', 1) == 0:
                bpy.data.armatures.remove(d)
        hecho['controles'] = {'drivers_quitados': n, 'control': ctl is not None}
    if k <= pos('F_delineado'):
        hecho['delineado'] = DU.quitar(cara)
        for o in [o for o in piezas if o.get('facs_pieza') in ('delineado', 'borde_parpado')]:
            bpy.data.objects.remove(o)
    if k <= pos('F_ojos'):
        nk = _quitar_keys(cara, fk)
        for o in piezas_keys:
            nk += _quitar_keys(o, fk | set(o.get('facs_keys', [])))
        for key in ('facs_keys', 'facs_preparada'):
            if key in cara:
                del cara[key]
        base = 'sin original guardado'
        if G.ATTR in cara.data.attributes:
            if len(cara.data.attributes[G.ATTR].data) == len(cara.data.vertices):
                G.restaurar_original(cara); base = 'Basis vuelve al original'
            else:
                base = 'el original no casa con la malla: Basis sin tocar'
            cara.data.attributes.remove(cara.data.attributes[G.ATTR])
        hecho['malla_facs'] = {'keys_quitadas': nk, 'basis': base}
    if k <= pos('F_controles'):         # cambian los canales: las acciones del editor ya no valen
        acc = [a for a in bpy.data.actions if a.name.startswith(f'{cara.name}_FACS_')]
        for a in acc:
            bpy.data.actions.remove(a)
        hecho['acciones_expresion'] = len(acc)
    if 'rlb_revisado' in cara:
        del cara['rlb_revisado']
    LN.olvidar(cara, *ids[k:])
    if conservar:
        LN.marcar(cara, *ids[:k])              # los pasos que no se pueden repetir quedan hechos
        return {'deshecho': hecho, 'desde': desde, 'estado': estado(cara), 'avisos': [conservar]}
    return {'deshecho': hecho, 'desde': desde, 'estado': estado(cara)}


def _medida_parpados(cara):
    from .facs import pipeline as FP
    m = FP.medir_parpados(cara)
    filas = [v for v in m.values() if isinstance(v, dict)]
    res = {'dentro_globo_max': max((v.get('dentro_globo', 0) for v in filas), default=0),
           'invertidos_max': max((v.get('invertidos', 0) for v in filas), default=0),
           'ojo_visible_cerrado_%': {k[-1]: v['ojo_visible_%'] for k, v in m.items()
                                     if k.startswith('eyeBlink_') and 'ojo_visible_%' in v}}
    av = []
    if res['dentro_globo_max'] > 0:
        av.append(f"Párpados: {res['dentro_globo_max']} vértices dentro del globo en alguna pose.")
    peor = max(res['ojo_visible_cerrado_%'].values(), default=0)
    if peor > 8:      # 0.8.45: la medida cuenta rayos rasantes en el pliegue; con el lazo real un cierre limpio da 4–6 %
        av.append(f'Párpados: con el ojo cerrado se ve un {peor} % del globo (rendija). Mira la hoja ojo / ojo_R.')
    av.extend(_aviso_globos(cara))
    return res, av


def _aviso_globos(cara):
    """0.8.45 (Pegazo): un globo adelantado o descentrado frente a su abertura estropea el párpado de ese lado y hereda el fallo en
    cejas y controles. Compara cada globo con el lazo del borde, y un ojo con el otro."""
    from .facs import pipeline as FP
    K, _ = FP.contexto(cara)
    O = FP._ojos_de(cara, K)
    med, av = {}, []
    for l, o in O.items():
        lazo = cara.get(f'facs_anillo_{l}')
        if not lazo:
            continue
        q = K.P[json.loads(lazo)] - o.c
        med[l] = (float((q @ K.X).mean()) * 1000, float((q @ K.Z).mean()) * 1000, float(np.median(np.linalg.norm(q, axis=1)) - o.r) * 1000)
        if abs(med[l][0]) > 2.5:
            av.append(f'Ojo {l}: el globo está {med[l][0]:.1f} mm a un lado de su abertura. Corrígelo con pasos.ojos_poner.')
    if len(med) == 2 and abs(med['L'][2] - med['R'][2]) > 1.2:
        av.append(f"Ojos desiguales: el borde queda {med['L'][2]:.1f} mm (L) y {med['R'][2]:.1f} mm (R) por fuera del globo. "
                  'Iguálalos con pasos.ojos_poner.')
    return av


PERMISOS_TODOS = {'aplicar_transformacion': True, 'centrar': True, 'borrar_shape_keys': True}


def _permisos(p):
    """None -> sin permisos (para y pregunta); 'todos'/True -> los tres; dict -> tal cual."""
    if p in (None, False):
        return {}
    if p is True or p == 'todos':
        return dict(PERMISOS_TODOS)
    return dict(p)


def siguiente(cara, punto_boca=None, color_ojos='castano', permisos=None):
    """Igual que antes, y desde 0.8.2:
      - el personaje se trae solo al origen para el paso y se devuelve a su sitio (posicion.en_origen): ya no hace falta
        «aplicar la transformación» por tenerlo desplazado en la escena, ni quitar de en medio a los demás personajes;
      - permisos={'aplicar_transformacion','centrar','borrar_shape_keys'} (o 'todos'): con ellos el paso `analizar` hace lo
        que antes obligaba a parar y preguntar (rotación/escala horneadas, cara centrada en X, shape keys previas fuera);
      - los marcadores y los visemas se validan con NÚMEROS (validar.py): no se para en una foto si salen bien; solo se para
        (y se saca la foto) si algo falla o hace falta una decisión humana. Para encadenar los 19 pasos en una sola llamada, auto_iniciar().
    """
    exigir_codigo_al_dia()
    p = _permisos(permisos)
    with PO.en_origen(cara):
        return _siguiente(cara, punto_boca, color_ojos, p)


def _siguiente(cara, punto_boca=None, color_ojos='castano', permisos=None):
    """Hace el SIGUIENTE paso pendiente de la línea completa (la del panel: 19 pasos, boca + ojos + cara FACS + prueba de habla) y
    dice cómo ha ido. Pensado para llamarlo en bucle por MCP (cada llamada cabe en el tiempo límite):
        r = pasos.siguiente(cara)   ->  {'hecho', 'n', 'de', 'resumen', 'avisos', 'parar', 'siguiente'}
    Si 'parar' es True: lee 'avisos', resuélvelo (o pregunta al usuario) y vuelve a llamar. Con 'siguiente' None
    está terminado y 'resumen' trae las hojas de revisión. Nunca se salta pasos."""
    from . import linea as LN
    from .facs import pipeline as FP
    sig = LN.siguiente(cara, 'COMPLETA')
    if sig is None:
        # la revisión va en su propia llamada (terminar + medir + 25 renders no caben en el tiempo límite del MCP)
        if cara.get('rlb_revisado'):
            return {'hecho': None, 'siguiente': None, 'parar': False, 'avisos': [],
                    'resumen': 'La línea ya está terminada y revisada (pasos.revisar(cara) para repetir las hojas)'}
        # 0.8.2: medidas numéricas (párpados, marcadores, visemas) + UNA hoja resumen (10 casillas) en vez de cinco hojas de
        # diez poses y 50 renders. Las hojas completas siguen disponibles: pasos.revisar(cara, completo=True).
        m, avisos = _medida_parpados(cara)
        vm, vv = VA.marcadores(cara), VA.visemas(cara)
        avisos += vm['problemas'] + vv['problemas']
        rv = revisar(cara)
        cara['rlb_revisado'] = True
        avisos.append('Abre hoja_resumen (Read): arriba la boca (reposo, abierta, sonrisa, risa, sorpresa), abajo el ojo (reposo, '
                      'medio cerrado, enojo, guiño, sorpresa). Busca desgarros o piezas del interior asomando por los labios, '
                      'párpados rotos y delineado cortado. Lo numérico ya está medido en `numeros`.')
        return {'hecho': 'revision', 'siguiente': None, 'parar': False, 'avisos': avisos,
                'resumen': {'parpados': m, 'numeros': 'ok' if (vm['ok'] and vv['ok']) else 'ver avisos',
                            'hoja': rv['hojas'].get('resumen'), 'carpeta_temporal': rv['carpeta_temporal']}}
    pid = sig[0]
    avisos, parar = [], False
    if pid == 'analizar':
        sold = None
        if not cara.data.shape_keys and duplicados(cara) > 0.01 * len(cara.data.vertices):
            sold = soldar(cara)
        r = analizar(cara)
        permisos = permisos or {}
        if not r['transform_ok'] and permisos.get('aplicar_transformacion'):
            PO.traer_al_origen(cara)                         # rotación/escala dentro de la malla; la traslación se recuerda
            r = analizar(cara)
        if not r['centrado_x'] and permisos.get('centrar'):
            PO.centrar_x(cara, r['centro_x_mm'] / 1000.0)
            r = analizar(cara)
        if r['shape_keys'] and permisos.get('borrar_shape_keys'):
            r['avisos'] = [a for a in r['avisos'] if not a.startswith('Ya tiene shape keys')]
            avisos.append(f"Shape keys previas ({len(r['shape_keys'])}): las borrará «Arreglar malla» (permiso dado).")
        avisos = r['avisos'] + avisos
        if sold:
            avisos.append(f"Vértices partidos en las costuras UV (GLB de Tripo): soldados {sold['vertices_antes']} → "
                          f"{sold['vertices_despues']} (no cambia el aspecto).")
        bloquea = (not r['transform_ok']) or (not r['centrado_x'])
        if bloquea:
            return {'hecho': None, 'siguiente': 'analizar', 'parar': True, 'avisos': avisos,
                    'resumen': _corto({k: r[k] for k in ('transform_ok', 'centrado_x', 'centro_x_mm')})}
        res = {k: r[k] for k in ('vertices', 'paso_cuantizacion', 'normales_custom', 'aristas_no_manifold')}
        res['islas'] = r['islas']['n_islas']
    elif _procesada_firme(cara) and LN.ids('COMPLETA').index(pid) < LN.ids('COMPLETA').index(primer_paso_seguro(cara))             and pid != 'detectar':
        # nunca se ejecuta un paso inseguro sobre malla procesada: se da por hecho y se avisa
        LN.marcar(cara, pid)
        e = estado(cara)
        return {'hecho': pid, 'n': e['n'], 'de': e['de'], 'siguiente': e['siguiente'], 'parar': False,
                'avisos': [f'«{_titulo_paso(pid)}» no se repite: la malla ya está modificada y rehacerlo la '
                           'rompería (se da por hecho sin ejecutarlo).'], 'resumen': 'omitido'}
    elif pid == 'detectar' and malla_procesada(cara):
        LN.marcar(cara, 'detectar')
        return {'hecho': 'detectar', 'siguiente': 'arreglar', 'parar': True, 'avisos': [AVISO_MALLA_PROCESADA],
                'resumen': {'foto_marcadores': foto_marcadores(cara)}}
    elif pid == 'detectar':
        auto = None
        if punto_boca is None:
            auto = deteccion.buscar_boca(cara)
            punto_boca = auto['punto']
        r = detectar(cara, punto_boca, foto=False)       # todo sale de la malla: la foto no hace falta
        avisos = list(r.get('avisos', []))
        if auto is not None and not auto['seguro']:
            avisos.append('La boca se encontró sin ojos que la confirmen: comprueba los marcadores de la boca '
                          f"(candidatos: {auto['candidatos'][:4]}) o repite con siguiente(cara, punto_boca=(0, y, z)).")
        parar = bool(avisos)
        res = {k: r[k] for k in ('comisura_mm', 'escala_vs_vale', 'ojos_hueco', 'ojos_esculpidos', 'radio_ojo_mm')}
        res['punto_boca'] = [round(v, 4) for v in punto_boca]
        res['islas'] = partes.resumen_islas(cara)          # {nombre: [nº islas, vértices]}
        res['cejas'] = r['cejas']
        cp = ceja_pegada(cara)
        if cp:
            res['ceja_pegada'] = cp     # no para: «Arreglar malla» (el paso siguiente) la separa como isla propia
        elif any(v is None or v < 0 for v in r['cejas'].values()):
            avisos.append(f"Cejas: {r['cejas']} (−1 = no encontrada). Si el personaje tiene esa ceja y está pegada a la piel "
                          'sin que la otra sea isla suelta, sepárala a mano como isla propia en el mismo objeto (Edit '
                          'Mode, caras de la ceja, Mesh > Split > Selection [Y]) y repite detectar: pegada, el párpado '
                          'la arrastra al cerrar.')
        try:
            dp = PT.diagnosticar(cara)
            res['pestanas_tripo'] = {k: dp[k] for k in ('metodo', 'seguridad', 'lados', 'accion')}
            if dp['seguridad'] == 'baja' or dp['dudosas']:
                avisos.append('Pestañas de Tripo: ' + dp['accion'])
        except Exception as e:           # el diagnóstico nunca bloquea la detección
            res['pestanas_tripo'] = f'no se pudo diagnosticar: {e}'
        # 0.8.2: los marcadores se validan con números (validar.marcadores): la foto solo se saca, y solo hace falta mirarla,
        # si algo no cuadra. Antes se paraba SIEMPRE para mirar una imagen (1 render + 1 lectura de imagen por personaje).
        val = VA.marcadores(cara)
        res['validacion'] = 'ok' if val['ok'] else val['problemas']
        if val['ok'] and not avisos:
            LN.marcar(cara, 'detectar')
            return {'hecho': 'detectar', 'siguiente': 'arreglar', 'parar': False,
                    'avisos': ['Marcadores validados con números (sin foto). Si quieres verlos: pasos.foto_marcadores(cara).'],
                    'resumen': _corto(res)}
        res['foto_marcadores'] = foto_marcadores(cara)
        avisos = list(val['problemas']) + avisos
        avisos.append('Mira foto_marcadores (Read): rojo comisuras en las esquinas de la boca, azul centro de cada '
                      'labio, verde el globo encajado en el ojo, amarillo pivote delante de la oreja, naranja dentro '
                      'del mentón. Corrige el empty que esté mal (RLB_<cara>_*) o repite pasos.detectar(cara, punto); '
                      'si está bien, llama otra vez a siguiente().')
        LN.marcar(cara, 'detectar')
        return {'hecho': 'detectar', 'siguiente': 'arreglar', 'parar': True, 'avisos': avisos, 'resumen': _corto(res)}
    elif pid == 'arreglar':
        res = arreglar(cara)
        cp = res.get('ceja_pegada')
        if cp and cp.get('separada'):
            avisos.append(f"Ceja {cp['separada']} pegada a la piel: separada como isla propia ({cp['caras']} caras, "
                          f"por {cp['metodo']}). Los párpados ya no la arrastran.")
        elif cp:
            parar = True
            avisos.append(f"Ceja pegada a la piel sin separar (solo {cp.get('caras')} caras en espejo y sin isla UV propia). "
                          f"{cp.get('error', '')} Sepárala a mano como isla propia en el mismo objeto (Edit Mode, "
                          'seleccionar las caras de la ceja, Mesh > Split > Selection [Y]) y repite desde detectar: '
                          'pegada, el párpado la arrastra.')
    elif pid == 'abrir_ojos':
        pt = quitar_pestanas(cara)               # 0.7.2: las pestañas de Tripo se van ANTES de tocar los ojos y el rig
        res = {'pestanas_tripo': pt, 'abrir': abrir_ojos(cara)}
        if isinstance(pt, dict) and (pt.get('manual') or pt.get('aviso')):
            avisos.append(pt.get('aviso', 'Pestañas de Tripo dudosas: pasos.pestanas_seleccionar / quitar_pestanas_manual.'))
            parar = bool(pt.get('manual'))
    elif pid == 'rig':
        res = rig_labios(cara)
    elif pid == 'pesos':
        res = pesos(cara)
    elif pid == 'interior':
        res = boca_interior(cara)
    elif pid == 'ojos' and MK.cfg(cara).get('ojos_tripo'):
        res = 'globos de Tripo reutilizados (pasos.ojos_tripo)'
    elif pid == 'ojos':
        if 'pestanas_tripo_quitadas' not in MK.cfg(cara):      # sin ojos esculpidos no pasó por abrir_ojos
            quitar_pestanas(cara)
        res = ojos_lian(cara, color_ojos)
    elif pid == 'parpados':
        res = parpados(cara)
    elif pid == 'cuenca':
        res = cuenca(cara)
    elif pid == 'oclusion':
        res = oclusion(cara)
    elif pid == 'F_expresiones':
        from .facs import poses as PO
        res = {'expresiones': len(PO.crear(cara))}
        try:
            bpy.context.scene.rlb.cara = cara           # el «Editor de expresiones» parte de la cara elegida
        except Exception:
            pass
        avisos.append('Línea hecha: el usuario edita las expresiones en el panel «Editor de expresiones» (pestaña Rig '
                      'labial). Llama otra vez a siguiente() para medir los párpados y sacar las hojas.')
        if 'rlb_revisado' in cara:
            del cara['rlb_revisado']
    elif pid == 'F_habla':
        frase = f'Hola, ¿qué tal? Me llamo {cara.name.strip()}.'
        res = {'frase': frase, **hablar(cara, frase)}
        vis = VA.visemas(cara)
        res['visemas'] = 'ok' if vis['ok'] else vis['problemas']
        if vis['ok']:
            LN.marcar(cara, pid)
            e = estado(cara)
            return {'hecho': pid, 'n': e['n'], 'de': e['de'], 'siguiente': e['siguiente'], 'parar': False,
                    'avisos': ['Visemas medidos con números (A abre, MBP cierra, O/U redondean y adelantan, E/I estiran): bien. '
                               'Si quieres verlos: pasos.foto_habla(cara).'],
                    'resumen': _corto(res)}
        ruta = foto_habla(cara)
        res['foto_habla'] = ruta
        avisos = list(vis['problemas']) + avisos
        LN.marcar(cara, pid)
        e = estado(cara)
        avisos.append('Mira foto_habla (Read): visemas A E I O U MBP FV, fila de arriba de frente y la de abajo de perfil. '
                      'M/B/P: labios cerrados, apretados. O y U: boca redonda y labios adelantados (U más pequeña). '
                      'A: boca abierta con dientes y lengua sin atravesar los labios. FV: diente de arriba sobre el labio '
                      'de abajo. I/E: boca estirada. Si algo falla, díselo al usuario; si está bien, llama otra vez a siguiente().')
        return {'hecho': pid, 'n': e['n'], 'de': e['de'], 'siguiente': e['siguiente'], 'parar': True,
                'avisos': avisos, 'resumen': _corto(res)}
    elif pid.startswith('F_'):
        res = getattr(FP, pid[2:])(cara)
        if 'rlb_revisado' in cara:
            del cara['rlb_revisado']
    else:
        raise RuntimeError(f'Paso desconocido: {pid}')
    LN.marcar(cara, pid)
    e = estado(cara)
    return {'hecho': pid, 'n': e['n'], 'de': e['de'], 'siguiente': e['siguiente'], 'parar': parar,
            'avisos': avisos, 'resumen': _corto(res)}


# ---------------------------------------------------------------- 0.8.2: todo en una llamada y posición en la escena
def auto_iniciar(cara, permisos='todos', punto_boca=None, color_ojos='castano', hasta=None):
    """Rig facial completo (19 pasos + revisión) en SEGUNDO PLANO: esta llamada vuelve al instante y Blender hace un paso por
    tick (sin tiempo límite de MCP). Consulta auto_estado(cara) un rato después. Se para solo si hay que decidir algo
    (avisos), si algo falla (error) o al terminar (hoja = hoja_resumen.png: ábrela con Read, es la única imagen que hace
    falta mirar). Para repetirlo tras resolver una parada: auto_iniciar otra vez (sigue donde estaba)."""
    exigir_codigo_al_dia()
    from . import ejecutor
    return ejecutor.iniciar(cara, permisos, punto_boca, color_ojos, hasta)


def auto_estado(cara=None):
    from . import ejecutor
    return ejecutor.estado(cara)


def auto_detener():
    from . import ejecutor
    return ejecutor.detener()


def centrar(cara):
    """lleva el personaje al origen (X=Y=Z=0) con todo lo suyo, recordando dónde estaba (cara['rlb_offset_mundo'])."""
    return PO.traer_al_origen(cara)


def devolver(cara):
    """vuelve el personaje a su sitio original en la escena (lo contrario de centrar)."""
    return PO.devolver(cara)


def revisar_ojos(cara, lado='L', poses=None, vistas=None):
    """hoja de párpados y cejas (cierre en pasos; vistas 'frente', '34', 'perfil')."""
    from . import dientes_apariencia as DA
    with DA.anatomico(), PO.en_origen(cara), PO.aislado(cara):
        M = MK.Marco(cara); rig = _rig(M)
        return revision.render_ojos(cara, rig, M, lado, poses, vistas=vistas)


def comprobar_parpados(cara):
    """rayos de frente con los ojos cerrados: 'ojo_visible' tiene que ser 0 (si no, rendija al cerrar)."""
    from . import parpados_huesos as PH
    M = MK.Marco(cara); rig = _rig(M)
    piv = ojos._pivotes(cara, M)
    act = rig.animation_data.action if rig.animation_data else None
    if act: rig.animation_data.action = None
    try:
        return PH.medir_rendija(cara, rig, piv, M.ojo('L')[1] * 1.1)
    finally:
        if act: rig.animation_data.action = act


def medir_contacto(cara):
    """separación 3D y cruce de los bordes de los párpados al cerrar (mm), con el inferior en 0, 0,25 y 1."""
    from . import contacto
    M = MK.Marco(cara); rig = _rig(M)
    return contacto.medir(cara, rig, M)


def contacto_parpados(cara, parametros=None):
    """rehace solo las correctivas de contacto y el ajuste del entornado (sin rehacer los párpados)."""
    from . import contacto
    M = MK.Marco(cara); rig = _rig(M)
    return contacto.construir(cara, rig, M, dict(ojos.PARAM, **(parametros or {})))
