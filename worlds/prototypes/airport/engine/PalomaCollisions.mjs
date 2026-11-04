// Swept body bounds: independent of Three.js/Babylon and frame rate.
export class PalomaCollisions {
  constructor(boxes = [], { radius = .32, height = .42 } = {}) {
    Object.assign(this, { boxes, radius, height });
  }
  sweep(from, to) {
    let nearest = null;
    for (const box of this.boxes) {
      const min = { x: box.min.x - this.radius, y: box.min.y - this.height, z: box.min.z - this.radius };
      const max = { x: box.max.x + this.radius, y: box.max.y, z: box.max.z + this.radius };
      let enter = -Infinity, leave = Infinity, normal = null, miss = false;
      for (const axis of ['x', 'y', 'z']) {
        const d = to[axis] - from[axis];
        if (Math.abs(d) < 1e-9) {
          if (from[axis] <= min[axis] || from[axis] >= max[axis]) { miss = true; break; }
          continue;
        }
        let a = (min[axis] - from[axis]) / d, b = (max[axis] - from[axis]) / d;
        const n = { x: 0, y: 0, z: 0 }; n[axis] = d > 0 ? -1 : 1;
        if (a > b) [a, b] = [b, a];
        if (a > enter) { enter = a; normal = n; }
        leave = Math.min(leave, b);
      }
      if (!miss && enter >= -1e-8 && enter <= leave && leave > 0 && enter <= 1 && (!nearest || enter < nearest.t)) {
        nearest = { t: Math.max(0, enter), normal, box };
      }
    }
    return nearest;
  }
  resolve(from, to) {
    // An edited/moving solid can overlap a bird between frames. Push out through
    // its nearest horizontal face, rather than permitting escape through it.
    for (const box of this.boxes) {
      if (from.y + this.height <= box.min.y || from.y >= box.max.y) continue;
      const minX = box.min.x - this.radius, maxX = box.max.x + this.radius;
      const minZ = box.min.z - this.radius, maxZ = box.max.z + this.radius;
      if (from.x <= minX || from.x >= maxX || from.z <= minZ || from.z >= maxZ) continue;
      const faces = [
        { distance: from.x - minX, axis: 'x', value: minX - .002, normal: { x: -1, y: 0, z: 0 } },
        { distance: maxX - from.x, axis: 'x', value: maxX + .002, normal: { x: 1, y: 0, z: 0 } },
        { distance: from.z - minZ, axis: 'z', value: minZ - .002, normal: { x: 0, y: 0, z: -1 } },
        { distance: maxZ - from.z, axis: 'z', value: maxZ + .002, normal: { x: 0, y: 0, z: 1 } },
      ].sort((a, b) => a.distance - b.distance);
      const face = faces[0];
      return { position: { ...from, [face.axis]: face.value }, hit: { t: 0, normal: face.normal, box } };
    }
    const hit = this.sweep(from, to);
    if (!hit) return { position: to, hit: null };
    const t = Math.max(0, hit.t - .002 / Math.max(.002, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)));
    return { position: Object.fromEntries(['x', 'y', 'z'].map(k => [k, from[k] + (to[k] - from[k]) * t])), hit };
  }
  clearPath(start, target, arc = 0) {
    let previous = start;
    for (let i = 1; i <= 48; i++) {
      const u = i / 48;
      const next = { x: start.x + (target.x - start.x) * u, y: start.y + (target.y - start.y) * u + 4 * arc * u * (1 - u), z: start.z + (target.z - start.z) * u };
      if (this.sweep(previous, next)) return false;
      previous = next;
    }
    return true;
  }
  escape(start, away, distance) {
    // The airport is north (-Z); favor open pavement/street, then lateral routes.
    const base = Math.atan2(Math.max(.35, away.z), away.x);
    for (const offset of [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.4, -1.4, Math.PI / 2 - base]) {
      const angle = base + offset;
      if (Math.sin(angle) < -.01) continue;
      const target = { x: start.x + Math.cos(angle) * distance, y: start.y + 2.5, z: start.z + Math.sin(angle) * distance };
      if (this.clearPath(start, target) && this.clearPath(target, { ...target, y: start.y })) return target;
    }
    return null;
  }
}
