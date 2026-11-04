// Acceso a los servicios geográficos locales (Vite) y lista de lugares de ejemplo.
import {boundsAround} from '../../geo/projection.js';

export const SIZES=[200,300,400,600,800,1000];

// Lugares de ejemplo pensados para historias de SpanStories (mundo hispanohablante primero).
export const PRESETS=[
  {id:'madrid-sol',name:'Madrid · Puerta del Sol',lat:40.41690,lon:-3.70350},
  {id:'madrid-mayor',name:'Madrid · Plaza Mayor',lat:40.41553,lon:-3.70739},
  {id:'madrid-gran-via',name:'Madrid · Gran Vía (Callao)',lat:40.42020,lon:-3.70580},
  {id:'madrid-lavapies',name:'Madrid · Lavapiés',lat:40.40880,lon:-3.70120},
  {id:'madrid-retiro',name:'Madrid · Puerta de Alcalá y Retiro',lat:40.41990,lon:-3.68880},
  {id:'barcelona-gracia',name:'Barcelona · Passeig de Gràcia',lat:41.39170,lon:2.16490},
  {id:'barcelona-eixample',name:'Barcelona · Eixample (manzana)',lat:41.38900,lon:2.15900},
  {id:'barcelona-gotic',name:'Barcelona · Barri Gòtic',lat:41.38300,lon:2.17650},
  {id:'sevilla-santa-cruz',name:'Sevilla · Barrio de Santa Cruz',lat:37.38560,lon:-5.98950},
  {id:'sevilla-espana',name:'Sevilla · Plaza de España',lat:37.37720,lon:-5.98690},
  {id:'valencia-centro',name:'Valencia · Plaza del Ayuntamiento',lat:39.46980,lon:-0.37630},
  {id:'salamanca',name:'Salamanca · Plaza Mayor',lat:40.96500,lon:-5.66400},
  {id:'granada-albaicin',name:'Granada · Albaicín',lat:37.18150,lon:-3.59300},
  {id:'cdmx-zocalo',name:'Ciudad de México · Zócalo',lat:19.43260,lon:-99.13320},
  {id:'cdmx-coyoacan',name:'Ciudad de México · Coyoacán',lat:19.35000,lon:-99.16250},
  {id:'cdmx-roma',name:'Ciudad de México · Colonia Roma',lat:19.41700,lon:-99.16200},
  {id:'bogota-candelaria',name:'Bogotá · La Candelaria',lat:4.59700,lon:-74.07300},
  {id:'medellin-centro',name:'Medellín · Parque Berrío',lat:6.25000,lon:-75.56900},
  {id:'cartagena',name:'Cartagena · Ciudad amurallada',lat:10.42350,lon:-75.55000},
  {id:'cali-san-antonio',name:'Cali · San Antonio',lat:3.44700,lon:-76.54000},
  {id:'buenos-aires-mayo',name:'Buenos Aires · Plaza de Mayo',lat:-34.60830,lon:-58.37210},
  {id:'buenos-aires-boca',name:'Buenos Aires · La Boca (Caminito)',lat:-34.63900,lon:-58.36300},
  {id:'lima-armas',name:'Lima · Plaza de Armas',lat:-12.04560,lon:-77.03050},
  {id:'santiago-armas',name:'Santiago de Chile · Plaza de Armas',lat:-33.43780,lon:-70.65050},
  {id:'habana-vieja',name:'La Habana · Habana Vieja',lat:23.13600,lon:-82.35100},
  {id:'quito-centro',name:'Quito · Centro Histórico',lat:-0.22000,lon:-78.51250},
  {id:'valparaiso',name:'Valparaíso · Cerro Alegre',lat:-33.04200,lon:-71.62600},
  {id:'san-juan',name:'San Juan · Viejo San Juan',lat:18.46600,lon:-66.11700},
];

async function json(response){
  let data;try{data=await response.json();}catch{throw Error('Respuesta no válida del servidor local');}
  if(!response.ok)throw Error(data?.error||('HTTP '+response.status));
  return data;
}

export async function searchPlaces(query){
  return json(await fetch('/api/geo/search?q='+encodeURIComponent(query)));
}

// Acepta «lat, lon» en decimal. Devuelve null si el texto no son coordenadas.
export function parseCoordinates(text){
  const m=String(text).trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if(!m)return null;
  const lat=Number(m[1].replace(',','.')),lon=Number(m[2].replace(',','.'));
  return Math.abs(lat)<=85&&Math.abs(lon)<=180?{lat,lon}:null;
}

export function regionBounds(lat,lon,size){return boundsAround(lat,lon,size,size);}

export async function fetchRegion({lat,lon,size,label,refresh=false}){
  const bounds=regionBounds(lat,lon,size);
  const source=await json(await fetch('/api/geo/region',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({bounds:{south:bounds.south,west:bounds.west,north:bounds.north,east:bounds.east},label,refresh})}));
  return source;
}

export async function fetchFarCity({lat,lon,radius,inner}){
  return json(await fetch(`/api/estudio/lejano?lat=${lat}&lon=${lon}&radio=${radius}&interior=${inner}`));
}

export async function saveCapture(blob,name){
  return json(await fetch('/api/estudio/captura?nombre='+encodeURIComponent(name),{method:'POST',body:blob}));
}

export async function saveFile(blob,name,ext){
  return json(await fetch(`/api/estudio/archivo?nombre=${encodeURIComponent(name)}&ext=${ext}`,{method:'POST',body:blob}));
}
