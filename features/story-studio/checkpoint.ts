import type {StudioDirector} from './director.ts';
type Snapshot=ReturnType<StudioDirector['snapshot']>;
export type StudioCheckpoint={schema:1;releaseId:string;storyVersionId:string;sequenceId:string;time:number;finished:boolean;path:string[];updatedAt:string};
const key=(owner:string,releaseId:string)=>`spanstories.story-studio.resume.v1:${encodeURIComponent(owner)}:${encodeURIComponent(releaseId)}`;
export function saveStudioCheckpoint(storage:Pick<Storage,'setItem'>,owner:string,releaseId:string,storyVersionId:string,snapshot:Snapshot){
  const checkpoint:StudioCheckpoint={schema:1,releaseId,storyVersionId,sequenceId:snapshot.stage.sequenceId,time:snapshot.time,finished:snapshot.state==='finished',path:snapshot.path,updatedAt:new Date().toISOString()};
  storage.setItem(key(owner,releaseId),JSON.stringify(checkpoint));
}
export function readStudioCheckpoint(storage:Pick<Storage,'getItem'>,owner:string,releaseId:string,storyVersionId:string):StudioCheckpoint|null{
  const raw=storage.getItem(key(owner,releaseId));if(raw===null)return null;
  const data=JSON.parse(raw) as StudioCheckpoint;
  if(data.schema!==1||data.releaseId!==releaseId||data.storyVersionId!==storyVersionId||typeof data.sequenceId!=='string'||!Number.isFinite(data.time)||data.time<0||typeof data.finished!=='boolean'||!Array.isArray(data.path)||data.path.some(id=>typeof id!=='string')||!Number.isFinite(Date.parse(data.updatedAt)))throw new Error('El punto de lectura no corresponde a esta publicación.');
  return data;
}
