import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildStudioRehearsal} from '../demo.ts';
import {packStudio,inspectStudioPackage,relinkBehaviors} from '../portable.ts';
import {isBehaviorReference,validateBehaviorAsset,type BehaviorAsset} from '../behavior.ts';
import {storeLocalBehavior,readLocalBehavior} from '../local-behaviors.ts';
import {validateProject} from '../model.ts';

const id='12345678-1234-1234-1234-123456789abc';
const asset:BehaviorAsset={schema:'spanstories.behavior',version:1,id,name:'Prueba de transporte',characterId:'rachel',duration:1,animation:{duration:1,tracks:[{name:'Face.morphTargetInfluences',type:'number',times:[0,1],values:[0,0]}]},recipe:{unchanged:true},review:{status:'unreviewed'}};
function fixture(){const {project,source}=buildStudioRehearsal('airport');const actor=project.scenes[0].actors[0];project.scenes[0].sequences[0].cues.push({id:'test-transport',kind:'actor',actorId:actor.id,at:0,duration:1,action:'idle',behavior:{id,name:asset.name,characterId:'rachel',duration:1,review:{status:'unreviewed'},url:`http://127.0.0.1:5189/ecosystem/assets/${id}.json`}});return {project,source};}
const fetcher=(async()=>new Response(JSON.stringify(asset))) as typeof fetch;

test('el paquete conserva dirección, receta y versión, y restaura actuaciones sin consultar el Taller',async()=>{
  const {project,source}=fixture(),before=JSON.stringify(project),archive=await packStudio(project,source,fetcher,[]),checked=await inspectStudioPackage(JSON.parse(JSON.stringify(archive)),source);
  assert.deepEqual(checked.behaviors[0].asset,asset);assert.equal(JSON.stringify(project),before);
  const local=`http://localhost:3000/api/studio-behaviors?id=${id}&sha=${'a'.repeat(64)}`,restored=relinkBehaviors(checked.project,new Map([[archive.behaviors[0].reference.url,local]]));
  validateProject(restored,source);assert(isBehaviorReference({...archive.behaviors[0].reference,url:local}));
  assert.deepEqual(restored.scenes[0].sequences[0].gate,project.scenes[0].sequences[0].gate);
  assert.deepEqual(archive.dependencies.characters,['rachel']);assert.deepEqual(archive.dependencies.scenarios,['aeropuerto-entrada']);
});
test('el paquete rechaza actuaciones ausentes, versiones diferentes y curvas corruptas antes de cambiar el proyecto',async()=>{
  const {project,source}=fixture(),archive=await packStudio(project,source,fetcher,[]);
  await assert.rejects(inspectStudioPackage({...archive,behaviors:[]},source),/todas/);
  const wrong=structuredClone(archive);wrong.behaviors[0].asset.characterId='otro';await assert.rejects(inspectStudioPackage(wrong,source),/versión/);
  const corrupt=structuredClone(asset);corrupt.animation.tracks[0].times=[0,0];assert.throws(()=>validateBehaviorAsset(corrupt),/Curvas/);
  await assert.rejects(packStudio(project,source,(async()=>new Response('',{status:404})) as typeof fetch,[]),/incluir/);
});
test('las grabaciones viajan con huella comprobable y los enlaces externos se declaran como dependencias',async()=>{
  const {project,source}=fixture(),bytes=new Uint8Array([1,2,3]),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  project.scenes[0].sequences[0].cues.push({id:'audio-test',kind:'sound',at:0,duration:1,audioUrl:`studio-audio:${hash}`,volume:.4,label:'Prueba'});
  project.scenes[0].sequences[0].cues.push({id:'external-test',kind:'sound',at:0,duration:1,audioUrl:'/audio/ambiente.mp3',volume:.4,label:'Enlace'});
  const row={id:hash,name:'prueba.wav',kind:'sound' as const,mimeType:'audio/wav',duration:1,bytes:3,createdAt:new Date().toISOString(),blob:new Blob([bytes])};
  await assert.rejects(packStudio(project,source,fetcher,[]),/grabación/);
  const archive=await packStudio(project,source,fetcher,[row]),checked=await inspectStudioPackage(archive,source);
  assert.deepEqual(new Uint8Array(await checked.audio[0].blob.arrayBuffer()),bytes);assert.deepEqual(archive.dependencies.externalAudio,['/audio/ambiente.mp3']);
  archive.audio[0].base64=btoa('bad');await assert.rejects(inspectStudioPackage(archive,source),/dañada/);
});
test('almacenamiento local inmutable: misma versión deduplicada, otra huella no sobrescribe y se verifica al leer',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'studio-portable-'));
  try{const a=await storeLocalBehavior(asset,root),again=await storeLocalBehavior(asset,root),b=await storeLocalBehavior({...asset,name:'Otra variante'},root);assert.deepEqual(a,again);assert.notEqual(a.digest,b.digest);assert.deepEqual(JSON.parse(await readLocalBehavior(a.id,a.digest,root)),asset);assert(await readFile(path.join(root,`${a.id}-${a.digest}.json`)));await assert.rejects(readLocalBehavior('../otro',a.digest,root));}
  finally{await rm(root,{recursive:true,force:true});}
});
