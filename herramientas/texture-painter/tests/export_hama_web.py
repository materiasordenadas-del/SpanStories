"""Read original Hama in a separate Blender; never save or edit the live scene."""
from pathlib import Path
import bpy,sys,json,shutil,hashlib,time
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as addon
addon.register()
from spanstories_texture_painter import core,web_optimize as web
source=Path(r'D:\Español\imagen para animación\Vale 2\Hanamichi Sakuragiblend.blend')
OUT=ROOT/'evidence/web-auto-0.1.21';OUT.mkdir(parents=True,exist_ok=True)
digest=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
ob=bpy.data.objects['Hama'];before=core.fingerprint(ob)
optimize=web.optimize_glb;web.optimize_glb=lambda p:{'profile':'native baseline'}
try:exported=core.export_glb(str(OUT/'Hama_native.glb'),ob.name,overwrite=True)
finally:web.optimize_glb=optimize
shutil.copy2(OUT/'Hama_native.glb',OUT/'Hama_web.glb')
start=time.perf_counter();report=web.optimize_glb(OUT/'Hama_web.glb')
result={'export':exported,'web_optimization':report,'seconds':round(time.perf_counter()-start,3),
        'scene_preserved':before==core.fingerprint(ob),'original_blend_unchanged':digest==hashlib.sha256(source.read_bytes()).hexdigest()}
assert result['scene_preserved'] and result['original_blend_unchanged']
(OUT/'hama-validation.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print('SSTP_RESULT '+json.dumps(result))
