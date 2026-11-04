import * as T from './three.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { crearMaterialContorno,contornoDe } from './Luz25D.js';
// Solo fusiona piezas de UNA unidad semántica. Muebles diferentes nunca se fusionan.
export function optimizarObjeto(root) {
  if(root.userData.animar)return root;
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map(),source=[];
  root.traverse(o=>{if(o.isMesh&&o.material?.uniforms?.uColor&&!o.material.userData?.albedo){source.push(o);}});
  if(source.some(o=>Array.isArray(o.material)))return root;
  for(const mesh of source){const color=mesh.material.uniforms.uColor.value.getHexString(),outline=mesh.children.some(c=>c.material?.name==='contorno');
    const key=color+'-'+outline,g=mesh.geometry.clone(),matrix=inverse.clone().multiply(mesh.matrixWorld);
    g.deleteAttribute('normalContorno');g.deleteAttribute('uv');if(!g.attributes.normal)g.computeVertexNormals();g.applyMatrix4(matrix);
    const entry=buckets.get(key)||{geometries:[],material:mesh.material,outline,color:'#'+color};entry.geometries.push(g);buckets.set(key,entry);
  }
  if(!source.length)return root;
  for(const mesh of source)mesh.removeFromParent();
  for(const {geometries,material,outline,color} of buckets.values()){
    const compatible=geometries.map(g=>g.index?g.toNonIndexed():g),geo=mergeGeometries(compatible,false);
    if(!geo)throw new Error('Geometrías incompatibles al optimizar '+root.name);
    const mesh=new T.Mesh(geo,material);mesh.name='piezas-'+color;root.add(mesh);if(outline)contornoDe(mesh,crearMaterialContorno(color));
    for(const g of compatible)g.dispose();for(const g of geometries)g.dispose();
  }
  root.userData.optimizado=true;return root;
}
