// Más elementos: soportales (arcos o dinteles con pilares), pilar suelto y mesas de terraza.
import * as THREE from 'three';
import {SURF} from '../geom/mesh.js';
import {registerBuilders,cube,tinted,pane,archRing,WHITE,TINT2,IRON} from './elements.js';

const C=hex=>new THREE.Color(hex);

// Polígono vertical (plano XY, mirando a +Z).
function frontPolygon(mb,outer,z,col,surf){
  const tris=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  for(const [i,j,k]of tris){let a=outer[i],b=outer[j],c=outer[k];
    if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0)[b,c]=[c,b];
    mb.tri([a[0],a[1],z],[b[0],b[1],z],[c[0],c[1],z],col,surf,[0,0,1]);}
}

// Tramo de soportal: pilar a la izquierda, arco de medio punto (o dintel), enjuta y techo.
// Origen en la línea de fachada al nivel del suelo; el pórtico entra hacia -Z (profundidad d).
// Tinte 1 = color del muro (enjuta y techo); tinte 2 = piedra (pilar, imposta, rosca del arco).
function arcadeBay(mb,o){
  const {w,h,depth:d}=o,pw=o.pillar??.62,arch=o.arch!==false,stone=TINT2;
  mb.setTint(1);
  cube(mb,-w/2,0,-pw-.02,-w/2+pw,h,0,stone,SURF.trim);
  cube(mb,-w/2-.06,0,-pw-.08,-w/2+pw+.06,.35,.06,stone,SURF.trim);
  const xL=-w/2+pw,xR=w/2,span=xR-xL,cx=(xL+xR)/2;
  if(arch){
    const r=span/2,ys=Math.max(1.6,h-.6-r);
    cube(mb,-w/2-.06,ys-.2,-pw-.08,-w/2+pw+.06,ys,.06,stone,SURF.trim);
    const arc=[];for(let i=12;i>=0;i--){const a=Math.PI*i/12;arc.push([cx+Math.cos(a)*r,ys+Math.sin(a)*r]);}
    frontPolygon(mb,[...arc,[xR,h],[xL,h]],0,WHITE,SURF.wall);
    archRing(mb,cx,ys,r,.17,.64,-.62,stone,12);
    cube(mb,cx-.13,ys+r-.04,0,cx+.13,ys+r+.3,.08,stone,SURF.trim); // clave
  }else{
    frontPolygon(mb,[[xL,h-.65],[xR,h-.65],[xR,h],[xL,h]],0,WHITE,SURF.wall);
    cube(mb,xL,h-.7,-.62,xR,h-.65,.03,stone,SURF.trim);
    mb.quad([xR,h-.65,-.6],[xL,h-.65,-.6],[xL,h-.65,0],[xR,h-.65,0],WHITE,SURF.wall,[0,-1,0]);
  }
  mb.quad([-w/2,h-.02,-d],[w/2,h-.02,-d],[w/2,h-.02,0],[-w/2,h-.02,0],WHITE,SURF.wall,[0,-1,0]);
  mb.setTint(0);
}

function pillar(mb,o){
  const pw=o.pillar??.62;
  cube(mb,-pw/2,0,-pw-.02,pw/2,o.h,0,TINT2,SURF.trim);
  cube(mb,-pw/2-.06,0,-pw-.08,pw/2+.06,.35,.06,TINT2,SURF.trim);
}

// Mesa de terraza con sillas y, a veces, sombrilla (tinte 1 = sombrilla/sillas).
function terrace(mb,o){
  const metal=C('#9aa0a6');
  mb.cylinder(0,0,0,.25,.04,10,C('#7a7f86'),SURF.metal);
  mb.cylinder(0,.04,0,.035,.68,6,metal,SURF.metal);
  mb.cylinder(0,.72,0,.38,.03,12,C('#f1efe9'),SURF.trim);
  const n=o.chairs??4;
  for(let k=0;k<n;k++){
    const a=k/n*Math.PI*2+Math.PI/4,x=Math.cos(a)*.62,z=Math.sin(a)*.62;
    tinted(mb,()=>{mb.box(x,.45,z,.22,.025,.22,-a,WHITE,SURF.trim);
      mb.box(x+Math.cos(a)*.2,.68,z+Math.sin(a)*.2,.03,.23,.22,-a,WHITE,SURF.trim);});
    for(const [dx,dz]of [[-.17,-.17],[.17,-.17],[.17,.17],[-.17,.17]]){const ca=Math.cos(-a),sa=Math.sin(-a);
      mb.box(x+dx*ca+dz*sa,.22,z-dx*sa+dz*ca,.012,.22,.012,0,metal,SURF.metal);}
  }
  if(o.umbrella){
    mb.cylinder(0,.75,0,.025,1.6,6,metal,SURF.metal);
    tinted(mb,()=>{const R=1.25,y=2.35;for(let k=0;k<8;k++){const a0=k/8*Math.PI*2,a1=(k+1)/8*Math.PI*2;
      const A=[Math.cos(a0)*R,y,Math.sin(a0)*R],B=[Math.cos(a1)*R,y,Math.sin(a1)*R],T=[0,y+.42,0];
      mb.tri(B,A,T,WHITE,SURF.trim);mb.tri(A,B,[0,y+.05,0],WHITE,SURF.trim);
      mb.quad(A,B,[B[0],y-.18,B[2]],[A[0],y-.18,A[2]],WHITE,SURF.trim);}});
  }
}

// Valla de forja / jardín (tramo de 2,5 m): postes, barrotes y pasamanos.
function fence(mb,o){
  const L=2.5,h=o.h??1.4,c=o.kind==='wood'?C('#8b6a4a'):IRON;
  cube(mb,-L/2,0,-.05,-L/2+.08,h+.12,.05,c,SURF.metal);
  cube(mb,-L/2,h-.04,-.025,L/2,h,.025,c,SURF.metal);cube(mb,-L/2,.12,-.025,L/2,.16,.025,c,SURF.metal);
  for(let x=-L/2+.16;x<L/2;x+=.13)cube(mb,x-.012,.0,-.012,x+.012,h+.08,.012,c,SURF.metal,false);
}

registerBuilders({arcadeBay,pillar,terrace,fence});
