"""Stage a fresh Barcelona export without changing the saved Blender or live assets.

Blender: --background --factory-startup SOURCE --python refresh_barcelona.py
Offline: python refresh_barcelona.py
The validated stage is published separately by replacing the zone assets/manifest.
"""
import os
import sys
import hashlib
import json
import shutil
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAGE = ROOT / 'reports' / 'barcelona-refresh'
ZONE_PART = Path('Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia')
STAGE.mkdir(parents=True, exist_ok=True)
(STAGE / 'reports').mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / 'scripts'))
import export_optimize

EXPORT_ROOT = ROOT if '--surfaces' in sys.argv else STAGE
export_optimize.PROJECT = str(EXPORT_ROOT)
export_optimize.ZONE = str(EXPORT_ROOT / ZONE_PART)


def run(name):
    file = ROOT / 'scripts' / name
    code = file.read_text(encoding='utf8')
    code = code.replace("PROJECT = r'D:\\Español\\SpanStories-Ciudades'", 'PROJECT = ' + repr(str(EXPORT_ROOT)))
    print('REFRESH_STEP ' + name, flush=True)
    exec(compile(code, str(file), 'exec'), {'__name__': '__main__', '__file__': str(file)})


def publish():
    zone = ROOT / ZONE_PART
    staged_zone = STAGE / ZONE_PART
    backup = ROOT / 'reports' / 'barcelona-anterior-20261013'
    for path in (zone, staged_zone, backup):
        assert path.resolve().is_relative_to(ROOT.resolve()), 'Target outside project'
    assert not backup.exists(), 'Previous backup already exists; preserve it'
    manifest = json.loads((staged_zone / 'zona.json').read_text(encoding='utf8'))
    previous = json.loads((zone / 'zona.json').read_text(encoding='utf8'))
    source = Path(manifest['source']['path'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['source']['sha256']
    assert source.stat().st_size == manifest['source']['bytes']
    expected = {o['id'] for o in manifest['objects']}
    assert len(expected) == len(manifest['objects'])
    actual = set()
    for sector in manifest['sectors']:
        file = staged_zone / sector['url']
        with file.open('rb') as stream:
            magic, version, size, length, kind = struct.unpack('<IIIII', stream.read(20))
            assert (magic, version, kind) == (0x46546c67, 2, 0x4e4f534a)
            assert size == file.stat().st_size == sector['bytes']
            doc = json.loads(stream.read(length))
        for node in doc['nodes']:
            identity = node['extras']['ssId']
            assert identity in expected and identity not in actual
            actual.add(identity)
    assert expected == actual, 'Incomplete export coverage'
    backup.mkdir()
    (backup / 'reports').mkdir()
    for name in ('zona.json', 'zona.raw.json'):
        if (zone / name).exists():
            shutil.copy2(zone / name, backup / name)
    old_reports = list((STAGE / 'reports').glob('*.json'))
    for file in old_reports:
        current = ROOT / 'reports' / file.name
        if current.exists():
            shutil.copy2(current, backup / 'reports' / file.name)
    (zone / 'assets').rename(backup / 'assets')
    try:
        (staged_zone / 'assets').rename(zone / 'assets')
        for name in ('zona.raw.json', 'zona.json'):
            shutil.copy2(staged_zone / name, zone / name)
        def live_paths(value):
            if isinstance(value, str):
                return value.replace(str(STAGE), str(ROOT))
            if isinstance(value, list):
                return [live_paths(item) for item in value]
            if isinstance(value, dict):
                return {key: live_paths(item) for key, item in value.items()}
            return value
        for file in old_reports:
            data = live_paths(json.loads(file.read_text(encoding='utf8')))
            (ROOT / 'reports' / file.name).write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
    except Exception:
        if (zone / 'assets').exists():
            (zone / 'assets').rename(staged_zone / 'assets')
        (backup / 'assets').rename(zone / 'assets')
        for name in ('zona.json', 'zona.raw.json'):
            if (backup / name).exists():
                shutil.copy2(backup / name, zone / name)
        for file in (backup / 'reports').glob('*.json'):
            shutil.copy2(file, ROOT / 'reports' / file.name)
        raise
    report = {'source': manifest['source'], 'previousSource': previous['source'],
              'previousObjects': len(previous['objects']), 'objects': len(expected),
              'sectors': len(manifest['sectors']), 'nodeCoverageVerified': True,
              'sourceUnchanged': True, 'backup': str(backup),
              'totalBytes': manifest['optimization']['totalBytes']}
    (ROOT / 'reports' / 'barcelona-replacement.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(report, ensure_ascii=False), flush=True)


if '--publish' in sys.argv:
    publish()
elif '--surfaces' in sys.argv:
    if 'bpy' in sys.modules:
        run('export_surface_extract.py')
    else:
        run('export_surface_fix.py')
        import subprocess
        subprocess.run(['node', str(ROOT / 'scripts' / 'export_compress.mjs')], check=True)
        run('export_collision_fix.py')
elif 'bpy' in sys.modules:
    run('export_city.py')
    run('export_texture_audit.py')
    export_optimize.main()
    run('export_surface_extract.py')
else:
    run('export_surface_fix.py')
    import subprocess
    subprocess.run(['node', str(ROOT / 'scripts' / 'export_compress.mjs')],
                   env={**os.environ, 'SPANSTORIES_EXPORT_PROJECT': str(STAGE)}, check=True)
    run('export_collision_fix.py')
