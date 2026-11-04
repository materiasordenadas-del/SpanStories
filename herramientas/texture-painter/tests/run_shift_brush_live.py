"""Exercise Shift routing and a real native paint stroke, then restore every texel."""
import bpy,sys,ast,json,hashlib
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=sys.modules['bl_ext.user_default.spanstories_texture_painter'];ui=addon.ui;core=addon.core
path=ROOT/'blender'/'spanstories_texture_painter'/'ui.py';tree=ast.parse(path.read_text(encoding='utf8'))
for name in ('start_native_stroke','finish_native_stroke','run_action','draw_hud'):
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    ns={};exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),ui.__dict__,ns)
    if name in ui.__dict__:ui.__dict__[name].__code__=ns[name].__code__
    else:ui.__dict__[name]=ns[name]
for cls,method in (('SSTP_OT_click','invoke'),('SSTP_OT_controller','modal'),('SSTP_OT_brush','execute')):
    node=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==cls)
    fn=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name==method)
    ns={};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(path),'exec'),ui.__dict__,ns)
    setattr(getattr(ui,cls),method,ns[method])
for op in bpy.context.window.modal_operators:
    if op.bl_idname=='SSTP_OT_controller':op.view_drag=None
c=bpy.context.scene.sstp;ob=c.target;g=core.geometry(ob)
original=list(core.selected(ob));material=ob.active_material_index
saved=(c.tool,c.paint_surface,tuple(c.color),c.brush_size,c.strength)
stamp=core.fingerprint(ob)
hashes={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for im in bpy.data.images if im.has_data}
s=core.state(ob)
buffers={n:core.pixels(bpy.data.images[n]).copy() for n in s['layers'][s['active_layer']]['images'].values()}
history=core._history;history_items={k:{a:list(b) for a,b in v.items()} for k,v in history.items()}
area=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D');region=next(r for r in area.regions if r.type=='WINDOW')
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)
hit=None
for y in range(310,region.height-180,18):
    for x in range(30,region.width-170,18):
        result=ui.model_hit(bpy.context,area,region,(x,y))
        if result[1]:hit=(x,y,result[3]);break
    if hit:break
assert hit,'visible model required'
x,y,face=hit
try:
    core.select_face(face)
    with bpy.context.temp_override(area=area,region=region):
        ui.run_action('PAINT_MODEL',bpy.context)
    check('3D brush activates native paint mode',ob.mode=='TEXTURE_PAINT' and c.tool=='BRUSH')
    c.color=(.9,.01,.8,1);c.strength=1;c.brush_size=24;ui.color_changed(c,bpy.context)
    # Check the exact Shift route, without leaving an interactive stroke running.
    original_start=ui.start_native_stroke;calls=[]
    ui.start_native_stroke=lambda ctx:calls.append('native') or {'FINISHED'}
    try:
        ctl=SimpleNamespace(token=ui._session_token,report=lambda *a:None)
        e=SimpleNamespace(type='LEFTMOUSE',value='PRESS',mouse_x=region.x+x,mouse_y=region.y+y,shift=True,alt=False)
        ui.SSTP_OT_controller.modal(ctl,bpy.context,e)
        check('Shift left invokes native brush explicitly',calls==['native'] and not getattr(ctl,'view_drag',None))
    finally:ui.start_native_stroke=original_start
    source=ast.get_source_segment(path.read_text(encoding='utf8'),next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='start_native_stroke'))
    check('native paint disables temporary Smooth override',"brush_toggle='None'" in source)
    before={n:core.pixels(bpy.data.images[n]).copy() for n in buffers}
    stroke=[{'name':'','mouse':(x+i,y),'mouse_event':(x+i,y),'pressure':1.,'size':24.,'time':i*.01,'is_start':i==0,'location':(0.,0.,0.),'x_tilt':0.,'y_tilt':0.} for i in (0,4,8)]
    with bpy.context.temp_override(area=area,region=region):
        result=bpy.ops.paint.image_paint('EXEC_DEFAULT',stroke=stroke,mode='NORMAL',brush_toggle='None')
    check('native stroke executes',result=={'FINISHED'})
    check('native stroke actually paints pixels',any(not (core.pixels(bpy.data.images[n])==data).all() for n,data in before.items()))
    ui.run_action('SIZE:5',bpy.context);check('size control works',c.brush_size==29)
    ui.run_action('STRENGTH:-0.1',bpy.context);check('strength control works',abs(c.strength-.9)<1e-5)
    with bpy.context.temp_override(area=area,region=region):ui.draw_hud()
    actions=[a for rect,a in ui._buttons[area.as_pointer()]]
    check('brush menu exposes both surfaces catalog and settings',all(a in actions for a in ('PAINT_MODEL','PAINT_UV','ERASE','CATALOG','SIZE:5','STRENGTH:-0.1')))
finally:
    for n,data in buffers.items():core.write_pixels(bpy.data.images[n],data)
    ui.end_paint(bpy.context)
    for n,data in buffers.items():core.write_pixels(bpy.data.images[n],data)
    core._history=history;history.clear();history.update(history_items)
    core.select_regions(original);ob.active_material_index=material
    c.color=saved[2];c.brush_size=saved[3];c.strength=saved[4];c.paint_surface=saved[1]
    core.sync_images(ob);core.redraw()
check('geometry UV rig unchanged',core.fingerprint(ob)==stamp)
check('all original and work pixels restored',all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in hashes.items()))
result={'checks':checks,'saved_blend':False,'temporary_test_stroke_restored':True}
(ROOT/'evidence'/'shift-brush-live.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
