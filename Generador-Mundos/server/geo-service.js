import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PNG} from 'pngjs';
import {projection,validateBounds,tilePosition,longitudeSpan,boundsAround} from '../src/geo/projection.js';
import {countryFromAreas,HISPANIC} from '../src/estudio/data/country.js';
const USER_AGENT='SpanStories-Atlas/0.2 (local geographic reconstruction; cached, user-triggered requests)';
const ATTRIBUTION=[{source:'OpenStreetMap contributors',license:'ODbL 1.0',url:'https://www.openstreetmap.org/copyright',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/'},{source:'Mapzen Terrain Tiles / USGS / EU-DEM y proveedores regionales',license:'Licencias de las fuentes de elevación; ver atribuciones completas',url:'https://registry.opendata.aws/terrain-tiles/',licenseUrl:'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'}];
const elevationCredits='ArcticDEM: DigitalGlobe imagery, NSF awards 1043681, 1559691, 1542736. Australia: © Commonwealth of Australia (Geoscience Australia) 2017. Austria: offene Daten Österreichs DGM. Canada: Open Government Licence – Canada. Europe: Copernicus data and information funded by the European Union, EU-DEM layers. Global ETOPO1: NOAA. Mexico: INEGI Continental relief 2016. New Zealand: Copyright 2011 Crown copyright, Land Information New Zealand and New Zealand Government. Norway: © Kartverket. United Kingdom: © Environment Agency copyright/database right 2015. United States 3DEP and global GMTED2010/SRTM: U.S. Geological Survey.';
const OVERPASS_MIRRORS=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const retryableOverpass=error=>error.invalidOverpass||[429,500,502,503,504].includes(error.status)||error.name==='TimeoutError'||error.name==='AbortError'||/fetch failed|ECONNRESET|ETIMEDOUT/i.test(error.message);
const overpassFailure=(error,servers)=>(error.name==='TimeoutError'||error.name==='AbortError'||/fetch failed|ECONNRESET|ETIMEDOUT/i.test(error.message))?Object.assign(Error(`Los ${servers} servidores públicos de OpenStreetMap (Overpass) no respondieron a tiempo; están saturados. Reintenta en unos minutos (lo que ya se descargó queda en caché).`),{status:504}):error;
function validateOverpass(data){
 if(data?.remark||!Array.isArray(data?.elements))throw Object.assign(Error(data?.remark?'Consulta OSM incompleta: '+data.remark:'Respuesta OSM inválida'),{invalidOverpass:true});
}
export class GeoService{
 constructor({cacheDir,fetchImpl=fetch,photon=process.env.ATLAS_PHOTON_URL??'https://photon.komoot.io/api/',overpass=process.env.ATLAS_OVERPASS_URL??'https://overpass-api.de/api/interpreter',overpassMirrors=process.env.ATLAS_OVERPASS_URL?[]:OVERPASS_MIRRORS,dem=process.env.ATLAS_DEM_URL??'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',overpassStagger=15000}={}){this.cacheDir=cacheDir;this.fetch=fetchImpl;this.photon=photon;this.overpass=overpass;this.overpassMirrors=overpassMirrors;this.dem=dem;this.overpassStagger=overpassStagger;this.pending=new Map();this.queue=Promise.resolve();this.last=0;}
 async cached(key,load,{binary=false,refresh=false,maxAge=86400000,validate=()=>{}}={}){
  const hash=createHash('sha256').update(key).digest('hex'),path=this.cacheDir+'/'+hash+(binary?'.png':'.json');
  let stale=null;
  if(!refresh)try{const data=await readFile(path);if(binary)return data;const record=JSON.parse(data);validate(record.value);if(Date.now()-record.saved<maxAge)return record.value;stale=record;}catch{}
  if(this.pending.has(key))return this.pending.get(key);
  const promise=(async()=>{
   let value;try{value=await load();validate(value);}catch(error){if(stale&&stale.value&&typeof stale.value==='object'&&!Array.isArray(stale.value))return {...stale.value,_atlasCache:{stale:true,savedAt:new Date(stale.saved).toISOString(),reason:error.message}};throw error;}
   await mkdir(this.cacheDir,{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';
   await writeFile(temp,binary?value:JSON.stringify({saved:Date.now(),value}));await rename(temp,path);return value;
  })();
  this.pending.set(key,promise);try{return await promise;}finally{this.pending.delete(key);}
 }
 async request(url,options={}){const {timeoutMs=80000,queue=true,signal,...requestOptions}=options;const run=async()=>{if(queue){await new Promise(r=>setTimeout(r,Math.max(0,1100-(Date.now()-this.last))));this.last=Date.now();}const timeout=AbortSignal.timeout(timeoutMs);const response=await this.fetch(url,{...requestOptions,headers:{'User-Agent':USER_AGENT,...requestOptions.headers},signal:signal?AbortSignal.any([timeout,signal]):timeout});if(!response.ok)throw Object.assign(Error(`Fuente geográfica respondió HTTP ${response.status}`),{status:response.status});const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>60*1024*1024)throw Error('La fuente devolvió más de 60 MB; selecciona un área menor');return bytes;};if(!queue)return run();const task=this.queue.then(run);this.queue=task.catch(()=>{});return task;}
 // Overpass público saturado: los servidores pueden tardar >30 s incluso en consultas mínimas. En lugar de esperar el tiempo completo
 // de cada servidor en fila, se lanza el siguiente espejo si el anterior falla o tarda más de `overpassStagger`; gana la primera respuesta válida.
 overpassRace(query,timeoutMs,providers){const urls=[this.overpass,...this.overpassMirrors],started=[],controllers=[],timers=[];
  return new Promise((resolve,reject)=>{let done=false,failed=0,last;
   const finish=(fn,value)=>{done=true;timers.forEach(clearTimeout);controllers.forEach(c=>c.abort());fn(value);};
   const launch=i=>{if(done||i>=urls.length||started[i])return;started[i]=true;const url=urls[i],controller=new AbortController();controllers.push(controller);
    if(i+1<urls.length)timers.push(setTimeout(()=>launch(i+1),this.overpassStagger));
    (async()=>{let value;try{value=JSON.parse(await this.request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),timeoutMs,queue:false,signal:controller.signal}));}catch(error){if(error instanceof SyntaxError)error.invalidOverpass=true;throw error;}validateOverpass(value);return value;})()
     .then(value=>{if(done)return;providers.add(url);finish(resolve,value);},error=>{if(done)return;last=error;if(!retryableOverpass(error))return finish(reject,error);failed++;if(failed>=urls.length)return finish(reject,overpassFailure(last,urls.length));launch(i+1);});};
   launch(0);});}
 async search(query){query=String(query??'').trim();if(query.length<2||query.length>150)throw Error('Introduce entre 2 y 150 caracteres');return this.cached('photon:es:'+query,async()=>{const url=new URL(this.photon);url.searchParams.set('q',query);url.searchParams.set('limit','12');url.searchParams.set('lang','es');const data=JSON.parse(await this.request(url));
  // Atlas se optimiza para lugares hispanohablantes: aparecen primero (orden estable del proveedor dentro de cada grupo).
  const found=(data.features??[]).filter(f=>f.geometry?.type==='Point').map(f=>{const code=String(f.properties.countrycode??'').toUpperCase()||null;return {lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],name:[f.properties.name,f.properties.city,f.properties.country].filter(Boolean).join(', '),osmId:f.properties.osm_id,osmType:f.properties.osm_type,countryCode:code,hispanic:Boolean(HISPANIC[code])};});
  return {results:[...found.filter(r=>r.hispanic),...found.filter(r=>!r.hispanic)].slice(0,6),provider:'Photon / OpenStreetMap',attribution:ATTRIBUTION[0]};},{maxAge:7*86400000});}
 async osm(bounds,refresh=false){const b=validateBounds(bounds),boxes=b.west<=b.east?[[b.south,b.west,b.north,b.east]]:[[b.south,b.west,b.north,180],[b.south,-180,b.north,b.east]],elements=new Map();let timestamps=[],cache=[];
 const warnings=[],providers=new Set();
 for(const box of boxes){
   // Incluye partes multipoligonales. Un complemento fallido no invalida una ciudad usable.
   const base=`[out:json][timeout:55];(nwr[building](${box});nwr["building:part"](${box});nwr[highway](${box});way[waterway](${box});nwr[natural](${box});nwr[landuse](${box});nwr[leisure](${box});nwr[amenity](${box});way[railway](${box});nwr[man_made](${box}););out body geom;`;
   const extra=`[out:json][timeout:20];(nwr[historic](${box});nwr[tourism=artwork](${box}););out body geom;`;
   const load=async(query,timeoutMs=80000)=>{
     // Espejos públicos de Overpass: solo ante saturación/caída (429, 5xx, tiempo agotado); la caché no depende del servidor.
     const data=await this.cached('overpass:'+query,()=>this.overpassRace(query,timeoutMs,providers),{refresh,validate:validateOverpass});
     // Un duplicado del complemento no sustituye el registro base.
     for(const e of data.elements)if(!elements.has(e.type+':'+e.id))elements.set(e.type+':'+e.id,e);
     timestamps.push(data.osm3s?.timestamp_osm_base??null);if(data._atlasCache)cache.push(data._atlasCache);
   };
   await load(base);
   try{await load(extra,8000);}catch(error){if(refresh)throw error;warnings.push('Complemento de tiendas/monumentos no disponible; se mantiene OSM base: '+error.message);}
 }
 const shops=await this.shops(b,{refresh,optional:true});for(const e of shops.elements){const key=e.type+':'+e.id,old=elements.get(key);elements.set(key,old?{...old,...e,tags:{...old.tags,...e.tags}}:e);}if(!shops.coverage.complete)warnings.push('Comercios no descargados: '+shops.coverage.error);
 if(elements.size>80000)throw Error('El área contiene más de 80.000 elementos; selecciona una región menor para editarla interactivamente');return {elements:[...elements.values()],timestamps,cache,warnings,commerceCoverage:shops.coverage,provider:[...providers][0]??this.overpass};}
 async shops(bounds,{refresh=false,optional=false}={}){const b=validateBounds(bounds),boxes=b.west<=b.east?[[b.south,b.west,b.north,b.east]]:[[b.south,b.west,b.north,180],[b.south,-180,b.north,b.east]],providers=new Set(),elements=new Map();try{for(const box of boxes){const query=`[out:json][timeout:50];(nwr[shop](${box});nwr[amenity~"^(pharmacy|restaurant|cafe|bar|bank|fast_food|post_office)$"](${box}););out body geom;`,data=await this.cached('overpass-shops:'+query,()=>this.overpassRace(query,55000,providers),{refresh,validate:validateOverpass});for(const e of data.elements)elements.set(e.type+':'+e.id,e);}return {elements:[...elements.values()],coverage:{complete:true,count:elements.size,at:new Date().toISOString(),providers:[...providers]}};}catch(error){if(!optional)throw error;return {elements:[],coverage:{complete:false,error:error.message,at:new Date().toISOString()}};}}
 async elevation(bounds,resolution=129){const frame=projection(bounds),b=frame.bounds,z=Math.max(5,Math.min(14,Math.ceil(Math.log2(40075016*Math.cos(b.centerLat*Math.PI/180)/(Math.max(b.width,b.depth)/(resolution-1)*256))))),positions=[],tiles=new Map(),n=2**z;
 for(let j=0;j<resolution;j++)for(let i=0;i<resolution;i++){const {lat,lon}=frame.unproject((i/(resolution-1)-.5)*b.width,(j/(resolution-1)-.5)*b.depth),p=tilePosition(lat,lon,z);positions.push(p);for(const [dx,dy]of [[0,0],[1,0],[0,1],[1,1]]){const px=Math.floor(p.x*256-.5)+dx,py=Math.floor(p.y*256-.5)+dy,tx=((Math.floor(px/256)%n)+n)%n,ty=Math.max(0,Math.min(n-1,Math.floor(py/256))),key=tx+':'+ty;if(!tiles.has(key))tiles.set(key,{tx,ty});}}
 for(const [key,tile]of tiles){const url=`${this.dem}/${z}/${tile.tx}/${tile.ty}.png`,buffer=await this.cached('dem:'+url,()=>this.request(url),{binary:true});const png=PNG.sync.read(buffer);if(png.width!==256||png.height!==256)throw Error('Formato de elevación inesperado');tiles.set(key,{...tile,png,url});}
 const pixel=(x,y)=>{const tx=((Math.floor(x/256)%n)+n)%n,ty=Math.max(0,Math.min(n-1,Math.floor(y/256))),png=tiles.get(tx+':'+ty).png,px=((x%256)+256)%256,py=((y%256)+256)%256,i=(py*256+px)*4;if(png.data[i+3]===0)throw Error('La fuente de elevación no tiene cobertura en parte del área');return png.data[i]*256+png.data[i+1]+png.data[i+2]/256-32768;};
 const heights=positions.map(p=>{const x=p.x*256-.5,y=p.y*256-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;return (pixel(ix,iy)*(1-fx)+pixel(ix+1,iy)*fx)*(1-fy)+(pixel(ix,iy+1)*(1-fx)+pixel(ix+1,iy+1)*fx)*fy;});
 return {resolution,width:b.width,depth:b.depth,heights,provider:'Mapzen Terrain Tiles',encoding:'Terrarium',zoom:z,nominalPixelMeters:40075016*Math.cos(b.centerLat*Math.PI/180)/(n*256),tiles:[...tiles.values()].map(t=>t.url),attribution:ATTRIBUTION[1],credits:elevationCredits};}
 // País y subdivisión del centro (límites administrativos OSM). Opcional: si falla, el cliente aproxima por coordenadas.
 async country(bounds,{refresh=false}={}){const b=validateBounds(bounds),lat=Math.round(b.centerLat*1000)/1000,lon=Math.round(b.centerLon*1000)/1000;
  const query=`[out:json][timeout:20];is_in(${lat},${lon})->.a;area.a["boundary"="administrative"]["admin_level"~"^(2|4)$"];out tags;`;
  const data=await this.cached('overpass-country:'+query,()=>this.overpassRace(query,25000,new Set()),{refresh,maxAge:365*86400000,validate:validateOverpass});
  return countryFromAreas(data.elements,{lat,lon});}
 // Los lugares siempre son cuadrados: un área rectangular se amplía al cuadrado de su lado mayor, con el mismo centro.
 static square(bounds){const b=validateBounds(bounds);if(Math.abs(b.width-b.depth)<=.5)return b;const side=Math.max(b.width,b.depth);return boundsAround(b.centerLat,b.centerLon,side,side);}
 async region(bounds,{refresh=false,label='Región seleccionada'}={}){const b=GeoService.square(bounds),osm=await this.osm(b,refresh),elevation=await this.elevation(b);let country=null;try{country=await this.country(b,{refresh});}catch(error){osm.warnings.push('País no consultado en OSM; se aproxima por coordenadas: '+error.message);}return {format:'atlas-geographic-source',version:1,label:String(label).slice(0,200),bounds:b,osm,elevation,country,retrievedAt:new Date().toISOString(),attribution:ATTRIBUTION,licensesNotice:'Datos OSM bajo ODbL 1.0; mantener atribución y condiciones de redistribución de bases derivadas. Elevación: licencias y atribuciones regionales incluidas.'};}
}
