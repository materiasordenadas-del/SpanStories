# Ejecutor automático (0.8.2): los 19 pasos + la revisión en UNA llamada. Antes cada paso era una llamada por MCP (~20 llamadas,
# cada una con todo el contexto detrás y alguna con «Request timed out» porque F_terminar o F_expresiones tardan más que el
# tiempo límite). Aquí la llamada solo registra un temporizador de Blender y vuelve al instante; el temporizador hace un paso por
# tick (entre tick y tick Blender atiende a la interfaz y a MCP) y deja el resultado en `estado()`. Se para solo cuando hace
# falta una decisión humana (avisos), cuando falla algo o al terminar.
#   from rig_labial_bendy.nucleo import pasos
#   pasos.auto_iniciar(cara)            # vuelve ya; trabaja en segundo plano
#   pasos.auto_estado(cara)             # una consulta barata cuando haya pasado un rato
#   pasos.auto_detener()                # cancela
# Cada cambio de estado se escribe también en <carpeta del .blend>/RLB_revision/<cara>/auto_estado.json: un agente puede esperar
# SIN gastar nada con un bucle de shell en segundo plano (until grep -q '"estado": "\(terminado\|parado\|error\)"' archivo; do sleep 3; done)
# y leer el resultado una sola vez al terminar, en lugar de consultar por MCP varias veces.
import json
import os
import time
import traceback
import bpy
from . import util

_E = {}


def _nuevo(cara, **kw):
    return {'cara': cara.name, 'estado': 'corriendo', 'paso': None, 'n': 0, 'de': 19, 'hechos': [], 'avisos': [], 'error': None,
            'hoja': None, 'numeros': None, 't0': time.time(), 't': 0.0, 'cancelar': False, **kw}


def _escribir(cara_nombre, st):
    try:
        ob = bpy.data.objects.get(cara_nombre)
        carpeta = util.carpeta_revision(ob) if ob is not None else None
        if carpeta:
            os.makedirs(carpeta, exist_ok=True)
            ruta = os.path.join(carpeta, 'auto_estado.json')
            datos = {k: v for k, v in st.items() if k not in ('cancelar',)}
            with open(ruta, 'w', encoding='utf-8') as f:
                json.dump(datos, f, ensure_ascii=False)
            st['archivo'] = ruta
    except Exception:
        pass


def iniciar(cara, permisos='todos', punto_boca=None, color_ojos='castano', hasta=None):
    """arranca el ejecutor para `cara`. permisos: 'todos' (por defecto: el usuario ya pidió el rig completo), None o dict (ver
    pasos.siguiente). hasta: id de un paso donde parar (p. ej. 'detectar' para revisar los marcadores a mano).
    -> {'estado': 'corriendo', ...}. No espera: consulta estado()."""
    from . import pasos
    st = _nuevo(cara, hasta=hasta)
    if _E.get(cara.name, {}).get('estado') == 'corriendo':
        return estado(cara) | {'aviso': 'Ya hay un ejecutor corriendo para esta cara.'}
    _E[cara.name] = st
    nombre = cara.name

    def tick():
        r = _tick(nombre)
        s = _E.get(nombre)
        if s is not None and (r is None or s['n'] != s.get('_n_escrito')):
            s['_n_escrito'] = s['n']
            _escribir(nombre, s)
        return r

    def _tick(nombre):
        s = _E.get(nombre)
        if s is None or s is not st:
            return None
        if s['cancelar']:
            s['estado'] = 'cancelado'
            return None
        ob = bpy.data.objects.get(nombre)
        if ob is None:
            s['estado'] = 'error'; s['error'] = 'La cara ya no existe.'
            return None
        try:
            t = time.time()
            r = pasos.siguiente(ob, punto_boca if s['paso'] in (None, 'analizar') else None, color_ojos, permisos)
            s['t'] = round(time.time() - s['t0'], 1)
            hecho = r.get('hecho')
            if hecho:
                s.setdefault('tiempos', {})[hecho] = round(time.time() - t, 1)     # segundos de cada paso
                s['hechos'].append(hecho)
                s['paso'] = hecho
            if r.get('n') is not None:
                s['n'] = r['n']; s['de'] = r.get('de', s['de'])
            s['avisos'] = list(r.get('avisos') or [])
            res = r.get('resumen')
            if hecho == 'revision' and isinstance(res, dict):
                s['hoja'] = res.get('hoja'); s['numeros'] = res.get('numeros')
                s['estado'] = 'terminado'
                from . import posicion
                posicion.devolver(ob)           # a su sitio de la escena (no hace nada si nunca se movió)
                return None
            if hecho is None and r.get('siguiente') is None and not r.get('parar'):
                s['estado'] = 'terminado'      # ya estaba terminado y revisado
                return None
            if r.get('parar'):
                s['estado'] = 'parado'
                s['siguiente'] = r.get('siguiente')
                return None
            if hasta and hecho == hasta:
                s['estado'] = 'parado'; s['siguiente'] = r.get('siguiente')
                s['avisos'].append(f'Parado en «{hasta}» como se pidió; vuelve a iniciar() para seguir.')
                return None
        except Exception as e:                  # el paso fallido no queda marcado: se puede arreglar y volver a iniciar()
            s['estado'] = 'error'
            s['error'] = f'{type(e).__name__}: {e}'[:400]
            s['traza'] = traceback.format_exc()[-800:]
            return None
        return 0.02

    _escribir(nombre, st)
    bpy.app.timers.register(tick, first_interval=0.05)
    return estado(cara)


def estado(cara=None):
    """lo que lleva hecho el ejecutor. Barato: solo lee un diccionario."""
    if cara is None:
        if not _E:
            return {'estado': 'sin ejecutor'}
        st = list(_E.values())[-1]
    else:
        st = _E.get(cara.name)
        if st is None:
            return {'estado': 'sin ejecutor', 'cara': cara.name}
    if st['estado'] == 'corriendo':
        st['t'] = round(time.time() - st['t0'], 1)
    out = {k: st[k] for k in ('cara', 'estado', 'paso', 'n', 'de', 't', 'archivo') if k in st}
    if st['estado'] != 'corriendo':
        out['avisos'] = st['avisos']
        if st.get('siguiente'):
            out['siguiente'] = st['siguiente']
        if st['error']:
            out['error'] = st['error']
        if st.get('hoja'):
            out['hoja'] = st['hoja']
        if st.get('numeros'):
            out['numeros'] = st['numeros']
        if st.get('tiempos'):
            out['tiempos'] = st['tiempos']
    return out


def detener():
    for st in _E.values():
        if st['estado'] == 'corriendo':
            st['cancelar'] = True
    return {'estado': 'cancelando'}
