import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {RegistroCiudad} from '../engine/CityRegistry.js';
import {crearResolutorLexico} from '../engine/LexicoMapa.js';
import {crearResaltador,materialMascara} from '../engine/LexicoResaltado.js';
import {validarEscena} from '../engine/NarrativaVisor.js';
import {crearNavegacionCiudad} from '../engine/CityNavigation.js';
import {scheduleCityTask,createCityTaskQueue} from '../engine/CityWorkQueue.js';

test('las instancias y batches conservan ID y vínculo léxico por objeto',()=>{
  const registry=new RegistroCiudad(),root=new T.Group();registry.registrar(root,{id:'stable-tree',tipo:'tree',etiqueta:'Árbol'});
  const batch=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial(),1);batch.userData.instanceIds=['stable-tree'];
  const hit=registry.resolver({object:batch,instanceId:0});assert.equal(hit.id,'stable-tree');
  const multi=new T.BatchedMesh(1,8,12,batch.material);multi.userData.instanceIds=['stable-tree'];assert.equal(registry.resolver({object:multi,batchId:0}).id,'stable-tree');multi.dispose();
  const entry={id:'arbol',selectors:[{registryKind:'tree'}]};const resolver=crearResolutorLexico({entries:[entry]});
  assert.equal(resolver.entradaPara(hit,new Set()),null);assert.equal(resolver.entradaPara(hit,new Set(['arbol'])),entry);
  batch.geometry.dispose();batch.material.dispose();
});
test('resaltado no añade cajas ni altera la escena o material compartido; conserva alfa',()=>{
  const geometry=new T.PlaneGeometry(),source=new T.ShaderMaterial({uniforms:{uCorte:{value:.5}},vertexShader:'void main(){gl_Position=vec4(position,1.0);}',fragmentShader:'void main(){if(gl_FragCoord.x<1.0)discard;gl_FragColor=vec4(1.0);}'});
  const original=source.fragmentShader,mask=materialMascara(source);assert.equal(source.fragmentShader,original);assert.equal(mask.uniforms,source.uniforms);assert.ok(mask.fragmentShader.includes('discard'));assert.ok(mask.fragmentShader.includes('lexicalOriginalMain'));
  const scene=new T.Scene(),mesh=new T.Mesh(geometry,source);scene.add(mesh);const h=crearResaltador({});
  assert.equal(h.mostrar([mesh]),true);assert.equal(scene.children.length,1);h.ocultar();assert.equal(h.visible,false);h.destruir();assert.equal(mesh.material,source);
  mask.dispose();source.dispose();geometry.dispose();
});
test('cámaras narrativas rechazan otra zona, entradas desconocidas y valores no finitos',()=>{
  const s={id:'a',zoneId:'barcelona',entryIds:['arbol'],camera:{position:[1,2,3],target:[0,0,0]}};
  assert.ok(validarEscena(s,'barcelona',['arbol']));assert.equal(validarEscena(s,'otra',['arbol']),false);
  assert.equal(validarEscena({...s,entryIds:['no-existe']},'barcelona',['arbol']),false);
  assert.equal(validarEscena({...s,camera:{...s.camera,position:[Infinity,2,3]}},'barcelona',['arbol']),false);
});
test('tocar una casa no resalta las otras casas que comparten SenseId',()=>{
  const a={id:'a',raiz:new T.Group()},b={id:'b',raiz:new T.Group()};
  const entry={id:'casa',highlight:'collection',selectors:[{collection:'casa-a'},{collection:'casa-b'}]};
  const resolver=crearResolutorLexico({entries:[entry]},{objetosManifest:[{id:'a',collections:['casa-a']},{id:'b',collections:['casa-b']}]});
  assert.deepEqual(resolver.raicesParaResaltar(entry,a,[a,b]),[a.raiz]);
});
test('el contorno admite la representación LOD visible sin copiar geometría compartida',()=>{
  const geometry=new T.PlaneGeometry(),material=new T.MeshBasicMaterial({alphaTest:.5});
  const root=new T.Group();root.userData.instanceBinding={bounds:()=>new T.Box3(new T.Vector3(),new T.Vector3(1,1,1)),parts:()=>[{geometry,material,matrix:new T.Matrix4()}]};
  const highlight=crearResaltador({});assert.ok(highlight.mostrar([root]));highlight.destruir();assert.equal(geometry.getAttribute('position').count,4);geometry.dispose();material.dispose();
});
test('la exploración permite primera persona y bloquea volver al editor con Esc',()=>{
  const events=new EventTarget(),canvas=new EventTarget(),doc={activeElement:null,addEventListener(){},removeEventListener(){}};
  canvas.style={};
  const nav=crearNavegacionCiudad({camera:new T.PerspectiveCamera(),canvas,eventRoot:events,documentRoot:doc,pointerLock:false});
  nav.setMode('first');nav.setEditorEnabled(false);nav.setMode('editor');assert.equal(nav.mode,'first');
  const e=new Event('keydown');Object.assign(e,{code:'KeyW'});events.dispatchEvent(e);nav.update(.1);assert.ok(nav.position.z<0);nav.dispose();
});
test('la preparación no queda detenida si un iframe suspende su callback de frame',async()=>{
  const previous={window:globalThis.window,document:globalThis.document,raf:globalThis.requestAnimationFrame};
  let frame,calls=0;
  try{
    globalThis.window={};globalThis.document={hidden:false};globalThis.requestAnimationFrame=callback=>{frame=callback;};
    await new Promise(resolve=>scheduleCityTask(()=>{calls++;resolve();}));
    frame();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,1);
  }finally{
    for(const [name,value]of [['window',previous.window],['document',previous.document],['requestAnimationFrame',previous.raf]]){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}
  }
});
test('el parser avanza entre tandas sin esperar fotogramas del renderizador',async()=>{
  const previous=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>{throw new Error('El parser no debe esperar un frame');};
  try{const queue=createCityTaskQueue({maxJobs:2});const results=await Promise.all(Array.from({length:20},(_,i)=>queue(()=>i)));assert.deepEqual(results,Array.from({length:20},(_,i)=>i));}
  finally{if(previous===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previous;}
});
