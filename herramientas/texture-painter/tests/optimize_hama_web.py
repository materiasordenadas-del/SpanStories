"""Rerun texture optimization against the unchanged real native-export fixture."""
from pathlib import Path
import sys,json,shutil
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'blender'))
from spanstories_texture_painter import web_optimize
OUT=ROOT/'evidence/web-auto-0.1.21'
shutil.copy2(OUT/'Hama_native.glb',OUT/'Hama_web.glb')
report=web_optimize.optimize_glb(OUT/'Hama_web.glb')
record=json.loads((OUT/'hama-validation.json').read_text())
record['web_optimization']=report
(OUT/'hama-validation.json').write_text(json.dumps(record,indent=2),encoding='utf8')
print('SSTP_RESULT '+json.dumps(report))
