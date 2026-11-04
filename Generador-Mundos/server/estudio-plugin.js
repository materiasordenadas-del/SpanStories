// API local del Estudio de lugares: guarda capturas y exportaciones dentro del proyecto
// (todo en D:, nunca en el disco del sistema) y sirve el contexto lejano de la ciudad.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {FarCityService} from './far-city.js';
import {GeoService} from './geo-service.js';
import {boundsAround} from '../src/geo/projection.js';
import {AutomaticReferences} from './automatic-references.js';
import {VisorLibrary} from './visor-library.js';

const MAX_BODY=192*1024*1024;
const safeName=name=>String(name??'captura').normalize('NFKD').replace(/[^\w.-]+/g,'-').replace(/^[.-]+|[.-]+$/g,'').slice(0,80)||'captura';

async function readBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Error('Solicitud demasiado grande');chunks.push(chunk);}
  return Buffer.concat(chunks);
}

export function estudioAPI(){
  let far,geo,references;
  const install=server=>{
    const root=server.config.root,outDir=resolve(root,'reports','estudio');
    const library=new VisorLibrary({generatorRoot:root});
    far??=new FarCityService({cacheDir:join(root,'.geo-cache','far')});
    geo??=new GeoService({cacheDir:join(root,'.geo-cache')});
    references??=new AutomaticReferences({cacheDir:join(root,'.geo-cache','references')});
    server.middlewares.use('/api/estudio',async(req,res)=>{
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      try{
        const url=new URL(req.url,'http://localhost');
        let result;
        if(url.pathname.startsWith('/visor/')){
          const origin=req.headers.origin;
          if(origin&&!['http://127.0.0.1:5179','http://localhost:5179'].includes(origin))throw Error('Origen no permitido');
          if(url.pathname==='/visor/lugares'&&req.method==='GET')result=await library.catalog();
          else if(url.pathname==='/visor/proyecto'&&req.method==='GET')result=await library.project(url.searchParams.get('id'),{version:url.searchParams.get('revision')});
          else if(url.pathname==='/visor/enviar'&&req.method==='POST')result=await library.publish(JSON.parse((await readBody(req)).toString()));
          else throw Error('Operación del visor no válida');
        }else if(url.pathname==='/referencias'&&req.method==='POST'){
          const data=JSON.parse((await readBody(req)).toString());result=await references.lookup(data.ids);
        }else if(url.pathname==='/captura'&&req.method==='POST'){
          // Cuerpo: PNG binario. Nombre en la consulta.
          const bytes=await readBody(req);
          if(bytes.length<8||bytes.readUInt32BE(0)!==0x89504e47)throw Error('Se esperaba un PNG');
          await mkdir(outDir,{recursive:true});
          const file=join(outDir,safeName(url.searchParams.get('nombre'))+'.png');
          await writeFile(file,bytes);
          result={archivo:file,bytes:bytes.length};
        }else if(url.pathname==='/archivo'&&req.method==='POST'){
          // Exportaciones (GLB/JSON) guardadas en reports/estudio para poder revisarlas.
          const bytes=await readBody(req),name=safeName(url.searchParams.get('nombre')),ext=(url.searchParams.get('ext')||'bin').replace(/[^a-z0-9]/gi,'').slice(0,5);
          await mkdir(outDir,{recursive:true});
          const file=join(outDir,name+'.'+ext);
          await writeFile(file,bytes);
          result={archivo:file,bytes:bytes.length};
        }else if(url.pathname==='/iniciar-exportacion'&&req.method==='POST'){
          const data=JSON.parse((await readBody(req)).toString()),carpeta=safeName(data.name).slice(0,44)+'-'+new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+randomUUID().slice(0,8);
          await mkdir(join(root,'exportaciones'),{recursive:true});await mkdir(join(root,'exportaciones',carpeta));result={carpeta};
        }else if(url.pathname==='/receptor'&&req.method==='GET'){
          res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(join(root,'src','estudio','export','package-loader.js')));return;
        }else if(url.pathname==='/exportar'&&req.method==='POST'){
          // Paquete para SpanStories: exportaciones/<carpeta>/<nombre>.<ext> (dentro del proyecto, en D:)
          let bytes=await readBody(req);const rawBytes=bytes.length,dir=join(root,'exportaciones',safeName(url.searchParams.get('carpeta'))),name=safeName(url.searchParams.get('nombre')),ext=(url.searchParams.get('ext')||'bin').replace(/[^a-z0-9]/gi,'').slice(0,5);
          await mkdir(dir,{recursive:true});
          const file=join(dir,name+'.'+ext);
          let compression='none';if(ext==='glb'&&url.searchParams.get('meshopt')==='1'){const optimized=await (await import('./meshopt.js')).compressGlb(bytes);bytes=optimized.bytes;compression=optimized.compression;}
          await writeFile(file,bytes,{flag:'wx'});
          result={archivo:file,bytes:bytes.length,rawBytes,compression,sha256:createHash('sha256').update(bytes).digest('hex')};
        }else if(url.pathname==='/lejano'&&req.method==='GET'){
          const n=k=>Number(url.searchParams.get(k));
          result=await far.city({lat:n('lat'),lon:n('lon'),radius:n('radio'),inner:n('interior')});
        }else if(url.pathname==='/relieve'&&req.method==='GET'){
          // Relieve de baja resolución para el entorno lejano (hasta 9 km de lado).
          const n=k=>Number(url.searchParams.get(k)),size=Math.min(9000,Math.max(500,n('lado')||4000));
          const b=boundsAround(n('lat'),n('lon'),size,size);
          result=await geo.elevation(b,97);
        }else{res.statusCode=404;res.end(JSON.stringify({error:'Ruta no encontrada'}));return;}
        res.end(JSON.stringify(result));
      }catch(error){res.statusCode=502;res.end(JSON.stringify({error:error.message}));}
    });
  };
  return {name:'atlas-estudio-api',configureServer:install,configurePreviewServer:install};
}
