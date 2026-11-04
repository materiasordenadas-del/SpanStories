import {projection,pointInPolygon,polygonArea,insideRegion} from './projection.js';
const areaFamily=tags=>['building','highway','natural','water','landuse','leisure','amenity'].find(k=>tags?.[k])??'area';
const same=(a,b)=>Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lon-b.lon)<1e-7;
const validCoordinate=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon);
// Clip display/network segments; canonical OSM geometry remains in geo.features.
export function clipLine(feature,bounds){const pieces=[];let current=null;for(let i=1;i<feature.points.length;i++){const a=feature.points[i-1],b=feature.points[i],dx=b.x-a.x,dz=b.z-a.z;let lo=0,hi=1,visible=true;for(const [p,q]of [[-dx,a.x+bounds.width/2],[dx,bounds.width/2-a.x],[-dz,a.z+bounds.depth/2],[dz,bounds.depth/2-a.z]]){if(p===0){if(q<0)visible=false;}else{const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);}}if(!visible||lo>=hi){current=null;continue;}const point=u=>({x:a.x+dx*u,z:a.z+dz*u}),id=(u,end)=>u===0?feature.nodeIds[i-1]:u===1?feature.nodeIds[i]:`${feature.id}:boundary:${i}:${end}`,first=point(lo),last=point(hi),firstId=id(lo,'entry'),lastId=id(hi,'exit');if(!current||current.nodeIds.at(-1)!==firstId){current={...feature,points:[first],nodeIds:[firstId]};pieces.push(current);}current.points.push(last);current.nodeIds.push(lastId);if(hi<1)current=null;}return pieces;}
function joinMembers(members){const chains=members.filter(m=>m.geometry.every(validCoordinate)).map(m=>({geometry:m.geometry.slice(),refs:[m.ref]})).filter(c=>c.geometry.length>1),rings=[];while(chains.length){const chain=chains.shift();let changed=true;while(changed&&!same(chain.geometry[0],chain.geometry.at(-1))){changed=false;for(let i=0;i<chains.length;i++){const next=chains[i],a=chain.geometry[0],b=chain.geometry.at(-1),c=next.geometry[0],d=next.geometry.at(-1);if(same(b,c))chain.geometry.push(...next.geometry.slice(1));else if(same(b,d))chain.geometry.push(...next.geometry.slice(0,-1).reverse());else if(same(a,d))chain.geometry.unshift(...next.geometry.slice(0,-1));else if(same(a,c))chain.geometry.unshift(...next.geometry.slice(1).reverse());else continue;chain.refs.push(...next.refs);chains.splice(i,1);changed=true;break;}}if(chain.geometry.length>=4&&same(chain.geometry[0],chain.geometry.at(-1)))rings.push(chain);}return rings;}
export function normalizeOSM(source){const frame=projection(source.bounds),features=[],warnings=[],membersInRelations=new Set(),elements=source.osm.elements;const point=g=>frame.project(g.lat,g.lon),convertRing=g=>g.slice(0,-1).map(point),base=e=>({osmId:e.type+'/'+e.id,osmType:e.type,osmNumericId:e.id,tags:{...e.tags},origin:'observed',source:'OpenStreetMap',sourceTimestamp:source.osm.timestamps?.[0]??null});
 for(const e of elements.filter(e=>e.type==='relation'&&(e.tags?.type==='multipolygon'||e.tags?.type==='boundary'))){
   const members=(e.members??[]).filter(m=>m.type==='way'&&['','outer','inner'].includes(m.role??''));
   for(const member of members)membersInRelations.add(member.ref+':'+areaFamily(e.tags));
   if(members.some(m=>!m.geometry?.length||!m.geometry.every(validCoordinate))){warnings.push(`Relación ${e.id} con coordenadas incompletas; no se inventó su geometría`);continue;}
   const outer=joinMembers(members.filter(m=>m.role!=='inner')),inner=joinMembers(members.filter(m=>m.role==='inner'));
   if(!outer.length||[...outer,...inner].reduce((n,r)=>n+r.refs.length,0)!==members.length){warnings.push(`Relación ${e.id} sin anillos completos; no se inventó su geometría`);continue;}
   for(const o of outer){const rings=[convertRing(o.geometry)],holes=inner.map(h=>convertRing(h.geometry)).filter(r=>pointInPolygon(r[0],rings));rings.push(...holes);features.push({...base(e),id:`osm:relation:${e.id}`+(outer.length>1?':outer:'+Math.min(...o.refs):''),type:'polygon',rings});}
 }
 for(const e of elements){
   const tags=e.tags;if(!tags)continue;
   if(e.type==='node'&&validCoordinate(e)){const p=point(e);if(insideRegion(p,frame.bounds))features.push({...base(e),id:`osm:node:${e.id}`,type:'point',...p});}
   else if(e.type==='way'&&e.geometry?.length>1){
     if(!e.geometry.every(validCoordinate)){warnings.push(`Vía ${e.id} con coordenadas incompletas; no se inventó su geometría`);continue;}
     const closed=e.geometry.length>3&&same(e.geometry[0],e.geometry.at(-1)),area=closed&&(tags.building||tags['building:part']||tags.landuse||tags.leisure||tags.natural&&!['coastline','cliff','tree_row'].includes(tags.natural)||tags.area==='yes'||tags.water||tags.amenity&&!tags.highway);
     if(area&&membersInRelations.has(e.id+':'+areaFamily(tags)))continue;
     features.push({...base(e),id:`osm:way:${e.id}`,type:area?'polygon':'line',...(area?{rings:[convertRing(e.geometry)]}:{points:e.geometry.map(point),nodeIds:e.nodes?.map(n=>'osm:node:'+n)??e.geometry.map((p,i)=>`osm:way:${e.id}:node:${i}`)})});
   }
 }
 return {features,warnings,frame:{...frame.bounds,projection:'local-equirectangular',units:'meters',xAxis:'east',zAxis:'south'}};
}
export function metric(value){
 if(value===undefined||value===null)return null;
 const text=String(value).trim().toLowerCase().replace(',','.');
 const feet=text.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")$/);
 if(feet){const inches=Number(feet[2]);return inches<12?Math.sign(Number(feet[1])||1)*(Math.abs(Number(feet[1]))*.3048+inches*.0254):null;}
 const m=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(m|metres?|meters?|cm|mm|km|ft|feet|foot|'|in|inch|inches|")?$/);
 if(!m)return null;const n=Number(m[1]),unit=m[2]??'m';
 const factor={cm:.01,mm:.001,km:1000,ft:.3048,feet:.3048,foot:.3048,"'":.3048,in:.0254,inch:.0254,inches:.0254,'"':.0254}[unit]??1;
 return Number.isFinite(n*factor)?n*factor:null;
}
export function featureBounds(feature){const points=feature.rings?feature.rings.flat():feature.points??[feature];const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));return {x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ};}
export function buildingFrame(feature){const ring=feature.rings[0];let longest=0,yaw=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],d=Math.hypot(b.x-a.x,b.z-a.z);if(d>longest){longest=d;yaw=-Math.atan2(b.z-a.z,b.x-a.x);}}const c=Math.cos(yaw),s=Math.sin(yaw),local=ring.map(p=>({x:p.x*c-p.z*s,z:p.x*s+p.z*c})),box=featureBounds({points:local}),x=box.x*c+box.z*s,z=-box.x*s+box.z*c;return {x,z,width:box.width,depth:box.depth,yaw,area:polygonArea(ring)};}
export function roadNetwork(features,bounds=null){if(bounds)features=features.flatMap(f=>f.type==='line'?clipLine(f,bounds):[f]);const lines=features.filter(f=>f.type==='line'&&f.tags.highway&&!['proposed','construction'].includes(f.tags.highway)),uses=new Map(),nodes=new Map(),roads=[],edges=[];for(const f of lines)f.nodeIds.forEach((id,i)=>{uses.set(id,(uses.get(id)??0)+1);nodes.set(id,{id,...f.points[i],origin:'observed',source:'OpenStreetMap'});});
 for(const f of lines){const pedestrian=['footway','path','steps','pedestrian','cycleway','bridleway'].includes(f.tags.highway),measured=metric(f.tags.width),lanes=Number(f.tags.lanes),width=measured>0?measured:lanes>0?Math.min(lanes*3.1,30):pedestrian?2.3:['motorway','trunk','primary'].includes(f.tags.highway)?12:['secondary','tertiary'].includes(f.tags.highway)?8:5.8;let start=0;for(let i=1;i<f.points.length;i++){if(i<f.points.length-1&&(uses.get(f.nodeIds[i])??0)<2)continue;const points=f.points.slice(start,i+1),ids=f.nodeIds.slice(start,i+1),id=`${f.id}:segment:${ids[0]}:${ids.at(-1)}`;roads.push({id,from:ids[0],to:ids.at(-1),points,nodeIds:ids,width,kind:pedestrian?'path':'street',name:f.tags.name??f.tags.highway,osmId:f.osmId,tags:f.tags,origin:'observed',source:'OpenStreetMap',fieldSources:{geometry:'observed:OSM',width:measured>0?'observed:width':lanes>0?'estimated:lanes':'estimated:road-class'},bridge:f.tags.bridge&&f.tags.bridge!=='no',layer:metric(f.tags.layer)??0});for(let j=1;j<ids.length;j++)edges.push({from:ids[j-1],to:ids[j],roadId:id});start=i;}}
 return {nodes:[...nodes.values()],roads,edges};}
