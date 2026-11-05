// Zona climática del lugar como dato base (tropical, árido, montaña, mediterráneo, atlántico, con variantes
// regionales del mundo hispanohablante). El generador solo la deduce y la guarda con el lugar: los efectos
// visuales (estaciones, lluvia, nieve, niebla) son del visor (SpanStories-Ciudades/engine/EstacionesClima.js).
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
