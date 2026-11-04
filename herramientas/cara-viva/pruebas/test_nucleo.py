"""Pruebas del núcleo (Python puro): python -I pruebas/test_nucleo.py"""
import math
import os
import struct
import sys
import tempfile
import unittest
import wave

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "cara_viva"))

from nucleo import biblioteca, estandar, fonemas_es, habla, tiempos, vida  # noqa: E402


def wav_sintetico(ruta, tramos, tasa=16000, total=None):
    """tramos: [(t0, t1)] con tono; el resto, silencio."""
    total = total or max(b for _a, b in tramos) + 0.3
    n = int(total * tasa)
    datos = []
    for i in range(n):
        t = i / tasa
        v = 0.0
        for a, b in tramos:
            if a <= t < b:
                v = 0.5 * math.sin(2 * math.pi * 180 * t) * (0.6 + 0.4 * math.sin(2 * math.pi * 4 * t))
        datos.append(int(v * 32000))
    with wave.open(ruta, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(tasa)
        w.writeframes(struct.pack("<%dh" % n, *datos))


class Fonemas(unittest.TestCase):
    def vis(self, palabra):
        return [e["v"] for e in fonemas_es.palabra_a_eventos(palabra)]

    def test_reglas_basicas(self):
        self.assertEqual(self.vis("hola"), ["O", "C", "A"])
        self.assertEqual(self.vis("mamá"), ["M", "A", "M", "A"])
        self.assertEqual(self.vis("queso"), ["C", "E", "S", "O"])
        self.assertEqual(self.vis("guerra"), ["C", "E", "C", "A"])
        self.assertEqual(self.vis("chico"), ["CH", "I", "C", "O"])
        self.assertEqual(self.vis("cine"), ["S", "I", "C", "E"])
        self.assertEqual(self.vis("vaca"), ["M", "A", "C", "A"])
        self.assertEqual(self.vis("cigüeña"), ["S", "I", "C", "U", "E", "C", "A"])

    def test_diptongo_y_acento(self):
        ev = fonemas_es.palabra_a_eventos("cuatro")
        u = [e for e in ev if e["v"] == "U"][0]
        self.assertLess(u["w"], 1.0)
        ev = fonemas_es.palabra_a_eventos("camión")
        o = [e for e in ev if e["v"] == "O"][0]
        self.assertGreater(o["amp"], 1.0)

    def test_frases(self):
        ev = fonemas_es.texto_a_eventos("Hola, me llamo Lía. ¿Cómo estás?")
        self.assertEqual(fonemas_es.contar_frases(ev), 3)
        self.assertEqual(fonemas_es.contar_frases(ev, solo_fuertes=True), 2)
        self.assertFalse(any(e["v"] == "_" and False for e in ev))


class Tiempos(unittest.TestCase):
    def test_segmentos_y_alineado(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "v.wav")
            wav_sintetico(ruta, [(0.5, 1.5), (2.2, 3.4)])
            m, tasa = tiempos.leer_wav(ruta)
            env = tiempos.envolvente(m, tasa)
            segs = tiempos.segmentos_voz(env)
            self.assertEqual(len(segs), 2)
            self.assertAlmostEqual(segs[0][0], 0.5, delta=0.06)
            self.assertAlmostEqual(segs[1][1], 3.4, delta=0.08)
            ev = fonemas_es.texto_a_eventos("Hola amigo. Buenos días")
            t = tiempos.con_segmentos(ev, segs)
            voz = [e for e in t if e["v"] != "_"]
            self.assertGreaterEqual(voz[0]["t0"], 0.45)
            self.assertLessEqual(voz[-1]["t1"], 3.5)
            # ningún sonido cae en el silencio entre frases
            for e in voz:
                self.assertFalse(1.6 < e["t0"] < 2.1, e)
            for a, b in zip(t, t[1:]):
                self.assertLessEqual(a["t0"], a["t1"] + 1e-9)

    def test_cuando_no_coinciden_los_tramos(self):
        ev = fonemas_es.texto_a_eventos("uno dos tres cuatro cinco seis")
        segs = [(0.3, 1.0), (1.5, 2.2), (2.8, 3.3)]
        t = tiempos.con_segmentos(ev, segs)
        voz = [e for e in t if e["v"] != "_"]
        self.assertEqual(len(voz), len([e for e in ev if e["v"] != "_"]))
        for e in voz:
            self.assertTrue(any(a - 1e-6 <= e["t0"] <= b + 1e-6 for a, b in segs), e)
            self.assertTrue(any(a - 1e-6 <= e["t1"] <= b + 1e-6 for a, b in segs), e)

    def test_sin_audio(self):
        ev = fonemas_es.texto_a_eventos("hola, adiós")
        t = tiempos.sin_audio(ev)
        self.assertGreater(t[-1]["t1"], 0.5)


class Habla(unittest.TestCase):
    def test_curvas(self):
        bib = biblioteca.por_defecto()
        ev = fonemas_es.texto_a_eventos("mamá abre la boca")
        t = tiempos.sin_audio(ev)
        r = habla.construir(t, bib, fps=24)
        self.assertIn("jawOpen", r["canales"])
        n = len(r["tiempos"])
        self.assertTrue(all(len(v) == n for v in r["canales"].values()))
        self.assertEqual(r["tiempos"], sorted(r["tiempos"]))
        self.assertEqual(r["canales"]["jawOpen"][0], 0.0)
        self.assertEqual(r["canales"]["jawOpen"][-1], 0.0)
        self.assertGreater(max(r["canales"]["jawOpen"]), 0.5)
        # en la «m» la mandíbula está cerrada
        m = [e for e in t if e["v"] == "M"][0]
        i = min(range(n), key=lambda k: abs(r["tiempos"][k] - 0.5 * (m["t0"] + m["t1"])))
        self.assertLess(r["canales"]["jawOpen"][i], 0.05)
        self.assertGreater(r["canales"]["mouthPressLeft"][i], 0.9)


class Vida(unittest.TestCase):
    def test_determinista_y_rangos(self):
        a = vida.generar(30.0, semilla=7, pausas_fuertes=[5.0, 9.0], enfasis=[(3.0, 1.0)])
        b = vida.generar(30.0, semilla=7, pausas_fuertes=[5.0, 9.0], enfasis=[(3.0, 1.0)])
        self.assertEqual(a["parpadeos"], b["parpadeos"])
        self.assertGreater(len(a["parpadeos"]), 5)
        for nombre, c in a["curvas"].items():
            ts = [t for t, _ in c]
            self.assertEqual(ts, sorted(ts), nombre)
            self.assertTrue(all(-1e-9 <= v <= 1.05 for _t, v in c), nombre)
        for _t, (y, p, r) in a["cabeza"]:
            self.assertLess(abs(y), 6.0); self.assertLess(abs(p), 6.0); self.assertLess(abs(r), 3.0)
        c = vida.generar(30.0, semilla=8)
        self.assertNotEqual(a["parpadeos"], c["parpadeos"])


class Biblioteca(unittest.TestCase):
    def test_defecto_valido(self):
        bib = biblioteca.por_defecto()
        self.assertEqual(biblioteca.validar(bib), [])
        self.assertGreater(len(bib["canales"]), 45)

    def test_espejo(self):
        izq = estandar._canales_lado()["mouthSmile"]
        der = estandar.espejar(izq)
        self.assertIn("cv_comisura.R", der)
        self.assertEqual(der["cv_comisura.R"]["loc"][0], -izq["cv_comisura.L"]["loc"][0])
        self.assertEqual(estandar.espejar(der), izq)

    def test_guardar_cargar_y_cambios(self):
        bib = biblioteca.por_defecto()
        bib["expresiones"]["Mia"] = {"canales": {"mouthSmileLeft": 0.5}, "huesos": {}}
        with tempfile.TemporaryDirectory() as d:
            r = os.path.join(d, "b.json")
            biblioteca.guardar(r, biblioteca.solo_cambios(bib))
            otra = biblioteca.cargar(r)
            self.assertEqual(list(otra["expresiones"]), ["Mia"])
            self.assertEqual(biblioteca.fusionar(biblioteca.por_defecto(), otra)["expresiones"]["Mia"],
                             bib["expresiones"]["Mia"])

    def test_mezcla(self):
        bib = biblioteca.por_defecto()
        h, desc = biblioteca.mezclar_huesos(bib["canales"], {"jawOpen": 0.5, "nada": 1.0})
        self.assertEqual(desc, ["nada"])
        self.assertAlmostEqual(h["cv_mandibula"]["rot"][0], 7.0)
        h, _ = biblioteca.mezclar_huesos(bib["canales"], {"mouthSmileLeft": 1.0}, ganancias={"mouthSmileLeft": 0.5})
        self.assertAlmostEqual(h["cv_comisura.L"]["loc"][1], 0.17 * estandar.ESCALA_DESPLAZAMIENTO * 0.5, places=4)

    def test_asimetria_y_lados(self):
        p = {"mouthSmileLeft": 1.0, "mouthSmileRight": 1.0, "jawOpen": 0.3}
        a = biblioteca.asimetria(p, 0.1, semilla=3)
        self.assertEqual(a["jawOpen"], 0.3)
        self.assertNotEqual(a["mouthSmileLeft"], a["mouthSmileRight"])
        self.assertEqual(biblioteca.intercambiar_lados({"browDownLeft": 0.4})["browDownRight"], 0.4)

    def test_crudos_portables(self):
        crudos = biblioteca.pose_a_crudos({"cv_comisura.L": ((0.01, 0.02, 0.0), (0, 0, 0)),
                                            "cv_nariz.L": ((0, 0, 0), (0, 0, 0))}, iod=0.1)
        self.assertEqual(list(crudos), ["cv_comisura.L"])
        self.assertAlmostEqual(crudos["cv_comisura.L"]["loc"][1], 0.2)


class Estandar(unittest.TestCase):
    def puntos(self):
        return {"OJO.L": (0.032, -0.09, 0.05), "COMISURA.L": (0.025, -0.10, -0.03),
                "LABIO_SUP": (0.0, -0.105, -0.025), "LABIO_INF": (0.0, -0.103, -0.035),
                "MENTON": (0.0, -0.09, -0.075), "NARIZ": (0.0, -0.115, 0.0),
                "CEJA_INT.L": (0.01, -0.1, 0.08), "CEJA_EXT.L": (0.05, -0.08, 0.075)}

    def test_completar_y_colocar(self):
        lm = estandar.completar(self.puntos())
        self.assertAlmostEqual(lm["_iod"], 0.064, places=3)
        self.assertAlmostEqual(lm["OJO.R"][0], -0.032)
        self.assertTrue(lm["_mandibula_estimada"])
        h = estandar.colocar(lm)
        self.assertEqual(len(h), 29)
        for nombre, d in h.items():
            self.assertTrue(d["parent"] is None or d["parent"] in h, nombre)
            self.assertGreater(sum((a - b) ** 2 for a, b in zip(d["head"], d["tail"])), 1e-12, nombre)
        # el orden de los padres permite crearlos sin ciclos
        vistos = set()
        pendientes = dict(h)
        while pendientes:
            listo = [n for n, d in pendientes.items() if d["parent"] is None or d["parent"] in vistos]
            self.assertTrue(listo)
            for n in listo:
                vistos.add(n); del pendientes[n]

    def test_faltan_puntos(self):
        p = self.puntos(); del p["NARIZ"]
        with self.assertRaises(ValueError):
            estandar.completar(p)

    def test_canales_apuntan_a_huesos_reales(self):
        h = estandar.colocar(estandar.completar(self.puntos()))
        bib = biblioteca.por_defecto()
        self.assertEqual(biblioteca.validar(bib, set(h)), [])


if __name__ == "__main__":
    unittest.main(verbosity=1)
