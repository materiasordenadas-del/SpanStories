"""Build versioned packages without moving or replacing existing releases."""
from pathlib import Path
import zipfile, shutil, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
ADDON=ROOT/'blender/spanstories_texture_painter'
PLUGIN=ROOT/'codex-plugin/spanstories-texture-painter'
for dest in [ADDON/'AUTO_MEJORA.md',PLUGIN/'skills/texture-painter/references/AUTO_MEJORA.md']:
    dest.write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
installed=Path(r'C:\Users\AdrielPereira\AppData\Roaming\Blender Foundation\Blender\5.2\extensions\user_default\spanstories_texture_painter')
(installed/'AUTO_MEJORA.md').write_bytes((ROOT/'AUTO_MEJORA.md').read_bytes())
local=ROOT/'codex-plugin/installed-local'
shutil.copytree(PLUGIN,local/'plugins/spanstories-texture-painter',dirs_exist_ok=True)
shutil.copytree(ROOT/'codex-plugin/marketplace/.claude-plugin',local/'.claude-plugin',dirs_exist_ok=True)
products=[]
for name,source,prefix in [('blender',ADDON,''),('codex',PLUGIN,'spanstories-texture-painter/')]:
    output=ROOT/'dist'/('spanstories-texture-painter-'+name+'-performance-0.1.8.zip')
    with zipfile.ZipFile(output,'x',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(source.rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and p.suffix not in {'.pyc','.zip'}:
                z.write(p,prefix+p.relative_to(source).as_posix())
    with zipfile.ZipFile(output) as z:assert z.testzip() is None
    products.append({'path':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
print(json.dumps({'packages':products,'installed_addon_revision':'0.1.8','codex_marketplace_source_synced':True,'codex_active_cache_updated':False}))
