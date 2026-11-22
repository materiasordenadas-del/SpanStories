import { asId, assembleStoryVersion, createStory, type StorySentence } from '../story-engine/index.ts';
import { buildStudioRehearsal } from './demo.ts';
import { validateProject, type Shot, type StudioProject, type StudioSource } from './model.ts';

/**
 * Una historia del Estudio es un archivo, como un .blend: la Story (texto canónico) y toda su puesta en escena.
 * Se guarda en disco en Estudio/Historias/<id>/historia.json (ver app/api/historias/route.ts).
 */
export const HISTORIA_SCHEMA = 'spanstories.historia';
export type HistoriaUi = { sequenceId?: string; tab?: string; flowView?: string; panelWidths?: { library: number; inspector: number } };
export type HistoriaFile = {
  schema: typeof HISTORIA_SCHEMA; version: 1;
  id: string; name: string; createdAt: string; savedAt: string;
  /** Igual a project.revision: cuenta los guardados manuales. */
  revision: number;
  /** Instantánea de la Story: la historia se abre aunque el archivo de historias del navegador se haya borrado. */
  source: StudioSource;
  project: StudioProject;
  ui?: HistoriaUi;
};
export type HistoriaSummary = {
  id: string; name: string; createdAt: string; savedAt: string | null; autosaveAt: string | null;
  /** Hay un autoguardado más nuevo que el último guardado. */
  recuperable: boolean;
  zoneId: string; scenes: number; moments: number; actors: number;
};
export type Plantilla = 'vacia' | 'barcelona' | 'aeropuerto';

export const HISTORIA_ID = /^[a-z0-9][a-z0-9-]{2,80}$/;
export const isHistoriaId = (v: unknown): v is string => typeof v === 'string' && HISTORIA_ID.test(v);

export function slug(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'historia';
}
export function newHistoriaId(name: string, random = Math.random().toString(36).slice(2, 8)) { return `${slug(name)}-${random.replace(/[^a-z0-9]/g, '').padEnd(4, '0')}`; }

export function validateHistoria(raw: unknown): HistoriaFile {
  const h = raw as HistoriaFile;
  if (!h || h.schema !== HISTORIA_SCHEMA || h.version !== 1 || !isHistoriaId(h.id) || typeof h.name !== 'string' || !h.name.trim() || h.name.length > 120) throw Error('Archivo de historia no válido.');
  if (!Number.isFinite(Date.parse(h.createdAt)) || !Number.isFinite(Date.parse(h.savedAt)) || !Number.isInteger(h.revision) || h.revision < 0) throw Error('Fechas o revisión de la historia no válidas.');
  if (!h.source || typeof h.source.storyVersionId !== 'string' || !Array.isArray(h.source.sentences)) throw Error('La historia no contiene su Story.');
  validateProject(h.project, h.source);
  return h;
}

export function summarize(h: HistoriaFile, autosave: HistoriaFile | null, saved: boolean): HistoriaSummary {
  const latest = autosave ?? h, scenes = latest.project.scenes;
  return {
    id: h.id, name: latest.name, createdAt: h.createdAt, savedAt: saved ? h.savedAt : null, autosaveAt: autosave?.savedAt ?? null,
    recuperable: !!autosave && (!saved || JSON.stringify(autosave.project) !== JSON.stringify(h.project)),
    zoneId: scenes[0]?.zoneId ?? '', scenes: scenes.length,
    moments: scenes.reduce((n, s) => n + s.sequences.length, 0),
    actors: scenes.reduce((n, s) => n + s.actors.length, 0),
  };
}

/** La fuente vigente: la del catálogo del Story Engine si existe; si no, la instantánea guardada en la historia. */
export function historiaSource(h: Pick<HistoriaFile, 'source'>, catalog: readonly StudioSource[]) {
  return catalog.find(s => s.storyVersionId === h.source.storyVersionId) ?? h.source;
}

/** Una Story nueva y propia de la historia (borrador del Story Engine, sin currículo). */
export function buildStorySource(input: { key: string; title: string; texts: readonly string[]; now: string }): StudioSource {
  const clock = { now: () => new Date(input.now) };
  const story = createStory(asId('StoryId', `story-${input.key}`), null, clock);
  const versionId = asId('StoryVersionId', `storyver-${input.key}-1`);
  const sentences: StorySentence[] = input.texts.map((text, i) => ({ id: asId('SentenceId', `sent-${input.key}-${i + 1}`), storyVersionId: versionId, order: i, text, tokens: [] }));
  const version = assembleStoryVersion({ id: versionId, storyId: story.id, versionNumber: 1, title: input.title, sentences, status: 'DRAFT', clock });
  return { storyId: story.id, storyVersionId: version.id, title: version.title, status: version.status, blueprintId: null, versionNumber: 1, sentences: sentences.map(({ id, text }) => ({ id, text })), engine: { story, content: { version, sentences, anchors: [], occurrences: [], targetBindings: [] } } };
}

const DEFAULT_SHOT: Shot = { position: [0, 6, 12], target: [0, 1, 0], fov: 42, transition: 0 };

/** Crea el archivo de una historia nueva desde una plantilla. La vacía empieza sin escenario (zoneId ''): se elige dentro del Estudio. */
export function newHistoria(input: { name: string; plantilla: Plantilla; zoneId?: string; now?: string; id?: string }): HistoriaFile {
  const now = input.now ?? new Date().toISOString(), name = input.name.trim().slice(0, 120) || 'Historia sin título';
  const id = input.id ?? newHistoriaId(name);
  let source: StudioSource, project: StudioProject;
  if (input.plantilla === 'vacia') {
    source = buildStorySource({ key: id, title: name, texts: ['Escribe aquí la primera frase de la historia.'], now });
    project = {
      schema: 1, id: `historia-${id}`, name, storyId: source.storyId, storyVersionId: source.storyVersionId, revision: 0,
      navigation: { allowLook: true, travel: 'directed' },
      scenes: [{ id: 'escena-1', name: 'Escena 1', zoneId: input.zoneId ?? '', entryIds: [], actors: [], shot: structuredClone(DEFAULT_SHOT) as Shot,
        sequences: [{ id: 'momento-1', name: 'Primer momento', cues: [{ id: 'dialogo-1', kind: 'dialogue', at: 0, duration: 3, sentenceId: source.sentences[0].id, speakerId: null }], gate: { kind: 'continue', prompt: 'Continúa cuando quieras.' } }] }],
    };
  } else {
    const rehearsal = buildStudioRehearsal(input.plantilla === 'aeropuerto' ? 'airport' : 'barcelona');
    source = rehearsal.source;
    project = { ...rehearsal.project, id: `historia-${id}`, name };
    // En otro escenario no existen los objetos ni el encuadre de la plantilla: se empieza con un plano general.
    if (input.zoneId && input.zoneId !== project.scenes[0].zoneId) project.scenes[0] = { ...project.scenes[0], zoneId: input.zoneId, entryIds: [], shot: structuredClone(DEFAULT_SHOT) as Shot,
      sequences: project.scenes[0].sequences.map(q => q.gate.kind === 'object' ? { ...q, gate: { kind: 'continue', prompt: 'Continúa cuando quieras.' } } : q) };
  }
  const h: HistoriaFile = { schema: HISTORIA_SCHEMA, version: 1, id, name, createdAt: now, savedAt: now, revision: 0, source, project };
  validateProject(h.project, h.source);
  return h;
}

/** Copia con otro id y nombre («Guardar como…» y «Duplicar»). */
export function copyHistoria(h: HistoriaFile, name: string, now = new Date().toISOString(), id = newHistoriaId(name)): HistoriaFile {
  const copy = structuredClone(h);
  return { ...copy, id, name, createdAt: now, savedAt: now, revision: 0, project: { ...copy.project, id: `historia-${id}`, name, revision: 0 } };
}

/** Un borrador antiguo del navegador (localStorage spanstories.story-studio.v1:*) convertido en historia. */
export function historiaFromDraft(project: StudioProject, source: StudioSource, now = new Date().toISOString()): HistoriaFile {
  const id = newHistoriaId(project.name || source.title);
  const h: HistoriaFile = { schema: HISTORIA_SCHEMA, version: 1, id, name: project.name || source.title, createdAt: now, savedAt: now, revision: 0, source: structuredClone(source), project: { ...structuredClone(project), revision: 0 } };
  validateProject(h.project, h.source);
  return h;
}
