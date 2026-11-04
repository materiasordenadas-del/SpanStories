import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {withProfiles,validateProfile} from '../src/estudio/data/profiles.js';
import {facadeStyle} from '../src/estudio/arq/facade-profile.js';
import {STYLES} from '../src/estudio/arq/styles.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {generateSchool,SCHOOL_DEFAULTS} from '../src/estudio/school/school.js';
import {EstudioAssetLibrary,inspectGlb,assetRecord} from '../src/estudio/render/asset-library.js';
import {Terrain} from '../src/estudio/data/terrain.js';
import {buildingIdFromHit} from '../src/estudio/render/selection.js';
import {modelForExport} from '../src/estudio/export/model-node.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';

const demo=fs.readFileSync(new URL('../examples/torre-atlas.glb',import.meta.url));
const demoUrl='data:model/gltf-binary;base64,'+demo.toString('base64');
function glb(json){const text=Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length/4)*4,' ')),b=Buffer.alloc(20+text.length);b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(text.length,12);b.write('JSON',16);text.copy(b,20);return 'data:model/gltf-binary;base64,'+b.toString('base64');}

test('facade profiles affect only the selected building and never mutate shared styles or roofs',()=>{
  const model=generateSchool('perfil',{barrio:false}),id=model.buildings[0].id,before=JSON.stringify(STYLES),profile={facade:{bayWidth:8,windowWidth:1.2,windowHeight:1.7,doorWidth:1.4,doorHeight:2.8,balconyProbability:0},reference:'Referencia de prueba'};
  const modified=withProfiles(model,{[id]:profile});
  assert.equal(JSON.stringify(STYLES),before);assert.equal(modified.buildings[1],model.buildings[1]);assert.deepEqual(modified.buildings[0].rings,model.buildings[0].rings);assert.equal(modified.buildings[0].roof,model.buildings[0].roof);
  const a=buildBuildings(model),b=buildBuildings(modified);
  const n=result=>[...result.instances.groups.values()].filter(g=>g.type==='window').reduce((sum,g)=>sum+g.buildings.filter(i=>i===0).length,0);
  assert.ok(n(b)<n(a));assert.equal(JSON.stringify(STYLES),before);
  const styled=facadeStyle(STYLES.escuela,profile.facade);assert.deepEqual(styled.bay,[8,8]);assert.equal(styled.portal.w,1.4);assert.equal(styled.roof.length,STYLES.escuela.roof.length);
  assert.throws(()=>validateProfile({facade:{bayWidth:2,windowWidth:3}}),/separación/);
});
test('GLB validation rejects external resources and unconfigured compression before loading',()=>{
  assert.equal(inspectGlb(demoUrl).bytes.length,demo.length);
  assert.throws(()=>inspectGlb(glb({asset:{version:'2.0'},buffers:[{uri:'https://example.invalid/model.bin'}]})),/externos/);
  assert.throws(()=>inspectGlb(glb({asset:{version:'2.0'},extensionsRequired:['KHR_draco_mesh_compression']})),/decodificador/);
});
test('registered style is opt-in and a pending map selection is not saved as the built place',()=>{
  const model=generateSchool('estilo',{barrio:false}),b=model.buildings[0];b.tags={...b.tags,'building:architecture':'Art Déco'};
  assert.equal(withProfiles(model,{[b.id]:{}}).buildings[0].forceStyle,b.forceStyle);
  assert.equal(withProfiles(model,{[b.id]:{fromSource:true}}).buildings[0].forceStyle,'art_deco');
  const real={...model,kind:'real',label:'Lugar construido',bounds:{...model.bounds,centerLat:40,centerLon:-3},size:{width:300,depth:300}};
  const p=decodeProject(encodeProject({model:real,mode:'real',place:{lat:41,lon:-4,size:600},seed:'s',seeds:{alturas:'a',fachadas:'f',calle:'c',suelo:'s'}}));
  assert.equal(p.place.lat,40);assert.equal(p.place.size,300);
});
test('an assigned static GLB fits uniformly on the ground, remains selectable and exports original materials',async()=>{
  const previous=globalThis.ProgressEvent;if(!previous)globalThis.ProgressEvent=class{constructor(type,values){this.type=type;Object.assign(this,values);}};
  const library=new EstudioAssetLibrary();
  try{const record=await assetRecord(demoUrl,'Torre de prueba');await library.add(record);await library.add(record);assert.equal(library.records.length,1);
    const b={id:'edificio:propio',rings:[[[0,0],[20,0],[20,12],[0,12]]],height:30,minHeight:0,modelYaw:0,modelScale:1};
    const root=library.instantiate(record.id,b,Terrain.flat(100,100)),box=new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(box.min.y)<1e-6);assert.ok(box.max.y<=30.00001);assert.ok(box.min.x>=-.00001&&box.max.x<=20.00001);assert.ok(box.min.z>=-.00001&&box.max.z<=12.00001);
    const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.ok(meshes.length>0);
    assert.equal(buildingIdFromHit({object:meshes[0]},{buildings:[b]}),b.id);
    const exported=modelForExport(root),originalBox=new THREE.Box3().setFromObject(exported);assert.deepEqual(originalBox.min.toArray(),box.min.toArray());assert.deepEqual(originalBox.max.toArray(),box.max.toArray());
    exported.traverse(o=>{if(o.isMesh)assert.ok((Array.isArray(o.material)?o.material:[o.material]).every(m=>!m.isShaderMaterial));});
    const model=generateSchool('modelo',{barrio:false}),state={model,mode:'school',place:{lat:40.43,lon:-3.7,size:300},seed:'s',seeds:{alturas:'a',fachadas:'f',calle:'c',suelo:'s'},school:SCHOOL_DEFAULTS,assets:library.records,profiles:{[model.buildings[0].id]:{modelId:record.id,reference:'Modelo sintético de prueba'}}};
    const p=decodeProject(encodeProject(state));assert.equal(p.assets[0].dataUrl,demoUrl);assert.equal(p.profiles[model.buildings[0].id].modelId,record.id);
    root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});
  }finally{library.dispose();if(previous)globalThis.ProgressEvent=previous;else delete globalThis.ProgressEvent;}
});
