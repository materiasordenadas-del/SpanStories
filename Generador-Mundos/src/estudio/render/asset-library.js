import * as THREE from 'three';
import {AssetLibrary} from '../../render/assets.js';
import {buildingFrame} from '../../geo/osm.js';
import {createGMaterial} from './gmaterial.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

export const MAX_ASSET_BYTES=48*1024*1024;
export function inspectGlb(dataUrl){
  if(typeof dataUrl!=='string'||!/^data:[^,]*;base64,/.test(dataUrl))throw Error('El modelo debe ser un GLB autocontenido');
  const encoded=dataUrl.slice(dataUrl.indexOf(',')+1);if(encoded.length>MAX_ASSET_BYTES*1.4)throw Error('GLB demasiado grande (máximo 48 MB)');
  const binary=atob(encoded),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
  if(bytes.length<24||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length||view.getUint32(16,true)!==0x4e4f534a)throw Error('Cabecera GLB no válida');
  const length=view.getUint32(12,true);if(length+20>bytes.length)throw Error('GLB incompleto');
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length)));
  if([...(json.buffers??[]),...(json.images??[])].some(item=>item.uri&&!item.uri.startsWith('data:')))throw Error('El GLB contiene recursos externos: debe incluirlos dentro del archivo');
  if((json.extensionsRequired??[]).some(e=>['KHR_draco_mesh_compression','KHR_texture_basisu'].includes(e)))throw Error('Este modelo necesita un decodificador todavía no configurado');
  return {bytes,json};
}
export async function assetRecord(dataUrl,name){
  const {bytes}=inspectGlb(dataUrl),hash=await crypto.subtle.digest('SHA-256',bytes);
  const id='glb:'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
  return {id,name:String(name??'Edificio').slice(0,150),dataUrl};
}
export class EstudioAssetLibrary{
  constructor(){this.base=new AssetLibrary();this.geometry=new Map();}
  get records(){return this.base.records;}
  get models(){return this.base.models;}
  async add(record){
    inspectGlb(record.dataUrl);if(typeof record.id!=='string'||typeof record.name!=='string')throw Error('Registro GLB no válido');
    const existing=this.records.find(r=>r.id===record.id);if(existing){if(existing.dataUrl!==record.dataUrl)throw Error('El ID ya pertenece a otro modelo');return existing;}
    const candidate=new AssetLibrary();candidate.loader.setMeshoptDecoder(MeshoptDecoder);await candidate.add(record);
    const asset=candidate.models.get(record.id);let morph=false;asset.scene.traverse(o=>{if(o.morphTargetInfluences?.length)morph=true;});
    if(morph||asset.size.y<=0){candidate.dispose();throw Error('Se necesita un edificio estático sin morph targets y con altura positiva');}
    this.models.set(record.id,asset);this.records.push(record);
    return record;
  }
  async load(records){for(const record of records)await this.add(record);}
  instantiate(recordId,b,terrain,sun){
    const asset=this.models.get(recordId);if(!asset)return null;
    const frame=buildingFrame({rings:b.rings.map(r=>r.map(([x,z])=>({x,z})))}),angle=(b.modelYaw??0)*Math.PI/180;
    const w=Math.abs(Math.cos(angle))*asset.size.x+Math.abs(Math.sin(angle))*asset.size.z,d=Math.abs(Math.sin(angle))*asset.size.x+Math.abs(Math.cos(angle))*asset.size.z;
    const y=Math.max(...b.rings[0].map(([x,z])=>terrain.height(x,z)))+b.minHeight+(b.baseOffset??0);
    const placement={...frame,y,height:b.height,width:frame.width*asset.size.x/w,depth:frame.depth*asset.size.z/d,yaw:frame.yaw+angle};
    const root=new THREE.Group();root.name='modelo:'+b.id;root.userData={entityId:b.id,kind:'building-model-root',assetId:recordId,reference:b.reference??null};
    const objects=[];asset.scene.traverse(o=>{if(o.isMesh)objects.push(o);});
    this.base.parts(recordId,placement).forEach((part,index)=>{
      const original=objects[index];let g=this.geometry.get(original.geometry.uuid);
      if(!g){g=original.geometry.clone();const n=g.attributes.position.count;if(!g.attributes.normal)g.computeVertexNormals();
        if(!g.attributes.color)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3).fill(1),3));
        g.setAttribute('aSurf',new THREE.Float32BufferAttribute(new Float32Array(n),1));g.setAttribute('aId',new THREE.Float32BufferAttribute(new Float32Array(n),1));
        g.userData.key='modelo:'+recordId+':'+original.geometry.uuid;g.userData.libraryOwned=true;this.geometry.set(original.geometry.uuid,g);
      }
      const convert=source=>{
        source.map?.updateMatrix();
        const material=createGMaterial({map:source.map,mapTransform:source.map?.matrix,baseColor:source.color,alphaTest:source.alphaTest??0,doubleSided:source.side===THREE.DoubleSide,surf:source.transparent?1:source.metalness>.6?4:10,sun});
        material.uniforms.uMeshId.value=.31;material.userData.sourceMaterial=true;return material;
      };
      const material=Array.isArray(part.material)?part.material.map(convert):convert(part.material);
      let mesh;if(original.isInstancedMesh){mesh=new THREE.InstancedMesh(g,material,original.count);mesh.instanceMatrix.copy(original.instanceMatrix);if(original.instanceColor)mesh.instanceColor=original.instanceColor.clone();}else mesh=new THREE.Mesh(g,material);
      mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrix);
      if(b.modelScale!==1&&b.modelScale!=null){const center=new THREE.Vector3(frame.x,y,frame.z),s=new THREE.Matrix4().makeTranslation(...center.toArray()).multiply(new THREE.Matrix4().makeScale(b.modelScale,b.modelScale,b.modelScale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));mesh.matrix.premultiply(s);}
      mesh.name=original.name||b.id;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={entityId:b.id,kind:'building-model',assetId:recordId};mesh._ssOriginalMaterial=part.material;
      root.add(mesh);
    });
    return root;
  }
  dispose(){for(const g of this.geometry.values())g.dispose();this.geometry.clear();this.base.dispose();}
}
