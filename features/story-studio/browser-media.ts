export type StudioAudioAsset={id:string;name:string;kind:'voice'|'sound';mimeType:string;duration:number;bytes:number;createdAt:string;blob:Blob};
export const STUDIO_AUDIO_LIMIT=64*1024*1024;
export const localAudioId=(url:string)=>/^studio-audio:([a-f0-9]{64})$/.exec(url)?.[1]??null;
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??new Error('No se pudo abrir el audio.'));});

/** Reusable audio assets stay outside the narrative JSON and outside canonical Story text. */
export class StudioMediaRepository{
  private readonly database:Promise<IDBDatabase>;
  constructor(owner:string,factory:IDBFactory=indexedDB){
    this.database=new Promise((resolve,reject)=>{
      const open=factory.open(`spanstories.story-studio.media.v1:${encodeURIComponent(owner)}`,1);
      open.onupgradeneeded=()=>open.result.createObjectStore('audio',{keyPath:'id'});
      open.onsuccess=()=>{open.result.onversionchange=()=>open.result.close();resolve(open.result);};
      open.onerror=()=>reject(open.error??new Error('No se pudo abrir la biblioteca de audio.'));
      open.onblocked=()=>reject(new Error('La biblioteca está abierta en otra versión del editor.'));
    });
  }
  async get(id:string):Promise<StudioAudioAsset|null>{const db=await this.database;return (await request(db.transaction('audio').objectStore('audio').get(id)) as StudioAudioAsset|undefined)??null;}
  async list():Promise<StudioAudioAsset[]>{const db=await this.database;return (await request(db.transaction('audio').objectStore('audio').getAll()) as StudioAudioAsset[]).sort((a,b)=>a.name.localeCompare(b.name,'es'));}
  async save(asset:StudioAudioAsset){
    if(!/^[a-f0-9]{64}$/.test(asset.id)||!asset.name.trim()||!['voice','sound'].includes(asset.kind)||!Number.isFinite(asset.duration)||asset.duration<=0||asset.duration>3600||asset.bytes!==asset.blob.size||asset.bytes>STUDIO_AUDIO_LIMIT||!Number.isFinite(Date.parse(asset.createdAt)))throw new Error('El archivo de audio no es válido o supera los límites de la biblioteca.');
    const db=await this.database,tx=db.transaction('audio','readwrite');
    const finished=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('El audio no se guardó.'));tx.onerror=()=>reject(tx.error??new Error('No se pudo guardar el audio.'));});
    try{const previous=await request(tx.objectStore('audio').get(asset.id)) as StudioAudioAsset|undefined;if(!previous)await request(tx.objectStore('audio').add(asset));await finished;return previous??asset;}
    catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
  }
  async import(file:File,kind:StudioAudioAsset['kind']){
    if(!file.size||file.size>STUDIO_AUDIO_LIMIT)throw new Error('El audio debe ocupar entre 1 byte y 64 MB.');
    if(file.type&&!file.type.startsWith('audio/'))throw new Error('Selecciona un archivo de audio.');
    const url=URL.createObjectURL(file);
    const duration=await new Promise<number>((resolve,reject)=>{
      const audio=new Audio(),timer=window.setTimeout(()=>finish(new Error('El archivo no pudo leerse en 15 segundos.')),15000);
      function finish(error?:Error){window.clearTimeout(timer);audio.onloadedmetadata=null;audio.onerror=null;const duration=audio.duration;audio.src='';URL.revokeObjectURL(url);if(error)reject(error);else if(!Number.isFinite(duration)||duration<=0||duration>3600)reject(new Error('El audio necesita una duración válida de hasta una hora.'));else resolve(duration);}
      audio.onloadedmetadata=()=>finish();audio.onerror=()=>finish(new Error('El navegador no puede reproducir este formato de audio.'));audio.preload='metadata';audio.src=url;
    });
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),id=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    return this.save({id,name:file.name,kind,mimeType:file.type,duration,bytes:file.size,createdAt:new Date().toISOString(),blob:file});
  }
  async close(){(await this.database).close();}
}
