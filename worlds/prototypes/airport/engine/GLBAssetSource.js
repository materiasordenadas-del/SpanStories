import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { disposeObject } from './ThreeResources.js';

// Injectable loader allows the host to configure its own Meshopt/Draco/KTX2 decoders.
// Decoders are deliberately not downloaded or changed by the airport engine.
export class GLBAssetSource {
  constructor(registry, { loader = new GLTFLoader(), timeoutMs = 30000 } = {}) {
    this.registry = registry; this.loader = loader; this.timeoutMs = timeoutMs;
  }
  acquire(url) {
    const absolute = new URL(url, document.baseURI).href;
    return this.registry.acquire(`glb:${absolute}`, async signal => {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(new Error('GLB network timeout')), this.timeoutMs);
      const combined = AbortSignal.any([signal, timeout.signal]);
      try {
        const response = await fetch(absolute, { signal: combined });
        if (!response.ok) throw new Error(`GLB ${response.status}: ${absolute}`);
        const data = await response.arrayBuffer();
        // This adapter is for self-contained GLB, preventing untracked dependent requests.
        if (new DataView(data).getUint32(0, true) !== 0x46546c67) throw new Error('Expected self-contained GLB');
        const view = new DataView(data);
        const jsonLength = view.getUint32(12, true);
        const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)));
        for (const resource of [...(manifest.buffers || []), ...(manifest.images || [])]) {
          if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('External GLB resources must be embedded');
        }
        combined.throwIfAborted();
        const gltf = await this.loader.parseAsync(data, new URL('.', absolute).href);
        if (combined.aborted) { disposeObject(gltf.scene); combined.throwIfAborted(); }
        return gltf;
      } finally { clearTimeout(timer); }
    }, gltf => { disposeObject(gltf.scene); gltf.animations.length = 0; });
  }
  async instantiateStatic(url, scope) {
    const gltf = await scope.lease(this.acquire(url));
    if (scope.closed) throw new Error('Chunk retired during GLB load');
    let skinned = false;
    gltf.scene.traverse(object => { if (object.isSkinnedMesh) skinned = true; });
    if (skinned) throw new Error('Skinned assets require the existing character factory, not Object3D.clone');
    const instance = gltf.scene.clone(true);
    // Geometry/material/texture ownership stays in the registry, never in the clone.
    scope.defer(() => { instance.removeFromParent(); instance.clear(); });
    return instance;
  }
}
