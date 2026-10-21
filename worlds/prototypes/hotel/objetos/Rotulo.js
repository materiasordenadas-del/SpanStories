import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearRotulo({texto,subtexto='',ancho=2.4,alto=.6,color=C.green}={}) {
  const root=new T.Group();caja(root,'placa',ancho,alto,.055,color,0,0,0,false);
  if(typeof document!=='undefined') {
    // El lienzo sigue la proporción de la placa: el texto no se deforma en placas pequeñas.
    const H=256,W=Math.min(2048,Math.max(H,Math.round(H*ancho/alto)));
    const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
    ctx.fillStyle=color;ctx.fillRect(0,0,W,H);ctx.strokeStyle=C.gold;ctx.lineWidth=5;ctx.strokeRect(12,12,W-24,H-24);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=C.ivory;ctx.font='600 '+(subtexto?64:Math.min(110,74*Math.max(1,4*alto/ancho)))+'px Georgia';ctx.fillText(texto,W/2,subtexto?95:128,W-64);
    if(subtexto){ctx.font='28px sans-serif';ctx.fillStyle=C.gold;ctx.fillText(subtexto,W/2,176,W-64);}
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const label=new T.Mesh(new T.PlaneGeometry(ancho,alto),new T.MeshBasicMaterial({map:texture}));label.position.z=.031;label.name='texto';root.add(label);
  }
  return root;
}
