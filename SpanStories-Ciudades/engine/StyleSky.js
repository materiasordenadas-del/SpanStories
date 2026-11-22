import * as T from './three.js';

// One background pass shared by all styles; modules supply their own palette.
export class StyleSky {
  constructor(scene) {
    this.uniforms = {
      uSkyProjection:{value:new T.Matrix4()},uSkyCamera:{value:new T.Matrix4()},
      uSkyTop:{value:new T.Color()},uSkyHorizon:{value:new T.Color()},uSkyCloud:{value:new T.Color()},
      uSkyClouds:{value:0},uSkyLight:{value:1},uSkyTime:{value:0},
    };
    this.geometry=new T.BufferGeometry();
    this.geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.material=new T.ShaderMaterial({uniforms:this.uniforms,depthWrite:false,depthTest:false,
      vertexShader:`uniform mat4 uSkyProjection,uSkyCamera; varying vec3 vSkyRay;
        void main(){vec4 ray=uSkyProjection*vec4(position.xy,1.0,1.0);vSkyRay=(uSkyCamera*vec4(ray.xyz,0.0)).xyz;gl_Position=vec4(position.xy,1.0,1.0);}`,
      fragmentShader:`uniform vec3 uSkyTop,uSkyHorizon,uSkyCloud; uniform float uSkyClouds,uSkyLight; varying vec3 vSkyRay;
        void main(){vec3 d=normalize(vSkyRay);float h=pow(clamp(d.y,0.0,1.0),.55);
          vec3 color=mix(uSkyHorizon,uSkyTop,h);
          vec2 p=d.xz/max(.18,d.y+.18);
          float cloud=sin(p.x*2.1+sin(p.y*1.7))*.36+sin(p.y*3.3-p.x*.7)*.27+sin(p.x*6.1+p.y*4.3)*.08;
          cloud=smoothstep(.26,.52,cloud)*smoothstep(.02,.15,d.y)*(1.0-smoothstep(.65,.95,d.y));
          color=mix(color,uSkyCloud,cloud*uSkyClouds)*uSkyLight;
          gl_FragColor=vec4(color,1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.baseFragment=this.material.fragmentShader;
    this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.name='estilos-cielo';
    this.mesh.frustumCulled=false;this.mesh.renderOrder=-10000;this.mesh.visible=false;
    this.mesh.userData.ignorarSeleccion=true;scene.add(this.mesh);
  }
  configurar(palette,ambiente,{fragmento,uniformes={}}={}) {
    this.mesh.visible=Boolean(palette);if(!palette)return;
    const shader=fragmento||this.baseFragment;
    if(this.material.fragmentShader!==shader){this.material.fragmentShader=shader;this.material.needsUpdate=true;}
    Object.assign(this.uniforms,uniformes);
    const u=this.uniforms,night=ambiente==='noche',overcast=ambiente==='nublado';
    u.uSkyTop.value.set(palette.cenit);u.uSkyHorizon.value.set(palette.horizonte);u.uSkyCloud.value.set(palette.nube);
    if(!palette.gestionaAmbiente){
      if(night){u.uSkyTop.value.set('#12223e');u.uSkyHorizon.value.set('#293850');u.uSkyCloud.value.set('#56617b');}
      else if(ambiente==='tarde') {u.uSkyHorizon.value.lerp(new T.Color('#edc4a2'),.45);}
      else if(overcast){u.uSkyTop.value.lerp(new T.Color('#a8bac5'),.65);u.uSkyHorizon.value.lerp(new T.Color('#c5cece'),.5);}
    }
    u.uSkyClouds.value=overcast?.8:palette.nubes;u.uSkyLight.value=palette.luz??(night?.6:1);
  }
  update(camera){if(!this.mesh.visible)return;this.uniforms.uSkyTime.value=performance.now()/1000;this.uniforms.uSkyProjection.value.copy(camera.projectionMatrixInverse);this.uniforms.uSkyCamera.value.copy(camera.matrixWorld);}
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
