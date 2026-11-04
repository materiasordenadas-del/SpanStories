"""Install the reviewed navigation update; preserve prior add-on files for rollback."""
from pathlib import Path
import ast, hashlib, json, shutil, tomllib

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'blender'/'spanstories_texture_painter'
target=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
version=tomllib.loads((source/'blender_manifest.toml').read_text(encoding='utf8'))['version']
backup=ROOT/'evidence'/('install-navigation-'+version)/'previous-addon'
names=('ui.py','core.py','__init__.py','policy.py','blender_manifest.toml','AUTO_MEJORA.md')
for name in names:
    assert (source/name).is_file() and (target/name).is_file(),name
    if name.endswith('.py'):ast.parse((source/name).read_text(encoding='utf8'))
backup.mkdir(parents=True,exist_ok=True)
for name in names:
    if not (backup/name).exists():shutil.copy2(target/name,backup/name)
    shutil.copy2(source/name,target/name)
    assert (source/name).read_bytes()==(target/name).read_bytes()
report={'version':version,'files':{name:hashlib.sha256((target/name).read_bytes()).hexdigest() for name in names},'saved_blend':False}
(backup.parent/'installed.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
