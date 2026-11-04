import * as T from '../engine/three.js';
export function volumenRedondeado(w,h,d,r=.06) {
  r=Math.min(r,w/4,h/4,d/4);const x=-w/2+r,y=-h/2+r,a=w-2*r,b=h-2*r;
  const s=new T.Shape();s.moveTo(x,y);s.lineTo(x+a,y);s.quadraticCurveTo(x+a+r,y,x+a+r,y+r);s.lineTo(x+a+r,y+b-r);s.quadraticCurveTo(x+a+r,y+b,x+a,y+b);s.lineTo(x,y+b);s.quadraticCurveTo(x-r,y+b,x-r,y+b-r);s.lineTo(x-r,y+r);s.quadraticCurveTo(x-r,y,x,y);
  const g=new T.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r,curveSegments:4});g.translate(0,0,-d/2+r);g.computeVertexNormals();return g;
}
