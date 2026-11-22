import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isBehaviorReference,behaviorFetchUrl} from '../behavior.ts';
import {buildStudioRehearsal} from '../demo.ts';
import {validateProject} from '../model.ts';

const id='12345678-1234-1234-1234-123456789abc';
const reference={id,name:'Saludar',characterId:'samuel',duration:4,review:{status:'unreviewed' as const},url:`http://127.0.0.1:5189/ecosystem/assets/${id}.json`};
test('una actuación se guarda en el proyecto sin cambiar el diálogo y solo para el personaje correcto',()=>{
  const {project,source}=buildStudioRehearsal(),scene=project.scenes[0],sequence=scene.sequences[0],before=sequence.cues.filter(c=>c.kind==='dialogue');
  scene.actors.push({id:'actor-test',characterId:'samuel',name:'Samuel',position:[0,0,0],rotation:0,height:1.7});
  sequence.cues.push({id:'behavior-test',kind:'actor',actorId:scene.actors[0].id,at:0,duration:4,action:'idle',behavior:reference});
  validateProject(JSON.parse(JSON.stringify(project)),source);assert.deepEqual(sequence.cues.filter(c=>c.kind==='dialogue'),before);
  const cue=sequence.cues.at(-1)!;if(cue.kind==='actor')cue.behavior={...reference,characterId:'otro'};assert.throws(()=>validateProject(project,source),/Actuación/);
});
test('la lectura de una referencia pide su revisión (solo las del Taller; las importadas ya son inmutables)',()=>{
  assert.equal(behaviorFetchUrl({...reference,revision:2}),reference.url+'?revision=2');
  assert.equal(behaviorFetchUrl(reference),reference.url);
  const imported=`http://localhost:3000/api/studio-behaviors?id=${id}&sha=${'c'.repeat(64)}`;
  assert.equal(behaviorFetchUrl({url:imported,revision:4}),imported);
});
test('referencias incompletas, rutas ajenas y tiempos no finitos son rechazados',()=>{
  assert(isBehaviorReference(reference));
  for(const value of [{...reference,duration:NaN},{...reference,url:'https://example.com/a.json'},{...reference,url:'http://127.0.0.1:5189/ecosystem/assets/otro.json'},{...reference,name:''}])assert.equal(isBehaviorReference(value),false);
});
