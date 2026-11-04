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
