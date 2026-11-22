// Adaptador de datos del visor al G-buffer canónico del creador. Conserva los
// shaders de UV, normal, color por vértice, atlas, batching, skin y morph.
export function fragmentoGBuffer(shader,metadata={}){
  const surface=metadata.esPersonaje?25:({vegetacion:2,cesped:8,cristal:1,agua:3,metal:4}[metadata.categoria]??0);
  if(!/gl_FragColor = vec4\(color, (a|1\.0)\);/.test(shader))throw Error('Material sin salida compatible con estilos compartidos');
  return 'varying float vPoolSurface;\nlayout(location=1) out vec4 poolNormal;\nlayout(location=2) out vec4 poolLight;\n'+shader
    .replace(/gl_FragColor = vec4\(color, (a|1\.0)\);/,`float poolSurface=vPoolSurface>=0.0?vPoolSurface:${surface.toFixed(1)};
    gl_FragColor=vec4(albedo,poolSurface/31.0);
    poolNormal=vec4(normalize(mat3(viewMatrix)*Nrel),-(viewMatrix*vec4(vPos,1.0)).z);
    float poolVisibility=1.0;
    #ifdef TRES_BANDAS
    float poolBase=corte(nl,umbral-.25,borde)*mix(.5,1.0,corte(nl,umbral+.3,borde));
    #else
    float poolBase=corte(nl,umbral,borde);
    #endif
    if(poolBase>.001)poolVisibility=clamp(lit/poolBase,0.0,1.0);
    vec3 poolExtra=max(vec3(0),color-albedo*mix(sombra*hemi,luzColor,lit));
    poolLight=vec4(fract(dot(uColor,vec3(.61803,.38197,.12345))),nl,poolVisibility,dot(poolExtra,vec3(.2126,.7152,.0722)));`)
    .replace('#include <colorspace_fragment>','');
}
export function verticeGBuffer(shader){return 'attribute float poolSurface;\nvarying float vPoolSurface;\n'+shader.replace('void main() {','void main() {\nvPoolSurface=poolSurface;');}
