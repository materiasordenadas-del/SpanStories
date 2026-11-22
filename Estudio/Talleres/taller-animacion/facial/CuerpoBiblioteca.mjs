// Cuerpo desde la biblioteca de mocap: lee un clip FBX de biblioteca/paquetes y lo traslada al esqueleto del
// personaje que ya está cargado en el Taller facial.
//
// Es el mismo camino que sigue el Taller de animación (clipFromAnimation → clip canónico → Rig.applyCanonical),
// pero sin tocar src/main.js ni los paneles:
//   1. el FBX se pide a `/bib/paquetes/<ruta codificada>` (el mismo servicio que usa el Taller);
//   2. se lee con el FBXLoader de three.js (servido por `/ecosystem/vendor/…`) y su esqueleto se mide con `Rig`;
//   3. `clipFromAnimation` lo pasa a un clip canónico, independiente de los huesos del origen;
//   4. se aplica fotograma a fotograma al `Rig` del personaje y se hornea en un AnimationClip que lleva los
//      huesos del personaje (pistas por uuid, como `bakeAnimationClip` del Taller).
// El rostro no se toca: lo gobiernan las shape keys.
import {urlDeCuerpo} from './ActuacionesCotidianas.mjs';

const FPS=30;
const cache=new Map();
let listaBiblioteca=null;   // /api/biblioteca, una vez por sesión   // ruta → clip canónico del FBX (leer y medir el FBX es lo caro; aplicarlo a otro personaje no)

/**
 * Carga el FBX de `body` ({raiz,ruta}) y devuelve su clip canónico (cacheado).
 * @param {object} o {API: origen del servicio del Taller, T: three, Rig: clase Rig, clipModule: /ecosystem/body/clip.js}
 */
export async function clipCanonico(body,{API,T,Rig,clipModule}){
  const clave=body.raiz+'/'+body.ruta;
  if(cache.has(clave))return cache.get(clave);
  const promesa=(async()=>{
    // /bib/ lo sirve el propio Taller (mismo origen que esta página); sin cabeceras CORS, así que se pide con location.origin.
    listaBiblioteca??=fetch(location.origin+'/api/biblioteca').then(r=>{if(!r.ok)throw Error('No se pudo leer la lista de la biblioteca.');return r.json();});
    const respuesta=await fetch(urlDeCuerpo(body,await listaBiblioteca,location.origin));
    if(!respuesta.ok)throw Error('No se pudo leer el clip de la biblioteca: '+body.ruta);
    const buffer=await respuesta.arrayBuffer();
    let origen,animaciones;
    if(/\.glb$/i.test(body.ruta)){
      // GLB (p. ej. «Conversations Michael 8», convertido desde el FBX de Daz con Blender): el GLTFLoader ya está en el mapa de importación.
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const g=await new GLTFLoader().parseAsync(buffer,'');
      origen=g.scene;animaciones=g.animations;
    }else{
      const {FBXLoader}=await import(API+'/ecosystem/vendor/loaders/FBXLoader.js');
      origen=new FBXLoader().parse(buffer,'');animaciones=origen.animations;
    }
    const animacion=animaciones?.[0];
    if(!animacion)throw Error('El archivo no trae animación: '+body.ruta);
    const rigOrigen=new Rig(origen);
    if(!rigOrigen.humanoid)throw Error('El esqueleto del clip no se reconoce como humanoide: '+body.ruta);
    const id='daily:'+clave;
    const canonico=clipModule.clipFromAnimation(origen,animacion,{id,name:body.ruta.split('/').pop().replace(/\.[^.]+$/,''),rig:rigOrigen,source:'biblioteca',loopPorNombre:true});
    return cerrarBucle(recortarSaltos(canonico));
  })();
  cache.set(clave,promesa);
  try{return await promesa;}catch(error){cache.delete(clave);throw error;}
}

// ---------- Limpieza del mocap ----------
// Casi todos los FBX/GLB de biblioteca/paquetes traen el primer fotograma (o los dos primeros) en la pose de enlace
// (pose T) y algunos también el último: al reproducirlos el personaje saltaba a la pose T en cada vuelta.
const SALTO=30;     // grados por fotograma (30 fps): más que esto en un extremo del clip no es movimiento, es la pose de enlace
const EXTREMO=15;   // fotogramas de cada extremo en los que se buscan esos saltos

function anguloQ(a,i,b,j){const d=a[i*4]*b[j*4]+a[i*4+1]*b[j*4+1]+a[i*4+2]*b[j*4+2]+a[i*4+3]*b[j*4+3];return 2*Math.acos(Math.min(1,Math.abs(d)))*180/Math.PI;}
/** Mayor giro de cualquier hueso entre los fotogramas i e i+1. */
function paso(c,i){let m=0;for(const k in c.tracks)m=Math.max(m,anguloQ(c.tracks[k],i,c.tracks[k],i+1));return m;}
function conFotogramas(c,desde,hasta,extra={}){
  const frames=hasta-desde+1,tracks={};
  for(const k in c.tracks)tracks[k]=c.tracks[k].slice(desde*4,(hasta+1)*4);
  return {...c,...extra,frames,tracks,hips:c.hips?c.hips.slice(desde*3,(hasta+1)*3):null,duration:(frames-1)/c.fps};
}

/** Quita los fotogramas de pose de enlace del principio y del final (saltos bruscos en los extremos). Función pura. */
export function recortarSaltos(c){
  const n=c.frames;if(n<4)return c;
  let desde=0,hasta=n-1;
  for(let i=0;i<Math.min(EXTREMO,n-2);i++)if(paso(c,i)>SALTO)desde=i+1;
  for(let i=n-2;i>=Math.max(desde+1,n-1-EXTREMO);i--)if(paso(c,i)>SALTO)hasta=i;
  if(hasta-desde<2||(desde===0&&hasta===n-1))return c;
  return conFotogramas(c,desde,hasta,{recorte:[desde,n-1-hasta]});
}

/** Slerp de a[i] hacia signo·b[j]. El signo lo fija quien llama una vez por pista: si se eligiera el camino corto en
 *  cada fotograma, un hueso a ~180° del destino saltaría de un camino al otro entre fotogramas. */
function slerp(a,i,b,j,t,out,o,signo){
  const ax=a[i*4],ay=a[i*4+1],az=a[i*4+2],aw=a[i*4+3],bx=signo*b[j*4],by=signo*b[j*4+1],bz=signo*b[j*4+2],bw=signo*b[j*4+3];
  const d=Math.max(-1,Math.min(1,ax*bx+ay*by+az*bz+aw*bw));
  let s0=1-t,s1=t;if(Math.abs(d)<.9995){const th=Math.acos(d),s=Math.sin(th);s0=Math.sin((1-t)*th)/s;s1=Math.sin(t*th)/s;}
  const x=s0*ax+s1*bx,y=s0*ay+s1*by,z=s0*az+s1*bz,w=s0*aw+s1*bw,l=Math.hypot(x,y,z,w)||1;
  out[o*4]=x/l;out[o*4+1]=y/l;out[o*4+2]=z/l;out[o*4+3]=w/l;
}

/**
 * Hace que el clip se pueda repetir sin saltos: el último tramo (hasta `segundos`) se funde con suavidad hacia el
 * primer fotograma, de modo que la vuelta al principio es continua. Así ninguna actuación se queda congelada en su
 * último fotograma ni da un tirón al repetirse. Si el clip ya cierra (≤ 2°), no se toca. Función pura.
 */
export function cerrarBucle(c,segundos=.6){
  const n=c.frames;if(n<4)return {...c,loop:true};
  let cierre=0;for(const k in c.tracks)cierre=Math.max(cierre,anguloQ(c.tracks[k],0,c.tracks[k],n-1));
  const dh=c.hips?Math.hypot(c.hips[(n-1)*3+1]-c.hips[1],0):0;
  if(cierre<=2&&dh<.01)return {...c,loop:true};
  const L=Math.max(2,Math.min(Math.round(segundos*c.fps),Math.floor((n-1)/3)));
  const tracks={};
  for(const k in c.tracks){
    const a=c.tracks[k],out=Float32Array.from(a);
    const i0=n-L-1,signo=a[i0*4]*a[0]+a[i0*4+1]*a[1]+a[i0*4+2]*a[2]+a[i0*4+3]*a[3]<0?-1:1;   // pistas ya continuas en signo
    for(let f=n-L;f<n;f++){const u=(f-(n-L)+1)/L,w=u*u*(3-2*u);slerp(a,f,a,0,w,out,f,signo);}
    // continuidad del signo con el fotograma anterior (la interpolación del reproductor no da la vuelta larga)
    for(let f=1;f<n;f++){const d=out[f*4-4]*out[f*4]+out[f*4-3]*out[f*4+1]+out[f*4-2]*out[f*4+2]+out[f*4-1]*out[f*4+3];if(d<0)for(let j=0;j<4;j++)out[f*4+j]=-out[f*4+j];}
    tracks[k]=out;
  }
  let hips=c.hips;
  if(hips){
    // x/z: el avance se quita al reproducir en el sitio; se funde y (altura) y el balanceo hacia el inicio.
    hips=Float32Array.from(hips);const dx=hips[(n-1)*3]-hips[0],dz=hips[(n-1)*3+2]-hips[2];
    for(let f=n-L;f<n;f++){const u=(f-(n-L)+1)/L,w=u*u*(3-2*u),k=f/(n-1);
      hips[f*3]+=(hips[0]+dx*k-hips[f*3])*w;hips[f*3+1]+=(hips[1]-hips[f*3+1])*w;hips[f*3+2]+=(hips[2]+dz*k-hips[f*3+2])*w;}
  }
  return {...c,tracks,hips,loop:true,bucleFundido:L};
}

/**
 * Hornea un clip canónico sobre el rig del personaje.
 * Sin avance en el suelo (x/z): el personaje se queda en su sitio y conserva el balanceo de la cadera.
 * @returns {{clip: AnimationClip, duracion: number, bucle: boolean}}
 */
export function hornearEnPersonaje(canonico,{T,rig,sampleClip,newPose,nombre}){
  if(!rig.humanoid)throw Error('Este personaje necesita un esqueleto humanoide para recibir el movimiento.');
  const n=canonico.frames,duracion=canonico.duration||(n-1)/FPS,pose=newPose();
  const bones=rig.bones,cuaterniones=bones.map(()=>new Float32Array(n*4)),posCadera=new Float32Array(n*3),tiempos=new Float32Array(n);
  const caderaIdx=bones.indexOf(rig.bone('hips'));
  for(let i=0;i<n;i++){
    sampleClip(canonico,i/canonico.fps,pose,{inPlace:{x:true,z:true}});
    rig.applyCanonical(pose);
    tiempos[i]=i/canonico.fps;
    bones.forEach((b,j)=>b.quaternion.toArray(cuaterniones[j],i*4));
    if(caderaIdx>=0)bones[caderaIdx].position.toArray(posCadera,i*3);
  }
  rig.resetToRest();
  const pistas=[];
  bones.forEach((b,j)=>{
    if(!rig.canonOf.has(b))return;
    pistas.push(new T.QuaternionKeyframeTrack(`${b.uuid}.quaternion`,tiempos,cuaterniones[j]));
    if(j===caderaIdx)pistas.push(new T.VectorKeyframeTrack(`${b.uuid}.position`,tiempos,posCadera));
  });
  const clip=new T.AnimationClip(nombre,Math.max(duracion,1/canonico.fps),pistas);
  return {clip,duracion:clip.duration,bucle:!!canonico.loop};
}

/**
 * Obliga al mezclador a escribir todos sus huesos en el próximo `update`.
 * three.js (PropertyMixer.apply) solo escribe un hueso si su valor cambió respecto al fotograma anterior. Pero la vida
 * (`vida.antes()`) devuelve cada fotograma todos los huesos a reposo antes de aplicar el cuerpo: en los tramos en que el
 * mocap se queda quieto el mezclador no reescribía y el personaje saltaba a la pose T («se traba»). Al marcar con NaN
 * las dos ranuras de acumulación, la comparación siempre da distinto y el hueso se reescribe.
 */
export function forzarEscritura(mixer){
  for(const b of mixer?._bindings||[]){const n=b.valueSize;b.buffer.fill(NaN,n,n*3);}
}

/**
 * Tiempo del clip para el instante `ahora` (ms), con `inicio` como arranque: en bucle da la vuelta; si no,
 * se queda en el último fotograma. Función pura (la usa el bucle de dibujo y se puede probar sin navegador).
 */
export function tiempoDeCuerpo(ahora,inicio,duracion,repetir){
  const t=Math.max(0,(ahora-inicio)/1000);
  return repetir&&duracion>0?t%duracion:Math.min(t,duracion);
}
