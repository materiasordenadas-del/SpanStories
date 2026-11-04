# Editor de expresiones, pensado para quien no conoce Blender. Pestaña «Expresiones» de la barra lateral del visor 3D
# (tecla N), a la derecha:
#   - eliges la expresión (◀ ▶ para pasar a la anterior/siguiente) y pulsas «Empezar a editar»;
#   - a la izquierda, botones por sección de la cara (cejas, ojos, labio superior…); a la derecha, sus deslizadores;
#   - cada cambio se guarda al momento SOLO en esa expresión (la acción <cara>_FACS_<expr>); la malla no se toca;
#   - «Volver al original» deshace todo lo que se haya cambiado en esa expresión (la primera vez que se edita se
#     guarda una copia del original dentro de la propia acción), «Ver original» compara mientras está pulsado;
#   - «Intensidad» hace toda la expresión más o menos pronunciada; «Mover los dos lados a la vez» enlaza izq./der.;
#   - al terminar, el control vuelve a su animación de antes (habla, pruebas).
# Además de los canales ARKit hay «ajustes finos» por zona (ajustes.py): shape keys suaves de −100 % a +100 %.
import bpy, json, math, time, os
import numpy as np
import gpu
from gpu_extras.batch import batch_for_shader
from bpy.props import (StringProperty, FloatProperty, BoolProperty, CollectionProperty, PointerProperty, EnumProperty)
from mathutils import Euler, Vector
from bpy.app.handlers import persistent
from . import biblioteca as BI
from .. import util
from . import poses as PO

SECCIONES = [
    ('cejas', 'Cejas', '', 'HIDE_OFF', 0),
    ('ojos', 'Párpados', '', 'HIDE_OFF', 1),
    ('mejillas', 'Mejillas', '', 'USER', 2),
    ('nariz', 'Nariz', '', 'USER', 3),
    ('labio_sup', 'Labio de arriba', '', 'TRIA_UP', 4),
    ('labio_inf', 'Labio de abajo', '', 'TRIA_DOWN', 5),
    ('comisuras', 'Sonrisa y comisuras', '', 'MOD_SMOOTH', 6),
    ('boca', 'Forma de la boca', '', 'MESH_CIRCLE', 7),
    ('mandibula', 'Mandíbula y lengua', '', 'TRIA_DOWN_BAR', 8),
]
# canal ARKit (sin lado) -> (texto, sección)
CANALES = {
    'browInnerUp': ('Subir ceja (interior)', 'cejas'), 'browOuterUp': ('Subir ceja (exterior)', 'cejas'),
    'browDown': ('Fruncir ceja', 'cejas'),
    'eyeBlink': ('Parpadeo', 'ojos'), 'eyeSquint': ('Tensar párpado inferior', 'ojos'), 'eyeWide': ('Abrir mucho', 'ojos'),
    'lidAngry': ('Párpado enojado', 'ojos'), 'lidSad': ('Párpado triste', 'ojos'),
    'eyeLookUp': ('Mirar arriba', 'ojos'), 'eyeLookDown': ('Mirar abajo', 'ojos'),
    'cheekSquint': ('Subir mejilla', 'mejillas'), 'cheekPuff': ('Inflar mejillas', 'mejillas'),
    'noseSneer': ('Arrugar nariz', 'nariz'),
    'mouthUpperUp': ('Subir labio de arriba', 'labio_sup'), 'mouthShrugUpper': ('Labio de arriba hacia afuera', 'labio_sup'),
    'mouthRollUpper': ('Meter labio de arriba', 'labio_sup'),
    'mouthLowerDown': ('Bajar labio de abajo', 'labio_inf'), 'mouthShrugLower': ('Subir labio de abajo (puchero)', 'labio_inf'),
    'mouthRollLower': ('Meter labio de abajo', 'labio_inf'),
    'mouthSmile': ('Sonrisa', 'comisuras'), 'mouthFrown': ('Comisura hacia abajo', 'comisuras'),
    'mouthStretch': ('Estirar boca', 'comisuras'), 'mouthDimple': ('Hoyuelo', 'comisuras'),
    'mouthPress': ('Apretar labios', 'comisuras'),
    'mouthFunnel': ('Boca en O', 'boca'), 'mouthPucker': ('Beso (U)', 'boca'), 'mouthClose': ('Cerrar labios', 'boca'),
    'mouthLeft': ('Boca a la izquierda', 'boca'), 'mouthRight': ('Boca a la derecha', 'boca'),
    'jawOpen': ('Abrir boca', 'mandibula'), 'tongueOut': ('Sacar lengua', 'mandibula'), 'tongueUp': ('Lengua arriba', 'mandibula'),
}
LADO = {'L': 'izq.', 'R': 'der.'}
AMBOS = (('Lado izquierdo', 'Los dos lados'), ('Lado derecho', 'Los dos lados'), ('Comisura izquierda', 'Las dos comisuras'),
         ('Comisura derecha', 'Las dos comisuras'), ('Ceja izq.', 'Las dos cejas'), ('Ceja der.', 'Las dos cejas'),
         ('Mejilla izquierda', 'Las dos mejillas'), ('Mejilla derecha', 'Las dos mejillas'),
         ('Aleta izquierda', 'Las dos aletas'), ('Aleta derecha', 'Las dos aletas'))
_bloqueo = [False]
_modal_vivo = [False]    # hay un arrastre con el ratón escuchando
_hover = ['']             # círculo bajo el cursor
_arr = {}                 # arrastre en curso
_rapido = []              # modificadores pausados SOLO durante el gesto
_pesos_cache = {}
_expr_items = {}


def _ajustes():
    from . import ajustes as AJ
    return AJ


def _info(canal, cara=None):
    """(texto, sección, lado, pareja) de un canal."""
    if canal.startswith('br_'):
        return 'Base regional', 'boca', '', ''
    from . import ajustes_ojos as AO
    if AO.es_basal(canal):
        parte, lado = canal.split('_')[1:3]
        return ('Basal superior' if parte == 'sup' else 'Basal inferior'), 'ojos', lado, ''
    if canal.startswith('pp_'):
        return 'Retoque de los párpados de esta expresión (hecho a mano)', 'ojos', '', ''
    if canal.startswith('aj_'):
        AJ = _ajustes()
        if canal in AJ.MODELAR:
            txt, sec, pos, neg = AJ.MODELAR[canal]
            return txt, sec, '', ''
        for z, (txt, sec, ds) in AJ.zonas(cara).items():
            for d in ds:
                if canal == AJ.nombre(z, d):
                    pos, neg = AJ.TEXTO_DIR[d]
                    lado, pz = AJ.lado_par(z, cara)
                    par = AJ.nombre(pz, d) if pz else ''
                    return f'{txt}: {pos} / {neg}', sec, lado, par
        return canal, 'boca', '', ''
    base, lado = canal, ''
    if canal[-2:] in ('_L', '_R'):
        base, lado = canal[:-2], canal[-1]
    txt, sec = CANALES.get(base, (base, 'boca'))
    par = (base + ('_R' if lado == 'L' else '_L')) if lado else ''
    return txt, sec, lado, par


def _cara(context):
    if context is None:
        return None
    ed = getattr(context.scene, 'rlb_editor', None)
    if ed is not None and ed.activo:
        ctrl = _ctrl(ed)
        if ctrl is not None:
            nombre = ctrl.get('facs_cara') or ctrl.name.removesuffix('_Cara_Control')
            ligada = bpy.data.objects.get(nombre)
            if ligada is not None and ligada.type == 'MESH':
                return ligada
    p = getattr(context.scene, 'rlb', None)
    cara = getattr(p, 'cara', None) if p else None
    if cara is not None and BI.control(cara) is not None:
        return cara
    return PO.cara_de(context)


def _acciones(context):
    cara = _cara(context)
    if cara is None:
        return []
    pre = f'{cara.name}_FACS_'
    return sorted((a for a in bpy.data.actions if a.name.startswith(pre)), key=lambda a: a.name)


def _exprs(self, context):
    cara = _cara(context)
    pre = f'{cara.name}_FACS_' if cara else ''
    it = [(a.name, a.name[len(pre):].replace('_', ' '), '') for a in _acciones(context)]
    # Blender conserva punteros a estos textos: mantenerlos vivos por personaje.
    key = cara.name if cara else ''
    items = it or [('', '(sin expresiones)', '')]
    if _expr_items.get(key) != items:
        _expr_items[key] = items
    return _expr_items[key]


# ------------------------------------------------------------------ escritura en vivo
def _ctrl(ed):
    return bpy.data.objects.get(ed.control)


def _poner_en_cara(context, ed, pesos, mirada):
    ctrl = _ctrl(ed)
    if ctrl is None:
        return
    for k in ctrl.keys():
        if k.startswith('v_'):
            v = float(pesos.get(k[2:], 0.0))
            if abs(float(ctrl[k]) - v) > 1e-7:
                ctrl[k] = v
    ctrl.update_tag()
    cara = _cara(context)
    if cara is not None and cara.get('rlb_labios_seleccion_estado'):
        from . import seleccion_labios as S
        S.mantener(cara)
    if cara is not None and not _arr:
        BI.mirada(cara, mirada[0], mirada[1])
    if not _arr:
        context.view_layer.update()


def _val(c):
    return c.fino if c.ajuste else c.valor


# ------------------------------------------------------------------ «Deshacer último cambio» (pila propia por expresión)
_pilas = {}     # nombre de la acción -> [estados anteriores] (máximo 30)
_h = {'actual': None, 'accion': '', 't': 0.0, 'gesto': False}
MAX_PILA = 30


def _snap(ed):
    return {'c': {c.name: round(_val(c), 3) for c in ed.canales if abs(_val(c)) > 0.0005},
            'i': float(ed.intensidad), 'h': float(ed.mirada_h), 'v': float(ed.mirada_v)}


def _empujar(accion, estado):
    if estado is None:
        return
    pila = _pilas.setdefault(accion, [])
    if pila and pila[-1] == estado:
        return
    pila.append(estado)
    del pila[:-MAX_PILA]


def _nota_cambio(ed):
    """se llama DESPUÉS de cada cambio: si empieza una tanda nueva (0,7 s sin tocar nada) guarda el estado de antes."""
    if _h['accion'] != ed.accion:
        _h.update(accion=ed.accion, actual=None)
    ahora = time.time()
    if _h['actual'] is not None and not _h['gesto'] and ahora - _h['t'] > 0.7:
        _empujar(ed.accion, _h['actual'])
    _h['actual'] = _snap(ed)
    _h['t'] = ahora


def _hist_reiniciar(ed):
    _h.update(accion=ed.accion, actual=_snap(ed), t=0.0, gesto=False)


def _gesto_inicio(ed):
    """empieza un arrastre con el ratón: guarda el estado de antes como UN solo paso."""
    if _h['accion'] != ed.accion or _h['actual'] is None:
        _hist_reiniciar(ed)
    _empujar(ed.accion, _h['actual'])
    _h['inicio'] = _snap(ed)
    _h['gesto'] = True


def _gesto_fin(ed):
    try:
        if _h['gesto'] and _h.get('inicio') != _snap(ed):
            _guardar_accion(ed)
    finally:
        _restaurar_calidad()
    _h.pop('inicio', None)
    _h['gesto'] = False
    _h['actual'] = _snap(ed)
    _h['t'] = time.time()


def deshacer(context, ed):
    """devuelve la expresión al estado anterior. -> True si había algo que deshacer."""
    pila = _pilas.get(ed.accion) or []
    if not pila:
        return False
    st = pila.pop()
    _bloqueo[0] = True
    try:
        for c in ed.canales:
            _poner_val(c, float(st['c'].get(c.name, 0.0)))
        ed.intensidad = st['i']; ed.mirada_h = st['h']; ed.mirada_v = st['v']
    finally:
        _bloqueo[0] = False
    _refrescar(context, ed)
    _h.update(accion=ed.accion, actual=_snap(ed), t=0.0, gesto=False)
    return True


def _poner_val(c, v):
    if c.ajuste:
        c.fino = v
    else:
        c.valor = max(0.0, v)


def _prop(c):
    return 'fino' if c.ajuste else 'valor'


def _actuales(ed):
    return {c.name: _val(c) / 100.0 for c in ed.canales if abs(_val(c)) > 0.05}


def _guardar_accion(ed):
    a = bpy.data.actions.get(ed.accion)
    if a is None:
        return
    ctrl = _ctrl(ed)
    propietario = ctrl.get('facs_cara') or ctrl.name.removesuffix('_Cara_Control') if ctrl else ''
    if not propietario or not a.name.startswith(propietario + '_FACS_'):
        raise RuntimeError('La expresión y el control pertenecen a personajes diferentes')
    PO._guardar(a, _actuales(ed), (ed.mirada_h, ed.mirada_v))
    a['intensidad'] = ed.intensidad / 100.0
    a['rlb_editada'] = True


def _refrescar(context, ed, guardar=True):
    """aplica los deslizadores a la cara (con la intensidad) y guarda en la acción."""
    if not ed.activo or _bloqueo[0]:
        return
    k = ed.intensidad / 100.0
    if ed.ver_original:
        a = bpy.data.actions.get(ed.accion)
        o = dict(a.get('rlb_original', {})) if a else {}
        ko = float(o.get('intensidad', 1.0))
        _poner_en_cara(context, ed, {n: v * ko for n, v in dict(o.get('pesos', {})).items()},
                       [m * ko for m in o.get('mirada', (0.0, 0.0))])
        return
    _poner_en_cara(context, ed, {n: v * k for n, v in _actuales(ed).items()}, (ed.mirada_h * k, ed.mirada_v * k))
    if guardar:
        _guardar_accion(ed)


def _al_cambiar_canal(self, context):
    ed = context.scene.rlb_editor
    if _bloqueo[0] or not ed.activo:
        return
    if ed.enlazar and self.par:
        par = ed.canales.get(self.par)
        reflejado = _val(self) * (-1. if self.name.endswith('_derecha') else 1.)
        if par is not None and abs(_val(par) - reflejado) > 1e-6:
            _bloqueo[0] = True
            try:
                _poner_val(par, reflejado)
            finally:
                _bloqueo[0] = False
    _nota_cambio(ed)
    _refrescar(context, ed)


def _al_cambiar(self, context):
    ed = context.scene.rlb_editor
    if not _bloqueo[0] and ed.activo:
        _nota_cambio(ed)
    _refrescar(context, ed)


def _al_ver_original(self, context):
    _refrescar(context, context.scene.rlb_editor, guardar=False)


class RLB_ExpCanal(bpy.types.PropertyGroup):
    # name = canal (sin «v_»)
    valor: FloatProperty(name='Nivel', subtype='PERCENTAGE', min=0.0, max=100.0, precision=0, update=_al_cambiar_canal)
    fino: FloatProperty(name='Ajuste', subtype='PERCENTAGE', min=-100.0, max=100.0, precision=0, update=_al_cambiar_canal)
    texto: StringProperty()
    seccion: StringProperty()
    lado: StringProperty()
    par: StringProperty()
    ajuste: BoolProperty(default=False)


def _dens_get(parte, opciones):
    def get(self):
        cara = _cara(bpy.context)
        n = _ajustes().densidad(cara)[parte] if cara is not None else opciones[0]
        return opciones.index(n) if n in opciones else 0
    return get


def _dens_set(parte, opciones):
    def set_(self, i):
        cara = _cara(bpy.context)
        if cara is not None and 0 <= i < len(opciones):
            cambiar_densidad(bpy.context, cara, parte, opciones[i])
    return set_


def cambiar_densidad(context, cara, parte, n):
    """más o menos puntos en la boca/cejas: migra las expresiones y recarga la que se está editando."""
    AJ = _ajustes()
    if AJ.densidad(cara)[parte] == n:
        return
    AJ.cambiar_densidad(cara, parte, n)
    _pesos_cache.clear()
    ed = context.scene.rlb_editor
    if ed.activo:
        a = bpy.data.actions.get(ed.accion)
        z = _zona(ed.zona)
        if z is not None:
            ids = [p for f in _rejilla(z[0], cara) for p in f if p]
            if ed.punto not in ids:
                ed.punto = ids[0] if ids else ''
        if a is not None:
            _cargar(context, ed, a)
    _tag_redraw(context)


def puntos_parpado_seleccion(ed, punto=None):
    punto = punto or ed.punto
    partes = punto.split('_')
    if len(partes) != 4 or partes[0] != 'parpado' or partes[1] not in ('sup', 'inf'):
        return []
    if ed.seleccion_parpado == 'punto':
        principales = [punto]
    else:
        from . import ajustes_ojos as AO
        cara = _cara(bpy.context)
        anclas = cara.get('aj_anclas', {}) if cara is not None else {}
        principales = [f'parpado_{ed.seleccion_parpado}_{i}_{partes[3]}'
                       for i in range(1, AO.npuntos(anclas, ed.seleccion_parpado, partes[3]) + 1)]
    if ed.enlazar:
        principales += [p[:-1] + ('R' if p.endswith('L') else 'L') for p in principales]
    return principales


def _al_seleccion_parpado(ed, context):
    if ed.seleccion_parpado in ('sup', 'inf') and ed.punto.startswith('parpado_'):
        partes = ed.punto.split('_')
        ed.punto = f'parpado_{ed.seleccion_parpado}_{partes[2]}_{partes[3]}'
        ed.parte_ojos = ed.seleccion_parpado
    _tag_redraw(context)


def _grupo_bases(ed, punto, direccion):
    AJ = _ajustes(); lado = punto[-1]; resultado = {}
    for p in puntos_parpado_seleccion(ed, punto):
        c = ed.canales.get(AJ.nombre(p, direccion))
        if c is None: raise RuntimeError('Faltan controles del párpado seleccionado')
        resultado[c.name] = (_val(c), -1. if direccion == 'derecha' and p[-1] != lado else 1.)
    return resultado


def _grupo_mover(ed, bases, delta):
    for nombre, (valor, factor) in bases.items():
        c = ed.canales[nombre]
        bajo = -100. if c.ajuste else 0.
        _poner_val(c, max(bajo, min(100., valor + factor * delta)))
    return delta


def _grupo_slider(direccion):
    def get(ed):
        try:
            bases = _grupo_bases(ed, ed.punto, direccion)
            return sum(valor * factor for valor, factor in bases.values()) / len(bases) if bases else 0.
        except RuntimeError:
            return 0.
    def set_(ed, valor):
        if _bloqueo[0] or not ed.activo: return
        bases = _grupo_bases(ed, ed.punto, direccion)
        actual = get(ed)
        _bloqueo[0] = True
        try: _grupo_mover(ed, bases, valor - actual)
        finally: _bloqueo[0] = False
        _nota_cambio(ed); _refrescar(bpy.context, ed)
    return get, set_


def _al_visualizacion(ed, context):
    """Los interruptores recuperan su dibujado y arrastre sin reiniciar el editor."""
    if not hasattr(context.scene, 'rlb_pesos_parpados'):
        from . import pesos_parpados_ui
        pesos_parpados_ui.register()
    if ed.activo:
        if ed.ver_puntos or ed.ver_pesos:
            _asegurar_dibujo()
        if ed.ver_puntos:
            _lanzar_modal()
    _tag_redraw(context)


class RLB_ExpEditor(bpy.types.PropertyGroup):
    expr: EnumProperty(name='', items=_exprs, update=lambda s, c: _cambiar_expr(c))
    activo: BoolProperty(default=False)
    accion: StringProperty()
    control: StringProperty()
    accion_previa: StringProperty()
    slot_previo: StringProperty()
    valores_previos: StringProperty()
    seccion: EnumProperty(name='Sección', items=[s[:4] + (s[4],) for s in SECCIONES])
    enlazar: BoolProperty(name='Simetría', default=True,
                          description='Activa por defecto: mueve los dos lados al arrastrar puntos o usar deslizadores. Desactívala para editar un solo lado')
    ver_original: BoolProperty(name='Ver original', default=False, update=_al_ver_original,
                               description='Muestra la expresión como era antes de tus cambios (no borra nada)')
    intensidad: FloatProperty(name='Intensidad de toda la expresión', subtype='PERCENTAGE', min=0.0, max=200.0,
                              soft_max=150.0, default=100.0, precision=0, update=_al_cambiar,
                              description='Más o menos pronunciada, sin cambiar sus proporciones')
    mirada_h: FloatProperty(name='Mirada izquierda / derecha (grados)', min=-30, max=30, update=_al_cambiar)
    mirada_v: FloatProperty(name='Mirada abajo / arriba (grados)', min=-30, max=30, update=_al_cambiar)
    canales: CollectionProperty(type=RLB_ExpCanal)
    zona: StringProperty(default='boca')            # título grande abierto ('' = todos cerrados)
    parte_ojos: EnumProperty(name='Párpado', items=[('ambos', 'Ambos', 'Mostrar todos los puntos'),
                             ('sup', 'Superior', 'Elegir puntos del párpado superior'),
                             ('inf', 'Inferior', 'Elegir puntos del párpado inferior')], default='ambos',
                             update=lambda s, c: _al_parte_ojos(s, c))
    dens_boca: EnumProperty(
        name='Puntos de la boca', description='Más puntos = control más fino de la forma de los labios',
        items=[(str(n), str(n), f'{n} puntos en la boca ({n // 2} por labio). Más puntos = control más fino de la forma de los labios')
               for n in (6, 8, 10, 12)], get=_dens_get('boca', (6, 8, 10, 12)), set=_dens_set('boca', (6, 8, 10, 12)))
    dens_cejas: EnumProperty(
        name='Puntos por ceja', description='Más puntos = control más fino de la forma de las cejas',
        items=[(str(n), str(n), f'{n} puntos en cada ceja. Más puntos = control más fino de la forma de las cejas')
               for n in (2, 3, 4)], get=_dens_get('cejas', (2, 3, 4)), set=_dens_set('cejas', (2, 3, 4)))
    ocultos: StringProperty()                       # estado de visibilidad previo del rig viejo y del control
    punto: StringProperty(default='')               # punto de control elegido (círculo algo mayor en la cara)
    seleccion_parpado: EnumProperty(name='Seleccionar', items=[('punto', 'Un punto', ''),
        ('sup', 'Tres superiores', ''), ('inf', 'Tres inferiores', '')], default='punto', update=_al_seleccion_parpado)
    aporte_superior: FloatProperty(name='Superior (%)', description='Contribución al cierre de la abertura durante el parpadeo; no es peso por vértice', min=0., max=100., default=85.)
    grupo_arriba: FloatProperty(name='Arriba / abajo', min=-100., max=100., get=_grupo_slider('arriba')[0], set=_grupo_slider('arriba')[1])
    grupo_derecha: FloatProperty(name='Izquierda / derecha', min=-100., max=100., get=_grupo_slider('derecha')[0], set=_grupo_slider('derecha')[1])
    grupo_adelante: FloatProperty(name='Adelante / atrás', min=-100., max=100., get=_grupo_slider('adelante')[0], set=_grupo_slider('adelante')[1])
    ver_puntos: BoolProperty(name='Mostrar puntos', default=True, update=_al_visualizacion,
                            description='Muestra los círculos de control sobre la malla y permite seleccionarlos y arrastrarlos')
    ver_pesos: BoolProperty(name='Ver pesos del punto', default=True, update=_al_visualizacion,
                           description='Colorea la influencia real del ajuste elegido: azul débil, rojo fuerte')
    rapido: BoolProperty(name='Arrastre fluido', default=True,
                        description='Pausa la subdivisión mientras arrastras y la restaura al soltar')
    referencia: PointerProperty(name='Imagen de referencia', type=bpy.types.Object,
                               poll=lambda s, o: o.type == 'EMPTY' and o.empty_display_type == 'IMAGE')
    todos: BoolProperty(name='Ver todos los movimientos', default=False,
                        description='Muestra también los movimientos que esta expresión no usa')
    mas: BoolProperty(name='Más opciones (deslizadores)', default=False,
                      description='Muestra los deslizadores de cada movimiento de la cara, para ajustes más finos')
    vista: StringProperty()                         # vista y sombreado de antes de editar (para restaurarlos)
    construccion: BoolProperty(name='Modo construcción (avanzado)', default=False,
                               description='Muestra los pasos que CONSTRUYEN el rig. Rehacen piezas: no los uses en un personaje terminado')


# ------------------------------------------------------------------ cargar / salir
def _ocultar(context, ed, ob, prev):
    try:
        if ob.mode != 'OBJECT':
            if context.view_layer.objects.active is not ob:
                context.view_layer.objects.active = ob
            bpy.ops.object.mode_set(mode='OBJECT')
        if ob.name not in prev:
            prev[ob.name] = bool(ob.hide_get())
        if not ob.hide_get():
            ob.hide_set(True)
    except Exception as e:
        print('ocultar:', e)


def _asegurar_ocultos(context, ed):
    """INVARIANTE: mientras se edita, el rig viejo y el control están ocultos. Barato (solo mira si ya lo están):
    se llama al cargar una expresión, desde el arrastre con el ratón y desde un temporizador."""
    cara = _cara(context)
    if cara is None:
        return
    prev = None
    for suf in ('_Rig_Labios', '_Cara_Control'):
        ob = bpy.data.objects.get(cara.name + suf)
        if ob is None:
            continue
        try:
            if ob.name in context.view_layer.objects and ob.hide_get():
                continue
        except Exception:
            continue
        if prev is None:
            prev = json.loads(ed.ocultos or '{}')
        _ocultar(context, ed, ob, prev)
    if prev is not None:
        ed.ocultos = json.dumps(prev)


def _ocultar_rig(context, ed, cara):
    """compatibilidad: oculta el rig viejo y el control (guarda el estado previo)."""
    _asegurar_ocultos(context, ed)


def _ocultar_resto(context, ed, cara):
    """oculta en la vista todo lo que no sea la cara y sus piezas visibles (dientes, lengua, ojos...). Guarda el estado previo."""
    prev = json.loads(ed.ocultos or '{}')
    pre = cara.name + '_'
    conservar = {cara.name} | {o.name for o in cara.children_recursive}
    from . import ajustes_ojos as AO
    conservar.update(o.name for o in AO.piezas_vinculadas(cara))
    for ob in list(context.view_layer.objects):
        if ob.name in conservar or (ob.type == 'MESH' and ob.name.startswith(pre)):
            continue
        try:
            if ob.hide_get():
                continue
        except Exception:
            continue
        _ocultar(context, ed, ob, prev)
    ed.ocultos = json.dumps(prev)


def _mostrar_rig(ed):
    for n, h in json.loads(ed.ocultos or '{}').items():
        ob = bpy.data.objects.get(n)
        if ob is not None:
            try:
                ob.hide_set(bool(h))
            except Exception:
                pass
    ed.ocultos = ''
    # en una cara terminada el rig viejo queda siempre oculto
    try:
        from .. import auto as AU
        for ob in bpy.data.objects:
            if ob.name.endswith('_Rig_Labios') and AU.terminada(bpy.data.objects.get(ob.name[:-len('_Rig_Labios')])):
                ob.hide_set(True)
    except Exception:
        pass


# ------------------------------------------------------------------ vista automática
def _areas3d(window):
    return [a for a in window.screen.areas if a.type == 'VIEW_3D'] if window else []


def _vista_guardar(context, ed):
    if ed.vista:
        return
    out = []
    for i, a in enumerate(context.window.screen.areas if context.window else []):
        if a.type != 'VIEW_3D':
            continue
        s = a.spaces.active
        r3 = s.region_3d
        out.append({'i': i, 'loc': list(r3.view_location), 'rot': list(r3.view_rotation), 'dist': r3.view_distance,
                    'persp': r3.view_perspective, 'sh': s.shading.type, 'col': s.shading.color_type,
                    'luz': s.shading.light})
    ed.vista = json.dumps(out)


def _vista_restaurar(context, ed):
    try:
        datos = json.loads(ed.vista or '[]')
        areas = list(context.window.screen.areas) if context.window else []
        for d in datos:
            if d['i'] >= len(areas) or areas[d['i']].type != 'VIEW_3D':
                continue
            s = areas[d['i']].spaces.active
            r3 = s.region_3d
            r3.view_location = d['loc']; r3.view_rotation = d['rot']; r3.view_distance = d['dist']
            r3.view_perspective = d['persp']
            s.shading.type = d['sh']; s.shading.color_type = d['col']; s.shading.light = d['luz']
    except Exception as e:
        print('restaurar vista:', e)
    ed.vista = ''


def _pos_eval(context, cara, ids):
    """posición en el mundo de los puntos, tal como se ven (malla evaluada: formas, huesos y suavizados). -> (ids, [Vector])"""
    anclas = cara.get('aj_anclas', {})
    ok = [p for p in ids if p in anclas]
    if not ok:
        return [], []
    try:
        ev = cara.evaluated_get(context.evaluated_depsgraph_get())
        vs = ev.data.vertices
        M = ev.matrix_world
        superficies = cara.get('aj_superficies_labios', {})
        puntos = []
        for p in ok:
            datos = superficies.get(p)
            if datos is not None:
                co = sum((vs[int(i)].co * float(w) for i, w in zip(datos['tri'], datos['w'])), Vector())
            else:
                co = vs[int(anclas[p])].co
            puntos.append(M @ co)
        return ok, puntos
    except Exception:
        ids2, W = _pos_puntos(cara, ids)
        return ids2, [Vector(w) for w in W]


def _todos_ids(cara):
    ids = [p for z in ZONAS_UI if z[3] for f in _rejilla(z[0], cara) for p in f if p]
    ed = bpy.context.scene.rlb_editor
    if ed.zona == 'ojos' and ed.parte_ojos != 'ambos':
        ids = [p for p in ids if not p.startswith('parpado_') or p.startswith('parpado_' + ed.parte_ojos + '_')]
    return ids


def _vista_cara(context, cara, areas=None):
    """vista de frente encuadrando la cara (no el cuerpo), con la cara a la izquierda del panel lateral, y sombreado
    sólido con el color de la textura."""
    ids, W = _pos_eval(context, cara, _todos_ids(cara))
    if not ids:
        return False
    xs = [w.x for w in W]; ys = [w.y for w in W]; zs = [w.z for w in W]
    ancho = max(xs) - min(xs); alto = max(zs) - min(zs)
    cx, cy, cz = (max(xs) + min(xs)) / 2, sum(ys) / len(ys), (max(zs) + min(zs)) / 2 + alto * 0.12
    alto = alto * 1.45; ancho = max(ancho * 1.5, alto * 0.7)
    q = Euler((math.radians(90), 0, 0)).to_quaternion()
    for a in (areas if areas is not None else _areas3d(context.window)):
        s = a.spaces.active
        r3 = s.region_3d
        reg = next((r for r in a.regions if r.type == 'WINDOW'), None)
        ui = next((r for r in a.regions if r.type == 'UI'), None)
        w, h = (reg.width, reg.height) if reg else (a.width, a.height)
        uiw = ui.width if (ui is not None and ui.width > 2 and context.preferences.system.use_region_overlap) else 0
        libre = max(0.4, (w - uiw) / max(w, 1))
        arriba = sum(r.height for r in a.regions if r.type in ('HEADER', 'TOOL_HEADER') and r.height > 2)
        abajo = sum(r.height for r in a.regions if r.type in ('ASSET_SHELF', 'ASSET_SHELF_HEADER') and r.height > 2)
        libre_v = max(0.4, (h - arriba - abajo) / max(h, 1))
        f = 36.0 / max(s.lens, 1.0)
        fw, fh = (f, f * h / w) if w >= h else (f * w / h, f)
        d = max(ancho / (fw * libre), alto / (fh * libre_v))
        r3.view_perspective = 'PERSP'
        r3.view_rotation = q
        r3.view_distance = d
        r3.view_location = (cx + (uiw / 2.0 / max(w, 1)) * fw * d, cy, cz - ((abajo - arriba) / 2.0 / max(h, 1)) * fh * d)
        s.shading.type = 'SOLID'
        s.shading.light = 'STUDIO'
        s.shading.color_type = 'TEXTURE'
        a.tag_redraw()
    return True


def _cargar(context, ed, a):
    cara = _cara(context)
    if cara is None or not a.name.startswith(cara.name + '_FACS_'):
        raise RuntimeError('Selecciona una expresión del personaje que estás editando')
    from . import seleccion_labios as S
    S.restaurar(_cara(context))
    _pesos_cache.clear()
    ctrl = _ctrl(ed)
    cara = _cara(context)
    from . import ajustes_ojos as AO
    if cara.mode == 'OBJECT' and AO.disponible(cara):
        try:
            AO.asegurar(cara)
        except (RuntimeError, ValueError) as error:
            print('Puntos de párpados:', error)
    if 'rlb_original' not in a:   # copia del original, una sola vez, dentro de la propia acción
        e = PO.leer_crudo(a)
        a['rlb_original'] = {'pesos': e['pesos'], 'mirada': e['mirada'], 'intensidad': float(a.get('intensidad', 1.0))}
    e = PO.leer_crudo(a)
    _bloqueo[0] = True
    try:
        ed.accion = a.name
        ed.canales.clear()
        from . import retoque_parpados as RP
        propio = RP.nombre(a.name.split('_FACS_', 1)[-1])
        for k in sorted(k for k in ctrl.keys() if k.startswith('v_')):
            n = k[2:]
            from . import base_regional as BR
            if BR.es_base(n) and not BR.pertenece(n, a.name.split('_FACS_', 1)[-1]):
                continue
            if AO.es_basal(n) and not AO.basal_de(n, a.name.split('_FACS_', 1)[-1]):
                continue
            if RP.es_retoque(n) and n != propio:      # el retoque de otras expresiones no se ve ni se mueve aquí
                continue
            txt, sec, lado, par = _info(n, cara)
            c = ed.canales.add(); c.name = n
            c.texto, c.seccion, c.lado, c.par, c.ajuste = txt, sec, lado, par, n.startswith('aj_')
            _poner_val(c, round(float(e['pesos'].get(n, 0.0)) * 100.0, 1))
        ed.intensidad = float(a.get('intensidad', 1.0)) * 100.0
        ed.mirada_h, ed.mirada_v = (float(x) for x in e['mirada'])
        ed.ver_original = False
    finally:
        _bloqueo[0] = False
    _hist_reiniciar(ed)
    _asegurar_ocultos(context, ed)
    _refrescar(context, ed, guardar=False)


def _cambiar_expr(context):
    ed = context.scene.rlb_editor
    if not ed.activo or _bloqueo[0]:
        return
    a = bpy.data.actions.get(ed.expr)
    if a is None or a.name == ed.accion:
        return
    cara = _cara(context)
    if cara is None or not a.name.startswith(cara.name + '_FACS_'):
        return
    if cara is not None and cara.mode == 'EDIT' and cara.get('rlb_retoque_activo'):
        _guardar_retoque(context, ed, cara)       # retoque de párpados a medias: se guarda antes de cambiar de expresión
    _miniatura_si_cambio(context, ed)
    _cargar(context, ed, a)


def _miniatura_si_cambio(context, ed):
    a = bpy.data.actions.get(ed.accion)
    if a is None or not a.get('rlb_editada') or a.asset_data is None:
        return
    try:
        import os
        cara = _cara(context)
        base = os.path.dirname(bpy.data.filepath) or bpy.app.tempdir
        carpeta = util.carpeta_revision(cara, 'miniaturas'); os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, f'{a.get("rlb_facs_expr", a.name)}.png')
        PO._render_miniatura(cara, ruta, 256, 'TEXTURE'); PO._poner_miniatura(a, ruta)
        a['rlb_editada'] = False
    except Exception as e:
        print('miniatura:', e)


def _salir(context, ed):
    accion0 = ed.accion
    from . import seleccion_labios as S
    S.restaurar(_cara(context))
    _restaurar_calidad()
    cara0 = _cara(context)
    if cara0 is not None and cara0.mode == 'EDIT' and cara0.get('rlb_retoque_activo'):
        _guardar_retoque(context, ed, cara0)               # retoque de párpados a medias: se guarda al terminar
    _miniatura_si_cambio(context, ed)
    ctrl = _ctrl(ed)
    if ctrl is not None:
        for k in ctrl.keys():
            if k.startswith('v_'):
                ctrl[k] = 0.0
        for k, v in json.loads(ed.valores_previos or '{}').items():
            if k in ctrl.keys():
                ctrl[k] = v
        ad = ctrl.animation_data_create()
        prev = bpy.data.actions.get(ed.accion_previa)
        ad.action = prev
        if prev is not None and ed.slot_previo:
            s = next((s for s in prev.slots if s.identifier == ed.slot_previo), None)
            if s is not None:
                ad.action_slot = s
        ctrl.update_tag()
    ed.accion_previa = ''; ed.slot_previo = ''; ed.valores_previos = ''     # ya devueltos: no se reusan en otra sesión
    cara = _cara(context)
    if cara is not None:
        BI.mirada(cara, 0.0, 0.0)
    _bloqueo[0] = True
    try:
        ed.activo = False; ed.canales.clear(); ed.accion = ''; ed.ver_original = False
    finally:
        _bloqueo[0] = False
    _mostrar_rig(ed)
    _vista_restaurar(context, ed)
    if cara0 is not None:
        estado = {k: getattr(ed, k) for k in _OPCIONES_SESION}
        estado.update(activo=False, accion=accion0,
                      referencia=ed.referencia.name if ed.referencia else '')
        cara0[_SESION] = json.dumps(estado)
    _pilas.pop(accion0, None); _h.update(actual=None, accion='', gesto=False); _hover[0] = ''; _arr.clear()
    context.view_layer.update()
    _tag_redraw(context)


# ------------------------------------------------------------------ operadores
_SESION = 'rlb_editor_sesion'
_OPCIONES_SESION = (
    'seccion', 'enlazar', 'zona', 'parte_ojos', 'punto', 'seleccion_parpado',
    'aporte_superior', 'ver_puntos', 'ver_pesos', 'rapido', 'todos', 'mas', 'construccion',
)
_ANTERIORES_SESION = ('accion_previa', 'slot_previo', 'valores_previos')


def _leer_sesion(cara):
    try:
        return json.loads(cara.get(_SESION, '{}'))
    except (TypeError, ValueError):
        return {}


def _suspender_personaje(context, ed):
    """Deja la pose y la acción del personaje intactas; retiene su sesión de edición."""
    cara = _cara(context)
    if cara is None or not ed.activo:
        return
    from . import seleccion_labios as S
    S.restaurar(cara)
    if cara.mode == 'EDIT' and cara.get('rlb_retoque_activo'):
        _guardar_retoque(context, ed, cara)
    if _arr or _h.get('gesto'):
        _gesto_fin(ed)
        _arr.clear()
    _restaurar_calidad()
    estado = {k: getattr(ed, k) for k in _OPCIONES_SESION + _ANTERIORES_SESION}
    ctrl = _ctrl(ed)
    estado.update(activo=True, accion=ed.accion,
                  referencia=ed.referencia.name if ed.referencia else '',
                  ver_original=ed.ver_original,
                  valores_actuales={k: float(v) for k, v in ctrl.items() if k.startswith('v_')},
                  canales={c.name: _val(c) for c in ed.canales},
                  intensidad=float(ed.intensidad), mirada_h=float(ed.mirada_h), mirada_v=float(ed.mirada_v))
    cara[_SESION] = json.dumps(estado)
    # Deshacer el aislamiento anterior permite seleccionar el siguiente personaje.
    _mostrar_rig(ed)
    ed.activo = False
    ed.control = ''; ed.accion = ''; ed.canales.clear()
    ed.vista = ''
    _pesos_cache.clear(); _hover[0] = ''


def cambiar_personaje(context, cara):
    """El panel es compartido; los datos, expresión y opciones son de cada personaje."""
    ed = context.scene.rlb_editor
    ctrl = BI.control(cara)
    if ed.activo and ctrl is not None and ed.control == ctrl.name:
        if context.scene.rlb.cara is not cara:
            context.scene.rlb.cara = cara
        return
    continuar = bool(ed.activo)
    if ed.activo:
        _suspender_personaje(context, ed)
    context.scene.rlb.cara = cara
    estado = _leer_sesion(cara)
    bloqueo = _bloqueo[0]; _bloqueo[0] = True
    try:
        for k in _OPCIONES_SESION:
            setattr(ed, k, estado.get(k, ed.bl_rna.properties[k].default))
        ed.referencia = bpy.data.objects.get(estado.get('referencia', ''))
        if ed.referencia is None:
            refs = [o for o in context.scene.objects if o.type == 'EMPTY'
                    and o.empty_display_type == 'IMAGE'
                    and o.name.casefold().startswith(cara.name.strip().casefold())]
            if len(refs) == 1:
                ed.referencia = refs[0]
    finally:
        _bloqueo[0] = bloqueo
    if ctrl is None:
        _tag_redraw(context)
        return
    from . import integracion
    from .. import auto as AU
    if AU.terminada(cara) and integracion.pendiente(cara):
        integracion.preparar(cara)
    acciones = _acciones(context)
    if not acciones:
        _tag_redraw(context)
        return
    a = bpy.data.actions.get(estado.get('accion', ''))
    if a is None or not a.name.startswith(cara.name + '_FACS_'):
        a = bpy.data.actions.get(cara.name + '_FACS_neutro') or acciones[0]
    bloqueo = _bloqueo[0]; _bloqueo[0] = True
    try:
        ed.expr = a.name
    finally:
        _bloqueo[0] = bloqueo
    if continuar or estado.get('activo'):
        ad = ctrl.animation_data_create()
        if estado.get('activo'):
            for k in _ANTERIORES_SESION:
                setattr(ed, k, estado.get(k, ''))
        else:
            ed.accion_previa = ad.action.name if ad.action else ''
            ed.slot_previo = ad.action_slot.identifier if ad.action and ad.action_slot else ''
            ed.valores_previos = json.dumps({k: float(ctrl[k]) for k in ctrl.keys() if k.startswith('v_')})
        ad.action = None
        ed.control = ctrl.name; ed.activo = True
        _vista_guardar(context, ed)
        _cargar(context, ed, a)
        if estado.get('activo') and 'valores_actuales' in estado:
            bloqueo = _bloqueo[0]; _bloqueo[0] = True
            try:
                for c in ed.canales:
                    _poner_val(c, estado.get('canales', {}).get(c.name, _val(c)))
                for k in ('intensidad', 'mirada_h', 'mirada_v'):
                    if k in estado:
                        setattr(ed, k, estado[k])
                for k, v in estado['valores_actuales'].items():
                    if k in ctrl:
                        ctrl[k] = v
                ctrl.update_tag()
                context.view_layer.update()
            finally:
                _bloqueo[0] = bloqueo
            _hist_reiniciar(ed)
        if estado.get('ver_original'):
            ed.ver_original = True
        _asegurar_dibujo()
    _tag_redraw(context)


class RLB_OT_exp_empezar(bpy.types.Operator):
    """Empieza a editar la expresión elegida: pone la cara de frente y deja solo la cara a la vista"""
    bl_idname = 'rlb.exp_empezar'
    bl_label = 'Empezar a editar'
    bl_description = 'Empieza a editar la expresión elegida: pone la cara de frente, deja solo la cara a la vista y te deja mover los círculos con el ratón'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        ed = context.scene.rlb_editor
        from .. import auto as AU
        AU.aplicar(context)
        cara = _cara(context)
        a = bpy.data.actions.get(ed.expr)
        if cara is None or a is None:
            self.report({'ERROR'}, 'No encuentro la cara o la expresión'); return {'CANCELLED'}
        ctrl = BI.control(cara)
        from . import integracion
        integracion.preparar(cara)
        _asegurar_bordes_editor(context, cara)
        _asegurar_dibujo()
        if not ed.activo:
            ad = ctrl.animation_data_create()
            ed.accion_previa = ad.action.name if ad.action else ''
            ed.slot_previo = ad.action_slot.identifier if (ad.action and ad.action_slot) else ''
            ed.valores_previos = json.dumps({k: float(ctrl[k]) for k in ctrl.keys() if k.startswith('v_')})
            ad.action = None
        ed.control = ctrl.name
        ed.activo = True
        if not ed.vista:                # vista y objetos visibles de antes, para devolverlos al terminar
            _vista_guardar(context, ed)
            _ocultar_resto(context, ed, cara)
        _cargar(context, ed, a)         # también oculta el rig viejo y el control
        try:
            _vista_cara(context, cara)
        except Exception as e:
            print('vista:', e)
        if not _modal_vivo[0]:
            try:
                bpy.ops.rlb.exp_arrastrar('INVOKE_DEFAULT')
            except Exception as e:
                print('arrastrar:', e)
        return {'FINISHED'}


class RLB_OT_exp_navegar(bpy.types.Operator):
    """pasa a la expresión anterior o siguiente (lo que cambiaste ya quedó guardado)"""
    bl_idname = 'rlb.exp_navegar'
    bl_label = 'Otra expresión'
    paso: bpy.props.IntProperty(default=1)

    def execute(self, context):
        ed = context.scene.rlb_editor
        acc = _acciones(context)
        if not acc:
            return {'CANCELLED'}
        nombres = [a.name for a in acc]
        i = nombres.index(ed.expr) if ed.expr in nombres else 0
        ed.expr = nombres[(i + self.paso) % len(nombres)]
        return {'FINISHED'}


class RLB_OT_exp_terminar(bpy.types.Operator):
    """Termina de editar: tus cambios ya están guardados y la vista vuelve a como estaba"""
    bl_idname = 'rlb.exp_terminar'
    bl_label = 'Terminar'
    bl_description = 'Termina de editar. Tus cambios ya están guardados en cada expresión y la vista vuelve a como estaba'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        _salir(context, context.scene.rlb_editor)
        return {'FINISHED'}


class RLB_OT_exp_guardar(bpy.types.Operator):
    bl_idname = 'rlb.exp_guardar'
    bl_label = 'Guardar expresión'
    bl_description = 'Guarda los cambios en la expresión actual; no guarda el archivo .blend'

    @classmethod
    def poll(cls, context):
        ed = getattr(context.scene, 'rlb_editor', None)
        return ed is not None and ed.activo and bpy.data.actions.get(ed.accion) is not None

    def execute(self, context):
        ed = context.scene.rlb_editor
        cara = _cara(context)
        if _arr:
            self.report({'WARNING'}, 'Suelta el punto antes de guardar'); return {'CANCELLED'}
        if cara is not None and cara.mode == 'EDIT' and cara.get('rlb_retoque_activo'):
            _guardar_retoque(context, ed, cara)
        elif cara is not None and cara.mode != 'OBJECT':
            self.report({'WARNING'}, 'Termina la edición o pintura antes de guardar'); return {'CANCELLED'}
        _guardar_accion(ed)
        self.report({'INFO'}, 'Expresión actual guardada')
        return {'FINISHED'}


def _guardar_cabecera(self, context):
    if getattr(context.scene, 'rlb_editor', None) is not None and context.scene.rlb_editor.activo:
        self.layout.operator('rlb.exp_guardar', text='Guardar expresión', icon='FILE_TICK')


class RLB_OT_exp_base_region(bpy.types.Operator):
    bl_idname = 'rlb.exp_base_region'
    bl_label = 'Restaurar a la base'
    bl_description = 'Restaura únicamente esta región a Basis en la expresión actual. Se puede deshacer'
    bl_options = {'REGISTER', 'UNDO'}
    region: EnumProperty(items=[(s, s, '') for s in ('nariz', 'boca', 'ojos', 'cejas', 'mejillas', 'mandibula')])
    lado: EnumProperty(items=[('BOTH', 'Ambos', ''), ('L', 'Izquierdo', ''), ('R', 'Derecho', '')])

    def execute(self, context):
        from . import base_regional as BR
        ed = context.scene.rlb_editor; cara = _cara(context)
        if not ed.activo or cara is None or cara.mode != 'OBJECT' or _arr:
            self.report({'WARNING'}, 'Termina la edición o el arrastre antes de restaurar'); return {'CANCELLED'}
        if ed.ver_original:
            self.report({'WARNING'}, 'Desactiva Ver original antes de restaurar'); return {'CANCELLED'}
        anterior = _snap(ed)
        lado = '' if self.lado == 'BOTH' else self.lado
        try:
            # Validar la región antes de modificar canales.
            BR.plan(cara, self.region, lado, ed.intensidad/100.)
            ps = BR.puntos(cara, self.region, lado)
            nombres = {AJ.nombre(p, d) for AJ in (_ajustes(),) for p in ps for d in AJ.zonas(cara)[p][2]}
            if self.region == 'nariz':
                nombres.update(c.name for c in ed.canales if c.name.startswith('br_nariz_'))
            if self.region == 'boca': nombres.update(_ajustes().MODELAR)
            _bloqueo[0] = True
            try:
                for c in ed.canales:
                    if c.name in nombres: _poner_val(c, 0.)
            finally: _bloqueo[0] = False
            _refrescar(context, ed, guardar=False)
            delta = BR.plan(cara, self.region, lado, ed.intensidad/100.)
            nombre = BR.aplicar(cara, _expr_actual(ed), self.region, lado, delta)
            c = ed.canales.add(); c.name = nombre
            c.texto, c.seccion, c.lado, c.par = _info(nombre, cara)
            c.ajuste = False
            _bloqueo[0] = True
            try: _poner_val(c, 100.)
            finally: _bloqueo[0] = False
        except Exception as error:
            _empujar(ed.accion, anterior); deshacer(context, ed)
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}
        _empujar(ed.accion, anterior)
        _refrescar(context, ed); _hist_reiniciar(ed); _tag_redraw(context)
        self.report({'INFO'}, 'Restaurada solo la región elegida; puedes editarla desde la base')
        return {'FINISHED'}


class RLB_OT_exp_original(bpy.types.Operator):
    """Deja esta expresión como era al principio"""
    bl_idname = 'rlb.exp_original'
    bl_label = 'Volver al original'
    bl_description = 'Deja esta expresión como era antes de que la cambiaras'
    bl_options = {'REGISTER', 'UNDO'}
    solo_seccion: BoolProperty(default=False)

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        ed = context.scene.rlb_editor
        a = bpy.data.actions.get(ed.accion)
        if a is None or 'rlb_original' not in a:
            return {'CANCELLED'}
        _empujar(ed.accion, _snap(ed))
        o = a['rlb_original']
        pesos = dict(o.get('pesos', {}))
        _bloqueo[0] = True
        try:
            for c in ed.canales:
                if self.solo_seccion and c.seccion != ed.seccion:
                    continue
                _poner_val(c, round(float(pesos.get(c.name, 0.0)) * 100.0, 1))
            if not self.solo_seccion:
                ed.intensidad = float(o.get('intensidad', 1.0)) * 100.0
                ed.mirada_h, ed.mirada_v = (float(x) for x in o.get('mirada', (0.0, 0.0)))
            elif ed.seccion == 'ojos':
                ed.mirada_h, ed.mirada_v = (float(x) for x in o.get('mirada', (0.0, 0.0)))
        finally:
            _bloqueo[0] = False
        _refrescar(context, ed)
        _hist_reiniciar(ed)
        return {'FINISHED'}


class RLB_OT_exp_espejo(bpy.types.Operator):
    """Copia el lado del círculo elegido al otro lado de la cara"""
    bl_idname = 'rlb.exp_espejo'
    bl_label = 'Copiar este lado al otro'
    bl_description = ('Copia al otro lado de la cara lo que hiciste en el círculo elegido (y en los movimientos '
                      'de su zona), para que los dos lados queden iguales')
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        ed = context.scene.rlb_editor
        cara = _cara(context)
        AJ = _ajustes()
        zs = AJ.zonas(cara)
        lado, pz = AJ.lado_par(ed.punto, cara) if ed.punto in zs else ('', '')
        if not lado or not pz:
            self.report({'INFO'}, 'Elige primero un círculo de un lado de la cara (no uno del centro)')
            return {'CANCELLED'}
        _empujar(ed.accion, _snap(ed))
        z = _zona(ed.zona)
        secs = z[2] if z else ()
        _bloqueo[0] = True
        try:
            for d in zs[ed.punto][2]:
                o, t = ed.canales.get(AJ.nombre(ed.punto, d)), ed.canales.get(AJ.nombre(pz, d))
                if o is not None and t is not None:
                    _poner_val(t, _val(o))
            for c in ed.canales:
                if c.seccion in secs and not c.ajuste and c.lado == lado and c.par in ed.canales:
                    _poner_val(ed.canales[c.par], _val(c))
        finally:
            _bloqueo[0] = False
        _refrescar(context, ed)
        _hist_reiniciar(ed)
        return {'FINISHED'}


class RLB_OT_exp_encuadrar(bpy.types.Operator):
    """Pone la vista mirando la cara de frente y de cerca"""
    bl_idname = 'rlb.exp_encuadrar'
    bl_label = 'Ver la cara de frente'
    bl_description = 'Pone la vista mirando la cara de frente y de cerca, con los colores de la textura'

    def execute(self, context):
        cara = _cara(context)
        if cara is None:
            return {'CANCELLED'}
        return {'FINISHED'} if _vista_cara(context, cara) else {'CANCELLED'}


class RLB_OT_exp_miniatura(bpy.types.Operator):
    """Vuelve a hacer la foto pequeña de esta expresión (la de la estantería)"""
    bl_idname = 'rlb.exp_miniatura'
    bl_label = 'Actualizar foto'
    bl_description = 'Vuelve a hacer la foto pequeña de esta expresión, la que sale en la estantería de abajo'

    def execute(self, context):
        ed = context.scene.rlb_editor
        a = bpy.data.actions.get(ed.accion)
        if a is not None:
            a['rlb_editada'] = True
            _miniatura_si_cambio(context, ed)
        return {'FINISHED'}


# ------------------------------------------------------------------ panel
ZONAS_UI = [
    # id, título, secciones (canales de gesto), rejilla de puntos tal como se ven de frente (der. del personaje a la izq.)
    ('cejas', 'Cejas', ('cejas',), [['ceja_out_R', 'ceja_in_R', 'ceja_in_L', 'ceja_out_L']]),
    ('globos', 'Ojos', (), []),
    ('ojos', 'Párpados', ('ojos',), [['parpado_sup_2_R', 'parpado_sup_2_L']]),
    ('cara', 'Mejillas y nariz', ('mejillas', 'nariz'), [['mejilla_R', 'nariz_R', 'nariz_punta', 'nariz_L', 'mejilla_L']]),
    ('boca', 'Boca', ('comisuras', 'labio_sup', 'labio_inf', 'boca'),
     [['labio_sup_R', 'labio_sup_centro', 'labio_sup_L'],
      ['comisura_R', None, 'comisura_L'],
      ['labio_inf_R', 'labio_inf_centro', 'labio_inf_L']]),
    ('mandibula', 'Mandíbula y lengua', ('mandibula',), [['menton']]),
]
NOMBRE_SEC = {s[0]: s[1] for s in SECCIONES}


def _rejilla(zid, cara):
    """rejilla de puntos de la zona según la densidad de la cara (filas de puntos tal como se ven de frente)."""
    AJ = _ajustes()
    d = AJ.densidad(cara)
    if zid == 'ojos':
        from . import ajustes_ojos as AO
        anclas = cara.get('aj_anclas', {}) if cara is not None else {}
        return [[p for p in fila if p in anclas] for fila in AO.REJILLA]
    if zid == 'boca':
        nl = d['boca'] // 2
        sup = [n for n, _ in reversed(AJ._pts_labio('sup', nl))]      # der. del personaje a la izq. de la pantalla
        inf = [n for n, _ in reversed(AJ._pts_labio('inf', nl))]
        return [list(reversed(sup)), ['comisura_R'] + [None] * (nl - 2) + ['comisura_L'],
                ['labio_borde_inf_R', 'labio_borde_inf_L'], list(reversed(inf))]
    if zid == 'cejas':
        fila = [n for n, _ in reversed(AJ._pts_ceja('R', d['cejas']))] + [n for n, _ in AJ._pts_ceja('L', d['cejas'])]
        return [fila]
    return _zona(zid)[3]


def _vis(t):
    """texto visible más claro (solo apariencia): «Comis. izq.» -> «Esquina izq.»; no cambia ningún id de punto."""
    return t.replace('Comis.', 'Esquina')


def _texto_punto(p, cara):
    AJ = _ajustes()
    z = AJ.zonas(cara)
    if p.startswith('parpado_'):
        _, parte, i, lado = p.split('_')
        return ('Sup.' if parte == 'sup' else 'Inf.') + f' {i} ' + ('izq.' if lado == 'L' else 'der.')
    if p.startswith('labio_borde_inf_'):
        return 'Borde izq.' if p.endswith('_L') else 'Borde der.'
    if p in AJ.ZONAS:
        return _vis(AJ.ZONAS[p][0])
    return _vis(z[p][0].rsplit(' ', 1)[-1] if p.startswith('labio_') else z[p][0])


def _al_parte_ojos(ed, context):
    if ed.zona == 'ojos':
        if ed.seleccion_parpado != 'punto' and ed.parte_ojos in ('sup', 'inf') and ed.seleccion_parpado != ed.parte_ojos:
            ed.seleccion_parpado = ed.parte_ojos
        ids = [p for f in _rejilla('ojos', _cara(context)) for p in f
               if ed.parte_ojos == 'ambos' or p.startswith('parpado_' + ed.parte_ojos + '_')]
        if ed.punto not in ids:
            lado = ed.punto[-1:] if ed.punto.startswith('parpado_') else ''
            ed.punto = next((p for p in ids if lado and p.endswith('_' + lado)), ids[0] if ids else '')
    _tag_redraw(context)


def _zona(zid):
    return next((z for z in ZONAS_UI if z[0] == zid), None)


class RLB_OT_exp_zona(bpy.types.Operator):
    """Abre o cierra esta zona de la cara"""
    bl_idname = 'rlb.exp_zona'
    bl_label = 'Zona'
    bl_description = 'Abre o cierra esta parte de la cara para ver sus opciones'
    zona: StringProperty()

    def execute(self, context):
        ed = context.scene.rlb_editor
        ed.zona = '' if ed.zona == self.zona else self.zona
        z = _zona(ed.zona)
        ed.punto = next((p for fila in _rejilla(z[0], _cara(context)) for p in fila if p), '') if z else ''
        if z:
            mostrar_puntos(context)
        _tag_redraw(context)
        return {'FINISHED'}


class RLB_OT_exp_punto(bpy.types.Operator):
    """Elige este círculo de la cara"""
    bl_idname = 'rlb.exp_punto'
    bl_label = 'Punto'
    bl_description = 'Selecciona este punto individual; Simetría añade su pareja. Usa el selector de grupo para mover tres puntos'
    punto: StringProperty()

    def execute(self, context):
        if self.punto.startswith(('parpado_sup_', 'parpado_inf_')):
            context.scene.rlb_editor.seleccion_parpado = 'punto'
        _elegir_punto(context.scene.rlb_editor, self.punto)
        _tag_redraw(context)
        return {'FINISHED'}


def _elegir_punto(ed, punto):
    if ed.seleccion_parpado != 'punto' and punto.startswith(('parpado_sup_', 'parpado_inf_')):
        ed.seleccion_parpado = punto.split('_')[1]
    ed.punto = punto


def _tag_redraw(context):
    for w in context.window_manager.windows:
        for a in w.screen.areas:
            if a.type in {'VIEW_3D', 'PROPERTIES'}:
                a.tag_redraw()


def _slider(ed, lay, canal, texto, context=None):
    c = ed.canales.get(canal)
    if c is not None:
        if context is not None and len(texto) > 22:
            # texto largo: se escribe entero (con ajuste de línea) encima y el deslizador va debajo, sin cortarse
            from .. import asistente as AS
            AS._parrafo(lay, context, texto)
            texto = ''
        lay.prop(c, _prop(c), text=texto, slider=True)


def _gestos(ed, secs, lay, context=None, mostrar_todos=False):
    """los movimientos (canales ARKit) de la zona: solo los que usa la expresión, salvo «ver todos»."""
    vistos = set()
    col = lay.column(align=True)
    n = 0
    for c in ed.canales:
        if c.name.startswith(('ob_sup_', 'ob_inf_', 'br_')):
            continue
        if c.seccion not in secs or c.ajuste or c.name in vistos:
            continue
        par = ed.canales.get(c.par) if c.par else None
        if not (ed.todos or mostrar_todos) and abs(_val(c)) < 0.5 and (par is None or abs(_val(par)) < 0.5):
            continue
        junto = ed.enlazar and par is not None and abs(_val(par) - _val(c)) < 0.5
        t = c.texto if junto or not c.lado else f'{c.texto} ({LADO[c.lado]})'
        if junto:
            vistos.add(par.name)
        if context is not None and len(t) > 22:
            from .. import asistente as AS
            AS._parrafo(col, context, t)
            t = ''
        col.prop(c, _prop(c), text=t, slider=True); n += 1
        vistos.add(c.name)
    if n == 0:
        if context is not None:
            from .. import asistente as AS
            AS._parrafo(col, context, 'Esta expresión no usa movimientos aquí')
        else:
            col.label(text='Esta expresión no usa movimientos aquí')


class RLB_OT_exp_ojos_pose(bpy.types.Operator):
    bl_idname = 'rlb.exp_ojos_pose'
    bl_label = 'Posición de los párpados'
    bl_description = 'Abre, entrecierra o cierra los ojos conservando los puntos y el resto de la expresión. Sin simetría cambia el ojo elegido'
    bl_options = {'REGISTER', 'UNDO'}
    pose: EnumProperty(items=[('ABRIR', 'Abrir', ''), ('MEDIO', 'Entrecerrar', ''), ('CERRAR', 'Cerrar', '')])

    def execute(self, context):
        from . import ajustes_ojos as AO
        ed = context.scene.rlb_editor
        cara = _cara(context)
        if not ed.activo or cara is None or cara.mode != 'OBJECT':
            self.report({'WARNING'}, 'Termina primero la edición de vértices'); return {'CANCELLED'}
        lado, _ = _ajustes().lado_par(ed.punto, cara)
        if not ed.enlazar and not lado:
            self.report({'WARNING'}, 'Elige un punto del ojo que quieres modificar'); return {'CANCELLED'}
        lados = ('L', 'R') if ed.enlazar else (lado,)
        _empujar(ed.accion, _snap(ed))
        _bloqueo[0] = True
        try:
            for s in lados:
                for gesto in AO.GESTOS:
                    canal = ed.canales.get(f'{gesto}_{s}')
                    if canal is not None:
                        valor = 100. if self.pose == 'CERRAR' and gesto == 'eyeBlink' else 70. if self.pose == 'MEDIO' and gesto == 'eyeSquint' else 0.
                        _poner_val(canal, valor)
        finally:
            _bloqueo[0] = False
        _refrescar(context, ed); _hist_reiniciar(ed); _tag_redraw(context)
        return {'FINISHED'}


class RLB_OT_exp_ojos_basal(bpy.types.Operator):
    bl_idname = 'rlb.exp_ojos_basal'
    bl_label = 'Párpado al estado basal'
    bl_description = 'Devuelve el párpado superior o inferior a la forma de Basis en esta expresión. Conserva el otro párpado; sin simetría cambia el ojo elegido'
    bl_options = {'REGISTER', 'UNDO'}
    parte: EnumProperty(items=[('sup', 'Superior', ''), ('inf', 'Inferior', '')])

    def execute(self, context):
        from . import ajustes_ojos as AO
        ed = context.scene.rlb_editor; cara = _cara(context)
        if not ed.activo or cara is None or cara.mode != 'OBJECT':
            self.report({'WARNING'}, 'Termina primero la edición de vértices'); return {'CANCELLED'}
        lado, _ = _ajustes().lado_par(ed.punto, cara)
        if not ed.enlazar and not lado:
            self.report({'WARNING'}, 'Elige un punto del ojo que quieres modificar'); return {'CANCELLED'}
        lados = ('L', 'R') if ed.enlazar else (lado,)
        anterior = _snap(ed)
        _empujar(ed.accion, anterior)
        _bloqueo[0] = True
        try:
            for c in ed.canales:
                if c.name.startswith('aj_parpado_' + self.parte + '_') and c.name.split('_')[-2] in lados:
                    _poner_val(c, 0.)
                if AO.es_basal(c.name) and c.name.split('_')[1] == self.parte and c.name.split('_')[2] in lados:
                    _poner_val(c, 0.)
        finally:
            _bloqueo[0] = False
        _refrescar(context, ed, guardar=False)
        try:
            nombres = AO.basal(cara, _expr_actual(ed), self.parte, lados, ed.intensidad / 100.)
        except (RuntimeError, ValueError) as error:
            deshacer(context, ed)
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}
        _bloqueo[0] = True
        try:
            for n in nombres:
                c = ed.canales.add(); c.name = n
                c.texto, c.seccion, c.lado, c.par = _info(n, cara)
                c.ajuste = False; _poner_val(c, 100.)
        finally:
            _bloqueo[0] = False
        _refrescar(context, ed); _hist_reiniciar(ed); _tag_redraw(context)
        self.report({'INFO'}, 'Párpado superior en basal' if self.parte == 'sup' else 'Párpado inferior en basal')
        return {'FINISHED'}


class RLB_OT_exp_cierre_parpados(bpy.types.Operator):
    bl_idname = 'rlb.exp_cierre_parpados'
    bl_label = 'Recalcular cierre tras editar la malla'
    bl_description = 'Recalcula y valida el cierre con la abertura actual; conserva controles y expresiones. Puede tardar un minuto'
    bl_options = {'REGISTER', 'UNDO'}
    proporcion: BoolProperty(default=False)

    def execute(self, context):
        from . import regenerar_cierre_parpados as RC
        cara = _cara(context)
        if cara is None or cara.mode != 'OBJECT' or _arr:
            self.report({'WARNING'}, 'Termina la edición o el arrastre antes de recalcular')
            return {'CANCELLED'}
        context.window.cursor_set('WAIT')
        try:
            ajuste = {'aporte_superior': context.scene.rlb_editor.aporte_superior/100.} if self.proporcion else None
            K, keys, info = RC.calcular(cara, parametros_override=ajuste, tension=self.proporcion)
            res = RC.aplicar_plan(cara, K, keys, info)
            cara['rlb_respaldo_cierre_parpados'] = res['archivo_respaldo']
        except Exception as exc:
            self.report({'ERROR'}, str(exc)); return {'CANCELLED'}
        finally:
            context.window.cursor_set('DEFAULT')
        _pesos_cache.clear(); context.view_layer.update(); _tag_redraw(context)
        self.report({'INFO'}, 'Cierre recalculado y respaldado; revisa la deformación')
        return {'FINISHED'}


class RLB_OT_exp_cierre_parpados_restaurar(bpy.types.Operator):
    bl_idname = 'rlb.exp_cierre_parpados_restaurar'
    bl_label = 'Restaurar cierre anterior'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import regenerar_cierre_parpados as RC
        cara = _cara(context)
        if cara is None or cara.mode != 'OBJECT' or _arr:
            return {'CANCELLED'}
        try:
            RC.restaurar_plan(cara, cara.get('rlb_respaldo_cierre_parpados', ''))
        except Exception as exc:
            self.report({'ERROR'}, str(exc)); return {'CANCELLED'}
        _pesos_cache.clear(); context.view_layer.update(); _tag_redraw(context)
        return {'FINISHED'}


class RLB_OT_exp_influencias_parpados(bpy.types.Operator):
    bl_idname = 'rlb.exp_influencias_parpados'
    bl_label = 'Regenerar influencias palpebrales'
    bl_description = 'Recalcula los pesos de los mismos puntos sobre cada párpado y conserva sus valores; guarda un respaldo restaurable'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import ajustes_ojos as AO
        cara = _cara(context)
        if cara is None or cara.mode != 'OBJECT' or _arr:
            self.report({'WARNING'}, 'Termina la edición de vértices y suelta el punto')
            return {'CANCELLED'}
        respaldo = None
        try:
            previo = AO.actualizar(cara, aplicar=False)
            if not previo['keys']:
                self.report({'INFO'}, 'Las influencias palpebrales ya están actualizadas')
                return {'FINISHED'}
            respaldo = AO.respaldar(cara)
            informe = AO.actualizar(cara, aplicar=True)
        except Exception as error:
            if respaldo is not None:
                try:
                    AO.restaurar(cara, respaldo['archivo'])
                except Exception as fallo:
                    self.report({'ERROR'}, f'{error}. No se pudo restaurar el respaldo: {fallo}')
                    return {'CANCELLED'}
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}
        _pesos_cache.clear(); context.view_layer.update(); _tag_redraw(context)
        self.report({'INFO'}, f'{informe["keys"]} ajustes palpebrales actualizados; respaldo disponible')
        return {'FINISHED'}


class RLB_OT_exp_influencias_parpados_restaurar(bpy.types.Operator):
    bl_idname = 'rlb.exp_influencias_parpados_restaurar'
    bl_label = 'Restaurar influencias palpebrales'
    bl_description = 'Restaura los pesos palpebrales anteriores conservando los valores actuales de la expresión'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import ajustes_ojos as AO
        cara = _cara(context)
        if cara is None or cara.mode != 'OBJECT' or _arr:
            self.report({'WARNING'}, 'Termina la edición de vértices y suelta el punto')
            return {'CANCELLED'}
        try:
            AO.restaurar(cara)
        except Exception as error:
            self.report({'ERROR'}, str(error))
            return {'CANCELLED'}
        _pesos_cache.clear(); context.view_layer.update(); _tag_redraw(context)
        self.report({'INFO'}, 'Influencias palpebrales restauradas')
        return {'FINISHED'}


class RLB_OT_exp_influencias_labios(bpy.types.Operator):
    bl_idname = 'rlb.exp_influencias_labios'
    bl_label = 'Corregir influencias labiales'
    bl_description = 'Limita cada punto a su labio, conservando los valores de tus retoques y guardando un respaldo restaurable'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import mascaras_labios as ML
        cara = _cara(context)
        if cara is not None and cara.get('rlb_manual_activo', False):
            self.report({'WARNING'}, 'Vuelve a Automático antes de corregir sus influencias')
            return {'CANCELLED'}
        if cara is None or _arr:
            self.report({'WARNING'}, 'Suelta el punto antes de corregir sus influencias')
            return {'CANCELLED'}
        respaldo = None
        try:
            previo = ML.actualizar(cara, aplicar=False)
            if not previo['keys']:
                self.report({'INFO'}, 'Las influencias labiales ya están actualizadas')
                return {'FINISHED'}
            respaldo = ML.respaldar(cara)
            informe = ML.actualizar(cara, aplicar=True)
        except Exception as e:
            if respaldo is not None:
                try:
                    ML.restaurar(cara, respaldo['archivo'])
                except Exception as fallo:
                    self.report({'ERROR'}, f'{e}. No se pudo restaurar el respaldo: {fallo}')
                    return {'CANCELLED'}
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        _pesos_cache.clear(); context.view_layer.update(); _tag_redraw(context)
        self.report({'INFO'}, f'{informe["keys"]} ajustes labiales actualizados; respaldo disponible')
        return {'FINISHED'}


class RLB_OT_exp_influencias_restaurar(bpy.types.Operator):
    bl_idname = 'rlb.exp_influencias_restaurar'
    bl_label = 'Restaurar influencias anteriores'
    bl_description = 'Restaura las influencias del último respaldo labial, conservando los valores actuales de tu expresión'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        from . import mascaras_labios as ML
        cara = _cara(context)
        if cara is not None and cara.get('rlb_manual_activo', False):
            self.report({'WARNING'}, 'Vuelve a Automático antes de restaurar sus influencias')
            return {'CANCELLED'}
        if cara is None or _arr:
            self.report({'WARNING'}, 'Suelta el punto antes de restaurar sus influencias')
            return {'CANCELLED'}
        try:
            ML.restaurar(cara)
        except Exception as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        _pesos_cache.clear(); context.view_layer.update(); _tag_redraw(context)
        self.report({'INFO'}, 'Influencias labiales restauradas')
        return {'FINISHED'}


class RLB_PT_exp_editor(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Rig labial'
    bl_label = '2. Editar expresiones'
    bl_order = 5

    def draw_header(self, context):
        try:
            from .. import linea as LN
            cara = _cara(context)
            hecho = bool(cara) and 'F_expresiones' in LN.hechos(cara)
            self.layout.label(text='', icon='CHECKMARK' if hecho else 'RADIOBUT_OFF')
        except Exception:
            pass

    def draw(self, context):
        from . import ajustes as AJ
        from .. import asistente as AS
        ed = context.scene.rlb_editor
        lay = self.layout
        lay.prop(context.scene.rlb, 'cara', text='Personaje')
        actual = _cara(context)
        if actual is not None and actual.get('rlb_editor_aviso'):
            AS._parrafo(lay, context, actual['rlb_editor_aviso'], 'ERROR')
        if _cara(context) is None:
            from .. import ojos_ui
            ps = ojos_ui.pivotes(ojos_ui.personaje(context))
            if len(ps) == 2 and all(p is not None for p in ps):
                caja = lay.box(); caja.label(text='Ojos', icon='HIDE_OFF')
                ojos_ui.dibujar(caja, context)
                return
            AS._parrafo(lay, context, 'Selecciona la cara del personaje', 'INFO'); return
        from .. import auto as AU
        if AU.editor_obsoleto(context):
            AU.programar_salida()
        r = lay.row(align=True); r.scale_y = 1.4
        r.operator('rlb.exp_navegar', text='', icon='TRIA_LEFT').paso = -1
        r.prop(ed, 'expr')
        r.operator('rlb.exp_navegar', text='', icon='TRIA_RIGHT').paso = 1
        if not ed.activo:
            from .. import ojos_ui
            caja = lay.box(); caja.label(text='Ojos', icon='HIDE_OFF')
            ojos_ui.dibujar(caja, context)
            c = lay.column(); c.scale_y = 2.0
            c.operator('rlb.exp_empezar', icon='GREASEPENCIL')
            AS._parrafo(lay, context, 'Tus cambios se guardan solos en cada expresión.', 'INFO')
            return
        # «Terminar» justo bajo el selector: botón principal de la etapa
        c = lay.column(); c.scale_y = 2.0
        c.operator('rlb.exp_terminar', icon='CHECKMARK')
        if not _modal_vivo[0]:
            c = lay.column(); c.scale_y = 1.4
            c.operator('rlb.exp_arrastrar', icon='RESTRICT_SELECT_OFF')
        c = lay.column(); c.scale_y = 1.4
        c.prop(ed, 'intensidad', text='Intensidad', slider=True)
        AS._parrafo(lay, context, 'Arrastra los círculos de la cara para cambiar la expresión.', 'INFO')
        AS._parrafo(lay, context, 'Ctrl + arrastrar: la mueve hacia adelante o atrás.')
        lay.label(text='Ajustes y pesos: Propiedades > Objeto', icon='PROPERTIES')
        lay.separator()
        # ayudas: una sola columna de botones secundarios; «Mover los dos lados a la vez» queda junto a «Copiar este lado al otro»
        c = lay.column(align=True); c.scale_y = 1.4
        c.operator('rlb.exp_deshacer', icon='LOOP_BACK')
        c.operator('rlb.exp_original', icon='FILE_REFRESH').solo_seccion = False
        c.operator('rlb.exp_guardar_nueva', icon='ADD')
        c.operator('rlb.exp_espejo', icon='MOD_MIRROR')
        cara = _cara(context)
        zs = AJ.zonas(cara)
        for zid, titulo, secs, rejilla in ZONAS_UI:
            rejilla = _rejilla(zid, cara) if rejilla else rejilla
            abierta = ed.zona == zid
            col = lay.column(align=True)
            fila = col.row(align=True); fila.scale_y = 1.4
            fila.operator('rlb.exp_zona', text=titulo, icon='DOWNARROW_HLT' if abierta else 'RIGHTARROW',
                          depress=abierta).zona = zid
            if not abierta:
                continue
            caja = col.box()
            if zid == 'globos':
                from .. import ojos_ui
                ojos_ui.dibujar(caja, context)
                continue
            base = caja.box(); base.label(text='Restaurar a la base', icon='LOOP_BACK')
            regiones = [('nariz', 'Nariz'), ('mejillas', 'Mejillas')] if zid == 'cara' else [(zid, titulo)]
            for region, texto in regiones:
                if region in ('ojos', 'cejas', 'mejillas'):
                    base.label(text=texto)
                    for lado, etiqueta in (('L', 'Izquierdo'), ('R', 'Derecho'), ('BOTH', 'Ambos')):
                        op = base.operator('rlb.exp_base_region', text=etiqueta, icon='LOOP_BACK')
                        op.region = region; op.lado = lado
                else:
                    op = base.operator('rlb.exp_base_region', text=texto + ' · restaurar a la base', icon='LOOP_BACK')
                    op.region = region; op.lado = 'BOTH'
            if zid == 'ojos':
                visual = caja.box()
                visual.label(text='Visualización')
                visual.prop(ed, 'ver_puntos')
                visual.prop(ed, 'ver_pesos', text='Mostrar pesos')
            if zid == 'ojos':
                rr = caja.row(align=True); rr.scale_y = 1.4
                rr.prop(ed, 'parte_ojos', expand=True)
                rr = caja.column(align=True); rr.scale_y = 1.4
                rr.operator('rlb.exp_ojos_basal', text='Basal superior', icon='LOOP_BACK').parte = 'sup'
                rr.operator('rlb.exp_ojos_basal', text='Basal inferior', icon='LOOP_BACK').parte = 'inf'
                AS._parrafo(caja, context, 'Basal devuelve ese párpado a la malla base dentro de esta expresión.')
                if cara.get('rlb_seguimiento_parpados'):
                    AS._parrafo(caja, context, 'Los puntos siguen el borde restante al salir de Edición.')
                aviso = cara.get('rlb_seguimiento_aviso', '')
                if aviso.startswith(('No se ', 'No queda ')):
                    AS._parrafo(caja, context, aviso, 'ERROR')
                if ed.parte_ojos != 'ambos':
                    rejilla = [f for f in rejilla if f and f[0].startswith('parpado_' + ed.parte_ojos + '_')]
            if zid in ('boca', 'cejas'):          # selector de densidad: botones en fila, bien visibles
                b = caja.box()
                b.label(text='Círculos de la boca:' if zid == 'boca' else 'Círculos por ceja:', icon='PARTICLE_POINT')
                rd = b.row(align=True); rd.scale_y = 1.4
                rd.enabled = not cara.get('rlb_manual_activo', False)
                rd.prop(ed, 'dens_boca' if zid == 'boca' else 'dens_cejas', expand=True)
            if rejilla:
                if zid == 'ojos':
                    caja.prop(ed, 'seleccion_parpado', expand=True)
                    caja.prop(ed, 'enlazar')
                AS._parrafo(caja, context, 'Elige un círculo (o haz clic en él en la cara):')
                g = caja.column(align=True)
                for filas in rejilla:
                    rr = g.row(align=True); rr.scale_y = 1.4
                    for p in filas:
                        if p is None:
                            rr.label(text=''); continue
                        seleccionado = p in puntos_parpado_seleccion(ed) if zid == 'ojos' else ed.punto == p
                        rr.operator('rlb.exp_punto', text=_texto_punto(p, cara), depress=seleccionado).punto = p
                if ed.punto in zs and any(ed.punto in f for f in rejilla):
                    txt, _, ds = zs[ed.punto]
                    b = caja.box(); b.label(text=_vis(txt), icon='PARTICLE_POINT')
                    if zid == 'ojos' and ed.seleccion_parpado != 'punto':
                        AS._parrafo(b, context, 'Los puntos en su límite se detienen; los demás continúan.')
                    cc = b.column(align=True); cc.scale_y = 1.4
                    for d in ds:
                        pos, neg = AJ.TEXTO_DIR[d]
                        fila = cc.row()
                        centro_fijo = d == 'derecha' and ed.enlazar and not AJ.lado_par(ed.punto, cara)[1]
                        fila.enabled = not centro_fijo
                        if zid == 'ojos' and ed.seleccion_parpado != 'punto':
                            fila.prop(ed, 'grupo_' + d, text=f'{neg} ← → {pos}', slider=True)
                        else:
                            _slider(ed, fila, AJ.nombre(ed.punto, d), f'{neg} ← → {pos}', context)
                        if centro_fijo:
                            AS._parrafo(cc, context, 'Desactiva Simetría para mover el centro a los lados.')
            if zid == 'boca':
                b = caja.box(); b.label(text='Forma de la boca', icon='MESH_DATA')
                cc = b.column(align=True); cc.scale_y = 1.4
                for k, (txt, _, pos, neg) in AJ.MODELAR.items():
                    AS._parrafo(cc, context, txt)
                    _slider(ed, cc, k, f'{neg} ← → {pos}', context)
            if zid == 'ojos':
                b = caja.box(); b.label(text='Abrir y cerrar los párpados', icon='HIDE_OFF')
                rr = b.row(align=True); rr.scale_y = 1.4
                for pose, texto in (('ABRIR', 'Abrir'), ('MEDIO', 'Entrecerrar'), ('CERRAR', 'Cerrar')):
                    rr.operator('rlb.exp_ojos_pose', text=texto).pose = pose
                _gestos(ed, ('ojos',), b, context, mostrar_todos=True)
                if any(c.name.startswith('eyeBlink_') and _val(c) > 99 for c in ed.canales):
                    AS._parrafo(b, context, 'Con el cierre al 100 %, los demás gestos no abren el ojo. Pulsa Abrir o Entrecerrar para partir de esa posición.')
                b = caja.box(); b.label(text='Mirada', icon='HIDE_OFF')
                cc = b.column(align=True); cc.prop(ed, 'mirada_h', text='Izq. / der.', slider=True)
                cc.prop(ed, 'mirada_v', text='Abajo / arriba', slider=True)
                b = caja.box(); b.label(text='Párpados de esta expresión', icon='MESH_DATA')
                cc = b.column(align=True); cc.scale_y = 1.4
                if cara.mode == 'EDIT':
                    AS._parrafo(cc, context, 'Mueve los vértices de los párpados y pulsa guardar.')
                    cc.operator('rlb.exp_parpado_guardar', icon='CHECKMARK')
                else:
                    cc.operator('rlb.exp_parpado_editar', icon='VERTEXSEL')
                    cc.operator('rlb.exp_parpado_quitar', icon='X')
            if ed.mas and zid != 'ojos':
                b = caja.box(); r = b.row(); r.label(text='Movimientos', icon='MOD_SMOOTH'); r.prop(ed, 'todos', text='Ver todos')
                _gestos(ed, secs, b, context)
        lay.separator()
        # «Más opciones»: mismo estilo que los botones de zona (fila 1.4, con relieve y flecha)
        r = lay.row(align=True); r.scale_y = 1.4
        r.prop(ed, 'mas', toggle=True, icon='DOWNARROW_HLT' if ed.mas else 'RIGHTARROW', emboss=True)
        if ed.mas:
            c = lay.column(align=True)
            c.prop(ed, 'ver_original', toggle=True, icon='HIDE_OFF')
            c.operator('rlb.exp_encuadrar', icon='VIEW_CAMERA')
            c.operator('rlb.exp_miniatura', icon='IMAGE_DATA')
        lay.separator()
        guardar = lay.column(); guardar.scale_y = 1.8
        guardar.operator('rlb.exp_guardar', text='Guardar expresión', icon='FILE_TICK')


# ------------------------------------------------------------------ un punto grande por control sobre la cara
def _pos_puntos(cara, ids):
    anclas = cara.get('aj_anclas', {})
    ok = [p for p in ids if p in anclas]
    if not ok:
        return [], []
    superficies = cara.get('aj_superficies_labios', {})
    def muestra(key, p):
        datos = superficies.get(p)
        if datos is not None:
            return sum((np.array(key.data[int(i)].co) * float(w) for i, w in zip(datos['tri'], datos['w'])), np.zeros(3))
        return np.array(key.data[int(anclas[p])].co)
    kb = cara.data.shape_keys.key_blocks
    B = np.array([muestra(kb[0], p) for p in ok])
    P = B.copy()
    for k in kb[1:]:
        if k.value:
            P += (np.array([muestra(k, p) for p in ok]) - B) * k.value
    M = cara.matrix_world
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    arm = rig.parent if rig is not None else None
    if arm is not None and rig.parent_bone in arm.pose.bones:
        pb = arm.pose.bones[rig.parent_bone]
        M = arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted() @ arm.matrix_world.inverted() @ cara.matrix_world
    Mn = np.array(M)
    W = P @ Mn[:3, :3].T + Mn[:3, 3]
    return ok, W


def _dibujar():
    """círculos sobre la cara (todas las zonas): borde transparente con una cruz fina; el elegido y el que está bajo el
    cursor, algo mayores. Solo dibuja: no escribe ninguna propiedad."""
    try:
        from bpy_extras.view3d_utils import location_3d_to_region_2d
        ctx = bpy.context
        ed = getattr(ctx.scene, 'rlb_editor', None)
        if ed is None or not ed.activo:
            return
        if not ed.ver_puntos and not ed.ver_pesos:
            return
        cara = _cara(ctx)
        if cara is None or ctx.region_data is None:
            return
        if cara.mode in {'EDIT', 'WEIGHT_PAINT'}:
            _pesos_cache.clear()
            return
        ids, W = _pos_eval(ctx, cara, _todos_ids(cara))
        if not ids:
            return
        if ed.ver_pesos and ed.punto:
            try:
                _dibujar_pesos(ctx, cara, ed.punto)
            except Exception as e:
                print('editor pesos:', e)
        if not ed.ver_puntos:
            return
        sh = gpu.shader.from_builtin('UNIFORM_COLOR')
        gpu.state.blend_set('ALPHA')
        n = 32
        ang = [2 * math.pi * k / n for k in range(n)]
        for i, p in enumerate(ids):
            c = location_3d_to_region_2d(ctx.region, ctx.region_data, W[i])
            if c is None:
                continue
            elegido = p in puntos_parpado_seleccion(ed) if ed.punto.startswith('parpado_') else p == ed.punto
            sobre = p == _hover[0]
            r = 13.0 if sobre else 11.0 if elegido else 8.0
            op = 1.0 if sobre else 0.75 if elegido else 0.45
            circ = [(c.x + r * math.cos(a), c.y + r * math.sin(a)) for a in ang]
            gpu.state.line_width_set(3.0 if sobre else 2.0 if elegido else 1.2)
            borde = batch_for_shader(sh, 'LINE_STRIP', {'pos': circ + [circ[0]]})
            sh.bind(); sh.uniform_float('color', (1.0, 1.0, 1.0, op)); borde.draw(sh)
            k = 4.0 if (elegido or sobre) else 3.0
            cruz = batch_for_shader(sh, 'LINES', {'pos': [(c.x - k, c.y), (c.x + k, c.y), (c.x, c.y - k), (c.x, c.y + k)]})
            sh.bind(); sh.uniform_float('color', (1.0, 1.0, 1.0, min(1.0, op + 0.2))); cruz.draw(sh)
        gpu.state.line_width_set(1.0); gpu.state.blend_set('NONE')
    except Exception as e:
        print('editor puntos:', e)


_handler = [None]


# ------------------------------------------------------------------ arrastrar los círculos con el ratón
def _pausar_calidad(cara, ed):
    _restaurar_calidad()
    if ed.rapido:
        for m in cara.modifiers:
            if m.type == 'SUBSURF' and m.show_viewport:
                _rapido.append((cara, m.name, bool(m.show_viewport)))
                m.show_viewport = False


def _asegurar_bordes_editor(context, cara):
    if cara is None:
        return
    AJ = _ajustes()
    AJ.asegurar_bordes(cara)
    AJ.asegurar_horizontal(cara)
    ed = context.scene.rlb_editor
    if ed.activo:
        ctrl = BI.control(cara)
        for n in AJ.todas(cara):
            if n not in ed.canales and 'v_' + n in ctrl:
                txt, sec, lado, par = _info(n, cara)
                c = ed.canales.add(); c.name = n
                c.texto, c.seccion, c.lado, c.par, c.ajuste = txt, sec, lado, par, True
                c.fino = float(ctrl['v_' + n]) * 100
    _pesos_cache.clear()


def _restaurar_calidad():
    for ob, nombre, visible in _rapido:
        try:
            m = ob.modifiers.get(nombre)
            if m is not None:
                m.show_viewport = visible
        except (ReferenceError, RuntimeError):
            pass
    _rapido.clear()


def _ganancias(context, cara, ed, p, reg, rv3d):
    """Calibra píxeles con el movimiento real, incluido el suavizado y la mandíbula."""
    from bpy_extras.view3d_utils import location_3d_to_region_2d
    AJ = _ajustes()
    ctrl = _ctrl(ed)
    resultado = {}
    context.view_layer.update()
    _, pareja = AJ.lado_par(p, cara)
    ids_consulta = [p] + ([pareja] if ed.enlazar and pareja else [])
    ids, W = _pos_eval(context, cara, ids_consulta)
    if p not in ids:
        return resultado
    c0 = location_3d_to_region_2d(reg, rv3d, W[ids.index(p)])
    if c0 is None:
        return resultado
    cp0 = location_3d_to_region_2d(reg, rv3d, W[ids.index(pareja)]) if pareja in ids else None
    try:
        for d in ('arriba', 'afuera', 'derecha'):
            ch = ed.canales.get(AJ.nombre(p, d))
            if ch is None:
                continue
            nombres = [ch.name] + ([ch.par] if ed.enlazar and ch.par else [])
            prev = {n: float(ctrl['v_' + n]) for n in nombres if 'v_' + n in ctrl}
            paso = 0.05 if all(v < 0.9 for v in prev.values()) else -0.05
            try:
                for n, v in prev.items():
                    ctrl['v_' + n] = v + paso * (-1. if d == 'derecha' and n == ch.par else 1.)
                ctrl.update_tag(); context.view_layer.update()
                ids1, W1 = _pos_eval(context, cara, ids_consulta)
                c1 = location_3d_to_region_2d(reg, rv3d, W1[ids1.index(p)]) if p in ids1 else None
                if c1 is not None:
                    desplazamiento = (c1.y - c0.y) if d == 'arriba' else abs(c1.x - c0.x) * (1 if paso > 0 else -1)
                    if abs(desplazamiento) > 0.05 and ed.intensidad > 0.01:
                        resultado[d] = min(20., abs(100 * paso / desplazamiento / (ed.intensidad / 100)))
                    if cp0 is not None:
                        cp1 = location_3d_to_region_2d(reg, rv3d, W1[ids1.index(pareja)]) if pareja in ids1 else None
                        if cp1 is not None:
                            dp = cp1.y - cp0.y if d == 'arriba' else cp1.x - cp0.x
                            if abs(dp) > 0.01:
                                resultado['par_' + d] = abs(desplazamiento / dp)
            finally:
                for n, v in prev.items():
                    ctrl['v_' + n] = v
    finally:
        ctrl.update_tag(); context.view_layer.update()
    return resultado


def _datos_pesos(cara, punto, ks):
    """Reutiliza la máscara; comprueba cambios externos como máximo cada medio segundo."""
    import hashlib
    sk = cara.data.shape_keys
    n = len(cara.data.vertices)
    estructura = (cara.as_pointer(), cara.data.as_pointer(), sk.as_pointer(), punto, n,
                  len(cara.data.loops), len(cara.data.polygons), tuple(k.as_pointer() for k in ks))
    ahora = time.monotonic()
    if _pesos_cache.get('estructura') == estructura and ahora < _pesos_cache.get('verificar', 0):
        return _pesos_cache['w'], _pesos_cache['tris']
    # ShapeKey.points ofrece el acceso masivo optimizado de Blender para mallas.
    # Mantener el fallback permite leer archivos/API anteriores sin cambiar resultados.
    base_datos = getattr(sk.key_blocks[0], 'points', None)
    if base_datos is None or len(base_datos) != n:
        base_datos = sk.key_blocks[0].data
    base = np.empty(n * 3, dtype=np.float32); base_datos.foreach_get('co', base)
    arrays = []
    for k in ks:
        datos = getattr(k, 'points', None)
        if datos is None or len(datos) != n:
            datos = k.data
        co = np.empty(n * 3, dtype=np.float32); datos.foreach_get('co', co)
        arrays.append(co)
    loops = np.empty(len(cara.data.loops), dtype=np.int32)
    cara.data.loops.foreach_get('vertex_index', loops)
    firmas = tuple(hashlib.blake2b(a, digest_size=8).digest() for a in [base, loops] + arrays)
    token = (estructura, firmas)
    if _pesos_cache.get('token') != token:
        w = np.zeros(n)
        referencias = {}
        if punto.startswith('parpado_'):
            from . import pesos_parpados as PP
            referencias = PP.datos(cara).get('ganancias_base', {})
        for co, key in zip(arrays, ks):
            influencia = np.linalg.norm((co - base).reshape(-1, 3), axis=1)
            if punto.startswith('parpado_'):
                escala = float(referencias.get(key.name, 0.)) or float(influencia.max())
                if escala > 1e-12:
                    influencia = influencia / escala
            w = np.maximum(w, influencia)
        tris = []
        if n and w.max() > 1e-10:
            escala = 1. if punto.startswith('parpado_') else float(w.max())
            w = np.clip(w / escala, 0., 1.)
            cara.data.calc_loop_triangles()
            triangulos = np.empty(len(cara.data.loop_triangles) * 3, dtype=np.int32)
            cara.data.loop_triangles.foreach_get('vertices', triangulos)
            triangulos = triangulos.reshape(-1, 3)
            tris = triangulos[np.max(w[triangulos], axis=1) > 0.02].tolist()
        _pesos_cache.clear()
        _pesos_cache.update(token=token, estructura=estructura, w=w, tris=tris)
    _pesos_cache['verificar'] = ahora + .5
    return _pesos_cache['w'], _pesos_cache['tris']


def _dibujar_pesos(context, cara, punto):
    """Influencia en 3D con oclusión: no proyectar el forro oculto a través del labio."""
    sk = cara.data.shape_keys
    if sk is None:
        return
    AJ = _ajustes()
    puntos = puntos_parpado_seleccion(context.scene.rlb_editor, punto) if punto.startswith('parpado_') else [punto]
    if not punto.startswith('parpado_') and context.scene.rlb_editor.enlazar:
        _, pareja = AJ.lado_par(punto, cara)
        if pareja:
            puntos.append(pareja)
    ks = [sk.key_blocks.get(AJ.nombre(p, d)) for p in puntos for d in ('arriba', 'adelante', 'afuera', 'derecha')]
    ks = [k for k in ks if k is not None]
    if not ks:
        return
    w, tris = _datos_pesos(cara, punto, ks)
    if not tris:
        return
    ev = cara.evaluated_get(context.evaluated_depsgraph_get())
    vs = ev.data.vertices
    if len(vs) < len(w):
        return
    M = ev.matrix_world
    posiciones = {}
    # Un sesgo mínimo evita z-fighting de los triángulos de control sobre Subsurf.
    # Su magnitud escala con la banda, nunca con coordenadas fijas de un personaje.
    anclas = cara.get('aj_anclas', {})
    escala = 0.0
    if 'comisura_L' in anclas and 'comisura_R' in anclas:
        escala = (vs[int(anclas['comisura_L'])].co - vs[int(anclas['comisura_R'])].co).length
    hacia_vista = context.region_data.view_rotation @ Vector((0, 0, 1))
    sesgo = hacia_vista * max(escala * 0.001, 1e-8)
    for i in {i for t in tris for i in t}:
        posiciones[i] = M @ vs[i].co + sesgo
    pos, colores = [], []
    for tri in tris:
        for i in tri:
            pos.append(tuple(posiciones[i]))
            v = float(w[i])
            colores.append((min(1., 2 * v), 1. - abs(2 * v - 1.), max(0., 1. - 2 * v),
                            0.55 if v > 0.01 else 0.0))
    if pos:
        sh = gpu.shader.from_builtin('SMOOTH_COLOR')
        prev_blend = gpu.state.blend_get()
        prev_depth = gpu.state.depth_test_get()
        prev_mask = gpu.state.depth_mask_get()
        gpu.state.blend_set('ALPHA')
        gpu.state.depth_test_set('LESS_EQUAL')
        gpu.state.depth_mask_set(False)
        try:
            with gpu.matrix.push_pop():
                with gpu.matrix.push_pop_projection():
                    gpu.matrix.load_matrix(context.region_data.view_matrix)
                    gpu.matrix.load_projection_matrix(context.region_data.window_matrix)
                    batch = batch_for_shader(sh, 'TRIS', {'pos': pos, 'color': colores})
                    sh.bind(); batch.draw(sh)
        finally:
            gpu.state.depth_mask_set(prev_mask)
            gpu.state.depth_test_set(prev_depth)
            gpu.state.blend_set(prev_blend)


ESCALA_PX = 150.0           # píxeles de arrastre de 0 a 100 %
RADIO_PX = 16.0             # distancia máxima al círculo para cogerlo


def iniciar_arrastre(ed, cara, p):
    """valores de partida (en %) de las direcciones del círculo p -> {dirección: valor}."""
    AJ = _ajustes()
    zs = AJ.zonas(cara)
    if p not in zs:
        return {}
    base = {d: _val(ed.canales[AJ.nombre(p, d)]) for d in zs[p][2] if AJ.nombre(p, d) in ed.canales}
    parejas = {}
    for d in base:
        c = ed.canales[AJ.nombre(p, d)]
        par = ed.canales.get(c.par) if c.par else None
        if par is not None:
            parejas[d] = _val(par)
    if base:
        base['_parejas'] = parejas
        if p.startswith('parpado_') and ed.seleccion_parpado != 'punto':
            base['_grupo'] = {d: _grupo_bases(ed, p, d) for d in base if not d.startswith('_')}
    return base


def mover_arrastre(ed, p, base, dx, dy, ctrl=False, signo=1.0, escala=ESCALA_PX, ganancias=None):
    """convierte el desplazamiento del ratón (píxeles desde donde empezó el arrastre) en valores del círculo p.
    Vertical -> 'arriba' (con Ctrl, 'adelante'); horizontal -> 'afuera' (signo = +1 si hacia la derecha de la pantalla
    es hacia fuera de la cara). Devuelve {dirección: valor nuevo}. Los dos lados se enlazan por «enlazar»."""
    AJ = _ajustes()
    pct = 100.0 / escala
    nuevo = {}
    if '_grupo' in base:
        _bloqueo[0] = True
        try:
            for d, bases in base['_grupo'].items():
                g = (ganancias or {}).get(d, pct)
                delta = (dy * g if d == 'arriba' and not ctrl else
                         dy * g if d == 'adelante' and ctrl else dx * g if d == 'derecha' else 0.)
                nuevo[d] = _grupo_mover(ed, bases, delta)
        finally: _bloqueo[0] = False
        _nota_cambio(ed); _refrescar(bpy.context, ed, guardar=not _h['gesto'])
        return nuevo
    cambiado = False
    _bloqueo[0] = True
    try:
        for d, b in base.items():
            if d.startswith('_'):
                continue
            v = b
            g = (ganancias or {}).get(d, pct)
            if d == 'arriba' and not (ctrl and 'adelante' in base):
                v = b + dy * g
            elif d == 'adelante' and ctrl:
                v = b + dy * g
            elif d == 'afuera':
                v = b + dx * signo * g
            elif d == 'derecha':
                # Los puntos del eje conservan el centro mientras esté activada la simetría.
                _, pareja_eje = AJ.lado_par(p, _cara(bpy.context))
                if not ed.enlazar or pareja_eje:
                    v = b + dx * g
            v = max(-100.0, min(100.0, v))
            c = ed.canales.get(AJ.nombre(p, d))
            if c is not None and ed.enlazar and c.par:
                inicio_par = base.get('_parejas', {}).get(d, b)
                factor = (ganancias or {}).get('par_' + d, 1.) * (-1. if d == 'derecha' else 1.)
                if abs(factor) > 1e-8:
                    minimo, maximo = sorted(((-100. - inicio_par) / factor, (100. - inicio_par) / factor))
                    delta = max(minimo, min(maximo, v - b))
                    v = max(-100., min(100., b + delta))
            nuevo[d] = v
            if c is not None and abs(_val(c) - v) > 1e-6:
                _poner_val(c, v)
                if ed.enlazar and c.par:
                    pareja = ed.canales.get(c.par)
                    if pareja is not None:
                        inicio_par = base.get('_parejas', {}).get(d, b)
                        factor = (ganancias or {}).get('par_' + d, 1.) * (-1. if d == 'derecha' else 1.)
                        vp = inicio_par + (v - b) * factor
                        _poner_val(pareja, max(-100., min(100., vp)))
                cambiado = True
    finally:
        _bloqueo[0] = False
    if cambiado:
        _nota_cambio(ed)
        _refrescar(bpy.context, ed, guardar=not _h['gesto'])
    return nuevo


def _bajo_raton(window, event):
    """(área, región de la vista, region_3d) del visor 3D bajo el cursor, o None si está sobre la interfaz."""
    mx, my = event.mouse_x, event.mouse_y
    for a in window.screen.areas:
        if a.type != 'VIEW_3D' or not (a.x <= mx < a.x + a.width and a.y <= my < a.y + a.height):
            continue
        reg = next((r for r in a.regions if r.type == 'WINDOW'), None)
        if reg is None:
            return None
        for r in a.regions:
            if r.type != 'WINDOW' and r.width > 2 and r.height > 2 and r.x <= mx < r.x + r.width and r.y <= my < r.y + r.height:
                return None
        return a, reg, a.spaces.active.region_3d
    return None


def _circulo_bajo(context, region, rv3d, mx, my):
    """(id, signo) del círculo más cercano al cursor (coordenadas de la región) o ('', 1)."""
    if not context.scene.rlb_editor.ver_puntos:
        return '', 1.0
    from bpy_extras.view3d_utils import location_3d_to_region_2d
    cara = _cara(context)
    if cara is None:
        return '', 1.0
    ids, W = _pos_eval(context, cara, _todos_ids(cara))
    pts = []
    for p, w in zip(ids, W):
        c = location_3d_to_region_2d(region, rv3d, w)
        if c is not None:
            pts.append((p, c))
    if not pts:
        return '', 1.0
    cx = sum(c.x for _, c in pts) / len(pts)
    mejor, dmin = '', RADIO_PX
    for p, c in pts:
        d = math.hypot(c.x - mx, c.y - my)
        if d <= dmin:
            mejor, dmin = p, d
    if not mejor:
        return '', 1.0
    px = next(c.x for p, c in pts if p == mejor)
    return mejor, (1.0 if px >= cx else -1.0)


def _zona_de(p, cara):
    for z in ZONAS_UI:
        if z[3] and any(p in f for f in _rejilla(z[0], cara)):
            return z[0]
    return ''


class RLB_OT_exp_arrastrar(bpy.types.Operator):
    """Mueve los círculos de la cara arrastrándolos con el ratón"""
    bl_idname = 'rlb.exp_arrastrar'
    bl_label = 'Editar con el ratón'
    bl_description = ('Activa el arrastre de los círculos sobre la cara: arriba y abajo los sube o baja, a los lados los abre '
                      'o cierra, y con Ctrl los mueve hacia adelante o atrás. Fuera de los círculos el ratón funciona como siempre')

    def invoke(self, context, event):
        ed = context.scene.rlb_editor
        if not ed.activo:
            self.report({'INFO'}, 'Primero pulsa «Empezar a editar»')
            return {'CANCELLED'}
        if not ed.ver_puntos:
            ed.ver_puntos = True
        _asegurar_dibujo()
        self._token = object()
        bpy.app.driver_namespace['rlb_arrastre_token'] = self._token   # un modal nuevo hace salir a cualquier anterior
        _modal_vivo[0] = True
        _arr.clear()
        context.window_manager.modal_handler_add(self)
        return {'RUNNING_MODAL'}

    def _fin(self, context, ed=None):
        if bpy.app.driver_namespace.get('rlb_arrastre_token') is self._token:
            _modal_vivo[0] = False
        if _arr and ed is not None:
            _gesto_fin(ed)
        _restaurar_calidad()
        habia_arrastre = bool(_arr)
        _arr.clear(); _hover[0] = ''
        if habia_arrastre:
            context.view_layer.update()
        try:
            context.window.cursor_set('DEFAULT')
        except Exception:
            pass
        return {'FINISHED', 'PASS_THROUGH'}

    def cancel(self, context):
        self._fin(context, context.scene.rlb_editor)

    def modal(self, context, event):
        ed = context.scene.rlb_editor
        if bpy.app.driver_namespace.get('rlb_arrastre_token') is not self._token:
            return {'FINISHED', 'PASS_THROUGH'}
        if not ed.activo:
            r = self._fin(context)
            _tag_redraw(context)
            return r
        if context.window is None or event.type in {'TIMER', 'TIMER_REPORT', 'NONE', 'INBETWEEN_MOUSEMOVE'}:
            return {'PASS_THROUGH'}
        cara = _cara(context)
        # --- arrastre en curso
        if _arr:
            if event.type == 'MOUSEMOVE':
                try:
                    mover_arrastre(ed, _arr['punto'], _arr['base'], event.mouse_x - _arr['x'], event.mouse_y - _arr['y'],
                                   ctrl=event.ctrl, signo=_arr['signo'], ganancias=_arr.get('ganancias'))
                except Exception as e:
                    _gesto_fin(ed); _arr.clear()
                    context.view_layer.update()
                    self.report({'ERROR'}, str(e))
                _tag_redraw(context)
                return {'RUNNING_MODAL'}
            if (event.type == 'LEFTMOUSE' and event.value == 'RELEASE') or (event.type == 'ESC' and event.value == 'PRESS'):
                _gesto_fin(ed); _arr.clear()     # Esc solo suelta el arrastre; no cancela la edición
                context.view_layer.update()
                _tag_redraw(context)
                return {'RUNNING_MODAL'}
            return {'RUNNING_MODAL'}
        # --- sin arrastre: resaltar y coger
        if event.type not in {'MOUSEMOVE', 'LEFTMOUSE'} or cara is None or cara.mode in {'EDIT', 'WEIGHT_PAINT'}:
            return {'PASS_THROUGH'}
        _asegurar_ocultos(context, ed)
        sobre = _bajo_raton(context.window, event) if not event.alt else None
        p, signo = '', 1.0
        if sobre is not None:
            area, reg, rv3d = sobre
            p, signo = _circulo_bajo(context, reg, rv3d, event.mouse_x - reg.x, event.mouse_y - reg.y)
        if event.type == 'MOUSEMOVE':
            if p != _hover[0]:
                _hover[0] = p
                try:
                    context.window.cursor_set('HAND' if p else 'DEFAULT')
                except Exception:
                    pass
                _tag_redraw(context)
            return {'PASS_THROUGH'}
        if event.value == 'PRESS' and p:
            _elegir_punto(ed, p)
            base = iniciar_arrastre(ed, cara, p)
            if not base:
                return {'PASS_THROUGH'}
            ed.zona = _zona_de(p, cara) or ed.zona
            _elegir_punto(ed, p)
            if ed.ver_original:
                ed.ver_original = False
            _gesto_inicio(ed)
            _pausar_calidad(cara, ed)
            _arr.update(punto=p, base=base, x=event.mouse_x, y=event.mouse_y, signo=signo)
            _arr['ganancias'] = _ganancias(context, cara, ed, p, reg, rv3d)
            _tag_redraw(context)
            return {'RUNNING_MODAL'}
        return {'PASS_THROUGH'}


def _expr_actual(ed):
    return ed.accion.split('_FACS_', 1)[-1]


def _guardar_retoque(context, ed, cara):
    """guarda el retoque de párpados en curso y lo deja activo (valor 100 %) en esta expresión."""
    from . import retoque_parpados as RP
    expr = cara.get('rlb_retoque_activo') or _expr_actual(ed)
    r = RP.guardar(cara, expr)
    k = r['key']
    c = ed.canales.get(k)
    if c is None:
        c = ed.canales.add(); c.name = k
        c.texto, c.seccion, c.lado, c.par, c.ajuste = _info(k, cara)[0], 'ojos', '', '', False
    _bloqueo[0] = True
    try:
        _poner_val(c, 100.0 if r['movidos'] else 0.0)
    finally:
        _bloqueo[0] = False
    _nota_cambio(ed)
    _refrescar(context, ed)
    return r


class RLB_OT_exp_parpado_editar(bpy.types.Operator):
    """Edita a mano cada vértice del párpado en esta expresión"""
    bl_idname = 'rlb.exp_parpado_editar'
    bl_label = 'Retocar párpados a mano'
    bl_description = ('Entra en modo edición con la cara ya puesta en esta expresión: mueve los vértices de los párpados donde '
                      'haga falta y pulsa «Guardar retoque». Solo cambia ESTA expresión; el resto no se toca')

    def execute(self, context):
        ed = context.scene.rlb_editor
        cara = _cara(context)
        if cara is None or not ed.activo:
            self.report({'ERROR'}, 'Primero pulsa «Empezar a editar»'); return {'CANCELLED'}
        from . import retoque_parpados as RP
        try:
            r = RP.preparar(cara, _expr_actual(ed))
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        self.report({'INFO'}, f"Mueve los vértices de los párpados ({r['vertices_zona']} en la zona) y pulsa «Guardar retoque»")
        return {'FINISHED'}


class RLB_OT_exp_parpado_guardar(bpy.types.Operator):
    """Guarda el retoque de párpados de esta expresión"""
    bl_idname = 'rlb.exp_parpado_guardar'
    bl_label = 'Guardar retoque de párpados'
    bl_description = 'Sale del modo edición y guarda en esta expresión lo que moviste (solo cuenta la zona de los párpados)'

    def execute(self, context):
        ed = context.scene.rlb_editor
        cara = _cara(context)
        if cara is None or not ed.activo:
            return {'CANCELLED'}
        try:
            r = _guardar_retoque(context, ed, cara)
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        self.report({'INFO'}, f"Retoque guardado: {r['movidos']} vértices, hasta {r['max_mm']} mm")
        return {'FINISHED'}


class RLB_OT_exp_parpado_quitar(bpy.types.Operator):
    """Borra el retoque de párpados de esta expresión"""
    bl_idname = 'rlb.exp_parpado_quitar'
    bl_label = 'Quitar retoque de párpados'
    bl_description = 'Borra el retoque a mano de los párpados en esta expresión (vuelve a como salía sin retocar)'

    def execute(self, context):
        ed = context.scene.rlb_editor
        cara = _cara(context)
        if cara is None or not ed.activo:
            return {'CANCELLED'}
        from . import retoque_parpados as RP
        k = RP.nombre(_expr_actual(ed))
        c = ed.canales.get(k)
        if c is not None:
            ed.canales.remove(list(ed.canales).index(c))
        r = RP.quitar(cara, _expr_actual(ed))
        _nota_cambio(ed)
        _refrescar(context, ed)
        self.report({'INFO'}, 'Retoque quitado' if r['quitado'] else 'Esta expresión no tenía retoque')
        return {'FINISHED'}


class RLB_OT_exp_deshacer(bpy.types.Operator):
    """Deshace el último cambio de esta expresión"""
    bl_idname = 'rlb.exp_deshacer'
    bl_label = 'Deshacer último cambio'
    bl_description = 'Deshace el último cambio que hiciste en esta expresión (hasta 30 cambios atrás)'

    def execute(self, context):
        ed = context.scene.rlb_editor
        if not ed.activo or not deshacer(context, ed):
            self.report({'INFO'}, 'No hay nada que deshacer')
            return {'CANCELLED'}
        _tag_redraw(context)
        return {'FINISHED'}


class RLB_OT_exp_guardar_nueva(bpy.types.Operator):
    """Guarda lo que ves como una expresión nueva"""
    bl_idname = 'rlb.exp_guardar_nueva'
    bl_label = 'Guardar como expresión nueva'
    bl_description = ('Guarda la cara tal como la ves ahora como una expresión nueva, con su foto en la estantería de abajo. '
                      'La expresión de la que partiste conserva tus cambios (puedes usar «Volver al original»)')
    bl_options = {'REGISTER', 'UNDO'}
    nombre: StringProperty(name='Nombre', description='Nombre de la expresión nueva', default='Mi expresión')

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self, width=320)

    def draw(self, context):
        self.layout.prop(self, 'nombre')

    def execute(self, context):
        ed = context.scene.rlb_editor
        cara = _cara(context)
        if cara is None or not ed.activo:
            self.report({'ERROR'}, 'Primero pulsa «Empezar a editar»'); return {'CANCELLED'}
        try:
            a = crear_expresion(context, ed, cara, self.nombre)
        except ValueError as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}
        self.report({'INFO'}, 'Guardada: ' + a.name[len(cara.name) + 6:].replace('_', ' '))
        return {'FINISHED'}


def crear_expresion(context, ed, cara, nombre, miniatura=True):
    """crea la acción <cara>_FACS_<nombre> con los valores que se ven ahora (intensidad incluida), la marca como
    asset FACS (sale en la estantería) y pasa a editarla."""
    limpio = '_'.join((nombre or '').strip().split())
    limpio = ''.join(ch for ch in limpio if ch.isalnum() or ch in '_-')
    if not limpio:
        raise ValueError('Escribe un nombre para la expresión')
    an = PO.nombre_accion(cara, limpio)
    if bpy.data.actions.get(an) is not None:
        raise ValueError('Ya existe una expresión con ese nombre')
    k = ed.intensidad / 100.0
    a = bpy.data.actions.new(an)
    PO._guardar(a, {n: v * k for n, v in _actuales(ed).items()}, (ed.mirada_h * k, ed.mirada_v * k))
    a['rlb_facs_cara'] = cara.name
    a['rlb_facs_expr'] = limpio
    a['intensidad'] = 1.0
    a['rlb_editada'] = False
    a.asset_mark()
    ad_ = a.asset_data
    if PO.ETIQUETA not in [t.name for t in ad_.tags]:
        ad_.tags.new(PO.ETIQUETA)
    ad_.description = limpio.replace('_', ' ')
    if miniatura:
        try:
            carpeta = util.carpeta_revision(cara, 'miniaturas'); os.makedirs(carpeta, exist_ok=True)
            ruta = os.path.join(carpeta, f'{limpio}.png')
            PO._render_miniatura(cara, ruta, 256, 'TEXTURE'); PO._poner_miniatura(a, ruta)
        except Exception as e:
            print('miniatura:', e)
    ed.expr = an            # pasa a la nueva (la anterior ya quedó guardada)
    return a


# ------------------------------------------------------------------ invariante: rig viejo y control ocultos mientras se edita
def mostrar_puntos(context):
    """Recupera los puntos y su selección sin cambiar la pose ni las influencias."""
    ed = context.scene.rlb_editor
    if ed.activo:
        if not ed.ver_puntos:
            ed.ver_puntos = True
        _asegurar_dibujo()
        _lanzar_modal()
    _tag_redraw(context)


def _asegurar_dibujo():
    """El editor puede reanudarse con arrastre activo pero sin dibujar los círculos."""
    if _handler[0] is None:
        _handler[0] = bpy.types.SpaceView3D.draw_handler_add(_dibujar, (), 'WINDOW', 'POST_PIXEL')
    return _handler[0]


def _lanzar_modal():
    """arranca el arrastre sin un clic (p. ej. al reabrir un archivo con el editor activo)."""
    _asegurar_dibujo()
    if _modal_vivo[0]:
        return False
    wm = bpy.context.window_manager
    for w in wm.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                reg = next((r for r in a.regions if r.type == 'WINDOW'), None)
                try:
                    with bpy.context.temp_override(window=w, area=a, region=reg):
                        bpy.ops.rlb.exp_arrastrar('INVOKE_DEFAULT')
                    return True
                except Exception as e:
                    print('arrastrar (reanudar):', e)
                    return False
    return False


def _hist_ok(ed):
    return _h['accion'] == ed.accion and _h['actual'] is not None


def reanudar():
    """al abrir un archivo guardado con el editor activo: o se reanuda bien (oculta el rig viejo y el control y
    activa el arrastre) o se sale limpio."""
    try:
        ed = getattr(bpy.context.scene, 'rlb_editor', None)
        if ed is None or not ed.activo:
            return None
        _asegurar_bordes_editor(bpy.context, _cara(bpy.context))
        from .. import auto as AU
        if AU.editor_obsoleto(bpy.context):
            AU.salir_editor_obsoleto(bpy.context)
            return None
        _asegurar_ocultos(bpy.context, ed)
        if not _hist_ok(ed):
            _hist_reiniciar(ed)
        _lanzar_modal()
    except Exception as e:
        print('reanudar editor:', e)
    return None


def _vigilante():
    """temporizador ligero: mientras se edita, rig viejo y control siguen ocultos pase lo que pase."""
    try:
        ed = bpy.context.scene.rlb_editor
        if ed.activo:
            _asegurar_dibujo()
            from .. import auto as AU
            if not AU.editor_obsoleto(bpy.context):
                _asegurar_ocultos(bpy.context, ed)
    except Exception:
        pass
    return 1.5


@persistent
def _al_cargar_archivo(_=None):
    _rapido.clear(); _pesos_cache.clear()
    _modal_vivo[0] = False; _hover[0] = ''; _arr.clear(); _pilas.clear()
    _h.update(actual=None, accion='', gesto=False)
    bpy.app.timers.register(reanudar, first_interval=0.8)


CLASES = (RLB_ExpCanal, RLB_ExpEditor, RLB_OT_exp_empezar, RLB_OT_exp_navegar, RLB_OT_exp_terminar,
          RLB_OT_exp_zona, RLB_OT_exp_punto, RLB_OT_exp_ojos_pose, RLB_OT_exp_ojos_basal,
          RLB_OT_exp_original, RLB_OT_exp_espejo, RLB_OT_exp_encuadrar, RLB_OT_exp_miniatura,
          RLB_OT_exp_arrastrar, RLB_OT_exp_parpado_editar, RLB_OT_exp_parpado_guardar, RLB_OT_exp_parpado_quitar,
          RLB_OT_exp_deshacer, RLB_OT_exp_guardar_nueva, RLB_OT_exp_guardar, RLB_OT_exp_base_region,
          RLB_OT_exp_influencias_parpados, RLB_OT_exp_influencias_parpados_restaurar,
          RLB_OT_exp_cierre_parpados, RLB_OT_exp_cierre_parpados_restaurar,
          RLB_OT_exp_influencias_labios, RLB_OT_exp_influencias_restaurar, RLB_PT_exp_editor)


def register():
    # Una recarga en vivo no debe acumular botones «Guardar expresión».
    for f in list(getattr(bpy.types.VIEW3D_HT_header.draw, '_draw_funcs', ())):
        if getattr(f, '__name__', '') == '_guardar_cabecera' and getattr(f, '__module__', '').endswith('.facs.editor'):
            bpy.types.VIEW3D_HT_header.remove(f)
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.VIEW3D_HT_header.append(_guardar_cabecera)
    bpy.types.Scene.rlb_editor = PointerProperty(type=RLB_ExpEditor)
    from . import labios_manual_ui
    labios_manual_ui.register()
    from . import grosor_labios
    grosor_labios.register()
    from . import pesos_parpados_ui
    pesos_parpados_ui.register()
    from . import seguimiento_parpados
    seguimiento_parpados.register()
    from . import ajustes_generales
    ajustes_generales.register()
    _asegurar_dibujo()
    for f in list(bpy.app.handlers.load_post):
        if getattr(f, '_rlb_editor', False):
            bpy.app.handlers.load_post.remove(f)
    _al_cargar_archivo._rlb_editor = True
    bpy.app.handlers.load_post.append(_al_cargar_archivo)
    if not bpy.app.timers.is_registered(_vigilante):
        bpy.app.timers.register(_vigilante, first_interval=2.0, persistent=True)
    bpy.app.timers.register(reanudar, first_interval=1.0)


def unregister():
    from . import ajustes_generales
    ajustes_generales.unregister()
    from . import grosor_labios
    grosor_labios.unregister()
    bpy.types.VIEW3D_HT_header.remove(_guardar_cabecera)
    from . import pesos_parpados_ui
    pesos_parpados_ui.unregister()
    from . import seguimiento_parpados
    seguimiento_parpados.unregister()
    from . import labios_manual_ui
    labios_manual_ui.unregister()
    _restaurar_calidad()
    _pesos_cache.clear()
    if _handler[0] is not None:
        bpy.types.SpaceView3D.draw_handler_remove(_handler[0], 'WINDOW'); _handler[0] = None
    for f in list(bpy.app.handlers.load_post):
        if getattr(f, '_rlb_editor', False):
            bpy.app.handlers.load_post.remove(f)
    if bpy.app.timers.is_registered(_vigilante):
        bpy.app.timers.unregister(_vigilante)
    bpy.app.driver_namespace['rlb_arrastre_token'] = None
    del bpy.types.Scene.rlb_editor
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
