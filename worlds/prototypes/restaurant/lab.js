import * as T from './engine/three.js';
import { luz, AMBIENTES } from './engine/Luz25D.js';
import { crearKit, crearLote } from './engine/Kit.js';
import { construirCasco } from './engine/Arquitectura.js';
import { construirExterior } from './engine/Exterior.js';
import { construirRecepcion } from './engine/Recepcion.js';
import { construirComedor } from './engine/Comedor.js';
import { construirBanos } from './engine/Banos.js';
import { capturarEntorno, setReflejos } from './engine/Reflejos.js';
import { animarPuertas } from './engine/Puertas.js';
import { SALAS, CALLE, VISTAS, OJO, RADIO_JUGADOR, VENTANAS, VENTANA_Y } from './engine/config.js';
import { crearInterfaz } from './ui.js';

const $ = s => document.querySelector(s), viewport = $('#viewport');
const dev = new URLSearchParams(location.search).has('dev');

// ── Render ────────────────────────────────────────────────────────────────
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;       // exterior estático: la sombra se rehace solo al cambiar el sol
viewport.prepend(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(58, 1, .06, 90);

// Cielo pintado (equirectangular fijo al mundo), repintado por ambiente.
const skyCanvas = document.createElement('canvas'); skyCanvas.width = 1024; skyCanvas.height = 512;
const sky = skyCanvas.getContext('2d');
const skyTexture = new T.CanvasTexture(skyCanvas); skyTexture.colorSpace = T.SRGBColorSpace; skyTexture.mapping = T.EquirectangularReflectionMapping;
scene.background = skyTexture;
function pintarCielo(A) {
  const [arriba, medio, horizonte] = A.cielo, g = sky.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, arriba); g.addColorStop(.6, medio); g.addColorStop(1, horizonte);
  sky.fillStyle = g; sky.fillRect(0, 0, 1024, 512);
  if (A.estrellas) {
    sky.fillStyle = '#f4f1ff';
    for (let i = 0; i < 110; i++) { sky.globalAlpha = .4 + (i % 5) * .12; sky.beginPath(); sky.arc((i * 211.7) % 1024, (i * 97.3) % 220, i % 7 ? .9 : 1.7, 0, Math.PI * 2); sky.fill(); }
    sky.globalAlpha = 1;
    sky.fillStyle = '#fff6dc'; sky.beginPath(); sky.arc(700, 70, 13, 0, Math.PI * 2); sky.fill();
  }
  // nubes pintadas: bolas planas con la base en sombra fría
  for (let i = 0; i < 9; i++) {
    const x = (i * 131 + 40) % 1024, y = 120 + (i * 37) % 90, s = 26 + (i % 3) * 12;
    sky.fillStyle = A.nubes; sky.globalAlpha = A.estrellas ? .35 : .92;
    for (let k = 0; k < 5; k++) { sky.beginPath(); sky.ellipse(x + (k - 2) * s * .8, y - Math.sin(k * 1.3) * s * .35, s, s * .6, 0, 0, Math.PI * 2); sky.fill(); }
    sky.globalAlpha = A.estrellas ? .2 : .25; sky.fillStyle = '#9aa6c8'; sky.fillRect(x - s * 2.2, y + s * .2, s * 4.4, s * .25);
  }
  sky.globalAlpha = 1;
  skyTexture.needsUpdate = true;
}

// El sol solo proyecta la sombra (receptores «multiplicar» en acera y fachada).
const sol = new T.DirectionalLight(0xffffff, 1); scene.add(sol, sol.target);
sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: .5, far: 70 });
sol.shadow.bias = -.0002; sol.shadow.normalBias = .02;
function colocarSol() {
  const d = luz.direccionSol();
  sol.target.position.set(0, 0, 4); sol.position.set(d.x * 35, d.y * 35, 4 + d.z * 35);
  sol.target.updateMatrixWorld(); sol.updateMatrixWorld();
}

// ── Construcción de la escena ─────────────────────────────────────────────
const kit = crearKit();
const mundo = new T.Group(); scene.add(mundo);
const ctx = { kit, grupo: mundo, colisiones: [], pulsables: [], lamparas: [], puertas: [], animados: [], halos: [] };
const exterior = new T.Group(); mundo.add(exterior);
ctx.lote = crearLote(kit); ctx.grupo = exterior;
construirExterior(ctx);
ctx.lote.construir(exterior, ctx.pulsables);
exterior.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.name !== 'contorno' && o.name !== 'sombras' && !o.material?.isShadowMaterial) o.castShadow = true; });
ctx.grupo = mundo; ctx.lote = crearLote(kit);
construirCasco(ctx);
construirRecepcion(ctx);
construirComedor(ctx);
construirBanos(ctx);
ctx.lote.construir(mundo, ctx.pulsables);
luz.salas([[-10.1, -10.1, 10.1, .16]]);

// Manchas de sol que entran por los ventanales (decal que sigue al sol).
const manchas = [];
{
  const panos = [];
  for (const [x0, x1] of VENTANAS) {
    const partes = Math.max(1, Math.round((x1 - x0) / 1.1)), y0 = VENTANA_Y[0] + .06, y1 = VENTANA_Y[1] - .56;
    for (let k = 0; k < partes; k++) panos.push([x0 + (x1 - x0) * k / partes + .05, x0 + (x1 - x0) * (k + 1) / partes - .04, y0, y1]);
    for (let k = 0; k < partes * 2; k++) panos.push([x0 + (x1 - x0) * k / (partes * 2) + .03, x0 + (x1 - x0) * (k + 1) / (partes * 2) - .03, VENTANA_Y[1] - .47, VENTANA_Y[1] - .06]);
  }
  for (const p of panos) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(12), 3)); g.setIndex([0, 2, 1, 0, 3, 2]);
    const m = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
    const mesh = new T.Mesh(g, m); mesh.renderOrder = 1; mesh.userData.pano = p; mesh.raycast = () => {};
    mundo.add(mesh); manchas.push(mesh); luz.registrarDecal(mesh, .2, 'sol');
  }
}
function proyectarManchas() {
  const d = luz.direccionSol();
  for (const m of manchas) {
    const [x0, x1, y0, y1] = m.userData.pano, a = m.geometry.getAttribute('position');
    const pr = (x, y) => { const t = y / Math.max(d.y, .05); return [Math.min(9.9, x - d.x * t), .007, Math.max(-9.9, -d.z * t)]; };
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => a.setXYZ(i, ...pr(x, y)));
    a.needsUpdate = true; m.geometry.computeBoundingSphere();
  }
}

// ── Lámparas: las 24 más cercanas a la cámara ─────────────────────────────
let relojLamparas = 0;
function elegirLamparas() {
  const p = camera.position;
  const lista = ctx.lamparas.map(l => ({ l, d: (l.pos[0] - p.x) ** 2 + (l.pos[2] - p.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 24).map(x => x.l);
  luz.ponerLamparas(lista, 'restaurante');
}

// ── Jugador y cámara ──────────────────────────────────────────────────────
const jugador = { x: VISTAS[0].x, z: VISTAS[0].z, sentado: null };
let yaw = VISTAS[0].yaw, pitch = VISTAS[0].pitch, altura = OJO;
function choca(x, z) {
  for (const [x0, z0, x1, z1] of ctx.colisiones) {
    const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
    if ((x - cx) ** 2 + (z - cz) ** 2 < RADIO_JUGADOR ** 2) return true;
  }
  return false;
}
function mover(dx, dz) {
  if (!choca(jugador.x + dx, jugador.z + dz)) { jugador.x += dx; jugador.z += dz; return; }
  if (!choca(jugador.x + dx, jugador.z)) jugador.x += dx;
  else if (!choca(jugador.x, jugador.z + dz)) jugador.z += dz;
}
function apuntar() {
  camera.position.set(jugador.x, altura, jugador.z);
  camera.lookAt(jugador.x + Math.sin(yaw) * Math.cos(pitch), altura + Math.sin(pitch), jugador.z - Math.cos(yaw) * Math.cos(pitch));
}
function salaDe(x, z) {
  for (const s of Object.values(SALAS)) { const [x0, z0, x1, z1] = s.rect; if (x > x0 && x < x1 && z > z0 && z < z1) return s.nombre; }
  return CALLE.nombre;
}
function ir(v) {
  levantarse(false);
  jugador.x = v.x; jugador.z = v.z; yaw = v.yaw; pitch = v.pitch; apuntar();
  document.querySelectorAll('#vistas button').forEach(b => b.classList.toggle('activa', b.dataset.id === v.id));
}
function sentarse(mesa, asiento) {
  jugador.sentado = { mesa, asiento };
  jugador.x = asiento.x; jugador.z = asiento.z; yaw = asiento.yaw; pitch = -.24; altura = 1.18;
  $('#levantarse').hidden = false; $('#acciones').hidden = false; $('#help-overlay').hidden = true; apuntar();
  ui.alSentarse(mesa, asiento);
}
function levantarse(avisar = true) {
  if (!jugador.sentado) return;
  const { mesa, asiento } = jugador.sentado;
  jugador.sentado = null; altura = OJO; pitch = -.05;
  // un paso hacia atrás, lejos de la mesa
  const dx = asiento.x - mesa.x, dz = asiento.z - mesa.z, d = Math.hypot(dx, dz) || 1;
  jugador.x = asiento.x + dx / d * .35; jugador.z = asiento.z + dz / d * .35;
  $('#levantarse').hidden = true; $('#acciones').hidden = true; $('#help-overlay').hidden = false; apuntar();
  if (avisar) ui.toast('Te has levantado de la mesa');
}
$('#levantarse').onclick = () => levantarse();

// ── Entrada: teclado, arrastre y clic ─────────────────────────────────────
const teclas = new Set();
const modalAbierto = () => !!document.querySelector('.modal:not([hidden])');
addEventListener('keydown', e => {
  if (modalAbierto() || e.target.closest?.('input,select,textarea')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); teclas.add(e.code); if (jugador.sentado) levantarse(); }
});
addEventListener('keyup', e => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());
let arrastre = null;
const lienzo = renderer.domElement;
lienzo.addEventListener('pointerdown', e => { arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; lienzo.setPointerCapture(e.pointerId); });
lienzo.addEventListener('pointermove', e => {
  if (!arrastre) return;
  yaw += (e.clientX - arrastre.x) * .004;
  pitch = Math.max(-1.1, Math.min(.8, pitch - (e.clientY - arrastre.y) * .004));
  arrastre.x = e.clientX; arrastre.y = e.clientY; apuntar();
});
const rayo = new T.Raycaster(), puntero = new T.Vector2();
lienzo.addEventListener('pointerup', e => {
  const a = arrastre; arrastre = null;
  if (!a || Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 5) return;
  const r = lienzo.getBoundingClientRect();
  puntero.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  rayo.setFromCamera(puntero, camera); rayo.far = 7;
  const golpe = rayo.intersectObjects(ctx.pulsables, false).find(h => h.object.visible);
  if (!golpe) return;
  const o = golpe.object, nombre = o.userData.nombres?.[golpe.instanceId] ?? o.userData.nombre;
  ui.objeto(nombre, o.userData, golpe.point);
});
lienzo.addEventListener('pointercancel', () => { arrastre = null; });

// ── Panel ─────────────────────────────────────────────────────────────────
$('#panel-toggle').onclick = () => {
  const abrir = $('#trip-panel').hidden; $('#trip-panel').hidden = !abrir;
  $('#panel-toggle').setAttribute('aria-expanded', String(abrir)); $('#panel-toggle').textContent = abrir ? 'Cerrar ×' : 'Recorrido y opciones ☰';
};
for (const v of VISTAS) { const b = document.createElement('button'); b.textContent = v.nombre; b.dataset.id = v.id; b.onclick = () => ir(v); $('#vistas').append(b); }
const PREFS = 'restaurante.luz.v1';
let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { prefs = {}; }
const guardar = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ } };
for (const [k, A] of Object.entries(AMBIENTES)) $('#ambiente').append(new Option(A.nombre, k));
let capturaPendiente = 0;
function usarAmbiente(k) {
  if (!AMBIENTES[k]) return;
  luz.usarAmbiente(k); $('#ambiente').value = k; prefs.ambiente = k; guardar();
  capturaPendiente = 2;              // recaptura el entorno dos frames después (lámparas ya puestas)
}
$('#ambiente').onchange = e => usarAmbiente(e.target.value);
$('#contorno').onchange = e => { luz.contorno({ activo: e.target.checked }); prefs.contorno = e.target.checked; guardar(); };
$('#grosor').oninput = e => { const g = +e.target.value; luz.contorno({ grosor: g }); $('#grosor-valor').textContent = `${g.toFixed(1)} px`; prefs.grosor = g; guardar(); };
$('#reflejos').onchange = e => { setReflejos(e.target.checked); prefs.reflejos = e.target.checked; guardar(); };
$('#calidad').onchange = e => { prefs.calidad = e.target.value; guardar(); redimensionar(); };
luz.alCambiar(A => { pintarCielo(A); colocarSol(); proyectarManchas(); renderer.shadowMap.needsUpdate = true; });

function redimensionar() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, +($('#calidad').value || 1.25)));
  renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  luz.viewport(width, height, renderer.getPixelRatio());
}
new ResizeObserver(redimensionar).observe(viewport);

// ── Interfaz de las historias (carta, reserva, cuenta) ────────────────────
const ui = crearInterfaz({ ctx, sentarse, levantarse, ir, estado: () => jugador, ambiente: () => luz.ambiente });

// Preferencias guardadas / URL (?amb=noche)
const qAmb = new URLSearchParams(location.search).get('amb');
if (prefs.calidad) $('#calidad').value = prefs.calidad;
if (prefs.contorno === false) { $('#contorno').checked = false; luz.contorno({ activo: false }); }
if (prefs.grosor) { $('#grosor').value = prefs.grosor; luz.contorno({ grosor: prefs.grosor }); $('#grosor-valor').textContent = `${(+prefs.grosor).toFixed(1)} px`; }
if (prefs.reflejos === false) { $('#reflejos').checked = false; setReflejos(false); }
usarAmbiente(AMBIENTES[qAmb] ? qAmb : (prefs.ambiente && AMBIENTES[prefs.ambiente] ? prefs.ambiente : 'mediodia'));

// ── Bucle ─────────────────────────────────────────────────────────────────
let antes = performance.now(), salaActual = '';
ir(VISTAS[0]);
function cuadro(ahora) {
  const dt = Math.min(.05, (ahora - antes) / 1000); antes = ahora;
  actualizar(dt, ahora);
  renderer.render(scene, camera);
  requestAnimationFrame(cuadro);
}
function actualizar(dt, ahora) {
  if (!modalAbierto() && !jugador.sentado) {
    const v = 2.3 * dt; let f = 0, l = 0;
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) f += 1;
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) f -= 1;
    if (teclas.has('KeyD')) l += 1;
    if (teclas.has('KeyA')) l -= 1;
    if (teclas.has('ArrowLeft')) yaw -= 1.8 * dt;
    if (teclas.has('ArrowRight')) yaw += 1.8 * dt;
    if (f || l) {
      const n = Math.hypot(f, l);
      mover((Math.sin(yaw) * f + Math.cos(yaw) * l) / n * v, (-Math.cos(yaw) * f + Math.sin(yaw) * l) / n * v);
    }
  }
  apuntar();
  animarPuertas(ctx.puertas, jugador, dt);
  for (const fn of ctx.animados) fn(dt, ahora / 1000);
  // llamas: parpadeo a tramos (~12 pasos por segundo, como el follaje del aeropuerto)
  const paso = Math.floor(ahora / 83);
  ctx.halos.forEach((h, i) => { const k = .92 + .08 * Math.sin(paso * 1.7 + i * 2.3); h.scale.setScalar(.42 * k); });
  relojLamparas -= dt; if (relojLamparas <= 0) { elegirLamparas(); relojLamparas = .3; }
  const sala = salaDe(jugador.x, jugador.z);
  if (sala !== salaActual) { salaActual = sala; $('#zone-tag').textContent = sala; $('#zone').textContent = sala; ui.cambioDeSala?.(sala); }
  if (capturaPendiente && --capturaPendiente === 0) capturarEntorno(renderer, scene, { dentro: [3.4, 1.55, -5], fuera: [-1, 1.6, 7.5] });
}
redimensionar(); elegirLamparas();
requestAnimationFrame(t => { antes = t; cuadro(t); $('#cover').hidden = true; $('#status').textContent = 'Listo. Camina hasta la puerta: se abre sola.'; });

if (dev) window.__rest = { scene, camera, renderer, luz, ctx, jugador,
  view(x, z, y = yaw, p = 0) { levantarse(false); jugador.x = x; jugador.z = z; yaw = y; pitch = p; apuntar(); elegirLamparas(); renderer.render(scene, camera); },
  /** Avanza la simulación sin requestAnimationFrame (pestaña oculta): teclas = ['KeyW', …]. */
  simular(segundos, teclasPulsadas = []) {
    teclasPulsadas.forEach(k => teclas.add(k));
    let t = performance.now();
    for (let i = 0; i < Math.round(segundos * 30); i++) { t += 1000 / 30; actualizar(1 / 30, t); }
    teclasPulsadas.forEach(k => teclas.delete(k));
    renderer.render(scene, camera);
    return { x: +jugador.x.toFixed(2), z: +jugador.z.toFixed(2), sala: salaActual };
  },
  get yaw() { return yaw; }, get pitch() { return pitch; } };
