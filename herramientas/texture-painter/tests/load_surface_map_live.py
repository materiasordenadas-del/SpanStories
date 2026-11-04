import bpy,sys,ast,importlib
from pathlib import Path
addon=next(m for n,m in sys.modules.items() if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
ui=importlib.import_module(addon.__name__+'.ui');core=addon.core
surface_map=importlib.import_module(addon.__name__+'.surface_map')
ui.surface_map=surface_map;surface_map.register()

def replace(node,old,namespace,path):
    scratch=dict(namespace);node.decorator_list=[]
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),scratch)
    fresh=scratch[node.name]
    old.__code__=fresh.__code__;old.__defaults__=fresh.__defaults__;old.__kwdefaults__=fresh.__kwdefaults__

path=Path(ui.__file__);tree=ast.parse(path.read_text(encoding='utf8'))
for node in tree.body:
    if isinstance(node,ast.FunctionDef) and node.name in {'model_hit','pick_model_color','restore_after_load','draw_model','register','unregister'}:
        replace(node,getattr(ui,node.name),vars(ui),path)
    elif isinstance(node,ast.ClassDef) and node.name=='SSTP_OT_click':
        invoke=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name=='invoke')
        replace(invoke,ui.SSTP_OT_click.invoke,vars(ui),path)
path=Path(core.__file__);tree=ast.parse(path.read_text(encoding='utf8'))
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='sample_surface')
replace(node,core.sample_surface,vars(core),path)
policy=importlib.reload(importlib.import_module(addon.__name__+'.policy'))
ui._model_batches.clear();ui._draw_errors.pop('model',None)
bpy.context.scene.sstp.show_faces=True
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:area.tag_redraw()
result={'loaded_version':policy.VERSION,'grid_enabled':bpy.context.scene.sstp.show_faces,'mode':bpy.context.scene.sstp.select_mode,'blend_saved':False}
