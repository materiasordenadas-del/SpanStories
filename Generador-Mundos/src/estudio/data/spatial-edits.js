// Correcciones espaciales optativas: eje de calle, huellas y DEM original se conservan.
import {Terrain} from './terrain.js';

export function validateRoadEdit(edit={}){
  const out={};for(const [key,value]of Object.entries(edit)){
    if(key==='structure'){if(!['source','surface','bridge','tunnel'].includes(value))throw Error('Tipo de calle no válido');}
    else{const limits={width:[.8,60],elevationOffset:[0,60],depth:[2,60],clearance:[2.2,12]}[key];if(!limits||!Number.isFinite(value)||value<limits[0]||value>limits[1])throw Error('Parámetro de calle no válido: '+key);}
    out[key]=value;
  }
  if(out.structure==='tunnel'&&(out.depth??6)<(out.clearance??4.8)+.5)throw Error('La profundidad debe superar la altura libre al menos 0,5 m');
  return out;
}
export function withRoadEdits(model,edits={}){
  return {...model,roads:model.roads.map(r=>{
    if(!Object.hasOwn(edits,r.id))return r;
    const e=validateRoadEdit(edits[r.id]),out={...r,...e,sourceGeometry:r.points};
    if(e.width!=null)out.widthSource='manual';
    if(e.structure&&e.structure!=='source'){
      out.bridge=e.structure==='bridge';out.tunnel=e.structure==='tunnel';out.renderTunnel=out.tunnel;out.layer=out.tunnel?-1:Math.max(0,r.layer??0);
    }
    return out;
  })};
}
export function readLocalTerrain(text,model){
  if(typeof text!=='string'||text.length>40*1024*1024)throw Error('Relieve local demasiado grande');
  let data;try{data=JSON.parse(text);}catch{throw Error('El relieve no contiene JSON válido');}
  const s=data?.source,n=data?.resolution;
  if(data?.format!=='atlas-estudio-dem'||data.version!==1||data.units!=='m'||!s||typeof s.name!=='string'||!s.name||typeof s.license!=='string'||!s.license||!Number.isInteger(n)||n<2||n>1025||!Array.isArray(data.heights)||data.heights.length!==n*n||!data.heights.every(Number.isFinite)||data.width<=0||data.depth<=0||Math.abs(data.centerLat)>85||Math.abs(data.centerLon)>180)throw Error('DEM local: cuadrícula en metros y fuente/licencia requeridas');
  if(!Number.isFinite(data.width)||!Number.isFinite(data.depth)||Math.abs(data.width-model.size.width)>.05||Math.abs(data.depth-model.size.depth)>.05||!Number.isFinite(data.centerLat)||!Number.isFinite(data.centerLon)||Math.abs(data.centerLat-model.bounds.centerLat)>.000001||Math.abs(data.centerLon-model.bounds.centerLon)>.000001)throw Error('El DEM debe corresponder al centro y tamaño exactos del lugar');
  return data;
}
export function withLocalTerrain(model,record){
  if(!record)return model;
  if(Math.abs(record.centerLat-model.bounds.centerLat)>.000001||Math.abs(record.centerLon-model.bounds.centerLon)>.000001||Math.abs(record.width-model.size.width)>.05||Math.abs(record.depth-model.size.depth)>.05)return {...model,warnings:[...(model.warnings??[]),'Relieve local de otra selección conservado sin aplicar']};
  const d=readLocalTerrain(JSON.stringify(record),model);
  return {...model,terrain:new Terrain({width:d.width,depth:d.depth,resolution:d.resolution,heights:d.heights}),terrainSource:{...d.source,kind:'local-dem',units:'m'}};
}
