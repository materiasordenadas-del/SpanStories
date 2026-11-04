"""Geometría del reparto vertical, sin escena ni solver de cierre."""
import importlib
import sys
import types
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parents[1]
pkg = types.ModuleType('rlb_aporte_test')
pkg.__path__ = [str(ROOT / 'assets/rig_labial_bendy/nucleo/facs')]
sys.modules[pkg.__name__] = pkg
M = importlib.import_module(pkg.__name__ + '.parpados_aislados')

for escala in (.001, 1., 20.):
    for espejo in (-1., 1.):
        # Dos arcos asimétricos y con cantidades diferentes de muestras.
        xu=np.array([-2.,-1.,0.,1.,2.]); xl=np.array([-2.,-.5,.5,2.])
        zu=np.array([0.,2.,3.,2.,0.]); zl=np.array([0.,-1.5,-1.,0.])
        sup=np.column_stack((xu*escala*espejo,zu*escala))
        inf=np.column_stack((xl*escala*espejo,zl*escala))
        x=np.array([-3.,-.7,0.,.6,3.])*escala*espejo
        mask,z=M._contacto_vertical(x,sup,inf,.85)
        assert mask.tolist()==[False,True,True,True,False]
        us=sorted(sup.tolist()); ls=sorted(inf.tolist())
        upper=np.interp(x[mask],np.array(us)[:,0],np.array(us)[:,1])
        lower=np.interp(x[mask],np.array(ls)[:,0],np.array(ls)[:,1])
        np.testing.assert_allclose(z,lower+.15*(upper-lower),atol=1e-12*max(1.,escala))
        # Muestreo de arcos abiertos y cerrados, con vértices desiguales.
        base=np.vstack((np.column_stack((sup[:,0],np.zeros(len(sup)),sup[:,1])),
                        np.column_stack((inf[:,0],np.zeros(len(inf)),inf[:,1]))))
        U=np.arange(len(sup)); L=np.arange(len(sup),len(base)); posed=base.copy()
        for ids in (U,L):
            _, zz=M._contacto_vertical(base[ids,0],sup,inf,.85)
            posed[ids,2]=zz
        report=M._medir_aporte_vertical(base,posed,U,L)
        def centro(ids, points):
            order=np.argsort(points[ids,0]); p=points[ids][order]
            return np.interp(0.,p[:,0],p[:,2])
        du=centro(U,base)-centro(U,posed); dl=centro(L,posed)-centro(L,base)
        assert abs(report['centro']-du/(du+dl))<1e-12
        assert report['muestras']==61
        # Tras una corrección externa la medición debe reportar el cambio real.
        posed[U,2] += .2*escala
        revised=M._medir_aporte_vertical(base,posed,U,L)
        assert revised['centro'] < report['centro']

for bad in (-.01,1.01,float('nan')):
    try:
        M._contacto_vertical(np.array([0.]),[[-1,1],[1,1]],[[-1,0],[1,0]],bad)
        raise AssertionError('Proporción inválida aceptada')
    except ValueError: pass

# Integración: el cálculo de Superficie usa X relativa al centro del ojo,
# mientras las muestras de piel están en coordenadas del objeto.
# Un desplazamiento de 10 unidades detecta la mezcla de ambos marcos.
for centro_x in (-10., 10.):
    q=np.array([[-.4,-1.,.4],[0.,-1.,.4],[.4,-1.,.4],
                [-.4,-1.,-.4],[0.,-1.,-.4],[.4,-1.,-.4]])
    ojo=types.SimpleNamespace(c=np.array([centro_x,0.,0.]), r=1.)
    puntos=q+ojo.c
    grafo=types.SimpleNamespace(E=np.empty((0,2),dtype=int),w=np.empty(0))
    K=types.SimpleNamespace(p=puntos,g=grafo)
    g=M.Superficie.__new__(M.Superficie)
    g.K=K; g.o=ojo
    g.P={'cierre':.45,'aporte_superior':.85,'holgura':0.,'iters':0,
         'solape_angular':0.,'relieve_contacto':0.,'retroceso_contacto':0.,
         'contacto_extremos':True}
    g.x=q[:,0]; g.th=np.arctan2(q[:,2],-q[:,1]); g.rad=np.linalg.norm(q,axis=1)
    g.top=np.full(6,np.arctan(.4)); g.bot=-g.top
    g.rs=np.full(6,1.2); g.ri=np.full(6,1.2)
    g.U=np.array([0,1,2]); g.L=np.array([3,4,5]); g.pin=np.arange(6)
    g.upper=np.array([True]*3+[False]*3); g.reg=np.ones(6,dtype=bool)
    g.reye=lambda p: np.zeros(len(p))
    class LapVacio:
        def __init__(self,free,E,w):
            self.F=np.flatnonzero(free); self.loc=np.zeros(len(free),dtype=int)
            self.diag=np.ones(len(self.F))
        def resolver(self,pen,rhs): return np.zeros((len(self.F),3))
    anterior=M.PA.Laplaciano; M.PA.Laplaciano=LapVacio
    try: cerrado=g.resolver(1.)
    finally: M.PA.Laplaciano=anterior
    informe=M._medir_aporte_vertical(puntos,cerrado,g.U,g.L)
    assert abs(informe['centro']-.85)<1e-8, (centro_x,informe)
    # Reproducir la llamada antigua con X relativa debe fallar este caso.
    anterior_contacto=M._contacto_vertical; anterior_lap=M.PA.Laplaciano
    M._contacto_vertical=lambda x,u,l,a: anterior_contacto(x-centro_x,u,l,a)
    M.PA.Laplaciano=LapVacio
    try:
        try: g.resolver(1.)
        except ValueError: pass
        else: raise AssertionError('No se detectó la mezcla de marcos')
    finally:
        M._contacto_vertical=anterior_contacto; M.PA.Laplaciano=anterior_lap

assert M._parametros_proporcion(None)['aporte_superior']==.85
assert M._parametros_proporcion({'limitar_uv':True})['aporte_superior']==.85
assert 'aporte_superior' not in M._parametros_proporcion({'cierre':.45})
assert M._parametros_proporcion({'cierre':.45,'aporte_superior':.9})['aporte_superior']==.9
print('APORTE_VERTICAL_OK')
