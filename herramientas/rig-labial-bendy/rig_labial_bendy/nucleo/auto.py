# Automatismos (0.6.9): que el personaje con rig aparezca solo en el panel y las expresiones salgan abajo como en Lian.
#   1. al cambiar el objeto activo: scene.rlb.cara = la cara a la que pertenece (cara, control, rig, piezas, marcadores);
#   2. estantería de expresiones (abajo del visor 3D) abierta una vez por cambio de cara;
#   3. si la cara tiene control FACS y ninguna acción <cara>_FACS_*, se crean (diferido con un timer, una vez por sesión);
#   4. load_post: lo mismo al abrir un .blend.
# El handler de depsgraph solo compara el nombre del objeto activo con el último visto.
import bpy
from bpy.app.handlers import persistent

_visto = [None]          # (nombre del activo)
_cara_estanteria = [None]
_ocultados = set()       # caras terminadas cuyo rig viejo ya se ocultó en esta sesión
_creadas = set()         # caras cuyas expresiones ya se programaron en esta sesión
_cambiando = [False]


def _con_rig(ob):
    return ob is not None and ob.type == 'MESH' and (
        (ob.name + '_Cara_Control') in bpy.data.objects or 'rlb_cfg' in ob.keys())


def cara_de_objeto(ob):
    """la cara con rig a la que pertenece ob (ella misma, su control, rig, piezas, ojos o marcadores) o None."""
    if ob is None:
        return None
    if _con_rig(ob):
        return ob
    n = ob.get('facs_cara')
    if n and _con_rig(bpy.data.objects.get(n)):
        return bpy.data.objects[n]
    parent = ob.parent
    while parent is not None:
        if _con_rig(parent):
            return parent
        n = parent.get('facs_cara')
        if n and _con_rig(bpy.data.objects.get(n)):
            return bpy.data.objects[n]
        parent = parent.parent
    mejor = None
    for c in bpy.data.objects:
        if not _con_rig(c):
            continue
        if ob.name.startswith(c.name + '_') or ob.name.startswith('RLB_' + c.name + '_'):
            if mejor is None or len(c.name) > len(mejor.name):
                mejor = c
    return mejor


def tiene_control(cara):
    return cara is not None and (cara.name + '_Cara_Control') in bpy.data.objects


def sin_expresiones(cara):
    return tiene_control(cara) and not any(a.name.startswith(f'{cara.name}_FACS_') for a in bpy.data.actions)


def terminada(cara):
    """la cara FACS está construida (control + drivers terminados): el panel de construcción se pliega."""
    if not tiene_control(cara):
        return False
    try:
        from . import linea as LN
        return 'F_terminar' in LN.hechos(cara)
    except Exception:
        return False


def _abrir_estanteria(context):
    n = 0
    wm = getattr(context, 'window_manager', None) or bpy.context.window_manager
    for w in wm.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                for s in a.spaces:
                    if s.type == 'VIEW_3D' and hasattr(s, 'show_region_asset_shelf'):
                        s.show_region_asset_shelf = True; n += 1
    return n


def _crear_expresiones(nombre):
    """timer: crea las acciones de expresión de la cara (poses.crear) y marca el paso F_expresiones."""
    cara = bpy.data.objects.get(nombre)
    if cara is None or not tiene_control(cara):
        return None
    try:
        from .facs import integracion
        r = integracion.preparar(cara)
        n = len(r['expresiones_creadas'])
        _informe(f'Rig labial: creadas {n} expresiones de {nombre} (estantería abajo del visor 3D)')
    except Exception as e:
        _creadas.discard(nombre)
        _informe(f'Rig labial: no pude crear las expresiones de {nombre}: {e}')
    return None


def elegir(context, cara):
    """Mismo cambio desde selección, selector del panel y operadores."""
    if _cambiando[0] or cara is None:
        return
    _cambiando[0] = True
    try:
        activo = context.view_layer.objects.active if context.view_layer else None
        if cara_de_objeto(activo) is not cara and cara.name in context.view_layer.objects:
            context.view_layer.objects.active = cara
            cara.select_set(True)
        from .facs import editor as ED
        ED.cambiar_personaje(context, cara)
    finally:
        _cambiando[0] = False


def _informe(txt):
    try:
        bpy.context.scene.rlb.informe = txt
        wm = bpy.context.window_manager
        for w in wm.windows:
            w.workspace.status_text_set(txt)
    except Exception:
        pass


def editor_obsoleto(context=None):
    """el editor sigue «activo» pero su acción o su control ya no existen (o no son de la cara elegida)."""
    context = context or bpy.context
    ed = getattr(context.scene, 'rlb_editor', None)
    if ed is None or not ed.activo:
        return False
    p = getattr(context.scene, 'rlb', None)
    cara = getattr(p, 'cara', None)
    return (bpy.data.actions.get(ed.accion) is None or bpy.data.objects.get(ed.control) is None
            or (cara is not None and ed.control != cara.name + '_Cara_Control'))


def salir_editor_obsoleto(context=None):
    context = context or bpy.context
    if not editor_obsoleto(context):
        return False
    from .facs import editor as ED
    try:
        ED._salir(context, context.scene.rlb_editor)
    except Exception:
        ed = context.scene.rlb_editor
        ed.activo = False; ed.accion = ''
    return True


_salida_prog = [False]


def programar_salida():
    """desde draw (sin escribir propiedades ahí): sale del editor obsoleto en un timer."""
    if _salida_prog[0]:
        return
    _salida_prog[0] = True
    def _t():
        _salida_prog[0] = False
        salir_editor_obsoleto()
        return None
    bpy.app.timers.register(_t, first_interval=0.1)


def aplicar(context=None, forzar=False, simular=False):
    """sigue al objeto activo. -> dict de lo que hizo (o haría con simular=True)."""
    context = context or bpy.context
    sc = context.scene
    p = getattr(sc, 'rlb', None)
    if p is None:
        return {}
    ob = context.view_layer.objects.active if context.view_layer else None
    cara = cara_de_objeto(ob)
    r = {'cara': cara.name if cara else None}
    if cara is None:
        return r
    ed = getattr(sc, 'rlb_editor', None)
    if p.cara != cara or (ed is not None and ed.activo and ed.control != cara.name + '_Cara_Control'):
        r['cara_elegida'] = True
        if not simular:
            elegir(context, cara)
    elif editor_obsoleto(context):
        r['editor_obsoleto'] = True
        if not simular:
            salir_editor_obsoleto(context)
    if tiene_control(cara):
        if cara.name not in _ocultados and terminada(cara):
            r['rig_viejo_oculto'] = True
            if not simular:
                _ocultados.add(cara.name)
                rv = bpy.data.objects.get(cara.name + '_Rig_Labios')
                if rv is not None:
                    bpy.app.timers.register(lambda o=rv: (o.hide_set(True), None)[1], first_interval=0.1)
        if _cara_estanteria[0] != cara.name or forzar:
            r['estanteria'] = True
            if not simular:
                _abrir_estanteria(context); _cara_estanteria[0] = cara.name
        from .facs import integracion
        if terminada(cara) and integracion.pendiente(cara) and cara.name not in _creadas:
            r['crear_expresiones'] = True
            if not simular:
                _creadas.add(cara.name)
                bpy.app.timers.register(lambda n=cara.name: _crear_expresiones(n), first_interval=0.1)
    return r


@persistent
def _depsgraph(scene, depsgraph=None):
    try:
        ob = bpy.context.view_layer.objects.active
    except Exception:
        return
    n = ob.name if ob else None
    if n == _visto[0] and getattr(bpy.context.scene.rlb, 'cara', 1) is not None:
        return
    _visto[0] = n
    try:
        aplicar(bpy.context)
    except Exception:
        pass


@persistent
def _cargar(_=None):
    _visto[0] = None; _cara_estanteria[0] = None
    _ocultados.clear(); _creadas.clear()    # marcas «una vez por sesión»: un archivo nuevo empieza de cero
    _suscribir()
    # tras abrir el archivo: un momento después (la interfaz aún se está montando)
    bpy.app.timers.register(lambda: (aplicar(bpy.context, forzar=True), None)[1], first_interval=0.5)


_dueno = bpy.app.driver_namespace.setdefault('_rlb_msgbus_owner', object())   # estable al recargar


def _suscribir():
    bpy.msgbus.clear_by_owner(_dueno)
    bpy.msgbus.subscribe_rna(key=(bpy.types.LayerObjects, 'active'), owner=_dueno, args=(),
                             notify=lambda: aplicar(bpy.context))


def _quitar_viejos():
    for lista in (bpy.app.handlers.depsgraph_update_post, bpy.app.handlers.load_post):
        for f in list(lista):
            if getattr(f, '_rlb_auto', False):
                lista.remove(f)


def register():
    _quitar_viejos()
    _depsgraph._rlb_auto = True; _cargar._rlb_auto = True
    bpy.app.handlers.depsgraph_update_post.append(_depsgraph)
    bpy.app.handlers.load_post.append(_cargar)
    _suscribir()
    _visto[0] = None; _cara_estanteria[0] = None
    bpy.app.timers.register(lambda: (aplicar(bpy.context, forzar=True), None)[1], first_interval=0.5)


def unregister():
    from .facs import integracion
    integracion.cancelar_miniaturas()
    bpy.msgbus.clear_by_owner(_dueno)
    _quitar_viejos()
