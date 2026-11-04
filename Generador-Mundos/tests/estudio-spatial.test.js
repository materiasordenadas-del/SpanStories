import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Terrain} from '../src/estudio/data/terrain.js';
import {readLocalTerrain,withLocalTerrain,withRoadEdits,validateRoadEdit} from '../src/estudio/data/spatial-edits.js';
import {interiorPlan,withInteriors,buildInteriorGroup,splitWallForDoor} from '../src/estudio/arq/interior.js';
import {sampleRoad,roadHeightFunction,surfaceHeightAt,tunnelGroundHoles} from '../src/estudio/geom/road-surface.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {buildGround} from '../src/estudio/geom/ground.js';
import {Walker} from '../src/estudio/render/walk.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';
import {applyEdits} from '../src/estudio/data/edits.js';

function model(){return {format:'atlas-estudio-lugar',kind:'school',seed:'interior',region:'espana',size:{width:100,depth:100},bounds:{centerLat:40,centerLon:-3},terrain:Terrain.flat(100,100),buildings:[{id:'b:1',rings:[[[-10,-6],[10,-6],[10,6],[-10,6]]],area:240,height:18,levels:6,minHeight:0,use:'residential',tags:{},shops:[],roof:{shape:'flat',shapeSource:'osm:roof:shape'},forceStyle:'madrid_moderno'}],roads:[{id:'r:1',cls:'residential',type:'road',points:[[-40,-16],[40,-16]],width:6,widthSource:'estimated',layer:0}],areas:[],points:[],lines:[]};}
const terrainData=()=>({format:'atlas-estudio-dem',version:1,units:'m',source:{name:'Cuadrícula de prueba',license:'CC0'},resolution:3,width:100,depth:100,centerLat:40,centerLon:-3,heights:[100,100,100,100,102,100,100,100,100]});
test('local terrain matches its declared area, preserves source and survives project save/reopen',()=>{
  const m=model(),dem=readLocalTerrain(JSON.stringify(terrainData()),m),edited=withLocalTerrain(m,dem);assert.equal(edited.terrain.height(0,0),2);assert.equal(m.terrain.height(0,0),0);assert.equal(edited.terrainSource.license,'CC0');
  assert.throws(()=>readLocalTerrain(JSON.stringify({...dem,centerLat:41}),m),/centro/);
  const p=decodeProject(encodeProject({model:m,mode:'school',place:{lat:40,lon:-3,size:100},seed:'a',seeds:{alturas:'a',fachadas:'b',calle:'c',suelo:'d'},terrainOverride:dem,roadEdits:{'r:1':{structure:'bridge',elevationOffset:3}},interiors:{'b:1':{enabled:true}},overrides:{'b:1':{baseOffset:.05}}}));
  assert.equal(withLocalTerrain(p.model,p.terrainOverride).terrain.height(0,0),2);assert.equal(p.interiors['b:1'].enabled,true);assert.equal(p.roadEdits['r:1'].elevationOffset,3);assert.equal(p.overrides['b:1'].baseOffset,.05);
  const large=new Terrain({width:100,depth:100,resolution:513,heights:new Array(513*513).fill(120)});assert.equal(large.origin,120);assert.equal(large.height(0,0),0);
});
test('road edits preserve the source axis and produce continuous bridge/tunnel walking surfaces',()=>{
  const m=model(),original=JSON.stringify(m.roads),bridge=withRoadEdits(m,{'r:1':{structure:'bridge',width:8,elevationOffset:3}}).roads[0],samples=sampleRoad(bridge.points),height=roadHeightFunction(bridge,m.terrain,samples.at(-1).s);
  assert.equal(JSON.stringify(m.roads),original);assert.equal(bridge.points,m.roads[0].points);assert.ok(height(samples[Math.floor(samples.length/2)])>4);assert.ok(Math.abs(height(samples[0])-.35)<1e-9);
  const tunnel=withRoadEdits(m,{'r:1':{structure:'tunnel',depth:6,clearance:4.8}}),r=tunnel.roads[0],h=roadHeightFunction(r,m.terrain,80);assert.ok(h({x:0,z:-16,s:40})< -5);assert.ok(tunnelGroundHoles(tunnel).length>0);
  const points=samples.map(p=>({...p,y:h(p)})),surface={kind:'tunnel',width:r.width,points};let y=.15;
  for(let x=-40;x<=0;x+=.1)y=surfaceHeightAt([surface],x,-16,y,.15);assert.ok(y< -5);
  assert.throws(()=>validateRoadEdit({structure:'tunnel',depth:4,clearance:4.8}),/profundidad/);
  const ground=buildGround({...tunnel,groundHoles:tunnelGroundHoles(tunnel)});assert.ok(ground.meshes.length>0);
});
test('optional interior cuts a real entrance, blocks walls, supports traversal and keeps roof geometry',()=>{
  const m=model(),before=buildBuildings(m),modified=withInteriors(m,{'b:1':{enabled:true,layout:'two'}}),after=buildBuildings(modified),pb=after.prepared[0],plan=pb.interiorPlan;
  assert.ok(plan,pb.interiorIssue);assert.equal(m.buildings[0].interiorConfig,undefined);assert.equal(plan.partitions.length,2);
  const walls=splitWallForDoor(plan.entry.a,plan.entry.b,0,18,plan);assert.equal(walls.length,4);assert.ok(walls.every(w=>w.y0>=plan.floor+plan.doorHeight||w.y1<=plan.floor||w.b===plan.doorA||w.a===plan.doorB));
  const interiors=buildInteriorGroup(after.prepared),walker=Object.create(Walker.prototype);walker.radius=.35;walker.pos=new THREE.Vector3(plan.center[0]+plan.entry.n[0],.15,plan.center[1]+plan.entry.n[1]);walker.setWorld({model:modified,buildings:after.prepared,interiors});
  const door=new THREE.Vector3(plan.center[0],plan.floor,plan.center[1]);walker.collide(door);assert.ok(door.distanceTo(new THREE.Vector3(plan.center[0],plan.floor,plan.center[1]))<.001);
  const wall=new THREE.Vector3(plan.entry.a[0]*.75+plan.entry.b[0]*.25,.15,plan.entry.a[1]*.75+plan.entry.b[1]*.25);const old=wall.clone();walker.collide(wall);assert.ok(wall.distanceTo(old)>.3);assert.equal(walker.groundAt(0,0,plan.floor),plan.floor);
  const roofs=result=>result.meshes.flatMap(({geometry:g})=>{const p=g.attributes.position,s=g.attributes.aSurf,out=[];for(let i=0;i<p.count;i++)if([9,13,17].includes(s.getX(i)))out.push(p.getX(i),p.getY(i),p.getZ(i));return out;});assert.deepEqual(roofs(after),roofs(before));
  const moved=buildBuildings(applyEdits(m,{'b:1':{baseOffset:1}}));assert.equal(moved.prepared[0].base,before.prepared[0].base+1);
  assert.throws(()=>withInteriors({...m,buildings:[{...m.buildings[0],modelId:'glb:test'}]},{'b:1':{enabled:true}}),/modelo/);
  assert.throws(()=>withInteriors({...m,buildings:[{...m.buildings[0],use:'religious',forceStyle:'iglesia'}]},{'b:1':{enabled:true}}),/religioso/);
  assert.throws(()=>interiorPlan({...pb,gmax:1,gmin:0},plan.entry),/incompatible/);
});
