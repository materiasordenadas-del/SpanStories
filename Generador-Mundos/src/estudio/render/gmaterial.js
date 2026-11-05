// Material de geometría (G-buffer) del Estudio. Escribe albedo, normal, profundidad, id, N·L y sombra;
// la luz final (Trigun SpanStories, color suave, arcilla, líneas, tramas) se decide en el pase de composición.
import * as THREE from 'three';


const vertex=/* glsl */`
#include <common>
#include <shadowmap_pars_vertex>
attribute float aSurf;
attribute float aId;
#ifdef USE_TINT
attribute float aTint;
attribute vec3 aTint2;
#endif
#ifdef USE_MAP
varying vec2 vUv;
uniform mat3 uMapTransform;
#endif
varying vec3 vColor;
varying vec3 vViewNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vDepth;
varying float vSurf;
varying float vId;
uniform float uMeshId;
uniform float uBend;
#ifdef USE_FOLIAGE
uniform vec3 uCrownCenter,uCrownRadius;
varying vec3 vCrownNormal;
#endif

void main(){
  vec3 objectNormal=normal;
  vec4 local=vec4(position,1.0);
  #ifdef USE_INSTANCING
    local=instanceMatrix*local;
    mat3 im=mat3(instanceMatrix);
    objectNormal=im*objectNormal;
  #endif
  vec4 worldPosition=modelMatrix*local;
  vec3 worldNormal=normalize(mat3(modelMatrix)*objectNormal);
  #ifdef USE_FOLIAGE
    // Viento muy suave en las copas (solo lo nota la vista cercana).
    float sway=sin(worldPosition.x*.35+worldPosition.z*.27+uBend)*.04*max(0.0,position.y-1.5);
    worldPosition.xz+=vec2(sway,sway*.6);
    // Normal de volumen de la copa (elipsoide del modelo), para el sombreado por masas.
    vec3 crownN=(position-uCrownCenter)/max(uCrownRadius,vec3(1e-3));
    #ifdef USE_INSTANCING
      crownN=im*crownN;
    #endif
    vCrownNormal=normalize(mat3(modelMatrix)*crownN);
  #endif
  vec3 transformedNormal=normalize(mat3(viewMatrix)*worldNormal);
  vec4 mv=viewMatrix*worldPosition;
  gl_Position=projectionMatrix*mv;
  vColor=color;
  #ifdef USE_INSTANCING_COLOR
    #ifdef USE_TINT
      vColor=aTint<.5?color:(aTint<1.5?color*instanceColor:color*aTint2);
    #else
      vColor*=instanceColor;
    #endif
  #endif
  #ifdef USE_MAP
  vUv=(uMapTransform*vec3(uv,1.0)).xy;
  #endif
  vViewNormal=transformedNormal;
  vWorldNormal=worldNormal;
  vWorldPos=worldPosition.xyz;
  vDepth=-mv.z;
  vSurf=aSurf;
  float inst=0.0;
  #ifdef USE_INSTANCING
    inst=float(gl_InstanceID);
  #endif
  vId=fract(uMeshId*.61803+aId*.12345+inst*.0731);
  #include <shadowmap_vertex>
}`;

export const gFragment=/* glsl */`
precision highp float;
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
layout(location=0) out vec4 gAlbedo;
layout(location=1) out vec4 gNormal;
layout(location=2) out vec4 gLight;
varying vec3 vColor;
varying vec3 vViewNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vDepth;
varying float vSurf;
varying float vId;
#ifdef USE_MAP
uniform sampler2D map;
varying vec2 vUv;
#endif
uniform vec3 uSunDir;
uniform float uAlphaTest;
uniform float uSurfOverride;
uniform float uEmissive;
uniform vec3 uBaseColor;
#ifdef USE_FOLIAGE
uniform float uFoliageVolume;
varying vec3 vCrownNormal;
#endif

void main(){
  vec3 albedo=vColor*uBaseColor;
  #ifdef USE_MAP
    vec4 tex=texture2D(map,vUv);
    if(tex.a<uAlphaTest)discard;
    #ifdef USE_CHARACTER
      // Personaje pintado: la textura fotográfica pierde poros, pliegues y sombra horneada;
      // quedan las formas de color (ojos, boca, rayas), como un albedo de BotW.
      vec3 soft=texture(map,vUv,2.0).rgb,broad=texture(map,vUv,4.5).rgb;
      vec3 painted=mix(soft,tex.rgb,.3);
      float lp=dot(painted,vec3(.2126,.7152,.0722)),lb=dot(broad,vec3(.2126,.7152,.0722));
      tex.rgb=painted*mix(1.0,clamp(lb/max(lp,.02),.7,1.45),.5);
    #endif
    albedo*=tex.rgb;
  #endif
  vec3 vn=normalize(vViewNormal);
  vec3 wn=normalize(vWorldNormal);
  if(!gl_FrontFacing){vn=-vn;wn=-wn;}
  float surf=uSurfOverride>=0.0?uSurfOverride:vSurf;
  float nl=dot(wn,uSunDir);
  #ifdef USE_FOLIAGE
    // Copas: normal esférica aproximada para que el árbol se ilumine como un volumen.
    // Zelda: la copa se ilumina como masas (normal de hoja + volumen), con lado en sombra real.
    if(uFoliageVolume>0.0){
      vec3 cn=normalize(vCrownNormal);
      vec3 bn=normalize(mix(wn*(dot(wn,cn)<0.0?-1.0:1.0),cn,.72));
      nl=mix(nl*.45+.35,dot(bn,uSunDir),uFoliageVolume);
      vn=normalize(mix(vn,normalize(mat3(viewMatrix)*bn),uFoliageVolume));
    }else nl=nl*.45+.35;
  #endif
  float shadow=1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow s=directionalLightShadows[0];
    shadow=getShadow(directionalShadowMap[0],s.shadowMapSize,1.0,s.shadowBias,s.shadowRadius,vDirectionalShadowCoord[0]);
  #endif
  gAlbedo=vec4(albedo,surf/31.0);
  gNormal=vec4(vn,vDepth);
  gLight=vec4(vId,nl,shadow,uEmissive);
}`;

// Uniforme compartido por todas las copas: 1 en el estilo Zelda (masas con sombra), 0 en los demás.
export const foliageVolume={value:0};

export function createGMaterial({map=null,mapTransform=null,baseColor=null,alphaTest=0,doubleSided=false,instanceTint=false,foliage=false,crown=null,surf=-1,emissive=0,sun}={}){
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.lights,{
    uSunDir:{value:new THREE.Vector3(0,1,0)},uAlphaTest:{value:alphaTest},uMeshId:{value:Math.random()},
    uSurfOverride:{value:surf},uEmissive:{value:emissive},uBend:{value:0},map:{value:map},uMapTransform:{value:mapTransform??new THREE.Matrix3()},uBaseColor:{value:baseColor??new THREE.Color(1,1,1)},
    uCrownCenter:{value:crown?.center??new THREE.Vector3(0,4,0)},uCrownRadius:{value:crown?.radius??new THREE.Vector3(2.5,2.5,2.5)},
  }]);
  if(sun)uniforms.uSunDir=sun; // uniforme compartido: mover el sol mueve todo
  uniforms.uFoliageVolume=foliageVolume;
  uniforms.map.value=map;
  const defines={};
  if(map)defines.USE_MAP='';
  if(instanceTint)defines.USE_TINT='';
  if(foliage)defines.USE_FOLIAGE='';
  const m=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:gFragment,defines,lights:true,
    vertexColors:true,glslVersion:THREE.GLSL3,side:doubleSided?THREE.DoubleSide:THREE.FrontSide});
  m.userData.estudio=true;
  return m;
}

// Profundidad para la sombra de hojas con transparencia recortada.
export function createLeafDepthMaterial(map,alphaTest=.5){
  return new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map,alphaTest});
}
