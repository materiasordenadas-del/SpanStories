// Estudio de lugares de Atlas: un lugar real (OSM + relieve) o un recinto generado (escuela),
// con la luz Trigun de SpanStories, líneas y tramas de manga, y exportación para SpanStories.
import './estudio.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {Viewer} from './render/viewer.js';
import {STYLE_CATALOG,STYLE_CONTROLS,StylePoolClient} from './render/style-pool.js';
import {cameraPresets,applyPreset} from './render/cameras.js';
import {PRESETS,SIZES,searchPlaces,parseCoordinates,fetchRegion,regionBounds,saveCapture} from './data/region.js';
import {buildPlaceModel,estimateHeights} from './data/place-model.js';
import {buildPlaceScene} from './scene/place-scene.js';
import {buildFarScene} from './scene/far-scene.js';
import * as THREE from 'three';
import {regionOf,STYLES} from './arq/styles.js';
import {generateSchool,SCHOOL_DEFAULTS} from './school/school.js';
import {CharacterPreview} from './render/characters.js';
import {placeSchool,schoolRectFromArea,schoolRectAt} from './school/insitu.js';
import {drawPlan} from './ui/plan.js';
import {exportSpanStories} from './export/spanstories.js';
import {Walker} from './render/walk.js';
import {updateCommerceLight} from './render/commerce-scene.js';
import {CommercePanel} from './ui/commerce-panel.js';
import {fetchAutomaticReferences,withAutomaticReferences} from './data/automatic-references.js';
import {encodeProject,decodeProject,MAX_PROJECT_BYTES} from './data/project.js';
import {saveProjectLocal,loadProjectLocal} from './data/project-storage.js';
import {applyEdits,validateEdit,EditHistory} from './data/edits.js';
import {BuildingEditor} from './ui/building-editor.js';
import {buildingIdFromHit,commerceIdFromHit} from './render/selection.js';
import {download,dataUrl} from '../storage.js';
import {withSettings,validateSettings} from './data/quality.js';
import {PROFILE_NAMES} from './data/context.js';
import {readSupplement,withSupplements} from './data/supplements.js';
import {DataPanel} from './ui/data-panel.js';
import {withProfiles,validateProfile} from './data/profiles.js';
import {ProfilePanel} from './ui/profile-panel.js';
import {EstudioAssetLibrary,assetRecord,MAX_ASSET_BYTES} from './render/asset-library.js';
import {withRoadEdits,validateRoadEdit,withLocalTerrain,readLocalTerrain} from './data/spatial-edits.js';
import {withInteriors,validateInterior} from './arq/interior.js';
import {SpatialPanel} from './ui/spatial-panel.js';
import {StreamScene} from './scene/stream-scene.js';
import {PackagePreview} from './render/package-preview.js';
import {GrassPanel} from './ui/grass-panel.js';

const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const automaticSave=params.get('autoguardado')!=='0';
const state={
  mode:'real',
  place:{lat:Number(params.get('lat'))||PRESETS[0].lat,lon:Number(params.get('lon'))||PRESETS[0].lon,name:params.get('n')||PRESETS[0].name,size:Number(params.get('s'))||300},
  seeds:{alturas:'h1',fachadas:'f1',calle:'c1',suelo:'s1'},
  seed:params.get('seed')||'spanstories',
  source:null,model:null,built:null,presets:[],busy:false,farSource:null,
  school:{...SCHOOL_DEFAULTS,seed:'aula-1'},
  overrides:{},selectedId:null,options:{streetTrees:true,cars:false,lamps:false,furniture:false,far:params.get('far')!=='0'},
  settings:{region:'auto',floorHeight:3.2,defaultFloors:0,offline:false,infill:params.get('relleno')!=='0',terrainSmooth:params.has('relieve')?Number(params.get('relieve'))||0:18},supplements:[],
  profiles:{},assets:[],automaticReferences:{},
  roadEdits:{},interiors:{},comercios:{},selectedCommerceId:null,terrainOverride:null,selectedRoadId:null,
};

$('#app').innerHTML=`
<header class="top">
  <div class="brand"><div class="dice">🎲</div><div>Estudio de lugares<small>Atlas · SpanStories · mapas reales y recintos</small></div></div>
  <div class="modes" id="modes">
    <button data-mode="real" class="on">Lugar real<small>un sitio del mapa</small></button>
    <button data-mode="school">Escuela<small>un colegio entero</small></button>
  </div>
  <button class="gacha" id="gacha">🎲 Gacha de lugar</button>
  <label class="seed">Semilla <input id="seed" value="${state.seed}"></label>
  <div class="spacer"></div>
  <button class="btn" id="project-save">Guardar proyecto</button><button class="btn" id="project-open">Abrir proyecto</button><button class="btn" id="project-recover" disabled>Recuperar autosalvado</button><input id="project-file" type="file" accept="application/json,.json" hidden>
  <a class="btn" href="/atlas.html" title="El generador procedural anterior">Atlas clásico</a>
  <button class="btn" id="png">⇩ Exportar PNG</button>
  <button class="btn primary" id="glb">⇪ Exportar a SpanStories</button>
  <button class="btn primary" id="visor-send">Enviar al visor</button><a class="btn" id="visor-open" href="http://localhost:3000/mundo/piloto-lexico?modo=desarrollo" target="_blank" rel="noopener">Abrir visor</a>
  <button class="btn" id="package-review" disabled>Revisar exportación</button>
</header>
<div class="main">
  <aside class="side" id="left">
    <h3>Orden de creación</h3>
    <div id="steps"></div>
    <h3 style="margin-top:14px">Lugar construido</h3>
    <div class="kv" id="stats"></div>
    <div class="legend" id="legend"></div>
    <div id="building-editor"></div>
  </aside>
  <section class="view" id="view">
    <div class="toolbar">
      <div class="seg" id="render">
        ${STYLE_CATALOG.map(s=>`<button data-m="${s.id}" class="${s.id==='spanstories'?'on':''}">${s.name}</button>`).join('')}
      </div>
      <div class="tool">Cámara <select id="cams"></select> Objetivo <input id="lens" type="range" min="14" max="85" value="28"><span id="lensv">28mm</span></div>
      <button class="btn" id="walk" title="Recorrer a pie: WASD, Mayús correr, ratón mirar, V tercera persona, Esc salir">🚶 Explorar</button>
      <button class="btn" id="walk-view" hidden>Vista: primera persona (V)</button>
      <span class="small">Escaparates procedurales · exportables</span>
      <div class="tool">Ambiente <select id="amb"><option value="manana">Mañana</option><option value="mediodia" selected>Mediodía</option><option value="tarde">Tarde</option><option value="nublado">Nublado</option><option value="noche">Noche</option></select></div>
      <div class="tool">☀ <input id="az" type="range" min="0" max="360" value="215" title="Dirección del sol"><input id="el" type="range" min="5" max="85" value="46" title="Altura del sol"> Línea <input id="lw" type="range" min="0.5" max="3" step="0.1" value="1" style="width:60px"></div>
      <div class="tool" id="zelda-tools" hidden>Acuarela <input id="paint" type="range" min="0" max="1.5" step="0.05" value="1" style="width:70px" title="Manchas de pincel, borde húmedo y papel"><button class="btn" id="characters" title="Coloca a Lamine y a la chica en el centro de la vista para revisar el estilo de personaje">👥 Personajes</button></div>
    </div>
    <div class="overlay" id="busy"><div id="busytext">Generando…</div></div>
    <div class="hint" id="hint">Arrastra para girar · botón derecho para desplazar · rueda para acercar · clic = marcador · 🚶 = de pie en el marcador</div>
  </section>
  <aside class="side right" id="right"></aside>
</div>
<footer class="status" id="status"><span id="st-main">Listo</span><span id="st-gpu"></span><span id="st-attr">© OpenStreetMap contributors · Mapzen Terrain Tiles</span></footer>`;

const viewer=new Viewer($('#view'));
const walker=new Walker(viewer);
const grassPanel=new GrassPanel(viewer,()=>scheduleAutosave());
const characters=new CharacterPreview({sun:viewer.sunDir});viewer.scene.add(characters.group);
window.estudio={viewer,state,walker,characters,openProject,exportCurrentPlace};
const editHistory=new EditHistory();
const selectionBox=new THREE.Box3Helper(new THREE.Box3(),0x1fc7d4);selectionBox.visible=false;viewer.scene.add(selectionBox);
const editor=new BuildingEditor($('#building-editor'),{select:selectBuilding,apply:editSelected,reset:resetSelected,undo:undoEdit});
let assetLibrary=new EstudioAssetLibrary();
const profileHost=document.createElement('section');profileHost.id='profile-panel';$('#left').append(profileHost);
const profilePanel=new ProfilePanel(profileHost,{apply:async value=>{if(state.busy||!state.selectedId)return;const p=validateProfile(value);if(p.modelId&&!assetLibrary.models.has(p.modelId))throw Error('Importa primero el modelo');await commitEdits({profiles:{...state.profiles,[state.selectedId]:p}});},reset:async()=>{if(state.busy||!state.selectedId)return;const profiles={...state.profiles};delete profiles[state.selectedId];await commitEdits({profiles});},importModel:async file=>{
  if(state.busy)throw Error('Espera a que termine la construcción');if(file.size>MAX_ASSET_BYTES)throw Error('Modelo demasiado grande (máximo 48 MB)');
  busy('Leyendo edificio…');try{const record=await assetRecord(await dataUrl(file),file.name);if(!assetLibrary.models.has(record.id)&&(state.assets.length>=50||(state.model?projectText().length:0)+record.dataUrl.length>MAX_PROJECT_BYTES))throw Error('La biblioteca excedería el límite del proyecto');await assetLibrary.add(record);state.assets=[...assetLibrary.records];}finally{busy(null);updateEditor();}scheduleAutosave();
}});
let autosaveTimer=null,recovery=null,projectRestoring=false,dataPanel=null,spatialPanel=null,commercePanel=null,lastBuildError=null,streamScene=null,packagePreview=null,previewSession=null,lastPackage=null;
viewer.onWorldFrame=()=>{viewer.grass.character=walker.active?walker.pos:null;if(packagePreview){packagePreview.refresh().catch(e=>$('#st-main').textContent=e.message);return;}if(streamScene&&!state.busy)streamScene.tick(walker.active?walker.pos:viewer.controls.target);updateCommerceLight(state.built?.group,viewer.pipeline.composite.uniforms.uNight.value);$('#walk-view').hidden=!walker.active;$('#walk-view').textContent='Vista: '+(walker.third?'tercera':'primera')+' persona (V)';};
function syncShopfronts(){viewer.dirty=true;}
$('#walk-view').onclick=()=>walker.setThird(!walker.third);
function currentView(){return {position:viewer.camera.position.toArray(),target:viewer.controls.target.toArray(),lens:viewer.lens,sunAz:viewer.sunAz,sunEl:viewer.sunEl,mode:$('#render button.on')?.dataset.m??'spanstories',ambient:$('#amb').value,lineWidth:Number($('#lw').value),grass:{...viewer.grass.config}};}
function projectText(){return encodeProject(state,{view:currentView()});}
function scheduleAutosave(){
  clearTimeout(autosaveTimer);if(!automaticSave||projectRestoring||packagePreview||!state.model)return;
  autosaveTimer=setTimeout(async()=>{if(state.busy)return;try{const text=projectText();await saveProjectLocal(text);recovery={current:text,previous:recovery?.current??null};$('#project-recover').disabled=false;$('#project-recover').title='Autosalvado actualizado';}catch(e){$('#project-recover').title='No se pudo guardar: '+e.message;$('#st-main').textContent='Autosalvado no disponible: '+e.message;}},800);
}
function updateEditor(){
  $('#visor-send').textContent=state.visorLink?'Actualizar en el visor':'Enviar al visor';
  $('#visor-open').href='http://localhost:3000/mundo/piloto-lexico?modo=desarrollo'+(state.visorLink?'&zone='+encodeURIComponent(state.visorLink.id):'');
  const model=state.effectiveModel??state.model;
  editor.update(model,state.selectedId,state.overrides,editHistory.entries.length>0,state.busy);
  profilePanel.update(model,state.selectedId,state.profiles,state.assets,state.busy);
  dataPanel?.update(model,state.settings,state.supplements);
  spatialPanel?.update(state);
  commercePanel?.update(state);
  const pb=state.built?.buildings.prepared.find(p=>p.b.id===state.selectedId);
  selectionBox.visible=Boolean(pb);
  if(pb){const b=pb.bbox;selectionBox.box.set(new THREE.Vector3(b[0]-.2,pb.base-.1,b[1]-.2),new THREE.Vector3(b[2]+.2,pb.top+1.1,b[3]+.2));selectionBox.updateMatrixWorld(true);}
  viewer.dirty=true;
}
function selectBuilding(id){state.selectedId=(state.effectiveModel??state.model)?.buildings.some(b=>b.id===id)?id:null;updateEditor();scheduleAutosave();}
async function editSelected(patch){
  if(state.busy||!state.selectedId)return;
  const edit=validateEdit(patch),overrides={...state.overrides};if(Object.keys(edit).length)overrides[state.selectedId]=edit;else delete overrides[state.selectedId];
  await commitEdits({overrides});
}
async function resetSelected(){return editSelected({});}
function checkpointEdits(){editHistory.checkpoint({overrides:state.overrides,profiles:state.profiles,interiors:state.interiors,comercios:state.comercios,roadEdits:state.roadEdits,terrainOverride:state.terrainOverride});}
async function commitEdits(patch){if(state.busy)throw Error('Espera a que termine la construcción');const old=Object.fromEntries(Object.keys(patch).map(k=>[k,state[k]]));checkpointEdits();Object.assign(state,patch);if(!await rebuild()){const message=lastBuildError?.message??'No se pudo aplicar el cambio';Object.assign(state,old);editHistory.entries.pop();await rebuild();throw Error(message);}}
async function undoEdit(){if(state.busy)return;const old=editHistory.undo();if(old){Object.assign(state,old);await rebuild();}}
function applyOptions(){for(const [key,id]of [['streetTrees','opt-trees'],['cars','opt-cars'],['lamps','opt-lamps'],['furniture','opt-furniture'],['far','opt-far'],['nearShops','near-shops']]){const input=$('#'+id);if(input)input.checked=state.options[key]!==false;}}
async function openProject(text){
  if(state.busy)return;
  const project=decodeProject(text); // validar todo antes de tocar la sesión vigente
  const previous={...state};
  const oldLibrary=assetLibrary,incomingLibrary=new EstudioAssetLibrary();
  clearTimeout(autosaveTimer);walker.stop();projectRestoring=true;
  try{
    await incomingLibrary.load(project.assets);assetLibrary=incomingLibrary;
    for(const key of ['mode','place','seed','seeds','source','model','realModel','overrides','selectedId','options','visorLink'])state[key]=project[key];
    state.farSource=project.farSource??null;state.settings=project.settings;state.supplements=project.supplements;state.profiles=project.profiles;state.assets=project.assets;state.roadEdits=project.roadEdits;state.interiors=project.interiors;state.terrainOverride=project.terrainOverride;state.selectedRoadId=project.selectedRoadId;
    state.automaticReferences=project.automaticReferences;
    state.comercios=project.comercios;state.selectedCommerceId=project.selectedCommerceId??null;
    state.school={...SCHOOL_DEFAULTS,...project.school,seed:project.school?.seed??project.model.seed??'aula-1'};state.far=null;state.pin=null;editHistory.clear();
    $('#seed').value=state.seed;$('#modes').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.mode===state.mode));
    $('#gacha').textContent=state.mode==='school'?'🎲 Gacha de colegio':'🎲 Gacha de lugar';renderRight();applyOptions();
    if(!await rebuild({fitCamera:true}))throw Error('No se pudo reconstruir el proyecto');
    const v=project.view;
    if(v){
      if(v.grass){viewer.grass.setConfig(v.grass);grassPanel.sync();}
      // El ambiente visual pertenece al pool; la cámara y el sol del proyecto se conservan.
      if(Number.isFinite(v.sunAz)&&Number.isFinite(v.sunEl)){viewer.setSun(v.sunAz,v.sunEl);$('#az').value=v.sunAz;$('#el').value=v.sunEl;}
      if(Array.isArray(v.position)&&v.position.length===3&&v.position.every(Number.isFinite)&&Array.isArray(v.target)&&v.target.length===3&&v.target.every(Number.isFinite)){viewer.camera.position.fromArray(v.position);viewer.controls.target.fromArray(v.target);}
      if(Number.isFinite(v.lens)&&v.lens>=14&&v.lens<=85){viewer.setLens(v.lens);$('#lens').value=v.lens;$('#lensv').textContent=v.lens+'mm';}
      // El estilo actual procede del pool, no de una copia guardada en el proyecto.
      stylePool.apply(stylePool.state);
      viewer.controls.update();viewer.dirty=true;
    }
    updateEditor();$('#st-main').textContent='Proyecto abierto · fuente y ediciones conservadas';oldLibrary.dispose();
  }catch(error){assetLibrary=oldLibrary;Object.assign(state,previous);$('#seed').value=state.seed;renderRight();applyOptions();if(state.model)await rebuild();incomingLibrary.dispose();updateEditor();throw error;}finally{projectRestoring=false;}
  scheduleAutosave();
}
$('#project-save').onclick=()=>{if(state.busy)return;try{const text=projectText();download(text,'atlas-estudio-proyecto.json','application/json');if(!automaticSave){$('#st-main').textContent='Proyecto descargado · ensayo sin modificar la recuperación local';return;}saveProjectLocal(text).then(()=>{$('#st-main').textContent='Proyecto guardado y descargado';}).catch(e=>{$('#st-main').textContent='JSON descargado; guardado local no disponible: '+e.message;});}catch(e){$('#st-main').textContent=e.message;}};
$('#project-open').onclick=()=>{if(!state.busy)$('#project-file').click();};
$('#project-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>MAX_PROJECT_BYTES)throw Error('Proyecto demasiado grande');await openProject(await file.text());}catch(error){$('#st-main').textContent=error.message;}};
$('#project-recover').onclick=async()=>{if(state.busy||!recovery)return;try{let text=recovery.current;try{decodeProject(text);}catch{if(!recovery.previous)throw Error('No hay un autosalvado válido');decodeProject(recovery.previous);text=recovery.previous;}await openProject(text);}catch(e){$('#st-main').textContent=e.message;}};
viewer.controls.addEventListener('end',scheduleAutosave);
// Marcador: clic sin arrastrar sobre el suelo o un edificio
const pin=new THREE.Mesh(new THREE.ConeGeometry(.6,1.6,10).rotateX(Math.PI),new THREE.MeshBasicMaterial({color:'#f07f6a'}));pin.visible=false;
let downAt=null;
viewer.renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY];});
viewer.renderer.domElement.addEventListener('pointerup',e=>{
  if(packagePreview){if(!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>4)return;const r=viewer.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),viewer.camera);const hits=ray.intersectObject(packagePreview.package.group,true),id=hits.map(h=>packagePreview.package.resolveHit(h)).find(Boolean);$('#hint').textContent=id?'Paquete guardado · ID seleccionado: '+id:'Paquete guardado · terreno sin edificio seleccionado';return;}
  if(walker.active||!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>4||!state.built)return;
  const r=viewer.renderer.domElement.getBoundingClientRect(),ndc=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(ndc,viewer.camera);
  const targets=[];state.built.group.traverse(o=>{if(o.isMesh&&(!o.isInstancedMesh&&['ground','building','building-model','building-interior','infrastructure'].includes(o.userData.kind)||o.isInstancedMesh&&(o.userData.entityId||o.userData.buildings?.some(i=>i>=0))))targets.push(o);});
  state.built.group.traverse(o=>{if(o.isMesh&&o.userData.kind==='commerce')targets.push(o);});
  const hit=ray.intersectObjects(targets,false)[0];if(!hit)return;
  selectBuilding(buildingIdFromHit(hit,state.effectiveModel??state.model));
  state.selectedCommerceId=commerceIdFromHit(hit);if(state.selectedCommerceId)updateEditor();
  // en un muro: el marcador va al suelo delante del muro
  const p=hit.point.clone(),normal=hit.face?.normal?.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));if(normal&&Math.abs(normal.y)<.5){p.addScaledVector(normal,1.2);p.y=(state.effectiveModel??state.model).terrain.height(p.x,p.z);}
  state.pin=p;$('#hint').textContent=`Marcador en (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) · 🚶 Explorar = ponerse de pie aquí`;
});
$('#walk').onclick=()=>{
  if(!state.built)return;
  if(walker.active){walker.stop();return;}
  updateWalkerWorld();
  try{walker.start(state.pin??null);}catch(e){$('#hint').textContent=e.message;return;}$('#walk').textContent='✕ Salir (Esc)';
  $('#hint').textContent='WASD caminar · Mayús correr · ratón mirar (clic para capturar) · Espacio saltar · V primera/tercera persona · Esc salir';
};
walker.onStop=()=>{$('#walk').textContent='🚶 Explorar';$('#hint').textContent='Arrastra para girar · botón derecho para desplazar · rueda para acercar · clic = marcador';};
function updateWalkerWorld(){walker.setWorld({model:state.effectiveModel??state.model,buildings:state.built.buildings.prepared,asphalt:state.built.ground.asphalt,trees:state.built.street.trees,lines:state.model.lines.filter(l=>l.kind!=='tree_row'),interiors:state.built.interiors,surfaces:state.built.infra?.walkSurfaces??[]});}

// ---------------- Panel derecho: lugar
function renderRight(){
  if(map){map.remove();map=null;rect=null;mapTiles=null;}
  if(state.mode==='real'){
    $('#right').innerHTML=`
      <h3>Lugar</h3>
      <div class="field"><label>Buscar por nombre o «lat, lon»</label><div class="row"><input id="q" placeholder="Plaza Mayor, Madrid · 40.4155, -3.7074"><button class="btn" id="go" style="flex:0 0 auto">Buscar</button></div></div>
      <div class="results" id="results"></div>
      <div class="field"><label>Lugares de ejemplo</label><select id="preset"><option value="">Elige un lugar…</option>${PRESETS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="mapbox" id="map"></div>
      <div class="row"><div class="field"><label>Tamaño</label><select id="size">${[...new Set([...SIZES,...(state.options.streaming?[1500,2000]:[]),state.place.size])].sort((a,b)=>a-b).map(s=>`<option value="${s}" ${s===state.place.size?'selected':''}>${s<1000?s+' m':s/1000+' km'}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><button class="btn primary" id="build">Construir aquí</button></div></div>
      <p class="small">Haz clic en el mapa para mover el centro. Datos: OpenStreetMap (ODbL) y elevación pública.</p>
      <h3 style="margin-top:12px">Qué construir</h3>
      <label class="check"><input type="checkbox" id="opt-trees" checked> Arbolado en aceras</label>
      <label class="check"><input type="checkbox" id="opt-cars"> Coches aparcados</label>
      <label class="check"><input type="checkbox" id="opt-lamps"> Farolas</label>
      <label class="check"><input type="checkbox" id="opt-furniture"> Mobiliario y macetas (bancos, papeleras, quioscos, semáforos)</label>
      <p class="small">Desmarcado = solo estructura: lo que no se modela queda como ancla con su id de OSM en la exportación, para tus GLB.</p>
      <label class="check"><input type="checkbox" id="opt-far" checked> Ciudad alrededor (2 km)</label>
      <h3 style="margin-top:12px">Colegio aquí</h3>
      <div class="results" id="schools"></div>
      <button class="btn" id="school-pin" style="width:100%">🏫 Colegio generado en el marcador</button>
      <p class="small">Sustituye el recinto escolar de OSM (o la zona del marcador) por un colegio generado, alineado con la calle. Opciones en la pestaña «Escuela».</p>
      <div id="place-info" class="small" style="margin-top:8px"></div>`;
    setupMap();
    $('#go').onclick=doSearch;$('#q').onkeydown=e=>{if(e.key==='Enter')doSearch();};
    $('#preset').onchange=e=>{const p=PRESETS.find(p=>p.id===e.target.value);if(p){state.place={...state.place,lat:p.lat,lon:p.lon,name:p.name};updateMap();loadPlace();}};
    $('#size').onchange=e=>{state.place.size=Number(e.target.value);updateMap();};
    $('#build').onclick=()=>loadPlace();
    renderSchools();
    $('#school-pin').onclick=()=>{if(!state.pin){$('#hint').textContent='Haz clic en el mapa 3D para poner un marcador y vuelve a pulsar';return;}schoolHere(schoolRectAt(baseModel(),state.pin.x,state.pin.z));};
  }else{
    const o=state.school,opt=(id,label,opts)=>`<div class="field"><label>${label}</label><select id="${id}">${opts.map(([v,t])=>`<option value="${v}" ${String(o[id])===String(v)?'selected':''}>${t}</option>`).join('')}</select></div>`;
    $('#right').innerHTML=`
      <h3>Colegio</h3>
      ${opt('estilo','Tradición',[['espana','Instituto español (IES)'],['latam','Colegio latinoamericano'],['japon','Escuela de estilo japonés']])}
      <div class="row">${opt('nivel','Nivel',[['primaria','Primaria'],['secundaria','Secundaria'],['instituto','Bachillerato']])}${opt('plantas','Plantas',[[2,'2'],[3,'3'],[4,'4']])}</div>
      <div class="row">${opt('pista','Campo',[['auto','Automático'],['atletismo','Pista de atletismo'],['futbol','Campo de fútbol'],['ninguna','Ninguno']])}${opt('canchas','Canchas',[[0,'0'],[1,'1'],[2,'2'],[3,'3']])}</div>
      <label class="check"><input type="checkbox" id="gimnasio" ${o.gimnasio?'checked':''}> Gimnasio / pabellón</label>
      <label class="check"><input type="checkbox" id="piscina" ${o.piscina?'checked':''}> Piscina</label>
      <label class="check"><input type="checkbox" id="barrio" ${o.barrio?'checked':''}> Barrio alrededor</label>
      <label class="check"><input type="checkbox" id="opt-far" checked> Ciudad lejana de fondo</label>
      <button class="btn primary" id="school-build" style="width:100%;margin:8px 0">Generar este colegio</button>
      <h3 style="margin-top:12px">Plano (recinto)</h3>
      <canvas id="plan" width="300" height="230" style="width:100%;background:#0e131b;border-radius:9px;border:1px solid var(--line)"></canvas>
      <p class="small">La misma semilla da el mismo colegio. Cambiar opciones conserva la semilla.</p>`;
    for(const id of ['estilo','nivel','plantas','pista','canchas'])$('#'+id).onchange=e=>{state.school[id]=['plantas','canchas'].includes(id)?Number(e.target.value):e.target.value;loadSchool();};
    for(const id of ['gimnasio','piscina','barrio'])$('#'+id).onchange=e=>{state.school[id]=e.target.checked;loadSchool();};
    $('#school-build').onclick=()=>loadSchool();
    if(state.model?.kind==='school')drawPlan($('#plan'),state.model);
  }
  applyOptions();for(const [key,id]of [['streetTrees','opt-trees'],['cars','opt-cars'],['lamps','opt-lamps'],['furniture','opt-furniture'],['far','opt-far']]){const input=$('#'+id);if(input)input.onchange=e=>{state.options[key]=e.target.checked;if(!state.busy)rebuild();};}
  const dataHost=document.createElement('section');dataHost.id='data-panel';$('#right').append(dataHost);
  dataPanel=new DataPanel(dataHost,{settings:async settings=>{if(state.busy)throw Error('Espera a que termine la construcción');state.settings=validateSettings(settings);syncMapSources();if(state.model)await rebuild();},removeSource:async id=>{if(state.busy)return;state.supplements=state.supplements.filter(s=>s.source.id!==id);await rebuild();},importSource:async text=>{
    if(state.busy||!state.model)throw Error('Construye o abre primero un lugar');
    const source=readSupplement(text),sources=state.supplements.filter(s=>s.source.id!==source.source.id).concat(source);
    withSupplements(state.model,sources);state.supplements=sources;await rebuild();
  }});
  dataPanel.update(state.effectiveModel??state.model,state.settings,state.supplements);
  const spatialHost=document.createElement('section');spatialHost.id='spatial-panel';$('#right').append(spatialHost);
  spatialPanel=new SpatialPanel(spatialHost,{selectRoad:id=>{state.selectedRoadId=id;spatialPanel.update(state);},applyRoad:async value=>{if(!state.selectedRoadId)return;await commitEdits({roadEdits:{...state.roadEdits,[state.selectedRoadId]:validateRoadEdit(value)}});},resetRoad:async()=>{const roadEdits={...state.roadEdits};delete roadEdits[state.selectedRoadId];await commitEdits({roadEdits});},importTerrain:async text=>{if(!state.model)throw Error('Construye primero un lugar');await commitEdits({terrainOverride:readLocalTerrain(text,state.model)});},resetTerrain:()=>commitEdits({terrainOverride:null}),applyInterior:async value=>{
    if(!state.selectedId)return;const config=validateInterior(value),previous=state.interiors;
    await commitEdits({interiors:{...state.interiors,[state.selectedId]:config}});
    const pb=state.built.buildings.prepared.find(p=>p.b.id===state.selectedId);if(config.enabled&&pb&&!pb.interiorPlan){const message=pb.interiorIssue??'Esta representación del edificio no admite un interior generado';state.interiors=previous;editHistory.entries.pop();await rebuild();throw Error(message);}
  },enterInterior:()=>{const plan=state.built?.buildings.prepared.find(p=>p.b.id===state.selectedId)?.interiorPlan;if(!plan)throw Error('El interior no está disponible');walker.stop();updateWalkerWorld();walker.start(new THREE.Vector3(plan.center[0]-plan.entry.n[0]*.9,plan.floor,plan.center[1]-plan.entry.n[1]*.9),Math.atan2(plan.entry.n[0],plan.entry.n[1]));$('#walk').textContent='✕ Salir (Esc)';$('#hint').textContent='Interior generado · WASD caminar · ratón mirar · Esc volver';}});
  spatialPanel.update(state);
  const streamHost=document.createElement('section');streamHost.id='stream-panel';streamHost.innerHTML=`<details><summary>Área y rendimiento</summary><label class="check"><input id="opt-streaming" type="checkbox" ${state.options.streaming?'checked':''}> Detalle por sectores cercanos (opcional)</label><p class="small">Sectores de 200 m; hasta 9 activos, 20 000 edificios en los datos y 1500 por sector. Presupuesto: 192 MiB de buffers geométricos estimados; no incluye texturas ni memoria total del navegador. Áreas de hasta 2 km con este modo. Fuera del detalle se muestra terreno de plano. Los datos completos del área se conservan en memoria.</p><p class="small" id="stream-status"></p><button class="btn" id="perf-measure">Medir esta vista</button><pre class="small" id="perf-result" style="white-space:pre-wrap"></pre></details>`;$('#right').append(streamHost);
  $('#opt-streaming').onchange=async e=>{if(state.busy){e.target.checked=state.options.streaming;return;}const old=state.options.streaming;state.options.streaming=e.target.checked;if(!await rebuild())state.options.streaming=old;renderRight();};
  $('#perf-measure').onclick=()=>{if(state.busy||streamScene?.pending)return;$('#perf-result').textContent=JSON.stringify({viewport:[viewer.container.clientWidth,viewer.container.clientHeight],dpr:viewer.dpr,...viewer.bench(3),geometrias:viewer.renderer.info.memory.geometries,texturas:viewer.renderer.info.memory.textures,sectores:state.built?.stats.stream??null},null,1);};
  updateStreamStatus();
  const commerceHost=document.createElement('section');commerceHost.id='commerce-panel';$('#right').append(commerceHost);
  commercePanel=new CommercePanel(commerceHost,{select:id=>{state.selectedCommerceId=id;const c=state.built?.commerce?.entries.find(c=>c.id===id);if(c)state.selectedId=c.buildingId;updateEditor();},apply:(id,patch)=>commitEdits({comercios:{...state.comercios,[id]:patch}}),undo:undoEdit,focus:c=>{const p=new THREE.Vector3(...c.position),n=new THREE.Vector3(Math.sin(c.yaw),0,Math.cos(c.yaw));viewer.controls.target.copy(p).add(new THREE.Vector3(0,1.5,0));viewer.camera.position.copy(p).addScaledVector(n,Math.max(5,c.w*1.4)).add(new THREE.Vector3(0,1.8,0));viewer.controls.update();viewer.dirty=true;},retry:retryCommerces,changeDesign:async value=>{if(state.busy)return;state.options={...state.options,commerceDesign:value};if(state.model)await rebuild();else updateEditor();scheduleAutosave();}});commercePanel.update(state);
  grassPanel.mount($('#right'));
}
function updateStreamStatus(){const s=state.built?.stats.stream,el=$('#stream-status');if(el)el.textContent=s?`${s.loaded}/${s.total} sectores · ${(s.bytes/1048576).toFixed(1)} MiB de geometría estimada${s.errors.length?' · '+s.errors.join('; '):''}`:'Escena completa · sin descarga de sectores';}
// Lista de recintos escolares de OSM del lugar cargado
function renderSchools(){
  const el=$('#schools');if(!el)return;
  const list=(baseModel()?.areas??[]).filter(a=>a.kind==='school'&&a.area>1500&&a.area<90000&&Math.abs(a.c[0])<baseModel().size.width/2&&Math.abs(a.c[1])<baseModel().size.depth/2).sort((a,b)=>b.area-a.area).slice(0,6);
  el.innerHTML=list.length?list.map((a,i)=>`<button data-i="${i}">🏫 ${a.name||'Recinto escolar'} · ${Math.round(a.area/100)/100} ha</button>`).join(''):'<span class="small">No hay recintos escolares en esta zona.</span>';
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>schoolHere(schoolRectFromArea(baseModel(),list[b.dataset.i])));
}
const baseModel=()=>state.model?.kind==='real+school'?state.realModel:state.model?.kind==='real'?state.model:null;
async function schoolHere(rect){
  const real=baseModel();if(!real||state.busy)return;
  state.realModel=real;
  const far=state.far;
  state.model=placeSchool(real,rect,state.school.seed,state.school);
  if(far)far.modelRef=state.model;
  await rebuild();
  const c=rect,S=Math.max(c.W,c.D);
  viewer.camera.position.set(c.cx+S*.7,real.terrain.height(c.cx,c.cz)+S*.55,c.cz+S*.8);viewer.controls.target.set(c.cx,real.terrain.height(c.cx,c.cz),c.cz);viewer.controls.update();
}
let map,rect,marker,mapTiles;
function setupMap(){
  map=L.map('map',{zoomControl:true,attributionControl:true}).setView([state.place.lat,state.place.lon],16);
  syncMapSources();
  map.on('click',e=>{state.place.lat=e.latlng.lat;state.place.lon=e.latlng.lng;state.place.name=`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;updateMap();});
  updateMap();
}
function syncMapSources(){if(!map)return;if(state.settings.offline){if(mapTiles){map.removeLayer(mapTiles);mapTiles=null;}}else if(!mapTiles)mapTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);}
function updateMap(){
  if(!map)return;
  const b=regionBounds(state.place.lat,state.place.lon,state.place.size);
  if(rect)rect.remove();rect=L.rectangle([[b.south,b.west],[b.north,b.east]],{color:'#1fc7d4',weight:2,fillOpacity:.08}).addTo(map);
  map.setView([state.place.lat,state.place.lon],map.getZoom());
}
async function doSearch(){
  const q=$('#q').value.trim();if(!q)return;
  const c=parseCoordinates(q);
  if(c){state.place={...state.place,...c,name:q};updateMap();return;}
  if(state.settings.offline){$('#results').textContent='La búsqueda por nombre requiere proveedores. Usa coordenadas o abre un proyecto guardado.';return;}
  $('#results').innerHTML='<span class="small">Buscando…</span>';
  try{const {results}=await searchPlaces(q);
    $('#results').innerHTML=results.length?results.map((r,i)=>`<button data-i="${i}">${r.name}</button>`).join(''):'<span class="small">Sin resultados</span>';
    $('#results').querySelectorAll('button').forEach(b=>b.onclick=()=>{const r=results[b.dataset.i];state.place={...state.place,lat:r.lat,lon:r.lon,name:r.name};updateMap();});
  }catch(e){$('#results').innerHTML=`<span class="err">${e.message}</span>`;}
}

// ---------------- Pasos (orden de creación)
const STEPS=[
  {id:'datos',name:'Datos del lugar',info:()=>state.model?`${state.model.buildings.length} edificios · ${state.model.roads.length} vías`:'—',roll:()=>loadPlace({refresh:true}),tip:'Vuelve a pedir los datos al mapa'},
  {id:'alturas',name:'Alturas desconocidas',info:()=>state.model?`${state.model.buildings.filter(b=>b.estimated).length} estimadas`:'—',roll:()=>{state.seeds.alturas=newSeed();estimateHeights(state.model,state.seeds.alturas);rebuild();},tip:'Otra estimación para los edificios sin altura en OSM'},
  {id:'fachadas',name:'Estilos y fachadas',info:()=>state.built?`${state.built.stats.windows} huecos · ${state.built.stats.balconies} balcones · ${state.built.stats.shops} comercios`:'—',roll:()=>{state.seeds.fachadas=newSeed();rebuild();},tip:'Otra tirada de estilos, colores y huecos'},
  {id:'calle',name:'Calle y vegetación',info:()=>state.built?`${state.built.stats.trees} árboles · ${state.built.stats.lamps} farolas · ${state.built.stats.cars} coches`:'—',roll:()=>{state.seeds.calle=newSeed();rebuild();},tip:'Otra tirada de arbolado, farolas, bancos y coches'},
];
function renderSteps(){
  $('#steps').innerHTML=STEPS.map(s=>`<div class="step"><b>${s.name}</b><span>${s.info()}</span><button data-s="${s.id}" title="${s.tip}">🎲</button></div>`).join('');
  $('#steps').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(!state.busy)STEPS.find(s=>s.id===b.dataset.s).roll();});
  const st=state.built?.stats;
  $('#stats').innerHTML=st?Object.entries({'Edificios':st.buildings,'Huecos':st.windows,'Balcones':st.balconies,'Comercios':st.shops,'Elementos':st.elements,'Tipos instanciados':st.elementTypes,'Árboles':st.trees,'Tipos de árbol':st.treeSet??'—','Farolas':st.lamps,'Coches':st.cars,'Edificios lejanos':st.far??0,'Tiempo':st.ms+' ms'}).map(([k,v])=>`<span>${k}</span><b>${v}</b>`).join(''):'';
  if(state.built){
    const counts={};for(const pb of state.built.buildings.prepared)counts[pb.styleId]=(counts[pb.styleId]??0)+1;
    $('#legend').innerHTML='Estilos: '+Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${STYLES[k]?.name??k} ${v}`).join(' · ')+`<br>Región: ${regionOf(state.effectiveModel?.bounds??state.model.bounds)}`+(state.effectiveModel?.context?` · contexto: ${PROFILE_NAMES[state.effectiveModel.context.profile]??state.effectiveModel.context.profile}`:'')+(state.effectiveModel?.infill?.lots?` · relleno: ${state.effectiveModel.infill.lots} parcelas generadas`:'');
  }
}
const newSeed=()=>Math.random().toString(36).slice(2,7);

// ---------------- Construcción
function busy(text){state.busy=!!text;$('#busy').classList.toggle('on',!!text);if(text)$('#busytext').textContent=text;for(const id of ['project-save','project-open','project-recover'])$('#'+id).disabled=state.busy||(id==='project-recover'&&!recovery);}
async function loadPlace({refresh=false}={}){
  if(state.busy)return;
  busy('Pidiendo datos del mapa…');
  try{
    walker.stop();
    const p=state.place;
    if(state.settings.offline){
      if(refresh)throw Error('La actualización requiere desactivar el uso de fuente guardada');
      const b=state.source?.bounds;if(!b||Math.abs(b.centerLat-p.lat)>.000001||Math.abs(b.centerLon-p.lon)>.000001||Math.abs(b.width-p.size)>1)throw Error('No hay fuente guardada de esta selección; abre un proyecto o desactiva el modo sin proveedores');
    }else state.source=await fetchRegion({lat:p.lat,lon:p.lon,size:p.size,label:p.name,refresh});
    const previousModel=state.model;
    state.model=buildPlaceModel(state.source,{seed:state.seeds.alturas});state.realModel=null;state.farSource=null;
    if(previousModel&&(previousModel.kind==='school'||JSON.stringify(previousModel.bounds)!==JSON.stringify(state.model.bounds)))state.visorLink=null;
    if(!state.settings.offline){busy('Consultando referencias de edificios y monumentos…');state.automaticReferences={};try{const r=await fetchAutomaticReferences(state.model);state.automaticReferences=r.references;state.model={...state.model,warnings:[...state.model.warnings,...r.warnings]};}catch(e){state.model={...state.model,warnings:[...state.model.warnings,'Referencias automáticas no disponibles: '+e.message]};}}
    const u=new URL(location);u.searchParams.set('lat',p.lat.toFixed(5));u.searchParams.set('lon',p.lon.toFixed(5));u.searchParams.set('s',p.size);u.searchParams.set('n',p.name);history.replaceState(null,'',u);
    await rebuild({fitCamera:true});
  }catch(e){console.error(e);$('#st-main').innerHTML=`<span class="err">${e.message}</span>`;}
  finally{busy(null);}
}
async function retryCommerces(){
  if(state.busy||!state.source)return;busy('Descargando solo comercios…');
  try{const r=await fetch('/api/geo/shops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bounds:state.source.bounds,refresh:true})}),data=await r.json();if(!r.ok)throw Error(data.error??'No se pudieron descargar comercios');const elements=new Map(state.source.osm.elements.map(e=>[e.type+':'+e.id,e]));for(const e of data.elements){const key=e.type+':'+e.id,old=elements.get(key);elements.set(key,old?{...old,...e,tags:{...old.tags,...e.tags}}:e);}state.source={...state.source,osm:{...state.source.osm,elements:[...elements.values()],commerceCoverage:data.coverage}};const fresh=buildPlaceModel(state.source,{seed:state.seeds.alturas}),byId=new Map(fresh.buildings.map(b=>[b.id,b]));state.model={...state.model,pois:fresh.pois,buildings:state.model.buildings.map(b=>{const other=byId.get(b.id);return other?{...b,shops:other.shops,groundCommercial:b.groundCommercial||other.groundCommercial}:b;})};await rebuild();}catch(e){$('#st-main').textContent='Comercios no descargados: '+e.message;}finally{busy(null);updateEditor();}
}
async function loadSchool({reroll=false}={}){
  if(state.busy)return;
  if(reroll)state.school.seed=newSeed();
  busy('Trazando el recinto…');
  try{
    walker.stop();
    const previousModel=state.model;
    state.model=generateSchool(state.school.seed,state.school);state.far=null;state.farSource=null;state.automaticReferences={};
    if(previousModel&&(previousModel.kind!=='school'||previousModel.seed!==state.model.seed))state.visorLink=null;
    await rebuild({fitCamera:true});
    if($('#plan'))drawPlan($('#plan'),state.model);
  }catch(e){console.error(e);$('#st-main').innerHTML=`<span class="err">${e.message}</span>`;}
  finally{busy(null);}
}
async function rebuild({fitCamera=false}={}){
  if(!state.model)return;
  busy('Construyendo…');
  lastBuildError=null;
  try{
    const seeds={suelo:state.seed+state.seeds.suelo,fachadas:state.seed+state.seeds.fachadas,calle:state.seed+state.seeds.calle};
    const options={commerceDesign:state.options.commerceDesign??'claude',streetTrees:$('#opt-trees')?.checked??state.options.streetTrees,cars:$('#opt-cars')?.checked??state.options.cars,lamps:$('#opt-lamps')?.checked??state.options.lamps,furniture:$('#opt-furniture')?.checked??state.options.furniture};
    state.options={...state.options,...options,far:$('#opt-far')?.checked??state.options.far};
    state.effectiveModel=withInteriors(applyEdits(withProfiles(withSettings(withRoadEdits(withLocalTerrain(withSupplements(withAutomaticReferences(state.model,state.automaticReferences),state.supplements),state.terrainOverride),state.roadEdits),state.settings,state.seeds.alturas),state.profiles),state.overrides),state.interiors);
    state.effectiveModel={...state.effectiveModel,comercios:state.comercios};
    let built;
    if(state.options.streaming){
      const config={sun:viewer.sunDir,seeds,options,assetLibrary,onChange:()=>{if(state.built?.streamer!==streamScene)return;syncShopfronts();viewer.grass.invalidate();viewer.needsShadow=true;viewer.dirty=true;updateStreamStatus();renderSteps();if(walker.active)updateWalkerWorld();updateEditor();}};
      if(streamScene)built=await streamScene.setModel(state.effectiveModel,config);
      else{streamScene=new StreamScene(state.effectiveModel,config);await streamScene.update(fitCamera?{x:0,z:0}:viewer.controls.target,true);built=streamScene.built;}
    }else{if(Math.max(state.model.size.width,state.model.size.depth)>1000)throw Error('Para áreas mayores de 1 km activa el detalle por sectores');built=await buildPlaceScene(state.effectiveModel,{sun:viewer.sunDir,seeds,options,assetLibrary,onProgress:t=>busy(t)});streamScene?.dispose();streamScene=null;}
    state.built=built;
    state.effectiveModel={...state.effectiveModel,warnings:[...(state.effectiveModel.warnings??[]),...(built.warnings??[]),...built.buildings.prepared.filter(p=>p.interiorIssue).map(p=>p.b.id+': '+p.interiorIssue)]};
    const root=new THREE.Group();root.add(built.group);
    if(state.options.far!==false&&(!state.settings.offline||state.farSource)){
      busy('Ciudad alrededor (2 km)…');
      const farSurface=JSON.stringify([state.effectiveModel.terrain.origin,Array.from(state.effectiveModel.terrain.h),state.effectiveModel.buildings.map(b=>[b.id,b.rings])]);
      try{if(!state.far||state.far.modelRef!==state.model||state.far.surfaceKey!==farSurface){state.far=await buildFarScene(state.effectiveModel,{radius:2000,sun:viewer.sunDir,flat:state.model.kind==='school',sourceData:state.farSource});state.far.modelRef=state.model;state.far.surfaceKey=farSurface;state.farSource=state.far.sourceData;}
        root.add(state.far.group);built.stats.far=state.far.stats.buildings;}
      catch(e){console.warn('Entorno lejano no disponible',e);}
    }
    viewer.setContent(root);syncShopfronts();viewer.lod=built.lod;built.lod.update(viewer.camera.position,true);updateStreamStatus();
    if(walker.active)updateWalkerWorld();
    const S=Math.max(state.model.size.width,state.model.size.depth);
    viewer.fitShadow(new THREE.Vector3(0,(state.effectiveModel??state.model).terrain.height(0,0),0),S*.62);
    {const m=state.effectiveModel??state.model;viewer.grass.groundAt=(x,z)=>m.terrain.height(x,z);}
    if(fitCamera){state.presets=cameraPresets(state.model);
      $('#cams').innerHTML=state.presets.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
      applyPreset(viewer,state.presets[0]);$('#lens').value=viewer.lens;$('#lensv').textContent=viewer.lens+'mm';}
    renderSteps();renderSchools();
    $('#st-main').textContent=`${state.model.kind==='school'?'Colegio · semilla '+state.school.seed:state.place.name} · ${state.model.size.width.toFixed(0)}×${state.model.size.depth.toFixed(0)} m · ${built.stats.ms} ms`;
    return true;
  }catch(e){lastBuildError=e;console.error(e);$('#st-main').innerHTML=`<span class="err">${e.message}</span>`;return false;}
  finally{busy(null);updateEditor();scheduleAutosave();}
}

// ---------------- Barra de vista
const sharedControls=document.createElement('div');sharedControls.id='shared-style-controls';
sharedControls.innerHTML=STYLE_CONTROLS.filter(c=>!['lineWidth','paint'].includes(c.key)).map(c=>`<label>${c.name}<input data-style-param="${c.key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${viewer.pipeline.params[c.key]}"></label>`).join('');$('#render').after(sharedControls);
const stylePool=new StylePoolClient({onChange:s=>{
  viewer.pipeline.setAmbient(s.ambient);Object.assign(viewer.pipeline.params,s.styles[s.active]);viewer.setMode(s.active);
  $('#amb').value=s.ambient;$('#lw').value=viewer.pipeline.params.lineWidth;$('#paint').value=viewer.pipeline.params.paint;
  for(const c of sharedControls.querySelectorAll('input'))c.value=viewer.pipeline.params[c.dataset.styleParam];
  $('#render').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.m===s.active));$('#zelda-tools').hidden=s.active!=='zelda';
}});
window.estudio.stylePool=stylePool;stylePool.start();window.addEventListener('pagehide',()=>stylePool.dispose(),{once:true});
const saveStyleParam=(key,value)=>stylePool.change({styles:{[stylePool.state.active]:{[key]:value}}});
sharedControls.oninput=e=>{if(e.target.dataset.styleParam)saveStyleParam(e.target.dataset.styleParam,Number(e.target.value));};
$('#render').querySelectorAll('button').forEach(b=>b.onclick=()=>stylePool.change({active:b.dataset.m}));
$('#paint').oninput=e=>saveStyleParam('paint',Number(e.target.value));
// Personajes de prueba del estilo: en el centro de la vista, mirando a la cámara. Segundo clic: retirarlos.
$('#characters').onclick=async()=>{
  if(characters.visible){characters.clear();$('#characters').classList.remove('on');viewer.needsShadow=true;viewer.dirty=true;return;}
  const model=state.effectiveModel??state.model;if(!model)return;
  $('#characters').disabled=true;
  try{await characters.place(viewer.controls.target.clone(),viewer.camera.position,(x,z)=>model.terrain.height(x,z));$('#characters').classList.add('on');}
  catch(e){$('#st-main').textContent='Personajes: '+e.message;}
  finally{$('#characters').disabled=false;viewer.needsShadow=true;viewer.dirty=true;}
};
$('#cams').onchange=e=>{const p=state.presets.find(p=>p.id===e.target.value);if(p){applyPreset(viewer,p);$('#lens').value=viewer.lens;$('#lensv').textContent=viewer.lens+'mm';}};
$('#lens').oninput=e=>{viewer.setLens(Number(e.target.value));$('#lensv').textContent=e.target.value+'mm';};
$('#az').oninput=$('#el').oninput=()=>viewer.setSun(Number($('#az').value),Number($('#el').value));
$('#amb').onchange=e=>{const A=viewer.pipeline.setAmbient(e.target.value);$('#az').value=A.az;$('#el').value=A.el;viewer.setSun(A.az,A.el);stylePool.change({ambient:e.target.value});};
$('#lw').oninput=e=>saveStyleParam('lineWidth',Number(e.target.value));
$('#modes').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;$('#modes').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  $('#gacha').textContent=state.mode==='school'?'🎲 Gacha de colegio':'🎲 Gacha de lugar';renderRight();
  if(state.mode==='school'&&state.model?.kind!=='school')loadSchool();else if(state.mode==='real'&&state.model?.kind==='school')loadPlace();});
$('#gacha').onclick=()=>{
  if(state.mode==='school'){state.seeds={alturas:newSeed(),fachadas:newSeed(),calle:newSeed(),suelo:newSeed()};loadSchool({reroll:true});return;}
  state.seeds={alturas:newSeed(),fachadas:newSeed(),calle:newSeed(),suelo:newSeed()};if(state.model){estimateHeights(state.model,state.seeds.alturas);rebuild();}};
$('#seed').onchange=e=>{state.seed=e.target.value;rebuild();};
async function exportCurrentPlace(sendToViewer=false){
  if(packagePreview){$('#st-main').textContent='Vuelve al proyecto antes de enviarlo';return;}
  if(state.busy||!state.built)return;
  const base=(state.model.kind==='school'?'colegio-'+state.school.estilo+'-'+state.school.seed:state.place.name).normalize('NFKD').replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,50);
  busy('Exportando para SpanStories…');
  try{state.built.lod?.full();const r=await exportSpanStories({...state,originalModel:state.model,model:state.effectiveModel??state.model},{name:base,onProgress:t=>busy(t)});state.built.lod?.update(viewer.camera.position,true);viewer.dirty=true;lastPackage=r;$('#package-review').disabled=false;
    $('#st-main').textContent=`Exportado: exportaciones/${r.carpeta} · ${r.sectores} sectores · ${(r.triangulos/1e6).toFixed(2)} M triángulos · ${(r.bytes/1048576).toFixed(1)} MB · ${r.anclas} anclas · ${r.prefabs} prefabs`;
    window.estudio.lastExport=r;
    if(sendToViewer){
      busy('Registrando el lugar en el visor…');
      const response=await fetch('/api/estudio/visor/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({carpeta:r.carpeta,id:state.visorLink?.id??null,expectedRevision:state.visorLink?.revision??null})});
      const place=await response.json();if(!response.ok)throw Error(place.error??'No se pudo enviar al visor');
      state.visorLink={id:place.id,revision:place.revision};$('#visor-open').href=place.viewerUrl;$('#visor-send').textContent='Actualizar en el visor';
      $('#st-main').textContent=`${place.label} enviado al visor · versión ${place.history.length}. Pulsa «Abrir visor».`;scheduleAutosave();
    }}
  catch(e){console.error(e);$('#st-main').innerHTML=`<span class="err">Exportación: ${e.message}</span>`;}
  finally{busy(null);}
}
$('#glb').onclick=()=>exportCurrentPlace();
$('#visor-send').onclick=()=>exportCurrentPlace(true);
$('#package-review').onclick=async()=>{
  if(state.busy)return;if(packagePreview){const preview=packagePreview;packagePreview=null;viewer.scene.remove(preview.package.group);viewer.content=previewSession.content;viewer.scene.add(viewer.content);viewer.lod=previewSession.lod;viewer.camera.position.fromArray(previewSession.position);viewer.controls.target.fromArray(previewSession.target);viewer.controls.update();preview.dispose();previewSession=null;for(const id of ['left','right','modes'])$('#'+id).inert=false;for(const id of ['gacha','seed','project-save','project-open','glb','walk'])$('#'+id).disabled=false;$('#project-recover').disabled=!recovery;$('#package-review').textContent='Revisar exportación';updateEditor();viewer.needsShadow=true;viewer.dirty=true;$('#st-main').textContent='Proyecto editable restaurado';return;}
  if(!lastPackage)return;walker.stop();clearTimeout(autosaveTimer);busy('Cargando archivos exportados…');const preview=new PackagePreview(viewer,new URL('/exportaciones/'+lastPackage.carpeta+'/manifest.json',location.origin).href,p=>{$('#st-main').textContent='Revisión del paquete guardado · '+p.sectors.size+'/'+p.index.length+' sectores cercanos · clic en un edificio para comprobar su ID';});
  try{await preview.open();previewSession={content:viewer.content,lod:viewer.lod,position:viewer.camera.position.toArray(),target:viewer.controls.target.toArray()};viewer.scene.remove(viewer.content);viewer.content=preview.package.group;viewer.scene.add(viewer.content);viewer.lod=null;packagePreview=preview;selectionBox.visible=false;for(const id of ['left','right','modes'])$('#'+id).inert=true;$('#package-review').textContent='Volver al proyecto';$('#hint').textContent='Revisión de archivos guardados · clic = comprobar ID';viewer.needsShadow=true;viewer.dirty=true;}
  catch(e){preview.dispose();$('#st-main').textContent='Revisión: '+e.message;}finally{busy(null);if(packagePreview)for(const id of ['gacha','seed','project-save','project-open','project-recover','glb','walk'])$('#'+id).disabled=true;}
};
$('#png').onclick=async()=>{const blob=await viewer.capture(2400);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`lugar-${Date.now()}.png`;a.click();};
// Captura para revisión (guarda en reports/estudio dentro del proyecto)
window.estudio.capture=async(name,width=1600)=>saveCapture(await viewer.capture(width),name);
// Espera a que termine la construcción (o falle) — para pruebas automáticas.
window.estudio.ambient=id=>{$('#amb').value=id;$('#amb').onchange({target:$('#amb')});};
window.estudio.schoolHere=(i)=>{const list=(baseModel()?.areas??[]).filter(a=>a.kind==='school'&&a.area>1500&&a.area<90000&&Math.abs(a.c[0])<baseModel().size.width/2&&Math.abs(a.c[1])<baseModel().size.depth/2).sort((a,b)=>b.area-a.area);return list[i]?schoolHere(schoolRectFromArea(baseModel(),list[i])):null;};
window.estudio.ready=(ms=40000)=>new Promise((res,rej)=>{const t0=Date.now();const t=setInterval(()=>{const err=document.querySelector('#st-main .err');if(err){clearInterval(t);rej(Error(err.textContent));}else if(!state.busy&&state.built){clearInterval(t);res(state.built.stats);}else if(Date.now()-t0>ms){clearInterval(t);rej(Error('tiempo agotado'));}},250);});
window.estudio.shot=async(name,pos,target,lens=24,width=1400)=>{viewer.camera.position.set(...pos);viewer.controls.target.set(...target);viewer.camera.near=pos[1]-(state.effectiveModel??state.model).terrain.height(pos[0],pos[2])<4?.15:.5;viewer.setLens(lens);viewer.controls.update();await new Promise(r=>setTimeout(r,300));return (await window.estudio.capture(name,width)).archivo;};
window.estudio.preset=id=>{const p=state.presets.find(p=>p.id===id);if(p)applyPreset(viewer,p);};
window.estudio.school=(opts={},seed)=>{Object.assign(state.school,opts);if(seed)state.school.seed=seed;state.mode='school';$('#modes').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.mode==='school'));renderRight();return loadSchool();};
window.estudio.load=(lat,lon,size,name)=>{state.place={lat,lon,size,name:name||`${lat}, ${lon}`};return loadPlace();};

setInterval(()=>{const s=viewer.stats;$('#st-gpu').textContent=`${s.fps} fps · ${s.calls} llamadas · ${(s.triangles/1e6).toFixed(2)} M triángulos`;},1000);
if(params.get('modo')==='escuela'){state.mode='school';$('#modes').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.mode==='school'));$('#gacha').textContent='🎲 Gacha de colegio';}
renderRight();renderSteps();
async function boot(){
  if(import.meta.env.DEV&&['madrid-gran-via','barcelona-gracia'].includes(params.get('fixture'))){try{await openProject(await (await fetch('/reports/estudio/0.17.0/fixtures/'+params.get('fixture')+'-proyecto.json')).text());}catch(e){$('#st-main').textContent=e.message;}return;}
  if(params.has('lugar')){
    try{const response=await fetch('/api/estudio/visor/proyecto?id='+encodeURIComponent(params.get('lugar'))+(params.has('revision')?'&revision='+encodeURIComponent(params.get('revision')):''));const result=await response.json();if(!response.ok)throw Error(result.error);
      await openProject(JSON.stringify(result.project));
      $('#visor-send').textContent='Actualizar en el visor';$('#visor-open').href='http://localhost:3000/mundo/piloto-lexico?modo=desarrollo&zone='+encodeURIComponent(result.place.id);
      if(params.has('entidad')){const id=params.get('entidad'),commerce=state.built.commerce?.entries.find(c=>c.id===id);if(commerce){state.selectedCommerceId=id;selectBuilding(commerce.buildingId);}else if(state.model.roads.some(r=>r.id===id)){state.selectedRoadId=id;updateEditor();}else selectBuilding(id);}
      $('#st-main').textContent=result.draft?'Borrador editable abierto · envíalo para actualizar el visor':'Lugar del visor abierto · versión '+result.place.history.length;
    }catch(e){$('#st-main').textContent='No se pudo abrir el lugar: '+e.message;}return;
  }
  try{recovery=await loadProjectLocal();$('#project-recover').disabled=!recovery.current&&!recovery.previous;
    if(recovery.current){try{const saved=decodeProject(recovery.current),samePlace=saved.mode==='real'&&state.mode==='real'&&Math.abs(saved.place.lat-state.place.lat)<.000001&&Math.abs(saved.place.lon-state.place.lon)<.000001&&saved.place.size===state.place.size;
      if(!params.has('lat')&&!params.has('modo')||samePlace){await openProject(recovery.current);return;}
    }catch(e){if(!params.has('lat')&&!params.has('modo')&&recovery.previous){await openProject(recovery.previous);return;}console.warn('Autosalvado no recuperable',e);}}
  }catch(e){console.warn('Guardado local no disponible',e);}
  if(state.mode==='school')await loadSchool();else await loadPlace();
}
boot();
