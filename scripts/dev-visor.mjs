import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {get} from 'node:http';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const entry='http://localhost:3000/mundo/piloto-lexico';
const children=[];
function response(url){
  return new Promise((resolve,reject)=>{
    const request=get(url,result=>{
      let text='';
      result.setEncoding('utf8');
      result.on('data',chunk=>{text+=chunk;});
      result.on('end',()=>resolve({ok:result.statusCode===200,text}));
      result.on('error',reject);
    });
    request.setTimeout(20000,()=>request.destroy(new Error('El servidor local no respondió a tiempo.')));
    request.on('error',error=>error.code==='ECONNREFUSED'?resolve(null):reject(error));
  });
}
function start(command,args,cwd,environment={}){
  // El lanzador de Python para Windows necesita cmd; estos argumentos son constantes internas.
  const windowsPython=process.platform==='win32'&&command==='python';
  const child=spawn(windowsPython?(process.env.ComSpec||'cmd.exe'):command,windowsPython?['/d','/s','/c',[command,...args].join(' ')]:args,{cwd,env:{...process.env,...environment},stdio:'inherit',windowsHide:true});
  children.push(child);
  child.on('error',error=>{console.error(error.message);stop(1);});
  child.on('exit',code=>stop(code??0));
}
let stopping=false;
function stop(code=0){
  if(stopping)return;
  stopping=true;
  for(const child of children)child.kill();
  process.exitCode=code;
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
try{
  // No sustituir ni cerrar procesos que no haya iniciado este comando.
  const [engine,app]=await Promise.all([
    response('http://127.0.0.1:8877/main.js'),response(entry),
  ]);
  if(engine&&(!engine.ok||!engine.text.includes('LexicoMontaje')))
    throw Error('El puerto 8877 está ocupado por otro visor. No se ha cerrado ni reemplazado.');
  if(app&&(!app.ok||!app.text.includes('Barcelona · Piloto de vocabulario')))
    throw Error('El puerto 3000 está ocupado por otra aplicación. No se ha cerrado ni reemplazado.');
  if(!engine)start('python',['serve.py','--port','8877','--root','.','--profile','none','--embedded-only'],path.join(root,'SpanStories-Ciudades'));
  // La caché persistente de Turbopack falla al abrirse bajo los permisos de Windows
  // de este proyecto. El visor conserva su caché en memoria y la misma entrada.
  if(!app)start(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3000'],root,{SPANSTORIES_NO_DEV_DISK_CACHE:'1'});
  console.log(`\nEntrada única del visor: ${entry}\nDesarrollo y Visor Web se cambian dentro de esa página.\n`);
}catch(error){console.error(error.message);stop(1);}
