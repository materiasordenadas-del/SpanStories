// Portable ARKit curves. No renderer, skeleton, geometry or Blender dependency.
import {validateMovement} from './FacialMovement.mjs';
import {validateActing} from './ActingLibrary.mjs';
export const ARKIT = Object.freeze(('eyeBlinkLeft eyeLookDownLeft eyeLookInLeft eyeLookOutLeft eyeLookUpLeft eyeSquintLeft eyeWideLeft eyeBlinkRight eyeLookDownRight eyeLookInRight eyeLookOutRight eyeLookUpRight eyeSquintRight eyeWideRight jawForward jawLeft jawRight jawOpen mouthClose mouthFunnel mouthPucker mouthRight mouthLeft mouthSmileLeft mouthSmileRight mouthFrownLeft mouthFrownRight mouthDimpleLeft mouthDimpleRight mouthStretchLeft mouthStretchRight mouthRollLower mouthRollUpper mouthShrugLower mouthShrugUpper mouthPressLeft mouthPressRight mouthLowerDownLeft mouthLowerDownRight mouthUpperUpLeft mouthUpperUpRight browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff cheekSquintLeft cheekSquintRight noseSneerLeft noseSneerRight tongueOut').split(' '));
const own = (o,k) => Object.hasOwn(o,k);
export const clamp = (v,a=0,b=1) => Math.min(b,Math.max(a,v));
const finite = (v,a,b) => typeof v === 'number' && Number.isFinite(v) && v>=a && v<=b;
export const copy = v => JSON.parse(JSON.stringify(v));
export function validatePreset(p) {
  if (!p || p.schema!=='spanstories.facial-animation' || p.version!==1 || p.rig!=='ARKit-52' || p.timeUnit!=='seconds') throw Error('Formato facial o versión no compatible.');
  for (const k of ['id','name','category']) if (typeof p[k]!=='string' || !p[k].trim() || p[k].length>160) throw Error('Metadato inválido: '+k);
  if (!finite(p.duration,.05,600) || typeof p.loop!=='boolean' || !['linear','smoothstep','spline'].includes(p.interpolation)) throw Error('Duración, bucle o interpolación inválidos.');
  if (!p.source || !['original','imported'].includes(p.source.kind) || typeof p.source.license!=='string' || !p.source.license.trim()) throw Error('Falta procedencia/licencia.');
  if (!Array.isArray(p.tags) || p.tags.length>40 || p.tags.some(t=>typeof t!=='string'||t.length>100)) throw Error('Etiquetas inválidas.');
  if (!p.channels || typeof p.channels!=='object' || Array.isArray(p.channels) || !Object.keys(p.channels).length) throw Error('Faltan curvas.');
  let total=0;
  for (const [name,keys] of Object.entries(p.channels)) {
    if (!ARKIT.includes(name)) throw Error('Canal desconocido: '+name);
    if (!Array.isArray(keys) || keys.length<2 || keys.length>20000 || (total+=keys.length)>100000) throw Error('Cantidad de claves inválida.');
    let last=-1;
    for (const key of keys) {
      if (!Array.isArray(key)||key.length!==2||!finite(key[0],0,p.duration)||!finite(key[1],0,1)||key[0]<=last) throw Error('Claves fuera de rango o desordenadas: '+name);
      last=key[0];
    }
    if (keys[0][0]!==0 || Math.abs(last-p.duration)>1e-6) throw Error('Cada curva debe cubrir 0 y duración: '+name);
    if (p.loop && Math.abs(keys[0][1]-keys.at(-1)[1])>1e-6) throw Error('Bucle con salto: '+name);
  }
  if(p.intensity!==undefined&&(!p.intensity||!finite(p.intensity.reference,.1,1)||!Array.isArray(p.intensity.soft)||p.intensity.soft.some(c=>!ARKIT.includes(c))))throw Error('Modelo de intensidad inválido.');
  if(p.defaults!==undefined)validateInstance({...p.defaults,id:'defaults',presetId:p.id,start:0},[p]);
  return p;
}
// Pendientes monótonas (Fritsch–Carlson): la curva pasa por las claves sin frenar en cada una y sin salirse de su rango.
const tangents=new WeakMap();
function slopes(keys){
  let m=tangents.get(keys);if(m)return m;
  const n=keys.length,d=[];m=new Float64Array(n);
  for(let i=0;i<n-1;i++)d.push((keys[i+1][1]-keys[i][1])/(keys[i+1][0]-keys[i][0]));
  for(let i=1;i<n-1;i++)if(d[i-1]*d[i]>0){const a=keys[i][0]-keys[i-1][0],b=keys[i+1][0]-keys[i][0];m[i]=3*(a+b)/((2*b+a)/d[i-1]+(b+2*a)/d[i]);}
  tangents.set(keys,m);return m;
}
export function curve(keys,t,interpolation='smoothstep') {
  if (t<=keys[0][0]) return keys[0][1];
  if (t>=keys.at(-1)[0]) return keys.at(-1)[1];
  let lo=0,hi=keys.length-1;
  while (hi-lo>1) {const mid=(lo+hi)>>1;if(keys[mid][0]<=t)lo=mid;else hi=mid;}
  const span=keys[hi][0]-keys[lo][0];let u=(t-keys[lo][0])/span;
  if(interpolation==='spline'){
    const m=slopes(keys),u2=u*u,u3=u2*u;
    return clamp((2*u3-3*u2+1)*keys[lo][1]+(u3-2*u2+u)*span*m[lo]+(-2*u3+3*u2)*keys[hi][1]+(u3-u2)*span*m[hi]);
  }
  if(interpolation==='smoothstep')u=u*u*(3-2*u);
  return clamp(keys[lo][1]+(keys[hi][1]-keys[lo][1])*u);
}
export function validateInstance(i,presets) {
  const p=presets.find(p=>p.id===i?.presetId);
  if(!p || typeof i.id!=='string' || !i.id || !finite(i.start,0,3600) || !finite(i.duration,.05,600) || i.start+i.duration>3600 || !finite(i.intensity,0,1) || !finite(i.fadeIn,0,i.duration) || !finite(i.fadeOut,0,i.duration) || i.fadeIn+i.fadeOut>i.duration || !finite(i.trimStart,0,p.duration) || !finite(i.trimEnd,0,p.duration) || i.trimStart>=i.trimEnd || !Number.isInteger(i.priority) || Math.abs(i.priority)>100 || !['override','additive'].includes(i.blend) || typeof i.loop!=='boolean' || (i.mask!==undefined&&(!Array.isArray(i.mask)||i.mask.some(c=>!ARKIT.includes(c))))) throw Error('Clip facial inválido.');
  validateMovement(i.movement,i.duration);
  if(i.acting!==undefined)validateActing(i.acting);
  return i;
}
export function evaluate(presets,instances,time) {
  const out=Object.fromEntries(ARKIT.map(n=>[n,0]));
  for(const i of [...instances].sort((a,b)=>a.priority-b.priority||a.start-b.start||a.id.localeCompare(b.id))) {
    const p=presets.find(p=>p.id===i.presetId),elapsed=time-i.start;
    if(!p||elapsed<0||elapsed>=i.duration)continue;
    const span=i.trimEnd-i.trimStart;
    const local=i.trimStart+(i.loop?(elapsed%span):elapsed/i.duration*span);
    const smooth=u=>{u=clamp(u);return u*u*(3-2*u);};
    const opacity=(i.fadeIn?smooth(elapsed/i.fadeIn):1)*(i.fadeOut?smooth((i.duration-elapsed)/i.fadeOut):1);
    // Override fades interpolate layers; additive is explicitly clamped. No blind sums.
    const channels=i.mask||ARKIT;
    // Actuaciones: las curvas guardan el aspecto a la intensidad de referencia; por encima se exagera.
    // Parpadeos y mirada apenas dependen de la intensidad: un parpadeo a medias no es un gesto más suave.
    const gain=p.intensity?i.intensity/p.intensity.reference:i.intensity,soft=p.intensity?Math.min(1.15,Math.pow(gain,.35)):gain;
    for(const n of channels) {
      const value=own(p.channels,n)?curve(p.channels[n],local,p.interpolation)*(p.intensity?.soft.includes(n)?soft:gain):0;
      out[n]=clamp(i.blend==='additive'?out[n]+value*opacity:out[n]*(1-opacity)+value*opacity);
    }
  }
  return out;
}
const normalized=n=>n.toLowerCase().replace(/[^a-z0-9]/g,'');
export function profile(root,aliases={}) {
  const bindings=Object.fromEntries(ARKIT.map(n=>[n,[]])),meshes=[],ambiguous=[];
  const measurable=new Set(),functional=new Set();
  root.traverse(m=>{
    if(!m.isMesh||!m.morphTargetDictionary||!m.morphTargetInfluences)return;
    const found=[];
    for(const canonical of ARKIT) {
      const exact=aliases[canonical]||canonical;
      const names=Object.keys(m.morphTargetDictionary).filter(n=>normalized(n)===normalized(exact));
      if(names.length>1){ambiguous.push({mesh:m.name,channel:canonical,names});continue;}
      if(names.length===1){const index=m.morphTargetDictionary[names[0]];if(Number.isInteger(index)&&index>=0&&index<m.morphTargetInfluences.length){
        bindings[canonical].push({mesh:m,index,original:names[0]});found.push(canonical);
        const attr=m.geometry?.morphAttributes?.position?.[index],base=m.geometry?.attributes?.position;
        if(attr&&base){measurable.add(canonical);for(let v=0;v<attr.count;v++){
          const dx=attr.getX(v)-(m.geometry.morphTargetsRelative?0:base.getX(v));
          const dy=attr.getY(v)-(m.geometry.morphTargetsRelative?0:base.getY(v));
          const dz=attr.getZ(v)-(m.geometry.morphTargetsRelative?0:base.getZ(v));
          if(Math.hypot(dx,dy,dz)>1e-8){functional.add(canonical);break;}
        }}
      }}
    }
    meshes.push({name:m.name,channels:found,targetCount:m.morphTargetInfluences.length});
  });
  const present=ARKIT.filter(n=>bindings[n].length),missing=ARKIT.filter(n=>!bindings[n].length);
  const zeroDelta=present.filter(n=>measurable.has(n)&&!functional.has(n));
  return {bindings,report:{schema:'spanstories.arkit-profile',version:1,present,missing,ambiguous,meshes,zeroDelta,unmeasured:present.filter(n=>!measurable.has(n)),functional:[...functional],logicalRange:[0,1],visualApproval:false}};
}
// Fuerza de cada shape key en un personaje. Dos rostros con los mismos canales ARKit no se mueven lo
// mismo: uno levanta la ceja 3 mm y otro 9. `gain` multiplica cada canal (1 = tal cual) y se edita en
// el panel; `suggestGain` propone valores midiendo el desplazamiento real frente a la distancia entre ojos.
export const GAIN_MAX=3;
const EXPRESSIVE={browInnerUp:.17,browOuterUpLeft:.15,browOuterUpRight:.15,browDownLeft:.13,browDownRight:.13,eyeWideLeft:.066,eyeWideRight:.066,eyeSquintLeft:.05,eyeSquintRight:.05,
  cheekSquintLeft:.1,cheekSquintRight:.1,noseSneerLeft:.078,noseSneerRight:.078,mouthFrownLeft:.11,mouthFrownRight:.11,mouthSmileLeft:.22,mouthSmileRight:.22,mouthUpperUpLeft:.08,mouthUpperUpRight:.08,
  mouthLowerDownLeft:.075,mouthLowerDownRight:.075,mouthStretchLeft:.13,mouthStretchRight:.13,mouthPressLeft:.1,mouthPressRight:.1,mouthDimpleLeft:.12,mouthDimpleRight:.12,mouthShrugLower:.09,mouthShrugUpper:.05,mouthFunnel:.13,mouthPucker:.14};
const LIMIT={browInnerUp:2.6,browOuterUpLeft:2.2,browOuterUpRight:2.2,eyeWideLeft:2.2,eyeWideRight:2.2,mouthFrownLeft:2.4,mouthFrownRight:2.4};
function displacement(bindings,name){
  let max=0,center=null;
  for(const b of bindings[name]||[]){
    const a=b.mesh.geometry?.morphAttributes?.position?.[b.index],base=b.mesh.geometry?.attributes?.position;if(!a||!base)continue;
    const relative=b.mesh.geometry.morphTargetsRelative,scale=b.mesh.matrixWorld.getMaxScaleOnAxis(),sum=[0,0,0];let weight=0,local=0;
    for(let v=0;v<a.count;v++){
      const d=Math.hypot(a.getX(v)-(relative?0:base.getX(v)),a.getY(v)-(relative?0:base.getY(v)),a.getZ(v)-(relative?0:base.getZ(v)));
      if(d>local)local=d;if(d>1e-9){sum[0]+=base.getX(v)*d;sum[1]+=base.getY(v)*d;sum[2]+=base.getZ(v)*d;weight+=d;}
    }
    if(local*scale>max){max=local*scale;center=weight?sum.map(x=>x/weight*scale):null;}
  }
  return {max,center};
}
export function suggestGain(bindings){
  const left=displacement(bindings,'eyeBlinkLeft').center,right=displacement(bindings,'eyeBlinkRight').center,gain={};
  if(!left||!right)return gain;
  const eyes=Math.hypot(left[0]-right[0],left[1]-right[1],left[2]-right[2]);if(!(eyes>0))return gain;
  for(const [name,target] of Object.entries(EXPRESSIVE)){
    const moved=displacement(bindings,name).max/eyes;if(!(moved>1e-6))continue;
    const value=Math.round(Math.min(LIMIT[name]||1.6,Math.max(1,target/moved))*20)/20;if(value>1)gain[name]=value;
  }
  return gain;
}
export function validateGain(gain){
  if(!gain||typeof gain!=='object'||Array.isArray(gain)||Object.entries(gain).some(([name,value])=>(name!=='all'&&!ARKIT.includes(name))||!finite(value,0,GAIN_MAX)))throw Error('Calibración de shape keys inválida.');
  return gain;
}
// A temporary final layer over the existing mixer/LifeCharacter. Never touches bones.
export class FacialPlayer {
  constructor(root,aliases={}) {Object.assign(this,profile(root,aliases));this.enabled=false;this.saved=null;this.gain={};}
  /** gain: {canal: factor, all: factor general}. Sin argumento conserva la calibración actual. */
  setGain(gain={}) {this.gain={...validateGain(gain)};return this;}
  apply(weights) {
    if(!this.enabled){this.saved=ARKIT.flatMap(n=>this.bindings[n].map(b=>({...b,value:b.mesh.morphTargetInfluences[b.index]})));this.enabled=true;}
    const all=this.gain.all??1;
    for(const n of ARKIT){const value=clamp(weights[n]??0)*(this.gain[n]??1)*(n.startsWith('eyeBlink')||n.startsWith('eyeLook')?1:all);for(const b of this.bindings[n])b.mesh.morphTargetInfluences[b.index]=Math.min(GAIN_MAX,value);}
  }
  restore() {if(this.saved)for(const b of this.saved)b.mesh.morphTargetInfluences[b.index]=b.value;this.enabled=false;this.saved=null;}
}
export function validateProject(d) {
  if(d?.rigMap!==undefined){if(!d.rigMap||typeof d.rigMap!=='object'||Array.isArray(d.rigMap)||Object.entries(d.rigMap).some(([key,value])=>!ARKIT.includes(key)||typeof value!=='string'||!value.trim()||value.length>160))throw Error('Mapa de retargeting facial inválido.');const targets=Object.values(d.rigMap).map(value=>value.toLowerCase().replace(/[^a-z0-9]/g,''));if(new Set(targets).size!==targets.length)throw Error('Dos canales no pueden escribir el mismo morph en el mapa manual.');}
  if(d?.rigGain!==undefined)validateGain(d.rigGain);
  if(!d||d.schema!=='spanstories.facial-project'||d.version!==1||!Array.isArray(d.presets)||d.presets.length>500||!Array.isArray(d.instances)||d.instances.length>1000)throw Error('Proyecto facial inválido o demasiado grande.');
  d.presets.forEach(validatePreset);
  if(new Set(d.presets.map(p=>p.id)).size!==d.presets.length||new Set(d.instances.map(i=>i.id)).size!==d.instances.length)throw Error('Identificadores duplicados.');
  d.instances.forEach(i=>validateInstance(i,d.presets));
  if(d.favorites!==undefined&&(!Array.isArray(d.favorites)||d.favorites.some(id=>typeof id!=='string')))throw Error('Favoritos inválidos.');
  return copy(d);
}
