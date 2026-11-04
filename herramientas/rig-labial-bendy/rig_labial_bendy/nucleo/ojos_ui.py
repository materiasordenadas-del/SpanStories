"""Edición ocular relativa, sin regenerar el diseño ni tocar la piel."""
import base64
import json
import math
import zlib

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, PointerProperty, StringProperty
from mathutils import Matrix, Vector
from . import marco as MK

BASE = 'rlb_ojos_edicion_base'
_ocupado = False


def personaje(context):
    from . import asistente
    ob = context.active_object
    while ob:
        if len(MK.cfg(ob).get('pivotes', [])) == 2:
            return ob
        ob = ob.parent
    return asistente.personaje(context)


def pivotes(cara):
    nombres = MK.cfg(cara).get('pivotes', []) if cara else []
    return [bpy.data.objects.get(n) for n in nombres]


def _tipo(ob):
    n = ob.name.lower()
    if '_iris_' in n: return 'iris'
    if '_pupila_' in n or '_pupil_' in n: return 'pupila'
    if '_cornea_' in n or '_highlight_' in n or 'brillo' in n: return 'cornea'
    if '_globo_' in n or '_eyeball_' in n: return 'globo'
    return None


def capturar(p):
    if p.mode != 'OBJECT' or p.library or p.constraints:
        raise ValueError('El pivote debe ser editable y sin restricciones propias')
    if p.animation_data:
        ad = p.animation_data
        if ad.action or ad.nla_tracks:
            raise ValueError('El pivote tiene animación propia; no se sobrescribe')
        for fc in ad.drivers:
            if fc.data_path == 'scale' and fc.array_index == 1 and any(
                t.id == p and t.data_path == '["rlb_escala"]'
                for v in fc.driver.variables for t in v.targets):
                continue
            if fc.data_path in {'scale', 'location'}:
                raise ValueError('El pivote tiene un driver de transformación ajeno')
    piezas = []
    for ob in p.children:
        tipo = _tipo(ob)
        if ob.type != 'MESH' or tipo is None: continue
        if ob.mode != 'OBJECT' or ob.data.users != 1 or ob.data.shape_keys or ob.modifiers:
            raise ValueError('Las piezas oculares deben ser mallas propias sin keys ni modificadores')
        piezas.append({'nombre': ob.name, 'tipo': tipo,
                       'matriz': [list(r) for r in ob.matrix_local],
                       'co': [list(v.co) for v in ob.data.vertices]})
    if not all(any(o['tipo'] == t for o in piezas) for t in ('globo', 'iris', 'pupila')):
        raise ValueError('Faltan globo, iris o pupila bajo el pivote')
    pupil = next(o for o in piezas if o['tipo'] == 'pupila')
    puntos = [Matrix(pupil['matriz']) @ Vector(v) for v in pupil['co']]
    # La pupila puede incluir un centro y un anillo: el centroide de sus extremos es estable.
    centro = [(min(v[i] for v in puntos) + max(v[i] for v in puntos)) / 2 for i in (0, 2)]
    iris = next(o for o in piezas if o['tipo'] == 'iris')
    ri = max(math.hypot((Matrix(iris['matriz']) @ Vector(v)).x-centro[0],
                       (Matrix(iris['matriz']) @ Vector(v)).z-centro[1]) for v in iris['co'])
    return {'location': list(p.location), 'scale': list(p.scale),
            'escala': float(p.get('rlb_escala', p.scale.y)), 'piezas': piezas,
            'centro': centro, 'radio_iris': ri}


def leer(p):
    return json.loads(zlib.decompress(base64.b64decode(p[BASE])))


def plan(p):
    base = leer(p); ed = p.rlb_ojo_ajuste
    cx, cz = base['centro']; cambios = []
    for pieza in base['piezas']:
        ob = bpy.data.objects.get(pieza['nombre'])
        if ob is None or len(ob.data.vertices) != len(pieza['co']) or ob.data.users != 1:
            raise ValueError('Cambió una pieza ocular: vuelve a capturar su estado actual')
        if pieza['tipo'] == 'globo': continue
        mat = Matrix(pieza['matriz']); inv = mat.inverted(); coords = []
        interior = min(math.hypot((mat @ Vector(co)).x-cx, (mat @ Vector(co)).z-cz)
                       for co in pieza['co']) / base['radio_iris'] if pieza['tipo'] == 'iris' else 0.
        if interior * ed.pupila >= .95:
            raise ValueError('La pupila solicitada ocupa todo el iris')
        for co in pieza['co']:
            v = mat @ Vector(co); x, y, z = v
            dx, dz = x-cx, z-cz
            f = ed.iris
            if pieza['tipo'] == 'pupila': f *= ed.pupila
            if pieza['tipo'] == 'iris':
                rr = math.hypot(dx, dz) / base['radio_iris']
                # Redistribución monótona: acompaña la pupila sin cruzar anillos.
                if rr > 1e-9 and interior < 1.:
                    nuevo = interior*ed.pupila + (rr-interior)*(1-interior*ed.pupila)/(1-interior)
                    f *= nuevo/rr
            x, z = cx+dx*f, cz+dz*f
            rad2 = v.length_squared-x*x-z*z
            if rad2 <= 0:
                raise ValueError('El tamaño solicitado excede la superficie del globo')
            if ed.iris == 1 and ed.pupila == 1:
                coords.append(co)  # restauración exacta
            else:
                coords.append(list(inv @ Vector((x, math.copysign(math.sqrt(rad2), y), z))))
        cambios.append((ob, coords))
    return base, cambios


def aplicar(p, preparado=None):
    base, cambios = preparado or plan(p)
    ed = p.rlb_ojo_ajuste
    lado = -1. if base['location'][0] < 0 else 1.  # + = hacia fuera (separa los ojos), - = hacia dentro
    p.location = Vector(base['location']) + Vector((lado*ed.lateral, -ed.profundidad, ed.altura))
    p['rlb_escala'] = base['escala'] * ed.tamano
    for i in range(3):
        if not (p.animation_data and any(f.data_path == 'scale' and f.array_index == i
                                       for f in p.animation_data.drivers)):
            p.scale[i] = base['scale'][i]*ed.tamano
    for ob, coords in cambios:
        ob.data.vertices.foreach_set('co', [c for v in coords for c in v])
        ob.data.update()
    p.update_tag()


def actualizar(campo):
    def callback(self, context):
        global _ocupado
        if _ocupado: return
        p = self.id_data
        if BASE not in p: return
        valor = getattr(self, campo); anterior = self.get('_ok_'+campo, 0. if campo in ('profundidad', 'altura', 'lateral') else 1.)
        destinos = [p]
        otros = pivotes(personaje(context))
        if context.scene.rlb_ojos_edicion.simetria and p in otros:
            destinos = otros
        previos = [(o, getattr(o.rlb_ojo_ajuste, campo)) for o in destinos if o is not None]
        _ocupado = True
        try:
            for o in destinos:
                if o is None or BASE not in o: raise ValueError('Activa primero los ajustes de ambos ojos')
                setattr(o.rlb_ojo_ajuste, campo, valor)
            planes = [(o, plan(o)) for o in destinos]
            for o, preparado in planes:
                aplicar(o, preparado); o.rlb_ojo_ajuste['_ok_'+campo] = valor
            context.scene.rlb_ojos_edicion.error = ''
        except Exception as e:
            for o, v in previos: setattr(o.rlb_ojo_ajuste, campo, anterior if o == p else v)
            context.scene.rlb_ojos_edicion.error = str(e)
        finally:
            _ocupado = False
    return callback


class RLB_OjoAjuste(bpy.types.PropertyGroup):
    profundidad: FloatProperty(name='Profundidad', description='Positivo adelanta; negativo hunde el ojo completo', unit='LENGTH', soft_min=-.02, soft_max=.02, precision=4, step=.01, update=actualizar('profundidad'))
    lateral: FloatProperty(name='Lateral', description='Mueve el globo completo de lado a lado: positivo hacia fuera (separa los ojos), negativo hacia dentro', unit='LENGTH', soft_min=-.02, soft_max=.02, precision=4, step=.01, update=actualizar('lateral'))
    altura: FloatProperty(name='Altura', description='Positivo sube; negativo baja el ojo completo, incluidos iris, pupila, córnea y brillos', unit='LENGTH', soft_min=-.02, soft_max=.02, precision=4, step=.01, update=actualizar('altura'))
    tamano: FloatProperty(name='Tamaño del ojo completo', description='Incluye globo, iris, pupila, córnea y brillos', default=1, min=.25, max=2, subtype='FACTOR', update=actualizar('tamano'))
    iris: FloatProperty(name='Tamaño del iris', description='Tamaño relativo al diseño capturado; conserva su color y la curvatura', default=1, min=.5, max=1.5, subtype='FACTOR', update=actualizar('iris'))
    pupila: FloatProperty(name='Tamaño de la pupila', default=1, min=.5, max=1.5, subtype='FACTOR', update=actualizar('pupila'))


class RLB_OjosEdicion(bpy.types.PropertyGroup):
    lado: EnumProperty(name='Ojo', items=[('L', 'Izquierdo', ''), ('R', 'Derecho', '')])
    simetria: BoolProperty(name='Ambos ojos', default=True)
    error: StringProperty()


class RLB_OT_editar_ojos(bpy.types.Operator):
    bl_idname = 'rlb.editar_ojos'
    bl_label = 'Activar ajustes de ojos'
    bl_description = 'Captura el diseño actual sin modificarlo; los controles son relativos a este estado'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        global _ocupado
        ps = pivotes(personaje(context))
        try:
            if len(ps) != 2 or any(p is None for p in ps): raise ValueError('Faltan los dos pivotes oculares')
            # Conservar la referencia original al volver a abrir el panel.
            capturas = [(p, capturar(p)) for p in ps if BASE not in p]
            _ocupado = True
            for p, base in capturas:
                p[BASE] = base64.b64encode(zlib.compress(json.dumps(base).encode())).decode()
                ed = p.rlb_ojo_ajuste
                for k, v in [('profundidad', 0.), ('lateral', 0.), ('altura', 0.), ('tamano', 1.), ('iris', 1.), ('pupila', 1.)]:
                    setattr(ed, k, v); ed['_ok_'+k] = v
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        finally: _ocupado = False
        context.scene.rlb_ojos_edicion.error = ''
        return {'FINISHED'}


class RLB_OT_restaurar_ojos(bpy.types.Operator):
    bl_idname = 'rlb.restaurar_ojos_edicion'
    bl_label = 'Restaurar ajustes de ojos'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        global _ocupado
        ps = pivotes(personaje(context)); ui = context.scene.rlb_ojos_edicion
        if not ui.simetria: ps = ps[:1] if ui.lado == 'L' else ps[1:]
        _ocupado = True
        try:
            if not ps or any(p is None or BASE not in p for p in ps): raise ValueError('Activa primero los ajustes')
            for p in ps:
                ed = p.rlb_ojo_ajuste
                for k, v in [('profundidad', 0.), ('lateral', 0.), ('altura', 0.), ('tamano', 1.), ('iris', 1.), ('pupila', 1.)]:
                    setattr(ed, k, v); ed['_ok_'+k] = v
                aplicar(p)
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        finally: _ocupado = False
        ui.error = ''
        return {'FINISHED'}


def dibujar(lay, context, cara=None):
    cara = cara or personaje(context); ps = pivotes(cara)
    if cara: lay.label(text=cara.name, icon='HIDE_OFF')
    if len(ps) != 2 or any(p is None for p in ps):
        lay.label(text='Elige un personaje con ojos', icon='INFO'); return
    if any(BASE not in p for p in ps):
        lay.operator('rlb.editar_ojos', icon='PREFERENCES'); return
    ui = context.scene.rlb_ojos_edicion
    lay.prop(ui, 'simetria'); lay.prop(ui, 'lado', expand=True)
    p = ps[0 if ui.lado == 'L' else 1]; ed = p.rlb_ojo_ajuste
    for campo in ('profundidad', 'lateral', 'altura', 'tamano', 'iris', 'pupila'): lay.prop(ed, campo, slider=True)
    lay.operator('rlb.restaurar_ojos_edicion', icon='LOOP_BACK')
    if ui.error: lay.label(text=ui.error, icon='ERROR')


CLASES = (RLB_OjoAjuste, RLB_OjosEdicion, RLB_OT_editar_ojos, RLB_OT_restaurar_ojos)


def register():
    for cls in CLASES: bpy.utils.register_class(cls)
    bpy.types.Object.rlb_ojo_ajuste = PointerProperty(type=RLB_OjoAjuste)
    bpy.types.Scene.rlb_ojos_edicion = PointerProperty(type=RLB_OjosEdicion)


def unregister():
    del bpy.types.Scene.rlb_ojos_edicion
    del bpy.types.Object.rlb_ojo_ajuste
    for cls in reversed(CLASES): bpy.utils.unregister_class(cls)
