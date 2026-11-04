# Rig Labial Bendy — rig de labios con Bendy Bones (método del tutorial, como el de Vale) para cualquier
# cara, paso a paso, reutilizando los dientes anime, la lengua, el fondo de la boca y los ojos de Vale.
# Panel: Vista 3D > barra lateral (N) > «Rig labial».
import bpy, json
from bpy.props import (PointerProperty, BoolProperty, FloatProperty, EnumProperty, StringProperty)

from .nucleo import pasos
from .nucleo import marco as MK
from .nucleo import linea as LN

PASOS = [
    ('analizar', '1. Analizar UV, malla e islas', 'Primero inventaría UV; diagnóstico de topología y materiales'),
    ('regiones_ver', 'Ver/ocultar mapa de regiones', 'Alterna la visualización de RLB_regiones; no cambia los materiales'),
    ('detectar_boca', '2. Detectar boca semiautomática', 'Coloca solo cuatro marcadores; revisa antes de aprobar'),
    ('aprobar_marcadores', 'Aprobar marcadores manualmente', 'Confirma los cuatro puntos revisados; no crea huesos'),
    ('detectar', '2. Detectar marcadores', 'Busca la boca junto al cursor 3D, comisuras, labios, ojos, cejas y pestañas'),
    ('inspeccionar', 'Inspeccionar partes', 'Nombra las partes de la malla (piel, cejas, medio globo, dientes, lengua, cavidad...) y saca una foto de colores'),
    ('simetrizar', 'Simetrizar marcadores', 'Copia los marcadores L al lado R'),
    ('arreglar', '3. Arreglar malla', 'Cuantización, solapas de las comisuras, normales en la boca'),
    ('abrir_ojos', '3b. Abrir ojos esculpidos', 'Si los ojos son un bulto de la piel: lo quita y deja el hueco para los ojos de Vale'),
    ('preparar_parpados', '3c. Preparar párpados (topología)', 'Antes del rig: quita la membrana del ojo, deja los anillos del párpado en quads y crea una cuenca hundida. Cambia caras y aristas'),
    ('ojos_tripo', '3d. Reutilizar ojos de Tripo', 'Antes del rig: optimiza la órbita sin cambiar su forma, saca los globos de Tripo a objetos propios y les pone iris y pupila. Cambia caras y aristas'),
    ('reconocer', 'Reconocer la cara', 'Solo lee: regiones por islas UV y confianza de cada marcador. Los puntos dudosos muestran su nombre en la vista'),
    ('pestanas_seleccionar', 'Marcar pestañas de Tripo', 'Marca las caras que parecen pestañas de Tripo (isla geométrica, isla UV o dudosas) y entra en modo edición para ajustar la selección'),
    ('pestanas_quitar_sel', 'Quitar pestañas = selección', 'Borra como pestañas de Tripo las caras seleccionadas (solo caras; se niega si están lejos del ojo)'),
    ('pestanas_restaurar', 'Devolver pestañas de Tripo', 'Devuelve las caras de pestañas que se borraron'),
    ('borde_sup', 'Borde superior = selección', 'Vértices seleccionados (modo edición) = borde del párpado superior, de rabillo a rabillo. El otro ojo se copia en espejo'),
    ('borde_inf', 'Borde inferior = selección', 'Vértices seleccionados (modo edición) = borde del párpado inferior, de rabillo a rabillo. El otro ojo se copia en espejo'),
    ('borde_ver_sup', 'Ver borde superior', 'Selecciona en modo edición el borde superior marcado'),
    ('borde_ver_inf', 'Ver borde inferior', 'Selecciona en modo edición el borde inferior marcado'),
    ('bordes_auto', 'Bordes automáticos', 'Olvida los bordes marcados a mano: el complemento los vuelve a buscar'),
    ('rig', '4. Rig de labios', 'Partes 1-3 del tutorial con Bendy Bones'),
    ('pesos', '5. Pesos + labio dentro', 'Pesos de la cara y shape keys del roll hacia dentro'),
    ('interior', '6. Interior de la boca', 'Dientes anime, lengua y fondo de la boca'),
    ('ojos', '7. Ojos', 'Ojos de Vale o los del personaje'),
    ('parpados', '8. Párpados, cejas y mejillas', 'Shape keys, controles y drivers'),
    ('sincronizar_pestanas_uv', 'Sincronizar pestañas UV', 'Transfiere pesos desde el borde raíz UV de piel y propaga correctivas de contacto; no altera Basis'),
    ('cuenca', '8c. Cuenca del ojo', 'Opcional: añade caras a la malla (margen del párpado y bolsa oscura). Solo si por el hueco se ve el interior'),
    ('oclusion', '8d. Lente de oclusión', 'Banda de contacto plana delante del globo, metida bajo los párpados (como CC EyeOcclusion)'),
    ('corte', 'Corte lateral de los ojos', 'Piel, cuenca, globo, lente y pestañas por x = centro del ojo; abierto, a medias y cerrado'),
    ('iris', '8b. Ajustar iris y pupila', 'Proporciones medidas en la imagen de referencia del personaje'),
    ('gestos', '9. Gestos', '12 gestos como assets de pose y acción de prueba'),
    ('expresiones', '9b. Aplicar biblioteca de expresiones', 'Expresiones y visemas de Serena/ARKit adaptados a esta cara (acciones ref_*) y horneados como shape keys GLB_*'),
    ('glb', '10. Exportar GLB (gestos como morphs)', 'La cara con sus shape keys GLB_* para three.js (morphTargetDictionary)'),
    ('todo', 'Construir 3 → 9', 'Todos los pasos seguidos con los marcadores actuales'),
    ('revisar', 'Revisión (renders)', 'Hojas de renders de cerca para comprobar'),
]


def _poll_mesh(self, o):
    return o.type == 'MESH'


def _poll_empty(self, o):
    return o.type == 'EMPTY'


def _al_elegir_cara(self, context):
    from .nucleo import auto
    auto.elegir(context, self.cara)


class RLB_Props(bpy.types.PropertyGroup):
    cara: PointerProperty(name='Cara', type=bpy.types.Object, poll=_poll_mesh, update=_al_elegir_cara)
    cuant: BoolProperty(name='Cuantización', default=True)
    solapas: BoolProperty(name='Solapas comisuras', default=True)
    normales: BoolProperty(name='Normales boca', default=True)
    pinch_follow: FloatProperty(name='Cierre sigue mandíbula', default=0.1, min=0, max=0.5)
    chew: FloatProperty(name='Masticar', default=0.75, min=0.5, max=1.0)
    ojos_modo: EnumProperty(name='Ojos', items=[('LIAN', 'Ojos de Lian', 'Globo, iris (color de vértice), pupila y córnea generados, sin texturas'),
                                              ('VALE', 'Ojos de Vale', 'Importa globo, iris, pupila y brillos de Vale'),
                                              ('EXISTENTES', 'Los del personaje', 'Usa los pivotes que elijas'),
                                              ('NINGUNO', 'Sin globos', 'Solo párpados y cejas')], default='LIAN')
    estilo_delineado: EnumProperty(name='Pestañas', items=[('anime', 'Anime', 'Negra, gruesa hacia fuera, con colita'),
                                                           ('marcado', 'Marcada', 'Marrón muy oscuro'),
                                                           ('fino', 'Fina', 'Discreta')],
                                   default='anime')
    color_ojos: EnumProperty(name='Color', items=[('castano', 'Castaño', ''), ('turquesa', 'Turquesa (Lian)', ''),
                                                  ('verde', 'Verde', ''), ('gris', 'Gris', '')], default='castano')
    piv_L: PointerProperty(name='Pivote L', type=bpy.types.Object, poll=_poll_empty)
    piv_R: PointerProperty(name='Pivote R', type=bpy.types.Object, poll=_poll_empty)
    raiz: PointerProperty(name='Raíz ojos', type=bpy.types.Object, poll=_poll_empty)
    dientes_y: FloatProperty(name='Dientes adelante/atrás', default=0.0, step=0.01, precision=4, unit='LENGTH')
    dientes_z: FloatProperty(name='Dientes arriba/abajo', default=0.0, step=0.01, precision=4, unit='LENGTH')
    dientes_ancho: FloatProperty(name='Ancho dientes', default=1.0, min=0.5, max=1.5)
    dientes_alto: FloatProperty(name='Alto dientes', default=1.0, min=0.3, max=2.0)
    lengua_escala: FloatProperty(name='Tamaño lengua', default=1.0, min=0.5, max=1.5)
    quitar_piezas: BoolProperty(name='Quitar dientes del modelo', default=True)
    ver_regiones: BoolProperty(name='Mostrar mapa de regiones', default=False)
    cierre_k: FloatProperty(name='Línea de cierre', default=0.15, min=0.0, max=0.5)
    entornar: FloatProperty(name='Entornar máx.', default=0.40, min=0.1, max=0.8)
    abrir: FloatProperty(name='Abrir (grados)', default=6.0, min=0, max=15)
    iris: FloatProperty(name='Iris / abertura', default=0.85, min=0.3, max=1.2,
                        description='Ancho del iris dividido entre el ancho del ojo (lagrimal a rabillo), en la imagen de referencia')
    pupila: FloatProperty(name='Pupila / iris', default=0.70, min=0.2, max=0.95,
                          description='Ancho de la pupila dividido entre el ancho del iris, en la imagen de referencia')
    informe: StringProperty(name='Informe', default='')
    ruta: EnumProperty(name='Ruta', items=[('COMPLETA', 'Completa (rig + cara FACS)', 'Pasos 1 a 19: rig de labios, ojos, párpados, cara FACS y prueba de habla'),
                                         ('SOLO', 'Solo párpados + delineado', 'Marcadores, ojos, párpados con delineado y medida')],
                       default='COMPLETA')
    amplitud_expr: FloatProperty(name='Amplitud (caricatura)', default=1.0, min=0.3, max=2.5)
    glb_ruta: StringProperty(name='GLB', default='', subtype='FILE_PATH', description='Vacío: <cara>_gestos.glb junto al .blend')
    # cara FACS (shape keys ARKit + controles + biblioteca + habla)
    facs_expr: EnumProperty(name='Expresión', items=lambda self, context: _items_expr())
    facs_peso: FloatProperty(name='Peso', default=1.0, min=0.0, max=1.5)
    facs_clave: BoolProperty(name='Insertar keyframe', default=False)
    facs_texto: StringProperty(name='¿Qué dice?', default='', description='La frase que dice el personaje, en español. Si pones un audio, escribe lo mismo que dice el audio')
    facs_audio: StringProperty(name='Audio (opcional)', default='', subtype='FILE_PATH', description='Archivo de voz .wav (opcional). Con audio, la boca sigue la voz; sin audio se usan tiempos típicos del español')
    facs_accion: StringProperty(name='Acción', default='', description='Vacío: <cara>_Habla')


_EXPR = []


def _items_expr():
    """expresiones de la biblioteca (la lista se guarda en el módulo: Blender necesita que viva)."""
    global _EXPR
    if not _EXPR:
        try:
            from .nucleo.facs import biblioteca as BI
            _EXPR = [(n, n.replace('_', ' '), '') for n in BI.cargar()['expresiones']]
        except Exception:
            _EXPR = [('neutro', 'neutro', '')]
    return _EXPR


PASOS_FACS = [
    ('todo', 'Construir cara FACS (todo)', 'Malla, boca, ojos, delineado, controles y drivers sobre el rig de los pasos 1–8'),
    ('preparar', 'F1. Preparar malla', 'Guarda el original, alisa la rejilla de Tripo y cierra los labios (una sola vez)'),
    ('boca', 'F2. Boca', 'Bolsa, forro oscuro, dientes en banda (lisa, larga, se estira con la boca), lengua y formas de la boca'),
    ('ojos', 'F3. Ojos, cejas, mejillas', 'Párpados que giran sobre el ojo (no se rompen ni lo atraviesan), cejas pegadas, mejillas, nariz y lente'),
    ('delineado', 'F4. Delineado (manual)', 'Paso manual: marca antes las caras (modo edición → «Marcar caras = selección») y pulsa Generar. Si no, el paso se da por hecho sin delineado'),
    ('controles', 'F5. Controles', 'Huesos en la cara y canales v_<forma> para la biblioteca y el habla'),
    ('terminar', 'F6. Drivers y terminar', 'Las piezas copian la cara, correctivas, rig viejo apagado'),
]


class RLB_OT_facs(bpy.types.Operator):
    bl_idname = 'rlb.facs'
    bl_label = 'Cara FACS'
    bl_description = 'Construye la cara FACS (shape keys ARKit) paso a paso'
    bl_options = {'REGISTER', 'UNDO'}
    paso: EnumProperty(items=[(a, b, c) for a, b, c in PASOS_FACS] + [('expresion', 'Aplicar expresión', ''),
                                                                    ('limpiar', 'Cara neutra', ''), ('hablar', 'Hablar', ''),
                                                                    ('delineado_marcar', 'Marcar caras = selección', 'Las caras seleccionadas en modo edición (o sus vértices) serán las del delineado de las pestañas'),
                                                                    ('delineado_ver', 'Ver caras marcadas', 'Selecciona en modo edición las caras marcadas para el delineado'),
                                                                    ('delineado_generar', 'Generar delineado', 'Pinta el delineado de las pestañas en las caras marcadas (se puede repetir)'),
                                                                    ('delineado_quitar', 'Quitar delineado', 'Devuelve la piel del párpado a como estaba'),
                                                                    ('habla', 'Probar que hable', 'Frase de prueba y hoja con los visemas A E I O U M-B-P F-V'),
                                                                    ('miniaturas', 'Estantería de expresiones', '')])

    @classmethod
    def description(cls, context, props):
        if props.paso == 'habla':
            return 'La cara dice una frase de prueba y saca una hoja con las formas de la boca (A, E, I, O, U, M-B-P, F-V) para mirarla'
        if props.paso == 'miniaturas':
            return 'Crea una expresión-asset con miniatura por cada expresión de la biblioteca (estantería abajo del visor 3D)'
        return dict((a, c) for a, b, c in PASOS_FACS).get(props.paso, '')

    def execute(self, context):
        from .nucleo.facs import pipeline as FP
        p = context.scene.rlb
        cara = p.cara
        if cara is None and self.paso.startswith('delineado_'):
            from .nucleo import asistente
            cara = asistente.personaje(context)          # el panel simple no rellena p.cara
        if cara is None:
            self.report({'ERROR'}, 'Elige el objeto de la cara'); return {'CANCELLED'}
        k = self.paso
        try:
            if k == 'todo': r = FP.construir_todo(cara)
            elif k == 'delineado': r = FP.delineado(cara, estilo=p.estilo_delineado)   # automático: se omite
            elif k == 'delineado_marcar': r = FP.delineado_marcar(cara)
            elif k == 'delineado_ver': r = FP.delineado_ver(cara)
            elif k == 'delineado_generar': r = FP.delineado_generar(cara, estilo=p.estilo_delineado)
            elif k == 'delineado_quitar': r = FP.delineado_quitar(cara)
            elif k in ('preparar', 'boca', 'ojos', 'controles', 'terminar'): r = getattr(FP, k)(cara)
            elif k == 'expresion':
                r = FP.expresion(cara, p.facs_expr, p.facs_peso, True, context.scene.frame_current if p.facs_clave else None)
            elif k == 'limpiar':
                from .nucleo.facs import biblioteca as BI
                r = BI.aplicar(cara, {'pesos': {}}, 1.0, True, context.scene.frame_current if p.facs_clave else None)
            elif k == 'hablar':
                if not p.facs_texto.strip():
                    self.report({'ERROR'}, 'Escribe el texto de la frase'); return {'CANCELLED'}
                b = {'nombre': (p.facs_accion or 'frase'), 'texto': p.facs_texto}
                if p.facs_audio:
                    b['audio'] = bpy.path.abspath(p.facs_audio)
                r = FP.hablar(cara, [b], accion=p.facs_accion or None)
            elif k == 'miniaturas':
                from .nucleo.facs import poses as PO
                r = {'expresiones': len(PO.crear(cara))}
            elif k == 'habla':
                r = pasos.hablar(cara, f'Hola, ¿qué tal? Me llamo {cara.name.strip()}.')
                r['hoja'] = pasos.foto_habla(cara)
        except Exception as e:
            import traceback; traceback.print_exc()
            self.report({'ERROR'}, str(e)); p.informe = 'ERROR: ' + str(e)
            return {'CANCELLED'}
        p.informe = json.dumps(r, ensure_ascii=False, default=str)[:4000]
        if k == 'todo':
            LN.marcar(cara, *[f'F_{a}' for a in ('preparar', 'boca', 'ojos', 'delineado', 'controles', 'terminar')])
        elif k in ('preparar', 'boca', 'ojos', 'delineado', 'controles', 'terminar'):
            LN.marcar(cara, 'F_' + k)
        elif k == 'miniaturas':
            LN.marcar(cara, 'F_expresiones')
        elif k == 'habla':
            LN.marcar(cara, 'F_habla')
        if k == 'habla':
            self.report({'INFO'}, 'Prueba de habla hecha: mira la hoja ' + r['hoja'])
            return {'FINISHED'}
        self.report({'INFO'}, 'Cara FACS: hecho')
        return {'FINISHED'}


class RLB_OT_ajustar_espacio_ojos(bpy.types.Operator):
    bl_idname = 'rlb.ajustar_espacio_ojos'
    bl_label = 'Comprobar espacio ocular'
    bl_description = 'Comprobar córnea y piel en nueve miradas; proponer un ajuste de profundidad sin cambiar la malla'
    bl_options = {'REGISTER','UNDO'}
    semillas_uv: StringProperty(name='Caras semilla de piel UV')
    aplicar: BoolProperty(name='Aplicar ajuste de profundidad a los ojos',default=False)
    acercar: BoolProperty(name='Acercar ojos hundidos a la abertura',default=False,
                          description='Avanzar hasta el contacto en nueve miradas; después rehacer los párpados')

    def invoke(self,context,event):
        cara=context.scene.rlb.cara or context.active_object
        if cara and not self.semillas_uv:self.semillas_uv=','.join(map(str,cara.get('rlb_parpados_uv_seeds',[])))
        return context.window_manager.invoke_props_dialog(self)

    def execute(self,context):
        p=context.scene.rlb;cara=p.cara or context.active_object
        if cara is None or cara.type!='MESH':self.report({'ERROR'},'Elige la malla de la cara');return {'CANCELLED'}
        try:
            seeds=[int(s.strip()) for s in self.semillas_uv.split(',') if s.strip()]
            r=pasos.ajustar_espacio_ojos(cara,seeds,aplicar=self.aplicar,limite=1. if self.acercar else .2,acercar=self.acercar)
        except Exception as e:
            self.report({'ERROR'},str(e));p.informe='ERROR: '+str(e);return {'CANCELLED'}
        p.informe=json.dumps(r,ensure_ascii=False,default=str)
        self.report({'INFO'},'Espacio ocular comprobado; piel conservada')
        return {'FINISHED'}


class RLB_OT_preparar_cuencas_aisladas(bpy.types.Operator):
    bl_idname = 'rlb.preparar_cuencas_aisladas'
    bl_label = 'Preparar interior de cuencas por UV'
    bl_description = 'Excepción para ensayo ocular aislado: diagnosticar o preparar piel interior conservando contorno y piezas ajenas'
    bl_options = {'REGISTER','UNDO'}
    semillas_uv: StringProperty(name='Caras semilla de piel UV')
    aplicar: BoolProperty(name='Aplicar preparación de cuencas',default=False)

    def invoke(self,context,event):
        cara=context.scene.rlb.cara or context.active_object
        if cara and not self.semillas_uv:self.semillas_uv=','.join(map(str,cara.get('rlb_parpados_uv_seeds',[])))
        return context.window_manager.invoke_props_dialog(self)

    def execute(self,context):
        p=context.scene.rlb;cara=p.cara or context.active_object
        if cara is None or cara.type!='MESH':self.report({'ERROR'},'Elige la malla de la cara');return {'CANCELLED'}
        try:
            seeds=[int(s.strip()) for s in self.semillas_uv.split(',') if s.strip()]
            r=pasos.preparar_cuencas_aisladas(cara,seeds,aplicar=self.aplicar)
        except Exception as e:
            self.report({'ERROR'},str(e));p.informe='ERROR: '+str(e);return {'CANCELLED'}
        if self.aplicar:cara['rlb_parpados_uv_seeds']=r['semillas_piel_actualizadas']
        p.informe=json.dumps(r,ensure_ascii=False,default=str)
        self.report({'INFO'},'Cuencas preparadas' if self.aplicar else 'Diagnóstico de cuencas: malla conservada')
        return {'FINISHED'}


class RLB_OT_solo_parpados(bpy.types.Operator):
    bl_idname = 'rlb.solo_parpados'
    bl_label = 'Solo párpados por superficie UV'
    bl_description = ('Cierre y apertura sin boca, cejas, densificación ni cambio de Basis. '
                      'Requiere islas de piel revisadas y ojos del complemento instalados')
    bl_options = {'REGISTER', 'UNDO'}
    semillas_uv: StringProperty(name='Caras semilla de piel UV', description='Índices de cara separados por comas; revisar primero el inventario UV')
    reemplazar: BoolProperty(name='Reemplazar keys oculares del complemento', default=False)

    def invoke(self, context, event):
        cara = context.scene.rlb.cara or context.active_object
        if cara and not self.semillas_uv:
            self.semillas_uv = ','.join(map(str,cara.get('rlb_parpados_uv_seeds',[])))
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context):
        p = context.scene.rlb
        cara = p.cara or context.active_object
        if cara is None or cara.type != 'MESH':
            self.report({'ERROR'}, 'Elige el objeto de la cara'); return {'CANCELLED'}
        try:
            seeds = [int(s.strip()) for s in self.semillas_uv.split(',') if s.strip()]
            r = pasos.parpados_aislados(cara, seeds, reemplazar=self.reemplazar)
        except Exception as e:
            import traceback; traceback.print_exc()
            self.report({'ERROR'}, str(e)); p.informe = 'ERROR: ' + str(e)
            return {'CANCELLED'}
        LN.marcar(cara, 'S_parpados')
        p.informe = json.dumps(r, ensure_ascii=False, default=str)[:4000]
        self.report({'INFO'}, 'Párpados y correctivas creados tras validar movimiento y contacto 3D')
        return {'FINISHED'}


class RLB_PT_facs(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Rig labial'
    bl_label = 'Cara FACS (expresiones y habla)'
    bl_parent_id = 'RLB_PT_avanzado'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        p = context.scene.rlb
        lay = self.layout
        from .nucleo import asistente as AS
        AS._parrafo(lay, context, 'Mismos pasos 12–17 de la línea del panel principal (en orden)', 'INFO')
        cara = p.cara
        hec = LN.hechos(cara) if cara else set()
        orden = ['oclusion', 'F_preparar', 'F_boca', 'F_ojos', 'F_delineado', 'F_controles', 'F_terminar']
        c = lay.column(); c.scale_y = 1.4
        c.operator('rlb.siguiente_paso', icon='PLAY')
        col = lay.column(align=True)
        for k, label, _ in PASOS_FACS[1:]:
            if k == 'delineado':
                col.prop(p, 'estilo_delineado')
            i = orden.index('F_' + k)
            r = col.row(align=True)
            r.enabled = bool(cara) and orden[i - 1] in hec
            r.label(text='', icon='CHECKMARK' if 'F_' + k in hec else 'RADIOBUT_OFF')
            r.operator('rlb.facs', text=label).paso = k
        c = lay.column(); c.scale_y = 1.4
        c.operator('rlb.ajustar_espacio_ojos', icon='VIEWZOOM')
        c.operator('rlb.preparar_cuencas_aisladas', text='Cuencas UV (ensayo aislado)', icon='MOD_MESHDEFORM')
        c.operator('rlb.solo_parpados', icon='HIDE_OFF')
        b = lay.box(); b.label(text='Biblioteca de expresiones', icon='SHAPEKEY_DATA')
        b.prop(p, 'facs_expr'); r = b.row(); r.prop(p, 'facs_peso'); r.prop(p, 'facs_clave')
        r = b.row(); r.operator('rlb.facs', text='Aplicar').paso = 'expresion'; r.operator('rlb.facs', text='Neutra').paso = 'limpiar'
        c = b.column(); c.scale_y = 1.4
        c.operator('rlb.facs', text='Crear estantería con miniaturas', icon='ASSET_MANAGER').paso = 'miniaturas'
        b = lay.box(); b.label(text='Habla (español)', icon='SPEAKER')
        b.prop(p, 'facs_texto'); b.prop(p, 'facs_audio'); b.prop(p, 'facs_accion')
        c = b.column(); c.scale_y = 1.4
        c.operator('rlb.facs', text='Animar habla (y guardar datos para la web)', icon='PLAY_SOUND').paso = 'hablar'
        AS._parrafo(b, context, '(Sin guardar los datos para la web: panel «3. Hacer que hable»)')


class RLB_OT_facs_pose(bpy.types.Operator):
    """aplica la expresión de la estantería a la cara activa (o a la única cara FACS del archivo)"""
    bl_idname = 'rlb.facs_pose'
    bl_label = 'Aplicar expresión'
    bl_options = {'REGISTER', 'UNDO'}
    peso: FloatProperty(name='Peso', default=1.0, min=0.0, max=1.5)

    @classmethod
    def poll(cls, context):
        return getattr(context, 'asset', None) is not None

    def invoke(self, context, event):
        self.peso = context.scene.rlb.facs_peso
        return self.execute(context)

    def execute(self, context):
        from .nucleo.facs import poses as PO
        asset = context.asset
        a = asset.local_id
        if a is None:  # asset de otro .blend: se enlaza la acción
            with bpy.data.libraries.load(asset.full_library_path, link=True) as (src, dst):
                dst.actions = [asset.name]
            a = dst.actions[0] if dst.actions else None
        if a is None:
            self.report({'ERROR'}, 'No se pudo cargar la expresión'); return {'CANCELLED'}
        ed = getattr(context.scene, 'rlb_editor', None)
        if ed is not None and a.library is None:
            # con el editor abierto, la miniatura cambia de expresión EN EL EDITOR (cada una con sus controles);
            # aplicarla directamente a la cara dejaría el panel mostrando la anterior
            if ed.activo:
                ed.expr = a.name
                self.report({'INFO'}, f'Editando {a.get("rlb_facs_expr", a.name)}')
                return {'FINISHED'}
            try:
                ed.expr = a.name
            except TypeError:
                pass
        cara = PO.cara_de(context, a)
        if cara is None:
            self.report({'ERROR'}, 'Selecciona la cara (o su control) para aplicar la expresión'); return {'CANCELLED'}
        sc = context.scene
        # con el control ya animado (habla), sin keyframe la acción taparía la expresión en el siguiente frame
        from .nucleo.facs import biblioteca as BI
        ctrl = BI.control(cara)
        animado = bool(ctrl and ctrl.animation_data and ctrl.animation_data.action)
        frame = sc.frame_current if (sc.rlb.facs_clave or animado or sc.tool_settings.use_keyframe_insert_auto) else None
        PO.aplicar(cara, a, self.peso, frame)
        self.report({'INFO'}, f'{a.get("rlb_facs_expr", a.name)} en {cara.name}')
        return {'FINISHED'}


class RLB_AST_facs(bpy.types.AssetShelf):
    """estantería de expresiones FACS (como la biblioteca de poses): abajo del visor 3D"""
    bl_space_type = 'VIEW_3D'
    bl_idname = 'RLB_AST_facs'
    bl_activate_operator = 'RLB_OT_facs_pose'
    bl_default_preview_size = 96
    bl_options = {'DEFAULT_VISIBLE', 'NO_ASSET_DRAG'}

    @classmethod
    def poll(cls, context):
        objetos = getattr(context, 'visible_objects', None)
        if objetos is None:
            # vista a pantalla completa: context.visible_objects no existe
            def _visible(o):
                try:
                    return o.visible_get()
                except Exception:
                    return False
            objetos = [o for o in bpy.context.view_layer.objects if _visible(o)]
        return any(o.type == 'MESH' and o.name + '_Cara_Control' in bpy.data.objects for o in objetos)

    @classmethod
    def asset_poll(cls, asset):
        if asset.id_type != 'ACTION' or not any(t.name == 'FACS' for t in asset.metadata.tags):
            return False
        # 0.8.10: solo las expresiones (y miniaturas) del personaje elegido; con varios personajes en el .blend salían todas
        # mezcladas (las de «kaka 2» sobre Kakashi) y al pulsar una se cargaba la acción de otro personaje
        try:
            cara = bpy.context.scene.rlb.cara
            a = asset.local_id
            dueno = a.get('rlb_facs_cara') if a is not None else None
            return cara is None or dueno is None or dueno == cara.name
        except Exception:
            return True


def _ajustes(p):
    return {'dientes_y': p.dientes_y / max(MK.Marco(p.cara).s, 1e-9), 'dientes_z': p.dientes_z / max(MK.Marco(p.cara).s, 1e-9),
            'dientes_ancho': p.dientes_ancho, 'dientes_alto': p.dientes_alto, 'lengua_escala': p.lengua_escala,
            'quitar_piezas': p.quitar_piezas}


def _param(p):
    return {'cierre_k': p.cierre_k, 'entornar': p.entornar, 'abrir': p.abrir}


class RLB_OT_paso(bpy.types.Operator):
    bl_idname = 'rlb.paso'
    bl_label = 'Paso del rig labial'
    bl_description = 'Ejecuta un paso del rig labial'
    bl_options = {'REGISTER', 'UNDO'}
    paso: EnumProperty(items=[(a, b, c) for a, b, c in PASOS])

    @classmethod
    def description(cls, context, props):
        return dict((a, c) for a, b, c in PASOS).get(props.paso, '')

    def execute(self, context):
        p = context.scene.rlb
        cara = p.cara
        if cara is None:
            self.report({'ERROR'}, 'Elige el objeto de la cara'); return {'CANCELLED'}
        k = self.paso
        try:
            if k == 'analizar': r = pasos.analizar(cara)
            elif k == 'regiones_ver':
                visible = not p.ver_regiones
                r = pasos.mostrar_regiones(cara, visible)
                p.ver_regiones = visible
            elif k == 'detectar_boca': r = pasos.detectar_boca(cara, context.scene.cursor.location.copy())
            elif k == 'aprobar_marcadores': r = pasos.aprobar_marcadores(cara)
            elif k == 'detectar': r = pasos.detectar(cara, context.scene.cursor.location.copy())
            elif k == 'inspeccionar': r = pasos.inspeccionar(cara)
            elif k == 'iris': r = pasos.ajustar_iris(cara, p.iris, p.pupila)
            elif k == 'simetrizar': r = pasos.simetrizar(cara)
            elif k == 'arreglar': r = pasos.arreglar(cara, p.cuant, p.solapas, p.normales)
            elif k == 'abrir_ojos': r = pasos.abrir_ojos(cara)
            elif k == 'pestanas_seleccionar': r = pasos.pestanas_seleccionar(cara)
            elif k == 'pestanas_quitar_sel': r = pasos.quitar_pestanas_manual(cara)
            elif k == 'pestanas_restaurar': r = pasos.restaurar_pestanas(cara)
            elif k == 'borde_sup': r = pasos.marcar_borde_parpado(cara, 'sup')
            elif k == 'borde_inf': r = pasos.marcar_borde_parpado(cara, 'inf')
            elif k == 'borde_ver_sup': r = pasos.ver_borde_parpado(cara, 'sup')
            elif k == 'borde_ver_inf': r = pasos.ver_borde_parpado(cara, 'inf')
            elif k == 'bordes_auto': r = pasos.borrar_bordes_parpado(cara)
            elif k == 'rig': r = pasos.rig_labios(cara, p.pinch_follow, p.chew)
            elif k == 'pesos': r = pasos.pesos(cara)
            elif k == 'interior': r = pasos.boca_interior(cara, _ajustes(p))
            elif k == 'ojos':
                if p.ojos_modo == 'LIAN': r = pasos.ojos_lian(cara, p.color_ojos)
                elif p.ojos_modo == 'VALE': r = pasos.ojos_vale(cara)
                elif p.ojos_modo == 'EXISTENTES':
                    if not (p.piv_L and p.piv_R):
                        self.report({'ERROR'}, 'Elige los pivotes L y R de los ojos'); return {'CANCELLED'}
                    r = pasos.ojos_existentes(cara, p.piv_L.name, p.piv_R.name, p.raiz.name if p.raiz else None)
                else: r = {'ojos': 'sin globos'}
            elif k == 'parpados': r = pasos.parpados(cara, _param(p))
            elif k == 'sincronizar_pestanas_uv': r = pasos.sincronizar_pestanas_uv(cara)
            elif k == 'preparar_parpados': r = pasos.preparar_parpados(cara, aplicar=True)
            elif k == 'ojos_tripo': r = pasos.ojos_tripo(cara, aplicar=True, color=p.color_ojos)
            elif k == 'reconocer': r = pasos.reconocer(cara)
            elif k == 'cuenca': r = pasos.cuenca(cara)
            elif k == 'oclusion': r = pasos.oclusion(cara)
            elif k == 'corte': r = {s: pasos.corte_ojo(cara, s) for s in ('L', 'R')}
            elif k == 'gestos': r = pasos.crear_gestos(cara)
            elif k == 'expresiones':
                from .nucleo import expresiones
                r = expresiones.retarget(cara, amplitud=p.amplitud_expr); r.update(expresiones.hornear(cara))
            elif k == 'glb':
                from .nucleo import expresiones
                r = expresiones.exportar_glb(cara, bpy.path.abspath(p.glb_ruta) if p.glb_ruta else bpy.path.abspath(f'//{cara.name}_gestos.glb'))
            elif k == 'todo':
                piv = (p.piv_L.name, p.piv_R.name, p.raiz.name if p.raiz else None) if p.piv_L and p.piv_R else None
                r = pasos.todo(cara, p.cuant, p.solapas, p.normales, p.ojos_modo, piv, _ajustes(p), _param(p),
                               p.pinch_follow, p.chew, color_ojos=p.color_ojos)
            elif k == 'revisar': r = pasos.revisar(cara)
        except Exception as e:
            import traceback; traceback.print_exc()
            self.report({'ERROR'}, str(e)); p.informe = 'ERROR: ' + str(e)
            return {'CANCELLED'}
        p.informe = json.dumps(r, ensure_ascii=False, default=str)[:4000]
        _marcar_paso(cara, k, r)
        self.report({'INFO'}, f'{dict((a, b) for a, b, c in PASOS)[k]}: hecho')
        return {'FINISHED'}


def _marcar_paso(cara, k, r=None):
    """apunta en la cara que el paso k terminó bien (cara['rlb_hechos'], ver nucleo/linea.py)."""
    try:
        if k == 'aprobar_marcadores':
            LN.marcar(cara, 'detectar')
        elif k == 'todo':
            ids = ['arreglar', 'rig', 'pesos', 'interior', 'ojos', 'parpados', 'cuenca', 'oclusion']
            if LN.derivado(cara).get('abrir_ojos'):
                ids.insert(1, 'abrir_ojos')
            LN.marcar(cara, *ids)
        elif k == 'detectar':
            if not MK.cfg(cara).get('semiauto_boca_pendiente'):
                LN.marcar(cara, 'detectar')
        elif k in LN.ids('COMPLETA') or k in LN.ids('SOLO'):
            LN.marcar(cara, k)
    except Exception:
        import traceback; traceback.print_exc()


class RLB_OT_medir_parpados(bpy.types.Operator):
    bl_idname = 'rlb.medir_parpados'
    bl_label = 'Medir párpados'
    bl_description = 'Mide los párpados: vértices dentro del globo, triángulos invertidos y ojo visible al cerrar (no cambia la malla)'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from .nucleo.facs import pipeline as FP
        p = context.scene.rlb
        cara = p.cara or context.active_object
        if cara is None or cara.type != 'MESH':
            self.report({'ERROR'}, 'Elige el objeto de la cara'); return {'CANCELLED'}
        try:
            if cara.get('rlb_parpados_metodo','').startswith('superficie_uv'):
                m=pasos.medir_parpados_aislados(cara)
                p.informe=json.dumps(m,ensure_ascii=False,default=str)[:4000]
                self.report({'INFO'},f"{m['poses']} poses, {len(m['fallos'])} fallos de geometría/contacto")
                return {'FINISHED'}
            m = FP.medir_parpados(cara)
        except Exception as e:
            import traceback; traceback.print_exc()
            self.report({'ERROR'}, str(e)); p.informe = 'ERROR: ' + str(e)
            return {'CANCELLED'}
        p.informe = json.dumps(m, ensure_ascii=False, default=str)[:4000]
        dentro = sum(v.get('dentro_globo', 0) for v in m.values() if isinstance(v, dict))
        inv = sum(v.get('invertidos', 0) for v in m.values() if isinstance(v, dict))
        cerr = [v['ojo_visible_%'] for v in m.values() if isinstance(v, dict) and 'ojo_visible_%' in v]
        LN.marcar(cara, 'S_medida')
        self.report({'INFO'}, f'{len(m)} poses, {dentro} vértices dentro del globo, {inv} triángulos invertidos'
                    + (f', ojo visible cerrado máx {max(cerr)} %' if cerr else ''))
        return {'FINISHED'}


class RLB_OT_siguiente_paso(bpy.types.Operator):
    bl_idname = 'rlb.siguiente_paso'
    bl_label = 'Siguiente paso'
    bl_description = 'Ejecuta el primer paso pendiente de la ruta elegida (el mismo botón del paso, en orden, sin saltarse ninguno)'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        p = context.scene.rlb
        cara = p.cara
        if cara is None:
            self.report({'ERROR'}, 'Elige el objeto de la cara'); return {'CANCELLED'}
        paso = LN.siguiente(cara, p.ruta)
        if paso is None:
            self.report({'INFO'}, 'La ruta está terminada: todos los pasos están hechos'); return {'FINISHED'}
        pid, titulo, kind, arg, _ = paso
        n = [s[0] for s in (LN.SOLO if p.ruta == 'SOLO' else LN.COMPLETA)].index(pid) + 1
        # marcadores semiautomáticos pendientes de aprobar: el paso es aprobarlos
        if pid == 'detectar' and MK.cfg(cara).get('semiauto_boca_pendiente'):
            kind, arg = 'paso', 'aprobar_marcadores'
        if pid == 'ojos' and p.ojos_modo == 'EXISTENTES' and not (p.piv_L and p.piv_R):
            self.report({'ERROR'}, f'Paso {n} ({titulo}): elige los pivotes L y R de los ojos'); return {'CANCELLED'}
        if kind == 'paso': r = bpy.ops.rlb.paso(paso=arg)
        elif kind == 'facs': r = bpy.ops.rlb.facs(paso=arg)
        elif kind == 'solo': r = bpy.ops.rlb.solo_parpados()
        else: r = bpy.ops.rlb.medir_parpados()
        if 'FINISHED' not in r:
            self.report({'ERROR'}, f'Paso {n} ({titulo}) no terminó: mira el informe'); return {'CANCELLED'}
        sig = LN.siguiente(cara, p.ruta)
        self.report({'INFO'}, f'Paso {n} hecho: {titulo}.' + (f' Siguiente: {sig[1]}' if sig else ' Ruta terminada.'))
        return {'FINISHED'}


def _fila_paso(lay, n, paso, hecho, habilitado, na=False, destacar=False):
    """una fila de la línea: icono de estado + botón del paso (apagado hasta que el anterior esté hecho)."""
    pid, titulo, kind, arg, desc = paso
    row = lay.row(align=True)
    row.label(text='', icon='CHECKMARK' if hecho else ('RADIOBUT_OFF' if habilitado else 'LOCKED'))
    c = row.row(align=True)
    c.enabled = habilitado
    c.scale_y = 1.4 if destacar else 1.0          # el paso que toca se ve más grande y hundido
    texto = f'Paso {n}. {titulo}' + (' (no hace falta)' if na else '')
    if kind == 'paso': c.operator('rlb.paso', text=texto, depress=destacar).paso = arg
    elif kind == 'facs': c.operator('rlb.facs', text=texto, depress=destacar).paso = arg
    elif kind == 'solo': c.operator('rlb.solo_parpados', text=texto, depress=destacar)
    else: c.operator('rlb.medir_parpados', text=texto, depress=destacar)
    return row


class RLB_PT_panel(bpy.types.Panel):
    """panel para principiantes: un botón que hace todo y el estado del personaje (ver nucleo/asistente.py)."""
    bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Rig labial'
    bl_label = '1. Crear el rig'
    bl_order = 0

    def draw_header(self, context):
        try:
            from .nucleo import asistente, auto as AU
            cara = asistente.personaje(context)
            hecho = cara is not None and AU.terminada(cara)
            self.layout.label(text='', icon='CHECKMARK' if hecho else 'RADIOBUT_OFF')
        except Exception:
            pass

    def draw(self, context):
        from .nucleo import asistente
        asistente.dibujar(self.layout, context)


class RLB_PT_avanzado(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Rig labial'
    bl_label = 'Avanzado (solo si algo falla)'
    bl_parent_id = 'RLB_PT_panel'
    bl_options = {'DEFAULT_CLOSED'}

    def _opciones(self, lay, p, pid):
        """ajustes que van encima del botón del paso (los de siempre)."""
        if pid == 'arreglar':
            r = lay.row(); r.prop(p, 'cuant'); r.prop(p, 'solapas'); r.prop(p, 'normales')
        elif pid == 'rig':
            r = lay.row(); r.prop(p, 'pinch_follow'); r.prop(p, 'chew')
        elif pid == 'interior':
            c = lay.column(align=True)
            for a in ('dientes_y', 'dientes_z', 'dientes_ancho', 'dientes_alto', 'lengua_escala', 'quitar_piezas'):
                c.prop(p, a)
        elif pid == 'ojos':
            lay.prop(p, 'ojos_modo')
            if p.ojos_modo == 'LIAN':
                lay.prop(p, 'color_ojos')
            if p.ojos_modo == 'EXISTENTES':
                lay.prop(p, 'piv_L'); lay.prop(p, 'piv_R'); lay.prop(p, 'raiz')
        elif pid == 'parpados':
            c = lay.column(align=True); c.prop(p, 'cierre_k'); c.prop(p, 'entornar'); c.prop(p, 'abrir')
        elif pid in ('F_delineado', 'S_parpados'):
            lay.prop(p, 'estilo_delineado')

    # reparto de los pasos de la línea en tres secciones plegables (por posición en la línea; no se inventa ningún paso)
    _MALLA = ('analizar', 'detectar', 'arreglar', 'abrir_ojos')
    _GRUPOS = (('malla', 'Preparar la malla'), ('rig', 'Construir el rig'), ('facs', 'Cara FACS (expresiones y habla)'))

    @classmethod
    def _grupo(cls, pid):
        if pid.startswith('F_'):
            return 'facs'
        return 'malla' if pid in cls._MALLA else 'rig'

    def _caja_paso(self, context, cont, p, cara, hec, na, i, paso, hecho, habil, destacar):
        pid = paso[0]
        box = cont.box()
        self._opciones(box, p, pid)
        if pid == 'detectar' and MK.cfg(cara).get('semiauto_boca_pendiente'):
            from .nucleo import asistente as AS
            AS._parrafo(box, context, 'Marcadores semiautomáticos por aprobar', 'INFO')
        _fila_paso(box, i, paso, hecho, habil, na=pid in na, destacar=destacar)
        if pid == 'detectar':
            r = box.row(align=True); r.enabled = habil
            r.operator('rlb.paso', text='Boca semiautomática').paso = 'detectar_boca'
            r.operator('rlb.paso', text='Aprobar marcadores').paso = 'aprobar_marcadores'
        if pid == 'F_delineado':
            from .nucleo import asistente as AS
            AS.caja_delineado(box, context, cara)
        if pid == 'abrir_ojos':
            # 0.7.2: si la detección (isla geométrica → isla UV) no asegura las pestañas de Tripo, las marca el usuario
            r = box.row(align=True)
            r.operator('rlb.paso', text='Marcar pestañas').paso = 'pestanas_seleccionar'
            r.operator('rlb.paso', text='Quitar = selección').paso = 'pestanas_quitar_sel'
            r.operator('rlb.paso', text='Devolver').paso = 'pestanas_restaurar'
        if pid == 'parpados':
            # 0.8.5: bordes del párpado a mano (modo edición, vértices de rabillo a rabillo; el otro ojo va en espejo)
            from .nucleo import asistente as AS
            hay = bool(cara.get('rlb_borde_parpado'))
            AS._parrafo(box, context, 'Bordes a mano: ' + ('marcados' if hay else 'automáticos'), 'EDITMODE_HLT')
            r = box.row(align=True)
            r.operator('rlb.paso', text='Borde superior = selección').paso = 'borde_sup'
            r.operator('rlb.paso', text='Borde inferior = selección').paso = 'borde_inf'
            r = box.row(align=True); r.enabled = hay
            r.operator('rlb.paso', text='Ver sup.').paso = 'borde_ver_sup'
            r.operator('rlb.paso', text='Ver inf.').paso = 'borde_ver_inf'
            r.operator('rlb.paso', text='Automáticos').paso = 'bordes_auto'

    def draw(self, context):
        from .nucleo import asistente as AS
        p = context.scene.rlb
        lay = self.layout
        lay.prop(p, 'cara')
        lay.prop(p, 'ruta', text='')
        cara = p.cara
        if cara is None:
            lay.label(text='Elige la cara para empezar', icon='INFO')
            return
        hec = LN.hechos(cara)
        na = LN.no_aplica(cara, hec)
        ruta = LN.abierto(cara, p.ruta, hec)
        total = len(ruta)
        hechos_n = sum(1 for _, h, _ in ruta if h)
        sig = next((s for s, h, _ in ruta if not h), None)
        b = lay.box()
        if sig is None:
            AS._parrafo(b, context, f'Ruta terminada: {hechos_n} de {total} pasos hechos', 'CHECKMARK')
        else:
            n_sig = [s[0] for s, _, _ in ruta].index(sig[0]) + 1
            AS._parrafo(b, context, f'{hechos_n} de {total} hechos. Toca: Paso {n_sig}. {sig[1]}', 'INFO')
            c = b.column(); c.scale_y = 2.0
            c.operator('rlb.siguiente_paso', icon='PLAY')
        AS._parrafo(lay, context, 'Cursor 3D en la boca (Shift+clic der.) antes de los marcadores', 'INFO')
        sig_id = sig[0] if sig is not None else None
        pasos_n = [(i, paso, hecho, habil) for i, (paso, hecho, habil) in enumerate(ruta, 1)]
        if p.ruta == 'COMPLETA':
            for g, titulo in self._GRUPOS:
                items = [t for t in pasos_n if self._grupo(t[1][0]) == g]
                if not items:
                    continue
                n_ok = sum(1 for t in items if t[2])
                abierta = sig_id is not None and any(t[1][0] == sig_id for t in items)
                # el id lleva si la sección abre por defecto: al avanzar el paso que toca, se abre la sección nueva
                cab, cuerpo = lay.panel(f'RLB_av_{g}_{int(abierta)}', default_closed=not abierta)
                cab.label(text=f'{titulo} ({n_ok}/{len(items)})', icon='CHECKMARK' if n_ok == len(items) else 'RADIOBUT_OFF')
                if cuerpo:
                    for i, paso, hecho, habil in items:
                        self._caja_paso(context, cuerpo, p, cara, hec, na, i, paso, hecho, habil, paso[0] == sig_id)
        else:
            for i, paso, hecho, habil in pasos_n:
                self._caja_paso(context, lay, p, cara, hec, na, i, paso, hecho, habil, paso[0] == sig_id)
        if p.ruta == 'COMPLETA':
            if LN.hay_rig(cara):
                e = lay.box()
                AS._parrafo(e, context, 'Fuera de la línea (opcionales, no cambian el orden)', 'TOOL_SETTINGS')
                c = e.column(align=True)
                c.operator('rlb.paso', text='Ver/ocultar mapa de regiones', icon='HIDE_ON' if p.ver_regiones else 'HIDE_OFF').paso = 'regiones_ver'
                c.operator('rlb.paso', text='Simetrizar marcadores').paso = 'simetrizar'
                c.operator('rlb.paso', text='Inspeccionar partes').paso = 'inspeccionar'
                c.operator('rlb.paso', text='Sincronizar pestañas UV', icon='MOD_VERTEX_WEIGHT').paso = 'sincronizar_pestanas_uv'
                bi = e.box(); cc = bi.column(align=True); cc.prop(p, 'iris'); cc.prop(p, 'pupila')
                bi.operator('rlb.paso', text='Ajustar iris y pupila').paso = 'iris'
                e.operator('rlb.paso', text='Corte lateral de los ojos').paso = 'corte'
                e.operator('rlb.paso', text='Gestos (12 poses de prueba)').paso = 'gestos'
                bx = e.box(); bx.prop(p, 'amplitud_expr')
                bx.operator('rlb.paso', text='Aplicar biblioteca de expresiones', icon='SHAPEKEY_DATA').paso = 'expresiones'
                bg = e.box(); bg.prop(p, 'glb_ruta')
                bg.operator('rlb.paso', text='Exportar GLB (gestos como morphs)', icon='EXPORT').paso = 'glb'
                e.operator('rlb.paso', text='Revisión (renders)').paso = 'revisar'
                if 'oclusion' in hec:
                    t = e.column(align=True)
                    AS._parrafo(t, context, 'Atajos (varios pasos seguidos, en orden):')
                    t.operator('rlb.paso', text='Construir pasos 3 a 11 (rig)', icon='PLAY').paso = 'todo'
                    t.operator('rlb.facs', text='Construir cara FACS (pasos 12 a 18)', icon='PLAY').paso = 'todo'
        else:
            AS._parrafo(lay, context, 'Camino corto: cara en X=0 con la transformación aplicada', 'INFO')
        if p.informe:
            b = lay.box()
            b.label(text='Último informe:')
            AS._parrafo(b, context, p.informe[:600])


CLASES = (RLB_Props, RLB_OT_paso, RLB_OT_medir_parpados, RLB_OT_siguiente_paso, RLB_PT_panel, RLB_PT_avanzado, RLB_OT_facs,
          RLB_OT_ajustar_espacio_ojos, RLB_OT_preparar_cuencas_aisladas, RLB_OT_solo_parpados, RLB_PT_facs, RLB_OT_facs_pose, RLB_AST_facs)


def register():
    for c in CLASES: bpy.utils.register_class(c)
    bpy.types.Scene.rlb = PointerProperty(type=RLB_Props)
    from .nucleo import asistente
    asistente.register()
    from .nucleo.facs import editor
    editor.register()
    from .nucleo.facs import editor_habla
    editor_habla.register()
    from .nucleo import auto
    auto.register()
    from .nucleo import forma_ui
    forma_ui.register()
    from .nucleo import dientes_ui
    dientes_ui.register()
    from .nucleo import dientes_apariencia
    dientes_apariencia.register()
    from .nucleo import ojos_ui
    ojos_ui.register()


def unregister():
    from .nucleo import ojos_ui
    ojos_ui.unregister()
    from .nucleo import dientes_apariencia
    dientes_apariencia.unregister()
    from .nucleo import dientes_ui
    dientes_ui.unregister()
    from .nucleo import forma_ui
    forma_ui.unregister()
    from .nucleo import auto
    auto.unregister()
    from .nucleo.facs import editor
    editor.unregister()
    from .nucleo.facs import editor_habla
    editor_habla.unregister()
    from .nucleo import asistente
    asistente.unregister()
    del bpy.types.Scene.rlb
    for c in reversed(CLASES): bpy.utils.unregister_class(c)
