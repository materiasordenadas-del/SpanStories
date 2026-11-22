import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStudioRehearsal} from '../demo.ts';
import {duplicateScene,reorderScene,resizeScene,duplicateMoment,reorderMoment} from '../editing.ts';
import {sceneDuration,sequenceDuration,validateProject} from '../model.ts';
import {createStudioDirector,sampleSequence} from '../director.ts';

test('scene duplication remaps internal decisions and actor references without changing original text or IDs',()=>{
  const {project,source}=buildStudioRehearsal('airport'),scene=project.scenes[0],original=structuredClone(project);
  scene.sequences[0].gate={kind:'choice',prompt:'Elige',options:[{id:'branch',label:'Seguir',nextSequenceId:scene.sequences[2].id},{id:'other',label:'Otra opción',nextSequenceId:scene.sequences[1].id}]};
  scene.sequences[1].cues.push({id:'greet',kind:'actor',actorId:scene.actors[0].id,action:'talk',at:0,duration:2});
  let count=0;const next=duplicateScene(project,scene.id,()=>`new-${++count}`);validateProject(next,source);
  const copy=next.scenes[1];assert.notEqual(copy.id,scene.id);assert.notEqual(copy.actors[0].id,scene.actors[0].id);
  assert.equal(copy.sequences[0].gate.kind,'choice');if(copy.sequences[0].gate.kind==='choice')assert.equal(copy.sequences[0].gate.options[0].nextSequenceId,copy.sequences[2].id);
  const talk=copy.sequences[1].cues.find(c=>c.kind==='actor');assert.equal(talk?.actorId,copy.actors[0].id);
  assert.deepEqual(next.scenes[0],project.scenes[0]);assert.equal(copy.sequences[0].cues[0].kind,'dialogue');
  const moved=reorderScene(next,copy.id,0);assert.equal(moved.scenes[0].id,copy.id);assert.equal(next.scenes[0].id,original.scenes[0].id);validateProject(moved,source);
});
test('scene duration can add/remove padding without moving or clipping actions',()=>{
  const {project,source}=buildStudioRehearsal('airport'),scene=project.scenes[0],before=structuredClone(scene);
  const longer=resizeScene(scene,20);assert.equal(sceneDuration(longer),20);assert.deepEqual(longer.sequences.flatMap(s=>s.cues),before.sequences.flatMap(s=>s.cues));
  assert.equal(sceneDuration(resizeScene(longer,18)),18);assert.throws(()=>resizeScene(scene,12));assert.deepEqual(scene,before);
  project.scenes[0]=longer;validateProject(project,source);
  const director=createStudioDirector(project,source);assert.equal(director.seek(4,7).duration,8);
});
test('duplicar y mover un momento conserva actores, texto y destinos; un bucle propio se remapea a la copia',()=>{
  const {project,source}=buildStudioRehearsal('airport'),scene=project.scenes[0],original=structuredClone(project);
  scene.sequences[0].gate={kind:'choice',prompt:'Elige',options:[{id:'again',label:'Repetir',nextSequenceId:scene.sequences[0].id},{id:'next',label:'Seguir',nextSequenceId:scene.sequences[1].id}]};
  let n=0;const copied=duplicateMoment(project,scene.id,scene.sequences[0].id,()=>`moment-copy-${++n}`),copy=copied.scenes[0].sequences[1];
  assert.notEqual(copy.id,scene.sequences[0].id);assert.notEqual(copy.cues[0].id,scene.sequences[0].cues[0].id);assert.deepEqual(copied.scenes[0].actors,scene.actors);
  assert.equal(copy.gate.kind,'choice');if(copy.gate.kind==='choice'){assert.equal(copy.gate.options[0].nextSequenceId,copy.id);assert.equal(copy.gate.options[1].nextSequenceId,scene.sequences[1].id);}
  const moved=reorderMoment(copied,scene.id,copy.id,3);assert.equal(moved.scenes[0].sequences[3].id,copy.id);validateProject(moved,source);
  assert.equal(scene.sequences.length,original.scenes[0].sequences.length);assert.throws(()=>reorderMoment(project,scene.id,scene.sequences[0].id,-1));
});
test('explicit scene retiming preserves decisions, saved performance references and source data',()=>{
  const {project,source}=buildStudioRehearsal('airport'),scene=project.scenes[0];
  const id='12345678-1234-1234-1234-123456789abc',behavior={id,name:'Sonrisa',characterId:'rachel',duration:2,review:{status:'unreviewed' as const},url:`http://127.0.0.1:5189/ecosystem/assets/${id}.json`};
  scene.sequences[0].cues.push({id:'performance',kind:'actor',actorId:scene.actors[0].id,action:'idle',at:0,duration:2,behavior});
  const before=structuredClone(scene);
  const scaled=resizeScene(scene,30,'scale');assert.equal(sceneDuration(scaled),30);assert.equal(scaled.sequences[0].cues[0].duration,6);assert.deepEqual(scaled.sequences.map(s=>s.gate),scene.sequences.map(s=>s.gate));assert.deepEqual(scene,before);
  project.scenes[0]=scaled;validateProject(project,source);assert.throws(()=>resizeScene(scene,NaN));
  assert.deepEqual(scaled.sequences[0].cues.find(c=>c.kind==='actor')?.behavior,behavior);
});
test('scene entry transitions are deterministic, complete before gates and reset on another scene',()=>{
  const {project,source}=buildStudioRehearsal('airport');project.scenes[0].transition={kind:'fade',duration:2,easing:'linear'};
  assert.equal(sampleSequence(project,0,0).sceneEntry?.progress,0);assert.equal(sampleSequence(project,0,1).sceneEntry?.progress,.5);assert.equal(sampleSequence(project,1,0).sceneEntry?.progress,1);
  const copy=duplicateScene(project,project.scenes[0].id);validateProject(copy,source);assert.equal(sampleSequence(copy,5,0,[0,1,2,3,4]).sceneEntry?.progress,0);
  const director=createStudioDirector(project,source);director.play();const waiting=director.tick(3);assert.equal(waiting.state,'waiting');assert.equal(waiting.stage.sceneEntry?.progress,1);
  project.scenes[0].transition.duration=10;assert.equal(sampleSequence(project,0,3).sceneEntry?.progress,1);
});
test('overlapping camera movements start from the camera pose at the next key, and long movements extend the moment',()=>{
  const {project,source}=buildStudioRehearsal(),scene=project.scenes[0],sequence=scene.sequences[0];
  sequence.cues.push({id:'camera-a',kind:'camera',at:0,duration:1,label:'A',shot:{...scene.shot,position:[26,14,20],transition:4,easing:'easeIn'}},{id:'camera-b',kind:'camera',at:2,duration:1,label:'B',shot:{...scene.shot,position:[38,14,20],transition:2,easing:'linear'}});
  validateProject(project,source);assert.equal(sequenceDuration(sequence),4);assert.equal(sampleSequence(project,0,2).shot.position[0],20);assert.equal(sampleSequence(project,0,2.5).shot.position[0],24.5);assert.equal(sampleSequence(project,0,4).shot.position[0],38);
  sampleSequence(project,0,3.8);assert.equal(sampleSequence(project,0,2.5).shot.position[0],24.5);
});
