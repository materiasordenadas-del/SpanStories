# Ajuste automático de los visemas al personaje (0.8.11).
# La biblioteca de visemas son pesos genéricos: en una cara concreta la misma mezcla abre la boca demasiado poco o
# la cierra demasiado (cada cara tiene un rango distinto en jawOpen, mouthFunnel...). Aquí se MIDE la cara (apertura
# vertical entre los bordes de los labios y ancho entre comisuras, en unidades de media anchura de la boca `hw`) y se
# corrigen los pesos de cada sonido hasta que la boca mida lo que debe medir. El resultado se guarda como visemas
# propios del personaje (cara['rlb_visemas']) y el usuario puede retocarlos después con el editor de habla.
import bpy, json
import numpy as np
from . import biblioteca as BI
from .cara import Cara

# objetivo por sonido: (apertura vertical en hw, cambio de ancho respecto al reposo en fracción del ancho).
# Proporciones de boca humana al hablar, sin exagerar (0,5 hw ≈ un cuarto del ancho de la boca).
OBJETIVO = {
    'A': (0.62, 0.00), 'E': (0.34, 0.12), 'I': (0.16, 0.20), 'O': (0.40, -0.26), 'U': (0.18, -0.34),
    'CH': (0.20, -0.20), 'S': (0.12, 0.10), 'TH': (0.16, 0.05), 'TDNL': (0.22, 0.03), 'K': (0.26, 0.00),
}
VERTICAL = ('jawOpen', 'mouthUpperUp', 'mouthLowerDown')
ENSANCHAN = ('mouthStretch', 'mouthSmile')
ESTRECHAN = ('mouthFunnel', 'mouthPucker')
SEMILLA = {'v': {'jawOpen': 1.0}, '+': {'mouthStretch': 0.6, 'mouthSmile': 0.4}, '-': {'mouthFunnel': 0.7, 'mouthPucker': 0.3}}
REDONDOS = ('O', 'U', 'CH')    # redondean con funnel/pucker (nunca estiran); los demás estiran/sonríen, nunca redondean
TOL = (0.03, 0.02)          # error aceptado: apertura (hw) y ancho (fracción)


class _Medidor:
    """pone pesos en el control y mide apertura y ancho en la malla evaluada; al salir devuelve todo como estaba."""

    def __init__(self, cara):
        self.cara = cara
        self.K = Cara(cara)
        K = self.K
        self.sup, self.inf = K.zona[K.borde_sup], K.zona[K.borde_inf]
        self.iL = int(np.argmin(np.linalg.norm(K.P - K.cL, axis=1)))
        self.iR = int(np.argmin(np.linalg.norm(K.P - K.cR, axis=1)))
        self.ctrl = BI.control(cara)

    def __enter__(self):
        c = self.ctrl
        self.ad = c.animation_data_create()
        self.act, self.slot = self.ad.action, self.ad.action_slot
        self.prev = {k: float(c[k]) for k in c.keys() if k.startswith('v_')}
        self.disp = set(k[2:] for k in self.prev)
        self.ad.action = None
        return self

    def __exit__(self, *a):
        for k, v in self.prev.items():
            self.ctrl[k] = v
        self.ad.action = self.act
        if self.act is not None and self.slot is not None:
            self.ad.action_slot = self.slot
        self.ctrl.update_tag()
        bpy.context.view_layer.update()

    def medir(self, pesos):
        """-> (apertura en hw, ancho entre comisuras en fracción de 2·hw)"""
        ex = BI.expandir(pesos, self.disp)
        for k in self.prev:
            self.ctrl[k] = float(ex.get(k[2:], 0.0))
        self.ctrl.update_tag()
        bpy.context.view_layer.update()
        ev = self.cara.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        ev.to_mesh_clear()
        K = self.K
        gap = float((co[self.sup].mean(0) - co[self.inf].mean(0)) @ K.Z) / K.hw
        ancho = float((co[self.iL] - co[self.iR]) @ K.X) / (2 * K.hw)
        return gap, ancho


def _suma(w, m, grupo):
    return sum(m[c] * w.get(c, 0.0) for c in grupo)


def ajustar(cara, solo=None, guardar=True):
    """mide la cara y corrige los visemas. -> informe {sonido: {'antes': (apertura, ancho), 'despues': (...), 'objetivo': (...)}}.
    `solo`: lista de sonidos (por defecto todos los que tienen objetivo). Con guardar=False no toca el personaje."""
    lib = BI.cargar()
    base = {k: dict(v) for k, v in lib['visemas'].items() if k != 'nota'}      # siempre desde la biblioteca
    out, informe = BI.overrides_visemas(cara), {}
    with _Medidor(cara) as M:
        g0, a0 = M.medir({})
        # cuánto mueve cada canal al máximo (apertura y ancho): rango real de ESTA cara
        mg, ma = {}, {}
        for c in VERTICAL + ENSANCHAN + ESTRECHAN:
            g, a = M.medir({c: 1.0})
            mg[c], ma[c] = g - g0, a - a0
        for nombre, (obj_g, obj_a) in OBJETIVO.items():
            if solo and nombre not in solo:
                continue
            w = dict(base.get(nombre, {}))
            antes = M.medir(w)
            for _ in range(5):
                g, a = M.medir(w)
                eg, ea = obj_g - g, obj_a - (a - a0)
                if abs(eg) <= TOL[0] and abs(ea) <= TOL[1]:
                    break
                if abs(eg) > TOL[0]:                                   # apertura: mandíbula y labios verticales
                    d = {c: w[c] for c in VERTICAL if w.get(c, 0.0) > 1e-4} or dict(SEMILLA['v'])
                    k = sum(mg[c] * d[c] for c in d)
                    if abs(k) > 1e-6:
                        s = eg / k
                        for c in d:
                            w[c] = float(np.clip(w.get(c, 0.0) + s * d[c], 0.0, 1.0))
                if abs(ea) > TOL[1]:                                   # ancho: según la familia del sonido
                    grupo, tipo = (ESTRECHAN, '-') if nombre in REDONDOS else (ENSANCHAN, '+')
                    d = {c: w[c] for c in grupo if w.get(c, 0.0) > 1e-4} or dict(SEMILLA[tipo])
                    k = sum(ma[c] * d[c] for c in d)
                    if abs(k) > 1e-6:
                        s = ea / k
                        for c in d:
                            w[c] = float(np.clip(w.get(c, 0.0) + s * d[c], 0.0, 1.0))
            g, a = M.medir(w)
            w = {c: round(v, 3) for c, v in w.items() if v > 0.004}
            out[nombre] = w
            informe[nombre] = {'antes': tuple(round(x, 2) for x in (antes[0], antes[1] - a0)),
                               'despues': tuple(round(x, 2) for x in (g, a - a0)), 'objetivo': (obj_g, obj_a),
                               'pesos': w}
    if guardar:
        cara['rlb_visemas'] = json.dumps(out)
        cara['rlb_visemas_auto'] = True
    return informe
