"""0.2.4: every button of the SSTP space menu is also in the side panel.

blender -b --factory-startup --python-exit-code 1 -P tests/run_panel_herramientas.py
"""
from pathlib import Path
import inspect
import re
import sys
import bpy

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'blender'))
import spanstories_texture_painter as sstp
sstp.register()
from spanstories_texture_painter import ui

hud=inspect.getsource(ui.draw_hud)
# Menu of the character view: the labelled action buttons drawn by the HUD.
start=hud.index("'Boca abierta'");menu=hud[start:hud.index('Solo texturas',start)]
wanted=set(re.findall(r"'([A-Z_]+)'\)",menu))|set(re.findall(r"\('[^']+','([A-Z_]+)'",menu))
wanted-={'COLOR','FACE','MODEL','UV'}  # colour swatch = colour property; the rest are state comparisons
tools=inspect.getsource(ui.draw_tools)
present=set(re.findall(r"'([A-Z_]+)'",tools))
missing=sorted(a for a in wanted if a not in present and not a.startswith(('SIZE','STRENGTH')))
assert not missing,('faltan en el panel lateral',missing)
assert 'brush_size' in tools and 'strength' in tools and "'color'" in tools
assert all(a in ui.ACTION_TIPS for a in wanted if not a.startswith(('SIZE','STRENGTH'))),('falta descripción',[a for a in wanted if a not in ui.ACTION_TIPS])
assert hasattr(bpy.types,'SSTP_OT_action') and 'show_piel' in ui.SSTP_Settings.bl_rna.properties
assert "draw_tools(layout,context)" in inspect.getsource(ui.draw_controls)
from spanstories_texture_painter import piel_ui
assert callable(piel_ui.draw_panel)
print('SSTP_PANEL_RESULT',{'actions':sorted(wanted)})
