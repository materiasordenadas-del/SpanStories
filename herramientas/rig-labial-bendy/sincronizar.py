# Compatibilidad histórica: DESTINOS está vacío; sincronizar() no copia ni borra archivos.
# Puede recargar el add-on si se solicita. Para verificar la instalación común, usar pool.py.
# Uso dentro de Blender:
#   exec(open(r"D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\sincronizar.py", encoding="utf-8").read()); sincronizar()
# Fuera de Blender: python sincronizar.py [--comprobar]   (--comprobar = simulación, no toca nada)
import os, shutil, filecmp, sys

BASE = r'D:\Español\imagen para animación\Animación 3D\rig_labial_bendy'
MAIN = BASE + r'\rig_labial_bendy'
# POOL ÚNICO (2026-10-29): la fuente real es codex\plugins\rig-labial-codex\assets\rig_labial_bendy. MAIN (esta carpeta) y el
# add-on de Blender son ENLACES (junction) a ese pool: ya no hay nada que copiar, DESTINOS queda vacío a propósito.
# NO volver a poner copias aquí: un espejo desde una copia vieja borraría el trabajo nuevo. Ver POOL_UNICO.md.
DESTINOS = []
MOD = 'bl_ext.user_default.rig_labial_bendy'
CONSERVAR = {'gestos_extra.json'}   # datos del usuario: ni se copian ni se borran


def _ignorar(nombre):
    return nombre == '__pycache__' or nombre.endswith('.pyc')


def _lista(raiz):
    """Rutas relativas (con /) de archivos y carpetas de raiz, sin caché de Python."""
    ficheros, carpetas = set(), set()
    for r, dirs, files in os.walk(raiz):
        dirs[:] = [d for d in dirs if not _ignorar(d)]
        rel = os.path.relpath(r, raiz).replace(os.sep, '/')
        for d in dirs:
            carpetas.add(d if rel == '.' else rel + '/' + d)
        for f in files:
            if not _ignorar(f):
                ficheros.add(f if rel == '.' else rel + '/' + f)
    return ficheros, carpetas


def _igual(a, b):
    return os.path.exists(b) and os.path.getsize(a) == os.path.getsize(b) and filecmp.cmp(a, b, shallow=False)


def _borrar(ruta):
    if os.path.isdir(ruta) and not os.path.islink(ruta):
        shutil.rmtree(ruta)
    else:
        os.remove(ruta)


def espejo(src, dst, simular=False, conservar=CONSERVAR, sello=('rig_labial_bendy', 'rig-labial')):
    """Deja dst idéntico a src. Devuelve {'copiados': [rel], 'borrados': [rel], 'malos': [rutas]}.
    Solo toca dentro de dst; compara por contenido; __pycache__/.pyc de dst se borran siempre."""
    s, d = os.path.abspath(src), os.path.abspath(dst)
    if os.path.realpath(s) == os.path.realpath(d):
        raise ValueError(f'origen y destino son la misma carpeta (pool único): {d}')
    # Cinturón de seguridad: el destino debe ser una carpeta del add-on/plugin y no solaparse con la fuente.
    if not any(t in os.path.basename(d) or t in d for t in sello) or s == d \
            or d.startswith(s + os.sep) or s.startswith(d + os.sep):
        raise ValueError(f'destino no seguro: {d}')
    res = {'copiados': [], 'borrados': [], 'malos': []}
    fs, cs = _lista(s)
    fs = {f for f in fs if f.rsplit('/', 1)[-1] not in conservar}
    # 1) Borrar lo que sobra en destino (incluida la caché de Python).
    if os.path.isdir(d):
        for r, dirs, files in os.walk(d, topdown=True):
            rel = os.path.relpath(r, d).replace(os.sep, '/')
            rel = '' if rel == '.' else rel + '/'
            for nombre in list(dirs):
                p = rel + nombre
                if _ignorar(nombre) or p not in cs:
                    res['borrados'].append(p + '/')
                    dirs.remove(nombre)
                    if not simular:
                        _borrar(os.path.join(r, nombre))
            for f in files:
                p = rel + f
                if f in conservar:
                    continue
                if _ignorar(f) or p not in fs:
                    res['borrados'].append(p)
                    if not simular:
                        _borrar(os.path.join(r, f))
    # 2) Copiar lo nuevo o distinto.
    for f in sorted(fs):
        a, b = os.path.join(s, f), os.path.join(d, f)
        if _igual(a, b):
            continue
        res['copiados'].append(f)
        if simular:
            continue
        os.makedirs(os.path.dirname(b), exist_ok=True)
        shutil.copy2(a, b)
        if not _igual(a, b):
            res['malos'].append(b)   # p. ej. disco C: lleno
    if not simular:
        for c in sorted(cs):          # carpetas vacías de la fuente también
            os.makedirs(os.path.join(d, c), exist_ok=True)
    return res


def sincronizar(recargar=True, simular=False):
    """Espeja la fuente en todos los destinos. Devuelve {'copiados': n, 'borrados': [...], 'malos': [...], 'detalle': {...}}."""
    n, borrados, malos, detalle = 0, [], [], {}
    for d in DESTINOS:
        r = espejo(MAIN, d, simular=simular)
        detalle[d] = r
        n += len(r['copiados'])
        borrados += [os.path.join(d, b) for b in r['borrados']]
        malos += r['malos']
    if recargar and not simular and not malos:
        import addon_utils
        addon_utils.disable(MOD, default_set=False)
        for k in [k for k in sys.modules if k.startswith(MOD)]:
            del sys.modules[k]
        addon_utils.enable(MOD, default_set=False)
    return {'copiados': n, 'borrados': borrados, 'malos': malos, 'detalle': detalle}


if __name__ == '__main__':
    sim = '--comprobar' in sys.argv
    r = sincronizar(recargar=False, simular=sim)
    for d, x in r['detalle'].items():
        print(('[simulación] ' if sim else '') + d)
        print('  copiaría/copiados:', len(x['copiados']), x['copiados'][:40])
        print('  borraría/borrados:', len(x['borrados']))
        for b in x['borrados']:
            print('    -', b)
    print('malos:', r['malos'])
