import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStudioRehearsal} from '../demo.ts';
import {checkDirection} from '../checks.ts';
import {snapActor,alignActor,actorDistance} from '../staging.ts';
import {workshopAction} from '../workshop.ts';

test('las comprobaciones detectan momentos sin ruta, bibliotecas ausentes y audio sin modificar la historia',()=>{
  const {project,source}=buildStudioRehearsal('airport'),scene=project.scenes[0];scene.sequences[0].gate.nextSequenceId=scene.sequences.at(-1)!.id;
  scene.sequences[0].cues.push({id:'audio-check',kind:'sound',at:0,duration:1,audioUrl:'studio-audio:'+'a'.repeat(64),volume:1,label:'Voz'});
  const before=JSON.stringify(project),checks=checkDirection(project,source,{characters:[],scenarios:[],audio:[]});
  assert(checks.some(c=>c.message.includes('escenario')));assert(checks.some(c=>c.message.includes('modelo')));assert(checks.some(c=>c.message.includes('grabación')));assert.equal(checks.filter(c=>c.message.includes('ninguna ruta')).length,3);assert.equal(JSON.stringify(project),before);
  assert.equal(checkDirection(buildStudioRehearsal('airport').project,source,{characters:['rachel'],scenarios:['aeropuerto-entrada'],audio:[]}).length,0);
});
test('el ajuste espacial conserva Y y la fuente; alineación y orientación usan las posiciones reales',()=>{
  const actor={id:'a',name:'Rachel',characterId:'rachel',position:[.13,2,.36] as const,rotation:.11,height:1.65},before=structuredClone(actor),snap=snapActor(actor,.25);
  assert.deepEqual(snap.position,[.25,2,.25]);assert.equal(snap.rotation,0);assert.deepEqual(actor,before);
  const target={...actor,id:'b',position:[1.13,4,.36] as const};assert(Math.abs(actorDistance(actor,target)-1)<1e-12);assert.equal(alignActor(actor,target,'face').rotation,Math.PI/2);assert.equal(alignActor(actor,target,'x').position[0],1.13);assert.equal(alignActor(actor,target,'x').position[1],2);
  assert.throws(()=>snapActor(actor,0));assert.throws(()=>alignActor(actor,actor,'face'));
});
test('abrir el Taller desde un diálogo reutiliza la actuación existente y exige selección si hay ambigüedad',()=>{
  const {project}=buildStudioRehearsal('airport'),sequence=project.scenes[0].sequences[0],actorId=project.scenes[0].actors[0].id;
  sequence.cues.push({id:'body-a',kind:'actor',actorId,action:'idle',at:0,duration:4});
  assert.equal(workshopAction(sequence,actorId,sequence.cues[0].id,1).cue?.id,'body-a');assert.equal(workshopAction(sequence,actorId,undefined,7).cue?.id,'body-a');
  sequence.cues.push({id:'body-b',kind:'actor',actorId,action:'idle',at:0,duration:4});
  assert.equal(workshopAction(sequence,actorId,undefined,1).ambiguous,true);assert.equal(workshopAction(sequence,actorId,'body-b',1).cue?.id,'body-b');
});
