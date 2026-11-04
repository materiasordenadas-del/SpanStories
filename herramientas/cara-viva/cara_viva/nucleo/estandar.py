"""Estándar del rig facial «Cara Viva»: huesos, canales, expresiones y visemas.

Convenciones (todas portables entre personajes):
* El personaje mira hacia -Y, arriba es +Z y su izquierda es +X.
* Todos los huesos de control apuntan hacia +Z (salvo la mandíbula). Así el
  eje local X del hueso es el X del mundo, el Y local es «arriba» y el Z local
  es «hacia delante». Un mismo desplazamiento sirve en cualquier personaje.
* Los desplazamientos se guardan en fracciones de IOD (distancia entre los
  centros de los ojos) y los giros en grados. Un canal vale lo mismo en un
  rostro realista que en uno de dibujos.
* Nombres de canales como ARKit (mouthSmileLeft...), para poder llevarlos tal
  cual a morph targets en three.js.
"""
import math

# ------------------------------------------------------------ puntos de referencia

PUNTOS = [
    # (nombre, descripción, obligatorio, tiene lado)
    ("OJO", "Centro del globo ocular", True, True),
    ("COMISURA", "Comisura de la boca", True, True),
    ("LABIO_SUP", "Centro del borde del labio superior", True, False),
    ("LABIO_INF", "Centro del borde del labio inferior", True, False),
    ("MENTON", "Punto más bajo y adelantado de la barbilla", True, False),
    ("NARIZ", "Punta de la nariz", True, False),
    ("CEJA_INT", "Extremo interior de la ceja", True, True),
    ("CEJA_EXT", "Extremo exterior de la ceja", True, True),
    ("MANDIBULA", "Articulación de la mandíbula (delante de la oreja)", False, True),
]


def nombres_puntos():
    """Lista plana de nombres con lado: OJO.L, OJO.R, LABIO_SUP..."""
    out = []
    for nombre, _d, _o, lado in PUNTOS:
        out.extend([nombre + ".L", nombre + ".R"] if lado else [nombre])
    return out


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def _mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def _lerp(a, b, t): return _add(_mul(a, 1 - t), _mul(b, t))
def _dist(a, b): return math.sqrt(sum(x * x for x in _sub(a, b)))


def completar(lm):
    """Espeja los puntos con lado que falten y calcula IOD, línea media y mandíbula.

    ``lm``: {nombre: (x, y, z)}. Devuelve un diccionario nuevo con además
    ``_iod`` y ``_x0``. Lanza ValueError si falta algo imprescindible.
    """
    lm = dict(lm)
    centrales = [lm[n] for n in ("LABIO_SUP", "LABIO_INF", "MENTON", "NARIZ") if n in lm]
    if "OJO.L" in lm and "OJO.R" in lm:
        x0 = 0.5 * (lm["OJO.L"][0] + lm["OJO.R"][0])
    elif centrales:
        x0 = sum(p[0] for p in centrales) / len(centrales)
    else:
        raise ValueError("faltan puntos para hallar la línea media")
    for nombre, _d, _o, lado in PUNTOS:
        if not lado:
            continue
        izq, der = nombre + ".L", nombre + ".R"
        if izq in lm and der not in lm:
            p = lm[izq]; lm[der] = (2 * x0 - p[0], p[1], p[2])
        elif der in lm and izq not in lm:
            p = lm[der]; lm[izq] = (2 * x0 - p[0], p[1], p[2])
    faltan = [n for n, _d, obl, lado in PUNTOS if obl
              and not all(k in lm for k in ([n + ".L", n + ".R"] if lado else [n]))]
    if faltan:
        raise ValueError("faltan puntos obligatorios: " + ", ".join(faltan))
    iod = _dist(lm["OJO.L"], lm["OJO.R"])
    if iod < 1e-6:
        raise ValueError("los dos ojos coinciden")
    if "MANDIBULA.L" not in lm:
        # estimación para un rostro típico: tras los ojos y a media altura entre ojo y boca
        ojo = _lerp(lm["OJO.L"], lm["OJO.R"], 0.5)
        boca_z = 0.5 * (lm["LABIO_SUP"][2] + lm["LABIO_INF"][2])
        z = ojo[2] - 0.55 * (ojo[2] - boca_z)
        lm["MANDIBULA.L"] = (x0 + 0.85 * iod, ojo[1] + 1.6 * iod, z)
        lm["MANDIBULA.R"] = (x0 - 0.85 * iod, ojo[1] + 1.6 * iod, z)
        lm["_mandibula_estimada"] = True
    lm["_iod"] = iod
    lm["_x0"] = x0
    return lm


# ------------------------------------------------------------------- huesos

def colocar(lm):
    """-> {hueso: {"head", "tail", "parent", "deform"}} en las coordenadas de ``lm``.

    ``lm`` debe haber pasado por ``completar``.
    """
    u, x0 = lm["_iod"], lm["_x0"]
    ls, li = lm["LABIO_SUP"], lm["LABIO_INF"]
    arriba = (0.0, 0.0, 1.0)
    h = {}

    def hueso(nombre, cabeza, padre, largo=0.18, cola=None):
        h[nombre] = {"head": cabeza, "parent": padre,
                     "tail": cola if cola is not None else _add(cabeza, _mul(arriba, largo * u))}

    ojo_c = _lerp(lm["OJO.L"], lm["OJO.R"], 0.5)
    hueso("cv_cabeza", (x0, ojo_c[1] + 1.0 * u, ojo_c[2]), None, 0.9)
    pivote = _lerp(lm["MANDIBULA.L"], lm["MANDIBULA.R"], 0.5)
    pivote = (x0, pivote[1], pivote[2])
    hueso("cv_mandibula", pivote, "cv_cabeza", cola=lm["MENTON"])

    hueso("cv_labio_sup", ls, "cv_cabeza", 0.12)
    hueso("cv_labio_inf", li, "cv_mandibula", 0.12)
    for lado in ("L", "R"):
        com = lm["COMISURA." + lado]
        hueso("cv_comisura." + lado, com, "cv_cabeza", 0.12)
        hueso("cv_labio_sup_med." + lado, _lerp(ls, com, 0.55), "cv_cabeza", 0.12)
        hueso("cv_labio_inf_med." + lado, _lerp(li, com, 0.55), "cv_mandibula", 0.12)

        ojo = lm["OJO." + lado]
        hueso("cv_ojo." + lado, ojo, "cv_cabeza", 0.30)
        hueso("cv_parpado_sup." + lado, ojo, "cv_cabeza", 0.28)
        hueso("cv_parpado_inf." + lado, ojo, "cv_cabeza", 0.28)

        ci, ce = lm["CEJA_INT." + lado], lm["CEJA_EXT." + lado]
        hueso("cv_ceja_int." + lado, ci, "cv_cabeza", 0.12)
        hueso("cv_ceja_med." + lado, _lerp(ci, ce, 0.5), "cv_cabeza", 0.12)
        hueso("cv_ceja_ext." + lado, ce, "cv_cabeza", 0.12)

        signo = 1.0 if lado == "L" else -1.0
        mej = _lerp(ojo, com, 0.55)
        hueso("cv_mejilla." + lado, (x0 + signo * (abs(mej[0] - x0) + 0.20 * u), mej[1], mej[2]),
              "cv_cabeza", 0.15)
        nz = lm["NARIZ"]
        hueso("cv_nariz." + lado, (x0 + signo * 0.32 * u, nz[1] + 0.12 * u, nz[2] + 0.03 * u),
              "cv_cabeza", 0.10)
    # lengua: de atrás hacia la punta, colgando de la mandíbula
    y_fondo = ls[1] + 0.85 * u
    y_punta = ls[1] + 0.10 * u
    z_len = 0.5 * (ls[2] + li[2]) - 0.05 * u
    for i in range(3):
        y = y_fondo + (y_punta - y_fondo) * i / 3.0
        hueso("cv_lengua.%d" % (i + 1), (x0, y, z_len), "cv_mandibula" if i == 0 else "cv_lengua.%d" % i, 0.10)
    return h


# ------------------------------------------------------------------ canales

def _v(*a): return list(a)


def _lado(hueso, lado, loc=None, rot=None):
    """Entrada de canal para el hueso ``hueso.<lado>``."""
    d = {}
    if loc: d["loc"] = _v(*loc)
    if rot: d["rot"] = _v(*rot)
    return {hueso + "." + lado: d}


def _unir(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


def espejar_hueso(nombre):
    if nombre.endswith(".L"): return nombre[:-2] + ".R"
    if nombre.endswith(".R"): return nombre[:-2] + ".L"
    return nombre


def espejar(pose):
    """Pose de un lado -> pose del otro (invierte X y los giros que cambian de sentido)."""
    out = {}
    for hueso, d in pose.items():
        n = {}
        if "loc" in d:
            x, y, z = d["loc"]; n["loc"] = [-x, y, z]
        if "rot" in d:
            x, y, z = d["rot"]; n["rot"] = [x, -y, -z]
        out[espejar_hueso(hueso)] = n
    return out


def _canales_lado():
    """Canales de un solo lado, definidos para el izquierdo (.L)."""
    L = "L"
    c = {}
    c["mouthSmile"] = _unir(
        _lado("cv_comisura", L, (0.10, 0.17, 0.02)),
        _lado("cv_labio_sup_med", L, (0.05, 0.07, 0.0)),
        _lado("cv_labio_inf_med", L, (0.05, 0.04, 0.0)),
        _lado("cv_mejilla", L, (0.0, 0.10, 0.04)))
    c["mouthFrown"] = _unir(
        _lado("cv_comisura", L, (-0.03, -0.12, 0.0)),
        _lado("cv_labio_inf_med", L, (0.0, -0.03, 0.0)))
    c["mouthStretch"] = _unir(
        _lado("cv_comisura", L, (0.15, 0.0, -0.01)),
        _lado("cv_labio_sup_med", L, (0.08, 0.0, 0.0)),
        _lado("cv_labio_inf_med", L, (0.08, 0.0, 0.0)))
    c["mouthUpperUp"] = _unir(
        _lado("cv_labio_sup_med", L, (0.0, 0.10, 0.01)),
        {"cv_labio_sup": {"loc": [0.0, 0.05, 0.0]}})
    c["mouthLowerDown"] = _unir(
        _lado("cv_labio_inf_med", L, (0.0, -0.12, 0.0)),
        {"cv_labio_inf": {"loc": [0.0, -0.05, 0.0]}})
    c["mouthPress"] = _unir(
        _lado("cv_labio_sup_med", L, (0.0, -0.03, 0.0)),
        _lado("cv_labio_inf_med", L, (0.0, 0.03, 0.0)))
    c["mouthDimple"] = _unir(
        _lado("cv_comisura", L, (0.02, 0.03, -0.06)))
    c["cheekSquint"] = _unir(
        _lado("cv_mejilla", L, (0.0, 0.12, 0.05)),
        _lado("cv_parpado_inf", L, None, (-6.0, 0.0, 0.0)))
    c["noseSneer"] = _unir(
        _lado("cv_nariz", L, (0.0, 0.08, 0.02)),
        _lado("cv_labio_sup_med", L, (0.0, 0.04, 0.0)))
    c["browDown"] = _unir(
        _lado("cv_ceja_int", L, (0.02, -0.14, 0.02)),
        _lado("cv_ceja_med", L, (0.0, -0.10, 0.0)),
        _lado("cv_ceja_ext", L, (-0.01, -0.06, 0.0)))
    c["browOuterUp"] = _unir(
        _lado("cv_ceja_ext", L, (0.01, 0.16, 0.0)),
        _lado("cv_ceja_med", L, (0.0, 0.10, 0.0)),
        _lado("cv_ceja_int", L, (0.0, 0.03, 0.0)))
    c["eyeBlink"] = _unir(
        _lado("cv_parpado_sup", L, None, (38.0, 0.0, 0.0)),
        _lado("cv_parpado_inf", L, None, (-10.0, 0.0, 0.0)))
    c["eyeSquint"] = _unir(
        _lado("cv_parpado_sup", L, None, (16.0, 0.0, 0.0)),
        _lado("cv_parpado_inf", L, None, (-14.0, 0.0, 0.0)))
    c["eyeWide"] = _unir(
        _lado("cv_parpado_sup", L, None, (-16.0, 0.0, 0.0)),
        _lado("cv_parpado_inf", L, None, (8.0, 0.0, 0.0)))
    # mirada: pitch + abajo / - arriba; yaw + hacia la izquierda del personaje
    c["eyeLookUp"] = _lado("cv_ojo", L, None, (-18.0, 0.0, 0.0))
    c["eyeLookDown"] = _lado("cv_ojo", L, None, (18.0, 0.0, 0.0))
    c["eyeLookOut"] = _lado("cv_ojo", L, None, (0.0, 20.0, 0.0))
    c["eyeLookIn"] = _lado("cv_ojo", L, None, (0.0, -20.0, 0.0))
    return c


def _canales_centro():
    c = {}
    c["jawOpen"] = {"cv_mandibula": {"rot": [14.0, 0.0, 0.0]}}
    c["jawForward"] = {"cv_mandibula": {"loc": [0.0, 0.0, 0.06]}}
    c["jawLeft"] = {"cv_mandibula": {"loc": [0.06, 0.0, 0.0]}}
    c["jawRight"] = {"cv_mandibula": {"loc": [-0.06, 0.0, 0.0]}}
    pucker = {"cv_labio_sup": {"loc": [0.0, 0.0, 0.14]}, "cv_labio_inf": {"loc": [0.0, 0.0, 0.14]}}
    lado = _unir(_lado("cv_comisura", "L", (-0.22, 0.0, 0.14)),
                 _lado("cv_labio_sup_med", "L", (-0.12, 0.0, 0.12)),
                 _lado("cv_labio_inf_med", "L", (-0.12, 0.0, 0.12)))
    c["mouthPucker"] = _unir(pucker, lado, espejar(lado))
    funnel = {"cv_labio_sup": {"loc": [0.0, 0.04, 0.12]}, "cv_labio_inf": {"loc": [0.0, -0.04, 0.12]}}
    lado = _unir(_lado("cv_comisura", "L", (-0.14, 0.0, 0.10)),
                 _lado("cv_labio_sup_med", "L", (-0.07, 0.04, 0.10)),
                 _lado("cv_labio_inf_med", "L", (-0.07, -0.04, 0.10)))
    c["mouthFunnel"] = _unir(funnel, lado, espejar(lado))
    lado = _lado("cv_labio_inf_med", "L", (0.0, 0.05, -0.06))
    c["mouthRollLower"] = _unir({"cv_labio_inf": {"loc": [0.0, 0.06, -0.08]}}, lado, espejar(lado))
    desp = {}
    for n in ("cv_labio_sup", "cv_labio_inf"):
        desp[n] = {"loc": [0.08, 0.0, 0.0]}
    for n in ("cv_comisura", "cv_labio_sup_med", "cv_labio_inf_med"):
        desp[n + ".L"] = {"loc": [0.08, 0.0, 0.0]}
        desp[n + ".R"] = {"loc": [0.08, 0.0, 0.0]}
    c["mouthLeft"] = desp
    c["mouthRight"] = {k: {"loc": [-v["loc"][0], 0.0, 0.0]} for k, v in desp.items()}
    lado = _lado("cv_mejilla", "L", (0.05, 0.0, 0.12))
    c["cheekPuff"] = _unir(lado, espejar(lado))
    lado = _unir(_lado("cv_ceja_int", "L", (-0.01, 0.20, 0.0)),
                 _lado("cv_ceja_med", "L", (0.0, 0.07, 0.0)))
    c["browInnerUp"] = _unir(lado, espejar(lado))
    c["tongueOut"] = {"cv_lengua.1": {"loc": [0.0, 0.0, 0.10]},
                      "cv_lengua.2": {"loc": [0.0, 0.0, 0.20]},
                      "cv_lengua.3": {"loc": [0.0, 0.0, 0.32]}}
    return c


# Los valores de arriba describen un gesto «natural»; un personaje de dibujos o de
# videojuego necesita más recorrido para que se lea a distancia. Se prueba y se ajusta aquí.
ESCALA_DESPLAZAMIENTO = 2.2
# la piel de la frente se tensa antes que la de la boca: las cejas llevan menos recorrido
FACTOR_FAMILIA = {"brow": 0.65, "mouthUpperUp": 0.6, "mouthLowerDown": 0.7,
                  "mouthStretch": 0.8, "mouthPucker": 0.8, "mouthFunnel": 0.8}


def canales_por_defecto():
    """Todos los canales, ya con sus versiones Left/Right."""
    out = _canales_centro()
    for nombre, izq in _canales_lado().items():
        out[nombre + "Left"] = izq
        out[nombre + "Right"] = espejar(izq)
    for nombre, canal in out.items():
        k = ESCALA_DESPLAZAMIENTO
        for prefijo, f in FACTOR_FAMILIA.items():
            if nombre.startswith(prefijo):
                k *= f
        for d in canal.values():
            if "loc" in d:
                d["loc"] = [round(x * k, 5) for x in d["loc"]]
    return out


# ------------------------------------------------------------- expresiones

def _par(nombre, valor, a=None):
    return {nombre + "Left": valor, nombre + "Right": valor if a is None else a}


def _mezcla(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


def expresiones_por_defecto():
    """Mezclas de canales (independientes del rig). Valores 0..1.

    Calibradas con vídeos de referencia de gestos estilizados: tristeza con cejas
    internas arriba y juntas, enfado con párpados bajos y nariz arrugada, miedo y
    sorpresa con ojos muy abiertos, sonrisa que pasa de cerrada a con dientes.
    """
    e = {}
    e["Neutral"] = {}
    e["Sonrisa"] = _mezcla(_par("mouthSmile", 0.6), _par("cheekSquint", 0.3), _par("eyeSquint", 0.1))
    e["Feliz"] = _mezcla(_par("mouthSmile", 1.0), _par("cheekSquint", 0.6), _par("eyeSquint", 0.3),
                         _par("mouthUpperUp", 0.3), _par("browOuterUp", 0.15), {"jawOpen": 0.12})
    e["Risa"] = _mezcla(_par("mouthSmile", 1.0), _par("cheekSquint", 0.8), _par("eyeSquint", 0.55),
                        _par("mouthUpperUp", 0.5), {"jawOpen": 0.6}, _par("browOuterUp", 0.2),
                        _par("mouthLowerDown", 0.25))
    e["Triste"] = _mezcla(_par("mouthFrown", 1.0), {"browInnerUp": 1.0, "mouthRollLower": 0.35},
                          _par("browDown", 0.2), _par("eyeWide", 0.12), _par("eyeLookDown", 0.15))
    e["Enfadado"] = _mezcla(_par("browDown", 1.2), _par("noseSneer", 0.6), _par("eyeSquint", 0.65),
                            _par("mouthPress", 0.6), _par("mouthFrown", 0.5), _par("mouthUpperUp", 0.15))
    e["Gruñido"] = _mezcla(_par("browDown", 1.3), _par("noseSneer", 1.0), _par("eyeSquint", 0.7),
                           _par("mouthUpperUp", 1.0), _par("mouthStretch", 0.3), _par("mouthFrown", 0.4),
                           {"jawOpen": 0.14})
    e["Sorpresa"] = _mezcla(_par("browOuterUp", 1.0), {"browInnerUp": 1.0}, _par("eyeWide", 1.0),
                            {"jawOpen": 0.65, "mouthFunnel": 0.45})
    e["Miedo"] = _mezcla(_par("browOuterUp", 0.5), {"browInnerUp": 1.0}, _par("eyeWide", 1.0),
                         _par("mouthStretch", 0.8), {"jawOpen": 0.35}, _par("mouthLowerDown", 0.4),
                         _par("mouthFrown", 0.2), _par("browDown", 0.15))
    e["Asco"] = _mezcla(_par("noseSneer", 1.0), _par("mouthUpperUp", 0.75), _par("mouthFrown", 0.5),
                        _par("browDown", 0.7), _par("eyeSquint", 0.55), {"jawOpen": 0.1})
    e["Desprecio"] = _mezcla({"mouthSmileLeft": 0.6, "mouthDimpleLeft": 0.8, "browDownRight": 0.2},
                             {"eyeSquintRight": 0.3, "eyeSquintLeft": 0.15})
    e["Duda"] = _mezcla({"browOuterUpLeft": 1.0, "browDownRight": 0.55, "mouthFrownRight": 0.4,
                         "mouthLeft": 0.4, "eyeSquintRight": 0.3})
    e["Guiño"] = _mezcla({"eyeBlinkLeft": 1.0, "mouthSmileLeft": 0.7, "mouthSmileRight": 0.35,
                          "cheekSquintLeft": 0.6, "browDownLeft": 0.3})
    e["Pícaro"] = _mezcla({"mouthSmileLeft": 0.85, "mouthSmileRight": 0.3, "browOuterUpRight": 0.7,
                           "browDownLeft": 0.3}, _par("eyeSquint", 0.4))
    e["Cansado"] = _mezcla(_par("eyeBlink", 0.5), {"browInnerUp": 0.3}, _par("mouthFrown", 0.2),
                           {"jawOpen": 0.06})
    e["Beso"] = _mezcla({"mouthPucker": 1.0}, _par("eyeSquint", 0.25), {"browInnerUp": 0.15})
    e["Concentrado"] = _mezcla(_par("browDown", 0.55), _par("eyeSquint", 0.25), _par("mouthPress", 0.25))
    e["Vergüenza"] = _mezcla(_par("mouthSmile", 0.35), {"browInnerUp": 0.65}, _par("eyeLookDown", 0.5),
                             _par("cheekSquint", 0.25))
    return e


def visemas_es():
    """Mezclas para los visemas del español (claves de ``fonemas_es``)."""
    v = {}
    v["A"] = _mezcla({"jawOpen": 0.85}, _par("mouthLowerDown", 0.2))
    v["E"] = _mezcla({"jawOpen": 0.38}, _par("mouthStretch", 0.6), _par("mouthUpperUp", 0.1))
    v["I"] = _mezcla({"jawOpen": 0.18}, _par("mouthStretch", 0.85), _par("mouthSmile", 0.15))
    v["O"] = _mezcla({"jawOpen": 0.5, "mouthFunnel": 0.9})
    v["U"] = _mezcla({"jawOpen": 0.2, "mouthPucker": 0.95})
    v["M"] = _mezcla(_par("mouthPress", 1.0))
    v["F"] = _mezcla(_par("mouthUpperUp", 0.5), {"jawOpen": 0.12, "mouthRollLower": 0.9})
    v["S"] = _mezcla({"jawOpen": 0.10}, _par("mouthStretch", 0.5), _par("mouthUpperUp", 0.2))
    v["CH"] = _mezcla({"jawOpen": 0.12, "mouthFunnel": 0.5})
    v["C"] = _mezcla({"jawOpen": 0.15}, _par("mouthStretch", 0.15))
    return v


# Canales que usan los visemas: la lengua y los ojos nunca los mueve el habla.
CANALES_HABLA = ("jawOpen", "mouthFunnel", "mouthPucker", "mouthRollLower",
                 "mouthStretchLeft", "mouthStretchRight", "mouthPressLeft", "mouthPressRight",
                 "mouthUpperUpLeft", "mouthUpperUpRight", "mouthLowerDownLeft", "mouthLowerDownRight",
                 "mouthSmileLeft", "mouthSmileRight")
# Canales de «lazo»: los que cambian la forma de los labios (se heredan de la vocal siguiente).
LABIOS_REDONDOS = ("mouthFunnel", "mouthPucker", "mouthStretchLeft", "mouthStretchRight")
