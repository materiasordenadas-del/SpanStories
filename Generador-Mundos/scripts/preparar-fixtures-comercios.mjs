// Fuentes offline reales de Atlas. No consulta proveedores ni inventa tiendas OSM.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {boundsAround} from '../src/geo/projection.js';
import {GeoService} from '../server/geo-service.js';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {encodeProject} from '../src/estudio/data/project.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/estudio/0.17.0/fixtures');await mkdir(out,{recursive:true});
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const old=await read('exportaciones/madrid-gran-via-20261024191946013-14f2fdcf/proyecto.json');
const cache=await read('.geo-cache/85c0de82d45e82139c17011d6b0685b384b71f6513c300738e3af4c1037d19cd.json');
const bounds=boundsAround(41.39170,2.16490,400),service=new GeoService({cacheDir:resolve(root,'.geo-cache'),fetchImpl:async()=>{throw Error('Fixture offline: acceso a red prohibido');}});
let elevation=null;try{elevation=await service.elevation(bounds);}catch(e){console.log('Barcelona: relieve sin cobertura íntegra en caché; fixture plana declarada. '+e.message);}
const barcelona={format:'atlas-geographic-source',version:1,label:'Barcelona · Passeig de Gràcia',bounds,osm:{...cache.value,commerceCoverage:{complete:false,error:'Snapshot base offline: suplemento comercial no descargado',count:cache.value.elements.filter(e=>e.tags?.shop||e.tags?.amenity).length}},elevation,retrievedAt:new Date(cache.saved).toISOString(),attribution:old.source.attribution,fixture:{offline:true,source:'.geo-cache/85c0de82d45e82139c17011d6b0685b384b71f6513c300738e3af4c1037d19cd.json',terrain:elevation?'cache':'plano, no medición real'}};
for(const [name,source]of [['madrid-gran-via',old.source],['barcelona-gracia',barcelona]]){
  const model=buildPlaceModel(source,{seed:'h1'}),state={mode:'real',place:{lat:source.bounds.centerLat,lon:source.bounds.centerLon,size:Math.round(source.bounds.width),name:source.label},seed:'spanstories',seeds:{alturas:'h1',fachadas:'f1',calle:'c1',suelo:'s1'},source,model,settings:{region:'auto',floorHeight:3.2,defaultFloors:0,offline:true,infill:false,terrainSmooth:0},options:{streetTrees:true,cars:true,lamps:true,furniture:true,far:false},view:{ambient:'mediodia',mode:'spanstories',grass:{enabled:false}}};
  await writeFile(resolve(out,name+'-source.json'),JSON.stringify(source));await writeFile(resolve(out,name+'-proyecto.json'),encodeProject(state));console.log(JSON.stringify({name,buildings:model.buildings.length,shops:model.buildings.reduce((s,b)=>s+b.shops.length,0),osm:model.pois.filter(p=>p.shop).map(p=>({id:p.id,shop:p.shop}))}));
}
