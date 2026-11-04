import * as T from '../../three.js';

export const TEXTURA_NUBES=Object.freeze({ancho:768,alto:538});
// Continuous horizontal drift, with fixed elevation and angular size.
export const VELOCIDAD_NUBES_GRADOS=.25;
export const TEXTURAS_NUBES=Object.freeze([
  {archivo:'nube-ghibli-alta.png',uniforme:'uGNubes'},
  {archivo:'nube-ghibli-compacta.png',uniforme:'uGNubesCompactas'},
  {archivo:'nube-ghibli-alargada.png',uniforme:'uGNubesAlargadas'},
]);
// Angular sizes, independent of camera FOV, screen resolution and city dimensions.
export const NUBES=Object.freeze([
  {direccion:[-.8,.38,-.6],anchoGrados:28},
  {direccion:[.65,.52,-.55],anchoGrados:34},
  {direccion:[.25,.42,.9],anchoGrados:30},
]);
const nubeGLSL=i=>`gCloud(d,normalize(vec3(${NUBES[i].direccion.map(n=>Number(n).toFixed(2)).join(',')})),${Math.tan(NUBES[i].anchoGrados*Math.PI/360).toFixed(7)},${TEXTURAS_NUBES[i].uniforme})`;

// Three generated paintings based on the original Ghibli reference, with full silhouettes.
export function preparar({uniformes:u}) {
  let disposed=false,loaded=0;
  u.uGNubesListas.value=0;
  const textures=TEXTURAS_NUBES.map(({archivo,uniforme})=>{
    const texture=new T.TextureLoader().load(new URL(`./assets/${archivo}?v=png-generado-v1`,import.meta.url).href,()=>{
      if(disposed)return;
      if(++loaded===TEXTURAS_NUBES.length)u.uGNubesListas.value=1;
    });
    texture.colorSpace=T.SRGBColorSpace;u[uniforme].value=texture;
    return texture;
  });
  return ()=>{disposed=true;for(const texture of textures)texture.dispose();};
}

export const fragmentoCielo=/* glsl */`
  uniform vec3 uGCenit,uGHorizonte,uGNubeLuz,uGNubeSombra;
  uniform float uGNubesListas,uGCieloLuz,uGLluvia,uSkyTime;
  uniform sampler2D uGNubes,uGNubesCompactas,uGNubesAlargadas;
  uniform vec3 uLuzDir;
  varying vec3 vSkyRay;
  vec4 gCloud(vec3 d,vec3 anchor,float halfWidth,sampler2D cloudTexture){
    float angle=mod(uSkyTime*${(VELOCIDAD_NUBES_GRADOS*Math.PI/180).toFixed(10)},6.28318530718);
    float c=cos(angle),s=sin(angle);
    anchor=vec3(c*anchor.x+s*anchor.z,anchor.y,-s*anchor.x+c*anchor.z);
    vec3 right=normalize(cross(vec3(0,1,0),anchor)),up=cross(anchor,right);
    float facing=dot(d,anchor);
    vec2 extent=vec2(halfWidth,halfWidth/${(TEXTURA_NUBES.ancho/TEXTURA_NUBES.alto).toFixed(7)});
    vec2 uv=vec2(dot(d,right),dot(d,up))/max(facing,.08)/(2.0*extent)+.5;
    vec2 dx=dFdx(uv),dy=dFdy(uv);
    // Skip texture work outside the cloud; explicit gradients keep mipmaps stable at the edge.
    if(facing<=.1||any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return vec4(0.0);
    vec4 paint=textureGrad(cloudTexture,uv,dx,dy);
    float pigment=dot(paint.rgb,vec3(.2126,.7152,.0722));
    float light=smoothstep(.14,.55,pigment)*.82+max(dot(d,uLuzDir),0.0)*.12;
    return vec4(mix(uGNubeSombra,uGNubeLuz,light),paint.a*uGNubesListas);
  }
  void main(){
    vec3 d=normalize(vSkyRay);
    vec3 color=mix(uGHorizonte,uGCenit,pow(clamp(d.y,0.0,1.0),.55));
    vec4 farCloud=${nubeGLSL(0)};
    vec4 nearCloud=${nubeGLSL(1)};
    vec4 eastCloud=${nubeGLSL(2)};
    color=mix(color,mix(uGHorizonte,farCloud.rgb,.8),farCloud.a*.85);
    color=mix(color,eastCloud.rgb,eastCloud.a*.92);
    color=mix(color,nearCloud.rgb,nearCloud.a);
    color=mix(color,mix(uGCenit,uGHorizonte,.65),uGLluvia*.3)*uGCieloLuz;
    gl_FragColor=vec4(color,1.0);
    #include <colorspace_fragment>
  }
`;
