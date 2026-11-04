"""Panel «2. Pesos y cara»: calcular, probar poses y retocar a mano con herramientas sencillas.

Pensado para pulir despues de la parte automatica lo que solo se ve a ojo: se elige una pose
de prueba (brazos arriba, codos, torso girado...), se elige la zona por su nombre (Hombro
izq., Muslo der...) y se pinta con cuatro pinceles (Pintar, Anadir, Quitar, Suavizar) viendo
la deformacion en esa pose. Siempre se puede volver a los pesos automaticos de una zona o de
todo. Si Easy Weight esta instalado se ofrecen sus herramientas (islas sueltas, simetrizar,
limpiar); si no, se usan las de Blender.
"""
import os
import re
import textwrap
import traceback

import bpy
import numpy as np
from bpy.props import EnumProperty, FloatProperty, StringProperty

from . import cara, pesos, prueba

NOMBRES = {
    'spine': 'Cadera', 'spine.001': 'Cintura', 'spine.002': 'Abdomen', 'spine.003': 'Pecho',
    'spine.004': 'Cuello bajo', 'spine.005': 'Cuello alto', 'spine.006': 'Cabeza',
    'pelvis': 'Pelvis', 'shoulder': 'Hombro (clavicula)', 'upper_arm': 'Brazo', 'upper_arm.001': 'Brazo (hacia el codo)',
    'forearm': 'Antebrazo', 'forearm.001': 'Antebrazo (hacia la muneca)', 'hand': 'Mano',
    'thigh': 'Muslo', 'thigh.001': 'Muslo (hacia la rodilla)', 'shin': 'Pierna', 'shin.001': 'Pierna (hacia el tobillo)',
    'foot': 'Pie', 'toe': 'Dedos del pie',
    'thumb': 'Pulgar', 'f_index': 'Indice', 'f_middle': 'Medio', 'f_ring': 'Anular', 'f_pinky': 'Menique',
    'palm': 'Palma',
}
POSES_UI = [('reposo', 'Reposo', ''), ('brazos_arriba', 'Brazos arriba', ''), ('brazos_frente', 'Brazos al frente', ''),
            ('codos', 'Codos doblados', ''), ('hombros_arriba', 'Hombros arriba', ''), ('torso_girado', 'Torso girado', ''),
            ('torso_inclinado', 'Torso inclinado', ''), ('cabeza', 'Cabeza girada', ''), ('munecas', 'Munecas', ''),
            ('punos', 'Punos cerrados', ''), ('piernas', 'Piernas dobladas', '')]
PINCEL_ESENCIAL = 'brushes/essentials_brushes-mesh_weight.blend/Brush/'


def nombre_bonito(hueso):
    """DEF-upper_arm.L.001 -> 'Brazo (hacia el codo) izq.'"""
    n = hueso[4:] if hueso.startswith('DEF-') else hueso
    lado = ''
    for suf, txt in (('.L', ' izq.'), ('.R', ' der.')):
        if suf + '.' in n or n.endswith(suf):
            lado = txt
            n = n.replace(suf, '')
    base, _, num = n.partition('.')
    if n in NOMBRES:
        return NOMBRES[n] + lado
    if base in NOMBRES and num.isdigit():
        if base in ('thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky', 'palm'):
            return f'{NOMBRES[base]} {int(num)}{lado}'
        return NOMBRES.get(f'{base}.{num}', NOMBRES[base]) + lado
    return hueso


def _rig(context):
    p = context.scene.ecorp_rig
    r = bpy.data.objects.get(f'{p.personaje}_Rig') if p.personaje else None
    return r


def _items_huesos(self, context):
    r = _rig(context)
    if r is None:
        return [('', '(sin rig)', '')]
    defs = pesos.huesos_deformacion(r)
    # columna y cabeza primero, luego izq., der.
    orden = sorted(defs, key=lambda n: (n.endswith(('.R', '.R.001')) * 2 + ('.L' in n), n))
    return [(n, nombre_bonito(n), n) for n in orden]


def _cambiar_pose(self, context):
    r = _rig(context)
    if r is not None:
        prueba.poner(r, self.pose_prueba)


_sincronizando = False


def ver_pesos(context, hueso):
    """Muestra los pesos de un hueso (rojo 100 %, azul 0 %) como Easy Weight: modo pintar pesos
    con el rig seleccionado, el grupo activo y el hueso resaltado. Asi Ctrl+clic en otro hueso
    del visor cambia el grupo que se ve (comportamiento nativo de Blender)."""
    m, r = _malla(context), _rig(context)
    if m is None or r is None:
        return False
    if context.mode != 'PAINT_WEIGHT' or context.view_layer.objects.active != m:
        if context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        for o in context.selected_objects:
            o.select_set(False)
        r.hide_set(False)
        r.select_set(True)
        m.hide_set(False)
        m.select_set(True)
        context.view_layer.objects.active = m
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    g = m.vertex_groups.get(hueso)
    if g is not None:
        m.vertex_groups.active_index = g.index
    # como «Focus Deforming Bones» de Easy Weight: mostrar los huesos de deformacion (Rigify
    # los oculta) para que Ctrl+clic caiga en un hueso con grupo de pesos
    col = r.data.collections_all.get('DEF')
    if col is not None:
        col.is_visible = True
    r.show_in_front = True
    b = r.data.bones.get(hueso)
    if b is not None:
        r.data.bones.active = b
    try:
        context.space_data.overlay.show_wpaint_contours = True
        context.space_data.overlay.weight_paint_mode_opacity = 1.0
    except Exception:
        pass
    return True


def _cambiar_hueso(self, context):
    global _sincronizando
    if _sincronizando or not self.ver_al_elegir:
        return
    ver_pesos(context, self.hueso)


# --- ver los pesos al hacer clic en una zona (marcador o hueso), sin cambiar de modo ---------------
# Se pinta el mapa de calor de los pesos (azul 0 %, rojo 100 %) en un atributo de color de la malla y
# se pone el visor en Solido/Color de atributo, asi se ve aunque la zona se elija en modo Objeto o Pose.
ATRIBUTO_PESOS = 'ECB_pesos'
BASE_MARCADOR = {'clavicula': 'shoulder', 'hombro': 'upper_arm', 'codo': 'forearm', 'muneca': 'hand',
                 'cadera': 'thigh', 'rodilla': 'shin', 'tobillo': 'foot', 'bola_pie': 'toe'}
COLUMNA_MARCADOR = {'pelvis': 'spine', 'columna': 'spine.001', 'pecho': 'spine.002', 'pecho_alto': 'spine.003',
                    'cuello': 'spine.004', 'cuello_medio': 'spine.005', 'cabeza': 'spine.006',
                    'coronilla': 'spine.006'}
DEDO_MARCADOR = {'indice': 'f_index', 'medio': 'f_middle', 'anular': 'f_ring', 'menique': 'f_pinky',
                 'pulgar': 'thumb'}
_vista = {'clave': None, 'shading': {}}


def _hueso_de_marcador(clave):
    """'hombro.L' -> 'upper_arm.L': el hueso que arranca en ese marcador (None si no hay)."""
    base, _, lado = clave.partition('.')
    sufijo = '.' + lado if lado in ('L', 'R') else ''
    if base in COLUMNA_MARCADOR and not sufijo:
        return COLUMNA_MARCADOR[base]
    if base in BASE_MARCADOR and sufijo:
        return BASE_MARCADOR[base] + sufijo
    m = re.fullmatch(r'(indice|medio|anular|menique|pulgar)_(\d)', base)
    if m and sufijo:
        return f'{DEDO_MARCADOR[m.group(1)]}.0{min(int(m.group(2)) + 1, 3)}{sufijo}'
    return None


def _hueso_de_rig(nombre):
    """Controles de Rigify (upper_arm_fk.L, thigh_tweak.L.001, ORG-..., MCH-...) -> hueso de deformacion."""
    n = re.sub(r'^(DEF|ORG|MCH|VIS)-', '', nombre)
    return re.sub(r'_(fk|ik|tweak|parent|master|target|pole|ik_pole|ik_target)(?=\.|$)', '', n)


def _grupos_de(ob, personaje, malla):
    """Grupos de pesos de la malla que corresponden al objeto/hueso activo (lista vacia si ninguno)."""
    hueso = None
    pre = f'ECB_{personaje}_'
    if ob.type == 'EMPTY' and ob.name.startswith(pre):
        hueso = _hueso_de_marcador(ob.name[len(pre):])
    elif ob.type == 'ARMATURE':
        if ob.mode == 'EDIT':
            b = ob.data.edit_bones.active
        else:
            b = ob.data.bones.active
        if b is not None:
            hueso = _hueso_de_rig(b.name)
    if not hueso:
        return []
    grupos = []
    for g in (hueso, hueso + '.001'):
        for cand in ('DEF-' + g, g):
            if cand in malla.vertex_groups:
                grupos.append(cand)
                break
    return grupos


def _pesos_de(malla, grupos):
    idx = {malla.vertex_groups[g].index for g in grupos}
    w = np.zeros(len(malla.data.vertices), np.float32)
    for v in malla.data.vertices:
        for g in v.groups:
            if g.group in idx:
                w[v.index] += g.weight
    return np.clip(w, 0, 1)


def _calor(w):
    """Mismo degradado que Blender: azul 0, cian .25, verde .5, amarillo .75, rojo 1."""
    x = w * 4
    rgba = np.ones((len(w), 4), np.float32)
    rgba[:, 0] = np.clip(x - 2, 0, 1)
    rgba[:, 1] = np.clip(x, 0, 1) - np.clip(x - 3, 0, 1)
    rgba[:, 2] = 1 - np.clip(x - 1, 0, 1)
    return rgba


def _visores(context):
    for i, a in enumerate(context.screen.areas):
        if a.type == 'VIEW_3D':
            yield i, a.spaces.active


def _poner_visor(context):
    for i, sp in _visores(context):
        sh = sp.shading
        clave = (context.screen.name, i)
        if clave not in _vista['shading']:
            _vista['shading'][clave] = (sh.type, sh.color_type, sh.light)
        sh.type = 'SOLID'
        sh.color_type = 'VERTEX'
        sh.light = 'FLAT'


def _restaurar_visor(context):
    for i, sp in _visores(context):
        prev = _vista['shading'].get((context.screen.name, i))
        if prev is not None:
            sp.shading.type, sp.shading.color_type, sp.shading.light = prev
    _vista['shading'].clear()


def mostrar_pesos(context, malla, grupos):
    ca = malla.data.color_attributes
    attr = ca.get(ATRIBUTO_PESOS)
    if attr is not None and (attr.domain != 'POINT' or attr.data_type != 'FLOAT_COLOR'):
        ca.remove(attr)
        attr = None
    if attr is None:
        if ca.active_color is not None and 'ecb_color_prev' not in malla.data:
            malla.data['ecb_color_prev'] = ca.active_color.name
        attr = ca.new(ATRIBUTO_PESOS, 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', _calor(_pesos_de(malla, grupos)).ravel())
    ca.active_color = attr
    malla.data.update()
    _poner_visor(context)


def quitar_vista_pesos(context):
    """Devuelve el visor y la malla a como estaban antes de mostrar los pesos."""
    m = context.scene.ecorp_rig.malla
    _vista['clave'] = None
    if context.screen is not None:
        _restaurar_visor(context)
    if m is None:
        return
    ca = m.data.color_attributes
    attr = ca.get(ATRIBUTO_PESOS)
    prev = m.data.get('ecb_color_prev')
    if prev is not None and prev in ca:
        ca.active_color = ca[prev]
    if attr is not None:
        ca.remove(attr)
    if 'ecb_color_prev' in m.data:
        del m.data['ecb_color_prev']


def _ver_al_clic(scene, ctx, q, p):
    """Al elegir un marcador o un hueso (clic normal) se ven los pesos de su zona."""
    global _sincronizando
    ob = ctx.view_layer.objects.active
    if ob is None or ctx.mode not in ('OBJECT', 'POSE', 'EDIT_ARMATURE') or ob == p.malla:
        return
    b = None
    if ob.type == 'ARMATURE':
        b = ob.data.edit_bones.active if ob.mode == 'EDIT' else ob.data.bones.active
    clave = (ob.name, b.name if b else None)
    if clave == _vista['clave']:
        return
    _vista['clave'] = clave
    grupos = _grupos_de(ob, p.personaje, p.malla)
    if not grupos:
        return
    mostrar_pesos(ctx, p.malla, grupos)
    d = grupos[0] if grupos[0].startswith('DEF-') else 'DEF-' + grupos[0]
    _sincronizando = True
    try:
        q.hueso = d
    except Exception:
        pass
    finally:
        _sincronizando = False


def _seguir_grupo_activo(scene, depsgraph):
    """Clic normal en un marcador/hueso = ver sus pesos; Ctrl+clic en pintar pesos = el menu sigue esa zona."""
    global _sincronizando
    ctx = bpy.context
    q = getattr(scene, 'ecorp_pesos', None)
    p = getattr(scene, 'ecorp_rig', None)
    if q is None or p is None or p.malla is None:
        return
    if ctx.mode != 'PAINT_WEIGHT':
        if q.ver_al_clic:
            try:
                _ver_al_clic(scene, ctx, q, p)
            except Exception:
                traceback.print_exc()
        return
    _vista['clave'] = None      # al volver a Objeto/Pose se recalcula el mapa de calor
    g = p.malla.vertex_groups.active
    if g is None or not g.name.startswith('DEF-') or g.name == q.hueso:
        return
    if g.name.startswith(('DEF-labio', 'DEF-parp')):
        return
    _sincronizando = True
    try:
        q.hueso = g.name
    except Exception:
        pass
    finally:
        _sincronizando = False


def _cambiar_ver_al_clic(self, context):
    if not self.ver_al_clic:
        quitar_vista_pesos(context)


class ECORP_PesosProps(bpy.types.PropertyGroup):
    pose_prueba: EnumProperty(name='Pose de prueba', items=POSES_UI, update=_cambiar_pose)
    hueso: EnumProperty(name='Zona', items=_items_huesos, update=_cambiar_hueso)
    ver_al_elegir: bpy.props.BoolProperty(name='Ver pesos al elegir', default=True,
                                          description='Al elegir una zona se ven sus pesos sobre el personaje')
    ver_al_clic: bpy.props.BoolProperty(
        name='Ver pesos al hacer clic', default=True, update=_cambiar_ver_al_clic,
        description='Al hacer clic en un marcador o un hueso del visor se ven los pesos de esa zona '
                    '(azul 0 %, rojo 100 %); el visor pasa a Solido y se restaura al desactivar')
    peso: FloatProperty(name='Peso', default=1.0, min=0, max=1)
    fuerza: FloatProperty(name='Fuerza', default=0.3, min=0.01, max=1)


def _q(context):
    return context.scene.ecorp_pesos


def _malla(context):
    return context.scene.ecorp_rig.malla


class ECORP_OT_pesos_calcular(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_calcular'
    bl_label = 'Calcular pesos automaticos'
    bl_description = 'Pesos del cuerpo (la cara queda igual) y la cara enganchada a la cabeza'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        m, r = _malla(context), _rig(context)
        if m is None or r is None:
            self.report({'ERROR'}, 'Primero confirma el esqueleto (panel 1)')
            return {'CANCELLED'}
        try:
            from . import medir
            res = pesos.calcular(m, r, marcadores=medir.leer_marcadores(context.scene.ecorp_rig.personaje))
            enl = cara.enlazar(m, r) if not any('padre_anterior' in o for o in cara.candidatos(m, r)) else []
        except Exception as e:
            traceback.print_exc()
            self.report({'ERROR'}, f'Fallo: {e}')
            return {'CANCELLED'}
        context.scene.ecorp_rig.informe = f"Pesos: {res['vertices']} vertices, {res['sin_peso']} sin peso. Cara enganchada: {len(enl)} objetos."
        self.report({'INFO'}, context.scene.ecorp_rig.informe)
        return {'FINISHED'}


class ECORP_OT_pesos_cara(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_cara'
    bl_label = 'Enganchar cara a la cabeza'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        m, r = _malla(context), _rig(context)
        hechos = cara.enlazar(m, r)
        self.report({'INFO'}, 'Enganchados: ' + ', '.join(hechos))
        return {'FINISHED'}


class ECORP_OT_pesos_pintar(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_pintar'
    bl_label = 'Pintar esta zona'
    bl_description = 'Entra a pintar pesos de la zona elegida (con Ctrl+clic puedes elegir otro hueso)'

    def execute(self, context):
        m, r = _malla(context), _rig(context)
        q = _q(context)
        if m is None or r is None or not q.hueso:
            return {'CANCELLED'}
        if context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        for o in context.selected_objects:
            o.select_set(False)
        r.hide_set(False)
        r.select_set(True)
        m.hide_set(False)
        m.select_set(True)
        context.view_layer.objects.active = m
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        g = m.vertex_groups.get(q.hueso)
        if g is not None:
            m.vertex_groups.active_index = g.index
        _pincel(context, 'MIX', q)
        return {'FINISHED'}


def _pincel(context, modo, q):
    """Pinceles: MIX (pintar el valor), ADD, SUB y BLUR (suavizar)."""
    nombre = 'Blur' if modo == 'BLUR' else 'Paint'
    try:
        bpy.ops.brush.asset_activate(asset_library_type='ESSENTIALS',
                                     relative_asset_identifier=PINCEL_ESENCIAL + nombre)
    except Exception:
        pass
    ts = context.tool_settings
    b = ts.weight_paint.brush if ts.weight_paint else None
    if b is not None:
        if modo != 'BLUR':
            try:
                b.blend = modo
            except Exception:
                pass
        b.strength = q.fuerza
    try:
        ts.unified_paint_settings.weight = q.peso
    except Exception:
        pass


class ECORP_OT_pesos_pincel(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_pincel'
    bl_label = 'Pincel'
    modo: StringProperty(default='MIX')

    def execute(self, context):
        if context.mode != 'PAINT_WEIGHT':
            bpy.ops.ecorp.pesos_pintar()
        _pincel(context, self.modo, _q(context))
        return {'FINISHED'}


class ECORP_OT_pesos_suavizar(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_suavizar'
    bl_label = 'Suavizar la zona entera'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        m = _malla(context)
        modo = context.mode
        context.view_layer.objects.active = m
        if modo != 'PAINT_WEIGHT':
            bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        bpy.ops.object.vertex_group_smooth(group_select_mode='ACTIVE', factor=0.5, repeat=3)
        bpy.ops.object.vertex_group_normalize_all(lock_active=True)
        return {'FINISHED'}


class ECORP_OT_pesos_auto(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_auto'
    bl_label = 'Volver a lo automatico'
    bl_description = 'Deshace los retoques: solo en la zona elegida o en todo el cuerpo'
    bl_options = {'REGISTER', 'UNDO'}
    alcance: StringProperty(default='ZONA')

    def execute(self, context):
        import numpy as np
        m = _malla(context)
        if 'ecb_pesos_auto' not in m:
            self.report({'ERROR'}, 'No hay pesos automaticos guardados')
            return {'CANCELLED'}
        defs, W = pesos.leer_auto(m)
        modo = context.mode
        if modo != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        if self.alcance == 'TODO':
            sel = None
        else:
            j = defs.index(_q(context).hueso) if _q(context).hueso in defs else None
            if j is None:
                return {'CANCELLED'}
            actual = pesos._matriz(m, [defs[j]])[:, 0]
            sel = (W[:, j] > 1e-4) | (actual > 1e-4)
        pesos.escribir(m, defs, W, solo=sel)
        if modo == 'PAINT_WEIGHT':
            bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        return {'FINISHED'}


def _easy_weight():
    return any(k.endswith('easyweight') for k in bpy.context.preferences.addons.keys())


class ECORP_OT_pesos_easy(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_easy'
    bl_label = 'Easy Weight'
    bl_options = {'REGISTER', 'UNDO'}
    accion: StringProperty()

    def execute(self, context):
        m = _malla(context)
        context.view_layer.objects.active = m
        m.select_set(True)
        try:
            if self.accion == 'islas':
                if context.mode != 'PAINT_WEIGHT':
                    bpy.ops.ecorp.pesos_pintar()
                bpy.ops.object.calculate_weight_islands('INVOKE_DEFAULT')
            elif self.accion == 'isla_pequena':
                bpy.ops.object.focus_smallest_weight_island()
            elif self.accion == 'simetrizar_L':
                bpy.ops.object.symmetrize_vertex_weights('EXEC_DEFAULT', groups='ALL', direction='LEFT_TO_RIGHT')
            elif self.accion == 'simetrizar_R':
                bpy.ops.object.symmetrize_vertex_weights('EXEC_DEFAULT', groups='ALL', direction='RIGHT_TO_LEFT')
        except Exception as e:
            self.report({'ERROR'}, f'Easy Weight: {e}')
            return {'CANCELLED'}
        return {'FINISHED'}


class ECORP_OT_pesos_herr(bpy.types.Operator):
    """Herramientas de limpieza inspiradas en Easy Weight, limitadas a los grupos del cuerpo
    (DEF-* del rig corporal) para no tocar nunca los pesos del rig facial."""
    bl_idname = 'ecorp.pesos_herr'
    bl_label = 'Herramienta de pesos'
    bl_options = {'REGISTER', 'UNDO'}
    accion: StringProperty()
    minimo: FloatProperty(default=0.01)

    def execute(self, context):
        import numpy as np
        m, r = _malla(context), _rig(context)
        modo = context.mode
        if modo != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        defs = pesos.huesos_deformacion(r)
        W = pesos._matriz(m, defs)
        antes = int((W > 1e-4).sum())
        if self.accion == 'limpiar':
            W[W < self.minimo] = 0
        elif self.accion == 'limitar':
            if W.shape[1] > 4:
                corte = np.partition(W, -4, axis=1)[:, -4][:, None]
                W[W < corte] = 0
        s_ = W.sum(1, keepdims=True)
        if self.accion in ('limpiar', 'limitar', 'normalizar'):
            W = np.where(s_ > 1e-6, W / np.maximum(s_, 1e-6), 0)
        cab = W.sum(1) < 1e-4
        pesos.escribir(m, defs, W)
        self.report({'INFO'}, f'Influencias: {antes} -> {int((W > 1e-4).sum())}; vertices sin peso: {int(cab.sum())}')
        if modo == 'PAINT_WEIGHT':
            bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        return {'FINISHED'}


class ECORP_OT_pesos_sin_peso(bpy.types.Operator):
    """Selecciona los vertices del cuerpo sin ningun peso (se quedarian quietos al animar)."""
    bl_idname = 'ecorp.pesos_sin_peso'
    bl_label = 'Buscar vertices sin peso'

    def execute(self, context):
        m, r = _malla(context), _rig(context)
        if context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        W = pesos._matriz(m, pesos.huesos_deformacion(r))
        sin = W.sum(1) < 1e-4
        m.data.vertices.foreach_set('select', sin.tolist())
        context.view_layer.objects.active = m
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        m.data.use_paint_mask_vertex = True
        self.report({'INFO'}, f'{int(sin.sum())} vertices sin peso (seleccionados)')
        return {'FINISHED'}


class ECORP_OT_pesos_salir(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_salir'
    bl_label = 'Terminar de pintar'

    def execute(self, context):
        if context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        r = _rig(context)
        col = r.data.collections_all.get('DEF') if r else None
        if col is not None:
            col.is_visible = False      # Rigify los lleva ocultos
        return {'FINISHED'}


class ECORP_OT_pesos_foto(bpy.types.Operator):
    bl_idname = 'ecorp.pesos_foto'
    bl_label = 'Hoja de poses de prueba'

    def execute(self, context):
        carpeta = bpy.path.abspath('//ECB_revision') if bpy.data.filepath else bpy.app.tempdir
        os.makedirs(carpeta, exist_ok=True)
        ruta = prueba.hoja(_rig(context), _malla(context), os.path.join(carpeta, 'poses_prueba.png'))
        context.scene.ecorp_rig.informe = 'Hoja en ' + ruta
        return {'FINISHED'}


def _parrafo(lay, context, texto, icon='NONE', alert=False):
    """texto largo en varias líneas según el ancho del panel (la etiqueta nunca se corta con «…»)."""
    ancho = max(24, int(context.region.width / 10.5) - 2) if context.region else 44
    col = lay.column(align=True)
    col.alert = alert
    for i, l in enumerate(textwrap.wrap(str(texto), ancho) or ['']):
        col.label(text=l, icon=icon if i == 0 else 'BLANK1')


class ECORP_PT_pesos(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Cuerpo'
    bl_label = '2. Pesos y cara'
    bl_order = 2

    def draw_header(self, context):
        try:
            m = context.scene.ecorp_rig.malla
            hecho = m is not None and 'ecb_pesos_auto' in m
            self.layout.label(text='', icon='CHECKMARK' if hecho else 'RADIOBUT_OFF')
        except Exception:
            pass

    def draw(self, context):
        lay = self.layout
        r = _rig(context)
        if r is None:
            _parrafo(lay, context, 'Confirma antes el esqueleto (panel 1)', 'INFO')
            return
        q = _q(context)
        # arriba lo esencial: calcular (botón principal) y enganchar la cara
        c = lay.column(); c.scale_y = 2.0
        c.operator('ecorp.pesos_calcular', icon='MOD_VERTEX_WEIGHT')
        c = lay.column(); c.scale_y = 1.4
        c.operator('ecorp.pesos_cara', icon='LINKED')
        # probar la deformación (abierta por defecto)
        cab, cuerpo = lay.panel('ECORP_pes_probar', default_closed=False)
        cab.label(text='Probar la deformación')
        if cuerpo:
            cuerpo.prop(q, 'pose_prueba', text='')
            cuerpo.operator('ecorp.pesos_foto', icon='RENDER_STILL')
        # retocar a mano
        cab, cuerpo = lay.panel('ECORP_pes_retocar', default_closed=True)
        cab.label(text='Retocar a mano (pintar pesos)')
        if cuerpo:
            cuerpo.prop(q, 'hueso')
            cuerpo.prop(q, 'ver_al_elegir')
            cuerpo.prop(q, 'ver_al_clic')
            _parrafo(cuerpo, context, 'Clic en marcador/hueso = ver pesos', 'INFO')
            _parrafo(cuerpo, context, '(en pintar pesos: Ctrl+clic en el hueso)', 'INFO')
            c = cuerpo.column(align=True); c.scale_y = 1.4
            c.operator('ecorp.pesos_pintar', icon='BRUSH_DATA')
            c.operator('ecorp.pesos_salir', icon='OBJECT_DATAMODE')
            fila = cuerpo.row(align=True)
            fila.operator('ecorp.pesos_pincel', text='Pintar').modo = 'MIX'
            fila.operator('ecorp.pesos_pincel', text='Añadir').modo = 'ADD'
            fila.operator('ecorp.pesos_pincel', text='Quitar').modo = 'SUB'
            fila.operator('ecorp.pesos_pincel', text='Suavizar').modo = 'BLUR'
            cuerpo.prop(q, 'peso', slider=True)
            cuerpo.prop(q, 'fuerza', slider=True)
            c = cuerpo.column(); c.scale_y = 1.4
            c.operator('ecorp.pesos_suavizar', icon='MOD_SMOOTH')
            fila = cuerpo.row(align=True); fila.scale_y = 1.4
            fila.operator('ecorp.pesos_auto', text='Auto: esta zona', icon='LOOP_BACK').alcance = 'ZONA'
            fila.operator('ecorp.pesos_auto', text='Auto: todo').alcance = 'TODO'
        # vista y pincel (solo al pintar pesos)
        if context.mode == 'PAINT_WEIGHT' and context.object and context.object.type == 'MESH':
            cab, cuerpo = lay.panel('ECORP_pes_vista', default_closed=True)
            cab.label(text='Vista y pincel')
            if cuerpo:
                ts = context.tool_settings
                fila = cuerpo.row(align=True)
                fila.prop(ts, 'vertex_group_user', text='Ceros')
                fila = cuerpo.row(align=True)
                fila.prop(context.object.data, 'use_mirror_x', text='Espejo X', toggle=True)
                fila.prop(context.object.data, 'use_mirror_vertex_groups', text='Grupos en espejo', toggle=True)
                b = ts.weight_paint.brush if ts.weight_paint else None
                if b is not None:
                    fila = cuerpo.row(align=True)
                    fila.prop(b, 'use_frontface', text='Solo lo visible', toggle=True)
                    fila.prop(context.object.data, 'use_paint_mask_vertex', text='Solo selección', toggle=True)
        # limpieza
        cab, cuerpo = lay.panel('ECORP_pes_limpieza', default_closed=True)
        cab.label(text='Limpieza de pesos')
        if cuerpo:
            _parrafo(cuerpo, context, 'Solo el cuerpo: la cara no se toca.', 'INFO')
            c = cuerpo.column(align=True)
            c.operator('ecorp.pesos_herr', text='Normalizar').accion = 'normalizar'
            c.operator('ecorp.pesos_herr', text='Máx. 4 huesos').accion = 'limitar'
            c.operator('ecorp.pesos_herr', text='Quitar <1 %').accion = 'limpiar'
            cuerpo.operator('ecorp.pesos_sin_peso', text='Buscar vértices sin peso', icon='VIEWZOOM')
        # Easy Weight (solo si está instalado)
        if _easy_weight():
            cab, cuerpo = lay.panel('ECORP_pes_easy', default_closed=True)
            cab.label(text='Easy Weight')
            if cuerpo:
                c = cuerpo.column(align=True)
                c.operator('ecorp.pesos_easy', text='Buscar islas sueltas').accion = 'islas'
                c.operator('ecorp.pesos_easy', text='Ir a la más pequeña').accion = 'isla_pequena'
                _parrafo(cuerpo, context, 'Simetrizar pesos:')
                fila = cuerpo.row(align=True)
                fila.operator('ecorp.pesos_easy', text='Izq. → der.').accion = 'simetrizar_L'
                fila.operator('ecorp.pesos_easy', text='Der. → izq.').accion = 'simetrizar_R'
                # sin «limpiar grupos vacios»: borraria grupos vacios que el rig facial puede necesitar
        else:
            caja = lay.box()
            caja.label(text='Easy Weight (no instalado)')


CLASES = (ECORP_PesosProps, ECORP_OT_pesos_calcular, ECORP_OT_pesos_cara, ECORP_OT_pesos_pintar,
          ECORP_OT_pesos_pincel, ECORP_OT_pesos_suavizar, ECORP_OT_pesos_auto, ECORP_OT_pesos_easy,
          ECORP_OT_pesos_herr, ECORP_OT_pesos_sin_peso, ECORP_OT_pesos_salir, ECORP_OT_pesos_foto, ECORP_PT_pesos)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Scene.ecorp_pesos = bpy.props.PointerProperty(type=ECORP_PesosProps)
    if _seguir_grupo_activo not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(_seguir_grupo_activo)


def unregister():
    if _seguir_grupo_activo in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_seguir_grupo_activo)
    try:
        quitar_vista_pesos(bpy.context)
    except Exception:
        pass
    del bpy.types.Scene.ecorp_pesos
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
