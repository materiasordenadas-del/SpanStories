"""Package/install the face-path addition, preserving other add-on modules."""
import ast,hashlib,json,shutil,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ADDON=ROOT/'blender/spanstories_texture_painter'
PLUGIN=ROOT/'codex-plugin/spanstories-texture-painter'
INSTALLED=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
VERSION='0.1.17'
NAMES=['core.py','ui.py','policy.py','__init__.py','blender_manifest.toml','AUTO_MEJORA.md']
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if '--install' in sys.argv:
    assert digest(INSTALLED/'core.py')=='a0b796f3c37735280cc97af325fb365da90832d73d1f318f954bc3a2de023301'
    assert digest(INSTALLED/'ui.py')=='e06b154e090ae0a98aa9a8df1c0d78c8b322c1f7bdce6e25e501c5535b5599e6'
    backup=ROOT/'evidence/install-face-path-0.1.17/previous-addon'
    assert not backup.exists()
    backup.mkdir(parents=True)
    for name in NAMES:shutil.copy2(INSTALLED/name,backup/name)
    for name in NAMES:shutil.copy2(ADDON/name,INSTALLED/name)
    assert all(digest(ADDON/n)==digest(INSTALLED/n) for n in NAMES)
    report={'version':VERSION,'installed_files':NAMES,'source_installed_identical':True,'blend_saved':False}
    (backup.parent/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
else:
    for dest in [ADDON/'AUTO_MEJORA.md',PLUGIN/'skills/texture-painter/references/AUTO_MEJORA.md']:
        dest.write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
    for p in ADDON.glob('*.py'):ast.parse(p.read_text(encoding='utf8'))
    for p in [PLUGIN/'plugin.json',PLUGIN/'.codex-plugin/plugin.json',PLUGIN/'.claude-plugin/plugin.json']:
        assert json.loads(p.read_text(encoding='utf8'))['version']==VERSION
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
    (ROOT/'evidence/face-path-packages-0.1.17.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
