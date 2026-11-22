// Placas de calle: un atlas de texto por cada 64 placas; viajan al GLB como las de los comercios.
import * as T from 'three';
import {placeStreetPlates} from '../arq/street-plates.js';
import {createGMaterial} from './gmaterial.js';
import {variantOf,streetPlateStyle} from '../data/spanish-variant.js';
import {regionOf} from '../arq/styles.js';

const PAGE=64,CW=512,CH=128;
function drawPage(list,style){
  const rows=Math.ceil(list.length/2),height=2**Math.ceil(Math.log2(Math.max(1,rows)*CH)),uv=[];
  if(typeof document==='undefined'){const texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;return {texture,uv:list.map(()=>[[0,0],[1,0],[1,1],[0,1]])};}
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=height;const g=canvas.getContext('2d');
  list.forEach((p,i)=>{const x=i%2*CW,y=Math.floor(i/2)*CH,w=Math.round(CW*Math.min(1,p.ancho/2.2)),x0=x+(CW-w)/2;
    g.fillStyle=style.fondo;g.fillRect(x0+2,y+2,w-4,CH-4);g.strokeStyle=style.borde;g.lineWidth=6;g.strokeRect(x0+9,y+9,w-18,CH-18);
    if(style.id==='azulejo'){g.lineWidth=2;g.strokeRect(x0+17,y+17,w-34,CH-34);}
    g.fillStyle=style.texto;g.textAlign='center';g.textBaseline='middle';let size=54;const font=px=>style.fuente.replace('{px}',px);g.font=font(size);while(g.measureText(p.nombre).width>w-44&&size>18)g.font=font(--size);g.fillText(p.nombre,x0+w/2,y+CH/2+2);
    const u0=(x0+2)/1024,u1=(x0+w-2)/1024,v0=1-(y+CH-2)/height,v1=1-(y+2)/height;uv.push([[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);});
  const texture=new T.CanvasTexture(canvas);texture.name='ss_placas_calle';texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;texture.userData.ssCommerceAtlas=true;return {texture,uv};
}
export function buildStreetPlates(model,{sun,enabled=true,shops=[]}={}){
  const group=new T.Group();group.name='placas-calle';if(!enabled)return {group,entries:[]};
  const entries=placeStreetPlates(model,{shops}),style=streetPlateStyle(variantOf(model.bounds),regionOf(model.bounds));
  const v=new T.Vector3(),q=new T.Quaternion(),m=new T.Matrix4(),up=new T.Vector3(0,1,0);
  for(let start=0;start<entries.length;start+=PAGE){
    const list=entries.slice(start,start+PAGE),{texture,uv}=drawPage(list,style),p=[],u=[],ids=[];
    list.forEach((e,i)=>{q.setFromAxisAngle(up,e.yaw);m.compose(new T.Vector3(e.x,e.y,e.z),q,new T.Vector3(1,1,1));const w=e.ancho/2,h=e.alto/2,corners=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([a,b])=>v.set(a,b,0).applyMatrix4(m).toArray());
      for(const k of [0,1,2,0,2,3]){p.push(...corners[k]);u.push(...uv[i][k]);ids.push(i+1);}});
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(u,2));geometry.setAttribute('aId',new T.Float32BufferAttribute(ids,1));geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(p.length).fill(1),3));geometry.setAttribute('aSurf',new T.Float32BufferAttribute(new Float32Array(ids.length),1));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const source=new T.MeshStandardMaterial({map:texture,roughness:.7,metalness:0,vertexColors:true,side:T.DoubleSide});source.name='ss_placa_calle';source.userData={ss_rol:'placa_calle',ss_noOutline:true};
    const material=createGMaterial({sun,map:texture,alphaTest:0,doubleSided:true,emissive:0,surf:-1});material.userData={...material.userData,...source.userData};
    const mesh=new T.Mesh(geometry,material);mesh.name='placas_calle_'+start/PAGE;mesh.userData={kind:'signage',ss_rol:'placa_calle',ss_noOutline:true,commerceIds:list.map(e=>e.id),plates:list.map(e=>({id:e.id,nombre:e.nombre}))};mesh._ssOriginalMaterial=source;mesh.castShadow=false;group.add(mesh);
  }
  return {group,entries,style:style.id};
}
