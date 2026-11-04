import { asId, assembleStoryVersion, createStory, type StorySentence } from '../story-engine/index.ts';
import type { StudioProject, StudioSource } from './model.ts';

/** An explicitly unpublished rehearsal, materialized by the existing Story Engine. */
export function buildStudioRehearsal(): { source: StudioSource; project: StudioProject } {
  const clock = { now: () => new Date('2026-10-25T12:00:00Z') };
  const story = createStory(asId('StoryId', 'story-studio-barcelona-ensayo'), null, clock);
  const versionId = asId('StoryVersionId', 'storyver-studio-barcelona-ensayo-1');
  const texts = ['Estamos en Barcelona.', 'Hola. Soy Samuel.', 'Mira la calle y los árboles.', '¿Qué ves? Toca un árbol.', 'Muy bien. ¡Hasta luego!'];
  const sentences: StorySentence[] = texts.map((text, i) => ({ id: asId('SentenceId', `sent-studio-barcelona-${i + 1}`), storyVersionId: versionId, order: i, text, tokens: [] }));
  const version = assembleStoryVersion({ id: versionId, storyId: story.id, versionNumber: 1, title: 'Un encuentro en Barcelona', sentences, status: 'DRAFT', clock });
  const source: StudioSource = { storyId: story.id, storyVersionId: version.id, title: version.title, status: version.status, blueprintId: null, versionNumber:1, sentences: sentences.map(({ id, text }) => ({ id, text })), engine:{story,content:{version,sentences,anchors:[],occurrences:[],targetBindings:[]}} };
  const shot = { position: [18, 14, 20] as const, target: [18, 0, 40] as const, fov: 42, transition: 0 };
  const project: StudioProject = {
    schema: 1, id: 'studio-barcelona-ensayo', name: version.title, storyId: story.id, storyVersionId: version.id, revision: 0,
    navigation: { allowLook: true, travel: 'directed' },
    scenes: [{ id: 'scene-encuentro', name: 'Encuentro en el paseo', zoneId: 'barcelona-passeig-gracia', entryIds: ['arbol', 'calle'], shot,
      // No positions are invented for characters: placement is an explicit authoring operation.
      actors: [],
      sequences: texts.map((_, i) => ({ id: `sequence-${i + 1}`, name: ['El lugar', 'Presentación', 'Mira alrededor', 'Tu turno', 'Despedida'][i],
        cues: [{ id: `cue-dialogue-${i + 1}`, kind: 'dialogue' as const, at: 0, duration: 3, sentenceId: sentences[i].id, speakerId: null }],
        gate: i === 3 ? { kind: 'object' as const, prompt: 'Toca un árbol para continuar.', entryIds: ['arbol'] } : { kind: 'continue' as const, prompt: 'Continúa cuando quieras.' },
      })),
    }],
  };
  return { source, project };
}
