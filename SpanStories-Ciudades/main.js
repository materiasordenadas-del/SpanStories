import * as T from './engine/three.js';
import { luz } from './engine/Luz25D.js';
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
import { CITY } from './routes.js';
import { montarLexico } from './engine/LexicoMontaje.js';
import { crearCargaInicial } from './engine/CargaInicial.js';
import {generatedZones,AtlasAssets,atlasGround,atlasSourcePanel} from './engine/AtlasPlaces.js';

const $ = selector => document.querySelector(selector), viewport = $('#viewport');
// Modo aprendizaje: la historia controla la cámara; el estudiante solo toca objetos. Sin editor ni navegación.
const aprendizaje = new URLSearchParams(location.search).has('aprendizaje');
const exploracion=aprendizaje&&new URLSearchParams(location.search).has('explorar');
const studioMode=new URLSearchParams(location.search).has('estudio');
if(studioMode)document.body.dataset.studio='true';
const studioPinned=new Set();
let studioBridge=null;
let disposeAtlasPanel=null;
// Los módulos exclusivos del editor no se cargan en el Visor Web.
const { montarEditorCiudad, capturarObjeto } = aprendizaje ? {} : await import('./engine/CityEditor.js');
const { crearNavegacionCiudad, collidesAt } = aprendizaje&&!exploracion ? {} : await import('./engine/CityNavigation.js');
const { montarPanelEstilo } = aprendizaje ? {} : await import('./panel/PanelEstilo.js');
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
function refreshAssetEditor(){if(!editor)return;if($('#panel').hidden)editor.state.applyPending();else editor.refresh();}
function scheduleAssetRefresh(){if(assetRefreshPending)return;assetRefreshPending=true;queueMicrotask(()=>{assetRefreshPending=false;refreshAssetEditor();rebuildColliders();updateSelection();});}
let manifest, zone, style, assets, decorations, editor, navigation, multiplayer, avatarTemplate, colliders = [], destroyed = false, loadPromise, avatarPromise, overview = false, firstSectorReady = false;
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
  if(root) { root.userData.atlasBounds?selections.box.copy(root.userData.atlasBounds):selections.box.setFromObject(root); $('#selected-label').textContent = root.userData.label; }
  else $('#selected-label').textContent = 'Selecciona un edificio o una pieza';
}
objetos.onChange = updateSelection;
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
    const saved=editor?.state.overrides.get(o.id)||editor?.state.pending.get(o.id);
    return {id:o.id,bounds:colliderBounds.get(o.id)||o.bounds,enabled:!root?.userData.ocultoUsuario&&!saved?.hidden};
  });
  for(const entry of objetos.entries.values()) if(entry.raiz.userData.cityImportId && entry.raiz.parent === scene && entry.raiz.visible) {
    const b=new T.Box3().setFromObject(entry.raiz); colliders.push({id:entry.id,bounds:{min:b.min.toArray(),max:b.max.toArray()}});
  }
  colliders.push(...decorations?.colliders()||[]);
  collisionIndex=new CityCollisionIndex(colliders);
}
function ground(x,z) {
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
if(!aprendizaje) montarPanelEstilo({luz,estilos,contenedor:$('#panel-estilo'),clave:'spanstories.ciudades.luz.v1'});
if(!aprendizaje)$('#panel-toggle').onclick=()=>{const p=$('#panel');p.hidden=!p.hidden;if(!p.hidden)editor?.refresh();$('#panel-toggle').setAttribute('aria-expanded',String(!p.hidden));};
const quality = new PerformanceController((profile,name)=>{requestedDpr=profile.dpr;allowAdaptiveResolution=name!=='ECO';resize();metrics.reset();});
if(!aprendizaje){
$('#quality').onchange=e=>{quality.set(e.target.value);}; $('#auto-quality').onchange=e=>{quality.auto=e.target.checked;};
$('#batching').onchange=e=>{assets?.setOptimized(e.target.checked);for(const r of editor?.state.imports.values()||[])r.optimization?.setActive(e.target.checked);metrics.reset();};
$('#overview').onclick=()=>{if(!navigation||!manifest)return;navigation.setMode('editor');navigation.focus(new T.Box3(new T.Vector3(...manifest.bounds.min),new T.Vector3(...manifest.bounds.max)));loadAll();};
$('#reset-player').onclick=()=>{if(navigation&&manifest)navigation.teleport([manifest.spawn[0],ground(manifest.spawn[0],manifest.spawn[2]),manifest.spawn[2]]);};
}
async function avatar() {
  if(avatarPromise)return avatarPromise;
  avatarPromise=(async()=>{
    status('Cargando Samuel para tercera persona…');
    const response=await fetch(new URL('Personajes/personajes.json',world.world.manifestUrl)); const catalog=await response.json();
    const character=catalog.characters.find(c=>c.id==='samuel'); const url=new URL(character.url,response.url).href;
    const packed=character.gzipUrl?new URL(character.gzipUrl,response.url).href:null;
    const {buffer,json,binary}=await fetchCityGLB(url,{gzipUrl:packed,sha256:character.sha256,prepareForParse:true});
    const gltf=await assets.loader.parseAsync(json||buffer,new URL('.',url).href,binary||null); await style.adaptAsync(gltf.scene,gltf); gltf.scene.traverse(o=>{o.userData.ignorarSeleccion=true;});
    await prepareCityGpu(gltf.scene,{renderer,camera,scene});
    navigation.setAvatar(gltf.scene,gltf.animations);
    // Capture an unanimated, normalized master before the next animation frame.
    avatarTemplate=cloneCityAvatar(navigation.avatarCarrier.children[0]);
    status('Samuel listo · WASD para caminar, arrastra para mirar.');
    return gltf;
  })().catch(e=>{avatarPromise=null;status('No se pudo cargar Samuel: '+e.message);throw e;});return avatarPromise;
}
function modeChanged(mode) {
  if(mode!=='editor')overview=false;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  editor?.enabled(mode==='editor'); updateSelection();
  $('#help').textContent=mode==='editor'?'Clic: seleccionar · derecho: girar · central: desplazar · rueda: acercar': 'WASD: caminar · ratón o arrastre: mirar · Mayús: rápido · Esc: editor';
  if(mode==='third')avatar().catch(()=>{});
}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{document.activeElement.blur();navigation?.setMode(button.dataset.mode);};
let pointerDown;
renderer.domElement.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY,button:e.button};});
renderer.domElement.addEventListener('click',e=>{
  if(aprendizaje||studioMode||navigation?.mode!=='editor'||!pointerDown||pointerDown.button!==0||e.altKey||Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>4)return;
  const rect=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster(); const point=new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  scene.updateMatrixWorld(true);ray.setFromCamera(point,camera);
  const entry=objetos.elegirImpacto(ray.intersectObjects(scene.children,true));objetos.seleccionar(entry?.id??null);
});
window.addEventListener('keydown',e=>{
  if(!editor||aprendizaje||studioMode||navigation?.mode!=='editor'||e.target.closest?.('input,textarea,select,button,[contenteditable]'))return;
  const root=objetos.obtener(objetos.seleccion);if(!root)return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();e.shiftKey?editor.redo():editor.undo();return;}
  const steps={ArrowLeft:[-1,0,0],ArrowRight:[1,0,0],ArrowUp:[0,0,-1],ArrowDown:[0,0,1],PageUp:[0,1,0],PageDown:[0,-1,0]};
  if(steps[e.code]){e.preventDefault();const s=e.shiftKey?CITY.largeEditStep:CITY.editStep;editor.applySelected({position:root.position.toArray().map((n,i)=>n+steps[e.code][i]*s)});}
});
viewport.addEventListener('dragover',e=>{if(!aprendizaje&&navigation?.mode==='editor'&&e.dataTransfer.types.includes('Files'))e.preventDefault();});
viewport.addEventListener('drop',e=>{if(editor&&!aprendizaje&&navigation?.mode==='editor'){e.preventDefault();editor.importFiles([...e.dataTransfer.files]);}});
function snapshot(){return metrics.snapshot(scene,{three:T.REVISION,zone:zone?.id,mode:navigation?.mode,camera:camera.position.toArray(),target:target.toArray(),quality:quality.name,batching:assets?.optimized,downloadedGlbBytes:assets?.loadedBytes||0,sectors:assets?.snapshot(),decorations:decorations?.snapshot(),multiplayer:multiplayer?.snapshot(),unloadedSectors:assets?.unloadedCount||0,objectCount:objetos.entries.size,errors:assets?.errors||[]});}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
if(!aprendizaje)$('#export-metrics').onclick=()=>download('metricas-'+zone.id+'.json',snapshot());
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
const carga=crearCargaInicial(viewport);
// Avanza la barra poco a poco mientras dura una fase sin medida propia, y fija su final al terminar.
async function fase(desde,hasta,promesa){
  let valor=desde;carga.avance(desde);
  const reloj=setInterval(()=>{valor+=(hasta-valor)*.08;carga.avance(valor);},120);
  try{return await promesa;}finally{clearInterval(reloj);carga.avance(hasta);}
}
async function initialize() {
  world=await fase(0,.04,cargarMundo('./Mundo/mundo.json'));
  try{world.zones.push(...await generatedZones(location.href));}catch(e){if(new URLSearchParams(location.search).get('zone')?.startsWith('atlas-'))throw e;console.warn(e);}
  for(const z of world.zones)$('#zone').add(new Option(z.countryLabel+' / '+z.cityLabel+' / '+z.label,z.id));
  const zoneId=new URLSearchParams(location.search).get('zone')||world.zones[0].id;
  zone=world.zones.find(z=>z.id===zoneId);if(!zone)throw new Error('Zona desconocida');
  $('#zone').value=zone.id;$('#zone').onchange=e=>{if(editor?.dirty()){status('Guarda o exporta la edición antes de cambiar de zona.');e.target.value=zone.id;return;}const room=new URLSearchParams(location.search).get('room');location.href='?zone='+encodeURIComponent(e.target.value)+'&dev'+(room?'&room='+encodeURIComponent(room):'');};
  const response=await fetch(zone.manifestUrl);if(!response.ok)throw new Error('No se pudo cargar el manifiesto de zona');manifest=await response.json();
  if(manifest.id!==zone.id||manifest.version!==1)throw new Error('Manifiesto de zona incompatible');
  if(manifest.atlas){document.title='SpanStories · Mundo · '+zone.label;viewport.setAttribute('aria-label','Escena de '+zone.label);$('header > span').textContent='Generador · '+zone.label;}
  const box=new T.Box3(new T.Vector3(...manifest.bounds.min),new T.Vector3(...manifest.bounds.max)),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  target.set(manifest.spawn[0],ground(manifest.spawn[0],manifest.spawn[2])+CITY.inspectionHeight,manifest.spawn[2]);
  camera.position.set(manifest.spawn[0]+CITY.inspectionOffset[0],ground(manifest.spawn[0],manifest.spawn[2])+CITY.inspectionOffset[1],manifest.spawn[2]+CITY.inspectionOffset[2]);camera.lookAt(target);
  if(aprendizaje&&!exploracion){
    const bindings=await (await fetch(new URL('Historias/integracion.json',world.world.manifestUrl))).json();
    const first=bindings.bindings.find(b=>b.scenes?.some(s=>s.zoneId===zone.id))?.scenes.find(s=>s.zoneId===zone.id);
    if(first){camera.position.fromArray(first.camera.position);target.fromArray(first.camera.target);camera.lookAt(target);}
  }
  style=new CityStyle({estilos});const Assets=manifest.atlas?AtlasAssets:CityAssets;assets=new Assets({scene,objetos,style,renderer,camera,status,manifest,concurrency:CITY.concurrency,unloadDelay:CITY.unloadDelay,
    multiDraw:!!renderer.getContext().getExtension('WEBGL_multi_draw'),
    retainedRoots:()=>[...[...editor?.state.imports.values()||[]].map(r=>r.root),...decorations?.retainedRoots()||[],...studioBridge?.retainedRoots()||[]],
    onUnload:r=>{
      if(editor)r.root.traverse(o=>{const value=editor.state.overrides.get(o.userData.ssId);if(value)editor.state.pending.set(value.id,structuredClone(value));});
      decorations?.detach(r);
      scheduleAssetRefresh();
    },
    onLoad:r=>{decorations?.attach(r);refreshAssetEditor();scheduleAssetRefresh();status(zone.label+' · '+[...assets.records.values()].filter(r=>r.state==='ready').length+'/'+manifest.sectors.length+' sectores');}});
  assets.setOptimized(aprendizaje||!new URLSearchParams(location.search).has('unbatched'));if(!aprendizaje)$('#batching').checked=assets.optimized;
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
  navigation=crearNavegacionCiudad({camera,canvas:renderer.domElement,target,scene,spawn,bounds:manifest.bounds,radius:CITY.playerRadius,colliders:(p,r=CITY.playerRadius)=>collisionIndex.query(p,r,collisionCandidates),ground,onMode:modeChanged,pointerLock:!exploracion});
  }
  if(!aprendizaje&&manifest.atlas){
    disposeAtlasPanel=atlasSourcePanel({host:$('#city-editor'),manifest,objetos,navigation});modeChanged('editor');resize();
  }else if(!aprendizaje){
  editor=montarEditorCiudad({scene,objetos,host:$('#city-editor'),cityId:zone.id,loader:assets.loader,
    adaptar:async(root,gltf)=>{await prepararSuperficies(gltf);return style.adaptAsync(root,gltf);},
    optimizar:async root=>{const prepared=await optimizeCityRoot(root,{multiDraw:assets.multiDraw,renderer,camera,scene});if(!assets.optimized)prepared.setActive(false);return prepared;},
    liberar:root=>assets.release(root),
    focus:root=>navigation.focus(root),changed,target:()=>new T.Vector3(target.x,ground(target.x,target.z),target.z),status});
  await editor.restore(); modeChanged('editor');resize();
  } else {
    if(exploracion){camera.position.fromArray(spawn);camera.position.y+=CITY.playerHeight;target.copy(camera.position).add(new T.Vector3(0,0,-1));camera.lookAt(target);navigation.setMode('first');navigation.setEditorEnabled(false);}
    resize();
  }
  const narrativeSector=()=>manifest.sectors.find(s=>target.x>=s.bounds.min[0]&&target.x<=s.bounds.max[0]&&target.z>=s.bounds.min[2]&&target.z<=s.bounds.max[2])||firstSector(nearbySectors(),target.toArray(),{radius:CITY.streamRadius,transferBudget:CITY.initialTransferBudget});
  const first=aprendizaje?narrativeSector():firstSector(nearbySectors(),spawn,{radius:CITY.streamRadius,transferBudget:CITY.initialTransferBudget});
  // Keep the first visible piece ahead of speculative downloads on slow connections.
  await fase(.25,.55,assets.load(first,zone.manifestUrl));firstSectorReady=true;performance.mark('city-first-sector-ready');
  if((aprendizaje||studioMode)&&!manifest.atlas){
    lexico=await fase(.55,.6,montarLexico({zone,manifest,scene,camera,renderer,canvas:renderer.domElement,objetos,anfitrion:viewport,estado:status,alEstado:event=>studioBridge?.setLexicalEvent(event),guardado:!studioMode}));
    if(studioMode){
      const {createStoryStudioBridge}=await import('./engine/StoryStudioBridge.js');
      studioBridge=await createStoryStudioBridge({scene,camera,target,renderer,assets,style,estilos,zone,manifest,world,ground,loadNearby,navigation,lexico,pinned:studioPinned});
    }else{
    if(exploracion){
      lexico.interaccion.habilitar(lexico.mapa.entries.map(e=>e.id));
      const help=document.createElement('p');help.className='lexico-ayuda';help.textContent='WASD o flechas: caminar · arrastra: mirar · clic: escuchar un objeto';viewport.append(help);
      performance.mark('world-lexicon-ready');
    }else{
    const { montarNarrativa }=await import('./engine/NarrativaVisor.js');
    narrativa=montarNarrativa({camera,target,zone,lexico,loadNearby:async()=>{await assets.load(narrativeSector(),zone.manifestUrl);void loadNearby();},estado:status});
    }
    }
  } else if(!manifest.atlas) {
    const { montarPreparacionNarrativa }=await import('./engine/NarrativaEditor.js');
    narrativa=await montarPreparacionNarrativa({camera,target,objetos,zone,host:$('#city-editor'),download});
  }
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
  if(!aprendizaje&&!studioMode)multiplayer=new CityMultiplayer({scene,navigation,zone:zone.id,room:new URLSearchParams(location.search).get('room')||'principal',
    template:async()=>{const gltf=await avatar();return {root:avatarTemplate.root,animations:gltf.animations};},
    prepare:root=>prepareCityGpu(root,{renderer,camera,scene})});
  if(!aprendizaje||new URLSearchParams(location.search).has('dev'))window.__escena={scene,renderer,camera,target,luz,estilos,objetos,assets,decorations,editor,navigation,multiplayer,manifest,world,metrics,snapshot,ready:loadPromise,lexico,narrativa,capturarObjeto,ground,loadAll,loadNearby,loadAvatar:avatar};
}
let narrativa=null;
let previous=performance.now(),lastHud=0,lastStreaming=0;
const recordInput=e=>{if(e.target===renderer.domElement||document.pointerLockElement===renderer.domElement)metrics.input(e.timeStamp);};
renderer.domElement.addEventListener('pointermove',recordInput,{passive:true});
// A hidden client's network heartbeat continues; its GPU must not interrupt a
// visible client on the same device. Resume with a fresh frame timing window.
function visibilityChanged(){previous=performance.now();metrics.reset();}
document.addEventListener('visibilitychange',visibilityChanged);
renderer.setAnimationLoop(now=>{
  if(destroyed)return;if(document.hidden){previous=now;return;}const dt=Math.min((now-previous)/1000,.1),frameMs=now-previous;previous=now;
  navigation?.update(dt);studioBridge?.update(dt);multiplayer?.update(now,dt);decorations?.update(now);style?.update();estilos.update(camera);renderer.info.reset();const started=performance.now();decorations?.renderShadows();estilos.render(scene,camera);lexico?.renderizarResaltado();metrics.presented();metrics.sample(frameMs,performance.now()-started);quality.sample(frameMs/1000,renderer.info);
  if(now-lastStreaming>1000){lastStreaming=now;loadNearby();}
  if(now-lastHud>250){lastHud=now;const data=metrics.timing(),network=multiplayer?.client.networkTiming(),ms=value=>Number.isFinite(value)?value.toFixed(0)+' ms':'—';
    if(!$('#panel').hidden&&$('#panel-diagnostico details').open)$('#metrics').textContent=JSON.stringify(snapshot(),null,2);
    $('#hud-metrics').textContent=data.fps.toFixed(0)+' FPS · mín '+data.minFps.toFixed(0)+' (5 s) · p95 '+data.p95Ms.toFixed(1)+' ms · pico '+ms(data.maxMs)+'\nPing '+ms(network?.pingMs)+' · lat. red ≈ '+ms(network?.latencyEstimateMs)+(multiplayer?.client.simulation?.rttMs?' · red simulada':'')+'\nEntrada→envío de frame '+ms(data.inputLatencyMs)+' · '+renderer.info.render.calls+' calls';}
});
function dispose(){destroyed=true;renderer.setAnimationLoop(null);document.removeEventListener('visibilitychange',visibilityChanged);observer.disconnect();stopResolutionWatch();studioBridge?.destroy();multiplayer?.dispose();avatarTemplate?.dispose();lexico?.destruir();navigation?.dispose();editor?.dispose();decorations?.dispose();assets?.dispose();estilos.dispose();lightListener();selections.geometry.dispose();selections.material.dispose();renderer.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
window.addEventListener('pagehide',()=>disposeAtlasPanel?.(),{once:true});
initialize().catch(e=>{carga.fallar(e.message);status('No se pudo iniciar: '+e.message);console.error(e);document.body.dataset.error=e.message;});
