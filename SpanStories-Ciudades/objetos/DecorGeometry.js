import * as T from '../engine/three.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

// Flatten a prototype once; instances keep independent transforms and identities.
export function flattened(source) {
  source.updateWorldMatrix(true,true);const parts=[];
  source.traverse(o=>{if(o.isMesh){
    const g=o.geometry.clone().applyMatrix4(o.matrixWorld);
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
    if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    if(!g.index)g.setIndex(Array.from({length:g.getAttribute('position').count},(_,i)=>i));
    parts.push({geometry:g,material:o.material,name:o.name});
  }});return parts;
}
export function bounds(parts){const b=new T.Box3();for(const p of parts){p.geometry.computeBoundingBox();b.union(p.geometry.boundingBox);}return b;}
export function normalize(parts,height,{widthScale=1,rotateY=0}={}){
  if(rotateY)for(const p of parts)p.geometry.rotateY(rotateY);
  const b=bounds(parts),center=b.getCenter(new T.Vector3()),scale=height/(b.max.y-b.min.y);
  for(const p of parts)p.geometry.translate(-center.x,-b.min.y,-center.z).scale(scale*widthScale,scale,scale*widthScale);
  return parts;
}
export function merged(parts){
  const groups=new Map();for(const p of parts){if(!groups.has(p.material.uuid))groups.set(p.material.uuid,[]);groups.get(p.material.uuid).push(p);}
  return [...groups.values()].map(group=>{
    if(group.length===1)return group[0];
    const geometry=mergeGeometries(group.map(p=>p.geometry));if(!geometry)throw new Error('Geometrías de decoración incompatibles.');
    for(const p of group)p.geometry.dispose();return {geometry,material:group[0].material,name:group.map(p=>p.name).join('+')};
  });
}
export function groupOf(parts){const group=new T.Group();for(const p of parts){const mesh=new T.Mesh(p.geometry,p.material);mesh.name=p.name;group.add(mesh);}return group;}
export function triangles(parts){return parts.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.getAttribute('position').count)/3,0);}
