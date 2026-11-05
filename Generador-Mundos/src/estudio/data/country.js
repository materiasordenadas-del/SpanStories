// País del lugar y región de estilos. Atlas solo optimiza lugares donde el español es la primera lengua:
// España y los países hispanohablantes de América (más Guinea Ecuatorial). Fuera de ese ámbito no se bloquea
// la generación: se usan estilos genéricos.
// Fuente preferente: límites administrativos de OSM (is_in) guardados en la fuente geográfica. Sin ellos
// (proyectos anteriores o proveedor caído) se usa una aproximación offline por polígonos gruesos.

export const HISPANIC={
  ES:{name:'España',subregion:'espana'},
  MX:{name:'México',subregion:'mexico'},
  GT:{name:'Guatemala',subregion:'centroamerica'},SV:{name:'El Salvador',subregion:'centroamerica'},
  HN:{name:'Honduras',subregion:'centroamerica'},NI:{name:'Nicaragua',subregion:'centroamerica'},
  CR:{name:'Costa Rica',subregion:'centroamerica'},PA:{name:'Panamá',subregion:'centroamerica'},
  CU:{name:'Cuba',subregion:'caribe'},DO:{name:'República Dominicana',subregion:'caribe'},PR:{name:'Puerto Rico',subregion:'caribe'},
  CO:{name:'Colombia',subregion:'andes'},VE:{name:'Venezuela',subregion:'andes'},EC:{name:'Ecuador',subregion:'andes'},
  PE:{name:'Perú',subregion:'andes'},BO:{name:'Bolivia',subregion:'andes'},
  CL:{name:'Chile',subregion:'cono-sur'},AR:{name:'Argentina',subregion:'cono-sur'},UY:{name:'Uruguay',subregion:'cono-sur'},PY:{name:'Paraguay',subregion:'cono-sur'},
  GQ:{name:'Guinea Ecuatorial',subregion:'africa'},
};
export const SUBREGION_NAMES={espana:'España',mexico:'México',centroamerica:'Centroamérica',caribe:'Caribe',andes:'Andes y norte de Sudamérica','cono-sur':'Cono Sur',africa:'África'};
const SPAIN_SUBDIVISION={'ES-CT':'catalunya','ES-AN':'andalucia','ES-CN':'canarias'};

// Región de estilos existente para un país/subdivisión (los estilos no cambian; solo su asignación).
export function styleRegion(code,subdivision=null,at=null){
  if(code==='ES'){
    if(subdivision&&SPAIN_SUBDIVISION[subdivision])return SPAIN_SUBDIVISION[subdivision];
    if(subdivision)return 'espana';
    return at?spainRegionAt(at.lat,at.lon):'espana';
  }
  if(HISPANIC[code]&&code!=='GQ')return 'latam';
  return 'generic';
}

export function countryRecord(code,{subdivision=null,source,lat=null,lon=null,name=null}={}){
  const c=code?String(code).toUpperCase():null,h=HISPANIC[c];
  return {code:c,name:h?.name??name??null,subdivision:subdivision??null,hispanic:Boolean(h),subregion:h?.subregion??null,
    region:styleRegion(c,subdivision,lat!=null?{lat,lon}:null),source};
}

// Respuesta de Overpass is_in (admin_level 2 y 4) -> registro de país.
export function countryFromAreas(elements,{lat,lon}={}){
  const tags=(elements??[]).map(e=>e.tags??{});
  const iso2=t=>t['ISO3166-1']??t['ISO3166-1:alpha2']??null;
  const subdivisions=tags.map(t=>t['ISO3166-2']).filter(Boolean);
  // Puerto Rico es subdivisión de EE. UU. en OSM y también tiene su propio código ISO 3166-1.
  let code=subdivisions.includes('US-PR')?'PR':null;
  const countries=tags.map(iso2).filter(Boolean).map(c=>c.toUpperCase());
  code??=countries.find(c=>HISPANIC[c])??countries[0]??null;
  if(!code)return null;
  const subdivision=subdivisions.find(s=>s.startsWith(code+'-'))??null;
  return countryRecord(code,{subdivision,source:'osm:is_in',lat,lon,name:tags.find(t=>iso2(t))?.name});
}

// ---------------------------------------------------------------- aproximación offline
// Polígonos gruesos [lon,lat]: el error en las fronteras puede ser de decenas de km. Solo es un respaldo.
const SPAIN=[[-9.3,43.2],[-8,43.75],[-5.8,43.65],[-3.5,43.5],[-1.8,43.4],[-1.4,43.25],[-.7,42.85],[.7,42.85],[1.45,42.6],[1.75,42.45],[3.2,42.45],[3.4,41.9],[2,41.2],[.9,40.75],[0,39.9],[-.3,39.4],[.25,38.8],[-.5,38.2],[-.75,37.6],[-1.6,37],[-2,36.7],[-4.4,36.65],[-5.2,36.3],[-5.35,36.05],[-5.6,36],[-6.05,36.2],[-6.45,36.75],[-7.4,37.15],[-7.5,37.55],[-7,38],[-7.3,38.45],[-7,38.9],[-7.5,39.65],[-6.9,40.25],[-6.85,41],[-6.2,41.6],[-6.6,41.95],[-7.9,41.85],[-8.2,42.05],[-8.9,41.87],[-9.3,42.9]];
const CATALONIA=[[.5,40.5],[.25,40.75],[.25,41.2],[.35,41.6],[.6,42],[.65,42.4],[.65,42.85],[1.45,42.6],[1.75,42.45],[3.2,42.45],[3.4,41.9],[2,41.2],[.9,40.75]];
const ANDALUSIA=[[-7.4,37.15],[-7.5,37.55],[-7,38],[-6.3,38.1],[-5.6,38.4],[-5,38.75],[-4.3,38.4],[-3.5,38.45],[-2.6,38.5],[-2.4,38.1],[-2,37.7],[-1.65,37.4],[-1.6,37],[-2,36.7],[-4.4,36.65],[-5.2,36.3],[-5.35,36.05],[-5.6,36],[-6.05,36.2],[-6.45,36.75]];
const MEXICO=[[-117.12,32.53],[-114.72,32.72],[-111.07,31.33],[-108.2,31.33],[-108.2,31.78],[-106.53,31.785],[-106.49,31.752],[-106.38,31.73],[-106.2,31.47],[-104.9,30.6],[-104.4,29.6],[-103.1,28.98],[-102.4,29.77],[-101.4,29.77],[-100,28],[-99.5,27.5],[-99.1,26.4],[-97.15,25.95],[-96.5,24],[-96,21],[-94.5,18.3],[-92,18.9],[-90.5,21.2],[-87,21.7],[-86.7,21.2],[-87.4,18.5],[-88.3,18.5],[-88.85,17.9],[-89.15,17.82],[-90.98,17.82],[-90.98,17.25],[-91.45,17.25],[-90.4,16.1],[-91.73,16.07],[-92.25,14.55],[-93.5,15],[-96.5,15.3],[-100,16.5],[-105.5,19.5],[-106.5,22.5],[-109.5,22.8],[-112,24.5],[-114.5,27.5],[-115.5,28.5],[-117.5,32]];
const CENTRAL_AMERICA=[[-92.25,14.55],[-91.73,16.07],[-90.4,16.1],[-91.45,17.25],[-90.98,17.25],[-90.98,17.82],[-89.15,17.82],[-89.15,15.9],[-88.2,15.7],[-85,16.2],[-83.1,15],[-83.3,12],[-83.6,10.9],[-82.5,9.5],[-81,9.2],[-79.5,9.7],[-77.37,8.67],[-77.9,7.2],[-78.5,7],[-80.5,7],[-83,7.8],[-86,9.5],[-88,12.5]];
const DOMINICAN=[[-71.73,19.95],[-71.65,19.2],[-71.75,18.7],[-71.7,18.05],[-71.75,17.4],[-68,18],[-68,19.2],[-69.5,20]];
// Brasil y las Guayanas: lo que queda de Sudamérica es hispanohablante.
const BRAZIL_GUIANAS=[[-60,8.55],[-60.73,5.2],[-62,4.2],[-63.5,4],[-64.8,4.25],[-64,2],[-66.87,1.22],[-69.4,1.1],[-69.8,.6],[-69.45,.05],[-69.92,-4.24],[-72.9,-5],[-73.9,-7.4],[-72.8,-8.6],[-72.4,-9.5],[-70.5,-11],[-69.6,-10.95],[-68.6,-11.1],[-66,-9.8],[-65.3,-10.9],[-65,-12.5],[-62,-13.6],[-60.4,-13.5],[-60,-15.1],[-58.3,-16.3],[-58.4,-17.3],[-57.6,-18.2],[-57.75,-19.95],[-58.1,-20.2],[-57.9,-22.1],[-55.75,-22.3],[-55.4,-23.95],[-54.3,-24.05],[-54.6,-25.6],[-53.85,-25.65],[-53.65,-26.25],[-55.7,-27.9],[-57.6,-30.2],[-56,-30.85],[-53.4,-32.5],[-53.4,-33.75],[-52,-34.5],[-45,-26],[-38,-15],[-33.5,-7],[-44,-1],[-51,4.5],[-54,6],[-57,6.6],[-58.6,7.6]];
// [oeste,sur,este,norte]
const box=(lon,lat,[w,s,e,n])=>lon>=w&&lon<=e&&lat>=s&&lat<=n;
const BALEARICS=[1.1,38.6,4.4,40.1],CANARIES=[-18.3,27.6,-13.3,29.5],CEUTA=[-5.4,35.86,-5.27,35.92],MELILLA=[-2.97,35.26,-2.92,35.32];
const CUBA=[-85,19.8,-74.1,23.3],PUERTO_RICO=[-67.95,17.85,-65.2,18.55],SOUTH_AMERICA=[-82,-56,-34,13.2],BIOKO=[8.4,3.15,9,3.85],RIO_MUNI=[9.3,.9,11.35,2.35];
// Gibraltar y Andorra quedan dentro del polígono grueso de España.
const NOT_SPAIN=[[-5.37,36.105,-5.335,36.16],[1.41,42.43,1.79,42.66]];
const NOT_HISPANIC_ISLANDS=[[-70.1,12.38,-69.85,12.65],[-69.2,12,-68.7,12.4],[-68.45,12,-68.15,12.33],[-61.83,10.03,-60.45,11.4]];
function inPolygon(lon,lat,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;}return inside;}

function spainRegionAt(lat,lon){
  if(box(lon,lat,CANARIES))return 'canarias';
  if(inPolygon(lon,lat,CATALONIA))return 'catalunya';
  if(inPolygon(lon,lat,ANDALUSIA))return 'andalucia';
  return 'espana';
}

// Código de país aproximado (o null) y subdivisión deducible.
export function approximateCountry(lat,lon){
  const rec=(code,subdivision=null)=>countryRecord(code,{subdivision,source:'aproximado:coordenadas',lat,lon});
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return countryRecord(null,{source:'desconocido'});
  if(box(lon,lat,CANARIES))return rec('ES','ES-CN');
  if(!NOT_SPAIN.some(b=>box(lon,lat,b))&&inPolygon(lon,lat,SPAIN)||box(lon,lat,BALEARICS)||box(lon,lat,CEUTA)||box(lon,lat,MELILLA))return rec('ES');
  if(inPolygon(lon,lat,MEXICO))return rec('MX');
  if(inPolygon(lon,lat,CENTRAL_AMERICA))return {...rec(null),hispanic:true,subregion:'centroamerica',region:'latam'};
  if(box(lon,lat,CUBA))return rec('CU');
  if(inPolygon(lon,lat,DOMINICAN))return rec('DO');
  if(box(lon,lat,PUERTO_RICO))return rec('PR');
  if(box(lon,lat,BIOKO)||box(lon,lat,RIO_MUNI))return rec('GQ');
  if(box(lon,lat,SOUTH_AMERICA)&&!inPolygon(lon,lat,BRAZIL_GUIANAS)&&!NOT_HISPANIC_ISLANDS.some(b=>box(lon,lat,b))){
    if(lon<-77.2&&lat>7.2&&lat<9.7)return rec('PA');
    return {...rec(null),hispanic:true,subregion:lat>-18?'andes':'cono-sur',region:'latam'};
  }
  return rec(null);
}

// Etiquetas addr:country de la propia fuente OSM (mayoría) como segundo indicio.
export function countryFromTags(elements){
  const votes=new Map();
  for(const e of elements??[]){const c=e.tags?.['addr:country'];if(c&&/^[A-Za-z]{2}$/.test(c)){const k=c.toUpperCase();votes.set(k,(votes.get(k)??0)+1);}}
  const best=[...votes].sort((a,b)=>b[1]-a[1])[0];
  return best&&best[1]>=3?best[0]:null;
}

// País de una fuente geográfica: registro guardado > addr:country > aproximación por coordenadas.
export function resolveCountry(source){
  const b=source?.bounds??{},lat=b.centerLat??(b.south+b.north)/2,lon=b.centerLon??(b.west+b.east)/2;
  if(source?.country?.code)return countryRecord(source.country.code,{subdivision:source.country.subdivision,source:source.country.source??'fuente',lat,lon,name:source.country.name});
  const approx=approximateCountry(lat,lon),tagged=countryFromTags(source?.osm?.elements);
  if(tagged&&(!approx.code||tagged!==approx.code)&&(HISPANIC[tagged]||!approx.hispanic))return countryRecord(tagged,{source:'osm:addr:country',lat,lon});
  return approx;
}
