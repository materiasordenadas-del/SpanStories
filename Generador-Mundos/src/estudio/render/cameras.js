// Cámaras sugeridas a partir del lugar: vista general, cenital, amplia, cruces con nombre
// (a la altura de los ojos) y la calle principal (ojos, contrapicado, picado).
import * as THREE from 'three';
import {junctions} from '../geom/ground.js';

const RANK={motorway:9,trunk:8,primary:7,secondary:6,tertiary:5,unclassified:3,residential:3,living_street:2,service:1,pedestrian:2};

function inRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function cameraPresets(model){
  const T=model.terrain,{width:W,depth:D}=model.size,S=Math.max(W,D);
  const out=[];
  const blocked=(x,z,m=.6)=>model.buildings.some(b=>b.minHeight<2.5&&x>b.bbox[0]-m&&x<b.bbox[2]+m&&z>b.bbox[1]-m&&z<b.bbox[3]+m&&[[0,0],[m,0],[-m,0],[0,m],[0,-m]].some(([dx,dz])=>inRing(x+dx,z+dz,b.rings[0])));
  // Desplaza una cámara a pie hacia un punto libre (hacia el eje de la calle y luego hacia atrás).
  const free=(x,z,cx,cz,dir)=>{if(!blocked(x,z))return [x,z];
    for(let t=.2;t<=1.01;t+=.2){const px=x+(cx-x)*t,pz=z+(cz-z)*t;if(!blocked(px,pz))return [px,pz];}
    for(let k=1;k<12;k++){const px=cx-dir[0]*k*3,pz=cz-dir[1]*k*3;if(!blocked(px,pz))return [px,pz];}
    return [cx,cz];};
  const g=(x,z)=>T.height(x,z);
  const c0=g(0,0);
  out.push({id:'overview',name:'Vista general (toda la zona)',pos:[S*.5,c0+S*.78,S*.62],target:[0,c0,-S*.04],lens:28});
  out.push({id:'top',name:'Cenital',pos:[0,c0+S*1.35,.01],target:[0,c0,0],lens:35});
  out.push({id:'wide',name:'Vista amplia (horizonte)',pos:[-S*.95,c0+S*.32,S*.9],target:[S*.05,c0+10,-S*.05],lens:24});
  const roads=model.roads.filter(r=>r.type!=='pedestrian'||r.cls==='pedestrian');
  const J=junctions(roads).map(j=>{const names=[...new Set(j.roads.map(r=>r.name).filter(Boolean))];
    const score=j.roads.reduce((s,r)=>s+(RANK[r.cls]??1),0)+names.length*2-Math.hypot(j.x,j.z)/S*6;return {...j,names,score};})
    .filter(j=>Math.abs(j.x)<W*.42&&Math.abs(j.z)<D*.42).sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const j of J){if(chosen.some(c=>Math.hypot(c.x-j.x,c.z-j.z)<40))continue;chosen.push(j);if(chosen.length>=4)break;}
  chosen.forEach((j,i)=>{
    // De pie en una esquina, mirando a lo largo de la calle principal del cruce.
    const main=j.roads.slice().sort((a,b)=>(RANK[b.cls]??1)-(RANK[a.cls]??1))[0];
    const dir=roadDirAt(main,j.x,j.z);
    const w=Math.max(...j.roads.map(r=>r.width));
    const side=[-dir[1],dir[0]];
    let px=j.x-dir[0]*(w*.7+4)+side[0]*(w*.5+1.6),pz=j.z-dir[1]*(w*.7+4)+side[1]*(w*.5+1.6);
    [px,pz]=free(px,pz,j.x-dir[0]*(w*.7+4),j.z-dir[1]*(w*.7+4),dir);
    out.push({id:'ix'+i,name:`Cruce ${i+1} · ${j.names.slice(0,2).join(' × ')||'sin nombre'}`,pos:[px,g(px,pz)+.15+1.6,pz],target:[j.x+dir[0]*30-side[0]*3,g(j.x,j.z)+4,j.z+dir[1]*30-side[1]*3],lens:24,eye:true});
  });
  // Calle principal: la vía con nombre más larga cerca del centro.
  const named=model.roads.filter(r=>r.name&&r.type!=='pedestrian'||r.cls==='pedestrian'&&r.name).map(r=>({r,len:length(r.points),d:minDist(r.points)})).filter(o=>o.d<S*.25).sort((a,b)=>b.len-a.len-(a.d-b.d)*.3);
  const main=named[0]?.r??model.roads.slice().sort((a,b)=>length(b.points)-length(a.points))[0];
  if(main){
    const mid=pointAlong(main.points,.5),dir=mid.dir,side=[-dir[1],dir[0]];
    const off=main.type==='vehicle'?main.width/2+1.4:0;
    let ex=mid.x-dir[0]*35+side[0]*off,ez=mid.z-dir[1]*35+side[1]*off;
    [ex,ez]=free(ex,ez,mid.x-dir[0]*35,mid.z-dir[1]*35,dir);
    const ey=g(ex,ez)+.15;
    out.push({id:'center',name:'Calle central · altura de ojos · '+(main.name||main.cls),pos:[ex,ey+1.6,ez],target:[mid.x+dir[0]*25,g(mid.x,mid.z)+3,mid.z+dir[1]*25],lens:24,eye:true});
    out.push({id:'centerLow',name:'Calle central · contrapicado',pos:[ex,ey+.7,ez],target:[mid.x+dir[0]*10,g(mid.x,mid.z)+18,mid.z+dir[1]*10],lens:18,eye:true});
    out.push({id:'centerHigh',name:'Calle central · picado',pos:[ex-dir[0]*10,ey+28,ez-dir[1]*10],target:[mid.x+dir[0]*35,g(mid.x,mid.z),mid.z+dir[1]*35],lens:28});
  }
  return out;
}

function length(p){let s=0;for(let i=1;i<p.length;i++)s+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return s;}
function minDist(p){return Math.min(...p.map(q=>Math.hypot(q[0],q[1])));}
function pointAlong(p,t){const L=length(p)*t;let s=0;for(let i=1;i<p.length;i++){const l=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);if(s+l>=L){const u=(L-s)/(l||1);return {x:p[i-1][0]+(p[i][0]-p[i-1][0])*u,z:p[i-1][1]+(p[i][1]-p[i-1][1])*u,dir:[(p[i][0]-p[i-1][0])/(l||1),(p[i][1]-p[i-1][1])/(l||1)]};}s+=l;}const a=p.at(-2),b=p.at(-1),l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return {x:b[0],z:b[1],dir:[(b[0]-a[0])/l,(b[1]-a[1])/l]};}
function roadDirAt(r,x,z){let best=null;for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i];const d=Math.min(Math.hypot(a[0]-x,a[1]-z),Math.hypot(b[0]-x,b[1]-z));if(!best||d<best.d){const l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;let dir=[(b[0]-a[0])/l,(b[1]-a[1])/l];
  // apuntar alejándose del cruce
  if(Math.hypot(a[0]-x,a[1]-z)>Math.hypot(b[0]-x,b[1]-z))dir=[-dir[0],-dir[1]];best={d,dir};}}return best?.dir??[1,0];}

export function applyPreset(viewer,preset){
  viewer.camera.position.set(...preset.pos);
  viewer.controls.target.set(...preset.target);
  viewer.camera.near=preset.eye?.15:.5;
  viewer.setLens(preset.lens??28);
  viewer.camera.lookAt(...preset.target);
  viewer.controls.update();viewer.dirty=true;
}
