// Forma y onda de la demo web de James Smyth (smythdesign.com/demos/grass, r131):
// onda X a velocidad completa y onda Z a un cuarto, waveSize 5 sobre un campo de 30 m,
// 0,3 m en la punta y 0,1 m a media hoja. Ráfagas espaciales opcionales (Christian Ortiz).
export const grassVertex=/* glsl */`
#include <common>
#include <shadowmap_pars_vertex>
attribute vec4 aRoot;
attribute float aBlade;
attribute vec2 aOffset;
uniform vec3 uReference,uCharacter;
uniform vec3 uRootColor,uMainColor,uTipColor;
uniform sampler2D uGrassTexture,uCloudTexture;
uniform vec4 uGeometry; // height, width, curvature, variation
uniform vec4 uWind; // strength, speed, frequency, spatial variation
uniform vec2 uWindDir;
uniform vec4 uLOD; // near, far, transition, far density
uniform vec4 uAppearance; // gradient, root shade, variation, terrain blend
uniform vec4 uShape; // small clumps, orientation, flexibility, wavelength
uniform float uTime,uInteraction,uQuality,uDebugLOD,uDebugChunks,uChunkSize,uLight,uTranslucency,uAdaptive,uLODLevel,uDensityScale;
varying vec3 vColor,vViewNormal,vWorldNormal,vWorldPos;
varying float vDepth,vSurf,vId;
varying vec2 vUv,cloudUV;
float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
// Debe coincidir con grassKeep() de grass-config.js: densidad plena hasta 12 m.
float grassKeep(float d){return d<=12.0?1.0:pow(12.0/d,1.5);}
void main(){
  float t=position.y,seed=aRoot.w,h=hash(seed),h2=hash(seed+7.0),dist=distance(aRoot.xz,uReference.xz);
  float nearFade=1.0-smoothstep(uLOD.x-uLOD.z,uLOD.x,dist);
  float farFade=(1.0-smoothstep(uLOD.y-uLOD.z,uLOD.y,dist))*smoothstep(uLOD.x-uLOD.z,uLOD.x,dist);
  float grow=uLODLevel<.5?nearFade:farFade;
  // Estocástico estable: la calidad adaptativa baja antes la densidad que la silueta.
  grow*=smoothstep(h-.035,h+.035,uAdaptive);
  float keep=grassKeep(dist);
  if(uLODLevel<.5){float density=keep*uDensityScale;grow*=smoothstep(seed-.07,seed+.07,density);}
  if(grow<.001||dist>=uLOD.y||(uLODLevel<.5&&dist>=uLOD.x)) {gl_Position=vec4(2.,2.,2.,1.);return;}
  float size=mix(1.0-uGeometry.w,1.0+uGeometry.w,h2)*mix(.64,1.0,step(uShape.x,h));
  float yaw=h*6.2831853+uShape.y,ca=cos(yaw),sa=sin(yaw);
  mat2 rotation=mat2(ca,-sa,sa,ca);
  // La anchura y TIP_OFFSET de generateBlade se parametrizan conservando su silueta.
  vec2 bladeXZ=position.xz;
  // Al aclarar con la distancia se ensancha la hoja para conservar la cobertura.
  float widen=uLODLevel<.5?inversesqrt(max(keep,.05)):min(3.0,inversesqrt(max(uLOD.w,.02)));
  if(t>.99)bladeXZ*=uGeometry.z;else bladeXZ*=uGeometry.y*widen;
  bladeXZ+=aOffset;
  vec3 p=vec3((rotation*bladeXZ).x,t*uGeometry.x*size,(rotation*bladeXZ).y);
  // Web: cpos.x+=sin(iTime/500+uv.x*5)*a; cpos.z+=sin(iTime/2000+uv.y*5)*a, uv=pos/30.
  // Con 37,7 m de longitud de onda, velocidad 2 y dirección 0° es la misma onda.
  vec2 windSide=vec2(-uWindDir.y,uWindDir.x);
  float k=6.2831853/uShape.w*uWind.z;
  float waveA=sin(uTime*uWind.y+dot(aRoot.xz,uWindDir)*k);
  float waveB=sin(uTime*uWind.y*.25+dot(aRoot.xz,windSide)*k);
  if(uQuality>.5&&uLODLevel<.5)waveA+=sin(dot(aRoot.xz,vec2(.17,.11))-uTime*.7)*uWind.w;
  float bend=t>.6?1.0:(t>0.0?.333333:0.0);
  // Amplitud en metros para hojas de 1,1 m (media de la web); escala con la altura.
  p.xz+=(uWindDir*waveA+windSide*waveB)*uWind.x*bend*uShape.z*size*uGeometry.x/1.1;
  if(uInteraction>.5&&uLODLevel<.5){vec2 delta=aRoot.xz-uCharacter.xz;float d=length(delta);p.xz+=delta/max(d,.05)*(1.0-smoothstep(.2,1.1,d))*t*t*.35;}
  p.y*=grow;
  vec4 worldPosition=vec4(aRoot.xyz+p,1.0);
  vec3 worldNormal=normalize(vec3(rotation*vec2(.18,.12),.96).xzy);
  vec3 transformedNormal=normalize(mat3(viewMatrix)*worldNormal);
  vec4 mv=viewMatrix*worldPosition;gl_Position=projectionMatrix*mv;
  vec2 uv=aRoot.xz/30.0;
  // UV original de convertRange(x,-15,15,0,1); deriva solo del apoyo.
  vUv=aRoot.xz/30.0+vec2(.5);
  cloudUV=vUv+uTime*vec2(.05,.1); // iTime/20000, iTime/10000 con tiempo en segundos
  vec3 tex=texture2D(uGrassTexture,uv).rgb*1.5+vec3(.1);
  float cloud=texture2D(uCloudTexture,uv+uTime*vec2(.05,.1)).r;
  vec3 pigment=mix(uRootColor,uMainColor,smoothstep(0.0,.65,t));
  pigment=mix(pigment,uTipColor,smoothstep(.35,1.0,t)*uAppearance.x);
  pigment*=mix(1.0-uAppearance.y,1.0,smoothstep(0.0,.45,t));
  vColor=mix(pigment,tex*.8+pigment*.2,uAppearance.w*.5)*(1.0+(h2-.5)*uAppearance.z)*( .86+.14*cloud)*uLight;
  vColor+=uMainColor*uTranslucency*pow(t,2.0)*.35;
  if(uDebugLOD>.5)vColor=uLODLevel<.5?vec3(.12,.8,.25):vec3(.9,.5,.08);
  if(uDebugChunks>.5){vec2 edge=min(fract(aRoot.xz/uChunkSize),1.0-fract(aRoot.xz/uChunkSize));if(min(edge.x,edge.y)*uChunkSize<.12)vColor=vec3(1.,.15,.1);}
  vViewNormal=transformedNormal;vWorldNormal=worldNormal;vWorldPos=worldPosition.xyz;
  vDepth=-mv.z;vSurf=23.0;vId=.871;
  #include <shadowmap_vertex>
}`;

export const grassMaskVertex=/* glsl */`
attribute float aSurf;varying float vS,vY;
void main(){vec4 p=vec4(position,1.0);
#ifdef USE_INSTANCING
p=instanceMatrix*p;
#endif
vec4 w=modelMatrix*p;vY=w.y;vS=aSurf;gl_Position=projectionMatrix*viewMatrix*w;}`;
export const grassMaskFragment=/* glsl */`
precision highp float;varying float vS,vY;uniform vec2 uHeightRange;
void main(){
  // Copas, cristales y utilería no anulan el suelo de debajo. Pavimento, agua y
  // edificios sí escriben máscara cero y profundidad: nunca hierba dentro de ellos.
  if(abs(vS-2.0)<.5||abs(vS-23.0)<.5||abs(vS-1.0)<.5)discard;
  float h=clamp((vY-uHeightRange.x)/uHeightRange.y,0.0,1.0)*65535.0;
  gl_FragColor=vec4(abs(vS-8.0)<.5?1.0:0.0,floor(h/256.0)/255.0,mod(floor(h),256.0)/255.0,1.0);
}`;
