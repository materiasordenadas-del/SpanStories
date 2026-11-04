// Banco visual del kit de Blender: ensambla un vano por categoría (17) con la misma lógica que usará el generador.
// Solo los rótulos y carteles usan lienzos de prueba; los interiores son geometría del kit con color de vértice.
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {cargarKit,ensamblar,construirApertura,variedadKit} from '../src/estudio/render/commerce-blender-kit.js';
import {SHOP_CATEGORIES} from '../src/estudio/data/shop-categories.js';

const view=document.querySelector('#view'),renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));view.append(renderer.domElement);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#aebfcf');const camera=new T.PerspectiveCamera(36,1,.1,300);
const controls=new OrbitControls(camera,renderer.domElement);
scene.add(new T.HemisphereLight('#fff6e6','#8a8f94',1.0));const sun=new T.DirectionalLight('#fff0d6',1.9);sun.position.set(8,14,14);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-45,right:45,top:14,bottom:-4,far:80});scene.add(sun);

const lienzo=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;};
const MAPAS=new Map();
const celdaRotulo=(cat)=>{const k='r:'+cat.id;if(!MAPAS.has(k))MAPAS.set(k,lienzo(512,78,(g,w,h)=>{g.fillStyle=cat.paper;g.fillRect(0,0,w,h);g.strokeStyle=cat.frame;g.lineWidth=3;g.strokeRect(7,6,w-14,h-12);g.fillStyle=cat.frame;g.textAlign='center';let s=40;g.font=`600 ${s}px Georgia`;while(g.measureText(cat.label).width>w-40&&s>16)g.font=`600 ${--s}px Georgia`;g.fillText(cat.label,w/2,h*.66);}));return MAPAS.get(k);};
const celdaFija=(k,w,h,f)=>{if(!MAPAS.has(k))MAPAS.set(k,lienzo(w,h,f));return MAPAS.get(k);};
const IDENT=[[0,0],[1,0],[1,1],[0,1]];
const resolverPara=cat=>(slot)=>{
  if(slot==='rotulo.celda')return {esquinas:IDENT,mapa:celdaRotulo(cat)};
  if(slot==='rotulo.estado')return {esquinas:IDENT,mapa:celdaFija('estado',150,60,(g,w,h)=>{g.fillStyle='#3f6b50';g.fillRect(0,0,w,h);g.fillStyle='#fff7e4';g.font='600 24px system-ui';g.textAlign='center';g.fillText('ABIERTO',w/2,h*.65);})};
  if(slot==='rotulo.lema')return {esquinas:IDENT,mapa:celdaFija('lema',360,120,(g,w,h)=>{g.fillStyle='rgba(255,255,255,.92)';g.fillRect(0,0,w,h);g.fillStyle='#8d4d43';g.font='600 40px system-ui';g.textAlign='center';g.fillText('Ofertas',w/2,h*.62);})};
  if(slot==='tira.persiana')return {esquinas:IDENT,mapa:celdaFija('persiana',256,256,(g)=>{g.fillStyle='#8f9597';g.fillRect(0,0,256,256);for(let y=0;y<256;y+=8){g.fillStyle='#b4babc';g.fillRect(0,y,256,3);g.fillStyle='#5d666b';g.fillRect(0,y+6,256,2);}})};
  return null;
};

const kit=await cargarKit();
const STEP=5.0,ESTADO={cerrado:false,interior:'volumen',semilla:'banco'},wallMat=new T.MeshStandardMaterial({color:'#e8d7b0',roughness:.95});
const ground=new T.Mesh(new T.PlaneGeometry(200,30),new T.MeshStandardMaterial({color:'#bdb6a6',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.001,8);ground.receiveShadow=true;scene.add(ground);
const CATS=SHOP_CATEGORIES;let raiz,actual=0;
const vanos=CATS.map((c,i)=>({w:3.2+(i%4)*.25,h:3.0+(i%3)*.12,depth:1.3+(i%3)*.15,category:c.id,region:i%2?'latam':'espana',estado:'abierto'}));
const caja=(g,x0,y0,z0,x1,y1,z1)=>{const m=new T.Mesh(new T.BoxGeometry(x1-x0,y1-y0,z1-z0),wallMat);m.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);m.castShadow=m.receiveShadow=true;g.add(m);};
function construir(){
  if(raiz)scene.remove(raiz);raiz=new T.Group();scene.add(raiz);const n=vanos.length,x0=-(n-1)*STEP/2,resumen=[];
  vanos.forEach((v,i)=>{const cat=CATS[i],e=ensamblar(kit.catalogo,{...v,seed:ESTADO.semilla+':'+cat.id,interior:ESTADO.interior,estado:ESTADO.cerrado?'cerrado':'abierto'}),
      g=construirApertura(kit,e,{resolverSlot:resolverPara(cat),cerrado:ESTADO.cerrado,tintes:{1:cat.frame,2:'#e3d0a4'}});
    g.position.set(x0+i*STEP,0,0);raiz.add(g);const W=STEP,wh=7.2;
    caja(raiz,x0+i*STEP-W/2,0,-.45,x0+i*STEP-v.w/2,wh,0);caja(raiz,x0+i*STEP+v.w/2,0,-.45,x0+i*STEP+W/2,wh,0);caja(raiz,x0+i*STEP-v.w/2,v.h,-.45,x0+i*STEP+v.w/2,wh,0);
    const luz=new T.PointLight('#ffe2b0',ESTADO.cerrado?0:5,7,1.6);luz.position.set(x0+i*STEP,v.h-.35,-.25-e.interior.profundidad*.45);raiz.add(luz);
    resumen.push({categoria:cat.id,kit:e.kit,receta:e.interior.receta,piel:e.interior.piel,piezas:e.colocaciones.length,triangulos:e.triangulos,omitidos:e.omitidos});});
  window.__resumen=resumen;mostrar();
}
function mostrar(){const r=window.__resumen?.[actual];document.querySelector('#stats').textContent=r?`${actual+1}/${vanos.length} · ${CATS[actual].label} · kit ${r.kit} · ${r.piezas} piezas · ${r.triangulos} tri${r.omitidos.length?' · '+r.omitidos.join('; '):''}`:'';}
function ir(i,modo='frente'){actual=(i+vanos.length)%vanos.length;const x=-(vanos.length-1)*STEP/2+actual*STEP,v=vanos[actual];
  const vistas={frente:[x,1.7,5.6,x,1.5,-.8],oblicua:[x+2.6,1.8,4.8,x-.2,1.4,-.9],izq:[x-3.4,1.7,3.2,x,1.5,-1.0],der:[x+3.4,1.7,3.2,x,1.5,-1.0],calle:[x+9,2.0,10,x,1.8,0]};
  const [cx,cy,cz,tx,ty,tz]=vistas[modo]??vistas.frente;const k=Math.max(1,1.05/camera.aspect);camera.position.set(tx+(cx-tx)*k,cy+(v.h-3)*.3,tz+(cz-tz)*k);controls.target.set(tx,ty,tz);controls.update();mostrar();}
construir();ir(0);
const redim=()=>{const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};addEventListener('resize',redim);redim();
const $=id=>document.querySelector('#'+id);
$('prev').onclick=()=>ir(actual-1);$('next').onclick=()=>ir(actual+1);$('oblicua').onclick=()=>ir(actual,'oblicua');$('frente').onclick=()=>ir(actual,'frente');$('calle').onclick=()=>ir(actual,'calle');
$('closed').onclick=()=>{ESTADO.cerrado=!ESTADO.cerrado;construir();ir(actual);};
$('plano').onclick=()=>{ESTADO.interior=ESTADO.interior==='volumen'?'plano':'volumen';construir();ir(actual);};
$('semilla').onclick=()=>{ESTADO.semilla='s'+Math.floor(Math.random()*1e6);construir();ir(actual);};
addEventListener('keydown',e=>{if(e.key==='ArrowRight')ir(actual+1);if(e.key==='ArrowLeft')ir(actual-1);});
window.__kit={ir,construir,ESTADO,variedad:()=>variedadKit(kit.catalogo,Array.from({length:400},(_,i)=>({w:2.6+(i%9)*.2,h:2.9+(i%4)*.15,depth:1.0+(i%7)*.1,seed:'s'+i,category:CATS[i%CATS.length].id,region:['espana','latam'][i%2],estado:'abierto'})))};
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
