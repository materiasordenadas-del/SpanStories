// Datos y procedencia, independientes de Three.js y de la gramática de fachadas.
const ROOFS={flat:'flat',gabled:'gabled',hipped:'hipped',pyramidal:'pyramid','half-hipped':'hipped',mansard:'mansard',gambrel:'mansard',dome:'dome',onion:'onion',round:'barrel',barrel:'barrel',skillion:'flat'};
const marked=value=>value!=null&&!['','no','none','0'].includes(String(value).toLowerCase());
const explicitRoof=b=>['osm:roof:shape','manual:roof:shape','perfil:roof:shape'].includes(b.roof?.shapeSource)||b.roof?.shapeSource?.startsWith('local:');

export function appearancePolicy(b){
  const t=b.tags??{};
  const singular=marked(t.historic)||marked(t.heritage)||b.use==='religious'||Boolean(b.name&&t.wikidata)||['castle','cathedral','museum','train_station'].includes(t.building);
  const result={
    version:1,singular,referenceRequired:singular,
    allowInferredVolumes:!singular&&!explicitRoof(b),
    sources:{footprint:b.origin==='local'||b.origin==='relleno'?b.sourceRef:'osm',height:b.heightSource??'estimado',wallColour:b.colour?(b.origin==='local'?b.sourceRef:'osm:building:colour'):'estimado',wallMaterial:b.material?(b.origin==='local'?b.sourceRef:'osm:building:material'):'estimado',roofShape:b.roof?.shapeSource??'estimado',roofColour:b.roof?.colour?(b.origin==='local'?b.sourceRef:'osm:roof:colour'):'estimado',roofMaterial:b.roof?.material?(b.origin==='local'?b.sourceRef:'osm:roof:material'):'estimado',facadeOpenings:'generado'},
    identity:{wikidata:t.wikidata??null,wikipedia:t.wikipedia??null,heritage:t.heritage??null,architect:t.architect??null,architecture:t['building:architecture']??t['architectural_style']??null},
  };
  const keys={colour:'wallColour',material:'wallMaterial',roofShape:'roofShape',roofColour:'roofColour',roofMaterial:'roofMaterial',forceStyle:'style'};
  if(b.facadeProfile&&Object.keys(b.facadeProfile).length)result.sources.facadeOpenings='perfil:usuario';
  if(b.reference)result.reference=b.reference;
  if(b.modelId)result.modelId=b.modelId;
  if(b.styleSource)result.sources.style=b.styleSource;
  for(const key of b.modifiedFields??[])if(keys[key])result.sources[keys[key]]=b.fieldSources?.[key]??'manual';
  return result;
}

export function recordedRoof(b){
  if(!explicitRoof(b))return null;
  const requested=b.roof.shape,kind=ROOFS[requested]??'flat';
  return {requested,kind,approximate:!ROOFS[requested]||['half-hipped','gambrel','round','skillion'].includes(requested)};
}
