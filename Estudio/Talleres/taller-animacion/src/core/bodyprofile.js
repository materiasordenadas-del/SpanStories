// Preparación del cuerpo de un personaje al cargarlo, igual en el Taller de Animación y en el Taller facial.
//
// El concepto es general (vale para cualquier rig humanoide Mixamo o compatible); lo propio de cada modelo
// son DATOS en `perfiles-personaje.json` → personajes.<id>.cuerpo, nunca código por personaje:
//
//   "cuerpo": {
//     "articulaciones": { "extension": 60, "flexion": 70, "cubital": 30, "radial": 20,
//                         "pronacion": 90, "supinacion": 95, "humero": 40,
//                         "claviculaDesde": 35, "claviculaParte": 0.22 },
//     "axilas": { "radio": 0.9, "iteraciones": 24, "fuerza": 0.55 },     // o false para no suavizar
//     "accesorios": { "margen": 0.012 }                                  // o false para no detectarlos
//   }
//
// Todo es opcional: lo que falte usa el valor general. Grados para las articulaciones; `radio` en
// longitudes de brazo, `margen` en alturas de cadera.
import {setArmLimits} from './acting.js';
import {smoothArmpitWeights} from './skinfix.js';
import {installAccessoryCollisions} from './accessories.js';

const JOINTS={extension:'ext',flexion:'flex',cubital:'ulnar',radial:'radial',humero:'humerus',claviculaDesde:'clavicleFrom',claviculaParte:'clavicleShare'};

/** Ajustes de articulaciones del perfil → límites del motor (solo los que vienen). */
export function jointLimitsFrom(profile){
  const a=profile?.articulaciones;if(!a||typeof a!=='object')return null;
  const out={};
  for(const [es,key] of Object.entries(JOINTS))if(Number.isFinite(a[es]))out[key]=a[es];
  if(Number.isFinite(a.pronacion))out.supMin=-Math.abs(a.pronacion);
  if(Number.isFinite(a.supinacion))out.supMax=Math.abs(a.supinacion);
  return Object.keys(out).length?out:null;
}

/**
 * @param root personaje cargado · @param rig su Rig humanoide · @param profile personajes.<id>.cuerpo (o nada)
 * @returns resumen de lo aplicado (para mostrarlo o comprobarlo)
 */
export function prepareCharacterBody(root,rig,profile={}){
  const report={limits:null,armpits:null,accessories:null};if(!rig?.humanoid)return report;
  report.limits=jointLimitsFrom(profile);setArmLimits(rig,report.limits);
  // Preserve authored weights and geometry for explicitly marked source models.
  if(root?.userData?.spanstoriesPreserveModel===true)return report;
  const ax=profile?.axilas;
  if(ax!==false)report.armpits=smoothArmpitWeights(root,rig,{...(Number.isFinite(ax?.radio)&&{radius:ax.radio}),...(Number.isFinite(ax?.iteraciones)&&{iterations:ax.iteraciones}),...(Number.isFinite(ax?.fuerza)&&{strength:ax.fuerza})});
  const ac=profile?.accesorios;
  if(ac!==false){const r=installAccessoryCollisions(root,rig,Number.isFinite(ac?.margen)?{margin:ac.margen}:{});report.accessories={count:r.accessories.length,hair:r.hair.length};}
  return report;
}
