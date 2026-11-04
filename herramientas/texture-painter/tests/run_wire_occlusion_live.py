"""Real GPU regression: hidden rear edges must not cross the front surface.

Run in connected Blender. No scene objects, images, selections or pixels change.
The old 1000 m clip projection plus fixed bias must reproduce the failure.
"""
import ast, json, sys
from pathlib import Path
from types import SimpleNamespace as NS
import bpy, gpu, numpy as np
from mathutils import Matrix, Vector
from gpu_extras.batch import batch_for_shader

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'blender/spanstories_texture_painter/ui.py'
tree=ast.parse(source.read_text(encoding='utf8'))
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='model_overlay_projection')
ns=dict(np=np,Matrix=Matrix,Vector=Vector)
exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),ns)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)

bounds=[(x,y,z) for x in [-.8,.8] for y in [-.1,.1] for z in [-.8,.8]]
obj=NS(matrix_world=Matrix.Identity(4),bound_box=bounds)
old=Matrix(((1,0,0,0),(0,0,1,0),(0,.002,0,0),(0,0,0,1)))
new=ns['model_overlay_projection'](old,obj)
for point in bounds:
    a=old@Vector((*point,1));b=new@Vector((*point,1))
    check('screen coordinates preserved '+str(point),np.allclose(a[:2],b[:2]))
check('depth bounds tightened',abs((new@Vector((0,.1,0,1))).z-.9)<1e-5)

W=H=128
quad=[(-.8,-.1,-.8),(.8,-.1,-.8),(.8,-.1,.8),(-.8,-.1,-.8),(.8,-.1,.8),(-.8,-.1,.8)]
rear=[(-.7,.05,-.7),(.7,.05,.7)]
front=[(-.7,-.1,.4),(.7,-.1,.4)]
shader=gpu.shader.from_builtin('UNIFORM_COLOR')
depth=batch_for_shader(shader,'TRIS',{'pos':quad})
lines=batch_for_shader(shader,'LINES',{'pos':rear+front})
def capture(projection,bias):
    off=gpu.types.GPUOffScreen(W,H)
    try:
        with off.bind(),gpu.matrix.push_pop(),gpu.matrix.push_pop_projection():
            fb=gpu.state.active_framebuffer_get();fb.clear(color=(1,1,1,1),depth=1)
            gpu.matrix.load_matrix(Matrix.Identity(4));gpu.matrix.load_projection_matrix(projection)
            gpu.state.depth_test_set('LESS_EQUAL');gpu.state.depth_mask_set(True)
            shader.bind();shader.uniform_float('color',(1,1,1,1));depth.draw(shader)
            gpu.state.depth_mask_set(False)
            shift=Matrix.Identity(4);shift[2][3]=-bias
            gpu.matrix.load_projection_matrix(shift@projection)
            shader.uniform_float('color',(0,0,0,1));gpu.state.line_width_set(1);lines.draw(shader)
            return np.asarray(fb.read_color(0,0,W,H,4,0,'FLOAT')).reshape(H,W,4).copy()
    finally:off.free()
old_depth=gpu.state.depth_test_get();old_mask=gpu.state.depth_mask_get()
try:
    before=capture(old,4e-4);after=capture(new,1e-3)
    check('old implementation exposes rear edge',np.any(before[60:68,60:68,:3]<.5))
    check('corrected projection occludes rear edge',np.all(after[60:68,60:68,:3]>.9))
    check('visible front edge remains',np.any(after[87:92,40:88,:3]<.5))
    # Rotated/perspective and extreme viewport clip depths keep bounded depth.
    for scale in [2e-6,.002,2.0]:
        projection=old.copy();projection[2][1]=scale
        fixed=ns['model_overlay_projection'](projection,obj)
        check('clip range independent '+str(scale),np.allclose(np.asarray(fixed),np.asarray(new),atol=1e-5))
    result={'passed':len(checks),'checks':checks,'old_hidden_pixels':int(np.any(before[60:68,60:68,:3]<.5,axis=-1).sum()),'new_hidden_pixels':int(np.any(after[60:68,60:68,:3]<.5,axis=-1).sum()),'scene_modified':False}
finally:
    gpu.state.depth_test_set(old_depth);gpu.state.depth_mask_set(old_mask);gpu.state.line_width_set(1)
(ROOT/'evidence/wire-occlusion-0.1.13.json').write_text(json.dumps(result,indent=2),encoding='utf8')
