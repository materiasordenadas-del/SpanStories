# Vínculo con la cara (DISENO §8), sin tocar el complemento facial: solo se LEE su estado.
#   - Estado vivo = props v_<canal> del objeto <cara>_Cara_Control (lleva ["facs_cara"]).
#   - Gestos = acciones <cara>_FACS_<gesto> (constantes en el frame 1 sobre ["v_*"], prop 'intensidad').
#   - msgbus sobre scene.rlb_editor.expr (si el facial está instalado) + depsgraph_update_post que compara el vector
#     v_* con el anterior y lo clasifica contra las acciones *_FACS_* (cubre Aplicar, Neutra, estantería y habla).
# Cuando cambia el gesto de la cara, el cuerpo toma la expresión <gesto>_<estilo> del personaje (o la de la tabla).
#
#   vinculo.activar(rig, cara_control=None) / vinculo.desactivar(rig)
#   vinculo.aplicar_completa(rig, gesto, frame=None, intensidad_cara=1, intensidad_cuerpo=1)
import bpy, math
from . import util as U

_dueno = bpy.app.driver_namespace.setdefault('_ecorp_msgbus_owner', object())   # estable al recargar
_ultimo = {}          # rig -> vector v_* visto la última vez
_gesto = {}           # rig -> último gesto aplicado
_ocupado = [False]
ADELANTO_CARA = 3     # fotogramas que la cara entra antes que el cuerpo


# ---------------------------------------------------------------- cara
def controles():
    return [o for o in bpy.data.objects if 'facs_cara' in o.keys() or o.name.endswith('_Cara_Control')]


def nombre_cara(ctrl):
    n = ctrl.get('facs_cara')
    return str(n) if n else ctrl.name.removesuffix('_Cara_Control')


def buscar_control(rig):
    """el control de la cara del personaje: el que cuelga del rig (o de algo que cuelga de él), si no el único."""
    cs = controles()
    for c in cs:
        o = c
        while o is not None:
            if o == rig:
                return c
            o = o.parent
        cara = bpy.data.objects.get(nombre_cara(c))
        if cara is not None:
            o = cara
            while o is not None:
                if o == rig:
                    return c
                o = o.parent
            if any(m.type == 'ARMATURE' and m.object == rig for m in cara.modifiers):
                return c
    return cs[0] if len(cs) == 1 else None


def control_de(rig):
    n = U.props(rig).control
    c = bpy.data.objects.get(n) if n else None
    return c or buscar_control(rig)


def acciones_cara(ctrl):
    pre = nombre_cara(ctrl) + '_FACS_'
    return sorted((a for a in bpy.data.actions if a.name.startswith(pre)), key=lambda a: a.name)


def gesto_de_accion(a, ctrl=None):
    g = a.get('rlb_facs_expr')
    if g:
        return str(g)
    i = a.name.find('_FACS_')
    return a.name[i + 6:] if i >= 0 else a.name


def pesos_accion(a):
    """{canal: valor} de una acción FACS (con su intensidad general, como hace el facial al aplicarla)."""
    k = float(a.get('intensidad', 1.0))
    out = {}
    for f in U.fcurves(a):
        if f.data_path.startswith('["v_'):
            out[f.data_path[4:-2]] = f.evaluate(1) * k
    return out


def vector(ctrl):
    return {k[2:]: float(ctrl[k]) for k in ctrl.keys() if k.startswith('v_')}


def clasificar(ctrl, v=None):
    """(gesto, escala) más parecido al estado actual; ('neutro', 0) si está en reposo; (None, 0) si no se parece
    a ninguno (p. ej. hablando)."""
    v = vector(ctrl) if v is None else v
    nv = math.sqrt(sum(x * x for x in v.values()))
    if nv < 0.02:
        return 'neutro', 0.0
    mejor = (None, 0.0, 1e9)
    for a in acciones_cara(ctrl):
        w = pesos_accion(a)
        aa = sum(x * x for x in w.values())
        if aa < 1e-6:
            continue
        k = sum(v.get(n, 0.0) * x for n, x in w.items()) / aa
        k = max(0.0, min(1.5, k))
        res = math.sqrt(sum((v.get(n, 0.0) - k * w.get(n, 0.0)) ** 2 for n in set(v) | set(w))) / math.sqrt(aa)
        if res < mejor[2]:
            mejor = (gesto_de_accion(a), k, res)
    if mejor[0] is not None and mejor[2] < 0.3 and mejor[1] > 0.25:
        return mejor[0], mejor[1]
    return None, 0.0


def poner_cara(ctrl, pesos, intensidad=1.0, frame=None, canales=None):
    """pone los v_* (los demás a 0), como hace el facial; con frame inserta claves."""
    canales = canales or [k for k in ctrl.keys() if k.startswith('v_')]
    for k in canales:
        val = min(1.0, pesos.get(k[2:], 0.0) * intensidad)
        ctrl[k] = val
        if frame is not None:
            ctrl.keyframe_insert(f'["{k}"]', frame=frame)
    ctrl.update_tag()


def _mirada(ctrl, a, k):
    """la mirada del gesto con la función del facial, si está instalado (si no, se deja)."""
    try:
        import importlib
        for mod in ('bl_ext.user_default.rig_labial_bendy.nucleo.facs.biblioteca', 'rig_labial_bendy.nucleo.facs.biblioteca'):
            try:
                BI = importlib.import_module(mod)
                break
            except ImportError:
                BI = None
        cara = bpy.data.objects.get(nombre_cara(ctrl))
        if BI is not None and cara is not None:
            h, v = a.get('mirada', (0.0, 0.0))
            BI.mirada(cara, h * k, v * k)
    except Exception as e:
        print('ecorp mirada:', e)


# ---------------------------------------------------------------- tabla cara -> cuerpo
def tabla(rig):
    return U.leer_json(U.props(rig).tabla)


def poner_tabla(rig, gesto, clave):
    t = tabla(rig)
    if clave:
        t[gesto] = clave
    else:
        t.pop(gesto, None)
    U.props(rig).tabla = U.escribir_json(t)
    return t


def clave_cuerpo(rig, gesto):
    """expresión corporal para un gesto facial: tabla del rig > excepciones de la biblioteca > <gesto>_<estilo>."""
    from . import biblioteca as BI
    t = tabla(rig)
    if gesto in t:
        return t[gesto]
    lib = BI.cargar()
    if gesto in lib['vinculos']:
        return lib['vinculos'][gesto]
    c = f'{gesto}_{U.props(rig).estilo}'
    if U.item_expr(rig, c) is not None or c in lib['expresiones']:
        return c
    return None


def tabla_completa(rig):
    ctrl = control_de(rig)
    gestos = [gesto_de_accion(a) for a in acciones_cara(ctrl)] if ctrl else []
    return {g: clave_cuerpo(rig, g) for g in gestos}


# ---------------------------------------------------------------- reacción
def reaccionar(rig, gesto, escala=1.0):
    """el cuerpo sigue al gesto facial: cambia la expresión de la previsualización o pone la pose estática."""
    from . import capas as CA
    pg = U.props(rig)
    clave = clave_cuerpo(rig, gesto)
    if clave is None:
        return None
    _gesto[rig.name] = gesto
    k = pg.int_cuerpo
    if CA.activa(rig):
        st = CA.estado(rig)
        CA.previsualizar(rig, clave, base=st.get('base'), inicio=st.get('inicio', 1), intensidad=k)
    else:
        CA.aplicar_pose(rig, clave, intensidad=k)
    return clave


def _rigs_vinculados():
    out = []
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            try:
                if o.ecorp.vinculo:
                    out.append(o)
            except AttributeError:
                return []
    return out


@bpy.app.handlers.persistent
def _depsgraph(scene, depsgraph=None):
    if _ocupado[0]:
        return
    try:
        if bpy.app.is_job_running('RENDER'):
            return
    except Exception:
        pass
    _ocupado[0] = True
    try:
        for rig in _rigs_vinculados():
            ctrl = control_de(rig)
            if ctrl is None:
                continue
            v = vector(ctrl)
            ant = _ultimo.get(rig.name)
            if ant is not None and all(abs(v.get(n, 0.0) - ant.get(n, 0.0)) < 1e-4 for n in set(v) | set(ant)):
                continue
            _ultimo[rig.name] = v
            g, k = clasificar(ctrl, v)
            if g is None or g == _gesto.get(rig.name):
                continue
            try:
                reaccionar(rig, g, k)
            except Exception as e:
                print('ecorp vinculo:', e)
    finally:
        _ocupado[0] = False


def _al_cambiar_editor(*_):
    """el editor del facial cambió de expresión (scene.rlb_editor.expr = nombre de la acción)."""
    sc = bpy.context.scene
    ed = getattr(sc, 'rlb_editor', None)
    if ed is None:
        return
    a = bpy.data.actions.get(getattr(ed, 'expr', '') or '')
    if a is None:
        return
    g = gesto_de_accion(a)
    for rig in _rigs_vinculados():
        try:
            if g != _gesto.get(rig.name):
                reaccionar(rig, g)
        except Exception as e:
            print('ecorp vinculo (editor):', e)


def suscribir():
    bpy.msgbus.clear_by_owner(_dueno)
    for sc in bpy.data.scenes:
        ed = getattr(sc, 'rlb_editor', None)
        if ed is None:
            continue
        try:
            bpy.msgbus.subscribe_rna(key=ed.path_resolve('expr', False), owner=_dueno, args=(),
                                     notify=_al_cambiar_editor, options={'PERSISTENT'})
        except Exception as e:
            print('ecorp msgbus:', e)


@bpy.app.handlers.persistent
def _cargar(*_):
    _ultimo.clear(); _gesto.clear()
    suscribir()


def activar(rig, cara_control=None):
    pg = U.props(rig)
    ctrl = cara_control if cara_control is not None else buscar_control(rig)
    if isinstance(ctrl, str):
        ctrl = bpy.data.objects.get(ctrl)
    if ctrl is None:
        raise RuntimeError('No encuentro el control de la cara (<cara>_Cara_Control): elígelo')
    pg.control = ctrl.name
    pg.vinculo = True
    _ultimo.pop(rig.name, None); _gesto.pop(rig.name, None)
    suscribir()
    return {'control': ctrl.name, 'gestos': len(acciones_cara(ctrl)), 'tabla': tabla_completa(rig),
            'facial_instalado': hasattr(bpy.types.Scene, 'rlb_editor')}


def desactivar(rig):
    U.props(rig).vinculo = False
    _ultimo.pop(rig.name, None); _gesto.pop(rig.name, None)
    return {'vinculo': False}


def aplicar_completa(rig, gesto, frame=None, intensidad_cara=1.0, intensidad_cuerpo=1.0, adelanto=ADELANTO_CARA):
    """cara + cuerpo a la vez. Sin frame: pose estática. Con frame: el cuerpo entra en la línea de tiempo en 'frame'
    y la cara se clava 'adelanto' fotogramas antes; salen juntas."""
    from . import capas as CA, generador as GE
    ctrl = control_de(rig)
    clave = clave_cuerpo(rig, gesto)
    res = {'gesto': gesto, 'cuerpo': clave, 'cara': None}
    a_cara = None
    if ctrl is not None:
        a_cara = next((a for a in acciones_cara(ctrl) if gesto_de_accion(a) == gesto), None)
        ad = ctrl.animation_data
        if frame is not None and ad and ad.action and '_FACS_' in ad.action.name:
            raise RuntimeError('La cara está en el editor de expresiones del facial: termina de editar primero')
    pesos = pesos_accion(a_cara) if a_cara is not None else ({} if gesto in ('neutro', 'neutra') else None)
    _ocupado[0] = True
    try:
        if frame is None:
            if pesos is not None:
                poner_cara(ctrl, pesos, intensidad_cara)
                if a_cara is not None:
                    _mirada(ctrl, a_cara, intensidad_cara)
                res['cara'] = a_cara.name if a_cara else 'neutra'
            if clave:
                CA.aplicar_pose(rig, clave, intensidad=intensidad_cuerpo)
        else:
            if clave and clave != 'neutra':
                r = CA.colocar(rig, clave, frame, intensidad=intensidad_cuerpo)
                ab = U.accion(rig, r['clave'])
                mk = {m.name: m.frame for m in ab.pose_markers}
                ini = frame
                pico = frame + mk.get('pico', 1) - 1
                sal = frame + mk.get('salida', 1) - 1
                fin = frame + mk.get('fin', 1) - 1
            else:
                ini = pico = sal = fin = frame
            res['tramo'] = [ini, fin]
            if pesos is not None and ctrl is not None:
                canales = [k for k in ctrl.keys() if k.startswith('v_')
                           and (abs(float(ctrl[k])) > 1e-6 or abs(pesos.get(k[2:], 0.0)) > 1e-6)]
                antes = {k[2:]: float(ctrl[k]) for k in canales}
                f0 = ini - adelanto
                entra = max(f0 + 2, pico - adelanto)
                poner_cara(ctrl, antes, 1.0, f0, canales)
                poner_cara(ctrl, pesos, intensidad_cara, entra, canales)
                if sal > entra:
                    poner_cara(ctrl, pesos, intensidad_cara, sal, canales)
                    poner_cara(ctrl, {}, 1.0, max(fin, sal + 2), canales)
                res['cara'] = a_cara.name if a_cara else 'neutra'
                res['claves_cara'] = [f0, entra, sal, max(fin, sal + 2)]
        bpy.context.view_layer.update()
    finally:
        _ocupado[0] = False
    if ctrl is not None:
        _ultimo[rig.name] = vector(ctrl)
    _gesto[rig.name] = gesto
    return res


def register():
    if _depsgraph not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(_depsgraph)
    if _cargar not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(_cargar)
    try:
        suscribir()
    except Exception:
        pass


def unregister():
    for lista, f in ((bpy.app.handlers.depsgraph_update_post, _depsgraph), (bpy.app.handlers.load_post, _cargar)):
        for h in list(lista):
            if getattr(h, '__name__', '') == f.__name__ and getattr(h, '__module__', '') == f.__module__:
                lista.remove(h)
    bpy.msgbus.clear_by_owner(_dueno)
