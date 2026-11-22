// Muñeco del panel «Editar capa de movimiento»: un maniquí 3D gris (tipo arcilla) en pose A, de frente, con dos
// manos grandes a los lados (puño según los dedos). Se dibuja con three.js en un lienzo propio, una sola vez por
// estado, y se usa como imagen de fondo; los puntos de control (SVG) se colocan con las mismas coordenadas 3D.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Tamaño del escenario del muñeco (unidades del viewBox SVG = píxeles CSS de la imagen). */
export const STAGE_W = 400;
export const STAGE_H = 352;
const SCALE = 160; // píxeles por metro
const FEET_Y = 300; // la planta de los pies, en píxeles desde arriba
const DPR = 2;

const A = (deg) => THREE.MathUtils.degToRad(deg);
// Articulaciones en pose A (metros; x+ = izquierda del personaje = derecha de la pantalla).
const J = {
  head: [0, 1.655],
  neck: [0, 1.49],
  upperChest: [0, 1.33],
  spine: [0, 1.15],
  hips: [0, 0.975],
};
const ARM_UP = 0.275;
const ARM_LO = 0.255;
for (const [s, x] of [['L', 1], ['R', -1]]) {
  const sh = [x * 0.185, 1.425];
  const el = [sh[0] + x * Math.sin(A(24)) * ARM_UP, sh[1] - Math.cos(A(24)) * ARM_UP];
  const wr = [el[0] + x * Math.sin(A(30)) * ARM_LO, el[1] - Math.cos(A(30)) * ARM_LO];
  Object.assign(J, {
    [`shoulder${s}`]: [x * 0.085, 1.45],
    [`upperArm${s}`]: sh,
    [`lowerArm${s}`]: el,
    [`hand${s}`]: wr,
    [`upperLeg${s}`]: [x * 0.092, 0.905],
    [`lowerLeg${s}`]: [x * 0.104, 0.5],
    [`foot${s}`]: [x * 0.112, 0.095],
    [`toes${s}`]: [x * 0.118, 0.022],
  });
}
/** Centro de cada mano grande (palma), en píxeles. */
export const PALM = { R: [50, 162], L: [STAGE_W - 50, 162] };
const PALM_SCALE = 3.05;

/** Punto de una articulación en píxeles del escenario. */
export function jointXY(canon) {
  const p = J[canon];
  if (!p) return null;
  return [STAGE_W / 2 + p[0] * SCALE, FEET_Y - p[1] * SCALE];
}

let R = null; // { renderer, scene, camera, body, hands }
const cache = new Map();

function mat() {
  return new THREE.MeshStandardMaterial({ color: 0xa3a5a8, roughness: 0.48, metalness: 0.0 });
}

/** Segmento redondeado entre dos puntos (cono truncado con bolas en los extremos). */
function limb(group, a, b, r1, r2, m, z = 0) {
  const va = new THREE.Vector3(a[0], a[1], z);
  const vb = new THREE.Vector3(b[0], b[1], z);
  const len = va.distanceTo(vb);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 32, 1, true), m);
  cyl.position.copy(va).add(vb).multiplyScalar(0.5);
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const ca = new THREE.Mesh(new THREE.SphereGeometry(r1, 32, 16), m);
  ca.position.copy(va);
  const cb = new THREE.Mesh(new THREE.SphereGeometry(r2, 32, 16), m);
  cb.position.copy(vb);
  group.add(cyl, ca, cb);
}

function blob(group, m, [x, y, z], [sx, sy, sz]) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), m);
  s.position.set(x, y, z);
  s.scale.set(sx, sy, sz);
  group.add(s);
  return s;
}

function buildBody() {
  const g = new THREE.Group();
  const m = mat();
  // tronco: pelvis, abdomen, pecho, cuello y cabeza (volúmenes que se funden)
  blob(g, m, [0, 0.93, 0], [0.155, 0.115, 0.1]);
  blob(g, m, [0, 1.06, 0], [0.128, 0.13, 0.088]);
  blob(g, m, [0, 1.19, 0.004], [0.135, 0.12, 0.09]);
  blob(g, m, [0, 1.33, 0.006], [0.172, 0.13, 0.1]);
  blob(g, m, [0, 1.41, 0], [0.19, 0.06, 0.085]);
  limb(g, [0, 1.42], [0, 1.56], 0.05, 0.042, m);
  blob(g, m, [0, 1.665, 0.01], [0.092, 0.118, 0.1]);
  blob(g, m, [0, 1.6, 0.03], [0.07, 0.07, 0.07]);
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    blob(g, m, [J[`upperArm${s}`][0] - x * 0.012, J[`upperArm${s}`][1], 0], [0.062, 0.062, 0.06]);
    limb(g, J[`upperArm${s}`], J[`lowerArm${s}`], 0.05, 0.04, m);
    limb(g, J[`lowerArm${s}`], J[`hand${s}`], 0.04, 0.028, m);
    // mano del muñeco (pequeña, colgando)
    const w = J[`hand${s}`];
    const dir = new THREE.Vector2(w[0] - J[`lowerArm${s}`][0], w[1] - J[`lowerArm${s}`][1]).normalize();
    const hc = blob(g, m, [w[0] + dir.x * 0.07, w[1] + dir.y * 0.07, 0.004], [0.034, 0.075, 0.022]);
    hc.rotation.z = Math.atan2(dir.y, dir.x) + Math.PI / 2;
    // piernas: muslo con volumen arriba, gemelo marcado, tobillo fino
    limb(g, [J[`upperLeg${s}`][0] - x * 0.008, J[`upperLeg${s}`][1] + 0.02], J[`lowerLeg${s}`], 0.083, 0.052, m);
    limb(g, J[`lowerLeg${s}`], J[`foot${s}`], 0.05, 0.031, m);
    blob(g, m, [J[`lowerLeg${s}`][0] + x * 0.004, 0.36, -0.01], [0.054, 0.1, 0.05]);
    blob(g, m, [J[`lowerLeg${s}`][0], J[`lowerLeg${s}`][1], 0.01], [0.052, 0.055, 0.05]);
    // pie visto de frente
    blob(g, m, [J[`foot${s}`][0] + x * 0.008, 0.042, 0.05], [0.045, 0.04, 0.115]);
  }
  return g;
}

/** Mano grande con la palma de cara, dedos arriba; curl 0 = abierta, 90 = puño. thumb = +1 o -1 (lado del pulgar). */
function buildHand(curl, thumb) {
  const g = new THREE.Group();
  const m = mat();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.092, 0.03, 5, 0.013), m);
  g.add(palm);
  const k = THREE.MathUtils.clamp(curl / 90, -0.1, 1.05);
  const fingers = [
    [0.03, 0.075, 0.0092],
    [0.01, 0.084, 0.0095],
    [-0.01, 0.08, 0.009],
    [-0.03, 0.064, 0.0082],
  ];
  fingers.forEach(([fx, len, r], i) => {
    let parent = new THREE.Group();
    parent.position.set(fx * thumb, 0.044 - (i === 3 ? 0.006 : i === 0 ? 0.002 : 0), 0.002);
    parent.rotation.z = -thumb * (i - 1.5) * 0.045 * (1 - k);
    g.add(parent);
    const parts = [0.44, 0.32, 0.24];
    parts.forEach((p, j) => {
      const seg = len * p;
      const jnt = new THREE.Group();
      jnt.rotation.x = A((j === 0 ? 82 : j === 1 ? 100 : 70) * k);
      parent.add(jnt);
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - j * 0.08), seg, 6, 16), m);
      c.position.y = seg / 2;
      jnt.add(c);
      const next = new THREE.Group();
      next.position.y = seg;
      jnt.add(next);
      parent = next;
    });
  });
  // pulgar: sale de la base de la palma hacia el lado del cuerpo y se cruza sobre la palma al cerrar
  const tb = new THREE.Group();
  tb.position.set(0.036 * thumb, -0.03, 0.01);
  tb.rotation.z = -thumb * A(48 - 30 * k);
  tb.rotation.y = thumb * A(-35 * k);
  g.add(tb);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.034, 6, 16), m);
  t1.position.y = 0.017;
  tb.add(t1);
  const tj = new THREE.Group();
  tj.position.y = 0.036;
  tj.rotation.z = thumb * A(14 + 40 * k);
  tj.rotation.x = A(40 * k);
  tb.add(tj);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.03, 6, 16), m);
  t2.position.y = 0.015;
  tj.add(t2);
  // muñeca
  const wr = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.03, 6, 16), m);
  wr.position.y = -0.062;
  wr.scale.z = 0.7;
  g.add(wr);
  return g;
}

function ensure() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE_W * DPR, STAGE_H * DPR, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x26282c, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-0.8, 1.6, 2.2);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6);
  fill.position.set(1.4, 0.2, 1.2);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(0.6, 1.2, -2);
  scene.add(key, fill, rim);
  // cámara ortográfica: 1 unidad = SCALE píxeles, suelo en FEET_Y
  const w = STAGE_W / SCALE;
  const top = FEET_Y / SCALE;
  const camera = new THREE.OrthographicCamera(-w / 2, w / 2, top, top - STAGE_H / SCALE, 0.1, 20);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, camera.position.y, 0);
  const body = buildBody();
  scene.add(body);
  R = { renderer, scene, camera, body, hands: [] };
  return R;
}

const px2w = ([x, y]) => [(x - STAGE_W / 2) / SCALE, (FEET_Y - y) / SCALE];

/**
 * Imagen (data URL) del muñeco con las manos grandes cerradas según curlL / curlR (grados, 0 = abierta).
 * Se cachea por estado (pasos de 15°): mover un deslizador no vuelve a dibujar en cada píxel.
 */
export function dummyImage(curlL = 0, curlR = 0) {
  const q = (c) => Math.round(THREE.MathUtils.clamp(+c || 0, -10, 95) / 15) * 15;
  const key = `${q(curlL)}|${q(curlR)}`;
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    const r = ensure();
    for (const hnd of r.hands) r.scene.remove(hnd);
    r.hands = [];
    for (const [side, curl] of [['L', q(curlL)], ['R', q(curlR)]]) {
      // mano derecha del personaje a la izquierda de la pantalla, con el pulgar hacia el cuerpo
      const hnd = buildHand(curl, side === 'R' ? 1 : -1);
      const [x, y] = px2w(PALM[side]);
      hnd.position.set(x, y, 0.4);
      hnd.scale.setScalar(PALM_SCALE);
      r.scene.add(hnd);
      r.hands.push(hnd);
    }
    r.renderer.render(r.scene, r.camera);
    url = r.renderer.domElement.toDataURL('image/png');
  } catch (e) {
    console.warn('Muñeco 3D no disponible', e);
  }
  if (cache.size > 40) cache.clear();
  cache.set(key, url);
  return url;
}
