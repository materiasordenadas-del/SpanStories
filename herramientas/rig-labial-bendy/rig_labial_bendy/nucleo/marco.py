# Marco de medidas: todo lo que en el rig de Vale eran números fijos (en metros, para un personaje de 1 m)
# se expresa aquí respecto a la boca de Vale y se escala a la boca del personaje nuevo.
#   P(x, y, z): punto de Vale -> punto equivalente en el personaje (centro de la boca + escala)
#   L(d): longitud de Vale -> longitud equivalente
# Los marcadores (empties RLB_<cara>_*) son la fuente de verdad: se detectan solos y se pueden mover.
import bpy, json, logging
from mathutils import Vector
from . import eje_boca

# --- plantilla: Vale (Vale 2 - rig labios.blend)
MC_V = Vector((0.0, -0.0291, 0.8408))     # punto medio entre las comisuras
HW_V = 0.0139                              # media anchura de la boca (centro -> comisura)
OJO_V = Vector((0.02386, -0.0024, 0.8851)) # centro del ojo L
R_OJO_V = 0.0205                           # radio del globo
JAW_PIV_V = Vector((0.0, 0.030, 0.858))
JAW_END_V = Vector((0.0, -0.028, 0.813))

MARCAS = ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf', 'mandibula', 'menton', 'ojo.L', 'ojo.R')


def nombre_marca(cara, k):
    return f'RLB_{cara.name}_{k}'


def coleccion_marcas(cara):
    return f'RLB {cara.name} marcadores'


def cfg(cara):
    texto = cara.get('rlb_cfg', '{}')
    try:
        return json.loads(texto)
    except Exception as e:
        # no tragarse el error: la próxima guardar_cfg escribiría {} encima. Se guarda una copia y se avisa.
        # se avisa una sola vez (el panel llama a cfg en cada redibujado)
        if 'rlb_cfg_corrupto' not in cara:
            cara['rlb_cfg_corrupto'] = str(texto)
            logging.getLogger('rig_labial_bendy').warning(
                'la configuración de %s (rlb_cfg) no se puede leer (%s); se sigue con una vacía y el texto original '
                'queda en la propiedad rlb_cfg_corrupto', cara.name, e)
        return {}


def guardar_cfg(cara, d):
    cara['rlb_cfg'] = json.dumps(d)


def nombres(cara):
    b = cara.name
    return {'rig': f'{b}_Rig_Labios', 'dientes_sup': f'{b}_Dientes_sup', 'dientes_inf': f'{b}_Dientes_inf',
            'lengua': f'{b}_Lengua', 'fondo': f'{b}_Boca_Fondo', 'respaldo': f'{b}_malla_respaldo_rlb',
            'ojos_raiz': f'{b}_Ojos_ROOT', 'piv_L': f'{b}_OjoPivote_L', 'piv_R': f'{b}_OjoPivote_R',
            'mat_dientes': f'{b}_Dientes', 'mat_lengua': f'{b}_Lengua', 'mat_interior': f'{b}_Boca_Interior',
            'mat_fondo': f'{b}_Boca_Fondo'}


class Marco:
    def __init__(self, cara):
        self.cara = cara
        self.cfg = cfg(cara)
        bpy.context.view_layer.update()        # matrix_world de los empties recién movidos
        m = {}
        for k in MARCAS:
            o = bpy.data.objects.get(nombre_marca(cara, k))
            if o is not None:
                m[k] = o
        faltan = [k for k in ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf') if k not in m]
        if faltan:
            raise RuntimeError('Faltan marcadores: ' + ', '.join(faltan) + ' (paso «Detectar marcadores»)')
        W = lambda k: m[k].matrix_world.translation.copy()
        cl, cr = W('comisura.L'), W('comisura.R')
        # La boca usa el eje real entre marcadores; ojos permanecen en el marco legado (pendiente).
        self.cx, self.hw = eje_boca.centro_y_semiancho(cl.x, cr.x)
        self.s = self.hw / HW_V
        self.mc = Vector((self.cx, (cl.y + cr.y) / 2, (cl.z + cr.z) / 2))
        self.comisura = cl.copy()
        self.labio_sup = W('labio_sup')
        self.labio_inf = W('labio_inf')
        self.jaw_piv = W('mandibula') if 'mandibula' in m else self.P(*JAW_PIV_V)
        self.jaw_end = W('menton') if 'menton' in m else self.P(*JAW_END_V)
        self.jaw_piv.x = self.jaw_end.x = self.cx
        self.ojos = {}
        for s, sx in (('L', 1), ('R', -1)):
            key = 'ojo.' + s
            if key in m:
                # Cada marcador conserva centro y radio independientes; no asumir espejo ni eje X=0.
                self.ojos[s] = (W(key), m[key].empty_display_size * max(m[key].scale))
            else:
                # Compatibilidad por lado cuando falta el marcador ocular correspondiente.
                self.ojos[s] = (Vector((self.cx + sx * abs(OJO_V.x) * self.s,
                                        self.mc.y + (OJO_V.y - MC_V.y) * self.s,
                                        self.mc.z + (OJO_V.z - MC_V.z) * self.s)), R_OJO_V * self.s)
        self.n = nombres(cara)

    # --- mapeo desde Vale
    def P(self, x, y, z):
        return self.mc + (Vector((x, y, z)) - MC_V) * self.s

    def L(self, d):
        return d * self.s

    def X(self, x):
        return x * self.s

    def Yc(self, y):
        return self.mc.y + (y - MC_V.y) * self.s

    def Zc(self, z):
        return self.mc.z + (z - MC_V.z) * self.s

    # --- ojos
    def se(self):
        if not self.ojos:
            return self.s
        return self.ojos['L'][1] / R_OJO_V

    def ojo(self, lado):
        return self.ojos[lado]
