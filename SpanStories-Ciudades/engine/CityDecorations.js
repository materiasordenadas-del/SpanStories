import * as T from './three.js';
import {DECOR} from '../routes.js';
import {createTreePrototypes,prototypeStats} from '../objetos/Tree.js';
import {createCityPropPrototypes} from '../objetos/CityProps.js';
import {groupOf} from '../objetos/DecorGeometry.js';
import {CityBatchedMesh,RenderMaterials,cacheLocalMatrices,markRenderBranches} from './CityRenderOptimization.js';
import {assignUrbanTreeVariety} from '../objetos/UrbanTreeVariety.js';
import {CityTreeShadows} from './CityTreeShadows.js';

export function chooseDecorLod(pixels,previous,thresholds,hysteresis=DECOR.lodHysteresis){
  let next=pixels>=thresholds[0]?0:pixels>=thresholds[1]?1:2;
  if(previous!==undefined&&next!==previous){
    if(next>previous&&pixels>thresholds[previous]*(1-hysteresis))return previous;
    if(next<previous&&pixels<thresholds[next]*(1+hysteresis))return previous;
  }return next;
}
function isVisible(root){for(let o=root;o;o=o.parent)if(!o.visible)return false;return !root.userData.ocultoUsuario;}

function updateDecorBounds(group,inverse,scratch){
  const {batch,slots}=group,{matrix,position}=scratch,box=new T.Box3(),piece=new T.Box3();
  for(const {entry,part} of slots){
    matrix.multiplyMatrices(inverse,entry.root.matrixWorld);
    if(part.billboard){
      const geometry=part.geometry;if(!geometry.boundingSphere)geometry.computeBoundingSphere();
      // Enclose every billboard orientation, including nonuniform parents.
      const e=matrix.elements,scale=Math.hypot(e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]);
      const radius=(geometry.boundingSphere.center.length()+geometry.boundingSphere.radius)*scale;
      position.setFromMatrixPosition(matrix);piece.set(position,position).expandByScalar(radius);
    }else{
      if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();piece.copy(part.geometry.boundingBox).applyMatrix4(matrix);
    }
    box.union(piece);
  }
  (batch.boundingBox||=new T.Box3()).copy(box);box.getBoundingSphere(batch.boundingSphere||=new T.Sphere());
}

// Per-sector compact batches. A stable ID never depends on a GPU instance index.
export class DecorSector {
  constructor({parent,placements,prototypes,objetos,camera,viewportHeight=660,multiDraw=false,onChange}){
    Object.assign(this,{parent,placements,prototypes,objetos,camera,viewportHeight,onChange});this.entries=[];this.groups=new Map();this.disposed=false;this.materials=new RenderMaterials();
    this.viewPosition=new T.Vector3(NaN,NaN,NaN);this.hostWorld=new T.Matrix4();this.cameraPosition=new T.Vector3();
    this.scratch={inverse:new T.Matrix4(),matrix:new T.Matrix4(),position:new T.Vector3(),scale:new T.Vector3(),rotation:new T.Quaternion()};
    this.host=new T.Group();this.host.name='decoracion-LOD:'+parent.name;parent.add(this.host);
    this.flush=()=>{this.update(this.camera,this.viewportHeight,true);this.onChange?.();};
    for(const placement of placements){
      const key=placement.kind+':'+placement.variant,levels=prototypes.get(key);if(!levels)throw new Error('Variante desconocida: '+key);
      const root=groupOf(levels[0]);root.name=placement.label;
      root.position.fromArray(placement.position);root.rotation.y=placement.yaw;
      if(placement.kind==='tree')root.scale.set(placement.height*(placement.crown??1),placement.height,placement.height*(placement.crown??1));
      root.userData={ssId:placement.id,ssType:placement.kind,id:placement.id,area:placement.sector,sector:placement.sector,label:placement.label,decor:true,kind:placement.kind,variant:placement.variant,placement};
      root.traverse(o=>{if(o.isMesh){o.layers.disable(0);o.raycast=()=>{};}});
      const entry={placement,key,root,lod:undefined};this.entries.push(entry);this.host.add(root);
      root.userData.instanceBinding={sync:(recompute=true)=>{if(recompute)this.flush();},updateBounds:this.flush,bounds:()=>new T.Box3().setFromObject(root)};
      // Lectura de la representación visible para el contorno léxico, sin alterar batches/LOD.
      root.userData.instanceBinding.parts=()=>prototypes.get(key)[entry.lod??0].map(part=>{
        const matrix=root.matrixWorld.clone();
        if(part.billboard){const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),view=this.camera.getWorldPosition(new T.Vector3());matrix.decompose(p,q,s);q.setFromAxisAngle(T.Object3D.DEFAULT_UP,Math.atan2(view.x-p.x,view.z-p.z));matrix.compose(p,q,s);}
        return {geometry:part.geometry,material:part.material,matrix};
      });
      objetos.registrar(root,{id:placement.id,tipo:placement.kind,etiqueta:placement.label,sector:placement.sector});
    }
    const counts=new Map();for(const e of this.entries)counts.set(e.key,(counts.get(e.key)||0)+1);
    if(multiDraw){
      const materials=new Map();
      for(const e of this.entries)prototypes.get(e.key).forEach((parts,lod)=>parts.forEach(part=>{
        const key=part.material.uuid;if(!materials.has(key))materials.set(key,{material:part.material,slots:[],geometries:new Set()});
        const group=materials.get(key);group.slots.push({entry:e,lod,part});group.geometries.add(part.geometry);
      }));
      for(const [key,g]of materials){
        const vertices=[...g.geometries].reduce((n,geometry)=>n+geometry.getAttribute('position').count,0),indices=[...g.geometries].reduce((n,geometry)=>n+geometry.index.count,0);
        const batch=new CityBatchedMesh(g.slots.length,vertices,indices,g.material);batch.name='decor-multidraw:'+g.material.name;
        batch.userData.instanceIds=[];batch.userData.decorBatch=true;this.host.add(batch);
        const geometryIds=new Map();for(const geometry of g.geometries)geometryIds.set(geometry,batch.addGeometry(geometry));
        batch.material=this.materials.get(g.material,batch.geometry,'batched');
        for(const slot of g.slots){slot.index=batch.addInstance(geometryIds.get(slot.part.geometry));batch.setVisibleAt(slot.index,false);if(g.material.userData.urbanTree)batch.setColorAt(slot.index,new T.Color(...slot.entry.placement.treeVariation));}
        this.groups.set(key,{batch,slots:g.slots,activeInstances:0,activeTriangles:0});
      }
    }else{
    for(const [key,capacity] of counts)prototypes.get(key).forEach((parts,lod)=>parts.forEach((part,index)=>{
      const batch=new T.InstancedMesh(part.geometry,part.material,capacity);batch.name=`decor-batch:${key}:${lod}:${index}`;batch.count=0;
      batch.material=this.materials.get(part.material,part.geometry,'instanced');
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage);batch.userData.instanceIds=[];batch.userData.decorBatch=true;batch.userData.kind=key.split(':')[0];batch.userData.lod=lod;
      this.host.add(batch);this.groups.set(`${key}:${lod}:${index}`,{batch,key,lod,part});
    }));
    }
    this.update(camera,viewportHeight,true);
    markRenderBranches(this.host);
  }
  update(camera=this.camera,viewportHeight=this.viewportHeight,force=false){
    if(this.disposed)return;this.camera=camera;
    const cameraPosition=camera.getWorldPosition(this.cameraPosition),projection=camera.projectionMatrix.elements[5];
    this.host.updateWorldMatrix(true,false);
    if(!force&&this.viewPosition.equals(cameraPosition)&&this.viewportHeight===viewportHeight&&this.projection===projection&&this.hostWorld.equals(this.host.matrixWorld))return;
    const transformsChanged=force||!this.hostWorld.equals(this.host.matrixWorld);
    this.viewportHeight=viewportHeight;this.projection=projection;this.viewPosition.copy(cameraPosition);this.hostWorld.copy(this.host.matrixWorld);
    // Pointer/camera movement does not move the editable source trees. Edits
    // call flush(force=true); parent transforms invalidate the host matrix.
    if(transformsChanged)this.host.updateWorldMatrix(false,true);
    const {inverse,matrix,position,scale,rotation}=this.scratch;inverse.copy(this.host.matrixWorld).invert();
    let changed=force,boundsDirty=force;
    for(const entry of this.entries){
      if(!entry.boundsMatrix?.equals(entry.root.matrixWorld)){(entry.boundsMatrix||=new T.Matrix4()).copy(entry.root.matrixWorld);boundsDirty=true;}
      const p=position.setFromMatrixPosition(entry.root.matrixWorld),distance=Math.max(.1,p.distanceTo(cameraPosition)),height=entry.placement.kind==='tree'?entry.root.scale.y:entry.placement.height*entry.root.scale.y;
      const pixels=height*camera.projectionMatrix.elements[5]*viewportHeight/(2*distance),lod=chooseDecorLod(pixels,entry.lod,DECOR.lodPixels[entry.placement.kind]);
      if(lod!==entry.lod){entry.lod=lod;changed=true;}
    }
    // Billboard orientation also follows the viewer; no source meshes are rebuilt.
    const viewKey=cameraPosition.toArray().map(n=>n.toFixed(2)).join(',');if(viewKey!==this.viewKey){changed=true;this.viewKey=viewKey;}
    if(!changed)return;
    for(const {batch,key,lod,part} of this.groups.values()){
      if(batch.isBatchedMesh)continue;
      let count=0;const ids=[];
      for(const entry of this.entries){
        if(entry.key!==key||entry.lod!==lod||!isVisible(entry.root))continue;
        if(part.billboard){
          entry.root.matrixWorld.decompose(position,rotation,scale);rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP,Math.atan2(cameraPosition.x-position.x,cameraPosition.z-position.z));matrix.compose(position,rotation,scale);matrix.premultiply(inverse);
        }else matrix.multiplyMatrices(inverse,entry.root.matrixWorld);
        batch.setMatrixAt(count,matrix);if(part.material.userData.urbanTree)batch.setColorAt(count,new T.Color(...entry.placement.treeVariation));ids.push(entry.placement.id);count++;
      }
      batch.count=count;batch.visible=count>0;batch.userData.instanceIds=ids;batch.instanceMatrix.needsUpdate=true;
      if(batch.instanceColor)batch.instanceColor.needsUpdate=true;if(count){batch.computeBoundingBox();batch.computeBoundingSphere();}
    }
    for(const group of this.groups.values()){
      const {batch,slots}=group;if(!slots)continue;
      group.activeInstances=0;group.activeTriangles=0;
      for(const {entry,lod,part,index}of slots){
        const visible=entry.lod===lod&&isVisible(entry.root);batch.setVisibleAt(index,visible);batch.userData.instanceIds[index]=visible?entry.placement.id:undefined;
        if(!visible)continue;
        if(part.billboard){entry.root.matrixWorld.decompose(position,rotation,scale);rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP,Math.atan2(cameraPosition.x-position.x,cameraPosition.z-position.z));matrix.compose(position,rotation,scale);matrix.premultiply(inverse);}
        else matrix.multiplyMatrices(inverse,entry.root.matrixWorld);
        const previous=group.matrices||(group.matrices=new Map());
        if(force||!previous.get(index)?.equals(matrix)){batch.setMatrixAt(index,matrix);if(!previous.has(index))previous.set(index,new T.Matrix4());previous.get(index).copy(matrix);}
        group.activeInstances++;group.activeTriangles+=part.geometry.index.count/3;
      }
      batch.visible=group.activeInstances>0;
      // Bounds depend on transforms, not the active LOD. Recompute after edits;
      // retained bounds conservatively cover every level and billboard rotation.
      if(boundsDirty||!batch.boundingSphere)updateDecorBounds(group,inverse,this.scratch);
    }
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.restoreMatrices?.();for(const e of this.entries){delete e.root.userData.instanceBinding;this.objetos.retirar(e.placement.id);}for(const {batch} of this.groups.values())batch.dispose();this.materials.dispose();this.host.removeFromParent();}
}

export class CityDecorations {
  constructor({scene,objetos,loader,style,renderer,camera,viewportHeight=()=>renderer.domElement.clientHeight}){
    Object.assign(this,{scene,objetos,loader,style,renderer,camera,viewportHeight});this.multiDraw=!!renderer.getContext().getExtension('WEBGL_multi_draw');this.sectors=new Map();this.errors=[];this.lastUpdate=0;this.disposed=false;
  }
  async initialize(baseUrl=new URL(DECOR.baseUrl,document.baseURI)){
    this.baseUrl=baseUrl;const response=await fetch(new URL('layout.json',baseUrl));if(!response.ok)throw new Error('No se pudo cargar la distribución');this.layout=await response.json();
    this.layout.audit.approvedVariety=assignUrbanTreeVariety(this.layout.placements);
    const trees=await createTreePrototypes(this);
    this.treeShadows=new CityTreeShadows({renderer:this.renderer,style:this.style,prototypes:trees,multiDraw:this.multiDraw,capacity:this.layout.placements.filter(p=>p.kind==='tree').length});
    // Compile the array-texture depth shader during loading, before a mouse
    // turn can reveal another caster. Keep the normal cached shadow pass.
    await this.renderer.compileAsync(this.treeShadows.scene,this.treeShadows.camera);
    this.prototypes=new Map([...trees,...(await createCityPropPrototypes(this))]);
    this.resources=[...this.prototypes.values()].flatMap(levels=>levels.map(parts=>groupOf(parts)));
    this.bySector=new Map();for(const p of this.layout.placements){if(!this.bySector.has(p.sector))this.bySector.set(p.sector,[]);this.bySector.get(p.sector).push(p);}
    return this;
  }
  attach(record){
    if(this.disposed||this.sectors.has(record.sector.id))return;
    const placements=this.bySector.get(record.sector.id)||[];
    const sector=new DecorSector({parent:record.root,placements,prototypes:this.prototypes,objetos:this.objetos,camera:this.camera,viewportHeight:this.viewportHeight(),multiDraw:this.multiDraw,onChange:()=>{if(this.treeShadows)this.treeShadows.dirty=true;}});sector.restoreMatrices=cacheLocalMatrices(sector.host);this.sectors.set(record.sector.id,sector);if(this.treeShadows)this.treeShadows.dirty=true;return sector;
  }
  detach(record){const sector=this.sectors.get(record.sector.id);if(!sector)return;sector.dispose();this.sectors.delete(record.sector.id);if(this.treeShadows)this.treeShadows.dirty=true;}
  refresh(root){if(root?.userData.decor){root.userData.instanceBinding.sync();if(this.treeShadows)this.treeShadows.dirty=true;}}
  retainedRoots(){return this.resources||[];}
  update(now){if(now-this.lastUpdate<DECOR.updateMs)return;this.lastUpdate=now;for(const sector of this.sectors.values())sector.update(this.camera,this.viewportHeight());this.treeShadows?.update(this.sectors,this.camera);}
  renderShadows(){this.treeShadows?.render();}
  colliders(){const out=[];for(const sector of this.sectors.values())for(const e of sector.entries){if(!isVisible(e.root))continue;const p=e.root.getWorldPosition(new T.Vector3()),r=e.placement.kind==='tree'?.18:DECOR.poleRadius;out.push({id:e.placement.id,bounds:{min:[p.x-r,p.y,p.z-r],max:[p.x+r,p.y+2,p.z+r]}});}return out;}
  snapshot(){
    let calls=0,triangles=0,instances=0;const lods=[0,0,0];
    for(const sector of this.sectors.values()){for(const e of sector.entries)if(isVisible(e.root))lods[e.lod]++;for(const group of sector.groups.values())if(group.batch.visible){calls++;if(group.slots){instances+=group.activeInstances;triangles+=group.activeTriangles;}else{instances+=group.batch.count;triangles+=group.part.geometry.index.count/3*group.batch.count;}}}
    return {placements:this.layout?.audit,sectors:this.sectors.size,lods,calls,triangles,instances,multiDraw:this.multiDraw,shadows:this.treeShadows?.snapshot(),prototypeTriangles:this.prototypes?prototypeStats(this.prototypes):{},errors:this.errors};
  }
  dispose(){this.disposed=true;this.treeShadows?.dispose();for(const sector of this.sectors.values())sector.dispose();this.sectors.clear();const geometries=new Set(),textures=new Set();for(const root of this.resources||[])root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const u of Object.values(o.material?.uniforms||{}))if(u.value?.isTexture&&!u.value.isRenderTargetTexture)textures.add(u.value);});for(const g of geometries)g.dispose();for(const t of textures){t.dispose();t.image?.close?.();}this.resources=[];}
}
