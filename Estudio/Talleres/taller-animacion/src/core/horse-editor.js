import * as THREE from 'three';
import { solveHorseLeg } from './horse-motion.js';

const normalized = name => name.replace(/[.]/g, '').toLowerCase();
export function horseNodes(root) {
  const nodes = new Map();
  root.traverse(b => nodes.set(normalized(b.name), b));
  root.traverse(b => { if (b.userData?.blenderBoneName) nodes.set(normalized(b.userData.blenderBoneName), b); });
  const aliases = { rootx:'hips', spine_01x:'spine', spine_02x:'chest', neckx:'neck', headx:'head' };
  for (const s of ['l', 'r']) Object.assign(aliases, {
    ['thigh_stretch'+s]:'upperLeg'+s, ['leg_stretch'+s]:'lowerLeg'+s, ['foot'+s]:'foot'+s, ['toes_01'+s]:'toes'+s,
    ['thigh_stretch_dupli_001'+s]:'upperArm'+s, ['leg_stretch_dupli_001'+s]:'lowerArm'+s, ['foot_dupli_001'+s]:'hand'+s,
  });
  for (const [name, alias] of Object.entries(aliases)) if (!nodes.has(name) && nodes.has(normalized(alias))) nodes.set(name, nodes.get(normalized(alias)));
  return nodes;
}

// Reconnect exported deform branches in memory, preserving every world matrix.
// FK gains its anatomical descendants; skin, geometry and bind matrices stay intact.
export function prepareHorseHierarchy(root) {
  if (root.userData.horseAnatomyVersion === 3) return;
  // Padres del GLB antes de reconectar nada: viajan en userData (los clones lo copian) para exportar siempre
  // contra la jerarquía original aunque el modelo se clone ya preparado.
  if (!root.userData.horseSourceParents) {
    const parents = {};
    root.traverse(b => { if (b.isBone && b.parent) parents[b.name] = b.parent.name; });
    root.userData.horseSourceParents = parents;
  }
  const nodes = horseNodes(root);
  const attach = (child, parent) => {
    const b = nodes.get(normalized(child)), p = nodes.get(normalized(parent));
    if (b && p && b.parent !== p) { root.updateMatrixWorld(true); p.attach(b); }
  };
  attach('spine_01.x', 'root.x');
  attach('spine_02.x', 'spine_01.x');
  attach('neck.x', 'spine_02.x');
  attach('head.x', 'neck.x');
  for (const s of ['l', 'r']) for (const front of [false, true]) {
    const suffix = front ? '_dupli_001' : '';
    const names = [`c_thigh_b${suffix}.${s}`, `thigh_stretch${suffix}.${s}`, `leg_stretch${suffix}.${s}`, `foot${suffix}.${s}`, `toes_01${suffix}.${s}`];
    attach(names[0], front ? 'spine_02.x' : 'root.x');
    for (let i = 1; i < names.length; i++) attach(names[i], names[i - 1]);
    attach(`thigh_twist${suffix}.${s}`, names[0]);
    attach(`leg_twist${suffix}.${s}`, names[2]);
  }
  for (let i = 0; i < 4; i++) attach(`c_tail_0${i}.x`, i ? `c_tail_0${i - 1}.x` : 'root.x');
  root.userData.horseEditorHierarchy = true;
  // ARP splits the crus/forearm into twist and stretch halves. The stretch
  // head is NOT a joint. Retain the v2 parent graph to read existing clips.
  root.userData.horseLegacyGraphData = [...new Set(nodes.values())].filter(b => b.isBone).map(b => ({
    name:b.name,parent:b.parent?.name,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray(),
  }));
  for (const s of ['l', 'r']) for (const front of [false, true]) {
    const suffix = front ? '_dupli_001' : '';
    const pivot = nodes.get(`thigh_twist${suffix}${s}`);
    if (!pivot) continue;
    attach(`thigh_stretch${suffix}.${s}`, pivot.name);
    attach(`leg_stretch${suffix}.${s}`, pivot.name);
  }
  root.userData.horseAnatomyVersion = 3;
}

export function horseMapping(root) {
  const nodes = horseNodes(root), out = {};
  const put = (c, n) => { const b = nodes.get(normalized(n)); if (b) out[c] = b.name; };
  for (const [c, n] of Object.entries({ hips:'root.x', spine:'spine_01.x', chest:'spine_02.x', neck:'neck.x', head:'head.x' })) put(c, n);
  for (const s of ['l', 'r']) {
    const S = s.toUpperCase();
    for (const [c, n] of Object.entries({ upperLeg:'thigh_stretch', lowerLeg:'leg_stretch', foot:'foot', toes:'toes_01', shoulder:'c_thigh_b_dupli_001', upperArm:'thigh_stretch_dupli_001', lowerArm:'leg_stretch_dupli_001', hand:'foot_dupli_001' })) put(c + S, `${n}.${s}`);
    for (const [c, suffix] of [['upperLeg',''], ['upperArm','_dupli_001']]) {
      if (nodes.has(`thigh_twist${suffix}${s}`)) put(c + S, `thigh_twist${suffix}.${s}`);
    }
  }
  return out;
}

export function horseChains(rig) {
  const nodes = horseNodes(rig.root), chains = {};
  for (const s of ['l', 'r']) for (const front of [true, false]) {
    const suffix = front ? '_dupli_001' : '';
    const joint = nodes.has(`thigh_twist${suffix}${s}`) ? 'thigh_twist' : 'thigh_stretch';
    const bones = [`c_thigh_b${suffix}.${s}`, `${joint}${suffix}.${s}`, `leg_stretch${suffix}.${s}`, `foot${suffix}.${s}`].map(n => nodes.get(normalized(n)));
    if (bones.every(Boolean)) chains[(front ? 'hand' : 'foot') + s.toUpperCase()] = bones;
  }
  return chains;
}

export function horseChainLabel(chain) {
  return `Pata ${chain.startsWith('hand') ? 'delantera' : 'trasera'} ${chain.endsWith('L') ? 'izq.' : 'der.'}`;
}

// Editor controls describe anatomical pivots, independently of humanoid aliases.
// Keep the aliases and native tracks unchanged so existing edits still load.
export function horseControlPoints(rig) {
  const nodes = horseNodes(rig.root);
  const points = ['hips', 'spine', 'chest', 'neck', 'head'].map((canon, i) => ({
    canon, bone: rig.bone(canon), group: i < 3 ? 'torso' : 'head',
    label: ['Pelvis', 'Columna', 'Pecho', 'Cuello', 'Cabeza'][i],
    xy: [[118,145], [174,139], [241,139], [276,96], [303,68]][i],
  }));
  for (const s of ['L', 'R']) for (const front of [false, true]) {
    const chain = (front ? 'hand' : 'foot') + s;
    const names = front ? ['shoulder', 'upperArm', 'lowerArm', 'hand', 'frontHoof'] : ['rearHip', 'upperLeg', 'lowerLeg', 'foot', 'toes'];
    const labels = front ? ['Hombro', 'Codo', 'Carpo', 'Menudillo', 'Casco'] : ['Cadera', 'Rodilla', 'Corvejón', 'Menudillo', 'Casco'];
    const coords = front
      ? (s === 'L' ? [[252,151],[253,181],[260,225],[265,258],[268,275]] : [[229,157],[222,178],[224,221],[220,252],[219,268]])
      : (s === 'L' ? [[111,143],[119,193],[100,220],[107,260],[113,278]] : [[132,145],[140,198],[147,220],[153,253],[160,267]]);
    names.forEach((name, i) => {
      const canon = name + s;
      const bone = name === 'rearHip' ? nodes.get('c_thigh_b' + s.toLowerCase())
        : name === 'frontHoof' ? nodes.get('toes_01_dupli_001' + s.toLowerCase()) : rig.bone(canon);
      points.push({ canon, bone, chain, group: (front ? 'arm' : 'leg') + s,
        label: `${labels[i]} · ${horseChainLabel(chain).toLowerCase()}`, xy: coords[i] });
    });
  }
  return points.filter(p => p.bone);
}

export function sampleHorseClip(clip, time, pose, opts = {}) {
  pose.hips.set(0, 0, 0);
  pose.nativeYaw = 0;
  let t = time * (opts.speed || 1);
  if (opts.reverse) t = clip.duration - t;
  if (opts.loop && clip.duration > 0) t = ((t % clip.duration) + clip.duration) % clip.duration;
  const f = THREE.MathUtils.clamp(t * clip.fps, 0, clip.frames - 1);
  const i = Math.floor(f), j = Math.min(i + 1, clip.frames - 1), u = f - i;
  pose.native = {};
  pose.nativeVersion = clip.animal?.editorVersion || 3;
  pose.nativeNeedsRepair = pose.nativeVersion === 2;
  for (const [name, track] of Object.entries(clip.native)) {
    const q = new THREE.Quaternion().fromArray(track.q, i * 4).slerp(new THREE.Quaternion().fromArray(track.q, j * 4), u);
    const p = new THREE.Vector3().fromArray(track.p, i * 3).lerp(new THREE.Vector3().fromArray(track.p, j * 3), u);
    const s = new THREE.Vector3().fromArray(track.s, i * 3).lerp(new THREE.Vector3().fromArray(track.s, j * 3), u);
    pose.native[name] = { q, p, s };
  }
  pose.nativeMirror = !!opts.mirror;
  return pose;
}

export function applyHorsePose(rig, pose) {
  rig.resetToRest();
  if (!pose?.native) return;
  const graph = legacyGraph(rig);
  if (pose.nativeVersion === 2 && graph) {
    // Convert the old local tracks through their original parent graph. The
    // on-disk clip and every world transform remain intact after the pivot fix.
    rig.root.updateMatrixWorld(true);
    const world = new Map();
    const visit = b => {
      if (world.has(b)) return world.get(b);
      const r = graph.get(b), p = pose.native[b.name] || r;
      if (!r) return b.matrixWorld;
      const parent = graph.has(r.parent) ? visit(r.parent) : r.parent?.matrixWorld || new THREE.Matrix4();
      const m = parent.clone().multiply(new THREE.Matrix4().compose(p.p, p.q, p.s));
      world.set(b, m); return m;
    };
    rig.bones.forEach(visit);
    for (const b of rig.bones) {
      const parent = world.get(b.parent) || b.parent?.matrixWorld || new THREE.Matrix4();
      parent.clone().invert().multiply(world.get(b)).decompose(b.position, b.quaternion, b.scale);
    }
    rig.root.updateMatrixWorld(true);
  } else {
  for (const [name, p] of Object.entries(pose.native)) {
    const b = rig.byName.get(name);
    if (b) { b.position.copy(p.p); b.quaternion.copy(p.q); b.scale.copy(p.s); }
  }
  rig.root.updateMatrixWorld(true);
  }
  if (pose.nativeMirror) {
    const reflect = new THREE.Matrix4().makeScale(-1, 1, 1);
    const origin = rig.restWorldPos.hips || new THREE.Vector3();
    const mirrored = new Map();
    for (const b of rig.bones) {
      const name = b.name.replace(/([.]?)([lr])$/i, (_, dot, side) => dot + (side === 'l' ? 'r' : side === 'r' ? 'l' : side === 'L' ? 'R' : 'L'));
      const other = rig.byName.get(name) || b;
      const delta = other.matrixWorld.clone().multiply(rig.horseRestWorld.get(other).clone().invert());
      const toOrigin = new THREE.Matrix4().makeTranslation(...origin.toArray());
      const reflection = toOrigin.clone().multiply(reflect).multiply(toOrigin.clone().invert());
      mirrored.set(b, reflection.clone().multiply(delta).multiply(reflection).multiply(rig.horseRestWorld.get(b)));
    }
    for (const b of rig.bones) {
      b.parent?.updateWorldMatrix(true, false);
      const m = mirrored.get(b).clone();
      if (b.parent) m.premultiply(b.parent.matrixWorld.clone().invert());
      m.decompose(b.position, b.quaternion, b.scale); b.updateMatrixWorld(true);
    }
  }
}

const legacyGraphs = new WeakMap();
function legacyGraph(rig) {
  let graph=legacyGraphs.get(rig);
  if(graph)return graph;
  graph=new Map();
  const names=new Map();rig.root.traverse(b=>names.set(b.name,b));
  for(const r of rig.root.userData.horseLegacyGraphData || []) {
    const b=names.get(r.name);if(!b)continue;
    graph.set(b,{parent:names.get(r.parent),p:new THREE.Vector3().fromArray(r.p),q:new THREE.Quaternion().fromArray(r.q),s:new THREE.Vector3().fromArray(r.s)});
  }
  legacyGraphs.set(rig,graph);return graph;
}

// Normalize before blending v2 and v3 clips; the originals are never rewritten.
export function normalizeHorsePose(rig,pose) {
  if(!pose?.native || pose.nativeVersion!==2)return pose;
  const saved=rig.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  const mirror=pose.nativeMirror;pose.nativeMirror=false;
  applyHorsePose(rig,pose);
  pose.native=Object.fromEntries(rig.bones.map(b=>[b.name,{p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}]));
  pose.nativeVersion=3;pose.nativeMirror=mirror;
  rig.bones.forEach((b,i)=>{b.position.copy(saved[i].p);b.quaternion.copy(saved[i].q);b.scale.copy(saved[i].s);});
  rig.root.updateMatrixWorld(true);return pose;
}

/** Legacy clips rotated the proximal twist half with the shoulder/hip while
 * rotating the distal stretch half with the forearm/tibia. That creates the
 * visible zigzag within a single bone. Rebuild rigid segments around the true
 * joint centers, retaining the animated root and hoof target, without editing
 * the source clip, mesh, weights, bind matrices or saved skeleton. */
export function repairHorseDeformation(rig) {
  const nodes=horseNodes(rig.root),rest=rig.horseRestWorld;
  const P=b=>new THREE.Vector3().setFromMatrixPosition(rest.get(b));
  const Q=b=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(rest.get(b))).normalize();
  const write=(b,p,q)=>{
    b.parent.updateWorldMatrix(true,false);
    b.position.copy(b.parent.worldToLocal(p.clone()));
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).normalize().invert().multiply(q)).normalize();
    b.updateMatrixWorld(true);
  };
  for(const [chain,bones] of Object.entries(horseChains(rig))) {
    const suffix=chain.startsWith('hand')?'_dupli_001':'',side=chain.at(-1).toLowerCase();
    const helper=nodes.get(`thigh_stretch${suffix}${side}`);
    if(!helper||helper===bones[1])continue;
    const points=bones.map(b=>b.getWorldPosition(new THREE.Vector3()));
    const lengths=bones.slice(1).map((b,i)=>P(b).distanceTo(P(bones[i])));
    const target=points.at(-1).clone(),endQ=bones.at(-1).getWorldQuaternion(new THREE.Quaternion());
    solveHorseLeg(points,target,lengths);
    const rotations=bones.slice(0,-1).map((b,i)=>{
      const current=b.getWorldQuaternion(new THREE.Quaternion()).normalize();
      const localDirection=P(bones[i+1]).sub(P(b)).applyQuaternion(Q(b).invert()).normalize();
      const from=localDirection.applyQuaternion(current),to=points[i+1].clone().sub(points[i]).normalize();
      return new THREE.Quaternion().setFromUnitVectors(from,to).multiply(current);
    });
    bones.forEach((b,i)=>write(b,points[i],rotations[i]||endQ));
    for(const [b,i] of [[helper,1],[nodes.get(`leg_twist${suffix}${side}`),2]]) {
      if(!b)continue;
      const delta=rotations[i].clone().multiply(Q(bones[i]).invert());
      write(b,P(b).sub(P(bones[i])).applyQuaternion(delta).add(points[i]),delta.multiply(Q(b)));
    }
  }
  rig.root.updateMatrixWorld(true);
}

// Multi-segment IK uses the current animated bend, rather than human hinge axes.
export function solveHorseChain(bones, target, poleOffset, rotation, opts = {}) {
  const endQ = rotation.clone().multiply(bones.at(-1).getWorldQuaternion(new THREE.Quaternion()));
  const points = bones.map(b => b.getWorldPosition(new THREE.Vector3()));
  const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i]));
  if (target.distanceTo(points.at(-1)) < 1e-9 && poleOffset.lengthSq() < 1e-12 && rotation.angleTo(new THREE.Quaternion()) < 1e-8) return;
  target = target.clone();
  const length = lengths.reduce((a, b) => a + b, 0), delta = target.clone().sub(points[0]), distance = delta.length();
  if (opts?.stretch && distance > length) {
    const k = Math.min(distance / length, 1 + (opts.maxStretch ?? .3));
    for (let i = 1; i < bones.length; i++) { bones[i].position.multiplyScalar(k); lengths[i - 1] *= k; }
    bones[0].updateMatrixWorld(true);
    bones.forEach((b, i) => b.getWorldPosition(points[i]));
  } else if (opts?.soft > 0 && distance > 1e-8) {
    const softness = Math.min(1, opts.soft) * .1 * length, start = length - softness;
    if (distance > start) target.copy(points[0]).addScaledVector(delta.divideScalar(distance), start + softness * (1 - Math.exp(-(distance - start) / softness)));
  }
  if (poleOffset.lengthSq() > 1e-12) {
    const axis = target.clone().sub(points[0]).normalize();
    const mid = points[1].clone().sub(points[0]).projectOnPlane(axis).normalize();
    const want = mid.clone().add(poleOffset).projectOnPlane(axis).normalize();
    const angle = Math.atan2(axis.dot(mid.clone().cross(want)), mid.dot(want));
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    for (let i = 1; i < points.length - 1; i++) points[i].sub(points[0]).applyQuaternion(q).add(points[0]);
  }
  solveHorseLeg(points, target, lengths);
  for (let i = 0; i < bones.length - 1; i++) {
    const b = bones[i], next = bones[i + 1];
    const from = next.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    const to = points[i + 1].clone().sub(points[i]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(b.getWorldQuaternion(new THREE.Quaternion()));
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
    b.updateMatrixWorld(true);
  }
  const end = bones.at(-1);
  end.quaternion.copy(end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(endQ));
  end.updateMatrixWorld(true);
}
