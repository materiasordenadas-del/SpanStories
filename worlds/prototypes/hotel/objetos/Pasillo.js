import * as T from '../engine/three.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
import { caja,cilindro,esfera } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Piezas del pasillo de habitaciones (doble crujía, 5★). Pivot abajo-centro, frente +z.

// Moqueta de pared a pared: campo verde petróleo y, al centro, un camino con celosía de
// rombos y flores de latón (el lienzo cubre `ancho` m de lado a lado y 2 m a lo largo).
export function crearAlfombraPasillo({ancho=2.6,largo=30,camino=1.35}={}){
  const W=512,H=512,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.fillStyle='#2c5557';g.fillRect(0,0,W,H);
  for(let i=0;i<1800;i++){g.fillStyle=i%2?'#315c5e':'#284e50';g.fillRect((i*73)%W,(i*151)%H,2,2);}
  const a=W*(.5-camino/ancho/2),b=W*(.5+camino/ancho/2);
  g.fillStyle='#3d6f6b';g.fillRect(a,0,b-a,H);
  g.strokeStyle='#c9a35d';g.lineWidth=3;
  for(const k of [-1,1]){const x=k<0?a:b;g.beginPath();g.moveTo(x+k*-7,0);g.lineTo(x+k*-7,H);g.stroke();g.fillStyle='#b78f4e';g.fillRect(x+(k<0?0:-4),0,4,H);}
  const cx=(a+b)/2,hw=(b-a)/2-16,paso=H/4;
  g.save();g.beginPath();g.rect(a+12,0,b-a-24,H);g.clip();g.lineWidth=2.5;g.strokeStyle='#c9a35d';
  for(let k=-1;k<=4;k++){const y=k*paso;g.beginPath();g.moveTo(cx,y);g.lineTo(cx+hw,y+paso/2);g.lineTo(cx,y+paso);g.lineTo(cx-hw,y+paso/2);g.closePath();g.stroke();
    g.fillStyle='#e0c07c';for(const [x,yy] of [[cx,y+paso/2],[cx+hw,y],[cx-hw,y]]){for(let p=0;p<4;p++){g.beginPath();g.ellipse(x+Math.cos(p*Math.PI/2)*7,yy+Math.sin(p*Math.PI/2)*7,6,3,p*Math.PI/2,0,Math.PI*2);g.fill();}}}
  g.restore();
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;
  const m=crearMaterialToon({albedo:t,repetir:[1,largo/2],bandas:2});m.userData.albedo=true;
  const r=new T.Group(),mesh=new T.Mesh(new T.PlaneGeometry(ancho,largo),m);mesh.rotation.x=-Math.PI/2;mesh.position.y=.005;mesh.name='moqueta';r.add(mesh);
  return r;
}

// Puerta doble de madera con mirillas de vidrio y placas de latón (galería → pasillo).
export function crearPuertaDoble({ancho=1.9,alto=2.6}={}){
  const r=new T.Group(),hoja=ancho/2-.05,hojas=[];
  for(const s of [-1,1]){const bisagra=new T.Group();bisagra.position.x=s*ancho/2;r.add(bisagra);hojas.push(bisagra);
    const x=-s*hoja/2;caja(bisagra,'hoja-'+s,hoja,alto-.05,.07,C.darkWood,x,(alto-.05)/2);
    caja(bisagra,'mirilla-'+s,.22,1.1,.08,C.blue,x-s*.12,1.55,0,false);caja(bisagra,'placa-'+s,.12,.4,.09,C.gold,x-s*(hoja/2-.15),1.1,0,false);}
  for(const s of [-1,1])caja(r,'jamba-'+s,.1,alto+.1,.18,C.wood,s*(ancho/2+.05),(alto+.1)/2);
  caja(r,'dintel',ancho+.3,.12,.18,C.wood,0,alto+.06);
  r.userData.abierta=false;r.userData.anchoPaso=ancho;
  r.userData.animar=dt=>{for(const [i,h] of hojas.entries()){const s=i?1:-1;h.rotation.y=T.MathUtils.damp(h.rotation.y,r.userData.abierta?s*Math.PI*.46:0,7,dt);}};
  return r;
}

// Carrito de camarera: estantes con toallas, bolsa de lencería y cubo de amenities.
export function crearCarritoLimpieza(){
  const r=new T.Group();
  for(const y of [.18,.62,1.06])caja(r,'estante-'+y,1.15,.04,.48,'#e2dccd',0,y);
  for(const x of [-.56,.56])for(const z of [-.22,.22])cilindro(r,'poste-'+x+z,.018,1.08,C.gold,x,.6,z);
  for(const x of [-.56,.56])cilindro(r,'rueda-'+x,.06,.04,C.ink,x,.06,0);
  for(let i=0;i<4;i++)for(const y of [.2,.64])caja(r,'toalla-'+i+y,.24,.16,.36,i%2?C.ivory:C.cloth,-.4+i*.27,y+.1);
  caja(r,'bolsa',.5,.55,.08,'#5c7d74',.3,.62,-.27);
  caja(r,'cubo',.32,.2,.26,C.teal,-.3,1.18);esfera(r,'jabon',.04,C.peach,-.3,1.31,0);
  return r;
}

// Consola de pasillo con lámpara y florero (bajo la ventana del fondo).
export function crearConsola({ancho=1.4,fondo=.38,alto=.8}={}){
  const r=new T.Group();
  caja(r,'tapa',ancho,.05,fondo,C.darkWood,0,alto-.025);
  for(const x of [-1,1])caja(r,'pata-'+x,.06,alto-.05,fondo-.06,C.gold,x*(ancho/2-.06),(alto-.05)/2);
  caja(r,'travesaño',ancho-.12,.04,.04,C.gold,0,.18,0,false);
  return r;
}

// Línea de luz de la cornisa del techo (emisiva, sin luces three.js sueltas).
export function crearLineaLuz({largo=10,ancho=.06}={}){
  const r=new T.Group(),m=new T.Mesh(new T.BoxGeometry(ancho,.02,largo),new T.MeshBasicMaterial({color:'#fff0cc'}));m.name='luz';r.add(m);return r;
}
