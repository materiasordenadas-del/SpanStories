import {validateProject,sequenceList,type StudioProject,type StudioSource} from './model.ts';
import {validateBehaviorAsset,behaviorFetchUrl,type BehaviorAsset,type BehaviorReference} from './behavior.ts';
import {localAudioId,type StudioAudioAsset} from './browser-media.ts';

type PackedAudio=Omit<StudioAudioAsset,'blob'>&{base64:string};
export type StudioPackage={schema:'spanstories.studio-package';version:1;project:StudioProject;behaviors:{reference:BehaviorReference;asset:BehaviorAsset}[];audio:PackedAudio[];dependencies:{characters:string[];scenarios:string[];externalAudio:string[]}};
const cues=(project:StudioProject)=>sequenceList(project).flatMap(x=>x.sequence.cues);
const audioURLs=(project:StudioProject)=>cues(project).flatMap(c=>c.kind==='sound'||c.kind==='dialogue'&&c.audioUrl?[c.audioUrl!]:[]);
const references=(project:StudioProject)=>[...new Map(cues(project).flatMap(c=>c.kind==='actor'&&c.behavior?[[c.behavior.url,c.behavior] as const]:[])).values()];
export async function packStudio(project:StudioProject,source:StudioSource,fetcher:typeof fetch,audio:readonly StudioAudioAsset[]):Promise<StudioPackage>{
  validateProject(project,source);
  if(references(project).length>200)throw Error('El paquete admite hasta 200 versiones de actuación distintas.');
  let resourceBytes=0;
  const behaviors=[];
  for(const reference of references(project)){
    const response=await fetcher(behaviorFetchUrl(reference));if(!response.ok)throw Error('No se pudo incluir la actuación «'+reference.name+'». Abre su biblioteca y vuelve a exportar.');
    const asset:unknown=await response.json();validateBehaviorAsset(asset,reference);const bytes=new TextEncoder().encode(JSON.stringify(asset)).length;
    if(bytes>16*1024*1024||(resourceBytes+=bytes)>96*1024*1024)throw Error('Los recursos superan el tamaño admitido por el paquete.');
    behaviors.push({reference:structuredClone(reference),asset});
  }
  const packed:PackedAudio[]=[];
  for(const id of new Set(audioURLs(project).map(localAudioId).filter((id):id is string=>!!id))){
    const asset=audio.find(a=>a.id===id);if(!asset)throw Error('Falta una grabación de la historia. No se exportó un paquete incompleto.');
    const bytes=new Uint8Array(await asset.blob.arrayBuffer());if((resourceBytes+=bytes.length)>96*1024*1024)throw Error('Los recursos superan el tamaño admitido por el paquete.');let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    const {blob:_,...meta}=asset;packed.push({...meta,base64:btoa(binary)});
  }
  return {schema:'spanstories.studio-package',version:1,project:structuredClone(project),behaviors,audio:packed,dependencies:{characters:[...new Set(project.scenes.flatMap(s=>s.actors.map(a=>a.characterId)))],scenarios:[...new Set(project.scenes.map(s=>s.zoneId))],externalAudio:[...new Set(audioURLs(project).filter(url=>!localAudioId(url)))]}};
}
/** Preflight the complete package before writing any resource or changing the current draft. */
export async function inspectStudioPackage(raw:unknown,source:StudioSource){
  // «Exportar puesta en escena (.json)» escribe el proyecto solo, sin recursos: se acepta si no los necesita.
  const bare=!!raw&&typeof raw==='object'&&!('schema' in raw)&&Array.isArray((raw as {scenes?:unknown}).scenes);
  if(bare){
    const project=raw as StudioProject;
    if(references(project).length||audioURLs(project).some(url=>localAudioId(url)))throw Error('Este archivo es solo la puesta en escena: usa actuaciones o grabaciones que no incluye. Expórtalo con «Exportar o importar paquete…» para llevarlo completo.');
  }
  const p=(bare?{schema:'spanstories.studio-package',version:1,project:raw,behaviors:[],audio:[]}:raw) as StudioPackage;
  if(!p||p.schema!=='spanstories.studio-package'||p.version!==1||!Array.isArray(p.behaviors)||p.behaviors.length>200||!Array.isArray(p.audio)||p.audio.length>200)throw Error('Paquete de puesta en escena no válido.');
  validateProject(p.project,source);
  const wanted=references(p.project),found=new Set<string>();let resourceBytes=0;
  for(const entry of p.behaviors){
    const reference=wanted.find(r=>r.url===entry.reference?.url);if(!reference||found.has(reference.url))throw Error('Recursos de actuación duplicados o ajenos a la historia.');
    validateBehaviorAsset(entry.asset,reference);const size=new TextEncoder().encode(JSON.stringify(entry.asset)).length;if(size>16*1024*1024||(resourceBytes+=size)>96*1024*1024)throw Error('Los recursos superan el tamaño admitido por el paquete.');found.add(reference.url);
  }
  if(wanted.length!==found.size)throw Error('El paquete no contiene todas las actuaciones.');
  const wantedAudio=new Set(audioURLs(p.project).map(localAudioId).filter(Boolean)),seen=new Set<string>(),audio:StudioAudioAsset[]=[];let total=0;
  for(const entry of p.audio){
    if(!entry||!wantedAudio.has(entry.id)||seen.has(entry.id)||typeof entry.base64!=='string'||entry.base64.length>90*1024*1024||!Number.isFinite(entry.duration)||entry.duration<=0||entry.duration>3600||typeof entry.name!=='string'||!entry.name.trim()||!['voice','sound'].includes(entry.kind)||typeof entry.mimeType!=='string'||(entry.mimeType&&!entry.mimeType.startsWith('audio/'))||!Number.isFinite(Date.parse(entry.createdAt)))throw Error('Grabación importada inválida.');
    const bytes=Uint8Array.from(atob(entry.base64),c=>c.charCodeAt(0));total+=bytes.length;resourceBytes+=bytes.length;
    if(bytes.length!==entry.bytes||!bytes.length||bytes.length>64*1024*1024||total>96*1024*1024||resourceBytes>96*1024*1024)throw Error('Tamaño de audio importado inválido.');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==entry.id)throw Error('La grabación del paquete está dañada.');
    const {base64:_,...meta}=entry;audio.push({...meta,blob:new Blob([bytes],{type:entry.mimeType})});seen.add(entry.id);
  }
  if(wantedAudio.size!==seen.size)throw Error('Faltan grabaciones en el paquete.');
  return {project:structuredClone(p.project),behaviors:p.behaviors,audio};
}
export function relinkBehaviors(project:StudioProject,urls:ReadonlyMap<string,string>){
  const copy=structuredClone(project);
  for(const cue of cues(copy))if(cue.kind==='actor'&&cue.behavior){const url=urls.get(cue.behavior.url);if(!url)throw Error('No se pudo restaurar una actuación.');cue.behavior={...cue.behavior,url};}
  return copy;
}
