"""Install the focused mouth-preview update; keep a recoverable prior add-on."""
from pathlib import Path
import ast,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'blender/spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
BACKUP=ROOT/'RESPALDO/addon-0.1.21-antes-boca/previous-addon'
NAMES=['mouth_preview.py','ui.py','core.py','policy.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']
def normalized(path,skip=()):
    tree=ast.parse(path.read_text(encoding='utf8'))
    tree.body=[n for n in tree.body if getattr(n,'name',None) not in skip]
    for node in ast.walk(tree):
        if isinstance(node,ast.ImportFrom):node.names=[n for n in node.names if n.name!='mouth_preview']
        if isinstance(node,ast.FunctionDef) and node.name=='export_glb':node.decorator_list=[]
    tree.body=[n for n in tree.body if not isinstance(n,ast.ImportFrom) or n.names]
    return ast.dump(tree)
assert normalized(SOURCE/'core.py')==normalized(TARGET/'core.py'),'Unrelated core changes'
allowed={'active_workspace','target_changed','watch_target','SSTP_OT_workspace','draw_controls','register','unregister'}
assert normalized(SOURCE/'ui.py',allowed)==normalized(TARGET/'ui.py',allowed),'Unrelated UI changes'
assert not BACKUP.exists(),'Already installed; inspect instead of overwriting recovery'
BACKUP.mkdir(parents=True)
for name in NAMES:
    if (TARGET/name).exists():shutil.copy2(TARGET/name,BACKUP/name)
for name in NAMES:shutil.copy2(SOURCE/name,TARGET/name)
assert all((SOURCE/n).read_bytes()==(TARGET/n).read_bytes() for n in NAMES)
local=ROOT/'codex-plugin/installed-local'
shutil.copytree(ROOT/'codex-plugin/spanstories-texture-painter',local/'plugins/spanstories-texture-painter',dirs_exist_ok=True)
shutil.copytree(ROOT/'codex-plugin/marketplace/.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
report={'version':'0.1.22','files':{n:hashlib.sha256((TARGET/n).read_bytes()).hexdigest() for n in NAMES},'blend_saved':False,'local_marketplace_synced':True}
report_dir=ROOT/'evidence/install-mouth-preview-0.1.22';report_dir.mkdir(parents=True,exist_ok=True)
(report_dir/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
