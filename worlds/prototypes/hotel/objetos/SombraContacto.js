import * as T from '../engine/three.js';
let map;
export function crearSombraContacto(ancho,fondo){
  if(!map){const size=64,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const radius=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=70;data[i+3]=Math.round(Math.pow(Math.max(0,1-radius),1.7)*70);}map=new T.DataTexture(data,size,size);map.needsUpdate=true;map.magFilter=map.minFilter=T.LinearFilter;}
  const mesh=new T.Mesh(new T.PlaneGeometry(ancho*1.2,fondo*1.2),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,color:'#66756a'}));mesh.rotation.x=-Math.PI/2;mesh.userData.ignorarSeleccion=true;mesh.raycast=()=>{};mesh.name='sombra-de-contacto';return mesh;
}
