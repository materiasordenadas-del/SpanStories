"""Ajustes compartidos entre expresiones; conserva los datos del personaje."""
import json
import bpy
from . import editor as E


class RLB_PT_ajustes_generales(bpy.types.Panel):
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'object'
    bl_label = 'Rig labial · ajustes generales'
    bl_order = -100

    def draw(self, context):
        from .. import asistente as AS
        lay = self.layout
        cara = E._cara(context)
        if cara is None:
            AS._parrafo(lay, context, 'Selecciona la cara del personaje.', 'INFO')
            return
        ed = context.scene.rlb_editor
        lay.label(text=cara.name, icon='USER')
        lay.prop(ed, 'enlazar', text='Simetría', toggle=True, icon='MOD_MIRROR')
        lay.prop(ed, 'rapido')
        visual = lay.box()
        visual.label(text='Visualización')
        visual.prop(ed, 'ver_puntos', text='Mostrar puntos')
        visual.prop(ed, 'ver_pesos', text='Mostrar pesos')
        visual.label(text='Pesos: azul bajo · rojo alto')
        ref = ed.referencia
        if ref is None:
            refs = [o for o in context.scene.objects if o.type == 'EMPTY' and o.empty_display_type == 'IMAGE']
            ref = refs[0] if len(refs) == 1 else None
        b = lay.box()
        b.label(text='Referencia', icon='IMAGE_REFERENCE')
        if ref is not None:
            b.label(text=ref.name)
            b.operator('rlb.labios_manual', text='Mostrar referencia', icon='IMAGE_REFERENCE').accion = 'REFERENCIA'
            b.prop(ref, 'use_empty_image_alpha', text='Transparencia de referencia')
            b.prop(ref, 'color', index=3, text='Opacidad', slider=True)
        else:
            b.prop(ed, 'referencia')


class RLB_PT_ajustes_labios(bpy.types.Panel):
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'object'
    bl_parent_id = 'RLB_PT_ajustes_generales'
    bl_label = 'Labios · forma y pesos'
    bl_order = 1

    def draw(self, context):
        from . import grosor_labios, labios_manual_ui
        cara = E._cara(context)
        if cara is None:
            return
        lay = self.layout
        grosor_labios.dibujar(lay, cara)
        ajustes = lay.column()
        ajustes.enabled = context.scene.rlb_editor.activo
        if not context.scene.rlb_editor.activo:
            lay.label(text='Edita una expresión para ajustar los pesos.', icon='INFO')
        labios_manual_ui.dibujar(ajustes, context)
        if not cara.get('rlb_manual_activo', False):
            if not cara.get('aj_mascaras_labios_version'):
                ajustes.operator('rlb.exp_influencias_labios', icon='MOD_VERTEX_WEIGHT')
            if cara.get('aj_respaldo_mascaras_labios'):
                ajustes.operator('rlb.exp_influencias_restaurar', icon='LOOP_BACK')


class RLB_PT_ajustes_parpados(bpy.types.Panel):
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'object'
    bl_parent_id = 'RLB_PT_ajustes_generales'
    bl_label = 'Párpados · pesos y cierre'
    bl_order = 2

    def draw(self, context):
        from . import pesos_parpados_ui
        cara = E._cara(context)
        if cara is None:
            return
        lay = self.layout
        ed = context.scene.rlb_editor
        if not ed.activo:
            lay.label(text='Edita una expresión para ajustar los pesos.', icon='INFO')
        col = lay.column()
        col.enabled = ed.activo
        if ed.activo and ed.zona == 'ojos':
            pesos_parpados_ui.dibujar(col, context)
        else:
            col.label(text='Selecciona un punto en Párpados.', icon='INFO')
        col.operator('rlb.exp_influencias_parpados', icon='MOD_VERTEX_WEIGHT')
        col.operator('rlb.exp_cierre_parpados', icon='FILE_REFRESH')
        from . import puntos_manuales_parpado
        puntos_manuales_parpado.dibujar(col, context, cara)
        proporcion = col.box()
        proporcion.label(text='Reparto del parpadeo')
        proporcion.prop(ed, 'aporte_superior', slider=True)
        proporcion.label(text=f'Inferior: {100. - ed.aporte_superior:.1f} %')
        proporcion.operator('rlb.exp_cierre_parpados', text='Aplicar proporción').proporcion = True
        actual = json.loads(cara.get('rlb_parpados_parametros', '{}')).get('aporte_superior')
        if actual is not None:
            proporcion.label(text=f'Aplicado: {actual * 100:.1f} / {(1 - actual) * 100:.1f}')
        else:
            proporcion.label(text='Proporción nueva todavía sin aplicar')
        if cara.get('rlb_respaldo_cierre_parpados'):
            col.operator('rlb.exp_cierre_parpados_restaurar', icon='LOOP_BACK')
        if cara.get('aj_respaldo_mascaras_parpados'):
            col.operator('rlb.exp_influencias_parpados_restaurar', icon='LOOP_BACK')


CLASES = (RLB_PT_ajustes_generales, RLB_PT_ajustes_labios, RLB_PT_ajustes_parpados)


def register():
    from . import puntos_manuales_parpado
    puntos_manuales_parpado.register()
    for cls in CLASES:
        bpy.utils.register_class(cls)


def unregister():
    from . import puntos_manuales_parpado
    for cls in reversed(CLASES):
        bpy.utils.unregister_class(cls)
    puntos_manuales_parpado.unregister()
