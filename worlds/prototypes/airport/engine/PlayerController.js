import { DIMENSIONS } from './routes.js';

/** Collision and route progression in world metres; no physics dependency. */
export class PlayerController {
  constructor(manager, { x = 0, z = 0, radius = DIMENSIONS.playerRadius, freeRoam = false } = {}) {
    this.manager = manager; this.position = { x, z }; this.radius = radius; this.busy = false; this.freeRoam = freeRoam;
  }
  reset(meta) { this.position.x = meta.center[0]; this.position.z = meta.center[1]; }
  neighborFor(side) {
    const route = this.manager.route, i = this.manager.index, source = route[i];
    for (const index of [i - 1, i + 1]) {
      const next = route[index]; if (!next) continue;
      const sx = source.center[0], sz = source.center[1], nx = next.center[0], nz = next.center[1];
      if (side === 'east' && sx + source.width / 2 === nx - next.width / 2 && source.openings?.east !== undefined && next.openings?.west !== undefined) return next;
      if (side === 'west' && sx - source.width / 2 === nx + next.width / 2 && source.openings?.west !== undefined && next.openings?.east !== undefined) return next;
      if (side === 'south' && sz + source.depth / 2 === nz - next.depth / 2 && source.openings?.south !== undefined && next.openings?.north !== undefined) return next;
      if (side === 'north' && sz - source.depth / 2 === nz + next.depth / 2 && source.openings?.north !== undefined && next.openings?.south !== undefined) return next;
    }
    return null;
  }
  async step(dx, dz) {
    if (this.busy || !this.manager.current) return false;
    if (this.freeRoam) {
      const x = this.position.x + dx, z = this.position.z + dz;
      const contains = room => x >= room.center[0] - room.width / 2 && x <= room.center[0] + room.width / 2
        && z >= room.center[1] - room.depth / 2 && z <= room.center[1] + room.depth / 2;
      const current = this.manager.route[this.manager.index];
      const target = !contains(current) && [this.manager.route[this.manager.index - 1], this.manager.route[this.manager.index + 1]]
        .find(room => room && contains(room));
      if (target) {
        this.busy = true;
        try { await this.manager.enter(target.id); this.position.x = x; this.position.z = z; return true; }
        finally { this.busy = false; }
      }
      this.position.x = x; this.position.z = z; return false;
    }
    const meta = this.manager.route[this.manager.index], [cx, cz] = meta.center;
    const [halfX, halfZ] = [meta.width / 2, meta.depth / 2];
    const southLimit = cz + halfZ + (meta.id === 'D00' ? 20 : 0);
    let x = this.position.x + dx, z = this.position.z + dz;
    const edge = x > cx + halfX - this.radius ? 'east' : x < cx - halfX + this.radius ? 'west' : z > southLimit - this.radius ? 'south' : z < cz - halfZ + this.radius ? 'north' : null;
    if (edge) {
      const neighbor = this.neighborFor(edge);
      const aperture = meta.openings?.[edge];
      const lateral = edge === 'east' || edge === 'west' ? z - cz : x - cx;
      const aligned = neighbor && Math.abs(lateral - aperture) <= DIMENSIONS.portalWidth / 2 - this.radius;
      if (neighbor && (aligned || this.freeRoam)) {
        this.busy = true;
        try {
          await this.manager.enter(neighbor.id);
          this.position.x = edge === 'east' ? neighbor.center[0] - neighbor.width / 2 + this.radius + .04 : edge === 'west' ? neighbor.center[0] + neighbor.width / 2 - this.radius - .04 : x;
          this.position.z = edge === 'south' ? neighbor.center[1] - neighbor.depth / 2 + this.radius + .04 : edge === 'north' ? neighbor.center[1] + neighbor.depth / 2 - this.radius - .04 : z;
          return true;
        } finally { this.busy = false; }
      }
      if (!this.freeRoam) {
        x = Math.max(cx - halfX + this.radius, Math.min(cx + halfX - this.radius, x));
        z = Math.max(cz - halfZ + this.radius, Math.min(southLimit - this.radius, z));
      }
    }
    if (!this.freeRoam) {
      const chunk = this.manager.records.get(meta.id)?.chunk;
      for (const obstacle of chunk?.colliders || []) {
        const closestX = Math.max(obstacle.min.x, Math.min(x, obstacle.max.x));
        const closestZ = Math.max(obstacle.min.z, Math.min(z, obstacle.max.z));
        if ((x - closestX) ** 2 + (z - closestZ) ** 2 < this.radius ** 2) {
          x = this.position.x; z = this.position.z; break;
        }
      }
    }
    this.position.x = x; this.position.z = z;
    return false;
  }
}
