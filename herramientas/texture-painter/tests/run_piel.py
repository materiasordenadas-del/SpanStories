"""Regression for Piel. Reads the character, never saves it.

blender -b "Camila .blend" --factory-startup -P tests/run_piel.py -- <carpeta nueva>
"""
from pathlib import Path
import json
import sys
import numpy as np
import bpy

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as sstp
sstp.register()
from spanstories_texture_painter import agent,core,piel

out=Path(sys.argv[-1]);out.mkdir(parents=True)
name='Camila '
ob=bpy.data.objects[name]
# A saved file may already carry the layer; every run starts from the original.
if piel.active(ob):piel.remove(name)
keys=('vertices','edges','loops','faces','uv','shape_keys','modifiers','animation','shape_drivers')
before=core.fingerprint(ob);original=ob.material_slots[0].material.name
image=bpy.data.images['tripo_image_99f4d12f_0'];pixels_before=core.pixels(image).copy()
report={}

result=piel.agent_apply(object_name=name,style='PIXAR')
assert result['ok'] and result['mesh_unchanged'],result
assert result['labios']=='textura',result
assert set(result['zonas_detectadas'])=={'cara','brazos'},result['zonas_detectadas']
assert not ob.sstp_piel.poros and not ob.sstp_piel.pecas
mask=core.pixels(bpy.data.images[name+' · Piel máscara'])
hood=piel._cache[name]['fid']
# Lips are one solid shape: the too-red faces once punched holes in it.
lips=mask[...,1]>.5
report['lip_texels']=int(lips.sum());assert lips.sum()>60,(report,result['detectado'])
ys,xs=np.nonzero(lips)
assert mask[...,0][lips].mean()>.95,'la piel debe cubrir los labios para mostrarlos'
# Colour off the skin axis (jeans, hoodie, shirt) must stay out of the mask.
table=core.resize_linear(core.image_linear(image),mask.shape[1],mask.shape[0])[...,:3]
white=(table.min(-1)>.7)
report['white_in_mask']=float(mask[...,0][white].mean());assert report['white_in_mask']<.03,report

# Unchanged skin keeps lips exact; a darker skin moves them with it.
ratio=lambda:next(s for s in piel.nodes(ob)['Piel Labios Tono'].inputs if s.type=='RGBA' and s.name=='B').default_value[:3]
assert np.allclose(ratio(),1,atol=.01),ratio()
piel.agent_apply(object_name=name,tone='Moreno')
assert max(ratio())<.8,ratio()
piel.agent_apply(object_name=name,style='HIPER');assert ob.sstp_piel.poros>0
piel.agent_apply(object_name=name,style='PIXAR');assert ob.sstp_piel.poros==0
assert piel.agent_apply(object_name=name,tone='Azul')['status']=='needs_tone'

# Zone switch: arms out, face still there.
ob.sstp_piel.zona_brazos=False
piel.zones_changed(ob);off=core.pixels(bpy.data.images[name+' · Piel máscara'])[...,0].sum()
ob.sstp_piel.zona_brazos=True
piel.zones_changed(ob);on=core.pixels(bpy.data.images[name+' · Piel máscara'])[...,0].sum()
report['zone']=[float(off),float(on)];assert off<on

# GLB holds a flat colour with the skin, and the painter survives the layer.
exported=agent.export(str(out/'glb'),object_name=name)
assert exported['ok'] and exported['threejs_ready'],exported
report['glb']=Path(exported['glb']).stat().st_size
assert ob.material_slots[0].material.node_tree.nodes.get('Piel'),'preparar perdió la piel'
shader=piel.shader_of(ob.material_slots[0].material)
tone=next(s for s in piel.nodes(ob)['Piel Labios Tono'].inputs if s.type=='RGBA' and s.name=='A')
# 0.2.3: lips tint from base + clean repaint; paint layers sit above it.
clean_mix=piel.nodes(ob)['Piel Limpia Mezcla']
assert tone.is_linked and tone.links[0].from_node==clean_mix
assert shader.inputs['Base Color'].links[0].from_node.get('sstp') and any(l.to_node.get('sstp') for l in next(s for s in clean_mix.outputs if s.type=='RGBA').links)
png=bpy.data.images.load(exported['png'][0]);flat=core.pixels(png)[...,:3];flat=core.resize_linear(flat,mask.shape[1],mask.shape[0])
skin=mask[...,0]>.99;target=np.array(ob.sstp_piel.color[:3])
report['flat_skin']=np.median(flat[skin&~lips],0).tolist()
out_of_mask=mask[...,0]==0
diff=np.abs(flat[out_of_mask]-core.to_srgb(table[out_of_mask])).mean()
report['outside_change']=float(diff);assert diff<.02,diff
core.restore_originals(name)

# Hyper style bakes its relief into a standard glTF normal map.
piel.agent_apply(object_name=name,style='HIPER')
hiper=agent.export(str(out/'hiper'),object_name=name)
assert hiper['ok'],hiper
raw=Path(hiper['glb']).read_bytes();length=int.from_bytes(raw[12:16],'little');doc=json.loads(raw[20:20+length])
assert any('normalTexture' in m for m in doc['materials']),'falta el relieve en el GLB'
core.restore_originals(name);piel.agent_apply(object_name=name,style='PIXAR')
report['cleaned']=float((piel._cache[name]['clean']>0).mean());assert report['cleaned']>0
# Without texture: lips come from the mouth, not from a colour.
keep=piel.source_image;piel.source_image=lambda mat:None
piel.remove(name);data=piel.start(name)
piel.source_image=keep
report['sin_textura']=data['labios'];assert data['labios']=='geometria',data
share=(piel._cache[name]['lips']>.5).mean();report['lip_share']=float(share);assert 0<share<.01,share

assert piel.remove(name)['removed'] and not piel.active(ob)
after=core.fingerprint(ob)
assert all(before[k]==after[k] for k in keys)
assert np.array_equal(pixels_before,core.pixels(image))
report['saved_blend']=False
(out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PIEL OK',json.dumps(report))
sstp.unregister()
