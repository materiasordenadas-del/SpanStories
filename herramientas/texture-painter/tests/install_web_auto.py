"""Install the reviewed export-only update and synchronize the local marketplace."""
from pathlib import Path
import ast,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'blender/spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
BACKUP=ROOT/'evidence/install-web-auto-0.1.21/previous-addon'
NAMES=['core.py','web_optimize.py','export_assets.py','agent.py','policy.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']
def unrelated(path,skip):
    tree=ast.parse(path.read_text(encoding='utf8'));tree.body=[n for n in tree.body if getattr(n,'name',None) not in skip]
    return ast.dump(tree)
for name,skip in [('core.py',{'export_glb'}),('agent.py',{'export'})]:
    assert unrelated(SOURCE/name,skip)==unrelated(TARGET/name,skip),'Unrelated changes in '+name
assert (SOURCE/'ui.py').read_bytes()==(TARGET/'ui.py').read_bytes(),'Existing UI differs'
assert not BACKUP.exists(),'Already installed; inspect before reinstalling'
BACKUP.mkdir(parents=True)
for name in NAMES:
    if (TARGET/name).exists():shutil.copy2(TARGET/name,BACKUP/name)
for name in NAMES:shutil.copy2(SOURCE/name,TARGET/name)
assert all((SOURCE/n).read_bytes()==(TARGET/n).read_bytes() for n in NAMES)
local=ROOT/'codex-plugin/installed-local'
shutil.copytree(ROOT/'codex-plugin/spanstories-texture-painter',local/'plugins/spanstories-texture-painter',dirs_exist_ok=True)
shutil.copytree(ROOT/'codex-plugin/marketplace/.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
report={'version':'0.1.21','installed_files':{n:hashlib.sha256((TARGET/n).read_bytes()).hexdigest() for n in NAMES},'ui_preserved':True,'blend_saved':False}
(BACKUP.parent/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
