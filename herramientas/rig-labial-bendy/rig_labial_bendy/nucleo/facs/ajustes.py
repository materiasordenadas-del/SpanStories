# Ajustes finos por zona para retocar cada expresión sin tocar la malla de forma permanente.
# Cada ajuste es una shape key suave limitada a una zona (aj_<zona>_<dirección>) con un canal v_aj_… de −1 a 1 en el
# control: a 0 no hace nada. Se guardan por expresión como cualquier otro canal y se exportan al GLB como morph.
# Las zonas salen de los huesos del rig de la cara (posición de reposo) y se recortan con los pesos de los labios y
# los párpados, para que el labio de arriba no arrastre al de abajo ni las cejas a los párpados.
#
#   from <complemento>.nucleo.facs import ajustes as AJ
#   AJ.crear(cara)          # crea/rehace las keys, canales y drivers (idempotente)
#   AJ.ZONAS                # zonas por defecto (boca 6, cejas 2); AJ.zonas(cara) = las de esa cara según su densidad
#   AJ.cambiar_densidad(cara, 'boca', 12)   # más puntos en la boca (6/8/10/12) o en las cejas (2/3/4 por ceja)
#
# Densidad: cara['aj_densidad'] = {'boca': 6, 'cejas': 2}. Con la de por defecto los nombres son los de siempre
# (labio_sup_R/centro/L, ceja_in/out_L/R). Con otra: labio_sup_1..N y labio_inf_1..N (1 = lado DERECHO del personaje,
# N = izquierdo; N = mitad de los puntos de la boca) y ceja_1..M_L/R (1 = interior, M = exterior).
import json, re, sys
import bpy
import numpy as np
from . import biblioteca as BI
from .construir import poner_key

# punto de control -> (texto del botón, sección del editor, direcciones). Pocos puntos y grandes (lo pidió el usuario).
ZONAS = {
    'labio_sup_centro': ('Arriba centro', 'labio_sup', ('arriba', 'derecha', 'adelante')),
    'labio_sup_L':      ('Arriba izq.', 'labio_sup', ('arriba', 'derecha', 'adelante')),
    'labio_sup_R':      ('Arriba der.', 'labio_sup', ('arriba', 'derecha', 'adelante')),
    'labio_inf_centro': ('Abajo centro', 'labio_inf', ('arriba', 'derecha', 'adelante')),
    'labio_inf_L':      ('Abajo izq.', 'labio_inf', ('arriba', 'derecha', 'adelante')),
    'labio_inf_R':      ('Abajo der.', 'labio_inf', ('arriba', 'derecha', 'adelante')),
    'comisura_L':       ('Comis. izq.', 'comisuras', ('arriba', 'afuera', 'adelante')),
    'comisura_R':       ('Comis. der.', 'comisuras', ('arriba', 'afuera', 'adelante')),
    'labio_borde_inf_L': ('Borde inferior izq.', 'labio_inf', ('arriba', 'derecha', 'adelante')),
    'labio_borde_inf_R': ('Borde inferior der.', 'labio_inf', ('arriba', 'derecha', 'adelante')),
    'ceja_in_L':        ('Ceja izq. dentro', 'cejas', ('arriba', 'afuera')),
    'ceja_out_L':       ('Ceja izq. fuera', 'cejas', ('arriba', 'afuera')),
    'ceja_in_R':        ('Ceja der. dentro', 'cejas', ('arriba', 'afuera')),
    'ceja_out_R':       ('Ceja der. fuera', 'cejas', ('arriba', 'afuera')),
    'mejilla_L':        ('Mejilla izq.', 'mejillas', ('arriba', 'adelante')),
    'mejilla_R':        ('Mejilla der.', 'mejillas', ('arriba', 'adelante')),
    'nariz_L':          ('Aleta izq.', 'nariz', ('arriba', 'afuera')),
    'nariz_R':          ('Aleta der.', 'nariz', ('arriba', 'afuera')),
    'nariz_punta':      ('Punta nariz', 'nariz', ('arriba',)),
    'menton':           ('Mentón', 'mandibula', ('arriba', 'adelante')),
}
TEXTO_DIR = {'arriba': ('Subir', 'Bajar'), 'adelante': ('Adelante', 'Atrás'), 'afuera': ('Afuera', 'Adentro'),
             'derecha': ('Derecha', 'Izquierda')}
# «modelar» la forma entera de una parte: key -> (texto, sección, texto +, texto −)
MODELAR = {
    'aj_boca_ancho':  ('Ancho de la boca', 'boca', 'Ancha', 'Estrecha'),
    'aj_boca_tamano': ('Tamaño de la boca', 'boca', 'Grande', 'Pequeña'),
}
# mm a ±100 % para una boca de 13,5 mm de media anchura (se escala con la cara)
MM = {'labio': 3.0, 'comisura': 3.0, 'ceja': 3.0, 'mejilla': 2.5, 'nariz': 1.5, 'menton': 3.0, 'boca': 2.5}


def nombre(zona, d):
    return f'aj_{zona}_{d}'


DENS_DEF = {'boca': 6, 'cejas': 2}
OPC_BOCA = (6, 8, 10, 12)
OPC_CEJAS = (2, 3, 4)


def densidad(cara=None):
    d = dict(DENS_DEF)
    if cara is not None:
        try:
            for k, v in dict(cara.get('aj_densidad', {})).items():
                if k in d:
                    d[k] = int(v)
        except Exception:
            pass
    return d


def _pts_labio(lab, n):
    """[(zona, x)] de un labio de derecha a izquierda del personaje; x en medias anchuras (comisura = ±1)."""
    if n == 3:
        return [(f'labio_{lab}_R', -0.6), (f'labio_{lab}_centro', 0.0), (f'labio_{lab}_L', 0.6)]
    return [(f'labio_{lab}_{k}', -0.85 + 1.7 * (k - 1) / (n - 1)) for k in range(1, n + 1)]


def _pts_ceja(s, m):
    """[(zona, u)] de una ceja del interior (0) al exterior (1)."""
    if m == 2:
        return [(f'ceja_in_{s}', 0.0), (f'ceja_out_{s}', 1.0)]
    return [(f'ceja_{k}_{s}', (k - 1) / (m - 1)) for k in range(1, m + 1)]


def _zonas_de(dens):
    nl, nc = dens['boca'] // 2, dens['cejas']
    if dens == DENS_DEF:
        return ZONAS
    z = {}
    for lab, tit in (('sup', 'Arriba'), ('inf', 'Abajo')):
        if nl == 3:
            for n, _ in _pts_labio(lab, 3):
                z[n] = ZONAS[n]
        else:
            for k, (n, _) in enumerate(_pts_labio(lab, nl), 1):
                z[n] = (f'{tit} {k}', f'labio_{lab}', ('arriba', 'derecha', 'adelante'))
    z['comisura_L'], z['comisura_R'] = ZONAS['comisura_L'], ZONAS['comisura_R']
    for s in ('L', 'R'):
        z[f'labio_borde_inf_{s}'] = ZONAS[f'labio_borde_inf_{s}']
    for s, txt in (('L', 'izq.'), ('R', 'der.')):
        for k, (n, _) in enumerate(_pts_ceja(s, nc), 1):
            z[n] = ZONAS[n] if nc == 2 else (f'Ceja {txt} {k}', 'cejas', ('arriba', 'afuera'))
    for n in ('mejilla_L', 'mejilla_R', 'nariz_L', 'nariz_R', 'nariz_punta', 'menton'):
        z[n] = ZONAS[n]
    return z


def zonas(cara=None):
    """zonas de esa cara (nombre -> (texto, sección, direcciones)) según su densidad."""
    from . import ajustes_ojos as AO
    anclas = cara.get('aj_anclas', {}) if cara is not None else {}
    oculares = {p: z for p, z in AO.ZONAS.items()
                if int(p.split('_')[2]) <= AO.npuntos(anclas, p.split('_')[1], p[-1])}
    return dict(_zonas_de(densidad(cara)), **oculares)


def lado_par(z, cara=None):
    """(lado 'L'/'R'/'', zona pareja) de una zona, para mover los dos lados a la vez."""
    dens = densidad(cara)
    m = re.fullmatch(r'parpado_(sup|inf)_([1-6])_([LR])', z)
    if m:
        from . import ajustes_ojos as AO
        lab, i, lado = m.groups()
        n = AO.npuntos(cara.get('aj_anclas', {}) if cara is not None else {}, lab, lado)
        return lado, f'parpado_{lab}_{n+1-int(i)}_' + ('R' if lado == 'L' else 'L')
    m = re.fullmatch(r'labio_(sup|inf)_(\d+)', z)
    if m:
        n, k = dens['boca'] // 2, int(m.group(2))
        if 2 * k == n + 1:
            return '', ''
        return ('R' if 2 * k < n + 1 else 'L'), f'labio_{m.group(1)}_{n + 1 - k}'
    m = re.fullmatch(r'ceja_(\d+)_([LR])', z)
    if m:
        return m.group(2), f'ceja_{m.group(1)}_' + ('R' if m.group(2) == 'L' else 'L')
    lado = 'L' if z.endswith('_L') else 'R' if z.endswith('_R') else ''
    return lado, (z[:-1] + ('R' if lado == 'L' else 'L')) if lado else ''


def todas(cara=None):
    return [nombre(z, d) for z, (_, _, ds) in zonas(cara).items() for d in ds] + list(MODELAR)


def _migrar(pesos, d0, d1):
    """pasa los valores de una expresión de la densidad d0 a la d1 interpolando por posición."""
    out = dict(pesos)
    trabajos = []
    if d0['boca'] != d1['boca']:
        for lab in ('sup', 'inf'):
            trabajos.append((_pts_labio(lab, d0['boca'] // 2), _pts_labio(lab, d1['boca'] // 2), ('arriba', 'derecha', 'adelante')))
    if d0['cejas'] != d1['cejas']:
        for s in ('L', 'R'):
            trabajos.append((_pts_ceja(s, d0['cejas']), _pts_ceja(s, d1['cejas']), ('arriba', 'afuera')))
    for ant, nue, ds in trabajos:
        xa = [x for _, x in ant]
        xn = [x for _, x in nue]
        for d in ds:
            va = [out.pop(nombre(z, d), 0.0) for z, _ in ant]
            if not any(abs(v) > 1e-4 for v in va):
                continue
            for (z, _), v in zip(nue, np.interp(xn, xa, va)):
                if abs(v) > 1e-4:
                    out[nombre(z, d)] = float(v)
    return out


def cambiar_densidad(cara, parte, n):
    """cambia los puntos de 'boca' (6/8/10/12) o 'cejas' (2/3/4): migra las expresiones y rehace keys y drivers."""
    if cara.get('rlb_manual_activo', False):
        raise RuntimeError('Vuelve a Automático antes de cambiar la densidad de puntos')
    d0 = densidad(cara)
    d1 = dict(d0)
    d1[parte] = int(n)
    if d1['boca'] not in OPC_BOCA or d1['cejas'] not in OPC_CEJAS:
        raise ValueError('densidad no válida')
    if d1 != d0:
        from . import poses as PO
        for a in [a for a in bpy.data.actions if a.name.startswith(f'{cara.name}_FACS_')]:
            e = PO.leer_crudo(a)
            PO._guardar(a, _migrar(e['pesos'], d0, d1), e['mirada'])
            o = a.get('rlb_original')
            if o is not None:
                o = o.to_dict() if hasattr(o, 'to_dict') else dict(o)
                o['pesos'] = _migrar(dict(o.get('pesos', {})), d0, d1)
                a['rlb_original'] = o
    cara['aj_densidad'] = d1
    return crear(cara)


def _quitar_sobrantes(cara, ctrl):
    """borra keys/canales aj_ de versiones anteriores que ya no existen."""
    validas = set(todas(cara))
    sk = cara.data.shape_keys
    for k in [k for k in sk.key_blocks if k.name.startswith('aj_') and k.name not in validas]:
        path = f'key_blocks["{k.name}"].value'
        if sk.animation_data:
            for f in [f for f in sk.animation_data.drivers if f.data_path == path]:
                sk.animation_data.drivers.remove(f)
        cara.shape_key_remove(k)
    cara['facs_keys'] = [n for n in cara.get('facs_keys', []) if not n.startswith('aj_') or n in validas]
    for p in [p for p in ctrl.keys() if p.startswith('v_aj_') and p[2:] not in validas]:
        del ctrl[p]


def _pos_reposo(cara):
    """posiciones de reposo (espacio de la cara) de los huesos guía: se mide con el cuerpo en REST."""
    arm = next((m.object for m in cara.modifiers if m.type == 'ARMATURE' and m.object and m.show_viewport), None)
    keep = arm.data.pose_position if arm else None
    if arm:
        arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    inv = cara.matrix_world.inverted()
    out = {}
    try:
        for ob_n, huesos in ((f'{cara.name}_Rig_Labios', ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf',
                                                            'ceja_in.L', 'ceja_out.L', 'ceja_in.R', 'ceja_out.R',
                                                            'mejilla.L', 'mejilla.R')),
                             (f'{cara.name}_Cara_Control', ('CTRL_nariz.L', 'CTRL_nariz.R'))):
            ob = bpy.data.objects.get(ob_n)
            if ob is None:
                continue
            for h in huesos:
                pb = ob.pose.bones.get(h)
                if pb is not None:
                    out[h] = np.array(inv @ (ob.matrix_world @ pb.head))
    finally:
        if arm:
            arm.data.pose_position = keep
        bpy.context.view_layer.update()
    return out


def _cejas_malla(cara, P, cx):
    """ceja_in/out medidos en la isla real de cada ceja (cfg['cejas']), al 15 % y 85 % de su largo; los huesos guía salen
    del ojo y pueden quedar lejos de los extremos. Sin isla identificada no devuelve nada."""
    try:
        semillas = json.loads(cara.get('rlb_cfg', '{}')).get('cejas') or {}
    except ValueError:
        return {}
    if not semillas:
        return {}
    E = np.empty(len(cara.data.edges) * 2, dtype=np.int32)
    cara.data.edges.foreach_get('vertices', E)
    vec = [[] for _ in range(len(P))]
    for a, b in E.reshape(-1, 2).tolist():
        vec[a].append(b); vec[b].append(a)
    out = {}
    for s, sem in semillas.items():
        visto, pila = {int(sem)}, [int(sem)]
        while pila:
            for b in vec[pila.pop()]:
                if b not in visto:
                    visto.add(b); pila.append(b)
        Q = P[sorted(visto)]
        d = np.abs(Q[:, 0] - cx)
        if len(Q) > 4000 or np.ptp(d) <= 0:             # no es una isla: la ceja sigue unida a la piel
            continue
        for h, u in ((f'ceja_in.{s}', 0.15), (f'ceja_out.{s}', 0.85)):
            out[h] = Q[np.argmin(np.abs(d - (d.min() + u * np.ptp(d))))]
    return out


def rehacer_nariz_cejas(cara):
    """rehace solo los ajustes de nariz y cejas de una cara ya construida (sin tocar los de boca, mejillas ni los valores
    guardados en las expresiones). Devuelve las anclas nuevas."""
    ctrl = BI.control(cara)
    if ctrl is None:
        raise RuntimeError('Falta el control FACS de la cara')
    me = cara.data
    P = np.zeros(len(me.vertices) * 3)
    me.shape_keys.key_blocks[0].data.foreach_get('co', P)
    P = P.reshape(-1, 3)
    H = {h: P[np.linalg.norm(P - c, axis=1).argmin()] for h, c in _pos_reposo(cara).items()}
    cL, cR = H['comisura.L'], H['comisura.R']
    hw = np.linalg.norm(cL - cR) / 2
    cx = (cL[0] + cR[0]) / 2
    esc = hw / 0.0135
    ojo = np.linalg.norm(H['ceja_in.L'] - H['ceja_in.R'])
    H.update(_cejas_malla(cara, P, cx))
    Wlab = _peso_grupos(cara, 'DEF-labio_sup') + _peso_grupos(cara, 'DEF-labio_inf')
    sinpar = 1 - np.clip(_peso_grupos(cara, 'DEF-parp') * 3, 0, 1)
    sinlab = np.clip(1 - Wlab, 0, 1)
    dens = densidad(cara); nc = dens['cejas']; zs = _zonas_de(dens)
    g3 = lambda c, r: _campana(np.linalg.norm(P - c, axis=1), r)
    mask = {}
    for s in ('L', 'R'):
        hi, ho = H[f'ceja_in.{s}'], H[f'ceja_out.{s}']
        if nc == 2:
            mask[f'ceja_in_{s}'] = g3(hi, 0.32 * ojo) * sinpar
            mask[f'ceja_out_{s}'] = g3(ho, 0.32 * ojo) * sinpar
        else:
            r = 0.65 * np.linalg.norm(ho - hi) / (nc - 1)
            for n_, u in _pts_ceja(s, nc):
                c_ = P[np.linalg.norm(P - (hi + (ho - hi) * u), axis=1).argmin()]
                mask[n_] = g3(c_, r) * sinpar
        mask[f'nariz_{s}'] = g3(H[f'CTRL_nariz.{s}'], 0.18 * ojo) * sinlab
    mid = (H['CTRL_nariz.L'] + H['CTRL_nariz.R']) / 2
    cerca = (np.abs(P[:, 0] - mid[0]) < 0.2 * hw) & (np.abs(P[:, 2] - mid[2]) < 0.6 * hw)
    mask['nariz_punta'] = g3(P[cerca][P[cerca][:, 1].argmin()] if cerca.any() else mid, 0.3 * hw) * sinlab
    sgn = 1.0 if cL[0] > cR[0] else -1.0
    anclas = dict(cara.get('aj_anclas', {}))
    for z, m in mask.items():
        if z not in zs:
            continue
        mm = MM[next(k for k in MM if z.startswith(k))] * esc / 1000
        lado = sgn if z.endswith('_L') else -sgn if z.endswith('_R') else 0.0
        for d in zs[z][2]:
            v = {'arriba': (0, 0, 1), 'adelante': (0, -1, 0), 'afuera': (lado, 0, 0), 'derecha': (1, 0, 0)}[d]
            poner_key(cara, nombre(z, d), m[:, None] * np.array(v) * mm, 0.0, (-1.0, 1.0))
        anclas[z] = int(np.argmax(m))
    cara['aj_anclas'] = anclas
    return {z: anclas[z] for z in mask if z in anclas}


def _peso_grupos(cara, prefijo):
    n = len(cara.data.vertices)
    w = np.zeros(n)
    idx = {g.index for g in cara.vertex_groups if g.name.startswith(prefijo)}
    if not idx:
        return w
    for v in cara.data.vertices:
        for g in v.groups:
            if g.group in idx:
                w[v.index] += g.weight
    return np.clip(w, 0, 1)


def _campana(d, r):
    t = np.clip(d / r, 0, 1)
    return (1 - t * t) ** 2


def asegurar_bordes(cara):
    """Añade dos controles inferiores sin regenerar los ajustes/expresiones existentes."""
    ctrl = BI.control(cara)
    if ctrl is None or cara.data.shape_keys is None:
        return []
    kb = cara.data.shape_keys.key_blocks
    nombres = [nombre(f'labio_borde_inf_{s}', d) for s in ('L', 'R') for d in ('arriba', 'adelante')]
    pendientes = [n for n in nombres if n not in kb]
    if not pendientes and cara.get('aj_anclas_labios_version', 0) >= 2:
        return []
    # Primero valida toda la superficie. Nunca usa un máximo de pesos como posición anatómica.
    from . import anclas_labios
    anclas_labios.aplicar(cara, sys.modules[__name__], rehacer_bordes=True)
    for k in nombres:
        prop = 'v_' + k
        if prop not in ctrl:
            ctrl[prop] = 0.0
        ctrl.id_properties_ui(prop).update(min=-1., max=1., soft_min=-1., soft_max=1.)
        path = f'key_blocks["{k}"].value'
        ad = cara.data.shape_keys.animation_data
        if not ad or not any(f.data_path == path for f in ad.drivers):
            dr = kb[k].driver_add('value').driver
            dr.type = 'SCRIPTED'
            var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
            var.targets[0].id_type = 'OBJECT'; var.targets[0].id = ctrl
            var.targets[0].data_path = f'["{prop}"]'
            dr.expression = 'v'
    return pendientes


def asegurar_horizontal(cara, rehacer=False):
    """Añade solo X a los puntos labiales, reutilizando su máscara vertical existente."""
    ctrl = BI.control(cara)
    sk = cara.data.shape_keys
    if ctrl is None or sk is None:
        return []
    kb = sk.key_blocks
    base = np.empty(len(cara.data.vertices) * 3)
    kb[0].data.foreach_get('co', base)
    base = base.reshape(-1, 3)
    hechos = []
    for z in zonas(cara):
        if not z.startswith('labio_'):
            continue
        vertical, n = nombre(z, 'arriba'), nombre(z, 'derecha')
        if vertical not in kb:
            continue
        if n not in kb or rehacer:
            co = np.empty(base.size); kb[vertical].data.foreach_get('co', co)
            delta = np.zeros_like(base)
            delta[:, 0] = co.reshape(-1, 3)[:, 2] - base[:, 2]
            valor = kb[n].value if n in kb else 0.
            poner_key(cara, n, delta, valor, (-1., 1.))
            hechos.append(n)
        prop = 'v_' + n
        if prop not in ctrl:
            ctrl[prop] = 0.
        ctrl.id_properties_ui(prop).update(min=-1., max=1., soft_min=-1., soft_max=1.)
        path = f'key_blocks["{n}"].value'
        if not sk.animation_data or not any(f.data_path == path for f in sk.animation_data.drivers):
            dr = kb[n].driver_add('value').driver; dr.type = 'SCRIPTED'
            var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
            var.targets[0].id_type = 'OBJECT'; var.targets[0].id = ctrl
            var.targets[0].data_path = f'["{prop}"]'; dr.expression = 'v'
    return hechos


def crear(cara):
    if cara.get('rlb_manual_activo', False):
        raise RuntimeError('Vuelve a Automático antes de regenerar los ajustes')
    ctrl = BI.control(cara)
    if ctrl is None:
        raise RuntimeError('Falta el control FACS de la cara')
    me = cara.data
    from . import mascaras_labios
    nueva_localidad = (not me.shape_keys or not any(k.name.startswith('aj_labio_') for k in me.shape_keys.key_blocks)
                       or cara.get('aj_mascaras_labios_version') == mascaras_labios.VERSION)
    P = np.zeros(len(me.vertices) * 3)
    (me.shape_keys.key_blocks[0].data if me.shape_keys else me.vertices).foreach_get('co', P)
    P = P.reshape(-1, 3)
    H = _pos_reposo(cara)
    for h, c in list(H.items()):          # las guías (p. ej. mejillas) pueden flotar delante: se pegan a la piel
        H[h] = P[np.linalg.norm(P - c, axis=1).argmin()]
    cL, cR = H['comisura.L'], H['comisura.R']
    hw = np.linalg.norm(cL - cR) / 2
    cx = (cL[0] + cR[0]) / 2
    esc = hw / 0.0135
    ojo = np.linalg.norm(H['ceja_in.L'] - H['ceja_in.R']) if 'ceja_in.L' in H else hw * 2
    H.update(_cejas_malla(cara, P, cx))
    Wsup, Winf = _peso_grupos(cara, 'DEF-labio_sup'), _peso_grupos(cara, 'DEF-labio_inf')
    Wpar = np.clip(_peso_grupos(cara, 'DEF-parp') * 3, 0, 1)
    sinpar = 1 - Wpar
    sinlab = np.clip(1 - Wsup - Winf, 0, 1)
    dx = P[:, 0] - cx

    def g3(c, r):
        return _campana(np.linalg.norm(P - c, axis=1), r)

    def gx(x0, r):
        return _campana(np.abs(dx - x0), r)

    sgn = {'L': 1.0 if cL[0] > cR[0] else -1.0}
    sgn['R'] = -sgn['L']
    mask = {}
    dens = densidad(cara)
    nl, nc = dens['boca'] // 2, dens['cejas']
    zs = _zonas_de(dens)
    for lab, W in (('sup', Wsup), ('inf', Winf)):
        if nl == 3:
            mask[f'labio_{lab}_centro'] = W * gx(0, 0.33 * hw)     # 0,33: redondea la punta sin hacer una «M»
            mask[f'labio_{lab}_L'] = W * gx(sgn['L'] * 0.6 * hw, 0.42 * hw)
            mask[f'labio_{lab}_R'] = W * gx(sgn['R'] * 0.6 * hw, 0.42 * hw)
        else:                  # reparto uniforme entre ±0,85·hw; radio 0,65·espaciado (se solapan lo justo)
            r = 0.65 * 1.7 * hw / (nl - 1)
            for n_, x in _pts_labio(lab, nl):
                mask[n_] = W * gx(sgn['L'] * x * hw, r)
    for s, c in (('L', cL), ('R', cR)):
        extremo = f'labio_inf_{s}' if nl == 3 else f'labio_inf_{nl if s == "L" else 1}'
        inferior = P[int(np.argmax(mask[extremo]))]
        objetivo = c * 0.55 + inferior * 0.45
        mask[f'labio_borde_inf_{s}'] = Winf * g3(objetivo, 0.28 * hw)
    for s, c in (('L', cL), ('R', cR)):
        mask[f'comisura_{s}'] = g3(c, 0.5 * hw) * sinpar
        hi, ho = H.get(f'ceja_in.{s}'), H.get(f'ceja_out.{s}')
        if hi is not None and ho is not None:
            if nc == 2:
                mask[f'ceja_in_{s}'] = g3(hi, 0.32 * ojo) * sinpar
                mask[f'ceja_out_{s}'] = g3(ho, 0.32 * ojo) * sinpar
            else:
                r = 0.65 * np.linalg.norm(ho - hi) / (nc - 1)
                for n_, u in _pts_ceja(s, nc):
                    c_ = hi + (ho - hi) * u
                    c_ = P[np.linalg.norm(P - c_, axis=1).argmin()]
                    mask[n_] = g3(c_, r) * sinpar
        h = H.get(f'mejilla.{s}')
        if h is not None:
            mask[f'mejilla_{s}'] = g3(h, 0.5 * ojo) * sinpar * sinlab
        h = H.get(f'CTRL_nariz.{s}')
        if h is not None:
            mask[f'nariz_{s}'] = g3(h, 0.18 * ojo) * sinlab
    if 'CTRL_nariz.L' in H and 'CTRL_nariz.R' in H:
        mid = (H['CTRL_nariz.L'] + H['CTRL_nariz.R']) / 2
        cerca = (np.abs(P[:, 0] - mid[0]) < 0.2 * hw) & (np.abs(P[:, 2] - mid[2]) < 0.6 * hw)
        pn = P[cerca][P[cerca][:, 1].argmin()] if cerca.any() else mid
        mask['nariz_punta'] = g3(pn, 0.3 * hw) * sinlab
    pm = H['labio_inf'] + np.array([0, 0, -0.9 * hw])
    mask['menton'] = g3(pm, 0.75 * hw) * np.clip(1 - Wsup - 0.5 * Winf, 0, 1)

    hechos = []
    for z, (_, _, ds) in zs.items():
        if z not in mask:
            continue
        m = mask[z][:, None]
        tipo = next(k for k in MM if z.startswith(k))
        mm = MM[tipo] * esc / 1000
        lado = sgn['L'] if z.endswith('_L') else sgn['R'] if z.endswith('_R') else 0.0
        for d in ds:
            v = {'arriba': (0, 0, 1), 'adelante': (0, -1, 0), 'afuera': (lado, 0, 0), 'derecha': (1, 0, 0)}[d]
            k = nombre(z, d)
            poner_key(cara, k, m * np.array(v) * mm, 0.0, (-1.0, 1.0))
            hechos.append(k)
    # forma de la boca entera (ancho y tamaño), alrededor del centro de la boca
    cb = (cL + cR) / 2
    mb = (g3(cb, 1.35 * hw) * sinpar)[:, None]
    mmb = MM['boca'] * esc / 1000
    rel = (P - cb) / hw
    poner_key(cara, 'aj_boca_ancho', mb * np.stack([rel[:, 0], 0 * rel[:, 0], 0 * rel[:, 0]], 1) * mmb, 0.0, (-1.0, 1.0))
    poner_key(cara, 'aj_boca_tamano', mb * np.stack([rel[:, 0], 0 * rel[:, 0], rel[:, 2]], 1) * mmb, 0.0, (-1.0, 1.0))
    hechos += ['aj_boca_ancho', 'aj_boca_tamano']
    # dónde dibujar cada punto en el editor: el vértice más pesado de su zona
    from . import ajustes_ojos as AO
    oculares = {z: int(a) for z, a in cara.get('aj_anclas', {}).items() if z in AO.ZONAS}
    cara['aj_anclas'] = dict(oculares, **{z: int(np.argmax(mask[z])) for z in zs if z in mask})
    _quitar_sobrantes(cara, ctrl)
    # canales y drivers
    sk = me.shape_keys
    for k in hechos:
        p = f'v_{k}'
        if p not in ctrl.keys():
            ctrl[p] = 0.0
        ctrl.id_properties_ui(p).update(min=-1.0, max=1.0, soft_min=-1.0, soft_max=1.0)
        path = f'key_blocks["{k}"].value'
        if sk.animation_data:
            for f in list(sk.animation_data.drivers):
                if f.data_path == path:
                    sk.animation_data.drivers.remove(f)
        fc = sk.key_blocks[k].driver_add('value'); dr = fc.driver; dr.type = 'SCRIPTED'
        var = dr.variables.new(); var.name = 'v'; var.type = 'SINGLE_PROP'
        var.targets[0].id_type = 'OBJECT'; var.targets[0].id = ctrl; var.targets[0].data_path = f'["{p}"]'
        dr.expression = 'v'
    from . import anclas_labios
    anclas_labios.aplicar(cara, sys.modules[__name__], rehacer_bordes=True)
    asegurar_horizontal(cara, rehacer=True)
    # Solo la ruta de generación explícita: nunca al abrir o reanudar un rig existente.
    if nueva_localidad:
        mascaras_labios.actualizar(cara, aplicar=True)
    return {'ajustes': len(hechos), 'media_boca_mm': round(hw * 1000, 1), 'escala': round(esc, 3)}
