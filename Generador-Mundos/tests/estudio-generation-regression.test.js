import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from 'three';
import {boundsAround,projection} from '../src/geo/projection.js';
import {metric,normalizeOSM} from '../src/geo/osm.js';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {withInteriors,buildInteriorGroup} from '../src/estudio/arq/interior.js';
import {buildGround,pointInPaths} from '../src/estudio/geom/ground.js';
import {toExPolygons} from '../src/estudio/geom/clip.js';
import {Walker} from '../src/estudio/render/walk.js';
import {GeoService} from '../server/geo-service.js';
import {remapChunkIds,worldPrepared} from '../src/estudio/scene/chunks.js';

const bounds=boundsAround(40,-3,100),frame=projection(bounds);
const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const geometry=points=>points.map(([x,z])=>frame.unproject(x,z));
const way=(id,ring,tags)=>({type:'way',id,tags,geometry:geometry([...ring,ring[0]])});
const source=elements=>({format:'atlas-geographic-source',bounds,osm:{elements},label:'Regresión controlada'});
const model=elements=>buildPlaceModel(source(elements),{seed:'regresion'});

test('units are converted exactly and ambiguous measurements remain unknown',()=>{
  for(const [value,expected]of [['12 m',12],['250 cm',2.5],['1200 mm',1.2],['0.01 km',10],[`10' 6"`,3.2004],['6 ft',1.8288],['2,5',2.5]])assert.ok(Math.abs(metric(value)-expected)<1e-8,value);
  for(const value of ['12;15','3-5','about 8','8 furlongs','',Infinity])assert.equal(metric(value),null,String(value));
});

test('overlapping building parts cannot falsely erase the uncovered outline',()=>{
  const m=model([way(1,rect(-20,-20,20,20),{building:'yes',height:'12'}),way(2,rect(-20,-20,-2,20),{'building:part':'yes',height:'12'}),way(3,rect(-20,-20,-2,20),{'building:part':'yes',height:'20',min_height:'12'})]);
  assert.ok(m.buildings.find(b=>b.id==='osm:way:1')?.partialParts,'55% del edificio debe conservarse');
  assert.equal(m.buildings.length,3);
});

test('a part wrapping a courtyard belongs to its outline despite its centroid lying in the hole',()=>{
  const outer=geometry([...rect(-20,-20,20,20),[-20,-20]]),inner=geometry([...rect(-8,-8,8,8),[-8,-8]]);
  const relation=(id,tags,ref)=>({type:'relation',id,tags:{type:'multipolygon',...tags},members:[{type:'way',ref,role:'outer',geometry:outer},{type:'way',ref:ref+1,role:'inner',geometry:inner}]});
  const m=model([relation(1,{building:'yes',name:'Con patio'},10),relation(2,{'building:part':'yes',height:'9'},20)]);
  assert.equal(m.buildings.length,1);assert.equal(m.buildings[0].parent.id,'osm:relation:1');
  assert.ok(Math.abs(m.buildings[0].area-(1600-256))<.05);
});

test('buildings crossing the selection survive even with their centre outside it; building:part=no is not a building',()=>{
  const m=model([way(1,rect(40,-10,80,10),{building:'yes',height:'9'}),way(2,rect(-10,-10,10,10),{'building:part':'no'}),way(3,rect(80,20,90,30),{building:'yes'})]);
  assert.deepEqual(m.buildings.map(b=>b.id),['osm:way:1']);
  assert.ok(m.buildings[0].bbox[2]>50,'se conserva la huella completa, sin inventar una fachada en el borde');
});

test('tunnels and covered ways retain their source without becoming surface asphalt',()=>{
  const m=model([{type:'way',id:1,tags:{highway:'residential',tunnel:'yes'},geometry:geometry([[-40,0],[40,0]])},{type:'way',id:2,tags:{highway:'footway',covered:'yes'},geometry:geometry([[-10,-20],[10,-20]])}]);
  assert.equal(m.roads.length,2);assert.equal(m.roads[0].tunnel,true);assert.equal(m.roads[1].covered,true);
  assert.equal(pointInPaths(0,0,toExPolygons(buildGround(m).asphalt)),false);
});

test('a multipolygon cannot invent a segment across missing source coordinates',()=>{
  const ring=geometry([...rect(-10,-10,10,10),[-10,-10]]);ring[2]=null;
  const normalized=normalizeOSM(source([{type:'relation',id:1,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:1,role:'outer',geometry:ring}]}]));
  assert.equal(normalized.features.length,0);assert.ok(normalized.warnings.length);
});

test('an incomplete courtyard is not silently filled and missing way coordinates do not crash generation',()=>{
  const outer=geometry([...rect(-20,-20,20,20),[-20,-20]]),inner=geometry([...rect(-8,-8,8,8),[-8,-8]]);inner[1]=null;
  const relation={type:'relation',id:1,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:1,role:'outer',geometry:outer},{type:'way',ref:2,role:'inner',geometry:inner}]};
  assert.equal(normalizeOSM(source([relation])).features.length,0);
  const invalidWay=way(5,rect(-10,-10,10,10),{building:'yes'});invalidWay.geometry[0]=null;
  const normalized=normalizeOSM(source([invalidWay]));assert.equal(normalized.features.length,0);assert.ok(normalized.warnings.length);
});

test('invalid Overpass responses fail over before caching, and old bad cache entries are repaired',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'atlas-provider-regression-'));
  try{
    const service=new GeoService({cacheDir:dir,overpass:'https://primary.invalid',overpassMirrors:['https://mirror.invalid']});let requests=[];
    service.request=async(url,{body})=>{requests.push(url);return Buffer.from(JSON.stringify(url.includes('primary')?{remark:'runtime error: Query timed out',elements:[]}:{elements:[{type:'node',id:1,lat:40,lon:-3,tags:{natural:'tree'}}]}));};
    const result=await service.osm(bounds);assert.equal(result.elements.length,1);assert.ok(requests.includes('https://mirror.invalid'));
    for(const file of await readdir(dir)){const path=join(dir,file),record=JSON.parse(await readFile(path,'utf8'));assert.equal(record.value.remark,undefined);record.value={remark:'runtime error: Query timed out',elements:[]};await writeFile(path,JSON.stringify(record));}
    requests=[];assert.equal((await service.osm(bounds)).elements.length,1);assert.ok(requests.length);
  }finally{await rm(dir,{recursive:true,force:true});}
});

function interiorWorld(){
  const m=model([way(1,rect(-10,-6,10,6),{building:'apartments',height:'12','building:levels':'4','roof:shape':'flat'})]);
  m.buildings[0].forceStyle='madrid_moderno';
  const enabled=withInteriors(m,{'osm:way:1':{enabled:true,layout:'two',height:2.2,doorHeight:1.9}}),built=buildBuildings(enabled),pb=built.prepared[0];
  assert.ok(pb.interiorPlan,pb.interiorIssue);
  const walker=Object.create(Walker.prototype);walker.radius=.35;walker.eye=1.6;walker.pos=new THREE.Vector3(0,pb.interiorPlan.floor,0);walker.setWorld({model:enabled,buildings:built.prepared,interiors:buildInteriorGroup(built.prepared)});
  return {walker,pb,plan:pb.interiorPlan};
}

test('interior doorway collides above the lintel while the opening remains traversable',()=>{
  const {walker,plan}=interiorWorld(),p=new THREE.Vector3(...[plan.center[0],plan.floor,plan.center[1]]),before=p.clone();
  walker.collide(p);assert.ok(p.distanceTo(before)<1e-6);
  p.y=plan.floor+plan.doorHeight-.1;const high=p.clone();walker.collide(p);assert.ok(p.distanceTo(high)>.3);
  const eye=new THREE.Vector3(plan.center[0]-plan.entry.n[0],plan.floor+plan.doorHeight+.1,plan.center[1]-plan.entry.n[1]);
  assert.ok(walker.cameraDistance(eye,new THREE.Vector3(plan.entry.n[0],0,plan.entry.n[1]),3)<1);
});

test('interior camera and jumping respect the ceiling; outside remains unrestricted',()=>{
  const {walker,plan}=interiorWorld(),x=plan.center[0]-plan.entry.n[0]*2,z=plan.center[1]-plan.entry.n[1]*2;
  const origin=new THREE.Vector3(x,plan.ceiling-.5,z);
  assert.ok(walker.cameraDistance(origin,new THREE.Vector3(0,1,0),3)<.6);
  walker.viewer={camera:new THREE.PerspectiveCamera()};walker.pos.set(x,plan.floor,z);walker.active=true;walker.third=false;walker.pitch=0;walker.yaw=0;walker.keys=new Set();walker.speed=1.6;walker.vy=3.6;walker.grounded=false;
  for(let i=0;i<15;i++){walker.update(.05);assert.ok(walker.pos.y+walker.eye<=plan.ceiling-.09,'la cabeza no atraviesa el techo');}
  assert.equal(walker.cameraDistance(new THREE.Vector3(30,3,30),new THREE.Vector3(0,1,0),3),3);
});

test('streamed interiors preserve global shading IDs and world collision coordinates',()=>{
  const {pb}=interiorWorld(),local={buildings:[pb.b],roads:[]},global={buildings:[{id:'other'},pb.b],roads:[]},built=buildInteriorGroup([pb]);
  remapChunkIds({group:built.group,lod:{entries:[]}},local,global);
  built.group.traverse(o=>{if(o.isMesh)assert.ok([...o.geometry.attributes.aId.array].every(id=>id===2));});
  const world=worldPrepared(pb,{cx:200,cz:-100},global);
  assert.equal(world.interiorPlan.center[0],pb.interiorPlan.center[0]+200);
  assert.equal(world.interiorPlan.center[1],pb.interiorPlan.center[1]-100);
  assert.deepEqual(world.interiorPlan.walls[0][0],pb.interiorPlan.walls[0][0].map((v,i)=>v+(i?-100:200)));
});
