import {readFile, writeFile, rename} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {withFileLock} from '../../../lib/file-lock.ts';

export const runtime='nodejs';
const root=path.join(process.cwd(),'SpanStories-Ciudades/Mundo/Ediciones');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const allowed=new Set(['http://127.0.0.1:8877','http://localhost:8877','http://localhost:3000','http://127.0.0.1:3000']);
function headers(req:Request){return {'Access-Control-Allow-Origin':allowed.has(req.headers.get('origin')??'')?req.headers.get('origin')!:'http://localhost:3000','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store','Vary':'Origin'};}
function reply(req:Request,data:unknown,status=200){return Response.json(data,{status,headers:headers(req)});}
async function read(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
function glb(base64:unknown){
  if(typeof base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('GLB importado inválido.');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<20||bytes.length>100*1024*1024||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('GLB inválido.');
  const length=bytes.readUInt32LE(12);if(length%4||20+length>bytes.length)throw Error('GLB truncado.');
  const gltf=JSON.parse(bytes.subarray(20,20+length).toString());
  if(gltf.asset?.version!=='2.0'||gltf.animations?.length||[...(gltf.buffers??[]),...(gltf.images??[])].some((a:{uri?:string})=>a.uri&&!a.uri.startsWith('data:')))throw Error('Se necesita un GLB estático autocontenido.');
}
const isObject=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v);
// v1: {overrides, imports con glbBase64}. v2: añade `escenario` (capas, grupos, ambiente, variantes…) y `recursos` únicos por SHA-256.
function validate(project:Record<string,unknown>){
  const version=project?.version;
  if((version!==1&&version!==2)||typeof project.cityId!=='string'||!project.cityId||project.cityId.length>250||!Array.isArray(project.overrides)||!Array.isArray(project.imports))throw Error('Proyecto inválido.');
  const ids=new Set<string>(),imports=new Set<string>(),resources=new Map<string,boolean>();
  function object(value:Record<string,unknown>){
    if(!value||typeof value.id!=='string'||!value.id||ids.has(value.id)||typeof value.etiqueta!=='string'||!value.etiqueta.trim())throw Error('Identidad inválida o duplicada.');
    ids.add(value.id);
    for(const key of ['position','rotation','scale'])if(!Array.isArray(value[key])||(value[key] as unknown[]).length!==3||!(value[key] as unknown[]).every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('Transformación inválida.');
    if((value.scale as number[]).includes(0)||value.rotationOrder&&!['XYZ','YZX','ZXY','XZY','YXZ','ZYX'].includes(value.rotationOrder as string))throw Error('Escala o rotación inválida.');
  }
  if(version===2){
    const e=project.escenario as Record<string,unknown>;
    if(!isObject(e)||!['capas','grupos','variantes','camaras','marcadores'].every(k=>Array.isArray(e[k]))||!isObject(e.objetos)||(e.ambiente!==null&&!isObject(e.ambiente)))throw Error('Sección «escenario» inválida.');
    if(JSON.stringify(e).length>24*1024*1024)throw Error('La parte nueva del escenario supera 24 MB.');
    if(!Array.isArray(project.recursos))throw Error('Faltan los recursos GLB.');
    for(const r of project.recursos as Record<string,unknown>[]){
      if(typeof r?.sha!=='string'||!/^[a-f0-9]{64}$/.test(r.sha)||resources.has(r.sha))throw Error('Recurso GLB inválido o duplicado.');
      glb(r.glbBase64);resources.set(r.sha,true);
    }
  }
  (project.overrides as Record<string,unknown>[]).forEach(object);
  for(const record of project.imports as Record<string,unknown>[]){
    if(typeof record.id!=='string'||imports.has(record.id)||typeof record.filename!=='string'||!Array.isArray(record.nodes)||!record.nodes.length)throw Error('GLB importado inválido.');
    imports.add(record.id);
    if(version===1)glb(record.glbBase64);
    else if(typeof record.recurso!=='string'||!resources.has(record.recurso))throw Error('Un objeto añadido apunta a un recurso GLB ausente.');
    for(const node of record.nodes as {state:Record<string,unknown>,meta?:{id?:unknown},key:unknown}[]){object(node.state);if(node.state.id!==node.meta?.id||typeof node.key!=='string')throw Error('Nodo importado inválido.');}
  }
}
export async function OPTIONS(req:Request){return new Response(null,{status:204,headers:headers(req)});}
export async function GET(req:Request){
  try{
    const q=new URL(req.url).searchParams;
    if(q.has('zone')){
      const zone=q.get('zone')!;
      const catalog=await read(path.join(process.cwd(),'SpanStories-Ciudades/Mundo/Generados/catalogo.json'));
      const baseRevision=catalog?.places.find((p:{id:string})=>p.id===zone)?.revision??null;
      const cityId=baseRevision?`atlas:${zone}:${baseRevision}`:zone;
      const head=await read(path.join(root,hash(cityId),'actual.json'));
      return reply(req,{cityId,baseRevision,revision:head?.revision??'base'});
    }
    const city=q.get('city');if(!city||city.length>250)throw Error('Ciudad inválida.');
    const dir=path.join(root,hash(city)),rev=q.get('revision');
    if(rev&&!/^[a-f0-9]{64}$/.test(rev))throw Error('Revisión inválida.');
    const head=rev?{revision:rev}:await read(path.join(dir,q.has('recovery')?'recuperacion.json':'actual.json'));
    if(!head)return reply(req,{project:null,revision:null});
    if(!/^[a-f0-9]{64}$/.test(head.revision))throw Error('Índice de revisiones dañado.');
    const saved=await read(path.join(dir,head.revision+'.json'));
    if(!saved)throw Error('No se encuentra la revisión guardada.');
    validate(saved.project);
    if(saved.project.cityId!==city||saved.revision!==head.revision||hash(JSON.stringify(saved.project))!==head.revision)throw Error('La revisión guardada está dañada.');
    return reply(req,saved);
  }catch(e){return reply(req,{error:(e as Error).message},400);}
}
export async function POST(req:Request){
  if(process.env.NODE_ENV!=='development'||!allowed.has(req.headers.get('origin')??new URL(req.url).origin))return reply(req,{error:'Guardado local no permitido.'},403);
  try{
    if(Number(req.headers.get('content-length'))>160*1024*1024)throw Error('Proyecto mayor de 160 MB.');
    const text=await req.text();if(Buffer.byteLength(text)>160*1024*1024)throw Error('Proyecto mayor de 160 MB.');
    const {project,expectedRevision,recovery}=JSON.parse(text);validate(project);
    const dir=path.join(root,hash(project.cityId));
    // Un archivo exclusivo actúa como cerrojo entre pestañas/procesos (con recuperación si un proceso murió a medio guardar).
    // Nunca se sobrescribe una revisión.
    const result=await withFileLock(dir,async()=>{
      const head=await read(path.join(dir,'actual.json'));
      if(!recovery&&(head?.revision??null)!==(expectedRevision??null))return reply(req,{error:'Existe una revisión más reciente en disco. Exporta tu trabajo y vuelve a abrir el proyecto antes de guardar.'},409);
      const revision=hash(JSON.stringify(project));
      const saved={revision,savedAt:new Date().toISOString(),project};
      if(!await read(path.join(dir,revision+'.json')))await writeFile(path.join(dir,revision+'.json'),JSON.stringify(saved),{flag:'wx'});
      const temp=path.join(dir,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify({revision}));await rename(temp,path.join(dir,recovery?'recuperacion.json':'actual.json'));
      return reply(req,{revision,savedAt:saved.savedAt,directory:`SpanStories-Ciudades/Mundo/Ediciones/${hash(project.cityId)}`});
    });
    if(result==='busy'||result==='missing')return reply(req,{error:'Otro guardado está en curso. Reintenta.'},409);
    return result;
  }catch(e){return reply(req,{error:(e as Error).message},400);}
}
