// AccuRig / Reallusion (CC_Base_…): detección y paso de animaciones desde el maniquí (Mixamo).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { detectMapping } from '../src/core/humanoid.js';
import { Rig } from '../src/core/rig.js';
import { buildMannequin } from '../src/core/mannequin.js';
import { contractFor } from '../facial/CharacterLife.mjs';
import { LifeCharacter } from '../facial/LifeCharacter.js';

// Esqueleto como lo exporta AccuRig: pose A (brazos 45° abajo), Hip → Pelvis → muslos,
// huesos Twist/ShareBone, FBX en Z-arriba y centímetros, ejes locales arbitrarios.
// [nombre, padre, posición en metros (x = izquierda del personaje, y = arriba, z = delante)]
function accurigJoints(prefix = 'CC_Base_') {
  const a = Math.SQRT1_2;
  const J = [
    ['BoneRoot', null, [0, 0, 0]],
    ['Hip', 'BoneRoot', [0, 0.98, 0]],
    ['Pelvis', 'Hip', [0, 0.97, -0.01]],
    ['Waist', 'Hip', [0, 1.04, 0]],
    ['Spine01', 'Waist', [0, 1.16, 0]],
    ['Spine02', 'Spine01', [0, 1.3, 0]],
    ['NeckTwist01', 'Spine02', [0, 1.48, 0]],
    ['NeckTwist02', 'NeckTwist01', [0, 1.53, 0.01]],
    ['Head', 'NeckTwist02', [0, 1.58, 0.02]],
    ['FacialBone', 'Head', [0, 1.62, 0.06]],
    ['JawRoot', 'FacialBone', [0, 1.6, 0.03]],
    ['L_Eye', 'FacialBone', [0.032, 1.66, 0.08]],
    ['R_Eye', 'FacialBone', [-0.032, 1.66, 0.08]],
  ];
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    const sh = [sx * 0.17, 1.44, 0];
    const el = [sh[0] + sx * 0.28 * a, sh[1] - 0.28 * a, 0];
    const wr = [el[0] + sx * 0.26 * a, el[1] - 0.26 * a, 0.02];
    J.push(
      [`${S}_Clavicle`, 'Spine02', [sx * 0.03, 1.42, 0.02]],
      [`${S}_Upperarm`, `${S}_Clavicle`, sh],
      [`${S}_UpperarmTwist01`, `${S}_Upperarm`, sh.map((v, i) => (v + el[i]) / 2)],
      [`${S}_Forearm`, `${S}_Upperarm`, el],
      [`${S}_ElbowShareBone`, `${S}_Forearm`, el],
      [`${S}_ForearmTwist01`, `${S}_Forearm`, el.map((v, i) => (v + wr[i]) / 2)],
      [`${S}_Hand`, `${S}_Forearm`, wr],
      [`${S}_Thigh`, 'Pelvis', [sx * 0.09, 0.92, 0]],
      [`${S}_Calf`, `${S}_Thigh`, [sx * 0.09, 0.5, 0.01]],
      [`${S}_Foot`, `${S}_Calf`, [sx * 0.09, 0.08, -0.02]],
      [`${S}_ToeBase`, `${S}_Foot`, [sx * 0.09, 0.02, 0.12]],
    );
    for (const [f, dz] of [['Thumb', 0.04], ['Index', 0.025], ['Mid', 0], ['Ring', -0.02], ['Pinky', -0.035]]) {
      for (let n = 1; n <= 3; n++) {
        const d = 0.05 + 0.025 * n;
        J.push([`${S}_${f}${n}`, n === 1 ? `${S}_Hand` : `${S}_${f}${n - 1}`, [wr[0] + sx * d * a, wr[1] - d * a, wr[2] + dz]]);
      }
    }
  }
  return J.map(([n, p, pos]) => [prefix + n, p && prefix + p, pos]);
}

function buildAccurig(prefix) {
  const rnd = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  })();
  const root = new THREE.Group();
  const fbx = new THREE.Group(); // FBX Z-arriba en cm
  fbx.rotation.x = -Math.PI / 2;
  fbx.scale.setScalar(0.01);
  root.add(fbx);
  const bones = {};
  const worldM = {};
  const list = [];
  for (const [name, parent, [x, y, z]] of accurigJoints(prefix)) {
    const b = new THREE.Bone();
    b.name = name;
    // Coordenadas del FBX: (x, -delante, arriba) en cm, con una orientación local cualquiera.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    worldM[name] = new THREE.Matrix4().compose(new THREE.Vector3(x * 100, -z * 100, y * 100), q, new THREE.Vector3(1, 1, 1));
    const local = parent ? worldM[parent].clone().invert().multiply(worldM[name]) : worldM[name].clone();
    local.decompose(b.position, b.quaternion, b.scale);
    (parent ? bones[parent] : fbx).add(b);
    bones[name] = b;
    list.push(b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  fbx.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  return root;
}

test('detecta AccuRig / Reallusion con prefijo CC_Base_ y RL_', () => {
  for (const [prefix, conv] of [['CC_Base_', 'accurig'], ['RL_', 'accurigRL']]) {
    const det = detectMapping(accurigJoints(prefix).map(([n]) => n));
    assert.equal(det.convention, conv);
    assert.equal(det.mapping.hips, `${prefix}Hip`);
    assert.equal(det.mapping.spine, `${prefix}Waist`);
    assert.equal(det.mapping.neck, `${prefix}NeckTwist01`);
    assert.equal(det.mapping.upperArmL, `${prefix}L_Upperarm`);
    assert.equal(det.mapping.lowerLegR, `${prefix}R_Calf`);
    assert.equal(det.mapping.middle2L, `${prefix}L_Mid2`);
    assert.equal(Object.keys(det.mapping).length, 52);
    assert.ok(!Object.values(det.mapping).some((n) => /Twist0|ShareBone|Pelvis/.test(n) && !/NeckTwist01/.test(n)));
  }
});

test('una pose del maniquí Mixamo sale igual en un esqueleto AccuRig en pose A', () => {
  const man = new Rig(buildMannequin());
  const acc = new Rig(buildAccurig('CC_Base_'));
  assert.equal(acc.convention, 'accurig');
  assert.ok(acc.humanoid);
  // Pose de prueba sobre el maniquí: brazo izq. adelante, codo doblado, rodilla dcha. flexionada, torso girado.
  const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const pose = {
    q: { upperArmL: Q(0, -1.2, 0.3), lowerArmL: Q(0, -1.6, 0), upperArmR: Q(0, 0, 1.2), upperLegR: Q(-1.1, 0, 0), lowerLegR: Q(1.4, 0, 0), spine: Q(0, 0.4, 0), head: Q(0.3, 0, 0) },
    hips: new THREE.Vector3(0.05, -0.1, 0.2),
  };
  man.applyCanonical(pose);
  man.root.updateMatrixWorld(true);
  const cap = man.captureCanonical();
  acc.applyCanonical(cap);
  acc.root.updateMatrixWorld(true);
  const dir = (rig, a, b) => {
    const pa = new THREE.Vector3().setFromMatrixPosition(rig.bone(a).matrixWorld);
    const pb = new THREE.Vector3().setFromMatrixPosition(rig.bone(b).matrixWorld);
    return pb.sub(pa).normalize().applyQuaternion(rig.FqInv);
  };
  const pairs = [['upperArmL', 'lowerArmL'], ['lowerArmL', 'handL'], ['upperArmR', 'lowerArmR'], ['upperLegR', 'lowerLegR'], ['lowerLegR', 'footR'], ['upperLegL', 'lowerLegL'], ['chest', 'neck'], ['neck', 'head']];
  for (const [a, b] of pairs) {
    const ang = dir(man, a, b).angleTo(dir(acc, a, b));
    assert.ok(ang < 0.05, `${a}→${b}: ${(ang * 180 / Math.PI).toFixed(1)}°`);
  }
  // Desplazamiento de cadera proporcional a la altura de cada uno.
  const back = acc.captureCanonical();
  assert.ok(back.hips.distanceTo(cap.hips) < 1e-3, `cadera ${back.hips.toArray()} vs ${cap.hips.toArray()}`);
});

test('LifeCharacter (Taller facial) arma tronco, brazos, dedos y ojos de AccuRig por el mapa', () => {
  const root = buildAccurig('CC_Base_');
  const rig = new Rig(root);
  const contrato = contractFor(root, rig);
  assert.equal(contrato.huesos.cabeza, 'CC_Base_Head');
  assert.equal(contrato.huesos.ojo_L, 'CC_Base_L_Eye');
  assert.equal(contrato.huesos.ojo_R, 'CC_Base_R_Eye');
  assert.equal(contrato.huesos.mandibula, 'CC_Base_JawRoot');
  const vida = new LifeCharacter(root, contrato, {});
  const n = (b) => b?.name;
  assert.equal(n(vida.cuello), 'CC_Base_NeckTwist02');
  assert.equal(n(vida.pecho), 'CC_Base_Spine02');
  assert.equal(n(vida.espalda), 'CC_Base_Spine01');
  assert.equal(n(vida.lumbar), 'CC_Base_Waist');
  assert.equal(n(vida.cadera), 'CC_Base_Hip');
  assert.equal(vida.lados.length, 2);
  const [L, R] = vida.lados;
  assert.equal(L.signo, 1);
  assert.equal(n(L.brazo), 'CC_Base_L_Upperarm');
  assert.equal(n(R.antebrazo), 'CC_Base_R_Forearm');
  assert.equal(n(L.punta), 'CC_Base_L_ToeBase');
  assert.equal(n(L.dedos[1][0]), 'CC_Base_L_Mid1');
  assert.equal(L.pulgar.length, 3);
});
