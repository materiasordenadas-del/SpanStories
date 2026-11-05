// Paquete completo, autocontenido, con identidad y sectores verificables.
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {appearancePolicy} from '../data/appearance-policy.js';
import {encodeProject} from '../data/project.js';
import {modelForExport} from './model-node.js';
import {chunkManifest,chunkModel,finalizeChunk} from '../scene/chunks.js';
import {buildPlaceScene} from '../scene/place-scene.js';
import {disposeScene} from '../render/resources.js';
import packageInfo from '../../../package.json' with {type:'json'};
import {commerceMetadata} from '../data/commerces.js';
import {climateOf} from '../data/climate.js';
import {treeCatalogExport} from '../data/tree-catalog.js';
import {commerceTextureExporter} from './commerce-textures.js';

const SECTOR=50,BAKE_BELOW=12;
const category=s=>s===1||s===5?'cristal':s===3?'agua':s===8?'cesped':s===2?'vegetacion':s===4?'metal':[6,7,12,15,16].includes(s)?'terreno':'arquitectura';
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);};
export function validateExportScene(scene){scene.traverse(o=>{if(!o.isMesh)return;for(const a of [...Object.values(o.geometry.attributes),o.instanceMatrix,o.instanceColor].filter(Boolean))for(const v of a.array)if(!Number.isFinite(v))throw Error('Geometría no válida en '+o.name);});}
export class EntityTable{
  constructor(buildings=[],roads=[]){this.entities={};this.indices=new Map();for(const b of buildings)this.add(b.id);for(const r of roads)this.add(r.id);}
  add(id){if(!id)return 0;if(!this.indices.has(id)){const n=this.indices.size+1;this.indices.set(id,n);this.entities[n]=id;}return this.indices.get(id);}
}
// Misma geometría y materiales estándar que sustentan el render de Atlas.
// Las instancias conservan identidad comercial; los textos únicos se funden por sector.
export function splitCommerce(source,sectors,table){
  const original=source._ssOriginalMaterial;if(!original)throw Error('Comercio sin material glTF: '+source.name);
  const geometry=source.geometry.clone();for(const key of ['aSurf','aTint','aTint2'])geometry.deleteAttribute(key);
  if(source.isInstancedMesh){const cells=new Map(),matrix=new THREE.Matrix4();for(let i=0;i<source.count;i++){source.getMatrixAt(i,matrix);matrix.premultiply(source.matrixWorld);const key=Math.floor(matrix.elements[12]/SECTOR)+'_'+Math.floor(matrix.elements[14]/SECTOR);if(!cells.has(key))cells.set(key,[]);cells.get(key).push({i,matrix:matrix.clone()});}
    for(const [key,items]of cells){const im=new THREE.InstancedMesh(geometry.clone(),original.clone(),items.length);im.name='prefab_'+source.name;im.userData={...source.userData,instanceEntityIds:items.map(it=>table.add(source.userData.commerceIds[it.i]))};items.forEach((it,i)=>{im.setMatrixAt(i,it.matrix);if(source.instanceColor)im.setColorAt(i,new THREE.Color(source.instanceColor.getX(it.i),source.instanceColor.getY(it.i),source.instanceColor.getZ(it.i)));});im.layers.set(0);bucket(sectors,key).commerces.push(im);}
    geometry.dispose();
  }else{const ids=geometry.getAttribute('aId');geometry.setAttribute('entity_id',new THREE.Float32BufferAttribute(Array.from(ids.array,n=>table.add(source.userData.commerceIds[Math.round(n)-1])),1));geometry.deleteAttribute('aId');geometry.applyMatrix4(source.matrixWorld);const mesh=new THREE.Mesh(geometry,original.clone());mesh.name=source.name;mesh.userData={...source.userData};const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());bucket(sectors,Math.floor(center.x/SECTOR)+'_'+Math.floor(center.z/SECTOR)).commerces.push(mesh);}
}
async function request(url,body){const r=await fetch(url,{method:'POST',body});const data=await r.json();if(!r.ok)throw Error(data.error??'No se pudo guardar el paquete');return data;}
function bucket(out,key){if(!out.has(key))out.set(key,{statics:new Map(),instances:new Map(),models:[],commerces:[]});return out.get(key);}
function staticBucket(sec,cat){if(!sec.statics.has(cat))sec.statics.set(cat,{p:[],n:[],c:[],e:[],s:[]});return sec.statics.get(cat);}
export function splitStatic(geometry,matrix,out,{model,table,kind='building',entityId=null}){
  const P=geometry.attributes.position,N=geometry.attributes.normal,C=geometry.attributes.color,S=geometry.attributes.aSurf,A=geometry.attributes.aId;
  const v=new THREE.Vector3(),normal=new THREE.Vector3(),nm=new THREE.Matrix3().getNormalMatrix(matrix);
  for(let t=0;t<P.count;t+=3){
    let x=0,z=0;for(let k=0;k<3;k++){v.fromBufferAttribute(P,t+k).applyMatrix4(matrix);x+=v.x/3;z+=v.z/3;}
    const sec=bucket(out,Math.floor(x/SECTOR)+'_'+Math.floor(z/SECTOR)),b=staticBucket(sec,category(S?Math.round(S.getX(t)):0));
    const index=A?Math.round(A.getX(t))-1:-1,id=entityId??(kind==='building'||kind==='building-interior'?model.buildings[index]?.id:kind==='infrastructure'?model.roads[index]?.id:null),owner=table.add(id);
    for(let k=0;k<3;k++){v.fromBufferAttribute(P,t+k).applyMatrix4(matrix);normal.fromBufferAttribute(N,t+k).applyMatrix3(nm).normalize();b.p.push(v.x,v.y,v.z);b.n.push(normal.x,normal.y,normal.z);b.c.push(C?.getX(t+k)??1,C?.getY(t+k)??1,C?.getZ(t+k)??1);b.e.push(owner);b.s.push(S?.getX(t+k)??0);}
  }
}
export function exportParts(geometry,tree=false){
  const expanded=geometry.index?geometry.toNonIndexed():null;if(expanded)geometry=expanded;
  const P=geometry.attributes.position,N=geometry.attributes.normal,C=geometry.attributes.color,S=geometry.attributes.aSurf,T=geometry.attributes.aTint,out=new Map();
  for(let t=0;t<P.count;t+=3){const tint=tree?1:Math.round(T?.getX(t)??0),cat=tree?'vegetacion':category(Math.round(S?.getX(t)??0)),key=tint+'|'+cat;
    if(!out.has(key))out.set(key,{tint,cat,p:[],n:[],c:[],s:[],u:[]});const b=out.get(key);
    for(let k=0;k<3;k++){b.p.push(P.getX(t+k),P.getY(t+k),P.getZ(t+k));b.n.push(N.getX(t+k),N.getY(t+k),N.getZ(t+k));b.c.push(C?.getX(t+k)??1,C?.getY(t+k)??1,C?.getZ(t+k)??1);b.s.push(S?.getX(t+k)??0);if(geometry.attributes.uv)b.u.push(geometry.attributes.uv.getX(t+k),geometry.attributes.uv.getY(t+k));}
  }
  const result=[...out.values()].map(b=>{const g=new THREE.BufferGeometry();for(const [name,a]of [['position',b.p],['normal',b.n],['color',b.c]])g.setAttribute(name,new THREE.Float32BufferAttribute(a,3));if(b.u.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(b.u,2));g.setAttribute('surface',new THREE.Float32BufferAttribute(b.s,1));g.computeBoundingSphere();return {geometry:g,tint:b.tint,cat:b.cat};});expanded?.dispose();return result;
}
async function exportGroup(state,{prefix,save,onProgress,table}){
  const group=state.built.group;group.updateMatrixWorld(true);const sectors=new Map(),prefabs=new Map(),anchors=[];
  group.traverse(o=>{
    if(o.isMesh&&o.userData.kind==='commerce')splitCommerce(o,sectors,table);
    if(o.isMesh&&!o.isInstancedMesh&&['ground','building','building-interior','infrastructure'].includes(o.userData.kind))splitStatic(o.geometry,o.matrixWorld,sectors,{model:state.model,table,kind:o.userData.kind,entityId:o.userData.entityId});
    if(o.userData.kind==='building-model-root'){const c=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());bucket(sectors,Math.floor(c.x/SECTOR)+'_'+Math.floor(c.z/SECTOR)).models.push(o);}
  });
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),e=new THREE.Euler();
  group.traverse(im=>{
    const tree=im.userData.kind==='tree';if(!im.isInstancedMesh||!tree&&im.userData.kind!=='element')return;
    const type=tree?'arbol':im.userData.type,key=tree?im.name:im.name.replace(/^elemento:/,'');
    if(!prefabs.has(key))prefabs.set(key,{type,tree,source:im,parts:exportParts(im.geometry,tree)});
    for(let i=0;i<im.count;i++){
      im.getMatrixAt(i,m);m.premultiply(im.matrixWorld);m.decompose(p,q,s);
      const building=state.model.buildings[im.userData.buildings?.[i]],id=im.userData.commerceIds?.[i]??building?.id??(type+':'+hash(key+':'+p.toArray().map(v=>v.toFixed(3)).join(':'))),owner=table.add(id),sec=bucket(sectors,Math.floor(p.x/SECTOR)+'_'+Math.floor(p.z/SECTOR));
      if(!sec.instances.has(key))sec.instances.set(key,[]);sec.instances.get(key).push({matrix:m.clone(),owner,c1:im.instanceColor?[im.instanceColor.getX(i),im.instanceColor.getY(i),im.instanceColor.getZ(i)]:[1,1,1],c2:im.geometry.attributes.aTint2?[im.geometry.attributes.aTint2.getX(i),im.geometry.attributes.aTint2.getY(i),im.geometry.attributes.aTint2.getZ(i)]:[1,1,1]});
      if(['bench','parkedCar','terrace','statue','arbol','kiosk','bikes'].includes(type)){e.setFromQuaternion(q,'YXZ');anchors.push({id,tipo:type,x:p.x,y:p.y,z:p.z,ry:e.y,embedded:true,resource:key,...(tree?{especie:im.userData.species??null}:{})});}
    }
  });
  const exporter=new GLTFExporter().register(commerceTextureExporter),materials=new Map(),index=[];
  const material=(cat,pf=null)=>{const src=pf?.tree?pf.source.material:null,map=src?.uniforms.map.value??null,key=cat+':'+(map?.uuid??'')+':'+(src?.uniforms.uAlphaTest.value??0);if(!materials.has(key)){const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,map,alphaTest:src?.uniforms.uAlphaTest.value??0,side:src?.side??THREE.FrontSide});mat.name=cat;mat.userData={ssCategory:cat};materials.set(key,mat);}return materials.get(key);};
  try{for(const [key,sec]of sectors){
    const scene=new THREE.Scene(),ownedGeometry=[],ownedMaterials=[];scene.name=prefix+'S_'+key;let triangles=0,calls=0;
    for(const [prefab,items]of sec.instances){const pf=prefabs.get(prefab);
      for(const part of pf.parts){
        if(items.length<BAKE_BELOW&&!pf.tree){const b=staticBucket(sec,part.cat),P=part.geometry.attributes.position,N=part.geometry.attributes.normal,C=part.geometry.attributes.color,v=new THREE.Vector3(),n=new THREE.Vector3();
          for(const it of items){const nm=new THREE.Matrix3().getNormalMatrix(it.matrix),tint=part.tint===1?it.c1:part.tint===2?it.c2:[1,1,1];for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(it.matrix);n.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();b.p.push(v.x,v.y,v.z);b.n.push(n.x,n.y,n.z);b.c.push(C.getX(i)*tint[0],C.getY(i)*tint[1],C.getZ(i)*tint[2]);b.e.push(it.owner);b.s.push(part.geometry.attributes.surface.getX(i));}}continue;}
        const im=new THREE.InstancedMesh(part.geometry,material(part.cat,pf),items.length);im.name='prefab_'+pf.type+'_'+part.cat+'_t'+part.tint;im.userData={prefab,tipo:pf.type,instanceEntityIds:items.map(it=>it.owner)};
        items.forEach((it,i)=>{im.setMatrixAt(i,it.matrix);if(part.tint)im.setColorAt(i,new THREE.Color(...(part.tint===1?it.c1:it.c2)));});scene.add(im);triangles+=part.geometry.attributes.position.count/3*items.length;calls++;
      }
    }
    for(const [cat,b]of sec.statics){const g=new THREE.BufferGeometry();for(const [name,a,n]of [['position',b.p,3],['normal',b.n,3],['color',b.c,3],['entity_id',b.e,1],['surface',b.s,1]])g.setAttribute(name,new THREE.Float32BufferAttribute(a,n));ownedGeometry.push(g);const mesh=new THREE.Mesh(g,material(cat));mesh.name='estructura_'+cat;mesh.userData={ssCategory:cat};scene.add(mesh);triangles+=b.p.length/9;calls++;}
    for(const model of sec.models){const copy=modelForExport(model);scene.add(copy);copy.traverse(o=>{if(o.isMesh){for(const mat of [o.material].flat())ownedMaterials.push(mat);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);calls++;}});}
    for(const mesh of sec.commerces){scene.add(mesh);ownedGeometry.push(mesh.geometry);ownedMaterials.push(mesh.material);triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);calls++;}
    validateExportScene(scene);const owners=new Set();scene.traverse(o=>{for(const n of o.geometry?.attributes.entity_id?.array??[])if(n)owners.add(n);for(const n of o.userData.instanceEntityIds??[])if(n)owners.add(n);if(o.userData.entityId)owners.add(table.add(o.userData.entityId));});const box=new THREE.Box3().setFromObject(scene),name=prefix+'S_'+key;onProgress('Guardando '+name+'…');
    try{const glb=await exporter.parseAsync(scene,{binary:true}),res=await save(name,'glb',new Blob([glb]));index.push({id:name,archivo:name+'.glb',bytes:res.bytes,rawBytes:res.rawBytes,compression:res.compression,entityIds:[...owners],caja:{min:box.min.toArray(),max:box.max.toArray()},triangulos:Math.round(triangles),llamadas:calls});}
    finally{scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const r of [...ownedGeometry,...ownedMaterials])r.dispose();}
  }}finally{for(const pf of prefabs.values())for(const p of pf.parts)p.geometry.dispose();for(const m of materials.values())m.dispose();}
  return {index,anchors,prefabs:prefabs.size};
}
export async function exportSpanStories(state,{name,onProgress=()=>{}}={}){
  const start=performance.now(),reservation=await request('/api/estudio/iniciar-exportacion',JSON.stringify({name:name??'lugar'})),carpeta=reservation.carpeta,files=[],index=[],anchors=[],table=new EntityTable(state.model.buildings,state.model.roads),prepared=new Map();let prefabCount=0;
  const save=async(name,ext,body)=>{const r=await request('/api/estudio/exportar?carpeta='+encodeURIComponent(carpeta)+'&nombre='+encodeURIComponent(name)+'&ext='+ext+(ext==='glb'?'&meshopt=1':''),body);files.push({path:name+'.'+ext,bytes:r.bytes,sha256:r.sha256});return r;};
  const commerces=new Map();
  const collect=async(built,prefix='',renderIds=null)=>{built.lod?.full();const out=await exportGroup({...state,built},{prefix,save,onProgress,table});index.push(...out.index);anchors.push(...out.anchors,...(built.street?.anchors??[]).map(a=>({...a,id:prefix+a.id,pendiente:'modelo GLB del usuario'})));built.group.updateMatrixWorld(true);const origin=new THREE.Vector3().setFromMatrixPosition(built.group.matrixWorld);for(const c of built.commerce?.entries??[]){const metadata=commerceMetadata({...c,position:[c.position[0]+origin.x,c.position[1]+origin.y,c.position[2]+origin.z]});commerces.set(c.id,metadata);anchors.push(metadata.ancla);}prefabCount+=out.prefabs;for(const pb of built.buildings.prepared)if(!pb.b.id.endsWith(':atico')&&(!renderIds||renderIds.has(pb.b.id)))prepared.set(pb.b.id,{styleId:pb.styleId,roofRepresentation:pb.roofRepresentation});};
  if(state.built.streamer){
    const config=state.built.streamer.config,chunks=chunkManifest(state.model);
    for(let i=0;i<chunks.length;i++){onProgress('Construyendo sector de área '+(i+1)+'/'+chunks.length+'…');const c=chunks[i],local=chunkModel(state.model,c),built=await buildPlaceScene(local,{...config,onChange:null,onProgress:()=>{}});try{
      finalizeChunk(built,local,c,state.model);await collect(built,'C_'+c.id.replace(':','_')+'_',local.renderIds);
    }finally{disposeScene(built.group);}}
  }else await collect(state.built);
  const m=state.model,lugar={formato:'atlas-estudio-spanstories',version:2,nombre:m.label??name,tipo:m.kind,semilla:m.seed,tamano:m.size,limites:m.bounds,unidades:'metros; X este, Y arriba, Z sur; origen en el centro del área',origenAltura:m.terrain.origin,
    relieve:{resolucion:m.terrain.n,ancho:m.terrain.width,fondo:m.terrain.depth,fuente:m.terrainSource??null,alturas:Array.from(m.terrain.h)},
    edificios:m.buildings.map(b=>({id:b.id,nombre:b.name,uso:b.use,estilo:prepared.get(b.id)?.styleId??b.forceStyle??null,plantas:b.levels,altura:b.height,alturaEstimada:!!b.estimated,ajusteApoyo:b.baseOffset??0,huella:b.rings,interior:b.interiorConfig??null,apariencia:{...appearancePolicy(b),colour:b.colour??null,material:b.material??null,roof:b.roof,profile:b.facadeProfile??null,reference:b.reference??null,assetId:b.modelId??null,representation:prepared.get(b.id)?.roofRepresentation??null}})),
    calles:m.roads.map(r=>({id:r.id,clase:r.cls,tipo:r.type,ancho:r.width,nombre:r.name,puente:!!r.bridge,tunel:!!r.tunnel,elevacion:r.elevationOffset??0,profundidad:r.depth??null,alturaLibre:r.clearance??null,eje:r.points})),zonas:m.areas,clima:climateOf(m),arboles:treeCatalogExport(m),atribucion:m.attribution??null,
    comercios:[...commerces.values()],referenciasAutomaticas:state.automaticReferences??{},singulares:m.landmarks??[],efectosAtlas:{escaparates:'Caja somera, capas pintadas, vidrio, persianas y rótulos autocontenidos en cada GLB; luz ambiente modulable en el receptor'}};
  const total={sectores:index.length,triangulos:index.reduce((s,x)=>s+x.triangulos,0),bytes:index.reduce((s,x)=>s+x.bytes,0),rawBytes:index.reduce((s,x)=>s+x.rawBytes,0)};
  await save('lugar','json',JSON.stringify(lugar));await save('entidades','json',JSON.stringify({format:'atlas-entities',version:1,entities:table.entities,comercios:[...commerces.values()]}));
  await save('anclas','json',JSON.stringify({formato:'spanstories-anclas',version:2,anclas:anchors}));
  await save('recursos','json',JSON.stringify({format:'atlas-resources',version:1,embedded:true,unresolved:[],modelos:(state.assets??[]).map(a=>({id:a.id,name:a.name,source:'proyecto.json'})),note:'Geometría y texturas incluidas en GLB; las anclas son metadatos y no deben duplicarse con otros modelos.'}));
  await save('sectores','json',JSON.stringify({formato:'spanstories-sectores',version:2,tamanoSector:SECTOR,total,sectores:index}));
  await save('proyecto','json',encodeProject({...state,model:state.originalModel??state.model}));
  await save('EFECTOS_ATLAS','md','Los escaparates son geometría glTF normal: caja somera de cinco caras, tres capas pintadas con máscara alfa, vidrio transparente, persiana y rótulos. Texturas y emisivo están embebidos. Funcionan sin el adaptador del visor; este solo modula el emisivo con el ambiente. El acabado global y el cielo se aplican en el receptor. No son interiores transitables ni reconstrucciones de tiendas reales.\n');
  const adapter=await fetch('/api/estudio/receptor');if(!adapter.ok)throw Error('No se pudo incluir el receptor');await save('AtlasPackage','js',await adapter.text());
  await save('LEEME','md','# '+(lugar.nombre??carpeta)+'\n\nPaquete autocontenido de Atlas '+packageInfo.version+'. Abrir manifest.json con AtlasPackage.js en un anfitrión con Three.js compatible. El adaptador configura MeshoptDecoder, verifica SHA-256 y permite load/nearby/unload y resolveHit por ID. Las instancias comparten owner por edificio; estructura conserva _ENTITY_ID. Luz y acabado corresponden al receptor.\n\nTodos los elementos visibles se incluyen. En anclas.json, embedded:true describe elementos ya incluidos (no volver a colocarlos); embedded:false marca el lugar y el id de origen de mobiliario no modelado (modo solo estructura) para colocar un GLB propio. proyecto.json conserva la fuente editable y los modelos originales. Sin cuantización, reducción de techos ni integración automática en el visor principal. Los sectores C_i_j_S_x_z de un área grande pueden compartir celda espacial: todos son parte del paquete, con IDs únicos.\n\nUso: const p = await new AtlasPackage().open(new URL(\"manifest.json\", base).href); await p.nearby({x:0,z:0}); scene.add(p.group); const id = p.resolveHit(hit); p.dispose();\n\n'+JSON.stringify(total)+'\n\n'+JSON.stringify(m.attribution??'Escenario generado; recursos locales conservan sus atribuciones de origen.')+'\n');
  await save('manifest','json',JSON.stringify({format:'atlas-estudio-paquete',version:2,complete:true,appVersion:packageInfo.version,createdAt:new Date().toISOString(),sectors:'sectores.json',entities:'entidades.json',project:'proyecto.json',resources:'recursos.json',compression:'Meshopt sin pérdida cuando reduce bytes',files:[...files],total},null,1));
  return {carpeta,...total,anclas:anchors.length,prefabs:prefabCount,entidades:table.indices.size,ms:Math.round(performance.now()-start)};
}
