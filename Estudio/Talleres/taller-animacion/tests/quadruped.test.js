import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Rig } from '../src/core/rig.js';
import { isARPHorse, neutralizeHorseFace } from '../src/core/quadruped.js';
import { closeHorseCycle, solveHorseLeg } from '../src/core/horse-motion.js';

function horse() {
  const root=new T.Group();
  for(const name of ['c_thigh_b.l','c_thigh_b_dupli_001.l','hips','upperArmL','upperArmR','upperLegL','upperLegR']) {
    const b=new T.Bone();b.name=name;root.add(b);
  }
  return root;
}
test('AutoRig Pro de caballo conserva reposo y rechaza el mapeo humanoide guardado',()=>{
  const root=horse(),before=new Map(root.children.map(o=>[o,o.position.toArray()]));
  const rig=new Rig(root,{mapping:{hips:'hips',upperArmL:'upperArmL',upperArmR:'upperArmR'}});
  assert.equal(rig.kind,'quadruped');assert.equal(rig.humanoid,false);assert.equal(rig.convention,'autorig-pro-quadruped');
  assert.equal(rig.bone('shoulderL').name, 'c_thigh_b_dupli_001.l');
  rig.applyCanonical({q:{},hips:new T.Vector3(1,2,3)});
  for(const [bone,position] of before) assert.deepEqual(bone.getWorldPosition(new T.Vector3()).toArray(),position);
  assert.equal(isARPHorse(new T.Group()),false);
});
test('la carga neutraliza FACEIT del caballo y conserva correctivas y personajes humanos',()=>{
  const root=horse(),mesh=new T.Mesh();root.add(mesh);
  mesh.morphTargetDictionary={eyeBlinkLeft:0,jawOpen:1,tongueOut:2,CorrectivaPata:3};
  mesh.morphTargetInfluences=[1,1,1,.75];
  assert.equal(neutralizeHorseFace(root),3);
  assert.deepEqual(mesh.morphTargetInfluences,[0,0,0,.75]);
  const human=new T.Group(),humanMesh=mesh.clone();human.add(humanMesh);
  humanMesh.morphTargetInfluences=[1,1,1,.75];
  assert.equal(neutralizeHorseFace(human),0);
  assert.deepEqual(humanMesh.morphTargetInfluences,[1,1,1,.75]);
});
test('el empalme cierra pistas con tiempos finales distintos y preserva el FBX original',()=>{
  const start=new T.Quaternion(),end=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.4);
  const clip=new T.AnimationClip('Galope',.6,[new T.QuaternionKeyframeTrack('Head.quaternion',[0,.4],[...start.toArray(),...end.toArray()]),new T.VectorKeyframeTrack('CG.position',[0,.6],[0,1,0,0,1,4])]);
  const loop=closeHorseCycle(clip);
  assert.ok(new T.Quaternion().fromArray(loop.tracks[0].values,4).angleTo(start)<1e-6);
  assert.ok(Math.abs(loop.tracks[1].values[5])<1e-6);
  assert.ok(clip.tracks[1].values[5]===4);
});
test('la cadena de caballo alcanza el casco sin estirar ninguno de sus tres segmentos',()=>{
  const p=[new T.Vector3(0,1,0),new T.Vector3(0,.6,.2),new T.Vector3(0,.35,.05),new T.Vector3(0,.1,.05)];
  const lengths=p.slice(1).map((v,i)=>v.distanceTo(p[i]));
  const goal=new T.Vector3(.05,.12,.2);
  solveHorseLeg(p,goal,lengths);
  assert.ok(p.at(-1).distanceTo(goal)<.001);
  lengths.forEach((v,i)=>assert.ok(Math.abs(p[i].distanceTo(p[i+1])-v)<1e-8));
});
