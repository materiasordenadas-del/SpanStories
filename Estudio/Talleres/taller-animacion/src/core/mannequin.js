// Maniquí propio (sin archivos externos): esqueleto compatible con Mixamo en pose T.
// Mismos nombres y jerarquía que un personaje de Mixamo cargado en three.js
// (mixamorigHips, mixamorigLeftArm…, sin el «:» que three.js quita al cargar).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const P = 'mixamorig';
const J = {
  [`${P}Hips`]: [null, [0, 0.95, 0]],
  [`${P}Spine`]: [`${P}Hips`, [0, 1.03, 0]],
  [`${P}Spine1`]: [`${P}Spine`, [0, 1.14, 0]],
  [`${P}Spine2`]: [`${P}Spine1`, [0, 1.27, 0]],
  [`${P}Neck`]: [`${P}Spine2`, [0, 1.46, 0]],
  [`${P}Head`]: [`${P}Neck`, [0, 1.55, 0.01]],
  [`${P}HeadTop_End`]: [`${P}Head`, [0, 1.78, 0.01]],
};
const FING = { Thumb: [0.025, -0.012, 0.035], Index: [0.085, 0, 0.03], Middle: [0.09, 0, 0.008], Ring: [0.087, 0, -0.012], Pinky: [0.08, 0, -0.03] };
for (const [W, x] of [['Left', 1], ['Right', -1]]) {
  Object.assign(J, {
    [`${P}${W}Shoulder`]: [`${P}Spine2`, [x * 0.03, 1.41, 0.01]],
    [`${P}${W}Arm`]: [`${P}${W}Shoulder`, [x * 0.18, 1.41, -0.01]],
    [`${P}${W}ForeArm`]: [`${P}${W}Arm`, [x * 0.46, 1.41, -0.02]],
    [`${P}${W}Hand`]: [`${P}${W}ForeArm`, [x * 0.71, 1.41, 0]],
    [`${P}${W}UpLeg`]: [`${P}Hips`, [x * 0.095, 0.92, 0]],
    [`${P}${W}Leg`]: [`${P}${W}UpLeg`, [x * 0.1, 0.5, 0.01]],
    [`${P}${W}Foot`]: [`${P}${W}Leg`, [x * 0.1, 0.085, -0.01]],
    [`${P}${W}ToeBase`]: [`${P}${W}Foot`, [x * 0.1, 0.02, 0.13]],
    [`${P}${W}Toe_End`]: [`${P}${W}ToeBase`, [x * 0.1, 0.02, 0.2]],
  });
  for (const [f, [dx, dy, dz]] of Object.entries(FING)) {
    const thumb = f === 'Thumb';
    const step = thumb ? 0.03 : f === 'Pinky' ? 0.022 : 0.028;
    let prev = `${P}${W}Hand`;
    let p = [x * (0.71 + dx), 1.41 + dy, dz];
    for (let n = 1; n <= 4; n++) {
      const name = `${P}${W}Hand${f}${n}`; // el 4 es la punta, como en Mixamo
      J[name] = [prev, p.slice()];
      prev = name;
      if (thumb) p = [p[0] + x * step * 0.7, p[1] - step * 0.15, p[2] + step * 0.7];
      else p = [p[0] + x * step, p[1], p[2]];
    }
  }
}

const isFinger = (n) => /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n);
const isEnd = (n) => /_End$|Hand(Thumb|Index|Middle|Ring|Pinky)4$/.test(n);

// Grosor (radio) de cada segmento hueso→hijo.
const RAD = {
  Hips: 0.115, Spine: 0.12, Spine1: 0.13, Spine2: 0.14, Neck: 0.05,
  Shoulder: 0.045, Arm: 0.05, ForeArm: 0.042, Hand: 0.035,
  UpLeg: 0.075, Leg: 0.055, Foot: 0.045, ToeBase: 0.035,
};
function radiusOf(name) {
  if (isFinger(name)) return 0.011;
  const base = name.slice(P.length).replace(/^(Left|Right)/, '');
  return RAD[base] || 0.03;
}

function segment(a, b, r) {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 0.6), 6, 12);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function sphere(c, r) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.translate(c.x, c.y, c.z);
  return g;
}

function skin(g, boneIndex) {
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = boneIndex;
    sw[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (!g.index) return g;
  return g.toNonIndexed();
}

export function buildMannequin() {
  const root = new THREE.Group();
  root.name = 'Maniquí';
  const bones = {};
  const list = [];
  const world = {};
  for (const [name, [parent, pos]] of Object.entries(J)) {
    const b = new THREE.Bone();
    b.name = name;
    world[name] = new THREE.Vector3(...pos);
    if (parent) {
      b.position.copy(world[name]).sub(world[parent]);
      bones[parent].add(b);
    } else b.position.copy(world[name]);
    bones[name] = b;
    list.push(b);
  }
  const idx = Object.fromEntries(list.map((b, i) => [b.name, i]));
  const bodyParts = [];
  const jointParts = [];
  for (const [name, [parent]] of Object.entries(J)) {
    if (!parent || isEnd(name)) continue;
    const r = radiusOf(parent);
    const a = world[parent];
    const b = world[name];
    // El segmento pertenece al hueso padre.
    if (parent === `${P}Spine2` && name.endsWith('Shoulder')) continue;
    if (/Hand$/.test(parent) && !/HandMiddle1$/.test(name)) continue;
    bodyParts.push(skin(segment(a, b, r), idx[parent]));
    if (!isFinger(parent)) jointParts.push(skin(sphere(a, r * 0.92), idx[parent]));
  }
  // Palma, cabeza, hombros, pies.
  for (const s of ['Left', 'Right']) {
    const h = world[`${P}${s}Hand`];
    const palm = new THREE.BoxGeometry(0.09, 0.025, 0.08);
    palm.translate(h.x + (s === 'Left' ? 0.045 : -0.045), h.y, h.z);
    bodyParts.push(skin(palm, idx[`${P}${s}Hand`]));
    const f = world[`${P}${s}Foot`];
    const foot = new THREE.BoxGeometry(0.09, 0.07, 0.19);
    foot.translate(f.x, 0.045, f.z + 0.06);
    bodyParts.push(skin(foot, idx[`${P}${s}Foot`]));
  }
  const head = new THREE.SphereGeometry(0.105, 20, 16);
  head.scale(0.92, 1.12, 1);
  head.translate(0, 1.66, 0.015);
  bodyParts.push(skin(head, idx[`${P}Head`]));
  const nose = new THREE.ConeGeometry(0.02, 0.05, 8);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 1.65, 0.12);
  bodyParts.push(skin(nose, idx[`${P}Head`]));

  const bodyGeo = mergeGeometries(bodyParts, false);
  const jointGeo = mergeGeometries(jointParts, false);
  const skeleton = new THREE.Skeleton(list);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.55, metalness: 0.05 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x7b5cd6, roughness: 0.5 });
  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  body.name = 'Maniqui_cuerpo';
  const joints = new THREE.SkinnedMesh(jointGeo, jointMat);
  joints.name = 'Maniqui_articulaciones';
  root.add(bones[`${P}Hips`]);
  root.add(body, joints);
  root.updateMatrixWorld(true);
  body.bind(skeleton);
  joints.bind(skeleton);
  body.castShadow = joints.castShadow = true;
  body.frustumCulled = joints.frustumCulled = false;
  return root;
}
