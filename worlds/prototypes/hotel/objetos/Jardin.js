import * as T from '../engine/three.js';
import { crearMaterialToon,crearMaterialContorno,contornoDe,normalDesdeAltura } from '../engine/Luz25D.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { volumenRedondeado } from './Formas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Vegetación del patio de llegada (al aire libre). Pivot abajo-centro. Las frondas son láminas
// con recorte alfa y el trazo cartoon dibujado en el albedo (ESTILO.md §2–3).
function azar(seed){return()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};}
let fronda,hoja;
function texturaFronda(){
  if(fronda)return fronda;
  const W=256,H=1024,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  // v = 0 en la base del raquis, v = 1 en la punta (el lienzo se dibuja de abajo arriba).
  const n=34,verdes=['#4f8c48','#5b9a50','#467f42','#62a356'];
  for(let i=0;i<n;i++){const t=(i+.5)/n,y=H*(1-t),largo=W*.5*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.08)),.7)*(.85+.15*Math.sin(i*1.7));
    for(const lado of [-1,1]){const x0=W/2,ang=lado*(1.05-.35*t),ex=x0+Math.sin(ang)*largo,ey=y-Math.cos(ang)*largo*.55;
      g.fillStyle=verdes[(i+(lado>0?1:0))%4];g.strokeStyle='#2f5a2c';g.lineWidth=2.4;
      g.beginPath();g.moveTo(x0,y+6);g.quadraticCurveTo((x0+ex)/2+lado*6,(y+ey)/2+14,ex,ey);g.quadraticCurveTo((x0+ex)/2,(y+ey)/2-4,x0,y-7);g.closePath();g.fill();g.stroke();}}
  g.strokeStyle='#8c9a4c';g.lineWidth=7;g.beginPath();g.moveTo(W/2,H);g.lineTo(W/2,10);g.stroke();
  fronda=new T.CanvasTexture(c);fronda.colorSpace=T.SRGBColorSpace;fronda.anisotropy=4;return fronda;
}
// Hoja de boj para setos: manchas de hojas sobre verde, relieve desde la propia altura.
function texturaHoja(){
  if(hoja)return hoja;const px=256,rnd=azar(91),lienzo=alto=>{const c=document.createElement('canvas');c.width=c.height=px;const g=c.getContext('2d');
    g.fillStyle=alto?'#303030':'#4f7d45';g.fillRect(0,0,px,px);
    for(let i=0;i<900;i++){const x=rnd()*px,y=rnd()*px,r=3+rnd()*5,a=rnd()*Math.PI;g.fillStyle=alto?`rgb(${120+rnd()*135|0},0,0)`:['#5d8f4f','#4a7740','#6c9c58','#557f48','#78a862'][i%5];
      for(const ox of [-px,0,px])for(const oy of [-px,0,px]){g.beginPath();g.ellipse(x+ox,y+oy,r,r*.55,a,0,Math.PI*2);g.fill();}}return c;};
  const albedo=new T.CanvasTexture(lienzo(false));albedo.colorSpace=T.SRGBColorSpace;albedo.wrapS=albedo.wrapT=T.RepeatWrapping;
  hoja={albedo,normal:normalDesdeAltura(lienzo(true),{fuerza:2.2,suavizado:.6,repetir:true})};return hoja;
}
// UV en metros según la cara dominante: la textura no se estira en setos largos.
function uvMetros(g,metros=.9){
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    const [u,v]=ny>nx&&ny>nz?[p.getX(i),p.getZ(i)]:nx>nz?[p.getZ(i),p.getY(i)]:[p.getX(i),p.getY(i)];uv[i*2]=u/metros;uv[i*2+1]=v/metros;}
  g.setAttribute('uv',new T.BufferAttribute(uv,2));return g;
}

// Palmera de jardín plantada en el suelo: tronco anillado que se curva, frondas pinnadas y cocos.
export function crearPalmaJardin({alto=7,inclinacion=.12,giro=0,frondas=13,semilla=1}={}){
  const r=new T.Group(),rnd=azar(semilla*7919+3),tramos=14,radio=t=>.2-.08*t+.06*Math.exp(-t*14);
  const eje=t=>new T.Vector3(Math.sin(giro)*inclinacion*alto*t*t,alto*t,Math.cos(giro)*inclinacion*alto*t*t);
  const tronco=[],anillos=[];
  for(let i=0;i<tramos;i++){const a=eje(i/tramos),b=eje((i+1)/tramos),dir=b.clone().sub(a),l=dir.length();
    const g=new T.CylinderGeometry(radio((i+1)/tramos),radio(i/tramos),l,10,1);g.translate(0,l/2,0);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()));g.translate(a.x,a.y,a.z);tronco.push(g);
    const ring=new T.CylinderGeometry(radio(i/tramos)+.022,radio(i/tramos)+.028,.06,10,1);ring.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir));ring.translate(a.x,a.y+.04,a.z);anillos.push(ring);}
  const matTronco=crearMaterialToon({color:'#a27a55',bandas:3}),tr=new T.Mesh(mergeGeometries(tronco),matTronco);tr.name='tronco';r.add(tr);contornoDe(tr,crearMaterialContorno('#a27a55','fino'));
  const an=new T.Mesh(mergeGeometries(anillos),crearMaterialToon({color:'#7d5b3f',bandas:3}));an.name='anillos';r.add(an);
  const copa=eje(1),matFronda=crearMaterialToon({albedo:texturaFronda(),corteAlfa:.5,doble:true,bandas:2});matFronda.userData.albedo=true;
  const geos=[];
  for(let i=0;i<frondas;i++){
    const ang=i*2.39996+rnd()*.3,arriba=i<4,L=(arriba?2.3:2.9)+rnd()*.5,elev=arriba?.55+rnd()*.25:.15+rnd()*.25,caida=arriba?.45:.95,ancho=1.25,K=12,pos=[],uv=[],idx=[];
    const d=new T.Vector3(Math.sin(ang),0,Math.cos(ang)),lat=new T.Vector3(Math.cos(ang),0,-Math.sin(ang));
    for(let k=0;k<=K;k++){const t=k/K,s=L*t,c=copa.clone().addScaledVector(d,s*Math.cos(elev)).add(new T.Vector3(0,s*Math.sin(elev)-caida*L*t*t,0));
      const w=ancho*.5,quilla=.22*w*(1-t*.5);// sección en V: el raquis arriba, los foliolos caen a los lados
      for(const [lado,u] of [[-1,0],[0,.5],[1,1]]){const q=c.clone().addScaledVector(lat,lado*w);if(lado)q.y-=quilla;pos.push(q.x,q.y,q.z);uv.push(u,t);}
      if(k<K){const o=k*3;idx.push(o,o+3,o+1,o+1,o+3,o+4,o+1,o+4,o+2,o+2,o+4,o+5);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();geos.push(g);}
  const copaMesh=new T.Mesh(mergeGeometries(geos),matFronda);copaMesh.name='frondas';r.add(copaMesh);
  for(let i=0;i<4;i++){const a=i*1.7,coco=new T.Mesh(new T.SphereGeometry(.13,10,8),crearMaterialToon({color:i%2?'#7f8a3c':'#8f7a3a',bandas:3}));coco.position.set(copa.x+Math.cos(a)*.17,copa.y-.12-(i%2)*.08,copa.z+Math.sin(a)*.17);coco.name='coco-'+i;r.add(coco);}
  const nudo=new T.Mesh(new T.SphereGeometry(.24,10,8),matTronco);nudo.scale.y=.8;nudo.position.copy(copa);nudo.name='corona';r.add(nudo);
  return r;
}

// Seto de boj recortado (volumen redondeado con hoja en relieve).
export function crearSeto({ancho=3,alto=.8,fondo=.7}={}){
  const r=new T.Group(),t=texturaHoja(),g=uvMetros(volumenRedondeado(ancho,alto,fondo,.12));g.translate(0,alto/2,0);
  const m=crearMaterialToon({albedo:t.albedo,normal:t.normal,fuerzaNormal:.8,bandas:3});m.userData.albedo=true;
  const mesh=new T.Mesh(g,m);mesh.name='seto';r.add(mesh);contornoDe(mesh,crearMaterialContorno('#4f7d45','fino'));return r;
}

// Macizo de flores tropicales (heliconias, bromelias, ixoras): tierra, follaje y matas de color.
export function crearMacizo({ancho=4,fondo=1.6,semilla=3,colores=['#d3447a','#ef8a3c','#f1c64d']}={}){
  const r=new T.Group(),rnd=azar(semilla*131+7),porColor=new Map();
  const tierra=new T.Mesh(new T.BoxGeometry(ancho,.06,fondo),crearMaterialToon({color:'#6b4f3a',bandas:3}));tierra.position.y=.03;tierra.name='tierra';r.add(tierra);
  const mata=(color,x,z,s,alto)=>{const g=new T.IcosahedronGeometry(s,0);g.scale(1,alto,1);g.translate(x,s*alto*.8,z);if(!porColor.has(color))porColor.set(color,[]);porColor.get(color).push(g);};
  const n=Math.round(ancho*fondo*5);
  for(let i=0;i<n;i++){const x=(rnd()-.5)*(ancho-.3),z=(rnd()-.5)*(fondo-.3);mata(i%3?'#4f8a48':'#3f7340',x,z,.2+rnd()*.12,1.1);}
  for(let i=0;i<n*.8;i++){const x=(rnd()-.5)*(ancho-.35),z=(rnd()-.5)*(fondo-.35);mata(colores[i%colores.length],x,z,.09+rnd()*.05,1.4+rnd()*.8);}
  for(const [color,geos] of porColor){const m=new T.Mesh(mergeGeometries(geos),crearMaterialToon({color,bandas:3}));m.name='flores-'+color;r.add(m);contornoDe(m,crearMaterialContorno(color,'fino'));}
  return r;
}
