// Clima del lugar: decide especies de árbol, color del césped y del suelo natural, y matiza materiales y
// colores de los edificios sin datos registrados. Cinco climas (tropical, árido, montaña, mediterráneo,
// atlántico) con variantes regionales para el mundo hispanohablante.
// Se deduce sin consultar proveedores: país, latitud, longitud y altitud media del relieve guardado.
// Es una aproximación climática (no una estación meteorológica): el usuario puede corregirla en «Datos».

export const CLIMATES={
  tropical:'Tropical',arido:'Árido',montana:'Montaña',mediterraneo:'Mediterráneo',atlantico:'Atlántico (húmedo)',
};
export const CLIMATE_VARIANTS={
  'tropical:humedo':'tropical húmedo','tropical:subtropical':'subtropical húmedo','tropical:guineano':'ecuatorial africano',
  'arido:sureste':'sureste ibérico','arido:canario':'subtropical canario','arido:costero':'desierto costero del Pacífico','arido:caribe':'costa seca del Caribe',
  'arido:norte':'norte de México','arido:cuyo':'Cuyo y monte argentino','arido:patagonia':'estepa patagónica','arido:atacama':'Atacama y norte chico',
  'montana:andina':'andina','montana:iberica':'ibérica','montana:patagonica':'bosque andino patagónico',
  'mediterraneo:iberico':'ibérico','mediterraneo:altura':'templado de altura (altiplano mexicano, valles)','mediterraneo:chileno':'Chile central','mediterraneo:californiano':'Baja California',
  'atlantico:cantabrico':'cantábrico y gallego','atlantico:pampeano':'pampeano y rioplatense','atlantico:valdiviano':'templado lluvioso del sur de Chile',
};

const box=(lon,lat,[w,s,e,n])=>lon>=w&&lon<=e&&lat>=s&&lat<=n;
function inPolygon(lon,lat,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
// [lon,lat]. Polígonos gruesos de zonas climáticas reconocidas (error de decenas de km en sus bordes).
const CANTABRIAN=[[-9.4,43.9],[-1.6,43.6],[-1.6,43],[-3,42.95],[-4.7,43],[-6.6,42.85],[-7,42],[-8.2,41.8],[-8.95,41.85],[-9.4,42.5]];
const SOUTHEAST_SPAIN=[[-3.2,36.65],[-2,36.7],[-1.6,37],[-.7,37.6],[-.4,38.2],[-.6,38.5],[-1.2,38.4],[-1.9,38],[-2.6,37.6],[-3.3,37]];
const PACIFIC_DESERT=[[-81.4,-3.4],[-80.2,-3.6],[-79.4,-5.5],[-78.6,-7.8],[-77.6,-9.6],[-76.6,-11.6],[-75.6,-13.6],[-73.6,-15.4],[-71.2,-16],[-69.9,-17.3],[-69.3,-19],[-68.9,-21.5],[-69,-24.5],[-69.8,-27.5],[-70.6,-30.5],[-71.8,-30.5],[-71.2,-27],[-70.6,-23],[-70.4,-18.5],[-72,-17.2],[-76.4,-14],[-77.6,-12],[-79.8,-7.5],[-81.6,-5.6]];
const DRY_CARIBBEAN=[[-73.3,11,-71,12.6],[-70.8,10.9,-68.2,12.3],[-81.1,-2.6,-80.3,-1.6]]; // Guajira, Falcón/Paraguaná, Santa Elena

export function deduceClimate({lat,lon,altitude=null,country=null}={}){
  const h=Number.isFinite(altitude)?altitude:0,a=Math.abs(lat??40),code=country?.code??null;
  const out=(id,variant,reason)=>({id,variant:id+':'+variant,source:'deducido',reason,altitude:Number.isFinite(altitude)?Math.round(altitude):null});
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return out('mediterraneo','iberico','sin coordenadas');
  const spain=code==='ES'||(!code&&lat>27&&lat<44.5&&lon>-18.5&&lon<4.5);
  if(spain){
    if(lat<29.6&&lon<-13)return out('arido','canario','Canarias');
    if(h>=1050)return out('montana','iberica',`altitud ${Math.round(h)} m`);
    if(inPolygon(lon,lat,CANTABRIAN))return out('atlantico','cantabrico','cornisa cantábrica y Galicia');
    if(inPolygon(lon,lat,SOUTHEAST_SPAIN))return out('arido','sureste','sureste semiárido');
    return out('mediterraneo','iberico','península y Baleares');
  }
  if(code==='GQ'||(!code&&lon>5&&lon<12&&lat>-2&&lat<4))return out('tropical','guineano','Golfo de Guinea');
  const americas=lon<-30&&lon>-120;
  if(americas){
    // Trópicos: la altitud manda (pisos térmicos); después las franjas secas conocidas.
    if(a<=23.5){
      if(h>=2500)return out('montana','andina',`piso frío, ${Math.round(h)} m`);
      if(inPolygon(lon,lat,PACIFIC_DESERT))return out('arido','costero','desierto costero del Pacífico');
      if(DRY_CARIBBEAN.some(b=>box(lon,lat,b)))return out('arido','caribe','costa seca');
      if(lon<-109.3&&lat>22.8)return out('arido','norte','Baja California Sur');
      if(h>=1800)return out('mediterraneo','altura',`piso templado, ${Math.round(h)} m`);
      return out('tropical','humedo','trópico bajo');
    }
    if(lat>0){
      if(h>=2500)return out('montana','iberica',`altitud ${Math.round(h)} m`);
      if(lat>30.6&&lon<-115.3)return out('mediterraneo','californiano','costa de Baja California');
      return out('arido','norte','norte de México');
    }
    // Cono Sur.
    if(h>=2200)return out('montana','andina',`altitud ${Math.round(h)} m`);
    const chile=code==='CL'||(!code&&lon<-70.2);
    if(chile){
      if(lat>-30.6)return out('arido','atacama','norte de Chile');
      if(lat>-37.6)return out('mediterraneo','chileno','Chile central');
      return out('atlantico','valdiviano','sur de Chile');
    }
    if(lat<-38.5&&lon<-70.8)return out('montana','patagonica','lagos andinos');
    if(lat<-39)return out('arido','patagonia','Patagonia');
    if(lat>-27&&lon>-62)return out('tropical','subtropical','litoral y Paraguay');
    if(lon<-66)return out('arido','cuyo','Cuyo y noroeste seco');
    return out('atlantico','pampeano','Pampa y Río de la Plata');
  }
  // Fuera del ámbito hispanohablante: regla general por latitud.
  if(h>=2200)return out('montana','iberica',`altitud ${Math.round(h)} m`);
  if(a<23.5)return out('tropical','humedo','latitud tropical');
  if(a<34)return out('arido','norte','subtrópico seco');
  if(a<45)return out('mediterraneo','iberico','latitud templada');
  return out('atlantico','cantabrico','latitud templada húmeda');
}

// Clima vigente del modelo: corrección manual > deducido al importar > deducción a partir de lo guardado.
export function climateOf(model){
  const override=model?.climateOverride;
  if(override&&CLIMATES[override.split(':')[0]]){const [id,variant]=override.split(':');const base=model.climate??deduceClimate(climateInput(model));
    return {...base,id,variant:id+':'+(variant??(base.id===id?base.variant.split(':')[1]:DEFAULT_VARIANT[id])),source:'manual'};}
  return model?.climate??deduceClimate(climateInput(model));
}
const DEFAULT_VARIANT={tropical:'humedo',arido:'costero',montana:'andina',mediterraneo:'iberico',atlantico:'cantabrico'};
function climateInput(model){
  const b=model?.bounds??{},T=model?.terrain;
  let altitude=null;if(T&&Number.isFinite(T.origin)&&T.h?.length){let s=0;for(const v of T.h)s+=v;altitude=T.origin+s/T.h.length;}
  return {lat:b.centerLat??40,lon:b.centerLon??-3.7,altitude:model?.kind==='school'?null:altitude,country:b.country??null};
}

// ---------------------------------------------------------------- perfiles visuales
// Mediterráneo ibérico es la referencia del Estudio (los colores aprobados): sin cambios.
const GROUND_PALETTES={
  tropical:{grass:'#7fbf4f',grassDark:'#68ad42',park:'#86c454',forest:'#4f9a43',scrub:'#8db25a',albero:'#d9b77a',farmland:'#a9c463',pitch:'#62ad4c',sand:'#f0dcaa'},
  arido:{grass:'#b9b06a',grassDark:'#a59c58',park:'#a7ae5e',forest:'#8f9a55',scrub:'#c8ae7c',albero:'#dcc08c',farmland:'#c9b27a',pitch:'#9fae58',sand:'#e6cf9c',gravel:'#cdbb9c'},
  montana:{grass:'#8fb565',grassDark:'#7aa356',park:'#8ab461',forest:'#5f8a4a',scrub:'#a3a970',farmland:'#b4bb78',pitch:'#6fa85a',albero:'#c8b28d'},
  atlantico:{grass:'#86c25c',grassDark:'#73b14e',park:'#8cc65e',forest:'#5b9846',scrub:'#8fb55d',farmland:'#a8c66a',pitch:'#66b452',albero:'#d2bd8c'},
};
const GROUND_VARIANTS={'mediterraneo:altura':{grass:'#9cc067',park:'#98c064'},'mediterraneo:chileno':{grass:'#a3c26a',scrub:'#b3b27a'},'arido:canario':{park:'#97b05a',scrub:'#c2a274'}};
export function climateGround(climate){return {...(GROUND_PALETTES[climate.id]??{}),...(GROUND_VARIANTS[climate.variant]??{})};}

// Césped 3D (hojas): solo colores y altura; el resto de la configuración es del usuario.
export const CLIMATE_GRASS={
  mediterraneo:{root:'#315626',main:'#72a53b',tip:'#c2d66b',height:1.1},
  tropical:{root:'#1f4a1c',main:'#4f9a2c',tip:'#a6d35a',height:1.25},
  arido:{root:'#5a4a22',main:'#a39444',tip:'#e0cf86',height:.65},
  montana:{root:'#2f4d2a',main:'#6a9a45',tip:'#b7cf7a',height:.75},
  atlantico:{root:'#24521f',main:'#5fa236',tip:'#b5dd68',height:1.2},
};
export const climateGrass=climate=>CLIMATE_GRASS[climate.id]??CLIMATE_GRASS.mediterraneo;

// Tono de las copas de los árboles GLB existentes (multiplica la textura de hoja).
export const FOLIAGE_TINT={mediterraneo:[1,1,1],tropical:[.86,1.02,.8],arido:[1.04,.98,.78],montana:[.9,.97,.92],atlantico:[.9,1.03,.86]};

// Especies por contexto. «frondoso» = árboles GLB del visor (copas anime); el resto son procedurales.
// calle: alcorque en acera · parque · bosque · matorral · cementerio · humedal · paseo: a menos de 60 m del mar.
const W=(o)=>o;
const SPECIES={
  'mediterraneo:iberico':{calle:W({frondoso:.82,naranjo:.08,palmera:.04,sakura:.06}),parque:W({frondoso:.46,pino:.16,cipres:.1,olivo:.08,palmera:.06,sakura:.06,naranjo:.08}),bosque:W({pino:.45,frondoso:.35,olivo:.2}),matorral:W({olivo:.4,pino:.3,frondoso:.3}),cementerio:W({cipres:.85,pino:.15}),humedal:W({frondoso:1}),paseo:W({palmera:.55,frondoso:.25,pino:.2})},
  'mediterraneo:altura':{calle:W({frondoso:.5,jacaranda:.28,palmera:.1,eucalipto:.12}),parque:W({frondoso:.35,jacaranda:.2,eucalipto:.2,cipres:.1,palmera:.15}),bosque:W({conifera:.45,eucalipto:.35,frondoso:.2}),matorral:W({agave:.4,acacia:.35,frondoso:.25}),cementerio:W({cipres:.7,jacaranda:.3}),humedal:W({frondoso:1}),paseo:W({palmera:.6,frondoso:.4})},
  'mediterraneo:chileno':{calle:W({frondoso:.6,jacaranda:.15,palmera:.1,naranjo:.05,eucalipto:.1}),parque:W({frondoso:.35,palmera:.2,jacaranda:.12,eucalipto:.13,pino:.1,cipres:.1}),bosque:W({eucalipto:.4,pino:.3,frondoso:.3}),matorral:W({acacia:.5,agave:.2,frondoso:.3}),cementerio:W({cipres:.8,palmera:.2}),humedal:W({frondoso:1}),paseo:W({palmera:.7,frondoso:.3})},
  'mediterraneo:californiano':{calle:W({palmera:.45,frondoso:.35,jacaranda:.2}),parque:W({palmera:.35,frondoso:.35,eucalipto:.15,pino:.15}),bosque:W({pino:.6,eucalipto:.4}),matorral:W({agave:.45,acacia:.35,cactus:.2}),cementerio:W({cipres:.7,palmera:.3}),humedal:W({frondoso:1}),paseo:W({palmera:1})},
  'tropical:humedo':{calle:W({frondoso:.4,palmera_real:.22,flamboyan:.16,almendro:.12,palmera:.1}),parque:W({frondoso:.3,palmera_real:.2,flamboyan:.14,almendro:.12,cocotero:.12,palmera:.12}),bosque:W({frondoso:.55,palmera_real:.25,almendro:.2}),matorral:W({frondoso:.5,palmera:.5}),cementerio:W({palmera_real:.5,cipres:.25,frondoso:.25}),humedal:W({mangle:.85,palmera:.15}),paseo:W({cocotero:.65,almendro:.2,palmera_real:.15})},
  'tropical:subtropical':{calle:W({frondoso:.55,jacaranda:.15,palmera:.15,flamboyan:.15}),parque:W({frondoso:.4,palmera:.2,jacaranda:.15,flamboyan:.1,palmera_real:.15}),bosque:W({frondoso:.8,palmera_real:.2}),matorral:W({frondoso:.6,palmera:.4}),cementerio:W({cipres:.6,palmera:.4}),humedal:W({frondoso:.7,palmera:.3}),paseo:W({palmera:.6,frondoso:.4})},
  'tropical:guineano':{calle:W({frondoso:.5,palmera_real:.2,almendro:.15,flamboyan:.15}),parque:W({frondoso:.4,cocotero:.2,palmera_real:.2,flamboyan:.2}),bosque:W({frondoso:.7,palmera_real:.3}),matorral:W({frondoso:1}),cementerio:W({palmera_real:.6,frondoso:.4}),humedal:W({mangle:1}),paseo:W({cocotero:1})},
  'arido:costero':{calle:W({frondoso:.38,palmera:.3,acacia:.2,olivo:.12}),parque:W({frondoso:.32,palmera:.28,acacia:.2,olivo:.1,agave:.1}),bosque:W({acacia:.6,palmera:.2,frondoso:.2}),matorral:W({acacia:.4,cactus:.35,agave:.25}),cementerio:W({cipres:.6,palmera:.4}),humedal:W({palmera:.5,frondoso:.5}),paseo:W({palmera:.8,frondoso:.2})},
  'arido:caribe':{calle:W({palmera:.35,acacia:.3,frondoso:.35}),parque:W({palmera:.35,acacia:.3,frondoso:.2,cactus:.15}),bosque:W({acacia:.7,cactus:.3}),matorral:W({cactus:.45,acacia:.35,agave:.2}),cementerio:W({palmera:.6,cipres:.4}),humedal:W({mangle:1}),paseo:W({cocotero:.7,palmera:.3})},
  'arido:norte':{calle:W({frondoso:.35,palmera:.3,acacia:.25,olivo:.1}),parque:W({frondoso:.3,palmera:.25,acacia:.25,agave:.1,cactus:.1}),bosque:W({acacia:.5,pino:.3,frondoso:.2}),matorral:W({cactus:.4,agave:.3,acacia:.3}),cementerio:W({cipres:.7,palmera:.3}),humedal:W({frondoso:1}),paseo:W({palmera:1})},
  'arido:sureste':{calle:W({frondoso:.45,palmera:.3,naranjo:.1,olivo:.15}),parque:W({palmera:.35,frondoso:.25,olivo:.15,pino:.1,agave:.15}),bosque:W({pino:.7,olivo:.3}),matorral:W({agave:.35,olivo:.3,cactus:.15,pino:.2}),cementerio:W({cipres:.85,palmera:.15}),humedal:W({palmera:.5,frondoso:.5}),paseo:W({palmera:.85,frondoso:.15})},
  'arido:canario':{calle:W({palmera:.4,frondoso:.4,flamboyan:.1,jacaranda:.1}),parque:W({palmera:.4,frondoso:.25,flamboyan:.1,agave:.1,cactus:.15}),bosque:W({pino:.7,palmera:.3}),matorral:W({cactus:.45,agave:.35,palmera:.2}),cementerio:W({cipres:.6,palmera:.4}),humedal:W({palmera:1}),paseo:W({palmera:.8,cocotero:.2})},
  'arido:cuyo':{calle:W({frondoso:.75,olivo:.1,acacia:.15}),parque:W({frondoso:.5,olivo:.15,acacia:.15,eucalipto:.1,palmera:.1}),bosque:W({acacia:.6,eucalipto:.4}),matorral:W({acacia:.5,cactus:.3,agave:.2}),cementerio:W({cipres:.9,frondoso:.1}),humedal:W({frondoso:1}),paseo:W({frondoso:1})},
  'arido:patagonia':{calle:W({frondoso:.6,conifera:.4}),parque:W({frondoso:.5,conifera:.4,eucalipto:.1}),bosque:W({conifera:.7,frondoso:.3}),matorral:W({acacia:.6,frondoso:.4}),cementerio:W({cipres:.8,conifera:.2}),humedal:W({frondoso:1}),paseo:W({conifera:.5,frondoso:.5})},
  'arido:atacama':{calle:W({frondoso:.4,palmera:.35,acacia:.25}),parque:W({palmera:.35,frondoso:.3,acacia:.25,cactus:.1}),bosque:W({acacia:.8,palmera:.2}),matorral:W({cactus:.5,acacia:.3,agave:.2}),cementerio:W({cipres:.5,palmera:.5}),humedal:W({palmera:1}),paseo:W({palmera:1})},
  'montana:andina':{calle:W({frondoso:.45,eucalipto:.25,cipres:.15,conifera:.15}),parque:W({eucalipto:.3,conifera:.25,frondoso:.25,cipres:.15,jacaranda:.05}),bosque:W({eucalipto:.45,conifera:.4,frondoso:.15}),matorral:W({agave:.35,frondoso:.35,conifera:.3}),cementerio:W({cipres:.9,conifera:.1}),humedal:W({frondoso:1}),paseo:W({frondoso:1})},
  'montana:iberica':{calle:W({frondoso:.75,conifera:.15,sakura:.1}),parque:W({frondoso:.45,conifera:.35,pino:.2}),bosque:W({conifera:.6,pino:.25,frondoso:.15}),matorral:W({conifera:.4,frondoso:.6}),cementerio:W({cipres:.85,conifera:.15}),humedal:W({frondoso:1}),paseo:W({frondoso:1})},
  'montana:patagonica':{calle:W({frondoso:.5,conifera:.3,araucaria:.2}),parque:W({conifera:.4,frondoso:.35,araucaria:.25}),bosque:W({conifera:.6,frondoso:.25,araucaria:.15}),matorral:W({frondoso:.6,conifera:.4}),cementerio:W({cipres:.6,conifera:.4}),humedal:W({frondoso:1}),paseo:W({conifera:.5,frondoso:.5})},
  'atlantico:cantabrico':{calle:W({frondoso:.86,sakura:.08,palmera:.06}),parque:W({frondoso:.66,conifera:.1,eucalipto:.08,palmera:.06,sakura:.1}),bosque:W({frondoso:.55,eucalipto:.25,conifera:.2}),matorral:W({frondoso:.6,conifera:.4}),cementerio:W({cipres:.85,frondoso:.15}),humedal:W({frondoso:1}),paseo:W({palmera:.4,frondoso:.6})},
  'atlantico:pampeano':{calle:W({frondoso:.6,jacaranda:.22,palmera:.08,flamboyan:.1}),parque:W({frondoso:.45,jacaranda:.15,palmera:.15,eucalipto:.15,conifera:.1}),bosque:W({eucalipto:.5,frondoso:.5}),matorral:W({acacia:.4,frondoso:.6}),cementerio:W({cipres:.8,palmera:.2}),humedal:W({frondoso:1}),paseo:W({palmera:.5,frondoso:.5})},
  'atlantico:valdiviano':{calle:W({frondoso:.7,conifera:.2,araucaria:.1}),parque:W({frondoso:.45,conifera:.3,araucaria:.25}),bosque:W({frondoso:.5,conifera:.35,araucaria:.15}),matorral:W({frondoso:.7,conifera:.3}),cementerio:W({cipres:.7,conifera:.3}),humedal:W({frondoso:1}),paseo:W({frondoso:.6,conifera:.4})},
};
export function speciesWeights(climate,ctx){
  const table=SPECIES[climate.variant]??SPECIES[climate.id+':'+DEFAULT_VARIANT[climate.id]]??SPECIES['mediterraneo:iberico'];
  return table[ctx]??table.parque;
}

// Especie registrada en OSM (species, genus, leaf_type) -> especie representable. null = según clima.
const GENUS={phoenix:'palmera',washingtonia:'palmera',trachycarpus:'palmera',butia:'palmera',syagrus:'palmera',jubaea:'palmera',chamaerops:'palmera',
  roystonea:'palmera_real',archontophoenix:'palmera_real',dypsis:'palmera_real',cocos:'cocotero',
  cupressus:'cipres',juniperus:'cipres',thuja:'cipres',
  olea:'olivo',citrus:'naranjo',eucalyptus:'eucalipto',jacaranda:'jacaranda',delonix:'flamboyan',tabebuia:'flamboyan',handroanthus:'flamboyan',erythrina:'flamboyan',
  terminalia:'almendro',acacia:'acacia',vachellia:'acacia',prosopis:'acacia',parkinsonia:'acacia',schinus:'acacia',
  abies:'conifera',picea:'conifera',cedrus:'conifera',pseudotsuga:'conifera',larix:'conifera',sequoia:'conifera',
  araucaria:'araucaria',rhizophora:'mangle',avicennia:'mangle',laguncularia:'mangle',
  agave:'agave',yucca:'agave',aloe:'agave',carnegiea:'cactus',pachycereus:'cactus',opuntia:'cactus',stenocereus:'cactus',echinopsis:'cactus',
  prunus:'sakura',
};
export function recordedSpecies(tags={}){
  const text=String(tags.genus??tags.species??tags['species:es']??'').trim().toLowerCase();
  const genus=text.split(/[\s_]+/)[0];
  if(genus==='pinus')return /pinea/.test(text)?'pino':/halepensis|canariensis/.test(text)?'pino':'conifera';
  if(GENUS[genus])return GENUS[genus];
  if(tags.leaf_type==='needleleaved')return 'conifera';
  if(tags.leaf_type==='palm')return 'palmera';
  return null;
}

// Fachadas y cubiertas sin datos registrados. p = probabilidad de usar la paleta del clima.
// stone/brick: probabilidad de muro de sillería o ladrillo visto; roof: color y tipo de la cubierta inclinada.
const APPEARANCE={
  'tropical:humedo':{p:.45,palette:['#f4d35e','#f7a072','#7cc6c2','#f28ca0','#9ad1a5','#f6e6b4','#86b6e0','#ef7f5c','#fbe7a1','#c9a3e0','#f9f3e3'],zinc:.45},
  'tropical:subtropical':{p:.3,palette:['#f3e2c0','#e9c99d','#f5d6a8','#d8e3d0','#f4ece0','#e8b98f'],zinc:.25},
  'tropical:guineano':{p:.45,palette:['#f2e3c2','#e9c48a','#f0b37e','#d8e4cf','#f6eddc'],zinc:.6},
  'arido:costero':{p:.5,palette:['#e8d8b8','#d9b48a','#e3c9a0','#f0e2c8','#cfae86','#c99a6b','#ead2b0','#d6c2a2'],flat:.55},
  'arido:caribe':{p:.5,palette:['#f2d8a6','#e9b98a','#f4e6c8','#d9a57b','#f0c9a0'],flat:.4,zinc:.3},
  'arido:norte':{p:.55,palette:['#d9b48a','#e3c9a0','#c99a6b','#e9d8b8','#d6a77a','#bf8a5e','#eadcc2','#cfae86'],flat:.6},
  'arido:sureste':{p:.35,palette:['#f4efe4','#efe6d2','#ead9b9','#e3c79e','#f6f1e6'],flat:.45},
  'arido:canario':{p:.4,palette:['#f4efe4','#efe3cc','#e8d6b2','#f2e7d0','#dfe6e1'],flat:.6},
  'arido:cuyo':{p:.35,palette:['#e6d3b3','#d9bd94','#efe2c9','#cfb08a'],flat:.4},
  'arido:patagonia':{p:.35,palette:['#e6dfd2','#d6c9b2','#c9d2d4','#e8d7bd'],zinc:.5},
  'arido:atacama':{p:.5,palette:['#e8d8b8','#d9b48a','#e3c9a0','#f0e2c8'],flat:.6},
  'montana:andina':{p:.4,palette:['#f1ebe0','#e9dfcd','#d8c2a4','#c98f6a','#e5d6bd','#f4efe6'],brick:.28,roofTile:['#a8553a','#9c4c33','#b35d3d']},
  'montana:iberica':{p:.4,palette:['#e9e3d6','#ddd4c2','#efe9dc','#d6cdb9'],stone:.45,stoneColour:['#c9c0ad','#b8ad99','#d4cab6','#bfb6a3'],slate:.6},
  'montana:patagonica':{p:.45,palette:['#e8d9b5','#c7d6d9','#e6b8a2','#b5c9b0','#efe6d0','#d9c3a0'],zinc:.35,slate:.3},
  'mediterraneo:altura':{p:.25,palette:['#f1e2c4','#e8c79c','#f4ead6','#e2b08a','#d6dcd0'],flat:.35},
  'mediterraneo:chileno':{p:.2,palette:['#f2e6cf','#e9d3ae','#f5ede0','#e2c49e'],zinc:.15},
  'mediterraneo:californiano':{p:.3,palette:['#f1e4cc','#e8cfa8','#f6eedf','#dfe3dc'],flat:.35},
  'atlantico:cantabrico':{p:.45,palette:['#f2f0ea','#e6e4de','#d9d6cf','#ece3cf','#c9cdd1','#efe8da'],stone:.35,stoneColour:['#b9b3a6','#a8a397','#c4beb0'],slate:.55},
  'atlantico:pampeano':{p:.15,palette:['#efe6d6','#e4d6be','#f2ece2','#d9cdb8'],zinc:.1},
  'atlantico:valdiviano':{p:.5,palette:['#e8d9b5','#c7d6d9','#e6b8a2','#b5c9b0','#efe6d0','#d9a98c'],zinc:.55},
};
export const climateAppearance=climate=>APPEARANCE[climate.variant]??null;
// Estilos residenciales a los que el clima puede matizar color y material (los monumentales y públicos no).
export const CLIMATE_STYLES=new Set(['madrid_clasico','madrid_moderno','casa','pequeno','colonial','latam_moderno','andaluz','moderno_liso']);
