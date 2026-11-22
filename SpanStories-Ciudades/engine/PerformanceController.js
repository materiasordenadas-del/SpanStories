export const PROFILES = Object.freeze({
  HIGH: { dpr: 1.5, shadow: 2048, nearNPC: 8, backgroundNPC: 16, lodScale: 1.2, far: 90 },
  STANDARD: { dpr: 1.25, shadow: 1024, nearNPC: 6, backgroundNPC: 12, lodScale: 1, far: 80 },
  ECO: { dpr: 1, shadow: 0, nearNPC: 4, backgroundNPC: 6, lodScale: 0.75, far: 70 },
});
export class PerformanceController {
  constructor(onChange = () => {}) { this.onChange = onChange; this.name = 'STANDARD'; this.samples = []; this.elapsed = 0; this.cooldown = 0; this.auto = false; this.last = {}; }
  get profile() { return PROFILES[this.name]; }
  set(name) {
    if (!PROFILES[name]) throw new Error('Unknown quality profile');
    this.name = name; this.cooldown = 10; this.onChange(this.profile, name);
  }
  sample(seconds, info) {
    if (!(seconds > 0 && Number.isFinite(seconds))) return; // caller excludes hidden-tab suspension
    this.samples.push(seconds * 1000); this.elapsed += seconds; this.cooldown -= seconds;
    if (this.elapsed < 1) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const ms = this.samples.reduce((sum,n)=>sum+n,0)/this.samples.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    this.last = { fps: 1000 / ms, frameMs: ms, p95Ms: p95, calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
    this.samples.length = 0; this.elapsed = 0;
    if (this.auto && this.cooldown <= 0) {
      if (p95 > 25 && this.name !== 'ECO') this.set(this.name === 'HIGH' ? 'STANDARD' : 'ECO');
      else if (p95 < 17 && this.name === 'ECO') this.set('STANDARD');
    }
  }
}
