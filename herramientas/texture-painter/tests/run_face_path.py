"""Disposable Blender fixture: Ctrl selects A-B-C-D, Shift remains a toggle."""
import ast,json,sys
from pathlib import Path
from types import SimpleNamespace as NS
from contextlib import nullcontext
from mathutils import Quaternion,Vector
import bpy
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,ui
mesh=bpy.data.meshes.new('Face path test')
verts=[(x,y,0) for y in (0,1) for x in range(5)]+[(9,0,0),(10,0,0),(10,1,0),(9,1,0)]
mesh.from_pydata(verts,[],[(i,i+1,i+6,i+5) for i in range(4)]+[(10,11,12,13)])
uv=mesh.uv_layers.new()
for p in mesh.polygons:
    for li in p.loop_indices:
        co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co.x/10,co.y)
mat=bpy.data.materials.new('Path material');mesh.materials.append(mat)
ob=bpy.data.objects.new('Face path test',mesh);bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.context.scene.sstp.target=ob
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
before=core.fingerprint(ob)
core.select_face(0,as_face=True,path=True)
check('first Ctrl click selects A',core.selected(ob)==['face-0'])
core.select_face(3,as_face=True,path=True)
check('Ctrl D selects A B C D',set(core.selected(ob))=={'face-0','face-1','face-2','face-3'})
check('anchor advances to D',core.state(ob)['face_anchor']==3)
core.select_face(1,as_face=True,path=True)
check('reverse path retains selected endpoints',len(core.selected(ob))==4)
core.select_face(4,as_face=True,path=True)
check('disconnected click only adds endpoint',len(core.selected(ob))==5)
core.select_face(2,as_face=True,extend=True)
check('Shift still toggles one face off','face-2' not in core.selected(ob))
core.select_regions([])
check('clear removes anchor','face_anchor' not in core.state(ob))
core.select_face(3,as_face=True,path=True)
check('fresh Ctrl click has no stale path',core.selected(ob)==['face-3'])
core.select_face(0,as_face=True)
core.select_face(2,as_face=True,path=True)
check('ordinary click also establishes anchor',set(core.selected(ob))=={'face-0','face-1','face-2'})
check('neighbor cache reused',core.geometry(ob)['face_neighbors'] is core.geometry(ob)['face_neighbors'])
check('mesh UV rig unchanged',before==core.fingerprint(ob))

# Exercise actual click routing in both editors, including the Ctrl modifier.
cfg=bpy.context.scene.sstp;cfg.tool='SELECT';cfg.select_mode='FACE';cfg.picker=False
region=NS(x=0,y=0,view2d=NS(region_to_view=lambda *xy:(.35,.5)))
area=NS(as_pointer=lambda:123)
context=NS(area=area,region=region,scene=bpy.context.scene)
ns=ui.__dict__.copy();ns['_buttons']={};ns['role']=lambda _:current_role[0]
ns['model_hit']=lambda *args:(None,True,None,3,12)
tree=ast.parse((ROOT/'blender/spanstories_texture_painter/ui.py').read_text(encoding='utf8'))
cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='SSTP_OT_click')
method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='invoke')
exec(compile(ast.Module(body=[method],type_ignores=[]),'click_path','exec'),ns)
event=NS(mouse_x=100,mouse_y=100,shift=False,ctrl=True,alt=False)
current_role=['MODEL']
for role in ['MODEL','UV']:
    current_role[0]=role;core.select_face(0,as_face=True)
    outcome=ns['invoke'](NS(report=lambda *args:None),context,event)
    check(role+' Ctrl click selects path',outcome=={'FINISHED'} and set(core.selected(ob))=={'face-0','face-1','face-2','face-3'})
controller=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='SSTP_OT_controller')
modal=next(n for n in controller.body if isinstance(n,ast.FunctionDef) and n.name=='modal')
seen=[]
ns.update(active_workspace=lambda:True,SSTP_OT_click=NS(invoke=lambda self,ctx,e:seen.append(e.ctrl)))
exec(compile(ast.Module(body=[modal],type_ignores=[]),'controller_path','exec'),ns)
region=NS(type='WINDOW',x=0,y=0,width=800,height=800)
view=NS(view_rotation=Quaternion(),view_location=Vector((0,0,0)))
area=NS(type='VIEW_3D',x=0,y=0,width=800,height=800,regions=[region],spaces=NS(active=NS(region_3d=view)),as_pointer=lambda:123)
context=NS(screen=NS(areas=[area]),scene=bpy.context.scene,temp_override=lambda **kwargs:nullcontext())
ctl=NS(token=ui._session_token)
event=NS(type='LEFTMOUSE',value='PRESS',mouse_x=100,mouse_y=400,shift=False,ctrl=True,alt=False)
ns['modal'](ctl,context,event)
check('controller keeps Ctrl until release',ctl.view_drag[6]['ctrl'])
event.value='RELEASE';ns['modal'](ctl,context,event)
check('deferred model click receives Ctrl',seen==[True])
report={'passed':len(checks),'checks':checks,'blend_saved':False}
print(json.dumps(report))
