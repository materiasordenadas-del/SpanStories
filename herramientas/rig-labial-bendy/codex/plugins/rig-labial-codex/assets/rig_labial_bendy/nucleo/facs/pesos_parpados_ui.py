"""Controles de influencia y pintura protegida de párpados."""
import json
import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, EnumProperty, FloatProperty, PointerProperty, StringProperty
from . import pesos_parpados as M

ESTADO = 'rlb_parpado_pintura_estado'
EASY = ('auto_clean_weights', 'always_auto_normalize', 'always_multipaint',
        'always_reveal_armature', 'always_unify_brush_settings')
_pintando = []


def _editor():
    from . import editor
    return editor


def _cara(context): return _editor()._cara(context)


def _prefs(context, nombre):
    addon = context.preferences.addons.get(nombre)
    return addon.preferences if addon else None


def _restaurar(cara, context):
    texto = cara.get(ESTADO)
    if not texto: return
    estado = json.loads(texto)
    for nombre, valor in estado['grupos'].items():
        g = cara.vertex_groups.get(nombre)
        if g is not None: g.lock_weight = valor
    for nombre, valores in estado.get('easy', {}).items():
        prefs = _prefs(context, nombre)
        if prefs:
            for n, v in valores.items(): setattr(prefs, n, v)
    escena = bpy.data.scenes.get(estado['escena'])
    if escena:
        for n, v in estado['ajustes'].items(): setattr(escena.tool_settings, n, v)
    del cara[ESTADO]


def _proteger(cara, punto, context):
    if cara.get(ESTADO): raise RuntimeError('Ya hay una pintura de párpado en curso')
    ts = context.scene.tool_settings
    ajustes = {n: getattr(ts, n) for n in ('use_auto_normalize', 'use_multipaint') if hasattr(ts, n)}
    easy = {}
    for addon in context.preferences.addons:
        if addon.module.split('.')[-1] != 'easyweight': continue
        prefs = addon.preferences
        easy[addon.module] = {n: getattr(prefs, n) for n in EASY if hasattr(prefs, n)}
    estado = {'grupos': {g.name: g.lock_weight for g in cara.vertex_groups}, 'ajustes': ajustes,
              'escena': context.scene.name, 'easy': easy}
    cara[ESTADO] = json.dumps(estado)
    try:
        for nombre, valores in easy.items():
            prefs = _prefs(context, nombre)
            for n in valores: setattr(prefs, n, False)
        for g in cara.vertex_groups: g.lock_weight = True
        M.grupo(cara, punto).lock_weight = False
        for n in ajustes: setattr(ts, n, False)
        if cara not in _pintando: _pintando.append(cara)
    except Exception:
        _restaurar(cara, context)
        raise


def _vigilar():
    for cara in list(_pintando):
        try:
            if cara.mode != 'WEIGHT_PAINT':
                _restaurar(cara, bpy.context); _pintando.remove(cara)
        except ReferenceError: _pintando.remove(cara)
    return .5


@persistent
def _cargar(_=None):
    _pintando[:] = [o for o in bpy.data.objects if o.get(ESTADO)]


class RLB_PesosParpados(bpy.types.PropertyGroup):
    abierto: BoolProperty(name='Influencia por punto', default=False)
    intensidad: FloatProperty(name='Intensidad del peso', min=0., max=5., default=1.)
    longitudinal: FloatProperty(name='Extensión a lo largo', min=.25, max=2., default=1.)
    transversal: FloatProperty(name='Extensión hacia la piel', min=.25, max=2., default=1.)
    punto_cargado: StringProperty()
    informe: StringProperty()


class RLB_OT_pesos_parpados(bpy.types.Operator):
    bl_idname = 'rlb.pesos_parpados'
    bl_label = 'Influencias de párpados'
    bl_options = {'REGISTER', 'UNDO'}
    accion: EnumProperty(items=[(x, x, '') for x in ('PINTAR', 'APLICAR', 'AUTOMATICO', 'MOVER', 'REASIGNAR', 'CARGAR', 'AJUSTAR')])

    def execute(self, context):
        cara = _cara(context); p = context.scene.rlb_pesos_parpados
        try:
            if cara is None or not context.scene.rlb_editor.activo: raise RuntimeError('Primero edita una expresión')
            if _editor()._arr: raise RuntimeError('Suelta el punto antes de pintar')
            punto = context.scene.rlb_editor.punto
            seleccion = _editor().puntos_parpado_seleccion(context.scene.rlb_editor)
            clave = '|'.join(seleccion)
            if context.object and context.object != cara and context.object.mode != 'OBJECT':
                raise RuntimeError('Termina la edición del otro objeto')
            if cara.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
            _restaurar(cara, context)
            if self.accion == 'CARGAR':
                for n, v in M.opciones_punto(cara, punto).items(): setattr(p, n, v)
                p.punto_cargado = clave
                p.informe = 'Ajustes cargados. Cambia los valores y pulsa Aplicar influencia.'
            elif self.accion == 'AJUSTAR':
                if p.punto_cargado != clave: raise RuntimeError('Carga primero los ajustes de la selección actual')
                M.aplicar_varios(cara, seleccion, intensidad=p.intensidad, longitudinal=p.longitudinal, transversal=p.transversal)
                p.informe = f'Influencia actualizada en {len(seleccion)} punto(s).'
            elif self.accion == 'REASIGNAR':
                M.reasignar(cara)
                p.informe = 'Juego anterior conservado; revisa y vuelve a aplicar los grupos pintados.'
            elif self.accion == 'PINTAR':
                if cara.hide_get() or cara.hide_viewport: raise RuntimeError('Muestra la cara antes de pintar')
                for o in context.selected_objects:
                    if o != cara: o.select_set(False)
                cara.select_set(True); context.view_layer.objects.active = cara
                g = M.preparar_grupo(cara, punto); cara.vertex_groups.active_index = g.index
                _proteger(cara, punto, context)
                bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
                p.informe = 'Pinta el grupo. Mantén peso 1 en el ancla y pulsa Aplicar pesos.'
            elif self.accion == 'APLICAR':
                M.aplicar(cara, punto, manual=True, **M.opciones_punto(cara, punto))
                p.informe = 'Pesos aplicados al punto y sus correctivas.'
            elif self.accion == 'AUTOMATICO':
                M.volver_automatico(cara, punto)
                p.informe = 'Máscara automática activa; se conservan los pesos pintados.'
            else: p.informe = 'Puedes mover el punto.'
            _editor()._pesos_cache.clear(); context.view_layer.update(); _editor()._tag_redraw(context)
            return {'FINISHED'}
        except Exception as e:
            if cara is not None: _restaurar(cara, context)
            p.informe = str(e); self.report({'WARNING'}, str(e))
            return {'CANCELLED'}


def dibujar(lay, context):
    p = context.scene.rlb_pesos_parpados; caja = lay.box()
    caja.prop(p, 'abierto', toggle=True, icon='DOWNARROW_HLT' if p.abierto else 'RIGHTARROW')
    if not p.abierto: return
    punto = context.scene.rlb_editor.punto; cara = _cara(context)
    if punto not in M.AO.ZONAS:
        caja.label(text='Selecciona un punto de párpado.', icon='INFO'); return
    caja.label(text=M.AO.ZONAS[punto][0])
    seleccion = _editor().puntos_parpado_seleccion(context.scene.rlb_editor)
    clave = '|'.join(seleccion)
    if len(seleccion) > 1:
        caja.label(text=f'{len(seleccion)} puntos seleccionados', icon='GROUP_VERTEX')
        opciones = [M.opciones_punto(cara, x) for x in seleccion]
        mixtos = [n for n in ('intensidad', 'longitudinal', 'transversal')
                  if max(x[n] for x in opciones) - min(x[n] for x in opciones) > 1e-6]
        if mixtos: caja.label(text='Valores mixtos: ' + ', '.join(mixtos), icon='INFO')
    estado = M.datos(cara)
    if estado and estado.get('firma') != M._firma_malla(cara):
        caja.label(text='Topología cambió: pesos manuales conservados, sin aplicar.', icon='ERROR')
        caja.operator('rlb.pesos_parpados', text='Reasignar tras cambio de topología').accion = 'REASIGNAR'
    anteriores = estado.get('juegos_anteriores', [])
    if anteriores and punto in anteriores[-1].get('manuales', {}) and punto not in estado.get('manuales', {}):
        caja.label(text='Pesos anteriores conservados: revisa y vuelve a aplicarlos.', icon='ERROR')
    if p.punto_cargado == clave:
        caja.prop(p, 'intensidad', slider=True)
        caja.label(text='1 = intensidad original; 0 = sin influencia.')
        caja.prop(p, 'longitudinal', slider=True)
        caja.prop(p, 'transversal', slider=True)
        caja.operator('rlb.pesos_parpados', text='Aplicar valores a la selección', icon='CHECKMARK').accion = 'AJUSTAR'
        if len(seleccion) > 1: caja.label(text='Aplicar iguala estos tres valores en la selección.')
    else:
        caja.operator('rlb.pesos_parpados', text='Cargar ajustes de este punto').accion = 'CARGAR'
    caja.label(text='Las extensiones ajustan la máscara automática.')
    caja.operator('rlb.pesos_parpados', text='Pintar solo este punto', icon='WPAINT_HLT').accion = 'PINTAR'
    caja.operator('rlb.pesos_parpados', text='Aplicar pintura solo a este punto', icon='CHECKMARK').accion = 'APLICAR'
    caja.operator('rlb.pesos_parpados', text='Máscara automática solo en este punto', icon='LOOP_BACK').accion = 'AUTOMATICO'
    caja.operator('rlb.pesos_parpados', text='Mover puntos').accion = 'MOVER'
    if p.informe: caja.label(text=p.informe, icon='INFO')


CLASES = (RLB_PesosParpados, RLB_OT_pesos_parpados)


def _cargar_diferido():
    _cargar()
    return None


def register():
    for c in CLASES:
        if not c.is_registered: bpy.utils.register_class(c)
    if not hasattr(bpy.types.Scene, 'rlb_pesos_parpados'):
        bpy.types.Scene.rlb_pesos_parpados = PointerProperty(type=RLB_PesosParpados)
    bpy.app.timers.register(_cargar_diferido, first_interval=.1)
    for lista in (bpy.app.handlers.load_post, bpy.app.handlers.undo_post, bpy.app.handlers.redo_post):
        if _cargar not in lista: lista.append(_cargar)
    if not bpy.app.timers.is_registered(_vigilar):
        bpy.app.timers.register(_vigilar, first_interval=.5, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(_cargar_diferido):
        bpy.app.timers.unregister(_cargar_diferido)
    for cara in list(_pintando):
        try: _restaurar(cara, bpy.context)
        except ReferenceError: pass
    _pintando.clear()
    for lista in (bpy.app.handlers.load_post, bpy.app.handlers.undo_post, bpy.app.handlers.redo_post):
        if _cargar in lista: lista.remove(_cargar)
    if bpy.app.timers.is_registered(_vigilar): bpy.app.timers.unregister(_vigilar)
    del bpy.types.Scene.rlb_pesos_parpados
    for c in reversed(CLASES): bpy.utils.unregister_class(c)
