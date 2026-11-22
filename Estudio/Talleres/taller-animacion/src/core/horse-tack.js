import * as THREE from 'three';

// Horse tack (saddle + breast collar) is exported as a rigid mesh on the
// spine bone. The breast collar wraps the chest and the base of the neck, so it
// goes through the body whenever they move. In memory only (GLB untouched), the
// front of the tack inherits the skin weights of the body surface underneath
// (like Blender's Data Transfer); the saddle itself stays rigid on its bone.

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function skinHorseTack(root, { front = [0.12, 0.24], k = 6 } = {}) {
  let body = null, tack = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o;
    if (!tack && o.isMesh && !o.isSkinnedMesh && /silla|saddle/i.test(o.name) && o.parent?.isBone) tack = o;
  });
  if (!body || !tack || root.userData.horseTackSkinned) return null;
  root.updateMatrixWorld(true);
  body.skeleton.update();
  const anchor = body.skeleton.bones.indexOf(tack.parent);
  if (anchor < 0) return null;
  const toRoot = root.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  // Body surface at rest, in the model's own frame, on a coarse grid.
  const cell = 0.04, grid = new Map();
  const bp = body.geometry.attributes.position, bi = body.geometry.attributes.skinIndex, bw = body.geometry.attributes.skinWeight;
  const pts = new Float32Array(bp.count * 3);
  for (let i = 0; i < bp.count; i++) {
    body.getVertexPosition(i, v).applyMatrix4(body.matrixWorld).applyMatrix4(toRoot).toArray(pts, i * 3);
    const key = `${Math.floor(v.x / cell)},${Math.floor(v.y / cell)},${Math.floor(v.z / cell)}`;
    (grid.get(key) || grid.set(key, []).get(key)).push(i);
  }
  const near = (p) => {
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell), found = [];
    for (let r = 1; r <= 4 && found.length < k; r++) {
      found.length = 0;
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        for (const i of grid.get(`${x},${y},${z}`) || []) {
          const d = (pts[i * 3] - p.x) ** 2 + (pts[i * 3 + 1] - p.y) ** 2 + (pts[i * 3 + 2] - p.z) ** 2;
          found.push([d, i]);
        }
      }
    }
    return found.sort((a, b) => a[0] - b[0]).slice(0, k);
  };
  const tp = tack.geometry.attributes.position, n = tp.count;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const tackToRoot = toRoot.clone().multiply(tack.matrixWorld);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(tp, i).applyMatrix4(tackToRoot);
    const wf = smooth(front[0], front[1], v.z);
    const acc = new Map([[anchor, 1 - wf]]);
    if (wf > 0) {
      const nn = near(v);
      let total = 0;
      const ws = nn.map(([d]) => 1 / (Math.sqrt(d) + 1e-3));
      ws.forEach((w) => (total += w));
      nn.forEach(([, j], m) => {
        for (let c = 0; c < 4; c++) {
          const w = bw.getComponent(j, c) * ws[m] / total * wf;
          if (w > 0) { const b = bi.getComponent(j, c); acc.set(b, (acc.get(b) || 0) + w); }
        }
      });
    }
    const top = [...acc].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    top.forEach(([b, w], c) => { skinIndex[i * 4 + c] = b; skinWeight[i * 4 + c] = w / sum; });
  }
  const geometry = tack.geometry.clone();
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const skinned = new THREE.SkinnedMesh(geometry, tack.material);
  skinned.name = tack.name;
  skinned.userData.anchorBone = tack.parent.name; // the rider's mount point stays on this bone
  skinned.castShadow = tack.castShadow; skinned.receiveShadow = tack.receiveShadow; skinned.frustumCulled = false;
  // Same frame as the body; bind = tack vertex in the body's bind space.
  body.parent.add(skinned);
  skinned.position.copy(body.position); skinned.quaternion.copy(body.quaternion); skinned.scale.copy(body.scale);
  skinned.updateMatrixWorld(true);
  const bindMatrix = body.bindMatrix.clone().multiply(body.matrixWorld.clone().invert()).multiply(tack.matrixWorld);
  skinned.bind(body.skeleton, bindMatrix);
  tack.removeFromParent();
  root.userData.horseTackSkinned = true;
  return skinned;
}
