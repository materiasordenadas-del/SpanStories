"""Stage/install only performance and two-axis pan fixes; preserve other edits."""
import ast, hashlib, json, shutil, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'blender/spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
STAGE=ROOT/'evidence/install-0.1.8'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def replace_function(text,source,name):
    old=next(n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name==name)
    new=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name==name)
    lines=text.splitlines(True);lines[old.lineno-1:old.end_lineno]=source.splitlines(True)[new.lineno-1:new.end_lineno]
    return ''.join(lines)
if '--stage' in sys.argv:
    STAGE.mkdir(parents=True,exist_ok=True)
    dest=STAGE/'addon';dest.mkdir(exist_ok=True)
    texts={name:(TARGET/name).read_text(encoding='utf8') for name in ['core.py','padding.py','ui.py','__init__.py','blender_manifest.toml']}
    for name,functions in [('core.py',['composite']),('ui.py',['draw_uv','drag_view'])]:
        for fn in functions:texts[name]=replace_function(texts[name],(SRC/name).read_text(encoding='utf8'),fn)
    if 'apply_gutter, blend_rgb' not in texts['core.py']:
        texts['core.py']=texts['core.py'].replace('from .padding import MARGIN, gutter_indices, apply_gutter','from .padding import MARGIN, gutter_indices, apply_gutter, blend_rgb')
    if 'def blend_rgb(' in texts['padding.py']:
        texts['padding.py']=replace_function(texts['padding.py'],(SRC/'padding.py').read_text(encoding='utf8'),'blend_rgb')
    else:
        source=(SRC/'padding.py').read_text(encoding='utf8');node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='blend_rgb')
        texts['padding.py']+='\n\n'+''.join(source.splitlines(True)[node.lineno-1:node.end_lineno])+'\n'
    if '_uv_selection_batches={}' not in texts['ui.py']:texts['ui.py']=texts['ui.py'].replace('_uv_batches={}','_uv_batches={}\n_uv_selection_batches={}',1)
    texts['__init__.py']=texts['__init__.py'].replace("'version':(0,1,7)","'version':(0,1,8)")
    texts['blender_manifest.toml']=texts['blender_manifest.toml'].replace('version = "0.1.7"','version = "0.1.8"')
    for name,text in texts.items():
        if name.endswith('.py'):ast.parse(text)
        (dest/name).write_text(text,encoding='utf8')
    report={'before':{n:digest(TARGET/n) for n in texts},'after':{n:digest(dest/n) for n in texts}}
    (STAGE/'staged.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print('Staged targeted 0.1.8 patch; no scene operations')
elif '--install' in sys.argv:
    report=json.loads((STAGE/'staged.json').read_text(encoding='utf8'))
    for name,old in report['before'].items():
        assert digest(TARGET/name)==old,'Installed file changed since staging: '+name
        assert digest(STAGE/'addon'/name)==report['after'][name]
    backup=STAGE/'previous-addon';backup.mkdir(exist_ok=True)
    for name in report['before']:
        assert not (backup/name).exists(),'Backup already exists: '+name
        shutil.copy2(TARGET/name,backup/name)
    for name in report['before']:shutil.copy2(STAGE/'addon'/name,TARGET/name)
    assert all(digest(TARGET/name)==new for name,new in report['after'].items())
    print('Installed and hash-verified 0.1.8; previous add-on files preserved')
