import {validateProject,type StudioProject,type StudioSource} from './model.ts';
export type StudioRelease={id:string;publishedAt:string;project:StudioProject};
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
const key=(id:string)=>`spanstories.story-studio.published.v1:${encodeURIComponent(id)}`;

/** Public presentation snapshots contain references, never another copy of canonical Story text. */
export function storePublishedPresentation(storage:StoragePort,release:StudioRelease,source:StudioSource){
  if(source.status!=='PUBLISHED'||!source.blueprintId)throw new Error('Se necesita una versión curricular publicada.');
  validateProject(release.project,source);
  if(!/^[a-zA-Z0-9-]{8,100}$/.test(release.id)||!Number.isFinite(Date.parse(release.publishedAt)))throw new Error('Publicación inválida.');
  if(storage.getItem(key(release.id))!==null)throw new Error('La publicación ya existe y no puede sobrescribirse.');
  storage.setItem(key(release.id),JSON.stringify({schema:1,...structuredClone(release)}));
}

export function readPublishedPresentation(storage:Pick<Storage,'getItem'>,id:string,sources:readonly StudioSource[]){
  if(!/^[a-zA-Z0-9-]{8,100}$/.test(id))throw new Error('Identidad de publicación inválida.');
  const raw=storage.getItem(key(id));
  if(!raw)throw new Error('Esta publicación no está instalada en este navegador.');
  const release=JSON.parse(raw) as StudioRelease&{schema:number};
  if(release.schema!==1||release.id!==id||!Number.isFinite(Date.parse(release.publishedAt)))throw new Error('Publicación incompatible.');
  const source=sources.find(s=>s.storyId===release.project?.storyId&&s.storyVersionId===release.project.storyVersionId&&s.status==='PUBLISHED'&&!!s.blueprintId);
  if(!source)throw new Error('La versión publicada de esta Story no está disponible.');
  validateProject(release.project,source);
  return{release:structuredClone(release),source};
}
