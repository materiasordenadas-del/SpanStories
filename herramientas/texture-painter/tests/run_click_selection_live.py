"""Real model ray/UV hits through the modal controller, preserving scene data."""
import bpy,sys,ast,json,hashlib
from types import SimpleNamespace
from pathlib import Path
ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=sys.modules['bl_ext.user_default.spanstories_texture_painter'];ui=addon.ui;core=addon.core
ui.SimpleNamespace=SimpleNamespace
tree=ast.parse((ROOT/'blender'/'spanstories_texture_painter'/'ui.py').read_text(encoding='utf8'))
node=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='SSTP_OT_controller')
method=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name=='modal')
ns={};exec(compile(ast.Module(body=[method],type_ignores=[]),'navigation','exec'),ui.__dict__,ns)
ui.SSTP_OT_controller.modal=ns['modal']
for op in bpy.context.window.modal_operators:
    if op.bl_idname=='SSTP_OT_controller':op.view_drag=None
cfg=bpy.context.scene.sstp;ob=cfg.target;g=core.geometry(ob)
original=list(core.selected(ob));stamp=core.fingerprint(ob);material=ob.active_material_index
pixels={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for im in bpy.data.images if im.has_data}
model=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
uv=next(a for a in bpy.context.screen.areas if ui.role(a)=='UV')
reg=lambda a:next(r for r in a.regions if r.type=='WINDOW')
mr=reg(model);ur=reg(uv)
rotation=model.spaces.active.region_3d.view_rotation.copy()
ctl=SimpleNamespace(token=ui._session_token,report=lambda *args:None)
def event(a,x,y,kind='LEFTMOUSE',value='PRESS'):
    r=reg(a)
    return SimpleNamespace(type=kind,value=value,mouse_x=r.x+x,mouse_y=r.y+y,shift=False,alt=False)
def dispatch(e):return ui.SSTP_OT_controller.modal(ctl,bpy.context,e)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
try:
    check('selection tool active',cfg.tool=='SELECT')
    hit=None
    for y in range(310,mr.height-180,16):
        for x in range(25,mr.width-160,16):
            result=ui.model_hit(bpy.context,model,mr,(x,y))
            if result[1]:hit=(x,y,result[3]);break
        if hit:break
    check('real visible model hit found',hit is not None)
    x,y,face=hit;core.select_regions([],ob.name)
    dispatch(event(model,x,y));dispatch(event(model,x+1,y+1,'MOUSEMOVE','NOTHING'))
    check('small hand movement does not orbit',abs(model.spaces.active.region_3d.view_rotation.dot(rotation))>.999999)
    dispatch(event(model,x,y,value='RELEASE'))
    check('model click selects exact matching UV island',core.selected(ob)==[g['by_face'][face]])
    # The UV atlas may have switched with material selection; update View2D.
    with bpy.context.temp_override(window=bpy.context.window_manager.windows[0],area=uv,region=ur):
        bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP',iterations=1)
    uvhit=None
    for f,coords in enumerate(g['face_uv']):
        if ob.data.polygons[f].material_index!=ob.active_material_index:continue
        u,v=coords.mean(axis=0);px,py=ur.view2d.view_to_region(float(u),float(v),clip=False)
        if 20<px<ur.width-20 and 50<py<ur.height-50:
            ids=core.pick_uv(*ur.view2d.region_to_view(px,py),ob.name)
            if ids:uvhit=(px,py,ids);break
    check('real visible UV hit found',uvhit is not None)
    px,py,ids=uvhit;core.select_regions([],ob.name)
    # Reproduce a missed release in MODEL, then click UV: must not stay trapped.
    dispatch(event(model,x,y))
    dispatch(event(uv,px,py))
    check('UV press recovers from lost model release',core.selected(ob)==ids and ctl.view_drag is None)
    dispatch(event(uv,px,py,value='RELEASE'))
    check('UV click selects shared model region',core.selected(ob)==ids and len(core.faces_of(g,ids))>0)
    dispatch(event(model,x,y));dispatch(event(model,x+25,y+12,'MOUSEMOVE','NOTHING'))
    check('drag still orbits',abs(model.spaces.active.region_3d.view_rotation.dot(rotation))<.99999)
    before=list(core.selected(ob));dispatch(event(model,x+25,y+12,value='RELEASE'))
    check('drag does not change selection',core.selected(ob)==before)
finally:
    ctl.view_drag=None;model.spaces.active.region_3d.view_rotation=rotation
    core.select_regions(original,ob.name);ob.active_material_index=material;core.sync_images(ob);core.redraw()
check('geometry UV rig unchanged',core.fingerprint(ob)==stamp)
check('all image pixels unchanged',all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in pixels.items()))
result={'checks':checks,'saved_blend':False}
(ROOT/'evidence'/'click-selection-live.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
