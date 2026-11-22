import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as THREE from 'three';

// Ejecuta el método real del visor sin arrancar la aplicación ni su DOM.
const source=readFileSync(new URL('../src/ui/viewport.js',import.meta.url),'utf8');
const method=source.slice(source.indexOf('  async pick('),source.indexOf('  attachGizmo('));
const Viewport=runInNewContext(`class Viewport { ${method} }\nViewport`,{THREE});
function setup(pickActor=async()=>true){
  const selected=[],vp=Object.create(Viewport.prototype);
  Object.assign(vp,{
    renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})}},
    pointer:new THREE.Vector2(),raycaster:new THREE.Raycaster(),camera:new THREE.PerspectiveCamera(),
    charHolder:new THREE.Group(),app:{sceneLive:{on:true,pickActor},select:value=>selected.push(value)},
  });
  return {vp,selected};
}
const click={clientX:50,clientY:50,button:0};
test('al pulsar otro actor no se seleccionan ni deseleccionan huesos del anterior',async()=>{
  let queries=0;
  const {vp,selected}=setup(async()=>{queries++;return true;});
  await vp.pick(click);
  assert.equal(queries,1);assert.equal(selected.length,0);
});
test('los controles del rig conservan prioridad y los modificadores no cambian de personaje',async()=>{
  let queries=0;
  const {vp,selected}=setup(async()=>{queries++;return false;});
  const handle=new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshBasicMaterial());
  handle.position.z=-2;handle.userData={kind:'bone',bone:{name:'head'}};handle.updateMatrixWorld();vp.handleList=[handle];
  await vp.pick(click);
  assert.equal(queries,0);assert.equal(selected[0].bone,handle.userData.bone);
  vp.handleList=[];
  for(const event of [{shiftKey:true},{altKey:true},{ctrlKey:true},{metaKey:true},{button:2}])await vp.pick({...click,...event});
  assert.equal(queries,0);
});
test('un clic vacío conserva la deselección y una respuesta antigua no pisa el clic posterior',async()=>{
  const {vp,selected}=setup(async()=>false);
  await vp.pick(click);assert.equal(selected[0],null);
  selected.length=0;
  let resolve;
  vp.app.sceneLive.pickActor=()=>new Promise(r=>{resolve=r;});
  const first=vp.pick(click);
  vp.app.sceneLive.pickActor=async()=>true;
  await vp.pick(click);
  resolve(false);await first;
  assert.equal(selected.length,0);
});

const liveSource=readFileSync(new URL('../src/ui/scenelive.js',import.meta.url),'utf8');
const liveMethod=liveSource.slice(liveSource.indexOf('  L.pickActor ='),liveSource.indexOf('  L.selectPairRig ='));
function scenePicker(actorId,pair=null){
  const posts=[],rigs=[],requests=[];
  const L={on:true,X:new THREE.Matrix4().makeTranslation(10,0,0),pair};
  runInNewContext(liveMethod,{
    L,app:{animales:{pedirRig:async role=>rigs.push(role)}},
    link:()=>({context:()=>({actorId:'original'}),post:(type,data)=>posts.push({type,...data})}),
    ask:async(op,data)=>{requests.push({op,...data});return {actorId};},
  });
  return {L,posts,rigs,requests};
}
test('el rayo pasa al espacio de la escena y solo otro actor pide el cambio al Estudio',async()=>{
  const ray=new THREE.Ray(new THREE.Vector3(1,2,3),new THREE.Vector3(0,0,-1));
  const {L,posts,requests}=scenePicker('otro');
  assert.equal(await L.pickActor(ray),true);
  assert.equal(requests[0].actorPick,true);assert.equal(requests[0].origin.join(','),'11,2,3');
  assert.equal(posts[0].actorId,'otro');assert.equal(posts[0].op,'selectActor');
  const current=scenePicker('original');
  assert.equal(await current.L.pickActor(ray),false);assert.equal(current.posts.length,0);
  const stale=scenePicker('otro');
  assert.equal(await stale.L.pickActor(ray,()=>false),false);assert.equal(stale.posts.length,0);
});
test('jinete y caballo alternan el rig de la pareja sin recargar ni mezclar sus documentos',async()=>{
  const horse={id:'horse'},rider={id:'rider'},pair={horse,rider,slots:[horse,rider],active:rider};
  const {L,posts,rigs}=scenePicker('horse',pair);
  assert.equal(await L.pickActor(new THREE.Ray()),true);
  assert.equal(rigs.join(','),'caballo');assert.equal(posts.length,0);
});
