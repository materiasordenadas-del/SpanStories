// Proyecto semántico completo. No guarda mallas ni depende de consultar proveedores.
import {Terrain} from './terrain.js';
import {validateEdit} from './edits.js';
import {validateSettings} from './quality.js';
import {readSupplement} from './supplements.js';
import packageInfo from '../../../package.json' with {type:'json'};
import {validateProfile} from './profiles.js';
import {inspectGlb} from '../render/asset-library.js';
import {validateRoadEdit,readLocalTerrain} from './spatial-edits.js';
import {validateInterior} from '../arq/interior.js';
import {validateReferences} from './automatic-references.js';
import {grassConfig} from '../render/grass-config.js';
import {validateCommerce} from './commerces.js';

export const PROJECT_FORMAT='atlas-estudio-proyecto';
export const MAX_PROJECT_BYTES=160*1024*1024;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function checkedModel(model){
  if(!model||model.format!=='atlas-estudio-lugar'||!['real','school','real+school'].includes(model.kind))throw Error('Modelo de lugar no válido');
  const t=model.terrain;
  if(!t||!finite(t.width)||!finite(t.depth)||t.width<=0||t.depth<=0||!Number.isInteger(t.n)||t.n<2||t.n>1025||!finite(t.origin)||!t.h||t.h.length!==t.n*t.n||!Array.from(t.h).every(finite))throw Error('Cuadrícula de relieve no válida');
  const ids=new Set();
  if(!Array.isArray(model.buildings)||model.buildings.length>80000)throw Error('Lista de edificios no válida');
  for(const b of model.buildings){
    if(typeof b.id!=='string'||!b.id||ids.has(b.id))throw Error('Identidad de edificio duplicada o no válida');
    ids.add(b.id);
    if(!finite(b.height)||b.height<=0||!finite(b.levels)||b.levels<1||!finite(b.minHeight)||!Array.isArray(b.rings)||!b.rings.length||!b.rings.every(r=>Array.isArray(r)&&r.length>=3&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite))))throw Error('Geometría de edificio no válida');
  }
  for(const key of ['roads','areas','points','lines'])if(!Array.isArray(model[key]))throw Error(`Falta la capa ${key}`);
  if(!finite(model.size?.width)||!finite(model.size?.depth)||model.size.width<=0||model.size.depth<=0)throw Error('Tamaño del lugar no válido');
  return model;
}
function packModel(model){
  if(!model)return null;
  checkedModel(model);
  return {...model,terrain:{width:model.terrain.width,depth:model.terrain.depth,n:model.terrain.n,origin:model.terrain.origin,h:Array.from(model.terrain.h)}};
}
function unpackModel(model){
  if(!model)return null;
  checkedModel(model);
  const t=model.terrain,terrain=new Terrain({width:t.width,depth:t.depth,resolution:t.n,heights:t.h,origin:0});
  terrain.origin=t.origin; // las alturas almacenadas ya son locales; no restar el origen otra vez
  return {...model,terrain};
}
export function encodeProject(state,{view=null}={}){
  if(!state.model)throw Error('Construye un lugar antes de guardar');
  const text=JSON.stringify({format:PROJECT_FORMAT,version:1,appVersion:packageInfo.version,savedAt:new Date().toISOString(),visorLink:state.visorLink??null,
    mode:state.mode,place:state.model.kind.startsWith('real')?{...state.place,lat:state.model.bounds.centerLat,lon:state.model.bounds.centerLon,size:Math.round(Math.max(state.model.size.width,state.model.size.depth)),name:state.model.label??state.place.name}:state.place,seed:state.seed,seeds:state.seeds,school:state.school,
    model:packModel(state.model),realModel:packModel(state.realModel),source:state.source??null,automaticReferences:state.automaticReferences??{},
    comercios:state.comercios??{},selectedCommerceId:state.selectedCommerceId??null,overrides:state.overrides??{},options:state.options??{},selectedId:state.selectedId??null,farSource:state.farSource??null,settings:state.settings??{},supplements:state.supplements??[],profiles:state.profiles??{},assets:state.assets??[],roadEdits:state.roadEdits??{},interiors:state.interiors??{},terrainOverride:state.terrainOverride??null,selectedRoadId:state.selectedRoadId??null,view});
  if(new TextEncoder().encode(text).length>MAX_PROJECT_BYTES)throw Error('El proyecto supera 160 MB; reduce el área o los modelos incluidos');
  return text;
}
export function decodeProject(input){
  if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_PROJECT_BYTES)throw Error('Archivo demasiado grande o no válido');
  let p;try{p=JSON.parse(input);}catch{throw Error('El proyecto no contiene JSON válido');}
  if(p?.format!==PROJECT_FORMAT||p.version!==1)throw Error('Formato de proyecto no compatible con Estudio');
  if(p.visorLink!=null&&(!/^atlas-[a-z0-9-]+$/.test(p.visorLink.id)||!/^[a-z0-9-]+$/.test(p.visorLink.revision)))throw Error('Vínculo con el visor no válido');
  if(p.view?.grass!=null){if(typeof p.view.grass!=='object'||Array.isArray(p.view.grass))throw Error('Configuración de césped no válida');p.view.grass=grassConfig(p.view.grass);}
  if(!['real','school'].includes(p.mode)||typeof p.seed!=='string'||!p.seeds||!['alturas','fachadas','calle','suelo'].every(k=>typeof p.seeds[k]==='string')||!p.place||!finite(p.place.lat)||Math.abs(p.place.lat)>85||!finite(p.place.lon)||Math.abs(p.place.lon)>180||!finite(p.place.size)||p.place.size<=0)throw Error('Configuración de proyecto no válida');
  if(!p.overrides||typeof p.overrides!=='object'||Array.isArray(p.overrides))throw Error('Ediciones no válidas');
  const overrides=Object.fromEntries(Object.entries(p.overrides).map(([id,edit])=>[id,validateEdit(edit)]));
  const model=unpackModel(p.model),realModel=unpackModel(p.realModel);
  if(!model||model.kind==='real+school'&&(!realModel||realModel.kind!=='real'))throw Error('Falta el lugar original del colegio insertado');
  if(p.farSource){const c=p.farSource.city;if(c?.format!=='atlas-far-city'||!['buildings','roads','water','green'].every(k=>Array.isArray(c[k]))||!finite(c.center?.lat)||!finite(c.center?.lon)||Math.abs(c.center.lat-model.bounds.centerLat)>.00001||Math.abs(c.center.lon-model.bounds.centerLon)>.00001)throw Error('El entorno guardado no corresponde al lugar');}
  if(p.supplements!=null&&(!Array.isArray(p.supplements)||p.supplements.length>100))throw Error('Fuentes locales no válidas');
  const supplements=(p.supplements??[]).map(s=>readSupplement(JSON.stringify(s)));
  if(new Set(supplements.map(s=>s.source.id)).size!==supplements.length)throw Error('Identidad de fuente local duplicada');
  const assets=p.assets??[];if(!Array.isArray(assets)||assets.length>50)throw Error('Biblioteca de modelos no válida');
  const assetIds=new Set();for(const a of assets){if(typeof a?.id!=='string'||typeof a.name!=='string'||assetIds.has(a.id))throw Error('Registro de modelo duplicado o inválido');assetIds.add(a.id);inspectGlb(a.dataUrl);}
  if(p.profiles!=null&&(typeof p.profiles!=='object'||Array.isArray(p.profiles)))throw Error('Perfiles no válidos');
  const profiles=Object.fromEntries(Object.entries(p.profiles??{}).map(([id,v])=>[id,validateProfile(v)]));
  for(const v of Object.values(profiles))if(v.modelId&&!assetIds.has(v.modelId))throw Error('El proyecto no incluye un modelo asignado');
  for(const key of ['roadEdits','interiors'])if(p[key]!=null&&(typeof p[key]!=='object'||Array.isArray(p[key])))throw Error('Ediciones espaciales no válidas');
  const roadEdits=Object.fromEntries(Object.entries(p.roadEdits??{}).map(([id,v])=>[id,validateRoadEdit(v)]));
  const interiors=Object.fromEntries(Object.entries(p.interiors??{}).map(([id,v])=>[id,validateInterior(v)]));
  if(p.comercios!=null&&(typeof p.comercios!=='object'||Array.isArray(p.comercios)))throw Error('Comercios no válidos');
  const comercios=Object.fromEntries(Object.entries(p.comercios??{}).map(([id,v])=>[id,validateCommerce(v)]));
  for(const [id,v]of Object.entries(interiors))if(v.enabled&&profiles[id]?.modelId)throw Error('Un modelo propio no admite interior generado');
  const d=p.terrainOverride;
  const terrainOverride=d==null?null:readLocalTerrain(JSON.stringify(d),{size:{width:d.width,depth:d.depth},bounds:{centerLat:d.centerLat,centerLon:d.centerLon}});
  return {...p,model,realModel,overrides,profiles,assets,roadEdits,interiors,comercios,terrainOverride,automaticReferences:validateReferences(p.automaticReferences??{}),selectedRoadId:typeof p.selectedRoadId==='string'?p.selectedRoadId:null,settings:validateSettings(p.settings),supplements,options:p.options??{},selectedId:typeof p.selectedId==='string'?p.selectedId:null};
}
