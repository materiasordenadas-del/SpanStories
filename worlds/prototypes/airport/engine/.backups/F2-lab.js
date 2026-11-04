import * as T from './engine/three.js';
import { AirportWorld } from './engine/AirportWorld.js';
import { PerformanceController } from './engine/PerformanceController.js';
import { PlayerController } from './engine/PlayerController.js';
import { AirportAudioSystem } from './engine/AirportAudioSystem.js';
import { DEPARTURE_ROUTE, ARRIVAL_ROUTE } from './engine/routes.js';
import { luz, AMBIENTES } from './engine/Luz25D.js';
import { setGlossyFloors } from './engine/GlossyFloor.js';

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
}
const skyTexture = new T.CanvasTexture(skyCanvas); skyTexture.colorSpace = T.SRGBColorSpace; skyTexture.mapping = T.EquirectangularReflectionMapping; scene.background = skyTexture;   // world-fixed sky dome, not a screen overlay
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
const camera = new T.PerspectiveCamera(52, 1, .08, 80);
luz.alCambiar(A => { paintSky(A); sunAnchorX = NaN; placeSun(); });
let yaw = 0, pitch = 0, drag = null;
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
  camera.far = profile.far; camera.updateProjectionMatrix(); resize();
  $('#quality').value = performanceController.name;
});
function resize() {
  const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
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
  camera.position.set(player.position.x, 1.62, player.position.z);
  camera.lookAt(player.position.x + Math.sin(yaw), 1.62 + Math.sin(pitch), player.position.z - Math.cos(yaw));
  placeSun();
}
function frameZone() {
  const meta = world.manager.route[world.manager.index];
  // Every room of the route is covered: there the ceiling light replaces the sun.
  luz.salas(world.manager.route.map(({ center: [x, z], width, depth }) => [x - width / 2, z - depth / 2, x + width / 2, z + depth / 2]));
  if (!player) player = new PlayerController(world.manager);
  player.manager = world.manager; player.reset(meta);
  const viewpoint = { D00: [0, 16], D02: [-9.2, .6], D03: [5.9, -3.6], D05: [-8.5, 1.8], A04: [6.5, 2] }[meta.id];
  if (viewpoint) { player.position.x += viewpoint[0]; player.position.z += viewpoint[1]; }
  yaw = ['D05', 'A00', 'A04', 'A05'].includes(meta.id) ? Math.PI : meta.id === 'D02' ? 1.3 : meta.id === 'D03' ? Math.PI * 1.2 : 0;
  pitch = meta.id === 'D00' ? .05 : 0; aimCamera();
  updateJourney();
  audioSystem.setZone(meta.id);
}
function syncButtons() {
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
renderer.domElement.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); });
renderer.domElement.addEventListener('pointermove', event => {
  if (!drag) return;
  yaw += (event.clientX - drag.x) * .004;
  pitch = Math.max(-.72, Math.min(.72, pitch - (event.clientY - drag.y) * .004));
  drag = { x: event.clientX, y: event.clientY }; aimCamera();
});
renderer.domElement.addEventListener('pointerup', () => { drag = null; });
renderer.domElement.addEventListener('pointercancel', () => { drag = null; });
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
if (new URLSearchParams(location.search).has('dev')) window.__airport = { scene, renderer, camera, sun, luz,
  // Dev only: place the walker at world (x, z) looking along yaw (0 = north).
  view(x, z, y = yaw, p = 0) { player.position.x = x; player.position.z = z; yaw = y; pitch = p; aimCamera(); } };

// --- Popup de aprobación por fases (no bloquea: el contenedor deja pasar el
// ratón; WASD/arrastre siguen activos para acercarse y revisar el cambio). ---
const PHASES = [
  { id: 1, title: 'Fase 1 · Pared del fondo', text: 'Paneles marfil, listones metálicos con brillo de arista, zócalo, franja azul proyectada, línea amarilla fina, luz cálida real bajo la franja y madera de information renovada.',
    views: { 'Sala': [-19, 4.2, 0, .02], 'Franja y luz': [-16.3, -1.2, 0, .14], 'Madera': [-23.5, -1.4, 0, .02] },
    files: ['engine/EntranceHall.js', 'engine/AirportChunk.js'] },
  { id: 2, title: 'Fase 2 · Kiosco / pantalla', text: 'Kiosco físico en tres capas (display hundido, vidrio con reflejo, marco) y pantalla FIDS viva: contenido dinámico con animación lenta.',
    views: { 'Kiosco': [-15.6, -2.0, .42, .06], 'Sala': [-19, 4.2, 0, .02] },
    files: ['engine/EntranceHall.js'] },
  { id: 3, title: 'Fase 3 · Papeleras', text: 'Papelera cilíndrica de acero satinado con tapa negra mejorada y nueva estación doble de reciclaje (módulo azul + gris) en el extremo derecho.',
    views: { 'Papeleras': [-14.3, -2.0, 0, .0], 'Sala': [-19, 4.2, 0, .02] },
    files: ['engine/EntranceHall.js'] },
  { id: 4, title: 'Fase 4 · Iluminación general', text: 'Menos ambiente plano: lámparas de techo más cálidas y dirigidas, sombras de contacto suaves bajo el mobiliario y más contraste en paredes.',
    views: { 'Sala': [-19, 4.2, 0, .02], 'Franja y luz': [-16.3, -1.2, 0, .14] },
    files: ['engine/Luz25D.js', 'engine/AirportChunk.js'] },
  { id: 5, title: 'Fase 5 · Ajuste final', text: 'Pasada comparativa final: jerarquía cromática, contraste, reflejos y microajustes de pared, madera, pantalla y papeleras.',
    views: { 'Sala': [-19, 4.2, 0, .02] },
    files: [] },
];
const PHASE_VOTES_KEY = 'aeropuerto.fases.v1';
let phaseVotes = {};
try { phaseVotes = JSON.parse(localStorage.getItem(PHASE_VOTES_KEY) || '{}') || {}; } catch { phaseVotes = {}; }
const savePhaseVotes = () => { try { localStorage.setItem(PHASE_VOTES_KEY, JSON.stringify(phaseVotes)); } catch { /* sin almacenamiento */ } };
const pp = $('#phase-pop'), ppTitle = $('#pp-title'), ppText = $('#pp-text'), ppViews = $('#pp-views'), ppVotes = $('#pp-votes'), ppChip = $('#pp-chip');
function renderPhaseVotes() {
  ppVotes.replaceChildren(...PHASES.map(P => {
    const chip = document.createElement('span');
    const v = phaseVotes[P.id];
    chip.textContent = `F${P.id} ${v === 'ok' ? '✔' : v === 'no' ? '✖' : '…'}`;
    if (v) chip.className = v;
    return chip;
  }));
}
function showPhase(id) {
  const P = PHASES.find(p => p.id === id);
  if (!P) { pp.hidden = true; ppChip.hidden = false; return; }
  ppTitle.dataset.id = P.id;
  ppTitle.textContent = P.title; ppText.textContent = P.text;
  ppViews.replaceChildren(...Object.entries(P.views).map(([label, v]) => {
    const b = document.createElement('button'); b.textContent = `👁 ${label}`;
    b.onclick = () => window.__airport?.view(...v);
    return b;
  }));
  renderPhaseVotes();
  pp.hidden = false; ppChip.hidden = true;
}
async function denyPhase(P) {
  $('#pp-deny').disabled = true; $('#pp-deny').textContent = '⟳ Revirtiendo…';
  for (const f of P.files) {
    try {
      const source = await (await fetch(`/Aeropuerto/${f.replace(/^engine\//, `engine/.backups/F${P.id}-`)}`, { cache: 'no-store' })).text();
      await fetch(`/Aeropuerto/${f}`, { method: 'PUT', body: source });
    } catch (error) { console.error('No se pudo revertir', f, error); }
  }
  location.reload();
}
$('#pp-approve').onclick = () => {
  const id = Number(ppTitle.dataset.id);
  phaseVotes[id] = 'ok'; savePhaseVotes();
  const next = PHASES.find(p => !phaseVotes[p.id]);
  if (next) showPhase(next.id); else { pp.hidden = true; ppChip.hidden = false; renderPhaseVotes(); }
  $('#status').textContent = `Fase ${id} aprobada.`;
};
$('#pp-deny').onclick = () => {
  const id = Number(ppTitle.dataset.id);
  const P = PHASES.find(p => p.id === id);
  phaseVotes[id] = 'no'; savePhaseVotes();
  if (P?.files.length) denyPhase(P); else { pp.hidden = true; ppChip.hidden = false; }
};
$('#pp-collapse').onclick = () => { pp.hidden = true; ppChip.hidden = false; };
ppChip.onclick = () => {
  const next = PHASES.find(p => !phaseVotes[p.id]) || PHASES[PHASES.length - 1];
  showPhase(next.id);
};
const showPhasePop = id => { const P = PHASES.find(p => p.id === id); if (P) ppTitle.dataset.id = P.id; showPhase(id); };
window.__phasePop = {
  show: showPhasePop,
  reset() { phaseVotes = {}; savePhaseVotes(); renderPhaseVotes(); showPhasePop(1); },
  votes() { return { ...phaseVotes }; },
};
showPhasePop(PHASES.find(p => !phaseVotes[p.id])?.id ?? 5);
$('#auto').onchange = e => { performanceController.auto = e.target.checked; };
$('#debug').onchange = e => { $('#metrics').hidden = !e.target.checked; };
const raycaster = new T.Raycaster();
renderer.domElement.addEventListener('click', event => {
  if (operation) return;
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
let savePositionsTimer = 0;
function scheduleSavePositions() {
  clearTimeout(savePositionsTimer);
  savePositionsTimer = setTimeout(() => {
    const data = {};
    eachMovable((node, key) => { data[key] = { x: node.position.x, y: node.position.y, z: node.position.z }; });
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
  eachMovable((node, key) => { if (saved[key]) applyPosition(node, new T.Vector3(saved[key].x, saved[key].y, saved[key].z)); });
}
function releaseBase(message) {
  selectedBase = null; baseMarker.visible = false;
  $('#status').textContent = message || 'Objeto liberado. Zona lista.';
}
function nudgeBase(code, fine) {
  const base = selectedBase;
  if (!base?.parent) { releaseBase(); return; }
  const label = base.userData.movable?.label || 'objeto';
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
  applyPosition(base, base.position.clone().add(move));
  scheduleSavePositions();
  const p = base.position;
  $('#status').textContent = `${label}: x ${p.x.toFixed(2)} · y ${p.y.toFixed(3)} · z ${p.z.toFixed(2)} — ←→↑↓ mover · PageUp/PageDown altura · Shift fino · Esc soltar`;
}
renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (operation) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  let base = null;
  for (const hit of raycaster.intersectObjects(scene.children, true)) {
    let node = hit.object;
    while (node) { if (node.userData?.movable) { base = node; break; } node = node.parent; }
    if (base) break;
  }
  if (!base) { if (selectedBase) releaseBase(); return; }
  selectedBase = base; held.clear();
  const label = base.userData.movable?.label || 'objeto';
  $('#status').textContent = `${label} seleccionado — ←→↑↓ mover · PageUp/PageDown altura · Shift fino · Esc soltar`;
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
      const distance = Math.min(raw, .05) * 3.2 / Math.hypot(dx, dz);
      void player.step((dx * Math.cos(yaw) + dz * Math.sin(yaw)) * distance,
        (dx * Math.sin(yaw) - dz * Math.cos(yaw)) * distance).then(crossed => { if (crossed) {
        updateJourney(); audioSystem.setZone(world.manager.current);
        $('#status').textContent = 'Zona lista. Puedes continuar el viaje.'; syncButtons();
      } }).catch(error => { held.clear(); $('#status').textContent = `La siguiente zona no está lista: ${error.message}`; });
    }
    aimCamera();
  }
  world.manager?.update(Math.min(raw, .05), camera, performanceController.profile);
  if (selectedBase) {
    if (!selectedBase.parent) releaseBase();
    else {
      selectedBase.getWorldPosition(markerAt);
      baseMarker.position.set(markerAt.x, markerAt.y + .45, markerAt.z);
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
