import {storeLocalBehavior,readLocalBehavior} from '@/features/story-studio/local-behaviors';
export const runtime='nodejs';
export async function GET(request:Request){
  if(process.env.NODE_ENV!=='development')return new Response(null,{status:403});
  const origin=request.headers.get('origin');
  if(origin&&!['http://localhost:3000','http://127.0.0.1:3000','http://localhost:8877','http://127.0.0.1:8877'].includes(origin))return new Response(null,{status:403});
  try{const params=new URL(request.url).searchParams;return new Response(await readLocalBehavior(params.get('id')??'',params.get('sha')??''),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=31536000, immutable',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});}
  catch{return Response.json({error:'Actuación local no disponible o dañada.'},{status:404});}
}
export async function POST(request:Request){
  if(process.env.NODE_ENV!=='development')return Response.json({error:'Importación local disponible solo en desarrollo.'},{status:403});
  const origin=request.headers.get('origin');
  if(origin&&!['http://localhost:3000','http://127.0.0.1:3000'].includes(origin))return Response.json({error:'Origen no permitido.'},{status:403});
  try{
    const reader=request.body?.getReader();if(!reader)throw Error('Falta la actuación.');
    const parts:Uint8Array[]=[];let length=0;
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>16*1024*1024){await reader.cancel();return Response.json({error:'Actuación demasiado grande.'},{status:413});}parts.push(value);}
    const raw=JSON.parse(Buffer.concat(parts).toString('utf8')),saved=await storeLocalBehavior(raw);
    return Response.json({url:`${new URL(request.url).origin}/api/studio-behaviors?id=${saved.id}&sha=${saved.digest}`});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'No se pudo importar la actuación.'},{status:400});}
}
