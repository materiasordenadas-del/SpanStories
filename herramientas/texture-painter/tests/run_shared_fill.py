"""Shared UV zone fill must color the full selection without changing neighbors."""
import bpy,sys,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core
m=bpy.data.meshes.new('Shared fill fixture')
m.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(2,1,0)],[],[(0,1,2,3),(1,4,5,2)])
uv=m.uv_layers.new()
for item,co in zip(uv.data,[(.1,.1),(.9,.1),(.9,.9),(.1,.9)]*2):item.uv=co
mat=bpy.data.materials.new('Original');mat.use_nodes=True;m.materials.append(mat)
o=bpy.data.objects.new('Shared fill fixture',m);bpy.context.collection.objects.link(o)
bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.context.scene.sstp.target=o
core.prepare(o.name,1024);s=core.state(o);name=s['layers'][0]['images']['0'];im=bpy.data.images[name]
dark=core.pixels(im);dark[:]=(.017,.015,.015,1);core.write_pixels(im,dark)
original=core.fingerprint(o)
core.select_face(0);ids=core.selected(o)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
check('selected zone is fully shared',not core.exclusive_mask(o,ids,0,1024).any())
try:core.fill((.14,.13,.055,1),o.name,exclusive=True)
except ValueError:check('old protected fill blocks this zone',True)
else:raise AssertionError('Expected old protected fill to block')
for color in [(.14,.13,.055,1),(.7,.1,.05,1)]:
    result=core.fill(color,o.name,exclusive=True,shared_fallback=True)
    check('shared zone uses exact fill '+str(color),result['exact_faces'] and result['faces']==1)
    check('selected face receives chosen color '+str(color),np.allclose(core.sample_surface(0,[.25]*4,o.name),color))
    check('unselected neighbor remains dark '+str(color),np.allclose(core.sample_surface(1,[.25]*4,o.name)[:3],(.017,.015,.015)))
    check('no texture pixels overwritten '+str(color),np.array_equal(core.pixels(im),dark))
core.history_step(object_name=o.name)
check('undo restores preceding color',np.allclose(core.sample_surface(0,[.25]*4,o.name)[:3],(.14,.13,.055)))
core.history_step(True,o.name)
check('redo restores new color',np.allclose(core.sample_surface(0,[.25]*4,o.name)[:3],(.7,.1,.05)))
core.set_layer(0,o.name,visible=False)
check('layer visibility applies to fallback',all(p.material_index==0 for p in m.polygons))
core.set_layer(0,o.name,visible=True)
after=core.fingerprint(o)
check('geometry UV rig unchanged',all(original[k]==after[k] for k in original if k!='faces') and [p[:2] for p in original['faces']]==[p[:2] for p in after['faces']])
cfg=bpy.context.scene.sstp;cfg.select_mode='ZONES'
result=bpy.ops.sstp.fill(erase=True)
check('zone erase removes exact override',result=={'FINISHED'} and all(p.material_index==0 for p in m.polygons))
print(json.dumps({'passed':len(checks),'checks':checks}))
