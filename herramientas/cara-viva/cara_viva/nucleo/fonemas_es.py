"""Texto en español -> visemas con peso de duración.

El español es casi fonético, así que unas pocas reglas bastan. No se usa
diccionario ni red: solo letras. Cada evento lleva
    v    visema: A E I O U M F S CH C (consonante neutra) o "_" (pausa)
    w    peso de duración relativo (las vocales pesan 1)
    amp  fuerza de la apertura (vocal acentuada > 1)
    frase  índice de la frase (se corta en , ; : . ! ? … y salto de línea)
    fuerte  True si la pausa viene de . ! ? … o salto de línea
"""
import re

VISEMAS = ("A", "E", "I", "O", "U", "M", "F", "S", "CH", "C")

_ACENTUADAS = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u"}
_TOKEN = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[,;:]|[.!?…]+|\n")
_PESO_CONS = {"C": 0.50, "S": 0.65, "M": 0.65, "F": 0.60, "CH": 0.70}
# duración relativa de una pausa (en unidades de vocal); solo se usa sin audio
PAUSA_DEBIL = 2.2
PAUSA_FUERTE = 5.0


def _normalizar(palabra):
    """-> (letras base en minúscula, lista de acentos, lista de diéresis)."""
    base, acento, dieresis = [], [], []
    for ch in palabra.lower():
        if ch in _ACENTUADAS:
            base.append(_ACENTUADAS[ch]); acento.append(True); dieresis.append(False)
        elif ch == "ü":
            base.append("u"); acento.append(False); dieresis.append(True)
        else:
            base.append(ch); acento.append(False); dieresis.append(False)
    return base, acento, dieresis


def palabra_a_eventos(palabra):
    s, acc, die = _normalizar(palabra)
    n = len(s)
    vocales = "aeiou"
    ev = []

    def nx(i, k=1):
        return s[i + k] if i + k < n else ""

    def cons(v, w=None):
        ev.append({"v": v, "w": w if w is not None else _PESO_CONS[v], "amp": 1.0})

    i = 0
    while i < n:
        c = s[i]
        if c in vocales:
            prev = s[i - 1] if i > 0 else ""
            sig = nx(i)
            deslizada = (c in "iu" and not acc[i]
                         and ((sig in vocales and sig != "") or prev in vocales and prev != ""))
            ev.append({"v": c.upper(), "w": 0.55 if deslizada else 1.0,
                       "amp": 1.25 if acc[i] else (0.8 if deslizada else 1.0)})
            i += 1
        elif c == "c":
            if nx(i) == "h":
                cons("CH"); i += 2
            elif nx(i) in ("e", "i"):
                cons("S"); i += 1
            else:
                cons("C"); i += 1
        elif c == "q":
            cons("C"); i += 2 if nx(i) == "u" else 1
        elif c == "g":
            cons("C")
            if nx(i) == "u" and nx(i, 2) in ("e", "i") and not die[i + 1]:
                i += 2
            else:
                i += 1
        elif c == "h":
            i += 1
        elif c == "l":
            cons("C"); i += 2 if nx(i) == "l" else 1
        elif c == "r":
            if nx(i) == "r":
                cons("C", 0.8); i += 2
            else:
                cons("C", 0.35); i += 1
        elif c in "bvmp":
            cons("M"); i += 1
        elif c == "f":
            cons("F"); i += 1
        elif c in "szx":
            cons("S"); i += 1
        elif c == "y":
            fin = (i == n - 1)
            if fin:
                ev.append({"v": "I", "w": 0.8, "amp": 0.9})
            else:
                ev.append({"v": "I", "w": 0.45, "amp": 0.7})
            i += 1
        elif c == "w":
            ev.append({"v": "U", "w": 0.5, "amp": 0.8}); i += 1
        else:                       # d t n ñ j k ...
            cons("C"); i += 1
    return ev


def texto_a_eventos(texto):
    """-> lista de eventos (incluye pausas ``_``)."""
    out = []
    frase = 0
    for tok in _TOKEN.findall(texto):
        if tok[0].isalpha():
            for e in palabra_a_eventos(tok):
                e["frase"] = frase
                out.append(e)
        else:
            fuerte = tok == "\n" or tok[0] in ".!?…"
            out.append({"v": "_", "w": PAUSA_FUERTE if fuerte else PAUSA_DEBIL,
                        "amp": 0.0, "frase": frase, "fuerte": fuerte})
            frase += 1
    # una pausa seguida de otra (p. ej. ".\n") se funde en la más fuerte
    limpio = []
    for e in out:
        if limpio and e["v"] == "_" and limpio[-1]["v"] == "_":
            if e["fuerte"] and not limpio[-1]["fuerte"]:
                limpio[-1] = e
            continue
        limpio.append(e)
    # renumera las frases tras la limpieza
    f = 0
    for e in limpio:
        e["frase"] = f
        if e["v"] == "_":
            f += 1
    return limpio


def contar_frases(eventos, solo_fuertes=False):
    """Número de tramos de voz que debería haber en el audio."""
    n, hay = 0, False
    for e in eventos:
        if e["v"] == "_":
            if hay and (e["fuerte"] or not solo_fuertes):
                n += 1
            if e["fuerte"] or not solo_fuertes:
                hay = False
        else:
            hay = True
    return n + (1 if hay else 0)
