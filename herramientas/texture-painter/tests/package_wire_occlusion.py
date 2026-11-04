"""Package the occlusion fix; --install updates only its four add-on files."""
from pathlib import Path
import ast, hashlib, json, shutil, sys, tomllib, zipfile

ROOT=Path(__file__).resolve().parents[1]
ADDON=ROOT/'blender/spanstories_texture_painter'
PLUGIN=ROOT/'codex-plugin/spanstories-texture-painter'
VERSION=tomllib.loads((ADDON/'blender_manifest.toml').read_text(encoding='utf8'))['version']
assert VERSION=='0.1.13'
INSTALLED=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
NAMES=['ui.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']

if '--install' in sys.argv:
    backup=ROOT/'evidence/install-wire-0.1.13/previous-addon'
    backup.mkdir(parents=True,exist_ok=True)
    for name in NAMES:
        assert (ADDON/name).is_file() and (INSTALLED/name).is_file(),name
        if name.endswith('.py'):ast.parse((ADDON/name).read_text(encoding='utf8'))
        if not (backup/name).exists():shutil.copy2(INSTALLED/name,backup/name)
        shutil.copy2(ADDON/name,INSTALLED/name)
        assert (ADDON/name).read_bytes()==(INSTALLED/name).read_bytes()
    report={'addon_version':VERSION,'installed_files':NAMES,'source_installed_identical':True,'blend_saved':False}
    (backup.parent/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
else:
    for dest in [ADDON/'AUTO_MEJORA.md',PLUGIN/'skills/texture-painter/references/AUTO_MEJORA.md']:
        dest.write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
    for name in NAMES:
        if name.endswith('.py'):ast.parse((ADDON/name).read_text(encoding='utf8'))
    for path in [PLUGIN/'plugin.json',PLUGIN/'.codex-plugin/plugin.json',PLUGIN/'.claude-plugin/plugin.json']:
        assert json.loads(path.read_text(encoding='utf8'))['version']==VERSION
    local=ROOT/'codex-plugin/installed-local'
    shutil.copytree(PLUGIN,local/'plugins/spanstories-texture-painter',dirs_exist_ok=True)
    products=[]
    for kind,src,prefix in [('blender',ADDON,''),('codex',PLUGIN,'spanstories-texture-painter/')]:
        path=ROOT/'dist'/f'spanstories-texture-painter-{kind}-{VERSION}.zip'
        with zipfile.ZipFile(path,'x',zipfile.ZIP_DEFLATED) as z:
            for p in sorted(src.rglob('*')):
                if p.is_file() and '__pycache__' not in p.parts and p.suffix not in {'.pyc','.zip'}:
                    z.write(p,prefix+p.relative_to(src).as_posix())
        with zipfile.ZipFile(path) as z:assert z.testzip() is None
        products.append({'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    report={'version':VERSION,'packages':products,'codex_active_cache_changed':False,'blend_saved':False}
    (ROOT/'evidence/wire-packages-0.1.13.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
