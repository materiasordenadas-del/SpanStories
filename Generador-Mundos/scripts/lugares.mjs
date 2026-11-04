// Interfaz para asistentes: no requiere controlar una sesión ni tocar mallas.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {VisorLibrary} from '../server/visor-library.js';
const library=new VisorLibrary({generatorRoot:fileURLToPath(new URL('..',import.meta.url))});
const [command,id,file]=process.argv.slice(2);
try{
  let result;
  if(command==='listar')result=await library.catalog();
  else if(command==='leer')result=await library.project(id,{version:file??null});
  else if(command==='versiones')result=(await library.place(id)).history;
  else if(command==='entidades'){const {project,sha256}=await library.project(id),matches=e=>!file||(e.id+' '+(e.name??'')).toLowerCase().includes(file.toLowerCase());result={sha256,totalBuildings:project.model.buildings.length,totalRoads:project.model.roads.length,buildings:project.model.buildings.filter(matches).slice(0,50).map(b=>({id:b.id,name:b.name,height:b.height,edit:project.overrides[b.id]??{}})),roads:project.model.roads.filter(matches).slice(0,50).map(r=>({id:r.id,name:r.name}))};}
  else if(command==='editar')result=await library.edit(id,JSON.parse(await readFile(file,'utf8')));
  else if(command==='enviar')result=await library.publish(JSON.parse(await readFile(id,'utf8')));
  else throw Error('Uso: node scripts/lugares.mjs listar | leer ID [REVISION] | versiones ID | entidades ID [BUSQUEDA] | editar ID cambios.json | enviar paquete.json');
  console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
