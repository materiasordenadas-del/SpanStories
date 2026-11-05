// Catálogo de árboles del Atlas: los 4 GLB originales de SpanStories y las especies horneadas con ez-tree
// (MIT, Daniel Greenheck) en el estilo del creador de mundos. Cada lugar usa como máximo 4 tipos (un
// InstancedMesh por parte y tipo): por defecto el conjunto de su zona climática; el conjunto puede elegirse
// a mano (proyecto) y viaja con el lugar exportado para poder cambiarlo en el visor.
import {climateOf} from './climate.js';

export const TREE_CATALOG_VERSION=1;
export const MAX_TREE_TYPES=4;
// Nivel de detalle de los árboles del lugar (uno fijo para todos; medio por defecto). Las especies ez-tree tienen
// los cuatro horneados sobre el mismo esqueleto; los GLB originales tienen un único modelo para todos los niveles.
export const TREE_DETAILS={alto:'Alto',medio:'Medio',bajo:'Bajo',muyBajo:'Muy bajo'};
export const DEFAULT_TREE_DETAIL='medio';
const lodFile=(id,level)=>id+(level==='medio'?'':'-'+level.toLowerCase())+'.glb';
const ORIGINAL='/assets/barcelona-trees/',EZTREE='/assets/arboles/eztree/';

// height: [mín, máx] en metros. weight: frecuencia relativa dentro del conjunto. street: apto para alcorque.
export const TREE_CATALOG=[
  {id:'anime',name:'Árbol anime',origin:'original',url:ORIGINAL+'anime_nature_tree_01.glb',height:[7,10],weight:.35,street:true},
  {id:'anime2',name:'Árbol anime 2',origin:'original',url:ORIGINAL+'anime_tree_2.glb',height:[6,9],weight:.3,street:true},
  {id:'jabami',name:'Árbol jabami',origin:'original',url:ORIGINAL+'jabami_anime_tree_v1.glb',height:[8,12],weight:.25,street:true},
  {id:'sakura',name:'Cerezo',origin:'original',url:ORIGINAL+'sakura_tree_01.glb',height:[5,7.5],weight:.1,street:true},
  {id:'platano',name:'Plátano de sombra',sci:'Platanus × hispanica',origin:'ez-tree',height:[11,15],weight:.35,street:true},
  {id:'encina',name:'Encina',sci:'Quercus ilex',origin:'ez-tree',height:[6,9],weight:.25,street:true},
  {id:'pinonero',name:'Pino piñonero',sci:'Pinus pinea',origin:'ez-tree',height:[11,16],weight:.2,street:false},
  {id:'olivo',name:'Olivo',sci:'Olea europaea',origin:'ez-tree',height:[4.5,7],weight:.2,street:true},
  {id:'roble',name:'Roble',sci:'Quercus robur',origin:'ez-tree',height:[12,17],weight:.3,street:false},
  {id:'abedul',name:'Abedul',sci:'Betula pendula',origin:'ez-tree',height:[11,16],weight:.25,street:true},
  {id:'pino',name:'Pino',sci:'Pinus sylvestris / P. radiata',origin:'ez-tree',height:[13,19],weight:.25,street:false},
  {id:'eucalipto',name:'Eucalipto',sci:'Eucalyptus globulus',origin:'ez-tree',height:[16,23],weight:.25,street:false},
  {id:'saman',name:'Samán / ceiba',sci:'Samanea saman',origin:'ez-tree',height:[12,17],weight:.25,street:false},
  {id:'jacaranda',name:'Jacaranda',sci:'Jacaranda mimosifolia',origin:'ez-tree',height:[9,13],weight:.3,street:true},
  {id:'flamboyan',name:'Flamboyán',sci:'Delonix regia',origin:'ez-tree',height:[8,12],weight:.2,street:true},
  {id:'laurel',name:'Laurel de Indias',sci:'Ficus microcarpa',origin:'ez-tree',height:[10,14],weight:.25,street:true},
  {id:'mezquite',name:'Mezquite / algarrobo',sci:'Prosopis spp.',origin:'ez-tree',height:[5,7.5],weight:.35,street:true},
  {id:'matorral',name:'Matorral (retama, lentisco)',sci:'arbustos de clima seco',origin:'ez-tree',kind:'arbusto',height:[1.8,3],weight:.2,street:false},
].map(t=>{const url=t.url??EZTREE+t.id+'.glb';
  const lods=Object.fromEntries(Object.keys(TREE_DETAILS).map(level=>[level,t.origin==='ez-tree'?EZTREE+lodFile(t.id,level):url]));
  return {kind:'arbol',...t,url,lods};});

export const TREE_SETS={
  mediterraneo:['platano','encina','pinonero','olivo'],
  atlantico:['roble','platano','abedul','pino'],
  montana:['pino','eucalipto','abedul','roble'],
  tropical:['saman','jacaranda','flamboyan','laurel'],
  arido:['mezquite','olivo','pino','matorral'],
  clasico:['anime','anime2','jabami','sakura'],
};
export const TREE_SET_NAMES={mediterraneo:'Mediterráneo',atlantico:'Atlántico',montana:'Montaña',tropical:'Tropical',arido:'Árido',clasico:'Clásico (GLB originales)'};

const byId=new Map(TREE_CATALOG.map(t=>[t.id,t]));
export const treeEntry=id=>byId.get(id)??null;
export const treeDetailOf=model=>Object.hasOwn(TREE_DETAILS,model?.treeDetail)?model.treeDetail:DEFAULT_TREE_DETAIL;
export const treeUrl=(entry,detail=DEFAULT_TREE_DETAIL)=>entry.lods?.[detail]??entry.url;

// Conjunto vigente del lugar: elección manual válida (1 a 4 ids del catálogo, sin repetir) o el del clima.
export function treeSetOf(model){
  const manual=validTreeSet(model?.treeSetOverride);
  if(manual)return {ids:manual,source:'manual'};
  const climate=climateOf(model)?.id??'mediterraneo';
  return {ids:TREE_SETS[climate]??TREE_SETS.mediterraneo,source:'clima:'+climate};
}
export function validTreeSet(value){
  if(typeof value==='string')value=TREE_SETS[value]??null;
  if(!Array.isArray(value))return null;
  const ids=[...new Set(value)].filter(id=>byId.has(id)).slice(0,MAX_TREE_TYPES);
  return ids.length?ids:null;
}
// Descripción exportable (visor): catálogo completo y conjunto elegido.
export function treeCatalogExport(model){
  const set=treeSetOf(model);
  return {formato:'spanstories-arboles',version:TREE_CATALOG_VERSION,maxTipos:MAX_TREE_TYPES,conjunto:set.ids,origen:set.source,detalle:treeDetailOf(model),niveles:TREE_DETAILS,
    conjuntos:TREE_SETS,especies:TREE_CATALOG.map(({id,name,sci,origin,kind,url,lods,height,street})=>({id,nombre:name,cientifico:sci??null,origen:origin,tipo:kind,url,lods,altura:height,calle:street}))};
}
