// Personajes de prueba de estilo: GLB (con o sin esqueleto) escritos en el mismo G-buffer que la escena,
// como superficie 25. La luz y el color de personaje los decide cada estilo en la composición.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {gFragment} from './gmaterial.js';

export const CHARACTER_SURF=25;
// Altura real de cada personaje y pose fija (fotograma de un clip incluido en el GLB).
export const CHARACTERS=[
  {id:'lamine',name:'Lamine',url:'/personajes/lamine.glb',height:1.74,clip:'walk.001',time:.42},
  {id:'chica',name:'Chica',url:'/personajes/chica.glb',height:1.62},
];

const vertex=/* glsl */`
#include <common>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
uniform mat3 uMapTransform;
uniform float uMeshId;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vViewNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vDepth;
varying float vSurf;
varying float vId;
void main(){
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 worldPosition=modelMatrix*vec4(transformed,1.0);
  vec3 worldNormal=normalize(mat3(modelMatrix)*objectNormal);
  vec3 transformedNormal=normalize(mat3(viewMatrix)*worldNormal);
  vec4 mv=viewMatrix*worldPosition;
  gl_Position=projectionMatrix*mv;
  vColor=vec3(1.0);
  vUv=(uMapTransform*vec3(uv,1.0)).xy;
  vViewNormal=transformedNormal;vWorldNormal=worldNormal;vWorldPos=worldPosition.xyz;
  vDepth=-mv.z;vSurf=${CHARACTER_SURF}.0;vId=fract(uMeshId*.61803);
  #include <shadowmap_vertex>
}`;

function characterMaterial(source,sun){
  const map=source.map??null;map?.updateMatrix();
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.lights,{
    uSunDir:{value:new THREE.Vector3(0,1,0)},uAlphaTest:{value:source.alphaTest??0},uMeshId:{value:Math.random()},
    uSurfOverride:{value:-1},uEmissive:{value:0},map:{value:null},uMapTransform:{value:map?.matrix.clone()??new THREE.Matrix3()},
    uBaseColor:{value:source.color?.clone()??new THREE.Color(1,1,1)},
  }]);
  uniforms.map.value=map;if(sun)uniforms.uSunDir=sun;
  const defines={USE_CHARACTER:''};if(map)defines.USE_MAP='';
  const m=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:gFragment,defines,lights:true,
    glslVersion:THREE.GLSL3,side:source.side===THREE.DoubleSide?THREE.DoubleSide:THREE.FrontSide});
  m.userData.estudio=true;return m;
}

export class CharacterPreview{
  constructor({sun}){this.sun=sun;this.group=new THREE.Group();this.group.name='personajes-estilo';this.loader=new GLTFLoader();this.loaded=new Map();}
  async load(spec){
    if(this.loaded.has(spec.id))return this.loaded.get(spec.id);
    const gltf=await this.loader.loadAsync(spec.url),root=gltf.scene;
    root.traverse(o=>{if(!o.isMesh)return;
      const sources=Array.isArray(o.material)?o.material:[o.material];
      const converted=sources.map(s=>characterMaterial(s,this.sun));
      for(const s of sources)s.dispose();
      o.material=converted.length===1?converted[0]:converted;
      o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;o.userData.kind='character';
    });
    // Pose fija: un fotograma del clip, sin animación continua (las sombras no se recalculan cada fotograma).
    const clip=spec.clip&&gltf.animations.find(a=>a.name===spec.clip);
    if(clip){const hip=root.getObjectByProperty('isBone',true),rest=hip?.position.clone();
      const mixer=new THREE.AnimationMixer(root);mixer.clipAction(clip).play();mixer.setTime(spec.time??0);
      // El clip camina: se anula el avance de la cadera para que quede en su sitio.
      if(hip){hip.position.x=rest.x;hip.position.z=rest.z;}}
    root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(root,true),size=box.getSize(new THREE.Vector3());
    const holder=new THREE.Group();holder.name='personaje:'+spec.id;holder.add(root);
    const k=spec.height/Math.max(size.y,1e-3);root.scale.multiplyScalar(k);
    root.position.set(-(box.min.x+box.max.x)/2*k,-box.min.y*k,-(box.min.z+box.max.z)/2*k);
    this.loaded.set(spec.id,holder);return holder;
  }
  // Coloca los personajes en fila sobre el terreno, mirando hacia `facing` (posición de la cámara).
  async place(center,facing,heightAt){
    const holders=await Promise.all(CHARACTERS.map(s=>this.load(s)));
    const dir=new THREE.Vector3(facing.x-center.x,0,facing.z-center.z);if(dir.lengthSq()<1e-6)dir.set(0,0,1);dir.normalize();
    const side=new THREE.Vector3(-dir.z,0,dir.x),yaw=Math.atan2(dir.x,dir.z);
    holders.forEach((h,i)=>{
      const p=center.clone().addScaledVector(side,(i-(holders.length-1)/2)*1.1);
      h.position.set(p.x,heightAt(p.x,p.z),p.z);h.rotation.set(0,yaw+(i?-.35:.35),0);
      if(!h.parent)this.group.add(h);
    });
    this.group.updateMatrixWorld(true);
  }
  clear(){for(const h of [...this.group.children])this.group.remove(h);}
  get visible(){return this.group.children.length>0;}
  dispose(){this.clear();for(const h of this.loaded.values())h.traverse(o=>{if(o.isMesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.uniforms.map.value?.dispose();m.dispose();});}});this.loaded.clear();}
}
