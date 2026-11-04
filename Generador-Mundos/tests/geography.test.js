import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {boundsAround,projection,pointInPolygon,validateBounds} from '../src/geo/projection.js';
import {clipLine,normalizeOSM} from '../src/geo/osm.js';
import {reconstructGeographicWorld} from '../src/geo/reconstruct.js';
import {configWith,encodeProject,decodeProject,effectiveBuilding} from '../src/core/world.js';
import {buildingRepresentation} from '../src/render/building-representation.js';
import {polygonGround} from '../src/render/geographic-geometry.js';
import {sample} from '../src/core/terrain.js';
import {GeographicBatch,geographicHitId} from '../src/render/geographic-batch.js';
const source=JSON.parse(fs.readFileSync(new URL('../reports/geographic-madrid-source.json',import.meta.url)));
const config=configWith({sourceMode:'geographic',size:601});
const world=reconstructGeographicWorld(source,config);
test('Madrid live-source snapshot reconstructs observed footprints, bounded roads and elevation',()=>{
 assert.equal(source.osm.elements.length,1851);assert.ok(world.buildings.length>300);assert.ok(world.urban.roads.length>200);
 assert.ok(Math.max(...world.terrain.heights)-Math.min(...world.terrain.heights)>20);
 for(const n of world.urban.nodes){assert.ok(Math.abs(n.x)<=source.bounds.width/2+1e-6);assert.ok(Math.abs(n.z)<=source.bounds.depth/2+1e-6);}
 const ids=new Set(world.urban.nodes.map(n=>n.id));for(const r of world.urban.roads){assert.ok(ids.has(r.from));assert.ok(ids.has(r.to));}
 for(const b of world.buildings){assert.equal(b.origin,'observed');assert.ok(b.footprint.length);assert.equal(b.fieldSources.footprint,'observed:OSM');}
 assert.ok(world.urban.parcels.every(p=>p.origin==='estimated'));assert.deepEqual(world.geo.source,source);
});
test('geographic refresh and hybrid alterations retain OSM identity, geometry and manual overlays',()=>{
 const b=world.buildings[0],previous={...world,overrides:{[b.id]:{floors:8,height:24.8}}};
 const hybrid=reconstructGeographicWorld(source,{...config,sourceMode:'hybrid'},previous,{heightScale:2,relief:8});
 assert.deepEqual(hybrid.urban.roads,world.urban.roads);assert.deepEqual(hybrid.buildings.map(b=>[b.id,b.footprint,b.x,b.z,b.yaw]),world.buildings.map(b=>[b.id,b.footprint,b.x,b.z,b.yaw]));
 assert.equal(effectiveBuilding(hybrid,hybrid.buildings[0]).height,24.8);assert.notDeepEqual(hybrid.terrain.heights,world.terrain.heights);
 for(const original of world.buildings.filter(b=>b.fieldSources.height==='observed:height'))assert.equal(hybrid.buildings.find(b=>b.id===original.id).height,original.height);
 const appearance={categories:{residential:'custom-glb'},assignments:{[b.id]:'own-glb'}};
 const reopened=decodeProject(encodeProject(hybrid,[],appearance));assert.deepEqual(reopened.appearance,appearance);assert.deepEqual(reopened.world.geo.source,source);assert.deepEqual(reopened.world.overrides,previous.overrides);
});
test('exact footprint geometry survives representation and retains its geographic owner',()=>{
 const b=world.buildings.find(b=>b.footprint[0].length>6),pieces=[],box=new T.BoxGeometry();buildingRepresentation(b,(g,m,matrix,id)=>{assert.equal(id,b.id);assert.ok(matrix.elements.every(Number.isFinite));const transformed=g.clone().applyMatrix4(matrix);transformed.computeBoundingBox();pieces.push(transformed.boundingBox);transformed.dispose();if(g.userData.geoOwned)g.dispose();},box,box,c=>({color:c}),false);
 assert.equal(pieces.length,2);const bounds=new T.Box3().union(pieces[0]);for(const p of b.footprint[0])assert.ok(p.x>=bounds.min.x-1e-3&&p.x<=bounds.max.x+1e-3&&p.z>=bounds.min.z-1e-3&&p.z<=bounds.max.z+1e-3);assert.ok(Math.abs(bounds.max.y-bounds.min.y-b.height)<1e-3);box.dispose();
});
test('dateline regions project continuously and coordinates round trip',()=>{const b=boundsAround(10,179.999,1200,700),p=projection(b);assert.ok(b.west>b.east);for(const [lat,lon]of [[10,179.999],[10,-179.999]]){const q=p.project(lat,lon),r=p.unproject(q.x,q.z);assert.ok(Math.abs(lat-r.lat)<1e-7&&Math.abs(lon-r.lon)<1e-7);}assert.throws(()=>validateBounds({...b,north:89}));});
test('clipping retains interior OSM nodes and creates distinct boundary identities',()=>{const line={id:'osm:way:1',points:[{x:-100,z:0},{x:0,z:0},{x:100,z:0}],nodeIds:['a','b','c']};const [part]=clipLine(line,{width:100,depth:100});assert.deepEqual(part.points,[{x:-50,z:0},{x:0,z:0},{x:50,z:0}]);assert.equal(part.nodeIds[1],'b');assert.notEqual(part.nodeIds[0],part.nodeIds[2]);assert.equal(line.points[0].x,-100);});
test('merged geographic chunks preserve individual selection and vertex colors',()=>{const root=new T.Group(),material=new T.MeshBasicMaterial({vertexColors:true}),batch=new GeographicBatch(root,material);batch.add(new T.BoxGeometry(),new T.Color('red'),new T.Matrix4(),'building-a',0,0);batch.add(new T.BoxGeometry(),new T.Color('blue'),new T.Matrix4().makeTranslation(2,0,0),'building-b',2,0);batch.finish();assert.equal(root.children.length,1);const mesh=root.children[0];assert.equal(geographicHitId(mesh,0),'building-a');assert.equal(geographicHitId(mesh,12),'building-b');assert.equal(geographicHitId(mesh,23),'building-b');assert.equal(mesh.geometry.attributes.color.getX(0),1);assert.equal(mesh.geometry.attributes.color.getZ(36),1);mesh.geometry.dispose();material.dispose();});
test('multipolygon courtyard holes are preserved and member ways are not duplicated',()=>{const ring=(a,b)=>[{lat:a,lon:a},{lat:a,lon:b},{lat:b,lon:b},{lat:b,lon:a},{lat:a,lon:a}];const s={bounds:boundsAround(0,0,1200),osm:{elements:[{type:'relation',id:2,tags:{type:'multipolygon',building:'yes'},members:[{type:'way',ref:3,role:'outer',geometry:ring(-.002,.002)},{type:'way',ref:4,role:'inner',geometry:ring(-.0005,.0005)}]},{type:'way',id:3,tags:{building:'yes'},geometry:ring(-.002,.002)}]}};const data=normalizeOSM(s);assert.equal(data.features.length,1);assert.equal(data.features[0].rings.length,2);assert.equal(pointInPolygon({x:0,z:0},data.features[0].rings),false);});
test('mapped plaza triangles follow DEM inside selection rather than crossing hills as one plane',()=>{const a=world.environment.areas.find(a=>a.kind==='paved'),g=polygonGround(a,world.terrain),p=g.attributes.position;assert.ok(p.count>30);for(let i=0;i<p.count;i++){assert.ok(Math.abs(p.getY(i)-sample(world.terrain,p.getX(i),p.getZ(i))-.09)<1e-4);assert.ok(Math.abs(p.getX(i))<=world.terrain.width/2+1e-4);assert.ok(Math.abs(p.getZ(i))<=world.terrain.depth/2+1e-4);}g.dispose();});
test('hybrid gap completion is explicit and retains observed roads and buildings',()=>{const s={...source,osm:{elements:source.osm.elements.filter(e=>e.type==='way'&&e.tags?.highway==='residential').slice(0,5)}};const original=reconstructGeographicWorld(s,config),hybrid=reconstructGeographicWorld(s,{...config,sourceMode:'hybrid'},null,{fillBuildings:true});assert.equal(original.buildings.length,0);assert.ok(hybrid.buildings.length>0);assert.ok(hybrid.buildings.every(b=>b.origin==='estimated'&&b.id.startsWith('estimated:building:')));assert.deepEqual(original.urban.roads,hybrid.urban.roads);});
test('buildings forming holes in a pedestrian square remain independent building features',()=>{const full=JSON.parse(fs.readFileSync(new URL('../reports/madrid-source-complete.json',import.meta.url))),w=reconstructGeographicWorld(full,config);assert.equal(w.buildings.length,393);assert.ok(w.environment.areas.some(a=>a.kind==='paved'&&a.tags.name==='Puerta del Sol'));assert.ok(w.environment.objects.some(o=>o.category==='street_lamp'));});
