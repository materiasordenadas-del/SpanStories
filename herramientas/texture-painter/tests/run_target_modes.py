"""Regression: imported textures follow target; UV mode needs no native 3D brush."""
import bpy,sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,ui
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
screen=bpy.context.screen
if screen:
    screen.name='SSTP regression'
    areas=sorted(screen.areas,key=lambda a:a.x)
    for a in areas[:2]:a.type='IMAGE_EDITOR'
def model(name,color):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[],[(0,1,2,3)])
    uv=mesh.uv_layers.new()
    for d,co in zip(uv.data,[(.1,.1),(.9,.1),(.9,.9),(.1,.9)]):d.uv=co
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    mat=bpy.data.materials.new(name);mat.use_nodes=True;mesh.materials.append(mat)
    im=bpy.data.images.new(name,width=32,height=32);im.generated_color=color
    node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
    mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    return ob,im
a,ia=model('Lamine regression',(1,0,0,1));b,ib=model('Vale regression',(0,1,0,1))
cfg=bpy.context.scene.sstp;cfg.target=a
cfg.target=b
check('picker also changes active object',bpy.context.view_layer.objects.active==b)
original_frame=ui.frame_all
def unexpected_frame():raise AssertionError('Reassigning same character must not reset view')
ui.frame_all=unexpected_frame
cfg.target=b
check('same character keeps the view stable',cfg.note.startswith('Personaje:'))
ui.frame_all=original_frame
check('unprepared target does not allocate paint layers',not core.state(b))
if screen:
    uvarea=sorted([x for x in screen.areas if x.type=='IMAGE_EDITOR'],key=lambda x:x.x)[-1]
    check('imported target texture replaces previous character UV image',uvarea.spaces.active.image==ib)
before=core.fingerprint(b)
core.prepare(b.name,resolution=1024)
core.select_regions(list(core.geometry(b)['islands']),b.name)
cfg.paint_surface='UV'
check('UV brush starts',bpy.ops.sstp.brush()=={'FINISHED'})
check('UV brush leaves mesh in object mode',b.mode=='OBJECT' and cfg.tool=='BRUSH')
check('UV brush does not allocate native paint snapshots',b.name not in ui._paint_selection)
stroke=core.begin_stroke(b);core.stroke_dab(stroke,.5,.5,(0,0,1,1),10,1);core.finish_stroke(stroke)
check('paint leaves geometry and UV unchanged',before==core.fingerprint(b))
ui.end_paint(bpy.context)
check('finish returns to selection',cfg.tool=='SELECT')
result={'passed':len(checks),'checks':checks}
(ROOT/'evidence'/'target-modes-0.1.4.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_TARGET_MODES '+json.dumps(result))
