"use client";

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildStudioRehearsal } from '@/features/story-studio/demo';
import { createStudioDirector, sampleSequence } from '@/features/story-studio/director';
import { routeLength } from '@/features/story-studio/path';
import { createStudioRepository } from '@/features/story-studio/repository';
import { copyHistoria } from '@/features/story-studio/historia';
import { canPickFolders, chooseCharacterFolder, pickCharacterFiles, savedFolderName } from '@/features/story-studio/character-folder';
import { SCENE_AMBIENTS, sequenceDuration, sequenceList, validateProject, type Actor, type Cue, type Gate, type SceneAmbient, type Shot, type StudioProject, type StudioSource, type Vec3 } from '@/features/story-studio/model';
import {describeActorLife,defaultActorLife,LIFE_MOODS,LIFE_MOOD_LABELS,type ActorLife,type ActorLifeOverride,type LifeMood} from '@/features/story-studio/actor-life';
import { analyzeFlow, autoStageDialogue, chainCue, createSequence, deleteActor, deleteCue, deleteScene, deleteSequence, dialogueDuration, duplicateCue, duplicateSequence, guessSpeaker, incomingReferences, moveSequence, nextCueStart, placeDialogue, sentenceCoverage, setSceneEntries, stageUnusedSentences, suggestSentence } from '@/features/story-studio/editing';
import { StudioStoryStrip } from './StudioStoryStrip';
import { StudioScript } from './StudioScript';
import { createHostBridge, type HostReplyMessage, type WorldLexiconService } from '@/features/world-lexicon';
import styles from './story-studio.module.css';
import stageStyles from './engine-stage.module.css';
import type { EngineHost } from './EngineStage';
import { StudioReading } from './StudioReading';
import { IndexedDBStoryRepository } from '@/features/story-engine';
import { readStoredSources, reviseDialogue } from '@/features/story-studio/sources';
import {useStudioAudio} from './useStudioAudio';
import {StudioMediaRepository,localAudioId,type StudioAudioAsset} from '@/features/story-studio/browser-media';
import {speakSpanish} from '@/features/story-reader/browser-speech';
import {storePublishedPresentation} from '@/features/story-studio/publication';
import {HISTORIAS_CHANNEL,StudioWorkshop,type WorkshopContext} from './StudioWorkshop';
import type {WorkshopRequest} from './CreationShell';
import {createPortal} from 'react-dom';
import {StudioStoryboard} from './StudioStoryboard';
import {StudioSceneInspector} from './StudioSceneInspector';
import {StudioVariantPicker} from './StudioVariantPicker';
import {StudioSceneTransition} from './StudioSceneTransition';
import {StudioCameraProperties} from './StudioCameraProperties';
import {StudioCameraRigs,CameraCueInspector,SafeZonesOverlay} from './StudioCameraRigs';
import {editCamera} from '@/features/story-studio/camera-editing';
import {cameraAuditKey,type CameraAuditWarning} from '@/features/story-studio/camera-model';
import {buildCameraAudit,readCameraAudit} from '@/features/story-studio/camera-audit';
import {applyDirection,describeDirection,proposeDirection} from '@/features/story-studio/auto-director';
import {routeSamples} from '@/features/story-studio/path';
import {StudioMomentDuration} from './StudioMomentDuration';
import {StudioActorPlacement} from './StudioActorPlacement';
import {resizeScene,moveSceneToZone} from '@/features/story-studio/editing';
import {mountProblem,placeActor,riderOf} from '@/features/story-studio/mount';
import {DOCK_DEFAULT,DOCK_MIN,getDockSize,restoreDockSize,setDockSize} from './dock-size';
import {replaceBehaviorRefs,type BehaviorReplacement} from '@/features/story-studio/facial-usage';
import {DEFAULT_LIGHT,LIGHT_PRESETS,type SceneLight} from '@/features/story-studio/light';
import {StudioLightCueInspector,StudioLightLevels} from './StudioLightControls';
import {isBehaviorReference,type BehaviorReference} from '@/features/story-studio/behavior';
import {packStudio,inspectStudioPackage,relinkBehaviors} from '@/features/story-studio/portable';
import {checkDirection} from '@/features/story-studio/checks';
import {workshopAction} from '@/features/story-studio/workshop';
import type {HistoriaFile} from '@/features/story-studio/historia';
import {historias as historiasApi,useHistoriaAutosave,uploadHistoriaAudio,downloadHistoriaAudio,clearMirror} from '@/features/story-studio/historias-client';
import type {HistoriaAbierta} from './HistoriaInicio';
import { LIFE_AFFORDANCES, LIFE_ROLES, lifeIsStale, defaultLife, type LifeAffordance, type LifeRole, type SceneLife } from '@/features/story-studio/life';

const Flow = dynamic(() => import('./StudioFlow').then(m => m.StudioFlow), { ssr: false });
const Timeline = dynamic(() => import('./StudioTimeline').then(m => m.StudioTimeline), { ssr: false });
const kindNames = { camera: 'Cámara', cameraSwitch: 'Cambio de cámara', cameraMove: 'Movimiento de cámara', actor: 'Actuación', dialogue: 'Diálogo', sound: 'Sonido', light: 'Luz' };
/** Texto corto de un cue para listas y selectores. */
const cueText = (c: Cue, scene: StudioProject['scenes'][number], sentences: readonly { id: string; text: string }[], length: number) => c.kind === 'dialogue' ? sentences.find(s => s.id === c.sentenceId)?.text.slice(0, length) : c.kind === 'cameraMove' ? scene.cameras?.find(x => x.id === c.cameraId)?.name ?? 'Cámara' : c.kind === 'cameraSwitch' ? scene.cameras?.find(x => x.id === c.cameraId)?.name ?? c.label : c.kind === 'actor' ? c.action : c.label;
const actionNames = { idle: 'Esperar', walk: 'Caminar', turn: 'Girarse', look: 'Mirar', talk: 'Hablar', listen: 'Escuchar', wave: 'Saludar', nod: 'Asentir' };
const ambientNames: Record<SceneAmbient, string> = { manana: 'Mañana · sol cálido', mediodia: 'Mediodía · luz neutra', tarde: 'Tarde · luz rasante', nublado: 'Nublado · luz difusa', noche: 'Noche · lámparas' };
type Confirmation = { title: string; message: string; confirmLabel: string; run: () => void };
const shortcuts: [string, string][] = [['Ctrl + Z', 'Deshacer'], ['Ctrl + Y · Ctrl + Mayús + Z', 'Rehacer'], ['Ctrl + S', 'Guardar la historia'], ['Ctrl + Mayús + S', 'Guardar como…'], ['Ctrl + O', 'Volver al menú de historias'], ['Espacio', 'Reproducir o pausar el momento'], ['Supr', 'Borrar la acción seleccionada'], ['Ctrl + D', 'Duplicar la acción seleccionada'], ['← / →', 'Mover el cabezal 0,1 s (Mayús: 1 s)'], ['Esc', 'Cancelar la selección en el visor']];
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

export function StoryStudio({ viewerUrl, service, owner, sources = [],historia,onOpenHistoria,onCloseHistoria,host,toolbar=null,workshopRequest,onWorkshopChange }: { viewerUrl: string; service: WorldLexiconService; owner: string; sources?: StudioSource[];host?:EngineHost;
  /** La historia abierta (archivo en Estudio/Historias) y su último guardado en disco. */
  historia:HistoriaAbierta;onOpenHistoria:(h:HistoriaAbierta)=>void;onCloseHistoria:()=>void;
  /** Barra común (Generador › Editor › Estudio › Talleres): las acciones del Estudio se dibujan en ella. */
  toolbar?:HTMLElement|null;workshopRequest?:WorkshopRequest;onWorkshopChange?:(editor:'body'|'face'|null)=>void }) {
  // Plantilla de forma para «vincular otra Story» (initialDirection); ya no decide qué se abre.
  const rehearsal = useMemo(() => buildStudioRehearsal('airport'), []);
  const [historiaSnapshot,setHistoriaSnapshot]=useState(()=>historia.file.source);
  const baseCatalog = useMemo(() => [...(sources.some(s=>s.storyVersionId===historiaSnapshot.storyVersionId)?[]:[historiaSnapshot]), ...sources], [historiaSnapshot, sources]);
  const [localSources,setLocalSources]=useState<StudioSource[]>([]);
  const catalog = useMemo(() => [...baseCatalog,...localSources], [baseCatalog,localSources]);
  const [sourceId, setSourceId] = useState(historia.file.project.storyVersionId);
  // Mientras el catálogo se recarga (fuentes del visor o historias locales) la fuente elegida puede faltar un
  // instante: se usa el ensayo base en lugar de romper todo el Estudio con «storyVersionId» indefinido.
  const source = catalog.find(s => s.storyVersionId === sourceId) ?? historiaSnapshot;
  const [project, setProject] = useState(historia.file.project);
  const [sequenceId, setSequenceId] = useState(()=>{const wanted=historia.file.ui?.sequenceId;return wanted&&sequenceList(historia.file.project).some(x=>x.sequence.id===wanted)?wanted:historia.file.project.scenes[0].sequences[0].id;});
  const [historiaName]=useState(historia.file.name);
  /** Revisión del último guardado en disco (null = nunca guardada): evita pisar un guardado de otra pestaña. */
  const savedRevision=useRef<number|null>(historia.saved?.revision??null);
  // Copias «Guardado anterior/de hace dos/tres» que existen: cada «Guardar» deja la anterior como copia (hasta 3).
  const [backupCount,setBackupCount]=useState(()=>Math.min(3,historia.saved?.revision??0));
  const [savedAt,setSavedAt]=useState<string|null>(historia.saved?.savedAt??null);
  const [saving,setSaving]=useState(false);
  const [fileMenu,setFileMenu]=useState(false);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  // Cámaras con nombre: vista del autor, pilotaje, zonas seguras y revisión con el escenario.
  const [cameraView,setCameraView]=useState<'camera'|'free'>('camera');
  const [studentInset,setStudentInset]=useState(true);
  const [pilotCamera,setPilotCamera]=useState<string|null>(null);
  const [safeZones,setSafeZones]=useState(false);
  const [cameraAuditing,setCameraAuditing]=useState(false);
  const [cameraAuditNote,setCameraAuditNote]=useState<string|null>(null);
  const auditRequest=useRef<{requestId:string;sceneId:string;key:string;checks:ReturnType<typeof buildCameraAudit>}|null>(null);
  const [tab, setTab] = useState<'scene'|'moment' | 'camera' | 'actors' | 'interaction' | 'life'>(()=>(['scene','moment','camera','actors','interaction','life'] as const).find(t=>t===historia.file.ui?.tab)??'scene');
  const [library, setLibrary] = useState<'characters' | 'scenarios' | 'actions'>('characters');
  const [student, setStudent] = useState(false);
  const [focusMode,setFocusMode]=useState(false);
  const [panelWidths,setPanelWidths]=useState(()=>historia.file.ui?.panelWidths??{library:304,inspector:352});
  // Barra lateral de grandes opciones: qué panel ocupa la columna izquierda.
  const [railPanel,setRailPanel]=useState<'story'|'resources'|'actions'|'dialogue'>('story');
  // Panel inferior: Secuencia (línea de tiempo) o Dirección (escenas, momentos, rutas y acciones).
  const [dockTab,setDockTab]=useState<'sequence'|'direction'>('sequence');
  const [ready, setReady] = useState(false);
  const [viewerAttempt,setViewerAttempt]=useState(0);
  const [connected, setConnected] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [flowView,setFlowView]=useState<'scenes'|'moments'|'routes'|'actions'>(()=>(['scenes','moments','routes','actions'] as const).find(v=>v===historia.file.ui?.flowView)??'scenes');
  const [status, setStatus] = useState('Conectando con el escenario…');
  const [savedSignature, setSavedSignature] = useState(() => historia.saved?JSON.stringify(historia.saved.project):'');
  const dirty = useMemo(() => JSON.stringify(project) !== savedSignature, [project, savedSignature]);
  const [history, setHistory] = useState<StudioProject[]>([]);
  const [future, setFuture] = useState<StudioProject[]>([]);
  const [characters, setCharacters] = useState<{ id: string; label: string }[]>([]);
  const [characterClips,setCharacterClips]=useState<Record<string,string[]>>({});
  const [characterModels,setCharacterModels]=useState<Record<string,string>>({});
  const [libraryDropHot,setLibraryDropHot]=useState(false);
  const [characterFolder,setCharacterFolder]=useState<string|null>(null);
  const [folderPicker,setFolderPicker]=useState(false);
  const libraryFileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(canPickFolders()){setFolderPicker(true);void savedFolderName().then(setCharacterFolder);}},[]);
  // Catálogo de personajes directo del visor: se puede elegir personaje sin esperar a que cargue el escenario.
  useEffect(()=>{let live=true;fetch('/api/studio-characters',{cache:'no-store'}).then(r=>r.json()).then((data:{characters?:{id:string;label:string;modelUrl:string|null}[]})=>{if(!live||!Array.isArray(data.characters))return;setCharacters(old=>old.length?old:data.characters!.map(c=>({id:c.id,label:c.label})));setCharacterModels(old=>({...Object.fromEntries(data.characters!.filter(c=>c.modelUrl).map(c=>[c.id,c.modelUrl as string])),...old}));}).catch(()=>{});return()=>{live=false;};},[]);
  const [scenarios,setScenarios]=useState<{id:string;label:string}[]>([]);
  const scenarioRequest=useRef<{requestId:string;sceneId:string;oldZone:string;fresh?:boolean}|null>(null);
  /** Si el motor no responde a un cambio de escenario, el Estudio no se queda esperando para siempre. */
  function armScenarioTimeout(requestId:string){window.setTimeout(()=>{if(scenarioRequest.current?.requestId===requestId){scenarioRequest.current=null;setStatus('El escenario no respondió. Vuelve a elegirlo.');}},20000);}
  // Escena a la que se acaba de dar su primer escenario: al conectar, se encuadra la entrada del lugar.
  const framePending=useRef<string|null>(null);
  // Lugares disponibles aunque el motor no esté cargado (escena sin escenario).
  const [placeOptions,setPlaceOptions]=useState<{id:string;label:string}[]>([]);
  const zoneOptions=scenarios.length?scenarios:placeOptions;
  useEffect(()=>{fetch('/api/generated-places',{cache:'no-store'}).then(r=>r.json()).then(r=>{const list=[...(Array.isArray(r.zones)?r.zones:[]),...(Array.isArray(r.places)?r.places:[])].filter((z:{id?:unknown;label?:unknown})=>typeof z.id==='string'&&typeof z.label==='string'&&!(z.id as string).startsWith('servicio'));setPlaceOptions(list.map((z:{id:string;label:string})=>({id:z.id,label:z.label})));}).catch(()=>{});},[]);
  const [workshop,setWorkshop]=useState<(WorkshopContext&{sceneId:string;sequenceId:string;actorId:string;cueId?:string})|null>(null);
  // Al recargar con un taller abierto se vuelve a ese taller (y a su editor, de animación o facial), no al Estudio.
  // El Taller «En escena» trabaja sobre el escenario vivo: el motor sigue dibujando debajo de su visor.
  const [sceneLive,setSceneLive]=useState(false);
  const sharedStageSlot=useRef<HTMLDivElement|null>(null);
  const setStudioStageSlot=host?.slot('estudio');
  const registerStudioStageSlot=useCallback((element:HTMLDivElement|null)=>{
    sharedStageSlot.current=element;
    setStudioStageSlot?.(element);
  },[setStudioStageSlot]);
  const workshopRestored=useRef(false);
  const workshopRef=useRef(workshop);workshopRef.current=workshop;
  // El Taller abierto se recuerda por historia (antes se compartía entre historias) y solo si su escena y su actor siguen existiendo.
  const workshopStoreKey='spanstories.studio-workshop.v1:'+historia.file.id;
  useEffect(()=>{try{const saved=sessionStorage.getItem(workshopStoreKey);if(saved){const w=JSON.parse(saved),target=projectRef.current.scenes.find(s=>s.id===w?.sceneId);if(target&&(w.sinPersonaje||target.actors.some(a=>a.id===w.actorId))&&target.sequences.some(q=>q.id===w.sequenceId))setWorkshop(w);else sessionStorage.removeItem(workshopStoreKey);}}catch{}workshopRestored.current=true;},[workshopStoreKey]);
  useEffect(()=>{if(!workshopRestored.current)return;try{if(workshop)sessionStorage.setItem(workshopStoreKey,JSON.stringify(workshop));else sessionStorage.removeItem(workshopStoreKey);}catch{}},[workshop,workshopStoreKey]);
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
  const [transferOpen,setTransferOpen]=useState(false);
  const [transferring,setTransferring]=useState(false);
  const [scriptOpen,setScriptOpen]=useState(false);
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [shortcutsOpen,setShortcutsOpen]=useState(false);
  const [lastSpeakerId,setLastSpeakerId]=useState<string|null>(null);
  const [picking,setPicking]=useState<{requestId:string;message:string}|null>(null);
  const [focusWithLine,setFocusWithLine]=useState(true);
  const [magnet,setMagnet]=useState(true);
  const [dragSequence,setDragSequence]=useState<string|null>(null);
  const pickHandlers=useRef(new Map<string,(m:{position?:Vec3;entryId?:string|null;label?:string|null})=>void>());
  const characterDrop=useRef<(files:File[],position:Vec3,sceneId:string,zoneId:string)=>Promise<void>>(async()=>{});
  const characterImports=useRef(new Map<string,{resolve:()=>void;reject:(error:Error)=>void}>());
  const importingCharacters=useRef(false);
  const focusPending=useRef<{sequenceId:string;at:number;actorName:string}|null>(null);
  const sourceRepository=useRef<IndexedDBStoryRepository|null>(null);
  const selectionTouched=useRef(false);
  const ownFrame = useRef<HTMLIFrameElement>(null);
  // Con motor compartido el Estudio usa el mismo escenario que el Editor de escenarios, sin recargarlo.
  const frame = host?.frame ?? ownFrame;
  const active = !host || host.mode === 'estudio';
  const activeRef=useRef(active);activeRef.current=active;
  // El taller cubre por completo el escenario: conserva el motor y su estado,
  // pero evita que compita por la GPU con el personaje del taller.
  useEffect(()=>{
    const origin=new URL(viewerUrl).origin;
    const send=(visible:boolean)=>frame.current?.contentWindow?.postMessage({channel:'spanstories.engine',version:1,type:'RENDER_VISIBILITY',visible},origin);
    const visible=!!host||!(active&&workshop)||sceneLive;
    const ready=(event:MessageEvent)=>{if(event.origin===origin&&event.source===frame.current?.contentWindow&&event.data?.channel==='spanstories.engine'&&event.data?.type==='LOADED')send(visible);};
    send(visible);window.addEventListener('message',ready);
    return()=>{window.removeEventListener('message',ready);send(true);};
  },[active,!!workshop,!!host,sceneLive,frame,viewerUrl]);
  const [initialDirector] = useState(() => createStudioDirector(project, source));
  const director = useRef(initialDirector);
  const directorSourceId=useRef(source.storyVersionId);
  const [playback, setPlayback] = useState(() => initialDirector.snapshot());
  const playbackRef = useRef(playback);
  const projectRef = useRef(project);
  const sourceRef = useRef(source);
  const studentRef = useRef(student);
  const dirtyRef=useRef(dirty);
  useEffect(() => { playbackRef.current = playback; projectRef.current = project; sourceRef.current = source; studentRef.current = student; dirtyRef.current=dirty; }, [playback, project, source, student,dirty]);
  const requests = useRef(new Map<string, (value: { shot: Shot; position: Vec3 }) => void>());
  const audioControls=useStudioAudio(owner,playback);
  const directionChecks=useMemo(()=>checkDirection(project,source,{characters:characters.map(c=>c.id),scenarios:scenarios.map(s=>s.id),audio:audioControls.assets.map(a=>a.id)}),[project,source,characters,scenarios,audioControls.assets]);
  // El escenario abre directamente en el aeropuerto (zona ligera y predeterminada del Estudio): antes cargaba siempre
  // la primera zona del mundo (Barcelona, ~230 MB) aunque la escena fuera otra, y el Estudio tardaba muchísimo.
  // Si la escena usa otra zona, el puente la cambia en cuanto conecta.
  const startZone='aeropuerto-entrada';
  const viewer = new URL(viewerUrl); viewer.searchParams.set('estudio', '1'); viewer.searchParams.set('zone', startZone);
  const origin = host?.origin ?? viewer.origin;
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
  const renderedZone=project.scenes.find(s=>s.id===playback.stage.sceneId)?.zoneId??scene.zoneId;
  viewer.searchParams.set('zone',renderedZone);
  useEffect(()=>{setReady(false);setConnected(false);},[renderedZone]);
  // Al entrar desde el Editor de escenarios el Estudio adopta el lugar que se está viendo (sin recargar).
  // Solo un cambio de escena hecho dentro del Estudio hacia otra zona carga esa otra zona.
  const adoptPending=useRef(false);
  const hostSetZone=host?.setZone,hostSwitched=!!host?.switched,hostZone=host?.zone??null;
  const hostZoneRef=useRef<string|null|undefined>(host?hostZone:undefined);
  const adoptRef=useRef<()=>void>(()=>{});
  // «Reintentar escenario» solo si el escenario tarda de verdad: al cambiar de modo no debe parpadear.
  const [slowViewer,setSlowViewer]=useState(false);
  useEffect(()=>{if(ready)return;const timer=window.setTimeout(()=>setSlowViewer(true),4000);return()=>{window.clearTimeout(timer);setSlowViewer(false);};},[ready]);
  // Encuadre que tenía el Editor al entrar: la escena adoptada empieza viendo exactamente eso.
  const adoptShot=useRef<Shot|null>(null);
  useEffect(()=>{hostZoneRef.current=host?hostZone:undefined;},[host,hostZone]);
  const wasActive=useRef(active);
  useEffect(()=>{if(active&&!wasActive.current&&hostSwitched)adoptPending.current=true;wasActive.current=active;},[active,hostSwitched]);
  useEffect(()=>{if(hostSetZone&&active&&!adoptPending.current&&!scenarioRequest.current)hostSetZone(renderedZone);},[hostSetZone,active,renderedZone]);
  // Al volver al Editor se pausa la historia; al regresar el puente vuelve a anunciarse (READY) y se reconecta.
  useEffect(()=>{if(!active){setPlayback(director.current.pause());setReady(false);setConnected(false);}},[active]);
  const selectedCue = sequence.cues.find(c => c.id === selectedCueId) ?? sequence.cues.find(c => c.kind === 'dialogue');
  const dialogue = sequence.cues.find(c => c.kind === 'dialogue');
  const actor = scene.actors.find(a => a.id === actorId) ?? scene.actors[0];
  const sentence = source.sentences.find(s => s.id === playback.stage.caption?.sentenceId);
  const duration = sequenceDuration(sequence);
  const touchedObject=objectTouch?.sequenceId===playback.stage.sequenceId?objectTouch.entryId:null;
  const editableDialogue=selectedCue?.kind==='dialogue'?selectedCue:dialogue?.kind==='dialogue'?dialogue:null;
  const editableSentence=source.sentences.find(s=>s.id===editableDialogue?.sentenceId);
  const explicitCue = sequence.cues.find(c => c.id === selectedCueId) ?? null;
  // Al elegir una intervención en Momento se abre «Diálogo y voz» (antes se desplegaba su cajón).
  const dialogueFocus = tab === 'moment' && explicitCue?.kind === 'dialogue' ? explicitCue.id : null;
  const [lastDialogueFocus, setLastDialogueFocus] = useState<string | null>(null);
  if (dialogueFocus !== lastDialogueFocus) { setLastDialogueFocus(dialogueFocus); if (dialogueFocus) setRailPanel('dialogue'); }
  // Caminos de las caminatas de este momento: se dibujan en el escenario y sus puntos se arrastran allí mismo.
  const [pathPoint,setPathPoint]=useState<{cueId:string;index:number}|null>(null);
  /** Dónde está el actor cuando empieza la acción (de ahí sale su camino). */
  const cueStart=(cueId:string):Vec3|null=>{
    const cue=sequence.cues.find(c=>c.id===cueId);if(cue?.kind!=='actor')return null;
    try{return sampleSequence(project,list.findIndex(x=>x.sequence.id===sequence.id),cue.at).actors.find(a=>a.id===cue.actorId)?.position??null;}catch{return null;}
  };
  const cueRoute=(cue:Cue):Vec3[]=>cue.kind==='actor'?[...(cue.path??[]),...(cue.destination?[cue.destination]:[])]:[];
  const walkPaths=sequence.cues.flatMap(c=>{const points=cueRoute(c),start=points.length?cueStart(c.id):null;return start?[{cueId:c.id,actorId:c.kind==='actor'?c.actorId:undefined,start,points,selected:c.id===selectedCueId,selectedIndex:pathPoint?.cueId===c.id?pathPoint.index:-1}]:[];});
  const walkPathsKey=JSON.stringify(walkPaths);
  useEffect(()=>{if(connected&&active)send('PATHS',{items:JSON.parse(walkPathsKey)});},[walkPathsKey,connected,ready,active,send]);
  // Altura del panel inferior: asa arrastrable; doble clic lo deja solo con la cabecera (y lo restaura). Ver dock-size.ts.
  useEffect(()=>{restoreDockSize();},[]);
  const dockBefore=useRef(DOCK_DEFAULT);
  const dockGripDown=(e:{button:number;pointerId:number;clientY:number;currentTarget:HTMLDivElement;preventDefault():void})=>{
    if(e.button!==0)return;e.preventDefault();const grip=e.currentTarget,dock=grip.parentElement;if(!dock)return;
    grip.setPointerCapture(e.pointerId);const y0=e.clientY,h0=dock.getBoundingClientRect().height;
    const move=(ev:PointerEvent)=>setDockSize(h0-(ev.clientY-y0));
    const up=()=>{grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',up);grip.removeEventListener('pointercancel',up);};
    grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',up);grip.addEventListener('pointercancel',up);
  };
  const dockGripToggle=()=>{const now=getDockSize();if(now>DOCK_MIN+4){dockBefore.current=now;setDockSize(DOCK_MIN);}else setDockSize(dockBefore.current>DOCK_MIN+4?dockBefore.current:DOCK_DEFAULT);};
  // Personaje elegido (pestaña Personajes o clic en el escenario): centro de la pantalla y de la órbita en el escenario.
  const pivotActorId=tab==='actors'&&actorId&&scene.actors.some(a=>a.id===actorId)?actorId:null;
  useEffect(()=>{if(connected&&active)send('SELECT_ACTOR',{actorId:pivotActorId});},[pivotActorId,connected,ready,active,send]);
  // Caminos de las cámaras con nombre de la escena: a su altura real, con la curva que recorre la cámara.
  const cameraPathsKey=JSON.stringify((scene.cameras??[]).flatMap(c=>c.body.kind==='path'?[{cameraId:c.id,points:c.body.points,samples:c.body.points.length>1?[...routeSamples(c.body.points[0],c.body.points.slice(1)).pts].filter((_,i,a)=>i%Math.max(1,Math.ceil(a.length/500))===0||i===a.length-1):c.body.points,selected:false}]:[]));
  useEffect(()=>{if(connected&&active)send('CAMERA_PATHS',{items:JSON.parse(cameraPathsKey)});},[cameraPathsKey,connected,ready,active,send]);
  useEffect(()=>{if(connected&&active)send('PILOT',{cameraId:student?null:pilotCamera});},[pilotCamera,connected,ready,active,student,send]);
  const playhead = playback.stage.sequenceId === sequence.id ? playback.time : 0;
  const issues = useMemo(() => analyzeFlow(project), [project]);
  const coverage = useMemo(() => sentenceCoverage(project, source), [project, source]);
  const sceneIndex = project.scenes.findIndex(s => s.id === scene.id);
  const sequenceIndex = scene.sequences.findIndex(s => s.id === sequence.id);
  // Luz que había al empezar una transición de luz de este momento (incluye los momentos anteriores de la escena).
  const lightAt=(at:number):SceneLight=>{try{return sampleSequence(project,list.findIndex(x=>x.sequence.id===sequence.id),at).light??scene.light??DEFAULT_LIGHT;}catch{return scene.light??DEFAULT_LIGHT;}};
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
    }}).catch(error=>{if(!cancelled)setStatus(error instanceof Error?error.message:'No se pudo abrir el archivo de historias.');});
    return ()=>{cancelled=true;if(sourceRepository.current===repository)sourceRepository.current=null;void repository.close().catch(()=>{});};
  },[owner,baseCatalog]);

  const change = useCallback((next: StudioProject) => {
    try {
      validateProject(next, source);
      const previous = projectRef.current;
      setHistory(h => [...h.slice(-39), structuredClone(previous)]); setFuture([]);
      // Se adelanta la referencia: una segunda edición (o una respuesta asíncrona del motor) parte de este cambio.
      projectRef.current = next; setProject(next); setReleaseId(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Cambio inválido.'); }
  }, [source]);
  const changeRef=useRef(change);
  useEffect(()=>{changeRef.current=change;},[change]);
  function edit(fn: (copy: StudioProject) => void) { const copy = structuredClone(projectRef.current); fn(copy); change(copy); }
  function editSequence(fn: (copy: typeof sequence) => void) { edit(copy => fn(sequenceList(copy).find(x => x.sequence.id === sequence.id)!.sequence)); }
  function editCue(fn: (cue: Cue) => void) {
    if (!selectedCue) return;
    const copy = structuredClone(projectRef.current), target = sequenceList(copy).find(x => x.sequence.id === sequence.id)?.sequence, cue = target?.cues.find(c => c.id === selectedCue.id);
    if (!cue) return;
    fn(cue);
    change(selectedCue.kind === 'dialogue' ? syncAutoActing(copy, sequence.id, [selectedCue.id]) : copy);
  }
  // Los talleres solo necesitan el personaje, no el escenario: si el escenario aún no lo ha preparado, el modelo
  // se toma del catálogo de personajes del visor (así el Taller facial abre directamente desde el Estudio).
  async function catalogModel(characterId:string){
    const data=await (await fetch('/api/studio-characters',{cache:'no-store'})).json() as {characters?:{id:string;modelUrl:string|null}[]};
    return data.characters?.find(c=>c.id===characterId)?.modelUrl??null;
  }
  /** Lo que los talleres necesitan saber de la historia: cuál es (borradores separados) y la vida en reposo del personaje. */
  const storyFields=(chosen:Actor,cue?:Cue,targetScene=scene,targetSequence=sequence)=>({
    storyId:historia.file.id,storyName:historiaName,...(chosen.montura?{montura:chosen.montura}:{}),vida:chosen.vida??null,vidaMomento:cue?.kind==='actor'?cue.vida??null:null,
    cueStatic:cue?.kind!=='actor'||(['idle','listen','look'].includes(cue.action)&&!cue.behavior),at:cue?.at??playhead,time:playhead,
    others:targetScene.actors.filter(a=>a.id!==chosen.id).map(a=>{
      const action=workshopAction(targetSequence,a.id,undefined,playhead);
      return {id:a.id,name:a.name,characterId:a.characterId,modelUrl:characterModels[a.characterId],cueId:action.cue?.id,behavior:action.cue?.behavior,...(a.montura?{montura:a.montura}:{})};
    }),
  });
  async function openWorkshop(editor:'body'|'face'='body',pickedActorId?:string){
    // Después de llevar las ediciones a la historia, leer el proyecto actualizado y respetar el actor pulsado.
    const targetScene=pickedActorId?projectRef.current.scenes.find(s=>s.id===workshopRef.current?.sceneId):scene;
    const targetSequence=pickedActorId?targetScene?.sequences.find(s=>s.id===workshopRef.current?.sequenceId):sequence;
    if(!targetScene||!targetSequence)return;
    const chosen=pickedActorId?targetScene.actors.find(a=>a.id===pickedActorId):selectedCue?.kind==='actor'?scene.actors.find(a=>a.id===selectedCue.actorId):actor;
    if(pickedActorId&&!chosen)return;
    if(!chosen){
      // Los talleres se pueden abrir sin personaje en la escena: dentro de ellos se elige uno de la biblioteca.
      setPlayback(director.current.pause());
      setWorkshop({editor,sinPersonaje:true,sceneId:scene.id,sequenceId:sequence.id,actorId:'',characterId:'',characterName:'',modelUrl:'',sequenceName:sequence.name,storyId:historia.file.id,storyName:historiaName});
      return;
    }
    const currentAction=workshopAction(targetSequence,chosen.id,pickedActorId?undefined:selectedCue?.id,playback.time);
    if(currentAction.ambiguous){setTab('moment');setStatus('Hay varias actuaciones para este personaje. Selecciona la que quieres editar en «Acción seleccionada».');return;}
    let modelUrl:string|null=characterModels[chosen.characterId]??null;
    if(!modelUrl){try{modelUrl=await catalogModel(chosen.characterId);}catch{modelUrl=null;}}
    if(!modelUrl){setStatus('No se encontró el modelo de este personaje en el catálogo del visor.');return;}
    // Solo se pausa si algo se mueve: pausar lo ya pausado volvía a montar la escena en el motor (~1 s al abrir el Taller).
    if(playback.state==='playing'||playback.state==='waiting')setPlayback(director.current.pause());
    if(pickedActorId){setActorId(chosen.id);setSelectedCueId(currentAction.cue?.id??null);}
    setWorkshop({editor,sceneId:targetScene.id,sequenceId:targetSequence.id,actorId:chosen.id,cueId:currentAction.cue?.id,characterId:chosen.characterId,characterName:chosen.name,modelUrl,sequenceName:targetSequence.name,behavior:currentAction.cue?.behavior,...storyFields(chosen,currentAction.cue,targetScene,targetSequence)});
  }
  // Taller precargado: con un personaje seleccionado (y el escenario listo) el Taller de ese personaje se carga oculto y
  // en pausa; «Animación» solo lo muestra y entra en escena al instante, con la misma vista. Se conserva al volver.
  const workshopKey=(c:WorkshopContext|null)=>c?[c.characterId,c.sceneId,c.actorId,c.cueId??'',c.sequenceId,c.behavior?.url??'',c.modelUrl].join('|'):'';
  const warmCandidate=(()=>{
    if(!active||student||workshop||!connected||!ready||!host||playback.state==='playing')return null;
    const chosen=selectedCue?.kind==='actor'?scene.actors.find(a=>a.id===selectedCue.actorId):actor;
    const modelUrl=chosen?characterModels[chosen.characterId]:null;
    if(!chosen||!modelUrl)return null;
    const currentAction=workshopAction(sequence,chosen.id,selectedCue?.id,playback.time);
    if(currentAction.ambiguous)return null;
    return {editor:'body' as const,sceneId:scene.id,sequenceId:sequence.id,actorId:chosen.id,cueId:currentAction.cue?.id,characterId:chosen.characterId,characterName:chosen.name,modelUrl,sequenceName:sequence.name,behavior:currentAction.cue?.behavior,...storyFields(chosen,currentAction.cue)};
  })();
  const warmCandidateKey=workshopKey(warmCandidate);
  const [warmWorkshop,setWarmWorkshop]=useState<(WorkshopContext&{sceneId:string;sequenceId:string;actorId:string;cueId?:string})|null>(null);
  const warmCandidateRef=useRef(warmCandidate);warmCandidateRef.current=warmCandidate;
  useEffect(()=>{
    if(workshop)return;
    if(!active||student){setWarmWorkshop(null);return;}
    if(!warmCandidateKey||warmCandidateKey===workshopKey(warmWorkshop))return;
    // Se espera a que la selección se asiente: elegir varios personajes seguidos no carga varios Talleres.
    const timer=window.setTimeout(()=>setWarmWorkshop(warmCandidateRef.current),1200);
    return()=>window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[warmCandidateKey,!!workshop,active,student]);
  // Al cerrar el Taller se queda precargado tal cual (volver a abrirlo no recarga nada).
  const lastWorkshop=useRef(workshop);
  useEffect(()=>{if(lastWorkshop.current&&!workshop&&!lastWorkshop.current.sinPersonaje)setWarmWorkshop(lastWorkshop.current);lastWorkshop.current=workshop;},[workshop]);
  // Un personaje quitado de la escena no deja su Taller cargado.
  useEffect(()=>{if(warmWorkshop&&!project.scenes.some(s=>s.id===warmWorkshop.sceneId&&s.actors.some(a=>a.id===warmWorkshop.actorId)))setWarmWorkshop(null);},[project,warmWorkshop]);
  const shownWorkshop=workshop??warmWorkshop;
  // La barra común pide abrir (o cerrar) un taller; el Estudio usa el personaje y el momento seleccionados.
  const lastWorkshopRequest=useRef(workshopRequest?.n??0);
  useEffect(()=>{
    if(!workshopRequest||workshopRequest.n===lastWorkshopRequest.current)return;
    lastWorkshopRequest.current=workshopRequest.n;
    setFileMenu(false);setShortcutsOpen(false);
    const wanted=workshopRequest.editor;
    if(wanted===null){closeWorkshop();return;}
    if(student)setStudent(false);
    if(workshop){setWorkshop(w=>w&&w.editor!==wanted?{...w,editor:wanted}:w);return;}
    void openWorkshop(wanted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[workshopRequest?.n]);
  const onWorkshopChangeRef=useRef(onWorkshopChange);onWorkshopChangeRef.current=onWorkshopChange;
  useEffect(()=>{onWorkshopChangeRef.current?.(workshop?(workshop.editor??'body'):null);},[workshop]);
  // Momento creado por un guardado automático del Taller: los siguientes guardados de ese Taller van al mismo momento
  // (el contexto del Taller no se cambia, porque eso lo volvería a montar y recargaría su página).
  const autoCue=useRef<{key:string;cueId:string}|null>(null);
  /** Lleva a la historia la actuación del Taller. auto = al cambiar de taller o volver al Estudio: el Taller sigue abierto. */
  function applyBehavior(behavior:BehaviorReference,auto=false){
    const w=workshopRef.current??workshop;if(!w)return;const next=structuredClone(projectRef.current),targetScene=next.scenes.find(s=>s.id===w.sceneId),target=targetScene?.sequences.find(s=>s.id===w.sequenceId),person=targetScene?.actors.find(a=>a.id===w.actorId);
    if(!target||!person||person.characterId!==behavior.characterId){setStatus('El personaje o momento cambió mientras se editaba la actuación.');return;}
    const key=workshopKey(w),cueId=w.cueId??(autoCue.current?.key===key?autoCue.current.cueId:undefined);
    let cue=target.cues.find(c=>c.id===cueId);
    if(cue?.kind!=='actor'){cue={id:uid(),kind:'actor',actorId:person.id,action:'idle',at:0,duration:behavior.duration};target.cues.push(cue);if(!w.cueId)autoCue.current={key,cueId:cue.id};}
    if(cue.kind==='actor'){cue.behavior=behavior;cue.duration=behavior.duration;delete cue.expression;delete cue.clipName;}
    changeRef.current(next);setSelectedCueId(cue.id);
    if(auto){setStatus('Modificación en historia: la historia ya tiene los cambios del Taller.');return;}
    setTab('moment');setWorkshop(null);setStatus('Actuación vinculada al personaje y al momento. Guarda la historia para conservarla.');
  }
  function applyMountedBehaviors(items:{actorId:string;behavior:BehaviorReference;role?:'rider'|'horse'}[]){
    const w=workshopRef.current;if(!w)return;
    const next=structuredClone(projectRef.current),targetScene=next.scenes.find(s=>s.id===w.sceneId);
    const target=targetScene?.sequences.find(s=>s.id===w.sequenceId);
    if(!target||!targetScene||items.some(item=>!targetScene.actors.some(a=>a.id===item.actorId&&a.characterId===item.behavior.characterId))){
      setStatus('Los actores de la actuación montada cambiaron.');return;
    }
    const at=w.at??0;
    for(const {actorId,behavior} of items){
      const original=actorId===w.actorId?w.cueId:w.others?.find(a=>a.id===actorId)?.cueId;
      let cue=target.cues.find(c=>c.kind==='actor'&&c.actorId===actorId&&(original?c.id===original:c.at===at&&c.behavior?.id===behavior.id));
      if(cue?.kind!=='actor'){cue={id:uid(),kind:'actor',actorId,action:'idle',at,duration:behavior.duration};target.cues.push(cue);}
      cue.at=at;cue.duration=behavior.duration;cue.behavior=behavior;delete cue.expression;delete cue.clipName;
    }
    // La pareja guardada deja escrito quién monta a quién (antes solo se deducía por el nombre del personaje).
    const riderItem=items.find(i=>i.role==='rider'),horseItem=items.find(i=>i.role==='horse');
    const riderActor=riderItem&&targetScene.actors.find(a=>a.id===riderItem.actorId);
    if(riderActor&&horseItem){const trial=targetScene.actors.map(a=>a.id===riderActor.id?{...a,montura:{caballoId:horseItem.actorId}}:a);if(!mountProblem(trial.find(a=>a.id===riderActor.id)!,trial))riderActor.montura={caballoId:horseItem.actorId};}
    changeRef.current(next);setStatus('Actuaciones del caballo y del jinete actualizadas en la historia.');
  }
  // Antes de cerrar el Taller, lo pendiente de los dos talleres se lleva a la historia.
  const workshopFlush=useRef<(()=>Promise<void>)|null>(null);
  // El Taller lleva lo pendiente a la historia antes de cerrarse; si no puede, avisa y deja elegir (reintentar, seguir o
  // descartar y cerrar), y entonces es él quien llama a `onClose`. Ya no se cierra en silencio perdiendo el trabajo.
  const workshopClose=useRef<(()=>void)|null>(null);
  const closeWorkshop=()=>{const close=workshopRef.current?workshopClose.current:null;if(!close){setSceneLive(false);setWorkshop(null);return;}close();};
  /** Taller facial · vida en reposo: base del personaje en la escena, o cambio desde el momento abierto en el Taller. */
  function applyLife(vida:ActorLife|ActorLifeOverride|null,alcance:'escena'|'momento'){
    const w=workshopRef.current;if(!w)return;const next=structuredClone(projectRef.current),targetScene=next.scenes.find(s=>s.id===w.sceneId),person=targetScene?.actors.find(a=>a.id===w.actorId),target=targetScene?.sequences.find(s=>s.id===w.sequenceId);
    if(!targetScene||!person||!target){setStatus('El personaje o el momento cambió mientras se ajustaba su vida.');return;}
    if(alcance==='escena'){if(vida)person.vida=vida as ActorLife;else delete person.vida;}
    else{
      let cue=target.cues.find(c=>c.id===w.cueId&&c.kind==='actor');
      if(!cue&&vida){cue={id:uid(),kind:'actor',actorId:person.id,action:'idle',at:0,duration:1};target.cues.push(cue);setWorkshop(x=>x?{...x,cueId:cue!.id}:x);}
      if(cue?.kind==='actor'){if(vida)cue.vida=vida as ActorLifeOverride;else delete cue.vida;}
    }
    changeRef.current(next);setWorkshop(x=>x?{...x,...(alcance==='escena'?{vida:vida as ActorLife|null}:{vidaMomento:vida as ActorLifeOverride|null})}:x);
  }
  /** Taller facial · General: actuaciones de esta historia vueltas a hornear con una corrección. Devuelve cuántos cues cambian. */
  function replaceBehaviors(pairs:BehaviorReplacement[]){
    const next=structuredClone(projectRef.current),count=replaceBehaviorRefs(next,pairs);
    if(count){changeRef.current(next);setStatus(`${count} actuaciones de esta historia actualizadas con la corrección. Guarda la historia para conservarlas.`);}
    return count;
  }
  // Otra pestaña cambió en disco las actuaciones de ESTA historia (Taller facial › General): se aplican aquí también,
  // como un cambio más (se puede deshacer), para que el autoguardado de esta pestaña no las pise.
  const replaceBehaviorsRef=useRef(replaceBehaviors);
  useEffect(()=>{replaceBehaviorsRef.current=replaceBehaviors;});
  const openStoryId=historia.file.id;
  useEffect(()=>{
    if(typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(HISTORIAS_CHANNEL);
    channel.onmessage=event=>{const m=event.data as {type?:unknown;historiaId?:unknown;pares?:unknown};
      if(m?.type==='BEHAVIORS_REPLACED'&&m.historiaId===openStoryId&&Array.isArray(m.pares))replaceBehaviorsRef.current((m.pares as BehaviorReplacement[]).filter(p=>typeof p?.from==='string'&&isBehaviorReference(p.to)));};
    return()=>channel.close();
  },[openStoryId]);
  function chooseScenario(zoneId:string){
    if(zoneId===scene.zoneId)return;
    if(!scene.zoneId){framePending.current=scene.id;edit(copy=>{const target=copy.scenes.find(s=>s.id===scene.id)!;target.zoneId=zoneId;target.entryIds=[];});setStatus('Cargando el escenario elegido…');return;}const requestId=uid();scenarioRequest.current={requestId,sceneId:scene.id,oldZone:scene.zoneId};armScenarioTimeout(requestId);send('SCENARIO_INFO',{requestId,zoneId});setStatus('Preparando el escenario seleccionado…');
  }
  function replaceActorModel(characterId:string){
    if(!actor)return;
    const incompatible=scene.sequences.some(s=>s.cues.some(c=>c.kind==='actor'&&c.actorId===actor.id&&c.behavior&&c.behavior.characterId!==characterId));
    if(incompatible){setStatus('Este papel tiene actuaciones propias de su modelo. Añade el nuevo personaje para conservarlas.');return;}
    edit(copy=>{const target=copy.scenes.find(s=>s.id===scene.id)!.actors.find(a=>a.id===actor.id)!;if(target.name===characters.find(c=>c.id===target.characterId)?.label)target.name=characters.find(c=>c.id===characterId)?.label??target.name;target.characterId=characterId;});
    setStatus('Modelo cambiado para este papel. Se conservan posición, diálogos y acciones. Revisa sus clips en el Taller.');
  }
  function select(id: string) { setSequenceId(id); setSelectedCueId(null); setTab('moment'); setAnswer(''); }
  function addScene(){const id=uid(),first=uid();edit(copy=>copy.scenes.push({id,name:'Nueva escena',zoneId:scene.zoneId,actors:structuredClone(scene.actors),shot:structuredClone(scene.shot),entryIds:[...scene.entryIds],sequences:[{id:first,name:'Primer momento',duration:3,cues:[],gate:{kind:'continue',prompt:'Continuar'}}]}));select(first);setTab('scene');setFlowView('scenes');}
  function addMoment(){const id=uid();edit(copy=>copy.scenes.find(s=>s.id===scene.id)!.sequences.push({id,name:'Nuevo momento',duration:3,cues:[],gate:{kind:'continue',prompt:'Continuar'}}));select(id);setFlowView('moments');}
  /** Revisión de cámaras con el escenario (solo edición): el resultado se guarda con su clave de obsolescencia. */
  function auditCameras(){
    if(!connected||!ready){setStatus('El escenario todavía no está listo.');return;}
    const checks=buildCameraAudit(projectRef.current,scene.id);
    if(!checks.length){setCameraAuditNote('No hay cambios de cámara que revisar en esta escena.');return;}
    const requestId=uid();auditRequest.current={requestId,sceneId:scene.id,key:cameraAuditKey(scene),checks};setCameraAuditing(true);setCameraAuditNote(null);
    send('CAMERA_AUDIT',{requestId,checks:checks.map(c=>c.query)});
    window.setTimeout(()=>{if(auditRequest.current?.requestId===requestId){auditRequest.current=null;setCameraAuditing(false);setCameraAuditNote('El escenario no respondió a la revisión.');}},20000);
  }
  /** Director automático: calcula la propuesta, enseña qué cambiará y la aplica en un solo paso de deshacer. */
  function autoDirect(){
    apply(()=>{const proposal=proposeDirection(projectRef.current,scene.id,source,uid());return {proposal,...applyDirection(projectRef.current,proposal)};},({project:next,summary})=>{
      if(!summary.created&&!summary.replaced&&!summary.removed){setStatus('No hay diálogos nuevos que dirigir en esta escena.');return;}
      setConfirmation({title:`Proponer planos · ${scene.name}`,confirmLabel:'Aplicar planos',
        message:`${describeDirection(summary)}. Lo hecho o editado a mano no se toca, y lo que borraste a propósito no vuelve. Puedes deshacerlo con Ctrl + Z.`,
        run:()=>{change(next);setStatus('Planos propuestos aplicados. Revísalos en la pista «Cámara».');}});
    });
  }
  function toggleCameraLock(){
    const locking=!scene.cameraLocked;
    edit(copy=>{const target=copy.scenes.find(s=>s.id===scene.id)!;if(locking)target.cameraLocked=true;else delete target.cameraLocked;});
    if(locking){setCameraView('free');setPilotCamera(null);setStatus('Cámara del estudiante fijada. Muévete y acércate libremente: el recuadro naranja muestra lo que verá el estudiante.');}
    else setStatus('Cámara del estudiante desbloqueada: «Capturar plano» y «Pilotar» vuelven a cambiarla desde tu vista.');
  }
  function addCameraKey(){captureCamera(({shot})=>{const id=uid(),cue:Cue={id,kind:'camera',at:playbackRef.current.time,duration:1,label:'Plano de cámara',shot:{...shot,transition:1,easing:'easeInOut'}};const next=structuredClone(projectRef.current);next.scenes.find(s=>s.id===scene.id)!.sequences.find(s=>s.id===sequence.id)!.cues.push(cue);changeRef.current(next);setSelectedCueId(id);setTab('camera');setStatus('Plano añadido en el cabezal. Edita su posición, objetivo y suavizado.');});}
  /** Como capture, pero para escribir una cámara: respeta «Fijar cámara del estudiante». */
  function captureCamera(fn: (value: { shot: Shot; position: Vec3 }) => void) {
    if (scene.cameraLocked) { setStatus('La cámara del estudiante está fijada. Desbloquéala (candado sobre el visor) para cambiarla desde tu vista.'); return; }
    capture(fn);
  }
  function capture(fn: (value: { shot: Shot; position: Vec3 }) => void) {
    const id = uid(); requests.current.set(id, fn); send('CAPTURE', { requestId: id });
    window.setTimeout(() => { if (requests.current.delete(id)) setStatus('El escenario no respondió a la captura.'); }, 10000);
  }
  const repo = useCallback(() => createStudioRepository(window.localStorage, owner, projectRef.current.id), [owner]);
  /** El archivo de la historia tal como está ahora (lo que se guarda o se autoguarda). */
  const snapshot=useCallback((value:StudioProject=projectRef.current,src:StudioSource=sourceRef.current):HistoriaFile=>({...historia.file,name:historiaName,savedAt:new Date().toISOString(),revision:value.revision,source:src,project:{...value,name:historiaName},ui:{sequenceId,tab,flowView,panelWidths}}),[historia.file,historiaName,sequenceId,tab,flowView,panelWidths]);
  const autosave=useHistoriaAutosave(()=>snapshot(),dirty,project);
  // Grabaciones guardadas en la carpeta de la historia que falten en este navegador (otro equipo, caché borrada…).
  const audioRestored=useRef(false);
  const audioControlsRef=useRef(audioControls);useEffect(()=>{audioControlsRef.current=audioControls;});
  useEffect(()=>{
    if(audioRestored.current)return;audioRestored.current=true;
    const id=historia.file.id;
    void (async()=>{
      for(let i=0;i<40;i++){
        try{const rows=await downloadHistoriaAudio(id,audioControlsRef.current.assets);if(rows.length){await audioControlsRef.current.restoreAudio(rows);setStatus(`${rows.length} grabaciones recuperadas de la carpeta de la historia.`);}return;}
        catch(error){if(!(error instanceof Error&&/todavía no está lista/.test(error.message)))return;await new Promise(r=>setTimeout(r,250));}
      }
    })();
  },[historia.file.id]);
  useEffect(() => {
    const previous=director.current.snapshot(),sameSource=directorSourceId.current===source.storyVersionId;
    director.current = createStudioDirector(project, source);
    directorSourceId.current=source.storyVersionId;
    const index = sequenceList(project).findIndex(x => x.sequence.id === sequenceId);
    setPlayback(director.current.seek(Math.max(0, index),sameSource&&previous.stage.sequenceId===sequenceId?previous.time:0)); setReady(false);
  }, [project, source, sequenceId]);

  useEffect(() => {
    const bridge = createHostBridge({ service, expectedOrigin: origin, expectedSource: () => frame.current?.contentWindow ?? null, postToViewer: (message: HostReplyMessage, targetOrigin: string) => frame.current?.contentWindow?.postMessage(message, targetOrigin) });
    const helloTimer=window.setInterval(()=>send('HELLO'),1500);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const m = event.data;
      if (m?.channel !== 'spanstories.studio' || m.version !== 1) { void bridge.handle({ origin: event.origin, source: event.source, data: m }); return; }
      if(m.type==='CHARACTER_FILES_DROPPED'&&activeRef.current&&!studentRef.current&&Array.isArray(m.files)&&m.files.every((file:unknown)=>file instanceof File)&&Array.isArray(m.position)&&m.position.length===3&&m.position.every(Number.isFinite))void characterDrop.current(m.files,m.position,m.sceneId,m.zoneId);
      if(m.type==='CHARACTER_REGISTERED'||m.type==='CHARACTER_IMPORT_ERROR'){
        const pending=characterImports.current.get(m.requestId);characterImports.current.delete(m.requestId);
        if(m.type==='CHARACTER_REGISTERED')pending?.resolve();else pending?.reject(Error(m.message||'No se pudo preparar el personaje.'));
      }
      if (m.type === 'READY') {
        window.clearInterval(helloTimer);
        setConnected(true); setCharacters(Array.isArray(m.characters) ? m.characters : []); setEntries(Array.isArray(m.entries) ? m.entries : []);
        const currentScene=projectRef.current.scenes.find(s=>s.id===playbackRef.current.stage.sceneId);
        // Un READY repetido (reintento del motor) no vuelve a mandar toda la vida ambiental ni reescribe el estado.
        if(!m.repeat){lifeSent.current.clear();sendLives(projectRef.current);}
        if(currentScene&&(hostZoneRef.current===undefined||currentScene.zoneId===hostZoneRef.current))send('STAGE', { requestId: uid(), stage: { ...playbackRef.current.stage, zoneId: currentScene.zoneId, entryIds: currentScene.entryIds, ambient: currentScene.ambient }, student: studentRef.current, allowLook: projectRef.current.navigation.allowLook });
        if(!m.repeat)setStatus('Escenario conectado · elige un momento para dirigirlo.');
        if(currentScene&&framePending.current===currentScene.id&&currentScene.zoneId){framePending.current=null;const requestId=uid();scenarioRequest.current={requestId,sceneId:currentScene.id,oldZone:currentScene.zoneId,fresh:true};armScenarioTimeout(requestId);send('SCENARIO_INFO',{requestId,zoneId:currentScene.zoneId});}
        adoptRef.current();
      }
      if (m.type === 'STAGE_READY' && m.sequenceId === playbackRef.current.stage.sequenceId) { setReady(true); }
      if(m.type==='CHARACTER_READY'&&typeof m.characterId==='string'&&Array.isArray(m.animations)){setCharacterClips(old=>({...old,[m.characterId]:m.animations.filter((v:unknown)=>typeof v==='string')}));if(typeof m.modelUrl==='string')setCharacterModels(old=>({...old,[m.characterId]:m.modelUrl}));}
      if(m.type==='READY'){
        if(Array.isArray(m.zones))setScenarios(m.zones.filter((z:{id?:unknown;label?:unknown})=>typeof z.id==='string'&&typeof z.label==='string'));
        if(Array.isArray(m.characters))setCharacterModels(old=>({...old,...Object.fromEntries(m.characters.filter((c:{id?:unknown;modelUrl?:unknown})=>typeof c.id==='string'&&typeof c.modelUrl==='string').map((c:{id:string;modelUrl:string})=>[c.id,c.modelUrl]))}));
      }
      if(m.type==='SCENARIO_INFO'&&scenarioRequest.current?.requestId===m.requestId&&typeof m.error==='string'){scenarioRequest.current=null;adoptShot.current=null;setStatus('No se pudo cambiar el escenario: '+m.error);return;}
      // Con el foco dentro del escenario, el motor reenvía Esc y Ctrl+S/O/Z/Y: se tratan como atajos del Estudio.
      if(m.type==='KEY'&&typeof m.key==='string'){keyHandler.current(new KeyboardEvent('keydown',{key:m.key,ctrlKey:!!m.ctrlKey,metaKey:!!m.metaKey,shiftKey:!!m.shiftKey,altKey:!!m.altKey}));return;}
      if(m.type==='PATHS_ERROR'&&typeof m.message==='string'){setStatus('Caminos: '+m.message);return;}
      // «Pilotar cámara»: cada gesto de navegación actualiza la pose de reposo de la cámara (un paso de deshacer).
      if(m.type==='PILOT_VIEW'&&typeof m.cameraId==='string'&&m.shot&&!studentRef.current){
        const owner=projectRef.current.scenes.find(s=>s.cameras?.some(c=>c.id===m.cameraId));
        if(owner)try{changeRef.current(editCamera(projectRef.current,owner.id,m.cameraId,c=>{c.base={...(m.shot as Shot),transition:0};}));}catch(error){setStatus(error instanceof Error?error.message:'No se pudo pilotar la cámara.');}
        return;
      }
      if(m.type==='CAMERA_AUDITED'&&auditRequest.current?.requestId===m.requestId){
        const pending=auditRequest.current!;auditRequest.current=null;setCameraAuditing(false);
        if(typeof m.error==='string'){setCameraAuditNote('No se pudo revisar: '+m.error);return;}
        const warnings:CameraAuditWarning[]=readCameraAudit(pending.checks,Array.isArray(m.results)?m.results:[]);
        const copy=structuredClone(projectRef.current),target=copy.scenes.find(s=>s.id===pending.sceneId);
        if(!target||cameraAuditKey(target)!==pending.key){setCameraAuditNote('La escena cambió durante la revisión; vuelve a revisarla.');return;}
        target.cameraAudit={key:pending.key,at:new Date().toISOString(),warnings};
        changeRef.current(copy);
        setCameraAuditNote(`${warnings.length?`${warnings.length} ${warnings.length===1?'aviso':'avisos'} en las comprobaciones`:'Sin problemas'}${m.colliders?'':' · este escenario no ofrece colisiones: no se comprobaron paredes'}.`);
        return;
      }
      if(m.type==='SCENARIO_INFO'&&scenarioRequest.current?.requestId===m.requestId){
        const pending=scenarioRequest.current;scenarioRequest.current=null;
        const next=structuredClone(projectRef.current),target=next.scenes.find(s=>s.id===pending?.sceneId);
        if(pending&&target&&target.zoneId===pending.oldZone&&m.zoneId&&Array.isArray(m.spawn)&&m.shot){
          const base=target.actors[0]?.position??target.shot.target,delta=m.spawn.map((v:number,i:number)=>v-base[i]) as unknown as Vec3;
          // Todo lo situado (actores, planos, destinos, caminos y puntos de vida) se desplaza; los objetos tocables del lugar anterior se retiran.
          const moved=moveSceneToZone(next,target.id,m.zoneId,delta),movedScene=moved.project.scenes.find(s=>s.id===target.id)!;
          const applyShot=(shot:Shot)=>{movedScene.shot=shot;movedScene.sequences.forEach(s=>s.cues.forEach(c=>{if(c.kind==='camera'&&c.at===0)c.shot=shot;}));};
          if(pending.fresh)applyShot({...m.shot,transition:0} as Shot);
          else if(adoptShot.current){const shot=adoptShot.current;adoptShot.current=null;applyShot(shot);}
          const before=projectRef.current;changeRef.current(moved.project);
          // Si el cambio no es válido, `change` ya mostró el motivo: no se anuncia un cambio que no ocurrió.
          if(projectRef.current!==before){
            const notes=[moved.convertedGates?`${moved.convertedGates} espera(s) de «Tocar un objeto» pasan a «Continuar»`:'',moved.droppedLifeRecording?'la vida ambiental grabada era del lugar anterior: vuelve a grabarla':''].filter(Boolean).join(' · ');
            setStatus((pending.fresh?'Escenario cargado · la cámara mira la entrada del lugar.':'Escenario cambiado para esta escena. Se conservaron personajes, diálogos, acciones y caminos; revisa cámaras y objetos tocables.')+(notes?' · '+notes:''));
          }
        }
      }
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
      // Un punto de camino arrastrado o elegido en el escenario.
      if((m.type==='PATH_POINT'||m.type==='PATH_POINT_SELECTED')&&typeof m.cueId==='string'&&Number.isInteger(m.index)&&m.index>=0){
        if(m.type==='PATH_POINT'&&Array.isArray(m.position)&&m.position.length===3&&m.position.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))){
          const next=structuredClone(projectRef.current),cue=sequenceList(next).flatMap(x=>x.sequence.cues).find(c=>c.id===m.cueId);
          if(cue?.kind==='actor'){
            const count=cue.path?.length??0;
            if(m.index<count)cue.path![m.index]=m.position;else if(cue.destination)cue.destination=m.position;
            changeRef.current(next);setStatus(m.index<count?'Punto del camino movido.':'Destino de la caminata movido.');
          }
        }
        setSelectedCueId(m.cueId);setPathPoint({cueId:m.cueId,index:m.index});
      }
      if(m.type==='PICKED'&&typeof m.requestId==='string'){
        const handler=pickHandlers.current.get(m.requestId);pickHandlers.current.delete(m.requestId);
        setPicking(current=>current?.requestId===m.requestId?null:current);
        if(!m.cancelled)handler?.(m);
      }
      if (m.type === 'ERROR') { setReady(false); setStatus(typeof m.message === 'string' ? m.message : 'No se pudo preparar el momento.'); setPlayback(director.current.pause()); }
      if (m.type === 'CAPTURED') { const pending = requests.current.get(m.requestId); requests.current.delete(m.requestId); pending?.({ shot: m.shot, position: m.position }); }
      if (m.type === 'ACTOR_SELECTED' && typeof m.actorId === 'string' && !studentRef.current) { setActorId(m.actorId); setTab('actors'); }
      if (m.type === 'PLACED') {
        const next = structuredClone(projectRef.current); const a = next.scenes.flatMap(s => s.actors).find(a => a.id === m.actorId);
        const holder = next.scenes.find(s => s.actors.some(x => x.id === m.actorId));
        if (a && holder) { placeActor(holder.actors, a.id, { position: m.position }); changeRef.current(next); const horse = a.montura && holder.actors.find(x => x.id === a.montura!.caballoId); setStatus(horse ? `${a.name} recolocado; sigue montado en ${horse.name}.` : riderOf(holder.actors, a.id) ? `Personaje colocado; ${riderOf(holder.actors, a.id)!.name} va con él.` : 'Personaje colocado en el escenario.'); }
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
  }, [origin, send, service, frame, sendLives]);

  useEffect(() => { if (connected) sendLives(project); }, [connected, project, sendLives]);

  useEffect(() => {
    if (!connected) return;
    const currentScene = project.scenes.find(s => s.id === playback.stage.sceneId)!;
    if(!currentScene)return;
    // Con motor compartido no se dirige una escena de otra zona: primero se adopta o se carga esa zona.
    if(host&&currentScene.zoneId!==hostZone)return;
    service.setScene?.(student ? currentScene.entryIds : [], source.storyVersionId);
    // Al reproducir, el motor recibe los próximos fotogramas y mueve cámara y actores a su propia frecuencia.
    const track = playback.state === 'playing' ? director.current.lookahead(.3, .05) : null;
    send('STAGE', { requestId: uid(), stage: { ...playback.stage, zoneId: currentScene.zoneId, entryIds: currentScene.entryIds, ambient: currentScene.ambient, variantId: currentScene.variantId }, student, playing: playback.state === 'playing', waiting: playback.state === 'waiting', allowLook: project.navigation.allowLook, view: cameraView, inset: studentInset, ...(track && track.frames.length >= 2 ? { track } : {}) });
  }, [connected, playback, project, send, service, source, student, host, hostZone, cameraView, studentInset]);

  // Se ejecuta al conectar el puente (READY): adopta el lugar del Editor en vez de cargar otra zona.
  useEffect(()=>{adoptRef.current=()=>{
    if(!adoptPending.current||!hostZone)return;
    adoptPending.current=false;
    if(scene.zoneId===hostZone||!scene.zoneId)return;
    const same=project.scenes.find(s=>s.zoneId===hostZone);
    if(same){select(same.sequences[0].id);setStatus(`Estudio sobre el lugar del Editor · escena «${same.name}».`);}
    else capture(({shot})=>{adoptShot.current=shot;chooseScenario(hostZone);});
  };});

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

  // Cambio de lugar: el motor único (EngineStage) cambia de zona sin recargar; solo se cancela una selección pendiente.
  const [pickZone, setPickZone] = useState(scene.zoneId);
  if (pickZone !== scene.zoneId) { setPickZone(scene.zoneId); setPicking(null); }
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
  function removeScene() {
    if (project.scenes.length === 1) { setStatus('La historia necesita al menos una escena.'); return; }
    const neighbour = project.scenes[sceneIndex + 1] ?? project.scenes[sceneIndex - 1];
    const incoming = incomingReferences(project, scene.sequences.map(s => s.id));
    setConfirmation({ title: `Eliminar la escena «${scene.name}»`, confirmLabel: 'Eliminar escena',
      message: `Se borrarán ${scene.sequences.length} momentos y ${scene.actors.length} personajes de esta escena.${incoming.length ? ` ${incoming.length} camino(s) desde otras escenas dejarán de apuntar aquí.` : ''} Puedes deshacerlo con Ctrl + Z.`,
      run: () => apply(() => deleteScene(project, scene.id), next => { change(next); select(neighbour.sequences[0].id); setStatus('Escena eliminada.'); }) });
  }
  /** Vincula (o suelta) un jinete con su montura. Al montar, el jinete se coloca donde está su montura. */
  function setMount(riderId: string, horseId: string | null) {
    edit(copy => {
      const actors = copy.scenes.find(s => s.id === scene.id)!.actors, rider = actors.find(a => a.id === riderId), horse = actors.find(a => a.id === horseId);
      if (!rider) return;
      if (!horse) { delete rider.montura; return; }
      const trial = actors.map(a => a.id === rider.id ? { ...a, montura: { caballoId: horse.id } } : a);
      const problem = mountProblem(trial.find(a => a.id === rider.id)!, trial);
      if (problem) { setStatus(problem); return; }
      rider.montura = { caballoId: horse.id };
      if (Math.hypot(rider.position[0] - horse.position[0], rider.position[2] - horse.position[2]) > .75) { rider.position = [...horse.position] as unknown as Vec3; rider.rotation = horse.rotation; }
    });
    setStatus(horseId ? 'Jinete vinculado: se mueve con su montura.' : 'El personaje va a pie.');
  }
  function removeActor(actorId: string) {
    const target = scene.actors.find(a => a.id === actorId); if (!target) return;
    const cues = scene.sequences.flatMap(s => s.cues).filter(c => c.kind === 'actor' && c.actorId === actorId).length;
    const lines = scene.sequences.flatMap(s => s.cues).filter(c => c.kind === 'dialogue' && c.speakerId === actorId).length;
    setConfirmation({ title: `Quitar a ${target.name}`, confirmLabel: 'Quitar personaje',
      message: `Se borrarán sus ${cues} actuaciones${lines ? ` y sus ${lines} intervenciones pasarán al narrador` : ''}. Puedes deshacerlo con Ctrl + Z.`,
      run: () => apply(() => deleteActor(project, scene.id, actorId), next => { change(next); setActorId(null); setStatus(`${target.name} ya no está en la escena.`); }) });
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
  /** Camino punto a punto: cada clic en el suelo añade un punto, hasta pulsar Cancelar o Esc. */
  function drawWalkPath(cueId: string) {
    const again = () => startPick('point', 'Camino: haz clic en el suelo para añadir cada punto. Pulsa Cancelar (Esc) al terminar; después puedes arrastrar los puntos.', m => {
      if (!m.position) return;
      const position = m.position;
      const next = structuredClone(projectRef.current), cue = sequenceList(next).flatMap(x => x.sequence.cues).find(c => c.id === cueId);
      if (cue?.kind !== 'actor') return;
      if ((cue.path?.length ?? 0) >= 64) { setStatus('El camino ya tiene el máximo de 64 puntos.'); return; }
      cue.path = [...(cue.path ?? []), position]; changeRef.current(next);
      setPathPoint({ cueId, index: cue.path.length - 1 }); setStatus(`Punto ${cue.path.length} del camino añadido.`);
      again();
    });
    again();
  }
  function frameActor(actorId: string, shotType: string) {
    const target = scene.actors.find(a => a.id === actorId); if (!target) return;
    // Como en la versión local: el encuadre fija el plano del momento desde su inicio.
    focusPending.current = { sequenceId: sequence.id, at: 0, actorName: target.name };
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
  /** Guarda en disco (Estudio/Historias/<id>/historia.json) con sus grabaciones. */
  async function save(override?:{project:StudioProject;source:StudioSource}):Promise<boolean>{
    if(saving)return false;setSaving(true);
    try{
      const value=override?.project??projectRef.current,src=override?.source??sourceRef.current;
      validateProject(value,src);
      const audio=await uploadHistoriaAudio(historia.file.id,value,audioControls.assets);
      const {historia:saved}=await historiasApi.save(snapshot({...value,revision:savedRevision.current??0},src),savedRevision.current);
      savedRevision.current=saved.revision;setBackupCount(Math.min(3,saved.revision));setSavedAt(saved.savedAt);
      // Si se editó mientras se guardaba, se conserva lo nuevo (queda pendiente de guardar) y solo se adopta la revisión.
      const editedMeanwhile=JSON.stringify(projectRef.current)!==JSON.stringify(value);
      if(editedMeanwhile){const latest={...projectRef.current,revision:saved.project.revision};projectRef.current=latest;setProject(latest);}
      else setProject(saved.project);
      setSavedSignature(JSON.stringify(saved.project));setHistoriaSnapshot(saved.source);
      clearMirror(historia.file.id);autosave.reset();
      setStatus(`Historia guardada · revisión ${saved.revision} · Estudio/Historias/${historia.file.id}`+(audio.missing?` · Atención: faltan ${audio.missing} grabación(es) que no están en este navegador ni en disco; vuelve a importarlas.`:''));
      return true;
    }catch(error){
      setStatus(error instanceof Error?error.message:'No se pudo guardar.');
      // Conflicto con otra pestaña (LEEME: «se ofrece Guardar como…»): se ofrece de verdad, sin perder lo actual.
      const conflict=(error as {status?:number}).status===409&&typeof (error as {revision?:unknown}).revision!=='undefined';
      if(conflict&&window.confirm('Esta historia se guardó desde otra pestaña.\n\n¿Guardar tus cambios como una historia nueva («Guardar como…»)? La otra versión no se toca.'))window.setTimeout(()=>void saveAs(),0);
      return false;
    }
    finally{setSaving(false);}
  }
  /** «Guardar como…»: una historia nueva con todo lo actual; la original queda como estaba en disco. */
  async function saveAs(){
    const name=window.prompt('Nombre de la nueva historia',historiaName+' (copia)')?.trim();if(!name)return;
    try{
      const copy=copyHistoria(snapshot(),name);
      await uploadHistoriaAudio(copy.id,copy.project,audioControls.assets);
      const {historia:created}=await historiasApi.create(copy);
      onOpenHistoria({file:created,saved:created,recovered:false});
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo guardar como.');}
  }
  /** Volver al menú: lo que no se guardó queda en el autoguardado y se ofrece al volver a abrir. */
  async function closeToMenu(){ setFileMenu(false); if(dirty)await autosave.now(); onCloseHistoria(); }
  async function revert(){
    setFileMenu(false);
    try{
      const r=await historiasApi.open(historia.file.id),saved=r.historia;
      if(!saved){setStatus('Esta historia aún no tiene un guardado al que volver.');return;}
      setConfirmation({title:'Volver al último guardado',message:`Se descartan los cambios hechos desde el ${new Date(saved.savedAt).toLocaleString('es-ES')}. El autoguardado se aparta en su carpeta, sin borrarlo.`,confirmLabel:'Volver al guardado',run:()=>{void historiasApi.discard(historia.file.id).catch(()=>{});clearMirror(historia.file.id);onOpenHistoria({file:saved,saved,recovered:false});}});
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo leer el guardado.');}
  }
  async function openBackup(n:number){
    setFileMenu(false);
    try{
      const [{historia:copy},{historia:saved}]=await Promise.all([historiasApi.copy(historia.file.id,n),historiasApi.open(historia.file.id)]);
      if(!copy){setStatus('No hay un guardado anterior número '+n+'.');return;}
      const revision=saved?.revision??copy.revision;
      setConfirmation({title:'Abrir un guardado anterior',message:`Se abrirá la versión guardada el ${new Date(copy.savedAt).toLocaleString('es-ES')}. Quedará como cambio sin guardar: guarda para conservarla.`,confirmLabel:'Abrir esa versión',run:()=>onOpenHistoria({file:{...copy,revision,project:{...copy.project,revision}},saved,recovered:true})});
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo abrir la copia.');}
  }
  async function publish() {
    if(publishing)return;setPublishing(true);
    let privateMedia:StudioMediaRepository|null=null,publicMedia:StudioMediaRepository|null=null;
    try {
      if(source.status!=='PUBLISHED'||!source.blueprintId)throw new Error('El ensayo puede guardarse y previsualizarse. Para publicar se necesita una versión curricular aprobada del Story Engine.');
      if(dirty)throw new Error('Guarda la puesta en escena antes de publicar.');
      const ids=new Set(project.scenes.flatMap(s=>s.sequences.flatMap(q=>q.cues.flatMap(c=>(c.kind==='dialogue'||c.kind==='sound')&&c.audioUrl?localAudioId(c.audioUrl)??[]:[]))));
      if(ids.size){privateMedia=new StudioMediaRepository(owner);publicMedia=new StudioMediaRepository('published');for(const id of ids){const asset=await privateMedia.get(id);if(!asset)throw new Error('Falta un archivo de audio de la historia.');await publicMedia.save(asset);}}
      const record=repo().load(source),pinned={...structuredClone(project),revision:record?.revision??0};
      const engineWindow=(host?.frame.current??frame.current)?.contentWindow;
      if(!engineWindow)throw Error('El escenario todavía no está conectado.');
      const current=await new Promise<{zoneId:string;dirty:boolean;revision:string;baseRevision:string|null}>((resolve,reject)=>{
        const requestId=uid();
        const timer=window.setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('No se pudo comprobar el guardado del escenario.'));},10000);
        function receive(event:MessageEvent){if(event.source!==engineWindow||event.origin!==new URL(viewerUrl).origin||event.data?.channel!=='spanstories.engine'||event.data?.type!=='PROJECT_STATUS_RESULT'||event.data.requestId!==requestId)return;window.clearTimeout(timer);window.removeEventListener('message',receive);resolve(event.data);}
        window.addEventListener('message',receive);engineWindow.postMessage({channel:'spanstories.engine',version:1,type:'PROJECT_STATUS',requestId},new URL(viewerUrl).origin);
      });
      if(current.dirty)throw Error('Guarda la edición del escenario en el Editor antes de publicar la historia.');
      for(const scene of pinned.scenes){
        if(scene.zoneId===current.zoneId){scene.worldVersion={baseRevision:current.baseRevision,revision:current.revision};continue;}
        const response=await fetch('/api/city-projects?zone='+encodeURIComponent(scene.zoneId),{cache:'no-store'}),version=await response.json();
        if(!response.ok)throw Error(version.error||'No se pudo fijar la versión del escenario.');
        scene.worldVersion={baseRevision:version.baseRevision,revision:version.revision};
      }
      const saved=repo().save(pinned,source);
      const release = repo().publish(saved, source, uid(), new Date().toISOString());storePublishedPresentation(window.localStorage,release,source);setReleaseId(release.id);
      // Las versiones fijadas del escenario también quedan en el archivo de la historia.
      await save({project:{...saved,revision:project.revision},source});
      setStatus('Publicación local lista · versiones del escenario fijadas desde disco · historia guardada.');
    }catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo publicar.'); }
    finally{await Promise.allSettled([privateMedia?.close(),publicMedia?.close()]);setPublishing(false);}
  }
  function addCharacter(characterId: string, name: string) {
    // Sin escenario todavía: el personaje se añade ya (los talleres no necesitan el escenario) y se coloca después.
    if (!connected) {
      const id = uid(); const next = structuredClone(projectRef.current); const current = next.scenes.find(s => s.id === scene.id)!;
      current.actors.push({ id, characterId, name, position: [0, 0, 0], rotation: 0, height: 1.72 }); change(next); setActorId(id); setTab('actors');
      setStatus(name + ' añadido. Ya puedes abrir el Taller; colócalo en el escenario cuando termine de cargar.');
      return;
    }
    capture(({ position }) => {
      const id = uid(); const next = structuredClone(projectRef.current); const current = next.scenes.find(s => s.id === scene.id)!;
      current.actors.push({ id, characterId, name, position, rotation: 0, height: 1.72 }); change(next); setActorId(id); setTab('actors');
      send('PLACE', { actorId: id }); setStatus('Haz clic en el suelo para colocar a ' + name + '.');
    });
  }
  async function importDroppedCharacters(files:File[],position:Vec3,sceneId:string,zoneId:string){
    if(importingCharacters.current){setStatus('Espera a que termine la importación de personajes.');return;}
    importingCharacters.current=true;
    const projectId=projectRef.current.id,storyVersionId=sourceRef.current.storyVersionId;
    const failures:string[]=[];let added=0;
    try{
      for(const file of files){
        try{
          if(!/\.glb$/i.test(file.name)||!file.size||file.size>100*1024*1024)throw Error('Se necesita un GLB de hasta 100 MB.');
          const current=projectRef.current.scenes.find(s=>s.id===sceneId);
          if(!activeRef.current||studentRef.current||projectRef.current.id!==projectId||sourceRef.current.storyVersionId!==storyVersionId||playbackRef.current.stage.sceneId!==sceneId||current?.zoneId!==zoneId)throw Error('La escena cambió. Vuelve a soltar el personaje en la escena que quieres editar.');
          if(current.actors.length>=20)throw Error('La escena admite hasta 20 personajes.');
          setStatus('Importando personaje: '+file.name+'…');
          const response=await fetch('/api/studio-characters?name='+encodeURIComponent(file.name),{method:'POST',body:file});
          const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo guardar el personaje.');
          setCharacters(old=>old.some(c=>c.id===data.character.id)?old:[...old,{id:data.character.id,label:data.character.label}]);
          setCharacterModels(old=>({...old,[data.character.id]:data.modelUrl}));
          if(!activeRef.current||studentRef.current||projectRef.current.id!==projectId||sourceRef.current.storyVersionId!==storyVersionId||playbackRef.current.stage.sceneId!==sceneId)throw Error('Personaje guardado en la biblioteca. La escena cambió durante la importación; añádelo desde Personajes.');
          await new Promise<void>((resolve,reject)=>{
            const requestId=uid(),timer=window.setTimeout(()=>{characterImports.current.delete(requestId);reject(Error('No se pudo preparar el personaje a tiempo. Sigue guardado en la biblioteca.'));},120000);
            characterImports.current.set(requestId,{resolve:()=>{window.clearTimeout(timer);resolve();},reject:error=>{window.clearTimeout(timer);reject(error);}});
            send('REGISTER_CHARACTER',{requestId,character:data.character});
          });
          const next=structuredClone(projectRef.current),target=next.scenes.find(s=>s.id===sceneId);
          if(!activeRef.current||studentRef.current||sourceRef.current.storyVersionId!==storyVersionId||next.id!==projectId||playbackRef.current.stage.sceneId!==sceneId||target?.zoneId!==zoneId)throw Error('Personaje guardado en la biblioteca; añádelo a la escena elegida.');
          if(target.actors.length>=20)throw Error('La escena admite hasta 20 personajes.');
          const id=uid();target.actors.push({id,characterId:data.character.id,name:data.character.label,position:[...position],rotation:0,height:1.72});
          validateProject(next,sourceRef.current);changeRef.current(next);projectRef.current=next;setActorId(id);setTab('actors');added++;
        }catch(error){failures.push(file.name+': '+(error instanceof Error?error.message:'No se pudo importar.'));}
      }
      setStatus((added?`${added} personaje(s) añadido(s) donde los soltaste. Guarda la historia para conservar su colocación. `:'')+failures.join(' · '));
    }finally{importingCharacters.current=false;}
  }
  characterDrop.current=importDroppedCharacters;
  // Añade GLB a la biblioteca de personajes sin colocarlos en ninguna escena (selector de archivos o arrastre sobre «+»).
  async function importLibraryCharacters(files:File[]){
    if(studentRef.current)return;
    if(importingCharacters.current){setStatus('Espera a que termine la importación de personajes.');return;}
    const glbs=files.filter(f=>/\.glb$/i.test(f.name));
    if(!glbs.length){setStatus(files.length?'Solo se pueden añadir archivos GLB.':'No se eligió ningún archivo.');return;}
    importingCharacters.current=true;
    const failures:string[]=[];const names:string[]=[];
    try{
      for(const file of glbs){
        try{
          if(!file.size||file.size>100*1024*1024)throw Error('Se necesita un GLB de hasta 100 MB.');
          setStatus('Importando personaje: '+file.name+'…');
          const response=await fetch('/api/studio-characters?name='+encodeURIComponent(file.name),{method:'POST',body:file});
          const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo guardar el personaje.');
          setCharacters(old=>old.some(c=>c.id===data.character.id)?old:[...old,{id:data.character.id,label:data.character.label}]);
          setCharacterModels(old=>({...old,[data.character.id]:data.modelUrl}));
          names.push(data.character.label);
          if(connected&&activeRef.current){
            // El motor lo prepara en segundo plano: si tarda, el personaje ya está guardado en la biblioteca.
            await new Promise<void>(resolve=>{
              const requestId=uid(),timer=window.setTimeout(()=>{characterImports.current.delete(requestId);resolve();},120000);
              characterImports.current.set(requestId,{resolve:()=>{window.clearTimeout(timer);resolve();},reject:()=>{window.clearTimeout(timer);resolve();}});
              send('REGISTER_CHARACTER',{requestId,character:data.character});
            });
          }
        }catch(error){failures.push(file.name+': '+(error instanceof Error?error.message:'No se pudo importar.'));}
      }
      setStatus((names.length?`${names.join(', ')} añadido(s) a Personajes. `:'')+failures.join(' · '));
    }finally{importingCharacters.current=false;}
  }
  async function browseLibraryCharacters(){
    try{
      const picked=await pickCharacterFiles();
      if(picked===null){libraryFileInput.current?.click();return;}
      if(picked.length)await importLibraryCharacters(picked);
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo abrir el selector de archivos.');}
  }
  async function pickCharacterFolder(){
    try{const name=await chooseCharacterFolder();if(name){setCharacterFolder(name);setStatus('Carpeta de personajes: '+name+'. El botón + se abrirá siempre ahí.');}}
    catch(error){setStatus(error instanceof Error?error.message:'No se pudo elegir la carpeta.');}
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
    if (kind === 'camera') { const at = nextCueStart(sequence, 'camera', playhead); captureCamera(({ shot }) => { editSequence(s => s.cues.push({ ...base, at, kind, shot, label: `Plano ${s.cues.filter(c => c.kind === 'camera').length + 1}` })); setSelectedCueId(base.id); }); return; }
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
    // Transición de luz: por defecto un anochecer de 8 s desde la luz que haya en ese instante.
    if (kind === 'light') editSequence(s => s.cues.push({ ...base, duration: 8, at: nextCueStart(s, 'light', playhead), kind, light: { ...LIGHT_PRESETS.anochecer.light }, easing: 'easeInOut', label: LIGHT_PRESETS.anochecer.label }));
    setSelectedCueId(base.id);
  }
  function chooseSource(id: string) {
    if (dirty) { setStatus('Guarda el borrador actual antes de elegir otra Story.'); return; }
    selectionTouched.current=true;
    const nextSource = catalog.find(s => s.storyVersionId === id);
    if(!nextSource){setStatus('Esa Story ya no está en el archivo de historias; elige otra.');return;}
    const initial={...initialDirection(nextSource,rehearsal),id:project.id,revision:project.revision};
    if(project.scenes[0])initial.scenes[0]={...initial.scenes[0],zoneId:project.scenes[0].zoneId,shot:structuredClone(project.scenes[0].shot),entryIds:[]};
    try { validateProject(initial,nextSource); setSourceId(id); setProject(initial); setSequenceId(initial.scenes[0].sequences[0].id); setHistory([]); setFuture([]); setReleaseId(null); setStatus('Story vinculada a esta historia. Cambio sin guardar: pulsa Guardar para conservarlo.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo abrir.'); }
  }
  function exportProject() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${project.id}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportPackage(){
    setTransferring(true);
    try{
      const archive=await packStudio(project,source,fetch,audioControls.assets),blob=new Blob([JSON.stringify(archive)],{type:'application/json'});if(blob.size>128*1024*1024)throw Error('El paquete supera los 128 MB.');const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=`${project.id}.studio.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus(`Paquete exportado: ${archive.behaviors.length} actuaciones y ${archive.audio.length} grabaciones incluidas. Los escenarios y modelos se reutilizan desde sus bibliotecas.`);
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo crear el paquete.');}
    finally{setTransferring(false);}
  }
  async function importPackage(file:File){
    setTransferring(true);
    try{
      if(file.size>128*1024*1024)throw Error('El paquete supera los 128 MB.');
      const checked=await inspectStudioPackage(JSON.parse(await file.text()),source),urls=new Map<string,string>();
      for(const entry of checked.behaviors){
        const response=await fetch('/api/studio-behaviors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry.asset)}),result=await response.json();
        if(!response.ok)throw Error(result.error||'No se pudo restaurar una actuación.');urls.set(entry.reference.url,result.url);
      }
      const restored=relinkBehaviors(checked.project,urls);restored.id=project.id;restored.revision=project.revision;
      validateProject(restored,source);await audioControls.restoreAudio(checked.audio);
      change(restored);setSequenceId(restored.scenes[0].sequences[0].id);setSelectedCueId(null);setTransferOpen(false);
      setStatus('Paquete abierto sin depender del Taller para reproducir sus actuaciones. Cambio sin guardar; puedes deshacerlo. Se conservan los modelos y escenarios de las bibliotecas.');
    }catch(error){setStatus(error instanceof Error?error.message:'No se pudo abrir el paquete.');}
    finally{setTransferring(false);}
  }
  async function saveEditorial(){
    if(!editorial||!sourceRepository.current||editing)return;
    if(editorial.text===source.sentences.find(s=>s.id===editorial.sentenceId)?.text){setEditorial(null);return;}
    setEditing(true);
    try{
      const next=await reviseDialogue({repository:sourceRepository.current,source,project,sentenceId:editorial.sentenceId,text:editorial.text});
      selectionTouched.current=true;
      setLocalSources(old=>[...old,next.source]);setSourceId(next.source.storyVersionId);setHistory([]);setFuture([]);setReleaseId(null);
      // La historia conserva su identidad: solo cambia la versión de la Story que dirige.
      const directed={...next.project,id:project.id,revision:project.revision};
      setHistoriaSnapshot(next.source);setProject(directed);
      if(await save({project:directed,source:next.source}))setStatus('Texto nuevo guardado en la historia. La versión anterior de la Story se conserva.');
      setEditorial(null);
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
    // El Estudio sigue montado (oculto) en el Editor y el Generador: sus atajos solo actúan cuando está delante.
    if (!activeRef.current || student || e.defaultPrevented || scriptOpen || confirmation || editorial || soundPicker) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 's') { e.preventDefault(); if (e.shiftKey) void saveAs(); else void save(); return; }
    if (mod && key === 'o') { e.preventDefault(); void closeToMenu(); return; }
    if (typing) return;
    if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (mod && key === 'd') { e.preventDefault(); if (explicitCue) copyCue(explicitCue.id); return; }
    if (mod || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); play(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && explicitCue) { e.preventDefault(); removeCue(explicitCue.id); return; }
    if (e.key === 'Escape') { send('CANCEL_PLACE'); if (picking) cancelPick(); else setSelectedCueId(null); setShortcutsOpen(false); return; }
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

  return <div className={`${styles.studio} ${toolbar ? styles.inShell : ''} ${student ? styles.studentMode : ''} ${focusMode?styles.focusMode:''} ${objectOpen?styles.objectOpen:''}`} style={{ '--timeline-size': showTime ? '156px' : '0px','--dock-size': showTime ? '336px' : '95px','--library-width':panelWidths.library+'px','--inspector-width':panelWidths.inspector+'px' } as CSSProperties}>
    {toolbar?(active&&createPortal(<div className={styles.headerActions+' '+styles.toolbar}><span className={styles.fileWrap}><button className={styles.fileButton} aria-haspopup="menu" aria-expanded={fileMenu} onClick={()=>setFileMenu(!fileMenu)} title="Archivo: guardar, abrir, recuperar">Archivo ▾</button>{fileMenu&&<><div className={styles.fileShade} onClick={()=>setFileMenu(false)}/><div className={styles.fileMenu} role="menu"><button role="menuitem" onClick={()=>void closeToMenu()}>Abrir otra historia…<kbd>Ctrl O</kbd></button><button role="menuitem" onClick={()=>void closeToMenu()}>Nueva historia…</button><hr/><button role="menuitem" disabled={saving||student} onClick={()=>{setFileMenu(false);void save();}}>Guardar<kbd>Ctrl S</kbd></button><button role="menuitem" disabled={student} onClick={()=>{setFileMenu(false);void saveAs();}}>Guardar como…<kbd>Ctrl Mayús S</kbd></button><button role="menuitem" disabled={!dirty||!savedAt} onClick={()=>void revert()}>Volver al último guardado</button><hr/><span className={styles.fileLabel}>Recuperar</span><button role="menuitem" disabled={backupCount<1} onClick={()=>void openBackup(1)}>Guardado anterior</button><button role="menuitem" disabled={backupCount<2} onClick={()=>void openBackup(2)}>Guardado de hace dos</button><button role="menuitem" disabled={backupCount<3} onClick={()=>void openBackup(3)}>Guardado de hace tres</button><hr/><button role="menuitem" onClick={()=>{setFileMenu(false);setTransferOpen(true);}}>Exportar o importar paquete…</button><button role="menuitem" onClick={()=>{setFileMenu(false);exportProject();}}>Exportar puesta en escena (.json)</button><hr/><button role="menuitem" onClick={()=>void closeToMenu()}>Volver al menú de historias</button></div></>}</span><span className={styles.historiaName} title={`Estudio/Historias/${historia.file.id}`}>{historiaName}<small>{saving?'Guardando…':dirty?(autosave.error?'Sin conexión con el disco · copia en el navegador':autosave.at?`Sin guardar · autoguardado ${new Date(autosave.at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:'Cambios sin guardar'):savedAt?`Guardada ${new Date(savedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:'Guardada'}</small></span><button aria-pressed={student} title={student?'Volver a editar la historia':'Reproducir la historia como el estudiante'} onClick={() => { if(student){setStudent(false);setPlayback(director.current.pause());}else{setStudent(true);setPlayback(director.current.play());} }}>{buttonIcon(student?'flow':'play', student?'Volver a editar':'Reproducir historia')}</button><span className={styles.location}>{scene.zoneId?(zoneOptions.find(z=>z.id===scene.zoneId)?.label.split(' / ').at(-1)??'Escenario'):'Sin escenario'}⌄</span><button aria-label="Deshacer" title="Deshacer (Ctrl + Z)" disabled={!history.length || student} onClick={undo}><Icon name="undo" /></button><button aria-label="Rehacer" title="Rehacer (Ctrl + Y)" disabled={!future.length || student} onClick={redo}><span>↪</span></button><button onClick={() => setScriptOpen(true)} disabled={student} title="Guion de la Story: frases, puesta en escena y voces">{buttonIcon('chat', 'Guion')}{coverage.unused > 0 && <span className={styles.countBadge} aria-label={`${coverage.unused} frases sin usar`}>{coverage.unused}</span>}</button><span className={styles.shortcutsWrap}><button aria-label="Atajos de teclado" aria-expanded={shortcutsOpen} onClick={() => setShortcutsOpen(!shortcutsOpen)}>?</button>{shortcutsOpen && <div className={styles.shortcuts} role="dialog" aria-label="Atajos de teclado"><h3>Atajos de teclado</h3><dl>{shortcuts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>}</span><button onClick={()=>void save()} disabled={student||saving} aria-label={dirty?'Guardar (hay cambios sin guardar)':'Guardar'}>{buttonIcon('save', saving?'Guardando…':'Guardar')}{dirty&&<span className={styles.dirtyDot} aria-hidden="true"/>}</button><button className={styles.primary} onClick={publish} disabled={student||publishing}>{publishing?'Publicando…':'Publicar'}</button></div>,toolbar)):<header className={styles.header}>
      <a className={styles.brand} href="?modo=editor" onClick={event=>{if(host){event.preventDefault();host.setMode('editor');}}}><span className={styles.brandIcon}><Icon name="world" /></span><strong>SpanStories</strong><span>Story Studio</span></a>
      <nav aria-label="Espacios de creación"><button aria-pressed={!student} onClick={() => { setStudent(false); setPlayback(director.current.pause()); }}>{buttonIcon('flow', 'Estudio')}</button><button disabled={student} onClick={()=>void openWorkshop('body')}>{buttonIcon('person', 'Taller de animación')}</button><button disabled={student} onClick={()=>void openWorkshop('face')}>Taller facial</button><button aria-pressed={student} onClick={() => { setStudent(true); setPlayback(director.current.play()); }}>{buttonIcon('play', 'Reproducir historia')}</button></nav>
      <div className={styles.headerActions}><span className={styles.fileWrap}><button className={styles.fileButton} aria-haspopup="menu" aria-expanded={fileMenu} onClick={()=>setFileMenu(!fileMenu)} title="Archivo: guardar, abrir, recuperar">Archivo ▾</button>{fileMenu&&<><div className={styles.fileShade} onClick={()=>setFileMenu(false)}/><div className={styles.fileMenu} role="menu"><button role="menuitem" onClick={()=>void closeToMenu()}>Abrir otra historia…<kbd>Ctrl O</kbd></button><button role="menuitem" onClick={()=>void closeToMenu()}>Nueva historia…</button><hr/><button role="menuitem" disabled={saving||student} onClick={()=>{setFileMenu(false);void save();}}>Guardar<kbd>Ctrl S</kbd></button><button role="menuitem" disabled={student} onClick={()=>{setFileMenu(false);void saveAs();}}>Guardar como…<kbd>Ctrl Mayús S</kbd></button><button role="menuitem" disabled={!dirty||!savedAt} onClick={()=>void revert()}>Volver al último guardado</button><hr/><span className={styles.fileLabel}>Recuperar</span><button role="menuitem" disabled={backupCount<1} onClick={()=>void openBackup(1)}>Guardado anterior</button><button role="menuitem" disabled={backupCount<2} onClick={()=>void openBackup(2)}>Guardado de hace dos</button><button role="menuitem" disabled={backupCount<3} onClick={()=>void openBackup(3)}>Guardado de hace tres</button><hr/><button role="menuitem" onClick={()=>{setFileMenu(false);setTransferOpen(true);}}>Exportar o importar paquete…</button><button role="menuitem" onClick={()=>{setFileMenu(false);exportProject();}}>Exportar puesta en escena (.json)</button><hr/><button role="menuitem" onClick={()=>void closeToMenu()}>Volver al menú de historias</button></div></>}</span><span className={styles.historiaName} title={`Estudio/Historias/${historia.file.id}`}>{historiaName}<small>{saving?'Guardando…':dirty?(autosave.error?'Sin conexión con el disco · copia en el navegador':autosave.at?`Sin guardar · autoguardado ${new Date(autosave.at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:'Cambios sin guardar'):savedAt?`Guardada ${new Date(savedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:'Guardada'}</small></span><span className={styles.location}>{scene.zoneId?(zoneOptions.find(z=>z.id===scene.zoneId)?.label.split(' / ').at(-1)??'Escenario'):'Sin escenario'}⌄</span><button aria-label="Deshacer" title="Deshacer (Ctrl + Z)" disabled={!history.length || student} onClick={undo}><Icon name="undo" /></button><button aria-label="Rehacer" title="Rehacer (Ctrl + Y)" disabled={!future.length || student} onClick={redo}><span>↪</span></button><button onClick={() => setScriptOpen(true)} disabled={student} title="Guion de la Story: frases, puesta en escena y voces">{buttonIcon('chat', 'Guion')}{coverage.unused > 0 && <span className={styles.countBadge} aria-label={`${coverage.unused} frases sin usar`}>{coverage.unused}</span>}</button><span className={styles.shortcutsWrap}><button aria-label="Atajos de teclado" aria-expanded={shortcutsOpen} onClick={() => setShortcutsOpen(!shortcutsOpen)}>?</button>{shortcutsOpen && <div className={styles.shortcuts} role="dialog" aria-label="Atajos de teclado"><h3>Atajos de teclado</h3><dl>{shortcuts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>}</span><button onClick={()=>void save()} disabled={student||saving} aria-label={dirty?'Guardar (hay cambios sin guardar)':'Guardar'}>{buttonIcon('save', saving?'Guardando…':'Guardar')}{dirty&&<span className={styles.dirtyDot} aria-hidden="true"/>}</button><button className={styles.primary} onClick={publish} disabled={student||publishing}>{publishing?'Publicando…':'Publicar'}</button></div>
    </header>}
    {shownWorkshop&&<StudioWorkshop key={workshopKey(shownWorkshop)} hidden={!workshop} context={shownWorkshop} stage={host?{origin:host.origin,frame:host.frame,send,setOverlay:host.setOverlay,slot:renderedZone?sharedStageSlot:undefined}:undefined} onSceneLive={setSceneLive} onApply={applyBehavior} onApplyMounted={applyMountedBehaviors} onLife={applyLife} onReplaceBehaviors={replaceBehaviors} flushRef={workshopFlush} closeRef={workshopClose} onSelectActor={id=>openWorkshop('body',id)} onClose={()=>{setSceneLive(false);setWorkshop(null);}} onEditor={editor=>setWorkshop(w=>w&&w.editor!==editor?{...w,editor}:w)} inShell={!!toolbar}/>}

    <nav className={styles.rail} aria-label="Paneles del Estudio">{([['story','Historia','flow'],['resources','Recursos','build'],['actions','Acciones','plus'],['dialogue','Diálogo y voz','chat']] as const).map(([id,label,icon])=><button key={id} aria-pressed={railPanel===id} onClick={()=>setRailPanel(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav>

    <aside className={styles.leftDock} aria-label="Historia y recursos">
      {railPanel==='story'&&<section className={styles.panel + ' ' + styles.storyPanel}>{panelHeading('Historia', <button aria-label="Archivos de puesta en escena" title="Exportar o abrir puesta en escena" onClick={()=>setTransferOpen(true)}>↥</button>)}
        <div className={styles.storySelect}><label>Story del proyecto<select aria-label="Elegir Story" value={sourceId} onChange={e => chooseSource(e.target.value)}>{catalog.map(s => <option key={s.storyVersionId} value={s.storyVersionId}>{s.title}{(s.versionNumber??1)>1?` · borrador v${s.versionNumber}`:''}</option>)}</select></label><span className={styles.badge}>{source.status === 'DRAFT' ? (source.blueprintId?'Borrador · pendiente de revisión':'Ensayo · sin publicar') : 'Story publicada'}</span></div>
        <div className={styles.sceneTree}>{project.scenes.map((s, si) => <div key={s.id} className={styles.sceneGroup} data-active={s.id === scene.id}><button className={styles.sceneButton} onClick={() => select(s.sequences[0].id)}><span className={styles.sceneNumber}>{String(si + 1).padStart(2, '0')}</span><span><strong>{s.name}</strong><small>{s.zoneId?(zoneOptions.find(z=>z.id===s.zoneId)?.label.split(' / ').at(-1)??'Escenario'):'Sin escenario'} · {s.sequences.length} momentos</small></span><span>⌄</span></button>{s.id === scene.id && <div className={styles.sequenceTree}>{s.sequences.map((seq, i) => { const problems = issues.get(seq.id) ?? []; return <button key={seq.id} className={styles.sequenceButton} aria-pressed={seq.id === sequenceId} onClick={() => select(seq.id)} draggable title={problems.length ? problems.map(p => '⚠ ' + p.message).join('\n') : 'Arrastra para reordenar'}
          data-over={dragSequence !== null && dragSequence !== seq.id ? 'target' : undefined}
          onDragStart={e => { setDragSequence(seq.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', seq.id); }}
          onDragOver={e => { if (dragSequence && dragSequence !== seq.id && s.sequences.some(q => q.id === dragSequence)) e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); if (dragSequence && dragSequence !== seq.id) reorderSequence(dragSequence, i); setDragSequence(null); }}
          onDragEnd={() => setDragSequence(null)}><span>◇</span><span><strong>Secuencia {i + 1}</strong><small>{seq.name}</small></span><span className={styles.sequenceDot} data-issue={problems.length ? (problems.some(p => p.code === 'unreachable' || p.code === 'trapped' || p.code === 'auto-loop') ? 'error' : 'warning') : undefined} /></button>; })}</div>}</div>)}</div>
        <div className={styles.panelBottom}><button onClick={addScene}>{buttonIcon('plus', 'Añadir escena')}</button></div>
      </section>}
      {railPanel==='resources'&&<section className={styles.panel + ' ' + styles.libraryPanel}>{panelHeading('Recursos del proyecto')}<div className={styles.tabs}>{(['characters', 'scenarios', 'actions'] as const).map(k => <button key={k} aria-pressed={library === k} onClick={() => setLibrary(k)}>{k === 'characters' ? 'Personajes' : k === 'scenarios' ? 'Escenarios' : 'Actuaciones'}</button>)}</div>
        <div className={styles.resourceGrid}>{library === 'characters' ? characters.map(c => <button className={styles.resourceCard} key={c.id} onClick={() => addCharacter(c.id, c.label)}><div className={styles.characterPortrait}><Icon name="person" /></div><strong>{c.label}</strong><small>Añadir al escenario</small></button>).concat(student?[]:[<button type="button" key="__add" className={styles.resourceCard+' '+styles.addCard+(libraryDropHot?' '+styles.addCardHot:'')} aria-label="Añadir personaje desde un archivo GLB" title="Haz clic para elegir un GLB o suéltalo aquí" onClick={()=>void browseLibraryCharacters()} onDragOver={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';setLibraryDropHot(true);}}} onDragLeave={()=>setLibraryDropHot(false)} onDrop={e=>{e.preventDefault();setLibraryDropHot(false);void importLibraryCharacters(Array.from(e.dataTransfer.files));}}><div className={styles.characterPortrait}><span className={styles.addPlus} aria-hidden="true">+</span></div><strong>Añadir personaje</strong><small>Clic o suelta un GLB</small></button>]) : library === 'scenarios' ? <button className={styles.resourceCard} onClick={() => setTab('moment')}><div className={styles.cityThumb} /><strong>Escenario de la escena</strong><small>Elegir en Propiedades</small></button> : Object.entries(actionNames).map(([key, label]) => <button key={key} disabled={!supportsAction(key)} title={supportsAction(key)?label:'Este modelo todavía no dispone de esta actuación.'} onClick={() => { if (!actor) { setStatus('Añade un personaje primero.'); return; } const cue: Cue = { id: uid(), kind: 'actor', actorId: actor.id, action: key as keyof typeof actionNames, at: 0, duration: 3 }; editSequence(s => s.cues.push(cue)); setSelectedCueId(cue.id); setTab('moment'); }}>{label}</button>)}</div>
        {library === 'characters' && <><input ref={libraryFileInput} type="file" accept=".glb,model/gltf-binary" multiple hidden aria-label="Elegir personajes GLB" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length)void importLibraryCharacters(files);}}/>
          {!student&&folderPicker&&<p className={styles.hint}><button type="button" className={styles.linkButton} title={characterFolder?'Carpeta actual: '+characterFolder:'Carpeta donde se abrirá el «+»'} onClick={()=>void pickCharacterFolder()}>Elegir carpeta</button></p>}</>}
      </section>}
      {railPanel==='actions'&&<section className={styles.panel+' '+styles.actionsPanel}>{panelHeading('Añadir acciones al momento')}<div className={styles.actionButtons}>{(['dialogue','camera','actor','sound','light'] as const).map(kind=><button key={kind} onClick={()=>{setTab('moment');addCue(kind);}}>{buttonIcon(kind==='actor'?'person':kind==='dialogue'?'chat':kind,kindNames[kind])}</button>)}<button onClick={()=>setTab('interaction')}>{buttonIcon('look','Interacción')}</button></div></section>}
      {railPanel==='dialogue'&&<section className={styles.panel+' '+styles.dialoguePanel}>{panelHeading('Diálogo y voz')}<div className={styles.dialogueCard}><span className={styles.speakerAvatar}><Icon name="person"/></span><div><small>{editableDialogue?.speakerId?scene.actors.find(a=>a.id===editableDialogue.speakerId)?.name:'Narrador'}</small><p>{editableSentence?.text??'Añade una intervención de la Story.'}</p></div></div><small className={styles.sourceNote}>Vinculado a la versión de la Story · {coverage.used}/{coverage.total} frases en escena{coverage.unused ? ` · ${coverage.unused} sin usar` : ''}</small><div className={styles.dialogueActions}><button disabled={!editableSentence||!canonicalReady} onClick={()=>{if(editableSentence)setEditorial({sentenceId:editableSentence.id,text:editableSentence.text});}}>Editar texto</button><button disabled={!editableSentence} onClick={listen}>{buttonIcon('sound','Escuchar')}</button><button onClick={() => setScriptOpen(true)}>Abrir guion</button><label className={styles.fileControl}>{importingAudio?'Importando…':'Importar voz'}<input aria-label="Importar voz" type="file" accept="audio/*" disabled={importingAudio||!editableDialogue} onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file,'voice');e.target.value='';}}/></label></div>{audioControls.assets.length>0&&<details className={styles.audioAssets}><summary>Grabaciones disponibles ({audioControls.assets.length})</summary>{audioControls.assets.map(asset=><button key={asset.id} onClick={()=>bindAudioAsset(asset,'voice')}>{asset.name} · {asset.duration.toFixed(1)}s</button>)}</details>}</section>}
    </aside>

    <section className={styles.viewport+(host?' '+stageStyles.transparent:'')} aria-label="Visor 3D de Story Studio" data-animation-menu={host&&workshop&&!workshop.sinPersonaje?(workshop.editor??'body'):undefined}>
      {!renderedZone?<div className={styles.noScenario}><strong>Esta escena todavía no tiene escenario</strong><p>No se carga ningún lugar hasta que elijas uno.</p>{!student&&<select aria-label="Elegir escenario" value="" onChange={e=>{if(e.target.value)chooseScenario(e.target.value);}}><option value="">Elegir escenario…</option>{zoneOptions.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}</select>}</div>:host?<div ref={registerStudioStageSlot} className={stageStyles.slot}/>:<iframe key={viewerAttempt} ref={ownFrame} src={viewer.href} title="Escenario de la historia" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-downloads" />}
      <StudioSceneTransition effect={playback.stage.sceneEntry}/>
      {safeZones&&!student&&<SafeZonesOverlay/>}
      {!ready&&slowViewer&&!!renderedZone&&<button className={styles.retryViewer} onClick={()=>{setConnected(false);if(host)host.reload();else setViewerAttempt(n=>n+1);}}>Reintentar escenario</button>}
      {!student && <div className={styles.viewportTop}><div className={styles.cameraChip}><Icon name="camera" /><span>Cámara de dirección<strong>{sequence.name}</strong></span></div><div className={styles.viewportTools}><button aria-pressed={focusMode} onClick={()=>setFocusMode(value=>!value)}>{focusMode?'Mostrar paneles':'Enfocar escenario'}</button><details className={styles.layoutOptions}><summary>Paneles</summary><div><label>Biblioteca · {panelWidths.library} px<input aria-label="Ancho de biblioteca" type="range" min="200" max="360" step="8" value={panelWidths.library} onChange={e=>setPanelWidths(value=>({...value,library:Number(e.target.value)}))}/></label><label>Inspector · {panelWidths.inspector} px<input aria-label="Ancho del inspector" type="range" min="260" max="420" step="8" value={panelWidths.inspector} onChange={e=>setPanelWidths(value=>({...value,inspector:Number(e.target.value)}))}/></label><button onClick={()=>setPanelWidths({library:304,inspector:352})}>Restablecer paneles</button></div></details><button aria-pressed={!!scene.cameraLocked} title={scene.cameraLocked?'La cámara del estudiante no cambia aunque muevas tu vista. Pulsa para desbloquearla.':'Fija la cámara del estudiante y pasa a «Vista libre»: te mueves, te acercas y editas de cerca sin cambiar lo que verá el estudiante.'} onClick={toggleCameraLock}>{scene.cameraLocked?'🔒 Cámara del estudiante fijada':'🔓 Fijar cámara del estudiante'}</button>{cameraView==='free'&&<button aria-pressed={studentInset} title="Recuadro abajo a la izquierda con lo que ve el estudiante en este instante" onClick={()=>setStudentInset(v=>!v)}>Recuadro del estudiante</button>}<button title="Guardar el encuadre actual" disabled={!!scene.cameraLocked} onClick={() => captureCamera(({ shot }) => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.shot = shot; }))}>{buttonIcon('camera', 'Capturar plano')}</button></div></div>}
      {picking && !student && <div className={styles.pickBanner} role="status"><span>{picking.message}</span><button onClick={cancelPick}>Cancelar (Esc)</button></div>}
      <div className={styles.stageCorner}><span className={styles.liveDot} />{ready ? (student ? 'Mirar y tocar · recorrido dirigido' : 'Escenario del visor') : 'Preparando escenario…'}</div>
      <div className={styles.transport}><button onClick={() => { const next = student?director.current.back():director.current.seek(Math.max(0, playback.index - 1)); setPlayback(next); }} disabled={!ready||(student?!playback.canGoBack:playback.index===0)} aria-label="Momento anterior">|◀</button><button disabled={!ready} onClick={play} aria-label={playback.state === 'playing' ? 'Pausar historia' : 'Reproducir momento'}>{playback.state === 'playing' ? 'Ⅱ' : '▶'}</button><span>{playback.time.toFixed(1)}s / {playback.duration.toFixed(1)}s</span><span className={styles.transportDivider} /><span>{playback.state === 'waiting' ? 'Esperando al estudiante' : playback.state === 'finished' ? 'Historia terminada' : 'Momento ' + (playback.index + 1)}</span></div>
      {student && <div className={styles.studentDialogue} aria-live="polite"><small>{playback.stage.caption?.speakerId ? currentItem.scene.actors.find(a => a.id === playback.stage.caption!.speakerId)?.name : 'Narrador'}</small><div className={styles.readingLine}>{sentence ? <StudioReading source={source} sentenceId={sentence.id} owner={owner} onPause={() => setPlayback(director.current.pause())} /> : currentItem.sequence.name}</div>{playback.state === 'waiting' && <><p className={styles.gatePrompt}>{gate.kind !== 'auto' ? gate.prompt : ''}</p>{gate.kind === 'continue' && <button className={styles.primary} onClick={() => respond('continue')}>Continuar →</button>}{gate.kind === 'choice' && gate.options.map(o => <button key={o.id} onClick={() => respond('choice', o.id)}>{optionText(o)}</button>)}{gate.kind === 'answer' && <form onSubmit={e => { e.preventDefault(); respond('answer', answer); }}><input aria-label="Tu respuesta" value={answer} onChange={e => setAnswer(e.target.value)} /><button>Responder</button></form>}</>}{playback.state === 'finished' && <button onClick={() => setPlayback(director.current.play())}>Volver a empezar</button>}</div>}
      {student&&playback.state==='waiting'&&gate.kind==='object'&&touchedObject&&<button className={styles.objectContinue} onClick={()=>respond('object',touchedObject)}>Objeto observado · Continuar →</button>}
      {student&&sentence&&<button className={styles.studentReplay} onClick={listen}>{buttonIcon('sound','Escuchar de nuevo')}</button>}
    </section>


    <aside className={styles.rightDock} aria-label="Dirección y acciones">
      <section className={styles.panel + ' ' + styles.properties}>{panelHeading('Propiedades')}<div className={styles.tabs}>{(['scene', 'moment', 'camera', 'actors', 'interaction', 'life'] as const).map(k => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === 'scene' ? 'Escena' : k === 'moment' ? 'Momento' : k === 'camera' ? 'Cámara' : k === 'actors' ? 'Personajes' : k === 'interaction' ? 'Interacción' : 'Vida'}</button>)}</div>
        <div className={styles.inspector}>
          {tab==='scene'&&<StudioSceneInspector scene={scene} onChange={next=>edit(copy=>{copy.scenes[copy.scenes.findIndex(s=>s.id===scene.id)]=next;})} onResize={(duration,mode)=>{try{const next=resizeScene(scene,duration,mode);edit(copy=>{copy.scenes[copy.scenes.findIndex(s=>s.id===scene.id)]=next;});setStatus(mode==='pad'?'Duración actualizada sin mover las acciones.':'Tiempos de la escena reescalados. Revisa la sincronía con el audio.');}catch(error){setStatus(error instanceof Error?error.message:'No se pudo ajustar la duración.');}}}/>}
          {tab==='scene'&&!student&&<>
            <StudioVariantPicker zoneId={scene.zoneId} value={scene.variantId} onChange={id => edit(copy => { const target = copy.scenes.find(s => s.id === scene.id)!; if (id) target.variantId = id; else delete target.variantId; })} />
            <label>Luz de la escena<select aria-label="Luz de la escena" value={scene.ambient ?? ''} onChange={e => edit(copy => { const target = copy.scenes.find(s => s.id === scene.id)!; if (e.target.value) target.ambient = e.target.value as SceneAmbient; else delete target.ambient; })}><option value="">Luz actual del visor</option>{SCENE_AMBIENTS.map(a => <option key={a} value={a}>{ambientNames[a]}</option>)}</select></label>
            <h4>Luz al empezar la escena</h4>
            <label className={styles.check}><input type="checkbox" checked={!!scene.light} onChange={e => edit(copy => { const target = copy.scenes.find(s => s.id === scene.id)!; if (e.target.checked) target.light = { ...DEFAULT_LIGHT }; else delete target.light; })} />Dirigir el sol y la luna en esta escena</label>
            {scene.light && <StudioLightLevels light={scene.light} label="Luz inicial" onChange={next => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.light = next; })} />}
            <p className={styles.hint}>Para un anochecer o un amanecer, añade una acción «Luz» en el momento: la pista «Luz» de la línea de tiempo pasa de esta luz a la que elijas durante lo que dure el clip. Hoy la entiende la colina de Don Quijote; en las ciudades manda «Luz de la escena».</p>
            <h4>Objetos que puede tocar</h4>
            <div className={styles.chips}>{scene.entryIds.map(id => <span className={styles.chip} key={id}>{entryLabel(id)}<button aria-label={`Quitar ${entryLabel(id)}`} onClick={() => apply(() => setSceneEntries(project, scene.id, scene.entryIds.filter(e => e !== id)), change)}>×</button></span>)}{!scene.entryIds.length && <small>Ninguno todavía.</small>}</div>
            <button className={styles.wideButton} disabled={!connected || !!picking} onClick={markObject}>Marcar objeto en el visor</button>
            <p className={styles.hint}>Haz clic sobre un objeto del escenario y su palabra quedará disponible para el estudiante en esta escena. También puedes elegirlos en Interacción.</p>
            <button className={`${styles.wideButton} ${styles.danger}`} disabled={project.scenes.length === 1} onClick={removeScene}>Eliminar escena</button>
          </>}
          {!student&&<><label>Escenario de esta escena<select aria-label="Escenario de la escena" value={scene.zoneId} disabled={!connected&&!!scene.zoneId} onChange={e=>chooseScenario(e.target.value)}>{!scene.zoneId&&<option value="">Sin escenario</option>}{!!scene.zoneId&&!zoneOptions.some(z=>z.id===scene.zoneId)&&<option value={scene.zoneId}>{scene.zoneId}</option>}{zoneOptions.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}</select></label><button className={styles.wideButton} onClick={()=>void openWorkshop()}>Taller · cuerpo, rostro y comportamientos ↗</button><div className={styles.worldLinks}><a href={scene.zoneId?`?modo=visor&zone=${encodeURIComponent(scene.zoneId)}`:"?modo=visor"}>Ver escenario ↗</a><a href="?modo=editor" onClick={event=>{if(host){event.preventDefault();host.setMode('editor');}}}>Editar escenario ↗</a></div>{selectedCue?.kind==='actor'&&selectedCue.behavior&&<p className={styles.hint}>{selectedCue.behavior.name} · variante del Taller · pendiente de revisión visual</p>}</>}
          {tab==='moment'&&<StudioMomentDuration key={sequence.id} scene={scene} sequenceId={sequence.id} onChange={next=>edit(copy=>{copy.scenes[copy.scenes.findIndex(s=>s.id===scene.id)]=next;})} onError={setStatus}/>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&selectedCue.action==='turn'&&<label>Orientación final (grados)<input type="number" step="5" value={Math.round((selectedCue.rotation??scene.actors.find(a=>a.id===selectedCue.actorId)?.rotation??0)*180/Math.PI)} onChange={e=>editCue(c=>{if(c.kind==='actor')c.rotation=number(e.target.value,0)*Math.PI/180;})}/></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&selectedCue.action==='look'&&<label>Mirar a<select value={selectedCue.lookAt??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.lookAt=e.target.value;else delete c.lookAt;}})}><option value="">Selecciona un personaje</option>{scene.actors.filter(a=>a.id!==selectedCue.actorId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          {tab==='actors'&&actor&&<><label>Modelo del personaje<select aria-label="Modelo del personaje" value={actor.characterId} onChange={e=>replaceActorModel(e.target.value)}>{characters.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><StudioActorPlacement actor={actor} actors={scene.actors} onChange={next=>edit(copy=>{const actors=copy.scenes.find(s=>s.id===scene.id)!.actors;actors[actors.findIndex(a=>a.id===actor.id)]=next;})} onError={setStatus}/><h3>Encuadrar a {actor.name}</h3><div className={styles.inlineButtons}>{[['general','General'],['medio','Medio'],['primero','Primer plano']].map(([type,label])=><button key={type} disabled={!ready} title={`Plano «${label} · ${actor.name}» para este momento`} onClick={()=>frameActor(actor.id,type)}>{label}</button>)}</div><p className={styles.hint}>El encuadre se calcula con el tamaño real del personaje y fija el plano de este momento.</p>
            <h3>Vida en reposo</h3>
            <label className={styles.check}><input type="checkbox" checked={!!actor.vida?.activa} onChange={e=>edit(copy=>{const a=copy.scenes.find(s=>s.id===scene.id)!.actors.find(x=>x.id===actor.id)!;if(e.target.checked)a.vida={...(a.vida??defaultActorLife()),activa:true};else if(a.vida)a.vida.activa=false;})}/> Vivo cuando está quieto</label>
            {actor.vida?.activa&&<label>Ánimo en la escena<select aria-label="Ánimo en reposo en la escena" value={actor.vida.animo} onChange={e=>edit(copy=>{const a=copy.scenes.find(s=>s.id===scene.id)!.actors.find(x=>x.id===actor.id)!;if(a.vida)a.vida.animo=e.target.value as LifeMood;})}>{LIFE_MOODS.map(m=><option key={m} value={m}>{LIFE_MOOD_LABELS[m]}</option>)}</select></label>}
            <p className={styles.hint}>{describeActorLife(actor.vida,id=>scene.actors.find(a=>a.id===id)?.name)}{actor.vida?.activa?' Respira, parpadea, mira y hace gestos pequeños mientras no tiene una actuación.':''}</p>
            <button disabled={!ready} onClick={()=>void openWorkshop('face')}>Ajustar vida y rostro en el Taller facial ↗</button></>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Expresión del modelo<select value={selectedCue.expression??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.expression=e.target.value;else delete c.expression;}})}><option value="">Mantener expresión actual</option>{(characterClips[scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId??'']??[]).filter(name=>/facial|expression|face/i.test(name)).map(name=><option key={name} value={name}>{name.replace(/Samuel_Juan_Facial_/,'')}</option>)}</select></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Ánimo en reposo desde este momento<select aria-label="Ánimo en reposo desde este momento" value={selectedCue.vida?.animo??''} onChange={e=>editCue(c=>{if(c.kind!=='actor')return;const v=e.target.value as LifeMood|'';if(v)c.vida={...(c.vida??{}),animo:v};else if(c.vida){delete c.vida.animo;if(!Object.keys(c.vida).length)delete c.vida;}})}><option value="">Como en la escena</option>{LIFE_MOODS.map(m=><option key={m} value={m}>{LIFE_MOOD_LABELS[m]}</option>)}</select></label>}
          {tab==='moment'&&selectedCue?.kind==='actor'&&<label>Animación corporal<select value={selectedCue.clipName??''} onChange={e=>editCue(c=>{if(c.kind==='actor'){if(e.target.value)c.clipName=e.target.value;else delete c.clipName;}})}><option value="">Según la actuación</option>{(characterClips[scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId??'']??[]).filter(name=>!/facial|expression|face/i.test(name)).map(name=><option key={name} value={name}>{name==='Catching_Breath'?'Respirar':name==='Slap_Reaction'?'Reaccionar':name==='Excited_Walk_M'?'Caminar con entusiasmo':name==='Walking'?'Caminar':name==='restpose'?'Pose base':name}</option>)}</select></label>}
          {tab === 'moment' && <><div className={styles.inspectorTitle}><span className={styles.objectIcon}><Icon name="flow" /></span><div><h3>{sequence.name}</h3><small>Secuencia de la historia</small></div></div><label>Nombre<input value={sequence.name} onChange={e => editSequence(s => { s.name = e.target.value; })} /></label><div className={styles.buttonGrid}><button disabled={sequenceIndex === 0} onClick={() => moveCurrentSequence(sequenceIndex - 1)} title="Mover antes">↑ Antes</button><button disabled={sequenceIndex === scene.sequences.length - 1} onClick={() => moveCurrentSequence(sequenceIndex + 1)} title="Mover después">↓ Después</button><button onClick={copySequence}>Duplicar momento</button><button className={styles.danger} disabled={scene.sequences.length === 1} onClick={removeSequence}>Eliminar momento</button></div>{(issues.get(sequence.id) ?? []).map(issue => <p key={issue.code} className={styles.issueNote} data-severe={issue.code === 'unreachable' || issue.code === 'trapped' || issue.code === 'auto-loop'}>⚠ {issue.message}</p>)}<label>Acción seleccionada<select value={selectedCue?.id ?? ''} onChange={e => setSelectedCueId(e.target.value)}><option value="" disabled>Selecciona una acción</option>{sequence.cues.map(c => <option value={c.id} key={c.id}>{kindNames[c.kind]} · {c.kind === 'actor' ? actionNames[c.action] : cueText(c, scene, source.sentences, 30)}</option>)}</select></label>
            {selectedCue && <><div className={styles.inlineButtons}><button onClick={() => copyCue(selectedCue.id)} title="Duplicar (Ctrl + D)">Duplicar acción</button><button className={styles.danger} onClick={() => removeCue(selectedCue.id)} title="Eliminar (Supr)">Eliminar acción</button></div>
              {sequence.cues.length > 1 && <label>Empezar después de<select aria-label="Empezar después de" value="" onChange={e => { if (e.target.value) apply(() => chainCue(project, sequence.id, selectedCue.id, e.target.value), next => change(selectedCue.kind === 'dialogue' ? syncAutoActing(next, sequence.id, [selectedCue.id]) : next)); }}><option value="">Elige una acción…</option>{sequence.cues.filter(c => c.id !== selectedCue.id).sort((a, b) => (a.at + a.duration) - (b.at + b.duration)).map(c => <option key={c.id} value={c.id}>{kindNames[c.kind]} · {c.kind === 'actor' ? `${scene.actors.find(a => a.id === c.actorId)?.name ?? ''} ${actionNames[c.action]}` : cueText(c, scene, source.sentences, 26)} · termina {(c.at + c.duration).toFixed(1)} s</option>)}</select></label>}
              <div className={styles.twoColumns}><label>Inicio (s)<input type="number" min="0" step="0.1" value={selectedCue.at} onChange={e => editCue(c => { c.at = Math.max(0, number(e.target.value, c.at)); })} /></label><label>Duración (s)<input type="number" min="0.05" step="0.1" value={selectedCue.duration} onChange={e => editCue(c => { c.duration = Math.max(.05, number(e.target.value, c.duration)); })} /></label></div>
              {selectedCue.kind === 'dialogue' && <><label>Intervención de la Story<select value={selectedCue.sentenceId} onChange={e => editCue(c => { if (c.kind === 'dialogue') { c.sentenceId = e.target.value; if (!c.audioUrl) c.duration = dialogueDuration(source.sentences.find(s => s.id === e.target.value)?.text ?? ''); } })}>{source.sentences.map(s => <option key={s.id} value={s.id}>{(coverage.uses.get(s.id)?.length ?? 0) > (s.id === selectedCue.sentenceId ? 1 : 0) ? '● ' : '○ '}{s.text}</option>)}</select></label><div className={styles.inlineButtons}><button title="Duración según la longitud del texto (unas 2 palabras por segundo)" onClick={() => editCue(c => { if (c.kind === 'dialogue') c.duration = dialogueDuration(source.sentences.find(s => s.id === c.sentenceId)?.text ?? ''); })}>Ajustar al texto</button><button disabled={!selectedCue.audioUrl?.startsWith('studio-audio:') || !audioControls.assets.some(a => `studio-audio:${a.id}` === selectedCue.audioUrl)} title="Duración exacta de la grabación vinculada" onClick={() => { const asset = audioControls.assets.find(a => `studio-audio:${a.id}` === selectedCue.audioUrl); if (asset) editCue(c => { c.duration = Math.max(.05, Math.round(asset.duration * 100) / 100); }); }}>Ajustar al audio</button></div><label>Quién habla<select value={selectedCue.speakerId ?? ''} onChange={e => { const speaker = e.target.value || null; if (speaker) setLastSpeakerId(speaker); editCue(c => { if (c.kind === 'dialogue') c.speakerId = speaker; }); }}><option value="">Narrador</option>{scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className={styles.autoActing}><button disabled={!selectedCue.speakerId} onClick={() => autoActing(selectedCue.id)} title="El hablante habla; los demás escuchan y lo miran. Se respeta la dirección manual.">Generar actuación</button><label className={styles.check}><input type="checkbox" checked={focusWithLine} onChange={e => setFocusWithLine(e.target.checked)} />con plano medio</label></div>{sequence.cues.some(c => c.id.startsWith(`auto:${selectedCue.id}:`)) && <p className={styles.hint}>Actuación automática activa: sigue a la intervención al moverla o cambiar quién habla.</p>}<label>Archivo de voz (URL)<input placeholder="/audio/intervencion.mp3" value={selectedCue.audioUrl ?? ''} onChange={e => editCue(c => { if (c.kind === 'dialogue') { if (e.target.value) c.audioUrl = e.target.value; else delete c.audioUrl; } })} /></label></>}
              {(selectedCue.kind==='cameraSwitch'||selectedCue.kind==='cameraMove')&&<CameraCueInspector scene={scene} cue={selectedCue} editCue={editCue}/>}
              {selectedCue.kind==='camera'&&<><label>Transición de cámara (s)<input aria-label="Transición de cámara" type="number" min="0" max="30" step=".1" value={selectedCue.shot.transition} onChange={e=>editCue(c=>{if(c.kind==='camera')c.shot.transition=Math.min(30,Math.max(0,number(e.target.value,c.shot.transition)));})}/></label><label>Movimiento de cámara<select aria-label="Suavizado de cámara" value={selectedCue.shot.easing??'linear'} onChange={e=>editCue(c=>{if(c.kind==='camera')c.shot.easing=e.target.value as 'linear'|'easeIn'|'easeOut'|'easeInOut';})}><option value="linear">Velocidad constante</option><option value="easeIn">Arranque suave</option><option value="easeOut">Llegada suave</option><option value="easeInOut">Arranque y llegada suaves</option></select></label></>}
              {selectedCue.kind === 'actor' && <><label>Actuación<select value={selectedCue.action} onChange={e => editCue(c => { if (c.kind === 'actor') c.action = e.target.value as keyof typeof actionNames; })}>{Object.entries(actionNames).map(([k, v]) => <option key={k} value={k} disabled={!supportsAction(k,scene.actors.find(a=>a.id===selectedCue.actorId)?.characterId)}>{v}</option>)}</select></label>{selectedCue.action === 'walk' && <><button onClick={() => capture(({ position }) => editCue(c => { if (c.kind === 'actor') c.destination = position; }))}>Caminar hasta el centro de la vista</button><button disabled={!connected || !!picking} onClick={() => pickWalkDestination(selectedCue.id)}>Elegir destino con un clic</button>{selectedCue.destination && <small className={styles.coordinates}>Destino: {selectedCue.destination.map(v => v.toFixed(1)).join(' · ')}</small>}<button disabled={!connected || !!picking} onClick={() => drawWalkPath(selectedCue.id)} title="El personaje pasa por cada punto, en curva, mirando hacia donde anda">{selectedCue.path?.length ? 'Añadir puntos al camino' : 'Dibujar camino punto a punto'}</button>{!!cueRoute(selectedCue).length && (() => { const start = cueStart(selectedCue.id), route = cueRoute(selectedCue), meters = start ? routeLength(start, route) : 0, chosen = pathPoint?.cueId === selectedCue.id && pathPoint.index < (selectedCue.path?.length ?? 0) ? pathPoint.index : -1; return <>{!!selectedCue.path?.length && <><small className={styles.coordinates}>Camino: {selectedCue.path.length} {selectedCue.path.length === 1 ? 'punto' : 'puntos'} · {meters.toFixed(1)} m. Arrastra los puntos en el escenario para moverlos.</small><button onClick={() => { editCue(c => { if (c.kind === 'actor' && c.path) { c.path.splice(chosen >= 0 ? chosen : c.path.length - 1, 1); if (!c.path.length) delete c.path; } }); setPathPoint(null); }}>{chosen >= 0 ? `Quitar el punto ${chosen + 1}` : 'Quitar el último punto'}</button><button onClick={() => { editCue(c => { if (c.kind === 'actor') delete c.path; }); setPathPoint(null); }}>Borrar el camino</button></>}{meters > 0.2 && <button onClick={() => editCue(c => { c.duration = Math.max(0.5, Math.round(meters / 1.3 * 10) / 10); })} title="A paso normal (1,3 m/s) no patina">Ajustar la duración al recorrido ({(meters / 1.3).toFixed(1)} s)</button>}</>; })()}</>}<p className={styles.hint}>Se reutilizan los clips disponibles del modelo. Los gestos requieren su animación correspondiente.</p></>}
              {selectedCue.kind === 'light' && <StudioLightCueInspector from={lightAt(selectedCue.at)} light={selectedCue.light} easing={selectedCue.easing} name={selectedCue.label}
                onLight={next => editCue(c => { if (c.kind === 'light') c.light = next; })} onEasing={e => editCue(c => { if (c.kind === 'light') c.easing = e; })} onName={n => editCue(c => { if (c.kind === 'light' && n.trim()) c.label = n; })} />}
              {selectedCue.kind === 'sound' && <><label>Archivo de sonido<input value={selectedCue.audioUrl} onChange={e => editCue(c => { if (c.kind === 'sound') c.audioUrl = e.target.value; })} /></label><label>Volumen<input type="range" min="0" max="1" step=".05" value={selectedCue.volume} onChange={e => editCue(c => { if (c.kind === 'sound') c.volume = Number(e.target.value); })} /></label></>}
            </>}
          </>}
          {tab === 'camera' && <><h3>Dirección de cámara</h3><label>Plano que editas<select aria-label="Plano que editas" value={selectedCue?.kind==='camera'?selectedCue.id:'scene'} onChange={e=>setSelectedCueId(e.target.value==='scene'?null:e.target.value)}><option value="scene">Cámara inicial de la escena</option>{sequence.cues.filter(c=>c.kind==='camera').map(c=><option key={c.id} value={c.id}>{c.label} · {c.at.toFixed(1)} s</option>)}</select></label><button className={styles.wideButton} disabled={!ready} onClick={addCameraKey}>＋ Plano en {playback.time.toFixed(1)} s</button><StudioCameraProperties shot={selectedCue?.kind==='camera'?selectedCue.shot:scene.shot} animated={selectedCue?.kind==='camera'} onChange={shot=>{if(selectedCue?.kind==='camera')editCue(c=>{if(c.kind==='camera')c.shot=shot;});else edit(copy=>{copy.scenes.find(s=>s.id===scene.id)!.shot=shot;});}} onCapture={()=>captureCamera(({shot})=>{if(selectedCue?.kind==='camera')editCue(c=>{if(c.kind==='camera')c.shot={...shot,transition:c.shot.transition,easing:c.shot.easing};});else edit(copy=>{copy.scenes.find(s=>s.id===scene.id)!.shot=shot;});})}/><label className={styles.check}><input type="checkbox" checked={project.navigation.allowLook} onChange={e => edit(copy => { copy.navigation.allowLook = e.target.checked; })} />El estudiante puede mirar alrededor</label>
            {!student&&<StudioCameraRigs project={project} scene={scene} sequence={sequence} time={playback.time} ready={ready} view={cameraView} onView={setCameraView} pilot={pilotCamera} onPilot={id=>{if(id&&scene.cameraLocked){setStatus('La cámara del estudiante está fijada: desbloquéala para pilotar una cámara.');return;}setPilotCamera(id);setStatus(id?'Pilotando: mueve la vista y la cámara se actualiza al soltar.':'Pilotaje terminado.');}} safeZones={safeZones} onSafeZones={setSafeZones} change={change} status={setStatus} capture={captureCamera} startPick={startPick} goTo={shot=>{if(cameraView==='camera')setCameraView('free');send('VIEW',{position:shot.position,target:shot.target,fov:shot.fov});}} select={setSelectedCueId} audit={auditCameras} auditing={cameraAuditing} auditNote={cameraAuditNote} autoDirect={autoDirect} onPace={pace=>edit(copy=>{const target=copy.scenes.find(s=>s.id===scene.id)!;target.autoDirection={...(target.autoDirection??{suppressed:[]}),pace};})}/>}
          </>}
          {tab === 'actors' && <><label>Personaje<select value={actor?.id ?? ''} onChange={e => setActorId(e.target.value)}>{!scene.actors.length && <option>Añade un personaje de la biblioteca</option>}{scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{actor && <><label>Nombre del papel<input value={actor.name} onChange={e => edit(copy => { copy.scenes.find(s => s.id === scene.id)!.actors.find(a => a.id === actor.id)!.name = e.target.value; })} /></label><button className={styles.wideButton} disabled={!connected} title={connected?'Después, un clic en el suelo lo coloca (Esc cancela)':'El escenario aún no está conectado'} onClick={() => { send('PLACE', { actorId: actor.id }); setStatus('Haz clic en el suelo para colocar a ' + actor.name + ' · Esc cancela.'); }}>Colocar con un clic en el escenario</button><label>Posición</label>{actor.montura && <p className={styles.hint}>Va montado en {scene.actors.find(a => a.id === actor.montura!.caballoId)?.name ?? 'su montura'}: la pelvis sigue a la silla. Moverlo o girarlo aquí ajusta su sitio sobre la montura; para bajarlo, elige «(a pie)».</p>}{vectorFields(actor.position, position => edit(copy => { placeActor(copy.scenes.find(s => s.id === scene.id)!.actors, actor.id, { position }); }))}<label>Orientación (grados)<input type="number" step="5" value={Math.round(actor.rotation * 180 / Math.PI)} onChange={e => edit(copy => { placeActor(copy.scenes.find(s => s.id === scene.id)!.actors, actor.id, { rotation: number(e.target.value, 0) * Math.PI / 180 }); })} /></label><label>Va montado en<select value={actor.montura?.caballoId ?? ''} disabled={!actor.montura && scene.actors.some(r => r.montura?.caballoId === actor.id)} title={scene.actors.some(r => r.montura?.caballoId === actor.id) ? 'Lleva un jinete: una montura no puede ir montada.' : 'La pelvis del jinete sigue a la silla; el jinete se puede mover, girar y animar.'} onChange={e => setMount(actor.id, e.target.value || null)}><option value="">(a pie)</option>{scene.actors.filter(a => a.id !== actor.id && !a.montura && !scene.actors.some(r => r.id !== actor.id && r.montura?.caballoId === a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button className={`${styles.wideButton} ${styles.danger}`} onClick={() => removeActor(actor.id)}>Quitar a {actor.name} de la escena</button></>}</>}
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
    </aside>

    <section className={styles.dock + ' ' + styles.panel} aria-label={dockTab==='sequence'?'Sincronización del momento':'Flujo narrativo'}>
      <div className={styles.dockGrip} role="separator" aria-orientation="horizontal" aria-label="Altura del panel inferior" title="Arrastra para cambiar la altura del panel · doble clic: solo la cabecera / restaurar" onPointerDown={dockGripDown} onDoubleClick={dockGripToggle}/>
      <div className={styles.dockHead}><div className={styles.dockTabs} role="tablist" aria-label="Panel inferior"><button role="tab" aria-selected={dockTab==='sequence'} onClick={()=>setDockTab('sequence')}>Secuencia</button><button role="tab" aria-selected={dockTab==='direction'} onClick={()=>setDockTab('direction')}>Dirección</button></div><span className={styles.subtle}><strong>Escena {String(project.scenes.findIndex(s=>s.id===scene.id)+1).padStart(2,'0')} · {sequence.name}</strong> · {duration.toFixed(1)} s</span><span className={styles.spacer}/>{dockTab==='sequence'?<button className={styles.switch} aria-pressed={magnet} title="Imán: las acciones se pegan a los bordes de las demás" onClick={() => setMagnet(!magnet)}>Imán<i aria-hidden="true"/></button>:<button onClick={flowView==='scenes'?addScene:addMoment}>{buttonIcon('plus',flowView==='scenes'?'Escena':'Momento')}</button>}<button aria-expanded={showTime} onClick={() => setShowTime(!showTime)}>{showTime ? 'Ocultar' : 'Mostrar'}</button></div>
      <StudioStoryStrip project={project} selectedId={sequence.id} playingId={playback.stage.sequenceId} issues={issues} onSelect={select} onMove={reorderSequence} />
      {showTime&&(dockTab==='sequence'?<Timeline scene={scene} sequence={sequence} time={playback.time} selectedId={explicitCue?.id ?? null} snap={magnet} onSeek={time => setPlayback(director.current.seek(list.findIndex(x => x.sequence.id === sequenceId), time))} onEdit={cues => { const moved = cues.filter(c => c.kind === 'dialogue' && sequence.cues.some(o => o.id === c.id && (o.at !== c.at || o.duration !== c.duration))).map(c => c.id); const copy = structuredClone(project); sequenceList(copy).find(x => x.sequence.id === sequence.id)!.sequence.cues = cues; change(syncAutoActing(copy, sequence.id, moved)); }} onSelect={id => { setSelectedCueId(id); setTab('moment'); }} />:<><div className={styles.directionTabs} role="tablist" aria-label="Vistas de dirección">{([['scenes','Escenas'],['moments','Momentos'],['routes','Rutas y decisiones'],['actions','Acciones']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={flowView===id} onClick={()=>setFlowView(id)}>{label}</button>)}</div><div className={styles.flowCanvas}>{!student&&(flowView==='scenes'||flowView==='moments'?<StudioStoryboard project={project} sceneId={scene.id} sequenceId={sequence.id} view={flowView} scenarios={scenarios} onScene={id=>{select(project.scenes.find(s=>s.id===id)!.sequences[0].id);setTab('scene');}} onMoment={select} onEdit={change} onAdd={flowView==='scenes'?addScene:addMoment}/>:<Flow project={project} source={source} sceneId={scene.id} selectedId={sequence.id} selectedCueId={selectedCueId} detail={flowView==='actions'} issues={issues} onSelect={(id,gate)=>{select(id);if(gate)setTab('interaction');}} onCueSelect={id=>{setSelectedCueId(id);setTab('moment');setShowTime(true);}} onChange={change}/>)}</div></>)}
    </section>
    <footer className={styles.footer}><span><span className={styles.liveDot} />{student ? 'Modo: Reproducir historia' : 'Modo: Editar historia'}</span><span role="status">{audioControls.error??status}</span><span>{releaseId&&<a href={'?modo=reproducir&publicacion='+encodeURIComponent(releaseId)} target="_blank" rel="noopener">Abrir publicación · </a>}{dirty ? 'Cambios sin guardar' : `Revisión ${project.revision}`}{releaseId ? ' · publicada localmente' : ''}</span></footer>
    {soundPicker&&<div className={styles.modalShade}><form className={styles.mediaDialog} onSubmit={e=>{e.preventDefault();const cue:Cue={id:uid(),kind:'sound',at:nextCueStart(sequence,'sound',playhead),duration:3,audioUrl:soundUrl,volume:.5,label:'Sonido ambiente'};const copy=structuredClone(project);sequenceList(copy).find(x=>x.sequence.id===sequenceId)!.sequence.cues.push(cue);try{validateProject(copy,source);change(copy);setSelectedCueId(cue.id);setSoundPicker(false);setSoundUrl('');}catch(error){setStatus(error instanceof Error?error.message:'Archivo no válido.');}}}><h3>Vincular sonido</h3><div className={styles.audioFilePicker}><label className={styles.fileControl}>{importingAudio?'Importando…':'Elegir audio del equipo'}<input aria-label="Importar sonido" type="file" accept="audio/*" disabled={importingAudio} onChange={e=>{const file=e.target.files?.[0];if(file)void importAudio(file,'sound');e.target.value='';}} /></label>{audioControls.assets.map(asset=><button type="button" key={asset.id} onClick={()=>bindAudioAsset(asset,'sound')}>{asset.name} · {asset.duration.toFixed(1)}s</button>)}</div><details><summary>Usar una dirección de audio existente</summary><label>Dirección del archivo<input placeholder="/audio/ambiente.mp3" value={soundUrl} onChange={e=>setSoundUrl(e.target.value)} required /></label><p>La duración se podrá ajustar en la secuencia.</p><button className={styles.primary}>Vincular dirección</button></details><div><button type="button" disabled={importingAudio} onClick={()=>setSoundPicker(false)}>Cerrar</button></div></form></div>}
    {confirmation&&<div className={styles.modalShade}><form className={styles.mediaDialog} role="alertdialog" aria-modal="true" aria-label={confirmation.title} onSubmit={e=>{e.preventDefault();const run=confirmation.run;setConfirmation(null);run();}} onKeyDown={e=>{if(e.key==='Escape')setConfirmation(null);}}><h3>{confirmation.title}</h3><p className={styles.confirmText}>{confirmation.message}</p><div><button type="button" autoFocus onClick={()=>setConfirmation(null)}>Cancelar</button><button className={styles.dangerSolid}>{confirmation.confirmLabel}</button></div></form></div>}
    {scriptOpen&&<StudioScript project={project} source={source} currentSequenceId={sequence.id} onClose={()=>setScriptOpen(false)}
      onGoTo={(sequenceId,cueId)=>{select(sequenceId);setSelectedCueId(cueId);setScriptOpen(false);}}
      onPlace={sentenceId=>placeSentence(sentenceId)} onCreateMoment={sentenceAsMoment}
      onStageUnused={()=>apply(()=>stageUnusedSentences(project,source,scene.id,sequence.id,lastSpeakerId),({project:next,created})=>{change(next);setStatus(`${created} momento(s) creados con las frases sin usar.`);})}
      onSpeaker={setLineSpeaker} />}
    {editorial&&<div className={styles.modalShade}><form className={styles.mediaDialog} onSubmit={e=>{e.preventDefault();void saveEditorial();}}><h3>Editar intervención</h3><label>Texto de la Story<textarea aria-label="Texto de la intervención" value={editorial.text} onChange={e=>setEditorial({...editorial,text:e.target.value})} rows={6} maxLength={10000} required autoFocus /></label><p>Se guardará una nueva versión de borrador. La versión publicada y sus palabras conservarán sus referencias originales.</p><div><button type="button" disabled={editing} onClick={()=>setEditorial(null)}>Cancelar</button><button className={styles.primary} disabled={editing}>{editing?'Guardando…':'Guardar nueva versión'}</button></div></form></div>}
    {transferOpen&&<div className={styles.modalShade}><section className={`${styles.mediaDialog} ${styles.transferDialog}`} role="dialog" aria-modal="true" aria-labelledby="studio-files-title">
      <h3 id="studio-files-title">Archivos de puesta en escena</h3>
      <p>El paquete incluye las escenas, cámaras, actuaciones y grabaciones locales. Los modelos y escenarios se utilizan desde sus bibliotecas; los audios enlazados por dirección conservan ese enlace.</p>
      <details><summary>Comprobación de la historia · {directionChecks.length?`${directionChecks.length} avisos`:'sin avisos'}</summary>{directionChecks.length?<ul className={styles.checksList}>{directionChecks.map((check,i)=><li key={i}>{check.message}{check.sequenceId&&<button disabled={transferring} onClick={()=>{select(check.sequenceId!);setTransferOpen(false);}}>Revisar momento</button>}</li>)}</ul>:<p>Las rutas y las referencias de modelos, escenarios y grabaciones disponibles no presentan avisos. La revisión artística se realiza por separado.</p>}</details>
      <div className={styles.dialogueActions}><button disabled={transferring} onClick={()=>void exportPackage()}>{transferring?'Procesando…':'Exportar paquete con recursos'}</button><button disabled={transferring} onClick={exportProject}>Exportar solo dirección</button><label className={styles.fileControl}>Abrir paquete<input aria-label="Abrir paquete de puesta en escena" type="file" accept=".json,application/json" disabled={transferring} onChange={e=>{const file=e.target.files?.[0];if(file)void importPackage(file);e.target.value='';}}/></label></div>
      <p>Para abrirlo selecciona primero la misma Story y versión. La importación queda sin guardar y permite deshacer.</p>
      <button disabled={transferring} onClick={()=>setTransferOpen(false)}>Cerrar</button>
    </section></div>}
  </div>;
}
