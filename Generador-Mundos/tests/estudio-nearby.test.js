import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {InstanceSet} from '../src/estudio/arq/instances.js';
import {buildingIdFromHit} from '../src/estudio/render/selection.js';
import {Walker} from '../src/estudio/render/walk.js';
import {Terrain} from '../src/estudio/data/terrain.js';
import {disposeScene} from '../src/estudio/render/resources.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {generateSchool} from '../src/estudio/school/school.js';

test('plinths do not cover lower leaves of generated commercial doors or portals, including fallback without near detail',()=>{
  const model=generateSchool('aula-1'),source=JSON.stringify(model.buildings),roadSegments=model.roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width,type:r.type}))),built=buildBuildings(model,{roadSegments});
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),walls=built.meshes.map(m=>new THREE.Mesh(m.geometry,material));
  const focused=new InstanceSet();focused.groups=new Map([...built.instances.groups].filter(([,g])=>['shopfront','door'].includes(g.type)));
  const elements=focused.build(()=>material),ray=new THREE.Raycaster(),matrix=new THREE.Matrix4(),point=new THREE.Vector3(),direction=new THREE.Vector3();let shops=0,doors=0;
  for(const im of elements){if(!['shopfront','door'].includes(im.userData.type))continue;
    const params=im.userData.params,commercial=im.userData.type==='shopfront',door=params.door??Math.min(1.1,params.w*.35),dx=commercial?(params.doorSide??(params.w/2-door/2-.25)):params.w*.25;
    for(let i=0;i<im.count;i++){
      im.getMatrixAt(i,matrix);point.set(dx,.2,.4).applyMatrix4(matrix);direction.set(0,0,-1).transformDirection(matrix);ray.set(point,direction);
      if(commercial){ray.far=.25;assert.equal(ray.intersectObjects(walls,false).length,0,'Un muro tapa el hueco comercial');ray.far=Infinity;shops++;continue;}const hit=ray.intersectObjects([...walls,im],false)[0];assert.ok(hit,'Puerta sin superficie inferior');assert.ok(hit.object===im,'Un zócalo del edificio tapa la parte inferior: '+im.userData.type+' '+i+' edificio '+im.userData.buildings[i]);assert.equal(hit.instanceId,i);
      if(commercial)shops++;else doors++;
    }
  }
  assert.ok(shops>20&&doors>20);assert.equal(JSON.stringify(model.buildings),source);const root=new THREE.Group();root.add(...walls,...elements);disposeScene(root);
});

test('on sloping ground, every commercial door and portal stands on its local sidewalk instead of the highest building corner',()=>{
  const terrain={height:(x,z)=>x*.055+z*.04},rings=[[[0,0],[24,0],[24,18],[0,18]]];
  const b={id:'slope',rings,area:432,height:14,levels:4,minHeight:0,use:'commercial',groundCommercial:true,roof:{shape:'flat',shapeSource:'osm:roof:shape'},shops:[],tags:{building:'retail'}};
  const model={seed:'support',size:{width:100,depth:100},bounds:{centerLat:40.4,centerLon:-3.7},terrain,buildings:[b]},before=JSON.stringify(b);
  const roadSegments=[{a:[-5,-5],b:[30,-5],width:5},{a:[30,-5],b:[30,25],width:5},{a:[30,25],b:[-5,25],width:5},{a:[-5,25],b:[-5,-5],width:5}];
  const built=buildBuildings(model,{roadSegments}),focused=new InstanceSet();focused.groups=new Map([...built.instances.groups].filter(([,g])=>['door','shopfront'].includes(g.type)));
  const elements=focused.build(()=>new THREE.MeshBasicMaterial()),matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion();let count=0;
  for(const im of elements)for(let i=0;i<im.count;i++){
    im.getMatrixAt(i,matrix);matrix.decompose(pos,q,scale);const yaw=new THREE.Euler().setFromQuaternion(q,'YXZ').y,params=im.userData.params,shop=im.userData.type==='shopfront';
    const door=params.door??Math.min(1.1,params.w*.35),lateral=shop?(params.doorSide??(params.w/2-door/2-.25))*scale.x:0;
    const x=pos.x+Math.cos(yaw)*lateral+Math.sin(yaw)*.25,z=pos.z-Math.sin(yaw)*lateral+Math.cos(yaw)*.25;
    assert.ok(Math.abs(pos.y-(terrain.height(x,z)+.15))<1e-5,'Acceso elevado respecto al suelo local');count++;
  }
  assert.ok(count>8);assert.ok(built.prepared[0].base>2);assert.equal(built.prepared[0].top,built.prepared[0].base+14);assert.equal(JSON.stringify(b),before);
  const group=new THREE.Group();group.add(...elements,...built.meshes.map(m=>new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial())));disposeScene(group);
});

test('the separate generic church generator also supports its portal on the local sidewalk',()=>{
  const terrain={height:(x,z)=>x*.04+z*.03},b={id:'church-slope',rings:[[[0,0],[24,0],[24,18],[0,18]]],area:432,height:14,levels:4,minHeight:0,use:'religious',roof:{shape:'hipped',shapeSource:'estimado:uso'},shops:[],tags:{building:'church'}};
  const built=buildBuildings({seed:'church-support',size:{width:100,depth:100},bounds:{centerLat:40,centerLon:-3},terrain,buildings:[b]}),group=[...built.instances.groups.values()].find(g=>g.type==='door');assert.ok(group);
  const matrix=new THREE.Matrix4().fromArray(group.matrices),p=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion();matrix.decompose(p,q,scale);const yaw=new THREE.Euler().setFromQuaternion(q,'YXZ').y;
  assert.ok(Math.abs(p.y-(terrain.height(p.x+Math.sin(yaw)*.25,p.z+Math.cos(yaw)*.25)+.15))<1e-6);
  for(const m of built.meshes)m.geometry.dispose();
});

const events=new Map();
function makeWalker(){
  globalThis.addEventListener=(name,fn)=>events.set(name,fn);
  globalThis.document={hidden:false,pointerLockElement:null,addEventListener(){},exitPointerLock(){}};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.5,1000);camera.position.set(0,5,20);camera.lookAt(0,0,0);
  const viewer={scene,camera,sunDir:{value:new THREE.Vector3(0,1,0)},renderer:{domElement:{addEventListener(){}}},controls:{target:new THREE.Vector3(),enabled:true,update(){}},lens:28,setLens(value){this.lens=value;camera.updateProjectionMatrix();}};
  const w=new Walker(viewer);w.setWorld({model:{size:{width:100,depth:100},terrain:Terrain.flat(100,100)},buildings:[],lines:[],trees:[]});return w;
}

test('walking is normalized and identical in first/third person; stop and blur reset input and jump',()=>{
  const w=makeWalker();w.start(new THREE.Vector3(),0);w.keys.add('KeyW');const first=w.pos.clone();for(let i=0;i<20;i++)w.update(.05);const straight=w.pos.distanceTo(first);
  w.stop();w.start(new THREE.Vector3(),0);w.keys.add('KeyW');w.keys.add('KeyD');for(let i=0;i<20;i++)w.update(.05);assert.ok(Math.abs(w.pos.length()-Math.hypot(straight,.15))<.001);
  const diagonal=w.pos.clone();w.stop();w.setThird(true);w.start(new THREE.Vector3(),0);w.keys.add('KeyW');w.keys.add('KeyD');for(let i=0;i<20;i++)w.update(.05);assert.ok(w.pos.distanceTo(diagonal)<1e-6);
  w.onKey({type:'keydown',code:'KeyV',repeat:false,preventDefault(){}});assert.equal(w.third,false);
  w.onKey({type:'keydown',code:'KeyV',repeat:true,preventDefault(){}});assert.equal(w.third,false);
  events.get('blur')();assert.equal(w.keys.size,0);w.vy=3;w.stop();w.start(new THREE.Vector3(),0);assert.equal(w.vy,0);assert.equal(w.keys.size,0);w.stop();disposeScene(w.avatar);
});

test('walking starts outside solid buildings, blocks thin walls at grid edges and shortens third-person camera',()=>{
  const w=makeWalker(),b={b:{minHeight:0},rings:[[[0,0],[10,0],[10,10],[0,10]]],base:0,top:12};
  w.setWorld({...w.world,buildings:[b]});w.start(new THREE.Vector3(5,0,5),0);assert.ok(w.pos.x<0||w.pos.x>10||w.pos.z<0||w.pos.z>10);w.stop();
  w.setWorld({...w.world,buildings:[],lines:[{points:[[20,-5],[20,5]]}]});w.start(new THREE.Vector3(19,0,0),Math.PI/-2);w.keys.add('KeyW');w.keys.add('ShiftLeft');for(let i=0;i<30;i++)w.update(.05);assert.ok(w.pos.x<=19.65001);
  assert.ok(w.cameraDistance(new THREE.Vector3(19,1.6,0),new THREE.Vector3(1,0,0),3.6)<1);
  w.keys.clear();w.pos.set(49.6,.15,0);w.keys.add('KeyW');w.update(.05);assert.ok(w.pos.x<=49.65);w.stop();disposeScene(w.avatar);
});
