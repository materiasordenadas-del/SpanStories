import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';
export async function GET(){
  if(process.env.NODE_ENV!=='development')return Response.json({places:[]});
  try{
    const catalog=JSON.parse(await readFile(path.join(process.cwd(),'SpanStories-Ciudades/Mundo/Generados/catalogo.json'),'utf8'));
    return Response.json({places:catalog.places.map((p:{id:string;label:string;revision:string;history:{revision:string}[]})=>({id:p.id,label:p.label,revision:p.revision,history:p.history.map(h=>h.revision),versions:p.history.length}))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return Response.json({places:[]});return Response.json({error:'No se pudo leer la biblioteca de lugares'},{status:500});}
}
