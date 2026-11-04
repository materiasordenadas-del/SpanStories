"use client";

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildStudioRehearsal } from '@/features/story-studio/demo';
import { createStudioDirector } from '@/features/story-studio/director';
import { createStudioRepository } from '@/features/story-studio/repository';
import { SCENE_AMBIENTS, sequenceDuration, sequenceList, validateProject, type Cue, type Gate, type SceneAmbient, type Shot, type StudioProject, type StudioSource, type Vec3 } from '@/features/story-studio/model';
import { addScene, analyzeFlow, autoStageDialogue, chainCue, changeSceneZone, createSequence, deleteActor, deleteCue, deleteScene, deleteSequence, dialogueDuration, duplicateCue, duplicateSequence, guessSpeaker, incomingReferences, moveScene, moveSequence, nextCueStart, placeDialogue, sentenceCoverage, setSceneEntries, stageUnusedSentences, suggestSentence } from '@/features/story-studio/editing';
import { StudioStoryStrip } from './StudioStoryStrip';
import { StudioScript } from './StudioScript';
import { createHostBridge, type HostReplyMessage, type WorldLexiconService } from '@/features/world-lexicon';
import styles from './story-studio.module.css';
import { StudioReading } from './StudioReading';
import { IndexedDBStoryRepository } from '@/features/story-engine';
import { readStoredSources, reviseDialogue } from '@/features/story-studio/sources';
import {useStudioAudio} from './useStudioAudio';
import {StudioMediaRepository,localAudioId,type StudioAudioAsset} from '@/features/story-studio/browser-media';
import {speakSpanish} from '@/features/story-reader/browser-speech';
import {storePublishedPresentation} from '@/features/story-studio/publication';
import { LIFE_AFFORDANCES, LIFE_ROLES, lifeIsStale, defaultLife, type LifeAffordance, type LifeRole, type SceneLife } from '@/features/story-studio/life';

const Flow = dynamic(() => import('./StudioFlow').then(m => m.StudioFlow), { ssr: false });
const Timeline = dynamic(() => import('./StudioTimeline').then(m => m.StudioTimeline), { ssr: false });
const kindNames = { camera: 'Cámara', actor: 'Actuación', dialogue: 'Diálogo', sound: 'Sonido' };
const actionNames = { idle: 'Esperar', walk: 'Caminar', turn: 'Girarse', look: 'Mirar', talk: 'Hablar', listen: 'Escuchar', wave: 'Saludar', nod: 'Asentir' };
const ambientNames: Record<SceneAmbient, string> = { manana: 'Mañana · sol cálido', mediodia: 'Mediodía · luz neutra', tarde: 'Tarde · luz rasante', nublado: 'Nublado · luz difusa', noche: 'Noche · lámparas' };
const knownZones: Record<string, string> = { 'barcelona-passeig-gracia': 'Barcelona · Passeig de Gràcia', 'madrid-centro': 'Madrid · Centro' };
type StudioZone = { id: string; label: string; cityLabel?: string; countryLabel?: string };
type Confirmation = { title: string; message: string; confirmLabel: string; run: () => void };
const shortcuts: [string, string][] = [['Ctrl + Z', 'Deshacer'], ['Ctrl + Y · Ctrl + Mayús + Z', 'Rehacer'], ['Ctrl + S', 'Guardar borrador'], ['Espacio', 'Reproducir o pausar el momento'], ['Supr', 'Borrar la acción seleccionada'], ['Ctrl + D', 'Duplicar la acción seleccionada'], ['← / →', 'Mover el cabezal 0,1 s (Mayús: 1 s)'], ['Esc', 'Cancelar la selección en el visor']];
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
  const [tab, setTab] = useState<'scene' | 'moment' | 'camera' | 'actors' | 'interaction' | 'life'>('moment');
  const [library, setLibrary] = useState<'characters' | 'scenarios' | 'actions'>('characters');
  const [student, setStudent] = useState(false);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [flowDetail,setFlowDetail]=useState(false);
  const [status, setStatus] = useState('Conectando con el escenario…');
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
  const [zones,setZones]=useState<StudioZone[]>([]);
  const [scriptOpen,setScriptOpen]=useState(false);
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [shortcutsOpen,setShortcutsOpen]=useState(false);
  const [lastSpeakerId,setLastSpeakerId]=useState<string|null>(null);
  const [picking,setPicking]=useState<{requestId:string;message:string}|null>(null);
  const [focusWithLine,setFocusWithLine]=useState(true);
  const [magnet,setMagnet]=useState(true);
  const [dragSequence,setDragSequence]=useState<string|null>(null);
  const pickHandlers=useRef(new Map<string,(m:{position?:Vec3;entryId?:string|null;label?:string|null})=>void>());
  const focusPending=useRef<{sequenceId:string;at:number;actorName:string}|null>(null);
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
  const stageZoneId = (project.scenes.find(s => s.id === playback.stage.sceneId) ?? project.scenes[0]).zoneId;
  // One city is loaded per viewer page: a scene in another zone reloads the viewer on that zone.
  const viewer = new URL(viewerUrl); viewer.searchParams.set('estudio', '1'); viewer.searchParams.set('zone', stageZoneId);
  const origin = viewer.origin;
  const send = useCallback((type: string, data: Record<string, unknown> = {}) => frame.current?.contentWindow?.postMessage({ channel: 'spanstories.studio', version: 1, type, ...data }, origin), [origin]);
  // Vida ambiental: solo se envían grabaciones vigentes y solo cuando cambian.
  const lifeSent = useRef(new Map<string, string>());
  const lifeRequest = useRef<string | null>(null);
  const [recordingLife, setRecordingLife] = useState(false);
  const sendLives = useCallback((value: StudioProject) => {
    for (const s of value.scenes) {
      const payload = s.life?.recording && !lifeIsStale(s.life) ? { cast: s.life.cast, recording: s.life.recording } : null;
      const key = JSON.stringify(payload);
      if (lifeSent.current.get(s.id) === key) continue;
      lifeSent.current.set(s.id, key); send('LIFE', { sceneId: s.id, life: payload });
    }
  }, [send]);
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
  const explicitCue = sequence.cues.find(c => c.id === selectedCueId) ?? null;
  const playhead = playback.stage.sequenceId === sequence.id ? playback.time : 0;
  const issues = useMemo(() => analyzeFlow(project), [project]);
  const coverage = useMemo(() => sentenceCoverage(project, source), [project, source]);
  const sceneIndex = project.scenes.findIndex(s => s.id === scene.id);
  const sequenceIndex = scene.sequences.findIndex(s => s.id === sequence.id);
  const zoneLabel = (id: string) => { const z = zones.find(z => z.id === id); return z ? `${z.cityLabel ? z.cityLabel + ' · ' : ''}${z.label}` : knownZones[id] ?? id; };
  const entryLabel = (id: string) => entries.find(e => e.id === id)?.label ?? id;
  const optionText = (o: { label: string; sentenceId?: string }) => (o.sentenceId && source.sentences.find(s => s.id === o.sentenceId)?.text) || o.label;
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
  function editCue(fn: (cue: Cue) => void) {
    if (!selectedCue) return;
    const copy = structuredClone(project), target = sequenceList(copy).find(x => x.sequence.id === sequence.id)!.sequence;
    fn(target.cues.find(c => c.id === selectedCue.id)!);
    change(selectedCue.kind === 'dialogue' ? syncAutoActing(copy, sequence.id, [selectedCue.id]) : copy);
  }
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
        if (Array.isArray(m.zones)) setZones(m.zones.filter((z: unknown): z is StudioZone => !!z && typeof (z as StudioZone).id === 'string' && typeof (z as StudioZone).label === 'string'));
        const currentScene=projectRef.current.scenes.find(s=>s.id===playbackRef.current.stage.sceneId);
        lifeSent.current.clear();sendLives(projectRef.current);
        if(currentScene)send('STAGE', { requestId: uid(), stage: { ...playbackRef.current.stage, zoneId: currentScene.zoneId, entryIds: currentScene.entryIds, ambient: currentScene.ambient }, student: studentRef.current, allowLook: projectRef.current.navigation.allowLook });
        setStatus('Escenario conectado · elige un momento para dirigirlo.');
      }
      if (m.type === 'STAGE_READY' && m.sequenceId === playbackRef.current.stage.sequenceId) { setReady(true); }
      if(m.type==='CHARACTER_READY'&&typeof m.characterId==='string'&&Array.isArray(m.animations))setCharacterClips(old=>({...old,[m.characterId]:m.animations.filter((v:unknown)=>typeof v==='string')}));
      if(m.type==='FOCUSED'){
        // Each framing becomes a named shot in the moment's shot list, at the playhead.
        const pending=focusPending.current;focusPending.current=null;
        const next=structuredClone(projectRef.current),current=sequenceList(next).find(x=>x.sequence.id===(pending?.sequenceId??playbackRef.current.stage.sequenceId))?.sequence;
        if(!current)return;
        const kind=m.shotType==='primero'?'Primer plano':m.shotType==='medio'?'Plano medio':'Plano general';
        const label=pending?.actorName?`${kind} · ${pending.actorName}`:kind,at=pending?.at??0;
        const cameraCue=current.cues.find(c=>c.kind==='camera'&&Math.abs(c.at-at)<1e-6);
        const rest=sequenceDuration(current)-at;
        if(cameraCue?.kind==='camera'){cameraCue.shot=m.shot;cameraCue.label=label;}
        else current.cues.push({id:uid(),kind:'camera',at,duration:rest>.05?Math.round(rest*100)/100:3,shot:m.shot,label});
        changeRef.current(next);setStatus(`${label} añadido a la lista de planos en ${at.toFixed(1)} s.`);
      }
      if(m.type==='PICKED'&&typeof m.requestId==='string'){
        const handler=pickHandlers.current.get(m.requestId);pickHandlers.current.delete(m.requestId);
        setPicking(current=>current?.requestId===m.requestId?null:current);
        if(!m.cancelled)handler?.(m);
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
      if(m.type==='LIFE_RECORDED'&&m.requestId===lifeRequest.current){
        lifeRequest.current=null;setRecordingLife(false);
        const next=structuredClone(projectRef.current),target=next.scenes.find(s=>s.id===m.sceneId);
        if(target?.life){
          target.life.recording=m.recording;changeRef.current(next);
          const r=m.recording as NonNullable<SceneLife['recording']>;
          setStatus(`Vida ambiental grabada · ${r.tracks.length} NPC · bucle de ${Math.round(r.loop)} s · ${r.lines.length} frases.${r.warnings.length?' Revisa los avisos.':''} Guarda la puesta en escena.`);
        }
      }
      if(m.type==='LIFE_ERROR'&&m.requestId===lifeRequest.current){lifeRequest.current=null;setRecordingLife(false);setStatus(typeof m.message==='string'?m.message:'No se pudo grabar la vida ambiental.');}
    };
    window.addEventListener('message', onMessage); send('HELLO'); return () => { window.clearInterval(helloTimer);window.removeEventListener('message', onMessage); };
  }, [origin, send, service, sendLives]);

  useEffect(() => { if (connected) sendLives(project); }, [connected, project, sendLives]);

  useEffect(() => {
    if (!connected) return;
    const currentScene = project.scenes.find(s => s.id === playback.stage.sceneId)!;
    if(!currentScene)return;
    service.setScene?.(student ? currentScene.entryIds : [], source.storyVersionId);
    send('STAGE', { requestId: uid(), stage: { ...playback.stage, zoneId: currentScene.zoneId, entryIds: currentScene.entryIds, ambient: currentScene.ambient }, student, playing: playback.state === 'playing', waiting: playback.state === 'waiting', allowLook: project.navigation.allowLook });
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

  const loadedZone = useRef(stageZoneId);
  useEffect(() => {
    if (loadedZone.current === stageZoneId) return;
    loadedZone.current = stageZoneId;
    // The iframe reloads on the new zone and announces itself again with READY.
    setConnected(false); setReady(false); setEntries([]); setPicking(null); pickHandlers.current.clear();
    setStatus(`Cargando ${zoneLabel(stageZoneId)}…`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageZoneId]);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => { const listener = (e: KeyboardEvent) => keyHandler.current(e); window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);

  function undo() { if (!history.length || student) return; const previous = history.at(-1)!; setFuture(f => [...f, project]); setHistory(h => h.slice(0, -1)); setProject({ ...previous, revision: project.revision }); }
  function redo() { if (!future.length || student) return; setHistory(h => [...h, project]); setProject({ ...future.at(-1)!, revision: project.revision }); setFuture(f => f.slice(0, -1)); }
  /** Runs a pure editing operation; its error (if any) is shown instead of changing the project. */
  function apply<T>(operation: () => T, then?: (result: T) => void) {
    try { const result = operation(); then?.(result); return result; }
    catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo aplicar el cambio.'); return null; }
  }
  /** Automatic acting follows its line: regenerate it after the line moves or changes speaker. */
  function syncAutoActing(next: StudioProject, sequenceId: string, cueIds: readonly string[]) {
    let result = next;
    const target = sequenceList(next).find(x => x.sequence.id === sequenceId)?.sequence;
    for (const id of cueIds) if (target?.cues.some(c => c.id.startsWith(`auto:${id}:`))) result = autoStageDialogue(result, sequenceId, id).project;
    return result;
  }
  function removeCue(id: string) { apply(() => deleteCue(project, sequence.id, id), next => { change(next); setSelectedCueId(null); setStatus('Acción eliminada. Ctrl + Z para deshacer.'); }); }
  function copyCue(id: string) { apply(() => duplicateCue(project, sequence.id, id), ({ project: next, id: copy }) => { change(next); setSelectedCueId(copy); setStatus('Acción duplicada a continuación en su pista.'); }); }
  function copySequence() { apply(() => duplicateSequence(project, sequence.id), ({ project: next, id }) => { change(next); select(id); setStatus('Momento duplicado.'); }); }
  function removeSequence() {
    if (scene.sequences.length === 1) { setStatus('Una escena necesita al menos un momento. Para quitarlo, borra la escena.'); return; }
    const incoming = incomingReferences(project, [sequence.id]);
    const neighbour = scene.sequences[sequenceIndex + 1] ?? scene.sequences[sequenceIndex - 1];
    setConfirmation({ title: `Eliminar «${sequence.name}»`, confirmLabel: 'Eliminar momento',
      message: `Se borrarán sus ${sequence.cues.length} acciones.${incoming.length ? ` ${incoming.length} camino(s) que llevaban aquí (${incoming.map(s => s.name).join(', ')}) pasarán al siguiente momento en orden.` : ''} Puedes deshacerlo con Ctrl + Z.`,
      run: () => apply(() => deleteSequence(project, sequence.id), next => { change(next); select(neighbour.id); setStatus('Momento eliminado.'); }) });
  }
  function moveCurrentSequence(to: number) { apply(() => moveSequence(project, sequence.id, to), change); }
  function reorderSequence(id: string, to: number) { apply(() => moveSequence(project, id, to), next => { change(next); setStatus('Momento reordenado. El «siguiente momento» sigue el nuevo orden.'); }); }
  function newScene(mode: 'empty' | 'copy') { apply(() => addScene(project, scene.id, mode), ({ project: next, sequenceId }) => { change(next); select(sequenceId); setTab('scene'); setStatus(mode === 'empty' ? 'Escena vacía añadida en el mismo lugar.' : 'Escena duplicada con personajes y momentos nuevos.'); }); }
  function removeScene() {
    if (project.scenes.length === 1) { setStatus('La historia necesita al menos una escena.'); return; }
    const neighbour = project.scenes[sceneIndex + 1] ?? project.scenes[sceneIndex - 1];
    const incoming = incomingReferences(project, scene.sequences.map(s => s.id));
    setConfirmation({ title: `Eliminar la escena «${scene.name}»`, confirmLabel: 'Eliminar escena',
      message: `Se borrarán ${scene.sequences.length} momentos y ${scene.actors.length} personajes de esta escena.${incoming.length ? ` ${incoming.length} camino(s) desde otras escenas dejarán de apuntar aquí.` : ''} Puedes deshacerlo con Ctrl + Z.`,
      run: () => apply(() => deleteScene(project, scene.id), next => { change(next); select(neighbour.sequences[0].id); setStatus('Escena eliminada.'); }) });
  }
  function removeActor(actorId: string) {
    const target = scene.actors.find(a => a.id === actorId); if (!target) return;
    const cues = scene.sequences.flatMap(s => s.cues).filter(c => c.kind === 'actor' && c.actorId === actorId).length;
    const lines = scene.sequences.flatMap(s => s.cues).filter(c => c.kind === 'dialogue' && c.speakerId === actorId).length;
    setConfirmation({ title: `Quitar a ${target.name}`, confirmLabel: 'Quitar personaje',
      message: `Se borrarán sus ${cues} actuaciones${lines ? ` y sus ${lines} intervenciones pasarán al narrador` : ''}. Puedes deshacerlo con Ctrl + Z.`,
      run: () => apply(() => deleteActor(project, scene.id, actorId), next => { change(next); setActorId(null); setStatus(`${target.name} ya no está en la escena.`); }) });
  }
  function requestZone(zoneId: string) {
    if (zoneId === scene.zoneId) return;
    const objectGates = scene.sequences.filter(s => s.gate.kind === 'object').length;
    setConfirmation({ title: `Llevar «${scene.name}» a ${zoneLabel(zoneId)}`, confirmLabel: 'Cambiar de lugar',
      message: `El visor cargará el nuevo lugar. ${scene.entryIds.length ? `Los ${scene.entryIds.length} objetos tocables de la escena se quitarán porque pertenecen al lugar anterior. ` : ''}${objectGates ? `${objectGates} interacción(es) «Tocar un objeto» pasarán a «Esperar al estudiante». ` : ''}Los personajes y la cámara conservan sus coordenadas: recolócalos en el nuevo escenario.`,
      run: () => apply(() => changeSceneZone(project, scene.id, zoneId), ({ project: next }) => { change(next); setStatus(`Escena trasladada a ${zoneLabel(zoneId)}.`); }) });
  }
  function startPick(mode: 'point' | 'entry', message: string, handler: (m: { position?: Vec3; entryId?: string | null; label?: string | null }) => void) {
    if (!connected) { setStatus('El escenario todavía no está conectado.'); return; }
    const requestId = uid(); pickHandlers.current.set(requestId, handler); setPicking({ requestId, message }); send('PICK', { requestId, mode });
  }
  function cancelPick() { send('PICK_CANCEL'); if (picking) pickHandlers.current.delete(picking.requestId); setPicking(null); }
  function markObject() {
    startPick('entry', 'Haz clic sobre un objeto del escenario para que el estudiante pueda tocarlo.', m => {
      if (!m.entryId) { setStatus('Ese objeto no tiene palabra en el mapa léxico de este lugar.'); return; }
      const entryId = m.entryId;
      if (scene.entryIds.includes(entryId)) { setStatus(`«${m.label ?? entryId}» ya se puede tocar en esta escena.`); return; }
      apply(() => setSceneEntries(projectRef.current, scene.id, [...(projectRef.current.scenes.find(s => s.id === scene.id)?.entryIds ?? []), entryId]), next => { changeRef.current(next); setStatus(`«${m.label ?? entryId}» añadido a los objetos tocables.`); });
    });
  }
  function pickWalkDestination(cueId: string) {
    startPick('point', 'Haz clic en el suelo donde debe terminar de caminar.', m => {
      if (!m.position) return;
      const position = m.position;
      const next = structuredClone(projectRef.current), cue = sequenceList(next).flatMap(x => x.sequence.cues).find(c => c.id === cueId);
      if (cue?.kind === 'actor') { cue.destination = position; changeRef.current(next); setStatus('Destino de la caminata establecido.'); }
    });
  }
  function frameActor(actorId: string, shotType: string) {
    const target = scene.actors.find(a => a.id === actorId); if (!target) return;
    focusPending.current = { sequenceId: sequence.id, at: Math.round(playhead * 100) / 100, actorName: target.name };
    send('FOCUS_ACTOR', { actorId, shotType });
  }
  function autoActing(cueId: string) {
    apply(() => autoStageDialogue(project, sequence.id, cueId), ({ project: next, created, skipped }) => {
      change(next);
      const line = sequence.cues.find(c => c.id === cueId);
      if (focusWithLine && line?.kind === 'dialogue' && line.speakerId && ready) { focusPending.current = { sequenceId: sequence.id, at: line.at, actorName: scene.actors.find(a => a.id === line.speakerId)?.name ?? '' }; send('FOCUS_ACTOR', { actorId: line.speakerId, shotType: 'medio' }); }
      setStatus(!line || line.kind !== 'dialogue' || !line.speakerId ? 'Asigna quién habla para generar la actuación.' : `Actuación generada para ${created} personaje(s).${skipped.length ? ` Se respetó la dirección manual de ${skipped.join(', ')}.` : ''}`);
    });
  }
  function placeSentence(sentenceId: string, sequenceId = sequence.id) {
    const target = sequenceList(project).find(x => x.sequence.id === sequenceId);
    const text = source.sentences.find(s => s.id === sentenceId)?.text ?? '';
    apply(() => placeDialogue(project, sequenceId, sentenceId, guessSpeaker(text, target?.scene.actors ?? [], lastSpeakerId), sequenceId === sequence.id ? playhead : 0, source), ({ project: next, id }) => { change(next); select(sequenceId); setSelectedCueId(id); setStatus('Frase colocada en el momento.'); });
  }
  function sentenceAsMoment(sentenceId: string) {
    const text = source.sentences.find(s => s.id === sentenceId)?.text ?? '';
    apply(() => { const made = createSequence(project, scene.id, sequence.id, { name: text.slice(0, 36) || 'Nuevo momento' }); return { made, placed: placeDialogue(made.project, made.id, sentenceId, guessSpeaker(text, scene.actors, lastSpeakerId), 0, source) }; },
      ({ made, placed }) => { change(placed.project); select(made.id); setSelectedCueId(placed.id); setStatus('Momento nuevo creado con la frase.'); });
  }
  function setLineSpeaker(sequenceId: string, cueId: string, speakerId: string | null) {
    apply(() => { const next = structuredClone(project), cue = sequenceList(next).find(x => x.sequence.id === sequenceId)?.sequence.cues.find(c => c.id === cueId); if (cue?.kind !== 'dialogue') throw new Error('La intervención ya no existe.'); cue.speakerId = speakerId; return syncAutoActing(next, sequenceId, [cueId]); },
      next => { change(next); if (speakerId) setLastSpeakerId(speakerId); });
  }

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
  function editLife(fn: (life: SceneLife) => void) {
    const next = structuredClone(projectRef.current), target = next.scenes.find(s => s.id === scene.id)?.life;
    if (!target) return; fn(target); changeRef.current(next);
  }
  function addLifePoint() {
    capture(({ shot, position }) => editLife(l => {
      // Por defecto el NPC mira hacia donde mira la cámara (por ejemplo, hacia el escaparate).
      l.points.push({ id: uid(), kind: 'pasear', position, rotation: Math.atan2(position[0] - shot.position[0], position[2] - shot.position[2]), slots: 2 });
    }));
    setStatus('Punto añadido donde mira la cámara. Elige qué se puede hacer en él.');
  }
  function recordLife() {
    const current = scene.life;
    if (!current || !connected || lifeRequest.current) return;
    if (!current.cast.length) { setStatus('Añade al menos un NPC antes de grabar.'); return; }
    const requestId = uid(), config: SceneLife = { ...current }; delete config.recording;
    lifeRequest.current = requestId; setRecordingLife(true);
    send('LIFE_RECORD', { requestId, sceneId: scene.id, life: config, center: scene.shot.target });
    setStatus('Grabando la vida ambiental…');
    window.setTimeout(() => { if (lifeRequest.current === requestId) { lifeRequest.current = null; setRecordingLife(false); setStatus('El escenario no terminó la grabación de la vida ambiental.'); } }, 60000);
  }
  function addCue(kind: Cue['kind']) {
    // New cues start at the playhead, or right after whatever already occupies that track.
    const base = { id: uid(), duration: 3 };
    if (kind === 'camera') { const at = nextCueStart(sequence, 'camera', playhead); capture(({ shot }) => { editSequence(s => s.cues.push({ ...base, at, kind, shot, label: `Plano ${s.cues.filter(c => c.kind === 'camera').length + 1}` })); setSelectedCueId(base.id); }); return; }
    if (kind === 'actor') {
      if (!actor) { setStatus('Añade primero un personaje desde la biblioteca.'); return; }
      editSequence(s => s.cues.push({ ...base, at: nextCueStart(s, `actor:${actor.id}`, playhead), kind, actorId: actor.id, action: 'idle' }));
    }
    if (kind === 'dialogue') {
      const sentenceId = suggestSentence(project, source);
      if (!sentenceId) { setStatus('La Story no tiene frases todavía.'); return; }
      const text = source.sentences.find(s => s.id === sentenceId)?.text ?? '';
      editSequence(s => s.cues.push({ ...base, at: nextCueStart(s, 'dialogue', playhead), duration: dialogueDuration(text), kind, sentenceId, speakerId: guessSpeaker(text, scene.actors, lastSpeakerId) }));
    }
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
    }else current.cues.push({id:uid(),kind:'sound',at:nextCueStart(current,'sound',playbackRef.current.stage.sequenceId===current.id?playbackRef.current.time:0),duration:asset.duration,audioUrl:`studio-audio:${asset.id}`,volume:.5,label:asset.name});
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
  const onShortcut = (e: KeyboardEvent) => {
    if (student || e.defaultPrevented || scriptOpen || confirmation || editorial || soundPicker) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 's') { e.preventDefault(); save(); return; }
    if (typing) return;
    if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (mod && key === 'd') { e.preventDefault(); if (explicitCue) copyCue(explicitCue.id); return; }
    if (mod || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); play(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && explicitCue) { e.preventDefault(); removeCue(explicitCue.id); return; }
    if (e.key === 'Escape') { if (picking) cancelPick(); else setSelectedCueId(null); setShortcutsOpen(false); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 1 : .1) * (e.key === 'ArrowLeft' ? -1 : 1);
      setPlayback(director.current.seek(list.findIndex(x => x.sequence.id === sequence.id), Math.max(0, Math.min(duration, playhead + step))));
    }
  };
  // The listener is registered once and always calls the handler from the latest render.
  useEffect(() => { keyHandler.current = onShortcut; });
  const currentItem = list[playback.index] ?? item;
  const gate = playback.gate;
  const panelHeading = (title: string, extra?: React.ReactNode) => <div className={styles.panelHeading}><h2>{title}</h2>{extra}</div>;
  const life = scene.life, lifeRecording = life?.recording, lifeStale = life ? lifeIsStale(life) : false;
  const npcName = (id: string) => { const i = life?.cast.findIndex(c => c.id === id) ?? -1; return i < 0 || !life ? 'NPC' : `${LIFE_ROLES[life.cast[i].roleId]} ${i + 1}`; };
  const vectorFields = (value: Vec3, update: (v: Vec3) => void) => <div className={styles.vectorFields}>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{axis}<input aria-label={`Posición ${axis}`} type="number" step="0.1" value={Number(value[i].toFixed(3))} onChange={e => update(value.map((v, j) => j === i ? number(e.target.value, v) : v) as unknown as Vec3)} /></label>)}</div>;

  return <div className={`${styles.studio} ${student ? styles.studentMode : ''} ${objectOpen?styles.objectOpen:''}`} style={{ '--timeline-size': showTime ? '156px' : '36px' } as CSSProperties}>
    <header className={styles.header}>
      <a className={styles.brand} href="?modo=desarrollo"><span className={styles.brandIcon}><Icon name="world" /></span><strong>SpanStories</strong><span>Story Studio</span></a>
      <nav aria-label="Modos del visor"><a href="?modo=visor">{buttonIcon('world', 'Explorar mundo')}</a><a href="?modo=desarrollo">{buttonIcon('build', 'Editar mundo')}</a><button aria-pressed={!student} onClick={() => { setStudent(false); setPlayback(director.current.pause()); }}>{buttonIcon('flow', 'Editar historia')}</button><button aria-pressed={student} onClick={() => { setStudent(true); setPlayback(director.current.play()); }}>{buttonIcon('play', 'Reproducir historia')}</button></nav>
      <div className={styles.headerActions}><button className={styles.location} title="Lugar de la escena actual · cambiarlo en Propiedades › Escena" onClick={() => { setStudent(false); setTab('scene'); }}>{zoneLabel(scene.zoneId)}⌄</button><button aria-label="Deshacer" title="Deshacer (Ctrl + Z)" disabled={!history.length || student} onClick={undo}><Icon name="undo" /></button><button aria-label="Rehacer" title="Rehacer (Ctrl + Y)" disabled={!future.length || student} onClick={redo}><span>↪</span></button><button onClick={() => setScriptOpen(true)} disabled={student} title="Guion de la Story: frases, puesta en escena y voces">{buttonIcon('chat', 'Guion')}{coverage.unused > 0 && <span className={styles.countBadge} aria-label={`${coverage.unused} frases sin usar`}>{coverage.unused}</span>}</button><span className={styles.shortcutsWrap}><button aria-label="Atajos de teclado" aria-expanded={shortcutsOpen} onClick={() => setShortcutsOpen(!shortcutsOpen)}>?</button>{shortcutsOpen && <div className={styles.shortcuts} role="dialog" aria-label="Atajos de teclado"><h3>Atajos de teclado</h3><dl>{shortcuts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>}</span><button onClick={save} disabled={student}>{buttonIcon('save', 'Guardar')}</button><button className={styles.primary} onClick={publish} disabled={student||publishing}>{publishing?'Publicando…':'Publicar'}</button></div>
    </header>

    <aside className={styles.leftDock} aria-label="Historia y recursos">
      <section className={styles.panel + ' ' + styles.storyPanel}>{panelHeading('Historia', <button aria-label="Exportar puesta en escena" onClick={exportProject}>↥</button>)}
        <div className={styles.storySelect}><label>Story del proyecto<select aria-label="Elegir Story" value={sourceId} onChange={e => chooseSource(e.target.value)}>{catalog.map(s => <option key={s.storyVersionId} value={s.storyVersionId}>{s.title}{(s.versionNumber??1)>1?` · borrador v${s.versionNumber}`:''}</option>)}</select></label><span className={styles.badge}>{source.status === 'DRAFT' ? (source.blueprintId?'Borrador · pendiente de revisión':'Ensayo · sin publicar') : 'Story publicada'}</span></div>
        <div className={styles.sceneTree}>{project.scenes.map((s, si) => <div key={s.id} className={styles.sceneGroup} data-active={s.id === scene.id}><button className={styles.sceneButton} onClick={() => select(s.sequences[0].id)}><span className={styles.sceneNumber}>{String(si + 1).padStart(2, '0')}</span><span><strong>{s.name}</strong><small>{zoneLabel(s.zoneId)} · {s.sequences.length} momentos</small></span><span>⌄</span></button>{s.id === scene.id && <div className={styles.sequenceTree}>{s.sequences.map((seq, i) => { const problems = issues.get(seq.id) ?? []; return <button key={seq.id} className={styles.sequenceButton} aria-pressed={seq.id === sequenceId} onClick={() => select(seq.id)} draggable title={problems.length ? problems.map(p => '⚠ ' + p.message).join('\n') : 'Arrastra para reordenar'}
          data-over={dragSequence !== null && dragSequence !== seq.id ? 'target' : undefined}
          onDragStart={e => { setDragSequence(seq.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', seq.id); }}
          onDragOver={e => { if (dragSequence && dragSequence !== seq.id && s.sequences.some(q => q.id === dragSequence)) e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); if (dragSequence && dragSequence !== seq.id) reorderSequence(dragSequence, i); setDragSequence(null); }}
          onDragEnd={() => setDragSequence(null)}><span>◇</span><span><strong>Secuencia {i + 1}</strong><small>{seq.name}</small></span><span className={styles.sequenceDot} data-issue={problems.length ? (problems.some(p => p.code === 'unreachable' || p.code === 'trapped' || p.code === 'auto-loop') ? 'error' : 'warning') : undefined} /></button>; })}</div>}</div>)}</div>
        <div className={`${styles.panelBottom} ${styles.inlineButtons}`}><button onClick={() => newScene('empty')} title="Escena vacía en el mismo lugar, después de la actual">{buttonIcon('plus', 'Añadir escena')}</button><button onClick={() => newScene('copy')} title="Copia la escena actual con sus personajes y momentos">Duplicar escena</button></div>
      </section>
      <section className={styles.panel + ' ' + styles.libraryPanel}>{panelHeading('Recursos del proyecto')}<div className={styles.tabs}>{(['characters', 'scenarios', 'actions'] as const).map(k => <button key={k} aria-pressed={library === k} onClick={() => setLibrary(k)}>{k === 'characters' ? 'Personajes' : k === 'scenarios' ? 'Escenarios' : 'Actuaciones'}</button>)}</div>
        <div className={styles.resourceGrid}>{library === 'characters' ? characters.map(c => <button className={styles.resourceCard} key={c.id} disabled={!connected} onClick={() => addCharacter(c.id, c.label)}><div className={styles.characterPortrait}><Icon name="person" /></div><strong>{c.label}</strong><small>Añadir al escenario</small></button>) : library === 'scenarios' ? (zones.length ? zones : [{ id: scene.zoneId, label: zoneLabel(scene.zoneId) }]).map(z => <button className={styles.resourceCard} key={z.id} aria-pressed={z.id === scene.zoneId} title={z.id === scene.zoneId ? 'Lugar de la escena actual' : `Llevar la escena actual a ${zoneLabel(z.id)}`} onClick={() => z.id === scene.zoneId ? setStatus(`Estás trabajando en ${zoneLabel(z.id)}.`) : requestZone(z.id)}><div className={styles.cityThumb} /><strong>{'cityLabel' in z && z.cityLabel ? z.cityLabel : zoneLabel(z.id)}</strong><small>{z.id === scene.zoneId ? 'En uso' : z.label}</small></button>) : Object.entries(actionNames).map(([key, label]) => <button key={key} disabled={!supportsAction(key)} title={supportsAction(key)?label:'Este modelo todavía no dispone de esta actuación.'} onClick={() => { if (!actor) { setStatus('Añade un personaje primero.'); return; } const cue: Cue = { id: uid(), kind: 'actor', actorId: actor.id, action: key as keyof typeof actionNames, at: nextCueStart(sequence, `actor:${actor.id}`, playhead), duration: 3 }; editSequence(s => s.cues.push(cue)); setSelectedCueId(cue.id); setTab('moment'); }}>{label}</button>)}</div>
        {library === 'characters' && <p className={styles.hint}>Modelos de la biblioteca del visor.</p>}
      </section>
    </aside>

    <section className={styles.viewport} aria-label="Visor 3D de Story Studio">
      <iframe ref={frame} src={viewer.href} title={`${zoneLabel(stageZoneId)} · escenario de la historia`} allow="autoplay" sandbox="allow-scripts allow-same-origin allow-downloads" />
      {!student && <div className={styles.viewportTop}><div className={styles.cameraChip}><Icon name="camera" /><span>Cámara de dirección<strong>{sequence.name}</strong></span></div><button title="Guardar el encuadre actual" onClick={() => capture(({ shot }) => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot = shot; }))}>{buttonIcon('camera', 'Capturar plano')}</button></div>}
      {picking && !student && <div className={styles.pickBanner} role="status"><span>{picking.message}</span><button onClick={cancelPick}>Cancelar (Esc)</button></div>}
      <div className={styles.stageCorner}><span className={styles.liveDot} />{ready ? (student ? 'Mirar y tocar · recorrido dirigido' : 'Escenario del visor') : 'Preparando escenario…'}</div>
      <div className={styles.transport}><button onClick={() => { const next = student?director.current.back():director.current.seek(Math.max(0, playback.index - 1)); setPlayback(next); }} disabled={!ready||(student?!playback.canGoBack:playback.index===0)} aria-label="Momento anterior">|◀</button><button disabled={!ready} onClick={play} aria-label={playback.state === 'playing' ? 'Pausar historia' : 'Reproducir momento'}>{playback.state === 'playing' ? 'Ⅱ' : '▶'}</button><span>{playback.time.toFixed(1)}s / {playback.duration.toFixed(1)}s</span><span className={styles.transportDivider} /><span>{playback.state === 'waiting' ? 'Esperando al estudiante' : playback.state === 'finished' ? 'Historia terminada' : 'Momento ' + (playback.index + 1)}</span></div>
      {student && <div className={styles.studentDialogue} aria-live="polite"><small>{playback.stage.caption?.speakerId ? currentItem.scene.actors.find(a => a.id === playback.stage.caption!.speakerId)?.name : 'Narrador'}</small><div className={styles.readingLine}>{sentence ? <StudioReading source={source} sentenceId={sentence.id} owner={owner} onPause={() => setPlayback(director.current.pause())} /> : currentItem.sequence.name}</div>{playback.state === 'waiting' && <><p className={styles.gatePrompt}>{gate.kind !== 'auto' ? gate.prompt : ''}</p>{gate.kind === 'continue' && <button className={styles.primary} onClick={() => respond('continue')}>Continuar →</button>}{gate.kind === 'choice' && gate.options.map(o => <button key={o.id} onClick={() => respond('choice', o.id)}>{optionText(o)}</button>)}{gate.kind === 'answer' && <form onSubmit={e => { e.preventDefault(); respond('answer', answer); }}><input aria-label="Tu respuesta" value={answer} onChange={e => setAnswer(e.target.value)} /><button>Responder</button></form>}</>}{playback.state === 'finished' && <button onClick={() => setPlayback(director.current.play())}>Volver a empezar</button>}</div>}
      {student&&playback.state==='waiting'&&gate.kind==='object'&&touchedObject&&<button className={styles.objectContinue} onClick={()=>respond('object',touchedObject)}>Objeto observado · Continuar →</button>}
      {student&&sentence&&<button className={styles.studentReplay} onClick={listen}>{buttonIcon('sound','Escuchar de nuevo')}</button>}
    </section>

    <section className={styles.flowPanel + ' ' + styles.panel} aria-label="Flujo narrativo">{panelHeading('Flujo narrativo', <div className={styles.inlineButtons}><button aria-pressed={flowDetail} onClick={()=>setFlowDetail(!flowDetail)}>{flowDetail?'Ver escena':'Ver acciones'}</button><button title="Añade un momento después del actual" onClick={() => apply(() => createSequence(project, scene.id, sequence.id), ({ project: next, id }) => { change(next); select(id); })}>{buttonIcon('plus', 'Añadir momento')}</button></div>)}<div className={styles.flowCanvas}>{!student&&<Flow project={project} source={source} sceneId={scene.id} selectedId={sequenceId} selectedCueId={selectedCueId} detail={flowDetail} issues={issues} onSelect={(id,gate)=>{select(id);if(gate)setTab('interaction');}} onCueSelect={id=>{setSelectedCueId(id);setTab('moment');}} onChange={change} />}</div></section>

    <aside className={styles.rightDock} aria-label="Dirección y acciones">
      <section className={styles.panel + ' ' + styles.properties}>{panelHeading('Propiedades')}<div className={styles.tabs}>{(['scene', 'moment', 'camera', 'actors', 'interaction', 'life'] as const).map(k => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === 'scene' ? 'Escena' : k === 'moment' ? 'Momento' : k === 'camera' ? 'Cámara' : k === 'actors' ? 'Personajes' : k === 'interaction' ? 'Interacción' : 'Vida'}</button>)}</div>
        <div className={styles.inspector}>
          {tab === 'scene' && <><div className={styles.inspectorTitle}><span className={styles.objectIcon}><Icon name="world" /></span><div><h3>{scene.name}</h3><small>Escena {sceneIndex + 1} de {project.scenes.length}</small></div></div>
            <label>Nombre de la escena<input value={scene.name} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.name = e.target.value; })} /></label>
            <label>Lugar<select aria-label="Lugar de la escena" value={scene.zoneId} onChange={e => requestZone(e.target.value)}>{!zones.some(z => z.id === scene.zoneId) && <option value={scene.zoneId}>{zoneLabel(scene.zoneId)}</option>}{zones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z.id)}</option>)}</select></label>
            <label>Luz de la escena<select aria-label="Luz de la escena" value={scene.ambient ?? ''} onChange={e => edit(copy => { const target = copy.scenes.find(s => s.id === scene.id)!; if (e.target.value) target.ambient = e.target.value as SceneAmbient; else delete target.ambient; })}><option value="">Luz actual del visor</option>{SCENE_AMBIENTS.map(a => <option key={a} value={a}>{ambientNames[a]}</option>)}</select></label>
            <h4>Objetos que puede tocar</h4>
            <div className={styles.chips}>{scene.entryIds.map(id => <span className={styles.chip} key={id}>{entryLabel(id)}<button aria-label={`Quitar ${entryLabel(id)}`} onClick={() => apply(() => setSceneEntries(project, scene.id, scene.entryIds.filter(e => e !== id)), change)}>×</button></span>)}{!scene.entryIds.length && <small>Ninguno todavía.</small>}</div>
            <button className={styles.wideButton} disabled={!connected || !!picking} onClick={markObject}>Marcar objeto en el visor</button>
            <p className={styles.hint}>Haz clic sobre un objeto del escenario y su palabra quedará disponible para el estudiante en esta escena. También puedes elegirlos en Interacción.</p>
            <h4>Organizar</h4>
            <div className={styles.buttonGrid}><button disabled={sceneIndex === 0} onClick={() => apply(() => moveScene(project, scene.id, sceneIndex - 1), change)}>↑ Subir</button><button disabled={sceneIndex === project.scenes.length - 1} onClick={() => apply(() => moveScene(project, scene.id, sceneIndex + 1), change)}>↓ Bajar</button><button onClick={() => newScene('copy')}>Duplicar</button><button className={styles.danger} disabled={project.scenes.length === 1} onClick={removeScene}>Eliminar escena</button></div>
          </>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&selectedCue.action==='turn'&&<label>Orientación final (grados)<input type="number" step="5" value={Math.round((selectedCue.rotation??scene.actors.find(a=>a.id===selectedCue.actorId)?.rotation??0)*180/Math.PI)} onChange={e=>editCue(c=>{if(c.kind==='actor')c.rotation=number(e.target.value,0)*Math.PI/180;})}/></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&selectedCue.action==='look'&&<label>Mirar a<select value={selectedCue.lookAt??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.lookAt=e.target.value;else delete c.lookAt;}})}><option value="">Selecciona un personaje</option>{scene.actors.filter(a=>a.id!==selectedCue.actorId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          {tab==='actors'&&actor&&<><h3>Encuadrar a {actor.name}</h3><div className={styles.inlineButtons}>{[['general','General'],['medio','Medio'],['primero','Primer plano']].map(([type,label])=><button key={type} disabled={!ready} title={`Añade «${label} · ${actor.name}» a la lista de planos en ${playhead.toFixed(1)} s`} onClick={()=>frameActor(actor.id,type)}>{label}</button>)}</div><p className={styles.hint}>Cada encuadre se añade como plano del momento en la posición del cabezal.</p></>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Expresión del modelo<select value={selectedCue.expression??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.expression=e.target.value;else delete c.expression;}})}><option value="">Mantener expresión actual</option>{(characterClips[scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId??'']??[]).filter(name=>/facial|expression|face/i.test(name)).map(name=><option key={name} value={name}>{name.replace(/Samuel_Juan_Facial_/,'')}</option>)}</select></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Animación corporal<select value={selectedCue.clipName??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.clipName=e.target.value;else delete c.clipName;}})}><option value="">Según la actuación</option>{(characterClips[scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId??'']??[]).filter(name=>!/facial|expression|face/i.test(name)).map(name=><option key={name} value={name}>{name==='Catching_Breath'?'Respirar':name==='Slap_Reaction'?'Reaccionar':name==='Excited_Walk_M'?'Caminar con entusiasmo':name==='Walking'?'Caminar':name==='restpose'?'Pose base':name}</option>)}</select></label>}
          {tab === 'moment' && <><div className={styles.inspectorTitle}><span className={styles.objectIcon}><Icon name="flow" /></span><div><h3>{sequence.name}</h3><small>Secuencia de la historia</small></div></div><label>Nombre<input value={sequence.name} onChange={e => editSequence(s => { s.name = e.target.value; })} /></label><div className={styles.buttonGrid}><button disabled={sequenceIndex === 0} onClick={() => moveCurrentSequence(sequenceIndex - 1)} title="Mover antes">↑ Antes</button><button disabled={sequenceIndex === scene.sequences.length - 1} onClick={() => moveCurrentSequence(sequenceIndex + 1)} title="Mover después">↓ Después</button><button onClick={copySequence}>Duplicar momento</button><button className={styles.danger} disabled={scene.sequences.length === 1} onClick={removeSequence}>Eliminar momento</button></div>{(issues.get(sequence.id) ?? []).map(issue => <p key={issue.code} className={styles.issueNote} data-severe={issue.code === 'unreachable' || issue.code === 'trapped' || issue.code === 'auto-loop'}>⚠ {issue.message}</p>)}<label>Acción seleccionada<select value={selectedCue?.id ?? ''} onChange={e => setSelectedCueId(e.target.value)}><option value="" disabled>Selecciona una acción</option>{sequence.cues.map(c => <option value={c.id} key={c.id}>{kindNames[c.kind]} · {c.kind === 'actor' ? actionNames[c.action] : c.kind === 'camera' ? c.label : c.kind === 'sound' ? c.label : source.sentences.find(s => s.id === c.sentenceId)?.text.slice(0, 30)}</option>)}</select></label>
            {selectedCue && <><div className={styles.inlineButtons}><button onClick={() => copyCue(selectedCue.id)} title="Duplicar (Ctrl + D)">Duplicar acción</button><button className={styles.danger} onClick={() => removeCue(selectedCue.id)} title="Eliminar (Supr)">Eliminar acción</button></div>
              {sequence.cues.length > 1 && <label>Empezar después de<select aria-label="Empezar después de" value="" onChange={e => { if (e.target.value) apply(() => chainCue(project, sequence.id, selectedCue.id, e.target.value), next => change(selectedCue.kind === 'dialogue' ? syncAutoActing(next, sequence.id, [selectedCue.id]) : next)); }}><option value="">Elige una acción…</option>{sequence.cues.filter(c => c.id !== selectedCue.id).sort((a, b) => (a.at + a.duration) - (b.at + b.duration)).map(c => <option key={c.id} value={c.id}>{kindNames[c.kind]} · {c.kind === 'actor' ? `${scene.actors.find(a => a.id === c.actorId)?.name ?? ''} ${actionNames[c.action]}` : c.kind === 'dialogue' ? source.sentences.find(s => s.id === c.sentenceId)?.text.slice(0, 26) : c.label} · termina {(c.at + c.duration).toFixed(1)} s</option>)}</select></label>}
              <div className={styles.twoColumns}><label>Inicio (s)<input type="number" min="0" step="0.1" value={selectedCue.at} onChange={e => editCue(c => { c.at = Math.max(0, number(e.target.value, c.at)); })} /></label><label>Duración (s)<input type="number" min="0.05" step="0.1" value={selectedCue.duration} onChange={e => editCue(c => { c.duration = Math.max(.05, number(e.target.value, c.duration)); })} /></label></div>
              {selectedCue.kind === 'dialogue' && <><label>Intervención de la Story<select value={selectedCue.sentenceId} onChange={e => editCue(c => { if (c.kind === 'dialogue') { c.sentenceId = e.target.value; if (!c.audioUrl) c.duration = dialogueDuration(source.sentences.find(s => s.id === e.target.value)?.text ?? ''); } })}>{source.sentences.map(s => <option key={s.id} value={s.id}>{(coverage.uses.get(s.id)?.length ?? 0) > (s.id === selectedCue.sentenceId ? 1 : 0) ? '● ' : '○ '}{s.text}</option>)}</select></label><div className={styles.inlineButtons}><button title="Duración según la longitud del texto (unas 2 palabras por segundo)" onClick={() => editCue(c => { if (c.kind === 'dialogue') c.duration = dialogueDuration(source.sentences.find(s => s.id === c.sentenceId)?.text ?? ''); })}>Ajustar al texto</button><button disabled={!selectedCue.audioUrl?.startsWith('studio-audio:') || !audioControls.assets.some(a => `studio-audio:${a.id}` === selectedCue.audioUrl)} title="Duración exacta de la grabación vinculada" onClick={() => { const asset = audioControls.assets.find(a => `studio-audio:${a.id}` === selectedCue.audioUrl); if (asset) editCue(c => { c.duration = Math.max(.05, Math.round(asset.duration * 100) / 100); }); }}>Ajustar al audio</button></div><label>Quién habla<select value={selectedCue.speakerId ?? ''} onChange={e => { const speaker = e.target.value || null; if (speaker) setLastSpeakerId(speaker); editCue(c => { if (c.kind === 'dialogue') c.speakerId = speaker; }); }}><option value="">Narrador</option>{scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className={styles.autoActing}><button disabled={!selectedCue.speakerId} onClick={() => autoActing(selectedCue.id)} title="El hablante habla; los demás escuchan y lo miran. Se respeta la dirección manual.">Generar actuación</button><label className={styles.check}><input type="checkbox" checked={focusWithLine} onChange={e => setFocusWithLine(e.target.checked)} />con plano medio</label></div>{sequence.cues.some(c => c.id.startsWith(`auto:${selectedCue.id}:`)) && <p className={styles.hint}>Actuación automática activa: sigue a la intervención al moverla o cambiar quién habla.</p>}<label>Archivo de voz (URL)<input placeholder="/audio/intervencion.mp3" value={selectedCue.audioUrl ?? ''} onChange={e => editCue(c => { if (c.kind === 'dialogue') { if (e.target.value) c.audioUrl = e.target.value; else delete c.audioUrl; } })} /></label></>}
              {selectedCue.kind === 'actor' && <><label>Actuación<select value={selectedCue.action} onChange={e => editCue(c => { if (c.kind === 'actor') c.action = e.target.value as keyof typeof actionNames; })}>{Object.entries(actionNames).map(([k, v]) => <option key={k} value={k} disabled={!supportsAction(k,scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId)}>{v}</option>)}</select></label>{selectedCue.action === 'walk' && <><button onClick={() => capture(({ position }) => editCue(c => { if (c.kind === 'actor') c.destination = position; }))}>Caminar hasta el centro de la vista</button><button disabled={!connected || !!picking} onClick={() => pickWalkDestination(selectedCue.id)}>Elegir destino con un clic</button>{selectedCue.destination && <small className={styles.coordinates}>Destino: {selectedCue.destination.map(v => v.toFixed(1)).join(' · ')}</small>}</>}<p className={styles.hint}>Se reutilizan los clips disponibles del modelo. Los gestos requieren su animación correspondiente.</p></>}
              {selectedCue.kind === 'sound' && <><label>Archivo de sonido<input value={selectedCue.audioUrl} onChange={e => editCue(c => { if (c.kind === 'sound') c.audioUrl = e.target.value; })} /></label><label>Volumen<input type="range" min="0" max="1" step=".05" value={selectedCue.volume} onChange={e => editCue(c => { if (c.kind === 'sound') c.volume = Number(e.target.value); })} /></label></>}
            </>}
          </>}
          {tab === 'camera' && <><h3>Cámara de la escena</h3><p className={styles.hint}>Navega en la vista 3D y captura el encuadre. El plano se reutiliza en esta escena.</p><button className={styles.wideButton} onClick={() => capture(({ shot }) => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot = shot; }))}>{buttonIcon('camera', 'Usar encuadre actual')}</button><label>Posición</label>{vectorFields(scene.shot.position, position => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot.position = position; }))}<label>Campo de visión · {scene.shot.fov}°<input aria-label="Campo de visión" type="range" min="15" max="80" value={scene.shot.fov} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot.fov = Number(e.target.value); })} /></label><label className={styles.check}><input type="checkbox" checked={project.navigation.allowLook} onChange={e => edit(copy => { copy.navigation.allowLook = e.target.checked; })} />El estudiante puede mirar alrededor</label></>}
          {tab === 'actors' && <><label>Personaje<select value={actor?.id ?? ''} onChange={e => setActorId(e.target.value)}>{!scene.actors.length && <option>Añade un personaje de la biblioteca</option>}{scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{actor && <><label>Nombre del papel<input value={actor.name} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.name = e.target.value; })} /></label><button className={styles.wideButton} onClick={() => { send('PLACE', { actorId: actor.id }); setStatus('Haz clic en el suelo para colocar a ' + actor.name + '.'); }}>Colocar con un clic en el escenario</button><label>Posición</label>{vectorFields(actor.position, position => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.position = position; }))}<label>Orientación (grados)<input type="number" step="5" value={Math.round(actor.rotation * 180 / Math.PI)} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.rotation = number(e.target.value, 0) * Math.PI / 180; })} /></label><button className={`${styles.wideButton} ${styles.danger}`} onClick={() => removeActor(actor.id)}>Quitar a {actor.name} de la escena</button></>}</>}
          {tab === 'interaction' && <><h3>Cuándo continúa</h3><label>Avance<select value={sequence.gate.kind} onChange={e => { const kind = e.target.value as Gate['kind']; editSequence(s => { s.gate = kind === 'auto' ? { kind } : kind === 'continue' ? { kind, prompt: 'Continúa cuando quieras.' } : kind === 'choice' ? { kind, prompt: 'Elige una respuesta.', options: [{ id: 'option-a', label: 'Primera respuesta' }, { id: 'option-b', label: 'Segunda respuesta' }] } : kind === 'answer' ? { kind, prompt: 'Escribe tu respuesta.', answers: ['Hola'] } : { kind, prompt: 'Toca el objeto indicado.', entryIds: scene.entryIds.slice(0, 1) }; }); }}><option value="continue">Esperar al estudiante</option><option value="auto">Al terminar las acciones</option><option value="choice">Elegir entre opciones</option><option value="answer">Escribir una respuesta</option><option value="object">Tocar un objeto</option></select></label>{sequence.gate.kind !== 'auto' && <label>Instrucción<input value={sequence.gate.prompt} onChange={e => editSequence(s => { if (s.gate.kind !== 'auto') s.gate.prompt = e.target.value; })} /></label>}{sequence.gate.kind === 'choice' && <>{sequence.gate.options.map((o, i) => <div key={o.id} className={styles.optionEditor}><label>Opción {i + 1}<input value={o.label} onChange={e => editSequence(s => { if (s.gate.kind === 'choice') { s.gate.options[i].label = e.target.value; delete s.gate.options[i].sentenceId; } })} /></label><select aria-label={`Frase de la Story para la opción ${i + 1}`} value={o.sentenceId ?? ''} onChange={e => editSequence(s => { if (s.gate.kind === 'choice') { const option = s.gate.options[i]; if (e.target.value) { option.sentenceId = e.target.value; option.label = (source.sentences.find(x => x.id === e.target.value)?.text ?? option.label).slice(0, 180); } else delete option.sentenceId; } })}><option value="">Texto libre</option>{source.sentences.map(x => <option key={x.id} value={x.id}>Frase: {x.text}</option>)}</select><select aria-label={`Destino de opción ${i + 1}`} value={o.nextSequenceId ?? ''} onChange={e => editSequence(s => { if (s.gate.kind === 'choice') s.gate.options[i].nextSequenceId = e.target.value || undefined; })}><option value="">Siguiente momento</option>{list.map(x => <option key={x.sequence.id} value={x.sequence.id}>{x.sequence.name}</option>)}</select>{sequence.gate.kind === 'choice' && sequence.gate.options.length > 2 && <button className={styles.danger} onClick={() => editSequence(s => { if (s.gate.kind === 'choice') s.gate.options.splice(i, 1); })}>Quitar opción {i + 1}</button>}</div>)}{sequence.gate.options.length < 8 && <button onClick={() => editSequence(s => { if (s.gate.kind === 'choice') s.gate.options.push({ id: `option-${uid()}`, label: `Opción ${s.gate.options.length + 1}` }); })}>{buttonIcon('plus', 'Añadir opción')}</button>}<p className={styles.hint}>Si eliges una frase de la Story, el estudiante verá su texto tal como está en la versión vinculada.</p></>}{sequence.gate.kind === 'object' && <><h4>Objetos que completan la interacción</h4>{scene.entryIds.length ? scene.entryIds.map(id => <label className={styles.check} key={id}><input type="checkbox" checked={sequence.gate.kind === 'object' && sequence.gate.entryIds.includes(id)} onChange={e => editSequence(s => { if (s.gate.kind === 'object') { const next = e.target.checked ? [...s.gate.entryIds, id] : s.gate.entryIds.filter(x => x !== id); if (next.length) s.gate.entryIds = next; } })} />{entryLabel(id)}</label>) : <p className={styles.hint}>Primero añade objetos tocables a la escena.</p>}</>}{sequence.gate.kind === 'answer' && <label>Respuestas aceptadas (separadas por |)<input value={sequence.gate.answers.join(' | ')} onChange={e => editSequence(s => { if (s.gate.kind === 'answer') s.gate.answers = e.target.value.split('|').map(x => x.trim()).filter(Boolean); })} /></label>}<p className={styles.hint}>El alumno puede mirar y tocar. El desplazamiento y los caminos se definen en la historia.</p><h4>Objetos que puede tocar</h4>{entries.map(entry => <label className={styles.check} key={entry.id}><input type="checkbox" checked={scene.entryIds.includes(entry.id)} onChange={e => apply(() => setSceneEntries(project, scene.id, e.target.checked ? [...scene.entryIds, entry.id] : scene.entryIds.filter(id => id !== entry.id)), change)} />{entry.label}</label>)}</>}
          {tab === 'life' && <><h3>Vida ambiental</h3><p className={styles.hint}>NPC con su propio papel que dan vida al lugar. Se graban una sola vez: el estudiante y el tutor siempre ven la misma escena.</p>
            {!life && <button className={styles.wideButton} onClick={() => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.life = defaultLife(Math.floor(Math.random() * 0xffffffff)); })}>Añadir vida ambiental a esta escena</button>}
            {life && <>
              <h4>Reparto</h4>
              {life.cast.map((c, i) => <label key={c.id}>{npcName(c.id)}<select aria-label={`Papel del NPC ${i + 1}`} value={c.roleId} onChange={e => editLife(l => { l.cast[i].roleId = e.target.value as LifeRole; })}>{Object.entries(LIFE_ROLES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label={`Personaje del NPC ${i + 1}`} value={c.characterId} onChange={e => editLife(l => { l.cast[i].characterId = e.target.value; })}>{[...characters, ...(characters.some(x => x.id === c.characterId) ? [] : [{ id: c.characterId, label: c.characterId }])].map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select><button onClick={() => editLife(l => { l.cast.splice(i, 1); })}>Quitar</button></label>)}
              <div className={styles.inlineButtons}><button disabled={!characters.length} onClick={() => editLife(l => { l.cast.push({ id: uid(), roleId: 'transeunte', characterId: characters[0].id, height: Math.round((1.6 + Math.random() * .25) * 100) / 100 }); })}>Añadir NPC</button></div>
              <h4>Puntos del escenario</h4><p className={styles.hint}>Cada punto declara qué se puede hacer en él. Los NPC eligen según su papel.</p>
              {life.points.map((p, i) => <label key={p.id}>Punto {i + 1}<select aria-label={`Uso del punto ${i + 1}`} value={p.kind} onChange={e => editLife(l => { l.points[i].kind = e.target.value as LifeAffordance; })}>{Object.entries(LIFE_AFFORDANCES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><span className={styles.twoColumns}><input aria-label={`Plazas del punto ${i + 1}`} type="number" min={1} max={8} value={p.slots} onChange={e => editLife(l => { l.points[i].slots = Math.min(8, Math.max(1, Math.round(number(e.target.value, 1)))); })} /><input aria-label={`Orientación del punto ${i + 1} (grados)`} type="number" step="5" value={Math.round(p.rotation * 180 / Math.PI)} onChange={e => editLife(l => { l.points[i].rotation = number(e.target.value, 0) * Math.PI / 180; })} /></span><button onClick={() => editLife(l => { l.points.splice(i, 1); })}>Quitar</button></label>)}
              <button className={styles.wideButton} disabled={!ready} onClick={addLifePoint}>Añadir punto donde mira la cámara</button>
              <h4>Grabación</h4>
              <div className={styles.twoColumns}><label>Duración del bucle (s)<input type="number" min={20} max={600} value={life.duration} onChange={e => editLife(l => { l.duration = Math.min(600, Math.max(20, number(e.target.value, 90))); })} /></label><label>Radio del área (m)<input type="number" min={8} max={80} value={life.radius} onChange={e => editLife(l => { l.radius = Math.min(80, Math.max(8, number(e.target.value, 25))); })} /></label></div>
              <label>Variación<input type="number" min={0} value={life.seed} onChange={e => editLife(l => { l.seed = Math.min(0xffffffff, Math.max(0, Math.round(number(e.target.value, 0)))); })} /></label>
              <div className={styles.inlineButtons}><button onClick={() => editLife(l => { l.seed = Math.floor(Math.random() * 0xffffffff); })}>Otra variación</button><button disabled={!connected || !ready || recordingLife || !life.cast.length} onClick={recordLife}>{recordingLife ? 'Grabando…' : lifeRecording ? 'Volver a grabar' : 'Grabar vida ambiental'}</button></div>
              <p className={styles.hint}>{!lifeRecording ? 'Sin grabar: el estudiante no verá NPC ambientales.' : lifeStale ? 'La configuración cambió después de grabar. Vuelve a grabar para que el estudiante vea los NPC.' : `Grabado · ${lifeRecording.tracks.length} NPC · bucle de ${Math.round(lifeRecording.loop)} s · ${lifeRecording.lines.length} frases.`}</p>
              {lifeRecording && lifeRecording.warnings.map(w => <p className={styles.hint} key={w}>⚠ {w}</p>)}
              {lifeRecording && !lifeStale && lifeRecording.lines.length > 0 && <><h4>Frases que se oyen</h4>{lifeRecording.lines.map((l, i) => <label key={l.id}>{l.at.toFixed(1)} s · {npcName(l.npcId)}<input value={l.text} maxLength={240} onChange={e => editLife(x => { if (x.recording) x.recording.lines[i].text = e.target.value; })} /></label>)}</>}
              <button className={styles.wideButton} onClick={() => edit(copy => { delete copy.scenes.find(s => s.id === scene.id)!.life; })}>Quitar la vida ambiental de esta escena</button>
            </>}</>}
        </div>
      </section>
      <section className={styles.panel + ' ' + styles.actionLibrary}>{panelHeading('Añadir a este momento')}<div className={styles.actionButtons}>{(['dialogue', 'camera', 'actor', 'sound'] as const).map(kind => <button key={kind} onClick={() => { setTab('moment'); addCue(kind); }}>{buttonIcon(kind === 'actor' ? 'person' : kind === 'dialogue' ? 'chat' : kind, kindNames[kind])}</button>)}<button onClick={() => setTab('interaction')}>{buttonIcon('look', 'Interacción')}</button></div></section>
      <section className={styles.panel + ' ' + styles.dialoguePanel}>{panelHeading('Diálogo')}<div className={styles.dialogueCard}><span className={styles.speakerAvatar}><Icon name="person" /></span><div><small>{editableDialogue?.speakerId ? scene.actors.find(a => a.id === editableDialogue.speakerId)?.name : 'Narrador'}</small><p>{editableSentence?.text ?? 'Añade una intervención de la Story.'}</p></div></div><small className={styles.sourceNote}>Vinculado a la versión de la Story · {coverage.used}/{coverage.total} frases en escena{coverage.unused ? ` · ${coverage.unused} sin usar` : ''}</small><div className={styles.dialogueActions}><button disabled={!editableSentence||!canonicalReady} onClick={()=>{if(editableSentence)setEditorial({sentenceId:editableSentence.id,text:editableSentence.text});}}>Editar texto</button><button disabled={!editableSentence} onClick={listen}>{buttonIcon('sound','Escuchar')}</button><button onClick={() => setScriptOpen(true)}>Abrir guion</button><label className={styles.fileControl}>{importingAudio?'Importando…':'Importar voz'}<input aria-label="Importar voz" type="file" accept="audio/*" disabled={importingAudio||!editableDialogue} onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file,'voice');e.target.value='';}} /></label></div>{audioControls.assets.length>0&&<details className={styles.audioAssets}><summary>Grabaciones disponibles ({audioControls.assets.length})</summary>{audioControls.assets.map(asset=><button key={asset.id} onClick={()=>bindAudioAsset(asset,'voice')}>{asset.name} · {asset.duration.toFixed(1)}s</button>)}</details>}</section>
    </aside>

    <section className={styles.timelinePanel + ' ' + styles.panel} aria-label="Sincronización del momento">{panelHeading('Sincronización de la secuencia', <div className={styles.inlineButtons}><span className={styles.subtle}>{duration.toFixed(1)} s · {sequence.name}</span><button aria-pressed={magnet} title="Imán: las acciones se pegan a los bordes de las demás" onClick={() => setMagnet(!magnet)}>Imán</button><button aria-expanded={showTime} onClick={() => setShowTime(!showTime)}>{showTime ? 'Ocultar' : 'Mostrar'}</button></div>)}<StudioStoryStrip project={project} selectedId={sequence.id} playingId={playback.stage.sequenceId} issues={issues} onSelect={select} onMove={reorderSequence} />{showTime && <Timeline scene={scene} sequence={sequence} time={playback.time} selectedId={explicitCue?.id ?? null} snap={magnet} onSeek={time => setPlayback(director.current.seek(list.findIndex(x => x.sequence.id === sequenceId), time))} onEdit={cues => { const moved = cues.filter(c => c.kind === 'dialogue' && sequence.cues.some(o => o.id === c.id && (o.at !== c.at || o.duration !== c.duration))).map(c => c.id); const copy = structuredClone(project); sequenceList(copy).find(x => x.sequence.id === sequence.id)!.sequence.cues = cues; change(syncAutoActing(copy, sequence.id, moved)); }} onSelect={id => { setSelectedCueId(id); setTab('moment'); }} />}</section>
    <footer className={styles.footer}><span><span className={styles.liveDot} />{student ? 'Modo: Reproducir historia' : 'Modo: Editar historia'}</span><span role="status">{audioControls.error??status}</span><span>{releaseId&&<a href={'?modo=reproducir&publicacion='+encodeURIComponent(releaseId)} target="_blank" rel="noopener">Abrir publicación · </a>}{dirty ? 'Cambios sin guardar' : `Revisión ${project.revision}`}{releaseId ? ' · publicada localmente' : ''}</span></footer>
    {soundPicker&&<div className={styles.modalShade}><form className={styles.mediaDialog} onSubmit={e=>{e.preventDefault();const cue:Cue={id:uid(),kind:'sound',at:nextCueStart(sequence,'sound',playhead),duration:3,audioUrl:soundUrl,volume:.5,label:'Sonido ambiente'};const copy=structuredClone(project);sequenceList(copy).find(x=>x.sequence.id===sequenceId)!.sequence.cues.push(cue);try{validateProject(copy,source);change(copy);setSelectedCueId(cue.id);setSoundPicker(false);setSoundUrl('');}catch(error){setStatus(error instanceof Error?error.message:'Archivo no válido.');}}}><h3>Vincular sonido</h3><div className={styles.audioFilePicker}><label className={styles.fileControl}>{importingAudio?'Importando…':'Elegir audio del equipo'}<input aria-label="Importar sonido" type="file" accept="audio/*" disabled={importingAudio} onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file,'sound');e.target.value='';}} /></label>{audioControls.assets.map(asset=><button type="button" key={asset.id} onClick={()=>bindAudioAsset(asset,'sound')}>{asset.name} · {asset.duration.toFixed(1)}s</button>)}</div><details><summary>Usar una dirección de audio existente</summary><label>Dirección del archivo<input placeholder="/audio/ambiente.mp3" value={soundUrl} onChange={e=>setSoundUrl(e.target.value)} required /></label><p>La duración se podrá ajustar en la secuencia.</p><button className={styles.primary}>Vincular dirección</button></details><div><button type="button" disabled={importingAudio} onClick={()=>setSoundPicker(false)}>Cerrar</button></div></form></div>}
    {confirmation&&<div className={styles.modalShade}><form className={styles.mediaDialog} role="alertdialog" aria-modal="true" aria-label={confirmation.title} onSubmit={e=>{e.preventDefault();const run=confirmation.run;setConfirmation(null);run();}} onKeyDown={e=>{if(e.key==='Escape')setConfirmation(null);}}><h3>{confirmation.title}</h3><p className={styles.confirmText}>{confirmation.message}</p><div><button type="button" autoFocus onClick={()=>setConfirmation(null)}>Cancelar</button><button className={styles.dangerSolid}>{confirmation.confirmLabel}</button></div></form></div>}
    {scriptOpen&&<StudioScript project={project} source={source} currentSequenceId={sequence.id} onClose={()=>setScriptOpen(false)}
      onGoTo={(sequenceId,cueId)=>{select(sequenceId);setSelectedCueId(cueId);setScriptOpen(false);}}
      onPlace={sentenceId=>placeSentence(sentenceId)} onCreateMoment={sentenceAsMoment}
      onStageUnused={()=>apply(()=>stageUnusedSentences(project,source,scene.id,sequence.id,lastSpeakerId),({project:next,created})=>{change(next);setStatus(`${created} momento(s) creados con las frases sin usar.`);})}
      onSpeaker={setLineSpeaker} />}
    {editorial&&<div className={styles.modalShade}><form className={styles.mediaDialog} onSubmit={e=>{e.preventDefault();void saveEditorial();}}><h3>Editar intervención</h3><label>Texto de la Story<textarea aria-label="Texto de la intervención" value={editorial.text} onChange={e=>setEditorial({...editorial,text:e.target.value})} rows={6} maxLength={10000} required autoFocus /></label><p>Se guardará una nueva versión de borrador. La versión publicada y sus palabras conservarán sus referencias originales.</p><div><button type="button" disabled={editing} onClick={()=>setEditorial(null)}>Cancelar</button><button className={styles.primary} disabled={editing}>{editing?'Guardando…':'Guardar nueva versión'}</button></div></form></div>}
  </div>;
}
