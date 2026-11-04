import type { StoryReaderViewModel } from '../story-reader/model.ts';
import type { Story } from '../story-engine/domain/model.ts';
import type { NewVersionInput } from '../story-engine/repository/story-repository.ts';
import { validateLife, type SceneLife } from './life.ts';
/** Direction is a versioned layer over Story Engine content; never a second copy of its text. */
export type Vec3 = readonly [number, number, number];
export type Shot = { position: Vec3; target: Vec3; fov: number; transition: number };
export type Actor = { id: string; characterId: string; name: string; position: Vec3; rotation: number; height: number };
export type Cue = {
  id: string; at: number; duration: number;
} & (
  | { kind: 'camera'; shot: Shot; label: string }
  | { kind: 'actor'; actorId: string; action: 'idle' | 'walk' | 'turn' | 'look' | 'talk' | 'listen' | 'wave' | 'nod'; destination?: Vec3; lookAt?: string; expression?: string; clipName?: string;rotation?:number }
  | { kind: 'dialogue'; sentenceId: string; speakerId: string | null; audioUrl?: string }
  | { kind: 'sound'; audioUrl: string; volume: number; label: string }
);
export type Gate = (
  | { kind: 'auto' }
  | { kind: 'continue'; prompt: string }
  | { kind: 'choice'; prompt: string; options: { id: string; label: string; nextSequenceId?: string; sentenceId?: string }[] }
  | { kind: 'answer'; prompt: string; answers: string[] }
  | { kind: 'object'; prompt: string; entryIds: string[] }
) & { nextSequenceId?: string };
export type Sequence = { id: string; name: string; cues: Cue[]; gate: Gate };
/** Lighting presets understood by the shared city light (Luz25D). Absent = keep the viewer's current light. */
export const SCENE_AMBIENTS = ['manana', 'mediodia', 'tarde', 'nublado', 'noche'] as const;
export type SceneAmbient = typeof SCENE_AMBIENTS[number];
export type StudioScene = { id: string; name: string; zoneId: string; actors: Actor[]; shot: Shot; entryIds: string[]; sequences: Sequence[]; ambient?: SceneAmbient;
  /** Vida ambiental: NPC grabados una vez en el estudio (ver life.ts). */
  life?: SceneLife };
export type StudioProject = {
  schema: 1; id: string; name: string; storyId: string; storyVersionId: string;
  revision: number; scenes: StudioScene[];
  navigation: { allowLook: boolean; travel: 'directed' };
  nodeLayout?: Record<string, { x: number; y: number }>;
};
export type StudioSource = {
  storyId: string; storyVersionId: string; title: string; status: 'DRAFT' | 'PUBLISHED'; blueprintId: string | null;
  sentences: readonly { id: string; text: string }[];
  reader?: StoryReaderViewModel;
  versionNumber?:number;
  engine?:{story:Story;content:NewVersionInput};
};
export type StudioSnapshot = {
  sceneId: string; sequenceId: string; time: number;
  /** Tiempo acumulado dentro de la escena: reloj determinista de la vida ambiental. */
  sceneTime: number;
  shot: Shot; actors: Actor[];
  performances: Extract<Cue, { kind: 'actor' }>[];
  dialogue: Extract<Cue, { kind: 'dialogue' }> | null;
  caption: Extract<Cue, { kind: 'dialogue' }> | null;
  sounds: Extract<Cue, { kind: 'sound' }>[];
};
export const sequenceDuration = (sequence: Sequence) => Math.max(0, ...sequence.cues.map(cue => cue.at + cue.duration));
export function sequenceList(project: StudioProject) {
  return project.scenes.flatMap(scene => scene.sequences.map(sequence => ({ scene, sequence })));
}

/** JSON is accepted from files/storage/messages, so TypeScript alone is insufficient. */
export function validateProject(raw: unknown, source: StudioSource): asserts raw is StudioProject {
  const fail = (message: string): never => { throw new Error(message); };
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 180;
  const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000);
  const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(id);
  const shot = (v: unknown) => obj(v) && vec(v.position) && vec(v.target) && v.position.some((n, i) => n !== (v.target as Vec3)[i]) && number(v.fov, 10, 100) && number(v.transition, 0, 30);
  const media = (v: unknown) => typeof v === 'string' && v.length < 2048 && (/^(\/[^/]|\.\/|\.\.\/|https?:\/\/)/.test(v)||/^studio-audio:[a-f0-9]{64}$/.test(v));
  if (!obj(raw) || raw.schema !== 1 || !id(raw.id) || !id(raw.name) || raw.storyId !== source.storyId || raw.storyVersionId !== source.storyVersionId || !Number.isInteger(raw.revision) || (raw.revision as number) < 0) fail('Identidad o versión de la Story incompatible.');
  const p = raw as unknown as StudioProject;
  if (!p.navigation || typeof p.navigation.allowLook !== 'boolean' || p.navigation.travel !== 'directed') fail('El desplazamiento del estudiante debe estar dirigido.');
  if (!Array.isArray(p.scenes) || p.scenes.length === 0 || p.scenes.length > 100) fail('La historia necesita entre 1 y 100 escenas.');
  const ids = new Set<string>(), sequences = new Set<string>();
  const unique = (v: unknown) => { if (!id(v) || ids.has(v)) fail('Identidad narrativa vacía o duplicada.'); ids.add(v as string); };
  for (const scene of p.scenes) {
    if (!obj(scene)) fail('Escena inválida.');
    unique(scene.id);
    if (!id(scene.name) || !id(scene.zoneId) || !shot(scene.shot) || !strings(scene.entryIds) || !Array.isArray(scene.actors) || scene.actors.length > 20 || !Array.isArray(scene.sequences) || !scene.sequences.length) fail('Escenario, cámara o secuencias inválidos.');
    if (scene.ambient !== undefined && !(SCENE_AMBIENTS as readonly string[]).includes(scene.ambient)) fail('Ambiente de luz desconocido.');
    const actors = new Set<string>();
    for (const actor of scene.actors) {
      if (!obj(actor) || !id(actor.id) || actors.has(actor.id) || !id(actor.characterId) || !id(actor.name) || !vec(actor.position) || !number(actor.rotation, -1000, 1000) || !number(actor.height, .2, 5)) fail('Personaje inválido.');
      actors.add(actor.id);
    }
    if (scene.life !== undefined) { const problem = validateLife(scene.life, scene.zoneId); if (problem) fail(problem); }
    for (const sequence of scene.sequences) {
      if (!obj(sequence)) fail('Secuencia inválida.');
      unique(sequence.id); sequences.add(sequence.id);
      if (!id(sequence.name) || !Array.isArray(sequence.cues) || sequence.cues.length > 1000 || !obj(sequence.gate)) fail('Secuencia o interacción inválida.');
      for (const cue of sequence.cues) {
        if (!obj(cue)) fail('Acción inválida.'); unique(cue.id);
        if (!number(cue.at, 0, 3600) || !number(cue.duration, .05, 3600)) fail('Tiempo de acción inválido.');
        switch (cue.kind) {
          case 'camera': if (!shot(cue.shot) || !id(cue.label)) fail('Plano inválido.'); break;
          case 'actor': if (!actors.has(cue.actorId) || !['idle', 'walk', 'turn', 'look', 'talk', 'listen', 'wave', 'nod'].includes(cue.action) || (cue.destination !== undefined && !vec(cue.destination)) || (cue.lookAt !== undefined && !actors.has(cue.lookAt)) || (cue.expression !== undefined && !id(cue.expression)) || (cue.clipName !== undefined && !id(cue.clipName)) || (cue.rotation!==undefined&&!number(cue.rotation,-1000,1000))) fail('Actuación inválida.'); break;
          case 'dialogue': if (!source.sentences.some(s => s.id === cue.sentenceId) || (cue.speakerId !== null && !actors.has(cue.speakerId)) || (cue.audioUrl !== undefined && !media(cue.audioUrl))) fail('El diálogo debe referir una frase y un personaje existentes.'); break;
          case 'sound': if (!media(cue.audioUrl) || !number(cue.volume, 0, 1) || !id(cue.label)) fail('Sonido inválido.'); break;
          default: fail('Tipo de acción desconocido.');
        }
      }
      const gate = sequence.gate;
      if (!['auto', 'continue', 'choice', 'answer', 'object'].includes(gate.kind)) fail('Interacción desconocida.');
      if (gate.kind !== 'auto' && !id(gate.prompt)) fail('La interacción necesita una instrucción.');
      if (gate.kind === 'choice' && (!Array.isArray(gate.options) || gate.options.length < 2 || gate.options.length > 8 || new Set(gate.options.map(o => o.id)).size !== gate.options.length || !gate.options.every(o => id(o.id) && id(o.label) && (o.nextSequenceId === undefined || id(o.nextSequenceId)) && (o.sentenceId === undefined || source.sentences.some(s => s.id === o.sentenceId))))) fail('Opciones inválidas.');
      if (gate.kind === 'answer' && (!strings(gate.answers) || !gate.answers.length)) fail('Faltan respuestas esperadas.');
      if (gate.kind === 'object' && (!strings(gate.entryIds) || !gate.entryIds.length || !gate.entryIds.every(entry => scene.entryIds.includes(entry)))) fail('Objeto fuera de los elementos de la escena.');
    }
  }
  for (const { sequence } of sequenceList(p)) {
    if (sequence.gate.nextSequenceId && !sequences.has(sequence.gate.nextSequenceId)) fail('El camino siguiente no está definido en la historia.');
    if (sequence.gate.kind === 'choice') for (const option of sequence.gate.options) if (option.nextSequenceId && !sequences.has(option.nextSequenceId)) fail('El camino elegido no está definido en la historia.');
  }
  if (p.nodeLayout && (!obj(p.nodeLayout) || !Object.values(p.nodeLayout).every(v => obj(v) && number(v.x, -100000, 100000) && number(v.y, -100000, 100000)))) fail('Posiciones de nodos inválidas.');
}
