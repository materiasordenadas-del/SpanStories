import test from 'node:test';
import assert from 'node:assert/strict';
import {boundsAround,projection} from '../src/geo/projection.js';
import {buildPlaceModel,interpretBuilding,estimateHeights} from '../src/estudio/data/place-model.js';
import {Terrain} from '../src/estudio/data/terrain.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {placeStreet} from '../src/estudio/arq/street.js';
import {InstanceSet} from '../src/estudio/arq/instances.js';
import {buildGround,pointInPaths,pointInRings} from '../src/estudio/geom/ground.js';
import {toExPolygons,toPaths,intersection,difference,pathsArea} from '../src/estudio/geom/clip.js';
import {buildInfill} from '../src/estudio/data/infill.js';
import {chunkManifest,chunkModel} from '../src/estudio/scene/chunks.js';
import {buildFarScene} from '../src/estudio/scene/far-scene.js';
import {FarCityService} from '../server/far-city.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const building=(id,ring,tags={building:'yes',height:'9'})=>interpretBuilding({id,osmId:null},[ring],tags);
function base(){return {format:'atlas-estudio-lugar',kind:'real',seed:'placement',bounds:{centerLat:40,centerLon:-3},size:{width:160,depth:160},terrain:Terrain.flat(160,160),buildings:[],roads:[],areas:[],lines:[],points:[],warnings:[]};}
function street(m){estimateHeights(m);const before=JSON.stringify(m),ground=buildGround(m),prepared=buildBuildings(m).prepared,result=placeStreet(m,{asphalt:toExPolygons(ground.asphalt),buildingsInfo:prepared,inst:new InstanceSet(),options:{streetTrees:false,furniture:false,lamps:false,cars:false}});assert.equal(JSON.stringify(m),before);return result;}

test('mapped trees on carriageways, water or within a wall are excluded without moving source points',()=>{
  const m=base();m.buildings=[building('wall',rect(10,-5,20,5))];
  m.roads=[{id:'service',cls:'service',type:'flush',width:6,layer:0,points:[[-70,-30],[70,-30]]}];
  m.areas=[{id:'pond',kind:'water',rings:[rect(-10,20,10,40)],area:400}];
  m.points=[{id:'road-tree',kind:'tree',x:0,z:-30},{id:'pond-tree',kind:'tree',x:0,z:30},{id:'wall-tree',kind:'tree',x:9.9,z:0},{id:'valid-tree',kind:'tree',x:-30,z:0}];
  const result=street(m);assert.equal(result.trees.length,1);assert.equal(result.trees[0].x,-30);
  assert.equal(result.treeConflicts.length,3);assert.equal(m.points.length,4);
});

test('inferred park trees and tree rows respect service roads, sports grounds and building clearance',()=>{
  const m=base();m.buildings=[building('building',rect(15,-20,30,20))];
  m.roads=[{id:'service',cls:'service',type:'flush',width:7,layer:0,points:[[-70,0],[70,0]]}];
  const park=rect(-70,-65,70,65),pitch=rect(-65,10,-15,55);
  m.areas=[{id:'park',kind:'park',rings:[park],area:18200},{id:'court',kind:'pitch',rings:[pitch],area:2250}];
  m.lines=[{id:'tree-row',kind:'tree_row',points:[[-60,30],[60,30]]}];
  const result=street(m);assert.ok(result.trees.length>10);
  for(const tree of result.trees){
    assert.ok(Math.abs(tree.z)>=4.2,'árbol sobre vía de servicio');
    assert.equal(pointInRings(tree.x,tree.z,[pitch]),false,'árbol sobre cancha');
    assert.equal(pointInRings(tree.x,tree.z,[rect(12.4,-22.6,32.6,22.6)]),false,'árbol demasiado cerca de fachada');
  }
});

test('surface roads and their markings stay outside occupied building footprints',()=>{
  const m=base(),footprint=rect(-12,-12,12,12);m.buildings=[building('building',footprint)];
  m.roads=[{id:'road',cls:'secondary',type:'vehicle',width:10,layer:0,points:[[-100,0],[100,0]],lanes:2}];
  estimateHeights(m);const ground=buildGround(m),asphalt=toExPolygons(ground.asphalt);
  assert.equal(pointInPaths(0,0,asphalt),false);assert.equal(pointInPaths(-30,0,asphalt),true);
  const marks=ground.meshes.find(m=>m.kind==='marks').geometry.attributes.position;
  for(let i=0;i<marks.count;i+=3){const tri=Array.from({length:3},(_,k)=>[marks.getX(i+k),marks.getZ(i+k)]),paths=toPaths([tri]);assert.ok(Math.abs(pathsArea(difference(paths,ground.asphalt)))<.002,'marca fuera de la calzada');}
});

test('a building with both building and building:part tags is a part, not a duplicated outline',()=>{
  const bounds=boundsAround(40,-3,160),frame=projection(bounds),way=(id,ring,tags)=>({type:'way',id,tags,geometry:[...ring,ring[0]].map(([x,z])=>frame.unproject(x,z))});
  const source={bounds,osm:{elements:[way(1,rect(-20,-10,20,10),{building:'yes'}),way(2,rect(-20,-10,0,10),{building:'yes','building:part':'yes',height:'10'}),way(3,rect(0,-10,20,10),{building:'yes','building:part':'yes',height:'18'})]}};
  const m=buildPlaceModel(source);assert.equal(m.buildings.length,2);assert.ok(m.buildings.every(b=>b.parent.id==='osm:way:1'&&b.isPart));
});

test('inferred infill has no exact polygon overlap with recorded footprints or other generated lots',()=>{
  for(const angle of [0,.19,.51]){
    const m=base(),rotate=p=>[p[0]*Math.cos(angle)-p[1]*Math.sin(angle),p[0]*Math.sin(angle)+p[1]*Math.cos(angle)];
    m.roads=[{id:'frontage',cls:'residential',type:'vehicle',width:6.5,points:[[-75,0],[75,0]].map(rotate)}];
    m.buildings=Array.from({length:4},(_,i)=>building('known'+i,rect(-65+i*9,-20,-56+i*9,-6).map(rotate)));
    m.buildings.push(building('thin',rect(2.01,5.51,2.13,65.51)));
    estimateHeights(m);const fill=buildInfill(m,{seed:'exact-footprints'});assert.ok(fill.buildings.length);
    for(const [i,lot]of fill.buildings.entries())for(const other of [...m.buildings,...fill.buildings.slice(0,i)])assert.ok(Math.abs(pathsArea(intersection(toPaths(lot.rings),toPaths(other.rings))))<.005,lot.id+' solapa '+other.id);
  }
});

test('trees on an internal chunk border retain one owner and are not lost at the seam',()=>{
  const m=base();m.size={width:400,depth:200};m.terrain=Terrain.flat(400,200);
  m.points=[{id:'seam-tree',kind:'tree',x:0,z:20},{id:'near-seam-tree',kind:'tree',x:-.2,z:-20}];
  const expected=street(m).trees.map(t=>[t.x,t.z]),actual=[];
  for(const chunk of chunkManifest(m)){const local=chunkModel(m,chunk);for(const t of street(local).trees)actual.push([t.x+chunk.cx,t.z+chunk.cz]);}
  const rounded=list=>list.map(p=>p.map(v=>Math.round(v*1e8)/1e8)).sort();assert.deepEqual(rounded(actual),rounded(expected));
});

test('far context never duplicates detailed boundary buildings and preserves holes in water',async()=>{
  const m=base();m.buildings=[building('near',rect(70,-10,100,10))];estimateHeights(m);
  const city={format:'atlas-far-city',center:{lat:40,lon:-3},buildings:[{ring:rect(70,-10,100,10),h:9,min:0},{ring:rect(120,-10,140,10),h:8,min:0}],roads:[],water:[{outer:rect(-150,100,-80,170),holes:[rect(-130,120,-100,150)]}],green:[]};
  const far=await buildFarScene(m,{radius:250,flat:true,sourceData:{city,dem:null}});assert.equal(far.stats.buildings,1);
  const geometry=far.group.children.find(o=>o.name==='lejano:suelo').geometry,P=geometry.attributes.position,S=geometry.attributes.aSurf;
  for(let i=0;i<P.count;i+=3)if(S.getX(i)===3){const tri=Array.from({length:3},(_,k)=>[P.getX(i+k),P.getZ(i+k)]);assert.ok(Math.abs(pathsArea(intersection(toPaths([tri]),toPaths([rect(-130,120,-100,150)]))))<.001,'agua llenando una isla');}
  far.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});

test('far provider wraps tile coordinates at the dateline and rejects invalid longitude',async()=>{
  const service=new FarCityService(),visited=[];service.tile=async(z,x,y)=>{visited.push([z,x,y]);return Buffer.alloc(0);};
  await service.city({lat:0,lon:179.9999,radius:500});assert.ok(visited.length);assert.ok(visited.every(([z,x,y])=>x>=0&&x<2**z&&y>=0&&y<2**z));
  await assert.rejects(()=>service.city({lat:0,lon:181}),/Coordenadas/);
});

test('far tile cache coalesces simultaneous requests and actually expires binary tiles',async()=>{
  const cacheDir=await mkdtemp(join(tmpdir(),'atlas-far-cache-'));
  try{
    const service=new FarCityService({cacheDir});let loads=0;
    const load=async()=>{loads++;await new Promise(r=>setTimeout(r,5));return Buffer.from('tile-'+loads);};
    const values=await Promise.all(Array.from({length:5},()=>service.cached('tile',load,{binary:true})));
    assert.equal(loads,1);assert.ok(values.every(v=>v.equals(values[0])));
    await service.cached('tile',load,{binary:true,maxAge:-1});assert.equal(loads,2);
  }finally{await rm(cacheDir,{recursive:true,force:true});}
});
