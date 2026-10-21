import * as T from '../engine/three.js';
import { caja,cilindro,esfera } from './Piezas.js';
import { COLORS as C,PANTALLAS as PA } from '../engine/dimensions.js';

// Pantallas, paneles y equipos digitales del hotel. Cada pantalla es una ilustración emisiva
// (MeshBasicMaterial sobre un lienzo 2D): sin relighting, como carteles y rótulos. Pivot abajo-centro,
// la cara trasera en z = 0 (se apoya en el muro) y la imagen mira a +z. El contenido se redibuja en
// `userData.vivo(t)`, que main.js llama a ~12 pasos por segundo solo para lo que se ve.

const sans='system-ui,"Segoe UI",sans-serif',serif='Georgia,serif',TAU=Math.PI*2;
const hora=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
const fondo=(g,W,H,a,b)=>{const l=g.createLinearGradient(0,0,W,H);l.addColorStop(0,a);l.addColorStop(1,b);g.fillStyle=l;g.fillRect(0,0,W,H);};
const txt=(g,s,x,y,{size=24,color=C.ivory,align='left',font=sans,weight=600,max}={})=>{g.font=weight+' '+size+'px '+font;g.textAlign=align;g.textBaseline='middle';g.fillStyle=color;if(max)g.fillText(s,x,y,max);else g.fillText(s,x,y);};
const rr=(g,x,y,w,h,r,fill)=>{g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();};
const circ=(g,x,y,r,fill)=>{g.beginPath();g.arc(x,y,r,0,TAU);g.fillStyle=fill;g.fill();};
function sol(g,x,y,r,t){circ(g,x,y,r,C.gold);g.strokeStyle=C.gold;g.lineWidth=r*.2;for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.5;g.beginPath();g.moveTo(x+Math.cos(a)*r*1.3,y+Math.sin(a)*r*1.3);g.lineTo(x+Math.cos(a)*r*1.7,y+Math.sin(a)*r*1.7);g.stroke();}}
function nube(g,x,y,r,col='#e9f0f2'){circ(g,x-r*.6,y+r*.1,r*.6,col);circ(g,x+r*.1,y-r*.2,r*.8,col);circ(g,x+r*.8,y+r*.15,r*.55,col);g.fillStyle=col;g.fillRect(x-r*.6,y+r*.1,r*1.4,r*.6);}
function lluvia(g,x,y,r,t){nube(g,x,y-r*.3,r,'#c4d3d8');g.strokeStyle=C.blue;g.lineWidth=r*.12;for(let i=0;i<3;i++){const k=(t*1.5+i*.33)%1;g.beginPath();g.moveTo(x-r*.5+i*r*.5,y+r*.5+k*r*.6);g.lineTo(x-r*.58+i*r*.5,y+r*.7+k*r*.6);g.stroke();}}

const SALIDAS=[['08:30','Islas del Rosario','EMBARCANDO'],['09:00','Ciudad Amurallada','A TIEMPO'],['09:45','Traslado al aeropuerto','A TIEMPO'],['10:30','Clase de salsa','ABIERTA'],['11:00','Spa · masaje','A TIEMPO'],['12:15','Volcán del Totumo','RETRASADO'],['14:00','Tour de café','A TIEMPO'],['16:30','Atardecer en el mar','A TIEMPO']];
const CARTA=[['Limonada de coco','14.000'],['Café de origen','9.000'],['Cóctel El Coral','32.000'],['Jugo de maracuyá','10.000'],['Arepa de huevo','12.000'],['Ron de la casa','28.000']];
const DIRECTORIO=[['Recepción','PB'],['Restaurante','PB'],['Lounge El Coral','PB'],['Conserjería','PB'],['Ascensores','PB'],['Habitaciones 201–212','P1']];
const CIUDADES=[['Cartagena',29,'sol'],['Bogotá',17,'nube'],['Medellín',24,'sol'],['Cali',27,'lluvia'],['Santa Marta',31,'sol']];

// Programas: (g, W, H, t, opciones). Todo se mide con u = H/100 para que valgan en cualquier proporción.
export const PROGRAMAS={
  // Arte generativo para el muro LED: olas tropicales y un sol que respira.
  ondas(g,W,H,t){fondo(g,W,H,'#16343a','#1f4f55');const cols=[C.blue,C.teal,C.green,C.gold,C.peach];
    for(let i=0;i<5;i++){g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=W/90)g.lineTo(x,H*(.38+i*.11)+Math.sin(x/W*TAU*(1.2+i*.3)+t*(.6+i*.25))*H*(.07+i*.01));g.lineTo(W,H);g.closePath();g.globalAlpha=.88;g.fillStyle=cols[i];g.fill();}
    g.globalAlpha=1;circ(g,W*.84,H*.24,H*.1*(1+.05*Math.sin(t*2)),C.gold);},
  bienvenida(g,W,H,t){const u=H/100,s=Math.floor(t/6)%3,k=Math.min(1,(t%6)/.6);fondo(g,W,H,'#244b40','#326b72');
    const S=[['Bienvenido a Palma Real','Su estancia comienza aquí · Check-in desde las 15:00'],['Islas del Rosario','Excursión en lancha · salida 08:30 · reserve en conserjería'],['Desayuno colombiano','Jardín de Palma · 6:30–10:00 · arepa, huevos, fruta y café']][s];
    g.fillStyle=C.gold;g.fillRect(0,H-u*5,W*((t%6)/6),u*2.4);g.globalAlpha=k;
    if(W/H>3){txt(g,S[0],W*.05,H*.36,{size:u*20,font:serif,max:W*.62});txt(g,S[1],W*.05,H*.68,{size:u*9,color:C.gold,max:W*.62});g.globalAlpha=1;
      txt(g,hora(),W*.95,H*.3,{size:u*24,align:'right'});sol(g,W*.72,H*.66,u*6,t);txt(g,'29 °C · Cartagena',W*.95,H*.66,{size:u*9,align:'right',color:C.blue,max:W*.2});}
    else{txt(g,S[0],W/2,H*.4,{size:u*11,font:serif,align:'center',max:W*.88});txt(g,S[1],W/2,H*.58,{size:u*5,color:C.gold,align:'center',max:W*.88});g.globalAlpha=1;
      txt(g,hora(),W*.94,H*.1,{size:u*9,align:'right'});sol(g,W*.12,H*.82,u*4,t);txt(g,'29 °C · Cartagena',W*.2,H*.82,{size:u*5.5,color:C.blue,max:W*.5});}},
  deportes(g,W,H,t){const u=H/100;for(let i=0;i<8;i++){g.fillStyle=i%2?'#357f50':'#2c7447';g.fillRect(i*W/8,0,W/8,H);}
    g.strokeStyle='#ffffffcc';g.lineWidth=u*.7;g.strokeRect(W*.04,H*.16,W*.92,H*.74);g.beginPath();g.moveTo(W/2,H*.16);g.lineTo(W/2,H*.9);g.stroke();g.beginPath();g.arc(W/2,H*.53,H*.14,0,TAU);g.stroke();
    for(const [x0,col] of [[.3,'#f2c230'],[.7,'#2e5ea8']])for(let i=0;i<5;i++)circ(g,W*(x0+Math.sin(t*.7+i*1.7)*.12),H*(.28+i*.14+Math.cos(t*.9+i)*.04),u*3.2,col);
    circ(g,W*(.5+Math.sin(t*.8)*.33),H*(.53+Math.sin(t*1.7)*.22),u*2.4,'#ffffff');
    const min=Math.floor(t)%90+1;rr(g,W*.22,0,W*.56,u*14,u*3,'#16282cee');txt(g,'SOL '+(min>20?1:0)+' – '+(min>55?1:0)+' MAR · '+min+"'",W/2,u*7.5,{size:u*8.5,align:'center',max:W*.52});
    if(Math.floor(t*2)%2)circ(g,W*.07,H*.07,u*2.2,'#e0443a');txt(g,'EN VIVO',W*.1,H*.07,{size:u*6.5,color:'#ffffff'});},
  clima(g,W,H,t){const u=H/100;fondo(g,W,H,'#244b40','#1f3d44');txt(g,'CLIMA · HOY',W/2,u*6,{size:u*4.2,align:'center',color:C.gold,max:W*.9});
    for(const [i,[c,gr,ic]] of CIUDADES.entries()){const y=u*(18+i*16.5);rr(g,W*.06,y-u*6,W*.88,u*13,u*2,'#ffffff14');txt(g,c,W*.1,y,{size:u*4.6,max:W*.42});txt(g,gr+'°',W*.9,y,{size:u*6.5,align:'right',color:C.peach});
      const x=W*.64;if(ic==='sol')sol(g,x,y,u*2.6,t+i);else if(ic==='nube')nube(g,x,y,u*2.6);else lluvia(g,x,y,u*2.8,t+i);}},
  tablero(g,W,H,t){const u=H/100,n=5,o=Math.floor(t/3),k=Math.min(1,(t%3)*2);fondo(g,W,H,'#1c2c30','#223a3f');
    rr(g,0,0,W,u*16,0,'#0f1b1e');txt(g,'SALIDAS · TRASLADOS',W*.04,u*8,{size:u*8,color:C.gold,font:serif,max:W*.6});txt(g,hora(),W*.96,u*8,{size:u*8,align:'right'});
    for(let i=0;i<n;i++){const r=SALIDAS[(o+i)%SALIDAS.length],y=u*(26+i*14);g.globalAlpha=i===n-1?k:1;rr(g,W*.03,y-u*5.5,W*.94,u*11,u*1.5,i%2?'#ffffff0d':'#ffffff1a');
      txt(g,r[0],W*.06,y,{size:u*6.5,color:C.gold});txt(g,r[1],W*.2,y,{size:u*6.5,max:W*.42});
      const pulso=r[2]==='EMBARCANDO'?.55+.45*Math.sin(t*6):1;g.globalAlpha*=pulso;txt(g,r[2],W*.94,y,{size:u*5.5,align:'right',color:r[2]==='RETRASADO'?C.peach:C.leaf,max:W*.28});g.globalAlpha=1;}},
  carta(g,W,H,t,{titulo='CARTA · EL CORAL',items=CARTA}={}){const u=H/100,hl=Math.floor(t/2.5)%items.length;fondo(g,W,H,'#3a2a20','#644938');txt(g,titulo,W/2,u*10,{size:u*8,align:'center',color:C.gold,font:serif,max:W*.9});
    g.fillStyle=C.gold;g.fillRect(W*.2,u*18,W*.6,u*.8);
    for(const [i,[n,p]] of items.entries()){const y=u*(30+i*11.5);if(i===hl)rr(g,W*.05,y-u*5,W*.9,u*10,u*2,'#d9b46d55');txt(g,n,W*.09,y,{size:u*6.2,color:i===hl?'#ffffff':C.ivory,max:W*.55});txt(g,'$'+p,W*.92,y,{size:u*6.2,align:'right',color:C.gold});}
    txt(g,'Precios en pesos colombianos (COP)',W/2,u*96,{size:u*3.4,align:'center',weight:400,color:'#e9dfcaaa',max:W*.9});},
  directorio(g,W,H,t){const u=H/100,hl=Math.floor(t/1.6)%DIRECTORIO.length;fondo(g,W,H,'#1f3d44','#244b40');txt(g,'DIRECTORIO',W/2,u*6,{size:u*4.6,align:'center',color:C.gold,font:serif,max:W*.9});
    for(const [i,[n,p]] of DIRECTORIO.entries()){const y=u*(17+i*12);if(i===hl)rr(g,W*.05,y-u*5,W*.9,u*10,u*2,'#d9b46d44');txt(g,n,W*.09,y,{size:u*4.4,max:W*.6,color:i===hl?'#ffffff':C.ivory});txt(g,p,W*.92,y,{size:u*4.4,align:'right',color:C.gold});}
    txt(g,'Usted está aquí · Lobby',W/2,u*96,{size:u*3.2,align:'center',weight:400,color:C.blue,max:W*.9});},
  // Kiosco de auto check-in: cuatro pasos de 3 s con frases útiles en español.
  checkin(g,W,H,t){const u=W/100,p=t%12,paso=Math.floor(p/3);fondo(g,W,H,'#244b40','#326b72');txt(g,'AUTO CHECK-IN',W/2,u*10,{size:u*7,align:'center',color:C.gold,font:serif,max:W*.9});
    const cy=H*.5;
    if(paso===0){const r=u*(24+3*Math.sin(t*4));circ(g,W/2,cy,r,C.gold);txt(g,'Toque aquí',W/2,cy,{size:u*7,align:'center',color:C.ink,max:r*1.7});txt(g,'Bienvenido',W/2,H*.82,{size:u*8,align:'center',max:W*.9});}
    else if(paso===1){rr(g,W*.2,cy-u*20,W*.6,u*40,u*3,C.ivory);txt(g,'PASAPORTE',W/2,cy-u*12,{size:u*5,align:'center',color:C.ink});circ(g,W*.38,cy+u*2,u*8,C.blue);g.fillStyle=C.ink;g.fillRect(W*.5,cy-u*3,W*.22,u*2);g.fillRect(W*.5,cy+u*3,W*.18,u*2);
      g.fillStyle='#e0443a';g.fillRect(W*.15,cy-u*20+((p-3)/3)*u*40,W*.7,u*1.2);txt(g,'Escanee su pasaporte',W/2,H*.82,{size:u*6,align:'center',max:W*.9});}
    else if(paso===2){g.strokeStyle=C.gold;g.lineWidth=u*2.4;g.beginPath();g.arc(W/2,cy,u*16,t*5,t*5+4);g.stroke();txt(g,'Verificando…',W/2,H*.82,{size:u*7,align:'center',max:W*.9});}
    else{circ(g,W/2,cy,u*20,C.leaf);g.strokeStyle='#fff';g.lineWidth=u*3.2;g.lineCap='round';const k=Math.min(1,(p-9)*1.6);g.beginPath();g.moveTo(W/2-u*9,cy);g.lineTo(W/2-u*3,cy+u*7*Math.min(1,k*2));if(k>.5)g.lineTo(W/2-u*3+u*14*(k-.5)*2,cy+u*7-u*16*(k-.5)*2);g.stroke();
      txt(g,'Habitación 201',W/2,H*.74,{size:u*8,align:'center',max:W*.9});txt(g,'Retire su tarjeta',W/2,H*.86,{size:u*5.4,align:'center',color:C.gold,max:W*.9});}},
  domotica(g,W,H,t){const u=H/100;fondo(g,W,H,'#1f3d44','#26474d');txt(g,'SUITE 201',W*.05,u*10,{size:u*8,color:C.gold,font:serif});txt(g,hora(),W*.95,u*10,{size:u*8,align:'right'});
    for(const [i,[n,v]] of [['Luz',.5+.3*Math.sin(t*.4)],['Temperatura',.45+.1*Math.sin(t*.3)],['Cortinas',.5+.5*Math.sin(t*.25)]].entries()){const y=u*(30+i*17);txt(g,n,W*.05,y,{size:u*6});rr(g,W*.4,y-u*1.5,W*.5,u*3,u*1.5,'#ffffff30');rr(g,W*.4,y-u*1.5,W*.5*v,u*3,u*1.5,C.gold);circ(g,W*.4+W*.5*v,y,u*3.6,C.ivory);}
    for(const [i,n] of ['No molestar','Limpieza'].entries()){const on=Math.floor(t/3+i)%2===0,x=W*(.05+i*.48);rr(g,x,u*78,W*.42,u*14,u*7,on?C.leaf:'#ffffff24');txt(g,n,x+W*.21,u*85,{size:u*5.6,align:'center',max:W*.36,color:on?C.ink:C.ivory});}},
  // Pantalla del escenario: ecualizador, título y programación de la noche.
  musica(g,W,H,t){const u=H/100;fondo(g,W,H,'#1a2b30','#2b4147');const n=26;
    for(let i=0;i<n;i++){const h=H*(.1+.32*Math.abs(Math.sin(t*(1.6+i%5*.35)+i*.7)));g.fillStyle=[C.blue,C.teal,C.gold,C.peach][i%4];g.fillRect(W*(.04+i*.0365),H-h-u*3,W*.026,h);}
    txt(g,'MÚSICA EN VIVO',W/2,u*17,{size:u*15,align:'center',font:serif,color:C.gold,max:W*.9});txt(g,'Hoy 8:00 pm · Trío Palma',W/2,u*38,{size:u*9,align:'center',max:W*.9});
    txt(g,'Bolero · Vallenato · Cumbia',W/2,u*53,{size:u*7,align:'center',color:C.blue,weight:400,max:W*.9});
    for(let i=0;i<3;i++){const k=(t*.18+i/3)%1;g.globalAlpha=1-k;txt(g,['♪','♫','♪'][i],W*(.12+i*.38)+Math.sin(t+i)*u*2,H*.8-k*H*.4,{size:u*9,color:C.peach});}g.globalAlpha=1;},
  dashboard(g,W,H,t){const u=H/100;fondo(g,W,H,'#f3e9d6','#e9dfca');rr(g,0,0,W,u*12,0,C.green);txt(g,'Panel de reservas',W*.04,u*6,{size:u*6,max:W*.6});txt(g,hora(),W*.96,u*6,{size:u*6,align:'right'});
    for(let i=0;i<7;i++){const h=H*(.18+.42*Math.abs(Math.sin(t*.7+i*.9)));rr(g,W*(.06+i*.115),H*.9-h,W*.085,h,u*1.2,[C.teal,C.green,C.gold][i%3]);}
    g.strokeStyle=C.peach;g.lineWidth=u*1.4;g.beginPath();for(let i=0;i<=24;i++){const x=W*(.06+i*.0385),y=H*(.34+Math.sin(i*.5-t*1.2)*.07);if(i)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();},
  videollamada(g,W,H,t){const u=H/100;fondo(g,W,H,'#233a40','#2c5557');
    const cara=(x,y,r,piel,ropa)=>{g.fillStyle=ropa;g.beginPath();g.ellipse(x,y+r*2.1,r*1.6,r*1.2,0,Math.PI,TAU);g.fill();circ(g,x,y+r*.2,r,piel);g.fillStyle=C.ink;g.beginPath();g.arc(x,y,r*1.05,Math.PI,TAU);g.fill();circ(g,x-r*.35,y+r*.25,r*.07,C.ink);circ(g,x+r*.35,y+r*.25,r*.07,C.ink);};
    cara(W*.38,H*.3+Math.sin(t*1.6)*u,u*13,C.peach,C.teal);rr(g,W*.66,H*.52,W*.28,H*.34,u*2,'#00000040');cara(W*.8,H*.62+Math.sin(t*2)*u*.5,u*6,'#c99172',C.gold);
    const s=Math.floor(t)%600;txt(g,'En llamada  '+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'),W*.05,H*.92,{size:u*6,max:W*.5});if(Math.floor(t*2)%2)circ(g,W*.04,H*.92-u*10,u*2,'#e0443a');},
  mesa(g,W,H,t){const u=H/100;fondo(g,W,H,'#1d4a55','#2a6a72');
    g.beginPath();[[0,.2],[.14,.12],[.24,.2],[.33,.17],[.4,.3],[.36,.46],[.41,.6],[.31,.76],[.22,.7],[.15,.86],[0,.92]].forEach(([x,y],i)=>i?g.lineTo(W*x,H*y):g.moveTo(W*x,H*y));g.lineTo(0,H*.2);g.closePath();g.fillStyle=C.stone;g.fill();g.strokeStyle=C.gold;g.lineWidth=u*.8;g.stroke();
    const P=[[.2,.32,'Centro Histórico'],[.3,.5,'Bocagrande'],[.62,.74,'Islas del Rosario']];
    g.setLineDash([u*2,u*2]);g.lineDashOffset=-t*18;g.strokeStyle='#ffffffcc';g.lineWidth=u*.9;g.beginPath();g.moveTo(W*.2,H*.32);g.quadraticCurveTo(W*.5,H*.35,W*.62,H*.74);g.stroke();g.setLineDash([]);
    for(const [i,[x,y,n]] of P.entries()){const k=(t*.5+i*.3)%1;g.strokeStyle=C.gold;g.globalAlpha=1-k;g.lineWidth=u*.8;g.beginPath();g.arc(W*x,H*y,u*(2+k*9),0,TAU);g.stroke();g.globalAlpha=1;circ(g,W*x,H*y,u*2.2,C.peach);txt(g,n,W*x+u*4,H*y-u*4,{size:u*5,max:W*.22});}
    rr(g,W*.7,u*8,W*.27,H*.34,u*2,'#16282ccc');txt(g,'Islas del Rosario',W*.72,u*17,{size:u*5,color:C.gold,max:W*.23});txt(g,'Lancha · 45 min',W*.72,u*28,{size:u*4.4,weight:400,max:W*.23});txt(g,'Toque para reservar',W*.72,u*38,{size:u*4,weight:400,color:C.blue,max:W*.23});},
  puerta(g,W,H,t,{num='201',estado='ocupada'}={}){const u=W/100,col=estado==='bienvenido'?'#3e8a5a':estado==='dnd'?'#c2414b':'#8d8a7e';g.fillStyle='#ece6d4';g.fillRect(0,0,W,H);g.fillStyle=col;g.fillRect(0,0,W,u*14);
    txt(g,num,W/2,H*.4,{size:u*34,align:'center',color:C.ink,font:serif});txt(g,estado==='bienvenido'?'BIENVENIDO':estado==='dnd'?'NO MOLESTAR':'OCUPADA',W/2,H*.75,{size:u*11,align:'center',color:col,max:W*.9});}
};

// Pantalla plana: carcasa toon + lienzo emisivo. `programa` es una clave de PROGRAMAS o una función.
export function crearPantalla({ancho=1.6,alto=.9,programa='ondas',px=320,opciones={},estatica=false,contorno=true,fondo:f=PA.depth,marco=PA.bezel}={}){
  const r=new T.Group();caja(r,'carcasa',ancho,alto,f,C.ink,0,alto/2,f/2,contorno);
  r.userData.radioVivo=Math.hypot(ancho,alto)/2+.5;
  const dibujar=typeof programa==='function'?programa:PROGRAMAS[programa];
  if(typeof document==='undefined'||!dibujar){const m=new T.Mesh(new T.PlaneGeometry(ancho-2*marco,alto-2*marco),new T.MeshBasicMaterial({color:'#16343a'}));m.position.set(0,alto/2,f+.002);m.name='pantalla';r.add(m);return r;}
  const W=Math.min(1024,Math.max(64,Math.round(ancho*px))),H=Math.max(48,Math.round(W*alto/ancho)),c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d'),tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.generateMipmaps=false;tex.minFilter=T.LinearFilter;
  const m=new T.Mesh(new T.PlaneGeometry(ancho-2*marco,alto-2*marco),new T.MeshBasicMaterial({map:tex,toneMapped:false}));m.position.set(0,alto/2,f+.002);m.name='pantalla';r.add(m);
  const pintar=t=>{g.save();dibujar(g,W,H,t,opciones);g.restore();tex.needsUpdate=true;};pintar(0);
  if(!estatica)r.userData.vivo=pintar;
  return r;
}

// Kiosco de auto check-in: peana, columna y pantalla vertical inclinada hacia atrás, con lector.
export function crearKiosco(){
  const r=new T.Group();caja(r,'peana',.62,.05,.5,C.darkWood);caja(r,'columna',.2,.9,.14,C.ink,0,.5,-.04);
  const p=crearPantalla({ancho:.46,alto:.7,programa:'checkin',px:300,fondo:.05});p.rotation.x=-.2;p.position.set(0,.88,.02);r.add(p);
  caja(r,'lector',.22,.05,.12,C.gold,0,.78,.1,false);caja(r,'ranura',.12,.012,.02,C.ink,0,.806,.16,false);
  r.userData.vivo=p.userData.vivo;r.userData.radioVivo=1.4;p.userData.vivo=null;return r;
}

// Tótem digital vertical (directorio): cuerpo de bronce oscuro con pantalla de 32–43″.
export function crearTotemDigital({ancho=.9,alto=2}={}){
  const r=new T.Group();caja(r,'cuerpo',ancho,alto,.12,C.darkWood,0,alto/2);caja(r,'base',ancho+.1,.12,.36,C.ink,0,.06);caja(r,'filete',ancho+.02,.05,.14,C.gold,0,alto-.04,0,false);
  const p=crearPantalla({ancho:ancho-.14,alto:alto-.62,programa:'directorio',px:300,fondo:.03,marco:.02,contorno:false});p.position.set(0,.32,.06);r.add(p);
  r.userData.vivo=p.userData.vivo;r.userData.radioVivo=alto;p.userData.vivo=null;return r;
}

// Puesto de trabajo: escritorio con dos monitores y teclado; la espalda mira a −z.
export function crearEstacionTrabajo({ancho=1.6,fondo=.75,alto=.75}={}){
  const r=new T.Group();caja(r,'tablero',ancho,.05,fondo,C.wood,0,alto-.025);
  for(const x of [-1,1])caja(r,'panel-'+x,.05,alto-.05,fondo-.06,C.darkWood,x*(ancho/2-.04),(alto-.05)/2);
  caja(r,'faldón',ancho-.1,.3,.03,C.darkWood,0,alto-.2,-fondo/2+.05,false);
  const vivos=[];for(const [i,x] of [-.4,.4].entries()){caja(r,'pie-'+i,.07,.14,.07,C.ink,x,alto+.07,-.18);const m=crearPantalla({ancho:.56,alto:.33,programa:'dashboard',px:300,fondo:.025,marco:.015});m.position.set(x,alto+.12,-.2);r.add(m);vivos.push(m);}
  caja(r,'teclado',.42,.015,.14,C.cloth,0,alto+.008,.1,false);esfera(r,'ratón',.03,C.cloth,.34,alto+.02,.1);
  r.userData.vivo=t=>{for(const [i,m] of vivos.entries())m.userData.vivo(t+i*1.7);};r.userData.radioVivo=2;
  return r;
}

// Mesa táctil de 2,4 m: la pantalla horizontal enrasa con el tablero.
export function crearMesaTactil({ancho=2.4,fondo=1.3,alto=.78}={}){
  const r=new T.Group();caja(r,'tablero',ancho,.12,fondo,C.darkWood,0,alto-.06);caja(r,'pedestal',ancho*.5,alto-.14,fondo*.45,C.ink,0,(alto-.14)/2);caja(r,'zócalo',ancho*.62,.04,fondo*.6,C.gold,0,.02,0,false);
  const p=crearPantalla({ancho:ancho-.2,alto:fondo-.2,programa:'mesa',px:330,fondo:.012,marco:.01,contorno:false});p.rotation.x=-Math.PI/2;p.position.set(0,alto+.001,(fondo-.2)/2);r.add(p);
  r.userData.vivo=p.userData.vivo;p.userData.vivo=null;r.userData.radioVivo=ancho;return r;
}

// Globo holográfico: malla cian que gira sobre una peana, con un satélite en órbita y un destino que late.
export function crearGlobo({radio=.45}={}){
  const r=new T.Group();cilindro(r,'peana',radio*.8,.9,C.ink);cilindro(r,'aro',radio*.86,.05,C.gold,0,.9);
  const cuerpo=new T.Group();cuerpo.position.y=.9+radio*1.35;r.add(cuerpo);
  const nucleo=new T.Mesh(new T.SphereGeometry(radio*.97,18,12),new T.MeshBasicMaterial({color:'#1b3c44'}));nucleo.name='nucleo';cuerpo.add(nucleo);
  const malla=new T.Mesh(new T.SphereGeometry(radio,16,12),new T.MeshBasicMaterial({color:'#9dc5cf',wireframe:true}));malla.name='malla';cuerpo.add(malla);
  const destino=new T.Mesh(new T.SphereGeometry(radio*.07,8,6),new T.MeshBasicMaterial({color:C.gold}));destino.position.set(radio,0,0);malla.add(destino);malla.rotation.z=.4;
  const orbita=new T.Group();cuerpo.add(orbita);orbita.rotation.x=1.1;const aro=new T.Mesh(new T.TorusGeometry(radio*1.3,radio*.012,6,40),new T.MeshBasicMaterial({color:C.gold}));aro.rotation.x=Math.PI/2;orbita.add(aro);
  const sat=new T.Mesh(new T.SphereGeometry(radio*.06,8,6),new T.MeshBasicMaterial({color:C.peach}));sat.name='satélite';orbita.add(sat);
  r.userData.vivo=t=>{malla.rotation.y=t*.6;sat.position.set(Math.cos(t*1.1)*radio*1.3,0,Math.sin(t*1.1)*radio*1.3);const s=1+.5*Math.abs(Math.sin(t*2.4));destino.scale.setScalar(s);cuerpo.position.y=.9+radio*1.35+Math.sin(t*1.3)*.02;};
  r.userData.radioVivo=2;return r;
}

// Cabina acústica de trabajo (tipo «phone booth»): tres paredes de fieltro, techo de nogal, taburete y videollamada.
export function crearCabinaTrabajo({lado=1.3,alto=2.3}={}){
  const r=new T.Group(),e=.06;caja(r,'fondo',lado,alto,e,C.green,0,alto/2,-lado/2+e/2);
  for(const s of [-1,1])caja(r,'lateral-'+s,e,alto,lado,C.green,s*(lado/2-e/2),alto/2,0);
  caja(r,'techo',lado+.12,.08,lado+.12,C.darkWood,0,alto+.04);caja(r,'suelo',lado,.03,lado,C.sand,0,.015);
  caja(r,'tira-luz',lado-.3,.02,.06,'#fff0cc',0,alto-.02,.2,false);for(const s of [-1,1])caja(r,'jamba-'+s,.05,alto,.08,C.gold,s*(lado/2+.01),alto/2,lado/2-.04,false);
  cilindro(r,'taburete',.19,.62,C.cloth,0,.31,.1);cilindro(r,'base',.22,.04,C.ink,0,.02,.1);
  const p=crearPantalla({ancho:.62,alto:.38,programa:'videollamada',px:300,fondo:.03,marco:.015});p.position.set(0,1.05,-lado/2+e);r.add(p);
  caja(r,'repisa',.7,.04,.2,C.darkWood,0,1.0,-lado/2+e+.1,false);
  r.userData.vivo=p.userData.vivo;p.userData.vivo=null;r.userData.radioVivo=2.2;return r;
}

// Guía luminosa de suelo: hilera de pastillas emisivas con un pulso que corre hacia el fondo (−z).
export function crearGuiaLuz({largo=16,n=16,ancho=.14}={}){
  const r=new T.Group(),paso=largo/n,mats=[];
  for(let i=0;i<n;i++){const m=new T.MeshBasicMaterial({color:C.teal});const b=new T.Mesh(new T.BoxGeometry(ancho,.012,paso*.6),m);b.position.set(0,.006,largo/2-paso*(i+.5));b.name='pastilla-'+i;r.add(b);mats.push(m);}
  const base=new T.Color(C.teal),alto=new T.Color('#ffe9a8');
  r.userData.vivo=t=>{for(const [i,m] of mats.entries()){const k=Math.max(0,1-Math.abs(((t*1.4-i/n*3)%3+3)%3-.2)*1.6);m.color.copy(base).lerp(alto,k);}};
  r.userData.radioVivo=largo;return r;
}
