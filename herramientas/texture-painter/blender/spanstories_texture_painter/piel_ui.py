"""Panel Piel: everything a non-Blender user needs, nothing about nodes."""
import bpy
from bpy.props import BoolProperty,EnumProperty,FloatProperty,FloatVectorProperty,PointerProperty,StringProperty
from bpy.types import Operator,Panel,PropertyGroup

from . import core,piel


def live(self,context):
    ob=self.id_data
    if not self.get('updating') and piel.active(ob):piel.push(ob)


def zones(self,context):
    ob=self.id_data
    if not self.get('updating') and piel.active(ob):piel.zones_changed(ob);piel.push(ob)


def style(self,context):
    ob=self.id_data
    if not self.get('updating') and piel.active(ob):piel.apply_style(ob,self.estilo);piel.push(ob)


def hair(self,context):
    piel.hide_hair(self.id_data,self.ocultar_pelo)


def amount(name,tip='',maximum=3.,default=0.):
    return FloatProperty(name=name,description=tip,min=0,soft_max=maximum,default=default,update=live)


def color(name,default):
    return FloatVectorProperty(name=name,subtype='COLOR',size=3,min=0,max=1,default=default,update=live)


class SSTP_Piel(PropertyGroup):
    estilo:EnumProperty(name='Estilo',items=(('PIXAR','Pixar','Piel limpia y suave, sin detalles realistas'),('NATURAL','Natural','Detalle discreto'),('HIPER','Hiperrealista','Poros, manchas y venas visibles')),default='PIXAR',update=style)
    color:color('Color de piel',(.8,.55,.42))
    subtono:FloatProperty(name='Subtono',description='Izquierda: frío (rosado). Derecha: cálido (dorado)',min=-1,max=1,default=0,update=live)
    rubor:FloatProperty(name='Rubor',description='Color en mejillas y nariz',min=0,max=1,default=.3,update=live)
    rubor_color:color('Color del rubor',(.75,.22,.2))
    textura:FloatProperty(name='Sombras de la textura',description='Cuánto se conservan las sombras y arrugas pintadas en la textura original',min=0,max=1,default=.6,update=live)
    ocultar_pelo:BoolProperty(name='Ocultar pelo',description='Quita el pelo de la vista para trabajar la cara. No lo borra ni afecta al GLB',default=True,update=hair)
    limpiar:BoolProperty(name='Limpiar manchas (piel, pelo y ropa)',description='Cada región toma su color mayoritario. Las cejas quedan de un color limpio',default=True,update=zones)
    zona_cara:BoolProperty(name='Cara y cuello',default=True,update=zones)
    zona_torso:BoolProperty(name='Torso',default=True,update=zones)
    zona_brazos:BoolProperty(name='Brazos y manos',default=True,update=zones)
    zona_piernas:BoolProperty(name='Piernas',default=True,update=zones)
    proteger_labios:BoolProperty(name='Protector de labios',description='Conserva los labios del personaje al cambiar la piel',default=True,update=live)
    labios_modo:EnumProperty(name='Labios',items=(('TEXTURA','Conservar','Mantiene los labios que ya tiene el personaje'),('COLOR','Pintar','Tiñe los labios con el color elegido')),default='TEXTURA',update=live)
    labios_color:color('Color de labios',(.55,.12,.13))
    labios_fuerza:FloatProperty(name='Intensidad',min=0,max=1,default=.6,update=live)
    labios_borde:FloatProperty(name='Tamaño del área protegida',description='Amplía o reduce la zona que se reconoce como labios',min=-1,max=1,default=0,update=live)
    labios_ver:BoolProperty(name='Ver qué se detectó',description='Verde: piel. Rojo: labios. Negro: lo que no se toca',default=False,update=live)
    poros:amount('Poros');poros_tamano:amount('Tamaño de poros',maximum=1,default=.5);suciedad:amount('Impurezas');gallina:amount('Piel de gallina',maximum=1)
    celulas:amount('Textura fina');granitos:amount('Granitos');lunares:amount('Lunares');pecas:amount('Pecas',maximum=1);pecas_escala:amount('Tamaño de pecas',default=1.)
    venas:amount('Venas');manchas:amount('Manchas');rojeces:amount('Rojeces')
    poros_escala:amount('Escala de poros',default=1.);celulas_escala:amount('Escala fina',default=1.);granitos_escala:amount('Escala de granitos',default=1.);granitos_relieve:amount('Relieve de granitos')
    lunares_escala:amount('Escala de lunares',default=1.);venas_escala:amount('Escala de venas',default=1.);manchas_escala:amount('Escala de manchas',default=1.);rojeces_escala:amount('Escala de rojeces',default=1.);barniz_aspereza:amount('Humedad mate',maximum=1,default=.03)
    lunares_color:color('Color de lunares',(.25,.11,.063));pecas_color:color('Color de pecas',(.25,.11,.063));venas_color:color('Color de venas',(.122,.028,.275));manchas_rojo:color('Manchas rojas',(.262,.056,.04));manchas_azul:color('Manchas azules',(.107,.072,.262));rojeces_color:color('Color de rojeces',(.262,.056,.04))
    brillo:amount('Brillo',maximum=1,default=.35);aspereza:amount('Mate',maximum=1,default=.5);translucidez:amount('Translucidez',maximum=.1,default=.03);barniz:amount('Piel húmeda',maximum=1);escala:amount('Escala del detalle',default=1.)


def character(context):
    """What is selected wins; the stored character only covers an empty selection."""
    ob=context.active_object
    if ob and ob.type=='MESH' and ob.data.uv_layers.active:return ob
    cfg=context.scene.sstp
    return cfg.target if cfg.target and cfg.target.type=='MESH' else None


class SSTP_OT_piel_iniciar(Operator):
    bl_idname='sstp.piel_iniciar';bl_label='Detectar piel y labios';bl_description='Encuentra sola toda la piel visible y protege los labios'
    def execute(self,context):
        ob=character(context)
        if not ob:self.report({'ERROR'},'Elige un personaje');return {'CANCELLED'}
        data=piel.start(ob.name,hide=ob.sstp_piel.ocultar_pelo)
        self.report({'INFO'},'Piel: '+', '.join(data['zonas'])+' · labios: '+data['labios']);return {'FINISHED'}


class SSTP_OT_piel_tono(Operator):
    bl_idname='sstp.piel_tono';bl_label='Tono';bl_description='Usar este tono de piel'
    tono:StringProperty()
    def execute(self,context):
        character(context).sstp_piel.color=piel.hex_linear(piel.TONES[self.tono]);return {'FINISHED'}


class SSTP_OT_piel_quitar(Operator):
    bl_idname='sstp.piel_quitar';bl_label='Quitar piel';bl_description='Vuelve a la textura original'
    def execute(self,context):
        piel.remove(character(context).name);return {'FINISHED'}


class SSTP_OT_piel_hornear(Operator):
    bl_idname='sstp.piel_hornear';bl_label='Hornear piel';bl_description='Calcula la imagen final. La exportación GLB lo hace sola'
    def execute(self,context):
        piel.bake(character(context));self.report({'INFO'},'Piel horneada');return {'FINISHED'}


GROUPS=(('Poros',('poros','poros_tamano','poros_escala','suciedad','gallina')),('Textura fina',('celulas','celulas_escala')),('Pecas',('pecas','pecas_escala','pecas_color')),('Lunares',('lunares','lunares_escala','lunares_color')),('Granitos',('granitos','granitos_relieve','granitos_escala')),('Venas',('venas','venas_escala','venas_color')),('Manchas',('manchas','manchas_escala','manchas_rojo','manchas_azul')),('Rojeces',('rojeces','rojeces_escala','rojeces_color')),('Brillo y superficie',('brillo','aspereza','translucidez','barniz','barniz_aspereza')),('Tamaño general',('escala',)))


def draw_general(layout,ob):
    p=ob.sstp_piel;data=piel.info(ob)
    layout.prop(p,'estilo',expand=True)
    box=layout.box();row=box.row();row.scale_y=1.5;row.prop(p,'proteger_labios',toggle=True,icon='CHECKBOX_HLT' if p.proteger_labios else 'CHECKBOX_DEHLT')
    box.prop(p,'labios_modo',expand=True)
    if p.labios_modo=='COLOR':box.prop(p,'labios_color',text='');box.prop(p,'labios_fuerza',slider=True)
    box.prop(p,'labios_borde',slider=True)
    origin={'textura':'Detectados en la textura','geometria':'Sin color en la textura: colocados según la boca','ninguno':'No se encontró la boca'}[data['labios']]
    box.label(text=origin,icon='INFO');box.prop(p,'labios_ver',toggle=True,icon='HIDE_OFF')
    box=layout.box();box.label(text='Color de piel',icon='COLOR')
    grid=box.grid_flow(columns=3,align=True)
    for name in piel.TONES:grid.operator('sstp.piel_tono',text=name).tono=name
    box.prop(p,'color',text='');box.prop(p,'subtono',slider=True);box.prop(p,'rubor',slider=True);box.prop(p,'rubor_color');box.prop(p,'textura',slider=True)
    box=layout.box();box.label(text='Dónde hay piel',icon='OUTLINER_OB_ARMATURE')
    for z in data['zonas']:box.prop(p,'zona_'+z)
    box.prop(p,'limpiar',icon='BRUSH_DATA');box.prop(p,'ocultar_pelo',icon='HIDE_ON')
    if data.get('cejas_unidas'):
        alert=layout.box();alert.alert=True
        alert.label(text='Cejas unidas a la malla',icon='ERROR')
        alert.label(text='Deben ser islas separadas.')
        alert.label(text='Quítalas a mano con mucho cuidado')
        alert.label(text='y pulsa Volver a detectar.')
    row=layout.row(align=True);row.operator('sstp.piel_iniciar',text='Volver a detectar',icon='FILE_REFRESH');row.operator('sstp.piel_quitar',icon='LOOP_BACK')


def draw_group(layout,p,names):
    for name in names:layout.prop(p,name,slider=not name.endswith(('_color','_rojo','_azul')))


def draw_start(layout):
    sub=layout.column();sub.scale_y=2;sub.operator('sstp.piel_iniciar',icon='VIEWZOOM')
    layout.label(text='No cambia la textura original.',icon='CHECKMARK')


def draw_panel(layout,context,prefix='SSTP_piel_'):
    ob=character(context)
    if not ob:layout.label(text='Selecciona un personaje',icon='INFO');return
    layout.label(text=ob.name.strip(),icon='OUTLINER_OB_MESH')
    if not piel.active(ob):draw_start(layout);return
    draw_general(layout,ob)
    for title,names in GROUPS:
        h,body=layout.panel(prefix+title,default_closed=False);h.label(text=title)
        if body:draw_group(body,ob.sstp_piel,names)


class SSTP_PT_piel(Panel):
    bl_label='Piel';bl_idname='SSTP_PT_piel';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='Piel'
    def draw(self,context):draw_panel(self.layout,context)


classes=(SSTP_Piel,SSTP_OT_piel_iniciar,SSTP_OT_piel_tono,SSTP_OT_piel_quitar,SSTP_OT_piel_hornear,SSTP_PT_piel)


def register():
    for c in classes:bpy.utils.register_class(c)
    bpy.types.Object.sstp_piel=PointerProperty(type=SSTP_Piel)


def unregister():
    del bpy.types.Object.sstp_piel
    for c in reversed(classes):bpy.utils.unregister_class(c)
