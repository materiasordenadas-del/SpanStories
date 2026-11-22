import * as T from './three.js';

const renderVariants=new WeakMap();
const cullViews=new WeakMap();

// Moving views commonly reject a piece against the same plane. Test that plane
// first, using the same positive box vertex and strict comparison as Frustum.
function intersectsCachedBox(frustum,item){
  const {min,max}=item.box,planes=frustum.planes,first=item.rejectPlane||0;
  for(let step=0;step<6;step++){
    const index=(first+step)%6,plane=planes[index],n=plane.normal;
    if(n.x*(n.x>0?max.x:min.x)+n.y*(n.y>0?max.y:min.y)+n.z*(n.z>0?max.z:min.z)+plane.constant<0){
      item.rejectPlane=index;return false;
    }
  }
  return true;
}

// Batches commonly share their world transform. Reuse the exact expanded
// frustum and camera basis; any camera/world/viewport/stroke change invalidates
// the entry. Keep a bounded pool rather than allocate it again on each turn.
function cullView(batch,camera,width,height,margin){
  let cache=cullViews.get(camera);
  if(!cache){cache={view:new T.Matrix4(),projection:new T.Matrix4(),cameraWorld:new T.Matrix4(),entries:[],count:0};cullViews.set(camera,cache);}
  if(!cache.view.equals(camera.matrixWorldInverse)||!cache.projection.equals(camera.projectionMatrix)||!cache.cameraWorld.equals(camera.matrixWorld)){
    cache.view.copy(camera.matrixWorldInverse);cache.projection.copy(camera.projectionMatrix);cache.cameraWorld.copy(camera.matrixWorld);cache.count=0;
  }
  for(let i=0;i<cache.count;i++){
    const entry=cache.entries[i];
    if(entry.width===width&&entry.height===height&&entry.margin===margin&&entry.coordinates===camera.coordinateSystem&&entry.reversed===camera.reversedDepth&&entry.world.equals(batch.matrixWorld))return entry;
  }
  const create=()=>({world:new T.Matrix4(),projection:new T.Matrix4(),matrix:new T.Matrix4(),inverse:new T.Matrix4(),frustum:new T.Frustum(),position:new T.Vector3(),forward:new T.Vector3()});
  let entry;
  if(cache.count<32){entry=cache.entries[cache.count]||(cache.entries[cache.count]=create());cache.count++;}
  else entry=batch.cityStandaloneView||(batch.cityStandaloneView=create());
  Object.assign(entry,{width,height,margin,coordinates:camera.coordinateSystem,reversed:camera.reversedDepth});entry.world.copy(batch.matrixWorld);
  entry.projection.copy(camera.projectionMatrix);entry.projection.elements[0]/=1+2*margin/width;entry.projection.elements[5]/=1+2*margin/height;
  entry.matrix.multiplyMatrices(entry.projection,camera.matrixWorldInverse).multiply(batch.matrixWorld);
  entry.frustum.setFromProjectionMatrix(entry.matrix,camera.coordinateSystem,camera.reversedDepth);
  entry.inverse.copy(batch.matrixWorld).invert();entry.position.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(entry.inverse);
  entry.forward.set(0,0,-1).transformDirection(camera.matrixWorld).transformDirection(entry.inverse);
  return entry;
}
export function syncRenderVariants(source){
  for(const material of renderVariants.get(source)||[]){material.vertexShader=source.vertexShader;material.fragmentShader=source.fragmentShader;material.defines={...source.defines};material.needsUpdate=true;}
}

// Flatten shared lighting arrays once per frame, retaining direct lamp/room edits.
export class PackedUniforms {
  constructor(source) {
    this.source=source;this.uniforms={};this.entries=[];
    for(const [key,uniform] of Object.entries(source)){
      const array=uniform.value;if(!Array.isArray(array)||!array.length)continue;
      const first=array[0],size=typeof first==='number'?1:first.isVector4?4:first.isVector3||first.isColor?3:first.isVector2?2:0;
      if(!size)continue;
      const data=new Float32Array(array.length*size);this.uniforms[key]={value:data};this.entries.push({key,size,data});
    }
    this.update();
  }
  update(){for(const {key,size,data} of this.entries){const array=this.source[key].value;if(size===1)data.set(array);else for(let i=0;i<array.length;i++)array[i].toArray(data,i*size);}}
}

// Editing nodes keep their hierarchy. Skip a render branch only if every drawable
// in it is represented elsewhere. This flag never changes semantic visibility.
export function markRenderBranches(root,active=true){
  function visit(node){
    let rendered=Boolean(node.isMesh||node.isLine||node.isPoints||node.isSprite||node.isLight||node.isLOD||node.isBone||node.isCamera)&&Boolean(node.layers.mask&1);
    for(const child of node.children)rendered=visit(child)||rendered;
    node.userData.cityRenderPruned=active&&!rendered;
    return rendered;
  }
  visit(root);
}

export function updateRenderAncestors(node){
  for(let current=node;current;current=current.parent){
    const drawable=Boolean(current.isMesh||current.isLine||current.isPoints||current.isSprite||current.isLight||current.isLOD||current.isBone||current.isCamera)&&Boolean(current.layers.mask&1);
    current.userData.cityRenderPruned=!drawable&&current.children.every(child=>child.userData.cityRenderPruned===true);
    if(current.isScene)break;
  }
}

// One shader material per GPU layout avoids switching the same material between
// plain / instanced / batched programs every draw. Lighting uniforms stay shared.
export class RenderMaterials {
  constructor() { this.sources = new Map(); }
  get(source, geometry, kind) {
    if (!source.isShaderMaterial) return source;
    const key = [kind, source.vertexColors && geometry.getAttribute('color')?.itemSize,
      Boolean(geometry.getAttribute('tangent')), Boolean(geometry.morphAttributes.position)].join(':');
    let variants = this.sources.get(source);
    if (!variants) this.sources.set(source, variants = new Map());
    if (!variants.has(key)) {
      // This cache deliberately shares the uniforms below. Avoid cloning their
      // payload first: render-target samplers cannot be cloned by UniformsUtils.
      const template=Object.create(source);template.uniforms={};
      const material = template.clone();
      material.uniforms = source.uniforms;
      material.userData = { ...source.userData };
      Object.defineProperty(material,'visible',{get:()=>source.visible,set:value=>{source.visible=value;},configurable:true});
      if(!renderVariants.has(source))renderVariants.set(source,new Set());renderVariants.get(source).add(material);
      variants.set(key, material);
    }
    return variants.get(key);
  }
  dispose() {
    for (const [source,variants] of this.sources) for (const material of variants.values()){renderVariants.get(source)?.delete(material);material.dispose();}
    this.sources.clear();
  }
}

// Three's draw list and indirect texture are unchanged while the camera,
// instance data and visibility are unchanged. Cache that work, retaining exact
// per-piece frustum culling and transparent sorting whenever anything changes.
export class CityBatchedMesh extends T.BatchedMesh {
  // The bundled r180 renderer tests colorTexture, while its BatchedMesh stores
  // _colorsTexture. Undefined !== null caused getProgram() on EVERY batch draw.
  get colorTexture() { return this._colorsTexture; }
  setMatrixAt(index,matrix){this.cityBounds?.delete(index);return super.setMatrixAt(index,matrix);}
  addInstance(geometryId){const index=super.addInstance(geometryId);this.cityBounds?.delete(index);return index;}
  deleteInstance(index){const result=super.deleteInstance(index);this.cityBounds?.delete(index);return result;}
  setGeometryIdAt(index,geometryId){const result=super.setGeometryIdAt(index,geometryId);this.cityBounds?.delete(index);this._visibilityChanged=true;return result;}
  setGeometryAt(geometryId,geometry){
    const result=super.setGeometryAt(geometryId,geometry);
    if(this.cityBounds)for(const index of this.cityBounds.keys())if(this._instanceInfo[index]?.geometryIndex===geometryId)this.cityBounds.delete(index);
    return result;
  }
  onBeforeRender(renderer, scene, camera, geometry, material, group) {
    cacheTextureUpdates(this._indirectTexture);
    const state = this.cityView;
    const matricesVersion = this._matricesTexture.version;
    const width=renderer.domElement?.width||1280,height=renderer.domElement?.height||720;
    const margin=Math.abs((material.uniforms?.uGrosor?.value||0)*(material.uniforms?.uNivel?.value||1))+2;
    if (!camera.isArrayCamera && state && !this._visibilityChanged &&
      state.matricesVersion === matricesVersion && state.camera === camera &&
      state.world.equals(this.matrixWorld) && state.view.equals(camera.matrixWorldInverse) &&
      state.projection.equals(camera.projectionMatrix) && state.sort === this.sortObjects &&
      state.cull === this.perObjectFrustumCulled && state.customSort === this.customSort &&
      state.transparent === material.transparent&&state.width===width&&state.height===height&&state.margin===margin) return;
    if(camera.isArrayCamera||this.customSort)super.onBeforeRender(renderer, scene, camera, geometry, material, group);
    else this.updateCityDrawList(camera,geometry,material,width,height,margin);
    if (camera.isArrayCamera) { this.cityView = null; return; }
    const next = state || { world: new T.Matrix4(), view: new T.Matrix4(), projection: new T.Matrix4() };
    next.world.copy(this.matrixWorld); next.view.copy(camera.matrixWorldInverse); next.projection.copy(camera.projectionMatrix);
    Object.assign(next, { matricesVersion, camera, sort: this.sortObjects, cull: this.perObjectFrustumCulled,
      customSort: this.customSort, transparent: material.transparent,width,height,margin });
    this.cityView = next;
  }
  updateCityDrawList(camera,geometry,material,width,height,margin){
    const scratch=this.cityScratch||(this.cityScratch={matrix:new T.Matrix4(),list:[]});
    const {matrix,list}=scratch,{frustum,position,forward}=cullView(this,camera,width,height,margin);
    const bounds=this.cityBounds||(this.cityBounds=new Map());list.length=0;
    for(let index=0;index<this._instanceInfo.length;index++){
      const instance=this._instanceInfo[index];if(!instance.active||!instance.visible)continue;
      let item=bounds.get(index);
      if(!item){
        this.getMatrixAt(index,matrix);const box=this.getBoundingBoxAt(instance.geometryIndex,new T.Box3()).applyMatrix4(matrix);
        item={box,center:box.getCenter(new T.Vector3()),index,z:0};bounds.set(index,item);
      }
      if(this.perObjectFrustumCulled&&!intersectsCachedBox(frustum,item))continue;
      const info=this._geometryInfo[instance.geometryIndex];item.start=info.start;item.count=info.count;
      item.z=(item.center.x-position.x)*forward.x+(item.center.y-position.y)*forward.y+(item.center.z-position.z)*forward.z;list.push(item);
    }
    if(this.sortObjects)list.sort(material.transparent?(a,b)=>b.z-a.z:(a,b)=>a.z-b.z);
    const bytes=geometry.index?.array.BYTES_PER_ELEMENT||1,indirect=this._indirectTexture.image.data;
    let indirectChanged=!this.cityIndirectInitialized;
    for(let i=0;i<list.length;i++){const item=list[i];this._multiDrawStarts[i]=item.start*bytes;this._multiDrawCounts[i]=item.count;
      if(indirect[i]!==item.index){indirect[i]=item.index;indirectChanged=true;}
    }
    this._multiDrawCount=list.length;this._visibilityChanged=false;
    // Draw count determines the consumed prefix. An unchanged prefix needs no
    // texture comparison/copy, even when the visible count shrinks or grows.
    if(indirectChanged){this._indirectTexture.needsUpdate=true;this.cityIndirectInitialized=true;}
  }
}

// Culling may run on every moving frame while producing the same instance order.
// Submit the indirect texture only when its bytes change. Texture/source versions
// retain their normal Three.js semantics; no version counters are rolled back.
function cacheTextureUpdates(texture){
  if(texture.cityUpdateCache)return;texture.cityUpdateCache=true;
  const set=Object.getOwnPropertyDescriptor(T.Texture.prototype,'needsUpdate').set;let previous;
  Object.defineProperty(texture,'needsUpdate',{configurable:true,set(value){
    if(value){const data=this.image.data;let changed=!previous||previous.length!==data.length;
      if(!changed)for(let i=0;i<data.length;i++)if(previous[i]!==data[i]){changed=true;break;}
      if(!changed)return;if(!previous||previous.length!==data.length)previous=new data.constructor(data.length);previous.set(data);
    }
    set.call(this,value);
  }});
}

// Preserve automatic transforms, including direct edits and animation. Only skip
// recomposing an identical local matrix; never freeze an editable object's pose.
export function cacheLocalMatrices(root) {
  const restore = [];
  root.traverse(object => {
    if (object.userData.cityMatrixCache) return;
    const original = object.updateMatrix, values = new Float64Array(10).fill(NaN);
    object.updateMatrix = function () {
      const p = this.position, q = this.quaternion, s = this.scale;
      if (values[0] === p.x && values[1] === p.y && values[2] === p.z &&
        values[3] === q.x && values[4] === q.y && values[5] === q.z && values[6] === q.w &&
        values[7] === s.x && values[8] === s.y && values[9] === s.z) return;
      values.set([p.x,p.y,p.z,q.x,q.y,q.z,q.w,s.x,s.y,s.z]);
      original.call(this);
    };
    object.userData.cityMatrixCache = true;
    restore.push(() => { object.updateMatrix = original; delete object.userData.cityMatrixCache; });
  });
  return () => { for (const release of restore) release(); };
}
