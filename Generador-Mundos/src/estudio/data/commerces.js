import {SHOP_CATEGORIES,SHOP_BY_ID,shopCategory,shopName} from './shop-categories.js';
import {hashString} from './rng.js';

const DAYS=['Mo','Tu','We','Th','Fr','Sa','Su'];
const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
// Subconjunto deliberado: días/rangos, varios intervalos, 24/7, off y paso de medianoche.
// PH, fechas y reglas solares quedan desconocidas: nunca se inventa que están abiertas.
export function openingState(input,{day=2,minute=720}={}){
  if(!input)return {known:false,open:null};
  const text=String(input).trim();if(text==='24/7')return {known:true,open:true};if(/^(off|closed)$/.test(text))return {known:true,open:false};
  let current=false,previous=false,recognized=false;
  for(const part of text.split(';')){
    const match=part.trim().match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su)((?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+)?(off|closed|(?:\d{2}:\d{2}-\d{2}:\d{2})(?:\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*)$/);
    if(!match)return {known:false,open:null};
    let days=[0,1,2,3,4,5,6];if(match[1]){days=[];const ds=(match[1]+match[2]).split(',');for(const d of ds){const [a,b]=d.split('-').map(x=>DAYS.indexOf(x));if(b==null)days.push(a);else for(let n=a;;n=(n+1)%7){days.push(n);if(n===b)break;}}}
    const value=match[3];recognized=true;if(value==='off'||value==='closed'){if(days.includes(day))current=false;continue;}
    for(const range of value.split(',')){const [a,b]=range.trim().split('-').map(minutes);if(a>=1440||b>1440||a%60>59||b%60>59)return {known:false,open:null};if(b>a){if(days.includes(day)&&minute>=a&&minute<b)current=true;}else{if(days.includes(day)&&minute>=a)current=true;if(days.includes((day+6)%7)&&minute<b)previous=true;}}
  }
  return {known:recognized,open:current||previous};
}
export function validateCommerce(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Edición de comercio no válida');
  const out={};for(const key of Object.keys(value))if(!['category','layout','seed','state','name'].includes(key))throw Error('Propiedad de comercio desconocida: '+key);
  if(value.category!=null){if(!SHOP_BY_ID[value.category])throw Error('Categoría de comercio desconocida');out.category=value.category;}
  if(value.layout!=null){if(!Number.isInteger(value.layout)||value.layout<0||value.layout>2)throw Error('Layout de comercio no válido');out.layout=value.layout;}
  if(value.seed!=null){if(typeof value.seed!=='string'||value.seed.length>100)throw Error('Semilla de comercio no válida');out.seed=value.seed;}
  if(value.state!=null){if(!['auto','open','closed','offers'].includes(value.state))throw Error('Estado de comercio no válido');out.state=value.state;}
  if(value.name!=null){if(typeof value.name!=='string'||value.name.length>80||/[\u0000-\u001f]/.test(value.name))throw Error('Rótulo no válido');out.name=value.name;}
  return out;
}
const round=v=>Math.round(v*100)/100;
export function openingId(o){return o.buildingId+':escaparate:'+hashString([round(o.position[0]),round(o.position[2]),round(o.yaw)].join(':')).toString(16);}
function inRing(x,z,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function boundedShopDepth(o,rings,max=1.4){
  const n=[Math.sin(o.yaw),Math.cos(o.yaw)],d=[n[1],-n[0]],inside=(x,z)=>inRing(x,z,rings[0])&&!rings.slice(1).some(r=>inRing(x,z,r));
  let depth=0;for(let z=.03;z<=max+.001;z+=.04){let fits=true;for(const f of [-.5,-.25,0,.25,.5]){const x=o.position[0]+d[0]*o.w*f-n[0]*z,zz=o.position[2]+d[1]*o.w*f-n[1]*z;if(!inside(x,zz)){fits=false;break;}}if(!fits)break;depth=z;}
  return Math.max(0,Math.floor((depth-.025)*100)/100);
}
export function resolveCommerces(openings,model,edits=model.comercios??{}){
  const result=[],byBuilding=new Map();for(const o of openings){if(!byBuilding.has(o.buildingId))byBuilding.set(o.buildingId,[]);byBuilding.get(o.buildingId).push(o);}
  for(const [buildingId,raw]of byBuilding){const b=model.buildings.find(b=>b.id===buildingId);if(!b)continue;
    // Orden espacial reproducible, independiente del orden de edificios o POI de la fuente.
    const slots=raw.slice().sort((a,b)=>a.yaw-b.yaw||a.position[0]-b.position[0]||a.position[2]-b.position[2]);
    const assigned=new Map(),free=new Set(slots),pois=(b.shops??[]).slice().sort((a,b)=>String(a.id??a.name).localeCompare(String(b.id??b.name)));
    for(const poi of pois){let best=null,score=Infinity;for(const o of free){const dist=Math.hypot(o.position[0]-poi.x,o.position[2]-poi.z);if(dist<score){score=dist;best=o;}}if(best){assigned.set(best,poi);free.delete(best);}}
    const history=[];for(const o of slots){const poi=assigned.get(o),origin=b.commerceOrigin??[0,0],slotId=openingId({...o,position:[o.position[0]+origin[0],o.position[1],o.position[2]+origin[1]]}),id=poi?.id?poi.id+':escaparate':slotId,edit=edits[id]??edits[slotId]??{},seed=edit.seed??(poi?.id??(b.sourceRef?b.sourceRef+':':'')+slotId),h=hashString(seed),inferred=!poi;
      const choices=model.context?.profile?.includes('historico')?['panaderia','cafe','libreria','bazar','servicios','fruteria']:model.context?.region==='latam'?['fruteria','panaderia','supermercado','belleza','bazar','restaurante','electronica']:SHOP_CATEGORIES.map(c=>c.id);
      const category=SHOP_BY_ID[edit.category]??(poi?shopCategory(poi):SHOP_BY_ID[choices[h%choices.length]]);
      const rawDepth=boundedShopDepth(o,b.rings,1.08+((h>>>10)%8)*.08),blocked=rawDepth<.08,depth=blocked?.025:rawDepth;
      const defaultSeed=poi?.id??(b.sourceRef?b.sourceRef+':':'')+slotId;let baseLayout=(hashString(defaultSeed)>>>5)%3;if(history.length>1&&history.at(-1)===baseLayout&&history.at(-2)===baseLayout)baseLayout=(baseLayout+1)%3;history.push(baseLayout);
      const layout=edit.layout??(seed===defaultSeed?baseLayout:(h>>>5)%3);
      const horario=poi?.opening_hours??null,status=openingState(horario,{day:2,minute:720}),closed=edit.state==='closed'||edit.state!=='open'&&edit.state!=='offers'&&status.known&&!status.open;
      const region=model.context?.region??'espana',awning=['panaderia','fruteria','cafe','restaurante','floristeria'].includes(category.id)&&(h>>>14)%2===0;
      const extraMirror=['panaderia','ropa','cafe'].includes(category.id),mirror=!!((extraMirror?h:hashString(category.id+':'+layout))&1),variant=category.id+':'+layout+(extraMirror?':m'+Number(mirror):'');
      result.push({...o,id,slotId,sourceId:poi?.id??null,sourceRef:b.sourceRef??buildingId,inferred,category:category.id,label:category.label,name:edit.name??shopName(poi??{},category),horario,seed,layout,depth,blocked,closed:closed||blocked,state:edit.state??'auto',offers:edit.state==='offers'||(h>>>17)%5===0,mirror,palette:(h>>>20)%3,region,awning,blade:['farmacia','optica','cafe'].includes(category.id),variant,frame:category.frame,paper:category.paper,vinyl:region==='latam'?'Promociones':'Ofertas',openingKnown:status.known});
    }
  }
  return result;
}
export function commerceMetadata(c){const n=[Math.sin(c.yaw),0,Math.cos(c.yaw)],x=c.position[0],y=c.position[1],z=c.position[2];return {id:c.id,buildingId:c.buildingId,sourceId:c.sourceId,inferido:c.inferred,categoria:{id:c.category,etiqueta:c.label},nombre:c.name,horario:c.horario,semilla:c.seed,layout:c.layout,estado:c.closed?'cerrado':c.offers?'ofertas':'abierto',bounds:{min:[x-c.w/2-c.depth,y,z-c.w/2-c.depth],max:[x+c.w/2+c.depth,y+c.h+.8,z+c.w/2+c.depth]},ancla:{id:c.id+':puerta',tipo:'puerta-comercio',x:x+n[0]*.16,y,z:z+n[2]*.16,ry:c.yaw,normal:n,ancho:Math.min(1.1,c.w*.35),profundidad:c.depth,embedded:false,resource:null}};}
export function commerceVariety(list){const counts=new Map();for(const c of list)counts.set([c.variant,c.palette,c.mirror,c.closed,c.offers].join(':'),(counts.get([c.variant,c.palette,c.mirror,c.closed,c.offers].join(':'))??0)+1);let triples=0;for(let i=2;i<list.length;i++)if(list[i].buildingId===list[i-2].buildingId&&list[i].layout===list[i-1].layout&&list[i].layout===list[i-2].layout)triples++;return {shops:list.length,prefabVariants:new Set(list.map(c=>c.variant)).size,effectiveCombinations:counts.size,consecutiveLayoutTriples:triples,maxPrefabVariants:60};}
