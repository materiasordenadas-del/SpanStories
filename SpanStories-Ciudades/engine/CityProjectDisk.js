import {EstadoEditorCiudad,crearPreparador,validateProject,serializarProyecto,deserializarProyecto} from './CityProject.js';

export const PROJECT_API='http://localhost:3000/api/city-projects';
/** Respuesta JSON del visor local; si no es JSON (página de error, servidor caído a medias) se explica en vez de lanzar un SyntaxError. */
async function leerRespuesta(response,fallo){let data=null;try{data=await response.json();}catch{throw Error(fallo+(response.ok?': respuesta no válida del visor local.':` (HTTP ${response.status}).`));}if(!response.ok)throw Error(data?.error||fallo+'.');return data;}
export class ProyectoDisco {
  constructor(cityId){this.cityId=cityId;this.revision=null;this.savedAt=null;}
  async load(cityId=this.cityId,revision=null){
    if(revision==='base')return null;
    const q=new URLSearchParams({city:cityId});if(revision==='recovery')q.set('recovery','1');else if(revision)q.set('revision',revision);
    const data=await leerRespuesta(await fetch(PROJECT_API+'?'+q,{cache:'no-store'}),'No se pudo leer el proyecto en disco');
    if(revision!=='recovery'){this.revision=data.revision;this.savedAt=data.savedAt;}
    return data.project?deserializarProyecto(JSON.stringify(data.project),cityId):null;
  }
  async save(cityId,project,recovery=false){
    const response=await fetch(PROJECT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:JSON.parse(await serializarProyecto(project)),expectedRevision:this.revision,recovery})});
    const data=await leerRespuesta(response,'No se pudo guardar en disco');
    if(!recovery){this.revision=data.revision;this.savedAt=data.savedAt;}return data;
  }
}
export async function leerEdicionCiudad(options,revision=null){
  const state=new EstadoEditorCiudad(options),store=new ProyectoDisco(options.cityId);
  const project=await store.load(options.cityId,revision);
  if(project){
    validateProject(project,options.cityId);
    const prepare=crearPreparador(options),prepared=[];
    try{for(const r of project.imports)prepared.push(await prepare(r.blob,r.filename,r.id,r.nodes));}
    catch(e){for(const r of prepared){r.optimization?.dispose();options.liberar?.(r.root);}throw e;}
    state.restoreOverrides(project.overrides);for(const r of prepared)state.addImport(r,false);
    state.escenario=structuredClone(project.escenario);
  }
  return {state,refresh:()=>state.applyPending(),enabled(){},dirty:()=>false,revision:store.revision,dispose(){for(const r of state.imports.values())r.optimization?.dispose();}};
}
