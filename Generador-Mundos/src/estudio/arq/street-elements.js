// Mobiliario urbano paramétrico (origen en el suelo, +Z hacia la calzada o el frente).
import * as THREE from 'three';
import {SURF} from '../geom/mesh.js';
import {registerBuilders,cube,tinted,pane,WHITE,IRON} from './elements.js';

const C=hex=>new THREE.Color(hex);

function lamp(mb,o){
  const style=o.style??'fernandino';
  if(style==='fernandino'){
    // Farola fernandina madrileña: basamento, fuste estriado, brazo y farol.
    const k=IRON;
    mb.cylinder(0,0,0,.24,.5,8,k,SURF.metal,{r2:.18});
    mb.cylinder(0,.5,0,.1,2.6,8,k,SURF.metal,{r2:.07});
    for(const y of [.55,1.4,3.05])mb.cylinder(0,y,0,.14,.08,8,k,SURF.metal);
    mb.cylinder(0,3.1,0,.06,.6,6,k,SURF.metal,{r2:.05});
    // farol
    mb.cylinder(0,3.65,0,.08,.15,6,k,SURF.metal,{r2:.22});
    pane(mb,-.17,3.8,.17,4.25,.17,C('#fff1c4'),SURF.emissive);
    for(let a=0;a<4;a++){const ang=a*Math.PI/2;mb.box(Math.sin(ang)*.17,4.02,Math.cos(ang)*.17,.17,.23,.012,ang,C('#fff1c4'),SURF.emissive);}
    for(const [x,z]of [[-.18,-.18],[.18,-.18],[.18,.18],[-.18,.18]])mb.box(x,4.02,z,.018,.24,.018,0,k,SURF.metal);
    mb.cylinder(0,4.25,0,.28,.25,8,k,SURF.metal,{r2:.04});
    mb.cylinder(0,4.5,0,.03,.18,6,k,SURF.metal,{r2:.01});
    return;
  }
  if(style==='doble'){
    mb.cylinder(0,0,0,.14,.4,8,IRON,SURF.metal,{r2:.11});
    mb.cylinder(0,.4,0,.07,4.6,8,IRON,SURF.metal,{r2:.05});
    for(const s of [-1,1]){mb.box(s*.45,4.9,0,.45,.03,.03,0,IRON,SURF.metal);
      mb.cylinder(s*.85,4.55,0,.12,.35,8,IRON,SURF.metal,{r2:.18});pane(mb,s*.85-.12,4.6,s*.85+.12,4.85,.13,C('#fff1c4'),SURF.emissive);mb.cylinder(s*.85,4.88,0,.22,.12,8,IRON,SURF.metal,{r2:.03});}
    return;
  }
  // Moderna: báculo gris con luminaria hacia la calzada (+Z)
  const g=C('#8c9299');
  mb.cylinder(0,0,0,.12,.3,8,g,SURF.metal,{r2:.1});
  mb.cylinder(0,.3,0,.08,7.4,8,g,SURF.metal,{r2:.05});
  mb.box(0,7.7,.7,.04,.04,.75,0,g,SURF.metal);
  mb.box(0,7.65,1.5,.18,.06,.38,0,g,SURF.metal);
  mb.quad([.16,7.585,1.15],[-.16,7.585,1.15],[-.16,7.585,1.85],[.16,7.585,1.85],C('#fff6da'),SURF.emissive,[0,-1,0]);
}

function trafficLight(mb,o){
  const g=C(o.color??'#3c4046');
  mb.cylinder(0,0,0,.08,3.2,8,g,SURF.metal,{r2:.06});
  cube(mb,-.17,2.2,.04,.17,3.2,.32,g,SURF.metal);
  for(const [y,c]of [[3.0,'#e0463c'],[2.7,'#e8b23a'],[2.4,'#3fbf6a']]){
    mb.cylinder(0,y-.11,.33,.11,.01,8,C(c),SURF.emissive);
    cube(mb,-.13,y+.1,.32,.13,y+.13,.45,g,SURF.metal);
  }
  // semáforo peatonal
  cube(mb,-.12,1.9,-.28,.12,2.2,-.05,g,SURF.metal);
  pane(mb,-.08,2.0,.08,2.14,-.04,C('#3fbf6a'),SURF.emissive);
}

function bench(mb,o){
  const wood=WHITE,legs=IRON,w=o.w??1.8;
  tinted(mb,()=>{for(let k=0;k<3;k++)cube(mb,-w/2,.42,-.22+k*.15,w/2,.46,-.12+k*.15,wood,SURF.trim);
    for(let k=0;k<2;k++)cube(mb,-w/2,.58+k*.17,-.3-k*.03,w/2,.68+k*.17,-.26-k*.03,wood,SURF.trim);});
  for(const x of [-w/2+.15,w/2-.15]){cube(mb,x-.03,0,-.25,x+.03,.42,-.19,legs,SURF.metal);cube(mb,x-.03,0,.12,x+.03,.42,.18,legs,SURF.metal);cube(mb,x-.03,.42,-.32,x+.03,.88,-.26,legs,SURF.metal);cube(mb,x-.03,.62,-.26,x+.03,.66,.12,legs,SURF.metal);}
}

function bollard(mb){mb.cylinder(0,0,0,.08,.85,8,IRON,SURF.metal,{r2:.07});mb.dome(0,.85,0,.08,.06,8,2,IRON,SURF.metal);mb.cylinder(0,.7,0,.09,.04,8,C('#c9a24a'),SURF.metal);}

function bin(mb){
  const g=C('#3e5e48');
  mb.cylinder(0,.25,0,.035,.8,6,IRON,SURF.metal);
  mb.cylinder(.0,.45,.22,.2,.6,10,g,SURF.metal,{r2:.22,bottom:true});
}

function fountain(mb,o){
  const r=o.r??2.5,s=C(o.stone??'#e6dcc8');
  mb.cylinder(0,0,0,r,.55,24,s,SURF.trim,{top:false});
  mb.cylinder(0,0,0,r-.25,.5,24,s,SURF.trim,{top:false});
  mb.polygon(Array.from({length:24},(_,i)=>[Math.cos(i/24*Math.PI*2)*(r-.25),Math.sin(i/24*Math.PI*2)*(r-.25)]).reverse(),[],.38,C('#58a9d3'),SURF.water);
  // corona superior
  const ring=[];for(let i=0;i<24;i++)ring.push(i);
  for(let i=0;i<24;i++){const a0=i/24*Math.PI*2,a1=(i+1)/24*Math.PI*2,p=(a,rr)=>[Math.cos(a)*rr,.55,Math.sin(a)*rr];
    mb.quad(p(a0,r-.25),p(a1,r-.25),p(a1,r),p(a0,r),s,SURF.trim,[0,1,0]);}
  mb.cylinder(0,.38,0,.35,1.4,10,s,SURF.trim,{r2:.22});
  mb.cylinder(0,1.75,0,.9,.18,14,s,SURF.trim,{r2:1.0});
  mb.cylinder(0,1.93,0,.12,.7,8,s,SURF.trim,{r2:.08});
  mb.dome(0,2.6,0,.25,.3,8,3,s,SURF.trim);
}

function statue(mb,o){
  const s=C(o.stone??'#d9cfbd'),bronze=C('#5f6b5a');
  mb.box(0,.2,0,1.0,.2,1.0,0,s,SURF.trim);mb.box(0,1.3,0,.7,.9,.7,0,s,SURF.trim);mb.box(0,2.25,0,.8,.06,.8,0,s,SURF.trim);
  // figura abstracta en bronce (jinete o personaje)
  mb.cylinder(0,2.3,0,.28,1.1,8,bronze,SURF.metal,{r2:.2});mb.dome(0,3.4,0,.2,.25,8,3,bronze,SURF.metal);
  mb.box(.25,2.95,0,.25,.07,.07,.3,bronze,SURF.metal);
}

function busStop(mb){
  const g=C('#4b5560'),glass=C('#9cc1d6');
  for(const x of [-1.8,1.8])cube(mb,x-.05,0,-.65,x+.05,2.5,-.55,g,SURF.metal);
  cube(mb,-2.0,2.5,-.8,2.0,2.62,.6,g,SURF.metal);
  pane(mb,-1.75,.3,1.75,2.4,-.6,glass,SURF.glass);
  tinted(mb,()=>cube(mb,1.85,.4,-.6,1.9,2.2,.4,WHITE,SURF.trim));
  cube(mb,-1.4,.45,-.55,1.0,.5,-.25,C('#b8bcc0'),SURF.metal);
}

function kiosk(mb){
  const g=C('#2f5e4a');
  cube(mb,-1.2,0,-1,1.2,2.4,1,g,SURF.wall);
  pane(mb,-1.0,.9,1.0,2.1,1.001,C('#e8d9b8'),SURF.trim);
  cube(mb,-1.45,2.4,-1.25,1.45,2.6,1.4,g,SURF.metal);
  tinted(mb,()=>cube(mb,-1.2,2.6,-.4,1.2,3.0,.4,WHITE,SURF.trim));
}

function alcorque(mb,o){
  const s=o.s??1.2,e=C('#b8b0a2'),earth=C('#6b5a48');
  mb.quad([-s/2,.012,s/2],[s/2,.012,s/2],[s/2,.012,-s/2],[-s/2,.012,-s/2],earth,SURF.ground,[0,1,0]);
  for(const [x0,z0,x1,z1]of [[-s/2-.08,-s/2-.08,s/2+.08,-s/2],[-s/2-.08,s/2,s/2+.08,s/2+.08],[-s/2-.08,-s/2,-s/2,s/2],[s/2,-s/2,s/2+.08,s/2]])cube(mb,x0,0,z0,x1,.03,z1,e,SURF.paving);
}

function planter(mb,o){
  const w=o.w??1.6,d=o.d??.6,h=o.h??.6;
  tinted(mb,()=>cube(mb,-w/2,0,-d/2,w/2,h,d/2,WHITE,SURF.trim));
  mb.quad([-w/2+.05,h-.05,d/2-.05],[w/2-.05,h-.05,d/2-.05],[w/2-.05,h-.05,-d/2+.05],[-w/2+.05,h-.05,-d/2+.05],C('#6b5a48'),SURF.ground,[0,1,0]);
}

function metro(mb,o){
  // Acceso de metro: barandilla en U y poste con rombo/letrero.
  const g=C('#3a3d42');
  for(const x of [-1.1,1.1])cube(mb,x-.03,0,-3,x+.03,1.0,0,g,SURF.metal);
  cube(mb,-1.1,.95,-.05,1.1,1.0,0,g,SURF.metal);
  cube(mb,1.25,0,-.1,1.32,2.6,-.03,g,SURF.metal);
  tinted(mb,()=>{cube(mb,1.0,2.3,-.12,1.6,2.9,-.04,WHITE,SURF.trim);});
  pane(mb,1.05,2.45,1.55,2.75,-.035,C('#f4f1ea'),SURF.trim);
  // escalera descendente (huella oscura)
  mb.quad([-1.05,.01,-2.9],[1.05,.01,-2.9],[1.05,.01,-.05],[-1.05,.01,-.05].map(v=>v),C('#3b3b40'),SURF.paving,[0,1,0]);
}

function flagpole(mb,o){
  mb.cylinder(0,0,0,.06,o.h??8,8,C('#c9ccd0'),SURF.metal,{r2:.035});
  tinted(mb,()=>pane(mb,.04,(o.h??8)-1.6,1.9,(o.h??8)-.4,0,WHITE,SURF.trim));
  tinted(mb,()=>pane(mb,1.9,(o.h??8)-1.6,.04,(o.h??8)-.4,-.002,WHITE,SURF.trim));
}

function bikes(mb){for(let k=-2;k<=2;k++){const x=k*.8;cube(mb,x-.02,0,-.4,x+.02,.8,-.36,IRON,SURF.metal);cube(mb,x-.02,0,.36,x+.02,.8,.4,IRON,SURF.metal);cube(mb,x-.02,.76,-.4,x+.02,.8,.4,IRON,SURF.metal);}}

// Coche aparcado: perfil lateral extruido (sedán, utilitario o furgoneta), lunas inclinadas, ruedas.
// +Z = frente del coche. Tinte 1 = carrocería.
function parkedCar(mb,o){
  const kind=o.kind??(o.l<4?'hatch':'sedan'),l=o.l??4.3,w=1.78;
  const H=kind==='van'?1.95:kind==='hatch'?1.48:1.44;
  const z=f=>-l/2+f*l;
  // perfil (z,y) de atrás hacia delante; cada tramo: [z,y,parte]
  const P=kind==='van'?[[z(0),.32],[z(0),1.0],[z(.02),H-.05],[z(.05),H],[z(.7),H],[z(.82),1.2],[z(.92),.98],[z(1),.88],[z(1),.32]]
    :kind==='hatch'?[[z(0),.32],[z(0),.95],[z(.06),1.3],[z(.12),H],[z(.62),H],[z(.78),1.0],[z(1),.86],[z(1),.32]]
    :[[z(0),.32],[z(0),.9],[z(.12),.98],[z(.27),H],[z(.6),H],[z(.76),1.0],[z(1),.85],[z(1),.32]];
  const glassSeg=kind==='van'?[4,5]:kind==='hatch'?[1,2,4,5]:[2,4];
  const body=WHITE,glass=C('#33414f'),dark=C('#26272b');
  mb.setTint(1);
  // techo y frentes: quads entre puntos consecutivos del perfil a lo ancho
  for(let i=0;i<P.length-1;i++){
    const [z0,y0]=P[i],[z1,y1]=P[i+1],isG=glassSeg.includes(i);
    const inset=isG?.12:0;
    mb.quad([-w/2+inset,y0,z0],[-w/2+inset,y1,z1],[w/2-inset,y1,z1],[w/2-inset,y0,z0],isG?glass:body,isG?SURF.glass:SURF.metal);
    if(isG){mb.quad([-w/2,y0,z0],[-w/2,y1,z1],[-w/2+inset,y1,z1],[-w/2+inset,y0,z0],body,SURF.metal);mb.quad([w/2-inset,y0,z0],[w/2-inset,y1,z1],[w/2,y1,z1],[w/2,y0,z0],body,SURF.metal);}
  }
  mb.quad([-w/2,.32,z(1)],[-w/2,.32,z(0)],[w/2,.32,z(0)],[w/2,.32,z(1)],dark,SURF.metal);
  // laterales (polígono del perfil) con la banda de ventanillas
  const outline=P.map(([zz,yy])=>[zz,yy]);
  const tris=THREE.ShapeUtils.triangulateShape(outline.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  for(const sg of [-1,1])for(const [a,b,c]of tris){const A=[sg*w/2,outline[a][1],outline[a][0]],B=[sg*w/2,outline[b][1],outline[b][0]],Cc=[sg*w/2,outline[c][1],outline[c][0]];
    const cr=(B[2]-A[2])*(Cc[1]-A[1])-(B[1]-A[1])*(Cc[2]-A[2]);
    if((cr<0)===(sg>0))mb.tri(A,B,Cc,body,SURF.metal,[sg,0,0]);else mb.tri(A,Cc,B,body,SURF.metal,[sg,0,0]);}
  mb.setTint(0);
  const wy0=kind==='van'?1.22:1.04,wy1=H-.08,wz0=kind==='van'?z(.1):z(kind==='hatch'?.16:.3),wz1=kind==='van'?z(.68):z(kind==='hatch'?.6:.62);
  for(const sg of [-1,1])mb.quad(sg>0?[sg*(w/2+.005),wy0,wz1]:[sg*(w/2+.005),wy0,wz0],sg>0?[sg*(w/2+.005),wy0,wz0]:[sg*(w/2+.005),wy0,wz1],sg>0?[sg*(w/2+.005),wy1,wz0]:[sg*(w/2+.005),wy1,wz1],sg>0?[sg*(w/2+.005),wy1,wz1]:[sg*(w/2+.005),wy1,wz0],glass,SURF.glass,[sg,0,0]);
  // ruedas octogonales
  const R=.33,seg=8,tw=.24;
  for(const zc of [z(.18),z(.8)])for(const sg of [-1,1]){
    const x0=sg*(w/2-.02),x1=sg*(w/2-.02-tw);
    for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,p=(a,x)=>[x,R+Math.sin(a)*R,zc+Math.cos(a)*R];
      if(sg>0)mb.quad(p(a0,x0),p(a1,x0),p(a1,x1),p(a0,x1),dark,SURF.metal);else mb.quad(p(a0,x1),p(a1,x1),p(a1,x0),p(a0,x0),dark,SURF.metal);
      mb.tri([x0,R,zc],p(sg>0?a1:a0,x0),p(sg>0?a0:a1,x0),C('#b9bec4'),SURF.metal,[sg,0,0]);}
  }
  // faros y pilotos
  pane(mb,-w/2+.12,.66,-w/2+.45,.8,z(1)+.002,C('#fff3d0'),SURF.emissive);pane(mb,w/2-.45,.66,w/2-.12,.8,z(1)+.002,C('#fff3d0'),SURF.emissive);
  mb.quad([w/2-.12,.7,z(0)-.002],[w/2-.42,.7,z(0)-.002],[w/2-.42,.84,z(0)-.002],[w/2-.12,.84,z(0)-.002],C('#c8302b'),SURF.emissive,[0,0,-1]);
  mb.quad([-w/2+.42,.7,z(0)-.002],[-w/2+.12,.7,z(0)-.002],[-w/2+.12,.84,z(0)-.002],[-w/2+.42,.84,z(0)-.002],C('#c8302b'),SURF.emissive,[0,0,-1]);
}

registerBuilders({lamp,trafficLight,bench,bollard,bin,fountain,statue,busStop,kiosk,alcorque,planter,metro,flagpole,bikes,parkedCar});
