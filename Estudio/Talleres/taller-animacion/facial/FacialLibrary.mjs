import {ARKIT,copy,clamp,curve,validatePreset,validateProject,validateInstance,evaluate,FacialPlayer} from './FacialCore.mjs';
import {BASE_PRESETS} from './FacialPresets.mjs';
import {MOVEMENTS,suggestMovement,evaluateMovement,LifeMovement} from './FacialMovement.mjs?v=2';
import {curveBounds,curveY} from './FacialCurveView.mjs';
import {channelPeak} from './ActingLibrary.mjs';
import {componenteDe,corregirPreset} from './CorreccionesFaciales.mjs';

const STORAGE='spanstories.facial-project.v1',LEGACY_STORAGE='spanstories.rachel.facial-project.v1';
const uid=()=>crypto.randomUUID();
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const searchAliases={feliz:['feliz','alegria','happy','felicidad'],triste:['triste','sad','tristeza'],enfadada:['enojo','angry','enfado'],miedo:['miedo','fear','temor'],susto:['susto','asustada','fear'],asco:['asco','desagrado','disgust'],sorprendida:['sorpresa','surprise'],calma:['calma','calm'],muy:['muy','intensa','high']};
const regions={Todo:ARKIT,'Rostro superior (sin habla)':ARKIT.filter(n=>/^(brow|eye|cheek|nose)/.test(n)),Cejas:ARKIT.filter(n=>/^brow/.test(n)),Ojos:ARKIT.filter(n=>/^eye/.test(n)),Boca:ARKIT.filter(n=>/^(mouth|jaw|tongue)/.test(n)),Mejillas:ARKIT.filter(n=>/^(cheek|nose)/.test(n))};
function download(name,data,type='application/json') {
  const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function mountFacialLibrary({root,container,vida,frameBody,session=false,draftKey=null,player:providedPlayer,storageKey=STORAGE,onInspect}) {
  const player=providedPlayer||new FacialPlayer(root),history=[],future=[];
  const movement=vida?new LifeMovement(vida):{prepare(){},restore(){}};let pendingWeights=null,pendingEvaluation=null;
  let project={schema:'spanstories.facial-project',version:1,presets:copy(BASE_PRESETS),instances:[],favorites:[]};
  let loadError='';
  try {const stored=session?null:(localStorage.getItem(storageKey)??(storageKey===STORAGE?localStorage.getItem(LEGACY_STORAGE):null));if(stored)project=validateProject(JSON.parse(stored));}catch(e){loadError='No se cargó el guardado anterior: '+e.message+' No se sobrescribirá hasta que edites.';}
  // Extend the factory library without overwriting a user's existing versions.
  for(const preset of BASE_PRESETS)if(!project.presets.some(p=>p.id===preset.id))project.presets.push(copy(preset));
  let pristine=null;   // el gesto de la biblioteca tal como se abrió (sin editar): conserva su id de componente
  let selected=project.presets[0].id,draft=copy(project.presets[0]),instanceId=null,time=0,playing=false,mode='off',lastNow=null,preview=null,before=false,probe=null;
  let external=[],page=0,selectionRevision=0;
  const PAGE_SIZE=60,cache=new Map();
  let fitCurve=false;
  const host=document.createElement('section');host.id='facial-library';
  host.innerHTML=`<style>
    #facial-library{border:1px solid #666;border-radius:6px;padding:8px;margin:10px 0;background:#21242b}
    #facial-library h2{margin-top:0} #facial-library input:not([type=checkbox]):not([type=range]),#facial-library select,#facial-library textarea{box-sizing:border-box;max-width:100%;background:#333740;color:var(--txt);border:1px solid #626875;border-radius:4px;padding:4px}
    #facial-library label{display:block;margin:5px 0;font-size:12px} #facial-library label input[type=number]{width:78px;float:right}
    #fl-search,#fl-category,#fl-presets,#fl-name{width:100%} #fl-presets{min-height:105px} #fl-status,#fl-compatible{font-size:11px;white-space:pre-line;color:#bcd1db}
    #fl-status[data-error=true]{color:#ffb7b7} #fl-track{height:72px;position:relative;background:repeating-linear-gradient(90deg,#343841 0,#343841 1px,transparent 1px,transparent 10%);border:1px solid #626875;overflow:hidden;touch-action:none}
    #fl-track button{position:absolute;height:26px;overflow:hidden;white-space:nowrap;font-size:10px;padding:0 3px;background:#5c3451;touch-action:none}
    #fl-track button[aria-pressed=true]{outline:2px solid #f39ac3} #fl-head{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none;z-index:3}
    #fl-time{width:100%} #fl-curves{width:100%;height:135px;font:11px monospace} #fl-chart{width:100%;height:80px;background:#16191e}
    #fl-inspector{border-top:1px solid #555;padding-top:4px;margin-top:6px} #fl-upload{display:none}
  </style>
  <h2>Biblioteca facial · ARKit</h2>
  <div id="fl-compatible"></div>
  <input id="fl-search" aria-label="Buscar expresión" placeholder="Buscar: feliz, duda, parpadeo…">
  <select id="fl-category" aria-label="Categoría facial"><option value="">Todas las categorías</option></select>
  <select id="fl-origin" aria-label="Origen facial"><option value="">Todos los orígenes</option><option value="original">Expresiones originales</option><option value="imported">Audio2Face / importadas (sin revisar)</option></select>
  <label><input id="fl-favorites-only" type="checkbox"> Solo favoritos</label>
  <div id="fl-count" style="font-size:11px"></div>
  <select id="fl-presets" size="5" aria-label="Expresiones de la biblioteca"></select>
  <button id="fl-page-prev">Anterior</button> <button id="fl-page-next">Siguiente</button> <button id="fl-refresh">Actualizar catálogo</button><br>
  <button id="fl-preview">Previsualizar</button> <button id="fl-apply">Aplicar a pista</button> <button id="fl-favorite">☆ Favorito</button>
  <button id="fl-neutral">Volver a neutral</button> <button id="fl-release">Volver al personaje vivo</button>
  <label><input id="fl-before" type="checkbox"> Antes / después (sin capa facial)</label>
  <label>Movimiento <select id="fl-movement" aria-label="Movimiento asociado">${Object.entries(MOVEMENTS).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>
  <div id="fl-movement-info" style="font-size:11px;color:#bcd1db"></div>
  <label>Intensidad del movimiento <input id="fl-movement-intensity" aria-label="Intensidad del movimiento" type="range" min="0" max="1" step=".01" value=".65"><output id="fl-movement-value">65 %</output></label>
  <label>Retraso del movimiento (s) <input id="fl-movement-delay" aria-label="Retraso del movimiento" type="number" min="0" max="599" step=".05" value=".15"></label>
  <button id="fl-frame-body">Ver gesto completo</button>
  <details id="fl-inspector"><summary>Editar expresión / clip</summary>
    <input id="fl-name" aria-label="Nombre de la variante" maxlength="160">
    <label>Intensidad <input id="fl-intensity" aria-label="Intensidad facial" type="number" min="0" max="1" step=".05" value="1"></label>
    <label>Inicio (s) <input id="fl-start" aria-label="Inicio facial" type="number" min="0" max="3600" step=".05" value="0"></label>
    <label>Duración (s) <input id="fl-duration" aria-label="Duración facial" type="number" min=".05" max="600" step=".05" value="2.4"></label>
    <label>Entrada (s) <input id="fl-in" aria-label="Entrada facial" type="number" min="0" step=".05" value=".15"></label>
    <label>Salida (s) <input id="fl-out" aria-label="Salida facial" type="number" min="0" step=".05" value=".2"></label>
    <label>Recorte inicial (s) <input id="fl-trim-start" aria-label="Recorte inicial" type="number" min="0" step=".05" value="0"></label>
    <label>Recorte final (s) <input id="fl-trim-end" aria-label="Recorte final" type="number" min=".05" step=".05"></label>
    <label><input id="fl-loop" type="checkbox"> Repetir dentro del clip</label>
    <label>Región <select id="fl-region" aria-label="Región facial">${Object.keys(regions).map(n=>`<option>${n}</option>`).join('')}</select></label>
    <label>Capa <select id="fl-blend" aria-label="Mezcla facial"><option value="override">Reemplazar región</option><option value="additive">Añadir con límite</option></select></label>
    <label>Prioridad <input id="fl-priority" aria-label="Prioridad facial" type="number" min="-100" max="100" step="1" value="0"></label>
    <button id="fl-update">Actualizar clip</button> <button id="fl-save">Guardar variante</button>
    <details><summary>Curvas editables</summary>
      <label>Interpolación <select id="fl-interpolation"><option value="spline">Continua (pasa por las claves sin frenar)</option><option value="smoothstep">Suave, con parada en cada clave</option><option value="linear">Lineal</option></select></label>
      <p style="font-size:11px">Claves [segundo, peso 0–1]. Se conservan los presets base.</p>
      <textarea id="fl-curves" aria-label="Curvas ARKit JSON" spellcheck="false"></textarea>
      <select id="fl-channel" aria-label="Canal de la curva"></select><svg id="fl-chart" viewBox="0 0 280 80" role="img" aria-label="Curva facial seleccionada"><path fill="none" stroke="#ef8fbd" stroke-width="2"/></svg>
      <button id="fl-fit-curve" aria-pressed="false">Ajustar curva</button><span id="fl-curve-range"></span>
      <select id="fl-key" aria-label="Clave de la curva"></select>
      <label>Segundo de clave <input id="fl-key-time" aria-label="Segundo de clave" type="number" min="0" step=".01" value="0"></label>
      <label>Peso de clave <input id="fl-key-value" aria-label="Peso de clave" type="number" min="0" max="1" step=".01" value="0"></label>
      <button id="fl-key-save">Añadir / actualizar clave</button> <button id="fl-key-delete">Quitar clave</button>
    </details>
  </details>
  <h2>Facial — emociones / microgestos</h2>
  <div id="fl-track" aria-label="Pista facial"><span id="fl-head"></span></div>
  <input id="fl-time" aria-label="Tiempo facial" type="range" min="0" max="10" step=".01" value="0">
  <label>Tiempo (s) <input id="fl-time-number" aria-label="Ir al segundo" type="number" min="0" max="3600" step=".01" value="0"></label>
  <button id="fl-play">Reproducir pista</button> <button id="fl-pause">Pausar</button>
  <label>Velocidad <select id="fl-speed" aria-label="Velocidad facial"><option value="1">1×</option><option value=".5">0.5×</option><option value="2">2×</option><option value="-1">−1× (inversa)</option></select></label>
  <button id="fl-duplicate">Duplicar clip</button> <button id="fl-delete">Quitar clip</button>
  <button id="fl-undo">Deshacer</button> <button id="fl-redo">Rehacer</button>
  <button id="fl-export-preset">Exportar expresión</button> <button id="fl-export">Exportar proyecto</button> <button id="fl-csv">Exportar CSV</button> <button id="fl-import">Importar JSON</button>
  <input id="fl-upload" type="file" accept=".json,application/json">
  <details><summary>Compatibilidad y prueba individual</summary><select id="fl-probe-channel" aria-label="Canal de prueba">${ARKIT.map(n=>`<option>${n}</option>`).join('')}</select>
  <label>Peso de prueba <input id="fl-probe-weight" aria-label="Peso de prueba" type="number" min="0" max="1" step=".1" value=".7"></label>
  <button id="fl-probe">Probar canal</button> <button id="fl-report">Exportar informe</button><div id="fl-source"></div></details>
  <p id="fl-status" role="status" aria-live="polite"></p>`;
  container.append(host);
  if(session)container.prepend(host);
  // Keep the new library beside the old expressions without moving their controls.
  const existingStatus=container.querySelector('#lc_estado');
  if(existingStatus&&!session)existingStatus.before(host);
  const $=id=>host.querySelector('#fl-'+id),num=id=>Number($(id).value);
  if(!vida){$('release').textContent='Desactivar capa facial';$('movement').replaceChildren(new Option('Sin movimiento corporal','none'));for(const id of ['movement','movement-intensity','movement-delay'])$(id).disabled=true;}
  const status=(message,error=false)=>{$('status').textContent=message;$('status').dataset.error=String(error);};
  function persist(){if(session){if(draftKey)try{localStorage.setItem(draftKey,JSON.stringify({date:Date.now(),project}));}catch{}return true;}try{localStorage.setItem(storageKey,JSON.stringify(project));return true;}catch(e){status('No se pudo guardar en este navegador. Exporta el proyecto JSON. '+e.message,true);return false;}}
  function commit(action){const previous=copy(project);try{action();validateProject(project);}catch(e){project=previous;throw e;}history.push(previous);if(history.length>60)history.shift();future.length=0;const saved=persist();renderLibrary();renderTrack();return saved;}
  const safe=fn=>async()=>{try{await fn();}catch(e){status(e.message,true);}};
  const extent=()=>Math.max(10,...project.instances.map(i=>i.start+i.duration));
  const allPresets=()=>{const ids=new Set(project.presets.map(p=>p.id));return [...project.presets,...external.filter(p=>!ids.has(p.id))];};
  async function loadExternalCatalog(){
    const response=await fetch('./facial-data/index.json');
    if(!response.ok)throw Error('El catálogo externo todavía no está preparado. Las expresiones originales siguen disponibles.');
    const data=await response.json();
    if(data.schema!=='spanstories.facial-catalog'||data.version!==1||!Array.isArray(data.clips)||data.clips.length>100000)throw Error('Índice facial no compatible.');
    if(data.count!==data.clips.length||data.clips.some(p=>typeof p.id!=='string'||typeof p.name!=='string'||typeof p.category!=='string'||!Array.isArray(p.tags)||!p.source||p.source.kind!=='imported'||!Number.isFinite(p.duration)||!/^[a-f0-9]{20}\.json$/.test(p.file)))throw Error('Metadatos del catálogo inválidos.');
    external=data.clips;page=0;renderLibrary();
    status(`${external.length.toLocaleString('es')} clips externos disponibles bajo demanda. Son habla emocional sintética; revisa procedencia y aspecto.`);
  }
  async function loadPreset(id){
    const existing=project.presets.find(p=>p.id===id)||cache.get(id);if(existing)return existing;
    const entry=external.find(p=>p.id===id);if(!entry||!/^[a-f0-9]{20}\.json$/.test(entry.file))throw Error('Clip fuera del catálogo.');
    const response=await fetch('./facial-data/'+entry.file);if(!response.ok)throw Error('No se pudo cargar el clip.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw Error('Clip demasiado grande.');
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(entry.sha256&&digest!==entry.sha256)throw Error('La integridad del clip no coincide con el índice.');
    const p=corregirPreset(validatePreset(JSON.parse(new TextDecoder().decode(bytes))));if(p.id!==id)throw Error('Identidad de clip incorrecta.');
    cache.set(id,p);if(cache.size>8)cache.delete(cache.keys().next().value);return p;
  }
  function renderLibrary(){
    const catalog=allPresets(),category=$('category').value,origin=$('origin').value,query=normalize($('search').value),favorites=$('favorites-only').checked;
    const list=catalog.filter(p=>{
      if((category&&p.category!==category)||(origin&&p.source.kind!==origin)||(favorites&&!project.favorites.includes(p.id)))return false;
      const text=normalize([p.name,p.category,...p.tags].join(' '));
      return query.split(/\s+/).every(term=>(searchAliases[term]||[term]).some(word=>text.includes(word)));
    });
    const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=clamp(page,0,pages-1);
    $('presets').replaceChildren();
    for(const p of list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)){const o=new Option(`${project.favorites.includes(p.id)?'★ ':''}${p.name} · ${p.duration.toFixed(1)} s`,p.id);$('presets').append(o);}
    $('count').textContent=`${catalog.length.toLocaleString('es')} en biblioteca · ${list.length.toLocaleString('es')} resultados · página ${page+1}/${pages}`;
    $('page-prev').disabled=page===0;$('page-next').disabled=page>=pages-1;
    $('presets').value=selected;
    const categories=[...new Set(catalog.map(p=>p.category))];$('category').replaceChildren(new Option('Todas las categorías',''),...categories.map(c=>new Option(`${c} (${catalog.filter(p=>p.category===c).length})`,c)));$('category').value=category;
    $('favorite').textContent=project.favorites.includes(selected)?'★ Favorito':'☆ Favorito';
    $('undo').disabled=!history.length;$('redo').disabled=!future.length;
    const used=Object.keys(draft.channels),missing=used.filter(n=>player.report.missing.includes(n)),empty=used.filter(n=>player.report.zeroDelta.includes(n));
    $('compatible').textContent=`${player.report.present.length}/52 nombres · ${player.report.functional.length} con desplazamiento · ${player.report.meshes.length} mallas\n`+
      (player.report.zeroDelta.length?`Aviso: ${player.report.zeroDelta.length} canales exportados sin movimiento.\n`:'')+
      (missing.length?'Faltan: '+missing.join(', '):'')+(empty.length?'Expresión parcial: '+empty.join(', '):'')+
      (!missing.length&&!empty.length?'Revisión visual por personaje pendiente.':'');
    $('source').textContent=`${draft.source.kind==='original'?'Curvas originales':'Habla emocional sintética · sin revisión visual'} · licencia: ${draft.source.license} · ${used.length} canales`+(draft.source.sourceCorpus?` · corpus: ${draft.source.sourceCorpus} (${draft.source.sourceCorpusLicense}) · redistribución pendiente de revisión`:'');
    $('movement-info').textContent=vida?'Sugerido: '+MOVEMENTS[suggestMovement(draft)]+'. Con un clip corporal activo, el gesto cede los brazos para conservarlo.':'El cuerpo de referencia se conserva. Su retargeting y edición se realizan en el Taller de animación.';
  }
  function inspectPreset(p,instance=null){
    selected=p.id;draft=copy(p);instanceId=instance?.id||null;if(!p.id.startsWith('user.')&&pristine?.id!==p.id)pristine=copy(p);
    instance??=p.defaults||null;
    $('movement').value=vida?(instance?.movement?.id??'auto'):'none';$('movement-intensity').value=vida?(instance?.movement?.intensity??.65):0;$('movement-value').textContent=Math.round(num('movement-intensity')*100)+' %';$('movement-delay').value=vida?(instance?.movement?.delay??Math.min(.15,(instance?.duration??p.duration)*.15)):0;
    $('name').value=p.name;$('duration').value=instance?.duration??p.duration;$('intensity').value=instance?.intensity??1;
    $('start').value=instance?.start??time;$('in').value=instance?.fadeIn??Math.min(.15,p.duration/4);$('out').value=instance?.fadeOut??Math.min(.2,p.duration/4);
    $('trim-start').value=instance?.trimStart??0;$('trim-end').value=instance?.trimEnd??p.duration;
    $('loop').checked=instance?.loop??p.loop;$('region').value=Object.keys(regions).find(r=>JSON.stringify(regions[r])===JSON.stringify(instance?.mask))||'Todo';
    $('blend').value=instance?.blend??'override';$('priority').value=instance?.priority??0;$('interpolation').value=p.interpolation;
    $('curves').value=JSON.stringify(p.channels,null,2);drawCurve();renderLibrary();renderTrack();onInspect?.(copy(p),instance?copy(instance):null);
  }
  function readDraft(){const p={...copy(draft),name:$('name').value.trim(),channels:JSON.parse($('curves').value),interpolation:$('interpolation').value};return validatePreset(p);}
  function options(p,id=uid()){
    const acting=project.instances.find(i=>i.id===id)?.acting||draft.defaults?.acting;
    return validateInstance({id,presetId:p.id,start:num('start'),duration:num('duration'),intensity:num('intensity'),fadeIn:num('in'),fadeOut:num('out'),trimStart:num('trim-start'),trimEnd:num('trim-end'),priority:num('priority'),blend:$('blend').value,loop:$('loop').checked,mask:regions[$('region').value],movement:{id:$('movement').value,intensity:num('movement-intensity'),delay:num('movement-delay')},...(acting?{acting:copy(acting)}:{})},[p]);
  }
  function materialize(p,force=false){
    const original=project.presets.find(x=>x.id===p.id);
    // Un gesto de la biblioteca sin editar entra con su propio id: así las correcciones generales lo reconocen.
    if(!force&&!original&&pristine?.id===p.id&&JSON.stringify(p.channels)===JSON.stringify(pristine.channels)&&p.duration===pristine.duration){p=copy(p);project.presets.push(p);return p;}
    if(force||!original||JSON.stringify(p)!==JSON.stringify(original)){p=copy(p);p.source={...p.source,componente:componenteDe(p)};p.id='user.'+uid();p.review={status:'user-variant'};project.presets.push(p);}
    return p;
  }
  function renderTrack(){
    for(const el of $('track').querySelectorAll('button'))el.remove();
    const end=extent();$('time').max=end;
    project.instances.forEach(i=>{
      const p=project.presets.find(p=>p.id===i.presetId),b=document.createElement('button');b.textContent=p?.name||i.presetId;b.title=`${b.textContent} · ${i.start.toFixed(2)}–${(i.start+i.duration).toFixed(2)} s · ${i.intensity}`;
      b.style.left=(i.start/end*100)+'%';b.style.width=(i.duration/end*100)+'%';b.style.top=(i.priority>0?38:5)+'px';b.setAttribute('aria-pressed',String(i.id===instanceId));
      b.onclick=()=>inspectPreset(p,i);
      b.onpointerdown=e=>{
        if(e.button!==0)return;const startX=e.clientX,initial=i.start,rect=$('track').getBoundingClientRect();let moved=false;b.setPointerCapture(e.pointerId);
        b.onpointermove=ev=>{const delta=(ev.clientX-startX)/rect.width*end;if(Math.abs(ev.clientX-startX)>4)moved=true;if(moved)b.style.left=clamp(initial+delta,0,3600-i.duration)/end*100+'%';};
        b.onpointerup=ev=>{b.onpointermove=null;b.onpointerup=null;if(!moved)return;try{commit(()=>{i.start=Math.round(clamp(initial+(ev.clientX-startX)/rect.width*end,0,3600-i.duration)*100)/100;});inspectPreset(p,i);status('Clip movido y guardado.');}catch(err){status(err.message,true);}};
      };
      $('track').append(b);
    });
    updateTime();
  }
  function updateTime(){
    if(document.activeElement!==$('time'))$('time').value=time;
    if(document.activeElement!==$('time-number'))$('time-number').value=time.toFixed(2);
    $('head').style.left=clamp(time/extent())*100+'%';
  }
  function drawCurve(){
    try{const channels=JSON.parse($('curves').value),previous=$('channel').value;$('channel').replaceChildren(...Object.keys(channels).map(n=>new Option(n,n)));if(ownChannel(channels,previous))$('channel').value=previous;
      const keys=channels[$('channel').value];if(!Array.isArray(keys))return;
      const bounds=fitCurve?curveBounds(keys):{min:0,max:1};
      $('chart').querySelector('path').setAttribute('d',Array.from({length:101},(_,i)=>`${i?'L':'M'}${8+i*2.64},${curveY(curve(keys,draft.duration*i/100,$('interpolation').value),bounds)}`).join(' '));
      $('curve-range').textContent=` ${bounds.min.toFixed(2)}–${bounds.max.toFixed(2)}`;
      $('chart').querySelectorAll('circle').forEach(point=>point.remove());
      keys.forEach(([time,value],index)=>{
        const point=document.createElementNS('http://www.w3.org/2000/svg','circle');
        point.setAttribute('cx',8+time/draft.duration*264);point.setAttribute('cy',curveY(value,bounds));point.setAttribute('r','3.5');point.setAttribute('fill','#d9e8ff');point.setAttribute('tabindex','0');point.setAttribute('role','button');point.setAttribute('aria-label',`Clave ${time.toFixed(2)} s, peso ${value.toFixed(2)}`);
        const select=()=>{$('key').value=String(index);showKey();};point.onclick=select;point.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}};$('chart').append(point);
      });
      $('key').replaceChildren(...keys.map(([t,v],i)=>new Option(`${t.toFixed(3)} s → ${v.toFixed(3)}`,String(i))));showKey();
    }catch{status('Las curvas aún no forman un JSON válido.',true);}
  }
  const ownChannel=(o,n)=>Object.hasOwn(o,n);
  function showKey(){try{const key=JSON.parse($('curves').value)[$('channel').value][num('key')];if(key){$('key-time').value=key[0];$('key-value').value=key[1];}}catch{}}
  function release(){mode='off';playing=false;preview=null;probe=null;pendingWeights=null;movement.restore();before=false;$('before').checked=false;player.restore();status(vida?'Control devuelto a LifeCharacter y a los controles existentes.':'Capa facial desactivada. Se restauraron los pesos originales del personaje.');}
  // clock(now) → segundos: la vista previa sigue otro reloj (el del clip de cuerpo de una actuación cotidiana).
  function startPreview(repeat=false,clock=null){
    const p=readDraft();
    preview={preset:p,instance:options(p),started:performance.now(),repeat,clock};
    preview.instance.start=0;mode='preview';playing=false;probe=null;before=false;$('before').checked=false;
    status(`Vista previa: ${p.name}. `+(repeat?'Se repite mientras revisas la selección.':'Reproducción única.')+' No modifica la pista.');
  }
  function seek(value){time=clamp(value,0,3600);playing=false;mode='timeline';probe=null;preview=null;lastNow=null;updateTime();}
  for(const id of ['search','category','origin','favorites-only'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;renderLibrary();});
  $('page-prev').onclick=()=>{page--;renderLibrary();};$('page-next').onclick=()=>{page++;renderLibrary();};$('refresh').onclick=safe(loadExternalCatalog);
  $('presets').onchange=safe(async()=>{
    const revision=++selectionRevision;$('preview').disabled=$('apply').disabled=true;
    try{const p=await loadPreset($('presets').value);if(revision===selectionRevision){inspectPreset(p);startPreview(true);}}
    finally{if(revision===selectionRevision)$('preview').disabled=$('apply').disabled=false;}
  });
  $('presets').onclick=safe(()=>{
    // Clicking the already selected item should also recover its preview after
    // seeking the timeline, going neutral, or returning to the live character.
    if($('presets').value===selected&&(mode!=='preview'||preview?.pausedAt!==undefined)&&!$('preview').disabled)startPreview(true);
  });
  $('curves').oninput=drawCurve;$('channel').onchange=drawCurve;
  $('fit-curve').onclick=()=>{fitCurve=!fitCurve;$('fit-curve').setAttribute('aria-pressed',String(fitCurve));$('fit-curve').textContent=fitCurve?'Ver rango 0–1':'Ajustar curva';drawCurve();};
  $('key').onchange=showKey;$('interpolation').onchange=drawCurve;
  $('key-save').onclick=safe(()=>{const p=readDraft(),keys=p.channels[$('channel').value],t=num('key-time'),v=num('key-value');const existing=keys.find(k=>Math.abs(k[0]-t)<1e-6);if(existing)existing[1]=v;else keys.push([t,v]);keys.sort((a,b)=>a[0]-b[0]);validatePreset(p);$('curves').value=JSON.stringify(p.channels,null,2);drawCurve();status('Clave editada en el borrador. Guarda una variante o actualiza el clip.');});
  $('key-delete').onclick=safe(()=>{const p=readDraft(),keys=p.channels[$('channel').value],k=num('key');if(k===0||k===keys.length-1)throw Error('Conserva las claves de inicio y final.');keys.splice(k,1);validatePreset(p);$('curves').value=JSON.stringify(p.channels,null,2);drawCurve();status('Clave quitada del borrador.');});
  $('preview').onclick=safe(()=>startPreview());
  $('frame-body').onclick=()=>frameBody?.();
  $('movement-intensity').oninput=safe(()=>{
    $('movement-value').textContent=Math.round(num('movement-intensity')*100)+' %';
    if(mode==='preview'&&preview){preview.instance.movement={id:$('movement').value,intensity:num('movement-intensity'),delay:num('movement-delay')};validateInstance(preview.instance,[preview.preset]);}
    else startPreview(true);
  });
  for(const id of ['movement','movement-delay'])$(id).onchange=safe(()=>startPreview(true));
  $('apply').onclick=safe(()=>{let p=readDraft();const settings=options(p);const saved=commit(()=>{p=materialize(p);settings.presetId=p.id;project.instances.push(settings);});inspectPreset(p,settings);seek(settings.start);if(saved)status('Expresión aplicada a la pista y guardada.');});
  $('update').onclick=safe(()=>{const i=project.instances.find(i=>i.id===instanceId);if(!i)throw Error('Selecciona un bloque de la pista.');let p=readDraft();const settings=options(p,i.id);const saved=commit(()=>{p=materialize(p);settings.presetId=p.id;Object.assign(i,settings);});inspectPreset(p,i);if(saved)status('Clip actualizado y guardado.');});
  $('save').onclick=safe(()=>{let p=readDraft();const {id,presetId,start,...defaults}=options(p);p.defaults=defaults;validatePreset(p);const saved=commit(()=>{p=materialize(p,true);});inspectPreset(p);if(saved)status('Variante guardada con intensidad, duración, recortes y transiciones.');});
  $('favorite').onclick=safe(()=>{commit(()=>{project.favorites=project.favorites.includes(selected)?project.favorites.filter(id=>id!==selected):[...project.favorites,selected];});});
  $('neutral').onclick=()=>{playing=false;mode='neutral';probe=null;preview=null;before=false;$('before').checked=false;status('Neutral ARKit; cuerpo y controles anteriores conservados.');};
  $('release').onclick=release;
  $('before').onchange=()=>{before=$('before').checked;if(before)player.restore();};
  $('time').oninput=()=>seek(num('time'));$('time-number').oninput=()=>seek(num('time-number'));
  $('play').onclick=()=>{mode='timeline';preview=null;probe=null;playing=true;lastNow=null;if(time>=extent()&&num('speed')>0)time=0;if(time<=0&&num('speed')<0)time=extent();status('Pista facial en reproducción. El cuerpo conserva su propio clip.');};
  $('pause').onclick=()=>{playing=false;if(mode==='preview'&&preview)preview.pausedAt=performance.now();status('Animación facial pausada.');};
  $('duplicate').onclick=safe(()=>{const i=project.instances.find(i=>i.id===instanceId);if(!i)throw Error('Selecciona un clip.');const clone={...copy(i),id:uid(),start:i.start+i.duration};validateInstance(clone,project.presets);commit(()=>project.instances.push(clone));inspectPreset(project.presets.find(p=>p.id===clone.presetId),clone);status('Clip duplicado.');});
  $('delete').onclick=safe(()=>{if(!instanceId)throw Error('Selecciona un clip.');commit(()=>{project.instances=project.instances.filter(i=>i.id!==instanceId);});instanceId=null;status('Clip quitado. Puedes deshacer.');});
  function restoreHistory(from,to){if(!from.length)return;to.push(copy(project));project=from.pop();persist();playing=false;preview=null;probe=null;inspectPreset(project.presets.find(p=>p.id===selected)||project.presets[0]);status('Cambio restaurado.');}
  $('undo').onclick=()=>restoreHistory(history,future);$('redo').onclick=()=>restoreHistory(future,history);
  $('export-preset').onclick=safe(()=>download('expresion-arkit.json',readDraft()));
  $('export').onclick=()=>download('proyecto-facial.json',project);
  $('csv').onclick=safe(()=>{const p=readDraft(),i=options(p);i.start=0;const lines=['time,'+ARKIT.join(',')];for(let f=0;f<=Math.ceil(i.duration*30);f++){const t=Math.min(i.duration,f/30),w=evaluate([p],[i],t);lines.push(t.toFixed(6)+','+ARKIT.map(n=>w[n].toFixed(6)).join(','));}download('expresion-arkit.csv',lines.join('\n'),'text/csv');});
  $('import').onclick=()=>$('upload').click();
  $('upload').onchange=safe(async()=>{const f=$('upload').files[0];if(!f)return;try{if(f.size>8*1024*1024)throw Error('Máximo 8 MB por JSON.');const d=JSON.parse(await f.text());if(d.schema==='spanstories.facial-animation'){validatePreset(d);let p=copy(d);commit(()=>{if(project.presets.some(x=>x.id===p.id))p.id='import.'+uid();project.presets.push(p);});inspectPreset(p);}else{const loaded=validateProject(d);if(!loaded.presets.length)throw Error('Proyecto sin expresiones.');commit(()=>{project=loaded;project.favorites??=[];});inspectPreset(project.presets[0]);}release();status('JSON importado y guardado. Puedes deshacer la importación.');}finally{$('upload').value='';}});
  $('probe').onclick=safe(()=>{probe={[$('probe-channel').value]:clamp(num('probe-weight'))};mode='probe';playing=false;preview=null;status('Prueba anatómica: '+$('probe-channel').value+'. Volver al personaje vivo restaura el control.');});
  $('report').onclick=()=>download('compatibilidad-facial.json',player.report);
  inspectPreset(project.presets[0]);status(loadError||`${BASE_PRESETS.length} animaciones originales disponibles. Variantes y pista se guardan en este navegador.`,!!loadError);
  loadExternalCatalog().catch(()=>{});
  return {
    player,
    release,
    movement,
    applyFace(){if(pendingWeights)player.apply(pendingWeights);},
    get evaluation(){return pendingEvaluation;},
    get draftPreset(){return copy(draft);},
    /** El gesto tal como está en el inspector (con las curvas editadas a mano). */
    get editedPreset(){try{return readDraft();}catch{return draft?copy(draft):null;}},
    setChannelPeak(channel,value){
      if(!ARKIT.includes(channel))throw Error('Shape key desconocida.');
      const p=readDraft();p.channels[channel]=channelPeak(p,channel,value);validatePreset(p);
      const instance=project.instances.find(i=>i.id===instanceId);
      if(instance){commit(()=>{if(!p.id.startsWith('user.')){p.source={...p.source,componente:componenteDe(p)};p.id='user.'+uid();project.presets.push(p);instance.presetId=p.id;}else Object.assign(project.presets.find(x=>x.id===p.id),p);});}
      inspectPreset(p,instance);if(mode==='preview')startPreview(true,preview?.clock);
    },
    // `live` = mientras se arrastra el control: se ve al instante y no crea un paso de deshacer.
    setBodyIntensity(value,{live=false}={}){
      const instance=project.instances.find(i=>i.id===instanceId);if(!instance?.acting&&!draft.defaults?.acting)throw Error('Selecciona una actuación completa.');
      if(!Number.isFinite(value)||value<0||value>1)throw Error('Intensidad corporal fuera de rango.');
      if(preview?.instance.acting)preview.instance.acting.intensity=value;
      if(draft.defaults?.acting)draft.defaults.acting.intensity=value;
      if(live){if(instance?.acting)instance.acting.intensity=value;return;}
      if(instance){commit(()=>instance.acting.intensity=value);inspectPreset(draft,instance);}
    },
    /** Intensidad general de la actuación: rostro y, salvo body:false, también cuerpo. */
    setIntensity(value,{live=false,body=true}={}){
      if(!Number.isFinite(value)||value<0||value>1)throw Error('Intensidad fuera de rango.');
      const instance=project.instances.find(i=>i.id===instanceId),set=target=>{if(!target)return;target.intensity=value;if(body&&target.acting)target.acting.intensity=value;};
      $('intensity').value=value;set(preview?.instance);set(draft.defaults);
      if(live){set(instance);return;}
      if(instance){commit(()=>set(instance));inspectPreset(draft,instance);}
      else onInspect?.(copy(draft),null);
    },
    get mouthSmile(){
      if(!player.enabled||before||mode==='off')return null;
      const read=n=>{const b=player.bindings[n][0];return b?b.mesh.morphTargetInfluences[b.index]:0;};
      return (read('mouthSmileLeft')+read('mouthSmileRight'))/2;
    },
    get project(){return copy(project);},
    persistProject(){return persist();},
    async selectPreset(id,name){const preset=copy(await loadPreset(id));if(name)preset.name=name;inspectPreset(preset);startPreview(true);},
    selectActing(value,{clock=null}={}){const checked=validateProject(value);inspectPreset(checked.presets[0]);$('start').value=0;startPreview(true,clock);},
    loadProject(value){
      const loaded=copy(validateProject(value));
      for(const preset of BASE_PRESETS)if(!loaded.presets.some(p=>p.id===preset.id))loaded.presets.push(copy(preset));
      project=loaded;history.length=0;future.length=0;
      const instance=project.instances[0],preset=project.presets.find(p=>p.id===instance?.presetId)||project.presets[0];
      inspectPreset(preset,instance);$('inspector').open=true;seek(0);
      status('Actuación del Taller: edita este clip y devuelve los cambios.');
    },
    exportProject(){
      // Include inspector edits even when the author returns without pressing Update.
      const instance=project.instances.find(i=>i.id===instanceId);
      if(instance){let preset=readDraft();const settings=options(preset,instance.id);commit(()=>{preset=materialize(preset);settings.presetId=preset.id;Object.assign(instance,settings);});inspectPreset(preset,instance);}
      else if(draft.defaults?.acting&&mode==='preview'){let preset=readDraft();const settings=options(preset);commit(()=>{preset=materialize(preset);settings.presetId=preset.id;project.instances.push(settings);});inspectPreset(preset,settings);}
      return copy(validateProject(project));
    },
    seek,
    get state(){return {mode,time,playing,before,selected,instanceId};},
    tick(now=performance.now()){
      if(lastNow!==null&&playing){time=clamp(time+(now-lastNow)/1000*num('speed'),0,extent());if(time===0||time===extent())playing=false;}
      lastNow=now;
      if(mode==='off'||before){pendingWeights=null;pendingEvaluation=null;movement.restore();if(player.enabled)player.restore();return;}
      let weights;
      if(mode==='preview'&&preview){
        let elapsed=((preview.pausedAt??now)-preview.started)/1000;
        if(preview.clock)elapsed=clamp(preview.clock(now),0,preview.instance.duration-1e-3);
        else if(preview.repeat)elapsed%=preview.instance.duration;
        else if(elapsed>=preview.instance.duration){release();return;}
        weights=evaluate([preview.preset],[preview.instance],elapsed);
        pendingEvaluation={presets:[preview.preset],instances:[preview.instance],time:elapsed};
        movement.prepare(evaluateMovement([preview.preset],[preview.instance],elapsed));
      }
      else if(mode==='probe'){weights=probe;pendingEvaluation=null;movement.restore();}
      else if(mode==='neutral'){weights={};pendingEvaluation=null;movement.prepare(null);}
      else {weights=evaluate(project.presets,project.instances,time);pendingEvaluation={presets:project.presets,instances:project.instances,time};movement.prepare(evaluateMovement(project.presets,project.instances,time));}
      pendingWeights=weights||{};updateTime();
    }
  };
}
