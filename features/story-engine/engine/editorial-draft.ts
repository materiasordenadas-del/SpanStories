import { asId } from '../domain/ids.ts';
import type { Clock, IdGenerator } from '../domain/ports.ts';
import type { StorySentence, SurfaceToken, StoryOccurrence, TextAnchor, StoryTargetBinding } from '../domain/model.ts';
import type { NewVersionInput } from '../repository/story-repository.ts';
import { assembleStoryVersion } from './story-service.ts';

/** Creates a new draft; published words/anchors remain immutable in their own version. */
export function createEditorialDraft(input: { previous: NewVersionInput; sentenceId: string; text: string; versionNumber: number; ids: IdGenerator; clock: Clock }) {
  const { previous, ids, clock } = input;
  if (!input.text.trim() || input.text.length > 10000) throw new Error('La intervención debe tener entre 1 y 10000 caracteres.');
  if (!previous.sentences.some(s => s.id === input.sentenceId)) throw new Error('La frase no pertenece a esta Story.');
  if (input.versionNumber <= previous.version.versionNumber) throw new Error('Se necesita un número de versión nuevo.');
  const versionId = asId('StoryVersionId', ids.next('StoryVersionId'));
  const sentenceIds = new Map<string, StorySentence['id']>(), anchorIds = new Map<string, TextAnchor['id']>(), occurrenceIds = new Map<string, StoryOccurrence['id']>();
  const sentences: StorySentence[] = [...previous.sentences].sort((a, b) => a.order - b.order).map(old => {
    const id = asId('SentenceId', ids.next('SentenceId')); sentenceIds.set(old.id, id);
    const text = old.id === input.sentenceId ? input.text : old.text;
    const tokens: SurfaceToken[] = [...text.matchAll(/\p{L}[\p{L}\p{M}'’\-]*|\p{N}+|[^\s]/gu)].map((match, order) => ({
      id: asId('SurfaceTokenId', ids.next('SurfaceTokenId')), sentenceId: id, surface: match[0],
      startOffset: [...text.slice(0, match.index!)].length, endOffset: [...text.slice(0, match.index!)].length + [...match[0]].length, order,
    }));
    return { id, storyVersionId: versionId, order: old.order, text, tokens };
  });
  const edited = previous.sentences.find(s => s.id === input.sentenceId)!;
  const changed = edited.text !== input.text;
  const anchors: TextAnchor[] = previous.anchors.filter(a => !changed || a.sentenceId !== input.sentenceId).map(old => {
    const id = asId('TextAnchorId', ids.next('TextAnchorId')); anchorIds.set(old.id, id);
    return { ...old, id, storyVersionId: versionId, sentenceId: sentenceIds.get(old.sentenceId)! };
  });
  const occurrences: StoryOccurrence[] = previous.occurrences.filter(o => (!changed || o.sentenceId !== input.sentenceId) && o.parts.every(p => anchorIds.has(p.anchorId))).map(old => {
    const id = asId('StoryOccurrenceId', ids.next('StoryOccurrenceId')); occurrenceIds.set(old.id, id);
    return { ...old, id, storyVersionId: versionId, sentenceId: sentenceIds.get(old.sentenceId)!, parts: old.parts.map(p => ({ ...p, id: asId('OccurrencePartId', ids.next('OccurrencePartId')), occurrenceId: id, anchorId: anchorIds.get(p.anchorId)! })) };
  });
  const targetBindings: StoryTargetBinding[] = previous.targetBindings.filter(b => occurrenceIds.has(b.occurrenceId)).map(old => ({ ...old, id: asId('StoryTargetBindingId', ids.next('StoryTargetBindingId')), storyVersionId: versionId, occurrenceId: occurrenceIds.get(old.occurrenceId)! }));
  const version = assembleStoryVersion({ id: versionId, storyId: previous.version.storyId, versionNumber: input.versionNumber, title: previous.version.title, sentences, status: 'DRAFT', clock });
  return { content: { version, sentences, anchors, occurrences, targetBindings } satisfies NewVersionInput, sentenceIds, occurrenceIds, annotationRequired: changed };
}
