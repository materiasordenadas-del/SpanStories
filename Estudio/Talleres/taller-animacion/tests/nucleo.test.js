import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { detectMapping, normalizeName } from '../src/core/humanoid.js';
import { solveTwoBone } from '../src/core/ik.js';

test('detecta Mixamo (con y sin prefijo saneado)', () => {
  const names = ['mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigNeck', 'mixamorigHead', 'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand', 'mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand', 'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigRightUpLeg', 'mixamorigRightLeg'];
  const { mapping, convention } = detectMapping(names);
  assert.equal(convention, 'mixamo');
  assert.equal(mapping.upperArmL, 'mixamorigLeftArm');
  assert.equal(mapping.lowerLegR, 'mixamorigRightLeg');
});

test('detecta Unreal/Quaternius y Rigify', () => {
  const ue = detectMapping(['root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r']);
  assert.equal(ue.convention, 'ue');
  assert.equal(ue.mapping.head, 'Head');
  const rg = detectMapping(['DEF-spine', 'DEF-spine001', 'DEF-spine002', 'DEF-spine003', 'DEF-spine004', 'DEF-spine006', 'DEF-upper_armL', 'DEF-forearmL', 'DEF-handL', 'DEF-upper_armR', 'DEF-forearmR', 'DEF-handR', 'DEF-thighL', 'DEF-shinL', 'DEF-thighR', 'DEF-shinR']);
  assert.equal(rg.convention, 'rigify');
  assert.equal(rg.mapping.hips, 'DEF-spine');
  assert.equal(rg.mapping.upperArmL, 'DEF-upper_armL');
  assert.equal(normalizeName('DEF-upper_arm.L'), 'upperarml');
});

test('IK de dos huesos llega al objetivo', () => {
  const a = new THREE.Bone();
  const b = new THREE.Bone();
  const c = new THREE.Bone();
  a.add(b);
  b.add(c);
  b.position.set(0.3, 0, 0);
  c.position.set(0.3, 0, 0);
  const scene = new THREE.Group();
  scene.add(a);
  scene.updateMatrixWorld(true);
  const target = new THREE.Vector3(0.25, 0.3, 0.1);
  solveTwoBone(a, b, c, target, new THREE.Vector3(0, 0, -1));
  scene.updateMatrixWorld(true);
  const p = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
  assert.ok(p.distanceTo(target) < 1e-4, `distancia ${p.distanceTo(target)}`);
});
