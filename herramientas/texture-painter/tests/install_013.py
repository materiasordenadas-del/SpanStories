"""Stage/install this authorized update while preserving the installed UI layout."""
from pathlib import Path
import ast,hashlib,json,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'blender'/'spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
STAGE=ROOT/'evidence'/'install-0.1.3'/'addon'
BACKUP=ROOT/'evidence'/'install-0.1.3'/'previous-addon'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def definitions(text):return {n.name:n for n in ast.parse(text).body if isinstance(n,(ast.ClassDef,ast.FunctionDef))}
def get_definition(text,node):
    start=min([node.lineno]+[v.lineno for v in node.decorator_list])-1
    return ''.join(text.splitlines(keepends=True)[start:node.end_lineno]),start,node.end_lineno
if '--stage' in sys.argv:
    STAGE.mkdir(parents=True,exist_ok=True)
    for p in SRC.iterdir():
        if p.is_file() and p.suffix in ('.py','.toml','.md') or p.name=='LICENSE':shutil.copy2(p,STAGE/p.name)
    source=(SRC/'ui.py').read_text(encoding='utf8');installed=(TARGET/'ui.py').read_text(encoding='utf8')
    old_defs=definitions(installed);new_defs=definitions(source);replacements=[]
    names=['end_paint','SSTP_OT_controller','start_controller','restore_after_load','SSTP_OT_brush','SSTP_OT_stroke']
    for name in names:
        updated,_,_=get_definition(source,new_defs[name]);_,lo,hi=get_definition(installed,old_defs[name])
        if name=='end_paint':updated=get_definition(source,new_defs['refresh_native_paint'])[0]+'\n\n'+updated
        replacements.append((lo,hi,updated+'\n'))
    lines=installed.splitlines(keepends=True)
    for lo,hi,updated in sorted(replacements,reverse=True):lines[lo:hi]=[updated]
    merged=''.join(lines);ast.parse(merged);(STAGE/'ui.py').write_text(merged,encoding='utf8')
    for name in ['draw_controls','draw_hud','draw_header','draw_uv','draw_model']:
        old=old_defs.get(name);new=definitions(merged).get(name)
        if old:assert ast.dump(old,include_attributes=False)==ast.dump(new,include_attributes=False),name
    report={'previous_hashes':{p.name:digest(TARGET/p.name) if (TARGET/p.name).exists() else None for p in STAGE.iterdir()},'staged_hashes':{p.name:digest(p) for p in STAGE.iterdir()},'preserved_installed_ui':True}
    (STAGE.parent/'staged.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    # Update the existing marketplace source, never its cache directly.
    plugin=ROOT/'codex-plugin'/'spanstories-texture-painter';local=ROOT/'codex-plugin'/'installed-local'
    shutil.copytree(plugin,local/'plugins'/'spanstories-texture-painter',dirs_exist_ok=True)
    shutil.copytree(ROOT/'codex-plugin'/'marketplace'/'.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
    print(json.dumps({'staged':len(report['staged_hashes']),'installed_ui_preserved':True,'marketplace_source_updated':True}))
elif '--install' in sys.argv:
    assert TARGET.resolve()==Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter').resolve()
    report=json.loads((STAGE.parent/'staged.json').read_text(encoding='utf8'))
    for name,old in report['previous_hashes'].items():
        current=TARGET/name
        assert (digest(current) if current.exists() else None)==old,('Installed file changed after staging',name)
        assert digest(STAGE/name)==report['staged_hashes'][name],name
    BACKUP.mkdir(parents=True,exist_ok=True)
    for name in report['staged_hashes']:
        current=TARGET/name
        if current.exists():
            backup=BACKUP/name
            if not backup.exists():shutil.copy2(current,backup)
        shutil.copy2(STAGE/name,current)
        assert digest(current)==report['staged_hashes'][name]
    print(json.dumps({'installed':'0.1.3','files':len(report['staged_hashes']),'backup':str(BACKUP)}))
else:raise SystemExit('Use --stage or --install')
