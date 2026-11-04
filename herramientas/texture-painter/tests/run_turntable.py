"""Exercise production orbit math, including the old diagonal-roll failure."""
import ast,json,math
from pathlib import Path
from mathutils import Quaternion,Vector
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'blender/spanstories_texture_painter/ui.py'
tree=ast.parse(source.read_text(encoding='utf8'))
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='turntable_rotation')
ns=dict(math=math,Quaternion=Quaternion,Vector=Vector)
exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),ns)
rotate=ns['turntable_rotation'];checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
front=Quaternion((1,0,0),math.pi/2)
old=front.copy();new=front.copy()
gestures=[(40,0),(0,25),(-40,0),(0,-25)]*30
for dx,dy in gestures:
    old=(old@Quaternion((0,1,0),-dx*.007)@Quaternion((1,0,0),dy*.007)).normalized()
    new=rotate(new,dx,dy)
check('old orbit reproduces accumulated roll',abs((old@Vector((1,0,0))).z)>.01)
check('repeated mixed drags never tilt horizon',abs((new@Vector((1,0,0))).z)<1e-6)
check('closed gesture returns to original orientation',abs(new.dot(front))>1-1e-6)
for pitch in [.001,.3,1.2,2.3,math.pi-.001]:
    q=Quaternion((0,0,1),.7)@Quaternion((1,0,0),pitch)
    a=rotate(q,50,0);b=rotate(q,0,10)
    check('horizontal keeps elevation '+str(pitch),abs((a@Vector((0,0,1))).z-(q@Vector((0,0,1))).z)<1e-5)
    check('vertical keeps heading '+str(pitch),abs((b@Vector((1,0,0))).dot(q@Vector((1,0,0)))-1)<1e-5)
for q in [Quaternion(),Quaternion((1,0,0),math.pi),front@Quaternion((0,0,1),.5)]:
    a=rotate(q,25,20)
    check('pole or existing roll becomes upright '+str(tuple(q)),abs((a@Vector((1,0,0))).z)<1e-6 and abs(a.magnitude-1)<1e-6)
for dy in [-100000,100000]:
    a=rotate(front,0,dy);back=a@Vector((0,0,1))
    check('pole clamp prevents flipping '+str(dy),abs(back.z)<1 and abs((a@Vector((1,0,0))).z)<1e-6)
print(json.dumps({'passed':len(checks),'checks':checks}))
