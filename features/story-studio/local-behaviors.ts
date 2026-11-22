import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateBehaviorAsset} from './behavior.ts';

export const LOCAL_BEHAVIOR_ROOT=path.join(process.cwd(),'.studio-assets','behaviors');
export async function storeLocalBehavior(raw:unknown,root=LOCAL_BEHAVIOR_ROOT){
  validateBehaviorAsset(raw);
  const json=JSON.stringify(raw);
  if(Buffer.byteLength(json)>16*1024*1024)throw Error('Actuación demasiado grande.');
  const digest=createHash('sha256').update(json).digest('hex');
  await mkdir(root,{recursive:true});
  try{await writeFile(path.join(root,`${raw.id}-${digest}.json`),json,{flag:'wx'});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const previous=await readLocalBehavior(raw.id,digest,root);if(previous!==json)throw Error('El recurso local no coincide con su huella.');}
  return {id:raw.id,digest};
}
export async function readLocalBehavior(id:string,digest:string,root=LOCAL_BEHAVIOR_ROOT){
  if(!/^[a-f0-9-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(digest))throw Error('Recurso local no válido.');
  const json=await readFile(path.join(root,`${id}-${digest}.json`),'utf8');
  if(createHash('sha256').update(json).digest('hex')!==digest)throw Error('Recurso local dañado.');
  return json;
}
