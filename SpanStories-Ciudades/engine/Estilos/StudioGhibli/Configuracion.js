import * as T from '../../three.js';

export const controles = [
  {clave:'uGPintura',nombre:'Textura de pintura',min:0,max:1,paso:.05},
  {clave:'uGMasas',nombre:'Masas de follaje',min:0,max:1,paso:.05},
  {clave:'uGSuavidad',nombre:'Suavidad de luz',min:.1,max:.8,paso:.05},
  {clave:'uGCalidez',nombre:'Calidez',min:0,max:1,paso:.05},
  {clave:'uGHumedad',nombre:'Humedad del aire',min:0,max:1,paso:.05},
  {clave:'uGAtmosfera',nombre:'Profundidad atmosférica',min:0,max:2,paso:.05},
  {clave:'uEstiloTrazo',nombre:'Contornos delicados',min:0,max:1,paso:.05},
];

export function crearUniformes(){return {
  uGPintura:{value:.65},uGMasas:{value:.75},uGSuavidad:{value:.5},uGCalidez:{value:.5},
  uGHumedad:{value:.35},uGAtmosfera:{value:1},uGLluvia:{value:0},uGAtardecer:{value:0},
  uGAire:{value:new T.Color('#afc7c8')},uGSombra:{value:new T.Color('#77939a')},
  uGCenit:{value:new T.Color('#91bed6')},uGHorizonte:{value:new T.Color('#d7e2dc')},
  uGNubeLuz:{value:new T.Color('#f5f0e4')},uGNubeSombra:{value:new T.Color('#779aa8')},
  uGNubes:{value:null},uGNubesCompactas:{value:null},uGNubesAlargadas:{value:null},uGNubesListas:{value:0},uGCieloLuz:{value:1},
};}

const paletas = {
  manana:['#91bed6','#d7e2dc','#f5f0e4','#779aa8','#afc7c8','#77939a',1],
  mediodia:['#83b9d5','#dbe6dc','#fff9e6','#88a6b3','#b1cbce','#7c969b',1],
  tarde:['#9ebdce','#e6d4b6','#ffe4b9','#9c9eb3','#c5c4ba','#8c8f9c',1],
  atardecer:['#7d91b0','#efbf9e','#ffdfb0','#8a88a6','#b5abb7','#7c7898',.85],
  nublado:['#a2b9c1','#d0d8d0','#e1e5de','#839da5','#adc1c4','#7a9395',.88],
  lluvia:['#7f9da8','#b5c4c4','#ccd5cf','#68858f','#9db5ba','#6f8992',.78],
  noche:['#1b304d','#405870','#7c919e','#344b68','#3d566a','#6d7e9c',.32],
};

export function entorno({ambiente,variante,uniformes:u}) {
  const key=paletas[variante]?variante:ambiente,p=paletas[key]||paletas.manana;
  for(const [i,name] of ['uGCenit','uGHorizonte','uGNubeLuz','uGNubeSombra','uGAire','uGSombra'].entries())u[name].value.set(p[i]);
  u.uGLluvia.value=key==='lluvia'?1:0;u.uGAtardecer.value=key==='atardecer'?1:0;u.uGCieloLuz.value=p[6];
  return {cenit:p[0],horizonte:p[1],nube:p[2],nubes:1,luz:p[6],gestionaAmbiente:true};
}
