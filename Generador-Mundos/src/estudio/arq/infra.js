// Infraestructura: puentes (tablero, pretiles, pilas), escalinatas, cauces lineales y vías férreas.
import * as THREE from 'three';
import {SURF,shade} from '../geom/mesh.js';
import {GROUND} from '../geom/palette.js';
import {offsetLines,union,toExPolygons,difference,toPaths,polygonPaths} from '../geom/clip.js';
import {pointInRings,pointInPaths,seaSurfaceY,CURB} from '../geom/ground.js';
import {registerBuilders} from './elements.js';
import {sampleRoad as sample,roadHeightFunction} from '../geom/road-surface.js';

// Traviesa de hormigón (2,4 m, perpendicular a la vía).
registerBuilders({sleeper:(mb)=>{mb.box(0,.06,0,1.2,.07,.13,0,new THREE.Color('#a39d93'),SURF.paving);}});

const col=hex=>new THREE.Color(hex);
const CONCRETE=col('#cfc9bd'),STONE=col('#d8ccb4'),PARAPET=col('#e2dccf');


// Banda de ancho w a lo largo de muestras con altura y(s); cara superior + caras laterales hasta yBottom.
function ribbon(mb,S,w,y,col,surf,{sides=0,sideCol=CONCRETE,doubleSided=false}={}){
  for(let i=1;i<S.length;i++){
    const a=S[i-1],b=S[i],na=[-a.dz,a.dx],nb=[-b.dz,b.dx];
    const ya=y(a),yb=y(b);
    const L=[a.x+na[0]*w/2,ya,a.z+na[1]*w/2],R=[a.x-na[0]*w/2,ya,a.z-na[1]*w/2],L2=[b.x+nb[0]*w/2,yb,b.z+nb[1]*w/2],R2=[b.x-nb[0]*w/2,yb,b.z-nb[1]*w/2];
    const cr=(L2[0]-L[0])*(R[2]-L[2])-(L2[2]-L[2])*(R[0]-L[0]);
    if(cr<0)mb.quad(L,L2,R2,R,col,surf);else mb.quad(L,R,R2,L2,col,surf);
    if(doubleSided){if(cr<0)mb.quad(L,R,R2,L2,col,surf);else mb.quad(L,L2,R2,R,col,surf);}
    if(sides>0){const dL=[L[0],L[1]-sides,L[2]],dL2=[L2[0],L2[1]-sides,L2[2]],dR=[R[0],R[1]-sides,R[2]],dR2=[R2[0],R2[1]-sides,R2[2]];
      mb.quad(dL,dL2,L2,L,sideCol,SURF.wall);mb.quad(L,L2,dL2,dL,sideCol,SURF.wall);
      mb.quad(dR2,dR,R,R2,sideCol,SURF.wall);mb.quad(R2,R,dR,dR2,sideCol,SURF.wall);
      mb.quad(dL2,dL,dR,dR2,shade(sideCol,.85),SURF.wall);}
  }
}

export function buildInfra(model,{mb,inst,seed}){
  const T=model.terrain,counts={bridges:0,tunnels:0,steps:0,waterways:0,rails:0},walkSurfaces=[];
  const {width:W,depth:D}=model.size,inArea=(x,z)=>Math.abs(x)<W/2&&Math.abs(z)<D/2;
  // --- Puentes y pasos elevados
  for(const r of model.roads.filter(r=>r.bridge&&r.points.length>=2)){
    mb.setId(model.roads.indexOf(r)+1);
    const S=sample(r.points,4);if(S.length<2)continue;
    const len=S.at(-1).s||1,y=roadHeightFunction(r,T,len);
    const deckW=r.width+(r.type==='vehicle'?3.2:.8);
    walkSurfaces.push({id:r.id,kind:'bridge',width:deckW,points:S.map(p=>({...p,y:y(p)}))});
    ribbon(mb,S,deckW,y,r.type==='vehicle'?GROUND.asphalt:GROUND.pavingAlt,r.type==='vehicle'?SURF.asphalt:SURF.paving,{sides:.9});
    // aceras sobre el tablero y pretiles
    if(r.type==='vehicle')for(const sg of [-1,1]){const off=deckW/2-.8;
      const Ss=S.map(p=>({...p,x:p.x-p.dz*off*sg,z:p.z+p.dx*off*sg}));ribbon(mb,Ss,1.6,p=>y(p)+.15,GROUND.paving,SURF.paving);}
    for(const sg of [-1,1]){const off=deckW/2-.15;
      const Ss=S.map(p=>({...p,x:p.x-p.dz*off*sg,z:p.z+p.dx*off*sg}));
      ribbon(mb,Ss,.3,p=>y(p)+1.05,PARAPET,SURF.trim,{sides:1.05,sideCol:STONE});}
    // pilas donde el suelo queda lejos
    for(let i=1;i<S.length-1;i++){const p=S[i];if(i%6)continue;const g=T.height(p.x,p.z),top=y(p);if(top-g<3)continue;
      mb.box(p.x,(top+g-1.5)/2,p.z,.9,(top-g+1.5)/2-.9,deckW/2-.4,-Math.atan2(p.dz,p.dx),STONE,21);}
    counts.bridges++;
  }
  for(const r of model.roads.filter(r=>r.tunnel&&r.renderTunnel&&r.points.length>=2)){
    mb.setId(model.roads.indexOf(r)+1);const S=sample(r.points,3),length=S.at(-1).s||1,y=roadHeightFunction(r,T,length),clearance=r.clearance??4.8;
    ribbon(mb,S,r.width,y,GROUND.asphalt,SURF.asphalt);
    ribbon(mb,S,r.width+.5,p=>y(p)+clearance,CONCRETE,SURF.wall,{doubleSided:true});
    for(const side of [-1,1]){const edge=S.map(p=>({...p,x:p.x-p.dz*(r.width/2+.1)*side,z:p.z+p.dx*(r.width/2+.1)*side}));ribbon(mb,edge,.2,p=>y(p)+clearance,CONCRETE,SURF.wall,{sides:clearance});}
    walkSurfaces.push({id:r.id,kind:'tunnel',width:r.width,points:S.map(p=>({...p,y:y(p)}))});counts.tunnels++;
  }
  // --- Escalinatas
  for(const r of model.roads.filter(r=>r.cls==='steps'&&!r.bridge&&!r.tunnel&&(r.layer??0)>=0)){
    mb.setId(model.roads.indexOf(r)+1);
    const pts=r.points,L=pts.reduce((s,p,i)=>i?s+Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]):0,0);if(L<1.2)continue;
    const h0=T.height(...pts[0]),h1=T.height(...pts.at(-1)),dh=h1-h0;if(Math.abs(dh)<.35)continue;
    const n=Math.max(2,Math.round(Math.abs(dh)/.16)),S=sample(pts,L/n);
    for(let i=0;i<S.length-1;i++){const a=S[i],b=S[i+1],t=(i+.5)/(S.length-1),yy=h0+dh*t+.15;
      const cx=(a.x+b.x)/2,cz=(a.z+b.z)/2,ext=Math.max(.15,yy-(Math.min(h0,h1)-.3));
      mb.box(cx,yy-ext/2,cz,Math.hypot(b.x-a.x,b.z-a.z)/2+.01,ext/2,r.width/2,-Math.atan2(a.dz,a.dx),col('#d9d2c4'),SURF.paving);}
    counts.steps++;
  }
  // --- Cauces lineales (sin polígono de agua)
  mb.setId(0);
  const waterAreas=model.areas.filter(a=>a.kind==='water');
  const WW={river:14,stream:3,canal:9,drain:2,ditch:1.5};
  const streams=model.lines.filter(l=>l.kind==='waterway'&&WW[l.sub]&&!l.points.some(p=>waterAreas.some(a=>pointInRings(p[0],p[1],a.rings))));
  for(const l of streams){
    const w=l.width??WW[l.sub];
    const S=sample(l.points,5);
    ribbon(mb,S,w+1.2,p=>T.height(p.x,p.z)+.16,shade(GROUND.curb,.95),SURF.paving);
    ribbon(mb,S,w,p=>T.height(p.x,p.z)-.25,GROUND.water,SURF.water);
    counts.waterways++;
  }
  // --- Vías férreas y de tranvía
  for(const l of model.lines.filter(l=>l.kind==='rail'&&['rail','tram','light_rail','narrow_gauge','funicular'].includes(l.sub))){
    const tram=l.sub==='tram',S=sample(l.points,.62);
    if(S.length<2)continue;
    const y=p=>T.height(p.x,p.z)+(tram?.01:.2);
    if(!tram)ribbon(mb,sample(l.points,4),3.0,p=>T.height(p.x,p.z)+.17,GROUND.gravel,SURF.paving);
    for(const g of [-.72,.72]){const Ss=S.filter((_,i)=>i%4===0||i===S.length-1).map(p=>({...p,x:p.x-p.dz*g,z:p.z+p.dx*g}));
      ribbon(mb,Ss,.08,p=>y(p)+(tram?.006:.16),col('#8c8f94'),SURF.metal);}
    if(!tram)for(let i=0;i<S.length;i++){const p=S[i];if(!inArea(p.x,p.z))continue;
      inst.add('sleeper',{},[p.x,y(p)-.02,p.z],-Math.atan2(p.dz,p.dx)+Math.PI/2,null);}
    counts.rails++;
  }
  counts.piers=buildPiers(model,{mb,inst});
  return {...counts,walkSurfaces};
}

// Muelles sobre el mar: pilotes bajo el tablero y barandilla en los costados que dan al agua.
const PILE=col('#6d5038');
function buildPiers(model,{mb,inst}){
  const piers=model.areas.filter(a=>a.kind==='pier');if(!piers.length)return 0;
  const T=model.terrain,seaEx=toExPolygons(union(model.areas.filter(a=>a.kind==='water'&&a.sea).flatMap(a=>polygonPaths(a.rings))));
  if(!seaEx.length)return 0;
  const pierEx=toExPolygons(union(piers.flatMap(a=>polygonPaths(a.rings)))),seaY=seaSurfaceY(model),{width:W,depth:D}=model.size;
  const inside=(x,z)=>Math.abs(x)<W/2-.3&&Math.abs(z)<D/2-.3;
  let piles=0;
  for(const p of pierEx)for(const ring of [p.outer,...p.holes])for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.5)continue;
    const d=[(b[0]-a[0])/len,(b[1]-a[1])/len];let n=[-d[1],d[0]];
    const m=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(pointInPaths(m[0]+n[0]*.3,m[1]+n[1]*.3,pierEx))n=[-n[0],-n[1]]; // n: hacia fuera del muelle
    const k=Math.max(1,Math.round(len/3.5)),yaw=-Math.atan2(d[1],d[0]);
    for(let s=0;s<k;s++){
      const t=(s+.5)/k*len,x=a[0]+d[0]*t,z=a[1]+d[1]*t;if(!inside(x,z))continue;
      if(!pointInPaths(x+n[0]*.6,z+n[1]*.6,seaEx))continue; // costado contra tierra: sin pilotes ni barandilla
      const top=T.height(x,z)+CURB,px=x-n[0]*.35,pz=z-n[1]*.35;
      mb.box(px,(top-.25+seaY-1.4)/2,pz,.16,(top-.25-(seaY-1.4))/2,.16,yaw,PILE,SURF.base);piles++;
      inst.add('fence',{h:1.0},[x-n[0]*.12,top,z-n[1]*.12],yaw,null,{scale:[len/k/2.5,1,1]});
    }
  }
  return piles;
}
