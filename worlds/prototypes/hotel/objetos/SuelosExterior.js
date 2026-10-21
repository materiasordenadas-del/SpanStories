import * as T from '../engine/three.js';
import { crearMaterialToon,normalDesdeAltura } from '../engine/Luz25D.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// Suelos del patio de llegada. Albedo neutro (sin luz pintada) + normal desde un mapa de
// alturas propio: juntas hondas, piezas planas (ESTILO.md §3). Cada lienzo representa un
// trozo de suelo de `metros` × `metros`; las UV de las superficies van en metros.
const cache=new Map();
function azar(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const mezcla=(a,b,t)=>{const A=new T.Color(a),B=new T.Color(b);return '#'+A.lerp(B,t).getHexString();};

// draw(ctx, px, rnd, alto): alto=true dibuja el mapa de alturas (claro = sobresale).
function textura(tipo,metros,px,draw,{fuerza=1.6,suavizado=.8}={}){
  if(cache.has(tipo))return cache.get(tipo);
  const lienzo=alto=>{const c=document.createElement('canvas');c.width=c.height=px;draw(c.getContext('2d'),px,azar(tipo.length*977+13),alto);return c;};
  const albedo=new T.CanvasTexture(lienzo(false));albedo.colorSpace=T.SRGBColorSpace;albedo.wrapS=albedo.wrapT=T.RepeatWrapping;albedo.anisotropy=8;
  const normal=normalDesdeAltura(lienzo(true),{fuerza,suavizado,repetir:true});
  const t={albedo,normal,metros};cache.set(tipo,t);return t;
}

// Adoquín de granito en espiga a 90° (piezas 20 × 10 cm): la calzada del patio.
function adoquin(ctx,px,rnd,alto){
  const u=px/32;ctx.fillStyle=alto?'#000':'#6f675d';ctx.fillRect(0,0,px,px);
  const tonos=['#a39a8c','#9a9184','#aba294','#958b7e','#a8a092','#b2a99b'];
  const ladrillo=(x,y,w,h)=>{for(const ox of [-px,0,px])for(const oy of [-px,0,px]){
    ctx.fillStyle=alto?'#fff':tonos[Math.floor(rnd()*tonos.length)];ctx.fillRect(x*u+ox+1.2,y*u+oy+1.2,w*u-2.4,h*u-2.4);}};
  // Tira en escalera: horizontal (k,k)+(k+1,k) y vertical (k,k+1)+(k,k+2); las tiras se repiten cada 4 en x.
  for(let m=-8;m<16;m++)for(let k=-4;k<36;k++){const x=k+4*m,y=k;if(x<-2||x>33||y<-2||y>33)continue;
    ladrillo(x,y,2,1);ladrillo(x,y+1,1,2);}
}
// Losa de piedra caliza 120 × 60 cm a junta trabada: aceras y acera de llegada.
function losa(ctx,px,rnd,alto){
  const m=px/2.4;ctx.fillStyle=alto?'#000':'#b9ad97';ctx.fillRect(0,0,px,px);
  for(let fila=0;fila<4;fila++)for(let i=-1;i<3;i++){const x=i*1.2*m+(fila%2)*.6*m,y=fila*.6*m;
    if(alto){ctx.fillStyle='#fff';ctx.fillRect(x+2,y+2,1.2*m-4,.6*m-4);continue;}
    ctx.fillStyle=mezcla('#e9dfca','#dcd0b8',rnd());ctx.fillRect(x+2,y+2,1.2*m-4,.6*m-4);
    for(let k=0;k<26;k++){ctx.fillStyle=rnd()<.5?'rgba(170,152,122,.22)':'rgba(255,250,236,.3)';ctx.fillRect(x+4+rnd()*(1.2*m-10),y+4+rnd()*(.6*m-10),2+rnd()*3,1.5+rnd()*2);}}
}
// Césped con franjas de corte (detalle del jardín, no luz): bandas de 1,2 m.
function cesped(ctx,px,rnd,alto){
  ctx.fillStyle=alto?'#808080':'#76985f';ctx.fillRect(0,0,px,px);
  if(!alto){ctx.fillStyle='#82a46a';ctx.fillRect(0,0,px/2,px);}
  for(let i=0;i<5200;i++){const x=rnd()*px,y=rnd()*px,l=3+rnd()*5;
    ctx.strokeStyle=alto?(rnd()<.5?'#a0a0a0':'#5a5a5a'):['#6c8d56','#8bad73','#7a9c63','#93b47a'][i%4];ctx.lineWidth=1.3;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rnd()-.5)*2,y-l);ctx.stroke();}
}
function asfalto(ctx,px,rnd,alto){
  ctx.fillStyle=alto?'#808080':'#5c6164';ctx.fillRect(0,0,px,px);
  for(let i=0;i<9000;i++){const v=rnd();ctx.fillStyle=alto?(v<.5?'#b0b0b0':'#505050'):v<.4?'#6b7073':v<.75?'#53585b':'#777b7c';ctx.fillRect(rnd()*px,rnd()*px,1.6,1.6);}
}
function granito(ctx,px,rnd,alto){
  ctx.fillStyle=alto?'#000':'#4d4944';ctx.fillRect(0,0,px,px);const m=px/1.2;
  for(let i=0;i<2;i++){ctx.fillStyle=alto?'#fff':mezcla('#77716a','#6a655f',rnd());ctx.fillRect(i*.6*m+1.5,1.5,.6*m-3,px-3);}
  if(!alto)for(let i=0;i<2600;i++){ctx.fillStyle=['#8a847c','#5f5a54','#9a948b'][i%3];ctx.fillRect(rnd()*px,rnd()*px,1.4,1.4);}
}
const TIPOS={adoquin:[3.2,1024,adoquin,{fuerza:1.4}],losa:[2.4,1024,losa,{fuerza:1.5}],cesped:[2.4,512,cesped,{fuerza:.9,suavizado:.5}],
  asfalto:[4,512,asfalto,{fuerza:.6,suavizado:.4}],granito:[1.2,256,granito,{fuerza:1.2}]};
const materiales=new Map();
export function materialSuelo(tipo){
  if(materiales.has(tipo))return materiales.get(tipo);
  const [metros,px,draw,opts]=TIPOS[tipo],t=textura(tipo,metros,px,draw,opts);
  const m=crearMaterialToon({albedo:t.albedo,normal:t.normal,fuerzaNormal:.55,bandas:2});
  m.userData.albedo=true;m.userData.metros=metros;m.polygonOffset=true;m.polygonOffsetFactor=-1;materiales.set(tipo,m);return m;
}

// Polígono [x, z] del suelo a la altura y, con UV en metros del mundo (sin costuras entre piezas).
export function geometriaPoligono(puntos,metros,y=0,huecos=[]){
  const shape=new T.Shape(puntos.map(([x,z])=>new T.Vector2(x,-z)));
  for(const h of huecos)shape.holes.push(new T.Path(h.map(([x,z])=>new T.Vector2(x,-z))));
  const g=new T.ShapeGeometry(shape,4);g.rotateX(-Math.PI/2);g.translate(0,y,0);
  const p=g.getAttribute('position'),uv=g.getAttribute('uv');
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/metros,-p.getZ(i)/metros);
  return g;
}
export const rectangulo=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
export const circulo=(cx,cz,r,n=48)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return [cx+r*Math.cos(a),cz+r*Math.sin(a)];});
// Una superficie = una malla (varios polígonos del mismo suelo se fusionan en una llamada).
export function crearSuperficie(tipo,poligonos,y=0){
  const m=materialSuelo(tipo),geos=poligonos.map(p=>Array.isArray(p[0][0])?geometriaPoligono(p[0],m.userData.metros,y,p.slice(1)):geometriaPoligono(p,m.userData.metros,y));
  const mesh=new T.Mesh(geos.length>1?mergeGeometries(geos,false):geos[0],m);mesh.name='suelo-'+tipo;return mesh;
}
// Rampa continua: misma textura/UV que el adoquín, desde la acera al asfalto.
export function geometriaRampaAcceso({x,ancho,z0,z1,y0,y1},metros=3.2){
  const g=geometriaPoligono(rectangulo(x-ancho/2,z0,x+ancho/2,z1),metros),p=g.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setY(i,y0+(y1-y0)*(p.getZ(i)-z0)/(z1-z0));
  p.needsUpdate=true;g.computeVertexNormals();return g;
}
export function crearRampaAcceso(config){
  const m=materialSuelo('adoquin'),root=new T.Group(),top=new T.Mesh(geometriaRampaAcceso(config,m.userData.metros),m);
  top.name='rampa';root.add(top);
  // Caras de piedra de los laterales: cierran el espesor de la acera al descender.
  const {x,ancho,z0,z1,y0,y1}=config,verts=[];
  for(const s of [-1,1]){const edge=x+s*ancho/2,a=[edge,y0,z0],b=[edge,0,z1],c=[edge,y1,z1];verts.push(...a,...(s<0?b:c),...(s<0?c:b));}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('uv',new T.Float32BufferAttribute(verts.flatMap((_,i)=>i%3===0?[verts[i]/m.userData.metros,-verts[i+2]/m.userData.metros]:[]),2));g.computeVertexNormals();
  const sides=new T.Mesh(g,materialSuelo('losa'));sides.name='laterales-acera';root.add(sides);return root;
}
// Franja entre dos polilíneas paralelas (a = lado exterior, b = interior), mismos índices.
export const franja=(a,b)=>[...a,...[...b].reverse()];
