// Exporta la geometría asignada con su material original, sin el shader del visor.
export function modelForExport(root){
  root.updateWorldMatrix(true,true);const copy=root.clone(true),originals=[];copy.matrixAutoUpdate=false;copy.matrix.copy(root.matrixWorld);root.traverse(o=>{if(o.isMesh)originals.push(o);});let index=0;
  copy.traverse(o=>{if(!o.isMesh)return;const source=originals[index++]._ssOriginalMaterial;if(!source)throw Error('Falta el material original del modelo');o.material=Array.isArray(source)?source.map(m=>m.clone()):source.clone();});
  return copy;
}
