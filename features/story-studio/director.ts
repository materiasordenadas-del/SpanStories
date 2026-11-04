import { sequenceDuration, sequenceList, validateProject, type Gate, type Shot, type StudioProject, type StudioSnapshot, type StudioSource, type Vec3 } from './model.ts';

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as unknown as Vec3;
const blendShot = (a: Shot, b: Shot, t: number): Shot => ({ position: mix(a.position, b.position, t), target: mix(a.target, b.target, t), fov: a.fov + (b.fov - a.fov) * t, transition: b.transition });

/** Reconstructs state from authored data, so back/seek/replay cannot accumulate transforms. */
export function sampleSequence(project: StudioProject, index: number, time: number, visited?: readonly number[]): StudioSnapshot {
  const list = sequenceList(project), item = list[index];
  if (!item || !Number.isFinite(time) || time < 0) throw new Error('Momento fuera de la historia.');
  const { scene, sequence } = item;
  const actors = structuredClone(scene.actors);
  let shot = structuredClone(scene.shot);
  const performances: StudioSnapshot['performances'] = [];
  let dialogue: StudioSnapshot['dialogue'] = null;
  let caption: StudioSnapshot['caption'] = null;
  const sounds: StudioSnapshot['sounds'] = [];
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
  const sceneTime = moments.slice(0, -1).reduce((sum, prior) => sum + sequenceDuration(prior), 0) + time;
  for (const [step, prior] of moments.entries()) {
    const current = step === moments.length - 1;
    const localTime = current ? time : sequenceDuration(prior);
    for (const cue of [...prior.cues].sort((a, b) => a.at - b.at)) {
      if (cue.at > localTime) continue;
      const t = Math.min(1, (localTime - cue.at) / cue.duration);
      if (cue.kind === 'camera') shot = blendShot(shot, cue.shot, cue.shot.transition ? Math.min(1, (localTime - cue.at) / cue.shot.transition) : 1);
      if (cue.kind === 'actor') {
        const actor = actors.find(a => a.id === cue.actorId)!;
        if (cue.destination) actor.position = mix(actor.position, cue.destination, t);
        if(cue.rotation!==undefined)actor.rotation+=Math.atan2(Math.sin(cue.rotation-actor.rotation),Math.cos(cue.rotation-actor.rotation))*t;
        if (cue.lookAt) {
          const other = actors.find(a => a.id === cue.lookAt)!;
          const facing=Math.atan2(other.position[0] - actor.position[0], other.position[2] - actor.position[2]);
          actor.rotation+=Math.atan2(Math.sin(facing-actor.rotation),Math.cos(facing-actor.rotation))*t;
        }
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
  }
  return { sceneId: scene.id, sequenceId: sequence.id, time, sceneTime, shot, actors, performances, dialogue, caption, sounds };
}

export function createStudioDirector(projectInput: StudioProject, source: StudioSource) {
  validateProject(projectInput, source);
  const project = structuredClone(projectInput), list = sequenceList(project);
  let index = 0, time = 0, state: 'paused' | 'playing' | 'waiting' | 'finished' = 'paused';
  let waitingFromPause = false;
  let history:number[]=[];
  // Author seeking previews the preceding authored staging. Student playback and
  // restored checkpoints reconstruct only the route that was actually visited.
  let previewPrefix:number[]=[];
  const snapshot = () => ({ index, time, state, gate: list[index].sequence.gate, duration: sequenceDuration(list[index].sequence), stage: sampleSequence(project, index, time,[...previewPrefix,...history]),canGoBack:history.length>0,path:history.map(i=>list[i].sequence.id) });
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
