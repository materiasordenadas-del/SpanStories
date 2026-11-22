// Taller facial · modo «General · para todos». Corrige un componente facial una vez y vale para todos los
// personajes y todas las historias (CorreccionesFaciales.mjs). Después dice dónde se usa en las historias y, si el
// autor quiere, crea versiones nuevas de esas actuaciones con la corrección (solo cambian sus pistas de rostro).
import {ARKIT,evaluate,validateProject,copy} from './FacialCore.mjs';
import {facialPlayerForRig} from './FacialRigAdapter.mjs';
import * as C from './CorreccionesFaciales.mjs';

const API='http://127.0.0.1:5189';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/**
 * Vuelve a hornear SOLO las pistas `.morphTargetInfluences` de una actuación con su receta facial corregida.
 * Conserva tiempos, nombres de pista y las pistas del cuerpo. `root`: el personaje de esa actuación, ya cargado.
 */
export function rehornearRostro(asset,root,{T,project}){
  const player=facialPlayerForRig(root,project.rigMap||{});player.setGain?.(project.rigGain||{});
  const tracks=asset.animation.tracks.map(track=>{
    if(!track.name.endsWith('.morphTargetInfluences'))return track;
    const node=track.name.slice(0,-'.morphTargetInfluences'.length);
    let mesh=root.getObjectByName(node);if(!mesh)root.traverse(o=>{if(!mesh&&T.PropertyBinding.sanitizeNodeName(o.name)===node)mesh=o;});
    if(mesh&&!mesh.morphTargetInfluences)mesh.traverse(o=>{if(!mesh.morphTargetInfluences&&o.morphTargetInfluences)mesh=o;});
    const n=mesh?.morphTargetInfluences?.length,times=track.times;
    if(!n||track.values.length!==times.length*n)throw Error(`La malla ${node} no coincide con la actuación guardada.`);
    const values=new Array(times.length*n),saved=Float32Array.from(mesh.morphTargetInfluences);
    for(let k=0;k<times.length;k++){
      mesh.morphTargetInfluences.fill(0);
      player.apply(evaluate(project.presets,project.instances,times[k]));
      for(let j=0;j<n;j++)values[k*n+j]=Math.round(mesh.morphTargetInfluences[j]*1e5)/1e5;
    }
    player.restore?.();for(let j=0;j<n;j++)mesh.morphTargetInfluences[j]=saved[j];   // es un Array de three, no un Float32Array
    return {...track,values};
  });
  return {...asset,animation:{...asset.animation,tracks}};
}

export function montarModoGeneral({T,getLibrary,getCharacter,getRoot,loadCharacterById,ask,say,saveCalibration,POSES,VISEMAS,onSaved=()=>{}}){
  const box=document.createElement('section');box.className='tf-general';box.setAttribute('aria-label','Corrección general');
  box.innerHTML=`<h2>Corrección general</h2>
    <p class="tf-note">Lo que corrijas aquí vale para <b>todos los personajes y todas las historias</b>: elige el gesto en el catálogo (o una expresión de la vida o un visema), ajusta sus picos y curvas y pulsa «Corrección general». El gesto queda reemplazado (no se crea otro).</p>
    <label class="tf-row" style="grid-template-columns:1fr"><span>Expresión de la vida o visema</span><select data-pose aria-label="Expresión de la vida o visema a corregir"><option value="">Elegir…</option></select></label>
    <p data-what class="tf-note"></p>
    <button data-save>✔ Corrección general</button> <button data-restore>Restaurar original</button>
    <details data-uses><summary>Dónde se usa en las historias</summary><p data-uses-note class="tf-note">Guarda una corrección para ver qué actuaciones de las historias la usan.</p><div data-uses-list></div><button data-update disabled>Actualizar las seleccionadas</button></details>
    <h2>Calibración del personaje</h2>
    <p class="tf-note" data-cal-note></p><button data-cal>Guardar calibración de este personaje</button>
    <style>.tf-general{border:1px solid #e86fa655;border-radius:6px;padding:4px 8px;margin:6px 0}.tf-use{display:grid;grid-template-columns:18px 1fr;gap:4px;font:11px system-ui;margin:4px 0}.tf-use small{color:#9fb6cb}.tf-use[data-variant=true]{opacity:.6}</style>`;
  const q=s=>box.querySelector(s),poseSelect=q('[data-pose]');
  const vida=document.createElement('optgroup');vida.label='Vida · expresiones rápidas';vida.append(...Object.keys(POSES).filter(n=>Object.keys(POSES[n].cara||{}).length).map(n=>new Option(n,'vida.'+n)));
  const vis=document.createElement('optgroup');vis.label='Habla · visemas (personajes sin visemas propios)';vis.append(...Object.keys(VISEMAS).map(n=>new Option(n,'visema.'+n)));
  poseSelect.append(vida,vis);
  let current=null,uses=[];
  /** Componente y original del gesto que se está editando. */
  function inspected(){
    const p=getLibrary()?.editedPreset;if(!p)return null;
    const id=C.componenteDe(p);if(!id||id.startsWith('user.'))return {preset:p,id:null};
    const tipo=C.tipoDe(id),orig=C.original(id);
    return {preset:p,id,tipo,original:orig?(tipo==='preset'?orig:C.presetDePose(id,p.name,orig)):null};
  }
  function paint(){
    current=inspected();const what=q('[data-what]'),doc=C.correcciones();
    if(!current?.id){what.textContent='Gesto en edición: variante propia (no es un componente de la biblioteca).';q('[data-save]').disabled=q('[data-restore]').disabled=true;return;}
    const item=doc.items[current.id];
    what.innerHTML=`Gesto en edición: <b>${esc(current.preset.name)}</b> <small>(${esc(current.id)})</small> · ${item?'corregido el '+esc(new Date(item.guardado).toLocaleString('es')):'original'}`;
    q('[data-save]').disabled=!current.original;q('[data-restore]').disabled=!item;
    const ch=getCharacter();q('[data-cal-note]').textContent=ch?`Fuerza de las shape keys y mapa de canales de ${ch.name}: valen para ${ch.name} en todas sus historias. Ajústalos en «Fuerza de las shape keys» y guárdalos aquí.`:'';
  }
  poseSelect.onchange=()=>{
    const id=poseSelect.value;if(!id)return;
    const [tipo,n]=[C.tipoDe(id),id.slice(id.indexOf('.')+1)];
    const pose=tipo==='vida'?POSES[n].cara:VISEMAS[n],p=C.presetDePose(id,(tipo==='vida'?'Vida · ':'Visema · ')+n,pose);
    getLibrary().selectActing({schema:'spanstories.facial-project',version:1,presets:[p],instances:[{id:'instance.'+id,presetId:p.id,start:0,duration:1,intensity:1,fadeIn:0,fadeOut:0,trimStart:0,trimEnd:1,priority:0,blend:'override',loop:true,movement:{id:'none',intensity:0,delay:0}}],favorites:[]});
    say(`${p.name}: ajusta el pico de cada shape key («Actuación») y pulsa «Corrección general».`);paint();
  };
  async function save(items){
    const doc=C.correcciones();
    const r=await fetch(API+'/ecosystem/correcciones-faciales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:doc.revision,items})}),d=await r.json();
    if(!r.ok)throw Error(d.error||'No se pudo guardar la corrección.');
    C.usarCorrecciones(d);return d;
  }
  q('[data-save]').onclick=async()=>{
    try{
      const c=inspected();if(!c?.id||!c.original)throw Error('Elige un gesto de la biblioteca para corregirlo.');
      const parche=c.tipo==='preset'?C.diferenciaPreset(c.original,c.preset):C.diferenciaPose(C.poseDePreset(c.original),C.poseDePreset(c.preset));
      if(!parche){say('Sin cambios respecto al original: nada que guardar.');return;}
      if(c.tipo==='preset')C.aplicarParchePreset(c.original,parche);   // valida antes de escribir
      await save({[c.id]:{tipo:c.tipo,parche}});onSaved();
      say(`«${c.preset.name}» corregido para todos. Revisa abajo las historias que lo usan.`);paint();await findUses(c.id);
    }catch(error){say(error.message);}
  };
  q('[data-restore]').onclick=async()=>{
    try{const c=inspected();if(!c?.id)return;await save({[c.id]:null});onSaved();say(`«${c.preset.name}» vuelve al original para todos.`);paint();await findUses(c.id);}catch(error){say(error.message);}
  };
  q('[data-cal]').onclick=async()=>{try{await saveCalibration();say('Calibración guardada para este personaje en todas sus historias.');}catch(error){say(error.message);}};
  let busy=false;
  async function findUses(id){
    if(busy)return;busy=true;try{await buscarUsos(id);}finally{busy=false;}
  }
  async function buscarUsos(id){
    const list=q('[data-uses-list]'),note=q('[data-uses-note]');q('[data-uses]').open=true;note.textContent='Buscando en las historias…';list.replaceChildren();q('[data-update]').disabled=true;
    if(C.tipoDe(id)!=='preset'){note.textContent='Las expresiones de la vida y los visemas se aplican en vivo: las historias ya usan la corrección, sin volver a hornear nada.';return;}
    try{
      const reply=await ask('USAGE_QUERY',{componentes:[id]},20000);if(reply.error)throw Error(reply.error);
      uses=reply.items||[];
      note.textContent=uses.length?`${uses.filter(u=>!u.variant).length} actuaciones de historias usan este gesto. Las variantes propias (editadas a mano en una historia) no se tocan.`:'Ninguna historia guardada usa este gesto: la corrección vale para los usos nuevos.';
      list.replaceChildren(...uses.map((u,i)=>{const row=document.createElement('label');row.className='tf-use';row.dataset.variant=String(u.variant);row.innerHTML=`<input type="checkbox" ${u.variant?'disabled':'checked'} data-i="${i}"><span>${esc(u.historiaName)} › ${esc(u.sceneName)} › ${esc(u.actorName)} <small>(${esc(u.sequenceName)} · ${esc(u.behavior.name)}${u.variant?' · variante propia':''})</small></span>`;return row;}));
      q('[data-update]').disabled=!uses.some(u=>!u.variant);
    }catch(error){note.textContent=error.message;}
  }
  // Abrir «Dónde se usa» busca el gesto en edición, sin tener que guardar antes.
  q('[data-uses]').addEventListener('toggle',()=>{const c=inspected();if(q('[data-uses]').open&&c?.id&&!busy)void findUses(c.id);});
  q('[data-update]').onclick=async()=>{
    const button=q('[data-update]');button.disabled=true;
    const chosen=[...box.querySelectorAll('[data-uses-list] input:checked')].map(i=>uses[+i.dataset.i]).filter(u=>u&&!u.variant);
    const pairs=[],byStory=new Map(),done=new Map(),back=getCharacter()?.id;
    try{
      // Por personaje: se carga cada uno una vez y se hornean sus actuaciones.
      chosen.sort((a,b)=>a.behavior.characterId.localeCompare(b.behavior.characterId));
      for(const u of chosen){
        const from=u.behavior.id;
        if(!done.has(from)){
          if(!u.behavior.url.startsWith(API+'/ecosystem/assets/')){say(`«${u.behavior.name}» es una actuación importada: ábrela en el Taller de animación para tener una copia editable y vuelve a intentarlo.`);continue;}
          say(`Actualizando «${u.behavior.name}» (${u.actorName})…`);
          if(getCharacter()?.id!==u.behavior.characterId)await loadCharacterById(u.behavior.characterId);
          const asset=await (await fetch(u.behavior.url,{cache:'no-store'})).json();
          const {project,cambiados}=C.corregirProyecto(validateProject(asset.recipe.facial));
          if(!cambiados.length){done.set(from,null);continue;}
          const next=rehornearRostro({...asset,recipe:{...asset.recipe,facial:project},provenance:{...asset.provenance,correccion:{de:from,componentes:cambiados,revision:C.correcciones().revision}}},getRoot(),{T,project});
          // Corrección general: si TODOS sus usos están marcados, la actuación queda reemplazada en su sitio (mismo
          // archivo, revisión nueva), sin duplicados. Si alguno está desmarcado, se crea una copia nueva solo para los
          // marcados: los desmarcados siguen con la actuación de siempre, también los que no fijan revisión.
          const everyUse=uses.filter(x=>x.behavior.id===from).every(x=>chosen.includes(x));
          delete next.id;delete next.createdAt;delete next.updatedAt;delete next.revision;delete next.owner;
          if(everyUse){next.replace=from;next.correccionGeneral=true;}
          const r=await fetch(API+'/ecosystem/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)}),ref=await r.json();if(!r.ok)throw Error(ref.error);
          done.set(from,ref);
        }
        const to=done.get(from);if(!to)continue;
        // Solo los cues marcados cambian de referencia (no todos los de la historia que usan esa actuación).
        let pair=pairs.find(p=>p.from===from);if(!pair)pairs.push(pair={from,to,uses:[]});
        pair.uses.push({historiaId:u.historiaId,cueId:u.cueId});
        byStory.set(u.historiaId,true);
      }
      if(!pairs.length){say('No había nada que actualizar (las actuaciones ya tenían la corrección o no se pudieron abrir).');return;}
      const reply=await ask('REPLACE_BEHAVIORS',{pairs,historias:[...byStory.keys()]},30000);
      const ok=(reply.results||[]).filter(r=>!r.error),bad=(reply.results||[]).filter(r=>r.error);
      const n=(k,uno,varios)=>`${k} ${k===1?uno:varios}`;say(`${n(pairs.length,'actuación','actuaciones')} con la corrección en ${n(ok.length,'historia','historias')}.${bad.length?' No se pudo en: '+bad.map(r=>r.historiaId+' ('+r.error+')').join(', '):''} La historia abierta queda con cambios sin guardar.`);
      await findUses(C.componenteDe(getLibrary().editedPreset));
    }catch(error){say('No se pudo actualizar: '+error.message);}
    finally{button.disabled=false;if(back&&getCharacter()?.id!==back)await loadCharacterById(back).catch(()=>{});}
  };
  paint();
  return {section:box,paint};
}
