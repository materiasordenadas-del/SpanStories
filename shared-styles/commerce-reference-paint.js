// Pintura de la referencia aportada por el usuario, reutilizada como base del creador.
// Canvas puros: se empacan por categoría y se exportan en los GLB, sin objetos de mobiliario.
const INK='#2b2118';
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function cv(w,h,draw,opts={}){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);return c;}
function rr(g,x,y,w,h,r,fill,sw=3){g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(sw){g.strokeStyle=INK;g.lineWidth=sw;g.stroke();}}
function el(g,x,y,rx,ry,fill,sw=3,rot=0){g.beginPath();g.ellipse(x,y,rx,ry,rot,0,Math.PI*2);if(fill){g.fillStyle=fill;g.fill();}if(sw){g.strokeStyle=INK;g.lineWidth=sw;g.stroke();}}
function ln(g,x1,y1,x2,y2,c=INK,w=3){g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokeStyle=c;g.lineWidth=w;g.stroke();}

/* ---------- parámetros del vano ---------- */
const W=3.4, D=1.5, YB=0.05, YT=2.85, H=YT-YB;       // caja somera (m)
const PX=300;                                          // píxeles por metro en el fondo
const px=x=>(x+W/2)*PX, py=y=>(YT-y)*PX;
const LAYER_Z=[-0.3,-0.75,-1.1];


export function referenceBakery(seed=0){
function bread(g,x,y,s,r){
  const k=r();
  if(k<.4){ // baguette inclinada
    g.save();g.translate(x,y);g.rotate((r()-.5)*.5);rr(g,-7*s,-70*s,14*s,70*s,7*s,'#d99b46',2.5);
    for(let i=0;i<4;i++)ln(g,-5*s,(-60+i*15)*s,5*s,(-55+i*15)*s,'#9a5f22',2);g.restore();
  }else if(k<.8){el(g,x,y-14*s,28*s,18*s,'#cf8c3e',2.5);ln(g,x-12*s,y-22*s,x+10*s,y-26*s,'#8f561e',2);ln(g,x-6*s,y-12*s,x+16*s,y-18*s,'#8f561e',2);}
  else{el(g,x,y-12*s,20*s,14*s,'#e6b35c',2.5);el(g,x,y-12*s,11*s,7*s,'#f1c97e',0);}
}
const panBack=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  const r=rng(seed+11);
  g.fillStyle='#ecd6a8';g.fillRect(0,0,w,h);
  // alicatado blanco inferior
  g.fillStyle='#f4efe4';g.fillRect(0,py(.95),w,py(YB)-py(.95));
  g.strokeStyle='#cfc6b4';g.lineWidth=1.5;
  for(let x=0;x<w;x+=45)ln(g,x,py(.95),x,py(YB),'#cfc6b4',1.5);
  for(let y=py(.95);y<py(YB);y+=45)ln(g,0,y,w,y,'#cfc6b4',1.5);
  ln(g,0,py(.95),w,py(.95),'#a89a7e',4);
  // dos estanterías con pan
  for(const [x0,x1] of [[-1.6,-0.5],[-0.3,0.8]]){
    rr(g,px(x0),py(2.7),(x1-x0)*PX,py(.95)-py(2.7),0,'#6f4627',3);
    for(const sy of [1.0,1.55,2.1]){
      const top=py(sy+.55), bot=py(sy);
      g.fillStyle='#3a2616';g.fillRect(px(x0)+6,top,(x1-x0)*PX-12,bot-top);
      for(let x=px(x0)+26;x<px(x1)-20;x+=44)bread(g,x+ (r()-.5)*8,bot-2,.75+r()*.25,r);
      rr(g,px(x0),bot,(x1-x0)*PX,14,0,'#9a6a3e',2.5);
    }
  }
  // puerta del obrador
  rr(g,px(1.0),py(2.25),.75*PX,py(YB)-py(2.25),4,'#5a3a22',4);
  rr(g,px(1.1),py(2.1),.55*PX,.55*PX,4,'#bcd3d3',3);
  el(g,px(1.6),py(1.1),6,6,'#d8b24a',2);
  // pizarra
  rr(g,px(.95),py(2.78),.85*PX,.36*PX,4,'#24332c',4);
  g.fillStyle='#f1efe4';g.font='bold 25px system-ui';g.textAlign='center';g.fillText('PAN FRESCO',px(.95)+.425*PX,py(2.78)+.23*PX);
  // sombra de profundidad
  const v=g.createRadialGradient(w/2,h/2,h*.25,w/2,h/2,h*.85);v.addColorStop(0,'rgba(40,20,0,0)');v.addColorStop(1,'rgba(40,20,0,.5)');g.fillStyle=v;g.fillRect(0,0,w,h);
});
const panL3=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  const r=rng(seed+23);
  // mueble bajo con cestas
  rr(g,px(-1.62),py(.78),2.34*PX,py(YB)-py(.78),0,'#7a4d2a',4);
  for(let i=0;i<6;i++)ln(g,px(-1.62)+i*2.34*PX/6,py(.78),px(-1.62)+i*2.34*PX/6,py(YB),'#4a2e17',3);
  rr(g,px(-1.66),py(.78)-8,2.42*PX,14,0,'#a8774a',3);
  for(let i=0;i<5;i++){
    const cx=px(-1.35)+i*.5*PX;
    for(let k=0;k<4;k++)bread(g,cx-28+k*19,py(.78)-22,.8,r);
    // cesta de mimbre
    g.beginPath();g.moveTo(cx-48,py(.78)-20);g.lineTo(cx+48,py(.78)-20);g.lineTo(cx+36,py(.78)+30);g.lineTo(cx-36,py(.78)+30);g.closePath();g.fillStyle='#b78850';g.fill();g.strokeStyle=INK;g.lineWidth=3;g.stroke();
    for(let y=py(.78)-6;y<py(.78)+30;y+=12)ln(g,cx-44,y,cx+44,y,'#7c5528',2);
  }
});
const panL2=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  const r=rng(seed+31);
  // mostrador
  rr(g,px(.25),py(1.02),1.4*PX,py(YB)-py(1.02),0,'#8b5a33',4);
  g.fillStyle='#f4efe4';g.fillRect(px(.25)+6,py(.75),1.4*PX-12,.32*PX);
  for(let x=px(.25)+6;x<px(1.65)-6;x+=40)ln(g,x,py(.75),x,py(.75)+.32*PX,'#cfc6b4',1.5);
  rr(g,px(.2),py(1.02)-10,1.5*PX,18,0,'#c8955d',4);
  // vitrina de bollería
  rr(g,px(.35),py(1.58),1.05*PX,py(1.02)-py(1.58)-10,4,null,4);
  ln(g,px(.35),py(1.3),px(1.4),py(1.3),INK,3);
  for(const [yy,n] of [[1.3,6],[1.02,6]])for(let i=0;i<n;i++){const cx=px(.47)+i*52;el(g,cx,py(yy)-14,19,13,'#d99345',2.5);el(g,cx-5,py(yy)-19,8,5,'#f0c17b',0);}
  // caja registradora
  rr(g,px(1.48),py(1.28),.14*PX,.26*PX,3,'#2f3a40',3);
});
const panL1=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  for(const x of [-1.0,0,1.0]){
    ln(g,px(x),0,px(x),py(2.38),INK,3);
    g.beginPath();g.moveTo(px(x)-52,py(2.28));g.quadraticCurveTo(px(x),py(2.58),px(x)+52,py(2.28));g.closePath();g.fillStyle='#c97a2e';g.fill();g.strokeStyle=INK;g.lineWidth=3.5;g.stroke();
    el(g,px(x),py(2.27),13,9,'#fff0b8',2);
  }
});
const panGlow=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  for(const x of [-1.0,0,1.0]){const gr=g.createRadialGradient(px(x),py(2.2),4,px(x),py(2.2),210);gr.addColorStop(0,'rgba(255,200,110,.9)');gr.addColorStop(1,'rgba(255,170,60,0)');g.fillStyle=gr;g.fillRect(0,0,w,h);}
});
const tileOchre=cv(256,256,(g)=>{ // baldosa hidráulica ocre
  g.fillStyle='#d9b878';g.fillRect(0,0,256,256);
  g.strokeStyle='#8f6b36';g.lineWidth=6;g.strokeRect(5,5,246,246);
  g.strokeStyle='#4f7a5d';g.lineWidth=5;g.strokeRect(24,24,208,208);
  g.fillStyle='#a8452f';for(const [x,y] of [[128,128]]){for(let a=0;a<8;a++){g.save();g.translate(x,y);g.rotate(a*Math.PI/4);g.beginPath();g.ellipse(0,-46,16,34,0,0,Math.PI*2);g.fill();g.restore();}}
  g.fillStyle='#f4e7c3';g.beginPath();g.arc(128,128,18,0,7);g.fill();
  g.fillStyle='#4f7a5d';for(const [x,y] of [[40,40],[216,40],[40,216],[216,216]]){g.beginPath();g.arc(x,y,9,0,7);g.fill();}
},{repeat:[W/.2,D/.2]});
const sideGrad=(c0,c1)=>cv(256,64,(g,w,h)=>{const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,c0);gr.addColorStop(1,c1);g.fillStyle=gr;g.fillRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,h*.88,w,h*.12);});
function plain(c){return cv(8,8,(g,w,h)=>{g.fillStyle=c;g.fillRect(0,0,w,h);});}


return {back:panBack,far:panL3,counter:panL2,near:panL1,glow:panGlow,floor:tileOchre};
}
export function referenceClothes(seed=0){
const COL=['#c4452f','#2e5a8a','#e0b24a','#3e7d5a','#8a4a8f','#f0efe8','#2b2b30','#d9784a'];
const ropaBack=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  const r=rng(seed+41);
  g.fillStyle='#e9e7e3';g.fillRect(0,0,w,h);
  g.fillStyle='#d6d2cb';g.fillRect(0,py(.12),w,py(YB)-py(.12));
  // panel central con arte abstracto
  rr(g,px(-.55),py(2.65),1.1*PX,py(.95)-py(2.65),3,'#c3d0d6',4);
  el(g,px(0),py(1.95),95,95,'#e0b24a',4);
  rr(g,px(-.45),py(1.3),.9*PX,26,0,'#2e5a8a',3);
  rr(g,px(-.45),py(1.15),.5*PX,26,0,'#c4452f',3);
  // cubículos laterales con ropa doblada
  for(const [x0,x1] of [[-1.62,-.7],[.7,1.62]]){
    rr(g,px(x0),py(1.95),(x1-x0)*PX,py(YB)-py(1.95),0,'#f7f5f1',4);
    for(let row=0;row<5;row++){
      const yy=py(YB)-row*.37*PX;
      ln(g,px(x0),yy-.37*PX,px(x1),yy-.37*PX,INK,3);
      for(let x=px(x0)+8;x<px(x1)-40;x+=64){
        const n=2+Math.floor(r()*3);
        for(let k=0;k<n;k++)rr(g,x,yy-.37*PX+ (.37*PX-8) - (k+1)*18,54,16,3,COL[Math.floor(r()*COL.length)],2.5);
      }
    }
    ln(g,(px(x0)+px(x1))/2,py(1.95),(px(x0)+px(x1))/2,py(YB),INK,3);
  }
  const v=g.createRadialGradient(w/2,h/2,h*.25,w/2,h/2,h*.85);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(20,20,30,.45)');g.fillStyle=v;g.fillRect(0,0,w,h);
});
const ropaL3=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  const r=rng(seed+53);
  for(const [x0,x1] of [[-1.62,-.62],[.62,1.62]]){
    const ry=py(1.55);
    ln(g,px(x0),ry,px(x1),ry,INK,6);
    ln(g,px(x0),ry,px(x0),py(YB),INK,6);ln(g,px(x1),ry,px(x1),py(YB),INK,6);
    rr(g,px(x0)-18,py(YB)-10,36,12,3,'#2b2b30',3);rr(g,px(x1)-18,py(YB)-10,36,12,3,'#2b2b30',3);
    for(let x=px(x0)+22;x<px(x1)-14;x+=36){
      const c=COL[Math.floor(r()*COL.length)],len=.55+r()*.35;
      ln(g,x,ry,x,ry+10,INK,2);
      g.beginPath();g.moveTo(x-18,ry+12);g.lineTo(x+18,ry+12);g.lineTo(x+16,ry+len*PX);g.lineTo(x-16,ry+len*PX);g.closePath();g.fillStyle=c;g.fill();g.strokeStyle=INK;g.lineWidth=2.5;g.stroke();
    }
  }
});
const ropaL2=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  const r=rng(seed+61);
  // mesa expositora
  rr(g,px(-.75),py(.88),1.5*PX,18,3,'#9b6b3d',4);
  for(const x of [-.65,.65])rr(g,px(x)-8,py(.88)+14,16,py(YB)-py(.88)-14,2,'#6e4726',3);
  // pilas de ropa
  for(let s=0;s<4;s++){
    const x=px(-.6)+s*.33*PX,n=3+Math.floor(r()*4);
    for(let k=0;k<n;k++)rr(g,x,py(.88)-(k+1)*20,.28*PX,19,3,COL[Math.floor(r()*COL.length)],2.5);
  }
});
const ropaL1=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  rr(g,px(-1.5),py(2.82),3.0*PX,10,2,'#1b1b1d',2);
  for(const x of [-1.0,0,1.0]){ln(g,px(x),py(2.82)+8,px(x),py(2.7),INK,3);rr(g,px(x)-11,py(2.7),22,26,5,'#1b1b1d',2.5);}
});
const ropaGlow=cv(Math.round(W*PX),Math.round(H*PX),(g,w,h)=>{
  for(const x of [-1.0,0,1.0]){const gr=g.createRadialGradient(px(x),py(1.4),4,px(x),py(1.4),240);gr.addColorStop(0,'rgba(255,248,235,.75)');gr.addColorStop(1,'rgba(255,248,235,0)');g.fillStyle=gr;g.fillRect(0,py(2.7),w,h);
    const g2=g.createRadialGradient(px(x),py(2.66),2,px(x),py(2.66),50);g2.addColorStop(0,'rgba(255,255,255,.95)');g2.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=g2;g.fillRect(0,0,w,h);}
});
const woodFloor=cv(256,256,(g)=>{
  const r=rng(seed+7);const cols=['#d1b184','#c9a77a','#d6b98d','#c4a074'];
  for(let i=0;i<8;i++){g.fillStyle=cols[Math.floor(r()*cols.length)];g.fillRect(0,i*32,256,32);ln(g,0,i*32,256,i*32,'#8d6e45',2);const o=r()*200;ln(g,o,i*32,o,i*32+32,'#8d6e45',2);}
},{repeat:[W/.9,D/.9]});
return {back:ropaBack,far:ropaL3,counter:ropaL2,near:ropaL1,glow:ropaGlow,floor:woodFloor};
}

