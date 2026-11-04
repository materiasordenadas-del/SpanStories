"""Sección paralela para elegir caras y pesos de los mismos puntos labiales."""
import bpy
import bmesh
import json
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, EnumProperty, FloatProperty, PointerProperty, StringProperty
from . import labios_manual as M
from . import seleccion_labios as S

_items_guardados = {}
_pintando = []
_seleccionando = []


def _restaurar_pintura(cara, context):
    texto = cara.get('rlb_manual_pintura_estado')
    if not texto:
        return
    estado = json.loads(texto)
    for nombre, bloqueado in estado['bloqueos'].items():
        g = cara.vertex_groups.get(nombre)
        if g is not None: g.lock_weight = bloqueado
    escena = bpy.data.scenes.get(estado.get('escena', context.scene.name))
    if escena is not None:
        for nombre, valor in estado['ajustes'].items():
            setattr(escena.tool_settings, nombre, valor)
    del cara['rlb_manual_pintura_estado']


def _proteger_pintura(cara, punto, context):
    ajustes = {n: getattr(context.scene.tool_settings, n) for n in ('use_auto_normalize', 'use_multipaint')
               if hasattr(context.scene.tool_settings, n)}
    estado = {'bloqueos': {g.name: g.lock_weight for g in cara.vertex_groups}, 'ajustes': ajustes,
              'escena': context.scene.name}
    cara['rlb_manual_pintura_estado'] = json.dumps(estado)
    for g in cara.vertex_groups:
        if not g.name.startswith(M.PREFIJO): g.lock_weight = True
    M.grupo(cara, punto, crear=True).lock_weight = False
    for n in ajustes: setattr(context.scene.tool_settings, n, False)
    if cara not in _pintando: _pintando.append(cara)


def _vigilar_pintura():
    for cara in list(_pintando):
        try:
            if cara.mode != 'WEIGHT_PAINT':
                _restaurar_pintura(cara, bpy.context); _pintando.remove(cara)
        except ReferenceError:
            _pintando.remove(cara)
    for cara in list(_seleccionando):
        try:
            escena = bpy.data.scenes.get(json.loads(cara.get(S.PROPIEDAD, '{}')).get('escena', ''))
            if (cara.mode not in {'EDIT', 'WEIGHT_PAINT'} or escena is None
                    or not escena.rlb_editor.activo or _cara(bpy.context) != cara):
                S.restaurar(cara); _seleccionando.remove(cara)
        except ReferenceError:
            _seleccionando.remove(cara)
    return 0.5


@persistent
def _cargar_pintura(_=None):
    _pintando[:] = [o for o in bpy.data.objects if o.get('rlb_manual_pintura_estado')]
    _seleccionando[:] = [o for o in bpy.data.objects if o.get(S.PROPIEDAD)]


def _editor():
    from . import editor
    return editor


def _cara(context):
    return _editor()._cara(context)


def _items(self, context):
    cara = _cara(context) if context else None
    if cara is None:
        return [('NINGUNO', 'Elige una cara', '', 0)]
    zs = M.puntos(cara)
    firma = tuple((p, z[0]) for p, z in zs.items())
    if firma not in _items_guardados:
        _items_guardados[firma] = [(p, z[0], 'Punto cuyos pesos vas a definir', i)
                                 for i, (p, z) in enumerate(zs.items())]
    return _items_guardados[firma]


def _punto_get(self):
    ed = bpy.context.scene.rlb_editor
    return next((i for i, v in enumerate(_items(self, bpy.context)) if v[0] == ed.punto), 0)


def _punto_set(self, indice):
    it = _items(self, bpy.context)
    if 0 <= indice < len(it):
        ed = bpy.context.scene.rlb_editor
        ed.punto = it[indice][0]; ed.zona = 'boca'
        _editor()._tag_redraw(bpy.context)


def _modo_get(self):
    cara = _cara(bpy.context)
    return 1 if cara is not None and cara.get('rlb_manual_activo', False) else 0


def _post(context):
    E = _editor(); E._pesos_cache.clear()
    context.view_layer.update(); E._tag_redraw(context)


def _activar(context, cara):
    if context.object is not None and context.object != cara and context.object.mode != 'OBJECT':
        raise RuntimeError('Termina la edición del otro objeto antes de editar los labios')
    if cara.hide_get() or cara.hide_viewport:
        raise RuntimeError('Muestra la cara del personaje antes de seleccionar sus caras')
    if cara.mode == 'OBJECT':
        for o in context.selected_objects:
            if o != cara: o.select_set(False)
        cara.select_set(True); context.view_layer.objects.active = cara
    elif context.view_layer.objects.active != cara:
        raise RuntimeError('Activa la cara del personaje antes de continuar')


def _objeto(context, cara):
    _activar(context, cara)
    if cara.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    _restaurar_pintura(cara, context)


def _modo_set(self, indice):
    cara = _cara(bpy.context)
    try:
        if _editor()._arr:
            raise RuntimeError('Suelta el punto antes de cambiar entre Automático y Manual')
        _objeto(bpy.context, cara)
        S.restaurar(cara)
        r = M.cambiar_modo(cara, indice == 1)
        self.informe = f'{"Manual" if r["manual"] else "Automático"}: {r["puntos"]} puntos definidos. Se conservan los dos juegos.'
        _post(bpy.context)
        if indice == 1:
            _editor().mostrar_puntos(bpy.context)
    except Exception as e:
        self.informe = str(e)


class RLB_LabiosManual(bpy.types.PropertyGroup):
    abierto: BoolProperty(name='Edición manual: caras y pesos', default=False)
    region: EnumProperty(name='Región a marcar', items=[('sup', 'Labio superior', ''), ('inf', 'Labio inferior', '')])
    punto: EnumProperty(name='Punto', items=_items, get=_punto_get, set=_punto_set)
    modo: EnumProperty(name='Influencias', items=[('AUTO', 'Automático', '', 0), ('MANUAL', 'Manual', '', 1)],
                       get=_modo_get, set=_modo_set)
    peso: FloatProperty(name='Peso', min=0., max=1., default=1., precision=3)
    fuerza: FloatProperty(name='Intensidad del movimiento', min=0.1, max=5., default=1., precision=2)
    informe: StringProperty()


def _seleccion(cara):
    if cara.mode != 'EDIT':
        raise RuntimeError('Pulsa Seleccionar caras y elige las caras del labio')
    bm = bmesh.from_edit_mesh(cara.data)
    bm.faces.ensure_lookup_table(); bm.faces.index_update()
    caras = [f.index for f in bm.faces if f.select and not f.hide]
    if not caras:
        raise RuntimeError('No hay caras seleccionadas')
    return caras


class RLB_OT_labios_manual(bpy.types.Operator):
    bl_idname = 'rlb.labios_manual'
    bl_label = 'Labios manuales'
    bl_options = {'REGISTER', 'UNDO'}
    accion: EnumProperty(items=[(s, s, '') for s in ('EDITAR', 'MOSTRAR', 'MARCAR', 'RETIRAR',
                                                   'PESO', 'PINTAR', 'APLICAR', 'MOVER', 'REFERENCIA', 'POSE')])

    def execute(self, context):
        E = _editor(); cara = _cara(context); p = context.scene.rlb_labios_manual
        try:
            if cara is None or not context.scene.rlb_editor.activo:
                raise RuntimeError('Primero empieza a editar una expresión')
            if E._arr:
                raise RuntimeError('Suelta el punto antes de editar sus caras o pesos')
            punto = context.scene.rlb_editor.punto
            if self.accion in {'EDITAR', 'MOSTRAR'}:
                _activar(context, cara)
                S.iniciar(context, cara)
                if cara not in _seleccionando: _seleccionando.append(cara)
                nueva_edicion = cara.mode != 'EDIT'
                if nueva_edicion:
                    _objeto(context, cara); bpy.ops.object.mode_set(mode='EDIT')
                context.tool_settings.mesh_select_mode = (False, False, True)
                if nueva_edicion or self.accion == 'MOSTRAR':
                    bm = bmesh.from_edit_mesh(cara.data)
                    for f in bm.faces: f.select_set(False)
                    if self.accion == 'MOSTRAR':
                        indices = set(M.datos(cara).get('regiones', {}).get(p.region, []))
                        for f in bm.faces:
                            if f.index in indices: f.select_set(True)
                    bmesh.update_edit_mesh(cara.data, loop_triangles=False, destructive=False)
                p.informe = 'Boca abierta temporalmente. Selecciona también las caras internas y guarda la región.'
            elif self.accion in {'MARCAR', 'RETIRAR', 'PESO'}:
                caras = _seleccion(cara)
                _objeto(context, cara)
                try:
                    if self.accion == 'PESO':
                        n = M.asignar_peso(cara, punto, caras, p.peso)
                        p.informe = f'Peso {p.peso:.3f} asignado a {n} vértices del punto. Pulsa Aplicar pesos manuales.'
                    else:
                        n = M.marcar_caras(cara, p.region, caras, retirar=self.accion == 'RETIRAR')
                        p.informe = f'{n} caras guardadas en la región. No se borró geometría.'
                finally:
                    bpy.ops.object.mode_set(mode='EDIT')
            elif self.accion == 'PINTAR':
                _objeto(context, cara)
                M._validar(cara)
                if not M.caras_permitidas(cara, punto):
                    raise RuntimeError('Primero marca las caras del labio de este punto')
                S.iniciar(context, cara)
                if cara not in _seleccionando: _seleccionando.append(cara)
                g = M.grupo(cara, punto, crear=True); cara.vertex_groups.active_index = g.index
                _proteger_pintura(cara, punto, context)
                bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
                p.informe = 'Pinta el grupo manual. Los grupos del rig están protegidos. Al terminar pulsa Aplicar pesos manuales.'
            elif self.accion == 'APLICAR':
                _objeto(context, cara)
                S.restaurar(cara)
                r = M.aplicar_punto(cara, punto, simetria=context.scene.rlb_editor.enlazar, fuerza=p.fuerza)
                p.informe = f'Manual activo: {r["vertices"]} vértices; {len(r["puntos"])} punto(s). Automático queda conservado.'
                if r['fuera_ignorados']:
                    p.informe += f' {r["fuera_ignorados"]} pesos fuera de tus caras marcadas no se aplicaron.'
            elif self.accion == 'MOVER':
                _objeto(context, cara)
                S.restaurar(cara)
                E.mostrar_puntos(context)
                p.informe = 'Arrastra los mismos puntos para probar tus influencias.'
            elif self.accion == 'REFERENCIA':
                S.mostrar_referencia(context, obligatoria=True)
                p.informe = 'Referencia visible; se conservan su posición, tamaño y opacidad.'
            elif self.accion == 'POSE':
                S.restaurar(cara)
                p.informe = 'Restaurada la expresión. Seleccionar caras vuelve a abrir la boca temporalmente.'
            _post(context)
            return {'FINISHED'}
        except Exception as e:
            if self.accion in {'EDITAR', 'MOSTRAR', 'PINTAR'}:
                S.restaurar(cara)
                _restaurar_pintura(cara, context)
            p.informe = str(e); self.report({'WARNING'}, str(e))
            return {'CANCELLED'}


def dibujar(lay, context):
    from .. import asistente as AS
    p = context.scene.rlb_labios_manual
    caja = lay.box()
    r = caja.row(); r.scale_y = 1.3
    r.prop(p, 'abierto', text='Edición manual: caras y pesos', toggle=True,
           icon='DOWNARROW_HLT' if p.abierto else 'RIGHTARROW')
    if not p.abierto:
        return
    cara = _cara(context)
    if cara is None:
        return
    estado = M.datos(cara)
    r = caja.row(); r.scale_y = 1.4; r.prop(p, 'modo', expand=True)
    AS._parrafo(caja, context, 'Mismos puntos, dos juegos de pesos. Automático se conserva al aplicar Manual.')
    if estado.get('activo'):
        AS._parrafo(caja, context, 'Vuelve a Automático antes de cambiar la densidad de puntos.')
    b = caja.box(); b.label(text='1. Elegir las caras del labio')
    b.prop(p, 'region', expand=True)
    b.label(text=f'Caras guardadas: {len(estado.get("regiones", {}).get(p.region, []))}')
    b.operator('rlb.labios_manual', text='Seleccionar caras', icon='FACESEL').accion = 'EDITAR'
    if cara.get(S.PROPIEDAD):
        b.label(text='Boca abierta temporalmente', icon='INFO')
        b.operator('rlb.labios_manual', text='Restaurar expresión', icon='LOOP_BACK').accion = 'POSE'
    b.operator('rlb.labios_manual', text='Mostrar referencia', icon='IMAGE_REFERENCE').accion = 'REFERENCIA'
    b.operator('rlb.labios_manual', text='Mostrar caras guardadas', icon='RESTRICT_SELECT_OFF').accion = 'MOSTRAR'
    b.operator('rlb.labios_manual', text='Añadir selección a la región', icon='ADD').accion = 'MARCAR'
    b.operator('rlb.labios_manual', text='Retirar selección de la región', icon='REMOVE').accion = 'RETIRAR'
    AS._parrafo(b, context, 'Incluye la parte interna. La región limita dónde se aplicarán tus pesos.')
    b = caja.box(); b.label(text='2. Definir los pesos del punto')
    b.prop(p, 'punto')
    b.prop(p, 'peso', slider=True)
    b.operator('rlb.labios_manual', text='Asignar peso a las caras seleccionadas', icon='GROUP_VERTEX').accion = 'PESO'
    b.operator('rlb.labios_manual', text='Pintar pesos del punto', icon='WPAINT_HLT').accion = 'PINTAR'
    AS._parrafo(b, context, 'Las caras vecinas que comparten vértices pueden acompañar el movimiento.')
    b.prop(p, 'fuerza')
    b.prop(context.scene.rlb_editor, 'enlazar', text='Simetría', toggle=True, icon='MOD_MIRROR')
    texto = 'Aplicar y reflejar pesos manuales' if context.scene.rlb_editor.enlazar else 'Aplicar pesos manuales'
    r = b.row(); r.scale_y = 1.5
    r.operator('rlb.labios_manual', text=texto, icon='CHECKMARK').accion = 'APLICAR'
    AS._parrafo(b, context, 'Con Simetría se reflejan los pesos dentro de las caras que marcaste para el otro lado.')
    b.operator('rlb.labios_manual', text='Mover puntos', icon='ORIENTATION_GLOBAL').accion = 'MOVER'
    if p.informe:
        AS._parrafo(caja, context, p.informe)


CLASES = (RLB_LabiosManual, RLB_OT_labios_manual)


def _cargar_pintura_diferida():
    _cargar_pintura()
    return None


def register():
    for c in CLASES: bpy.utils.register_class(c)
    bpy.types.Scene.rlb_labios_manual = PointerProperty(type=RLB_LabiosManual)
    # addon_utils restringe bpy.data durante register(); recuperar la pintura
    # cuando Blender vuelve a ofrecer el contexto normal.
    bpy.app.timers.register(_cargar_pintura_diferida, first_interval=0.1)
    bpy.app.handlers.load_post.append(_cargar_pintura)
    bpy.app.handlers.undo_post.append(_cargar_pintura)
    bpy.app.handlers.redo_post.append(_cargar_pintura)
    bpy.app.timers.register(_vigilar_pintura, first_interval=0.5, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(_cargar_pintura_diferida):
        bpy.app.timers.unregister(_cargar_pintura_diferida)
    for cara in list(_seleccionando):
        try: S.restaurar(cara)
        except ReferenceError: pass
    _seleccionando.clear()
    for cara in list(_pintando):
        try: _restaurar_pintura(cara, bpy.context)
        except ReferenceError: pass
    _pintando.clear()
    if _cargar_pintura in bpy.app.handlers.load_post: bpy.app.handlers.load_post.remove(_cargar_pintura)
    if _cargar_pintura in bpy.app.handlers.undo_post: bpy.app.handlers.undo_post.remove(_cargar_pintura)
    if _cargar_pintura in bpy.app.handlers.redo_post: bpy.app.handlers.redo_post.remove(_cargar_pintura)
    if bpy.app.timers.is_registered(_vigilar_pintura): bpy.app.timers.unregister(_vigilar_pintura)
    del bpy.types.Scene.rlb_labios_manual
    for c in reversed(CLASES): bpy.utils.unregister_class(c)
