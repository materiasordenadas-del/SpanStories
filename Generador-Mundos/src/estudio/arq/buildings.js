// Edificios: masas sobre la huella real, análisis de medianeras y frentes de calle,
// gramática de fachada por estilo (plantas, crujías, huecos, balcones, comercios) y cubiertas.
import * as THREE from 'three';
import {MeshBuilder,SURF,shade,simplifyRing,ringSignedArea} from '../geom/mesh.js';
import {offset,toPaths,toExPolygons} from '../geom/clip.js';
import {ROOF,SIGN,AWNING,FACADE} from '../geom/palette.js';
import {rng,pick,range,weighted} from '../data/rng.js';
import {STYLES,regionOf,chooseStyle} from './styles.js';
import {InstanceSet} from './instances.js';
import {buildChurch} from './church.js';
import {appearancePolicy,recordedRoof} from '../data/appearance-policy.js';
import {safeColor,wallColour,roofColour,wallSurface,roofSurfaceType} from './appearance.js';
import {facadeStyle} from './facade-profile.js';
import {interiorPlan,splitWallForDoor} from './interior.js';
import {CURB} from '../geom/ground.js';

const SECTOR=50;
// Superficies de muro que el pase de composición convierte en ladrillo o sillería.
export const SURF_BRICK=14,SURF_ASHLAR=21;
const BRICK=new Set(FACADE.ladrillo);
const col=hex=>new THREE.Color(hex);

// ------------------------------------------------------------------ utilidades geométricas
function inRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const inPoly=(x,z,rings)=>inRing(x,z,rings[0])&&!rings.slice(1).some(r=>inRing(x,z,r));

// Desplazamiento con inglete de un anillo (d>0 hacia fuera del sólido). Conserva la correspondencia de vértices.
export function miterOffset(ring,d,limit=3){
  const n=ring.length,out=[];
  for(let i=0;i<n;i++){
    const a=ring[(i-1+n)%n],b=ring[i],c=ring[(i+1)%n];
    const e1=norm2(b[0]-a[0],b[1]-a[1]),e2=norm2(c[0]-b[0],c[1]-b[1]);
    // normal exterior (aire a la derecha): (dz,-dx)
    const n1=[e1[1],-e1[0]],n2=[e2[1],-e2[0]];
    let mx=n1[0]+n2[0],mz=n1[1]+n2[1];const ml=Math.hypot(mx,mz);
    if(ml<1e-6){out.push([b[0]+n1[0]*d,b[1]+n1[1]*d]);continue;}
    mx/=ml;mz/=ml;
    const cos=mx*n1[0]+mz*n1[1];
    const len=Math.min(limit*Math.abs(d),Math.abs(d)/Math.max(.2,cos))*Math.sign(d);
    out.push([b[0]+mx*len,b[1]+mz*len]);
  }
  return out;
}
function norm2(x,z){const l=Math.hypot(x,z)||1;return [x/l,z/l];}

// Radio inscrito aproximado (polo de inaccesibilidad por muestreo): sirve para huellas en L, U o cuña.
function inradius(ring){
  const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  const step=Math.max(.8,Math.min(x1-x0,z1-z0)/10);
  const dist=(x,z)=>{let best=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz||1;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/L2));best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));}return best;};
  let best=0,n=0;
  for(let x=x0+step/2;x<x1&&n<500;x+=step)for(let z=z0+step/2;z<z1&&n<500;z+=step){n++;if(inRing(x,z,ring))best=Math.max(best,dist(x,z));}
  return best;
}
// Profundidad del edificio detrás de una fachada (rayo hacia dentro desde el centro de la arista).
function inwardDepth(e,rings){
  const ox=e.mid[0]-e.n[0]*.05,oz=e.mid[1]-e.n[1]*.05,dx=-e.n[0],dz=-e.n[1];let best=Infinity;
  for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],ex=b[0]-a[0],ez=b[1]-a[1];
    const den=dx*ez-dz*ex;if(Math.abs(den)<1e-9)continue;
    const t=((a[0]-ox)*ez-(a[1]-oz)*ex)/den,u=((a[0]-ox)*dz-(a[1]-oz)*dx)/den;
    if(t>.1&&u>=0&&u<=1)best=Math.min(best,t);}
  return best;
}

// Rectángulo orientado mínimo por aristas (para cubiertas inclinadas).
function obb(ring){
  let best=null;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],ang=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(ang),s=Math.sin(ang);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const p of ring){const u=p[0]*c+p[1]*s,v=-p[0]*s+p[1]*c;u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v);}
    const area=(u1-u0)*(v1-v0);
    if(!best||area<best.area)best={area,ang,c,s,u0,u1,v0,v1};
  }
  const W=(u,v)=>[u*best.c-v*best.s,u*best.s+v*best.c];
  return {...best,W,len:best.u1-best.u0,wid:best.v1-best.v0};
}

// ------------------------------------------------------------------ índice espacial de aristas
class EdgeIndex{
  constructor(cell=12){this.cell=cell;this.map=new Map();}
  key(i,j){return i+':'+j;}
  add(e){const c=this.cell,x0=Math.floor(Math.min(e.a[0],e.b[0])/c),x1=Math.floor(Math.max(e.a[0],e.b[0])/c),z0=Math.floor(Math.min(e.a[1],e.b[1])/c),z1=Math.floor(Math.max(e.a[1],e.b[1])/c);
    for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++){const k=this.key(i,j);(this.map.get(k)??this.map.set(k,[]).get(k)).push(e);}}
  near(x,z,r){const c=this.cell,out=new Set();for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((z-r)/c);j<=Math.floor((z+r)/c);j++)for(const e of this.map.get(this.key(i,j))??[])out.add(e);return out;}
}

// ------------------------------------------------------------------ construcción
export function buildBuildings(model,{seed=model.seed,roadSegments=[],plazas=[],pedestrian=[],skipIds=new Set(),renderIds=null,groundHeightAt=null,decor=true}={}){
  const t0=performance.now();
  const region=regionOf(model.bounds),T=model.terrain;
  const inst=new InstanceSet();
  const sectors=new Map(),W=model.size.width,D=model.size.depth;
  const sectorOf=(x,z)=>{const k=Math.floor((x+W/2)/SECTOR)+':'+Math.floor((z+D/2)/SECTOR);if(!sectors.has(k))sectors.set(k,new MeshBuilder());return sectors.get(k);};

  // Preparación
  const prepared=[];
  model.buildings.forEach((b,index)=>{
    const rings=[];
    for(let k=0;k<b.rings.length;k++){
      let r=simplifyRing(b.rings[k],.3,.03);
      if(r.length<3)continue;
      const area=ringSignedArea(r);
      if(k===0&&area<0||k>0&&area>0)r=r.slice().reverse();
      if(Math.abs(area)<(k===0?4:6))continue;
      rings.push(r);
    }
    if(!rings.length||ringSignedArea(rings[0])<=0)return;
    // Contorno conservado junto a sus partes: 12 cm hacia dentro para no compartir plano con ellas.
    if(b.partialParts)for(let k=0;k<rings.length;k++){const o=miterOffset(rings[k],k===0?-.12:.12);if(o.length>=3&&Math.sign(ringSignedArea(o))===Math.sign(ringSignedArea(rings[k])))rings[k]=o;}
    const r=rng(seed+':arq:'+b.id);
    const styleId=chooseStyle(b,region,r);
    const st=STYLES[styleId]??STYLES.madrid_clasico;
    let gmin=Infinity,gmax=-Infinity;for(const p of rings[0]){const h=T.height(p[0],p[1]);gmin=Math.min(gmin,h);gmax=Math.max(gmax,h);}
    const base=(b.minHeight>0?gmax+b.minHeight:gmax)+(b.baseOffset??0);
    const top=gmax+b.minHeight+b.height+(b.baseOffset??0);
    const cx=rings[0].reduce((s,p)=>s+p[0],0)/rings[0].length,cz=rings[0].reduce((s,p)=>s+p[1],0)/rings[0].length;
    prepared.push({b,index,rings,r,styleId,st,gmin,gmax,base,top,cx,cz,
      bbox:[Math.min(...rings[0].map(p=>p[0])),Math.min(...rings[0].map(p=>p[1])),Math.max(...rings[0].map(p=>p[0])),Math.max(...rings[0].map(p=>p[1]))]});
  });

  // Índices: aristas (medianeras) y huellas (separaciones estrechas)
  const edges=new EdgeIndex(12);
  const grid=new Map(),gcell=30;
  for(const pb of prepared){
    pb.rings.forEach((ring,k)=>ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length];edges.add({a,b,pb,k});}));
    for(let i=Math.floor(pb.bbox[0]/gcell);i<=Math.floor(pb.bbox[2]/gcell);i++)for(let j=Math.floor(pb.bbox[1]/gcell);j<=Math.floor(pb.bbox[3]/gcell);j++){const k=i+':'+j;(grid.get(k)??grid.set(k,[]).get(k)).push(pb);}
  }
  // Solo cuentan los vecinos que se solapan en altura (una torre sobre un cuerpo bajo no tiene medianera).
  const overlapY=(a,b)=>Math.min(a.top,b.top)-Math.max(a.b.minHeight>0?a.base:a.gmin,b.b.minHeight>0?b.base:b.gmin)>1.5;
  const insideOther=(x,z,self)=>{for(const o of grid.get(Math.floor(x/gcell)+':'+Math.floor(z/gcell))??[]){if(o===self||!overlapY(o,self))continue;if(x<o.bbox[0]||x>o.bbox[2]||z<o.bbox[1]||z>o.bbox[3])continue;if(inPoly(x,z,o.rings))return o;}return null;};

  // Distancia a la calle más cercana (ejes), con rejilla.
  const rgrid=new Map(),rcell=25;
  for(const s of roadSegments){const x0=Math.floor(Math.min(s.a[0],s.b[0])/rcell),x1=Math.floor(Math.max(s.a[0],s.b[0])/rcell),z0=Math.floor(Math.min(s.a[1],s.b[1])/rcell),z1=Math.floor(Math.max(s.a[1],s.b[1])/rcell);
    for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++){const k=i+':'+j;(rgrid.get(k)??rgrid.set(k,[]).get(k)).push(s);}}
  const roadDist=(x,z)=>{let best=Infinity,seg=null;for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const s of rgrid.get((Math.floor(x/rcell)+i)+':'+(Math.floor(z/rcell)+j))??[]){
      const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],L2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(z-s.a[1])*dz)/L2));
      const d=Math.hypot(x-s.a[0]-dx*t,z-s.a[1]-dz*t)-s.width/2;if(d<best){best=d;seg=s;}}return {d:best,seg};};

  // ¿Delante hay una plaza? (área peatonal o calle peatonal ancha llamada «Plaza…»)
  const CIVIC=/^(plaza|plazuela|plaça|praza|zócalo|zocalo|parque central|plaza de armas)/i;
  const plazaObjs=plazas.map(a=>({id:a.id,name:a.name,area:a.area,rings:a.rings,civic:a.area>1200&&(CIVIC.test(a.name||'')||a.area>5000)}));
  const namedPlazas=pedestrian.filter(r=>CIVIC.test(r.name||'')).map(r=>({id:r.id,name:r.name,road:r,area:0,civic:false}));
  const plazaAt=(x,z)=>{for(const P of plazaObjs)if(inPoly(x,z,P.rings))return P;
    for(const P of namedPlazas){const rd=P.road;for(let i=1;i<rd.points.length;i++){const a=rd.points[i-1],b=rd.points[i],dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/L2));if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<rd.width/2+4)return P;}}
    return null;};
  const inPlaza=(x,z)=>!!plazaAt(x,z);
  const plazaStyles=new Map();
  const plazaStyle=P=>{
    if(plazaStyles.has(P.id))return plazaStyles.get(P.id);
    const pr=rng(seed+':plaza:'+P.id),mayor=/mayor|armas|zócalo|zocalo|constituci/i.test(P.name||'');
    const styleId=region==='latam'?(mayor||pr()<.7?'colonial':'madrid_clasico'):region==='andalucia'&&pr()<.5?'andaluz':'madrid_clasico';
    const st=STYLES[styleId];
    const reds=['#b5523c','#a9473a','#c0613f'];
    const ps={styleId,seed:seed+':plaza:'+P.id,wall:mayor&&region!=='latam'&&pr()<.6?pick(pr,reds):pick(pr,st.palette),
      arcade:mayor?1:.65,arch:region==='latam'?pr()<.85:pr()<.45,roof:region==='latam'?(pr()<.5?'tile':'flat'):(pr()<.55?'mansard':'flat')};
    plazaStyles.set(P.id,ps);return ps;
  };
  const ctx={T,inst,sectorOf,region,edges,insideOther,roadDist,seed,inPlaza,plazaAt,plazaStyle,model,overlapY,decor,groundHeightAt:groundHeightAt??((x,z)=>T.height(x,z)+CURB)};
  let counts={buildings:0,windows:0,shops:0,balconies:0};
  for(const pb of prepared){
    if(renderIds&&!renderIds.has(pb.b.id))continue;
    inst.currentBuilding=pb.index;
    inst.currentOpening=null;
    if(skipIds.has(pb.b.id)){pb.roofRepresentation={kind:'modelo-glb',approximate:true,assetId:pb.b.modelId};counts.buildings++;continue;}
    const mb=sectorOf(pb.cx,pb.cz);mb.setId(pb.index+1);
    // Templos: gramática de iglesia; si OSM registra la cubierta, la nave la respeta (sin torres inventadas).
    if(pb.styleId==='iglesia'){const rec=recordedRoof(pb.b);pb.roofRepresentation=rec?{kind:'iglesia:'+rec.kind,requested:rec.requested,approximate:true}:{kind:'iglesia-generica',approximate:true};buildChurch(pb,mb,ctx,rec);counts.buildings++;continue;}
    // Ático retranqueado: la última planta se mete 2-3 m respecto a las fachadas vistas, con terraza.
    const atticP={madrid_moderno:.55,latam_moderno:.35,oficinas:.3,madrid_clasico:.18,eixample:.12}[pb.styleId]??0;
    const fH=3.0,wantsAttic=appearancePolicy(pb.b).allowInferredVolumes&&pb.b.minHeight===0&&pb.rings.length===1&&pb.b.levels>=5&&pb.b.roof.shape!=='gabled'&&pb.r()<atticP;
    if(wantsAttic){
      const top=pb.top;pb.top=top-fH;pb.b={...pb.b,levels:pb.b.levels-1,height:pb.b.height-fH};pb.forceParapet='rail';pb.noRooftop=true;
      emitBuilding(pb,mb,ctx,counts);
      const d=2.2+pb.r()*.9,ring=insetRing(pb.rings[0],pb.edges,d);
      if(ring){
        const area=Math.abs(ringSignedArea(ring));
        const pa={...pb,rings:[ring],base:pb.top,top,b:{...pb.b,id:pb.b.id+':atico',levels:1,height:fH,minHeight:pb.top-pb.gmax,area,isPart:true,roof:{shape:'flat'},shops:[],groundCommercial:false,interiorConfig:null},
          isAttic:true,forceParapet:null,noRooftop:false,r:rng(seed+':atico:'+pb.b.id)};
        pa.bbox=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
        emitBuilding(pa,mb,ctx,counts);
      }
    }else emitBuilding(pb,mb,ctx,counts);
    counts.buildings++;
  }
  const meshes=[];
  inst.currentBuilding=-1;
  inst.currentOpening=null;
  counts.windows=Math.max(0,counts.windows-(inst.suppressedTypes?.window??0));counts.shops=Math.max(0,counts.shops-(inst.suppressedTypes?.shopfront??0));
  for(const [key,mb]of sectors)if(mb.vertexCount)meshes.push({key:'edificios:'+key,geometry:mb.build(),kind:'building'});
  return {meshes,instances:inst,prepared,stats:{...counts,ms:Math.round(performance.now()-t0),elements:inst.count}};
}

// ------------------------------------------------------------------ un edificio
function emitBuilding(pb,mb,ctx,counts){
  const {b,rings}=pb,{T,inst}=ctx;
  const facadeOpenings=[];inst.currentFacadeOpenings=facadeOpenings;
  const pendingWalls=[];
  const isPart=b.minHeight>0;
  const levels=Math.max(1,b.levels);
  const H=pb.top-pb.base;
  const outer=rings[0],box=obb(outer),fill=b.area/Math.max(1,box.area),inr=inradius(outer);

  // Análisis de aristas: medianeras, fachadas a calle, patios
  const E=[];
  rings.forEach((ring,k)=>ring.forEach((a,i)=>{
    const bpt=ring[(i+1)%ring.length],dx=bpt[0]-a[0],dz=bpt[1]-a[1],len=Math.hypot(dx,dz);if(len<.05)return;
    const d=[dx/len,dz/len],n=[d[1],-d[0]],mid=[(a[0]+bpt[0])/2,(a[1]+bpt[1])/2];
    E.push({a,b:bpt,len,d,n,mid,k,i,yaw:Math.atan2(n[0],n[1]),exp:k>0?'court':'side'});
  }));
  // Un vecino «volado» (parte con min_height) delante deja la planta baja al aire: soportal.
  const floating=o=>o.b.minHeight>=2.5&&o.base-pb.base>=2.5;
  for(const e of E){
    let shared=0,sharedAbove=0,above=Infinity,sharedTop=0;
    for(const o of ctx.edges.near(e.mid[0],e.mid[1],e.len/2+1)){
      if(o.pb===pb||!ctx.overlapY(o.pb,pb))continue;
      const od=norm2(o.b[0]-o.a[0],o.b[1]-o.a[1]);
      if(Math.abs(od[0]*e.d[0]+od[1]*e.d[1])<.94)continue;
      const dist=Math.abs((o.a[0]-e.a[0])*e.n[0]+(o.a[1]-e.a[1])*e.n[1]);
      if(dist>.7)continue;
      const t0=(o.a[0]-e.a[0])*e.d[0]+(o.a[1]-e.a[1])*e.d[1],t1=(o.b[0]-e.a[0])*e.d[0]+(o.b[1]-e.a[1])*e.d[1];
      const sh=Math.max(0,Math.min(e.len,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1)));
      if(floating(o.pb)){sharedAbove+=sh;above=Math.min(above,o.pb.base);}else{shared+=sh;if(sh>.5)sharedTop=Math.max(sharedTop,o.pb.top);}
    }
    // Medianera solo hasta la altura del vecino: por encima la fachada queda vista (torres, áticos).
    if(shared>e.len*.45){e.exp='party';if(sharedTop<pb.top-2.8)e.exposedAbove=sharedTop;continue;}
    // Lo que hay justo delante, muestreado a lo largo de la arista (una torre puede tapar solo un tramo).
    const samples=Math.max(1,Math.min(12,Math.round(e.len/4))),hits=[];
    for(let k=0;k<samples;k++){const t=(k+.5)/samples*e.len,o=ctx.insideOther(e.a[0]+e.d[0]*t+e.n[0]*1.4,e.a[1]+e.d[1]*t+e.n[1]*1.4,pb);if(o)hits.push(o);}
    const front=hits.length>samples*.6?hits[0]:null;
    if(front&&floating(front)){e.exp='under';e.openBelow=front.base;continue;}
    if(sharedAbove>e.len*.45){e.exp='under';e.openBelow=above;continue;}
    if(front){e.exp='party';if(front.top<pb.top-2.8)e.exposedAbove=front.top;continue;}
    if(hits.length)e.partial=true;
    if(e.k===0){const {d}=ctx.roadDist(e.mid[0]+e.n[0]*2,e.mid[1]+e.n[1]*2);
      const ahead=[e.mid[0]+e.n[0]*Math.min(10,Math.max(2,d)),e.mid[1]+e.n[1]*Math.min(10,Math.max(2,d))];
      if(d<16&&!ctx.insideOther(ahead[0],ahead[1],pb))e.exp='street';}
  }
  pb.edges=E;
  const street=E.filter(e=>e.exp==='street').sort((a,b)=>b.len-a.len);
  let mainEdge=street[0]??E.filter(e=>e.exp!=='party'&&e.k===0).sort((a,b)=>b.len-a.len)[0];
  if(b.mainSide!=null){const m=E.find(e=>e.k===0&&e.i===b.mainSide);if(m){mainEdge=m;if(m.exp==='side')m.exp='street';}}

  // Conjunto de plaza: los edificios que dan a una plaza mayor / de armas comparten estilo,
  // color, ritmo de huecos y soportal (la plaza se diseñó como una sola obra).
  let plaza=null;
  for(const e of street){const P=ctx.plazaAt(e.mid[0]+e.n[0]*4,e.mid[1]+e.n[1]*4)??ctx.plazaAt(e.mid[0]+e.n[0]*8,e.mid[1]+e.n[1]*8);if(P){e.plaza=P;plaza??=P;}}
  let r=pb.r,ps=null;
  if(plaza&&plaza.civic&&!isPart&&['residential','generic','commercial','public'].includes(b.use)&&levels>=2){
    ps=ctx.plazaStyle(plaza);
    pb.styleId=ps.styleId;
    r=rng(ps.seed);
  }
  const st=facadeStyle(STYLES[pb.styleId]??STYLES.madrid_clasico,b.facadeProfile);pb.st=st;
  const wallBase=ps?.wall??pick(r,st.palette);
  const variation=ps?1:range(r,.96,1.03);
  const wall=wallColour(b,col(wallBase).multiplyScalar(variation));
  const wallSurf=wallSurface(b,!b.colour&&BRICK.has(wallBase)?SURF_BRICK:pb.styleId==='publico'?SURF_ASHLAR:SURF.wall);
  const trim=col(pick(r,st.trim)),plinthCol=col(pick(r,st.plinth));
  const frame=col(weighted(r,st.frames)),rail=col(weighted(r,st.rails));
  const surroundColor='#'+(st.surroundIsTrimColor?trim:shade(trim,1.0)).getHexString();
  // Plantas
  let gH=isPart?0:Math.min(range(r,...st.groundH),levels===1?H:H*.45);
  let fH=levels>1?(H-gH)/(levels-1):0;
  if(levels>1&&fH<2.6){gH=Math.min(gH,3.4);fH=(H-gH)/(levels-1);}
  const floors=[];
  if(isPart){const n=Math.max(1,Math.round(H/3.2)),h=H/n;for(let i=0;i<n;i++)floors.push({y:pb.base+i*h,h,role:i===n-1&&n>2?'top':'middle'});}
  else{floors.push({y:pb.base,h:gH,role:'ground'});for(let i=1;i<levels;i++)floors.push({y:pb.base+gH+(i-1)*fH,h:fH,role:i===1?'first':i===levels-1&&levels>2?'top':'middle'});}

  // Cubierta elegida
  let roofKind=weighted(r,st.roof);
  if(b.roof.shape&&b.roof.shape!=='flat'&&!(b.roof.shape==='hipped'&&st.roof.every(([k])=>k==='flat')))roofKind={gabled:'gabled',hipped:'hipped',pyramidal:'pyramid','half-hipped':'hipped',mansard:'mansard',gambrel:'mansard',dome:'dome',onion:'onion',skillion:'flat',round:'dome',barrel:'barrel'}[b.roof.shape]??roofKind;
  if(ps&&!b.roof.shape)roofKind=ps.roof;
  const observedRoof=recordedRoof(b);
  if(observedRoof)roofKind=observedRoof.kind;
  if((roofKind==='hipped'||roofKind==='gabled')&&!(fill>.82&&outer.length<=8&&box.wid<26))roofKind=box.wid<30&&inr>2.5?'tile':'flat';
  if(roofKind==='barrel'&&!(fill>.85&&outer.length<=8))roofKind='flat';
  if(roofKind==='mansard'&&inr<4)roofKind='flat';
  if(roofKind==='tile'&&inr<2)roofKind='flat';
  if(H>45&&!['flat','dome','onion','pyramid'].includes(roofKind))roofKind='flat';
  pb.roofRepresentation={kind:roofKind,requested:observedRoof?.requested??null,approximate:!observedRoof||observedRoof.approximate||roofKind!==observedRoof.kind};
  const flat=roofKind==='flat';
  const parapetH=flat?st.parapet.h:0;
  const wallTop=pb.top;

  // Soportales: fachadas clásicas que dan a una plaza.
  // Profundidad del pórtico: la que permita la crujía detrás de la fachada (mínimo de las fachadas con soportal).
  let arcadeDepth=3.3;
  const arcadeOK=['madrid_clasico','publico','andaluz','colonial','eixample'].includes(pb.styleId)&&!isPart&&levels>=2&&gH>=3.6;
  const arcP=b.tags?.arcade==='yes'?1:ps?ps.arcade:{madrid_clasico:.5,publico:.4,andaluz:.35,colonial:.7,eixample:.2}[pb.styleId]??0;
  let anyArcade=false;
  if(arcadeOK&&r()<arcP)for(const e of street){
    if(e.len<4||!e.plaza)continue;
    const depth=inwardDepth(e,rings);
    if(depth<6)continue;
    e.arcade=true;anyArcade=true;arcadeDepth=Math.min(arcadeDepth,Math.max(2.4,depth*.35));
  }
  const arcadeArch=ps?ps.arch:r()<(pb.styleId==='colonial'?.8:.65);
  const entry=E.find(e=>e===mainEdge&&!e.arcade&&!E.some(o=>o.arcade&&(o.b===e.a||o.a===e.b)))??E.find(e=>e.exp==='street'&&!e.arcade&&!E.some(o=>o.arcade&&(o.b===e.a||o.a===e.b)));
  try{pb.interiorPlan=interiorPlan(pb,entry);}catch(error){pb.interiorPlan=null;pb.interiorIssue=error.message;}inst.currentOpening=pb.interiorPlan;

  // ---------------- Muros (con zócalo) y parapeto
  const ytop=wallTop+parapetH;
  const yGF=pb.base+gH;
  for(const e of E){
    const A=e.a,B=e.b,y0=pb.gmin-.6;
    const h0=isPart?pb.base:y0;
    if(e.arcade){
      // planta alta sobre la línea de fachada; muro de fondo retranqueado bajo el pórtico
      wallQuad(mb,A,B,yGF,ytop,wall,e.n,wallSurf);
      const iA=[A[0]-e.n[0]*arcadeDepth,A[1]-e.n[1]*arcadeDepth],iB=[B[0]-e.n[0]*arcadeDepth,B[1]-e.n[1]*arcadeDepth];
      wallQuad(mb,iA,iB,y0,yGF,shade(wall,.97),e.n,wallSurf);
      continue;
    }
    const prev=E.find(o=>o.k===e.k&&o.b===e.a),next=E.find(o=>o.k===e.k&&o.a===e.b);
    const cut0=prev?.arcade?Math.min(arcadeDepth,e.len):0,cut1=next?.arcade?Math.min(arcadeDepth,e.len-cut0):0;
    if(cut0||cut1){
      wallQuad(mb,A,B,yGF,ytop,wall,e.n,wallSurf);
      const sA=[A[0]+e.d[0]*cut0,A[1]+e.d[1]*cut0],sB=[B[0]-e.d[0]*cut1,B[1]-e.d[1]*cut1];
      if(e.len-cut0-cut1>.05)wallQuad(mb,sA,sB,h0,yGF,wall,e.n,wallSurf);
      // cierre lateral del pórtico (muro de fondo que gira)
      continue;
    }
    for(const part of splitWallForDoor(A,B,h0,ytop,pb.interiorPlan?.entry===e?pb.interiorPlan:null))pendingWalls.push({...part,n:e.n,c:wall,surf:wallSurf});
  }
  // Pórticos: tramos instanciados (pilar + arco/dintel + enjuta + techo) y pilar final
  if(anyArcade)for(const e of E){
    if(!e.arcade)continue;
    const n=Math.max(1,Math.round(e.len/(arcadeArch?3.6:3.2))),w=e.len/n;
    for(let i=0;i<n;i++){const s=(i+.5)*w;
      inst.add('arcadeBay',{w,h:gH,depth:arcadeDepth,arch:arcadeArch},[e.a[0]+e.d[0]*s,pb.base,e.a[1]+e.d[1]*s],e.yaw,wall,{tint2:trim});}
    inst.add('pillar',{h:gH},[e.b[0]-e.d[0]*.31,pb.base,e.b[1]-e.d[1]*.31],e.yaw,wall,{tint2:trim});
  }
  // Patios: suelo del patio
  // Se conserva la tirada de dimensiones/colores; la geometría espera a conocer los vanos.
  const plinthBands=[];
  if(!isPart&&st.plinthKind!=='none'){
    const kind=st.plinthKind,ph=kind==='rustic'?gH-.05:kind==='glass'?.6:range(r,.7,1.1);
    plinthBands.push([pb.gmin-.6,pb.base+ph,.05,plinthCol,{}]);
    if(kind==='rustic'){for(let y=pb.base+.45;y<pb.base+ph-.1;y+=.5)plinthBands.push([y,y+.04,.065,shade(plinthCol,.86),{onlyOuter:true}]);}
  }
  // Impostas / forjados
  if(st.bands!=='none'){
    for(let i=1;i<floors.length;i++){
      const y=floors[i].y;
      if(st.bands==='every')band(mb,rings,E,y-.05,y+.13,.07,trim,{skipParty:true});
      else if(st.bands==='slab')band(mb,rings,E,y-.12,y+.12,.035,shade(trim,.97),{skipParty:true});
    }
  }
  // Pilastras entre crujías y esquinas
  const pilasters=r()<st.pilasters;
  // Cornisa
  if(flat||roofKind==='mansard'||roofKind==='tile'){
    const c=st.cornice;
    band(mb,rings,E,wallTop-c.h,wallTop-c.h*.45,c.p*.55,trim,{skipParty:true,bottom:true});
    band(mb,rings,E,wallTop-c.h*.45,wallTop,c.p,trim,{skipParty:true,bottom:true});
    if(c.corbels&&r()<c.corbels)for(const e of E){if(e.exp==='party'||e.k>0)continue;
      for(let s=.4;s<e.len-.3;s+=.75){const p=[e.a[0]+e.d[0]*s,e.a[1]+e.d[1]*s];
        mb.box(p[0]+e.n[0]*c.p*.3,wallTop-c.h-.14,p[1]+e.n[1]*c.p*.3,.07,.14,c.p*.3,e.yaw,trim,SURF.trim);}}
  }
  // Parapeto (cara interior y albardilla)
  if(flat&&(!isPart||pb.isAttic)){
    parapet(mb,rings,wallTop,parapetH,wall,trim,pb.forceParapet??st.parapet.kind,r);
    roofSurface(mb,rings,wallTop-.05,roofColour(b,col(pick(r,ROOF.flat))));
    if(!pb.noRooftop)rooftop(pb,mb,ctx,wall,trim,r,wallTop);
  }else if(flat){roofSurface(mb,rings,wallTop+parapetH,roofColour(b,col(pick(r,ROOF.flat))));}
  else emitRoof(pb,mb,ctx,roofKind,wallTop,wall,trim,r,box,inr,E);

  // Esquinas: sillares o pilastra pintada
  if(st.corner&&!isPart)for(let i=0;i<outer.length;i++){
    const e1=E.find(e=>e.k===0&&e.i===(i-1+outer.length)%outer.length),e2=E.find(e=>e.k===0&&e.i===i);
    if(!e1||!e2||e1.exp==='party'||e2.exp==='party')continue;
    const cross=e1.d[0]*e2.d[1]-e1.d[1]*e2.d[0];if(cross<.3)continue; // solo esquinas convexas
    const p=outer[i];
    if(st.corner==='quoins'){for(let y=pb.base+(st.plinthKind==='rustic'?gH:.9),k=0;y<wallTop-.6;y+=.42,k++){
      const L=k%2?.55:.32;
      cornerBlock(mb,p,e1,e2,y,y+.36,L,.04,trim);}}
    else cornerBlock(mb,p,e1,e2,pb.base,wallTop,.38,.025,trim);
  }

  // ---------------- Volumen volado (parte con min_height): sofito, pilares y arcos debajo
  if(isPart&&b.minHeight>=2.5&&b.minHeight<=9){
    mb.polygon(rings[0],rings.slice(1),pb.base+.01,shade(wall,.9),SURF.wall,{flip:true});
    const hP=pb.base-pb.gmax,arch=hP>3.4&&(ctx.region==='latam'||r()<.5);
    for(const e of E){
      if(e.k>0||e.exp==='party'||e.exp==='under'||e.len<2.5)continue;
      const n=Math.max(1,Math.round(e.len/3.6)),w=e.len/n;
      for(let i=0;i<n;i++){const s=(i+.5)*w,x=e.a[0]+e.d[0]*s,z=e.a[1]+e.d[1]*s;
        inst.add('arcadeBay',{w,h:hP,depth:.02,arch,pillar:.55},[x,pb.gmax,z],e.yaw,wall,{tint2:trim});}
      inst.add('pillar',{h:hP,pillar:.55},[e.b[0]-e.d[0]*.28,pb.gmax,e.b[1]-e.d[1]*.28],e.yaw,wall,{tint2:trim});
    }
  }

  // ---------------- Galerías de corredor (colegio latinoamericano): en la fachada al patio
  if(st.galleries&&!isPart&&levels>=1){
    const gal=E.filter(e=>e.k===0&&e.exp!=='party'&&e.len>=8&&(b.gallerySides?b.gallerySides.includes(e.i):e===mainEdge));
    for(const e of gal){
      e.gallery=true;
      const depth=2.3,n=Math.max(1,Math.round(e.len/4));
      for(let f=1;f<=floors.length;f++){
        const y=f<floors.length?floors[f].y:wallTop;
        const below=floors[f-1];
        inst.add('balcony',{w:e.len,depth,rail:'solid',slabColor:'#'+trim.getHexString(),wallColor:'#'+wall.getHexString(),railH:f<floors.length?1.0:.3},[e.mid[0],y,e.mid[1]],e.yaw,rail);
        for(let i=0;i<=n;i++){const s=Math.min(e.len-.2,Math.max(.2,i*e.len/n)),x=e.a[0]+e.d[0]*s+e.n[0]*(depth-.25),z=e.a[1]+e.d[1]*s+e.n[1]*(depth-.25);
          inst.add('pillar',{h:y-below.y-.14,pillar:.32},[x,below.y,z],e.yaw,wall,{tint2:trim});}
      }
    }
  }
  // Acceso de escuela: marquesina sobre la puerta y rótulo
  if(b.use==='school'&&mainEdge&&!isPart&&levels>=2){
    const e=mainEdge,p=[e.mid[0]+e.n[0]*1.6,e.mid[1]+e.n[1]*1.6];
    inst.add('canopy',{w:Math.min(8,e.len*.25),d:3.2,h:3.1},[p[0],T.height(p[0],p[1])+.15,p[1]],e.yaw,col('#f4f1ea'));
    inst.add('schoolSign',{w:Math.min(7,e.len*.22)},[e.mid[0],pb.base+gH+.25,e.mid[1]],e.yaw,col(ctx.region==='latam'?'#2f5e8f':'#3d6b52'));
  }
  // Reloj en el centro de la fachada principal (escuelas, edificios públicos)
  if(st.extras?.clock&&mainEdge&&r()<st.extras.clock&&levels>=2){
    const e=mainEdge;inst.add('clock',{r:.75},[e.mid[0]+e.n[0]*.02,wallTop-1.4,e.mid[1]+e.n[1]*.02],e.yaw,col('#2f5e8f'));
  }

  // ---------------- Templete de esquina con cúpula (Gran Vía, Alcalá, ensanches)
  const turretP={madrid_clasico:.4,eixample:.3,publico:.55,colonial:.08}[pb.styleId]??0;
  if(appearancePolicy(b).allowInferredVolumes&&!isPart&&levels>=4&&turretP&&r()<turretP){
    let best=null;
    for(let i=0;i<outer.length;i++){
      const e1=E.find(e=>e.k===0&&e.i===(i-1+outer.length)%outer.length),e2=E.find(e=>e.k===0&&e.i===i);
      if(!e1||!e2||e1.exp!=='street'||e2.exp!=='street'||e1.len<5||e2.len<5)continue;
      const cross=e1.d[0]*e2.d[1]-e1.d[1]*e2.d[0];if(cross<.35)continue;
      const score=e1.len+e2.len;if(!best||score>best.score)best={p:outer[i],e1,e2,score};
    }
    if(best)turret(mb,ctx,best,wallTop,wall,trim,r);
  }
  // ---------------- Terrazas de bares y cafés en la acera
  for(const poi of b.shops){
    if(!['cafe','bar','restaurant','pub','ice_cream','fast_food','biergarten'].includes(poi.kind))continue;
    let best=null;for(const e of street){const t=Math.max(0,Math.min(e.len,(poi.x-e.a[0])*e.d[0]+(poi.z-e.a[1])*e.d[1]));const px=e.a[0]+e.d[0]*t,pz=e.a[1]+e.d[1]*t,dd=Math.hypot(px-poi.x,pz-poi.z);if(!best||dd<best.dd)best={e,t,dd};}
    if(!best||best.dd>14)continue;
    const e=best.e,free=ctx.roadDist(e.mid[0]+e.n[0]*1,e.mid[1]+e.n[1]*1).d;
    if(free<3.6&&!ctx.inPlaza(e.mid[0]+e.n[0]*3,e.mid[1]+e.n[1]*3))continue;
    const n=2+Math.floor(r()*3),c=col(pick(r,['#c8463c','#2f6e8f','#3d7d4f','#e0a33a','#f1efe9','#8a3f5f'])),um=r()<.6;
    const off=Math.min(2.2,Math.max(1.4,free-1.2))+(e.arcade?.6:0);
    for(let k=0;k<n;k++){const t=best.t+(k-(n-1)/2)*2.4;if(t<1||t>e.len-1)continue;
      const x=e.a[0]+e.d[0]*t+e.n[0]*off,z=e.a[1]+e.d[1]*t+e.n[1]*off;
      inst.add('terrace',{umbrella:um,chairs:r()<.5?4:2},[x,T.height(x,z)+.15,z],e.yaw+(k%2)*.4,c);}
  }

  // ---------------- Fachada: huecos por planta y crujía
  let doorPlaced=false;
  const decide=new Map();
  const D=(key,p)=>{if(!decide.has(key))decide.set(key,r()<p);return decide.get(key);};
  const shopBuilding=b.groundCommercial||D('shops',st.shopsOnStreet);
  const blindPct=range(r,.1,.6);
  const RUNS=buildRuns(E);
  for(const e of RUNS){
    if(e.exp==='party'&&!e.exposedAbove||e.len<1.7)continue;
    const under=e.exp==='under',upperOnly=e.exp==='party';
    const court=e.exp==='court',isStreet=e.exp==='street'||under;
    const bayTarget=range(r,...st.bay)*(court?1.15:1);
    const usable=e.len-2*Math.min(st.margin,e.len*.18);
    let nb=Math.max(1,Math.floor(usable/bayTarget));
    if(usable<1.2)nb=1;
    const bayW=usable/nb,start=(e.len-usable)/2;
    const bays=Array.from({length:nb},(_,i)=>start+(i+.5)*bayW);
    if(pilasters&&!court&&nb>1)for(let i=0;i<=nb;i++){
      const s=start+i*bayW,p=e.pointAt(s),nn=e.normalAt(s);
      const y0=pb.base+(st.plinthKind==='rustic'?gH:.9),y1=wallTop-st.cornice.h;
      if(y1-y0>2)mb.box(p[0]+nn[0]*.04,(y0+y1)/2,p[1]+nn[1]*.04,.2,(y1-y0)/2,.04,e.yawAt(s),shade(trim,.99),SURF.trim);
    }
    const back=e.arcade?arcadeDepth:0;
    const covered=e.partial?bays.map(sv=>{const p=e.pointAt(sv),nn=e.normalAt(sv);return !!ctx.insideOther(p[0]+nn[0]*1.2,p[1]+nn[1]*1.2,pb);}):null;
    const at=(s,y)=>{const p=e.pointAt(s),nn=e.normalAt(s),bk=y<yGF-.1?back:0;return [p[0]-nn[0]*bk,y,p[1]-nn[1]*bk];};
    const groundAt=s=>{const p=e.pointAt(s);return T.height(p[0],p[1]);};
    // Apoyo del acceso en la acera frente a su hoja, no en gmax de toda la huella.
    // Conserva el ajuste explícito del usuario y las dimensiones del perfil.
    const accessFloorAt=(s,lateral=0)=>{const p=at(s,0),yaw=e.yawAt(s),x=p[0]+Math.cos(yaw)*lateral+Math.sin(yaw)*.25,z=p[2]-Math.sin(yaw)*lateral+Math.cos(yaw)*.25;return ctx.groundHeightAt(x,z)+(b.baseOffset??0);};
    // Huecos por planta
    for(let f=0;f<floors.length;f++){
      const fl=floors[f];
      if(under&&fl.y+2.2>e.openBelow)break;
      if(upperOnly&&fl.y<e.exposedAbove+.3)continue;
      if(fl.role==='ground'){
        if(court)continue;
        const shops=isStreet&&shopBuilding&&st.shopsOnStreet>0;
        let doorBay=-1;
        if(!doorPlaced&&e.edges.includes(mainEdge)){doorBay=Math.floor(nb/2);doorPlaced=true;}
        for(let i=0;i<nb;i++){
          if(covered?.[i])continue;
          const s=bays[i],gy=groundAt(s),yfloor=Math.max(gy,fl.y);
          const room=fl.y+fl.h-yfloor;
          if(room<2.3)continue;
          if(i===doorBay){
            const P=st.portal,accessY=accessFloorAt(s);
            if(P.garage&&r()<P.garage)inst.add('door',{kind:'garage',w:Math.min(bayW-.4,P.w*1.5),h:Math.min(room-.3,2.6)},at(s,accessY),e.yawAt(s),col('#9aa0a6'));
            else inst.add('door',{kind:P.house?'house':'portal',w:Math.min(P.w,bayW-.5),h:Math.min(P.h,room-.35),transom:P.transom&&room>3.2,arch:r()<(P.arch??0),stoneColor:surroundColor},at(s,accessY),e.yawAt(s),col(pick(r,['#5b3a28','#3d2a20','#2f4a3c','#6a4a34','#25272b'])));
            if(st.extras.wallLamp&&r()<.6)for(const sg of [-1,1])inst.add('wallLamp',{},at(s+sg*(Math.min(P.w,bayW-.5)/2+.55),accessY+Math.min(P.h,room-.35)-.2),e.yawAt(s),null);
            continue;
          }
          if(shops&&room>2.8){
            const w=bayW-.35,h=Math.min(room-.9,3.3);
            const accessY=accessFloorAt(s,(1.5-1.05/2-.25)*w/3);
            // Conserva las tiradas arquitectónicas previas; la identidad comercial usa su propia semilla.
            const goods=r()<.5,frame=col(pick(r,['#2f3237','#f2efe8','#3e6a52','#7a2e2a','#2b4a7a','#8b5a36']));
            const position=at(s,accessY),yaw=e.yawAt(s);
            if(inst.add('shopfront',{w,h,layered:true},position,yaw,frame))inst.shopfronts.push({buildingId:b.id,position,yaw,w,h,arcade:!!e.arcade});
            const signC=col(pick(r,SIGN));if(r()<.75){range(r,.25,.55);range(r,.15,.35);}
            if(!e.arcade&&r()<st.extras.awning){r();r();pick(r,AWNING);}if(r()<st.extras.blade&&i===0){}
            counts.shops++;
            continue;
          }
          const G=st.groundWindow;
          const sill=Math.max(.3,G.sill-(yfloor-gy)*0);
          const h=Math.min(G.h,room-sill-.4);if(h<.6)continue;
          const grille=G.grille&&D('ggrille',G.pGrille)?G.grille:null;
          inst.add('window',{w:Math.min(G.w,bayW-.5),h,surround:G.surround?{...G.surround,color:surroundColor}:null,grille,blind:G.blind,arch:G.arch&&D('garch',G.arch),shutters:G.shutters&&D('gshut',G.shutters)?'louvre':null,panes:2},at(s,yfloor+sill),e.yawAt(s),frame);
          counts.windows++;
        }
        continue;
      }
      // Plantas altas
      const tpl=st.floors[fl.role]??st.floors.middle;
      const k=fl.role+':'+e.i+':'+e.k;
      const bal=tpl.balcony&&!court&&D('bal:'+fl.role,tpl.balcony.p);
      const cont=bal&&tpl.balcony.continuous&&!e.curved&&D('cont:'+fl.role+':'+e.i,tpl.balcony.continuous)&&isStreet;
      const mirStack=tpl.mirador&&isStreet&&D('mir:'+e.i,tpl.mirador);
      const colo=tpl.colonialBalcony&&isStreet&&D('colo:'+fl.role+':'+e.i,tpl.colonialBalcony);
      const shutters=tpl.shutters&&D('shut',tpl.shutters)?'louvre':null;
      const blind=tpl.blind&&D('blind:'+fl.role,tpl.blind)?Math.round((blindPct+range(r,-.1,.1))*10)/10:null;
      const grille=tpl.grille&&D('grille:'+fl.role,tpl.grille)?'flat':null;
      const flowers=ctx.decor?(tpl.flowers??st.extras.flowers??0):0; // macetas = decoración sustituible por GLB
      if(cont){
        const w=usable-.2;
        inst.add('balcony',{w,depth:tpl.balcony.depth,rail:'iron',ornament:true,corbels:true,slabColor:surroundColor},at(e.len/2,fl.y),e.yawAt(e.len/2),rail);
        counts.balconies++;
      }
      for(let i=0;i<nb;i++){
        if(covered?.[i])continue;
        const s=bays[i];
        const center=i===Math.floor(nb/2)||nb>3&&i===Math.floor(nb/2)-1&&nb%2===0;
        if(mirStack&&center&&fl.role!=='top'){
          inst.add('mirador',{w:Math.min(2.6,bayW*.9),h:fl.h-.35,depth:.8},at(s,fl.y+.05),e.yawAt(s),frame);counts.windows++;continue;
        }
        if(colo&&(nb<=3||i%2===0)){
          const w=Math.min(bayW*(nb<=3?.8:1.6),4.2);
          inst.add('colonialBalcony',{w,h:Math.min(2.6,fl.h-.45),depth:.85},at(s+(nb>3?bayW*.5:0),fl.y+.05),e.yawAt(s),col(pick(r,['#7a4e2f','#5b3a28','#3e6a52','#6b3a2a'])));
          if(nb>3)i++;counts.balconies++;continue;
        }
        const kind=court?'window':tpl.kind;
        if(kind==='ribbon'){
          inst.add('window',{w:bayW-.06,h:Math.min(tpl.h,fl.h-1.1),surround:null,mullion:true,frame:.07,sill:false,dark:r()<.3},at(s,fl.y+(tpl.sill??.8)),e.yawAt(s),frame);counts.windows++;continue;
        }
        const surround=court||!tpl.surround?null:{...tpl.surround,color:surroundColor};
        if(kind==='balconera'){
          const h=Math.min(tpl.h,fl.h-.45),w=Math.min(tpl.w,bayW-.55);
          inst.add('window',{w,h,surround,panelBottom:true,mullion:true,panes:tpl.panes,blind,shutters:court?null:shutters,sillLess:true},at(s,fl.y+.02),e.yawAt(s),frame);
          if(bal&&!cont){
            inst.add('balcony',{w:w+.55,depth:tpl.balcony.depth,rail:tpl.balcony.rail?weighted(r,tpl.balcony.rail):'iron',ornament:tpl.balcony.ornament&&D('orn',tpl.balcony.ornament),corbels:tpl.balcony.corbels,slabColor:surroundColor,wallColor:'#'+wall.getHexString()},at(s,fl.y),e.yawAt(s),rail);
            counts.balconies++;
            if(D('flw:'+k,flowers))inst.add('flowerPots',{w:w+.3},at(s,fl.y),e.yawAt(s),col(pick(r,['#d8434b','#e86b8f','#f2a13a','#c43a6b','#f4f0f2'])));
          }else if(!bal&&!cont){
            // balcón francés: barandilla a ras de muro
            inst.add('balcony',{w:w+.1,depth:.12,rail:'iron'},at(s,fl.y),e.yawAt(s),rail);
          }
          if(D('ac:'+k+':'+i,st.extras.ac*(bal?.6:1)))inst.add('acUnit',{},at(s+(i%2?-1:1)*(w/2+.65),fl.y+.15),e.yawAt(s),null);
        }else{
          const sill=tpl.sill??.95,h=Math.min(tpl.h,fl.h-sill-.35);if(h<.5)continue;
          const w=Math.min(tpl.w*(court?.85:1),bayW-.5);
          inst.add('window',{w,h,surround,blind:court?(blind??.3):blind,shutters:court?null:shutters,grille,transom:tpl.transom,panes:tpl.panes},at(s,fl.y+sill),e.yawAt(s),frame);
          if(bal&&!cont){
            const terrace=tpl.balcony.terrace&&D('ter:'+fl.role,tpl.balcony.terrace);
            inst.add('balcony',{w:terrace?Math.min(bayW-.1,4.2):w+.6,depth:tpl.balcony.depth,rail:tpl.balcony.rail?weighted(r,tpl.balcony.rail):'iron',slabColor:'#'+shade(trim,.98).getHexString(),wallColor:'#'+wall.getHexString()},at(s,fl.y),e.yawAt(s),rail);
            counts.balconies++;
          }
          if(D('ac:'+k+':'+i,st.extras.ac))inst.add('acUnit',{},at(s+(i%2?-1:1)*(w/2+.6),fl.y+sill-.75),e.yawAt(s),null);
        }
        counts.windows++;
      }
    }
  }
  if(pb.interiorPlan){const p=pb.interiorPlan;facadeOpenings.push({position:[p.center[0],p.floor,p.center[1]],yaw:p.entry.yaw,w:p.width,h:p.doorHeight});}
  for(const part of pendingWalls)wallWithOpenings(mb,part,facadeOpenings);
  for(const [y0,y1,p,c,options]of plinthBands)band(mb,rings,E,y0,y1,p,c,{skipParty:true,skipArcade:true,...options,openings:facadeOpenings});
  pb.facadeOpenings=facadeOpenings;inst.currentFacadeOpenings=null;
}

// Tramos continuos de fachada: aristas consecutivas del mismo anillo y la misma clase que giran poco
// (chaflanes curvos, rotondas, fachadas quebradas). Los huecos se reparten por la longitud del tramo.
function buildRuns(E){
  const runs=[],byRing=new Map();
  for(const e of E){(byRing.get(e.k)??byRing.set(e.k,[]).get(e.k)).push(e);}
  const same=(a,b)=>a.exp===b.exp&&!!a.arcade===!!b.arcade&&(a.openBelow??0)===(b.openBelow??0)&&(a.exposedAbove??0)===(b.exposedAbove??0);
  const turn=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.d[0]*b.d[0]+a.d[1]*b.d[1])));
  for(const ring of byRing.values()){
    ring.sort((a,b)=>a.i-b.i);
    const n=ring.length;
    const brk=i=>{const a=ring[(i-1+n)%n],b=ring[i];return !same(a,b)||turn(a,b)>.5||a.b!==b.a;};
    let s0=ring.findIndex((_,i)=>brk(i));if(s0<0)s0=0;
    let cur=null;
    for(let k=0;k<n;k++){const i=(s0+k)%n,e=ring[i];
      if(!cur||brk(i)){cur={edges:[]};runs.push(cur);}
      cur.edges.push(e);}
  }
  for(const R of runs){
    const f=R.edges[0];
    R.exp=f.exp;R.k=f.k;R.i=f.i;R.arcade=!!f.arcade;R.openBelow=f.openBelow;R.exposedAbove=f.exposedAbove;R.plaza=f.plaza;
    R.partial=R.edges.some(e=>e.partial);
    R.cum=[0];for(const e of R.edges)R.cum.push(R.cum.at(-1)+e.len);
    R.len=R.cum.at(-1);
    let t=0;for(let i=1;i<R.edges.length;i++)t+=turn(R.edges[i-1],R.edges[i]);R.curved=t>.35;
    const find=s=>{let j=0;while(j<R.edges.length-1&&R.cum[j+1]<s)j++;return j;};
    R.pointAt=s=>{const j=find(s),e=R.edges[j],u=Math.max(0,Math.min(e.len,s-R.cum[j]));return [e.a[0]+e.d[0]*u,e.a[1]+e.d[1]*u];};
    R.normalAt=s=>R.edges[find(s)].n;
    R.yawAt=s=>R.edges[find(s)].yaw;
    const m=R.pointAt(R.len/2);R.mid=m;R.n=R.normalAt(R.len/2);R.yaw=R.yawAt(R.len/2);
  }
  return runs;
}

// Anillo del ático: cada arista vista se desplaza d hacia dentro; las medianeras se quedan.
function insetRing(ring,E,d){
  const n=ring.length,lines=[];
  for(let i=0;i<n;i++){
    const a=ring[i],b=ring[(i+1)%n],e=E?.find(x=>x.k===0&&x.i===i);
    const off=e&&e.exp!=='party'?d:0;
    const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz)||1,nx=dz/L,nz=-dx/L;
    lines.push({p:[a[0]-nx*off,a[1]-nz*off],d:[dx/L,dz/L],off});
  }
  const out=[];
  for(let i=0;i<n;i++){
    const A=lines[(i-1+n)%n],B=lines[i];
    const den=A.d[0]*B.d[1]-A.d[1]*B.d[0];
    if(Math.abs(den)<1e-4){out.push(B.p);continue;}
    const t=((B.p[0]-A.p[0])*B.d[1]-(B.p[1]-A.p[1])*B.d[0])/den;
    out.push([A.p[0]+A.d[0]*t,A.p[1]+A.d[1]*t]);
  }
  // validez: misma orientación, aristas no invertidas, área razonable
  for(let i=0;i<n;i++){const j=(i+1)%n,od=[ring[j][0]-ring[i][0],ring[j][1]-ring[i][1]],nd=[out[j][0]-out[i][0],out[j][1]-out[i][1]];if(od[0]*nd[0]+od[1]*nd[1]<=0)return null;}
  const a0=ringSignedArea(ring),a1=ringSignedArea(out);
  if(a1<=0||a1<a0*.3)return null;
  return out;
}

// Cuadrilátero de muro mirando a n (aire a la derecha del sentido a->b).
function wallQuad(mb,a,b,y0,y1,c,n,surf=SURF.wall){
  mb.quad([b[0],y0,b[1]],[a[0],y0,a[1]],[a[0],y1,a[1]],[b[0],y1,b[1]],c,surf,[n[0],0,n[1]]);
}

function wallWithOpenings(mb,part,openings){
  const {a,b,y0,y1,c,n,surf}=part,dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),d=[dx/L,dz/L];
  const holes=openings.flatMap(o=>{const off=Math.abs((o.position[0]-a[0])*n[0]+(o.position[2]-a[1])*n[1]),along=(o.position[0]-a[0])*d[0]+(o.position[2]-a[1])*d[1];if(off>.2||Math.sin(o.yaw)*n[0]+Math.cos(o.yaw)*n[1]<.94||o.position[1]>=y1||o.position[1]+o.h<=y0)return [];return [{x0:Math.max(0,along-o.w/2),x1:Math.min(L,along+o.w/2),lo:Math.max(y0,o.position[1]),hi:Math.min(y1,o.position[1]+o.h)}].filter(h=>h.x1>h.x0);});
  if(!holes.length){wallQuad(mb,a,b,y0,y1,c,n,surf);return;}
  const xs=[...new Set([0,L,...holes.flatMap(h=>[h.x0,h.x1])])].sort((a,b)=>a-b),ys=[...new Set([y0,y1,...holes.flatMap(h=>[h.lo,h.hi])])].sort((a,b)=>a-b),point=s=>[a[0]+d[0]*s,a[1]+d[1]*s];
  for(let x=1;x<xs.length;x++)for(let y=1;y<ys.length;y++){const mx=(xs[x-1]+xs[x])/2,my=(ys[y-1]+ys[y])/2;if(!holes.some(h=>mx>h.x0&&mx<h.x1&&my>h.lo&&my<h.hi))wallQuad(mb,point(xs[x-1]),point(xs[x]),ys[y-1],ys[y],c,n,surf);}
}

// Banda saliente alrededor de los anillos (zócalos, impostas, cornisas).
function band(mb,rings,E,y0,y1,p,c,{skipParty=false,bottom=false,onlyOuter=false,skipArcade=false,openings=[]}={}){
  rings.forEach((ring,k)=>{
    if(onlyOuter&&k>0)return;
    const off=miterOffset(ring,p);
    for(let i=0;i<ring.length;i++){
      const e=E.find(x=>x.k===k&&x.i===i);
      if(skipParty&&e&&e.exp==='party')continue;
      if(skipArcade&&e?.arcade)continue;
      const j=(i+1)%ring.length,a=ring[i],b=ring[j],A=off[i],B=off[j];
      const n=e?e.n:[0,0];
      const holes=e?openings.flatMap(o=>{
        const dx=o.position[0]-a[0],dz=o.position[2]-a[1],along=dx*e.d[0]+dz*e.d[1],off=Math.abs(dx*n[0]+dz*n[1]);
        if(off>.2||Math.sin(o.yaw)*n[0]+Math.cos(o.yaw)*n[1]<.94||o.position[1]>=y1||o.position[1]+o.h<=y0)return [];
        return [{x0:Math.max(0,along-o.w/2),x1:Math.min(e.len,along+o.w/2),y0:Math.max(y0,o.position[1]),y1:Math.min(y1,o.position[1]+o.h)}].filter(h=>h.x1>h.x0);
      }):[];
      const length=e?.len??Math.hypot(b[0]-a[0],b[1]-a[1]);
      const xs=[...new Set([0,length,...holes.flatMap(h=>[h.x0,h.x1])])].sort((a,b)=>a-b),ys=[...new Set([y0,y1,...holes.flatMap(h=>[h.y0,h.y1])])].sort((a,b)=>a-b);
      const lerp=(P,Q,s)=>[P[0]+(Q[0]-P[0])*s/length,P[1]+(Q[1]-P[1])*s/length];
      for(let xi=1;xi<xs.length;xi++)for(let yi=1;yi<ys.length;yi++){
        const x0=xs[xi-1],x1=xs[xi],lo=ys[yi-1],hi=ys[yi],mx=(x0+x1)/2,my=(lo+hi)/2;
        if(holes.some(h=>mx>h.x0&&mx<h.x1&&my>h.y0&&my<h.y1))continue;
        const AA=lerp(A,B,x0),BB=lerp(A,B,x1),aa=lerp(a,b,x0),bb=lerp(a,b,x1);
        mb.quad([BB[0],lo,BB[1]],[AA[0],lo,AA[1]],[AA[0],hi,AA[1]],[BB[0],hi,BB[1]],c,SURF.trim,[n[0],0,n[1]]);
        if(hi===y1)mb.quad([bb[0],hi,bb[1]],[BB[0],hi,BB[1]],[AA[0],hi,AA[1]],[aa[0],hi,aa[1]],shade(c,1.02),SURF.trim);
        if(bottom&&lo===y0)mb.quad([aa[0],lo,aa[1]],[AA[0],lo,AA[1]],[BB[0],lo,BB[1]],[bb[0],lo,bb[1]],shade(c,.92),SURF.trim);
      }
    }
  });
}

function cornerBlock(mb,p,e1,e2,y0,y1,L,prot,c){
  // bloque en L sobre la esquina convexa p (entre e1 entrante y e2 saliente)
  const n1=e1.n,n2=e2.n;
  const q=(x,z)=>[x,z];
  const a1=[p[0]-e1.d[0]*L,p[1]-e1.d[1]*L],b2=[p[0]+e2.d[0]*L,p[1]+e2.d[1]*L];
  const P=[p[0]+(n1[0]+n2[0])*prot,p[1]+(n1[1]+n2[1])*prot];
  const A1=[a1[0]+n1[0]*prot,a1[1]+n1[1]*prot],B2=[b2[0]+n2[0]*prot,b2[1]+n2[1]*prot];
  mb.quad([P[0],y0,P[1]],[A1[0],y0,A1[1]],[A1[0],y1,A1[1]],[P[0],y1,P[1]],c,SURF.trim,[n1[0],0,n1[1]]);
  mb.quad([B2[0],y0,B2[1]],[P[0],y0,P[1]],[P[0],y1,P[1]],[B2[0],y1,B2[1]],c,SURF.trim,[n2[0],0,n2[1]]);
  mb.quad([p[0],y1,p[1]],[P[0],y1,P[1]],[A1[0],y1,A1[1]],[a1[0],y1,a1[1]],c,SURF.trim,[0,1,0]);
  mb.quad([b2[0],y1,b2[1]],[B2[0],y1,B2[1]],[P[0],y1,P[1]],[p[0],y1,p[1]],c,SURF.trim,[0,1,0]);
  mb.quad([P[0],y0,P[1]],[p[0],y0,p[1]],[a1[0],y0,a1[1]],[A1[0],y0,A1[1]],shade(c,.9),SURF.trim,[0,-1,0]);
  mb.quad([B2[0],y0,B2[1]],[b2[0],y0,b2[1]],[p[0],y0,p[1]],[P[0],y0,P[1]],shade(c,.9),SURF.trim,[0,-1,0]);
  // tapas laterales
  mb.quad([a1[0],y1,a1[1]],[A1[0],y1,A1[1]],[A1[0],y0,A1[1]],[a1[0],y0,a1[1]],c,SURF.trim);
  mb.quad([B2[0],y1,B2[1]],[b2[0],y1,b2[1]],[b2[0],y0,b2[1]],[B2[0],y0,B2[1]],c,SURF.trim);
}

function roofSurface(mb,rings,y,c){mb.polygon(rings[0],rings.slice(1),y,c,SURF.roof);}

function parapet(mb,rings,wallTop,h,wall,trim,kind,r){
  const inner=rings.map(ring=>miterOffset(ring,-.25));
  const yTop=wallTop+h;
  rings.forEach((ring,k)=>{
    const inn=inner[k];
    for(let i=0;i<ring.length;i++){
      const j=(i+1)%ring.length,a=ring[i],b=ring[j],A=inn[i],B=inn[j];
      // cara interior (mira hacia el interior de la azotea)
      const dx=B[0]-A[0],dz=B[1]-A[1],l=Math.hypot(dx,dz)||1,n=[-dz/l,dx/l];
      mb.quad([A[0],wallTop-.05,A[1]],[B[0],wallTop-.05,B[1]],[B[0],yTop,B[1]],[A[0],yTop,A[1]],shade(wall,.93),SURF.wall,[n[0],0,n[1]]);
      // albardilla
      const ov=miterOffset([a,b],0);
      mb.quad([b[0],yTop,b[1]],[a[0],yTop,a[1]],[A[0],yTop,A[1]],[B[0],yTop,B[1]],trim,SURF.trim,[0,1,0]);
    }
    if(kind==='balustrade'&&k===0){
      // balaustrada: pilares cortos sobre el pretil, a lo largo de las aristas
      for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),d=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[d[1],-d[0]];
        for(let s=.35;s<len-.2;s+=2.4){const x=a[0]+d[0]*s-n[0]*.12,z=a[1]+d[1]*s-n[1]*.12;mb.box(x,yTop+.25,z,.16,.25,.16,Math.atan2(n[0],n[1]),trim,SURF.trim);}
      }
    }else if(kind==='rail'&&k===0){
      for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),d=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[d[1],-d[0]],yaw=Math.atan2(n[0],n[1]);
        const mid=[(a[0]+b[0])/2-n[0]*.12,(a[1]+b[1])/2-n[1]*.12];
        mb.box(mid[0],yTop+.55,mid[1],len/2,.02,.02,yaw,col('#d9dcdf'),SURF.metal);
        for(let s=.2;s<len;s+=1.5){mb.box(a[0]+d[0]*s-n[0]*.12,yTop+.28,a[1]+d[1]*s-n[1]*.12,.02,.28,.02,yaw,col('#d9dcdf'),SURF.metal);}}
    }
  });
}

// Detalles de azotea: casetón, máquinas, depósitos, antenas, chimeneas, placas.
function rooftop(pb,mb,ctx,wall,trim,r,y){
  const {b,st,rings}=pb,outer=rings[0];
  const inside=(x,z,m=1.2)=>inPoly(x,z,rings)&&[[m,0],[-m,0],[0,m],[0,-m]].every(([dx,dz])=>inPoly(x+dx,z+dz,rings));
  const spot=(m)=>{for(let t=0;t<14;t++){const x=range(r,pb.bbox[0],pb.bbox[2]),z=range(r,pb.bbox[1],pb.bbox[3]);if(inside(x,z,m))return [x,z];}return null;};
  const yaw=Math.atan2(outer[1][1]-outer[0][1],outer[1][0]-outer[0][0]);
  if(b.levels>=4&&b.area>140){const p=spot(2.2);if(p){mb.box(p[0],y+1.35,p[1],1.6,1.35,1.3,-yaw,shade(wall,.97),SURF.wall);mb.box(p[0],y+2.75,p[1],1.75,.06,1.45,-yaw,trim,SURF.trim);
    mb.box(p[0]+Math.cos(-yaw+Math.PI/2)*0,y+1.05,p[1],.45,1.05,1.32,-yaw,col('#6b6f75'),SURF.metal);}}
  const nAC=Math.floor(b.area/120*range(r,.3,1.1)*(ctx.region==='latam'?.6:1));
  for(let i=0;i<Math.min(nAC,8);i++){const p=spot(.8);if(!p)break;mb.box(p[0],y+.4,p[1],.55,.4,.38,-yaw,col('#e3e3df'),SURF.metal);mb.box(p[0],y+.82,p[1],.5,.02,.33,-yaw,col('#b8bbbd'),SURF.metal);}
  if(st.extras.tank&&r()<st.extras.tank){const n=1+Math.floor(r()*2);for(let i=0;i<n;i++){const p=spot(1);if(!p)break;mb.cylinder(p[0],y+.3,p[1],.6,1.1,10,col(r()<.6?'#2d3a4a':'#3a6fb0'),SURF.metal,{r2:.5});mb.box(p[0],y+.15,p[1],.7,.15,.7,0,col('#9a9590'),SURF.metal);}}
  if(st.extras.rebar&&r()<st.extras.rebar){for(const p of outer.slice(0,6))for(let k=0;k<4;k++){const x=p[0]-Math.sign(p[0]-pb.cx)*(.25+(k%2)*.12),z=p[1]-Math.sign(p[1]-pb.cz)*(.25+(k>1?.12:0));mb.box(x,y+1.0+st.parapet.h,z,.012,.6,.012,0,col('#6b4b3a'),SURF.metal);}}
  if(['madrid_clasico','eixample','casa','andaluz','publico'].includes(pb.styleId)){const n=Math.min(4,Math.floor(b.area/180)+1);for(let i=0;i<n;i++){const p=spot(.6);if(!p)break;mb.box(p[0],y+.9,p[1],.35,.9,.28,-yaw,col('#b8735a'),SURF.wall);mb.box(p[0],y+1.85,p[1],.42,.06,.34,-yaw,trim,SURF.trim);}}
  if(r()<.35){const p=spot(.5);if(p){mb.box(p[0],y+1.6,p[1],.025,1.6,.025,0,col('#9aa0a6'),SURF.metal);mb.box(p[0],y+2.6,p[1],.5,.015,.015,-yaw,col('#9aa0a6'),SURF.metal);mb.box(p[0],y+2.9,p[1],.35,.015,.015,-yaw,col('#9aa0a6'),SURF.metal);}}
  if(['madrid_moderno','oficinas','latam_moderno'].includes(pb.styleId)&&r()<.25){const p=spot(2.5);if(p){for(let k=-1;k<=1;k++)mb.box(p[0]+Math.cos(yaw)*k*1.1,y+.45,p[1]+Math.sin(yaw)*k*1.1,.5,.03,.9,-yaw+.0,col('#3b4f6e'),SURF.glass);}}
}

// Templete cilíndrico/octogonal sobre una esquina, con cúpula, linterna y remate.
function turret(mb,ctx,{p,e1,e2},wallTop,wall,trim,r){
  const nb=norm2(e1.n[0]+e2.n[0],e1.n[1]+e2.n[1]);
  const rT=Math.max(1.8,Math.min(3.2,Math.min(e1.len,e2.len)*.18));
  const cx=p[0]-nb[0]*rT*.62,cz=p[1]-nb[1]*rT*.62;
  const hB=range(r,3.0,4.4),y0=wallTop-1.2,yTop=wallTop+hB;
  mb.cylinder(cx,y0,cz,rT,yTop-y0,8,wall,SURF.wall);
  mb.cylinder(cx,wallTop-.1,cz,rT+.12,.35,8,trim,SURF.trim);
  mb.cylinder(cx,yTop,cz,rT+.28,.32,8,trim,SURF.trim);
  for(let k=0;k<8;k++){const a=(k+.5)/8*Math.PI*2,nx=Math.cos(a),nz=Math.sin(a);if(nx*nb[0]+nz*nb[1]<-.35)continue;
    const R=rT*Math.cos(Math.PI/8);
    ctx.inst.add('window',{w:.8,h:1.9,arch:true,surround:{w:.12,depth:.08,kind:'simple'},mullion:true,noFanBars:true},[cx+nx*R,wallTop+.45,cz+nz*R],Math.atan2(nx,nz),col('#f4f1ea'),{tint2:trim});}
  const domeC=col(pick(r,['#3f4650','#4a525c','#5e6670','#7fa79a','#8e99a3']));
  mb.dome(cx,yTop+.32,cz,rT+.08,rT*1.12,16,6,domeC,SURF.roof);
  const yL=yTop+.32+rT*1.12-.15;
  mb.cylinder(cx,yL,cz,.38,.9,8,trim,SURF.trim);
  mb.dome(cx,yL+.9,cz,.45,.45,8,3,domeC,SURF.roof);
  mb.cylinder(cx,yL+1.3,cz,.05,1.2,6,col('#c9a24a'),SURF.metal,{r2:.02});
  mb.dome(cx,yL+1.75,cz,.14,.14,6,2,col('#c9a24a'),SURF.metal);
}

// Perfil de revolución con normales suaves (bulbos, cúpulas apuntadas).
function revolve(mb,cx,cy,cz,R,H,profile,seg,c,surf){
  const pts=profile.map(([f,h])=>[f*R,h*H]);
  const nrm=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dr=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dr,dy)||1;return [dy/l,-dr/l];});
  for(let i=0;i<pts.length-1;i++)for(let k=0;k<seg;k++){
    const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2;
    const V=(j,a)=>[cx+Math.cos(a)*pts[j][0],cy+pts[j][1],cz+Math.sin(a)*pts[j][0]];
    const N=(j,a)=>[Math.cos(a)*nrm[j][0],nrm[j][1],Math.sin(a)*nrm[j][0]];
    const A=V(i,a0),B=V(i,a1),Cc=V(i+1,a1),D=V(i+1,a0);
    mb.vertex(...A,...N(i,a0),c,surf);mb.vertex(...D,...N(i+1,a0),c,surf);mb.vertex(...Cc,...N(i+1,a1),c,surf);
    mb.vertex(...A,...N(i,a0),c,surf);mb.vertex(...Cc,...N(i+1,a1),c,surf);mb.vertex(...B,...N(i,a1),c,surf);
  }
}

// Cubiertas inclinadas, mansardas, tejados de teja sobre huella compleja.
function emitRoof(pb,mb,ctx,kind,wallTop,wall,trim,r,box,inr,E){
  const {rings,st,b}=pb,outer=rings[0];
  const tile=roofColour(b,col(pick(r,ROOF.tile))),slate=roofColour(b,col(pick(r,ROOF.slate)));
  if(kind==='barrel'){
    // Bóveda rebajada a lo largo del lado largo, con testeros curvos.
    const ov=.35,u0=box.u0-ov,u1=box.u1+ov,v0=box.v0-ov,v1=box.v1+ov,vm=(v0+v1)/2,half=(v1-v0)/2,rise=Math.min(4.5,(v1-v0)*.14);
    const zinc=roofColour(b,col(pick(r,['#9aa4ad','#8e99a3','#b9c0c6','#6f8f9a'])));
    const P=(u,v,y)=>{const w=box.W(u,v);return [w[0],y,w[1]];};
    const Y=v=>wallTop+rise*(1-((v-vm)/half)**2);
    const N=12;
    for(let k=0;k<N;k++){const va=v0+(v1-v0)*k/N,vb=v0+(v1-v0)*(k+1)/N;
      mb.quad(P(u0,va,Y(va)),P(u0,vb,Y(vb)),P(u1,vb,Y(vb)),P(u1,va,Y(va)),zinc,17);
      mb.quad(P(u1,va,Y(va)-.03),P(u1,vb,Y(vb)-.03),P(u0,vb,Y(vb)-.03),P(u0,va,Y(va)-.03),shade(zinc,.8),SURF.metal);
      for(const [u,sg]of [[box.u0,1],[box.u1,-1]]){const A=P(u,va,wallTop),B=P(u,vb,wallTop),Cc=P(u,vb,Y(vb)),D=P(u,va,Y(va));
        if(sg>0)mb.quad(A,B,Cc,D,wall,SURF.wall);else mb.quad(B,A,D,Cc,wall,SURF.wall);}
    }
    return;
  }
  if(kind==='pyramid'||kind==='dome'||kind==='onion'){
    const cx=outer.reduce((s,p)=>s+p[0],0)/outer.length,cz=outer.reduce((s,p)=>s+p[1],0)/outer.length;
    const round=Math.abs(box.len-box.wid)/Math.max(box.len,box.wid)<.22;
    if(kind!=='pyramid'&&round){
      const c=box.W((box.u0+box.u1)/2,(box.v0+box.v1)/2),R=Math.min(box.len,box.wid)/2*.98;
      roofSurface(mb,rings,wallTop,col(pick(r,ROOF.flat)));
      const dc=roofColour(b,col(pick(r,['#4a525c','#7fa79a','#8e99a3','#b8643f'])));
      if(kind==='dome')mb.dome(c[0],wallTop,c[1],R,b.roof.height??R,20,7,dc,SURF.roof);
      else revolve(mb,c[0],wallTop,c[1],R,b.roof.height??R*1.7,[[1,0],[1.1,.18],[1.14,.36],[1.0,.56],[.66,.76],[.32,.9],[.1,.97],[0,1]],18,dc,SURF.roof);
      return;
    }
    if(inPoly(cx,cz,rings)){
      const h=b.roof.height??Math.max(1.5,Math.min(8,inr*.9)),apex=[cx,wallTop+h,cz],rc=b.roof.colour?safeColor(b.roof.colour,slate):(kind==='pyramid'?slate:tile);
      for(let i=0;i<outer.length;i++){const a=outer[i],c=outer[(i+1)%outer.length];mb.tri([c[0],wallTop,c[1]],[a[0],wallTop,a[1]],apex,rc,SURF.roof);}
      return;
    }
    kind='tile';
  }
  if(kind==='hipped'||kind==='gabled'){
    const ov=.45,pitch=(kind==='hipped'?27:32)*Math.PI/180;
    const u0=box.u0-ov,u1=box.u1+ov,v0=box.v0-ov,v1=box.v1+ov,len=u1-u0,wid=v1-v0;
    const h=wid/2*Math.tan(pitch),y=wallTop,vm=(v0+v1)/2;
    const P=(u,v,yy)=>{const w=box.W(u,v);return [w[0],yy,w[1]];};
    const ridge=kind==='hipped'?Math.max(0,len-wid)/2:len/2,um=(u0+u1)/2;
    const R0=P(um-ridge,vm,y+h),R1=P(um+ridge,vm,y+h);
    const c00=P(u0,v0,y),c10=P(u1,v0,y),c11=P(u1,v1,y),c01=P(u0,v1,y);
    const roofC=pb.styleId==='casa'&&r()<.3?slate:tile;
    // faldones largos
    const rs=roofSurfaceType(b,roofC===slate?17:13);
    mb.quad(c00,R0,R1,c10,roofC,rs);mb.quad(c11,R1,R0,c01,roofC,rs);
    if(kind==='hipped'){mb.tri(c10,R1,c11,roofC,rs);mb.tri(c01,R0,c00,roofC,rs);}
    else{mb.tri(c10,R1,c11,wall,SURF.wall);mb.tri(c01,R0,c00,wall,SURF.wall);
      // muro piñón hasta el alero (hueco entre muro y faldón)
    }
    // sofito (cara inferior del alero)
    const e0=P(u0,v0,y-.02),e1=P(u1,v0,y-.02),e2=P(u1,v1,y-.02),e3=P(u0,v1,y-.02);
    mb.quad(e0,e1,e2,e3,shade(trim,.85),SURF.trim,[0,-1,0]);
    // cumbrera
    if(ridge>0){const d=[R1[0]-R0[0],R1[2]-R0[2]],L=Math.hypot(d[0],d[1])||1;mb.box((R0[0]+R1[0])/2,y+h+.04,(R0[2]+R1[2])/2,L/2+.1,.06,.1,-Math.atan2(d[1],d[0]),shade(roofC,.85),SURF.roof);}
    if(st.extras.chimney&&r()<st.extras.chimney){const w=box.W(um+range(r,-ridge,ridge)*.8,vm+range(r,-.25,.25)*wid/2);mb.box(w[0],y+h*.6+.7,w[1],.35,h*.6+.7,.3,-box.ang,col('#b8735a'),SURF.wall);mb.box(w[0],y+h*1.2+1.45,w[1],.42,.06,.37,-box.ang,trim,SURF.trim);}
    return;
  }
  // Mansarda (pizarra/zinc) o tejado de teja a cuatro aguas con azotea central
  const mansard=kind==='mansard';
  const wM=mansard?Math.min(1.7,inr*.5):Math.min(3.4,inr*.75);
  const pitch=mansard?60*Math.PI/180:24*Math.PI/180;
  const hM=wM*Math.tan(pitch);
  const ov=mansard?.0:.35;
  const outerRing=miterOffset(outer,ov),innerRing=miterOffset(outer,-wM);
  // validez: el anillo interior no debe invertirse
  const valid=innerRing.every((p,i)=>{const j=(i+1)%outer.length,od=[outer[j][0]-outer[i][0],outer[j][1]-outer[i][1]],nd=[innerRing[j][0]-p[0],innerRing[j][1]-p[1]];return od[0]*nd[0]+od[1]*nd[1]>0;})&&ringSignedArea(innerRing)>4;
  const c=mansard?slate:tile;
  if(!valid){pb.roofRepresentation={...pb.roofRepresentation,kind:'flat',approximate:true};roofSurface(mb,rings,wallTop,roofColour(b,col(pick(r,ROOF.flat))));parapet(mb,rings,wallTop,.6,wall,trim,'solid',r);return;}
  const y=wallTop+(mansard?.0:.0);
  for(let i=0;i<outer.length;i++){
    const j=(i+1)%outer.length;
    mb.quad([outerRing[i][0],y,outerRing[i][1]],[innerRing[i][0],y+hM,innerRing[i][1]],[innerRing[j][0],y+hM,innerRing[j][1]],[outerRing[j][0],y,outerRing[j][1]],c,roofSurfaceType(b,mansard?17:13));
    if(ov>0)mb.quad([outerRing[i][0],y-.02,outerRing[i][1]],[outerRing[j][0],y-.02,outerRing[j][1]],[outer[j][0],y-.02,outer[j][1]],[outer[i][0],y-.02,outer[i][1]],shade(trim,.85),SURF.trim);
  }
  // remate superior
  const topC=roofColour(b,mansard?shade(slate,1.08):col(pick(r,ROOF.flat)));
  mb.polygon(innerRing,[],y+hM,topC,SURF.roof);
  if(mansard){
    // borde de zinc en la arista superior
    for(let i=0;i<innerRing.length;i++){const a=innerRing[i],b=innerRing[(i+1)%innerRing.length],d=[b[0]-a[0],b[1]-a[1]],L=Math.hypot(...d);if(L<.3)continue;
      mb.box((a[0]+b[0])/2,y+hM+.04,(a[1]+b[1])/2,L/2,.04,.06,-Math.atan2(d[1],d[0]),col('#8e99a3'),SURF.metal);}
    // buhardillas en los frentes de calle
    for(const e of E){if(e.k>0||e.exp==='party'||e.len<3)continue;
      const n=Math.max(1,Math.floor((e.len-1.5)/3.2)),step=e.len/n;
      for(let k=0;k<n;k++){const s=step*(k+.5),p=[e.a[0]+e.d[0]*s-e.n[0]*.55,e.a[1]+e.d[1]*s-e.n[1]*.55];
        ctx.inst.add('dormer',{w:1.25,h:1.5,pitch,roofColor:'#'+slate.getHexString(),wallColor:'#'+trim.getHexString()},[p[0],y+.25,p[1]],e.yaw,col('#f4f1ea'));}}
  }else if(st.extras.chimney||['madrid_clasico','andaluz','colonial','casa'].includes(pb.styleId)){
    const n=Math.min(3,1+Math.floor(r()*3));
    for(let k=0;k<n;k++){const i=Math.floor(r()*innerRing.length),p=innerRing[i];mb.box(p[0],y+hM*.7+.6,p[1],.32,hM*.7+.6,.26,0,col('#b8735a'),SURF.wall);}
  }
}

export {inPoly,obb,inradius};
