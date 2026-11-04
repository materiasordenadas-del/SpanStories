import bpy, json, sys
from mathutils import Vector
from mathutils.kdtree import KDTree
rig = bpy.data.objects['Girl_rig']; me = bpy.data.objects['girl']
from mathutils import Matrix
def reset():
    for pb in rig.pose.bones:
        pb.location = (0,0,0); pb.rotation_quaternion = (1,0,0,0); pb.rotation_euler=(0,0,0); pb.scale=(1,1,1)
for o in bpy.data.objects:
    if o.type=='MESH' and o.name not in ('girl','eye'): o.hide_viewport = True
B = lambda n: rig.matrix_world @ rig.data.bones[n].head_local
# eye centers from eye mesh islands
ey = bpy.data.objects['eye']; P = [ey.matrix_world @ v.co for v in ey.data.vertices]
eL = [p for p in P if p.x > 0]; eR = [p for p in P if p.x < 0]
cen = lambda L: sum(L, Vector()) / len(L)
eyeL, eyeR = cen(eL), cen(eR)
print('EYES', eyeL[:], eyeR[:])
REF = {}
for s, sx in (('L', 1), ('R', -1)):
    REF['comisura.'+s] = B('tweak.lips.corner.'+s)
    REF['labio_sup_lat.'+s] = B('DEF.lips_02.U.'+s)
    REF['labio_inf_lat.'+s] = B('DEF.lips_02.D.'+s)
    REF['ceja_in.'+s] = B('DEF.brow_02.U.'+s)
    REF['ceja_mid.'+s] = B('DEF.brow_03.U.'+s)
    REF['ceja_out.'+s] = B('DEF.eyelids_03.connect.U.'+s)
    REF['mejilla.'+s] = B('DEF.cheek_02.H.'+s)
    REF['nariz.'+s] = B('DEF.nose_wing_01.'+s)
    REF['parpado_sup.'+s] = B('DEF-lid.T.'+s+'.002')
    REF['parpado_inf.'+s] = (B('DEF-lid.B.'+s+'.001') + B('DEF-lid.B.'+s+'.002')) / 2
REF['labio_sup'] = B('DEF.lips_01.U.L'); REF['labio_inf'] = B('DEF.lips_01.D.L'); REF['menton'] = B('DEF.chin.C')
dg = bpy.context.evaluated_depsgraph_get()
def pos():
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    e = me.evaluated_get(dg); m = e.to_mesh()
    H = rig.matrix_world @ rig.pose.bones['head'].matrix
    T = HR @ H.inverted()
    out = [T @ (me.matrix_world @ v.co) for v in m.vertices]; e.to_mesh_clear(); return out
rig.animation_data.action = None
for t in rig.animation_data.nla_tracks: t.mute = True
reset(); bpy.context.view_layer.update()
HR = rig.matrix_world @ rig.pose.bones['head'].matrix
P0 = pos()
kd = KDTree(len(P0))
for i, p in enumerate(P0): kd.insert(p, i)
kd.balance()
IDX = {k: kd.find(v)[1] for k, v in REF.items()}
print('DIST', {k: round((P0[i]-REF[k]).length*1000,1) for k, i in IDX.items()})
def lm(Pp): return {k: Pp[i] for k, i in IDX.items()}
L0 = lm(P0)
poses = {}
def medir(nombre):
    L1 = lm(pos()); poses[nombre] = {k: tuple(round(c, 6) for c in (L1[k]-L0[k])) for k in L0}
def con_accion(n):
    a = bpy.data.actions[n]; ad = rig.animation_data; ad.action = a
    if a.slots and ad.action_slot is None: ad.action_slot = a.slots[0]
    bpy.context.scene.frame_set(int(a.frame_range[0]))
for n in ('Happy', 'Sad', 'Angry', 'Surprised', 'Fear', 'Disgust', 'Contempt', 'Pose 1', 'Pose 2', 'Pose 3', 'Pose 4'):
    reset(); con_accion(n); medir(n)
rig.animation_data.action = None; reset()
bpy.context.scene.frame_set(1)
L0b = lm(pos()); print('REST drift mm', max((L0b[k]-L0[k]).length for k in L0)*1000)
for v in ('Aaa', 'Eee', 'ohh', 'Uuu', 'Mbp', 'Fff', 'Thh', 'Rrr'):
    nm = v if v in rig.pose.bones else v.capitalize()
    pb = rig.pose.bones[nm]; pb.location.x = 0.1; medir(nm.capitalize()); pb.location.x = 0
hw = (L0['comisura.L'] - L0['comisura.R']).length / 2
out = {'fuente': 'Serena V23 (acciones + Action constraints)', 'reposo': {k: tuple(round(c,6) for c in v) for k, v in L0.items()},
       'ojo.L': tuple(eyeL), 'ojo.R': tuple(eyeR), 'poses': poses}
json.dump(out, open(sys.argv[-1], 'w'), indent=0)
print('OK', len(poses), 'hw', hw)
