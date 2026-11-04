"""Linea de pasos: un paso por llamada, para Claude (por MCP) o para el boton «Siguiente paso».

    pasos.siguiente(malla) -> {'hecho','n','de','siguiente','parar','avisos','resumen'}
    pasos.estado(malla)    -> {'hechos': [...], 'siguiente': ...}
    pasos.rehacer(malla, desde)  borra la marca de `desde` y de los posteriores

Mismo contrato que Rig Labial Bendy. El estado vive en malla['ecorp_hechos']. Los pasos 2
(medir) y 9 (revisar) PARAN: el usuario (o Claude mirando las fotos) revisa antes de seguir.
Si el personaje ya tiene rig corporal, se saltan medir/rig/pesos; si no tiene cara, cara y
vinculo. Nada de esto guarda el .blend.
"""
import json
import os

import bpy

PASOS = ['detectar', 'medir', 'rig', 'pesos', 'cara', 'perfil', 'expresiones', 'vinculo', 'revisar', 'exportar']
PARAN = {'medir', 'revisar'}
TITULOS = {'detectar': 'Detectar personaje', 'medir': 'Colocar esqueleto (revisar)', 'rig': 'Crear rig',
           'pesos': 'Pesos', 'cara': 'Enganchar cara', 'perfil': 'Perfil y pose neutra',
           'expresiones': 'Generar expresiones', 'vinculo': 'Vincular con la cara',
           'revisar': 'Hoja de revision', 'exportar': 'Exportar GLB'}


def _hechos(malla):
    return list(json.loads(malla.get('ecorp_hechos', '[]')))


def _marcar(malla, paso, info=None):
    h = _hechos(malla)
    if paso not in h:
        h.append(paso)
    malla['ecorp_hechos'] = json.dumps(h)
    if info is not None:
        datos = json.loads(malla.get('ecorp_info', '{}'))
        datos[paso] = info
        malla['ecorp_info'] = json.dumps(datos, default=str)[:20000]


def _info(malla):
    return json.loads(malla.get('ecorp_info', '{}'))


def personaje(malla):
    return malla.get('ecorp_personaje') or malla.name.split('.')[0]


def rig_cuerpo(malla):
    """Rig corporal: el del modificador 'Rig cuerpo' o el <personaje>_Rig."""
    m = malla.modifiers.get('Rig cuerpo')
    if m and m.object:
        return m.object
    return bpy.data.objects.get(f'{personaje(malla)}_Rig')


def rigs_cara(malla):
    rc = rig_cuerpo(malla)
    return [m.object for m in malla.modifiers if m.type == 'ARMATURE' and m.object and m.object != rc]


def estado(malla):
    h = _hechos(malla)
    sig = next((p for p in PASOS if p not in h), None)
    return {'hechos': h, 'siguiente': sig, 'personaje': personaje(malla),
            'pasos': [{'n': i + 1, 'id': p, 'titulo': TITULOS[p], 'hecho': p in h} for i, p in enumerate(PASOS)]}


def rehacer(malla, desde):
    i = PASOS.index(desde)
    malla['ecorp_hechos'] = json.dumps([p for p in _hechos(malla) if PASOS.index(p) < i])
    return estado(malla)


def _carpeta():
    return bpy.path.abspath('//ECB_revision') if bpy.data.filepath else bpy.app.tempdir


def siguiente(malla, exportar=False, ruta_glb=None):
    from . import util as U
    from .rig_cuerpo import ajuste, cara, medir, pesos
    h = _hechos(malla)
    paso = next((p for p in PASOS if p not in h), None)
    if paso is None:
        return {'hecho': None, 'n': len(PASOS), 'de': len(PASOS), 'siguiente': None, 'parar': True,
                'avisos': [], 'resumen': 'Todo hecho'}
    p = personaje(malla)
    avisos, resumen, parar = [], '', paso in PARAN
    rig = rig_cuerpo(malla)
    tenia_rig = bool(_info(malla).get('detectar', {}).get('rig_previo'))

    if paso == 'detectar':
        info = {'personaje': p, 'rig_previo': rig.name if rig else None,
                'rigs_cara': [r.name for r in rigs_cara(malla)], 'vertices': len(malla.data.vertices),
                'shape_keys': len(malla.data.shape_keys.key_blocks) if malla.data.shape_keys else 0}
        malla['ecorp_personaje'] = p
        _marcar(malla, paso, info)
        resumen = json.dumps(info)
    elif paso in ('medir', 'rig', 'pesos') and tenia_rig:
        _marcar(malla, paso, {'saltado': 'ya tenia rig corporal'})
        resumen, parar = 'saltado: ya hay rig corporal', False
    elif paso == 'medir':
        from .rig_cuerpo import mixamo
        r = medir.medir([malla])
        puntos, avisos = r['puntos'], r['avisos']
        arms = mixamo.buscar()
        if arms:
            mx = mixamo.puntos(arms[0], [malla])['puntos']
            lejos = [k for k, d in mixamo.comparar(puntos, mx).items() if d > 5]
            if lejos:
                avisos.append('Mixamo y la deteccion difieren >5 cm en: ' + ', '.join(sorted(lejos)))
            puntos = mixamo.mezclar(puntos, mx, 0.5)
        ajuste.poner_marcadores(p, puntos)
        ajuste.vista_previa(p)
        fotos = medir.foto_marcadores(p, [malla], _carpeta())
        sc = bpy.context.scene
        if hasattr(sc, 'ecorp_rig'):
            sc.ecorp_rig.malla, sc.ecorp_rig.personaje = malla, p
        _marcar(malla, paso, {'fotos': fotos, 'mixamo': bool(arms)})
        resumen = 'Marcadores puestos. Revisa las fotos y ajusta en el panel «1. Esqueleto». ' + json.dumps(fotos)
    elif paso == 'rig':
        rig = ajuste.confirmar(p)
        _marcar(malla, paso, {'rig': rig.name, 'huesos': len(rig.data.bones)})
        resumen = f'{rig.name}: {len(rig.data.bones)} huesos'
    elif paso == 'pesos':
        r = pesos.calcular(malla, rig, marcadores=medir.leer_marcadores(p))
        if r['sin_peso']:
            avisos.append(f"{r['sin_peso']} vertices sin peso")
        _marcar(malla, paso, r)
        resumen = json.dumps(r)
    elif paso == 'cara':
        if not rigs_cara(malla):
            _marcar(malla, paso, {'saltado': 'sin rig facial'})
            resumen = 'sin rig facial'
        else:
            hechos = cara.enlazar(malla, rig) if not any('padre_anterior' in o for o in cara.candidatos(malla, rig)) else []
            _marcar(malla, paso, {'enganchados': hechos})
            resumen = 'enganchados: ' + ', '.join(hechos)
    elif paso == 'perfil':
        from . import perfil as PF
        pr = PF.asegurar(rig)
        _marcar(malla, paso, PF.resumen(pr))
        resumen = json.dumps(PF.resumen(pr), default=str)[:600]
    elif paso == 'expresiones':
        from . import generador as GE
        est = U.props(rig).estilo
        r = GE.generar_todas(rig, est)
        _marcar(malla, paso, {'estilo': est, 'n': len(r) if hasattr(r, '__len__') else r})
        resumen = f'expresiones generadas (estilo {est})'
    elif paso == 'vinculo':
        if not rigs_cara(malla):
            _marcar(malla, paso, {'saltado': 'sin rig facial'})
            resumen = 'sin rig facial'
        else:
            from . import vinculo as VI
            r = VI.activar(rig)
            _marcar(malla, paso, r if isinstance(r, dict) else {'ok': True})
            resumen = 'vinculo cara -> cuerpo activo'
    elif paso == 'revisar':
        from . import revision as RV
        ruta = RV.hoja(rig, ruta=os.path.join(_carpeta(), f'hoja_{p}.png'))
        _marcar(malla, paso, {'hoja': ruta})
        resumen = 'Mira la hoja: ' + str(ruta)
    elif paso == 'exportar':
        if not exportar:
            _marcar(malla, paso, {'saltado': 'no pedido'})
            resumen, parar = 'exportar GLB: no pedido (pasos.siguiente(malla, exportar=True) para hacerlo)', True
        else:
            from . import exportar as EX
            r = EX.glb(rig, ruta_glb or os.path.join(_carpeta(), f'{p}.glb'))
            _marcar(malla, paso, r)
            resumen = json.dumps(r, default=str)[:600]
    n = PASOS.index(paso) + 1
    sig = next((q for q in PASOS if q not in _hechos(malla)), None)
    return {'hecho': paso, 'n': n, 'de': len(PASOS), 'siguiente': sig, 'parar': parar,
            'avisos': avisos, 'resumen': resumen}
