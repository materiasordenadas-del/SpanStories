"""Isolated Blender regression for adaptive export, alpha and scene preservation."""
from pathlib import Path
import json, struct, sys, shutil, hashlib, tempfile
import bpy
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,web_optimize as web
OUT=ROOT/'evidence/web-auto-0.1.21';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
def png(name,a):
    im=core.encoded_image(name,a)
    try:
        im.file_format='PNG';im.filepath_raw=str(OUT/(name+'.png'));im.save()
        return Path(im.filepath_raw).read_bytes()
    finally:bpy.data.images.remove(im)
smooth=np.ones((1024,1024,4),np.float32)
smooth[:,:,:3]=np.linspace(.1,.8,1024)[None,:,None]
source=png('smooth',smooth)
resized,row=web.adaptive_png(source,'.png')
check('smooth map automatically reduced',bool(resized) and row['size']==[512,512])
check('quality report passes every reduction',all(t['accepted'] for t in row['quality_tests']))
alpha=smooth.copy();alpha[::2,::2,3]=0
blob=png('alpha',alpha);out,report=web.adaptive_png(blob,'.png')
check('fine alpha mask stays native',out is None and report['reason']=='alpha_preserved')
detail=np.ones((1024,1024,4),np.float32);detail[:,:,:3]=((np.indices((1024,1024)).sum(0)%2))[:,:,None]
blob=png('detail',detail);out,report=web.adaptive_png(blob,'.png')
check('high frequency detail stays native',out is None and report['reason']=='detail_preserved')
tiny=smooth.copy();tiny[300:316,300:316,:3]=detail[300:316,300:316,:3]
blob=png('small-eye',tiny);out,report=web.adaptive_png(blob,'.png')
check('small detail cannot hide in global average',out is None and report['quality_tests'][0]['patch_rmse_255']>8)
blob=png('wide',smooth[:256]);out,report=web.adaptive_png(blob,'.png')
check('non-square aspect ratio preserved',report['size']==[512,128])
small=png('small',smooth[:256,:256]);out,report=web.adaptive_png(small,'.png')
check('small native image never upscaled',out is None and report['size']==[256,256])
mesh=bpy.data.meshes.new('Web fixture');mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[],[(0,1,2,3)])
uv=mesh.uv_layers.new(name='Original UV')
for d,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):d.uv=co
ob=bpy.data.objects.new('Web fixture',mesh);bpy.context.collection.objects.link(ob)
mat=bpy.data.materials.new('Original material');mat.use_nodes=True;mesh.materials.append(mat)
image=bpy.data.images.load(str(OUT/'smooth.png'),check_existing=False)
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
bpy.context.scene.sstp.target=ob;core.prepare(ob.name,1024)
ob.shape_key_add(name='Basis');ob.shape_key_add(name='Test').data[0].co.z=.1
before=core.fingerprint(ob)
images={i.name:hashlib.sha256(core.pixels(i).tobytes()).hexdigest() for i in bpy.data.images}
optimize=web.optimize_glb
web.optimize_glb=lambda p:{'profile':'test baseline'}
try:core.export_glb(str(OUT/'native.glb'),ob.name,overwrite=True)
finally:web.optimize_glb=optimize
shutil.copy2(OUT/'native.glb',OUT/'automatic.glb')
report=web.optimize_glb(OUT/'automatic.glb')
check('default GLB profile is automatic',report['profile']=='auto_web' and report['resolution_changed'])
check('VRAM estimate decreases fourfold',abs(report['estimated_basecolor_gpu_bytes_after']*4-report['estimated_basecolor_gpu_bytes_before'])<=2)
check('download decreases',report['after_bytes']<report['before_bytes'])
check('mesh UV shape keys and rig state preserved',core.fingerprint(ob)==before)
check('all existing image pixels preserved',all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==digest for n,digest in images.items()))
def read(name):
    raw=(OUT/name).read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    check(name+' correct GLB length',len(raw)==struct.unpack_from('<I',raw,8)[0])
    return json.loads(raw[20:20+n]),raw[28+n:]
a,ab=read('native.glb');b,bb=read('automatic.glb')
for key in ('meshes','accessors','nodes','materials','skins','animations','samplers'):
    check(key+' preserved',a.get(key)==b.get(key))
image_views={x['bufferView'] for x in a['images']}
def view(doc,bin,i):
    v=doc['bufferViews'][i];o=v.get('byteOffset',0);return bin[o:o+v['byteLength']]
check('all geometry morph and animation bytes preserved',all(view(a,ab,i)==view(b,bb,i) for i in range(len(a['bufferViews'])) if i not in image_views))
check('self contained file without sidecar textures',all('bufferView' in i and 'uri' not in i for i in b['images']) and all('uri' not in x for x in b['buffers']))
check('all bufferViews remain aligned',all(v.get('byteOffset',0)%4==0 for v in b['bufferViews']))
check('WebP extension declared when used',not report['webp_images'] or 'EXT_texture_webp' in b['extensionsRequired'])
check('resizing is not incorrectly called lossless',report['lossless'] is False and all(r['encoding_lossless'] for r in report['images']))
from spanstories_texture_painter import agent
with tempfile.TemporaryDirectory(prefix='sstp-agent-web-') as directory:
    default=agent.export(str(Path(directory)/'ready'),ob.name)
    check('agent exports ready GLB without additional flags',default['threejs_ready'] and Path(default['ready_file']).is_file())
    png_only=agent.export(str(Path(directory)/'editable'),ob.name,include_glb=False)
    check('PNG only is honestly marked as editable',not png_only['threejs_ready'] and png_only['ready_file'] is None)
# A Base Color image reused as a normal/data map must never be resized.
a['materials'][0]['normalTexture']={'index':0}
encoded=json.dumps(a).encode();encoded+=b' '*((-len(encoded))%4)
raw=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(ab))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(ab),b'BIN\0')+ab
(OUT/'shared-data.glb').write_bytes(raw)
shared=web.optimize_glb(OUT/'shared-data.glb')
check('texture reused for normal data never resized',not shared['resolution_changed'])
# Detached procedural eyes are explicit dependencies, not guessed by name.
from spanstories_texture_painter import export_assets
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=(2,0,0))
eye=bpy.context.object;eye.name='Detached procedural eye'
for layer in list(eye.data.uv_layers):eye.data.uv_layers.remove(layer)
material=bpy.data.materials.new('Procedural color fixture');material.use_nodes=True;eye.data.materials.append(material)
nt=material.node_tree;generated=nt.nodes.new('ShaderNodeTexCoord');separate=nt.nodes.new('ShaderNodeSeparateXYZ');ramp=nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color=(.1,.02,0,1);ramp.color_ramp.elements[1].color=(.8,.7,.3,1)
nt.links.new(generated.outputs['Generated'],separate.inputs[0]);nt.links.new(separate.outputs['X'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],nt.nodes.get('Principled BSDF').inputs['Base Color'])
eye_before=core.fingerprint(eye);materials_before=list(eye.data.materials);names_before=set(bpy.data.objects)
with export_assets.prepared({eye}) as ready:
    clone=next(iter(ready));values=np.array([d.color[:] for d in clone.data.color_attributes.active_color.data])
    check('procedural colors bake without UV or unwrap',len(clone.data.uv_layers)==0 and len(values)==len(eye.data.loops))
    check('baked color retains its variation',np.ptp(values[:,:3],axis=0).max()>.5)
check('procedural source geometry and materials preserved',eye_before==core.fingerprint(eye) and list(eye.data.materials)==materials_before and len(eye.data.color_attributes)==0)
check('temporary export objects cleaned up',set(bpy.data.objects)==names_before)
ob['sstp_export_objects']=[eye.name]
check('explicit detached attachment resolved',eye in export_assets.attachments(ob))
core.export_glb(str(OUT/'with-attachment.glb'),ob.name,overwrite=True)
attached,_=read('with-attachment.glb')
check('detached procedural attachment included as standard vertex colors',any('COLOR_0' in primitive['attributes'] for mesh in attached['meshes'] for primitive in mesh['primitives']))
check('attachment still untouched after full export',eye_before==core.fingerprint(eye) and len(eye.data.color_attributes)==0)
result={'passed':len(checks),'checks':checks,'optimization':report}
(OUT/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_RESULT '+json.dumps(result))
