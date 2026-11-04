"""Regression 0.2.3: eyedropper and brush on a character with the Piel layer.

Causes reproduced on Hamibi (tripo_node_eca752bd):
- the eyedropper read Base Color's default (0.8 gray): Base Color comes from
  «Piel Limpia Mezcla», not from an image;
- preparing unhooked the original material and then refused the whole character
  because Tiny Eye materials have a procedural Base Color, so there was no brush;
- once prepared, paint sat under «Piel limpia» and under the skin shader
  («Piel Mezcla» factor = mask R), so strokes on skin were never visible.

blender -b --factory-startup --python-exit-code 1 -P tests/run_piel_gotero_pincel.py
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
from spanstories_texture_painter import core,piel

S=64
mesh=bpy.data.meshes.new('G')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(3,0,0),(3,1,0),(2,1,0),(4,0,0),(5,0,0),(5,1,0),(4,1,0)],[],[(0,1,2,3),(4,5,6,7),(8,9,10,11)])
uv=mesh.uv_layers.new(name='UVMap')
uvs=[(.05,.05),(.45,.05),(.45,.45),(.05,.45),(.55,.55),(.95,.55),(.95,.95),(.55,.95),(.55,.05),(.95,.05),(.95,.45),(.55,.45)]
for item,co in zip(uv.data,uvs):item.uv=co
# Material 0: Tripo-like texture, red everywhere.
tex=bpy.data.images.new('Tripo base',S,S,alpha=True);tex.colorspace_settings.name='Non-Color'
tex.pixels.foreach_set(np.tile([.7,.05,.06,1],S*S).astype(np.float32));tex.pack()
skin=bpy.data.materials.new('Tripo');skin.use_nodes=True;nt=skin.node_tree
img=nt.nodes.new('ShaderNodeTexImage');img.name='Image Texture';img.image=tex
nt.links.new(img.outputs['Color'],nt.nodes['Principled BSDF'].inputs['Base Color'])
# Material 1: Tiny Eye style procedural Base Color (node group).
group=bpy.data.node_groups.new('TinyEye iris','ShaderNodeTree')
group.interface.new_socket('Color',in_out='OUTPUT',socket_type='NodeSocketColor')
rgb=group.nodes.new('ShaderNodeRGB');rgb.outputs[0].default_value=(.1,.3,.9,1);out=group.nodes.new('NodeGroupOutput')
group.links.new(rgb.outputs[0],out.inputs[0])
eye=bpy.data.materials.new('TinyEye');eye.use_nodes=True;g=eye.node_tree.nodes.new('ShaderNodeGroup');g.node_tree=group
eye.node_tree.links.new(g.outputs[0],eye.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
mesh.materials.append(skin);mesh.materials.append(eye)
mesh.polygons[2].material_index=1
ob=bpy.data.objects.new('Personaje',mesh);bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.context.scene.sstp.target=ob

# Real Piel layer: skin (R=1) only on face 1, clean repaint on a corner of face 0.
mask=np.zeros((S,S,4),np.float32);mask[S//2:,S//2:,0]=1
mask_image=bpy.data.images.new('Personaje · Piel máscara',S,S,alpha=True);mask_image.colorspace_settings.name='Non-Color'
mask_image.pixels.foreach_set(mask.ravel());mask_image.pack()
paint=np.zeros((S,S,4),np.float32);paint[2:10,2:10]=[.1,.9,.1,1]
piel._cache[ob.name]={'paint':paint,'size':S}
data={'material':skin.name,'slot':0,'altura':1.7,'zonas':['cara'],'color_detectado':None,'size':S}
piel.install(ob,data,mask_image);ob['sstp_piel_info']=json.dumps(data);ob.sstp_piel['limpiar']=True
skin_mat=ob.material_slots[0].material;n=skin_mat.node_tree.nodes
n['Piel Limpia Fuerza'].inputs[1].default_value=1
n['Piel'].inputs['Color Base'].default_value=(.8,.55,.42,1)
assert n['Principled BSDF'].inputs['Base Color'].links[0].from_node.name=='Piel Limpia Mezcla'
checks=[]
def check(name,ok,detail=''):
    assert ok,(name,detail);checks.append(name)

# 1. Eyedropper before preparing: texture, clean repaint and skin, never 0.8 gray.
c=core.sample_uv_color(.30,.30,0,ob)
check('gotero lee la textura a través de Piel Limpia Mezcla',np.allclose(c[:3],(.7,.05,.06),atol=.02),c)
c=core.sample_uv_color(.08,.08,0,ob)
check('gotero ve la piel limpia',np.allclose(c[:3],(.1,.9,.1),atol=.02),c)
c=core.sample_uv_color(.75,.75,0,ob)
check('gotero ve el color del shader de piel',np.allclose(c[:3],(.8,.55,.42),atol=.02),c)

# Lips (mask G) show the lip tint of the texture, not the skin color.
lips=core.pixels(mask_image).copy();lips[S//2:S//2+8,S-12:S-4,1]=1;mask_image.pixels.foreach_set(lips.ravel())
rgba=lambda node,name:next(s for s in node.inputs if s.type=='RGBA' and s.name==name)
rgba(n['Piel Labios Tono'],'B').default_value=(1,1,1,1);n['Piel Color Labios'].inputs['Factor'].default_value=0
n['Piel Borde Labios'].inputs['From Min'].default_value=.22;n['Piel Borde Labios'].inputs['From Max'].default_value=.55
c=core.sample_uv_color(.87,.55,0,ob)
check('gotero ve el labio',np.allclose(c[:3],(.7,.05,.06),atol=.02),c)

# 2. Preparing works with a procedural eye and keeps the original material hooked.
eye_links=[(l.from_node.name,l.to_socket.name) for l in eye.node_tree.links]
result=core.prepare(ob.name,1024);s=core.state(ob)
check('preparar no se bloquea por un ojo procedural',result['materials']==2,result)
check('ojo marcado procedural',s['slots']['1'].get('procedural') and ob.material_slots[1].material==eye)
check('material del ojo intacto',[(l.from_node.name,l.to_socket.name) for l in eye.node_tree.links]==eye_links)
check('material original conserva la capa Piel',skin_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].links[0].from_node.name=='Piel Limpia Mezcla')
copy=ob.material_slots[0].material;cn=copy.node_tree.nodes
check('copia de pintura distinta',copy!=skin_mat and cn.get('Piel Mezcla'))
base_input=next(s for s in cn['Piel Limpia Mezcla'].inputs if s.type=='RGBA' and s.name=='A')
check('piel limpia debajo de las capas',base_input.is_linked and base_input.links[0].from_node.type=='TEX_IMAGE'
      and cn['Principled BSDF'].inputs['Base Color'].links[0].from_node.get('sstp'))
check('la pintura cubre el shader de piel',cn['Piel Mezcla'].inputs[0].links[0].from_node.name=='Piel Pintura Factor')

# 3. Brush on skin: the stroke is what the eyedropper and the export see.
g=core.geometry(ob);skin_island=next(i for i,x in g['islands'].items() if 1 in x['faces'])
eye_island=next(i for i,x in g['islands'].items() if 2 in x['faces'])
core.select_regions([eye_island])
try:core.brush_stroke([(.75,.25)],(1,1,0,1),ob.name,radius=6,allow_overlap=True);check('ojo procedural no se pinta',False)
except ValueError as e:check('ojo procedural no se pinta',True)
core.select_regions([skin_island])
core.brush_stroke([(.75,.75)],(.0,.2,1,1),ob.name,radius=6)
c=core.sample_uv_color(.75,.75,0,ob)
check('gotero toma lo pintado sobre la piel',np.allclose(c[:3],(0,.2,1),atol=.02),c)
c=core.sample_uv_color(.6,.92,0,ob)
check('piel sin pintar sigue siendo piel',np.allclose(c[:3],(.8,.55,.42),atol=.02),c)
a=core.composite(ob,0,coverage=True)
px=lambda arr,u,v:arr[0][int(v*arr[0].shape[0]),int(u*arr[0].shape[1])]
check('composite: piel limpia bajo la pintura',np.allclose(px(a,.08,.08)[:3],(.1,.9,.1),atol=.02))
check('cobertura de pintura',a[1][int(.75*1024),int(.75*1024)]>.99 and a[1][int(.92*1024),int(.6*1024)]<.01)

# 3b. «Aplicar color» por caras sobre piel: the fill material must not show the skin shader.
core.select_regions(['face-1'])
core.fill((1,.5,0,1),ob.name,exact_faces=True)
s=core.state(ob);row=next(r for r in s['exact_materials'].values())
fm=bpy.data.materials[row['material']].node_tree.nodes
f=fm['Piel Mezcla'].inputs[0].links[0].from_node if fm['Piel Mezcla'].inputs[0].is_linked else None
check('relleno por caras tapa el shader de piel',f is not None and f.name=='Piel Relleno Caras' and f.inputs[1].default_value==0,f and f.name)
check('relleno por caras asignado',ob.data.polygons[1].material_index==int(next(iter(s['exact_materials']))))

# 4. Unhooking for removal leaves the paint stack connected.
piel.remove(ob.name)
check('quitar Piel deja las capas conectadas',cn['Principled BSDF'].inputs['Base Color'].is_linked and
      next(l for l in cn['Principled BSDF'].inputs['Base Color'].links).from_node.get('sstp'))
check('quitar Piel no deja nodos de pintura de piel',not any(x.get('sstp_piel') for x in cn))
print(json.dumps({'ok':True,'checks':checks},ensure_ascii=False))
