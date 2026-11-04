"""0.1.6: selección por caras y gotero del modelo. Proceso aparte; no toca el personaje vivo."""
import sys, json
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core

checks=[]
def check(name,expr):
    assert expr,name
    checks.append(name)

# Una isla de 2 caras (0,1) y otra aparte (2).
mesh=bpy.data.meshes.new('Test')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0),(2,0,0),(2,1,0),(4,0,0),(5,0,0),(5,1,0),(4,1,0)],[],[(0,1,2,3),(1,4,5,2),(6,7,8,9)])
uv=mesh.uv_layers.new(name='UV')
for item,co in zip(uv.data,[(.05,.05),(.25,.05),(.25,.45),(.05,.45),(.25,.05),(.45,.05),(.45,.45),(.25,.45),(.55,.55),(.95,.55),(.95,.95),(.55,.95)]):item.uv=co
mat=bpy.data.materials.new('M'); mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.2,.3,.4,1)
mesh.materials.append(mat)
ob=bpy.data.objects.new('Test',mesh); bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
bpy.context.scene.sstp.target=ob
g=core.geometry(ob)
check('2 islas',len(g['islands'])==2)

core.prepare(resolution=1024)
core.select_face(0,as_face=True)
check('cara suelta seleccionada',core.selected(ob)==['face-0'])
check('estado serializable',core.selection_status()['faces']==1)
check('sin solape con su propia isla',core.overlap_report()['overlaps']==[])
mask=core.raster(ob,['face-0'],0,1024)
full=core.raster(ob,[g['by_face'][0]],0,1024)
check('la cara es parte de la isla',mask.sum()>0 and mask.sum()<full.sum())
check('pick por UV de cara',core.pick_uv_face(.15,.25)==['face-0'] and core.pick_uv_face(.35,.25)==['face-1'])
core.fill((1,0,0,1))
im=bpy.data.images[core.state(ob)['layers'][0]['images']['0']]
a=core.pixels(im)
check('solo la cara 0 pintada',a[int(.25*1024),int(.15*1024),0]>.9 and a[int(.25*1024),int(.35*1024),3]<.5)
# Gotero: centro de la cara 0 -> rojo pintado; cara 2 -> color base del material.
c=core.sample_surface(0,[.25,.25,.25,.25])
check('gotero toma el rojo pintado',c[0]>.9 and c[1]<.1)
c2=core.sample_surface(2,[.25,.25,.25,.25])
check('gotero toma la base',abs(c2[2]-.4)<.02 and abs(c2[0]-.2)<.02)
check('el color del pincel cambió',tuple(round(x,2) for x in bpy.context.scene.sstp.color[:3])==tuple(round(x,2) for x in c2[:3]))
core.select_face(1,as_face=False)
check('modo zona sigue siendo la isla',core.selected(ob)==[g['by_face'][1]])
core.select_regions(['face-1'],extend=True)
check('mezcla de isla y cara',len(core.selected(ob))==2 and len(core.faces_of(g,core.selected(ob)))==2)
try: core.select_regions(['face-99']); check('id inválido',False)
except ValueError: check('id inválido rechazado',True)
# Sin preparar: el gotero lee el Base Color del material.
print(json.dumps({'ok':True,'checks':checks},ensure_ascii=False))
addon.unregister()
