import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actorLifeProblem,actorLifeOverrideProblem,defaultActorLife,mergeActorLife,describeActorLife} from '../actor-life.ts';
import {behaviorUses,facialComponents,replaceBehaviorRefs} from '../facial-usage.ts';
import {buildStudioRehearsal} from '../demo.ts';
import {sampleSequence} from '../director.ts';
import {validateProject} from '../model.ts';
import type {BehaviorReference} from '../behavior.ts';

test('vida en reposo: validación del ajuste base y del cambio por momento',()=>{
  const v=defaultActorLife();
  assert.equal(actorLifeProblem(v),null);
  assert.ok(actorLifeProblem({...v,animo:'eufórica'}));
  assert.ok(actorLifeProblem({...v,activo:{...v.activo,habla:true}}));
  assert.ok(actorLifeProblem({...v,mirada:{modo:'actor',actorId:'nadie'}},new Set(['a'])));
  assert.equal(actorLifeOverrideProblem({animo:'nerviosa'}),null);
  assert.ok(actorLifeOverrideProblem({}));
  assert.equal(mergeActorLife(v,{animo:'triste'}).animo,'triste');
  assert.match(describeActorLife({...v,animo:'contenta'}),/Contenta/);
  assert.match(describeActorLife(undefined),/congelado/);
});

test('la historia guarda la vida del personaje y el director aplica el cambio desde su momento',()=>{
  const {project,source}=buildStudioRehearsal();
  const scene=project.scenes[0],sequence=scene.sequences[0],index=0;
  scene.actors.push({id:'rachel-1',characterId:'rachel',name:'Rachel',position:[0,0,0],rotation:0,height:1.7});const actor=scene.actors.at(-1)!;
  actor.vida={...defaultActorLife(),animo:'contenta'};
  sequence.cues.push({id:'vida-momento',kind:'actor',actorId:actor.id,action:'idle',at:1,duration:1,vida:{animo:'nerviosa'}});
  validateProject(project,source);
  const before=sampleSequence(project,index,.5),after=sampleSequence(project,index,1.5);
  assert.equal(before.actors.find(a=>a.id===actor.id)?.vida?.animo,'contenta');
  assert.equal(after.actors.find(a=>a.id===actor.id)?.vida?.animo,'nerviosa');
  assert.equal(after.actors.find(a=>a.id===actor.id)?.vida?.energia,.5,'conserva el resto de la base');
  // Un cambio inválido no se guarda.
  sequence.cues.push({id:'mal',kind:'actor',actorId:actor.id,action:'idle',at:2,duration:1,vida:{}});
  assert.throws(()=>validateProject(project,source));
});

test('dónde se usa un componente facial y cambio de referencias a la versión corregida',()=>{
  const {project}=buildStudioRehearsal();
  const scene=project.scenes[0];
  scene.actors.push({id:'rachel-1',characterId:'rachel',name:'Rachel',position:[0,0,0],rotation:0,height:1.7});const actor=scene.actors.at(-1)!;
  const old:BehaviorReference={id:'11111111-1111-4111-8111-111111111111',name:'Sonrisa',characterId:actor.characterId,duration:2,url:'http://127.0.0.1:5189/ecosystem/assets/11111111-1111-4111-8111-111111111111.json',review:{status:'unreviewed'}};
  scene.sequences[0].cues.push({id:'actua',kind:'actor',actorId:actor.id,action:'idle',at:0,duration:2,behavior:old});
  const uses=behaviorUses(project);assert.equal(uses.length,1);assert.equal(uses[0].actorName,actor.name);
  assert.deepEqual(facialComponents({presets:[{id:'acting.behavior-12.F'},{id:'user.x',source:{componente:'joy.soft.01'}}]}),{components:['acting.behavior-12.F'],variants:['joy.soft.01']});
  const fresh={...old,id:'22222222-2222-4222-8222-222222222222',url:old.url.replace(/1111/g,'2222')};
  assert.equal(replaceBehaviorRefs(project,[{from:old.id,to:fresh}]),1);
  assert.equal(behaviorUses(project)[0].behavior.id,fresh.id);
  assert.equal(replaceBehaviorRefs(project,[{from:fresh.id,to:{...fresh,characterId:'otro'}}]),0,'nunca a otro personaje');
});
