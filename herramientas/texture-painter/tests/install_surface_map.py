from pathlib import Path
import ast,json,shutil,hashlib
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'blender/spanstories_texture_painter'
TARGET=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
BACKUP=ROOT/'RESPALDO/addon-0.1.22-antes-seleccion/previous-addon'
NAMES=['surface_map.py','ui.py','core.py','policy.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']
def normalized(path,skip=()):
    tree=ast.parse(path.read_text(encoding='utf8'));tree.body=[n for n in tree.body if getattr(n,'name',None) not in skip]
    for node in ast.walk(tree):
        if isinstance(node,ast.ImportFrom):node.names=[n for n in node.names if n.name!='surface_map']
    tree.body=[n for n in tree.body if not isinstance(n,ast.ImportFrom) or n.names]
    return ast.dump(tree)
assert normalized(SOURCE/'core.py',{'sample_surface'})==normalized(TARGET/'core.py',{'sample_surface'})
allowed={'model_hit','pick_model_color','SSTP_OT_click','restore_after_load','draw_model','register','unregister'}
assert normalized(SOURCE/'ui.py',allowed)==normalized(TARGET/'ui.py',allowed)
assert not BACKUP.exists()
BACKUP.mkdir(parents=True)
for name in NAMES:
    if (TARGET/name).exists():shutil.copy2(TARGET/name,BACKUP/name)
for name in NAMES:shutil.copy2(SOURCE/name,TARGET/name)
local=ROOT/'codex-plugin/installed-local'
shutil.copytree(ROOT/'codex-plugin/spanstories-texture-painter',local/'plugins/spanstories-texture-painter',dirs_exist_ok=True)
shutil.copytree(ROOT/'codex-plugin/marketplace/.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
report={'version':'0.1.23','files':{n:hashlib.sha256((TARGET/n).read_bytes()).hexdigest() for n in NAMES},'blend_saved':False}
out=ROOT/'evidence/install-surface-map-0.1.23';out.mkdir(parents=True,exist_ok=True)
(out/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
