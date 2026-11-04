"""Load the focused patch without unregistering Scene.sstp or losing paint UI state."""
import bpy,sys,ast,importlib,json,hashlib
from pathlib import Path

addon=next(m for n,m in sys.modules.items() if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
ui=importlib.import_module(addon.__name__+'.ui');core=addon.core
assert not hasattr(core.export_glb,'__wrapped__'), 'Patch already loaded; inspect instead'
h=bpy.data.objects['Hama'];ctrl=bpy.data.objects['Hama_Cara_Control']
before=core.fingerprint(h)
previous_jaw=float(ctrl['v_jawOpen'])
images={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for im in bpy.data.images if im.type=='IMAGE' and im.size[0]}
preview=importlib.import_module(addon.__name__+'.mouth_preview')
ui.mouth_preview=preview;core.mouth_preview=preview
path=Path(ui.__file__);tree=ast.parse(path.read_text(encoding='utf8'))

def replacement(node,old):
    scratch=dict(vars(ui))
    node.decorator_list=[]
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),scratch)
    fresh=scratch[node.name]
    old.__code__=fresh.__code__;old.__defaults__=fresh.__defaults__;old.__kwdefaults__=fresh.__kwdefaults__

for node in tree.body:
    if isinstance(node,ast.FunctionDef) and node.name in {'active_workspace','target_changed','watch_target','draw_controls','register','unregister'}:
        replacement(node,getattr(ui,node.name))
    elif isinstance(node,ast.ClassDef) and node.name=='SSTP_OT_workspace':
        execute=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name=='execute')
        wrapped=ui.SSTP_OT_workspace.execute
        original=next(cell.cell_contents for cell in wrapped.__closure__ if callable(cell.cell_contents))
        replacement(execute,original)
core.export_glb=preview.without_preview(core.export_glb)
preview.register()
if not bpy.app.timers.is_registered(ui.watch_target):bpy.app.timers.register(ui.watch_target,first_interval=.4)
policy=importlib.reload(importlib.import_module(addon.__name__+'.policy'))
addon.bl_info=getattr(addon,'bl_info',{})
addon.bl_info['version']=(0,1,22)

window=bpy.context.window
painter_workspace=window.workspace
assert painter_workspace.name.startswith('SSTP')
layout=next(w for w in bpy.data.workspaces if not w.name.startswith('SSTP'))
with bpy.context.temp_override(object=h,active_object=h):
    opened=bpy.ops.sstp.workspace()
assert 'FINISHED' in opened and preview.status(h)
assert abs(h.data.shape_keys.key_blocks['jawOpen'].value-1)<1e-6
preview.restore()
assert abs(ctrl['v_jawOpen']-previous_jaw)<1e-6
assert core.fingerprint(h)==before, 'Scene failed exact restoration'
preview.begin(h)
window.workspace=layout
ui.watch_target()
assert not preview.status() and abs(ctrl['v_jawOpen']-previous_jaw)<1e-6
window.workspace=painter_workspace
ui.watch_target()
assert preview.status(h) and ctrl['v_jawOpen']==1
with preview.suspended():
    assert core.fingerprint(h)==before
    assert all(hashlib.sha256(core.pixels(bpy.data.images[name]).tobytes()).hexdigest()==digest for name,digest in images.items())
core.redraw()
report={'loaded_addon_version':list(addon.bl_info['version']),'agent_reported_version':policy.VERSION,'actual_editor_operator_opened_jaw':True,'actual_workspace_exit_restored_pose':True,'actual_workspace_reentry_opened_jaw':True,'previous_jaw':previous_jaw,'painting_jaw':ctrl['v_jawOpen'],'body_geometry_uv_shape_coordinates_drivers_rig_and_original_pose_preserved':True,'images_unchanged':True,'eyes_vertices':[len(bpy.data.objects[n].data.vertices) for n in ['Hama_Ojo_Procedural_L','Hama_Ojo_Procedural_R']],'blend_saved':False}
out=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter\evidence\mouth-preview-0.1.22\live.json')
out.write_text(json.dumps(report,indent=2),encoding='utf8')
result=report
