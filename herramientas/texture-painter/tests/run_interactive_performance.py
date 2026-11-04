"""Exact compositing and UV redraw-cache regressions, using disposable fixtures."""
import sys, time, json, importlib.util, ast, math
from pathlib import Path
from types import SimpleNamespace as NS
import numpy as np
from mathutils import Vector, Quaternion, Matrix
from contextlib import contextmanager
from mathutils.geometry import tessellate_polygon

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('perf_padding',ROOT/'blender/spanstories_texture_painter/padding.py')
padding=importlib.util.module_from_spec(spec);spec.loader.exec_module(padding)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)

rng=np.random.default_rng(781)
for shape in [(1,1,4),(19,53,4),(128,257,4)]:
    base=rng.uniform(-1,2,shape).astype(np.float32)
    layer=rng.uniform(-1,2,shape).astype(np.float32)
    for opacity in [0,.17,1,1.7]:
        expected=base.copy();alpha=(layer[...,3:4]*opacity).clip(0,1)
        expected[...,:3]=expected[...,:3]*(1-alpha)+layer[...,:3]*alpha
        actual=base.copy();before=layer.copy()
        padding.blend_rgb(actual,layer,opacity)
        check('exact RGBA '+str((shape,opacity)),np.array_equal(expected,actual))
        check('layer untouched '+str((shape,opacity)),np.array_equal(before,layer))

# Execute the real draw function with a deterministic GPU recorder; no live scene.
source=(ROOT/'blender/spanstories_texture_painter/ui.py').read_text(encoding='utf8')
nodes=[n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name in {'draw_uv','uv_edge_coords','uv_triangle_coords'}]
g={'stamp':('test',),'islands':{'a':{'material':0,'faces':[0],'boundary':[((0,0),(1,0))]}},'face_uv':[np.array([[0,0],[1,0],[0,1]],np.float32)]}
selected=['a'];calls=[];drawn=[];shift=[0]
class Batch:
    def __init__(self,kind,pos):self.value=(kind,np.asarray(pos).tolist())
    def draw(self,shader):
        kind,pos=self.value
        coords=[tuple((matrix.current@Vector((*p,0,1)))[:2]) for p in pos]
        drawn.append(((kind,coords),shader.color))
class Shader:
    def bind(self):pass
    def uniform_float(self,name,value):self.color=tuple(value)
def batch(shader,kind,data):
    calls.append(kind);return Batch(kind,data['pos'])
def triangles(poly):
    for tri in tessellate_polygon([poly]):yield [poly[i] if isinstance(i,int) else i for i in tri]
uv=NS(view_to_region=lambda x,y,clip=False:(int(x*100)+shift[0],int(y*100)))
ob=NS(data=NS(uv_layers=NS(active=True)),active_material_index=0)
context=NS(area=True,scene=NS(sstp=NS(target=ob,detail=False)),region=NS(view2d=uv))
class MatrixState:
    current=Matrix.Identity(4)
    @contextmanager
    def push_pop(self):
        old=self.current.copy()
        try:yield
        finally:self.current=old
    def multiply_matrix(self,value):self.current=self.current@value
matrix=MatrixState()
gpu=NS(shader=NS(from_builtin=lambda _:Shader()),state=NS(blend_set=lambda _:None),matrix=matrix)
ns=dict(bpy=NS(context=context),role=lambda _:'UV',core=NS(geometry=lambda _:g,selected=lambda _:selected,island_of=lambda geom,i:geom['islands'][i],triangles=triangles),np=np,gpu=gpu,Vector=Vector,Matrix=Matrix,batch_for_shader=batch,_draw_counts={'uv':0},_uv_batches={},_uv_selection_batches={},_draw_errors={})
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(ROOT/'blender/spanstories_texture_painter/ui.py'),'exec'),ns)
draw=ns['draw_uv'];draw();check('draw succeeds',not ns['_draw_errors'])
check('selected fill is very faint',any(item[0][0]=='TRIS' for item in drawn) and all(0<item[1][3]<=.1 for item in drawn if item[0][0]=='TRIS'))
check('selected boundary stays opaque',any(item[0][0]=='LINES' and item[1]==(1,.63,.05,1) for item in drawn))
first=list(drawn);count=len(calls);drawn.clear();draw()
check('redraw exact geometry colors and order',drawn==first)
check('unchanged redraw builds no GPU batches',len(calls)==count)
shift[0]=13;drawn.clear();draw();check('pan reuses every GPU buffer',len(calls)==count)
check('pan transforms all overlay coordinates',all(abs(b[0]-a[0]-13)<1e-5 and abs(b[1]-a[1])<1e-5 for old,new in zip(first,drawn) for a,b in zip(old[0][1],new[0][1])))
check('GPU matrix restored after drawing',matrix.current==Matrix.Identity(4))
context.scene.sstp.detail=True;draw();check('detail invalidates geometry buffers',len(calls)>count)
count=len(calls);context.scene.sstp.detail=False;draw();check('detail off invalidates buffers',len(calls)>count)
selected.clear();drawn.clear();draw();check('deselection removes tint',not any(x[0][0]=='TRIS' for x in drawn))
selected.append('a');draw();count=len(calls);g=dict(g);draw();check('geometry replacement invalidates both caches',len(calls)>count and len(ns['_uv_selection_batches'])==1 and not ns['_draw_errors'])
check('cache remains bounded',len(ns['_uv_selection_batches'])==1)

node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='drag_view')
view=NS(view_rotation=Quaternion((1,0,0),.7),view_location=Vector((2,3,4)),view_distance=4)
region=NS(type='WINDOW',width=800,height=600)
area=NS(type='VIEW_3D',spaces=NS(active=NS(region_3d=view)),regions=[region],tag_redraw=lambda:None)
def unproject(region,view,xy,depth):
    return depth+view.view_rotation@Vector((xy[0]*.01,xy[1]*.01,0))
pan_ns=dict(Vector=Vector,Quaternion=Quaternion,math=math,view3d_utils=NS(region_2d_to_location_3d=unproject))
helper=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='turntable_rotation')
exec(compile(ast.Module(body=[helper],type_ignores=[]),'turntable_rotation','exec'),pan_ns)
exec(compile(ast.Module(body=[node],type_ignores=[]),'drag_view','exec'),pan_ns)
original=view.view_location.copy();rotation=view.view_rotation.copy()
for dx,dy in [(40,0),(0,40),(40,40),(-40,-40)]:
    view.view_location=original.copy();pan_ns['drag_view'](area,dx,dy,pan=True)
    expected=original-rotation@Vector((dx*.01,dy*.01,0))
    check('right pan both screen axes '+str((dx,dy)),(view.view_location-expected).length<1e-5)
check('pan keeps rotation and zoom',tuple(view.view_rotation)==tuple(rotation) and view.view_distance==4)
pan_ns['drag_view'](area,40,30,pan=False)
check('existing orbit still works',abs(view.view_rotation.dot(rotation))<.9999)

base=rng.random((2048,2048,4),dtype=np.float32);layer=rng.random(base.shape,dtype=np.float32)
times={}
outputs=[]
for name in ['previous','optimized']:
    durations=[]
    for _ in range(3):
        out=base.copy();start=time.perf_counter()
        if name=='previous':
            alpha=(layer[...,3:4]*.8).clip(0,1)
            out[...,:3]=out[...,:3]*(1-alpha)+layer[...,:3]*alpha
        else:padding.blend_rgb(out,layer,.8)
        durations.append(time.perf_counter()-start)
    times[name]=float(np.median(durations));outputs.append(out)
check('2K output bit identical',np.array_equal(*outputs))
report={'passed':len(checks),'blend_2k_seconds':times,'checks':checks}
print('SSTP_INTERACTIVE_PERFORMANCE '+json.dumps(report))
