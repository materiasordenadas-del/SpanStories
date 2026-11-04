// Colegio generado sobre un lugar real: se elige un rectángulo (el recinto escolar de OSM o la zona
// del marcador, alineada con la calle), se retira lo que había dentro y se colocan las piezas del
// colegio con el relieve real. Las calles de alrededor y la ciudad se conservan.
import {generateSchool} from './school.js';
import {obb} from '../arq/buildings.js';
import {nearestSegment} from '../geom/ground.js';
import {regionOf} from '../arq/styles.js';

// La entrada del colegio (lado +v local) mira a la calle más cercana.
function faceRoad(model,rect){
  const n=nearestSegment(model.roads.filter(r=>r.type==='vehicle'),rect.cx,rect.cz,400);
  if(!n)return rect;
  const c=Math.cos(rect.angle),s=Math.sin(rect.angle),dx=n.px-rect.cx,dz=n.pz-rect.cz;
  const u=dx*c+dz*s,v=-dx*s+dz*c;
  // si la calle queda más a un lado corto que a uno largo, girar 90°
  if(Math.abs(u)/rect.W>Math.abs(v)/rect.D){rect={...rect,angle:rect.angle+(u>0?-Math.PI/2:Math.PI/2),W:rect.D,D:rect.W};return rect;}
  if(v<0)rect={...rect,angle:rect.angle+Math.PI};
  return rect;
}
export function schoolRectFromArea(model,area){
  const b=obb(area.rings[0]);const c=b.W((b.u0+b.u1)/2,(b.v0+b.v1)/2);
  return faceRoad(model,{cx:c[0],cz:c[1],angle:b.ang,W:Math.max(80,b.len),D:Math.max(60,b.wid),name:area.name});
}
export function schoolRectAt(model,x,z,{W=160,D=120}={}){
  const n=nearestSegment(model.roads.filter(r=>r.type==='vehicle'),x,z,200);
  const angle=n?Math.atan2(n.dz,n.dx):0;
  return faceRoad(model,{cx:x,cz:z,angle,W,D,name:null});
}

export function placeSchool(real,rect,seed,opts={}){
  const region=regionOf(real.bounds);
  const estilo=opts.estilo??(region==='latam'?'latam':'espana');
  const W=Math.round(rect.W),D=Math.round(rect.D);
  const sch=generateSchool(seed,{...opts,estilo,plot:{W,D},insitu:true,barrio:false});
  const c=Math.cos(rect.angle),s=Math.sin(rect.angle);
  const T=p=>[rect.cx+p[0]*c-p[1]*s,rect.cz+p[0]*s+p[1]*c];
  const local=(x,z)=>{const dx=x-rect.cx,dz=z-rect.cz;return [dx*c+dz*s,-dx*s+dz*c];};
  const inside=(x,z,m=1.5)=>{const [u,v]=local(x,z);return Math.abs(u)<W/2+m&&Math.abs(v)<D/2+m;};
  const yawOff=-rect.angle;
  const bboxOf=ring=>{const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);return [Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];};
  const centroid=ring=>ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
  const model={...real,label:(rect.name?rect.name+' · ':'')+'colegio generado',kind:'real+school'};
  // Fuera todo edificio que entre más de 3 m en el recinto (las huellas de OSM no son exactas en el borde).
  model.buildings=real.buildings.filter(b=>{const c0=centroid(b.rings[0]);return !inside(c0[0],c0[1])&&!b.rings[0].some(p=>inside(p[0],p[1],-3));});
  model.areas=real.areas.filter(a=>{const c0=a.c??centroid(a.rings[0]);return !inside(c0[0],c0[1],-2);});
  model.points=real.points.filter(p=>!inside(p.x,p.z));
  model.lines=real.lines.filter(l=>!l.points.every(p=>inside(p[0],p[1])));
  model.roads=real.roads.filter(r=>r.type==='vehicle'||!r.points.every(p=>inside(p[0],p[1],3)));
  const tf=ring=>ring.map(T);
  for(const b of sch.buildings){const rings=b.rings.map(tf);model.buildings.push({...b,rings,bbox:bboxOf(rings[0])});}
  for(const a of sch.areas){const rings=a.rings.map(tf);model.areas.push({...a,rings,c:centroid(rings[0])});}
  for(const p of sch.points){const [x,z]=T([p.x,p.z]);model.points.push({...p,x,z,tags:{...p.tags,...(p.tags?.yaw!=null?{yaw:p.tags.yaw+yawOff}:{})}});}
  for(const l of sch.lines)model.lines.push({...l,points:l.points.map(T)});
  model.school={...sch.school,rect,estilo};
  model.stats={...real.stats,buildings:model.buildings.length};
  return model;
}
