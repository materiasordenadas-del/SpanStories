import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';

/**
 * Escenarios de servicios (restaurante, farmacia, banco…): prototipos HTML de `worlds/prototypes/<id>/`.
 * Se sirven en el mismo origen del visor (3000) para verlos desde el selector «Lugar» del Editor,
 * sin abrir otro servidor ni otro puerto. Solo en desarrollo.
 */
const PLACES=new Set(['bank','cafe','shop','pharmacy','bus-stop','restaurant','hotel','hostel']);
const TYPES:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.ktx2':'image/ktx2','.hdr':'application/octet-stream','.woff2':'font/woff2'};

export async function GET(_request:Request,{params}:{params:Promise<{path:string[]}>}){
  if(process.env.NODE_ENV!=='development')return new Response('No encontrado',{status:404});
  const [id,...rest]=(await params).path;
  if(!id||!PLACES.has(id))return new Response('No encontrado',{status:404});
  const root=path.resolve(process.cwd(),'worlds/prototypes',id);
  const file=path.resolve(root,...(rest.length?rest:['index.html']));
  if(!file.startsWith(root+path.sep))return new Response('No encontrado',{status:404});
  const type=TYPES[path.extname(file).toLowerCase()];
  if(!type)return new Response('No encontrado',{status:404});
  try{return new Response(new Uint8Array(await readFile(file)),{headers:{'Content-Type':type,'Cache-Control':'no-cache'}});}
  catch{return new Response('No encontrado',{status:404});}
}
