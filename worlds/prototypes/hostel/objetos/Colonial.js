import * as T from '../engine/three.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
import { caja,cilindro,esfera,pieza } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Piezas coloniales (copiadas de _reservas/fachada-colonial; sin buganvilla: el hostal no lleva plantas).
// Todas tienen el pivot abajo-centro y el frente hacia +z.

// Ventana de arco de medio punto: marco de piedra, vidrio y travesaño de madera.
export function crearVentanaArco({ancho=2.2,alto=3.4,color=C.coral,vidrio=C.blue}={}) {
  const r=new T.Group(),radius=ancho/2,spring=alto-radius,frame=.22;
  caja(r,'vidrio',ancho,spring,.05,vidrio,0,spring/2,-.04,false);
  pieza(r,'vidrio-arco',new T.CircleGeometry(radius,24,0,Math.PI),vidrio,[0,spring,-.015],false);
  for(const x of [-1,1])caja(r,'jamba-'+x,frame,spring,.18,color,x*(radius+frame/2),spring/2);
  const shape=new T.Shape();shape.absarc(0,spring,radius+frame,0,Math.PI,false);shape.lineTo(-radius,spring);shape.absarc(0,spring,radius,Math.PI,0,true);shape.closePath();
  pieza(r,'rosca',new T.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false,curveSegments:20}),color,[0,0,-.09],false);
  caja(r,'clave',.3,.42,.22,color,0,alto+frame-.12,.02,false);
  caja(r,'travesaño',ancho,.06,.08,C.darkWood,0,spring,0,false);caja(r,'parteluz',.06,spring,.08,C.darkWood,0,spring/2,0,false);
  return r;
}

// Ventana balconera rectangular con postigos verdes abiertos y dintel de piedra.
export function crearVentanaBalconera({ancho=1.6,alto=2.6}={}) {
  const r=new T.Group();
  caja(r,'vidrio',ancho,alto,.05,C.blue,0,alto/2,-.04,false);
  for(const y of [alto*.55])caja(r,'travesaño',ancho,.06,.08,C.darkWood,0,y,0,false);
  caja(r,'parteluz',.06,alto,.08,C.darkWood,0,alto/2,0,false);
  for(const x of [-1,1]){caja(r,'marco-'+x,.16,alto+.08,.16,C.coral,x*(ancho/2+.08),(alto+.08)/2,0,false);
    const shutter=caja(r,'postigo-'+x,ancho/2,alto,.05,C.teal,x*(ancho*.75+.18),alto/2,.06);
    for(let i=1;i<6;i++)caja(r,'lama-'+x+'-'+i,ancho/2-.08,.035,.03,C.green,x*(ancho*.75+.18),alto*i/6,.1,false);shutter.name='postigo-'+x;}
  caja(r,'dintel',ancho+.6,.26,.24,C.coral,0,alto+.13,.04);
  return r;
}

// Balcón de madera cartagenero: losa sobre canes, balaustres torneados y tejadillo.
export function crearBalconMadera({ancho=2.6,fondo=.95,alto=1.05,techo=2.75}={}) {
  const r=new T.Group();
  caja(r,'piso',ancho,.12,fondo,C.darkWood,0,.06,fondo/2);
  for(const x of [-1,0,1])caja(r,'can-'+x,.14,.24,fondo-.05,C.darkWood,x*(ancho/2-.2),-.12,fondo/2-.02,false);
  caja(r,'pasamanos',ancho,.08,.1,C.darkWood,0,alto,fondo-.05);
  caja(r,'zócalo',ancho,.12,.08,C.darkWood,0,.18,fondo-.05,false);
  const count=Math.round(ancho/.17);
  for(let i=0;i<=count;i++)cilindro(r,'balaustre-'+i,.022,alto-.24,C.wood,-ancho/2+i*ancho/count,.24+(alto-.24)/2,fondo-.05);
  for(const s of [-1,1]){caja(r,'lateral-'+s,.08,.08,fondo,C.darkWood,s*(ancho/2-.04),alto,fondo/2,false);
    for(let i=1;i<5;i++)cilindro(r,'balaustre-lateral-'+s+'-'+i,.022,alto-.24,C.wood,s*(ancho/2-.04),.24+(alto-.24)/2,i*fondo/5);
    caja(r,'pie-derecho-'+s,.09,techo,.09,C.darkWood,s*(ancho/2-.05),techo/2,fondo-.05);}
  // Tejadillo de teja de barro sobre el balcón.
  const roof=caja(r,'tejadillo',ancho+.3,.1,fondo+.3,C.tile,0,techo+.08,fondo/2+.08);roof.rotation.x=.22;
  caja(r,'alero-tejadillo',ancho+.32,.06,.08,C.tileDark,0,techo-.04,fondo+.22,false);
  return r;
}

// Farol colonial de hierro con brazo a la pared. El vidrio es emisivo (lámpara).
export function crearFarol() {
  const r=new T.Group();
  caja(r,'placa',.16,.3,.04,C.iron,0,.15,0,false);caja(r,'brazo',.04,.04,.42,C.iron,0,.22,.21,false);
  caja(r,'techo-farol',.3,.06,.3,C.iron,0,.12,.46);caja(r,'base-farol',.22,.05,.22,C.iron,0,-.32,.46);
  const glass=new T.Mesh(new T.BoxGeometry(.2,.4,.2),new T.MeshBasicMaterial({color:'#ffe2a6'}));glass.name='luz-farol';glass.position.set(0,-.1,.46);r.add(glass);
  return r;
}

// Portón de madera de dos hojas con postigo vidriado y clavos de latón. Se abre hacia dentro.
export function crearPorton({ancho=3,alto=3.4,color=C.darkWood}={}) {
  const r=new T.Group(),leaves=[];
  for(const side of [-1,1]){const hinge=new T.Group();hinge.position.x=side*ancho/2;r.add(hinge);leaves.push([hinge,side]);
    const w=ancho/2,cx=-side*w/2;
    caja(hinge,'hoja-'+side,w,alto,.1,color,cx,alto/2);
    caja(hinge,'vidrio-'+side,w-.36,alto*.42,.03,C.blue,cx,alto*.66,.06,false);
    caja(hinge,'tablero-'+side,w-.36,alto*.3,.03,C.wood,cx,alto*.22,.06,false);
    for(let k=0;k<4;k++)esfera(hinge,'clavo-'+side+'-'+k,.03,C.gold,cx+(k%2-.5)*(w-.5),alto*(.12+.2*(k>1)),.07);
    caja(hinge,'tirador-'+side,.05,.4,.06,C.gold,-side*(w-.14),1.1,.1,false);}
  r.userData.abierta=false;r.userData.accion=()=>{r.userData.abierta=!r.userData.abierta;};
  r.userData.animar=dt=>{for(const [hinge,side] of leaves)hinge.rotation.y=T.MathUtils.damp(hinge.rotation.y,r.userData.abierta?-side*Math.PI*.42:0,7,dt);};
  return r;
}

// Alero de teja de barro: textura de canales (albedo sin luz) sobre una losa inclinada.
let tejaTex=null;
function texturaTeja(){
  if(tejaTex||typeof document==='undefined')return tejaTex;
  const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');
  ctx.fillStyle=C.tile;ctx.fillRect(0,0,256,64);
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#c27453':'#a95d42';ctx.fillRect(i*32,0,18,64);ctx.fillStyle='#8c4a35';ctx.fillRect(i*32+18,0,2,64);}
  tejaTex=new T.CanvasTexture(c);tejaTex.colorSpace=T.SRGBColorSpace;tejaTex.wrapS=tejaTex.wrapT=T.RepeatWrapping;return tejaTex;
}
// Cubierta a un agua: el borde del alero queda en y = 0 sobre z = vuelo y sube hacia -z.
export function crearAleroTeja({ancho=48,vuelo=1.3,fondo=8,pendiente=.28}={}) {
  const r=new T.Group(),map=texturaTeja(),L=vuelo+fondo;
  const slab=map?new T.Mesh(new T.BoxGeometry(ancho,.16,L),crearMaterialToon({color:'#ffffff',albedo:map,repetir:[ancho/1.2,L/2],bandas:3})):null;
  const y=.12+L/2*Math.sin(pendiente),z=vuelo-L/2*Math.cos(pendiente);
  if(slab){slab.name='teja';slab.position.set(0,y,z);slab.rotation.x=pendiente;r.add(slab);}else{const s=caja(r,'teja',ancho,.16,L,C.tile,0,y,z);s.rotation.x=pendiente;}
  caja(r,'canal',ancho+.1,.12,.14,C.tileDark,0,.06,vuelo-.05,false);
  const count=Math.round(ancho/1.2);for(let i=0;i<=count;i++)caja(r,'can-'+i,.12,.16,vuelo-.1,C.darkWood,-ancho/2+i*ancho/count,.0,(vuelo-.1)/2,false);
  return r;
}
