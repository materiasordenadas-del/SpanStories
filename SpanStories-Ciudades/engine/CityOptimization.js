import { prepararBatches } from './CityBatches.js';
import { prepararMultiBatchesAsync } from './CityMultiBatches.js';
import { cacheLocalMatrices, markRenderBranches, updateRenderAncestors } from './CityRenderOptimization.js';
import { prepareCityGpu } from './CityGpuPreparation.js';

export const ASSET_BUDGET = Object.freeze({ maxDrawUnits: 1500, maxGeometryBytes: 512 * 1024 * 1024 });

export function preparedAssetReport(root) {
  let sourcePieces=0,sourceTriangles=0,drawUnits=0,geometryBytes=0;
  const buffers=new Set(),ids=new Set();
  root.traverse(o=>{
    if(o.userData.id||o.userData.ssId)ids.add(o.userData.id||o.userData.ssId);
    if(!o.isMesh)return;
    if(!o.isInstancedMesh&&!o.isBatchedMesh&&!o.userData.cityOutline){
      sourcePieces++;sourceTriangles+=(o.geometry.index?.count||o.geometry.getAttribute('position')?.count||0)/3;
    }
    if(!(o.layers.mask&1))return;
    drawUnits+=Array.isArray(o.material)?o.geometry.groups.length:1;
    for(const a of [...Object.values(o.geometry.attributes),o.geometry.index,o.instanceMatrix].filter(Boolean)){
      const buffer=(a.isInterleavedBufferAttribute?a.data.array:a.array)?.buffer;
      if(buffer&&!buffers.has(buffer)){buffers.add(buffer);geometryBytes+=buffer.byteLength;}
    }
  });
  return {optimized:true,ids:ids.size,sourcePieces,sourceTriangles,drawUnits,geometryBytes};
}

// Mandatory, shared preparation for every city sector and every editor import.
// No decimation, texture resizing, material substitution or identity flattening.
export async function optimizeCityRoot(root,{multiDraw=true,signal,budget=ASSET_BUDGET,renderer,camera,scene}={}) {
  let instances,multi,restoreMatrices;
  try {
    signal?.throwIfAborted();
    instances=prepararBatches(root);
    multi=multiDraw?await prepararMultiBatchesAsync(root,{signal}):null;
    signal?.throwIfAborted();
    const report=preparedAssetReport(root);
    Object.assign(report,{instancedPieces:instances.instanceCount,multiDrawPieces:multi?.instanceCount||0});
    if(report.drawUnits>budget.maxDrawUnits||report.geometryBytes>budget.maxGeometryBytes)
      throw new Error(`El recurso requiere preparación por sectores: ${report.drawUnits} dibujos y ${(report.geometryBytes/1048576).toFixed(1)} MiB de geometría; límite por recurso ${budget.maxDrawUnits} dibujos / ${budget.maxGeometryBytes/1048576} MiB. No se ha incorporado a la escena.`);
    restoreMatrices=cacheLocalMatrices(root);
    markRenderBranches(root);
    root.traverse(node=>{const binding=node.userData.instanceBinding;if(!binding?.batch)return;
      const sync=binding.sync;binding.sync=(...args)=>{sync(...args);updateRenderAncestors(node);};});
    if(renderer)report.gpuPreparation=await prepareCityGpu(root,{renderer,camera,scene,signal});
    signal?.throwIfAborted();
    return {report,instanceCount:instances.instanceCount,multiCount:multi?.instanceCount||0,
      refresh:node=>{instances.refresh(node);multi?.refresh(node);markRenderBranches(root);},
      setActive:on=>{instances.setActive(on);multi?.setActive(on);markRenderBranches(root,on);},
      dispose:()=>{restoreMatrices();instances.dispose();multi?.dispose();markRenderBranches(root,false);}};
  } catch(error) {restoreMatrices?.();instances?.dispose();multi?.dispose();markRenderBranches(root,false);throw error;}
}
