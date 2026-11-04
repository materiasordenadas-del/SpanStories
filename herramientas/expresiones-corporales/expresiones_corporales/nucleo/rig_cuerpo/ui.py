"""Panel «1. Esqueleto»: detectar, ajustar a mano con botones sencillos y confirmar.

Pensado para alguien que sabe poco de Blender: cada articulacion tiene un boton «mover»
(la coge con el raton, clic para soltar) y cada grupo tiene flechas para subir, bajar, abrir,
cerrar, adelantar, atrasar, alargar y acortar. Con simetria, lo que se hace en un lado se
repite en el otro. El esqueleto de vista previa se mueve en vivo.

Lo registra el __init__ del complemento con `rig_cuerpo.ui.register()`.
"""
import textwrap
import traceback

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, PointerProperty, StringProperty

from . import ajuste, medir


def _malla_ok(self, ob):
    return ob.type == 'MESH'


class ECORP_RigProps(bpy.types.PropertyGroup):
    personaje: StringProperty(name='Personaje', description='Nombre corto (marcadores ECB_<nombre>_*)')
    malla: PointerProperty(name='Malla', type=bpy.types.Object, poll=_malla_ok,
                           description='Malla original del cuerpo (no se modifica al colocar el esqueleto)')
    simetria: BoolProperty(name='Simetria', default=True,
                           description='Lo que se mueve en un lado se repite en espejo en el otro')
    fuente: EnumProperty(name='Punto de partida', default='PROPIA', items=[
        ('PROPIA', 'Deteccion automatica', 'Medir las articulaciones en la malla'),
        ('MIXAMO', 'Esqueleto Mixamo', 'Copiar las articulaciones de un esqueleto mixamorig de la escena'),
        ('MEZCLA', 'Mezcla', 'Promedio de la deteccion y Mixamo (lo que solo tiene una fuente se queda)')])
    mixamo: PointerProperty(name='Esqueleto Mixamo', type=bpy.types.Object,
                            poll=lambda s, o: o.type == 'ARMATURE')
    peso_mixamo: FloatProperty(name='Peso Mixamo', default=0.5, min=0, max=1)
    paso_mm: FloatProperty(name='Paso', default=5.0, min=0.5, max=50, description='Milimetros por clic (personaje de 1 m)')
    lado: EnumProperty(name='Lado', items=[('AMBOS', 'Ambos', ''), ('L', 'Izquierdo', ''), ('R', 'Derecho', '')])
    informe: StringProperty()


def _p(context):
    return context.scene.ecorp_rig


def _altura(p):
    if p.malla is None:
        return 1.0
    return max(p.malla.dimensions.z * p.malla.matrix_world.to_scale().z, 1e-3)


class ECORP_OT_rig_detectar(bpy.types.Operator):
    bl_idname = 'ecorp.rig_detectar'
    bl_label = 'Detectar articulaciones'
    bl_description = 'Mide la malla (o copia Mixamo) y coloca los marcadores y el esqueleto de vista previa'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        p = _p(context)
        if p.malla is None:
            self.report({'ERROR'}, 'Elige la malla del cuerpo')
            return {'CANCELLED'}
        if not p.personaje:
            p.personaje = p.malla.name.split('.')[0]
        try:
            z_cab = None
            avisos = []
            puntos = {}
            if p.fuente in ('PROPIA', 'MEZCLA'):
                r = medir.medir([p.malla], z_cabeza=z_cab)
                puntos, avisos = r['puntos'], r['avisos']
            if p.fuente in ('MIXAMO', 'MEZCLA'):
                from . import mixamo
                arm = p.mixamo or (mixamo.buscar() or [None])[0]
                if arm is None:
                    self.report({'ERROR'}, 'No hay esqueleto Mixamo en la escena')
                    return {'CANCELLED'}
                mx = mixamo.puntos(arm, [p.malla])['puntos']
                if p.fuente == 'MIXAMO':
                    # lo que Mixamo no tiene (talones, ayudas de la mano) sale de la deteccion
                    base = medir.medir([p.malla])['puntos']
                    puntos = mixamo.mezclar(base, mx, 1.0)
                else:
                    dif = mixamo.comparar(puntos, mx)
                    lejos = [k for k, d in dif.items() if d > 5]
                    if lejos:
                        avisos.append('Mixamo y la deteccion difieren >5 cm en: ' + ', '.join(sorted(lejos)))
                    puntos = mixamo.mezclar(puntos, mx, p.peso_mixamo)
            ajuste.poner_marcadores(p.personaje, puntos)
            ajuste.vista_previa(p.personaje)
            p.informe = ' | '.join(avisos) if avisos else 'Marcadores colocados. Revisa y ajusta.'
        except Exception as e:
            traceback.print_exc()
            self.report({'ERROR'}, f'Fallo al detectar: {e}')
            return {'CANCELLED'}
        self.report({'INFO'}, p.informe[:200])
        return {'FINISHED'}


class ECORP_OT_rig_mover(bpy.types.Operator):
    bl_idname = 'ecorp.rig_mover'
    bl_label = 'Mover'
    bl_description = 'Coge esta articulacion para moverla con el raton (clic para soltar, Esc cancela)'
    punto: StringProperty()

    def invoke(self, context, event):
        p = _p(context)
        if not ajuste.seleccionar(p.personaje, self.punto, mover=True):
            self.report({'ERROR'}, f'No existe el marcador {self.punto}')
            return {'CANCELLED'}
        return {'FINISHED'}


class ECORP_OT_rig_grupo(bpy.types.Operator):
    bl_idname = 'ecorp.rig_grupo'
    bl_label = 'Ajustar grupo'
    bl_description = 'Mueve todo el grupo un paso'
    bl_options = {'REGISTER', 'UNDO'}
    grupo: StringProperty()
    arriba: FloatProperty()
    afuera: FloatProperty()
    adelante: FloatProperty()
    alargar: FloatProperty()

    def execute(self, context):
        p = _p(context)
        paso = p.paso_mm / 1000.0 * _altura(p)
        lado = None if p.lado == 'AMBOS' else p.lado
        ajuste.mover_grupo(p.personaje, self.grupo, arriba=self.arriba * paso, afuera=self.afuera * paso,
                           adelante=self.adelante * paso, alargar=self.alargar * 0.02, lado=lado)
        return {'FINISHED'}


class ECORP_OT_rig_reiniciar(bpy.types.Operator):
    bl_idname = 'ecorp.rig_reiniciar'
    bl_label = 'Volver a lo detectado'
    bl_options = {'REGISTER', 'UNDO'}
    grupo: StringProperty(default='')

    def execute(self, context):
        ajuste.reiniciar(_p(context).personaje, self.grupo or None)
        return {'FINISHED'}


class ECORP_OT_rig_simetrizar(bpy.types.Operator):
    bl_idname = 'ecorp.rig_simetrizar'
    bl_label = 'Copiar izquierda a derecha'
    bl_options = {'REGISTER', 'UNDO'}
    desde: StringProperty(default='L')

    def execute(self, context):
        ajuste.simetrizar(_p(context).personaje, self.desde)
        return {'FINISHED'}


class ECORP_OT_rig_ver(bpy.types.Operator):
    bl_idname = 'ecorp.rig_ver'
    bl_label = 'Mostrar/ocultar marcadores'
    mostrar: BoolProperty(default=True)

    def execute(self, context):
        p = _p(context)
        if self.mostrar and bpy.data.objects.get(f'ECB_{p.personaje}_vista') is None:
            ajuste.vista_previa(p.personaje)
        ajuste.mostrar_marcadores(p.personaje, self.mostrar)
        return {'FINISHED'}


class ECORP_OT_rig_foto(bpy.types.Operator):
    bl_idname = 'ecorp.rig_foto'
    bl_label = 'Fotos de revision'
    bl_description = 'Renders de frente, lado y mano con el esqueleto encima (carpeta del .blend)'

    def execute(self, context):
        p = _p(context)
        carpeta = bpy.path.abspath('//ECB_revision') if bpy.data.filepath else bpy.app.tempdir
        rutas = medir.foto_marcadores(p.personaje, [p.malla], carpeta)
        p.informe = 'Fotos en ' + carpeta
        self.report({'INFO'}, p.informe)
        return {'FINISHED'}


class ECORP_OT_rig_confirmar(bpy.types.Operator):
    bl_idname = 'ecorp.rig_confirmar'
    bl_label = 'Confirmar esqueleto'
    bl_description = 'Crea el rig Rigify con estas posiciones (la malla todavia no se toca)'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        p = _p(context)
        try:
            rig = ajuste.confirmar(p.personaje)
        except Exception as e:
            traceback.print_exc()
            self.report({'ERROR'}, f'Rigify no pudo generar: {e}')
            return {'CANCELLED'}
        p.informe = f'Rig {rig.name} creado. Siguiente: pesos.'
        self.report({'INFO'}, p.informe)
        return {'FINISHED'}


PUNTOS_UI = [
    ('Columna y cabeza', 'columna', [('Pelvis', 'pelvis'), ('Cintura', 'columna'), ('Pecho', 'pecho'),
                                     ('Pecho alto', 'pecho_alto'), ('Base del cuello', 'cuello'),
                                     ('Base de la cabeza', 'cabeza'), ('Coronilla', 'coronilla')]),
    ('Brazo', 'brazos', [('Clavícula', 'clavicula'), ('Hombro', 'hombro'), ('Codo', 'codo'), ('Muñeca', 'muneca')]),
    ('Mano', 'manos', [('Pulgar base', 'pulgar_0'), ('Pulgar punta', 'pulgar_3'), ('Índice nudillo', 'indice_0'),
                       ('Índice punta', 'indice_3'), ('Medio nudillo', 'medio_0'), ('Medio punta', 'medio_3'),
                       ('Anular nudillo', 'anular_0'), ('Anular punta', 'anular_3'),
                       ('Meñique nudillo', 'menique_0'), ('Meñique punta', 'menique_3')]),
    ('Pierna', 'piernas', [('Cadera', 'cadera'), ('Rodilla', 'rodilla'), ('Tobillo', 'tobillo'),
                           ('Planta (dedos)', 'bola_pie'), ('Punta del pie', 'punta_pie'), ('Talón', 'talon')]),
]
GRUPOS_UI = [('Hombros', 'hombros'), ('Brazos', 'brazos'), ('Codos', 'codos'), ('Manos', 'manos'),
             ('Dedos', 'dedos'), ('Columna', 'columna'), ('Pelvis', 'pelvis'), ('Rodillas', 'rodillas'),
             ('Pies', 'pies'), ('Piernas', 'piernas'), ('Cabeza', 'cabeza')]


def _flecha(fila, grupo, icono, **kw):
    op = fila.operator('ecorp.rig_grupo', text='', icon=icono)
    op.grupo = grupo
    for k, v in kw.items():
        setattr(op, k, v)


def _parrafo(lay, context, texto, icon='NONE', alert=False):
    """texto largo en varias líneas según el ancho del panel (la etiqueta nunca se corta con «…»)."""
    ancho = max(24, int(context.region.width / 10.5) - 2) if context.region else 44
    col = lay.column(align=True)
    col.alert = alert
    for i, l in enumerate(textwrap.wrap(str(texto), ancho) or ['']):
        col.label(text=l, icon=icon if i == 0 else 'BLANK1')


class ECORP_PT_esqueleto(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Cuerpo'
    bl_label = '1. Esqueleto'
    bl_order = 1

    def draw_header(self, context):
        try:
            p = _p(context)
            hecho = bool(p.personaje) and bpy.data.objects.get(f'{p.personaje}_Rig') is not None
            self.layout.label(text='', icon='CHECKMARK' if hecho else 'RADIOBUT_OFF')
        except Exception:
            pass

    def draw(self, context):
        p = _p(context)
        lay = self.layout
        col = lay.column()
        col.prop(p, 'malla')
        col.prop(p, 'personaje')
        col.prop(p, 'fuente')
        if p.fuente != 'PROPIA':
            col.prop(p, 'mixamo')
            if p.fuente == 'MEZCLA':
                col.prop(p, 'peso_mixamo', slider=True)
        c = col.column(); c.scale_y = 2.0          # botón principal de la etapa
        c.operator('ecorp.rig_detectar', icon='VIEWZOOM')
        if not p.personaje or not bpy.data.objects.get(f'ECB_{p.personaje}_pelvis'):
            return
        # herramientas bajo «Detectar articulaciones», con leyenda en cada botón
        fila = lay.row(align=True)
        fila.prop(p, 'simetria', text='Simetría', toggle=True, icon='MOD_MIRROR')
        fila.operator('ecorp.rig_ver', text='Ver', icon='HIDE_OFF').mostrar = True
        fila.operator('ecorp.rig_ver', text='Ocultar', icon='HIDE_ON').mostrar = False
        fila.operator('ecorp.rig_foto', text='Foto', icon='RENDER_STILL')
        if p.informe:
            caja = lay.box()
            _parrafo(caja, context, p.informe[:360], 'INFO')
        # mover articulaciones una a una (ya hay marcadores: abierto)
        cab, cuerpo = lay.panel('ECORP_esq_mover', default_closed=False)
        cab.label(text='Mover articulaciones una a una')
        if cuerpo:
            lado = 'L' if p.lado != 'R' else 'R'
            f = cuerpo.row(align=True)
            f.label(text='Lado:')
            f.prop(p, 'lado', text='')
            for titulo, grupo, puntos in PUNTOS_UI:
                caja = cuerpo.box()
                caja.label(text=titulo + ('' if grupo == 'columna' else f' ({"izq." if lado == "L" else "der."})'))
                rej = caja.grid_flow(columns=2, align=True)
                for txt, k in puntos:
                    clave = k if grupo == 'columna' else f'{k}.{lado}'
                    rej.operator('ecorp.rig_mover', text=txt).punto = clave
        # ajustes por grupo con flechas
        cab, cuerpo = lay.panel('ECORP_esq_grupos', default_closed=True)
        cab.label(text='Ajustar por grupos (flechas)')
        if cuerpo:
            cuerpo.prop(p, 'paso_mm', text='Paso (mm por clic)')
            _parrafo(cuerpo, context, 'El lado (izq., der. o ambos) se elige en «Mover articulaciones una a una».', 'INFO')
            _parrafo(cuerpo, context, '▲▼ arriba/abajo · ◀▶ afuera/adentro · ↑↓ adelante/atrás · + − largo')
            for txt, g in GRUPOS_UI:
                sp = cuerpo.split(factor=0.3, align=True)
                sp.label(text=txt)
                fila = sp.row(align=True)
                _flecha(fila, g, 'TRIA_UP', arriba=1)
                _flecha(fila, g, 'TRIA_DOWN', arriba=-1)
                _flecha(fila, g, 'TRIA_RIGHT', afuera=1)
                _flecha(fila, g, 'TRIA_LEFT', afuera=-1)
                _flecha(fila, g, 'SORT_DESC', adelante=1)
                _flecha(fila, g, 'SORT_ASC', adelante=-1)
                if g in ajuste.RAIZ_CADENA:
                    _flecha(fila, g, 'ADD', alargar=1)
                    _flecha(fila, g, 'REMOVE', alargar=-1)
                else:                                   # mismas columnas en todas las filas
                    fila.label(text='')
                    fila.label(text='')
                fila.operator('ecorp.rig_reiniciar', text='', icon='LOOP_BACK').grupo = g
        # salida de la etapa: siempre visible, fuera de las secciones plegables
        fila = lay.row(align=True); fila.scale_y = 1.4
        fila.operator('ecorp.rig_simetrizar', text='Izq. → der.').desde = 'L'
        fila.operator('ecorp.rig_simetrizar', text='Der. → izq.').desde = 'R'
        c = lay.column(); c.scale_y = 1.4
        c.operator('ecorp.rig_reiniciar', text='Volver todo a lo detectado', icon='LOOP_BACK').grupo = ''
        lay.separator()
        c = lay.column(); c.scale_y = 2.0
        c.operator('ecorp.rig_confirmar', icon='CHECKMARK')


CLASES = (ECORP_RigProps, ECORP_OT_rig_detectar, ECORP_OT_rig_mover, ECORP_OT_rig_grupo, ECORP_OT_rig_reiniciar,
          ECORP_OT_rig_simetrizar, ECORP_OT_rig_ver, ECORP_OT_rig_foto, ECORP_OT_rig_confirmar, ECORP_PT_esqueleto)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Scene.ecorp_rig = PointerProperty(type=ECORP_RigProps)
    ajuste.registrar_handler()
    from . import ui_pesos
    ui_pesos.register()


def unregister():
    from . import ui_pesos
    ui_pesos.unregister()
    ajuste.quitar_handler()
    del bpy.types.Scene.ecorp_rig
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
