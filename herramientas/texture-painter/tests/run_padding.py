"""Regression: filtered UV seams, neighbors, erase, history and native brush guard.
Run in a separate Blender process, never in the user's open scene.
"""
import sys,json,time,hashlib
from pathlib import Path
import bpy,numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,padding,agent
VERSION='.'.join(map(str,addon.bl_info['version']))
OUT=ROOT/'evidence'/('padding-'+VERSION);OUT.mkdir(parents=True,exist_ok=True)
checks=[];start=time.monotonic()
def check(name,condition):
    assert condition,name
    checks.append(name)

# Distinct island seeds compete without crossing occupied neighboring texels.
mask=np.zeros((64,96),bool);mask[9:55,8:32]=True;mask[9:55,38:62]=True
idx=padding.gutter_indices(mask,8)
data=np.zeros((64,96,4),np.float32);data[9:55,8:32]=(.8,.02,.01,1);data[9:55,38:62]=(.01,.02,.8,.5)
padded=padding.apply_gutter(data,idx)
check('all surface texels unchanged by padding',np.array_equal(data[mask],padded[mask]))
check('gutter extends red island',np.allclose(padded[30,33],(.8,.02,.01,1)))
check('gutter extends blue neighboring island',np.allclose(padded[30,36],(.01,.02,.8,.5)))
check('alpha remains straight and fractional',padded[30,36,3]==.5)
check('outside gutter remains untouched',np.array_equal(padded[0,90],data[0,90]))
check('padding is idempotent',np.array_equal(padding.apply_gutter(padded,idx),padded))
erased=data.copy();erased[9:55,8:32]=0
check('erase clears the old gutter',not np.any(padding.apply_gutter(erased,idx)[30,33]))
empty=padding.gutter_indices(np.zeros((8,8),bool));check('empty UV layout is safe',len(empty[0])==0)

scene=bpy.data.scenes.new('Padding regression');bpy.context.window.scene=scene
mesh=bpy.data.meshes.new('Two connected surfaces with separate UVs')
mesh.from_pydata([(-1,-.5,0),(0,-.5,0),(0,.5,0),(-1,.5,0),(1,-.5,0),(1,.5,0)],[],[(0,1,2,3),(1,4,5,2)])
uv=mesh.uv_layers.new(name='PreservedUV')
u1=204.95/1024;u2=614.05/1024
for item,co in zip(uv.data,[(.1,.1),(u1,.1),(u1,.4),(.1,.4),(u2,.6),(.8,.6),(.8,.9),(u2,.9)]):item.uv=co
mat=bpy.data.materials.new('Protected white');mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(1,1,1,1)
mesh.materials.append(mat);ob=bpy.data.objects.new('Seam fixture',mesh);scene.collection.objects.link(ob)
bpy.context.view_layer.objects.active=ob;ob.select_set(True);scene.sstp.target=ob
ob.shape_key_add(name='Basis');ob.shape_key_add(name='Smile');ob.data.shape_keys.key_blocks['Smile'].data[0].co.z=.03
before=core.fingerprint(ob);core.prepare();g=core.geometry(ob);ids=list(g['islands']);core.select_regions(ids)
check('two independent UV islands detected',len(ids)==2)
s=core.state(ob);layer=bpy.data.images[s['layers'][0]['images']['0']];base=bpy.data.images[s['slots']['0']['base']]
basehash=hashlib.sha256(core.pixels(base).tobytes()).hexdigest()
color=[.35,.015,.025,1];original_padding=core.paint_padding
core.paint_padding=lambda ob,slot,data:data.copy()
core.fill(color)
unfixed=core.pixels(layer).copy();core.paint_padding=original_padding

# Emission displays the same texture filtering with no lighting ambiguity.
workmat=ob.material_slots[0].material;nt=workmat.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');em=nt.nodes.new('ShaderNodeEmission')
nt.links.new(bs.inputs['Base Color'].links[0].from_socket,em.inputs['Color']);nt.links.new(em.outputs[0],output.inputs['Surface'])
camdata=bpy.data.cameras.new('Seam camera');cam=bpy.data.objects.new('Seam camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(0,0,3);camdata.type='ORTHO';camdata.ortho_scale=2.2
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
scene.render.resolution_x=512;scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
def render(name):
    path=OUT/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    im=bpy.data.images.load(str(path),check_existing=False);a=core.image_linear(im)
    return float(a[90:166,255:257,1].mean())
baseline_green=render('seam-before')
core.fill(color);fixed=core.pixels(layer).copy();fixed_green=render('seam-after')
check('original defect reproduced in actual render',baseline_green>.04)
check('padded render removes pale seam',fixed_green<.025 and baseline_green>fixed_green*2)
occupied=core.raster(ob,ids,0,1024)
check('fill preserves exact on-surface colors',np.allclose(fixed[occupied],color))
check('fill includes a filtering gutter',np.any(fixed[~occupied,3]>0))
core.select_regions([ids[0]]);other=core.raster(ob,[ids[1]],0,1024);old=core.pixels(layer).copy()
core.fill([.01,.6,.1,1]);check('fill leaves neighbor surface byte-identical',np.array_equal(core.pixels(layer)[other],old[other]))
core.history_step();check('undo restores full layer including gutter',np.array_equal(core.pixels(layer),old))
core.history_step(True);changed=core.pixels(layer).copy();check('redo restores changed surface',not np.array_equal(changed,old))
core.fill([0,0,0,0],erase=True);erased=core.pixels(layer).copy();left=core.raster(ob,[ids[0]],0,1024)
check('erase clears selected surface',not np.any(erased[left,3]))
check('erase preserves neighbor surface',np.array_equal(erased[other],old[other]))
core.history_step();check('erase undo restores layer and gutter',np.array_equal(core.pixels(layer),changed))
core.brush_stroke([[u1,.25]],[.5,.2,.1,.6],radius=12)
check('2D brush preserves neighbor surface',np.array_equal(core.pixels(layer)[other],old[other]))
native_before=core.pixels(layer).copy();simulated=native_before.copy();simulated[occupied]=[1,1,0,1]
guarded=core.native_paint_pixels(ob,0,simulated,native_before,[ids[0]])
check('native brush bleed cannot overwrite neighbor',np.array_equal(guarded[other],native_before[other]))
check('native brush keeps selected changes',np.allclose(guarded[left],[1,1,0,1]))
png=core.export_png(str(OUT/'export'))
check('PNG exported with shared compositing',Path(png['textures'][0]['file']).is_file())
check('protected base pixels unchanged',hashlib.sha256(core.pixels(base).tobytes()).hexdigest()==basehash)
check('mesh UV and shape keys unchanged',core.fingerprint(ob)==before)
check('original material unchanged',list(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)==[1,1,1,1])
ctx=agent.start(ob.name)
check('agent receives installed version',ctx['addon_version']==VERSION)
check('agent receives mandatory self-improvement law',ctx['self_improvement']['required'])
result={'passed':len(checks),'checks':checks,'render_green_before':baseline_green,'render_green_after':fixed_green,'seconds':round(time.monotonic()-start,2),'live_character_modified':False}
(ROOT/'evidence'/('padding-'+VERSION+'.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_PADDING_RESULT '+json.dumps(result))
