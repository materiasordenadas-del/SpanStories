"""Basal no resta una expresión fuera de su máscara ni introduce un corte binario."""
import bpy,sys,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'assets'))
from rig_labial_bendy.nucleo.facs import ajustes_ojos as AO,retoque_parpados as RP
originales=AO.plan,AO.BI.control,RP._mezcla,RP._conectar
try:
    for escala in (.001,1.,20.):
        me=bpy.data.meshes.new('prueba');me.from_pydata([(0,0,0),(escala,0,0),(0,escala,0),(escala,escala,0)],[],[(0,1,2),(1,3,2)])
        c=bpy.data.objects.new('personaje',me);bpy.context.collection.objects.link(c)
        c.shape_key_add(name='Basis');ctrl=bpy.data.objects.new('control',None);bpy.context.collection.objects.link(ctrl)
        base=AO._co(c.data.shape_keys.reference_key)
        # Tres bases suman una máscara continua 1, .5, 0, 0.
        shapes={}
        for lado in ('L','R'):
            for parte in ('sup','inf'):
                for i in (1,2,3):
                    d=np.zeros((4,3));d[:,2]=np.array([1.,.5,0.,0.])*escala if i==1 else 0.
                    shapes[f'aj_parpado_{parte}_{i}_{lado}_arriba']=d
        AO.plan=lambda cara:(shapes,{})
        AO.BI.control=lambda cara:ctrl
        RP._mezcla=lambda cara,n:base+.1*escala
        RP._conectar=lambda *args:None
        n=AO.basal(c,'expresion','inf',['R'])[0]
        delta=AO._co(c.data.shape_keys.key_blocks[n])-base
        np.testing.assert_allclose(delta[:2],np.array([[-.1]*3,[-.05]*3])*escala,atol=escala*1e-6)
        assert np.array_equal(delta[2:],np.zeros((2,3)))
        assert n in __import__('json').loads(c['rlb_basales_suaves'])
        assert AO.suavizar_basales(c,aplicar=True)['keys']==[]
finally:
    AO.plan,AO.BI.control,RP._mezcla,RP._conectar=originales
print('BASAL_SUAVE_OK: tres escalas, transicion, piel exterior intacta e idempotencia')
