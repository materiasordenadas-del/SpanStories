"""Regression: displayed controls must reach Blender 5.x and legacy brushes."""
import ast,json
from pathlib import Path
from types import SimpleNamespace as NS
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'blender/spanstories_texture_painter/ui.py'
node=next(n for n in ast.parse(source.read_text(encoding='utf8')).body if isinstance(n,ast.FunctionDef) and n.name=='color_changed')
draws=[];ns={'core':NS(redraw=lambda:draws.append(1))}
exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),ns)
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
cfg=NS(color=(.04,.07,.22,1),brush_size=30,strength=.8)
for version in ['5.x','legacy']:
    unified=NS(color=(0,0,0),size=100,strength=.5,use_unified_color=True,use_unified_size=True,use_unified_strength=True)
    brush=NS(color=(0,0,0),size=100,strength=.5)
    paint=NS(brush=brush);settings=NS(image_paint=paint)
    setattr(paint if version=='5.x' else settings,'unified_paint_settings',unified)
    context=NS(scene=NS(tool_settings=settings))
    ns['color_changed'](cfg,context)
    check(version+' effective color matches displayed color',unified.color==cfg.color[:3])
    check(version+' effective size matches displayed size',unified.size==30)
    check(version+' effective strength matches displayed strength',unified.strength==.8)
    check(version+' brush values remain synchronized',brush.color==cfg.color[:3] and brush.size==30 and brush.strength==.8)
    unified.use_unified_color=unified.use_unified_size=unified.use_unified_strength=False
    unified.color=(.2,.3,.4);unified.size=77;unified.strength=.1
    ns['color_changed'](cfg,context)
    check(version+' disabled unified values preserved',unified.color==(.2,.3,.4) and unified.size==77 and unified.strength==.1)
    paint.brush=None;unified.use_unified_color=True
    ns['color_changed'](cfg,context)
    check(version+' unified update also works without a brush',unified.color==cfg.color[:3])
check('redraw once per control update',len(draws)==6)
print(json.dumps({'passed':len(checks),'checks':checks}))
