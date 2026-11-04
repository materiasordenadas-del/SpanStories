// GeoJSON local con procedencia. Añade edificios o corrige por targetId, sin escribir en OSM.
import {boundsAround,projection} from '../../geo/projection.js';
import {interpretBuilding,estimateHeights} from './place-model.js';
import {applyEdits,validateEdit} from './edits.js';
import {appearancePolicy} from './appearance-policy.js';

export function readSupplement(text){
  if(typeof text!=='string'||text.length>40*1024*1024)throw Error('Fuente local demasiado grande');
  let data;try{data=JSON.parse(text);}catch{throw Error('La fuente local no contiene JSON válido');}
  const s=data?.source;
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>20000||!s||!/^[\w.-]{1,64}$/.test(s.id)||typeof s.name!=='string'||!s.name.trim()||typeof s.license!=='string'||!s.license.trim())throw Error('GeoJSON local: se requieren FeatureCollection y source con id, name y license');
  const ids=new Set();
  for(const f of data.features){
    if(f?.type!=='Feature'||!f.properties||typeof f.properties!=='object')throw Error('Feature local no válida');
    const target=f.properties.targetId;
    if(target!=null){if(typeof target!=='string'||!target||ids.has('target:'+target))throw Error('targetId local inválido o duplicado');ids.add('target:'+target);validateEdit(f.properties.edit);continue;}
    if(f.id==null||!['string','number'].includes(typeof f.id)||ids.has(String(f.id)))throw Error('Cada edificio local necesita un id estable y único');ids.add(String(f.id));
    if(f.geometry?.type!=='Polygon'||!Array.isArray(f.geometry.coordinates)||!f.geometry.coordinates.length)throw Error('Los edificios locales necesitan geometría Polygon WGS84');
    for(const ring of f.geometry.coordinates)if(!Array.isArray(ring)||ring.length<4||!ring.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85)||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('Anillo WGS84 local no válido o sin cerrar');
  }
  return data;
}
export function withSupplements(model,supplements=[]){
  let result=model;const additions=[],sources=[];
  const frame=projection(model.bounds.south!=null?model.bounds:boundsAround(model.bounds.centerLat,model.bounds.centerLon,model.size.width,model.size.depth));
  const usedIds=new Set(model.buildings.map(b=>b.id));
  for(const raw of supplements){
    const data=readSupplement(JSON.stringify(raw)),source='local:'+data.source.id,corrections={};sources.push(data.source);
    for(const f of data.features){
      if(f.properties.targetId){corrections[f.properties.targetId]=f.properties.edit;continue;}
      const rings=f.geometry.coordinates.map(r=>r.slice(0,-1).map(([lon,lat])=>{const p=frame.project(lat,lon);return [p.x,p.z];}));
      const c=rings[0].reduce((a,p)=>[a[0]+p[0]/rings[0].length,a[1]+p[1]/rings[0].length],[0,0]);
      if(Math.abs(c[0])>model.size.width/2||Math.abs(c[1])>model.size.depth/2)continue;
      const tags={building:'yes',...f.properties.tags};
      for(const [from,to]of [['name','name'],['height','height'],['levels','building:levels'],['colour','building:colour'],['material','building:material'],['roofShape','roof:shape']])if(f.properties[from]!=null)tags[to]=f.properties[from];
      const id=source+':'+f.id;if(usedIds.has(id))throw Error('Identidad local duplicada: '+id);usedIds.add(id);
      const b=interpretBuilding({id,osmId:null},rings,tags);if(!b)continue;
      b.origin='local';b.sourceRef=source;b.heightSource=b.knownHeight?source+':height':'estimado';
      if(tags['roof:shape'])b.roof.shapeSource=source+':roof:shape';
      b.appearance=appearancePolicy(b);additions.push(b);
    }
    result=applyEdits(result,corrections,source);
  }
  if(additions.length){
    const temporary={seed:model.seed,buildings:[...result.buildings.map(b=>({...b})),...additions]};estimateHeights(temporary);
    result={...result,buildings:[...result.buildings,...temporary.buildings.slice(result.buildings.length)]};
  }
  return {...result,localSources:sources};
}
