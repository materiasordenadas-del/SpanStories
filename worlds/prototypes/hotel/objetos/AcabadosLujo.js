import * as T from '../engine/three.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
import { createGlossyFloor } from '../engine/GlossyFloor.js';
import { caja,cilindro,pieza } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
const textures=new Map();
export function texturaAcabado(tipo='marmol') {
  if(textures.has(tipo))return textures.get(tipo);
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle=tipo==='madera'?'#b58660':'#eee7da';ctx.fillRect(0,0,512,512);
  if(tipo==='madera') {
    for(let row=0;row<8;row++){ctx.fillStyle=['#b98b63','#a87e57','#bf936c'][row%3];ctx.fillRect(0,row*64,512,64);ctx.strokeStyle='#836648';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,row*64);ctx.lineTo(512,row*64);ctx.stroke();
      for(let i=0;i<7;i++){ctx.strokeStyle='#b18a65';ctx.beginPath();for(let x=0;x<=512;x+=12){const y=row*64+7+i*7+Math.sin(x*.018+i)*2;if(!x)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}}
  }else {
    for(let i=0;i<30;i++){ctx.strokeStyle=i%4?'#dcd5c8':'#c6bfad';ctx.lineWidth=i%4?.7:1.2;ctx.beginPath();for(let x=0;x<=512;x+=8){const y=(i*89+x*.53+Math.sin(x*.017+i)*22)%512;if(!x)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
    ctx.strokeStyle='#a5a692';ctx.lineWidth=2;ctx.strokeRect(0,0,512,512);
    ctx.fillStyle='#527162';for(const [x,y] of [[0,0],[512,0],[0,512],[512,512]]){ctx.beginPath();ctx.moveTo(x-17,y);ctx.lineTo(x,y+17);ctx.lineTo(x+17,y);ctx.lineTo(x,y-17);ctx.closePath();ctx.fill();}
  }
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=2;textures.set(tipo,t);return t;
}
export function aplicarPiso(root,{ancho,fondo,tipo='marmol',brillante=true}={}) {
  const t=texturaAcabado(tipo).clone();t.repeat.set(ancho/(tipo==='madera'?3.2:1.6),fondo/(tipo==='madera'?3.2:1.6));
  const surface=new T.Mesh(new T.PlaneGeometry(ancho,fondo),crearMaterialToon({color:'#ffffff',albedo:t,bandas:3}));surface.name='acabado-'+tipo;surface.rotation.x=-Math.PI/2;surface.position.y=.001;root.add(surface);
  let mirror=null;
  if(brillante){const resources=[],cleanups=[],scope={own:o=>(resources.push(o),o),defer:fn=>cleanups.push(fn)};mirror=createGlossyFloor(scope,{width:ancho,depth:fondo,strength:.44,falloff:4.5,resolution:.35});mirror.position.y=.004;mirror.name='reflejo-piso';mirror.userData.ignorarSeleccion=true;mirror.raycast=()=>{};root.add(mirror);root.userData.reflejo=mirror;}
  return mirror;
}
export function crearArco({ancho=4,alto=3.9,grosor=.24,fondo=.25,color=C.ivory}={}) {
  const r=new T.Group(),radius=ancho/2,spring=alto-radius;
  for(const x of [-1,1])caja(r,'pilastra-'+x,grosor,spring,fondo,color,x*(radius+grosor/2),spring/2);
  const shape=new T.Shape();shape.absarc(0,spring,radius+grosor,0,Math.PI,false);shape.lineTo(-radius,spring);shape.absarc(0,spring,radius,Math.PI,0,true);shape.closePath();
  const arch=pieza(r,'arco',new T.ExtrudeGeometry(shape,{depth:fondo,bevelEnabled:false,curveSegments:24}),color,[0,0,-fondo/2],false);
  for(const x of [-1,1]){caja(r,'base-'+x,grosor+.13,.14,fondo+.1,C.gold,x*(radius+grosor/2),.07);caja(r,'capitel-'+x,grosor+.13,.13,fondo+.1,C.gold,x*(radius+grosor/2),spring);}
  return r;
}
export function crearLustre({radio=1,alto=1.1}={}) {
  const r=new T.Group();cilindro(r,'cable',.016,alto,C.gold,0,alto/2);
  for(const [level,radius] of [[0,radio],[.35,radio*.66]]){const ring=pieza(r,'aro-'+level,new T.TorusGeometry(radius,.035,6,40),C.gold,[0,level,0]);ring.rotation.x=Math.PI/2;
    for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
      cilindro(r,'varilla-'+level+'-'+i,.012,.2,C.gold,x,level-.1,z);
      const globe=new T.Mesh(new T.SphereGeometry(.105,10,8),new T.MeshBasicMaterial({color:'#fff3cf'}));globe.name='globo-'+level+'-'+i;globe.position.set(x,level-.24,z);r.add(globe);}}
  cilindro(r,'rosetón',.13,.045,C.gold,0,alto);return r;
}
export function crearArte({ancho=1.5,alto=1.6,tema=0}={}) {
  const r=new T.Group();caja(r,'marco',ancho+.1,alto+.1,.08,C.gold,0,alto/2);
  if(typeof document==='undefined')return r;
  const c=document.createElement('canvas');c.width=384;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle=['#e3c7a3','#e6ddd0','#bed0c0'][tema%3];ctx.fillRect(0,0,384,512);
  ctx.fillStyle='#dc9e71';ctx.beginPath();ctx.arc(280,120,64,0,Math.PI*2);ctx.fill();
  for(let i=0;i<7;i++){const x=50+i*44,y=300+Math.sin(i*1.9)*80;ctx.strokeStyle='#526b52';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,480);ctx.quadraticCurveTo(x-30,270,x+40,y-120);ctx.stroke();for(let k=0;k<5;k++){ctx.fillStyle=k%2?'#356650':'#638867';ctx.beginPath();ctx.ellipse(x+(k%2?25:-18),y+k*27,32,12,(k%2?-.8:.8),0,Math.PI*2);ctx.fill();}}
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const art=new T.Mesh(new T.PlaneGeometry(ancho,alto),new T.MeshBasicMaterial({map}));art.name='ilustración-botánica';art.position.set(0,alto/2,.047);r.add(art);return r;
}
export function crearMedallon({radio=1.6}={}) {
  const r=new T.Group();const disc=pieza(r,'mosaico',new T.CylinderGeometry(radio,radio,.025,64),C.green,[0,.0125,0],false);
  for(const radius of [radio-.06,radio-.18,radio*.58]){const ring=pieza(r,'incrustación-'+radius,new T.TorusGeometry(radius,.025,4,64),C.gold,[0,.03,0],false);ring.rotation.x=Math.PI/2;}
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const petal=pieza(r,'pétalo-'+i,new T.BoxGeometry(.08,.012,radio*.7),C.ivory,[Math.sin(a)*radio*.45,.028,Math.cos(a)*radio*.45],false);petal.rotation.y=a;}
  return r;
}
export function crearBiombo({ancho=2.5,alto=2.7}={}) {
  const r=new T.Group();for(const x of [-1,1])caja(r,'marco-'+x,.09,alto,.12,C.wood,x*ancho/2,alto/2);
  for(const y of [0,alto])caja(r,'travesaño-'+y,ancho,.09,.12,C.wood,0,y);
  for(let i=1;i<18;i++)caja(r,'listón-'+i,.035,alto,.065,C.gold,-ancho/2+i*ancho/18,alto/2);
  for(const y of [.65,1.3,1.95])caja(r,'celosía-'+y,ancho,.035,.065,C.wood,0,y);return r;
}
