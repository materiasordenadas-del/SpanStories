"""Plan independiente AU7: sin tocar mejilla, Basis ni drivers de controles."""
import base64
import hashlib
import io
import json
import ast
import bpy
import numpy as np
from . import ajustes_ojos as AO
from . import ojos as OJ
from . import parpados_aislados as PA
from . import regenerar_cierre_parpados as RC
from . import mascaras_parpados as MP
from .parpados_seguridad import Seguridad

PROPIEDAD = 'rlb_tension_parpados'


def _firma_variable(variable):
    t=variable.targets[0]
    if variable.type=='SINGLE_PROP':return (variable.type,t.id,t.data_path)
    if variable.type=='TRANSFORMS':return (variable.type,t.id,t.bone_target,t.transform_type,t.transform_space)
    return None


def _desacople(cara):
    """Retira únicamente la entrada de AU7 del parpadeo, sin cambiar las demás."""
    par=bpy.data.objects.get(cara.name+'_Control_Parpados');fac=AO.BI.control(cara)
    if par is None:return {}
    sk=cara.data.shape_keys;ds=RC._drivers(sk);resultado={}
    for lado in ('L','R'):
        ruta=f'["parpadeo_{lado}"]';f=RC._drivers(par).get(ruta)
        if f is None:continue
        n='eyeSquint_'+lado;k=sk.key_blocks[n];fuente=ds.get(k.path_from_id('value'))
        firmas={_firma_variable(v) for v in fuente.driver.variables} if fuente else set()
        firmas.discard(None)
        firmas|={('SINGLE_PROP',fac,f'["v_{n}"]'),('SINGLE_PROP',sk,k.path_from_id('value'))}
        quitar={v.name for v in f.driver.variables if _firma_variable(v) in firmas}
        if not quitar:continue
        if f.driver.type!='SCRIPTED' or len(f.modifiers):raise RuntimeError('Enlace de parpadeo no editable')
        nombres={v.name for v in f.driver.variables}
        class Separar(ast.NodeTransformer):
            def visit(self,node):
                usadas={x.id for x in ast.walk(node) if isinstance(x,ast.Name)} & nombres
                if usadas and usadas<=quitar:return ast.copy_location(ast.Constant(value=0.),node)
                return super().visit(node)
        tree=ast.fix_missing_locations(Separar().visit(ast.parse(f.driver.expression,mode='eval')))
        nueva=ast.unparse(tree.body)
        if len(nueva.encode('utf8'))>255:raise RuntimeError('Enlace de parpadeo demasiado largo')
        compile(nueva,'<parpadeo independiente>','eval')
        resultado[ruta]={'antes':f.driver.expression,'despues':nueva}
    return resultado


def _digest(cara, nombres, overrides=None):
    kb = cara.data.shape_keys.key_blocks
    h = hashlib.sha256(RC.firma(cara).encode())
    base = AO._co(cara.data.shape_keys.reference_key)
    for n in sorted(nombres):
        co = base + overrides[n] if overrides is not None and n in overrides else AO._co(kb[n])
        h.update(n.encode()); h.update(np.asarray(co, dtype=np.float32).tobytes())
    return h.hexdigest()


def _fuentes(cara, s, reglas, overrides=None):
    kb = cara.data.shape_keys.key_blocks
    nombres = [f'eyeBlink_{s}']
    medio = f'eyeBlink_mid_{s}'
    if medio in kb or overrides is not None and medio in overrides: nombres.append(medio)
    nombres.extend(sorted(n for n, regla in reglas.items() if n.endswith('_' + s)
                          and n.startswith('eyeBlink_safe_') and regla.get('tipo') == 'blink_hat'))
    if any(n not in kb and (overrides is None or n not in overrides) or n in kb and kb[n].relative_key != cara.data.shape_keys.reference_key for n in nombres):
        raise RuntimeError('Falta una key de la trayectoria blink o no es relativa al Basis')
    return nombres


def _trayectoria(cara, s, reglas, b, overrides=None):
    kb = cara.data.shape_keys.key_blocks; base = AO._co(cara.data.shape_keys.reference_key)
    nombres = _fuentes(cara, s, reglas, overrides)
    def delta_de(n):
        return np.asarray(overrides[n]) if overrides is not None and n in overrides else AO._co(kb[n]) - base
    delta = b * delta_de(nombres[0])
    for n in nombres[1:]:
        if n.startswith('eyeBlink_mid_'):
            w = max(0., min(2*b, 2*(1-b)))
        else:
            r = reglas[n]; a, t, z = (float(r[x]) for x in ('a', 't', 'b'))
            if not 0 <= a < t < z <= 1: raise RuntimeError('Correctiva blink inválida')
            w = max(0., min((b-a)/(t-a), (z-b)/(z-t)))
        delta += w * delta_de(n)
    return delta


def combinar(blink, tension, b, s):
    return np.asarray(blink) + (1. - float(b)) * float(s) * np.asarray(tension)


def _envolvente(cara, lado, delta):
    """Unión suave de los seis puntos; fuera no se modifica piel."""
    me = cara.data; base = AO._co(me.shape_keys.reference_key)
    edges = np.empty(len(me.edges) * 2, dtype=np.int32)
    me.edges.foreach_get('vertices', edges); edges = edges.reshape(-1, 2)
    me.calc_loop_triangles()
    tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int32)
    me.loop_triangles.foreach_get('vertices', tris); tris = tris.reshape(-1, 3)
    raw = cara.get('rlb_borde_parpado', '{}')
    bordes = json.loads(raw) if isinstance(raw, str) else dict(raw)
    previas = dict(cara.get('aj_anclas', {}))
    anclas = {(lab, i): int(previas[f'parpado_{lab}_{i}_{lado}'])
              for lab in ('sup', 'inf') for i in range(1, AO.MAX_PUNTOS + 1)
              if f'parpado_{lab}_{i}_{lado}' in previas}
    mascaras, _, _ = MP.calcular(base, edges, delta,
        {lab: bordes.get(f'{lab}_{lado}', []) for lab in ('sup', 'inf')}, anclas, tris)
    env = np.clip(sum(mascaras.values()), 0., 1.)
    if not np.isfinite(env).all() or not np.any(env > 0):
        raise RuntimeError('No se pudo identificar la envolvente palpebral: ' + lado)
    return env


def _limitar(delta, envolvente, ponderar=False):
    d = np.asarray(delta, dtype=float).copy(); env = np.asarray(envolvente, dtype=float)
    if d.shape != (len(env), 3) or not np.isfinite(env).all() or np.any(env < 0) or np.any(env > 1):
        raise RuntimeError('Envolvente palpebral incompatible')
    if ponderar: d *= env[:, None]
    d[env <= 0.] = 0.
    return d


def calcular(cara, mainkeys_override=None, maininfo_override=None, param_override=None):
    """Plan de dos lados. Validación sin modificadores: no escribe ningún dato."""
    if cara.mode != 'OBJECT' or cara.data.users > 1:
        raise RuntimeError('Se requiere modo Objeto y malla de usuario único')
    seeds = list(cara.get('rlb_parpados_uv_seeds', []))
    if not seeds: raise RuntimeError('Faltan las islas UV identificadas de los párpados')
    params = dict(param_override) if param_override is not None else json.loads(cara.get('rlb_parpados_parametros', '{}'))
    if params.get('transporte') == 'espacial':
        raise RuntimeError('La tensión independiente aún no está validada con transporte espacial')
    main_params = dict(params)
    params.pop('aporte_superior', None)
    params.update({'contacto_extremos': False, 'solape_angular': 0.,
                   'relieve_contacto': 0., 'retroceso_contacto': 0.})
    K, ojos = PA.contexto(cara, seeds, expandir=not params.get('limitar_uv', False))
    kb = cara.data.shape_keys.key_blocks
    reglas = (RC._reglas(maininfo_override) if maininfo_override is not None
              else json.loads(cara.get('rlb_parpados_reglas', '{}')))
    fuentes = set(); deltas = {}; informes = {}; soportes = {}
    for lado in ('L', 'R'):
        squint = f'eyeSquint_{lado}'
        if squint not in kb or kb[squint].relative_key != cara.data.shape_keys.reference_key:
            raise RuntimeError('Falta el canal eyeSquint relativo al Basis: ' + lado)
        fuentes.update(_fuentes(cara, lado, reglas, mainkeys_override)); fuentes.add(squint)
        ojo = ojos[lado]
        sup = PA.Superficie(cara, K, ojo, dict(params, cierre=0.))
        inf = PA.Superficie(cara, K, ojo, dict(params, cierre=1.))
        ds = sup.resolver(float(OJ.PARAM['entornar_sup'])) - K.p
        di = inf.resolver(float(OJ.PARAM['entornar_inf'])) - K.p
        # La posición del arco opuesto queda exactamente fija, aun si los
        # polinomios del contorno no interpolan perfectamente sus vértices.
        den = sup.dU + sup.dL
        ws = np.divide(sup.dL, den, out=np.zeros_like(den), where=np.isfinite(den) & (den > 0))
        wi = np.divide(inf.dU, den, out=np.zeros_like(den), where=np.isfinite(den) & (den > 0))
        ws[sup.U] = 1.; ws[sup.L] = 0.; wi[inf.U] = 0.; wi[inf.L] = 1.
        ds *= ws[:, None]; di *= wi[:, None]
        env = _envolvente(cara, lado, _trayectoria(cara, lado, reglas, 1., mainkeys_override))
        envolvente_local = env[K.zona]
        bruto = _limitar(ds + di, envolvente_local, ponderar=True)
        piv = __import__('bpy').data.objects[f'{cara.name}_OjoPivote_{lado}']
        M = cara.matrix_world.inverted()
        radio = max(np.linalg.norm(np.array((M @ ch.matrix_world @ v.co)[:]) - ojo.c)
                    for ch in piv.children_recursive if ch.type == 'MESH' for v in ch.data.vertices)
        main = PA.Superficie(cara, K, ojo, main_params)
        if 'aporte_superior' in main_params: main.P['cierre'] = 1. - float(main_params['aporte_superior'])
        safe = Seguridad(K, ojo, main.reg, radio)
        safe.establecer_orden(main)
        tension, correccion = safe.corregir(bruto)
        # Seguridad puede difundir fuera de la banda: no se amplía el alcance.
        # Las 25 combinaciones se comprueban de nuevo tras recortar.
        tension = _limitar(tension, envolvente_local)
        if not np.isfinite(tension).all() or not np.any(np.linalg.norm(tension, axis=1) > 1e-8):
            raise RuntimeError('La tensión inferior calculada es nula o inválida: ' + lado)
        trayectorias={b:_trayectoria(cara,lado,reglas,b,mainkeys_override)[K.zona] for b in np.linspace(0.,1.,9)}
        # Ajustar el mismo campo AU7 contra sus combinaciones, conservando su
        # alcance. No reducir toda la intensidad para ocultar una inversión.
        corrector=Seguridad(K,ojo,main.reg,radio)
        movibles=main.reg & (envolvente_local>0.)
        corrector.reg=movibles;corrector.im=movibles.astype(float);corrector.colision &=movibles
        correcciones_combinadas=0
        for _ in range(12):
            reparadas=0
            for b,blink in trayectorias.items():
                for s in np.linspace(0.,1.,9):
                    actual=combinar(blink,tension,b,s);medida=safe.medir(actual)
                    if safe.valido(medida):continue
                    factor=(1.-b)*s
                    if factor<=1e-12:continue
                    target=corrector._proyectar(actual,initial=actual,iterations=160,drive=0.)
                    if not safe.valido(safe.medir(target)):
                        target=corrector._proyectar(actual,initial=target,iterations=400,drive=0.)
                    if not safe.valido(safe.medir(target)):continue
                    tension=_limitar(tension+(target-actual)/factor,envolvente_local)
                    reparadas+=1;correcciones_combinadas+=1
            if reparadas==0:break
        fallos=[]
        for b,blink in trayectorias.items():
            for s in np.linspace(0.,1.,9):
                medida=safe.medir(combinar(blink,tension,b,s))
                if not safe.valido(medida):fallos.append({'blink':float(b),'tension':float(s),**medida})
        if fallos: raise RuntimeError(f'AU7 {lado}: combinaciones no seguras; no se escribió nada: {fallos[:2]}')
        delta = np.zeros_like(K.P); delta[K.zona] = tension
        if np.any(delta[env <= 0.] != 0.): raise RuntimeError('La tensión salió de la envolvente palpebral')
        deltas[squint] = delta
        soportes[squint] = env > 0.
        informes[lado] = {'poses': 81, 'fallos': fallos, 'correccion': correccion,
                          'correcciones_combinadas':correcciones_combinadas,
                          'param_sup': float(OJ.PARAM['entornar_sup']), 'param_inf': float(OJ.PARAM['entornar_inf']),
                          'vertices_envolvente': int(np.count_nonzero(env)),
                          'vertices_fuera_movidos': int(np.count_nonzero(np.any(delta[env <= 0.] != 0., axis=1)))}
    return {'firma': RC.firma(cara), 'fuentes': sorted(fuentes), 'digest': _digest(cara, fuentes, mainkeys_override),
            'deltas': deltas, 'soportes': soportes, 'informe': informes}


def _serializar_respaldo(cara, nombres):
    kb = cara.data.shape_keys.key_blocks
    buf = io.BytesIO()
    np.savez_compressed(buf, **{n: AO._co(kb[n]).astype(np.float32) for n in nombres if n in kb})
    return base64.b85encode(buf.getvalue()).decode('ascii')


def _driver_guardado(spec):
    if spec is None: return None
    exp, variables, mute = spec
    return [exp, [[name, typ, target.name_full if target else None, path] for name, typ, target, path in variables], mute]


def _verificar_correctivas(cara, nombres):
    sk = cara.data.shape_keys; kb = sk.key_blocks; ds = RC._drivers(sk)
    for n in nombres:
        if n not in kb: raise RuntimeError('Falta una correctiva propia: ' + n)
        lado = n[-1]; f = ds.get(kb[n].path_from_id('value'))
        if f is None or len(f.modifiers) or f.driver.type != 'SCRIPTED' or f.driver.expression != 'b*s':
            raise RuntimeError('La correctiva fue modificada; no se reemplazará: ' + n)
        variables = {v.name: (v.type, v.targets[0].id, v.targets[0].data_path) for v in f.driver.variables}
        if variables != {'b': ('SINGLE_PROP', sk, kb[f'eyeBlink_{lado}'].path_from_id('value')),
                         's': ('SINGLE_PROP', sk, kb[f'eyeSquint_{lado}'].path_from_id('value'))}:
            raise RuntimeError('Las variables de una correctiva fueron modificadas: ' + n)


def _producto_heredado(cara,nombre):
    sk=cara.data.shape_keys;k=sk.key_blocks[nombre];f=RC._drivers(sk).get(k.path_from_id('value'))
    if k.relative_key!=sk.reference_key or f is None or len(f.modifiers) or f.driver.type!='SCRIPTED':return False
    vs=list(f.driver.variables)
    if len(vs)!=2 or any(v.type!='SINGLE_PROP' or v.targets[0].id!=sk for v in vs):return False
    rutas={sk.key_blocks['eyeBlink_'+nombre[-1]].path_from_id('value'),sk.key_blocks['eyeSquint_'+nombre[-1]].path_from_id('value')}
    if {v.targets[0].data_path for v in vs}!=rutas:return False
    try:tree=ast.parse(f.driver.expression,mode='eval').body
    except SyntaxError:return False
    return (isinstance(tree,ast.BinOp) and isinstance(tree.op,ast.Mult) and
            isinstance(tree.left,ast.Name) and isinstance(tree.right,ast.Name) and
            {tree.left.id,tree.right.id}=={v.name for v in vs})


def aplicar_plan(cara, plan):
    """Escritura atómica: solo eyeSquint y correctivas propias; guarda respaldo."""
    if cara.mode != 'OBJECT' or RC.firma(cara) != plan['firma'] or _digest(cara, plan['fuentes']) != plan['digest']:
        raise RuntimeError('El Basis o las fuentes cambiaron desde el cálculo')
    kb = cara.data.shape_keys.key_blocks; sk = cara.data.shape_keys
    prev = json.loads(cara.get(PROPIEDAD, '{}'))
    correctivas = [f'eyeBlink_eyeSquint_{s}' for s in ('L', 'R')]
    if any(n in kb and n not in prev.get('correctivas', []) and not _producto_heredado(cara,n) for n in correctivas):
        raise RuntimeError('Ya existe una correctiva de squint ajena; no se reemplazará')
    _verificar_correctivas(cara, [n for n in correctivas if n in kb and n in prev.get('correctivas',[])])
    if any(plan['informe'][s]['poses'] < 25 or plan['informe'][s]['fallos'] for s in ('L', 'R')):
        raise RuntimeError('El plan no cuenta con validación de combinaciones')
    nombres = ['eyeSquint_L', 'eyeSquint_R'] + correctivas
    coords = {n: AO._co(kb[n]).copy() for n in nombres if n in kb}
    drivers = {n: RC._snapshot_driver(RC._drivers(sk).get(kb[n].path_from_id('value'))) for n in correctivas if n in kb}
    original = cara.get(PROPIEDAD); antes = set(kb.keys()); base = AO._co(sk.reference_key)
    for n, d in plan['deltas'].items():
        if n not in ('eyeSquint_L', 'eyeSquint_R') or np.shape(d) != base.shape or not np.isfinite(d).all():
            raise RuntimeError('Delta de tensión incompatible')
        soporte = np.asarray(plan.get('soportes', {}).get(n, []), dtype=bool)
        if soporte.shape != (len(base),) or np.any(np.asarray(d)[~soporte] != 0.):
            raise RuntimeError('El delta sale de la envolvente palpebral: ' + n)
    if set(plan['deltas']) != {'eyeSquint_L', 'eyeSquint_R'}: raise RuntimeError('Faltan los dos lados')
    respaldo = _serializar_respaldo(cara, nombres)
    desacople=_desacople(cara)
    control_parpados=bpy.data.objects.get(cara.name+'_Control_Parpados')
    try:
        for lado in ('L', 'R'):
            n = f'eyeSquint_{lado}'; c = f'eyeBlink_eyeSquint_{lado}'
            kb[n].data.foreach_set('co', (base + plan['deltas'][n]).ravel())
            if c not in kb: cara.shape_key_add(name=c, from_mix=False)
            kb[c].data.foreach_set('co', (base - plan['deltas'][n]).ravel())
            RC._set_driver(kb[c], ('b*s', [('b', 'KEY', sk, kb[f'eyeBlink_{lado}'].path_from_id('value')),
                                            ('s', 'KEY', sk, kb[n].path_from_id('value'))], False))
        for ruta,spec in desacople.items():RC._drivers(control_parpados)[ruta].driver.expression=spec['despues']
        cara[PROPIEDAD] = json.dumps({'version': 1, 'firma': plan['firma'], 'correctivas': correctivas,
                                     'respaldo': respaldo, 'existentes': sorted(set(nombres) & antes),
                                     'drivers_previos': {n: _driver_guardado(spec) for n, spec in drivers.items()},
                                     'anterior': original,'desacople':desacople}, separators=(',', ':'))
        sk.update_tag(); cara.update_tag(refresh={'DATA'})
    except Exception:
        for ruta,spec in desacople.items():RC._drivers(control_parpados)[ruta].driver.expression=spec['antes']
        for n in correctivas:
            if n not in antes and n in kb: cara.shape_key_remove(kb[n])
        for n, co in coords.items(): kb[n].data.foreach_set('co', co.ravel())
        for n, spec in drivers.items(): RC._set_driver(kb[n], spec)
        if original is None:
            if PROPIEDAD in cara: del cara[PROPIEDAD]
        else: cara[PROPIEDAD] = original
        sk.update_tag(); cara.update_tag(refresh={'DATA'})
        raise
    return {'correctivas': correctivas, 'informe': plan['informe']}


def restaurar(cara):
    """Restaura el respaldo de la última aplicación sin tocar otras keys."""
    import bpy
    raw = cara.get(PROPIEDAD)
    if not raw: raise RuntimeError('No hay respaldo de tensión palpebral')
    meta = json.loads(raw)
    if cara.mode != 'OBJECT' or meta['firma'] != RC.firma(cara):
        raise RuntimeError('La malla cambió; el respaldo se conserva sin aplicar')
    kb = cara.data.shape_keys.key_blocks; sk = cara.data.shape_keys
    _verificar_correctivas(cara, meta['correctivas'])
    control_parpados=bpy.data.objects.get(cara.name+'_Control_Parpados')
    for ruta,spec in meta.get('desacople',{}).items():
        f=RC._drivers(control_parpados).get(ruta) if control_parpados else None
        if f is None or f.driver.expression!=spec['despues']:raise RuntimeError('El enlace de parpadeo cambió; no se restauró')
    drivers = {}
    for n, spec in meta.get('drivers_previos', {}).items():
        if spec is None: drivers[n] = None; continue
        exp, variables, mute = spec; restored = []
        for name, typ, target_name, path in variables:
            coleccion = {'KEY': bpy.data.shape_keys, 'OBJECT': bpy.data.objects}.get(typ)
            if coleccion is None or target_name and coleccion.get(target_name) is None:
                raise RuntimeError('No se puede recuperar un destino del driver respaldado')
            restored.append((name, typ, coleccion.get(target_name) if target_name else None, path))
        drivers[n] = (exp, restored, mute)
    with np.load(io.BytesIO(base64.b85decode(meta['respaldo'])), allow_pickle=False) as archivo:
        coords = {n: np.asarray(archivo[n], dtype=float) for n in archivo.files}
    if set(coords) != set(meta['existentes']) or any(x.shape != (len(cara.data.vertices), 3) or not np.isfinite(x).all() for x in coords.values()):
        raise RuntimeError('Respaldo de tensión incompatible')
    for n in meta['correctivas']:
        if n not in kb: raise RuntimeError('Falta una correctiva propia; no se restaurará parcialmente')
    if any(n not in kb for n in coords): raise RuntimeError('Falta una key respaldada')
    afectados = set(coords) | set(meta['correctivas'])
    actuales = {n: AO._co(kb[n]) for n in afectados}
    actuales_drivers = {n: RC._snapshot_driver(RC._drivers(sk).get(kb[n].path_from_id('value'))) for n in meta['correctivas']}
    try:
        for n, co in coords.items():
            kb[n].data.foreach_set('co', co.ravel())
            if n in drivers: RC._set_driver(kb[n], drivers[n])
        for n in meta['correctivas']:
            if n not in coords: cara.shape_key_remove(kb[n])
        for ruta,spec in meta.get('desacople',{}).items():RC._drivers(control_parpados)[ruta].driver.expression=spec['antes']
        if meta['anterior'] is None: del cara[PROPIEDAD]
        else: cara[PROPIEDAD] = meta['anterior']
    except Exception:
        for ruta,spec in meta.get('desacople',{}).items():RC._drivers(control_parpados)[ruta].driver.expression=spec['despues']
        for n, co in actuales.items():
            if n not in kb: cara.shape_key_add(name=n, from_mix=False)
            kb[n].data.foreach_set('co', co.ravel())
        for n, spec in actuales_drivers.items(): RC._set_driver(kb[n], spec)
        cara[PROPIEDAD] = raw
        raise
    sk.update_tag(); cara.update_tag(refresh={'DATA'})
