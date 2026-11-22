import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';

type Zone={id:string;label:string;group:string};
const MUNDO=path.join(process.cwd(),'SpanStories-Ciudades/Mundo');
const readJson=async(file:string)=>JSON.parse(await readFile(file,'utf8'));

/** Zonas manuales del motor (mundo.json › países › ciudades) y el aeropuerto: todas las que el motor sabe abrir. */
async function engineZones():Promise<Zone[]>{
  const zones:Zone[]=[];
  try{
    const world=await readJson(path.join(MUNDO,'mundo.json'));
    for(const countryRef of world.countries??[]){
      const countryFile=path.join(MUNDO,countryRef.manifest),country=await readJson(countryFile);
      for(const cityRef of country.cities??[]){
        try{
          const cityFile=path.join(path.dirname(countryFile),cityRef.manifest),city=await readJson(cityFile);
          for(const z of city.zones??[])if(typeof z.id==='string')zones.push({id:z.id,label:`${city.label} · ${z.label}`,group:`Ciudades · ${country.label}`});
        }catch{/* Una ciudad rota no oculta las demás. */}
      }
    }
  }catch{/* Sin mundo manual: solo quedan aeropuerto y lugares generados. */}
  zones.push({id:'aeropuerto-entrada',label:'Aeropuerto · Entrada',group:'Establecimientos'});
  const hills=await Promise.all([['ColinaQuijote','zona.json'],['ColinaAmanecer','zona.json'],['ColinaAmanecer','alba.json']].map(([dir,file])=>readJson(path.join(MUNDO,dir,file)).catch(()=>null)));
  for(const hill of hills)if(hill)zones.push({id:hill.id,label:hill.label,group:'Naturaleza'});
  // Escenarios de servicios (prototipos HTML de worlds/prototypes): se ven dentro del Editor, aún sin el motor de ciudades.
  const services:[string,string][]=[['restaurant','Restaurante'],['pharmacy','Farmacia'],['bank','Banco'],['cafe','Cafetería'],['shop','Comercio'],['bus-stop','Parada de autobús'],['hotel','Hotel Palma Real'],['hostel','Hostal Santa Marta']];
  try{
    const library=await readJson(path.join(process.cwd(),'content/worlds/library.json'));
    for(const p of library.places??[])if(typeof p.id==='string'&&p.id!=='airport'&&!services.some(([id])=>id===p.id))services.push([p.id,String(p.name??p.id)]);
  }catch{/* Sin biblioteca: lista fija. */}
  for(const [id,label] of services)zones.push({id:'servicio:'+id,label,group:'Escenarios de servicios (vista)'});
  return zones;
}

export async function GET(){
  if(process.env.NODE_ENV!=='development')return Response.json({places:[],zones:[]});
  const zones=(await engineZones()).filter(z=>z.id==='colina-don-quijote');
  try{
    const catalog=await readJson(path.join(MUNDO,'Generados/catalogo.json'));
    return Response.json({zones,places:catalog.places.map((p:{id:string;label:string;revision:string;history:{revision:string}[]})=>({id:p.id,label:p.label,revision:p.revision,history:p.history.map(h=>h.revision),versions:p.history.length}))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return Response.json({places:[],zones});return Response.json({zones,error:'No se pudo leer la biblioteca de lugares'},{status:500});}
}
