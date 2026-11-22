import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildStudioRehearsal} from '../../features/story-studio/demo.ts';
import {packStudio,inspectStudioPackage,relinkBehaviors} from '../../features/story-studio/portable.ts';
import {createBehaviorLibrary} from '../../SpanStories-Ciudades/engine/StudioBehavior.js';

// Read-only input: an earlier integration test variant, outside the catalog being authored separately.
const file=process.argv[2];if(!file)throw Error('Indica una variante guardada para verificar su transporte sin modificarla.');
const asset=JSON.parse(await fs.readFile(file,'utf8')),{project,source}=buildStudioRehearsal('airport');
assert.equal(asset.characterId,'rachel');
const reference={id:asset.id,name:asset.name,characterId:asset.characterId,duration:asset.duration,review:asset.review,url:`http://127.0.0.1:5189/ecosystem/assets/${asset.id}.json`};
project.scenes[0].sequences[0].cues.push({id:'portable-runtime-check',kind:'actor',actorId:project.scenes[0].actors[0].id,at:0,duration:asset.duration,action:'idle',behavior:reference});
const archive=await packStudio(project,source,async url=>{assert.equal(url,reference.url);return new Response(JSON.stringify(asset));},[]);
const checked=await inspectStudioPackage(JSON.parse(JSON.stringify(archive)),source);
const response=await fetch('http://localhost:3000/api/studio-behaviors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked.behaviors[0].asset)}),saved=await response.json();
assert.equal(response.status,200,JSON.stringify(saved));
const restored=relinkBehaviors(checked.project,new Map([[reference.url,saved.url]])),local=restored.scenes[0].sequences[0].cues.find(c=>c.id==='portable-runtime-check').behavior;
let requests=0;
const library=createBehaviorLibrary(async url=>{requests++;assert(url.startsWith('http://localhost:3000/api/studio-behaviors?'),'No debe consultar el Taller');return fetch(url,{headers:{Origin:'http://127.0.0.1:8877'}});});
const clip=await library.load(local,'rachel');
assert(clip.tracks.some(t=>t.name.endsWith('.morphTargetInfluences')));assert(clip.tracks.some(t=>t.name.endsWith('.quaternion')));assert.equal(requests,1);
const denied=await fetch(saved.url,{headers:{Origin:'https://example.com'}});assert.equal(denied.status,403);
const dir=path.resolve('reports/studio-portability-20261111');await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'ensayo-transporte.studio.json'),JSON.stringify(archive));
const report={at:new Date().toISOString(),input:file,originalUnchanged:JSON.stringify(asset)===JSON.stringify(JSON.parse(await fs.readFile(file,'utf8'))),localURL:saved.url,tracks:clip.tracks.length,morphTracks:clip.tracks.filter(t=>t.name.endsWith('.morphTargetInfluences')).length,tallerRequests:0,corsRejected:denied.status,package:path.join(dir,'ensayo-transporte.studio.json')};
await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
