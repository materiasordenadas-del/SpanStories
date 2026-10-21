import * as T from './engine/three.js';
import { luz } from './engine/Luz25D.js';
import { construirParadero } from './engine/Paradero.js';
import { construirCalle } from './engine/Calle.js';
import { construirManzana } from './engine/Manzana.js';
import { capturarEntorno } from './engine/Reflejos.js';
import { texturaCielo } from './engine/farmacia/Rotulos.js';
import { ACERA, CASETA, farmaciaEn } from './engine/dimensions.js';
import { montarPanelEstilo } from './panel/PanelEstilo.js';

/* Paradero de bus latinoamericano en una esquina: la calle, la farmacia
   (copiada del proyecto Farmacia, solo su casco) y el conjunto residencial.
   Montaje, sol con sombra, cámara orbital, panel y bucle. */

const $ = (s) => document.querySelector(s);
const viewport = $('#viewport');
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;   // solo para los receptores de la acera
viewport.prepend(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(35, 1, 0.1, 250);   // perspectiva suave (ESTILO.md §2)

const mundo = new T.Group(); mundo.name = 'mundo'; scene.add(mundo);
const calle = construirCalle(mundo);
const paradero = construirParadero(mundo);
paradero.grupo.traverse(o => { if (o.isMesh && !o.name.endsWith('_contorno')) o.castShadow = true; });
const manzana = construirManzana(mundo, calle);
luz.salas([manzana.sala]);                         // solo la farmacia tiene luz de techo
luz.ponerLamparas(manzana.lamparas, 'parada');

// Sol: proyecta la sombra que multiplican los receptores (Luz25D colorea el resto).
const sol = new T.DirectionalLight(0xffffff, 1);
sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: .5, far: 120 });
sol.shadow.bias = -.0004; sol.shadow.normalBias = .02;
sol.target.position.set(paradero.D.cx + 10, 0, 0);
scene.add(sol, sol.target);
let cielo = null;
const f = farmaciaEn();
const capturar = () => capturarEntorno(renderer, scene, { dentro: [f.x, 1.7, f.z - 3.9], fuera: [paradero.D.cx, 1.6, ACERA.z1 + 3] });
luz.alCambiar(A => {
  cielo?.dispose(); cielo = texturaCielo(A.cielo); scene.background = cielo;
  sol.position.copy(sol.target.position).addScaledVector(luz.direccionSol(), 50);
});

// Cámara orbital alrededor del paradero (arrastrar = girar, rueda = acercar).
const centro = new T.Vector3(paradero.D.cx, ACERA.alto + CASETA.alto * 0.5, paradero.D.zAtras + CASETA.fondo / 2);
const orbita = { yaw: 0.75, pitch: 0.16, dist: 13 };
// La cámara no entra en los edificios: se queda entre los paramentos de la avenida.
const zMax = calle.zEnf1 - 0.4, zMin = ACERA.z0 + 0.4;
function apuntar() {
  const { yaw, pitch, dist } = orbita;
  camera.position.set(centro.x + Math.sin(yaw) * Math.cos(pitch) * dist, centro.y + Math.sin(pitch) * dist, centro.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.position.z = Math.min(zMax, Math.max(zMin, camera.position.z));
  camera.lookAt(centro);
}
let arrastre = null;
renderer.domElement.addEventListener('pointerdown', (e) => { arrastre = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!arrastre) return;
  orbita.yaw -= (e.clientX - arrastre.x) * 0.005;
  orbita.pitch = Math.min(1.2, Math.max(0.02, orbita.pitch + (e.clientY - arrastre.y) * 0.004));
  arrastre = { x: e.clientX, y: e.clientY }; apuntar();
});
renderer.domElement.addEventListener('pointerup', () => { arrastre = null; });
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault(); orbita.dist = Math.min(34, Math.max(3.5, orbita.dist * (1 + Math.sign(e.deltaY) * 0.08))); apuntar();
}, { passive: false });
apuntar();

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  luz.viewport(width, height, renderer.getPixelRatio());
}
new ResizeObserver(resize).observe(viewport);

montarPanelEstilo({ luz, contenedor: $('#panel-estilo'), clave: 'parada.luz.v2' });
luz.alCambiar(() => capturar());
$('#panel-toggle').onclick = () => {
  const p = $('#panel'); p.hidden = !p.hidden; $('#panel-toggle').setAttribute('aria-expanded', String(!p.hidden));
};
$('#status').textContent = 'Paradero listo. Arrastra para girar, rueda para acercar.';
if (new URLSearchParams(location.search).has('dev')) window.__escena = { scene, renderer, camera, luz, paradero, manzana, orbita, apuntar };

capturar();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
