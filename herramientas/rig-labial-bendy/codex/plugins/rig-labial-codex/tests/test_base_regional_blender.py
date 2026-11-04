"""Restauración local, lados independientes, deshacer y guardar sin escribir .blend."""
import bpy, sys, json
import numpy as np
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]/'assets'))
from rig_labial_bendy.nucleo.facs import editor as E, base_regional as BR
from rig_labial_bendy.nucleo.facs import ajustes_ojos as AO, retoque_parpados as RP

for cls in (E.RLB_ExpCanal,E.RLB_ExpEditor,E.RLB_OT_exp_base_region,E.RLB_OT_exp_guardar):
    bpy.utils.register_class(cls)
bpy.types.Scene.rlb_editor=bpy.props.PointerProperty(type=E.RLB_ExpEditor)
me=bpy.data.meshes.new('prueba');me.from_pydata([(i,0,0) for i in range(8)],[],[])
cara=bpy.data.objects.new('prueba',me);bpy.context.collection.objects.link(cara)
cara.shape_key_add(name='Basis')
ctrl=bpy.data.objects.new(cara.name+'_Cara_Control',None);bpy.context.collection.objects.link(ctrl)
base=AO._co(cara.data.shape_keys.reference_key)
pose=cara.shape_key_add(name='pose');pose.data.foreach_set('co',(base+np.array([0,.25,.5])).ravel());pose.value=.7
aj=cara.shape_key_add(name='aj_labio_sup_centro_arriba');co=base.copy();co[0,2]+=1;co[1,2]+=.2;aj.data.foreach_set('co',co.ravel())
RP._conectar(cara,ctrl,aj.name)
E._cara=lambda ctx:cara
E.BI.mirada=lambda *args:None
ed=bpy.context.scene.rlb_editor;ed.activo=True;ed.control=ctrl.name
a=bpy.data.actions.new('prueba_FACS_actual');ed.accion=a.name
other=bpy.data.actions.new('prueba_FACS_otra');other['sentinela']=19
ed.enlazar=True
E._bloqueo[0]=True
c=ed.canales.add();c.name=aj.name;c.ajuste=True;c.fino=30
E._bloqueo[0]=False
E._refrescar(bpy.context,ed)
prev=RP._mezcla(cara,'');basis_original=AO._co(cara.data.shape_keys.reference_key).copy()
assert bpy.ops.rlb.exp_base_region(region='boca',lado='BOTH')=={'FINISHED'}
after=RP._mezcla(cara,'')
np.testing.assert_allclose(after[0],base[0],atol=1e-6)
np.testing.assert_array_equal(after[2:],prev[2:])
assert E.deshacer(bpy.context,ed)
np.testing.assert_allclose(RP._mezcla(cara,''),prev,atol=1e-6)
# Región ocular sintética disjunta: la simetría activa no amplía el lado pedido.
AO._mascaras_basales=lambda c:{(p,s):np.array([0,0,1 if s=='L' else 0,0,1 if s=='R' else 0,0,0,0],float)/2
                              for p in ('sup','inf') for s in ('L','R')}
prev=RP._mezcla(cara,'')
assert bpy.ops.rlb.exp_base_region(region='ojos',lado='L')=={'FINISHED'}
after=RP._mezcla(cara,'')
np.testing.assert_allclose(after[2],base[2],atol=1e-6)
np.testing.assert_allclose(after[[0,1,3,4,5,6,7]],prev[[0,1,3,4,5,6,7]],atol=1e-6)
assert bpy.ops.rlb.exp_base_region(region='ojos',lado='R')=={'FINISHED'}
np.testing.assert_allclose(RP._mezcla(cara,'')[[2,4]],base[[2,4]],atol=1e-6)
assert E.deshacer(bpy.context,ed)
np.testing.assert_allclose(RP._mezcla(cara,'')[4],prev[4],atol=1e-6)
np.testing.assert_array_equal(AO._co(cara.data.shape_keys.reference_key),basis_original)
for k in cara.data.shape_keys.key_blocks:
    if BR.es_base(k.name):
        assert BR.pertenece(k.name,'actual') and not BR.pertenece(k.name,'otra')
assert other['sentinela']==19
assert bpy.ops.rlb.exp_guardar()=={'FINISHED'}
assert a['rlb_editada'] and not bpy.data.filepath
ed.intensidad=0
try:
    bpy.ops.rlb.exp_base_region(region='boca',lado='BOTH')
    raise AssertionError('Debe rechazar intensidad cero')
except RuntimeError as error:
    assert 'intensidad' in str(error)
print('BASE_REGIONAL_OK: boca, lados independientes con simetría, deshacer, Basis intacto, aislamiento y guardado sin blend')
