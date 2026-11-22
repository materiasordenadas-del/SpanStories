import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {RegistroCiudad} from '../engine/CityRegistry.js';
import {leerEdicionCiudad} from '../engine/CityProjectDisk.js';
import {crearPreparador} from '../engine/CityProject.js';

test('un GLB importado sin normales recibe normales antes de adaptar materiales y no aparece negro',async()=>{
  const json=new TextEncoder().encode('{"asset":{"version":"2.0"}}'),length=Math.ceil(json.length/4)*4,buffer=new ArrayBuffer(20+length),view=new DataView(buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,buffer.byteLength,true);view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);
  new Uint8Array(buffer,20).fill(32);new Uint8Array(buffer,20,json.length).set(json);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const scene=new T.Group();scene.add(new T.Mesh(geometry,new T.MeshStandardMaterial()));let adapted=false;
  const prepare=crearPreparador({objetos:new RegistroCiudad(),loader:{parseAsync:async()=>({scene,animations:[]})},adaptar:async()=>{assert.ok(geometry.getAttribute('normal'));adapted=true;}});
  await prepare(new Blob([buffer]),'triangle.glb','import-triangle');assert.equal(adapted,true);assert.equal(geometry.getAttribute('normal').getZ(0),1);
});

test('reproducción sin Editor restaura ocultación, movimiento y objetos de sectores tardíos',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const item=id=>({id,etiqueta:id,position:[8,2,3],rotation:[0,.3,0],scale:[2,1,1],hidden:true});
  globalThis.fetch=async()=>({ok:true,json:async()=>({revision:'a'.repeat(64),project:{version:1,cityId:'city',overrides:[item('one'),item('late')],imports:[]}})});
  const scene=new T.Scene(),objetos=new RegistroCiudad(),root=new T.Group();scene.add(root);objetos.registrar(root,{id:'one',etiqueta:'Uno'});
  const reader=await leerEdicionCiudad({scene,objetos,cityId:'city'},'a'.repeat(64));
  assert.deepEqual(root.position.toArray(),[8,2,3]);assert.equal(root.visible,false);assert.equal(reader.state.pending.size,1);
  const late=new T.Group();scene.add(late);objetos.registrar(late,{id:'late',etiqueta:'Tardío'});reader.refresh();
  assert.deepEqual(late.position.toArray(),[8,2,3]);assert.equal(late.visible,false);assert.equal(reader.state.pending.size,0);
  assert.equal(reader.dirty(),false);
  let fetched=false;globalThis.fetch=()=>{fetched=true;throw Error('No debería consultar disco');};
  await leerEdicionCiudad({scene:new T.Scene(),objetos:new RegistroCiudad(),cityId:'city'},'base');assert.equal(fetched,false);
});
