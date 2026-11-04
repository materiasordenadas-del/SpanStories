# Panel «4. Ojos y forma de la cara» (0.8.0): posición neutra de cada ojo y retoque de mentón, mandíbula y orejas.
# La lógica está en forma.py; aquí solo propiedades de la escena, operadores y el dibujo del panel.
import json, math
import bpy, blf, gpu
from gpu_extras.batch import batch_for_shader
from bpy.props import EnumProperty, BoolProperty, FloatProperty, StringProperty

from . import forma as FO

_ZONAS_ENUM = [(z, t, f'Retocar {t.lower()}', ic, i) for i, (z, (t, _, _), ic) in enumerate(
    [('menton', FO.ZONAS['menton'], 'USER'), ('mandibula', FO.ZONAS['mandibula'], 'MOD_SMOOTH'),
     ('oreja', FO.ZONAS['oreja'], 'HIDE_OFF')])]
EJES = ('x', 'y', 'z')


def _cara(context=None):
    from . import asistente
    context = context or bpy.context
    c = asistente.personaje(context)
    return c if c is not None and c.type == 'MESH' else None


def _get(lado, i):
    def get(self):
        c = _cara()
        try:
            return float(FO.ojos_estado(c)[lado][i]) if c is not None else 0.0
        except Exception:
            return 0.0
    return get


def _set(lado, i):
    def set_(self, v):
        c = _cara()
        if c is None or not FO.pivotes(c):
            return
        try:
            FO.ojos_poner(c, lado, **{EJES[i]: float(v)}, espejo=bool(self.espejo))
        except Exception as e:
            import traceback; traceback.print_exc()
            self.informe = 'ERROR: ' + str(e)
    return set_


def _eje(lado, i):
    nombres = ('Derecha ↔ Izquierda', 'Atrás ↔ Adelante', 'Abajo ↔ Arriba')
    desc = ('Mueve el ojo entero a un lado, en mm (+ = izquierda del personaje). Es la posición neutra: las expresiones se suman a ella',
            'Profundidad del ojo, en mm (+ = hacia fuera, − = más hundido)',
            'Mueve el ojo entero hacia arriba o hacia abajo, en mm')
    return FloatProperty(name=nombres[i], description=desc[i], min=-40.0, max=40.0, soft_min=-8.0, soft_max=8.0,
                         precision=2, step=10, get=_get(lado, i), set=_set(lado, i))


class RLB_Forma(bpy.types.PropertyGroup):
    zona: EnumProperty(name='Zona', items=_ZONAS_ENUM, default='menton')
    por_lado: BoolProperty(name='Cada lado por separado', default=False,
                           description='Muestra la diferencia de cada lado: se suma al deslizador de «los dos lados»')
    espejo: BoolProperty(name='Los dos ojos en espejo', default=True,
                         description='Al mover un ojo, el otro se mueve igual y simétrico (a un lado se invierte)')
    L_x: _eje('L', 0)
    L_y: _eje('L', 1)
    L_z: _eje('L', 2)
    R_x: _eje('R', 0)
    R_y: _eje('R', 1)
    R_z: _eje('R', 2)
    puntos: BoolProperty(name='Puntos en la cara', default=True,
                         description='Un punto (círculo con cruz) por cada control de la zona, para arrastrarlo con el ratón')
    a_mano: BoolProperty(name='Modelar a mano', default=True,
                         description='Orejas: 8 puntos en el borde que mueven solo su parte de la oreja (arrástralos en '
                                     'cualquier dirección). Apagado: un punto por cada control de la lista (oreja entera)')
    activo: StringProperty(default='', description='Control elegido (su punto y su deslizador se resaltan)')
    informe: StringProperty(default='')


# ---------------------------------------------------------------- operadores
class _Base(bpy.types.Operator):
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return _cara(context) is not None


class RLB_OT_forma_preparar(_Base):
    bl_idname = 'rlb.forma_preparar'
    bl_label = 'Preparar la edición de la forma'
    bl_description = ('Mide la cara (por las islas UV de piel), pone los puntos rosados del mentón y de las orejas y crea '
                      'los deslizadores. No cambia la malla: todo parte de 0')

    def execute(self, context):
        cara = _cara(context)
        try:
            r = FO.preparar(cara)
        except Exception as e:
            import traceback; traceback.print_exc()
            self.report({'ERROR'}, str(e)); context.scene.rlb_forma.informe = 'ERROR: ' + str(e)
            return {'CANCELLED'}
        context.scene.rlb_forma.informe = ' '.join(r['avisos'])
        try:
            bpy.ops.rlb.forma_arrastrar('INVOKE_DEFAULT', auto=True)
        except Exception:
            pass
        self.report({'INFO'}, f"Forma preparada: {r['keys']} ajustes. Revisa los puntos rosados (mentón y orejas)")
        return {'FINISHED'}


class RLB_OT_forma_actualizar(_Base):
    bl_idname = 'rlb.forma_actualizar'
    bl_label = 'Actualizar zonas'
    bl_description = 'Vuelve a calcular las zonas con la posición y el tamaño actuales de los puntos rosados. Los deslizadores se conservan'

    def execute(self, context):
        try:
            r = FO.actualizar(_cara(context))
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        self.report({'INFO'}, f"Zonas actualizadas ({r['keys']} ajustes)")
        return {'FINISHED'}


class RLB_OT_forma_reiniciar(_Base):
    bl_idname = 'rlb.forma_reiniciar'
    bl_label = 'Restaurar'
    bl_description = 'Pone a 0 los deslizadores (la forma original)'
    zona: StringProperty(default='')

    def execute(self, context):
        if self.zona == 'mano':
            FO.reiniciar_locales(_cara(context))
        else:
            FO.reiniciar(_cara(context), self.zona or None)
        return {'FINISHED'}


class RLB_OT_forma_punto(_Base):
    bl_idname = 'rlb.forma_punto'
    bl_label = 'Punto al cursor 3D'
    bl_description = 'Lleva el punto rosado al cursor 3D (Shift + clic derecho sobre la cara). Después pulsa «Actualizar zonas»'
    punto: EnumProperty(items=[('fm_oreja.L', 'Oreja izquierda', ''), ('fm_oreja.R', 'Oreja derecha', ''),
                               ('fm_menton', 'Mentón', '')])

    def execute(self, context):
        e = FO._marca(_cara(context), self.punto)
        if e is None:
            self.report({'ERROR'}, 'Primero prepara la edición de la forma'); return {'CANCELLED'}
        e.location = context.scene.cursor.location
        return {'FINISHED'}


class RLB_OT_forma_puntos_ver(_Base):
    bl_idname = 'rlb.forma_puntos_ver'
    bl_label = 'Ver / ocultar puntos'
    bl_description = 'Muestra u oculta los puntos rosados del mentón y de las orejas'

    def execute(self, context):
        cara = _cara(context)
        FO.puntos_visibles(cara, not FO.puntos_visibles(cara))
        return {'FINISHED'}


class RLB_OT_forma_fijar(_Base):
    bl_idname = 'rlb.forma_fijar'
    bl_label = 'Fijar la forma en la malla'
    bl_description = ('Hornea la forma actual en la malla y quita los deslizadores (sin cambiar la topología). '
                      'Hazlo antes de exportar al GLB; después ya no se puede volver atrás desde aquí')

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(
            self, event, title='¿Fijar la forma?',
            message='La forma de ahora pasa a ser la malla original y los deslizadores desaparecen.',
            confirm_text='Sí, fijar')

    def execute(self, context):
        try:
            r = FO.fijar(_cara(context))
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        self.report({'INFO'}, f"Forma fijada ({r['fijado']} ajustes)")
        return {'FINISHED'}


class RLB_OT_forma_elegir(bpy.types.Operator):
    bl_idname = 'rlb.forma_elegir'
    bl_label = 'Elegir control'
    bl_description = 'Resalta en la cara los puntos de este control (naranja)'
    bl_options = {'INTERNAL'}
    modo: StringProperty(default='')

    def execute(self, context):
        fp = context.scene.rlb_forma
        fp.activo = '' if fp.activo == self.modo else self.modo
        _redibujar(context)
        return {'FINISHED'}


class RLB_OT_forma_preset(_Base):
    bl_idname = 'rlb.forma_preset'
    bl_label = 'Modo por defecto'
    bl_description = 'Deja la zona con un aspecto conocido (los deslizadores quedan puestos y se pueden seguir ajustando)'
    zona: StringProperty(default='')
    nombre: StringProperty(default='')

    def execute(self, context):
        try:
            FO.aplicar_preset(_cara(context), self.zona, self.nombre)
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        return {'FINISHED'}


class RLB_OT_ojos_neutro(_Base):
    bl_idname = 'rlb.ojos_neutro'
    bl_label = 'Ojos a su sitio'
    bl_description = 'Devuelve los dos ojos a la posición original'

    def execute(self, context):
        FO.ojos_neutro(_cara(context))
        return {'FINISHED'}


class RLB_OT_ojos_parpados(_Base):
    bl_idname = 'rlb.ojos_parpados'
    bl_label = 'Rehacer párpados'
    bl_description = 'Rehace los párpados sobre los ojos ya colocados (tarda unos segundos)'

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(
            self, event, title='¿Rehacer los párpados?',
            message='Se recalculan las keys de los párpados sobre la posición nueva de los ojos.',
            confirm_text='Sí, rehacer')

    def execute(self, context):
        try:
            FO.rehacer_parpados(_cara(context))
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        self.report({'INFO'}, 'Párpados rehechos')
        return {'FINISHED'}



# ---------------------------------------------------------------- puntos sobre la cara (uno por control)
_hover = ['']
_arr = {}
_vivo = [False]       # el modal del ratón está escuchando
_handler = [None]
ESCALA_PX = 150.0           # píxeles de arrastre de 0 a 100 %
RADIO_PX = 14.0


def _puntos_vista(context):
    cara = _cara(context)
    fp = getattr(context.scene, 'rlb_forma', None)
    if cara is None or fp is None or not fp.puntos or not FO.preparada(cara):
        return None, []
    if fp.zona == 'oreja' and fp.a_mano:
        return cara, FO.puntos_locales(cara, fp.por_lado)
    return cara, FO.puntos(cara, fp.zona, fp.por_lado)


def _es_local(it):
    return it[1] == 'oreja' and it[2].startswith('p')


def _valor_local(cara, it):
    vals = [cara.get(it[5].format(e), 0.0) for e in FO.EJES_LOCAL]
    return 'fuera {:+.0f} · atrás {:+.0f} · arriba {:+.0f} %'.format(*vals)


def _dibujar():
    try:
        from bpy_extras.view3d_utils import location_3d_to_region_2d
        ctx = bpy.context
        if ctx.region_data is None or ctx.space_data is None or ctx.space_data.type != 'VIEW_3D':
            return
        cara, pts = _puntos_vista(ctx)
        if not pts:
            return
        sh = gpu.shader.from_builtin('UNIFORM_COLOR')
        gpu.state.blend_set('ALPHA')
        ang = [2 * math.pi * k / 24 for k in range(24)]
        texto = None
        fp_activo = ctx.scene.rlb_forma.activo
        for (i, z, modo, lado, tx, pr, w) in pts:
            c = location_3d_to_region_2d(ctx.region, ctx.region_data, w)
            if c is None:
                continue
            sobre = i == _hover[0] or (_arr and _arr.get('id') == i)
            elegido = modo == fp_activo
            loc = _es_local((i, z, modo))
            r = 9.0 if (sobre or elegido) else 6.0
            reposo = (0.3, 0.9, 1.0, 0.85) if loc else (1.0, 1.0, 1.0, 0.7)
            col = (1.0, 0.55, 0.85, 1.0) if sobre else (1.0, 0.6, 0.05, 1.0) if elegido else reposo
            if loc:      # rombo: punto de modelar a mano
                circ = [(c.x + r, c.y), (c.x, c.y + r), (c.x - r, c.y), (c.x, c.y - r)]
            else:
                circ = [(c.x + r * math.cos(a), c.y + r * math.sin(a)) for a in ang]
            gpu.state.line_width_set(2.5 if (sobre or elegido) else 1.3)
            b = batch_for_shader(sh, 'LINE_STRIP', {'pos': circ + [circ[0]]})
            sh.bind(); sh.uniform_float('color', col); b.draw(sh)
            k = r * 0.6
            b = batch_for_shader(sh, 'LINES', {'pos': [(c.x - k, c.y), (c.x + k, c.y), (c.x, c.y - k), (c.x, c.y + k)]})
            sh.bind(); sh.uniform_float('color', col); b.draw(sh)
            if sobre or elegido:
                val = _valor_local(cara, (i, z, modo, lado, tx, pr)) if loc else f'{cara.get(pr, 0.0):+.0f} %'
                texto = (c, f'{tx}  {val}') if (sobre or texto is None) else texto
        gpu.state.line_width_set(1.0); gpu.state.blend_set('NONE')
        if texto:
            c, t = texto
            blf.size(0, 13.0); blf.color(0, 1.0, 1.0, 1.0, 1.0)
            blf.position(0, c.x + 14, c.y + 10, 0); blf.draw(0, t)
    except Exception as e:
        print('forma puntos:', e)


def _bajo_raton(window, event):
    mx, my = event.mouse_x, event.mouse_y
    for a in window.screen.areas:
        if a.type != 'VIEW_3D' or not (a.x <= mx < a.x + a.width and a.y <= my < a.y + a.height):
            continue
        reg = next((r for r in a.regions if r.type == 'WINDOW'), None)
        if reg is None:
            return None
        for r in a.regions:
            if r.type != 'WINDOW' and r.width > 2 and r.height > 2 and r.x <= mx < r.x + r.width and r.y <= my < r.y + r.height:
                return None
        return a, reg, a.spaces.active.region_3d
    return None


def _punto_bajo(context, region, rv3d, mx, my):
    from bpy_extras.view3d_utils import location_3d_to_region_2d
    cara, pts = _puntos_vista(context)
    mejor, dmin = None, RADIO_PX
    for it in pts:
        c = location_3d_to_region_2d(region, rv3d, it[6])
        if c is not None:
            d = math.hypot(c.x - mx, c.y - my)
            if d <= dmin:
                mejor, dmin = it, d
    return cara, mejor


def _redibujar(context):
    for a in context.window.screen.areas:
        if a.type == 'VIEW_3D':
            a.tag_redraw()


class RLB_OT_forma_arrastrar(bpy.types.Operator):
    bl_idname = 'rlb.forma_arrastrar'
    bl_label = 'Editar con los puntos'
    bl_description = ('Activa los puntos sobre la cara: arrastra uno hacia arriba o abajo (o a los lados, según el control) '
                      'para mover su deslizador. Fuera de los puntos el ratón funciona como siempre')

    auto: bpy.props.BoolProperty(default=False, options={'HIDDEN', 'SKIP_SAVE'})

    def invoke(self, context, event):
        if _vivo[0] and not self.auto:                       # segundo clic: apagar
            bpy.app.driver_namespace['rlb_forma_token'] = None
            _vivo[0] = False
            _arr.clear(); _hover[0] = ''
            self.report({'INFO'}, 'Ratón de los puntos desactivado')
            _redibujar(context)
            return {'FINISHED'}
        self._token = object()
        bpy.app.driver_namespace['rlb_forma_token'] = self._token
        _vivo[0] = True
        _arr.clear()
        context.window_manager.modal_handler_add(self)
        if not self.auto:
            self.report({'INFO'}, 'Ratón activado: arrastra los puntos de la cara (círculo con cruz)')
        _redibujar(context)
        return {'RUNNING_MODAL'}

    def modal(self, context, event):
        if bpy.app.driver_namespace.get('rlb_forma_token') is not self._token or context.window is None:
            if bpy.app.driver_namespace.get('rlb_forma_token') is None:
                _vivo[0] = False
            return {'FINISHED', 'PASS_THROUGH'}
        if event.type in {'TIMER', 'TIMER_REPORT', 'NONE', 'INBETWEEN_MOUSEMOVE'}:
            return {'PASS_THROUGH'}
        if _arr:
            cara = bpy.data.objects.get(_arr['cara'])
            if event.type == 'MOUSEMOVE' and cara is not None and _arr.get('local'):
                # punto de modelar a mano: sigue al ratón en el plano de la pantalla (a la profundidad del punto)
                from bpy_extras.view3d_utils import region_2d_to_location_3d
                reg, rv3d = _arr['reg'], _arr['rv3d']
                try:
                    p = region_2d_to_location_3d(reg, rv3d, (event.mouse_x - reg.x, event.mouse_y - reg.y), _arr['p0'])
                except Exception:
                    _arr.clear(); return {'RUNNING_MODAL'}
                dw = p - _arr['p_ini']
                tope = 100.0 * FO.TOPE_LOCAL
                for e, A in _arr['ejes'].items():
                    v = _arr['base'][e] + 100.0 * dw.dot(A) / max(A.length_squared, 1e-12)
                    cara[_arr['prop'].format(e)] = max(-tope, min(tope, v))
                cara.update_tag()
                context.view_layer.update()
                _redibujar(context)
                return {'RUNNING_MODAL'}
            if event.type == 'MOUSEMOVE' and cara is not None:
                d = (event.mouse_x - _arr['x']) if _arr['eje'] == 'h' else (event.mouse_y - _arr['y'])
                cara[_arr['prop']] = max(-100.0, min(100.0, _arr['base'] + d * 100.0 / ESCALA_PX))
                cara.update_tag()
                context.view_layer.update()
                _redibujar(context)
                return {'RUNNING_MODAL'}
            if (event.type == 'LEFTMOUSE' and event.value == 'RELEASE') or (event.type == 'ESC' and event.value == 'PRESS'):
                _arr.clear(); _redibujar(context)
            return {'RUNNING_MODAL'}
        if event.type not in {'MOUSEMOVE', 'LEFTMOUSE'}:
            return {'PASS_THROUGH'}
        sobre = _bajo_raton(context.window, event) if not event.alt else None
        cara, it = (None, None)
        if sobre is not None:
            area, reg, rv3d = sobre
            cara, it = _punto_bajo(context, reg, rv3d, event.mouse_x - reg.x, event.mouse_y - reg.y)
        if event.type == 'MOUSEMOVE':
            i = it[0] if it else ''
            if i != _hover[0]:
                _hover[0] = i
                try:
                    context.window.cursor_set('HAND' if i else 'DEFAULT')
                except Exception:
                    pass
                _redibujar(context)
            return {'PASS_THROUGH'}
        if event.value == 'PRESS' and it and _es_local(it):
            from bpy_extras.view3d_utils import region_2d_to_location_3d
            area, reg, rv3d = sobre
            p0 = it[6].copy()
            _arr.update(id=it[0], cara=cara.name, prop=it[5], local=True, reg=reg, rv3d=rv3d, p0=p0,
                        p_ini=region_2d_to_location_3d(reg, rv3d, (event.mouse_x - reg.x, event.mouse_y - reg.y), p0),
                        ejes=FO.ejes_mundo_local(cara, it[3]),
                        base={e: float(cara.get(it[5].format(e), 0.0)) for e in FO.EJES_LOCAL})
            return {'RUNNING_MODAL'}
        if event.value == 'PRESS' and it:
            context.scene.rlb_forma.activo = it[2]
            _arr.update(id=it[0], cara=cara.name, prop=it[5], base=float(cara.get(it[5], 0.0)), x=event.mouse_x,
                        y=event.mouse_y, eje=FO.EJE_ARRASTRE.get(it[2], 'v'))
            return {'RUNNING_MODAL'}
        return {'PASS_THROUGH'}


# ---------------------------------------------------------------- panel
class RLB_PT_forma(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Rig labial'
    bl_label = '4. Ojos y forma de la cara'
    bl_order = 20

    def draw(self, context):
        from . import asistente as AS
        lay = self.layout
        cara = _cara(context)
        if cara is None:
            AS._parrafo(lay, context, 'Selecciona la cabeza del personaje en la vista 3D', 'RESTRICT_SELECT_OFF')
            return
        fp = context.scene.rlb_forma
        self._ojos(lay, context, fp, cara, AS)
        self._forma(lay, context, fp, cara, AS)
        if fp.informe:
            AS._parrafo(lay, context, fp.informe[:300], 'INFO')

    def _ojos(self, lay, context, fp, cara, AS):
        cab, cu = lay.panel('RLB_forma_ojos', default_closed=False)
        cab.label(text='Ojos: posición neutra', icon='HIDE_OFF')
        if not cu:
            return
        if not FO.pivotes(cara):
            AS._parrafo(cu, context, 'Este personaje aún no tiene los ojos del complemento (paso «Ojos»).', 'INFO')
            return
        AS._parrafo(cu, context, 'Mueve cada ojo entero (globo, iris, pupila). Las expresiones se suman a esta posición.')
        cu.prop(fp, 'espejo')
        for lado, tit in (('L', 'Ojo izquierdo'), ('R', 'Ojo derecho')):
            b = cu.box()
            b.label(text=tit)
            c = b.column(align=True)
            for e in EJES:
                c.prop(fp, f'{lado}_{e}')
        r = cu.row(align=True)
        r.operator('rlb.ojos_neutro', icon='LOOP_BACK')
        r.operator('rlb.ojos_parpados', icon='HIDE_OFF')
        av = FO.aviso_parpados(cara)
        if av:
            AS._parrafo(cu, context, av, 'ERROR', alert=True)

    def _forma(self, lay, context, fp, cara, AS):
        cab, cu = lay.panel('RLB_forma_zonas', default_closed=False)
        cab.label(text='Forma de la cara', icon='MOD_MESHDEFORM')
        if not cu:
            return
        if not FO.preparada(cara):
            AS._parrafo(cu, context, 'Retoca el mentón, la mandíbula y las orejas con deslizadores, igual en los dos lados. '
                        'La piel se toma de las islas UV; el pelo y la ropa no se mueven.', 'INFO')
            c = cu.column(); c.scale_y = 1.6
            c.operator('rlb.forma_preparar', icon='MOD_MESHDEFORM')
            return
        cu.row().prop(fp, 'zona', expand=True)
        r = cu.row(align=True)
        r.prop(fp, 'puntos', toggle=True, icon='EMPTY_AXIS')
        r.operator('rlb.forma_arrastrar', text='Ratón activo' if _vivo[0] else 'Activar ratón',
                   icon='RESTRICT_SELECT_OFF', depress=_vivo[0])
        titulo, pares, modos = FO.ZONAS[fp.zona]
        if pares:
            cu.prop(fp, 'por_lado')
        if fp.zona == 'oreja':
            b = cu.box()
            b.prop(fp, 'a_mano', icon='SCULPTMODE_HLT', toggle=True)
            if fp.a_mano:
                if not cara.get('rlb_forma_locales'):
                    AS._parrafo(b, context, 'Pulsa «Actualizar zonas» (abajo) para crear los puntos de modelar a mano.',
                                'ERROR', alert=True)
                else:
                    AS._parrafo(b, context, 'Arrastra un rombo azul en cualquier dirección: solo se mueve esa parte '
                                'de la oreja. Gira la vista (de lado o de frente) para moverlo en otro plano. '
                                'Con «Cada lado por separado» apagado, la otra oreja se mueve en espejo.')
                    b.operator('rlb.forma_reiniciar', text='Restaurar lo modelado a mano', icon='LOOP_BACK').zona = 'mano'
        for pn, ptxt, _v in FO.PRESETS.get(fp.zona, []):
            o = cu.operator('rlb.forma_preset', text=ptxt, icon='SHADING_RENDERED')
            o.zona, o.nombre = fp.zona, pn
        col = cu.column(align=False)
        for modo, texto, mas, menos in modos:
            el = fp.activo == modo
            fila = col.box().column(align=True) if el else col.column(align=True)
            fila.operator('rlb.forma_elegir', text=f'{texto}: {menos} ↔ {mas}', depress=el, emboss=el,
                          icon='RADIOBUT_ON' if el else 'RADIOBUT_OFF').modo = modo
            fila.prop(cara, f'["{FO.prop(fp.zona, modo)}"]', text='', slider=True)
            if pares and fp.por_lado:
                r = fila.row(align=True)
                r.prop(cara, f'["{FO.prop(fp.zona, modo, "L")}"]', text='Izq.', slider=True)
                r.prop(cara, f'["{FO.prop(fp.zona, modo, "R")}"]', text='Der.', slider=True)
        r = cu.row(align=True)
        r.operator('rlb.forma_reiniciar', text='Restaurar zona', icon='LOOP_BACK').zona = fp.zona
        r.operator('rlb.forma_reiniciar', text='Restaurar todo').zona = ''
        b = cu.box()
        b.label(text='Puntos rosados', icon='EMPTY_AXIS')
        r = b.row(align=True)
        r.operator('rlb.forma_punto', text='Oreja izq.').punto = 'fm_oreja.L'
        r.operator('rlb.forma_punto', text='Oreja der.').punto = 'fm_oreja.R'
        r.operator('rlb.forma_punto', text='Mentón').punto = 'fm_menton'
        r = b.row(align=True)
        r.operator('rlb.forma_actualizar', icon='FILE_REFRESH')
        r.operator('rlb.forma_puntos_ver', icon='HIDE_OFF')
        cu.operator('rlb.forma_fijar', icon='CHECKMARK')


CLASES = (RLB_Forma, RLB_OT_forma_preparar, RLB_OT_forma_actualizar, RLB_OT_forma_reiniciar, RLB_OT_forma_punto,
          RLB_OT_forma_puntos_ver, RLB_OT_forma_fijar, RLB_OT_ojos_neutro, RLB_OT_ojos_parpados, RLB_OT_forma_arrastrar, RLB_OT_forma_elegir, RLB_OT_forma_preset, RLB_PT_forma)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Scene.rlb_forma = bpy.props.PointerProperty(type=RLB_Forma)
    _handler[0] = bpy.types.SpaceView3D.draw_handler_add(_dibujar, (), 'WINDOW', 'POST_PIXEL')


def unregister():
    if _handler[0] is not None:
        bpy.types.SpaceView3D.draw_handler_remove(_handler[0], 'WINDOW'); _handler[0] = None
    bpy.app.driver_namespace.pop('rlb_forma_token', None)
    del bpy.types.Scene.rlb_forma
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
