# Validación NUMÉRICA (0.8.2): lo que antes había que mirar en una foto para saber si estaba bien. Una persona ve de un vistazo
# un marcador fuera de sitio o una boca que no cierra; un modelo gasta una imagen entera (y una llamada) en lo mismo. Estas
# funciones lo miden y dicen «ok» o qué falla; solo si falla hace falta abrir la foto.
#   marcadores(cara)  proporciones de los marcadores respecto a Vale (en anchuras de boca, hw) y a la propia cara
#   visemas(cara)     abertura y anchura de la boca en A E I O U MBP FV (cara FACS terminada)
# Los dos asumen el personaje en el origen (posicion.en_origen).
import bpy
import numpy as np
from mathutils import Vector
from . import marco as MK, util

# desviaciones máximas (en hw) respecto a las proporciones de Vale; se calibraron con cinco personajes ya aprobados
# (Tronchatoro, Carlitos, Kakashi, Tronchatoro-antes, Ichigo con el pivote corregido) con el doble de margen.
TOL_OJO = 2.2
TOL_MENTON = 1.6
JAW_Y_MIN, JAW_Y_MAX = 1.4, 6.5        # el pivote va detrás de la boca: delante de la oreja


def _W(cara, k):
    o = bpy.data.objects.get(MK.nombre_marca(cara, k))
    return o.matrix_world.translation.copy() if o is not None else None


def marcadores(cara):
    """-> {'ok', 'problemas': [frases], 'medidas': {...}}. Sin render."""
    M = MK.Marco(cara)
    hw = M.hw
    mc = M.mc
    r = lambda v: [round(float(x) / hw, 2) for x in v]
    prob = []
    med = {'hw_mm': round(hw * 1000, 1)}
    cl, cr = _W(cara, 'comisura.L'), _W(cara, 'comisura.R')
    if cl is not None and cr is not None and abs(cl.x + cr.x) > 0.25 * hw:
        prob.append('Las comisuras no son simétricas respecto a X=0 (L y R).')
    ls, li = M.labio_sup, M.labio_inf
    med['labio_sup-mc'] = r(ls - mc); med['labio_inf-mc'] = r(li - mc)
    if not (ls.z > li.z):
        prob.append('labio_sup no está por encima de labio_inf.')
    if abs(ls.x) > 0.3 * hw or abs(li.x) > 0.3 * hw:
        prob.append('Los labios no están en el centro (x = 0).')
    if not (li.z - 0.8 * hw < mc.z < ls.z + 0.8 * hw):
        prob.append('Las comisuras no están a la altura de los labios.')
    # ojos
    for lado in ('L', 'R'):
        if lado in M.ojos:
            p, rad = M.ojos[lado]
            esp = M.P(*MK.OJO_V); esp.x *= (1 if lado == 'L' else -1)
            d = (p - mc)
            med['ojo.' + lado] = r(d)
            med['radio_ojo.' + lado] = round(rad / hw, 2)
            if d.z < 1.2 * hw or d.z > 6.5 * hw:
                prob.append(f'ojo.{lado}: la altura sobre la boca ({d.z / hw:.1f} hw) no es la de una cara.')
            if abs(abs(d.x) - abs(esp.x - mc.x)) > TOL_OJO * hw:
                prob.append(f'ojo.{lado}: separación lateral rara ({abs(d.x) / hw:.1f} hw).')
            if not 0.4 * hw < rad < 2.2 * hw:
                prob.append(f'ojo.{lado}: el radio ({rad / hw:.1f} hw) no es el de un globo.')
            if d.y > 1.5 * hw:
                prob.append(f'ojo.{lado}: está detrás de la boca (y).')
    if 'L' in M.ojos and 'R' in M.ojos and abs(M.ojos['L'][0].z - M.ojos['R'][0].z) > 0.5 * hw:
        prob.append('Los dos ojos no están a la misma altura.')
    # mandíbula y mentón
    jaw, men = M.jaw_piv, M.jaw_end
    med['mandibula-mc'] = r(jaw - mc); med['menton-mc'] = r(men - mc)
    dy = (jaw.y - mc.y) / hw
    if not JAW_Y_MIN <= dy <= JAW_Y_MAX:
        prob.append(f'mandibula: el pivote está a {dy:.1f} hw detrás de la boca (debe estar delante de la oreja, entre '
                    f'{JAW_Y_MIN} y {JAW_Y_MAX}): la mandíbula giraría mal y la boca abierta se desgarra.')
    if not (mc.z - 1.0 * hw < jaw.z < M.ojos['L'][0].z + 1.0 * hw if 'L' in M.ojos else True):
        prob.append('mandibula: la altura del pivote no está entre la boca y los ojos.')
    if men.z > li.z - 0.8 * hw:
        prob.append('menton: no está debajo del labio inferior.')
    esp_men = M.P(*MK.JAW_END_V)
    if abs(men.z - esp_men.z) > TOL_MENTON * hw + 0.5 * hw:
        prob.append(f'menton: altura rara ({(men.z - mc.z) / hw:.1f} hw bajo la boca; Vale {(esp_men.z - mc.z) / hw:.1f}).')
    # sobre la piel: los marcadores de labios y comisuras tienen que estar pegados a algún vértice
    try:
        P = util.coords(cara.data)
        kd = util.kd_de(P, range(len(P)))
        for k, p in (('labio_sup', ls), ('labio_inf', li), ('comisura.L', cl)):
            if p is None:
                continue
            _, _, d = kd.find(Vector(p))
            if d > 0.6 * hw:
                prob.append(f'{k}: está a {d / hw:.1f} hw de la malla (flotando o dentro).')
    except Exception:
        pass
    return {'ok': not prob, 'problemas': prob, 'medidas': med}


# ------------------------------------------------------------------ visemas
def _idx(kd, p):
    return kd.find(Vector(p))[1]


def _evaluada(cara):
    dg = bpy.context.evaluated_depsgraph_get()
    e = cara.evaluated_get(dg)
    me = e.to_mesh()
    P = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', P)
    e.to_mesh_clear()
    return P.reshape(-1, 3)


def visemas(cara):
    """mide la boca en cada visema con la cara FACS (aplica los pesos y lo deja todo como estaba).
    -> {'ok', 'problemas', 'medidas': {visema: {'abertura_hw', 'ancho_hw', 'adelanto_hw'}}}. Sin render."""
    from .facs import biblioteca as BI
    ctrl = BI.control(cara)
    if ctrl is None:
        raise RuntimeError('Esta cara no tiene el control FACS (termina antes la línea).')
    M = MK.Marco(cara)
    hw = M.hw
    lib = BI.cargar()['visemas']
    adc = ctrl.animation_data
    act_c = adc.action if adc else None
    slot_c = adc.action_slot if (adc and act_c) else None
    vals = {k: float(ctrl[k]) for k in ctrl.keys() if k.startswith('v_') and isinstance(ctrl[k], (int, float))}
    out = {}
    try:
        if act_c:
            adc.action = None
        BI.aplicar(cara, {'pesos': {}})
        bpy.context.view_layer.update()
        P0 = _evaluada(cara)
        kd = util.kd_de(P0, range(len(P0)))
        i_s, i_i = _idx(kd, M.labio_sup), _idx(kd, M.labio_inf)
        i_l, i_r = _idx(kd, M.comisura), _idx(kd, Vector((-M.comisura.x, M.comisura.y, M.comisura.z)))

        def medir(P):
            return {'abertura_hw': float(P[i_s, 2] - P[i_i, 2]) / hw,
                    'ancho_hw': float(np.linalg.norm(P[i_l] - P[i_r])) / hw,
                    'adelanto_hw': float(-(P[i_s, 1] + P[i_i, 1]) / 2) / hw}
        base = medir(P0)
        out['reposo'] = base
        for clave in ('A', 'E', 'I', 'O', 'U', 'MBP', 'FV'):
            BI.aplicar(cara, {'pesos': lib[clave]})
            bpy.context.view_layer.update()
            out[clave] = medir(_evaluada(cara))
    finally:
        for k, v in vals.items():
            try:
                ctrl[k] = v
            except Exception:
                pass
        if adc and act_c:
            adc.action = act_c
            if slot_c is not None:
                try:
                    adc.action_slot = slot_c
                except Exception:
                    pass
        ctrl.update_tag()
        bpy.context.view_layer.update()
    prob = []
    b = out['reposo']
    r = lambda c, k: out[c][k] - b[k]
    if r('A', 'abertura_hw') < 0.25:
        prob.append(f"A: la boca casi no se abre (+{r('A', 'abertura_hw'):.2f} hw).")
    if r('MBP', 'abertura_hw') > 0.05:
        prob.append(f"MBP: los labios no cierran (+{r('MBP', 'abertura_hw'):.2f} hw respecto al reposo).")
    if out['MBP']['abertura_hw'] > 0.45 * max(out['A']['abertura_hw'], 1e-6):
        prob.append('MBP: abertura demasiado grande frente a la A.')
    for c in ('O', 'U'):
        if r(c, 'ancho_hw') > -0.05:
            prob.append(f'{c}: la boca no se estrecha ({r(c, "ancho_hw"):+.2f} hw).')
        if r(c, 'adelanto_hw') < 0.03:
            prob.append(f'{c}: los labios no se adelantan ({r(c, "adelanto_hw"):+.2f} hw).')
    for c in ('E', 'I'):
        if r(c, 'ancho_hw') < 0.05:
            prob.append(f'{c}: la boca no se estira ({r(c, "ancho_hw"):+.2f} hw).')
    return {'ok': not prob, 'problemas': prob,
            'medidas': {k: {m: round(x, 2) for m, x in v.items()} for k, v in out.items()}}
