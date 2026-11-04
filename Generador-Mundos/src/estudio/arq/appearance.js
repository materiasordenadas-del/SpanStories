// Apariencia registrada: colores sin variación aleatoria y materiales antes que estilo.
import * as THREE from 'three';
import {SURF} from '../geom/mesh.js';

const WALL={brick:'#b56a4c',stone:'#d8ccb4',concrete:'#bdbbb6',wood:'#8a6548',metal:'#9aa4ad',glass:'#6f8fae',plaster:'#ece7dd',render:'#ece7dd'};
const ROOF={roof_tiles:'#b85c3a',tile:'#b85c3a',tiles:'#b85c3a',slate:'#5e6670',metal:'#9aa4ad',zinc:'#9aa4ad',copper:'#7fa79a',concrete:'#bdb7ac',asphalt:'#43474c',tar_paper:'#43474c',roofing_felt:'#52565a',wood:'#80634a',grass:'#67905b',stone:'#aaa797'};
const materialKey=value=>String(value??'').trim().toLowerCase();
export function safeColor(text,fallback){
  if(!text)return fallback;
  let value=String(text).trim().toLowerCase();
  if(/^[0-9a-f]{6}$/.test(value))value='#'+value;
  if(!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(value)&&!Object.hasOwn(THREE.Color.NAMES,value))return fallback;
  return new THREE.Color(value);
}
export function wallColour(b,fallback){return safeColor(b.colour,WALL[materialKey(b.material)]?new THREE.Color(WALL[materialKey(b.material)]):fallback);}
export function roofColour(b,fallback){return safeColor(b.roof?.colour,ROOF[materialKey(b.roof?.material)]?new THREE.Color(ROOF[materialKey(b.roof.material)]):fallback);}
export function wallSurface(b,fallback){
  const mat=materialKey(b.material);
  if(mat==='brick')return 14;
  if(mat==='stone')return 21;
  if(['plaster','render','concrete','wood','metal','glass'].includes(mat))return SURF.wall;
  return fallback;
}
export function roofSurfaceType(b,fallback){
  const mat=materialKey(b.roof?.material);
  if(['roof_tiles','tile','tiles'].includes(mat))return 13;
  if(mat==='slate')return 17;
  return mat?SURF.roof:fallback;
}
