import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { get } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const localOrigins = new Set(['http://localhost:3000','http://127.0.0.1:3000','http://127.0.0.1:8877','http://localhost:8877']);
export function ecosystemMiddleware(root) {
  const threeRoot=path.dirname(path.dirname(createRequire(path.join(root,'package.json')).resolve('three')));
  const facial = path.resolve(root, 'facial');
  const library = path.join(root, 'biblioteca/comportamientos');
  // Revisiones anteriores de una actuación reemplazada en su sitio: inmutables (`<id>.r<N>.json`). Fuera del regex de
  // `GET /ecosystem/library`, así que no aparecen en listados. Las limpia /api/historias (las que ninguna historia usa).
  const revisions = path.join(library, '_revisiones');
  const revisionFile = (id, n) => path.join(revisions, `${id}.r${n}.json`);
  const archiveRevision = (file, old) => {
    fs.mkdirSync(revisions, { recursive: true });
    const dest = revisionFile(old.id, Number(old.revision) || 0);
    try { fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL); }
    catch (error) { if (error.code === 'EEXIST') return; throw error; }
    // La fecha del archivo es la de archivarla (no la de la revisión): el margen de limpieza cuenta desde aquí.
    const now = new Date(); fs.utimesSync(dest, now, now);
  };
  // Personajes declarados en perfiles-personaje.json: se sirven desde la carpeta de modelos del estudio, sin copiarlos.
  const profiles = () => { try { return JSON.parse(fs.readFileSync(path.join(facial,'perfiles-personaje.json'),'utf8')).personajes||{}; } catch { return {}; } };
  const registryFile=path.resolve(root,'../../../SpanStories-Ciudades/Mundo/Personajes/personajes.json');
  const registered=()=>{try{return JSON.parse(fs.readFileSync(registryFile,'utf8')).characters||[];}catch{return [];}};
  const profileGlb = id => {
    if(!/^[a-z0-9_-]+$/i.test(id))return null;
    const p=profiles()[id],entry=registered().find(c=>c.id===id);
    const file=p?.glb?path.resolve(facial,p.glb):entry?.url?path.resolve(path.dirname(registryFile),entry.url):null;
    return file&&file.toLowerCase().endsWith('.glb')&&fs.existsSync(file)?file:null;
  };
  const reply = (res, data, code=200) => { res.statusCode=code; res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data)); };
  return async (req,res,next) => {
    const url = new URL(req.url,'http://127.0.0.1:5189');
    // Taller facial: parte del Estudio (solo se abre dentro de él). Archivos tal cual, sin Vite, para que
    // comparta la misma copia de three.js (mapa de importación) que los módulos de /ecosystem/body/.
    if (url.pathname==='/facial'||url.pathname.startsWith('/facial/')) {
      if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;return res.end();}
      // Solo como dependencia del Estudio: la página (no sus módulos) se entrega únicamente dentro de un marco (iframe)
      // y con una sesión del taller. Abierta directamente en una pestaña se rechaza.
      if(/^\/facial(\/(index\.html)?)?$/.test(url.pathname)&&(req.headers['sec-fetch-dest']!=='iframe'||!/^[\w-]{8,}$/.test(url.searchParams.get('workshopSession')||''))){
        res.statusCode=403;res.setHeader('Content-Type','text/html; charset=utf-8');
        return res.end('<!doctype html><meta charset="utf-8"><title>Taller facial</title><body style="font:15px system-ui;background:#1c2530;color:#e4eef8;padding:32px"><h1>El Taller facial es parte del Estudio</h1><p>No se abre por separado. Entra desde <b>Estudio › Taller facial</b> con el personaje de la escena.</p>');
      }
      const rel=decodeURIComponent(url.pathname.slice('/facial'.length))||'/',file=path.resolve(facial,'.'+(rel.endsWith('/')?rel+'index.html':rel));
      if((file!==facial&&!file.startsWith(facial+path.sep))||/[\\/](__pycache__|licenses)[\\/]|\.(py|pyc)$/i.test(file)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end('No encontrado');}
      const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
      res.setHeader('Content-Type',types[path.extname(file).toLowerCase()]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');
      res.setHeader('Content-Security-Policy',"frame-ancestors 'self' http://localhost:3000 http://127.0.0.1:3000");
      return fs.createReadStream(file).pipe(res);
    }
    if (!url.pathname.startsWith('/ecosystem/')) return next();
    const origin=req.headers.origin;
    if (origin && origin!=='http://127.0.0.1:5189' && !localOrigins.has(origin)) return reply(res,{error:'Origen no permitido'},403);
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.statusCode=204;return res.end();}
    try {
      if(url.pathname==='/ecosystem/full-skinning.js'&&req.method==='GET'){
        const file=path.resolve(root,'../../../SpanStories-Ciudades/engine/FullSkinning.js');
        res.setHeader('Content-Type','application/javascript; charset=utf-8');res.setHeader('Cache-Control','no-cache');
        return fs.createReadStream(file).pipe(res);
      }
      if(url.pathname==='/ecosystem/catalog'&&req.method==='GET')return reply(res,JSON.parse(fs.readFileSync(path.join(root,'public/comportamientos/catalogo.json'),'utf8')));
      // Datos por personaje (estilo, física, cuerpo…): lo que cambia de un modelo a otro, sin código propio.
      if(url.pathname==='/ecosystem/profiles'&&req.method==='GET')return reply(res,profiles());
      if(url.pathname==='/ecosystem/characters'&&req.method==='GET'){
        const entries={...Object.fromEntries(registered().map(c=>[c.id,{nombre:c.label}])),...profiles()};
        // Real size from the world registry (the GLB keeps its own units): alturaM, alturaCruzM.
        const sizes=Object.fromEntries(registered().map(c=>[c.id,{alturaM:c.alturaM,alturaCruzM:c.alturaCruzM}]));
        const items=Object.entries(entries).filter(([id])=>profileGlb(id)).map(([id,p])=>({id,name:p.nombre||id,style:p.estilo,...sizes[id],url:`http://127.0.0.1:5189/ecosystem/characters/${id}.glb`}));const base=path.join(root,'biblioteca/personajes');
        function scan(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(entry.name.toLowerCase().endsWith('.glb')){const relative=path.relative(path.join(root,'biblioteca'),file).split(path.sep).join('/');items.push({id:'lib:'+relative,name:entry.name.replace(/\.glb$/i,''),url:'http://127.0.0.1:5189/bib/local/'+relative.split('/').map(encodeURIComponent).join('/')});}}}scan(base);return reply(res,{items});
      }
      const own=url.pathname.match(/^\/ecosystem\/characters\/([a-z0-9_-]+)\.glb$/i);
      if(own&&req.method==='GET'){
        const file=profileGlb(own[1]);if(!file)return reply(res,{error:'Personaje desconocido'},404);
        res.setHeader('Content-Type','model/gltf-binary');return fs.createReadStream(file).pipe(res);
      }
      // Taller facial · modo General. Correcciones para todos (solo diferencias con el original) y calibración de cada
      // personaje (fuerza de shape keys y mapa de canales). En disco, en biblioteca/facial/: Git guarda la historia.
      const facialData=path.join(root,'biblioteca/facial');
      const readBody=async(limit=4*1024*1024)=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Datos demasiado grandes');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
      const atomicWrite=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,data);fs.renameSync(temp,file);};
      if(url.pathname==='/ecosystem/correcciones-faciales'){
        const file=path.join(facialData,'correcciones.json'),C=await import(pathToFileURL(path.join(facial,'CorreccionesFaciales.mjs')).href);
        const current=()=>fs.existsSync(file)?C.validarCorrecciones(JSON.parse(fs.readFileSync(file,'utf8'))):C.vacias();
        res.setHeader('Cache-Control','no-store');
        if(req.method==='GET')return reply(res,current());
        if(req.method==='POST'){
          // {expectedRevision, items:{<id>: {tipo, parche} | null}}: null = «Restaurar original».
          const body=await readBody(),doc=current();
          if(body.expectedRevision!==doc.revision)return reply(res,{error:'Otra ventana guardó correcciones antes. Vuelve a cargar y repite el cambio.',revision:doc.revision},409);
          if(!body.items||typeof body.items!=='object')throw Error('Faltan las correcciones.');
          const guardado=new Date().toISOString();
          for(const [id,item] of Object.entries(body.items)){if(item===null)delete doc.items[id];else doc.items[id]={tipo:item.tipo,parche:item.parche,guardado};}
          doc.revision++;C.validarCorrecciones(doc);atomicWrite(file,JSON.stringify(doc,null,1));
          return reply(res,doc);
        }
      }
      const calibration=url.pathname.match(/^\/ecosystem\/calibracion-facial\/([\w.:-]{1,120})$/);
      if(calibration){
        const file=path.join(facialData,'calibraciones',calibration[1].replace(/[^\w.-]/g,'_')+'.json');
        res.setHeader('Cache-Control','no-store');
        if(req.method==='GET')return reply(res,fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{});
        if(req.method==='POST'){
          const body=await readBody(256*1024),{validateGain}=await import(pathToFileURL(path.join(facial,'FacialCore.mjs')).href);
          const out={personaje:calibration[1],guardado:new Date().toISOString()};
          if(body.rigGain&&Object.keys(body.rigGain).length)out.rigGain=validateGain(body.rigGain);
          if(body.rigMap!==undefined&&body.rigMap!==null){if(typeof body.rigMap!=='object'||Array.isArray(body.rigMap)||Object.entries(body.rigMap).some(([k,v])=>typeof k!=='string'||typeof v!=='string'||k.length>80||v.length>160))throw Error('Mapa de canales no válido.');if(Object.keys(body.rigMap).length)out.rigMap=body.rigMap;}
          atomicWrite(file,JSON.stringify(out,null,1));return reply(res,out);
        }
      }
      if(url.pathname.startsWith('/ecosystem/facial/')) {
        const name=url.pathname.slice('/ecosystem/facial/'.length);
        if(!['FacialCore.mjs','FacialMovement.mjs','FacialPresets.mjs','FacialRigAdapter.mjs','ActingLibrary.mjs','CorreccionesFaciales.mjs'].includes(name))return reply(res,{error:'Módulo desconocido'},404);
        res.setHeader('Content-Type','application/javascript; charset=utf-8');return fs.createReadStream(path.join(facial,name)).pipe(res);
      }
      // Raw modules retain bare `three` imports, resolved by the receiving editor's
      // import map; do not load a second Three.js instance from Vite's dependency cache.
      // Cargador FBX de three.js (y sus dos dependencias, sin copiarlas): lo usa el Taller facial para leer en el
      // navegador un clip de biblioteca/paquetes (facial/CuerpoBiblioteca.mjs). Sus `import 'three'` los resuelve
      // el mapa de importación del Taller facial, igual que los módulos de /ecosystem/body/.
      if(url.pathname.startsWith('/ecosystem/vendor/')&&req.method==='GET'){
        const name=url.pathname.slice('/ecosystem/vendor/'.length);
        if(!['loaders/FBXLoader.js','libs/fflate.module.js','curves/NURBSCurve.js','curves/NURBSUtils.js'].includes(name))return reply(res,{error:'Módulo de terceros desconocido'},404);
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        const fuente=fs.readFileSync(path.join(threeRoot,'examples/jsm',name),'utf8');
        // Los FBX de «Conversations Michael 8» (Daz) traen curvas de animación sin padre de modelo y el FBXLoader original se cae
        // al leerlas (`[0].ID` de undefined). Con `?.` esas curvas sueltas se ignoran (ya hay un aviso «unused curve») y las de los huesos se leen igual.
        return res.end(name==='loaders/FBXLoader.js'?fuente.replaceAll(')[ 0 ].ID;',')[ 0 ]?.ID;'):fuente);
      }
      if(url.pathname.startsWith('/ecosystem/body/')){
        const name=url.pathname.slice('/ecosystem/body/'.length);
        if(!['rig.js','humanoid.js','quadruped.js','clip.js','ik.js','acting.js','skinfix.js','accessories.js','bodyprofile.js','horse-editor.js','horse-motion.js'].includes(name))return reply(res,{error:'Módulo corporal desconocido'},404);
        res.setHeader('Content-Type','application/javascript; charset=utf-8');return fs.createReadStream(path.join(root,'src/core',name)).pipe(res);
      }
      if(url.pathname==='/ecosystem/model'){
        const source=new URL(url.searchParams.get('url'));
        const permitted=['http://127.0.0.1:8877','http://localhost:8877'].includes(source.origin)||(source.origin==='http://127.0.0.1:5189'&&(source.pathname.startsWith('/bib/')||/^\/ecosystem\/characters\/[a-z0-9_-]+\.glb$/i.test(source.pathname)));
        if(!permitted||source.username||source.password||!source.pathname.endsWith('.glb'))return reply(res,{error:'Modelo fuera de las bibliotecas locales'},400);
        const buffer=await new Promise((resolve,reject)=>{
          const request=get(source,response=>{
            if(response.statusCode!==200){response.resume();reject(Error('El visor no pudo servir el personaje.'));return;}
            const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>256*1024*1024){response.destroy(Error('Modelo demasiado grande.'));return;}chunks.push(chunk);});
            response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks)));
          });request.setTimeout(60000,()=>request.destroy(Error('El personaje no respondió a tiempo.')));request.on('error',reject);
        });
        res.setHeader('Content-Type','model/gltf-binary');return res.end(buffer);
      }
      if(url.pathname==='/ecosystem/library' && req.method==='GET') {
        const items=fs.existsSync(library)?fs.readdirSync(library).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>{try{const d=JSON.parse(fs.readFileSync(path.join(library,n),'utf8'));return {id:d.id,name:d.name,characterId:d.characterId,duration:d.duration,review:d.review,url:`/ecosystem/assets/${n}`};}catch{return null;}}).filter(Boolean):[];
        return reply(res,{items});
      }
      if(url.pathname==='/ecosystem/library' && req.method==='POST') {
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)return reply(res,{error:'Actuación demasiado grande'},413);chunks.push(chunk);}
        const d=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(d.schema!=='spanstories.behavior'||d.version!==1||typeof d.name!=='string'||!d.name.trim()||d.name.length>160||typeof d.characterId!=='string'||!Number.isFinite(d.duration)||d.duration<=0||d.duration>600||!Array.isArray(d.animation?.tracks)||!d.animation.tracks.length||!d.recipe)throw Error('Actuación incompleta.');
        // «Modificación en historia»: la actuación propia de una historia (owner = historia:personaje:escena:papel:acción)
        // se reemplaza en su sitio, mismo id y archivo, con revisión nueva. Así corregir no deja duplicados. Una
        // actuación sin dueño o de otro dueño (biblioteca, otra historia) no se toca: se crea la copia propia una vez.
        const owner=typeof d.owner==='string'&&d.owner.length<=300?d.owner:null;if(!owner)delete d.owner;
        // Clave de dueño anterior a que existiera el cue (sin cueId): permite reemplazar la actuación que ese cue ya usa.
        const ownerAlias=typeof d.ownerAlias==='string'&&d.ownerAlias.length<=300?d.ownerAlias:null;delete d.ownerAlias;
        if(typeof d.replace==='string'){
          const target=d.replace;delete d.replace;
          if(!/^[a-f0-9-]{36}$/.test(target))throw Error('Actuación a reemplazar no válida.');
          const file=path.join(library,target+'.json');
          // Corrección general (Taller facial › General › «Actualizar»): la actuación corregida reemplaza a la de
          // siempre, sea de quien sea; conserva su dueño.
          const general=d.correccionGeneral===true;delete d.correccionGeneral;
          if((owner||general)&&fs.existsSync(file)){
            const old=JSON.parse(fs.readFileSync(file,'utf8'));
            if(general&&old.characterId===d.characterId){if(old.owner)d.owner=old.owner;else delete d.owner;}
            if((general&&old.characterId===d.characterId)||(owner&&(old.owner===owner||(ownerAlias&&old.owner===ownerAlias)))){
              d.id=target;d.review={status:'unreviewed'};d.createdAt=old.createdAt||new Date().toISOString();d.updatedAt=new Date().toISOString();d.revision=(Number(old.revision)||0)+1;
              // La revisión que sale se conserva: una historia guardada puede seguir apuntando a ella.
              archiveRevision(file,{...old,id:target});
              atomicWrite(file,JSON.stringify(d));
              return reply(res,{id:d.id,name:d.name,duration:d.duration,characterId:d.characterId,review:d.review,revision:d.revision,url:`http://127.0.0.1:5189/ecosystem/assets/${d.id}.json`});
            }
          }
        }
        delete d.replace;
        d.id=randomUUID();d.review={status:'unreviewed'};d.createdAt=new Date().toISOString();d.revision=0;
        fs.mkdirSync(library,{recursive:true});fs.writeFileSync(path.join(library,d.id+'.json'),JSON.stringify(d),{flag:'wx'});
        return reply(res,{id:d.id,name:d.name,duration:d.duration,characterId:d.characterId,review:d.review,revision:0,url:`http://127.0.0.1:5189/ecosystem/assets/${d.id}.json`});
      }
      const match=url.pathname.match(/^\/ecosystem\/assets\/([a-f0-9-]{36}\.json)$/);
      if(match&&req.method==='GET') {
        const file=path.join(library,match[1]);if(!fs.existsSync(file))return reply(res,{error:'No existe esta versión'},404);
        // Una actuación de historia puede reemplazarse en su sitio: nunca de caché.
        res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
        // ?revision=N: la revisión que la historia guardó (la cabeza, o la archivada al reemplazarla).
        const wanted=url.searchParams.get('revision');
        if(wanted!==null){
          if(!/^\d{1,9}$/.test(wanted))return reply(res,{error:'Revisión no válida'},400);
          const headRevision=Number(JSON.parse(fs.readFileSync(file,'utf8')).revision)||0;
          if(Number(wanted)!==headRevision){
            const archived=revisionFile(match[1].slice(0,-5),Number(wanted));
            if(!fs.existsSync(archived))return reply(res,{error:'Esa revisión de la actuación ya no está archivada',headRevision},404);
            return fs.createReadStream(archived).pipe(res);
          }
        }
        return fs.createReadStream(file).pipe(res);
      }
      return reply(res,{error:'Recurso desconocido'},404);
    } catch(error) { return reply(res,{error:error.message},400); }
  };
}
