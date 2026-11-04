// Adaptador portátil; el receptor aporta Three.js y su luz. No modifica el visor anfitrión.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

export function entityFromHit(hit,entities){
  for(let o=hit?.object;o;o=o.parent){if(o.userData.entityId)return o.userData.entityId;if(hit.instanceId!=null&&o.userData.instanceEntityIds)return entities[o.userData.instanceEntityIds[hit.instanceId]]??null;}
  const a=hit?.object.geometry?.getAttribute('_entity_id')??hit?.object.geometry?.getAttribute('__entity_id'),face=hit?.face;return a&&face?entities[Math.round(a.getX(face.a))]??null:null;
}
function safeURL(path,base){if(typeof path!=='string'||!path)throw Error('Ruta de paquete no válida');const decoded=decodeURIComponent(path);if(decoded.includes('..')||decoded.includes('\\')||decoded.startsWith('/')||/^[a-z]+:/i.test(decoded))throw Error('Ruta de paquete no válida');return new URL(path,base).href;}
export class AtlasPackage{
  constructor({fetcher=fetch,loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)}={}){this.fetcher=fetcher;this.loader=loader;this.group=new THREE.Group();this.group.name='paquete-atlas';this.sectors=new Map();this.pending=new Map();this.tokens=new Map();this.entities={};this.disposed=false;this.epoch=0;}
  async json(url){const call=this.fetcher,r=await call(url);if(!r.ok)throw Error('Paquete no disponible: '+r.status);return r.json();}
  async open(manifestURL){
    this.base=new URL('./',manifestURL).href;const m=await this.json(manifestURL);if(m.format!=='atlas-estudio-paquete'||m.version!==2||!m.complete||!Array.isArray(m.files))throw Error('Paquete incompleto o incompatible');
    this.manifest=m;this.integrity=new Map(m.files.map(f=>[f.path,f]));const data=await this.json(safeURL(m.sectors,this.base)),e=await this.json(safeURL(m.entities,this.base));this.index=data.sectores;this.entities=e.entities;
    if(!Array.isArray(this.index)||!this.entities||typeof this.entities!=='object')throw Error('Índice o identidades no válidos');return this;
  }
  async load(id){
    if(this.disposed)throw Error('Paquete cerrado');if(this.sectors.has(id))return this.sectors.get(id);if(this.pending.has(id))return this.pending.get(id);const sector=this.index.find(s=>s.id===id);if(!sector)throw Error('Sector desconocido');
    const token=this.tokens.get(id)??0;const work=(async()=>{const call=this.fetcher,r=await call(safeURL(sector.archivo,this.base));if(!r.ok)throw Error('No se pudo cargar el sector');const bytes=await r.arrayBuffer(),record=this.integrity.get(sector.archivo);if(!record||bytes.byteLength!==record.bytes)throw Error('Tamaño de sector incorrecto');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==record.sha256)throw Error('Integridad de sector incorrecta');
      const gltf=await this.loader.parseAsync(bytes,this.base),root=gltf.scene;if(this.disposed||token!==(this.tokens.get(id)??0)){release(root);return null;}root.name=id;root.userData.sectorId=id;root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.group.add(root);this.sectors.set(id,root);return root;
    })();this.pending.set(id,work);try{return await work;}finally{this.pending.delete(id);}
  }
  async loadAll({onProgress=()=>{}}={}){for(let i=0;i<this.index.length;i++){await this.load(this.index[i].id);onProgress(i+1,this.index.length);}return this.group;}
  async nearby(point,{radius=180,maxSectors=16,maxBytes=128*1048576}={}){let budget=0;const epoch=++this.epoch,candidates=this.index.map(s=>{const b=s.caja;return {s,d:Math.hypot(Math.max(b.min[0]-point.x,0,point.x-b.max[0]),Math.max(b.min[2]-point.z,0,point.z-b.max[2]))};}).filter(e=>e.d<=radius).sort((a,b)=>a.d-b.d).slice(0,maxSectors).filter(e=>{const size=e.s.rawBytes??e.s.bytes;if(budget+size>maxBytes)return false;budget+=size;return true;}),ids=new Set(candidates.map(e=>e.s.id));for(const id of new Set([...this.sectors.keys(),...this.pending.keys()]))if(!ids.has(id))this.unload(id);for(const e of candidates){if(epoch!==this.epoch||this.disposed)break;await this.load(e.s.id);}return this.group;}
  resolveHit(hit){return entityFromHit(hit,this.entities);}
  unload(id){this.tokens.set(id,(this.tokens.get(id)??0)+1);const root=this.sectors.get(id);if(!root)return;this.group.remove(root);release(root);this.sectors.delete(id);}
  dispose(){this.disposed=true;for(const id of [...this.sectors.keys()])this.unload(id);}
}
function release(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material,o._ssPreviewOriginal].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}if(o.isInstancedMesh)o.dispose();});for(const r of [...geometries,...materials,...textures])r.dispose();}
