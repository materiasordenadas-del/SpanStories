"""Install only the mouth toggle; retain the loaded add-on's other features."""
import ast,shutil,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'blender/spanstories_texture_painter'
target=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
backup=root/'RESPALDO/antes-selector-boca-20261031'
backup.mkdir(exist_ok=True)
text=(target/'ui.py').read_text(encoding='utf8')
new=(source/'ui.py').read_text(encoding='utf8')
def span(text,name):
    n=next(n for n in ast.parse(text).body if getattr(n,'name',None)==name)
    return n.lineno-1,n.end_lineno
for name in ['run_action','draw_hud']:
    a,b=span(text,name);c,d=span(new,name)
    lines=text.splitlines(keepends=True);lines[a:b]=new.splitlines(keepends=True)[c:d];text=''.join(lines)
text=text.replace("bottom=276 if area.type=='VIEW_3D'","bottom=316 if area.type=='VIEW_3D'")
ast.parse(text)
for name in ['ui.py','mouth_preview.py']:
    if not (backup/name).exists():shutil.copy2(target/name,backup/name)
(target/'ui.py').write_text(text,encoding='utf8')
shutil.copy2(source/'mouth_preview.py',target/'mouth_preview.py')
print(json.dumps({'installed':['run_action','draw_hud','mouth_preview'],'backup':str(backup),'blend_saved':False}))
