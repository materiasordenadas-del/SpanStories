import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {Terrain} from '../src/estudio/data/terrain.js';
import {appearancePolicy,recordedRoof} from '../src/estudio/data/appearance-policy.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {wallColour,roofColour,wallSurface} from '../src/estudio/arq/appearance.js';
import {SURF} from '../src/estudio/geom/mesh.js';

const building=(tags={})=>({id:'osm:way:42',name:'Edificio protegido',rings:[[[0,0],[20,0],[20,15],[0,15]]],area:300,levels:6,height:20,minHeight:0,use:'residential',roof:{shape:'flat',shapeSource:'osm:roof:shape',colour:'#123456',material:'metal'},colour:'#c08040',material:'plaster',shops:[],tags});
const model=b=>({buildings:[b],bounds:{centerLat:40.42,centerLon:-3.7},size:{width:100,depth:100},terrain:Terrain.flat(100,100),seed:'fidelidad'});

test('registered flat roofs and exact wall/roof albedo survive facade rerolls in real geometry',()=>{
  const b=building({historic:'yes',wikidata:'Q42'});
  const before=JSON.stringify(b);
  for(const seed of ['a','b','c']){
    const result=buildBuildings(model(b),{seed}),pb=result.prepared[0];
    assert.equal(pb.roofRepresentation.kind,'flat');
    assert.equal(pb.top,20); // no ático recortado ni altura aleatoria
    assert.equal(pb.noRooftop,undefined);
    assert.equal(pb.roofRepresentation.approximate,false);
    const wall=new THREE.Color(b.colour),roof=new THREE.Color(b.roof.colour);
    let walls=0,roofs=0;
    for(const {geometry:g}of result.meshes){
      const S=g.getAttribute('aSurf'),C=g.getAttribute('color'),P=g.getAttribute('position');
      for(let i=0;i<S.count;i++){
        if(S.getX(i)===SURF.wall&&P.getY(i)>1&&Math.abs(C.getX(i)-wall.r)<1e-6&&Math.abs(C.getY(i)-wall.g)<1e-6&&Math.abs(C.getZ(i)-wall.b)<1e-6)walls++;
        if(S.getX(i)===SURF.roof&&Math.abs(P.getY(i)-19.95)<.001){roofs++;assert.ok(Math.abs(C.getX(i)-roof.r)<1e-6&&Math.abs(C.getY(i)-roof.g)<1e-6&&Math.abs(C.getZ(i)-roof.b)<1e-6);}
      }
      g.dispose();
    }
    assert.ok(walls>0&&roofs>0);
  }
  assert.equal(JSON.stringify(b),before);
});

test('source material overrides a regional texture and invalid colours use the fallback',()=>{
  const b=building();
  assert.equal(wallSurface(b,21),SURF.wall);
  assert.equal(wallSurface({...b,material:'brick'},21),14);
  assert.equal(wallColour({...b,colour:null,material:'concrete'},new THREE.Color('red')).getHexString(),'bdbbb6');
  assert.equal(roofColour({...b,roof:{material:'slate'}},new THREE.Color('red')).getHexString(),'5e6670');
  assert.equal(wallColour({...b,colour:'no-es-un-color',material:null},new THREE.Color('blue')).getHexString(),'0000ff');
});

test('missing and unsupported roof data remain explicit approximations, with stable landmark identity',()=>{
  const b=building({heritage:'2',wikidata:'Q42','building:architecture':'art_deco'});
  const p=appearancePolicy(b);
  assert.equal(p.singular,true);assert.equal(p.allowInferredVolumes,false);assert.equal(p.identity.wikidata,'Q42');
  assert.equal(p.identity.architecture,'art_deco');assert.equal(p.sources.facadeOpenings,'generado');
  assert.equal(recordedRoof({...b,roof:{shape:'flat',shapeSource:'estimado:uso'}}),null);
  assert.deepEqual(recordedRoof({...b,roof:{shape:'skillion',shapeSource:'osm:roof:shape'}}),{requested:'skillion',kind:'flat',approximate:true});
  const unknown=recordedRoof({...b,roof:{shape:'desconocida',shapeSource:'osm:roof:shape'}});
  assert.equal(unknown.approximate,true);
  assert.equal(appearancePolicy({...b,name:null,roof:{},tags:{historic:'no',heritage:'no'}}).singular,false);
});

test('OSM interpretation preserves landmark metadata without changing footprints, streets or IDs',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../reports/geographic-madrid-source.json',import.meta.url)));
  const original=buildPlaceModel(source);
  const input=structuredClone(source),feature=input.osm.elements.find(e=>e.type==='way'&&original.buildings.some(b=>b.id===`osm:way:${e.id}`));
  assert.ok(feature);Object.assign(feature.tags,{'roof:shape':'flat','building:colour':'#c08040',heritage:'2',wikidata:'Q42','building:architecture':'art_deco'});
  const before=JSON.stringify(input),changed=buildPlaceModel(input);
  assert.deepEqual(changed.roads,original.roads);
  assert.deepEqual(changed.buildings.map(b=>[b.id,b.rings,b.height]),original.buildings.map(b=>[b.id,b.rings,b.height]));
  const b=changed.buildings.find(b=>b.id===`osm:way:${feature.id}`);
  assert.ok(b);assert.equal(b.appearance.identity.wikidata,'Q42');assert.equal(b.roof.shapeSource,'osm:roof:shape');
  assert.equal(b.appearance.sources.wallColour,'osm:building:colour');assert.equal(JSON.stringify(input),before);
});
