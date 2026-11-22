import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {withFileLock} from '../../../lib/file-lock.ts';

// Biblioteca de objetos del Editor de escenarios: cada GLB se registra UNA vez (por SHA-256) y luego se colocan
// todas las copias que haga falta. Vive en SpanStories-Ciudades/Mundo/Biblioteca/ (catalogo.json + <sha>.glb + <sha>.png).
export const runtime='nodejs';
const root=path.join(process.cwd(),'SpanStories-Ciudades/Mundo/Biblioteca');
const allowed=new Set(['http://127.0.0.1:8877','http://localhost:8877','http://localhost:3000','http://127.0.0.1:3000']);
const CATEGORIAS=['arquitectura','naturaleza','mobiliario','decoracion','vehiculos','estructuras','mis-modelos'];
const MAX_GLB=100*1024*1024;
type Entrada={sha:string,nombre:string,categoria:string,favorito:boolean,triangulos:number,dimensiones:number[],bytes:number,creado:string,miniatura:boolean};
function headers(req:Request){return {'Access-Control-Allow-Origin':allowed.has(req.headers.get('origin')??'')?req.headers.get('origin')!:'http://localhost:3000','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store','Vary':'Origin'};}
const reply=(req:Request,data:unknown,status=200)=>Response.json(data,{status,headers:headers(req)});
async function readJson(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
const SHA=/^[a-f0-9]{64}$/;
function validarGlb(bytes:Buffer){
  if(bytes.length<20||bytes.length>MAX_GLB||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('GLB inválido.');
  const length=bytes.readUInt32LE(12);if(length%4||20+length>bytes.length)throw Error('GLB truncado.');
  const gltf=JSON.parse(bytes.subarray(20,20+length).toString());
  if(gltf.asset?.version!=='2.0'||gltf.animations?.length||[...(gltf.buffers??[]),...(gltf.images??[])].some((a:{uri?:string})=>a.uri&&!a.uri.startsWith('data:')))throw Error('Se necesita un GLB estático autocontenido.');
}
async function catalogo():Promise<{version:number,objetos:Entrada[]}>{const c=await readJson(path.join(root,'catalogo.json'));return c&&Array.isArray(c.objetos)?c:{version:1,objetos:[]};}
async function guardarCatalogo(c:unknown){const temp=path.join(root,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(c,null,1));await rename(temp,path.join(root,'catalogo.json'));}

export async function OPTIONS(req:Request){return new Response(null,{status:204,headers:headers(req)});}
export async function GET(req:Request){
  try{
    const q=new URL(req.url).searchParams;
    const sha=q.get('glb')??q.get('miniatura');
    if(sha){
      if(!SHA.test(sha))throw Error('Identificador inválido.');
      const miniatura=q.has('miniatura'),file=path.join(root,sha+(miniatura?'.png':'.glb'));
      let bytes:Buffer;try{bytes=await readFile(file);}catch{return reply(req,{error:'No existe en la biblioteca.'},404);}
      return new Response(new Uint8Array(bytes),{status:200,headers:{...headers(req),'Content-Type':miniatura?'image/png':'model/gltf-binary','Cache-Control':'public, max-age=31536000, immutable'}});
    }
    return reply(req,{...await catalogo(),categorias:CATEGORIAS});
  }catch(e){return reply(req,{error:(e as Error).message},400);}
}
export async function POST(req:Request){
  if(process.env.NODE_ENV!=='development'||!allowed.has(req.headers.get('origin')??new URL(req.url).origin))return reply(req,{error:'Guardado local no permitido.'},403);
  try{
    const text=await req.text();if(Buffer.byteLength(text)>150*1024*1024)throw Error('Petición mayor de 150 MB.');
    const body=JSON.parse(text);
    await mkdir(root,{recursive:true});
    const result=await withFileLock(root,async()=>{
      const c=await catalogo();
      if(body.accion==='registrar'){
        if(typeof body.glbBase64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.glbBase64))throw Error('GLB inválido.');
        const bytes=Buffer.from(body.glbBase64,'base64');validarGlb(bytes);
        const sha=createHash('sha256').update(bytes).digest('hex');
        let entrada=c.objetos.find(o=>o.sha===sha);const nuevo=!entrada;
        if(!entrada){
          const nombre=String(body.nombre??'Objeto').replace(/\.glb$/i,'').trim().slice(0,120)||'Objeto';
          const categoria=CATEGORIAS.includes(body.categoria)?body.categoria:'mis-modelos';
          const dims=Array.isArray(body.dimensiones)?body.dimensiones.slice(0,3).map(Number).filter(Number.isFinite):[];
          entrada={sha,nombre,categoria,favorito:false,triangulos:Math.max(0,Math.round(Number(body.triangulos)||0)),dimensiones:dims.length===3?dims:[0,0,0],bytes:bytes.length,creado:new Date().toISOString(),miniatura:false};
          await writeFile(path.join(root,sha+'.glb'),bytes,{flag:'wx'}).catch(e=>{if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;});
          c.objetos.push(entrada);
        }
        if(typeof body.miniaturaPng==='string'&&!entrada.miniatura&&/^[A-Za-z0-9+/]*={0,2}$/.test(body.miniaturaPng)&&body.miniaturaPng.length<600000){
          await writeFile(path.join(root,sha+'.png'),Buffer.from(body.miniaturaPng,'base64'));entrada.miniatura=true;
        }
        await guardarCatalogo(c);return {entrada,nuevo};
      }
      const entrada=c.objetos.find(o=>o.sha===body.sha);if(!entrada)throw Error('Objeto desconocido.');
      if(body.accion==='favorito')entrada.favorito=!!body.valor;
      else if(body.accion==='categoria'){if(!CATEGORIAS.includes(body.valor))throw Error('Categoría inválida.');entrada.categoria=body.valor;}
      else if(body.accion==='renombrar')entrada.nombre=String(body.valor??'').trim().slice(0,120)||entrada.nombre;
      else if(body.accion==='quitar')c.objetos=c.objetos.filter(o=>o!==entrada);   // el GLB queda en disco: los proyectos que lo usan no se rompen
      else throw Error('Acción desconocida.');
      await guardarCatalogo(c);return {entrada};
    });
    if(result==='busy'||result==='missing')return reply(req,{error:'La biblioteca está ocupada. Reintenta.'},409);
    return reply(req,result);
  }catch(e){return reply(req,{error:(e as Error).message},400);}
}
