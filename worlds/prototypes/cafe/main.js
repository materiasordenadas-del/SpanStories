import * as T from './engine/three.js';
import { luz } from './engine/Luz25D.js';
import { crearKit, crearLote, ilustracion } from './engine/Kit.js';
import { construirLocal, animarPuertas } from './engine/Local.js';
import { construirBarra } from './engine/Barra.js';
import { construirSalon } from './engine/Salon.js';
import { MARCA } from './engine/Marca.js';
import { SALAS, CALLE, VISTAS, OJO, RADIO_JUGADOR, LOCAL, BARRA, FILA, ACERA, COMUNAL, SILLONES, VENTANA, zFrenteBarra, zTrasMostrador } from './engine/config.js';
import { MONEDAS, MONEDA_POR_DEFECTO, formatear } from './engine/Moneda.js';
import { BEBIDAS, SECCIONES, TAMANOS, LECHES, PAN, bebida, precioPedido, describirPedido } from './engine/Carta.js';
import { montarPanelEstilo } from './panel/PanelEstilo.js';

/* Cafetería STARBACK: montaje, cámara en primera persona, moneda, pedido, panel
   y bucle.  Misma estructura que el Comercio y el Banco. */

const $ = s => document.querySelector(s), viewport = $('#viewport');
const params = new URLSearchParams(location.search), dev = params.has('dev');
const PREFS = 'cafeteria.escena.v1';
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

// ── Construcción ──────────────────────────────────────────────────────────
const estado = {
  moneda: MONEDAS[params.get('moneda')?.toUpperCase()] ? params.get('moneda').toUpperCase() : (MONEDAS[prefs.moneda] ? prefs.moneda : MONEDA_POR_DEFECTO),
  pedido: null,                   // { bebida, tamano, leche, para, nombre, total, fase: 'pedido' | 'preparando' | 'listo' }
};
const kit = crearKit();
const mundo = new T.Group(); mundo.name = 'mundo'; scene.add(mundo);
const ctx = { kit, grupo: mundo, lote: crearLote(kit), colisiones: [], pulsables: [], lamparas: [] };
const local = construirLocal(ctx);
const barra = construirBarra(ctx, { moneda: () => estado.moneda });
construirSalon(ctx);
ctx.lote.construir(mundo, ctx.pulsables);
luz.salas(Object.values(SALAS).map(s => s.rect));

function usarMoneda(codigo) {
  if (!MONEDAS[codigo]) return;
  estado.moneda = codigo; prefs.moneda = codigo; guardar();
  $('#moneda').value = codigo;
  barra.repintarPrecios(); actualizarPrecio();
  if (estado.pedido) barra.pantalla({ detalle: describirPedido(estado.pedido, { articulo: false }), texto: formatear(estado.pedido.total, codigo) });
  document.dispatchEvent(new CustomEvent('cafeteria:moneda', { detail: { moneda: codigo } }));
}

// ── Lámparas: las más cercanas a la cámara ────────────────────────────────
let relojLamparas = 0;
function elegirLamparas() {
  const p = camera.position;
  const lista = ctx.lamparas.map(l => ({ l, d: (l.pos[0] - p.x) ** 2 + (l.pos[2] - p.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, 16).map(x => x.l);
  luz.ponerLamparas(lista, 'cafeteria');
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
function zonaDe(x, z) {
  if (z > LOCAL.z1) return z < ACERA.z1 ? 'La terraza' : CALLE.nombre;
  if (x < LOCAL.x0 || x > LOCAL.x1 || z < LOCAL.z0) return SALAS.cafe.nombre;
  if (x < BARRA.x0 && z < zTrasMostrador()) return 'Leche y azúcar';
  if (z < zFrenteBarra() + 1.2) return x > BARRA.tramos.caja[0] ? 'La caja' : (x < BARRA.tramos.entrega[1] + .3 ? 'Recoge aquí' : 'La barra');
  if (Math.abs(x - FILA.x) < FILA.ancho / 2 + .2 && z < FILA.cartel + .4) return 'La fila';
  if (x < SILLONES.x1 && z > SILLONES.z0 - .3 && z < SILLONES.z1 + .3) return 'Los sillones';
  if (Math.abs(x - COMUNAL.cx) < COMUNAL.largo / 2 + .5 && Math.abs(z - COMUNAL.cz) < COMUNAL.fondo / 2 + 1) return 'La mesa comunal';
  if (z > LOCAL.z1 - VENTANA.fondo - 1 && x < VENTANA.x1 + .3) return 'La barra de la ventana';
  return 'El salón';
}
function ir(v) {
  jugador.x = v.x; jugador.z = v.z; yaw = v.yaw; pitch = v.pitch; apuntar();
  document.querySelectorAll('#vistas button').forEach(b => b.classList.toggle('activa', b.dataset.id === v.id));
}
const irA = id => { const v = VISTAS.find(x => x.id === id); if (v) ir(v); };

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
const NOMBRES_LOTE = {
  bolsa: 'las bolsas de café en grano',
  termo: 'el termo <small>(«la botella térmica»)</small>',
  taza: 'la taza',
};
function nombreDeId(id) {
  const p = PAN.find(x => x.id === id);
  if (p) return `${p.nombre} — <b>${formatear(p.precio, estado.moneda)}</b>${p.nota ? `<br><small>${p.nota}</small>` : ''}`;
  return NOMBRES_LOTE[id] ?? null;
}
const rayo = new T.Raycaster(), puntero = new T.Vector2();
function nombrar(clientX, clientY) {
  const r = lienzo.getBoundingClientRect();
  puntero.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
  rayo.setFromCamera(puntero, camera); rayo.far = 9;
  const golpe = rayo.intersectObjects(ctx.pulsables, false).find(h => h.object.visible && !h.object.material?.userData?.vidrio);
  if (!golpe) return null;
  const o = golpe.object;
  if (o.userData.ids) return nombreDeId(o.userData.ids[golpe.instanceId]);
  if (o.userData.pan) return nombreDeId(o.userData.pan.id);
  return o.userData.nombres?.[golpe.instanceId] ?? o.userData.nombre;
}
function mostrarNombre(html, segundos = 3.5) { $('#nombre').innerHTML = html; $('#nombre').hidden = false; relojNombre = segundos; }
lienzo.addEventListener('pointerup', e => {
  const a = arrastre; arrastre = null;
  if (!a || Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 5) return;
  if (vaso && estado.pedido?.fase === 'listo' && tocaVaso(e.clientX, e.clientY)) { recoger(); return; }
  const nombre = nombrar(e.clientX, e.clientY);
  if (!nombre) return;
  mostrarNombre(nombre);
  document.dispatchEvent(new CustomEvent('cafeteria:objeto', { detail: { nombre: $('#nombre').textContent } }));
});
lienzo.addEventListener('pointercancel', () => { arrastre = null; });

// ── Pedido: fila → caja (nombre y pago) → barra → «Recoge aquí» ─────────────
// El nombre lo escribe el estudiante: se escapa antes de meterlo en HTML.
const escapar = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const leerPedido = () => ({
  bebida: $('#p-bebida').value, tamano: $('#p-tamano').value, leche: $('#p-leche').value,
  para: $('#p-para').value, nombre: ($('#p-nombre').value || '').trim().slice(0, 16) || 'Ana',
});
function actualizarPrecio() {
  const p = leerPedido(), B = bebida(p.bebida);
  $('#p-tamano').disabled = !!B?.sinTamano; $('#p-leche').disabled = !B?.leche;
  $('#p-precio').textContent = `${describirPedido(p)} — ${formatear(precioPedido(p), estado.moneda)}`;
}
let vaso = null, temporizadores = [];
function limpiarPedido() {
  temporizadores.forEach(clearTimeout); temporizadores = [];
  if (vaso) { mundo.remove(vaso); ctx.pulsables = ctx.pulsables.filter(o => !vaso.children.includes(o)); vaso = null; }
  barra.pantalla(null); $('#dialogo').hidden = true; $('#dialogo').innerHTML = '';
}
function decir(quien, texto, clase = '') {
  const d = $('#dialogo'); d.hidden = false;
  if (!d.querySelector('.cerrar')) { const x = document.createElement('button'); x.className = 'cerrar'; x.textContent = '×'; x.setAttribute('aria-label', 'Cerrar el diálogo'); x.onclick = () => { d.hidden = true; }; d.append(x); }
  const p = document.createElement('p'); p.className = `linea ${quien === 'Tú' ? 'tu' : 'barista'} ${clase}`;
  p.innerHTML = `<b>${quien}:</b> ${texto}`; d.append(p); d.scrollTop = d.scrollHeight;
}
function pedir(entrada = leerPedido()) {
  const B = bebida(entrada.bebida); if (!B) return null;
  limpiarPedido();
  const p = { ...entrada, nombre: escapar((entrada.nombre || 'Ana').trim().slice(0, 16) || 'Ana'), total: precioPedido(entrada), fase: 'pedido' };
  estado.pedido = p;
  irA('caja');
  const desc = describirPedido(p), total = formatear(p.total, estado.moneda);
  const guion = [
    ['Barista', `¡Hola, buenos días! Bienvenido a ${MARCA.nombre}. ¿Qué te preparo?`],
    ['Tú', `Hola. Quiero ${desc}, por favor.`],
    ['Barista', '¿Para tomar aquí o para llevar?'],
    ['Tú', p.para === 'aqui' ? 'Para tomar aquí.' : 'Para llevar.'],
    ['Barista', '¿Me dices tu nombre? Lo escribo en el vaso.'],
    ['Tú', `${p.nombre}.`],
    ['Barista', `Perfecto, ${p.nombre}. Son <b>${total}</b>. ¿En efectivo o con tarjeta?`],
    ['Tú', 'Con tarjeta, por favor.'],
    ['Barista', 'Acerca la tarjeta a la terminal… ¡Listo! Te llamamos en <b>Recoge aquí</b>.'],
  ];
  barra.pantalla({ detalle: describirPedido(p, { articulo: false }), texto: total });
  guion.forEach(([q, t], i) => temporizadores.push(setTimeout(() => decir(q, t), i * 1300)));
  const fin = guion.length * 1300;
  temporizadores.push(setTimeout(() => { p.fase = 'preparando'; $('#status').textContent = 'Están preparando tu bebida en la barra…'; }, fin));
  temporizadores.push(setTimeout(() => entregar(p), fin + 4500));
  document.dispatchEvent(new CustomEvent('cafeteria:pedido', { detail: { ...p, totalTexto: total } }));
  return p;
}
function entregar(p) {
  if (estado.pedido !== p || p.fase === 'listo') return;
  p.fase = 'listo';
  vaso = crearVaso(p); vaso.position.copy(barra.entrega); mundo.add(vaso);
  const llamada = `¡${p.nombre}! ${describirPedido(p, { articulo: false }).replace(/^./, c => c.toUpperCase())}.`;
  decir('Barista', `<span class="llamada">${llamada}</span> <button id="ir-entrega">Ir a recogerla</button>`, 'fuerte');
  $('#ir-entrega').onclick = () => irA('entrega');
  mostrarNombre(`🔔 ${llamada}`, 5);
  $('#status').textContent = 'Tu bebida está en «Recoge aquí»: pulsa el vaso para recogerla.';
  document.dispatchEvent(new CustomEvent('cafeteria:listo', { detail: { ...p } }));
}
function tocaVaso(clientX, clientY) {
  const r = lienzo.getBoundingClientRect();
  puntero.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
  rayo.setFromCamera(puntero, camera); rayo.far = 9;
  return rayo.intersectObjects(vaso.children, false).length > 0;
}
/** El estudiante recoge su bebida: da las gracias y el vaso desaparece de la barra. */
function recoger() {
  const p = estado.pedido; if (!p || p.fase !== 'listo') return;
  p.fase = 'recogido'; temporizadores.forEach(clearTimeout); temporizadores = [];
  mundo.remove(vaso); ctx.pulsables = ctx.pulsables.filter(o => !vaso.children.includes(o)); vaso = null;
  barra.pantalla(null);
  decir('Tú', '¡Gracias!'); decir('Barista', '¡Con gusto! Que lo disfrutes.');
  mostrarNombre(p.para === 'aqui' ? 'Tienes tu bebida. Busca una mesa libre para sentarte.' : 'Tienes tu bebida para llevar. ¡Buen día!', 4);
  $('#status').textContent = 'Pedido terminado. Puedes pedir otra cosa desde el panel.';
  document.dispatchEvent(new CustomEvent('cafeteria:recogido', { detail: { ...p } }));
}
// Vaso del pedido: de papel (para llevar), de plástico con hielo (frías) o taza (para aquí), con el nombre escrito.
function crearVaso(p) {
  const g = new T.Group(); g.name = 'vaso-pedido';
  const B = bebida(p.bebida), frio = B.hielo, aqui = p.para === 'aqui' && !frio;
  const escala = B.sinTamano ? .7 : ({ chico: .88, mediano: 1, grande: 1.12 }[p.tamano] ?? 1);
  const pieza = (geo, mat, x, y, z, sx, sy, sz, rx = 0) => {
    const m = new T.Mesh(geo, typeof mat === 'string' ? kit.mat(mat) : mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; g.add(m); return m;
  };
  let alto;
  if (aqui) {
    alto = .1 * escala;
    pieza(kit.geo.cil16, 'ceramica', 0, .005, 0, .16, .01, .16);
    pieza(kit.geo.cil16, 'ceramica', 0, .01 + alto / 2, 0, .09 * escala, alto, .09 * escala);
    pieza(kit.geo.toro, 'ceramica', .05 * escala, .01 + alto / 2, 0, .06, .06, .06);
    pieza(kit.geo.cil16, '#c9a27a', 0, .01 + alto - .004, 0, .08 * escala, .004, .08 * escala);
  } else if (frio) {
    alto = .16 * escala;
    pieza(kit.geo.cono, kit.vidrio('#eef6f7', .45), 0, alto / 2, 0, .1 * escala, alto, .1 * escala, Math.PI);
    pieza(kit.geo.cono, B.id === 'limonada' ? '#f2e27a' : '#b88a5c', 0, alto * .42, 0, .085 * escala, alto * .8, .085 * escala, Math.PI);
    pieza(kit.geo.esfera, kit.vidrio('#eef6f7', .45), 0, alto, 0, .1 * escala, .05, .1 * escala);
    pieza(kit.geo.cil16, 'verde', .015, alto + .05, 0, .008, .14, .008);
  } else {
    alto = .15 * escala;
    pieza(kit.geo.cono, 'blanco', 0, alto / 2, 0, .09 * escala, alto, .09 * escala, Math.PI);
    pieza(kit.geo.cono, 'carton', 0, alto * .5, 0, .094 * escala, alto * .34, .094 * escala, Math.PI);   // funda: un poco más ancha que el vaso
    pieza(kit.geo.cil16, 'blanco', 0, alto + .006, 0, .096 * escala, .014, .096 * escala);
  }
  // Etiqueta con el nombre escrito a mano, de cara al cliente (sur)
  const et = ilustracion(.08, .03, 256, (c, w, h) => {
    c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b2a4a'; c.font = `italic 700 ${h * .7}px 'Comic Sans MS', 'Segoe Print', cursive`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(new DOMParser().parseFromString(p.nombre, 'text/html').body.textContent, w / 2, h * .55);
  });
  et.position.set(0, alto * (aqui ? .6 : .72), .05 * escala + (aqui ? .002 : .004)); if (!aqui) et.rotation.x = -.14;
  g.add(et);
  const nombre = `tu bebida: ${describirPedido(p)}, con tu nombre: <b>${p.nombre}</b>`;
  g.traverse(o => { if (o.isMesh) o.userData.nombre = nombre; });
  ctx.pulsables.push(...g.children);
  return g;
}

// ── Panel (PANEL.md: Escena · Luz y estilo · Calidad · Diagnóstico) ──────
$('#panel-toggle').onclick = () => {
  const p = $('#panel'), abrir = p.hidden; p.hidden = !abrir;
  $('#panel-toggle').setAttribute('aria-expanded', String(abrir)); $('#panel-toggle').textContent = abrir ? 'Cerrar ×' : 'Opciones ☰';
};
for (const v of VISTAS) { const b = document.createElement('button'); b.textContent = v.nombre; b.dataset.id = v.id; b.onclick = () => ir(v); $('#vistas').append(b); }
for (const [k, M] of Object.entries(MONEDAS)) $('#moneda').append(new Option(`${M.nombre} (${k})`, k));
for (const s of SECCIONES) {
  const og = document.createElement('optgroup'); og.label = s.titulo;
  for (const b of BEBIDAS.filter(b => b.seccion === s.id)) og.append(new Option(b.nombre, b.id));
  $('#p-bebida').append(og);
}
for (const t of TAMANOS) $('#p-tamano').append(new Option(`${t.nombre} (${t.oz} oz)`, t.id));
for (const l of LECHES) $('#p-leche').append(new Option(l.nombre.replace(/^./, c => c.toUpperCase()), l.id));
$('#p-bebida').value = 'latte'; $('#p-tamano').value = 'mediano';
if (prefs.nombre) $('#p-nombre').value = prefs.nombre;
for (const id of ['#p-bebida', '#p-tamano', '#p-leche', '#p-para', '#p-nombre']) $(id).addEventListener('input', actualizarPrecio);
$('#p-nombre').addEventListener('change', () => { prefs.nombre = $('#p-nombre').value.trim(); guardar(); });
$('#p-pedir').onclick = () => pedir();
$('#p-nombre').addEventListener('keydown', e => { if (e.key === 'Enter') pedir(); });
$('#moneda').onchange = e => usarMoneda(e.target.value);
montarPanelEstilo({ luz, contenedor: $('#panel-estilo'), clave: 'cafeteria.luz.v1' });
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
document.title = `SpanStories · ${MARCA.nombre} · Cafetería`;
usarMoneda(estado.moneda);
$('#metrics').textContent = `Colisiones: ${ctx.colisiones.length}\nPulsables: ${ctx.pulsables.length}\nLámparas: ${ctx.lamparas.length}\nMallas: ${(() => { let n = 0; mundo.traverse(o => { if (o.isMesh) n++; }); return n; })()}`;
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
redimensionar(); elegirLamparas(); actualizarPrecio();
requestAnimationFrame(t => { antes = t; cuadro(t); $('#cover').hidden = true; $('#status').textContent = 'Listo. Entra, haz la fila y pide en caja (Opciones ☰ → Tu pedido).'; });

if (dev) window.__cafeteria = window.__scene = { scene, camera, renderer, luz, ctx, jugador, estado, usarMoneda, nombrar, pedir, entregar, barra,
  view(x, z, y = yaw, p = 0) { jugador.x = x; jugador.z = z; yaw = y; pitch = p; apuntar(); },
  mover, choca, paso: dt => paso(dt), render: () => renderer.render(scene, camera),
  get yaw() { return yaw; }, get pitch() { return pitch; } };
// API para las historias de SpanStories
window.cafeteria = { ir: irA, moneda: usarMoneda, pedir, recoger, limpiar: () => { limpiarPedido(); estado.pedido = null; }, get estado() { return { ...estado }; } };
