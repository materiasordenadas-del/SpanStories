import * as THREE from 'three';
import {MeshBuilder,SURF} from '../geom/mesh.js';
import {createGMaterial} from '../render/gmaterial.js';

export function validateInterior(value={}){
  const out={enabled:value.enabled===true,layout:value.layout??'single',height:value.height??2.8,doorWidth:value.doorWidth??1.6,doorHeight:value.doorHeight??2.2};
  if(!['single','two'].includes(out.layout)||!Number.isFinite(out.height)||out.height<2.2||out.height>4||!Number.isFinite(out.doorWidth)||out.doorWidth<1||out.doorWidth>2.5||!Number.isFinite(out.doorHeight)||out.doorHeight<1.9||out.doorHeight>3.5)throw Error('Parámetros de interior no válidos');
  return out;
}
export function withInteriors(model,configs={}){return {...model,buildings:model.buildings.map(b=>{if(!Object.hasOwn(configs,b.id))return b;const config=validateInterior(configs[b.id]);if(config.enabled&&(b.modelId||b.use==='religious'||b.forceStyle==='iglesia'))throw Error('No se admite interior generado en un modelo propio o edificio religioso');return {...b,interiorConfig:config};})};}
export function interiorPlan(pb,entry){
  const config=pb.b.interiorConfig;if(!config?.enabled)return null;
  if(pb.b.modelId||pb.b.minHeight>0||pb.b.use==='religious'||!entry||entry.arcade||entry.exp==='party'||entry.k>0||pb.gmax-pb.gmin+Math.max(0,pb.b.baseOffset??0)>.25||(pb.b.baseOffset??0)<0)throw Error('Interior generado incompatible: requiere planta baja accesible, apoyo casi plano y frente sin soportales ni modelo propio');
  const rectangular=pb.rings.length===1&&pb.rings[0].length===4&&pb.rings[0].every((a,i,r)=>{const b=r[(i+1)%4],c=r[(i+2)%4],dx=b[0]-a[0],dz=b[1]-a[1],ex=c[0]-b[0],ez=c[1]-b[1];return Math.abs(dx*ex+dz*ez)<.02*Math.hypot(dx,dz)*Math.hypot(ex,ez);});
  if(config.layout==='two'&&!rectangular)throw Error('Dos estancias requiere una huella rectangular; utiliza una estancia');
  const floor=pb.base+.18,ceiling=Math.min(floor+config.height,pb.top-.12),height=ceiling-floor;
  if(height<2.1)throw Error('El edificio no tiene altura libre suficiente');
  const width=Math.min(config.doorWidth,entry.len-.8);if(width<1)throw Error('El frente es demasiado estrecho para la entrada');
  const center=[(entry.a[0]+entry.b[0])/2,(entry.a[1]+entry.b[1])/2],half=width/2,doorA=[center[0]-entry.d[0]*half,center[1]-entry.d[1]*half],doorB=[center[0]+entry.d[0]*half,center[1]+entry.d[1]*half];
  const walls=[];pb.rings.forEach((ring,k)=>ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length];if(k===entry.k&&i===entry.i){walls.push([a,doorA],[doorB,b]);}else walls.push([a,b]);}));
  const partitions=[];
  if(config.layout==='two'){
    const r=pb.rings[0],i=(entry.i+1)%4,a=[(r[i][0]+r[(i+1)%4][0])/2,(r[i][1]+r[(i+1)%4][1])/2],b=[(r[(i+2)%4][0]+r[(i+3)%4][0])/2,(r[(i+2)%4][1]+r[(i+3)%4][1])/2],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<3)throw Error('No hay espacio suficiente para dividir el interior');
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],h=.65;partitions.push([a,[mid[0]-dx/length*h,mid[1]-dz/length*h]],[[mid[0]+dx/length*h,mid[1]+dz/length*h],b]);walls.push(...partitions);
  }
  return {id:pb.b.id,rings:pb.rings,floor,ceiling,doorHeight:Math.min(config.doorHeight,height-.05),width,entry,center,doorA,doorB,walls,partitions,generated:true};
}
export function splitWallForDoor(a,b,y0,y1,opening){
  if(!opening)return [{a,b,y0,y1}];
  return [{a,b:opening.doorA,y0,y1},{a:opening.doorB,b,y0,y1},{a:opening.doorA,b:opening.doorB,y0:opening.floor+opening.doorHeight,y1},{a:opening.doorA,b:opening.doorB,y0,y1:opening.floor}].filter(p=>p.y1>p.y0&&Math.hypot(p.b[0]-p.a[0],p.b[1]-p.a[1])>.01);
}
export function buildInteriorGroup(prepared,{sun}={}){
  const group=new THREE.Group();group.name='interiores-generados';const floors=[],plans=[];
  for(const pb of prepared){const p=pb.interiorPlan;if(!p)continue;plans.push(p);floors.push({rings:p.rings,y:p.floor});
    const root=new THREE.Group();root.name='interior:'+p.id;root.userData={entityId:p.id,kind:'interior-root',generated:true};group.add(root);
    const material=createGMaterial({sun,doubleSided:true});material.uniforms.uMeshId.value=.42;
    const add=(mb,name)=>{if(!mb.vertexCount)return;const mesh=new THREE.Mesh(mb.build(),material);mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=true;mesh.userData={entityId:p.id,componentId:p.id+':'+name,kind:'building-interior',generated:true};root.add(mesh);};
    const floor=new MeshBuilder();floor.setId(pb.index+1);floor.polygon(p.rings[0],p.rings.slice(1),p.floor,new THREE.Color('#b7a58a'),SURF.paving);add(floor,'suelo-interior');
    const ceiling=new MeshBuilder();ceiling.setId(pb.index+1);ceiling.polygon(p.rings[0],p.rings.slice(1),p.ceiling,new THREE.Color('#eee8dc'),SURF.wall,{flip:true});add(ceiling,'cielo-interior');
    p.walls.forEach(([a,b],i)=>{const mb=new MeshBuilder();mb.setId(pb.index+1);mb.quad([a[0],p.floor,a[1]],[b[0],p.floor,b[1]],[b[0],p.ceiling,b[1]],[a[0],p.ceiling,a[1]],new THREE.Color('#e4dbcd'),SURF.wall);add(mb,'pared-interior-'+i);});
    const lintel=new MeshBuilder();lintel.setId(pb.index+1);const [a,b]=[p.doorA,p.doorB],bottom=p.floor+p.doorHeight;
    lintel.quad([a[0],bottom,a[1]],[b[0],bottom,b[1]],[b[0],p.ceiling,b[1]],[a[0],p.ceiling,a[1]],new THREE.Color('#e4dbcd'),SURF.wall);add(lintel,'dintel-interior');
  }
  return {group,floors,plans};
}
