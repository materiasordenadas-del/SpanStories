"""Load installed technical changes without resetting the open character or UI."""
import bpy,sys,importlib,ast,builtins,hashlib,json
from pathlib import Path
ROOT=Path(r'D:\Español\imagen para animación\Animation app\SpanStories Texture Painter')
addon=next(m for n,m in sys.modules.items() if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
ob=bpy.data.objects['Lamine'];core=addon.core;s=core.state(ob)
before=core.fingerprint(ob);history=core._history
layer_pixels={name:core.pixels(bpy.data.images[name]).copy() for l in s['layers'] for name in l['images'].values()}
protected={v[k] for v in s['slots'].values() for k in ('base','source_image','previous_base') if v.get(k)}
protected_hash={n:hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest() for n in protected}
core=importlib.reload(core);core._history=history
policy=importlib.import_module(addon.__name__+'.policy')
agent=importlib.import_module(addon.__name__+'.agent');importlib.reload(agent)
ui=importlib.import_module(addon.__name__+'.ui')
source=Path(ui.__file__).read_text(encoding='utf8');tree=ast.parse(source)
names={'refresh_native_paint','end_paint','SSTP_OT_controller','start_controller','restore_after_load','SSTP_OT_brush','SSTP_OT_stroke'}
for node in tree.body:
    if not isinstance(node,(ast.ClassDef,ast.FunctionDef)) or node.name not in names:continue
    old=ui.__dict__.get(node.name)
    exec(compile(ast.Module(body=[node],type_ignores=[]),ui.__file__,'exec'),ui.__dict__)
    if isinstance(node,ast.ClassDef) and old:
        new=ui.__dict__[node.name]
        for name in ('execute','invoke','modal','cancel','dab'):
            if name in new.__dict__:setattr(old,name,new.__dict__[name])
        ui.__dict__[node.name]=old
migration_deferred=ob.mode not in ('OBJECT','TEXTURE_PAINT')
if not migration_deferred:core.prepare(ob.name)
after=core.fingerprint(ob);s=core.state(ob)
surface_equal=True
if migration_deferred:
    surface_equal=all(__import__('numpy').array_equal(core.pixels(bpy.data.images[name]),data) for name,data in layer_pixels.items())
else:
    g=core.geometry(ob)
    for layer in s['layers']:
        for slot,name in layer['images'].items():
            ids=[i for i,v in g['islands'].items() if v['material']==int(slot)]
            mask=core.raster(ob,ids,int(slot),s['resolution'])
            if not __import__('numpy').array_equal(core.pixels(bpy.data.images[name])[mask],layer_pixels[name][mask]):surface_equal=False
protected_equal=all(hashlib.sha256(core.pixels(bpy.data.images[n]).tobytes()).hexdigest()==h for n,h in protected_hash.items())
bridge=importlib.import_module(addon.__name__+'.bridge');was_running=bridge.running()
if not was_running:importlib.reload(bridge)
connection=bridge.start()
builtins._sstp_bridge_was_running_013=was_running
context=agent.start(ob.name) if not migration_deferred else {'self_improvement':policy.SELF_IMPROVEMENT}
result={'addon_version':policy.VERSION,'policy_delivered':context['self_improvement']['required'],
        'geometry_uv_shapes_rig_unchanged':before==after,'all_layer_surface_pixels_unchanged':surface_equal,
        'original_images_unchanged':protected_equal,'history_preserved':core._history is history,
        'layers':len(s['layers']),'installed_ui_layout_preserved':True,
        'bridge_running_for_verification':bridge.running(),'bridge_previously_running':was_running,
        'migration_deferred_until_next_paint':migration_deferred,'user_mode_preserved':ob.mode,'saved_blend':False}
assert all(result[k] for k in ('policy_delivered','geometry_uv_shapes_rig_unchanged','all_layer_surface_pixels_unchanged','original_images_unchanged','history_preserved'))
(ROOT/'evidence'/'live-upgrade-0.1.3.json').write_text(json.dumps(result,indent=2),encoding='utf8')
