# Prueba de humo de Expresiones Corporales desde la fuente, sin tocar ningún .blend del usuario:
#   "D:\Blender 5.2\blender.exe" --background --factory-startup --python prueba_humo.py
# Crea un rig Rigify (metarig humano generado) con una malla sencilla de cilindros pesada a mano y un rig tipo
# Mixamo hecho a mano que mira a +Y, y comprueba registro, perfiles, neutra, generación de toda la biblioteca (y de
# las 80 entradas de investigación si están), poses medidas en el marco del cuerpo sobre una base COMBINE, retoques
# que sobreviven a regenerar, retarget, bucle sin costura, vínculo con una cara falsa, GLB reimportado y hoja de
# revisión. Archivos en _pruebas/ (siempre los mismos nombres). Sale con código 1 si algo falla.
import os, sys, math, time, json, glob, struct, traceback

BASE = os.path.dirname(os.path.abspath(__file__))
PRUEBAS = os.path.join(BASE, '_pruebas')
os.makedirs(PRUEBAS, exist_ok=True)
os.environ['ECORP_USUARIO'] = os.path.join(PRUEBAS, 'usuario')
sys.path.insert(0, BASE)
fallos = []


def caso(nombre, f):
    t = time.time()
    try:
        r = f()
        if r is False:
            fallos.append(nombre); print('  FALLA', nombre)
        else:
            print(f'  ok   {nombre} ({time.time() - t:.1f} s)' + (f'  {r}' if r not in (None, True) else ''))
    except Exception:
        fallos.append(nombre)
        print('  FALLA', nombre); traceback.print_exc()


import bpy, addon_utils
from mathutils import Vector, Quaternion, Matrix
import expresiones_corporales as A
from expresiones_corporales.nucleo import (util as U, perfil as PF, generador as GE, capas as CA, retoques as RT,
                                           biblioteca as BI, vinculo as VI, exportar as EX, revision as RV)

# biblioteca de usuario de prueba limpia
for f in glob.glob(os.path.join(os.environ['ECORP_USUARIO'], '*.json')):
    os.remove(f)


# ---------------------------------------------------------------- escenas de prueba
def crear_rigify():
    addon_utils.enable('rigify', default_set=True)
    bpy.ops.object.armature_human_metarig_add()
    meta = bpy.context.object
    bpy.ops.pose.rigify_generate()
    rig = bpy.data.objects['rig']
    rig.name = 'Prueba_Rig'
    bpy.data.objects.remove(meta)
    return rig


def cilindro(bm, a, b, r, n=10):
    import bmesh
    d = (b - a)
    z = d.normalized()
    x = z.orthogonal().normalized()
    y = z.cross(x)
    anillos = []
    for t in (0.0, 1.0):
        c = a + d * t
        anillos.append([bm.verts.new(c + (x * math.cos(2 * math.pi * i / n) + y * math.sin(2 * math.pi * i / n)) * r)
                        for i in range(n)])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((anillos[0][i], anillos[0][j], anillos[1][j], anillos[1][i]))
    bm.faces.new(anillos[0][::-1]); bm.faces.new(anillos[1])
    return [v for an in anillos for v in an]


def malla_cuerpo(rig):
    import bmesh
    radios = {'DEF-spine': 0.15, 'DEF-spine.001': 0.14, 'DEF-spine.002': 0.14, 'DEF-spine.003': 0.15,
              'DEF-spine.004': 0.05, 'DEF-spine.005': 0.05, 'DEF-spine.006': 0.1,
              'DEF-upper_arm': 0.045, 'DEF-forearm': 0.04, 'DEF-hand': 0.035, 'DEF-thigh': 0.08, 'DEF-shin': 0.06}
    me = bpy.data.meshes.new('Prueba_Cuerpo')
    ob = bpy.data.objects.new('Prueba_Cuerpo', me)
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    grupos = []
    for b in rig.data.bones:
        if not b.use_deform:
            continue
        base = b.name.split('.L')[0].split('.R')[0] if ('.L' in b.name or '.R' in b.name) else b.name
        r = radios.get(base)
        if r is None:
            continue
        vs = cilindro(bm, b.head_local, b.tail_local, r)
        grupos.append((b.name, len(vs)))
    bm.to_mesh(me); bm.free()
    i = 0
    for nombre, n in grupos:
        g = ob.vertex_groups.get(nombre) or ob.vertex_groups.new(name=nombre)
        g.add(list(range(i, i + n)), 1.0, 'REPLACE')
        i += n
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    ob.parent = rig
    return ob


def crear_mixamo():
    """T-pose mirando a +Y (su izquierda es -X), prefijo mixamorig:"""
    arm = bpy.data.armatures.new('Mixamo')
    rig = bpy.data.objects.new('Mixamo_Rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    P = 'mixamorig:'
    def hueso(n, h, t, padre=None):
        b = eb.new(P + n); b.head, b.tail = Vector(h), Vector(t)
        if padre:
            b.parent = eb[P + padre]
        return b
    hueso('Hips', (0, 0, 1.0), (0, 0, 1.1))
    hueso('Spine', (0, 0, 1.1), (0, 0, 1.22), 'Hips')
    hueso('Spine1', (0, 0, 1.22), (0, 0, 1.34), 'Spine')
    hueso('Spine2', (0, 0, 1.34), (0, 0, 1.46), 'Spine1')
    hueso('Neck', (0, 0, 1.46), (0, 0, 1.56), 'Spine2')
    hueso('Head', (0, 0, 1.56), (0, 0, 1.76), 'Neck')
    for lado, sx in (('Left', -1), ('Right', 1)):
        hueso(f'{lado}Shoulder', (sx * 0.03, 0, 1.42), (sx * 0.17, 0, 1.42), 'Spine2')
        hueso(f'{lado}Arm', (sx * 0.17, 0, 1.42), (sx * 0.45, 0, 1.42), f'{lado}Shoulder')
        hueso(f'{lado}ForeArm', (sx * 0.45, 0, 1.42), (sx * 0.71, 0, 1.42), f'{lado}Arm')
        hueso(f'{lado}Hand', (sx * 0.71, 0, 1.42), (sx * 0.79, 0, 1.42), f'{lado}ForeArm')
        for dedo, y in (('Index', 0.025), ('Middle', 0.0), ('Ring', -0.02), ('Pinky', -0.038)):
            prev = f'{lado}Hand'
            for i in (1, 2, 3):
                x0 = 0.79 + (i - 1) * 0.03
                hueso(f'{lado}Hand{dedo}{i}', (sx * x0, y, 1.42), (sx * (x0 + 0.03), y, 1.42), prev)
                prev = f'{lado}Hand{dedo}{i}'
        prev = f'{lado}Hand'
        for i in (1, 2, 3):
            x0 = 0.74 + (i - 1) * 0.025
            hueso(f'{lado}HandThumb{i}', (sx * x0, 0.04 + 0.02 * (i - 1), 1.41),
                  (sx * (x0 + 0.025), 0.06 + 0.02 * (i - 1), 1.41), prev)
            prev = f'{lado}HandThumb{i}'
        hueso(f'{lado}UpLeg', (sx * 0.09, 0, 1.0), (sx * 0.09, 0, 0.55), 'Hips')
        hueso(f'{lado}Leg', (sx * 0.09, 0, 0.55), (sx * 0.09, 0, 0.1), f'{lado}UpLeg')
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.location.x = 2.5
    return rig


def angulo(qa, qb):
    return U.angulo_grados(qa, qb)


def mundo_hueso(rig, h):
    return rig.pose.bones[h].matrix.to_quaternion()


# ---------------------------------------------------------------- casos
caso('register', A.register)
rig = crear_rigify()
malla = malla_cuerpo(rig)
mix = crear_mixamo()
bpy.context.scene.ecorp.rig = rig


def perfil_rigify():
    d = PF.detectar(rig)
    assert d['tipo'] == 'rigify', d['tipo']
    assert all(s in d['mapa'] for s in PF.CUERPO), d['mapa']
    assert len(d['dedos']) == 10, d['dedos'].keys()
    F = Vector(d['marco']['F'])
    assert F.dot(Vector((0, -1, 0))) > 0.99, F
    return {'adelante': [round(x, 3) for x in F], 'reposo': d['pose_reposo']}


def perfil_mixamo():
    d = PF.detectar(mix)
    assert d['tipo'] == 'mixamo' and d['prefijo'] == 'mixamorig:', d['tipo']
    assert all(s in d['mapa'] for s in PF.CUERPO), d['mapa']
    F = Vector(d['marco']['F'])
    assert F.dot(Vector((0, 1, 0))) > 0.99, F
    assert d['pose_reposo'] == 'T', d['pose_reposo']
    return {'adelante': [round(x, 3) for x in F], 'intermedios': list(d['intermedios'])}


def neutra_rigify():
    info = PF.calibrar_neutra(rig, malla=malla)
    assert info['medido_con_malla'], info
    assert info['distancia_mano_cuerpo'] is not None and info['distancia_mano_cuerpo'] >= info['margen'] - 1e-6, info
    p = PF.leer(rig)
    T = p['medidas']['T']
    assert T['torso'].get('chest', 0) > 0.95 and T['chest'].get('head', 0) < 0.05, 'transmisión Rigify inesperada'
    return info


def neutra_mixamo():
    PF.asegurar(mix)
    p = PF.leer(mix)
    # brazos colgando: el brazo apunta casi hacia abajo
    med = p['medidas']
    du = (Vector(med['cola']['mixamorig:LeftArm']) - Vector(med['pos']['mixamorig:LeftArm'])).normalized()
    a = math.degrees(du.angle(Vector((0, 0, -1))))
    assert a < 20, a
    return {'brazo_desde_vertical': round(a, 1)}


caso('perfil Rigify', perfil_rigify)
caso('perfil Mixamo', perfil_mixamo)
caso('neutra Rigify con malla', neutra_rigify)
caso('neutra Mixamo', neutra_mixamo)


def importar_investigacion():
    fs = sorted(glob.glob(os.path.join(BASE, 'investigacion', 'grupo_*.json')))
    n = 0
    for f in fs:
        n += BI.importar_json(f)['n']
    return {'entradas': n}


caso('investigación a biblioteca de usuario', importar_investigacion)


def generar_todo():
    out = {}
    for est in ('M', 'F'):
        t = time.time()
        r = GE.generar_todas(rig, est)
        assert not r['errores'], r['errores']
        esperadas = [c for c in BI.cargar()['expresiones'] if U.estilo_de(c) == est]
        assert r['n'] == len(esperadas), (r['n'], len(esperadas))
        out[est] = f'{r["n"]} en {time.time() - t:.1f} s'
    U.props(rig).estilo = 'M'
    return out


caso('generar toda la biblioteca (M y F)', generar_todo)


def datos_prueba(params, **t):
    tiempos = {'entrada': 6, 'asentar': 0, 'mantener': 12, 'salida': 6, 'desfase': 0, 'anticipacion': 0, 'sobrepaso': 0}
    tiempos.update(t)
    return {'gesto': 'prueba', 'estilo': 'M', 'familia': 'otras', 'params': params, 'vida': {}, 'tiempos': tiempos}


def pose_en(r, clave, base, frame):
    CA.previsualizar(r, clave, base=base)
    bpy.context.scene.frame_set(frame)
    return {pb.name: pb.matrix.copy() for pb in r.pose.bones}


def delta_cuerpo(r, h, con, sin):
    p = PF.leer(r)
    F, Uv, L = (Vector(p['marco'][k]) for k in 'FUL')
    d = con[h].to_quaternion() @ sin[h].to_quaternion().inverted()
    if d.w < 0:
        d.negate()
    ang = math.degrees(d.angle)
    eje = d.axis if ang > 1e-4 else Vector()
    return ang, {'L': round(eje.dot(L), 3), 'F': round(eje.dot(F), 3), 'U': round(eje.dot(Uv), 3)}


def medir_combine(r, base=None):
    U.escribir_expr(r, 'prueba_torso_M', datos_prueba({'torso_inclinar': 10}))
    U.escribir_expr(r, 'prueba_cabeza_M', datos_prueba({'cabeza_lateral': 10}))
    U.escribir_expr(r, 'prueba_hombro_M', datos_prueba({'hombro_subir': 10}))
    U.escribir_expr(r, 'prueba_brazo_M', datos_prueba({'brazo_abrir': 30}))
    for c in ('prueba_torso_M', 'prueba_cabeza_M', 'prueba_hombro_M', 'prueba_brazo_M'):
        GE.generar(r, c)
    a = U.accion(r, 'prueba_torso_M')
    fm = int(a.pose_markers['mantener'].frame) + 2
    sin = pose_en(r, 'neutra', base, fm)
    p = PF.leer(r)
    mp = p['mapa']
    res = {}
    con = pose_en(r, 'prueba_torso_M', base, fm)
    ang, eje = delta_cuerpo(r, mp['pecho'], con, sin)
    assert abs(ang - 10) < 1.0 and eje['L'] > 0.97, ('pecho', ang, eje)
    res['pecho'] = round(ang, 2)
    ang, eje = delta_cuerpo(r, mp['cabeza'], con, sin)
    assert abs(ang - 10) < 1.0 and eje['L'] > 0.97, ('cabeza sigue al pecho', ang, eje)
    res['cabeza_con_torso'] = round(ang, 2)
    if r.data.bones.get('DEF-spine.003'):
        ang, eje = delta_cuerpo(r, 'DEF-spine.003', con, sin)
        assert abs(ang - 10) < 1.5, ('DEF-spine.003', ang)
        res['DEF-spine.003'] = round(ang, 2)
    con = pose_en(r, 'prueba_cabeza_M', base, fm)
    ang, eje = delta_cuerpo(r, mp['cabeza'], con, sin)
    assert abs(ang - 10) < 1.0 and eje['F'] < -0.97, ('cabeza lateral', ang, eje)
    res['cabeza_lateral'] = round(ang, 2)
    con = pose_en(r, 'prueba_hombro_M', base, fm)
    ang, eje = delta_cuerpo(r, mp['hombro.L'], con, sin)
    assert abs(ang - 10) < 1.0 and eje['F'] > 0.97, ('hombro L', ang, eje)
    ang2, eje2 = delta_cuerpo(r, mp['hombro.R'], con, sin)
    assert abs(ang2 - 10) < 1.0 and eje2['F'] < -0.97, ('hombro R', ang2, eje2)
    res['hombro'] = (round(ang, 2), r.pose.bones[mp['hombro.L']].rotation_mode)
    con = pose_en(r, 'prueba_brazo_M', base, fm)
    ang, eje = delta_cuerpo(r, mp['brazo.L'], con, sin)
    assert abs(ang - 30) < 1.5, ('brazo', ang, eje)
    res['brazo'] = round(ang, 2)
    CA.quitar(r)
    return res


def base_caminar():
    """acción base de prueba (como caminar): tuerce el pecho y mueve un brazo."""
    a = bpy.data.actions.new('Prueba_Caminar')
    cb, slot = U.channelbag(a, rig)
    q1 = Quaternion((0, 0, 1), math.radians(12))
    for h, qq in (('chest', q1), ('upper_arm_fk.L', Quaternion((1, 0, 0), math.radians(25)))):
        for i in range(4):
            U.poner_claves(cb, f'pose.bones["{h}"].rotation_quaternion', i, [1, 40], [qq[i], qq[i]], h)
    a.use_fake_user = True
    return a


caso('COMBINE sobre la neutra (Rigify)', lambda: medir_combine(rig))
base_caminar()


def combine_caminar():
    U.escribir_expr(rig, 'prueba_torso_M', datos_prueba({'torso_inclinar': 10}))
    GE.generar(rig, 'prueba_torso_M')
    fm = int(U.accion(rig, 'prueba_torso_M').pose_markers['mantener'].frame) + 2
    sin = pose_en(rig, 'neutra', 'Prueba_Caminar', fm)
    con = pose_en(rig, 'prueba_torso_M', 'Prueba_Caminar', fm)
    ang, eje = delta_cuerpo(rig, 'chest', con, sin)
    CA.quitar(rig)
    assert abs(ang - 10) < 1.0, (ang, eje)
    return {'pecho_sobre_caminar': round(ang, 2), 'eje': eje}


caso('COMBINE sobre una base de caminar', combine_caminar)
caso('COMBINE sobre la neutra (Mixamo, mira a +Y)', lambda: medir_combine(mix))


def retoques():
    U.escribir_expr(rig, 'prueba_torso_M', datos_prueba({'torso_inclinar': 10}))
    GE.generar(rig, 'prueba_torso_M')
    a = U.accion(rig, 'prueba_torso_M')
    fm = int(a.pose_markers['mantener'].frame) + 3
    CA.previsualizar(rig, 'prueba_torso_M')
    bpy.context.scene.frame_set(fm)
    pb = rig.pose.bones['head']
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion((1, 0, 0), math.radians(15))
    bpy.context.view_layer.update()
    deseado = pb.matrix.to_quaternion()
    r = RT.capturar(rig, 'prueba_torso_M', fase='mantener')
    assert 'cabeza' in r['retoques'], r
    bpy.context.scene.frame_set(fm)
    d1 = angulo(rig.pose.bones['head'].matrix.to_quaternion(), deseado)
    GE.generar(rig, 'prueba_torso_M')
    CA.refrescar(rig)
    bpy.context.scene.frame_set(fm)
    d2 = angulo(rig.pose.bones['head'].matrix.to_quaternion(), deseado)
    CA.quitar(rig)
    assert d1 < 1.0 and d2 < 1.0, (d1, d2)
    return {'capturados': r['retoques'], 'error_tras_regenerar': round(d2, 3)}


caso('retoques sobreviven a regenerar', retoques)


def retarget():
    a = BI.aplicar_a(mix, 'prueba_torso_M', origen=rig)
    fm = int(a.pose_markers['mantener'].frame) + 3
    out = {}
    for r in (rig, mix):
        h = PF.leer(r)['mapa']['cabeza']
        sin = pose_en(r, 'neutra', None, fm)
        con = pose_en(r, 'prueba_torso_M', None, fm)
        p = PF.leer(r)
        F, Uv, L = (Vector(p['marco'][k]) for k in 'FUL')
        B = Matrix((L, F, Uv)).transposed()
        d = con[h].to_quaternion() @ sin[h].to_quaternion().inverted()
        out[r.name] = (B.transposed() @ d.to_matrix() @ B).to_quaternion()
        CA.quitar(r)
    err = angulo(out[rig.name], out[mix.name])
    assert err < 3.0, err
    return {'cabeza_rigify_vs_mixamo_grados': round(err, 2), 'giro': round(math.degrees(out[mix.name].angle), 1)}


caso('retarget a Mixamo con retoques', retarget)


def bucle():
    out = {}
    for c in ('miedo_M', 'risa_fuerte_M', 'triste_F'):
        if c not in BI.cargar()['expresiones']:
            continue
        a = U.accion(rig, c) or GE.generar(rig, c)
        m0, m1 = int(a.pose_markers['mantener'].frame), int(a.pose_markers['salida'].frame)
        CA.previsualizar(rig, c, base='ninguna')
        bpy.context.scene.frame_set(m0)
        p0 = {pb.name: pb.matrix.to_quaternion() for pb in rig.pose.bones}
        bpy.context.scene.frame_set(m1)
        err = max(angulo(p0[pb.name], pb.matrix.to_quaternion()) for pb in rig.pose.bones)
        # y que el mantener se mueva (vida)
        bpy.context.scene.frame_set((m0 + m1) // 2)
        mov = max(angulo(p0[pb.name], pb.matrix.to_quaternion()) for pb in rig.pose.bones)
        CA.quitar(rig)
        assert err < 0.05, (c, err)
        assert mov > 0.05, (c, 'mantener sin vida', mov)
        out[c] = (round(err, 4), round(mov, 2))
    return out


caso('bucle del mantener sin costura', bucle)


def bloquear():
    a = GE.generar(rig, 'triste_M')
    n0 = a['ecorp_claves']
    it = U.item_expr(rig, 'triste_M')
    it.bloqueada = True
    d = U.leer_expr(rig, 'triste_M'); d['params']['codo'] = 90
    U.escribir_expr(rig, 'triste_M', d)
    a2 = GE.generar(rig, 'triste_M')
    ok = a2 == a and a2['ecorp_claves'] == n0
    it.bloqueada = False
    BI.cargar_en(rig, 'triste_M')
    return ok


caso('bloquear expresión', bloquear)


def biblioteca():
    r = BI.guardar_usuario(rig, 'prueba_torso_M', 'mi_prueba_M')
    lib = BI.cargar()
    assert lib['origen'].get('mi_prueba_M') == 'usuario' and lib['expresiones']['mi_prueba_M'].get('retoques'), r
    ruta = os.path.join(PRUEBAS, 'exportadas.json')
    BI.exportar_json(rig, ruta, ['prueba_torso_M', 'sonrisa_abierta_M'])
    r2 = BI.importar_json(ruta, rig=mix)
    BI.duplicar(rig, 'triste_M', 'triste_copia_M')
    BI.renombrar(rig, 'triste_copia_M', 'triste_otra_M')
    assert U.accion(rig, 'triste_otra_M') is not None and U.accion(rig, 'triste_copia_M') is None
    BI.borrar(rig, 'triste_otra_M')
    return {'usuario': os.path.basename(r['ruta']), 'importadas_en_mixamo': r2['n']}


caso('biblioteca: guardar, exportar, importar, duplicar, renombrar', biblioteca)


def cara_falsa():
    me = bpy.data.meshes.new('Cara')
    cara = bpy.data.objects.new('Cara', me)
    bpy.context.scene.collection.objects.link(cara)
    ctrl = bpy.data.objects.new('Cara_Cara_Control', None)
    bpy.context.scene.collection.objects.link(ctrl)
    ctrl['facs_cara'] = 'Cara'
    for k in ('v_mouthSmile_L', 'v_mouthSmile_R', 'v_jawOpen', 'v_browInnerUp', 'v_mouthFrown_L'):
        ctrl[k] = 0.0
    ctrl.parent = rig
    for g, pesos in (('sonrisa_abierta', {'mouthSmile_L': 0.8, 'mouthSmile_R': 0.8, 'jawOpen': 0.3}),
                     ('triste', {'browInnerUp': 0.9, 'mouthFrown_L': 0.6})):
        a = bpy.data.actions.new(f'Cara_FACS_{g}')
        sl = a.slots.new(id_type='OBJECT', name='Control')
        cb = a.layers.new('L').strips.new(type='KEYFRAME').channelbag(sl, ensure=True)
        for n, v in pesos.items():
            f = cb.fcurves.new(f'["v_{n}"]')
            f.keyframe_points.insert(1, v).interpolation = 'CONSTANT'
        a['rlb_facs_expr'] = g
        a.use_fake_user = True
    return ctrl


def vinculo():
    ctrl = cara_falsa()
    r = VI.activar(rig)
    assert r['control'] == ctrl.name and r['gestos'] == 2, r
    hb = PF.leer(rig)['mapa']['cabeza']
    VI.poner_cara(ctrl, VI.pesos_accion(bpy.data.actions['Cara_FACS_triste']))
    bpy.context.view_layer.update()
    VI._depsgraph(bpy.context.scene)          # en segundo plano el manejador puede no saltar solo
    assert VI._gesto.get(rig.name) == 'triste', VI._gesto
    giro = math.degrees(U.local_quat(rig.pose.bones[hb]).angle)
    assert giro > 3, giro
    res = VI.aplicar_completa(rig, 'sonrisa_abierta', frame=20, intensidad_cara=0.8, intensidad_cuerpo=0.9)
    fc = [f for f in U.fcurves(ctrl.animation_data.action)]
    assert fc and res['tramo'][0] == 20, res
    st = [s for t in rig.animation_data.nla_tracks for s in t.strips if t.name.startswith('EC Expr')]
    assert st and st[0].frame_start == 20, st
    CA.quitar(rig)
    VI.desactivar(rig)
    ctrl.animation_data_clear()
    return {'gesto_detectado': 'triste', 'cabeza_grados': round(giro, 1), 'claves_cara': res['claves_cara']}


caso('vínculo con la cara (falsa) y expresión completa', vinculo)


def exportar():
    ruta = os.path.join(PRUEBAS, 'prueba_cuerpo.glb')
    acciones_antes = set(a.name for a in bpy.data.actions)
    r = EX.glb(rig, ruta, claves=['sonrisa_abierta_M', 'triste_M'])
    assert set(a.name for a in bpy.data.actions) == acciones_antes, 'quedaron acciones temporales'
    assert not any(t.name.startswith('EC_') for t in rig.animation_data.nla_tracks)
    with open(ruta, 'rb') as f:
        cab = f.read(20)
        n = struct.unpack('<I', cab[12:16])[0]
        js = json.loads(f.read(n))
    nombres = sorted(a['name'] for a in js.get('animations', []))
    esperados = sorted(['EC_neutra'] + [f'EC_{c}_{p}' for c in ('sonrisa_abierta_M', 'triste_M')
                                        for p in ('entrada', 'bucle', 'salida')])
    assert nombres == esperados, nombres
    con = json.load(open(r['contrato'], encoding='utf-8'))
    assert 'sonrisa_abierta' in con['gestos'] and con['gestos']['sonrisa_abierta']['clips']['bucle'] == 'EC_sonrisa_abierta_M_bucle'
    return {'clips': len(nombres), 'MB': round(os.path.getsize(ruta) / 1e6, 2), 'contrato': os.path.basename(r['contrato'])}


caso('exportar GLB + contrato', exportar)


def hoja():
    ruta = RV.hoja(rig, ['sonrisa_abierta_M', 'triste_M', 'miedo_F' if 'miedo_F' in BI.cargar()['expresiones'] else 'triste_F'],
                   ruta=os.path.join(PRUEBAS, 'hoja.png'), tam=160)
    assert os.path.isfile(ruta) and os.path.getsize(ruta) > 1000
    assert not CA.activa(rig)
    # los cuadros se leyeron de verdad (antes: «expected sequence size 0» con la imagen sin cargar)
    im = bpy.data.images.load(ruta, check_existing=False)
    w, h = im.size
    import numpy as np
    px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    assert (w, h) == (4 * 160, 3 * 160), (w, h)
    assert px[..., :3].mean() > 0.05, 'mosaico negro'
    # una segunda vez sobre los mismos archivos
    RV.hoja(rig, ['triste_M'], ruta=ruta, tam=160)
    return {'png': os.path.basename(ruta), 'tam': (w, h), 'brillo': round(float(px[..., :3].mean()), 3)}


caso('hoja de revisión', hoja)


def operadores():
    sc = bpy.context.scene
    sc.ecorp.rig = rig
    sc.ecorp.expresion = 'sorpresa_M' if 'sorpresa_M' in [i[0] for i in A._items_expr(sc.ecorp, bpy.context)] else 'triste_M'
    A.cargar_editor(bpy.context)
    sc.ecorp.auto = False
    sc.ecorp.p_codo_L = 50.0                     # enlazado: también el derecho
    assert abs(sc.ecorp.p_codo_R - 50.0) < 1e-6
    d = U.leer_expr(rig, sc.ecorp.expresion)
    assert d['params'].get('codo') == 50.0, d['params']
    assert 'FINISHED' in bpy.ops.ecorp.generar()
    assert 'FINISHED' in bpy.ops.ecorp.previsualizar()
    assert 'FINISHED' in bpy.ops.ecorp.quitar_previsualizacion()
    return sc.ecorp.expresion


caso('editor y operadores', operadores)


def generar_tiempo():
    t = time.time()
    GE.generar(rig, 'sonrisa_abierta_M')
    t1 = time.time() - t
    t = time.time()
    GE.generar(rig, 'sonrisa_abierta_M', ligero=True)
    return {'completa_s': round(t1, 3), 'ligera_s': round(time.time() - t, 3)}


caso('velocidad de regeneración', generar_tiempo)
caso('unregister', A.unregister)


def reimportar():
    ruta = os.path.join(PRUEBAS, 'prueba_cuerpo.glb')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=ruta)
    nombres = sorted(a.name for a in bpy.data.actions)
    assert any(n.startswith('EC_neutra') for n in nombres) and any('EC_triste_M_bucle' in n for n in nombres), nombres
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    return {'acciones': len(nombres), 'huesos': len(arm[0].data.bones) if arm else 0}


caso('GLB se reimporta con los clips', reimportar)
print('PRUEBA DE HUMO:', 'BIEN' if not fallos else 'FALLAN ' + ', '.join(fallos))
sys.exit(1 if fallos else 0)
