import test from 'node:test';
import assert from 'node:assert/strict';
import {approximateCountry,countryFromAreas,resolveCountry} from '../src/estudio/data/country.js';
import {regionOf} from '../src/estudio/arq/styles.js';
import {buildSea} from '../src/estudio/data/coast.js';
import {buildPlaceModel} from '../src/estudio/data/place-model.js';
import {buildBuildings} from '../src/estudio/arq/buildings.js';
import {buildGround} from '../src/estudio/geom/ground.js';
import {projection,boundsAround} from '../src/geo/projection.js';
import {GeoService} from '../server/geo-service.js';

test('región de estilos por país: solo los lugares hispanohablantes reciben estilos regionales',()=>{
  const at=(lat,lon)=>approximateCountry(lat,lon);
  // Errores de la detección anterior por rectángulos.
  assert.equal(at(38.72,-9.14).region,'generic');   // Lisboa no es España
  assert.equal(at(43.6,1.44).region,'generic');     // Toulouse no es Cataluña
  assert.equal(at(35.77,-5.8).region,'generic');    // Tánger no es Andalucía
  assert.equal(at(38.35,-.48).region,'espana');     // Alicante no es Andalucía
  assert.equal(at(25.76,-80.19).region,'generic');  // Miami no es Latinoamérica
  assert.equal(at(-23.55,-46.63).region,'generic'); // São Paulo: lusófono
  assert.equal(at(17.5,-88.2).region,'generic');    // Belice
  // Se conservan los aciertos.
  assert.equal(at(40.4169,-3.7035).region,'espana');assert.equal(at(41.39,2.165).region,'catalunya');assert.equal(at(40.81,.52).region,'catalunya');
  assert.equal(at(37.386,-5.99).region,'andalucia');assert.equal(at(28.12,-15.43).region,'canarias');
  for(const [lat,lon,sub]of [[19.43,-99.13,'mexico'],[14.63,-90.5,'centroamerica'],[23.136,-82.351,'caribe'],[18.466,-66.117,'caribe'],[4.597,-74.073,'andes'],[-34.6083,-58.3721,'cono-sur'],[-34.9,-56.16,'cono-sur']]){
    const c=at(lat,lon);assert.equal(c.region,'latam',`${lat},${lon}`);assert.equal(c.subregion,sub);assert.ok(c.hispanic);}
  assert.equal(at(3.75,8.78).hispanic,true);
  // Sin datos: Madrid por defecto, como antes.
  assert.equal(regionOf({}),'espana');
});

test('el país de OSM (is_in) manda sobre la aproximación y la corrección manual sobre ambos',()=>{
  const ct=countryFromAreas([{tags:{'ISO3166-1':'ES',name:'España',admin_level:'2'}},{tags:{'ISO3166-2':'ES-CT',admin_level:'4'}}]);
  assert.equal(ct.code,'ES');assert.equal(ct.subdivision,'ES-CT');assert.equal(ct.region,'catalunya');
  const pr=countryFromAreas([{tags:{'ISO3166-1':'US'}},{tags:{'ISO3166-2':'US-PR'}}]);assert.equal(pr.code,'PR');assert.equal(pr.region,'latam');
  const pt=countryFromAreas([{tags:{'ISO3166-1':'PT'}}]);assert.equal(pt.hispanic,false);assert.equal(pt.region,'generic');
  // Lugar en el borde: OSM dice Uruguay aunque las coordenadas gruesas no lo resuelvan.
  const bounds={centerLat:-30.9,centerLon:-55.54};
  assert.equal(regionOf({...bounds,country:countryFromAreas([{tags:{'ISO3166-1':'UY'}}])}),'latam');
  assert.equal(regionOf({...bounds,country:pt,regionOverride:'espana'}),'espana');
  assert.equal(resolveCountry({bounds:{centerLat:41.39,centerLon:2.165},country:{code:'ES',subdivision:'ES-CT',source:'osm:is_in'}}).region,'catalunya');
});

test('el servidor guarda el país y ordena la búsqueda con los lugares hispanohablantes primero',async()=>{
  const service=new GeoService({cacheDir:'unused'});service.cached=async(key,load)=>load();
  service.overpassRace=async query=>{assert.match(query,/is_in\(/);return {elements:[{type:'area',id:1,tags:{'ISO3166-1':'MX',name:'México'}}]};};
  assert.equal((await service.country({south:19.42,west:-99.14,north:19.44,east:-99.12})).region,'latam');
  service.request=async()=>Buffer.from(JSON.stringify({features:[
    {geometry:{type:'Point',coordinates:[-83.5,41.65]},properties:{name:'Toledo',country:'Estados Unidos',countrycode:'US'}},
    {geometry:{type:'Point',coordinates:[-4.02,39.86]},properties:{name:'Toledo',country:'España',countrycode:'ES'}}]}));
  const found=await service.search('Toledo');assert.equal(found.results[0].countryCode,'ES');assert.equal(found.results[0].hispanic,true);
});

test('los lugares siempre son cuadrados al pedirlos al servidor',()=>{
  const b=GeoService.square({south:40.41,north:40.42,west:-3.71,east:-3.70});
  assert.ok(Math.abs(b.width-b.depth)<.01);assert.ok(Math.abs(b.centerLat-40.415)<1e-9);
  const square=boundsAround(40,-3.7,400,400);assert.deepEqual(GeoService.square(square),square);
});

test('mar: las líneas de costa se cierran por el borde del cuadrado con el agua a la derecha',()=>{
  // De oeste a este por z=0: el agua queda al sur (z positivo).
  let sea=buildSea([[[-300,0],[300,0]]],400,400);assert.equal(sea.status,'ok');assert.equal(Math.round(sea.area),80000);
  assert.ok(sea.polygons[0][0].every(([,z])=>z>=-1e-6));
  // Sentido opuesto: agua al norte.
  sea=buildSea([[[300,10],[-300,10]]],400,400);assert.equal(Math.round(sea.area),84000);
  // Tramos encadenados y una isla dentro del mar.
  assert.equal(Math.round(buildSea([[[-300,0],[0,0]],[[0,0],[300,0]]],400,400).area),80000);
  assert.equal(Math.round(buildSea([[[-50,50],[50,50],[50,-50],[-50,-50],[-50,50]]],400,400).area),150000);
  // Costa en esquina.
  assert.equal(Math.round(buildSea([[[-300,50],[0,50],[50,-300]]],400,400).area),105536);
  // Datos incompletos: no se inventa el mar ni se inunda la ciudad.
  const broken=buildSea([[[-300,0],[0,0]]],400,400);assert.equal(broken.status,'incompleta');assert.equal(broken.polygons.length,0);
  assert.equal(buildSea([],400,400).status,'sin-costa');
});

function coastSource(){
  const b=boundsAround(10.4235,-75.55,400,400),P=projection(b),ll=(x,z)=>P.unproject(x,z),els=[];let id=1;
  const way=(pts,tags)=>els.push({type:'way',id:id++,tags,nodes:pts.map(()=>id++),geometry:pts.map(([x,z])=>ll(x,z))});
  way([[260,40],[120,55],[40,30],[-60,70],[-180,50],[-260,60]],{natural:'coastline'});
  way([[10,62],[10,-60]],{man_made:'pier',width:'4'});
  way([[-250,120],[250,120]],{highway:'primary',name:'Avenida'});
  way([[-100,140],[-60,140],[-60,170],[-100,170],[-100,140]],{building:'yes','building:levels':'3'});
  way([[170,140],[240,140],[240,175],[170,175],[170,140]],{building:'apartments','building:levels':'5'});
  const n=33,heights=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++){const z=(j/(n-1)-.5)*400;heights.push(z<60?-12+z*.02:3+(z-60)*.01);}
  return {format:'atlas-geographic-source',version:1,label:'Costa sintética',bounds:b,osm:{elements:els,timestamps:[],cache:[],warnings:[]},
    elevation:{resolution:n,width:P.bounds.width,depth:P.bounds.depth,heights},retrievedAt:'2026-11-05T00:00:00Z',attribution:[],country:{code:'CO',subdivision:null,source:'osm:is_in'}};
}

test('lugar costero: mar plano al nivel del mar, muelle sobre el agua y país guardado',()=>{
  const model=buildPlaceModel(coastSource(),{seed:'costa'});
  assert.equal(model.context.country.code,'CO');assert.equal(model.context.region,'latam');assert.equal(model.context.country.subregion,'andes');
  const sea=model.areas.filter(a=>a.sea);assert.equal(sea.length,1);assert.equal(model.sea.status,'ok');assert.ok(model.sea.area>90000);
  // Batimetría fijada: el fondo bajo el mar es plano y la tierra no queda por debajo del agua.
  assert.equal(model.terrain.height(0,-150),model.sea.level);assert.equal(model.terrain.height(150,-180),model.sea.level);
  assert.ok(model.terrain.height(0,150)>model.sea.level);
  assert.equal(model.areas.filter(a=>a.kind==='pier').length,1);
  const ground=buildGround(model,{seed:'costa'}),names=ground.exclusive.map(l=>l.name);
  assert.ok(names.includes('sea'));assert.ok(names.includes('pier'));assert.ok(!names.includes('water'));
  // Fuera del ámbito hispanohablante se avisa, sin bloquear.
  const outside=coastSource();outside.country={code:'BR',source:'osm:is_in'};
  const m2=buildPlaceModel(outside,{seed:'costa'});assert.equal(m2.context.region,'generic');assert.ok(m2.warnings.some(w=>/hispanohablante/.test(w)));assert.ok(m2.buildings.length>0);
});

test('bordes cuadrados: un edificio que cruza el límite se corta en línea recta y el corte es pared lisa',()=>{
  const model=buildPlaceModel(coastSource(),{seed:'costa'}),half=model.size.width/2;
  const crossing=model.buildings.find(b=>b.rings[0].some(p=>p[0]>half));assert.ok(crossing,'el edificio fuente conserva su huella completa');
  const built=buildBuildings(model,{seed:'costa'});
  for(const pb of built.prepared)for(const ring of pb.rings)for(const [x,z]of ring){assert.ok(Math.abs(x)<=half+1e-6&&Math.abs(z)<=half+1e-6);}
  const pb=built.prepared.find(p=>p.b.id===crossing.id);assert.ok(pb.cutBox);
  const cut=pb.edges.filter(e=>e.cut);assert.equal(cut.length,1);assert.equal(cut[0].exp,'party');
  assert.ok(Math.abs(cut[0].a[0]-half)<.05&&Math.abs(cut[0].b[0]-half)<.05);
  // Ningún elemento instanciado (ventanas, mobiliario) fuera del cuadrado.
  for(const g of built.instances.groups.values())for(let i=0;i<g.matrices.length;i+=16){assert.ok(Math.abs(g.matrices[i+12])<=half+.02&&Math.abs(g.matrices[i+14])<=half+.02);}
  // El otro edificio, dentro del cuadrado, no se toca.
  const inner=built.prepared.find(p=>p.b.id!==crossing.id);assert.equal(inner.cutBox,null);assert.ok(inner.edges.every(e=>!e.cut));
});

test('mar con profundidad pintada, orilla de playa, muelle con pilotes y zócalo en el borde del cuadrado',async()=>{
  const {seaBands}=await import('../src/estudio/geom/ground.js');
  const {buildInfra}=await import('../src/estudio/arq/infra.js');
  const {MeshBuilder}=await import('../src/estudio/geom/mesh.js');
  const {InstanceSet}=await import('../src/estudio/arq/instances.js');
  const {polygonPaths,union,rectPath}=await import('../src/estudio/geom/clip.js');
  const source=coastSource(),P=projection(source.bounds);
  source.osm.elements.push({type:'way',id:900,tags:{natural:'beach'},nodes:[1,2,3,4,1],geometry:[[-200,42],[-60,62],[-60,100],[-200,100],[-200,42]].map(([x,z])=>P.unproject(x,z))});
  const model=buildPlaceModel(source,{seed:'costa'}),half=model.size.width/2;
  const sea=union(model.areas.filter(a=>a.sea).flatMap(a=>polygonPaths(a.rings)));
  const bands=seaBands(sea,sea,[rectPath(-half,-half,half,half)]).map(b=>b.key);
  assert.deepEqual(bands,['seaFoam','seaShallow','seaMid','sea']);
  const ground=buildGround(model,{seed:'costa'}),keys=ground.meshes.map(m=>m.key);
  assert.ok(keys.includes('zocalo'));
  // El zócalo ocupa exactamente los cuatro lados del cuadrado y baja por debajo del agua.
  const skirt=ground.meshes.find(m=>m.key==='zocalo').geometry.attributes.position;let onEdge=0;
  for(let i=0;i<skirt.count;i++){const x=skirt.getX(i),z=skirt.getZ(i);if(Math.abs(Math.abs(x)-half)<1e-3||Math.abs(Math.abs(z)-half)<1e-3)onEdge++;}
  assert.equal(onEdge,skirt.count);
  const mb=new MeshBuilder(),inst=new InstanceSet();inst.bounds=[-half,-half,half,half];
  const infra=buildInfra(model,{mb,inst,seed:'costa'});assert.ok(infra.piers>10,'pilotes bajo el muelle');
});

test('al caminar no se entra en el mar, pero sí se recorre el muelle',async()=>{
  const {Walker}=await import('../src/estudio/render/walk.js');
  const model=buildPlaceModel(coastSource(),{seed:'costa'});
  const w=Object.create(Walker.prototype);w.radius=.3;w.eye=1.6;w.pos={x:0,y:0,z:0};
  w.setWorld({model,buildings:[],asphalt:[],trees:[],lines:[],surfaces:[]});
  assert.equal(w.inWater(-150,-150,0),true);
  assert.equal(w.inWater(10,-20,0),false);   // sobre el muelle
  assert.equal(w.inWater(-150,150,0),false); // tierra
});
