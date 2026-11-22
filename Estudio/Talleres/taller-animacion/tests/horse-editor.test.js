import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Rig, applySceneBoneMatrices } from '../src/core/rig.js';
import { Engine, setKey } from '../src/core/animation.js';
import { makeClip, clipToJSON, clipFromJSON } from '../src/core/clip.js';
import { horseChains, horseControlPoints } from '../src/core/horse-editor.js';
import { Viewport } from '../src/ui/viewport.js';
import { bakeCanonical, bakeAnimationClip } from '../src/io/exporter.js';
import { portableAnimation } from '../src/core/behavior.js';
import { modelBoneMatrices, applyModelBoneMatrices } from '../../../../SpanStories-Ciudades/engine/StoryStudioBridge.js';

function fixture() {
  const root = new T.Group(), bones = [];
  const add = (name, pos) => { const b = new T.Bone(); b.name = name; b.position.fromArray(pos); root.add(b); bones.push(b); return b; };
  add('hips', [0, 1, -.4]); add('spine', [0, 1.1, 0]); add('chest', [0, 1.1, .5]);
  add('neck', [0, 1.35, .7]); add('head', [0, 1.5, 1]);
  for (const s of ['L', 'R']) for (const front of [true, false]) {
    const x = s === 'L' ? .18 : -.18, z = front ? .5 : -.4, side = s.toLowerCase();
    add(`c_thigh_b${front ? '_dupli_001' : ''}${side}`, [x, 1, z]);
    add((front ? 'upperArm' : 'upperLeg') + s, [x, .75, z+.12]);
    add((front ? 'lowerArm' : 'lowerLeg') + s, [x, .4, z-.02]);
    add((front ? 'hand' : 'foot') + s, [x, .1, z+.05]);
    add(front ? `toes_01_dupli_001${side}` : 'toes'+s, [x, .05, z+.18]);
    add(`leg_twist${front ? '_dupli_001' : ''}${side}`, [x, .4, z-.02]);
  }
  root.updateMatrixWorld(true);
  const world = new Map(bones.map(b => [b, b.matrixWorld.clone()]));
  const skin = new T.SkinnedMesh(new T.BufferGeometry(), new T.MeshBasicMaterial()); root.add(skin);
  skin.bind(new T.Skeleton(bones));
  const inverses = skin.skeleton.boneInverses.map(m => m.clone());
  const source = root.clone(true);
  const rig = new Rig(root);
  const native = Object.fromEntries(rig.bones.map(b => [b.name, {q:[...b.quaternion.toArray(), ...b.quaternion.toArray()], p:[...b.position.toArray(), ...b.position.toArray()], s:[...b.scale.toArray(), ...b.scale.toArray()]}]));
  const clip = Object.assign(makeClip({id:'horse',name:'Paso',fps:30,frames:2,loop:false,tracks:{}}), {native,character:{id:'horse',kind:'url',url:'/horse.glb'},animal:{archivo:'H_Walk.FBX',editorVersion:2}});
  const engine = new Engine(rig, new Map([[clip.id,clip]]));
  engine.doc.strips = [{id:'s',clipId:clip.id,start:0,len:2,speed:1,loop:false}];
  return {root,rig,engine,clip,world,skin,inverses,source};
}
const pose = rig => rig.bones.map(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()]);

test('la pose de escena y la del Taller coinciden aunque sus padres y escalas de raíz difieran',()=>{
  const {rig,source}=fixture(),names=rig.bones.map(b=>b.name),bones=names.map(n=>source.getObjectByName(n));
  source.position.set(4,2,-3);source.scale.setScalar(.8);source.rotation.y=.4;source.updateMatrixWorld(true);
  const original=modelBoneMatrices(source,bones);
  applySceneBoneMatrices(rig.root,rig.bones,original);
  const edited=modelBoneMatrices(rig.root,rig.bones);
  original.forEach((v,i)=>assert.ok(Math.abs(v-edited[i])<1e-7,`control ${i}`));
  rig.bone('neck').rotation.x+=.2;rig.root.updateMatrixWorld(true);
  const desired=modelBoneMatrices(rig.root,rig.bones);
  applyModelBoneMatrices(source,bones,desired);
  modelBoneMatrices(source,bones).forEach((v,i)=>assert.ok(Math.abs(v-desired[i])<1e-7,`escena ${i}`));
});

test('cambiar de actor conserva la animación del caballo en el esqueleto original de la escena',()=>{
  const {rig,engine,source}=fixture();
  engine.evaluate(0);
  engine.keyBone(rig.bone('neck'),rig.bone('neck').quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.2)),null,0);
  const clip=T.AnimationClip.parse(portableAnimation(bakeAnimationClip(engine,'Escena',engine.range(),{sourceHierarchy:true}),rig.root));
  const mixer=new T.AnimationMixer(source),action=mixer.clipAction(clip).play();
  action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
  for(const frame of [0,1]){
    engine.evaluate(frame);mixer.setTime(frame/engine.fps);source.updateMatrixWorld(true);rig.root.updateMatrixWorld(true);
    for(const b of rig.bones){
      const target=source.getObjectByName(b.name);
      target.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-b.matrixWorld.elements[i])<2e-5,`${b.name} · ${frame} · ${i}`));
    }
  }
});

test('los controles del caballo incluyen cadera, rodilla, corvejón, menudillo y casco en sus pivotes reales', () => {
  const { rig, engine } = fixture();
  const controls = horseControlPoints(rig);
  assert.equal(controls.length, 25);
  assert.equal(new Set(controls.map(p => p.bone)).size, controls.length);
  for (const chain of ['footL', 'footR', 'handL', 'handR']) {
    const points = controls.filter(p => p.chain === chain);
    assert.equal(points.length, 5);
    assert.deepEqual(points.slice(0, 4).map(p => p.bone), horseChains(rig)[chain]);
    assert.match(points[4].label, /^Casco /);
    if (chain.startsWith('foot')) assert.deepEqual(points.map(p => p.label.split(' ')[0]), ['Cadera', 'Rodilla', 'Corvejón', 'Menudillo', 'Casco']);
  }
  const vp = Object.assign(Object.create(Viewport.prototype), {
    app: { rig, engine }, handles: new T.Group(), handleList: [], camera: new T.PerspectiveCamera(),
    orbit: { target: new T.Vector3() }, opts: { controls: true }, gizmo: { dragging: false },
    handleVis: { hips: true, spine: true, shoulderL: true, shoulderR: true, armL: true, armR: true, legL: true, legR: true },
  });
  engine.evaluate(0);
  vp.buildDots(); vp.updateDots();
  for (const point of controls) {
    const handle = vp.handleList.find(m => m.userData.bone === point.bone);
    assert.ok(handle?.visible, point.label);
    assert.ok(handle.position.distanceTo(point.bone.getWorldPosition(new T.Vector3())) < 1e-10, point.label);
  }
  vp.ctlStyle = 'aros'; vp.buildHandles(); vp.updateHandles();
  for (const point of controls) {
    const handle = vp.handleList.find(m => m.userData.bone === point.bone);
    assert.ok(handle?.visible, point.label);
    assert.ok(handle.position.distanceTo(point.bone.getWorldPosition(new T.Vector3())) < 1e-10, point.label);
  }
  // Native track identities remain compatible with already edited projects.
  assert.equal(rig.mapping.upperLegL, 'upperLegL');
  assert.equal(rig.mapping.lowerLegL, 'lowerLegL');
});

test('el perfil de cuatro patas conserva matrices de enlace y conecta descendientes para FK', () => {
  const {rig,world,skin,inverses} = fixture();
  assert.equal(rig.humanoid,false);
  assert.equal(Object.keys(horseChains(rig)).length,4);
  for (const [b,m] of world) m.elements.forEach((v,i) => assert.ok(Math.abs(b.matrixWorld.elements[i]-v)<1e-9));
  inverses.forEach((m,i) => assert.deepEqual(skin.skeleton.boneInverses[i].elements,m.elements));
  assert.equal(rig.bone('footL').parent,rig.bone('lowerLegL'));
});

test('IK sin retoques conserva la animación nativa; el objetivo mueve solo su pata y no estira segmentos', () => {
  const {rig,engine} = fixture();
  engine.evaluate(0); const base = pose(rig), other = rig.bone('footR').getWorldPosition(new T.Vector3());
  for (const chain of Object.keys(horseChains(rig))) engine.doc.ik[chain]=true;
  engine.evaluate(0); assert.deepEqual(pose(rig),base);
  const bones = horseChains(rig).handL;
  const pts = bones.map(b => b.getWorldPosition(new T.Vector3()));
  const target = pts.at(-1).clone().add(new T.Vector3(0,.07,.08));
  const hoofQ = rig.bone('handL').getWorldQuaternion(new T.Quaternion());
  engine.keyIK('handL',{pos:target},0); engine.evaluate(0);
  assert.ok(rig.bone('handL').getWorldPosition(new T.Vector3()).distanceTo(target)<.002);
  assert.ok(rig.bone('handL').getWorldQuaternion(new T.Quaternion()).angleTo(hoofQ)<1e-7);
  assert.ok(rig.bone('footR').getWorldPosition(new T.Vector3()).distanceTo(other)<1e-9);
  const now = bones.map(b => b.getWorldPosition(new T.Vector3()));
  now.slice(1).forEach((p,i) => assert.ok(Math.abs(p.distanceTo(now[i])-pts[i+1].distanceTo(pts[i]))<1e-9));
  const changed = pose(rig); engine.evaluate(1);engine.evaluate(0);assert.deepEqual(pose(rig),changed);
  setKey(engine.layer(),'ik:handL:w',0,[0]);engine.evaluate(0);assert.deepEqual(pose(rig),base);
});

test('rotación FK, traslación, capas y horneado sobreviven a guardar y abrir el clip', () => {
  const {rig,engine,clip} = fixture();
  engine.evaluate(0);
  const other = rig.bone('handR').getWorldPosition(new T.Vector3());
  const neck = rig.bone('neck'), headBefore = rig.bone('head').getWorldPosition(new T.Vector3());
  const q = neck.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.2));
  engine.keyBone(neck,q,null,0); engine.evaluate(0);
  assert.ok(rig.bone('head').getWorldPosition(new T.Vector3()).distanceTo(headBefore)>.02);
  assert.ok(rig.bone('handR').getWorldPosition(new T.Vector3()).distanceTo(other)<1e-9);
  const hips = rig.bone('hips'), p = hips.position.clone().add(new T.Vector3(.1,0,0));
  engine.keyBone(hips,null,p,0);engine.evaluate(0);
  const expected=pose(rig), baked=bakeCanonical(engine,{id:'saved',name:'Retocado'});
  const loaded=clipFromJSON(JSON.parse(JSON.stringify(clipToJSON(baked))));
  assert.ok(loaded.native.leg_twistl);assert.deepEqual(loaded.character,clip.character);
  engine.library.set(loaded.id,loaded);engine.doc.strips[0].clipId=loaded.id;engine.doc.layers[0].tracks={};
  engine.evaluate(0); pose(rig).forEach((a,i) => a.forEach((v,j) => assert.ok(Math.abs(v-expected[i][j])<1e-8)));
});

test('cambiar una pata retocada de IK a FK conserva también el cuarto segmento', () => {
  const {rig,engine} = fixture();
  engine.doc.ik.footL=true;engine.evaluate(0);
  const target=rig.bone('footL').getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.06,.05));
  engine.keyIK('footL',{pos:target},0);engine.evaluate(0);
  const before=rig.bones.map(b=>b.getWorldPosition(new T.Vector3()));
  assert.equal(engine.ikBakeBones('footL').length,4);
  engine.switchIK('footL',false,0);engine.evaluate(0);
  assert.equal(engine.doc.ik.footL,false);
  rig.bones.forEach((b,i)=>assert.ok(b.getWorldPosition(new T.Vector3()).distanceTo(before[i])<.003));
});

test('la tira nativa responde al reloj, al revés, al silencio y al fundido entre clips', () => {
  const {rig,engine,clip}=fixture();
  clip.native.hips.p[3]+=.2;
  engine.evaluate(0);const begin=rig.bone('hips').position.x;
  engine.evaluate(1);assert.ok(Math.abs(rig.bone('hips').position.x-begin-.2)<1e-9);
  engine.doc.strips[0].reverse=true;engine.evaluate(0);assert.ok(Math.abs(rig.bone('hips').position.x-begin-.2)<1e-9);
  engine.doc.strips[0].mute=true;engine.evaluate(0);assert.ok(Math.abs(rig.bone('hips').position.x-begin)<1e-9);
  engine.doc.strips[0].mute=false;engine.doc.strips[0].reverse=false;
  const next=clipFromJSON(JSON.parse(JSON.stringify(clipToJSON(clip))));next.id='next';next.native.hips.p[0]+=.4;next.native.hips.p[3]+=.4;
  engine.library.set(next.id,next);engine.doc.strips.push({...engine.doc.strips[0],id:'s2',clipId:next.id,blend:1});
  engine.evaluate(.5);assert.ok(Math.abs(rig.bone('hips').position.x-begin-.3)<1e-8);
});

test('un caballo clonado ya preparado para el editor sigue exportando contra la jerarquía original del GLB',()=>{
  const {root,source}=fixture();
  const original=new Map();source.traverse(b=>{if(b.isBone)original.set(b.name,b.parent.name);});
  // El actor del caballo se reutiliza desde la caché: su jerarquía ya está reconectada y se clona así.
  const again=new Rig(root.clone(true));
  for(const [bone,parent] of again.sourceParents)assert.equal(parent.name,original.get(bone.name),`padre original de ${bone.name}`);
});
