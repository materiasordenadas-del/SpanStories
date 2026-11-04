import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compressGlb} from '../server/meshopt.js';
const base=new URL('../public/assets/kits-escaparate/',import.meta.url),path=new URL('kit.json',base),manifest=JSON.parse(await readFile(path,'utf8'));manifest.runtime={};
for(const [role,source]of [['fachada',manifest.archivo],['interior',manifest.archivo_interior]]){const input=await readFile(new URL(source.nombre,base)),result=await compressGlb(input),nombre=source.nombre.replace('.glb','.meshopt.glb');await writeFile(new URL(nombre,base),result.bytes);manifest.runtime[role]={nombre,bytes:result.bytes.byteLength,sha256:createHash('sha256').update(result.bytes).digest('hex'),compression:result.compression};console.log(JSON.stringify({role,antes:input.byteLength,despues:result.bytes.byteLength}));}
await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
