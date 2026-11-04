"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {readPublishedPresentation} from '@/features/story-studio/publication';
import {createStudioDirector} from '@/features/story-studio/director';
import {sequenceList,type Gate,type StudioSource} from '@/features/story-studio/model';
import {createHostBridge,type WorldLexiconService} from '@/features/world-lexicon';
import {StudioReading} from './StudioReading';
import {useStudioAudio} from './useStudioAudio';
import styles from './story-player.module.css';
import {readStudioCheckpoint,saveStudioCheckpoint} from '@/features/story-studio/checkpoint';

export function PublishedStudioPlayer({releaseId,sources,viewerUrl,service,owner}:{releaseId:string;sources:StudioSource[];viewerUrl:string;service:WorldLexiconService;owner:string}){
  const [content,setContent]=useState<ReturnType<typeof readPublishedPresentation>|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{try{const loaded=readPublishedPresentation(window.localStorage,releaseId,sources);Promise.resolve().then(()=>setContent(loaded));}catch(e){Promise.resolve().then(()=>setError(e instanceof Error?e.message:'No se pudo abrir la historia.'));}},[releaseId,sources]);
  if(error)return <main className={styles.error}><h1>No se pudo abrir la historia</h1><p>{error}</p><Link href="/">Volver a SpanStories</Link></main>;
  if(!content)return <main className={styles.error}>Preparando la historia…</main>;
  return <ReleasedPerformance key={releaseId} content={content} viewerUrl={viewerUrl} service={service} owner={owner}/>;
}

function ReleasedPerformance({content,viewerUrl,service,owner}:{content:ReturnType<typeof readPublishedPresentation>;viewerUrl:string;service:WorldLexiconService;owner:string}){
  const {source,release}=content,project=release.project,list=sequenceList(project);
  const [initial]=useState(()=>{const director=createStudioDirector(project,source);let resumed=false,error:string|null=null;try{const saved=readStudioCheckpoint(window.localStorage,owner,release.id,source.storyVersionId);if(saved){director.restore(saved);resumed=true;}}catch(e){error=e instanceof Error?e.message:'No se pudo recuperar el punto de lectura.';}return{director,resumed,error};});
  const director=initial.director;
  const [playback,setPlayback]=useState(()=>director.snapshot()),[ready,setReady]=useState(false),[connected,setConnected]=useState(false),[started,setStarted]=useState(false),[error,setError]=useState<string|null>(initial.error),[answer,setAnswer]=useState(''),[touch,setTouch]=useState<{sequenceId:string;entryId:string}|null>(null),[objectOpen,setObjectOpen]=useState(false);
  const frame=useRef<HTMLIFrameElement>(null),latest=useRef(playback);
  const startedRef=useRef(false),lastSave=useRef('');
  const commit=useCallback((next:ReturnType<typeof director.snapshot>)=>{
    setPlayback(next);if(!startedRef.current)return;
    const signature=`${next.stage.sequenceId}:${Math.floor(next.time)}:${next.state}`;if(signature===lastSave.current)return;
    try{saveStudioCheckpoint(window.localStorage,owner,release.id,source.storyVersionId,next);lastSave.current=signature;}
    catch{setError('La historia continúa, pero no se pudo guardar el punto de lectura en este navegador.');}
  },[owner,release.id,source.storyVersionId,director]);
  useEffect(()=>{latest.current=playback;},[playback]);
  const audio=useStudioAudio('published',playback);
  // The viewer loads one zone per page: a scene elsewhere reloads it on that zone.
  const zoneId=(project.scenes.find(s=>s.id===playback.stage.sceneId)??project.scenes[0]).zoneId;
  const url=new URL(viewerUrl);url.searchParams.set('aprendizaje','');url.searchParams.set('estudio','1');url.searchParams.set('zone',zoneId);const origin=url.origin;
  const loadedZone=useRef(zoneId);
  useEffect(()=>{if(loadedZone.current===zoneId)return;loadedZone.current=zoneId;Promise.resolve().then(()=>{setConnected(false);setReady(false);});},[zoneId]);
  useEffect(()=>{
    const post=(type:string,data:Record<string,unknown>={})=>frame.current?.contentWindow?.postMessage({channel:'spanstories.studio',version:1,type,...data},origin);
    const bridge=createHostBridge({service,expectedOrigin:origin,expectedSource:()=>frame.current?.contentWindow??null,postToViewer:(m,target)=>frame.current?.contentWindow?.postMessage(m,target)});
    const hello=window.setInterval(()=>post('HELLO'),1500);
    const receive=(event:MessageEvent)=>{
      if(event.origin!==origin||event.source!==frame.current?.contentWindow)return;
      const m=event.data;
      if(m?.channel!=='spanstories.studio'||m.version!==1){void bridge.handle({origin:event.origin,source:event.source,data:m});return;}
      if(m.type==='READY'){window.clearInterval(hello);setConnected(true);const stage=latest.current.stage,scene=project.scenes.find(s=>s.id===stage.sceneId)!;post('STAGE',{requestId:crypto.randomUUID(),stage:{...stage,zoneId:scene.zoneId,entryIds:scene.entryIds,ambient:scene.ambient},student:true,allowLook:project.navigation.allowLook});}
      if(m.type==='STAGE_READY'&&m.sequenceId===latest.current.stage.sequenceId)setReady(true);
      if(m.type==='ERROR'){setError(typeof m.message==='string'?m.message:'No se pudo preparar el escenario.');setReady(false);commit(director.pause());}
      if(m.type==='OBJECT_TOUCHED'){setObjectOpen(true);const snapshot=director.snapshot();if(snapshot.gate.kind==='object'&&snapshot.gate.entryIds.includes(m.entryId))setTouch({sequenceId:snapshot.stage.sequenceId,entryId:m.entryId});}
      if(m.type==='OBJECT_CLOSED')setObjectOpen(false);
    };
    window.addEventListener('message',receive);post('HELLO');
    return()=>{window.clearInterval(hello);window.removeEventListener('message',receive);};
  },[director,origin,project,service,commit]);
  useEffect(()=>{
    if(!connected)return;
    const scene=project.scenes.find(s=>s.id===playback.stage.sceneId)!;
    service.setScene?.(scene.entryIds,source.storyVersionId);
    frame.current?.contentWindow?.postMessage({channel:'spanstories.studio',version:1,type:'STAGE',requestId:crypto.randomUUID(),stage:{...playback.stage,zoneId:scene.zoneId,entryIds:scene.entryIds,ambient:scene.ambient},student:true,playing:playback.state==='playing',waiting:playback.state==='waiting',allowLook:project.navigation.allowLook},origin);
  },[connected,origin,playback,project,service,source]);
  useEffect(()=>{
    if(playback.state!=='playing'||!ready)return;
    let previous=performance.now();const timer=window.setInterval(()=>{const now=performance.now(),dt=Math.min((now-previous)/1000,.25);previous=now;commit(director.tick(dt));},100);
    return()=>window.clearInterval(timer);
  },[director,playback.state,ready,commit]);
  const current=list[playback.index],gate=playback.gate,caption=playback.stage.caption;
  const sentence=source.sentences.find(s=>s.id===caption?.sentenceId);
  const observed=touch?.sequenceId===playback.stage.sequenceId?touch.entryId:null;
  const respond=(kind:Gate['kind'],value?:string)=>{const result=director.respond({kind,value});if(!result.accepted){setError('Prueba otra vez. La historia espera tu respuesta.');return;}setError(null);setAnswer('');commit(result.snapshot);};
  return <main className={styles.player}><header><strong>SpanStories</strong><span>{source.title}</span><Link href="/">Salir</Link></header><section className={styles.stage} aria-label="Historia interactiva">
    <iframe ref={frame} src={url.href} title={source.title} sandbox="allow-scripts allow-same-origin" allow="autoplay"/>
    <div className={styles.controls}><button disabled={!ready} onClick={()=>{startedRef.current=true;setStarted(true);commit(playback.state==='playing'?director.pause():director.play());}}>{!started?(initial.resumed?'Retomar':'Comenzar'):playback.state==='playing'?'Pausar':'Reproducir'}</button><span>Momento {playback.index+1} de {list.length}</span><button disabled={!ready||!playback.canGoBack} onClick={()=>commit(director.back())}>Anterior</button>{caption?.audioUrl&&<button onClick={()=>{if(playback.state==='playing')commit(director.pause());void audio.preview(caption.audioUrl!).catch(e=>setError(e instanceof Error?e.message:'No se pudo escuchar la intervención.'));}}>Escuchar otra vez</button>}</div>
    <div className={styles.caption} data-object-open={objectOpen}><small>{caption?.speakerId?current.scene.actors.find(a=>a.id===caption.speakerId)?.name:'Narrador'}</small><div className={styles.words}>{sentence&&<StudioReading source={source} sentenceId={sentence.id} owner={owner} recordProgress onPause={()=>{if(playback.state==='playing')commit(director.pause());}}/>}</div>
      {playback.state==='waiting'&&<><p>{gate.kind!=='auto'?gate.prompt:''}</p>{gate.kind==='continue'&&<button onClick={()=>respond('continue')}>Continuar →</button>}{gate.kind==='choice'&&gate.options.map(option=><button key={option.id} onClick={()=>respond('choice',option.id)}>{(option.sentenceId&&source.sentences.find(s=>s.id===option.sentenceId)?.text)||option.label}</button>)}{gate.kind==='answer'&&<form onSubmit={e=>{e.preventDefault();respond('answer',answer);}}><input aria-label="Tu respuesta" value={answer} onChange={e=>setAnswer(e.target.value)} required/><button>Responder</button></form>}{gate.kind==='object'&&observed&&<button onClick={()=>respond('object',observed)}>Objeto observado · Continuar →</button>}</>}
      {playback.state==='finished'&&<><p>Has terminado la historia.</p><button onClick={()=>{startedRef.current=true;setStarted(true);commit(director.play());}}>Volver a empezar</button></>}
    </div><p className={styles.status} role="status">{error??audio.error??(!ready?'Preparando el escenario…':project.navigation.allowLook?'Puedes mirar alrededor y tocar los objetos de la escena.':'Toca los objetos de la escena.')}</p>
  </section></main>;
}
