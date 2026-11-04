import * as T from '../engine/three.js';
import { crearMaterialToon,crearMaterialContorno,contornoDe } from '../engine/Luz25D.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { caja,cilindro,esfera,pieza } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Piezas del patio de llegada. Pivot abajo-centro y frente hacia +z (la calle).
const AGUA='#8fc9d0',AGUA_CLARA='#c9e9ea';
let ondas;
function texturaOndas(){
  if(ondas)return ondas;const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.fillStyle='#7fbcc6';g.fillRect(0,0,512,512);
  for(let r=20;r<256;r+=17){g.strokeStyle=r%2?'#a6d6db':'#93cad1';g.lineWidth=r%3?3:5;g.beginPath();g.arc(256,256,r+Math.sin(r)*3,0,Math.PI*2);g.stroke();}
  g.fillStyle='rgba(235,250,250,.75)';for(let i=0;i<70;i++){const a=i*2.4,d=60+(i*37)%180;g.fillRect(256+Math.cos(a)*d,256+Math.sin(a)*d,8+i%5*3,2.5);}
  ondas=new T.CanvasTexture(c);ondas.colorSpace=T.SRGBColorSpace;return ondas;
}
const torno=(perfil,seg=40)=>new T.LatheGeometry(perfil.map(([x,y])=>new T.Vector2(x,y)),seg);

// Fuente monumental de la isla: vaso bajo de piedra, dos tazas de bronce, láminas de agua que
// caen de cada taza y surtidores en arco hacia el centro.
export function crearFuenteMonumental({radio=3.6,chorros=10}={}){
  const r=new T.Group(),R=radio;
  pieza(r,'vaso',torno([[R-.42,.05],[R-.42,.5],[R-.5,.56],[R+.06,.6],[R+.1,.52],[R,.46],[R,0],[R-.42,0]]),C.stone);
  pieza(r,'remate-vaso',torno([[R-.48,.6],[R+.08,.6],[R+.08,.64],[R-.48,.64]]),C.ivory,[0,0,0],false);
  const agua=new T.Mesh(new T.CircleGeometry(R-.4,48),crearMaterialToon({albedo:texturaOndas(),bandas:2}));agua.material.userData.albedo=true;
  agua.rotation.x=-Math.PI/2;agua.position.y=.42;agua.name='agua';r.add(agua);
  pieza(r,'zocalo-central',torno([[0,0],[1,0],[1,.55],[.8,.62],[0,.62]]),C.stone);
  pieza(r,'fuste',torno([[0,.6],[.42,.6],[.3,.9],[.2,1.5],[.34,1.68],[0,1.68]],24),C.ivory);
  pieza(r,'taza-mayor',torno([[0,1.62],[.3,1.62],[1.25,1.82],[1.6,2.02],[1.62,2.1],[1.5,2.1],[1.2,1.95],[0,1.92]]),C.gold);
  pieza(r,'fuste-superior',torno([[0,2],[.18,2],[.12,2.5],[.2,2.62],[0,2.62]],20),C.ivory);
  pieza(r,'taza-menor',torno([[0,2.58],[.18,2.58],[.62,2.72],[.78,2.86],[.7,2.88],[0,2.8]]),C.gold);
  pieza(r,'remate',torno([[0,2.82],[.12,2.84],[.16,2.98],[.07,3.22],[0,3.3]],16),C.gold);
  esfera(r,'perla',.08,C.ivory,0,3.33,0);
  // Láminas de agua: cilindros abiertos y translúcidos desde el borde de cada taza.
  const lamina=(nombre,radioArriba,radioAbajo,y0,y1)=>{const m=crearMaterialToon({color:AGUA_CLARA,opacidad:.62,transparente:true,doble:true,bandas:2});
    const g=new T.CylinderGeometry(radioArriba,radioAbajo,y1-y0,40,1,true);const mesh=new T.Mesh(g,m);mesh.position.y=(y0+y1)/2;mesh.name=nombre;mesh.renderOrder=2;r.add(mesh);};
  lamina('lamina-mayor',1.61,1.72,.44,2.06);lamina('lamina-menor',.78,.84,1.95,2.86);
  // Surtidores perimetrales: arcos desde el borde del vaso hacia la taza mayor.
  const geos=[];for(let i=0;i<chorros;i++){const a=i/chorros*Math.PI*2,d=new T.Vector3(Math.cos(a),0,Math.sin(a));
    const curva=new T.QuadraticBezierCurve3(d.clone().multiplyScalar(R-.5).setY(.5),d.clone().multiplyScalar(R-1.5).setY(1.75),d.clone().multiplyScalar(R-2.35).setY(.44));
    geos.push(new T.TubeGeometry(curva,14,.035,5,false));}
  const arcos=new T.Mesh(mergeGeometries(geos),crearMaterialToon({color:AGUA_CLARA,opacidad:.8,transparente:true,bandas:2}));arcos.name='surtidores';arcos.renderOrder=3;r.add(arcos);
  for(let i=0;i<chorros;i++){const a=i/chorros*Math.PI*2;cilindro(r,'boquilla-'+i,.06,.1,C.gold,Math.cos(a)*(R-.5),.44,Math.sin(a)*(R-.5));}
  return r;
}

// Pilares de piedra para los accesos vehiculares del cerramiento.
export function crearPorticoVehicular({luz=7.4,libre=4.6,viga=1.05,pilar=.9}={}){
  const r=new T.Group(),H=libre+viga;
  for(const s of [-1,1]){const x=s*(luz/2+pilar/2);
    caja(r,'pilar-'+s,pilar,H+.35,pilar,C.stone,x,(H+.35)/2);caja(r,'zocalo-'+s,pilar+.1,.4,pilar+.1,C.darkWood,x,.2,0,false);
    caja(r,'capitel-'+s,pilar+.14,.16,pilar+.14,C.gold,x,H+.43);
    for(const y of [1.2,2.4,3.6])caja(r,'llaga-'+s+'-'+y,pilar+.02,.03,pilar+.02,'#d8cbb0',x,y,0,false);
    cilindro(r,'farol-'+s,.16,.4,C.ivory,x,H+.71);cilindro(r,'sombrero-'+s,.24,.08,C.darkWood,x,H+.95);}
  return r;
}

// Farola del patio: poste de bronce oscuro, farol con vidrio cálido y remate de latón.
export function crearFarola({alto=4.4}={}){
  const r=new T.Group();
  pieza(r,'base',torno([[0,0],[.22,0],[.22,.3],[.12,.45],[0,.45]],16),C.darkWood);
  cilindro(r,'poste',.065,alto-.9,C.darkWood,0,(alto-.9)/2+.4);
  cilindro(r,'collar',.1,.08,C.gold,0,alto-.5);
  const vidrio=new T.Mesh(new T.CylinderGeometry(.2,.15,.5,6),new T.MeshBasicMaterial({color:'#fff0c8'}));vidrio.position.y=alto-.22;vidrio.name='luz';r.add(vidrio);
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;caja(r,'montante-'+i,.025,.52,.025,C.darkWood,Math.cos(a)*.19,alto-.22,Math.sin(a)*.19,false);}
  pieza(r,'sombrero',new T.ConeGeometry(.3,.26,6),C.darkWood,[0,alto+.15,0]);esfera(r,'remate',.05,C.gold,0,alto+.31,0);
  return r;
}

// Monolito de piedra junto al paso peatonal, con farol y placa de latón para el nombre.
export function crearMonolito({ancho=1.5,alto=2.2,fondo=.7}={}){
  const r=new T.Group();
  caja(r,'bloque',ancho,alto,fondo,C.stone,0,alto/2);caja(r,'zocalo',ancho+.12,.3,fondo+.12,C.darkWood,0,.15,0,false);
  caja(r,'cornisa',ancho+.16,.14,fondo+.16,C.gold,0,alto+.07);
  cilindro(r,'farol',.2,.48,C.ivory,0,alto+.38);cilindro(r,'sombrero',.3,.1,C.darkWood,0,alto+.67);esfera(r,'remate',.06,C.gold,0,alto+.78,0);
  return r;
}

// Bolardo luminoso bajo (borde de la calzada): de día bronce, de noche un aro de luz.
export function crearBolardoLuz(){
  const r=new T.Group();cilindro(r,'cuerpo',.1,.9,C.darkWood,0,.45);
  const luz=new T.Mesh(new T.CylinderGeometry(.102,.102,.08,16),new T.MeshBasicMaterial({color:'#fff0c8'}));luz.position.y=.74;luz.name='luz';r.add(luz);
  cilindro(r,'tapa',.12,.06,C.gold,0,.93);return r;
}

// Marcas viales planas: rectángulos [x, z, largo, ancho, ángulo] y flechas [x, z, rumbo].
// Rumbo = dirección de avance en planta (0 = −z, π/2 = −x, π = +z), como las lee el conductor.
export function crearMarcasViales({rectas=[],flechas=[],color='#efe8d6'}={}){
  const geos=[];
  for(const [x,z,largo,ancho,ang=0] of rectas){const g=new T.PlaneGeometry(largo,ancho);g.rotateX(-Math.PI/2);g.rotateY(ang);g.translate(x,0,z);geos.push(g);}
  const forma=new T.Shape([[0,1.5],[.62,.62],[.2,.62],[.2,-1.3],[-.2,-1.3],[-.2,.62],[-.62,.62]].map(([a,b])=>new T.Vector2(a,b)));
  for(const [x,z,rumbo] of flechas){const g=new T.ShapeGeometry(forma);g.rotateX(-Math.PI/2);g.rotateY(rumbo);g.translate(x,0,z);g.deleteAttribute('uv');geos.push(g);}
  for(const g of geos)if(g.getAttribute('uv'))g.deleteAttribute('uv');
  const m=crearMaterialToon({color,bandas:2});m.polygonOffset=true;m.polygonOffsetFactor=-3;
  const mesh=new T.Mesh(mergeGeometries(geos.map(g=>g.index?g.toNonIndexed():g)),m);mesh.name='marcas';const r=new T.Group();r.add(mesh);return r;
}
// Palabra pintada en el suelo (PARE, DESCENSO…): recorte alfa, legible para quien avanza con `rumbo`.
export function crearPalabraSuelo(texto,{largo=3.2,alto=1.1,rumbo=0,color='#efe8d6'}={}){
  const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*alto/largo);const g=c.getContext('2d');
  g.fillStyle=color;g.font=`bold ${Math.round(c.height*.86)}px "Arial Narrow",Arial,sans-serif`;g.textAlign='center';g.textBaseline='middle';
  g.save();g.translate(c.width/2,c.height/2);g.scale(1,1.25);g.fillText(texto,0,0,c.width*.96);g.restore();
  const t=new T.CanvasTexture(c);const m=crearMaterialToon({albedo:t,corteAlfa:.5,bandas:2});m.userData.albedo=true;m.polygonOffset=true;m.polygonOffsetFactor=-3;
  const mesh=new T.Mesh(new T.PlaneGeometry(largo,alto),m);mesh.rotation.order='YXZ';mesh.rotation.set(-Math.PI/2,rumbo,0);mesh.name='palabra-'+texto;
  const r=new T.Group();r.add(mesh);return r;
}
// Tramo de cerramiento bajo: muro de piedra con albardilla y pilares con remate de latón.
export function crearCerramiento({largo,alto=.6,grosor=.5,pilar=.62,altoPilar=1.35,cada=6.5}={}){
  const r=new T.Group();
  caja(r,'muro',largo,alto,grosor,C.stone,0,alto/2,0,false);caja(r,'albardilla',largo+.04,.08,grosor+.1,'#d9ccb2',0,alto+.04,0,false);
  caja(r,'zocalo',largo,.16,grosor+.04,C.darkWood,0,.08,0,false);
  const n=Math.max(1,Math.round(largo/cada));
  for(let i=0;i<=n;i++){const x=-largo/2+i*largo/n;caja(r,'pilar-'+i,pilar,altoPilar,pilar,C.stone,x,altoPilar/2);caja(r,'remate-'+i,pilar+.1,.1,pilar+.1,C.gold,x,altoPilar+.05,0,false);}
  return r;
}
// Bordillo/banda a lo largo de una polilínea [x, z]: una sola malla de cajas fusionadas.
export function crearCinta(puntos,{ancho=.3,alto=.2,color=C.stone,y=0,contorno=false}={}){
  const geos=[];
  for(let i=1;i<puntos.length;i++){const [ax,az]=puntos[i-1],[bx,bz]=puntos[i],l=Math.hypot(bx-ax,bz-az);if(l<1e-4)continue;
    const g=new T.BoxGeometry(l+ancho*.12,alto,ancho);g.rotateY(-Math.atan2(bz-az,bx-ax));g.translate((ax+bx)/2,y+alto/2,(az+bz)/2);g.deleteAttribute('uv');geos.push(g);}
  const r=new T.Group(),mesh=new T.Mesh(mergeGeometries(geos),crearMaterialToon({color,bandas:3}));mesh.name='cinta';r.add(mesh);
  if(contorno)contornoDe(mesh,crearMaterialContorno(color,'fino'));return r;
}
