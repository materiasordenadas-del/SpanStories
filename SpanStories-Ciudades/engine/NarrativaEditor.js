// Herramientas de autoría locales. Nunca se incluyen en la distribución educativa.
export async function montarPreparacionNarrativa({camera,target,objetos,zone,host,download}){
  if(!zone.lexiconUrl)return null;
  const map=await (await fetch(zone.lexiconUrl)).json();
  const key='spanstories.narrative-draft:'+zone.id;
  let draft={version:1,zoneId:zone.id,storyId:'story-barcelona-piloto',storyVersionId:'storyver-barcelona-piloto-1',scenes:[],lexicon:map};
  try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.zoneId===zone.id&&Array.isArray(saved.scenes)&&saved.lexicon)draft=saved;}catch{/* sigue con el mapa fuente */}
  const box=document.createElement('details');
  box.innerHTML='<summary>Preparación narrativa</summary><p>Asocia el objeto seleccionado y captura la cámara actual. Las interacciones son opcionales.</p><label>Vocabulario <select aria-label="Vocabulario narrativo"></select></label><button type="button" data-bind>Asociar objeto seleccionado</button><button type="button" data-shot>Capturar momento y cámara</button><button type="button" data-save>Guardar preparación local</button><button type="button" data-export>Exportar preparación</button><p role="status"></p><a target="_blank" rel="noopener">Abrir vista previa del Visor Web</a>';
  const select=box.querySelector('select'),status=box.querySelector('[role=status]');
  for(const e of map.entries)select.add(new Option(e.speech.text,e.id));
  let hostOrigin=new URLSearchParams(location.search).get('host');
  if(!hostOrigin&&document.referrer)try{hostOrigin=new URL(document.referrer).origin;}catch{/* sin anfitrión */}
  const allowed=['http://localhost:3000','http://127.0.0.1:3000','http://localhost:3100','http://127.0.0.1:3100'];
  box.querySelector('a').href=(allowed.includes(hostOrigin)?hostOrigin:'http://localhost:3100')+'/mundo/piloto-lexico?borrador=1';
  const persist=()=>{localStorage.setItem(key,JSON.stringify(draft));status.textContent='Preparación guardada en este navegador.';};
  box.querySelector('[data-bind]').onclick=()=>{
    if(!objetos.seleccion){status.textContent='Selecciona primero un objeto del editor.';return;}
    const entry=draft.lexicon.entries.find(e=>e.id===select.value);
    entry.selectors=[{objectIds:[objetos.seleccion]}];entry.highlight='hit';
    status.textContent='Asociado por ID estable. Guarda la preparación para probarla.';
  };
  box.querySelector('[data-shot]').onclick=()=>{
    draft.scenes.push({id:'momento-'+(draft.scenes.length+1),zoneId:zone.id,entryIds:[select.value],camera:{position:camera.position.toArray(),target:target.toArray()},text:'Explora los objetos de esta escena.'});
    status.textContent=draft.scenes.length+' momentos preparados. Guarda para probarlos.';
  };
  box.querySelector('[data-save]').onclick=()=>{try{persist();}catch{status.textContent='No se pudo guardar la preparación.';}};
  box.querySelector('[data-export]').onclick=()=>download('preparacion-narrativa-'+zone.id+'.json',draft);
  host.append(box);
  return {destruir(){box.remove();}};
}
