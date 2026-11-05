// Ensambla el lugar: suelo, edificios, elementos instanciados, mobiliario y árboles.
import * as THREE from 'three';
import {buildGround,pointInPaths,CURB} from '../geom/ground.js';
import {toExPolygons} from '../geom/clip.js';
import {buildBuildings} from '../arq/buildings.js';
import {placeStreet} from '../arq/street.js';
import '../arq/street-elements.js';
import '../arq/more-elements.js';
import {buildBarriers,equipSports} from '../arq/site.js';
import {buildInfra} from '../arq/infra.js';
import {MeshBuilder} from '../geom/mesh.js';
import {createGMaterial} from '../render/gmaterial.js';
import {buildTrees} from '../render/trees.js';
import {treeSetOf} from '../data/tree-catalog.js';
import {rng} from '../data/rng.js';
import '../arq/proxies.js';
import {ElementLOD} from '../render/lod.js';
import {buildInteriorGroup} from '../arq/interior.js';
import {tunnelGroundHoles} from '../geom/road-surface.js';
import {cropGeometry} from '../geom/crop.js';
import {buildCommerceScene} from '../render/commerce-scene.js';
import {loadCommerceBlenderKit} from '../render/commerce-blender-scene.js';
import {combineCommerceLOD} from '../render/commerce-distance-lod.js';

export async function buildPlaceScene(model,{sun,seed=model.seed,seeds={},options={},assetLibrary=null,commerceKit=null,onProgress=()=>{}}={}){
  const S={suelo:seeds.suelo??seed,fachadas:seeds.fachadas??seed,calle:seeds.calle??seed};
  const t0=performance.now();
  const group=new THREE.Group();group.name='lugar';
  onProgress('Suelo, calzadas y bordillos…');await tick();
  const ground=buildGround({...model,groundHoles:tunnelGroundHoles(model)},{seed:S.suelo});
  const staticMat=createGMaterial({sun});staticMat.uniforms.uMeshId.value=.11;
  const marksMat=createGMaterial({sun});marksMat.uniforms.uMeshId.value=.11;marksMat.polygonOffset=true;marksMat.polygonOffsetFactor=-2;marksMat.polygonOffsetUnits=-2;
  for(const m of ground.meshes){
    const mesh=new THREE.Mesh(m.geometry,m.kind==='marks'?marksMat:staticMat);
    mesh.name=m.key;mesh.receiveShadow=true;mesh.castShadow=m.key==='bordillos';mesh.userData.kind='ground';
    group.add(mesh);
  }
  onProgress('Edificios y fachadas…');await tick();
  const roadSegments=[];
  const surfaceRoads=model.roads.filter(r=>!r.tunnel&&(r.layer??0)>=0&&!r.bridge);
  for(const r of surfaceRoads)for(let i=1;i<r.points.length;i++)roadSegments.push({a:r.points[i-1],b:r.points[i],width:r.type==='pedestrian'?Math.max(r.width,3):r.width,type:r.type});
  for(const a of model.areas.filter(a=>a.kind==='plaza'))for(const ring of a.rings.slice(0,1))for(let i=0;i<ring.length;i++)roadSegments.push({a:ring[i],b:ring[(i+1)%ring.length],width:2,type:'plaza'});
  const skipIds=new Set(model.buildings.filter(b=>b.modelId&&assetLibrary?.models.has(b.modelId)).map(b=>b.id));
  const accessAsphalt=toExPolygons(ground.asphalt),groundHeightAt=(x,z)=>model.terrain.height(x,z)+(pointInPaths(x,z,accessAsphalt)?0:CURB);
  const bld=buildBuildings(model,{seed:S.fachadas,roadSegments,plazas:model.areas.filter(a=>a.kind==='plaza'),pedestrian:surfaceRoads.filter(r=>r.cls==='pedestrian'),skipIds,renderIds:model.renderIds??null,groundHeightAt,decor:options.furniture!==false});
  const bMat=createGMaterial({sun});bMat.uniforms.uMeshId.value=.29;
  for(const m of bld.meshes){const mesh=new THREE.Mesh(m.geometry,bMat);mesh.name=m.key;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.kind='building';group.add(mesh);}
  const assigned=new THREE.Group();assigned.name='modelos-edificios';
  for(const b of model.buildings)if(skipIds.has(b.id)&&(!model.renderIds||model.renderIds.has(b.id))){const object=assetLibrary.instantiate(b.modelId,b,model.terrain,sun);if(object)assigned.add(object);}
  group.add(assigned);
  const interiors=buildInteriorGroup(bld.prepared,{sun});group.add(interiors.group);
  let blenderKit=commerceKit,commerceWarning=null;if(!blenderKit&&options.commerceDesign==='blender'&&bld.instances.shopfronts.length){onProgress('Ensamblando escaparates de Blender…');blenderKit=await loadCommerceBlenderKit();}
  const commerce=buildCommerceScene(model,bld.instances.shopfronts,{sun,blenderKit});group.add(commerce.group);
  const replaced=new Set((commerce.assemblies??[]).filter(a=>a.kit).map(a=>a.id)),replaceAt=new Map(commerce.entries.filter(c=>replaced.has(c.id)).map(c=>[c.position.map(v=>v.toFixed(3)).join(':'),c.id]));
  if(replaced.size)for(const [key,g]of bld.instances.groups)if(g.type==='shopfront'){const keep=g.buildings.map((_,i)=>i).filter(i=>!replaceAt.has([g.matrices[i*16+12],g.matrices[i*16+13],g.matrices[i*16+14]].map(v=>v.toFixed(3)).join(':')));bld.instances.count-=g.buildings.length-keep.length;for(const [name,stride]of [['matrices',16],['colors',3],['colors2',3],['buildings',1]])g[name]=keep.flatMap(i=>g[name].slice(i*stride,(i+1)*stride));if(!keep.length)bld.instances.groups.delete(key);}
  const shopKey=p=>p.map(v=>v.toFixed(3)).join(':'),shopAt=new Map(commerce.entries.map(c=>[shopKey(c.position),c]));
  for(const g of bld.instances.groups.values())if(g.type==='shopfront'){g.commerceIds=[];for(let i=0;i<g.buildings.length;i++){const c=shopAt.get(shopKey([g.matrices[i*16+12],g.matrices[i*16+13],g.matrices[i*16+14]]));g.commerceIds.push(c?.id??null);if(c){const color=new THREE.Color(c.frame);g.colors.splice(i*3,3,color.r,color.g,color.b);}}}
  // Accesorios estructurales por categoría y región; la biblioteca de interiores es solo pintura.
  for(const c of commerce.entries){if(replaced.has(c.id))continue;if(c.awning&&!c.arcade)bld.instances.add('awning',{w:c.w+.1,depth:1.0,drop:.4,striped:true},[c.position[0],c.position[1]+c.h+.1,c.position[2]],c.yaw,c.frame,{building:model.buildings.findIndex(b=>b.id===c.buildingId)});if(c.blade)bld.instances.add('bladeSign',{h:.7,d:.6},[c.position[0],c.position[1]+c.h+.8,c.position[2]],c.yaw,c.frame,{building:model.buildings.findIndex(b=>b.id===c.buildingId)});}
  // Muros, vallas, setos y equipamiento de pistas, piscinas y juegos
  const siteMB=new MeshBuilder();
  const barriers=buildBarriers(model.lines.filter(l=>l.kind==='barrier'||['wall','fence','hedge','wall_fence','city_wall','railing'].includes(l.kind)),{T:model.terrain,mb:siteMB,inst:bld.instances,seed:S.calle});
  equipSports(model.areas.filter(a=>['pitch','pool','playground'].includes(a.kind)),{T:model.terrain,inst:bld.instances,seed:S.calle});
  const infra=buildInfra(model,{mb:siteMB,inst:bld.instances,seed:S.calle});
  // Muros, puentes y vías se recortan al cuadrado del lugar (en modo por sectores lo hace cada sector).
  if(siteMB.vertexCount){const built=siteMB.build(),{width:W,depth:D}=model.size,geometry=model.placementBounds?built:cropGeometry(built,[-W/2,-D/2,W/2,D/2]);if(geometry!==built)built.dispose();const m=new THREE.Mesh(geometry,bMat);m.name='recinto';m.userData.kind='infrastructure';m.castShadow=true;m.receiveShadow=true;group.add(m);}
  onProgress('Mobiliario urbano y arbolado…');await tick();
  const street=placeStreet(model,{asphalt:toExPolygons(ground.asphalt),buildingsInfo:bld.prepared,inst:bld.instances,seed:S.calle,options});
  const warnings=[];
  if(commerceWarning)warnings.push(commerceWarning);
  if(ground.stats.roadBuildingOverlap>.05)warnings.push(`Calzadas y edificios se solapan en ${ground.stats.roadBuildingOverlap.toFixed(1)} m²: superficie recortada; ejes y huellas fuente conservados. Revisa anchos y datos de origen.`);
  if(street.treeConflicts.length)warnings.push(`${street.treeConflicts.length} árboles registrados en conflicto con calzada, agua o edificios: representación omitida; puntos fuente conservados.`);
  // Variantes raras de ventanas/balcones fusionadas por sector (id propio para conservar el entintado).
  const fusedMat=createGMaterial({sun});fusedMat.uniforms.uMeshId.value=.53;
  for(const f of bld.instances.bakeRare()){const mesh=new THREE.Mesh(f.geometry,fusedMat);mesh.name=f.key;mesh.castShadow=f.cast;mesh.receiveShadow=true;mesh.userData.kind='building';group.add(mesh);}
  let mid=.5;
  const elements=bld.instances.build(()=>{const m=createGMaterial({sun,instanceTint:true});m.uniforms.uMeshId.value=(mid+=.0137)%1;return m;});
  const eGroup=new THREE.Group();eGroup.name='elementos';elements.forEach(e=>eGroup.add(e));group.add(eGroup);
  const lod=combineCommerceLOD(new ElementLOD(eGroup,{near:options.lodNear??95}),commerce.lod);
  onProgress('Árboles…');await tick();
  const r=rng(S.calle+':arboles');
  const treeSet=treeSetOf(model);
  const trees=await buildTrees(street.trees,{sun,seedRandom:r,set:treeSet.ids});
  group.add(trees);
  const stats={
    ms:Math.round(performance.now()-t0),
    buildings:bld.stats.buildings,windows:bld.stats.windows,shops:bld.stats.shops,balconies:bld.stats.balconies,
    elements:bld.instances.count,elementTypes:elements.length,trees:street.trees.length,treeSet:treeSet.ids.join(', '),...street.counts,
    groundMs:ground.stats.ms,buildingMs:bld.stats.ms,barriers,...infra,
  };
  stats.commerce=commerce.stats;return {group,stats,ground,buildings:bld,street,lod,interiors,infra,commerce,warnings};
}

const tick=()=>new Promise(r=>setTimeout(r,0));
