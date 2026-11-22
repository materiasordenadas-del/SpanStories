import type { OccurrenceAnnotationRevision, Story, StoryVersion } from '../domain/model.ts';
import type { StoryId, StoryOccurrenceId, StoryVersionId } from '../domain/ids.ts';
import type { NewVersionInput, StoryRepository } from './story-repository.ts';

const request = <T>(operation: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error ?? new Error('No se pudo leer el repositorio de historias.'));
});

/** Browser adapter for the existing StoryRepository contract; immutable content is stored once per version. */
export class IndexedDBStoryRepository implements StoryRepository {
  private readonly database: Promise<IDBDatabase>;

  constructor(owner: string, factory: IDBFactory = indexedDB) {
    this.database = new Promise((resolve, reject) => {
      const open = factory.open(`spanstories.story-engine.authoring.v1:${encodeURIComponent(owner)}`, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore('stories', { keyPath: 'id' });
        db.createObjectStore('versions', { keyPath: 'version.id' }).createIndex('storyId', 'version.storyId');
        db.createObjectStore('revisions', { keyPath: 'id' }).createIndex('occurrenceId', 'occurrenceId');
      };
      open.onsuccess = () => { open.result.onversionchange = () => open.result.close(); resolve(open.result); };
      open.onerror = () => reject(open.error ?? new Error('No se pudo abrir el repositorio de historias.'));
      open.onblocked = () => reject(new Error('Cierra las otras pestañas del editor para actualizar el repositorio.'));
    });
  }

  private async transaction<T>(names: string[], mode: IDBTransactionMode, action: (stores: Record<string, IDBObjectStore>) => Promise<T>): Promise<T> {
    const db = await this.database, tx = db.transaction(names, mode);
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('La operación no se guardó.'));
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar la historia.'));
    });
    const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
    try { const result = await action(stores); await finished; return result; }
    catch (error) { try { tx.abort(); } catch { /* transaction already ended */ } await finished.catch(() => {}); throw error; }
  }

  getStory(id: StoryId) { return this.transaction(['stories'], 'readonly', async s => (await request(s.stories.get(id)) as Story | undefined) ?? null); }
  saveStory(story: Story) { return this.transaction(['stories'], 'readwrite', async s => {
    const previous = await request(s.stories.get(story.id)) as Story | undefined;
    if (previous && previous.storyBlueprintId !== story.storyBlueprintId) throw new Error('La identidad curricular de una Story no puede cambiar.');
    await request(s.stories.put(structuredClone(story)));
  }); }
  private getContent(id: StoryVersionId) { return this.transaction(['versions'], 'readonly', async s => (await request(s.versions.get(id)) as NewVersionInput | undefined) ?? null); }
  async getStoryVersion(id: StoryVersionId) { return (await this.getContent(id))?.version ?? null; }
  async listVersions(storyId: StoryId) { return this.transaction(['versions'], 'readonly', async s => {
    const rows = await request(s.versions.index('storyId').getAll(storyId)) as NewVersionInput[];
    return rows.map(r => r.version).sort((a, b) => a.versionNumber - b.versionNumber);
  }); }
  async getPublishedVersion(storyId: StoryId) { return (await this.listVersions(storyId)).filter(v => v.status === 'PUBLISHED').at(-1) ?? null; }
  saveNewVersion(input: NewVersionInput) { return this.transaction(['stories', 'versions'], 'readwrite', async s => {
    if (!await request(s.stories.get(input.version.storyId))) throw new Error('La Story debe existir antes de guardar una versión.');
    if (!input.sentences.length || input.sentences.some(sentence => sentence.storyVersionId !== input.version.id)) throw new Error('Las frases no pertenecen a esta versión.');
    const ordered = [...input.sentences].sort((a, b) => a.order - b.order);
    if (input.version.text !== ordered.map(sentence => sentence.text).join('\n')) throw new Error('El texto debe proceder de las frases canónicas.');
    const sentenceIds = new Set(input.sentences.map(sentence => sentence.id)), anchorIds = new Set(input.anchors.map(a => a.id)), occurrenceIds = new Set(input.occurrences.map(o => o.id));
    if (sentenceIds.size !== input.sentences.length || anchorIds.size !== input.anchors.length || occurrenceIds.size !== input.occurrences.length) throw new Error('Hay identidades duplicadas.');
    for (const anchor of input.anchors) {
      const sentence = input.sentences.find(v => v.id === anchor.sentenceId);
      if (anchor.storyVersionId !== input.version.id || !sentence || anchor.start < 0 || anchor.end > [...sentence.text].length || anchor.end <= anchor.start) throw new Error('Ancla incompatible.');
    }
    for (const occurrence of input.occurrences) if (occurrence.storyVersionId !== input.version.id || !sentenceIds.has(occurrence.sentenceId) || occurrence.parts.some(p => p.occurrenceId !== occurrence.id || !anchorIds.has(p.anchorId))) throw new Error('Ocurrencia incompatible.');
    for (const binding of input.targetBindings) if (binding.storyId !== input.version.storyId || binding.storyVersionId !== input.version.id || !occurrenceIds.has(binding.occurrenceId)) throw new Error('Vínculo curricular incompatible.');
    const previous = await request(s.versions.index('storyId').getAll(input.version.storyId)) as NewVersionInput[];
    if (previous.some(row => row.version.versionNumber === input.version.versionNumber)) throw new Error('La versión cambió en otra pestaña. Vuelve a abrir la Story.');
    await request(s.versions.add(structuredClone(input)));
  }); }
  markPublished(version: StoryVersion) { return this.transaction(['versions'], 'readwrite', async s => {
    const row = await request(s.versions.get(version.id)) as NewVersionInput | undefined;
    if (!row) throw new Error('La versión no existe.');
    if (row.version.status === 'PUBLISHED') throw new Error('La versión ya está publicada.');
    if (row.version.text !== version.text || row.version.title !== version.title || row.version.storyId !== version.storyId || row.version.versionNumber !== version.versionNumber || version.status !== 'PUBLISHED') throw new Error('La publicación no puede cambiar el contenido.');
    await request(s.versions.put({ ...row, version }));
  }); }
  async listSentences(id: StoryVersionId) { return (await this.getContent(id))?.sentences ?? []; }
  async listAnchors(id: StoryVersionId) { return (await this.getContent(id))?.anchors ?? []; }
  async listOccurrences(id: StoryVersionId) { return (await this.getContent(id))?.occurrences ?? []; }
  async listTargetBindings(id: StoryVersionId) { return (await this.getContent(id))?.targetBindings ?? []; }
  getOccurrence(id: StoryOccurrenceId) { return this.transaction(['versions'], 'readonly', async s => {
    const rows = await request(s.versions.getAll()) as NewVersionInput[];
    return rows.flatMap(row => row.occurrences).find(occurrence => occurrence.id === id) ?? null;
  }); }
  appendAnnotationRevision(revision: OccurrenceAnnotationRevision) { return this.transaction(['revisions'], 'readwrite', async s => { await request(s.revisions.add(structuredClone(revision))); }); }
  listAnnotationRevisions(id: StoryOccurrenceId) { return this.transaction(['revisions'], 'readonly', async s => await request(s.revisions.index('occurrenceId').getAll(id)) as OccurrenceAnnotationRevision[]); }
  async close() { (await this.database).close(); }
}
