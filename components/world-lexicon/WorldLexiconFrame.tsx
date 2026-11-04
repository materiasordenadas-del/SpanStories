"use client";

import { useEffect, useRef, useState } from "react";
import { createNarrativeSession } from '@/features/story-engine';
import { buildBarcelonaPilot } from '@/features/story-engine/fixtures/barcelona-piloto';
import integration from '@/SpanStories-Ciudades/Mundo/Historias/integracion.json';
import { createHostBridge, type HostReplyMessage, type WorldLexiconService } from "@/features/world-lexicon";
import styles from "./world-lexicon.module.css";

/**
 * Incrusta el visor 3D y atiende sus intentos de escritura.
 * Solo se aceptan mensajes del origen exacto del visor y de la ventana de este iframe (ver createHostBridge).
 */
export function WorldLexiconFrame({ viewerUrl, service, title, development=false, localTest=false, draft=false,exploration=false,query='' }: { readonly viewerUrl: string; readonly service: WorldLexiconService; readonly title: string; readonly development?:boolean; readonly localTest?:boolean; readonly draft?:boolean; readonly exploration?:boolean; readonly query?:string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [session]=useState(()=>createNarrativeSession({...buildBarcelonaPilot(),binding:integration.bindings[0]}));
  const activeSession=useRef(session);
  const draftApplied=useRef(false);
  const [moment,setMoment]=useState(()=>session.current());
  const [ready,setReady]=useState(false);
  const sceneRef=useRef(moment.scene);
  const viewer = new URL(viewerUrl);
  // Conservar zona, sala y diagnóstico de los antiguos accesos directos.
  const entryQuery=new URLSearchParams(query);
  for(const key of ['zone','room','dev','unbatched','revision'])if(entryQuery.has(key))viewer.searchParams.set(key,entryQuery.get(key)!);
  if(!development)viewer.searchParams.set("aprendizaje", "");
  else viewer.searchParams.delete('aprendizaje');
  if(localTest)viewer.searchParams.set('dev','');
  if(draft)viewer.searchParams.set('borrador','');
  if(exploration)viewer.searchParams.set('explorar','');
  const origin = viewer.origin;

  useEffect(() => {
    service.setScene?.(exploration?service.entryIds():[],exploration?null:integration.bindings[0].storyVersionId);
    const bridge = createHostBridge({
      service,
      expectedOrigin: origin,
      expectedSource: () => frame.current?.contentWindow ?? null,
      postToViewer: (message: HostReplyMessage, targetOrigin: string) => frame.current?.contentWindow?.postMessage(message, targetOrigin),
    });
    const onMessage = (event: MessageEvent) => {
      if(event.origin!==origin||event.source!==frame.current?.contentWindow)return;
      const m=event.data;
      if(m?.channel==='spanstories.narrative'&&m.version===1){
        if(m.type==='READY'){
          if(draft&&!draftApplied.current&&Array.isArray(m.draft?.scenes))try{
            if(!m.draft.scenes.every((s:{entryIds:string[];zoneId:string})=>s.zoneId==='barcelona-passeig-gracia'&&s.entryIds.every(id=>service.entryIds().includes(id))))throw new Error('Vocabulario desconocido');
            activeSession.current=createNarrativeSession({...buildBarcelonaPilot(),binding:{...integration.bindings[0],scenes:m.draft.scenes}});
            const next=activeSession.current.current();sceneRef.current=next.scene;setMoment(next);draftApplied.current=true;
          }catch{/* conservar el piloto validado */}
          frame.current?.contentWindow?.postMessage({channel:'spanstories.narrative',version:1,type:'SCENE',scene:sceneRef.current},origin);
        }
        if(m.type==='SCENE_READY'&&m.sceneId===sceneRef.current.id){service.setScene?.(sceneRef.current.entryIds,integration.bindings[0].storyVersionId);setReady(true);}
        if(m.type==='SCENE_ERROR')setReady(false);
      } else void bridge.handle({ origin: event.origin, source: event.source, data: event.data });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [service, origin,draft,exploration]);

  return (
    <>
    <iframe
      ref={frame}
      className={styles.frame}
      title={title}
      src={viewer.href}
      allow="autoplay"
      sandbox={development?'allow-scripts allow-same-origin allow-downloads allow-pointer-lock allow-popups allow-popups-to-escape-sandbox':'allow-scripts allow-same-origin'}
    />
    {!development&&!exploration&&<section className={styles.narrative} aria-label="Historia">
      <p>{moment.finished?'Recorrido terminado. Tus palabras guardadas siguen disponibles para practicar.':moment.text}</p>
      <small>{ready?`${moment.index+1} / ${moment.total} · Puedes practicar o continuar`:'Preparando la escena…'}</small>
      <button type="button" disabled={!ready} onClick={()=>{
        const next=moment.finished?activeSession.current.restart():activeSession.current.next();sceneRef.current=next.scene;setMoment(next);
        if(!next.finished){service.setScene?.([],integration.bindings[0].storyVersionId);setReady(false);frame.current?.contentWindow?.postMessage({channel:'spanstories.narrative',version:1,type:'SCENE',scene:next.scene},origin);}
      }}>{moment.finished?'Volver a empezar':moment.index===moment.total-1?'Terminar':'Continuar'}</button>
    </section>}
    </>
  );
}
