import { origenDelAnfitrion } from './LexicoPuertos.js';
import { LEXICO } from '../routes.js';

export const NARRATIVE_CHANNEL='spanstories.narrative';
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<100000);
export function validarEscena(v,zoneId,entryIds){
  return !!v&&typeof v.id==='string'&&v.zoneId===zoneId&&vector(v.camera?.position)&&vector(v.camera?.target)&&
    Array.isArray(v.entryIds)&&v.entryIds.every(id=>entryIds.includes(id));
}

// No instala controles de teclado, órbita, zoom ni movimiento del estudiante.
export function montarNarrativa({camera,target,zone,lexico,loadNearby,estado,win=window}){
  const origin=origenDelAnfitrion({win,permitidos:LEXICO.hostOrigins});
  let revision=0,destruida=false;
  lexico?.interaccion.habilitar([]);
  const send=(type,data={})=>{if(origin)win.parent.postMessage({channel:NARRATIVE_CHANNEL,version:1,type,...data},origin);};
  let draft=null;
  if(new URLSearchParams(win.location.search).has('borrador'))try{
    const saved=JSON.parse(win.localStorage.getItem('spanstories.narrative-draft:'+zone.id));
    if(saved?.zoneId===zone.id&&Array.isArray(saved.scenes)&&saved.scenes.length&&saved.scenes.every(s=>validarEscena(s,zone.id,lexico.mapa.entries.map(e=>e.id))))draft={scenes:saved.scenes};
  }catch{/* el piloto fuente sigue disponible */}
  async function receive(e){
    if(!origin||e.origin!==origin||e.source!==win.parent)return;
    const m=e.data;
    if(m?.channel!==NARRATIVE_CHANNEL||m.version!==1||m.type!=='SCENE'||!validarEscena(m.scene,zone.id,lexico?.mapa.entries.map(e=>e.id)||[]))return;
    const current=++revision;
    win.clearInterval(interval);
    lexico?.interaccion.cerrar('escena');lexico?.interaccion.habilitar([]);
    camera.position.fromArray(m.scene.camera.position);target.fromArray(m.scene.camera.target);camera.lookAt(target);camera.updateMatrixWorld(true);
    try{
      estado('Preparando la escena…');const results=await loadNearby();
      if(results?.some(r=>r.status==='rejected'))throw new Error('Carga parcial');
      if(destruida||current!==revision)return;
      lexico?.interaccion.habilitar(m.scene.entryIds);
      estado('Toca un objeto para escucharlo.');send('SCENE_READY',{sceneId:m.scene.id});
    }catch{if(!destruida&&current===revision)send('SCENE_ERROR',{sceneId:m.scene.id});}
  }
  win.addEventListener('message',receive);
  // Reintento de READY evita carreras con el montaje del efecto React del anfitrión.
  const ready=()=>send('READY',draft?{draft}:{});
  const interval=win.setInterval(ready,1500);ready();
  return {destruir(){destruida=true;revision++;win.clearInterval(interval);win.removeEventListener('message',receive);}};
}
