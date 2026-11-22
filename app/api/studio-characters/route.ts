import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {readImportedCharacters,storeImportedCharacter,CHARACTER_MAX_BYTES} from '@/features/story-studio/imported-characters';
export const runtime='nodejs';
// Catálogo de personajes del visor leído en el propio Estudio: así se puede elegir personaje y abrir los talleres
// sin esperar a que cargue el escenario 3D (el servidor del escenario no permite leerlo desde otro origen).
export async function GET(){
  if(process.env.NODE_ENV!=='development')return new Response(null,{status:403});
  try{
    const file=path.join(process.cwd(),'SpanStories-Ciudades','Mundo','Personajes','personajes.json');
    const data=JSON.parse(await readFile(file,'utf8')) as {characters?:{id:string;label:string;url?:string}[]};
    const base='http://127.0.0.1:8877/Mundo/Personajes/personajes.json';
    const characters=[...(data.characters??[]),...await readImportedCharacters()].map(c=>({id:c.id,label:c.label,modelUrl:c.url?new URL(c.url,base).href:null}));
    return Response.json({characters},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Catálogo de personajes no disponible.'},{status:500});}
}

export async function POST(request:Request){
  if(process.env.NODE_ENV!=='development')return Response.json({error:'Importación disponible en el Estudio local.'},{status:403});
  const origin=request.headers.get('origin');if(origin&&!['http://localhost:3000','http://127.0.0.1:3000'].includes(origin))return Response.json({error:'Origen no permitido.'},{status:403});
  try{
    const reader=request.body?.getReader();if(!reader)throw Error('No se recibió el personaje.');
    const parts:Uint8Array[]=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>CHARACTER_MAX_BYTES){await reader.cancel();return Response.json({error:'El personaje supera 100 MB.'},{status:413});}parts.push(value);}
    const character=await storeImportedCharacter(Buffer.concat(parts),new URL(request.url).searchParams.get('name')??'');
    return Response.json({character,modelUrl:new URL(character.url,'http://127.0.0.1:8877/Mundo/Personajes/personajes.json').href});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo importar el personaje.'},{status:400});}
}
