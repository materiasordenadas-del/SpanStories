import * as T from '../../three.js';
import { componerEstilo, componerContorno } from '../../StyleShader.js';

// Anime 3DCG: designed shadow planes, selective specular shapes and rim separation.
export const Trigun = Object.freeze({
  id:'Trigun', nombre:'Trigun', descripcion:'Sombras anime definidas, volumen y luz de borde.',
  trazo:.9, cielo:{cenit:'#58a9d3',horizonte:'#e4d5b7',nube:'#fff0d5',nubes:.22},
  contorno:shader=>componerContorno(shader,140,750),
  controles:[
    {clave:'uTContraste',nombre:'Contraste anime',min:.5,max:1.8,paso:.05},
    {clave:'uTSombra',nombre:'Profundidad de sombras',min:0,max:1,paso:.05},
    {clave:'uTSuavidad',nombre:'Transición',min:.005,max:.2,paso:.005},
    {clave:'uTTinte',nombre:'Color de sombra',tipo:'color'},
    {clave:'uTBorde',nombre:'Luz de borde',min:0,max:1,paso:.05},
    {clave:'uTColor',nombre:'Color',min:.5,max:1.5,paso:.05},
    {clave:'uEstiloTrazo',nombre:'Contornos',min:0,max:1.5,paso:.05},
  ],
  crearUniformes:()=>({uTContraste:{value:1.15},uTSombra:{value:.7},uTSuavidad:{value:.035},
    uTTinte:{value:new T.Color('#69759c')},uTBorde:{value:.3},uTColor:{value:1.1}}),
  fragmento(shader){return componerEstilo(shader,{
    codigo:/* glsl */`
      uniform float uTContraste,uTSombra,uTSuavidad,uTBorde,uTColor;
      uniform vec3 uTTinte; uniform float uEstiloCategoria;
      float estiloLuz(float n,float threshold,float softness){
        float edge=max(fwidth(n)*1.5,uTSuavidad);
        float plane=smoothstep(threshold-edge,threshold+edge,n);
        float accent=smoothstep(.72-edge,.72+edge,n)*.10;
        return clamp(plane*.90+accent,0.0,1.0);
      }
    `,
    superficie:/* glsl */`
      vec3 tShadow=mix(sombra,mix(sombra,uTTinte,.55),uTSombra);
      tShadow*=mix(1.0,.62,uTSombra);
      vec3 tAmbient=mix(hemi,vec3(dot(hemi,vec3(.2126,.7152,.0722))),.25);
      float tPlane=clamp((lit-.5)*uTContraste+.5,0.0,1.0);
      vec3 color=albedo*mix(tShadow*tAmbient,luzColor*vec3(1.05,1.015,.95),tPlane);
      vec3 tView=normalize(cameraPosition-vPos);
      float tRim=pow(1.0-max(dot(Nrel,tView),0.0),4.0)*smoothstep(-.25,.6,dot(Nrel,L));
      color+=albedo*luzColor*tRim*uTBorde;
      float tGloss=step(5.5,uEstiloCategoria)*(1.0-step(8.5,uEstiloCategoria));
      float tHair=1.0-step(.25,abs(uEstiloCategoria-11.0));
      vec3 tHalf=normalize(L+tView);
      float tSpec=pow(max(dot(Nrel,tHalf),0.0),mix(24.0,56.0,tHair));
      float tHighlight=smoothstep(.45,.49,tSpec)*max(tGloss*.3,tHair*.18);
      color+=luzColor*tHighlight;
    `,
    acabado:/* glsl */`
      float tValue=dot(color,vec3(.2126,.7152,.0722));
      color=mix(vec3(tValue),color,uTColor);
      float tFog=(1.0-exp(-max(0.0,length(cameraPosition-vPos)-80.0)*.00065))*(1.0-dentro);
      color=mix(color,mix(suelo,cielo,.72)*luzColor,clamp(tFog,0.0,.6));
    `,
  });},
});
