import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {Transform} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';
const root=process.cwd(), require=createRequire(path.join(root,'package.json'));
const port=Number(process.env.PORT||3000), nextPort=Number(process.env.AI_NEXT_PORT||3100), workshopPort=Number(process.env.AI_WORKSHOP_PORT||5189);
const children=[];
const {mergeStyleState}=await import(pathToFileURL(path.join(root,'shared-styles/style-pool.js')).href);
const styleFile=path.join(root,'.studio-assets/style-pool.json');
let styleState=fs.existsSync(styleFile)?JSON.parse(fs.readFileSync(styleFile,'utf8')):{revision:-1};
async function styles(req,res){
 try{
  if(req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){res.writeHead(413);return res.end();}}
   styleState={...mergeStyleState(styleState,JSON.parse(body)),revision:styleState.revision+1};fs.mkdirSync(path.dirname(styleFile),{recursive:true});fs.writeFileSync(styleFile,JSON.stringify(styleState));
  }else if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(styleState));
 }catch{res.writeHead(400);res.end('Ajustes inválidos');}
}
function launch(args,cwd=root){const child=spawn(process.execPath,args,{cwd,stdio:'inherit',env:{...process.env,NODE_ENV:'development',SPANSTORIES_NO_DEV_DISK_CACHE:'1'},windowsHide:true});children.push(child);child.on('exit',code=>{if(code)console.error('Subproceso terminado:',code);});return child;}
launch([require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(nextPort)]);
const workshop=path.join(root,'Estudio/Talleres/taller-animacion');
launch([path.join(workshop,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(workshopPort),'--strictPort'],workshop);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function originOf(req){const proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();const host=String(req.headers['x-forwarded-host']||req.headers.host).split(',')[0].trim();return `${proto==='https'?'https':'http'}://${host}`;}
function transform(text,origin){return text.replace(/http:\/\/(?:127\.0\.0\.1|localhost):8877/g,origin+'/motor').replace(/http:\/\/(?:127\.0\.0\.1|localhost):5189/g,origin+'/taller').replace(/http:\/\/(?:127\.0\.0\.1|localhost):3000/g,origin);}
function staticFile(req,res,base,relative,origin){
  const file=path.resolve(base,'.'+relative);
  if(!file.startsWith(path.resolve(base)+path.sep)||relative.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);return res.end();}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Recurso no incluido');}
  const type=mime[path.extname(file)]||'application/octet-stream';
  if(/javascript|text\/|json/.test(type)){const data=Buffer.from(transform(fs.readFileSync(file,'utf8'),origin));res.writeHead(200,{'Content-Type':type,'Content-Length':data.length});return res.end(req.method==='HEAD'?undefined:data);}
  const size=fs.statSync(file).size;const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),size-1):size-1;
  if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
  res.writeHead(match?206:200,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
  if(req.method==='HEAD')return res.end();fs.createReadStream(file,{start,end}).pipe(res);
}
const workshopRoot=/^\/(?:@vite|@id|@fs|src\/|node_modules\/|ecosystem\/|facial\/|bib\/|api\/(?:biblioteca|subir|guardar|fbx|leer|mixamo|ia|kimodo|respaldo-navegador)(?:\/|$))/;
const server=http.createServer((req,res)=>{
 const origin=originOf(req),url=new URL(req.url,origin);
 if(url.pathname.startsWith('/vida-personaje/'))return staticFile(req,res,path.join(workshop,'facial'),decodeURIComponent(url.pathname.slice('/vida-personaje'.length)),origin);
 if(url.pathname==='/api/style-pool')return styles(req,res);
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);return res.end('Origen no permitido');}
 if(['/ecosystem/model','/taller/ecosystem/model'].includes(url.pathname)){
  try{const model=new URL(url.searchParams.get('url'));let rel=model.pathname;
   if(model.origin===origin&&rel.startsWith('/motor/'))rel=rel.slice('/motor'.length);
   else if(!['http://127.0.0.1:8877','http://localhost:8877'].includes(model.origin))throw Error();
   if(model.username||model.password||!rel.endsWith('.glb'))throw Error();
   return staticFile(req,res,path.join(root,'SpanStories-Ciudades'),decodeURIComponent(rel),origin);
  }catch{res.writeHead(400);return res.end('Modelo fuera de la biblioteca');}
 }
 if(url.pathname==='/'){res.writeHead(302,{Location:'/escenarios?modo=editor&zone=colina-don-quijote'});return res.end();}
 if(url.searchParams.get('modo')==='generador'){url.searchParams.set('modo','editor');res.writeHead(302,{Location:url.pathname+url.search});return res.end();}
 if(url.pathname.startsWith('/motor/')){
   const rel=decodeURIComponent(url.pathname.slice('/motor'.length));
   if(rel==='/api/style-pool')return styles(req,res);
   if(rel==='/arboles-atlas/catalogo.json'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"tipos":[]}');}
   if(rel.startsWith('/vida-personaje/'))return staticFile(req,res,path.join(workshop,'facial'),rel.slice('/vida-personaje'.length),origin);
   if(rel.startsWith('/shared-styles/'))return staticFile(req,res,path.join(root,'shared-styles'),rel.slice('/shared-styles'.length),origin);
   if(rel.startsWith('/airport-source/'))return staticFile(req,res,path.join(root,'worlds/prototypes/airport'),rel.slice('/airport-source'.length),origin);
   return staticFile(req,res,path.join(root,'SpanStories-Ciudades'),rel==='/'?'/index.html':rel,origin);
 }
 const isWorkshop=url.pathname.startsWith('/taller/')||workshopRoot.test(url.pathname);
 const targetPort=isWorkshop?workshopPort:nextPort;
 const targetPath=url.pathname.startsWith('/taller/')?req.url.slice('/taller'.length):req.url;
 const headers={...req.headers,host:`127.0.0.1:${targetPort}`,'accept-encoding':'identity'};
 delete headers['x-forwarded-host'];delete headers['x-forwarded-proto'];
 if(headers.origin)headers.origin='http://localhost:3000';
 const upstream=http.request({host:'127.0.0.1',port:targetPort,path:targetPath,method:req.method,headers},response=>{
  const out={...response.headers};delete out['content-security-policy'];delete out['content-length'];delete out['content-encoding'];delete out['transfer-encoding'];
  if(out.location)out.location=transform(out.location,origin);
  if(out['content-type']&&/text\/|javascript|json/.test(out['content-type'])){
   const decoder=new StringDecoder('utf8');let tail='';
   const rewrite=new Transform({transform(chunk,encoding,done){const text=tail+decoder.write(chunk);const cut=Math.max(0,text.length-256);const safe=text.lastIndexOf('http:',cut);const split=safe>=Math.max(0,cut-100)?safe:cut;this.push(transform(text.slice(0,split),origin));tail=text.slice(split);done();},flush(done){this.push(transform(tail+decoder.end(),origin));done();}});
   res.writeHead(response.statusCode,out);response.pipe(rewrite).pipe(res);
  }else{res.writeHead(response.statusCode,out);response.pipe(res);}
 });
 upstream.on('error',()=>{res.writeHead(503,{'Content-Type':'text/plain','Retry-After':'3'});res.end('Iniciando SpanStories. Recarga en unos segundos.');});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
 const vite=String(req.headers['sec-websocket-protocol']||'').includes('vite-hmr');
 const targetPort=vite?workshopPort:nextPort;
 const upstream=net.connect(targetPort,'127.0.0.1',()=>{
  const headers={...req.headers,host:`127.0.0.1:${targetPort}`,origin:`http://127.0.0.1:${targetPort}`};
  upstream.write(`${req.method} ${req.url.replace(/^\/taller\//,'/')} HTTP/1.1\r\n`+Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
  if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
 });upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
});
server.listen(port,'0.0.0.0',()=>console.log(`SpanStories ligero: puerto ${port}. Editor, Estudio y talleres; sin Generador.`));
function stop(){for(const child of children)child.kill();server.close(()=>process.exit());}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
