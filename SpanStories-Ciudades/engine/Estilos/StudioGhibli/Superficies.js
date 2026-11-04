import { componerEstilo } from '../../StyleShader.js';

// Rest-pose coordinates stay on a surface through camera movement, instancing and batching.
export function vertice(shader){
  return 'varying vec3 vGhibliLocal;\n'+shader.replace(/void main\(\)\s*\{/, 'void main() {\nvGhibliLocal=position;');
}

export function fragmento(shader,metadata={}) {
  const urbanTree=shader.includes('varying float vTreePart;');
  if(urbanTree)shader=shader.replace('varying float vTreePart;','');
  return componerEstilo(shader,{
    codigo:/* glsl */`
      #define GHIBLI_PERSONAJE ${metadata.esPersonaje?'1.0':'0.0'}
      ${urbanTree?'varying float vTreePart;':''}
      uniform float uEstiloCategoria,uGPintura,uGMasas,uGSuavidad,uGCalidez,uGHumedad,uGAtmosfera,uGLluvia,uGAtardecer;
      uniform vec3 uGSombra,uGAire;
      varying vec3 vGhibliLocal;
      float gHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float gNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(gHash(i),gHash(i+vec3(1,0,0)),f.x),mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x),mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float gCategory(){return ${urbanTree?'mix(5.0,1.0,step(.5,vTreePart))':'uEstiloCategoria'};}
      float gCharacter(){return max(GHIBLI_PERSONAJE,step(9.5,gCategory()));}
      float estiloLuz(float n,float threshold,float softness){
        // Vegetation uses broad chromatic masses; characters keep two simple regions.
        float organic=1.0-step(2.5,gCategory());
        float width=max(.08,uGSuavidad*.5+softness);
        float diffuse=smoothstep(threshold-width,threshold+.65+width,n);
        float masses=gNoise(vGhibliLocal*1.3+vec3(0.0,2.1,0.0));
        float painted=smoothstep(.18,.82,diffuse+(masses-.5)*uGMasas*.32);
        float cel=smoothstep(threshold-.12,threshold+.12,n);
        return mix(mix(diffuse,painted,organic*.6),cel,gCharacter()*.82);
      }
    `,
    superficie:/* glsl */`
      float gCat=gCategory(),gPerson=gCharacter();
      float gOrganic=step(.5,gCat)*(1.0-step(2.5,gCat));
      float gBroad=gNoise(vGhibliLocal*.45);
      // Anisotropic pigment marks in local space, antialiased away at distance.
      vec3 gStrokeP=vGhibliLocal*vec3(6.0,1.6,4.0);
      float gDetail=1.0-smoothstep(.25,1.2,max(length(dFdx(gStrokeP)),length(dFdy(gStrokeP))));
      float gStroke=gNoise(gStrokeP+gBroad*2.0);
      float gPigment=((gBroad-.5)*.19+(gStroke-.5)*.075*gDetail)*uGPintura*(1.0-gPerson);
      vec3 gAlbedo=albedo*(1.0+gPigment);
      vec3 gWarm=mix(vec3(1.0),vec3(1.10,1.025,.91),uGCalidez);
      vec3 gAmbient=hemi*mix(sombra,uGSombra,.42);
      vec3 gLight=luzColor*gWarm;
      // Painted green masses preserve the original species palette and leaf cutout.
      vec3 gLeafHue=mix(vec3(.88,1.01,1.04),vec3(1.04,1.025,.88),gBroad);
      gAlbedo*=mix(vec3(1.0),gLeafHue,gOrganic*uGMasas);
      vec3 color=gAlbedo*mix(gAmbient,gLight,lit);
      color+=gAlbedo*hemi*.06*gOrganic*uGMasas;
      // Restrained sky highlights only for glass/water and wet upward-facing ground.
      float gGlass=1.0-step(.25,abs(gCat-7.0)),gWater=1.0-step(.25,abs(gCat-8.0));
      float gGround=step(2.5,gCat)*(1.0-step(4.5,gCat));
      vec3 gV=normalize(cameraPosition-vPos);
      float gFresnel=pow(1.0-max(dot(Nrel,gV),0.0),4.0);
      float gWet=uGLluvia*gGround*smoothstep(.65,.95,N.y);
      color*=1.0-gWet*.10;
      color+=mix(hemi,luzColor,.35)*gFresnel*(gGlass*.09+gWater*.12+gWet*.08);
    `,
    acabado:/* glsl */`
      float gDistance=max(0.0,length(cameraPosition-vPos)-25.0);
      float gHumidity=clamp(uGHumedad+uGLluvia*.45,0.0,1.0);
      // Layer distance, low-altitude humidity and horizon tint instead of uniform fog.
      float gLow=exp(-max(vPos.y,0.0)*.022);
      float gAir=1.0-exp(-gDistance*.0015*uGAtmosfera*(.65+gHumidity*gLow));
      float gFar=smoothstep(140.0,650.0,gDistance);
      float gValue=dot(color,vec3(.2126,.7152,.0722));
      color=mix(color,vec3(gValue),gFar*.16*uGAtmosfera);
      vec3 gAtmosColor=uGAire*clamp(dot(luzColor,vec3(.2126,.7152,.0722)),.07,1.15);
      color=mix(color,gAtmosColor,clamp(gAir*(1.0-dentro),0.0,.9));
    `,
  });
}
