"""Install only performance changes, preserving the entire existing UI."""
from pathlib import Path
import ast,hashlib,json,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'blender'/'spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
STAGE=ROOT/'evidence'/'install-0.1.5'/'addon'
if '--stage' in sys.argv:
    STAGE.mkdir(parents=True,exist_ok=True)
    for name in ['core.py','padding.py','policy.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']:
        shutil.copy2(SRC/name,STAGE/name)
    source=(SRC/'ui.py').read_text(encoding='utf8');installed=(TARGET/'ui.py').read_text(encoding='utf8')
    def definition(text,name):return next(n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name==name)
    old=definition(installed,'restore_after_load');new=definition(source,'restore_after_load')
    lines=installed.splitlines(True)
    # Preserve the existing decorator and every other operator, drawing and layout.
    lines[old.lineno-1:old.end_lineno]=source.splitlines(True)[new.lineno-1:new.end_lineno]
    merged=''.join(lines);ast.parse(merged);(STAGE/'ui.py').write_text(merged,encoding='utf8')
    for p in STAGE.glob('*.py'):ast.parse(p.read_text(encoding='utf8'))
    report={'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in STAGE.iterdir()},'previous':{p.name:hashlib.sha256((TARGET/p.name).read_bytes()).hexdigest() for p in STAGE.iterdir()},'ui_preserved':True}
    (STAGE.parent/'staged.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print('0.1.5 staged; UI preserved')
elif '--install' in sys.argv:
    report=json.loads((STAGE.parent/'staged.json').read_text(encoding='utf8'))
    backup=STAGE.parent/'previous-addon';backup.mkdir(exist_ok=True)
    for name,digest in report['files'].items():
        assert hashlib.sha256((STAGE/name).read_bytes()).hexdigest()==digest
        assert hashlib.sha256((TARGET/name).read_bytes()).hexdigest()==report['previous'][name],name
    for name in report['files']:
        if not (backup/name).exists():shutil.copy2(TARGET/name,backup/name)
        shutil.copy2(STAGE/name,TARGET/name)
    print('0.1.5 installed')
elif '--sync-plugin' in sys.argv:
    local=ROOT/'codex-plugin'/'installed-local'
    shutil.copytree(ROOT/'codex-plugin'/'spanstories-texture-painter',local/'plugins'/'spanstories-texture-painter',dirs_exist_ok=True)
    shutil.copytree(ROOT/'codex-plugin'/'marketplace'/'.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
    print('Local marketplace source updated')
