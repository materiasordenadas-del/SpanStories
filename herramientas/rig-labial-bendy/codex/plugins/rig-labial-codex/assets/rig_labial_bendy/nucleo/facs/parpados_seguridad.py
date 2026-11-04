"""Restricciones geométricas del generador; nunca escribe datos de Blender.

Evita colapsos de área, inversiones exteriores y autocolisiones de la piel.
Todas las posiciones se calculan antes de escribir una sola shape key.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class Seguridad:
    def __init__(self, K, ojo, region, radio_envolvente):
        self.K, self.o = K, ojo
        self.P = K.p
        self.c, self.r = ojo.c, ojo.r
        self.p = (self.P-self.c)/self.r
        self.reg = np.asarray(region, bool)
        self.im = self.reg.astype(float)
        self.T = np.asarray(K.triangulos, int)
        self.TA = self.T[self.reg[self.T].any(1)]
        n = np.cross(self.p[self.TA[:,1]]-self.p[self.TA[:,0]], self.p[self.TA[:,2]]-self.p[self.TA[:,0]])
        self.area0 = np.linalg.norm(n, axis=1)
        radial = np.einsum('ij,ij->i', n, self.p[self.TA].mean(1))
        ext = radial > self.area0*.05
        self.TE, self.det0 = self.TA[ext], radial[ext]
        self.E = K.g.E[self.reg[K.g.E].any(1)]
        self.longitud = np.linalg.norm(self.p[self.E[:,1]]-self.p[self.E[:,0]],axis=1)
        self.envolvente = float(radio_envolvente)/self.r
        self.colision = self.reg & (np.linalg.norm(self.p,axis=1)>1-.0002/self.r)
        centers = self.P[self.T].mean(1)
        near = (np.linalg.norm(centers-self.c,axis=1)<1.8*self.r)&(centers[:,1]<self.c[1]+.1*self.r)
        self.TC = self.T[near | self.reg[self.T].any(1)]
        self.originales = self.intersecciones(self.P)
        from .parpados_arap import bvh_ojo
        self.ojo_real=bvh_ojo(K.obj,ojo.lado)
        self.orden=None
        self._quietos={}

    def _particion(self,delta):
        """Triángulos de TC que se mueven y, en caché, el árbol de los quietos.
        Los quietos conservan sus coordenadas de reposo: entre ellos no aparecen
        cruces nuevos y su contacto con el ojo no cambia. Resultado idéntico a
        reconstruir todo, con solo los triángulos móviles por pose."""
        mov=np.any(np.asarray(delta)!=0,axis=1)[self.TC].any(1)
        clave=mov.tobytes()
        if clave not in self._quietos:
            if len(self._quietos)>16:self._quietos.clear()
            si=np.flatnonzero(~mov);V=self.P.tolist();T=self.TC[si].tolist()
            tree=BVHTree.FromPolygons(V,T,all_triangles=True,epsilon=self.r*1e-7) if len(si) else None
            ojo=0
            if len(si) and self.ojo_real is not None:
                ojo=len(BVHTree.FromPolygons(V,T,all_triangles=True).overlap(self.ojo_real))
            self._quietos[clave]=(si,tree,ojo)
        return (np.flatnonzero(mov),)+self._quietos[clave]

    def _nuevos(self,X,part):
        """Cruces nuevos respecto al reposo; equivale a intersecciones(X)-originales."""
        mi,si,quieto,_=part
        if not len(mi):return set()
        tree=BVHTree.FromPolygons(X.tolist(),self.TC[mi].tolist(),all_triangles=True,epsilon=self.r*1e-7)
        cand={(mi[a],mi[b]) for a,b in tree.overlap(tree)}
        if quieto is not None:cand|={(mi[a],si[b]) for a,b in tree.overlap(quieto)}
        out=set()
        for a,b in cand:
            a,b=(int(a),int(b)) if a<b else (int(b),int(a))
            if a==b or (a,b) in out or (a,b) in self.originales:continue
            if not set(self.TC[a])&set(self.TC[b]) and self._cruce_propio(X[self.TC[a]],X[self.TC[b]]):out.add((a,b))
        return out

    def establecer_orden(self,g):
        theta=g.bot+g.P['cierre']*(g.top-g.bot)
        side=np.where(g.dU<=g.dL,1.,-1.)
        a=max(g.x[g.U].min(),g.x[g.L].min());b=min(g.x[g.U].max(),g.x[g.L].max())
        band=(np.minimum(g.dU,g.dL)<.4*self.r)&(abs(g.x-(a+b)*.5)<.425*(b-a))
        # Solo restricciones compatibles con la superficie de partida.
        band&=(g.th-theta)*side>.001
        self.orden=(theta,side,band)

    def intersecciones(self, X):
        tree = BVHTree.FromPolygons([Vector(p) for p in X],self.TC.tolist(),all_triangles=True,epsilon=self.r*1e-7)
        return {(a,b) for a,b in tree.overlap(tree) if a<b and not set(self.TC[a])&set(self.TC[b])
                and self._cruce_propio(X[self.TC[a]],X[self.TC[b]])}

    def _cruce_propio(self,A,B):
        """Distinguir penetración interior de contacto válido entre bordes cerrados."""
        eps=self.r*1e-5
        na=np.cross(A[1]-A[0],A[2]-A[0]);nb=np.cross(B[1]-B[0],B[2]-B[0])
        la,lb=np.linalg.norm(na),np.linalg.norm(nb)
        if min(la,lb)<eps*eps:return False
        na/=la;nb/=lb
        def bary(p,T):
            u,v,w=T[1]-T[0],T[2]-T[0],p-T[0]
            a,b,c=np.dot(u,u),np.dot(u,v),np.dot(v,v);d,e=np.dot(w,u),np.dot(w,v)
            den=a*c-b*b
            if abs(den)<1e-24:return np.array((-1.,-1.,-1.))
            s=(c*d-b*e)/den;t=(a*e-b*d)/den
            return np.array((1-s-t,s,t))
        if np.linalg.norm(np.cross(na,nb))<1e-6:
            if abs(np.dot(B[0]-A[0],na))>eps:return False
            # Intersección convexa 2D: un segmento compartido tiene área cero.
            axes=[i for i in range(3) if i!=int(np.argmax(abs(na)))];aa=A[:,axes];bb=B[:,axes]
            def cross2(u,v):return u[0]*v[1]-u[1]*v[0]
            sign=np.sign(cross2(bb[1]-bb[0],bb[2]-bb[0]));poly=list(aa)
            for i in range(3):
                p,q=bb[i],bb[(i+1)%3];new=[]
                if not poly:return False
                for u,v in zip(poly,poly[1:]+poly[:1]):
                    du=sign*cross2(q-p,u-p);dv=sign*cross2(q-p,v-p)
                    iu,iv=du>=0,dv>=0
                    if iu:new.append(u)
                    if iu!=iv:new.append(u+(v-u)*(du/(du-dv)))
                poly=new
            if len(poly)<3:return False
            poly=np.array(poly);area=.5*abs(np.dot(poly[:,0],np.roll(poly[:,1],-1))-np.dot(poly[:,1],np.roll(poly[:,0],-1)))
            return area>eps*eps
        hits=[]
        for T,U,n in ((A,B,nb),(B,A,na)):
            d=(T-U[0])@n
            for i in range(3):
                j=(i+1)%3
                if abs(d[i])<eps and bary(T[i],U).min()>=-1e-6:hits.append(T[i])
                if d[i]*d[j]<-eps*eps:
                    h=T[i]+(T[j]-T[i])*(d[i]/(d[i]-d[j]))
                    if bary(h,U).min()>=-1e-6:hits.append(h)
        if len(hits)<2:return False
        dist=np.array([[np.linalg.norm(a-b) for b in hits] for a in hits]);i,j=np.unravel_index(np.argmax(dist),dist.shape)
        if dist[i,j]<eps:return False
        mid=(hits[i]+hits[j])*.5
        return bary(mid,A).min()>1e-6 and bary(mid,B).min()>1e-6

    def medir(self, delta):
        X=self.p+np.asarray(delta)/self.r
        n=np.cross(X[self.TA[:,1]]-X[self.TA[:,0]],X[self.TA[:,2]]-X[self.TA[:,0]])
        area=np.linalg.norm(n,axis=1)/np.maximum(self.area0,1e-12)
        a,b,c=(X[self.TE[:,j]] for j in range(3))
        det=np.einsum('ij,ij->i',a,np.cross(b,c))
        ratio=np.linalg.norm(X[self.E[:,1]]-X[self.E[:,0]],axis=1)/np.maximum(self.longitud,1e-12)
        Y=self.P+delta;part=self._particion(delta)
        pairs=self._nuevos(Y,part)
        eye=part[3]
        if self.ojo_real is not None and len(part[0]):
            eye+=len(BVHTree.FromPolygons(Y.tolist(),self.TC[part[0]].tolist(),all_triangles=True).overlap(self.ojo_real))
        return {'cruces_nuevos':len(pairs),'triangulos_aplastados':int((area<.02).sum()),
                'inversiones_exteriores':int((det<0).sum()),'area_min_relativa':float(area.min()),
                'arista_max_relativa':float(ratio.max()),'colisiones_ojo':eye}

    @staticmethod
    def valido(m):
        return not any(m[k] for k in ('cruces_nuevos','triangulos_aplastados','inversiones_exteriores','colisiones_ojo'))

    @staticmethod
    def _cercano(A,B,C):
        ab,ac=B-A,C-A;n=np.cross(ab,ac);nn=(n*n).sum(1)
        point=n*(np.einsum('ij,ij->i',n,A)/np.maximum(nn,1e-18))[:,None]
        ap=point-A;d00=(ab*ab).sum(1);d01=(ab*ac).sum(1);d11=(ac*ac).sum(1)
        d20=(ap*ab).sum(1);d21=(ap*ac).sum(1);den=np.maximum(d00*d11-d01*d01,1e-18)
        v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den
        bary=np.stack([1-v-w,v,w],1);inside=(bary>=0).all(1)
        points=[];weights=[]
        for p,q,i,j in [(A,B,0,1),(B,C,1,2),(C,A,2,0)]:
            e=q-p;t=np.clip(-np.einsum('ij,ij->i',p,e)/np.maximum((e*e).sum(1),1e-18),0,1)
            points.append(p+t[:,None]*e);bb=np.zeros_like(bary);bb[:,i]=1-t;bb[:,j]=t;weights.append(bb)
        candidates=np.stack(points,1);bi=np.argmin((candidates*candidates).sum(2),axis=1);ii=np.arange(len(A))
        point[~inside]=candidates[ii,bi][~inside];bary[~inside]=np.stack(weights,1)[ii,bi][~inside]
        return point,bary

    def _proyectar(self, preferred, initial=None, iterations=400, drive=.05):
        p=self.p; Q=p+preferred/self.r
        X=p.copy() if initial is None else p+initial/self.r
        im=self.im;reg=self.reg;TT=self.TA;TE=self.TE;E=self.E
        def triangulos(ids,grads,C,active):
            correction=np.zeros_like(X);count=np.zeros(len(X));inv=im[ids]
            den=sum(inv[:,j]*(grads[j]*grads[j]).sum(1) for j in range(3))
            mult=np.where(active,-C/np.maximum(den,1e-18),0.)
            for j in range(3):
                np.add.at(correction,ids[:,j],inv[:,j,None]*mult[:,None]*grads[j])
                np.add.at(count,ids[active,j],1)
            X[:]+=correction/np.maximum(count[:,None],1)
        for it in range(iterations):
            X[reg]+=(Q[reg]-X[reg])*drive*min(1.,it/80)
            a,b,c=(X[TT[:,j]] for j in range(3));n=np.cross(b-a,c-a);norm=np.linalg.norm(n,axis=1)
            nn=n/np.maximum(norm[:,None],1e-12);C=norm-.12*self.area0
            triangulos(TT,[np.cross(b-c,nn),np.cross(c-a,nn),np.cross(nn,b-a)],C,C<0)
            a,b,c=(X[TE[:,j]] for j in range(3));C=np.einsum('ij,ij->i',a,np.cross(b,c))-.03*self.det0
            triangulos(TE,[np.cross(b,c),np.cross(c,a),np.cross(a,b)],C,C<0)
            v=X[E[:,1]]-X[E[:,0]];length=np.linalg.norm(v,axis=1)
            diff=np.minimum(length-.25*self.longitud,0)+np.maximum(length-4.*self.longitud,0)
            den=im[E].sum(1);d=v/np.maximum(length[:,None],1e-12)*(diff/np.maximum(den,1e-12))[:,None]
            cor=np.zeros_like(X);cnt=np.zeros(len(X))
            np.add.at(cor,E[:,0],im[E[:,0],None]*d);np.add.at(cor,E[:,1],-im[E[:,1],None]*d)
            np.add.at(cnt,E[:,0],abs(diff)>0);np.add.at(cnt,E[:,1],abs(diff)>0)
            X+=cor/np.maximum(cnt[:,None],1)
            ids=np.flatnonzero(self.colision);dist=np.linalg.norm(X[ids],axis=1)
            minimum=self._radio_minimo(X[ids]);bad=dist<minimum
            X[ids[bad]]*=(minimum[bad]/np.maximum(dist[bad],1e-12))[:,None]
            # El interior de una cara puede atravesar el ojo aunque sus vértices no lo hagan.
            a,b,c=(X[TT[:,j]] for j in range(3));point,bary=self._cercano(a,b,c)
            dist=np.linalg.norm(point,axis=1);minimum=self._radio_minimo(point);bad=dist<minimum
            inv=im[TT];den=(inv*bary*bary).sum(1)
            push=point/np.maximum(dist[:,None],1e-12)*(np.maximum(minimum-dist,0)/np.maximum(den,1e-12))[:,None]
            corr=np.zeros_like(X);cnt=np.zeros(len(X))
            for j in range(3):
                np.add.at(corr,TT[:,j],inv[:,j,None]*bary[:,j,None]*push)
                np.add.at(cnt,TT[bad,j],1)
            X+=corr/np.maximum(cnt[:,None],1)
            if self.orden is not None:
                theta,side,band=self.orden
                angle=np.arctan2(X[:,2],-X[:,1]);bad=band&((angle-theta)*side<0)
                rho=np.hypot(X[bad,1],X[bad,2]);target=theta[bad]+side[bad]*.0001
                X[bad,1]=-rho*np.cos(target);X[bad,2]=rho*np.sin(target)
        return (X-p)*self.r

    def _radio_minimo(self,Q):
        distance=np.linalg.norm(Q,axis=1);front=-Q[:,1]/np.maximum(distance,1e-12)
        a,b=np.cos(np.radians(58)),np.cos(np.radians(30))
        t=np.clip((front-a)/(b-a),0,1);fade=t*t*(3-2*t)
        return 1.+max(self.envolvente-1.,0.)*fade+.0001/self.r

    def _separacion(self,A,B):
        ea=np.roll(A,-1,axis=0)-A;eb=np.roll(B,-1,axis=0)-B
        axes=[np.cross(ea[0],ea[1]),np.cross(eb[0],eb[1])]+[np.cross(a,b) for a in ea for b in eb]
        best=None;distance=float('inf')
        for axis in axes:
            length=np.linalg.norm(axis)
            if length<1e-13:continue
            axis=axis/length;aa=A@axis;bb=B@axis
            if aa.max()<bb.min()-self.r*1e-7 or bb.max()<aa.min()-self.r*1e-7:return None
            positive=bb.max()-aa.min();negative=aa.max()-bb.min();d=min(positive,negative)
            if d<distance:
                distance=d;best=axis*(d+self.r*.0015)*(1 if positive<negative else -1)
        return best

    def corregir(self,delta):
        orden=self.orden
        self.orden=None
        try:
            try:
                result,report=self._resolver(delta)
                report['restriccion_orden']=False
                return result,report
            except RuntimeError:
                if orden is None:raise
                self.orden=orden
                result,report=self._resolver(delta)
                report['restriccion_orden']=True
                return result,report
        finally:self.orden=orden

    def _resolver(self, delta):
        """Devolver coordenadas comprobadas o fallar sin escribir en la malla."""
        if np.any(self.longitud<1e-6):
            raise ValueError('La superficie contiene aristas de longitud cero; ejecutar la preparación de conectividad antes del rig')
        original=self.medir(delta)
        if self.valido(original):return delta,{'antes':original,'despues':original,'corregido':False}
        preferred=np.asarray(delta);out=self._proyectar(preferred)
        for iteration in range(300):
            X=self.P+out;pairs=self._nuevos(X,self._particion(out))
            if not pairs:
                state=self.medir(out)
                if self.valido(state):
                    return out,{'antes':original,'despues':state,'corregido':True,'iteraciones':iteration}
            correction=np.zeros_like(out);count=np.zeros(len(out))
            for a,b in pairs:
                ia,ib=self.TC[a],self.TC[b];move=self._separacion(X[ia],X[ib])
                if move is None:continue
                wa,wb=self.im[ia].mean(),self.im[ib].mean();total=wa+wb
                if total==0:continue
                np.add.at(correction,ia,.8*self.im[ia,None]*move/total)
                np.add.at(correction,ib,-.8*self.im[ib,None]*move/total)
                np.add.at(count,ia,1);np.add.at(count,ib,1)
            out+=correction/np.maximum(count[:,None],1)
            out=self._proyectar(preferred,initial=out,iterations=2,drive=0)
        state=self.medir(out)
        error=RuntimeError(f'Párpado {self.o.lado}: no se obtuvo una superficie válida; malla sin modificar. {state}')
        error.coordenadas_diagnostico=out.copy()
        error.metricas=state
        raise error
