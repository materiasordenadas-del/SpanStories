"""Hot patch functions only; verify real UV Ctrl click and restore user state."""
import ast,bpy,hashlib,importlib,json,sys
from pathlib import Path
from types import SimpleNamespace as NS
ROOT=Path(__file__).resolve().parents[1]
ui=next(v for k,v in sys.modules.items() if k.endswith('spanstories_texture_painter.ui'))
core=ui.core;ob=bpy.context.scene.sstp.target;cfg=bpy.context.scene.sstp
def snapshot():
    return {'mesh':core.fingerprint(ob),'state':ob.get(core.KEY),
            'images':{im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest()
                      for im in bpy.data.images if im.has_data and im.channels==4}}
before=snapshot();raw=ob.get(core.KEY);material=ob.active_material_index
note=cfg.note;clicks=cfg.click_count;select_mode=cfg.select_mode;tool=cfg.tool;picker=cfg.picker
source=Path(core.__file__).read_text(encoding='utf8')
nodes=[n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef)
       and n.name in {'select_regions','select_face','face_path','select_face_path'}]
from collections import deque
core.deque=deque
exec(compile(ast.Module(body=nodes,type_ignores=[]),core.__file__,'exec'),core.__dict__)
source=Path(ui.__file__).read_text(encoding='utf8');tree=ast.parse(source)
for clsname,methodname in [('SSTP_OT_click','invoke'),('SSTP_OT_controller','modal')]:
    cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==clsname)
    method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name==methodname)
    ns={};exec(compile(ast.Module(body=[method],type_ignores=[]),ui.__file__,'exec'),ui.__dict__,ns)
    getattr(getattr(ui,clsname),methodname).__code__=ns[methodname].__code__
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='draw_hud')
ns={};exec(compile(ast.Module(body=[node],type_ignores=[]),ui.__file__,'exec'),ui.__dict__,ns)
ui.draw_hud.__code__=ns['draw_hud'].__code__
policy=importlib.reload(sys.modules[ui.__package__+'.policy'])
agent=sys.modules.get(ui.__package__+'.agent')
if agent:agent.VERSION=policy.VERSION
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
try:
    cfg.select_mode='FACE';cfg.tool='SELECT';cfg.picker=False
    g=core.geometry(ob);core.face_path(ob,0,0)
    area=next(a for a in bpy.context.screen.areas if ui.role(a)=='UV')
    region=next(r for r in area.regions if r.type=='WINDOW')
    def hit(face):
        if g['face_material'][face]!=material:return None
        u,v=g['face_uv'][face].mean(axis=0)
        x,y=region.view2d.view_to_region(float(u),float(v),clip=False)
        if not(12<x<region.width-12 and 45<y<region.height-60):return None
        return (x,y) if core.pick_uv_face(*region.view2d.region_to_view(x,y),ob.name)==['face-%d'%face] else None
    pair=None
    for start in range(len(ob.data.polygons)):
        a=hit(start)
        if not a:continue
        level={start};visited={start}
        for _ in range(3):
            level={n for f in level for n in g['face_neighbors'][f]}-visited;visited.update(level)
        for end in sorted(level):
            b=hit(end)
            if b:pair=(start,end,a,b);break
        if pair:break
    check('visible UV endpoints found three edges apart',pair is not None)
    start,end,a,b=pair
    with bpy.context.temp_override(area=area,region=region):
        for xy in [a,b]:
            e=NS(mouse_x=region.x+xy[0],mouse_y=region.y+xy[1],shift=False,ctrl=True,alt=False)
            if xy is a:core.select_regions([],ob.name)
            check('Ctrl UV click executes',ui.SSTP_OT_click.invoke(NS(report=lambda *args:None),bpy.context,e)=={'FINISHED'})
    path=core.face_path(ob,start,end)
    check('live A B C D all selected',len(path)==4 and set(core.selected(ob))=={'face-%d'%f for f in path})
finally:
    ob[core.KEY]=raw;ob.active_material_index=material
    cfg.select_mode=select_mode;cfg.tool=tool;cfg.picker=picker;cfg.note=note;cfg.click_count=clicks
    core.sync_images(ob);core.redraw()
check('original selection mesh UV rig and pixels restored',snapshot()==before)
report={'version_loaded':policy.VERSION,'passed':len(checks),'checks':checks,'path':path,'blend_saved':False}
(ROOT/'evidence/face-path-live-0.1.17.json').write_text(json.dumps(report,indent=2),encoding='utf8')
