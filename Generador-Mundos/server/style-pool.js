import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mergeStyleState} from '../src/estudio/render/style-pool.js';
export const STYLE_FILE=resolve(import.meta.dirname,'../.style-pool/settings.json');
export async function readStyles(file=STYLE_FILE){try{return mergeStyleState(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code==='ENOENT')return mergeStyleState();throw e;}}
export async function writeStyles(patch,file=STYLE_FILE){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Ajustes inválidos');
  const lock=file+'.lock';await mkdir(resolve(file,'..'),{recursive:true});
  let acquired=false;
  for(let i=0;i<100;i++){try{await mkdir(lock);acquired=true;break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,30));}}
  if(!acquired)throw Error('Pool ocupado; reintentar');
  const temp=file+'.'+process.pid+'.tmp';
  try{const state=mergeStyleState(await readStyles(file),patch);state.revision++;await writeFile(temp,JSON.stringify(state));await rename(temp,file);return state;}
  finally{await rm(temp,{force:true});await rm(lock,{recursive:true,force:true});}
}
export function stylePoolAPI(){return {name:'spanstories-style-pool',configureServer:install,configurePreviewServer:install};}
function install(server){server.middlewares.use('/api/style-pool',async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try{
    const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host){res.statusCode=403;res.end('{}');return;}
    if(req.method==='GET')res.end(JSON.stringify(await readStyles()));
    else if(req.method==='POST'){let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>8192)throw Error('Solicitud demasiado grande');}res.end(JSON.stringify(await writeStyles(JSON.parse(body))));}
    else{res.statusCode=405;res.end('{}');}
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{let body='';for await(const chunk of process.stdin)body+=chunk;process.stdout.write(JSON.stringify(await writeStyles(JSON.parse(body))));}
  catch(e){process.stderr.write(e.message);process.exitCode=1;}
}
