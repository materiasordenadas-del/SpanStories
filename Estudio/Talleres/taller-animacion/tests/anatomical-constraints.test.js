import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { readHorse, readFBX } from '../reports/inspeccionar-caballo.mjs';
import { HorseMotion } from '../src/core/horse-motion.js';
import { Rig } from '../src/core/rig.js';
import { Engine, setKey } from '../src/core/animation.js';
import { horseChains, horseControlPoints, sampleHorseClip, applyHorsePose } from '../src/core/horse-editor.js';
import { anatomicalSystem } from '../src/core/anatomical-constraints.js';
import { makeClip } from '../src/core/clip.js';
import { docToHash, hashToDoc } from '../src/io/url.js';

const asset=new URL('../biblioteca/personajes/Rocinante_web_optimizado.glb',import.meta.url);
async function fixture() {
  const root=await readHorse(asset),rig=new Rig(root);
  const native=Object.fromEntries(rig.bones.map(b=>[b.name,{p:[...b.position.toArray(),...b.position.toArray()],q:[...b.quaternion.toArray(),...b.quaternion.toArray()],s:[...b.scale.toArray(),...b.scale.toArray()]}]));
  const clip=Object.assign(makeClip({id:'horse',name:'reference',fps:30,frames:2,tracks:{}}),{native,animal:{editorVersion:3}});
  const engine=new Engine(rig,new Map([[clip.id,clip]]));
  engine.doc.strips=[{id:'s',clipId:'horse',start:0,len:2,speed:1,loop:false}];
  return {root,rig,clip,engine,system:anatomicalSystem(rig)};
}
const positions=rig=>rig.bones.map(b=>b.getWorldPosition(new T.Vector3()));

test('Rocinante real: codo/rodilla en el extremo proximal twist; stretch es mitad rígida, no articulación',async()=>{
  const {rig}=await fixture();
  for(const [chain,bones] of Object.entries(horseChains(rig))) {
    assert.match(bones[1].name,/^thigh_twist/);
    const p=bones[1].getWorldPosition(new T.Vector3());
    assert.ok(Math.abs(p.y-(chain.startsWith('hand')?.73:.70))<1e-5);
    const helper=rig.byName.get((chain.startsWith('hand')?'upperArm':'upperLeg')+chain.at(-1));
    assert.equal(helper.parent,bones[1]);
    assert.ok(p.distanceTo(helper.getWorldPosition(new T.Vector3()))>.12);
    assert.equal(horseControlPoints(rig).find(p=>p.canon===(chain.startsWith('hand')?'upperArm':'upperLeg')+chain.at(-1)).bone,bones[1]);
  }
});

test('clips v2 conservan sus matrices de mundo y funcionan después de clonar el personaje',async()=>{
  const {root,rig,engine,clip}=await fixture();
  clip.animal.editorVersion=2;
  const graph=root.userData.horseLegacyGraphData;
  for(const r of graph)clip.native[r.name]={p:[...r.p,...r.p],q:[...r.q,...r.q],s:[...r.s,...r.s]};
  const b=rig.byName.get('upperArmL'),r=graph.find(r=>r.name===b.name);
  const q=new T.Quaternion().fromArray(r.q).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.2));
  clip.native[b.name].q.splice(4,4,...q.toArray());
  engine.doc.anatomyMode='libre';
  applyHorsePose(rig,sampleHorseClip(clip,1/30,{hips:new T.Vector3()}));
  const expected=new Map(),byName=new Map(graph.map(r=>[r.name,r]));
  const world=name=>{
    if(expected.has(name))return expected.get(name);
    const r=byName.get(name),p=clip.native[name];
    const parent=byName.has(r.parent)?world(r.parent):rig.byName.get(name).parent.matrixWorld;
    const m=parent.clone().multiply(new T.Matrix4().compose(new T.Vector3().fromArray(p.p,3),new T.Quaternion().fromArray(p.q,4),new T.Vector3().fromArray(p.s,3)));
    expected.set(name,m);return m;
  };
  for(const r of graph)world(r.name);
  for(const b of rig.bones)expected.get(b.name).elements.forEach((v,i)=>assert.ok(Math.abs(v-b.matrixWorld.elements[i])<1e-6,b.name));
  const cloned=new Rig(SkeletonUtils.clone(root));
  applyHorsePose(cloned,sampleHorseClip(clip,1/30,{hips:new T.Vector3()}));
  for(const b of cloned.bones)expected.get(b.name).elements.forEach((v,i)=>assert.ok(Math.abs(v-b.matrixWorld.elements[i])<1e-6,b.name));
});

test('los clips v2 se corrigen al evaluar: no hay bisagra en medio del antebrazo ni de la tibia',async()=>{
  const {root,rig,engine,clip}=await fixture();clip.animal.editorVersion=2;
  for(const r of root.userData.horseLegacyGraphData)clip.native[r.name]={p:[...r.p,...r.p],q:[...r.q,...r.q],s:[...r.s,...r.s]};
  const helper=rig.byName.get('upperArmL'),r=root.userData.horseLegacyGraphData.find(r=>r.name===helper.name);
  const q=new T.Quaternion().fromArray(r.q).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.55));
  clip.native[helper.name].q=[...q.toArray(),...q.toArray()];
  const original=JSON.stringify(clip.native);
  engine.doc.anatomyMode='libre';engine.evaluate(0);
  for(const [chain,bones] of Object.entries(horseChains(rig))) {
    const split=rig.byName.get((chain.startsWith('hand')?'upperArm':'upperLeg')+chain.at(-1));
    const a=bones[1].getWorldPosition(new T.Vector3()),b=bones[2].getWorldPosition(new T.Vector3()),p=split.getWorldPosition(new T.Vector3());
    assert.ok(new T.Line3(a,b).closestPointToPoint(p,true,new T.Vector3()).distanceTo(p)<.001,split.name);
    const qa=bones[1].getWorldQuaternion(new T.Quaternion()),qb=split.getWorldQuaternion(new T.Quaternion());
    const restA=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(rig.horseRestWorld.get(bones[1])));
    const restB=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(rig.horseRestWorld.get(split)));
    assert.ok(qa.multiply(restA.invert()).normalize().angleTo(qb.multiply(restB.invert()).normalize())<1e-6,`${split.name}: halves must share rotation`);
    for(let i=0;i<3;i++) {
      const ref=new T.Vector3().setFromMatrixPosition(rig.horseRestWorld.get(bones[i])).distanceTo(new T.Vector3().setFromMatrixPosition(rig.horseRestWorld.get(bones[i+1])));
      const now=bones[i].getWorldPosition(new T.Vector3()).distanceTo(bones[i+1].getWorldPosition(new T.Vector3()));
      assert.ok(Math.abs(ref-now)<1e-6,'fixed segment length');
    }
  }
  assert.equal(JSON.stringify(clip.native),original,'source tracks remain intact');
});

test('FK e IK comparten bisagra, no permiten torsión de codo ni estirar segmentos',async()=>{
  const {rig,engine,system}=await fixture();engine.evaluate(0);
  const bones=horseChains(rig).handL,b=bones[1],j=system.joints.get(b);
  const cross=new T.Vector3().crossVectors(j.axis,new T.Vector3(0,1,0)).normalize();
  const candidate=b.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(cross,1.3));
  const projected=system.constrain(b,candidate);
  assert.ok(projected.angleTo(b.quaternion)<1e-6);
  assert.ok(system.constrain(b,projected).angleTo(projected)<1e-6,'projection must be idempotent');
  setKey(engine.layer(),`r:${b.name}`,0,new T.Quaternion().setFromAxisAngle(cross,1.3).toArray());
  setKey(engine.layer(),`s:${bones[2].name}`,0,[3,3,3]);
  engine.evaluate(0);
  assert.ok(b.quaternion.angleTo(projected)<1e-6);
  assert.ok(bones[2].scale.distanceTo(system.baseline.get(bones[2]).s)<1e-9);
  engine.doc.ik.handL=true;const initial=positions(rig),lengths=bones.slice(1).map((b,i)=>b.getWorldPosition(new T.Vector3()).distanceTo(bones[i].getWorldPosition(new T.Vector3())));
  engine.keyIK('handL',{pos:bones.at(-1).getWorldPosition(new T.Vector3()).add(new T.Vector3(0,2,2))},0);engine.evaluate(0);
  bones.slice(1).forEach((b,i)=>assert.ok(Math.abs(b.getWorldPosition(new T.Vector3()).distanceTo(bones[i].getWorldPosition(new T.Vector3()))-lengths[i])<1e-6));
  assert.ok(engine.ikState.handL.limited);
  const other=horseChains(rig).footR.at(-1);assert.ok(other.getWorldPosition(new T.Vector3()).distanceTo(initial[rig.index.get(other)])<1e-6);
});

test('modos y evaluación deterministas; FK↔IK conserva los pivotes reales y el modo viaja en URL',async()=>{
  const {rig,engine,system}=await fixture();
  engine.doc.anatomyMode='estilizado';assert.equal(hashToDoc(docToHash(engine.doc,rig),rig).anatomyMode,'estilizado');
  engine.doc.anatomyMode='anatomico';engine.evaluate(0);
  const bones=horseChains(rig).footL;
  engine.doc.ik.footL=true;
  engine.keyIK('footL',{pos:bones.at(-1).getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.025,.02))},0);
  engine.evaluate(0);const before=positions(rig);
  engine.evaluate(1);engine.evaluate(0);positions(rig).forEach((p,i)=>assert.ok(p.distanceTo(before[i])<1e-8));
  engine.switchIK('footL',false,0);engine.evaluate(0);positions(rig).forEach((p,i)=>assert.ok(p.distanceTo(before[i])<.003,rig.bones[i].name));
  engine.switchIK('footL',true,0);engine.evaluate(0);positions(rig).forEach((p,i)=>assert.ok(p.distanceTo(before[i])<.003,rig.bones[i].name));
  system.begin('libre');const b=bones[1],q=b.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),2));
  assert.ok(system.constrain(b,q).angleTo(q)<1e-8);
});

test('la caminata FBX real anima el pivote articular y sus dos mitades rígidas sin separar la piel',async()=>{
  const {rig,root}=await fixture();
  const load=T.TextureLoader.prototype.load;
  const warn=console.warn;console.warn=()=>{};
  T.TextureLoader.prototype.load=function(){return new T.Texture();};
  let source,reference;
  try {
    source=readFBX(new URL('../biblioteca/animales/Caballo/clips/H_Walk.FBX',import.meta.url));
    reference=readFBX(new URL('../biblioteca/animales/Caballo/modelo/Horse Realistic.fbx',import.meta.url));
  } finally {T.TextureLoader.prototype.load=load;console.warn=warn;}
  const motion=new HorseMotion(root,source,reference,source.animations[0]);
  for(const t of [0,.3,.6,.9]) {
    const report=motion.evaluate(t);
    assert.ok(report.legs.every(l=>Number.isFinite(l.soleY)&&l.soleY>-.005));
    for(const [chain,bones] of Object.entries(horseChains(rig))) {
      const helper=rig.byName.get((chain.startsWith('hand')?'upperArm':'upperLeg')+chain.at(-1));
      const a=bones[1].getWorldPosition(new T.Vector3()),b=bones[2].getWorldPosition(new T.Vector3()),p=helper.getWorldPosition(new T.Vector3());
      const distance=new T.Line3(a,b).closestPointToPoint(p,true,new T.Vector3()).distanceTo(p);
      assert.ok(distance<.001,`${helper.name}: split segment separated ${distance}`);
    }
  }
  motion.dispose();
});
