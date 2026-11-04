# Biblioteca (DISENO §7): JSON de serie (biblioteca/expresiones_corporales.json, de solo lectura) + biblioteca de
# usuario en la carpeta de datos de la extensión (bpy.utils.extension_path_user: sobrevive a reinstalar). Las
# expresiones son portables entre personajes: parámetros en el marco del cuerpo y retoques semánticos.
#
#   biblioteca.cargar() -> {'expresiones': {...}, 'vinculos': {...}, 'origen': {clave: 'serie'|'usuario'}}
#   biblioteca.guardar_usuario(rig, clave, nombre=None)
#   biblioteca.aplicar_a(rig_destino, clave, origen=None) -> Action
import bpy, os, json, copy
from . import util as U

ESQUEMA = 'spanstories.cuerpo.biblioteca/1'
RUTA_SERIE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'biblioteca',
                          'expresiones_corporales.json')
ARCHIVO_USUARIO = 'biblioteca_usuario.json'
CAMPOS = ('gesto', 'familia', 'estilo', 'titulo', 'nota', 'params', 'pico', 'vida', 'tiempos', 'gesto_repetido',
          'retoques', 'intensidad', 'grupos')


def ruta_usuario(crear=True):
    """carpeta de datos de la extensión; si se carga desde la fuente (pruebas) vale ECORP_USUARIO o la config."""
    env = os.environ.get('ECORP_USUARIO')
    if env:
        c = env
    else:
        try:
            c = bpy.utils.extension_path_user(U.PAQUETE, create=crear)
        except Exception:
            c = os.path.join(bpy.utils.user_resource('CONFIG'), 'expresiones_corporales')
    if crear:
        os.makedirs(c, exist_ok=True)
    return os.path.join(c, ARCHIVO_USUARIO)


def _leer(ruta):
    if not os.path.isfile(ruta):
        return {'esquema': ESQUEMA, 'expresiones': {}, 'vinculos': {}}
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def cargar_serie():
    return _leer(RUTA_SERIE)


def cargar_usuario():
    return _leer(ruta_usuario(crear=False))


def cargar():
    """serie + usuario (la de usuario gana si repite clave)."""
    s, u = cargar_serie(), cargar_usuario()
    ex = dict(s.get('expresiones', {}))
    origen = {k: 'serie' for k in ex}
    for k, v in u.get('expresiones', {}).items():
        ex[k] = v
        origen[k] = 'usuario'
    vin = {k: v for k, v in s.get('vinculos', {}).items() if k != 'nota'}
    vin.update({k: v for k, v in u.get('vinculos', {}).items() if k != 'nota'})
    return {'esquema': ESQUEMA, 'fps': s.get('fps', 24), 'expresiones': ex, 'vinculos': vin, 'origen': origen}


def copia_limpia(e):
    return {k: copy.deepcopy(v) for k, v in e.items() if k in CAMPOS or k in ('referencia',)}


def _escribir_usuario(d):
    ruta = ruta_usuario(crear=True)
    tmp = ruta + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)
    return ruta


def guardar_usuario(rig, clave, nombre=None):
    """guarda la expresión del rig (parámetros, pico, vida, tiempos y retoques) en la biblioteca de usuario."""
    from . import generador as GE
    clave, d = GE.datos_de(rig, clave)
    nombre = nombre or clave
    lib = cargar_usuario()
    e = copia_limpia(d)
    e.setdefault('estilo', U.estilo_de(nombre) or U.estilo_de(clave) or 'MF')
    e.setdefault('gesto', U.gesto_de(clave))
    e['origen'] = {'rig': rig.name, 'clave': clave}
    lib.setdefault('expresiones', {})[nombre] = e
    lib['esquema'] = ESQUEMA
    return {'ruta': _escribir_usuario(lib), 'nombre': nombre}


def borrar_usuario(nombre):
    lib = cargar_usuario()
    ok = lib.get('expresiones', {}).pop(nombre, None) is not None
    _escribir_usuario(lib)
    return {'borrada': ok}


def renombrar_usuario(nombre, nuevo):
    lib = cargar_usuario()
    ex = lib.get('expresiones', {})
    if nombre not in ex:
        raise RuntimeError(f'«{nombre}» no está en la biblioteca de usuario')
    ex[nuevo] = ex.pop(nombre)
    _escribir_usuario(lib)
    return {'nombre': nuevo}


def cargar_en(rig, clave, conservar_retoques=False):
    """copia una expresión de la biblioteca a los datos del rig (sustituye la del rig) y la regenera."""
    from . import generador as GE
    lib = cargar()['expresiones']
    if clave not in lib:
        raise RuntimeError(f'«{clave}» no está en la biblioteca')
    d = copia_limpia(lib[clave])
    viejo = U.leer_expr(rig, clave)
    if conservar_retoques and viejo and viejo.get('retoques'):
        d['retoques'] = viejo['retoques']
    U.escribir_expr(rig, clave, d)
    it = U.item_expr(rig, clave)
    it.bloqueada = False
    return GE.generar(rig, clave)


def aplicar_a(rig_destino, clave, origen=None, nombre=None):
    """lleva una expresión a otro personaje: desde otro rig ('origen') o desde la biblioteca. Los parámetros son
    del marco del cuerpo y los retoques semánticos, así que el perfil del destino la traduce sola."""
    from . import generador as GE, perfil as PF, retoques as RT
    if origen is not None:
        clave, d = GE.datos_de(origen, clave)
        d = copia_limpia(d)
    else:
        lib = cargar()['expresiones']
        if clave not in lib:
            raise RuntimeError(f'«{clave}» no está en la biblioteca')
        d = copia_limpia(lib[clave])
    p = PF.asegurar(rig_destino)
    d['retoques'] = RT.convertir(d.get('retoques'), p)
    nombre = nombre or clave
    U.escribir_expr(rig_destino, nombre, d)
    return GE.generar(rig_destino, nombre)


def duplicar(rig, clave, nueva):
    from . import generador as GE
    clave, d = GE.datos_de(rig, clave)
    if U.item_expr(rig, nueva) is not None:
        raise RuntimeError(f'Ya existe «{nueva}»')
    U.escribir_expr(rig, nueva, copy.deepcopy(d))
    return GE.generar(rig, nueva)


def renombrar(rig, clave, nueva):
    """renombra la expresión en el rig y su acción (las tiras NLA siguen apuntando a la misma acción)."""
    it = U.item_expr(rig, clave)
    if it is None:
        raise RuntimeError(f'«{clave}» no está en el rig')
    if U.item_expr(rig, nueva) is not None:
        raise RuntimeError(f'Ya existe «{nueva}»')
    a = U.accion(rig, clave)
    it.name = nueva
    if a is not None:
        a.name = U.nombre_accion(rig, nueva)
        a['ecorp_clave'] = nueva
        it.accion = a.name
    return {'clave': nueva, 'accion': a.name if a else None}


def borrar(rig, clave, accion=True):
    pg = U.props(rig)
    i = pg.expresiones.find(clave)
    if i < 0:
        return {'borrada': False}
    pg.expresiones.remove(i)
    a = U.accion(rig, clave)
    if accion and a is not None:
        bpy.data.actions.remove(a)
    return {'borrada': True}


def exportar_json(rig, ruta, claves=None):
    """las expresiones del rig (o las indicadas) en un JSON con el mismo esquema que la biblioteca."""
    pg = U.props(rig)
    claves = claves or [it.name for it in pg.expresiones]
    ex = {}
    for c in claves:
        d = U.leer_expr(rig, c)
        if d is not None:
            ex[c] = copia_limpia(d)
    d = {'esquema': ESQUEMA, 'fps': 24, 'origen': rig.name, 'expresiones': ex, 'vinculos': {}}
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    return {'ruta': ruta, 'n': len(ex)}


def importar_json(ruta, rig=None, generar=True):
    """con rig: mete las expresiones en el rig (y las genera); sin rig: en la biblioteca de usuario."""
    with open(ruta, encoding='utf-8') as f:
        d = json.load(f)
    ex = d.get('expresiones', {})
    if rig is None:
        lib = cargar_usuario()
        lib.setdefault('expresiones', {}).update({k: copia_limpia(v) for k, v in ex.items()})
        lib.setdefault('vinculos', {}).update({k: v for k, v in d.get('vinculos', {}).items() if k != 'nota'})
        return {'ruta': _escribir_usuario(lib), 'n': len(ex)}
    from . import generador as GE
    for k, v in ex.items():
        U.escribir_expr(rig, k, copia_limpia(v))
        if generar:
            GE.generar(rig, k)
    return {'n': len(ex), 'claves': list(ex)}


def familias():
    out = {}
    for k, e in cargar()['expresiones'].items():
        out.setdefault(e.get('familia', 'otras'), []).append(k)
    return out
