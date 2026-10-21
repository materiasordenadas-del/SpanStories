import * as T from './engine/three.js';
import { AirportWorld } from './engine/AirportWorld.js';
import { PerformanceController } from './engine/PerformanceController.js';
import { PlayerController } from './engine/PlayerController.js';
import { AirportAudioSystem } from './engine/AirportAudioSystem.js';
import { DEPARTURE_ROUTE, ARRIVAL_ROUTE } from './engine/routes.js';
import { luz, AMBIENTES } from './engine/Luz25D.js';
import { setGlossyFloors } from './engine/GlossyFloor.js';
import { EditorObjetos } from './engine/EditorObjetos.js?v=d00-1';
import { snapWallPoint, validWall } from './engine/WallDraft.js';

const $ = s => document.querySelector(s), viewport = $('#viewport');
$('#panel-toggle').onclick = () => {
  const open = $('#trip-panel').hidden;
  $('#trip-panel').hidden = !open;
  $('#panel-toggle').setAttribute('aria-expanded', String(open));
  $('#panel-toggle').textContent = open ? 'Cerrar opciones ×' : 'Viaje y opciones ☰';
};
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
viewport.append(renderer.domElement);
const scene = new T.Scene();
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 1024; skyCanvas.height = 512;
const skyContext = skyCanvas.getContext('2d');
// The painted sky is repainted for each ambience (Luz25D): three flat bands of
// gradient, cloud puffs with a cold underside, stars at night.
function paintSky(A) {
  const [top, middle, horizon] = A.cielo, g = skyContext.createLinearGradient(0, 0, 0, 256);   // equirect: y=256 is the horizon
  g.addColorStop(0, top); g.addColorStop(.55, middle); g.addColorStop(1, horizon);
  skyContext.fillStyle = g; skyContext.fillRect(0, 0, 1024, 512);
  if (A.estrellas) {
    skyContext.fillStyle = '#f4f1ff';
    for (let i = 0; i < 90; i++) {
      const x = (i * 211.7) % 1024, y = (i * 97.3) % 220, r = i % 7 ? .9 : 1.7;
      skyContext.globalAlpha = .45 + (i % 5) * .11; skyContext.beginPath(); skyContext.arc(x, y, r, 0, Math.PI * 2); skyContext.fill();
    }
    skyContext.globalAlpha = 1;
  }
  // No painted clouds: the sky carries real volumetric clouds (ExteriorIllusion).
  skyTexture.needsUpdate = true;
  refreshEnvironment();
}
const skyTexture = new T.CanvasTexture(skyCanvas); skyTexture.colorSpace = T.SRGBColorSpace; skyTexture.mapping = T.EquirectangularReflectionMapping; scene.background = skyTexture;   // world-fixed sky dome, not a screen overlay
// Image-based environment for the few physical materials (FIDS glass):
// a PMREM of the painted sky. Toon and basic materials ignore scene.environment.
const pmrem = new T.PMREMGenerator(renderer);
let envRT = pmrem.fromEquirectangular(skyTexture);
scene.environment = envRT.texture;
function refreshEnvironment() {
  const previous = envRT;
  envRT = pmrem.fromEquirectangular(skyTexture);
  scene.environment = envRT.texture;
  previous.dispose();
}
// Scenery shading lives in the Luz25D materials. The directional light only
// casts the sun's shadow map (received by multiply planes on the pavement).
scene.add(new T.AmbientLight(0xffffff, .65));
const sun = new T.DirectionalLight(0xfff8e8, 1.3); scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
sun.shadow.camera.right = sun.shadow.camera.top = 20;
sun.shadow.camera.near = .5; sun.shadow.camera.far = 60;
sun.shadow.bias = -.00015;
let sunAnchorX = NaN, sunAnchorZ = NaN;
function placeSun() {
  // Move the shadow volume with the active view, keeping the ambience's light angle.
  const x = Math.round(camera.position.x / 4) * 4;
  const z = Math.round(camera.position.z / 4) * 4;
  if (x === sunAnchorX && z === sunAnchorZ) return;
  sunAnchorX = x; sunAnchorZ = z;
  const dir = luz.direccionSol();
  sun.target.position.set(x, 0, z);
  sun.position.set(x + dir.x * 24, dir.y * 24, z + dir.z * 24);
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
}
const walkingCamera = new T.PerspectiveCamera(52, 1, .08, 80);
const constructionCamera = new T.OrthographicCamera(-60, 60, 40, -40, .1, 500);
let camera = walkingCamera;
luz.alCambiar(A => { paintSky(A); sunAnchorX = NaN; placeSun(); });
let yaw = 0, pitch = 0, drag = null;
let constructionMode = false, constructionHeight = 78, constructionPose = null, wallStart = null, wallPreview = null;
const constructionCenter = { x: 0, z: 0 };
let wallDirection = null, creationDrag = null, creationPointer = null;
const creationRoofs = new Map();
const BUILT_WALLS_KEY = 'aeropuerto.walls.v1';
const builtWallGroup = new T.Group(); builtWallGroup.name = 'muros-construidos'; scene.add(builtWallGroup);
const history = [], measurements = [];
const OBJECT_NAMES = {
  'airport.checkin.counter': 'Mostrador de facturación', 'airport.checkin.scale': 'Báscula de equipaje', 'airport.checkin.belt': 'Cinta de equipaje',
  'airport.checkin.kiosk': 'ATM de check-in automático', 'airport.security.tray': 'Bandeja de seguridad',
  'airport.security.xrayMachine': 'Máquina de rayos X', 'airport.security.metalDetector': 'Detector de metales',
  'airport.passport.booth': 'Cabina de pasaportes', 'airport.passport.scanner': 'Lector de pasaporte',
  'airport.concourse.shop': 'Tienda', 'airport.concourse.cafe': 'Cafetería',
  'airport.gate.seat': 'Asiento de espera', 'airport.gate.flightBoard': 'Pantalla de vuelos',
  'airport.gate.boardingPassScanner': 'Lector de tarjeta de embarque',
  'airport.baggage.suitcase': 'Maleta', 'airport.baggage.carousel': 'Carrusel de equipaje',
  'airport.customs.greenChannel': 'Canal verde de aduana', 'airport.customs.redChannel': 'Canal rojo de aduana',
  'airport.exit.taxi': 'Taxi', 'airport.exit.bus': 'Autobús',
  'airport.entrance.directory': 'Totem de direcciones', 'airport.entrance.promo': 'Publicidad SpanStories',
};
const editor = new EditorObjetos({ nombres: OBJECT_NAMES });
let operation = false, stopped = false, lastTime = performance.now();
let player = null;
const held = new Set();
const audioSystem = new AirportAudioSystem();
let displayTimer = 0;
const world = new AirportWorld({ scene, renderer, camera,
  onEvent(event) { history.push(`[${event.type}] ${event.id}`); if (history.length > 80) history.shift(); $('#events').textContent = history.join('\n'); },
  onError(error) { $('#status').textContent = `Precarga pendiente: ${error.message}. Reintenta el portal.`; },
});
const performanceController = new PerformanceController(profile => {
  renderer.setPixelRatio(Math.min(devicePixelRatio, profile.dpr));
  if (!constructionMode) camera.far = profile.far;
  camera.updateProjectionMatrix(); resize();
  $('#quality').value = performanceController.name;
});
function resize() {
  const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height);
  if (camera.isOrthographicCamera) {
    const halfHeight = constructionHeight / 2, halfWidth = halfHeight * width / height;
    camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
  } else camera.aspect = width / height;
  camera.updateProjectionMatrix();
  luz.viewport(width, height, renderer.getPixelRatio());   // outline width is constant in screen pixels
}
const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(viewport); performanceController.set('STANDARD');
function updateJourney() {
  const meta = world.manager.route[world.manager.index];
  $('#zone').textContent = `${meta.id} · ${meta.label}`;
  $('#zone-tag').textContent = `${meta.id} · ${meta.label}`;
  $('#journey').textContent = world.manager.route === ARRIVAL_ROUTE ? 'Llegadas · del avión a la salida' : 'Salidas · de la entrada al embarque';
  const progress = $('#progress'); progress.replaceChildren();
  world.manager.route.forEach((step, i) => {
    const marker = document.createElement('span'); marker.title = step.label;
    marker.className = i === world.manager.index ? 'active' : i < world.manager.index ? 'done' : '';
    marker.textContent = String(i + 1); progress.append(marker);
  });
}
function aimCamera() {
  if (!player) return;
  if (constructionMode) {
    camera.up.set(0, 0, -1);
    camera.position.set(constructionCenter.x, 120, constructionCenter.z);
    camera.lookAt(constructionCenter.x, 0, constructionCenter.z);
    placeSun(); return;
  }
  camera.up.set(0, 1, 0);
  camera.position.set(player.position.x, 1.62, player.position.z);
  camera.lookAt(player.position.x + Math.sin(yaw), 1.62 + Math.sin(pitch), player.position.z - Math.cos(yaw));
  placeSun();
}
function frameZone() {
  const meta = world.manager.route[world.manager.index];
  // Every room of the route is covered: there the ceiling light replaces the sun.
  luz.salas(world.manager.route.map(({ center: [x, z], width, depth }) => [x - width / 2, z - depth / 2, x + width / 2, z + depth / 2]));
  if (!player) player = new PlayerController(world.manager, { freeRoam: true });
  player.manager = world.manager; player.reset(meta);
  const viewpoint = { D00: [0, 16], D02: [-9.2, .6], D03: [5.9, -3.6], D04: [-10.6, 1.5], D05: [0, -6.4], D06: [6.6, 0], A00: [-5, 0], A01: [5.4, -5.4], A02: [-10.4, 0], A03: [-6.6, 0], A04: [1, -5.6], A05: [-5.6, 0] }[meta.id];
  if (viewpoint) { player.position.x += viewpoint[0]; player.position.z += viewpoint[1]; }
  // Initial heading per zone (0 = north, PI / 2 = east): each view looks along the room's walk.
  yaw = { D02: 1.3, D03: Math.PI * 1.2, D04: Math.PI / 2, D05: Math.PI, D06: -Math.PI / 2, A00: Math.PI / 2, A01: Math.PI * 1.2, A02: Math.PI / 2, A03: Math.PI / 2, A04: Math.PI, A05: Math.PI / 2 }[meta.id] ?? 0;
  pitch = meta.id === 'D00' ? .05 : 0; aimCamera();
  updateJourney();
  audioSystem.setZone(meta.id);
}
function syncButtons() {
  $('#build-toggle').disabled = operation;
  $('#previous').disabled = operation || world.manager?.index <= 0;
  $('#next').disabled = operation || !world.manager || (world.manager.index >= world.manager.route.length - 1 && world.manager.route !== DEPARTURE_ROUTE);
  $('#next').textContent = world.manager?.route === DEPARTURE_ROUTE && world.manager.index === DEPARTURE_ROUTE.length - 1 ? 'Tomar vuelo →' : 'Siguiente →';
  for (const id of ['benchmark', 'world-test']) $(`#${id}`).disabled = operation;
}
async function guarded(fn) {
  if (operation) return;
  operation = true; $('#cover').hidden = false; syncButtons();
  try { await fn(); $('#status').textContent = 'Zona lista. Puedes continuar el viaje.'; }
  catch (error) { $('#status').textContent = `No se completó: ${error.message}. Puedes reintentar.`; console.error(error); }
  finally { operation = false; $('#cover').hidden = true; syncButtons(); }
}
async function move(id) { await world.manager.enter(id); frameZone(); restoreMovablePositions(); }
$('#previous').onclick = () => guarded(() => move(world.manager.route[world.manager.index - 1].id));
$('#next').onclick = () => guarded(async () => {
  if (world.manager.route === DEPARTURE_ROUTE && world.manager.index === DEPARTURE_ROUTE.length - 1) {
    await world.switchRoute(ARRIVAL_ROUTE); frameZone();
  } else await move(world.manager.route[world.manager.index + 1].id);
});
$('#sound').onclick = async () => {
  try {
    if (audioSystem.enabled) { await audioSystem.disable(); $('#sound').textContent = 'Activar sonido'; }
    else { await audioSystem.enable(); $('#sound').textContent = 'Silenciar'; }
  } catch (error) { $('#status').textContent = `Audio no disponible: ${error.message}`; }
};
window.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Escape' && selectedBase) { releaseBase(); return; }
  if (selectedBase && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.code)) {
    event.preventDefault(); nudgeBase(event.code, event.shiftKey); return;
  }
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) {
    event.preventDefault(); held.add(event.code);
  }
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());
renderer.domElement.addEventListener('pointerdown', event => { if (constructionMode || event.button !== 0) return; drag = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); });
renderer.domElement.addEventListener('pointermove', event => {
  if (constructionMode) {
    if (creationDrag) {
      const units = constructionHeight / renderer.domElement.clientHeight;
      constructionCenter.x -= (event.clientX - creationDrag.x) * units;
      constructionCenter.z -= (event.clientY - creationDrag.y) * units;
      creationDrag = { x: event.clientX, y: event.clientY }; aimCamera();
    }
    updateWallPreview(event); return;
  }
  if (!drag) return;
  yaw += (event.clientX - drag.x) * .004;
  pitch = Math.max(-.72, Math.min(.72, pitch - (event.clientY - drag.y) * .004));
  drag = { x: event.clientX, y: event.clientY }; aimCamera();
});
renderer.domElement.addEventListener('pointerup', () => { drag = null; creationDrag = null; });
renderer.domElement.addEventListener('pointercancel', () => { drag = null; creationDrag = null; });
$('#quality').onchange = e => performanceController.set(e.target.value);
// --- Luz y estilo: ambiente (hora del día) y contorno cartoon ---
// Preferencias de visualización de este navegador; la URL (?amb=noche) manda.
const LIGHT_KEY = 'aeropuerto.luz.v1';
let lightPrefs = {};
try { lightPrefs = JSON.parse(localStorage.getItem(LIGHT_KEY) || '{}') || {}; } catch { lightPrefs = {}; }
function saveLightPrefs() { try { localStorage.setItem(LIGHT_KEY, JSON.stringify(lightPrefs)); } catch { /* almacenamiento no disponible */ } }
for (const [key, A] of Object.entries(AMBIENTES)) $('#ambiente').append(new Option(A.nombre, key));
function setAmbience(key) {
  if (!AMBIENTES[key]) return;
  luz.usarAmbiente(key); $('#ambiente').value = key;
  lightPrefs.ambiente = key; saveLightPrefs();
}
function setOutline({ enabled = lightPrefs.contorno ?? true, width = lightPrefs.grosor ?? 1.4 } = {}) {
  luz.contorno({ activo: enabled, grosor: width });
  $('#contorno').checked = enabled; $('#grosor').value = width; $('#grosor').disabled = !enabled;
  $('#grosor-valor').textContent = `${Number(width).toFixed(1)} px`;
  lightPrefs.contorno = enabled; lightPrefs.grosor = width; saveLightPrefs();
}
$('#ambiente').onchange = e => setAmbience(e.target.value);
$('#contorno').onchange = e => setOutline({ enabled: e.target.checked });
$('#grosor').oninput = e => setOutline({ width: Number(e.target.value) });
setAmbience(new URLSearchParams(location.search).get('amb') || lightPrefs.ambiente || 'manana');
setOutline();
function setFloorGloss(on = lightPrefs.reflejo ?? true) {
  setGlossyFloors(on); $('#reflejo').checked = on;
  lightPrefs.reflejo = on; saveLightPrefs();
}
$('#reflejo').onchange = e => setFloorGloss(e.target.checked);
setFloorGloss();
// ?dev exposes the scene for inspection from the browser console.
if (new URLSearchParams(location.search).has('dev')) window.__airport = { scene, renderer, camera, sun, luz, editor,
  // Dev only: place the walker at world (x, z) looking along yaw (0 = north).
  view(x, z, y = yaw, p = 0) { player.position.x = x; player.position.z = z; yaw = y; pitch = p; aimCamera(); },
  // Dev only: lo que necesita herramientas/capturar-portales (dev/capturar-portales.js).
  get world() { return world; }, move, resize,
  async cambiarRuta(route) { await world.switchRoute(route); frameZone(); } };

$('#auto').onchange = e => { performanceController.auto = e.target.checked; };
$('#debug').onchange = e => { $('#metrics').hidden = !e.target.checked; };
const raycaster = new T.Raycaster();
const constructionGround = new T.Plane(new T.Vector3(0, 1, 0), -.03);
const constructedWallMaterial = new T.MeshBasicMaterial({ color: 0xf4e7c8 });
const constructedWallGeometry = new T.BoxGeometry(1, 3.2, .24);
function groundPoint(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const point = new T.Vector3(); return raycaster.ray.intersectPlane(constructionGround, point) ? point : null;
}
function drawWall(a, b, persist = true) {
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (!validWall(a, b)) return false;
  if (wallRecords.some(w => (Math.hypot(w.a[0] - a.x, w.a[1] - a.z) < .001 && Math.hypot(w.b[0] - b.x, w.b[1] - b.z) < .001)
    || (Math.hypot(w.b[0] - a.x, w.b[1] - a.z) < .001 && Math.hypot(w.a[0] - b.x, w.a[1] - b.z) < .001))) return false;
  const wall = new T.Mesh(constructedWallGeometry, constructedWallMaterial);
  wall.scale.x = length;
  wall.position.set((a.x + b.x) / 2, 1.6, (a.z + b.z) / 2);
  wall.rotation.y = -Math.atan2(dz, dx); wall.name = 'muro-construido';
  wall.userData.endpoints = { a: [a.x, a.z], b: [b.x, b.z] };
  builtWallGroup.add(wall);
  wallRecords.push({ mesh: wall, a: [a.x, a.z], b: [b.x, b.z] });
  $('#wall-undo').disabled = false;
  if (persist) saveBuiltWalls();
  return true;
}
const wallRecords = [];
function saveBuiltWalls() {
  try { localStorage.setItem(BUILT_WALLS_KEY, JSON.stringify(wallRecords.map(({ a, b }) => ({ a, b })))); }
  catch { $('#build-help').textContent = 'Muro colocado; el navegador no permitió guardarlo.'; }
}
try {
  for (const item of JSON.parse(localStorage.getItem(BUILT_WALLS_KEY) || '[]')) {
    if (Array.isArray(item.a) && Array.isArray(item.b)) drawWall({ x: item.a[0], z: item.a[1] }, { x: item.b[0], z: item.b[1] }, false);
  }
} catch { /* un archivo local dañado no impide abrir el aeropuerto */ }
wallPreview = new T.Mesh(constructedWallGeometry,
  new T.MeshBasicMaterial({ color: 0xe5ad55, transparent: true, opacity: .58 }));
wallPreview.visible = false; builtWallGroup.add(wallPreview);
const snapMarker = new T.Mesh(new T.RingGeometry(.16, .24, 24), new T.MeshBasicMaterial({ color: 0x34d9ca, depthTest: false, side: T.DoubleSide }));
snapMarker.rotation.x = -Math.PI / 2; snapMarker.renderOrder = 20; snapMarker.visible = false; builtWallGroup.add(snapMarker);
const startMarker = snapMarker.clone(); startMarker.material = snapMarker.material.clone(); startMarker.material.color.set(0xe5ad55); builtWallGroup.add(startMarker);
const draftingHelp = 'Clic para empezar · ajuste a extremos y paredes · Alt: ángulo libre';
function draftPoint(event) {
  const point = groundPoint(event); if (!point) return null;
  const walls = [...wallRecords];
  for (const record of world.manager?.records.values() || []) if (record.chunk?.root.visible) {
    walls.push(...(record.chunk.snapWalls || []), ...(record.chunk.detail?.userData.snapWalls || []));
  }
  // Continue perpendicular to the existing wall, including old walls drawn at arbitrary angles.
  let direction = wallDirection;
  if (wallStart && !direction) {
    const connected = walls.find(w => Math.hypot(w.a[0] - wallStart.x, w.a[1] - wallStart.z) < .01 || Math.hypot(w.b[0] - wallStart.x, w.b[1] - wallStart.z) < .01
      || Math.abs((wallStart.x - w.a[0]) * (w.b[1] - w.a[1]) - (wallStart.z - w.a[1]) * (w.b[0] - w.a[0])) < .001
        && wallStart.x >= Math.min(w.a[0], w.b[0]) && wallStart.x <= Math.max(w.a[0], w.b[0]) && wallStart.z >= Math.min(w.a[1], w.b[1]) && wallStart.z <= Math.max(w.a[1], w.b[1]));
    if (connected) direction = { x: connected.b[0] - connected.a[0], z: connected.b[1] - connected.a[1] };
  }
  return snapWallPoint(point, { walls, start: wallStart, direction, tolerance: Math.min(1, constructionHeight / renderer.domElement.clientHeight * 12), free: event.altKey });
}
function updateWallPreview(event) {
  creationPointer = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
  const point = draftPoint(event);
  snapMarker.visible = !!point && constructionMode;
  if (point) {
    const scale = constructionHeight / renderer.domElement.clientHeight * 18;
    snapMarker.scale.setScalar(scale); snapMarker.position.set(point.x, 3.24, point.z);
    snapMarker.material.color.set(point.snapped ? 0x34d9ca : 0xe5ad55);
  }
  if (!point || !wallStart) { wallPreview.visible = false; return; }
  const dx = point.x - wallStart.x, dz = point.z - wallStart.z, length = Math.hypot(dx, dz);
  wallPreview.visible = length >= .1;
  wallPreview.scale.x = Math.max(length, .1);
  wallPreview.position.set((point.x + wallStart.x) / 2, 1.6, (point.z + wallStart.z) / 2);
  wallPreview.rotation.y = -Math.atan2(dz, dx);
  $('#build-help').textContent = `${length.toFixed(2)} m · ${point.snapped ? 'Unión exacta' : event.altKey ? 'Ángulo libre' : 'Recto / perpendicular'} · clic para colocar · Esc para terminar`;
}
function finishWallDraft() {
  wallStart = null; wallDirection = null; wallPreview.visible = false; startMarker.visible = false;
  $('#build-help').textContent = draftingHelp;
}
function undoBuiltWall() {
  finishWallDraft();
  const last = wallRecords.pop(); if (!last) return;
  builtWallGroup.remove(last.mesh); saveBuiltWalls(); $('#wall-undo').disabled = !wallRecords.length;
}
function setConstructionMode(on) {
  if (constructionMode === on || !player || operation) return;
  constructionMode = on; finishWallDraft(); snapMarker.visible = false; drag = null; creationDrag = null; creationPointer = null;
  constructedWallMaterial.color.set(on ? 0x245c51 : 0xf4e7c8);
  $('#build-toggle').setAttribute('aria-pressed', String(on));
  $('#build-toggle').textContent = on ? 'Modo creación activo' : 'Modo creación';
  $('#build-panel').hidden = !on; viewport.classList.toggle('building', on);
  held.clear();
  $('#help-overlay').textContent = on ? 'WASD: desplazar plano · arrastra con botón derecho: mover · rueda: zoom · Alt: ángulo libre' : 'WASD para moverte · arrastra para mirar';
  $('#wall-undo').disabled = !wallRecords.length;
  if (on) {
    if (selectedBase) releaseBase();
    editMenu.hidden = true;
    constructionPose = { camera, yaw, pitch, far: camera.far };
    constructionCenter.x = player.position.x; constructionCenter.z = player.position.z;
    scene.traverse(node => { if (node.userData.creationRoof) { creationRoofs.set(node, node.visible); node.visible = false; } });
    camera = constructionCamera; world.camera = camera;
    constructionHeight = 78;
    $('#build-help').textContent = draftingHelp;
    camera.far = 500; resize();
  } else if (constructionPose) {
    for (const [roof, visible] of creationRoofs) roof.visible = visible;
    creationRoofs.clear();
    yaw = constructionPose.yaw; pitch = constructionPose.pitch;
    camera = constructionPose.camera; world.camera = camera; camera.far = constructionPose.far;
    camera.updateProjectionMatrix(); constructionPose = null; resize();
    $('#build-help').textContent = '';
    refreshEditMenu();
  }
  aimCamera();
}
$('#build-toggle').onclick = () => setConstructionMode(!constructionMode);
$('#build-exit').onclick = () => setConstructionMode(false);
$('#wall-undo').onclick = undoBuiltWall;
$('#wall-finish').onclick = finishWallDraft;
renderer.domElement.addEventListener('pointerdown', event => {
  if (!constructionMode || operation) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.button === 1 || event.button === 2) {
    creationDrag = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); return;
  }
  if (event.button !== 0) return;
  const point = draftPoint(event); if (!point) return;
  if (!wallStart) {
    wallStart = point; $('#build-help').textContent = 'Ahora haz clic donde termina el muro';
  } else {
    if (!drawWall(wallStart, point)) { $('#build-help').textContent = 'Tramo demasiado corto o ya existente; elige otro extremo'; return; }
    wallDirection = { x: point.x - wallStart.x, z: point.z - wallStart.z };
    wallStart = $('#wall-chain').checked ? point : null;
    if (!wallStart) finishWallDraft();
    else $('#build-help').textContent = 'Muro colocado · continúa desde este extremo · Esc para terminar';
    wallPreview.visible = false;
  }
  startMarker.visible = !!wallStart;
  if (wallStart) { startMarker.position.set(wallStart.x, 3.25, wallStart.z); startMarker.scale.copy(snapMarker.scale); }
}, true);
renderer.domElement.addEventListener('wheel', event => {
  if (!constructionMode) return;
  event.preventDefault(); const before = groundPoint(event);
  constructionHeight = Math.max(6, Math.min(220, constructionHeight * Math.exp(event.deltaY * .001)));
  resize(); aimCamera();
  const after = groundPoint(event);
  if (before && after) { constructionCenter.x += before.x - after.x; constructionCenter.z += before.z - after.z; aimCamera(); }
  updateWallPreview(event);
}, { passive: false });
window.addEventListener('keydown', event => {
  if (constructionMode && ['Escape', 'Enter'].includes(event.code)) { event.preventDefault(); finishWallDraft(); }
});
renderer.domElement.addEventListener('click', event => {
  if (operation || editMode || constructionMode) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const active = world.manager?.records.get(world.manager.current)?.chunk;
  const hit = active && raycaster.intersectObjects(active.interactive, false)[0];
  if (hit) {
    $('#status').textContent = OBJECT_NAMES[hit.object.userData.semanticId] || hit.object.userData.semanticId;
    if (/metalDetector|boardingPassScanner/.test(hit.object.userData.semanticId)) audioSystem.beep();
  }
});
// --- Objetos movibles: clic derecho selecciona, flechas mueven ---
// Cualquier objeto etiquetado `userData.movable` (palmeras y sus bases por
// separado, jardineras, arbustos, tótems, bolardos, nubes, árboles lejanos).
// Sin mouse para mover: ← → ↑ ↓ desplazan en el plano del suelo (respecto a
// la cámara), PageUp/PageDown ajustan la altura, Shift = paso fino, Esc suelta.
let selectedBase = null;
const baseMarker = new T.LineSegments(
  new T.EdgesGeometry(new T.BoxGeometry(2, .9, 1.5)),
  new T.LineBasicMaterial({ color: 0xffc94d, depthTest: false, transparent: true, opacity: .95 }));
baseMarker.renderOrder = 999;
baseMarker.visible = false;
scene.add(baseMarker);
const markerAt = new T.Vector3();
// --- Persistencia: las posiciones ajustadas se guardan solas en localStorage
// y se restauran al recargar. La clave de cada objeto es `etiqueta#índice`,
// donde el índice es su orden en el recorrido determinista de la escena.
const POSITIONS_KEY = 'aeropuerto.movable-positions.v1';
function eachMovable(fn) {
  let index = 0;
  scene.traverse(node => {
    if (!node.userData?.movable || !node.parent) return;
    fn(node, `${node.userData.movable.label}#${index++}`);
  });
}
function applyPosition(node, target) {
  const delta = new T.Vector3(target.x - node.position.x, target.y - node.position.y, target.z - node.position.z);
  if (!delta.lengthSq()) return;
  node.position.copy(target);
  for (const follower of node.userData.movable?.followers || []) follower.position.add(delta);
  const box = node.userData.collider;
  if (box) {
    box.min.x += delta.x; box.min.z += delta.z;
    box.max.x += delta.x; box.max.z += delta.z;
  }
}
let savePositionsTimer = 0, lastSaved = {};
function scheduleSavePositions() {
  clearTimeout(savePositionsTimer);
  savePositionsTimer = setTimeout(() => {
    // Se parte de lo ya guardado: solo los movibles de la sala cargada están en escena.
    const data = { ...lastSaved };
    for (const k of Object.keys(data)) if (k.startsWith('obj:')) delete data[k];
    eachMovable((node, key) => {
      data[key] = { x: node.position.x, y: node.position.y, z: node.position.z };
      const e = node.userData.edit;
      if (e && (e.s !== 1 || e.r || e.d)) Object.assign(data[key], { s: +e.s.toFixed(4), r: e.r, d: e.d });
    });
    Object.assign(data, editor.exportar());
    lastSaved = data;
    try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(data)); } catch { /* almacenamiento no disponible */ }
    // Copia compartida en disco (serve.py): así cualquier navegador ve lo mismo.
    fetch(POSITIONS_FILE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data, null, 1) }).catch(() => {});
  }, 250);
}
const POSITIONS_FILE = new URL('posiciones.json', import.meta.url).href;
function restoreMovablePositions() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(POSITIONS_KEY) || 'null'); } catch { saved = null; }
  if (saved) applySavedPositions(saved);
  // El archivo del proyecto manda: es lo último guardado desde cualquier navegador.
  fetch(POSITIONS_FILE, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(file => {
    if (!file) { if (saved) scheduleSavePositions(); return; }
    applySavedPositions(file);
    try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(file)); } catch { /* almacenamiento no disponible */ }
  }).catch(() => {});
}
function applySavedPositions(saved) {
  lastSaved = { ...saved };
  editor.cargar(saved); prepareActiveRoom(true);
  eachMovable((node, key) => {
    const v = saved[key]; if (!v) return;
    applyPosition(node, new T.Vector3(v.x, v.y, v.z));
    setEdit(node, { s: v.s ?? 1, r: v.r ?? 0, d: !!v.d });
  });
}
// Sala activa: analiza su mobiliario (una vez) para poder editarlo.
function prepareActiveRoom(reapply) {
  const chunk = world.manager?.records.get(world.manager.current)?.chunk, detail = chunk?.detail;
  if (!detail?.visible) return null;
  const fresh = !editor.analizados.has(detail);
  const info = editor.preparar(world.manager.current, detail, chunk.colliders, chunk.root);
  if (!fresh && reapply) editor.reaplicar(detail);
  return info;
}
editor.alCambiar = () => scheduleSavePositions();
// --- Modo edición: escala, giro de 90° y eliminación de objetos movibles.
// El estado (s, r, d) va junto a la posición; el objeto eliminado se oculta
// pero sigue en la escena para no desplazar los índices guardados.
const editState = node => node.userData.edit ||= { s: 1, r: 0, d: false };
function setEdit(node, { s, r, d }) {
  const e = editState(node), origin = node.position;
  const ratio = s / e.s, delta = (r - e.r) * Math.PI / 2;
  if (ratio !== 1 || delta) {
    node.scale.multiplyScalar(ratio); node.rotateY(delta);
    for (const f of node.userData.movable?.followers || []) {
      const off = f.position.clone().sub(origin).multiplyScalar(ratio).applyAxisAngle(new T.Vector3(0, 1, 0), delta);
      f.position.copy(origin).add(off); f.scale.multiplyScalar(ratio); f.rotateY(delta);
    }
    const box = node.userData.collider;
    if (box && !box.isEmpty()) {
      const c = box.getCenter(new T.Vector3()), h = box.getSize(new T.Vector3()).multiplyScalar(.5 * ratio);
      if (Math.abs(r - e.r) % 2) [h.x, h.z] = [h.z, h.x];
      box.min.set(c.x - h.x, box.min.y, c.z - h.z); box.max.set(c.x + h.x, box.max.y, c.z + h.z);
    }
    e.s = s; e.r = r;
  }
  if (d !== e.d) {
    node.visible = !d; for (const f of node.userData.movable?.followers || []) f.visible = !d;
    const box = node.userData.collider; if (box && d) { e.box = box.clone(); box.makeEmpty(); } else if (box && e.box) { box.copy(e.box); }
    e.d = d;
  }
}
function releaseBase(message) {
  selectedBase = null; baseMarker.visible = false; refreshEditMenu();
  $('#status').textContent = message || 'Objeto liberado. Zona lista.';
}
function nudgeBase(code, fine) {
  const base = selectedBase;
  if (!(base?.isCluster ? editor.vivo(base) : base?.parent)) { releaseBase(); return; }
  const label = base.isCluster ? base.etiqueta : base.userData.movable?.label || 'objeto';
  const step = fine ? .01 : .05, lift = fine ? .002 : .01;
  const forward = new T.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new T.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const move = new T.Vector3();
  if (code === 'ArrowUp') move.add(forward);
  if (code === 'ArrowDown') move.sub(forward);
  if (code === 'ArrowRight') move.add(right);
  if (code === 'ArrowLeft') move.sub(right);
  if (move.lengthSq()) move.multiplyScalar(step);
  if (code === 'PageUp') move.y = lift;
  if (code === 'PageDown') move.y = -lift;
  if (!move.lengthSq()) return;
  if (base.isCluster) editor.mover(base, move); else { applyPosition(base, base.position.clone().add(move)); scheduleSavePositions(); }
  const p = base.isCluster ? editor.centroMundo(base) : base.position;
  $('#status').textContent = `${label}: x ${p.x.toFixed(2)} · y ${p.y.toFixed(3)} · z ${p.z.toFixed(2)} — ←→↑↓ mover · PageUp/PageDown altura · Shift fino · Esc soltar`;
}

let editMode = false;
const editMenu = $('#edit-menu');
function refreshEditMenu() {
  editMenu.hidden = !editMode;
  const e = selectedBase && (selectedBase.isCluster ? selectedBase : selectedBase.userData.edit);
  $('#edit-name').textContent = selectedBase ? `${selectedBase.isCluster ? selectedBase.etiqueta : selectedBase.userData.movable?.label || 'objeto'}${e && e.s !== 1 ? ` · ×${e.s.toFixed(2)}` : ''}` : 'Toca un objeto para editarlo';
  for (const b of editMenu.querySelectorAll('#edit-tools button')) b.disabled = !selectedBase && b.dataset.act !== 'done';
}
function pickMovable(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const detail = editMode ? world.manager?.records.get(world.manager.current)?.chunk?.detail : null;
  if (detail) prepareActiveRoom();
  for (const hit of raycaster.intersectObjects(scene.children, true)) {
    for (let node = hit.object; node; node = node.parent) if (node.userData?.movable && node.visible) return node;
    const cluster = detail && editor.deImpacto(detail, hit.object, hit.instanceId);
    if (cluster && !cluster.d) return cluster;
  }
  return null;
}
function selectBase(base) {
  selectedBase = base; held.clear();
  const label = base.isCluster ? base.etiqueta : base.userData.movable?.label || 'objeto';
  $('#status').textContent = `${label} seleccionado — ←→↑↓ mover · PageUp/PageDown altura · Shift fino · Esc soltar`;
  refreshEditMenu();
}
$('#edicion').onchange = e => { editMode = e.target.checked; if (!editMode && selectedBase) releaseBase(); else refreshEditMenu(); };
$('#edit-reset').onclick = () => {
  if (!confirm('¿Restaurar todos los objetos eliminados, tamaños y giros? (las posiciones se conservan)')) return;
  const data = {};
  for (const [k, v] of Object.entries(lastSaved)) if (!k.startsWith('obj:')) data[k] = { x: v.x, y: v.y, z: v.z };
  eachMovable((node, key) => { data[key] = { x: node.position.x, y: node.position.y, z: node.position.z }; });
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
  fetch(POSITIONS_FILE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data, null, 1) }).finally(() => location.reload());
};
editMenu.onclick = event => {
  const act = event.target.closest('button')?.dataset.act;
  if (!act) return;
  if (act === 'done') { releaseBase(); return; }
  const node = selectedBase; if (!node) return;
  if (node.isCluster) {
    if (act === 'bigger') editor.escalar(node, 1.15);
    if (act === 'smaller') editor.escalar(node, 1 / 1.15);
    if (act === 'rotl') editor.girar(node, -1);
    if (act === 'rotr') editor.girar(node, 1);
    if (act === 'delete') { const label = node.etiqueta; editor.borrar(node); releaseBase(`${label} eliminado.`); }
    refreshEditMenu(); return;
  }
  const e = editState(node);
  if (act === 'bigger') setEdit(node, { ...e, s: Math.min(e.s * 1.15, 6) });
  if (act === 'smaller') setEdit(node, { ...e, s: Math.max(e.s / 1.15, .2) });
  if (act === 'rotl') setEdit(node, { ...e, r: e.r - 1 });
  if (act === 'rotr') setEdit(node, { ...e, r: e.r + 1 });
  if (act === 'delete') { const label = node.userData.movable?.label; setEdit(node, { ...e, d: true }); releaseBase(`${label || 'Objeto'} eliminado.`); }
  scheduleSavePositions(); refreshEditMenu();
};
// Un toque (sin arrastrar) en modo edición selecciona; sobre el vacío suelta.
let downAt = null;
renderer.domElement.addEventListener('pointerdown', event => { downAt = { x: event.clientX, y: event.clientY }; }, true);
renderer.domElement.addEventListener('click', event => {
  if (!editMode || constructionMode || operation || !downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) return;
  const base = pickMovable(event);
  if (base) selectBase(base); else if (selectedBase) releaseBase('Objeto liberado.');
});
  renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (operation || constructionMode) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const base = pickMovable(event);
  if (!base) { if (selectedBase) releaseBase(); return; }
  selectBase(base);
});
function snapshot() {
  return { at: new Date().toISOString(), quality: performanceController.name, viewport: [renderer.domElement.clientWidth, renderer.domElement.clientHeight], dpr: renderer.getPixelRatio(), ...performanceController.last, render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, zones: world.manager?.snapshot(), assets: world.registry.snapshot(), perspective: 'first-person', npc3d: 0 };
}
async function settleRender() {
  for (let i = 0; i < 12; i++) {
    world.manager.update(1 / 60, camera, performanceController.profile);
    renderer.render(scene, camera);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
$('#benchmark').onclick = () => guarded(async () => {
  const route = world.manager.route;
  measurements.length = 0;
  while (world.manager.index > 0) await move(world.manager.route[world.manager.index - 1].id);
  const forward = route.slice(1).map(z => z.id), backward = route.slice(0, -1).reverse().map(z => z.id);
  const circuit = [...forward, ...backward];
  // Shared texture atlas and exterior maps upload lazily. Warm every zone once,
  // then compare resident resources after an identical second circuit.
  for (const id of circuit) { await move(id); await settleRender(); }
  measurements.push({ phase: 'baseline', ...snapshot() });
  for (let step = 0; step < circuit.length; step++) {
    const id = circuit[step];
    await move(id); await settleRender();
    const s = snapshot();
    if (s.zones.filter(z => z.loaded).length > 3 || s.zones.filter(z => z.state === 'ACTIVE_HIGH').length !== 1) throw Error('Streaming invariant failed');
    measurements.push({ phase: 'transition', step, ...s });
  }
  const first = measurements.findLast(s => s.phase === 'baseline'), last = measurements.at(-1);
  if (first.memory.geometries !== last.memory.geometries || first.memory.textures !== last.memory.textures) {
    $('#report').textContent = JSON.stringify({ baseline: first.memory, final: last.memory, zones: last.zones }, null, 2);
    throw Error(`Los recursos GPU no volvieron al inicio: geometrías ${first.memory.geometries}→${last.memory.geometries}; texturas ${first.memory.textures}→${last.memory.textures}`);
  }
  $('#events').textContent += `\n[PASS] ${circuit.length} transiciones; recursos GPU regresan al nivel inicial. Esta prueba no mide FPS sostenidos.`;
  $('#report').textContent = JSON.stringify({ measurements }, null, 2);
});
$('#world-test').onclick = () => guarded(async () => {
  await world.switchRoute(ARRIVAL_ROUTE); frameZone(); renderer.render(scene, camera);
  measurements.push({ phase: 'arrival-start', ...snapshot() });
  await world.switchRoute(DEPARTURE_ROUTE); frameZone(); renderer.render(scene, camera); measurements.push({ phase: 'departure-restored', ...snapshot() });
  $('#report').textContent = JSON.stringify({ measurements }, null, 2);
});
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ three: T.REVISION, scope: 'airport-first-person-2.5d', measurements, current: snapshot(), events: history }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'airport-engine-measurements.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function animate(now) {
  if (stopped) return;
  const raw = (now - lastTime) / 1000; lastTime = now;
  if (player && !operation && !player.busy) {
    const dx = Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft'));
    const dz = Number(held.has('KeyS') || held.has('ArrowDown')) - Number(held.has('KeyW') || held.has('ArrowUp'));
    if (dx || dz) {
      const speed = constructionMode ? Math.max(14, constructionHeight * .45) : 3.2;
      const distance = Math.min(raw, .05) * speed / Math.hypot(dx, dz);
      if (constructionMode) {
        constructionCenter.x += dx * distance; constructionCenter.z += dz * distance;
        aimCamera(); if (creationPointer) updateWallPreview(creationPointer);
      } else void player.step((dx * Math.cos(yaw) + dz * Math.sin(yaw)) * distance,
        (dx * Math.sin(yaw) - dz * Math.cos(yaw)) * distance).then(crossed => { if (crossed) {
        updateJourney(); audioSystem.setZone(world.manager.current);
        $('#status').textContent = 'Zona lista. Puedes continuar el viaje.'; syncButtons();
      } }).catch(error => { held.clear(); $('#status').textContent = `La siguiente zona no está lista: ${error.message}`; });
    }
    aimCamera();
  }
  world.manager?.update(Math.min(raw, .05), camera, performanceController.profile);
  prepareActiveRoom();
  if (selectedBase) {
    if (!(selectedBase.isCluster ? editor.vivo(selectedBase) : selectedBase.parent)) releaseBase();
    else {
      if (selectedBase.isCluster) {
        const c = selectedBase, t = c.caja.getSize(new T.Vector3()).multiplyScalar(c.s), odd = c.r % 2 !== 0;
        editor.centroMundo(c, markerAt);
        baseMarker.scale.set(((odd ? t.z : t.x) + .15) / 2, (t.y + .1) / .9, ((odd ? t.x : t.z) + .15) / 1.5);
        baseMarker.position.copy(markerAt);
      } else {
        selectedBase.getWorldPosition(markerAt);
        baseMarker.scale.set(1, 1, 1);
        baseMarker.position.set(markerAt.x, markerAt.y + .45, markerAt.z);
      }
      baseMarker.visible = true;
    }
  }
  renderer.render(scene, camera); performanceController.sample(raw, renderer.info);
  displayTimer += raw;
  if (displayTimer >= .5) {
    displayTimer = 0; const m = performanceController.last;
    $('#metrics').textContent = `${performanceController.name} · Three r${T.REVISION}\nFPS ${m.fps?.toFixed(1) || '—'} · frame ${m.frameMs?.toFixed(1) || '—'} ms\nP95 ${m.p95Ms?.toFixed(1) || '—'} ms\nDraw calls ${renderer.info.render.calls} / 90\nTriángulos ${renderer.info.render.triangles.toLocaleString()}\nGeometrías ${renderer.info.memory.geometries} · Texturas ${renderer.info.memory.textures}\nActual ${world.manager?.current || '—'}\nCargados ${world.manager?.snapshot().filter(z => z.loaded).map(z => z.id).join(', ') || '—'}\nNPC 3D 0\nLeases ${world.registry.snapshot().reduce((n, e) => n + e.refs, 0)}`;
  }
  requestAnimationFrame(animate);
}
renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); $('#status').textContent = 'Se perdió el contexto WebGL. Recarga el laboratorio para reconstruir los recursos.'; });
window.addEventListener('pagehide', () => { stopped = true; resizeObserver.disconnect(); skyTexture.dispose(); void audioSystem.dispose(); void world.dispose().finally(() => renderer.dispose()); }, { once: true });
requestAnimationFrame(animate);
await guarded(async () => { await world.switchRoute(DEPARTURE_ROUTE); frameZone(); });
// Restaurar las posiciones ajustadas por el usuario (nada guardado = no-op) y
// repetir pasado un momento por si las palmeras GLB aún estaban cargando.
restoreMovablePositions();
setTimeout(restoreMovablePositions, 3000);
