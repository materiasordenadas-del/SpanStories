import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {dataQuality,withSettings} from '../src/estudio/data/quality.js';
import {readSupplement,withSupplements} from '../src/estudio/data/supplements.js';
import {projection} from '../src/geo/projection.js';
import {applyEdits} from '../src/estudio/data/edits.js';
import {GeoService} from '../server/geo-service.js';
import {buildFarScene} from '../src/estudio/scene/far-scene.js';
import {regionOf} from '../src/estudio/arq/styles.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';

const source=JSON.parse(fs.readFileSync(new URL('../reports/geographic-madrid-source.json',import.meta.url)));
const make=()=>buildPlaceModel(structuredClone(source),{seed:'datos'});
function supplement(model){
  const frame=projection(model.bounds),coordinates=[[-10,-10],[-2,-10],[-2,-2],[-10,-2],[-10,-10]].map(([x,z])=>{const p=frame.unproject(x,z);return [p.lon,p.lat];});
  return {type:'FeatureCollection',source:{id:'levantamiento-local',name:'Datos de prueba controlados',license:'Propios de prueba'},features:[
    {type:'Feature',id:'edificio-nuevo',geometry:{type:'Polygon',coordinates:[coordinates]},properties:{name:'Edificio local',height:9.5,levels:3,colour:'#d8ccb4'}},
    {type:'Feature',geometry:null,properties:{targetId:model.buildings[0].id,edit:{height:18.5,levels:5}}},
  ]};
}
test('local supplementation retains the OSM snapshot and geometry, records provenance and yields to manual edits',()=>{
  const model=make(),before=JSON.stringify(model),raw=supplement(model),s=readSupplement(JSON.stringify(raw)),combined=withSupplements(model,[s]);
  assert.equal(JSON.stringify(model),before);assert.equal(combined.buildings.length,model.buildings.length+1);assert.equal(combined.roads,model.roads);
  const added=combined.buildings.find(b=>b.id==='local:levantamiento-local:edificio-nuevo');assert.ok(added);assert.equal(added.height,9.5);assert.equal(added.appearance.sources.footprint,'local:levantamiento-local');
  const id=model.buildings[0].id;assert.equal(combined.buildings[0].height,18.5);assert.equal(combined.buildings[0].heightSource,'local:levantamiento-local');
  assert.equal(applyEdits(combined,{[id]:{height:25}}).buildings[0].height,25);
  assert.deepEqual(combined.buildings[0].rings,model.buildings[0].rings);assert.deepEqual(raw,s);
});
test('height settings preserve registered heights/levels and identify generic regional coverage',()=>{
  const model=make(),adjusted=withSettings(model,{region:'latam',floorHeight:4.1,defaultFloors:5},'otra');
  for(let i=0;i<model.buildings.length;i++)if(model.buildings[i].knownHeight)assert.equal(adjusted.buildings[i].height,model.buildings[i].height);
  const q=dataQuality(model);assert.equal(q.heightRecorded+q.heightFromLevels+q.heightEstimated+q.heightCorrected,q.buildings);assert.ok(q.heightEstimated>0);
  assert.equal(regionOf(adjusted.bounds),'latam');assert.equal(regionOf({centerLat:35,centerLon:140}),'generic');
  assert.throws(()=>withSettings(model,{floorHeight:0}),/no válidos/);
});
test('local data reject missing provenance, unstable IDs, duplicate IDs and unclosed polygons',()=>{
  const raw=supplement(make());assert.throws(()=>readSupplement(JSON.stringify({...raw,source:null})),/source/);
  const a=structuredClone(raw);delete a.features[0].id;assert.throws(()=>readSupplement(JSON.stringify(a)),/id estable/);
  const b=structuredClone(raw);b.features[0].geometry.coordinates[0].pop();assert.throws(()=>readSupplement(JSON.stringify(b)),/Anillo/);
});
test('elevated building parts in Buenos Aires retain source levels and can be saved/reopened',()=>{
  const s=JSON.parse(fs.readFileSync(new URL('../reports/estudio/0.4.0/buenos-aires-source.json',import.meta.url))),model=buildPlaceModel(s);
  const part=model.buildings.find(b=>b.id==='osm:way:265344164');assert.ok(part);assert.equal(part.levels,2);assert.ok(part.levelsWarning);
  const state={model,source:s,mode:'real',place:{lat:-34.60830,lon:-58.37210,size:300},seed:'buenos-aires',seeds:{alturas:'a',fachadas:'f',calle:'c',suelo:'s'}};
  const reopened=decodeProject(encodeProject(state));assert.equal(reopened.model.buildings.find(b=>b.id===part.id).levels,2);assert.deepEqual(reopened.source,s);
  assert.ok(dataQuality(model).warnings.some(w=>w.includes(part.id)));
});
test('expired cache is recoverable and explicitly stale after failure; explicit refresh still reports failure',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'atlas-cache-test-'));
  try{const service=new GeoService({cacheDir:dir});await service.cached('fuente',async()=>({elements:[{id:1}]}));
    const result=await service.cached('fuente',async()=>{throw Error('Proveedor sin conexión');},{maxAge:-1});
    assert.equal(result.elements[0].id,1);assert.equal(result._atlasCache.stale,true);assert.match(result._atlasCache.reason,/sin conexión/);
    await assert.rejects(()=>service.cached('fuente',async()=>{throw Error('Sin proveedor');},{refresh:true}),/Sin proveedor/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('saved far context can reconstruct without calling any provider',async()=>{
  const model=make(),previousFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('Proveedor desconectado');};
  try{const city={format:'atlas-far-city',version:1,center:{lat:model.bounds.centerLat,lon:model.bounds.centerLon},buildings:[{ring:[[410,-10],[430,-10],[430,10],[410,10]],h:8,min:0}],roads:[],water:[],green:[],attribution:'Prueba local'};
    const result=await buildFarScene(model,{radius:500,flat:true,sourceData:{city,dem:null}});
    assert.equal(calls,0);assert.equal(result.stats.buildings,1);assert.equal(result.sourceData.city,city);
    result.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }finally{globalThis.fetch=previousFetch;}
});
