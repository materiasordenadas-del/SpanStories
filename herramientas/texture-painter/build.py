from pathlib import Path
import json
import zipfile
import tomllib
import hashlib
import shutil

ROOT=Path(__file__).resolve().parent
DIST=ROOT/'dist';DIST.mkdir(exist_ok=True)
ADDON=ROOT/'blender'/'spanstories_texture_painter'
PLUGIN=ROOT/'codex-plugin'/'spanstories-texture-painter'
for destination in (ADDON/'AUTO_MEJORA.md',PLUGIN/'skills'/'texture-painter'/'references'/'AUTO_MEJORA.md'):
    destination.write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
with zipfile.ZipFile(ROOT.parent/'add-on-paint-system-v2.1.18.zip') as z:
    license_name=next(n for n in z.namelist() if Path(n).name=='LICENSE')
    license_text=z.read(license_name)
for source in (ADDON,PLUGIN):(source/'LICENSE').write_bytes(license_text)
for p in PLUGIN.rglob('*.json'):json.loads(p.read_text(encoding='utf-8'))
manifest=json.loads((PLUGIN/'plugin.json').read_text(encoding='utf-8'))
assert len(manifest['extensions']['com.openai']['interface']['shortDescription'])<=30
extension=tomllib.loads((ADDON/'blender_manifest.toml').read_text(encoding='utf-8'))
assert extension['id']=='spanstories_texture_painter' and len(extension['tagline'])<=64
version=manifest['version']
archive=ROOT/'RESPALDO'/'instaladores'
for previous in DIST.glob('spanstories-texture-painter-*.zip'):
    if previous.name.endswith('-'+version+'.zip'):continue
    archive.mkdir(parents=True,exist_ok=True)
    destination=archive/previous.name
    if destination.exists():
        destination=archive/(previous.stem+'-'+hashlib.sha256(previous.read_bytes()).hexdigest()[:12]+previous.suffix)
    if destination.exists():raise RuntimeError('El respaldo ya existe: '+str(destination))
    shutil.move(str(previous),str(destination))
assert extension['version']==version
for overlay in ('.codex-plugin','.claude-plugin'):
    assert json.loads((PLUGIN/overlay/'plugin.json').read_text(encoding='utf-8'))['version']==version
files=lambda base: sorted(p for p in base.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.zip'))
products=[]
def pack(name,base,prefix=''):
    path=DIST/name
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        for p in files(base):z.write(p,prefix+p.relative_to(base).as_posix())
    return path
products.append(pack(f'spanstories-texture-painter-blender-{version}.zip',ADDON))
products.append(pack(f'spanstories-texture-painter-codex-{version}.zip',PLUGIN,'spanstories-texture-painter/'))
market=DIST/f'spanstories-texture-painter-codex-local-{version}.zip'
with zipfile.ZipFile(market,'w',zipfile.ZIP_DEFLATED) as z:
    z.write(ROOT/'codex-plugin'/'marketplace'/'.claude-plugin'/'marketplace.json','spanstories-texture-painter-local/.claude-plugin/marketplace.json')
    for p in files(PLUGIN):z.write(p,'spanstories-texture-painter-local/plugins/spanstories-texture-painter/'+p.relative_to(PLUGIN).as_posix())
products.append(market)
result=[]
for p in products:
    with zipfile.ZipFile(p) as z:
        assert z.testzip() is None
        names=z.namelist();assert all('__pycache__' not in n and (not n.endswith('.blend') or n.endswith('assets/piel_nodos.blend')) for n in names)
        result.append({'file':p.name,'bytes':p.stat().st_size,'files':len(names),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(DIST/'packages.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
