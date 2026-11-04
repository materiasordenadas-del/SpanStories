# Empaqueta la extensión en dist/expresiones_corporales-<versión>.zip (versión = blender_manifest.toml) y borra los
# zips viejos. Con --validar lo comprueba con el validador de extensiones de Blender 5.2 (no instala nada).
#   python empaquetar.py              (empaqueta)
#   python empaquetar.py --validar    (empaqueta y valida con "blender -c extension validate")
#   python empaquetar.py --comprobar  (solo dice la versión y si el zip existe)
import os, re, sys, glob, zipfile, subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(BASE, 'expresiones_corporales')
DIST = os.path.join(BASE, 'dist')
BLENDER = r'D:\Blender 5.2\blender.exe'
EXCLUIR_DIR = {'__pycache__', '_pruebas'}
PLUGIN = os.path.join(os.path.expanduser('~'), '.claude', 'plugins-local', 'spanstories-market', 'expresion-corporal')
PLUGIN_JSON = os.path.join(PLUGIN, '.claude-plugin', 'plugin.json')
SKILL = os.path.join(PLUGIN, 'skills', 'expresion-corporal', 'SKILL.md')
ASSETS = os.path.join(PLUGIN, 'assets')


def al_plugin(zip_):
    """Copia el zip a assets/ del plugin de Claude Code (borra los viejos) y pone la misma versión en
    plugin.json y en la linea «Versión del skill» del SKILL.md."""
    import json, shutil
    v = version()
    os.makedirs(ASSETS, exist_ok=True)
    for z in glob.glob(os.path.join(ASSETS, 'expresiones_corporales_*.zip')):
        os.remove(z)
    shutil.copy2(zip_, os.path.join(ASSETS, f'expresiones_corporales_{v}.zip'))
    with open(PLUGIN_JSON, encoding='utf-8') as f:
        d = json.load(f)
    d['version'] = v
    with open(PLUGIN_JSON, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
    with open(SKILL, encoding='utf-8') as f:
        s = f.read()
    s = re.sub(r'(Versión del skill: \*\*)[0-9.]+(\*\*)', lambda m: m.group(1) + v + m.group(2), s)
    s = re.sub(r'expresiones_corporales_[0-9.]+\.zip', f'expresiones_corporales_{v}.zip', s)
    with open(SKILL, 'w', encoding='utf-8') as f:
        f.write(s)
    return v


def version():
    with open(os.path.join(FUENTE, 'blender_manifest.toml'), encoding='utf-8') as f:
        return re.search(r'^version\s*=\s*"([^"]+)"', f.read(), re.M).group(1)


def ruta_zip(v=None):
    return os.path.join(DIST, f'expresiones_corporales-{v or version()}.zip')


def empaquetar():
    v = version()
    os.makedirs(DIST, exist_ok=True)
    for z in glob.glob(os.path.join(DIST, 'expresiones_corporales-*.zip')):
        os.remove(z)
    destino = ruta_zip(v)
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as z:
        for raiz, dirs, files in os.walk(FUENTE):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUIR_DIR)
            for f in sorted(files):
                if f.endswith('.pyc'):
                    continue
                ruta = os.path.join(raiz, f)
                z.write(ruta, os.path.relpath(ruta, FUENTE).replace(os.sep, '/'))
    return destino


def validar(zip_):
    if not os.path.isfile(BLENDER):
        return None, 'no encuentro Blender'
    r = subprocess.run([BLENDER, '--factory-startup', '-c', 'extension', 'validate', zip_],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode == 0, (r.stdout + r.stderr).strip()


if __name__ == '__main__':
    if '--comprobar' in sys.argv:
        z = ruta_zip()
        print('versión', version(), '| zip', z, 'existe' if os.path.isfile(z) else 'NO existe')
        sys.exit(0 if os.path.isfile(z) else 1)
    z = empaquetar()
    print('zip:', z, f'({os.path.getsize(z) / 1024:.0f} KB)')
    if os.path.isdir(PLUGIN):
        print('plugin de Claude Code al dia:', al_plugin(z))
    if '--validar' in sys.argv:
        ok, txt = validar(z)
        print('validación:', 'BIEN' if ok else 'MAL', '\n' + txt)
        sys.exit(0 if ok else 1)
