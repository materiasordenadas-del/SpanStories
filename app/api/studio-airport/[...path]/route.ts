import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
  if(process.env.NODE_ENV!=='development')return new Response('No encontrado',{status:404});
  const parts=(await params).path;
  const root=path.resolve(process.cwd(),'worlds/prototypes/airport');
  const file=path.resolve(root,...parts);
  if(!file.startsWith(root+path.sep)||!['engine','vendor','assets','Modelos'].includes(parts[0]))return new Response('No encontrado',{status:404});
  const extension=path.extname(file).toLowerCase();
  const types:Record<string,string>={'.js':'text/javascript; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm'};
  if(!types[extension])return new Response('No encontrado',{status:404});
  try{return new Response(new Uint8Array(await readFile(file)),{headers:{'Content-Type':types[extension],'Access-Control-Allow-Origin':'http://127.0.0.1:8877','Cache-Control':'no-cache'}});}
  catch{return new Response('No encontrado',{status:404});}
}
