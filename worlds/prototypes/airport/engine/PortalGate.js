// Controller adapter: return false => keep the player on the source side of the occluder.
// Signed-plane crossing plus a width/height bound prevents distance-based zone switches.
export class PortalGate {
  constructor({ from, to, origin, normal, width = 4, height = 2.8, margin = 0.15 }) {
    Object.assign(this, { from, to, origin, normal, width, height, margin });
    this.armed = false;
    this.pending = false;
  }
  async sample(position, manager) {
    if (manager.current !== this.from) { this.armed = false; return false; }
    const x = position.x - this.origin.x, z = position.z - this.origin.z;
    const distance = x * this.normal.x + z * this.normal.z;
    if (distance < -this.margin) this.armed = true;
    const lateral = Math.abs(x * -this.normal.z + z * this.normal.x);
    if (!this.armed || this.pending || distance < this.margin || lateral > this.width / 2 || position.y < this.origin.y || position.y > this.origin.y + this.height) return false;
    this.pending = true;
    try { await manager.enter(this.to); this.armed = false; return true; }
    finally { this.pending = false; }
  }
}
