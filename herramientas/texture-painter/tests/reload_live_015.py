"""Load performance fixes, preserving scene, paint pixels and undo history."""
import bpy,sys,importlib,ast,hashlib,json,time
from pathlib import Path
ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=next(m for n,m in sys.modules.items() if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
core=addon.core;ui=addon.ui;o=bpy.context.scene.sstp.target
ui.end_paint(bpy.context)
before=core.fingerprint(o);s=core.state(o)
names={n for l in s['layers'] for n in l['images'].values()}
names.update(v[k] for v in s['slots'].values() for k in ('base','source_image') if v.get(k))
hashes={n:hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest() for n in names}
history=core._history
importlib.reload(sys.modules[addon.__name__+'.padding']);importlib.reload(core);core._history=history
importlib.reload(sys.modules[addon.__name__+'.policy']);importlib.reload(sys.modules[addon.__name__+'.agent']);importlib.reload(addon)
source=Path(ui.__file__).read_text(encoding='utf8');node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='restore_after_load')
previous=ui.restore_after_load
exec(compile(ast.Module(body=[node],type_ignores=[]),ui.__file__,'exec'),ui.__dict__)
if previous in bpy.app.handlers.load_post:bpy.app.handlers.load_post.remove(previous)
bpy.app.handlers.load_post.append(ui.restore_after_load)
core.sync_images(o);core.redraw()
result={'version':addon.bl_info['version'],'object':o.name,'resolution':core.state(o)['resolution'],'geometry_uv_shapes_rig_unchanged':core.fingerprint(o)==before,'all_work_and_original_pixels_unchanged':all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in hashes.items()),'history_preserved':core._history is history,'saved_blend':False}
assert result['geometry_uv_shapes_rig_unchanged'] and result['all_work_and_original_pixels_unchanged'] and result['history_preserved']
(ROOT/'evidence'/'live-upgrade-0.1.5.json').write_text(json.dumps(result,indent=2),encoding='utf8')
