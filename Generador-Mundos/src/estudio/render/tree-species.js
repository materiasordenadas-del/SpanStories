// Especies de árbol procedurales por clima: palmeras, ciprés, pino piñonero, olivo, abeto, eucalipto,
// naranjo, jacaranda, flamboyán, almendro tropical, acacia, cardón, agave, mangle y araucaria.
// Mismo lenguaje visual que el Estudio: copas por masas (follaje, aSurf 2, sombreado por volumen) y troncos
// sólidos (aSurf 24). Color por vértice, sin texturas. Cada especie tiene una versión cercana y otra lejana
// (≈ 15-30 % de los triángulos) y varias variantes por semilla para que no haya clones visibles.
import * as THREE from 'three';
import {MeshBuilder} from '../geom/mesh.js';
import {rng,range} from '../data/rng.js';

const FOLIAGE=2,TRUNK=24;
const C=hex=>new THREE.Color(hex);
const mul=(c,k)=>new THREE.Color(Math.min(1,c.r*k),Math.min(1,c.g*k),Math.min(1,c.b*k));
const mix=(a,b,t)=>a.clone().lerp(b,t);
const hash=(x,y,z,s)=>{const v=Math.sin(x*127.1+y*311.7+z*74.7+s*17.3)*43758.5453;return v-Math.floor(v);};

// ---------------------------------------------------------------- primitivas
const ICO=new Map();
function icosphere(detail){
  if(ICO.has(detail))return ICO.get(detail);
  const t=(1+Math.sqrt(5))/2;
  let v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(p=>{const l=Math.hypot(...p);return p.map(x=>x/l);});
  let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let d=0;d<detail;d++){
    const cache=new Map(),mid=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(cache.has(k))return cache.get(k);const p=v[a].map((x,i)=>(x+v[b][i])/2),l=Math.hypot(...p);v.push(p.map(x=>x/l));cache.set(k,v.length-1);return v.length-1;};
    const next=[];for(const [a,b,c]of f){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}f=next;
  }
  const out={v,f};ICO.set(detail,out);return out;
}
// Masa de follaje: elipsoide abollado, más claro arriba y oscuro debajo (lectura de volumen en cel shading).
function puff(mb,[cx,cy,cz],[rx,ry,rz],col,{seed=0,jitter=.16,detail=1,light=1.14,dark=.72,surf=FOLIAGE,flatBottom=0}={}){
  const {v,f}=icosphere(detail);
  const P=v.map(([x,y,z])=>{const d=1+jitter*(hash(Math.round(x*50),Math.round(y*50),Math.round(z*50),seed)-.5)*2;const yy=y<-flatBottom?-flatBottom+(y+flatBottom)*.35:y;return [cx+x*rx*d,cy+yy*ry*d,cz+z*rz*d];});
  const N=v.map(([x,y,z])=>{const n=[x/rx,y/ry,z/rz],l=Math.hypot(...n);return n.map(a=>a/l);});
  const K=v.map(([x,y,z])=>mul(col,(dark+(light-dark)*((y+1)/2))*(.94+.12*hash(x*9,y*9,z*9,seed+3))));
  for(const [a,b,c]of f){for(const i of [a,c,b])mb.vertex(...P[i],...N[i],K[i],surf);}
}
// Tubo cónico a lo largo de una polilínea (troncos y ramas). Normales radiales suaves.
function tube(mb,pts,radii,sides,col,{surf=TRUNK,cap=true,rings=null,seed=0}={}){
  const frames=[];let prevN=null;
  for(let i=0;i<pts.length;i++){
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],t=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
    let n=prevN?prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize():new THREE.Vector3(1,0,0).cross(t).lengthSq()>.01?new THREE.Vector3(0,0,1).cross(t).normalize():new THREE.Vector3(1,0,0);
    if(!prevN&&Math.abs(t.y)<.9)n=new THREE.Vector3(0,1,0).cross(t).normalize();
    prevN=n;frames.push({t,n,bn:t.clone().cross(n).normalize()});
  }
  const ring=i=>Array.from({length:sides},(_,k)=>{const a=k/sides*Math.PI*2,{n,bn}=frames[i],d=n.clone().multiplyScalar(Math.cos(a)).add(bn.clone().multiplyScalar(Math.sin(a)));return {p:[pts[i][0]+d.x*radii[i],pts[i][1]+d.y*radii[i],pts[i][2]+d.z*radii[i]],n:[d.x,d.y,d.z]};});
  const R=pts.map((_,i)=>ring(i));
  for(let i=0;i<pts.length-1;i++){
    const ci=rings?rings(i):col,cj=rings?rings(i+1):col;
    for(let k=0;k<sides;k++){const k2=(k+1)%sides,a=R[i][k],b=R[i][k2],c=R[i+1][k2],d=R[i+1][k];
      const sh=.92+.16*hash(i,k,0,seed),A=mul(ci,sh),B=mul(cj,sh);
      mb.vertex(...a.p,...a.n,A,surf);mb.vertex(...c.p,...c.n,B,surf);mb.vertex(...b.p,...b.n,A,surf);
      mb.vertex(...a.p,...a.n,A,surf);mb.vertex(...d.p,...d.n,B,surf);mb.vertex(...c.p,...c.n,B,surf);}
  }
  if(cap){const last=pts.length-1,top=pts[last],cc=rings?rings(last):col;for(let k=0;k<sides;k++){const a=R[last][k],b=R[last][(k+1)%sides];mb.vertex(...top,...frames[last].t.toArray(),cc,surf);mb.vertex(...a.p,...frames[last].t.toArray(),cc,surf);mb.vertex(...b.p,...frames[last].t.toArray(),cc,surf);}}
}
const bezier=(a,b,c,n)=>Array.from({length:n+1},(_,i)=>{const t=i/n,u=1-t;return [0,1,2].map(k=>u*u*a[k]+2*u*t*b[k]+t*t*c[k]);});
// Hoja de palmera: nervio arqueado y lámina en V con borde dentado (folíolos), visible por ambas caras.
function frond(mb,base,yaw,pitch,len,width,droop,col,{segs=9,serrate=true,tip=null}={}){
  const d=[Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw)];
  const P=s=>[base[0]+d[0]*len*s,base[1]+d[1]*len*s-droop*len*s*s,base[2]+d[2]*len*s];
  const side=[-Math.sin(yaw),0,Math.cos(yaw)];
  const spine=mul(col,1.15),edge=mul(col,.82),tipC=tip?mix(col,tip,.6):col;
  let prev=null;
  for(let i=0;i<=segs;i++){
    const s=i/segs,p=P(s),w=width*Math.pow(1-s,.7)*Math.min(1,s*5+.15)*(serrate&&i%2?.55:1),fall=w*.45;
    const L=[p[0]-side[0]*w,p[1]-fall,p[2]-side[2]*w],R=[p[0]+side[0]*w,p[1]-fall,p[2]+side[2]*w],c=mix(spine,tipC,s),e=mix(edge,tipC,s*.8);
    if(prev){
      mb.tri(prev.p,p,L,c,FOLIAGE);mb.tri(prev.p,L,prev.L,e,FOLIAGE);
      mb.tri(prev.p,R,p,c,FOLIAGE);mb.tri(prev.p,prev.R,R,e,FOLIAGE);
    }
    prev={p,L,R};
  }
}
// Cono de abeto (piso de ramas) con faldón caído y base cerrada más oscura.
function cone(mb,cx,y0,cz,r,h,sides,col,{droop=.25,seed=0}={}){
  const apex=[cx,y0+h,cz];
  for(let k=0;k<sides;k++){
    const a0=k/sides*Math.PI*2,a1=(k+1)/sides*Math.PI*2,j0=1+.12*(hash(k,0,1,seed)-.5),j1=1+.12*(hash((k+1)%sides,0,1,seed)-.5);
    const A=[cx+Math.cos(a0)*r*j0,y0-droop,cz+Math.sin(a0)*r*j0],B=[cx+Math.cos(a1)*r*j1,y0-droop,cz+Math.sin(a1)*r*j1];
    mb.tri(apex,B,A,mul(col,1.08),FOLIAGE);mb.tri([cx,y0+h*.12,cz],A,B,mul(col,.62),FOLIAGE);
  }
}

// Copa anime: núcleo grande y masas solapadas repartidas por la superficie de un elipsoide (más arriba
// que abajo), cada una algo distinta de tono. Lee como un volumen de follaje y no como globos sueltos.
function canopy(mb,[cx,cy,cz],[rx,ry,rz],col,r,{count=9,size=.55,detail=1,coreDetail=detail,jitter=.12,spread=.12,colors=null,flatBottom=0,light=1.16,dark=.8}={}){
  puff(mb,[cx,cy,cz],[rx*.82,ry*.8,rz*.82],mul(col,.9),{detail:coreDetail,seed:r()*99,jitter:jitter*.6,light,dark:dark-.06,flatBottom});
  const golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<count;i++){
    const t=(i+.5)/count,y=1-t*1.35,rad=Math.sqrt(Math.max(0,1-y*y)),a=i*golden+r()*.6;
    const u=Math.max(-.55,y),k=size*(.85+.3*r());
    const c=colors?colors[Math.floor(r()*colors.length)]:mix(col,mul(col,1.12),r());
    puff(mb,[cx+Math.cos(a)*rad*rx*(1-spread),cy+u*ry*.78,cz+Math.sin(a)*rad*rz*(1-spread)],[rx*k,ry*k*.86,rz*k],c,{detail,seed:i*7+r()*50,jitter,light,dark,flatBottom:flatBottom*.6});
  }
}
// Cuerpo de revolución abollado (ciprés): perfil de llama con relieve por vértice.
function lathe(mb,profile,segs,col,{seed=0,bump=.12,surf=FOLIAGE,light=1.15,dark=.72}={}){
  const rings=profile.length,V=[];
  for(let j=0;j<rings;j++){const [y,rr]=profile[j];V.push(Array.from({length:segs},(_,k)=>{const a=k/segs*Math.PI*2+(j%2)*Math.PI/segs,b=1+bump*(hash(j,k,1,seed)-.5)*2;return [Math.cos(a)*rr*b,y,Math.sin(a)*rr*b,Math.cos(a),Math.sin(a)];}));}
  const top=profile.at(-1)[0];
  for(let j=0;j<rings-1;j++)for(let k=0;k<segs;k++){
    const k2=(k+1)%segs,a=V[j][k],b=V[j][k2],c=V[j+1][k2],d=V[j+1][k];
    const sh=y=>mul(col,dark+(light-dark)*(y/top)),n=p=>[p[3],.25,p[4]];
    mb.vertex(a[0],a[1],a[2],...n(a),sh(a[1]),surf);mb.vertex(c[0],c[1],c[2],...n(c),sh(c[1]),surf);mb.vertex(b[0],b[1],b[2],...n(b),sh(b[1]),surf);
    mb.vertex(a[0],a[1],a[2],...n(a),sh(a[1]),surf);mb.vertex(d[0],d[1],d[2],...n(d),sh(d[1]),surf);mb.vertex(c[0],c[1],c[2],...n(c),sh(c[1]),surf);
  }
}
// Piso de abeto: faldón estrellado (puntas caídas) con cara inferior oscura; así se leen los pisos.
function skirt(mb,cx,y0,cz,r,h,points,col,{droop=.5,seed=0}={}){
  const apex=[cx,y0+h,cz],inner=[cx,y0+h*.18,cz];
  const rim=Array.from({length:points*2},(_,k)=>{const a=k/(points*2)*Math.PI*2+seed,tip=k%2===0,rr=r*(tip?1:.68)*(1+.1*(hash(k,0,3,seed)-.5)),dy=tip?-droop:-droop*.25;return [cx+Math.cos(a)*rr,y0+dy,cz+Math.sin(a)*rr];});
  for(let k=0;k<rim.length;k++){const A=rim[k],B=rim[(k+1)%rim.length],tip=k%2===0;
    mb.tri(apex,B,A,mul(col,tip?1.12:1.0),FOLIAGE);mb.tri(inner,A,B,mul(col,.55),FOLIAGE);}
}

// ---------------------------------------------------------------- especies
const PALM={trunk:C('#8a6f52'),trunk2:C('#a08465'),green:C('#5f9a3a'),dry:C('#b59a55')};
const species={
  palmera(mb,r,lod){ // palmera canaria / datilera: tronco grueso con cicatrices y copa esférica
    const h=range(r,7,9.5),lean=range(r,-.5,.5),segs=lod?4:9,pts=bezier([0,0,0],[lean*.3,h*.5,0],[lean,h,0],segs);
    tube(mb,pts,pts.map((_,i)=>.42-.1*i/segs),lod?5:9,PALM.trunk,{rings:i=>i%2?PALM.trunk:PALM.trunk2,seed:r()*99});
    const top=pts.at(-1);puff(mb,[top[0],top[1]+.15,top[2]],[.65,.7,.65],C('#7b6a3f'),{detail:lod?0:1,seed:3,surf:TRUNK});
    const n=lod?9:20;for(let i=0;i<n;i++){const yaw=i/n*Math.PI*2+r()*.3,low=i%3===0;
      frond(mb,[top[0],top[1]+.3,top[2]],yaw,low?range(r,-.35,-.1):range(r,.15,.85),range(r,3.2,3.9),.55,low?.55:.32,low?mix(PALM.green,PALM.dry,.4):PALM.green,{segs:lod?4:10,serrate:!lod});}
    return h;
  },
  palmera_real(mb,r,lod){ // palma real: fuste liso gris, capitel verde y hojas muy arqueadas
    const h=range(r,12,15),segs=lod?3:8,pts=bezier([0,0,0],[0,h*.5,0],[range(r,-.3,.3),h,0],segs);
    tube(mb,pts,pts.map((_,i)=>{const s=i/segs;return .32+.08*Math.sin(s*Math.PI)*(s<.5?1:.4)-.05*s;}),lod?5:10,C('#bdb7ab'),{seed:r()*99});
    const top=pts.at(-1);tube(mb,[top,[top[0],top[1]+1.7,top[2]]],[.27,.22],lod?5:9,C('#6f9a4a'),{surf:TRUNK});
    const crown=[top[0],top[1]+1.8,top[2]],n=lod?7:15;
    for(let i=0;i<n;i++)frond(mb,crown,i/n*Math.PI*2+r()*.4,range(r,.2,1.1),range(r,3.6,4.3),.5,range(r,.55,.85),C('#4f9234'),{segs:lod?4:11,serrate:!lod});
    return h+3;
  },
  cocotero(mb,r,lod){ // cocotero: fuste fino e inclinado hacia el mar, hojas colgantes y cocos
    const h=range(r,9,12),lean=range(r,1.6,3),segs=lod?4:10,pts=bezier([0,0,0],[lean*.15,h*.55,0],[lean,h,0],segs);
    tube(mb,pts,pts.map((_,i)=>.26-.08*i/segs),lod?5:8,C('#9a8a72'),{rings:i=>i%2?C('#8b7b63'):C('#a6967c'),seed:r()*99});
    const top=pts.at(-1),n=lod?8:16;
    for(let i=0;i<n;i++)frond(mb,top,i/n*Math.PI*2+r()*.3,range(r,-.2,.6),range(r,3.6,4.4),.48,range(r,.7,1.05),C('#5d9b36'),{segs:lod?4:11,serrate:!lod,tip:C('#a7b04a')});
    if(!lod)for(let i=0;i<5;i++){const a=i/5*Math.PI*2;puff(mb,[top[0]+Math.cos(a)*.32,top[1]-.25,top[2]+Math.sin(a)*.32],[.17,.19,.17],C('#7a6a2e'),{detail:0,surf:TRUNK,seed:i});}
    return h;
  },
  cipres(mb,r,lod){ // ciprés: llama oscura y estrecha, abollada
    const h=range(r,9,13),w=range(r,1.05,1.3);tube(mb,[[0,0,0],[0,1,0]],[.18,.15],5,C('#6b4f38'),{cap:false});
    const n=lod?6:13,profile=Array.from({length:n},(_,j)=>{const s=j/(n-1);return [.7+s*(h-.7),Math.max(.04,w*Math.pow(Math.sin(Math.min(1,.12+s*.95)*Math.PI),.75)*(1-.55*s))];});
    lathe(mb,profile,lod?6:12,mix(C('#2a5233'),C('#355f3a'),r()),{seed:r()*99,bump:lod?.08:.2});
    return h;
  },
  pino(mb,r,lod){ // pino piñonero: fuste alto rojizo, ramas abiertas y copa en parasol ancha
    const h=range(r,9,12),lean=range(r,-.9,.9),fork=h*.6,trunk=bezier([0,0,0],[lean*.2,fork*.5,0],[lean,fork,0],lod?2:5);
    const bark=C('#8c5a3c');tube(mb,trunk,trunk.map((_,i)=>.4-.14*i/(trunk.length-1)),lod?5:8,bark,{seed:r()*9});
    const top=trunk.at(-1),arms=lod?3:5,tips=[];
    for(let k=0;k<arms;k++){const a=k/arms*Math.PI*2+r()*.5,d=range(r,2.4,3.6),end=[top[0]+Math.cos(a)*d,h-range(r,1.4,2),top[2]+Math.sin(a)*d];tips.push(end);
      tube(mb,[top,[(top[0]+end[0])/2,top[1]+1.1,(top[2]+end[2])/2],end],[.24,.16,.1],lod?4:6,bark,{cap:false});}
    const green=mix(C('#4a7637'),C('#567f3d'),r());
    if(lod)puff(mb,[top[0],h-1,top[2]],[5,1.3,5],green,{detail:1,seed:1,jitter:.1,flatBottom:.4});
    else{for(const [i,e]of tips.entries())canopy(mb,[e[0],e[1]+.7,e[2]],[2.4,.85,2.4],green,r,{count:3,size:.62,flatBottom:.5,jitter:.1});
      puff(mb,[top[0],h-.7,top[2]],[2.8,1,2.8],mul(green,1.05),{detail:1,seed:5,jitter:.1,flatBottom:.4});}
    return h;
  },
  olivo(mb,r,lod){ // olivo: tronco grueso retorcido y copa ancha plateada
    const h=range(r,5,6.5),bark=C('#7d6a55');
    tube(mb,bezier([0,0,0],[.4,1,-.25],[-.1,1.8,.1],lod?2:4),[.48,.42,.38,.34,.3].slice(0,lod?3:5),lod?5:9,bark,{seed:r()*9});
    const arms=lod?2:4;for(let i=0;i<arms;i++){const a=i/arms*Math.PI*2+r(),e=[Math.cos(a)*1.7,range(r,3,3.6),Math.sin(a)*1.7];tube(mb,[[-.1,1.8,.1],[e[0]*.5,2.7,e[2]*.5],e],[.22,.15,.1],lod?4:6,bark,{cap:false});}
    const silver=[C('#8fa271'),C('#9caf80'),C('#a9b98c'),C('#86996a')];
    if(lod)puff(mb,[0,h-1.3,0],[2.7,1.3,2.7],silver[1],{detail:1,jitter:.18});
    else canopy(mb,[0,h-1.3,0],[2.6,1.35,2.6],silver[0],r,{count:11,size:.5,colors:silver,jitter:.16,light:1.22,coreDetail:2});
    return h;
  },
  conifera(mb,r,lod){ // abeto: pisos estrellados con puntas caídas
    const h=range(r,11,15),w=range(r,2.6,3.2);tube(mb,[[0,0,0],[0,h*.5,0]],[.32,.2],lod?5:7,C('#6a4a34'),{cap:false});
    const tiers=lod?4:7,col=mix(C('#2d5a43'),C('#376649'),r());
    for(let i=0;i<tiers;i++){const s=i/tiers,y=1.5+s*(h-2.6),rad=w*Math.pow(1-s,.9)+.25;skirt(mb,0,y,0,rad,(h-1.5)/tiers*1.75,lod?5:8,mix(col,mul(col,1.12),s),{droop:.45+.4*(1-s),seed:i*1.7+r()});}
    return h;
  },
  eucalipto(mb,r,lod){ // eucalipto: fuste claro alto, ramas abiertas y copa rala en racimos
    const h=range(r,15,19),lean=range(r,-1.2,1.2),pts=bezier([0,0,0],[lean*.2,h*.5,0],[lean,h*.78,0],lod?3:7);
    tube(mb,pts,pts.map((_,i)=>.42-.26*i/(pts.length-1)),lod?5:8,C('#d6cdbb'),{rings:i=>i%3===1?C('#b9a88c'):C('#d8cfbe'),seed:r()*9});
    const top=pts.at(-1),n=lod?3:5,tips=[];
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2+r()*.6,d=range(r,1.6,3),y=top[1]+range(r,-2.5,2.2),e=[top[0]+Math.cos(a)*d,y,top[2]+Math.sin(a)*d];tips.push(e);
      tube(mb,[[top[0],y-1.8,top[2]],[(top[0]+e[0])/2,y-.6,(top[2]+e[2])/2],e],[.15,.1,.06],lod?4:5,C('#cfc4ad'),{cap:false});}
    const greys=[C('#7f9a6e'),C('#8ca37a'),C('#93a883'),C('#748f66')];
    for(const [i,e]of tips.entries())lod?puff(mb,[e[0],e[1]+.4,e[2]],[1.9,1.8,1.9],greys[i%4],{detail:0,jitter:.2}):canopy(mb,[e[0],e[1]+.4,e[2]],[1.9,1.9,1.9],greys[i%4],r,{count:3,size:.55,colors:greys,jitter:.2,dark:.72});
    return h;
  },
  naranjo(mb,r,lod){ // naranjo de alineación: copa redonda densa y frutos
    const h=range(r,4.4,5.4);tube(mb,[[0,0,0],[0,1.5,0]],[.17,.14],lod?5:7,C('#6e5641'),{cap:false});
    const green=C('#3d7034'),R=[1.9,1.7,1.9],cy=h-1.7;
    if(lod)puff(mb,[0,cy,0],R,green,{detail:1,jitter:.1});
    else{canopy(mb,[0,cy,0],R,green,r,{count:10,size:.5,colors:[green,C('#46793a'),C('#386a30')],jitter:.1,coreDetail:2});
      for(let i=0;i<22;i++){const u=r()*Math.PI*2,v=Math.acos(range(r,-.35,.95)),k=1.02;puff(mb,[Math.cos(u)*Math.sin(v)*R[0]*k,cy+Math.cos(v)*R[1]*k,Math.sin(u)*Math.sin(v)*R[2]*k],[.13,.13,.13],C('#f28c28'),{detail:0,jitter:0,light:1.1,dark:.9});}}
    return h;
  },
  jacaranda(mb,r,lod){ return flowering(mb,r,lod,{h:[8,11],spread:3.6,colors:['#8f7bd4','#a48fe0','#7e6cc6','#9a86da'],greenShare:.16,trunk:'#7a6450'}); },
  flamboyan(mb,r,lod){ return flowering(mb,r,lod,{h:[6.5,8.5],spread:5,colors:['#e2502f','#ee6a36','#d94428','#f07a3c'],greenShare:.2,trunk:'#7c6a58',flat:true}); },
  almendro(mb,r,lod){ // almendro tropical (Terminalia): pisos horizontales en pagoda, alguna hoja roja
    const h=range(r,8,11),bark=C('#7b6852');tube(mb,[[0,0,0],[0,h-1,0]],[.32,.16],lod?5:8,bark,{cap:true});
    const tiers=lod?2:3,greens=[C('#4b8a37'),C('#579a3e'),C('#447f33')];
    for(let t=0;t<tiers;t++){const y=h*(.42+.24*t),R=4.4*(1-t*.3),n=lod?3:5;
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2+r()+t,e=[Math.cos(a)*R*.62,y+.15,Math.sin(a)*R*.62];if(!lod)tube(mb,[[0,y-.5,0],[e[0]*.6,y-.1,e[2]*.6],e],[.13,.09,.06],5,bark,{cap:false});
        const c=r()<.14?C('#c25a32'):greens[i%3];puff(mb,e,[R*.44,.62,R*.44],c,{detail:lod?0:1,seed:i+t*5,flatBottom:.35,jitter:.12});}}
    puff(mb,[0,h-.3,0],[1.4,.75,1.4],greens[1],{detail:lod?0:1,seed:77,flatBottom:.3});
    return h;
  },
  acacia(mb,r,lod){ // acacia / mezquite / algarrobo: tronco bajo bifurcado y copa plana en parasol
    const h=range(r,5,7),bark=C('#6b5745');tube(mb,bezier([0,0,0],[.25,.8,0],[0,1.5,.1],lod?2:3),[.26,.22,.2,.18].slice(0,lod?3:4),lod?5:7,bark,{cap:false});
    const arms=lod?3:5,tips=[];for(let i=0;i<arms;i++){const a=i/arms*Math.PI*2+r()*.5,d=range(r,1.8,3),e=[Math.cos(a)*d,h-range(r,.9,1.4),Math.sin(a)*d];tips.push(e);tube(mb,[[0,1.5,.1],[e[0]*.45,(1.5+e[1])/2+.5,e[2]*.45],e],[.15,.1,.06],lod?4:5,bark,{cap:false});}
    const olive=[C('#8a9a58'),C('#97a462'),C('#7f9150')];
    for(const [i,e]of tips.entries())lod?puff(mb,[e[0],e[1]+.45,e[2]],[2,.55,2],olive[i%3],{detail:0,flatBottom:.4}):canopy(mb,[e[0],e[1]+.45,e[2]],[1.9,.55,1.9],olive[i%3],r,{count:3,size:.6,colors:olive,flatBottom:.6,jitter:.16});
    return h;
  },
  cactus(mb,r,lod){ // cardón / saguaro: columna acanalada con brazos
    const h=range(r,4.5,6.5),green=C('#5f8f4a'),sides=lod?6:12;
    ribbedTube(mb,[[0,0,0],[0,h*.5,0],[0,h,0]],[.4,.39,.37],sides,green,lod);puff(mb,[0,h,0],[.37,.26,.37],green,{detail:lod?0:1,surf:TRUNK,jitter:0});
    const arms=lod?Math.min(2,1+Math.floor(r()*2)):1+Math.floor(r()*3);
    for(let i=0;i<arms;i++){const a=i*2.3+r(),y=range(r,h*.35,h*.6),out=range(r,.85,1.15),up=range(r,1.4,2.4),dir=[Math.cos(a),Math.sin(a)];
      const p=[[dir[0]*.2,y,dir[1]*.2],[dir[0]*out,y+.12,dir[1]*out],[dir[0]*out,y+.6,dir[1]*out],[dir[0]*out,y+up,dir[1]*out]];
      ribbedTube(mb,p,[.26,.26,.26,.26],lod?5:9,green,lod);puff(mb,p.at(-1),[.26,.18,.26],green,{detail:0,surf:TRUNK,jitter:0});}
    return h;
  },
  agave(mb,r,lod){ // agave / pita: roseta de pencas gruesas con borde claro
    const n=lod?9:18,blue=C('#7fa79a'),edge=C('#d2c77c');
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2*1.618+r()*.2,inner=i/n,up=.35+inner*.9+range(r,-.1,.1),len=range(r,1.1,1.6)*(1-inner*.35),w=.18,dir=[Math.cos(a),Math.sin(a)];
      const base=[dir[0]*.1,.05,dir[1]*.1],tip=[dir[0]*len*Math.cos(up),.1+len*Math.sin(up),dir[1]*len*Math.cos(up)],side=[-dir[1]*w,0,dir[0]*w];
      const L=[base[0]-side[0],base[1],base[2]-side[2]],R=[base[0]+side[0],base[1],base[2]+side[2]],T=[base[0],base[1]+.14,base[2]];
      mb.tri(L,tip,T,mix(blue,edge,.3),TRUNK);mb.tri(T,tip,R,mul(blue,1.08),TRUNK);mb.tri(R,tip,L,mul(blue,.7),TRUNK);}
    return 1.5;
  },
  mangle(mb,r,lod){ // mangle rojo: raíces en zanco y copa densa
    const h=range(r,5.5,7.5),bark=C('#5e4a3a'),root=lod?5:9;
    for(let i=0;i<root;i++){const a=i/root*Math.PI*2+r()*.4,d=range(r,1.3,2);tube(mb,bezier([0,1.5,0],[Math.cos(a)*d*.55,1.6,Math.sin(a)*d*.55],[Math.cos(a)*d,-.1,Math.sin(a)*d],lod?2:4),[.1,.09,.08,.07,.06].slice(0,lod?3:5),4,bark,{cap:false});}
    tube(mb,[[0,1.4,0],[0,h-1.6,0]],[.22,.15],lod?5:7,bark,{cap:false});
    const greens=[C('#3b6b37'),C('#467a3f'),C('#356233')];
    lod?puff(mb,[0,h-1.6,0],[2.3,1.5,2.3],greens[0],{detail:1}):canopy(mb,[0,h-1.6,0],[2.3,1.5,2.3],greens[0],r,{count:9,size:.5,colors:greens,coreDetail:2});
    return h;
  },
  araucaria(mb,r,lod){ // araucaria: fuste recto y copa en candelabro de ramas que se curvan hacia arriba
    const h=range(r,15,19),bark=C('#6f5a48');tube(mb,[[0,0,0],[0,h,0]],[.45,.16],lod?5:8,bark,{cap:true});
    const whorls=lod?3:4,dark=C('#2f5736');
    for(let w=0;w<whorls;w++){const y=h*(.62+.36*w/whorls),L=4.2*(1-w/whorls*.62),n=lod?4:5;
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2+w*.55,mid=[Math.cos(a)*L*.62,y-.35,Math.sin(a)*L*.62],e=[Math.cos(a)*L,y+L*.42,Math.sin(a)*L];
        tube(mb,[[0,y,0],mid,e],[.13,.1,.06],lod?3:5,bark,{cap:false});
        // Penacho en la punta: masa alargada en el sentido de la rama.
        puff(mb,[e[0]*.97,e[1]+.05,e[2]*.97],[.95,.42,.95],mix(dark,C('#3c6741'),r()),{detail:lod?0:1,seed:i+w*9,jitter:.14,flatBottom:.2});}}
    puff(mb,[0,h+.15,0],[1.2,.55,1.2],C('#36603b'),{detail:lod?0:1,seed:99,flatBottom:.2});
    return h+.6;
  },
};
// Copa florida en parasol (jacaranda, flamboyán): ramas abiertas y masas de color con algo de verde.
function flowering(mb,r,lod,{h:[h0,h1],spread,colors,greenShare,trunk,flat=false}){
  const h=range(r,h0,h1),bark=C(trunk),fork=h*(flat?.4:.5);
  tube(mb,bezier([0,0,0],[.2,fork*.5,0],[0,fork,0],lod?2:4),[.32,.29,.26,.24,.22].slice(0,lod?3:5),lod?5:8,bark,{cap:false});
  const arms=lod?3:5,tips=[];
  for(let i=0;i<arms;i++){const a=i/arms*Math.PI*2+r()*.5,d=spread*range(r,.55,.85),e=[Math.cos(a)*d,h-(flat?1.4:2)-range(r,0,.6),Math.sin(a)*d];tips.push(e);
    tube(mb,[[0,fork,0],[e[0]*.45,(fork+e[1])/2+.3,e[2]*.45],e],[.17,.12,.07],lod?4:6,bark,{cap:false});}
  const pal=colors.map(C),green=[C('#5f9443'),C('#6fa24c')],cols=Array.from({length:8},(_,i)=>i<Math.round(8*greenShare)?green[i%2]:pal[i%pal.length]);
  const R=[spread*.95,flat?1.25:1.7,spread*.95];
  if(lod){puff(mb,[0,h-(flat?1:1.5),0],R,pal[0],{detail:1,jitter:.16,flatBottom:flat?.35:0});return h;}
  for(const [i,t]of tips.entries())canopy(mb,[t[0]*.75,t[1]+(flat?.7:1.1),t[2]*.75],[R[0]*.55,R[1]*.75,R[2]*.55],pal[i%pal.length],r,{count:3,size:.6,colors:cols,jitter:.14,light:1.18,flatBottom:flat?.45:0});
  puff(mb,[0,h-(flat?.9:1.3),0],[R[0]*.62,R[1]*.72,R[2]*.62],pal[0],{detail:1,seed:42,jitter:.14,light:1.18,flatBottom:flat?.45:0});
  return h;
}
// Columna acanalada (cactus): costillas alternas claras/oscuras, sin follaje.
function ribbedTube(mb,pts,radii,sides,col,lod){
  tube(mb,pts,radii,sides,col,{cap:false,surf:TRUNK,rings:null,seed:7});
  if(lod)return;
  // Aristas claras de las costillas.
  for(let k=0;k<sides;k+=2){const a=k/sides*Math.PI*2,ox=Math.cos(a),oz=Math.sin(a);
    for(let i=0;i<pts.length-1;i++){const p=pts[i],q=pts[i+1],r0=radii[i]*1.04,r1=radii[i+1]*1.04,w=.035;
      mb.quad([p[0]+ox*r0-oz*w,p[1],p[2]+oz*r0+ox*w],[p[0]+ox*r0+oz*w,p[1],p[2]+oz*r0-ox*w],[q[0]+ox*r1+oz*w,q[1],q[2]+oz*r1-ox*w],[q[0]+ox*r1-oz*w,q[1],q[2]+oz*r1+ox*w],mul(col,1.25),TRUNK,[ox,0,oz]);}}
}

export const PROCEDURAL_SPECIES=Object.keys(species);
export const SPECIES_NAMES={palmera:'Palmera canaria',palmera_real:'Palma real',cocotero:'Cocotero',cipres:'Ciprés',pino:'Pino piñonero',olivo:'Olivo',conifera:'Abeto',eucalipto:'Eucalipto',naranjo:'Naranjo',jacaranda:'Jacaranda',flamboyan:'Flamboyán',almendro:'Almendro tropical',acacia:'Acacia',cactus:'Cardón',agave:'Agave',mangle:'Mangle',araucaria:'Araucaria',frondoso:'Frondoso',sakura:'Cerezo de flor'};
// Palmeras: hojas de una sola lámina, visibles por las dos caras.
export const DOUBLE_SIDED=new Set(['palmera','palmera_real','cocotero','agave']);
export const VARIANTS=3;

const built=new Map();
// Geometría (cercana o lejana) de una variante. Origen en la base del tronco; unidades en metros.
export function speciesGeometry(id,variant,lod){
  const key=id+':'+variant+':'+lod;if(built.has(key))return built.get(key);
  if(!species[id])throw Error('Especie desconocida: '+id);
  const mb=new MeshBuilder(),height=species[id](mb,rng('especie:'+id+':'+variant),lod);
  const g=mb.build();
  // Elipsoide de la copa (solo follaje) para el sombreado por volumen; sin follaje, la caja entera.
  const P=g.attributes.position,S=g.attributes.aSurf,box=new THREE.Box3();let any=false;
  for(let i=0;i<P.count;i++)if(S.getX(i)===FOLIAGE){box.expandByPoint(new THREE.Vector3(P.getX(i),P.getY(i),P.getZ(i)));any=true;}
  if(!any)box.copy(g.boundingBox);
  const out={geometry:g,height,crown:{center:box.getCenter(new THREE.Vector3()),radius:box.getSize(new THREE.Vector3()).multiplyScalar(.5)},triangles:P.count/3};
  built.set(key,out);return out;
}
export function disposeSpeciesCache(){for(const v of built.values())v.geometry.dispose();built.clear();}
