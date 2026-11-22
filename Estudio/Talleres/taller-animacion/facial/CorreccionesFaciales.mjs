// Correcciones GENERALES del Taller facial: arreglos de un componente que valen para todos los personajes y todas
// las historias (modo «General · para todos»). Se guardan solo las diferencias con el original, en disco:
//   Estudio/Talleres/taller-animacion/biblioteca/facial/correcciones.json  (Git guarda la historia de cambios)
//
// Componentes:
//   · presets faciales (curvas ARKit): actuaciones 1–50 «acting.<id>.<estilo>», rostros cotidianos «daily.<id>»,
//     presets de la biblioteca («joy.soft.01»…) y clips del catálogo externo. Parche = curvas cambiadas / quitadas.
//   · «vida.<nombre>»: expresiones rápidas de la vida (ExpresionesVida · POSES[nombre].cara). Parche = pesos ARKit.
//   · «visema.<vis_X>»: visemas sustitutos en canales ARKit (CharacterLife · VISEMAS_ARKIT). Parche = pesos ARKit.
// Lo usan el Taller facial, el Taller de animación (al hornear) y la vida en reposo del motor (/vida-personaje/).
import {ARKIT,validatePreset,copy} from './FacialCore.mjs';

export const SCHEMA='spanstories.facial-corrections';
export const vacias=()=>({schema:SCHEMA,version:1,revision:0,items:{}});
const ID=/^[\w.@:-]{1,200}$/;
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const peso=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
export const tipoDe=id=>id.startsWith('vida.')?'vida':id.startsWith('visema.')?'visema':'preset';

/** Documento de correcciones válido (o error). */
export function validarCorrecciones(doc){
  if(!obj(doc)||doc.schema!==SCHEMA||doc.version!==1||!Number.isInteger(doc.revision)||doc.revision<0||!obj(doc.items))throw Error('Correcciones faciales no válidas.');
  if(Object.keys(doc.items).length>2000)throw Error('Demasiadas correcciones faciales.');
  for(const [id,item] of Object.entries(doc.items)){
    if(!ID.test(id)||!obj(item)||item.tipo!==tipoDe(id)||!obj(item.parche)||typeof item.guardado!=='string')throw Error('Corrección no válida: '+id);
    const p=item.parche;
    if(item.tipo==='preset'){
      if(Object.keys(p).some(k=>!['channels','duration','interpolation','intensityReference'].includes(k)))throw Error('Parche con campos desconocidos: '+id);
      if(p.channels!==undefined&&(!obj(p.channels)||Object.entries(p.channels).some(([c,k])=>!ARKIT.includes(c)||!(k===null||Array.isArray(k)))))throw Error('Curvas no válidas: '+id);
    }else{
      if(Object.keys(p).some(k=>k!=='pesos')||!obj(p.pesos)||Object.entries(p.pesos).some(([c,v])=>!ARKIT.includes(c)||!(v===null||peso(v))))throw Error('Pesos no válidos: '+id);
    }
  }
  return doc;
}

// ---------------------------------------------------------------- presets (curvas)
/** Componente del que sale un preset: el suyo, o el original si es una variante propia («user.*»). */
export const componenteDe=p=>typeof p?.source?.componente==='string'?p.source.componente:p?.id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Diferencia original → editado (null si no hay cambios). */
export function diferenciaPreset(original,editado){
  const parche={},channels={};
  const durationChanged=Math.abs(editado.duration-original.duration)>1e-9;
  if(durationChanged)parche.duration=editado.duration;
  for(const c of new Set([...Object.keys(original.channels),...Object.keys(editado.channels)])){
    const a=original.channels[c],b=editado.channels[c];
    if(!b)channels[c]=null;else if(durationChanged||!a||!same(a,b))channels[c]=copy(b);
  }
  if(Object.keys(channels).length)parche.channels=channels;
  if(editado.interpolation!==original.interpolation)parche.interpolation=editado.interpolation;
  const ra=original.intensity?.reference,rb=editado.intensity?.reference;
  if(rb!==undefined&&rb!==ra)parche.intensityReference=rb;
  return Object.keys(parche).length?parche:null;
}
/** Original + parche → preset corregido y validado. Si no casa (el original cambió en el código), se avisa y queda el original. */
export function aplicarParchePreset(original,parche){
  const p=copy(original);
  if(parche.duration!==undefined)p.duration=parche.duration;
  for(const [c,k] of Object.entries(parche.channels||{})){if(k===null)delete p.channels[c];else p.channels[c]=copy(k);}
  if(parche.interpolation)p.interpolation=parche.interpolation;
  if(parche.intensityReference!==undefined&&p.intensity)p.intensity={...p.intensity,reference:parche.intensityReference};
  if(p.defaults&&parche.duration!==undefined){const d=p.defaults;p.defaults={...d,duration:p.duration,trimEnd:p.duration,fadeIn:Math.min(d.fadeIn,p.duration/2),fadeOut:Math.min(d.fadeOut,p.duration/2)};}
  if(p.channels&&!Object.keys(p.channels).length)throw Error('La corrección deja el gesto sin curvas.');
  return validatePreset(p);
}

// ---------------------------------------------------------------- poses (vida y visemas)
/** Un pose ARKit {canal:peso} como preset estático (1 s en bucle) para editarlo con los mismos controles. */
export function presetDePose(id,name,pose){
  const channels={};for(const [c,v] of Object.entries(pose))if(ARKIT.includes(c)&&v>0)channels[c]=[[0,v],[1,v]];
  if(!Object.keys(channels).length)channels.jawOpen=[[0,0],[1,0]];
  return validatePreset({schema:'spanstories.facial-animation',version:1,id,name,category:id.startsWith('vida.')?'Vida · expresiones rápidas':'Habla · visemas',tags:[],type:'animation',fpsReference:30,timeUnit:'seconds',duration:1,loop:true,rig:'ARKit-52',interpolation:'linear',channels,source:{kind:'original',license:'internal',author:'SpanStories',componente:id}});
}
/** El pico de cada curva vuelve a ser el peso del pose. */
export function poseDePreset(p){const out={};for(const [c,k] of Object.entries(p.channels)){const v=Math.max(...k.map(x=>x[1]));if(v>0)out[c]=Math.round(v*1000)/1000;}return out;}
export function diferenciaPose(original,editado){
  const pesos={};
  for(const c of new Set([...Object.keys(original),...Object.keys(editado)])){const a=original[c]??0,b=editado[c]??0;if(Math.abs(a-b)>1e-4)pesos[c]=b>0?b:null;}
  return Object.keys(pesos).length?{pesos}:null;
}
export function aplicarPose(original,parche){const out={...original};for(const [c,v] of Object.entries(parche.pesos||{})){if(v===null)delete out[c];else out[c]=v;}return out;}

// ---------------------------------------------------------------- estado cargado y aplicación
let doc=vacias();
const originales=new Map();   // id → original (preset o pose) antes de aplicar correcciones
export const correcciones=()=>doc;
export const original=id=>originales.get(id)||null;
/** Lee el documento de correcciones (relativo a este módulo: sirve igual en el Taller y en el motor). */
export async function cargarCorrecciones(url=new URL('../biblioteca/facial/correcciones.json',import.meta.url)){
  try{const r=await fetch(url,{cache:'no-store'});if(r.ok)doc=validarCorrecciones(await r.json());else if(r.status===404)doc=vacias();}
  catch(error){console.warn('Correcciones faciales',error);}
  return doc;
}
export function usarCorrecciones(nuevo){doc=validarCorrecciones(nuevo);return doc;}
/** Preset corregido (o el mismo si no hay corrección o si es una variante propia). */
export function corregirPreset(p){
  if(!p||typeof p.id!=='string'||p.id.startsWith('user.'))return p;
  // El original se recuerda la primera vez (nunca uno ya corregido): así «Restaurar original» lo devuelve.
  if(!originales.has(p.id)&&!p.source?.correccion)originales.set(p.id,copy(p));
  const item=doc.items[p.id];
  if(!item||item.tipo!=='preset')return p.source?.correccion&&originales.has(p.id)?copy(originales.get(p.id)):p;
  if(!originales.has(p.id))return p;
  try{const out=aplicarParchePreset(originales.get(p.id),item.parche);out.source={...out.source,correccion:item.guardado};return out;}
  catch(error){console.warn('Corrección no aplicable a '+p.id,error);return p;}
}
/** Proyecto facial con sus presets de componente corregidos. `cambiados`: ids que cambiaron. */
export function corregirProyecto(project){
  const cambiados=[];
  const presets=project.presets.map(p=>{const q=corregirPreset(p);if(q!==p&&JSON.stringify(q.channels)!==JSON.stringify(p.channels))cambiados.push(p.id);return q;});
  return {project:{...project,presets},cambiados};
}
/** Lista de presets (p. ej. BASE_PRESETS): se corrigen en su sitio. */
export function corregirLista(lista){for(let i=0;i<lista.length;i++)lista[i]=corregirPreset(lista[i]);return lista;}
/** Expresiones rápidas de la vida: POSES[nombre].cara se corrige en su sitio (guardando el original). */
export function corregirExpresionesVida(POSES){
  for(const [nombre,pose] of Object.entries(POSES)){
    const id='vida.'+nombre;if(!originales.has(id))originales.set(id,{...pose.cara});
    const item=doc.items[id];pose.cara=item?.tipo==='vida'?aplicarPose(originales.get(id),item.parche):{...originales.get(id)};
  }
}
/** Visemas sustitutos (VISEMAS_ARKIT): se corrigen en su sitio. */
export function corregirVisemas(VISEMAS){
  for(const [n,pesos] of Object.entries(VISEMAS)){
    const id='visema.'+n;if(!originales.has(id))originales.set(id,{...pesos});
    const item=doc.items[id],out=item?.tipo==='visema'?aplicarPose(originales.get(id),item.parche):{...originales.get(id)};
    for(const k of Object.keys(pesos))delete pesos[k];Object.assign(pesos,out);
  }
}
