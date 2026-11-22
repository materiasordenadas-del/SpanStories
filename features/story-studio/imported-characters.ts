import {readFile,writeFile,rename} from 'node:fs/promises';
import {withFileLock} from '../../lib/file-lock.ts';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

export const CHARACTER_MAX_BYTES=100*1024*1024;
export type ImportedCharacter={id:string;label:string;url:string;sha256:string;materialesPropios:true};
const folder=()=>path.join(process.cwd(),'SpanStories-Ciudades/Mundo/Personajes/importados');
export async function readImportedCharacters(directory=folder()):Promise<ImportedCharacter[]>{
  try{const data=JSON.parse(await readFile(path.join(directory,'catalogo.json'),'utf8'));if(data.version!==1||!Array.isArray(data.characters))throw Error('Biblioteca de personajes importados dañada.');return data.characters;}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
}
export function validateCharacterGLB(bytes:Uint8Array){
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(b.length<20||b.length>CHARACTER_MAX_BYTES||b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.readUInt32LE(16)!==0x4e4f534a)throw Error('Selecciona un GLB válido de hasta 100 MB.');
  const length=b.readUInt32LE(12);if(length%4||20+length>b.length)throw Error('GLB truncado.');
  const data=JSON.parse(b.subarray(20,20+length).toString('utf8'));
  if(data.asset?.version!=='2.0'||!data.meshes?.length||!data.scenes?.length)throw Error('El GLB no contiene un modelo visible.');
  for(const resource of [...(data.buffers??[]),...(data.images??[])])if(resource.uri&&!resource.uri.startsWith('data:'))throw Error('El GLB debe incluir sus texturas y recursos.');
  return data;
}
export async function storeImportedCharacter(bytes:Uint8Array,filename:string,directory=folder()){
  if(!/\.glb$/i.test(filename))throw Error('Arrastra archivos .glb.');
  validateCharacterGLB(bytes);
  const sha256=createHash('sha256').update(bytes).digest('hex'),id='importado-'+sha256;
  const label=filename.split(/[\\/]/).at(-1)!.replace(/\.glb$/i,'').trim().slice(0,120)||'Personaje importado';
  // Cerrojo con recuperación: una importación interrumpida no bloquea las siguientes (lib/file-lock.ts).
  const result=await withFileLock(directory,async()=>{
    const characters=await readImportedCharacters(directory),existing=characters.find(c=>c.id===id);if(existing)return existing;
    const character:ImportedCharacter={id,label,url:'./importados/'+sha256+'.glb',sha256,materialesPropios:true};
    try{await writeFile(path.join(directory,sha256+'.glb'),bytes,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
    characters.push(character);
    const temp=path.join(directory,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify({version:1,characters},null,2));await rename(temp,path.join(directory,'catalogo.json'));
    return character;
  },{name:'catalogo.lock'});
  if(result==='busy'||result==='missing')throw Error('Hay otra importación en curso. Vuelve a soltar el archivo cuando termine.');
  return result;
}
