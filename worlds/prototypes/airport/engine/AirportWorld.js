import { ZoneManager } from './ZoneManager.js';
import { AssetRegistry } from './AssetRegistry.js';
import { createAirportChunk } from './AirportChunk.js';

export class AirportWorld {
  constructor({ scene, renderer, camera, onEvent, onError, chunkFactory = createAirportChunk }) {
    Object.assign(this, { scene, renderer, camera, onEvent, onError });
    this.registry = new AssetRegistry(); this.manager = null; this.transitioning = false;
    this.chunkFactory = chunkFactory;
  }
  async switchRoute(route) {
    if (this.transitioning) throw new Error('World transition already running');
    this.transitioning = true;
    try {
      // Caller must cover the viewport until this promise resolves (or provide retry UI).
      await this.manager?.dispose(); this.manager = null;
      this.renderer.renderLists.dispose();
      this.manager = new ZoneManager({ route, onEvent: this.onEvent, onError: this.onError, loader: (meta, signal) => this.chunkFactory(meta, { ...this, signal }) });
      await this.manager.start();
    } finally { this.transitioning = false; }
  }
  async dispose() { await this.manager?.dispose(); this.manager = null; this.renderer.renderLists.dispose(); }
}
