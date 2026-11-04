import * as T from '../engine/three.js';
import { crearLOD } from '../engine/Detalle.js';
import { crearSofa } from './Sofa.js';
import { crearSilla } from './Silla.js';
import { crearMesa } from './Mesa.js';
import { caja,cilindro,pieza } from './Piezas.js';
import { volumenRedondeado } from './Formas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function sofaLOD({ancho=2.8,color=C.green}={}) {
  const simplified=()=>{const r=new T.Group();caja(r,'asiento',ancho,.3,.9,color,0,.34);caja(r,'respaldo',ancho,.58,.16,color,0,.64,-.38);for(const x of [-1,1]){caja(r,'brazo-'+x,.13,.57,.9,color,x*(ancho/2-.065),.44);for(const z of [-.31,.31])caja(r,'pata-'+x+z,.065,.17,.065,C.gold,x*(ancho/2-.2),.085,z);}return r;};
  return crearLOD({completo:()=>crearSofa({ancho,color}),equilibrado:simplified,ligero:simplified});
}
export function sillaLOD({color=C.green,taburete=false}={}) {
  return crearLOD({completo:()=>{const r=new T.Group(),asiento=taburete?.76:.47;
    pieza(r,'asiento',volumenRedondeado(.6,.15,.58,.06),color,[0,asiento-.075,0]);
    const back=pieza(r,'respaldo-curvo',new T.CylinderGeometry(.37,.34,.42,16,1,true,Math.PI*.18,Math.PI*.64),color,[0,asiento+.16,-.05]);back.rotation.y=Math.PI;
    for(const x of [-1,1])for(const z of [-1,1]){const p=cilindro(r,'pata-'+x+z,.022,asiento-.07,C.gold,x*.23,(asiento-.07)/2,z*.21);p.rotation.z=x*.04;}
    return r;},equilibrado:()=>crearSilla({ancho:.56,fondo:.55,alto:taburete?1.25:.9,asiento:taburete?.76:.45,color}),ligero:()=>{const r=new T.Group();caja(r,'asiento',.55,.08,.55,color,0,taburete?.76:.45);caja(r,'base',.26,taburete?.72:.4,.26,C.wood);caja(r,'respaldo',.55,.4,.06,color,0,taburete?1:.69,-.24);return r;}});
}
export function mesaLOD(options={}){return crearLOD({completo:()=>crearMesa(options),equilibrado:()=>crearMesa(options),ligero:()=>{const r=new T.Group(),w=options.ancho||1.4,h=options.alto||.76,color=options.color||C.wood;
  if(options.redonda)cilindro(r,'tablero',w/2,.08,color,0,h-.04);else caja(r,'tablero',w,.08,options.fondo||w,color,0,h-.04);
  caja(r,'pie',.16,h-.08,.16,C.gold);caja(r,'base',w*.45,.05,w*.45,C.darkWood);return r;}});}
