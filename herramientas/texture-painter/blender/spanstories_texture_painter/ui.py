import json
import math
import textwrap
from pathlib import Path
from types import SimpleNamespace

import bpy
import gpu
import numpy as np
import blf
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, CollectionProperty, EnumProperty, FloatProperty, FloatVectorProperty, IntProperty, PointerProperty, StringProperty
from bpy.types import Operator, Panel, PropertyGroup
from bpy_extras.io_utils import ImportHelper, ExportHelper
from bpy_extras import view3d_utils
from gpu_extras.batch import batch_for_shader
from mathutils import Vector, Matrix, Quaternion

from . import core, bridge, mouth_preview, surface_map

_draw=[]
_paint_selection={}
_keymaps=[]
_uv_batches={}
_uv_selection_batches={}
_buttons={}
_controller_running=False
_session_token=object()
_model_batches={}
_draw_errors={}
_draw_counts={'uv':0,'model':0}
_bound_target=None


def active_workspace():
    workspace=bpy.context.window.workspace if bpy.context.window else bpy.context.workspace
    return bool(workspace and workspace.name.startswith('SSTP'))


def role(area):
    if not active_workspace(): return None
    if area.type=='VIEW_3D': return 'MODEL'
    images=sorted([a for a in bpy.context.screen.areas if a.type=='IMAGE_EDITOR'],key=lambda a:a.x)
    if area in images: return 'REFERENCE' if area==images[0] else 'UV'
    return None


def guard(fn):
    def wrapped(self,context):
        try: return fn(self,context) or {'FINISHED'}
        except Exception as e: self.report({'ERROR'},str(e)); return {'CANCELLED'}
    return wrapped


def color_changed(cfg,context):
    paint=context.scene.tool_settings.image_paint
    brush=paint.brush
    if brush:
        brush.color=cfg.color[:3]; brush.strength=cfg.strength; brush.size=cfg.brush_size
    # Blender 5.x moved unified controls onto each Paint settings block.
    # Updating only Brush leaves enabled unified color/size overriding the UI.
    unified=getattr(paint,'unified_paint_settings',None)
    if unified is None:unified=getattr(context.scene.tool_settings,'unified_paint_settings',None)
    for flag,prop,value in (('use_unified_color','color',cfg.color[:3]),('use_unified_strength','strength',cfg.strength),('use_unified_size','size',cfg.brush_size)):
        if unified and getattr(unified,flag):setattr(unified,prop,value)
    core.redraw()


def reference_changed(cfg,context):
    core.sync_images(cfg.target); core.redraw()


def atlas_changed(cfg,context):
    core.sync_images(cfg.target); core.redraw()


def isolate_target(context, ob):
    """Restrict only the painter viewport; never hide scene objects globally."""
    if not active_workspace() or bpy.app.background: return
    for area in context.screen.areas:
        if area.type!='VIEW_3D': continue
        space=area.spaces.active
        if not space.local_view:
            selection=list(context.selected_objects); active=context.view_layer.objects.active
            try:
                for obj in selection: obj.select_set(False)
                ob.select_set(True); context.view_layer.objects.active=ob
                region=next(r for r in area.regions if r.type=='WINDOW')
                with context.temp_override(area=area,region=region):
                    bpy.ops.view3d.localview(frame_selected=False)
            finally:
                ob.select_set(False)
                for obj in selection: obj.select_set(True)
                context.view_layer.objects.active=active
        for obj in context.view_layer.objects:
            obj.local_view_set(space,obj==ob)


def target_changed(cfg,context):
    global _bound_target
    ob=cfg.target
    if ob and ob==_bound_target: return
    if not ob:
        mouth_preview.restore();core.sync_images(None);return
    try:
        if _bound_target and _bound_target.name in _paint_selection:
            end_paint(context,_bound_target)
        _bound_target=ob
        mouth_preview.sync(ob,active_workspace())
        if context.object and context.object.mode!='OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        isolate_target(context,ob)
        context.view_layer.objects.active=ob
        ob.select_set(True)
        _uv_batches.clear(); _model_batches.clear()
        core.sync_images(ob)
        if active_workspace(): frame_all()
        cfg.note='Personaje: '+ob.name+' · selecciona zonas y pinta en Malla o UV'
    except Exception as exc: cfg.note=str(exc)


def watch_target():
    context=bpy.context; ob=context.view_layer.objects.active; cfg=context.scene.sstp; editor=active_workspace()
    # Blender's own Back to Previous also ends the maximized view.
    if cfg.panels_hidden and context.window and not context.window.screen.name.endswith('-nonnormal'):
        cfg.panels_hidden=False
        if editor:simplify_screen()
    # Outside the editor, a switch must not pull the user out of Edit or Pose mode.
    if ob and ob.type=='MESH' and ob!=cfg.target and ob.data.uv_layers.active and (editor or ob.mode=='OBJECT'):
        old=cfg.target
        if old and old.name in _paint_selection: end_paint(context)
        cfg.target=ob
    if editor:
        mouth_preview.sync(cfg.target,True)
    else:
        mouth_preview.restore()
    return .4


def select_mode_changed(cfg,context):
    if cfg.select_mode=='FACE':
        cfg.show_faces=True; cfg.detail=True
    _model_batches.clear(); core.redraw()


def show_faces_changed(cfg,context):
    _model_batches.clear(); core.redraw()


class SSTP_Color(PropertyGroup):
    name:StringProperty(default='Color')
    color:FloatVectorProperty(size=4,subtype='COLOR',min=0,max=1,default=(.8,.1,.1,1))


class SSTP_Reference(PropertyGroup):
    name:StringProperty()
    image:PointerProperty(type=bpy.types.Image)


class SSTP_Settings(PropertyGroup):
    target:PointerProperty(type=bpy.types.Object,poll=lambda self,o:o.type=='MESH',update=target_changed)
    reference:PointerProperty(type=bpy.types.Image,update=reference_changed)
    references:CollectionProperty(type=SSTP_Reference)
    palette:CollectionProperty(type=SSTP_Color)
    color:FloatVectorProperty(name='Color',size=4,subtype='COLOR',min=0,max=1,default=(.8,.05,.05,1),update=color_changed)
    resolution:EnumProperty(name='Resolución',items=[(str(x),str(x)+' px','') for x in (1024,2048,4096)],default='1024')
    detail:BoolProperty(name='Líneas suaves',default=False)
    uv_texture:BoolProperty(name='Ver textura en las islas',default=False,update=atlas_changed)
    selecting:BoolProperty(default=False)
    select_mode:EnumProperty(name='Selección',items=[('ZONES','Zonas','Clic selecciona la zona UV completa'),('FACE','Caras','Clic selecciona una sola cara')],default='ZONES',update=select_mode_changed)
    panels_hidden:BoolProperty(name='Paneles minimizados',default=False)
    show_faces:BoolProperty(name='Ver caras (malla) en el modelo',default=False,update=show_faces_changed)
    picker:BoolProperty(name='Gotero',description='El siguiente clic en el modelo, la UV o la referencia toma ese color',default=False)
    picker_source:EnumProperty(name='Tomar de',items=[('ANY','Cualquiera','Modelo, textura UV o referencia, donde hagas clic'),('MODEL','Modelo','Solo el color que se ve en el personaje'),('UV','Textura UV','Solo el mapa de zonas'),('REFERENCE','Referencia','Solo la imagen de referencia')],default='ANY')
    group_name:StringProperty(name='Nombre',default='REGIÓN')
    layer_name:StringProperty(name='Nombre',default='Detalles')
    brush_size:IntProperty(name='Tamaño',default=30,min=1,max=500,update=color_changed)
    strength:FloatProperty(name='Intensidad',default=1,min=0,max=1,update=color_changed)
    tool:EnumProperty(items=[('SELECT','Seleccionar',''),('BRUSH','Pincel',''),('ERASE','Borrador','')],default='SELECT')
    paint_surface:EnumProperty(name='Pintar en',items=[('MODEL','Malla','Pincel sobre el personaje'),('UV','UV','Pincel sobre el mapa UV')],default='MODEL')
    note:StringProperty(default='Selecciona el personaje y abre el editor')
    show_piel:BoolProperty(name='Piel en el panel',description='Muestra los controles de Piel en este panel',default=False)
    click_count:IntProperty(default=0)


class SSTP_OT_workspace(Operator):
    bl_idname='sstp.workspace'; bl_label='Abrir Texture Painter'
    @guard
    def execute(self,context):
        cfg=context.scene.sstp
        if context.object and context.object.type=='MESH': cfg.target=context.object
        core.target()
        old=next((w for w in bpy.data.workspaces if w.name.startswith('SSTP')),None)
        if old:
            context.window.workspace=old
            mouth_preview.begin(cfg.target)
            if core.upgrade_preserved_bases(cfg.target):core.rebuild(cfg.target)
            simplify_screen();isolate_target(context,cfg.target);core.sync_images(cfg.target);return
        bpy.ops.workspace.duplicate()
        # Workspace duplication switches screen on the next UI cycle.
        def configure():
            window=bpy.context.window
            window.workspace.name='SSTP · Texture Painter'
            screen=window.screen; screen.name='SSTP · tres paneles'
            # Close the small Layout editors only inside the new workspace.
            # Blender joins each closed area to its neighbor.
            for _ in range(6):
                extras=[a for a in screen.areas if a.type!='VIEW_3D']
                if not extras: break
                a=min(extras,key=lambda a:a.width*a.height)
                try:
                    with bpy.context.temp_override(window=window,area=a): bpy.ops.screen.area_close()
                except RuntimeError: break
            main=max(screen.areas,key=lambda a:a.width*a.height)
            with bpy.context.temp_override(window=window,area=main): bpy.ops.screen.area_split(direction='VERTICAL',factor=.23)
            candidates=sorted([a for a in screen.areas if a.height>main.height*.75],key=lambda a:a.x)
            right=max(candidates,key=lambda a:a.width)
            with bpy.context.temp_override(window=window,area=right): bpy.ops.screen.area_split(direction='VERTICAL',factor=.49)
            # Area geometry is refreshed asynchronously after the split operator.
            def finish():
                areas=sorted([a for a in screen.areas if a.height>500],key=lambda a:a.x)
                if len(areas)<3: areas=sorted(screen.areas,key=lambda a:a.x)
                if len(areas)<3:
                    cfg.note='No se pudieron crear los tres paneles'; return None
                for a in areas[:2]:
                    a.type='IMAGE_EDITOR'; a.spaces.active.ui_mode='VIEW'; a.spaces.active.show_region_toolbar=False
                    a.spaces.active.show_region_ui=False
                areas[2].type='VIEW_3D'; v=areas[2].spaces.active
                v.show_region_toolbar=False; v.show_region_ui=False; v.overlay.show_overlays=False
                v.shading.type='MATERIAL'
                for r in areas[2].regions:
                    if r.type=='UI' and hasattr(r,'active_panel_category') and not r.is_property_readonly('active_panel_category'): r.active_panel_category='SpanStories'
                cfg.note='Clic: isla UV o personaje · Mayús: varias · Esc: salir de selección'
                mouth_preview.begin(cfg.target)
                core.sync_images(cfg.target)
                bpy.app.timers.register(lambda: (simplify_screen() or frame_all() or None),first_interval=.15)
                return None
            bpy.app.timers.register(finish,first_interval=.15)
            return None
        bpy.app.timers.register(configure,first_interval=.15)


def frame_all():
    cfg=bpy.context.scene.sstp
    for a in bpy.context.screen.areas:
        r=next((r for r in a.regions if r.type=='WINDOW'),None)
        if not r: continue
        try:
            with bpy.context.temp_override(area=a,region=r):
                if a.type=='IMAGE_EDITOR' and a.spaces.active.image: bpy.ops.image.view_all(fit_view=True)
                elif a.type=='VIEW_3D' and cfg.target:
                    # Frame from target bounds directly; keep object/rig selection intact.
                    ob=cfg.target; corners=[ob.matrix_world@Vector(c) for c in ob.bound_box]
                    center=sum(corners,Vector())/8; size=max((p-center).length for p in corners)
                    v=a.spaces.active.region_3d; hidden=cfg.panels_hidden # The lift only clears the bottom tool block.
                    v.view_location=center-Vector((0,0,0 if hidden else size*.22)); v.view_distance=max(.1,size*(3.2 if hidden else 2.05))
                    from mathutils import Quaternion
                    v.view_rotation=Quaternion((1,0,0),1.57079632679); v.view_perspective='ORTHO'
        except RuntimeError: pass


def sidebar(area):
    return next((r for r in area.regions if r.type=='UI'),None)


def sidebar_width(area):
    region=sidebar(area)
    return region.width if region and bpy.context.scene.sstp.panels_hidden and area.spaces.active.show_region_ui else 0


def over_sidebar(context,event):
    """The Piel panel sits inside the model view; its clicks are not model clicks."""
    if not context.scene.sstp.panels_hidden:return False
    for area in context.screen.areas:
        if area.type=='VIEW_3D':
            region=sidebar(area)
            return bool(region and region.x<=event.mouse_x<region.x+region.width and region.y<=event.mouse_y<region.y+region.height)
    return False


def finish_panels():
    """The maximized screen only exists after a redraw; the tab list too."""
    window=bpy.context.window_manager.windows[0];cfg=bpy.context.scene.sstp
    view=next((a for a in window.screen.areas if a.type=='VIEW_3D'),None)
    if view is None:return .1
    view.spaces.active.show_region_ui=cfg.panels_hidden
    if cfg.panels_hidden:
        try:sidebar(view).active_panel_category='Piel'
        except (TypeError,AttributeError):return .1
    # The window region takes its full size one redraw later than the screen.
    def frame():
        with bpy.context.temp_override(window=window,screen=window.screen):frame_all()
    bpy.app.timers.register(frame,first_interval=.3)
    return None


def set_panels(context,hidden):
    """Maximize the character over Referencia and Textura; both return untouched."""
    cfg=context.scene.sstp
    if hidden==cfg.panels_hidden:return
    view=next(a for a in context.screen.areas if a.type=='VIEW_3D')
    region=next(r for r in view.regions if r.type=='WINDOW')
    with context.temp_override(window=context.window,area=view,region=region):
        bpy.ops.screen.screen_full_area(use_hide_panels=False)
    cfg.panels_hidden=hidden
    bpy.app.timers.register(finish_panels,first_interval=.1)


def simplify_screen():
    keep=bpy.context.scene.sstp.panels_hidden
    for a in bpy.context.screen.areas:
        if role(a):
            v=a.spaces.active
            for prop in ('show_region_header','show_region_tool_header','show_region_toolbar','show_region_ui','show_region_asset_shelf','show_region_hud'):
                if prop=='show_region_ui' and keep and a.type=='VIEW_3D':continue
                if hasattr(v,prop) and not v.is_property_readonly(prop):setattr(v,prop,False)
            if a.type=='VIEW_3D':
                # Keep facial/rig manipulators from receiving selection clicks.
                # This is viewport-local; other workspaces retain their controls.
                v.show_gizmo=False
                for prop in ('show_object_viewport_armature','show_object_viewport_empty','show_object_viewport_light','show_object_viewport_camera'):
                    if hasattr(v,prop):setattr(v,prop,False)
    core.redraw()


VIEW_ANGLE=math.radians(15)


def view_step(action):
    """Move/rotate the painter's 3D view: raise, lower and turn the model on every axis."""
    area=next((a for a in bpy.context.screen.areas if a.type=='VIEW_3D'),None)
    if not area: return
    r3d=area.spaces.active.region_3d; rot=r3d.view_rotation.copy(); a=VIEW_ANGLE
    if action in ('SUBE','BAJA'):
        up=rot@Vector((0,1,0)); d=r3d.view_distance*.07
        r3d.view_location=r3d.view_location+up*(-d if action=='SUBE' else d)
    elif action in ('GIRO_M','GIRO_P'):      # vuelta sobre el eje vertical Z
        r3d.view_rotation=Quaternion((0,0,1),a if action=='GIRO_P' else -a)@rot
    elif action in ('INCL_M','INCL_P'):      # inclinar hacia delante/atrás (eje X de la pantalla)
        r3d.view_rotation=rot@Quaternion((1,0,0),a if action=='INCL_P' else -a)
    elif action in ('RODAR_M','RODAR_P'):    # rodar sobre el eje de la mirada (Y del modelo)
        r3d.view_rotation=rot@Quaternion((0,0,1),a if action=='RODAR_P' else -a)
    else:
        front=Quaternion((1,0,0),math.pi/2)
        presets={'FRENTE':front,'ATRAS':Quaternion((0,0,1),math.pi)@front,'IZQ':Quaternion((0,0,1),-math.pi/2)@front,'DER':Quaternion((0,0,1),math.pi/2)@front,'ARRIBA':Quaternion((1,0,0),0),'ABAJO':Quaternion((1,0,0),math.pi)}
        if action not in presets: return
        r3d.view_rotation=presets[action]
    core.redraw()


class SSTP_OT_view(Operator):
    bl_idname='sstp.view'; bl_label='Mover / girar el modelo'
    action:StringProperty()
    def execute(self,context): view_step(self.action); return {'FINISHED'}


class SSTP_OT_picker(Operator):
    bl_idname='sstp.picker'; bl_label='Gotero'
    bl_description='Activa el gotero: el siguiente clic en el modelo, la UV o la referencia toma ese color'
    def execute(self,context):
        cfg=context.scene.sstp; cfg.picker=not cfg.picker
        cfg.note='Gotero activo: haz clic en el modelo, la UV o la referencia' if cfg.picker else 'Gotero desactivado'
        return {'FINISHED'}


class SSTP_OT_frame(Operator):
    bl_idname='sstp.frame'; bl_label='Encuadrar paneles'
    def execute(self,context): frame_all(); return {'FINISHED'}


class SSTP_OT_prepare(Operator):
    bl_idname='sstp.prepare'; bl_label='Preparar texturas protegidas'
    @guard
    def execute(self,context):
        info=core.prepare(resolution=int(context.scene.sstp.resolution)); context.scene.sstp.note='Texturas listas; originales protegidos'; self.report({'INFO'},str(info))


class SSTP_OT_reference(Operator,ImportHelper):
    bl_idname='sstp.reference'; bl_label='Cargar referencia'; filter_glob:StringProperty(default='*.png;*.jpg;*.jpeg',options={'HIDDEN'})
    @guard
    def execute(self,context): core.import_reference(self.filepath); frame_all()


class SSTP_OT_palette(Operator):
    bl_idname='sstp.palette'; bl_label='Extraer colores'
    @guard
    def execute(self,context): core.extract_palette()


class SSTP_OT_color(Operator):
    bl_idname='sstp.color'; bl_label='Usar color'
    index:IntProperty()
    def execute(self,context): context.scene.sstp.color=context.scene.sstp.palette[self.index].color; return {'FINISHED'}


class SSTP_OT_remember_color(Operator):
    bl_idname='sstp.remember_color'; bl_label='Guardar color actual'
    def execute(self,context):
        p=context.scene.sstp.palette.add(); p.name='Color '+str(len(context.scene.sstp.palette)); p.color=context.scene.sstp.color
        return {'FINISHED'}


class SSTP_OT_fill(Operator):
    bl_idname='sstp.fill'; bl_label='Aplicar color'; bl_options={'REGISTER'}
    erase:BoolProperty(default=False); allow_overlap:BoolProperty(name='Acepto pintar las superficies que comparten UV',default=False)
    def invoke(self,context,event):
        try:
            return self.execute(context)
        except Exception as e: self.report({'ERROR'},str(e)); return {'CANCELLED'}
    def draw(self,context):
        self.layout.label(text='Hay otras superficies con las mismas UV',icon='ERROR'); self.layout.prop(self,'allow_overlap')
    @guard
    def execute(self,context):
        ob=core.target();cfg=context.scene.sstp
        exact=cfg.select_mode=='FACE'
        faces=core.faces_of(core.geometry(ob),core.selected(ob));s=core.state(ob)
        # Existing face fills are composed above texture pixels. Recolor those
        # faces with another exact fill, rather than writing invisible pixels.
        exact=exact or any((not self.erase or op['layer']==s['active_layer']) and faces.intersection(op['faces']) for op in s.get('exact_fills',[]))
        result=core.fill(cfg.color,erase=self.erase,exclusive=True,exact_faces=exact,shared_fallback=not self.erase)
        core.sync_images(core.target())
        context.scene.sstp.note=(str(result['faces'])+' caras rellenadas · límite exacto · GLB directo' if result.get('exact_faces') else str(result['pixels'])+' píxeles pintados · '+str(result['protected_shared_pixels'])+' compartidos protegidos')


class SSTP_OT_history(Operator):
    bl_idname='sstp.history'; bl_label='Deshacer relleno'
    redo:BoolProperty(default=False)
    @guard
    def execute(self,context): core.history_step(self.redo); core.sync_images(core.target())


class SSTP_OT_group(Operator):
    bl_idname='sstp.group'; bl_label='Guardar grupo'
    name:StringProperty(); recall:BoolProperty(default=False)
    @guard
    def execute(self,context):
        if self.recall: core.select_group(self.name)
        else: core.save_group(context.scene.sstp.group_name)


class SSTP_OT_layer(Operator):
    bl_idname='sstp.layer'; bl_label='Capa'
    index:IntProperty(default=-1); toggle:BoolProperty(default=False)
    @guard
    def execute(self,context):
        if self.index<0: core.add_layer(context.scene.sstp.layer_name)
        else:
            ob=core.target(); l=core.state(ob)['layers'][self.index]
            core.set_layer(self.index,visible=not l['visible'] if self.toggle else None)


class SSTP_OT_layer_edit(Operator):
    bl_idname='sstp.layer_edit'; bl_label='Editar capa'
    index:IntProperty(); name:StringProperty(name='Nombre'); opacity:FloatProperty(name='Opacidad',default=1,min=0,max=1)
    def invoke(self,context,event):
        l=core.state(core.target())['layers'][self.index]; self.name=l['name']; self.opacity=l['opacity']
        return context.window_manager.invoke_props_dialog(self)
    @guard
    def execute(self,context): core.set_layer(self.index,name=self.name,opacity=self.opacity)


def refresh_native_paint(object_override=None):
    ob=object_override or bpy.context.scene.sstp.target
    if not ob or ob.name not in _paint_selection:return None
    saved=_paint_selection[ob.name];s=core.state(ob)
    for name,before in saved.get('images',[]):
        im=bpy.data.images.get(name)
        if not im:continue
        data=core.pixels(im)
        if np.array_equal(data,before):continue
        slot=next(k for k,v in s['layers'][s['active_layer']]['images'].items() if v==name)
        core.write_pixels(im,core.native_paint_pixels(ob,slot,data,before,saved.get('ids',core.selected(ob))))
    core.sync_images(ob);core.redraw()
    return None


def end_paint(context,object_override=None):
    ob=object_override or context.scene.sstp.target
    if ob and ob.mode=='TEXTURE_PAINT':
        bpy.ops.object.mode_set(mode='OBJECT')
    if ob and ob.name in _paint_selection:
        refresh_native_paint(ob)
        saved=_paint_selection.pop(ob.name)
        for p,value in zip(ob.data.polygons,saved['faces']): p.select=value
        ob.data.use_paint_mask=saved['mask']
        changed=[]
        for name,before in saved.get('images',[]):
            im=bpy.data.images.get(name)
            if im and not np.array_equal(core.pixels(im),before):
                slot=next(k for k,v in core.state(ob)['layers'][core.state(ob)['active_layer']]['images'].items() if v==name)
                core.write_pixels(im,core.paint_padding(ob,slot,core.pixels(im)))
                changed.append((name,before))
        if 'seam_bleed' in saved:context.scene.tool_settings.image_paint.seam_bleed=saved['seam_bleed']
        if changed:
            h=core._history.setdefault(ob.name,{'undo':[],'redo':[]});h['undo'].append(changed);h['redo'].clear()
    context.scene.sstp.tool='SELECT'
    if ob: core.sync_images(ob)


class SSTP_OT_pick(Operator):
    bl_idname='sstp.pick'; bl_label='Seleccionar regiones'
    def execute(self,context):
        try: end_paint(context); core.target()
        except Exception as e: self.report({'ERROR'},str(e)); return {'CANCELLED'}
        for a in context.screen.areas:
            if role(a)=='UV': a.spaces.active.ui_mode='VIEW'
        core.sync_images(core.target()); return {'FINISHED'}


def model_hit(context,area,region,xy):
    ob=core.target(); rv3d=area.spaces.active.region_3d
    origin=view3d_utils.region_2d_to_origin_3d(region,rv3d,xy); direction=view3d_utils.region_2d_to_vector_3d(region,rv3d,xy)
    evaluated,mapping=surface_map.evaluated_surface(ob,context.evaluated_depsgraph_get())
    inv=evaluated.matrix_world.inverted(); local=inv@origin; vector=inv.to_3x3()@direction
    hit,location,normal,face=evaluated.ray_cast(local,vector)
    source_face=int(mapping[face]) if hit else -1
    if hit and source_face<0:raise ValueError('Esta superficie fue generada por un modificador y no conserva una cara UV original')
    return evaluated,hit,location,source_face,face


def pick_model_color(context,area,region,xy):
    """Eyedropper on the character: the color the viewer sees under the cursor."""
    from mathutils.interpolate import poly_3d_calc
    evaluated,hit,location,face,visible_face=model_hit(context,area,region,xy)
    cfg=context.scene.sstp
    if not hit:
        cfg.note='El gotero no tocó el personaje'; return
    mesh=evaluated.data; polygon=mesh.polygons[visible_face]
    pts=[mesh.vertices[v].co.copy() for v in polygon.vertices]
    weights=np.asarray(poly_3d_calc(pts,location))
    uv=np.asarray([mesh.uv_layers.active.data[i].uv[:] for i in polygon.loop_indices])
    color=core.sample_surface(face,None,uv_point=(uv*weights[:,None]).sum(0))
    cfg.note='Color tomado del modelo (cara '+str(face)+')'
    return color


class SSTP_OT_click(Operator):
    bl_idname='sstp.click'; bl_label='Seleccionar isla UV / región 3D'
    @classmethod
    def poll(cls,context):
        return active_workspace() and context.region and context.region.type=='WINDOW' and role(context.area) in ('UV','MODEL','REFERENCE')
    def invoke(self,context,event):
        area=context.area; region=context.region
        r=role(area); xy=(event.mouse_x-region.x,event.mouse_y-region.y)
        try:
            for rect,action in _buttons.get(area.as_pointer(),[]):
                if rect[0]<=xy[0]<=rect[0]+rect[2] and rect[1]<=xy[1]<=rect[1]+rect[3]:
                    run_action(action,context); return {'FINISHED'}
            cfg=context.scene.sstp
            if cfg.picker and not event.alt and cfg.picker_source not in ('ANY',r):
                cfg.note='Gotero en «'+cfg.bl_rna.properties['picker_source'].enum_items[cfg.picker_source].name+'»: haz clic ahí, o cámbialo en el menú del gotero'
                return {'FINISHED'}
            if (cfg.picker or event.alt) and r in ('MODEL','UV'):
                if r=='MODEL': pick_model_color(context,area,region,xy)
                else:
                    u,v=region.view2d.region_to_view(*xy)
                    if 0<=u<=1 and 0<=v<=1: core.sample_uv_color(u,v); cfg.note='Color tomado de la textura UV'
                cfg.picker=False; return {'FINISHED'}
            if context.scene.sstp.tool!='SELECT' and r=='UV':
                if context.scene.sstp.paint_surface!='UV': return {'FINISHED'}
                if not event.shift:return {'FINISHED'}
                return bpy.ops.sstp.stroke('INVOKE_DEFAULT')
            if context.scene.sstp.tool!='SELECT' and r=='MODEL':
                if context.scene.sstp.paint_surface=='MODEL' and event.shift:
                    return start_native_stroke(context)
                return {'FINISHED'}
            if r=='REFERENCE':
                u,v=region.view2d.region_to_view(*xy); core.sample_reference(u,v); cfg.picker=False; return {'FINISHED'}
            if r=='UV':
                u,v=region.view2d.region_to_view(*xy); ids=core.pick_uv_face(u,v) if cfg.select_mode=='FACE' else core.pick_uv(u,v)
                if ids:
                    if cfg.select_mode=='FACE' and getattr(event,'ctrl',False):
                        core.select_face_path(int(ids[0][5:]))
                    else:core.select_regions(ids,extend=event.shift)
                elif not event.shift and not getattr(event,'ctrl',False): core.select_regions([])
                context.scene.sstp.click_count+=1
                context.scene.sstp.note='UV a modelo: '+str(len(core.selected(core.target())))+(' caras' if cfg.select_mode=='FACE' else ' islas')
                return {'FINISHED'}
            if r=='MODEL':
                evaluated,hit,location,face,visible_face=model_hit(context,area,region,xy)
                if hit:
                    core.select_face(face,extend=event.shift,as_face=cfg.select_mode=='FACE',path=getattr(event,'ctrl',False))
                    context.scene.sstp.click_count+=1;context.scene.sstp.note='Modelo a UV: cara '+str(face)
                elif not event.shift and not getattr(event,'ctrl',False):core.select_regions([])
                return {'FINISHED'}
        except Exception as e: self.report({'WARNING'},str(e))
        return {'CANCELLED'}


VIEW_KEYS={'UP_ARROW':('SUBE','INCL_P'),'DOWN_ARROW':('BAJA','INCL_M'),'LEFT_ARROW':('GIRO_M','RODAR_M'),'RIGHT_ARROW':('GIRO_P','RODAR_P'),'HOME':('FRENTE','FRENTE')}


def start_native_stroke(context):
    """Shift is our paint modifier, never Blender's temporary Smooth brush."""
    color_changed(context.scene.sstp,context)
    result=bpy.ops.paint.image_paint('INVOKE_DEFAULT',mode='NORMAL',brush_toggle='None')
    if not bpy.app.timers.is_registered(finish_native_stroke):
        bpy.app.timers.register(finish_native_stroke,first_interval=.1)
    return {'FINISHED'} if result=={'RUNNING_MODAL'} else result


def finish_native_stroke():
    if any(op.bl_idname=='PAINT_OT_image_paint' for w in bpy.context.window_manager.windows for op in w.modal_operators):return .1
    refresh_native_paint();return None


def turntable_rotation(rotation, dx, dy):
    """Orbit about world Z and camera X without accumulating camera roll."""
    back=rotation@Vector((0,0,1))
    if math.hypot(back.x,back.y)>1e-6:
        yaw=math.atan2(back.x,-back.y)
    else:
        right=rotation@Vector((1,0,0));yaw=math.atan2(right.y,right.x)
    pitch=math.acos(max(-1.0,min(1.0,back.z)))
    pitch=max(.001,min(math.pi-.001,pitch+dy*.007))
    return (Quaternion((0,0,1),yaw-dx*.007)@Quaternion((1,0,0),pitch)).normalized()


def drag_view(area, dx, dy, pan=False):
    """Viewport only: upright orbit or screen-plane translation."""
    if area.type=='IMAGE_EDITOR':
        region=next(r for r in area.regions if r.type=='WINDOW')
        with bpy.context.temp_override(area=area,region=region):
            bpy.ops.image.view_pan(offset=(-dx,-dy))
        area.tag_redraw();return
    view=area.spaces.active.region_3d
    rot=view.view_rotation.copy()
    if pan:
        region=next(r for r in area.regions if r.type=='WINDOW')
        depth=view3d_utils.region_2d_to_location_3d(region,view,(region.width/2,region.height/2),view.view_location)
        moved=view3d_utils.region_2d_to_location_3d(region,view,(region.width/2+dx,region.height/2+dy),view.view_location)
        view.view_location-=moved-depth
    else:
        view.view_rotation=turntable_rotation(rot,dx,dy)
    area.tag_redraw()


def axis_handles(view, width, height):
    """Six depth-sorted axis endpoints, projected from the current view rotation."""
    inv=view.view_rotation.inverted(); result=[]
    for label,axis,color,positive,negative in (
        ('X',(1,0,0),(.95,.22,.3,1),'DER','IZQ'),
        ('Y',(0,1,0),(.65,.88,.15,1),'ATRAS','FRENTE'),
        ('Z',(0,0,1),(.2,.63,1,1),'ARRIBA','ABAJO')):
        for sign,action in ((-1,negative),(1,positive)):
            p=inv@Vector(axis)*sign
            result.append((p.z,width-70+p.x*42,height-112+p.y*42,label if sign>0 else '',color,action))
    return sorted(result,key=lambda item:item[0])


class SSTP_OT_controller(Operator):
    bl_idname='sstp.controller';bl_label='Interacción Texture Painter'
    def invoke(self,context,event):
        global _controller_running
        if _controller_running:return {'CANCELLED'}
        self.token=_session_token;_controller_running=True
        context.window_manager.modal_handler_add(self);return {'RUNNING_MODAL'}
    def modal(self,context,event):
        if self.token is not _session_token:return {'FINISHED'}
        drag=getattr(self,'view_drag',None)
        # A release may be consumed by another modal add-on or lost outside the
        # window. A fresh press must always start a fresh interaction.
        if drag and event.type in ('LEFTMOUSE','RIGHTMOUSE') and event.value=='PRESS':
            self.view_drag=None;drag=None
        if not drag and active_workspace() and over_sidebar(context,event):return {'PASS_THROUGH'}
        if drag:
            area,region,button,last,rotation,location=drag[:6]
            pending=drag[6] if len(drag)>6 else None
            if event.type=='ESC' or not active_workspace() or event.type=='WINDOW_DEACTIVATE':
                if area.type=='IMAGE_EDITOR':drag_view(area,-location[0],-location[1],True)
                else:
                    area.spaces.active.region_3d.view_rotation=rotation
                    area.spaces.active.region_3d.view_location=location
                self.view_drag=None;area.tag_redraw();return {'RUNNING_MODAL'}
            if event.type==button and event.value in ('RELEASE','CLICK'):
                self.view_drag=None
                if pending and not pending['moved'] and context.scene.sstp.tool=='SELECT':
                    click=SimpleNamespace(mouse_x=pending['start'][0],mouse_y=pending['start'][1],shift=pending['shift'],ctrl=pending.get('ctrl',False),alt=False)
                    with context.temp_override(area=area,region=region):
                        SSTP_OT_click.invoke(self,context,click)
                return {'RUNNING_MODAL'}
            if event.type=='MOUSEMOVE':
                if pending and not pending['moved']:
                    if math.hypot(event.mouse_x-pending['start'][0],event.mouse_y-pending['start'][1])<4:return {'RUNNING_MODAL'}
                    pending['moved']=True
                dx=event.mouse_x-last[0];dy=event.mouse_y-last[1]
                drag_view(area,dx,dy,button=='RIGHTMOUSE')
                if area.type=='IMAGE_EDITOR':location[0]+=dx;location[1]+=dy
                drag[3]=(event.mouse_x,event.mouse_y)
            return {'RUNNING_MODAL'}
        if active_workspace() and event.type in ('LEFTMOUSE','RIGHTMOUSE') and event.value=='PRESS':
            area=next((a for a in context.screen.areas if (a.type=='VIEW_3D' or (event.type=='RIGHTMOUSE' and a.type=='IMAGE_EDITOR')) and a.x<=event.mouse_x<a.x+a.width and a.y<=event.mouse_y<a.y+a.height),None)
            region=next((r for r in area.regions if r.type=='WINDOW' and r.x<=event.mouse_x<r.x+r.width and r.y<=event.mouse_y<r.y+r.height),None) if area else None
            if region:
                xy=(event.mouse_x-region.x,event.mouse_y-region.y)
                hud=any(x<=xy[0]<=x+w and y<=xy[1]<=y+h for (x,y,w,h),action in _buttons.get(area.as_pointer(),[]))
                if not hud and (event.type=='RIGHTMOUSE' or (not event.shift and not event.alt and not context.scene.sstp.picker)):
                    # Decorative HUD background must never leak clicks into native paint.
                    bottom=(0 if context.scene.sstp.panels_hidden else 316) if area.type=='VIEW_3D' else (112 if role(area)=='REFERENCE' else 39)
                    if xy[1]<bottom or xy[1]>region.height-46:return {'RUNNING_MODAL'}
                    view=area.spaces.active.region_3d if area.type=='VIEW_3D' else None
                    pending={'start':(event.mouse_x,event.mouse_y),'shift':event.shift,'ctrl':getattr(event,'ctrl',False),'moved':False} if event.type=='LEFTMOUSE' else None
                    self.view_drag=[area,region,event.type,(event.mouse_x,event.mouse_y),view.view_rotation.copy() if view else None,view.view_location.copy() if view else [0,0],pending]
                    return {'RUNNING_MODAL'}
                if event.type=='RIGHTMOUSE':return {'RUNNING_MODAL'}
        if active_workspace() and event.value=='PRESS' and event.type in VIEW_KEYS:
            area=next((a for a in context.screen.areas if a.type=='VIEW_3D' and a.x<=event.mouse_x<a.x+a.width and a.y<=event.mouse_y<a.y+a.height),None)
            if area:
                view_step(VIEW_KEYS[event.type][1 if event.shift else 0]); return {'RUNNING_MODAL'}
        if not active_workspace() or event.type!='LEFTMOUSE':return {'PASS_THROUGH'}
        area=next((a for a in context.screen.areas if a.x<=event.mouse_x<a.x+a.width and a.y<=event.mouse_y<a.y+a.height),None)
        if not area or not role(area):return {'PASS_THROUGH'}
        region=next((r for r in area.regions if r.type=='WINDOW' and r.x<=event.mouse_x<r.x+r.width and r.y<=event.mouse_y<r.y+r.height),None)
        if not region:return {'PASS_THROUGH'}
        if event.value!='PRESS':
            if event.value=='RELEASE' and role(area)=='MODEL' and context.scene.sstp.tool in ('BRUSH','ERASE'):
                if not bpy.app.timers.is_registered(refresh_native_paint):
                    bpy.app.timers.register(refresh_native_paint,first_interval=.01)
            # Do not leak generated CLICK/RELEASE events to native tools after
            # consuming their press; the native painting mode keeps its events.
            return {'RUNNING_MODAL'} if context.scene.sstp.tool=='SELECT' else {'PASS_THROUGH'}
        with context.temp_override(area=area,region=region):
            outcome=SSTP_OT_click.invoke(self,context,event)
        return {'PASS_THROUGH'} if outcome=={'PASS_THROUGH'} else {'RUNNING_MODAL'}
    def cancel(self,context):
        global _controller_running
        if self.token is _session_token:_controller_running=False


def start_controller():
    if _controller_running:return None
    if not active_workspace():return .5
    simplify_screen()
    ob=bpy.context.scene.sstp.target
    if ob:
        isolate_target(bpy.context,ob);core.sync_images(ob)
    if ob and (core.upgrade_preserved_bases(ob) | core.upgrade_paint_padding(ob)):core.rebuild(ob)
    context=bpy.context
    area=next((a for a in context.screen.areas if a.type=='VIEW_3D'),None)
    if not area:return .5
    region=next((r for r in area.regions if r.type=='WINDOW'),None)
    with context.temp_override(window=context.window,area=area,region=region):bpy.ops.sstp.controller('INVOKE_DEFAULT')
    return None


@persistent
def restore_after_load(_):
    global _controller_running,_session_token,_bound_target
    _bound_target=None
    _controller_running=False;_session_token=object()
    _uv_batches.clear();_model_batches.clear();_paint_selection.clear()
    core.clear_runtime_caches();core._history.clear();surface_map.clear_runtime_caches()
    cfg=bpy.context.scene.sstp
    if cfg.target and core.state(cfg.target).get('slots'):
        if core.upgrade_preserved_bases(cfg.target) | core.upgrade_paint_padding(cfg.target):core.rebuild(cfg.target)
    if active_workspace():simplify_screen()
    if not bpy.app.background and not bpy.app.timers.is_registered(start_controller):
        bpy.app.timers.register(start_controller,first_interval=.25)


class SSTP_OT_brush(Operator):
    bl_idname='sstp.brush'; bl_label='Pincel 2D / 3D'
    erase:BoolProperty(default=False); allow_overlap:BoolProperty(name='Acepto superficies que comparten UV',default=False)
    def invoke(self,context,event):
        try:
            return self.execute(context)
        except Exception as e: self.report({'ERROR'},str(e)); return {'CANCELLED'}
    @guard
    def execute(self,context):
        ob=core.target(); s=core.state(ob)
        if not s.get('slots'): raise ValueError('Prepara las texturas primero')
        if not core.selected(ob): raise ValueError('Selecciona las regiones que protegerán el pincel')
        g=core.geometry(ob)
        if not any(core.exclusive_mask(ob,core.selected(ob),slot,s['resolution']).any() for slot in {core.island_of(g,i)['material'] for i in core.selected(ob)}):
            raise ValueError('Toda la selección comparte píxeles; no se pintó nada')
        if ob.mode=='TEXTURE_PAINT': end_paint(context)
        cfg=context.scene.sstp
        if cfg.paint_surface=='UV':
            cfg.tool='ERASE' if self.erase else 'BRUSH'; cfg.uv_texture=True
            core.sync_images(ob); cfg.note='Pinta en el mapa UV · Esc vuelve a seleccionar'
            return
        for o in context.selected_objects: o.select_set(False)
        ob.select_set(True); context.view_layer.objects.active=ob
        _paint_selection[ob.name]={'faces':[p.select for p in ob.data.polygons],'mask':ob.data.use_paint_mask,'ids':list(core.selected(ob)),'seam_bleed':context.scene.tool_settings.image_paint.seam_bleed,'images':[(name,core.pixels(bpy.data.images[name]).copy()) for name in s['layers'][s['active_layer']]['images'].values()]}
        # The native brush supplies its live gutter; our safe gutter is rebuilt
        # on completion. Face selection protects unselected surface texels.
        context.scene.tool_settings.image_paint.seam_bleed=core.MARGIN
        g=core.geometry(ob); faces=core.faces_of(g,core.selected(ob))
        for p in ob.data.polygons: p.select=p.index in faces
        ob.data.use_paint_mask=True
        bpy.ops.object.mode_set(mode='TEXTURE_PAINT')
        # Load an existing native Blender texture brush; no custom painting engine.
        view=next((a for a in context.screen.areas if a.type=='VIEW_3D'),None)
        region=next(r for r in view.regions if r.type=='WINDOW')
        with context.temp_override(area=view,region=region):
            if not context.scene.tool_settings.image_paint.brush:
                bpy.ops.brush.asset_activate(asset_library_type='ESSENTIALS',relative_asset_identifier='brushes/essentials_brushes-mesh_texture.blend/Brush/Paint Hard')
        brush=context.scene.tool_settings.image_paint.brush
        if not brush: raise RuntimeError('No se pudo activar el pincel nativo')
        brush.blend='ERASE_ALPHA' if self.erase else 'MIX'
        cfg=context.scene.sstp; cfg.tool='ERASE' if self.erase else 'BRUSH'; color_changed(cfg,context)
        cfg.uv_texture=True
        for a in context.screen.areas:
            if role(a)=='UV': a.spaces.active.ui_mode='VIEW'
        core.sync_images(ob)
        cfg.note='Pincel limitado a las regiones elegidas en UV y 3D'


class SSTP_OT_stroke(Operator):
    bl_idname='sstp.stroke'; bl_label='Pintar sobre atlas UV'
    def invoke(self,context,event):
        try:
            self.stroke=core.begin_stroke(core.target(),exclusive=True); self.last=None; self.region=context.region
            self.dab(context,event); context.window_manager.modal_handler_add(self)
            return {'RUNNING_MODAL'}
        except Exception as e:self.report({'WARNING'},str(e));return {'CANCELLED'}
    def dab(self,context,event):
        cfg=context.scene.sstp; p=self.region.view2d.region_to_view(event.mouse_x-self.region.x,event.mouse_y-self.region.y)
        radius=cfg.brush_size
        if self.last:
            distance=(((p[0]-self.last[0])**2+(p[1]-self.last[1])**2)**.5)*self.stroke['size']; steps=max(1,int(distance/max(1,radius/3)))
            for i in range(1,steps+1):
                t=i/steps; core.stroke_dab(self.stroke,self.last[0]+(p[0]-self.last[0])*t,self.last[1]+(p[1]-self.last[1])*t,cfg.color,radius,cfg.strength,cfg.tool=='ERASE')
        else:core.stroke_dab(self.stroke,p[0],p[1],cfg.color,radius,cfg.strength,cfg.tool=='ERASE')
        self.last=p
        for item in self.stroke['buffers']: core.write_pixels(item['image'],core.paint_padding(self.stroke['object'],item['slot'],item['data']))
        core.sync_images(self.stroke['object']);core.redraw()
    def modal(self,context,event):
        if event.type=='ESC':
            for item in self.stroke['buffers']:core.write_pixels(item['image'],item['before'])
            core.sync_images(self.stroke['object']);return {'CANCELLED'}
        if event.type=='LEFTMOUSE' and event.value=='RELEASE':core.finish_stroke(self.stroke);return {'FINISHED'}
        if event.type=='MOUSEMOVE':self.dab(context,event)
        return {'RUNNING_MODAL'}


class SSTP_OT_layers_dialog(Operator):
    bl_idname='sstp.layers_dialog'; bl_label='Capas de pintura'
    def invoke(self,context,event):return context.window_manager.invoke_props_dialog(self,width=360)
    def execute(self,context):return {'FINISHED'}
    def draw(self,context):
        s=core.state(core.target());cfg=context.scene.sstp
        for i,l in enumerate(s.get('layers',[])):
            row=self.layout.row(align=True);op=row.operator('sstp.layer',text='',icon='HIDE_OFF' if l['visible'] else 'HIDE_ON');op.index=i;op.toggle=True
            row.operator('sstp.layer',text=l['name'],depress=i==s['active_layer']).index=i
            row.operator('sstp.layer_edit',text='',icon='PREFERENCES').index=i
        row=self.layout.row(align=True);row.prop(cfg,'layer_name',text='');row.operator('sstp.layer',text='',icon='ADD')


class SSTP_OT_groups_dialog(Operator):
    bl_idname='sstp.groups_dialog'; bl_label='Mis regiones'
    def invoke(self,context,event):return context.window_manager.invoke_props_dialog(self,width=340)
    def execute(self,context):return {'FINISHED'}
    def draw(self,context):
        cfg=context.scene.sstp;s=core.state(core.target())
        row=self.layout.row(align=True);row.prop(cfg,'group_name',text='');row.operator('sstp.group',text='Guardar')
        for name in s.get('groups',{}):
            op=self.layout.operator('sstp.group',text=name);op.name=name;op.recall=True


class SSTP_OT_color_dialog(Operator):
    bl_idname='sstp.color_dialog'; bl_label='Color del pincel'
    def invoke(self,context,event):return context.window_manager.invoke_props_dialog(self,width=320)
    def execute(self,context):return {'FINISHED'}
    def draw(self,context):
        cfg=context.scene.sstp
        self.layout.template_color_picker(cfg,'color',value_slider=True)
        self.layout.prop(cfg,'color',text='');self.layout.prop(cfg,'brush_size');self.layout.prop(cfg,'strength');self.layout.operator('sstp.remember_color')
        for p in cfg.palette:
            row=self.layout.row(align=True);row.prop(p,'color',text='');row.prop(p,'name',text='')


class SSTP_OT_png(Operator):
    bl_idname='sstp.export_png'; bl_label='Exportar PNG para Three.js'
    directory:StringProperty(subtype='DIR_PATH')
    def invoke(self,context,event): context.window_manager.fileselect_add(self); return {'RUNNING_MODAL'}
    @guard
    def execute(self,context):
        end_paint(context); result=core.export_png(self.directory,resolution=int(context.scene.sstp.resolution)); self.report({'INFO'},'PNG y manifiesto exportados')


class SSTP_OT_glb(Operator,ExportHelper):
    bl_idname='sstp.export_glb'; bl_label='Exportar GLB para Three.js'
    filename_ext='.glb'; filter_glob:StringProperty(default='*.glb',options={'HIDDEN'})
    @guard
    def execute(self,context): end_paint(context); core.export_glb(self.filepath); self.report({'INFO'},'GLB con Base Color combinado exportado')


class SSTP_OT_pack(Operator):
    bl_idname='sstp.pack'; bl_label='Empaquetar y guardar .blend'
    def invoke(self,context,event): return context.window_manager.invoke_confirm(self,event)
    @guard
    def execute(self,context):
        end_paint(context); core.pack_project()
        if not bpy.data.filepath: return bpy.ops.wm.save_as_mainfile('INVOKE_DEFAULT')
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)


class SSTP_OT_restore(Operator):
    bl_idname='sstp.restore'; bl_label='Ver originales'
    resume:BoolProperty(default=False)
    @guard
    def execute(self,context):
        end_paint(context)
        if self.resume: core.resume()
        else: core.restore_originals()


class SSTP_OT_bridge(Operator):
    bl_idname='sstp.bridge'; bl_label='Conectar Codex'
    @guard
    def execute(self,context):
        info=bridge.stop() if bridge.running() else bridge.start(); self.report({'INFO'},'Codex conectado' if info['running'] else 'Puente detenido')


class SSTP_OT_import_glb(Operator,ImportHelper):
    bl_idname='sstp.import_glb'; bl_label='Importar personaje GLB'
    filter_glob:StringProperty(default='*.glb;*.gltf',options={'HIDDEN'})
    @guard
    def execute(self,context):
        bpy.ops.import_scene.gltf(filepath=self.filepath)
        mesh=next((o for o in context.selected_objects if o.type=='MESH' and o.data.uv_layers.active),None)
        if not mesh: raise ValueError('El archivo no contiene una malla con UV')
        context.scene.sstp.target=mesh


def _parrafo(lay,context,texto,icon='NONE'):
    """Texto largo en varias líneas según el ancho del panel (nunca se corta con «…»)."""
    ancho=max(24,int(context.region.width/10.5)-2) if context.region else 44
    col=lay.column(align=True)
    for i,l in enumerate(textwrap.wrap(str(texto),ancho) or ['']):
        col.label(text=l,icon=icon if i==0 else 'BLANK1')


def _etapa(layout,n,titulo,hecho,actual):
    """Sección plegable; la etapa actual se abre sola. ✓ cuando ya está hecha."""
    h,b=layout.panel('SSTP_etapa%s_%d'%(n,int(actual)),default_closed=not actual)
    h.label(text=titulo,icon='CHECKMARK' if hecho else ('RADIOBUT_OFF' if hecho is not None else 'BLANK1'))
    return b


def draw_gotero(box,cfg,key):
    """Gotero con menú pequeño; el color tomado pasa solo al pincel."""
    row=box.row(align=True)
    row.operator('sstp.picker',text='Gotero',icon='EYEDROPPER',depress=cfg.picker)
    if key=='3':row.prop(cfg,'color',text='')
    h,body=box.panel('SSTP_gotero'+key,default_closed=True); h.label(text='Opciones del gotero')
    if body:
        body.prop(cfg,'picker_source',text='Tomar de')
        body.label(text='Alt + clic: gotero rápido al pintar',icon='INFO')
        body.label(text='El color tomado se usa en el pincel')


def draw_controls(layout,context):
    cfg=context.scene.sstp; col=layout.column(align=True)
    col.label(text='SpanStories · Texture Painter',icon='TPAINT_HLT')
    col.prop(cfg,'target',text='Personaje'); col.operator('sstp.import_glb',text='Importar personaje (GLB)',icon='IMPORT')
    sub=col.column(align=True); sub.scale_y=2.0; sub.operator('sstp.workspace',icon='WORKSPACE')
    sub=col.column(align=True); sub.scale_y=1.0; sub.operator('sstp.frame',icon='VIEWZOOM')
    if cfg.note:
        caja=layout.box(); _parrafo(caja,context,cfg.note,icon='INFO')
    if not cfg.target: return
    if mouth_preview.status(cfg.target):
        col.label(text='Boca abierta para pintar · pose temporal',icon='INFO')
    draw_tools(layout,context)
    s=core.state(cfg.target); tiene=bool(s.get('slots')); n_sel=len(s.get('selected',[])); actual=3 if tiene else 1
    box=_etapa(layout,1,'1. Referencia',bool(cfg.reference),actual==1)
    if box:
        box.operator('sstp.reference',icon='IMAGE_DATA'); box.prop(cfg,'reference',text='Imagen')
        box.operator('sstp.palette',icon='COLOR'); box.prop(cfg,'color',text='Color / cuentagotas')
        draw_gotero(box,cfg,'1')
        for i,p in enumerate(cfg.palette):
            row=box.row(align=True); row.prop(p,'color',text=''); row.prop(p,'name',text=''); row.operator('sstp.color',text='',icon='EYEDROPPER').index=i
        box.operator('sstp.remember_color',icon='ADD')
    box=_etapa(layout,2,'2. Regiones de la textura',n_sel>0,actual==2)
    if box:
        box.operator('sstp.pick',text='Seleccionar zonas',icon='RESTRICT_SELECT_OFF'); box.prop(cfg,'select_mode',expand=True); box.prop(cfg,'show_faces'); box.prop(cfg,'detail'); box.prop(cfg,'uv_texture',text='Ver textura en las zonas')
        box.label(text=str(n_sel)+' zona(s) seleccionada(s)')
        row=box.row(align=True); row.prop(cfg,'group_name',text=''); row.operator('sstp.group',text='',icon='ADD')
        for name in s.get('groups',{}):
            op=box.operator('sstp.group',text=name,icon='GROUP_UVS'); op.name=name; op.recall=True
    box=_etapa(layout,3,'3. Pintar',tiene,actual==3)
    if box:
        if not tiene:
            box.prop(cfg,'resolution'); sub=box.column(align=True); sub.scale_y=2.0; sub.operator('sstp.prepare',icon='SHIELD')
        else:
            sub=box.column(align=True); sub.scale_y=2.0; sub.operator('sstp.fill',icon='COLOR')
            sub=box.column(align=True); sub.scale_y=1.4; sub.operator('sstp.fill',text='Borrar región de esta capa',icon='BRUSH_DATA').erase=True
            row=box.row(align=True); row.scale_y=1.4; row.operator('sstp.history',text='Deshacer',icon='LOOP_BACK'); row.operator('sstp.history',text='Rehacer',icon='LOOP_FORWARDS').redo=True
            row=box.row(align=True); row.scale_y=1.4; row.operator('sstp.brush',text='Pincel',icon='BRUSH_DATA'); row.operator('sstp.brush',text='Borrador').erase=True
            draw_gotero(box,cfg,'3')
            box.prop(cfg,'brush_size'); box.prop(cfg,'strength')
            for i,l in enumerate(s['layers']):
                row=box.row(align=True); op=row.operator('sstp.layer',text='',icon='HIDE_OFF' if l['visible'] else 'HIDE_ON'); op.index=i; op.toggle=True
                op=row.operator('sstp.layer',text=l['name'],depress=i==s['active_layer']); op.index=i
                row.operator('sstp.layer_edit',text='',icon='PREFERENCES').index=i
            row=box.row(align=True); row.prop(cfg,'layer_name',text=''); row.operator('sstp.layer',text='',icon='ADD')
    if tiene:
        box=_etapa(layout,4,'4. Guardar y exportar',None,False)
        if box:
            box.prop(cfg,'resolution')
            sub=box.column(align=True); sub.scale_y=1.4
            sub.operator('sstp.export_png',text='Exportar imagen (PNG)',icon='IMAGE_DATA'); sub.operator('sstp.export_glb',text='Exportar personaje (GLB)',icon='EXPORT'); sub.operator('sstp.pack',icon='FILE_TICK')
            row=box.row(align=True); row.operator('sstp.restore',text='Ver original'); row.operator('sstp.restore',text='Volver a capas').resume=True
    h,box=layout.panel('SSTP_vista',default_closed=False)
    h.label(text='Vista del modelo',icon='ORIENTATION_GIMBAL')
    if box:
        grid=box.grid_flow(columns=2,align=True)
        for label,action in [('Subir','SUBE'),('Bajar','BAJA'),('Girar Z ◀','GIRO_M'),('Girar Z ▶','GIRO_P'),('Inclinar X ▲','INCL_P'),('Inclinar X ▼','INCL_M'),('Rodar Y ◀','RODAR_M'),('Rodar Y ▶','RODAR_P'),('Frente','FRENTE'),('Atrás','ATRAS'),('Izquierda','IZQ'),('Derecha','DER'),('Arriba','ARRIBA')]:
            grid.operator('sstp.view',text=label).action=action
        box.label(text='Flechas sobre el modelo: subir/bajar y girar · Mayús: inclinar/rodar')
    h,box=layout.panel('SSTP_conexion',default_closed=True)
    h.label(text='Conexión',icon='LINKED')
    if box: box.operator('sstp.bridge',text='Desconectar Codex' if bridge.running() else 'Conectar Codex',icon='LINKED')


class SSTP_OT_action(Operator):
    """The SSTP space buttons, available from the side panel too."""
    bl_idname='sstp.action'; bl_label='Herramienta SSTP'
    action:StringProperty()
    @classmethod
    def description(cls,context,props):
        return ACTION_TIPS.get(props.action,props.action)
    def invoke(self,context,event):return self.execute(context)
    @guard
    def execute(self,context):
        cfg=context.scene.sstp;a=self.action
        if a=='PIEL' and not any(role(x)=='MODEL' for x in context.screen.areas):
            # Outside the SSTP space the Piel controls open inside this panel.
            cfg.show_piel=not cfg.show_piel;core.redraw();return
        if a=='PAINT_UV' and not any(role(x)=='UV' for x in context.screen.areas):
            raise ValueError('El Pincel UV pinta sobre el mapa UV: abre Texture Painter')
        if a=='CODEX':
            bpy.ops.sstp.bridge();return
        if not any(x.type=='VIEW_3D' for x in context.screen.areas):raise ValueError('Se necesita una vista 3D')
        run_action(a,context);core.redraw()


ACTION_TIPS={'MOUTH_OPEN':'Abre la boca temporalmente para pintar dentro','MOUTH_ORIGINAL':'Vuelve a la boca del personaje',
 'PICKER':'Activa el gotero: el siguiente clic toma ese color','FACEMODE':'Alterna selección por zonas o por caras',
 'SHOWFACES':'Muestra u oculta la malla sobre el modelo','GROUPS':'Regiones guardadas','SELECT':'Volver a seleccionar',
 'PAINT_MODEL':'Pincel sobre el personaje (Mayús + clic en el espacio SSTP)','PAINT_UV':'Pincel sobre el mapa UV',
 'ERASE':'Borrador de la capa activa','CATALOG':'Catálogo de pinceles 3D de Blender','PREPARE':'Prepara texturas protegidas para pintar',
 'FILL':'Aplica el color a la selección','UNDO':'Deshacer','LAYERS':'Capas de pintura','PIEL':'Controles de Piel',
 'PNG':'Exportar imagen (PNG)','GLB':'Exportar personaje (GLB)','SAVE':'Guardar texturas en el archivo','CODEX':'Conectar o desconectar Codex'}


def draw_tools(layout,context):
    """Same buttons and states as the menu of the SSTP space."""
    cfg=context.scene.sstp;ob=cfg.target;s=core.state(ob)
    h,box=layout.panel('SSTP_herramientas',default_closed=False);h.label(text='Herramientas',icon='TOOL_SETTINGS')
    if not box:return
    def row(items):
        r=box.row(align=True)
        for label,action,active in items:r.operator('sstp.action',text=label,depress=bool(active)).action=action
    original=bool(ob.get('sstp_mouth_original',False))
    row([('Boca abierta','MOUTH_OPEN',not original),('Boca original','MOUTH_ORIGINAL',original)])
    r=box.row(align=True);r.prop(cfg,'brush_size');r.prop(cfg,'strength')
    row([('Gotero','PICKER',cfg.picker),('Caras','FACEMODE',cfg.select_mode=='FACE'),('Ver malla','SHOWFACES',cfg.show_faces),('Regiones','GROUPS',False)])
    row([('Seleccionar','SELECT',cfg.tool=='SELECT'),('Pincel 3D','PAINT_MODEL',cfg.tool=='BRUSH' and cfg.paint_surface=='MODEL'),('Pincel UV','PAINT_UV',cfg.tool=='BRUSH' and cfg.paint_surface=='UV')])
    row([('Borrador','ERASE',cfg.tool=='ERASE'),('Pinceles 3D','CATALOG',False)])
    if not s.get('slots'):
        sub=box.column(align=True);sub.scale_y=1.4;sub.operator('sstp.action',text='Preparar texturas protegidas',icon='SHIELD').action='PREPARE'
    else:
        r=box.row(align=True);r.prop(cfg,'color',text='');r.operator('sstp.action',text='Aplicar color',depress=True).action='FILL'
        r=box.row(align=True);r.operator('sstp.action',text='Deshacer').action='UNDO';r.operator('sstp.action',text='Capas').action='LAYERS'
        box.label(text='Capa: '+s['layers'][s['active_layer']]['name']+' · '+str(len(s.get('selected',[])))+' zonas elegidas')
    row([('Piel','PIEL',cfg.show_piel),('PNG','PNG',False),('GLB','GLB',False),('Guardar','SAVE',False),('Codex','CODEX',bridge.running())])
    box.label(text='Solo texturas · UV, malla y rig originales intactos')
    if cfg.show_piel:
        from . import piel_ui
        h,body=box.panel('SSTP_piel_lateral',default_closed=False);h.label(text='Piel',icon='OUTLINER_OB_MESH')
        if body:piel_ui.draw_panel(body,context,'SSTP_piel_lat_')


class SSTP_PT_3d(Panel):
    bl_label='Texture Painter'; bl_idname='SSTP_PT_3d'; bl_space_type='VIEW_3D'; bl_region_type='UI'; bl_category='SpanStories'
    def draw(self,context): draw_controls(self.layout,context)


def image_header(self,context):
    r=role(context.area)
    if r=='REFERENCE':
        self.layout.label(text='REFERENCIA'); self.layout.operator('sstp.reference',text='',icon='FILE_FOLDER'); self.layout.operator('sstp.palette',text='',icon='COLOR')
    elif r=='UV':
        self.layout.label(text='ZONAS DE LA TEXTURA'); self.layout.operator('sstp.pick',text='Seleccionar zonas'); self.layout.operator('sstp.fill',text='Aplicar color'); self.layout.prop(context.scene.sstp,'detail',text='',icon='MESH_DATA')


def uv_edge_coords(polygons):
    """Build face edges in bulk, in UV space; navigation never rebuilds them."""
    if not polygons: return np.empty((0,2),np.float32)
    coords=np.concatenate(polygons).astype(np.float32,copy=False)
    ends=np.cumsum([len(p) for p in polygons])
    following=np.arange(1,len(coords)+1)
    following[ends-1]=np.concatenate(([0],ends[:-1]))
    return np.stack((coords,coords[following]),axis=1).reshape(-1,2)


def uv_triangle_coords(polygons):
    """Triangles need no Python vectors; retain tessellation for concave n-gons."""
    parts=[]
    for p in polygons:
        if len(p)==3: parts.append(p)
        else:
            poly=[Vector((float(v[0]),float(v[1]),0)) for v in p]
            parts.extend(np.asarray([(v.x,v.y) for v in t],np.float32) for t in core.triangles(poly))
    return np.concatenate(parts).astype(np.float32,copy=False) if parts else np.empty((0,2),np.float32)


def draw_uv():
    context=bpy.context
    if not context.area or role(context.area)!='UV': return
    cfg=context.scene.sstp; ob=cfg.target
    if not ob or not ob.data.uv_layers.active: return
    try:
        _draw_counts['uv']+=1
        g=core.geometry(ob); chosen=set(core.selected(ob)); r=context.region
        origin=np.asarray(r.view2d.view_to_region(0,0,clip=False),np.float32)
        end=np.asarray(r.view2d.view_to_region(1,1,clip=False),np.float32); scale=end-origin
        shader=gpu.shader.from_builtin('UNIFORM_COLOR')
        # Buffers contain UV coordinates. Pan/zoom/resize change only a matrix,
        # avoiding full mesh traversal and GPU allocation on every mouse event.
        key=(id(g),g['stamp'],cfg.detail,ob.active_material_index)
        if key not in _uv_batches:
            bounds=[]; polygons=[]
            for island in g['islands'].values():
                if island['material']!=ob.active_material_index:continue
                for a,b in island['boundary']: bounds.extend([a,b])
                if cfg.detail:
                    polygons.extend(g['face_uv'][f] for f in island['faces'])
            entries=[]
            for coords in (uv_edge_coords(polygons),bounds):
                entries.append(batch_for_shader(shader,'LINES',{'pos':np.asarray(coords,dtype=np.float32).reshape(-1,2)}) if len(coords) else None)
            _uv_batches.clear(); _uv_batches[key]=entries
        internal,boundaries=_uv_batches[key]
        selection_key=(id(g),key,tuple(sorted(chosen)))
        if selection_key not in _uv_selection_batches:
            entries=[]
            for ident in sorted(chosen):
                island=core.island_of(g,ident)
                if island['material']!=ob.active_material_index:continue
                lines=np.asarray(island['boundary'],np.float32).reshape(-1,2)
                tris=uv_triangle_coords([g['face_uv'][f] for f in island['faces']])
                entries.append((batch_for_shader(shader,'LINES',{'pos':lines}) if len(lines) else None,
                                batch_for_shader(shader,'TRIS',{'pos':tris}) if len(tris) else None))
            _uv_selection_batches.clear();_uv_selection_batches[selection_key]=entries
        transform=Matrix(((float(scale[0]),0,0,float(origin[0])),
                          (0,float(scale[1]),0,float(origin[1])),
                          (0,0,1,0),(0,0,0,1)))
        gpu.state.blend_set('ALPHA')
        with gpu.matrix.push_pop():
            gpu.matrix.multiply_matrix(transform)
            shader.bind()
            if internal:
                shader.uniform_float('color',(.12,.12,.12,.07)); internal.draw(shader)
            if boundaries:
                shader.uniform_float('color',(.18,.2,.22,.8)); boundaries.draw(shader)
            for lines,tris in _uv_selection_batches[selection_key]:
                shader.uniform_float('color',(1,.63,.05,1))
                if lines:lines.draw(shader)
                shader.uniform_float('color',(1,.58,.015,.08))
                if tris:tris.draw(shader)
        _draw_errors.pop('uv',None)
    except Exception as e:_draw_errors['uv']=str(e)
    finally: gpu.state.blend_set('NONE')


def model_overlay_projection(perspective, evaluated):
    """Keep screen XY, but give the overlay its own tightly bounded depth range.

    A fixed clip-space line offset with the viewport's 1000 m far clip can
    pull the back of a 1 m character through its face. Remap depth only; the
    depth prepass, selection and grid must all use this same projection.
    """
    projection=np.asarray(perspective,dtype=np.float64).copy()
    corners=np.asarray([evaluated.matrix_world@Vector(p) for p in evaluated.bound_box],dtype=np.float64)
    clip=np.column_stack((corners,np.ones(len(corners))))@projection.T
    if np.any(clip[:,3]<=1e-8):return perspective.copy()
    depth=clip[:,2]/clip[:,3];lo=float(depth.min());hi=float(depth.max())
    span=hi-lo
    if span<=1e-12:return perspective.copy()
    # Leave 5% clearance at either end, without touching screen coordinates.
    projection[2]=(1.8/span)*projection[2]-(.9*(hi+lo)/span)*projection[3]
    return Matrix(projection.tolist())


def draw_model():
    """Draw in POST_PIXEL: POST_VIEW is suppressed by Blender's overlay switch.

    Build our own depth-only target pass, so the highlight is visible in the
    simplified view while back surfaces remain occluded. No mesh/material writes.
    The optional face grid (cfg.show_faces) is drawn the same way, slightly biased
    toward the camera so it never z-fights with the surface.
    """
    context=bpy.context
    if not context.area or role(context.area)!='MODEL': return
    cfg=context.scene.sstp; ob=cfg.target
    if not ob or not ob.data.uv_layers.active: return
    ids=core.selected(ob); wire=bool(cfg.show_faces)
    if not ids and not wire: return
    old_depth=gpu.state.depth_test_get();old_mask=gpu.state.depth_mask_get()
    try:
        _draw_counts['model']+=1
        g=core.geometry(ob); faces=core.faces_of(g,ids)
        evaluated,mapping=surface_map.evaluated_surface(ob,context.evaluated_depsgraph_get()); mesh=evaluated.data
        coords=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
        matrix=np.asarray(evaluated.matrix_world,np.float32)
        key=(ob.as_pointer(),tuple(ids),hash(coords.tobytes()),hash(mapping.tobytes()),matrix.tobytes(),wire)
        shader=gpu.shader.from_builtin('UNIFORM_COLOR')
        if key not in _model_batches:
            mesh.calc_loop_triangles()
            indices=np.empty(len(mesh.loop_triangles)*3,np.int32);mesh.loop_triangles.foreach_get('vertices',indices);indices=indices.reshape(-1,3)
            face_indices=np.empty(len(mesh.loop_triangles),np.int32);mesh.loop_triangles.foreach_get('polygon_index',face_indices)
            world=coords@matrix[:3,:3].T+matrix[:3,3]
            chosen=np.isin(mapping[face_indices],list(faces))
            depth=batch_for_shader(shader,'TRIS',{'pos':world[indices].reshape(-1,3)})
            tint=batch_for_shader(shader,'TRIS',{'pos':world[indices[chosen]].reshape(-1,3)}) if np.any(chosen) else None
            grid_edges,outline_edges=surface_map.edge_masks(mesh,mapping,faces)
            pairs=np.empty(len(mesh.edges)*2,np.int32);mesh.edges.foreach_get('vertices',pairs);pairs=pairs.reshape(-1,2)
            outline=batch_for_shader(shader,'LINES',{'pos':world[pairs[outline_edges]].reshape(-1,3)}) if np.any(outline_edges) else None
            grid=None
            if wire:
                grid=batch_for_shader(shader,'LINES',{'pos':world[pairs[grid_edges]].reshape(-1,3)})
            _model_batches.clear();_model_batches[key]=(depth,tint,grid,outline)
        depth,tint,grid,outline=_model_batches[key]
        persp=model_overlay_projection(context.space_data.region_3d.perspective_matrix,evaluated)
        with gpu.matrix.push_pop(),gpu.matrix.push_pop_projection():
            gpu.matrix.load_matrix(Matrix.Identity(4))
            gpu.matrix.load_projection_matrix(persp)
            # Depth is owned by this late overlay pass; color is never cleared.
            gpu.state.active_framebuffer_get().clear(depth=1.0)
            gpu.state.depth_test_set('LESS_EQUAL');gpu.state.depth_mask_set(True)
            gpu.state.color_mask_set(False,False,False,False)
            shader.bind();shader.uniform_float('color',(0,0,0,0));depth.draw(shader)
            gpu.state.color_mask_set(True,True,True,True)
            gpu.state.depth_mask_set(False);gpu.state.blend_set('ALPHA')
            if tint:
                gpu.state.depth_test_set('EQUAL');shader.uniform_float('color',(1,.58,.015,.08));tint.draw(shader)
            if outline:
                bias=Matrix(((1,0,0,0),(0,1,0,0),(0,0,1,-1e-3),(0,0,0,1)))
                gpu.matrix.load_projection_matrix(bias@persp)
                gpu.state.depth_test_set('LESS_EQUAL');gpu.state.line_width_set(2.0)
                shader.uniform_float('color',(1,.63,.05,1));outline.draw(shader)
            if grid:
                bias=Matrix(((1,0,0,0),(0,1,0,0),(0,0,1,-1e-3),(0,0,0,1)))
                gpu.matrix.load_projection_matrix(bias@persp)
                gpu.state.depth_test_set('LESS_EQUAL');gpu.state.line_width_set(1.2)
                shader.uniform_float('color',(.04,.06,.09,.75));grid.draw(shader)
        _draw_errors.pop('model',None)
    except Exception as e:_draw_errors['model']=str(e)
    finally:
        gpu.state.color_mask_set(True,True,True,True);gpu.state.blend_set('NONE');gpu.state.line_width_set(1.0)
        gpu.state.depth_test_set(old_depth);gpu.state.depth_mask_set(old_mask)


def run_action(action,context):
    cfg=context.scene.sstp
    if action=='CATALOG':
        view=next(a for a in context.screen.areas if a.type=='VIEW_3D')
        region=next(r for r in view.regions if r.type=='WINDOW')
        with context.temp_override(area=view,region=region):
            if cfg.paint_surface!='MODEL' or core.target().mode!='TEXTURE_PAINT':run_action('PAINT_MODEL',context)
            if core.target().mode=='TEXTURE_PAINT':
                bpy.ops.wm.call_asset_shelf_popover('INVOKE_DEFAULT',name='VIEW3D_AST_brush_texture_paint')
        return
    if action.startswith('SIZE:'):
        cfg.brush_size=max(1,min(500,cfg.brush_size+int(action.split(':')[1])));color_changed(cfg,context);core.redraw();return
    if action.startswith('STRENGTH:'):
        cfg.strength=max(.01,min(1,cfg.strength+float(action.split(':')[1])));color_changed(cfg,context);core.redraw();return
    if action in ('PAINT_MODEL','PAINT_UV'):
        end_paint(context)
        cfg.paint_surface='MODEL' if action=='PAINT_MODEL' else 'UV'
        bpy.ops.sstp.brush('INVOKE_DEFAULT'); return
    if action=='PICKER': bpy.ops.sstp.picker(); return
    if action=='FACEMODE': cfg.select_mode='ZONES' if cfg.select_mode=='FACE' else 'FACE'; return
    if action=='SHOWFACES': cfg.show_faces=not cfg.show_faces; return
    if action in ('MOUTH_OPEN','MOUTH_ORIGINAL'):
        mouth_preview.set_original(cfg.target,action=='MOUTH_ORIGINAL')
        core.redraw();return
    if action.startswith('VIEW:'): view_step(action[5:]); return
    if action.startswith('COLOR:'):cfg.color=cfg.palette[int(action.split(':')[1])].color;return
    if action=='TEXTURE':cfg.uv_texture=not cfg.uv_texture;return
    if action=='DETAIL':cfg.detail=not cfg.detail;core.redraw();return
    if action=='FILL':
        end_paint(context);bpy.ops.sstp.fill('INVOKE_DEFAULT');cfg.uv_texture=True;return
    if action in ('UNDO','REDO'):
        end_paint(context);bpy.ops.sstp.history(redo=action=='REDO');return
    actions={
        'REFERENCE':lambda:bpy.ops.sstp.reference('INVOKE_DEFAULT'),
        'PALETTE':lambda:bpy.ops.sstp.palette(),
        'SELECT':lambda:bpy.ops.sstp.pick(),
        'BRUSH':lambda:bpy.ops.sstp.brush('INVOKE_DEFAULT'),
        'ERASE':lambda:bpy.ops.sstp.brush('INVOKE_DEFAULT',erase=True),
        'LAYERS':lambda:bpy.ops.sstp.layers_dialog('INVOKE_DEFAULT'),
        'GROUPS':lambda:bpy.ops.sstp.groups_dialog('INVOKE_DEFAULT'),
        'PIEL':lambda:set_panels(context,True),
        'PANELS':lambda:set_panels(context,False),
        'COLOR':lambda:bpy.ops.sstp.color_dialog('INVOKE_DEFAULT'),
        'FRAME':lambda:bpy.ops.sstp.frame(),
        'PREPARE':lambda:bpy.ops.sstp.prepare(),
        'PNG':lambda:bpy.ops.sstp.export_png('INVOKE_DEFAULT'),
        'GLB':lambda:bpy.ops.sstp.export_glb('INVOKE_DEFAULT'),
        'SAVE':lambda:bpy.ops.sstp.pack('INVOKE_DEFAULT'),
        'CODEX':lambda:bpy.ops.sstp.bridge(),
        'ORIGINAL':lambda:bpy.ops.sstp.restore(),
        'RESUME':lambda:bpy.ops.sstp.restore(resume=True),
    }
    actions[action]()


def draw_hud():
    context=bpy.context
    if not context.area or not role(context.area):return
    area=context.area;r=role(area);w=context.region.width;h=context.region.height;cfg=context.scene.sstp
    if w<160:
        _buttons[area.as_pointer()]=[];return
    s=core.state(cfg.target) if cfg.target else {}; buttons=[]
    _buttons[area.as_pointer()]=buttons
    shader=gpu.shader.from_builtin('UNIFORM_COLOR')
    def rect(x,y,width,height,color):
        shader.bind();shader.uniform_float('color',color)
        batch_for_shader(shader,'TRIS',{'pos':[(x,y),(x+width,y),(x+width,y+height),(x,y),(x+width,y+height),(x,y+height)]}).draw(shader)
    def text(x,y,label,size=13,color=(.88,.9,.94,1)):
        blf.size(0,size);blf.color(0,*color);blf.position(0,x,y,0);blf.draw(0,label)
    def button(x,y,width,label,action,active=False,color=None):
        rect(x,y,width,28,color or ((.18,.4,.46,1) if active else (.14,.17,.21,1)))
        text(x+9,y+8,label,13);buttons.append(((x,y,width,28),action))
    gpu.state.blend_set('ALPHA')
    rect(0,h-46,w,46,(.055,.065,.08,.98))
    if r=='REFERENCE':
        text(16,h-29,'REFERENCIA',15);button(w-98,h-37,82,'Cargar','REFERENCE');button(w-192,h-37,86,'Minimizar','PIEL')
        rect(0,0,w,112,(.055,.065,.08,.98))
        text(16,91,'Colores de la referencia · clic en la imagen = gotero',13);button(w-108,78,92,'Extraer','PALETTE')
        colors=list(cfg.palette)
        for i,p in enumerate(colors[:8]):
            cols=4;gap=7;cw=(w-32-3*gap)/4;row=i//cols;col=i%cols
            x=16+col*(cw+gap);y=42-row*33
            rgb=core.to_srgb(np.array(p.color[:3])).clip(0,1)
            button(x,y,cw,'',f'COLOR:{i}',color=(*map(float,rgb),1))
    elif r=='UV':
        count=sum(i['material']==cfg.target.active_material_index for i in core.geometry(cfg.target)['islands'].values()) if cfg.target else 0
        text(16,h-29,'Textura · '+str(count)+' zonas',15)
        button(w-181,h-37,77,'Textura','TEXTURE',cfg.uv_texture);button(w-96,h-37,80,'Detalle','DETAIL',cfg.detail)
        button(w-262,h-37,73,'Caras','FACEMODE',cfg.select_mode=='FACE');button(w-343,h-37,73,'Gotero','PICKER',cfg.picker);button(w-437,h-37,86,'Minimizar','PIEL')
        rect(0,0,w,39,(.055,.065,.08,.98))
        text(16,14,str(len(s.get('selected',[])))+' seleccionadas · Mayús: varias · Ctrl: hilera',13)
    else:
        shown=w-sidebar_width(area)
        text(16,h-29,cfg.target.name if cfg.target else 'PERSONAJE',15);button(shown-113,h-37,97,'Encuadrar','FRAME')
        if cfg.panels_hidden:
            # Vertical tabs, like add-on tabs but on the left: touching one brings the panels back.
            y=h-58
            for label,height in (('Referencia',118),('Textura',96)):
                y-=height;rect(0,y,30,height,(.14,.17,.21,1));rect(0,y,3,height,(.18,.4,.46,1))
                blf.enable(0,blf.ROTATION);blf.rotation(0,math.pi/2)
                text(21,y+12,label,13)
                blf.rotation(0,0);blf.disable(0,blf.ROTATION)
                buttons.append(((0,y,30,height),'PANELS'));y-=6
        else:
            rect(12,12,w-24,304,(.055,.065,.08,.98))
            mouth_original=bool(cfg.target and cfg.target.get('sstp_mouth_original',False))
            button(24,279,(w-55)/2,'Boca abierta','MOUTH_OPEN',not mouth_original)
            button(31+(w-55)/2,279,(w-55)/2,'Boca original','MOUTH_ORIGINAL',mouth_original)
            gap=7;x=24
            tw=(w-48-3*gap)/4
            for label,action,active in [('Gotero','PICKER',cfg.picker),('Caras','FACEMODE',cfg.select_mode=='FACE'),('Ver malla','SHOWFACES',cfg.show_faces),('Regiones','GROUPS',False)]:
                button(x,199,tw,label,action,active);x+=tw+gap
            x=24; bw=(w-48-4*gap)/5
            for label,action,active in [('Seleccionar','SELECT',cfg.tool=='SELECT'),('Pincel 3D','PAINT_MODEL',cfg.tool=='BRUSH' and cfg.paint_surface=='MODEL'),('Pincel UV','PAINT_UV',cfg.tool=='BRUSH' and cfg.paint_surface=='UV'),('Borrador','ERASE',cfg.tool=='ERASE'),('Pinceles 3D','CATALOG',False)]:
                button(x,159,bw,label,action,active);x+=bw+gap
            half=(w-55)/2
            button(24,239,28,'−','SIZE:-5');text(59,248,'Tamaño: '+str(cfg.brush_size)+' px',12);button(half-10,239,28,'+','SIZE:5')
            button(half+24,239,28,'−','STRENGTH:-0.1');text(half+59,248,'Intensidad: '+str(round(cfg.strength*100))+'%',12);button(w-52,239,28,'+','STRENGTH:0.1')
            if not s.get('slots'):
                button(24,116,w-48,'Preparar texturas protegidas','PREPARE')
            else:
                rgb=core.to_srgb(np.array(cfg.color[:3])).clip(0,1)
                button(24,116,58,'','COLOR',color=(*map(float,rgb),1))
                button(90,116,max(90,w-296),'Aplicar color','FILL',True)
                button(w-198,116,82,'Deshacer','UNDO');button(w-108,116,84,'Capas','LAYERS')
                active=s['layers'][s['active_layer']]['name']
                text(24,96,'Capa: '+active+'  ·  '+str(len(s.get('selected',[])))+' zonas elegidas',13)
            x=24;bw=(w-48-4*gap)/5
            for label,action in [('Piel','PIEL'),('PNG','PNG'),('GLB','GLB'),('Guardar','SAVE'),('Codex','CODEX')]:
                button(x,51,bw,label,action,action=='PIEL' or (action=='CODEX' and bridge.running()));x+=bw+gap
            text(24,28,'Solo texturas · UV, malla y rig originales intactos',12,(.52,.62,.68,1))
            text(24,329,'Mayús + izquierdo: pintar · Izquierdo: girar · Derecho: mover',12)
        for depth,x,y,label,color,action in axis_handles(area.spaces.active.region_3d,shown,h):
            if label:
                shader.bind();shader.uniform_float('color',color)
                batch_for_shader(shader,'LINES',{'pos':[(shown-70,h-112),(x,y)]}).draw(shader)
            radius=10 if label else 7
            tint=color if label else tuple(c*.45 for c in color[:3])+(1,)
            shader.bind();shader.uniform_float('color',tint)
            points=[(x,y)]+[(x+radius*math.cos(i*math.tau/24),y+radius*math.sin(i*math.tau/24)) for i in range(25)]
            batch_for_shader(shader,'TRIS',{'pos':[points[j] for i in range(1,25) for j in (0,i,i+1)]}).draw(shader)
            if label:text(x-4,y-5,label,12,(.035,.045,.06,1))
            buttons.insert(0,((x-radius,y-radius,radius*2,radius*2),'VIEW:'+action))
    gpu.state.blend_set('NONE')


classes=(SSTP_Color,SSTP_Reference,SSTP_Settings,SSTP_OT_workspace,SSTP_OT_view,SSTP_OT_picker,SSTP_OT_frame,SSTP_OT_prepare,SSTP_OT_reference,SSTP_OT_palette,SSTP_OT_color,SSTP_OT_remember_color,SSTP_OT_fill,SSTP_OT_history,SSTP_OT_group,SSTP_OT_layer,SSTP_OT_layer_edit,SSTP_OT_pick,SSTP_OT_click,SSTP_OT_controller,SSTP_OT_brush,SSTP_OT_stroke,SSTP_OT_layers_dialog,SSTP_OT_groups_dialog,SSTP_OT_color_dialog,SSTP_OT_png,SSTP_OT_glb,SSTP_OT_pack,SSTP_OT_restore,SSTP_OT_bridge,SSTP_OT_import_glb,SSTP_OT_action,SSTP_PT_3d)


def register():
    mouth_preview.register()
    surface_map.register()
    for c in classes: bpy.utils.register_class(c)
    bpy.types.Scene.sstp=PointerProperty(type=SSTP_Settings)
    bpy.types.IMAGE_HT_header.append(image_header)
    _draw.append((bpy.types.SpaceImageEditor,bpy.types.SpaceImageEditor.draw_handler_add(draw_uv,(),'WINDOW','POST_PIXEL')))
    _draw.append((bpy.types.SpaceView3D,bpy.types.SpaceView3D.draw_handler_add(draw_model,(),'WINDOW','POST_PIXEL')))
    _draw.append((bpy.types.SpaceImageEditor,bpy.types.SpaceImageEditor.draw_handler_add(draw_hud,(),'WINDOW','POST_PIXEL')))
    _draw.append((bpy.types.SpaceView3D,bpy.types.SpaceView3D.draw_handler_add(draw_hud,(),'WINDOW','POST_PIXEL')))
    if not bpy.app.background:bpy.app.timers.register(start_controller,first_interval=.25)
    if not bpy.app.background:bpy.app.timers.register(watch_target,first_interval=.4)
    bpy.app.handlers.load_post.append(restore_after_load)


def unregister():
    global _session_token
    mouth_preview.unregister()
    surface_map.unregister()
    _session_token=object()
    if bpy.app.timers.is_registered(start_controller):bpy.app.timers.unregister(start_controller)
    if bpy.app.timers.is_registered(watch_target):bpy.app.timers.unregister(watch_target)
    if bpy.app.timers.is_registered(finish_native_stroke):bpy.app.timers.unregister(finish_native_stroke)
    if restore_after_load in bpy.app.handlers.load_post:bpy.app.handlers.load_post.remove(restore_after_load)
    for km,kmi in _keymaps: km.keymap_items.remove(kmi)
    _keymaps.clear(); _uv_batches.clear();_model_batches.clear();_draw_errors.clear()
    for kind,handle in _draw: kind.draw_handler_remove(handle,'WINDOW')
    _draw.clear()
    bpy.types.IMAGE_HT_header.remove(image_header)
    if hasattr(bpy.types.Scene,'sstp'): del bpy.types.Scene.sstp
    for c in reversed(classes): bpy.utils.unregister_class(c)
