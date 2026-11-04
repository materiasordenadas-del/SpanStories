import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Terrain} from '../src/estudio/data/terrain.js';
import {urbanContext,contextLevels} from '../src/estudio/data/context.js';
import {buildInfill} from '../src/estudio/data/infill.js';
import {interpretBuilding,estimateHeights,buildPlaceModel} from '../src/estudio/data/place-model.js';
import {validateSettings,withSettings} from '../src/estudio/data/quality.js';
import {rng} from '../src/estudio/data/rng.js';

const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const house=(id,ring,tags={building:'yes'})=>interpretBuilding({id,osmId:null},[ring],tags);
// Calle este-oeste en z=0 con una fila de casas registradas al norte entre x=-60 y -20; el resto del frente, vacío.
function street({lat=14.557,lon=-90.734,extra=[]}={}){
  const buildings=[];for(let x=-60;x<-20;x+=10)buildings.push(house('osm:way:'+x,rect(x,-20,x+10,-6)));
  buildings.push(...extra);
  const model={kind:'real',seed:'s',size:{width:200,depth:200},bounds:{centerLat:lat,centerLon:lon,width:200,depth:200},terrain:Terrain.flat(200,200),
    buildings,roads:[{id:'osm:way:calle',cls:'residential',type:'vehicle',width:6.5,points:[[-95,0],[95,0]],name:'Calle Real'}],areas:[],lines:[],points:[],landmarks:[],warnings:[]};
  estimateHeights(model,'h');return model;
}
const overlap=(a,b)=>{const A=a.bbox,B=b.bbox;return Math.min(A[2],B[2])-Math.max(A[0],B[0])>.3&&Math.min(A[3],B[3])-Math.max(A[1],B[1])>.3;};

test('terrain filter keeps planar slopes intact and removes DEM bumps',()=>{
  const n=65,plane=[],bumpy=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const v=100+i*.5+j*.2;plane.push(v);bumpy.push(v+(i===32&&j===32?4:0));}
  const p=new Terrain({width:300,depth:300,resolution:n,heights:plane}),ps=p.smoothed(18);
  for(const [x,z]of [[-150,-150],[0,0],[150,150],[-120,90]])assert.ok(Math.abs(ps.height(x,z)-p.height(x,z))<1e-3);
  const b=new Terrain({width:300,depth:300,resolution:n,heights:bumpy}),bs=b.smoothed(18);
  assert.ok(b.height(0,0)-p.height(0,0)>3.9);assert.ok(bs.height(0,0)-p.height(0,0)<.6);
  assert.equal(p.smoothed(0),p);
});

test('urban context detects a low-rise Latin American historic core and lowers estimated floors',()=>{
  const model=street({extra:[house('osm:way:iglesia',rect(30,-40,50,-15),{building:'church'}),house('osm:way:capilla',rect(60,-40,70,-30),{building:'chapel'})]});
  model.areas=[{id:'osm:way:plaza',kind:'park',name:'Plaza de Armas',rings:[rect(-40,30,40,90)],area:4800}];
  const ctx=urbanContext(model);assert.equal(ctx.region,'latam');assert.equal(ctx.profile,'historico-latam');
  const r=rng('x'),levels=Array.from({length:200},()=>contextLevels(ctx.profile,{area:300},r));
  assert.ok(levels.every(l=>l>=1&&l<=3));assert.ok(levels.filter(l=>l===1).length>60);
  assert.equal(urbanContext(street({lat:40.4,lon:-3.7})).profile,'general');
});

test('block infill fills empty frontage with stable ids, never overlapping recorded buildings',()=>{
  const model=street(),a=buildInfill(model,{seed:'s'}),b=buildInfill(model,{seed:'s'});
  assert.ok(a.buildings.length>=4);
  assert.deepEqual(a.buildings.map(x=>x.id),b.buildings.map(x=>x.id));
  for(const lot of a.buildings){
    assert.match(lot.id,/^gen:relleno:osm:way:calle:[id]:\d+/);assert.equal(lot.inferred,true);assert.equal(lot.appearance.sources.footprint,'inferido:relleno');
    for(const o of model.buildings)assert.ok(!overlap(lot,o),lot.id+' solapa '+o.id);
    for(const o of a.buildings)if(o!==lot)assert.ok(!overlap(lot,o),lot.id+' solapa '+o.id);
    // detrás de la acera, nunca sobre la calzada
    for(const [,z]of lot.rings[0])assert.ok(Math.abs(z)>=6.5/2+1);
  }
});

test('infill respects parks behind the frontage and fully mapped frontages',()=>{
  const park=street();park.areas=[{id:'osm:way:parque',kind:'park',name:'Parque',rings:[rect(-95,8,95,60)],area:190*52}];
  assert.ok(buildInfill(park,{seed:'s'}).buildings.every(l=>l.bbox[1]<0),'ninguna parcela al sur, con el parque detrás');
  const full=street({extra:[...Array.from({length:4},(_,k)=>house('osm:way:o'+k,rect(-100+k*10,-20,-90+k*10,-6))),...Array.from({length:12},(_,k)=>house('osm:way:n'+k,rect(-20+k*10,-20,-10+k*10,-6))),...Array.from({length:20},(_,k)=>house('osm:way:s'+k,rect(-100+k*10,6,-90+k*10,20)))]});
  assert.equal(buildInfill(full,{seed:'s'}).buildings.length,0);
});

test('older projects keep their look: infill and terrain filter only when requested',()=>{
  assert.deepEqual(validateSettings({}),{region:'auto',floorHeight:3.2,defaultFloors:0,offline:false,infill:false,terrainSmooth:0});
  const model=street(),plain=withSettings(model,{},'h');assert.equal(plain.buildings.length,model.buildings.length);assert.equal(plain.terrain,model.terrain);
  const filled=withSettings(model,{infill:true,terrainSmooth:18},'h');
  assert.ok(filled.buildings.length>model.buildings.length);assert.ok(filled.buildings.filter(b=>b.inferred).every(b=>b.height>0&&b.estimated));
  assert.equal(filled.infill.lots,filled.buildings.length-model.buildings.length);
});

test('outlines replaced by building parts still block infill (Real Casa de Correos case)',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../reports/geographic-madrid-source.json',import.meta.url)));
  const model=buildPlaceModel(source,{seed:'datos'});
  assert.ok(Array.isArray(model.outlines));
  const fill=buildInfill(model,{seed:'datos'});
  const inRing=(x,z,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
  for(const lot of fill.buildings){const cx=(lot.bbox[0]+lot.bbox[2])/2,cz=(lot.bbox[1]+lot.bbox[3])/2;
    for(const o of model.outlines)assert.ok(!inRing(cx,cz,o.rings[0]),'parcela dentro del contorno '+o.id);}
});
