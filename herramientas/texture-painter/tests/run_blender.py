"""Run in a separate Blender process. Never edits the live character."""
import sys, json, struct, hashlib
from pathlib import Path
import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core

OUT=ROOT/'evidence'/'synthetic'
OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,expr):
    assert expr,name
    checks.append(name)

mesh=bpy.data.meshes.new('Test geometry')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(3,0,0),(3,1,0),(2,1,0),(4,0,0),(5,0,0),(5,1,0),(4,1,0)],[],[(0,1,2,3),(4,5,6,7),(8,9,10,11)])
uv=mesh.uv_layers.new(name='OriginalUV')
uvs=[(.05,.05),(.45,.05),(.45,.45),(.05,.45),(.55,.55),(.95,.55),(.95,.95),(.55,.95),(.05,.05),(.45,.05),(.45,.45),(.05,.45)]
for item,co in zip(uv.data,uvs):item.uv=co
mat=bpy.data.materials.new('Original'); mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.2,.3,.4,1)
mesh.materials.append(mat)
ob=bpy.data.objects.new('Test character',mesh); bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
ob.shape_key_add(name='Basis'); ob.shape_key_add(name='Smile'); ob.data.shape_keys.key_blocks['Smile'].data[0].co.z=.2
ob.data.shape_keys.key_blocks['Smile'].value=.25
bpy.context.scene.sstp.target=ob
before=core.fingerprint(ob)
g=core.geometry(ob); ids=list(g['islands'])
check('three separate islands',len(ids)==3)
check('island ids stable',list(core.geometry(ob,True)['islands'])==ids)
core.prepare(resolution=1024)
check('original material unchanged',list(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)==list((np.float32(.2),np.float32(.3),np.float32(.4),np.float32(1))))
check('original material retained',ob.material_slots[0].material!=mat)
core.select_face(0)
check('UV click maps to matching island',core.pick_uv(.2,.2)==[ids[0],ids[2]])
check('overlap reported',ids[2] in core.overlap_report()['overlaps'])
try:core.fill([.5,.01,.02,1]); blocked=False
except ValueError:blocked=True
check('overlap requires confirmation',blocked)
core.select_regions([ids[1]])
core.save_group('SLEEVE'); core.select_regions([]); core.select_group('SLEEVE')
check('named group restores selection',core.selected(ob)==[ids[1]])
color=[.409127,.008681,.013979,1]
core.fill(color)
check('fill only affects selected UV',np.allclose(core.composite(ob,0)[700,700],color) and np.allclose(core.composite(ob,0)[200,200],[.2,.3,.4,1]))
core.history_step();check('undo fill',np.allclose(core.composite(ob,0)[700,700],[.2,.3,.4,1]))
core.history_step(True);check('redo fill',np.allclose(core.composite(ob,0)[700,700],color))
core.fill([.3,.4,.5,1]); core.fill(color); core.history_step();core.history_step();core.history_step(True);core.history_step(True)
check('repeated transactions',np.allclose(core.composite(ob,0)[700,700],color))
core.add_layer('Detail'); core.fill([.01,.8,.03,.5]); expected=np.array(color)*.5+np.array([.01,.8,.03,1])*.5; expected[3]=1
check('layer compositing',np.allclose(core.composite(ob,0)[700,700],expected))
core.set_layer(1,visible=False);check('layer visibility',np.allclose(core.composite(ob,0)[700,700],color))
core.set_layer(1,visible=True);core.fill([0,0,0,0],erase=True)
check('eraser preserves lower layers',np.allclose(core.composite(ob,0)[700,700],color))
core.brush_stroke([[.6,.6],[.9,.9]],[.01,.9,.02,1],radius=30)
check('brush stroke changes selected UV',not np.allclose(core.composite(ob,0)[700,700],color))
check('brush stroke respects UV mask',np.allclose(core.composite(ob,0)[200,200],[.2,.3,.4,1]))
core.history_step();check('brush stroke undo',np.allclose(core.composite(ob,0)[700,700],color))
png=core.export_png(str(OUT),overwrite=True)
glb=core.export_glb(str(OUT/'character.glb'),overwrite=True)
check('geometry UV shape keys rig unchanged',core.fingerprint(ob)==before)
# Decode exported bytes using OpenCV to verify the actual PNG, not image metadata.
import cv2
decoded=cv2.imread(png['textures'][0]['file'],cv2.IMREAD_UNCHANGED)
actual=decoded[1023-700,700][[2,1,0]]/255
encoded=core.to_srgb(np.array(color[:3]))
print('PNG_COLOR_DEBUG',decoded.dtype,actual.tolist(),encoded.tolist())
check('PNG sRGB bytes match linear shader color',np.allclose(actual,encoded,atol=2/255))
data=(OUT/'character.glb').read_bytes()
check('GLB header',data[:4]==b'glTF')
jlen,jtype=struct.unpack_from('<II',data,12); gltf=json.loads(data[20:20+jlen])
binstart=20+jlen+8
check('GLB has embedded Base Color texture',bool(gltf.get('images')) and all('baseColorTexture' in m['pbrMetallicRoughness'] for m in gltf['materials']))
check('GLB has UV coordinates',all('TEXCOORD_0' in p['attributes'] for m in gltf['meshes'] for p in m['primitives']))
check('GLB retains morph targets',bool(gltf['meshes'][0]['primitives'][0].get('targets')))
im=gltf['images'][0]; view=gltf['bufferViews'][im['bufferView']]; offset=binstart+view.get('byteOffset',0); blob=data[offset:offset+view['byteLength']]
embedded=cv2.imdecode(np.frombuffer(blob,np.uint8),cv2.IMREAD_UNCHANGED)
# The web optimizer may shrink the texture: read the same UV, not the same pixel.
side=embedded.shape[0];texel=embedded[side-1-int(700*side/1024),int(700*side/1024)]
check('GLB embedded texture matches exported PNG',np.allclose(texel[[2,1,0]]/255,encoded,atol=6/255))
core.pack_project(); core.restore_originals(); check('restore originals',ob.material_slots[0].material==mat)
core.resume(); check('resume layers',ob.material_slots[0].material!=mat)
check('mesh remains unchanged after restore',core.fingerprint(ob)==before)
# Saving a synthetic fixture and reloading validates state/image persistence.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fixture.blend'))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'fixture.blend'))
ob=bpy.data.objects['Test character']; bpy.context.scene.sstp.target=ob
check('layers survive save and reopen',len(core.state(ob)['layers'])==2)
check('colors survive save and reopen',np.allclose(core.composite(ob,0)[700,700],color))
check('shape keys survive save and reopen',core.fingerprint(ob)==before)
(ROOT/'evidence'/'test-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'png_bytes':actual.tolist(),'expected_srgb':encoded.tolist()},indent=2),encoding='utf-8')
print('SSTP_TEST_RESULT '+json.dumps({'passed':len(checks)}))
