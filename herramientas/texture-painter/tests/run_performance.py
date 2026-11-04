"""Pixel-exact regressions and timings against the installed 0.1.4 baseline."""
import sys,importlib.util,time,json
from pathlib import Path
import bpy,numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,padding
BASE=ROOT/'evidence'/'baseline-0.1.4'
spec=importlib.util.spec_from_file_location('previous_padding',BASE/'padding.py');previous=importlib.util.module_from_spec(spec);spec.loader.exec_module(previous)
spec=importlib.util.spec_from_file_location('previous_addon',BASE/'__init__.py',submodule_search_locations=[str(BASE)])
old=importlib.util.module_from_spec(spec);sys.modules[spec.name]=old;spec.loader.exec_module(old)
checks=[]
def check(label,value):
    assert value,label
    checks.append(label)
def timed(fn):
    start=time.perf_counter();value=fn();return value,round(time.perf_counter()-start,5)
rng=np.random.default_rng(815)
for shape in ((9,13),(32,48),(64,96)):
    for density in (0,.02,.3,.9,1):
        mask=rng.random(shape)<density
        for margin in (0,1,4,16):
            a=previous.gutter_indices(mask,margin);b=padding.gutter_indices(mask,margin)
            check('exact gutter '+str((shape,density,margin)),all(np.array_equal(x,y) for x,y in zip(a,b)))
mask=np.zeros((2048,2048),bool)
for y in range(30,2000,240):
    for x in range(30,2000,240):mask[y:y+190,x:x+180]=True
before,old_seconds=timed(lambda:previous.gutter_indices(mask))
after,new_seconds=timed(lambda:padding.gutter_indices(mask))
check('2K gutter destinations and sources identical',all(np.array_equal(x,y) for x,y in zip(before,after)))
mesh=bpy.data.meshes.new('Performance regression');mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(3,0,0),(3,1,0),(2,1,0)],[],[(0,1,2,3),(4,5,6,7)])
uv=mesh.uv_layers.new()
for d,co in zip(uv.data,[(.05,.05),(.4,.05),(.4,.9),(.05,.9),(.6,.05),(.95,.05),(.95,.9),(.6,.9)]):d.uv=co
mat=bpy.data.materials.new('Original');mat.use_nodes=True;mesh.materials.append(mat)
ob=bpy.data.objects.new('Performance fixture',mesh);bpy.context.collection.objects.link(ob);bpy.context.scene.sstp.target=ob
ob.shape_key_add(name='Basis');ob.shape_key_add(name='Smile')
before_mesh=core.fingerprint(ob);core.prepare(ob.name,1024)
ids=list(core.geometry(ob)['islands']);core.select_regions([ids[0]],ob.name)
s=core.state(ob);im=bpy.data.images[s['layers'][0]['images']['0']];initial=core.pixels(im).copy()
color=(.1,.6,.3,.8)
old.core.fill(color,ob.name);old_pixels=old.core.pixels(im).copy()
core.write_pixels(im,initial)
core.fill(color,ob.name);check('fill pixel identical to 0.1.4',np.array_equal(core.pixels(im),old_pixels))
check('composite pixel identical to 0.1.4',np.array_equal(core.composite(ob,0),old.core.composite(ob,0)))
core.history_step(object_name=ob.name);check('undo remains exact',np.array_equal(core.pixels(im),initial))
core.history_step(True,ob.name);check('redo remains exact',np.array_equal(core.pixels(im),old_pixels))
mask1=core.raster(ob,[ids[0]],0,1024);mask2=core.raster(ob,[ids[0]],0,1024)
check('repeated region reuses mask',mask1 is mask2 and not mask1.flags.writeable)
core.geometry(ob,True)
check('geometry refresh invalidates raster',core.raster(ob,[ids[0]],0,1024) is not mask1)
cfg=bpy.context.scene.sstp;cfg.uv_texture=True;core.sync_images(ob)
preview=bpy.data.images[core.state(ob)['preview']];version=core._image_versions[preview.as_pointer()]
core.sync_images(ob)
check('unchanged selection does not rewrite atlas',core._image_versions[preview.as_pointer()]==version)
core.fill((.7,.2,.4,1),ob.name);core.sync_images(ob)
check('painting invalidates atlas immediately',core._image_versions[preview.as_pointer()]>version)
version=core._image_versions[preview.as_pointer()];core.history_step(object_name=ob.name);core.sync_images(ob)
check('undo invalidates atlas immediately',core._image_versions[preview.as_pointer()]>version)
check('mesh UV shape keys preserved',core.fingerprint(ob)==before_mesh)
check('raster memory bounded',core._raster_bytes<=core.RASTER_CACHE_BYTES)
result={'passed':len(checks),'gutter_2048_before_seconds':old_seconds,'gutter_2048_after_seconds':new_seconds,'gutter_speedup':round(old_seconds/new_seconds,2),'checks':checks}
(ROOT/'evidence'/'performance-regressions-0.1.5.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_PERFORMANCE '+json.dumps({k:v for k,v in result.items() if k!='checks'}))
