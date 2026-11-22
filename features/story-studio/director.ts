import { sequenceDuration, sequenceList, validateProject, type Gate, type Shot, type StudioProject, type StudioSnapshot, type StudioSource, type Vec3 } from './model.ts';
import {cameraEase} from './motion-easing.ts';
import { mergeActorLife } from './actor-life.ts';
import {applyActorMotion} from './actor-motion.ts';
import {autoContinuation,createCameraVisit,usesSwitcher,type CameraOptions} from './camera-timeline.ts';
import { DEFAULT_LIGHT, sampleLight, type SceneLight } from './light.ts';

/**
 * Orden de evaluación de los cues: por instante y, si coinciden, por su posición en la lista (Array.sort es
 * estable). Es determinista y es la regla vigente; desempatar por id cambiaría historias ya guardadas
 * (decisión del 17/11/2026, plan de cámaras v2, fase 0). checks.ts avisa de los cambios de cámara simultáneos.
 */
export const byStart = (a: { at: number }, b: { at: number }) => a.at - b.at;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as unknown as Vec3;
const blendShot = (a: Shot, b: Shot, t: number): Shot => ({ position: mix(a.position, b.position, t), target: mix(a.target, b.target, t), fov: a.fov + (b.fov - a.fov) * t, transition: b.transition });
export function sampleCamera(cues:StudioProject['scenes'][number]['sequences'][number]['cues'],time:number,initial:Shot):Shot{
  let pose=structuredClone(initial),segment:{start:Shot;target:Shot;at:number}|null=null;
  const progress=(at:number,target:Shot)=>cameraEase(target.transition?(at/target.transition):1,target.easing);
  for(const cue of [...cues].filter(c=>c.kind==='camera'&&c.at<=time).sort(byStart)){
    if(cue.kind!=='camera')continue;
    if(segment)pose=blendShot(segment.start,segment.target,progress(cue.at-segment.at,segment.target));
    segment={start:pose,target:cue.shot,at:cue.at};
  }
  return segment?blendShot(segment.start,segment.target,progress(time-segment.at,segment.target)):pose;
}

/** Estado que un momento ya terminado deja al siguiente de la misma escena. */
type CarriedState = Pick<StudioSnapshot, 'actors' | 'shot' | 'performances' | 'caption'> & { light: SceneLight };
/**
 * Caché del estado al final de cada prefijo de ruta dentro de una escena. Los momentos anteriores se evalúan
 * siempre completos, así que su resultado no depende del instante: recalcularlos en cada fotograma era el
 * grueso del coste. Solo es válida para UN proyecto que no cambia (la crea cada director sobre su copia).
 */
export type SampleCache = Map<string, CarriedState>;
const SAMPLE_CACHE_SIZE = 256;

/** Reconstructs state from authored data, so back/seek/replay cannot accumulate transforms. */
export function sampleSequence(project: StudioProject, index: number, time: number, visited?: readonly number[], cache?: SampleCache, options: CameraOptions = {}): StudioSnapshot {
  const list = sequenceList(project), item = list[index];
  if (!item || !Number.isFinite(time) || time < 0) throw new Error('Momento fuera de la historia.');
  const { scene, sequence } = item;
  let actors = structuredClone(scene.actors);
  let shot = structuredClone(scene.shot);
  let performances: StudioSnapshot['performances'] = [];
  let dialogue: StudioSnapshot['dialogue'] = null;
  let caption: StudioSnapshot['caption'] = null;
  const sounds: StudioSnapshot['sounds'] = [];
  // Luz dirigida: solo si la escena la usa (luz inicial o pista «Luz»); si no, el escenario conserva la suya.
  const directsLight = scene.light !== undefined || scene.sequences.some(q => q.cues.some(c => c.kind === 'light'));
  let light: SceneLight = { ...(scene.light ?? DEFAULT_LIGHT) };
  // A skipped branch must never move an actor or change the camera/caption.
  // Entering a different scene resets its staging, including when returning later.
  const route = visited === undefined
    ? list.slice(0, index + 1)
    : [...visited, index].map(i => {
      if (!list[i]) throw new Error('Recorrido fuera de la historia.');
      return list[i];
    });
  const lastOtherScene = route.findLastIndex(item => item.scene.id !== scene.id);
  const moments = route.slice(lastOtherScene + 1).map(item => item.sequence);
  // keys[k] identifica el prefijo de k momentos terminados de esta visita a la escena.
  const keys = cache ? moments.reduce<string[]>((acc, m) => [...acc, acc.at(-1)! + '\u0000' + m.id], [scene.id]) : [];
  let first = 0;
  for (let k = moments.length - 1; cache && k > 0; k--) {
    const hit = cache.get(keys[k]);
    if (hit) { ({ actors, shot, performances, caption, light } = structuredClone(hit)); first = k; break; }
  }
  for (let step = first; step < moments.length; step++) {
    const prior = moments[step];
    const current = step === moments.length - 1;
    const localTime = current ? time : sequenceDuration(prior);
    shot=sampleCamera(prior.cues,localTime,shot);
    if (directsLight) light = sampleLight(prior.cues, localTime, light);
    for (const cue of [...prior.cues].sort(byStart)) {
      if (cue.at > localTime) continue;
      const t = Math.min(1, (localTime - cue.at) / cue.duration);
      if (cue.kind === 'actor') {
        applyActorMotion(actors, cue, t);
        // Vida en reposo: el cambio de este momento persiste en los siguientes (como la expresión).
        if (cue.vida) { const who = actors.find(a => a.id === cue.actorId); if (who) who.vida = mergeActorLife(who.vida, cue.vida); }
        // Facial direction survives subsequent body actions unless explicitly replaced.
        if (cue.expression) {
          const earlier = performances.find(a => a.actorId === cue.actorId);
          if (earlier) earlier.expression = cue.expression;
          else performances.push({ ...cue, action: 'idle' });
        }
        if (current && localTime < cue.at + cue.duration) {
          const earlier = performances.find(a => a.actorId === cue.actorId);
          if (earlier) Object.assign(earlier, { ...cue, expression: cue.expression ?? earlier.expression });
          else performances.push({ ...cue });
        }
      }
      if(cue.kind==='dialogue')caption=cue;
      if (current && cue.kind === 'dialogue' && localTime < cue.at + cue.duration) dialogue = cue;
      if (current && cue.kind === 'sound' && localTime < cue.at + cue.duration) sounds.push(cue);
    }
    if (cache && !current && !cache.has(keys[step + 1])) {
      if (cache.size >= SAMPLE_CACHE_SIZE) cache.clear();
      cache.set(keys[step + 1], structuredClone({ actors, shot, performances, caption, light }));
    }
  }
  const elapsed=moments.slice(0,-1).reduce((sum,sequence)=>sum+sequenceDuration(sequence),0)+time;
  // Switcher de cámaras con nombre: solo si esta visita lo usa (si no, el cálculo antiguo queda intacto).
  let camera: StudioSnapshot['camera'];
  if (usesSwitcher(scene, moments)) {
    const visit = cameraVisit(project, scene, moments, keys, index, time, cache, options);
    ({ shot, camera } = visit.program());
  }
  const entryDuration=scene.transition?Math.min(scene.transition.duration,sequenceDuration(scene.sequences[0])):0;
  const sceneEntry=scene.transition?{kind:scene.transition.kind,progress:entryDuration?cameraEase(elapsed/entryDuration,scene.transition.easing):1}:undefined;
  return { sceneId: scene.id, sequenceId: sequence.id, time, sceneTime: elapsed, shot, actors, performances, dialogue, caption, sounds,...(sceneEntry?{sceneEntry}:{}),...(camera?{camera}:{}),...(directsLight?{light}:{}) };
}

function cameraVisit(project: StudioProject, scene: StudioProject['scenes'][number], moments: StudioProject['scenes'][number]['sequences'], keys: string[], index: number, time: number, cache: SampleCache | undefined, options: CameraOptions) {
  const list = sequenceList(project);
  const future = autoContinuation(list, index, sequenceDuration(list[index].sequence) - time);
  return createCameraVisit(scene, moments, future, time, k => cache?.get(keys[k])?.actors, options);
}

/** Visita de cámaras en un instante, para la interfaz («ir a la cámara», congelar al borrar, auditorías). */
export function cameraVisitAt(project: StudioProject, index: number, time: number, visited?: readonly number[], options: CameraOptions = {}) {
  const list = sequenceList(project), item = list[index];
  if (!item) throw new Error('Momento fuera de la historia.');
  const route = visited === undefined ? list.slice(0, index + 1) : [...visited, index].map(i => list[i]);
  const moments = route.slice(route.findLastIndex(x => x.scene.id !== item.scene.id) + 1).map(x => x.sequence);
  return cameraVisit(project, item.scene, moments, [], index, Math.min(time, sequenceDuration(item.sequence)), undefined, options);
}

export function createStudioDirector(projectInput: StudioProject, source: StudioSource, cameraOptions: CameraOptions = {}) {
  validateProject(projectInput, source);
  // La copia es privada y nunca cambia: por eso la caché de prefijos de ruta es segura aquí.
  const project = structuredClone(projectInput), list = sequenceList(project), cache: SampleCache = new Map();
  let index = 0, time = 0, state: 'paused' | 'playing' | 'waiting' | 'finished' = 'paused';
  let waitingFromPause = false;
  let history:number[]=[];
  // Author seeking previews the preceding authored staging. Student playback and
  // restored checkpoints reconstruct only the route that was actually visited.
  let previewPrefix:number[]=[];
  const snapshot = () => ({ index, time, state, gate: list[index].sequence.gate, duration: sequenceDuration(list[index].sequence), stage: sampleSequence(project, index, time,[...previewPrefix,...history],cache,cameraOptions),canGoBack:history.length>0,path:history.map(i=>list[i].sequence.id) });
  function advance(nextSequenceId?: string) {
    const target = nextSequenceId ?? list[index].sequence.gate.nextSequenceId;
    const next = target ? list.findIndex(x => x.sequence.id === target) : index + 1;
    if (next < 0) throw new Error('Camino no definido.');
    if (next >= list.length) { state = 'finished'; return snapshot(); }
    history=[...history.slice(-999),index];index = next; time = 0; state = 'playing'; return snapshot();
  }
  const normalize = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('es').replace(/[.!?¿¡]+$/g, '').trim();
  return {
    snapshot,
    /**
     * Fotogramas futuros del momento actual (sin cambiar el estado): el motor interpola entre ellos en su propio
     * bucle, porque los mensajes llegan a ~10 Hz. Solo cámara y actores; deterministas como el snapshot.
     */
    lookahead(seconds = .25, step = 1 / 60) {
      if (state !== 'playing' || !(seconds > 0) || !(step > 0)) return null;
      const duration = sequenceDuration(list[index].sequence), route = [...previewPrefix, ...history], frames = [];
      for (let k = 0; k * step <= seconds + 1e-9 && frames.length < 64; k++) {
        const t = Math.min(duration, time + k * step), s = sampleSequence(project, index, t, route, cache, cameraOptions);
        frames.push({ time: t, shot: s.shot, actors: s.actors.map(a => [a.position[0], a.position[1], a.position[2], a.rotation] as const) });
        if (t >= duration) break;
      }
      return { sequenceId: list[index].sequence.id, from: time, step, frames };
    },
    setCameraOptions(next: CameraOptions) { cameraOptions = { ...next }; return snapshot(); },
    play() { if (state === 'finished') { index = 0; time = 0; state='playing'; waitingFromPause=false;history=[];previewPrefix=[]; } if (state === 'paused') state = waitingFromPause ? 'waiting' : 'playing'; return snapshot(); },
    pause() { if (state === 'playing' || state === 'waiting') { waitingFromPause = state === 'waiting'; state = 'paused'; } return snapshot(); },
    seek(nextIndex: number, nextTime = 0) {
      if (!Number.isInteger(nextIndex) || !list[nextIndex] || !Number.isFinite(nextTime) || nextTime < 0) throw new Error('Momento fuera de la historia.');
      index = nextIndex; time = Math.min(nextTime, sequenceDuration(list[index].sequence)); state = 'paused'; waitingFromPause = false;history=[];previewPrefix=Array.from({length:index},(_,i)=>i); return snapshot();
    },
    back(){const previous=history.pop();if(previous===undefined)return snapshot();index=previous;time=0;state='paused';waitingFromPause=false;return snapshot();},
    restore(checkpoint:{sequenceId:string;time:number;finished:boolean;path:string[]}){
      const target=list.findIndex(x=>x.sequence.id===checkpoint.sequenceId);
      if(target<0||!Number.isFinite(checkpoint.time)||checkpoint.time<0||checkpoint.time>sequenceDuration(list[target].sequence)||!Array.isArray(checkpoint.path)||checkpoint.path.length>1000||typeof checkpoint.finished!=='boolean')throw new Error('Punto de lectura incompatible.');
      const indices=checkpoint.path.map(id=>list.findIndex(x=>x.sequence.id===id));
      if(indices.some(i=>i<0))throw new Error('El recorrido guardado no pertenece a la historia.');
      const route=[...indices,target];
      for(let n=0;n<route.length-1;n++){
        const at=route[n],gate=list[at].sequence.gate;
        const ordinary=list[at+1]?.sequence.id;
        const allowed=gate.kind==='choice'?gate.options.map(o=>o.nextSequenceId??gate.nextSequenceId??ordinary):[gate.nextSequenceId??ordinary];
        if(!allowed.includes(list[route[n+1]].sequence.id))throw new Error('El recorrido guardado contiene un camino no autorizado.');
      }
      if(checkpoint.finished&&(target!==list.length-1||checkpoint.time<sequenceDuration(list[target].sequence)))throw new Error('La historia guardada no había terminado.');
      index=target;time=checkpoint.time;history=indices;previewPrefix=[];state=checkpoint.finished?'finished':'paused';waitingFromPause=time>=sequenceDuration(list[index].sequence)&&list[index].sequence.gate.kind!=='auto';return snapshot();
    },
    tick(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Tiempo inválido.');
      if (state !== 'playing') return snapshot();
      // Never consume student waiting time as animation time, even after a sleeping tab.
      time = Math.min(time + seconds, sequenceDuration(list[index].sequence));
      if (time >= sequenceDuration(list[index].sequence)) {
        if (list[index].sequence.gate.kind === 'auto') return advance();
        state = 'waiting';
      }
      return snapshot();
    },
    respond(response: { kind: Gate['kind']; value?: string }) {
      const gate = list[index].sequence.gate;
      if (state !== 'waiting' || response.kind !== gate.kind) return { accepted: false, snapshot: snapshot() };
      if (gate.kind === 'choice') {
        const option = gate.options.find(o => o.id === response.value);
        return option ? { accepted: true, snapshot: advance(option.nextSequenceId) } : { accepted: false, snapshot: snapshot() };
      }
      if (gate.kind === 'answer' && !gate.answers.some(v => normalize(v) === normalize(response.value ?? ''))) return { accepted: false, snapshot: snapshot() };
      if (gate.kind === 'object' && !gate.entryIds.includes(response.value ?? '')) return { accepted: false, snapshot: snapshot() };
      return { accepted: true, snapshot: advance() };
    },
  };
}
export type StudioDirector = ReturnType<typeof createStudioDirector>;
