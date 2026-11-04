// Regresión offline reproducible, proyectos de ensayo para la UI y comparación con el respaldo previo.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {buildGround} from '../src/estudio/geom/ground.js';
import {placeStreet} from '../src/estudio/arq/street.js';
import {InstanceSet} from '../src/estudio/arq/instances.js';
import {toExPolygons} from '../src/estudio/geom/clip.js';
import {generateSchool} from '../src/estudio/school/school.js';
import {withInteriors} from '../src/estudio/arq/interior.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';
import {boundsAround,projection} from '../src/geo/projection.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baseline=resolve(root,process.argv[2]??'respaldo/versiones/0.16.0-previo-correcciones-geometria-20261026T032758Z');
const out=resolve(root,'reports/estudio/0.16.1');await mkdir(out,{recursive:true});
const old=await import(pathToFileURL(resolve(baseline,'src/estudio/data/place-model.js')));
const oldBuildings=await import(pathToFileURL(resolve(baseline,'src/estudio/arq/buildings.js')));
const hash=data=>createHash('sha256').update(data).digest('hex');
const geometryHash=built=>hash(JSON.stringify([built.meshes.map(m=>Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)]))),[...built.instances.groups]]));
const report={baseline,createdAt:new Date().toISOString(),maps:[],schools:[],unchangedStyles:[],network:'offline; fuentes guardadas, sin solicitudes a proveedores'};
const seeds={alturas:'h1',fachadas:'f1',calle:'c1',suelo:'s1'};
function stateFor(model,source=null){return {model,source,mode:model.kind==='school'?'school':'real',place:{lat:model.bounds.centerLat,lon:model.bounds.centerLon,size:Math.max(model.size.width,model.size.depth),name:model.label},seed:'regresion',seeds,school:{},overrides:{},profiles:{},settings:{offline:true,infill:false,terrainSmooth:0},options:{far:false,furniture:false,lamps:false,cars:false,streetTrees:false},interiors:{},selectedId:model.buildings[0]?.id};}
for(const [name,path]of [['madrid','reports/geographic-madrid-source.json'],['buenos-aires','reports/estudio/0.4.0/buenos-aires-source.json']]){
  const raw=await readFile(resolve(root,path),'utf8'),source=JSON.parse(raw),before=JSON.stringify(source),prior=old.buildPlaceModel(source,{seed:'regresion'}),start=performance.now(),model=buildPlaceModel(source,{seed:'regresion'}),ms=performance.now()-start;
  assert.equal(JSON.stringify(source),before);
  const existing=new Map(prior.buildings.map(b=>[b.id,b]));let footprintsChecked=0;
  for(const b of model.buildings)if(existing.has(b.id)){assert.deepEqual(b.rings,existing.get(b.id).rings);footprintsChecked++;}
  const ground=buildGround(model),built=buildBuildings(model),street=placeStreet(model,{asphalt:toExPolygons(ground.asphalt),buildingsInfo:built.prepared,inst:new InstanceSet(),options:{streetTrees:false,furniture:false,lamps:false,cars:false}});
  for(const m of [...ground.meshes,...built.meshes])for(const a of Object.values(m.geometry.attributes))assert.ok(a.array.every(Number.isFinite));
  const state=stateFor(model,source),text=encodeProject(state);assert.deepEqual(decodeProject(text).model.buildings,model.buildings);
  await writeFile(resolve(out,name+'-proyecto.json'),text);
  report.maps.push({name,sourceSha256:hash(raw),before:prior.buildings.length,after:model.buildings.length,roads:model.roads.length,footprintsChecked,modelMs:Math.round(ms),asphaltBuildingConflictM2:ground.stats.roadBuildingOverlap,treeConflicts:street.treeConflicts,warnings:model.warnings});
  for(const m of [...ground.meshes,...built.meshes])m.geometry.dispose();
}
for(const estilo of ['espana','latam','japon']){
  const model=generateSchool('regresion',{estilo,barrio:false}),current=buildBuildings(model),prior=oldBuildings.buildBuildings(model),a=geometryHash(current),b=geometryHash(prior);
  assert.equal(a,b,'No debe cambiar arquitectura escolar ajena a los fallos');report.schools.push({estilo,geometryAndInstancesSha256:a,unchanged:true});
  for(const m of [...current.meshes,...prior.meshes])m.geometry.dispose();
}
for(const file of ['pipeline.js','gmaterial.js','trees.js','grass.js','grass-shaders.js','ghibli.js','dispatch.js']){
  const relative='src/estudio/render/'+file,a=hash(await readFile(resolve(root,relative))),b=hash(await readFile(resolve(baseline,relative)));assert.equal(a,b);report.unchangedStyles.push({file:relative,sha256:a});
}
// Escenario sintético con conflictos deliberados para inspección de la UI y exportación.
const bounds=boundsAround(40,-3,200),frame=projection(bounds),rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],geometry=points=>points.map(([x,z])=>frame.unproject(x,z));
const way=(id,ring,tags)=>({type:'way',id,tags,geometry:geometry([...ring,ring[0]])});
const elements=[way(1,rect(-60,-40,-25,-15),{building:'apartments',height:'9.6','building:levels':'3','roof:shape':'flat',name:'Interior de ensayo'}),way(2,rect(-15,-6,5,14),{building:'yes',height:'9','roof:shape':'flat',name:'Conflicto de calzada'}),way(3,rect(20,35,60,65),{building:'yes',name:'Contorno con partes'}),way(4,rect(20,35,40,65),{building:'yes','building:part':'yes',height:'8'}),way(5,rect(40,35,60,65),{building:'yes','building:part':'yes',height:'12'}),way(10,rect(10,-65,85,25),{leisure:'park'}),way(11,rect(15,-50,45,-20),{leisure:'pitch',sport:'tennis'}),way(12,rect(55,-50,75,-25),{natural:'water'}),{type:'way',id:20,tags:{highway:'residential',width:'6',name:'Calle de ensayo'},geometry:geometry([[-110,3],[110,3]])},{type:'way',id:21,tags:{highway:'service',width:'4'},geometry:geometry([[10,-10],[90,-10]])},...[[30,3],[65,-35],[-65,35]].map(([x,z],i)=>({type:'node',id:100+i,tags:{natural:'tree'},...frame.unproject(x,z)}))];
const fixtureSource={format:'atlas-geographic-source',version:1,label:'Ensayo controlado · datos sintéticos',bounds,osm:{elements},attribution:[{source:'Escenario sintético de regresión',license:'Datos propios de ensayo'}]};
const fixture=buildPlaceModel(fixtureSource,{seed:'regresion'});fixture.buildings[0].forceStyle='madrid_moderno';
const fixtureState=stateFor(fixture,fixtureSource),view={position:[150,130,170],target:[0,0,0],lens:28,mode:'trigun'};
await writeFile(resolve(out,'control-proyecto.json'),encodeProject(fixtureState,{view}));
fixtureState.interiors={'osm:way:1':{enabled:true,layout:'two',height:2.2,doorHeight:1.9}};
assert.ok(buildBuildings(withInteriors(fixture,fixtureState.interiors)).prepared[0].interiorPlan);
await writeFile(resolve(out,'control-interior-proyecto.json'),encodeProject(fixtureState,{view}));
await writeFile(resolve(out,'regresion-offline.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({maps:report.maps.map(({name,before,after,roads,footprintsChecked,modelMs})=>({name,before,after,roads,footprintsChecked,modelMs})),schools:report.schools.length,unchangedStyles:report.unchangedStyles.length,report:resolve(out,'regresion-offline.json')}));
