"use client";
import {getDockSize,setDockSize} from './dock-size';
import {useEffect,useRef,useState} from 'react';
import {isBehaviorReference,validateBehaviorAsset,type BehaviorReference} from '@/features/story-studio/behavior';
import {validateActorLife,validateActorLifeOverride,type ActorLife,type ActorLifeOverride} from '@/features/story-studio/actor-life';
import styles from './studio-workshop.module.css';

/** Enlace con el escenario vivo: lo necesita el modo «En escena» de los talleres (mismo motor y misma escena que el Estudio). */
export type WorkshopStage={origin:string;frame:{readonly current:HTMLIFrameElement|null};send:(type:string,data?:Record<string,unknown>)=>void;setOverlay:(element:HTMLElement|null)=>void;slot?:{readonly current:HTMLElement|null}};

export type WorkshopContext={editor?:'body'|'face';sinPersonaje?:boolean;characterId:string;characterName:string;modelUrl:string;sequenceName:string;behavior?:BehaviorReference;sceneId?:string;sequenceId?:string;actorId?:string;cueId?:string;
  /** Historia abierta: separa los borradores de historias distintas que comparten ids de escena. */
  storyId?:string;storyName?:string;
  /** Jinete: la montura que lo lleva (features/story-studio/mount.ts). El Taller empareja con esto, no con el nombre. */
  montura?:{caballoId:string};
  /** Vida en reposo del personaje en la escena y, si el momento es quieto, su cambio en ese momento. */
  vida?:ActorLife|null;vidaMomento?:ActorLifeOverride|null;cueStatic?:boolean;
  /** Los demás personajes de la escena (para «mirar a…»). */
  others?:{id:string;name:string;characterId?:string;modelUrl?:string|null;cueId?:string;at?:number;behavior?:BehaviorReference;montura?:{caballoId:string}}[];
  at?:number;time?:number};
/** Misma clave que usan los dos talleres (src/ui/behaviors.js y facial/GeneralFacialEditor.mjs) para el borrador de cada actuación. */
export const draftKeyOf=(c:WorkshopContext,withCue=true)=>[c.storyId,c.characterId,c.sceneId,c.actorId,(withCue&&c.cueId)||c.sequenceId||c.sequenceName].filter(v=>typeof v==='string'&&v).join(':').slice(0,300);
/** Claves anteriores del mismo borrador: sin cue (el cue se crea al llevar la actuación a la historia) y sin historia. */
const legacyDraftKeysOf=(c:WorkshopContext)=>[c.cueId?draftKeyOf(c,false):null,c.storyId?draftKeyOf({...c,storyId:undefined}):null,c.storyId&&c.cueId?draftKeyOf({...c,storyId:undefined},false):null].filter((k):k is string=>!!k);
const TALLER=typeof window==='undefined'?'http://127.0.0.1:5189':window.location.origin+'/taller';
/** Canal entre pestañas del Estudio (mismo origen) para cambios hechos en disco a una historia que otra pestaña tiene abierta. */
export const HISTORIAS_CHANNEL='spanstories.historias';
type Editor='body'|'face';
export function StudioWorkshop({context,onApply,onApplyMounted,onClose,onEditor,onSelectActor,inShell=false,stage,onSceneLive,hidden=false,onLife,onReplaceBehaviors,flushRef,closeRef}:{context:WorkshopContext;onApply:(behavior:BehaviorReference,auto?:boolean)=>void;onApplyMounted?:(items:{actorId:string;behavior:BehaviorReference;role?:'rider'|'horse'}[])=>void;onClose:()=>void;onEditor?:(editor:Editor)=>void;onSelectActor?:(actorId:string)=>Promise<void>;stage?:WorkshopStage;onSceneLive?:(live:boolean)=>void;
  /** El Estudio lo llama antes de cerrar el Taller: lleva a la historia lo pendiente de los dos talleres. */
  flushRef?:{current:(()=>Promise<void>)|null};
  /** El Estudio lo llama para cerrar el Taller: lleva lo pendiente a la historia y, si no puede, avisa y deja elegir (no cierra en silencio). */
  closeRef?:{current:(()=>void)|null};
  /** Precargado: el Estudio lo tiene abierto y en pausa, sin mostrarlo, para que «Animación» abra al instante. */
  hidden?:boolean;
  /** Dentro de la barra común: el cambio de taller y la vuelta al Estudio están en ella, no se repiten aquí. */
  inShell?:boolean;
  /** Taller facial · vida en reposo del personaje: en toda la escena o solo en este momento. */
  onLife?:(vida:ActorLife|ActorLifeOverride|null,alcance:'escena'|'momento')=>void;
  /** Taller facial · General: actuaciones de esta historia vueltas a hornear con una corrección (vieja → nueva). */
  onReplaceBehaviors?:(pairs:{from:string;to:BehaviorReference;cueIds?:string[]}[])=>number}){
  const frame=useRef<HTMLIFrameElement>(null),[session]=useState(()=>crypto.randomUUID()),[host]=useState(()=>window.location.origin),[status,setStatus]=useState('Abriendo Taller. Si no responde, abre su acceso directo y pulsa Reintentar.'),[attempt,setAttempt]=useState(0);
  const callbacks=useRef({onApply,onApplyMounted,context,onLife,onReplaceBehaviors,onSelectActor});callbacks.current={onApply,onApplyMounted,context,onLife,onReplaceBehaviors,onSelectActor};
  // «En escena»: el visor del taller visible se vuelve transparente y debajo queda el escenario vivo, colocado en ese hueco.
  // Solo un taller manda en la escena a la vez (owner): el que está a la vista. El otro, oculto, la suelta.
  const [live,setLive]=useState(false),hole=useRef<HTMLDivElement>(null),liveRef=useRef(false),ownerRef=useRef<Editor|null>(null);
  const stageRef=useRef(stage);stageRef.current=stage;const onSceneLiveRef=useRef(onSceneLive);onSceneLiveRef.current=onSceneLive;
  const fixedStageRef=useRef(false);
  const setSceneLive=(on:boolean,keepPose=false)=>{if(!on)ownerRef.current=null;if(liveRef.current===on)return;liveRef.current=on;setLive(on);stageRef.current?.setOverlay(on&&!fixedStageRef.current?hole.current:null);onSceneLiveRef.current?.(on);if(!on)stageRef.current?.send('WORKSHOP_END',{keepPose});};
  useEffect(()=>()=>{if(liveRef.current){stageRef.current?.setOverlay(null);stageRef.current?.send('WORKSHOP_END');onSceneLiveRef.current?.(false);}},[]);
  const hiddenRef=useRef(hidden);hiddenRef.current=hidden;
  const [editor,setEditor]=useState<Editor>(context.editor??'body');
  const editorRef=useRef(editor);editorRef.current=editor;
  const fixedStage=!!(inShell&&stage?.slot&&!context.sinPersonaje);
  fixedStageRef.current=fixedStage;
  // El Taller facial se abre directamente desde el Estudio, sin esperar a que el Taller de animación cargue el
  // personaje: el Estudio le presenta el personaje él mismo. Cuando el Taller de animación termina de cargar,
  // adopta esa sesión para recibir el resultado («Usar en la historia» del facial lo hornea el de animación).
  const [firstFacial]=useState(()=>context.editor==='face'?crypto.randomUUID():null);
  const facialFrame=useRef<HTMLIFrameElement>(null),facialSessionRef=useRef<string|null>(firstFacial),bodyLoaded=useRef(false),adopted=useRef(false),pendingFacial=useRef<unknown[]>([]);
  const [facialSession,setFacialSession]=useState<string|null>(firstFacial);
  const toBody=(m:Record<string,unknown>)=>frame.current?.contentWindow?.postMessage({channel:'spanstories.workshop',version:1,session,...m},TALLER);
  const toFace=(m:Record<string,unknown>)=>facialFrame.current?.contentWindow?.postMessage({channel:'spanstories.facial-workshop',version:1,session:facialSessionRef.current,...m},TALLER);
  useEffect(()=>{
    const slot=stageRef.current?.slot?.current,visibleFrame=editor==='face'?facialFrame.current:frame.current;
    const sendRect=editor==='face'?toFace:toBody;
    if(!fixedStage||!slot||!visibleFrame){sendRect({type:'VIEWPORT_RECT',rect:null});return;}
    const measure=()=>{
      const target=slot.getBoundingClientRect(),iframe=visibleFrame.getBoundingClientRect();
      if(target.width>0&&target.height>0&&iframe.width>0)sendRect({type:'VIEWPORT_RECT',rect:[target.left-iframe.left,target.top-iframe.top,target.width,target.height]});
    };
    const observer=new ResizeObserver(measure);
    observer.observe(slot);observer.observe(visibleFrame);
    // The taller header can move the slot without changing its dimensions.
    const layoutObserver=new MutationObserver(measure);
    if(slot.parentElement)layoutObserver.observe(slot.parentElement,{attributes:true,attributeFilter:['data-animation-menu']});
    visibleFrame.addEventListener('load',measure);window.addEventListener('resize',measure);
    measure();
    return()=>{observer.disconnect();layoutObserver.disconnect();visibleFrame.removeEventListener('load',measure);window.removeEventListener('resize',measure);};
  },[fixedStage,editor,facialSession,session,attempt,hidden]);
  // Una sola historia: lo que se corrige en un taller se lleva a la historia al pasar al otro o al volver al Estudio,
  // y el otro taller lo recibe en caliente. Nada se recarga.
  const latestBehavior=useRef<BehaviorReference|null>(null);
  const latestMounted=useRef(new Map<string,BehaviorReference>());
  const flushWaits=useRef(new Map<string,(error?:string)=>void>());
  const ask=(target:'body'|'face',strict=false)=>new Promise<void>((resolve,reject)=>{
    const win=(target==='face'?facialFrame:frame).current?.contentWindow;
    if(!win||(target==='face'&&!facialSessionRef.current)||(target==='body'&&!bodyLoaded.current)){resolve();return;}
    const requestId=crypto.randomUUID(),timer=window.setTimeout(()=>{flushWaits.current.delete(requestId);if(strict)reject(Error('El Taller no confirmó sus cambios a tiempo.'));else resolve();},20000);
    flushWaits.current.set(requestId,(error)=>{window.clearTimeout(timer);if(strict&&error)reject(Error(error));else resolve();});
    if(target==='face')toFace({type:'FLUSH',requestId});else toBody({type:'FLUSH',requestId});
  });
  // Primero el rostro (su «llevar a la historia» lo hornea el Taller de animación), después el cuerpo.
  // strict: un error o un tiempo agotado se propaga (no se traga), para no cerrar el Taller creyendo que todo quedó guardado.
  const flushAll=async(strict=false)=>{await ask('face',strict);await ask('body',strict);};
  const flushAllRef=useRef(flushAll);flushAllRef.current=flushAll;
  const selectingActor=useRef(false);
  const selectActor=async(actorId:string)=>{
    const c=callbacks.current.context;
    if(selectingActor.current||hiddenRef.current||editorRef.current!=='body'||actorId===c.actorId||!c.others?.some(a=>a.id===actorId)||!callbacks.current.onSelectActor)return;
    selectingActor.current=true;
    try{
      await ask('face',true);await ask('body',true);
      if(!hiddenRef.current&&editorRef.current==='body')await callbacks.current.onSelectActor?.(actorId);
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo cambiar de personaje.');}
    finally{selectingActor.current=false;}
  };
  const selectActorRef=useRef(selectActor);selectActorRef.current=selectActor;
  useEffect(()=>{if(!flushRef)return;const run=()=>flushAllRef.current();flushRef.current=run;return()=>{if(flushRef.current===run)flushRef.current=null;};},[flushRef]);
  // Cerrar el Taller: primero se lleva a la historia lo pendiente de los dos talleres. Si no se puede, no se cierra en
  // silencio: se muestra el motivo y siempre hay salida (reintentar, seguir o descartar y cerrar; el borrador queda en el navegador).
  const [closing,setClosing]=useState(false),[closeFailure,setCloseFailure]=useState<string|null>(null);
  const requestClose=()=>{
    if(closing)return;setClosing(true);setCloseFailure(null);setStatus('Llevando los cambios a la historia…');
    void flushAllRef.current(true).then(()=>onClose(),error=>{setCloseFailure(error instanceof Error&&error.message?error.message:'No se pudieron llevar los cambios a la historia.');setStatus('No se pudieron llevar los cambios a la historia.');}).finally(()=>setClosing(false));
  };
  const requestCloseRef=useRef(requestClose);requestCloseRef.current=requestClose;
  useEffect(()=>{if(!closeRef)return;const run=()=>requestCloseRef.current();closeRef.current=run;return()=>{if(closeRef.current===run)closeRef.current=null;};},[closeRef]);
  useEffect(()=>{if(closeFailure===null)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setCloseFailure(null);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[closeFailure]);
  const closeAfterFlush=requestClose;
  // Precarga y cambio de taller: cada marco sabe si está a la vista. Oculto, no entra en escena ni dibuja.
  useEffect(()=>{
    toBody({type:'VISIBLE',visible:!hidden&&editor==='body'});
    toFace({type:'VISIBLE',visible:!hidden&&editor==='face'});
    if(hidden&&liveRef.current)setSceneLive(false,fixedStageRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hidden,session,editor,facialSession]);
  // El editor abierto se recuerda (al recargar se vuelve a él).
  const onEditorRef=useRef(onEditor);onEditorRef.current=onEditor;
  useEffect(()=>{onEditorRef.current?.(editor);},[editor]);
  // La barra común puede pedir el otro taller con este ya abierto.
  const wantedEditor=context.editor;
  useEffect(()=>{if(wantedEditor&&wantedEditor!==editorRef.current)switchEditorRef.current(wantedEditor);},[wantedEditor]);
  const adopt=()=>{
    if(!bodyLoaded.current||!facialSessionRef.current)return;
    toBody({type:'FACIAL_ADOPT',facialSession:facialSessionRef.current});adopted.current=true;
    // Lo que el Taller facial mandó antes de que el de animación estuviera listo (p. ej. «Usar en la historia»).
    for(const m of pendingFacial.current.splice(0))frame.current?.contentWindow?.postMessage(m,TALLER);
  };
  const switchEditor=(next:Editor)=>{
    if(next!=='face')toFace({type:'WEBCAM_STOP'});
    // Lo pendiente del taller que se deja va a la historia (sin esperar: el cambio de taller es inmediato).
    if(next!==editorRef.current){
      void ask(next==='face'?'body':'face',true).catch(error=>setStatus('No se pudo llevar a la historia lo del taller anterior: '+(error instanceof Error?error.message:'error desconocido')+' Su borrador queda en el navegador.'));
      if(fixedStageRef.current)setSceneLive(false,true);
    }
    setEditor(next);
    if(next==='face'&&!facialSessionRef.current){const id=crypto.randomUUID();facialSessionRef.current=id;adopted.current=false;setFacialSession(id);adopt();return;}
    toBody({type:'EDITOR',editor:next});
  };
  const switchEditorRef=useRef(switchEditor);switchEditorRef.current=switchEditor;
  useEffect(()=>{
    let initializing=false,disposed=false;
    async function initialize(target:Window,origin:string){
      if(initializing)return;initializing=true;
      try{
        let prepared=callbacks.current.context;
        // Si el Taller se reinicia, parte de lo último que la historia recibió en esta sesión.
        if(latestBehavior.current)prepared={...prepared,behavior:latestBehavior.current};
        if(latestMounted.current.size)prepared={...prepared,others:prepared.others?.map(actor=>({
          ...actor,behavior:latestMounted.current.get(actor.id)??actor.behavior,
        }))};
        // Las actuaciones importadas de un paquete las sirve el Estudio (3000), que el Taller (5189) no puede leer:
        // el Estudio las lee y deja en la biblioteca del Taller una copia editable. Vale para el actor y para sus
        // compañeros (la pareja montada necesita la actuación del otro actor para restaurarse).
        const editable=async(behavior:BehaviorReference,who:string)=>{
          const response=await fetch(behavior.url);if(!response.ok)throw Error(`La actuación importada de ${who} no está disponible.`);
          const asset:unknown=await response.json();validateBehaviorAsset(asset,behavior);
          const saved=await fetch(TALLER+'/ecosystem/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(asset)}),reference=await saved.json();
          if(!saved.ok||!isBehaviorReference(reference))throw Error(reference.error||'No se pudo abrir una versión editable en el Taller.');
          return reference;
        };
        const imported=(b?:BehaviorReference)=>!!b?.url.includes('/api/studio-behaviors?');
        if(imported(prepared.behavior)||prepared.others?.some(a=>imported(a.behavior))){
          setStatus('Abriendo una copia editable de la actuación importada…');
          const behavior=imported(prepared.behavior)?await editable(prepared.behavior!,prepared.characterName):prepared.behavior;
          const others=prepared.others&&await Promise.all(prepared.others.map(async a=>imported(a.behavior)?{...a,behavior:await editable(a.behavior!,a.name)}:a));
          prepared={...prepared,behavior,others};
        }
        if(!disposed)target.postMessage({channel:'spanstories.workshop',version:1,session,type:'INIT',context:prepared,held:hiddenRef.current||editorRef.current!=='body'},origin);
        // Si el Taller se recarga solo (su servidor lo hace al cambiar el motor), vuelve a anunciarse con READY:
        // se le presenta otra vez el personaje en lugar de dejarlo esperando con el maniquí.
        initializing=false;
      }catch(error){initializing=false;if(!disposed)setStatus(error instanceof Error?error.message:'No se pudo abrir la actuación.');}
    }
    /** Petición de escena de uno de los dos talleres → motor. Solo el taller a la vista puede entrar; solo el dueño la mueve. */
    function relayScene(m:Record<string,unknown>&{op?:unknown;requestId?:unknown},from:Editor,reply:(r:Record<string,unknown>)=>void){
      const st=stageRef.current,c=callbacks.current.context;
      // Asa del panel inferior del Taller «En escena»: su línea de tiempo ocupa lo que deja el panel inferior del Estudio,
      // así que la altura pedida (tl) se traduce a la del panel del Estudio (dock-size.ts) y el escenario crece o mengua.
      if(m.op==='dock'){const tl=Number((m as {tl?:unknown}).tl),slot=st?.slot?.current,el=(from==='face'?facialFrame:frame).current;
        if(Number.isFinite(tl)&&slot&&el&&editorRef.current===from){const now=el.getBoundingClientRect().bottom-slot.getBoundingClientRect().bottom;setDockSize(getDockSize()+(tl-now));}
        return;}
      if(!st||!c.actorId){reply({type:'WORKSHOP_ERROR',requestId:m.requestId,message:'Abre el Taller desde un personaje de la escena para trabajar en el escenario.'});return;}
      if(m.op==='begin'){
        if(hiddenRef.current||editorRef.current!==from){reply({type:'WORKSHOP_ERROR',requestId:m.requestId,message:'El taller está oculto: entra en escena al mostrarlo.'});return;}
        ownerRef.current=from;setSceneLive(true);
        const begin={requestId:m.requestId,actorId:c.actorId,bones:m.bones,...(m.modelSpace===true?{modelSpace:true}:{}),...(Array.isArray(m.meshes)?{meshes:m.meshes}:{}),
          faceOnly:from==='face'&&fixedStageRef.current};
        // Canal directo taller ↔ escenario para la vista, la pose y las confirmaciones de pintado: los dos marcos los
        // sirve 127.0.0.1 y comparten proceso; por el Estudio (otro proceso) cada estado tardaba varios fotogramas.
        const engineWin=st.frame.current?.contentWindow,tallerWin=(from==='face'?facialFrame:frame).current?.contentWindow;
        if(engineWin&&tallerWin&&typeof MessageChannel!=='undefined'){
          const direct=new MessageChannel();
          engineWin.postMessage({channel:'spanstories.studio',version:1,type:'WORKSHOP_BEGIN',...begin},st.origin,[direct.port1]);
          const reply={type:'SCENE_REPLY',reply:{type:'WORKSHOP_PORT'}};
          if(from==='face')tallerWin.postMessage({channel:'spanstories.facial-workshop',version:1,session:facialSessionRef.current,...reply},TALLER,[direct.port2]);
          else tallerWin.postMessage({channel:'spanstories.workshop',version:1,session,...reply},TALLER,[direct.port2]);
          return;
        }
        st.send('WORKSHOP_BEGIN',begin);return;
      }
      // El hueco del escenario lo coloca el dueño; antes de que haya dueño, el taller a la vista (manda su
      // rectángulo justo antes de pedir la escena).
      const visibleOwner=ownerRef.current===null&&!hiddenRef.current&&editorRef.current===from;
      if(ownerRef.current!==from&&!(m.op==='rect'&&visibleOwner))return;
      const el=from==='face'?facialFrame.current:frame.current,rect=m.rect;
      if(m.op==='rect'&&hole.current&&el&&Array.isArray(rect)&&rect.length===4&&rect.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))){const r=el.getBoundingClientRect();Object.assign(hole.current.style,{left:r.left+rect[0]+'px',top:r.top+rect[1]+'px',width:rect[2]+'px',height:rect[3]+'px'});}
      else if(m.op==='view')st.send('WORKSHOP_VIEW',{position:m.position,target:m.target,fov:m.fov,...(Number.isFinite(m.seq)?{seq:m.seq}:{})});
      else if(m.op==='pose')st.send('WORKSHOP_POSE',{q:m.q,p:m.p,...(m.w?{w:m.w}:{}),...(m.poses?{poses:m.poses}:{}),...(m.matrices?{matrices:m.matrices}:{}),...(Number.isFinite(m.seq)?{seq:m.seq}:{})});
      else if(from==='body'&&m.op==='bindPair'){
        const allowed=new Set([c.actorId,...(c.others??[]).map(actor=>actor.id)]);
        if(!Array.isArray(m.actors)||m.actors.some(a=>!allowed.has(a?.id))){reply({type:'WORKSHOP_PAIR_ERROR',requestId:m.requestId,message:'El actor ya no está en esta escena.'});return;}
        st.send('WORKSHOP_BIND_PAIR',{requestId:m.requestId,actors:m.actors});
      }
      else if(from==='body'&&m.op==='unbindPair')st.send('WORKSHOP_UNBIND_PAIR');
      else if(from==='body'&&m.op==='selectActor'&&typeof m.actorId==='string')void selectActorRef.current(m.actorId);
      else if(m.op==='ray')st.send('WORKSHOP_RAY',{requestId:m.requestId,origin:m.origin,direction:m.direction,...(m.actorPick===true?{actorPick:true}:{})});
      else if(m.op==='actors')st.send('WORKSHOP_ACTORS',{requestId:m.requestId});
      else if(m.op==='points')st.send('WORKSHOP_POINTS',{requestId:m.requestId});
      else if(m.op==='route')st.send('WORKSHOP_ROUTE',{requestId:m.requestId,from:m.from,to:m.to});
      else if(m.op==='end')setSceneLive(false);
    }
    const replyBody=(r:Record<string,unknown>)=>toBody({type:'SCENE_REPLY',reply:r}),replyFace=(r:Record<string,unknown>)=>toFace({type:'SCENE_REPLY',reply:r});
    const receive=(event:MessageEvent)=>{
      const m=event.data;
      if(m?.channel==='spanstories.facial-workshop'&&m.version===1&&facialSessionRef.current&&m.session===facialSessionRef.current){
        if(event.origin!==new URL(TALLER).origin)return;
        // Los dos talleres los sirve el Taller (5189): se distinguen por la ventana de origen.
        const fromFace=event.source===facialFrame.current?.contentWindow,fromBody=event.source===frame.current?.contentWindow;
        if(fromFace&&m.type==='READY'){
          // READY del Taller facial: el Estudio le presenta el personaje directamente (abre al instante).
          const c=callbacks.current.context,b=latestBehavior.current??c.behavior,behaviorUrl=b?.url.startsWith(TALLER+'/ecosystem/assets/')?b.url:null;
          toFace({type:'INIT',project:{schema:'spanstories.facial-project',version:1,presets:[],instances:[],favorites:[]},modelUrl:c.sinPersonaje?null:TALLER+'/ecosystem/model?url='+encodeURIComponent(new URL(c.modelUrl,window.location.href).href),characterId:c.characterId,characterName:c.characterName,draftKey:c.sinPersonaje?null:draftKeyOf(c),legacyDraftKey:c.sinPersonaje?null:draftKeyOf({...c,storyId:undefined}),legacyDraftKeys:c.sinPersonaje?[]:legacyDraftKeysOf(c),projectDate:0,behaviorUrl,behaviorRevision:behaviorUrl?(b?.revision??null):null,
            story:c.sinPersonaje?null:{id:c.storyId??null,name:c.storyName??'',sceneId:c.sceneId??null,actorId:c.actorId??null,cueId:c.cueId??null,sequenceName:c.sequenceName,cueStatic:!!c.cueStatic,vida:c.vida??null,vidaMomento:c.vidaMomento??null,others:c.others??[]},visible:!hiddenRef.current&&editorRef.current==='face'});
          setStatus(c.sinPersonaje?'Taller facial · elige un personaje.':`Taller facial · cargando a ${c.characterName}…`);
          return;
        }
        if(fromFace&&m.type==='SCENE'){relayScene(m,'face',replyFace);return;}
        if(fromFace&&m.type==='LIFE'){
          try{
            const alcance=m.alcance==='momento'?'momento':'escena';
            const vida=m.vida===null?null:alcance==='momento'?validateActorLifeOverride(m.vida):validateActorLife(m.vida);
            callbacks.current.onLife?.(vida,alcance);setStatus(alcance==='momento'?'Vida de este momento aplicada a la historia.':'Vida en reposo aplicada al personaje en toda la escena.');
          }catch(error){setStatus(error instanceof Error?error.message:'Vida en reposo no válida.');}
          return;
        }
        // Modo General: dónde se usa un componente (historias guardadas en disco). El Taller lo pide a través del
        // Estudio para no abrir la API de historias a otro origen.
        if(fromFace&&m.type==='USAGE_QUERY'&&Array.isArray(m.componentes)){
          const ids=m.componentes.filter((c:unknown)=>typeof c==='string').slice(0,50);
          void fetch('/api/historias/usos-faciales?componentes='+encodeURIComponent(ids.join(',')),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo buscar en las historias.');toFace({type:'USAGE',requestId:m.requestId,items:d.items,currentStoryId:callbacks.current.context.storyId??null});})
            .catch(error=>toFace({type:'USAGE',requestId:m.requestId,error:error instanceof Error?error.message:'No se pudo buscar en las historias.'}));
          return;
        }
        // Versiones nuevas (con la corrección) de actuaciones de historias: la abierta cambia aquí (se puede deshacer);
        // las demás, en disco (/api/historias/usos-faciales, con copia del guardado anterior).
        if(fromFace&&m.type==='REPLACE_BEHAVIORS'){
          type Use={historiaId:string;cueId:string};
          const pairs:{from:string;to:BehaviorReference;uses?:Use[]}[]=Array.isArray(m.pairs)?m.pairs.filter((p:{from?:unknown;to?:unknown})=>typeof p?.from==='string'&&isBehaviorReference(p.to)):[];
          // Cada historia recibe solo los cues que se marcaron en ella. Un Taller anterior (sin `uses`) cambiaría todos
          // los cues, también los desmarcados: se rechaza hasta recargarlo.
          const forStory=(historiaId:string)=>pairs.map(p=>({from:p.from,to:p.to,cueIds:p.uses!.filter(u=>u?.historiaId===historiaId&&typeof u.cueId==='string').map(u=>u.cueId)})).filter(p=>p.cueIds.length);
          const stories:string[]=Array.isArray(m.historias)?m.historias.filter((h:unknown)=>typeof h==='string'):[];
          if(pairs.some(p=>!Array.isArray(p.uses))){toFace({type:'REPLACED',requestId:m.requestId,results:stories.map(historiaId=>({historiaId,error:'Recarga el Taller facial y vuelve a intentarlo.'}))});return;}
          const current=callbacks.current.context.storyId;
          void (async()=>{
            const results:{historiaId:string;count?:number;error?:string}[]=[];
            for(const historiaId of stories){
              if(historiaId===current){results.push({historiaId,count:callbacks.current.onReplaceBehaviors?.(forStory(historiaId))??0});continue;}
              try{const r=await fetch('/api/historias/usos-faciales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:historiaId,pares:forStory(historiaId)})}),d=await r.json();if(!r.ok)throw Error(d.error);results.push({historiaId,count:d.count});
                // Si esa historia está abierta en otra pestaña, aplica allí el mismo cambio (si no, su autoguardado lo pisaría).
                if(d.count&&typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel(HISTORIAS_CHANNEL);channel.postMessage({type:'BEHAVIORS_REPLACED',historiaId,pares:forStory(historiaId)});channel.close();}}
              catch(error){results.push({historiaId,error:error instanceof Error?error.message:'No se pudo actualizar.'});}
            }
            toFace({type:'REPLACED',requestId:m.requestId,results});
          })();
          return;
        }
        if(fromFace&&m.type==='STATUS'&&typeof m.text==='string'){setStatus(m.text.slice(0,300));return;}
        if(fromFace&&m.type==='FLUSHED'){
          // El rostro va a la historia a través del Taller de animación: se espera a que él termine su guardado.
          const done=flushWaits.current.get(m.requestId);flushWaits.current.delete(m.requestId);
          if(done){if(m.sent&&adopted.current)void ask('body',true).then(()=>done(m.error),error=>done(error instanceof Error?error.message:'El Taller no confirmó sus cambios.'));else done(m.error);}
          return;
        }
        if(fromFace&&m.type==='LOADED')setStatus('Taller facial listo.');
        if(fromFace){
          // Al Taller de animación (hornea «Usar en la historia»). Si aún no adoptó la sesión, se guarda para después.
          if(adopted.current)frame.current?.contentWindow?.postMessage(m,TALLER);else if(m.type==='RESULT'){pendingFacial.current.push(m);setStatus('Preparando el cuerpo de la actuación para unirle el rostro…');}
        }
        if(fromBody)facialFrame.current?.contentWindow?.postMessage(m,TALLER);
        return;
      }
      // Respuestas del escenario vivo al taller que está «En escena».
      const st=stageRef.current;
      if(st&&event.origin===st.origin&&event.source===st.frame.current?.contentWindow&&m?.channel==='spanstories.studio'&&m.version===1&&typeof m.type==='string'&&m.type.startsWith('WORKSHOP_')){
        if(ownerRef.current==='face')replyFace(m);else replyBody(m);
        if(m.type==='WORKSHOP_ERROR')setSceneLive(false);
        return;
      }
      if(event.origin!==new URL(TALLER).origin||event.source!==frame.current?.contentWindow||m?.channel!=='spanstories.workshop'||m.version!==1||m.session!==session)return;
      // El Taller de animación pide el escenario vivo, mueve la cámara, manda la pose o pregunta por el suelo.
      if(m.type==='SCENE'){relayScene(m,'body',replyBody);return;}
      if(m.type==='READY'&&frame.current?.contentWindow){setStatus(callbacks.current.context.sinPersonaje?'Taller sin personaje de la escena: elige uno en el Taller.':`Cargando a ${callbacks.current.context.characterName} en el Taller… (unos segundos)`);void initialize(frame.current.contentWindow,event.origin);}
      if(m.type==='LOADED'){bodyLoaded.current=true;adopt();if(!facialSessionRef.current)setStatus('Edita la actuación y pulsa «Usar en la historia».');}
      if(m.type==='ERROR')setStatus(typeof m.message==='string'?m.message:'No se pudo abrir la actuación.');
      if(m.type==='FACIAL_OPEN'&&typeof m.facialSession==='string'){
        // Ya abierto desde el Estudio: el Taller de animación adopta esa sesión en vez de abrir otro.
        if(facialSessionRef.current){setEditor('face');adopt();}
        else {facialSessionRef.current=m.facialSession;adopted.current=true;setFacialSession(m.facialSession);setEditor('face');}
      }
      if(m.type==='FACIAL_CLOSE'){facialSessionRef.current=null;adopted.current=false;setFacialSession(null);setEditor('body');setStatus('Cambios faciales recibidos. Guarda la actuación o úsala en la historia.');}
      if(m.type==='FLUSHED'){const done=flushWaits.current.get(m.requestId);flushWaits.current.delete(m.requestId);done?.(m.error);if(m.error)setStatus('No se pudo llevar a la historia: '+m.error);return;}
      if(m.type==='MOUNTED_RESULT'){
        const c=callbacks.current.context;
        const ids=new Map([[c.actorId,c.characterId],...(c.others??[]).map(a=>[a.id,a.characterId] as const)]);
        if(!Array.isArray(m.items))return;
        const items=(m.items as {actorId:string;behavior:BehaviorReference;role?:unknown}[]).map(item=>({actorId:item?.actorId,behavior:item?.behavior,
          ...(item?.role==='rider'||item?.role==='horse'?{role:item.role as 'rider'|'horse'}:{})}));
        if(items.length!==2||new Set(items.map(item=>item?.actorId)).size!==2||
          items.some(item=>!isBehaviorReference(item?.behavior)||ids.get(item.actorId)!==item.behavior.characterId)||
          (items.some(item=>item.role)&&new Set(items.map(item=>item.role)).size!==2))return;
        const primary=items.find(item=>item.actorId===c.actorId)?.behavior;
        if(!primary)return;
        latestMounted.current=new Map(items.map(item=>[item.actorId,item.behavior]));
        latestBehavior.current=primary;
        toFace({type:'BEHAVIOR_UPDATE',behaviorUrl:primary.url});
        callbacks.current.onApplyMounted?.(items);
        setStatus('Actuaciones de los dos actores guardadas en la historia.');
        return;
      }
      if(m.type==='RESULT'){
        if(!isBehaviorReference(m.behavior)||m.behavior.characterId!==callbacks.current.context.characterId){setStatus('La actuación recibida no pertenece al personaje seleccionado.');return;}
        latestBehavior.current=m.behavior;
        // El Taller facial cambia el cuerpo en caliente; el Estudio actualiza la historia sin cerrar el Taller si es automático.
        toFace({type:'BEHAVIOR_UPDATE',behaviorUrl:m.behavior.url});
        if(m.auto)setStatus('Modificación en historia: guardada en la historia.');
        callbacks.current.onApply(m.behavior,!!m.auto);
      }
    };window.addEventListener('message',receive);return()=>{disposed=true;window.removeEventListener('message',receive);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session,attempt]);
return <div className={styles.shade+(inShell?' '+styles.inShell:'')+(fixedStage?' '+styles.fixedStage:'')+(live?' '+styles.live:'')+(hidden?' '+styles.warm:'')} aria-hidden={hidden||undefined} inert={hidden||undefined}><div ref={hole} className={styles.hole} aria-hidden="true"/><section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Taller de la actuación"><header><strong>SpanStories <small>· {context.sinPersonaje?'sin personaje de la escena':context.characterName}</small></strong>{!inShell&&<nav aria-label="Espacios de creación"><button onClick={closeAfterFlush}>Estudio</button><button aria-pressed={editor==='body'} onClick={()=>switchEditor('body')}>Taller de animación</button><button aria-pressed={editor==='face'} onClick={()=>switchEditor('face')}>Taller facial</button></nav>}<div><button onClick={()=>setAttempt(n=>n+1)}>Reintentar</button><button onClick={closeAfterFlush}>Volver a la historia</button></div></header><iframe key={attempt} hidden={editor==='face'&&!!facialSession} ref={frame} title="Taller de animación y comportamientos" src={`${TALLER}/?studioSession=${session}&studioOrigin=${encodeURIComponent(host)}`} allow="autoplay"/>{facialSession&&<iframe hidden={editor!=='face'} ref={facialFrame} title="Taller facial del personaje" src={`${TALLER}/facial/?workshopSession=${facialSession}&workshopOrigin=${encodeURIComponent(host)}`} allow="autoplay; camera http://127.0.0.1:5189"/>}{closeFailure!==null&&<div className={styles.closeFailure} role="alertdialog" aria-modal="true" aria-labelledby="workshop-close-title" aria-describedby="workshop-close-detail"><strong id="workshop-close-title">No se pudieron llevar los cambios a la historia</strong><p id="workshop-close-detail">{closeFailure} El Taller guarda un borrador de tu trabajo en este navegador: se recupera al volver a abrirlo.</p><div><button autoFocus onClick={()=>setCloseFailure(null)}>Seguir en el Taller</button><button onClick={requestClose}>Reintentar</button><button className={styles.discard} onClick={()=>{setCloseFailure(null);onClose();}}>Descartar cambios y cerrar de todos modos</button></div></div>}<p role="status">{context.sequenceName} · {status}</p></section></div>;
}
