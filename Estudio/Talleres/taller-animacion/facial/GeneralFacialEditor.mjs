import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerFullSkinning} from '/ecosystem/full-skinning.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mountFacialLibrary} from './FacialLibrary.mjs';
import {facialPlayerForRig} from './FacialRigAdapter.mjs';
import {ARKIT,GAIN_MAX,suggestGain,validateGain,validateProject} from './FacialCore.mjs';
import {ACTING_BY_ID,STYLES,actingProject} from './ActingLibrary.mjs';
import {createCharacterLife} from './CharacterLife.mjs';
import {DAILY_ACTINGS,DAILY_BY_ID,filtrarActuaciones} from './ActuacionesCotidianas.mjs';
import {clipCanonico,forzarEscritura,hornearEnPersonaje,tiempoDeCuerpo} from './CuerpoBiblioteca.mjs';
import {proyectoRostroCotidiano,momentosDeCabeza,REFERENCIA as FACE_REFERENCE} from './RostrosCotidianos.mjs';
import {mountFacialPanelNavigation} from './FacialPanelNavigation.mjs';
import {mountFaceWebcam} from './FaceWebcam.mjs';
import {iniciarRespaldoNavegador} from '../src/io/respaldo-navegador.js';
import {montarEscenaViva,crearEncuadre} from './EscenaViva.mjs';
import {aplicarAjuste,leerAjuste,fusionar,problemaVida} from './VidaEnEscena.mjs';
import {montarModoGeneral} from './ModoGeneral.mjs';
import {cargarCorrecciones,corregirProyecto,corregirLista,corregirExpresionesVida,corregirVisemas} from './CorreccionesFaciales.mjs';
import {BASE_PRESETS} from './FacialPresets.mjs';
import {POSES} from './ExpresionesVida.js?v=4';
import {VISEMAS_ARKIT} from './CharacterLife.mjs';
await iniciarRespaldoNavegador();

const API=location.origin+'/taller',params=new URLSearchParams(location.search),session=params.get('workshopSession');
const [{Rig},actingEngine,{prepareCharacterBody}]=await Promise.all([import(API+'/ecosystem/body/rig.js'),import(API+'/ecosystem/body/acting.js'),import(API+'/ecosystem/body/bodyprofile.js')]);
// Biblioteca de actuaciones y motor corporal en uso. Se sustituyen en caliente cuando cambian en disco
// (ver «Recarga en caliente» al final): así una actuación retocada se ve sin recargar el Estudio.
// Correcciones generales (modo General): se aplican a la biblioteca, a las actuaciones, a la vida y a los visemas.
await cargarCorrecciones(API+'/ecosystem/correcciones-faciales');
const corrigeActuacion=fn=>(...args)=>corregirProyecto(fn(...args)).project;
let ENGINE=actingEngine,ACTS={ACTING_BY_ID,actingProject:corrigeActuacion(actingProject)};
let general=null,refreshActingRef=()=>{};
function aplicarCorrecciones(){corregirLista(BASE_PRESETS);corregirExpresionesVida(POSES);corregirVisemas(VISEMAS_ARKIT);refreshActingRef();general?.paint();}
aplicarCorrecciones();
const origin=params.get('workshopOrigin')||API,partner=parent!==window?parent:null;
if(![new URL(API).origin,'http://localhost:3000','http://127.0.0.1:3000'].includes(origin))throw Error('Origen del Taller no permitido.');
import { setSharedViewport } from '../src/io/shared-viewport.js';

const channel='spanstories.facial-workshop',panel=document.getElementById('panel'),viewport=document.getElementById('vista');
document.title='Taller facial · expresiones y retargeting';panel.replaceChildren();
const bar=document.createElement('header');bar.id='workshop-return';
// Dos modos (como el Taller de animación): «En la historia» = este personaje en esta historia, sobre su escenario;
// «General · para todos» = correcciones de la biblioteca y calibración del personaje, en el visor propio.
bar.innerHTML='<strong>Taller facial</strong><span class="tf-seg" role="group" aria-label="Modo de trabajo"><button data-modo="historia" title="Este personaje en esta historia, sobre el escenario de la historia">🎬 En la historia</button><button data-modo="general" title="Corrección general: vale para todos los personajes y todas las historias">🌐 Corrección general</button></span><span class="tf-seg" role="group" aria-label="Plano de la cámara"><button data-plano="rostro" title="La cámara apunta siempre al rostro del personaje">Rostro</button><button data-plano="cuerpo" title="La cámara apunta siempre al personaje entero">Cuerpo entero</button></span><button data-escena hidden title="Escenario de la historia bajo el visor (el mismo del Estudio). Púlsalo para alternar con el visor propio">🏙 Escenario</button><small data-que></small><select aria-label="Personaje del taller facial"><option value="">Seleccionar personaje…</option></select><label>Importar GLB <input type="file" accept=".glb" aria-label="Importar personaje GLB"></label><button data-cuerpo disabled title="Lleva el rostro al Taller de animación para combinarlo con otro cuerpo">Al Taller de animación</button><button data-return disabled title="Modificación en historia: solo este personaje en esta historia. Reemplaza la actuación de la historia, sin duplicados (también se lleva sola al volver al Estudio o al Taller de animación)">Modificación en historia</button><style>#workshop-return .tf-seg{display:inline-flex;gap:0;margin:0 4px}#workshop-return .tf-seg button{border-radius:0}#workshop-return .tf-seg button[aria-pressed=true],#workshop-return [data-escena][aria-pressed=true]{background:#e86fa6;color:#111}#workshop-return small[data-que]{color:#9aa0aa;margin:0 6px}html:has(body.escena-viva),body.escena-viva,body.escena-viva #vista{background:transparent!important}</style>';
document.body.prepend(bar);
const modelSelect=bar.querySelector('select'),fileInput=bar.querySelector('input'),returnButton=bar.querySelector('[data-return]'),bodyButton=bar.querySelector('[data-cuerpo]'),escenaButton=bar.querySelector('[data-escena]'),queText=bar.querySelector('[data-que]');
returnButton.hidden=bodyButton.hidden=!session;fileInput.disabled=!!session;modelSelect.disabled=true;
const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='position:absolute;bottom:8px;left:12px;right:12px;padding:8px;background:#152334dc;color:#e4eef8;font:12px system-ui;pointer-events:none';viewport.append(status);
const say=text=>status.textContent=text;
const scene=new T.Scene();scene.background=new T.Color('#30333a');
const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;viewport.prepend(renderer.domElement);
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();
const key=new T.DirectionalLight(0xffffff,1.2);key.position.set(1,2,2);scene.add(key);
const camera=new T.PerspectiveCamera(30,1,.002,100),controls=new OrbitControls(camera,renderer.domElement);
new ResizeObserver(()=>{const rect=viewport.getBoundingClientRect();renderer.setSize(rect.width,rect.height);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();}).observe(viewport);
let life=null,root=null,library=null,mixer=null,body=null,bodyClip=null,rig=null,actingApplied=false,character=null,initialized=false,initializing=false,map={},gain=null,catalog=[],models=[],refreshActing=null,draftKey=null,sessionCharacter=null,sessionAnimation=null,daily=null,dailyRef=null;
let webcam=null;
const webcamCommands=session?new BroadcastChannel('spanstories.webcam:'+session):null;
if(webcamCommands)webcamCommands.onmessage=async({data})=>{
  if(data?.type!=='COMMAND'||typeof data.id!=='string'||!['estado','iniciar','detener'].includes(data.accion))return;
  try{if(!webcam)throw Error('El personaje todavía no está listo.');if(data.accion==='iniciar')await webcam.start();if(data.accion==='detener')webcam.stop();webcamCommands.postMessage({type:'RESULT',id:data.id,state:webcam.state});}
  catch(error){webcamCommands.postMessage({type:'RESULT',id:data.id,error:error.message});}
};
const post=(type,data={})=>partner?.postMessage({channel,version:1,session,type,...data},origin);
// Cámara fijada en el personaje: plano de rostro o de cuerpo entero; cada fotograma lo sigue (EscenaViva.mjs).
const encuadre=crearEncuadre({T,camera,controls,getRoot:()=>root});
function frame(full=false){encuadre.frame(full?'cuerpo':'rostro');paintBar();void escena?.despejar();}
// Modo y contexto de la historia (llega en INIT desde el Estudio).
let modo='general',story=null,calibracion={},storyProject=null;
const escena=montarEscenaViva({T,renderer,scene,camera,controls,viewport,getRoot:()=>root,post:(type,data)=>post(type,data),say,onChange:on=>{paintBar();void aplicarVidaHistoria();if(on&&!escena.fixed)void escena.despejar();}});
/** La calibración del personaje (vale para todas sus historias) se edita en General, no dentro de una historia. */
const calEditable=()=>modo!=='historia'||!story;
const enHistoria=()=>modo==='historia'&&!!story&&!!sessionCharacter&&character?.id===sessionCharacter.id;
function paintBar(){
  for(const b of bar.querySelectorAll('[data-modo]')){b.setAttribute('aria-pressed',String(b.dataset.modo===modo));b.disabled=b.dataset.modo==='historia'&&!story;}
  for(const b of bar.querySelectorAll('[data-plano]'))b.setAttribute('aria-pressed',String(b.dataset.plano===encuadre.plano));
  escenaButton.hidden=!enHistoria();escenaButton.setAttribute('aria-pressed',String(escena.on));escenaButton.textContent=escena.on?'🏙 Escenario':'🏙 Escenario (apagado)';
  queText.textContent=modo==='historia'&&story?`${character?.name||''} · solo en «${story.name||'esta historia'}»`:'para todos los personajes y todas las historias';
  returnButton.hidden=!session||modo!=='historia'||!story;bodyButton.hidden=!session||modo!=='historia';
  if(modo==='historia')modelSelect.disabled=true;
}
for(const b of bar.querySelectorAll('[data-plano]'))b.onclick=()=>frame(b.dataset.plano==='cuerpo');
escenaButton.onclick=()=>{escena.setWanted(!escena.on);paintBar();};
for(const b of bar.querySelectorAll('[data-modo]'))b.onclick=()=>void setModo(b.dataset.modo).catch(error=>say(error.message));
/** Cambio de modo: el trabajo de la historia se conserva (su borrador) y el General no lo toca. */
async function setModo(next){
  if(next===modo||(next==='historia'&&!story))return;
  const current=library?.exportProject();
  if(modo==='historia')storyProject=current;
  modo=next;
  if(next==='historia'&&sessionCharacter&&character?.id!==sessionCharacter.id){await loadCharacter(sessionCharacter.url,sessionCharacter,storyProject,sessionAnimation);}
  else{library?.release();mount(next==='historia'?storyProject:{schema:'spanstories.facial-project',version:1,presets:[],instances:[],favorites:[]});}
  if(next==='general')refreshModelOptions(character);
  escena.setEnabled(enHistoria());paintBar();
  say(next==='historia'?'En la historia: lo que hagas aquí es solo para este personaje en esta historia.':'General: corrige gestos para todos o calibra el personaje. No cambia la actuación de la historia.');
}
// Peticiones al Estudio con respuesta (dónde se usa, actualizar historias).
const pendientes=new Map();let pedido=1;
const ask=(type,data,timeout=10000)=>new Promise((resolve,reject)=>{const requestId='fp'+pedido++;const timer=setTimeout(()=>{pendientes.delete(requestId);reject(Error('El Estudio no respondió.'));},timeout);pendientes.set(requestId,reply=>{clearTimeout(timer);resolve(reply);});post(type,{requestId,...data});});
/** Calibración del personaje (modo General): vale para él en todas sus historias. */
async function saveCalibration(){
  if(!character)throw Error('No hay personaje.');
  const r=await fetch(API+'/ecosystem/calibracion-facial/'+encodeURIComponent(character.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rigGain:gain||{},rigMap:map||{}})}),d=await r.json();
  if(!r.ok)throw Error(d.error||'No se pudo guardar la calibración.');calibracion=d;
}
async function loadCharacterById(id){
  const meta=allModels().find(m=>m.id===id);if(!meta)throw Error('Ese personaje no está en la biblioteca del Taller.');
  await loadCharacter(meta.direct?meta.url:API+'/ecosystem/model?url='+encodeURIComponent(meta.url),meta,null,meta.id===sessionCharacter?.id?sessionAnimation:undefined);refreshModelOptions(character);
}
// ---------- Vida en reposo de la historia (LifeCharacter cuando el personaje está quieto) ----------
const objetivoMirada=new T.Object3D();objetivoMirada.name='Mirada de la historia';scene.add(objetivoMirada);
const leeMirada=value=>value.startsWith('actor:')?{modo:'actor',actorId:value.slice(6)}:{modo:value};
/** Pone la vida del Taller como la verá la historia; la cabeza del otro personaje se pide al escenario. */
async function ponerVida(ajuste){
  let objetivo=null;
  if(ajuste.mirada.modo==='actor'&&escena.on){const a=(await escena.actors()).find(x=>x.id===ajuste.mirada.actorId);if(a){objetivoMirada.position.copy(a.head);objetivo=objetivoMirada;}}
  if(life)aplicarAjuste(life.vida,ajuste,{objetivo:()=>objetivo});
}
/** La vida de la historia sobre el personaje del Taller: la base de la escena y, si lo hay, el cambio de este momento. */
async function aplicarVidaHistoria(){if(life&&enHistoria()&&story.vida)await ponerVida(fusionar(story.vida,story.vidaMomento));}
function seccionVidaHistoria(){
  const box=document.createElement('details');box.open=true;box.className='cl-section';
  const others=story.others||[],safe=t=>String(t??'').replace(/[<>&"]/g,'');
  box.innerHTML=`<summary>Vida en reposo en la historia</summary><p class="tf-note">Cuando ${safe(character.name)} está quieto en la historia (sin actuación), el escenario lo mantiene vivo con esta vida: respira, parpadea, mira y hace gestos pequeños. Ajusta ánimo, energía y partes en «Vida del personaje»; aquí eliges a quién mira y la llevas a la historia.</p>
    <label class="tf-row" style="grid-template-columns:1fr 1fr"><span>Alcance</span><select data-alcance aria-label="Alcance de la vida en reposo"><option value="escena">Toda la escena</option><option value="momento">Desde este momento («${safe(story.sequenceName)}»)</option></select></label>
    <label class="tf-row" style="grid-template-columns:1fr 1fr"><span>Mira</span><select data-mira aria-label="A quién mira en reposo"><option value="camara">a la cámara</option><option value="deambular">deambula</option>${others.map(o=>`<option value="actor:${safe(o.id)}">a ${safe(o.name)}</option>`).join('')}</select></label>
    <p class="tf-note" data-estado></p><button data-aplicar>Aplicar a la historia</button> <button data-quitar>Quitar</button>`;
  const alcance=box.querySelector('[data-alcance]'),mira=box.querySelector('[data-mira]'),estado=box.querySelector('[data-estado]');
  const pinta=()=>{
    const v=alcance.value==='momento'?story.vidaMomento:story.vida;
    estado.textContent=v?(alcance.value==='momento'?'Desde este momento: '+[v.animo,v.energia!==undefined?'energía '+Math.round(v.energia*100)+' %':null,v.mirada?'mira '+(v.mirada.modo==='actor'?'a '+(others.find(o=>o.id===v.mirada.actorId)?.name||'otro personaje'):v.mirada.modo):null].filter(Boolean).join(' · '):`En la escena: ${v.activa?v.animo+' · energía '+Math.round(v.energia*100)+' %':'apagada'}`)
      :alcance.value==='momento'?'Este momento usa la vida de la escena.':'Sin vida en reposo: quieto, el personaje se queda congelado.';
  };
  const m=story.vidaMomento?.mirada||story.vida?.mirada;if(m)mira.value=m.modo==='actor'?'actor:'+m.actorId:m.modo;
  mira.onchange=()=>void ponerVida(leerAjuste(life.vida,leeMirada(mira.value)));
  alcance.onchange=pinta;pinta();
  box.querySelector('[data-aplicar]').onclick=()=>{
    const mirada=leeMirada(mira.value),ajuste=leerAjuste(life.vida,mirada);
    const problema=problemaVida(ajuste);if(problema){say(problema);return;}
    if(alcance.value==='escena'){story.vida=ajuste;post('LIFE',{vida:ajuste,alcance:'escena'});}
    else{const cambio={animo:ajuste.animo,energia:ajuste.energia,mirada};story.vidaMomento=cambio;post('LIFE',{vida:cambio,alcance:'momento'});}
    pinta();say('Vida en reposo enviada a la historia. Guarda la historia para conservarla.');
  };
  box.querySelector('[data-quitar]').onclick=()=>{if(alcance.value==='escena')story.vida=null;else story.vidaMomento=null;post('LIFE',{vida:null,alcance:alcance.value});pinta();say(alcance.value==='escena'?'Vida en reposo quitada: quieto, el personaje queda congelado.':'Este momento vuelve a la vida de la escena.');};
  return box;
}

// ---------- Actuaciones cotidianas (solo cuerpo, clips de mocap de biblioteca/paquetes) ----------
/** Suelta el clip de biblioteca y devuelve el cuerpo que había antes (el de referencia del Estudio, si lo hay). */
function clearDaily(){
  if(!daily)return;
  library?.release();
  dropStill();
  body?.stop();mixer?.uncacheClip(bodyClip);
  ({body,bodyClip}=dailyRef||{body:null,bodyClip:null});daily=dailyRef=null;
  if(body){body.reset().play();mixer.update(0);}else rig?.resetToRest();
}
// Número en la lista: las 50 actuaciones de cuerpo + rostro son 1–50; las cotidianas continúan en 51–100.
const dailyNumber=id=>50+Number(id.replace('daily-',''));
let still=null,stillClip=null;   // postura media del clip cotidiano: base de la intensidad (nunca la pose T del modelo)
/** Clip de un solo instante con la postura media del movimiento (cuaterniones promediados con el mismo signo). */
function meanClip(clip){
  const tracks=clip.tracks.map(track=>{
    const n=track.getValueSize(),k=track.times.length,out=new Float32Array(n);
    if(n===4){const ref=track.values.slice(0,4);for(let i=0;i<k;i++){const o=i*4,dot=ref[0]*track.values[o]+ref[1]*track.values[o+1]+ref[2]*track.values[o+2]+ref[3]*track.values[o+3],sign=dot<0?-1:1;for(let j=0;j<4;j++)out[j]+=sign*track.values[o+j];}const len=Math.hypot(...out)||1;for(let j=0;j<4;j++)out[j]/=len;}
    else{for(let i=0;i<k;i++)for(let j=0;j<n;j++)out[j]+=track.values[i*n+j]/k;}
    return new track.constructor(track.name,[0],Array.from(out));
  });
  return new T.AnimationClip(clip.name+' · postura media',1,tracks);   // duración 1 s: con 0 el mezclador calcula el tiempo como NaN
}
/** Orientación cuello·cabeza del clip horneado → instantes en que la cabeza empieza a girar (parpadeos y acentos del rostro). */
function headMoments(clip){
  const pick=canon=>{const b=rig.bone(canon);return b&&clip.tracks.find(t=>t.name===b.uuid+'.quaternion');};
  const head=pick('head'),neck=pick('neck');if(!head)return[];
  const n=head.times.length,out=new Float32Array(n*4),a=new T.Quaternion(),b=new T.Quaternion();
  for(let i=0;i<n;i++){b.fromArray(head.values,i*4);if(neck&&neck.times.length===n){a.fromArray(neck.values,i*4);b.premultiply(a);}b.toArray(out,i*4);}
  return momentosDeCabeza(head.times,out);
}
function dropStill(){if(still){still.stop();mixer?.uncacheClip(stillClip);}still=stillClip=null;}
/** Carga en el personaje el clip de mocap de una actuación cotidiana (solo cuerpo; rostro pendiente). */
async function loadDaily(item,{note,weight=1,faceWeight=null}){
  const quien=character;
  if(!rig?.humanoid)throw Error('Este personaje necesita un esqueleto humanoide (Mixamo, AccuRig, Unreal, Rigify o VRM).');
  note.textContent=item.name+' · leyendo el movimiento de la biblioteca…';
  const clipModule=await import(API+'/ecosystem/body/clip.js');
  const canonico=await clipCanonico(item.body,{API,T,Rig,clipModule});
  if(character!==quien)return;
  const {clip,duracion,bucle}=hornearEnPersonaje(canonico,{T,rig,sampleClip:clipModule.sampleClip,newPose:clipModule.newPose,nombre:item.name});
  library.release();
  if(!daily)dailyRef={body,bodyClip};
  body?.stop();if(daily)mixer.uncacheClip(bodyClip);
  dropStill();stillClip=meanClip(clip);still=mixer.clipAction(stillClip);still.setLoop(T.LoopOnce,1);still.clampWhenFinished=true;still.play();
  bodyClip=clip;body=mixer.clipAction(clip);body.setLoop(T.LoopOnce,1);body.clampWhenFinished=true;body.reset().play();
  body.setEffectiveWeight(weight);still.setEffectiveWeight(1-weight);
  daily={id:item.id,inicio:performance.now(),duracion,repetir:bucle,peso:weight};
  // Rostro: curvas en bucle del mismo largo que el clip y en su mismo reloj; parpadeos y acentos en los giros de cabeza.
  const eventos=headMoments(clip),current=daily;
  library.selectActing(corregirProyecto(proyectoRostroCotidiano(item,duracion,{eventos,intensidad:faceWeight??FACE_REFERENCE})).project,{clock:now=>current===daily?tiempoDeCuerpo(now,current.inicio,current.duracion,current.repetir):0});
  const sentado=/sentad|sofá|silla|mesa/i.test(item.category+' '+item.subcategory+' '+item.name);
  note.textContent=`${dailyNumber(item.id)} · ${item.name} · ${duracion.toFixed(1)} s${bucle?' · en bucle':''} · cuerpo de mocap + rostro en el mismo reloj (${item.faceNotes})`+(sentado?' Necesita una silla o un sofá en la escena.':'');
  say(item.name+' · cuerpo de la biblioteca y rostro en el mismo reloj. Ajusta la intensidad del rostro y del cuerpo.');frame(true);
}
/** Intensidad corporal de la actuación cotidiana: mezcla el movimiento con su postura media (0 % = quieto en esa postura). */
function setDailyWeight(value){if(!daily||!body)return;daily.peso=value;body.setEffectiveWeight(value);still?.setEffectiveWeight(1-value);}
function mount(project){
  webcam?.dispose();webcam=null;
  panel.replaceChildren();
  const heading=document.createElement('h2');heading.textContent='Expresiones y actuaciones';panel.append(heading);
  const actionPanel=document.createElement('section');actionPanel.innerHTML='<h2>50 emociones y comportamientos</h2><label class="tf-row" style="grid-template-columns:1fr 1fr"><span>Configuración</span><select data-style aria-label="Configuración femenina o masculina de las actuaciones">'+STYLES.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')+'</select></label><input placeholder="Buscar actuación…" aria-label="Buscar actuación facial"><select size="10" aria-label="Catálogo de actuaciones: 50 de cuerpo y rostro y 50 cotidianas" style="width:100%"></select><p style="font-size:11px;color:#b3c9dd"></p>';
  panel.append(actionPanel);const search=actionPanel.querySelector('input'),select=actionPanel.querySelector('select[size]'),note=actionPanel.querySelector('p'),styleSelect=actionPanel.querySelector('[data-style]');
  // Configuración femenina/masculina: la del perfil del personaje, o la última elegida para él.
  const styleKey='spanstories.acting-style.v1:'+character.id;let chosen=null;try{chosen=localStorage.getItem(styleKey);}catch{}
  styleSelect.value=STYLES.some(s=>s.id===chosen)?chosen:STYLES.some(s=>s.id===character.style)?character.style:'F';
  function renderCatalog(){
    const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const acting=document.createElement('optgroup');acting.label='1–50 · Emociones y comportamientos · cuerpo + rostro';
    acting.append(...catalog.filter(c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)).map(c=>new Option(`${c.id.replace('behavior-','')} · ${c.name} · cuerpo + rostro`,c.id)));
    const everyday=document.createElement('optgroup');everyday.label='51–100 · Actuaciones cotidianas · mocap + rostro';
    everyday.append(...filtrarActuaciones(DAILY_ACTINGS,search.value).map(a=>new Option(`${dailyNumber(a.id)} · ${a.name} · ${a.category} › ${a.subcategory}`,a.id)));
    const previous=select.value;select.replaceChildren(...[acting,everyday].filter(g=>g.children.length));if(previous)select.value=previous;
  }
  search.oninput=renderCatalog;renderCatalog();
  styleSelect.onchange=()=>{try{localStorage.setItem(styleKey,styleSelect.value);}catch{}if(select.value)select.onchange();};
  const expressionControls=document.createElement('section');expressionControls.setAttribute('aria-label','Controles de expresión');
  expressionControls.innerHTML=`<h2>Intensidad</h2>
    <label class="tf-row"><span>Intensidad de la actuación <small>rostro + cuerpo</small></span><output data-master-value></output><input data-master type="range" min="0" max="1" step=".01" aria-label="Intensidad de la actuación"><small class="tf-scale"><span>sutil</span><span>natural</span><span>exagerada</span></small></label>
    <details open><summary>Rostro y cuerpo por separado</summary>
      <label class="tf-row"><span>Solo rostro</span><output data-face-value></output><input data-face type="range" min="0" max="1" step=".01" aria-label="Intensidad del rostro"></label>
      <label class="tf-row"><span>Solo cuerpo</span><output data-body-value></output><input data-body type="range" min="0" max="1" step=".01" aria-label="Intensidad corporal"></label>
    </details>
    <h2>Fuerza de las shape keys en este personaje</h2>
    <p class="tf-note">Cada personaje mueve distinto las mismas shape keys. Aquí se corrige: 100 % = tal como viene del modelo; más = más recorrido. ${calEditable()?'Guárdala en «Calibración del personaje»: vale para este personaje en todas sus historias.':'Se ajusta en el modo General (vale para este personaje en todas sus historias).'}</p>
    <label class="tf-row"><span>Todo el rostro</span><output data-all-value></output><input data-gain-all type="range" min=".5" max="2" step=".05" aria-label="Fuerza general de las shape keys"></label>
    <button data-auto title="Mide cuánto se mueve cada shape key frente al tamaño de la cara y propone la fuerza">Calibrar automáticamente</button> <button data-flat>Sin corrección (100 %)</button>
    <h2>Por shape key</h2>
    <label style="display:block"><input data-all type="checkbox"> Mostrar los 52 canales</label>
    <small class="tf-note">«Actuación» es el pico de la curva en este gesto. «Personaje» es la fuerza de esa shape key en este modelo (hasta ${Math.round(GAIN_MAX*100)} %).</small>
    <div data-channels></div>
    <style>.tf-row{display:grid;grid-template-columns:1fr 46px;gap:2px;font:12px system-ui;margin:8px 0}.tf-row input{grid-column:1/-1;width:100%}.tf-row small{color:#9fb6cb}.tf-scale{grid-column:1/-1;display:flex;justify-content:space-between;font-size:10px}.tf-note{font-size:11px;color:#b3c9dd;margin:4px 0}
      .tf-key{display:grid;grid-template-columns:62px 1fr 42px;gap:2px 6px;align-items:center;font:11px system-ui;margin:9px 0;padding-top:6px;border-top:1px solid #ffffff14}.tf-key b{grid-column:1/-1;font-weight:600}.tf-key span{color:#9fb6cb}.tf-key input{width:100%}.tf-key[data-off=true]{opacity:.45}</style>`;
  const q=name=>expressionControls.querySelector(name),percent=v=>Math.round(v*100)+' %';
  const allChannels=q('[data-all]'),channels=q('[data-channels]'),bodyControl=q('[data-body]'),faceControl=q('[data-face]'),master=q('[data-master]'),gainAll=q('[data-gain-all]');
  const facialProfile=facialPlayerForRig(root,map);
  // Calibración del personaje: la del proyecto recibido, la guardada para este personaje o, la primera vez, la medida.
  const gainKey='spanstories.facial-gain.v1:'+character.id;
  // Calibración guardada en disco (modo General) → la del proyecto → la de este navegador → la medida.
  if(!gain&&calibracion?.rigGain)gain={...calibracion.rigGain};
  if(!gain){try{const stored=localStorage.getItem(gainKey);gain=stored?validateGain(JSON.parse(stored)):null;}catch{gain=null;}}
  gain??=facialProfile.bindings?suggestGain(facialProfile.bindings):{};
  const applyGain=(save=true)=>{facialProfile.setGain?.(gain);gainAll.value=gain.all??1;q('[data-all-value]').textContent=percent(gain.all??1);if(save&&!session)try{localStorage.setItem(gainKey,JSON.stringify(gain));}catch{}};
  applyGain(false);
  if(!calEditable())for(const el of [gainAll,q('[data-auto]'),q('[data-flat]')])el.disabled=true;
  let inspected=null;
  function showControls(p,i){
    inspected={p,i};faceControl.disabled=false;general?.paint();
    const acting=i?.acting||p.defaults?.acting,face=i?.intensity??p.defaults?.intensity??1;
    bodyControl.disabled=!acting;bodyControl.value=acting?.intensity??face;faceControl.value=face;master.value=acting?(Number(bodyControl.value)+face)/2:face;
    q('[data-body-value]').textContent=acting?percent(bodyControl.value):'—';q('[data-face-value]').textContent=percent(face);q('[data-master-value]').textContent=percent(master.value);
    channels.replaceChildren();
    for(const channel of ARKIT.filter(n=>allChannels.checked||Object.hasOwn(p.channels,n))){
      const row=document.createElement('div');row.className='tf-key';
      const unavailable=facialProfile.report.missing.includes(channel)||facialProfile.report.zeroDelta.includes(channel);row.dataset.off=String(unavailable);row.title=unavailable?'Canal ausente o sin deformación en este personaje':channel;
      const name=document.createElement('b');name.textContent=channel;row.append(name);
      const line=(caption,min,max,step,value,label,change)=>{
        const text=document.createElement('span'),slider=document.createElement('input'),output=document.createElement('output');
        text.textContent=caption;slider.type='range';slider.min=min;slider.max=max;slider.step=step;slider.value=value;slider.disabled=unavailable||(caption==='Personaje'&&!calEditable());slider.setAttribute('aria-label',label+' '+channel);output.textContent=percent(slider.value);
        slider.oninput=()=>{output.textContent=percent(slider.value);change(Number(slider.value),false);};slider.onchange=()=>change(Number(slider.value),true);row.append(text,slider,output);
      };
      line('Actuación',0,1,.01,Math.max(0,...(p.channels[channel]||[]).map(k=>k[1])),'Pico en la actuación de',(value,done)=>{if(done)try{library.setChannelPeak(channel,value);}catch(e){say(e.message);}});
      line('Personaje',0,GAIN_MAX,.05,gain[channel]??1,'Fuerza en el personaje de',value=>{if(value===1)delete gain[channel];else gain[channel]=value;applyGain();});
      channels.append(row);
    }
  }
  function showDaily(){if(!daily)return;const w=daily.peso,f=Number(faceControl.value);bodyControl.disabled=false;faceControl.disabled=false;bodyControl.value=w;master.value=(w+f)/2;q('[data-body-value]').textContent=percent(w);q('[data-master-value]').textContent=percent(master.value);q('[data-face-value]').textContent=percent(f);}
  allChannels.onchange=()=>{if(inspected)showControls(inspected.p,inspected.i);};
  const guard=fn=>{try{fn();}catch(e){say(e.message);}};
  master.oninput=()=>{q('[data-master-value]').textContent=percent(master.value);if(daily){const v=Number(master.value);setDailyWeight(v);bodyControl.value=v;faceControl.value=v;q('[data-body-value]').textContent=percent(v);q('[data-face-value]').textContent=percent(v);guard(()=>library.setIntensity(v,{live:true,body:false}));return;}guard(()=>library.setIntensity(Number(master.value),{live:true}));};
  master.onchange=()=>daily?guard(()=>{library.setIntensity(Number(master.value),{body:false});say('Intensidad de la actuación: '+percent(master.value)+'.');}):guard(()=>{library.setIntensity(Number(master.value));say('Intensidad de la actuación: '+percent(master.value)+'.');});
  faceControl.oninput=()=>{q('[data-face-value]').textContent=percent(faceControl.value);guard(()=>library.setIntensity(Number(faceControl.value),{live:true,body:false}));};
  faceControl.onchange=()=>guard(()=>library.setIntensity(Number(faceControl.value),{body:false}));
  bodyControl.oninput=()=>{q('[data-body-value]').textContent=percent(bodyControl.value);if(daily){setDailyWeight(Number(bodyControl.value));master.value=bodyControl.value;q('[data-master-value]').textContent=percent(bodyControl.value);return;}guard(()=>library.setBodyIntensity(Number(bodyControl.value),{live:true}));};
  bodyControl.onchange=()=>daily?null:guard(()=>library.setBodyIntensity(Number(bodyControl.value)));
  gainAll.oninput=()=>{const value=Number(gainAll.value);if(value===1)delete gain.all;else gain.all=value;applyGain();};
  q('[data-auto]').onclick=()=>{const all=gain.all;gain=facialProfile.bindings?suggestGain(facialProfile.bindings):{};if(all)gain.all=all;applyGain();if(inspected)showControls(inspected.p,inspected.i);say('Calibración automática: '+(Object.keys(gain).filter(n=>n!=='all').length)+' shape keys reforzadas. Ajusta las que quieras.');};
  q('[data-flat]').onclick=()=>{gain={};applyGain();if(inspected)showControls(inspected.p,inspected.i);say('Shape keys sin corrección.');};
  library=mountFacialLibrary({root,vida:life?.vida,container:panel,session:!!session,draftKey:modo==='historia'?draftKey:null,storageKey:'spanstories.facial-project.v1:'+character.id,player:facialProfile,frameBody:()=>frame(true),onInspect:showControls});
  panel.prepend(heading,actionPanel,expressionControls);
  const lifeSections=life?.panel()||[];
  if(lifeSections.length)expressionControls.after(...lifeSections);
  // Modo General: corrección para todos y calibración (la sección se conserva entre montajes).
  if(modo==='general'&&session){general??=montarModoGeneral({T,getLibrary:()=>library,getCharacter:()=>character,getRoot:()=>root,loadCharacterById,ask,say,saveCalibration,POSES,VISEMAS:VISEMAS_ARKIT,onSaved:aplicarCorrecciones});heading.after(general.section);general.paint();}
  // En la historia: la vida en reposo que verá la historia cuando el personaje esté quieto.
  if(enHistoria()&&life){const vidaHistoria=seccionVidaHistoria();(lifeSections[0]||expressionControls).before(vidaHistoria);lifeSections.unshift(vidaHistoria);}
  heading.textContent=modo==='historia'&&story?`Actuación de ${character.name} en esta historia`:'Expresiones y actuaciones · para todos';
  showControls(library.draftPreset,null);
  if(project)library.loadProject(project);
  refreshActing=()=>{if(select.value)select.onchange();};refreshActingRef=refreshActing;
  // La actuación elegida se recuerda en esta pestaña: al recargar se retoma donde estaba.
  const lastKey='spanstories.acting-last.v1:'+character.id;
  select.addEventListener('change',()=>{try{sessionStorage.setItem(lastKey,select.value);}catch{}});
  select.onchange=()=>{const everyday=DAILY_BY_ID.get(select.value);if(everyday){loadDaily(everyday,{note,weight:Number(bodyControl.value)||1,faceWeight:daily?Number(faceControl.value):null}).then(()=>showDaily()).catch(error=>{note.textContent=error.message;say(error.message);});return;}try{const item=catalog.find(c=>c.id===select.value),recipe=ACTS.ACTING_BY_ID.get(item.id);clearDaily();if(!rig.humanoid)throw Error('Este personaje necesita un esqueleto humanoide (Mixamo, AccuRig, Unreal, Rigify o VRM).');library.selectActing(ACTS.actingProject(item.id,undefined,styleSelect.value));note.textContent=item.actingRequirement+(recipe.requires?.includes('chair')?' Necesita una silla en la escena.':'')+(recipe.requires?.includes('phone')?' Necesita un teléfono como objeto de escena.':'');frame(true);say(item.name+' · cuerpo y rostro en el mismo reloj. Ajusta la intensidad y aplica a la pista.');}catch(error){say(error.message);}};
  if(!project?.instances?.length)try{const last=sessionStorage.getItem(lastKey);if(last&&catalog.some(c=>c.id===last)){select.value=last;if(select.value===last)setTimeout(()=>select.onchange(),0);}}catch{}
  const mapping=document.createElement('details');mapping.hidden=!calEditable();mapping.innerHTML='<summary>Retargeting facial · mapa de canales</summary><p>ARKit/Faceit se adapta por nombre. Para otro rig, asigna sus morphs reales; los canales ausentes se indican en compatibilidad.</p><label>Canal canónico<select aria-label="Canal canónico"></select></label><label>Morph del personaje<select aria-label="Morph del personaje"></select></label><button>Asignar canal</button><button>Restaurar detección automática</button><pre style="font-size:10px;white-space:pre-wrap"></pre>';
  const canonical=mapping.querySelectorAll('select')[0],target=mapping.querySelectorAll('select')[1],buttons=mapping.querySelectorAll('button');canonical.append(...ARKIT.map(n=>new Option(n,n)));
  const names=new Set();root.traverse(o=>Object.keys(o.morphTargetDictionary||{}).forEach(n=>names.add(n)));target.append(...[...names].sort().map(n=>new Option(n,n)));mapping.querySelector('pre').textContent=JSON.stringify(map,null,2);
buttons[0].onclick=()=>{if(!target.value)return;const proposed={...map,[canonical.value]:target.value},normalized=Object.values(proposed).map(n=>n.toLowerCase().replace(/[^a-z0-9]/g,''));if(new Set(normalized).size!==normalized.length){say('Asigna un morph distinto por canal para evitar escrituras incompatibles.');return;}const project=library.exportProject();project.rigMap=proposed;validateProject(project);library.player.restore();map=proposed;mount(project);library.persistProject();say('Mapa aplicado a esta actuación. Revisa su deformación.');};
  buttons[1].onclick=()=>{const project=library.exportProject();delete project.rigMap;library.player.restore();map={};mount(project);library.persistProject();};panel.append(mapping);
  webcam=mountFaceWebcam({container:panel,root,aliases:map});
  // Additive section; existing navigation and controls stay in place.
  actionPanel.before(webcam.section);
  mountFacialPanelNavigation({container:panel,expressions:actionPanel,lifeSections,webcam:webcam.section,initial:session||params.get('vista')==='vida'?'life':'expressions'});
}
async function loadCharacter(source,meta,project,animation){
  if(!session&&!project){const stored=localStorage.getItem('spanstories.facial-project.v1:'+meta.id);if(stored)project=validateProject(JSON.parse(stored));}
  const loader=new GLTFLoader();
  registerFullSkinning(loader,T);
  // Chromium's ImageBitmap decoder can reject valid large (4K) embedded PNGs: any GLB with an embedded image over 4 MB uses the HTML image decoder.
  loader.register(parser=>{if(parser.json.images?.some(i=>(parser.json.bufferViews?.[i.bufferView]?.byteLength||0)>4e6))parser.textureLoader=new T.TextureLoader(parser.options.manager).setCrossOrigin(parser.options.crossOrigin).setRequestHeader(parser.options.requestHeader);return {name:'SPANSTORIES_LARGE_TEXTURES'};});
  const gltf=await loader.loadAsync(source);
  // Calibración del personaje en disco (fuerza de shape keys y mapa de canales del modo General).
  calibracion=await fetch(API+'/ecosystem/calibracion-facial/'+encodeURIComponent(meta.id),{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({}));
  // Perfil del personaje (datos, no código): estilo de partida y ajustes del cuerpo. Por id o por nombre.
  let profile=null;try{const r=await fetch(new URL('./perfiles-personaje.json',import.meta.url));if(r.ok){const all=(await r.json()).personajes||{},name=(meta.name||'').toLowerCase();profile=all[meta.id]||Object.values(all).find(p=>(p.nombre||'').toLowerCase()===name)||null;}}catch{}
  if(!meta.style&&profile?.estilo)meta={...meta,style:profile.estilo};
  webcam?.dispose();webcam=null;
  library?.release();if(root){scene.remove(root);const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}if(o.isSkinnedMesh)o.skeleton.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  root=gltf.scene;character=meta;if(session)refreshModelOptions(meta);scene.add(root);root.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});map=calibracion.rigMap||project?.rigMap||{};gain=calibracion.rigGain?{...calibracion.rigGain}:project?.rigGain?{...project.rigGain}:null;rig=new Rig(root);if(rig.humanoid)prepareCharacterBody(root,rig,profile?.cuerpo);actingApplied=false;mixer=new T.AnimationMixer(root);body=bodyClip=null;daily=dailyRef=null;still=stillClip=null;
  if(animation){bodyClip=T.AnimationClip.parse(animation);bodyClip.tracks=bodyClip.tracks.filter(t=>!t.name.includes('morphTargetInfluences'));body=mixer.clipAction(bodyClip);body.setLoop(T.LoopOnce,1);body.clampWhenFinished=true;body.play();body.time=0;mixer.update(0);}
  // Vida, habla, controles manuales y físicas del personaje recién cargado (mismo módulo para todos).
  life?.dispose();life=await createCharacterLife({root,rig,gltf,mixer,camera,renderer,scene,characterId:meta.id,say});
  life.onExpression=()=>library?.release();
  life.onRebuild=()=>{const current=library.exportProject();library.release();mount(current);void aplicarVidaHistoria();};
  await aplicarVidaHistoria();   // antes del panel: sus controles (ánimo, energía, partes) muestran la vida de la historia
  mount(project);frame(encuadre.plano==='cuerpo');returnButton.disabled=bodyButton.disabled=false;
  escena.rebind();escena.setEnabled(enHistoria());paintBar();say(meta.name+' · '+(library.player.report.present.length?'retargeting facial por canales; revisión visual pendiente.':'este rig no tiene morphs reconocidos. Asigna sus canales; un rig solo con huesos necesita un adaptador adicional.'));
}
async function loadCatalog(){try{const response=await fetch(API+'/comportamientos/catalogo.json');if(!response.ok)throw Error();catalog=(await response.json()).behaviors;}catch{say('Abre el servicio del Taller para cargar el catálogo de 50 y los personajes. La importación GLB sigue disponible.');}}
await loadCatalog();
// Personajes disponibles dentro del Taller: el de la escena del Estudio (el que llegó en INIT) y los de la biblioteca.
const allModels=()=>{const seen=new Set();return [...(sessionCharacter?[sessionCharacter]:[]),...models].filter(m=>!seen.has(m.id)&&seen.add(m.id));};
function refreshModelOptions(current){const options=allModels().map(m=>new Option(m.name+(m.id===sessionCharacter?.id?' · personaje de la escena':''),m.id,false,m.id===current?.id));if(current&&!options.some(o=>o.selected))options.unshift(new Option(current.name,current.id,true,true));modelSelect.replaceChildren(...options);modelSelect.disabled=!options.length||!current;}
async function loadModels(){try{const response=await fetch(API+'/ecosystem/characters');if(response.ok){const items=(await response.json()).items||[],names=new Set(items.filter(m=>!m.id.startsWith('lib:')).map(m=>m.name.toLowerCase()));models=items.filter(m=>!m.id.startsWith('lib:')||!names.has(m.name.toLowerCase()));}}catch{}if(character)refreshModelOptions(character);}
loadModels();
// Taller facial abierto desde el Estudio sin personaje en la escena: se elige uno de la biblioteca (empieza por el primero).
async function startWithoutCharacter(){returnButton.hidden=true;await loadModels();const first=models[0];if(!first){say('No hay personajes disponibles en la biblioteca.');return;}await loadCharacter(API+'/ecosystem/model?url='+encodeURIComponent(first.url),first,null);}
// El Taller facial es parte del Estudio: solo se abre dentro de él (Estudio › Taller facial), con el personaje de la escena.
if(!session){modelSelect.hidden=true;fileInput.hidden=true;say('El Taller facial se abre desde el Estudio: Estudio › Taller facial, con el personaje de la escena.');}
modelSelect.onchange=async()=>{const meta=allModels().find(m=>m.id===modelSelect.value);if(!meta||meta.id===character?.id)return;modelSelect.disabled=true;try{let project=null;if(library?.evaluation?.instances.some(i=>i.acting)){project=library.exportProject();delete project.rigMap;delete project.rigGain;const stored=localStorage.getItem('spanstories.facial-project.v1:'+meta.id);if(stored){const map=validateProject(JSON.parse(stored)).rigMap;if(map)project.rigMap=map;}}await loadCharacter(meta.direct?meta.url:API+'/ecosystem/model?url='+encodeURIComponent(meta.url),meta,project,meta.id===sessionCharacter?.id?sessionAnimation:undefined);}catch(error){console.error(error);say(error.message);}finally{refreshModelOptions(character);}};
fileInput.onchange=async()=>{const file=fileInput.files[0];if(!file)return;const url=URL.createObjectURL(file);try{const bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');await loadCharacter(url,{id:'import:'+hash,name:file.name.replace(/\.glb$/i,'')});}catch(error){say(error.message);}finally{URL.revokeObjectURL(url);fileInput.value='';}};
window.addEventListener('message',async event=>{const m=event.data;if(initialized||initializing||!session||event.source!==partner||event.origin!==origin||m?.channel!==channel||m.version!==1||m.session!==session||m.type!=='INIT')return;initializing=true;try{if(m.modelUrl===null){await startWithoutCharacter();initialized=true;clearInterval(timer);post('LOADED');return;}const url=new URL(m.modelUrl);if(url.origin!==new URL(API).origin||url.pathname!==new URL(API+'/ecosystem/model').pathname)throw Error('Modelo fuera de la biblioteca local.');// Borrador de esta actuación del Estudio: si es más reciente que lo recibido, se continúa desde él.
let project=validateProject(m.project),recovered=false;
// La actuación ya puesta en la historia: su rostro y su cuerpo (con las correcciones del Taller de animación).
let bodyAnimation=m.bodyAnimation,asset=null;
if(typeof m.behaviorUrl==='string'&&new URL(m.behaviorUrl).origin===new URL(API).origin&&/^\/(?:taller\/)?ecosystem\/assets\/[a-f0-9-]{36}\.json$/.test(new URL(m.behaviorUrl).pathname)){try{
  // La revisión que la historia guardó (si ya no está archivada, la última).
  const pinned=new URL(m.behaviorUrl);if(Number.isInteger(m.behaviorRevision)&&m.behaviorRevision>=0)pinned.searchParams.set('revision',String(m.behaviorRevision));
  let response=await fetch(pinned,{cache:'no-store'});if(response.status===404&&pinned.search)response=await fetch(m.behaviorUrl,{cache:'no-store'});
  asset=await response.json();if(!bodyAnimation&&asset.animation)bodyAnimation=asset.animation;}catch(error){console.warn('Actuación de la historia',error);}}
// Fecha de la versión que tiene la historia: un borrador más viejo que ella no la pisa (antes ganaba siempre).
const storyDate=Math.max(Number(m.projectDate)||0,Date.parse(asset?.updatedAt||asset?.createdAt||'')||0);
if(typeof m.draftKey==='string'&&/^[\w:.-]{1,300}$/.test(m.draftKey)){draftKey='spanstories.facial-draft.v1:'+m.draftKey;try{
  // Borrador de esta historia; si no lo hay, el de antes de separar historias (misma escena y papel).
  // Y las claves anteriores: sin cue (antes de que el cue existiera) y sin historia.
  const legacyKeys=[m.legacyDraftKey,...(Array.isArray(m.legacyDraftKeys)?m.legacyDraftKeys:[])].filter(k=>typeof k==='string'&&/^[\w:.-]{1,300}$/.test(k)).map(k=>'spanstories.facial-draft.v1:'+k);
  let stored=localStorage.getItem(draftKey);for(const key of legacyKeys){if(stored)break;stored=localStorage.getItem(key);}
  const saved=JSON.parse(stored||'null');if(saved?.project&&(saved.date||0)>=storyDate){project=validateProject(saved.project);recovered=true;}}catch(error){console.warn('Borrador facial',error);}}
if(!recovered&&!project.instances.length&&asset?.recipe?.facial)project=corregirProyecto(validateProject(asset.recipe.facial)).project;
// Contexto de la historia: con él se abre «En la historia» (personaje fijado, escenario vivo, vida en reposo).
story=m.story&&typeof m.story==='object'&&m.modelUrl?m.story:null;if(story)modo='historia';escena.setHeld(m.visible===false);
sessionCharacter={id:m.characterId,name:m.characterName||'Personaje',url:url.href,direct:true};sessionAnimation=bodyAnimation;
storyActingSig=bodyAnimation?actingSig(project):null;appliedFace=recovered?null:faceDraftJSON()??JSON.stringify(project);
await loadCharacter(url.href,sessionCharacter,project,bodyAnimation);if(recovered)say('Se recuperó tu último trabajo facial en esta actuación. Se llevará a la historia al volver al Estudio o al Taller de animación.');initialized=true;clearInterval(timer);post('LOADED');
if(pendingBehaviorUrl){const next=pendingBehaviorUrl;pendingBehaviorUrl=null;void updateStoryBody(next);}}catch(error){say(error.message);post('ERROR',{message:error.message});}finally{initializing=false;}});
// ── La historia es una sola: lo que cambia aquí llega a la historia y lo que cambia en el Taller de animación llega aquí.
// Cuerpo de la historia (el de la actuación guardada, con las correcciones del Taller de animación): manda sobre el
// cuerpo que recalcula la actuación de la biblioteca, mientras no se elija aquí otra actuación corporal.
let storyActingSig=null,appliedFace=null,pendingBehaviorUrl=null;
function actingSig(p){return JSON.stringify((p?.instances||[]).map(i=>i.acting?[i.presetId,i.start,i.duration,i.acting]:null));}
const useStoryBody=evaluation=>!!body&&storyActingSig!==null&&!!evaluation&&actingSig(evaluation)===storyActingSig;
/** Borrador facial de esta actuación (lo escribe FacialLibrary en cada cambio confirmado). */
function faceDraftJSON(){try{const saved=draftKey&&JSON.parse(localStorage.getItem(draftKey)||'null');return saved?.project?JSON.stringify(saved.project):null;}catch{return null;}}
/** Hay rostro sin llevar a la historia. */
const facePending=()=>modo==='historia'&&!!story&&initialized&&!!library&&character?.id===sessionCharacter?.id&&!daily&&faceDraftJSON()!==null&&faceDraftJSON()!==appliedFace;
/** El Taller de animación llevó a la historia un cuerpo nuevo: se cambia aquí en caliente, sin recargar. */
async function updateStoryBody(url){
  try{
    const parsed=new URL(url);if(parsed.origin!==new URL(API).origin||!/^\/(?:taller\/)?ecosystem\/assets\/[a-f0-9-]{36}\.json$/.test(parsed.pathname))return;
    const asset=await (await fetch(url,{cache:'no-store'})).json();if(!asset?.animation)return;
    sessionAnimation=asset.animation;
    if(!mixer||character?.id!==sessionCharacter?.id||daily)return;
    body?.stop();if(bodyClip)mixer.uncacheClip(bodyClip);
    bodyClip=T.AnimationClip.parse(asset.animation);bodyClip.tracks=bodyClip.tracks.filter(t=>!t.name.includes('morphTargetInfluences'));
    body=mixer.clipAction(bodyClip);body.setLoop(T.LoopOnce,1);body.clampWhenFinished=true;body.play();body.time=Math.min(bodyClip.duration,library?.state?.time||0);mixer.update(0);
    // El cuerpo que vale es el de la historia mientras la actuación corporal sea la misma.
    storyActingSig=actingSig(library?.evaluation||asset.recipe?.facial);
    say('Cuerpo actualizado con los cambios del Taller de animación.');
  }catch(error){console.warn('Cuerpo de la historia',error);}
}
returnButton.onclick=function(){sendToStory(returnButton===this);};
function sendToStory(apply,auto=false){try{const project=library.exportProject(),ids=new Set(project.instances.map(i=>i.presetId)),used=new Set(project.presets.filter(p=>ids.has(p.id)).flatMap(p=>Object.keys(p.channels))),missing=[...used].filter(n=>library.player.report.missing.includes(n)||library.player.report.zeroDelta.includes(n));if(missing.length)throw Error('Adapta los canales que faltan antes de aplicar: '+missing.join(', '));if(Object.keys(map).length)project.rigMap={...map};else delete project.rigMap;if(gain&&Object.keys(gain).length)project.rigGain={...gain};else delete project.rigGain;if(sessionCharacter&&character.id!==sessionCharacter.id){delete project.rigMap;delete project.rigGain;}if(!project.instances.length)throw Error('Elige una actuación o una expresión y pulsa «Aplicar a la pista» (o deja la vista previa de una actuación) antes de usarla.');
  // En la historia: el Taller de animación hornea cuerpo + rostro y la actuación queda en la historia en un clic.
  const main=project.instances.find(i=>i.acting)||project.instances.at(-1);post('RESULT',{project,characterId:character.id,name:project.presets.find(p=>p.id===main?.presetId)?.name,...(apply?{apply:true}:{}),...(auto?{auto:true}:{})});
  if(apply)appliedFace=faceDraftJSON()??JSON.stringify(project);
  say(apply?(auto?'Rostro llevado a la historia.':'Uniendo el rostro al cuerpo y llevándolo a la historia…'):'Rostro enviado al Taller de animación.');return true;}catch(error){say(error.message);return false;}}
bodyButton.onclick=function(){sendToStory(false);};
const timer=session&&partner?setInterval(()=>{if(!initialized)post('READY');},750):null;if(timer)post('READY');
// Orden de cada fotograma: vida en reposo → cuerpo (actuación, clip del Taller o clip del modelo) →
// vida encima (si el cuerpo es de una actuación, solo habla, pelo y trenza) → capa facial → dientes.
const clock=new T.Clock();
renderer.setAnimationLoop(now=>{const dt=clock.getDelta();
  // Oculto en el Estudio (está a la vista el Taller de animación): ni vida, ni actuación, ni render. Comparte hilo y GPU
  // con el Taller de animación y el escenario, y cada fotograma suyo restaba fluidez a lo que sí se ve.
  if(escena.held)return;
  webcam?.before();if(library){library.tick(now);const evaluation=library.evaluation,hasActing=!!(evaluation?.instances.some(i=>i.acting)&&rig.humanoid)&&!daily&&!useStoryBody(evaluation);life?.before();if(hasActing){ENGINE.applyActingProject(rig,evaluation,evaluation.time,ACTS.ACTING_BY_ID);actingApplied=true;}else {if(actingApplied){rig.resetToRest();actingApplied=false;life?.before();}if(body){body.time=daily?tiempoDeCuerpo(now,daily.inicio,daily.duracion,daily.repetir):Math.min(bodyClip.duration,evaluation?.time??library.state.time);forzarEscritura(mixer);mixer.update(0);}else life?.playClip(dt);}life?.after(dt,{bodyOwned:hasActing||!!body});library.applyFace();webcam?.apply();life?.finish(webcam?.active?webcam.mouthSmile:library.mouthSmile);}
  // Cámara fijada en el personaje y, «En escena», huesos + shape keys + vista al escenario de la historia.
  if(!escena.fixed||!escena.on)encuadre.follow();
  // La cámara no atraviesa el suelo (y=0, bajo los pies del personaje): ni ella ni el punto al que mira bajan de él.
  if(controls.target.y<0)controls.target.y=0;if(camera.position.y<.05)camera.position.y=.05;
  escena.tick();escena.render();});
// Toque y mirada al cursor: clic sin arrastrar sobre el personaje → reacción.
let pressed=null;
renderer.domElement.addEventListener('pointerdown',event=>pressed=[event.clientX,event.clientY]);
renderer.domElement.addEventListener('pointerup',event=>{if(life&&pressed&&Math.hypot(event.clientX-pressed[0],event.clientY-pressed[1])<=5)life.pointer(event,renderer.domElement,true);pressed=null;});
renderer.domElement.addEventListener('pointermove',event=>life?.pointer(event,renderer.domElement,false));
renderer.domElement.addEventListener('pointerleave',()=>life?.vida.ponerCursor(null));
// Acceso para agentes y pruebas: inspección y fotogramas exactos, sin clics simulados.
window.tallerFacial={T,scene,camera,controls,renderer,frame,get root(){return root;},get rig(){return rig;},get library(){return library;},get character(){return character;},get gain(){return gain;},get life(){return life;},get engine(){return ENGINE;},get acting(){return ACTS;},get webcam(){return webcam;}};
window.addEventListener('message',event=>{
  const m=event.data;if(event.source!==partner||event.origin!==origin||m?.channel!==channel||m.version!==1||m.session!==session)return;
  if(m.type==='WEBCAM_STOP')webcam?.stop();
  // El Estudio lo muestra u oculta (precarga, cambio de taller): oculto no entra en escena.
  if(m.type==='VISIBLE')escena.setHeld(m.visible===false);
  if(m.type==='VIEWPORT_RECT')escena.fixed=setSharedViewport(m.rect);
  if(m.type==='SCENE_REPLY')escena.receive(m.reply,event.ports);
  // El Taller de animación llevó un cuerpo nuevo a la historia: se cambia aquí sin recargar.
  if(m.type==='BEHAVIOR_UPDATE'&&typeof m.behaviorUrl==='string'){if(initialized)void updateStoryBody(m.behaviorUrl);else pendingBehaviorUrl=m.behaviorUrl;}
  // El Estudio pide llevar a la historia el rostro pendiente (se vuelve al Estudio o al Taller de animación).
  if(m.type==='FLUSH'){const sent=facePending()?sendToStory(true,true):false;post('FLUSHED',{requestId:m.requestId,sent});}
  if((m.type==='USAGE'||m.type==='REPLACED')&&pendientes.has(m.requestId)){const fn=pendientes.get(m.requestId);pendientes.delete(m.requestId);fn(m);}
});
// Recarga en caliente: si cambia en disco la biblioteca de actuaciones o el motor corporal, se cargan las
// versiones nuevas y la actuación elegida vuelve a empezar con ellas, sin recargar el Estudio ni reabrir el Taller.
const WATCH=[new URL('./ActingLibrary.mjs',import.meta.url).href,API+'/ecosystem/body/acting.js'];let watched=null,reloading=false;
const digest=text=>{let h=0;for(let i=0;i<text.length;i++)h=(h*31+text.charCodeAt(i))|0;return text.length+':'+h;};
async function watchActing(){
  if(reloading||document.hidden)return;reloading=true;
  try{
    const now=(await Promise.all(WATCH.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.text():'')))).map(digest).join('|');
    if(watched===null||now===watched){watched??=now;return;}
    watched=now;const v=Date.now(),[lib,eng]=await Promise.all([import(WATCH[0]+'?v='+v),import(WATCH[1]+'?v='+v)]);
    // Los ajustes de articulaciones del perfil del personaje pasan al motor nuevo.
    if(rig&&ENGINE.armLimits&&eng.setArmLimits)eng.setArmLimits(rig,ENGINE.armLimits(rig));
    ACTS={ACTING_BY_ID:lib.ACTING_BY_ID,actingProject:corrigeActuacion(lib.actingProject)};ENGINE=eng;
    refreshActing?.();say('Actuaciones actualizadas: versión nueva cargada sin recargar el Estudio.');
  }catch(error){console.warn('Recarga de actuaciones',error);}finally{reloading=false;}
}
const watchTimer=setInterval(watchActing,1500);
window.addEventListener('pagehide',()=>{clearInterval(watchTimer);webcamCommands?.close();webcam?.dispose();if(timer)clearInterval(timer);renderer.setAnimationLoop(null);renderer.dispose();},{once:true});
