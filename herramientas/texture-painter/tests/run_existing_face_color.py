"""Zone recolor must override an existing exact fill, not hidden texture pixels."""
import bpy,sys,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core
mesh=bpy.data.meshes.new('Recolor fixture')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(3,0,0),(3,1,0),(2,1,0)],[],[(0,1,2,3),(4,5,6,7)])
uv=mesh.uv_layers.new(name='Separate islands')
for face,box in zip(mesh.polygons,[(.05,.4),(.6,.95)]):
    lo,hi=box
    for i,p in zip(face.loop_indices,[(lo,.1),(hi,.1),(hi,.9),(lo,.9)]):uv.data[i].uv=p
ob=bpy.data.objects.new('Recolor fixture',mesh);bpy.context.collection.objects.link(ob)
mat=bpy.data.materials.new('Original material');mat.use_nodes=True;mesh.materials.append(mat)
bpy.context.scene.sstp.target=ob
core.prepare(ob.name,1024);core.select_face(0,as_face=True)
blue=[.1,.2,.8,1];wanted=[.8,.3,.1,1]
core.fill(blue,ob.name,exact_faces=True)
before=core.fingerprint(ob);neighbor=mesh.polygons[1].material_index
base_color=core.sample_surface(1,[.25]*4,ob.name)
cfg=bpy.context.scene.sstp;cfg.select_mode='ZONES';cfg.color=wanted
core.select_face(0,as_face=False)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
check('islands do not share texels',not core.overlap_report(ob.name)['overlaps'])
check('actual Apply Color operator succeeds',bpy.ops.sstp.fill()=={'FINISHED'})
check('visible face gets current selected color',np.allclose(core.sample_surface(0,[.25]*4,ob.name),wanted))
check('neighbor color unchanged',np.allclose(core.sample_surface(1,[.25]*4,ob.name),base_color))
check('neighbor material unchanged',mesh.polygons[1].material_index==neighbor)
after=core.fingerprint(ob)
check('geometry UV rig and pose unchanged',all(before[k]==after[k] for k in before if k!='faces'))
check('undo restores previous face color',core.history_step(object_name=ob.name)['changed'] and np.allclose(core.sample_surface(0,[.25]*4,ob.name),blue))
check('redo restores recolored face',core.history_step(redo=True,object_name=ob.name)['changed'] and np.allclose(core.sample_surface(0,[.25]*4,ob.name),wanted))
check('zone erase still works',bpy.ops.sstp.fill(erase=True)=={'FINISHED'} and not core.state(ob).get('exact_fills'))
check('erase preserves neighboring material',mesh.polygons[1].material_index==neighbor)
out={'passed':len(checks),'checks':checks,'blend_saved':False}
directory=ROOT/'evidence/arms-color-0.1.24';directory.mkdir(parents=True,exist_ok=True)
(directory/'regression.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps(out))
