// Recursos por raíz. Los cachés de biblioteca mantienen su propiedad fuera de la escena.
export function sceneResources(root){
  const geometries=new Set(),materials=new Set(),instances=new Set(),textures=new Set();
  root?.traverse(o=>{if(o.geometry&&!o.geometry.userData.libraryOwned)geometries.add(o.geometry);for(const m of [o.material,o.customDepthMaterial,o._ssOriginalMaterial].flat().filter(Boolean)){materials.add(m);if(o.userData.kind==='commerce'&&m.map&&!m.map.userData.libraryOwned)textures.add(m.map);}if(o.isInstancedMesh)instances.add(o);});
  return {geometries,materials,instances,textures};
}
export class ResourcePool{
  constructor(){this.refs=new Map();this.roots=new Map();}
  retain(root){if(this.roots.has(root))return;const sets=sceneResources(root),resources=new Set([...sets.geometries,...sets.materials,...sets.instances,...sets.textures]);this.roots.set(root,resources);for(const r of resources)this.refs.set(r,(this.refs.get(r)??0)+1);}
  release(root){const resources=this.roots.get(root);if(!resources)return;this.roots.delete(root);for(const r of resources){const n=this.refs.get(r)-1;if(n)this.refs.set(r,n);else{this.refs.delete(r);r.dispose?.();}}}
}
export function disposeScene(root){const pool=new ResourcePool();pool.retain(root);pool.release(root);}
export function geometryBytes(root){
  const buffers=new Set();let bytes=0;const add=a=>{const b=a?.array?.buffer;if(b&&!buffers.has(b)){buffers.add(b);bytes+=b.byteLength;}};
  root.traverse(o=>{if(o.geometry){for(const a of Object.values(o.geometry.attributes))add(a);add(o.geometry.index);}if(o.isInstancedMesh){add(o.instanceMatrix);add(o.instanceColor);}});return bytes;
}
