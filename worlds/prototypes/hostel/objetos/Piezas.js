import * as T from '../engine/three.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe } from '../engine/Luz25D.js';
// outline: true = trazo «medio» (mobiliario), 'fino' (arquitectura grande), 'fuerte', o false (sin trazo).
export function pieza(root,name,geometry,color,position=[0,0,0],outline=true) {
  const mesh=new T.Mesh(geometry,crearMaterialToon({color,bandas:3}));
  mesh.name=name;mesh.position.set(...position);
  if(outline){const nivel=outline===true?'medio':outline;mesh.userData.nivelContorno=nivel;contornoDe(mesh,crearMaterialContorno(color,nivel));}
  root.add(mesh);return mesh;
}
export const caja=(root,name,w,h,d,color,x=0,y=h/2,z=0,outline=true)=>pieza(root,name,new T.BoxGeometry(w,h,d),color,[x,y,z],outline);
export const cilindro=(root,name,r,h,color,x=0,y=h/2,z=0,outline=true,seg=16)=>pieza(root,name,new T.CylinderGeometry(r,r,h,seg),color,[x,y,z],outline);
export const esfera=(root,name,r,color,x=0,y=0,z=0,outline=true)=>pieza(root,name,new T.SphereGeometry(r,12,8),color,[x,y,z],outline);
/** Caja entre dos puntos en planta (viga, cuerda, tablón): de (x0,z0) a (x1,z1) a la altura y. */
export function barra(root,name,[x0,y0,z0],[x1,y1,z1],grosor,color,outline=true){
  const a=new T.Vector3(x0,y0,z0),b=new T.Vector3(x1,y1,z1),len=a.distanceTo(b);
  const m=pieza(root,name,new T.BoxGeometry(grosor,grosor,len),color,[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],outline);
  m.lookAt(b.x,b.y,b.z);return m;
}
