import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

export function crearPuertaBalcon({ancho=2.8,alto=2.75}={}) {
  const root=new T.Group(),leaves=[];
  for(const side of [-1,1]) {
    const leaf=new T.Group();leaf.position.x=side*ancho/4;root.add(leaf);leaves.push(leaf);
    caja(leaf,'cristal',ancho/2-.08,alto-.14,.035,C.blue,0,alto/2,side*.04,false);
    for(const x of [-1,1])caja(leaf,'marco-'+x,.045,alto,.08,C.darkWood,x*(ancho/4-.02),alto/2,side*.04,false);
    for(const y of [.04,alto-.04])caja(leaf,'travesaño-'+y,ancho/2,.08,.08,C.darkWood,0,y,side*.04,false);
    caja(leaf,'tirador',.035,.26,.06,C.gold,-side*(ancho/4-.12),1.15,.08,false);
  }
  for(const y of [.025,alto+.03])caja(root,'carril-'+y,ancho+.12,.05,.16,C.gold,0,y,0,false);
  root.userData.abierta=false;root.userData.accion=()=>{root.userData.abierta=!root.userData.abierta;};
  // Una hoja se recoge sobre la otra en carriles separados; no atraviesa el muro.
  root.userData.animar=dt=>{leaves[0].position.x=T.MathUtils.damp(leaves[0].position.x,-ancho/4+(root.userData.abierta?ancho/2:0),8,dt);};
  return root;
}
