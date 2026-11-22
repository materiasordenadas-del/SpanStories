export const CLIPS = Object.freeze({
  eat: 'SS_Paloma_Picotear_Mirar',
  scare: 'SS_Paloma_Susto_Volar',
  short: 'SS_Paloma_Comer_Vuelo_Corto',
});
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const point = p => {
  if (!p || !['x', 'y', 'z'].every(k => Number.isFinite(p[k]))) throw new TypeError('Expected finite x, y, z');
  return { x: p.x, y: p.y, z: p.z };
};

/** Engine-neutral behavior. Positions use meters and Y up in the adapter's space. */
export class PalomaBehavior {
  constructor(adapter, { scareDistance = 1.8, flightHeight = 0.65, escapeDistance = 6, walkDistance = 0.16, collisions = null } = {}) {
    if (![scareDistance, flightHeight, escapeDistance, walkDistance].every(v => Number.isFinite(v) && v > 0)) throw new RangeError('Distances must be positive');
    this.adapter = adapter; this.collisions = collisions;
    Object.assign(this, { scareDistance, flightHeight, escapeDistance, walkDistance });
    this.state = 'eat'; this.time = 0; this.humanNear = false;
    adapter.play(CLIPS.eat, true);
  }
  flyTo(destination) {
    const target = point(destination);
    if (this.state !== 'eat') return false;
    this.start = point(this.adapter.getPosition());
    if (this.collisions && !this.collisions.clearPath(this.start, target, this.flightHeight)) return false;
    this.target = target;
    this.state = 'short'; this.time = 0;
    this.adapter.play(CLIPS.short, false);
    return true;
  }
  frighten(humanPosition) {
    if (this.state === 'scare') return false;
    this.start = point(this.adapter.getPosition());
    if (this.state === 'eat') this.groundY = this.start.y;
    const h = humanPosition ? point(humanPosition) : { x: this.start.x - 1, y: this.start.y, z: this.start.z };
    let dx = this.start.x - h.x, dz = this.start.z - h.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) { dx = 1; dz = 0; } else { dx /= distance; dz /= distance; }
    this.target = { x: this.start.x + dx * this.escapeDistance, y: this.start.y + 2.5, z: this.start.z + dz * this.escapeDistance };
    if (this.collisions) {
      this.target = this.collisions.escape(this.start, { x: dx, z: dz }, this.escapeDistance);
      if (!this.target) return false;
    }
    this.state = 'scare'; this.time = 0;
    this.adapter.play(CLIPS.scare, false);
    return true;
  }
  update(dt, humanPosition = null) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be nonnegative seconds');
    if (humanPosition && this.state !== 'escaped') {
      const h = point(humanPosition), p = point(this.adapter.getPosition());
      const distance = Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z);
      if (distance > this.scareDistance * 1.4) this.humanNear = false;
      const grounded = this.state === 'eat' || (this.state === 'short' && (this.time < 2 || this.time >= 4.7));
      if (grounded && !this.humanNear && distance < this.scareDistance) {
        this.humanNear = true; this.frighten(h);
      }
    }
    this.time += dt;
    this.adapter.update?.(dt);
    if (this.state === 'blocked') {
      this.frighten(humanPosition);
      return;
    }
    if (this.state === 'eat') {
      const walked = t => Math.floor(t / 10) * this.walkDistance + this.walkDistance * Math.max(0, Math.min(1, ((t % 10) - 4.5) / 2));
      const distance = walked(this.time) - walked(this.time - dt);
      if (distance) {
        const p = point(this.adapter.getPosition()), dir = this.adapter.getForward?.() ?? { x: 1, z: 0 };
        const next = { x: p.x + dir.x * distance, y: p.y, z: p.z + dir.z * distance };
        const motion = this.collisions?.resolve(p, next) ?? { position: next };
        this.adapter.setPosition(motion.position);
        if (motion.hit) {
          const n = motion.hit.normal;
          const dot = dir.x * n.x + dir.z * n.z;
          this.adapter.face({ x: motion.position.x + dir.x - 2 * dot * n.x, y: p.y, z: motion.position.z + dir.z - 2 * dot * n.z });
        }
      }
    }
    if (this.state === 'short' || this.state === 'scare' || this.state === 'land') {
      const fleeing = this.state === 'scare';
      const u = smooth((this.time - (fleeing ? 0.65 : 2.2)) / (fleeing ? 3.35 : 2.3));
      const p = {
        x: this.start.x + (this.target.x - this.start.x) * u,
        y: this.start.y + (this.target.y - this.start.y) * u + (fleeing ? 0 : 4 * this.flightHeight * u * (1 - u)),
        z: this.start.z + (this.target.z - this.start.z) * u,
      };
      const motion = this.collisions?.resolve(point(this.adapter.getPosition()), p) ?? { position: p };
      this.adapter.setPosition(motion.position);
      if (motion.hit) {
        // A moved obstacle invalidated the planned flight: stop before contact,
        // select a clear direction and restart takeoff from this safe position.
        this.state = 'blocked';
        this.time = 0;
        this.frighten(humanPosition);
        return;
      }
      if (u > 0 && u < 1) this.adapter.face(this.target);
      if (fleeing && this.time >= 4) {
        this.start = point(this.adapter.getPosition());
        this.target = { ...this.start, y: this.groundY ?? 0 };
        this.state = 'land'; this.time = 2.2;
        this.adapter.play(CLIPS.short, false, 2.2);
      } else if (!fleeing && this.time >= 7) {
        this.adapter.setPosition(this.target); this.state = 'eat'; this.time = 0;
        this.adapter.play(CLIPS.eat, true);
      }
    }
  }
  reset(position) {
    this.adapter.setPosition(point(position)); this.adapter.setVisible?.(true);
    this.state = 'eat'; this.time = 0; this.humanNear = false;
    this.adapter.play(CLIPS.eat, true);
  }
}

/** Supply your installed THREE namespace and a loaded GLTFLoader result.
 * Attach returned root directly to an untransformed Scene/Group. */
export function createThreePaloma(THREE, gltf, options) {
  for (const name of Object.values(CLIPS)) {
    if (!gltf.animations.some(clip => clip.name === name)) throw new Error(`Missing clip: ${name}`);
  }
  const root = new THREE.Group(); root.name = 'SpanStories_Paloma'; root.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  let active;
  const adapter = {
    getPosition: () => root.position,
    getForward: () => ({ x: Math.cos(root.rotation.y), z: -Math.sin(root.rotation.y) }),
    setPosition: p => root.position.set(p.x, p.y, p.z),
    setVisible: value => { root.visible = value; },
    face: p => { root.rotation.y = Math.atan2(-(p.z - root.position.z), p.x - root.position.x); },
    play(name, loop, startTime = 0) {
      const next = mixer.clipAction(gltf.animations.find(clip => clip.name === name));
      next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = !loop;
      next.time = startTime;
      next.enabled = true; next.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (active && active !== next) { active.stopFading(); active.fadeOut(0.15); next.fadeIn(0.15); }
      active = next;
    },
    update: dt => mixer.update(dt),
  };
  const behavior = new PalomaBehavior(adapter, options);
  return { root, mixer, behavior, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene); } };
}
