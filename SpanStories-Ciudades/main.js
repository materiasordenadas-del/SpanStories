import * as T from './engine/three.js';
import { luz, AMBIENTES } from './engine/Luz25D.js';
import { RegistroCiudad } from './engine/CityRegistry.js';
import { cargarMundo } from './engine/Mundo.js';
import { CityStyle } from './engine/CityStyle.js';
import { EstilosCompartidos } from './engine/EstilosCompartidos.js';
import { CityAssets } from './engine/CityAssets.js';
import { CityDecorations } from './engine/CityDecorations.js';
import { prepararSuperficies } from './engine/CitySurface.js';
import { fetchCityGLB } from './engine/CityTransport.js';
import { firstSector } from './engine/CityStreaming.js';
import { CityMetrics } from './engine/CityMetrics.js';
import { PerformanceController } from './engine/PerformanceController.js';
import { optimizeCityRoot } from './engine/CityOptimization.js';
import { CityCollisionIndex } from './engine/CityCollisionIndex.js';
import { prepareCityGpu } from './engine/CityGpuPreparation.js';
import { cloneCityAvatar } from './engine/CityAvatarClone.js';
import { CityMultiplayer } from './engine/CityMultiplayer.js';
import { cityResolution, watchCityResolution } from './engine/CityResolution.js';
import { CITY, COLINA, COLINA_ALBA, COLINA_QUIJOTE, LEXICO } from './routes.js';
import { montarLexico } from './engine/LexicoMontaje.js';
import { crearCargaInicial } from './engine/CargaInicial.js';
import {generatedZones,AtlasAssets,atlasGround,atlasSourcePanel} from './engine/AtlasPlaces.js';
import {studioAirportZone,StudioAirportAssets} from './engine/StudioAirport.js';
import { montarEstacionesClima, ESTACIONES, CLIMAS } from './engine/EstacionesClima.js';
import {leerEdicionCiudad} from './engine/CityProjectDisk.js';
import {montarImportacionArrastre,puntoDeSuelta} from './engine/SceneDrop.js';

const $ = selector => document.querySelector(selector), viewport = $('#viewport');
// Modo aprendizaje: la historia controla la cámara; el estudiante solo toca objetos. Sin editor ni navegación.
const aprendizaje = new URLSearchParams(location.search).has('aprendizaje');
const exploracion=aprendizaje&&new URLSearchParams(location.search).has('explorar');
// El Estudio puede entrar y salir sin recargar la escena (mensaje MODE del anfitrión); ver setStudioMode.
let studioMode=new URLSearchParams(location.search).has('estudio');
if(studioMode)document.body.dataset.studio='true';
let studioLexicon=false;
const studioPinned=new Set();
let studioBridge=null;
let disposeAtlasPanel=null;
// Tipos de árbol de los lugares del Atlas (catálogo de vegetación); solo en Desarrollo.
let vegetacion=null,disposeVegetacion=null;
// Los módulos exclusivos del editor no se cargan en el Visor Web.
const { montarEditorCiudad, capturarObjeto, CiudadProjectStore } = aprendizaje ? {} : await import('./engine/CityEditor.js');
const { crearNavegacionCiudad, collidesAt } = aprendizaje&&!exploracion ? {} : await import('./engine/CityNavigation.js');
const { montarPanelEstilo } = aprendizaje ? {} : await import('./panel/PanelEstilo.js');
const { montarEditorVisual } = aprendizaje ? {} : await import('./editor/Editor.js');
let gizmo=null,ui=null,entorno=null,cespedMod=null,terrenoMod=null,varianteRuntime=null;
if(aprendizaje) document.body.dataset.modo='aprendizaje';
let lexico = null;
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
renderer.shadowMap.enabled = false; renderer.info.autoReset = false;
let requestedDpr=CITY.maxDpr,allowAdaptiveResolution=true;
renderer.setPixelRatio(1);
renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', 'Ciudad 3D interactiva');
viewport.prepend(renderer.domElement);
const scene = new T.Scene(), camera = new T.PerspectiveCamera(CITY.editorFov, 1, CITY.near, CITY.far);
// The world root never moves. Child transforms remain automatic and editable.
scene.matrixAutoUpdate=false;scene.updateMatrix();
const target = new T.Vector3(), objetos = new RegistroCiudad(), metrics = new CityMetrics(renderer);
const colliderBounds=new Map();
let collisionIndex=new CityCollisionIndex();const collisionCandidates=[];
let assetRefreshPending=false;
function refreshAssetEditor(){if(!editor)return;editor.refresh();varianteRuntime?.reaplicar();}
function scheduleAssetRefresh(){if(assetRefreshPending)return;assetRefreshPending=true;queueMicrotask(()=>{assetRefreshPending=false;refreshAssetEditor();rebuildColliders();updateSelection();});}
let manifest, zone, hill, hillSpec, style, assets, decorations, editor, navigation, multiplayer, avatarTemplate, colliders = [], destroyed = false, loadPromise, avatarPromise, overview = false, firstSectorReady = false;
const selections = new T.Box3Helper(new T.Box3(), 0xe0a458); selections.visible = false;
selections.userData.ignorarSeleccion = true; scene.add(selections);
const status = text => { $('#status').textContent = text; $('#hud-status').textContent = text; };
const changed = root => {
  if(root?.userData.decor)decorations?.refresh(root);
  else if(root?.userData.cityImportId)editor?.state.imports.get(root.userData.cityImportId)?.optimization?.refresh(root);
  else assets?.refresh(root);
  colliderBounds.clear();rebuildColliders();updateSelection();
};
function updateSelection() {
  const root = objetos.obtener(objetos.seleccion); selections.visible = !!root && navigation?.mode === 'editor';
  if(root) { root.userData.atlasBounds?selections.box.copy(root.userData.instanceBinding?.bounds?.()??root.userData.atlasBounds):selections.box.setFromObject(root); $('#selected-label').textContent = root.userData.label; }
  else $('#selected-label').textContent = 'Selecciona un edificio o una pieza';
  gizmo?.sync();
}
scene.userData.alCambiarSeleccion=()=>{const root=objetos.obtener(objetos.seleccion);if(!root)return;if(root.userData.atlasBounds)selections.box.copy(root.userData.instanceBinding?.bounds?.()??root.userData.atlasBounds);else selections.box.setFromObject(root);};
objetos.onChange = updateSelection;
let manifestIdsCache=null;
/** Ids que existen en la revisión cargada (objetos del manifiesto y entidades del Generador): los cambios guardados sin destino se listan como huérfanos. */
function manifestIds(){if(!manifestIdsCache&&manifest){manifestIdsCache=new Set([...(manifest.objects||[]).map(o=>o.id),...(Array.isArray(manifest.entities)?manifest.entities.map(e=>e.id):Object.keys(manifest.entities||{}))].filter(Boolean));}return manifestIdsCache||new Set();}
function rebuildColliders() {
  if(!manifest) return;
  colliders = manifest.objects.filter(o => {
    if(!o.collision || /bordillo|viario|calzada|acera|panot|pavimento|suelo|terrain|bici_pintura|marcas|paso_peaton/i.test(o.name)) return false;
    const b=o.bounds;
    const topGround=Math.max(...[b.min[0],b.max[0]].flatMap(x=>[b.min[2],b.max[2]].map(z=>ground(x,z))));
    return b.max[1]-topGround > CITY.collisionMinHeight;
  }).map(o => {
    const root = objetos.obtener(o.id);
    if(root && root.visible&&!root.userData.atlasBounds) {let bounds=colliderBounds.get(o.id);if(!bounds){const b=new T.Box3().setFromObject(root);bounds={min:b.min.toArray(),max:b.max.toArray()};colliderBounds.set(o.id,bounds);}return {id:o.id,bounds};}
    // Elemento de un lugar del Generador movido en el Editor: colisiona donde está ahora.
    if(root?.userData.atlasBounds&&root.userData.instanceBinding){const b=root.userData.instanceBinding.bounds();if(!b.isEmpty())return {id:o.id,bounds:{min:b.min.toArray(),max:b.max.toArray()},enabled:!root.userData.ocultoUsuario};}
    const saved=editor?.state.overrides.get(o.id)||editor?.state.pending.get(o.id);
    return {id:o.id,bounds:colliderBounds.get(o.id)||o.bounds,enabled:!root?.userData.ocultoUsuario&&!saved?.hidden};
  });
  for(const entry of objetos.entries.values()) if(entry.raiz.userData.cityImportId && entry.raiz.parent === scene && entry.raiz.visible) {
    const b=new T.Box3().setFromObject(entry.raiz); colliders.push({id:entry.id,bounds:{min:b.min.toArray(),max:b.max.toArray()}});
  }
  colliders.push(...decorations?.colliders()||[]);
  colliders.push(...assets?.colliders?.()||[]);
  collisionIndex=new CityCollisionIndex(colliders);
}
function ground(x,z) {
  if(hill)return hill.hillHeight(x,z,hillSpec);
  if(manifest?.ground?.grid)return atlasGround(manifest.ground.grid,x,z);
  const g=manifest?.ground; if(!g) return manifest?.spawn?.[1] ? manifest.spawn[1]-CITY.playerHeight : 0;
  const origin=g.origin||[0,0,0], slope=g.slope||[0,0];
  return origin[1]+(x-origin[0])*slope[0]+(z-origin[2])*slope[1];
}
function resize() {
  const {width,height}=viewport.getBoundingClientRect(); if(!width||!height)return;
  const resolution=cityResolution(width,height,{deviceRatio:devicePixelRatio,maxDpr:requestedDpr,screenWidth:screen.width,screenHeight:screen.height,allowAdaptive:allowAdaptiveResolution});
  if(renderer.getPixelRatio()!==resolution.pixelRatio)renderer.setPixelRatio(resolution.pixelRatio);
  renderer.setSize(width,height); camera.aspect=width/height; camera.updateProjectionMatrix();
  luz.viewport(width,height,renderer.getPixelRatio());
}
const observer = new ResizeObserver(resize); observer.observe(viewport);
const stopResolutionWatch=watchCityResolution(window,resize);
luz.salas([]); const lightListener=luz.alCambiar(A=>{scene.background=new T.Color(A.cielo[1]);});
const estilos=new EstilosCompartidos({luz,scene,renderer});
const estacionesClima=montarEstacionesClima({anfitrion:viewport,lienzo:renderer.domElement,luz,estilos});
if(!aprendizaje) montarPanelEstilo({luz,estilos,contenedor:$('#panel-estilo'),clave:'spanstories.ciudades.luz.v1'});
if(!aprendizaje)$('#panel-toggle').onclick=()=>{const p=$('#panel');p.hidden=!p.hidden;if(!p.hidden)editor?.refresh();$('#panel-toggle').setAttribute('aria-expanded',String(!p.hidden));};
const quality = new PerformanceController((profile,name)=>{requestedDpr=profile.dpr;allowAdaptiveResolution=name!=='ECO';resize();metrics.reset();
  // El ajuste automático también cambia el perfil: el selector muestra siempre el que está activo.
  const select=document.getElementById('quality');if(select&&select.value!==name)select.value=name;});
if(!aprendizaje){
$('#quality').onchange=e=>{quality.set(e.target.value);}; $('#auto-quality').onchange=e=>{quality.auto=e.target.checked;};
$('#batching').onchange=e=>{assets?.setOptimized(e.target.checked);for(const r of editor?.state.imports.values()||[])r.optimization?.setActive(e.target.checked);metrics.reset();};
$('#overview').onclick=()=>{if(!navigation||!manifest)return;navigation.setMode('editor');navigation.focus(new T.Box3(new T.Vector3(...manifest.bounds.min),new T.Vector3(...manifest.bounds.max)));loadAll();};
$('#reset-player').onclick=()=>{if(navigation&&manifest)navigation.teleport([manifest.spawn[0],ground(manifest.spawn[0],manifest.spawn[2]),manifest.spawn[2]]);};
}
async function avatar() {
  if(avatarPromise)return avatarPromise;
  avatarPromise=(async()=>{
    status('Cargando el avatar de tercera persona…');
    const response=await fetch(new URL('Personajes/personajes.json',world.world.manifestUrl)); const catalog=await response.json();
    const character=catalog.characters.find(c=>c.id===catalog.avatarTerceraPersona)??catalog.characters[0]; const url=new URL(character.url,response.url).href;
    const packed=character.gzipUrl?new URL(character.gzipUrl,response.url).href:null;
    const {buffer,json,binary}=await fetchCityGLB(url,{gzipUrl:packed,sha256:character.sha256,prepareForParse:true});
    const gltf=await assets.loader.parseAsync(json||buffer,new URL('.',url).href,binary||null); await style.adaptAsync(gltf.scene,gltf); gltf.scene.traverse(o=>{o.userData.ignorarSeleccion=true;});
    await prepareCityGpu(gltf.scene,{renderer,camera,scene});
    navigation.setAvatar(gltf.scene,gltf.animations);
    // Capture an unanimated, normalized master before the next animation frame.
    avatarTemplate=cloneCityAvatar(navigation.avatarCarrier.children[0]);
    status(character.label+' listo · WASD para caminar, arrastra para mirar.');
    return gltf;
  })().catch(e=>{avatarPromise=null;status('No se pudo cargar el avatar: '+e.message);throw e;});return avatarPromise;
}
function modeChanged(mode) {
  if(mode!=='editor')overview=false;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  editor?.enabled(mode==='editor'); ui?.modoCambiado(mode); updateSelection();
  $('#help').textContent=mode==='editor'?'Clic: seleccionar · arrastrar: girar · derecho/central: desplazar · rueda: acercar · W/E/R: mover/girar/escalar': 'WASD: caminar · ratón o arrastre: mirar · Mayús: rápido · Esc: editor';
  if(mode==='third')avatar().catch(()=>{});
}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{document.activeElement.blur();navigation?.setMode(button.dataset.mode);};
// La selección con el ratón (clic, Mayús, arrastre directo y menú contextual) la gestiona editor/herramientas/Interaccion.js.
window.addEventListener('keydown',e=>{
  if(!editor||aprendizaje||studioMode||navigation?.mode!=='editor'||e.target.closest?.('input,textarea,select,button,[contenteditable]'))return;
  const root=objetos.obtener(objetos.seleccion);if(!root)return;
  // Ctrl+Z / Ctrl+Y los atiende el gizmo del editor (EditorGizmo.js), también sin selección.
  if(e.ctrlKey||e.metaKey)return;
  const steps={ArrowLeft:[-1,0,0],ArrowRight:[1,0,0],ArrowUp:[0,0,-1],ArrowDown:[0,0,1],PageUp:[0,1,0],PageDown:[0,-1,0]};
  // applySelected lanza si el editor está ocupado (guardando o importando): se avisa en vez de dejar una excepción sin capturar.
  if(steps[e.code]){e.preventDefault();const s=e.shiftKey?CITY.largeEditStep:CITY.editStep;try{editor.applySelected({position:root.position.toArray().map((n,i)=>n+steps[e.code][i]*s)});}catch(error){status(error.message);}}
});
const disposeDrop=montarImportacionArrastre({host:viewport,
  mode:()=>aprendizaje?null:studioMode?(studioBridge?'studio':null):editor?'editor':null,
  importObjects:(files,event)=>{navigation?.setMode('editor');const punto=puntoDeSuelta({scene,camera,canvas:renderer.domElement,ground,target},event);return ui?ui.importarArchivos(files,punto):editor.importFiles(files,punto);},
  importCharacters:(files,event)=>studioBridge.dropFiles(files,event),
  status:text=>{status(text);if(studioMode)studioBridge?.reportDropError(text);}});
window.addEventListener('pagehide',disposeDrop,{once:true});
function snapshot(){return metrics.snapshot(scene,{three:T.REVISION,zone:zone?.id,mode:navigation?.mode,camera:camera.position.toArray(),target:target.toArray(),quality:quality.name,batching:assets?.optimized,downloadedGlbBytes:assets?.loadedBytes||0,sectors:assets?.snapshot(),decorations:decorations?.snapshot(),multiplayer:multiplayer?.snapshot(),unloadedSectors:assets?.unloadedCount||0,objectCount:objetos.entries.size,errors:assets?.errors||[]});}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
if(!aprendizaje)$('#export-metrics').onclick=()=>{if(!zone){status('Espera a que termine de cargar el lugar para descargar las métricas.');return;}download('metricas-'+zone.id+'.json',snapshot());};
let world;
function nearbySectors() {
  if(!manifest||!assets)return [];
  const p=aprendizaje?target:navigation?.mode==='editor'?target:navigation?.position||target;
  camera.updateMatrixWorld(true);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  return manifest.sectors.filter(s=>{
    const [x0,,z0]=s.bounds.min,[x1,,z1]=s.bounds.max;
    const visible=frustum.intersectsBox(new T.Box3(new T.Vector3(...s.bounds.min),new T.Vector3(...s.bounds.max)));
    return visible || Math.hypot(p.x-Math.max(x0,Math.min(x1,p.x)),p.z-Math.max(z0,Math.min(z1,p.z)))<=CITY.streamRadius;
  });
}
function loadNearby(){
  if(!assets||!firstSectorReady)return Promise.resolve();
  const selected=objetos.obtener(objetos.seleccion),pinned=new Set(selected?[selected.userData.area]:[]);
  for(const id of studioPinned)pinned.add(id);
  if(lexico?.interaccion.sectorActivo)pinned.add(lexico.interaccion.sectorActivo);
  return assets.sync(overview&&navigation?.mode==='editor'?manifest.sectors:nearbySectors(),zone.manifestUrl,{pinned});
}
function loadAll(){if(!assets)return Promise.resolve();overview=true;status('Cargando todos los sectores para la vista general…');return Promise.allSettled(manifest.sectors.map(s=>assets.load(s,zone.manifestUrl))).then(()=>{metrics.reset();status('Vista general lista · '+objetos.entries.size+' objetos editables');});}
// La pantalla de carga 0–100 % es del Visor del estudiante. En el Editor y el Estudio la ciudad se ve
// cargar por partes y la barra de modos y «Opciones» (estilos, calidad, zona…) siguen usables desde el principio.
const carga=aprendizaje?crearCargaInicial(viewport):{terminada:true,avance(){},terminar(){},fallar(){}};
// Avanza la barra poco a poco mientras dura una fase sin medida propia, y fija su final al terminar.
async function fase(desde,hasta,promesa){
  let valor=desde;carga.avance(desde);
  const reloj=setInterval(()=>{valor+=(hasta-valor)*.08;carga.avance(valor);},120);
  try{return await promesa;}finally{clearInterval(reloj);carga.avance(hasta);}
}
async function initialize() {
  world=await fase(0,.04,cargarMundo('./Mundo/mundo.json'));
  world.zones.push({id:'colina-don-quijote',label:'Colina de Don Quijote',countryId:'prototipos',cityId:'colina',countryLabel:'Escenarios',cityLabel:'Naturaleza',manifestUrl:new URL('./Mundo/ColinaQuijote/zona.json',location.href).href,lexiconUrl:null});
  try{world.zones.push(...await generatedZones(location.href));}catch(e){if(new URLSearchParams(location.search).get('zone')?.startsWith('atlas-'))throw e;console.warn(e);}
  for(const z of world.zones)$('#zone').add(new Option(z.countryLabel+' / '+z.cityLabel+' / '+z.label,z.id));
  // Dentro del visor (3000) el lugar se elige en la barra común; este selector propio recargaría solo el motor y lo desincronizaría.
  if(window.parent!==window)$('#zone').closest('label').style.display='none';
  const zoneId=new URLSearchParams(location.search).get('zone')||world.zones[0].id;
  zone=world.zones.find(z=>z.id===zoneId);if(!zone)throw new Error('Zona desconocida');
  $('#zone').value=zone.id;$('#zone').onchange=e=>{if(editor?.dirty()){status('Guarda o exporta la edición antes de cambiar de zona.');e.target.value=zone.id;return;}const room=new URLSearchParams(location.search).get('room');location.href='?zone='+encodeURIComponent(e.target.value)+'&dev'+(room?'&room='+encodeURIComponent(room):'');};
  const response=await fetch(zone.manifestUrl);if(!response.ok)throw new Error('No se pudo cargar el manifiesto de zona');manifest=await response.json();
  if(manifest.id!==zone.id||manifest.version!==1)throw new Error('Manifiesto de zona incompatible');
  if(zone.id==='colina-don-quijote'){
    hillSpec=COLINA_QUIJOTE;
    hill=await import('./engine/ColinaQuijote.js');
  }else if(zone.id==='colina-amanecer'||zone.id==='pradera-antes-del-alba'){
    hillSpec=zone.id==='pradera-antes-del-alba'?COLINA_ALBA:COLINA;
    hill=await import('./engine/ColinaAmanecer.js');
  }
  // La cabecera y el título nombran siempre el lugar cargado (antes decían «Barcelona» en cualquier zona).
  document.title='SpanStories · Mundo · '+zone.label;viewport.setAttribute('aria-label','Escena de '+zone.label);$('header > span').textContent=manifest.atlas?'Generador · '+zone.label:zone.countryLabel+' · '+zone.cityLabel+' · '+zone.label;
  const box=new T.Box3(new T.Vector3(...manifest.bounds.min),new T.Vector3(...manifest.bounds.max)),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  target.set(manifest.spawn[0],ground(manifest.spawn[0],manifest.spawn[2])+CITY.inspectionHeight,manifest.spawn[2]);
  camera.position.set(manifest.spawn[0]+CITY.inspectionOffset[0],ground(manifest.spawn[0],manifest.spawn[2])+CITY.inspectionOffset[1],manifest.spawn[2]+CITY.inspectionOffset[2]);camera.lookAt(target);
  if(hill||manifest.blenderHill){
    camera.position.fromArray(manifest.studioShot.position);
    target.fromArray(manifest.studioShot.target);
    camera.lookAt(target);
  }
  if(aprendizaje&&!exploracion){
    const bindings=await (await fetch(new URL('Historias/integracion.json',world.world.manifestUrl))).json();
    const first=bindings.bindings.find(b=>b.scenes?.some(s=>s.zoneId===zone.id))?.scenes.find(s=>s.zoneId===zone.id);
    if(first){camera.position.fromArray(first.camera.position);target.fromArray(first.camera.target);camera.lookAt(target);}
  }
  const BlenderHillAssets=manifest.blenderHill?(await import('./engine/ColinaBlender.js')).BlenderHillAssets:null;
  style=new CityStyle({estilos:manifest.studioAirport||hill||manifest.blenderHill?null:estilos});const Assets=hill?.HillAssets??BlenderHillAssets??(manifest.studioAirport?StudioAirportAssets:manifest.atlas?AtlasAssets:CityAssets);assets=new Assets({scene,objetos,style,renderer,camera,status,manifest,hillSpec,concurrency:CITY.concurrency,unloadDelay:CITY.unloadDelay,
    multiDraw:!!renderer.getContext().getExtension('WEBGL_multi_draw'),
    retainedRoots:()=>[...[...editor?.state.imports.values()||[]].map(r=>r.root),...decorations?.retainedRoots()||[],...studioBridge?.retainedRoots()||[],...vegetacion?.retainedRoots()||[]],
    onUnload:r=>{
      if(editor)r.root.traverse(o=>{const value=editor.state.overrides.get(o.userData.ssId);if(value)editor.state.pending.set(value.id,structuredClone(value));});
      // Lugares del Generador: los elementos no son nodos del sector sino proxies; sus ediciones esperan a que vuelva a cargarse.
      if(editor)for(const id of r.entityBounds?.keys()??[]){const value=editor.state.overrides.get(id);if(value)editor.state.pending.set(id,structuredClone(value));}
      decorations?.detach(r);
      scheduleAssetRefresh();
    },
    onLoad:r=>{decorations?.attach(r);refreshAssetEditor();scheduleAssetRefresh();status(zone.label+' · '+[...assets.records.values()].filter(r=>r.state==='ready').length+'/'+manifest.sectors.length+' sectores');}});
  // Estilo de nubes de las colinas que lo admiten (Opciones › Escena › Nubes); se recuerda en este navegador.
  if(assets.setCloudStyle){const row=$('#cloud-style-row'),sel=$('#cloud-style');sel.replaceChildren(...(hill?.CLOUD_STYLES??assets.cloudStyles??[]).map(o=>new Option(o.label,String(o.id))));let saved=null;try{saved=localStorage.getItem('spanstories.nubes');}catch{}
    if(saved!==null&&sel.querySelector(`option[value="${saved}"]`))assets.setCloudStyle(+saved);sel.value=String(assets.cloudStyle??hillSpec?.clouds?.style??4);row.hidden=false;
    sel.onchange=()=>{assets.setCloudStyle(+sel.value);try{localStorage.setItem('spanstories.nubes',sel.value);}catch{}};}
  // Suelo entre las matas y densidad del césped cercano (colinas que lo admiten); se recuerdan en este navegador.
  if(assets.setGroundStyle){const row=$('#ground-style-row'),sel=$('#ground-style');let saved=null;try{saved=localStorage.getItem('spanstories.suelo');}catch{}
    if(saved==='0'||saved==='1')assets.setGroundStyle(+saved);sel.value=String(assets.groundStyle??hillSpec?.groundStyle??1);row.hidden=false;
    sel.onchange=()=>{assets.setGroundStyle(+sel.value);try{localStorage.setItem('spanstories.suelo',sel.value);}catch{}};}
  if(assets.setGrassDensity){const row=$('#grass-density-row'),input=$('#grass-density'),out=$('#grass-density-value');let saved=null;try{saved=parseFloat(localStorage.getItem('spanstories.densidadCesped'));}catch{}
    if(Number.isFinite(saved))assets.setGrassDensity(saved);const show=()=>{out.textContent=(+input.value).toFixed(2).replace('.',',')+'×';};
    input.value=String(assets.grassDensity??1);show();row.hidden=false;
    input.oninput=()=>{assets.setGrassDensity(+input.value);show();try{localStorage.setItem('spanstories.densidadCesped',input.value);}catch{}};}
  assets.setOptimized(aprendizaje||!new URLSearchParams(location.search).has('unbatched'));if(!aprendizaje){$('#batching').checked=assets.optimized;
    // Los lugares del Generador ya llegan optimizados: el interruptor no tiene efecto en ellos, así que se desactiva.
    $('#batching').disabled=!!manifest.atlas;$('#batching').title=manifest.atlas?'No aplica a los lugares del Generador (ya vienen optimizados).':'';}
  if(manifest.atlas&&!aprendizaje){
    const {VegetacionAtlas}=await import('./engine/VegetacionAtlas.js');
    // Se guarda en el mismo IndexedDB que la edición del mundo (spanstories.ciudades.editor), con clave vegetacion:<lugar>.
    vegetacion=new VegetacionAtlas({zoneId:zone.id,revision:manifest.revision,detalleExportado:manifest.arboles?.detalle??null,manifestUrl:zone.manifestUrl,baseUrl:location.href,entities:manifest.entities,loader:assets.loader,style,store:new CiudadProjectStore(),
      records:()=>[...assets.records.values()].filter(r=>r.state==='ready'&&r.root),actualizarLimites:(r,boxes)=>assets.actualizarLimites(r,boxes),status,alCambiar:()=>{colliderBounds.clear();updateSelection();}});
    assets.vegetacion=vegetacion;vegetacion.edicion=assets.edicion;void vegetacion.iniciar();
  }
  if(zone.id==='barcelona-passeig-gracia'){
    status('Preparando árboles y señalización con LOD…');
    decorations=new CityDecorations({scene,objetos,loader:assets.loader,style,renderer,camera});
    await fase(.08,.25,decorations.initialize());
  }
  rebuildColliders();
  const spawn=[manifest.spawn[0],ground(manifest.spawn[0],manifest.spawn[2]),manifest.spawn[2]];
  if(!aprendizaje||exploracion){
  // Elegir el primer punto libre cercano solo si la caja de colisión cubre el origen.
  if(collidesAt(new T.Vector3(...spawn),colliders)){let found=false;for(let r=2;r<=CITY.spawnSearch&&!found;r+=2)for(const [x,z] of [[r,0],[-r,0],[0,r],[0,-r]]){const p=new T.Vector3(spawn[0]+x,ground(spawn[0]+x,spawn[2]+z),spawn[2]+z);if(!collidesAt(p,colliders)){spawn.splice(0,3,...p.toArray());found=true;break;}}}
  navigation=crearNavegacionCiudad({camera,canvas:renderer.domElement,target,scene,spawn,bounds:manifest.bounds,radius:CITY.playerRadius,colliders:(p,r=CITY.playerRadius)=>collisionIndex.query(p,r,collisionCandidates),ground,onMode:modeChanged,pointerLock:!exploracion,gizmoActive:event=>!!gizmo?.active(event)});
  }
  if(!aprendizaje&&manifest.atlas){
    disposeAtlasPanel=atlasSourcePanel({host:$('#city-editor'),manifest,objetos,navigation});modeChanged('editor');resize();
    if(vegetacion){const {montarSelectorVegetacion}=await import('./engine/SelectorVegetacion.js');disposeVegetacion=montarSelectorVegetacion({host:$('#city-editor'),vegetacion,status});}
  }
  {
  // Lugares del Generador también se editan: cada elemento se separa de lo fundido al editarlo (AtlasEdicion.js).
  // Sus ediciones se guardan por lugar y versión publicada: otra versión del lugar no hereda movimientos ajenos.
  const editorHost=aprendizaje?null:manifest.atlas?$('#city-editor').appendChild(document.createElement('div')):$('#city-editor');
  const projectOptions={scene,objetos,host:editorHost,cityId:manifest.atlas?'atlas:'+zone.id+':'+manifest.revision:zone.id,loader:assets.loader,
    adaptar:async(root,gltf)=>{await prepararSuperficies(gltf);return style.adaptAsync(root,gltf);},
    optimizar:async root=>{const prepared=await optimizeCityRoot(root,{multiDraw:assets.multiDraw,renderer,camera,scene});if(!assets.optimized)prepared.setActive(false);return prepared;},
    liberar:root=>assets.release(root),
    focus:root=>navigation.focus(root.userData.atlasBounds?root.userData.instanceBinding?.bounds?.()??root.userData.atlasBounds:root),changed,target:()=>new T.Vector3(target.x,ground(target.x,target.z),target.z),status};
  if(aprendizaje)editor=await leerEdicionCiudad(projectOptions,new URLSearchParams(location.search).get('edicion'));
  else {editor=montarEditorCiudad(projectOptions);await editor.restore();modeChanged('editor');}
  resize();
  // Entorno del escenario: cielo, hora, niebla, clima y estilo guardados con el escenario (también en el visor del estudiante).
  {const {crearEntorno,vincularEstado}=await import('./editor/ambiente/Entorno.js');
  // Césped (motor GrassField del Generador): se carga en el Editor y, en el visor del estudiante, solo si el escenario lo usa.
  if(!aprendizaje||editor.state.escenario?.ambiente?.cesped){try{const {crearCesped}=await import('./editor/ambiente/cesped/CespedCampo.js');cespedMod=await crearCesped({scene,camera,ground,luz,centro:()=>target});}catch(error){console.warn('Césped no disponible:',error.message);}}
  if(!aprendizaje||editor.state.escenario?.ambiente?.terreno){try{const {crearTerreno}=await import('./editor/ambiente/terreno/CapaTerreno.js');terrenoMod=crearTerreno({scene,ground,style,centro:()=>target});}catch(error){console.warn('Terreno pintado no disponible:',error.message);}}
  entorno=await crearEntorno({estilos,estacionesClima,tablaLuz:AMBIENTES,modulos:{cesped:cespedMod,terreno:terrenoMod}});vincularEstado(entorno,editor.state);
  // Variante guardada como activa: en el visor del estudiante se aplica sin interfaz; en el Editor la aplica su propio runtime (con capas).
  if(aprendizaje){const {crearRuntimeVariante}=await import('./editor/variantes/Runtime.js');varianteRuntime=crearRuntimeVariante({objetos,entorno,doc:()=>editor.state.escenario});const d=editor.state.escenario;varianteRuntime.aplicar(d.variantes?.find(v=>v.id===d.varianteActiva)??null);}}
  }
  if(!aprendizaje&&navigation){
    // Interfaz del Editor (editor/Editor.js): menús, herramientas, jerarquía, inspector, biblioteca y manipulador 3D.
    ui=montarEditorVisual({scene,camera,renderer,viewport,objetos,editor,navigation,target,ground,obstaculos:()=>colliders,manifest,zone,loader:assets.loader,status,bounds:manifest.bounds,studioMode,
      contribuciones:{Vista:[()=>viewport.querySelector('.estaciones-control')||null]},entorno,estilos,clima:{ESTACIONES,CLIMAS},cesped:cespedMod,terreno:terrenoMod,atlasId:manifest.atlas?zone.id:null,existeId:id=>manifestIds().has(id)});
    gizmo=ui.gizmo;ui.modoCambiado(navigation.mode);
    // El aeropuerto se dibuja sin el render estilizado: el gizmo (capa 31) se ve activando esa capa en la cámara.
    if(manifest.studioAirport||hill)camera.layers.enable(31);
  } else {
    if(exploracion){
      if(!hillSpec?.predawn){
        camera.position.fromArray(spawn);camera.position.y+=CITY.playerHeight;
        target.copy(camera.position).add(new T.Vector3(0,0,-1));camera.lookAt(target);
      }
      navigation.setMode('first');navigation.setEditorEnabled(false);
    }
    resize();
  }
  const narrativeSector=()=>manifest.sectors.find(s=>target.x>=s.bounds.min[0]&&target.x<=s.bounds.max[0]&&target.z>=s.bounds.min[2]&&target.z<=s.bounds.max[2])||firstSector(nearbySectors(),target.toArray(),{radius:CITY.streamRadius,transferBudget:CITY.initialTransferBudget});
  const first=aprendizaje?narrativeSector():firstSector(nearbySectors(),spawn,{radius:CITY.streamRadius,transferBudget:CITY.initialTransferBudget});
  // Keep the first visible piece ahead of speculative downloads on slow connections.
  // En el Estudio no se espera al primer sector (en Barcelona ~47 MB): el puente se conecta ya y los
  // personajes y talleres quedan disponibles mientras la ciudad sigue cargando.
  const firstLoad=fase(.25,.55,assets.load(first,zone.manifestUrl)).then(()=>{firstSectorReady=true;performance.mark('city-first-sector-ready');});
  if(!studioMode)await firstLoad;
  if((aprendizaje||studioMode)&&!manifest.atlas){
    lexico=await fase(.55,.6,mountLexicon());
    if(studioMode){
      studioLexicon=true;
      await createStudioBridge();
    }else{
    if(exploracion&&!lexico){
      // Lugar sin vocabulario (p. ej. Madrid Centro o el aeropuerto): se puede recorrer, pero no hay objetos que escuchar.
      const help=document.createElement('p');help.className='lexico-ayuda';help.textContent='Este lugar aún no tiene vocabulario · WASD o flechas: caminar · arrastra: mirar';viewport.append(help);
      performance.mark('world-lexicon-ready');
    }else if(exploracion){
      lexico.interaccion.habilitar(lexico.mapa.entries.map(e=>e.id));
      const help=document.createElement('p');help.className='lexico-ayuda';help.textContent='WASD o flechas: caminar · arrastra: mirar · clic: escuchar un objeto';viewport.append(help);
      performance.mark('world-lexicon-ready');
    }else{
    const { montarNarrativa }=await import('./engine/NarrativaVisor.js');
    narrativa=montarNarrativa({camera,target,zone,lexico,loadNearby:async()=>{await assets.load(narrativeSector(),zone.manifestUrl);void loadNearby();},estado:status});
    }
    }
  } else if(studioMode) {
    // Lugares del Generador: el Estudio funciona sin léxico (no tienen vocabulario publicado).
    await createStudioBridge();
  } else if(!manifest.atlas) {
    const { montarPreparacionNarrativa }=await import('./engine/NarrativaEditor.js');
    narrativa=await montarPreparacionNarrativa({camera,target,objetos,zone,host:$('#city-editor'),download});
  }
  if(studioMode){status(zone.label+' · cargando la ciudad…');await firstLoad;}
  status(zone.label+' lista para explorar · cargando el entorno…');
  carga.avance(.6);
  // La pantalla de carga espera solo a los sectores que entran en el encuadre inicial;
  // los de alrededor siguen llegando por streaming sin bloquear al estudiante.
  camera.updateMatrixWorld(true);
  const encuadre=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visibles=nearbySectors().filter(s=>encuadre.intersectsBox(new T.Box3(new T.Vector3(...s.bounds.min),new T.Vector3(...s.bounds.max)))).map(s=>s.id);
  // Tope: en equipos lentos no se retiene al estudiante; el sector inicial ya está listo.
  const CARGA_MAX_ENTORNO_MS=20000,inicioEntorno=performance.now();
  const medir=setInterval(()=>{const listos=visibles.filter(id=>assets.records.get(id)?.state==='ready').length;carga.avance(.6+.38*listos/Math.max(1,visibles.length));if(listos===visibles.length||performance.now()-inicioEntorno>CARGA_MAX_ENTORNO_MS){clearInterval(medir);carga.terminar();}},150);
  loadPromise=loadNearby().finally(()=>{clearInterval(medir);carga.terminar();}).then(()=>{
    refreshAssetEditor();rebuildColliders();metrics.reset();status(assets.errors.length?'Carga parcial: revisa Diagnóstico.':'Zona cercana lista · Vista general carga toda la ciudad');
    document.body.dataset.ready=String(assets.errors.length===0);
  });
  if(!aprendizaje&&!studioMode)multiplayer=createMultiplayer();
  if(!aprendizaje||new URLSearchParams(location.search).has('dev'))window.__escena={scene,renderer,camera,target,luz,estilos,objetos,assets,decorations,editor,navigation,multiplayer,manifest,world,metrics,snapshot,ready:loadPromise,lexico,narrativa,estacionesClima,capturarObjeto,ground,loadAll,loadNearby,loadAvatar:avatar,vegetacion,get ui(){return ui;},get entorno(){return entorno;},get cesped(){return cespedMod;},get terreno(){return terrenoMod;}};
}
let narrativa=null;
function mountLexicon(){return montarLexico({zone,manifest,scene,camera,renderer,canvas:renderer.domElement,objetos,anfitrion:viewport,estado:status,alEstado:event=>studioBridge?.setLexicalEvent(event),guardado:!studioMode});}
async function createStudioBridge(keepCamera=false){
  const {createStoryStudioBridge}=await import('./engine/StoryStudioBridge.js');
  studioBridge=await createStoryStudioBridge({scene,camera,target,renderer,assets,style,estilos,zone,manifest,world,ground,loadNearby,navigation,lexico,pinned:studioPinned,colliders:(p,r=CITY.playerRadius)=>collisionIndex.query(p,r,[]),perfilVida:()=>quality.profile,keepCamera,aplicarVariante:id=>{const d=editor.state.escenario;if(ui)ui.verVariante(id);else varianteRuntime?.aplicar(id?d.variantes?.find(v=>v.id===id)??null:null);}});
}
function createMultiplayer(){
  return new CityMultiplayer({scene,navigation,zone:zone.id,room:new URLSearchParams(location.search).get('room')||'principal',
    template:async()=>{const gltf=await avatar();return {root:avatarTemplate.root,animations:gltf.animations};},
    prepare:root=>prepareCityGpu(root,{renderer,camera,scene})});
}
// Editor de escenarios ↔ Estudio: literalmente la misma escena. La ciudad, la cámara (posición, objetivo y campo
// de visión), los personajes, sus luces y el ambiente del Estudio se conservan en ambos sentidos: al volver al Editor
// el puente del Estudio solo se suspende (no se retira nada) y al entrar en el Estudio adopta la vista que había.
async function setStudioMode(on){
  if(aprendizaje||destroyed||on===studioMode&&(!on||studioBridge))return;
  if(on){
    studioMode=true;document.body.dataset.studio='true';ui?.entrarEstudio();
    multiplayer?.dispose();multiplayer=null;
    if(studioBridge)studioBridge.resume();
    else{
      if(!manifest.atlas&&!lexico){lexico=await mountLexicon();studioLexicon=true;}
      await createStudioBridge(true);
    }
  }else{
    // Se conserva el léxico del Estudio: su puente lo usa al volver (sin objetos activos no responde a clics).
    studioBridge?.suspend();
    studioMode=false;delete document.body.dataset.studio;ui?.salirEstudio();
    navigation?.setEditorEnabled(true);navigation?.setMode('editor');modeChanged('editor');
    if(!manifest.atlas&&!narrativa){const { montarPreparacionNarrativa }=await import('./engine/NarrativaEditor.js');narrativa=await montarPreparacionNarrativa({camera,target,objetos,zone,host:$('#city-editor'),download});}
    multiplayer=createMultiplayer();
  }
  resize();void loadNearby();
}
let modeQueue=Promise.resolve();
if(!aprendizaje)window.addEventListener('message',event=>{
  if(event.source!==window.parent||!LEXICO.hostOrigins.includes(event.origin))return;
  const m=event.data;if(m?.channel!=='spanstories.engine'||m.version!==1||m.type!=='PROJECT_STATUS')return;
  initialized.then(()=>window.parent.postMessage({channel:'spanstories.engine',version:1,type:'PROJECT_STATUS_RESULT',requestId:m.requestId,zoneId:zone.id,dirty:editor.dirty(),revision:editor.revision??'base',baseRevision:manifest.atlas?manifest.revision:null},event.origin),
    // Si el motor no llegó a arrancar, se responde con el error en vez de dejar al anfitrión esperando.
    error=>window.parent.postMessage({channel:'spanstories.engine',version:1,type:'PROJECT_STATUS_RESULT',requestId:m.requestId,zoneId:zone?.id??null,dirty:null,error:error?.message??String(error)},event.origin));
});
// Story Studio / visor: elegir una variante del escenario para la escena (no cambia la variante guardada como activa).
window.addEventListener('message',event=>{
  if(event.source!==window.parent||!LEXICO.hostOrigins.includes(event.origin))return;
  const m=event.data;if(m?.channel!=='spanstories.engine'||m.version!==1||m.type!=='APPLY_VARIANT')return;
  initialized.then(()=>{const id=typeof m.variantId==='string'?m.variantId:null,d=editor.state.escenario;if(id&&!d.variantes?.some(v=>v.id===id)){window.parent.postMessage({channel:'spanstories.engine',version:1,type:'VARIANT_ERROR',variantId:id,error:'La variante ya no existe en este escenario.'},event.origin);return;}
    if(ui)ui.verVariante(id);else varianteRuntime?.aplicar(id?d.variantes.find(v=>v.id===id):null);window.parent.postMessage({channel:'spanstories.engine',version:1,type:'VARIANT_READY',variantId:id},event.origin);},()=>{});
});
if(!aprendizaje)window.addEventListener('message',event=>{
  if(event.source!==window.parent||!LEXICO.hostOrigins.includes(event.origin))return;
  const m=event.data;if(m?.channel!=='spanstories.engine'||m.version!==1||m.type!=='MODE'||!['editor','estudio'].includes(m.mode))return;
  const reply=data=>window.parent.postMessage({channel:'spanstories.engine',version:1,...data},event.origin);
  modeQueue=modeQueue.then(()=>initialized).then(()=>setStudioMode(m.mode==='estudio')).then(()=>reply({type:'MODE_READY',mode:m.mode,zoneId:zone?.id}),error=>{console.error(error);status('No se pudo cambiar de modo: '+error.message);reply({type:'MODE_ERROR',mode:m.mode,error:error.message});});
});
let previous=performance.now(),lastHud=0,lastStreaming=0,renderSuspendedByHost=false;
window.addEventListener('message',event=>{
  if(event.source!==window.parent||!LEXICO.hostOrigins.includes(event.origin))return;
  const m=event.data;
  if(m?.channel!=='spanstories.engine'||m.version!==1||m.type!=='RENDER_VISIBILITY'||typeof m.visible!=='boolean')return;
  renderSuspendedByHost=!m.visible;previous=performance.now();metrics.reset();
  if(renderSuspendedByHost)$('#hud-metrics').textContent='Escenario en pausa · taller abierto · 0 calls';
});
const recordInput=e=>{if(e.target===renderer.domElement||document.pointerLockElement===renderer.domElement)metrics.input(e.timeStamp);};
renderer.domElement.addEventListener('pointermove',recordInput,{passive:true});
// A hidden client's network heartbeat continues; its GPU must not interrupt a
// visible client on the same device. Resume with a fresh frame timing window.
function visibilityChanged(){previous=performance.now();metrics.reset();}
document.addEventListener('visibilitychange',visibilityChanged);
renderer.setAnimationLoop(now=>{
  if(destroyed)return;if(document.hidden||renderSuspendedByHost){previous=now;return;}const dt=Math.max(0,Math.min((now-previous)/1000,.1)),frameMs=now-previous;previous=now;
  navigation?.update(dt);studioBridge?.update(dt);assets?.update?.(dt);estacionesClima.interior(!!assets?.interior||!!assets?.sinClima);estacionesClima.update(dt);cespedMod?.actualizar(now/1000,dt);multiplayer?.update(now,dt);decorations?.update(now);style?.update();estilos.update(camera);renderer.info.reset();const started=performance.now();decorations?.renderShadows();
  if(manifest?.studioAirport||hill)renderer.render(scene,camera);else estilos.render(scene,camera);
  studioBridge?.renderInset?.(renderer);
  lexico?.renderizarResaltado();metrics.presented();metrics.sample(frameMs,performance.now()-started);quality.sample(frameMs/1000,renderer.info);
  if(now-lastStreaming>1000){lastStreaming=now;loadNearby();}
  if(now-lastHud>250){lastHud=now;const data=metrics.timing(),network=multiplayer?.client.networkTiming(),ms=value=>Number.isFinite(value)?value.toFixed(0)+' ms':'—';
    if($('#panel-diagnostico details')?.open)$('#metrics').textContent=JSON.stringify(snapshot(),null,2);
    $('#hud-metrics').textContent=data.fps.toFixed(0)+' FPS · mín '+data.minFps.toFixed(0)+' (5 s) · p95 '+data.p95Ms.toFixed(1)+' ms · pico '+ms(data.maxMs)+'\nPing '+ms(network?.pingMs)+' · lat. red ≈ '+ms(network?.latencyEstimateMs)+(multiplayer?.client.simulation?.rttMs?' · red simulada':'')+'\nEntrada→envío de frame '+ms(data.inputLatencyMs)+' · '+renderer.info.render.calls+' calls';}
});
function dispose(){destroyed=true;renderer.setAnimationLoop(null);document.removeEventListener('visibilitychange',visibilityChanged);observer.disconnect();stopResolutionWatch();studioBridge?.destroy();multiplayer?.dispose();avatarTemplate?.dispose();lexico?.destruir();ui?.dispose();navigation?.dispose();editor?.dispose();decorations?.dispose();assets?.dispose();estilos.dispose();estacionesClima.destruir();lightListener();selections.geometry.dispose();selections.material.dispose();renderer.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
window.addEventListener('pagehide',()=>disposeAtlasPanel?.(),{once:true});
window.addEventListener('pagehide',()=>{disposeVegetacion?.();vegetacion?.dispose();},{once:true});
const initialized=initialize().catch(e=>{carga.fallar(e.message);status('No se pudo iniciar: '+e.message);console.error(e);document.body.dataset.error=e.message;throw e;});
initialized.catch(()=>{});
// Anuncia al anfitrión la zona y el modo cargados: si pidió otro modo mientras arrancaba, lo vuelve a pedir.
if(!aprendizaje&&window.parent!==window)initialized.then(async()=>{
  const {origenDelAnfitrion}=await import('./engine/LexicoPuertos.js'),host=origenDelAnfitrion({win:window,permitidos:LEXICO.hostOrigins});
  if(host)window.parent.postMessage({channel:'spanstories.engine',version:1,type:'LOADED',zoneId:zone.id,mode:studioMode?'estudio':'editor'},host);
},()=>{});
