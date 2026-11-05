import {estimateHeights} from './place-model.js';
import {buildInfill} from './infill.js';
import {CLIMATES,CLIMATE_VARIANTS} from './climate.js';
import {TREE_SETS} from './tree-catalog.js';

// Clima: automático, uno de los cinco o una variante regional concreta («clima:variante»).
export const CLIMATE_CHOICES={...CLIMATES,...Object.fromEntries(Object.entries(CLIMATE_VARIANTS).map(([k,v])=>[k,CLIMATES[k.split(':')[0]]+' · '+v]))};

export const REGIONS={auto:'Automática',espana:'España',catalunya:'Cataluña',andalucia:'Andalucía',canarias:'Canarias',latam:'Latinoamérica',europa:'Europa genérica',generic:'Sin biblioteca específica'};
export function dataQuality(model){
  const report={buildings:model?.buildings.length??0,heightRecorded:0,heightDocumented:0,heightFromLevels:0,heightEstimated:0,heightCorrected:0,wallColour:0,wallMaterial:0,roofShape:0,singular:0,roadsEstimated:0,inferred:0,warnings:model?.warnings??[]};
  for(const b of model?.buildings??[]){
    if(b.levelsWarning)report.warnings=[...report.warnings,b.id+': '+b.levelsWarning];
    if(b.heightSource==='osm:height')report.heightRecorded++;
    else if(b.heightSource==='wikidata:P2048')report.heightDocumented++;
    else if(b.heightSource==='osm:levels')report.heightFromLevels++;
    else if(b.heightSource?.startsWith('manual')||b.heightSource?.startsWith('local'))report.heightCorrected++;
    else report.heightEstimated++;
    if(b.colour)report.wallColour++;if(b.material)report.wallMaterial++;
    if(b.roof?.shapeSource&&!b.roof.shapeSource.startsWith('estimado'))report.roofShape++;
    if(b.appearance?.singular)report.singular++;
    if(b.inferred)report.inferred++;
  }
  for(const r of model?.roads??[])if(!['osm','manual'].includes(r.widthSource)&&!r.widthSource?.startsWith('local'))report.roadsEstimated++;
  return report;
}
export function validateSettings(settings={}){
  const region=settings.region??'auto',floorHeight=settings.floorHeight??3.2,defaultFloors=settings.defaultFloors??0;
  const terrainSmooth=settings.terrainSmooth??0;
  if(!Object.hasOwn(REGIONS,region)||!Number.isFinite(floorHeight)||floorHeight<2.6||floorHeight>6||!Number.isInteger(defaultFloors)||defaultFloors<0||defaultFloors>60||!Number.isFinite(terrainSmooth)||terrainSmooth<0||terrainSmooth>60)throw Error('Parámetros de estimación no válidos');
  // Proyectos previos sin la clave conservan su aspecto: el relleno solo se activa si se pide.
  const climate=settings.climate??'auto';
  if(climate!=='auto'&&!CLIMATE_CHOICES[climate])throw Error('Clima no válido');
  // Árboles: «auto» usa el conjunto del clima; si no, un conjunto del catálogo (máximo 4 tipos).
  const trees=settings.trees??'auto';
  if(trees!=='auto'&&!Object.hasOwn(TREE_SETS,trees))throw Error('Conjunto de árboles no válido');
  // El clima solo se guarda si se corrige a mano: los proyectos anteriores conservan sus ajustes tal cual.
  return {region,floorHeight,defaultFloors,offline:settings.offline===true,infill:settings.infill===true,terrainSmooth,...(climate!=='auto'?{climate}:{}),...(trees!=='auto'?{trees}:{})};
}
export function withSettings(model,settings,seed){
  const s=validateSettings(settings);
  let result={...model,bounds:{...model.bounds,regionOverride:s.region==='auto'?null:s.region},climateOverride:s.climate??null,treeSetOverride:s.trees??null};
  const regionChanged=(model.bounds?.regionOverride??null)!==result.bounds.regionOverride;
  if(s.floorHeight!==3.2||s.defaultFloors!==0||regionChanged){result={...result,buildings:model.buildings.map(b=>({...b}))};estimateHeights(result,seed,{floorHeight:s.floorHeight,defaultFloors:s.defaultFloors});}
  // Relieve de proveedor filtrado (σ en metros); un DEM local del usuario se respeta tal cual.
  if(s.terrainSmooth>0&&model.kind==='real'&&model.terrainSource?.kind!=='local-dem'){result={...result,terrain:model.terrain.smoothed(s.terrainSmooth),terrainSmoothing:{sigma:s.terrainSmooth,method:'gauss-pendiente-lineal'}};}
  if(s.infill&&model.kind==='real'){
    const fill=buildInfill(result,{seed});
    if(fill.buildings.length){
      result={...result,buildings:[...result.buildings,...fill.buildings]};
      estimateHeights(result,seed,{floorHeight:s.floorHeight,defaultFloors:s.defaultFloors,only:new Set(fill.buildings.map(b=>b.id))});
    }
    result.infill=fill.stats;
  }
  return result;
}
