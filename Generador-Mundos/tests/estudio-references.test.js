import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {referenceFromEntity,withAutomaticReferences,fetchAutomaticReferences} from '../src/estudio/data/automatic-references.js';
import {AutomaticReferences} from '../server/automatic-references.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';
import {generateSchool} from '../src/estudio/school/school.js';
import {dataQuality} from '../src/estudio/data/quality.js';
import {GeoService} from '../server/geo-service.js';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {readFile} from 'node:fs/promises';
const claim=(height,extra={})=>({id:'Q42$abc',rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:{amount:'+'+height,unit:'http://www.wikidata.org/entity/Q11573'}}},references:[{snaks:{P854:[{datavalue:{value:'https://example.org/height'}}]}}],...extra});
const entity=(claims=[claim(30)])=>({id:'Q42',lastrevid:123,labels:{es:{value:'Monumento de prueba'}},claims:{P2048:claims}});
const building=(id='one',source='estimado')=>({id,tags:{wikidata:'Q42'},height:12,levels:4,heightSource:source,minHeight:0});

test('automatic heights require metre units, references, an unambiguous whole-entity statement and exact Q identity',()=>{
  const r=referenceFromEntity(entity());assert.equal(r.height.metres,30);assert.equal(r.revision,123);
  assert.equal(referenceFromEntity(entity([claim(30),claim(40)])).height,null);
  assert.equal(referenceFromEntity(entity([claim(30,{qualifiers:{P518:[{}]}})])).height,null);
  assert.equal(referenceFromEntity(entity([claim(30,{references:[]})])).height,null);
  assert.equal(referenceFromEntity(entity([claim(30,{rank:'deprecated'})])).height,null);
  assert.equal(referenceFromEntity(entity([claim(30,{mainsnak:{snaktype:'value',datavalue:{value:{amount:'+30',unit:'1'}}}})])).height,null);
  const m={buildings:[building()],points:[]},before=JSON.stringify(m),next=withAutomaticReferences(m,{Q42:r});assert.equal(next.buildings[0].height,30);assert.equal(next.buildings[0].heightSource,'wikidata:P2048');assert.equal(JSON.stringify(m),before);assert.equal(dataQuality(next).heightDocumented,1);
  assert.equal(withAutomaticReferences({buildings:[{...building(),tags:{wikidata:'Q43'}}]}, {Q42:r}).buildings[0].height,12);
});

test('automatic references protect OSM heights, building parts and ambiguous complexes',()=>{
  const ref={Q42:referenceFromEntity(entity())};
  for(const b of [{...building(),heightSource:'osm:height'},{...building(),isPart:true},{...building(),minHeight:3}])assert.equal(withAutomaticReferences({buildings:[b]},ref).buildings[0].height,12);
  const many=withAutomaticReferences({buildings:[building('a'),building('b')]},ref);assert.deepEqual(many.buildings.map(b=>b.height),[12,12]);assert.ok(many.buildings.every(b=>b.autoReference));
});

test('references persist in projects and reopen without new provider calls, including older projects',async()=>{
  const model=generateSchool('references'),state={model,mode:'school',place:{lat:40,lon:-3,size:300},seed:'x',seeds:{alturas:'a',fachadas:'b',calle:'c',suelo:'d'},automaticReferences:{Q42:referenceFromEntity(entity())}};
  const text=encodeProject(state),restored=decodeProject(text);assert.equal(restored.automaticReferences.Q42.height.metres,30);assert.equal(JSON.stringify(restored.source),JSON.stringify(state.source??null));
  const old=JSON.parse(text);delete old.automaticReferences;assert.deepEqual(decodeProject(JSON.stringify(old)).automaticReferences,{});
  let calls=0;await fetchAutomaticReferences({buildings:[{tags:{}}]},{fetcher(){calls++;}});assert.equal(calls,0);
});

test('reference service batches validated IDs, caches results, rejects URLs and handles provider failures',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'atlas-reference-test-'));let calls=0;
  try{const service=new AutomaticReferences({cacheDir:dir,fetcher:async url=>{calls++;assert.equal(url.hostname,'www.wikidata.org');return {ok:true,json:async()=>({entities:{Q42:entity()}})};}});
    const a=await service.lookup(['Q42']);assert.equal(a.references.Q42.height.metres,30);await service.lookup(['Q42']);assert.equal(calls,1);
    await assert.rejects(()=>service.lookup(['https://localhost/private']));
    const failed=new AutomaticReferences({cacheDir:dir,fetcher:async()=>{throw Error('offline');}});const b=await failed.lookup(['Q43']);assert.deepEqual(b.references,{});assert.ok(b.warnings[0].includes('offline'));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('city queries include commercial and landmark records, preserving standalone references and original source',async()=>{
  const service=new GeoService({cacheDir:'unused'}),queries=[];
  service.cached=async(key,fn)=>fn();service.request=async(url,options)=>{queries.push(String(options.body.get('data')));return Buffer.from(JSON.stringify({elements:[]}));};
  await service.osm({south:40.415,west:-3.705,north:40.418,east:-3.702});assert.ok(queries.some(query=>query.includes('nwr[shop]')));assert.ok(queries.some(query=>query.includes('nwr[historic]')));assert.ok(queries.some(query=>query.includes('nwr[tourism=artwork]')));assert.ok(queries.some(query=>query.includes('[timeout:50]')));
  const source=JSON.parse(await readFile(new URL('../reports/geographic-madrid-source.json',import.meta.url)));
  source.osm.elements.push({type:'node',id:999000111,lat:source.bounds.centerLat,lon:source.bounds.centerLon,tags:{historic:'monument',name:'Prueba semántica',wikidata:'Q42'}});
  const before=JSON.stringify(source),model=buildPlaceModel(source),point=model.points.find(p=>p.id==='osm:node:999000111');assert.equal(point.tags.wikidata,'Q42');assert.ok(model.landmarks.some(p=>p.id===point.id));assert.equal(JSON.stringify(source),before);
});

test('an unavailable landmark supplement preserves base city data and surfaces the failure; explicit refresh still fails',async()=>{
  const service=new GeoService({cacheDir:'unused'}),record={type:'node',id:42,tags:{name:'base'}};
  service.cached=async(key,fn)=>fn();service.request=async(url,options)=>{const q=options.body.get('data');if(q.includes('nwr[historic]'))throw Error('HTTP 504');return Buffer.from(JSON.stringify({elements:[record]}));};
  const bounds={south:40.415,west:-3.705,north:40.418,east:-3.702},result=await service.osm(bounds);assert.deepEqual(result.elements,[record]);assert.ok(result.warnings[0].includes('HTTP 504'));
  await assert.rejects(()=>service.osm(bounds,true),/HTTP 504/);
});
