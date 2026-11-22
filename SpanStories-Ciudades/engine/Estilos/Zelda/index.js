import * as T from '../../three.js';
import { componerEstilo, componerContorno } from '../../StyleShader.js';

// Pictorial diffuse response: broad smooth tones, chromatic bounce and world-space pigment.
export const Zelda = Object.freeze({
  id:'Zelda', nombre:'Zelda', descripcion:'Luz pictórica, sombras suaves y profundidad atmosférica.',
  trazo:.25, cielo:{cenit:'#79bce8',horizonte:'#d1e6e3',nube:'#f7f3e6',nubes:.48},
  contorno:shader=>componerContorno(shader,60,400),
  controles:[
    {clave:'uZSol',nombre:'Luz solar',min:.3,max:1.7,paso:.05},
    {clave:'uZCalidez',nombre:'Calidez',min:0,max:1,paso:.05},
    {clave:'uZAmbiente',nombre:'Luz ambiental',min:.3,max:1.5,paso:.05},
    {clave:'uZSuavidad',nombre:'Suavidad',min:.05,max:.65,paso:.025},
    {clave:'uZSaturacion',nombre:'Color',min:.5,max:1.5,paso:.05},
    {clave:'uZAtmosfera',nombre:'Atmósfera',min:0,max:2,paso:.05},
    {clave:'uEstiloTrazo',nombre:'Contornos',min:0,max:1,paso:.05},
  ],
  crearUniformes:()=>({uZSol:{value:1.05},uZCalidez:{value:.55},uZAmbiente:{value:1.1},uZSuavidad:{value:.325},
    uZSaturacion:{value:1.05},uZAtmosfera:{value:1},uZBruma:{value:new T.Color('#a7c3cb')}}),
  fragmento(shader){return componerEstilo(shader,{
    codigo:/* glsl */`
      uniform float uZSol,uZCalidez,uZAmbiente,uZSuavidad,uZSaturacion,uZAtmosfera;
      uniform vec3 uZBruma; uniform float uEstiloCategoria;
      float estiloLuz(float n,float threshold,float softness){
        float width=max(.06,uZSuavidad+softness);
        float diffuse=smoothstep(threshold-width,threshold+.65+width,n);
        return mix(diffuse,sqrt(max(diffuse,0.0)),.24);
      }
      float zPigment(vec3 p){
        return sin(p.x*.31+sin(p.z*.23))*sin(p.y*.39+p.z*.19)*.6 + sin(dot(p,vec3(1.17,.67,.91)))*.4;
      }
    `,
    superficie:/* glsl */`
      vec3 zWarm=mix(vec3(1.0),vec3(1.10,1.025,.90),uZCalidez);
      vec3 zBounce=mix(sombra,vec3(.63,.77,.82),.32)*hemi*uZAmbiente;
      vec3 zSun=luzColor*zWarm*uZSol;
      float zOrganic=1.0-step(2.5,uEstiloCategoria);
      vec3 color=albedo*mix(zBounce,zSun,lit);
      color*=1.0+zPigment(vPos)*mix(.014,.035,zOrganic);
      float zLeaf=step(.5,uEstiloCategoria)*(1.0-step(2.5,uEstiloCategoria));
      color+=albedo*luzColor*zLeaf*.12*pow(max(dot(-Nrel,L),0.0),2.0);
    `,
    acabado:/* glsl */`
      float zValue=dot(color,vec3(.2126,.7152,.0722));
      color=mix(vec3(zValue),color,uZSaturacion);
      float zDistance=max(0.0,length(cameraPosition-vPos)-35.0);
      float zFog=(1.0-exp(-zDistance*.0018*uZAtmosfera))*(1.0-dentro);
      vec3 zAir=uZBruma*clamp(dot(luzColor,vec3(.2126,.7152,.0722)),.045,1.2);
      color=mix(color,zAir,clamp(zFog,0.0,.88));
    `,
  });},
});
