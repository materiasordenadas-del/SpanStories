# Escribe las formas como shape keys en la cara y en las piezas de la boca (dientes, lengua, fondo).
# Las piezas reciben la misma forma con el mismo nombre (en three.js todas las mallas comparten pesos):
#   - dientes inferiores y lengua: giro rígido de la mandíbula (proporcional al peso de jawOpen que tenga
#     la forma en el mentón);
#   - fondo de la boca: interpolación de los desplazamientos del forro de la cara (la costura coincide);
#   - dientes superiores: quietos.
import bpy
import numpy as np
from mathutils import Matrix
from mathutils import kdtree


def _basis(me):
    co = np.zeros(len(me.vertices) * 3)
    (me.shape_keys.key_blocks[0].data if me.shape_keys else me.vertices).foreach_get('co', co)
    return co.reshape(-1, 3)


def poner_key(obj, nombre, delta_local, valor=0.0, rango=(0.0, 1.0)):
    """crea/actualiza la shape key `nombre` = Basis + delta (n, 3) en espacio local del objeto."""
    if obj.data.shape_keys is None:
        obj.shape_key_add(name='Basis', from_mix=False)
    kb = obj.data.shape_keys.key_blocks
    k = kb.get(nombre) or obj.shape_key_add(name=nombre, from_mix=False)
    base = _basis(obj.data)
    k.data.foreach_set('co', (base + delta_local).ravel())
    k.slider_min, k.slider_max = rango
    k.value = valor
    marcar(obj, nombre)
    return k


def marcar(obj, nombre):
    """las keys FACS se apuntan en obj['facs_keys'] (las KeyBlock no admiten propiedades)."""
    l = list(obj.get('facs_keys', []))
    if nombre not in l:
        l.append(nombre); obj['facs_keys'] = l


def es_facs(obj, nombre):
    return nombre in obj.get('facs_keys', [])


def a_local(obj, cara, D_cara):
    """desplazamientos en espacio local de la cara -> espacio local de obj (solo rotación/escala)."""
    M = obj.matrix_world.inverted().to_3x3() @ cara.matrix_world.to_3x3()
    return np.asarray(D_cara) @ np.array(M).T


def puntos_en_cara(obj, cara):
    M = cara.matrix_world.inverted() @ obj.matrix_world
    P = _basis(obj.data)
    R = np.array(M.to_3x3()); t = np.array(M.translation)
    return P @ R.T + t


class Piezas:
    def __init__(self, cara):
        b = cara.name
        self.cara = cara
        self.dsup = bpy.data.objects.get(f'{b}_Dientes_sup')
        self.dinf = bpy.data.objects.get(f'{b}_Dientes_inf')
        self.lengua = bpy.data.objects.get(f'{b}_Lengua')
        self.fondo = bpy.data.objects.get(f'{b}_Boca_Fondo')

    def todas(self):
        return [o for o in (self.dsup, self.dinf, self.lengua, self.fondo) if o is not None]


SOLO_CARA = ('eye', 'brow', 'cheekSquint', 'nose')


def escribir(cara, K, FO, nombre, D_zona, mandibula=0.0, lengua_extra=None, piezas=None, valor=0.0, solo_piezas=False):
    """D_zona: desplazamientos de la zona (local de la cara). mandibula: giro rígido (fracción de jawOpen)
    que reciben dientes inferiores y lengua. solo_piezas (0.8.44): la key de la cara ya existe (y puede estar retocada
    a mano): solo se rehacen las de las piezas a partir de ella."""
    D = np.zeros((len(K.P), 3)); D[K.zona] = D_zona
    if not solo_piezas:
        poner_key(cara, nombre, D, valor)
    piezas = piezas or Piezas(cara)
    if nombre.startswith(SOLO_CARA):
        return
    # dientes: banda lisa que NO copia la forma del labio (rechazado dos veces); la superior solo se alarga en
    # horizontal con la anchura de la boca y la inferior además gira con la mandíbula.
    from .interior import estirar_banda
    for o in piezas.todas():
        Pc = puntos_en_cara(o, cara)
        if o is piezas.dinf or o is piezas.lengua:
            Dc = FO.rotar_mandibula(Pc, mandibula) if mandibula else np.zeros_like(Pc)
            if o is piezas.dinf:
                Dc = Dc + estirar_banda(K, FO, D_zona, Pc)       # se alarga con la boca (opción del usuario)
            if o is piezas.lengua and lengua_extra is not None:
                Dc = Dc + lengua_extra(Pc)
        elif o is piezas.dsup:
            Dc = estirar_banda(K, FO, D_zona, Pc)
        elif o is piezas.fondo:
            if o.get('facs_bolsa'):
                from .interior import peso_mandibula_suelto
                from .grafo import rot_eje
                if mandibula:
                    th = np.radians(FO.P['jaw_grados']) * mandibula * peso_mandibula_suelto(K, Pc)
                    Dc = rot_eje(Pc, K.piv, K.X, th) - Pc
                else:
                    Dc = np.zeros_like(Pc)
                # la bolsa se ensancha con las comisuras igual que la banda de dientes (siempre la contiene)
                Dc = Dc + estirar_banda(K, FO, D_zona, Pc, delante=(1.4, 2.2))
            else:
                Dc = _idw(K.p, D_zona, Pc)
        else:
            Dc = np.zeros_like(Pc)
        poner_key(o, nombre, a_local(o, cara, Dc), valor)


def _idw(P, D, Q, k=6):
    kd = kdtree.KDTree(len(P))
    for i, p in enumerate(P):
        kd.insert(p, i)
    kd.balance()
    out = np.zeros((len(Q), 3))
    for j, q in enumerate(Q):
        r = kd.find_n(q, k)
        w = np.array([1.0 / (d * d + 1e-10) for _, _, d in r])
        idx = [i for _, i, _ in r]
        out[j] = (w[:, None] * D[idx]).sum(0) / w.sum()
    return out


LADOS = (('_L', 1), ('_R', -1))


def formas_boca(FO):
    """(nombre, función, fracción de giro de mandíbula para dientes inferiores/lengua/bolsa)."""
    out = [('jawOpen', lambda: FO.jawOpen(1.0), 1.0), ('mouthClose', FO.mouthClose, 0.0),
           ('mouthFunnel', FO.mouthFunnel, 0.0), ('mouthPucker', FO.mouthPucker, 0.0),
           ('mouthRollUpper', FO.mouthRollUpper, 0.0), ('mouthRollLower', FO.mouthRollLower, 0.0),
           ('mouthShrugUpper', FO.mouthShrugUpper, 0.0), ('mouthShrugLower', FO.mouthShrugLower, 0.0),
           ('mouthLeft', lambda: FO.mouthSide(1), 0.0), ('mouthRight', lambda: FO.mouthSide(-1), 0.0),
           ('cheekPuff', FO.cheekPuff, 0.0)]
    for base, fn in (('mouthSmile', FO.mouthSmile), ('mouthFrown', FO.mouthFrown), ('mouthStretch', FO.mouthStretch),
                     ('mouthDimple', FO.mouthDimple), ('mouthPress', FO.mouthPress),
                     ('mouthUpperUp', FO.mouthUpperUp), ('mouthLowerDown', FO.mouthLowerDown)):
        for suf, s in LADOS:
            out.append((base + suf, (lambda fn=fn, s=s: fn(s)), 0.0))
    return out


def crear(cara, K, FO, lista):
    piezas = Piezas(cara)
    hechas = []
    for nombre, fn, mand in lista:
        escribir(cara, K, FO, nombre, fn(), mandibula=mand, piezas=piezas)
        hechas.append(nombre)
    return hechas


def valores(cara, d):
    """pone valores en las keys de la cara y de las piezas (las que existan)."""
    for o in [cara] + Piezas(cara).todas():
        sk = o.data.shape_keys
        if not sk:
            continue
        for n, v in d.items():
            k = sk.key_blocks.get(n)
            if k is not None:
                k.value = v


def a_cero(cara, prefijos=None):
    for o in [cara] + Piezas(cara).todas():
        sk = o.data.shape_keys
        if not sk:
            continue
        for k in sk.key_blocks[1:]:
            if prefijos is None or k.name.startswith(tuple(prefijos)):
                if not (sk.animation_data and any(f.data_path == f'key_blocks["{k.name}"].value' for f in sk.animation_data.drivers)):
                    k.value = 0.0


# Correctivas: nombre -> (formas de las que depende, regla). Regla «producto»: peso = a·b (como el driver).
CORRECTIVAS = {
    'jawOpen_mouthFunnel': (('jawOpen', 'mouthFunnel'), 'producto'),
    'jawOpen_mouthPucker': (('jawOpen', 'mouthPucker'), 'producto'),
    'jawOpen_mouthSmile_L': (('jawOpen', 'mouthSmile_L'), 'producto'),
    'jawOpen_mouthSmile_R': (('jawOpen', 'mouthSmile_R'), 'producto'),
}


def formas_correctivas(FO):
    return [('jawOpen_mouthFunnel', FO.corr_jaw_funnel, 0.0), ('jawOpen_mouthPucker', FO.corr_jaw_pucker, 0.0),
            ('jawOpen_mouthSmile_L', lambda: FO.corr_jaw_smile(1), 0.0),
            ('jawOpen_mouthSmile_R', lambda: FO.corr_jaw_smile(-1), 0.0)]


def driver_producto(obj, nombre, de):
    """driver de la correctiva en obj: producto de los valores de las keys `de` (del mismo Key)."""
    sk = obj.data.shape_keys
    if sk is None or nombre not in sk.key_blocks:
        return None
    path = f'key_blocks["{nombre}"].value'
    if sk.animation_data:
        for f in list(sk.animation_data.drivers):
            if f.data_path == path:
                sk.animation_data.drivers.remove(f)
    fc = sk.key_blocks[nombre].driver_add('value')
    d = fc.driver; d.type = 'SCRIPTED'
    nom = []
    for i, n in enumerate(de):
        v = d.variables.new(); v.name = f'v{i}'; v.type = 'SINGLE_PROP'
        v.targets[0].id_type = 'KEY'; v.targets[0].id = sk
        v.targets[0].data_path = f'key_blocks["{n}"].value'
        nom.append(v.name)
    d.expression = '*'.join(nom)
    return fc


def drivers_correctivas(cara):
    for o in [cara] + Piezas(cara).todas():
        for nombre, (de, regla) in CORRECTIVAS.items():
            if regla == 'producto':
                driver_producto(o, nombre, de)
            elif regla == 'campana':
                driver_campana(o, nombre, de[0])


def driver_campana(obj, nombre, de):
    """intermedia: peso = 4·w·(1−w) del valor de la key `de` (máximo a mitad de recorrido)."""
    sk = obj.data.shape_keys
    if sk is None or nombre not in sk.key_blocks:
        return None
    path = f'key_blocks["{nombre}"].value'
    if sk.animation_data:
        for f in list(sk.animation_data.drivers):
            if f.data_path == path:
                sk.animation_data.drivers.remove(f)
    fc = sk.key_blocks[nombre].driver_add('value')
    d = fc.driver; d.type = 'SCRIPTED'
    v = d.variables.new(); v.name = 'w'; v.type = 'SINGLE_PROP'
    v.targets[0].id_type = 'KEY'; v.targets[0].id = sk
    v.targets[0].data_path = f'key_blocks["{de}"].value'
    d.expression = '4*w*(1-w)'
    return fc


CORRECTIVAS.update({
    'eyeBlink_mid_L': (('eyeBlink_L',), 'campana'),
    'eyeBlink_mid_R': (('eyeBlink_R',), 'campana'),
})
# 0.6.5: parpadeo + otra forma de párpado (sonreír con los ojos cerrados, enfado entornado…): las keys se suman y el
# superior se pasaba del inferior y se arrugaba. La correctiva lo deja cerrando en la línea más alta de las dos.
PARPADEO_CON = ('eyeSquint', 'eyeLookDown', 'lidAngry', 'lidSad', 'cheekSquint', 'mouthSmile')
CORRECTIVAS.update({f'eyeBlink_{x}_{l}': ((f'eyeBlink_{l}', f'{x}_{l}'), 'producto') for x in PARPADEO_CON for l in 'LR'})


def formas_ojos(O, A):
    out = []
    for l, o in O.items():
        out += [(f'eyeBlink_{l}', o.blink, 0.0), (f'eyeBlink_mid_{l}', o.blink_mid, 0.0),
                (f'eyeSquint_{l}', o.squint, 0.0), (f'eyeWide_{l}', o.wide, 0.0),
                (f'eyeLookDown_{l}', o.look_down, 0.0), (f'eyeLookUp_{l}', o.look_up, 0.0),
                (f'browInnerUp_{l}', (lambda l=l: A.browInnerUp(l)), 0.0),
                (f'browOuterUp_{l}', (lambda l=l: A.browOuterUp(l)), 0.0),
                (f'browDown_{l}', (lambda l=l: A.browDown(l)), 0.0),
                (f'cheekSquint_{l}', (lambda l=l: A.cheekSquint(l)), 0.0),
                (f'noseSneer_{l}', (lambda l=l: A.noseSneer(l)), 0.0)]
    return out


def drivers_espejo(cara, extra=()):
    """las piezas (dientes, lengua, bolsa, delineado) copian por driver el valor de cada key de la cara con el
    mismo nombre: en Blender solo se anima la cara."""
    ksrc = cara.data.shape_keys
    obs = Piezas(cara).todas() + [o for o in bpy.data.objects if o.get('facs_pieza') and o.parent == cara] + list(extra)
    n = 0
    for o in obs:
        sk = o.data.shape_keys
        if not sk:
            continue
        for k in sk.key_blocks[1:]:
            if k.name not in ksrc.key_blocks:
                continue
            path = f'key_blocks["{k.name}"].value'
            if sk.animation_data:
                for f in list(sk.animation_data.drivers):
                    if f.data_path == path:
                        sk.animation_data.drivers.remove(f)
            fc = k.driver_add('value'); d = fc.driver; d.type = 'AVERAGE'
            v = d.variables.new(); v.name = 'w'; v.type = 'SINGLE_PROP'
            v.targets[0].id_type = 'KEY'; v.targets[0].id = ksrc
            v.targets[0].data_path = path
            n += 1
    return n
