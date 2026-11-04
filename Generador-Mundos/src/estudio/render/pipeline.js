// Pase diferido del Estudio: G-buffer -> oclusión ambiental -> composición por estilo.
// Catálogo activo: Trigun, Zelda, Studio Ghibli, Dispatch, Color y Color + línea.
import * as THREE from 'three';
import {renderBlenderCommerce} from './commerce-blender-pass.js';
import {ghibliUniforms,updateGhibliAmbient,loadGhibliClouds,ghibliGLSL,ghibliSurface,ghibliAtmosphere} from './ghibli.js';
import {dispatchUniforms,updateDispatchAmbient,dispatchGLSL,dispatchSky,dispatchSurface,dispatchAtmosphere,dispatchInk} from './dispatch.js';
import {STYLE_MODES,STYLE_DEFAULTS} from './style-pool.js';

export const MODES=STYLE_MODES;

// Ambientes de SpanStories (Luz25D): sol, hemisferio, sombra fría y cielo. Mediodía usa el cielo Trigun.
export const AMBIENTS={
  manana:{name:'Mañana',sun:'#fff1d2',k:1.0,sky:'#ffffff',ground:'#f4ecd8',shadow:'#c3bfe0',force:.85,threshold:.12,soft:.03,top:'#4aa3e3',horizon:'#f6e7cc',cloud:'#fffaf2',el:28,az:115,night:0},
  mediodia:{name:'Mediodía',sun:'#fffaf0',k:1.02,sky:'#ffffff',ground:'#f0eee6',shadow:'#cbcfe6',force:.65,threshold:.10,soft:.05,top:'#58a9d3',horizon:'#e4d5b7',cloud:'#fff0d5',el:52,az:200,night:0},
  tarde:{name:'Tarde',sun:'#ffc584',k:1.05,sky:'#e9d7d9',ground:'#f0cfa8',shadow:'#9c8ec4',force:1.0,threshold:.10,soft:.02,top:'#5d7cc0',horizon:'#ffd49a',cloud:'#ffe0c4',el:14,az:255,night:.25},
  nublado:{name:'Nublado',sun:'#e9eef4',k:.98,sky:'#ffffff',ground:'#e3e6ea',shadow:'#d6dae8',force:.4,threshold:0,soft:.35,top:'#8ea4b6',horizon:'#dde4e8',cloud:'#eef2f5',el:60,az:200,night:.1,clouds:.8},
  noche:{name:'Noche',sun:'#8fa3e0',k:.62,sky:'#b8c4ee',ground:'#9aa0c8',shadow:'#6a70a8',force:1.0,threshold:.15,soft:.03,top:'#0e1a3a',horizon:'#40508a',cloud:'#5d6c9c',el:38,az:150,night:1},
};

const quadVert=/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;

const common=/* glsl */`
uniform vec4 uProj; // m00, m11, m02, m12
vec3 viewPos(vec2 uv,float depth){vec2 ndc=uv*2.0-1.0;return vec3(depth*(ndc.x+uProj.z)/uProj.x,depth*(ndc.y+uProj.w)/uProj.y,-depth);}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
`;

const aoFrag=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tNormal;
uniform vec2 uTexel;
uniform float uRadius,uStrength;
${common}
void main(){
  vec4 nd=texture2D(tNormal,vUv);
  if(nd.w<=0.0){gl_FragColor=vec4(1.0);return;}
  vec3 p=viewPos(vUv,nd.w),n=normalize(nd.xyz);
  float rot=ign(gl_FragCoord.xy)*6.2831853,occ=0.0;
  float radius=uRadius*clamp(nd.w/30.0,1.0,6.0);
  vec3 t=normalize(abs(n.y)<.9?cross(n,vec3(0,1,0)):cross(n,vec3(1,0,0))),b=cross(n,t);
  const int N=12;
  for(int i=0;i<N;i++){
    float fi=float(i)+.5,a=fi*2.39996+rot,r=sqrt(fi/float(N));
    float h=sqrt(max(0.0,1.0-r*r));
    vec3 s=p+(t*cos(a)*r+b*sin(a)*r+n*h*.9+n*.05)*radius*(.35+.65*fract(fi*.618+rot));
    // proyectar
    vec2 suv=vec2((s.x/(-s.z))*uProj.x-uProj.z,(s.y/(-s.z))*uProj.y-uProj.w)*.5+.5;
    if(suv.x<0.0||suv.y<0.0||suv.x>1.0||suv.y>1.0)continue;
    float sd=texture2D(tNormal,suv).w;
    if(sd<=0.0)continue;
    float diff=(-s.z)-sd;
    occ+=step(.04,diff)*smoothstep(radius*3.0,0.0,diff);
  }
  float ao=1.0-occ/float(N);
  gl_FragColor=vec4(vec3(pow(clamp(ao,0.0,1.0),uStrength)),1.0);
}`;

const blurFrag=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO,tNormal;
uniform vec2 uDir;
void main(){
  float d0=texture2D(tNormal,vUv).w,sum=0.0,wsum=0.0;
  for(int i=-3;i<=3;i++){
    vec2 uv=vUv+uDir*float(i);
    float d=texture2D(tNormal,uv).w;
    float w=exp(-float(i*i)/8.0)*(1.0-smoothstep(0.0,max(.3,d0*.04),abs(d-d0)));
    sum+=texture2D(tAO,uv).r*w;wsum+=w;
  }
  gl_FragColor=vec4(vec3(wsum>0.0?sum/wsum:1.0),1.0);
}`;

const compositeFrag=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tAlbedo,tNormal,tLight,tAO;
uniform vec2 uTexel;
uniform int uMode;
uniform mat4 uViewInv;
uniform vec3 uSunDir,uSunColor,uSkyTop,uSkyHorizon,uSkyCloud,uHemiSky,uHemiGround,uShadowTint,uTTint,uInk,uPaper,uHaze;
uniform float uLineWidth,uOutline,uToneSize,uToneOpacity,uBeta,uAOStrength,uHazeDensity,uHazeStart,uThreshold,uSoft,uContrast,uShadowDepth,uRim,uSaturation,uNight,uLineFar,uCloudAmount,uTime;
uniform float uWindowReflect;
uniform vec3 uZBruma;
uniform float uGrassR;
uniform vec3 uGrassColor;
uniform float uGrassBlend;
uniform sampler2D uGrassTexture;
uniform sampler2D uJamesGrass,uJamesCloud;
uniform vec3 uGrassSkyTop,uGrassSkyHorizon,uGrassSkyCloud;
uniform float uGrassCloudAmount;
${common}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 toSRGB(vec3 c){c=max(c,0.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(.0031308,c));}
vec3 worldN(vec3 vn){return normalize((uViewInv*vec4(vn,0.0)).xyz);}
${ghibliGLSL}
${dispatchGLSL}
vec3 dSky(vec3 d);
vec3 skyColor(vec3 d){
  if(uMode==7)return gSky(d);
  if(uMode==8)return dSky(d);
  float h=pow(clamp(d.y,0.0,1.0),.55);
  vec3 c=mix(uSkyHorizon,uSkyTop,h);
  vec2 p=d.xz/max(.18,d.y+.18);
  float cl=sin(p.x*2.1+sin(p.y*1.7)+uTime*.01)*.36+sin(p.y*3.3-p.x*.7)*.27+sin(p.x*6.1+p.y*4.3)*.08;
  cl=smoothstep(.26,.52,cl)*smoothstep(.02,.15,d.y)*(1.0-smoothstep(.65,.95,d.y));
  c=mix(c,uSkyCloud,cl*uCloudAmount);
  // horizonte cálido cerca del suelo
  c=mix(c,uSkyHorizon*1.02,smoothstep(.12,-.02,d.y)*.5);
  return c;
}

float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x),f.y);}
// Patrón de aparejo: devuelve (junta 0..1, variación por pieza) con antialias por tamaño en pantalla.
vec2 bond(vec2 uv,vec2 size,float joint,float offset){
  float row=floor(uv.y/size.y);
  vec2 q=vec2(uv.x/size.x+row*offset,uv.y/size.y);
  vec2 f=fract(q),id=floor(q);
  vec2 fw=fwidth(q);
  vec2 jw=vec2(joint)/size;
  float jx=smoothstep(jw.x+fw.x,jw.x,f.x)+smoothstep(1.0-fw.x,1.0,f.x)*0.0;
  float jy=smoothstep(jw.y+fw.y,jw.y,f.y);
  float j=max(jx,jy);
  float fade=smoothstep(.18,.5,max(fw.x,fw.y));
  return vec2(mix(j,jw.x*1.5,fade),mix(hash12(id),.5,fade));
}
// Variación de albedo por material (sutil: el estilo SpanStories no pinta luz en el color).
vec3 surfacePattern(vec3 albedo,float surf,vec3 wp,vec3 wn,float depth){
  if(depth>700.0)return albedo;
  vec2 wallUV=vec2(dot(wp.xz,normalize(vec2(-wn.z,wn.x)+1e-5)),wp.y);
  vec2 floorUV=wp.xz;
  if(surf==14.0&&abs(wn.y)<.5){ // ladrillo
    vec2 b=bond(wallUV,vec2(.34,.15),.025,.5);
    albedo*=mix(1.0,.88+.2*b.y,.6);
    albedo=mix(albedo,vec3(.62,.58,.52),b.x*.55);
  }else if(surf==21.0&&abs(wn.y)<.5){ // sillería
    vec2 b=bond(wallUV,vec2(1.05,.52),.03,.5);
    albedo*=mix(1.0,.93+.12*b.y,.7);
    albedo*=1.0-b.x*.16;
  }else if(surf==10.0&&abs(wn.y)<.5){ // revoco: manchas suaves
    float n=vnoise(wallUV*vec2(.35,.5))*.6+vnoise(wallUV*1.7)*.4;
    albedo*=.965+n*.07;
  }else if(surf==7.0&&wn.y>.6){ // baldosa de acera
    vec2 b=bond(floorUV,vec2(.4,.4),.018,0.0);
    albedo*=mix(1.0,.95+.08*b.y,.7)*(1.0-b.x*.1);
  }else if(surf==15.0&&wn.y>.6){ // granito de plaza
    vec2 b=bond(floorUV,vec2(.9,.45),.02,.5);
    albedo*=mix(1.0,.93+.12*b.y,.8)*(1.0-b.x*.13);
  }else if(surf==16.0&&wn.y>.6){ // adoquín
    vec2 b=bond(floorUV,vec2(.22,.12),.02,.5);
    albedo*=mix(1.0,.88+.2*b.y,.8)*(1.0-b.x*.2);
  }else if(surf==6.0&&wn.y>.6){ // asfalto
    float n=vnoise(floorUV*2.3)*.5+vnoise(floorUV*.21)*.5;
    albedo*=.95+n*.1;
  }else if(surf==8.0&&wn.y>.5){ // césped
    float n=vnoise(floorUV*.35)*.6+vnoise(floorUV*2.1)*.4;
    albedo*=vec3(.9,.94,.9)+n*vec3(.18,.13,.12);
  }else if(surf==13.0){ // teja árabe en hiladas
    vec3 t=normalize(cross(vec3(0,1,0),wn)+1e-5),bt=cross(wn,t);
    vec2 uv=vec2(dot(wp,t),dot(wp,bt));
    float ridge=.5+.5*sin(uv.x*6.2831853/.24);
    float fw=fwidth(uv.x/.24);
    ridge=mix(ridge,.5,smoothstep(.2,.5,fw));
    vec2 b=bond(uv,vec2(.24,.42),.0,.5);
    albedo*=(.9+.16*ridge)*(.95+.08*b.y);
  }else if(surf==17.0){ // pizarra
    vec3 t=normalize(cross(vec3(0,1,0),wn)+1e-5),bt=cross(wn,t);
    vec2 b=bond(vec2(dot(wp,t),dot(wp,bt)),vec2(.3,.22),.015,.5);
    albedo*=(.93+.1*b.y)*(1.0-b.x*.25);
  }
  return albedo;
}

// ---------- Zelda · Breath of the Wild ----------
float fbm2(vec2 p){float s=0.0,a=.5;for(int i=0;i<4;i++){s+=a*vnoise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+17.1;a*=.5;}return s/.9375;}
// Coordenadas de pintura: el plano dominante de la normal (paredes, suelos) en metros.
vec2 paintUV(vec3 wp,vec3 wn){vec3 a=abs(wn);return a.y>.6?wp.xz:(a.x>a.z?wp.zy:wp.xy);}
// Cielo pintado: cenit azul intenso, horizonte claro, halo cálido alrededor del sol y cúmulos con base sombreada.
vec3 zSkyPalette(vec3 d,vec3 skyTop,vec3 skyHorizon,vec3 skyCloud,float cloudAmount){
  float y=clamp(d.y,0.0,1.0);
  vec3 c=mix(skyHorizon,skyTop,pow(y,.48));
  float sd=max(dot(d,uSunDir),0.0);
  c+=uSunColor*(pow(sd,6.0)*.22+pow(sd,48.0)*.35)*vec3(1.0,.88,.62);
  vec2 p=d.xz/max(.06,d.y+.12)*1.6;
  float n=fbm2(p*.9+vec2(uTime*.004,0.0));
  float base=fbm2(p*.9+vec2(uTime*.004,0.0)+vec2(.0,-.35));
  float cl=smoothstep(.56,.72,n)*smoothstep(.01,.12,d.y)*(1.0-smoothstep(.55,.9,d.y));
  vec3 cloud=mix(skyCloud*vec3(.80,.86,.97),skyCloud*1.04,smoothstep(.45,.75,n-base*.35+.3));
  c=mix(c,cloud,cl*cloudAmount*1.6);
  c=mix(c,skyHorizon*1.04,smoothstep(.10,-.02,d.y)*.6);
  return c;
}
vec3 zSky(vec3 d){return zSkyPalette(d,uSkyTop,uSkyHorizon,uSkyCloud,uCloudAmount);}
${dispatchSky}
vec3 zHaze(vec3 d,vec3 skyTop,vec3 skyHorizon){
  float sd=pow(max(dot(d,uSunDir),0.0),5.0);
  vec3 blue=mix(skyHorizon,skyTop,.38)*vec3(.92,1.0,1.06);
  return mix(blue,skyHorizon*vec3(1.08,1.0,.86),sd*.7)*clamp(luma(uSunColor),.05,1.25);
}

// Personaje BotW: cel de dos tonos con borde duro, sombra cálida y saturada en piel y tejidos cálidos
// (fría en los tejidos fríos), franja roja del terminador, borde de luz del lado del sol y ojos legibles.
void zCharacter(vec3 albedo,vec3 wn,vec3 V,float nl,float shadow,float ao,vec3 hemi,vec3 skyTop,out vec3 color,out float litT){
  float l=luma(albedo);
  // Color plano y vivo, sin el gris de la textura fotográfica.
  float warmth=clamp((albedo.r-albedo.b)/max(albedo.r,.03)*1.3-.15,0.0,1.0);
  // Piel (verde/rojo entre .2 y .6): tono melocotón limpio, menos naranja que la textura de Tripo.
  float gr=albedo.g/max(albedo.r,.02);
  float skin=smoothstep(.18,.28,gr)*(1.0-smoothstep(.55,.7,gr))*step(albedo.b,albedo.g)*warmth;
  albedo=mix(max(mix(vec3(l),albedo,1.15),0.0),mix(vec3(l),albedo,.82)*vec3(1.0,1.05,1.08),skin)*1.06;
  float w=fwidth(nl)*1.2+.05;
  float thr=uThreshold-.05;
  float dif=smoothstep(thr-w,thr+w,nl);
  float castL=smoothstep(.38,.62,shadow);
  float lit=dif*castL;
  vec3 sunC=uSunColor*vec3(1.06,1.0,.88)*1.18;
  vec3 chroma=max(mix(vec3(luma(albedo)),albedo,1.5),0.0);
  // Piel: sombra rosada-anaranjada; tejidos fríos: azul violáceo. Nunca negra.
  vec3 shadeTint=mix(mix(vec3(.50,.54,.76),vec3(.80,.50,.44),warmth),vec3(.84,.54,.54),skin);
  vec3 shade=chroma*shadeTint*clamp(luma(hemi),.45,1.15)*mix(.88,1.06,wn.y*.5+.5);
  color=mix(shade,albedo*sunC,lit);
  // Franja subsuperficial del terminador (roja en la piel, más suave en lo demás).
  float band=(1.0-smoothstep(.0,.09,abs(nl-thr)))*castL;
  color+=chroma*mix(vec3(.55,.35,.30),vec3(1.0,.36,.22),warmth)*sunC*band*.30;
  color*=mix(vec3(.66,.62,.76),vec3(1.0),ao);
  // Borde de luz: línea clara del lado del sol (la «brillantina» de BotW) y celeste en la sombra.
  float rimF=pow(1.0-max(dot(wn,V),0.0),4.0);
  float sunSide=smoothstep(-.05,.35,dot(wn,uSunDir));
  color+=sunC*smoothstep(.25,.55,rimF)*sunSide*.55*castL*mix(vec3(1.0),albedo/max(l,.05),.25);
  color+=skyTop*albedo*rimF*(1.0-sunSide)*.35;
  litT=lit;
}

vec3 reflSkyFar(vec3 n,vec3 d){vec3 r=reflect(d,n);return mix(uSkyHorizon,uSkyTop,clamp(r.y*2.0,0.0,1.0));}
vec3 rayDir(vec2 uv){vec3 v=normalize(viewPos(uv,1.0));return normalize((uViewInv*vec4(v,0.0)).xyz);}

// Líneas por discontinuidad de id, normal y profundidad.
float surfAt(vec2 uv){float s=floor(texture2D(tAlbedo,uv).a*31.0+.5);return s==23.0?2.0:s;} // hierba 3D = follaje para las líneas
float edgeAt(vec2 uv,float w){
  vec4 c=texture2D(tNormal,uv);
  float idc=texture2D(tLight,uv).r;
  bool fc=surfAt(uv)==2.0;
  float e=0.0;
  vec2 o[8];
  o[0]=vec2(1,0);o[1]=vec2(-1,0);o[2]=vec2(0,1);o[3]=vec2(0,-1);
  o[4]=vec2(.7,.7);o[5]=vec2(-.7,-.7);o[6]=vec2(.7,-.7);o[7]=vec2(-.7,.7);
  for(int i=0;i<8;i++){
    vec2 suv=uv+o[i]*uTexel*w;
    vec4 s=texture2D(tNormal,suv);
    float ids=texture2D(tLight,suv).r;
    if(c.w<=0.0&&s.w<=0.0)continue;
    if(c.w<=0.0||s.w<=0.0){e=max(e,1.0);continue;}
    float dz=abs(s.w-c.w)/max(c.w,.1);
    float facing=max(.15,abs(c.z));
    float de=smoothstep(.012/facing,.035/facing,dz);
    float ne=smoothstep(.25,.45,1.0-dot(normalize(s.xyz),normalize(c.xyz)));
    float ie=abs(ids-idc)>.0005?1.0:0.0;
    // Copas: solo su silueta contra lo que hay detrás (sin el ruido de las hojas).
    if(fc||surfAt(suv)==2.0){bool both=fc&&surfAt(suv)==2.0;de=both?smoothstep(.25,.5,dz):smoothstep(.05,.12,dz);ne=0.0;ie=both?0.0:ie*.6;}
    e=max(e,max(de,max(ne*.9,ie*.85)));
  }
  return e;
}
float silhouetteAt(vec2 uv,float w){
  vec4 c=texture2D(tNormal,uv);float e=0.0;
  vec2 o[4];o[0]=vec2(1,0);o[1]=vec2(-1,0);o[2]=vec2(0,1);o[3]=vec2(0,-1);
  for(int i=0;i<4;i++){vec4 s=texture2D(tNormal,uv+o[i]*uTexel*w);
    if(c.w<=0.0&&s.w<=0.0)continue;
    if(c.w<=0.0||s.w<=0.0){e=1.0;continue;}
    float near=min(c.w,s.w),far=max(c.w,s.w);
    e=max(e,smoothstep(.10,.25,(far-near)/near));}
  return e;
}
float halftone(float density,vec2 frag,float size){
  if(density<=0.001)return 0.0;
  vec2 p=mat2(.7071,-.7071,.7071,.7071)*frag/size;
  vec2 cell=fract(p)-.5;
  float r=sqrt(clamp(density,0.0,1.0)/3.14159)*1.12;
  float d=length(cell);
  float aa=1.2/size;
  if(density>.55){ // por encima de la mitad: puntos blancos sobre negro
    float rw=sqrt(clamp(1.0-density,0.0,1.0)/3.14159)*1.12;
    return smoothstep(rw-aa,rw+aa,length(fract(p+.5)-.5));
  }
  return 1.0-smoothstep(r-aa,r+aa,d);
}

void main(){
  vec4 A=texture2D(tAlbedo,vUv),N=texture2D(tNormal,vUv),L=texture2D(tLight,vUv);
  float depth=N.w;
  bool sky=depth<=0.0;
  vec3 dir=rayDir(vUv);
  float surf=floor(A.a*31.0+.5);
  // Intercambio exclusivo del césped: suelo verde (8) y hojas 3D (23).
  // El resto del fotograma sigue usando el estilo seleccionado.
  bool grassSurface=!sky&&(surf==8.0||surf==23.0);
  bool treeSurface=!sky&&(surf==2.0||surf==24.0);
  // El tronco conserva su categoría previa (0) para todas las fórmulas existentes.
  if(surf==24.0)surf=0.0;
  int mode=grassSurface?(uMode==6?7:(uMode==7?6:uMode)):uMode;
  if(treeSurface&&uMode==7)mode=6;
  bool transferredPalette=grassSurface||(treeSurface&&uMode==7);
  vec3 surfaceSkyTop=transferredPalette?uGrassSkyTop:uSkyTop;
  vec3 surfaceSkyHorizon=transferredPalette?uGrassSkyHorizon:uSkyHorizon;
  // El shader original de James entrega ya el RGB de pantalla. En Ghibli las
  // hojas pasan directamente, sin otra paleta, luz, saturación, película o gamma.
  if(!sky&&surf==23.0&&mode==6){gl_FragColor=vec4(clamp(A.rgb,0.0,1.0),1.0);return;}
  // Suelo James transferido a Ghibli: misma fórmula, en metros, sin luz. Entre las
  // hojas y más allá del radio de geometría se ve el mismo campo que pintan las hojas.
  bool jamesGround=!sky&&surf==8.0&&mode==6&&uGrassBlend>0.0;
  vec3 jamesColor=vec3(0.0);
  if(jamesGround){
    vec2 juv=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xz/30.0+.5;
    jamesColor=texture2D(uJamesGrass,juv).rgb*2.0-.5;
    jamesColor=mix(jamesColor,texture2D(uJamesCloud,juv+uTime*vec2(.05,.1)).rgb,.4);
    // Entre las hojas cercanas el suelo es la sombra de la raíz.
    jamesColor*=mix(.8,1.0,smoothstep(uGrassR*.45,max(uGrassR,1.0),depth));
  }
  float ao=texture2D(tAO,vUv).r;
  ao=mix(1.0,ao,uAOStrength);
  vec3 wn=sky?vec3(0,1,0):worldN(N.xyz);
  float nl=L.g,shadow=L.b;
  vec3 albedo=A.rgb;
  bool shopGlass=surf==22.0,glass=surf==1.0||shopGlass,water=surf==3.0,foliage=surf==2.0,person=surf==25.0;
  float farLit=0.0;
  if(!sky&&(mode<=2||mode>=6)){vec3 wp0=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;albedo=surfacePattern(albedo,surf,wp0,wn,depth);}
  // Continuidad lejana sin mallas, texturas por mata ni un pase de render adicional.
  if(!sky&&surf==8.0&&uGrassBlend>0.0){vec3 p=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    vec3 james=texture2D(uGrassTexture,p.xz/30.0).rgb*1.5+vec3(.1);
    albedo=mix(albedo,mix(uGrassColor,james,.32)*( .88+.12*vnoise(p.xz*.18)),uGrassBlend);}
  // Ventanas lejanas: rejilla de huecos dibujada sobre las masas del entorno.
  if(surf==20.0&&!sky&&abs(wn.y)<.35){
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    vec2 t=normalize(vec2(-wn.z,wn.x));
    float u=dot(wp.xz,t)/3.1,v=(wp.y+.6)/3.2;
    vec2 f=fract(vec2(u,v));
    float win=step(.27,f.x)*step(f.x,.73)*step(.3,f.y)*step(f.y,.8);
    float px=max(fwidth(u),fwidth(v));
    float m=mix(win,.24,smoothstep(.12,.4,px));
    albedo=mix(albedo,vec3(.045,.07,.11)+reflSkyFar(wn,dir)*.25,m*.85);
    if(uNight>0.0){float lit=step(hash12(floor(vec2(u,v))+floor(wp.xz*.01)),.38*uNight);farLit=lit*m;}
  }
  float lineW=uLineWidth;
  float farFade=1.0-smoothstep(uLineFar*.5,uLineFar,depth);
  float edge=sky?0.0:0.0;
  float ink=0.0;
  if(mode!=1&&mode!=5){
    // El trazo adelgaza y se aclara con la distancia (como el dibujo a mano del fondo).
    float dist=sky?4000.0:depth;
    float thin=mix(1.0,.55,smoothstep(150.0,1400.0,dist));
    float e=edgeAt(vUv,lineW*mix(1.0,.8,smoothstep(150.0,900.0,dist)));
    float s=silhouetteAt(vUv,max(1.0,lineW*uOutline*thin));
    float fade=1.0-smoothstep(1800.0,3600.0,dist);
    ink=max(e*mix(.35,1.0,farFade),s*mix(.45,1.0,farFade))*fade;
  }
  vec3 V=-dir;
  float fres=pow(1.0-max(dot(wn,V),0.0),3.0);
  vec3 reflSky=skyColor(reflect(dir,wn));

  // ---------- Iluminación ----------
  vec3 hemi=mix(uHemiGround,uHemiSky,wn.y*.5+.5);
  vec3 color;
  float litT=0.0;
  if(mode==0){
    // SpanStories · Luz25D + Trigun: plano de sombra definido (con acento), sombra = albedo × tono frío
    // (nunca hacia el negro), ambiente de hemisferio, luz de borde. Mismas fórmulas que el visor.
    float edgeW=max(fwidth(nl)*1.5,uSoft);
    float plane=smoothstep(uThreshold-edgeW,uThreshold+edgeW,nl);
    float accent=smoothstep(.72-edgeW,.72+edgeW,nl)*.10;
    float lit=clamp(plane*.90+accent,0.0,1.0)*smoothstep(.3,.7,shadow);
    float tPlane=clamp((lit-.5)*uContrast+.5,0.0,1.0);
    vec3 tShadow=mix(uShadowTint,mix(uShadowTint,uTTint,.55),uShadowDepth)*mix(1.0,.62,uShadowDepth);
    vec3 tAmbient=mix(hemi,vec3(luma(hemi)),.25);
    color=albedo*mix(tShadow*tAmbient*mix(.78,1.0,ao),uSunColor*vec3(1.05,1.015,.95)*mix(.93,1.0,ao),tPlane);
    float rim=pow(1.0-max(dot(wn,V),0.0),4.0)*smoothstep(-.25,.6,dot(wn,uSunDir));
    color+=albedo*uSunColor*rim*uRim;
    // Reflejo selectivo de Trigun: categorías brillantes del visor, sin aplicar brillo a los muros.
    if(glass||surf==4.0){vec3 halfDir=normalize(uSunDir+V);float spec=pow(max(dot(wn,halfDir),0.0),24.0);color+=uSunColor*smoothstep(.45,.49,spec)*.3;}
    litT=tPlane;
  }else if(mode==6){
    // Zelda · Breath of the Wild: dos tonos con terminador suave, sombra fría y profunda (no pálida),
    // pigmento de acuarela y pinceladas en espacio mundo, copas por masas y borde luminoso.
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    bool blades=surf==23.0;
    bool grass=blades||surf==8.0||surf==12.0&&wn.y>.6&&albedo.g>albedo.r*1.1;
    bool organic=foliage||grass;
    vec2 puv=paintUV(wp,wn);
    float near=1.0-smoothstep(120.0,700.0,depth);
    float wash=fbm2(puv*.33)*.6+fbm2(puv*.07+5.3)*.4; // manchas de aguada (3 m y 14 m)
    float grain=vnoise(puv*2.7)*.6+vnoise(puv*7.9)*.4; // grano del pigmento
    float stroke=vnoise(vec2(dot(puv,vec2(.80,.60))*.9,dot(puv,vec2(-.60,.80))*5.5)); // pincelada diagonal
    if(foliage){
      // Copas como en el visor de Barcelona: la textura aporta solo el valor; el color sale de una
      // paleta oliva por árbol y por zona de la copa. Las copas no verdes (sakura, otoño) conservan su tono.
      vec3 P0[4];
      float pick=hash12(vec2(floor(L.r*977.0),3.0));
      if(pick<.3){P0[0]=vec3(.133,.246,.036);P0[1]=vec3(.226,.339,.051);P0[2]=vec3(.323,.412,.072);P0[3]=vec3(.102,.198,.030);}
      else if(pick<.55){P0[0]=vec3(.178,.231,.045);P0[1]=vec3(.287,.332,.076);P0[2]=vec3(.133,.184,.034);P0[3]=vec3(.351,.366,.102);}
      else if(pick<.8){P0[0]=vec3(.227,.366,.060);P0[1]=vec3(.351,.479,.102);P0[2]=vec3(.178,.292,.045);P0[3]=vec3(.434,.509,.136);}
      else{P0[0]=vec3(.076,.192,.042);P0[1]=vec3(.138,.279,.061);P0[2]=vec3(.054,.153,.030);P0[3]=vec3(.205,.332,.072);}
      float tone=(.5+.5*sin(wp.x*.9+wp.z*.6+sin(wp.y*.7-wp.z*.4)))*3.0;
      int lo=int(floor(tone));vec3 pal=P0[0];
      for(int i=0;i<4;i++){if(i==lo)pal=mix(P0[i],P0[min(i+1,3)],fract(tone));}
      float detail=clamp(luma(albedo)*2.6,.45,1.35);
      bool green=albedo.g>albedo.r*1.08&&albedo.g>albedo.b*1.15;
      pal=mix(vec3(luma(pal)),pal,.82);
      albedo=green?pal*detail*1.05:albedo*vec3(1.02,.98,.95);
    }else if(blades){
      // Matas 3D: conservan su color de raíz a punta (horneado en la malla).
    }else if(grass){
      // Hierba BotW: verde amarillento saturado con manchas más frías.
      vec3 g1=mix(vec3(.20,.36,.045),albedo,uGrassBlend),g2=g1*1.16,g3=g1*.78;
      float clump=fbm2(puv*.18+2.7);
      vec3 gp=mix(mix(g3,g1,smoothstep(.36,.54,clump)),g2,smoothstep(.58,.80,wash));
      float bladeN=vnoise(puv*vec2(9.0,2.2))*.5+vnoise(puv*vec2(2.4,10.0))*.5; // hebras cruzadas
      albedo=gp*(.62+.38*grain+.30*(bladeN-.5)*near);
      // Bajo las matas 3D el suelo hace de sombra de raíz: da profundidad entre las hojas.
      if(uGrassR>0.0)albedo*=mix(.94,1.0,smoothstep(uGrassR*.55,uGrassR,depth));
    }
    if(person){
      zCharacter(albedo,wn,V,nl,shadow,ao,hemi,surfaceSkyTop,color,litT);
    }else if(uMode==7){
    // Árboles y césped transferidos a Ghibli: fórmula Zelda 0.14.2 sin cambios.
    if(!organic)albedo=pow(max(mix(vec3(luma(albedo)),albedo,1.28),0.0),vec3(1.12));
    float pig=(wash-.5)*(organic?.34:.30)+(grain-.5)*(organic?.18:.14);
    albedo*=1.0+pig*near;
    albedo*=mix(vec3(1.0),mix(vec3(.95,.99,1.06),vec3(1.05,1.0,.93),wash),.6*near);
    float w=.14+uSoft;
    float thr=uThreshold+(foliage?.22:0.0);
    float dif=smoothstep(thr-w,thr+w,nl);
    float castL=smoothstep(.22,.78,shadow);
    float lit=dif*castL;
    lit=clamp(lit+(stroke-.5)*.22*near*(1.0-abs(lit*2.0-1.0)),0.0,1.0);
    vec3 sunC=uSunColor*vec3(1.10,1.0,.82)*1.16;
    vec3 tint=uShadowTint/max(luma(uShadowTint),.01);
    vec3 shadeC=mix(vec3(.33,.36,.45),vec3(.17,.29,.30),foliage?1.0:(grass?.6:0.0))*mix(vec3(1.0),tint,.25);
    shadeC*=mix(.80,1.12,wn.y*.5+.5)*clamp(luma(hemi),.2,1.2);
    vec3 groundBounce=vec3(.10,.08,.04)*max(-wn.y,0.0);
    color=albedo*(mix(shadeC,sunC,lit)+groundBounce);
    float pool=4.0*lit*(1.0-lit);
    color*=1.0-pool*.10;color=mix(color,color*vec3(.92,.96,1.08),pool*.3);
    color*=1.0-mix(.10,.30,1.0-lit)*(stroke-.5)*near;
    color*=mix(vec3(.50,.57,.70),vec3(1.0),ao);
    float rimF=pow(1.0-max(dot(wn,V),0.0),3.0);
    float sunSide=smoothstep(-.3,.5,dot(wn,uSunDir));
    color+=albedo*rimF*(organic?.30:.22)*mix(surfaceSkyTop*.7,sunC,sunSide);
    if(organic)color+=albedo*sunC*.22*pow(max(dot(-V,uSunDir),0.0),3.0)*(1.0-lit*.5);
    if(!organic&&!glass){vec3 hd=normalize(uSunDir+V);color+=sunC*pow(max(dot(wn,hd),0.0),40.0)*.06*lit;}
    litT=lit;
    }else{
    // Color de pintura: saturado pero claro (BotW es luminoso, no oscuro ni pastel lavado).
    if(!organic)albedo=pow(max(mix(vec3(luma(albedo)),albedo,1.12),0.0),vec3(1.04));
    // Pigmento de acuarela: aguadas de valor y temperatura, más marcadas en lo orgánico.
    float pig=(wash-.5)*(organic?.30:.26)+(grain-.5)*(organic?.14:.10);
    albedo*=1.0+pig*near;
    albedo*=mix(vec3(1.0),mix(vec3(.94,.99,1.07),vec3(1.06,1.0,.92),wash),.55*near);
    // Luz de dos tonos: el terminador lo dibuja el pincel (pinceladas y aguadas lo desplazan).
    float w=.08+uSoft*.6;
    float thr=uThreshold+(foliage?.22:0.0);
    float nlP=nl+((stroke-.5)*.20+(wash-.5)*.12)*near;
    float dif=smoothstep(thr-w,thr+w,nlP);
    // Sombra arrojada con borde irregular de papel mojado, no un desenfoque uniforme.
    float castL=smoothstep(.30,.70,shadow+(grain-.5)*.30*near);
    float lit=dif*castL;
    vec3 sunC=uSunColor*vec3(1.08,1.0,.84)*1.12;
    // Sombra de color: el pigmento se concentra (más croma) y se enfría; nunca gris.
    vec3 chroma=max(mix(vec3(luma(albedo)),albedo,1.35),0.0);
    vec3 tint=uShadowTint/max(luma(uShadowTint),.01);
    vec3 shadeC=mix(vec3(.46,.50,.76),vec3(.26,.42,.46),foliage?1.0:(grass?.6:0.0))*mix(vec3(1.0),tint,.2);
    shadeC*=mix(.86,1.14,wn.y*.5+.5)*clamp(luma(hemi),.25,1.2);
    vec3 groundBounce=vec3(.12,.09,.04)*max(-wn.y,0.0)+vec3(.05,.04,.02)*(1.0-abs(wn.y));
    color=mix(chroma*(shadeC+groundBounce),albedo*sunC,lit);
    // La sombra la ilumina el cielo: relleno azul en lo que mira al cielo y a los lados.
    color+=albedo*surfaceSkyTop*(1.0-lit)*.16*(wn.y*.3+.7)*(foliage?.4:1.0);
    // Franja del terminador: el color se satura y se calienta donde la luz se apaga (aguada que se seca).
    float band=smoothstep(.0,.45,lit)*(1.0-smoothstep(.45,.95,lit));
    color+=chroma*sunC*vec3(1.0,.55,.32)*band*.16;
    // Borde húmedo: pigmento acumulado justo dentro de la sombra.
    float wet=smoothstep(.0,.18,lit)*(1.0-smoothstep(.18,.42,lit));
    color*=1.0-wet*.14*near;
    // Pincelada visible dentro de la sombra (granulación del pigmento).
    color*=1.0-mix(.06,.24,1.0-lit)*(stroke-.5)*near;
    // Oclusión de contacto teñida de azul violáceo.
    color*=mix(vec3(.55,.58,.78),vec3(1.0),ao);
    // Borde luminoso (silueta), cálido del lado del sol y celeste en la sombra.
    float rimF=pow(1.0-max(dot(wn,V),0.0),3.0);
    float sunSide=smoothstep(-.3,.5,dot(wn,uSunDir));
    color+=albedo*rimF*(organic?.30:.20)*mix(surfaceSkyTop*.75,sunC,sunSide);
    // Translucidez de las hojas a contraluz.
    if(organic)color+=albedo*sunC*.24*pow(max(dot(-V,uSunDir),0.0),3.0)*(1.0-lit*.5);
    // Brillo suave de piedra/metal húmedo.
    if(!organic&&!glass){vec3 hd=normalize(uSunDir+V);color+=sunC*pow(max(dot(wn,hd),0.0),40.0)*.05*lit;}
    litT=lit;
    }
  }else if(mode==7){
    // Césped en Zelda: verde lima de BotW, más claro y amarillo, con sombras abiertas.
    bool zGrass=uMode==6&&grassSurface;
    if(zGrass){float gl=luma(albedo);albedo=mix(albedo/max(gl,.02),vec3(1.0,1.2,.38),.45)*gl*1.38;}
${ghibliSurface}
    if(zGrass)color+=albedo*hemi*.12*(1.0-litT);
  }else if(mode==8){
${dispatchSurface}
  }else if(mode==5){
    vec3 clay=vec3(.80)*(glass?.85:1.0);
    float lit=max(nl,0.0)*shadow;
    color=clay*(uSunColor*lit*.85+hemi*.48)*ao;
    litT=lit;
  }else{
    float lit=max(nl,0.0)*shadow;
    color=albedo*(uSunColor*lit*.92+hemi*.5*mix(.55,1.0,ao))*mix(.75,1.0,ao);
    litT=lit;
  }
  if(glass&&mode!=5&&mode!=7){
    vec3 g=mix(albedo*(shopGlass?1.35:.8),reflSky*.95,clamp((shopGlass?.08:.28)+fres*.55,0.0,1.0)*uWindowReflect);
    // brillo diagonal de ventana anime
    vec3 reflection=reflect(dir,wn);
    float ribbon=abs(reflection.y*.8+reflection.x*.25-.19);
    float streak=shopGlass?(1.0-smoothstep(.018,.032,ribbon))*.07:0.0;
    color=mix(g,g*1.12,litT*.4)+streak;
  }
  if(farLit>0.0&&(mode<=2||mode>=6))color=mix(color,vec3(1.0,.8,.5)*1.2,farLit);
  if(uNight>0.0&&!sky&&(mode<=2||mode>=6)){
    float rnd=fract(sin(L.r*917.13)*43758.5453);
    if(glass&&!shopGlass&&rnd<.55*uNight){color=mix(color,vec3(1.0,.78,.45)*(1.1+rnd),clamp(uNight*1.2,0.0,1.0));}
    if(surf==5.0)color=albedo*(1.0+2.5*uNight);
  }
  if(water&&mode!=5&&mode!=7){color=mix(albedo*.75,reflSky,.35+fres*.5)+uSunColor*pow(max(dot(reflect(-uSunDir,wn),V),0.0),60.0)*.6;}
  if(mode==7&&(glass||water))color+=mix(hemi,uSunColor,.35)*pow(1.0-max(dot(wn,V),0.0),4.0)*(glass?.09*uWindowReflect:.12);
  if(surf==26.0)color=albedo*(vec3(.78)+vec3(1.0,.79,.52)*L.a*2.5);
  else color+=albedo*L.a*2.5;

  // ---------- Atmósfera ----------
  if(sky){color=mode==6?zSky(dir):skyColor(dir);
    if(uNight>.5&&mode!=7){vec2 st=dir.xz/max(.05,dir.y+.15)*90.0;float h=hash12(floor(st));float star=step(.995,h)*smoothstep(.0,.25,dir.y);color+=vec3(star)*(uNight-.5)*1.6;}}
  else if(mode==0){
    float f=(1.0-exp(-max(0.0,depth-80.0)*.00065));
    color=mix(color,mix(uHemiGround,uHemiSky,.72)*uSunColor*mix(vec3(1.0),uSkyHorizon/max(luma(uSkyHorizon),.01)*.9,.35),clamp(f,0.0,.6));
  }
  else if(mode==6){
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    float distanceToCamera=length(wp-uViewInv[3].xyz);
    // Perspectiva aérea de BotW: los planos lejanos se vuelven azul claro y pierden contraste;
    // hacia el sol la bruma se calienta. Más densa a ras de suelo.
    // Densidad integrada por altura: a ras de suelo la bruma es plena; mirando desde arriba el aire es fino.
    float dh=abs(uViewInv[3].y-wp.y);
    float heightK=1.0/(1.0+dh*.012);
    float fog=(1.0-exp(-max(0.0,distanceToCamera-45.0)*.0017*heightK));
    vec3 hz=zHaze(normalize(vec3(dir.x,max(dir.y,.0),dir.z)),surfaceSkyTop,surfaceSkyHorizon);
    color=mix(color,mix(vec3(luma(color)),color,.65),clamp(fog*1.5,0.0,1.0)*.6);
    color=mix(color,hz,clamp(fog,0.0,.82));
    // horizonte lejano fundido con el cielo pintado
    vec3 horizonDir=normalize(vec3(dir.x,max(dir.y,.0),dir.z));
    vec3 horizonSky=transferredPalette?zSkyPalette(horizonDir,uGrassSkyTop,uGrassSkyHorizon,uGrassSkyCloud,uGrassCloudAmount):zSky(horizonDir);
    color=mix(color,horizonSky,smoothstep(1400.0,4200.0,distanceToCamera)*heightK);
  }
  else if(mode==7){
${ghibliAtmosphere}
  }
  else if(mode==8){
${dispatchAtmosphere}
  }
  else if(mode<=2){
    float f=(1.0-exp(-max(0.0,depth-uHazeStart)*uHazeDensity));
    color=mix(color,mix(uHaze,skyColor(normalize(vec3(dir.x,max(dir.y,.02),dir.z))),.5),clamp(f,0.0,.85));
  }
  if(!sky&&mode<=2){float fz=smoothstep(2600.0,7500.0,depth);color=mix(color,skyColor(normalize(vec3(dir.x,max(dir.y,.0),dir.z))),fz);}
  // saturación
  color=mix(vec3(luma(color)),color,mode==0?1.1:(mode==6?1.12:(mode==7?1.0:(mode==8?1.08:uSaturation))));

  // ---------- Estilos de dibujo ----------
  if(mode==0){
    // contorno: el relleno ×0,55 en sRGB (≈ ×0,27 en lineal), nunca negro
    vec3 lineCol=color*.27;
    color=mix(color,lineCol,ink*.9);
  }else if(mode==6){
    // BotW casi no tiene tinta: solo un oscurecido fino de silueta cercana.
    float zOutline=.16*(1.0-smoothstep(40.0,220.0,depth));
    color=mix(color,color*vec3(.30,.33,.42),ink*zOutline);
    // Respuesta suave sobre la luminancia: las luces no se queman y el croma se conserva
    // (la curva por canal anterior lavaba los colores hacia el pastel).
    if(uMode==7){
      // Partes transferidas a Ghibli: respuesta 0.14.2 sin cambios.
      color=1.0-exp(-color*1.45);
      color=mix(color,color*color*(3.0-2.0*color),.18);
      color*=.985+.03*vnoise(gl_FragCoord.xy*.45);
    }else{
      float cl=luma(color);
      color*=(1.0-exp(-cl*1.3))/max(cl*1.12,1e-4);
      color=mix(color,color*color*(3.0-2.0*color),.12);
    }
  }else if(mode==8){
${dispatchInk}
  }else if(mode==7){
    float delicate=.3*(1.0-smoothstep(45.0,380.0,depth));
    color=mix(color,color*.55,ink*delicate);
  }else if(mode==2){
    color=mix(color,uInk,ink*.92);
  }else if(mode==3||mode==4){
    vec3 paper=uPaper;
    float val=1.0;
    if(mode==4&&!sky){
      // Densidad de trama: color propio oscuro + sombra (propia o arrojada) + oclusión.
      float own=luma(albedo);
      float light=clamp(litT,0.0,1.0);
      float dA=clamp(1.0-own*1.9,0.0,1.0)*.5;
      float dS=(1.0-light)*.34;
      float dO=(1.0-ao)*.4;
      float dens=clamp(dA+dS+dO,0.0,1.0);
      if(glass)dens=mix(.5,.9,1.0-light)-fres*.15;
      if(foliage){float up=clamp(nl*.7+.5,0.0,1.0);dens=mix(.95,.3,up)*mix(1.0,.85,shadow);}
      if(water)dens=.35+fres*.2;
      // perspectiva aérea: el fondo se aclara
      float air=smoothstep(250.0,1600.0,depth);
      dens*=1.0-air*.75;
      float beta=step(uBeta,dens)*(1.0-air);
      float dots=halftone(clamp(dens*uToneOpacity,0.0,.78),gl_FragCoord.xy,uToneSize);
      val=1.0-max(dots,beta);
    }
    color=paper*val;
    color=mix(color,uInk,ink);
  }
  if(jamesGround){
    // Bruma Zelda aplicada al color de pantalla de James (la web no tiene bruma; cerca es cero).
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    float dh=abs(uViewInv[3].y-wp.y),fog=1.0-exp(-max(0.0,length(wp-uViewInv[3].xyz)-45.0)*.0017/(1.0+dh*.012));
    vec3 j=mix(clamp(jamesColor,0.0,1.0),toSRGB(zHaze(normalize(vec3(dir.x,max(dir.y,.0),dir.z)),surfaceSkyTop,surfaceSkyHorizon)),clamp(fog,0.0,.82));
    gl_FragColor=vec4(mix(toSRGB(color),j,uGrassBlend),1.0);return;
  }
  gl_FragColor=vec4(toSRGB(color),1.0);
}`;

// Acuarela en pantalla (solo Zelda): filtro de Kuwahara suave (manchas de pincel que respetan los bordes),
// oscurecimiento del borde húmedo entre manchas, temblor de la mano y granulación del papel.
// El radio crece con la distancia: los personajes y lo cercano conservan su dibujo.
const paintFrag=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor,tNormal,tAlbedo;
uniform vec2 uTexel;
uniform float uPaint,uScale;
float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  float depth=texture2D(tNormal,vUv).w;
  float surf=floor(texture2D(tAlbedo,vUv).a*31.0+.5);
  float far=depth<=0.0?1.0:smoothstep(3.0,70.0,depth);
  float r=mix(.8,2.2,far)*uPaint*uScale;
  if(surf==25.0)r=min(r,.7*uScale);
  // Temblor del pincel: los bordes ondulan un poco, fijos a la pantalla como el papel.
  vec2 frag=gl_FragCoord.xy/uScale;
  vec2 wob=(vec2(vn(frag*.045),vn(frag*.045+31.7))-.5)*1.6*uPaint*uScale;
  vec2 uv=vUv+wob*uTexel;
  // Cuatro cuadrantes de 2×2 que comparten el centro y los ejes: 9 lecturas por píxel.
  vec3 t[9];
  for(int j=0;j<3;j++)for(int i=0;i<3;i++)t[j*3+i]=texture2D(tColor,uv+vec2(float(i-1),float(j-1))*r*uTexel).rgb;
  vec3 acc=vec3(0.0);float wsum=0.0,lo=9.0,hi=0.0;
  for(int q=0;q<4;q++){
    int bx=q-2*(q/2),by=q/2;
    vec3 a=t[by*3+bx],b=t[by*3+bx+1],c2=t[(by+1)*3+bx],d=t[(by+1)*3+bx+1];
    vec3 mean=(a+b+c2+d)*.25,v=abs((a*a+b*b+c2*c2+d*d)*.25-mean*mean);
    float var=v.r+v.g+v.b;
    float wq=1.0/(1e-5+pow(var*40.0,2.0));
    acc+=mean*wq;wsum+=wq;
    float lq=lum(mean);lo=min(lo,lq);hi=max(hi,lq);
  }
  vec3 orig=t[4];
  vec3 c=mix(orig,acc/wsum,clamp(uPaint,0.0,1.0));
  // Borde húmedo: el pigmento se acumula donde dos manchas se tocan (modelo de Bousseau: C-(C-C²)·d).
  float edge=smoothstep(.02,.22,hi-lo)*uPaint;
  c-=(c-c*c)*edge*.55;
  // Granulación y fibra del papel: más visible en las aguadas medias y oscuras.
  float paper=vn(frag*.9)*.55+vn(frag*.23)*.3+vn(frag*vec2(.08,.5))*.15;
  c-=(c-c*c)*(paper-.5)*.30*uPaint;
  gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
}`;

const lin=hex=>new THREE.Color(hex);

export class Pipeline{
  constructor(renderer){
    this.renderer=renderer;
    this.size=new THREE.Vector2(1,1);
    this.gbuffer=new THREE.WebGLRenderTarget(1,1,{count:3,type:THREE.HalfFloatType,samples:4,depthBuffer:true});
    this.gbuffer.textures.forEach((t,i)=>{t.name=['albedo','normal','light'][i];t.minFilter=t.magFilter=THREE.NearestFilter;});
    this.aoA=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
    this.aoB=this.aoA.clone();
    this.paintRT=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,depthBuffer:false});
    const tri=new THREE.BufferGeometry();
    tri.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    tri.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
    this.quadScene=new THREE.Scene();this.quadCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.quad=new THREE.Mesh(tri);this.quad.frustumCulled=false;this.quadScene.add(this.quad);
    const proj={value:new THREE.Vector4()};this.proj=proj;
    this.ao=new THREE.ShaderMaterial({vertexShader:quadVert,fragmentShader:aoFrag,uniforms:{tNormal:{value:null},uTexel:{value:new THREE.Vector2()},uRadius:{value:.9},uStrength:{value:1.4},uProj:proj},depthTest:false,depthWrite:false});
    this.paint=new THREE.ShaderMaterial({vertexShader:quadVert,fragmentShader:paintFrag,uniforms:{tColor:{value:null},tNormal:{value:null},tAlbedo:{value:null},uTexel:{value:new THREE.Vector2()},uPaint:{value:1},uScale:{value:1}},depthTest:false,depthWrite:false});
    this.blur=new THREE.ShaderMaterial({vertexShader:quadVert,fragmentShader:blurFrag,uniforms:{tAO:{value:null},tNormal:{value:null},uDir:{value:new THREE.Vector2()}},depthTest:false,depthWrite:false});
    this.params={mode:MODES.spanstories,...STYLE_DEFAULTS};
    // Ambiente «Mediodía» de Luz25D + estilo Trigun (paleta del visor SpanStories).
    this.colors={sunColor:lin('#fffaf0').multiplyScalar(1.02),skyTop:lin('#58a9d3'),skyHorizon:lin('#e4d5b7'),skyCloud:lin('#fff0d5'),hemiSky:lin('#ffffff'),hemiGround:lin('#f0eee6'),
      shadowTint:lin('#cbcfe6').lerp(lin('#ffffff'),.35),tTint:lin('#69759c'),ink:lin('#1d1c22'),paper:lin('#ffffff'),haze:lin('#e4d5b7')};
    this.composite=new THREE.ShaderMaterial({vertexShader:quadVert,fragmentShader:compositeFrag,depthTest:false,depthWrite:false,
      uniforms:{...ghibliUniforms(),...dispatchUniforms(),tAlbedo:{value:null},tNormal:{value:null},tLight:{value:null},tAO:{value:null},uTexel:{value:new THREE.Vector2()},uMode:{value:0},
        uGrassSkyTop:{value:new THREE.Color()},uGrassSkyHorizon:{value:new THREE.Color()},uGrassSkyCloud:{value:new THREE.Color()},uGrassCloudAmount:{value:0},
      uViewInv:{value:new THREE.Matrix4()},uSunDir:{value:new THREE.Vector3(0,1,0)},uProj:proj,uTime:{value:0},uNight:{value:0},uGrassR:{value:0},uGrassColor:{value:new THREE.Color('#72a53b')},uGrassBlend:{value:0},uGrassTexture:{value:null},uJamesGrass:{value:null},uJamesCloud:{value:null},uZBruma:{value:lin('#a7c3cb')},
        ...Object.fromEntries(Object.keys(this.colors).map(k=>['u'+k[0].toUpperCase()+k.slice(1),{value:new THREE.Color()}])),
        ...Object.fromEntries(['lineWidth','outline','toneSize','toneOpacity','beta','aoStrength','hazeDensity','hazeStart','threshold','soft','contrast','shadowDepth','rim','saturation','lineFar','cloudAmount','windowReflect'].map(k=>['u'+(k==='beta'?'Beta':k[0].toUpperCase()+k.slice(1)),{value:0}]))}});
  }
  setAmbient(id){
    const A=AMBIENTS[id]??AMBIENTS.mediodia;this.ambient=id;
    const c=this.colors;
    c.sunColor.copy(lin(A.sun)).multiplyScalar(A.k);
    c.hemiSky.copy(lin(A.sky));c.hemiGround.copy(lin(A.ground));
    c.shadowTint.copy(lin(A.shadow)).lerp(lin('#ffffff'),1-Math.min(A.force,1));
    c.skyTop.copy(lin(A.top));c.skyHorizon.copy(lin(A.horizon));c.skyCloud.copy(lin(A.cloud));c.haze.copy(lin(A.horizon));
    this.params.threshold=A.threshold;this.params.soft=.035;this.params.cloudAmount=A.clouds??.22;
    this.composite.uniforms.uNight.value=A.night;
    return A;
  }
  setSize(w,h,dpr){
    const W=Math.max(1,Math.round(w*dpr)),H=Math.max(1,Math.round(h*dpr));
    if(this.size.x===W&&this.size.y===H)return;
    this.size.set(W,H);
    this.gbuffer.setSize(W,H);
    const aw=Math.max(1,Math.round(W/2)),ah=Math.max(1,Math.round(H/2));
    this.aoA.setSize(aw,ah);this.aoB.setSize(aw,ah);this.paintRT.setSize(W,H);
  }
  updateUniforms(camera,sunDir){
    const e=camera.projectionMatrix.elements;
    this.proj.value.set(e[0],e[5],e[8],e[9]);
    const u=this.composite.uniforms;
    updateGhibliAmbient(u,this.ambient);updateDispatchAmbient(u,this.ambient);
    if(this.params.mode===MODES.ghibli){
      this.disposeGhibliClouds??=loadGhibliClouds(u,()=>this.onStyleReady?.());
    }
    u.uViewInv.value.copy(camera.matrixWorld);
    u.uSunDir.value.copy(sunDir);
    u.uMode.value=this.params.mode;
    u.uTime.value=performance.now()/1000;
    for(const [k,v]of Object.entries(this.colors))u['u'+k[0].toUpperCase()+k.slice(1)].value.copy(v);
    // Paleta Zelda original del césped transferido, independiente del cielo de la escena.
    u.uGrassSkyTop.value.copy(this.colors.skyTop);u.uGrassSkyHorizon.value.copy(this.colors.skyHorizon);
    u.uGrassSkyCloud.value.copy(this.colors.skyCloud);u.uGrassCloudAmount.value=this.params.cloudAmount;
    if(!this.ambient||this.ambient==='mediodia'){
      u.uGrassSkyTop.value.set('#3f8fda');u.uGrassSkyHorizon.value.set('#d4e8ec');
      u.uGrassSkyCloud.value.set('#ffffff');u.uGrassCloudAmount.value=.48;
    }
    // El cielo Zelda sustituye al de mediodía; los otros ambientes conservan su hora/clima.
    // Solo cambia uniformes del fotograma: al volver a Trigun se recupera su cielo intacto.
    if(this.params.mode===MODES.zelda&&(!this.ambient||this.ambient==='mediodia')){
      u.uSkyTop.value.set('#3f8fda');u.uSkyHorizon.value.set('#d4e8ec');u.uSkyCloud.value.set('#ffffff');
    }
    for(const [k,v]of Object.entries(this.params)){const name='u'+(k==='beta'?'Beta':k[0].toUpperCase()+k.slice(1));if(u[name]&&k!=='mode')u[name].value=v;}
    if(this.params.mode===MODES.zelda&&(!this.ambient||this.ambient==='mediodia'))u.uCloudAmount.value=.48;
    // Las líneas y la trama se miden en píxeles de pantalla CSS.
    // Grosor y trama proporcionales a la altura de la imagen (pantalla o PNG grande).
    const scale=Math.max(1,this.size.y/1000);
    u.uLineWidth.value=this.params.lineWidth*Math.max(1,this.size.y/850);u.uToneSize.value=this.params.toneSize*scale;
  }
  render(scene,camera,sunDir,target=null){
    const r=this.renderer;
    this.updateUniforms(camera,sunDir);
    r.setRenderTarget(this.gbuffer);
    r.setClearColor(0x000000,0);r.clear(true,true,true);
    r.render(scene,camera);
    const [tA,tN,tL]=this.gbuffer.textures;
    const useAO=this.params.aoStrength>0;
    if(useAO){
      this.quad.material=this.ao;this.ao.uniforms.tNormal.value=tN;
      r.setRenderTarget(this.aoA);r.render(this.quadScene,this.quadCam);
      this.quad.material=this.blur;this.blur.uniforms.tNormal.value=tN;
      this.blur.uniforms.tAO.value=this.aoA.texture;this.blur.uniforms.uDir.value.set(1/this.aoA.width,0);
      r.setRenderTarget(this.aoB);r.render(this.quadScene,this.quadCam);
      this.blur.uniforms.tAO.value=this.aoB.texture;this.blur.uniforms.uDir.value.set(0,1/this.aoA.height);
      r.setRenderTarget(this.aoA);r.render(this.quadScene,this.quadCam);
    }
    const u=this.composite.uniforms;
    u.tAlbedo.value=tA;u.tNormal.value=tN;u.tLight.value=tL;u.tAO.value=this.aoA.texture;
    u.uTexel.value.set(1/this.size.x,1/this.size.y);
    if(!useAO)u.uAOStrength.value=0;
    this.quad.material=this.composite;
    const paint=this.params.mode===MODES.zelda&&this.params.paint>0;
    r.setRenderTarget(paint?this.paintRT:target);r.render(this.quadScene,this.quadCam);
    if(paint){
      const p=this.paint.uniforms;p.tColor.value=this.paintRT.texture;p.tNormal.value=tN;p.tAlbedo.value=tA;
      p.uTexel.value.set(1/this.size.x,1/this.size.y);p.uPaint.value=this.params.paint;p.uScale.value=Math.max(1,this.size.y/900);
      this.quad.material=this.paint;r.setRenderTarget(target);r.render(this.quadScene,this.quadCam);
    }
    const mask=camera.layers.mask,autoClear=r.autoClear;
    camera.layers.set(3);r.autoClear=false;r.setRenderTarget(target);
    scene.traverse(o=>{if(o.userData.ss_rol==='vidrio_escaparate'&&o.material?.uniforms?.tDepth){o.material.uniforms.tDepth.value=tN;o.material.uniforms.uSize.value.copy(this.size);}});
    r.render(scene,camera);camera.layers.mask=mask;r.autoClear=autoClear;
    renderBlenderCommerce(this,scene,camera,sunDir,target);
  }
  dispose(){this.blenderDepth?.dispose();this.blenderLights?.removeFromParent();this.disposeGhibliClouds?.();this.gbuffer.dispose();this.aoA.dispose();this.aoB.dispose();this.paintRT.dispose();this.paint.dispose();this.ao.dispose();this.blur.dispose();this.composite.dispose();}
}
