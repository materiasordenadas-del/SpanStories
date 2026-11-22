import {JAMES_FRAGMENT_SOURCE} from './grass-james-source.js';

// Adaptador de salida para el G-buffer existente. El cuerpo del shader del ZIP
// se ejecuta literalmente: solo cambia el nombre de main y del destino de color.
export function withOriginalJamesMaterial(fragment){
  const original=JAMES_FRAGMENT_SOURCE.replace('varying vec3 vColor;','')
    .replace('void main()', 'void jamesFragmentMain()').replaceAll('gl_FragColor','jamesFragmentColor');
  const adapter=`
uniform float uJamesOriginal;
vec4 jamesFragmentColor;
${original}
void main(){
  if(uJamesOriginal>.5){
    jamesFragmentMain();
    gAlbedo=vec4(jamesFragmentColor.rgb,vSurf/31.0);
    gNormal=vec4(normalize(vViewNormal),vDepth);
    gLight=vec4(vId,dot(normalize(vWorldNormal),uSunDir),1.0,0.0);
    return;
  }
`;
  if(!fragment.includes('void main(){'))throw Error('Cambió la entrada del G-buffer: revisar el adaptador James');
  return fragment.replace('void main(){',adapter);
}
