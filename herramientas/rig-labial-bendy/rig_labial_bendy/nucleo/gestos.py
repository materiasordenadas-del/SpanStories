# Paso 9: gestos (los 12 de Vale) hechos solo con los controles. Los valores están en metros de Vale y se
# escalan: boca por la escala de la boca, párpados/cejas/mejillas por la escala del ojo.
# Crea una acción por gesto (asset de pose -> Pose Library) y <rig>_Gestos con todos seguidos + marcadores.
import bpy, math, json, os
from mathutils import Vector
from . import util

GESTO_FRAMES, MANTENER = 24, 12


def Y(v): return {'loc': (0, v, 0)}
def par(nombre, v): return {nombre + '.L': Y(v), nombre + '.R': Y(v)}
def comis(x, y, z): return {'comisura.L': {'loc_w': (x, y, z)}, 'comisura.R': {'loc_w': (-x, y, z)}}
def cejas(dentro, fuera, juntar=0.0):
    return {'ceja_in.L': {'loc': (-juntar, dentro, 0)}, 'ceja_in.R': {'loc': (juntar, dentro, 0)},
            'ceja_out.L': Y(fuera), 'ceja_out.R': Y(fuera)}
def jaw(z): return {'mandibula_ctrl': {'loc_w': (0, 0, z)}}
def g(*partes):
    d = {}
    for p in partes: d.update(p)
    return d
CERRAR = {'cerrar_ctrl': {'scale': (0.5, 0.5, 0.5)}}

GESTOS = {
    # --- alegría
    'sonrisa': g(comis(0.0022, 0.0014, 0.0045), CERRAR, par('mejilla', 0.0014), par('parpado_inf', 0.0007), cejas(0.0008, 0.0006)),
    'sonrisa_dientes': g(jaw(-0.004), comis(0.0024, 0.0015, 0.0045), par('mejilla', 0.0022), par('parpado_inf', 0.0012), cejas(0.0012, 0.0008)),
    'risa': g(jaw(-0.009), comis(0.0024, 0.0012, 0.0045), par('mejilla', 0.0022), par('parpado', -0.0036), par('parpado_inf', 0.002), cejas(0.0018, 0.0012)),
    'ilusion': g(jaw(-0.006), comis(0.002, 0.001, 0.0038), par('mejilla', 0.0012), par('parpado', 0.0012), cejas(0.004, 0.0035)),
    'guino': g(comis(0.0018, 0.0012, 0.0032), {'comisura.L': {'loc_w': (0.0022, 0.0014, 0.0048)}},
               {'mejilla.L': Y(0.0022), 'mejilla.R': Y(0.001)}, {'parpado.L': Y(-0.004), 'parpado_inf.L': Y(0.002)},
               cejas(0.0008, 0.0008), {'ceja_in.L': Y(-0.0008), 'ceja_out.L': Y(-0.0006)}),
    # --- tristeza
    'triste': g(comis(0.0008, 0.0004, -0.0032), CERRAR, cejas(0.005, -0.001, 0.0008), par('parpado', -0.0012)),
    'a_punto_de_llorar': g(jaw(-0.003), comis(0.0015, 0.0, -0.003), par('baj_labio', -0.0012), cejas(0.005, -0.0012, 0.0014),
                           par('parpado', -0.0006), par('parpado_inf', 0.0012)),
    'decepcion': g(comis(0.0004, 0.0003, -0.0022), cejas(0.002, -0.0008), par('parpado', -0.002), CERRAR),
    # --- rabia
    'enojo': g(comis(-0.0004, 0.0, -0.0016), cejas(-0.0045, 0.001, 0.002), par('parpado', -0.0008), par('parpado_inf', 0.0012), CERRAR),
    'furia': g(jaw(-0.006), comis(0.0014, 0.0, -0.002), par('lev_labio', 0.0018), par('baj_labio', -0.0018),
               cejas(-0.005, 0.0012, 0.002), par('parpado_inf', 0.0016), par('mejilla', 0.0008), {'boca': {'scale': (1.3, 1.3, 1.3)}}),
    'fastidio': g({'comisura.L': {'loc_w': (0.0012, 0.0006, -0.0004)}, 'comisura.R': {'loc_w': (0.0004, 0.0, -0.0010)}},
                  {'ceja_in.L': {'loc': (-0.001, -0.0035, 0)}, 'ceja_out.L': Y(-0.0005), 'ceja_in.R': Y(0.001), 'ceja_out.R': Y(0.0028)},
                  par('parpado', -0.0016), CERRAR),
    # --- extra
    'sorpresa': g(jaw(-0.012), {'boca': {'scale': (0.8, 0.8, 0.8)}}, cejas(0.005, 0.004), par('parpado', 0.0015)),
    # --- 0.4.0 (Gómez): forma del párpado con parpado_in / parpado_out (rig de párpados con huesos)
    'sospecha': g(comis(-0.0002, 0.0, -0.0006), {'comisura.L': {'loc_w': (0.0008, 0.0004, 0.0008)}},
                  par('parpado', -0.0014), par('parpado_inf', 0.0014), par('parpado_in', -0.0008),
                  {'ceja_in.L': {'loc': (-0.001, -0.003, 0)}, 'ceja_out.L': Y(-0.001), 'ceja_in.R': Y(0.0015), 'ceja_out.R': Y(0.0025)}, CERRAR),
    'cansado': g(jaw(-0.002), comis(0.0002, 0.0, -0.0012), par('parpado', -0.0022), par('parpado_out', -0.0008),
                 cejas(0.0015, -0.0012)),
}
# párpado con forma (solo existe con PARAM['modo'] = 'huesos'; en el modo keys se ignora)
for _n, _v in (('enojo', -0.0012), ('furia', -0.0016)): GESTOS[_n].update(par('parpado_in', _v))
for _n, _v in (('triste', -0.001), ('a_punto_de_llorar', -0.0012), ('decepcion', -0.0008)): GESTOS[_n].update(par('parpado_out', _v))
OJO = ('parpado', 'ceja', 'mejilla')


def ruta_gestos_extra(crear=False):
    """gestos_extra.json en la carpeta de usuario de la extensión: no se borra al reinstalar o actualizar el zip
    (la carpeta del add-on sí). None si no se ejecuta como extensión. crear=True crea la carpeta (para escribir)."""
    try:
        return os.path.join(bpy.utils.extension_path_user(__package__.rsplit('.', 1)[0], create=crear), 'gestos_extra.json')
    except Exception:
        return None


def cargar_gestos(ruta=None, cfg=None):
    """GESTOS + los que el usuario haya guardado en gestos_extra.json (mismo formato) + los propios del
    personaje (cfg['gestos'] de la cara: p. ej. Gómez, boca entreabierta en reposo -> sonrisa sin apretar)."""
    d = dict(GESTOS)
    rutas = [ruta] if ruta else [os.path.join(os.path.dirname(os.path.dirname(__file__)), 'gestos_extra.json'),
                                 ruta_gestos_extra()]     # la vieja (dentro del add-on) y la que sobrevive a reinstalar
    for r in rutas:
        if r and os.path.exists(r):
            with open(r, encoding='utf-8') as f:
                try:
                    d.update(json.load(f))
                except ValueError as e:
                    raise RuntimeError(f'{r} no es un JSON válido ({e}): corrígelo o bórralo y repite') from None
    if cfg: d.update(cfg.get('gestos', {}))
    return d


def escalar(pose, s_boca, s_ojo):
    out = {}
    for n, t in pose.items():
        k = s_ojo if n.startswith(OJO) else s_boca
        tt = {}
        for key, v in t.items():
            tt[key] = tuple(c * k for c in v) if key in ('loc', 'loc_w') else v
        out[n] = tt
    return out


def aplicar(rig, pose):
    for n, t in pose.items():
        pb = rig.pose.bones.get(n)
        if pb is None: continue
        if 'loc_w' in t: pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(t['loc_w'])
        if 'loc' in t: pb.location = t['loc']
        if 'scale' in t: pb.scale = t['scale']
        if 'rot' in t:
            pb.rotation_mode = 'XYZ'; pb.rotation_euler = [math.radians(a) for a in t['rot']]


def _claves(rig, nombres, frame):
    for n in nombres:
        pb = rig.pose.bones.get(n)
        if pb is None: continue
        for c in ('location', 'rotation_euler', 'scale'):
            if c == 'rotation_euler' and pb.rotation_mode != 'XYZ': continue
            pb.keyframe_insert(c, frame=frame, group=n)


def crear(rig, M, gestos=None):
    gestos = gestos or cargar_gestos(cfg=M.cfg)
    s_b, s_o = M.s, M.se()
    G = {k: escalar(v, s_b, s_o) for k, v in gestos.items()}
    if rig.animation_data is None: rig.animation_data_create()
    todos = sorted({n for p in G.values() for n in p if n in rig.pose.bones})
    pref = rig.name
    for nombre, pose in G.items():
        an = f'{pref}_Gesto_{nombre}'
        if an in bpy.data.actions: bpy.data.actions.remove(bpy.data.actions[an])
        act = bpy.data.actions.new(an); rig.animation_data.action = act
        util.pose_reposo(rig); aplicar(rig, pose); _claves(rig, todos, 1)
        act.asset_mark(); act.asset_data.description = 'Gesto: ' + nombre.replace('_', ' ')
        act.use_fake_user = True
    an = f'{pref}_Gestos'
    if an in bpy.data.actions: bpy.data.actions.remove(bpy.data.actions[an])
    act = bpy.data.actions.new(an); rig.animation_data.action = act
    sc = bpy.context.scene
    f = 1
    util.pose_reposo(rig); _claves(rig, todos, f)
    for nombre, pose in G.items():
        f += GESTO_FRAMES - MANTENER
        util.pose_reposo(rig); aplicar(rig, pose); _claves(rig, todos, f)
        mk = sc.timeline_markers.get(nombre) or sc.timeline_markers.new(nombre)
        mk.frame = f
        f += MANTENER; _claves(rig, todos, f)
    f += GESTO_FRAMES - MANTENER
    util.pose_reposo(rig); _claves(rig, todos, f)
    act.use_fake_user = True
    sc.frame_start, sc.frame_end = 1, f; sc.frame_set(1)
    return {'gestos': list(G), 'frames': f, 'escala_boca': round(s_b, 3), 'escala_ojo': round(s_o, 3)}
