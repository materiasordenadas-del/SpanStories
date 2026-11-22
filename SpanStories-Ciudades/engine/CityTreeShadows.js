import * as T from './three.js';
import {URBAN_TREES} from '../routes.js';
import {luz} from './Luz25D.js';
import {CityBatchedMesh} from './CityRenderOptimization.js';
const C=URBAN_TREES.shadow;

// One bounded, cached map for all nearby trees, independent of model/material
// count. Its depth pass uses the same alpha atlas as the visible tree batches.
export class CityTreeShadows{
  constructor({renderer,style,prototypes,multiDraw,capacity=512}){
    Object.assign(this,{renderer,style,prototypes});this.dirty=true;this.ready=false;this.updates=0;this.calls=0;this.lastPosition=new T.Vector3(Infinity,0,0);this.sun=new T.Vector3();this.receivers=new WeakSet();
    this.target=new T.WebGLRenderTarget(C.resolution,C.resolution,{minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true});
    this.camera=new T.OrthographicCamera(-C.radius,C.radius,C.radius,-C.radius,C.near,C.far);this.scene=new T.Scene();
    const geoms=[...prototypes].map(([key,levels])=>({key,geometry:levels[1][0].geometry}));
    const depth=new T.MeshDepthMaterial({map:prototypes.urbanAtlas.map,alphaTest:.5,side:T.DoubleSide,depthPacking:T.RGBADepthPacking,blending:T.NoBlending});
    depth.onBeforeCompile=shader=>{
      shader.vertexShader='attribute vec4 treeAtlas; varying vec4 vTreeAtlas;\n'+shader.vertexShader.replace('void main() {','void main() {vTreeAtlas=treeAtlas;');
      shader.fragmentShader='varying vec4 vTreeAtlas;\n'+shader.fragmentShader
        .replace('#include <map_pars_fragment>','uniform highp sampler2DArray map;')
        .replace('#include <map_fragment>','diffuseColor *= texture(map,vec3(vMapUv*vTreeAtlas.zw,vTreeAtlas.x));');
    };depth.customProgramCacheKey=()=> 'city-tree-layer-depth-v2';
    this.depth=depth;
    if(multiDraw){
      this.batch=new CityBatchedMesh(capacity,geoms.reduce((n,g)=>n+g.geometry.attributes.position.count,0),geoms.reduce((n,g)=>n+g.geometry.index.count,0),depth);
      this.batch.name='sombras-compartidas-arboles';this.batch.sortObjects=false;this.scene.add(this.batch);this.geometryIds=new Map(geoms.map(g=>[g.key,this.batch.addGeometry(g.geometry)]));this.slots=[];
      for(let i=0;i<capacity;i++){const id=this.batch.addInstance(this.geometryIds.values().next().value);this.batch.setVisibleAt(id,false);this.slots.push(id);}
      this.slotStates=[];
    }else{
      // Without MultiDraw, use one instanced caster per model, never a draw for
      // each individual tree in the BatchedMesh fallback.
      this.fallback=new Map(geoms.map(g=>{const mesh=new T.InstancedMesh(g.geometry,depth,capacity);mesh.count=0;mesh.visible=false;this.scene.add(mesh);return [g.key,mesh];}));
    }
    this.matrix=new T.Matrix4();this.uniforms={uCityTreeDepth:{value:this.target.texture},uCityTreeShadowMatrix:{value:this.matrix},uCityTreeShadowReady:{value:0}};
    this.receive(prototypes.urbanMaterial,true);
    style.treeShadowReceiver=material=>this.receive(material,false);
  }
  receive(material,tree){
    if(this.receivers.has(material))return;this.receivers.add(material);Object.assign(material.uniforms,this.uniforms);
    const tint=tree?'mix(vec3('+C.barkTint.join(',')+'),vec3('+C.foliageTint.join(',')+'),step(.5,vTreePart))':'vec3('+C.groundTint.join(',')+')';
    const shader=`
      #include <packing>
      uniform sampler2D uCityTreeDepth;uniform mat4 uCityTreeShadowMatrix;uniform float uCityTreeShadowReady;
      float cityTreeVisibility(vec3 position,vec3 normal,vec3 light){
        if(uCityTreeShadowReady<.5${tree?'':'||normal.y<.45'})return 1.0;
        vec4 projected=uCityTreeShadowMatrix*vec4(position,1.0);vec3 q=projected.xyz/projected.w;
        if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
        float bias=(${C.biasWorld}+${C.slopeBiasWorld}*(1.0-abs(dot(normal,light))))/${(C.far-C.near).toFixed(3)},visibility=0.0;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          float weight=(x==0?2.0:1.0)*(y==0?2.0:1.0);
          float depth=unpackRGBAToDepth(textureLod(uCityTreeDepth,q.xy+vec2(float(x),float(y))*${(C.softness/C.resolution).toFixed(9)},0.0));
          visibility+=weight*step(q.z-bias,depth);
        }
        float edge=smoothstep(0.0,.05,min(min(q.x,1.0-q.x),min(q.y,1.0-q.y)));
        return mix(1.0,visibility/16.0,edge);
      }
    `;
    this.style.extendMaterial(material,{fragment:fragment=>shader+fragment.replace('vec3 hemi =',`float treeVisibility=cityTreeVisibility(vPos,Nrel,L);lit*=treeVisibility;sombra=mix(sombra,${tint},1.0-treeVisibility);\nvec3 hemi =`)});
  }
  update(sectors,camera){
    const sun=luz.direccionSol(),position=camera.getWorldPosition(new T.Vector3());
    if(!this.dirty&&position.distanceToSquared(this.lastPosition)<C.move*C.move&&sun.distanceToSquared(this.sun)<1e-8)return;
    this.dirty=false;this.lastPosition.copy(position);this.sun.copy(sun);
    const entries=[];for(const sector of sectors.values())for(const e of sector.entries)if(e.placement.kind==='tree'){
      let visible=true;for(let p=e.root;p;p=p.parent)if(!p.visible||p.userData.ocultoUsuario){visible=false;break;}
      if(!visible)continue;e.root.updateWorldMatrix(true,false);const p=new T.Vector3().setFromMatrixPosition(e.root.matrixWorld);
      if(Math.hypot(p.x-position.x,p.z-position.z)<=C.radius+C.margin)entries.push({e,p});
    }
    const ground=entries.length?entries.reduce((n,v)=>n+v.p.y,0)/entries.length:position.y-C.eyeHeight;
    const focus=new T.Vector3(position.x,ground,position.z);this.camera.position.copy(focus).addScaledVector(sun,C.distance);this.camera.lookAt(focus);this.camera.updateMatrixWorld();this.camera.updateProjectionMatrix();
    const bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);this.matrix.copy(bias).multiply(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
    if(this.batch){
      let boundsChanged=false;
      for(let i=0;i<this.slots.length;i++){
        const entry=entries[i],id=this.slots[i];this.batch.setVisibleAt(id,Boolean(entry));if(!entry)continue;
        const geometry=this.geometryIds.get(entry.e.key),matrix=entry.e.root.matrixWorld;
        const previous=this.slotStates[i]||(this.slotStates[i]={geometry:null,matrix:new T.Matrix4()});
        if(previous.geometry!==geometry){this.batch.setGeometryIdAt(id,geometry);previous.geometry=geometry;boundsChanged=true;}
        if(boundsChanged||!previous.matrix.equals(matrix)){this.batch.setMatrixAt(id,matrix);previous.matrix.copy(matrix);boundsChanged=true;}
      }
      // Camera motion changes the light view, not static caster geometry. Keep
      // conservative bounds (including inactive slots) until a transform changes.
      if(boundsChanged||!this.batch.boundingSphere){this.batch.computeBoundingBox();this.batch.computeBoundingSphere();}
    }else{
      for(const mesh of this.fallback.values())mesh.count=0;
      for(const {e}of entries){const mesh=this.fallback.get(e.key);mesh.setMatrixAt(mesh.count++,e.root.matrixWorld);}
      for(const mesh of this.fallback.values()){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.count){mesh.computeBoundingBox();mesh.computeBoundingSphere();}}
    }
    this.pending=true;this.casters=entries.length;
  }
  render(){
    if(!this.pending)return;this.pending=false;const r=this.renderer,old=r.getRenderTarget(),color=r.getClearColor(new T.Color()),alpha=r.getClearAlpha(),before=r.info.render.calls;
    try{r.setRenderTarget(this.target);r.setClearColor(0xffffff,1);r.clear();r.render(this.scene,this.camera);this.calls=r.info.render.calls-before;this.uniforms.uCityTreeShadowReady.value=1;this.updates++;}
    finally{r.setRenderTarget(old);r.setClearColor(color,alpha);}
  }
  snapshot(){return {resolution:C.resolution,casters:this.casters||0,updates:this.updates,updateCalls:this.calls,cached:!this.pending};}
  dispose(){this.batch?.dispose();for(const mesh of this.fallback?.values()||[])mesh.dispose();this.depth.dispose();this.target.dispose();delete this.style.treeShadowReceiver;}
}
