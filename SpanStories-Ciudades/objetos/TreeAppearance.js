import * as T from '../engine/three.js';
import {URBAN_TREES as C} from '../routes.js';

// The original comparator's spatial colour rule, shared by its CPU colours and
// the city's per-instance palette shader. Coordinates are in reference metres.
export function foliageSamples(geometry,metricScale=1){
  geometry.computeBoundingBox();
  const box=geometry.boundingBox,size=box.getSize(new T.Vector3()),centre=box.getCenter(new T.Vector3());
  const p=geometry.attributes.position,samples=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)*metricScale,y=p.getY(i)*metricScale,z=p.getZ(i)*metricScale;
    const radial=Math.min(1,Math.hypot((p.getX(i)-centre.x)/(size.x*.5),(p.getZ(i)-centre.z)/(size.z*.5)));
    const height=(p.getY(i)-box.min.y)/Math.max(size.y,1e-6);
    samples[i*2]=(.5+.5*Math.sin(x*2.1+z*1.4+Math.sin(y*1.7-z)))*3;
    samples[i*2+1]=.82+.12*radial+.06*height;
  }
  return samples;
}

export function tintOriginalFoliage(geometry,paletteHex=C.palettes[0]){
  const palette=paletteHex.map(hex=>new T.Color(hex)),samples=foliageSamples(geometry),colors=[];
  for(let i=0;i<samples.length;i+=2){
    const t=samples[i]*(palette.length-1)/3,a=Math.floor(t);
    const color=palette[a].clone().lerp(palette[Math.min(a+1,palette.length-1)],t-a).multiplyScalar(samples[i+1]);
    colors.push(color.r,color.g,color.b);
  }
  const existing=geometry.getAttribute('color');
  if(existing&&existing.count===colors.length/3){existing.array.set(colors);existing.needsUpdate=true;}
  else geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  return geometry;
}
