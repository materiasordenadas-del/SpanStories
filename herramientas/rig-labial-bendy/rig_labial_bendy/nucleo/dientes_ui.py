"""Ajustes relativos de arcadas; conserva el rig y compensa orígenes alejados."""
import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, FloatVectorProperty, PointerProperty, StringProperty
from mathutils import Vector


def _rotacion(obj):
    if obj.rotation_mode == 'QUATERNION':
        return obj.rotation_quaternion.to_matrix()
    if obj.rotation_mode == 'AXIS_ANGLE':
        from mathutils import Quaternion
        return Quaternion(Vector(obj.rotation_axis_angle[1:]), obj.rotation_axis_angle[0]).to_matrix()
    return obj.rotation_euler.to_matrix()


def _validar(obj):
    if obj is None or obj.type != 'MESH' or not obj.data.vertices:
        raise ValueError('Elige una malla dental con vértices')
    if obj.mode != 'OBJECT' or obj.library or obj.constraints:
        raise ValueError('La pieza debe ser editable, estar en modo Objeto y sin restricciones de objeto')
    if any(obj.lock_location) or obj.lock_scale[2] or min(obj.scale) <= 0:
        raise ValueError('La pieza tiene transformaciones bloqueadas o escala no positiva')
    if Vector(obj.delta_rotation_euler).length > 1e-6 or abs(obj.delta_rotation_quaternion.angle) > 1e-6 or (obj.delta_scale - Vector((1, 1, 1))).length > 1e-6:
        raise ValueError('La pieza tiene giro o escala delta; conserva esos ajustes con edición manual')
    if obj.animation_data:
        paths = [d.data_path for d in obj.animation_data.drivers]
        action = obj.animation_data.action
        if action or obj.animation_data.nla_tracks or any(p in {'location', 'scale', 'rotation_euler', 'rotation_quaternion', 'rotation_axis_angle'} for p in paths):
            raise ValueError('La transformación está animada; no se sobrescribe desde este panel')


def iniciar(obj, superior):
    _validar(obj)
    bpy.context.view_layer.update()
    ed = obj.rlb_dientes
    r = _rotacion(obj)
    # La matriz de parentesco incluye padre de hueso e inversa, también en una pose.
    parent = (obj.matrix_world @ obj.matrix_basis.inverted()).to_3x3()
    arriba, delante = r.col[2].copy(), -r.col[1].copy()
    len_z, len_y = (parent @ arriba).length, (parent @ delante).length
    if min(len_z, len_y) < 1e-9:
        raise ValueError('El padre tiene una transformación degenerada')
    zs = [v.co.z for v in (obj.data.shape_keys.reference_key.data if obj.data.shape_keys else obj.data.vertices)]
    ed.listo = False
    ed.base_pos = obj.location[:]
    ed.base_escala = obj.scale[:]
    ed.arriba = arriba / len_z
    ed.delante = delante / len_y
    ed.ancla = max(zs) if superior else min(zs)
    ed.compensacion = arriba
    ed.alto = 1.0
    ed.vertical = 0.0
    ed.profundidad = 0.0
    ed.ultima_pos = obj.location[:]
    ed.ultima_escala = obj.scale[:]
    ed.giro = tuple(v for row in r for v in row)
    ed.error = ''
    ed.listo = True


def aplicar(ed, context):
    if not ed.listo:
        return
    obj = ed.id_data
    try:
        _validar(obj)
        giro = tuple(v for row in _rotacion(obj) for v in row)
        if ((obj.location - Vector(ed.ultima_pos)).length > 1e-6 or
                (obj.scale - Vector(ed.ultima_escala)).length > 1e-6 or
                max(abs(a-b) for a, b in zip(giro, ed.giro)) > 1e-6):
            raise ValueError('La pieza cambió fuera del panel. Pulsa Tomar posición actual para continuar')
        escala = Vector(ed.base_escala)
        escala.z *= ed.alto
        pos = (Vector(ed.base_pos) + Vector(ed.arriba) * ed.vertical +
               Vector(ed.delante) * ed.profundidad +
               Vector(ed.compensacion) * ((ed.base_escala[2] - escala.z) * ed.ancla))
        obj.scale = escala
        obj.location = pos
        ed.ultima_pos = obj.location[:]
        ed.ultima_escala = obj.scale[:]
        ed.error = ''
    except (ValueError, RuntimeError) as exc:
        ed.error = str(exc)


def _es_pieza(obj):
    if obj is None or obj.type != 'MESH' or not obj.data.polygons:
        return False
    return any(p in obj.name.casefold() for p in ('diente', 'teeth', 'tooth', 'lengua', 'tongue')) or bool(obj.get('rlb_dientes_pieza')) or obj.get('rlb_pieza_original') == 'Tongue'


def _leer_desplazamiento(clave):
    def get(ed):
        return float(ed.get(clave, 0.0))
    return get


def _mover_pieza(clave, eje, signo):
    def set(ed, valor):
        obj = ed.id_data
        try:
            _validar(obj)
            if not _es_pieza(obj):
                raise ValueError('Selecciona la dentadura superior, inferior o la lengua')
            diferencia = float(valor) - float(ed.get(clave, 0.0))
            if abs(diferencia) < 1e-12:
                return
            bpy.context.view_layer.update()
            # Lee la transformación actual: no necesita asignación ni un estado inicial.
            # La dirección sigue la pieza y su mandíbula, incluso con padre de hueso.
            parent = (obj.matrix_world @ obj.matrix_basis.inverted()).to_3x3()
            direccion = obj.matrix_world.to_3x3().col[eje].normalized() * signo
            obj.location += parent.inverted() @ (direccion * diferencia)
            ed[clave] = float(valor)
            ed.error = ''
        except (ValueError, RuntimeError) as exc:
            ed.error = str(exc)
    return set


class RLB_DientesAjuste(bpy.types.PropertyGroup):
    altura_directa: FloatProperty(name='Altura', description='Subir (+) o bajar (-) la pieza seleccionada', unit='LENGTH', precision=4, step=0.01, soft_min=-0.02, soft_max=0.02, get=_leer_desplazamiento('altura_directa_valor'), set=_mover_pieza('altura_directa_valor', 2, 1))
    profundidad_directa: FloatProperty(name='Profundidad', description='Adelantar (+) o atrasar (-) la pieza seleccionada', unit='LENGTH', precision=4, step=0.01, soft_min=-0.02, soft_max=0.02, get=_leer_desplazamiento('profundidad_directa_valor'), set=_mover_pieza('profundidad_directa_valor', 1, -1))
    listo: BoolProperty(default=False)
    alto: FloatProperty(name='Alto', description='1 = alto inicial. Cambia el alto conservando el borde de la encía', default=1.0, min=0.1, max=3.0, precision=3, update=aplicar)
    vertical: FloatProperty(name='Subir / bajar', description='Desplazamiento relativo; positivo sube la arcada', unit='LENGTH', precision=4, step=0.01, update=aplicar)
    profundidad: FloatProperty(name='Adelantar / atrasar', description='Desplazamiento relativo; positivo adelanta la arcada', unit='LENGTH', precision=4, step=0.01, update=aplicar)
    base_pos: FloatVectorProperty(size=3)
    base_escala: FloatVectorProperty(size=3)
    arriba: FloatVectorProperty(size=3)
    delante: FloatVectorProperty(size=3)
    compensacion: FloatVectorProperty(size=3)
    ultima_pos: FloatVectorProperty(size=3)
    ultima_escala: FloatVectorProperty(size=3)
    giro: FloatVectorProperty(size=9)
    ancla: FloatProperty()
    error: StringProperty()


def _mesh(self, obj):
    return obj.type == 'MESH'


class RLB_DientesObjetos(bpy.types.PropertyGroup):
    superior: PointerProperty(name='Superiores', type=bpy.types.Object, poll=_mesh)
    inferior: PointerProperty(name='Inferiores', type=bpy.types.Object, poll=_mesh)


class RLB_OT_dientes_ajuste(bpy.types.Operator):
    bl_idname = 'rlb.dientes_ajuste'
    bl_label = 'Configurar ajuste dental'
    bl_options = {'REGISTER', 'UNDO'}
    lado: EnumProperty(items=[('superior', 'Superiores', ''), ('inferior', 'Inferiores', '')])
    accion: EnumProperty(items=[('INICIAR', 'Tomar posición actual', ''), ('RESTAURAR', 'Restablecer ajustes', ''), ('SELECCION', 'Usar selección', '')])

    def execute(self, context):
        targets = context.scene.rlb_dientes_objetos
        obj = context.active_object if self.accion == 'SELECCION' else getattr(targets, self.lado)
        other = targets.inferior if self.lado == 'superior' else targets.superior
        try:
            if obj is other and obj is not None:
                raise ValueError('Usa objetos distintos para cada arcada')
            _validar(obj)
            ed = obj.rlb_dientes
            if self.accion == 'RESTAURAR':
                if not ed.listo:
                    raise ValueError('Primero toma la posición actual')
                ed.listo = False
                ed.alto, ed.vertical, ed.profundidad = 1.0, 0.0, 0.0
                ed.listo = True
                aplicar(ed, context)
                if ed.error:
                    raise ValueError(ed.error)
            else:
                iniciar(obj, self.lado == 'superior')
                setattr(targets, self.lado, obj)
        except (ValueError, RuntimeError) as exc:
            self.report({'ERROR'}, str(exc))
            return {'CANCELLED'}
        return {'FINISHED'}


class RLB_PT_pieza_ajuste(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Rig labial'
    bl_label = 'Dientes y lengua'
    bl_order = -10

    @classmethod
    def poll(cls, context):
        return _es_pieza(context.active_object)

    def draw(self, context):
        obj = context.active_object
        ed = obj.rlb_dientes
        self.layout.label(text=obj.name, icon='MESH_DATA')
        col = self.layout.column(align=True)
        col.scale_y = 1.4
        col.enabled = obj.mode == 'OBJECT'
        col.prop(ed, 'profundidad_directa', slider=True)
        col.prop(ed, 'altura_directa', slider=True)
        if obj.mode != 'OBJECT':
            self.layout.label(text='Cambia a modo Objeto', icon='INFO')
        if ed.error:
            from .asistente import _parrafo
            _parrafo(self.layout, context, ed.error, 'ERROR')


CLASES = (RLB_DientesAjuste, RLB_DientesObjetos, RLB_OT_dientes_ajuste, RLB_PT_pieza_ajuste)


def register():
    for cls in CLASES:
        bpy.utils.register_class(cls)
    bpy.types.Object.rlb_dientes = PointerProperty(type=RLB_DientesAjuste)
    bpy.types.Scene.rlb_dientes_objetos = PointerProperty(type=RLB_DientesObjetos)


def unregister():
    del bpy.types.Scene.rlb_dientes_objetos
    del bpy.types.Object.rlb_dientes
    for cls in reversed(CLASES):
        bpy.utils.unregister_class(cls)
