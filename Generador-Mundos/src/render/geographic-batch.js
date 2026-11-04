import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Unique OSM outlines cannot share an instance geometry. Merge by spatial chunk
// while retaining triangle ranges for selection of each original entity.
export class GeographicBatch{
 constructor(root,material){this.root=root;this.material=material;this.groups=new Map();}
 add(geometry,color,matrix,id,x,z){const key=`${Math.floor(x/360)}:${Math.floor(z/360)}`;if(!this.groups.has(key))this.groups.set(key,[]);const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(matrix);const count=g.attributes.position.count,colors=new Float32Array(count*3);for(let i=0;i<count;i++)colors.set([color.r,color.g,color.b],i*3);g.setAttribute('color',new T.Float32BufferAttribute(colors,3));for(const name of Object.keys(g.attributes))if(!['position','normal','color'].includes(name))g.deleteAttribute(name);this.groups.get(key).push({g,id});geometry.dispose();}
 finish(){for(const [key,items]of this.groups){const ranges=[];let end=0;for(const {g,id}of items){end+=g.attributes.position.count/3;ranges.push({end,id});}const geometry=mergeGeometries(items.map(i=>i.g));items.forEach(i=>i.g.dispose());geometry.userData.geoOwned=true;const mesh=new T.Mesh(geometry,this.material);mesh.name='osm-chunk:'+key;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.faceEntityRanges=ranges;this.root.add(mesh);}this.groups.clear();}
}
export function geographicHitId(mesh,faceIndex){return mesh.userData.faceEntityRanges?.find(r=>faceIndex<r.end)?.id;}
