"""Isolated Blender regression: exact face borders, history and standard GLB."""
from pathlib import Path
import json, sys, struct
import bpy, numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core, face_fill
OUT=ROOT/'evidence/exact-face-0.1.14';OUT.mkdir(exist_ok=True)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)

# Both adjacent polygons deliberately share their complete UV rectangle.
mesh=bpy.data.meshes.new('Exact faces fixture')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(2,1,0)],[],[(0,1,2,3),(1,4,5,2)])
uv=mesh.uv_layers.new(name='OriginalUV')
for d,co in zip(uv.data,[(.1,.1),(.9,.1),(.9,.9),(.1,.9)]*2):d.uv=co
mat=bpy.data.materials.new('Source material');mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.4,.25,.15,1);shader.inputs['Roughness'].default_value=1
mesh.materials.append(mat)
ob=bpy.data.objects.new('Exact faces fixture',mesh);bpy.context.collection.objects.link(ob)
bpy.context.scene.sstp.target=ob
core.prepare(ob.name,2048);s=core.state(ob);base=bpy.data.images[s['slots']['0']['base']]
original_pixels=core.pixels(base).copy();layer=bpy.data.images[s['layers'][0]['images']['0']];paint_before=core.pixels(layer).copy();before=core.fingerprint(ob)
ids=dict(core.geometry(ob)['by_face']);core.select_face(0,ob.name,as_face=True)
color=(.8,.03,.02,1)
result=core.fill(color,ob.name,exclusive=True,exact_faces=True)
check('selected face uses exact material',mesh.polygons[0].material_index!=0)
check('unselected neighbor retains original material',mesh.polygons[1].material_index==0)
check('overlapping UVs do not affect neighbor',result['faces']==1 and result['exact_faces'])
check('texture remains 2048',core.state(ob)['resolution']==2048 and tuple(layer.size)==(2048,2048))
check('paint pixels unchanged',np.array_equal(core.pixels(layer),paint_before))
check('original pixels unchanged',np.array_equal(core.pixels(base),original_pixels))
after=core.fingerprint(ob)
check('vertices topology UV shapes rigs unchanged',all(before[k]==after[k] for k in before if k!='faces') and [p[:2] for p in before['faces']]==[p[:2] for p in after['faces']])
check('UV identities remain stable after material change',core.geometry(ob,True)['by_face']==ids)
core.select_face(0,ob.name,as_face=True)
check('selection still points to source UV page',ob.active_material_index==0 and core.selected(ob)==['face-0'])
check('eyedropper reads exact face color',np.allclose(core.sample_surface(0,[.25]*4,ob.name),color))
core.history_step(object_name=ob.name)
check('undo restores material assignments',all(p.material_index==0 for p in mesh.polygons))
core.history_step(True,ob.name)
check('redo restores exact fill',mesh.polygons[0].material_index!=0 and mesh.polygons[1].material_index==0)
core.set_layer(0,ob.name,visible=False)
check('hide layer hides exact fill',all(p.material_index==0 for p in mesh.polygons))
core.set_layer(0,ob.name,visible=True)
check('show layer restores exact fill',mesh.polygons[0].material_index!=0)

# Real renders before/after: the right-hand surface must be identical.
scene=bpy.context.scene
for item in list(scene.objects):
    if item!=ob:item.hide_render=True
camera_data=bpy.data.cameras.new('Fixture camera');camera=bpy.data.objects.new('Fixture camera',camera_data);scene.collection.objects.link(camera)
camera.location=(1,.5,4);camera_data.type='ORTHO';camera_data.ortho_scale=2.2;scene.camera=camera
light_data=bpy.data.lights.new('Fixture light','AREA');light=bpy.data.objects.new('Fixture light',light_data);scene.collection.objects.link(light)
light.location=(1,.5,3);light_data.energy=150;light_data.size=4
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
scene.render.resolution_x=220;scene.render.resolution_y=110;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
def render(name):
    path=OUT/name;scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    im=bpy.data.images.load(str(path),check_existing=False)
    a=core.pixels(im).copy();bpy.data.images.remove(im);return a
core.set_layer(0,ob.name,visible=False);plain=render('plain.png')
core.set_layer(0,ob.name,visible=True);filled=render('filled.png')
check('rendered adjacent face unchanged',np.array_equal(plain[20:90,116:200],filled[20:90,116:200]))
check('rendered selected face changed',np.max(abs(plain[20:90,20:100]-filled[20:90,20:100]))>.1)

stamp=core.fingerprint(ob)
glb=core.export_glb(str(OUT/'exact-faces.glb'),ob.name,overwrite=True)
raw=Path(glb['file']).read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
primitives=doc['meshes'][0]['primitives']
check('standard GLB has distinct face material primitives',len(primitives)==2 and len({p['material'] for p in primitives})==2)
check('GLB embeds standard textures',len(doc.get('images',[]))>=1 and all('bufferView' in im for im in doc['images']))
check('solid fill needs no texture',any('baseColorTexture' not in m.get('pbrMetallicRoughness',{}) and 'baseColorFactor' in m.get('pbrMetallicRoughness',{}) for m in doc['materials']))
check('export retains exact assignments and geometry',core.fingerprint(ob)==stamp)

# Re-import with stock glTF importer, no SSTP nodes or custom loader.
bpy.ops.import_scene.gltf(filepath=glb['file'])
imported=bpy.context.active_object
check('stock importer creates ordinary textured materials',imported!=ob and len(imported.data.materials)==2)
ob.hide_render=True;imported.hide_render=False
roundtrip=render('glb-roundtrip.png')
def matches(a,b):
    error=abs(a-b)
    # Splitting a primitive changes a few stochastic path-tracing samples;
    # compare the distribution, while the untouched live neighbor is bit-exact.
    return float(error.mean())<.003 and float(np.quantile(error,.99))<.01
check('GLB selected face keeps color',matches(roundtrip[30:80,30:90],filled[30:80,30:90]))
check('GLB adjacent face keeps original',matches(roundtrip[30:80,125:190],plain[30:80,125:190]))
png=core.export_png(str(OUT/'png'),ob.name,overwrite=True)
manifest=json.loads(Path(png['manifest']).read_text(encoding='utf8'))
check('PNG export includes material variants and face assignments',len(png['textures'])==2 and manifest['face_materials']==[p.material_index for p in ob.data.polygons])
core.fill(color,ob.name,erase=True,exact_faces=True)
check('erase removes only selected face override',mesh.polygons[0].material_index==0 and mesh.polygons[1].material_index==0)
core.history_step(object_name=ob.name)
check('undo erase restores exact face',mesh.polygons[0].material_index!=0 and mesh.polygons[1].material_index==0)
core.restore_originals(ob.name)
check('restore originals removes face overrides',all(p.material_index==0 for p in mesh.polygons))
core.resume(ob.name)
check('resume restores exact faces',mesh.polygons[0].material_index!=0 and mesh.polygons[1].material_index==0)

result={'passed':len(checks),'checks':checks,'output':str(OUT)}
(OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_EXACT_FACE_RESULT '+json.dumps(result))
