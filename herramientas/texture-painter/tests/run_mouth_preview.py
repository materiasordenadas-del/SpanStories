"""Blender regression: temporary jaw preview and all restoration boundaries."""
import sys,json,ast
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
from spanstories_texture_painter import mouth_preview as preview, core

checks=[]
def check(name,value):
    assert value,name
    checks.append(name)

def fixture(name):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(0,0,0),(1,0,0),(0,1,0)],[],[(0,1,2)])
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    ob.shape_key_add(name='Basis');jaw=ob.shape_key_add(name='jawOpen')
    jaw.data[0].co.z=-.2
    return ob,jaw

plain,jaw=fixture('Plain jaw')
jaw.value=.25
before=core.fingerprint(plain)
check('direct key can open',preview.begin(plain) and abs(jaw.value-1)<1e-6)
check('reenter is idempotent',preview.begin(plain) and preview.status(plain))
preview.restore()
check('direct key previous value restored',abs(jaw.value-.25)<1e-6)
check('all original mesh UV shape and rig data preserved',core.fingerprint(plain)==before)

driven,key=fixture('Driven jaw')
ctrl=bpy.data.objects.new('Existing rig control',None);bpy.context.collection.objects.link(ctrl)
ctrl['v_jawOpen']=.23
curve=key.driver_add('value');curve.driver.expression='min(1,max(0,v))'
var=curve.driver.variables.new();var.name='v';var.type='SINGLE_PROP'
var.targets[0].id=ctrl;var.targets[0].data_path='["v_jawOpen"]'
bpy.context.view_layer.update()
before=core.fingerprint(driven)
driver_state=(curve.driver.expression,curve.mute,var.targets[0].id,var.targets[0].data_path)
check('driven jaw opens through existing control',preview.begin(driven) and ctrl['v_jawOpen']==1)
check('evaluated jaw is open',abs(key.value-1)<1e-6)
check('driver was not muted or replaced',(curve.driver.expression,curve.mute,var.targets[0].id,var.targets[0].data_path)==driver_state)
check('no animation created on rig control',ctrl.animation_data is None)
preview.begin(plain)
check('target switch restores old character',abs(ctrl['v_jawOpen']-.23)<1e-6 and abs(jaw.value-1)<1e-6)
preview.sync(enabled=False)
check('workspace exit restores new character',abs(jaw.value-.25)<1e-6 and not preview.status())
preview.begin(driven)
with preview.suspended():
    check('export sees prior jaw pose',abs(ctrl['v_jawOpen']-.23)<1e-6)
    check('timer cannot reopen during export',not preview.begin(driven))
    with preview.suspended():check('nested suspension stays closed',abs(ctrl['v_jawOpen']-.23)<1e-6)
check('export restores painting preview',ctrl['v_jawOpen']==1)
@preview.without_preview
def failed_export():
    check('decorated export uses prior pose',abs(ctrl['v_jawOpen']-.23)<1e-6)
    raise RuntimeError('expected export failure')
try:failed_export()
except RuntimeError:pass
check('failed export also restores preview',ctrl['v_jawOpen']==1)
check('actual GLB entrypoint is protected',hasattr(core.export_glb,'__wrapped__'))
preview.before_save()
check('save handler restores original pose',abs(ctrl['v_jawOpen']-.23)<1e-6)
preview.after_save()
check('save handler resumes preview',ctrl['v_jawOpen']==1)
preview.before_save();preview.after_save()
check('repeated save does not lose original',ctrl['v_jawOpen']==1)
preview.before_load()
check('file switch restores without stale references',abs(ctrl['v_jawOpen']-.23)<1e-6 and not preview.status())
empty=bpy.data.objects.new('Unsupported no mesh',None);bpy.context.collection.objects.link(empty)
check('unsupported character is left intact',not preview.begin(empty))
curve.driver.variables.remove(var)
check('unsupported transform-only driver is left intact',not preview.begin(driven) and abs(ctrl['v_jawOpen']-.23)<1e-6)
var=curve.driver.variables.new();var.name='v';var.type='SINGLE_PROP';var.targets[0].id=ctrl;var.targets[0].data_path='["v_jawOpen"]'
preview.register();preview.register()
check('handlers registered once',bpy.app.handlers.save_pre.count(preview.before_save)==1)
preview.begin(driven);preview.unregister()
check('disable addon restores original pose',abs(ctrl['v_jawOpen']-.23)<1e-6)
check('disable removes save handlers',preview.before_save not in bpy.app.handlers.save_pre)
bpy.context.view_layer.update()
check('driven mesh and rig fully preserved',core.fingerprint(driven)==before)

ui=ast.parse((ROOT/'blender/spanstories_texture_painter/ui.py').read_text(encoding='utf8'))
functions={n.name:ast.unparse(n) for n in ast.walk(ui) if isinstance(n,ast.FunctionDef)}
check('workspace entry activates preview','mouth_preview.begin(cfg.target)' in functions['execute'] or any('mouth_preview.begin(cfg.target)' in ast.unparse(n) for n in ast.walk(ui) if isinstance(n,ast.ClassDef) and n.name=='SSTP_OT_workspace'))
check('workspace watcher restores on exit','mouth_preview.restore()' in functions['watch_target'])
check('target callback synchronizes pose','mouth_preview.sync(ob, active_workspace())' in functions['target_changed'])
check('workspace detection uses actual window','window.workspace' in functions['active_workspace'])
out={'passed':len(checks),'checks':checks,'blend_saved':False}
directory=ROOT/'evidence/mouth-preview-0.1.22';directory.mkdir(exist_ok=True)
(directory/'regression.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print(json.dumps(out))
