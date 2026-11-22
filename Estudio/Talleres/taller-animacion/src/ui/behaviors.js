import * as THREE from 'three';
import { loadModelURL } from '../io/loaders.js';
import { clipFromJSON, clipToJSON } from '../core/clip.js';
import { bakeAnimationClip, bakeCanonical } from '../io/exporter.js';
import { portableAnimation } from '../core/behavior.js';
import {bakeActingClip} from '../core/acting.js';
import { db } from '../io/storage.js';
import { studioInit, studioInitWithin } from '../io/studio-boot.js';
import './behaviors.css';

// El Taller facial es parte del Estudio y lo sirve este mismo Taller (/facial); solo se abre dentro del Estudio.
const CHANNEL='spanstories.workshop',FACIAL=location.origin;
const allowedHosts=new Set(['http://localhost:3000','http://127.0.0.1:3000']);
const uid=()=>crypto.randomUUID();
const FACIAL_MODULES=['/ecosystem/facial/FacialCore.mjs','/ecosystem/facial/FacialPresets.mjs','/ecosystem/facial/FacialRigAdapter.mjs','/ecosystem/facial/ActingLibrary.mjs','/ecosystem/facial/CorreccionesFaciales.mjs'];
let facialModules=null;
/** Empieza a cargar los módulos faciales en paralelo; main.js lo llama al arrancar, mientras baja el personaje. */
export function preloadFacialModules(){
  facialModules??=Promise.all(FACIAL_MODULES.map(url=>import(/* @vite-ignore */ url)));
  facialModules.catch(()=>{facialModules=null;});
  return facialModules;
}
export async function mountBehaviors(app) {
  // Los cuatro módulos faciales se piden a la vez (y desde el arranque: preloadFacialModules); en serie tardaban ~5 s.
  const [core,{BASE_PRESETS},{facialPlayerForRig},acting,corrections]=await preloadFacialModules();
  // Correcciones generales del Taller facial (modo General): lo que se hornea aquí ya sale corregido.
  await corrections.cargarCorrecciones('/ecosystem/correcciones-faciales');corrections.corregirLista(BASE_PRESETS);
  const corrected=fn=>(...args)=>corrections.corregirProyecto(fn(...args)).project;
  const actingURL=FACIAL_MODULES[3];let {ACTING_BY_ID,STYLES=[],actingProject,channelPeak}=acting;actingProject=corrected(actingProject);
  // Al elegir una actuación se toma la versión guardada más reciente (se retocan a menudo; sin esto hacía
  // falta recargar el Estudio entero para ver un cambio).
  // Solo se vuelve a importar si el archivo cambió: cada import con ?v= nuevo deja otra copia del módulo en memoria.
  let actingText=null,actingVersion=0;
  async function freshActing(){try{const text=await (await fetch(actingURL,{cache:'no-store'})).text();if(actingText!==null&&text===actingText)return;const first=actingText===null;actingText=text;if(first)return;({ACTING_BY_ID,actingProject,channelPeak}=await import(/* @vite-ignore */ actingURL+'?v='+(++actingVersion)+'-'+Date.now()));actingProject=corrected(actingProject);await corrections.cargarCorrecciones('/ecosystem/correcciones-faciales');}catch(error){console.warn('Biblioteca de actuaciones',error);}}
  const catalog=(await (await fetch('/comportamientos/catalogo.json')).json()).behaviors;
  const params=new URLSearchParams(location.search),session=params.get('studioSession'),hostOrigin=params.get('studioOrigin');
  const embedded=!!session&&allowedHosts.has(hostOrigin)&&parent!==window;
  let context=null,selected=null,bodyReady=false,waitingBody=false,root=null,player=null,faceProject=null,faceWindow=null,faceToken=null,faceOverlay=null,savedItems=[],dirty=false,rigMapKey='',studioKey=null,aliasKey=null,legacyStudioKeys=[],lastFaceJSON='null',faceDate=0;
  // Actuación que la historia tiene ahora (la del INIT y después la de cada guardado), dueño de la cargada y firma
  // de lo último llevado a la historia (null = hay trabajo sin llevar).
  let currentBehavior=null,loadedOwner=null,appliedSig=null;
  const panel=document.createElement('section');panel.className='behaviorPanel';
  panel.setAttribute('aria-label','Biblioteca de comportamientos');
  panel.innerHTML=`<header><strong>Comportamientos · cuerpo + rostro</strong></header>
  <p data-id="context">Biblioteca del Taller · variantes por personaje</p><div class="behaviorTools"><input data-id="search" aria-label="Buscar comportamiento" placeholder="Buscar emoción o comportamiento"><button data-id="refresh">Actualizar</button></div>
  <label>Configuración<select data-id="style" aria-label="Configuración femenina o masculina">${STYLES.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
  <select data-id="catalog" size="5" aria-label="Comportamientos de la biblioteca"></select><small>50 actuaciones de cuerpo y rostro. Revisión visual por personaje pendiente.</small>
  <label>Variantes guardadas<select data-id="saved" aria-label="Variante guardada"><option value="">Elegir una variante…</option></select></label>
  <label>Nombre de la variante<input data-id="name" aria-label="Nombre del comportamiento" maxlength="160"></label>
  <label>Cuerpo<select data-id="body" aria-label="Clip corporal del comportamiento"></select></label>
  <label>Expresión facial<select data-id="face" aria-label="Expresión facial del comportamiento"></select></label>
  <div class="behaviorTools"><label>Duración (s)<input data-id="duration" aria-label="Duración del comportamiento" type="number" min="0.1" max="120" step="0.1" value="4"></label><label>Intensidad facial<input data-id="intensity" aria-label="Intensidad facial del comportamiento" type="number" min="0" max="1" step="0.05" value="0.75"></label></div>
  <button data-id="editFace">Editar en el editor facial ↗</button><button data-id="play">Reproducir cuerpo + rostro</button>
  <p data-id="requirement"></p><p data-id="compatibility"></p><p data-id="status" role="status"></p>
  <div class="behaviorTools"><button data-id="save">Guardar variante</button><button data-id="return" class="primary">Usar en la historia</button></div><small>«Guardar variante» crea una variante nueva en la biblioteca. «Usar en la historia» reemplaza la actuación de esta historia (sin duplicados); al pasar al Taller facial o volver al Estudio se lleva sola.</small>`;
  document.getElementById('paneComportamientos').append(panel);
  const $=id=>panel.querySelector(`[data-id="${id}"]`);
  // Pestaña «Comport.» de la columna derecha (antes flotaba sobre el visor).
  const tab=document.querySelector('[data-tabs=right] [data-tab=comportamientos]');
  const showPanel=()=>{if(!tab.classList.contains('on'))tab.click();};
  tab.addEventListener('click',()=>{refreshBodies();void refreshSaved().catch(e=>status(e.message,true));});
  const status=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
  const safe=fn=>async()=>{try{await fn();}catch(e){status(e.message,true);}};
  const post=(type,data={})=>{if(embedded)parent.postMessage({channel:CHANNEL,version:1,session,type,...data},hostOrigin);};
  function getPlayer(){
    const facial=app.engine.doc.facialProject,key=JSON.stringify([facial?.rigMap||{},facial?.rigGain||null]);
    // La fuerza de cada shape key en este personaje viaja con la actuación; sin ella se mide una vez.
    if(root!==app.rig.root||key!==rigMapKey){player?.restore();root=app.rig.root;rigMapKey=key;player=facialPlayerForRig(root,facial?.rigMap||{});player.setGain(facial?.rigGain||(player.bindings?core.suggestGain(player.bindings):{}));}
    return player;
  }
  /**
   * Rostro de un motor propio (el jinete de una actuación montada): lee SU documento y SU rig, no los del actor activo.
   * Sin esto, el motor del jinete no evaluaba el rostro: no se veía al editar ni se horneaba al guardar.
   */
  app.bindFace=engine=>{
    let boundRoot=null,boundKey='',boundPlayer=null;
    engine.evaluateFace=f=>{
      const doc=engine.doc.facialProject,key=JSON.stringify([doc?.rigMap||{},doc?.rigGain||null]);
      if(boundRoot!==engine.rig.root||key!==boundKey){
        boundPlayer?.restore();boundRoot=engine.rig.root;boundKey=key;
        boundPlayer=facialPlayerForRig(boundRoot,doc?.rigMap||{});
        boundPlayer.setGain(doc?.rigGain||(boundPlayer.bindings?core.suggestGain(boundPlayer.bindings):{}));
      }
      if(doc?.instances?.length)boundPlayer.apply(core.evaluate(doc.presets,doc.instances,f/engine.doc.fps));
      else if(boundPlayer.enabled)boundPlayer.restore();
    };
    return engine;
  };
  app.engine.evaluateFace=f=>{
    const p=getPlayer(),doc=app.engine.doc.facialProject;
    if(doc?.instances?.length)p.apply(core.evaluate(doc.presets,doc.instances,f/app.engine.doc.fps));
    else if(p.enabled)p.restore();
  };
  function renderCatalog(){const query=$('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();$('catalog').replaceChildren(...catalog.filter(c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)).map(c=>new Option(`${c.name} · cuerpo + rostro`,c.id)));if(selected)$('catalog').value=selected.id;}
  function installActing(project){
    if(!app.rig.humanoid)throw Error('El personaje necesita un esqueleto humanoide compatible con Mixamo.');
    const body=bakeActingClip(app.rig,project,ACTING_BY_ID,{id:'acting:'+uid(),name:$('name').value||'Actuación'});body.pack='Actuaciones';app.library.set(body.id,body);app.useClip(body.id);bodyReady=true;waitingBody=false;faceProject=project;app.engine.doc.facialProject=project;refreshBodies();$('body').value=body.id;return body;
  }
  function refreshBodies(){
    const value=$('body').value;$('body').replaceChildren(new Option('Seleccionar un movimiento…',''));
    const groups=new Map();for(const c of app.library.values()){const group=c.pack||c.source||'Tuyas';if(!groups.has(group)){const g=document.createElement('optgroup');g.label=group;groups.set(group,g);$('body').append(g);}groups.get(group).append(new Option(c.name,c.id));}
    $('body').value=value; if(!value&&selected?.bodyCandidate&&app.library.has(selected.bodyCandidate.id))$('body').value=selected.bodyCandidate.id;
    if(waitingBody&&$('body').value){setBody();status('Movimiento candidato cargado. Revisa cuerpo y rostro juntos.');}
  }
  function configureFace(){
    const rigMap=faceProject?.rigMap;
    const p=BASE_PRESETS.find(p=>p.id===$('face').value)||faceProject?.presets.find(p=>p.id===$('face').value),duration=Number($('duration').value),intensity=Number($('intensity').value);
    if(!Number.isFinite(duration)||duration<.1||duration>120||!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('Duración o intensidad fuera de rango.');
    app.pushUndo();faceProject={schema:'spanstories.facial-project',version:1,presets:p?[structuredClone(p)]:[],instances:p?[{id:uid(),presetId:p.id,start:0,duration,intensity,fadeIn:Math.min(.15,duration*.1),fadeOut:Math.min(.2,duration*.1),trimStart:0,trimEnd:p.duration,priority:0,blend:'override',loop:false,movement:{id:'none',intensity:0,delay:0}}]:[],favorites:[]};
    if(rigMap)faceProject.rigMap=structuredClone(rigMap);core.validateProject(faceProject);app.engine.doc.facialProject=faceProject;dirty=true;app.changed();report();
  }
  function setBody(){
    const id=$('body').value;bodyReady=!!id&&app.library.has(id);
    if(bodyReady)waitingBody=false;
    if(bodyReady){app.useClip(id);if(faceProject){for(const i of faceProject.instances)delete i.acting;for(const p of faceProject.presets)if(p.defaults)delete p.defaults.acting;}}
    if(faceProject)app.engine.doc.facialProject=faceProject;
    setDuration();dirty=true;report();
  }
  function setDuration(){const duration=Number($('duration').value);if(!Number.isFinite(duration)||duration<.1||duration>120)throw Error('Duración entre 0.1 y 120 segundos.');const doc=app.engine.doc;doc.rangeMode='manual';doc.start=0;doc.end=Math.round(duration*doc.fps);if(doc.strips.length===1){const strip=doc.strips[0],clip=app.library.get(strip.clipId);strip.len=doc.end+1;strip.loop=false;if(clip?.duration>0)strip.speed=clip.duration/duration;}app.changed();}
  function showFace(){const i=faceProject?.instances[0],p=faceProject?.presets.find(p=>p.id===i?.presetId);if(p){if(![...$('face').options].some(o=>o.value===p.id))$('face').append(new Option(p.name,p.id));$('face').value=p.id;$('intensity').value=i.intensity;}else $('face').value='';}
  function report(){const p=getPlayer(),ids=new Set(faceProject?.instances.map(i=>i.presetId)||[]),used=new Set((faceProject?.presets||[]).filter(p=>ids.has(p.id)).flatMap(p=>Object.keys(p.channels)));const missing=[...used].filter(n=>p.report.missing.includes(n)||p.report.zeroDelta.includes(n));$('compatibility').textContent=missing.length?`El rostro de este personaje no reproduce: ${missing.join(', ')}.`:used.size?'Canales faciales presentes; actuación pendiente de revisión visual.':'Solo cuerpo: sin expresión facial asociada.';$('return').disabled=!embedded||!context||app.mode==='maniqui';$('return').title=app.mode==='maniqui'?'Estás en Maniquí (animación general). Cambia a En escena para usarla en la historia.':'';return missing;}
  async function choose(id){await freshActing();selected=catalog.find(c=>c.id===id);if(!selected)throw Error('Comportamiento desconocido.');app.pushUndo();$('name').value=selected.name;$('requirement').textContent=selected.actingRequirement;const style=$('style')?.value||undefined,project=core.validateProject(actingProject(id,undefined,style));if(faceProject?.rigMap)project.rigMap=structuredClone(faceProject.rigMap);$('duration').value=(ACTING_BY_ID.get(style?id+'@'+style:id)||ACTING_BY_ID.get(id)).duration;installActing(project);showFace();setDuration();app.setFrame(0);dirty=true;report();status('Actuación conjunta aplicada: cuerpo Mixamo y rostro FACEIT. Revisa su adaptación visual.');}
  async function refreshSaved(){const r=await fetch('/ecosystem/library');const d=await r.json();if(!r.ok)throw Error(d.error);savedItems=d.items;$('saved').replaceChildren(new Option('Elegir una variante…',''),...savedItems.map(c=>new Option(`${c.name} · ${c.characterId===app.charMeta.id?'este personaje':'otro personaje'}`,c.url)));}
  /** `revision`: la que la historia guardó (se archiva al reemplazarla); si ya no está archivada se abre la última. */
  async function fetchAsset(url,revision){
    const parsed=new URL(url,location.origin);if(parsed.origin!==location.origin||!/^\/ecosystem\/assets\/[a-f0-9-]{36}\.json$/.test(parsed.pathname))throw Error('Actuación fuera de la biblioteca local.');
    if(Number.isInteger(revision)&&revision>=0){
      const pinned=new URL(parsed);pinned.searchParams.set('revision',String(revision));
      const r=await fetch(pinned,{cache:'no-store'});
      if(r.ok)return r;
      if(r.status!==404)throw Error('No se pudo recuperar la actuación.');
      status('La revisión guardada en la historia ya no está archivada: se abre la última.',true);
    }
    return fetch(parsed,{cache:'no-store'});
  }
  async function loadAsset(url,revision){const r=await fetchAsset(url,revision);if(!r.ok)throw Error('No se pudo recuperar la actuación.');const d=await r.json();loadedOwner={id:d.id,owner:d.owner||null};const project=core.validateProject(d.recipe.facial);if(d.characterId!==app.charMeta.id){delete project.rigMap;if(faceProject?.rigMap)project.rigMap=structuredClone(faceProject.rigMap);}let body;$('name').value=d.name;$('duration').value=d.duration;if(project.instances.some(i=>i.acting))body=installActing(project);else {body=clipFromJSON(d.recipe.body);app.library.set(body.id,body);app.useClip(body.id);bodyReady=true;faceProject=project;app.engine.doc.facialProject=project;}showFace();refreshBodies();$('body').value=body.id;setDuration();app.changed();const missing=report();status(missing.length?'Adaptación parcial: asigna los canales faciales que faltan antes de guardar.':'Variante adaptada al personaje actual con cuerpo y rostro; revisa su deformación.');dirty=d.characterId!==app.charMeta.id;return d;}
  // Firma de lo que hay en el Taller: si difiere de lo último llevado a la historia, hay cambios pendientes.
  const signature=()=>{try{return JSON.stringify([app.charMeta?.id,app.engine.doc,faceProject]);}catch{return String(Date.now());}};
  // Los guardados van en fila: «Usar en la historia» del facial y el vaciado al salir no se pisan.
  let queue=Promise.resolve();
  const serial=fn=>{const run=queue.then(fn,fn);queue=run.catch(()=>{});return run;};
  /**
   * returnToStory=false → «Guardar variante»: versión nueva en la biblioteca (para reutilizarla en otras escenas).
   * returnToStory=true  → «Modificación en historia»: reemplaza la actuación propia de esta historia (mismo archivo,
   * revisión nueva); solo la primera vez, si venía de la biblioteca o de otra historia, se crea su copia propia.
   * auto: llevado a la historia al salir del Taller (no cierra el Taller ni cambia de panel en el Estudio).
   */
  function save(returnToStory=false,{auto=false}={}){return serial(async()=>{
    if(returnToStory&&app.mode==='maniqui')throw Error('Estás en Maniquí (animación general). Cambia a En escena para usarla en la historia.');
    if(returnToStory&&app.animales?.activePair()){
      if(app.dragging)throw Error('Suelta el control del rig antes de guardar.');
      const sig=app.animales.mountedSignature();
      const bakedPair=app.animales.activePair(),baked=app.animales.bakeMounted();
      const items=await Promise.all(baked.map(async ({slot,name,animation,body,facial,mounted})=>{
        // Misma clave que la actuación de un solo actor (y su alias de antes de que existiera el cue).
        const ownerOf=withCue=>[context.storyId,slot.meta.id,context.sceneId,slot.id,(withCue&&slot.info.cueId)||context.sequenceId||context.sequenceName]
          .filter(v=>typeof v==='string'&&v).join(':').slice(0,300);
        const owner=ownerOf(true),ownerAlias=slot.info.cueId?ownerOf(false):null;
        const previous=slot.reference||slot.info.behavior;
        // El rostro de este actor ya se hornea con su documento (`facial`). Solo una actuación antigua, que no guardó
        // el rostro en su receta, conserva las pistas faciales de la versión anterior.
        if(previous?.url&&!facial?.instances?.length){
          const response=await fetch(previous.url,{cache:'no-store'});
          if(!response.ok)throw Error('No se pudo recuperar el movimiento facial de '+slot.meta.name);
          const prior=(await response.json()).animation?.tracks||[];
          for(const track of prior.filter(track=>track.name.endsWith('.morphTargetInfluences'))){
            // El rostro que se acaba de hornear manda: la pista anterior solo cubre lo que el nuevo horneado no trae.
            if(animation.tracks.some(item=>item.name===track.name))continue;
            const count=track.times.findIndex(time=>time>animation.duration);
            if(count<0)animation.tracks.push(track);
            else if(count>0)animation.tracks.push({...track,times:track.times.slice(0,count),
              values:track.values.slice(0,count*track.values.length/track.times.length)});
          }
        }
        const asset={schema:'spanstories.behavior',version:1,name,characterId:slot.meta.id,duration:animation.duration,
          animation,recipe:{body,facial,mounted},review:{status:'unreviewed'},owner,
          ...(ownerAlias?{ownerAlias}:{}),
          ...(previous?.id?{replace:previous.id}:{})};
        const response=await fetch('/ecosystem/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(asset)});
        const behavior=await response.json();
        if(!response.ok)throw Error(behavior.error||'No se pudo guardar la actuación de '+slot.meta.name);
        slot.reference=behavior;
        return {actorId:slot.id,behavior,role:slot===bakedPair.horse?'horse':'rider'};
      }));
      mountedApplied=sig;
      post('MOUNTED_RESULT',{items});
      return items;
    }
    // Una animación hecha a mano en el Taller (Editar capa de movimiento, capas, títere…) también vale: basta con que haya tiras.
    if(!bodyReady&&app.engine.doc.strips.length)bodyReady=true;
    if(!bodyReady||!app.engine.doc.strips.length)throw Error('Selecciona un clip corporal antes de guardar.');
    if(report().length)throw Error('La expresión usa canales faciales ausentes o sin deformación. Elige un rostro compatible o «Sin expresión facial».');
    let name=$('name').value.trim();
    if(!name&&auto){name=(context?.sequenceName||'Actuación').slice(0,160);$('name').value=name;}
    if(!name)throw Error('Escribe un nombre para la actuación.');
    const frame=app.engine.frame,sig=signature();
    try{
      const body=clipToJSON(bakeCanonical(app.engine,{id:'behavior:'+uid(),name}));
      const animation=portableAnimation(bakeAnimationClip(app.engine,name,app.engine.range(),{sourceHierarchy:true}),app.rig.root);
      const asset={schema:'spanstories.behavior',version:1,name,characterId:app.charMeta.id,duration:animation.duration,animation,recipe:{body,facial:faceProject||{schema:'spanstories.facial-project',version:1,presets:[],instances:[],favorites:[]}},provenance:{bodyCandidate:selected?.bodyCandidate||null,facialSources:faceProject?.presets.map(p=>p.source)||[]},review:{status:'unreviewed'}};
      const inStory=returnToStory&&!!context&&!!studioKey;
      // aliasKey: la clave que tenía esta actuación antes de que su cue existiera (se crea al llevarla a la historia por primera vez).
      if(inStory){asset.owner=studioKey;if(aliasKey)asset.ownerAlias=aliasKey;if(currentBehavior&&loadedOwner?.id===currentBehavior.id&&[studioKey,aliasKey].includes(loadedOwner.owner))asset.replace=currentBehavior.id;}
      const r=await fetch('/ecosystem/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(asset)}),result=await r.json();if(!r.ok)throw Error(result.error);
      dirty=false;
      if(inStory){currentBehavior=result;loadedOwner={id:result.id,owner:studioKey};appliedSig=sig;}
      void refreshSaved().catch(()=>{});
      status(inStory?(asset.replace?'Modificación en historia: actuación de esta historia actualizada (sin duplicados).':'Modificación en historia: esta historia tiene ya su propia actuación.'):'Variante guardada como nueva versión · pendiente de revisión visual.');
      if(returnToStory){if(!context)throw Error('No hay una historia vinculada.');post('RESULT',{behavior:result,...(auto?{auto:true}:{})});}
      return result;
    }finally{app.setFrame(frame);}
  });}
  /** Hay cambios en este Taller que la historia aún no tiene. */
  let mountedApplied=null;
  const pending=()=>embedded&&!!context&&!!studioKey&&characterReady&&app.mode!=='maniqui'&&app.engine.doc.strips.length>0&&
    (app.animales?.activePair()?app.animales.mountedSignature()!==mountedApplied:signature()!==appliedSig);
  /** Lleva a la historia lo pendiente (al pasar al Taller facial o volver al Estudio). Sin recargar nada. */
  const flush=()=>serial(()=>null).then(()=>pending()?save(true,{auto:true}):null);
  app.studioFlush=flush;
  $('search').oninput=renderCatalog;$('catalog').onchange=safe(()=>choose($('catalog').value));if($('style'))$('style').onchange=safe(()=>{if(selected)return choose(selected.id);});$('refresh').onclick=safe(async()=>{await app.scanLibrary();refreshBodies();await refreshSaved();status('Bibliotecas actualizadas.');});
  $('body').onchange=safe(setBody);$('face').onchange=safe(configureFace);$('duration').onchange=safe(()=>{setDuration();if(faceProject){const old=Math.max(.1,...faceProject.instances.map(i=>i.start+i.duration)),scale=Number($('duration').value)/old;faceProject.instances.forEach(i=>{i.start*=scale;i.duration*=scale;i.fadeIn*=scale;i.fadeOut*=scale;});app.engine.doc.facialProject=faceProject;}app.changed();dirty=true;});$('intensity').onchange=safe(()=>{const value=Number($('intensity').value);if(!Number.isFinite(value)||value<0||value>1)throw Error('Intensidad entre 0 y 1.');faceProject?.instances.forEach(i=>i.intensity=value);app.changed();dirty=true;});
  $('saved').onchange=safe(()=>loadAsset($('saved').value));$('save').onclick=safe(()=>save());$('return').onclick=safe(()=>save(true));$('play').onclick=safe(()=>{if(!bodyReady)throw Error('Selecciona primero un cuerpo.');app.setFrame(0);app.playing=!app.playing;});
  $('face').append(new Option('Sin expresión facial',''),...BASE_PRESETS.map(p=>new Option(p.name,p.id)));
  $('editFace').onclick=safe(()=>{
    if(!faceProject?.presets.length){$('face').value=BASE_PRESETS[0].id;configureFace();}
    const source=context?.modelUrl||app.characters.find(c=>c.id===app.charMeta.id)?.url;
    if(!source)throw Error('Importa el personaje desde su biblioteca para abrirlo en el editor facial.');
    if(embedded){faceToken??=uid();post('FACIAL_OPEN',{facialSession:faceToken});status('Abriendo el Taller facial.');return;}
    throw Error('El Taller facial se abre desde el Estudio (Estudio › Taller facial).');
  });
  // The exact window, origin and one-use session identify each partner.
  let characterReady=!embedded,wantFace=false,freeMode=false;
  // Enlace con el Estudio para «En escena» (src/ui/scenelive.js): escenario vivo bajo el visor del Taller.
  app.studioLink={embedded,post,context:()=>context,ready:()=>embedded&&characterReady&&!!context,loaded:()=>characterReady};
  // Borrador por actuación del Estudio (personaje + escena + papel + acción): se guarda solo mientras se trabaja y
  // se recupera al volver a entrar, aunque no se haya pulsado «Usar en la historia». Solo en este navegador (5189).
  const FACE_DRAFT='spanstories.facial-draft.v1:';
  const fieldIds=['name','duration','body','face','intensity'];
  app.studioDraftSave=()=>{
    if(!embedded||!studioKey||!characterReady)return;
    // Actuación montada: el borrador guarda el documento de cada actor (el jinete y el caballo), no el del actor activo.
    const pairDraft=app.animales?.pairDraft();
    if(pairDraft){
      void db.put('projects',{id:'studio:pair:'+studioKey,name:`Estudio · pareja · ${context.sequenceName}`,date:Date.now(),charId:app.charMeta.id,pair:pairDraft,base:baseOf(currentBehavior),pending:app.animales.mountedSignature()!==mountedApplied});
      return;
    }
    const faceJSON=JSON.stringify(faceProject||null);
    if(faceJSON!==lastFaceJSON){lastFaceJSON=faceJSON;faceDate=Date.now();try{if(faceProject)localStorage.setItem(FACE_DRAFT+studioKey,JSON.stringify({date:faceDate,project:faceProject}));}catch{}}
    void db.put('projects',{id:'studio:'+studioKey,name:`Estudio · ${context.sequenceName} · ${context.characterName}`,date:Date.now(),doc:app.engine.doc,charId:app.charMeta.id,faceProject,faceDate,bodyReady,fields:Object.fromEntries(fieldIds.map(id=>[id,$(id)?.value??''])),selected:selected?.id||null,base:baseOf(currentBehavior),pending:signature()!==appliedSig});
  };
  // Versión de la historia sobre la que se trabaja: un borrador hecho sobre otra versión (p. ej. la historia cambió
  // desde el Taller facial) no la pisa.
  const baseOf=b=>b?`${b.id}#${Number(b.revision)||0}`:'';
  async function restoreStudioDraft(){
    // Claves anteriores (sin cue, o sin historia): el filtro de `draft.base` evita recuperar un borrador de otra actuación.
    let draft=await db.get('projects','studio:'+studioKey);
    for(const key of legacyStudioKeys){if(draft)break;draft=await db.get('projects','studio:'+key);}
    if(!draft?.doc||draft.charId!==app.charMeta.id)return false;
    // Borradores con versión: solo si se hicieron sobre la actuación que la historia tiene ahora y les quedaba algo
    // por llevar. Los antiguos (sin versión) se recuperan como antes y se llevan a la historia al salir.
    if(draft.base!==undefined&&(draft.base!==baseOf(currentBehavior)||draft.pending===false))return false;
    app.loadDoc(draft.doc,false);
    faceProject=draft.faceProject||null;app.engine.doc.facialProject=faceProject;lastFaceJSON=JSON.stringify(faceProject);faceDate=draft.faceDate||0;bodyReady=!!draft.bodyReady;
    refreshBodies();for(const id of fieldIds){const el=$(id),v=draft.fields?.[id];if(el&&v!==undefined&&(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===v)))el.value=v;}
    if(faceProject)showFace();dirty=true;app.changed();
    return true;
  }
  const onStudioMessage=async event=>{
    const m=event.data;try{
      if(embedded&&event.source===parent&&event.origin===hostOrigin&&m?.channel===CHANNEL&&m.session===session&&m.version===1&&m.type==='INIT'){
        // El Estudio abrió el Taller sin personaje en la escena: se queda como Taller normal (el personaje se elige aquí).
        if(m.context?.sinPersonaje){if(freeMode||context)return;freeMode=true;app.modes?.adopt('maniqui');panel.querySelectorAll('select,input,button').forEach(el=>el.disabled=false);$('return').disabled=true;post('LOADED');app.afterStudioLoaded?.();characterReady=true;app.sceneLive?.sync();return;}
        if(context)return;context=m.context;
        // Clave del borrador: historia + personaje + escena + papel + acción (la misma que StudioWorkshop.tsx · draftKeyOf).
        // Sin la historia, dos historias con «escena-1» compartían borrador: la clave antigua solo se lee para no perderlo.
        // withCue=false: la clave que tenía antes de que el cue existiera (el cue se crea al llevar la actuación a la historia
        // por primera vez; al reabrir, `cueId` ya viene en el contexto y la clave cambiaba, duplicando la actuación y perdiendo el borrador).
        const keyOf=(withStory,withCue=true)=>[withStory?context.storyId:null,context.characterId,context.sceneId,context.actorId,(withCue&&context.cueId)||context.sequenceId||context.sequenceName].filter(v=>typeof v==='string'&&v).join(':').slice(0,300)||null;
        studioKey=keyOf(true);aliasKey=context.cueId?keyOf(true,false):null;
        legacyStudioKeys=[aliasKey,context.storyId?keyOf(false):null,context.storyId&&context.cueId?keyOf(false,false):null].filter(Boolean);
        if(!context||typeof context.characterId!=='string'||typeof context.modelUrl!=='string')throw Error('Falta el personaje del visor.');
        status('Cargando el personaje de la historia…');showPanel();
        // Normalmente el Taller ya arrancó con este personaje (src/io/studio-boot.js): no se vuelve a cargar.
        if(app.studioBootCharacter!==context.characterId||app.charMeta.id!==context.characterId){
          const model=await loadModelURL('/ecosystem/model?url='+encodeURIComponent(context.modelUrl),'personaje.glb');
          await app.setCharacterRoot(model.root,{id:context.characterId,name:context.characterName},false,false);
        }
        app.studioBootCharacter=null;
        app.engine.doc.facialProject=null;bodyReady=false;faceProject=null;app.useClip('gen_reposo',false);
        $('context').textContent=`Historia · ${context.sequenceName} · ${context.characterName}`;
        currentBehavior=context.behavior||null;
        let openedAsset;
        if(context.behavior?.url)openedAsset=await loadAsset(context.behavior.url,context.behavior.revision);else {refreshBodies();report();status('Elige un comportamiento o un clip corporal para esta actuación.');}
        // Lo que acaba de llegar de la historia ya está en la historia: no hay nada pendiente.
        appliedSig=signature();
        const restored=studioKey?await restoreStudioDraft().catch(e=>{console.warn('Borrador del Estudio',e);return false;}):false;
        if(restored)appliedSig=null;
        panel.querySelectorAll('select,input,button').forEach(el=>el.disabled=false);report();post('LOADED');app.afterStudioLoaded?.();characterReady=true;app.sceneLive?.sync();
        if(openedAsset?.recipe?.mounted){
          // Borrador de la pareja (claves actual y anteriores): solo si se hizo sobre la actuación que la historia tiene ahora.
          let pairDraft=null;
          for(const key of [studioKey,...legacyStudioKeys]){const saved=await db.get('projects','studio:pair:'+key).catch(()=>null);if(saved?.pair&&saved.base===baseOf(currentBehavior)&&saved.pending!==false){pairDraft=saved.pair;break;}}
          try{
            const mode=await app.animales.restoreMounted(openedAsset,{draft:pairDraft});
            // Con borrador, lo recuperado aún no está en la historia: queda pendiente de llevar.
            if(mode)mountedApplied=mode==='draft'?null:app.animales.mountedSignature();
            if(mode==='draft')status('Se recuperó tu último trabajo en la actuación montada. Se llevará a la historia al pasar de taller o volver al Estudio.');          }catch(error){
            if(!pairDraft)status(error.message,true);
            else{try{const mode=await app.animales.restoreMounted(openedAsset);if(mode)mountedApplied=app.animales.mountedSignature();status('No se pudo recuperar el borrador de la pareja ('+error.message+'): se abrió el último guardado.',true);}catch(again){status(again.message,true);}}
          }
        }
        if(restored)status('Se recuperó tu último trabajo en esta actuación. Se llevará a la historia al pasar al Taller facial o volver al Estudio.');
        if(context.editor==='face'||wantFace)$('editFace').click();
      }
      // El Estudio abrió el Taller facial directamente: esta es su sesión (para recibir «Aplicar y volver»).
      if(embedded&&event.source===parent&&event.origin===hostOrigin&&m?.channel===CHANNEL&&m.session===session&&m.version===1&&m.type==='SCENE_REPLY'){app.sceneLive?.receive(m.reply,event.ports);return;}
      // El Estudio pide llevar a la historia lo pendiente (se pasa al Taller facial o se vuelve al Estudio).
      if(embedded&&event.source===parent&&event.origin===hostOrigin&&m?.channel===CHANNEL&&m.session===session&&m.version===1&&m.type==='FLUSH'){
        let saved=null,error=null;try{saved=await flush();}catch(e){error=e.message;status('No se pudo llevar a la historia: '+e.message,true);}
        post('FLUSHED',{requestId:m.requestId,saved:!!saved,...(error?{error}:{})});return;
      }
      if(embedded&&event.source===parent&&event.origin===hostOrigin&&m?.channel===CHANNEL&&m.session===session&&m.version===1&&m.type==='FACIAL_ADOPT'&&typeof m.facialSession==='string'){faceToken=m.facialSession;wantFace=false;return;}
      if(embedded&&event.source===parent&&event.origin===hostOrigin&&m?.channel===CHANNEL&&m.session===session&&m.version===1&&m.type==='EDITOR'){
        // Pedido mientras el personaje aún carga: se abre en cuanto esté (antes el clic se perdía).
        if(m.editor==='face'){if(characterReady)$('editFace').click();else {wantFace=true;status('El Taller facial se abrirá en cuanto termine de cargar el personaje…');}}
        else {if(faceOverlay)faceOverlay.hidden=true;showPanel();}
      }
      if(((event.source===faceWindow&&event.origin===FACIAL)||(embedded&&event.source===parent&&event.origin===hostOrigin))&&m?.channel==='spanstories.facial-workshop'&&m.version===1&&m.session===faceToken){
        if(m.type==='READY'){
          const source=context?.modelUrl||app.characters.find(c=>c.id===app.charMeta.id)?.url;
          const frame=app.engine.frame;let animation;try{const clip=bakeAnimationClip(app.engine,'Cuerpo de referencia');clip.tracks=clip.tracks.filter(t=>!t.name.endsWith('.morphTargetInfluences'));animation=portableAnimation(clip,app.rig.root);}finally{app.setFrame(frame);}
          (embedded?parent:faceWindow).postMessage({channel:m.channel,version:1,session:faceToken,type:'INIT',project:faceProject,modelUrl:'http://127.0.0.1:5189/ecosystem/model?url='+encodeURIComponent(new URL(source,location.origin).href),characterId:app.charMeta.id,characterName:app.charMeta.name,bodyAnimation:animation,draftKey:studioKey,projectDate:faceDate},embedded?hostOrigin:FACIAL);
        }
        if(m.type==='RESULT'){
          const checked=core.validateProject(m.project);checked.instances.forEach(i=>i.movement={id:'none',intensity:0,delay:0});
          // El cuerpo solo se vuelve a hornear si cambió su parte corporal: así una corrección hecha aquí al cuerpo no se
          // pierde cuando el Taller facial devuelve el rostro.
          const actingOf=p=>JSON.stringify((p?.instances||[]).map(i=>i.acting?[i.presetId,i.start,i.duration,i.acting]:null));const sameBody=bodyReady&&actingOf(faceProject)===actingOf(checked);
          app.pushUndo();faceProject=checked;app.engine.doc.facialProject=faceProject;if(typeof m.name==='string'&&m.name.trim())$('name').value=m.name.trim();const combined=checked.instances.some(i=>i.acting);if(combined&&!sameBody)installActing(checked);$('duration').value=combined?Math.max(.1,...checked.instances.map(i=>i.start+i.duration)):Math.max(Number($('duration').value),.1,...checked.instances.map(i=>i.start+i.duration));setDuration();showFace();app.changed();dirty=true;report();if(!m.apply){faceToken=null;faceOverlay?.remove();faceOverlay=null;}status(combined?'Actuación recibida con cuerpo y rostro coordinados.':'Variante facial recibida; el cuerpo conserva su clip.');
          // «Usar en la historia» desde el Taller facial: se hornea aquí (cuerpo + rostro) y se manda a la historia en un clic.
          // Sin cuerpo elegido, el rostro va sobre el reposo del personaje.
          if(m.apply&&embedded){if(!bodyReady&&app.engine.doc.strips.length)bodyReady=true;try{await save(true,{auto:!!m.auto});}catch(error){status(error.message,true);post('ERROR',{message:'No se pudo usar en la historia: '+error.message});}}
          else if(embedded)post('FACIAL_CLOSE');
        }
        if(m.type==='ERROR')status(m.message,true);
      }
    }catch(e){status(e.message,true);post('ERROR',{message:e.message});}
  };
  window.addEventListener('message',onStudioMessage);
  let lastCount=app.library.size;const refreshTimer=setInterval(()=>{if(lastCount!==app.library.size){lastCount=app.library.size;refreshBodies();}},1000);
  window.addEventListener('pagehide',()=>clearInterval(refreshTimer),{once:true});
  app.onModeChange=()=>{try{report();}catch{}};
  renderCatalog();refreshBodies();void refreshSaved().catch(e=>status(e.message,true));report();
  if(embedded){
    showPanel();panel.querySelectorAll('select,input,button').forEach(el=>el.disabled=true);
    // El INIT que el Estudio mandó al arrancar (src/io/studio-boot.js) se atiende ya; si aún no llegó, se pide otra vez.
    const early=await studioInitWithin(0);
    if(early)void onStudioMessage({data:early,source:parent,origin:hostOrigin});
    else {post('READY');studioInit.then(m=>m&&onStudioMessage({data:m,source:parent,origin:hostOrigin}));}
  }
  app.behaviors={choose,save,loadAsset,audit:()=>({at:new Date().toISOString(),manifest:'/comportamientos/manifiesto.json',loadedClips:app.library.size,behaviors:catalog.map(c=>({id:c.id,name:c.name,body:{available:ACTING_BY_ID.has(c.id),rig:'Mixamo/canonical'},facial:{available:ACTING_BY_ID.has(c.id),rig:'FACEIT/ARKit-52'},requirement:c.actingRequirement,review:'pending',status:'combined-recipe'}))}),editFace:()=>$('editFace').onclick(),state:()=>({selected:selected?.id,bodyReady,characterId:app.charMeta.id,name:$('name').value,duration:Number($('duration').value),intensity:Number($('intensity').value),facialInstances:faceProject?.instances.length||0,combinedInstances:faceProject?.instances.filter(i=>i.acting).length||0,channels:faceProject?.presets.map(p=>({id:p.id,peaks:Object.fromEntries(Object.entries(p.channels).map(([n,keys])=>[n,Math.max(...keys.map(k=>k[1]))]))}))||[],dirty,embedded,catalogSize:catalog.length}),setChannel:(channel,value)=>{if(!core.ARKIT.includes(channel))throw Error('Canal desconocido.');if(!faceProject?.instances.length)throw Error('Elige primero una actuación.');app.pushUndo();const ids=new Set(faceProject.instances.map(i=>i.presetId));for(const p of faceProject.presets)if(ids.has(p.id))p.channels[channel]=channelPeak(p,channel,value);core.validateProject(faceProject);app.changed();dirty=true;report();},setBodyIntensity:value=>{if(!Number.isFinite(value)||value<0||value>1)throw Error('Intensidad corporal fuera de rango.');if(!faceProject?.instances.some(i=>i.acting))throw Error('Elige una actuación conjunta.');app.pushUndo();for(const i of faceProject.instances)if(i.acting)i.acting.intensity=value;installActing(faceProject);setDuration();app.changed();dirty=true;},setBody:id=>{$('body').value=id;setBody();},setFace:id=>{$('face').value=id;configureFace();}};
}
