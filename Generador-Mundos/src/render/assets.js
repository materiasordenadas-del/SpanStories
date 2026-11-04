import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export class AssetLibrary{
  constructor(){this.records=[];this.models=new Map();this.loader=new GLTFLoader();}
  async add(record){if(this.models.has(record.id))return;const gltf=await this.loader.loadAsync(record.dataUrl);gltf.scene.updateMatrixWorld(true);let valid=true;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)valid=false;});if(!valid||gltf.animations.length)throw Error('Esta versión admite GLB estáticos, sin armaduras ni animaciones');const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());if(box.isEmpty()||Math.min(size.x,size.z)<=0)throw Error('El GLB necesita una huella válida');this.models.set(record.id,{scene:gltf.scene,box,size});this.records.push(record);}
  async load(records){const next=new AssetLibrary();for(const record of records)await next.add(record);this.dispose();this.records=next.records;this.models=next.models;}
  dispose(){this.models.forEach(({scene})=>scene.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}));this.models.clear();this.records=[];}
  // Model native dimensions are scaled uniformly and anchored at ground center.
  parts(id,b){const asset=this.models.get(id);if(!asset)return [];const scale=Math.min(b.width/asset.size.x,b.depth/asset.size.z,b.height/asset.size.y),center=asset.box.getCenter(new THREE.Vector3()),base=new THREE.Matrix4().compose(new THREE.Vector3(b.x,b.y,b.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.yaw),new THREE.Vector3(scale,scale,scale));base.multiply(new THREE.Matrix4().makeTranslation(-center.x,-asset.box.min.y,-center.z));const out=[];asset.scene.traverse(o=>{if(o.isMesh)out.push({geometry:o.geometry,material:o.material,matrix:base.clone().multiply(o.matrixWorld)});});return out;}
}
