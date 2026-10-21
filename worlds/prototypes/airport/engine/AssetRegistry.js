// Ownership is explicit: a lease belongs to one consumer, never to the scene graph.
export class AssetRegistry {
  #entries = new Map();
  acquire(key, load, dispose) {
    let entry = this.#entries.get(key);
    if (!entry) {
      entry = { refs: 0, value: undefined, ready: false, dispose, controller: new AbortController() };
      this.#entries.set(key, entry);
      entry.promise = Promise.resolve().then(() => load(entry.controller.signal)).then(value => {
        entry.value = value;
        entry.ready = true;
        this.#collect(key, entry);
        return value;
      }, error => {
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
        throw error;
      });
    }
    entry.refs++;
    let released = false;
    return {
      ready: entry.promise,
      release: () => {
        if (released) return;
        released = true;
        entry.refs--;
        this.#collect(key, entry);
      },
    };
  }
  #collect(key, entry) {
    if (entry.refs !== 0) return;
    if (!entry.ready) {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
      entry.controller.abort();
      return;
    }
    if (this.#entries.get(key) === entry) this.#entries.delete(key);
    entry.ready = false;
    entry.dispose(entry.value);
    entry.value = undefined;
  }
  snapshot() { return [...this.#entries].map(([key, e]) => ({ key, refs: e.refs, ready: e.ready })); }
}

export class ResourceScope {
  #cleanup = [];
  closed = false;
  defer(fn) { if (this.closed) fn(); else this.#cleanup.push(fn); return fn; }
  own(resource) { this.defer(() => resource.dispose()); return resource; }
  lease(lease) { this.defer(lease.release); return lease.ready; }
  listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.defer(() => target.removeEventListener(type, fn, options));
  }
  mixer(mixer, root) {
    this.defer(() => { mixer.stopAllAction(); mixer.uncacheRoot(root); });
    return mixer;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    const errors = [];
    for (const fn of this.#cleanup.reverse()) { try { fn(); } catch (error) { errors.push(error); } }
    this.#cleanup.length = 0;
    if (errors.length) throw new AggregateError(errors, 'Resource cleanup failed');
  }
}
