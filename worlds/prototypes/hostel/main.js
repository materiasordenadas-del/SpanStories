import * as T from './engine/three.js';
import { luz } from './engine/Luz25D.js';
import { montarPanelEstilo } from './panel/PanelEstilo.js';
import { RegistroObjetos, montarSeleccion } from './engine/Objetos.js';
import { aplicarDetalle } from './engine/Detalle.js';
import { crearHostal, ZONAS, PISOS, lamparasDe } from './engine/HostalWorld.js';
import { salasCubiertas, areasCaminables } from './engine/Planta.js';
import { crearCaminante } from './engine/Caminar.js';
import { decir, vozActual } from './engine/Voz.js';
import { MONEDAS, MONEDA_POR_DEFECTO } from './engine/Moneda.js';
import { NOMBRE, HORARIOS, DIMENSIONS as D } from './engine/dimensions.js';

/* Hostal Santa Marta: un solo mundo (la casa entera); las zonas son vistas de cámara.
   Tocar un objeto lo selecciona y dice su nombre; doble clic (o «Usar objeto») ejecuta su acción. */
const $ = s => document.querySelector(s), viewport = $('#viewport'), params = new URLSearchParams(location.search);
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.info.autoReset = false;
viewport.prepend(renderer.domElement); renderer.domElement.tabIndex = 0;
const scene = new T.Scene(), camera = new T.PerspectiveCamera(55, 1, .05, 400), target = new T.Vector3();
const objetos = new RegistroObjetos(), caminante = crearCaminante(camera, target), teclas = new Set();
let zona = 'calle', detalle = 0, primeraPersona = false, vistaGuardada = null, sucio = true, animarHasta = 0, ultimo = 0, relojNombre = 0, corte = [];
const prefs = (() => { try { return JSON.parse(localStorage.getItem('hostal.prefs.v1') || '{}') || {}; } catch { return {}; } })();
const guardar = () => { try { localStorage.setItem('hostal.prefs.v1', JSON.stringify(prefs)); } catch { /* sin almacenamiento */ } };
const mensaje = t => { $('#mensaje').textContent = t; };
const despertar = (ms = 1600) => { sucio = true; animarHasta = performance.now() + ms; };

// Cielo pintado (degradado del ambiente) como fondo de la escena.
const cieloLienzo = document.createElement('canvas'); cieloLienzo.width = 4; cieloLienzo.height = 256;
const cielo = new T.CanvasTexture(cieloLienzo); cielo.colorSpace = T.SRGBColorSpace; scene.background = cielo;
luz.alCambiar(A => { const g = cieloLienzo.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256); const [a, b, c] = A.cielo || ['#4aa3e3', '#8cc6ec', '#f6e7cc'];
  grad.addColorStop(0, a); grad.addColorStop(.55, b); grad.addColorStop(1, c); g.fillStyle = grad; g.fillRect(0, 0, 4, 256); cielo.needsUpdate = true; sucio = true; });

const mundo = crearHostal({ scene, objetos, onAccion: accion });
luz.salas(salasCubiertas());

// ── Zonas ─────────────────────────────────────────────────────────────────
for (const [id, z] of Object.entries(ZONAS)) { const b = document.createElement('button'); b.textContent = z.nombre; b.dataset.zone = id; b.onclick = () => mostrar(id); $('#zonas').append(b); }
function encuadre(cam, mira) { camera.position.set(...cam); target.set(...mira); camera.lookAt(target); aplicarDetalle(mundo.mundo, detalle, camera); if (primeraPersona) caminante.sincronizar(); sucio = true; }
function restaurarCorte() { for (const r of corte) { r.userData.corteVista = false; r.visible = !r.userData.ocultoUsuario; } corte = []; }
function mostrar(id, { conservarCamara = false } = {}) {
  if (!ZONAS[id]) return; zona = id; restaurarCorte(); const z = ZONAS[id];
  if (!conservarCamara) encuadre(z.cam, z.target);
  if (primeraPersona) { camera.position.y = PISOS[z.planta] + D.eye; caminante.sincronizar(); }
  $('#zona-titulo h1').textContent = z.nombre; $('#zona-titulo p').textContent = z.descripcion;
  for (const b of document.querySelectorAll('[data-zone]')) b.setAttribute('aria-current', String(b.dataset.zone === id));
  luz.ponerLamparas(lamparasDe(id), 'hostal');
  filtrarSelector(); objetos.seleccionar(null); controles(id); teclas.clear();
  mensaje(primeraPersona ? 'Primera persona · WASD o flechas para caminar · arrastra para mirar · Esc para salir.' : 'Toca un objeto para oír su nombre · doble clic para usarlo · arrastra para mirar.');
  sucio = true; if (!params.has('zona')) { prefs.zona = id; guardar(); }
}
const ZONAS_SELECTOR = { calle: ['calle', 'delantero'], delantero: ['delantero', 'calle', 'recepcion'], recepcion: ['recepcion'], sala: ['sala'], patio: ['patio'], cocina: ['cocina'], comedor: ['comedor'], dormitorio: ['dormitorio'], galeria: ['galeria'], azotea: ['azotea'] };
function filtrarSelector() { for (const o of $('#objeto-seleccionado').options) { const r = objetos.obtener(o.value); if (r) o.hidden = !ZONAS_SELECTOR[zona].includes(r.userData.zona); } }

// ── Acciones por zona ─────────────────────────────────────────────────────
const abrir = (id, valor = true) => { const r = objetos.obtener(id); if (r) { r.userData.abierta = valor; despertar(); } return r; };
const verPizarra = () => { encuadre([4.4, 1.62, -3.9], [4.4, 1.75, -6.85]); mensaje('Pizarra de precios: cambia la moneda en Opciones → Moneda de los precios.'); };
function controles(id) {
  const A = {
    calle: [['Entrar por la ENTRADA', () => { abrir('reja-entrada'); mensaje('La reja de la ENTRADA se abre hacia el patio delantero.'); setTimeout(() => mostrar('delantero'), 900); }], ['Tocar el timbre', () => accion('timbre-calle')], ['Ver la SALIDA', () => encuadre([-6, 1.62, 10.5], [-6, 2, 6.2])]],
    delantero: [['Abrir / cerrar el portón', () => { const p = objetos.obtener('porton'); p.userData.accion(); }], ['Entrar al zaguán', () => { abrir('porton'); setTimeout(() => mostrar('recepcion'), 700); }], ['Salir por la SALIDA', () => { abrir('reja-salida'); mensaje('Se sale por la izquierda: la SALIDA.'); setTimeout(() => mostrar('calle'), 900); }]],
    recepcion: [['Hacer el check-in', () => accion('checkin')], ['Ver la pizarra de precios', verPizarra], ['Tocar el timbre', () => accion('timbre')], ['Ir a la sala común', () => mostrar('sala')], ['Ir al patio', () => mostrar('patio')], ['Salir a la calle', () => mostrar('delantero')]],
    sala: [['Ir a la recepción', () => mostrar('recepcion')], ['Ir al patio', () => mostrar('patio')]],
    patio: [['Ir al Dormitorio 1', () => mostrar('dormitorio')], ['Ver la piscina', () => encuadre([2.6, 1.62, -9.6], [0, -.5, -15])], ['Ir a la cocina', () => mostrar('cocina')], ['Ir al comedor', () => mostrar('comedor')], ['Subir a la galería alta', () => mostrar('galeria')], ['Ir a la recepción', () => mostrar('recepcion')]],
    cocina: [['Ir al comedor', () => mostrar('comedor')], ['Volver al patio', () => mostrar('patio')]],
    comedor: [['Ver el buffet', () => encuadre([6.6, 1.62, -23.4], [9.3, .95, -23.4])], ['Ir a la cocina', () => mostrar('cocina')], ['Volver al patio', () => mostrar('patio')]],
    dormitorio: [['Abrir / cerrar la puerta', () => objetos.obtener('puerta-dorm1').userData.accion()], ['Ver mi litera', () => encuadre([-7.2, 1.62, -9.0], [-9.0, .9, -10.6])], ['Volver al patio', () => mostrar('patio')]],
    galeria: [['Subir a la azotea', () => mostrar('azotea')], ['Bajar al patio', () => mostrar('patio')]],
    azotea: [['Mirar la ciudad', () => encuadre([0, PISOS[2] + 1.62, -5.5], [0, PISOS[2] + 1.2, 12])], ['Zona de ropas', () => encuadre([-3.5, PISOS[2] + 1.62, -21.7], [5.5, PISOS[2] + .9, -24.8])], ['Bajar a la galería', () => mostrar('galeria')]],
  }[id] || [];
  $('#acciones').replaceChildren(...A.map(([t, fn]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { fn(); despertar(); }; return b; }));
}
function accion(id, dato) {
  const r = { 'timbre-calle': '«¡Ding dong!» Abren desde recepción: «¡Bienvenido! Entre por la reja de la derecha.»',
    timbre: '«¡Ding!» — «¡Buenas! Bienvenido al ' + NOMBRE.hostal + '. ¿Tiene reserva?»',
    checkin: 'Check-in: «Me regala su pasaporte, por favor.» · Cama 1 del Dormitorio 1 (8 camas, mixto). Check-out a las ' + HORARIOS.checkOut + '.',
    precios: 'Pizarra de precios: cama, desayuno, toalla, candado, lavandería… Cambia la moneda en Opciones.' }[id];
  if (r) { mensaje(r); if (id === 'precios') verPizarra(); despertar(); return; }
  if (id === 'ocupada') { mensaje(dato.info || dato.etiqueta); return; }
  if (id === 'puerta-dorm1') { mensaje(dato ? 'Puerta del Dormitorio 1 abierta. Tu cama es la 1 (litera de la izquierda).' : 'Puerta del Dormitorio 1 cerrada.'); despertar(); return; }
  if (id.startsWith('reja-')) mensaje(dato ? 'Reja abierta.' : 'Reja cerrada.');
  if (id === 'porton') mensaje(dato ? 'Portón abierto: al fondo del zaguán se ve el patio.' : 'Portón cerrado.');
  despertar();
}

// ── Selección: tocar = nombre en pantalla + voz ───────────────────────────
let seleccion;
function montarSel() {
  seleccion?.destruir(); objetos.onChange = null;
  seleccion = montarSeleccion({ objetos, scene, camera, canvas: renderer.domElement, selector: $('#objeto-seleccionado'), estado: $('#seleccion-status') });
  const previo = objetos.onChange;
  objetos.onChange = e => {
    previo?.(e); $('#accion-objeto').disabled = !e?.raiz.userData.accion; $('#ocultar-objeto').checked = e ? !e.raiz.visible : false; sucio = true;
    if (!e) return;
    const voz = e.raiz.userData.voz || e.etiqueta; $('#nombre').textContent = voz; $('#nombre').hidden = false; relojNombre = performance.now() + 3200;
    if ($('#voz').checked) decir(voz);
    mensaje(e.etiqueta + (e.raiz.userData.info ? ' · ' + e.raiz.userData.info : e.raiz.userData.accion ? ' · Doble clic para usarlo.' : ''));
  };
}
montarSel();
$('#accion-objeto').onclick = () => { objetos.obtener(objetos.seleccion)?.userData.accion?.(); despertar(); };
$('#ocultar-objeto').onchange = () => { const r = objetos.obtener(objetos.seleccion); if (r) { r.userData.ocultoUsuario = $('#ocultar-objeto').checked; r.visible = !r.userData.ocultoUsuario; sucio = true; } };
$('#voz').checked = prefs.voz ?? true; $('#voz').onchange = () => { prefs.voz = $('#voz').checked; guardar(); };

// ── Moneda de la pizarra ──────────────────────────────────────────────────
for (const [k, M] of Object.entries(MONEDAS)) $('#moneda').append(new Option(`${M.nombre} (${k})`, k));
function usarMoneda(c) { if (!MONEDAS[c]) c = MONEDA_POR_DEFECTO; $('#moneda').value = c; prefs.moneda = c; guardar(); mundo.pizarra.userData.pintar(c); sucio = true; }
$('#moneda').onchange = e => usarMoneda(e.target.value);
usarMoneda(params.get('moneda')?.toUpperCase() || prefs.moneda || MONEDA_POR_DEFECTO);

// ── Vista: primera persona, vista general, zoom, giro ─────────────────────
function ponerPrimeraPersona(on) {
  if (on === primeraPersona) return; primeraPersona = on; teclas.clear();
  if (on) { vistaGuardada = { p: camera.position.clone(), t: target.clone() }; restaurarCorte(); const z = ZONAS[zona]; encuadre(z.cam, z.target); caminante.sincronizar(); renderer.domElement.focus(); }
  else if (vistaGuardada) { camera.position.copy(vistaGuardada.p); target.copy(vistaGuardada.t); camera.lookAt(target); vistaGuardada = null; }
  $('#first-person').setAttribute('aria-pressed', String(on)); $('#caminar-controles').hidden = !on;
  for (const id of ['zoom-in', 'zoom-out', 'rotate']) $('#' + id).disabled = on;
  mensaje(on ? 'Primera persona · WASD o flechas para caminar · arrastra para mirar · Esc para salir.' : 'Toca un objeto para oír su nombre · doble clic para usarlo.'); sucio = true;
}
$('#first-person').onclick = () => ponerPrimeraPersona(!primeraPersona);
// Vista general: maqueta de la planta baja (se ocultan techos, planta alta y azotea).
$('#overview').onclick = () => { ponerPrimeraPersona(false); restaurarCorte();
  for (const r of mundo.raices) if ((r.userData.planta >= 1 || r.userData.tipo === 'techo' || r.userData.cielo) && r.visible) { r.visible = false; r.userData.corteVista = true; corte.push(r); }
  encuadre([12, 31, 7], [0, 0, -12.5]); mensaje('Vista general: planta baja sin techos. Elige una zona para volver.'); };
function zoom(k) { if (primeraPersona) return; const d = camera.position.clone().sub(target), n = T.MathUtils.clamp(d.length() * k, 1.2, 120); camera.position.copy(target).add(d.setLength(n)); sucio = true; }
$('#zoom-in').onclick = () => zoom(.85); $('#zoom-out').onclick = () => zoom(1.18);
$('#rotate').onclick = () => { camera.position.sub(target).applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 8).add(target); camera.lookAt(target); sucio = true; };
renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.06 : .94); }, { passive: false });
let arrastre = null, suprimirClic = false;
renderer.domElement.addEventListener('pointerdown', e => { renderer.domElement.focus(); renderer.domElement.setPointerCapture(e.pointerId); arrastre = { x: e.clientX, y: e.clientY, movido: false }; });
renderer.domElement.addEventListener('pointermove', e => { if (!arrastre || !e.buttons) return; const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y; if (Math.abs(dx) + Math.abs(dy) > 2) arrastre.movido = true;
  if (primeraPersona) { caminante.sincronizar(); caminante.mirar(dx, dy); }
  else { const s = new T.Spherical().setFromVector3(camera.position.clone().sub(target)); s.theta -= dx * .006; s.phi = T.MathUtils.clamp(s.phi + dy * .004, .2, 2.6); camera.position.copy(target).add(new T.Vector3().setFromSpherical(s)); camera.lookAt(target); }
  arrastre.x = e.clientX; arrastre.y = e.clientY; sucio = true; });
renderer.domElement.addEventListener('pointerup', () => { suprimirClic = Boolean(arrastre?.movido); arrastre = null; });
renderer.domElement.addEventListener('click', e => { if (suprimirClic) { e.stopImmediatePropagation(); suprimirClic = false; } }, true);
renderer.domElement.addEventListener('dblclick', () => { objetos.obtener(objetos.seleccion)?.userData.accion?.(); despertar(); });
const MOV = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
renderer.domElement.addEventListener('keydown', e => { if (!primeraPersona) return; if (e.code === 'Escape') return ponerPrimeraPersona(false); if (MOV[e.code]) { e.preventDefault(); teclas.add(e.code); } });
window.addEventListener('keyup', e => teclas.delete(e.code)); window.addEventListener('blur', () => teclas.clear());
for (const b of document.querySelectorAll('[data-walk]')) { b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); teclas.add(b.dataset.walk); }; b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => teclas.delete(b.dataset.walk); }

// ── Panel ─────────────────────────────────────────────────────────────────
$('#panel-toggle').onclick = () => { const p = $('#panel'), abrirP = p.hidden; p.hidden = !abrirP; $('#panel-toggle').setAttribute('aria-expanded', String(abrirP)); $('#panel-toggle').textContent = abrirP ? 'Cerrar ×' : 'Opciones ☰'; };
montarPanelEstilo({ luz, contenedor: $('#panel-estilo'), clave: 'hostal.luz.v1' });
$('#panel-estilo').addEventListener('input', () => { sucio = true; }); $('#panel-estilo').addEventListener('click', () => { sucio = true; });
$('#quality').onchange = () => { detalle = { HIGH: 0, STANDARD: 1, ECO: 2 }[$('#quality').value]; renderer.setPixelRatio(detalle === 2 ? 1 : Math.min(devicePixelRatio, detalle ? 1.25 : 1.5)); aplicarDetalle(mundo.mundo, detalle, camera); for (const r of corte) r.visible = false; redimensionar(); };
function redimensionar() { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); luz.viewport(width, height, renderer.getPixelRatio()); sucio = true; }
new ResizeObserver(redimensionar).observe(viewport);
$('#status').textContent = `${NOMBRE.hostal} · ${objetos.listar().length} objetos seleccionables · voz: ${vozActual()}.`;
if (params.has('dev')) window.__escena = { T, scene, camera, renderer, luz, objetos, mundo, mostrar, encuadre, ZONAS, target,
  // Prueba de recorrido: camina (adelante, lado) durante «seg» segundos en la planta de la zona y devuelve la posición.
  caminar(adelante, lado, seg, planta = ZONAS[zona].planta) { caminante.sincronizar(); for (let i = 0; i < seg * 60; i++) caminante.mover(adelante, lado, 1 / 60, mundo.raices, areasCaminables(planta), PISOS[planta]); sucio = true; return camera.position.toArray().map(v => +v.toFixed(2)); } };

// ── Bucle: dibuja solo cuando algo cambia ─────────────────────────────────
const tocar = a => [...teclas].some(k => (MOV[k] || k) === a);
renderer.setAnimationLoop(t => {
  const dt = Math.min((t - ultimo) / 1000, .05); ultimo = t; if (document.hidden) return;
  if (primeraPersona && teclas.size) { const pl = ZONAS[zona].planta; caminante.sincronizar();
    if (caminante.mover(Number(tocar('forward')) - Number(tocar('back')), Number(tocar('right')) - Number(tocar('left')), dt, mundo.raices, areasCaminables(pl), PISOS[pl])) sucio = true; }
  if (t < animarHasta) { for (const r of mundo.animados) r.userData.animar(dt); sucio = true; }
  if (relojNombre && t > relojNombre) { $('#nombre').hidden = true; relojNombre = 0; }
  if (!sucio) return;
  seleccion?.actualizar(); renderer.info.reset(); const t0 = performance.now(); renderer.render(scene, camera); const ms = performance.now() - t0; sucio = false;
  $('#metrics').textContent = `LOD ${detalle + 1} · ${renderer.info.render.calls} llamadas · ${renderer.info.render.triangles.toLocaleString('es')} triángulos\n${ms.toFixed(1)} ms CPU al dibujar · DPR ${renderer.getPixelRatio()}\nZona: ${zona} · ${objetos.listar().length} objetos · cámara ${camera.position.toArray().map(v => v.toFixed(1)).join(', ')}`;
});
for (const r of mundo.animados) for (let i = 0; i < 60; i++) r.userData.animar(.05);   // puertas en su estado inicial (la de la cocina, abierta)
mostrar(ZONAS[params.get('zona')] ? params.get('zona') : 'calle');
