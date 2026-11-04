"use client";

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildStudioRehearsal } from '@/features/story-studio/demo';
import { createStudioDirector } from '@/features/story-studio/director';
import { createStudioRepository } from '@/features/story-studio/repository';
import { sequenceDuration, sequenceList, validateProject, type Cue, type Gate, type Shot, type StudioProject, type StudioSource, type Vec3 } from '@/features/story-studio/model';
import { createHostBridge, type HostReplyMessage, type WorldLexiconService } from '@/features/world-lexicon';
import styles from './story-studio.module.css';
import { StudioReading } from './StudioReading';
import { IndexedDBStoryRepository } from '@/features/story-engine';
import { readStoredSources, reviseDialogue } from '@/features/story-studio/sources';
import {useStudioAudio} from './useStudioAudio';
import {StudioMediaRepository,localAudioId,type StudioAudioAsset} from '@/features/story-studio/browser-media';
import {speakSpanish} from '@/features/story-reader/browser-speech';
import {storePublishedPresentation} from '@/features/story-studio/publication';

const Flow = dynamic(() => import('./StudioFlow').then(m => m.StudioFlow), { ssr: false });
const Timeline = dynamic(() => import('./StudioTimeline').then(m => m.StudioTimeline), { ssr: false });
const kindNames = { camera: 'Cámara', actor: 'Actuación', dialogue: 'Diálogo', sound: 'Sonido' };
const actionNames = { idle: 'Esperar', walk: 'Caminar', turn: 'Girarse', look: 'Mirar', talk: 'Hablar', listen: 'Escuchar', wave: 'Saludar', nod: 'Asentir' };
const uid = () => crypto.randomUUID();
const number = (text: string, fallback: number) => Number.isFinite(Number(text)) && text.trim() ? Number(text) : fallback;
function initialDirection(source:StudioSource,rehearsal:ReturnType<typeof buildStudioRehearsal>):StudioProject{
  if(source.storyVersionId===rehearsal.source.storyVersionId)return structuredClone(rehearsal.project);
  const baseId=source.storyId===rehearsal.source.storyId?rehearsal.project.id:`studio-${source.storyId}`;
  return {...structuredClone(rehearsal.project),id:baseId+((source.versionNumber??1)>1?`-storyv${source.versionNumber}`:''),name:source.title,storyId:source.storyId,storyVersionId:source.storyVersionId,
    scenes:[{...structuredClone(rehearsal.project.scenes[0]),id:`scene-${source.storyVersionId}`,actors:[],sequences:source.sentences.map(s=>({id:`sequence-${s.id}`,name:s.text.slice(0,36),cues:[{id:`dialogue-${s.id}`,at:0,duration:3,kind:'dialogue',sentenceId:s.id,speakerId:null}],gate:{kind:'continue',prompt:'Continúa cuando quieras.'}}))}]};
}
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { world: 'M12 3 3 8v9l9 5 9-5V8L12 3Zm0 0v19M3 8l9 5 9-5', build: 'M3 8h18v13H3V8Zm5 0V4h8v4M3 13h18', flow: 'M5 5h5v5H5zM14 14h5v5h-5zM8 10v6h6M10 7h7v7', play: 'm8 5 11 7-11 7V5Z', save: 'M5 3h13l3 3v15H3V3h2Zm2 0v7h10V3M7 21v-7h10v7', plus: 'M12 4v16M4 12h16', camera: 'M3 7h12v12H3V7Zm12 4 6-4v12l-6-4M6 4h6', person: 'M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 22v-4a7 7 0 0 1 14 0v4', chat: 'M3 4h18v13H9l-6 4V4Zm4 5h10M7 12h7', sound: 'M3 9h4l5-5v16l-5-5H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16', undo: 'M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14', check: 'm5 12 4 4L20 5', look: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.flow} /></svg>;
}
const buttonIcon = (name: string, label: string) => <><Icon name={name} /><span>{label}</span></>;

export function StoryStudio({ viewerUrl, service, owner, sources = [] }: { viewerUrl: string; service: WorldLexiconService; owner: string; sources?: StudioSource[] }) {
  const rehearsal = useMemo(() => buildStudioRehearsal(), []);
  const baseCatalog = useMemo(() => [rehearsal.source, ...sources], [rehearsal, sources]);
  const [localSources,setLocalSources]=useState<StudioSource[]>([]);
  const catalog = useMemo(() => [...baseCatalog,...localSources], [baseCatalog,localSources]);
  const [sourceId, setSourceId] = useState(rehearsal.source.storyVersionId);
  const source = catalog.find(s => s.storyVersionId === sourceId)!;
  const [project, setProject] = useState(rehearsal.project);
  const [sequenceId, setSequenceId] = useState(project.scenes[0].sequences[0].id);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [tab, setTab] = useState<'moment' | 'camera' | 'actors' | 'interaction'>('moment');
  const [library, setLibrary] = useState<'characters' | 'scenarios' | 'actions'>('characters');
  const [student, setStudent] = useState(false);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [flowDetail,setFlowDetail]=useState(false);
  const [status, setStatus] = useState('Conectando con el escenario de Barcelona…');
  const [savedSignature, setSavedSignature] = useState(() => JSON.stringify(rehearsal.project));
  const dirty = useMemo(() => JSON.stringify(project) !== savedSignature, [project, savedSignature]);
  const [history, setHistory] = useState<StudioProject[]>([]);
  const [future, setFuture] = useState<StudioProject[]>([]);
  const [characters, setCharacters] = useState<{ id: string; label: string }[]>([]);
  const [characterClips,setCharacterClips]=useState<Record<string,string[]>>({});
  const [entries, setEntries] = useState<{ id: string; label: string }[]>([]);
  const [answer, setAnswer] = useState('');
  const [objectTouch,setObjectTouch]=useState<{sequenceId:string;entryId:string}|null>(null);
  const [objectOpen,setObjectOpen]=useState(false);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [publishing,setPublishing]=useState(false);
  const [actorId, setActorId] = useState<string | null>(null);
  const [soundUrl, setSoundUrl] = useState('');
  const [soundPicker, setSoundPicker] = useState(false);
  const [editorial,setEditorial]=useState<{sentenceId:string;text:string}|null>(null);
  const [editing,setEditing]=useState(false);
  const [canonicalReady,setCanonicalReady]=useState(false);
  const [importingAudio,setImportingAudio]=useState(false);
  const sourceRepository=useRef<IndexedDBStoryRepository|null>(null);
  const selectionTouched=useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [initialDirector] = useState(() => createStudioDirector(project, source));
  const director = useRef(initialDirector);
  const [playback, setPlayback] = useState(() => initialDirector.snapshot());
  const playbackRef = useRef(playback);
  const projectRef = useRef(project);
  const sourceRef = useRef(source);
  const studentRef = useRef(student);
  const dirtyRef=useRef(dirty);
  useEffect(() => { playbackRef.current = playback; projectRef.current = project; sourceRef.current = source; studentRef.current = student; dirtyRef.current=dirty; }, [playback, project, source, student,dirty]);
  const requests = useRef(new Map<string, (value: { shot: Shot; position: Vec3 }) => void>());
  const audioControls=useStudioAudio(owner,playback);
  const viewer = new URL(viewerUrl); viewer.searchParams.set('estudio', '1');
  const origin = viewer.origin;
  const send = useCallback((type: string, data: Record<string, unknown> = {}) => frame.current?.contentWindow?.postMessage({ channel: 'spanstories.studio', version: 1, type, ...data }, origin), [origin]);
  const list = sequenceList(project), item = list.find(x => x.sequence.id === sequenceId) ?? list[0];
  const { scene, sequence } = item;
  const selectedCue = sequence.cues.find(c => c.id === selectedCueId) ?? sequence.cues.find(c => c.kind === 'dialogue');
  const dialogue = sequence.cues.find(c => c.kind === 'dialogue');
  const actor = scene.actors.find(a => a.id === actorId) ?? scene.actors[0];
  const sentence = source.sentences.find(s => s.id === playback.stage.caption?.sentenceId);
  const duration = sequenceDuration(sequence);
  const touchedObject=objectTouch?.sequenceId===playback.stage.sequenceId?objectTouch.entryId:null;
  const editableDialogue=selectedCue?.kind==='dialogue'?selectedCue:dialogue?.kind==='dialogue'?dialogue:null;
  const editableSentence=source.sentences.find(s=>s.id===editableDialogue?.sentenceId);
  function supportsAction(action:string,characterId=actor?.characterId){
    if(!characterId)return false;
    const clips=characterClips[characterId]??[];
    if(action==='wave')return clips.some(name=>/wave|greet/i.test(name));
    if(action==='nod')return clips.some(name=>/nod|agree/i.test(name));
    if(action==='look')return scene.actors.length>1;
    return true;
  }

  useEffect(()=>{
    let cancelled=false;
    const repository=new IndexedDBStoryRepository(owner);sourceRepository.current=repository;
    void readStoredSources(repository,baseCatalog).then(stored=>{if(!cancelled){
      setLocalSources(stored);setCanonicalReady(true);
      if(!selectionTouched.current&&!dirtyRef.current){
        selectionTouched.current=true;
        const last=window.localStorage.getItem(`spanstories.story-studio.last-source:${encodeURIComponent(owner)}`),previous=[...baseCatalog,...stored].find(s=>s.storyVersionId===last);
        if(previous){const initial=initialDirection(previous,rehearsal),record=createStudioRepository(window.localStorage,owner,initial.id).load(previous),restored=record?.draft??initial;setSourceId(previous.storyVersionId);setProject(restored);setSavedSignature(JSON.stringify(restored));setSequenceId(restored.scenes[0].sequences[0].id);}
      }
    }}).catch(error=>{if(!cancelled)setStatus(error instanceof Error?error.message:'No se pudo abrir el archivo de historias.');});
    return ()=>{cancelled=true;if(sourceRepository.current===repository)sourceRepository.current=null;void repository.close().catch(()=>{});};
  },[owner,baseCatalog,rehearsal]);

  const change = useCallback((next: StudioProject) => {
    try {
      validateProject(next, source);
      setHistory(h => [...h.slice(-39), structuredClone(project)]); setFuture([]);
      setProject(next); setReleaseId(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Cambio inválido.'); }
  }, [project, source]);
  const changeRef=useRef(change);
  useEffect(()=>{changeRef.current=change;},[change]);
  function edit(fn: (copy: StudioProject) => void) { const copy = structuredClone(project); fn(copy); change(copy); }
  function editSequence(fn: (copy: typeof sequence) => void) { edit(copy => fn(sequenceList(copy).find(x => x.sequence.id === sequence.id)!.sequence)); }
  function editCue(fn: (cue: Cue) => void) { if (selectedCue) editSequence(copy => fn(copy.cues.find(c => c.id === selectedCue.id)!)); }
  function select(id: string) { setSequenceId(id); setSelectedCueId(null); setTab('moment'); setAnswer(''); }
  function capture(fn: (value: { shot: Shot; position: Vec3 }) => void) {
    const id = uid(); requests.current.set(id, fn); send('CAPTURE', { requestId: id });
    window.setTimeout(() => { if (requests.current.delete(id)) setStatus('El escenario no respondió a la captura.'); }, 10000);
  }
  const repo = useCallback(() => createStudioRepository(window.localStorage, owner, projectRef.current.id), [owner]);
  useEffect(() => {
    try {
      const record = repo().load(sourceRef.current);
      if (record) { setProject(record.draft); setSavedSignature(JSON.stringify(record.draft)); setSequenceId(record.draft.scenes[0].sequences[0].id); setStatus('Borrador recuperado de este navegador.'); }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo recuperar el borrador.'); }
  }, [repo]);
  useEffect(() => {
    director.current = createStudioDirector(project, source);
    const index = sequenceList(project).findIndex(x => x.sequence.id === sequenceId);
    setPlayback(director.current.seek(Math.max(0, index))); setReady(false);
  }, [project, source, sequenceId]);

  useEffect(() => {
    const bridge = createHostBridge({ service, expectedOrigin: origin, expectedSource: () => frame.current?.contentWindow ?? null, postToViewer: (message: HostReplyMessage, targetOrigin: string) => frame.current?.contentWindow?.postMessage(message, targetOrigin) });
    const helloTimer=window.setInterval(()=>send('HELLO'),1500);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const m = event.data;
      if (m?.channel !== 'spanstories.studio' || m.version !== 1) { void bridge.handle({ origin: event.origin, source: event.source, data: m }); return; }
      if (m.type === 'READY') {
        window.clearInterval(helloTimer);
        setConnected(true); setCharacters(Array.isArray(m.characters) ? m.characters : []); setEntries(Array.isArray(m.entries) ? m.entries : []);
        const currentScene=projectRef.current.scenes.find(s=>s.id===playbackRef.current.stage.sceneId);
        if(currentScene)send('STAGE', { requestId: uid(), stage: { ...playbackRef.current.stage, zoneId: currentScene.zoneId, entryIds: currentScene.entryIds }, student: studentRef.current, allowLook: projectRef.current.navigation.allowLook });
        setStatus('Escenario conectado · elige un momento para dirigirlo.');
      }
      if (m.type === 'STAGE_READY' && m.sequenceId === playbackRef.current.stage.sequenceId) { setReady(true); }
      if(m.type==='CHARACTER_READY'&&typeof m.characterId==='string'&&Array.isArray(m.animations))setCharacterClips(old=>({...old,[m.characterId]:m.animations.filter((v:unknown)=>typeof v==='string')}));
      if(m.type==='FOCUSED'){
        const next=structuredClone(projectRef.current),current=sequenceList(next).find(x=>x.sequence.id===playbackRef.current.stage.sequenceId)!.sequence;
        const cameraCue=current.cues.find(c=>c.kind==='camera'&&c.at===0);
        const label=m.shotType==='primero'?'Primer plano':m.shotType==='medio'?'Plano medio':'Plano general';
        if(cameraCue?.kind==='camera'){cameraCue.shot=m.shot;cameraCue.label=label;}
        else current.cues.push({id:uid(),kind:'camera',at:0,duration:Math.max(.05,sequenceDuration(current)),shot:m.shot,label});
        changeRef.current(next);setStatus('Plano establecido para este momento a partir del tamaño real del personaje.');
      }
      if (m.type === 'ERROR') { setReady(false); setStatus(typeof m.message === 'string' ? m.message : 'No se pudo preparar el momento.'); setPlayback(director.current.pause()); }
      if (m.type === 'CAPTURED') { const pending = requests.current.get(m.requestId); requests.current.delete(m.requestId); pending?.({ shot: m.shot, position: m.position }); }
      if (m.type === 'PLACED') {
        const next = structuredClone(projectRef.current); const a = next.scenes.flatMap(s => s.actors).find(a => a.id === m.actorId);
        if (a) { a.position = m.position; changeRef.current(next); setStatus('Personaje colocado en el escenario.'); }
      }
      if (m.type === 'OBJECT_TOUCHED' && studentRef.current) {
        setObjectOpen(true);
        const gate=director.current.snapshot().gate;
        if(gate.kind==='object'&&gate.entryIds.includes(m.entryId))setObjectTouch({sequenceId:director.current.snapshot().stage.sequenceId,entryId:m.entryId});
      }
      if(m.type==='OBJECT_CLOSED')setObjectOpen(false);
    };
    window.addEventListener('message', onMessage); send('HELLO'); return () => { window.clearInterval(helloTimer);window.removeEventListener('message', onMessage); };
  }, [origin, send, service]);

  useEffect(() => {
    if (!connected) return;
    const currentScene = project.scenes.find(s => s.id === playback.stage.sceneId)!;
    if(!currentScene)return;
    service.setScene?.(student ? currentScene.entryIds : [], source.storyVersionId);
    send('STAGE', { requestId: uid(), stage: { ...playback.stage, zoneId: currentScene.zoneId, entryIds: currentScene.entryIds }, student, playing: playback.state === 'playing', waiting: playback.state === 'waiting', allowLook: project.navigation.allowLook });
  }, [connected, playback, project, send, service, source, student]);

  useEffect(() => {
    if (playback.state !== 'playing' || !ready) return;
    let last = performance.now(), elapsed = 0;
    const tick = window.setInterval(() => {
      const now = performance.now(); elapsed += Math.min((now - last) / 1000, .25); last = now;
      const next = director.current.tick(elapsed); elapsed = 0;
      setPlayback(next);
      // Advancing playback must not recreate the director at each new sequence.
    }, 100);
    return () => window.clearInterval(tick);
  }, [playback.state, ready]);
  useEffect(() => { const unload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [dirty]);

  function play() { if (ready) setPlayback(playback.state === 'playing' ? director.current.pause() : director.current.play()); }
  function respond(kind: Gate['kind'], value?: string) {
    const result = director.current.respond({ kind, value }); setPlayback(result.snapshot); setAnswer('');
    if (!result.accepted) setStatus('Prueba otra vez. La historia espera tu respuesta.');
  }
  function save() {
    try { const next = repo().save(project, source); setProject(next); setSavedSignature(JSON.stringify(next)); setStatus(`Borrador guardado · revisión ${next.revision} · en este navegador.`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo guardar.'); }
  }
  async function publish() {
    if(publishing)return;setPublishing(true);
    let privateMedia:StudioMediaRepository|null=null,publicMedia:StudioMediaRepository|null=null;
    try {
      if(source.status!=='PUBLISHED'||!source.blueprintId)throw new Error('El ensayo puede guardarse y previsualizarse. Para publicar se necesita una versión curricular aprobada del Story Engine.');
      if(dirty)throw new Error('Guarda la puesta en escena antes de publicar.');
      const ids=new Set(project.scenes.flatMap(s=>s.sequences.flatMap(q=>q.cues.flatMap(c=>(c.kind==='dialogue'||c.kind==='sound')&&c.audioUrl?localAudioId(c.audioUrl)??[]:[]))));
      if(ids.size){privateMedia=new StudioMediaRepository(owner);publicMedia=new StudioMediaRepository('published');for(const id of ids){const asset=await privateMedia.get(id);if(!asset)throw new Error('Falta un archivo de audio de la historia.');await publicMedia.save(asset);}}
      const release = repo().publish(project, source, uid(), new Date().toISOString());storePublishedPresentation(window.localStorage,release,source);setReleaseId(release.id);setStatus('Publicación local lista. Puedes abrir la vista del estudiante sin el editor.');
    }catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo publicar.'); }
    finally{await Promise.allSettled([privateMedia?.close(),publicMedia?.close()]);setPublishing(false);}
  }
  function addCharacter(characterId: string, name: string) {
    capture(({ position }) => {
      const id = uid(); const next = structuredClone(projectRef.current); const current = next.scenes.find(s => s.id === scene.id)!;
      current.actors.push({ id, characterId, name, position, rotation: 0, height: 1.72 }); change(next); setActorId(id); setTab('actors');
      send('PLACE', { actorId: id }); setStatus('Haz clic en el suelo para colocar a ' + name + '.');
    });
  }
  function addCue(kind: Cue['kind']) {
    const base = { id: uid(), at: 0, duration: 3 };
    if (kind === 'camera') { capture(({ shot }) => editSequence(s => s.cues.push({ ...base, kind, shot, label: 'Plano capturado' }))); return; }
    if (kind === 'actor') {
      if (!actor) { setStatus('Añade primero un personaje desde la biblioteca.'); return; }
      editSequence(s => s.cues.push({ ...base, kind, actorId: actor.id, action: 'idle' }));
    }
    if (kind === 'dialogue') editSequence(s => s.cues.push({ ...base, kind, sentenceId: source.sentences[0].id, speakerId: actor?.id ?? null }));
    if (kind === 'sound') { setSoundPicker(true); return; }
    setSelectedCueId(base.id);
  }
  function chooseSource(id: string) {
    if (dirty) { setStatus('Guarda el borrador actual antes de elegir otra Story.'); return; }
    selectionTouched.current=true;
    const nextSource = catalog.find(s => s.storyVersionId === id)!;
    const initial=initialDirection(nextSource,rehearsal);
    try { const saved = createStudioRepository(window.localStorage, owner, initial.id).load(nextSource); window.localStorage.setItem(`spanstories.story-studio.last-source:${encodeURIComponent(owner)}`,id);setSourceId(id); setProject(saved?.draft ?? initial); setSavedSignature(JSON.stringify(saved?.draft ?? initial)); setSequenceId((saved?.draft ?? initial).scenes[0].sequences[0].id); setHistory([]); setFuture([]); setReleaseId(null); setStatus('Story vinculada por su identidad y versión.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo abrir.'); }
  }
  function exportProject() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${project.id}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveEditorial(){
    if(!editorial||!sourceRepository.current||editing)return;
    if(editorial.text===source.sentences.find(s=>s.id===editorial.sentenceId)?.text){setEditorial(null);return;}
    setEditing(true);
    try{
      const next=await reviseDialogue({repository:sourceRepository.current,source,project,sentenceId:editorial.sentenceId,text:editorial.text});
      selectionTouched.current=true;window.localStorage.setItem(`spanstories.story-studio.last-source:${encodeURIComponent(owner)}`,next.source.storyVersionId);
      setLocalSources(old=>[...old,next.source]);setSourceId(next.source.storyVersionId);setHistory([]);setFuture([]);setReleaseId(null);
      let directed=next.project;
      try{directed=createStudioRepository(window.localStorage,owner,directed.id).save(directed,next.source);setSavedSignature(JSON.stringify(directed));setStatus('Texto y puesta en escena guardados como un borrador nuevo. La versión anterior se conserva.');}
      catch(error){setSavedSignature('');setStatus('El texto se guardó. La puesta en escena sigue sin guardar: '+(error instanceof Error?error.message:'revisa el almacenamiento.'));}
      setProject(directed);setEditorial(null);
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo crear la versión de borrador.');}
    finally{setEditing(false);}
  }
  function bindAudioAsset(asset:StudioAudioAsset,kind:'voice'|'sound',targetId=editableDialogue?.id,targetSentence=editableDialogue?.sentenceId){
    const next=structuredClone(projectRef.current),current=sequenceList(next).find(x=>x.sequence.id===sequenceId)?.sequence;
    if(!current)return;
    if(kind==='voice'){
      const cue=current.cues.find(c=>c.id===targetId);
      if(!cue||cue.kind!=='dialogue'||cue.sentenceId!==targetSentence){setStatus('El audio se guardó en la biblioteca. La intervención cambió antes de vincularlo.');return;}
      cue.audioUrl=`studio-audio:${asset.id}`;cue.duration=asset.duration;
    }else current.cues.push({id:uid(),kind:'sound',at:0,duration:asset.duration,audioUrl:`studio-audio:${asset.id}`,volume:.5,label:asset.name});
    changeRef.current(next);setSoundPicker(false);setStatus(`Audio vinculado · ${asset.name} · ${asset.duration.toFixed(1)} s. Guarda la puesta en escena.`);
  }
  async function importAudio(file:File,kind:'voice'|'sound'){
    if(importingAudio)return;setImportingAudio(true);
    const targetId=editableDialogue?.id,targetSentence=editableDialogue?.sentenceId;
    try{const asset=await audioControls.importAudio(file,kind);bindAudioAsset(asset,kind,targetId,targetSentence);}
    catch(error){setStatus(error instanceof Error?error.message:'No se pudo importar el audio.');}
    finally{setImportingAudio(false);}
  }
  function listen(){
    if(playback.state==='playing')setPlayback(director.current.pause());
    const active=student?playback.stage.caption:editableDialogue;
    if(active?.audioUrl)void audioControls.preview(active.audioUrl).catch(error=>setStatus(error instanceof Error?error.message:'No se pudo escuchar la intervención.'));
    else if(!speakSpanish((student?sentence:editableSentence)?.text??''))setStatus('Este navegador no dispone de voz para leer el texto. Puedes importar una grabación.');
  }
  const currentItem = list[playback.index] ?? item;
  const gate = playback.gate;
  const panelHeading = (title: string, extra?: React.ReactNode) => <div className={styles.panelHeading}><h2>{title}</h2>{extra}</div>;
  const vectorFields = (value: Vec3, update: (v: Vec3) => void) => <div className={styles.vectorFields}>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{axis}<input aria-label={`Posición ${axis}`} type="number" step="0.1" value={Number(value[i].toFixed(3))} onChange={e => update(value.map((v, j) => j === i ? number(e.target.value, v) : v) as unknown as Vec3)} /></label>)}</div>;

  return <div className={`${styles.studio} ${student ? styles.studentMode : ''} ${objectOpen?styles.objectOpen:''}`} style={{ '--timeline-size': showTime ? '120px' : '0px' } as CSSProperties}>
    <header className={styles.header}>
      <a className={styles.brand} href="?modo=desarrollo"><span className={styles.brandIcon}><Icon name="world" /></span><strong>SpanStories</strong><span>Story Studio</span></a>
      <nav aria-label="Modos del visor"><a href="?modo=visor">{buttonIcon('world', 'Explorar mundo')}</a><a href="?modo=desarrollo">{buttonIcon('build', 'Editar mundo')}</a><button aria-pressed={!student} onClick={() => { setStudent(false); setPlayback(director.current.pause()); }}>{buttonIcon('flow', 'Editar historia')}</button><button aria-pressed={student} onClick={() => { setStudent(true); setPlayback(director.current.play()); }}>{buttonIcon('play', 'Reproducir historia')}</button></nav>
      <div className={styles.headerActions}><span className={styles.location}>Barcelona⌄</span><button aria-label="Deshacer" disabled={!history.length || student} onClick={() => { const previous = history.at(-1)!; setFuture(f => [...f, project]); setHistory(h => h.slice(0, -1)); setProject({ ...previous, revision: project.revision }); }}><Icon name="undo" /></button><button aria-label="Rehacer" disabled={!future.length || student} onClick={() => { setHistory(h => [...h, project]); setProject({ ...future.at(-1)!, revision: project.revision }); setFuture(f => f.slice(0, -1)); }}><span>↪</span></button><button onClick={save} disabled={student}>{buttonIcon('save', 'Guardar')}</button><button className={styles.primary} onClick={publish} disabled={student||publishing}>{publishing?'Publicando…':'Publicar'}</button></div>
    </header>

    <aside className={styles.leftDock} aria-label="Historia y recursos">
      <section className={styles.panel + ' ' + styles.storyPanel}>{panelHeading('Historia', <button aria-label="Exportar puesta en escena" onClick={exportProject}>↥</button>)}
        <div className={styles.storySelect}><label>Story del proyecto<select aria-label="Elegir Story" value={sourceId} onChange={e => chooseSource(e.target.value)}>{catalog.map(s => <option key={s.storyVersionId} value={s.storyVersionId}>{s.title}{(s.versionNumber??1)>1?` · borrador v${s.versionNumber}`:''}</option>)}</select></label><span className={styles.badge}>{source.status === 'DRAFT' ? (source.blueprintId?'Borrador · pendiente de revisión':'Ensayo · sin publicar') : 'Story publicada'}</span></div>
        <div className={styles.sceneTree}>{project.scenes.map((s, si) => <div key={s.id} className={styles.sceneGroup} data-active={s.id === scene.id}><button className={styles.sceneButton} onClick={() => select(s.sequences[0].id)}><span className={styles.sceneNumber}>{String(si + 1).padStart(2, '0')}</span><span><strong>{s.name}</strong><small>Barcelona · {s.sequences.length} momentos</small></span><span>⌄</span></button>{s.id === scene.id && <div className={styles.sequenceTree}>{s.sequences.map((seq, i) => <button key={seq.id} className={styles.sequenceButton} aria-pressed={seq.id === sequenceId} onClick={() => select(seq.id)}><span>◇</span><span><strong>Secuencia {i + 1}</strong><small>{seq.name}</small></span><span className={styles.sequenceDot} /></button>)}</div>}</div>)}</div>
        <div className={styles.panelBottom}><button onClick={() => edit(copy => { const id = uid(); copy.scenes.push({ ...structuredClone(scene), id: `scene-${id}`, name: 'Nueva escena', sequences: [{ id: `sequence-${id}`, name: 'Nuevo momento', cues: [], gate: { kind: 'continue', prompt: 'Continuar' } }] }); })}>{buttonIcon('plus', 'Añadir escena')}</button></div>
      </section>
      <section className={styles.panel + ' ' + styles.libraryPanel}>{panelHeading('Recursos del proyecto')}<div className={styles.tabs}>{(['characters', 'scenarios', 'actions'] as const).map(k => <button key={k} aria-pressed={library === k} onClick={() => setLibrary(k)}>{k === 'characters' ? 'Personajes' : k === 'scenarios' ? 'Escenarios' : 'Actuaciones'}</button>)}</div>
        <div className={styles.resourceGrid}>{library === 'characters' ? characters.map(c => <button className={styles.resourceCard} key={c.id} disabled={!connected} onClick={() => addCharacter(c.id, c.label)}><div className={styles.characterPortrait}><Icon name="person" /></div><strong>{c.label}</strong><small>Añadir al escenario</small></button>) : library === 'scenarios' ? <button className={styles.resourceCard} onClick={() => setStatus('Estás trabajando en Barcelona · Passeig de Gràcia.')}><div className={styles.cityThumb} /><strong>Barcelona</strong><small>Passeig de Gràcia</small></button> : Object.entries(actionNames).map(([key, label]) => <button key={key} disabled={!supportsAction(key)} title={supportsAction(key)?label:'Este modelo todavía no dispone de esta actuación.'} onClick={() => { if (!actor) { setStatus('Añade un personaje primero.'); return; } const cue: Cue = { id: uid(), kind: 'actor', actorId: actor.id, action: key as keyof typeof actionNames, at: 0, duration: 3 }; editSequence(s => s.cues.push(cue)); setSelectedCueId(cue.id); setTab('moment'); }}>{label}</button>)}</div>
        {library === 'characters' && <p className={styles.hint}>Modelos de la biblioteca del visor.</p>}
      </section>
    </aside>

    <section className={styles.viewport} aria-label="Visor 3D de Story Studio">
      <iframe ref={frame} src={viewer.href} title="Barcelona · escenario de la historia" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-downloads" />
      {!student && <div className={styles.viewportTop}><div className={styles.cameraChip}><Icon name="camera" /><span>Cámara de dirección<strong>{sequence.name}</strong></span></div><button title="Guardar el encuadre actual" onClick={() => capture(({ shot }) => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot = shot; }))}>{buttonIcon('camera', 'Capturar plano')}</button></div>}
      <div className={styles.stageCorner}><span className={styles.liveDot} />{ready ? (student ? 'Mirar y tocar · recorrido dirigido' : 'Escenario del visor') : 'Preparando escenario…'}</div>
      <div className={styles.transport}><button onClick={() => { const next = student?director.current.back():director.current.seek(Math.max(0, playback.index - 1)); setPlayback(next); }} disabled={!ready||(student?!playback.canGoBack:playback.index===0)} aria-label="Momento anterior">|◀</button><button disabled={!ready} onClick={play} aria-label={playback.state === 'playing' ? 'Pausar historia' : 'Reproducir momento'}>{playback.state === 'playing' ? 'Ⅱ' : '▶'}</button><span>{playback.time.toFixed(1)}s / {playback.duration.toFixed(1)}s</span><span className={styles.transportDivider} /><span>{playback.state === 'waiting' ? 'Esperando al estudiante' : playback.state === 'finished' ? 'Historia terminada' : 'Momento ' + (playback.index + 1)}</span></div>
      {student && <div className={styles.studentDialogue} aria-live="polite"><small>{playback.stage.caption?.speakerId ? currentItem.scene.actors.find(a => a.id === playback.stage.caption!.speakerId)?.name : 'Narrador'}</small><div className={styles.readingLine}>{sentence ? <StudioReading source={source} sentenceId={sentence.id} owner={owner} onPause={() => setPlayback(director.current.pause())} /> : currentItem.sequence.name}</div>{playback.state === 'waiting' && <><p className={styles.gatePrompt}>{gate.kind !== 'auto' ? gate.prompt : ''}</p>{gate.kind === 'continue' && <button className={styles.primary} onClick={() => respond('continue')}>Continuar →</button>}{gate.kind === 'choice' && gate.options.map(o => <button key={o.id} onClick={() => respond('choice', o.id)}>{o.label}</button>)}{gate.kind === 'answer' && <form onSubmit={e => { e.preventDefault(); respond('answer', answer); }}><input aria-label="Tu respuesta" value={answer} onChange={e => setAnswer(e.target.value)} /><button>Responder</button></form>}</>}{playback.state === 'finished' && <button onClick={() => setPlayback(director.current.play())}>Volver a empezar</button>}</div>}
      {student&&playback.state==='waiting'&&gate.kind==='object'&&touchedObject&&<button className={styles.objectContinue} onClick={()=>respond('object',touchedObject)}>Objeto observado · Continuar →</button>}
      {student&&sentence&&<button className={styles.studentReplay} onClick={listen}>{buttonIcon('sound','Escuchar de nuevo')}</button>}
    </section>

    <section className={styles.flowPanel + ' ' + styles.panel} aria-label="Flujo narrativo">{panelHeading('Flujo narrativo', <div className={styles.inlineButtons}><button aria-pressed={flowDetail} onClick={()=>setFlowDetail(!flowDetail)}>{flowDetail?'Ver escena':'Ver acciones'}</button><button onClick={() => { const id = uid(); edit(copy => copy.scenes.find(s => s.id === scene.id)!.sequences.push({ id, name: 'Nuevo momento', cues: [], gate: { kind: 'continue', prompt: 'Continuar' } })); select(id); }}>{buttonIcon('plus', 'Añadir momento')}</button></div>)}<div className={styles.flowCanvas}>{!student&&<Flow project={project} source={source} sceneId={scene.id} selectedId={sequenceId} selectedCueId={selectedCueId} detail={flowDetail} onSelect={(id,gate)=>{select(id);if(gate)setTab('interaction');}} onCueSelect={id=>{setSelectedCueId(id);setTab('moment');}} onChange={change} />}</div></section>

    <aside className={styles.rightDock} aria-label="Dirección y acciones">
      <section className={styles.panel + ' ' + styles.properties}>{panelHeading('Propiedades')}<div className={styles.tabs}>{(['moment', 'camera', 'actors', 'interaction'] as const).map(k => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === 'moment' ? 'Momento' : k === 'camera' ? 'Cámara' : k === 'actors' ? 'Personajes' : 'Interacción'}</button>)}</div>
        <div className={styles.inspector}>
          {tab==='moment'&&selectedCue?.kind==='actor'&&selectedCue.action==='turn'&&<label>Orientación final (grados)<input type="number" step="5" value={Math.round((selectedCue.rotation??scene.actors.find(a=>a.id===selectedCue.actorId)?.rotation??0)*180/Math.PI)} onChange={e=>editCue(c=>{if(c.kind==='actor')c.rotation=number(e.target.value,0)*Math.PI/180;})}/></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&selectedCue.action==='look'&&<label>Mirar a<select value={selectedCue.lookAt??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.lookAt=e.target.value;else delete c.lookAt;}})}><option value="">Selecciona un personaje</option>{scene.actors.filter(a=>a.id!==selectedCue.actorId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          {tab==='actors'&&actor&&<><h3>Encuadrar a {actor.name}</h3><div className={styles.inlineButtons}>{[['general','General'],['medio','Medio'],['primero','Primer plano']].map(([type,label])=><button key={type} disabled={!ready} onClick={()=>send('FOCUS_ACTOR',{actorId:actor.id,shotType:type})}>{label}</button>)}</div></>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Expresión del modelo<select value={selectedCue.expression??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.expression=e.target.value;else delete c.expression;}})}><option value="">Mantener expresión actual</option>{(characterClips[scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId??'']??[]).filter(name=>/facial|expression|face/i.test(name)).map(name=><option key={name} value={name}>{name.replace(/Samuel_Juan_Facial_/,'')}</option>)}</select></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Animación corporal<select value={selectedCue.clipName??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.clipName=e.target.value;else delete c.clipName;}})}><option value="">Según la actuación</option>{(characterClips[scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId??'']??[]).filter(name=>!/facial|expression|face/i.test(name)).map(name=><option key={name} value={name}>{name==='Catching_Breath'?'Respirar':name==='Slap_Reaction'?'Reaccionar':name==='Excited_Walk_M'?'Caminar con entusiasmo':name==='Walking'?'Caminar':name==='restpose'?'Pose base':name}</option>)}</select></label>}
          {tab === 'moment' && <><div className={styles.inspectorTitle}><span className={styles.objectIcon}><Icon name="flow" /></span><div><h3>{sequence.name}</h3><small>Secuencia de la historia</small></div></div><label>Nombre<input value={sequence.name} onChange={e => editSequence(s => { s.name = e.target.value; })} /></label><label>Acción seleccionada<select value={selectedCue?.id ?? ''} onChange={e => setSelectedCueId(e.target.value)}><option value="" disabled>Selecciona una acción</option>{sequence.cues.map(c => <option value={c.id} key={c.id}>{kindNames[c.kind]} · {c.kind === 'actor' ? actionNames[c.action] : c.kind === 'camera' ? c.label : c.kind === 'sound' ? c.label : source.sentences.find(s => s.id === c.sentenceId)?.text.slice(0, 30)}</option>)}</select></label>
            {selectedCue && <><div className={styles.twoColumns}><label>Inicio (s)<input type="number" min="0" step="0.1" value={selectedCue.at} onChange={e => editCue(c => { c.at = Math.max(0, number(e.target.value, c.at)); })} /></label><label>Duración (s)<input type="number" min="0.05" step="0.1" value={selectedCue.duration} onChange={e => editCue(c => { c.duration = Math.max(.05, number(e.target.value, c.duration)); })} /></label></div>
              {selectedCue.kind === 'dialogue' && <><label>Intervención de la Story<select value={selectedCue.sentenceId} onChange={e => editCue(c => { if (c.kind === 'dialogue') c.sentenceId = e.target.value; })}>{source.sentences.map(s => <option key={s.id} value={s.id}>{s.text}</option>)}</select></label><label>Quién habla<select value={selectedCue.speakerId ?? ''} onChange={e => editCue(c => { if (c.kind === 'dialogue') c.speakerId = e.target.value || null; })}><option value="">Narrador</option>{scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Archivo de voz (URL)<input placeholder="/audio/intervencion.mp3" value={selectedCue.audioUrl ?? ''} onChange={e => editCue(c => { if (c.kind === 'dialogue') { if (e.target.value) c.audioUrl = e.target.value; else delete c.audioUrl; } })} /></label></>}
              {selectedCue.kind === 'actor' && <><label>Actuación<select value={selectedCue.action} onChange={e => editCue(c => { if (c.kind === 'actor') c.action = e.target.value as keyof typeof actionNames; })}>{Object.entries(actionNames).map(([k, v]) => <option key={k} value={k} disabled={!supportsAction(k,scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId)}>{v}</option>)}</select></label>{selectedCue.action === 'walk' && <button onClick={() => capture(({ position }) => editCue(c => { if (c.kind === 'actor') c.destination = position; }))}>Caminar hasta el centro de la vista</button>}<p className={styles.hint}>Se reutilizan los clips disponibles del modelo. Los gestos requieren su animación correspondiente.</p></>}
              {selectedCue.kind === 'sound' && <><label>Archivo de sonido<input value={selectedCue.audioUrl} onChange={e => editCue(c => { if (c.kind === 'sound') c.audioUrl = e.target.value; })} /></label><label>Volumen<input type="range" min="0" max="1" step=".05" value={selectedCue.volume} onChange={e => editCue(c => { if (c.kind === 'sound') c.volume = Number(e.target.value); })} /></label></>}
            </>}
          </>}
          {tab === 'camera' && <><h3>Cámara de la escena</h3><p className={styles.hint}>Navega en la vista 3D y captura el encuadre. El plano se reutiliza en esta escena.</p><button className={styles.wideButton} onClick={() => capture(({ shot }) => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot = shot; }))}>{buttonIcon('camera', 'Usar encuadre actual')}</button><label>Posición</label>{vectorFields(scene.shot.position, position => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot.position = position; }))}<label>Campo de visión · {scene.shot.fov}°<input aria-label="Campo de visión" type="range" min="15" max="80" value={scene.shot.fov} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot.fov = Number(e.target.value); })} /></label><label className={styles.check}><input type="checkbox" checked={project.navigation.allowLook} onChange={e => edit(copy => { copy.navigation.allowLook = e.target.checked; })} />El estudiante puede mirar alrededor</label></>}
          {tab === 'actors' && <><label>Personaje<select value={actor?.id ?? ''} onChange={e => setActorId(e.target.value)}>{!scene.actors.length && <option>Añade un personaje de la biblioteca</option>}{scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{actor && <><label>Nombre del papel<input value={actor.name} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.name = e.target.value; })} /></label><button className={styles.wideButton} onClick={() => { send('PLACE', { actorId: actor.id }); setStatus('Haz clic en el suelo para colocar a ' + actor.name + '.'); }}>Colocar con un clic en el escenario</button><label>Posición</label>{vectorFields(actor.position, position => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.position = position; }))}<label>Orientación (grados)<input type="number" step="5" value={Math.round(actor.rotation * 180 / Math.PI)} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.rotation = number(e.target.value, 0) * Math.PI / 180; })} /></label></>}</>}
          {tab === 'interaction' && <><h3>Cuándo continúa</h3><label>Avance<select value={sequence.gate.kind} onChange={e => { const kind = e.target.value as Gate['kind']; editSequence(s => { s.gate = kind === 'auto' ? { kind } : kind === 'continue' ? { kind, prompt: 'Continúa cuando quieras.' } : kind === 'choice' ? { kind, prompt: 'Elige una respuesta.', options: [{ id: 'option-a', label: 'Primera respuesta' }, { id: 'option-b', label: 'Segunda respuesta' }] } : kind === 'answer' ? { kind, prompt: 'Escribe tu respuesta.', answers: ['Hola'] } : { kind, prompt: 'Toca el objeto indicado.', entryIds: scene.entryIds.slice(0, 1) }; }); }}><option value="continue">Esperar al estudiante</option><option value="auto">Al terminar las acciones</option><option value="choice">Elegir entre opciones</option><option value="answer">Escribir una respuesta</option><option value="object">Tocar un objeto</option></select></label>{sequence.gate.kind !== 'auto' && <label>Instrucción<input value={sequence.gate.prompt} onChange={e => editSequence(s => { if (s.gate.kind !== 'auto') s.gate.prompt = e.target.value; })} /></label>}{sequence.gate.kind === 'choice' && sequence.gate.options.map((o, i) => <label key={o.id}>Opción {i + 1}<input value={o.label} onChange={e => editSequence(s => { if (s.gate.kind === 'choice') s.gate.options[i].label = e.target.value; })} /><select aria-label={`Destino de opción ${i + 1}`} value={o.nextSequenceId ?? ''} onChange={e => editSequence(s => { if (s.gate.kind === 'choice') s.gate.options[i].nextSequenceId = e.target.value || undefined; })}><option value="">Siguiente momento</option>{list.map(x => <option key={x.sequence.id} value={x.sequence.id}>{x.sequence.name}</option>)}</select></label>)}{sequence.gate.kind === 'answer' && <label>Respuestas aceptadas (separadas por |)<input value={sequence.gate.answers.join(' | ')} onChange={e => editSequence(s => { if (s.gate.kind === 'answer') s.gate.answers = e.target.value.split('|').map(x => x.trim()).filter(Boolean); })} /></label>}<p className={styles.hint}>El alumno puede mirar y tocar. El desplazamiento y los caminos se definen en la historia.</p><h4>Objetos que puede tocar</h4>{entries.map(entry => <label className={styles.check} key={entry.id}><input type="checkbox" checked={scene.entryIds.includes(entry.id)} onChange={e => edit(copy => { const target = copy.scenes.find(s => s.id === scene.id)!; target.entryIds = e.target.checked ? [...target.entryIds, entry.id] : target.entryIds.filter(id => id !== entry.id); })} />{entry.label}</label>)}</>}
        </div>
      </section>
      <section className={styles.panel + ' ' + styles.actionLibrary}>{panelHeading('Añadir a este momento')}<div className={styles.actionButtons}>{(['dialogue', 'camera', 'actor', 'sound'] as const).map(kind => <button key={kind} onClick={() => { setTab('moment'); addCue(kind); }}>{buttonIcon(kind === 'actor' ? 'person' : kind === 'dialogue' ? 'chat' : kind, kindNames[kind])}</button>)}<button onClick={() => setTab('interaction')}>{buttonIcon('look', 'Interacción')}</button></div></section>
      <section className={styles.panel + ' ' + styles.dialoguePanel}>{panelHeading('Diálogo')}<div className={styles.dialogueCard}><span className={styles.speakerAvatar}><Icon name="person" /></span><div><small>{editableDialogue?.speakerId ? scene.actors.find(a => a.id === editableDialogue.speakerId)?.name : 'Narrador'}</small><p>{editableSentence?.text ?? 'Añade una intervención de la Story.'}</p></div></div><small className={styles.sourceNote}>Vinculado a la versión de la Story</small><div className={styles.dialogueActions}><button disabled={!editableSentence||!canonicalReady} onClick={()=>{if(editableSentence)setEditorial({sentenceId:editableSentence.id,text:editableSentence.text});}}>Editar texto</button><button disabled={!editableSentence} onClick={listen}>{buttonIcon('sound','Escuchar')}</button><label className={styles.fileControl}>{importingAudio?'Importando…':'Importar voz'}<input aria-label="Importar voz" type="file" accept="audio/*" disabled={importingAudio||!editableDialogue} onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file,'voice');e.target.value='';}} /></label></div>{audioControls.assets.length>0&&<details className={styles.audioAssets}><summary>Grabaciones disponibles ({audioControls.assets.length})</summary>{audioControls.assets.map(asset=><button key={asset.id} onClick={()=>bindAudioAsset(asset,'voice')}>{asset.name} · {asset.duration.toFixed(1)}s</button>)}</details>}</section>
    </aside>

    <section className={styles.timelinePanel + ' ' + styles.panel} aria-label="Sincronización del momento">{panelHeading('Sincronización de la secuencia', <div className={styles.inlineButtons}><span className={styles.subtle}>{duration.toFixed(1)} s · {sequence.name}</span><button aria-expanded={showTime} onClick={() => setShowTime(!showTime)}>{showTime ? 'Ocultar' : 'Mostrar'}</button></div>)}{showTime && <Timeline scene={scene} sequence={sequence} time={playback.time} onSeek={time => setPlayback(director.current.seek(list.findIndex(x => x.sequence.id === sequenceId), time))} onEdit={cues => editSequence(s => { s.cues = cues; })} onSelect={id => { setSelectedCueId(id); setTab('moment'); }} />}</section>
    <footer className={styles.footer}><span><span className={styles.liveDot} />{student ? 'Modo: Reproducir historia' : 'Modo: Editar historia'}</span><span role="status">{audioControls.error??status}</span><span>{releaseId&&<a href={'?modo=reproducir&publicacion='+encodeURIComponent(releaseId)} target="_blank" rel="noopener">Abrir publicación · </a>}{dirty ? 'Cambios sin guardar' : `Revisión ${project.revision}`}{releaseId ? ' · publicada localmente' : ''}</span></footer>
    {soundPicker&&<div className={styles.modalShade}><form className={styles.mediaDialog} onSubmit={e=>{e.preventDefault();const cue:Cue={id:uid(),kind:'sound',at:0,duration:3,audioUrl:soundUrl,volume:.5,label:'Sonido ambiente'};const copy=structuredClone(project);sequenceList(copy).find(x=>x.sequence.id===sequenceId)!.sequence.cues.push(cue);try{validateProject(copy,source);change(copy);setSelectedCueId(cue.id);setSoundPicker(false);setSoundUrl('');}catch(error){setStatus(error instanceof Error?error.message:'Archivo no válido.');}}}><h3>Vincular sonido</h3><div className={styles.audioFilePicker}><label className={styles.fileControl}>{importingAudio?'Importando…':'Elegir audio del equipo'}<input aria-label="Importar sonido" type="file" accept="audio/*" disabled={importingAudio} onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file,'sound');e.target.value='';}} /></label>{audioControls.assets.map(asset=><button type="button" key={asset.id} onClick={()=>bindAudioAsset(asset,'sound')}>{asset.name} · {asset.duration.toFixed(1)}s</button>)}</div><details><summary>Usar una dirección de audio existente</summary><label>Dirección del archivo<input placeholder="/audio/ambiente.mp3" value={soundUrl} onChange={e=>setSoundUrl(e.target.value)} required /></label><p>La duración se podrá ajustar en la secuencia.</p><button className={styles.primary}>Vincular dirección</button></details><div><button type="button" disabled={importingAudio} onClick={()=>setSoundPicker(false)}>Cerrar</button></div></form></div>}
    {editorial&&<div className={styles.modalShade}><form className={styles.mediaDialog} onSubmit={e=>{e.preventDefault();void saveEditorial();}}><h3>Editar intervención</h3><label>Texto de la Story<textarea aria-label="Texto de la intervención" value={editorial.text} onChange={e=>setEditorial({...editorial,text:e.target.value})} rows={6} maxLength={10000} required autoFocus /></label><p>Se guardará una nueva versión de borrador. La versión publicada y sus palabras conservarán sus referencias originales.</p><div><button type="button" disabled={editing} onClick={()=>setEditorial(null)}>Cancelar</button><button className={styles.primary} disabled={editing}>{editing?'Guardando…':'Guardar nueva versión'}</button></div></form></div>}
  </div>;
}
