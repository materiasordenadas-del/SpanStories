# Construcción FACS completa, paso a paso (lo que llama el panel «Cara FACS» y lo que se puede llamar por código).
# Va ENCIMA del rig del complemento (pasos 1–8: marcadores RLB_<cara>_*, <cara>_Rig_Labios con 'mandibula' y los
# huesos radiales de los párpados, ojos con <cara>_OjoPivote_<lado>, piezas <cara>_Dientes_sup/_inf, _Lengua,
# _Boca_Fondo). Resultado: shape keys ARKit en la cara y en las piezas (morphs para three.js), correctivas con
# regla exportable, delineado del párpado, controles en la cara y canales v_<forma> para la biblioteca y el habla.
#
#   from <complemento>.nucleo.facs import pipeline as FP
#   FP.construir_todo(cara)                 # o paso a paso: preparar, boca, ojos, delineado, controles, terminar
#   FP.expresion(cara, 'alegria', 1.0)      # biblioteca expresiones_facs.json
#   FP.hablar(cara, [{'nombre': 'frase', 'texto': '...', 'audio': r'...wav'}])
import bpy, json
from contextlib import contextmanager
import numpy as np
from . import cara as CA, geometria as G, formas as FM, construir as C, interior as I, ojos as OJ, delineado as D
from . import controles as CT, biblioteca as BI, habla as H, delineado_uv as DU
from .. import boca_tom as BT


def contexto(cara):
    K = CA.Cara(cara)
    return K, FM.Formas(K)


def _rig(cara):
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    if rig is None:
        raise RuntimeError('Falta el rig del complemento (pasos 1–8) para esta cara')
    return rig


def _modo_objeto(cara):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


@contextmanager
def _en_cero(cara):
    """todas las keys FACS a 0 (sin la acción del control) mientras se mide o se hornea."""
    ctrl = bpy.data.objects.get(f'{cara.name}_Cara_Control')
    ad = ctrl.animation_data if ctrl else None
    act = ad.action if ad else None
    vals = {k: ctrl[k] for k in ctrl.keys() if k.startswith('v_')} if ctrl else {}
    if ad:
        ad.action = None
    for k in vals:
        ctrl[k] = 0.0
    sk = cara.data.shape_keys
    viejos = {}
    if sk:
        for k in sk.key_blocks[1:]:
            if k.name in cara.get('facs_keys', []) and not (sk.animation_data and any(
                    f.data_path == f'key_blocks["{k.name}"].value' for f in sk.animation_data.drivers)):
                viejos[k.name] = k.value; k.value = 0.0
    bpy.context.view_layer.update()
    try:
        yield
    finally:
        for k, v in vals.items():
            ctrl[k] = v
        if ad:
            ad.action = act
        if sk:
            for n, v in viejos.items():
                sk.key_blocks[n].value = v
        bpy.context.view_layer.update()


@contextmanager
def _rig_parpados(cara, rig):
    """los modificadores Armature del rig viejo, encendidos solo mientras se hornean los párpados."""
    mods = [m for m in cara.modifiers if m.type == 'ARMATURE' and m.object == rig]
    vis = [m.show_viewport for m in mods]
    for m in mods:
        m.show_viewport = True
    try:
        yield
    finally:
        for m, v in zip(mods, vis):
            m.show_viewport = v


def apagar_rig_viejo(cara):
    """con las keys FACS el rig de huesos ya no deforma la cara: se apagan (no se borran) sus modificadores."""
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')
    n = 0
    for m in cara.modifiers:
        if (m.type == 'ARMATURE' and m.object == rig) or m.type == 'CORRECTIVE_SMOOTH':
            m.show_viewport = m.show_render = False; n += 1
    if rig is not None:        # oculto en la vista (no hide_viewport: dientes, lengua y ojos cuelgan de sus huesos)
        try:
            rig.hide_set(True)
        except Exception:
            pass
    # sus keys (ceja_*, mejilla, parp_contacto, labio_*_dentro) siguen con drivers a los huesos: con una acción
    # vieja puesta (Martín: «Gestos» en el frame 190) se sumaban a las FACS y rompían los párpados en reposo
    fk = set(cara.get('facs_keys', []))
    sk = cara.data.shape_keys
    if sk:
        for k in sk.key_blocks[1:]:
            if k.name not in fk and not k.name.startswith('fm_'):      # fm_* = forma de la cara (forma.py), con driver propio
                k.mute = True; n += 1
    return n


# ---------------------------------------------------------------- 1. malla
def preparar(cara):
    """Basis limpio una sola vez: guarda el original (atributo facs_basis_original), alisa la rejilla de Tripo y
    cierra los labios si vienen entreabiertos. Repetirlo no hace nada (cara['facs_preparada'])."""
    _modo_objeto(cara)
    if cara.get('facs_preparada'):
        return {'preparada': 'ya estaba'}
    G.guardar_original(cara)
    K = CA.Cara(cara)
    B = G.basis(cara)
    x, q = G.descuantizar(K)             # antes de densificar: los vértices nuevos no están en la rejilla de Tripo
    if x is not None:
        B[K.zona] = x; G.poner_basis(cara, B)
        K = CA.Cara(cara)
    cadenas = G.bordes_silueta(K)
    x2, Dz = G.sellar_labios(K, cadenas=cadenas)
    B = G.basis(cara); B[K.zona] = x2; G.poner_basis(cara, B)
    if cadenas is not None:                    # los bordes de contacto ya se conocen: no se vuelven a adivinar en la boca cerrada
        cara['facs_bordes_labios'] = json.dumps({'sup': K.zona[cadenas[0]].tolist(), 'inf': K.zona[cadenas[1]].tolist()})
    elif 'facs_bordes_labios' in cara:
        del cara['facs_bordes_labios']
    rd = None
    K = CA.Cara(cara)
    O = _ojos_de(cara, K)
    if O and not cara.get('facs_densificado'):
        # 0.6.9 (Lamine): la ruta completa también densifica la banda de los párpados, igual que parpados() (si no, el
        # borde del delineado sale dentado). La subdivisión plana conserva shape keys, grupos y el original guardado
        # (G.ATTR se interpola); los índices viejos no cambian
        from . import densificar as DN
        cortes, rd = DN.decidir(cara, K, O)
        cara['facs_dens_decision'] = json.dumps(rd)
        if cortes:
            DU.quitar(cara)
            rd.update(DN.densificar(cara, K, O, cortes=cortes))
        else:
            rd['densificado'] = 'no hace falta' if rd['modo'] == 'auto' else 'desactivado'
    reparada = I.reparar_piel(cara, CA.Cara(cara))      # agujeros y solapas de Tripo junto a la boca
    cara['facs_preparada'] = True
    return {'densificar': rd, 'reparada': reparada, 'rejilla_mm': round(q * 1000, 3) if q else None, 'sellado_max_mm': round(float(np.linalg.norm(Dz, axis=1).max()) * 1000, 2)}


# ---------------------------------------------------------------- 2. boca
def asegurar_plantilla(cara, K):
    """las tres piezas (dientes sup/inf, lengua) son las de Tom; si alguna no lo es, se sustituyen todas (0.8.44)."""
    from .. import boca_tom as BT_
    if not BT_.disponible():
        return 'sin biblioteca: se queda lo que haya'
    pz = C.Piezas(cara)
    if all(BT_.es_plantilla(o) for o in (pz.dsup, pz.dinf, pz.lengua)):
        return 'ya estaban'
    return BT_.colocar(cara, K, bpy.data.objects.get(f'{cara.name}_Rig_Labios'))


def piezas(cara, plantilla=True):
    """0.8.44: pone las piezas de la boca de Tom (dientes sup/inf, lengua y su fondo de boca) en una cara YA construida
    y rehace SOLO las keys de las piezas a partir de las keys actuales de la cara (que no se tocan, aunque estén
    retocadas a mano): giro rígido de la mandíbula, banda que se alarga con las comisuras, lengua arriba/fuera, drivers
    y bolsa contenida en la piel. No rehace expresiones, párpados ni controles."""
    _modo_objeto(cara)
    K, FO = contexto(cara)
    r = {}
    if plantilla:
        from .. import boca_tom as BT_
        r['plantilla'] = BT_.colocar(cara, K, bpy.data.objects.get(f'{cara.name}_Rig_Labios'))
        r['dientes_a_contacto'] = BT_.a_contacto(cara, K)
    pz = C.Piezas(cara)
    if pz.fondo is not None:
        I.crear_bolsa(cara, K, obj=pz.fondo)
    for o in pz.todas():                                  # keys viejas de las piezas fuera (la malla nueva no las tiene)
        if o.data.shape_keys:
            o.shape_key_clear()
        o['facs_keys'] = []
    pz = C.Piezas(cara)
    kb = cara.data.shape_keys.key_blocks
    mand = {n: m for n, f, m in C.formas_boca(FO) + C.formas_correctivas(FO)}
    hechas = []
    with _en_cero(cara):
        for nombre in cara.get('facs_keys', []):
            if nombre in mand and nombre in kb:
                C.escribir(cara, K, FO, nombre, _leer_key(cara, K, nombre), mandibula=mand[nombre], piezas=pz, solo_piezas=True)
                hechas.append(nombre)
        if pz.lengua is not None:
            r['lengua_keys'] = I.formas_lengua(cara, K)
    r['keys_piezas'] = len(hechas)
    I.colores_boca(cara)
    r['drivers'] = C.drivers_espejo(cara)
    C.drivers_correctivas(cara)
    CT.refrescar_drivers(cara)
    for o in [cara] + pz.todas():                         # drivers recién creados: inválidos hasta reevaluarlos
        sk = o.data.shape_keys
        if sk and sk.animation_data:
            for f in sk.animation_data.drivers:
                f.driver.expression = f.driver.expression; f.driver.is_valid = True
    bpy.context.evaluated_depsgraph_get().update()
    if pz.fondo is not None:
        ext = I.piel_exterior(cara, K)
        r['bolsa'] = I.contener_bolsa(cara, K, margen=0.25, exterior=ext)['movidos'].get('Basis', 0)
        c = I.contener_combinaciones(cara, K, exterior=ext)
        r['bolsa_combinaciones'] = {'vueltas': c['vueltas'], 'quedan': c['quedan']}
    return r


def boca(cara):
    """bolsa del fondo, forro oscuro, dientes en banda (lisa, larga, se estira con la boca), lengua, colores y
    formas de la boca + correctivas + lengua."""
    _modo_objeto(cara)
    K, FO = contexto(cara)
    r = {}
    # 0.8.44: dientes sup/inf y lengua por defecto = los de Tom (biblioteca/boca_tom.blend); el fondo de boca de Tom es
    # la bolsa de crear_bolsa. Las piezas de Tom ya vienen ajustadas: ni bandas nuevas ni lengua movida.
    r['plantilla_tom'] = asegurar_plantilla(cara, K)
    r['dientes_a_contacto'] = BT.a_contacto(cara, K)
    pz = C.Piezas(cara)
    if pz.fondo is not None:
        I.crear_bolsa(cara, K, obj=pz.fondo)
    r['forro_despintado'] = I.despintar_forro(cara, K)
    r['forro'] = I.oscurecer_forro(cara, K, alcance=(1.9, 1.3))
    r['comisuras'] = I.oscurecer_comisuras(cara, K)
    r['forro_suelto_quitado'] = I.limpiar_forro_suelto(cara, K)
    r['paredes'] = I.oscurecer_paredes(cara, K)
    if pz.dsup is not None and not BT.es_plantilla(pz.dsup):
        r['dientes'] = I.rehacer_dientes(cara, K)
    if pz.lengua is not None and not BT.es_plantilla(pz.lengua):
        r['lengua'] = I.ajustar_lengua(cara, K)
    I.colores_boca(cara)
    with _en_cero(cara):
        r['formas'] = len(C.crear(cara, K, FO, C.formas_boca(FO) + C.formas_correctivas(FO)))
        if pz.lengua is not None:
            r['lengua_keys'] = I.formas_lengua(cara, K)
    return r


# ---------------------------------------------------------------- 3. ojos, cejas, mejillas, nariz
# las formas del rig de párpados se quedan cortas para expresiones tipo Pixar: se amplían (comprobado que el
# párpado no entra en el globo)
ESCALA_PARPADOS = {'eyeSquint': 1.7, 'lidAngry': 1.5, 'lidSad': 1.5}


def _leer_key(cara, K, nombre):
    me = cara.data
    n = len(me.vertices)
    B = np.zeros(n * 3); me.shape_keys.reference_key.data.foreach_get('co', B)
    co = np.zeros(n * 3); me.shape_keys.key_blocks[nombre].data.foreach_get('co', co)
    return (co - B).reshape(-1, 3)[K.zona]


def ojos(cara, modo='giro', param=None):
    """párpados, cejas, mejillas y nariz.
    modo 'giro' (0.6.5, por defecto): cada vértice de los párpados y de la cuenca GIRA sobre el centro del ojo
    (parpados_giro.py): nada entra en el globo ni se dobla; las demás formas (cejas, mejilla, nariz, sonrisa) solo
    giran en la zona de los párpados; correctivas parpadeo × (entornar, mirar abajo, enfado, tristeza, mejilla,
    sonrisa); cejas sueltas pegadas a la piel y lente de oclusión con las keys FACS.
    modo 'rig': lo de antes (hornear el rig radial + suavizado + contacto de Gómez); en Martín rompía los párpados."""
    _modo_objeto(cara)
    from .. import malla as ML
    # 0.8.3: la cuenca del paso 8c tapa el borde del párpado y la ruta de superficie UV no lo encuentra. Se quita mientras se
    # hacen las keys y se rehace al final: al crearse copia las keys del borde (el margen sigue al párpado, la bolsa quieta)
    cuenca = _aislados_listos(cara) and modo != 'rig' and ML.quitar_cuenca(cara) > 0
    K, FO = contexto(cara)
    O = {l: OJ.Ojo(K, l) for l in ('L', 'R') if l in K.ojos or bpy.data.objects.get(f'{cara.name}_OjoPivote_{l}')}
    r = {}
    if modo == 'rig':
        rig = _rig(cara)
        Hn = OJ.hornear_parpados
        with _en_cero(cara), _rig_parpados(cara, rig):
            for l, o in O.items():
                Df = Hn(K, o, rig, {'parpado': -1.0}); Dh = Hn(K, o, rig, {'parpado': -0.5})
                C.escribir(cara, K, FO, f'eyeBlink_{l}', Df)
                C.escribir(cara, K, FO, f'eyeBlink_mid_{l}', Dh - 0.5 * Df)
                E = ESCALA_PARPADOS
                C.escribir(cara, K, FO, f'eyeSquint_{l}', E['eyeSquint'] * Hn(K, o, rig, {'parpado_inf': 1.0, 'parpado': -0.12}))
                C.escribir(cara, K, FO, f'eyeWide_{l}', Hn(K, o, rig, {'parpado': 1.0}))
                C.escribir(cara, K, FO, f'eyeLookDown_{l}', Hn(K, o, rig, {'parpado': -0.38}))
                C.escribir(cara, K, FO, f'eyeLookUp_{l}', Hn(K, o, rig, {'parpado': 0.35}))
                C.escribir(cara, K, FO, f'lidAngry_{l}', E['lidAngry'] * Hn(K, o, rig, {'parpado_in': -1.0}))
                C.escribir(cara, K, FO, f'lidSad_{l}', E['lidSad'] * Hn(K, o, rig, {'parpado_out': -1.0}))
                r[l] = {'cierre': o.medir_cierre(Df)}
    else:
        Gi = None
        if _aislados_listos(cara):
            # 0.8.3 (Ichigo): los párpados ya aprobados con la ruta de superficie UV (sin densificar ni tocar el Basis)
            # se reutilizan; el giro/ARAP sobre la malla densificada hundía la piel bajo la ceja (cráter al entornar)
            try:
                r['aislados'] = _keys_aislados(cara, K, O)
                Gi = {}
            except Exception as e:
                r['aislados'] = f'no (se usa el giro): {e}'
            cara['facs_ojos_ruta'] = str(r['aislados'])[:500]
        if Gi is None:
            if cuenca:                                   # el giro cuenta con la cuenca (la bolsa gira con el párpado)
                _rehacer_cuenca(cara); cuenca = False
                K, FO = contexto(cara)
                O = _ojos_de(cara, K)
            Gi = _keys_giro(cara, K, FO, O, param, r)
    A = OJ.Arriba(K, O)
    arriba = []
    # 0.8.3 (Ichigo): con los párpados de superficie UV la ceja no arrastra el párpado (subir la ceja abría el ojo cerrado y
    # dejaba una rendija blanca en el rabillo): las keys de ceja se apagan donde el parpadeo mueve la piel
    quieto = None
    if isinstance(r.get('aislados'), dict):
        quieto = np.zeros(len(K.zona))
        for l in O:
            f = np.linalg.norm(_leer_key(cara, K, f'eyeBlink_{l}'), axis=1)
            quieto = np.maximum(quieto, np.clip(f / (0.15 * f.max() + 1e-12), 0, 1))
    with _en_cero(cara):
        for l in O:
            for nm, fn in (('browInnerUp', A.browInnerUp), ('browOuterUp', A.browOuterUp), ('browDown', A.browDown),
                           ('cheekSquint', A.cheekSquint), ('noseSneer', A.noseSneer)):
                D_ = fn(l)
                if modo != 'rig':
                    for g in Gi.values():
                        D_ = g.rigidizar(D_)
                if quieto is not None and nm.startswith('brow'):
                    D_ = D_ * (1 - quieto)[:, None]
                C.escribir(cara, K, FO, f'{nm}_{l}', D_)
                arriba.append(f'{nm}_{l}')
    if modo == 'rig':
        C.drivers_correctivas(cara)
        r['suavizadas'] = OJ.suavizar_keys_parpado(cara, O)
        try:
            from .. import contacto as CTO, marco as MK
            M = MK.Marco(cara)
            for o in O.values():
                o.K = K
            with _en_cero(cara):
                r['contacto'] = {s: OJ.contacto_parpadeo(cara, K, O[s], CTO._bordes(cara, M, s)) for s in O}
        except Exception as e:                       # sin la receta de contacto el parpadeo sigue siendo válido
            r['contacto'] = f'no: {e}'
        return r
    # las demás formas (boca: la sonrisa sube la mejilla hasta el párpado) también solo giran ahí
    PARP = ('eyeBlink', 'eyeSquint', 'eyeWide', 'eyeLookDown', 'eyeLookUp', 'lidAngry', 'lidSad')
    giradas = []
    for n in cara.get('facs_keys', []):
        if n in C.CORRECTIVAS or n.startswith(PARP) or n in arriba or n not in cara.data.shape_keys.key_blocks:
            continue
        D0 = _leer_key(cara, K, n)
        D_ = D0
        for g in Gi.values():
            D_ = g.rigidizar(D_)
        if np.abs(D_ - D0).max() > 1e-5:
            # solo la cara: con escribir() se rehacían también dientes/lengua de esa key (sin la mandíbula)
            Dt = np.zeros((len(K.P), 3)); Dt[K.zona] = D_
            C.poner_key(cara, n, Dt, cara.data.shape_keys.key_blocks[n].value)
            giradas.append(n)
    r['giradas'] = giradas
    if isinstance(r.get('aislados'), dict):
        r['correctivas'] = _correctivas_aislados(cara, O)
    _cerrar_giro(cara, K, FO, O, Gi, r)
    if cuenca:
        r['cuenca'] = _rehacer_cuenca(cara)
    return r


def _rehacer_cuenca(cara):
    from .. import malla as ML, marco as MK
    M = MK.Marco(cara)
    return ML.cuenca(cara, M, bpy.data.objects.get(M.n['rig']), MK.cfg(cara).get('cuenca'))


def _ojos_de(cara, K):
    return {l: OJ.Ojo(K, l) for l in ('L', 'R') if l in K.ojos or bpy.data.objects.get(f'{cara.name}_OjoPivote_{l}')}


def _aislados_listos(cara):
    """párpados hechos y aprobados con la ruta de superficie UV (parpados_aislados): semillas y método guardados."""
    return bool(cara.get('rlb_parpados_uv_seeds')) and str(cara.get('rlb_parpados_metodo', '')).startswith('superficie_uv')


def _keys_aislados(cara, K, O):
    """0.8.3: keys de párpado FACS desde la ruta de superficie UV, sin densificar ni tocar el Basis. eyeBlink, su intermedia
    y eyeWide son las de parpados_aislados (validadas contra el globo en 325 poses); las demás son poses de esa misma curva
    de cierre repartidas por párpado (superior/inferior) y, en enfado y tristeza, por lado (nariz/fuera)."""
    from . import parpados_aislados as PAI
    from .grafo import ss
    semillas = [int(s) for s in cara['rlb_parpados_uv_seeds']]
    try:
        par = json.loads(cara.get('rlb_parpados_parametros') or '{}')
    except ValueError:
        par = {}
    _, keys, info = PAI.calcular(cara, semillas, par)
    hats = [n for n in keys if '_safe_' in n]
    if hats:
        raise RuntimeError(f'la curva necesita {len(hats)} correcciones por tramos (sin driver FACS para ellas)')
    P_ = OJ.PARAM
    from . import parpados_giro as PG
    out = {}
    with _en_cero(cara):
        for l, o in O.items():
            full, mid, wide = (keys[f'{k}_{l}'] for k in ('eyeBlink', 'eyeBlink_mid', 'eyeWide'))

            def pose(c, full=full, mid=mid):
                return c * full + max(0.0, min(2 * c, 2 * (1 - c))) * mid
            n = np.linalg.norm(full, axis=1)
            dz = (full @ K.Z) / np.maximum(n, 1e-9)
            ws = ss(-0.25, 0.25, -dz)[:, None]               # 1 en el párpado superior (baja al cerrar)
            wi = 1.0 - ws
            sx = 1 if l == 'L' else -1
            t = np.clip((sx * ((K.P - o.c) @ K.X) + o.r) / (2 * o.r), 0, 1)[:, None]    # 0 lado de la nariz, 1 fuera
            formas = {
                f'eyeBlink_{l}': full, f'eyeBlink_mid_{l}': mid, f'eyeWide_{l}': wide,
                f'eyeSquint_{l}': wi * pose(P_['entornar_inf']) + ws * pose(P_['entornar_sup']),
                f'eyeLookDown_{l}': ws * pose(P_['mirar_abajo_sup']) + wi * pose(P_['mirar_abajo_inf']),
                f'eyeLookUp_{l}': (P_['mirar_arriba_sup'] / PG.PARAM['abrir']) * wide,
                f'lidAngry_{l}': ws * (1 - t) * pose(PG.PARAM['enfadado']),
                f'lidSad_{l}': ws * t * pose(PG.PARAM['triste']),
            }
            for nm, Dk in formas.items():
                C.poner_key(cara, nm, Dk)
            out[l] = {'cierre_mm': round(float(n.max()) * 1000, 2), 'region': info[l]['region'],
                      'transporte': info[l]['transporte']}
    return out


def _correctivas_aislados(cara, O):
    """eyeBlink_<X>: parpadeo + X cierra igual que el parpadeo solo (lo que X mueve en el párpado se anula al cerrar)."""
    me = cara.data; kb = me.shape_keys.key_blocks; n = len(me.vertices)
    B = np.zeros(n * 3); me.shape_keys.reference_key.data.foreach_get('co', B); B = B.reshape(-1, 3)

    def leer(nm):
        a = np.zeros(n * 3); kb[nm].data.foreach_get('co', a); return a.reshape(-1, 3) - B
    hechas = []
    for l in O:
        f = np.linalg.norm(leer(f'eyeBlink_{l}'), axis=1)
        m = np.clip(f / (0.25 * f.max() + 1e-12), 0, 1)[:, None]      # donde el parpadeo manda
        for x in C.PARPADEO_CON:
            if f'{x}_{l}' not in kb:
                continue
            C.poner_key(cara, f'eyeBlink_{x}_{l}', -m * leer(f'{x}_{l}'))
            hechas.append(f'eyeBlink_{x}_{l}')
    return hechas


def _keys_giro(cara, K, FO, O, param, r):
    """keys de los párpados por giro puro (parpadeo + intermedia, entornar, abrir, mirar, enfado, tristeza)."""
    from . import parpados_giro as PG
    Gi = {l: PG.Giro(o, param) for l, o in O.items()}
    with _en_cero(cara):
        for l, g in Gi.items():
            Df = g.D(g.a_blink(1.0)); Dh = g.D(g.a_blink(0.5))
            C.escribir(cara, K, FO, f'eyeBlink_{l}', Df)
            C.escribir(cara, K, FO, f'eyeBlink_mid_{l}', Dh - 0.5 * Df)
            C.escribir(cara, K, FO, f'eyeSquint_{l}', g.D(g.a_squint()))
            C.escribir(cara, K, FO, f'eyeWide_{l}', g.D(g.a_wide()))
            C.escribir(cara, K, FO, f'eyeLookDown_{l}', g.D(g.a_down()))
            C.escribir(cara, K, FO, f'eyeLookUp_{l}', g.D(g.a_up()))
            C.escribir(cara, K, FO, f'lidAngry_{l}', g.D(g.a_angry()))
            C.escribir(cara, K, FO, f'lidSad_{l}', g.D(g.a_sad()))
        # 0.6.7: el parpadeo (y su intermedia) se RESUELVE: reborde rígido hasta la curva común + ARAP con el ojo de
        # colisión (parpados_arap.py). El giro solo queda para entornar, abrir, mirar, enfado y tristeza
        if (param or {}).get('cierre', 'arap') == 'arap':
            from . import parpados_arap as PA
            Gc, r['cierre'] = PA.cerrar(cara, K, FO, O, (param or {}).get('arap'))
            for l, o in O.items():
                o.cierre = Gc[l]
            r['normales'] = PA.normales_auto(cara, K, Gc)
            return Gi
        # 0.6.6: el giro da el movimiento liso; el CONTACTO lo da la receta de Codex (Gómez): los dos bordes a una
        # curva común (punto medio, cúbica en X) y el tejido sigue por solución armónica. Forzarlo con el giro de
        # cada vértice del zigzag doblaba la placa (muesca en el centro)
        for l, o in O.items():
            o.bordes_vis = _bordes_visibles(cara, K, o)
            r[l] = {'contacto': OJ.contacto_parpadeo(cara, K, o, o.bordes_vis, alcance=Gi[l].P['contacto_alcance']),
                    'borde_visible': [len(o.bordes_vis[0]), len(o.bordes_vis[1])]}
    return Gi


def _bordes_visibles(cara, K, o):
    """borde VISIBLE de frente (como en Gómez/Lian) -> (sup, inf) índices de vértice; el geométrico (el más cercano
    al eje) en un reborde grueso de Tripo queda por dentro y el contacto se medía y corregía donde no se ve."""
    from .. import ojos as OJV, marco as MK
    try:
        bs = OJV.abertura_visible(cara, MK.Marco(cara), o.lado)
    except Exception:
        bs = ([], [])
    if len(bs[0]) < 6 or len(bs[1]) < 6:
        bs = (K.zona[o.borde_sup], K.zona[o.borde_inf])
    return bs


def _cerrar_giro(cara, K, FO, O, Gi, r):
    """correctivas parpadeo × (las formas de párpado que haya), drivers, cejas sueltas pegadas y lente."""
    from . import parpados_giro as PG
    Gc = {l: o.cierre for l, o in O.items() if getattr(o, 'cierre', None) is not None}
    if Gc:
        from . import parpados_arap as PA
        r['correctivas'] = PA.correctivas(cara, K, FO, Gc, C.PARPADEO_CON)
    for l, g in Gi.items():
        o = O[l]
        if l in Gc:
            continue
        bs = getattr(o, 'bordes_vis', None) or _bordes_visibles(cara, K, o)
        Df = _leer_key(cara, K, f'eyeBlink_{l}')
        for x in C.PARPADEO_CON:
            if f'{x}_{l}' in cara.data.shape_keys.key_blocks:
                Dx = _leer_key(cara, K, f'{x}_{l}')
                # objetivo del giro (cerrar en la línea más alta) y encima el mismo contacto de curva común
                Xo = K.P.copy(); Xo[K.zona] = K.p + Dx + Df + g.correctiva_blink(Dx, Df)
                Xc, _ = OJ.contacto_pos(K, o, Xo, bs, alcance=g.P['contacto_alcance'])
                C.escribir(cara, K, FO, f'eyeBlink_{x}_{l}', Xc[K.zona] - K.p - Dx - Df)
    C.drivers_correctivas(cara)
    # 0.6.6: las cejas sueltas NO siguen a las keys de párpado: su piel más cercana era el reborde del párpado y
    # en Martín la ceja bajaba 22 mm con el parpadeo (la V). Solo siguen a cejas, mejillas, nariz y boca.
    PARP = ('eyeBlink', 'eyeSquint', 'eyeWide', 'eyeLookDown', 'eyeLookUp', 'lidAngry', 'lidSad')
    kb = cara.data.shape_keys.key_blocks
    otras = [n for n in cara.get('facs_keys', []) if n in kb and not n.startswith(PARP)]
    r['cejas_pegadas'] = PG.pegar_islas(cara, K, O, claves=otras) if otras else 0
    try:
        from .. import ojos as OJV
        r['lente'] = OJV.oclusion_seguir_keys(cara)
    except Exception as e:
        r['lente'] = f'no: {e}'


def parpados(cara, param=None, delinear=True, estilo='anime', densificar=True, cortes=None):
    """SOLO párpados que giran + delineado (0.6.6), sin boca, cejas, controles ni el resto del rig facial.
    Necesita los marcadores (pasos.detectar) y los ojos (<cara>_OjoPivote_<lado> con su globo); con ojos de Tripo,
    antes pasos.abrir_ojos y pasos.ojos_lian (la cuenca y la lente solo si el hueco queda abierto).
    Keys ARKit eyeBlink/eyeSquint/eyeWide/eyeLookDown/eyeLookUp/lidAngry/lidSad por lado + correctivas; luego
    el delineado pintado en la piel (sigue solo a las keys) y la medida (medir_parpados)."""
    _modo_objeto(cara)
    K, FO = contexto(cara)
    O = _ojos_de(cara, K)
    if not O:
        raise RuntimeError('Faltan los ojos (pivotes <cara>_OjoPivote_L/R)')
    r = {}
    if densificar and not cara.get('facs_densificado'):
        # antes de todo: el delineado guarda índices de esquinas (loops) que la subdivisión cambia
        from . import densificar as DN
        if cortes is None:
            cortes, r['densificar'] = DN.decidir(cara, K, O)
        if cortes:
            DU.quitar(cara)
            if CARAS_DELINEADO in cara:              # la subdivisión renumera las caras: la marca ya no vale
                del cara[CARAS_DELINEADO]
            r['densificar'] = {**(r.get('densificar') or {}), **DN.densificar(cara, K, O, cortes=cortes)}
            me = cara.data
            if G.ATTR in me.attributes:              # el original se vuelve a guardar con los vértices nuevos
                me.attributes.remove(me.attributes[G.ATTR])
            K, FO = contexto(cara)
            O = _ojos_de(cara, K)
    G.guardar_original(cara)
    Gi = _keys_giro(cara, K, FO, O, param, r)
    _cerrar_giro(cara, K, FO, O, Gi, r)
    if delinear:
        r['delineado'] = delineado(cara, estilo=estilo, tope=bool((param or {}).get('delineado_tope')))
    r['medida'] = medir_parpados(cara)
    return r


def medir_parpados(cara, claves=None, rejilla=24):
    """por key de párpado a 1 (y el parpadeo con cada combinación): vértices dentro del globo (> 0,2 mm), triángulos
    invertidos de la zona y, con los ojos cerrados, rayos de frente que llegan al globo sin tocar la piel."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    K, _ = contexto(cara)
    O = _ojos_de(cara, K)
    me = cara.data
    kb = me.shape_keys.key_blocks
    B = G.basis(cara)
    me.calc_loop_triangles()
    T = np.zeros(len(me.loop_triangles) * 3, int); me.loop_triangles.foreach_get('vertices', T); T = T.reshape(-1, 3)
    zona = np.zeros(len(B), bool); zona[K.zona] = True
    cerca = np.zeros(len(B), bool)
    for o in O.values():
        cerca |= np.linalg.norm(B - o.c, axis=1) < 2.0 * o.r
    Tz = T[(zona & cerca)[T].all(1)]

    def normales(P):
        n = np.cross(P[Tz[:, 1]] - P[Tz[:, 0]], P[Tz[:, 2]] - P[Tz[:, 0]])
        return n
    n0 = normales(B)

    def key(n):
        co = np.zeros(len(B) * 3); kb[n].data.foreach_get('co', co)
        return co.reshape(-1, 3) - B
    lados = list(O)
    claves = claves or [f'{x}_{l}' for l in lados for x in ('eyeBlink', 'eyeSquint', 'eyeWide', 'eyeLookDown', 'eyeLookUp', 'lidAngry', 'lidSad')]
    poses = {n: {n: 1.0} for n in claves if n in kb}
    for l in lados:
        for x in C.PARPADEO_CON:
            if f'{x}_{l}' in kb:
                poses[f'eyeBlink+{x}_{l}'] = {f'eyeBlink_{l}': 1.0, f'{x}_{l}': 1.0, f'eyeBlink_{x}_{l}': 1.0}
        for w in (0.25, 0.5, 0.75):       # la intermedia sigue la regla del driver: 4·w·(1−w)
            poses[f'eyeBlink_{w}_{l}'] = {f'eyeBlink_{l}': w, f'eyeBlink_mid_{l}': 4 * w * (1 - w)}
    # bordes visibles (los de la corrección de contacto) para medir la separación 3D como en Gómez
    from .. import ojos as OJV, marco as MK
    M = MK.Marco(cara)
    vis = {}
    for l in lados:
        try:
            vis[l] = OJV.abertura_visible(cara, M, l)
        except Exception:
            vis[l] = None

    def separacion(P, l, n=128, fin=0.001):
        if not vis.get(l) or len(vis[l][0]) < 6 or len(vis[l][1]) < 6:
            return None
        su, inf_ = (np.asarray(b, int) for b in vis[l])
        a = max(P[su, 0].min(), P[inf_, 0].min()) + fin; b = min(P[su, 0].max(), P[inf_, 0].max()) - fin
        xs = np.linspace(a, b, n)

        def curva(ii):
            o_ = np.argsort(P[ii, 0])
            return np.interp(xs, P[ii, 0][o_], P[ii, 1][o_]), np.interp(xs, P[ii, 0][o_], P[ii, 2][o_])
        yu, zu = curva(su); yl, zl = curva(inf_)
        d = np.hypot(yu - yl, zu - zl)
        return {'sep3d_max_mm': round(float(d.max()) * 1000, 2), 'sep3d_media_mm': round(float(d.mean()) * 1000, 2),
                'cruce_max_mm': round(float(max(0.0, (zl - zu).max())) * 1000, 2)}
    out = {}
    for nombre, vals in poses.items():
        P = B.copy()
        for k, w in vals.items():
            if k in kb:
                P += w * key(k)
        dentro = 0
        for o in O.values():
            d = np.linalg.norm(P - o.c, axis=1)
            dentro += int(((d < o.r - 0.0002) & zona & (np.linalg.norm(B - o.c, axis=1) >= o.r - 0.0002)).sum())
        inv = int(((normales(P) * n0).sum(1) < 0).sum())
        fila = {'dentro_globo': dentro, 'invertidos': inv}
        if nombre.startswith('eyeBlink') and '_0.' not in nombre:
            l = nombre[-1]
            o = O[l]
            bvh = BVHTree.FromPolygons(P.tolist(), [tuple(p.vertices) for p in me.polygons])
            vis_ = tot = 0
            for xl in np.linspace(-0.9 * o.r, 0.9 * o.r, rejilla):
                for zl in np.linspace(-0.7 * o.r, 0.7 * o.r, rejilla):
                    q = o.r * o.r - xl * xl - zl * zl
                    if q <= 0:
                        continue
                    globo = (o.c @ K.Y) - np.sqrt(q)
                    p0 = o.c + K.X * xl + K.Z * zl - K.Y * (3 * o.r)
                    h = bvh.ray_cast(Vector(p0), Vector(K.Y), 6 * o.r)
                    tot += 1
                    if h[0] is None or (np.array(h[0][:]) @ K.Y) > globo + 1e-5:
                        vis_ += 1
            fila['ojo_visible_%'] = round(100.0 * vis_ / max(tot, 1), 2)
            sp = separacion(P, l)
            if sp:
                fila.update(sp)
        out[nombre] = fila
    return out


def foto_parpadeo(cara, lados=('L', 'R'), niveles=(0.0, 0.25, 0.5, 0.75, 1.0), vistas=('frente', '34')):
    """0.7.2. Hojas del parpadeo al 0 / 25 / 50 / 75 / 100 % (shape keys eyeBlink + eyeBlink_mid con la regla del driver,
    sin el rig viejo). Para comprobar de cerca que el delineado sigue al párpado y que no hay pliegues, picos ni
    cruces. -> {'hojas': {lado: {vista: ruta}}}; deja las keys como estaban."""
    from .. import revision, marco as MK
    sk = cara.data.shape_keys
    kb = sk.key_blocks
    M = MK.Marco(cara)
    rig = bpy.data.objects[M.n['rig']]
    drv = [f for f in (sk.animation_data.drivers if sk.animation_data else [])
           if 'eyeBlink' in f.data_path and f.data_path.split('"')[1] in kb]
    previo = {f: f.mute for f in drv}
    valores = {k.name: k.value for k in kb if k.name.startswith('eyeBlink')}
    out = {}
    try:
        for f in drv:
            f.mute = True
        for l in lados:
            def pose(lado, w=None, l=l):
                for k in kb:
                    if k.name.startswith('eyeBlink'):
                        k.value = 0.0
                if w:
                    kb[f'eyeBlink_{l}'].value = w
                    if f'eyeBlink_mid_{l}' in kb:
                        kb[f'eyeBlink_mid_{l}'].value = 4 * w * (1 - w)
            poses = [(f'{int(round(w * 100))}%', (lambda lado, w=w: pose(lado, w))) for w in niveles]
            r = revision.render_ojos(cara, rig, M, l, poses=poses, vistas=list(vistas), color='TEXTURE')
            out[l] = r['hojas']
    finally:
        for f, m in previo.items():
            f.mute = m
        for k in kb:
            if k.name in valores:
                k.value = valores[k.name]
    return {'hojas': out, 'niveles': [int(round(w * 100)) for w in niveles]}


# ---------------------------------------------------------------- 4. delineado
CARAS_DELINEADO = 'rlb_delineado_caras'     # json [índices de cara] marcados a mano para el delineado (0.8.6)


def delineado_caras(cara):
    try:
        return [int(f) for f in json.loads(cara.get(CARAS_DELINEADO) or '[]')]
    except (TypeError, ValueError):
        return []


def delineado_marcar(cara, caras=None):
    """0.8.6, delineado MANUAL 1/2: las caras seleccionadas en modo edición (o `caras`) son las que recibirán el
    delineado. Con la selección por vértices valen las caras con todos sus vértices seleccionados."""
    import bmesh
    me = cara.data
    if caras is None:
        if cara.mode == 'EDIT':
            bm = bmesh.from_edit_mesh(me)
            caras = [f.index for f in bm.faces if f.select or all(v.select for v in f.verts)]
        else:
            sel = {v.index for v in me.vertices if v.select}
            caras = [p.index for p in me.polygons if p.select or all(v in sel for v in p.vertices)]
    caras = sorted({int(f) for f in caras})
    if len(caras) < 2:
        raise ValueError('Selecciona en modo edición las caras (o vértices) donde va el delineado, junto al borde del párpado superior')
    cara[CARAS_DELINEADO] = json.dumps(caras)
    return {'caras_marcadas': len(caras)}


def delineado_ver(cara):
    """selecciona en modo edición las caras marcadas para el delineado."""
    import bmesh
    caras = set(delineado_caras(cara))
    if not caras:
        raise ValueError('Aún no hay caras marcadas para el delineado')
    if cara.mode != 'EDIT':
        bpy.context.view_layer.objects.active = cara
        bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(cara.data)
    bm.faces.ensure_lookup_table()
    for v in bm.verts: v.select = False
    for f in bm.faces: f.select = f.index in caras
    for f in bm.faces:
        if f.select:
            for v in f.verts: v.select = True
    bm.select_flush_mode()
    bmesh.update_edit_mesh(cara.data)
    return {'caras_marcadas': len(caras)}


def delineado_generar(cara, estilo='anime', tope=True):
    """0.8.6, delineado MANUAL 2/2 (botón «Generar»): pinta el delineado en las caras marcadas. Se puede repetir."""
    if cara.mode == 'EDIT':          # la selección actual manda: no hace falta pulsar «Marcar» antes
        try:
            delineado_marcar(cara)
        except ValueError:
            pass                     # sin selección útil: vale la marca anterior, si la hay
    if not delineado_caras(cara):
        raise ValueError('Primero marca las caras del delineado (modo edición → «Marcar caras = selección»)')
    return delineado(cara, estilo=estilo, tope=tope, manual=True)


def delineado_quitar(cara):
    """devuelve la piel del párpado como estaba (la marca de caras se conserva)."""
    _modo_objeto(cara)
    return DU.quitar(cara)


def delineado(cara, modo='uv', estilo='anime', tope=True, manual=False, **kw):
    """0.8.6: el delineado ya no se genera solo. Los pasos automáticos (construir_todo, parpados, la línea) lo saltan
    (el paso queda hecho); solo se pinta con delineado_generar (manual=True), sobre las caras que marcó el usuario.
    Oculta la tira de pestañas (si las hay, región UV 2) y pinta el delineado del párpado superior.
    modo 'uv' (0.6.4, por defecto): franja de la propia piel con UV y textura propias (sigue sola al párpado,
    GLB normal); estilo 'anime' | 'marcado' | 'fino' (delineado_uv.ESTILOS) o kw grosor/color/solape.
    modo 'cinta': la cinta negra de antes (otra malla rehecha en cada key).
    tope (0.6.9): la altura de la UV del delineado pasa a ser como mínimo la distancia por la piel al borde (si no, con
    el ojo cerrado la cara de abajo del reborde gira hacia delante y se pinta una mancha negra en el centro)."""
    if not manual:
        return {'delineado': 'manual: se omite; marca las caras y pulsa «Generar delineado»'}
    _modo_objeto(cara)
    K, FO = contexto(cara)
    me = cara.data
    kw['caras_sel'] = delineado_caras(cara)
    if 'RLB_region_id' in me.attributes and 'RLB_ocultar_ojos_uv' in me.attributes:
        D.ocultar_tira(cara, True)
    # pestañas de Tripo (islas) que sigan ahí: fuera siempre antes de pintar (solo caras: índices intactos)
    pest = None
    try:
        from .. import pestanas_tripo as PT
        pest = PT.quitar(cara)
    except Exception as e:
        pest = f'no: {e}'
    if pest and not isinstance(pest, str):
        K, FO = contexto(cara)
    O = {l: OJ.Ojo(K, l) for l in ('L', 'R') if l in K.ojos or bpy.data.objects.get(f'{cara.name}_OjoPivote_{l}')}
    if modo == 'uv':
        r = {'pestanas_tripo': pest if isinstance(pest, str) else {k: v for k, v in pest.items() if k != 'descartes'},
             'delineado_uv': DU.crear(cara, K, O, estilo=estilo, **kw)}
        if tope:
            from . import parpados_arap as PA
            try:
                r['delineado_tope'] = PA.tope_desde_malla(cara, K, O)
            except Exception as e:
                r['delineado_tope'] = f'no: {e}'
        return r
    DU.quitar(cara)
    ob, nk = D.crear_delineado(cara, K, O)
    return {'delineado': ob.name, 'keys': nk}


# ---------------------------------------------------------------- 5. controles
def controles(cara):
    """objeto <cara>_Cara_Control: huesos en la cara + canales v_<forma> + drivers de todas las keys FACS."""
    _modo_objeto(cara)
    K, FO = contexto(cara)
    O = {l: OJ.Ojo(K, l) for l in ('L', 'R') if l in K.ojos or bpy.data.objects.get(f'{cara.name}_OjoPivote_{l}')}
    canales = [n for n in cara.get('facs_keys', []) if n not in C.CORRECTIVAS]
    ob, hechos = CT.crear(cara, K, O, canales)
    return {'control': ob.name, 'drivers': hechos, 'canales': len(canales)}


def terminar(cara):
    """drivers de las piezas (copian la cara), correctivas, refresco, rig viejo apagado y la bolsa del fondo
    dentro de la piel en cada key y en las combinaciones (necesita los drivers: va al final)."""
    n = C.drivers_espejo(cara)
    C.drivers_correctivas(cara)
    CT.refrescar_drivers(cara)
    r = {'espejo': n, 'rig_viejo_apagado': apagar_rig_viejo(cara)}
    try:                                         # la lente con las keys definitivas (seguía al rig viejo)
        from .. import ojos as OJV
        r['lente'] = OJV.oclusion_seguir_keys(cara)
    except Exception as e:
        r['lente'] = f'no: {e}'
    # drivers recién creados quedan marcados como inválidos hasta reevaluarlos (Martín: 51 de 69 sin moverse)
    sk = cara.data.shape_keys
    if sk and sk.animation_data:
        for f in sk.animation_data.drivers:
            f.driver.expression = f.driver.expression; f.driver.is_valid = True
    bpy.context.evaluated_depsgraph_get().update()
    if C.Piezas(cara).fondo is not None:
        K, _ = contexto(cara)
        ext = I.piel_exterior(cara, K)
        r['bolsa'] = I.contener_bolsa(cara, K, margen=0.25, exterior=ext)['movidos'].get('Basis', 0)
        c = I.contener_combinaciones(cara, K, exterior=ext)
        r['bolsa_combinaciones'] = {'vueltas': c['vueltas'], 'quedan': c['quedan']}
        r['forro_vaciado'] = I.vaciar_forro(cara, K, exterior=ext)     # después de contener la bolsa: sin el forro, piel_exterior la dejaba salir bajo la mandíbula
    from . import integracion
    r['editor'] = integracion.preparar(cara)
    return r


def construir_todo(cara):
    r = {}
    for nombre, fn in (('preparar', preparar), ('boca', boca), ('ojos', ojos), ('delineado', delineado),
                       ('controles', controles), ('terminar', terminar)):
        r[nombre] = fn(cara)
    return r


# ---------------------------------------------------------------- uso
def expresion(cara, nombre, peso=1.0, limpiar=True, frame=None):
    """pone una expresión de la biblioteca (expresiones_facs.json) en los canales del control."""
    lib = BI.cargar()
    if nombre not in lib['expresiones']:
        raise KeyError(f'No existe la expresión {nombre}')
    return BI.aplicar(cara, lib['expresiones'][nombre], peso, limpiar, frame)


def lista_expresiones():
    return sorted(BI.cargar()['expresiones'].keys())


def hablar(cara, bloques, accion=None, intensidad=1.1, contrato=True, actuacion=None):
    """lip sync en español sobre el control (keyframes v_*), con capa de actuación (sonrisa de fondo, cejas en
    las sílabas tónicas, miradas, parpadeos) y el contrato JSON para three.js junto al primer audio.
    bloques: [{'nombre', 'texto', 'audio' (wav, opcional), 'tiempos' (opcional)}]."""
    ctrl = BI.control(cara)
    lib = BI.cargar(); disp = set(cara.get('facs_keys', []))
    if not cara.get('rlb_visemas_auto'):          # 0.8.11: la primera vez, los visemas se ajustan solos a las medidas de esta cara
        try:
            from . import ajuste_visemas as AJV
            AJV.ajustar(cara)
        except Exception as e:
            print('ajuste automático de visemas:', e)
    vis = {k: BI.expandir(v, disp) for k, v in BI.visemas_de(cara, lib).items()}
    intensidad = intensidad * float(cara.get('rlb_habla_fuerza', 1.0))      # 0.8.11: «Fuerza al hablar» del editor de habla
    cara['rlb_habla_bloques'] = json.dumps(bloques, default=str)             # para rehacer el habla tras editar la boca
    rig = bpy.data.objects.get(f'{cara.name}_Rig_Labios')

    def mirada_fn(mir, fps, frame0):
        if rig is None or 'mirada' not in rig.pose.bones:
            return
        if rig.animation_data is None:
            rig.animation_data_create()
        nombre = f'{cara.name}_Mirada_Habla'
        a = bpy.data.actions.get(nombre)
        if a:
            bpy.data.actions.remove(a)
        a = bpy.data.actions.new(nombre); a.use_fake_user = True; rig.animation_data.action = a
        pb = rig.pose.bones['mirada']
        for t, h, v in mir:
            BI.mirada(cara, h, v)
            pb.keyframe_insert('location', frame=t * fps + frame0)
        BI.mirada(cara, 0, 0)
    fps = bpy.context.scene.render.fps
    avisos = []
    seq, T, can, coloc = H.montar(ctrl, bloques, vis, fps=fps, accion=accion or f'{cara.name}_Habla', intensidad=intensidad,
                                  mirada_fn=mirada_fn, actuacion=actuacion, avisos=avisos)
    CT.refrescar_drivers(cara)
    out = {'frames': (bpy.context.scene.frame_start, bpy.context.scene.frame_end), 'bloques': [n for n, t, a in coloc],
           'avisos': avisos}   # 0.7.2 (Lamine): p. ej. texto que no encaja con el audio
    if contrato:
        import os
        audio = next((b.get('audio') for b in bloques if b.get('audio')), None)
        destino = os.path.splitext(audio)[0] + '_facs.json' if audio else bpy.path.abspath(f'//{cara.name}_habla_facs.json')
        json.dump(H.contrato(cara.name, os.path.basename(audio) if audio else None, seq, T, can, fps),
                  open(destino, 'w', encoding='utf-8'))
        out['contrato'] = destino
    return out
