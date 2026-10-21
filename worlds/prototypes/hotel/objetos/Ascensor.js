import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { DIMENSIONS as D,COLORS as C } from '../engine/dimensions.js';
export function crearAscensor() {
  const r=new T.Group(),width=3.6;
  caja(r,'pared-posterior',width,2.7,.1,C.darkWood,0,1.35,-1.7);
  caja(r,'piso-cabina',width,.04,1.8,C.stone,0,.02,-.8);
  caja(r,'techo-cabina',width,.06,1.8,C.ivory,0,2.67,-.8);
  for(const x of [-1,1])caja(r,'lateral-'+x,.1,2.7,1.8,C.darkWood,x*(width/2-.05),1.35,-.8);
  caja(r,'interior',width-.2,2.4,.04,C.gold,0,1.3,-1.63);
  // Las hojas se deslizan detrás del muro hacia bolsillos laterales de la cabina.
  const left=caja(r,'puerta-izquierda',.9,2.35,.06,C.blue,-.45,1.175,-.16);
  const right=caja(r,'puerta-derecha',.9,2.35,.06,C.blue,.45,1.175,-.24);
  for(const x of [-1,1])caja(r,'jamba-'+x,.14,2.7,.2,C.gold,x*1.08,1.35,0);
  caja(r,'dintel',2.3,.2,.2,C.gold,0,2.6,0);
  caja(r,'indicador',.5,.22,.1,C.ink,0,2.58,.12);caja(r,'botonera',.14,.4,.08,C.gold,1.26,1.18,.1);
  r.userData.abierta=false;r.userData.accion=()=>{r.userData.abierta=!r.userData.abierta;};
  r.userData.animar=dt=>{const d=r.userData.abierta?.86:0;left.position.x=T.MathUtils.damp(left.position.x,-.45-d,8,dt);right.position.x=T.MathUtils.damp(right.position.x,.45+d,8,dt);};
  return r;
}
