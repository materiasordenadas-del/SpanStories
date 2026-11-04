import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {NodeIO,Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {compressGlb} from '../server/meshopt.js';
import {EstudioAssetLibrary,assetRecord} from '../src/estudio/render/asset-library.js';
import {AtlasPackage,entityFromHit} from '../src/estudio/export/package-loader.js';
import {EntityTable,splitStatic,exportParts} from '../src/estudio/export/spanstories.js';
import {modelForExport} from '../src/estudio/export/model-node.js';
import {MeshBuilder,SURF} from '../src/estudio/geom/mesh.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

test('Meshopt preserves numeric attributes exactly and decodes through the actual Three loader',async()=>{
  const doc=new Document(),buffer=doc.createBuffer(),mb=new MeshBuilder();for(let i=0;i<50;i++)mb.setId(i+1).box(i*3,1,0,1,1,1,0,new THREE.Color('#abcdef'),SURF.wall);
  const primitive=doc.createPrimitive();for(const [name,array,type]of [['POSITION',mb.p,'VEC3'],['NORMAL',mb.n,'VEC3'],['COLOR_0',mb.c,'VEC3'],['_ENTITY_ID',mb.id,'SCALAR']])primitive.setAttribute(name,doc.createAccessor(name).setType(type).setArray(new Float32Array(array)).setBuffer(buffer));doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  const input=await new NodeIO().writeBinary(doc),result=await compressGlb(input);assert.equal(result.compression,'meshopt-lossless');assert.ok(result.bytes.length<input.length);
  const small=fs.readFileSync(new URL('../examples/torre-atlas.glb',import.meta.url));assert.ok((await compressGlb(small)).bytes.length<=small.length);
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),a=await io.readBinary(input),b=await io.readBinary(result.bytes),arrays=d=>d.getRoot().listAccessors().map(a=>JSON.stringify([...a.getArray()])).sort();assert.deepEqual(arrays(b),arrays(a));
  const previous=globalThis.ProgressEvent;if(!previous)globalThis.ProgressEvent=class{constructor(t,p){this.type=t;Object.assign(this,p);}};const library=new EstudioAssetLibrary();
  try{const record=await assetRecord('data:model/gltf-binary;base64,'+Buffer.from(result.bytes).toString('base64'),'Comprimido');await library.add(record);assert.equal(library.models.size,1);let mesh;library.models.get(record.id).scene.traverse(o=>{if(o.isMesh)mesh=o;});assert.equal(entityFromHit({object:mesh,face:{a:0}},{1:'primer-edificio'}),'primer-edificio');}finally{library.dispose();if(previous)globalThis.ProgressEvent=previous;else delete globalThis.ProgressEvent;}
});
test('merged structures and instances resolve persistent owner IDs, including parent transforms',()=>{
  const model={buildings:[{id:'a'},{id:'b'}],roads:[]},table=new EntityTable(model.buildings),mb=new MeshBuilder();mb.setId(2);mb.quad([0,0,0],[1,0,0],[1,1,0],[0,1,0],new THREE.Color('#abc'),SURF.wall);const out=new Map();splitStatic(mb.build(),new THREE.Matrix4(),out,{model,table});const data=[...out.values()][0].statics.get('arquitectura');assert.ok(data.e.every(n=>table.entities[n]==='b'));
  const g=new THREE.BufferGeometry();g.setAttribute('_entity_id',new THREE.Float32BufferAttribute(data.e,1));const mesh=new THREE.Mesh(g);assert.equal(entityFromHit({object:mesh,face:{a:0}},table.entities),'b');mesh.userData.instanceEntityIds=[1,2];assert.equal(entityFromHit({object:mesh,instanceId:1},table.entities),'b');
  const root=new THREE.Group(),parent=new THREE.Group(),native=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());native._ssOriginalMaterial=new THREE.MeshStandardMaterial();root.add(native);parent.position.set(300,0,200);parent.add(root);const exported=modelForExport(root);assert.equal(new THREE.Box3().setFromObject(exported).getCenter(new THREE.Vector3()).x,300);
});
test('receiver rejects corrupt files and incomplete packages before loading scene content',async()=>{
  const body=new Uint8Array([1,2,3]).buffer,manifest={format:'atlas-estudio-paquete',version:2,complete:true,sectors:'sectores.json',entities:'entidades.json',files:[{path:'S.glb',bytes:3,sha256:'bad'}]},fetcher=async url=>({ok:true,json:async()=>url.endsWith('manifest.json')?manifest:url.endsWith('sectores.json')?{sectores:[{id:'S',archivo:'S.glb'}]}:{entities:{1:'a'}},arrayBuffer:async()=>body});const p=await new AtlasPackage({fetcher}).open('http://localhost/test/manifest.json');await assert.rejects(p.load('S'),/Integridad/);assert.equal(p.group.children.length,0);manifest.complete=false;await assert.rejects(new AtlasPackage({fetcher}).open('http://localhost/test/manifest.json'),/incompleto/);
});
test('indexed textured resources retain triangle topology and UVs when packaged',()=>{
  const indexed=new THREE.BoxGeometry(),parts=exportParts(indexed,true);assert.equal(parts.length,1);const g=parts[0].geometry;assert.equal(g.attributes.position.count,indexed.index.count);assert.equal(g.attributes.uv.count,g.attributes.position.count);for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
});
test('actual GLTFExporter writes canonical custom attributes readable after compression',async()=>{
  const old=globalThis.FileReader;globalThis.FileReader=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.();}};
  try{const g=new THREE.BoxGeometry().toNonIndexed(),n=g.attributes.position.count;g.setAttribute('entity_id',new THREE.Float32BufferAttribute(new Float32Array(n).fill(42),1));const scene=new THREE.Scene();scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial()));const binary=await new GLTFExporter().parseAsync(scene,{binary:true}),compressed=await compressGlb(new Uint8Array(binary));await MeshoptDecoder.ready;const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).readBinary(compressed.bytes),a=doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('_ENTITY_ID');assert.ok(a);assert.ok([...a.getArray()].every(v=>v===42));}finally{if(old)globalThis.FileReader=old;else delete globalThis.FileReader;}
});
