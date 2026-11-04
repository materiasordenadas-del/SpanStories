"""Independent factory-startup Blender instances; never open the live .blend."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,json,time
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence'/'regression-0.2.0';OUT.mkdir(exist_ok=True)
tests=('run_blender.py','run_selection_materials.py','run_padding.py','run_target_modes.py','run_face_picker.py','run_interactive_performance.py','run_piel_gotero_pincel.py','run_panel_herramientas.py')
def run(name):
    start=time.monotonic();log=OUT/(name+'.log')
    with log.open('w',encoding='utf8') as stream:
        p=subprocess.run([r'D:\Blender 5.2\blender.exe','--background','--factory-startup','--python-exit-code','1','--python',str(ROOT/'tests'/name)],stdout=stream,stderr=subprocess.STDOUT)
    lines=log.read_text(encoding='utf8',errors='replace').splitlines()
    result={'test':name,'exit_code':p.returncode,'seconds':round(time.monotonic()-start,1),'results':[line for line in lines if 'RESULT' in line]}
    if p.returncode:result['errors']=lines[-22:]
    print(json.dumps(result),flush=True)
    return result
with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,tests))
(OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
raise SystemExit(0 if all(r['exit_code']==0 for r in results) else 1)
