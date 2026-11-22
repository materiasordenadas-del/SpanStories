import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validatePreset,evaluate} from './FacialCore.mjs';
const dir=new URL('./facial-data/',import.meta.url),catalog=JSON.parse(readFileSync(new URL('index.json',dir)));
const ids=new Set(),categories={},errors=[];let keys=0,maxBytes=0;
for(const entry of catalog.clips){
  try {
    if(ids.has(entry.id))throw Error('duplicate id');ids.add(entry.id);
    const bytes=readFileSync(new URL(entry.file,dir));maxBytes=Math.max(maxBytes,bytes.length);
    if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('hash mismatch');
    const p=validatePreset(JSON.parse(bytes));if(p.id!==entry.id)throw Error('id mismatch');
    for(const list of Object.values(p.channels))keys+=list.length;
    const i={id:'audit',presetId:p.id,start:0,duration:p.duration,intensity:1,fadeIn:0,fadeOut:0,trimStart:0,trimEnd:p.duration,priority:0,blend:'override',loop:false};
    for(const t of [0,p.duration*.5,p.duration]){const w=evaluate([p],[i],t);if(Object.values(w).some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('nonfinite playback');}
    categories[p.category]=(categories[p.category]||0)+1;
  }catch(e){errors.push({id:entry.id,error:e.message});}
}
const report={clips:catalog.clips.length,uniqueIds:ids.size,keys,categories,maxClipBytes:maxBytes,indexBytes:readFileSync(new URL('index.json',dir)).length,errors,visualApproval:false};
writeFileSync('D:/Español/output/biblioteca-facial/validacion-catalogo.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(errors.length||ids.size!==14082)process.exitCode=1;
