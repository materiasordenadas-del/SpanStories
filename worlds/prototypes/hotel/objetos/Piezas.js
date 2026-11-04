import * as T from '../engine/three.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe } from '../engine/Luz25D.js';
export function pieza(root,name,geometry,color,position=[0,0,0],outline=true) {
  const mesh=new T.Mesh(geometry,crearMaterialToon({color,bandas:3}));
  mesh.name=name;mesh.position.set(...position);
  if(outline) contornoDe(mesh,crearMaterialContorno(color,'medio'));
  root.add(mesh);return mesh;
}
export const caja=(root,name,w,h,d,color,x=0,y=h/2,z=0,outline=true)=>pieza(root,name,new T.BoxGeometry(w,h,d),color,[x,y,z],outline);
export const cilindro=(root,name,r,h,color,x=0,y=h/2,z=0)=>pieza(root,name,new T.CylinderGeometry(r,r,h,16),color,[x,y,z]);
export const esfera=(root,name,r,color,x=0,y=0,z=0)=>pieza(root,name,new T.SphereGeometry(r,12,8),color,[x,y,z]);
