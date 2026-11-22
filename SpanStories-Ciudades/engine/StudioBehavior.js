import * as T from './three.js';

export function behaviorAssetURL(value){
  if(typeof value!=='string'||!(/^http:\/\/127\.0\.0\.1:5189\/ecosystem\/assets\/[a-f0-9-]{36}\.json$/.test(value)||/^http:\/\/(localhost|127\.0\.0\.1):3000\/api\/studio-behaviors\?id=[a-f0-9-]{36}&sha=[a-f0-9]{64}$/.test(value)))throw Error('Recurso de comportamiento no permitido.');
  return value;
}
/**
 * URL con la que se pide una referencia. Las actuaciones del Taller (5189) se reemplazan en su sitio y conservan sus
 * revisiones anteriores: `?revision=N` pide la que la historia guardó, no la última. Las importadas (sha) ya son inmutables.
 */
export function behaviorFetchURL(reference){
  const url=behaviorAssetURL(reference.url);
  return url.startsWith('http://127.0.0.1:5189/')&&Number.isInteger(reference.revision)&&reference.revision>=0?url+'?revision='+reference.revision:url;
}
export function createBehaviorLibrary(fetcher=fetch,onMissingRevision=null){
  const cache=new Map();
  return {async load(reference,characterId){
    if(reference.characterId!==characterId)throw Error('La actuación pertenece a otro personaje.');
    const url=behaviorAssetURL(reference.url),pinned=behaviorFetchURL(reference);
    // Una actuación propia de la historia se reemplaza en su sitio (mismo archivo, revisión nueva): la revisión
    // entra en la clave para leer la versión corregida sin recargar nada.
    const key=url+'#'+(Number(reference.revision)||0);
    if(!cache.has(key)){
      const task=(async()=>{let r=await fetcher(pinned,{cache:'no-store'});
        // Historias guardadas antes de que se archivaran las revisiones: se usa la última, y se avisa (no se sustituye en silencio).
        if(r.status===404&&pinned!==url){r=await fetcher(url,{cache:'no-store'});if(r.ok)onMissingRevision?.(reference);}
        if(!r.ok)throw Error('No se pudo cargar la actuación guardada. Abre su biblioteca o importa el paquete de puesta en escena.');const d=await r.json();
        if(d.schema!=='spanstories.behavior'||d.version!==1||d.id!==reference.id||d.characterId!==characterId||!Number.isFinite(d.duration)||d.duration<=0||d.duration>600||!Array.isArray(d.animation?.tracks)||!d.animation.tracks.length||d.animation.tracks.length>2000)throw Error('Actuación incompatible.');
        for(const track of d.animation.tracks)if(!Array.isArray(track.times)||!Array.isArray(track.values)||track.times.length>18001||track.values.length>18001*200||track.times.some(n=>!Number.isFinite(n))||track.values.some(n=>!Number.isFinite(n)))throw Error('Curvas de actuación inválidas.');
        return T.AnimationClip.parse(d.animation);
      })();cache.set(key,task);task.catch(()=>cache.delete(key));
    }
    return cache.get(key);
  }};
}
export function performanceTime(time,cue,duration){return Math.min(duration,Math.max(0,(time-cue.at)/Math.max(.05,cue.duration)*duration));}
