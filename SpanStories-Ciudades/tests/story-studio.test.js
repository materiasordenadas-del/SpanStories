import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {createStoryStudioBridge,validStudioStage} from '../engine/StoryStudioBridge.js';

const stage=()=>({sceneId:'scene',sequenceId:'sequence',zoneId:'zone',time:0,shot:{position:[1,2,3],target:[1,2,10],fov:42,transition:0},actors:[],performances:[],entryIds:['tree']});
test('studio messages reject wrong zones and invalid transforms',()=>{
  assert.equal(validStudioStage(stage(),'zone'),true);
  assert.equal(validStudioStage(stage(),'other'),false);
  assert.equal(validStudioStage({...stage(),shot:{...stage().shot,position:[NaN,0,0]}},'zone'),false);
  assert.equal(validStudioStage({...stage(),performances:[{actorId:'missing',action:'walk'}]},'zone'),false);
});
test('student looks without moving camera; origin/source and object events stay scoped',async()=>{
  const listeners=new Map(),canvasListeners=new Map(),messages=[],enabled=[];
  const parent={postMessage:m=>messages.push(m)};
  const win={parent,location:{ancestorOrigins:['http://localhost:3000']},document:{referrer:''},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setInterval:()=>1,clearInterval:()=>{}};
  const canvas={addEventListener:(n,f)=>canvasListeners.set(n,f),removeEventListener:n=>canvasListeners.delete(n),setPointerCapture(){}};
  const camera=new T.PerspectiveCamera(42,1,.1,100),target=new T.Vector3();
  const bridge=await createStoryStudioBridge({scene:new T.Scene(),camera,target,renderer:{domElement:canvas},assets:{records:new Map()},style:{},zone:{id:'zone',manifestUrl:'http://localhost/zone.json'},manifest:{sectors:[]},world:{world:{manifestUrl:'http://localhost/Mundo/mundo.json'}},ground:()=>0,loadNearby:async()=>[],navigation:{setEditorEnabled:v=>enabled.push(v)},lexico:{mapa:{entries:[]},interaccion:{cerrar(){},habilitar(){}}},pinned:new Set(),win,fetcher:async()=>({ok:true,url:'http://localhost/Mundo/Personajes/personajes.json',json:async()=>({characters:[]})})});
  const receive=listeners.get('message');
  await receive({origin:'http://evil.invalid',source:parent,data:{channel:'spanstories.studio',version:1,type:'STAGE',stage:stage(),student:true}});
  assert.deepEqual(camera.position.toArray(),[0,0,0]);
  await receive({origin:'http://localhost:3000',source:parent,data:{channel:'spanstories.studio',version:1,type:'STAGE',stage:stage(),student:true}});
  const position=camera.position.toArray(),quaternion=camera.quaternion.toArray();
  canvasListeners.get('pointerdown')({clientX:20,clientY:20,pointerId:1});canvasListeners.get('pointermove')({clientX:100,clientY:60,pointerId:1});canvasListeners.get('pointerup')({});
  assert.deepEqual(camera.position.toArray(),position);assert.notDeepEqual(camera.quaternion.toArray(),quaternion);
  assert.equal(enabled.at(-1),false);
  bridge.setLexicalEvent({tipo:'abierta',entryId:'tree'});assert.equal(messages.at(-1).type,'OBJECT_TOUCHED');
  assert(messages.some(m=>m.type==='STAGE_READY'));
  bridge.destroy();assert.equal(listeners.size,0);assert.equal(canvasListeners.size,0);
});
test('direction picks objects and points, lists studio zones and lights scenes without the shared pool',async()=>{
  const listeners=new Map(),canvasListeners=new Map(),messages=[],ambients=[];
  const parent={postMessage:m=>messages.push(m)};
  const win={parent,location:{ancestorOrigins:['http://localhost:3000']},document:{referrer:''},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setInterval:()=>1,clearInterval:()=>{}};
  const canvas={addEventListener:(n,f)=>canvasListeners.set(n,f),removeEventListener:n=>canvasListeners.delete(n),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
  const zones=[{id:'zone',label:'Paseo',cityLabel:'Barcelona',countryLabel:'España'},{id:'atlas-1',label:'Atlas',cityLabel:'Lugares',countryLabel:'Generador',atlas:true}];
  const bridge=await createStoryStudioBridge({scene:new T.Scene(),camera:new T.PerspectiveCamera(42,1,.1,100),target:new T.Vector3(),renderer:{domElement:canvas},assets:{records:new Map()},style:{},estilos:{ambienteEscena:id=>ambients.push(id)},zone:{id:'zone',manifestUrl:'http://localhost/zone.json'},manifest:{sectors:[]},world:{zones,world:{manifestUrl:'http://localhost/Mundo/mundo.json'}},ground:()=>0,loadNearby:async()=>[],navigation:{setEditorEnabled(){}},
    lexico:{mapa:{entries:[]},interaccion:{cerrar(){},habilitar(){},identificar:()=>({id:'arbol',speech:{text:'el árbol'}})}},pinned:new Set(),win,fetcher:async()=>({ok:true,url:'http://localhost/Mundo/Personajes/personajes.json',json:async()=>({characters:[]})})});
  const ready=messages.find(m=>m.type==='READY');
  assert.deepEqual(ready.zones.map(z=>z.id),['zone']);assert(ready.ambients.includes('noche'));
  const receive=listeners.get('message'),host=data=>receive({origin:'http://localhost:3000',source:parent,data:{channel:'spanstories.studio',version:1,...data}});
  await host({type:'STAGE',stage:{...stage(),ambient:'noche'},student:false});
  assert.equal(ambients.at(-1),'noche');
  assert.equal(validStudioStage({...stage(),ambient:'sepia'},'zone'),false);
  await host({type:'PICK',requestId:'r1',mode:'entry'});
  // A drag orbits the camera and never picks.
  canvasListeners.get('pointerdown')({clientX:10,clientY:10});canvasListeners.get('pointerup')({clientX:60,clientY:60});
  assert(!messages.some(m=>m.type==='PICKED'));
  canvasListeners.get('pointerdown')({clientX:50,clientY:50});canvasListeners.get('pointerup')({clientX:51,clientY:50});
  assert.deepEqual({...messages.at(-1),channel:undefined,version:undefined},{channel:undefined,version:undefined,type:'PICKED',requestId:'r1',entryId:'arbol',label:'el árbol'});
  await host({type:'PICK',requestId:'r2',mode:'point'});await host({type:'PICK_CANCEL'});
  assert.equal(messages.at(-1).cancelled,true);
  bridge.destroy();assert.equal(ambients.at(-1),null);
});
