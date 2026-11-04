export const ChunkState = Object.freeze({ UNLOADED: 'UNLOADED', PREFETCHED: 'PREFETCHED', LOW: 'LOADED_LOW', HIGH: 'ACTIVE_HIGH', RETIRING: 'RETIRING' });

// Route order is authoritative. Spatial proximity never grants access to a chunk.
export class ZoneManager {
  constructor({ route, loader, onEvent = () => {}, onError = () => {} }) {
    if (!route.length || new Set(route.map(z => z.id)).size !== route.length) throw new Error('Invalid route');
    this.route = route;
    this.loader = loader;
    this.onEvent = onEvent;
    this.onError = onError;
    this.records = new Map(route.map(meta => [meta.id, { meta, state: ChunkState.UNLOADED, chunk: null }]));
    this.index = -1;
    this.closed = false;
    this.busy = false;
    this.abort = new AbortController();
    this.queue = Promise.resolve();
  }
  get current() { return this.route[this.index]?.id ?? null; }
  #emit(type, record) { this.onEvent({ type, id: record.meta.id }); }
  start() { return this.#enqueue(() => this.#move(0)); }
  enter(id) {
    return this.#enqueue(async () => {
      const target = this.route.findIndex(z => z.id === id);
      if (target < 0 || this.index < 0 || Math.abs(target - this.index) > 1) throw new Error('Portal must connect adjacent route zones');
      if (target !== this.index) await this.#move(target);
    });
  }
  #enqueue(fn) {
    const task = this.queue.then(async () => {
      if (this.closed) throw new Error('ZoneManager disposed');
      this.busy = true;
      try { return await fn(); } finally { this.busy = false; }
    });
    this.queue = task.catch(() => {});
    return task;
  }
  // Las salas vecinas (no activas) enseñan un cuadro de la sala actual visto desde su puerta.
  #vistas() {
    for (const r of this.records.values()) if (r.chunk && r.meta.id !== this.current) r.chunk.setViewer?.(this.current);
  }
  #drop(record) {
    const chunk = record.chunk;
    record.chunk = null;
    record.state = ChunkState.UNLOADED;
    chunk?.dispose();
    if (chunk) this.#emit('DISPOSE', record);
  }
  async #low(index) {
    const meta = this.route[index];
    if (!meta) return null;
    const r = this.records.get(meta.id);
    if (r.chunk) return r;
    r.state = ChunkState.PREFETCHED;
    this.#emit('PREFETCH', r);
    try {
      const chunk = await this.loader(meta, this.abort.signal);
      if (this.closed) { chunk.dispose(); throw new Error('ZoneManager disposed'); }
      r.chunk = chunk;
      r.state = ChunkState.LOW;
      this.#emit('LOAD_LOW', r);
      return r;
    } catch (error) { r.state = ChunkState.UNLOADED; throw error; }
  }
  async #move(target) {
    // Evict before loading: at most three resident geometric chunks, including in-flight work.
    const desired = new Set(this.route.slice(Math.max(0, target - 1), target + 2).map(z => z.id));
    for (const r of this.records.values()) if (!desired.has(r.meta.id) && r.meta.id !== this.current) this.#drop(r);
    const next = await this.#low(target);
    try {
      await next.chunk.prepareHigh(this.abort.signal);
      if (this.closed) throw new Error('ZoneManager disposed');
    } catch (error) { next.chunk?.discardHigh(); throw error; }
    const previous = this.records.get(this.current);
    if (previous && previous !== next) {
      previous.chunk.setActive(false);
      previous.chunk.discardHigh();
      previous.state = ChunkState.RETIRING;
      this.#emit('RETIRE', previous);
    }
    this.index = target;
    next.chunk.setActive(true);
    next.state = ChunkState.HIGH;
    this.#emit('ACTIVATE', next);
    this.#vistas();
    for (const r of this.records.values()) if (!desired.has(r.meta.id)) this.#drop(r);
    // Background failures do not invalidate the current room; its exit remains gated.
    for (const neighbor of [target - 1, target + 1]) {
      if (this.closed) break;
      try { await this.#low(neighbor); this.#vistas(); } catch (error) { if (!this.closed) this.onError(error); }
    }
    // N+2 is metadata only, never decoded geometry or a retained download.
    const ahead = this.route[target + 2];
    if (ahead) {
      const r = this.records.get(ahead.id);
      r.state = ChunkState.PREFETCHED;
      this.#emit('PREFETCH_METADATA', r);
    }
  }
  update(dt, camera, quality) {
    if (!this.closed) this.records.get(this.current)?.chunk?.update(dt, camera, quality);
  }
  snapshot() { return [...this.records.values()].map(r => ({ id: r.meta.id, state: r.state, loaded: !!r.chunk })); }
  async dispose() {
    this.closed = true;
    this.abort.abort();
    await this.queue;
    const errors = [];
    for (const r of this.records.values()) { try { this.#drop(r); } catch (e) { errors.push(e); } }
    this.index = -1;
    if (errors.length) throw new AggregateError(errors, 'Chunk cleanup failed');
  }
}
