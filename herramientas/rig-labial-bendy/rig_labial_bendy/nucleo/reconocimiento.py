# Reconocimiento facial por capas (0.8.50). Solo lee: no toca malla ni marcadores salvo corregir(), que mueve el punto pedido.
#  1. Regiones: islas UV + topología (globo, ceja, restos de pestaña, dientes, cavidad). La geometría manda: en «Ojos y textura» el lazo
#     abierto de 51 aristas parecía el ojo y era la ceja.
#  2. Confianza por punto (fiable / dudoso / mal), con el motivo, para corregir solo lo dudoso y no toda la cara.
#  3. MediaPipe OPCIONAL y fuera de Blender (mp_externo.py): contrasta, nunca decide. Sin él, todo funciona igual.
import json
import os
import subprocess
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from . import marco as MK, ojos_tripo as OT, preparar_parpados as PP, util

FIABLE, DUDOSO = 0.8, 0.5
MAX_RESTO = 40              # caras de una isla UV que puede ser resto de pestaña
PYTHON_MP = r'D:\rlb_mediapipe\Scripts\python.exe'      # sustituible con la variable de entorno RLB_MEDIAPIPE_PYTHON; ruta sin acentos: MediaPipe falla con ellos
PUNTOS = ('comisura.L', 'comisura.R', 'labio_sup', 'labio_inf', 'ojo.L', 'ojo.R', 'mandibula', 'menton')
TOL_MP = 0.35               # en hw: más diferencia con MediaPipe baja la confianza


def _islas_uv(bm, capa):
    vistas, out = set(), []
    for f in bm.faces:
        if f not in vistas:
            isla = PP._isla_uv(f, capa); vistas |= isla; out.append(isla)
    return out


def regiones(me, M):
    """-> {región: {'caras', 'centro_mm'}}: qué es cada pieza de la cara. No necesita materiales ni imágenes."""
    bm = bmesh.new(); bm.from_mesh(me)
    try:
        capa = bm.loops.layers.uv.active
        out = {}
        mc = np.array(M.mc[:]); hw = M.hw
        def anota(nombre, caras):
            c = sum((f.calc_center_median() for f in caras), Vector()) / len(caras)
            out[nombre] = {'caras': len(caras), 'centro_mm': [round(x * 1000, 1) for x in c]}
        globos = set()
        for s in ('L', 'R'):
            if s not in M.ojos:
                continue
            c, R = M.ojo(s); c = Vector(c)
            cand = OT._islas_cerca(bm, c, R)
            if cand:
                isla = max(cand, key=lambda t: len(t[0]))[0]
                caras = {f for v in isla for f in v.link_faces}
                globos |= caras; anota('globo.' + s, caras)
        if capa is None:
            return out
        islas = sorted(_islas_uv(bm, capa), key=len, reverse=True)
        piel = islas[0]
        for isla in islas[1:]:
            if isla & globos:
                continue
            Q = np.array([f.calc_center_median()[:] for f in isla])
            cen, ext = Q.mean(0), np.ptp(Q, axis=0)
            for s in ('L', 'R'):
                if s not in M.ojos:
                    continue
                c, R = M.ojo(s); c = np.array(c)
                d = np.linalg.norm(cen - c)
                if d < 2.5 * R and ext[0] > 1.5 * R and cen[2] > c[2] and ('ceja.' + s not in out or len(isla) > out['ceja.' + s]['caras']):
                    anota('ceja.' + s, isla)
                elif d < 1.5 * R and len(isla) <= MAX_RESTO and any(len(e.link_faces) > 2 for f in isla for e in f.edges):
                    anota('resto_pestana.' + s, isla)
            n = np.array([f.normal[:] for f in isla])
            if np.linalg.norm(cen - mc) < 2.5 * hw and len(isla) >= 40 and (n[:, 1] < -0.5).mean() < 0.2 and cen[1] > mc[1] - 0.8 * hw:
                if 'cavidad' not in out or len(isla) > out['cavidad']['caras']:
                    anota('cavidad', isla)
        return out
    finally:
        bm.free()


def _foto(cara, ruta, lado, centro, escala):
    """render frontal ortográfico con la textura, sin dejar nada cambiado."""
    from . import posicion as PO
    sc = bpy.context.scene; r = sc.render; sh = sc.display.shading
    guarda = (r.engine, r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, sc.camera, r.image_settings.file_format, sh.color_type, sh.light)
    cam = bpy.data.objects.new('__rlb_mp', bpy.data.cameras.new('__rlb_mp')); sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = escala
    cam.location = (centro[0], centro[1] - 1.0, centro[2]); cam.rotation_euler = (1.5707963, 0, 0)
    try:
        with PO.aislado(cara):
            sc.camera = cam
            r.engine = 'BLENDER_WORKBENCH'; r.resolution_x = r.resolution_y = lado; r.resolution_percentage = 100
            r.image_settings.file_format = 'PNG'; sh.color_type = 'TEXTURE'; sh.light = 'STUDIO'; r.filepath = ruta
            bpy.ops.render.render(write_still=True)
    finally:
        r.engine, r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, sc.camera, r.image_settings.file_format, sh.color_type, sh.light = guarda
        d = cam.data; bpy.data.objects.remove(cam); bpy.data.cameras.remove(d)


def contraste_mediapipe(cara, M):
    """{'usado': bool, 'dif_hw': {punto: diferencia en X/Z con la geometría, en hw}}. Sin Python con MediaPipe dice por qué y sigue."""
    py = os.environ.get('RLB_MEDIAPIPE_PYTHON', PYTHON_MP)
    if not os.path.isfile(py):
        return {'usado': False, 'motivo': f'sin Python con MediaPipe en {py}'}
    hw = M.hw
    centro = (M.ojo('L')[0] + M.ojo('R')[0]) / 2 * 0.5 + M.mc * 0.5 if M.ojos else M.mc
    centro = np.array(centro[:]); escala = 14 * hw; lado = 800
    d = tempfile.mkdtemp(prefix='rlb_mp')
    png, ent, sal = (os.path.join(d, n) for n in ('frente.png', 'in.json', 'out.json'))
    _foto(cara, png, lado, centro, escala)
    json.dump({'imagenes': {'frente': png}}, open(ent, 'w', encoding='utf8'))
    guion = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mp_externo.py')
    try:
        subprocess.run([py, guion, ent, sal], timeout=120, capture_output=True, check=True)
        res = json.load(open(sal, encoding='utf8'))['frente']
    except (subprocess.SubprocessError, OSError, ValueError) as e:
        return {'usado': False, 'motivo': str(e)[:200]}
    if 'error' in res:
        return {'usado': False, 'motivo': res['error']}
    pts = res['puntos']
    xz = lambda k: np.array([(pts[k][0] - lado / 2) / lado * escala + centro[0], centro[2] - (pts[k][1] - lado / 2) / lado * escala])
    medio = lambda a, b: (xz(a) + xz(b)) / 2
    prueba = {'comisura.L': xz('comisura.L'), 'comisura.R': xz('comisura.R'), 'menton': xz('menton')}
    if M.ojos:
        prueba['ojo.L'] = medio('lagrimal.L', 'rabillo.L'); prueba['ojo.R'] = medio('lagrimal.R', 'rabillo.R')
    dif = {}
    for k, p in prueba.items():
        o = bpy.data.objects.get(MK.nombre_marca(cara, k))
        if o is not None:
            q = o.matrix_world.translation
            dif[k] = round(float(np.linalg.norm(p - np.array((q.x, q.z)))) / hw, 2)
    return {'usado': True, 'dif_hw': dif}


def _puntuar(cara, M, reg, mp):
    hw = M.hw
    P = {k: [1.0, []] for k in PUNTOS}
    def baja(k, cuanto, motivo):
        P[k][0] -= cuanto; P[k][1].append(motivo)
    cl, cr = M.comisura, Vector((-M.comisura.x, M.comisura.y, M.comisura.z))
    W = lambda k: bpy.data.objects[MK.nombre_marca(cara, k)].matrix_world.translation
    if abs(W('comisura.L').x + W('comisura.R').x) > 0.1 * hw:
        for k in ('comisura.L', 'comisura.R'):
            baja(k, 0.4, 'las comisuras no son simétricas')
    contacto = (M.labio_sup.z + M.labio_inf.z) / 2
    for k, z in (('labio_sup', M.labio_sup.z), ('labio_inf', M.labio_inf.z)):
        if abs(z - contacto) < 0.3 * hw:
            baja(k, 0.35, 'muy cerca del contacto de los labios: debe ir en el centro del labio')
    pv = util.coords(cara.data)
    for k in PUNTOS[:4]:
        q = np.array(W(k)[:])
        d = float(np.linalg.norm(pv - q, axis=1).min())
        if d > 0.5 * hw:
            baja(k, 0.5, f'a {d / hw:.1f} hw de la malla')
    for s in ('L', 'R'):
        k = 'ojo.' + s
        if s not in M.ojos:
            baja(k, 1.0, 'sin marcador'); continue
        if 'globo.' + s not in reg and not MK.cfg(cara).get('ojos_abiertos'):
            baja(k, 0.3, 'sin globo suelto: el ojo se mide por el hueco de la piel')
    if 'L' in M.ojos and 'R' in M.ojos and abs(W('ojo.L').x + W('ojo.R').x) > 0.15 * hw:
        for s in 'LR':
            baja('ojo.' + s, 0.3, 'los ojos no son simétricos')
    for k, dif in (mp.get('dif_hw') or {}).items():
        if dif > TOL_MP:
            baja(k, 0.25, f'MediaPipe lo ve a {dif} hw')
    return P


def reconocer(cara, mediapipe=False):
    """informe completo. Los puntos dudosos muestran su nombre en la vista: se corrigen con corregir(), sin rehacer los demás."""
    M = MK.Marco(cara)
    reg = regiones(cara.data, M)
    mp = contraste_mediapipe(cara, M) if mediapipe else {'usado': False, 'motivo': 'no pedido'}
    P = _puntuar(cara, M, reg, mp)
    puntos, dudosos = {}, []
    for k, (c, motivos) in P.items():
        c = round(max(c, 0.0), 2)
        estado = 'fiable' if c >= FIABLE else 'dudoso' if c >= DUDOSO else 'mal'
        puntos[k] = {'confianza': c, 'estado': estado, 'motivos': motivos}
        o = bpy.data.objects.get(MK.nombre_marca(cara, k))
        if o is not None:
            o.show_name = estado != 'fiable'
        if estado != 'fiable':
            dudosos.append(k)
    r = {'puntos': puntos, 'dudosos': dudosos, 'regiones': reg, 'mediapipe': mp}
    cara['rlb_reconocimiento'] = json.dumps(r)
    return r


def corregir(cara, punto, pos):
    """mueve solo ese marcador y vuelve a puntuar."""
    if punto not in PUNTOS:
        raise ValueError(f'Punto desconocido: {punto}')
    bpy.data.objects[MK.nombre_marca(cara, punto)].location = pos
    bpy.context.view_layer.update()
    return reconocer(cara)
