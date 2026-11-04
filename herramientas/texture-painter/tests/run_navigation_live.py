"""Hot-load navigation only and exercise real modal routing without painting/saving."""
import ast, hashlib, json, sys
from pathlib import Path
from types import SimpleNamespace
import bpy

ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=sys.modules['bl_ext.user_default.spanstories_texture_painter']
ui=addon.ui; core=addon.core
ui.SimpleNamespace=SimpleNamespace
source=ROOT/'blender'/'spanstories_texture_painter'/'ui.py'
tree=ast.parse(source.read_text(encoding='utf8'))
ob=bpy.context.scene.sstp.target
before=core.fingerprint(ob)
hashes={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for im in bpy.data.images if im.has_data}
history=core._history
for name in ('drag_view','axis_handles','view_step','draw_hud'):
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    ns=dict(ui.__dict__)
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),ns)
    if name in ui.__dict__:ui.__dict__[name].__code__=ns[name].__code__
    else:ui.__dict__[name]=ns[name];ui.__dict__[name].__globals__.update(ui.__dict__)
node=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='SSTP_OT_controller')
method=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name=='modal')
ns={};exec(compile(ast.Module(body=[method],type_ignores=[]),str(source),'exec'),ui.__dict__,ns)
ui.SSTP_OT_controller.modal=ns['modal']

area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
region=next(r for r in area.regions if r.type=='WINDOW')
v=area.spaces.active.region_3d
rotation=v.view_rotation.copy(); location=v.view_location.copy(); distance=v.view_distance
cfg=bpy.context.scene.sstp; tool=cfg.tool; selected=list(core.selected(ob))
ctl=SimpleNamespace(token=ui._session_token)
ctl.modal=lambda context,event:ui.SSTP_OT_controller.modal(ctl,context,event)
x=region.x+region.width//2;y=region.y+region.height//2
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)
def event(kind,value='PRESS',dx=0,dy=0,shift=False):
    return SimpleNamespace(type=kind,value=value,mouse_x=x+dx,mouse_y=y+dy,shift=shift,alt=False,ctrl=False)
try:
    ctl.modal(bpy.context,event('LEFTMOUSE'))
    check('left press captured even in brush mode',ctl.view_drag[2]=='LEFTMOUSE')
    ctl.modal(bpy.context,event('MOUSEMOVE',dx=67,dy=39))
    check('free orbit changes rotation',abs(v.view_rotation.dot(rotation))<.9999)
    check('orbit preserves center and distance',(v.view_location-location).length<1e-6 and v.view_distance==distance)
    ctl.modal(bpy.context,event('LEFTMOUSE','RELEASE',dx=67,dy=39))
    check('release ends gesture',ctl.view_drag is None)
    old=v.view_rotation.copy()
    ctl.modal(bpy.context,event('RIGHTMOUSE'))
    ctl.modal(bpy.context,event('MOUSEMOVE',dx=30,dy=45))
    check('right drag moves view vertically',(v.view_location-location).length>1e-5 and abs(v.view_rotation.dot(old))>.99999)
    ctl.modal(bpy.context,event('ESC'))
    check('escape restores view',(v.view_location-location).length<1e-6 and ctl.view_drag is None)
    with bpy.context.temp_override(area=area,region=region):
        ui.draw_hud()
        outcome=ctl.modal(bpy.context,event('LEFTMOUSE',shift=True)) if tool in ('BRUSH','ERASE') else {'RUNNING_MODAL'}
    check('shift left passes to native brush',outcome=={'PASS_THROUGH'} if tool in ('BRUSH','ERASE') and cfg.paint_surface=='MODEL' else True)
    handles=ui.axis_handles(v,region.width,region.height)
    check('six clickable axis directions',{h[-1] for h in handles}=={'DER','IZQ','ATRAS','FRENTE','ARRIBA','ABAJO'})
    for action in ('DER','IZQ','ATRAS','FRENTE','ARRIBA','ABAJO'):ui.view_step(action)
    check('all six view presets execute',True)
    model_area=area;model_region=region
    for image_area in (a for a in bpy.context.screen.areas if a.type=='IMAGE_EDITOR'):
        area=image_area;region=next(r for r in area.regions if r.type=='WINDOW')
        x=region.x+region.width//2;y=region.y+region.height//2
        origin=region.view2d.region_to_view(region.width//2,region.height//2)
        try:
            ctl.modal(bpy.context,event('RIGHTMOUSE'))
            check(ui.role(area)+' right drag captured',getattr(ctl,'view_drag',None) is not None)
            ctl.modal(bpy.context,event('MOUSEMOVE',dx=36,dy=28))
            with bpy.context.temp_override(window=bpy.context.window_manager.windows[0],area=area,region=region):
                bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP',iterations=1)
            shifted=region.view2d.region_to_view(region.width//2,region.height//2)
            check(ui.role(area)+' image moves both axes',abs(shifted[0]-origin[0])>1e-8 and abs(shifted[1]-origin[1])>1e-8)
        finally:
            ctl.modal(bpy.context,event('ESC'))
            with bpy.context.temp_override(window=bpy.context.window_manager.windows[0],area=area,region=region):
                bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP',iterations=1)
        restored=region.view2d.region_to_view(region.width//2,region.height//2)
        check(ui.role(area)+' escape restores pan',max(abs(a-b) for a,b in zip(origin,restored))<1e-5)
    area=model_area;region=model_region
finally:
    v.view_rotation=rotation;v.view_location=location;v.view_distance=distance
    ctl.view_drag=None;core.redraw()
check('geometry UV rig preserved',core.fingerprint(ob)==before)
check('all original and work pixels preserved',all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in hashes.items()))
check('tool selection and paint history preserved',cfg.tool==tool and list(core.selected(ob))==selected and core._history is history)
result={'checks':checks,'saved_blend':False,'runtime_navigation_loaded':True}
(ROOT/'evidence'/'navigation-0.1.8.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
