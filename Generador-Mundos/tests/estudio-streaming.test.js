import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Terrain} from '../src/estudio/data/terrain.js';
import {chunkManifest,chunkModel,chunkSignature,remapChunkIds,STREAM_LIMITS} from '../src/estudio/scene/chunks.js';
import {StreamScene} from '../src/estudio/scene/stream-scene.js';
import {ResourcePool,geometryBytes} from '../src/estudio/render/resources.js';
import {InstanceSet} from '../src/estudio/arq/instances.js';
import {ElementLOD} from '../src/estudio/render/lod.js';
import '../src/estudio/arq/proxies.js';
import {buildingIdFromHit} from '../src/estudio/render/selection.js';
import {cropGeometry} from '../src/estudio/geom/crop.js';
import {MeshBuilder,SURF} from '../src/estudio/geom/mesh.js';
const b=(id,x,z)=>({id,rings:[[[x-5,z-5],[x+5,z-5],[x+5,z+5],[x-5,z+5]]],height:12,levels:4,minHeight:0,roof:{shape:'flat'}});
function model(){return {seed:'chunks',size:{width:2000,depth:2000},bounds:{centerLat:40,centerLon:-3},terrain:Terrain.flat(2000,2000),buildings:[b('oeste',-900,-900),b('este',900,900)],roads:[],areas:[],lines:[],points:[]};}
function fake(local){const group=new THREE.Group(),geometry=new THREE.BoxGeometry(10,10,10),material=new THREE.MeshBasicMaterial();group.add(new THREE.Mesh(geometry,material));return {group,buildings:{prepared:[]},ground:{asphalt:[]},street:{trees:[]},infra:{walkSurfaces:[]},lod:{entries:[],update(){},full(){}},stats:{buildings:local.renderIds.size}};}
test('chunks preserve absolute placement, disjoint ownership and isolated invalidation signatures',()=>{
  const m=model(),chunks=chunkManifest(m),a=chunks.find(c=>c.buildingIds.includes('oeste')),z=chunks.find(c=>c.buildingIds.includes('este')),local=chunkModel(m,a);
  assert.equal(chunks.length,100);assert.equal(chunks.flatMap(c=>c.buildingIds).length,2);assert.equal(local.buildings[0].rings[0][0][0]+a.cx,m.buildings[0].rings[0][0][0]);
  const edited={...m,buildings:[{...m.buildings[0],height:20},m.buildings[1]]};assert.notEqual(chunkSignature(m,a,{}),chunkSignature(edited,a,{}));assert.equal(chunkSignature(m,z,{}),chunkSignature(edited,z,{}));
});
test('streaming loads only nearby detail, releases distant resources and reconstructs edited data on return',async()=>{
  const m=model(),calls=[],s=new StreamScene(m,{},async local=>{calls.push([...local.renderIds]);return fake(local);});
  await s.update({x:-900,z:-900});assert.ok(s.loaded.size<=9&&s.loaded.size<100);assert.ok(calls.some(ids=>ids.includes('oeste')));assert.ok(!calls.some(ids=>ids.includes('este')));
  const mesh=[...s.loaded.values()][0].built.group.children[0];let freed=0;mesh.geometry.addEventListener('dispose',()=>freed++);
  await s.update({x:900,z:900});assert.equal(freed,1);assert.ok(calls.some(ids=>ids.includes('este')));assert.ok(![...s.loaded.values()].some(e=>e.chunk.buildingIds.includes('oeste')));
  const edited={...m,buildings:[{...m.buildings[0],height:29},m.buildings[1]]};await s.setModel(edited,{});await s.update({x:-900,z:-900});assert.equal(chunkModel(s.model,[...s.loaded.values()].find(e=>e.chunk.buildingIds.includes('oeste')).chunk).buildings[0].height,29);assert.ok(s.built.stats.stream.bytes>0);s.dispose();assert.equal(s.pool.refs.size,0);
});
test('obsolete async loads are discarded and shared resources remain until the last consumer leaves',async()=>{
  const m=model();let finish,stale;const s=new StreamScene(m,{},()=>new Promise(resolve=>{finish=()=>{stale=fake({renderIds:new Set()});resolve(stale);};}));
  const loading=s.update({x:0,z:0});s.dispose();finish();await loading;assert.equal(s.loaded.size,0);assert.equal(s.group.children.length,0);
  const g=new THREE.BoxGeometry(),mat=new THREE.MeshBasicMaterial(),a=new THREE.Group(),z=new THREE.Group();a.add(new THREE.Mesh(g,mat));z.add(new THREE.Mesh(g,mat));let freed=0;g.addEventListener('dispose',()=>freed++);const pool=new ResourcePool();pool.retain(a);pool.retain(z);pool.release(a);assert.equal(freed,0);pool.release(z);assert.equal(freed,1);assert.ok(geometryBytes(a)>0);
});
test('LOD compaction and chunk remapping retain the correct owner for near and far instances',()=>{
  const inst=new InstanceSet();inst.add('window',{w:1,h:1},[100,0,0],0,'#fff',{building:0});inst.add('window',{w:1,h:1},[0,0,0],0,'#fff',{building:1});
  const group=new THREE.Group();inst.build(()=>new THREE.MeshBasicMaterial()).forEach(m=>group.add(m));const lod=new ElementLOD(group,{near:20}),m={buildings:[{id:'global0'},{id:'global1'},{id:'local0'},{id:'local1'}]},local={buildings:[{id:'local0'},{id:'local1'}],roads:[]};
  remapChunkIds({group,lod},local,m);lod.update(new THREE.Vector3(),true);const entry=lod.entries[0];assert.equal(buildingIdFromHit({object:entry.im,instanceId:0},m),'local1');assert.equal(buildingIdFromHit({object:entry.proxy,instanceId:0},m),'local0');lod.full();assert.equal(entry.im.count,2);assert.equal(entry.im.userData.buildings[0],2);
});
test('chunk ground markings stay inside their area and clipping does not add artificial curbs at boundaries',()=>{
  const mb=new MeshBuilder(),col=new THREE.Color('#fff');mb.quad([-1,.01,-.05],[1,.01,-.05],[1,.01,.05],[-1,.01,.05],col,SURF.paving);mb.quad([0,0,-1],[0,.15,-1],[0,.15,1],[0,0,1],col,SURF.paving);
  const cropped=cropGeometry(mb.build(),[0,-1,1,1],{omitBoundaryWalls:true});cropped.computeBoundingBox();assert.ok(cropped.boundingBox.min.x>=0);assert.ok(cropped.boundingBox.max.x<=1);assert.ok([...cropped.attributes.normal.array].filter((_,i)=>i%3===1).every(y=>Math.abs(y)>.99));
});
