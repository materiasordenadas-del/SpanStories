import * as T from './three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';
import { optimizeCityRoot } from './CityOptimization.js';
import { prepararSuperficies } from './CitySurface.js';
import { fetchCityGLB } from './CityTransport.js';
import { createCityTaskQueue } from './CityWorkQueue.js';

let decoderUsers=0;

function resourcesOf(roots){
  const geometries=new Set(),materials=new Set(),textures=new Set(),visited=new Set(),stack=roots.filter(Boolean);
  while(stack.length){const o=stack.pop();if(visited.has(o))continue;visited.add(o);stack.push(...o.children);
    if(o.geometry)geometries.add(o.geometry);
    for(const key in o.userData.surfaceTextures||{}){const t=o.userData.surfaceTextures[key];if(t?.isTexture)textures.add(t);}
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&!materials.has(m)){
      materials.add(m);for(const key in m){const value=m[key];if(value?.isTexture)textures.add(value);}
      for(const key in m.uniforms||{}){const value=m.uniforms[key].value;if(value?.isTexture)textures.add(value);}
    }
  }
  return {geometries,materials,textures};
}

export class CityAssets {
  constructor({ scene, objetos, style, renderer, camera, status = () => {}, onLoad = () => {}, onUnload = () => {}, retainedRoots = () => [], concurrency = 2, unloadDelay = 10000, multiDraw = true }) {
    Object.assign(this, { scene, objetos, style, renderer, camera, status, onLoad, onUnload, retainedRoots, concurrency, unloadDelay, multiDraw });
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.loader.cityTask=createCityTaskQueue();
    this.ownsDecoderWorkers=typeof Worker!=='undefined'&&MeshoptDecoder.supported;
    if(this.ownsDecoderWorkers&&decoderUsers++===0)MeshoptDecoder.useWorkers(2);
    this.records = new Map(); this.geometryCache = new Map(); this.textureCache = new Map(); this.loadedBytes = 0; this.running = 0; this.unloadedCount = 0;
    this.queue = []; this.preparingRoots=new Set();this.disposed = false; this.errors = []; this.optimized = true;
  }
  load(sector, manifestUrl) {
    const previous=this.records.get(sector.id);
    if(previous) {
      if(previous.state!=='error'||previous.attempt>=2||performance.now()<previous.retryAt)return previous.promise;
      this.records.delete(sector.id);
    }
    let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;});
    const record = { sector, state:'queued', promise, resolve, reject, root:null, attempt:previous?previous.attempt+1:0,lastNeeded:performance.now(), controller:new AbortController() }; this.records.set(sector.id,record);
    this.queue.push({record,url:new URL(sector.url,manifestUrl).href,gzipUrl:sector.gzipUrl?new URL(sector.gzipUrl,manifestUrl).href:null}); this.pump(); return promise;
  }
  pump() {
    while (this.running < this.concurrency && this.queue.length && !this.disposed) {
      const task = this.queue.shift(); this.running++;
      this.prepare(task).finally(()=>{this.running--;this.pump();});
    }
  }
  async prepare({record,url,gzipUrl=null}) {
    let preparingRoot;
    try {
      record.state='loading'; const started=performance.now();
      const {buffer,json,binary,transferBytes}=await fetchCityGLB(url,{gzipUrl,signal:record.controller.signal,sha256:record.sector.sha256,prepareForParse:true});
      record.transferBytes=transferBytes;this.loadedBytes+=transferBytes;
      const gltf=await this.loader.parseAsync(json||buffer,new URL('.',url).href,binary||null);
      if(this.disposed||record.controller.signal.aborted) { this.release(gltf.scene); throw new DOMException('Carga cancelada','AbortError'); }
      const root=gltf.scene;record.root=root;root.name='sector:'+record.sector.id; root.userData.sector=record.sector.id;
      preparingRoot=root;this.preparingRoots.add(root);
      await prepararSuperficies(gltf);
      const sourceMaterials=new Set(),supersededTextures=new Set();
      const canonical=texture=>{
        if(!texture?.isTexture)return texture;
        if(!texture.userData.ssTexture)return texture;
        const key=texture.userData.ssTexture+JSON.stringify([texture.wrapS,texture.wrapT,texture.magFilter,texture.minFilter,texture.anisotropy,texture.flipY,texture.colorSpace,texture.offset.toArray(),texture.repeat.toArray(),texture.center.toArray(),texture.rotation,texture.channel]);
        const retained=this.textureCache.get(key);
        if(retained&&retained!==texture){supersededTextures.add(texture);return retained;}
        this.textureCache.set(key,texture);return texture;
      };
      root.traverse(o=>{if(!o.isMesh)return;
        for(const m of Array.isArray(o.material)?o.material:[o.material]){sourceMaterials.add(m);
          for(const [key,value] of Object.entries(m))if(value?.isTexture)m[key]=canonical(value);}
        for(const [key,value] of Object.entries(o.userData.surfaceTextures||{}))o.userData.surfaceTextures[key]=canonical(value);
      });
      await this.style.adaptAsync(root,gltf,{signal:record.controller.signal});
      for(const m of sourceMaterials)m.dispose();
      const usedImages=new Set([...this.textureCache.values()].map(t=>t.image));
      for(const t of supersededTextures){t.dispose();if(!usedImages.has(t.image))t.image?.close?.();}
      root.traverse(o=>{
        if(o.isMesh && !o.userData.cityOutline) {
          const key=o.userData.geometryKey;
          if(this.geometryCache.has(key)) { const old=o.geometry; o.geometry=this.geometryCache.get(key); if(old!==o.geometry) old.dispose(); }
          else this.geometryCache.set(key,o.geometry);
          const shell=o.children.find(c=>c.userData.cityOutline); if(shell) shell.geometry=o.geometry;
        }
      });
      record.controller.signal.throwIfAborted();
      root.updateMatrixWorld(true);
      record.batches=await optimizeCityRoot(root,{multiDraw:this.multiDraw,signal:record.controller.signal,renderer:this.renderer,camera:this.camera,scene:this.scene});
      if(!this.optimized)record.batches.setActive(false);
      record.controller.signal.throwIfAborted();
      // Commit only complete representations: yielding never exposes source meshes.
      this.scene.add(root);
      root.traverse(o=>{
        if(!o.userData.ssId) return;
        o.userData.area=record.sector.id;
        this.objetos.registrar(o,{id:o.userData.ssId,tipo:o.userData.ssType||'objeto',etiqueta:o.userData.sourceName||o.name});
      });
      record.state='ready'; record.loadMs=performance.now()-started;
      this.errors=this.errors.filter(e=>e.sector!==record.sector.id);
      this.onLoad(record); record.resolve(record);
    } catch(e) {
      if(record.root){this.detach(record);this.release(record.root);record.root=null;}
      if(e.name==='AbortError'){record.state='cancelled';record.reject(e);return;}
      record.state='error';record.error=e.message;record.retryAt=performance.now()+1000*2**record.attempt;
      this.errors=this.errors.filter(item=>item.sector!==record.sector.id);this.errors.push({sector:record.sector.id,error:e.message});record.reject(e);this.status(`Error al cargar ${record.sector.label||record.sector.id}: ${e.message}`);
    }finally {if(preparingRoot)this.preparingRoots.delete(preparingRoot);}
  }
  refresh(root) {
    root?.updateMatrixWorld(true);
    for(const r of this.records.values()) {let sector=root;while(sector&&sector!==r.root)sector=sector.parent;if(sector===r.root){
      r.batches?.refresh(root);
      const bounds=new T.Box3().setFromObject(r.root),source=new T.Box3(new T.Vector3(...r.sector.bounds.min),new T.Vector3(...r.sector.bounds.max));
      source.union(bounds);r.sector.bounds={min:source.min.toArray(),max:source.max.toArray()};break;
    }}
  }
  setOptimized(on) { this.optimized=on; for(const r of this.records.values()) r.batches?.setActive(on); }
  snapshot() { return [...this.records.values()].map(r=>({id:r.sector.id,state:r.state,bytes:r.sector.bytes,transferBytes:r.transferBytes,loadMs:r.loadMs,instances:r.batches?.instanceCount||0,batchedPieces:r.batches?.multiCount||0,optimization:r.batches?.report,error:r.error})); }
  sync(sectors,manifestUrl,{now=performance.now(),pinned=new Set()}={}) {
    const wanted=new Set(sectors.map(s=>s.id));
    for(const r of this.records.values())if(wanted.has(r.sector.id)||pinned.has(r.sector.id))r.lastNeeded=now;
    const expired=[...this.records.values()].filter(r=>!wanted.has(r.sector.id)&&!pinned.has(r.sector.id)&&now-r.lastNeeded>=this.unloadDelay).map(r=>r.sector.id);
    this.unloadMany(expired);
    return Promise.allSettled(sectors.map(s=>this.load(s,manifestUrl)));
  }
  detach(record) {
    record.batches?.dispose();record.batches=null;
    record.root?.traverse(o=>{if(o.userData.ssId&&this.objetos.obtener(o.userData.ssId)===o)this.objetos.retirar(o.userData.ssId);});
    record.root?.removeFromParent();
  }
  unload(id) {
    return this.unloadMany([id])>0;
  }
  unloadMany(ids) {
    const container=new T.Group();let count=0;
    for(const id of ids){
      const record=this.records.get(id);if(!record)continue;
      record.controller.abort();this.records.delete(id);this.queue=this.queue.filter(t=>t.record!==record);
      if(record.state==='queued')record.reject(new DOMException('Carga cancelada','AbortError'));
      // Pending preparations retain ownership until their next abort check.
      if(record.root&&record.state==='ready'){this.onUnload(record);this.detach(record);container.add(record.root);record.root=null;}
      count++;
    }
    if(container.children.length)this.release(container);
    this.unloadedCount+=count;return count;
  }
  release(root) {
    const {geometries,materials,textures}=resourcesOf([root]);
    root.removeFromParent();
    const retained=[this.scene,...this.retainedRoots(),...this.preparingRoots,...[...this.records.values()].filter(r=>r.root&&r.root!==root).map(r=>r.root)];
    const outside=other=>{for(let node=other;node;node=node.parent)if(node===root)return false;return true;};
    const {geometries:keepG,materials:keepM,textures:keepT}=resourcesOf(retained.filter(outside));
    for(const g of geometries)if(!keepG.has(g))g.dispose();
    for(const m of materials)if(!keepM.has(m)&&!this.style.owned?.has(m))m.dispose();
    const retainedImages=new Set([...keepT].map(t=>t.image));
    for(const t of textures)if(!keepT.has(t)){t.dispose();if(!retainedImages.has(t.image))t.image?.close?.();}
    for(const [key,g] of this.geometryCache)if(!keepG.has(g))this.geometryCache.delete(key);
    for(const [key,t] of this.textureCache)if(!keepT.has(t))this.textureCache.delete(key);
    this.style.prune?.(keepM);
  }
  dispose() {
    if(this.disposed)return;
    this.disposed=true; for(const r of this.records.values())r.controller.abort();for(const t of this.queue)t.record.reject(new Error('Carga cancelada'));this.queue=[];
    // Retirar todas las representaciones antes de liberar recursos compartidos.
    for(const r of this.records.values())if(r.state==='ready'){r.batches?.dispose();r.root?.removeFromParent();}
    const container=new T.Group();for(const r of this.records.values())if(r.root&&r.state==='ready'){container.add(r.root);r.root=null;}this.release(container);
    this.records.clear();this.geometryCache.clear();this.textureCache.clear();this.style.dispose();
    if(this.ownsDecoderWorkers&&--decoderUsers===0)MeshoptDecoder.useWorkers(0);
  }
}
