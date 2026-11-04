import * as T from '../engine/three.js';
import { pieza,cilindro } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearPlanta({alto=1.8,color=C.stone}={}) {
  const r=new T.Group();pieza(r,'maceta',new T.CylinderGeometry(.3,.23,.48,12),color,[0,.24,0]);
  cilindro(r,'tierra',.26,.035,C.darkWood,0,.465);cilindro(r,'tallo',.025,alto-.45,C.wood,0,(alto+.45)/2);
  for(let i=0;i<9;i++) {const a=i*2.4,y=.7+(i%3)*.22;
    const leaf=pieza(r,'hoja-'+i,new T.SphereGeometry(.23,8,6),i%2?C.leaf:C.green,[Math.cos(a)*.28,y+alto*.24,Math.sin(a)*.28]);
    leaf.scale.set(.7,1.7,.3);leaf.rotation.z=-Math.cos(a)*.65;}
  return r;
}
