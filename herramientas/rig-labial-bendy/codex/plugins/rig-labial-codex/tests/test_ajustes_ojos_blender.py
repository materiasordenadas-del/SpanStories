"""Regresión de puntos y basal ocular en malla sintética, sin abrir personajes."""
import bpy
import importlib
import json
from pathlib import Path
import sys
import types
import numpy as np

ROOT = Path(__file__).parents[1]
pkg = types.ModuleType('rlb_ojos_test')
pkg.__path__ = [str(ROOT / 'assets/rig_labial_bendy/nucleo/facs')]
sys.modules[pkg.__name__] = pkg
AO = importlib.import_module(pkg.__name__ + '.ajustes_ojos')
AJ = importlib.import_module(pkg.__name__ + '.ajustes')
RP = importlib.import_module(pkg.__name__ + '.retoque_parpados')
C = importlib.import_module(pkg.__name__ + '.construir')


def caso(scale):
    verts, faces, bordes, domains = [], [], {}, {}
    for s, cx in (('R', -.025), ('L', .025)):
        domains[s] = []
        for lab, sg in (('sup', 1.), ('inf', -1.)):
            inicio = len(verts)
            for j in range(3):
                for i, x in enumerate(np.linspace(-.01, .01, 11)):
                    verts.append((scale * (cx + x), scale * (-.035 + .003*(x/.01)**2), scale * (sg*(.006-.003*(x/.01)**2+j*.001))))
                    domains[s].append(len(verts)-1)
            bordes[lab+'_'+s] = list(range(inicio, inicio+11))
            for j in range(2):
                for i in range(10):
                    a = inicio+j*11+i
                    faces.append((a, a+1, a+12, a+11))
    verts.append((0., 0., -.2*scale))
    me=bpy.data.meshes.new('piel_test'); me.from_pydata(verts, [], faces); me.update()
    cara=bpy.data.objects.new('Ojos_test_'+str(scale), me); bpy.context.scene.collection.objects.link(cara)
    cara.shape_key_add(name='Basis')
    ctrl=bpy.data.objects.new(cara.name+'_Cara_Control',None); bpy.context.scene.collection.objects.link(ctrl)
    cara['rlb_borde_parpado']=json.dumps(bordes)
    B=np.array(verts)
    for s, ids in domains.items():
        D=np.zeros_like(B)
        for i in ids:
            D[i,2] = -np.sign(B[i,2]) * .004*scale
        C.poner_key(cara,'eyeBlink_'+s,D,.45)
    lip=np.zeros_like(B); lip[-1,0]=.001*scale
    C.poner_key(cara,'aj_user_boca',lip,.25,(-1.,1.))
    original={k.name:AO._co(k).copy() for k in me.shape_keys.key_blocks}
    shapes, anchors=AO.plan(cara)
    assert len(shapes)==36 and len(anchors)==12
    for p,a in anchors.items():
        s=p[-1]; lab=p.split('_')[1]
        assert a in bordes[lab+'_'+s]
        par=AJ.lado_par(p,cara)[1]
        assert AJ.lado_par(par,cara)[1]==p
        assert abs(B[a,0]+B[anchors[par],0]) < 1e-10
        for d in AO.DIRECCIONES:
            delta=shapes['aj_'+p+'_'+d]
            outside=np.ones(len(B),bool); outside[domains[s]]=False
            assert not np.any(delta[outside])
            other=domains[s][33:] if lab=='sup' else domains[s][:33]
            assert not np.any(delta[other])
            assert np.linalg.norm(delta[a])>0
    assert len(AO.asegurar(cara))==36
    assert AO.asegurar(cara)==[]
    for n,coords in original.items():
        assert np.array_equal(AO._co(me.shape_keys.key_blocks[n]),coords)
    p='parpado_sup_2_R'; prop='v_aj_'+p+'_arriba'
    ctrl[prop]=.5;ctrl.update_tag();bpy.context.view_layer.update()
    before=RP._mezcla(cara,'')
    n=AO.basal(cara,'prueba_A','sup',('R',),.6)[0]
    ctrl['v_'+n]=.6;ctrl.update_tag();bpy.context.view_layer.update()
    after=RP._mezcla(cara,'')
    upper=np.array(domains['R'][:33]);other=np.ones(len(B),bool);other[upper]=False
    assert np.max(np.abs(after[upper]-B[upper]))<2e-8
    assert np.max(np.abs(after[other]-before[other]))<2e-8
    assert AO.basal_de(n,'prueba_A') and not AO.basal_de(n,'prueba_B')
    oldco=AO._co(me.shape_keys.key_blocks[n]).copy()
    n2=AO.basal(cara,'prueba_A','sup',('R',),.6)[0]
    assert n2!=n and np.array_equal(oldco,AO._co(me.shape_keys.key_blocks[n]))
    assert np.array_equal(AO._co(me.shape_keys.reference_key),original['Basis'])
    return {'escala':scale,'puntos':len(anchors),'canales':len(shapes),'basal_error':float(np.abs(after[upper]-B[upper]).max()),'resto_conservado':True}


report={'casos':[caso(scale) for scale in (.5,1.,2.)]}
print('RLB_OJOS_TEST_OK '+json.dumps(report))
