import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {bakeAnimationClip} from '../src/io/exporter.js';
import {portableAnimation} from '../src/core/behavior.js';

test('exporta cuerpo y rostro en el mismo reloj y los reproduce en otra instancia del modelo',()=>{
  const root=new T.Group(),bone=new T.Bone();bone.name='Head';root.add(bone);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0],3));
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.name='Face';mesh.morphTargetDictionary={mouthSmileLeft:0};mesh.morphTargetInfluences=[0];root.add(mesh);
  const rig={root,bones:[bone],restQ:[bone.quaternion.clone()],canonOf:new Map([[bone,'head']])};
  const engine={rig,fps:30,range:()=>[0,30],evaluateFace(){},evaluate(f){bone.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),f/30);mesh.morphTargetInfluences[0]=f/30;}};
  const baked=bakeAnimationClip(engine,'Saludo');assert.equal(baked.duration,1);assert(baked.tracks.some(t=>t.name.endsWith('.morphTargetInfluences')));
  const json=portableAnimation(baked,root);assert(json.tracks.every(t=>!t.name.includes(bone.uuid)&&!t.name.includes(mesh.uuid)));
  const copy=root.clone(true),targetBone=copy.getObjectByName('Head'),targetFace=copy.getObjectByName('Face');targetFace.morphTargetInfluences=[0];
  const mixer=new T.AnimationMixer(copy),clip=T.AnimationClip.parse(json);mixer.clipAction(clip).play();mixer.setTime(.5);
  assert(Math.abs(targetFace.morphTargetInfluences[0]-.5)<1e-6);assert(Math.abs(new T.Euler().setFromQuaternion(targetBone.quaternion).y-.5)<1e-6);
});
test('conserva la exportación corporal sin añadir morphs cuando no hay capa facial',()=>{
  const root=new T.Group(),bone=new T.Bone();bone.name='Head';root.add(bone);
  const engine={rig:{root,bones:[bone],restQ:[bone.quaternion.clone()],canonOf:new Map([[bone,'head']])},fps:30,range:()=>[0,1],evaluate(){}};
  assert(bakeAnimationClip(engine,'Base').tracks.every(t=>!t.name.includes('morphTarget')));
});
test('rechaza nombres duplicados antes de guardar una animación que se vincularía al nodo equivocado',()=>{
  const root=new T.Group(),a=new T.Bone(),b=new T.Bone();a.name=b.name='Head';root.add(a,b);
  const clip=new T.AnimationClip('test',1,[new T.QuaternionKeyframeTrack(a.uuid+'.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);
  assert.throws(()=>portableAnimation(clip,root),/duplicados/);
});
