// Vida en reposo (LifeCharacter) de un personaje de la HISTORIA: el mismo módulo para el Taller facial y para el
// motor de escenarios (SpanStories-Ciudades la importa por /vida-personaje/, sin copias).
//
// Ajuste de la historia (features/story-studio/actor-life.ts es su espejo en TypeScript):
//   {activa, animo, energia, intensidad, mirada:{modo:'camara'|'deambular'|'actor'|'punto', actorId?, punto?},
//    activo:{respiracion, parpadeo, mirada, cabeza, postura, peso, gestos, cara, pelo}}
// Cambio por momento: {animo?, energia?, mirada?} sobre el ajuste base.
import * as T from 'three';
import {LifeCharacter} from './LifeCharacter.js';
import {contractFor} from './CharacterLife.mjs';
import {detectMapping} from '../src/core/humanoid.js';
import {POSES} from './ExpresionesVida.js?v=4';
import {cargarCorrecciones,corregirExpresionesVida} from './CorreccionesFaciales.mjs';

export const ANIMOS=['tranquila','contenta','nerviosa','triste','cansada','atenta'];
export const MIRADAS=['camara','deambular','actor','punto'];
export const PARTES=['respiracion','parpadeo','mirada','cabeza','postura','peso','gestos','cara','pelo'];
export const vidaPorDefecto=()=>({activa:true,animo:'tranquila',energia:.5,intensidad:1,mirada:{modo:'deambular'},activo:Object.fromEntries(PARTES.map(k=>[k,true]))});

const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>num(n,-1e5,1e5));
function problemaMirada(m,actores){
  if(!obj(m)||!MIRADAS.includes(m.modo))return 'Mirada de la vida en reposo inválida.';
  if(m.modo==='actor'&&(typeof m.actorId!=='string'||!m.actorId||(actores&&!actores.has(m.actorId))))return 'La vida en reposo mira a un personaje que no está en la escena.';
  if(m.modo==='punto'&&!vec(m.punto))return 'La vida en reposo mira a un punto sin coordenadas.';
  if(Object.keys(m).some(k=>!['modo','actorId','punto'].includes(k)))return 'Mirada de la vida en reposo con campos desconocidos.';
  return null;
}
/** Problema del ajuste base (null = válido). */
export function problemaVida(v,actores){
  if(!obj(v))return 'Vida en reposo inválida.';
  if(Object.keys(v).some(k=>!['activa','animo','energia','intensidad','mirada','activo'].includes(k)))return 'Vida en reposo con campos desconocidos.';
  if(typeof v.activa!=='boolean'||!ANIMOS.includes(v.animo)||!num(v.energia,0,1)||!num(v.intensidad,0,1.5))return 'Ánimo, energía o intensidad de la vida en reposo inválidos.';
  if(!obj(v.activo)||Object.keys(v.activo).length!==PARTES.length||!PARTES.every(k=>typeof v.activo[k]==='boolean'))return 'Partes de la vida en reposo inválidas.';
  return problemaMirada(v.mirada,actores);
}
/** Problema del cambio por momento (null = válido). */
export function problemaCambio(v,actores){
  if(!obj(v)||!Object.keys(v).length)return 'Cambio de vida en reposo vacío.';
  if(Object.keys(v).some(k=>!['animo','energia','mirada'].includes(k)))return 'Cambio de vida en reposo con campos desconocidos.';
  if(v.animo!==undefined&&!ANIMOS.includes(v.animo))return 'Ánimo desconocido.';
  if(v.energia!==undefined&&!num(v.energia,0,1))return 'Energía fuera de 0–1.';
  return v.mirada===undefined?null:problemaMirada(v.mirada,actores);
}
export const validarVida=(v,actores)=>{const p=problemaVida(v,actores);if(p)throw Error(p);return structuredClone(v);};
export const validarCambio=(v,actores)=>{const p=problemaCambio(v,actores);if(p)throw Error(p);return structuredClone(v);};
/** Base + cambio por momento. */
export function fusionar(base,cambio){
  const out=structuredClone(base||vidaPorDefecto());if(!cambio)return out;
  if(cambio.animo)out.animo=cambio.animo;if(cambio.energia!==undefined)out.energia=cambio.energia;if(cambio.mirada)out.mirada=structuredClone(cambio.mirada);
  return out;
}

/**
 * Aplica un ajuste a un LifeCharacter ya creado. `objetivo(actorId)` devuelve el Object3D (cabeza) del otro personaje
 * para «mirar a…»; sin él, la mirada deambula.
 */
export function aplicarAjuste(vida,ajuste,{objetivo=()=>null}={}){
  vida.animo=ajuste.animo;vida.energia=ajuste.energia;vida.intensidad=ajuste.intensidad;
  for(const k of PARTES)if(k in vida.activo)vida.activo[k]=!!ajuste.activo[k];
  const m=ajuste.mirada;
  if(m.modo==='actor'){const o=objetivo(m.actorId);if(o)vida.mirarA(o);else vida.modoMirada='deambular';}
  else if(m.modo==='punto'&&m.punto)vida.mirarA(new T.Vector3(...m.punto));
  else{vida.modoMirada=m.modo;vida.objeto=null;}
  if(vida.mir)vida.mir.prox=0;
}
/** El estado actual de un LifeCharacter como ajuste de la historia (mirada elegida aparte: el cursor no es de la historia). */
export function leerAjuste(vida,mirada={modo:'deambular'}){
  return {activa:true,animo:ANIMOS.includes(vida.animo)?vida.animo:'tranquila',energia:Math.round(Math.min(1,Math.max(0,vida.energia))*100)/100,intensidad:Math.round(Math.min(1.5,Math.max(0,vida.intensidad??1))*100)/100,mirada:structuredClone(mirada),activo:Object.fromEntries(PARTES.map(k=>[k,vida.activo[k]!==false]))};
}

/** Motor: las correcciones generales del Taller facial (modo General) también valen para la vida de las historias. */
export async function prepararCorrecciones(){await cargarCorrecciones();corregirExpresionesVida(POSES);}

let rapier=null;
async function cargarRapier(){if(!rapier){const m=await import('./vendor/rapier/rapier.es.js');await m.default.init();rapier=m.default;}return rapier;}
async function perfil(id){try{const r=await fetch(new URL('./perfiles-personaje.json',import.meta.url));if(r.ok)return (await r.json()).personajes?.[id]||null;}catch{}return null;}

/**
 * Vida de un actor del motor. `root`: la raíz clonada del personaje (con sus huesos y sus morphs propios).
 * Devuelve {aplicar(ajuste), antes(), update(dt,{cuerpoOcupado}), liberar()}.
 */
export async function crearVidaActor({root,camera,characterId,ajuste,objetivo=()=>null,enReposo=fn=>fn()}){
  const nombres=[];root.traverse(o=>{if(o.isBone)nombres.push(o.name);});
  const {mapping}=detectMapping(nombres);
  if(!mapping.head||!mapping.hips)throw Error('El personaje no tiene un esqueleto humanoide reconocible para la vida en reposo.');
  const contrato=contractFor(root,{mapping});
  const prof=await perfil(characterId),opciones={camara:camera,modoMirada:'deambular'};
  // Pelo y trenza con física solo si el perfil los trae y la historia no los apagó (Rapier pesa ~1 MB).
  if(prof?.fisica?.pelo&&ajuste.activo.pelo){opciones.pelo=prof.fisica.pelo;if(prof.fisica.pelo.trenza)opciones.rapier=await cargarRapier().catch(()=>null);}
  // LifeCharacter toma como reposo la pose que encuentra: el motor le da la del modelo (enReposo).
  const vida=enReposo(()=>new LifeCharacter(root,contrato,opciones));
  vida.activo.habla=false;vida.activo.colisiones=false;vida.activo.inercia=true;
  const OCUPADO=['postura','peso','gestos','cabeza','mirada','inercia','respiracion'];
  let actual=null;
  const api={
    vida,
    aplicar(nuevo){actual=structuredClone(nuevo);aplicarAjuste(vida,nuevo,{objetivo});},
    /** Antes del mezclador: huesos y morphs de la vida en reposo. */
    antes(){vida.antes();},
    /** Después del mezclador. cuerpoOcupado = un clip mueve el esqueleto: la vida deja el cuerpo y conserva la cara. */
    update(dt,{cuerpoOcupado=false}={}){
      if(!actual?.activa)return;
      const guardado={};if(cuerpoOcupado)for(const k of OCUPADO){guardado[k]=vida.activo[k];vida.activo[k]=false;}
      vida.update(Math.min(dt,.1));
      if(cuerpoOcupado)Object.assign(vida.activo,guardado);
    },
    /** Deja huesos y morphs como estaban (el actor vuelve a su pose de la historia). */
    liberar(){try{vida.antes();}catch{}vida.cuerpo?.liberar?.();}
  };
  api.aplicar(ajuste);
  return api;
}
