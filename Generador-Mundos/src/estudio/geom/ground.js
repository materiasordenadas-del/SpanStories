// Suelo urbano: calzadas con bordillo real (15 cm), aceras, plazas, parques, agua y marcas viales.
// Las capas se calculan como regiones exclusivas (sin solapes => sin parpadeo) y se drapean sobre el DEM.
import * as THREE from 'three';
import {offsetLines,union,difference,intersection,closing,offset,toPaths,polygonPaths,rectPath,tiles,toExPolygons,cleanPaths,pathsArea} from './clip.js';
import {MeshBuilder,SURF,shade} from './mesh.js';
import {GROUND} from './palette.js';
import {rng} from '../data/rng.js';

export const CURB=0.15;
// Pista dura (baloncesto, tenis, polideportiva) frente a césped.
export const isCourt=a=>/basket|tennis|padel|multi|handball|volley/.test(a.tags?.sport||a.sport||'')||['asphalt','concrete','acrylic','tartan','paved'].includes(a.tags?.surface);
const SECTOR=50;

export function buildGround(model,{seed=model.seed}={}){
  const t0=performance.now();
  const {width:W,depth:D}=model.size,T=model.terrain;
  const area=[rectPath(-W/2,-D/2,W/2,D/2)];
  const roadsBy=type=>model.roads.filter(r=>r.type===type&&!r.bridge&&!r.tunnel&&(r.layer??0)>=0);
  const areasBy=(...kinds)=>model.areas.filter(a=>kinds.includes(a.kind));
  const areaPaths=list=>union(list.flatMap(a=>polygonPaths(a.rings)));
  const buildings=union(model.buildings.filter(b=>(b.minHeight??0)<=0&&b.use!=='canopy').flatMap(b=>polygonPaths(b.rings)));

  // --- Calzadas con bordillo ---
  const vehicle=roadsBy('vehicle');
  let asphalt=union(offsetLines(vehicle.map(r=>({points:r.points,width:r.width}))));
  asphalt=intersection(closing(asphalt,2.2),area);
  asphalt=cleanPaths(asphalt,.03);
  const roadBuildingOverlap=pathsArea(intersection(asphalt,buildings));
  asphalt=difference(asphalt,buildings);
  const curbBand=difference(intersection(difference(offset(asphalt,.28),asphalt),area),buildings);

  // --- Capas a ras del suelo (orden: la última manda) ---
  const flush=roadsBy('flush'),ped=roadsBy('pedestrian');
  const parks=areasBy('park','grass','village_green');
  const insidePark=(r)=>{const m=r.points[Math.floor(r.points.length/2)];return parks.some(a=>pointInRings(m[0],m[1],a.rings));};
  const layers=[
    ['school',areaPaths(areasBy('school')),GROUND.school,SURF.paving],
    ['plaza',areaPaths(areasBy('plaza')),GROUND.plaza,15],
    ['farmland',areaPaths(areasBy('farmland')),GROUND.farmland,SURF.grass],
    ['grass',areaPaths(areasBy('grass','park','scrub')),GROUND.grass,SURF.grass],
    ['forest',areaPaths(areasBy('forest')),GROUND.forest,SURF.grass],
    ['gravel',areaPaths(areasBy('gravel')),GROUND.gravel,SURF.paving],
    ['sand',areaPaths(areasBy('sand','playground')),GROUND.sand,SURF.paving],
    ['parking',areaPaths(areasBy('parking')),GROUND.parking,SURF.asphalt],
    ['pitch',areaPaths(model.areas.filter(a=>a.kind==='pitch'&&!isCourt(a))),GROUND.pitch,SURF.grass],
    ['court',areaPaths(model.areas.filter(a=>a.kind==='pitch'&&isCourt(a))),GROUND.court,SURF.paving],
    ['track',areaPaths(areasBy('track')),GROUND.track,SURF.paving],
    ['flush',union(offsetLines(flush.map(r=>({points:r.points,width:r.width})))),GROUND.asphaltLight,SURF.asphalt],
    ['path',union(offsetLines(ped.filter(insidePark).map(r=>({points:r.points,width:r.width})))),GROUND.albero,SURF.paving],
    ['walk',union(offsetLines(ped.filter(r=>!insidePark(r)&&r.cls!=='pedestrian').map(r=>({points:r.points,width:r.width})))),GROUND.pavingAlt,SURF.paving],
    ['pedestrian',union(offsetLines(ped.filter(r=>r.cls==='pedestrian').map(r=>({points:r.points,width:r.width})))),GROUND.pedestrian,15],
    ['sea',areaPaths(model.areas.filter(a=>a.kind==='water'&&a.sea)),GROUND.sea,SURF.water],
    ['water',areaPaths(model.areas.filter(a=>a.kind==='water'&&!a.sea)),GROUND.water,SURF.water],
    ['pool',areaPaths(areasBy('pool')),GROUND.pool,SURF.water],
    // Muelles y espigones sobre el agua: tablero de madera/hormigón y escollera.
    ['breakwater',areaPaths(areasBy('breakwater')),GROUND.breakwater,SURF.paving],
    ['pier',areaPaths(areasBy('pier')),GROUND.pier,SURF.paving],
  ];
  // El mar es plano al nivel del mar (las celdas marinas del relieve ya están fijadas a 0 m).
  const seaY=(model.sea?.level??0)-.45;
  // Regiones exclusivas: cada capa pierde lo que tapan las de encima, la calzada y el bordillo.
  let above=union(asphalt.concat(curbBand));
  const exclusive=[];
  for(let i=layers.length-1;i>=0;i--){
    const [name,paths,col,surf]=layers[i];
    if(!paths.length)continue;
    const own=intersection(difference(paths,above),area);
    if(own.length)exclusive.unshift({name,paths:own,color:col,surf});
    above=union(above.concat(paths));
  }
  const base=difference(area,above);

  // --- Malla por sectores ---
  const builders=new Map();
  const builder=(x,z)=>{const k=Math.floor((x+W/2)/SECTOR)+':'+Math.floor((z+D/2)/SECTOR);if(!builders.has(k))builders.set(k,new MeshBuilder());return builders.get(k);};
  const r=rng(seed+':suelo');
  const jitter=(c,amt)=>shade(c,1+(r()-.5)*amt);
  const lay=(paths,yOff,col,surf,{maxEdge=7,vary=0,flatY=null}={})=>{
    if(model.groundHoles?.length)paths=difference(paths,model.groundHoles);
    if(model.terrainSource?.kind==='local-dem')maxEdge=Math.max(.75,Math.min(maxEdge,Math.max(T.width,T.depth)/(T.n-1)*2));
    for(const tile of tiles(paths,50,W,D)){
      const mb=builder((tile.x0+tile.x1)/2,(tile.z0+tile.z1)/2);
      for(const p of tile.polys)mb.polygon(p.outer,p.holes,flatY!=null?()=>flatY:(x,z)=>T.height(x,z)+yOff,vary?jitter(col,vary):col,surf,{maxEdge});
    }
  };
  lay(base,CURB,GROUND.paving,SURF.paving,{vary:.04});
  for(const l of exclusive){
    const y=l.name==='water'?-.45:l.name==='pool'?-.1:l.name==='flush'||l.name==='parking'?CURB-.005:CURB;
    if(l.name==='sea'){lay(l.paths,0,l.color,l.surf,{vary:.015,flatY:seaY,maxEdge:25});continue;}
    lay(l.paths,y,l.color,l.surf,{vary:l.name==='grass'||l.name==='forest'?.05:.02});
  }
  lay(asphalt,0,GROUND.asphalt,SURF.asphalt);
  lay(curbBand,CURB,GROUND.curb,SURF.paving);

  // --- Paredes verticales: bordillos (calzada) y orillas (agua) ---
  const walls=new MeshBuilder();
  const rim=(paths,yTop,yBottom,col,faceInside,{bottomAbs=null}={})=>{
    for(const p of toExPolygons(paths))for(const ring of [p.outer,...p.holes]){
      const sgn=Math.sign(signedArea(ring));
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
        if(len<1e-3)continue;
        const steps=Math.max(1,Math.ceil(len/6));
        for(let s=0;s<steps;s++){
          const u0=s/steps,u1=(s+1)/steps,p0=[a[0]+(b[0]-a[0])*u0,a[1]+(b[1]-a[1])*u0],p1=[a[0]+(b[0]-a[0])*u1,a[1]+(b[1]-a[1])*u1];
          const h0=T.height(...p0),h1=T.height(...p1);
          // El interior del anillo exterior queda a la izquierda si el área es positiva.
          const b0=bottomAbs??h0+yBottom,b1=bottomAbs??h1+yBottom;if(bottomAbs!=null&&h0+yTop<=bottomAbs&&h1+yTop<=bottomAbs)continue;
          const A=[p0[0],b0,p0[1]],B=[p1[0],b1,p1[1]],Cc=[p1[0],h1+yTop,p1[1]],Dd=[p0[0],h0+yTop,p0[1]];
          const facesLeft=(sgn>0)===faceInside;
          if(facesLeft)walls.quad(A,B,Cc,Dd,col,SURF.paving);else walls.quad(B,A,Dd,Cc,col,SURF.paving);
        }
      }
    }
  };
  rim(asphalt,CURB,0,GROUND.curbSide,true);
  const water=exclusive.find(l=>l.name==='water');if(water)rim(water.paths,CURB,-.45,shade(GROUND.curbSide,.95),true);
  const sea=exclusive.find(l=>l.name==='sea');if(sea)rim(sea.paths,CURB,0,shade(GROUND.curbSide,.9),true,{bottomAbs:seaY-.6});
    const pool=exclusive.find(l=>l.name==='pool');if(pool)rim(pool.paths,CURB,-.1,GROUND.poolRim,true);

  // --- Marcas viales ---
  const marks=new MeshBuilder();
  const americas=model.bounds&&model.bounds.centerLon<-30;
  roadMarkings(model,vehicle,asphalt,T,marks,{yellow:americas});
  pitchMarkings(areasBy('pitch'),T,marks);
  trackMarkings(areasBy('track'),T,marks);

  const meshes=[];
  for(const [key,mb]of builders)if(mb.vertexCount)meshes.push({key:'suelo:'+key,geometry:mb.build(),kind:'ground'});
  if(walls.vertexCount)meshes.push({key:'bordillos',geometry:walls.build(),kind:'ground'});
  if(marks.vertexCount)meshes.push({key:'marcas',geometry:marks.build(),kind:'marks'});
  return {meshes,asphalt,curbBand,exclusive,stats:{ms:Math.round(performance.now()-t0),asphaltPaths:asphalt.length,roadBuildingOverlap}};
}

function signedArea(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return s/2;}
function inRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export const pointInRings=(x,z,rings)=>inRing(x,z,rings[0])&&!rings.slice(1).some(r=>inRing(x,z,r));
export function pointInPaths(x,z,exPolys){return exPolys.some(p=>inRing(x,z,p.outer)&&!p.holes.some(h=>inRing(x,z,h)));}

// Nodos compartidos por varias calles = cruces.
export function junctions(roads){
  const key=p=>Math.round(p[0]*20)+':'+Math.round(p[1]*20);
  const map=new Map();
  for(const r of roads)r.points.forEach((p,i)=>{const k=key(p);const e=map.get(k)??{x:p[0],z:p[1],roads:[],count:0};
    e.count+=(i===0||i===r.points.length-1)?1:2;e.roads.push(r);map.set(k,e);});
  return [...map.values()].filter(e=>e.count>=3);
}

function roadMarkings(model,vehicle,asphalt,T,mb,{yellow}){
  const asphaltEx=toExPolygons(asphalt);
  const onAsphalt=(x,z)=>pointInPaths(x,z,asphaltEx);
  const J=junctions(vehicle);
  const nearJunction=(x,z,extra=0)=>J.some(j=>Math.hypot(j.x-x,j.z-z)<jRadius(j)+extra);
  const jRadius=j=>Math.max(...j.roads.map(r=>r.width))/2+1.5;
  const white=GROUND.marking,center=yellow?GROUND.markingYellow:GROUND.marking;
  const y=(x,z)=>T.height(x,z)+.012;
  const stripe=(x,z,dx,dz,len,wid,col)=>{ // rectángulo centrado orientado (dx,dz)
    const nx=-dz,nz=dx,hl=len/2,hw=wid/2;
    const P=(a,b)=>[x+dx*a+nx*b,0,z+dz*a+nz*b];
    const q=[P(-hl,-hw),P(hl,-hw),P(hl,hw),P(-hl,hw)].map(p=>[p[0],y(p[0],p[2]),p[2]]);
    if(q.some(p=>!onAsphalt(p[0],p[2]))){
      const clipped=intersection(toPaths([q.map(p=>[p[0],p[2]])]),asphalt);
      for(const polygon of toExPolygons(clipped))mb.polygon(polygon.outer,polygon.holes,y,col,SURF.paving);
      return;
    }
    // normal hacia arriba: ordenar para que el producto cruzado 2D sea negativo
    const cross=(q[1][0]-q[0][0])*(q[2][2]-q[0][2])-(q[1][2]-q[0][2])*(q[2][0]-q[0][0]);
    if(cross>0)mb.quad(q[0],q[3],q[2],q[1],col,SURF.paving,[0,1,0]);else mb.quad(q[0],q[1],q[2],q[3],col,SURF.paving,[0,1,0]);
  };
  // Eje central discontinuo
  for(const r of vehicle){
    if(r.width<6.2||r.oneway&&!(r.lanes>1))continue;
    const dashed=!(r.width>13);
    walk(r.points,dashed?4.5:3,(x,z,dx,dz,step)=>{
      if(nearJunction(x,z,3)||!onAsphalt(x,z))return;
      if(r.oneway&&r.lanes>1){const lw=r.width/r.lanes;for(let k=1;k<r.lanes;k++){const o=-r.width/2+lw*k;if(step%2===0)stripe(x-dz*o,z+dx*o,dx,dz,2.2,.12,white);}return;}
      if(dashed&&step%2)return;
      stripe(x,z,dx,dz,dashed?2.6:3.05,.13,center);
      if(r.lanes>=4){const o=r.width/4;if(step%2===0){stripe(x-dz*o,z+dx*o,dx,dz,2.2,.12,white);stripe(x+dz*o,z-dx*o,dx,dz,2.2,.12,white);}}
    });
  }
  // Pasos de cebra: nodos OSM de cruce + accesos a cruces urbanos.
  const crossings=[];
  for(const p of model.points.filter(p=>p.kind==='crossing'||p.kind==='signal')){
    const near=nearestSegment(vehicle,p.x,p.z,4);
    if(near)crossings.push({x:p.x,z:p.z,dx:near.dx,dz:near.dz,width:near.road.width});
  }
  const urban=model.buildings.length>20;
  if(urban)for(const j of J){
    if(j.roads.length<3&&j.count<3)continue;
    for(const r of j.roads){
      if(['service'].includes(r.cls)||r.width<5)continue;
      const dir=awayDirection(r,j);if(!dir)continue;
      const d=jRadius(j)+2.2,x=j.x+dir[0]*d,z=j.z+dir[1]*d;
      if(crossings.some(c=>Math.hypot(c.x-x,c.z-z)<9))continue;
      crossings.push({x,z,dx:dir[0],dz:dir[1],width:r.width});
    }
  }
  for(const c of crossings){
    const nx=-c.dz,nz=c.dx,count=Math.max(3,Math.floor((c.width-.6)/1.0));
    for(let k=0;k<count;k++){
      const o=-((count-1)*1.0)/2+k*1.0,x=c.x+nx*o,z=c.z+nz*o;
      if(onAsphalt(x,z))stripe(x,z,c.dx,c.dz,3.2,.5,white);
    }
  }
}

function walk(points,step,fn){
  let carry=step/2,count=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-3)continue;
    const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
    for(let s=carry;s<len;s+=step){fn(a[0]+dx*s,a[1]+dz*s,dx,dz,count++);carry=s+step-len;}
    if(carry<0)carry=0;
  }
}

export function nearestSegment(roads,x,z,maxDist){
  let best=null;
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz;if(!L2)continue;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/L2)),px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);
    if(d<=maxDist&&(!best||d<best.d)){const L=Math.sqrt(L2);best={d,road,dx:dx/L,dz:dz/L,px,pz,t,i};}
  }
  return best;
}

function awayDirection(r,j){
  const pts=r.points;
  for(let i=0;i<pts.length;i++){
    if(Math.hypot(pts[i][0]-j.x,pts[i][1]-j.z)>.06)continue;
    const n=i<pts.length-1?pts[i+1]:pts[i-1];
    // Si el nodo es interior la calle sale por los dos lados: se usan ambas (la otra la añade la siguiente pasada)
    const dx=n[0]-j.x,dz=n[1]-j.z,l=Math.hypot(dx,dz);if(l<1)return null;
    return [dx/l,dz/l];
  }
  return null;
}

function pitchMarkings(pitches,T,mb){
  for(const p of pitches){
    const ring=p.rings[0];if(ring.length<4||p.area<200)continue;
    // Rectángulo orientado por la arista más larga.
    let best=0,ang=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>best){best=l;ang=Math.atan2(b[1]-a[1],b[0]-a[0]);}}
    const c=Math.cos(ang),s=Math.sin(ang),loc=ring.map(([x,z])=>[x*c+z*s,-x*s+z*c]);
    const minU=Math.min(...loc.map(q=>q[0])),maxU=Math.max(...loc.map(q=>q[0])),minV=Math.min(...loc.map(q=>q[1])),maxV=Math.max(...loc.map(q=>q[1]));
    const sport=p.tags?.sport||p.sport||'';
    const inset=isCourt(p)?1.0:1.2,u0=minU+inset,u1=maxU-inset,v0=minV+inset,v1=maxV-inset;if(u1-u0<8||v1-v0<5)continue;
    const W=(u,v)=>[u*c-v*s,u*s+v*c];
    const line=(ua,va,ub,vb)=>{const A=W(ua,va),B=W(ub,vb),dx=B[0]-A[0],dz=B[1]-A[1],L=Math.hypot(dx,dz),nx=-dz/L*.06,nz=dx/L*.06;
      const y=(x,z)=>T.height(x,z)+CURB+.012;
      const q=[[A[0]-nx,0,A[1]-nz],[B[0]-nx,0,B[1]-nz],[B[0]+nx,0,B[1]+nz],[A[0]+nx,0,A[1]+nz]].map(v=>[v[0],y(v[0],v[2]),v[2]]);
      const cr=(q[1][0]-q[0][0])*(q[2][2]-q[0][2])-(q[1][2]-q[0][2])*(q[2][0]-q[0][0]);
      if(cr>0)mb.quad(q[0],q[3],q[2],q[1],GROUND.pitchLine,SURF.paving,[0,1,0]);else mb.quad(q[0],q[1],q[2],q[3],GROUND.pitchLine,SURF.paving,[0,1,0]);};
    line(u0,v0,u1,v0);line(u1,v0,u1,v1);line(u1,v1,u0,v1);line(u0,v1,u0,v0);
    const arc=(cu,cv,rr,a0,a1)=>{const n=16;for(let k=0;k<n;k++){const t0=a0+(a1-a0)*k/n,t1=a0+(a1-a0)*(k+1)/n;line(cu+Math.cos(t0)*rr,cv+Math.sin(t0)*rr,cu+Math.cos(t1)*rr,cv+Math.sin(t1)*rr);}};
    if(/basket/.test(sport)){
      const um=(u0+u1)/2,vm=(v0+v1)/2,L=u1-u0,K=Math.min(5.8,L*.2),kw=Math.min(4.9,(v1-v0)*.33),R3=Math.min(6.75,L*.24);
      line(um,v0,um,v1);arc(um,vm,1.8,0,Math.PI*2);
      for(const [ue,sg]of [[u0,1],[u1,-1]]){line(ue,vm-kw/2,ue+sg*K,vm-kw/2);line(ue+sg*K,vm-kw/2,ue+sg*K,vm+kw/2);line(ue+sg*K,vm+kw/2,ue,vm+kw/2);
        arc(ue+sg*K,vm,1.8,sg>0?-Math.PI/2:Math.PI/2,sg>0?Math.PI/2:Math.PI*1.5);arc(ue+sg*1.6,vm,R3,sg>0?-Math.PI/2:Math.PI/2,sg>0?Math.PI/2:Math.PI*1.5);}
      continue;
    }
    if(/tennis|padel/.test(sport)){
      const um=(u0+u1)/2,vm=(v0+v1)/2,sw=Math.min(4.11,(v1-v0)*.37);
      line(um,v0,um,v1);line(u0,vm-sw,u1,vm-sw);line(u0,vm+sw,u1,vm+sw);
      for(const sg of [-1,1]){line(um+sg*6.4,vm-sw,um+sg*6.4,vm+sw);}line(um-6.4,vm,um+6.4,vm);
      continue;
    }
    const um=(u0+u1)/2,vm=(v0+v1)/2,rad=Math.min(9.15,(v1-v0)/4);
    line(um,v0,um,v1);
    for(let k=0;k<24;k++){const a0=k/24*Math.PI*2,a1=(k+1)/24*Math.PI*2;line(um+Math.cos(a0)*rad,vm+Math.sin(a0)*rad,um+Math.cos(a1)*rad,vm+Math.sin(a1)*rad);}
    const bw=Math.min(16.5,(u1-u0)/6),bh=Math.min(40.3,(v1-v0)*.6);
    for(const [ue,sg]of [[u0,1],[u1,-1]]){line(ue,vm-bh/2,ue+sg*bw,vm-bh/2);line(ue+sg*bw,vm-bh/2,ue+sg*bw,vm+bh/2);line(ue+sg*bw,vm+bh/2,ue,vm+bh/2);}
  }
}

// Pista de atletismo: calles de 1,22 m pintadas desde el borde exterior.
function trackMarkings(tracks,T,mb){
  for(const t of tracks){
    if(t.area<300)continue;
    const base=toPaths(t.rings.slice(0,1));
    const lanes=Math.min(8,Math.max(4,Math.floor(Math.sqrt(t.area)/14)));
    const y=(x,z)=>T.height(x,z)+CURB+.012;
    for(let k=0;k<=lanes;k++){
      const d=.35+k*1.22;
      const band=difference(offset(base,-d+.03),offset(base,-d-.03));
      for(const p of toExPolygons(band))mb.polygon(p.outer,p.holes,y,GROUND.pitchLine,SURF.paving,{maxEdge:6});
    }
  }
}
