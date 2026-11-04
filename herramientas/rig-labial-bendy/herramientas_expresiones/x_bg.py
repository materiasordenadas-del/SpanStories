import bpy, json, sys
from mathutils import Vector
from mathutils.kdtree import KDTree
rig = bpy.data.objects['Business girl_rig']; me = bpy.data.objects['CC_Base_Body']
B = lambda n: rig.matrix_world @ rig.data.bones[n].head_local
kb = me.data.shape_keys.key_blocks; mw = me.matrix_world
P0 = [mw @ v.co for v in kb['Basis'].data]
REF = {}
for s, a in (('L','l'),('R','r')):
    REF['comisura.'+s]=B('c_lips_smile.'+a); REF['labio_sup_lat.'+s]=B('c_lips_top_01.'+a); REF['labio_inf_lat.'+s]=B('c_lips_bot_01.'+a)
    REF['ceja_in.'+s]=B('c_eyebrow_01.'+a); REF['ceja_mid.'+s]=B('c_eyebrow_02.'+a); REF['ceja_out.'+s]=B('c_eyebrow_03.'+a)
    REF['mejilla.'+s]=B('c_cheek_smile.'+a); F=bpy.data.objects['FaceitControlRig']; FB=lambda n: F.matrix_world@F.data.bones[n].head_local; REF['parpado_sup.'+s]=FB('c_eyelid_upper.'+s); REF['parpado_inf.'+s]=FB('c_eyelid_lower.'+s)
    REF['nariz.'+s]=B('c_nose_02.x')+Vector((0.012 if s=='L' else -0.012,0.005,-0.005))
REF['labio_sup']=B('c_lips_top.x'); REF['labio_inf']=B('c_lips_bot.x'); REF['menton']=B('c_chin_02.x')
# solo vértices de la cara (delante, a la altura de la cabeza)
cand=[i for i,p in enumerate(P0) if p.z>1.55 and p.y<-0.06]
kd=KDTree(len(cand))
for j,i in enumerate(cand): kd.insert(P0[i],j)
kd.balance()
IDX={k:cand[kd.find(v)[1]] for k,v in REF.items()}
print('DIST',{k:round((P0[i]-REF[k]).length*1000,1) for k,i in IDX.items()})
poses={}
for k in kb[1:]:
    if k.name.startswith('faceit_cc'): continue
    poses[k.name]={n:tuple(round(c,6) for c in (mw@k.data[i].co-P0[i])) for n,i in IDX.items()}
ey=bpy.data.objects['CC_Base_Eye']; E=[ey.matrix_world@v.co for v in ey.data.vertices]
c=lambda L: sum(L,Vector())/len(L)
out={'fuente':'Business girl (CC4 + Faceit, 52 ARKit)','reposo':{k:tuple(round(x,6) for x in P0[i]) for k,i in IDX.items()},
     'ojo.L':tuple(c([p for p in E if p.x>0])),'ojo.R':tuple(c([p for p in E if p.x<0])),'poses':poses}
json.dump(out,open(sys.argv[-1],'w'),indent=0); print('OK',len(poses))
