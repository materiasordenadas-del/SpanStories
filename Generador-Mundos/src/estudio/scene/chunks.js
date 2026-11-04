import {Terrain} from '../data/terrain.js';
import {cropGeometry} from '../geom/crop.js';

export const CHUNK_SIZE=200;
export const STREAM_LIMITS={maxBuildings:20000,maxPerChunk:1500,maxChunks:9,maxBytes:192*1048576,radius:260};
export function chunkManifest(model){
  if(Math.max(model.size.width,model.size.depth)>2000)throw Error('El modo por sectores admite hasta 2 km por lado');
  if(model.buildings.length>STREAM_LIMITS.maxBuildings)throw Error('El modo por sectores admite hasta 20 000 edificios; reduce el área');
  const w=model.size.width,d=model.size.depth,out=[];
  for(let i=0;i<Math.ceil(w/CHUNK_SIZE);i++)for(let j=0;j<Math.ceil(d/CHUNK_SIZE);j++){const x0=-w/2+i*CHUNK_SIZE,z0=-d/2+j*CHUNK_SIZE,x1=Math.min(w/2,x0+CHUNK_SIZE),z1=Math.min(d/2,z0+CHUNK_SIZE);out.push({id:i+':'+j,x0,z0,x1,z1,cx:(x0+x1)/2,cz:(z0+z1)/2,buildingIds:[]});}
  for(const b of model.buildings){const c=center(b.rings[0]),i=Math.max(0,Math.min(Math.ceil(w/CHUNK_SIZE)-1,Math.floor((c[0]+w/2)/CHUNK_SIZE))),j=Math.max(0,Math.min(Math.ceil(d/CHUNK_SIZE)-1,Math.floor((c[1]+d/2)/CHUNK_SIZE)));out.find(c=>c.id===i+':'+j).buildingIds.push(b.id);}
  if(out.some(c=>c.buildingIds.length>STREAM_LIMITS.maxPerChunk))throw Error('Un sector supera 1500 edificios; reduce la densidad o el área');
  return out;
}
export const center=ring=>[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length];
function touches(points,c,margin=0){const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);return Math.max(...xs)>=c.x0-margin&&Math.min(...xs)<=c.x1+margin&&Math.max(...zs)>=c.z0-margin&&Math.min(...zs)<=c.z1+margin;}
export function chunkModel(model,chunk){
  const {cx,cz,x0,x1,z0,z1}=chunk,shift=p=>[p[0]-cx,p[1]-cz],ring=r=>r.map(shift),width=x1-x0,depth=z1-z0;
  const n=model.terrainSource?.kind==='local-dem'?Math.min(257,Math.max(3,Math.ceil(Math.max(width,depth)/Math.max(model.size.width,model.size.depth)*(model.terrain.n-1))+1)):17;
  const heights=[];for(let z=0;z<n;z++)for(let x=0;x<n;x++)heights.push(model.terrain.height(x0+x/(n-1)*width,z0+z/(n-1)*depth));
  const terrain=new Terrain({width,depth,resolution:n,heights,origin:0});terrain.origin=model.terrain.origin;
  const buildings=model.buildings.filter(b=>chunk.buildingIds.includes(b.id)||touches(b.rings[0],chunk,70)).map(b=>({...b,rings:b.rings.map(ring),shops:(b.shops??[]).map(p=>({...p,x:p.x-cx,z:p.z-cz})),commerceOrigin:[cx,cz]}));
  return {...model,size:{width,depth},placementBounds:{x0:-model.size.width/2-cx,x1:model.size.width/2-cx,z0:-model.size.depth/2-cz,z1:model.size.depth/2-cz},terrain,buildings,roads:model.roads.filter(r=>touches(r.points,chunk,40)).map(r=>({...r,points:r.points.map(shift)})),areas:model.areas.filter(a=>touches(a.rings[0],chunk)).map(a=>({...a,rings:a.rings.map(ring),c:a.c?shift(a.c):a.c})),lines:model.lines.filter(l=>touches(l.points,chunk,3)).map(l=>({...l,points:l.points.map(shift)})),points:model.points.filter(p=>p.x>=x0&&p.x<x1&&p.z>=z0&&p.z<z1).map(p=>({...p,x:p.x-cx,z:p.z-cz})),renderIds:new Set(chunk.buildingIds)};
}
export function chunkSignature(model,chunk,settings){
  const nearby=model.buildings.filter(b=>chunk.buildingIds.includes(b.id)||touches(b.rings[0],chunk,70)),roads=model.roads.filter(r=>touches(r.points,chunk,40));
  return JSON.stringify([settings,nearby,model.comercios??{},roads,model.areas.filter(a=>touches(a.rings[0],chunk)),model.lines.filter(l=>touches(l.points,chunk,3)),model.points.filter(p=>p.x>=chunk.x0&&p.x<chunk.x1&&p.z>=chunk.z0&&p.z<chunk.z1),model.terrain.origin,Array.from(model.terrain.h)]);
}
export function worldPrepared(pb,chunk,model){
  const shift=p=>[p[0]+chunk.cx,p[1]+chunk.cz],index=model.buildings.findIndex(b=>b.id===pb.b.id),plan=pb.interiorPlan;
  return {...pb,index,b:model.buildings[index],rings:pb.rings.map(r=>r.map(shift)),cx:pb.cx+chunk.cx,cz:pb.cz+chunk.cz,bbox:pb.bbox.map((v,i)=>v+(i%2?chunk.cz:chunk.cx)),interiorPlan:plan?{...plan,rings:plan.rings.map(r=>r.map(shift)),center:shift(plan.center),doorA:shift(plan.doorA),doorB:shift(plan.doorB),walls:plan.walls.map(s=>s.map(shift)),partitions:plan.partitions.map(s=>s.map(shift)),entry:{...plan.entry,a:shift(plan.entry.a),b:shift(plan.entry.b),mid:shift(plan.entry.mid)}}:null};
}
export function remapChunkIds(built,local,global){
  const indices=local.buildings.map(b=>global.buildings.findIndex(g=>g.id===b.id));
  built.commerce?.lod?.remapOwners(indices);
  for(const e of built.lod.entries??[])if(e.all.owners)e.all.owners=e.all.owners.map(i=>i>=0?indices[i]:-1);
  built.group.traverse(o=>{if(o.userData.kind==='building'||o.userData.kind==='building-interior'){const a=o.geometry.attributes.aId;for(let i=0;i<a.count;i++)if(a.getX(i)>0)a.setX(i,indices[a.getX(i)-1]+1);}
    if(o.userData.buildings)o.userData.buildings=o.userData.buildings.map(i=>i>=0?indices[i]:-1);
    if(o.userData.kind==='infrastructure'){const a=o.geometry.attributes.aId;for(let i=0;i<a.count;i++){const road=local.roads[a.getX(i)-1];if(road)a.setX(i,global.roads.findIndex(g=>g.id===road.id)+1);}}
  });
}
export function finalizeChunk(built,local,chunk,global){
  const box=[-local.size.width/2,-local.size.depth/2,local.size.width/2,local.size.depth/2];
  for(const o of [...built.group.children])if(['ground','infrastructure'].includes(o.userData.kind)){
    const old=o.geometry,g=cropGeometry(old,box,{omitBoundaryWalls:o.name==='bordillos'});o.geometry=g;for(const m of built.ground.meshes??[])if(m.geometry===old)m.geometry=g;old.dispose();
  }
  remapChunkIds(built,local,global);built.group.position.set(chunk.cx,0,chunk.cz);built.group.updateMatrixWorld(true);return built;
}
