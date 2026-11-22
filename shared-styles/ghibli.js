// Adaptado del visor vigente: engine/Estilos/StudioGhibli/{Configuracion,Superficies,Cielo}.js.
// El pase diferido reconstruye posiciones mundo: el pigmento queda fijo al mover la cámara.
import * as THREE from 'three';

export const GHIBLI_PALETTES={
  manana:['#91bed6','#d7e2dc','#f5f0e4','#779aa8','#afc7c8','#77939a',1],
  mediodia:['#83b9d5','#dbe6dc','#fff9e6','#88a6b3','#b1cbce','#7c969b',1],
  tarde:['#9ebdce','#e6d4b6','#ffe4b9','#9c9eb3','#c5c4ba','#8c8f9c',1],
  nublado:['#a2b9c1','#d0d8d0','#e1e5de','#839da5','#adc1c4','#7a9395',.88],
  noche:['#1b304d','#405870','#7c919e','#344b68','#3d566a','#6d7e9c',.32],
};
const colorNames=['uGCenit','uGHorizonte','uGNubeLuz','uGNubeSombra','uGAire','uGSombra'];
const cloudNames=['uGNubes','uGNubesCompactas','uGNubesAlargadas'];
const cloudURLs=[
  new URL('./ghibli-assets/nube-ghibli-alta.png',import.meta.url).href,
  new URL('./ghibli-assets/nube-ghibli-compacta.png',import.meta.url).href,
  new URL('./ghibli-assets/nube-ghibli-alargada.png',import.meta.url).href,
];
export function ghibliUniforms(){return {
  ...Object.fromEntries(colorNames.map(name=>[name,{value:new THREE.Color()}])),
  ...Object.fromEntries(cloudNames.map(name=>[name,{value:null}])),
  uGNubesListas:{value:0},uGCieloLuz:{value:1},
};}
export function updateGhibliAmbient(u,ambient){
  const p=GHIBLI_PALETTES[ambient]??GHIBLI_PALETTES.mediodia;
  colorNames.forEach((name,i)=>u[name].value.set(p[i]));u.uGCieloLuz.value=p[6];
}
export function loadGhibliClouds(u,onLoad){
  let disposed=false,loaded=0;
  const textures=cloudURLs.map((url,i)=>{
    const texture=new THREE.TextureLoader().load(url,()=>{
      if(disposed)return;
      if(++loaded===cloudURLs.length){u.uGNubesListas.value=1;onLoad?.();}
    });
    texture.colorSpace=THREE.SRGBColorSpace;u[cloudNames[i]].value=texture;return texture;
  });
  return ()=>{disposed=true;for(const texture of textures)texture.dispose();};
}

export const ghibliGLSL=/* glsl */`
uniform vec3 uGCenit,uGHorizonte,uGNubeLuz,uGNubeSombra,uGAire,uGSombra;
uniform float uGNubesListas,uGCieloLuz;
uniform sampler2D uGNubes,uGNubesCompactas,uGNubesAlargadas;
float gHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float gNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(gHash(i),gHash(i+vec3(1,0,0)),f.x),mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x),mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec4 gCloud(vec3 d,vec3 anchor,float halfWidth,sampler2D cloudTexture){
  float angle=mod(uTime*.0043633231,6.28318530718);
  float c=cos(angle),s=sin(angle);
  anchor=vec3(c*anchor.x+s*anchor.z,anchor.y,-s*anchor.x+c*anchor.z);
  vec3 right=normalize(cross(vec3(0,1,0),anchor)),up=cross(anchor,right);
  float facing=dot(d,anchor);
  vec2 extent=vec2(halfWidth,halfWidth/1.4275093);
  vec2 uv=vec2(dot(d,right),dot(d,up))/max(facing,.08)/(2.0*extent)+.5;
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  if(facing<=.1||any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return vec4(0);
  vec4 paint=textureGrad(cloudTexture,uv,dx,dy);
  float light=smoothstep(.14,.55,dot(paint.rgb,vec3(.2126,.7152,.0722)))*.82+max(dot(d,uSunDir),0.0)*.12;
  return vec4(mix(uGNubeSombra,uGNubeLuz,light),paint.a*uGNubesListas);
}
vec3 gSky(vec3 d){
  vec3 color=mix(uGHorizonte,uGCenit,pow(clamp(d.y,0.0,1.0),.55));
  vec4 farCloud=gCloud(d,normalize(vec3(-.8,.38,-.6)),.2493280,uGNubes);
  vec4 nearCloud=gCloud(d,normalize(vec3(.65,.52,-.55)),.3057307,uGNubesCompactas);
  vec4 eastCloud=gCloud(d,normalize(vec3(.25,.42,.9)),.2679492,uGNubesAlargadas);
  color=mix(color,mix(uGHorizonte,farCloud.rgb,.8),farCloud.a*.85);
  color=mix(color,eastCloud.rgb,eastCloud.a*.92);
  return mix(color,nearCloud.rgb,nearCloud.a)*uGCieloLuz;
}
`;

export const ghibliSurface=/* glsl */`
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    float organic=(foliage||surf==8.0||surf==23.0)?1.0:0.0;
    float broad=gNoise(wp*.45);
    vec3 strokeP=wp*vec3(6.0,1.6,4.0);
    float detail=1.0-smoothstep(.25,1.2,max(length(dFdx(strokeP)),length(dFdy(strokeP))));
    float stroke=gNoise(strokeP+broad*2.0);
    float pigment=((broad-.5)*.19+(stroke-.5)*.075*detail)*.65;
    vec3 painted=albedo*(1.0+pigment);
    painted*=mix(vec3(1),mix(vec3(.88,1.01,1.04),vec3(1.04,1.025,.88),broad),organic*.75);
    float width=max(.08,.25+uSoft);
    float diffuse=smoothstep(uThreshold-width,uThreshold+.65+width,nl);
    float masses=gNoise(wp*1.3+vec3(0,2.1,0));
    float massLight=smoothstep(.18,.82,diffuse+(masses-.5)*.75*.32);
    float lit=mix(diffuse,massLight,organic*.6)*smoothstep(.3,.7,shadow);
    vec3 ambient=hemi*mix(uShadowTint,uGSombra,.42);
    vec3 warm=uSunColor*mix(vec3(1),vec3(1.10,1.025,.91),.5);
    color=painted*mix(ambient,warm,lit)*mix(.78,1.0,ao);
    color+=painted*hemi*.06*organic*.75;
    litT=lit;
`;
export const ghibliAtmosphere=/* glsl */`
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    float distanceToCamera=max(0.0,length(wp-uViewInv[3].xyz)-25.0);
    float low=exp(-max(wp.y,0.0)*.022);
    float air=1.0-exp(-distanceToCamera*.0015*(.65+.35*low));
    float far=smoothstep(140.0,650.0,distanceToCamera);
    color=mix(color,vec3(luma(color)),far*.16);
    vec3 atmosphere=uGAire*clamp(luma(uSunColor),.07,1.15);
    color=mix(color,atmosphere,clamp(air,0.0,.9));
`;
