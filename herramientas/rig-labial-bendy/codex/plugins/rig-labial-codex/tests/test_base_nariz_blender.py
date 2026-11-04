"""Nariz completa, puente lejos de puntos finos y protección de labios/ojos."""
import bpy, sys
import numpy as np
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]/'assets'))
from rig_labial_bendy.nucleo.facs import base_regional as BR, ajustes_ojos as AO

for escala in (.001, 1., 20.):
    # Alas, punta, lagrimales, labio, puente, aleta exterior, dorso de cabeza, mejilla.
    coords=np.array([( .006,-.064,.892),(-.006,-.064,.892),(0,-.071,.885),
                     (.016,-.048,.910),(-.016,-.048,.910),(0,-.061,.870),
                     (0,-.056,.903),(.011,-.061,.889),(0,.05,.892),(.03,-.05,.892),
                     (0,-.065,.879),(0,-.055,.875)])*escala
    coords+=np.array([2.,-.3,4.])*escala
    me=bpy.data.meshes.new('nariz');me.from_pydata(coords.tolist(),[],[])
    cara=bpy.data.objects.new('nariz',me);bpy.context.collection.objects.link(cara)
    cara.shape_key_add(name='Basis')
    cara['aj_anclas']={'nariz_L':0,'nariz_R':1,'nariz_punta':2,
                      'parpado_sup_1_L':3,'parpado_sup_1_R':4,'labio_sup_1':5}
    pose=cara.shape_key_add(name='pose');pose.data.foreach_set('co',(coords+[0,0,.004*escala]).ravel());pose.value=1.
    w=BR.mascara(cara,'nariz')
    assert np.all(w[[0,1,2,6,7,10]]==1.), w
    assert np.all(w[[3,4,5,8,9]]==0.), w
    assert 0.<w[11]<1.
    delta=BR.plan(cara,'nariz','',1.)
    base=AO._co(cara.data.shape_keys.reference_key)
    after=AO._co(pose)+delta
    np.testing.assert_allclose(after[[0,1,2,6,7,10]],base[[0,1,2,6,7,10]],atol=escala*1e-6)
    np.testing.assert_array_equal(after[[3,4,5,8,9]],AO._co(pose)[[3,4,5,8,9]])
print('BASE_NARIZ_OK: puente, punta, aletas, borde inferior, transición, tres escalas y regiones vecinas intactas')
