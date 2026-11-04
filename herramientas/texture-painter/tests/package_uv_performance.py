"""Build 0.1.16 packages; install only the changed add-on files when requested."""
import ast, hashlib, json, shutil, sys, tomllib, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ADDON=ROOT/'blender/spanstories_texture_painter'
PLUGIN=ROOT/'codex-plugin/spanstories-texture-painter'
INSTALLED=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
VERSION='0.1.16'
NAMES=['ui.py','__init__.py','policy.py','blender_manifest.toml','AUTO_MEJORA.md']
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if '--install' in sys.argv:
    backup=ROOT/'evidence/install-uv-0.1.16/previous-addon'
    assert not backup.exists(),'Backup already exists; do not overwrite it'
    # Preserve unrelated installed modules. Confirm the old UI matches the one
    # profiled before replacing it; an intervening edit must stop installation.
    assert digest(INSTALLED/'ui.py')=='975bdd2192ecf2a464b40ced38a97e69bf1fb02bd1642448e367a04633a5f2a7'
    backup.mkdir(parents=True)
    for name in NAMES:shutil.copy2(INSTALLED/name,backup/name)
    for name in NAMES:shutil.copy2(ADDON/name,INSTALLED/name)
    assert all(digest(ADDON/name)==digest(INSTALLED/name) for name in NAMES)
    report={'version':VERSION,'installed_files':NAMES,'source_installed_identical':True,'blend_saved':False}
    (backup.parent/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
else:
    for dest in [ADDON/'AUTO_MEJORA.md',PLUGIN/'skills/texture-painter/references/AUTO_MEJORA.md']:
        dest.write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
    for path in ADDON.glob('*.py'):ast.parse(path.read_text(encoding='utf8'))
    assert tomllib.loads((ADDON/'blender_manifest.toml').read_text(encoding='utf8'))['version']==VERSION
    for path in [PLUGIN/'plugin.json',PLUGIN/'.codex-plugin/plugin.json',PLUGIN/'.claude-plugin/plugin.json']:
        assert json.loads(path.read_text(encoding='utf8'))['version']==VERSION
    products=[]
    for kind,src,prefix in [('blender',ADDON,''),('codex',PLUGIN,'spanstories-texture-painter/')]:
        path=ROOT/'dist'/f'spanstories-texture-painter-{kind}-{VERSION}.zip'
        with zipfile.ZipFile(path,'x',zipfile.ZIP_DEFLATED) as z:
            for p in sorted(src.rglob('*')):
                if p.is_file() and '__pycache__' not in p.parts and p.suffix not in {'.pyc','.zip'}:
                    z.write(p,prefix+p.relative_to(src).as_posix())
        with zipfile.ZipFile(path) as z:assert z.testzip() is None
        products.append({'file':str(path),'sha256':digest(path)})
    report={'version':VERSION,'packages':products,'codex_active_cache_changed':False,'blend_saved':False}
    (ROOT/'evidence/uv-packages-0.1.16.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
