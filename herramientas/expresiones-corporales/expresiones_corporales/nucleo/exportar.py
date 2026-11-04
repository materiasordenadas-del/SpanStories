# Exportación GLB + contrato JSON para three.js (DISENO §9).
#   - Un GLB por personaje: malla con piel (solo huesos de deformación, animación muestreada para que Rigify pase sus
#     restricciones a los DEF), shape keys como morphs, modificadores Armature del rig facial apagados (como el facial).
#   - Clips: EC_neutra (bucle) y EC_<gesto>_<estilo>_entrada / _bucle / _salida, como poses ABSOLUTAS (neutra + delta):
#     en three.js se hacen aditivos con AnimationUtils.makeClipAdditive(clip, 0, EC_neutra).
#   - Contrato <personaje>_expresiones.json: pesos de morph de la cara por gesto (evaluando sus drivers con el gesto
#     puesto), nombres de clip, tiempos e intensidades.
# Las acciones absolutas son temporales y se borran al terminar (try/finally); la animación del rig queda como estaba.
#
#   exportar.glb(rig, ruta, estilo=None) -> dict
import bpy, os, json, math
from mathutils import Quaternion, Euler, Vector
from . import util as U
from . import perfil as PF


def _absoluta(rig, p, nombre, ae, f0, f1, ix=None):
    """acción temporal con la pose absoluta neutra ⊗ delta de 'ae' entre f0 y f1 (fotogramas de la acción)."""
    from . import capas as CA
    ix = CA.indice(ae) if ix is None else ix
    a = bpy.data.actions.new(nombre)
    a['ecorp_temporal'] = True
    cb, slot = U.channelbag(a, rig)
    frames = list(range(int(f0), int(f1) + 1))
    for h in PF.huesos(p):
        pb = rig.pose.bones.get(h)
        ruta = U.ruta_rot(pb) if pb else None
        if ruta is None:
            continue
        nq = PF.neutra_local(p, h)
        d = ix.get(h, {})
        if pb.rotation_mode == 'QUATERNION':
            vals = [[], [], [], []]
            prev = None
            for f in frames:
                if 'q' in d:
                    dq = Quaternion(CA._ev(d['q'], f, (1, 0, 0, 0))).normalized()
                else:
                    dq = Quaternion()
                qq = nq @ dq
                if prev is not None and prev.dot(qq) < 0:
                    qq.negate()
                prev = qq
                for i in range(4):
                    vals[i].append(qq[i])
        else:
            e0 = nq.to_euler(pb.rotation_mode)
            vals = [[], [], []]
            for f in frames:
                dv = CA._ev(d['e'], f, (0, 0, 0)) if 'e' in d else (0, 0, 0)
                for i in range(3):
                    vals[i].append(e0[i] + dv[i])
        for i, v in enumerate(vals):
            U.poner_claves(cb, ruta, i, [x - f0 for x in frames], v, grupo=h)
        if 'l' in d:
            for i in range(3):
                U.poner_claves(cb, f'pose.bones["{h}"].location', i, [x - f0 for x in frames],
                               [CA._ev(d['l'], f, (0, 0, 0))[i] for f in frames], grupo=h)
    return a


def _mods_cara(objs, rig):
    """modificadores Armature de las mallas que NO son el rig del cuerpo (rig facial): se apagan al exportar."""
    out = []
    for o in objs:
        if o.type != 'MESH':
            continue
        for m in o.modifiers:
            if m.type == 'ARMATURE' and m.object is not None and m.object != rig and m.show_viewport:
                out.append(m)
    return out


def objetos_exportar(rig):
    """el rig, las mallas que deforma y los objetos visibles que cuelgan de él (ojos, dientes, cara...)."""
    objs = {rig}
    for o in U.mallas_del_rig(rig):
        objs.add(o)
    for o in rig.children_recursive:
        try:
            vis = o.visible_get()
        except Exception:
            vis = False
        if vis and o.type in ('MESH', 'ARMATURE', 'EMPTY'):
            objs.add(o)
    return sorted(objs, key=lambda o: o.name)


def _morphs(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for o in objs:
        if o.type != 'MESH' or not o.data.shape_keys:
            continue
        ev = o.evaluated_get(dg)
        kb = ev.data.shape_keys.key_blocks if ev.data.shape_keys else o.data.shape_keys.key_blocks
        d = {k.name: round(float(k.value), 4) for k in list(kb)[1:] if abs(k.value) > 1e-4}
        if d:
            out[o.name] = d
    return out


def _caras(rig, objs, estilo, claves):
    """por gesto facial: morphs evaluados con el gesto puesto + clave corporal. Deja la cara como estaba."""
    from . import vinculo as VI
    ctrl = VI.control_de(rig)
    out = {}
    if ctrl is None:
        return out, None
    antes = VI.vector(ctrl)
    try:
        for a in VI.acciones_cara(ctrl):
            g = VI.gesto_de_accion(a)
            VI.poner_cara(ctrl, VI.pesos_accion(a))
            bpy.context.view_layer.update()
            out[g] = {'morphs': _morphs(objs), 'accion_cara': a.name, 'clave_cuerpo': VI.clave_cuerpo(rig, g)}
    finally:
        for k, v in antes.items():
            ctrl['v_' + k] = v
        ctrl.update_tag()
        bpy.context.view_layer.update()
    return out, ctrl.name


def glb(rig, ruta, estilo=None, claves=None, objetos=None, contrato=True):
    from . import generador as GE, capas as CA, biblioteca as BI
    p = PF.asegurar(rig)
    pg = U.props(rig)
    estilo = estilo or pg.estilo
    if claves is None:
        claves = [it.name for it in pg.expresiones if U.estilo_de(it.name) == estilo]
        if not claves:
            claves = [c for c in BI.cargar()['expresiones'] if U.estilo_de(c) == estilo]
    an = U.accion(rig, 'neutra') or GE.generar(rig, 'neutra')
    acciones = {}
    for c in claves:
        acciones[c] = U.accion(rig, c) or GE.generar(rig, c)
    objs = list(objetos) if objetos else objetos_exportar(rig)
    caras, ctrl_nombre = _caras(rig, objs, estilo, claves) if contrato else ({}, None)
    sc = bpy.context.scene
    ad = rig.animation_data_create()
    estado = {'accion': ad.action, 'slot': ad.action_slot, 'use_nla': ad.use_nla,
              'strips': [(st, st.mute) for t in ad.nla_tracks for st in t.strips],
              'frame': sc.frame_current}
    sel = {o: o.select_get() for o in bpy.context.view_layer.objects}
    activo = bpy.context.view_layer.objects.active
    mods = _mods_cara(objs, rig)
    temp_acc, temp_pistas, clips, avisos = [], [], [], []
    tiempos = {}
    try:
        ad.action = None
        for st, _m in estado['strips']:
            st.mute = True
        def clip(nombre, ae, f0, f1):
            a = _absoluta(rig, p, nombre, ae, f0, f1)
            temp_acc.append(a)
            t = ad.nla_tracks.new()
            t.name = nombre
            t.strips.new(nombre, 1, a)
            temp_pistas.append(t)
            clips.append(nombre)
        f0, f1 = an.frame_range
        clip('EC_neutra', an, f0, f1)
        for c, a in acciones.items():
            mk = {m.name: m.frame for m in a.pose_markers}
            fe, fm, fs, ff = mk.get('entrada', 1), mk.get('mantener', 1), mk.get('salida', 2), mk.get('fin', 3)
            clip(f'EC_{c}_entrada', a, fe, fm)
            clip(f'EC_{c}_bucle', a, fm, fs)
            clip(f'EC_{c}_salida', a, fs, ff)
            fps = U.fps()
            tiempos[c] = {'marcadores': mk, 'entrada_s': round((fm - fe) / fps, 4), 'bucle_s': round((fs - fm) / fps, 4),
                          'salida_s': round((ff - fs) / fps, 4), 'pico_s': round((mk.get('pico', 1) - fe) / fps, 4)}
        for m in mods:
            m.show_viewport = False
        for o in sel:
            o.select_set(False)
        for o in objs:
            try:
                o.select_set(True)
            except Exception:
                pass
        bpy.context.view_layer.objects.active = rig
        os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=ruta, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
            export_animations=True, export_animation_mode='ACTIONS', export_anim_single_armature=False,
            export_force_sampling=True, export_def_bones=True, export_skins=True, export_morph=True,
            export_morph_normal=False, export_anim_slide_to_zero=True, export_frame_step=1,
            export_current_frame=False, export_reset_pose_bones=True, export_optimize_animation_size=True)
    finally:
        for m in mods:
            m.show_viewport = True
        for t in temp_pistas:
            try:
                ad.nla_tracks.remove(t)
            except Exception:
                pass
        for a in temp_acc:
            try:
                bpy.data.actions.remove(a)
            except Exception:
                pass
        for st, m in estado['strips']:
            try:
                st.mute = m
            except Exception:
                pass
        ad.use_nla = estado['use_nla']
        ad.action = estado['accion']
        if estado['accion'] is not None and estado['slot'] is not None:
            try:
                ad.action_slot = estado['slot']
            except Exception:
                pass
        for o, s in sel.items():
            try:
                o.select_set(s)
            except Exception:
                pass
        bpy.context.view_layer.objects.active = activo
        sc.frame_set(estado['frame'])
    res = {'glb': ruta, 'clips': clips, 'objetos': [o.name for o in objs], 'avisos': avisos}
    if contrato:
        personaje = rig.name.removesuffix('_Rig')
        rc = os.path.join(os.path.dirname(os.path.abspath(ruta)), f'{personaje}_expresiones.json')
        gestos = {}
        for c in acciones:
            g = U.gesto_de(c)
            d = U.leer_expr(rig, c) or {}
            gestos[g] = {'clave_cuerpo': c,
                         'clips': {'entrada': f'EC_{c}_entrada', 'bucle': f'EC_{c}_bucle', 'salida': f'EC_{c}_salida'},
                         'tiempos': tiempos[c], 'intensidad_cuerpo': float(d.get('intensidad', 1.0)),
                         'intensidad_cara': 1.0, 'adelanto_cara_s': round(3 / U.fps(), 4),
                         'cara': caras.get(g, {}).get('morphs', {}),
                         'accion_cara': caras.get(g, {}).get('accion_cara')}
        for g, v in caras.items():
            if g not in gestos:
                gestos[g] = {'clave_cuerpo': v['clave_cuerpo'], 'clips': None, 'cara': v['morphs'],
                             'accion_cara': v['accion_cara']}
        d = {'esquema': 'spanstories.cuerpo.contrato/1', 'personaje': personaje, 'rig': rig.name,
             'glb': os.path.basename(ruta), 'estilo': estilo, 'fps': U.fps(), 'control_cara': ctrl_nombre,
             'neutra': {'clip': 'EC_neutra', 'bucle': True}, 'aditivo': {'referencia': 'EC_neutra', 'fotograma': 0},
             'gestos': gestos}
        with open(rc, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        res['contrato'] = rc
    return res
