from pathlib import Path
import ast,json,shutil,hashlib
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'blender/spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
BACKUP=ROOT/'RESPALDO/addon-0.1.23-antes-recolor/previous-addon'
NAMES=['ui.py','policy.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']
def normalized(path):
    tree=ast.parse(path.read_text(encoding='utf8'));tree.body=[n for n in tree.body if getattr(n,'name',None)!='SSTP_OT_fill'];return ast.dump(tree)
assert normalized(SOURCE/'ui.py')==normalized(TARGET/'ui.py')
assert (SOURCE/'core.py').read_bytes()==(TARGET/'core.py').read_bytes()
assert not BACKUP.exists()
BACKUP.mkdir(parents=True)
for name in NAMES:shutil.copy2(TARGET/name,BACKUP/name)
for name in NAMES:shutil.copy2(SOURCE/name,TARGET/name)
local=ROOT/'codex-plugin/installed-local'
shutil.copytree(ROOT/'codex-plugin/spanstories-texture-painter',local/'plugins/spanstories-texture-painter',dirs_exist_ok=True)
shutil.copytree(ROOT/'codex-plugin/marketplace/.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
report={'version':'0.1.24','files':{n:hashlib.sha256((TARGET/n).read_bytes()).hexdigest() for n in NAMES},'blend_saved':False}
out=ROOT/'evidence/arms-color-0.1.24';out.mkdir(parents=True,exist_ok=True);(out/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
