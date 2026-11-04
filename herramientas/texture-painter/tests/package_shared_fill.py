"""Install only shared-zone fill dispatch and its metadata, with prior backup."""
import ast,hashlib,json,shutil,tomllib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ADDON=ROOT/'blender/spanstories_texture_painter';PLUGIN=ROOT/'codex-plugin/spanstories-texture-painter'
INSTALLED=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
NAMES=['core.py','ui.py','__init__.py','policy.py','blender_manifest.toml','AUTO_MEJORA.md']
assert tomllib.loads((INSTALLED/'blender_manifest.toml').read_text(encoding='utf8'))['version']=='0.1.19'
def unrelated(path,skip):
    tree=ast.parse(path.read_text(encoding='utf8'))
    tree.body=[n for n in tree.body if getattr(n,'name',None) not in skip]
    return ast.dump(tree)
for name,skip in [('ui.py',{'SSTP_OT_fill'}),('core.py',{'fill'})]:
    assert unrelated(ADDON/name,skip)==unrelated(INSTALLED/name,skip),'Unrelated edits: '+name
for dest in [ADDON/'AUTO_MEJORA.md',PLUGIN/'skills/texture-painter/references/AUTO_MEJORA.md']:
    dest.write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
for p in ADDON.glob('*.py'):ast.parse(p.read_text(encoding='utf8'))
products=[]
for kind,src,prefix in [('blender',ADDON,''),('codex',PLUGIN,'spanstories-texture-painter/')]:
    path=ROOT/'dist'/f'spanstories-texture-painter-{kind}-0.1.20.zip'
    with zipfile.ZipFile(path,'x',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(src.rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and p.suffix not in {'.pyc','.zip'}:z.write(p,prefix+p.relative_to(src).as_posix())
    with zipfile.ZipFile(path) as z:assert z.testzip() is None
    products.append({'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
backup=ROOT/'evidence/install-shared-fill-0.1.20/previous-addon'
assert not backup.exists();backup.mkdir(parents=True)
for name in NAMES:shutil.copy2(INSTALLED/name,backup/name)
for name in NAMES:shutil.copy2(ADDON/name,INSTALLED/name)
assert all((ADDON/n).read_bytes()==(INSTALLED/n).read_bytes() for n in NAMES)
report={'version':'0.1.20','installed_files':NAMES,'source_installed_identical':True,'packages':products,'blend_saved':False}
(backup.parent/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
