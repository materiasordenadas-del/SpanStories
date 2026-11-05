// Colocación del mobiliario urbano y de los árboles: primero lo registrado en OSM y, si falta,
// lo que una calle de ese tipo suele tener (farolas cada ~25 m, arbolado en aceras anchas, coches aparcados).
import * as THREE from 'three';
import {rng,pick,range} from '../data/rng.js';
import {pointInPaths,junctions,nearestSegment,pointInRings} from '../geom/ground.js';
import {regionOf} from './styles.js';

const col=hex=>new THREE.Color(hex);
const CAR_COLORS=['#f2f2ef','#d9dadb','#2b2d31','#8a9096','#b33a33','#2f5d8a','#c9b48a','#4d6b4a','#e3c34b','#6f2f3a','#f2f2ef','#9aa3ad'];

class PointGrid{constructor(c=4){this.c=c;this.m=new Map();}
  k(x,z){return Math.floor(x/this.c)+':'+Math.floor(z/this.c);}
  add(x,z,tag){const k=this.k(x,z);(this.m.get(k)??this.m.set(k,[]).get(k)).push({x,z,tag});}
  near(x,z,r,tag){const c=this.c;for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((z-r)/c);j<=Math.floor((z+r)/c);j++)for(const p of this.m.get(i+':'+j)??[])if((!tag||p.tag===tag)&&Math.hypot(p.x-x,p.z-z)<r)return true;return false;}}

export function placeStreet(model,{asphalt,buildingsInfo,inst,seed=model.seed,options={}}){
  const T=model.terrain,r=rng(seed+':calle'),region=regionOf(model.bounds);
  const {width:W,depth:D}=model.size;
  const asphaltEx=asphalt;
  const onAsphalt=(x,z)=>pointInPaths(x,z,asphaltEx);
  const bounds=model.placementBounds??{x0:-W/2,x1:W/2,z0:-D/2,z1:D/2};
  // El margen corresponde al borde real del mundo, no a una costura de streaming.
  const inArea=(x,z,m=1)=>x>=-W/2&&x<W/2&&z>=-D/2&&z<D/2&&x>bounds.x0+m&&x<bounds.x1-m&&z>bounds.z0+m&&z<bounds.z1-m;
  const bgrid=new Map(),bc=30;
  for(const pb of buildingsInfo)for(let i=Math.floor(pb.bbox[0]/bc);i<=Math.floor(pb.bbox[2]/bc);i++)for(let j=Math.floor(pb.bbox[1]/bc);j<=Math.floor(pb.bbox[3]/bc);j++){const k=i+':'+j;(bgrid.get(k)??bgrid.set(k,[]).get(k)).push(pb);}
  const inBuilding=(x,z)=>{for(const pb of bgrid.get(Math.floor(x/bc)+':'+Math.floor(z/bc))??[]){if(x<pb.bbox[0]||x>pb.bbox[2]||z<pb.bbox[1]||z>pb.bbox[3])continue;if(pointInRings(x,z,pb.rings))return true;}return false;};
  const segmentDistance=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);};
  const nearPolygon=(x,z,rings,d)=>pointInRings(x,z,rings)||d>0&&rings.some(ring=>ring.some((a,i)=>segmentDistance(x,z,a,ring[(i+1)%ring.length])<d));
  const clearOf=(x,z,d)=>{
    const nearby=new Set();for(let i=Math.floor((x-d)/bc);i<=Math.floor((x+d)/bc);i++)for(let j=Math.floor((z-d)/bc);j<=Math.floor((z+d)/bc);j++)for(const pb of bgrid.get(i+':'+j)??[])nearby.add(pb);
    return ![...nearby].some(pb=>nearPolygon(x,z,pb.rings,d));
  };
  const parks=model.areas.filter(a=>['park','grass','forest','scrub','village_green'].includes(a.kind));
  const inPark=(x,z)=>parks.some(a=>pointInRings(x,z,a.rings));
  const waterAreas=model.areas.filter(a=>['water','pool'].includes(a.kind));
  const inWater=(x,z)=>waterAreas.some(a=>pointInRings(x,z,a.rings));
  const ped=model.roads.filter(rd=>rd.type==='pedestrian'&&!rd.tunnel&&(rd.layer??0)>=0);
  const onPath=(x,z,extra=.4)=>!!nearestSegment(ped,x,z,0)||ped.some(rd=>{const n=nearestSegment([rd],x,z,rd.width/2+extra);return n;});
  const vehicle=model.roads.filter(rd=>rd.type==='vehicle'&&!rd.bridge&&!rd.tunnel&&(rd.layer??0)>=0);
  const surfaceRoads=model.roads.filter(rd=>!rd.bridge&&!rd.tunnel&&(rd.layer??0)>=0);
  const roadAt=(x,z,margin,observed)=>surfaceRoads.some(rd=>(!observed||rd.type!=='pedestrian')&&nearestSegment([rd],x,z,rd.width/2+margin));
  const treeExcludedAreas=model.areas.filter(a=>['pitch','track','pool','playground','parking','plaza'].includes(a.kind));
  const treeConflict=(x,z,{observed=false}={})=>{
    if(!inArea(x,z,observed?.5:1))return 'límite del área';
    if(!clearOf(x,z,observed?.35:2.6))return 'huella o fachada de edificio';
    if(onAsphalt(x,z)||roadAt(x,z,observed?.35:.8,observed))return 'calzada o paso';
    if(inWater(x,z))return 'agua';
    if(treeExcludedAreas.some(a=>(!observed||['pitch','track','pool'].includes(a.kind))&&nearPolygon(x,z,a.rings,observed?.35:.8)))return 'superficie incompatible';
    return null;
  };
  const J=junctions(vehicle);
  const nearJ=(x,z,m)=>J.some(j=>Math.hypot(j.x-x,j.z-z)<m);
  const y=(x,z)=>T.height(x,z)+.15;
  const used=new PointGrid(4);
  const counts={lamps:0,trees:0,benches:0,signals:0,cars:0,other:0};
  const trees=[],treeConflicts=[];

  // ---- Árboles registrados
  for(const p of model.points.filter(p=>p.kind==='tree')){
    const issue=treeConflict(p.x,p.z,{observed:true});if(issue){treeConflicts.push({id:p.id,x:p.x,z:p.z,reason:issue});continue;}
    const paved=!inPark(p.x,p.z);
    trees.push({x:p.x,y:T.height(p.x,p.z)+.15,z:p.z,k:r(),pit:paved,sourceId:p.id});used.add(p.x,p.z,'tree');
  }
  for(const l of model.lines.filter(l=>l.kind==='tree_row'))walk(l.points,8,(x,z)=>{if(!treeConflict(x,z)&&!used.near(x,z,3,'tree')){trees.push({x,y:y(x,z),z,k:r(),pit:!inPark(x,z)});used.add(x,z,'tree');}});
  // ---- Parques y bosques: dispersión con distancia mínima
  for(const a of model.areas.filter(a=>['park','forest','village_green','grass'].includes(a.kind))){
    if(a.area<120)continue;
    const dens=a.kind==='forest'?1/45:a.kind==='park'?1/150:1/320;
    const n=Math.min(600,Math.round(a.area*dens*(options.treeDensity??1)));
    const xs=a.rings[0].map(p=>p[0]),zs=a.rings[0].map(p=>p[1]);
    const box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
    let placed=0;
    for(let t=0;t<n*6&&placed<n;t++){
      const x=range(r,box[0],box[2]),z=range(r,box[1],box[3]);
      if(!pointInRings(x,z,a.rings)||treeConflict(x,z)||onPath(x,z,1.2)||used.near(x,z,a.kind==='forest'?4:6.5,'tree'))continue;
      trees.push({x,y:T.height(x,z)+.15,z,k:r()});used.add(x,z,'tree');placed++;
    }
  }
  // ---- Arbolado de aceras
  if(options.streetTrees!==false){
    const prob={primary:.75,secondary:.7,tertiary:.6,residential:.35,unclassified:.3,trunk:.6,living_street:.3}[''];
    for(const rd of vehicle){
      const p={primary:.8,secondary:.75,tertiary:.6,residential:.38,unclassified:.3,trunk:.6}[rd.cls]??0;
      const rr=rng(seed+':arbolado:'+rd.id);
      if(rr()>p)continue;
      for(const side of [-1,1]){
        if(rr()<.25)continue;
        walk(rd.points,range(rr,7,9),(x,z,dx,dz)=>{
          const off=rd.width/2+1.7,px=x-dz*off*side,pz=z+dx*off*side;
          if(treeConflict(px,pz)||nearJ(px,pz,rd.width+4)||used.near(px,pz,5,'tree')||inPark(px,pz))return;
          trees.push({x:px,y:y(px,pz),z:pz,k:rr(),pit:true});used.add(px,pz,'tree');
        });
      }
    }
  }
  for(const t of trees)if(t.pit){inst.add('alcorque',{s:1.2},[t.x,t.y-.012,t.z],0,null);}
  counts.trees=trees.length;

  // ---- Farolas
  const lampStyle=(rd)=>region==='espana'||region==='andalucia'?(['primary','secondary','trunk'].includes(rd.cls)&&rd.width>12?'doble':'fernandino'):region==='catalunya'?(rd.width>11?'moderna':'fernandino'):region==='latam'?(r()<.5?'moderna':'doble'):'moderna';
  const osmLamps=model.points.filter(p=>p.kind==='lamp');
  // Solo estructura: lo que el usuario pondrá en GLB queda como ancla con su id de origen, sin geometría.
  const anchors=[],furniture=options.furniture!==false;
  const slot=(id,tipo,x,z,ry)=>anchors.push({id:String(id),tipo,x,y:y(x,z),z,ry,embedded:false,fuente:String(id).startsWith('osm:')?'osm':'generado'});
  if(osmLamps.length){
    for(const p of osmLamps){if(!inArea(p.x,p.z)||inBuilding(p.x,p.z))continue;
      const n=nearestSegment(vehicle,p.x,p.z,25);const yaw=n?Math.atan2(n.px-p.x,n.pz-p.z):0;
      if(options.lamps===false){slot(p.id,'lamp',p.x,p.z,yaw);continue;}
      inst.add('lamp',{style:n?lampStyle(n.road):'fernandino'},[p.x,y(p.x,p.z),p.z],yaw,null);used.add(p.x,p.z,'lamp');counts.lamps++;}
  }
  if(osmLamps.length<vehicle.length*.6&&options.lamps!==false){
    for(const rd of vehicle){
      if(rd.cls==='service')continue;
      const spacing=rd.width>11?28:24,style=lampStyle(rd);
      let side=1;
      walk(rd.points,spacing,(x,z,dx,dz)=>{
        side=-side;
        for(const s of style==='doble'||rd.width>14?[side,-side]:[side]){
          const off=rd.width/2+.55,px=x-dz*off*s,pz=z+dx*off*s;
          if(!inArea(px,pz)||onAsphalt(px,pz)||inBuilding(px,pz)||!clearOf(px,pz,.6)||used.near(px,pz,10,'lamp')||used.near(px,pz,1.5,'tree')||nearJ(px,pz,rd.width/2+2))continue;
          inst.add('lamp',{style},[px,y(px,pz),pz],Math.atan2(dz*s,-dx*s),null);
          used.add(px,pz,'lamp');counts.lamps++;
          if(furniture&&r()<.18&&!used.near(px+dx*1.2,pz+dz*1.2,2)){inst.add('bin',{},[px+dx*1.2,y(px,pz),pz+dz*1.2],Math.atan2(dz*s,-dx*s),null);counts.other++;}
        }
      });
    }
  }
  // ---- Semáforos en nodos OSM
  for(const p of model.points.filter(p=>p.kind==='signal')){
    const n=nearestSegment(vehicle,p.x,p.z,3);if(!n)continue;
    for(const [s,f]of [[1,1],[-1,-1]]){
      const off=n.road.width/2+.45,px=p.x-n.dz*off*s+n.dx*3*f,pz=p.z+n.dx*off*s+n.dz*3*f;
      if(!inArea(px,pz)||onAsphalt(px,pz)||inBuilding(px,pz))continue;
      if(!furniture){slot(p.id+(f>0?':a':':b'),'trafficLight',px,pz,Math.atan2(-n.dx*f,-n.dz*f));continue;}
      inst.add('trafficLight',{},[px,y(px,pz),pz],Math.atan2(-n.dx*f,-n.dz*f),null);counts.signals++;
    }
  }
  // ---- Bancos, fuentes, estatuas, paradas, metro, bolardos, papeleras, aparcabicis
  for(const p of model.points){
    if(!inArea(p.x,p.z)||inBuilding(p.x,p.z))continue;
    const n=nearestSegment(model.roads,p.x,p.z,15),yaw=n?Math.atan2(n.px-p.x,n.pz-p.z):r()*6.28;
    const at=[p.x,y(p.x,p.z),p.z];
    if(!furniture&&['bench','bus_stop','bollard','bin','bikes','kiosk'].includes(p.kind)){slot(p.id,p.kind,p.x,p.z,yaw);continue;}
    switch(p.kind){
      case 'bench':inst.add('bench',{w:1.8},at,yaw,col(pick(r,['#8b5a36','#7a4e2f','#3e6a52'])));counts.benches++;break;
      case 'fountain':inst.add('fountain',{r:inPark(p.x,p.z)||!n||n.d>8?2.6:1.2},at,0,null);counts.other++;break;
      case 'statue':inst.add('statue',{},at,yaw,null);counts.other++;break;
      case 'bus_stop':if(n&&!onAsphalt(p.x,p.z)){inst.add('busStop',{},at,yaw+Math.PI,null);counts.other++;}break;
      case 'metro':inst.add('metro',{},at,yaw,col('#d6342c'));counts.other++;break;
      case 'bollard':inst.add('bollard',{},at,0,null);break;
      case 'bin':inst.add('bin',{},at,yaw,null);break;
      case 'bikes':inst.add('bikes',{},at,yaw,null);break;
      case 'flag':inst.add('flagpole',{h:9},at,0,col(pick(r,['#c8102e','#f1bf00','#006847'])));break;
      case 'kiosk':inst.add('kiosk',{},at,yaw,col('#d9a52b'));break;
      case 'bleachers':inst.add('bleachers',{w:Math.round(p.tags?.w??12),rows:4},at,p.tags?.yaw??0,col('#2f6e8f'));break;
    }
  }
  // Bancos en plazas y parques junto a los caminos (si OSM no los trae)
  if(furniture&&model.points.filter(p=>p.kind==='bench').length<5){
    for(const rd of ped){
      const rr=rng(seed+':bancos:'+rd.id);if(rr()>.5)continue;
      walk(rd.points,range(rr,14,22),(x,z,dx,dz)=>{
        const s=rr()<.5?1:-1,off=rd.width/2+.55,px=x-dz*off*s,pz=z+dx*off*s;
        if(!inArea(px,pz)||onAsphalt(px,pz)||inBuilding(px,pz)||used.near(px,pz,3))return;
        inst.add('bench',{w:1.8},[px,y(px,pz),pz],Math.atan2(dz*s,-dx*s),col(pick(rr,['#8b5a36','#7a4e2f','#3e6a52'])));used.add(px,pz,'bench');counts.benches++;
      });
    }
  }
  // ---- Coches aparcados en línea junto al bordillo
  if(options.cars!==false){
    for(const rd of vehicle){
      if(!['residential','tertiary','secondary','unclassified','living_street'].includes(rd.cls)||rd.width<6.4)continue;
      const rr=rng(seed+':coches:'+rd.id);
      for(const s of rd.oneway?[1]:[1,-1]){
        if(rr()<.35)continue;
        walk(rd.points,5.4,(x,z,dx,dz)=>{
          if(rr()<.45)return;
          const off=rd.width/2-1.05,px=x-dz*off*s,pz=z+dx*off*s;
          if(!onAsphalt(px,pz)||nearJ(px,pz,rd.width/2+7)||used.near(px,pz,4.2,'car'))return;
          inst.add('parkedCar',(()=>{const k=rr();return k<.55?{kind:'sedan',l:4.4}:k<.88?{kind:'hatch',l:3.9}:{kind:'van',l:4.8};})(),[px,T.height(px,pz),pz],Math.atan2(dx,dz)+(rr()<.5?0:Math.PI),col(pick(rr,CAR_COLORS)));
          used.add(px,pz,'car');counts.cars++;
        });
      }
    }
  }
  return {trees,counts,anchors,treeConflicts};
}

export function walk(points,step,fn){
  let carry=step/2;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-3)continue;
    const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
    let s=carry;
    for(;s<len;s+=step)fn(a[0]+dx*s,a[1]+dz*s,dx,dz);
    carry=s-len;
  }
}
