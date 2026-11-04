# Desarrollo: copia la fuente al add-on instalado, lo recarga y (si se pide) rehace un personaje desde cero.
# En Blender:  ORIGEN = 'Malcon'; exec(open(r'...\dev_probar.py', encoding='utf-8').read())
import bpy, sys, shutil, addon_utils, time, json
SRC = r"D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\rig_labial_bendy"
DST = r"C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\rig_labial_bendy"
NAME = 'bl_ext.user_default.rig_labial_bendy'
addon_utils.disable(NAME)
for _m in [m for m in sys.modules if m.startswith(NAME)]: del sys.modules[_m]
shutil.copytree(SRC, DST, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
addon_utils.enable(NAME, default_set=True)
from bl_ext.user_default.rig_labial_bendy.nucleo import pasos
_o = globals().get('ORIGEN')
if _o:
    _cara = bpy.data.objects.get(_o + 'R')
    _ocultos = list(_cara.get('rlb_ocultos', [])) if _cara else []
    if _cara: pasos.quitar(_cara, tambien_cara=True)
    _cara = pasos.preparar_copia(bpy.data.objects[_o])
    _cara['rlb_ocultos'] = _ocultos
    _t = time.time()
    _out = {'det': pasos.detectar(_cara, globals().get('CURSOR'))}
    _out['todo'] = pasos.todo(_cara, ojos_modo='VALE')
    pasos.revisar(_cara)
    _out['t'] = round(time.time() - _t, 1)
    result = json.loads(json.dumps(_out, default=str))
