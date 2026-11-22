import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mountedTracks, pairMorphMeshes, selectMountedEditor } from '../src/core/mounted-animation.js';
import { prepareStripInsertion } from '../src/core/strip-insertion.js';

test('al alternar los rigs se comparte el fotograma y se conservan los documentos e historiales', () => {
  const horse={engine:{frame:45,doc:{strips:['paso']}},undo:['caballo']};
  const rider={engine:{frame:5,doc:{strips:['jinete']}},undo:['brazo']};
  const session={active:horse};
  selectMountedEditor(session,rider,45,{strip:'paso',lib:'caballo'});
  assert.equal(rider.engine.frame,45);
  assert.deepEqual(rider.engine.doc.strips,['jinete']);
  selectMountedEditor(session,horse,156,{strip:'jinete',lib:'humano'});
  assert.equal(horse.engine.frame,156);
  assert.equal(horse.strip,'paso');
  assert.deepEqual(horse.undo,['caballo']);
  assert.deepEqual(rider.undo,['brazo']);
});

test('hornea desplazamiento y articulaciones montadas en el espacio de cada actor', () => {
  const source=new THREE.Group();
  const hip=new THREE.Bone(),leg=new THREE.Bone();
  hip.name='hips';leg.name='leg';leg.position.y=-1;
  source.add(hip);hip.add(leg);
  const root=new THREE.Group(),edited=source.clone();
  root.add(edited);
  const editedHip=edited.getObjectByName('hips'),editedLeg=edited.getObjectByName('leg');
  edited.attach(editedLeg);
  const placement=new THREE.Matrix4().makeTranslation(10,0,0);
  const session=new THREE.Matrix4().makeTranslation(12,0,0);
  const sampler=mountedTracks({root:edited,bones:[editedHip,editedLeg]},source,placement,session,2,30);
  sampler.sample();
  root.position.z=3;
  editedHip.position.y=2;
  editedLeg.position.y=1;
  sampler.sample();
  const clip=sampler.finish('Actuación');
  assert.deepEqual(clip.tracks.find(t=>t.name==='hips.position').values,[2,0,0,2,2,3]);
  assert.equal(clip.tracks.some(t=>t.name==='leg.position'),false);
});

test('prepara una inserción al cabezal sin modificar las tiras ni mezclar los rigs', async () => {
  const rig={kind:'quadruped',bones:[{name:'back'}]};
  const before=[{clipId:'first',start:0,len:40}];
  const doc={fps:60,strips:structuredClone(before)};
  const compatible={id:'gait',name:'Marcha',frames:31,fps:30,native:{back:{}}};
  const result=await prepareStripInsertion(['gait'],async()=>compatible,rig,doc,65);
  assert.equal(result.strips[0].start,65);
  assert.equal(result.strips[0].len,61);
  assert.equal(result.frame,126);
  await assert.rejects(prepareStripInsertion(['gait','human'],async id=>id==='gait'?compatible:
    {id,name:'Humano',frames:31,fps:30},rig,doc,65),/incompatible/);
  assert.deepEqual(doc.strips,before);
});

function faceModel() {
  const root = new THREE.Group(), hip = new THREE.Bone(), face = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  hip.name = 'hips'; face.name = 'Cara';
  face.morphTargetInfluences = [0, 0];
  root.add(hip, face);
  return { root, hip, face };
}

test('el rostro editado se hornea en la animación montada y las mallas se emparejan por nombre', () => {
  const source = faceModel().root, editedModel = faceModel();
  const pairs = pairMorphMeshes(editedModel.root, source);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].source, source.getObjectByName('Cara'));
  const sampler = mountedTracks({ root: editedModel.root, bones: [editedModel.hip] }, source, new THREE.Matrix4(), new THREE.Matrix4(), 3, 30);
  editedModel.face.morphTargetInfluences = [0, 0]; sampler.sample();
  editedModel.face.morphTargetInfluences = [.5, 0]; sampler.sample();
  editedModel.face.morphTargetInfluences = [1, .25]; sampler.sample();
  const clip = sampler.finish('Actuación');
  const morph = clip.tracks.filter(t => t.name === 'Cara.morphTargetInfluences');
  assert.equal(morph.length, 1, 'una sola pista por malla, sin duplicados');
  assert.deepEqual(morph[0].values, [0, 0, .5, 0, 1, .25]);
});

test('un rostro quieto no añade pistas y una malla con nombre repetido se deja fuera en vez de romper el guardado', () => {
  const source = faceModel().root, editedModel = faceModel();
  const still = mountedTracks({ root: editedModel.root, bones: [editedModel.hip] }, source, new THREE.Matrix4(), new THREE.Matrix4(), 2, 30);
  still.sample(); still.sample();
  assert.equal(still.finish('Quieto').tracks.some(t => t.name.endsWith('.morphTargetInfluences')), false);
  const twin = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  twin.name = 'Cara'; twin.morphTargetInfluences = [0, 0]; source.add(twin);
  assert.equal(pairMorphMeshes(editedModel.root, source).length, 0);
});
