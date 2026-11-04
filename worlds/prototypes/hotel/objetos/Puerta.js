import * as T from '../engine/three.js';
import { caja,cilindro } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearPuerta({ancho=1.05,alto=2.4,color=C.wood,sentido=-1}={}) {
  const root=new T.Group(),hinge=new T.Group();root.add(hinge);hinge.position.x=-ancho/2;
  caja(hinge,'hoja',ancho,alto,.09,color,ancho/2,alto/2);caja(hinge,'panel',ancho-.2,alto-.36,.03,C.darkWood,ancho/2,alto/2,.065);
  caja(hinge,'cerradura',.1,.2,.08,C.gold,ancho-.14,1.05,.11);
  for(const x of [-1,1]) caja(root,'marco-'+x,.09,alto+.09,.16,C.ivory,x*(ancho/2+.045),(alto+.09)/2);
  caja(root,'dintel',ancho+.18,.09,.16,C.ivory,0,alto+.045);
  root.userData.bisagra=hinge;root.userData.abierta=false;root.userData.anchoPaso=ancho;
  root.userData.accion=()=>{root.userData.abierta=!root.userData.abierta;};
  root.userData.animar=dt=>{const target=root.userData.abierta?sentido*Math.PI*.48:0;hinge.rotation.y=T.MathUtils.damp(hinge.rotation.y,target,7,dt);};
  return root;
}
