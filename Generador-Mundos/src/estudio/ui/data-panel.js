import {REGIONS,dataQuality,CLIMATE_CHOICES} from '../data/quality.js';
import {climateOf,CLIMATES,CLIMATE_VARIANTS} from '../data/climate.js';
import {PROFILE_NAMES} from '../data/context.js';
import {SUBREGION_NAMES} from '../data/country.js';

export class DataPanel{
  constructor(host,{settings,importSource,removeSource}){
    host.innerHTML=`<details><summary>Datos, cobertura y fuentes</summary><div id="data-quality" class="small"></div><p class="small">Registrado no significa comprobado en el terreno. Los huecos de fachada siguen siendo generados.</p>
      <div class="field"><label>Biblioteca regional<select id="data-region">${Object.entries(REGIONS).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label></div>
      <div class="field"><label>Zona climática (dato del lugar para el visor)<select id="data-climate"><option value="auto">Automático (deducido)</option>${Object.entries(CLIMATE_CHOICES).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label></div>
      <div class="field"><label>Metros por planta estimada<input id="data-floor-height" type="number" min="2.6" max="6" step="0.1"></label></div>
      <div class="field"><label>Plantas sin datos (0 = contexto)<input id="data-floors" type="number" min="0" max="60" step="1"></label></div>
      <div class="field"><label>Relieve del proveedor<select id="data-terrain"><option value="0">Original (sin filtrar)</option><option value="18">Filtrado urbano · quita bultos del DEM (18 m)</option><option value="30">Filtrado fuerte (30 m)</option></select></label></div>
      <label class="check"><input type="checkbox" id="data-infill"> Rellenar manzanas sin edificios en OSM (fachadas generadas con id gen:relleno:…)</label>
      <label class="check"><input type="checkbox" id="data-offline"> Usar fuente guardada, sin consultar proveedores</label>
      <button class="btn" id="data-apply">Aplicar configuración</button><button class="btn" id="data-import">Importar GeoJSON local</button><input type="file" id="data-file" accept=".json,.geojson,application/json" hidden>
      <p class="small">GeoJSON con source (id, name, license), Polygon WGS84 e id por edificio; o properties.targetId + edit para correcciones. Prioridad: edición manual → fuente local → OSM → estimación.</p><p class="err" id="data-error" role="status"></p></details>`;
    this.host=host;this.removeSource=removeSource;
    this.sourceList=document.createElement('div');host.querySelector('#data-quality').after(this.sourceList);
    this.references=document.createElement('div');this.references.className='small';this.sourceList.after(this.references);
    host.querySelector('#data-apply').onclick=async()=>{try{await settings({climate:host.querySelector('#data-climate').value,region:host.querySelector('#data-region').value,floorHeight:Number(host.querySelector('#data-floor-height').value),defaultFloors:Number(host.querySelector('#data-floors').value),offline:host.querySelector('#data-offline').checked,infill:host.querySelector('#data-infill').checked,terrainSmooth:Number(host.querySelector('#data-terrain').value)});}catch(e){host.querySelector('#data-error').textContent=e.message;}};
    host.querySelector('#data-import').onclick=()=>host.querySelector('#data-file').click();
    host.querySelector('#data-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)try{if(file.size>40*1024*1024)throw Error('Fuente local demasiado grande');await importSource(await file.text());}catch(error){host.querySelector('#data-error').textContent=error.message;}};
  }
  update(model,settings,supplements){
    const q=dataQuality(model),lines=[`${q.buildings} entidades · altura registrada ${q.heightRecorded} · documentada en Wikidata ${q.heightDocumented} · derivada de plantas ${q.heightFromLevels} · estimada ${q.heightEstimated} · corregida ${q.heightCorrected}`,`Color disponible ${q.wallColour} · material ${q.wallMaterial} · cubierta con datos/corrección ${q.roofShape}`,`${q.singular} singulares · ${q.roadsEstimated} vías con anchura deducida`,...(model?[(c=>`Clima: ${CLIMATES[c.id]} · ${CLIMATE_VARIANTS[c.variant]??c.variant} · ${c.source==='manual'?'corrección manual':'deducido'+(c.reason?' ('+c.reason+')':'')}${c.altitude!=null?' · altitud media '+c.altitude+' m':''}`)(climateOf(model))]:[]),...(model?.context?.country?[`País: ${model.context.country.name??'sin identificar'}${model.context.country.subregion?' · '+(SUBREGION_NAMES[model.context.country.subregion]??model.context.country.subregion):''}${model.context.country.hispanic?'':' · fuera del ámbito hispanohablante (estilos genéricos)'} · fuente: ${model.context.country.source}`]:[]),...(model?.context?[`Contexto: ${PROFILE_NAMES[model.context.profile]??model.context.profile}${q.inferred?` · ${q.inferred} parcelas de relleno generadas`:''}`]:[]),...supplements.map(s=>'Fuente local: '+s.source.name+' · '+s.source.license),...q.warnings];
    this.host.querySelector('#data-quality').textContent=lines.join('\n');
    this.sourceList.replaceChildren();for(const s of supplements){const button=document.createElement('button');button.className='btn';button.textContent='Retirar fuente '+s.source.name;button.onclick=()=>this.removeSource(s.source.id);this.sourceList.append(button);}
    this.references.replaceChildren();
    const refs=new Map([...(model?.buildings??[]),...(model?.points??[]),...(model?.landmarks??[])].filter(b=>b.autoReference).map(b=>[b.autoReference.id,b.autoReference]));
    if(model?.kind?.startsWith('real')){
      this.references.append(`Referencias automáticas: ${refs.size} identidades de OSM enlazadas a Wikidata. Sin coincidencias por nombre. Los monumentos sin modelo específico conservan geometría aproximada.`);
      for(const r of refs.values()){const p=document.createElement('p'),a=document.createElement('a');a.href=r.url;a.textContent=r.label;a.target='_blank';a.rel='noopener noreferrer';p.append(a,' · '+r.heightStatus+(r.models.length?' · modelo de referencia disponible':' · sin modelo de referencia encontrado'));this.references.append(p);}
    }
    this.host.querySelector('#data-climate').value=settings.climate??'auto';
    this.host.querySelector('#data-region').value=settings.region??'auto';this.host.querySelector('#data-floor-height').value=settings.floorHeight??3.2;this.host.querySelector('#data-floors').value=settings.defaultFloors??0;this.host.querySelector('#data-offline').checked=settings.offline===true;this.host.querySelector('#data-infill').checked=settings.infill===true;const ts=String(settings.terrainSmooth??0),sel=this.host.querySelector('#data-terrain');if(![...sel.options].some(o=>o.value===ts))sel.append(new Option(ts+' m',ts));sel.value=ts;
  }
}
