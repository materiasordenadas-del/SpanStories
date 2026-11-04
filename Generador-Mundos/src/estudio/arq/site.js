// Recinto: muros, vallas y setos (líneas OSM o generadas), equipamiento de pistas y patios.
import * as THREE from 'three';
import {SURF,shade} from '../geom/mesh.js';
import {rng,pick} from '../data/rng.js';
import {obb} from './buildings.js';
import './sports-elements.js';

const col=hex=>new THREE.Color(hex);

// Barreras a lo largo de polilíneas. kind: wall | fence | hedge | wall_fence | city_wall | railing
export function buildBarriers(lines,{T,mb,inst,seed='b'}){
  let count=0;
  for(const l of lines){
    const kind=l.kind==='barrier'?mapBarrier(l.sub):l.kind;
    if(!kind)continue;
    const r=rng(seed+':barrera:'+l.id);
    const pts=l.points;
    const wallC=col(pick(r,['#e6dccb','#d9cdb6','#cdbfa6','#e9e2d4','#c9a98a'])),cap=col('#efe8da');
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<.2)continue;
      const yaw=-Math.atan2(dz,dx),ux=dx/L,uz=dz/L;
      const pieces=Math.max(1,Math.ceil(L/(kind==='fence'||kind==='railing'?2.5:6)));
      for(let k=0;k<pieces;k++){
        const s0=k*L/pieces,s1=(k+1)*L/pieces,len=s1-s0,cx=a[0]+ux*(s0+s1)/2,cz=a[1]+uz*(s0+s1)/2,y=T.height(cx,cz)+.15;
        if(kind==='wall'||kind==='wall_fence'||kind==='city_wall'){
          const h=kind==='city_wall'?(l.height??7):kind==='wall_fence'?.85:(l.height??2.1),t=kind==='city_wall'?1.6:.3;
          mb.box(cx,y+h/2-.3,cz,len/2+.01,h/2+.3,t/2,yaw,kind==='city_wall'?col('#d4c4a2'):wallC,kind==='city_wall'?21:SURF.wall);
          mb.box(cx,y+h+.04,cz,len/2+.02,.05,t/2+.05,yaw,cap,SURF.trim);
          if(kind==='city_wall'){for(let m=-len/2+.6;m<len/2;m+=2.2)mb.box(cx+ux*m,y+h+.6,cz+uz*m,.55,.55,t/2,yaw,col('#d4c4a2'),21);}
          if(kind==='wall_fence')inst.add('fence',{h:1.6},[cx,y+h+.08,cz],yaw,null,{scale:[len/2.5,1,1]});
        }else if(kind==='fence'||kind==='railing'){
          inst.add('fence',{h:kind==='railing'?1.0:(l.height??1.8)},[cx,y,cz],yaw,null,{scale:[len/2.5,1,1]});
        }else if(kind==='hedge'){
          const h=l.height??1.3;
          mb.box(cx,y+h/2,cz,len/2+.15,h/2,.45,yaw,col(pick(r,['#5f8f45','#6a9a4c','#58853f'])),SURF.foliage);
        }
        count++;
      }
    }
  }
  return count;
}
function mapBarrier(sub){
  if(['wall','retaining_wall'].includes(sub))return 'wall';
  if(sub==='city_wall')return 'city_wall';
  if(['fence','chain_link'].includes(sub))return 'fence';
  if(['railing','guard_rail','handrail'].includes(sub))return 'railing';
  if(sub==='hedge')return 'hedge';
  return null;
}

// Equipamiento de las pistas según el deporte (OSM sport=* o el que decida el generador).
export function equipSports(areas,{T,inst,seed='s'}){
  let count=0;
  for(const a of areas){
    const sport=a.tags?.sport||a.sport||'';
    const ring=a.rings[0];if(ring.length<3)continue;
    const box=obb(ring),c=box.W((box.u0+box.u1)/2,(box.v0+box.v1)/2),y=T.height(c[0],c[1])+.15;
    const along=[Math.cos(box.ang),Math.sin(box.ang)];
    const yawAlong=Math.atan2(along[0],along[1]);
    const end=(sign,inset)=>{const p=box.W(sign>0?box.u1-inset:box.u0+inset,(box.v0+box.v1)/2);return [p[0],y,p[1]];};
    if(a.kind==='pitch'&&/basket/.test(sport)){
      inst.add('basketHoop',{},end(1,1.2),yawAlong+Math.PI,null);inst.add('basketHoop',{},end(-1,1.2),yawAlong,null);count+=2;
    }else if(a.kind==='pitch'&&/soccer|futbol|football/.test(sport)||a.kind==='pitch'&&!sport&&a.area>600){
      const small=box.len<60;
      const g={w:small?3:7.32,h:small?2:2.44,d:small?1.0:1.8};
      inst.add('goal',g,end(1,1.25),yawAlong+Math.PI,null);inst.add('goal',g,end(-1,1.25),yawAlong,null);count+=2;
    }else if(a.kind==='pitch'&&/tennis|padel/.test(sport)){
      inst.add('tennisNet',{w:Math.min(12.8,box.wid-1)},[c[0],y,c[1]],yawAlong,null);count++;
    }else if(a.kind==='pool'){
      const lanes=Math.max(2,Math.floor(box.wid/2.5));
      for(let k=1;k<lanes;k++){const p=box.W((box.u0+box.u1)/2,box.v0+k*box.wid/lanes);inst.add('laneRope',{l:Math.round(box.len-.6)},[p[0],T.height(p[0],p[1])-.08,p[1]],-box.ang,null);}
      for(let k=0;k<lanes;k++){const p=box.W(box.u0-.35,box.v0+(k+.5)*box.wid/lanes);inst.add('startBlock',{},[p[0],T.height(p[0],p[1])+.15,p[1]],Math.atan2(-along[0],-along[1])+Math.PI,null);}
      count+=lanes;
    }else if(a.kind==='playground'){
      const r=rng(seed+':juegos:'+a.id);
      const p1=box.W(box.u0+box.len*.3,(box.v0+box.v1)/2),p2=box.W(box.u0+box.len*.72,(box.v0+box.v1)/2);
      inst.add('swing',{},[p1[0],T.height(p1[0],p1[1])+.15,p1[1]],-box.ang,null);
      if(box.len>8)inst.add('slide',{},[p2[0],T.height(p2[0],p2[1])+.15,p2[1]],-box.ang+r()*1.5,null);
      count+=2;
    }
  }
  return count;
}
