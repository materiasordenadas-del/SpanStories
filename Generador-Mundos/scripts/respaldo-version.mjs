// Respaldo de fuentes y recursos; nunca copia cachés ni otro respaldo.
import {mkdir,readdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const label=process.argv[2];
if(!label||!/^[a-zA-Z0-9._-]+$/.test(label))throw Error('Uso: npm run respaldo -- <version-sin-espacios>');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const target=join(root,'respaldo','versiones',`${label}-${stamp}`);
await mkdir(dirname(target),{recursive:true});
await mkdir(target); // falla si existe: un respaldo anterior nunca se sobrescribe
const folders=['src','server','public','examples','scripts','tests','docs','reports'];
const files=[];
async function collect(dir){
  for(const entry of await readdir(join(root,dir),{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isSymbolicLink())throw Error(`No se respalda un enlace: ${path}`);
    if(entry.isDirectory())await collect(path);else if(entry.isFile())files.push(path);
  }
}
for(const folder of folders){try{await stat(join(root,folder));}catch(error){if(error.code==='ENOENT')continue;throw error;}await collect(folder);}
for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isFile())files.push(entry.name);
const manifest=[];
for(const path of files.sort()){
  const dest=join(target,path);await mkdir(dirname(dest),{recursive:true});await copyFile(join(root,path),dest);
  const original=await readFile(join(root,path)),copied=await readFile(dest);
  const sha=b=>createHash('sha256').update(b).digest('hex');
  if(sha(original)!==sha(copied))throw Error(`Copia no verificada: ${path}`);
  manifest.push({archivo:path.replaceAll('\\','/'),bytes:original.length,sha256:sha(copied)});
}
await writeFile(join(target,'MANIFIESTO.json'),JSON.stringify({version:label,fecha:new Date().toISOString(),archivos:manifest},null,2));
let state;try{state=await readFile(join(root,'docs','ESTADO.md'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;state='Versión inicial previa a la organización. Cambios y límites: ESTUDIO.md e INFORME_FINAL.md incluidos en este respaldo.';}
try{state+='\n\n'+await readFile(join(root,'docs','LIMITACIONES.md'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(join(target,'VERSION.md'),`# ${label}\n\n${state}\n\nFuentes, recursos e informes verificados con SHA-256 en MANIFIESTO.json.\nNo incluye dependencias instaladas, dist, cachés, temporales ni exportaciones externas al código.\nPara restaurar: recuperar los archivos en otra carpeta y ejecutar npm ci; no sobrescribir trabajo activo sin autorización.\n`);
console.log(JSON.stringify({carpeta:relative(root,target),archivos:manifest.length,bytes:manifest.reduce((s,f)=>s+f.bytes,0),verificacion:'SHA-256 de cada archivo copiado'}));
