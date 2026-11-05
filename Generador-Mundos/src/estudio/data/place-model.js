// OSM normalizado -> modelo de lugar del Estudio (datos puros, serializables, con ids estables).
// La representación 3D se decide después; aquí solo se interpreta la fuente y se estiman huecos.
import {normalizeOSM,metric} from '../../geo/osm.js';
import {polygonArea} from '../../geo/projection.js';
import {Terrain} from './terrain.js';
import {rng,hashString} from './rng.js';
import {appearancePolicy} from './appearance-policy.js';
import {urbanContext,contextLevels} from './context.js';
import {polygonPaths,intersection,union,pathsArea,rectPath} from '../geom/clip.js';
import {commercialRecord} from './shop-categories.js';
import {resolveCountry} from './country.js';
import {buildSea} from './coast.js';
import {offsetLines,toExPolygons} from '../geom/clip.js';

export const FLOOR_HEIGHT=3.2;

const VEHICLE={motorway:14,trunk:12,primary:11,secondary:9.5,tertiary:8,unclassified:6.5,residential:6.5,
  motorway_link:7,trunk_link:7,primary_link:7,secondary_link:7,tertiary_link:6.5,road:6.5,busway:7};
const FLUSH={service:4.2,living_street:5.5,track:3.2,raceway:8};
const PEDESTRIAN={pedestrian:6,footway:2.4,path:1.8,cycleway:2.2,steps:2.6,bridleway:2.2,corridor:2};

const asPoints=ring=>ring.map(p=>[p.x,p.z]);
const centroid=ring=>{let x=0,z=0;for(const p of ring){x+=p[0];z+=p[1];}return [x/ring.length,z/ring.length];};
function inRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const inPolygon=(x,z,rings)=>inRing(x,z,rings[0])&&!rings.slice(1).some(r=>inRing(x,z,r));
const ringArea=r=>polygonArea(r.map(([x,z])=>({x,z})));
const polygonAreaNet=rings=>Math.max(0,ringArea(rings[0])-rings.slice(1).reduce((sum,r)=>sum+ringArea(r),0));

function areaKind(t){
  if(t.natural==='water'||t.water||t.waterway==='riverbank'||['reservoir','basin'].includes(t.landuse))return 'water';
  if(t.leisure==='swimming_pool')return 'pool';
  if(t.leisure==='track')return 'track';
  if(t.leisure==='pitch')return 'pitch';
  if(t.leisure==='playground')return 'playground';
  if(['park','garden','dog_park'].includes(t.leisure))return 'park';
  if(['grass','meadow','village_green','recreation_ground','cemetery','allotments','flowerbed'].includes(t.landuse)||['grassland','heath'].includes(t.natural))return 'grass';
  if(t.natural==='scrub')return 'scrub';
  if(t.landuse==='forest'||t.natural==='wood')return 'forest';
  if(['sand','beach'].includes(t.natural))return 'sand';
  if(t.highway==='pedestrian'||t.place==='square'||t['area:highway']||t.amenity==='marketplace'||t.highway==='footway'&&t.area==='yes')return 'plaza';
  if(t.amenity==='parking'&&!['underground','multi-storey','rooftop'].includes(t.parking))return 'parking';
  if(['school','college','university','kindergarten'].includes(t.amenity))return 'school';
  if(t.landuse==='railway')return 'gravel';
  if(['farmland','orchard','vineyard'].includes(t.landuse))return 'farmland';
  if(t.man_made==='pier')return 'pier';
  if(['breakwater','groyne'].includes(t.man_made))return 'breakwater';
  return null;
}

function buildingUse(t){
  const b=t.building||t['building:part']||'yes';
  if(['church','cathedral','chapel','mosque','temple','synagogue','shrine'].includes(b)||t.amenity==='place_of_worship')return 'religious';
  if(['house','detached','semidetached_house','bungalow','terrace','farm','cabin','villa'].includes(b))return 'house';
  if(['garage','garages','shed','hut','kiosk','toilets','carport','service','transformer_tower'].includes(b))return 'small';
  if(['roof','canopy'].includes(b))return 'canopy';
  if(['commercial','retail','supermarket','kiosk','office','hotel'].includes(b)||t.shop||t.office)return b==='office'?'office':'commercial';
  if(['industrial','warehouse','factory','manufacture','hangar'].includes(b))return 'industrial';
  if(['school','university','college','kindergarten'].includes(b)||['school','university','college','kindergarten'].includes(t.amenity))return 'school';
  if(['public','civic','government','hospital','train_station','transportation','museum','stadium','sports_hall','sports_centre','fire_station'].includes(b)||t.amenity)return 'public';
  if(['apartments','residential','dormitory'].includes(b))return 'residential';
  return 'generic';
}

function roofShape(t,use){
  const s=t['roof:shape'];
  if(s)return s;
  return use==='house'||use==='religious'?'hipped':'flat';
}

export function buildPlaceModel(source,{seed='atlas'}={}){
  const started=performance.now();
  const {features,warnings,frame}=normalizeOSM(source);
  for(const cached of source.osm?.cache??[])if(cached.stale)warnings.push('Fuente OSM en caché, sin actualizar desde '+cached.savedAt+'; '+cached.reason);
  warnings.push(...(source.osm?.warnings??[]));
  const W=frame.width,D=frame.depth,half={x:W/2,z:D/2};
  // País del lugar: decide la región de estilos. Fuera del ámbito hispanohablante se generan estilos genéricos.
  const country=resolveCountry(source);
  if(!country.hispanic)warnings.push('Lugar fuera del ámbito hispanohablante: Atlas se optimiza para lugares donde el español es la primera lengua; se usan estilos genéricos.');
  const selection=[rectPath(-half.x,-half.z,half.x,half.z)];
  const e=source.elevation;
  const inArea=(x,z,m=0)=>Math.abs(x)<=half.x+m&&Math.abs(z)<=half.z+m;

  const buildings=[],parts=[],roads=[],areas=[],points=[],lines=[],pois=[],landmarks=[],coastLines=[],piers=[];
  for(const f of features){
    const t=f.tags||{};
    // Conserva también identidades de contornos sustituidos por sus partes y monumentos sin huella edificable.
    if(t.wikidata||t.historic){const ring=f.rings?.[0]??f.points,at=f.type==='point'?[f.x,f.z]:ring?.length?centroid(asPoints(ring)):null;
      if(at&&inArea(at[0],at[1]))landmarks.push({id:f.id,name:t.name??null,x:at[0],z:at[1],tags:pickTags(t,['name','wikidata','wikipedia','historic','tourism','heritage']),representation:'referencia; geometría no certificada'});
    }
    if(f.type==='polygon'){
      const rings=f.rings.map(asPoints).filter(r=>r.length>=3);
      if(!rings.length)continue;
      const isBuilding=t.building&&t.building!=='no',isPart=t['building:part']&&t['building:part']!=='no';
      if(isBuilding||isPart){
        if(t.location==='underground'||t.layer&&Number(t.layer)<0&&!t['building:part'])continue;
        const c=centroid(rings[0]),xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]),bbox=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
        if(bbox[2]<-half.x||bbox[0]>half.x||bbox[3]<-half.z||bbox[1]>half.z)continue;
        const paths=polygonPaths(rings);
        if(pathsArea(intersection(paths,selection))<.01)continue;
        (isPart?parts:buildings).push({f,rings,c,bbox,paths,area:polygonAreaNet(rings)});continue;
      }
      const kind=areaKind(t);
      if(t.shop||['pharmacy','restaurant','cafe','bar','bank','fast_food','post_office'].includes(t.amenity)){const c=centroid(rings[0]);pois.push(commercialRecord(f.id,c[0],c[1],t,{rings}));}
      if(kind){const c=centroid(rings[0]);areas.push({id:f.id,kind,rings,name:t.name||null,tags:pickTags(t,['sport','surface','leisure','amenity','name']),area:ringArea(rings[0]),c});}
      if(t.highway&&PEDESTRIAN[t.highway]&&t.area!=='yes'&&!kind){/* anillo peatonal cerrado sin área: tratar como línea */
        roads.push(roadFrom(f.id,t,rings[0].concat([rings[0][0]])));}
    }else if(f.type==='line'){
      const pts=f.points.map(p=>[p.x,p.z]);
      if(t.highway){
        if(['proposed','construction','abandoned','platform','elevator','bus_stop'].includes(t.highway))continue;
        if(!VEHICLE[t.highway]&&!FLUSH[t.highway]&&!PEDESTRIAN[t.highway])continue;
        roads.push(roadFrom(f.id,t,pts));
      }else if(t.natural==='coastline'){coastLines.push(pts);
      }else if(['pier','breakwater','groyne'].includes(t.man_made)&&t.area!=='no'){
        // Muelles y espigones: una vía cerrada es su contorno; una abierta, su eje con la anchura registrada.
        const kind=t.man_made==='pier'?'pier':'breakwater',closed=pts.length>3&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.01;
        piers.push({id:f.id,kind,closed,points:pts,width:metric(t.width)??(kind==='pier'?3:5),name:t.name||null,tags:pickTags(t,['man_made','name','surface','width'])});
      }else if(t.natural==='tree_row'||t.barrier||t.railway||t.waterway){
        if(t.railway&&(['subway','abandoned','disused','razed','proposed'].includes(t.railway)||t.tunnel&&t.tunnel!=='no'))continue;
        lines.push({id:f.id,kind:t.natural==='tree_row'?'tree_row':t.barrier?'barrier':t.railway?'rail':'waterway',
          sub:t.barrier||t.railway||t.waterway||null,points:pts,height:metric(t.height),width:metric(t.width)});
      }
    }else if(f.type==='point'){
      const kind=pointKind(t);
      if(kind&&inArea(f.x,f.z,2))points.push({id:f.id,kind,x:f.x,z:f.z,tags:pickTags(t,['direction','name','highway','crossing','height','leaf_type','species','genus','historic','tourism','wikidata','wikipedia'])});
      if((t.shop||t.amenity&&!['bench','waste_basket','bicycle_parking','parking','fountain','vending_machine','post_box','telephone','recycling','parking_entrance','toilets'].includes(t.amenity)||t.office||t.craft)&&inArea(f.x,f.z,2))
        pois.push(commercialRecord(f.id,f.x,f.z,t));
    }
  }

  // Mar: líneas de costa cerradas por el borde del cuadrado. Muelles y espigones lineales: franjas con su anchura.
  const sea=buildSea(coastLines,W,D);
  if(sea.warning)warnings.push(sea.warning);
  sea.polygons.forEach((rings,i)=>areas.push({id:'osm:costa:mar:'+i,kind:'water',sea:true,rings,name:'Mar',tags:{natural:'coastline'},area:polygonAreaNet(rings),c:centroid(rings[0]),representation:'derivado de natural=coastline'}));
  for(const p of piers){
    const polys=p.closed?[{outer:p.points.slice(0,-1),holes:[]}]:toExPolygons(offsetLines([{points:p.points,width:p.width}],{join:'miter',end:'butt'}));
    polys.forEach((poly,i)=>{const rings=[poly.outer,...poly.holes];areas.push({id:p.id+(polys.length>1?':'+i:''),kind:p.kind,rings,name:p.name,tags:p.tags,area:polygonAreaNet(rings),c:centroid(rings[0])});});
  }
  // Relieve: el proveedor incluye batimetría bajo el mar. Las celdas marinas se fijan al nivel del mar (0 m) para
  // que el agua quede plana y el origen local no dependa de la profundidad del fondo; la tierra queda al menos a 0,5 m.
  let heights=e?.heights;
  if(e&&sea.polygons.length){const n=e.resolution,seaPolys=sea.polygons.map(r=>r.map(ring=>ring));heights=e.heights.slice();
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=(i/(n-1)-.5)*e.width,z=(j/(n-1)-.5)*e.depth;if(seaPolys.some(rings=>inPolygon(x,z,rings)))heights[j*n+i]=0;
      // La batimetría del proveedor no coincide exactamente con la costa de OSM: la tierra no queda bajo el agua.
      else heights[j*n+i]=Math.max(heights[j*n+i],.5);}}
  const terrain=e?new Terrain({width:e.width,depth:e.depth,resolution:e.resolution,heights}):Terrain.flat(W,D);

  // Partes de edificio (Simple 3D Buildings): si un contorno tiene partes, se dibujan las partes.
  const outlinesWithParts=new Set(),partOf=new Map();
  // Centroides de huellas en U o con patio pueden caer fuera del sólido. Asociar por
  // superficie compartida y elegir el contorno menor que realmente contiene la parte.
  for(const p of parts){let parent=null;
    for(const b of buildings){
      if(b.bbox[2]<p.bbox[0]||b.bbox[0]>p.bbox[2]||b.bbox[3]<p.bbox[1]||b.bbox[1]>p.bbox[3])continue;
      if(pathsArea(intersection(p.paths,b.paths))>=p.area*.98&&(!parent||b.area<parent.area))parent=b;
    }
    if(parent){outlinesWithParts.add(parent.f.id);partOf.set(p.f.id,parent);}
  }
  // Partes que no cubren la huella (p. ej. solo las torres de una catedral): el contorno sigue siendo el
  // cuerpo del edificio. Su altura registrada suele ser la de la parte más alta: entonces se estima.
  const partial=new Map();
  for(const b of buildings){if(!outlinesWithParts.has(b.f.id))continue;
    const mine=parts.filter(p=>partOf.get(p.f.id)===b),covered=pathsArea(intersection(union(mine.flatMap(p=>p.paths)),b.paths))/Math.max(1,b.area);
    if(covered<.6){outlinesWithParts.delete(b.f.id);partial.set(b.f.id,Math.max(...mine.map(p=>metric(p.f.tags?.height)??0)));}}
  const buildingSources=[...buildings.filter(b=>!outlinesWithParts.has(b.f.id)),...parts];

  const model={
    format:'atlas-estudio-lugar',version:1,kind:'real',seed:String(seed),
    label:source.label,bounds:{...source.bounds,country},size:{width:W,depth:D},
    terrain,buildings:[],roads,areas,points,lines,pois,landmarks,warnings,
    sea:{status:sea.status,area:Math.round(sea.area),level:sea.polygons.length?0-terrain.origin:null},
    // Contornos dibujados por sus partes: ocupan suelo aunque las partes no cubran toda la huella.
    outlines:buildings.filter(b=>outlinesWithParts.has(b.f.id)).map(b=>({id:b.f.id,rings:b.rings})),
    attribution:source.attribution,retrievedAt:source.retrievedAt,
  };
  for(const {f,rings}of buildingSources){
    const b=interpretBuilding(f,rings,f.tags||{});
    if(!b)continue;
    if(partial.has(f.id)){b.partialParts=true;if(b.knownHeight&&b.knownHeight>=partial.get(f.id)-1){b.knownHeight=null;b.knownLevels=null;b.heightSource='estimado:contorno-con-partes';}}
    // Una parte hereda la identidad de su contorno (templo, patrimonio, Wikidata) sin perder su id propio.
    const outline=partOf.get(f.id);
    if(outline){const t=outline.f.tags||{},inherited=pickTags(t,['amenity','historic','heritage','wikidata','wikipedia','religion','denomination','building:architecture','architectural_style','start_date']);
      b.parent={id:outline.f.id,name:t.name??null};b.tags={...inherited,...b.tags};
      if(['generic','residential'].includes(b.use)){const u=buildingUse({...t,'building:part':undefined});if(u==='religious'||u==='public')b.use=u==='religious'?'religious-part':u;}
      b.appearance=appearancePolicy(b);}
    model.buildings.push(b);
  }
  // La parte mayor de un templo es la nave (salvo que el contorno se conserve); el resto, torres y capillas en piedra.
  const temples=new Map();for(const b of model.buildings)if(b.use==='religious-part'){const k=b.parent.id;if(!temples.has(k)||temples.get(k).area<b.area)temples.set(k,b);}
  for(const b of model.buildings)if(b.use==='religious-part'){if(temples.get(b.parent.id)===b&&b.minHeight===0&&!partial.has(b.parent.id))b.use='religious';else{b.use='public';b.forceStyle??='publico';}b.appearance=appearancePolicy(b);}
  // Tiendas y servicios dentro de un edificio -> planta baja comercial.
  for(const poi of pois){const b=model.buildings.find(b=>b.bbox[0]<=poi.x&&poi.x<=b.bbox[2]&&b.bbox[1]<=poi.z&&poi.z<=b.bbox[3]&&inPolygon(poi.x,poi.z,b.rings));
    if(b){b.shops.push({...poi});b.groundCommercial=true;}}
  // POI en la acera: enlace conservador a la huella más próxima (máximo 6 m).
  for(const poi of pois.filter(p=>!model.buildings.some(b=>b.shops.some(s=>s.id===p.id)))){let best=null,distance=6;for(const b of model.buildings){if(['religious','school','canopy','small'].includes(b.use))continue;for(const ring of b.rings)for(let i=0;i<ring.length;i++){const a=ring[i],q=ring[(i+1)%ring.length],dx=q[0]-a[0],dz=q[1]-a[1],t=Math.max(0,Math.min(1,((poi.x-a[0])*dx+(poi.z-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(poi.x-a[0]-t*dx,poi.z-a[1]-t*dz);if(d<distance){best=b;distance=d;}}}if(best){best.shops.push({...poi,association:'fachada-cercana'});best.groundCommercial=true;}}
  estimateHeights(model);
  model.stats={buildings:model.buildings.length,roads:roads.length,areas:areas.length,points:points.length,ms:Math.round(performance.now()-started)};
  return model;
}

function pickTags(t,keys){const o={};for(const k of keys)if(t[k]!==undefined)o[k]=t[k];return o;}

function roadFrom(id,t,pts){
  const cls=t.highway,type=VEHICLE[cls]?'vehicle':FLUSH[cls]?'flush':'pedestrian';
  const measured=metric(t.width),lanes=Number(t.lanes);
  let width=measured>0?measured:lanes>0&&type==='vehicle'?Math.min(30,lanes*3.2+(['residential','unclassified','tertiary','secondary'].includes(cls)?1.6:0)):(VEHICLE[cls]??FLUSH[cls]??PEDESTRIAN[cls]);
  if(cls==='service'&&['parking_aisle','driveway','alley'].includes(t.service))width=Math.min(width,3.6);
  return {id,cls,type,width,points:pts,name:t.name||null,lanes:lanes>0?lanes:null,oneway:t.oneway==='yes'||t.junction==='roundabout',
    bridge:Boolean(t.bridge&&t.bridge!=='no'),tunnel:Boolean(t.tunnel&&t.tunnel!=='no'),covered:t.covered==='yes',clearance:metric(t.maxheight??t['tunnel:height'])??4.8,layer:Number(t.layer)||0,surface:t.surface||null,
    sidewalk:t.sidewalk||null,footway:t.footway||null,widthSource:measured>0?'osm':lanes>0?'lanes':'clase'};
}

function pointKind(t){
  if(t.natural==='tree')return 'tree';
  if(t.highway==='street_lamp')return 'lamp';
  if(t.highway==='traffic_signals'||t.crossing==='traffic_signals')return t.highway==='crossing'?'crossing':'signal';
  if(t.highway==='crossing'||t.railway==='crossing')return 'crossing';
  if(t.highway==='stop'||t.highway==='give_way')return 'sign';
  if(t.amenity==='bench'||t.leisure==='picnic_table')return 'bench';
  if(t.amenity==='fountain'||t.amenity==='drinking_water')return t.amenity==='fountain'?'fountain':'drinking';
  if(t.amenity==='waste_basket'||t.amenity==='recycling')return 'bin';
  if(t.barrier==='bollard')return 'bollard';
  if(t.highway==='bus_stop'||t.public_transport==='platform'&&t.bus==='yes')return 'bus_stop';
  if(t.historic==='memorial'||t.tourism==='artwork'||t.historic==='monument'||t.man_made==='obelisk')return 'statue';
  if(t.amenity==='bicycle_parking')return 'bikes';
  if(t.man_made==='flagpole')return 'flag';
  if(t.amenity==='telephone'||t.amenity==='post_box'||t.amenity==='vending_machine')return 'kiosk';
  if(t.railway==='subway_entrance'||t.entrance==='subway')return 'metro';
  return null;
}

export function interpretBuilding(f,rings,t){
  const outer=rings[0],area=polygonAreaNet(rings);
  if(area<4)return null;
  const use=buildingUse(t);
  const height=metric(t.height),levels=metric(t['building:levels']),minHeight=metric(t.min_height)??(metric(t['building:min_level'])!=null?metric(t['building:min_level'])*FLOOR_HEIGHT:0);
  const roofLevels=metric(t['roof:levels'])??0,roofHeight=metric(t['roof:height']);
  let xs=outer.map(p=>p[0]),zs=outer.map(p=>p[1]);
  const b={
    id:f.id,osmId:f.osmId,name:t.name||null,rings,area,use,
    bbox:[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],
    minHeight:minHeight||0,isPart:Boolean(t['building:part']&&t['building:part']!=='no'),
    knownHeight:height>0?height:levels>0?levels*FLOOR_HEIGHT+(roofHeight??roofLevels*2.6):null,
    knownLevels:levels>0?levels:null,
    heightSource:height>0?'osm:height':levels>0?'osm:levels':'estimado',
    roof:{shape:roofShape(t,use),shapeSource:t['roof:shape']?'osm:roof:shape':'estimado:uso',colour:t['roof:colour']||null,material:t['roof:material']||null,height:roofHeight??(roofLevels?roofLevels*2.6:null)},
    colour:t['building:colour']||null,material:t['building:material']||null,
    shops:t.shop||['pharmacy','restaurant','cafe','bar','bank','fast_food'].includes(t.amenity)?[commercialRecord(f.id,...centroid(rings[0]),t,{rings})]:[],groundCommercial:use==='commercial'||Boolean(t.shop),
    tags:pickTags(t,['building','amenity','historic','name','start_date','architect','heritage','heritage:operator','wikidata','wikipedia','building:architecture','architectural_style','religion','denomination']),
  };
  b.appearance=appearancePolicy(b);
  return b;
}

// Alturas desconocidas: uso + tamaño + mediana del vecindario con datos. Rehacer con otra semilla.
export function estimateHeights(model,heightSeed=model.seed,{floorHeight=FLOOR_HEIGHT,defaultFloors=0,only=null}={}){
  // Las iglesias y torres singulares no marcan la altura del caserío vecino.
  const known=model.buildings.filter(b=>b.knownHeight&&b.use!=='religious'&&!b.appearance?.singular);
  model.context=urbanContext(model);
  const cell=120,grid=new Map();
  for(const b of known){const k=Math.floor(b.bbox[0]/cell)+':'+Math.floor(b.bbox[1]/cell);(grid.get(k)??grid.set(k,[]).get(k)).push(b);}
  const nearbyLevels=(b)=>{const cx=Math.floor(b.bbox[0]/cell),cz=Math.floor(b.bbox[1]/cell),list=[];
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const o of grid.get((cx+i)+':'+(cz+j))??[])list.push(o.knownHeight/FLOOR_HEIGHT);
    if(list.length<3)return null;list.sort((a,b)=>a-b);return list[Math.floor(list.length/2)];};
  for(const b of model.buildings){
    if(only&&!only.has(b.id))continue;
    const r=rng(heightSeed+':altura:'+b.id);
    let h;
    if(b.knownHeight){h=b.knownHeight;}
    else{
      const near=nearbyLevels(b);
      let levels;
      if(b.use==='small')levels=1;
      else if(b.use==='canopy')levels=1;
      else if(b.use==='house')levels=1+Math.floor(r()*2.2);
      else if(b.use==='religious')levels=3+Math.floor(r()*3);
      else if(b.use==='industrial')levels=1+Math.floor(r()*2);
      else if(near){levels=Math.max(1,Math.round(near+(r()-.5)*2.4));}
      else levels=defaultFloors||contextLevels(model.context.profile,b,r)||(b.area<60?1+Math.floor(r()*2):b.area<250?2+Math.floor(r()*3):3+Math.floor(r()*4));
      if(b.area<25)levels=Math.min(levels,2);
      h=levels*floorHeight+(b.use==='religious'?2:0);
      if(b.use==='canopy')h=4.2;
    }
    b.height=Math.max(2.6,h-b.minHeight);
    const visibleLevels=b.knownLevels?Math.round(b.knownLevels-(b.minHeight/FLOOR_HEIGHT)):null;
    b.levels=b.knownLevels?Math.max(1,visibleLevels>0?visibleLevels:Math.round(b.knownLevels)):Math.max(1,Math.round(b.height/(b.knownHeight?FLOOR_HEIGHT:floorHeight)));
    b.levelsWarning=b.knownLevels&&visibleLevels<1?'Conteo de plantas y base elevada incompatibles; se conserva el conteo registrado del volumen':null;
    b.estimated=!b.knownHeight;
    b.seedKey=hashString(heightSeed+':'+b.id);
  }
}
