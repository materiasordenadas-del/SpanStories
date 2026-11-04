"""Importación local: copia verificable, nunca borra originales ni elige personajes definitivos."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
from urllib.parse import unquote, urlsplit

REPO = Path(__file__).resolve().parents[2]
PLACES = {
    'airport': ('Aeropuerto_v2', 'Aeropuerto', 'Aeropuerto'),
    'bank': ('Banco', 'Banco', 'Banco'),
    'cafe': ('Cafeteria', 'Cafeteria', 'Cafetería'),
    'shop': ('Comercio', 'Comercio', 'Comercio'),
    'pharmacy': ('Farmacia', 'Farmacia', 'Farmacia'),
    'bus-stop': ('Parada', 'Parada', 'Parada'),
    'restaurant': ('Restaurante', 'Restaurante', 'Restaurante'),
}
GROUPS = {
    'directora': ['directora'], 'gomez': ['Gomez', 'Animación 3D/personajes/gomez'],
    'jose': ['José'], 'kakashi': ['Kakashi'],
    'iam': ['Link', 'Animación 3D'], 'meseros': ['meseros'],
    'samuel': ['Samu para Meshy', 'Animación 3D/personajes/samuel', 'Animación 3D2'],
    'boy-unidentified': ['animación 3D3'],
}


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def copy_checked(source, target):
    if source.is_symlink():
        raise ValueError(f'No se importa un enlace simbólico: {source}')
    target.parent.mkdir(parents=True, exist_ok=True)
    expected = digest(source)
    if target.exists():
        if digest(target) != expected:
            raise ValueError(f'El destino ya contiene otro archivo: {target}')
    else:
        shutil.copy2(source, target)
    if digest(target) != expected:
        raise ValueError(f'Copia incompleta: {target}')
    return expected


def read_glb(path):
    with path.open('rb') as f:
        magic, version, size = struct.unpack('<4sII', f.read(12))
        length, kind = struct.unpack('<II', f.read(8))
        if magic != b'glTF' or version != 2 or size != path.stat().st_size or kind != 0x4e4f534a:
            raise ValueError(f'GLB inválido: {path}')
        return json.loads(f.read(length))


def main(source):
    report = {'sourceRoot': str(source), 'places': [], 'characterSources': []}
    places = []
    for place_id, (folder, prefix, label) in PLACES.items():
        src = source / folder
        dst = REPO / 'worlds/prototypes' / place_id
        files = []
        for path in sorted(src.rglob('*')):
            if path.is_file():
                relative = path.relative_to(src)
                sha = copy_checked(path, dst / relative)
                files.append({'path': relative.as_posix(), 'sha256': sha, 'bytes': path.stat().st_size})
        report['places'].append({'id': place_id, 'source': str(src), 'destination': dst.relative_to(REPO).as_posix(), 'files': files})
        places.append({'id': place_id, 'name': label, 'version': 'import-1', 'kind': 'service',
                       'entry': f'worlds/prototypes/{place_id}/index.html', 'previewUrl': f'/{prefix}/',
                       'adaptationStatus': 'pending', 'capabilities': []})

    assets = {}
    characters = []
    for group, folders in GROUPS.items():
        versions = []
        sources = []
        for folder in folders:
            directory = source / folder
            # Root Animación 3D and Animación 3D2 contain unrelated applications: inspect only root GLBs.
            paths = directory.glob('*') if folder in ['Animación 3D', 'Animación 3D2'] else directory.rglob('*')
            for path in sorted(paths):
                if not path.is_file() or path.suffix.lower() not in ['.glb', '.blend', '.png', '.zip']:
                    continue
                rel = path.relative_to(source).as_posix()
                sources.append(rel)
                if path.suffix.lower() != '.glb' or any(t in rel.lower() for t in ['backup', 'respaldo', '/fuente/', 'retopologia_trabajo', '.orig.']):
                    continue
                data = read_glb(path)
                dependencies = []
                for item in data.get('images', []) + data.get('buffers', []):
                    uri = item.get('uri', '')
                    if not uri or uri.startswith('data:'):
                        continue
                    parsed = urlsplit(uri)
                    dependency = Path(unquote(parsed.path))
                    if parsed.scheme or parsed.netloc or dependency.is_absolute() or '..' in dependency.parts:
                        raise ValueError(f'Dependencia externa no portable: {path}: {uri}')
                    dependencies.append((dependency, path.parent / dependency))
                sha = digest(path)
                fingerprint = sha if not dependencies else hashlib.sha256((sha + ''.join(str(r) + digest(p) for r, p in dependencies)).encode()).hexdigest()
                target = REPO / f'worlds/characters/assets/{fingerprint}/model.glb'
                copy_checked(path, target)
                external_files = []
                for relative, external in dependencies:
                    dep_sha = copy_checked(external, target.parent / relative)
                    external_files.append({'path': (target.parent / relative).relative_to(REPO).as_posix(), 'sha256': dep_sha})
                asset_id = f'sha256:{fingerprint}'
                if asset_id not in assets:
                    assets[asset_id] = {'id': asset_id, 'sha256': sha, 'path': target.relative_to(REPO).as_posix(),
                                       'url': f'/characters/assets/{fingerprint}/model.glb', 'bytes': path.stat().st_size,
                                       'kind': 'glb', 'skins': len(data.get('skins', [])),
                                       'animations': [a.get('name', f'clip-{i}') for i, a in enumerate(data.get('animations', []))],
                                       'dependencies': external_files, 'sources': []}
                assets[asset_id]['sources'].append(rel)
                if not any(v['assetId'] == asset_id for v in versions):
                    versions.append({'id': f'candidate-{fingerprint[:16]}', 'assetId': asset_id, 'status': 'candidate', 'label': path.stem, 'textureIds': []})
                report['characterSources'].append({'source': str(path), 'assetId': asset_id, 'sha256': sha})
        characters.append({'id': group, 'name': group, 'status': 'selection-pending', 'defaultVersion': None, 'versions': versions,
                           'artSources': sources, 'note': 'Agrupación provisional; no implica identidad ni versión definitiva aprobada.'})

    # Texture edited by the existing Samuel viewer: preserve separately, without inventing material bindings.
    texture = source / 'Animación 3D/personajes/samuel/Samuel_textura_pintada.png'
    if texture.exists():
        sha = digest(texture)
        target = REPO / f'worlds/characters/assets/{sha}/texture.png'
        copy_checked(texture, target)
        assets[f'sha256:{sha}'] = {'id': f'sha256:{sha}', 'sha256': sha, 'path': target.relative_to(REPO).as_posix(),
                                 'url': f'/characters/assets/{sha}/texture.png', 'bytes': texture.stat().st_size,
                                 'kind': 'texture', 'skins': 0, 'animations': [], 'dependencies': [],
                                 'sources': [texture.relative_to(source).as_posix()]}
        for character in characters:
            if character['id'] == 'samuel':
                for version in character['versions']:
                    if version['label'] == 'Samuel_con_rostro_manos':
                        version['textureIds'] = [f'sha256:{sha}']

    save(REPO / 'content/worlds/library.json', {'schemaVersion': 1, 'places': places, 'assets': list(assets.values()), 'characters': characters})
    for country_id, name, locale, currency in [('ar', 'Argentina', 'es-AR', 'ARS'), ('co', 'Colombia', 'es-CO', 'COP'), ('es', 'España', 'es-ES', 'EUR')]:
        save(REPO / f'content/worlds/countries/{country_id}/country.json', {
            'id': country_id, 'name': name, 'locale': locale, 'currency': currency,
            'city': {'status': 'pending', 'mapAssetId': None, 'touristPlaceTarget': 5},
            'places': [{'id': f'{country_id}-{p[0]}', 'baseId': p[0], 'baseVersion': 'import-1', 'kind': 'service',
                        'status': 'adaptation-pending', 'config': {}, 'assetIds': []} for p in PLACES.items()],
            'attractions': [], 'characterIds': [c['id'] for c in characters], 'appearances': [],
        })
    save(REPO / 'worlds/migration.json', report)
    total = sum(a['bytes'] for a in assets.values())
    print(json.dumps({'places': len(places), 'characterGroups': len(characters), 'uniqueAssets': len(assets), 'sharedAssetMB': round(total / 1048576, 1)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    if (REPO / 'content/worlds/library.json').exists():
        parser.error('El catálogo ya existe: no sobrescribir una importación o configuración editada.')
    main(args.source.resolve())
