import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';
import {applyEdits,EditHistory} from '../src/estudio/data/edits.js';
import {buildPlaceModel,estimateHeights} from '../src/estudio/data/place-model.js';
import {generateSchool,SCHOOL_DEFAULTS} from '../src/estudio/school/school.js';
import {placeSchool,schoolRectAt} from '../src/estudio/school/insitu.js';
import {buildingIdFromHit} from '../src/estudio/render/selection.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';

const source=JSON.parse(fs.readFileSync(new URL('../reports/geographic-madrid-source.json',import.meta.url)));
const real=()=>buildPlaceModel(structuredClone(source),{seed:'guardado'});
const state=model=>({model,mode:model.kind==='school'?'school':'real',place:{lat:40.42,lon:-3.7,size:300,name:'Madrid'},seed:'guardado',seeds:{alturas:'a',fachadas:'f',calle:'c',suelo:'s'},school:SCHOOL_DEFAULTS,source:model.kind==='school'?null:source,overrides:{},options:{far:false},selectedId:model.buildings[0]?.id});

test('complete project round trip restores absolute/local elevation, source, seeds and overlays without fetching',()=>{
  const s=state(real()),b=s.model.buildings[0];s.overrides[b.id]={height:31,levels:9,colour:'#123456',roofShape:'flat'};
  const text=encodeProject(s,{view:{position:[20,30,40],target:[1,2,3],lens:35}}),p=decodeProject(text);
  assert.deepEqual(p.source,source);assert.deepEqual(p.seeds,s.seeds);assert.deepEqual(p.overrides,s.overrides);
  assert.equal(p.model.terrain.origin,s.model.terrain.origin);assert.deepEqual(p.model.terrain.h,s.model.terrain.h);
  for(const [x,z]of [[0,0],[50,-70],[-200,150]])assert.equal(p.model.terrain.height(x,z),s.model.terrain.height(x,z));
  const edited=applyEdits(p.model,p.overrides);
  assert.equal(edited.buildings[0].height,31);assert.equal(edited.buildings[0].appearance.sources.wallColour,'manual');
  assert.equal(edited.buildings[0].roof.shapeSource,'manual:roof:shape');assert.deepEqual(p.view.position,[20,30,40]);
});

test('editing and undo affect only one building and survive a height reroll',()=>{
  const model=real(),before=JSON.stringify(model),id=model.buildings[0].id,overrides={[id]:{height:27,levels:8}};
  const effective=applyEdits(model,overrides);
  assert.equal(JSON.stringify(model),before);assert.equal(effective.roads,model.roads);
  for(let i=1;i<model.buildings.length;i++)assert.equal(effective.buildings[i],model.buildings[i]);
  estimateHeights(model,'otra-semilla');assert.equal(applyEdits(model,overrides).buildings[0].height,27);
  const history=new EditHistory();history.checkpoint({});history.checkpoint(overrides);
  const saved=history.undo();saved[id].height=99;assert.equal(overrides[id].height,27);assert.deepEqual(history.undo(),{});assert.equal(history.undo(),null);
});

test('school and school placed on a real map restore their source models and terrain methods',()=>{
  const school=generateSchool('prueba',{barrio:false});
  const restored=decodeProject(encodeProject(state(school)));
  assert.equal(restored.model.kind,'school');assert.equal(restored.model.terrain.height(12,20),0);
  const model=real(),mixed=placeSchool(model,schoolRectAt(model,0,0),'insitu',{barrio:false}),s=state(mixed);s.realModel=model;
  const reopened=decodeProject(encodeProject(s));
  assert.equal(reopened.model.kind,'real+school');assert.deepEqual(reopened.realModel.buildings,model.buildings);
  assert.equal(reopened.realModel.terrain.height(0,0),model.terrain.height(0,0));
});

test('invalid projects, duplicate IDs, bad DEM and unsupported fields are rejected before use',()=>{
  const data=JSON.parse(encodeProject(state(real())));
  assert.throws(()=>decodeProject('{'),/JSON/);
  assert.throws(()=>decodeProject(JSON.stringify({...data,version:99})),/compatible/);
  const dup=structuredClone(data);dup.model.buildings.push(dup.model.buildings[0]);assert.throws(()=>decodeProject(JSON.stringify(dup)),/duplicada/);
  const dem=structuredClone(data);dem.model.terrain.h.pop();assert.throws(()=>decodeProject(JSON.stringify(dem)),/relieve/);
  const edit=structuredClone(data);edit.overrides[edit.model.buildings[0].id]={rings:[]};assert.throws(()=>decodeProject(JSON.stringify(edit)),/editable/);
  assert.throws(()=>applyEdits(real(),{[data.model.buildings[0].id]:{height:-1}}),/no válido/);
});

test('clicking batched walls or an instanced facade resolves to the same stable building ID',()=>{
  const model=generateSchool('seleccion',{barrio:false}),result=buildBuildings(model),pb=result.prepared[0];
  const mesh=result.meshes.find(m=>m.geometry.getAttribute('aId').array.includes(pb.index+1));
  const ids=mesh.geometry.getAttribute('aId'),vertex=Array.from(ids.array).findIndex(v=>v===pb.index+1);
  assert.equal(buildingIdFromHit({object:{geometry:mesh.geometry,userData:{kind:'building'}},face:{a:vertex}},model),pb.b.id);
  const group=[...result.instances.groups.values()].find(g=>g.buildings.includes(pb.index));assert.ok(group);
  const at=group.buildings.indexOf(pb.index);
  assert.equal(buildingIdFromHit({object:{isInstancedMesh:true,userData:{buildings:group.buildings}},instanceId:at},model),pb.b.id);
  assert.equal(buildingIdFromHit({object:{isInstancedMesh:true,userData:{buildings:[-1]}},instanceId:0},model),null);
});
