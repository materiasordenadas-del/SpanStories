import { sequenceDuration, sequenceList, type Actor, type Cue, type Sequence, type StudioProject, type StudioScene, type StudioSource } from './model.ts';

/**
 * Pure authoring operations for Story Studio. Each one returns a new project and never
 * mutates its input, so the editor can validate the result and push it onto undo history.
 */
export type TrackKey = 'camera' | 'dialogue' | 'sound' | `actor:${string}`;
export const cueTrack = (cue: Cue): TrackKey => cue.kind === 'actor' ? `actor:${cue.actorId}` : cue.kind;
const round = (n: number) => Math.round(n * 100) / 100;
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const EPSILON = 1e-6;

function locate(project: StudioProject, sequenceId: string) {
  for (const scene of project.scenes) {
    const index = scene.sequences.findIndex(s => s.id === sequenceId);
    if (index >= 0) return { scene, sequence: scene.sequences[index], index };
  }
  throw new Error('El momento ya no existe.');
}
function sceneOf(project: StudioProject, sceneId: string) {
  const scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error('La escena ya no existe.');
  return scene;
}

/* ───────────── Timing ───────────── */

/** First free instant on a track at or after the playhead, so new cues never stack at 0 s. */
export function nextCueStart(sequence: Sequence, track: TrackKey, playhead: number): number {
  const busy = sequence.cues.filter(c => cueTrack(c) === track);
  let at = Math.max(0, Number.isFinite(playhead) ? playhead : 0);
  for (let guard = 0; guard <= busy.length; guard++) {
    const overlap = busy.find(c => at >= c.at - EPSILON && at < c.at + c.duration - EPSILON);
    if (!overlap) break;
    at = overlap.at + overlap.duration;
  }
  return round(at);
}

/** Reading time for a learner: about two words per second plus a pause to absorb the line. */
export function dialogueDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return round(Math.min(60, Math.max(1.5, words / 2 + 1)));
}

/** Magnetic edges: 0 s and the start/end of every other cue in the sequence. */
export function snapTime(time: number, sequence: Sequence, excludeIds: readonly string[], threshold = 0.15): number {
  let best = time, distance = threshold;
  const candidates = [0, ...sequence.cues.filter(c => !excludeIds.includes(c.id)).flatMap(c => [c.at, c.at + c.duration])];
  for (const candidate of candidates) {
    const d = Math.abs(candidate - time);
    if (d <= distance) { best = candidate; distance = d; }
  }
  return round(Math.max(0, best));
}

/** Applies magnetic snapping to a moved/resized cue: the start wins, otherwise the end. */
export function snapCue(sequence: Sequence, cueId: string, at: number, duration: number, threshold = 0.15): { at: number; duration: number } {
  const start = snapTime(at, sequence, [cueId], threshold);
  if (start !== round(at)) return { at: start, duration: round(Math.max(0.05, duration)) };
  const end = snapTime(at + duration, sequence, [cueId], threshold);
  return { at: round(Math.max(0, at)), duration: round(Math.max(0.05, end - Math.max(0, at))) };
}

/* ───────────── Cues ───────────── */

export function deleteCue(project: StudioProject, sequenceId: string, cueId: string): StudioProject {
  const copy = structuredClone(project), { sequence } = locate(copy, sequenceId);
  const before = sequence.cues.length;
  sequence.cues = sequence.cues.filter(c => c.id !== cueId);
  if (sequence.cues.length === before) throw new Error('La acción ya no existe.');
  // Automatic acting belongs to its dialogue line and goes with it.
  sequence.cues = sequence.cues.filter(c => !c.id.startsWith(`auto:${cueId}:`));
  return copy;
}

export function duplicateCue(project: StudioProject, sequenceId: string, cueId: string): { project: StudioProject; id: string } {
  const copy = structuredClone(project), { sequence } = locate(copy, sequenceId);
  const original = sequence.cues.find(c => c.id === cueId);
  if (!original) throw new Error('La acción ya no existe.');
  const id = newId('cue');
  const at = nextCueStart(sequence, cueTrack(original), original.at + original.duration);
  sequence.cues.push({ ...structuredClone(original), id, at });
  return { project: copy, id };
}

/** Starts a cue exactly when another one ends (same sequence). */
export function chainCue(project: StudioProject, sequenceId: string, cueId: string, afterId: string): StudioProject {
  const copy = structuredClone(project), { sequence } = locate(copy, sequenceId);
  const cue = sequence.cues.find(c => c.id === cueId), after = sequence.cues.find(c => c.id === afterId);
  if (!cue || !after || cue.id === after.id) throw new Error('No se puede encadenar con esa acción.');
  cue.at = round(after.at + after.duration);
  return copy;
}

/* ───────────── Actors ───────────── */

export function deleteActor(project: StudioProject, sceneId: string, actorId: string): StudioProject {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  if (!scene.actors.some(a => a.id === actorId)) throw new Error('El personaje ya no existe.');
  scene.actors = scene.actors.filter(a => a.id !== actorId);
  for (const sequence of scene.sequences) {
    sequence.cues = sequence.cues.filter(c => !(c.kind === 'actor' && c.actorId === actorId));
    for (const cue of sequence.cues) {
      if (cue.kind === 'actor' && cue.lookAt === actorId) delete cue.lookAt;
      if (cue.kind === 'dialogue' && cue.speakerId === actorId) cue.speakerId = null;
    }
  }
  return copy;
}

/* ───────────── Sequences and scenes ───────────── */

function dropSequenceReferences(project: StudioProject, removed: ReadonlySet<string>) {
  for (const { sequence } of sequenceList(project)) {
    const gate = sequence.gate;
    if (gate.nextSequenceId && removed.has(gate.nextSequenceId)) delete gate.nextSequenceId;
    if (gate.kind === 'choice') for (const option of gate.options) if (option.nextSequenceId && removed.has(option.nextSequenceId)) delete option.nextSequenceId;
  }
  if (project.nodeLayout) for (const key of Object.keys(project.nodeLayout)) if (removed.has(key.replace(/:gate$/, ''))) delete project.nodeLayout[key];
}

/** Sequences whose gate points at one of the given sequences (for confirmation messages). */
export function incomingReferences(project: StudioProject, targetIds: readonly string[]): Sequence[] {
  const targets = new Set(targetIds);
  return sequenceList(project).map(x => x.sequence).filter(s => !targets.has(s.id) && (
    (s.gate.nextSequenceId !== undefined && targets.has(s.gate.nextSequenceId)) ||
    (s.gate.kind === 'choice' && s.gate.options.some(o => o.nextSequenceId !== undefined && targets.has(o.nextSequenceId)))));
}

export function deleteSequence(project: StudioProject, sequenceId: string): StudioProject {
  const copy = structuredClone(project), { scene } = locate(copy, sequenceId);
  if (scene.sequences.length === 1) throw new Error('Una escena necesita al menos un momento. Para quitarlo, borra la escena.');
  scene.sequences = scene.sequences.filter(s => s.id !== sequenceId);
  dropSequenceReferences(copy, new Set([sequenceId]));
  return copy;
}

export function deleteScene(project: StudioProject, sceneId: string): StudioProject {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  if (copy.scenes.length === 1) throw new Error('La historia necesita al menos una escena.');
  copy.scenes = copy.scenes.filter(s => s.id !== sceneId);
  dropSequenceReferences(copy, new Set(scene.sequences.map(s => s.id)));
  return copy;
}

function cloneSequence(sequence: Sequence, remapActor: (id: string) => string = id => id): Sequence {
  const cueIds = new Map(sequence.cues.map(c => [c.id, newId('cue')]));
  return {
    ...structuredClone(sequence), id: newId('sequence'),
    cues: sequence.cues.map(c => {
      const cue = structuredClone(c);
      // Automatic acting keeps pointing at its (cloned) dialogue line.
      const auto = /^auto:([^:]+):(.*)$/.exec(c.id);
      cue.id = auto && cueIds.has(auto[1]) ? `auto:${cueIds.get(auto[1])}:${auto[2].replace(/listen:(.+)$/, (_, a: string) => `listen:${remapActor(a)}`)}` : cueIds.get(c.id)!;
      if (cue.kind === 'actor') { cue.actorId = remapActor(cue.actorId); if (cue.lookAt) cue.lookAt = remapActor(cue.lookAt); }
      if (cue.kind === 'dialogue' && cue.speakerId) cue.speakerId = remapActor(cue.speakerId);
      return cue;
    }),
  };
}

export function duplicateSequence(project: StudioProject, sequenceId: string): { project: StudioProject; id: string } {
  const copy = structuredClone(project), { scene, sequence, index } = locate(copy, sequenceId);
  const clone = cloneSequence(sequence);
  clone.name = `${sequence.name} (copia)`.slice(0, 180);
  scene.sequences.splice(index + 1, 0, clone);
  return { project: copy, id: clone.id };
}

export function createSequence(project: StudioProject, sceneId: string, afterSequenceId?: string, init?: Partial<Pick<Sequence, 'name' | 'cues'>>): { project: StudioProject; id: string } {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  const id = newId('sequence');
  const at = afterSequenceId ? scene.sequences.findIndex(s => s.id === afterSequenceId) : -1;
  scene.sequences.splice(at >= 0 ? at + 1 : scene.sequences.length, 0, { id, name: init?.name?.slice(0, 180) || 'Nuevo momento', cues: init?.cues ?? [], gate: { kind: 'continue', prompt: 'Continúa cuando quieras.' } });
  return { project: copy, id };
}

/** Adds a scene after another: an empty stage in the same place, or a full copy with new identities. */
export function addScene(project: StudioProject, fromSceneId: string, mode: 'empty' | 'copy'): { project: StudioProject; sceneId: string; sequenceId: string } {
  const copy = structuredClone(project), from = sceneOf(copy, fromSceneId), index = copy.scenes.indexOf(from);
  let scene: StudioScene;
  if (mode === 'empty') {
    scene = { id: newId('scene'), name: 'Nueva escena', zoneId: from.zoneId, shot: structuredClone(from.shot), actors: [], entryIds: [], sequences: [{ id: newId('sequence'), name: 'Nuevo momento', cues: [], gate: { kind: 'continue', prompt: 'Continúa cuando quieras.' } }] };
    if (from.ambient) scene.ambient = from.ambient;
  } else {
    const actorIds = new Map(from.actors.map(a => [a.id, newId('actor')]));
    const remap = (id: string) => actorIds.get(id) ?? id;
    const sequences = from.sequences.map(s => cloneSequence(s, remap));
    const sequenceIds = new Map(from.sequences.map((s, i) => [s.id, sequences[i].id]));
    // Paths inside the copied scene follow the copy; paths leaving it keep their destination.
    for (const sequence of sequences) {
      const gate = sequence.gate;
      if (gate.nextSequenceId) gate.nextSequenceId = sequenceIds.get(gate.nextSequenceId) ?? gate.nextSequenceId;
      if (gate.kind === 'choice') for (const option of gate.options) if (option.nextSequenceId) option.nextSequenceId = sequenceIds.get(option.nextSequenceId) ?? option.nextSequenceId;
    }
    scene = { ...structuredClone(from), id: newId('scene'), name: `${from.name} (copia)`.slice(0, 180), actors: from.actors.map(a => ({ ...structuredClone(a), id: remap(a.id) })), sequences };
  }
  copy.scenes.splice(index + 1, 0, scene);
  return { project: copy, sceneId: scene.id, sequenceId: scene.sequences[0].id };
}

const moveItem = <T,>(items: T[], from: number, to: number) => { const [item] = items.splice(from, 1); items.splice(Math.max(0, Math.min(items.length, to)), 0, item); };

/** Reorders a moment inside its scene. The default "next moment" follows the new order. */
export function moveSequence(project: StudioProject, sequenceId: string, toIndex: number): StudioProject {
  const copy = structuredClone(project), { scene, index } = locate(copy, sequenceId);
  moveItem(scene.sequences, index, toIndex);
  return copy;
}
export function moveScene(project: StudioProject, sceneId: string, toIndex: number): StudioProject {
  const copy = structuredClone(project), index = copy.scenes.findIndex(s => s.id === sceneId);
  if (index < 0) throw new Error('La escena ya no existe.');
  moveItem(copy.scenes, index, toIndex);
  return copy;
}

/** Changing place invalidates touchable objects: "touch an object" gates fall back to waiting. */
export function changeSceneZone(project: StudioProject, sceneId: string, zoneId: string): { project: StudioProject; convertedGates: number } {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  if (scene.zoneId === zoneId) return { project: copy, convertedGates: 0 };
  scene.zoneId = zoneId; scene.entryIds = [];
  let convertedGates = 0;
  for (const sequence of scene.sequences) if (sequence.gate.kind === 'object') {
    sequence.gate = { kind: 'continue', prompt: 'Continúa cuando quieras.', ...(sequence.gate.nextSequenceId ? { nextSequenceId: sequence.gate.nextSequenceId } : {}) };
    convertedGates++;
  }
  return { project: copy, convertedGates };
}

/** Removing a touchable object also removes it from "touch an object" gates (falling back to waiting when empty). */
export function setSceneEntries(project: StudioProject, sceneId: string, entryIds: readonly string[]): StudioProject {
  const copy = structuredClone(project), scene = sceneOf(copy, sceneId);
  scene.entryIds = [...new Set(entryIds)];
  for (const sequence of scene.sequences) if (sequence.gate.kind === 'object') {
    const kept = sequence.gate.entryIds.filter(id => scene.entryIds.includes(id));
    if (kept.length) sequence.gate.entryIds = kept;
    else sequence.gate = { kind: 'continue', prompt: 'Continúa cuando quieras.', ...(sequence.gate.nextSequenceId ? { nextSequenceId: sequence.gate.nextSequenceId } : {}) };
  }
  return copy;
}

/* ───────────── Flow analysis ───────────── */

export type FlowIssue = { code: 'unreachable' | 'trapped' | 'duplicate-options' | 'auto-loop' | 'empty'; message: string };
const END = '__end__';

/** Successors exactly as the director resolves them (explicit path, else next in order, else the end). */
export function flowSuccessors(project: StudioProject): Map<string, string[]> {
  const list = sequenceList(project), result = new Map<string, string[]>();
  list.forEach(({ sequence }, i) => {
    const ordinary = list[i + 1]?.sequence.id ?? END, gate = sequence.gate;
    result.set(sequence.id, gate.kind === 'choice' ? gate.options.map(o => o.nextSequenceId ?? gate.nextSequenceId ?? ordinary) : [gate.nextSequenceId ?? ordinary]);
  });
  return result;
}

export function analyzeFlow(project: StudioProject): Map<string, FlowIssue[]> {
  const list = sequenceList(project), next = flowSuccessors(project), issues = new Map<string, FlowIssue[]>();
  const add = (id: string, issue: FlowIssue) => issues.set(id, [...(issues.get(id) ?? []), issue]);
  if (!list.length) return issues;
  const reachable = new Set<string>([list[0].sequence.id]), queue = [list[0].sequence.id];
  while (queue.length) for (const target of next.get(queue.shift()!) ?? []) if (target !== END && !reachable.has(target)) { reachable.add(target); queue.push(target); }
  // Reverse search from the end: which moments can still finish the story?
  const finishing = new Set<string>(), previous = new Map<string, string[]>();
  for (const [from, targets] of next) for (const target of targets) previous.set(target, [...(previous.get(target) ?? []), from]);
  const back = [END];
  while (back.length) for (const from of previous.get(back.shift()!) ?? []) if (!finishing.has(from)) { finishing.add(from); back.push(from); }
  for (const { sequence } of list) {
    if (!reachable.has(sequence.id)) add(sequence.id, { code: 'unreachable', message: 'Ningún camino llega a este momento.' });
    else if (!finishing.has(sequence.id)) add(sequence.id, { code: 'trapped', message: 'Desde aquí la historia no puede terminar: el camino forma un bucle sin salida.' });
    const gate = sequence.gate;
    if (gate.kind === 'choice') {
      const targets = next.get(sequence.id)!;
      if (new Set(targets).size < targets.length) add(sequence.id, { code: 'duplicate-options', message: 'Varias opciones llevan al mismo momento.' });
    }
    if (!sequence.cues.length) add(sequence.id, { code: 'empty', message: 'El momento no tiene acciones.' });
  }
  // A loop made only of automatic moments replays forever without the student.
  for (const { sequence } of list) {
    if (sequence.gate.kind !== 'auto') continue;
    const seen = new Set<string>();
    let cursor: string | undefined = sequence.id;
    while (cursor && cursor !== END && !seen.has(cursor)) {
      seen.add(cursor);
      const item = list.find(x => x.sequence.id === cursor);
      if (!item || item.sequence.gate.kind !== 'auto') { cursor = undefined; break; }
      cursor = next.get(cursor)?.[0];
    }
    if (cursor === sequence.id) add(sequence.id, { code: 'auto-loop', message: 'Bucle automático: se repetiría sin intervención del estudiante.' });
  }
  return issues;
}

/* ───────────── Dialogue ───────────── */

export type SentenceUse = { sceneId: string; sequenceId: string; cueId: string; speakerId: string | null; audio: boolean };
export function sentenceCoverage(project: StudioProject, source: StudioSource) {
  const uses = new Map<string, SentenceUse[]>(source.sentences.map(s => [s.id, []]));
  const options = new Map<string, number>();
  for (const scene of project.scenes) for (const sequence of scene.sequences) {
    for (const cue of sequence.cues) if (cue.kind === 'dialogue') uses.get(cue.sentenceId)?.push({ sceneId: scene.id, sequenceId: sequence.id, cueId: cue.id, speakerId: cue.speakerId, audio: !!cue.audioUrl });
    if (sequence.gate.kind === 'choice') for (const option of sequence.gate.options) if (option.sentenceId) options.set(option.sentenceId, (options.get(option.sentenceId) ?? 0) + 1);
  }
  const used = [...uses.values()].filter(u => u.length).length;
  const repeated = [...uses.values()].filter(u => u.length > 1).length;
  return { uses, options, used, unused: source.sentences.length - used, repeated, total: source.sentences.length };
}

/** Next line to direct: the first sentence after the last one already staged, else the first unused one. */
export function suggestSentence(project: StudioProject, source: StudioSource): string | null {
  if (!source.sentences.length) return null;
  const { uses } = sentenceCoverage(project, source);
  const lastUsed = source.sentences.reduce((last, s, i) => (uses.get(s.id)?.length ? i : last), -1);
  return (source.sentences.slice(lastUsed + 1).find(s => !uses.get(s.id)?.length) ?? source.sentences.find(s => !uses.get(s.id)?.length) ?? source.sentences[0]).id;
}

/** "Samuel: Hola." names its speaker; otherwise the last speaker chosen in this scene; otherwise the narrator. */
export function guessSpeaker(text: string, actors: readonly Actor[], lastSpeakerId: string | null): string | null {
  const prefix = /^\s*([^:\n]{1,40}):/.exec(text)?.[1]?.trim().toLocaleLowerCase('es');
  const named = prefix ? actors.find(a => a.name.trim().toLocaleLowerCase('es') === prefix) : undefined;
  if (named) return named.id;
  return lastSpeakerId && actors.some(a => a.id === lastSpeakerId) ? lastSpeakerId : null;
}

/** Places a dialogue line in a moment at the first free instant, timed for reading. */
export function placeDialogue(project: StudioProject, sequenceId: string, sentenceId: string, speakerId: string | null, playhead: number, source: StudioSource): { project: StudioProject; id: string } {
  const copy = structuredClone(project), { sequence } = locate(copy, sequenceId);
  const text = source.sentences.find(s => s.id === sentenceId)?.text;
  if (text === undefined) throw new Error('La frase no pertenece a esta versión de la Story.');
  const id = newId('dialogue');
  sequence.cues.push({ id, kind: 'dialogue', at: nextCueStart(sequence, 'dialogue', playhead), duration: dialogueDuration(text), sentenceId, speakerId });
  return { project: copy, id };
}

/** Script view: one new moment per unused sentence, in Story order, after the given moment. */
export function stageUnusedSentences(project: StudioProject, source: StudioSource, sceneId: string, afterSequenceId: string, lastSpeakerId: string | null): { project: StudioProject; created: number } {
  let current = project, after = afterSequenceId, created = 0;
  const { uses } = sentenceCoverage(project, source);
  const actors = sceneOf(project, sceneId).actors;
  for (const sentence of source.sentences) {
    if (uses.get(sentence.id)?.length) continue;
    const made = createSequence(current, sceneId, after, { name: sentence.text.slice(0, 36) || 'Nuevo momento' });
    const placed = placeDialogue(made.project, made.id, sentence.id, guessSpeaker(sentence.text, actors, lastSpeakerId), 0, source);
    current = placed.project; after = made.id; created++;
  }
  return { project: current, created };
}

/**
 * Automatic acting for a dialogue line: the speaker talks, the others listen and look at them.
 * Hand-made actor cues overlapping the line are respected (that actor is skipped).
 */
export function autoStageDialogue(project: StudioProject, sequenceId: string, dialogueId: string): { project: StudioProject; created: number; skipped: string[] } {
  const copy = structuredClone(project), { scene, sequence } = locate(copy, sequenceId);
  const line = sequence.cues.find(c => c.id === dialogueId);
  if (!line || line.kind !== 'dialogue') throw new Error('Selecciona una intervención.');
  const prefix = `auto:${dialogueId}:`;
  sequence.cues = sequence.cues.filter(c => !c.id.startsWith(prefix));
  const skipped: string[] = [];
  let created = 0;
  if (!line.speakerId) return { project: copy, created, skipped };
  const speakerId = line.speakerId;
  const overlaps = (actorId: string) => sequence.cues.some(c => c.kind === 'actor' && c.actorId === actorId && c.at < line.at + line.duration - EPSILON && c.at + c.duration > line.at + EPSILON);
  for (const actor of scene.actors) {
    if (overlaps(actor.id)) { skipped.push(actor.name); continue; }
    const base = { at: line.at, duration: line.duration, kind: 'actor' as const, actorId: actor.id };
    sequence.cues.push(actor.id === speakerId
      ? { ...base, id: `${prefix}talk`, action: 'talk' }
      : { ...base, id: `${prefix}listen:${actor.id}`, action: 'listen', lookAt: speakerId });
    created++;
  }
  return { project: copy, created, skipped };
}

/** Story-wide duration of a moment, used by the overview strip. */
export const momentDuration = (sequence: Sequence) => Math.max(0.5, sequenceDuration(sequence));
