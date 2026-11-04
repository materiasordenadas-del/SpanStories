# Asistente (0.7.0): un solo botón «Crear el rig de esta cara» que hace toda la línea sola (pasos.siguiente, un paso por
# tick de un operador modal, para que Blender no se congele y se vea el progreso) y el panel para principiantes.
# Estado en memoria (S): no se guarda en el .blend; lo que sí persiste es cara['rlb_hechos'] (nucleo/linea.py).
import os, textwrap, traceback
import bpy

from . import linea as LN

# lo que muestra el panel mientras corre cada paso (lenguaje sencillo)
TEXTO_PASO = {
    'analizar': 'Mirando la malla del personaje…',
    'detectar': 'Buscando la boca y los ojos…',
    'arreglar': 'Limpiando la malla de la cara…',
    'abrir_ojos': 'Abriendo los huecos de los ojos…',
    'rig': 'Creando los huesos de los labios…',
    'pesos': 'Repartiendo el movimiento de la piel…',
    'interior': 'Poniendo los dientes y la lengua…',
    'ojos': 'Poniendo los ojos…',
    'parpados': 'Montando párpados, cejas y mejillas…',
    'cuenca': 'Ajustando las cuencas de los ojos…',
    'oclusion': 'Cerrando huecos entre el ojo y el párpado…',
    'F_preparar': 'Preparando la cara para las expresiones…',
    'F_boca': 'Preparando la boca para hablar y sonreír…',
    'F_ojos': 'Preparando ojos, cejas y mejillas…',
    'F_delineado': 'Pintando el delineado de los ojos…',
    'F_controles': 'Creando los controles de la cara…',
    'F_terminar': 'Conectando todo…',
    'F_expresiones': 'Creando las expresiones (alegre, triste, sorpresa…)…',
    'F_habla': 'Probando que hable…',
    'revision': 'Sacando fotos de revisión…',
}

S = {'modo': 'ninguno', 'cara': None, 'actual': '', 'pid': None, 'n': 0, 'de': 19, 'fase': 0, 'cancelar': False,
     'avisos': [], 'error': '', 'foto': None, 'foto_habla': None, 'aviso_habla': [], 'ayuda': False, 'carpeta': None, 'hizo': False, 'sin_hacer': False}


def _reset(cara):
    S.update(modo='ninguno', cara=cara.name if cara else None, actual='', pid=None, n=0, de=19, fase=0,
             cancelar=False, avisos=[], error='', ayuda=False, hizo=False, sin_hacer=False)


def _redibujar():
    try:
        for w in bpy.context.window_manager.windows:
            for a in w.screen.areas:
                if a.type == 'VIEW_3D':
                    a.tag_redraw()
    except Exception:
        pass


def personaje(context):
    """el personaje elegido: la cara con rig del objeto activo; si no tiene, la malla activa; si no, scene.rlb.cara."""
    from . import auto as AU
    ob = context.view_layer.objects.active if context.view_layer else None
    c = AU.cara_de_objeto(ob)
    if c is not None:
        return c
    if ob is not None and ob.type == 'MESH':
        return ob
    return getattr(context.scene.rlb, 'cara', None)


def _foto(ruta, nombre='RLB_marcadores'):
    """carga un PNG (marcadores o hoja de habla) como imagen, con vista previa para el panel."""
    ruta = os.path.abspath(ruta)
    img = bpy.data.images.get(nombre)
    if img is not None and os.path.abspath(bpy.path.abspath(img.filepath)) == ruta:
        img.reload()
    else:
        if img is not None:
            bpy.data.images.remove(img)
        img = bpy.data.images.load(ruta)
        img.name = nombre
    img.preview_ensure()
    S['foto_habla' if nombre == 'RLB_habla' else 'foto'] = ruta


def _mensaje_error(e):
    t = str(e).strip().splitlines()
    t = t[-1] if t else e.__class__.__name__
    if 'ninguna boca' in t:
        t = ('No encuentro la boca en este modelo. Comprueba que elegiste la cabeza del personaje (con boca y ojos) '
             'y que mira de frente.')
    return t[:300]


# ---------------------------------------------------------------- operadores
class RLB_OT_crear_rig(bpy.types.Operator):
    bl_idname = 'rlb.crear_rig'
    bl_label = 'Crear el rig de esta cara'
    bl_description = ('Hace todos los pasos solo, uno tras otro, y te enseña cómo va. Se para una vez para que '
                      'compruebes que los puntos de la cara están bien puestos')
    bl_options = {'REGISTER'}

    _timer = None

    def invoke(self, context, event):
        if S['modo'] == 'corriendo':
            return {'CANCELLED'}
        cara = personaje(context)
        if cara is None or cara.type != 'MESH':
            self.report({'ERROR'}, 'Selecciona primero la cabeza del personaje en la vista 3D')
            return {'CANCELLED'}
        context.scene.rlb.cara = cara
        _reset(cara)
        if LN.siguiente(cara, 'COMPLETA') is None and cara.get('rlb_revisado'):
            S['modo'] = 'listo'
            self.report({'INFO'}, 'Este personaje ya está terminado: no hay nada que hacer')
            return {'FINISHED'}
        S['modo'] = 'corriendo'
        wm = context.window_manager
        self._timer = wm.event_timer_add(0.1, window=context.window)
        wm.modal_handler_add(self)
        wm.progress_begin(0, 100)
        _redibujar()
        return {'RUNNING_MODAL'}

    def _fin(self, context, modo):
        S['modo'] = modo
        try:
            context.window_manager.event_timer_remove(self._timer)
            context.window_manager.progress_end()
        except Exception:
            pass
        self._timer = None
        _redibujar()
        return {'FINISHED'}

    def cancel(self, context):
        try:
            context.window_manager.event_timer_remove(self._timer)
            context.window_manager.progress_end()
        except Exception:
            pass
        S['modo'] = 'cancelado'

    def modal(self, context, event):
        if event.type == 'ESC':
            S['cancelar'] = True
        if event.type != 'TIMER':
            return {'PASS_THROUGH'}
        cara = bpy.data.objects.get(S['cara'] or '')
        if cara is None:
            S['error'] = 'El personaje ya no existe en la escena.'; return self._fin(context, 'error')
        if S['cancelar']:
            return self._fin(context, 'cancelado')
        from . import pasos
        wm = context.window_manager
        if S['fase'] == 0:
            # primero se anuncia el paso (para que el panel lo pinte) y en el siguiente tick se hace
            sig = LN.siguiente(cara, 'COMPLETA')
            pid = sig[0] if sig else 'revision'
            e = pasos.estado(cara)
            S.update(pid=pid, actual=TEXTO_PASO.get(pid, pid), n=min(e['n'] + 1, e['de']), de=e['de'], fase=1)
            wm.progress_update(int(100 * e['n'] / max(e['de'], 1)))
            _redibujar()
            return {'RUNNING_MODAL'}
        S['fase'] = 0
        try:
            r = pasos.siguiente(cara)
        except Exception as e:
            traceback.print_exc()
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except Exception:
                pass
            S['error'] = _mensaje_error(e)
            return self._fin(context, 'error')
        if r.get('hecho'):
            S['hizo'] = True
        if r.get('hecho') == 'revision':
            S['carpeta'] = (r.get('resumen') or {}).get('carpeta_temporal')
            return self._fin(context, 'listo')
        if r.get('parar'):
            res = r.get('resumen') or {}
            if r.get('hecho') == 'F_habla':
                ruta = res.get('foto_habla') if isinstance(res, dict) else None
                try:
                    if not (isinstance(ruta, str) and os.path.exists(ruta)):
                        ruta = pasos.foto_habla(cara)
                    _foto(ruta, 'RLB_habla')
                except Exception as e:
                    traceback.print_exc()
                    S['avisos'] = ['No pude sacar la hoja del habla: ' + _mensaje_error(e)]
                return self._fin(context, 'habla')
            if r.get('hecho') == 'detectar':
                ruta = res.get('foto_marcadores') if isinstance(res, dict) else None
                try:
                    if not (isinstance(ruta, str) and os.path.exists(ruta)):
                        ruta = pasos.foto_marcadores(cara)
                    _foto(ruta)
                except Exception as e:
                    traceback.print_exc()
                    S['avisos'] = ['No pude sacar la foto de los puntos: ' + _mensaje_error(e)]
                S['avisos'] = S['avisos'] or [a for a in r.get('avisos', []) if not a.startswith('Mira foto_marcadores')]
                S['ayuda'] = False
                return self._fin(context, 'marcadores')
            S['avisos'] = list(r.get('avisos', []))
            S['sin_hacer'] = not r.get('hecho')
            return self._fin(context, 'aviso')
        if r.get('siguiente') is None and r.get('hecho'):
            # línea terminada: queda la revisión (fotos). Si no se hizo nada en esta vuelta no se repite
            if not S['hizo']:
                return self._fin(context, 'listo')
        return {'RUNNING_MODAL'}


class RLB_OT_crear_cancelar(bpy.types.Operator):
    bl_idname = 'rlb.crear_cancelar'
    bl_label = 'Cancelar'
    bl_description = 'Para el proceso cuando termine el paso que está haciendo. Lo hecho se queda y puedes continuar después'
    bl_options = {'INTERNAL'}

    def execute(self, context):
        S['cancelar'] = True
        self.report({'INFO'}, 'Parando al terminar este paso…')
        return {'FINISHED'}


class RLB_OT_crear_mirar(bpy.types.Operator):
    bl_idname = 'rlb.crear_mirar'
    bl_label = 'Volver a mirar'
    bl_description = 'Saca otra foto de los puntos de la cara, con los cambios que hayas hecho al moverlos'
    bl_options = {'INTERNAL'}

    def execute(self, context):
        cara = bpy.data.objects.get(S['cara'] or '')
        if cara is None:
            return {'CANCELLED'}
        from . import pasos
        try:
            _foto(pasos.foto_marcadores(cara))
        except Exception as e:
            traceback.print_exc()
            self.report({'ERROR'}, 'No pude sacar la foto: ' + _mensaje_error(e)); return {'CANCELLED'}
        _redibujar()
        return {'FINISHED'}


class RLB_OT_crear_ayuda(bpy.types.Operator):
    bl_idname = 'rlb.crear_ayuda'
    bl_label = 'Algo está mal'
    bl_description = 'Te explica cómo mover un punto que no esté en su sitio'
    bl_options = {'INTERNAL'}

    def execute(self, context):
        S['ayuda'] = not S['ayuda']
        return {'FINISHED'}


class RLB_OT_crear_rehacer(bpy.types.Operator):
    bl_idname = 'rlb.crear_rehacer'
    bl_label = 'Empezar de nuevo'
    bl_description = ('Rehace la boca, los ojos y las expresiones; la forma de la malla no se toca (los puntos de la '
                      'cara se conservan)')
    bl_options = {'REGISTER', 'UNDO'}

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(
            self, event, title='¿Empezar de nuevo?',
            message='Se rehacen la boca, los ojos y las expresiones; la forma de la malla no se toca.',
            confirm_text='Sí, empezar de nuevo')

    def execute(self, context):
        cara = personaje(context)
        if cara is None:
            return {'CANCELLED'}
        from . import pasos
        try:
            r = pasos.rehacer(cara, 'arreglar')       # con malla procesada sube solo al primer paso seguro
        except Exception as e:
            traceback.print_exc()
            self.report({'ERROR'}, 'No pude deshacerlo: ' + _mensaje_error(e)); return {'CANCELLED'}
        _reset(cara)
        for av in r.get('avisos', []):
            self.report({'WARNING'}, av)
        self.report({'INFO'}, 'Listo: pulsa «Continuar» para construir otra vez')
        return {'FINISHED'}


class RLB_OT_ver_revision(bpy.types.Operator):
    bl_idname = 'rlb.ver_revision'
    bl_label = 'Ver fotos de revisión'
    bl_description = 'Abre la carpeta con las fotos de cerca de la boca y los ojos para comprobar el resultado'
    bl_options = {'INTERNAL'}

    def execute(self, context):
        c = S.get('carpeta')
        if not c or not os.path.isdir(c):
            self.report({'WARNING'}, 'Todavía no hay fotos de revisión de esta vez'); return {'CANCELLED'}
        bpy.ops.wm.path_open(filepath=c)
        return {'FINISHED'}


class RLB_OT_ver_foto(bpy.types.Operator):
    bl_idname = 'rlb.ver_foto'
    bl_label = 'Ver la foto grande'
    bl_description = 'Abre la foto a tamaño completo'
    bl_options = {'INTERNAL'}
    habla: bpy.props.BoolProperty(default=False)

    def execute(self, context):
        ruta = S.get('foto_habla' if self.habla else 'foto')
        if not ruta or not os.path.exists(ruta):
            return {'CANCELLED'}
        bpy.ops.wm.path_open(filepath=ruta)
        return {'FINISHED'}


# ---------------------------------------------------------------- panel
def _parrafo(lay, context, texto, icon='NONE', alert=False):
    """texto largo en varias líneas según el ancho del panel."""
    ancho = max(24, int(context.region.width / 10.5) - 2) if context.region else 44
    col = lay.column(align=True)
    col.alert = alert
    for i, l in enumerate(textwrap.wrap(texto, ancho) or ['']):
        col.label(text=l, icon=icon if i == 0 else 'BLANK1')


def _grande(lay, ident, texto, icon, escala=1.4, **kw):
    c = lay.column(); c.scale_y = escala
    return c.operator(ident, text=texto, icon=icon, **kw)


def _foto_en_panel(lay, context, nombre='RLB_marcadores'):
    img = bpy.data.images.get(nombre)
    if img is None:
        return
    if img.preview is None:
        img.preview_ensure()
    if img.preview is not None:
        lay.template_icon(icon_value=img.preview.icon_id, scale=max(6.0, context.region.width / 24.0))


def _caja_marcadores(lay, context):
    b = lay.box()
    b.label(text='Revisa los puntos de la cara', icon='HIDE_OFF')
    _foto_en_panel(b, context)
    b.operator('rlb.ver_foto', icon='FILE_IMAGE')
    c = b.column(align=True)
    c.label(text='Rojo: esquinas de la boca', icon='COLLECTION_COLOR_01')
    c.label(text='Azul: centro de cada labio', icon='COLLECTION_COLOR_05')
    c.label(text='Verde: el ojo', icon='COLLECTION_COLOR_04')
    c.label(text='Amarillo: la mandíbula', icon='COLLECTION_COLOR_03')
    c.label(text='Naranja: la barbilla', icon='COLLECTION_COLOR_02')
    for a in S['avisos']:
        _parrafo(b, context, a, 'ERROR', alert=True)
    _parrafo(lay, context, '¿Están los puntos en su sitio?')
    _grande(lay, 'rlb.crear_rig', 'Se ven bien, seguir', 'CHECKMARK', 2.0)
    _grande(lay, 'rlb.crear_ayuda', 'Algo está mal', 'QUESTION', 1.0)
    if S['ayuda']:
        a = lay.box()
        _parrafo(a, context, 'Para mover un punto: en la vista 3D haz clic en la bolita que esté mal, pulsa la tecla G, '
                 'llévala a su sitio y haz clic para soltarla.', 'INFO')
        _parrafo(a, context, 'Los puntos están en la lista de objetos con nombres que empiezan por «RLB_». '
                 'Después pulsa «Volver a mirar».')
        _grande(a, 'rlb.crear_mirar', 'Volver a mirar', 'FILE_REFRESH', 1.4)


def _caja_habla(lay, context):
    b = lay.box()
    b.label(text='Prueba rápida de habla', icon='SPEAKER')
    _foto_en_panel(b, context, 'RLB_habla')
    r = b.row(align=True)
    r.operator('rlb.ver_foto', text='Ver la hoja grande', icon='FILE_IMAGE').habla = True
    c = b.column(align=True)
    _parrafo(c, context, 'Arriba de frente, abajo de perfil: A E I O U M-B-P F-V')
    _parrafo(c, context, 'M, B, P: labios cerrados y apretados')
    _parrafo(c, context, 'O, U: boca redonda y labios adelantados')
    _parrafo(c, context, 'A: boca abierta, con dientes, sin atravesar')
    for a in S['avisos']:
        _parrafo(b, context, a, 'ERROR', alert=True)
    _parrafo(lay, context, '¿Se ve bien la boca?')
    _grande(lay, 'rlb.crear_rig', 'Se ve bien, seguir', 'CHECKMARK', 2.0)


def dibujar(lay, context):
    """contenido del panel principal para principiantes."""
    cara = personaje(context)
    if cara is None:
        b = lay.box()
        _parrafo(b, context, 'Selecciona la cabeza del personaje en la vista 3D', 'RESTRICT_SELECT_OFF')
        return
    b = lay.box()
    b.label(text='Personaje elegido')
    r = b.row(); r.scale_y = 1.4
    r.label(text=cara.name, icon='USER')
    modo = S['modo'] if S['cara'] == cara.name else 'ninguno'
    hec = LN.hechos(cara)
    ids = LN.ids('COMPLETA')
    hechos_n = sum(1 for i in ids if i in hec)
    sig = LN.siguiente(cara, 'COMPLETA')
    from . import auto as AU
    # rig acabado y solo falta la prueba de habla: se enseña como terminado, con el botón de la prueba
    solo_habla = bool(sig and sig[0] == 'F_habla' and AU.terminada(cara))
    terminado = sig is None or solo_habla

    if modo == 'corriendo':
        b = lay.box()
        _parrafo(b, context, 'Creando el rig… esto tarda unos minutos', 'TIME')
        _parrafo(b, context, S['actual'])
        txt = f"Paso {S['n']} de {S['de']}"
        try:
            b.progress(text=txt, factor=max(0.0, min(1.0, (S['n'] - 1) / max(S['de'], 1))), type='BAR')
        except Exception:
            b.label(text=txt)
        _parrafo(b, context, 'No toques nada hasta que termine', 'INFO')
        _grande(lay, 'rlb.crear_cancelar', 'Cancelar', 'CANCEL', 1.4)
        return
    if modo == 'marcadores' and not terminado:
        _caja_marcadores(lay, context); return
    if modo == 'habla':
        _caja_habla(lay, context); return
    if modo == 'aviso':
        for a in S['avisos']:
            bx = lay.box()
            _parrafo(bx, context, a, 'ERROR' if S['sin_hacer'] else 'INFO', alert=S['sin_hacer'])
        if S['sin_hacer']:
            _parrafo(lay, context, 'Arréglalo y vuelve a intentarlo')
        _grande(lay, 'rlb.crear_rig', 'Volver a intentar' if S['sin_hacer'] else 'Seguir', 'PLAY', 2.0)
        return
    if modo == 'error':
        bx = lay.box()
        c = bx.column(); c.alert = True
        c.label(text='Algo salió mal en este paso', icon='ERROR')
        _parrafo(bx, context, S['actual'].rstrip('…') + ': ' + S['error'] if S['actual'] else S['error'], alert=True)
        _parrafo(bx, context, 'Lo que ya estaba hecho no se pierde. Puedes reintentar el paso.')
        _grande(lay, 'rlb.crear_rig', 'Reintentar este paso', 'FILE_REFRESH', 2.0)
        return
    if modo == 'cancelado' and not terminado:
        _parrafo(lay, context, 'Parado. Lo hecho se queda.', 'PAUSE')

    if terminado:
        bx = lay.box()
        bx.label(text='¡Listo!', icon='CHECKMARK')
        _parrafo(bx, context, 'Ahora puedes cambiar las expresiones en «2. Editar expresiones» (más abajo).')
        if solo_habla:
            _parrafo(bx, context, 'Falta una prueba rápida: la cara dice una frase y miras cómo se mueve la boca.', 'SPEAKER')
            _grande(lay, 'rlb.crear_rig', 'Prueba rápida de habla', 'PLAY_SOUND', 2.0)
        if S.get('carpeta') and os.path.isdir(S['carpeta']):
            _grande(lay, 'rlb.ver_revision', 'Ver fotos de revisión', 'FILE_FOLDER', 1.4)
    elif hechos_n == 0:
        bx = lay.box()
        _parrafo(bx, context, 'Este personaje no tiene rig', 'INFO')
        _parrafo(bx, context, 'El rig es lo que permite mover la boca, los ojos y la cara.')
        _grande(lay, 'rlb.crear_rig', 'Crear el rig de esta cara', 'ARMATURE_DATA', 2.0)
    else:
        n_sig = ids.index(sig[0]) + 1
        bx = lay.box()
        _parrafo(bx, context, f'Rig a medias (paso {n_sig} de {len(ids)})', 'TIME')
        _parrafo(bx, context, 'Toca: ' + TEXTO_PASO.get(sig[0], sig[1]).rstrip('…'))
        _grande(lay, 'rlb.crear_rig', 'Continuar', 'PLAY', 2.0)
        _grande(lay, 'rlb.crear_rehacer', 'Empezar de nuevo', 'LOOP_BACK', 1.0)
    if terminado:      # el delineado va al final, con todo lo demás ya hecho
        caja_delineado(lay, context, cara)


# ---------------------------------------------------------------- delineado de las pestañas, a mano (0.8.6)
def caja_delineado(lay, context, cara):
    """el delineado ya no se hace solo: se marcan las caras en modo edición y se pulsa Generar."""
    from .facs import pipeline as FP
    b = lay.box()
    b.label(text='Delineado de pestañas (manual)', icon='GREASEPENCIL')
    n = len(FP.delineado_caras(cara))
    hecho = cara.get('facs_delineado_uv') is not None
    _parrafo(b, context, '1. Modo edición: selecciona las caras (o vértices) junto al borde del párpado superior, de los dos ojos.')
    r = b.row(align=True)
    r.operator('rlb.facs', text='Marcar caras = selección', icon='RESTRICT_SELECT_OFF').paso = 'delineado_marcar'
    rv = r.row(align=True); rv.enabled = bool(n)
    rv.operator('rlb.facs', text='Ver').paso = 'delineado_ver'
    _parrafo(b, context, f'{n} caras marcadas' if n else 'Aún no hay caras marcadas', 'CHECKMARK' if n else 'INFO')
    b.prop(context.scene.rlb, 'estilo_delineado')
    r = b.row(align=True); r.scale_y = 1.4; r.enabled = bool(n) or cara.mode == 'EDIT'
    r.operator('rlb.facs', text='2. Generar delineado' + (' (rehacer)' if hecho else ''), icon='PLAY').paso = 'delineado_generar'
    rq = b.row(align=True); rq.enabled = hecho
    rq.operator('rlb.facs', text='Quitar delineado', icon='X').paso = 'delineado_quitar'


# ---------------------------------------------------------------- hacer que hable (0.7.1)
def _terminar_editor(context):
    """si el editor de expresiones está abierto lo termina limpio (devuelve la animación y la vista de antes)."""
    ed = getattr(context.scene, 'rlb_editor', None)
    if ed is None or not ed.activo:
        return False
    from .facs import editor as ED
    ED._salir(context, ed)
    return True


def _accion_habla(cara):
    return bpy.data.actions.get(f'{cara.name}_Habla')


def _poner_accion(ctrl, act):
    """deja `act` en el control (con su ranura, Blender 5)."""
    ad = ctrl.animation_data_create()
    if ad.action != act:
        ad.action = act
    if ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]


class RLB_OT_habla_animar(bpy.types.Operator):
    bl_idname = 'rlb.habla_animar'
    bl_label = 'Animar la boca'
    bl_description = ('Hace que el personaje diga el texto: crea la animación de la boca (labios, mandíbula, lengua, '
                      'cejas y parpadeos). Si ya había una animación de habla, se reemplaza')
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        p = context.scene.rlb
        cara = personaje(context)
        if cara is None or cara.type != 'MESH':
            self.report({'ERROR'}, 'Selecciona primero la cabeza del personaje en la vista 3D'); return {'CANCELLED'}
        from . import auto as AU
        if not AU.terminada(cara):
            self.report({'ERROR'}, 'Este personaje aún no tiene el rig terminado: créalo primero'); return {'CANCELLED'}
        texto = p.facs_texto.strip()
        if not texto:
            self.report({'ERROR'}, 'Escribe lo que dice el personaje en «¿Qué dice?»'); return {'CANCELLED'}
        audio = None
        if p.facs_audio:
            audio = bpy.path.abspath(p.facs_audio)
            if not os.path.isfile(audio) or not audio.lower().endswith('.wav'):
                self.report({'ERROR'}, 'El audio tiene que ser un archivo .wav que exista (o déjalo vacío)'); return {'CANCELLED'}
        if _terminar_editor(context):
            self.report({'INFO'}, 'Terminé de editar la expresión para poder animar la boca')
        from . import pasos
        S['aviso_habla'] = []
        try:
            if context.screen.is_animation_playing:
                bpy.ops.screen.animation_cancel(restore_frame=False)
        except Exception:
            pass
        try:
            r = pasos.hablar(cara, texto, audio)
        except Exception as e:
            traceback.print_exc()
            self.report({'ERROR'}, 'No pude animar la boca: ' + _mensaje_error(e)); return {'CANCELLED'}
        context.scene.frame_set(context.scene.frame_start)
        S['aviso_habla'] = list(r.get('avisos', []))   # 0.7.2 (Lamine): se ve en el panel hasta el siguiente intento
        for a in S['aviso_habla']:
            self.report({'WARNING'}, a)
        p.informe = f"Habla: {r['accion']}, fotogramas {r['frames'][0]}–{r['frames'][1]}"
        self.report({'INFO'}, f"Listo: la boca está animada (fotogramas {r['frames'][0]} a {r['frames'][1]}). Pulsa «Reproducir»")
        _redibujar()
        return {'FINISHED'}


class RLB_OT_habla_reproducir(bpy.types.Operator):
    bl_idname = 'rlb.habla_reproducir'
    bl_label = 'Reproducir'
    bl_description = 'Reproduce la animación de la boca desde el principio (con el audio, si pusiste uno)'
    bl_options = {'INTERNAL'}

    def execute(self, context):
        cara = personaje(context)
        act = _accion_habla(cara) if cara is not None else None
        if act is None:
            self.report({'ERROR'}, 'Primero pulsa «Animar la boca»'); return {'CANCELLED'}
        if _terminar_editor(context):
            self.report({'INFO'}, 'Terminé de editar la expresión para poder reproducir')
        from .facs import biblioteca as BI
        ctrl = BI.control(cara)
        if ctrl is None:
            return {'CANCELLED'}
        _poner_accion(ctrl, act)
        sc = context.scene
        if context.screen.is_animation_playing:
            bpy.ops.screen.animation_cancel(restore_frame=False)
        sc.frame_set(sc.frame_start)
        bpy.ops.screen.animation_play()
        return {'FINISHED'}


class RLB_OT_habla_parar(bpy.types.Operator):
    bl_idname = 'rlb.habla_parar'
    bl_label = 'Parar'
    bl_description = 'Para la reproducción'
    bl_options = {'INTERNAL'}

    def execute(self, context):
        if context.screen.is_animation_playing:
            bpy.ops.screen.animation_cancel(restore_frame=False)
        return {'FINISHED'}


class RLB_PT_habla(bpy.types.Panel):
    """«Hacer que hable»: escribes la frase (y un audio si lo tienes) y la boca se anima sola."""
    bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Rig labial'
    bl_label = '3. Hacer que hable'
    bl_order = 10

    @classmethod
    def poll(cls, context):
        try:
            from . import auto as AU
            cara = personaje(context)
            return cara is not None and cara.type == 'MESH' and AU.terminada(cara)
        except Exception:
            return False

    def draw_header(self, context):
        try:
            cara = personaje(context)
            hecho = cara is not None and _accion_habla(cara) is not None
            self.layout.label(text='', icon='CHECKMARK' if hecho else 'RADIOBUT_OFF')
        except Exception:
            pass

    def draw(self, context):
        p = context.scene.rlb
        lay = self.layout
        cara = personaje(context)
        lay.label(text='Con tu propia frase y audio', icon='SPEAKER')
        lay.label(text='¿Qué dice?', icon='TEXT')
        lay.prop(p, 'facs_texto', text='')
        lay.label(text='Audio .wav (si tienes uno)', icon='SPEAKER')
        lay.prop(p, 'facs_audio', text='')
        _parrafo(lay, context, 'Con audio, la boca sigue la voz. Sin audio, se usan tiempos típicos del español.', 'INFO')
        # botón principal justo bajo la frase y el audio, antes de los avisos
        c = lay.column(); c.scale_y = 2.0
        c.enabled = bool(p.facs_texto.strip())
        c.operator('rlb.habla_animar', icon='PLAY_SOUND')
        ed = getattr(context.scene, 'rlb_editor', None)
        if ed is not None and ed.activo:
            _parrafo(lay, context, 'Estás editando una expresión: al animar la boca se termina esa edición.', 'INFO')
        hay = cara is not None and _accion_habla(cara) is not None
        if hay:
            _parrafo(lay, context, 'Ya hay una animación de habla: se reemplazará.', 'INFO')
        for a in S.get('aviso_habla', []):
            _parrafo(lay, context, a, 'ERROR', alert=True)
        r = lay.row(align=True); r.scale_y = 1.4
        r.enabled = hay
        r.operator('rlb.habla_reproducir', icon='PLAY')
        r.operator('rlb.habla_parar', icon='PAUSE')
        if cara is not None:      # 0.8.11: la boca al hablar se retoca aquí mismo, sin ir a otro panel
            from .facs import editor_habla
            editor_habla.dibujar(lay, context, cara)


CLASES = (RLB_OT_crear_rig, RLB_OT_crear_cancelar, RLB_OT_crear_mirar, RLB_OT_crear_ayuda, RLB_OT_crear_rehacer,
          RLB_OT_ver_revision, RLB_OT_ver_foto, RLB_OT_habla_animar, RLB_OT_habla_reproducir, RLB_OT_habla_parar,
          RLB_PT_habla)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
