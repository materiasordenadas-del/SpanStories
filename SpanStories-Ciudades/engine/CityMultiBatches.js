import * as T from './three.js';
import { CityBatchedMesh, RenderMaterials } from './CityRenderOptimization.js';
import { finishSteps, budgetSteps } from './CityWorkQueue.js';

const world = new T.Matrix4(), inverse = new T.Matrix4();
const visible = node => {for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;};
const semantic = node => {for(let p=node;p;p=p.parent)if(p.userData.id||p.userData.ssId)return p.userData.id||p.userData.ssId;return null;};

// All original roots and geometry stay editable. Only their GPU representation is grouped.
export function prepararMultiBatches(root,{minimum=2}={}) {
  return finishSteps(multiBatchSteps(root,{minimum}));
}
export function prepararMultiBatchesAsync(root,options={}) {
  return budgetSteps(multiBatchSteps(root,options),options);
}
function* multiBatchSteps(root,{minimum=2}={}) {
  root.updateMatrixWorld(true);
  const groups=new Map(), originals=[], batches=[], materials=new RenderMaterials();
  const host=new T.Group();host.name='representacion-multidraw';root.add(host);
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.isBatchedMesh||mesh.morphTargetInfluences
      ||mesh.userData.cityOutline||mesh.userData.instanceBinding||Array.isArray(mesh.material)
      ||mesh.matrixWorld.determinant()<=0||!semantic(mesh))return;
    const shell=mesh.children.find(o=>o.userData.cityOutline);
    const used=new Set(['position','normal','uv',...(mesh.material.vertexColors?['color']:[])]);
    for(const match of mesh.material.vertexShader?.matchAll(/attribute\s+\w+\s+(\w+)\s*;/g)||[])used.add(match[1]);
    if(shell)used.add('outlineNormal');
    const names=[...used].filter(name=>mesh.geometry.hasAttribute(name)).sort();
    const layout=names.map(name=>{const a=mesh.geometry.getAttribute(name);return [name,a.itemSize,a.normalized,(a.isInterleavedBufferAttribute?a.data.array:a.array).constructor.name];});
    const key=mesh.material.uuid+':'+(shell?.material.uuid||'-')+':'+Boolean(mesh.geometry.index)+':'+JSON.stringify(layout);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({mesh,shell,names});
  });
  let active=true;
  let completed=false;
  const dispose=()=>{for(const o of originals){o.mesh.layers.mask=o.layers;if(o.shell)o.shell.layers.mask=o.shellLayers;delete o.mesh.userData.instanceBinding;}
    for(const batch of batches)batch.dispose();materials.dispose();host.removeFromParent();};
  try {
  for(const items of groups.values()) {
    if(items.length<minimum)continue;
    const unique=new Map();
    for(const item of items)unique.set(item.mesh.geometry,item);
    const vertices=[...unique.keys()].reduce((n,g)=>n+g.getAttribute('position').count,0);
    const indices=[...unique.keys()].reduce((n,g)=>n+(g.index?.count||0),0);
    const first=items[0];
    const batch=new CityBatchedMesh(items.length,vertices,indices,first.mesh.material);
    batch.name='multidraw:'+first.mesh.name;batch.userData.instanceIds=[];host.add(batch);batches.push(batch);
    let outline;
    if(first.shell) {
      outline=new CityBatchedMesh(items.length,vertices,indices,first.shell.material);
      outline.name=batch.name+':contorno';outline.userData.cityOutline=true;outline.raycast=()=>{};
      host.add(outline);batches.push(outline);
    }
    const geometries=new Map();
    for(const [geometry,item] of unique) {
      const view=new T.BufferGeometry();view.setIndex(geometry.index);
      view.boundingBox=geometry.boundingBox;view.boundingSphere=geometry.boundingSphere;
      for(const name of item.names)view.setAttribute(name,packedAttribute(geometry.getAttribute(name)));
      const id=batch.addGeometry(view);geometries.set(geometry,id);
      if(outline){const contour=new T.BufferGeometry();contour.setIndex(geometry.index);
        contour.boundingBox=geometry.boundingBox;contour.boundingSphere=geometry.boundingSphere;
        for(const name of ['position','outlineNormal'])contour.setAttribute(name,view.getAttribute(name));
        assertGeometryId(outline.addGeometry(contour),id);
      }
      yield;
    }
    if(outline) {
      // Both passes use the same expanded vertex order: one GPU buffer for each shared attribute.
      outline.geometry.setIndex(batch.geometry.index);
      for(const name of ['position','outlineNormal'])outline.geometry.setAttribute(name,batch.geometry.getAttribute(name));
    }
    batch.material=materials.get(first.mesh.material,batch.geometry,'batched');
    if(outline)outline.material=materials.get(first.shell.material,outline.geometry,'batched');
    const updateBounds=()=>{batch.computeBoundingBox();batch.computeBoundingSphere();if(outline){outline.computeBoundingBox();outline.computeBoundingSphere();}};
    for(const {mesh,shell} of items) {
      const index=batch.addInstance(geometries.get(mesh.geometry));
      if(outline)assertGeometryId(outline.addInstance(geometries.get(mesh.geometry)),index);
      batch.userData.instanceIds[index]=semantic(mesh);
      const original={mesh,shell,layers:mesh.layers.mask,shellLayers:shell?.layers.mask};originals.push(original);
      mesh.userData.instanceBinding={batch,index,updateBounds,
        sync(recompute=true) {
          mesh.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();world.multiplyMatrices(inverse,mesh.matrixWorld);
          // Negative scales render through the independent original so face winding stays correct.
          const compatible=world.determinant()>0,shown=visible(mesh);
          mesh.layers.mask=active&&compatible?original.layers&~1:original.layers;
          if(shell)shell.layers.mask=active&&compatible?original.shellLayers&~1:original.shellLayers;
          batch.setMatrixAt(index,world);batch.setVisibleAt(index,shown&&compatible);
          if(outline){outline.setMatrixAt(index,world);outline.setVisibleAt(index,shown&&compatible);}
          if(recompute)updateBounds();
        },
        bounds(){mesh.updateWorldMatrix(true,false);mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);}
      };
      mesh.userData.instanceBinding.sync(false);
    }
    updateBounds();
    yield;
  }
  function refresh(node=root) {
    node.updateWorldMatrix(true,true);const updated=new Set();
    node.traverse(o=>{const b=o.userData.instanceBinding;if(b?.batch?.isBatchedMesh){b.sync(false);updated.add(b.updateBounds);}});
    for(const update of updated)update();
  }
  completed=true;
  return {batches,instanceCount:originals.length,refresh,
    setActive(on){active=on;host.visible=on;refresh();},
    dispose
  };
  } finally {if(!completed)dispose();}
}
function assertGeometryId(actual,expected){if(actual!==expected)throw new Error('Unmatched outline batch identity');}
function packedAttribute(attribute) {
  if(!attribute.isInterleavedBufferAttribute)return attribute;
  const source=attribute.data.array,array=new source.constructor(attribute.count*attribute.itemSize);
  for(let i=0;i<attribute.count;i++)for(let j=0;j<attribute.itemSize;j++)
    array[i*attribute.itemSize+j]=source[i*attribute.data.stride+attribute.offset+j];
  return new T.BufferAttribute(array,attribute.itemSize,attribute.normalized);
}
