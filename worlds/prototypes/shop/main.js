import * as T from './engine/three.js';
import { luz } from './engine/Luz25D.js';
import { crearKit, crearLote } from './engine/Kit.js';
import { construirLocal, animarPuertas } from './engine/Local.js';
import { construirGondolas, construirCajas, construirIsla, construirEntrada, construirAlmacen } from './engine/Mobiliario.js';
import { construirModo } from './engine/Modo.js';
import { SALAS, CALLE, VISTAS, OJO, RADIO_JUGADOR, LOCAL, MODOS } from './engine/config.js';
import { MONEDAS, MONEDA_POR_DEFECTO } from './engine/Moneda.js';
import { montarPanelEstilo } from './panel/PanelEstilo.js';

/* La Estrella (Sistema 5 · Comercio): montaje, cámara en primera persona,
   modos (súper / general), moneda, panel y bucle.  Misma estructura que el Banco. */

const $ = s => document.querySelector(s), viewport = $('#viewport');
const params = new URLSearchParams(location.search), dev = params.has('dev');
const PREFS = 'comercio.escena.v1';
let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { prefs = {}; }
const guardar = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ } };

// ── Render ────────────────────────────────────────────────────────────────
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
renderer.shadowMap.enabled = false;               // la sombra la calcula el material (Luz25D)
viewport.prepend(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(60, 1, .05, 120);

// Cielo pintado (fondo), repintado por ambiente.
const cieloCanvas = document.createElement('canvas'); cieloCanvas.width = 1024; cieloCanvas.height = 512;
const cielo = cieloCanvas.getContext('2d');
const cieloTex = new T.CanvasTexture(cieloCanvas); cieloTex.colorSpace = T.SRGBColorSpace; cieloTex.mapping = T.EquirectangularReflectionMapping;
scene.background = cieloTex;
function pintarCielo(A) {
  const [arriba, medio, horizonte] = A.cielo, g = cielo.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, arriba); g.addColorStop(.6, medio); g.addColorStop(1, horizonte);
  cielo.fillStyle = g; cielo.fillRect(0, 0, 1024, 512);
  if (A.estrellas) {
    cielo.fillStyle = '#f4f1ff';
    for (let i = 0; i < 110; i++) { cielo.globalAlpha = .4 + (i % 5) * .12; cielo.beginPath(); cielo.arc((i * 211.7) % 1024, (i * 97.3) % 220, i % 7 ? .9 : 1.7, 0, Math.PI * 2); cielo.fill(); }
  }
  for (let i = 0; i < 9; i++) {
    const x = (i * 131 + 40) % 1024, y = 120 + (i * 37) % 90, s = 26 + (i % 3) * 12;
    cielo.fillStyle = A.nubes; cielo.globalAlpha = A.estrellas ? .35 : .92;
    for (let k = 0; k < 5; k++) { cielo.beginPath(); cielo.ellipse(x + (k - 2) * s * .8, y - Math.sin(k * 1.3) * s * .35, s, s * .6, 0, 0, Math.PI * 2); cielo.fill(); }
  }
  cielo.globalAlpha = 1; cieloTex.needsUpdate = true;
}

// ── Construcción: casco y mobiliario común (fijos) ────────────────────────
const kit = crearKit();
const mundo = new T.Group(); mundo.name = 'mundo'; scene.add(mundo);
const ctx = { kit, grupo: mundo, lote: crearLote(kit), colisiones: [], pulsables: [], lamparas: [], estantes: [] };
const local = construirLocal(ctx);
construirGondolas(ctx); construirCajas(ctx); construirIsla(ctx); construirEntrada(ctx); construirAlmacen(ctx);
ctx.lote.construir(mundo, ctx.pulsables);
luz.salas(Object.values(SALAS).map(s => s.rect));
const fijos = { colisiones: ctx.colisiones.slice(), pulsables: ctx.pulsables.slice(), estantes: ctx.estantes.slice() };

// ── Modo (lo que cambia entre súper y general) ────────────────────────────
let modoActual = null, grupoModo = null, relojLamparas = 0;
const estado = {
  modo: MODOS[params.get('modo')] ? params.get('modo') : (MODOS[prefs.modo] ? prefs.modo : 'super'),
  moneda: MONEDAS[params.get('moneda')?.toUpperCase()] ? params.get('moneda').toUpperCase() : (MONEDAS[prefs.moneda] ? prefs.moneda : MONEDA_POR_DEFECTO),
};
function usarModo(modo) {
  if (!MODOS[modo]) return;
  if (grupoModo) {
    mundo.remove(grupoModo);
    grupoModo.traverse(o => { if (o.isMesh && !Object.values(kit.geo).includes(o.geometry)) o.geometry.dispose(); });
  }
  grupoModo = new T.Group(); grupoModo.name = `modo-${modo}`; mundo.add(grupoModo);
  const c = { ...ctx, grupo: grupoModo, lote: crearLote(kit), colisiones: fijos.colisiones.slice(), pulsables: fijos.pulsables.slice(), estantes: fijos.estantes.slice(), lamparas: [] };
  modoActual = construirModo(c, modo, { moneda: () => estado.moneda, letrero: local.letrero });
  ctx.colisiones = c.colisiones; ctx.pulsables = c.pulsables; ctx.modoLamparas = c.lamparas;
  estado.modo = modo; prefs.modo = modo; guardar();
  $('#modo').value = modo;
  document.title = `SpanStories · La Estrella · ${MODOS[modo].nombre}`;
  $('#titulo-modo').textContent = MODOS[modo].nombre;
  relojLamparas = 0;
  $('#metrics').textContent = `Modo: ${modo}\nProductos: ${modoActual.productos}\nColisiones: ${ctx.colisiones.length}\nEstantes: ${c.estantes.length}`;
  document.dispatchEvent(new CustomEvent('comercio:modo', { detail: { modo } }));
}
function usarMoneda(codigo) {
  if (!MONEDAS[codigo]) return;
  estado.moneda = codigo; prefs.moneda = codigo; guardar();
  $('#moneda').value = codigo;
  modoActual?.repintarPrecios();
  document.dispatchEvent(new CustomEvent('comercio:moneda', { detail: { moneda: codigo } }));
}

// ── Lámparas: las más cercanas a la cámara ────────────────────────────────
function elegirLamparas() {
  const p = camera.position, todas = ctx.lamparas.concat(ctx.modoLamparas || []);
  const lista = todas.map(l => ({ l, d: (l.pos[0] - p.x) ** 2 + (l.pos[2] - p.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 16).map(x => x.l);
  luz.ponerLamparas(lista, 'comercio');
}

// ── Jugador y cámara ──────────────────────────────────────────────────────
const jugador = { x: VISTAS[0].x, z: VISTAS[0].z };
let yaw = VISTAS[0].yaw, pitch = VISTAS[0].pitch;
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
  camera.position.set(jugador.x, OJO, jugador.z);
  camera.lookAt(jugador.x + Math.sin(yaw) * Math.cos(pitch), OJO + Math.sin(pitch), jugador.z - Math.cos(yaw) * Math.cos(pitch));
}
const zonaDe = (x, z) => (x > LOCAL.x0 && x < LOCAL.x1 && z > LOCAL.z0 && z < LOCAL.z1) ? (modoActual?.zonaDe(x, z) ?? SALAS.tienda.nombre) : CALLE.nombre;
function ir(v) {
  jugador.x = v.x; jugador.z = v.z; yaw = v.yaw; pitch = v.pitch; apuntar();
  document.querySelectorAll('#vistas button').forEach(b => b.classList.toggle('activa', b.dataset.id === v.id));
}

// ── Entrada: teclado, arrastre y clic ─────────────────────────────────────
const teclas = new Set();
addEventListener('keydown', e => {
  if (e.target.closest?.('input,select,textarea')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); teclas.add(e.code); }
});
addEventListener('keyup', e => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());
if (matchMedia('(pointer: coarse)').matches) { $('#cruceta').hidden = false; document.body.classList.add('tactil'); }
for (const b of document.querySelectorAll('#cruceta [data-tecla]')) {
  const t = b.dataset.tecla, soltar = () => teclas.delete(t);
  b.addEventListener('pointerdown', e => { e.preventDefault(); teclas.add(t); b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointerup', soltar); b.addEventListener('pointercancel', soltar); b.addEventListener('lostpointercapture', soltar);
}
let arrastre = null, relojNombre = 0;
const lienzo = renderer.domElement;
lienzo.addEventListener('pointerdown', e => { arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; lienzo.setPointerCapture(e.pointerId); });
lienzo.addEventListener('pointermove', e => {
  if (!arrastre) return;
  yaw += (e.clientX - arrastre.x) * .004;
  pitch = Math.max(-1.1, Math.min(.8, pitch - (e.clientY - arrastre.y) * .004));
  arrastre.x = e.clientX; arrastre.y = e.clientY; apuntar();
});
const rayo = new T.Raycaster(), puntero = new T.Vector2();
function nombrar(clientX, clientY) {
  const r = lienzo.getBoundingClientRect();
  puntero.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
  rayo.setFromCamera(puntero, camera); rayo.far = 9;
  const golpe = rayo.intersectObjects(ctx.pulsables, false).find(h => h.object.visible && !h.object.material?.userData?.vidrio);
  if (!golpe) return null;
  const o = golpe.object;
  return o.userData.ids ? modoActual.nombreProducto(o.userData.ids[golpe.instanceId]) : (o.userData.nombres?.[golpe.instanceId] ?? o.userData.nombre);
}
lienzo.addEventListener('pointerup', e => {
  const a = arrastre; arrastre = null;
  if (!a || Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 5) return;
  const nombre = nombrar(e.clientX, e.clientY);
  if (!nombre) return;
  $('#nombre').innerHTML = nombre; $('#nombre').hidden = false; relojNombre = 3.5;
  document.dispatchEvent(new CustomEvent('comercio:objeto', { detail: { nombre: $('#nombre').textContent } }));
});
lienzo.addEventListener('pointercancel', () => { arrastre = null; });

// ── Panel (PANEL.md: Escena · Luz y estilo · Calidad · Diagnóstico) ──────
$('#panel-toggle').onclick = () => {
  const p = $('#panel'), abrir = p.hidden; p.hidden = !abrir;
  $('#panel-toggle').setAttribute('aria-expanded', String(abrir)); $('#panel-toggle').textContent = abrir ? 'Cerrar ×' : 'Opciones ☰';
};
for (const v of VISTAS) { const b = document.createElement('button'); b.textContent = v.nombre; b.dataset.id = v.id; b.onclick = () => ir(v); $('#vistas').append(b); }
for (const [k, M] of Object.entries(MODOS)) $('#modo').append(new Option(M.nombre, k));
for (const [k, M] of Object.entries(MONEDAS)) $('#moneda').append(new Option(`${M.nombre} (${k})`, k));
$('#modo').onchange = e => usarModo(e.target.value);
$('#moneda').onchange = e => usarMoneda(e.target.value);
montarPanelEstilo({ luz, contenedor: $('#panel-estilo'), clave: 'comercio.luz.v1' });
$('#quality').onchange = e => { prefs.calidad = e.target.value; guardar(); redimensionar(); };
if (prefs.calidad) $('#quality').value = prefs.calidad;
luz.alCambiar(A => pintarCielo(A));

function redimensionar() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, { HIGH: 1.75, STANDARD: 1.25, ECO: .85 }[$('#quality').value] ?? 1.25));
  renderer.setSize(width, height); camera.aspect = width / height;
  camera.fov = camera.aspect < 1 ? 78 : 60;
  camera.updateProjectionMatrix();
  luz.viewport(width, height, renderer.getPixelRatio());
}
new ResizeObserver(redimensionar).observe(viewport);

// ── Arranque y bucle ──────────────────────────────────────────────────────
usarModo(estado.modo); usarMoneda(estado.moneda);
let antes = performance.now(), zonaActual = '';
ir(VISTAS.find(v => v.id === params.get('vista')) ?? VISTAS[0]);
function paso(dt) {
  const v = 2.3 * dt; let f = 0, l = 0;
  if (teclas.has('KeyW') || teclas.has('ArrowUp')) f += 1;
  if (teclas.has('KeyS') || teclas.has('ArrowDown')) f -= 1;
  if (teclas.has('KeyD')) l += 1;
  if (teclas.has('KeyA')) l -= 1;
  if (teclas.has('ArrowLeft')) yaw -= 1.8 * dt;
  if (teclas.has('ArrowRight')) yaw += 1.8 * dt;
  if (f || l) { const n = Math.hypot(f, l); mover((Math.sin(yaw) * f + Math.cos(yaw) * l) / n * v, (-Math.cos(yaw) * f + Math.sin(yaw) * l) / n * v); }
  apuntar();
  animarPuertas(local.puertas, jugador, dt);
  relojLamparas -= dt; if (relojLamparas <= 0) { elegirLamparas(); relojLamparas = .3; }
  if (relojNombre > 0 && (relojNombre -= dt) <= 0) $('#nombre').hidden = true;
  const zona = zonaDe(jugador.x, jugador.z);
  if (zona !== zonaActual) { zonaActual = zona; $('#zone-tag').textContent = zona; $('#zona').textContent = zona; }
}
function cuadro(ahora) {
  const dt = Math.min(.05, (ahora - antes) / 1000); antes = ahora;
  paso(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(cuadro);
}
redimensionar(); elegirLamparas();
requestAnimationFrame(t => { antes = t; cuadro(t); $('#cover').hidden = true; $('#status').textContent = 'Listo. Camina hasta la puerta: se abre sola.'; });

if (dev) window.__comercio = window.__scene = { scene, camera, renderer, luz, ctx, jugador, estado, usarModo, usarMoneda, nombrar,
  view(x, z, y = yaw, p = 0) { jugador.x = x; jugador.z = z; yaw = y; pitch = p; apuntar(); },
  mover, choca, paso: dt => paso(dt), render: () => renderer.render(scene, camera),
  get yaw() { return yaw; }, get pitch() { return pitch; } };
// API para las historias de SpanStories
window.comercio = { ir: id => { const v = VISTAS.find(x => x.id === id); if (v) ir(v); }, modo: usarModo, moneda: usarMoneda, get estado() { return { ...estado }; } };
