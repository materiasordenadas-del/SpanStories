// Adaptador de batching/instancias a identidad semántica persistente.
export function buildingIdFromHit(hit,model){
  const o=hit?.object;if(!o||!model)return null;
  if(o.userData.entityId&&model.buildings.some(b=>b.id===o.userData.entityId))return o.userData.entityId;
  if(o.isInstancedMesh&&hit.instanceId!=null){const index=o.userData.buildings?.[hit.instanceId];return Number.isInteger(index)&&index>=0?model.buildings[index]?.id??null:null;}
  if(o.userData.kind!=='building'||!hit.face)return null;
  const value=o.geometry.getAttribute('aId')?.getX(hit.face.a);
  return Number.isInteger(value)&&value>0?model.buildings[value-1]?.id??null:null;
}
export function commerceIdFromHit(hit){const o=hit?.object;if(!o?.userData.commerceIds)return null;if(o.isInstancedMesh)return o.userData.commerceIds[hit.instanceId]??null;const id=o.geometry.getAttribute('aId')?.getX(hit.face?.a??0);return o.userData.commerceIds[Math.round(id)-1]??null;}
