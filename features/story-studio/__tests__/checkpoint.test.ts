import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStudioRehearsal} from '../demo.ts';
import {createStudioDirector} from '../director.ts';
import {readStudioCheckpoint,saveStudioCheckpoint} from '../checkpoint.ts';

test('back follows the visited route, without exposing a skipped branch',()=>{
  const {source,project}=buildStudioRehearsal();
  project.scenes[0].sequences[0].gate={kind:'choice',prompt:'Elige',options:[{id:'skip',label:'Ir al cuarto momento',nextSequenceId:'sequence-4'},{id:'next',label:'Continuar'}]};
  const director=createStudioDirector(project,source);director.play();director.tick(3);const advanced=director.respond({kind:'choice',value:'skip'}).snapshot;
  assert.equal(advanced.index,3);assert.equal(advanced.canGoBack,true);assert.deepEqual(advanced.path,['sequence-1']);
  assert.equal(director.back().index,0);assert.equal(director.snapshot().canGoBack,false);
});
test('a checkpoint resumes a student wait and remains isolated by learner and release',()=>{
  const {source,project}=buildStudioRehearsal(),director=createStudioDirector(project,source),rows=new Map<string,string>();
  const storage={getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>{rows.set(key,value);}};
  director.play();director.tick(3);director.respond({kind:'continue'});director.tick(3);
  saveStudioCheckpoint(storage,'learner-a','release-a',source.storyVersionId,director.snapshot());
  assert.equal(readStudioCheckpoint(storage,'learner-b','release-a',source.storyVersionId),null);
  assert.equal(readStudioCheckpoint(storage,'learner-a','release-b',source.storyVersionId),null);
  const saved=readStudioCheckpoint(storage,'learner-a','release-a',source.storyVersionId)!;
  const resumed=createStudioDirector(project,source);assert.equal(resumed.restore(saved).index,1);assert.equal(resumed.play().state,'waiting');
  assert.throws(()=>readStudioCheckpoint(storage,'learner-a','release-a','other-version'));
  assert.throws(()=>resumed.restore({...saved,path:['sequence-4']}),/autorizado/);
});

test('skipped staging never changes the visited route, including after resume and back',()=>{
  const {source,project}=buildStudioRehearsal(),scene=project.scenes[0];
  scene.actors.push({id:'samuel',characterId:'samuel',name:'Samuel',position:[0,0,0],rotation:0,height:1.72});
  scene.sequences[0].gate={kind:'choice',prompt:'Elige',options:[{id:'skip',label:'Saltar',nextSequenceId:'sequence-4'},{id:'next',label:'Continuar'}]};
  scene.sequences[0].cues.push({id:'visited-walk',kind:'actor',actorId:'samuel',action:'walk',destination:[2,0,0],at:0,duration:2});
  scene.sequences[1].cues.push({id:'skipped-walk',kind:'actor',actorId:'samuel',action:'walk',destination:[99,0,0],expression:'skipped-expression',at:0,duration:2});
  scene.sequences[1].cues.push({id:'skipped-camera',kind:'camera',shot:{...scene.shot,position:[99,99,99]},label:'Omitida',at:0,duration:2});
  const director=createStudioDirector(project,source);director.play();director.tick(3);
  const advanced=director.respond({kind:'choice',value:'skip'}).snapshot;
  assert.deepEqual(advanced.stage.actors[0].position,[2,0,0]);
  assert.deepEqual(advanced.stage.shot,scene.shot);
  assert.equal(advanced.stage.performances.some(p=>p.expression==='skipped-expression'),false);
  const resumed=createStudioDirector(project,source);
  const restored=resumed.restore({sequenceId:advanced.stage.sequenceId,time:advanced.time,finished:false,path:advanced.path});
  assert.deepEqual(restored.stage,advanced.stage);
  assert.deepEqual(resumed.back().stage.actors[0].position,[0,0,0]);
  // Seeking remains an author preview of the preceding authored staging.
  assert.deepEqual(createStudioDirector(project,source).seek(3).stage.actors[0].position,[99,0,0]);
});

test('returning to a previous moment does not replay skipped later transformations',()=>{
  const {source,project}=buildStudioRehearsal(),scene=project.scenes[0];
  scene.actors.push({id:'samuel',characterId:'samuel',name:'Samuel',position:[0,0,0],rotation:0,height:1.72});
  scene.sequences[0].cues.push({id:'walk',kind:'actor',actorId:'samuel',action:'walk',destination:[8,0,0],at:0,duration:2});
  scene.sequences[1].gate={kind:'continue',prompt:'Otra vez',nextSequenceId:'sequence-1'};
  const director=createStudioDirector(project,source);director.play();director.tick(3);director.respond({kind:'continue'});director.tick(3);
  const looped=director.respond({kind:'continue'}).snapshot;
  assert.equal(looped.index,0);assert.deepEqual(looped.stage.actors[0].position,[8,0,0]);
  assert.equal(looped.stage.dialogue?.sentenceId,source.sentences[0].id);
  assert.deepEqual(director.tick(1).stage.actors[0].position,[8,0,0]);
});

test('reentering a scene restores its own staging rather than an earlier visit',()=>{
  const {source,project}=buildStudioRehearsal(),scene=project.scenes[0];
  scene.actors.push({id:'samuel',characterId:'samuel',name:'Samuel',position:[0,0,0],rotation:0,height:1.72});
  scene.sequences[0].cues.push({id:'first-visit-walk',kind:'actor',actorId:'samuel',action:'walk',destination:[8,0,0],at:0,duration:2});
  scene.sequences[0].gate={kind:'continue',prompt:'Cambiar de escena',nextSequenceId:'other-moment'};
  project.scenes.push({...structuredClone(scene),id:'other-scene',name:'Otro escenario',actors:[{...scene.actors[0],position:[50,0,50]}],sequences:[{id:'other-moment',name:'Otra visita',cues:[],gate:{kind:'continue',prompt:'Volver',nextSequenceId:'sequence-2'}}]});
  const director=createStudioDirector(project,source);director.play();director.tick(3);
  assert.deepEqual(director.respond({kind:'continue'}).snapshot.stage.actors[0].position,[50,0,50]);
  director.tick(0);const returned=director.respond({kind:'continue'}).snapshot;
  assert.equal(returned.index,1);assert.deepEqual(returned.stage.actors[0].position,[0,0,0]);
  assert.deepEqual(createStudioDirector(project,source).restore({sequenceId:'sequence-2',time:0,finished:false,path:returned.path}).stage,returned.stage);
});
