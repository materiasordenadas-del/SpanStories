export class SpatialPanel{
  constructor(host,{selectRoad,applyRoad,resetRoad,importTerrain,resetTerrain,applyInterior,enterInterior}){
    host.innerHTML=`<details><summary>Calles y relieve local</summary><div class="field"><label>Calle<select id="spatial-road"></select></label></div><p class="small" id="spatial-road-info"></p>
      <fieldset id="spatial-road-fields" disabled><div class="field"><label>Ancho (m)<input id="spatial-width" type="number" min="0.8" max="60" step="0.1" placeholder="Conservar fuente"></label></div>
      <div class="field"><label>Representación<select id="spatial-structure"><option value="source">Conservar fuente</option><option value="surface">En superficie</option><option value="bridge">Puente aproximado</option><option value="tunnel">Túnel aproximado</option></select></label></div>
      <div class="field"><label>Elevación central del puente (m)<input id="spatial-elevationOffset" type="number" min="0" max="60" step="0.1" placeholder="0"></label></div>
      <div class="field"><label>Profundidad del túnel (m)<input id="spatial-depth" type="number" min="2" max="60" step="0.1" placeholder="6"></label></div>
      <div class="field"><label>Altura libre del túnel (m)<input id="spatial-clearance" type="number" min="2.2" max="12" step="0.1" placeholder="4.8"></label></div>
      <button class="btn primary" id="spatial-road-apply">Aplicar a la calle</button><button class="btn" id="spatial-road-reset">Restaurar calle</button></fieldset>
      <p class="small">Se conserva el eje original. Puentes y túneles son aproximaciones, sin cálculo de ingeniería.</p>
      <button class="btn" id="spatial-terrain-import">Importar relieve local (.json)</button><button class="btn" id="spatial-terrain-reset">Restaurar relieve fuente</button><input type="file" id="spatial-terrain-file" accept=".json,application/json" hidden><p class="small" id="spatial-terrain-info"></p></details>
      <details><summary>Interior generado de planta baja</summary><p class="small">No reproduce un plano real. Requiere apoyo casi plano, frente accesible y representación generada compatible.</p>
      <fieldset id="spatial-interior-fields" disabled><label class="check"><input type="checkbox" id="spatial-interior-enabled"> Habilitar interior en el edificio seleccionado</label>
      <div class="field"><label>Distribución<select id="spatial-interior-layout"><option value="single">Una estancia</option><option value="two">Dos estancias (huella rectangular)</option></select></label></div>
      <div class="field"><label>Altura interior (m)<input id="spatial-interior-height" type="number" min="2.2" max="4" step="0.1" value="2.8"></label></div>
      <div class="field"><label>Ancho de entrada (m)<input id="spatial-interior-doorWidth" type="number" min="1" max="2.5" step="0.1" value="1.6"></label></div>
      <div class="field"><label>Alto de entrada (m)<input id="spatial-interior-doorHeight" type="number" min="1.9" max="3.5" step="0.1" value="2.2"></label></div>
      <button class="btn primary" id="spatial-interior-apply">Aplicar interior</button><button class="btn" id="spatial-interior-enter" disabled>Entrar</button></fieldset><p class="small" id="spatial-interior-info"></p></details><p id="spatial-error" class="err" role="status"></p>`;
    this.host=host;
    const run=fn=>async()=>{try{await fn();host.querySelector('#spatial-error').textContent='';}catch(e){host.querySelector('#spatial-error').textContent=e.message;}};
    host.querySelector('#spatial-road').onchange=e=>selectRoad(e.target.value||null);
    host.querySelector('#spatial-road-apply').onclick=run(()=>{const value={structure:host.querySelector('#spatial-structure').value};for(const key of ['width','elevationOffset','depth','clearance']){const t=host.querySelector('#spatial-'+key).value;if(t!=='')value[key]=Number(t);}return applyRoad(value);});
    host.querySelector('#spatial-road-reset').onclick=run(resetRoad);
    host.querySelector('#spatial-terrain-import').onclick=()=>host.querySelector('#spatial-terrain-file').click();
    host.querySelector('#spatial-terrain-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)await run(async()=>{if(file.size>40*1024*1024)throw Error('DEM local demasiado grande');await importTerrain(await file.text());})();};
    host.querySelector('#spatial-terrain-reset').onclick=run(resetTerrain);
    host.querySelector('#spatial-interior-apply').onclick=run(()=>{const value={enabled:host.querySelector('#spatial-interior-enabled').checked,layout:host.querySelector('#spatial-interior-layout').value};for(const key of ['height','doorWidth','doorHeight'])value[key]=Number(host.querySelector('#spatial-interior-'+key).value);return applyInterior(value);});
    host.querySelector('#spatial-interior-enter').onclick=run(enterInterior);
  }
  update(state){
    const model=state.effectiveModel??state.model,pick=this.host.querySelector('#spatial-road');pick.replaceChildren(new Option('Selecciona una calle',''));
    for(const road of model?.roads??[])pick.add(new Option((road.name??road.cls)+' · '+road.id,road.id));pick.value=state.selectedRoadId??'';pick.disabled=state.busy;
    const road=model?.roads.find(r=>r.id===state.selectedRoadId),edit=state.roadEdits[state.selectedRoadId]??{};
    this.host.querySelector('#spatial-road-fields').disabled=!road||state.busy;this.host.querySelector('#spatial-road-info').textContent=road?`${road.id} · ${road.width.toFixed(1)} m · ${road.widthSource}`:'Sin calle seleccionada';
    for(const key of ['width','elevationOffset','depth','clearance'])this.host.querySelector('#spatial-'+key).value=edit[key]??'';this.host.querySelector('#spatial-structure').value=edit.structure??'source';
    this.host.querySelector('#spatial-terrain-info').textContent=state.terrainOverride?state.terrainOverride.source.name+' · '+state.terrainOverride.resolution+'×'+state.terrainOverride.resolution+' · '+state.terrainOverride.source.license:'Relieve de la fuente original';
    const b=model?.buildings.find(b=>b.id===state.selectedId),config=state.interiors[state.selectedId]??{},pb=state.built?.buildings.prepared.find(p=>p.b.id===state.selectedId);
    this.host.querySelector('#spatial-interior-fields').disabled=!b||state.busy;this.host.querySelector('#spatial-interior-enabled').checked=config.enabled===true;
    this.host.querySelector('#spatial-interior-layout').value=config.layout??'single';for(const [k,v]of [['height',2.8],['doorWidth',1.6],['doorHeight',2.2]])this.host.querySelector('#spatial-interior-'+k).value=config[k]??v;
    this.host.querySelector('#spatial-interior-enter').disabled=!pb?.interiorPlan||state.busy;
    this.host.querySelector('#spatial-interior-info').textContent=pb?.interiorIssue??(pb?.interiorPlan?'Interior generado disponible · entrada y colisiones activas':b?b.id+' · interior desactivado':'Selecciona primero un edificio');
  }
}
