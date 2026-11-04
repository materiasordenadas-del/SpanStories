"""Fuente única. Instalación conjunta: python pool.py --instalar [--version X.Y.Z]."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

BASE = Path(__file__).resolve().parent
POOL = BASE / 'codex/plugins/rig-labial-codex'
ADDON = POOL / 'assets/rig_labial_bendy'
HOME = Path.home()
CLAUDE_CACHE = HOME / '.claude/plugins/cache/spanstories-local/rig-labial'
CODEX_CACHE = HOME / '.codex/plugins/cache/rig-labial-codex-local/rig-labial-codex'
BLENDER = Path(os.environ.get('APPDATA', HOME / 'AppData/Roaming')) / 'Blender Foundation/Blender/5.2/extensions/user_default/rig_labial_bendy'
MANIFIESTOS = [ADDON / 'blender_manifest.toml', POOL / '.claude-plugin/plugin.json',
               POOL / '.codex-plugin/plugin.json', POOL / 'plugin.json',
               POOL / 'skills/rig-labial-bendy/SKILL.md']

def leer_version(path):
    text = path.read_text(encoding='utf-8')
    if path.suffix == '.json':
        return json.loads(text)['version']
    pattern = r'^version\s*=\s*"([0-9.]+)"' if path.suffix == '.toml' else r'Versión del skill: \*\*([0-9.]+)\*\*'
    match = re.search(pattern, text, re.M)
    if not match:
        raise ValueError(f'Falta versión en {path}')
    return match.group(1)

def poner_version(version):
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('Versión inválida: se requiere X.Y.Z')
    originals = {p: p.read_text(encoding='utf-8') for p in MANIFIESTOS}
    updated = {}
    for path, text in originals.items():
        old = leer_version(path)
        if path.suffix == '.json':
            data = json.loads(text); data['version'] = version
            updated[path] = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        elif path.suffix == '.toml':
            updated[path] = re.sub(r'^(version\s*=\s*")' + re.escape(old) + '"', lambda m: m[1] + version + '"', text, count=1, flags=re.M)
        else:
            updated[path] = text.replace(f'Versión del skill: **{old}**', f'Versión del skill: **{version}**', 1)
    try:
        for path, text in updated.items():
            path.write_text(text, encoding='utf-8', newline='\n')
    except Exception:
        for path, text in originals.items():
            path.write_text(text, encoding='utf-8', newline='\n')
        raise

def _enlace_ok(dest, target):
    # Codex ignora una carpeta de versión que sea junction al enumerar instalaciones.
    # Contenedor real, contenido enlazado: siguen siendo los mismos archivos físicos.
    if dest.parent == CODEX_CACHE and dest.is_dir() and not dest.is_junction():
        expected = {p.name for p in target.iterdir() if p.is_dir()}
        return {p.name for p in dest.iterdir()} == expected and all(os.path.samefile(dest / name, target / name) for name in expected)
    return dest.exists() and os.path.samefile(dest, target)

def enlaces(sin_blender=False):
    version = leer_version(MANIFIESTOS[2])
    pairs = {BASE / 'rig_labial_bendy': ADDON,
             HOME / '.claude/plugins-local/spanstories-market/rig-labial': POOL,
             CLAUDE_CACHE / version: POOL, CODEX_CACHE / version: POOL}
    if not sin_blender:
        pairs[BLENDER] = ADDON
    return pairs

def huella(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}

def apartar(path, target):
    # Solo hijos inmediatos de cachés conocidas; nunca mueve el pool ni sus padres.
    if path.parent not in (CLAUDE_CACHE, CODEX_CACHE):
        raise ValueError(f'No es una entrada de caché autorizada: {path}')
    if path.parent == CODEX_CACHE and not path.is_junction() and _enlace_ok(path, target):
        # Contenedor nativo cuyo contenido son solo junction comprobados.
        for child in path.iterdir():
            if not child.is_junction():
                raise ValueError(f'Contenido inesperado: {child}')
        for child in path.iterdir():
            child.rmdir()
        path.rmdir()
        return
    if path.is_junction() or path.is_symlink():
        if not _enlace_ok(path, target):
            raise ValueError(f'Enlace ajeno; no se retira: {path}')
        path.rmdir()  # no recursivo: retira únicamente el enlace
    else:
        if huella(path) != huella(target):
            raise ValueError(f'Copia con diferencias: se conserva para revisión, sin sobrescribir: {path}')
        # Renombrar en el mismo volumen: C: -> D: no es una operación atómica.
        archive = path.parent.parent.parent / '_respaldo_pool_instalacion' / str(time.time_ns())
        archive.mkdir(parents=True)
        path.rename(archive / (path.parent.parent.name + '-' + path.name))

def reparar(sin_blender=False):
    for dest, target in enlaces(sin_blender).items():
        if dest.parent == CODEX_CACHE:
            if dest.is_junction():
                if not os.path.samefile(dest, target):
                    raise ValueError(f'Enlace ajeno: {dest}')
                dest.rmdir()
            elif dest.exists() and not _enlace_ok(dest, target):
                partial_links = all(p.is_junction() and (target / p.name).is_dir() and os.path.samefile(p, target / p.name) for p in dest.iterdir())
                if not partial_links:
                    apartar(dest, target)
            dest.mkdir(exist_ok=True)
            for entry in target.iterdir():
                # Codex carga .codex-plugin/plugin.json; plugin.json raíz es compatibilidad.
                if not entry.is_dir():
                    continue
                alias = dest / entry.name
                if alias.exists() and os.path.samefile(alias, entry):
                    continue
                command = ['cmd', '/c', 'mklink']
                if entry.is_dir():
                    command.append('/J')
                subprocess.run(command + [str(alias), str(entry)], check=True, capture_output=True)
            continue
        if _enlace_ok(dest, target):
            continue
        if os.path.lexists(dest):
            apartar(dest, target)
        dest.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(dest), str(target)], check=True, capture_output=True)
    current = leer_version(MANIFIESTOS[2])
    for cache in (CLAUDE_CACHE, CODEX_CACHE):
        for old in cache.iterdir():
            if old.name != current:
                apartar(old, POOL)

def cli(name):
    if name == 'codex':
        bundled = HOME / '.codex/plugins/.plugin-appserver/codex.exe'
        if bundled.is_file():
            return str(bundled)
    found = shutil.which(name)
    if not found:
        raise RuntimeError(f'No se encuentra {name}')
    return found

def ejecutar(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'{args[0]}: {result.stderr or result.stdout}')
    return result.stdout

def registros():
    codex = json.loads(ejecutar([cli('codex'), 'plugin', 'list', '--marketplace', 'rig-labial-codex-local', '--available', '--json']))
    claude = json.loads(ejecutar([cli('claude'), 'plugin', 'list', '--json']))
    return codex, claude

def comprobar(sin_blender=False):
    versions = [leer_version(p) for p in MANIFIESTOS]
    if len(set(versions)) != 1:
        raise ValueError(f'Versiones distintas: {versions}')
    version = versions[0]
    for dest, target in enlaces(sin_blender).items():
        if not _enlace_ok(dest, target):
            raise ValueError(f'No apunta al pool: {dest}')
        print('OK enlace:', dest)
    for cache in (CLAUDE_CACHE, CODEX_CACHE):
        if {p.name for p in cache.iterdir()} != {version}:
            raise ValueError(f'Caché con versiones adicionales: {cache}')
    codex, claude = registros()
    cx = [x for x in codex['installed'] if x.get('pluginId') == 'rig-labial-codex@rig-labial-codex-local']
    cl = [x for x in claude if x.get('id') == 'rig-labial@spanstories-local']
    for name, records in [('Codex', cx), ('Claude', cl)]:
        if len(records) != 1 or records[0].get('version') != version or not records[0].get('enabled'):
            raise ValueError(f'{name} no instalado/habilitado en {version}: {records}')
        record = records[0]
        installed_path = record.get('installedPath') or record.get('installPath')
        if name == 'Codex':
            # list expone source, no installedPath; su caché se verificó arriba.
            if not os.path.samefile(Path(record['source']['path']), POOL):
                raise ValueError('Codex registra otra fuente')
            installed_path = str(CODEX_CACHE / version)
        if not installed_path or not _enlace_ok(Path(installed_path), POOL):
            raise ValueError(f'{name}: ruta registrada fuera del pool: {installed_path}')
        print(f'OK {name}: instalado y habilitado {version}')
    if sin_blender:
        print('PENDIENTE en este proceso: verificar Blender por MCP (ruta inaccesible en sandbox).')
    print('OK versión única:', version)
    return True

@contextlib.contextmanager
def bloqueo():
    path = BASE / '.pool-instalacion.lock'
    try:
        stream = path.open('x', encoding='utf-8')
    except FileExistsError:
        raise RuntimeError('Otra instalación está en curso. Comprueba su proceso; no borres el lock automáticamente.')
    try:
        with stream:
            stream.write(str(os.getpid())); stream.flush()
            yield
    finally:
        path.unlink()

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instalar', action='store_true', help='Instala y enlaza ambos agentes; comprueba el resultado')
    parser.add_argument('--reparar', action='store_true')
    parser.add_argument('--version', help='Requiere --instalar para actualizar también los registros')
    parser.add_argument('--sin-blender', action='store_true', help='Verificar Blender separadamente por MCP')
    args = parser.parse_args(argv)
    if args.version and not args.instalar:
        parser.error('--version requiere --instalar; no se permite dejar registros desactualizados')
    try:
        with bloqueo():
            if args.instalar:
                cli('codex'); cli('claude')
                # Antes de que los gestores puedan reemplazar una caché, protege cambios ajenos.
                for cache in (CLAUDE_CACHE, CODEX_CACHE):
                    if cache.exists():
                        for entry in cache.iterdir():
                            if not _enlace_ok(entry, POOL) and huella(entry) != huella(POOL):
                                raise ValueError(f'Caché divergente; no se instala sobre ella: {entry}')
                if args.version:
                    poner_version(args.version)
                cx, cl = registros()
                version = leer_version(MANIFIESTOS[2])
                if not any(x.get('version') == version and x.get('enabled') for x in cx['installed']):
                    ejecutar([cli('codex'), 'plugin', 'add', 'rig-labial-codex@rig-labial-codex-local', '--json'])
                if not any(x.get('id') == 'rig-labial@spanstories-local' and x.get('version') == version and x.get('enabled') for x in cl):
                    ejecutar([cli('claude'), 'plugin', 'update', 'rig-labial@spanstories-local', '--json'])
            if args.instalar or args.reparar:
                reparar(args.sin_blender)
            comprobar(args.sin_blender)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print('ERROR:', exc, file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
