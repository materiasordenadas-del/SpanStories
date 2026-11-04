"""Disposable exact-overlap fixtures, including folded faces in one UV island."""
import bpy,sys,json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)
mesh=bpy.data.meshes.new('exclusive fixture')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(3,0,0),(3,1,0),(2,1,0),(4,0,0),(5,0,0),(5,1,0),(4,1,0)],[],[(0,1,2,3),(4,5,6,7),(8,9,10,11)])
uv=mesh.uv_layers.new(name='OriginalUV')
for loop,co in zip(uv.data,[(.1,.1),(.4,.1),(.4,.4),(.1,.4),(.6,.6),(.9,.6),(.9,.9),(.6,.9),(.1,.1),(.4,.1),(.4,.4),(.1,.4)]):loop.uv=co
mat=bpy.data.materials.new('original');mat.use_nodes=True;mesh.materials.append(mat)
ob=bpy.data.objects.new('exclusive fixture',mesh);bpy.context.collection.objects.link(ob);bpy.context.scene.sstp.target=ob
core.prepare(resolution=1024);g=core.geometry(ob);a,b,c=[g['by_face'][f] for f in range(3)]
s=core.state(ob);im=bpy.data.images[s['layers'][0]['images']['0']];before=core.pixels(im).copy();stamp=core.fingerprint(ob)
core.select_regions([a]);blocked=False
try:core.fill((1,0,0,1),exclusive=True)
except ValueError:blocked=True
check('fully shared fill blocks without writing',blocked and np.array_equal(core.pixels(im),before))
blocked=False
try:core.begin_stroke(ob,exclusive=True)
except ValueError:blocked=True
check('fully shared brush blocks without writing',blocked and np.array_equal(core.pixels(im),before))
core.select_regions([a,b]);result=core.fill((1,0,0,1),exclusive=True)
mask=core.raster(ob,[b],0,1024);shared=core.raster(ob,[a],0,1024)
data=core.pixels(im)
check('mixed selection paints only exclusive island',result['pixels']==int(mask.sum()) and np.all(data[mask]==(1,0,0,1)))
check('mixed selection preserves all shared surface texels',np.array_equal(data[shared],before[shared]))
core.history_step();check('exclusive fill undo restores image',np.array_equal(core.pixels(im),before))
core.history_step(True);check('exclusive fill redo restores safe paint',np.array_equal(core.pixels(im),data))
check('geometry and UV remain identical',core.fingerprint(ob)==stamp)
# A folded pair is one continuous island, but face 0 must not paint face 1.
fold=bpy.data.meshes.new('folded UV fixture')
fold.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(2,1,0)],[],[(0,1,2,3),(1,4,5,2)])
uv=fold.uv_layers.new(name='FoldedUV')
for loop,co in zip(uv.data,[(.1,.1),(.4,.1),(.4,.4),(.1,.4),(.4,.1),(.1,.1),(.1,.4),(.4,.4)]):loop.uv=co
other=bpy.data.objects.new('folded fixture',fold);bpy.context.collection.objects.link(other)
g=core.geometry(other)
check('folded fixture really has one connected island',len(g['islands'])==1)
check('face selection protects unselected face in same island',not core.exclusive_mask(other,['face-0'],0,1024).any())
check('selecting both folded faces permits their texels',core.exclusive_mask(other,['face-0','face-1'],0,1024).any())
result={'passed':len(checks),'checks':checks}
(ROOT/'evidence'/'exclusive-mask-tests.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_EXCLUSIVE_RESULT '+json.dumps(result))
