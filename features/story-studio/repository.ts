import { validateProject, type StudioProject, type StudioSource } from './model.ts';

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Release = { id: string; publishedAt: string; project: StudioProject };
type RecordData = { schema: 1; revision: number; draft: StudioProject; releases: Release[] };

/** One atomic envelope avoids partial publication. Owner and project id isolate sessions. */
export function createStudioRepository(storage: StoragePort, owner: string, projectId: string) {
  const key = `spanstories.story-studio.v1:${encodeURIComponent(owner)}:${encodeURIComponent(projectId)}`;
  function read(source: StudioSource): RecordData | null {
    const text = storage.getItem(key);
    if (text === null) return null;
    const record = JSON.parse(text) as RecordData;
    if (record.schema !== 1 || !Number.isInteger(record.revision) || record.revision < 1 || !Array.isArray(record.releases)) throw new Error('El guardado narrativo está dañado; se conserva sin sobrescribir.');
    validateProject(record.draft, source);
    if (record.draft.id !== projectId || record.draft.revision !== record.revision) throw new Error('Guardado incompatible.');
    const ids = new Set<string>();
    for (const release of record.releases) {
      if (!release.id || ids.has(release.id) || !Number.isFinite(Date.parse(release.publishedAt))) throw new Error('Publicación incompatible.');
      ids.add(release.id); validateProject(release.project, source);
      if (release.project.id !== projectId) throw new Error('Publicación incompatible.');
    }
    return record;
  }
  return {
    load(source: StudioSource) { return structuredClone(read(source)); },
    save(project: StudioProject, source: StudioSource) {
      validateProject(project, source);
      if (project.id !== projectId) throw new Error('Proyecto incompatible.');
      const previous = read(source);
      if (project.revision !== (previous?.revision ?? 0)) throw new Error('El borrador cambió en otra pestaña. Recarga antes de guardar.');
      const draft = structuredClone({ ...project, revision: project.revision + 1 });
      storage.setItem(key, JSON.stringify({ schema: 1, revision: draft.revision, draft, releases: previous?.releases ?? [] } satisfies RecordData));
      return draft;
    },
    publish(project: StudioProject, source: StudioSource, id: string, now: string) {
      validateProject(project, source);
      if (source.status !== 'PUBLISHED' || !source.blueprintId) throw new Error('Publica primero una versión curricular aprobada en el Story Engine. El ensayo puede guardarse y previsualizarse.');
      const previous = read(source);
      if (!previous || project.id !== projectId || previous.revision !== project.revision) throw new Error('Guarda el borrador antes de publicar.');
      if (JSON.stringify(previous.draft) !== JSON.stringify(project)) throw new Error('Hay cambios sin guardar.');
      if (!id || previous.releases.some(r => r.id === id) || !Number.isFinite(Date.parse(now))) throw new Error('Identidad o fecha de publicación inválida.');
      const release: Release = { id, publishedAt: now, project: structuredClone(project) };
      storage.setItem(key, JSON.stringify({ ...previous, releases: [...previous.releases, release] }));
      return structuredClone(release);
    },
  };
}
