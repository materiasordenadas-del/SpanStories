import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {get} from 'node:http';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const entry='http://localhost:3000/escenarios';

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
// Antes, si una pieza se cerraba (p. ej. el Generador o el motor por un error puntual), este lanzador cerraba
// TODAS las demás y el visor «se caía» entero. Ahora cada pieza se vuelve a arrancar sola, con espera creciente;
// solo Ctrl+C (o 6 caídas en 2 minutos de la misma pieza) detiene el conjunto.
function start(command,args,cwd,environment={},name=path.basename(cwd)){
  // El lanzador de Python para Windows necesita cmd; estos argumentos son constantes internas.
  const windowsPython=process.platform==='win32'&&command==='python';
  const crashes=[];
  const launch=()=>{
    if(stopping)return;
    const child=spawn(windowsPython?(process.env.ComSpec||'cmd.exe'):command,windowsPython?['/d','/s','/c',[command,...args].join(' ')]:args,{cwd,env:{...process.env,...environment},stdio:'inherit',windowsHide:true});
    children.add(child);
    child.on('error',error=>console.error(`[${name}] ${error.message}`));
    child.on('exit',code=>{
      children.delete(child);
      if(stopping)return;
      const now=Date.now();crashes.push(now);while(crashes.length&&now-crashes[0]>120000)crashes.shift();
      if(crashes.length>=6){console.error(`[${name}] se cerró ${crashes.length} veces en 2 minutos (código ${code}). Se detiene el lanzador.`);stop(1);return;}
      const wait=Math.min(1000*2**(crashes.length-1),15000);
      console.error(`[${name}] se cerró (código ${code}). Se vuelve a arrancar en ${wait/1000} s…`);
      setTimeout(launch,wait);
    });
  };
  launch();
}
const children=new Set();
let stopping=false;
function stop(code=0){
  if(stopping)return;
  stopping=true;
  // En Windows, kill() solo cierra el proceso directo (p. ej. cmd.exe) y dejaba vivo a sus hijos (serve.py en 8877):
  // se cierra el árbol completo de cada pieza que inició este lanzador, y solo esas.
  for(const child of children){
    if(process.platform==='win32'&&child.pid)spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    else child.kill();
  }
  process.exitCode=code;
}
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
try{
  // No sustituir ni cerrar procesos que no haya iniciado este comando.
  // Lanzador único: visor/editor/Estudio (3000) + motor (8877) + Taller y Taller facial (5189) + Generador (5179).
  // Con --solo-visor arranca solo 3000 y 8877.
  const all=!process.argv.includes('--solo-visor');
  const workshopDir=path.join(root,'Estudio','Talleres','taller-animacion'),generatorDir=path.join(root,'Generador-Mundos');
  const [engine,app,workshop,generator]=await Promise.all([
    response('http://127.0.0.1:8877/main.js'),response(entry),
    all?response('http://127.0.0.1:5189/'):null,all?response('http://127.0.0.1:5179/'):null,
  ]);
  if(workshop&&(!workshop.ok||!workshop.text.includes('Taller de Animaci')))
    throw Error('El puerto 5189 está ocupado por otra aplicación. No se ha cerrado ni reemplazado.');
  if(generator&&(!generator.ok||!generator.text.includes('Atlas')))
    throw Error('El puerto 5179 está ocupado por otra aplicación. No se ha cerrado ni reemplazado.');
  if(all&&!workshop)start(process.execPath,[path.join(workshopDir,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1','--port','5189','--strictPort'],workshopDir,{},'Taller');
  if(all&&!generator)start(process.execPath,[path.join(generatorDir,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1','--port','5179','--strictPort'],generatorDir,{},'Generador');
  if(engine&&(!engine.ok||!engine.text.includes('LexicoMontaje')))
    throw Error('El puerto 8877 está ocupado por otro visor. No se ha cerrado ni reemplazado.');
  if(app&&(!app.ok||!app.text.includes('<title>Visor de escenarios</title>')))
    throw Error('El puerto 3000 está ocupado por otra aplicación. No se ha cerrado ni reemplazado.');
  if(!engine)start('python',['serve.py','--port','8877','--root','.','--profile','none','--embedded-only'],path.join(root,'SpanStories-Ciudades'),{},'Motor 8877');
  // La caché persistente de Turbopack falla al abrirse bajo los permisos de Windows
  // de este proyecto. El visor conserva su caché en memoria y la misma entrada.
  if(!app)start(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3000'],root,{SPANSTORIES_NO_DEV_DISK_CACHE:'1',NODE_OPTIONS:[process.env.NODE_OPTIONS,'--max-old-space-size=6144'].filter(Boolean).join(' ')},'Visor 3000');
  console.log(`\nVisor de escenarios: ${entry}\nEditor de escenarios: ${entry}?modo=editor · Estudio: ${entry}?modo=estudio`+(all?`\nTaller: http://127.0.0.1:5189/ · Generador de mundos: http://127.0.0.1:5179/`:'')+'\n');
}catch(error){console.error(error.message);stop(1);}
