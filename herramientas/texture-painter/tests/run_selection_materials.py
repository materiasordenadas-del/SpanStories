"""Selection synchronization and original texture preservation regression tests."""
import sys,json,struct,datetime
from pathlib import Path
import bpy,numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,ui
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)

mesh=bpy.data.meshes.new('Selection mesh')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(3,0,0),(3,1,0),(2,1,0)],[],[(0,1,2,3),(4,5,6,7)])
uv=mesh.uv_layers.new(name='Original UV')
for item,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]*2):item.uv=co
flat=bpy.data.materials.new('Flat');flat.use_nodes=True
pattern=bpy.data.materials.new('Eyelash source');pattern.use_nodes=True
source=bpy.data.images.new('Rectangular original',width=16,height=4,alpha=True)
source.colorspace_settings.name='sRGB'
data=np.ones((4,16,4),np.float32);data[:,:,:3]=.9;data[1:3,3:13,:3]=.08
core.write_pixels(source,data);original_pixels=core.pixels(source).copy()
node=pattern.node_tree.nodes.new('ShaderNodeTexImage');node.image=source;node.name='Original pattern';node.extension='EXTEND';node.interpolation='Closest'
pattern.node_tree.links.new(node.outputs['Color'],pattern.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
mesh.materials.append(flat);mesh.materials.append(pattern);mesh.polygons[1].material_index=1
ob=bpy.data.objects.new('Selection test',mesh);bpy.context.collection.objects.link(ob);bpy.context.scene.sstp.target=ob
ob.shape_key_add(name='Basis');ob.shape_key_add(name='Expression')
before=core.fingerprint(ob);g=core.geometry(ob);a=g['by_face'][0];b=g['by_face'][1]
core.select_regions([b],ob.name)
check('UV selection activates its material atlas',ob.active_material_index==1)
check('UV hit test finds same selected island',core.pick_uv(.5,.5,ob.name)==[b])
core.select_face(0,ob.name)
check('model selection switches atlas and exact UV island',ob.active_material_index==0 and core.selected(ob)==[a])
core.select_regions([b],ob.name,extend=True)
check('shift selection is shared across directions',set(core.selected(ob))=={a,b})
core.select_regions([b],ob.name,extend=True)
check('shift toggles selection and returns to visible atlas',core.selected(ob)==[a] and ob.active_material_index==0)
check('compact selection status reports exact faces',core.selection_status(ob.name)['faces']==1)
core.save_group('BODY',ob.name);core.select_face(1,ob.name);core.select_group('BODY',ob.name)
check('saved groups synchronize the active atlas',ob.active_material_index==0 and core.selected(ob)==[a])
core.select_regions([],ob.name);check('clearing selection clears both views',core.selection_status(ob.name)['faces']==0)
core.prepare(ob.name,1024);s=core.state(ob);protected=bpy.data.images[s['slots']['1']['base']]
check('rectangular source keeps original dimensions',list(protected.size)==[16,4])
check('protected pixels are an exact copy',np.array_equal(core.pixels(protected),original_pixels))
check('source color space retained',protected.colorspace_settings.name=='sRGB')
working=bpy.data.materials[s['slots']['1']['material']].node_tree.nodes['Original pattern']
check('original image node settings retained',working.extension=='EXTEND' and working.interpolation=='Closest')
check('original image node uses protected native copy',working.image==protected and working.image!=source)
check('original material and source untouched',node.image==source and np.array_equal(core.pixels(source),original_pixels))
core.select_regions([a],ob.name);core.fill([.1,.2,.3,1],ob.name)
layer_name=s['layers'][0]['images']['0'];paint=core.pixels(bpy.data.images[layer_name]).copy()
# Simulate the old square, resampled source and verify general migration.
s=core.state(ob);legacy=core.new_image('Old square base',1024,core.resize_linear(core.image_linear(source),1024,1024))
s['slots']['1'].update({'base':legacy.name,'native_base':False});core.store(ob,s)
core.rebuild(ob);s=core.state(ob)
check('old files migrate to a native rectangular copy',list(bpy.data.images[s['slots']['1']['base']].size)==[16,4])
check('migration preserves all existing paint',np.array_equal(core.pixels(bpy.data.images[layer_name]),paint))
out=ROOT/'evidence'/'selection-material-tests'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
png=core.export_png(str(out),ob.name)
row=next(t for t in png['textures'] if t['slot']==1)
check('unpainted PNG preserves native aspect and size',(row['width'],row['height'])==(16,4))
glb=core.export_glb(str(out/'character.glb'),ob.name)
raw=(out/'character.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length])
check('GLB preserves clamp sampling',any(s.get('wrapS')==33071 and s.get('wrapT')==33071 for s in gltf.get('samplers',[])))
binary_start=20+length+8
dimensions=[]
for image in gltf.get('images',[]):
    view=gltf['bufferViews'][image['bufferView']];start=binary_start+view.get('byteOffset',0)
    blob=raw[start:start+view['byteLength']]
    import cv2
    shape=cv2.imdecode(np.frombuffer(blob,np.uint8),cv2.IMREAD_UNCHANGED).shape;dimensions.append((shape[1],shape[0]))
check('embedded GLB keeps the rectangular proportion',any(w==4*h for w,h in dimensions))
check('all geometry UV shape keys and rigs preserved',core.fingerprint(ob)==before)
ui._controller_running=True;ui.restore_after_load(None)
check('file reopen resets stale interaction controller',ui._controller_running is False)
check('source pixels still unchanged after export',np.array_equal(core.pixels(source),original_pixels))
(ROOT/'evidence'/'selection-material-tests.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'output':str(out)},indent=2),encoding='utf-8')
print('SSTP_SELECTION_MATERIAL_RESULT '+json.dumps({'passed':len(checks)}))
