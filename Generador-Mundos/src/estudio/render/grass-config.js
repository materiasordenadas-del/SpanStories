// Metros y matas/m². Los estilos comparten estas dimensiones y distribución.
// «Alto» reproduce la demo web de James Smyth: 150 000 hojas en un disco de 15 m
// de radio ≈ 212 hojas/m² (72 matas × 3 hojas), 0,1 m de ancho y 0,8–1,4 m de alto.
export const GRASS_PRESETS={
  bajo:{density:30,blades:3,lod1Density:.08,maxInstances:14000,maxTriangles:120000,windQuality:0},
  medio:{density:50,blades:3,lod1Density:.1,maxInstances:26000,maxTriangles:230000,windQuality:0},
  alto:{density:72,blades:3,lod1Density:.12,maxInstances:40000,maxTriangles:360000,windQuality:0},
  ultra:{density:100,blades:3,lod1Density:.15,maxInstances:60000,maxTriangles:540000,windQuality:0},
};
export const GRASS_DEFAULTS={
  // Forma y viento de la web: altura media 1,1 m ± 0,3, ancho 0,1, punta desplazada 0,1,
  // 0,3 m de vaivén en la punta, onda de 37,7 m (waveSize 5 sobre 30 m) a 2 rad/s.
  enabled:true,preset:'alto',height:1.1,width:.1,curvature:.1,sizeVariation:.27,blades:3,smallClumps:0,
  density:72,spacing:.1,clumping:0,clumpSize:2.5,irregularity:1,regionalVariation:0,orientation:0,seed:442099,mask:true,
  root:'#315626',main:'#72a53b',tip:'#c2d66b',colorVariation:.22,gradient:.65,rootShade:.3,lighting:1,translucency:.18,groundBlend:1,
  wind:true,windDirection:0,windStrength:.3,windSpeed:2,windFrequency:1,windWavelength:37.7,windSpatial:0,flexibility:1,windQuality:0,
  lod0:20,lod1:50,transition:5,lod1Density:.12,reference:'camera',chunkSize:4,culling:true,
  maxInstances:40000,maxTriangles:360000,chunksPerFrame:3,adaptive:false,targetFPS:50,shadows:false,interaction:false,
  debugChunks:false,debugLOD:false,
};
const ranges={height:[.02,2],width:[.01,.18],curvature:[0,.5],sizeVariation:[0,.9],blades:[1,6],smallClumps:[0,1],density:[1,100],spacing:[.05,1],clumping:[0,1],clumpSize:[.5,12],irregularity:[0,1],regionalVariation:[0,1],orientation:[0,360],seed:[0,2147483647],colorVariation:[0,1],gradient:[0,1],rootShade:[0,.8],lighting:[.2,1.5],translucency:[0,.5],groundBlend:[0,1],windDirection:[0,360],windStrength:[0,.8],windSpeed:[0,5],windFrequency:[.1,3],windWavelength:[2,60],windSpatial:[0,1],flexibility:[0,2],windQuality:[0,1],lod0:[2,50],lod1:[3,100],transition:[.25,15],lod1Density:[0,.3],chunkSize:[2,10],maxInstances:[1000,100000],maxTriangles:[5000,1000000],chunksPerFrame:[1,8],targetFPS:[20,120]};
const integers=new Set(['blades','seed','windQuality','maxInstances','maxTriangles','chunksPerFrame']);
export function grassConfig(input={},base=GRASS_DEFAULTS){
  const out={...base};
  for(const key of Object.keys(GRASS_DEFAULTS)){
    if(!(key in input))continue;
    const value=input[key];
    if(ranges[key]){const n=Number(value);if(!Number.isFinite(n))throw Error('Parámetro de césped inválido: '+key);out[key]=Math.max(ranges[key][0],Math.min(ranges[key][1],integers.has(key)?Math.round(n):n));}
    else if(typeof GRASS_DEFAULTS[key]==='boolean'){if(typeof value!=='boolean')throw Error('Se esperaba una casilla: '+key);out[key]=value;}
    else if(['root','main','tip'].includes(key)){if(!/^#[\da-f]{6}$/i.test(value))throw Error('Color inválido: '+key);out[key]=value;}
    else if(key==='reference'){if(!['camera','character'].includes(value))throw Error('Referencia inválida');out[key]=value;}
    else if(key==='preset'){if(!['bajo','medio','alto','ultra','personalizado'].includes(value))throw Error('Calidad inválida');out[key]=value;}
  }
  out.lod1=Math.max(out.lod0+1,out.lod1);out.transition=Math.min(out.transition,out.lod0*.5,(out.lod1-out.lod0)*.5);
  return out;
}
export function seededGrass(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function chunkSeed(x,z,seed){return (Math.imul(x,73856093)^Math.imul(z,19349663)^seed)>>>0;}
// Fracción de matas cercanas que se dibujan a una distancia; el shader la replica.
export function grassKeep(d){return d<=12?1:Math.pow(12/d,1.5);}
export function chunkDistance(x,z,size,px,pz){return Math.hypot(Math.max(x*size-px,0,px-(x+1)*size),Math.max(z*size-pz,0,pz-(z+1)*size));}
export function grassLOD(distance,c,previous=2){
  // Histéresis de gestión; el shader aplica los límites radiales exactos.
  const h=.5;
  if(distance>=c.lod1+(previous<2?h:0))return 2;
  if(distance<c.lod0+(previous===0?h:0))return 0;
  return 1;
}
