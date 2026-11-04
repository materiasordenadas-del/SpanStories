"""Benchmark old/new real GPU UV draws without editing the open scene."""
import ast, hashlib, json, sys, time
from pathlib import Path
from types import SimpleNamespace as NS
import bpy, gpu, numpy as np
from mathutils import Matrix, Vector
from gpu_extras.batch import batch_for_shader

ROOT=Path(__file__).resolve().parents[1]
ui=next(v for k,v in sys.modules.items() if k.endswith('spanstories_texture_painter.ui'))
core=ui.core
ob=bpy.context.scene.sstp.target
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
def snapshot():
    return {'mesh':core.fingerprint(ob),'state':ob.get(core.KEY),
            'images':{im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest()
                      for im in bpy.data.images if im.has_data and im.channels==4},
            'file':bpy.data.filepath,'dirty':bpy.data.is_dirty}
before=snapshot()
oldsource=Path(ui.__file__).read_text(encoding='utf8')
newsource=(ROOT/'blender/spanstories_texture_painter/ui.py').read_text(encoding='utf8')
check('installed baseline still uses screen-space cache', 'tuple(origin),tuple(end)' in oldsource)
def namespace(source,g,chosen,cfg):
    view=NS(origin=(16,16),scale=(128,128))
    view.view_to_region=lambda x,y,clip=False:(round(view.origin[0]+x*view.scale[0]),round(view.origin[1]+y*view.scale[1]))
    context=NS(area=True,scene=NS(sstp=cfg),region=NS(view2d=view))
    builds=[]
    def batch(shader,kind,data):
        builds.append(kind)
        return batch_for_shader(shader,kind,data)
    c=NS(geometry=lambda _:g,selected=lambda _:chosen,island_of=core.island_of,triangles=core.triangles)
    ns=dict(bpy=NS(context=context),core=c,role=lambda _:'UV',gpu=gpu,np=np,Vector=Vector,Matrix=Matrix,
            batch_for_shader=batch,_uv_batches={},_uv_selection_batches={},_draw_counts={'uv':0},_draw_errors={})
    nodes=[n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef)
           and n.name in {'draw_uv','uv_edge_coords','uv_triangle_coords'}]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'uv_candidate','exec'),ns)
    return ns,view,builds

off=gpu.types.GPUOffScreen(256,256)
def capture(ns):
    with off.bind(),gpu.matrix.push_pop(),gpu.matrix.push_pop_projection():
        fb=gpu.state.active_framebuffer_get();fb.clear(color=(1,1,1,1))
        gpu.matrix.load_matrix(Matrix.Identity(4))
        gpu.matrix.load_projection_matrix(Matrix(((2/256,0,0,-1),(0,2/256,0,-1),(0,0,1,0),(0,0,0,1))))
        ns['draw_uv']()
        assert not ns['_draw_errors'],ns['_draw_errors']
        return np.array(fb.read_color(0,0,256,256,4,0,'UBYTE'))
try:
    # Integer-aligned fixture: render geometry, tint, outline and pan/zoom alike.
    p=np.asarray([(0,0),(1,0),(1,1),(0,1)],np.float32)
    fixture={'stamp':('fixture',),'face_uv':[p],
             'islands':{'a':{'material':0,'faces':[0],'boundary':list(zip(p,np.roll(p,-1,axis=0)))}}}
    cfg=NS(target=NS(data=NS(uv_layers=NS(active=True)),active_material_index=0),detail=True)
    old,ov,oc=namespace(oldsource,fixture,['a'],cfg)
    new,nv,nc=namespace(newsource,fixture,['a'],cfg)
    for origin,scale in [((16,16),(128,128)),((32,24),(64,96)),((-48,-16),(256,192))]:
        ov.origin=nv.origin=origin;ov.scale=nv.scale=scale
        a=capture(old);b=capture(new)
        check('GPU rendered pixels identical '+str((origin,scale)),np.array_equal(a,b))
    check('pan/zoom creates no candidate batches',len(nc)==4 and len(oc)==12)
    # Real target, its current material, detail setting and selected regions.
    geom=core.geometry(ob);cfg=bpy.context.scene.sstp
    old,ov,oc=namespace(oldsource,geom,core.selected(ob),cfg)
    new,nv,nc=namespace(newsource,geom,core.selected(ob),cfg)
    timings={}
    for label,ns,view,builds in [('previous',old,ov,oc),('optimized',new,nv,nc)]:
        frames=[]
        for i in range(6):
            view.origin=(16+i*3,16+i*2);view.scale=(128+i*16,128+i*16)
            start=time.perf_counter();capture(ns);frames.append((time.perf_counter()-start)*1000)
        timings[label]={'cold_ms':frames[0],'navigation_median_ms':float(np.median(frames[1:])),
                        'gpu_batches':len(builds),'frames_ms':frames}
    check('navigation reuses real target GPU batches',timings['optimized']['gpu_batches']*6==timings['previous']['gpu_batches'])
    check('navigation faster than baseline',timings['optimized']['navigation_median_ms']<timings['previous']['navigation_median_ms'])
    check('candidate caches bounded',len(new['_uv_batches'])==len(new['_uv_selection_batches'])==1)
finally:
    off.free()
check('mesh UV rig pixels selection and file unchanged',before==snapshot())
report={'passed':len(checks),'checks':checks,'target':ob.name,'faces':len(ob.data.polygons),'timings':timings,'blend_saved':False}
(ROOT/'evidence/uv-performance-0.1.16.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
