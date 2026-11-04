import bpy,sys,importlib,json,hashlib
from pathlib import Path
addon=next(m for n,m in sys.modules.items() if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
core=addon.core
ui=importlib.import_module(addon.__name__+'.ui')
preview=importlib.import_module(addon.__name__+'.mouth_preview')
policy=importlib.import_module(addon.__name__+'.policy')
preview.restore()
h=bpy.data.objects['Hama'];ctrl=bpy.data.objects['Hama_Cara_Control']
previous_jaw=float(ctrl['v_jawOpen']);before=core.fingerprint(h)
images={im.name:hashlib.sha256(core.pixels(im).tobytes()).hexdigest() for im in bpy.data.images if im.type=='IMAGE' and im.size[0]}
window=bpy.context.window;painter_workspace=next(w for w in bpy.data.workspaces if w.name.startswith('SSTP'))
window.workspace=painter_workspace
assert painter_workspace.name.startswith('SSTP')
layout=bpy.data.workspaces.get('Layout') or next(w for w in bpy.data.workspaces if not w.name.startswith('SSTP'))
with bpy.context.temp_override(object=h,active_object=h):opened=bpy.ops.sstp.workspace()
assert 'FINISHED' in opened and preview.status(h)
assert abs(h.data.shape_keys.key_blocks['jawOpen'].value-1)<1e-6
window.workspace=layout;ui.watch_target()
assert not preview.status() and abs(ctrl['v_jawOpen']-previous_jaw)<1e-6
assert core.fingerprint(h)==before
window.workspace=painter_workspace;ui.watch_target()
assert preview.status(h) and ctrl['v_jawOpen']==1
with preview.suspended():
    assert core.fingerprint(h)==before
    assert all(hashlib.sha256(core.pixels(bpy.data.images[name]).tobytes()).hexdigest()==digest for name,digest in images.items())
core.redraw()
report={'agent_reported_version':policy.VERSION,'preview_loaded_path':preview.__file__,'actual_editor_operator_opened_jaw':True,'actual_workspace_exit_restored_pose':True,'actual_workspace_reentry_opened_jaw':True,'previous_jaw':previous_jaw,'painting_jaw':ctrl['v_jawOpen'],'body_geometry_uv_shape_coordinates_drivers_rig_and_original_pose_preserved':True,'images_unchanged':True,'eyes_vertices':[len(bpy.data.objects[n].data.vertices) for n in ['Hama_Ojo_Procedural_L','Hama_Ojo_Procedural_R']],'blend_saved':False}
out=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter\evidence\mouth-preview-0.1.22\live.json')
out.write_text(json.dumps(report,indent=2),encoding='utf8')
result=report
