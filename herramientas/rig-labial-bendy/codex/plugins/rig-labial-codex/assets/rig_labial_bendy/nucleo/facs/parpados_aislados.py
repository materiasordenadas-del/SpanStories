"""Párpados aislados: superficie explícita, sin boca, densificación ni cambio del Basis."""
from types import SimpleNamespace
import math
import json
import bpy
import numpy as np
from mathutils import Vector,Euler
from mathutils.bvhtree import BVHTree
from .grafo import Grafo, ss
from . import parpados_arap as PA


def contexto(cara, semillas_uv, expandir=True):
    from .. import inventario_uv
    me = cara.data
    if cara.type != 'MESH' or cara.mode != 'OBJECT':
        raise ValueError('Se requiere una malla en modo Object')
    if me.users != 1:
        raise ValueError('La malla tiene varios usuarios; no se modifica automáticamente')
    if not me.uv_layers.active:
        raise ValueError('Faltan UV para identificar explícitamente la superficie')
    B = np.empty(len(me.vertices)*3)
    (me.shape_keys.reference_key.data if me.shape_keys else me.vertices).foreach_get('co',B)
    B = B.reshape(-1,3)
    uv = me.uv_layers.active
    faces = [tuple(p.vertices) for p in me.polygons]
    edges = [tuple(e.vertices) for e in me.edges]
    inv = inventario_uv.inventariar(B,edges,faces,[[uv.data[l].uv[:] for l in p.loop_indices] for p in me.polygons])
    selected = set()
    for seed in semillas_uv:
        found = next((i for i in inv['islas_uv'] if int(seed) in i['face_indices']),None)
        if found is None: raise ValueError(f'Semilla UV inexistente: {seed}')
        selected.update(found['face_indices'])
    if not selected: raise ValueError('Indica las islas UV de piel revisadas')
    # Expandir por aristas compartidas, nunca por vértices sueltos ni proximidad.
    ef = {}
    for fi,vs in enumerate(faces):
        for a,b in zip(vs,vs[1:]+vs[:1]): ef.setdefault(tuple(sorted((a,b))),[]).append(fi)
    stack = list(selected) if expandir else []
    while stack:
        fi = stack.pop(); vs = faces[fi]
        for a,b in zip(vs,vs[1:]+vs[:1]):
            for fj in ef[tuple(sorted((a,b)))]:
                if fj not in selected: selected.add(fj); stack.append(fj)
    # 0.8.3: la cuenca del rig completo (vértices rlb_cuenca, con la UV copiada del borde) no es la piel del personaje:
    # dentro de la región, el cierre no llegaba a tapar el globo (Ichigo: 730/730 rayos visibles)
    ca = me.attributes.get('rlb_cuenca')
    if ca is not None and len(ca.data) == len(B):
        cm = np.zeros(len(B), int); ca.data.foreach_get('value', cm)
        selected = {fi for fi in selected if not cm[list(faces[fi])].any()}
    zone =np.array(sorted({v for fi in selected for v in faces[fi]}),int)
    gi = np.full(len(B),-1,int); gi[zone] = np.arange(len(zone))
    E = np.array(sorted({tuple(sorted((a,b))) for fi in selected for a,b in zip(faces[fi],faces[fi][1:]+faces[fi][:1])}),int)
    me.calc_loop_triangles()
    T = np.array([t.vertices[:] for t in me.loop_triangles if t.polygon_index in selected],int)
    K = SimpleNamespace(obj=cara,P=B,p=B[zone],zona=zone,gi=gi,X=np.array((1.,0,0)),Y=np.array((0.,1,0)),Z=np.array((0.,0,1)),ojos={},skin_faces=selected)
    K.g = Grafo(K.p,gi[E],gi[T])
    K.triangulos = gi[T]
    # Una costura UV puede compartir vértices con pelo o cejas: limitar caras
    # no basta para conservar las piezas que se apoyan en esos mismos puntos.
    foreign={v for fi,vs in enumerate(faces) if fi not in selected for v in vs} if not expandir else set()
    K.protegidos=np.array(sorted({int(gi[v]) for v in foreign if gi[v]>=0}),dtype=int)
    O = {}
    for s in ('L','R'):
        piv = bpy.data.objects.get(f'{cara.name}_OjoPivote_{s}')
        if piv is None or not any(o.type=='MESH' for o in piv.children_recursive):
            raise ValueError(f'Faltan las piezas reales del ojo {s}; un pivote vacío no es un ojo')
        glob = next((o for o in piv.children_recursive if o.type=='MESH' and 'Globo' in o.name),None)
        if glob is None: raise ValueError(f'Falta el globo {s}')
        M = cara.matrix_world.inverted()
        c = np.array((M@piv.matrix_world.translation)[:])
        r = max(np.linalg.norm(np.array((M@glob.matrix_world@v.co)[:])-c) for v in glob.data.vertices)
        # Esta ruta solo usa centro, radio y lado. El Ojo FACS buscaba además el
        # borde sobre la esfera y fallaba si la abertura no toca el globo
        # (ojos remetidos, anillo interior retirado); los bordes salen de Cierre.
        K.ojos[s]=(c,r); O[s]=SimpleNamespace(K=K,lado=s,c=c,r=r)
    return K,O


def _bordes_marcados(cara,K,lado):
    """0.8.5: bordes del párpado marcados a mano (pasos.marcar_borde_parpado), en índices de la zona; None sin marcas."""
    raw=cara.get('rlb_borde_parpado')
    if not raw:return None
    d=json.loads(raw);su,inf=d.get(f'sup_{lado}'),d.get(f'inf_{lado}')
    if not su or not inf:return None
    n=len(K.gi);U=K.gi[[v for v in su if v<n]];L=K.gi[[v for v in inf if v<n]]
    U,L=U[U>=0],L[L>=0];common=np.intersect1d(U,L)
    U,L=np.setdiff1d(U,common),np.setdiff1d(L,common)
    if min(len(U),len(L))<4:
        raise ValueError(f'Ojo {lado}: los bordes marcados a mano quedan fuera de la piel del párpado (islas UV)')
    return U,L


def _arco_frontal(puntos):
    a = np.asarray(puntos, dtype=float)
    if a.ndim != 2 or a.shape[1] != 2 or len(a) < 2 or not np.isfinite(a).all():
        raise ValueError('Muestras del arco palpebral inválidas')
    xs = np.unique(a[:, 0])
    if len(xs) < 2: raise ValueError('El arco no tiene extensión horizontal')
    return xs, np.array([np.median(a[a[:, 0] == xi, 1]) for xi in xs])


def _contacto_vertical(x, puntos_sup, puntos_inf, aporte_superior):
    """Z de contacto sobre muestras frontales, únicamente en el dominio común.

    Cada arco contiene pares (X,Z). X repetidas se agrupan por mediana; no se
    extrapola más allá del intervalo compartido de ambos arcos.
    """
    aporte = float(aporte_superior)
    if not np.isfinite(aporte) or not 0. <= aporte <= 1.:
        raise ValueError('El aporte superior debe estar entre 0 y 1')
    xu, zu = _arco_frontal(puntos_sup); xl, zl = _arco_frontal(puntos_inf)
    lo, hi = max(xu[0], xl[0]), min(xu[-1], xl[-1])
    if hi <= lo: raise ValueError('Los arcos no tienen intervalo horizontal común')
    x = np.asarray(x, dtype=float); dentro = (x >= lo) & (x <= hi)
    if not np.isfinite(x).all() or not dentro.any():
        raise ValueError('No hay muestras en el intervalo común de los arcos')
    zs = np.interp(x[dentro], xu, zu); zi = np.interp(x[dentro], xl, zl)
    if np.any(zs < zi - 1e-10): raise ValueError('Los arcos superior e inferior se cruzan')
    return dentro, zi + (1. - aporte) * (zs - zi)


def _medir_aporte_vertical(base, posicion, superior, inferior, extremos=()):
    """Mide el reparto realizado a X comunes, incluido el resultado de Seguridad."""
    sup=np.unique(np.r_[superior,extremos]).astype(int)
    inf=np.unique(np.r_[inferior,extremos]).astype(int)
    arcos=[_arco_frontal(p[ids][:,(0,2)]) for p,ids in
           ((base,sup),(base,inf),(posicion,sup),(posicion,inf))]
    lo=max(x[0] for x,_ in arcos); hi=min(x[-1] for x,_ in arcos)
    if hi<=lo: raise RuntimeError('No hay dominio frontal común para medir el aporte')
    muestras=np.linspace(lo+.2*(hi-lo),lo+.8*(hi-lo),61)
    sup0,inf0,sup1,inf1=[np.interp(muestras,x,z) for x,z in arcos]
    arriba=sup0-sup1; abajo=inf1-inf0; recorrido=arriba+abajo
    tolerancia=max(np.max(np.abs(sup0-inf0))*1e-6,1e-12)
    valido=(sup0-inf0>tolerancia)&(recorrido>tolerancia)
    if not valido[30] or not valido.any(): raise RuntimeError('No hay recorrido medible en el centro del párpado')
    ratio=arriba[valido]/recorrido[valido]
    return {'centro':float(arriba[30]/recorrido[30]), 'media_banda_20_80':float(np.mean(ratio)),
            'min_banda_20_80':float(np.min(ratio)), 'max_banda_20_80':float(np.max(ratio)),
            'muestras':int(valido.sum()), 'abertura_central_inicial':float(sup0[30]-inf0[30]),
            'abertura_central_final':float(sup1[30]-inf1[30])}


class Superficie:
    def __init__(self,cara,K,o,param=None):
        self.K,self.o=K,o
        self.P={'alcance':1.4,'cierre':.25,'holgura':.0004,'abrir_sup':.16,'abrir_inf':.04,'iters':50,
                'solape_angular':.015,'relieve_contacto':.00025,'retroceso_contacto':.00015,'contacto_extremos':True}
        if param: self.P.update(param)
        base=PA.Cierre(cara,K,o)
        self.reye=base.reye
        q=K.p-o.c;self.x=q[:,0];self.th=np.arctan2(q[:,2],-q[:,1]);self.rad=np.linalg.norm(q,axis=1)
        self.protegidos=np.array([],dtype=int)
        if self.P.get('limitar_uv') and self.P.get('contorno')!='muestreo_superficie':
            self._contorno_cerrado(cara)
            self.protegidos=np.union1d(self.protegidos,K.protegidos).astype(int)
            self.U=np.setdiff1d(self.U,self.protegidos);self.L=np.setdiff1d(self.L,self.protegidos)
            self.pin=np.unique(np.r_[self.U,self.L]);self.upper=np.isin(self.pin,self.U)
            self.reg[self.protegidos]=False
            return
        self.U,self.L=base.U,base.L
        # Las cadenas por proximidad pueden incluir una segunda fila del reborde.
        # Usar las aristas abiertas de la piel cerca de la abertura identificada.
        from collections import Counter
        counts=Counter()
        for fi in K.skin_faces:
            vs=list(cara.data.polygons[fi].vertices)
            for a,b in zip(vs,vs[1:]+vs[:1]):counts[tuple(sorted((a,b)))]+=1
        boundary=np.unique([v for e,n in counts.items() if n==1 for v in e]).astype(int)
        ids=K.gi[boundary];q=K.p[ids]-o.c
        ids=ids[(np.linalg.norm(q,axis=1)<1.6*o.r)&(q[:,1]<.1*o.r)
                &(np.minimum(base.dU[ids],base.dL[ids])<.35*o.r)]
        q=K.p[ids]-o.c;th=np.arctan2(q[:,2],-q[:,1])
        split=.5*(np.polyval(base.fu,q[:,0])+np.polyval(base.fl,q[:,0]))
        U,L=ids[th>=split],ids[th<split]
        if min(len(U),len(L))>=4:self.U,self.L=U,L
        self.bordes='automaticos'
        man=_bordes_marcados(cara,K,o.lado)
        if man is not None:self.U,self.L=man;self.bordes='marcados'
        self.dU,self.dL=K.g.dijkstra(self.U),K.g.dijkstra(self.L)
        self.reye=base.reye
        q=K.p-o.c; self.x=q[:,0]; self.th=np.arctan2(q[:,2],-q[:,1]); self.rad=np.linalg.norm(q,axis=1)
        a=max(self.x[self.U].min(),self.x[self.L].min()); b=min(self.x[self.U].max(),self.x[self.L].max())
        if b-a<.3*o.r: raise ValueError('Los bordes no cubren la abertura ocular')
        self.xn=(self.x-(a+b)/2)/((b-a)/2)
        def fit(ids,v,degree):
            return np.polyval(np.polyfit(self.xn[ids],v[ids],min(degree,len(ids)-1)),np.clip(self.xn,-1,1))
        self.top,self.bot=fit(self.U,self.th,4),fit(self.L,self.th,4)
        self.rs,self.ri=fit(self.U,self.rad,2),fit(self.L,self.rad,2)
        self.pin=np.unique(np.r_[self.U,self.L]); self.upper=np.isin(self.pin,self.U)
        self.reg=(np.minimum(self.dU,self.dL)<self.P['alcance']*o.r)&(self.rad<2.1*o.r)&(q[:,1]<.1*o.r)
        self.reg[self.pin]=True
        if self.P.get('transporte')=='espacial':
            self.U,self.L=(K.gi[np.asarray(ids,int)] for ids in base.bordes)
            if man is not None:self.U,self.L=man
            common=np.intersect1d(self.U,self.L)
            self.U,self.L=np.setdiff1d(self.U,common),np.setdiff1d(self.L,common)
            if min(len(self.U),len(self.L))<4:raise ValueError('Faltan muestras del borde ocular')
            self.dU,self.dL=K.g.dijkstra(self.U),K.g.dijkstra(self.L)
            a=max(self.x[self.U].min(),self.x[self.L].min());b=min(self.x[self.U].max(),self.x[self.L].max())
            if b-a<.3*o.r:raise ValueError('Los bordes no cubren la abertura ocular')
            self.xn=(self.x-(a+b)/2)/((b-a)/2)
            self.top,self.bot=fit(self.U,self.th,4),fit(self.L,self.th,4)
            self.pin=np.unique(np.r_[self.U,self.L]);self.upper=np.isin(self.pin,self.U)
            self.reg=(self.rad<2*o.r)&(q[:,1]<.2*o.r)
        if self.P.get('limitar_uv'):
            self.protegidos=K.protegidos
            self.U=np.setdiff1d(self.U,self.protegidos);self.L=np.setdiff1d(self.L,self.protegidos)
            self.pin=np.unique(np.r_[self.U,self.L]);self.upper=np.isin(self.pin,self.U)
            self.reg[self.protegidos]=False

    def _contorno_cerrado(self,cara):
        """Separar los dos arcos por conectividad, sin una clasificación angular."""
        from collections import Counter,defaultdict
        K,o=self.K,self.o;counts=Counter();adj=defaultdict(set)
        for fi in K.skin_faces:
            vs=list(cara.data.polygons[fi].vertices)
            for a,b in zip(vs,vs[1:]+vs[:1]):counts[tuple(sorted((a,b)))]+=1
        for (a,b),n in counts.items():
            if n==1:adj[a].add(b);adj[b].add(a)
        seen=set();candidates=[]
        for vertex in adj:
            if vertex in seen:continue
            todo=[vertex];seen.add(vertex);comp=[]
            while todo:
                a=todo.pop();comp.append(a)
                for b in adj[a]:
                    if b not in seen:seen.add(b);todo.append(b)
            if len(comp)<8 or any(len(adj[i])!=2 for i in comp):continue
            ids=K.gi[comp];Q=K.p[ids];ext=np.ptp(Q,axis=0)
            if ext[0]>3*o.r or np.linalg.norm(Q.mean(0)-o.c)>1.8*o.r:continue
            if np.sign(Q[:,0].mean())!=np.sign(o.c[0]):continue
            candidates.append(comp)
        if len(candidates)!=1:
            raise ValueError(f'Ojo {o.lado}: se requiere un único contorno UV cerrado; encontrados {len(candidates)}')
        comp=candidates[0];order=[comp[0]];previous=None;current=comp[0]
        while True:
            nxt=next(v for v in sorted(adj[current]) if v!=previous)
            if nxt==order[0]:break
            order.append(nxt);previous,current=current,nxt
        ids=K.gi[order];imin=int(np.argmin(self.x[ids]));ids=np.roll(ids,-imin);imax=int(np.argmax(self.x[ids]))
        arc1=ids[:imax+1];arc2=np.r_[ids[imax:],ids[0]]
        U,L=(arc1,arc2) if K.p[arc1,2].mean()>K.p[arc2,2].mean() else (arc2,arc1)
        self.protegidos=np.intersect1d(U,L)
        self.extremos_contacto=self.protegidos.copy()
        self.U,self.L=np.setdiff1d(U,self.protegidos),np.setdiff1d(L,self.protegidos)
        self.dU,self.dL=K.g.dijkstra(self.U),K.g.dijkstra(self.L)
        a,b=self.x[ids].min(),self.x[ids].max();self.xn=(self.x-(a+b)*.5)/((b-a)*.5)
        def fit(samples,values,degree):
            return np.polyval(np.polyfit(self.xn[samples],values[samples],min(degree,len(samples)-1)),np.clip(self.xn,-1,1))
        self.top,self.bot=fit(U,self.th,4),fit(L,self.th,4)
        self.rs,self.ri=fit(U,self.rad,2),fit(L,self.rad,2)
        self.reg=(np.minimum(self.dU,self.dL)<self.P['alcance']*o.r)&(self.rad<2.1*o.r)&((K.p-o.c)[:,1]<.1*o.r)
        self.contorno='ciclo_uv'

    def resolver(self,k=1.,abrir=False):
        K,o,P=self.K,self.o,self.P
        if not 0<=k<=1: raise ValueError('El valor de párpado debe estar entre 0 y 1')
        if k==0: return K.p.copy()
        if P.get('transporte')=='espacial':
            if 'aporte_superior' in P: raise RuntimeError('El reparto vertical no está implementado para transporte espacial')
            return self._espacial(k,abrir)
        pin=self.pin
        if abrir:
            th=self.th[pin]+np.where(self.upper,P['abrir_sup'],-P['abrir_inf'])*(self.top-self.bot)[pin]*k
            rad=self.rad[pin]
        else:
            mid=self.bot+P['cierre']*(self.top-self.bot)
            extremos=getattr(self,'extremos_contacto',())
            pesos_extremos=[]
            # Calcular el radio usando la trayectoria anterior; la opción nueva
            # sustituye luego su altura por la interpolada de los arcos reales.
            probe=o.c+PA.de_cil(self.x,mid,np.sqrt(np.maximum(((self.rs+self.ri)*.5)**2-self.x**2,1e-12)))
            rc=np.maximum((self.rs+self.ri)*.5,self.reye(probe)+P['holgura'])
            if 'aporte_superior' in P:
                su=np.unique(np.r_[self.U,extremos]).astype(int)
                inf=np.unique(np.r_[self.L,extremos]).astype(int)
                mask,z=_contacto_vertical(K.p[:,0],K.p[su][:,(0,2)],K.p[inf][:,(0,2)],P['aporte_superior'])
                if P.get('contacto_vertical_suave',True):
                    # Los dos bordes pueden tener densidades muy distintas.
                    # Una curva suave evita trasladar sus quiebres discretos
                    # a los objetivos del otro párpado.
                    xu,_=_arco_frontal(K.p[su][:,(0,2)])
                    xi,_=_arco_frontal(K.p[inf][:,(0,2)])
                    lo,hi=max(xu[0],xi[0]),min(xu[-1],xi[-1])
                    muestra=np.linspace(lo,hi,81);centro=.5*(lo+hi);semiancho=.5*(hi-lo)
                    _,altura=_contacto_vertical(muestra,K.p[su][:,(0,2)],K.p[inf][:,(0,2)],P['aporte_superior'])
                    curva=np.polyfit((muestra-centro)/semiancho,altura,4)
                    z=np.polyval(curva,(K.p[mask,0]-centro)/semiancho)
                zr=z-o.c[2]
                # Un radio insuficiente no representa esa Z en el cilindro.
                # Ampliarlo lo mínimo posible mantiene la proporción proyectada.
                rc[mask]=np.maximum(rc[mask],np.sqrt(self.x[mask]**2+zr**2)+1e-10)
                rho=np.sqrt(np.maximum(rc[mask]**2-self.x[mask]**2,1e-20))
                mid[mask]=np.arcsin(np.clip(zr/rho,-1.,1.))
            if P.get('contacto_extremos') and len(extremos)==2:
                # El contacto debe llegar a los rabillos inmóviles. Una curva
                # ajustada por mínimos cuadrados no interpola esos extremos y
                # deja una cuña al subdividir dos arcos con muestras distintas.
                izquierda,derecha=sorted(extremos,key=lambda i:self.x[i])
                ancho=self.x[derecha]-self.x[izquierda]
                if ancho>1e-12:
                    for extremo,signo in ((izquierda,1.),(derecha,-1.)):
                        u=np.clip(signo*(self.x-self.x[extremo])/(.25*ancho),0.,1.)
                        peso=1.-u*u*(3.-2.*u)
                        mid=mid+(self.th[extremo]-mid[extremo])*peso
                        pesos_extremos.append((extremo,peso))
            # Una sola curva de contacto; sin banda rígida ni compresión de filas vecinas.
            if 'aporte_superior' not in P:
                # Conservar exactamente el orden de cálculo heredado.
                probe=o.c+PA.de_cil(self.x,mid,np.sqrt(np.maximum(((self.rs+self.ri)*.5)**2-self.x**2,1e-12)))
                rc=np.maximum((self.rs+self.ri)*.5,self.reye(probe)+P['holgura'])
            for extremo,peso in pesos_extremos:
                rc=rc+(self.rad[extremo]-rc[extremo])*peso
            th=(1-k)*self.th[pin]+k*mid[pin]
            rad=(1-k)*self.rad[pin]+k*rc[pin]
            # Contacto con profundidad: dos discretizaciones distintas de una
            # misma curva no sellan exactamente al proyectarse. El labio superior
            # cubre ligeramente al inferior, sin aplastar filas ni cruzar caras.
            th+=np.where(self.upper,-P['solape_angular'],P['solape_angular'])*k**4
            rad+=np.where(self.upper,P['relieve_contacto'],-P['retroceso_contacto'])*k**4
        target=o.c+PA.de_cil(self.x[pin],th,np.sqrt(np.maximum(rad**2-self.x[pin]**2,1e-12)))
        fixed=np.zeros(len(K.p),bool);fixed[pin]=True
        free=self.reg&~fixed
        E,w=K.g.E,K.g.w; mask=self.reg[E].any(1);E,w=E[mask],w[mask]
        lap=PA.Laplaciano(free,E,w);F=lap.F
        X=K.p.copy();X[pin]=target
        def boundary(values):
            out=np.zeros((len(F),3))
            for a,b in ((E[:,0],E[:,1]),(E[:,1],E[:,0])):
                m=free[a]&~free[b]
                if m.any():out+=PA._acum(lap.loc[a[m]],w[m,None]*values[b[m]],len(F))
            return out
        X[F]=K.p[F]+lap.resolver(np.zeros(len(F)),boundary(X-K.p))
        const=boundary(X);e0=K.p[E[:,0]]-K.p[E[:,1]]
        pen=np.zeros(len(F));tgt=np.zeros((len(F),3))
        clear=np.clip(self.rad-self.reye(K.p),0,P['holgura'])
        for _ in range(P['iters']):
            e1=X[E[:,0]]-X[E[:,1]]
            outer=w[:,None,None]*e0[:,:,None]*e1[:,None,:]
            cov=PA._acum(E[:,0],outer,len(K.p))+PA._acum(E[:,1],outer,len(K.p))
            u,_,vt=np.linalg.svd(cov);rot=vt.transpose(0,2,1)@u.transpose(0,2,1)
            neg=np.linalg.det(rot)<0;vt[neg,2,:]*=-1
            rot[neg]=vt[neg].transpose(0,2,1)@u[neg].transpose(0,2,1)
            re=np.einsum('nij,nj->ni',.5*(rot[E[:,0]]+rot[E[:,1]]),e0)*w[:,None]
            rhs=PA._acum(E[:,0],re,len(K.p))-PA._acum(E[:,1],re,len(K.p))
            X[F]=lap.resolver(pen,rhs[F]+const+pen[:,None]*tgt)
            d=np.linalg.norm(X[F]-o.c,axis=1);rmin=self.reye(X[F])+clear[F]
            bad=(self.rad[F]>o.r-.0002)&(d<rmin)
            pen=np.where(bad|(pen>0),50*np.median(lap.diag),0)
            proj=o.c+(X[F]-o.c)*(np.maximum(d,rmin)/np.maximum(d,1e-12))[:,None]
            tgt=np.where((pen>0)[:,None],proj,tgt);X[F[bad]]=proj[bad]
        if not np.isfinite(X).all(): raise RuntimeError('La solución contiene coordenadas no finitas')
        return X


    def _espacial(self,k,abrir):
        # Un campo angular común evita que capas vecinas recorran trayectorias
        # incompatibles por sus diferentes distancias sobre el grafo de piel.
        bot=self.bot;gap=np.maximum(self.top-bot,.03);top=np.maximum(self.top,bot+.03)
        reach=.8;mid=bot+self.P['cierre']*gap
        if abrir:low=bot-.04*gap*k;high=top+.16*gap*k
        else:low=bot*(1-k)+(mid+.0075)*k;high=top*(1-k)+(mid-.0075)*k
        t=self.th;A=bot-reach;D=top+reach
        mapped=np.where(t<bot,A+(t-A)*(low-A)/reach,
                        np.where(t<=top,low+(t-bot)*(high-low)/gap,high+(t-top)*(D-high)/reach))
        mapped=np.where((t<=A)|(t>=D),t,mapped)
        weight=(1-ss(1.15,1.9,self.rad/self.o.r))*(1-ss(1.,1.5,abs(self.xn)))
        angle=t+weight*(mapped-t);rank=np.clip((t-bot)/gap,0,1)
        stagger=0 if abrir else (.0006*rank-.0004*(1-rank)+.0004)*k**4
        radius=self.rad+weight*stagger
        X=self.o.c+PA.de_cil(self.x,angle,np.sqrt(np.maximum(radius*radius-self.x*self.x,1e-12)))
        if self.P.get('limitar_uv'):X[~self.reg]=self.K.p[~self.reg]
        return X


def _parametros_proporcion(param):
    params=dict(param or {})
    if 'aporte_superior' not in params and 'cierre' not in params:
        params['aporte_superior']=.85
    return params


def calcular(cara,semillas_uv,param=None):
    # Una llamada nueva sin parámetros obtiene el reparto frontal 85/15.
    # Un diccionario existente, incluido {}, conserva la semántica heredada.
    params=_parametros_proporcion(param)
    if params.get('transporte') is not None:return _calcular(cara,semillas_uv,params)
    contours=[params.get('contorno')]
    if params.get('limitar_uv') and params.get('contorno') is None:contours.append('muestreo_superficie')
    errors=[]
    # Conservar el método anterior como alternativa para otras topologías.
    # Cada combinación debe superar las mismas validaciones antes de escribir.
    for transport in ('superficie','espacial'):
        for contour in contours:
            attempt=dict(params,transporte=transport)
            if contour is not None:attempt['contorno']=contour
            try:
                K,keys,info=_calcular(cara,semillas_uv,attempt)
            except RuntimeError as error:
                errors.append(f'{transport}/{contour or "automatico"}: {error}')
                continue
            if errors:
                for report in info.values():report['alternativa_por']=' | '.join(errors)
            return K,keys,info
    raise RuntimeError('No se obtuvo un rig válido. '+' | '.join(errors))


def _calcular(cara,semillas_uv,param=None):
    from .parpados_seguridad import Seguridad
    K,O=contexto(cara,semillas_uv,expandir=not (param or {}).get('limitar_uv',False))
    espacio={s:_espacio_ojos(cara,K,o) for s,o in O.items()}
    if any(r['desplazamiento_recomendado']>0 for r in espacio.values()):
        raise ValueError('El ojo atraviesa la piel en miradas de prueba. Revisa ajustar_espacio_ojos(..., aplicar=False) antes de crear párpados; no se modificó la malla')
    keys,info={},{}
    evaluadores={}
    for s,o in O.items():
        g=Superficie(cara,K,o,param)
        piv=bpy.data.objects[f'{cara.name}_OjoPivote_{s}'];M=cara.matrix_world.inverted()
        radius=max(np.linalg.norm(np.array((M@ch.matrix_world@v.co)[:])-o.c)
                   for ch in piv.children_recursive if ch.type=='MESH' for v in ch.data.vertices)
        safe=Seguridad(K,o,g.reg,radius)
        safe.establecer_orden(g)
        full,rf=safe.corregir(g.resolver(1)-K.p)
        half,rh=safe.corregir(g.resolver(.5)-K.p)
        wide,rw=safe.corregir(g.resolver(1,abrir=True)-K.p)
        mid=half-.5*full;nodes=[];opening_nodes=[];reglas={}
        def curva(k,abrir=False,_full=full,_mid=mid,_wide=wide,_nodes=nodes,_opening=opening_nodes):
            delta=k*_wide if abrir else k*_full+max(0.,min(2*k,2*(1-k)))*_mid
            for a,t,b,d in (_opening if abrir else _nodes):
                delta=delta+max(0.,min((k-a)/(t-a),(b-k)/(b-t)))*d
            return delta
        def pose(k,w=0.):
            # Un único grado de abertura: no sumar dos campos incompatibles.
            efectivo=k-.2*w*(1-k)
            return curva(efectivo) if efectivo>=0 else curva(-efectivo/.2,abrir=True)
        def corregir_intermedia(t,actual,abrir):
            # Proyectar primero la trayectoria instalada conserva su continuidad
            # y evita saltar a otro mínimo del solver ARAP en cada muestra.
            try:
                return safe.corregir(actual)[0]
            except RuntimeError:
                try:
                    return safe.corregir(g.resolver(t,abrir=abrir)-K.p)[0]
                except RuntimeError as exc:
                    raise RuntimeError(f'Párpado {s}, recorrido {t:.8g}, abrir={abrir}: {exc}') from exc
        # La intermedia cuadrática no garantiza una trayectoria válida entre poses.
        # Corregir solo los intervalos que fallan; las nuevas keys usan hats exportables.
        for abrir in (False,True):
            for level in range(1 if abrir else 2,7):
                intervals=2**level
                for j in range(1,intervals,2):
                    t=j/intervals;actual=curva(t,abrir);state=safe.medir(actual)
                    if safe.valido(state):continue
                    target=corregir_intermedia(t,actual,abrir)
                    a,b=(j-1)/intervals,(j+1)/intervals;delta=target-actual
                    (opening_nodes if abrir else nodes).append((a,t,b,delta))
                    stem='eyeWide' if abrir else 'eyeBlink'
                    name=f'{stem}_safe_{round(t*1000000):06d}_{s}'
                    D=np.zeros_like(K.P);D[K.zona]=delta;keys[name]=D
                    reglas[name]={'tipo':'wide_hat' if abrir else 'blink_hat','a':a,'t':t,'b':b}
        for name,delta in ((f'eyeBlink_{s}',full),(f'eyeBlink_mid_{s}',half-.5*full),(f'eyeWide_{s}',wide)):
            D=np.zeros_like(K.P);D[K.zona]=delta;keys[name]=D
        for refinement in range(16):
            failed=[]
            for k in np.linspace(0,1,65):
                for w in (0.,.25,.5,.75,1.):
                    m=safe.medir(pose(k,w))
                    if not safe.valido(m):failed.append({'parpadeo':float(k),'apertura':w,**m})
            if not failed:break
            for f in failed:
                effective=f['parpadeo']-.2*f['apertura']*(1-f['parpadeo'])
                opening=effective<0;t=-effective/.2 if opening else effective
                chain=opening_nodes if opening else nodes
                knots=sorted({0.,1.,*([.5] if not opening else []),*(v[1] for v in chain)})
                if any(abs(v-t)<1e-9 for v in knots):continue
                a=max(v for v in knots if v<t);b=min(v for v in knots if v>t)
                actual=curva(t,opening)
                if safe.valido(safe.medir(actual)):continue
                target=corregir_intermedia(t,actual,opening);delta=target-actual
                chain.append((a,t,b,delta));stem='eyeWide' if opening else 'eyeBlink'
                name=f'{stem}_safe_{round(t*1000000):06d}_{s}';D=np.zeros_like(K.P);D[K.zona]=delta;keys[name]=D
                reglas[name]={'tipo':'wide_hat' if opening else 'blink_hat','a':a,'t':t,'b':b}
        info[s]={'transporte':g.P.get('transporte','superficie'),'contorno':getattr(g,'contorno','muestreo_superficie'),'superior':len(g.U),'inferior':len(g.L),'bordes':getattr(g,'bordes','automaticos'),'region':int(g.reg.sum()),'radio_mm':o.r*1000,
                 'seguridad':{'cerrado':rf,'medio':rh,'abierto':rw},'reglas':reglas,
                 'validacion':{'poses':325,'fallos':failed}}
        if failed:
            raise RuntimeError(f'Párpado {s}: {len(failed)} combinaciones no válidas; no se escribió la malla. {failed[:2]}')
        info[s]['miradas']=_validar_miradas(cara,K,o,pose)
        info[s]['cierre_visible']=_validar_cierre(cara,K,o,full)
        if 'aporte_superior' in g.P:
            info[s]['aporte_superior_medido']=_medir_aporte_vertical(
                K.p, K.p+full, g.U, g.L, getattr(g,'extremos_contacto',()))
        evaluadores[s]=(safe,curva)
    conjunta=0
    for a in (-.2,0.,.25,.5,.75,1.):
        for b in (-.2,0.,.25,.5,.75,1.):
            delta=np.zeros_like(K.p)
            for s,v in zip(('L','R'),(a,b)):
                curve=evaluadores[s][1];delta+=curve(v) if v>=0 else curve(-v/.2,True)
            for s,(safe,_) in evaluadores.items():
                state=safe.medir(delta)
                if not safe.valido(state):raise RuntimeError(f'Combinación de ambos ojos no válida: {a}, {b}, {s}, {state}')
            conjunta+=1
    for s in info:info[s]['combinaciones_ambos_ojos']=conjunta
    return K,keys,info


def _validar_cierre(cara,K,o,delta):
    """No confundir ausencia de colisión con cierre efectivo de la abertura."""
    eye=PA.bvh_ojo(cara,o.lado)
    # Las UV delimitan qué se mueve; la oclusión depende del personaje completo.
    # Pelo y cejas conservados pueden tapar zonas de globo ajenas a la cuenca.
    cara.data.calc_loop_triangles()
    triangles=[list(t.vertices) for t in cara.data.loop_triangles]
    posed=K.P.copy();posed[K.zona]+=delta
    reference=BVHTree.FromPolygons([Vector(v) for v in K.P],triangles,all_triangles=True)
    skin=BVHTree.FromPolygons([Vector(v) for v in posed],triangles,all_triangles=True)
    views={}
    for angle in (0,32,-32):
        a=math.radians(angle);direction=Vector((-math.sin(a),math.cos(a),0));horizontal=Vector((math.cos(a),math.sin(a),0))
        total=visible=0
        for x in np.linspace(-.96*o.r,.96*o.r,71):
            for z in np.linspace(-.85*o.r,.85*o.r,65):
                org=Vector(o.c)+horizontal*x+Vector((0,0,z))-direction*(12*o.r)
                eh=eye.ray_cast(org,direction,24*o.r)
                if eh[0] is None:continue
                bh=reference.ray_cast(org,direction,24*o.r)
                if bh[0] is not None and bh[3]<eh[3]-1e-7:continue
                total+=1;hit=skin.ray_cast(org,direction,24*o.r)
                if hit[0] is None or hit[3]>eh[3]+1e-7:visible+=1
        views[str(angle)]={'muestras_reposo':total,'visibles_cerrado':visible}
        if total==0 or visible:raise RuntimeError(f'Cierre {o.lado} incompleto a {angle} grados: {visible}/{total}; no se escribieron keys')
    return views


def _espacio_ojos(cara,K,o,limite=.2,acercar=False):
    piv=bpy.data.objects[f'{cara.name}_OjoPivote_{o.lado}'];M=cara.matrix_world.inverted();verts=[];faces=[]
    for ch in piv.children_recursive:
        if ch.type!='MESH':continue
        offset=len(verts);verts.extend([(M@ch.matrix_world@v.co)[:] for v in ch.data.vertices])
        faces.extend([tuple(offset+i for i in f.vertices) for f in ch.data.polygons])
    V=np.array(verts);skin=BVHTree.FromPolygons([Vector(v) for v in K.p],K.triangulos.tolist(),all_triangles=True)
    rotations=[np.array(Euler((math.radians(x),0,math.radians(z)),'XYZ').to_matrix()) for x in (-12,0,12) for z in (-12,0,12)]
    def fits(shift):
        for R in rotations:
            VV=o.c+(V-o.c)@R.T+np.array((0.,shift,0.))
            eye=BVHTree.FromPolygons([Vector(v) for v in VV],faces)
            if skin.overlap(eye):return False
        return True
    if fits(0.):
        if not acercar:return {'desplazamiento_recomendado':0.,'miradas':9}
        # Ojo hundido respecto a la abertura (piel recortada o editada después de
        # crearlo): avanzar hacia -Y hasta el contacto en las nueve miradas y
        # dejar el mismo margen que al retroceder.
        lo,hi=-limite*o.r,0.
        if fits(lo):return {'desplazamiento_recomendado':lo,'miradas':9,'limite_alcanzado':True}
        for _ in range(12):
            mid=(lo+hi)*.5
            if fits(mid):hi=mid
            else:lo=mid
        return {'desplazamiento_recomendado':min(hi+.04*o.r,0.),'miradas':9,'contacto_medido':lo}
    lo,hi=0.,limite*o.r
    if not fits(hi):raise ValueError(f'Ojo {o.lado}: no cabe en la cuenca con el margen permitido; requiere preparación explícita')
    for _ in range(12):
        mid=(lo+hi)*.5
        if fits(mid):hi=mid
        else:lo=mid
    return {'desplazamiento_recomendado':hi+.04*o.r,'miradas':9,'minimo_medido':hi}


def _validar_miradas(cara,K,o,pose):
    piv=bpy.data.objects[f'{cara.name}_OjoPivote_{o.lado}'];M=cara.matrix_world.inverted();verts=[];faces=[]
    for ch in piv.children_recursive:
        if ch.type!='MESH':continue
        base=len(verts);verts.extend([(M@ch.matrix_world@v.co)[:] for v in ch.data.vertices])
        faces.extend([tuple(base+i for i in f.vertices) for f in ch.data.polygons])
    V=np.array(verts);eyes=[]
    for x in (-12,0,12):
        for z in (-12,0,12):
            R=np.array(Euler((math.radians(x),0,math.radians(z)),'XYZ').to_matrix())
            points=o.c+(V-o.c)@R.T
            eyes.append((x,z,BVHTree.FromPolygons([Vector(v) for v in points],faces)))
    count=0
    for b in np.linspace(0,1,33):
        for w in (0.,.5,1.):
            X=K.p+pose(float(b),w)
            skin=BVHTree.FromPolygons([Vector(v) for v in X],K.triangulos.tolist(),all_triangles=True)
            for x,z,eye in eyes:
                if skin.overlap(eye):raise RuntimeError(f'Ojo {o.lado}: contacto no válido a mirada {x}/{z}, parpadeo {b}, apertura {w}; malla sin modificar')
                count+=1
    return {'combinaciones':count,'fallos':0,'limite_grados':12}


def ajustar_espacio_ojos(cara,semillas_uv,aplicar=False,limite=.2,acercar=False):
    """Preparación explícita: ajustar solo profundidad de los ojos, nunca la piel.
    acercar=True además avanza un ojo que no toca la piel hasta la abertura."""
    if not 0<limite<=1:raise ValueError('El límite de encaje debe estar entre 0 y un radio ocular')
    K,O=contexto(cara,semillas_uv);reports={s:_espacio_ojos(cara,K,o,limite,acercar) for s,o in O.items()}
    if aplicar:
        for s,r in reports.items():
            d=r['desplazamiento_recomendado']
            if d==0:continue
            piv=bpy.data.objects[f'{cara.name}_OjoPivote_{s}']
            world=Vector((cara.matrix_world.to_3x3()@Vector((0,d,0))))
            pivot_world=piv.matrix_world.copy();pivot_world.translation+=world;piv.matrix_world=pivot_world
        bpy.context.view_layer.update()
    return {'ojos':reports,'aplicado':bool(aplicar),'piel_modificada':False}


def aplicar(cara,semillas_uv,param=None,reemplazar=False):
    # Primero calcular todo: una validación fallida no deja keys a medio construir.
    old=cara.data.shape_keys
    names={f'{k}_{s}' for s in ('L','R') for k in ('eyeBlink','eyeBlink_mid','eyeWide')}
    collisions=names&set(old.key_blocks.keys()) if old else set()
    if collisions and not reemplazar: raise ValueError('Ya existen keys oculares; revisar y autorizar reemplazar=True')
    if old and (not old.use_relative or any(old.key_blocks[n].relative_key != old.reference_key for n in collisions)):
        raise ValueError('Se requieren keys relativas al Basis; no convertir keys del usuario')
    if old and old.animation_data:
        ctrl=bpy.data.objects.get(cara.name+'_Control_Parpados')
        for d in old.animation_data.drivers:
            if any(d.data_path==old.key_blocks[n].path_from_id('value') for n in collisions):
                if any(v.targets[0].id not in (None,ctrl) for v in d.driver.variables):
                    raise ValueError('Los controles oculares pertenecen a otro rig. Usa una integración explícita; no se sobrescriben drivers ajenos')
    K,keys,info=calcular(cara,semillas_uv,param)
    managed=set(json.loads(cara.get('rlb_parpados_generadas','[]')))
    if old:
        ajenas=(set(keys)&set(old.key_blocks.keys()))-names-managed
        if ajenas:raise ValueError('Keys con nombres reservados pero ajenas al generador: '+', '.join(sorted(ajenas)))
    reglas={n:r for side in info.values() for n,r in side.get('reglas',{}).items()}
    for obsolete in managed-set(keys):
        if old and obsolete in old.key_blocks:
            keys[obsolete]=np.zeros_like(K.P);reglas[obsolete]={'tipo':'inactivo'}
    if old and not np.array_equal(np.array([p.co[:] for p in old.reference_key.data]),K.P):
        raise RuntimeError('El Basis cambió durante el cálculo')
    if not old: cara.shape_key_add(name='Basis',from_mix=False)
    for name,D in keys.items():
        key=cara.data.shape_keys.key_blocks.get(name)
        if key is None: key=cara.shape_key_add(name=name,from_mix=False)
        key.data.foreach_set('co',(K.P+D).ravel())
    creados=_controles(cara,keys,reglas)
    cara['rlb_parpados_uv_seeds']=list(map(int,semillas_uv))
    cara['rlb_parpados_metodo']='superficie_uv_0.7.15'
    cara['rlb_parpados_generadas']=json.dumps(list(keys))
    cara['rlb_parpados_reglas']=json.dumps(reglas)
    effective_params=_parametros_proporcion(param)
    effective_params['transporte']=info['L']['transporte']
    effective_params['contorno']=info['L']['contorno']
    cara['rlb_parpados_parametros']=json.dumps(effective_params)
    cara.data.update();bpy.context.view_layer.update()
    return {'keys':list(keys),'ojos':info,'drivers_creados':creados,'basis_modificado':False}


def medir(cara):
    """Comprobar las keys instaladas con sus reglas reales, sin cambiar ninguna pose."""
    bpy.context.view_layer.update()
    from .parpados_seguridad import Seguridad
    seeds=list(cara.get('rlb_parpados_uv_seeds',[]));params=json.loads(cara.get('rlb_parpados_parametros','{}'))
    K,O=contexto(cara,seeds,expandir=not params.get('limitar_uv',False))
    rules=json.loads(cara.get('rlb_parpados_reglas','{}'))
    names=json.loads(cara.get('rlb_parpados_generadas','[]'))
    if not names:raise ValueError('Falta el registro de keys del generador aislado')
    deltas={n:np.array([v.co[:] for v in cara.data.shape_keys.key_blocks[n].data])-K.P for n in names}
    failures=[];count=0
    for s,o in O.items():
        g=Superficie(cara,K,o,params);piv=bpy.data.objects[f'{cara.name}_OjoPivote_{s}'];M=cara.matrix_world.inverted()
        radius=max(np.linalg.norm(np.array((M@ch.matrix_world@v.co)[:])-o.c) for ch in piv.children_recursive if ch.type=='MESH' for v in ch.data.vertices)
        safe=Seguridad(K,o,g.reg,radius)
        for b in np.linspace(0,1,33):
            for a in (0.,.5,1.):
                e=b-.2*a*(1-b);blink=max(e,0.);wide=max(-e/.2,0.)
                weights={f'eyeBlink_{s}':blink,f'eyeBlink_mid_{s}':max(0.,min(2*blink,2*(1-blink))),f'eyeWide_{s}':wide}
                for name,r in rules.items():
                    if not name.endswith('_'+s):continue
                    if r['tipo']=='inactivo':weights[name]=0.;continue
                    v=wide if r['tipo']=='wide_hat' else blink
                    weights[name]=max(0.,min((v-r['a'])/(r['t']-r['a']),(r['b']-v)/(r['b']-r['t'])))
                delta=sum((value*deltas[name][K.zona] for name,value in weights.items()),np.zeros_like(K.p))
                m=safe.medir(delta);count+=1
                if not safe.valido(m):failures.append({'lado':s,'parpadeo':float(b),'apertura':a,**m})
    return {'metodo':cara.get('rlb_parpados_metodo'),'poses':count,'fallos':failures}


def _controles(cara,keys,reglas=None):
    """Actualizar drivers propios; conservar controles y animaciones de entrada."""
    sk=cara.data.shape_keys
    existentes={d.data_path for d in sk.animation_data.drivers} if sk.animation_data else set()
    faltan=[n for n in keys if sk.key_blocks[n].path_from_id('value') not in existentes]
    nombre=cara.name+'_Control_Parpados'
    ctrl=bpy.data.objects.get(nombre)
    if ctrl is None:
        ctrl=bpy.data.objects.new(nombre,None);cara.users_collection[0].objects.link(ctrl)
        ctrl.parent=cara;ctrl.empty_display_type='CIRCLE';ctrl.empty_display_size=.005
        ctrl.location=(0,-.1,0)
    for s in ('L','R'):
        for p in ('parpadeo_'+s,'apertura_'+s):
            if p not in ctrl:ctrl[p]=0.
            ctrl.id_properties_ui(p).update(min=0.,max=1.,soft_min=0.,soft_max=1.)
        prop=f'_rlb_efectivo_{s}'
        if prop not in ctrl:ctrl[prop]=0.
        effective=ctrl.driver_add(f'["{prop}"]').driver
        while effective.variables:effective.variables.remove(effective.variables[0])
        for name,path in [('b',f'parpadeo_{s}'),('a',f'apertura_{s}')]:
            var=effective.variables.new();var.name=name;var.type='SINGLE_PROP';var.targets[0].id=ctrl;var.targets[0].data_path=f'["{path}"]'
        effective.expression='min(1,max(0,b))-.2*min(1,max(0,a))*(1-min(1,max(0,b)))'
    for n in keys:
        s=n[-1];d=sk.key_blocks[n].driver_add('value').driver
        # Esta entrada aislada administra únicamente su controlador ocular.
        while d.variables:d.variables.remove(d.variables[0])
        var=d.variables.new();var.name='v';var.type='SINGLE_PROP';var.targets[0].id=ctrl;var.targets[0].data_path=f'["_rlb_efectivo_{s}"]'
        c='max(0,v)';op='max(0,-v/.2)'
        if n in (reglas or {}):
            spec=reglas[n]
            if spec['tipo']=='inactivo':
                d.expression='0'
            else:
                v=op if spec['tipo']=='wide_hat' else c
                d.expression=f"max(0,min((({v})-{spec['a']})/{spec['t']-spec['a']},({spec['b']}-({v}))/{spec['b']-spec['t']}))"
        elif n.startswith('eyeBlink_mid'):d.expression=f'max(0,min(2*({c}),2*(1-({c}))))'
        elif n.startswith('eyeBlink'):d.expression=c
        else:
            d.expression=op
    return faltan
