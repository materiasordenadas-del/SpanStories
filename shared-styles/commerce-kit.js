// Kit modular de escaparates: módulos pintados por categoría (fondo, piezas sueltas, lámparas,
// suelo, techo, laterales y persiana) que el prefab coloca como capas recortadas a distintas
// profundidades. Panadería y ropa siguen con la pintura del ejemplo del usuario.
// Todo es pintura en canvas: ni muebles ni productos 3D, ni marcas ni texto legible.
import {rng,hashString} from '../data/rng.js';

export const PX=300,KIT_SIZE=2048;
// Celdas del atlas 2048² [x,y,w,h]. side está girado: x = altura (suelo→techo), y = profundidad (fondo→vidrio).
export const KIT_TILES={backA:[0,0,1024,880],backB:[1024,0,1024,880],farA:[0,880,512,600],farB:[512,880,512,600],midA:[1024,880,512,300],winA:[1024,1180,512,300],midB:[1536,880,512,300],winB:[1536,1180,512,300],lamps:[0,1480,1024,288],ceil:[1024,1480,512,288],persiana:[1536,1480,512,288],floor:[0,1768,1024,280],side:[1024,1768,512,280]};
// Medidas reales de cada módulo (m) para un vano de referencia de 3,4 × 2,95 m; el prefab usa las mismas proporciones.
export const KIT_SIZES={back:[3.4,2.9],far:[1.25,1.95],mid:[1.45,1.2],win:[1.35,1.15],lamps:[3.4,.66],ceil:[3.4,1.4],floor:[3.4,1.4],side:[2.9,1.4],persiana:[3.4,2.9]};
const INK='#2b2118',LIGHT={warm:'#ffd49a',neutral:'#fff0d6',cool:'#e4f1ff'};

/* ---------- primitivas con el trazo de la referencia ---------- */
function cv([w,h],draw){const c=document.createElement('canvas');c.width=Math.round(w*PX);c.height=Math.round(h*PX);const g=c.getContext('2d');g.lineJoin='round';g.lineCap='round';draw(g,c.width,c.height);return c;}
function rr(g,x,y,w,h,r,fill,sw=3){g.beginPath();g.roundRect(x,y,w,h,Math.max(0,Math.min(r,w/2,h/2)));if(fill){g.fillStyle=fill;g.fill();}if(sw){g.strokeStyle=INK;g.lineWidth=sw;g.stroke();}}
function el(g,x,y,rx,ry,fill,sw=2.5,rot=0){g.beginPath();g.ellipse(x,y,Math.max(.5,rx),Math.max(.5,ry),rot,0,Math.PI*2);if(fill){g.fillStyle=fill;g.fill();}if(sw){g.strokeStyle=INK;g.lineWidth=sw;g.stroke();}}
function ln(g,x1,y1,x2,y2,c=INK,w=3){g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokeStyle=c;g.lineWidth=w;g.stroke();}
function poly(g,pts,fill,sw=2.5){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(sw){g.strokeStyle=INK;g.lineWidth=sw;g.stroke();}}
function shade(hex,k){const n=parseInt(hex.slice(1),16),f=v=>Math.max(0,Math.min(255,Math.round(k<0?v*(1+k):v+(255-v)*k)));return '#'+[n>>16,n>>8&255,n&255].map(f).map(v=>v.toString(16).padStart(2,'0')).join('');}
const pickOf=(r,list)=>list[Math.floor(r()*list.length)%list.length];

/* ---------- productos pintados (base en x,y; s=1 ≈ 12 cm) ---------- */
const POP=['#c4553f','#e0a93a','#4f8a8b','#7c9a4e','#9a6a8f','#d97f5a','#5a6fa0','#e8dcc0'];
function prod(g,kind,x,y,s,r,k=0){g.save();g.translate(x,y);g.scale(s,s);const c=POP[(k+Math.floor(r()*3))%POP.length];
  switch(kind){
    case 'meat':el(g,0,-11,21,11,pickOf(r,['#b8483f','#a33c37','#c96456']));el(g,-4,-12,12,5,'#e7b3a6',0);ln(g,-12,-6,12,-15,'#f0d2c4',2);break;
    case 'cheese':poly(g,[[-20,0],[20,0],[16,-22],[-20,-14]],'#ecc65a');el(g,-6,-8,3,2.5,'#c99a2f',0);el(g,7,-12,2.5,2,'#c99a2f',0);break;
    case 'ham':rr(g,-7,0,14,8,3,'#7a4a32',2);poly(g,[[-14,8],[14,8],[18,48],[0,62],[-18,48]],pickOf(r,['#a24b37','#8f3f2e']));ln(g,0,-20,0,0,INK,2);break;
    case 'sausage':for(let i=0;i<3;i++){rr(g,-14+i*10,0,8,34+i%2*8,4,pickOf(r,['#8e3b2b','#b0573c','#6f3022']),2);}ln(g,-16,0,16,0,INK,2.5);break;
    case 'fruit':{const col=pickOf(r,[['#c8443a','#e46c4f'],['#e5a238','#f2c35d'],['#76a043','#9cc25a'],['#e8c94a','#f3df7c'],['#8a3f6a','#b05a8a']]);for(let n=0;n<5;n++){const X=(n%3-1)*12+(n>2?6:0),Y=-9-(n>2?12:0);el(g,X,Y,9,9,col[n%2],2);el(g,X-3,Y-3,2,2.5,'#fff2d0',0);}break;}
    case 'veg':if(r()<.5){for(let n=0;n<3;n++)el(g,-12+n*12,-10,10,10,pickOf(r,['#6f9a3c','#8fb550','#5a8433']),2);ln(g,-14,-12,-10,-16,'#cfe39a',2);}else{for(let n=0;n<4;n++)poly(g,[[-15+n*9,-24],[-9+n*9,-24],[-12+n*9,2]],'#e07b2c',1.8);}break;
    case 'package':{const w=20+r()*10,h=28+r()*16;rr(g,-w/2,-h,w,h,2,c,2);g.fillStyle='#f4ecd9';g.fillRect(-w/2+3,-h*.62,w-6,h*.26);ln(g,-w/2+5,-h*.5,w/2-6,-h*.5,shade(c,-.35),2);break;}
    case 'can':for(let n=0;n<2;n++){rr(g,-16+n*16,-26,14,26,3,POP[(k+n)%8],2);g.fillStyle='#efe6d1';g.fillRect(-14+n*16,-18,10,7);}break;
    case 'bottle':{const col=pickOf(r,['#3f6a43','#6b2e2e','#b98a3a','#4d7c8a']);g.beginPath();g.moveTo(-8,0);g.lineTo(-8,-26);g.quadraticCurveTo(-8,-32,-3,-35);g.lineTo(-3,-46);g.lineTo(3,-46);g.lineTo(3,-35);g.quadraticCurveTo(8,-32,8,-26);g.lineTo(8,0);g.closePath();g.fillStyle=col;g.fill();g.strokeStyle=INK;g.lineWidth=2;g.stroke();g.fillStyle='#eadfc4';g.fillRect(-7,-20,14,10);ln(g,-5,-30,-5,-40,'rgba(255,255,255,.6)',2);break;}
    case 'jar':rr(g,-11,-26,22,26,6,pickOf(r,['#c97a3a','#a6463c','#d6b04a','#7d9a4a']),2);rr(g,-12,-31,24,6,2,'#6d5a48',2);g.fillStyle='#f3ead6';g.fillRect(-8,-18,16,8);break;
    case 'medbox':{const w=22+r()*10,h=16+r()*12;rr(g,-w/2,-h,w,h,1.5,'#f3f1e8',2);g.fillStyle=pickOf(r,['#4f9a7c','#5f87b0','#c2665a','#9a85b8']);g.fillRect(-w/2+2,-h+3,w-4,5);g.fillStyle='#4f9a7c';g.fillRect(w/2-9,-7,5,4);break;}
    case 'medbottle':rr(g,-8,-24,16,24,4,'#b06a2a',2);rr(g,-7,-30,14,6,2,'#f2f0e8',2);g.fillStyle='#f5efe0';g.fillRect(-6,-17,12,8);break;
    case 'shoe':g.beginPath();g.moveTo(-25,-3);g.bezierCurveTo(-25,-12,-16,-13,-11,-17);g.lineTo(5,-12);g.bezierCurveTo(10,-4,26,-6,29,0);g.lineTo(29,6);g.lineTo(-23,6);g.closePath();g.fillStyle=pickOf(r,['#a16841','#493f39','#e2d6c0','#7a3b35','#4e6a83']);g.fill();g.strokeStyle=INK;g.lineWidth=2;g.stroke();ln(g,-23,3,29,3,'#f0e5cf',2);break;
    case 'boot':poly(g,[[-10,-38],[6,-38],[6,-8],[24,-6],[26,4],[-12,4]],pickOf(r,['#6e4430','#3c3330','#8a5a3a']));ln(g,-12,0,26,0,'#d8c8a8',2);break;
    case 'books':for(let n=0;n<4;n++){const w=30-n*2;rr(g,-w/2+(n%2)*2,-8*(n+1),w,8,1,POP[(k+n*3)%8],2);}break;
    case 'cup':el(g,0,1,22,5,'#efe6d3',2);rr(g,-12,-22,24,22,6,pickOf(r,['#f1ebdd','#c9dbe0','#e8cfc0']),2);g.beginPath();g.ellipse(14,-12,6,7,0,-Math.PI/2,Math.PI/2);g.strokeStyle=INK;g.lineWidth=2;g.stroke();el(g,0,-21,10,2.5,'#6d4630',0);break;
    case 'cake':el(g,0,0,26,6,'#e8e2d4',2);rr(g,-22,-28,44,26,4,pickOf(r,['#f0d9b5','#e9b9c4','#7a4a34','#f3e2a6']),2);ln(g,-22,-16,22,-16,pickOf(r,['#c2575a','#f7f1e3','#5a3324']),3);for(let n=0;n<4;n++)el(g,-15+n*10,-30,3,3,'#c43f45',1.2);break;
    case 'pastry':for(let n=0;n<3;n++)el(g,-14+n*14,-8,9,7,pickOf(r,['#d9a052','#c47f3a','#e8c27a']),2);break;
    case 'plate':el(g,0,-3,26,7,'#f4efe4',2);el(g,0,-6,13,4,pickOf(r,['#c06a3e','#7c9a4e','#d9a648']),1.5);break;
    case 'wine':{const col=pickOf(r,['#2f4a33','#5b2228','#3a2c22']);g.beginPath();g.moveTo(-7,0);g.lineTo(-7,-30);g.quadraticCurveTo(-7,-36,-3,-40);g.lineTo(-3,-52);g.lineTo(3,-52);g.lineTo(3,-40);g.quadraticCurveTo(7,-36,7,-30);g.lineTo(7,0);g.closePath();g.fillStyle=col;g.fill();g.strokeStyle=INK;g.lineWidth=2;g.stroke();g.fillStyle='#efe3c8';g.fillRect(-6,-22,12,10);break;}
    case 'glass':g.beginPath();g.moveTo(-8,-34);g.lineTo(8,-34);g.quadraticCurveTo(8,-18,0,-16);g.quadraticCurveTo(-8,-18,-8,-34);g.fillStyle='rgba(220,236,240,.75)';g.fill();g.strokeStyle=INK;g.lineWidth=1.8;g.stroke();ln(g,0,-16,0,-2,INK,1.8);ln(g,-6,0,6,0,INK,2);break;
    case 'cosmetic':for(let n=0;n<3;n++){const h=22+n%2*12,col=pickOf(r,['#e7b8c0','#f2e3d0','#a9c7c2','#c9a6d2','#e9c873']);rr(g,-17+n*12,-h,10,h,3,col,2);rr(g,-16+n*12,-h-6,8,6,2,'#3c3633',1.5);}break;
    case 'device':{if(r()<.5){rr(g,-13,-40,26,40,4,'#2f3438',2);const gr=g.createLinearGradient(0,-38,0,-2);gr.addColorStop(0,'#7cc6d6');gr.addColorStop(1,'#3e5f8a');g.fillStyle=gr;g.fillRect(-10,-36,20,30);}else{rr(g,-26,-30,52,30,3,'#3a3f44',2);const gr=g.createLinearGradient(-24,-28,24,-2);gr.addColorStop(0,'#86c9cf');gr.addColorStop(1,'#5a6fa0');g.fillStyle=gr;g.fillRect(-22,-26,44,22);poly(g,[[-30,0],[30,0],[26,5],[-26,5]],'#9aa3a8',2);}break;}
    case 'headphones':g.beginPath();g.arc(0,-18,16,Math.PI,0);g.strokeStyle=INK;g.lineWidth=5;g.stroke();rr(g,-21,-20,9,16,4,pickOf(r,['#c4553f','#3a3f44','#4f8a8b']),2);rr(g,12,-20,9,16,4,'#3a3f44',2);break;
    case 'toy':if(r()<.5){el(g,0,-14,14,14,c,2);g.beginPath();g.arc(0,-14,14,-.5,1.2);g.strokeStyle='#fff3d6';g.lineWidth=3;g.stroke();}else{for(let n=0;n<3;n++)rr(g,-16+n*11,-12-(n===1?12:0),11,12,1,POP[(k+n*2)%8],2);}break;
    case 'gift':{const w=22+r()*10,h=18+r()*12;rr(g,-w/2,-h,w,h,1,c,2);g.fillStyle='#f4e7c5';g.fillRect(-2,-h,4,h);g.fillRect(-w/2,-h/2-2,w,4);el(g,-5,-h-3,5,3,'#f4e7c5',1.5);el(g,5,-h-3,5,3,'#f4e7c5',1.5);break;}
    case 'bouquet':for(let n=0;n<5;n++){const X=(n-2)*7,Y=-28-(n%2)*10;ln(g,0,0,X,Y,'#4d7a46',2);el(g,X,Y,6.5,6.5,pickOf(r,['#d8475a','#f0c048','#f4f0e6','#c879b5','#e9874a']),1.6);}poly(g,[[-14,-14],[14,-14],[6,6],[-6,6]],'#e7dcc0',2);break;
    case 'pot':for(let n=0;n<4;n++){const X=(n-1.5)*8;ln(g,0,-16,X,-36-(n%2)*7,'#4d7a46',2);el(g,X,-38-(n%2)*7,6,5,pickOf(r,['#d8475a','#f0c048','#c879b5','#7fb1d8']),1.5);}poly(g,[[-14,-16],[14,-16],[10,0],[-10,0]],pickOf(r,['#b8643f','#d9cdb4','#5d7f8a']),2);break;
    case 'glasses':g.lineWidth=3;g.strokeStyle=pickOf(r,['#4c4743','#a77c45','#707d83','#7a3b35']);for(const X of [-13,13]){g.beginPath();g.roundRect(X-10,-13,20,14,5);g.stroke();}ln(g,-3,-8,3,-8,g.strokeStyle,2.5);break;
    case 'brochure':{const w=20,h=28;rr(g,-w/2,-h,w,h,1,'#f3eee2',2);g.fillStyle=c;g.fillRect(-w/2+2,-h+2,w-4,12);ln(g,-w/2+4,-9,w/2-4,-9,'#b9b1a0',2);ln(g,-w/2+4,-5,w/2-8,-5,'#b9b1a0',2);break;}
    default:{const w=24+r()*8,h=18+r()*10;rr(g,-w/2,-h,w,h,2,pickOf(r,['#c7a274','#b38a5a','#d8c19b']),2);ln(g,-w/2+3,-h+5,w/2-3,-h+5,'#8c6a44',2);}
  }g.restore();}
// Fila de productos a lo largo de un estante; alterna los tipos de la receta.
function row(g,kinds,x0,x1,y,s,r,k=0){s*=1.3;const step=34*s,n=Math.max(1,Math.floor((x1-x0)/step));for(let i=0;i<n;i++)prod(g,kinds[(i+k)%kinds.length],x0+step*(i+.5)+(r()-.5)*4*s,y,s*(.92+r()*.16),r,i+k);}

/* ---------- mobiliario pintado ---------- */
function shelfUnit(g,x,y,w,h,R,r,{rows=4,kinds=R.p,s=1,back=null,frame=R.wood}={}){rr(g,x,y,w,h,2,frame,3);g.fillStyle=back??shade(frame,-.45);g.fillRect(x+9,y+9,w-18,h-18);
  for(let j=0;j<rows;j++){const yy=y+9+(h-18)*(j+1)/rows;row(g,kinds,x+12,x+w-12,yy-5,s,r,j*3);rr(g,x+4,yy-5,w-8,9,1,shade(frame,.12),2);ln(g,x+8,yy-3,x+w-8,yy-3,'rgba(255,240,210,.55)',1.5);}
  g.fillStyle='rgba(20,12,6,.18)';g.fillRect(x+9,y+9,w-18,14);}
function bookcase(g,x,y,w,h,R,r,rows=5){rr(g,x,y,w,h,2,R.wood,3);g.fillStyle=shade(R.wood,-.5);g.fillRect(x+8,y+8,w-16,h-16);
  for(let j=0;j<rows;j++){const top=y+8+(h-16)*j/rows,bot=y+8+(h-16)*(j+1)/rows;let xx=x+10;while(xx<x+w-16){const bw=7+r()*9,bh=(bot-top)*(.62+r()*.3);if(r()<.08){poly(g,[[xx,bot-6],[xx+bh*.35,bot-6-bh],[xx+bh*.35+bw,bot-6-bh],[xx+bw,bot-6]],POP[Math.floor(r()*8)],1.8);xx+=bw+bh*.35+2;continue;}rr(g,xx,bot-6-bh,bw,bh,1,POP[Math.floor(r()*8)],1.8);ln(g,xx+2,bot-6-bh+6,xx+bw-2,bot-6-bh+6,'rgba(250,236,200,.7)',1.5);xx+=bw+.5;}
    rr(g,x+4,bot-6,w-8,8,1,shade(R.wood,.15),2);}}
function drawers(g,x,y,w,h,R,cols=6,rowsN=4){rr(g,x,y,w,h,2,R.wood,3);for(let j=0;j<rowsN;j++)for(let i=0;i<cols;i++){const cw=(w-16)/cols,ch=(h-16)/rowsN,X=x+8+i*cw,Y=y+8+j*ch;rr(g,X+2,Y+2,cw-4,ch-4,2,shade(R.wood,.18),2);rr(g,X+cw/2-8,Y+ch/2-3,16,6,3,'#d9c49a',1.5);}}
function fridge(g,x,y,w,h,R,r,kinds=R.p){rr(g,x,y,w,h,5,'#c9d0cc',3);rr(g,x+6,y+6,w-12,22,3,'#eef6f8',2);const gr=g.createLinearGradient(x,y,x+w,y+h);gr.addColorStop(0,'#5f7f80');gr.addColorStop(.55,'#93b1ad');gr.addColorStop(1,'#4c6a6c');g.fillStyle=gr;g.fillRect(x+10,y+34,w-20,h-46);
  for(let j=0;j<4;j++){const yy=y+34+(h-46)*(j+1)/4;row(g,kinds,x+14,x+w-14,yy-4,.85,r,j);ln(g,x+12,yy-2,x+w-12,yy-2,'#dfe9e6',4);}
  const doors=Math.max(1,Math.round(w/130));for(let d=1;d<doors;d++)ln(g,x+w*d/doors,y+30,x+w*d/doors,y+h-8,'#d4dcd8',5);ln(g,x+18,y+42,x+40,y+h-30,'rgba(255,255,255,.35)',6);}
function counter(g,x,y,w,h,R,{top=R.top??'#d8cbb2',front=R.counterFront??'panels',color=R.counter??R.wood,till=true}={}){rr(g,x,y+14,w,h-14,2,color,3);rr(g,x-6,y,w+12,16,2,top,3);
  if(front==='panels'){const n=Math.max(2,Math.round(w/90));for(let i=0;i<n;i++)rr(g,x+10+i*(w-20)/n,y+30,(w-20)/n-8,h-50,3,shade(color,.12),2);}
  else if(front==='tiles'){g.save();g.beginPath();g.rect(x+3,y+17,w-6,h-20);g.clip();for(let yy=y+17;yy<y+h;yy+=18)for(let xx=x+((yy-y)/18%2?-9:0);xx<x+w;xx+=36)rr(g,xx,yy,36,18,0,shade(color,(xx+yy)%3?.06:-.04),1.2);g.restore();}
  else if(front==='slats'){for(let xx=x+8;xx<x+w-4;xx+=16)ln(g,xx,y+20,xx,y+h-6,shade(color,-.25),3);}
  g.fillStyle='rgba(20,12,6,.25)';g.fillRect(x+3,y+h-10,w-6,7);
  if(till){rr(g,x+w-70,y-38,46,32,4,'#3b4a4f',2.5);rr(g,x+w-64,y-34,34,14,2,'#a9c9c2',1.5);rr(g,x+w-76,y-8,58,8,2,'#55625f',2);}}
function vitrine(g,x,y,w,h,R,r,kinds=R.p){rr(g,x,y+h*.52,w,h*.48,2,R.counter??R.wood,3);g.fillStyle='#f0ebe0';g.fillRect(x+8,y+h*.5-6,w-16,8);
  g.beginPath();g.moveTo(x+4,y+h*.52);g.lineTo(x+4,y+30);g.quadraticCurveTo(x+4,y+6,x+30,y+6);g.lineTo(x+w-6,y+6);g.lineTo(x+w-6,y+h*.52);g.closePath();g.fillStyle='rgba(225,240,240,.92)';g.fill();
  row(g,kinds,x+14,x+w-14,y+h*.52-8,1.05,r,1);ln(g,x+10,y+h*.3,x+w-10,y+h*.3,'#9fb3b0',3);row(g,kinds,x+14,x+w-14,y+h*.3-3,.9,r,4);
  g.fillStyle='rgba(205,232,236,.45)';g.beginPath();g.moveTo(x+4,y+h*.52);g.lineTo(x+4,y+30);g.quadraticCurveTo(x+4,y+6,x+30,y+6);g.lineTo(x+w-6,y+6);g.lineTo(x+w-6,y+h*.52);g.closePath();g.fill();g.strokeStyle=INK;g.lineWidth=3;g.stroke();
  ln(g,x+18,y+18,x+60,y+h*.46,'rgba(255,255,255,.85)',4);ln(g,x+34,y+16,x+70,y+h*.32,'rgba(255,255,255,.6)',2);g.fillStyle='rgba(20,12,6,.25)';g.fillRect(x+3,y+h-10,w-6,7);}
function table(g,x,y,w,h,R,r,kinds=R.p,{cloth=false}={}){const top=R.tableTop??shade(R.wood,.2);if(cloth){poly(g,[[x,y],[x+w,y],[x+w+6,y+44],[x-6,y+44]],R.cloth??'#efe6d6');ln(g,x-4,y+40,x+w+4,y+40,shade(R.cloth??'#efe6d6',-.15),2);}else rr(g,x,y,w,16,2,top,3);
  for(const lx of [x+14,x+w-24])rr(g,lx,y+(cloth?44:16),10,h-(cloth?44:16),2,shade(R.wood,-.25),2);row(g,kinds,x+12,x+w-12,y+1,1.05,r,2);}
function gondola(g,x,y,w,h,R,r,kinds=R.p){rr(g,x+w*.12,y,w*.76,34,4,R.accent,3);g.fillStyle='rgba(255,250,235,.85)';g.fillRect(x+w*.22,y+12,w*.56,8);rr(g,x,y+34,w,h-34,3,'#d7d9d2',3);
  for(let j=0;j<4;j++){const yy=y+34+(h-46)*(j+1)/4;row(g,kinds,x+10,x+w-10,yy-4,.95,r,j*2);rr(g,x+4,yy-4,w-8,8,1,'#eef0ea',2);}rr(g,x,y+h-14,w,14,2,'#7d8384',2);}
function steps(g,x,y,w,h,R,r,kinds=R.p,{n=3,color=R.plinth??'#efe6d6'}={}){const sw=w/n;for(let i=0;i<n;i++){const hh=h*(.35+.65*(i===1?1:i===0?.55:.75));rr(g,x+i*sw,y+h-hh,sw-2,hh,2,shade(color,i%2?-.06:.04),3);row(g,kinds,x+i*sw+8,x+(i+1)*sw-8,y+h-hh,1.2,r,i);}}
function crates(g,x,y,w,h,R,r,kinds=R.p,tiers=2){const th=h/tiers;for(let t=0;t<tiers;t++){const yy=y+t*th,inset=(tiers-1-t)*14;const n=Math.max(1,Math.round((w-inset*2)/95));for(let i=0;i<n;i++){const cw=(w-inset*2)/n,X=x+inset+i*cw;row(g,kinds,X+6,X+cw-6,yy+th*.42,1.15,r,i+t*3);poly(g,[[X+3,yy+th*.35],[X+cw-3,yy+th*.35],[X+cw-6,yy+th-4],[X+6,yy+th-4]],R.crate??'#b58a55',2.5);for(let l=1;l<3;l++)ln(g,X+6,yy+th*.35+l*(th*.65-4)/3,X+cw-6,yy+th*.35+l*(th*.65-4)/3,shade(R.crate??'#b58a55',-.3),2);}}}
function rail(g,x,y,w,h,R,r,kinds=['ham','sausage']){ln(g,x,y,x+w,y,'#6b6f70',6);ln(g,x,y-2,x+w,y-2,'#b9bdbd',2);const n=Math.max(2,Math.floor(w/58));for(let i=0;i<n;i++){const X=x+w*(i+.5)/n;prod(g,kinds[i%kinds.length],X,y+4,1.25,r,i);}}
function pegboard(g,x,y,w,h,R,r,kinds=R.p){rr(g,x,y,w,h,2,R.peg??'#c9a978',3);g.fillStyle=shade(R.peg??'#c9a978',-.3);for(let yy=y+14;yy<y+h-6;yy+=16)for(let xx=x+12;xx<x+w-6;xx+=16)g.fillRect(xx,yy,3,3);
  const cols=Math.max(2,Math.floor(w/62)),rws=Math.max(2,Math.floor(h/80));for(let j=0;j<rws;j++)for(let i=0;i<cols;i++){const X=x+w*(i+.5)/cols,Y=y+h*(j+.3)/rws;ln(g,X,Y,X,Y+12,'#5d5f60',2.5);prod(g,kinds[(i+j)%kinds.length],X,Y+48,1.05,r,i+j*2);}}
function board(g,x,y,w,h,R,r){rr(g,x,y,w,h,4,R.wood,4);rr(g,x+8,y+8,w-16,h-16,2,'#2f3a35',2);for(let j=0;j<Math.floor((h-30)/22);j++){const yy=y+24+j*22;ln(g,x+18,yy,x+18+(w-60)*(.45+r()*.4),yy,'rgba(240,236,220,.75)',3);el(g,x+w-28,yy,4,4,'rgba(240,200,120,.8)',0);}}
function poster(g,x,y,w,h,R,r){rr(g,x,y,w,h,2,'#f4efe2',3);const sky=pickOf(r,['#9cc8dc','#f0c48a','#c9b7da']);g.fillStyle=sky;g.fillRect(x+8,y+8,w-16,h*.55);el(g,x+w*.7,y+h*.25,w*.1,w*.1,'#f6e2a0',0);poly(g,[[x+8,y+8+h*.55],[x+w*.35,y+h*.3],[x+w*.6,y+8+h*.55]],shade(sky,-.35),0);g.fillStyle=pickOf(r,['#6f9a6a','#d9b46a','#5a8aa0']);g.fillRect(x+8,y+8+h*.55,w-16,h*.45-16);g.strokeStyle=INK;g.lineWidth=2;g.strokeRect(x+8,y+8,w-16,h-16);}
function mirror(g,x,y,w,h,R){rr(g,x,y,w,h,w/2>40?18:6,R.mirrorFrame??'#c9b58f',4);const gr=g.createLinearGradient(x,y,x+w,y+h);gr.addColorStop(0,'#dfe8e4');gr.addColorStop(.45,'#a9c3c2');gr.addColorStop(.5,'#eef2e8');gr.addColorStop(1,'#a8bfc0');g.fillStyle=gr;g.beginPath();g.roundRect(x+9,y+9,w-18,h-18,w/2>40?12:3);g.fill();ln(g,x+w*.25,y+h*.2,x+w*.55,y+h*.55,'rgba(255,255,255,.65)',4);}
function screen(g,x,y,w,h,r){rr(g,x,y,w,h,4,'#25292c',3);const gr=g.createLinearGradient(x,y,x+w,y+h);gr.addColorStop(0,pickOf(r,['#83c7d3','#e2a46a','#a4d08a']));gr.addColorStop(1,pickOf(r,['#3c5a8a','#7a4c8c','#2f6c6a']));g.fillStyle=gr;g.fillRect(x+7,y+7,w-14,h-14);el(g,x+w*.68,y+h*.38,w*.12,w*.12,'rgba(255,255,255,.35)',0);}
function machine(g,x,y,w,h){rr(g,x,y,w,h,6,'#9aa4a6',3);rr(g,x+8,y+8,w-16,h*.28,3,'#5b6366',2);for(let i=0;i<2;i++){rr(g,x+w*.22+i*w*.36,y+h*.42,w*.16,h*.18,2,'#3c4244',2);rr(g,x+w*.2+i*w*.36,y+h*.8,w*.2,h*.14,3,'#f2ece0',2);}ln(g,x+10,y+h*.12,x+w-12,y+h*.12,'#d9e2e3',2);}
function chair(g,x,y,s,R){g.save();g.translate(x,y);g.scale(s,s);rr(g,-22,-60,6,60,2,R.chair??R.wood,2);rr(g,16,-36,6,36,2,R.chair??R.wood,2);rr(g,-24,-40,46,8,2,shade(R.chair??R.wood,.2),2);rr(g,-24,-100,8,62,2,R.chair??R.wood,2);rr(g,-24,-100,32,8,2,R.chair??R.wood,2);g.restore();}
function stool(g,x,y,s,R){g.save();g.translate(x,y);g.scale(s,s);el(g,0,-74,20,6,R.chair??'#3e3a36',2);ln(g,-12,-70,-18,0,INK,4);ln(g,12,-70,18,0,INK,4);ln(g,-14,-30,14,-30,INK,3);g.restore();}
function bucket(g,x,y,s,R,r,kind='bouquet'){g.save();g.translate(x,y);g.scale(s,s);for(let n=0;n<5;n++){const X=(n-2)*7;ln(g,0,-20,X,-50-(n%2)*12,'#4d7a46',2.5);el(g,X,-52-(n%2)*12,7,7,pickOf(r,['#d8475a','#f0c048','#f4f0e6','#c879b5','#e9874a','#7fb1d8']),1.6);}poly(g,[[-17,-26],[17,-26],[13,0],[-13,0]],'#a8b0b0',2.5);ln(g,-15,-20,15,-20,'#d6dcdc',2);g.restore();}

/* ---------- paredes, suelos, techos y luz ---------- */
function wallBase(g,w,h,R,r){g.fillStyle=R.wall;g.fillRect(0,0,w,h);for(let i=0;i<26;i++){g.fillStyle=`rgba(${r()<.5?'255,250,240':'90,70,50'},${.025+r()*.03})`;el(g,r()*w,r()*h,30+r()*90,20+r()*60,g.fillStyle,0);}
  const dado=R.dado??'none',dy=h-.95*PX;if(dado==='tiles'){g.fillStyle=R.tile??'#f4efe4';g.fillRect(0,dy,w,h-dy);for(let x=0;x<w;x+=42)ln(g,x,dy,x,h,'#cfc6b4',1.5);for(let y=dy;y<h;y+=42)ln(g,0,y,w,y,'#cfc6b4',1.5);ln(g,0,dy,w,dy,'#a89a7e',4);}
  else if(dado==='wood'){g.fillStyle=shade(R.wood,.15);g.fillRect(0,dy,w,h-dy);for(let x=12;x<w;x+=86)rr(g,x,dy+16,72,h-dy-34,3,shade(R.wood,.24),2);ln(g,0,dy,w,dy,INK,4);}
  else if(dado==='paint'){g.fillStyle=shade(R.wall,-.18);g.fillRect(0,dy+.3*PX,w,h-dy-.3*PX);ln(g,0,dy+.3*PX,w,dy+.3*PX,shade(R.wall,-.4),3);}
  g.fillStyle=shade(R.wall,-.5);g.fillRect(0,h-16,w,16);ln(g,0,h-16,w,h-16,INK,2.5);rr(g,-4,0,w+8,18,0,shade(R.wall,-.12),2.5);}
function door(g,x,h,R,kind='door'){const dw=.8*PX,dh=2.05*PX,y=h-16-dh;if(kind==='curtain'){rr(g,x,y,dw,dh,2,shade(R.wall,-.55),3);for(let i=0;i<7;i++)ln(g,x+8+i*dw/7,y+6,x+12+i*dw/7,y+dh-4,pickOf(()=>i/7,[R.accent,shade(R.accent,.3),'#efe6d6']),9);return;}rr(g,x,y,dw,dh,2,R.doorColor??shade(R.wood,-.1),3);rr(g,x+14,y+18,dw-28,dh*.4,2,'#b9cec8',2);rr(g,x+14,y+dh*.52,dw-28,dh*.4,2,shade(R.doorColor??R.wood,.12),2);el(g,x+dw-20,y+dh*.52,5,5,'#d6c08a',1.5);}
// Charcos de luz bajo las lámparas, rincones oscuros y oclusión junto al suelo.
function lightPass(g,w,h,R,{lampsX=[.22,.5,.78],floorAO=true}={}){const L=LIGHT[R.light??'warm'];g.save();g.globalCompositeOperation='screen';for(const f of lampsX){const gr=g.createRadialGradient(f*w,h*.06,10,f*w,h*.18,h*.62);gr.addColorStop(0,L+'aa');gr.addColorStop(.5,L+'33');gr.addColorStop(1,L+'00');g.fillStyle=gr;g.fillRect(0,0,w,h);}
  g.globalCompositeOperation='multiply';const v=g.createRadialGradient(w/2,h*.45,h*.35,w/2,h*.5,w*.75);v.addColorStop(0,'#ffffff');v.addColorStop(1,'#b9ab98');g.fillStyle=v;g.fillRect(0,0,w,h);
  if(floorAO){const a=g.createLinearGradient(0,h-60,0,h);a.addColorStop(0,'#ffffff');a.addColorStop(1,'#a8998a');g.fillStyle=a;g.fillRect(0,h-60,w,60);}
  const top=g.createLinearGradient(0,0,0,h*.12);top.addColorStop(0,'#bfb2a2');top.addColorStop(1,'#ffffff');g.fillStyle=top;g.fillRect(0,0,w,h*.12);g.restore();}
function floorPaint(g,w,h,R,r){const [kind,a,b]=R.floor;g.fillStyle=a;g.fillRect(0,0,w,h);
  if(kind==='checker'){const s=56;for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s)if((x/s+y/s)%2)rr(g,x,y,s,s,0,b,0);}
  else if(kind==='hidraulico'){const s=70;for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){rr(g,x+1,y+1,s-2,s-2,0,a,0);el(g,x+s/2,y+s/2,s*.3,s*.3,b,0);poly(g,[[x+s/2,y+6],[x+s-6,y+s/2],[x+s/2,y+s-6],[x+6,y+s/2]],null,0);g.strokeStyle=shade(b,-.25);g.lineWidth=2;g.stroke();el(g,x+s/2,y+s/2,s*.1,s*.1,R.accent,0);for(const [cx,cy] of [[x,y],[x+s,y],[x+s,y+s],[x,y+s]])el(g,cx,cy,s*.16,s*.16,shade(a,-.2),0);}}
  else if(kind==='terrazo'){for(let i=0;i<1400;i++)el(g,r()*w,r()*h,1+r()*3,1+r()*2.5,pickOf(r,[b,shade(a,-.18),shade(a,.3),'#8a8279']),0,r()*3);for(let x=0;x<w;x+=120)ln(g,x,0,x,h,shade(a,-.12),1.5);for(let y=0;y<h;y+=120)ln(g,0,y,w,y,shade(a,-.12),1.5);}
  else if(kind==='madera'){const s=32;for(let y=0;y<h;y+=s){let x=-(y/s%3)*70;while(x<w){const L=140+r()*120;rr(g,x,y,L,s,0,shade(a,(r()-.5)*.16),0);ln(g,x,y,x,y+s,shade(a,-.3),1.5);x+=L;}ln(g,0,y,w,y,shade(a,-.3),1.5);}}
  else {const s=100;for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){rr(g,x+1,y+1,s-2,s-2,0,shade(a,(r()-.5)*.06),0);}g.strokeStyle=b;g.lineWidth=2;for(let x=0;x<w;x+=s)ln(g,x,0,x,h,b,2);for(let y=0;y<h;y+=s)ln(g,0,y,w,y,b,2);}
  // Arriba = fondo del local: más oscuro; abajo = junto al vidrio.
  g.save();g.globalCompositeOperation='multiply';const d=g.createLinearGradient(0,0,0,h);d.addColorStop(0,'#9d907f');d.addColorStop(.35,'#e9e2d8');d.addColorStop(1,'#ffffff');g.fillStyle=d;g.fillRect(0,0,w,h);for(const x of [0,w]){const s=g.createLinearGradient(x,0,x?x-60:60,0);s.addColorStop(0,'#b3a696');s.addColorStop(1,'#ffffff');g.fillStyle=s;g.fillRect(x?x-60:0,0,60,h);}g.restore();
  g.save();g.globalCompositeOperation='screen';for(const f of [.22,.5,.78]){const gr=g.createRadialGradient(f*w,h*.45,4,f*w,h*.45,h*.55);gr.addColorStop(0,LIGHT[R.light??'warm']+'55');gr.addColorStop(1,LIGHT[R.light??'warm']+'00');g.fillStyle=gr;g.fillRect(0,0,w,h);}g.restore();}
function ceilPaint(g,w,h,R){g.fillStyle=R.ceilColor??'#efe8da';g.fillRect(0,0,w,h);
  if(R.ceil==='beams'){for(let x=w/10;x<w;x+=w/5)rr(g,x-12,-4,24,h+8,0,shade(R.wood,-.15),2);}
  else if(R.ceil==='panels'){for(let x=0;x<w;x+=w/6)ln(g,x,0,x,h,'#c9c2b4',2);for(let y=0;y<h;y+=h/3)ln(g,0,y,w,y,'#c9c2b4',2);for(const f of [.25,.75])rr(g,f*w-40,h*.4,80,26,2,'#fbf8ee',2);}
  else if(R.ceil==='vault'){for(let x=0;x<w;x+=w/7){const gr=g.createLinearGradient(x,0,x+w/7,0);gr.addColorStop(0,shade(R.ceilColor??'#efe8da',-.2));gr.addColorStop(.5,R.ceilColor??'#efe8da');gr.addColorStop(1,shade(R.ceilColor??'#efe8da',-.2));g.fillStyle=gr;g.fillRect(x,0,w/7,h);rr(g,x-5,-2,10,h+4,0,'#8e7a62',1.5);}}
  for(const f of [.22,.5,.78])el(g,f*w,h*.45,7,7,'#5b4f44',1.5);
  g.save();g.globalCompositeOperation='multiply';const d=g.createLinearGradient(0,0,0,h);d.addColorStop(0,'#d9d1c4');d.addColorStop(1,'#8f8475');g.fillStyle=d;g.fillRect(0,0,w,h);g.restore();}
function sidePaint(g,w,h,R,r){g.fillStyle=R.wall;g.fillRect(0,0,w,h);const dado=R.dado??'none',dx=.95*PX*w/(2.9*PX);
  if(dado==='tiles'){g.fillStyle=R.tile??'#f4efe4';g.fillRect(0,0,dx,h);for(let y=0;y<h;y+=24)ln(g,0,y,dx,y,'#cfc6b4',1.2);for(let x=0;x<dx;x+=24)ln(g,x,0,x,h,'#cfc6b4',1.2);ln(g,dx,0,dx,h,'#a89a7e',3);}
  else if(dado==='wood'){g.fillStyle=shade(R.wood,.15);g.fillRect(0,0,dx,h);ln(g,dx,0,dx,h,INK,3);}
  g.fillStyle=shade(R.wall,-.5);g.fillRect(0,0,9,h);
  // Estante corrido desde el fondo hasta media profundidad: el quad real da la perspectiva.
  const end=h*.55;for(const f of [.38,.56,.74]){const x=f*w;rr(g,x-4,0,8,end,1,shade(R.wood,.1),1.8);g.save();g.translate(x+4,0);g.rotate(Math.PI/2);for(let i=0;i<Math.floor(end/30);i++)prod(g,R.p[i%R.p.length],15+i*30,0,.62,r,i);g.restore();}
  g.save();g.globalCompositeOperation='multiply';const d=g.createLinearGradient(0,0,0,h);d.addColorStop(0,'#a59684');d.addColorStop(.6,'#ddd4c6');d.addColorStop(1,'#c9bfb0');g.fillStyle=d;g.fillRect(0,0,w,h);const t=g.createLinearGradient(w,0,w*.8,0);t.addColorStop(0,'#bfb2a2');t.addColorStop(1,'#ffffff');g.fillStyle=t;g.fillRect(w*.8,0,w*.2,h);g.restore();}
function lampsPaint(g,w,h,R){const L=LIGHT[R.light??'warm'],kind=R.lamp??'dome',xs=[.22,.5,.78].map(f=>f*w);
  if(kind==='spots'||kind==='tube'){rr(g,w*.06,4,w*.88,12,3,'#3a3836',2);}
  for(const x of xs){if(kind==='dome'){ln(g,x,0,x,h*.42,INK,3);g.beginPath();g.moveTo(x-48,h*.78);g.quadraticCurveTo(x,h*.2,x+48,h*.78);g.closePath();g.fillStyle=R.lampColor??'#2f5a48';g.fill();g.strokeStyle=INK;g.lineWidth=3;g.stroke();el(g,x,h*.8,30,7,'#fff1c4',2);}
    else if(kind==='globe'){ln(g,x,0,x,h*.4,INK,3);rr(g,x-8,h*.38,16,10,2,'#8a7a5a',2);el(g,x,h*.66,30,30,'#fff4d6',2.5);el(g,x-9,h*.58,8,8,'#ffffff',0);}
    else if(kind==='cone'){ln(g,x,0,x,h*.35,INK,3);poly(g,[[x-10,h*.35],[x+10,h*.35],[x+36,h*.85],[x-36,h*.85]],R.lampColor??'#c45a3a',2.5);el(g,x,h*.86,32,6,'#fff1c4',2);}
    else if(kind==='spots'){for(const dx of [-60,0,60]){ln(g,x+dx,16,x+dx,34,INK,3);rr(g,x+dx-11,30,22,30,5,'#2f2d2b',2.5);el(g,x+dx,62,8,3,'#fff6dc',1.5);}}
    else if(kind==='tube'){ln(g,x-90,16,x-90,h*.5,INK,2);ln(g,x+90,16,x+90,h*.5,INK,2);rr(g,x-110,h*.5,220,22,6,'#e8eef0',2.5);rr(g,x-100,h*.5+6,200,10,4,'#ffffff',0);}}
  void L;}
function persianaPaint(g,w,h){g.fillStyle='#8f9597';g.fillRect(0,0,w,h);for(let y=0;y<h;y+=7){g.fillStyle='#b5babb';g.fillRect(0,y,w,3);g.fillStyle='#636b70';g.fillRect(0,y+5,w,1.5);}rr(g,0,h-14,w,14,0,'#5d6366',2);rr(g,w/2-16,h-26,32,12,2,'#3a3f42',1.5);
  g.save();g.globalCompositeOperation='multiply';const d=g.createLinearGradient(0,0,0,h);d.addColorStop(0,'#c2c2c2');d.addColorStop(1,'#ffffff');g.fillStyle=d;g.fillRect(0,0,w,h);g.restore();}

/* ---------- módulos por tipo (fondo, pieza alta, pieza media, escaparate) ---------- */
const BACK={
  shelfWall(g,w,h,R,r,v){const units=v?[[.15,1.2],[1.45,1.15]]:[[.2,1.05],[1.35,1.05]];for(const [x,ww] of units)shelfUnit(g,x*PX,h-2.62*PX,ww*PX,2.46*PX,R,r,{rows:4});v?door(g,2.75*PX,h,R,R.backDoor??'door'):board(g,2.55*PX,h-2.3*PX,.7*PX,.9*PX,R,r);if(!v)shelfUnit(g,2.5*PX,h-1.25*PX,.8*PX,1.1*PX,R,r,{rows:2});},
  fridgeWall(g,w,h,R,r,v){fridge(g,(v?1.75:.15)*PX,h-2.45*PX,1.45*PX,2.3*PX,R,r,R.pCold??R.p);shelfUnit(g,(v?.15:1.8)*PX,h-2.6*PX,1.4*PX,2.44*PX,R,r,{rows:5,s:.9});},
  barBack(g,w,h,R,r,v){const x0=v?1.2:.1;rr(g,x0*PX,h-1.0*PX,2.1*PX,.86*PX,2,R.counter??R.wood,3);for(const yy of [1.55,1.95,2.35]){rr(g,x0*PX,h-yy*PX,2.1*PX,9,1,shade(R.wood,.1),2);row(g,['bottle','wine','glass'],x0*PX+10,(x0+2.1)*PX-10,h-yy*PX-1,1.05,r,yy*7);}machine(g,(x0+.3)*PX,h-1.55*PX,.75*PX,.52*PX);board(g,(v?.12:2.4)*PX,h-2.5*PX,.85*PX,1.15*PX,R,r);},
  pegWall(g,w,h,R,r,v){pegboard(g,(v?1.35:.15)*PX,h-2.55*PX,1.9*PX,1.5*PX,R,r);shelfUnit(g,(v?.15:2.15)*PX,h-2.55*PX,1.1*PX,2.4*PX,R,r,{rows:5,s:.9});shelfUnit(g,(v?1.35:.15)*PX,h-.95*PX,1.9*PX,.8*PX,R,r,{rows:1});},
  drawerWall(g,w,h,R,r,v){drawers(g,.12*PX,h-1.0*PX,3.16*PX,.84*PX,R,9,3);shelfUnit(g,.12*PX,h-2.65*PX,(v?2.0:1.5)*PX,1.55*PX,R,r,{rows:4,s:.85,back:R.shelfBack});if(v){mirror(g,2.35*PX,h-2.5*PX,.85*PX,1.25*PX,R);}else{shelfUnit(g,1.78*PX,h-2.65*PX,1.5*PX,1.55*PX,R,r,{rows:4,s:.85,back:R.shelfBack});}if(R.cross)drawCross(g,(v?2.78:1.7)*PX,h-2.78*PX);},
  mirrorWall(g,w,h,R,r,v){const xs=v?[.2,1.35]:[.25,1.4,2.55];for(const x of xs){mirror(g,x*PX,h-2.3*PX,.8*PX,1.15*PX,R);rr(g,(x-.08)*PX,h-1.08*PX,.96*PX,14,2,shade(R.wood,.2),2.5);row(g,R.p,(x-.02)*PX,(x+.84)*PX,h-1.08*PX,.9,r,x*5);}if(v)shelfUnit(g,2.45*PX,h-2.6*PX,.85*PX,2.44*PX,R,r,{rows:5,s:.85});},
  bookWall(g,w,h,R,r,v){bookcase(g,.1*PX,h-2.7*PX,(v?3.2:2.1)*PX,2.55*PX,R,r,6);if(v){ln(g,2.2*PX,h-2.6*PX,2.5*PX,h-.18*PX,INK,6);ln(g,2.42*PX,h-2.6*PX,2.72*PX,h-.18*PX,INK,6);for(let i=1;i<8;i++)ln(g,(2.2+.3*i/8)*PX,h-(2.6-2.42*i/8)*PX,(2.42+.3*i/8)*PX,h-(2.6-2.42*i/8)*PX,shade(R.wood,.1),5);}else{poster(g,2.45*PX,h-2.4*PX,.75*PX,1.0*PX,R,r);door(g,2.4*PX,h,R,'curtain');}},
  screenWall(g,w,h,R,r,v){const xs=v?[[.2,1.3],[1.7,1.4]]:[[.2,.9],[1.25,.9],[2.3,.9]];for(const [x,ww] of xs)screen(g,x*PX,h-2.45*PX,ww*PX,.7*PX,r);for(const yy of [1.25,1.6])rr(g,.15*PX,h-yy*PX,3.1*PX,10,1,'#e6e6e2',2);row(g,R.p,.2*PX,3.2*PX,h-1.6*PX-1,1,r,1);row(g,['headphones','device'],.2*PX,3.2*PX,h-1.25*PX-1,1,r,4);shelfUnit(g,.15*PX,h-.95*PX,3.1*PX,.8*PX,R,r,{rows:1,frame:'#d8dad6',back:'#c3c9c9'});},
  bucketWall(g,w,h,R,r,v){for(let t=0;t<3;t++){const y=h-(.55+t*.62)*PX;rr(g,.1*PX,y,3.2*PX,12,2,R.wood,2.5);for(let i=0;i<9;i++)if((i+t+(v?1:0))%4!==3)(t===0?bucket:(g,x,y,s,R,r)=>prod(g,'pot',x,y,s*1.4,r,i))(g,(.3+i*.34)*PX,y,1.1,R,r);}if(v)door(g,2.45*PX,h,R,'curtain');},
  posterWall(g,w,h,R,r,v){const xs=v?[.3,1.3]:[.2,1.1,2.0];for(const x of xs)poster(g,x*PX,h-2.5*PX,.75*PX,1.0*PX,R,r);shelfUnit(g,(v?2.3:.2)*PX,h-(v?2.5:1.25)*PX,(v?.95:2.6)*PX,(v?2.35:1.1)*PX,R,r,{rows:v?6:2,kinds:['brochure'],s:.9});if(!v)rr(g,2.75*PX,h-1.35*PX,.5*PX,.22*PX,4,R.accent,3);},
  crateWall(g,w,h,R,r,v){crates(g,.12*PX,h-1.15*PX,3.16*PX,1.0*PX,R,r,R.p,2);shelfUnit(g,(v?.15:1.85)*PX,h-2.65*PX,1.4*PX,1.4*PX,R,r,{rows:3,kinds:['jar','bottle'],s:.9});v?board(g,2.4*PX,h-2.5*PX,.8*PX,1.0*PX,R,r):board(g,.3*PX,h-2.5*PX,.8*PX,1.0*PX,R,r);},
  hookWall(g,w,h,R,r,v){rail(g,.2*PX,h-2.45*PX,(v?2.0:3.0)*PX,.6*PX,R,r,['ham','sausage']);shelfUnit(g,.15*PX,h-1.6*PX,(v?2.1:1.5)*PX,.95*PX,R,r,{rows:2,kinds:['jar','cheese'],s:.9});v?door(g,2.45*PX,h,R,'curtain'):board(g,2.0*PX,h-1.6*PX,1.1*PX,.85*PX,R,r);},
};
function drawCross(g,x,y){const s=.42*PX;g.fillStyle='#3f9a6a';g.fillRect(x-s*.17,y,s*.34,s);g.fillRect(x-s/2,y+s*.33,s,s*.34);g.strokeStyle=INK;g.lineWidth=3;g.strokeRect(x-s*.17,y,s*.34,s);g.fillStyle='#bfe8c9';g.fillRect(x-s*.1,y+s*.06,s*.2,s*.88);}
// Piezas sueltas: el lienzo es transparente y se recorta con MASK.
const FAR={
  tallShelf:(g,w,h,R,r)=>{shelfUnit(g,6,h*.05,w-12,h*.93,R,r,{rows:5});},
  gondola:(g,w,h,R,r)=>gondola(g,10,h*.32,w-20,h*.66,R,r),
  fridge:(g,w,h,R,r)=>fridge(g,8,h*.04,w-16,h*.94,R,r,R.pCold??R.p),
  tower:(g,w,h,R,r)=>{const x=w*.2,ww=w*.6;rr(g,x,h*.08,ww,h*.9,3,'rgba(214,236,236,.55)',3);for(let j=0;j<5;j++){const yy=h*.08+h*.86*(j+1)/5;rr(g,x+4,yy-4,ww-8,7,1,'#eef4f2',2);row(g,R.p,x+10,x+ww-10,yy-4,1,r,j);}rr(g,x-4,h*.93,ww+8,h*.06,2,R.wood,3);ln(g,x+14,h*.12,x+30,h*.8,'rgba(255,255,255,.75)',4);},
  crateStand:(g,w,h,R,r)=>{crates(g,8,h*.42,w-16,h*.56,R,r,R.p,3);},
  rail:(g,w,h,R,r)=>{ln(g,w*.1,h*.06,w*.1,h,INK,5);ln(g,w*.9,h*.06,w*.9,h,INK,5);rail(g,w*.1,h*.08,w*.8,h*.3,R,r,R.pHang??['ham','sausage']);rr(g,w*.04,h*.97,w*.92,8,2,'#5d5f60',2);},
  bookcase:(g,w,h,R,r)=>bookcase(g,8,h*.06,w-16,h*.92,R,r,5),
  tableChairs:(g,w,h,R,r)=>{chair(g,w*.2,h,1.2,R);table(g,w*.25,h*.6,w*.5,h*.4,R,r,['plate','glass'],{cloth:true});chair(g,w*.86,h,-1.2,R);},
  barStools:(g,w,h,R,r)=>{rr(g,w*.08,h*.5,w*.84,16,2,R.tableTop??shade(R.wood,.2),3);rr(g,w*.46,h*.5+16,w*.08,h*.5-16,2,INK,0);row(g,['cup','cake'],w*.12,w*.88,h*.5+1,1,r,2);stool(g,w*.25,h,1.15,R);stool(g,w*.75,h,1.15,R);},
  barberChair:(g,w,h,R,r)=>{const x=w/2;rr(g,x-60,h*.42,120,h*.08,10,R.chair??'#7a3b35',3);rr(g,x-50,h*.18,100,h*.26,12,R.chair??'#7a3b35',3);rr(g,x-74,h*.48,24,h*.18,6,R.chair??'#7a3b35',3);rr(g,x+50,h*.48,24,h*.18,6,R.chair??'#7a3b35',3);rr(g,x-60,h*.5,120,h*.18,8,shade(R.chair??'#7a3b35',.15),3);rr(g,x-8,h*.68,16,h*.24,2,'#9aa1a3',2);el(g,x,h*.95,60,10,'#7f878a',2.5);},
  bucketLadder:(g,w,h,R,r)=>{ln(g,w*.15,h,w*.4,h*.1,INK,6);ln(g,w*.85,h,w*.6,h*.1,INK,6);for(let t=0;t<3;t++){const y=h*(.42+t*.28),i=t*.08;rr(g,w*(.18+i*.9),y,w*(.64-i*1.8),10,2,R.wood,2.5);for(let k=0;k<3-t%2;k++)bucket(g,w*(.32+k*.18+(t%2)*.09),y,1.05,R,r);}},
  brochureStand:(g,w,h,R,r)=>{const x=w*.25,ww=w*.5;rr(g,x,h*.12,ww,h*.84,3,'#d9dcd6',3);for(let j=0;j<6;j++){const yy=h*.12+h*.82*(j+1)/6;poly(g,[[x+6,yy-4],[x+ww-6,yy-4],[x+ww-10,yy+4],[x+10,yy+4]],'#b8bdb6',2);row(g,['brochure'],x+10,x+ww-10,yy-4,1,r,j);}rr(g,x+ww*.1,h*.02,ww*.8,h*.1,4,R.accent,3);},
  easel:(g,w,h,R,r)=>{ln(g,w*.3,h,w*.5,h*.15,INK,6);ln(g,w*.7,h,w*.5,h*.15,INK,6);board(g,w*.18,h*.2,w*.64,h*.48,R,r);},
};
const MID={
  counter:(g,w,h,R,r)=>counter(g,10,h*.36,w-20,h*.64,R),
  vitrine:(g,w,h,R,r)=>vitrine(g,8,h*.06,w-16,h*.94,R,r),
  table:(g,w,h,R,r)=>table(g,16,h*.5,w-32,h*.5,R,r,R.pTable??R.p),
  bar:(g,w,h,R,r)=>{counter(g,10,h*.4,w-20,h*.6,R,{till:false});machine(g,w*.55,h*.08,w*.3,h*.32);row(g,['cup','cake'],20,w*.5,h*.4,1.05,r,1);},
  desk:(g,w,h,R,r)=>{counter(g,w*.2,h*.42,w*.62,h*.58,R,{till:false,front:'slats'});screen(g,w*.45,h*.12,w*.24,h*.28,r);chair(g,w*.12,h,1.05,R);chair(g,w*.95,h,-1.05,R);},
  scaleCounter:(g,w,h,R,r)=>{counter(g,10,h*.4,w-20,h*.6,R,{till:false,front:'tiles'});rr(g,w*.62,h*.18,w*.22,h*.12,3,'#e5e7e2',2.5);rr(g,w*.66,h*.3,w*.14,h*.1,2,'#9aa3a8',2);rr(g,w*.6,h*.08,w*.26,h*.1,4,'#c8d0d0',2);row(g,R.p,24,w*.55,h*.4,1.1,r,3);},
  workTable:(g,w,h,R,r)=>{table(g,16,h*.48,w-32,h*.52,R,r,['bouquet','bouquet','pot']);rr(g,w*.55,h*.42,w*.3,h*.06,2,'#e8dcc0',2);},
};
const WIN={
  risers:(g,w,h,R,r)=>steps(g,8,h*.02,w-16,h*.98,R,r,R.pWin??R.p,{n:3}),
  plinth:(g,w,h,R,r)=>{rr(g,8,h*.68,w-16,h*.32,3,R.plinth??'#efe6d6',3);row(g,R.pWin??R.p,20,w-20,h*.68,1.35,r,2);},
  crates:(g,w,h,R,r)=>crates(g,8,h*.1,w-16,h*.9,R,r,R.pWin??R.p,1),
  tiered:(g,w,h,R,r)=>{const x=w/2;for(let t=0;t<3;t++){const ww=w*(.8-t*.22),y=h*(.82-t*.3);el(g,x,y,ww/2,7,R.plinth??'#efe6d6',2.5);row(g,R.pWin??R.p,x-ww/2+12,x+ww/2-12,y-2,1.15,r,t*2);}rr(g,x-5,h*.2,10,h*.62,2,'#b9a882',2);el(g,x,h*.97,w*.3,6,'#b9a882',2.5);},
  buckets:(g,w,h,R,r)=>{for(let i=0;i<5;i++)bucket(g,w*(.12+i*.19),h*(.98-(i%2)*.04),1.25,R,r);},
  easel:(g,w,h,R,r)=>{ln(g,w*.62,h,w*.75,h*.05,INK,5);ln(g,w*.88,h,w*.75,h*.05,INK,5);board(g,w*.58,h*.04,w*.34,h*.6,R,r);rr(g,8,h*.7,w*.5,h*.3,3,R.plinth??'#efe6d6',3);row(g,R.pWin??R.p,18,w*.55,h*.7,1.3,r,1);},
  stacks:(g,w,h,R,r)=>{for(let i=0;i<4;i++){const x=w*(.14+i*.24),n=2+((i*7)%3);for(let k=0;k<n;k++)prod(g,'books',x,h-k*h*.16,1.6,r,i*3+k);}},
};

/* ---------- recetas por categoría ---------- */
// [fondoA, fondoB], [altaA, altaB], [mediaA, mediaB], [escaparateA, escaparateB]
const RECIPES={
  carniceria:{wall:'#eef0ea',dado:'tiles',tile:'#f8f8f3',wood:'#8a5a3b',counter:'#f1f1ec',counterFront:'tiles',accent:'#a5453d',floor:['checker','#efe7da','#a84a3f'],ceil:'panels',lamp:'tube',light:'cool',p:['meat','cheese','meat'],pCold:['meat','cheese'],pWin:['meat','cheese'],back:['hookWall','fridgeWall'],far:['rail','fridge'],mid:['vitrine','scaleCounter'],win:['plinth','tiered']},
  fruteria:{wall:'#f0e2bd',dado:'wood',wood:'#9b7146',accent:'#5f7f3a',crate:'#b58a55',floor:['terrazo','#d8cbb1','#a2513b'],ceil:'beams',lamp:'cone',lampColor:'#5f7f3a',light:'warm',p:['fruit','veg','fruit'],pWin:['fruit','veg'],back:['crateWall','shelfWall'],far:['crateStand','tallShelf'],mid:['scaleCounter','table'],win:['crates','risers']},
  supermercado:{wall:'#e9ece6',dado:'paint',wood:'#9aa2a2',accent:'#c4553f',floor:['baldosa','#e2e1da','#c9c7bc'],ceil:'panels',lamp:'tube',light:'cool',p:['package','can','bottle','jar'],pCold:['bottle','can'],back:['fridgeWall','shelfWall'],far:['gondola','fridge'],mid:['counter','table'],win:['risers','plinth']},
  farmacia:{wall:'#eef3ea',dado:'paint',wood:'#d9dfd2',shelfBack:'#c4d1c2',counter:'#e8ece4',accent:'#3f9a6a',floor:['terrazo','#e6e3d9','#9fb3a8'],ceil:'panels',lamp:'spots',light:'cool',cross:true,p:['medbox','medbottle','medbox','cosmetic'],pWin:['medbox','cosmetic'],back:['drawerWall','shelfWall'],far:['tower','gondola'],mid:['counter','vitrine'],win:['risers','tiered']},
  calzado:{wall:'#efe5d7',dado:'none',wood:'#a98560',plinth:'#e9dccb',accent:'#775039',floor:['madera','#c49a68','#8a6440'],ceil:'plain',lamp:'spots',light:'neutral',p:['shoe','boot','shoe'],back:['shelfWall','pegWall'],far:['tallShelf','tower'],mid:['table','counter'],win:['risers','plinth']},
  libreria:{wall:'#efe2c6',dado:'wood',wood:'#7a5233',accent:'#6e4544',floor:['madera','#a7774a','#6c4a2c'],ceil:'beams',lamp:'globe',light:'warm',p:['books'],pTable:['books'],back:['bookWall','bookWall'],far:['bookcase','brochureStand'],mid:['table','counter'],win:['stacks','easel']},
  cafe:{wall:'#e9d6b3',dado:'tiles',tile:'#f3eadb',wood:'#6f4a30',counter:'#7a5236',counterFront:'slats',accent:'#476456',tableTop:'#d9c7a5',chair:'#3e3a36',floor:['hidraulico','#d9c9a8','#476456'],ceil:'beams',lamp:'dome',lampColor:'#476456',light:'warm',p:['cup','cake','pastry'],pWin:['cake','pastry'],back:['barBack','shelfWall'],far:['barStools','tableChairs'],mid:['bar','vitrine'],win:['tiered','easel']},
  restaurante:{wall:'#e7cfb1',dado:'wood',wood:'#5f3b26',counter:'#6a422b',accent:'#874b36',cloth:'#f1e8da',chair:'#5f3b26',floor:['terrazo','#d8c1a0','#8a4a32'],ceil:'vault',ceilColor:'#efe1c6',lamp:'globe',light:'warm',p:['wine','plate','glass'],pWin:['wine','plate'],back:['barBack','posterWall'],far:['tableChairs','barStools'],mid:['table','bar'],win:['easel','plinth']},
  belleza:{wall:'#f1e4e0',dado:'none',wood:'#d2bfae',mirrorFrame:'#d6b98a',chair:'#6d5368',plinth:'#f2e8e4',accent:'#6d5368',floor:['checker','#f0ece6','#3c3836'],ceil:'plain',lamp:'globe',light:'neutral',p:['cosmetic'],back:['mirrorWall','mirrorWall'],far:['barberChair','tower'],mid:['counter','vitrine'],win:['risers','plinth']},
  electronica:{wall:'#e6eaec',dado:'none',wood:'#c8ccc8',counter:'#e9ecea',accent:'#354a64',plinth:'#f2f3f1',floor:['baldosa','#d7d9d6','#b9bdba'],ceil:'panels',lamp:'spots',light:'cool',p:['device','headphones','device'],back:['screenWall','pegWall'],far:['tower','gondola'],mid:['table','counter'],win:['risers','plinth']},
  bazar:{wall:'#f0e0c0',dado:'paint',wood:'#a8814f',peg:'#d8b47c',accent:'#92693b',floor:['terrazo','#ddd0b8','#a5713e'],ceil:'plain',lamp:'cone',lampColor:'#b5513a',light:'warm',p:['toy','gift','toy','package'],back:['pegWall','shelfWall'],far:['gondola','tallShelf'],mid:['counter','table'],win:['risers','tiered']},
  floristeria:{wall:'#e9e6d2',dado:'wood',wood:'#6f7a4a',accent:'#536d46',floor:['hidraulico','#d8d2bd','#6f8a5a'],ceil:'beams',lamp:'cone',lampColor:'#536d46',light:'warm',p:['pot','bouquet'],pTable:['bouquet','pot'],back:['bucketWall','bucketWall'],far:['bucketLadder','tallShelf'],mid:['workTable','counter'],win:['buckets','tiered']},
  optica:{wall:'#e5eeec',dado:'none',wood:'#d7d1c4',mirrorFrame:'#b8ad94',accent:'#375967',plinth:'#f1f2ee',floor:['madera','#cfb08a','#9b7a55'],ceil:'plain',lamp:'spots',light:'neutral',p:['glasses'],back:['shelfWall','mirrorWall'],far:['tower','tallShelf'],mid:['desk','vitrine'],win:['risers','plinth']},
  servicios:{wall:'#e8e4da',dado:'paint',wood:'#a39c8c',accent:'#4a5870',chair:'#4a5870',floor:['baldosa','#dcd8cd','#bdb8ab'],ceil:'panels',lamp:'tube',light:'neutral',p:['brochure'],back:['posterWall','posterWall'],far:['brochureStand','easel'],mid:['desk','counter'],win:['plinth','easel']},
  generico:{wall:'#ebe0cb',dado:'paint',wood:'#9b7a58',accent:'#695542',floor:['terrazo','#d9ccb4','#8f7656'],ceil:'plain',lamp:'dome',lampColor:'#695542',light:'warm',p:['package','box','jar','gift'],back:['shelfWall','pegWall'],far:['gondola','tallShelf'],mid:['counter','table'],win:['plinth','risers']},
};
export const KIT_CATEGORIES=Object.keys(RECIPES);
export function kitRecipe(category){return RECIPES[category]??RECIPES.generico;}

// Pinta los módulos de una categoría; misma semilla → mismos píxeles.
export function paintKit(category){const R=kitRecipe(category),r=rng(hashString('kit:'+category)),S=KIT_SIZES;
  const back=v=>cv(S.back,(g,w,h)=>{wallBase(g,w,h,R,r);BACK[R.back[v]](g,w,h,R,r,v);lightPass(g,w,h,R);});
  const piece=(table,name,size)=>cv(size,(g,w,h)=>{(table[name]??Object.values(table)[0])(g,w,h,R,r);});
  // El escaparate se apoya en una tarima de 0,45 m para asomar por encima del zócalo del marco.
  const win=name=>cv(S.win,(g,w,h)=>{const base=h*.39,top=h-base,col=R.plinth??shade(R.wall,-.1);rr(g,2,top,w-4,base-2,2,shade(col,-.12),3);rr(g,2,top,w-4,12,2,shade(col,.15),2.5);g.fillStyle='rgba(20,12,6,.18)';g.fillRect(5,top+12,w-10,10);(WIN[name]??WIN.plinth)(g,w,top+2,R,r);});
  return {backA:back(0),backB:back(1),farA:piece(FAR,R.far[0],S.far),farB:piece(FAR,R.far[1],S.far),midA:piece(MID,R.mid[0],S.mid),midB:piece(MID,R.mid[1],S.mid),winA:win(R.win[0]),winB:win(R.win[1]),
    lamps:cv(S.lamps,(g,w,h)=>lampsPaint(g,w,h,R)),ceil:cv(S.ceil,(g,w,h)=>ceilPaint(g,w,h,R)),floor:cv(S.floor,(g,w,h)=>floorPaint(g,w,h,R,r)),side:cv(S.side,(g,w,h)=>sidePaint(g,w,h,R,r)),persiana:cv(S.persiana,(g,w,h)=>persianaPaint(g,w,h))};}
export function kitAtlasCanvas(category){const tiles=paintKit(category),c=document.createElement('canvas');c.width=c.height=KIT_SIZE;const g=c.getContext('2d');
  for(const [name,[x,y,w,h]] of Object.entries(KIT_TILES)){const img=tiles[name];g.drawImage(img,x,y,w,h);}return c;}
// UV de una celda (con 3 px de margen para que el mipmap no mezcle vecinos). mirror invierte U.
export function kitUV(name,mirror=false){const [x,y,w,h]=KIT_TILES[name],p=3,u0=(x+p)/KIT_SIZE,u1=(x+w-p)/KIT_SIZE,v0=1-(y+h-p)/KIT_SIZE,v1=1-(y+p)/KIT_SIZE;return mirror?[[u1,v0],[u0,v0],[u0,v1],[u1,v1]]:[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];}

// Composición de capas por layout: [módulo, centro x (−0,47…0,47), profundidad relativa (0 vidrio … 1 fondo)].
// Las piezas del escaparate quedan siempre en el lado contrario a la puerta, también con espejo.
export const KIT_LAYOUTS=[
  {back:'backA',layers:[['farA',-.27,.74],['midA',.21,.47],['lamps',0,.3],['winA',-.23,.12]]},
  {back:'backB',layers:[['farB',-.29,.8],['farA',.29,.64],['midB',0,.43],['lamps',0,.28],['winB',-.24,.12]]},
  {back:'backB',layers:[['farB',.27,.72],['midA',-.18,.48],['lamps',0,.32],['winB',-.22,.13]]},
];
