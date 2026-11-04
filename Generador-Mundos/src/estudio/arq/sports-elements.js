// Equipamiento deportivo y escolar: canastas, porterías, red de tenis, gradas, columpios, tobogán,
// corcheras y poyetes de piscina, mástiles, marquesina de patio y reloj de fachada.
import * as THREE from 'three';
import {SURF} from '../geom/mesh.js';
import {registerBuilders,cube,tinted,pane,WHITE,IRON} from './elements.js';

const C=hex=>new THREE.Color(hex);

// Canasta: poste a un lado, brazo, tablero y aro hacia +Z (hacia la pista).
function basketHoop(mb){
  const post=C('#2f5e8f'),board=C('#f5f3ee'),ring=C('#e0572e');
  cube(mb,-.09,0,-1.3,.09,3.4,-1.12,post,SURF.metal);
  cube(mb,-.06,3.2,-1.2,.06,3.3,0,post,SURF.metal);
  cube(mb,-.9,2.85,0,.9,3.9,.04,board,SURF.trim);
  for(const [x0,y0,x1,y1]of [[-.9,2.85,.9,2.9],[-.9,3.85,.9,3.9],[-.9,2.85,-.85,3.9],[.85,2.85,.9,3.9],[-.3,3.0,.3,3.03],[-.3,3.0,-.27,3.45],[.27,3.0,.3,3.45],[-.3,3.42,.3,3.45]])cube(mb,x0,y0,.04,x1,y1,.05,C('#d0573b'),SURF.trim,false);
  for(let k=0;k<12;k++){const a0=k/12*Math.PI*2,a1=(k+1)/12*Math.PI*2,R=.23,c=.27;
    mb.box((Math.cos(a0)+Math.cos(a1))/2*R,3.05,c+(Math.sin(a0)+Math.sin(a1))/2*R,.065,.012,.012,-(a0+a1)/2+Math.PI/2,ring,SURF.metal);}
  for(let k=0;k<8;k++){const a=k/8*Math.PI*2;cube(mb,Math.cos(a)*.2-.005,2.62,.27+Math.sin(a)*.2-.005,Math.cos(a)*.2+.005,3.05,.27+Math.sin(a)*.2+.005,WHITE,SURF.trim,false);}
}

// Portería (fútbol 7.32×2.44 o fútbol sala 3×2). La boca mira a +Z.
function goal(mb,o){
  const w=o.w??7.32,h=o.h??2.44,d=o.d??1.6,c=WHITE;
  cube(mb,-w/2-.06,0,-.06,-w/2+.06,h,.06,c,SURF.metal);cube(mb,w/2-.06,0,-.06,w/2+.06,h,.06,c,SURF.metal);
  cube(mb,-w/2-.06,h-.06,-.06,w/2+.06,h+.06,.06,c,SURF.metal);
  const net=C('#e8ecef');
  for(let x=-w/2;x<=w/2+.01;x+=.5)cube(mb,x-.008,0,-d,x+.008,h*.8,-d+.016,net,SURF.metal,false);
  for(let y=.3;y<=h*.8;y+=.4)cube(mb,-w/2,y-.008,-d,w/2,y+.008,-d+.016,net,SURF.metal,false);
  for(const sx of [-1,1]){cube(mb,sx*w/2-.02,0,-d,sx*w/2+.02,.04,0,c,SURF.metal);cube(mb,sx*w/2-.02,h*.8,-d,sx*w/2+.02,h*.8+.04,0,c,SURF.metal);
    mb.quad([sx*w/2,h,0],[sx*w/2,h*.8,-d],[sx*w/2,0,-d],[sx*w/2,0,0].map(v=>v),net,SURF.metal);}
}

function tennisNet(mb,o){
  const w=o.w??12.8;
  for(const sx of [-1,1])mb.cylinder(sx*w/2,0,0,.05,1.07,6,IRON,SURF.metal);
  pane(mb,-w/2,.05,w/2,1.0,0,C('#3a3d42'),SURF.metal);
  cube(mb,-w/2,.96,-.02,w/2,1.02,.02,WHITE,SURF.trim);
}

// Gradas: n escalones de 0,8 m de fondo; el frente mira a +Z.
function bleachers(mb,o){
  const w=o.w??12,n=o.rows??4,c=C('#cfc8bb'),seat=WHITE;
  for(let i=0;i<n;i++){const z0=-i*.8,y=i*.45;
    cube(mb,-w/2,0,z0-.8,w/2,y+.45,z0,c,SURF.trim);
    mb.setTint(1);cube(mb,-w/2+.05,y+.45,z0-.42,w/2-.05,y+.5,z0-.08,seat,SURF.trim);mb.setTint(0);}
  cube(mb,-w/2,0,-n*.8-.1,w/2,n*.45+1.1,-n*.8,c,SURF.trim);
}

function swing(mb){
  const f=C('#e0572e'),seat=C('#2f3237');
  for(const sx of [-1.6,1.6]){mb.box(sx,1.2,-.6,.05,1.25,.05,0,f,SURF.metal);mb.box(sx,1.2,.6,.05,1.25,.05,0,f,SURF.metal);}
  for(const [sx,z]of [[-1.6,-.6],[-1.6,.6],[1.6,-.6],[1.6,.6]]){const tilt=z>0?-.45:.45;}
  cube(mb,-1.7,2.38,-.05,1.7,2.46,.05,f,SURF.metal);
  for(const x of [-.7,.7]){cube(mb,x-.25,.42,-.12,x+.25,.46,.12,seat,SURF.trim);for(const dx of [-.22,.22])cube(mb,x+dx-.01,.46,-.01,x+dx+.01,2.38,.01,IRON,SURF.metal,false);}
}

function slide(mb){
  const c=C('#3d7dc2'),f=C('#e3b23c');
  cube(mb,-.6,1.4,-.6,.6,1.5,.6,f,SURF.trim);
  for(const [x,z]of [[-.55,-.55],[.55,-.55],[.55,.55],[-.55,.55]])cube(mb,x-.05,0,z-.05,x+.05,2.4,z+.05,f,SURF.metal);
  cube(mb,-.6,2.3,-.6,.6,2.4,.6,f,SURF.metal);
  mb.quad([-.4,1.5,.6],[.4,1.5,.6],[.4,.15,2.8],[-.4,.15,2.8],c,SURF.trim);
  for(const sx of [-.42,.4])mb.quad([sx,1.5,.6],[sx,1.75,.6],[sx,.4,2.8],[sx,.15,2.8],c,SURF.trim);
  for(let k=0;k<5;k++)cube(mb,-.3,.28*k+.1,-.6-.3*(5-k)/5,.3,.28*k+.14,-.55-.3*(5-k)/5+.08,IRON,SURF.metal);
}

function laneRope(mb,o){
  const L=o.l??25;
  for(let x=-L/2;x<L/2;x+=.5){const c=Math.floor((x+L/2)/2)%2?C('#d83b3b'):C('#f2f2f2');mb.cylinder(x+.25,.02,0,.06,.06,6,c,SURF.trim);}
}

function startBlock(mb){cube(mb,-.25,0,-.3,.25,.65,.1,C('#f2f2f2'),SURF.trim);cube(mb,-.25,.6,-.35,.25,.72,.15,C('#2f6e8f'),SURF.trim);}

// Marquesina de patio (pórtico de paso cubierto): tramo de 4 m con dos postes.
function canopy(mb,o){
  const w=o.w??4,d=o.d??3,h=o.h??2.8,c=WHITE;
  tinted(mb,()=>{for(const sx of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])cube(mb,sx-.06,0,z-.06,sx+.06,h,z+.06,c,SURF.metal);
    cube(mb,-w/2,h,-d/2,w/2,h+.12,d/2,c,SURF.metal);});
  mb.quad([-w/2,h+.121,d/2],[w/2,h+.121,d/2],[w/2,h+.121,-d/2],[-w/2,h+.121,-d/2],C('#9aa3ad'),SURF.metal,[0,1,0]);
}

// Reloj de fachada (escuelas, ayuntamientos): origen en el centro, mirando a +Z.
function clock(mb,o){
  const r=o.r??.7;
  mb.setTint(1);for(let k=0;k<20;k++){const a0=k/20*Math.PI*2,a1=(k+1)/20*Math.PI*2;
    mb.tri([0,0,.08],[Math.cos(a0)*r,Math.sin(a0)*r,.08],[Math.cos(a1)*r,Math.sin(a1)*r,.08],C('#f7f5ef'),SURF.trim,[0,0,1]);
    mb.quad([Math.cos(a1)*r,Math.sin(a1)*r,0],[Math.cos(a1)*r,Math.sin(a1)*r,.08],[Math.cos(a0)*r,Math.sin(a0)*r,.08],[Math.cos(a0)*r,Math.sin(a0)*r,0],WHITE,SURF.trim);}
  mb.setTint(0);
  for(let k=0;k<12;k++){const a=k/12*Math.PI*2;cube(mb,Math.cos(a)*r*.82-.025,Math.sin(a)*r*.82-.025,.08,Math.cos(a)*r*.82+.025,Math.sin(a)*r*.82+.025,.09,IRON,SURF.trim);}
  mb.box(Math.cos(1.2)*r*.25,Math.sin(1.2)*r*.25,.095,r*.27,.02,.005,-1.2,IRON,SURF.trim);
  mb.box(Math.cos(-.4)*r*.33,Math.sin(-.4)*r*.33,.1,r*.35,.012,.005,.4,IRON,SURF.trim);
}

// Rótulo de colegio sobre la puerta (placa con «letras»).
function schoolSign(mb,o){
  const w=o.w??4;
  tinted(mb,()=>cube(mb,-w/2,0,0,w/2,.7,.1,WHITE,SURF.trim));
  for(let x=-w/2+.3;x<w/2-.4;x+=.42)cube(mb,x,.22,.1,x+.3,.48,.12,C('#f7f3e8'),SURF.trim);
}

registerBuilders({basketHoop,goal,tennisNet,bleachers,swing,slide,laneRope,startBlock,canopy,clock,schoolSign});
