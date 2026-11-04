# Expresiones Corporales (SpanStories): genera, edita, guarda, reutiliza y exporta expresiones del tren superior
# (torso, hombros, brazos, manos, cuello y cabeza) que acompañan a los gestos de la cara del Rig Labial Bendy, en
# cualquier personaje con rig compatible (Rigify, Mixamo o genérico con tabla). Ver DISENO.md.
# Panel: Vista 3D > barra lateral (N) > «Cuerpo».
import bpy, json, time, textwrap
from bpy.props import (PointerProperty, BoolProperty, FloatProperty, FloatVectorProperty, EnumProperty,
                       StringProperty, IntProperty, CollectionProperty)

from .nucleo import util as U

CAT = 'Cuerpo'


def _nucleo(nombre):
    import importlib
    return importlib.import_module(f'{__package__}.nucleo.{nombre}')


def _poll_arm(self, o):
    return o.type == 'ARMATURE'


def _poll_mesh(self, o):
    return o.type == 'MESH'


# ======================================================================== datos en el rig (Object.ecorp)
class ECORP_Expresion(bpy.types.PropertyGroup):
    datos: StringProperty(name='Datos', description='Parámetros, pico, vida, tiempos y retoques (JSON)')
    bloqueada: BoolProperty(name='Bloquear', default=False,
                            description='No se regenera: la acción se edita a mano en el editor de acciones')
    accion: StringProperty(name='Acción')


class ECORP_Rig(bpy.types.PropertyGroup):
    perfil: StringProperty(name='Perfil', description='Perfil del rig (JSON)')
    expresiones: CollectionProperty(type=ECORP_Expresion)
    estilo: EnumProperty(name='Estilo', items=[('M', 'Masculino', 'Postura y gestos masculinos'),
                                               ('F', 'Femenino', 'Postura y gestos femeninos')], default='M')
    vinculo: BoolProperty(name='Vínculo con la cara', default=False)
    control: StringProperty(name='Control de la cara')
    tabla: StringProperty(name='Tabla cara -> cuerpo')
    int_cara: FloatProperty(name='Intensidad cara', default=1.0, min=0.0, max=1.5)
    int_cuerpo: FloatProperty(name='Intensidad cuerpo', default=1.0, min=0.0, max=1.5)
    previo: StringProperty()
    vista: StringProperty()


class ECORP_Fila(bpy.types.PropertyGroup):
    gesto: StringProperty()
    clave: StringProperty(name='', update=lambda s, c: _al_cambiar_fila(s, c),
                          description='Expresión corporal que acompaña a este gesto (vacío = la de serie)')


def _al_cambiar_fila(fila, context):
    rig = context.scene.ecorp.rig
    if rig is not None and not _bloqueo[0]:
        _nucleo('vinculo').poner_tabla(rig, fila.gesto, fila.clave.strip())


# ======================================================================== editor (Scene.ecorp)
_bloqueo = [False]
_ITEMS = {'expr': [], 'base': [], 'familia': [], 'lib': [], 'gesto': []}
FAMILIAS = ['alegria', 'tristeza', 'miedo', 'enfado', 'sorpresa', 'asco', 'otras', 'neutra']


def _rig(context):
    return context.scene.ecorp.rig


def _items_familia(self, context):
    it = [('TODAS', 'Todas', 'Todas las familias')]
    try:
        fams = sorted(_nucleo('biblioteca').familias())
    except Exception:
        fams = FAMILIAS
    it += [(f, f.capitalize(), '') for f in fams]
    _ITEMS['familia'] = it
    return it


def _items_expr(self, context):
    rig = getattr(self, 'rig', None)
    try:
        lib = _nucleo('biblioteca').cargar()['expresiones']
    except Exception:
        lib = {}
    estilo = U.props(rig).estilo if rig else 'M'
    claves = {}
    for k, e in lib.items():
        claves[k] = e
    if rig is not None:
        for it in U.props(rig).expresiones:
            claves.setdefault(it.name, U.leer_json(it.datos))
    fam = getattr(self, 'familia', 'TODAS')
    out = []
    for k in sorted(claves, key=lambda k: (claves[k].get('familia', 'z'), k)):
        e = claves[k]
        est = U.estilo_de(k)
        if k != 'neutra' and est is not None and est != estilo:
            continue
        if fam != 'TODAS' and e.get('familia', 'otras') != fam:
            continue
        marca = ' *' if rig is not None and U.item_expr(rig, k) is not None and U.accion(rig, k) is not None else ''
        out.append((k, (e.get('titulo') or k.replace('_', ' ')) + marca, e.get('nota', '')[:200]))
    _ITEMS['expr'] = out or [('neutra', 'Neutra', '')]
    return _ITEMS['expr']


def _items_base(self, context):
    it = [('NEUTRA', 'Neutra', 'La pose neutra del personaje (con respiración)'),
          ('NINGUNA', 'Ninguna', 'Sin base: solo el delta de la expresión')]
    rig = getattr(self, 'rig', None)
    for a in bpy.data.actions:
        if '_EC_' in a.name or '_FACS_' in a.name or a.get('ecorp_temporal'):
            continue
        if any(s.target_id_type == 'OBJECT' for s in a.slots):
            it.append((a.name, a.name, 'Acción como base (p. ej. caminar)'))
    _ITEMS['base'] = it
    return it


def _items_lib(self, context):
    try:
        B = _nucleo('biblioteca').cargar()
        it = [(k, f'{k} ({B["origen"].get(k, "")})', '') for k in sorted(B['expresiones'])]
    except Exception:
        it = []
    _ITEMS['lib'] = it or [('', '(vacía)', '')]
    return _ITEMS['lib']


def _items_gesto(self, context):
    rig = getattr(self, 'rig', None)
    it = []
    try:
        VI = _nucleo('vinculo')
        ctrl = VI.control_de(rig) if rig else None
        if ctrl is not None:
            it = [(VI.gesto_de_accion(a), VI.gesto_de_accion(a).replace('_', ' '), a.name) for a in VI.acciones_cara(ctrl)]
    except Exception:
        pass
    _ITEMS['gesto'] = it or [('', '(sin cara)', 'No hay control de la cara con gestos FACS')]
    return _ITEMS['gesto']


def _campo(n, lado=None):
    return f'p_{n}_{lado}' if lado else f'p_{n}'


def _al_mover(nombre, lado=None):
    def f(self, context):
        if _bloqueo[0]:
            return
        if lado and self.enlazar:
            otro = 'R' if lado == 'L' else 'L'
            _bloqueo[0] = True
            try:
                setattr(self, _campo(nombre, otro), getattr(self, _campo(nombre, lado)))
            finally:
                _bloqueo[0] = False
        _escribir(context)
    return f


def _al_mover_simple(self, context):
    if not _bloqueo[0]:
        _escribir(context)


def _al_elegir(self, context):
    if not _bloqueo[0]:
        cargar_editor(context)


def _anotaciones():
    ann = {
        'rig': PointerProperty(name='Rig', type=bpy.types.Object, poll=_poll_arm, update=_al_elegir,
                               description='Armadura del personaje (Rigify, Mixamo o genérica)'),
        'malla': PointerProperty(name='Malla', type=bpy.types.Object, poll=_poll_mesh,
                                 description='Malla del cuerpo (línea de pasos y calibrar la neutra)'),
        'familia': EnumProperty(name='Familia', items=_items_familia),
        'expresion': EnumProperty(name='Expresión', items=_items_expr, update=_al_elegir),
        'base': EnumProperty(name='Base', items=_items_base,
                             description='Lo que hace el cuerpo debajo de la expresión (pista EC Base)'),
        'editar': EnumProperty(name='Editar', items=[('params', 'Mantener', 'La pose que se mantiene'),
                                                     ('pico', 'Pico', 'La pose del pico de la entrada (luego se asienta)')],
                               update=_al_elegir),
        'enlazar': BoolProperty(name='Enlazar izq./der.', default=True,
                                description='Al mover un lado, el otro se mueve igual'),
        'auto': BoolProperty(name='Regenerar al mover', default=True,
                             description='Cada cambio regenera la acción (con anti-rebote) y se ve en el visor'),
        'intensidad': FloatProperty(name='Intensidad', default=1.0, min=0.0, max=1.5, update=_al_mover_simple),
        'separacion': FloatProperty(name='Separación brazos', default=0.0, min=0.0, max=40.0,
                                    description='Grados de separación de los brazos en la neutra (0 = medir con la malla)'),
        'fase_retoque': EnumProperty(name='Fase', items=[('mantener', 'Mantener', 'Desde que se asienta hasta la salida'),
                                                         ('pico', 'Pico', 'Solo en el pico de la entrada'),
                                                         ('todas', 'Todas', 'Toda la expresión')], default='mantener'),
        'hueso_retoque': StringProperty(name='Hueso', description='Hueso (real o semántico) cuyos retoques se borran; vacío = todos'),
        'nombre': StringProperty(name='Nombre', description='Nombre en la biblioteca, duplicado o renombrado'),
        'lib_clave': EnumProperty(name='Biblioteca', items=_items_lib),
        'destino': PointerProperty(name='Otro personaje', type=bpy.types.Object, poll=_poll_arm),
        'ruta_json': StringProperty(name='JSON', subtype='FILE_PATH', default='//expresiones_corporales.json'),
        'ruta_glb': StringProperty(name='GLB', subtype='FILE_PATH', default='',
                                   description='Vacío: <rig>_cuerpo.glb junto al .blend'),
        'cadena': StringProperty(name='Cadena', description='Claves separadas por comas (p. ej. sorpresa_M, miedo_M)'),
        'gesto_cara': EnumProperty(name='Gesto', items=_items_gesto),
        'en_linea': BoolProperty(name='En la línea de tiempo', default=False,
                                 description='Inserta claves: la cara entra 3 fotogramas antes que el cuerpo y salen juntas'),
        'informe': StringProperty(name='Informe'),
        'filas': CollectionProperty(type=ECORP_Fila),
    }
    for g in U.GRUPOS:
        ann[f'g_{g}'] = FloatProperty(name=g.capitalize(), default=1.0, min=0.0, max=1.5, update=_al_mover_simple)
    for n, g, mn, mx, bil, txt in U.PARAMS:
        dedos = mx <= 1.0 and mn >= 0
        kw = dict(min=0.0, max=1.0) if dedos else dict(soft_min=mn, soft_max=mx, min=-180.0, max=180.0)
        if bil:
            for l in U.LADOS:
                ann[_campo(n, l)] = FloatProperty(name=f'{txt} ({"izq." if l == "L" else "der."})', update=_al_mover(n, l), **kw)
        else:
            ann[_campo(n)] = FloatProperty(name=txt, update=_al_mover(n), **kw)
    for l in U.LADOS:
        ann[f'p_mano_objetivo_{l}'] = FloatVectorProperty(
            name=f'Mano objetivo {"izq." if l == "L" else "der."}', size=3, min=-1.5, max=1.5, update=_al_mover_simple,
            description='Afuera, adelante, arriba desde el hombro en longitudes de brazo (afuera < 0 = hacia la línea media)')
        ann[f'p_usar_obj_{l}'] = BoolProperty(name='Objetivo', default=False, update=_al_mover_simple,
                                              description='Brazo por objetivo de mano (IK) en vez de por ángulos')
    for n, mn, mx, d, txt in U.VIDA:
        ann[f'v_{n}'] = FloatProperty(name=txt, default=d, min=mn, max=mx, update=_al_mover_simple)
    for n, mn, mx, d, txt in U.TIEMPOS:
        ann[f't_{n}'] = FloatProperty(name=txt, default=d, min=mn, max=mx, update=_al_mover_simple)
    curvas = [(c, c.capitalize(), '') for c in U.CURVAS]
    ann['t_curva_entrada'] = EnumProperty(name='Curva entrada', items=curvas, update=_al_mover_simple)
    ann['t_curva_salida'] = EnumProperty(name='Curva salida', items=curvas, update=_al_mover_simple)
    ann['t_orden'] = EnumProperty(name='Orden', items=[(o, o.replace('_', ' '), '') for o in U.ORDENES],
                                  update=_al_mover_simple)
    return ann


ECORP_Escena = type('ECORP_Escena', (bpy.types.PropertyGroup,), {'__annotations__': _anotaciones()})


def _clave(context):
    s = context.scene.ecorp
    try:
        return s.expresion
    except Exception:
        return 'neutra'


def cargar_editor(context):
    """pasa los datos de la expresión elegida a los deslizadores (sin escribir de vuelta)."""
    s = context.scene.ecorp
    rig = s.rig
    if rig is None:
        return
    clave = _clave(context)
    if not clave:
        return
    try:
        clave, d = _nucleo('generador').datos_de(rig, clave, copiar=False)
    except Exception:
        return
    P = dict(d.get('params') or {})
    if s.editar == 'pico':
        P.update(d.get('pico') or {})
    _bloqueo[0] = True
    try:
        for n, g, mn, mx, bil, txt in U.PARAMS:
            if bil:
                for l in U.LADOS:
                    setattr(s, _campo(n, l), float(U.valor(P, n, l)))
            else:
                setattr(s, _campo(n), float(P.get(n, 0.0)))
        for l in U.LADOS:
            v = P.get(f'mano_objetivo_{l}')
            setattr(s, f'p_usar_obj_{l}', v is not None)
            setattr(s, f'p_mano_objetivo_{l}', v if v is not None else (0.0, 0.0, 0.0))
        vida = d.get('vida') or {}
        for n, mn, mx, df, txt in U.VIDA:
            setattr(s, f'v_{n}', float(vida.get(n, df)))
        t = d.get('tiempos') or {}
        for n, mn, mx, df, txt in U.TIEMPOS:
            setattr(s, f't_{n}', float(t.get(n, df)))
        s.t_curva_entrada = t.get('curva_entrada', 'suave')
        s.t_curva_salida = t.get('curva_salida', 'suave')
        s.t_orden = t.get('orden', 'torso_primero')
        s.intensidad = float(d.get('intensidad', 1.0))
        gr = d.get('grupos') or {}
        for g in U.GRUPOS:
            setattr(s, f'g_{g}', float(gr.get(g, 1.0)))
    finally:
        _bloqueo[0] = False


def _params_de_campos(s):
    P = {}
    for n, g, mn, mx, bil, txt in U.PARAMS:
        if bil:
            a, b = getattr(s, _campo(n, 'L')), getattr(s, _campo(n, 'R'))
            if abs(a - b) < 1e-6:
                if abs(a) > 1e-6:
                    P[n] = round(a, 4)
            else:
                P[f'{n}_L'], P[f'{n}_R'] = round(a, 4), round(b, 4)
        else:
            v = getattr(s, _campo(n))
            if abs(v) > 1e-6:
                P[n] = round(v, 4)
    for l in U.LADOS:
        if getattr(s, f'p_usar_obj_{l}'):
            P[f'mano_objetivo_{l}'] = [round(x, 4) for x in getattr(s, f'p_mano_objetivo_{l}')]
    return P


def _escribir(context):
    """deslizadores -> datos de la expresión en el rig, y regeneración diferida."""
    s = context.scene.ecorp
    rig = s.rig
    if rig is None:
        return
    clave = _clave(context)
    GE = _nucleo('generador')
    try:
        clave, d = GE.datos_de(rig, clave)
    except Exception as e:
        s.informe = 'ERROR: ' + str(e); return
    P = _params_de_campos(s)
    if s.editar == 'pico':
        base = d.get('params') or {}
        pk = {}
        for k, v in P.items():
            nb, lado = (k[:-2], k[-1]) if k[-2:] in ('_L', '_R') else (k, None)
            if isinstance(v, list) or abs(v - U.valor(base, nb, lado)) > 1e-6:
                pk[k] = v
        if pk:
            d['pico'] = pk
        else:
            d.pop('pico', None)
    else:
        d['params'] = P
    vida = {k: v for k, v in (d.get('vida') or {}).items() if k == 'gesto_repetido'}
    for n, mn, mx, df, txt in U.VIDA:
        v = getattr(s, f'v_{n}')
        amp = n if not n.endswith(('_periodo', '_frecuencia')) else n.rsplit('_', 1)[0]
        if getattr(s, f'v_{amp}') > 1e-6:
            vida[n] = round(v, 4)
    d['vida'] = vida
    t = {n: (int(round(getattr(s, f't_{n}'))) if n in ('entrada', 'asentar', 'mantener', 'salida')
             else round(getattr(s, f't_{n}'), 4)) for n, *_ in U.TIEMPOS}
    t.update({'curva_entrada': s.t_curva_entrada, 'curva_salida': s.t_curva_salida, 'orden': s.t_orden})
    d['tiempos'] = t
    d['intensidad'] = round(s.intensidad, 4)
    d['grupos'] = {g: round(getattr(s, f'g_{g}'), 4) for g in U.GRUPOS}
    U.escribir_expr(rig, clave, d)
    if s.auto:
        pedir_regeneracion(rig.name, clave, s.base)


# ---------------------------------------------------------------- regeneración con anti-rebote
_pendiente = {'t': 0.0, 'rig': None, 'clave': None, 'base': None, 'ligero_hecho': False}


def pedir_regeneracion(rig, clave, base):
    _pendiente.update({'t': time.time(), 'rig': rig, 'clave': clave, 'base': base, 'ligero_hecho': False})
    if not bpy.app.timers.is_registered(_tic):
        bpy.app.timers.register(_tic, first_interval=0.25)


def _regenerar(ligero):
    rig = bpy.data.objects.get(_pendiente['rig'] or '')
    if rig is None:
        return
    clave = _pendiente['clave']
    GE, CA = _nucleo('generador'), _nucleo('capas')
    GE.generar(rig, clave, ligero=ligero)
    st = CA.estado(rig)
    if CA.activa(rig) and st.get('clave') == clave and not st.get('cadena'):
        CA.refrescar(rig)
    else:
        b = _pendiente['base']
        CA.previsualizar(rig, clave, base=None if b in (None, 'NEUTRA') else ('ninguna' if b == 'NINGUNA' else b))
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type in ('VIEW_3D', 'DOPESHEET_EDITOR', 'NLA_EDITOR'):
                a.tag_redraw()


def _tic():
    try:
        quieto = time.time() - _pendiente['t']
        if not _pendiente['ligero_hecho']:
            if quieto < 0.2:
                return 0.1
            _regenerar(True)
            _pendiente['ligero_hecho'] = True
            return 0.8
        if quieto < 0.9:
            return 0.2
        _regenerar(False)
    except Exception as e:
        import traceback; traceback.print_exc()
        print('ecorp regenerar:', e)
    return None


# ======================================================================== operadores
def _informe(context, r):
    context.scene.ecorp.informe = json.dumps(r, ensure_ascii=False, default=str)[:4000]


class _Base:
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.ecorp
        if self.necesita_rig and s.rig is None:
            self.report({'ERROR'}, 'Elige el rig del personaje'); return {'CANCELLED'}
        try:
            r = self.hacer(context, s, s.rig)
        except Exception as e:
            import traceback; traceback.print_exc()
            self.report({'ERROR'}, str(e)); s.informe = 'ERROR: ' + str(e)
            return {'CANCELLED'}
        if r is None:
            return {'CANCELLED'}
        _informe(context, r)
        self.report({'INFO'}, self.bl_label + ': hecho')
        return {'FINISHED'}

    necesita_rig = True


def _base_arg(s):
    return None if s.base == 'NEUTRA' else ('ninguna' if s.base == 'NINGUNA' else s.base)


class ECORP_OT_perfil(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.perfil'
    bl_label = 'Detectar perfil'
    bl_description = 'Detecta el tipo de rig (Rigify, Mixamo, genérico), los huesos, hacia dónde mira y lo mide'

    def hacer(self, context, s, rig):
        PF = _nucleo('perfil')
        return PF.resumen(PF.asegurar(rig, forzar=True))


class ECORP_OT_calibrar_neutra(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.calibrar_neutra'
    bl_label = 'Calibrar neutra'
    bl_description = 'Pose neutra automática: brazos colgando sin atravesar la cadera (mide con la malla), codo ~8°, dedos relajados'

    def hacer(self, context, s, rig):
        r = _nucleo('perfil').calibrar_neutra(rig, malla=s.malla, separacion=s.separacion or None)
        _nucleo('generador').generar(rig, 'neutra')
        return r


class ECORP_OT_capturar_neutra(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.capturar_neutra'
    bl_label = 'Capturar neutra'
    bl_description = 'La pose actual del rig pasa a ser la neutra (base de todas las expresiones)'

    def hacer(self, context, s, rig):
        r = _nucleo('perfil').capturar_neutra(rig)
        _nucleo('generador').generar(rig, 'neutra')
        return r


class ECORP_OT_generar(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.generar'
    bl_label = 'Generar expresión'
    bl_description = 'Genera (o regenera) la acción de la expresión elegida, conservando los retoques'

    def hacer(self, context, s, rig):
        a = _nucleo('generador').generar(rig, _clave(context))
        CA = _nucleo('capas')
        if CA.activa(rig):
            CA.refrescar(rig)
        return {'accion': a.name, 'claves': a.get('ecorp_claves')}


class ECORP_OT_generar_todas(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.generar_todas'
    bl_label = 'Generar todas'
    bl_description = 'Genera la neutra y todas las expresiones del estilo del personaje'

    def hacer(self, context, s, rig):
        r = _nucleo('generador').generar_todas(rig, U.props(rig).estilo)
        if r['errores']:
            self.report({'WARNING'}, f'{len(r["errores"])} expresiones con error: mira el informe')
        return r


class ECORP_OT_previsualizar(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.previsualizar'
    bl_label = 'Previsualizar'
    bl_description = 'Pone la base y la expresión en el NLA (pistas EC Base y EC Expresión) para verla en la línea de tiempo'

    def hacer(self, context, s, rig):
        return _nucleo('capas').previsualizar(rig, _clave(context), base=_base_arg(s))


class ECORP_OT_quitar(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.quitar_previsualizacion'
    bl_label = 'Quitar previsualización'
    bl_description = 'Quita las pistas EC y devuelve el rig a la animación que tenía'

    def hacer(self, context, s, rig):
        return _nucleo('capas').quitar(rig)


class ECORP_OT_encadenar(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.encadenar'
    bl_label = 'Encadenar'
    bl_description = 'Pone seguidas las expresiones de la cadena, con fundido automático'

    def hacer(self, context, s, rig):
        claves = [c.strip() for c in s.cadena.split(',') if c.strip()]
        if not claves:
            self.report({'ERROR'}, 'Escribe las claves separadas por comas'); return None
        return _nucleo('capas').encadenar(rig, claves, base=_base_arg(s))


class ECORP_OT_navegar(bpy.types.Operator):
    bl_idname = 'ecorp.navegar'
    bl_label = 'Anterior / siguiente'
    bl_description = 'Pasa a la expresión anterior o siguiente de la lista'
    paso: IntProperty(default=1)

    def execute(self, context):
        s = context.scene.ecorp
        items = [i[0] for i in _items_expr(s, context)]
        if not items:
            return {'CANCELLED'}
        i = items.index(s.expresion) if s.expresion in items else 0
        s.expresion = items[(i + self.paso) % len(items)]
        return {'FINISHED'}


class ECORP_OT_restablecer(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.restablecer'
    bl_label = 'Restablecer de la biblioteca'
    bl_description = 'Vuelve a los valores de la biblioteca (conserva los retoques)'

    def hacer(self, context, s, rig):
        a = _nucleo('biblioteca').cargar_en(rig, _clave(context), conservar_retoques=True)
        cargar_editor(context)
        CA = _nucleo('capas')
        if CA.activa(rig):
            CA.refrescar(rig)
        return {'accion': a.name}


class ECORP_OT_capturar_retoques(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.capturar_retoques'
    bl_label = 'Capturar retoques'
    bl_description = 'Guarda lo que has girado o movido a mano en este fotograma; se conserva al regenerar'

    def hacer(self, context, s, rig):
        return _nucleo('retoques').capturar(rig, _clave(context), fase=s.fase_retoque)


class ECORP_OT_borrar_retoques(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.borrar_retoques'
    bl_label = 'Borrar retoques'
    bl_description = 'Borra los retoques del hueso indicado (o todos si está vacío) y regenera'

    def hacer(self, context, s, rig):
        return _nucleo('retoques').borrar(rig, _clave(context), hueso=s.hueso_retoque.strip() or None)


class ECORP_OT_guardar_usuario(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.guardar_usuario'
    bl_label = 'Guardar en mi biblioteca'
    bl_description = 'Guarda la expresión (con sus retoques) en la biblioteca de usuario; sobrevive a reinstalar'

    def hacer(self, context, s, rig):
        return _nucleo('biblioteca').guardar_usuario(rig, _clave(context), s.nombre.strip() or None)


class ECORP_OT_cargar_biblioteca(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.cargar_biblioteca'
    bl_label = 'Cargar de la biblioteca'
    bl_description = 'Copia la expresión elegida de la biblioteca a este personaje y la genera'

    def hacer(self, context, s, rig):
        if not s.lib_clave:
            return None
        a = _nucleo('biblioteca').cargar_en(rig, s.lib_clave)
        return {'accion': a.name}


class ECORP_OT_duplicar(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.duplicar'
    bl_label = 'Duplicar'
    bl_description = 'Copia la expresión con el nombre indicado'

    def hacer(self, context, s, rig):
        if not s.nombre.strip():
            self.report({'ERROR'}, 'Escribe el nombre nuevo'); return None
        a = _nucleo('biblioteca').duplicar(rig, _clave(context), s.nombre.strip())
        return {'accion': a.name}


class ECORP_OT_renombrar(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.renombrar'
    bl_label = 'Renombrar'
    bl_description = 'Renombra la expresión del personaje y su acción'

    def hacer(self, context, s, rig):
        if not s.nombre.strip():
            self.report({'ERROR'}, 'Escribe el nombre nuevo'); return None
        return _nucleo('biblioteca').renombrar(rig, _clave(context), s.nombre.strip())


class ECORP_OT_aplicar_a(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.aplicar_a'
    bl_label = 'Aplicar a otro personaje'
    bl_description = 'Lleva la expresión (parámetros y retoques) al otro rig, traducida con su perfil'

    def hacer(self, context, s, rig):
        if s.destino is None or s.destino == rig:
            self.report({'ERROR'}, 'Elige otro rig de destino'); return None
        a = _nucleo('biblioteca').aplicar_a(s.destino, _clave(context), origen=rig)
        return {'accion': a.name}


class ECORP_OT_exportar_json(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.exportar_json'
    bl_label = 'Exportar JSON'
    bl_description = 'Las expresiones del personaje en un JSON con el esquema de la biblioteca'

    def hacer(self, context, s, rig):
        return _nucleo('biblioteca').exportar_json(rig, bpy.path.abspath(s.ruta_json))


class ECORP_OT_importar_json(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.importar_json'
    bl_label = 'Importar JSON'
    bl_description = 'Mete las expresiones del JSON en el personaje (y las genera)'

    def hacer(self, context, s, rig):
        return _nucleo('biblioteca').importar_json(bpy.path.abspath(s.ruta_json), rig=rig)


class ECORP_OT_vinculo(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.vinculo'
    bl_label = 'Vínculo con la cara'
    bl_description = 'Activa o desactiva que el cuerpo siga al gesto de la cara'
    activar: BoolProperty(default=True)

    def hacer(self, context, s, rig):
        VI = _nucleo('vinculo')
        r = VI.activar(rig) if self.activar else VI.desactivar(rig)
        _rellenar_filas(context)
        return r


def _rellenar_filas(context):
    s = context.scene.ecorp
    rig = s.rig
    _bloqueo[0] = True
    try:
        s.filas.clear()
        if rig is None:
            return
        VI = _nucleo('vinculo')
        t = VI.tabla(rig)
        for g, c in VI.tabla_completa(rig).items():
            f = s.filas.add()
            f.gesto = g
            f.clave = t.get(g, '')
            f.name = c or ''
    finally:
        _bloqueo[0] = False


class ECORP_OT_vinculo_tabla(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.vinculo_tabla'
    bl_label = 'Refrescar tabla'
    bl_description = 'Lee los gestos de la cara y la expresión corporal que activa cada uno'

    def hacer(self, context, s, rig):
        _rellenar_filas(context)
        return {'filas': len(s.filas)}


class ECORP_OT_expresion_completa(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.expresion_completa'
    bl_label = 'Expresión completa'
    bl_description = 'Pone el gesto en la cara y su expresión en el cuerpo, cada uno con su intensidad'

    def hacer(self, context, s, rig):
        if not s.gesto_cara:
            self.report({'ERROR'}, 'No hay gestos de la cara'); return None
        pg = U.props(rig)
        return _nucleo('vinculo').aplicar_completa(
            rig, s.gesto_cara, frame=context.scene.frame_current if s.en_linea else None,
            intensidad_cara=pg.int_cara, intensidad_cuerpo=pg.int_cuerpo)


class ECORP_OT_exportar_glb(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.exportar_glb'
    bl_label = 'Exportar GLB'
    bl_description = 'GLB del personaje con los clips EC_* (neutra + delta) y el contrato <personaje>_expresiones.json'

    def hacer(self, context, s, rig):
        ruta = bpy.path.abspath(s.ruta_glb) if s.ruta_glb else \
            __import__('os').path.join(U.carpeta_salida(), f'{rig.name}_cuerpo.glb')
        return _nucleo('exportar').glb(rig, ruta)


class ECORP_OT_hoja(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.hoja_revision'
    bl_label = 'Hoja de revisión'
    bl_description = 'Renders rápidos del pico y el mantener de cada expresión, de frente y en 3/4, en un mosaico'

    def hacer(self, context, s, rig):
        return {'png': _nucleo('revision').hoja(rig)}


def _pasos():
    try:
        return _nucleo('pasos'), None
    except ImportError as e:
        return None, str(e)
    except Exception as e:
        return None, f'{type(e).__name__}: {e}'


class ECORP_OT_siguiente_paso(_Base, bpy.types.Operator):
    bl_idname = 'ecorp.siguiente_paso'
    bl_label = 'Siguiente paso'
    bl_description = 'Ejecuta el siguiente paso pendiente de la línea del personaje'
    necesita_rig = False

    def hacer(self, context, s, rig):
        P, err = _pasos()
        if P is None:
            self.report({'ERROR'}, 'La línea de pasos no está disponible: ' + (err or '')); return None
        if s.malla is None:
            self.report({'ERROR'}, 'Elige la malla del cuerpo'); return None
        r = P.siguiente(s.malla)
        if isinstance(r, dict) and r.get('resumen'):
            self.report({'INFO'}, str(r['resumen'])[:200])
        return r


# ======================================================================== paneles
class _Panel:
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = CAT


def _parrafo(lay, context, texto, icon='NONE', alert=False):
    """texto largo en varias líneas según el ancho del panel (la etiqueta nunca se corta con «…»)."""
    ancho = max(24, int(context.region.width / 10.5) - 2) if context.region else 44
    col = lay.column(align=True)
    col.alert = alert
    for i, l in enumerate(textwrap.wrap(str(texto), ancho) or ['']):
        col.label(text=l, icon=icon if i == 0 else 'BLANK1')


def _estado(lay, hecho):
    """✓ cuando la etapa está hecha, círculo vacío cuando falta (solo con lo que el código ya sabe)."""
    lay.label(text='', icon='CHECKMARK' if hecho else 'RADIOBUT_OFF')


class ECORP_PT_principal(_Panel, bpy.types.Panel):
    bl_label = '3. Perfil y expresiones'
    bl_order = 10

    def draw_header(self, context):
        try:
            rig = context.scene.ecorp.rig
            _estado(self.layout, rig is not None and bool(U.leer_json(U.props(rig).perfil)))
        except Exception:
            pass

    def draw(self, context):
        s = context.scene.ecorp
        lay = self.layout
        lay.prop(s, 'rig')
        rig = s.rig
        if rig is None:
            _parrafo(lay, context, 'Elige la armadura del personaje', 'INFO')
            return
        pg = U.props(rig)
        lay.prop(pg, 'estilo', expand=True)
        p = U.leer_json(pg.perfil)
        b = lay.box()
        if p:
            _parrafo(b, context, f'Perfil: {p.get("tipo")} · {len(p.get("mapa", {}))} huesos · reposo {p.get("pose_reposo")}',
                     'ARMATURE_DATA')
            for a in p.get('avisos', [])[:4]:
                _parrafo(b, context, a, 'ERROR')
        else:
            b.label(text='Sin perfil todavía', icon='QUESTION')
        # un solo botón principal: «Detectar perfil» mientras falta el perfil; después «Generar todas»
        r = b.row(align=True); r.scale_y = 1.4 if p else 2.0
        r.operator('ecorp.perfil', icon='VIEWZOOM')
        r = b.row(align=True)
        r.prop(s, 'separacion')
        r = b.row(align=True); r.scale_y = 1.4
        r.operator('ecorp.calibrar_neutra', icon='POSE_HLT')
        r.operator('ecorp.capturar_neutra', icon='KEYTYPE_KEYFRAME_VEC')
        c = lay.column(); c.scale_y = 2.0 if p else 1.4
        c.operator('ecorp.generar_todas', icon='FILE_REFRESH')
        if s.informe:
            bx = lay.box()
            bx.label(text='Último informe:')
            _parrafo(bx, context, s.informe[:480])


class ECORP_PT_pasos(_Panel, bpy.types.Panel):
    bl_label = 'Mapa de pasos'
    bl_order = 0

    def draw(self, context):
        s = context.scene.ecorp
        lay = self.layout
        lay.prop(s, 'malla')
        P, err = _pasos()
        if P is None:
            _parrafo(lay, context, 'Línea de pasos no disponible todavía', 'INFO')
            return
        # el botón principal va arriba, justo bajo el selector de malla (antes estaba al final de la lista)
        c = lay.column(); c.scale_y = 2.0
        c.operator('ecorp.siguiente_paso', icon='PLAY')
        if s.malla is not None:
            try:
                e = P.estado(s.malla)
            except Exception as ex:
                _parrafo(lay, context, f'estado: {ex}', 'ERROR'); e = None
            if isinstance(e, dict):
                pasos = e.get('pasos')
                if isinstance(pasos, (list, tuple)):
                    for x in pasos:
                        if isinstance(x, dict):
                            hecho = x.get('hecho')
                            _parrafo(lay, context, f'{x.get("n", "")}. {x.get("titulo", x.get("id", ""))}',
                                     'CHECKMARK' if hecho else 'RADIOBUT_OFF')
                        else:
                            _parrafo(lay, context, str(x))
                else:
                    for k, v in list(e.items())[:12]:
                        _parrafo(lay, context, f'{k}: {v}'[:70])
            elif e is not None:
                _parrafo(lay, context, str(e)[:70])


class ECORP_PT_expresiones(_Panel, bpy.types.Panel):
    bl_label = '4. Expresión'
    bl_order = 12

    def draw_header(self, context):
        try:
            s = context.scene.ecorp
            _estado(self.layout, s.rig is not None and U.accion(s.rig, s.expresion) is not None)
        except Exception:
            pass

    @classmethod
    def poll(cls, context):
        return context.scene.ecorp.rig is not None

    def draw(self, context):
        s = context.scene.ecorp
        rig = s.rig
        lay = self.layout
        lay.prop(s, 'familia')
        r = lay.row(align=True)
        r.operator('ecorp.navegar', text='', icon='TRIA_LEFT').paso = -1
        r.prop(s, 'expresion', text='')
        r.operator('ecorp.navegar', text='', icon='TRIA_RIGHT').paso = 1
        it = U.item_expr(rig, s.expresion)
        d = U.leer_json(it.datos) if it else None
        if d and d.get('nota'):
            _parrafo(lay, context, d['nota'][:240])
        r = lay.row(align=True); r.scale_y = 2.0
        r.operator('ecorp.generar', text='Generar / regenerar', icon='FILE_REFRESH')
        if it is not None:
            r.prop(it, 'bloqueada', text='', icon='LOCKED' if it.bloqueada else 'UNLOCKED')
        lay.prop(s, 'base')
        r = lay.row(align=True); r.scale_y = 1.4
        r.operator('ecorp.previsualizar', icon='PLAY')
        r.operator('ecorp.quitar_previsualizacion', text='Quitar', icon='X')
        lay.operator('ecorp.restablecer', icon='LOOP_BACK')
        b = lay.box()
        b.prop(s, 'cadena')
        b.operator('ecorp.encadenar', icon='SEQ_STRIP_DUPLICATE')


class ECORP_PT_parametros(_Panel, bpy.types.Panel):
    bl_label = '5. Parámetros'
    bl_order = 13

    @classmethod
    def poll(cls, context):
        return context.scene.ecorp.rig is not None

    def draw(self, context):
        s = context.scene.ecorp
        lay = self.layout
        r = lay.row(align=True)
        r.prop(s, 'editar', expand=True)
        r = lay.row(align=True)
        r.prop(s, 'auto')
        r.prop(s, 'enlazar')
        lay.prop(s, 'intensidad', slider=True)
        c = lay.column(align=True)
        for g in U.GRUPOS:
            c.prop(s, f'g_{g}', slider=True)


def _sub(grupo, titulo, orden):
    class P(_Panel, bpy.types.Panel):
        bl_label = titulo
        bl_parent_id = 'ECORP_PT_parametros'
        bl_options = {'DEFAULT_CLOSED'}
        bl_order = orden

        def draw(self, context):
            s = context.scene.ecorp
            lay = self.layout
            for n, g, mn, mx, bil, txt in U.PARAMS:
                if g != grupo:
                    continue
                if bil:
                    lay.label(text=txt)
                    r = lay.row(align=True)
                    r.prop(s, _campo(n, 'L'), text='Izq.', slider=mx <= 1)
                    r.prop(s, _campo(n, 'R'), text='Der.', slider=mx <= 1)
                else:
                    lay.prop(s, _campo(n))
            if grupo == 'brazos':
                for l in U.LADOS:
                    b = lay.box()
                    b.prop(s, f'p_usar_obj_{l}', text=f'Mano {"izq." if l == "L" else "der."} por objetivo (IK)')
                    if getattr(s, f'p_usar_obj_{l}'):
                        b.prop(s, f'p_mano_objetivo_{l}', text='')
    P.__name__ = P.bl_idname = f'ECORP_PT_param_{grupo}'
    return P


class ECORP_PT_vida(_Panel, bpy.types.Panel):
    bl_label = 'Vida (bucle del mantener)'
    bl_parent_id = 'ECORP_PT_parametros'
    bl_options = {'DEFAULT_CLOSED'}
    bl_order = 20

    def draw(self, context):
        s = context.scene.ecorp
        c = self.layout.column(align=True)
        for n, *_ in U.VIDA:
            c.prop(s, f'v_{n}')
        rig = s.rig
        it = U.item_expr(rig, s.expresion) if rig else None
        d = U.leer_json(it.datos) if it else {}
        rep = d.get('gesto_repetido') or (d.get('vida') or {}).get('gesto_repetido')
        if rep:
            self.layout.label(text=f'Gesto repetido: {rep.get("forma", "seno")} cada {rep.get("periodo")} s', icon='LOOP_FORWARDS')


class ECORP_PT_tiempos(_Panel, bpy.types.Panel):
    bl_label = 'Tiempos (fotogramas a 24 fps)'
    bl_parent_id = 'ECORP_PT_parametros'
    bl_options = {'DEFAULT_CLOSED'}
    bl_order = 21

    def draw(self, context):
        s = context.scene.ecorp
        c = self.layout.column(align=True)
        for n, *_ in U.TIEMPOS:
            c.prop(s, f't_{n}')
        c.prop(s, 't_curva_entrada')
        c.prop(s, 't_curva_salida')
        c.prop(s, 't_orden')


class ECORP_PT_retoques(_Panel, bpy.types.Panel):
    bl_label = 'Retoques a mano'
    bl_order = 14
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(cls, context):
        return context.scene.ecorp.rig is not None

    def draw(self, context):
        s = context.scene.ecorp
        lay = self.layout
        _parrafo(lay, context, 'Gira huesos en modo pose y captura:', 'INFO')
        lay.prop(s, 'fase_retoque')
        lay.operator('ecorp.capturar_retoques', icon='KEYINGSET')
        r = lay.row(align=True)
        r.prop(s, 'hueso_retoque', text='')
        r.operator('ecorp.borrar_retoques', text='Borrar', icon='TRASH')
        try:
            lst = _nucleo('retoques').listar(s.rig, s.expresion)
        except Exception:
            lst = {}
        for k, v in list(lst.items())[:12]:
            lay.label(text=f'{k}: {v["grados"]}° ({v["fase"]})')


class ECORP_PT_biblioteca(_Panel, bpy.types.Panel):
    bl_label = 'Biblioteca'
    bl_order = 15
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(cls, context):
        return context.scene.ecorp.rig is not None

    def draw(self, context):
        s = context.scene.ecorp
        lay = self.layout
        lay.prop(s, 'nombre')
        r = lay.row(align=True)
        r.operator('ecorp.guardar_usuario', icon='FILE_TICK')
        r = lay.row(align=True)
        r.operator('ecorp.duplicar', icon='DUPLICATE')
        r.operator('ecorp.renombrar', icon='SORTALPHA')
        b = lay.box()
        b.prop(s, 'lib_clave', text='')
        b.operator('ecorp.cargar_biblioteca', icon='IMPORT')
        b = lay.box()
        b.prop(s, 'destino')
        b.operator('ecorp.aplicar_a', icon='ARMATURE_DATA')
        b = lay.box()
        b.prop(s, 'ruta_json')
        r = b.row(align=True)
        r.operator('ecorp.exportar_json', icon='EXPORT')
        r.operator('ecorp.importar_json', icon='IMPORT')


class ECORP_PT_vinculo(_Panel, bpy.types.Panel):
    bl_label = 'Vínculo con la cara'
    bl_order = 16
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(cls, context):
        return context.scene.ecorp.rig is not None

    def draw(self, context):
        s = context.scene.ecorp
        pg = U.props(s.rig)
        lay = self.layout
        if not hasattr(bpy.types.Scene, 'rlb_editor'):
            _parrafo(lay, context, 'Rig Labial Bendy no está activo (se usa solo la cara)', 'INFO')
        r = lay.row(align=True)
        if pg.vinculo:
            r.label(text=f'Activo: {pg.control}', icon='LINKED')
            r.operator('ecorp.vinculo', text='Desactivar').activar = False
        else:
            r.operator('ecorp.vinculo', text='Activar', icon='UNLINKED').activar = True
        r = lay.row(align=True)
        r.prop(pg, 'int_cara', slider=True)
        r.prop(pg, 'int_cuerpo', slider=True)
        b = lay.box()
        b.prop(s, 'gesto_cara')
        b.prop(s, 'en_linea')
        b.operator('ecorp.expresion_completa', icon='COMMUNITY')
        b = lay.box()
        r = b.row()
        r.label(text='Tabla cara → cuerpo')
        r.operator('ecorp.vinculo_tabla', text='', icon='FILE_REFRESH')
        for f in s.filas:
            r = b.row(align=True)
            r.label(text=f'{f.gesto} → {f.name or "(ninguna)"}')
            r.prop(f, 'clave', text='')


class ECORP_PT_exportar(_Panel, bpy.types.Panel):
    bl_label = 'Exportar y revisar'
    bl_order = 17
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(cls, context):
        return context.scene.ecorp.rig is not None

    def draw(self, context):
        s = context.scene.ecorp
        lay = self.layout
        lay.prop(s, 'ruta_glb')
        lay.operator('ecorp.exportar_glb', icon='EXPORT')
        lay.operator('ecorp.hoja_revision', icon='RENDER_STILL')


SUBPANELES = [_sub('torso', 'Torso', 1), _sub('hombros', 'Hombros', 2), _sub('brazos', 'Brazos', 3),
              _sub('manos', 'Manos', 4), _sub('cabeza', 'Cuello y cabeza', 5)]

CLASES = [ECORP_Expresion, ECORP_Rig, ECORP_Fila, ECORP_Escena,
          ECORP_OT_perfil, ECORP_OT_calibrar_neutra, ECORP_OT_capturar_neutra, ECORP_OT_generar,
          ECORP_OT_generar_todas, ECORP_OT_previsualizar, ECORP_OT_quitar, ECORP_OT_encadenar, ECORP_OT_navegar,
          ECORP_OT_restablecer, ECORP_OT_capturar_retoques, ECORP_OT_borrar_retoques, ECORP_OT_guardar_usuario,
          ECORP_OT_cargar_biblioteca, ECORP_OT_duplicar, ECORP_OT_renombrar, ECORP_OT_aplicar_a,
          ECORP_OT_exportar_json, ECORP_OT_importar_json, ECORP_OT_vinculo, ECORP_OT_vinculo_tabla,
          ECORP_OT_expresion_completa, ECORP_OT_exportar_glb, ECORP_OT_hoja, ECORP_OT_siguiente_paso,
          ECORP_PT_principal, ECORP_PT_pasos, ECORP_PT_expresiones, ECORP_PT_parametros] + SUBPANELES + \
         [ECORP_PT_vida, ECORP_PT_tiempos, ECORP_PT_retoques, ECORP_PT_biblioteca, ECORP_PT_vinculo, ECORP_PT_exportar]


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Object.ecorp = PointerProperty(type=ECORP_Rig)
    bpy.types.Scene.ecorp = PointerProperty(type=ECORP_Escena)
    _nucleo('vinculo').register()
    try:
        from .nucleo.rig_cuerpo import ui as rig_ui
        rig_ui.register()
    except Exception as e:
        import traceback; traceback.print_exc()
        print('Expresiones Corporales: panel de esqueleto no disponible:', e)


def unregister():
    try:
        from .nucleo.rig_cuerpo import ui as rig_ui
        rig_ui.unregister()
    except Exception as e:
        print('Expresiones Corporales: panel de esqueleto:', e)
    if bpy.app.timers.is_registered(_tic):
        bpy.app.timers.unregister(_tic)
    _nucleo('vinculo').unregister()
    del bpy.types.Scene.ecorp
    del bpy.types.Object.ecorp
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)
