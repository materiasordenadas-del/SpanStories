import * as T from './three.js';
import { DIMENSIONS as D,TRANSITIONS as S,FRONT_OPENINGS as FRONT,LOBBY_CORE as L,CORRIDOR as K,HOTEL_LAYOUT as H,BUFFET as B,FACADE as F,puertasPasillo } from './dimensions.js';
import { escalera,galeria,PELDAÑOS,huecosMuroPosterior } from './PlantaLobby.js';

// n apunta hacia fuera de la sala; las coordenadas son locales a cada área.
const endpoint=(zone,x,z,n,width,{floor=0,door=null,...extra}={})=>({zone,center:new T.Vector3(x,floor,z),n:new T.Vector3(n[0],0,n[1]),width,floor,door,...extra});
export function conexiones(zones,objects,restaurant='restaurante'){
  const front=(id,index=0,extra={})=>{const h=FRONT[id][index];return endpoint(id,h.x,zones[id].tam[1]/2,[0,1],h.ancho,extra);};
  const facade=(door,width)=>{const r=objects.obtener(door);
    // Se cruza el borde exterior del tambor, antes de sus hojas giratorias.
    const rotating=door==='fachada-puerta-entrada';return endpoint('fachada',(r?.position.x||0)-(rotating?0:F.exit.width/4),(r?.position.z||0)+(rotating?F.revolving.radius:0),[0,-1],rotating?width:width/2,{door,unresolved:!r});};
  const rear=huecosMuroPosterior(),room=puertasPasillo().find(d=>d.num===201),pairs=[];
  const pair=(id,a,b,kind='door')=>{if(a&&b)pairs.push({id,a,b,kind});};
  pair('entrada',facade('fachada-puerta-entrada',F.revolving.radius*2),front('lobby'));
  pair('salida',front('lobby',1),facade('fachada-puerta-salida',F.exit.width));
  pair('conserjeria',endpoint('lobby',L.wallX,L.conciergeZ,[1,0],L.conciergeWidth),front('conserjeria'));
  for(const id of ['restaurante','buffet'])pair('lobby-'+id,endpoint('lobby',rear[0].x,-zones.lobby.tam[1]/2,[0,-1],rear[0].ancho,{enabled:id===restaurant}),front(id));
  pair('bar',endpoint('lobby',rear[1].x,-zones.lobby.tam[1]/2,[0,-1],rear[1].ancho),front('bar'));
  pair('terraza-restaurante',front('restaurante',1),endpoint('terraza',-11,zones.terraza.tam[1]/2,[0,1],3,{enabled:restaurant==='restaurante'}));
  pair('terraza-buffet',endpoint('buffet',zones.buffet.tam[0]/2,B.door.z,[1,0],B.door.width),endpoint('terraza',-11,zones.terraza.tam[1]/2,[0,1],3,{enabled:restaurant==='buffet'}));
  pair('terraza-bar',front('bar',1),endpoint('terraza',11,zones.terraza.tam[1]/2,[0,1],3));
  const passage=(id,fallback)=>objects.obtener(id)?.userData.anchoPaso??fallback;
  pair('pasillo',endpoint('galeria',L.door203X,-zones.lobby.tam[1]/2,[0,-1],passage('puerta-pasillo-p1',K.entryWidth-.2),{floor:D.floorHeight,door:'puerta-pasillo-p1'}),endpoint('pasillo',0,K.length/2+.1,[0,1],passage('puerta-pasillo-galeria',K.entryWidth-.2),{door:'puerta-pasillo-galeria'}));
  pair('suite',endpoint('pasillo',-(K.width/2+K.door.niche+.1),room.z,[-1,0],passage('puerta-201',K.door.width),{door:'puerta-201'}),endpoint('habitacion',H.suiteEntryX,H.suiteFrontZ,[0,1],passage('salida-suite-201',H.roomDoorWidth),{door:'salida-suite-201'}));
  const stairX=objects.obtener('escalera-001')?.position.x??L.wallX-D.stairWidth/2;
  pair('escalera',endpoint('circulacion',stairX,escalera.bottomZ,[0,-1],D.stairWidth),endpoint('galeria',stairX,escalera.topZ,[0,1],D.stairWidth,{floor:D.floorHeight}),'stairs');
  return pairs;
}
export function salidas(zone,pairs){return pairs.flatMap(p=>{const result=[];for(const [from,to] of [[p.a,p.b],[p.b,p.a]])if((from.zone===zone||(zone==='lobby'&&from.zone==='circulacion')||(zone==='circulacion'&&from.zone==='lobby'))&&from.enabled!==false&&!from.unresolved)result.push({...p,from,to});return result;});}
export function rutaEntre(from,to,pairs){return salidas(from,pairs).find(r=>r.to.zone===to)||null;}
const tangent=e=>new T.Vector3(-e.n.z,0,e.n.x);
export function datosAcceso(e,pos){const delta=pos.clone().sub(e.center);return {distance:delta.dot(e.n),lateral:delta.dot(tangent(e)),height:pos.y-e.floor};}
export function cercaAcceso(e,pos){const a=datosAcceso(e,pos);return Math.abs(a.height-D.playerHeight)<=S.floorTolerance&&a.distance<=0&&a.distance>=-S.approach&&Math.abs(a.lateral)<=e.width/2-D.playerRadius;}
export function cruzarAcceso(e,before,after){
  const a=datosAcceso(e,before),b=datosAcceso(e,after),plane=-(D.playerRadius+S.triggerInset);
  if(Math.abs(a.height-D.playerHeight)>S.floorTolerance||a.distance>=plane||b.distance<plane)return null;
  const t=(plane-a.distance)/(b.distance-a.distance),lateral=T.MathUtils.lerp(a.lateral,b.lateral,t);
  return Math.abs(lateral)<=e.width/2-D.playerRadius?{lateral}:null;
}
export function llegada(route,{lateral=0,direction=null}={}){
  const {from,to}=route,limit=Math.min(from.width,to.width)/2-D.playerRadius;
  if(to.unresolved)throw new Error('El acceso de llegada todavía no está cargado');
  const position=to.center.clone().addScaledVector(to.n,-S.arrivalOffset).addScaledVector(tangent(to),-T.MathUtils.clamp(lateral,-limit,limit));position.y=to.floor+D.playerHeight;
  const inward=to.n.clone().negate(),dir=direction?.clone()||from.n.clone();
  const sourceYaw=Math.atan2(from.n.x,from.n.z),relative=T.MathUtils.clamp(T.MathUtils.euclideanModulo(Math.atan2(dir.x,dir.z)-sourceYaw+Math.PI,Math.PI*2)-Math.PI,-S.angleLimit,S.angleLimit);
  const theta=Math.atan2(inward.x,inward.z)+relative,pitch=T.MathUtils.clamp(Math.asin(T.MathUtils.clamp(dir.y,-1,1)),-S.pitchLimit,S.pitchLimit);
  const look=new T.Vector3(Math.sin(theta)*Math.cos(pitch),Math.sin(pitch),Math.cos(theta)*Math.cos(pitch));
  return {position,target:position.clone().add(look)};
}
export function limitesZona(zone,zones,pos){
  if(zone==='galeria')return {x:[galeria.minX,galeria.maxX],z:[galeria.minZ,galeria.maxZ]};
  const [w,d]=zones[zone==='circulacion'?'lobby':zone].tam;
  const base={x:[-w/2,w/2],z:[-d/2,d/2]};
  if(zone==='habitacion'){
    const b=H.balcony,r=D.playerRadius;
    base.contains=p=>{const inside=p.x>=-w/2+r&&p.x<=w/2-r&&p.z>=-d/2+r&&p.z<=d/2-r;
      const balcony=p.x>=b.doorX-b.width/2+r&&p.x<=b.doorX+b.width/2-r&&p.z>=b.backZ-b.depth+r&&p.z<=b.backZ-r;
      const bridge=p.x>=b.doorX-b.doorWidth/2+r&&p.x<=b.doorX+b.doorWidth/2-r&&p.z>=b.backZ-r&&p.z<=b.backZ+r;
      return inside||balcony||bridge;};
  }
  return base;
}
export function puntosEscalera(up=true,stairs=null){
  const x=stairs?.position.x??L.wallX-D.stairWidth/2,points=[new T.Vector3(x,D.playerHeight,escalera.bottomZ+S.arrivalOffset)];
  for(let i=0;i<PELDAÑOS;i++)points.push(new T.Vector3(x,D.playerHeight+(i+1)*D.stairRise,escalera.bottomZ-D.stairRun*(i+.5)));
  points.push(new T.Vector3(x,D.floorHeight+D.playerHeight,escalera.topZ-S.arrivalOffset));
  return up?points:points.reverse();
}
export function interpolarCamino(points,progress){
  if(points.length<2)throw new Error('Un recorrido necesita al menos dos puntos');
  const k=T.MathUtils.clamp(progress,0,1)*(points.length-1),i=Math.min(points.length-2,Math.floor(k));
  return new T.Vector3().lerpVectors(points[i],points[i+1],k-i);
}
