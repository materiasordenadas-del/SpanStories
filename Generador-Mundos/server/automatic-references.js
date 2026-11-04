import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {referenceFromEntity,validQ,validateReferences} from '../src/estudio/data/automatic-references.js';

// Solo consulta el proveedor fijo con IDs validados. Caché por entidad y fallos no destructivos.
export class AutomaticReferences{
  constructor({cacheDir,fetcher=fetch}={}){this.cacheDir=cacheDir;this.fetcher=fetcher;this.pending=new Map();}
  async lookup(ids){
    if(!Array.isArray(ids)||ids.length>100||!ids.every(validQ))throw Error('Máximo 100 identidades Wikidata válidas');
    const references={},warnings=[],missing=[];
    for(const id of new Set(ids)){
      let cached;try{cached=JSON.parse(await readFile(join(this.cacheDir,id+'.json'),'utf8'));validateReferences({[id]:cached});}catch{cached=null;}
      if(cached&&Date.now()-Date.parse(cached.retrievedAt)<7*86400000)references[id]=cached;else missing.push({id,cached});
    }
    // Lotes de 20, como máximo 5; no crea una petición por fachada.
    for(let offset=0;offset<missing.length;offset+=20){const batch=missing.slice(offset,offset+20),key=batch.map(x=>x.id).join('|');
      try{
        let pending=this.pending.get(key);
        if(!pending){pending=this.fetchBatch(key).finally(()=>this.pending.delete(key));this.pending.set(key,pending);}
        const entities=await pending;
        for(const {id}of batch){const e=entities[id];if(!e||e.missing!=null){warnings.push(id+': sin entidad disponible');continue;}const r=referenceFromEntity(e);references[id]=r;await mkdir(this.cacheDir,{recursive:true});await writeFile(join(this.cacheDir,id+'.json'),JSON.stringify(r));}
      }catch(error){warnings.push('Wikidata no disponible: '+error.message);for(const {id,cached}of batch)if(cached)references[id]={...cached,stale:true};}
    }
    return {references,warnings};
  }
  async fetchBatch(ids){
    const url=new URL('https://www.wikidata.org/w/api.php');
    url.search=new URLSearchParams({action:'wbgetentities',ids,props:'info|labels|claims',languages:'es|en',format:'json'});
    const response=await this.fetcher(url,{headers:{'User-Agent':'Atlas-Estudio/0.10 (local educational city reference lookup)'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();if(!data.entities||data.error)throw Error(data.error?.info??'Respuesta inválida');return data.entities;
  }
}
