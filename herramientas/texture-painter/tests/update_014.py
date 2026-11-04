"""Stage the update over the installed UI, preserving unrelated custom controls."""
from pathlib import Path
import ast,json,shutil,sys,hashlib
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'blender'/'spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
STAGE=ROOT/'evidence'/'install-0.1.4'/'addon'
def defs(text):return {n.name:n for n in ast.parse(text).body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
def fragment(text,node):
    lo=min([node.lineno]+[x.lineno for x in node.decorator_list])-1
    return ''.join(text.splitlines(True)[lo:node.end_lineno]),lo,node.end_lineno
if '--stage' in sys.argv:
    STAGE.mkdir(parents=True,exist_ok=True)
    for p in SRC.iterdir():
        if p.is_file():shutil.copy2(p,STAGE/p.name)
    source=(SRC/'ui.py').read_text(encoding='utf8');installed=(TARGET/'ui.py').read_text(encoding='utf8')
    new=defs(source);old=defs(installed);lines=installed.splitlines(True)
    names=['SSTP_Settings','SSTP_OT_workspace','refresh_native_paint','end_paint','SSTP_OT_click','SSTP_OT_brush','start_controller','restore_after_load','run_action','draw_hud','register','unregister']
    edits=[]
    for name in names:
        text,_,_=fragment(source,new[name]);_,lo,hi=fragment(installed,old[name]);edits.append((lo,hi,text+'\n'))
    for lo,hi,text in sorted(edits,reverse=True):lines[lo:hi]=[text]
    merged=''.join(lines)
    helpers='\n\n'.join(fragment(source,new[n])[0] for n in ['isolate_target','target_changed','watch_target'])
    if 'target_changed' in old:
        first=fragment(merged,defs(merged)['isolate_target'])[1]
        last=defs(merged)['watch_target'].end_lineno
        updated=merged.splitlines(True);updated[first:last]=[helpers+'\n'];merged=''.join(updated)
    else:
        merged=merged.replace('class SSTP_Color(PropertyGroup):',helpers+'\n\n\nclass SSTP_Color(PropertyGroup):')
    if '_bound_target=None' not in merged:merged=merged.replace("_draw_counts={'uv':0,'model':0}","_draw_counts={'uv':0,'model':0}\n_bound_target=None")
    ast.parse(merged);(STAGE/'ui.py').write_text(merged,encoding='utf8')
    for name in ['draw_controls','image_header','draw_uv','draw_model']:
        assert ast.dump(old[name])==ast.dump(defs(merged)[name]),name
    for p in STAGE.glob('*.py'):ast.parse(p.read_text(encoding='utf8'))
    report={'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in STAGE.iterdir() if p.is_file()},'preserved_ui':True}
    (STAGE.parent/'staged.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print('Staged 0.1.4; existing sidebar and overlays preserved')
elif '--sync-plugin' in sys.argv:
    local=ROOT/'codex-plugin'/'installed-local'
    shutil.copytree(ROOT/'codex-plugin'/'spanstories-texture-painter',local/'plugins'/'spanstories-texture-painter',dirs_exist_ok=True)
    shutil.copytree(ROOT/'codex-plugin'/'marketplace'/'.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
    print('Marketplace source synchronized to 0.1.4')
elif '--install' in sys.argv:
    report=json.loads((STAGE.parent/'staged.json').read_text(encoding='utf8'))
    backup=STAGE.parent/'previous-addon';backup.mkdir(exist_ok=True)
    for name,digest in report['files'].items():
        assert hashlib.sha256((STAGE/name).read_bytes()).hexdigest()==digest
        if (TARGET/name).exists() and not (backup/name).exists():shutil.copy2(TARGET/name,backup/name)
        shutil.copy2(STAGE/name,TARGET/name)
    print('Installed 0.1.4 with previous addon preserved')
