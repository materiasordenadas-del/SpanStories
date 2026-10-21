import * as T from './engine/three.js';
import { luz, AMBIENTES } from './engine/Luz25D.js';
import { crearKit, crearLote } from './engine/Kit.js';
import { crearProductos } from './engine/Productos.js';
import { construirCasco } from './engine/Casco.js';
import { construirMobiliario } from './engine/Mobiliario.js';
import { capturarEntorno, setReflejos } from './engine/Reflejos.js';
import { texturaCielo } from './engine/Rotulos.js';
import { SALAS, VISTAS, OJO, RADIO_JUGADOR } from './engine/config.js';

/* ── Farmacia del Barrio · visor ──────────────────────────────────────────
   Primera persona a la altura del ojo (1,62 m): WASD o flechas para caminar,
   arrastrar para mirar, pulsar un objeto para conocer su nombre.
   ?vista=<id> arranca en un punto de vista, ?amb=<ambiente> fija la luz,
   ?dev expone window.__farmacia (para capturas y auditoría). */

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const visor = $('#visor');

const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
visor.prepend(renderer.domElement);

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(58, 1, .05, 120);
camera.rotation.order = 'YXZ';
let camaraFija = null;          // solo ?dev: encuadre libre para auditar (planta, detalles)

// Sol: solo proyecta la sombra que multiplican los receptores de la acera
// (el color y el sombreado los calcula Luz25D en cada material).
const sol = new T.DirectionalLight(0xffffff, 1);
sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: .5, far: 70 });
sol.shadow.bias = -.0004; sol.shadow.normalBias = .02;
sol.target.position.set(0, 0, 4);
scene.add(sol, sol.target);

/* ── Construcción ── */
const t0 = performance.now();
const kit = crearKit();
const grupo = new T.Group(); grupo.name = 'Farmacia'; scene.add(grupo);
const exteriorGrupo = new T.Group(); exteriorGrupo.name = 'Fachada y calle'; grupo.add(exteriorGrupo);
const lote = crearLote(kit), exterior = crearLote(kit), prod = crearProductos();
const colisiones = [], animables = [], pulsables = [];
const ctx = { kit, lote, exterior, prod, grupo, colisiones, animables };
const casco = construirCasco(ctx);
ctx.lamparas = casco.lamparas;
construirMobiliario(ctx);
const nProductos = prod.total();
lote.construir(grupo, pulsables);
exterior.construir(exteriorGrupo, pulsables);
exteriorGrupo.traverse(o => { if (o.isMesh && o.name !== 'contorno') o.castShadow = true; });
prod.construir(grupo, pulsables);
luz.salas([SALAS.tienda.rect]);
luz.ponerLamparas(ctx.lamparas, 'farmacia');
const tConstruir = performance.now() - t0;

/* ── Luz, cielo y reflejos ── */
let cielo = null;
luz.alCambiar(A => {
  cielo?.dispose(); cielo = texturaCielo(A.cielo); scene.background = cielo;
  const d = luz.direccionSol();
  sol.position.copy(sol.target.position).addScaledVector(d, 35);
});
const capturar = () => capturarEntorno(renderer, scene, { dentro: [0, 1.5, -3.9], fuera: [.2, 1.6, 4.5] });

const selAmb = $('#ambiente');
for (const [k, A] of Object.entries(AMBIENTES)) selAmb.add(new Option(A.nombre, k));
const usarAmbiente = k => { luz.usarAmbiente(k); selAmb.value = k; capturar(); };
selAmb.addEventListener('change', () => usarAmbiente(selAmb.value));
$('#contorno').addEventListener('change', e => luz.contorno({ activo: e.target.checked }));
$('#grosor').addEventListener('input', e => { luz.contorno({ grosor: +e.target.value }); $('#grosor-valor').textContent = `${(+e.target.value).toFixed(1)} px`; });
$('#reflejos').addEventListener('change', e => setReflejos(e.target.checked));

/* ── Jugador y colisiones ── */
const jugador = { x: 0, z: 7, yaw: 0, pitch: 0 };
const rects = colisiones.map(([a, b, c, d]) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]);
const choca = (x, z) => rects.some(([x0, z0, x1, z1]) => {
  const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
  return (x - cx) ** 2 + (z - cz) ** 2 < RADIO_JUGADOR ** 2;
});
function mover(dx, dz) {
  // si una vista deja al jugador rozando un mueble, puede salir sin quedarse trabado
  const atrapado = choca(jugador.x, jugador.z);
  if (atrapado || !choca(jugador.x + dx, jugador.z)) jugador.x += dx;
  if (atrapado || !choca(jugador.x, jugador.z + dz)) jugador.z += dz;
}
function irA(v) { Object.assign(jugador, { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch }); marcarVista(v.id); }

const teclas = new Set();
addEventListener('keydown', e => { if (e.target.closest?.('select, input')) return; teclas.add(e.code); });
addEventListener('keyup', e => teclas.delete(e.code));
addEventListener('blur', () => teclas.clear());
// Pantallas táctiles: mantener pulsado ▲ / ▼ para caminar (arrastrar sigue girando la vista).
for (const [id, code] of [['#avanzar', 'KeyW'], ['#retroceder', 'KeyS']]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); teclas.add(code); b.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => teclas.delete(code));
}

let arrastre = null;
const lienzo = renderer.domElement;
lienzo.addEventListener('pointerdown', e => { arrastre = { x: e.clientX, y: e.clientY, movido: 0 }; lienzo.setPointerCapture(e.pointerId); });
lienzo.addEventListener('pointermove', e => {
  if (!arrastre) return;
  const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
  arrastre.x = e.clientX; arrastre.y = e.clientY; arrastre.movido += Math.abs(dx) + Math.abs(dy);
  jugador.yaw -= dx * .0042; jugador.pitch = T.MathUtils.clamp(jugador.pitch - dy * .0036, -1.2, 1.2);
});
lienzo.addEventListener('pointerup', e => { if (arrastre && arrastre.movido < 5) identificar(e); arrastre = null; });
lienzo.addEventListener('pointercancel', () => { arrastre = null; });

/* ── Pulsar un objeto: su nombre ── */
const rayo = new T.Raycaster(), puntero = new T.Vector2();
const etiqueta = $('#etiqueta');
let ocultarEtiqueta = 0;
function identificar(e) {
  const r = lienzo.getBoundingClientRect();
  puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(puntero, camera);
  const golpe = rayo.intersectObject(grupo, true).find(h => h.object.visible && h.object.name !== 'contorno' && h.object.name !== 'sombras');
  if (!golpe) return;
  const o = golpe.object;
  const nombre = (golpe.instanceId !== undefined && o.userData.nombres?.[golpe.instanceId]) || o.userData.nombre || (o.name && o.name !== 'Farmacia' ? o.name : null)
    || o.parent?.userData?.nombre || o.parent?.name;
  if (!nombre) return;
  etiqueta.textContent = nombre; etiqueta.hidden = false;
  clearTimeout(ocultarEtiqueta); ocultarEtiqueta = setTimeout(() => { etiqueta.hidden = true; }, 2600);
}

/* ── Vistas ── */
const lista = $('#vistas');
for (const v of VISTAS) {
  const b = document.createElement('button'); b.textContent = v.nombre; b.dataset.id = v.id;
  b.addEventListener('click', () => irA(v));
  lista.append(b);
}
function marcarVista(id) { for (const b of lista.children) b.classList.toggle('activa', b.dataset.id === id); }
$('#panel-boton').addEventListener('click', () => {
  const p = $('#panel'), abierto = p.hidden;
  p.hidden = !abierto; $('#panel-boton').setAttribute('aria-expanded', String(abierto));
});

/* ── Tamaño ── */
function ajustar() {
  const { width, height } = visor.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);   // el CSS manda en el tamaño: el lienzo no empuja el diseño
  camera.aspect = width / height;
  // En pantallas altas se conserva el campo horizontal de un 6:5 (si no, un
  // teléfono vertical solo vería la puerta).
  const H_FOV = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(29)) * 1.2);
  if (!camaraFija) camera.fov = camera.aspect < 1.2 ? Math.min(92, T.MathUtils.radToDeg(2 * Math.atan(Math.tan(H_FOV / 2) / camera.aspect))) : 58;
  camera.updateProjectionMatrix();
  luz.viewport(width, height, renderer.getPixelRatio());
}
new ResizeObserver(ajustar).observe(visor);
ajustar();

/* ── Arranque ── */
irA(VISTAS.find(v => v.id === params.get('vista')) || VISTAS[0]);
usarAmbiente(AMBIENTES[params.get('amb')] ? params.get('amb') : 'mediodia');
$('#estado').textContent = `${nProductos.toLocaleString('es-MX')} productos en anaquel · construido en ${Math.round(tConstruir)} ms`;

let previo = performance.now();
function cuadro(ahora) {
  const dt = Math.min(.05, (ahora - previo) / 1000); previo = ahora;
  const v = (teclas.has('ShiftLeft') ? 2.6 : 1.5) * dt;
  let f = 0, l = 0;
  if (teclas.has('KeyW') || teclas.has('ArrowUp')) f += 1;
  if (teclas.has('KeyS') || teclas.has('ArrowDown')) f -= 1;
  if (teclas.has('KeyA')) l += 1;
  if (teclas.has('KeyD')) l -= 1;
  if (teclas.has('ArrowLeft')) jugador.yaw += 1.6 * dt;
  if (teclas.has('ArrowRight')) jugador.yaw -= 1.6 * dt;
  if (f || l) {
    const s = Math.sin(jugador.yaw), c = Math.cos(jugador.yaw), n = Math.hypot(f, l);
    mover((-s * f - c * l) / n * v, (-c * f + s * l) / n * v);
    marcarVista(null);
  }
  for (const a of animables) a(dt, jugador);
  if (camaraFija) { camera.position.set(...camaraFija.pos); camera.lookAt(...camaraFija.mira); }
  else { camera.position.set(jugador.x, OJO, jugador.z); camera.rotation.set(jugador.pitch, jugador.yaw, 0); }   // pitch > 0 mira arriba
  renderer.render(scene, camera);
  requestAnimationFrame(cuadro);
}
requestAnimationFrame(cuadro);

if (params.has('dev')) {
  window.__farmacia = {
    T, scene, camera, renderer, luz, jugador, colisiones: rects, prod,
    view(x, z, yaw = 0, pitch = 0) { Object.assign(jugador, { x, z, yaw, pitch }); },
    ir(id) { irA(VISTAS.find(v => v.id === id)); },
    ambiente: usarAmbiente,
    fijar(pos, mira, fov = 58) { camaraFija = { pos, mira }; camera.fov = fov; camera.updateProjectionMatrix(); },
    soltar() { camaraFija = null; camera.rotation.order = 'YXZ'; ajustar(); },
    info: () => ({ ...renderer.info.render, geometrias: renderer.info.memory.geometries, texturas: renderer.info.memory.textures, productos: nProductos, ms: Math.round(tConstruir) }),
  };
}
