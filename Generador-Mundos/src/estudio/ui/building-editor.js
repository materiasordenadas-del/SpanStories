import {STYLES} from '../arq/styles.js';
import {heightDescription} from '../data/automatic-references.js';

export class BuildingEditor{
  constructor(host,{select,apply,reset,undo}){
    this.host=host;
    host.innerHTML=`<h3>Edificio seleccionado</h3><select id="building-pick" aria-label="Seleccionar edificio"></select><p id="building-info" class="small"></p>
      <fieldset id="building-fields" disabled><div class="field"><label>Altura (m)<input id="edit-height" type="number" min="2.6" max="3000" step="0.1"></label></div>
      <div class="field"><label>Plantas<input id="edit-levels" type="number" min="1" max="200" step="1"></label></div>
      <div class="field"><label>Ajuste de apoyo (m)<input id="edit-baseOffset" type="number" min="-3" max="10" step="0.05" placeholder="0"></label></div>
      <div class="field"><label>Color de fachada<input id="edit-colour" placeholder="De la fuente"></label></div>
      <div class="field"><label>Material de fachada<input id="edit-material" placeholder="De la fuente"></label></div>
      <div class="field"><label>Cubierta<select id="edit-roofShape"><option value="">De la fuente</option>${['flat','gabled','hipped','mansard','pyramidal','dome','onion','barrel'].map(v=>`<option>${v}</option>`).join('')}</select></label></div>
      <div class="field"><label>Color de cubierta<input id="edit-roofColour" placeholder="De la fuente"></label></div>
      <div class="field"><label>Material de cubierta<input id="edit-roofMaterial" placeholder="De la fuente"></label></div>
      <div class="field"><label>Estilo<select id="edit-forceStyle"><option value="">De la fuente / región</option>${Object.entries(STYLES).map(([v,s])=>`<option value="${v}">${s.name}</option>`).join('')}</select></label></div>
      <button class="btn primary" id="edit-apply">Aplicar al edificio</button> <button class="btn" id="edit-reset">Restaurar fuente</button></fieldset>
      <button class="btn" id="edit-undo" disabled>Deshacer edición</button><p class="small">Los campos vacíos conservan la fuente. Cambios por ID, sin alterar los otros edificios.</p><p id="edit-error" class="err" role="status"></p>`;
    this.pick=host.querySelector('#building-pick');
    this.evidence=document.createElement('p');this.evidence.className='small';this.evidence.id='building-evidence';host.querySelector('#building-info').after(this.evidence);
    this.pick.onchange=()=>select(this.pick.value||null);
    host.querySelector('#edit-apply').onclick=async()=>{
      const patch={};for(const key of ['height','levels','baseOffset','colour','material','roofShape','roofColour','roofMaterial','forceStyle']){const v=host.querySelector('#edit-'+key).value.trim();if(v)patch[key]=['height','levels','baseOffset'].includes(key)?Number(v):v;}
      try{await apply(patch);}catch(e){host.querySelector('#edit-error').textContent=e.message;}
    };
    host.querySelector('#edit-reset').onclick=reset;
    host.querySelector('#edit-undo').onclick=undo;
  }
  update(model,selectedId,overrides,canUndo,busy){
    this.pick.replaceChildren(new Option('Selecciona en la escena o aquí',''));
    for(const b of model?.buildings??[])this.pick.add(new Option(b.name?`${b.name} · ${b.id}`:b.id,b.id));
    this.pick.value=selectedId??'';this.pick.disabled=busy;
    const b=model?.buildings.find(b=>b.id===selectedId),edit=overrides[selectedId]??{};
    this.host.querySelector('#building-info').textContent=b?`${b.id} · ${b.height.toFixed(1)} m · ${b.levels} plantas${b.appearance?.referenceRequired?' · Requiere referencia específica':''}`:'Sin selección';
    this.evidence.replaceChildren();
    if(b){this.evidence.append(heightDescription(b)+' · '+(b.modelId?'Modelo específico asignado; fidelidad pendiente de comparación':'Arquitectura generada; no reconstrucción fotográfica'));
      const r=b.autoReference;
      const link=(name,url)=>{const a=document.createElement('a');a.textContent=name;a.href=url;a.target='_blank';a.rel='noopener noreferrer';this.evidence.append(' · ',a);};
      if(r){link(r.label,r.url);this.evidence.append(' · '+r.heightStatus+(r.stale?' · caché vencida':'')+' · consultado '+r.retrievedAt?.slice(0,10));for(const u of r.images)link('Foto de referencia',u);for(const u of r.models)link('Modelo disponible como referencia',u);if(r.height)for(const u of r.height.sources)link('Fuente de altura',u);}
    }
    this.host.querySelector('#building-fields').disabled=!b||busy;
    for(const key of ['height','levels','baseOffset','colour','material','roofShape','roofColour','roofMaterial','forceStyle']){const input=this.host.querySelector('#edit-'+key);input.value=edit[key]??'';if(b&&'placeholder'in input)input.placeholder=String(typeof b[key]==='number'?Number(b[key].toFixed(2)):b[key]??(key==='baseOffset'?0:'De la fuente'));}
    this.host.querySelector('#edit-undo').disabled=!canUndo||busy;
    this.host.querySelector('#edit-error').textContent='';
  }
}
