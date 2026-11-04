import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GrassField} from '../src/estudio/render/grass.js';
import {grassConfig,grassLOD} from '../src/estudio/render/grass-config.js';
import {jamesBladeGeometry} from '../src/estudio/render/grass-geometry.js';

function field(){const g=new GrassField({value:new THREE.Vector3(0,1,0)});g.setConfig({mask:false,chunksPerFrame:8,lod0:10,lod1:20,transition:2});g.needsBake=false;g.groundAt=(x,z)=>x*.02+z*.01;return g;}
function camera(x=0,z=0){const c=new THREE.PerspectiveCamera(60,1,.1,100);c.position.set(x,1.6,z);c.lookAt(x,1,z-10);c.updateMatrixWorld();return c;}
function settle(g,c){for(let i=0;i<100;i++){g.update(c,true,i/60);if(!g.stats.queued)break;}}

test('James topology is retained: five vertices and three triangles per blade; far is one triangle',()=>{
  const near=jamesBladeGeometry(3),far=jamesBladeGeometry(3,1);
  assert.equal(near.attributes.position.count,15);assert.equal(near.index.count,27);assert.equal(far.attributes.position.count,3);assert.equal(far.index.count,3);
  assert.deepEqual(Array.from(near.index.array.slice(0,9)),[0,1,2,2,4,3,3,0,2]);near.dispose();far.dispose();
});
test('configuration rejects malformed files and clamps budgets and LOD bands',()=>{
  assert.throws(()=>grassConfig({height:NaN}));assert.throws(()=>grassConfig({main:'red;'}));assert.throws(()=>grassConfig({mask:'false'}));
  const c=grassConfig({lod0:25,lod1:4,transition:5,height:99});assert.equal(c.height,2);assert.equal(c.lod1,26);assert.equal(c.transition,.5);
  const classic=grassConfig({lod0:10,lod1:20,transition:2});assert.equal(grassLOD(10.2,classic,0),0);assert.equal(grassLOD(10.2,classic,1),1);assert.equal(grassLOD(20.6,classic,1),2);
  assert.equal(grassConfig().lod0,20);assert.equal(grassConfig().lod1,50);
});
test('generation follows the real surface, respects exclusions and is identical after recycling',()=>{
  const g=field();g.surfaceAt=(x,z)=>x<2?x*.02+z*.01:NaN;
  const a=g.generate({},0,0),copy=a.data.slice(0,a.count*4);g.generate(a,22,-7);g.generate(a,0,0);
  assert.deepEqual(a.data.slice(0,a.count*4),copy);assert.ok(a.count>0);
  for(let i=0;i<a.count;i++){assert.ok(a.data[i*4]<2);assert.ok(Math.abs(a.data[i*4+1]-(a.data[i*4]*.02+a.data[i*4+2]*.01-.006))<1e-5);}g.dispose();
});
test('wind, colours and height use uniforms without regenerating or uploading buffers',()=>{
  const g=field(),c=camera();g.setConfig({culling:false});settle(g,c);const generated=g.stats.generated,uploads=g.stats.uploads,buffers=g.batches.map(b=>b.attribute.array);
  g.setConfig({height:.12,main:'#669933',windStrength:.3});g.update(c,true,5);
  assert.equal(g.stats.generated,generated);assert.equal(g.stats.uploads,uploads);assert.equal(g.uniforms.uGeometry.value.x,.12);assert.equal(g.batches[0].attribute.array,buffers[0]);
  g.setConfig({height:.8});g.update(c,true,6);assert.equal(g.stats.generated,generated);assert.equal(g.stats.uploads,uploads);g.dispose();
});
test('near/far batches enforce exact radial limits and hard instance/triangle budgets',()=>{
  const g=field(),c=camera();g.setConfig({maxInstances:4000,maxTriangles:12000});settle(g,c);assert.ok(g.stats.instances>0);assert.ok(g.stats.instances<=4000);assert.ok(g.stats.triangles<=12000);
  for(let lod=0;lod<2;lod++){const b=g.batches[lod];for(let i=0;i<b.count;i++){const a=b.attribute.array,d=Math.hypot(a[i*4]-c.position.x,a[i*4+2]-c.position.z);assert.ok(d<20);if(!lod)assert.ok(d<10);else assert.ok(d>=8);}}
  assert.ok(g.stats.calls<=2);g.dispose();
});
test('camera motion reuses chunks and buffers, returning restores the seeded distribution',()=>{
  const g=field(),c=camera();settle(g,c);const original=g.chunks.get('0,0'),copy=original.data.slice(0,original.count*4),buffers=g.batches.map(b=>b.attribute.array);
  const generated=g.stats.generated;c.position.x=.05;g.update(c,true,8);assert.equal(g.stats.generated,generated);
  for(const x of [32,64,32,0]){c.position.x=x;c.lookAt(x,1,-10);settle(g,c);}
  const back=g.chunks.get('0,0');assert.deepEqual(back.data.slice(0,back.count*4),copy);assert.equal(g.batches[0].attribute.array,buffers[0]);assert.ok(g.chunks.size+g.pool.length<200);g.dispose();
});
test('frustum culling removes offscreen sectors and a turn does not regenerate the field',()=>{
  const g=field(),c=camera();settle(g,c);const n=g.stats.generated,ids=Array.from(g.chunks.values()).filter(c=>c.visible).map(c=>c.x+','+c.z);
  c.lookAt(0,1,10);g.update(c,true,10);const turned=Array.from(g.chunks.values()).filter(c=>c.visible).map(c=>c.x+','+c.z);assert.notDeepEqual(turned,ids);assert.equal(g.stats.generated,n);g.dispose();
});
test('saved settings round-trip without changing terrain or unrelated scene resources',()=>{
  const a=field(),b=field();a.setConfig({height:.12,root:'#123456',seed:1234,reference:'character'});b.load(a.serialize());assert.deepEqual(b.config,a.config);
  const old=b.config;assert.throws(()=>b.load('{"type":"other","version":1,"config":{}}'));assert.equal(b.config,old);a.dispose();b.dispose();
});
test('50 metres retain coverage across the radius instead of spending the budget in a small circle',()=>{
  const g=field(),c=camera();g.setConfig({lod0:50,lod1:60,transition:10});settle(g,c);
  assert.equal(g.stats.queued,0);assert.ok(g.stats.instances<=g.config.maxInstances);assert.ok(g.stats.triangles<=g.config.maxTriangles);
  const near=g.batches[0];let farthest=0;for(let i=0;i<near.count;i++)farthest=Math.max(farthest,Math.hypot(near.attribute.array[i*4],near.attribute.array[i*4+2]));assert.ok(farthest>48);assert.ok(farthest<50);g.dispose();
});
test('mask lookup preserves the top-down Z orientation and excludes a blocked texel',()=>{
  const g=field();g.setConfig({mask:true});g.maskRect.set(-100,-100,200,2048);g.maskHeight.set(0,65535);g.maskPixels=new Uint8Array(2048*2048*4);
  const x=20,z=-30,px=(x+100)/200*2048-.5,pz=(100-z)/200*2048-.5,ix=Math.floor(px),iz=Math.floor(pz);
  for(const row of [iz,iz+1])for(const col of [ix,ix+1]){const k=(row*2048+col)*4;g.maskPixels[k]=255;g.maskPixels[k+1]=0x12;g.maskPixels[k+2]=0x34;}
  assert.equal(g.surfaceAt(x,z),0x1234);assert.ok(Number.isNaN(g.surfaceAt(x,-z)));g.maskPixels[(iz*2048+ix)*4]=0;assert.ok(Number.isNaN(g.surfaceAt(x,z)));g.dispose();
});
