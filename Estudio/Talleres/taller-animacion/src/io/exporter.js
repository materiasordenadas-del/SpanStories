// Hornea la animación evaluada y la escribe en GLB sobre el esqueleto del propio personaje.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clipToJSON, makeClip, newPose } from '../core/clip.js';

/** Hornea [a,b] a un AnimationClip con pistas por uuid de hueso. */
export function bakeAnimationClip(engine, name, [a, b] = engine.range(), { sourceHierarchy = false } = {}) {
  const rig = engine.rig;
  const fps = engine.fps;
  const n = b - a + 1;
  const times = new Float32Array(n);
  const qs = rig.bones.map(() => new Float32Array(n * 4));
  const ps = rig.bones.map(() => new Float32Array(n * 3));
  const parents = sourceHierarchy && rig.kind === 'quadruped' ? rig.sourceParents : null;
  const ss = parents ? rig.bones.map(() => new Float32Array(n * 3)) : null;
  const local = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const morphs = [];
  if (engine.evaluateFace) rig.root.traverse(mesh => {
    if (mesh.isMesh && mesh.morphTargetInfluences?.length) morphs.push({mesh, values:new Float32Array(n*mesh.morphTargetInfluences.length)});
  });
  for (let i = 0; i < n; i++) {
    engine.evaluate(a + i);
    if (parents) rig.root.updateWorldMatrix(true, true);
    times[i] = i / fps;
    rig.bones.forEach((bone, j) => {
      if (parents) {
        const parent = parents.get(bone) || bone.parent;
        local.copy(parent.matrixWorld).invert().multiply(bone.matrixWorld).decompose(p, q, s);
        q.toArray(qs[j], i * 4);p.toArray(ps[j], i * 3);s.toArray(ss[j], i * 3);
        return;
      }
      bone.quaternion.toArray(qs[j], i * 4);
      bone.position.toArray(ps[j], i * 3);
    });
    for (const {mesh,values} of morphs) values.set(mesh.morphTargetInfluences, i*mesh.morphTargetInfluences.length);
  }
  const tracks = [];
  rig.bones.forEach((bone, j) => {
    if (parents) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, qs[j]),
        new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, times, ps[j]),
        new THREE.VectorKeyframeTrack(`${bone.uuid}.scale`, times, ss[j]));
      return;
    }
    const q = qs[j];
    const p = ps[j];
    let moved = false;
    let movedP = false;
    for (let i = 1; i < n && !(moved && movedP); i++) {
      for (let k = 0; k < 4; k++) if (Math.abs(q[i * 4 + k] - q[k]) > 1e-6) moved = true;
      for (let k = 0; k < 3; k++) if (Math.abs(p[i * 3 + k] - p[k]) > 1e-7) movedP = true;
    }
    const rq = rig.restQ[j];
    if (!moved && Math.abs(q[0] - rq.x) + Math.abs(q[1] - rq.y) + Math.abs(q[2] - rq.z) + Math.abs(q[3] - rq.w) > 1e-6) moved = true;
    if (moved || rig.canonOf.has(bone)) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, q));
    if (movedP || rig.canonOf.get(bone) === 'hips') tracks.push(new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, times, p));
  });
  for (const {mesh,values} of morphs) tracks.push(new THREE.NumberKeyframeTrack(`${mesh.uuid}.morphTargetInfluences`, times, values));
  return new THREE.AnimationClip(name, (n - 1) / fps, tracks);
}

/** GLB con el personaje en reposo + las animaciones horneadas. withMesh=false: solo esqueleto. */
export async function exportGLB(engine, clips, { withMesh = true } = {}) {
  const rig = engine.rig;
  rig.resetToRest();
  rig.root.updateMatrixWorld(true);
  const hidden = [];
  if (!withMesh) {
    rig.root.traverse((o) => {
      if (o.isMesh && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
  }
  try {
    const exporter = new GLTFExporter();
    const res = await exporter.parseAsync(rig.root, { binary: true, animations: clips, onlyVisible: true });
    return res;
  } finally {
    hidden.forEach((o) => (o.visible = true));
    engine.evaluate(engine.frame);
  }
}

/** Clip canónico (para la biblioteca) del resultado actual. */
export function bakeCanonical(engine, { id, name, tags = [] }) {
  const rig = engine.rig;
  const [a, b] = engine.range();
  const n = b - a + 1;
  if (rig.kind === 'quadruped') {
    const f = engine.frame;
    const native = Object.fromEntries(rig.bones.map(b => [b.name, {q:[], p:[], s:[]}]));
    for (let i = a; i <= b; i++) {
      engine.evaluate(i);
      for (const bone of rig.bones) {
        const t = native[bone.name]; t.q.push(...bone.quaternion.toArray()); t.p.push(...bone.position.toArray()); t.s.push(...bone.scale.toArray());
      }
    }
    engine.evaluate(f);
    const source = engine.library.get(engine.doc.strips[0]?.clipId);
    return Object.assign(makeClip({id, name, tags, fps:engine.fps, frames:n, source:'propio', author:'Tú', tracks:{}}), {native, character:source?.character, animal:{...source?.animal,editorVersion:3}});
  }
  const tracks = Object.fromEntries(Object.keys(rig.Tw).map((c) => [c, new Float32Array(n * 4)]));
  const hips = new Float32Array(n * 3);
  const pose = newPose();
  for (let i = 0; i < n; i++) {
    engine.evaluate(a + i);
    rig.captureCanonical(pose);
    for (const c in tracks) pose.q[c].toArray(tracks[c], i * 4);
    pose.hips.toArray(hips, i * 3);
  }
  engine.evaluate(engine.frame);
  return makeClip({ id, name, tags, fps: engine.fps, frames: n, loop: false, source: 'propio', author: 'Tú', tracks, hips });
}

export function clipFile(clip) {
  return JSON.stringify(clipToJSON(clip));
}
