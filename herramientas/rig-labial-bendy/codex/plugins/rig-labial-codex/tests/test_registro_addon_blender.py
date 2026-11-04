"""Registro completo y retirada limpia del complemento, sin personaje de usuario."""
import bpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / 'assets'))
import rig_labial_bendy as addon
addon.register()
assert hasattr(bpy.types.Scene, 'rlb')
assert hasattr(bpy.types.Scene, 'rlb_editor')
assert hasattr(bpy.types.Scene, 'rlb_labios_manual')
assert hasattr(bpy.types.Scene, 'rlb_habla_ed')
addon.unregister()
assert not hasattr(bpy.types.Scene, 'rlb_editor')
assert not hasattr(bpy.types.Scene, 'rlb_labios_manual')
print('RLB_REGISTRO_OK')
