import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {crearNavegacionCuadricula,validarNavegacion} from '../engine/vida/Navegacion.js';
import {grabarAmbiente} from '../engine/vida/Grabador.js';
import {claveConfiguracion,lineasActivas,muestrearPista,validarAmbienteReproducible,validarConfiguracion,validarGrabacion} from '../engine/vida/Ambiente.js';
import {crearIdentidad,crearAzar} from '../engine/vida/Identidades.js';
import {decidir} from '../engine/vida/Decision.js';
import {crearReproductorVida} from '../engine/vida/Reproductor.js';
import {createStoryStudioBridge,validStudioStage} from '../engine/StoryStudioBridge.js';

// Plaza de 40 m con un quiosco (caja) en el centro.
const quiosco={bounds:{min:[-2,0,-2],max:[2,3,2]}};
const navegacion=()=>crearNavegacionCuadricula({centro:[0,0,0],radio:20,ground:()=>0,colliders:()=>[quiosco]});
const cafeteria=(extra={})=>({version:1,seed:7,duration:60,radius:20,
  cast:[{id:'m',roleId:'mesero',characterId:'samuel',height:1.75},{id:'c1',roleId:'cliente',characterId:'samuel',height:1.7},{id:'c2',roleId:'cliente',characterId:'samuel',height:1.65},{id:'t',roleId:'turista',characterId:'samuel',height:1.8}],
  points:[{id:'barra',kind:'atender',position:[6,0,6],rotation:Math.PI,slots:1},{id:'pedido',kind:'pedir',position:[6,0,4.6],rotation:0,slots:1},
    {id:'banco',kind:'sentarse',position:[-6,0,6],rotation:0,slots:2},{id:'charla',kind:'conversar',position:[-6,0,-6],rotation:0,slots:2},{id:'escaparate',kind:'mirar',position:[8,0,-8],rotation:Math.PI/2,slots:2}],...extra});

test('la cuadrícula cumple la interfaz y rodea obstáculos',()=>{
  const nav=validarNavegacion(navegacion());
  assert.equal(nav.esTransitable(0,0),false);assert.equal(nav.esTransitable(8,8),true);
  const ruta=nav.buscarRuta([-6,0,0],[6,0,0]);
  assert(ruta.length>=3,'la ruta debe esquivar el quiosco');
  for(let i=1;i<ruta.length;i++)for(let s=0;s<=10;s++){const t=s/10,x=ruta[i-1][0]+(ruta[i][0]-ruta[i-1][0])*t,z=ruta[i-1][2]+(ruta[i][2]-ruta[i-1][2])*t;assert(!(Math.abs(x)<2&&Math.abs(z)<2),'el tramo cruza el quiosco');}
  assert.deepEqual(nav.puntoCercano([0,0,0]).length,3);
  assert.throws(()=>validarNavegacion({}),/no implementa/);
});

test('la identidad cambia la decisión: el mesero no actúa como el turista',()=>{
  const puntos=cafeteria().points,ocupacion={get:()=>null},atendidos=()=>true;
  const elegir=roleId=>{const azar=crearAzar(3),identidad=crearIdentidad({id:roleId,roleId},azar),npc={id:roleId,posicion:[6,0,6],recientes:[],puestoId:roleId==='mesero'?'barra':undefined};
    const cuenta={};for(let i=0;i<200;i++){const o=decidir({identidad,npc,puntos,ocupacion,atendidos},azar);const k=o.punto?.kind??'pasear';cuenta[k]=(cuenta[k]||0)+1;}return cuenta;};
  const mesero=elegir('mesero'),turista=elegir('turista');
  assert(mesero.atender>150,'el mesero vuelve a su puesto');assert(!mesero.mirar&&!mesero.sentarse);
  assert(!turista.atender);assert(turista.mirar>0);
});

test('la grabación es determinista, cierra el bucle y genera diálogos A1',()=>{
  const a=cafeteria(),r1=grabarAmbiente({ambiente:a,zoneId:'zona',centro:[0,0,0],navegacion:navegacion()});
  const r2=grabarAmbiente({ambiente:a,zoneId:'zona',centro:[0,0,0],navegacion:navegacion()});
  assert.deepEqual(r1,r2);
  assert.equal(r1.configKey,claveConfiguracion(a));
  assert(validarGrabacion(r1,{zoneId:'zona',cast:a.cast}));
  assert(validarAmbienteReproducible({cast:a.cast,recording:r1},'zona'));
  assert(!validarAmbienteReproducible({cast:a.cast,recording:r1},'otra-zona'));
  assert(r1.loop>=60);
  for(const pista of r1.tracks){
    const inicio=muestrearPista(pista,r1.loop,0),fin=muestrearPista(pista,r1.loop,r1.loop-1e-6);
    assert(Math.hypot(inicio.x-fin.x,inicio.z-fin.z)<.05,'el NPC termina donde empezó');
    // Nadie atraviesa el quiosco.
    for(let t=0;t<r1.loop;t+=.25){const p=muestrearPista(pista,r1.loop,t);assert(!(Math.abs(p.x)<1.9&&Math.abs(p.z)<1.9),`${pista.npcId} dentro del quiosco en ${t}`);}
  }
  assert(r1.lines.length>0,'hay frases para observar y escuchar');
  assert(r1.lines.some(l=>l.npcId==='m'),'el mesero responde a los clientes');
  const l=r1.lines[0];assert.deepEqual(lineasActivas(r1.lines,r1.loop,l.at+.01).map(x=>x.id).includes(l.id),true);
  assert.notDeepEqual(grabarAmbiente({ambiente:{...a,seed:8},zoneId:'zona',centro:[0,0,0],navegacion:navegacion()}).tracks,r1.tracks);
});

test('avisos explícitos: puntos inaccesibles, puesto vacío y animaciones ausentes',()=>{
  const a=cafeteria({cast:[{id:'c',roleId:'cliente',characterId:'samuel',height:1.7}],points:[{id:'p',kind:'pedir',position:[6,0,4],rotation:0,slots:1},{id:'q',kind:'sentarse',position:[0,0,0],rotation:0,slots:1}]});
  const r=grabarAmbiente({ambiente:a,zoneId:'zona',centro:[0,0,0],navegacion:navegacion(),clipsPorPersonaje:{samuel:['Walking','restpose']}});
  assert(r.warnings.some(w=>/nadie atiende/.test(w)));
  assert(r.warnings.some(w=>/fuera del área caminable/.test(w)));
  const conBoca=grabarAmbiente({ambiente:cafeteria(),zoneId:'zona',centro:[0,0,0],navegacion:navegacion(),clipsPorPersonaje:{samuel:['Walking','restpose','Samuel_Juan_Facial_Mouth']}});
  assert(!conBoca.warnings.some(w=>/hablar/.test(w)),'la boca facial cubre «hablar»');
  assert(conBoca.warnings.some(w=>/sentarse/.test(w)));
  assert(validarConfiguracion(a));assert(!validarConfiguracion({...a,cast:[{id:'x',roleId:'pirata',characterId:'s',height:1.7}]}));
});

test('el reproductor respeta el presupuesto de NPC y no depende del ritmo de fotogramas',async()=>{
  const a=cafeteria(),r=grabarAmbiente({ambiente:a,zoneId:'zona',centro:[0,0,0],navegacion:navegacion()});
  const plantilla={scene:new T.Group().add(new T.Mesh(new T.BoxGeometry(.5,1.7,.3))),animations:[]};
  const scene=new T.Scene(),camera=new T.PerspectiveCamera();camera.position.set(0,2,0);
  const vida=crearReproductorVida({scene,camera,cargarPersonaje:async()=>plantilla,perfil:()=>({nearNPC:1,backgroundNPC:1})});
  await vida.montar({cast:a.cast,recording:r});
  vida.actualizar(12.3);
  assert.equal(vida.raices().filter(x=>x.visible).length,2);
  const pos=vida.raices().map(x=>x.position.toArray());
  for(let i=0;i<5;i++)vida.actualizar(3+i);vida.actualizar(12.3);
  assert.deepEqual(vida.raices().map(x=>x.position.toArray()),pos);
  vida.actualizar(12.3+r.loop);
  vida.raices().forEach((x,i)=>assert(x.position.distanceTo(new T.Vector3(...pos[i]))<1e-6));
  vida.desmontar();assert.equal(scene.children.length,0);
});

test('el puente valida el tiempo de escena y rechaza ambientes de otro escenario',async()=>{
  const stage={sceneId:'scene',sequenceId:'sequence',zoneId:'zone',time:0,shot:{position:[1,2,3],target:[1,2,10],fov:42,transition:0},actors:[],performances:[],entryIds:[]};
  assert(validStudioStage({...stage,sceneTime:4},'zone'));assert(!validStudioStage({...stage,sceneTime:-1},'zone'));
  const listeners=new Map(),messages=[],parent={postMessage:m=>messages.push(m)};
  const win={parent,location:{ancestorOrigins:['http://localhost:3000']},document:{referrer:''},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setInterval:()=>1,clearInterval:()=>{}};
  const canvas={addEventListener(){},removeEventListener(){},setPointerCapture(){}};
  const bridge=await createStoryStudioBridge({scene:new T.Scene(),camera:new T.PerspectiveCamera(),target:new T.Vector3(),renderer:{domElement:canvas},assets:{records:new Map()},style:{},zone:{id:'zone',manifestUrl:'http://localhost/zone.json'},manifest:{sectors:[]},world:{world:{manifestUrl:'http://localhost/Mundo/mundo.json'}},ground:()=>0,loadNearby:async()=>[],navigation:{setEditorEnabled(){}},lexico:{mapa:{entries:[]},interaccion:{cerrar(){},habilitar(){}}},pinned:new Set(),win,fetcher:async()=>({ok:true,url:'http://localhost/Mundo/Personajes/personajes.json',json:async()=>({characters:[]})})});
  const a=cafeteria(),r=grabarAmbiente({ambiente:a,zoneId:'otra',centro:[0,0,0],navegacion:navegacion()});
  await listeners.get('message')({origin:'http://localhost:3000',source:parent,data:{channel:'spanstories.studio',version:1,type:'LIFE',sceneId:'scene',life:{cast:a.cast,recording:r}}});
  assert.equal(messages.at(-1).type,'ERROR');
  await listeners.get('message')({origin:'http://localhost:3000',source:parent,data:{channel:'spanstories.studio',version:1,type:'LIFE_RECORD',requestId:'x',sceneId:'scene',life:a,center:[0,0,0]}});
  assert.equal(messages.at(-1).type,'LIFE_ERROR');
  bridge.update(.1);bridge.destroy();
});
