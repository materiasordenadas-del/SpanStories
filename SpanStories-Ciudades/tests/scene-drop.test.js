import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {montarImportacionArrastre,puntoDeSuelta} from '../engine/SceneDrop.js';

test('arrastrar GLB sigue el modo activo: objeto en Editor y personaje en Estudio, nunca ambos',async()=>{
  const listeners=new Map(),calls=[],messages=[];
  const host={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  let mode='editor';const dispose=montarImportacionArrastre({host,mode:()=>mode,importObjects:async files=>calls.push(['object',files]),importCharacters:async files=>calls.push(['character',files]),status:m=>messages.push(m)});
  const file={name:'modelo.GLB'},event={dataTransfer:{types:['Files'],files:[file]},preventDefault(){this.prevented=true;},stopPropagation(){}};
  await listeners.get('drop')(event);assert.equal(event.prevented,true);assert.equal(calls.at(-1)[0],'object');
  mode='studio';await listeners.get('drop')(event);assert.equal(calls.at(-1)[0],'character');assert.equal(calls.length,2);
  mode=null;await listeners.get('drop')(event);assert.equal(calls.length,2);assert.match(messages.at(-1),/Espera/);
  mode='editor';event.dataTransfer.files=[{name:'otro.fbx'}];await listeners.get('drop')(event);assert.equal(calls.length,2);assert.match(messages.at(-1),/\.glb/);
  dispose();assert.equal(listeners.size,0);
});
test('la colocación usa el punto soltado, ignora ocultos y personajes, y calcula el suelo',()=>{
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,100);camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshBasicMaterial({side:T.DoubleSide}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const hidden=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshBasicMaterial());hidden.position.y=5;hidden.visible=false;scene.add(hidden);
  const canvas={getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},target=new T.Vector3(9,0,9);
  const point=puntoDeSuelta({scene,camera,canvas,ground:()=>2,target},{clientX:50,clientY:50});
  assert.ok(Math.abs(point[0])<1e-6);assert.equal(point[1],2);assert.ok(Math.abs(point[2])<1e-6);
});
