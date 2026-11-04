import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { COLORS as C,COURT as K } from '../engine/dimensions.js';

// El pivot del brazo está sobre el pedestal; cada barrera conserva su propio estado.
export function crearBarreraVehicular({ancho=K.drive,alto=K.access.baseHeight}={}){
  const root=new T.Group(),brazo=new T.Group(),post=K.access.postWidth;
  caja(root,'pedestal',post,alto,.5,C.darkWood,-ancho/2-post/2,alto/2);
  caja(root,'apoyo',.12,alto-.12,.18,C.stone,ancho/2+.08,(alto-.12)/2);
  brazo.name='brazo';brazo.position.set(-ancho/2,alto,0);root.add(brazo);
  caja(brazo,'barra',ancho,.13,.16,C.ivory,ancho/2,0,0,false);
  for(let x=.25;x<ancho;x+=.75)caja(brazo,'franja-'+x,.28,.135,.17,C.gold,x,0,0,false);
  root.userData.abierta=true;brazo.rotation.z=Math.PI/2;
  root.userData.accion=()=>{root.userData.abierta=!root.userData.abierta;};
  root.userData.animar=dt=>{const destino=root.userData.abierta?Math.PI/2:0,d=destino-brazo.rotation.z;brazo.rotation.z+=Math.sign(d)*Math.min(Math.abs(d),dt*1.8);};
  return root;
}
