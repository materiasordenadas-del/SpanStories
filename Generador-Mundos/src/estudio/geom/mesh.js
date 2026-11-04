// Acumulador de geometría con color por vértice y tipo de superficie.
// Todo lo estático del lugar se agrupa por sector en pocas mallas (pocas llamadas de dibujo).
import * as THREE from 'three';

// Tipos de superficie que entiende el material del Estudio (atributo aSurf).
export const SURF={base:0,glass:1,foliage:2,water:3,metal:4,emissive:5,asphalt:6,paving:7,grass:8,roof:9,wall:10,trim:11,ground:12};

const tmp=new THREE.Vector3(),tmpN=new THREE.Vector3();

export class MeshBuilder{
  constructor(){this.p=[];this.n=[];this.c=[];this.s=[];this.id=[];this.t=[];this.currentId=0;this.currentTint=0;}
  get vertexCount(){return this.p.length/3;}
  setId(id){this.currentId=id;return this;}
  setTint(t){this.currentTint=t;return this;}
  vertex(x,y,z,nx,ny,nz,color,surf){
    this.p.push(x,y,z);this.n.push(nx,ny,nz);this.c.push(color.r,color.g,color.b);this.s.push(surf);this.id.push(this.currentId);this.t.push(color.__tint??this.currentTint);
  }
  tri(a,b,c,color,surf=0,normal=null){
    let nx,ny,nz;
    if(normal){[nx,ny,nz]=normal;}
    else{const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      nx=uy*vz-uz*vy;ny=uz*vx-ux*vz;nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;}
    this.vertex(a[0],a[1],a[2],nx,ny,nz,color,surf);
    this.vertex(b[0],b[1],b[2],nx,ny,nz,color,surf);
    this.vertex(c[0],c[1],c[2],nx,ny,nz,color,surf);
  }
  // Cuadrilátero a-b-c-d en sentido antihorario visto desde la cara.
  quad(a,b,c,d,color,surf=0,normal=null){this.tri(a,b,c,color,surf,normal);this.tri(a,c,d,color,surf,normal);}
  // Caja orientada: centro, medias dimensiones, giro Y (rad).
  box(cx,cy,cz,hx,hy,hz,yaw,color,surf=0,{bottom=false}={}){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const P=(x,y,z)=>[cx+x*c+z*s,cy+y,cz-x*s+z*c];
    const v=[P(-hx,-hy,-hz),P(hx,-hy,-hz),P(hx,hy,-hz),P(-hx,hy,-hz),P(-hx,-hy,hz),P(hx,-hy,hz),P(hx,hy,hz),P(-hx,hy,hz)];
    this.quad(v[4],v[5],v[6],v[7],color,surf);this.quad(v[1],v[0],v[3],v[2],color,surf);
    this.quad(v[5],v[1],v[2],v[6],color,surf);this.quad(v[0],v[4],v[7],v[3],color,surf);
    this.quad(v[7],v[6],v[2],v[3],color,surf);if(bottom)this.quad(v[0],v[1],v[5],v[4],color,surf);
  }
  // Cilindro o tronco de cono vertical (columnas, depósitos, farolas). Normales suaves en el lateral.
  cylinder(cx,cy,cz,r,h,seg,color,surf=0,{r2=r,top=true,bottom=false}={}){
    const ring=(rr,y)=>Array.from({length:seg},(_,i)=>{const a=i/seg*Math.PI*2;return [cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr,Math.cos(a),Math.sin(a)];});
    const lo=ring(r,cy),hi=ring(r2,cy+h),slope=(r-r2)/h;
    for(let i=0;i<seg;i++){
      const j=(i+1)%seg,a=lo[i],b=lo[j],c=hi[j],d=hi[i];
      const n=(p)=>{const l=Math.hypot(p[3],slope,p[4]);return [p[3]/l,slope/l,p[4]/l];};
      const na=n(a),nb=n(b);
      // lado: orden a,d,c,b mira hacia fuera
      this.vertex(a[0],a[1],a[2],...na,color,surf);this.vertex(d[0],d[1],d[2],...na,color,surf);this.vertex(c[0],c[1],c[2],...nb,color,surf);
      this.vertex(a[0],a[1],a[2],...na,color,surf);this.vertex(c[0],c[1],c[2],...nb,color,surf);this.vertex(b[0],b[1],b[2],...nb,color,surf);
      if(top&&r2>0)this.tri([cx,cy+h,cz],c.slice(0,3),d.slice(0,3),color,surf,[0,1,0]);
      if(bottom)this.tri([cx,cy,cz],a.slice(0,3),b.slice(0,3),color,surf,[0,-1,0]);
    }
  }
  // Cúpula (casquete de revolución) de radio r y altura h sobre (cx,cy,cz).
  dome(cx,cy,cz,r,h,seg,rings,color,surf=0){
    const P=(i,k)=>{const a=i/seg*Math.PI*2,t=k/rings*Math.PI/2;return [cx+Math.cos(a)*Math.cos(t)*r,cy+Math.sin(t)*h,cz+Math.sin(a)*Math.cos(t)*r];};
    const Nn=(i,k)=>{const a=i/seg*Math.PI*2,t=k/rings*Math.PI/2;const nx=Math.cos(a)*Math.cos(t)/r,ny=Math.sin(t)/h,nz=Math.sin(a)*Math.cos(t)/r,l=Math.hypot(nx,ny,nz);return [nx/l,ny/l,nz/l];};
    for(let k=0;k<rings;k++)for(let i=0;i<seg;i++){
      const i2=(i+1)%seg,a=P(i,k),b=P(i2,k),c=P(i2,k+1),d=P(i,k+1),na=Nn(i,k),nb=Nn(i2,k),nc=Nn(i2,k+1),nd=Nn(i,k+1);
      this.vertex(...a,...na,color,surf);this.vertex(...d,...nd,color,surf);this.vertex(...c,...nc,color,surf);
      if(k<rings-1){this.vertex(...a,...na,color,surf);this.vertex(...c,...nc,color,surf);this.vertex(...b,...nb,color,surf);}
    }
  }
  // Polígono horizontal con huecos; y puede ser número o función (x,z)->y. maxEdge subdivide para drapear.
  polygon(outer,holes,y,color,surf=0,{maxEdge=0,flip=false}={}){
    const tris=triangulate(outer,holes);
    const pts=[outer,...holes].flat();
    const yf=typeof y==='function'?y:()=>y;
    const emit=(a,b,c)=>{const A=[a[0],yf(a[0],a[1]),a[1]],B=[b[0],yf(b[0],b[1]),b[1]],C=[c[0],yf(c[0],c[1]),c[1]];
      if(flip)this.tri(A,C,B,color,surf,typeof y==='function'?null:[0,-1,0]);else this.tri(A,B,C,color,surf,typeof y==='function'?null:[0,1,0]);};
    for(const [i,j,k]of tris){
      // triangulateShape devuelve horario/antihorario según el contorno: forzar normal hacia arriba.
      let a=pts[i],b=pts[j],c=pts[k];
      if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)[b,c]=[c,b];
      if(maxEdge>0)subdivide(a,b,c,maxEdge,emit);else emit(a,b,c);
    }
  }
  append(other){for(const k of ['p','n','c','s','id','t']){const a=this[k],b=other[k];for(let i=0;i<b.length;i++)a.push(b[i]);}}
  build(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.setAttribute('aSurf',new THREE.Float32BufferAttribute(this.s,1));
    g.setAttribute('aId',new THREE.Float32BufferAttribute(this.id,1));
    g.setAttribute('aTint',new THREE.Float32BufferAttribute(this.t,1));
    g.computeBoundingSphere();g.computeBoundingBox();
    return g;
  }
}

// Triángulos en 2D. Devuelve índices sobre [outer,...holes].flat().
export function triangulate(outer,holes=[]){
  const v=r=>r.map(p=>new THREE.Vector2(p[0],p[1]));
  return THREE.ShapeUtils.triangulateShape(v(outer),holes.map(v));
}

function subdivide(a,b,c,max,emit,depth=0){
  const ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),ca=Math.hypot(a[0]-c[0],a[1]-c[1]);
  const m=Math.max(ab,bc,ca);
  if(m<=max||depth>12){emit(a,b,c);return;}
  const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];
  if(m===ab){const d=mid(a,b);subdivide(a,d,c,max,emit,depth+1);subdivide(d,b,c,max,emit,depth+1);}
  else if(m===bc){const d=mid(b,c);subdivide(a,b,d,max,emit,depth+1);subdivide(a,d,c,max,emit,depth+1);}
  else{const d=mid(c,a);subdivide(a,b,d,max,emit,depth+1);subdivide(d,b,c,max,emit,depth+1);}
}

export const color=hex=>new THREE.Color(hex);
export function shade(c,k){return new THREE.Color(Math.min(1,c.r*k),Math.min(1,c.g*k),Math.min(1,c.b*k));}
export function mixColor(a,b,t){return a.clone().lerp(b,t);}

export function ringSignedArea(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return s/2;}

// Simplifica un anillo: quita puntos repetidos, aristas mínimas y vértices casi colineales.
export function simplifyRing(ring,minEdge=.25,angleTol=.035){
  let r=ring.slice();
  if(r.length>1&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-6)r.pop();
  let changed=true;
  while(changed&&r.length>3){
    changed=false;
    for(let i=0;i<r.length&&r.length>3;i++){
      const a=r[(i-1+r.length)%r.length],b=r[i],c=r[(i+1)%r.length];
      const e1=Math.hypot(b[0]-a[0],b[1]-a[1]),e2=Math.hypot(c[0]-b[0],c[1]-b[1]);
      const cross=((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))/((e1*e2)||1);
      const dot=((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))/((e1*e2)||1);
      if(e1<minEdge||Math.abs(cross)<angleTol&&dot>0){r.splice(i,1);changed=true;i--;}
    }
  }
  return r;
}

export {tmp,tmpN};
