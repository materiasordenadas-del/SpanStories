# Editor de la boca al hablar (0.8.11), parecido al de expresiones pero para los visemas (las formas de la boca de
# cada sonido: A, E, I, O, U, M-B-P, F-V, S, ...).
#   - eliges el sonido y pulsas «Empezar»: la cara se queda con la boca de ESE sonido y mueves los deslizadores;
#   - cada cambio se guarda al momento SOLO en este personaje (cara['rlb_visemas']); la biblioteca no se toca;
#   - «Fuerza al hablar» hace toda la boca más o menos abierta/redonda al hablar (cara['rlb_habla_fuerza']);
#   - «Terminar y rehacer el habla» devuelve la animación de antes y vuelve a montar la última frase con los cambios.
import bpy, json
from bpy.props import StringProperty, FloatProperty, BoolProperty, EnumProperty, PointerProperty
from . import biblioteca as BI

VISEMAS = [
    ('A', 'A', 'Sonido «a»'), ('E', 'E', 'Sonido «e»'), ('I', 'I', 'Sonido «i» (también «y» final)'),
    ('O', 'O', 'Sonido «o»'), ('U', 'U', 'Sonido «u»'),
    ('MBP', 'M, B, P', 'Labios cerrados: m, p, b al empezar'), ('BL', 'B, V entre vocales', 'Labios casi juntos, sin cerrar'),
    ('FV', 'F', 'Labio de abajo bajo los dientes de arriba'), ('S', 'S, Z', 'Sonido «s»'), ('TH', 'Z (con ceceo)', ''),
    ('CH', 'CH, LL, Y', ''), ('TDNL', 'T, D, N, L, R', 'La lengua manda; los labios siguen a la vocal'), ('K', 'K, G, J', ''),
]
CANALES = [
    ('jawOpen', 'Abrir boca'), ('mouthUpperUp', 'Subir labio de arriba'), ('mouthLowerDown', 'Bajar labio de abajo'),
    ('mouthStretch', 'Estirar boca'), ('mouthSmile', 'Sonrisa'), ('mouthFunnel', 'Boca en O'), ('mouthPucker', 'Beso (U)'),
    ('mouthPress', 'Apretar labios'), ('mouthRollUpper', 'Meter labio de arriba'), ('mouthRollLower', 'Meter labio de abajo'),
    ('mouthShrugUpper', 'Labio de arriba hacia afuera'), ('tongueOut', 'Sacar lengua'), ('tongueUp', 'Lengua arriba'),
]
_bloqueo = [False]


def _cara(context):
    from .. import asistente
    return asistente.personaje(context)


def _efectivos(cara):
    return BI.visemas_de(cara)


def _poner_en_cara(cara, pesos):
    ctrl = BI.control(cara)
    if ctrl is None:
        return
    disp = set(k[2:] for k in ctrl.keys() if k.startswith('v_'))
    ex = BI.expandir(pesos, disp)
    for k in ctrl.keys():
        if k.startswith('v_'):
            ctrl[k] = float(ex.get(k[2:], 0.0))
    ctrl.update_tag()
    bpy.context.view_layer.update()


def _actuales(ed):
    return {c: round(getattr(ed, 'c_' + c) / 100.0, 4) for c, _ in CANALES if abs(getattr(ed, 'c_' + c)) > 0.05}


def _cargar_visema(context, ed):
    cara = _cara(context)
    if cara is None:
        return
    v = _efectivos(cara).get(ed.visema, {})
    _bloqueo[0] = True
    try:
        for c, _ in CANALES:
            setattr(ed, 'c_' + c, round(float(v.get(c, 0.0)) * 100.0, 1))
    finally:
        _bloqueo[0] = False
    if ed.activo:
        _poner_en_cara(cara, v)


def _al_cambiar_visema(self, context):
    _cargar_visema(context, self)


def _al_cambiar_canal(self, context):
    if _bloqueo[0] or not self.activo:
        return
    cara = _cara(context)
    if cara is None:
        return
    pesos = _actuales(self)
    ov = BI.overrides_visemas(cara)
    ov[self.visema] = pesos
    cara['rlb_visemas'] = json.dumps(ov)
    _poner_en_cara(cara, pesos)


def _al_cambiar_fuerza(self, context):
    cara = _cara(context)
    if cara is not None and not _bloqueo[0]:
        cara['rlb_habla_fuerza'] = float(self.fuerza) / 100.0


# un deslizador por canal (0–100 %), todos con el mismo aviso de cambio
_ANOT = {
    'activo': BoolProperty(default=False),
    'visema': EnumProperty(name='Sonido', items=VISEMAS, update=_al_cambiar_visema),
    'fuerza': FloatProperty(name='Fuerza al hablar', subtype='PERCENTAGE', min=20.0, max=200.0, default=100.0, precision=0,
                            update=_al_cambiar_fuerza,
                            description='Abre más o menos la boca en todo el habla (mandíbula y labios de arriba y abajo)'),
    'accion_previa': StringProperty(), 'slot_previo': StringProperty(), 'valores_previos': StringProperty(),
}
for _c, _t in CANALES:
    _ANOT['c_' + _c] = FloatProperty(name=_t, subtype='PERCENTAGE', min=0.0, max=100.0, default=0.0, precision=0,
                                     update=_al_cambiar_canal)
RLB_HablaEditor = type('RLB_HablaEditor', (bpy.types.PropertyGroup,), {'__annotations__': _ANOT})


# ------------------------------------------------------------------ operadores
_ACCIONES = [('empezar', 'Empezar a editar', 'Deja la cara con la boca del sonido elegido para moverla'),
             ('terminar', 'Terminar y rehacer el habla', 'Devuelve la animación y vuelve a montar la última frase con tus cambios'),
             ('cancelar', 'Salir sin rehacer', 'Devuelve la animación de antes sin tocar el habla'),
             ('auto', 'Ajustar a esta cara (automático)', 'Mide la boca del personaje y recalcula la apertura y el ancho de cada sonido; sustituye tus cambios'),
             ('restaurar', 'Volver a este sonido original', 'Quita tus cambios de este sonido'),
             ('restaurar_todo', 'Volver a todos los originales', 'Quita tus cambios de todos los sonidos y la fuerza')]


def _descripcion(cls, context, props):
    return next((d for i, n, d in _ACCIONES if i == props.accion), '')


class _OpHablaEd:
    bl_idname = 'rlb.habla_ed'
    bl_label = 'Boca al hablar'
    bl_options = {'REGISTER', 'UNDO'}
    description = classmethod(_descripcion)

    def execute(self, context):
        ed = context.scene.rlb_habla_ed
        cara = _cara(context)
        if cara is None or BI.control(cara) is None:
            self.report({'ERROR'}, 'Esta cara aún no tiene el control del rig: termina antes los pasos del rig'); return {'CANCELLED'}
        k = self.accion
        if k == 'empezar':
            ctrl = BI.control(cara)
            if not ed.activo:
                ad = ctrl.animation_data_create()
                ed.accion_previa = ad.action.name if ad.action else ''
                ed.slot_previo = ad.action_slot.identifier if (ad.action and ad.action_slot) else ''
                ed.valores_previos = json.dumps({q: float(ctrl[q]) for q in ctrl.keys() if q.startswith('v_')})
                ad.action = None
            ed.activo = True
            _bloqueo[0] = True
            try:
                ed.fuerza = float(cara.get('rlb_habla_fuerza', 1.0)) * 100.0
            finally:
                _bloqueo[0] = False
            _cargar_visema(context, ed)
        elif k == 'auto':
            from . import ajuste_visemas as AJV
            try:
                AJV.ajustar(cara)
            except Exception as e:
                import traceback; traceback.print_exc()
                self.report({'ERROR'}, str(e)); return {'CANCELLED'}
            _cargar_visema(context, ed)
            self.report({'INFO'}, 'Sonidos ajustados a esta cara')
        elif k in ('restaurar', 'restaurar_todo'):
            ov = BI.overrides_visemas(cara)
            if k == 'restaurar':
                ov.pop(ed.visema, None)
            else:
                ov = {}
                _bloqueo[0] = True
                try:
                    ed.fuerza = 100.0
                finally:
                    _bloqueo[0] = False
                cara['rlb_habla_fuerza'] = 1.0
            cara['rlb_visemas'] = json.dumps(ov)
            _cargar_visema(context, ed)
        else:
            _salir(context, ed, cara)
            if k == 'terminar':
                bl = cara.get('rlb_habla_bloques')
                if bl:
                    bloques = json.loads(bl)
                else:       # habla hecha antes de guardar la frase: se usa la que esté escrita en «¿Qué dice?»
                    p = context.scene.rlb
                    if not (p.facs_texto or '').strip():
                        self.report({'ERROR'}, 'Tus cambios están guardados, pero NO se rehízo el habla: escribe la frase en «¿Qué dice?» '
                                               'y pulsa «Animar la boca» (o vuelve a pulsar este botón con la frase escrita)')
                        return {'CANCELLED'}
                    bloques = [{'nombre': 'frase', 'texto': p.facs_texto.strip()}]
                    if p.facs_audio:
                        bloques[0]['audio'] = bpy.path.abspath(p.facs_audio)
                from . import pipeline as FP
                try:
                    FP.hablar(cara, bloques, contrato=False)
                except Exception as e:
                    import traceback; traceback.print_exc()
                    self.report({'ERROR'}, str(e)); return {'CANCELLED'}
                self.report({'INFO'}, 'Habla rehecha con tu boca')
        return {'FINISHED'}


def _salir(context, ed, cara):
    ctrl = BI.control(cara)
    if ctrl is not None:
        for q in ctrl.keys():
            if q.startswith('v_'):
                ctrl[q] = 0.0
        for q, v in json.loads(ed.valores_previos or '{}').items():
            if q in ctrl.keys():
                ctrl[q] = v
        ad = ctrl.animation_data_create()
        prev = bpy.data.actions.get(ed.accion_previa)
        ad.action = prev
        if prev is not None and ed.slot_previo:
            s = next((s for s in prev.slots if s.identifier == ed.slot_previo), None)
            if s is not None:
                ad.action_slot = s
        ctrl.update_tag()
    ed.accion_previa = ''; ed.slot_previo = ''; ed.valores_previos = ''
    ed.activo = False
    context.view_layer.update()


def dibujar(lay, context, cara):
    """caja del panel simple: editor de la boca al hablar."""
    ed = context.scene.rlb_habla_ed
    b = lay.box()
    b.label(text='Boca al hablar (editar)', icon='OUTLINER_DATA_FONT')
    hay = bool(cara.get('rlb_visemas'))
    if not ed.activo:
        b.label(text='Cambios propios guardados' if hay else 'Usa las formas originales', icon='CHECKMARK' if hay else 'INFO')
        b.operator('rlb.habla_ed', text='Empezar a editar', icon='EDITMODE_HLT').accion = 'empezar'
        return
    b.prop(ed, 'visema')
    col = b.column(align=True)
    for c, _t in CANALES:
        col.prop(ed, 'c_' + c)
    b.prop(ed, 'fuerza')
    b.operator('rlb.habla_ed', text='Ajustar a esta cara (automático)', icon='MOD_SMOOTH').accion = 'auto'
    r = b.row(align=True)
    r.operator('rlb.habla_ed', text='Original (este sonido)', icon='LOOP_BACK').accion = 'restaurar'
    r.operator('rlb.habla_ed', text='Originales (todos)').accion = 'restaurar_todo'
    r = b.row(align=True); r.scale_y = 1.4
    r.operator('rlb.habla_ed', text='Terminar y rehacer el habla', icon='CHECKMARK').accion = 'terminar'
    r.operator('rlb.habla_ed', text='Salir', icon='X').accion = 'cancelar'


RLB_OT_habla_ed = type('RLB_OT_habla_ed', (_OpHablaEd, bpy.types.Operator),
                       {'__annotations__': {'accion': EnumProperty(items=_ACCIONES)}})
CLASES = (RLB_HablaEditor, RLB_OT_habla_ed)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Scene.rlb_habla_ed = PointerProperty(type=RLB_HablaEditor)


def unregister():
    if hasattr(bpy.types.Scene, 'rlb_habla_ed'):
        del bpy.types.Scene.rlb_habla_ed
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
