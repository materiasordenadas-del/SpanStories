import * as T from '../engine/three.js';
import { caja,cilindro,esfera,pieza } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Piezas del buffet. Referencia: buffets de hotel de lujo moderno: islas de bordes redondeados con la base de
// listones de madera, nichos iluminados con vajilla, tapa de piedra clara y, encima, un dosel de luz translúcido con
// bandas de madera y lámparas colgantes. Cada fábrica devuelve UNA unidad (pivot abajo-centro, y = 0 en su base).
// Lo que brilla (nichos, dosel, resistencias) es MeshBasicMaterial: ilustración emisiva sin relighting, como las
// bolas de la araña.

const CREMA='#fff0cf',HIELO='#dff0f4',CHOCOLATE='#4a2d22',ROJO='#c2414b',ASADO='#a0603c',LONCHA='#d49a78',CALOR='#ffb35a';
const brillo=(root,name,geometry,pos,color=CREMA)=>{const m=new T.Mesh(geometry,new T.MeshBasicMaterial({color}));m.name=name;m.position.set(...pos);root.add(m);return m;};

// Contorno de rectángulo con esquinas redondeadas (r = mitad del lado menor da una pastilla; r = lado/2 en un cuadrado, un círculo).
// Coordenadas (x, z): el eje y del Shape es z del mundo.
export function formaRedondeada(w,d,r){
  const x=w/2,y=d/2;r=Math.min(r,x,y);const s=new T.Shape();s.moveTo(-x+r,-y);
  s.absarc(x-r,-y+r,r,-Math.PI/2,0,false);s.absarc(x-r,y-r,r,0,Math.PI/2,false);
  s.absarc(-x+r,y-r,r,Math.PI/2,Math.PI,false);s.absarc(-x+r,-y+r,r,Math.PI,Math.PI*1.5,false);
  return s;
}
// Losa de esa forma, de y = 0 a y = h.
export const losa=(w,d,r,h)=>{const g=new T.ExtrudeGeometry(formaRedondeada(w,d,r),{depth:h,bevelEnabled:false,curveSegments:10});g.rotateX(Math.PI/2);g.translate(0,h,0);return g;};
// Puntos equiespaciados del contorno con su normal exterior (nx, nz).
export function perimetro(w,d,r,paso){
  const s=formaRedondeada(w,d,r),n=Math.max(8,Math.round(s.getLength()/paso)),out=[];
  for(let i=0;i<n;i++){const u=i/n,p=s.getPointAt(u),a=s.getPointAt((u+.002)%1),b=s.getPointAt((u-.002+1)%1),tx=a.x-b.x,ty=a.y-b.y,l=Math.hypot(tx,ty)||1;out.push({x:p.x,z:p.y,nx:ty/l,nz:-tx/l});}
  return out;
}
const girar=(mesh,p)=>{mesh.rotation.y=Math.atan2(p.nx,p.nz);return mesh;};

function pila(root,x,y,z,{n=6,radio=.09}={}){
  cilindro(root,'platos',radio,n*.015,C.ivory,x,y+n*.0075,z);cilindro(root,'filete-platos',radio*1.02,.012,C.gold,x,y+n*.015-.006,z);
}

/** Isla o línea de buffet: base de listones, nichos con vajilla, tapa de piedra. `lados:'frente'` = nichos solo hacia +z (contra pared). */
export function crearIslaBuffet({largo=5.6,fondo=2.2,alto=.92,radio=.6,nichos=2,lados='ambos'}={}){
  const r=new T.Group(),cara=.1,S=largo-2*radio,wN=Math.min(1.3,S/Math.max(nichos,1)-.5),yTop=alto-.06;
  const centros=Array.from({length:nichos},(_,i)=>S*((i+.5)/nichos-.5)),signos=lados==='frente'?[1]:[1,-1];
  pieza(r,'zócalo',losa(largo,fondo,radio,.07),C.gold,[0,0,0],false);
  pieza(r,'cuerpo',losa(largo-2*cara,fondo-2*cara,Math.max(radio-cara,.05),alto-.12),C.darkWood,[0,.07,0],false);
  pieza(r,'tapa',losa(largo+.12,fondo+.12,radio+.06,.06),C.ivory,[0,yTop,0]);
  pieza(r,'filete',losa(largo+.14,fondo+.14,radio+.07,.025),C.gold,[0,yTop-.03,0],false);
  const enNicho=p=>signos.some(s=>p.nz*s>.7&&centros.some(c=>Math.abs(p.x-c)<wN/2+.05));
  for(const p of perimetro(largo-2*cara+.1,fondo-2*cara+.1,Math.max(radio-cara+.05,.05),.11)){
    if(enNicho(p))continue;
    girar(caja(r,'listón',.07,yTop-.07,.1,C.wood,p.x,.07+(yTop-.07)/2,p.z,false),p);
  }
  for(const s of signos)for(const c of centros){
    const zc=s*(fondo/2-cara);
    caja(r,'zócalo-nicho',wN+.08,.15,cara,C.darkWood,c,.145,zc+s*cara/2,false);
    caja(r,'dintel-nicho',wN+.08,yTop-.7,cara,C.darkWood,c,.7+(yTop-.7)/2,zc+s*cara/2,false);
    caja(r,'estante-nicho',wN,.03,cara,C.stone,c,.205,zc+s*cara/2,false);
    brillo(r,'luz-nicho',new T.BoxGeometry(wN,.48,.01),[c,.46,zc+s*.006]);
    for(const dx of [-1,1])caja(r,'jamba-nicho',.04,.52,.03,C.gold,c+dx*(wN/2+.02),.46,zc+s*.015,false);
    for(const dx of [-.3,.3])pila(r,c+dx,.22,zc+s*(cara*.55),{n:6});
  }
  r.userData.medidas={largo,fondo,alto};return r;
}

/** Bandeja de calor (chafing) con tapa abierta: comida del color pedido. */
export function crearChafing({largo=.9,fondo=.5,comida=C.gold}={}){
  const r=new T.Group();caja(r,'soporte',largo,.1,fondo,C.gold,0,.05);caja(r,'cubeta',largo-.06,.07,fondo-.06,C.ivory,0,.135);
  caja(r,'comida',largo-.14,.035,fondo-.14,comida,0,.17,0,false);
  for(let i=0;i<5;i++)esfera(r,'racion-'+i,.055,comida,-largo*.3+i*largo*.15,.2,(i%2?.07:-.07));
  const tapa=new T.Group();tapa.position.set(0,.18,-fondo/2+.02);tapa.rotation.x=-1;caja(tapa,'tapa',largo-.04,.03,fondo-.04,C.gold,0,0,(fondo-.04)/2);esfera(tapa,'pomo',.025,C.ink,0,.03,fondo*.9);r.add(tapa);
  return r;
}

/** Cuenco de servicio con fruta, ensalada u otra cosa: monte de esferas de los colores dados. */
export function crearCuenco({radio=.22,colores=[C.peach,C.gold,ROJO,C.leaf],altura=.14}={}){
  const r=new T.Group();cilindro(r,'pie',radio*.45,.03,C.gold);
  pieza(r,'cuenco',new T.CylinderGeometry(radio,radio*.68,altura,16),C.ivory,[0,.03+altura/2,0]);cilindro(r,'aro',radio*1.03,.014,C.gold,0,.03+altura);
  const y0=.03+altura+.015;
  for(let i=0;i<6;i++){const a=i*Math.PI/3;esfera(r,'fruto-'+i,radio*.3,colores[i%colores.length],Math.cos(a)*radio*.55,y0+.02,Math.sin(a)*radio*.55);}
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.5;esfera(r,'fruto-a-'+i,radio*.28,colores[(i+1)%colores.length],Math.cos(a)*radio*.25,y0+radio*.32,Math.sin(a)*radio*.25);}
  return r;
}

/** Torre de postres de tres niveles con cupcakes. */
export function crearTorrePostres(){
  const r=new T.Group();cilindro(r,'base',.17,.03,C.gold);cilindro(r,'eje',.018,.74,C.gold,0,.37);
  const colores=[C.peach,C.ivory,CHOCOLATE];
  for(const [i,[rad,y,n]] of [[.34,.14,9],[.25,.38,6],[.16,.6,4]].entries()){
    cilindro(r,'plato-'+i,rad,.025,C.ivory,0,y);cilindro(r,'filete-'+i,rad*1.02,.012,C.gold,0,y-.012);
    for(let k=0;k<n;k++){const a=k*Math.PI*2/n,x=Math.cos(a)*rad*.68,z=Math.sin(a)*rad*.68;cilindro(r,'molde-'+i+'-'+k,.032,.035,C.gold,x,y+.03,z);esfera(r,'crema-'+i+'-'+k,.04,colores[(k+i)%3],x,y+.07,z);}
  }
  esfera(r,'fresa',.04,ROJO,0,.8,0);return r;
}

/** Campana de cristal con tarta sobre plato. */
export function crearCloche(){
  const r=new T.Group();cilindro(r,'plato',.26,.02,C.ivory);cilindro(r,'tarta',.15,.11,C.peach,0,.075);cilindro(r,'crema',.15,.025,C.ivory,0,.14);esfera(r,'cereza',.026,ROJO,0,.17,0);
  pieza(r,'campana',new T.SphereGeometry(.23,14,8,0,Math.PI*2,0,Math.PI/2),C.blue,[0,.02,0]);esfera(r,'asa',.022,C.gold,0,.255,0);return r;
}

/** Pila de platos para empezar la línea (como en la entrada de cada estación). */
export function crearPilaPlatos({n=10}={}){const r=new T.Group();pila(r,0,0,0,{n,radio:.13});return r;}

/** Cesta de pan con panes de cinco tonos. */
export function crearCestaPan(){
  const r=new T.Group();pieza(r,'cesta',new T.CylinderGeometry(.26,.2,.12,16),C.sand,[0,.06,0]);cilindro(r,'aro',.265,.016,C.wood,0,.12);
  for(const [i,[x,z,c]] of [[-.1,-.06,C.peach],[.1,-.05,'#c99a5b'],[0,.1,C.peach],[-.12,.08,'#c99a5b'],[.12,.09,C.sand]].entries()){const p=esfera(r,'pan-'+i,.085,c,x,.16,z);p.scale.set(1.35,.8,.9);p.rotation.y=i;}
  return r;
}

/** Tres jarras de jugo con grifo sobre bandeja de madera. */
export function crearJarrasJugo(){
  const r=new T.Group();caja(r,'bandeja',.95,.03,.32,C.wood,0,.015);
  for(const [i,[x,c]] of [[-.3,C.peach],[0,ROJO],[.3,C.leaf]].entries()){
    cilindro(r,'jugo-'+i,.095,.34,c,x,.2);cilindro(r,'tapa-'+i,.1,.03,C.ivory,x,.385);esfera(r,'asa-'+i,.02,C.gold,x,.42,0);caja(r,'grifo-'+i,.03,.03,.07,C.gold,x,.08,.12,false);
  }
  return r;
}

/** Escultura de hielo facetada sobre peana de piedra (centro de la isla fría). */
export function crearEsculturaHielo(){
  const r=new T.Group();caja(r,'peana',.7,.07,.5,C.stone);
  pieza(r,'hielo-central',new T.ConeGeometry(.2,.9,6),HIELO,[0,.07+.45,0]);
  for(const x of [-1,1]){const p=pieza(r,'hielo-lateral-'+x,new T.ConeGeometry(.12,.55,6),HIELO,[x*.2,.07+.27,0]);p.rotation.z=-x*.28;}
  return r;
}

/** Tabla de carvery con un asado entero y lonchas cortadas. */
export function crearAsado(){
  const r=new T.Group();caja(r,'tabla',.64,.04,.4,C.wood);const a=esfera(r,'asado',.14,ASADO,-.08,.15,0);a.scale.set(1.6,.85,1);
  for(let i=0;i<4;i++){const l=caja(r,'loncha-'+i,.035,.11,.2,LONCHA,.12+i*.045,.1,0,false);l.rotation.z=-.15;}
  cilindro(r,'hueso',.012,.1,C.ivory,-.3,.12,0).rotation.z=Math.PI/2;return r;
}

/** Barra de lámparas de calor sobre dos pies de latón. */
export function crearLamparaCalor({largo=1.2,alto=.62}={}){
  const r=new T.Group();for(const x of [-1,1])cilindro(r,'pie-'+x,.014,alto,C.gold,x*largo/2,alto/2);
  cilindro(r,'barra',.025,largo,C.gold,0,alto).rotation.z=Math.PI/2;
  for(const x of [-largo*.26,largo*.26]){caja(r,'pantalla-'+x,.34,.05,.16,C.gold,x,alto-.04);brillo(r,'resistencia-'+x,new T.BoxGeometry(.3,.012,.11),[x,alto-.071,0],CALOR);}
  return r;
}

/** Fuente de chocolate de tres niveles. */
export function crearFuenteChocolate(){
  const r=new T.Group();cilindro(r,'bandeja',.34,.04,C.gold);cilindro(r,'eje',.025,.82,C.gold,0,.41);
  for(const [i,[rad,y]] of [[.26,.22],[.19,.42],[.12,.62]].entries()){cilindro(r,'nivel-'+i,rad,.05,CHOCOLATE,0,y);cilindro(r,'borde-'+i,rad*1.03,.012,C.gold,0,y-.03);}
  esfera(r,'gota',.05,CHOCOLATE,0,.86,0);return r;
}

/** Dosel de luz suspendido: paneles translúcidos con bandas y montantes de madera, sofito escalonado y lámparas colgantes.
 *  y = 0 es su borde inferior; los tirantes suben `techo` metros. Colócalo con `fijo` (su caja incluye lámparas y tirantes). */
export function crearDosel({largo=6,fondo=2.6,alto=.75,radio=.8,techo=1.45,colgantes=true}={}){
  const r=new T.Group();brillo(r,'paneles-luz',losa(largo-.05,fondo-.05,Math.max(radio-.03,.05),alto-.12),[0,.06,0]);
  for(const y of [0,alto/2-.03,alto-.06])pieza(r,'banda',losa(largo,fondo,radio,.06),C.wood,[0,y,0]);
  for(const p of perimetro(largo,fondo,radio,1.2))girar(caja(r,'montante',.06,alto-.1,.07,C.wood,p.x,alto/2,p.z,false),p);
  pieza(r,'sofito',losa(largo-.6,fondo-.6,Math.max(radio-.3,.1),.08),C.darkWood,[0,-.08,0],false);
  if(colgantes)for(const p of perimetro(largo-1,fondo-1,Math.max(radio-.5,.1),1.1)){
    cilindro(r,'cable',.008,.35,C.gold,p.x,-.08-.175,p.z);cilindro(r,'pantalla',.075,.3,C.ink,p.x,-.08-.35-.15,p.z);
    brillo(r,'luz-colgante',new T.CylinderGeometry(.062,.062,.01,10),[p.x,-.08-.35-.3-.006,p.z]);
  }
  for(const sx of [-1,1])for(const sz of [-1,1])cilindro(r,'tirante',.014,techo,C.gold,sx*(largo/2-radio*.6),alto+techo/2,sz*(fondo/2-radio*.6));
  return r;
}
