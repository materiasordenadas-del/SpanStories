// Estilo Dispatch (AdHoc Studio, 2025): «anime occidental» de cómic. Personajes y edificios con cel de
// dos tonos de borde duro, sombras de color violáceo (nunca grises), tinta limpia teñida que adelgaza
// hasta desaparecer en los fondos pintados a gouache, luz cálida de atardecer y borde de neón en la sombra.
// Paletas propias por ambiente; el resto del pase diferido (G-buffer, AO, líneas) es el común.
import * as THREE from 'three';

// cenit, horizonte, resplandor del sol, sombra, borde de la sombra, bruma, tinta, luz del cielo
export const DISPATCH_PALETTES={
  manana:['#3f7fc4','#f3d6b0','#ffd9a0','#8a86c8','#7fd4e6','#c9cfe0','#2a2440',1],
  mediodia:['#3d86d6','#f1dcb8','#fff0c8','#8c8acb','#86d8ea','#cbd6e4','#262338',1],
  tarde:['#3b3f8f','#ff9a5c','#ffb070','#7a64b0','#ff6fa8','#d79a8c','#2a1830',1],
  nublado:['#7d8ea8','#cdd2d6','#e6e6e0','#8d93b4','#a8c4d4','#b9c1c9','#2b2c38',.9],
  noche:['#0d1030','#4a2f6e','#ff7fbf','#3c3a78','#3fe0ff','#3a3360','#120c22',.45],
};
const colorNames=['uDCenit','uDHorizonte','uDResplandor','uDSombra','uDBorde','uDBruma','uDTinta'];
export function dispatchUniforms(){return {
  ...Object.fromEntries(colorNames.map(name=>[name,{value:new THREE.Color()}])),uDCieloLuz:{value:1},
};}
export function updateDispatchAmbient(u,ambient){
  const p=DISPATCH_PALETTES[ambient]??DISPATCH_PALETTES.mediodia;
  colorNames.forEach((name,i)=>u[name].value.set(p[i]));u.uDCieloLuz.value=p[7];
}

export const dispatchGLSL=/* glsl */`
uniform vec3 uDCenit,uDHorizonte,uDResplandor,uDSombra,uDBorde,uDBruma,uDTinta;
uniform float uDCieloLuz;
`;
// Cielo pintado: degradado de atardecer, halo ancho del sol y estratos alargados a brochazos.
// Va después de fbm2 (definido en el pase de composición).
export const dispatchSky=/* glsl */`
vec3 dSky(vec3 d){
  float y=clamp(d.y,0.0,1.0);
  vec3 c=mix(uDHorizonte,uDCenit,pow(y,.42));
  float sd=max(dot(d,uSunDir),0.0);
  c+=uDResplandor*(pow(sd,4.0)*.28+pow(sd,64.0)*.6);
  vec2 p=d.xz/max(.07,d.y+.1);
  float n=fbm2(vec2(p.x*.35,p.y*1.9)+vec2(uTime*.003,0.0));
  float band=smoothstep(.55,.62,n)*smoothstep(.02,.1,d.y)*(1.0-smoothstep(.45,.8,d.y));
  float under=smoothstep(.55,.75,fbm2(vec2(p.x*.35,p.y*1.9)+vec2(uTime*.003,-.2)));
  vec3 cloud=mix(mix(uDSombra,uDHorizonte,.45),mix(uDHorizonte,uDResplandor,.6),under);
  c=mix(c,cloud,band*.9);
  c=mix(c,uDHorizonte*1.03,smoothstep(.08,-.02,d.y)*.7);
  return c*uDCieloLuz;
}
`;

export const dispatchSurface=/* glsl */`
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    vec2 puv=paintUV(wp,wn);
    float near=1.0-smoothstep(60.0,520.0,depth);
    // Fondo pintado a gouache: brochazos anchos y planos; cerca, color limpio de cel.
    float brush=fbm2(puv*vec2(.20,.55))*.6+vnoise(puv*1.6)*.4;
    albedo=max(mix(vec3(luma(albedo)),albedo,person?1.05:1.2),0.0);
    albedo*=1.0+(brush-.5)*mix(.24,.08,near);
    // Cel de dos tonos con borde duro y sombra arrojada nítida.
    float w=fwidth(nl)*1.2+.015;
    float thr=uThreshold+(foliage?.18:0.0);
    float dif=smoothstep(thr-w,thr+w,nl);
    float castL=smoothstep(.44,.56,shadow);
    float lit=dif*castL;
    vec3 key=uSunColor*mix(vec3(1.0),uDResplandor/max(luma(uDResplandor),.05),.18)*1.08;
    // Sombra de color: el pigmento se concentra y se enfría hacia el violeta; en la piel, rosada.
    vec3 chroma=max(mix(vec3(luma(albedo)),albedo,1.3),0.0);
    vec3 tint=mix(vec3(1.0),uDSombra/max(luma(uDSombra),.02),.55)*.34;
    float gr=albedo.g/max(albedo.r,.02);
    float skin=person?smoothstep(.18,.28,gr)*(1.0-smoothstep(.55,.7,gr))*step(albedo.b,albedo.g):0.0;
    tint=mix(tint,vec3(.78,.44,.46),skin*.7);
    vec3 shade=chroma*tint*mix(.88,1.08,wn.y*.5+.5)*clamp(luma(hemi),.35,1.15);
    color=mix(shade,albedo*key,lit);
    // Rebote cálido del suelo en las caras que miran hacia abajo.
    color+=albedo*uDResplandor*.06*max(-wn.y,0.0)*(1.0-lit);
    color*=mix(uDSombra/max(luma(uDSombra),.02)*.55,vec3(1.0),ao);
    // Borde de luz: cálido del lado del sol, neón (cian o magenta según la hora) en la sombra.
    float rimF=smoothstep(.55,.8,pow(1.0-max(dot(wn,V),0.0),2.0));
    float sunSide=smoothstep(-.1,.4,dot(wn,uSunDir));
    float rimK=(person?1.0:.55)*near;
    color+=key*albedo*rimF*sunSide*castL*.45*rimK;
    color+=uDBorde*rimF*(1.0-sunSide)*.22*rimK;
    if(!foliage&&!glass){vec3 hd=normalize(uSunDir+V);color+=key*smoothstep(.9,.93,pow(max(dot(wn,hd),0.0),16.0))*.12*lit;}
    litT=lit;
`;
// Perspectiva aérea de fondo pintado: lo lejano pierde la tinta, se aplana y vira a la bruma del ambiente.
export const dispatchAtmosphere=/* glsl */`
    vec3 wp=(uViewInv*vec4(viewPos(vUv,depth),1.0)).xyz;
    float dist=length(wp-uViewInv[3].xyz);
    float dh=abs(uViewInv[3].y-wp.y);
    float heightK=1.0/(1.0+dh*.01);
    float fog=1.0-exp(-max(0.0,dist-60.0)*.0016*heightK);
    vec3 hz=mix(uDBruma,uDHorizonte,.35)*clamp(luma(uSunColor)*1.1,.2,1.15);
    color=mix(color,mix(vec3(luma(color)),color,.75),clamp(fog*1.4,0.0,1.0)*.5);
    color=mix(color,hz,clamp(fog,0.0,.85));
    color=mix(color,dSky(normalize(vec3(dir.x,max(dir.y,.0),dir.z))),smoothstep(1500.0,4200.0,dist)*heightK);
`;
// Tinta limpia del color de la tinta del ambiente (no negra pura), plena cerca y nula en el fondo.
export const dispatchInk=/* glsl */`
    float dInk=1.0-smoothstep(160.0,700.0,depth);
    color=mix(color,mix(uDTinta,color*.18,.35),clamp(ink*1.3,0.0,1.0)*(sky?0.0:dInk));
`;
