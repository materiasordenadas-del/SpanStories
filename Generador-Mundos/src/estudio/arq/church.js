// Iglesias: nave con cubierta a dos aguas, fachada con portada abocinada y rosetón,
// torre campanario con troneras y chapitel, cúpula sobre tambor en las grandes, contrafuertes.
import * as THREE from 'three';
import {SURF,shade} from '../geom/mesh.js';
import {ROOF} from '../geom/palette.js';
import {pick,range} from '../data/rng.js';
import {obb,inPoly} from './buildings.js';
import {wallColour,roofColour} from './appearance.js';
import {appearancePolicy} from '../data/appearance-policy.js';

const col=hex=>new THREE.Color(hex);
const STONE=['#ddd0b5','#d6c6a6','#e6dbc5','#cdbb98','#e9e0cf','#f1ead9'];

export function buildChurch(pb,mb,ctx,recorded=null){
  const {b,r,rings}=pb,{inst,T}=ctx,outer=rings[0];
  const stone=wallColour(b,col(pick(r,STONE))),trim=shade(stone,1.07),dark=shade(stone,.86);
  const box=obb(outer),fill=b.area/Math.max(1,box.area);
  const H=pb.top-pb.base,He=Math.min(H,Math.max(8,Math.min(16,box.wid*.9)));
  const yb=pb.base,y0=pb.gmin-.6,ye=yb+He;
  // Muros de la nave sobre la huella real
  for(const ring of rings)for(let i=0;i<ring.length;i++){
    const a=ring[i],c=ring[(i+1)%ring.length],dx=c[0]-a[0],dz=c[1]-a[1],L=Math.hypot(dx,dz)||1,n=[dz/L,-dx/L];
    mb.quad([c[0],y0,c[1]],[a[0],y0,a[1]],[a[0],ye,a[1]],[c[0],ye,c[1]],stone,SURF.wall,[n[0],0,n[1]]);
    // zócalo y cornisa
    const off=(p,d)=>[p[0]+n[0]*d,p[1]+n[1]*d];
    for(const [ya,yb2,d,cc]of [[y0,yb+1.1,.08,dark],[ye-.5,ye,.35,trim]]){
      const A=off(a,d),C=off(c,d);
      mb.quad([C[0],ya,C[1]],[A[0],ya,A[1]],[A[0],yb2,A[1]],[C[0],yb2,C[1]],cc,SURF.trim,[n[0],0,n[1]]);
      mb.quad([c[0],yb2,c[1]],[C[0],yb2,C[1]],[A[0],yb2,A[1]],[a[0],yb2,a[1]],cc,SURF.trim,[0,1,0]);
    }
  }
  // Ejes de la nave
  const P=(u,v,y)=>{const w=box.W(u,v);return [w[0],y,w[1]];};
  const vm=(box.v0+box.v1)/2,um=(box.u0+box.u1)/2;
  // Frente: el extremo corto más cercano a una calle
  const endA=box.W(box.u0,vm),endB=box.W(box.u1,vm);
  const dA=ctx.roadDist(endA[0],endA[1]).d,dB=ctx.roadDist(endB[0],endB[1]).d;
  const frontU=dA<=dB?box.u0:box.u1,backU=dA<=dB?box.u1:box.u0,sgn=dA<=dB?-1:1; // sgn: dirección exterior del frente en u
  const uDir=[box.c,box.s],vDir=[-box.s,box.c];
  const yawFront=Math.atan2(uDir[0]*sgn,uDir[1]*sgn);
  // Cubierta a dos aguas sobre el rectángulo (si la huella lo permite)
  const roofC=roofColour(b,col(pick(r,ROOF.tile)));
  const kind=recorded?.kind??'gabled';
  if(kind==='barrel'&&fill>.6){
    // Bóveda de cañón sobre la nave (roof:shape=round/barrel), con testeros curvos de piedra.
    // Más de 22 m de ancho: tres naves (central más ancha), cada una con su bóveda.
    const ov=.3,v0=box.v0-ov,v1=box.v1+ov,u0=box.u0-ov*.5,u1=box.u1+ov*.5,N=10,wid=v1-v0;
    const naves=wid>22?[[v0,v0+wid*.3],[v0+wid*.3,v1-wid*.3],[v1-wid*.3,v1]]:[[v0,v1]];
    const vault=roofColour(b,col(pick(r,['#c9c3b8','#b8643f','#a9a399','#8e99a3'])));
    let crown=0;
    for(const [na,nb]of naves){const half=(nb-na)/2,mid=(na+nb)/2,rise=b.roof.height??Math.min(half*.6,6);crown=Math.max(crown,rise);
      const Y=v=>ye+rise*Math.sqrt(Math.max(0,1-((v-mid)/half)**2));
      for(let k=0;k<N;k++){const va=na+(nb-na)*k/N,vb=na+(nb-na)*(k+1)/N;
        mb.quad(P(u0,va,Y(va)),P(u0,vb,Y(vb)),P(u1,vb,Y(vb)),P(u1,va,Y(va)),vault,SURF.roof);
        for(const [u,sg]of [[box.u0,1],[box.u1,-1]]){const A=P(u,va,ye),B=P(u,vb,ye),Cc=P(u,vb,Y(vb)),D=P(u,va,Y(va));
          if(sg>0)mb.quad(A,B,Cc,D,stone,SURF.wall);else mb.quad(B,A,D,Cc,stone,SURF.wall);}}}
    mb.quad(P(u0,v0,ye-.02),P(u1,v0,ye-.02),P(u1,v1,ye-.02),P(u0,v1,ye-.02),shade(trim,.8),SURF.trim,[0,-1,0]);
    const cr=P(frontU,vm,ye+crown);
    mb.box(cr[0],cr[1]+.9,cr[2],.08,.9,.08,0,col('#3a3a3e'),SURF.metal);
    mb.box(cr[0],cr[1]+1.3,cr[2],.08,.08,.45,-box.ang,col('#3a3a3e'),SURF.metal);
  }else if(fill>.7&&kind!=='flat'&&kind!=='dome'&&box.wid>22){
    // Tres naves a dos aguas: la central más alta y ancha; frontones de piedra en los testeros.
    const ov=.35,v0=box.v0-ov,v1=box.v1+ov,u0=box.u0-ov*.5,u1=box.u1+ov*.5,wid=v1-v0,pitch=30*Math.PI/180;
    const naves=[[v0,v0+wid*.3,0],[v0+wid*.3,v1-wid*.3,1.2],[v1-wid*.3,v1,0]];
    let crown=0;
    for(const [na,nb,lift]of naves){const mid=(na+nb)/2,y=ye+lift,h=(nb-na)/2*Math.tan(pitch);crown=Math.max(crown,lift+h);
      const c00=P(u0,na,y),c10=P(u1,na,y),c11=P(u1,nb,y),c01=P(u0,nb,y),R0=P(u0,mid,y+h),R1=P(u1,mid,y+h);
      mb.quad(c00,R0,R1,c10,roofC,SURF.roof);mb.quad(c11,R1,R0,c01,roofC,SURF.roof);
      for(const [u,sg]of [[box.u0,-1],[box.u1,1]]){const A=P(u,na,ye),B=P(u,nb,ye),Ay=P(u,na,y),By=P(u,nb,y),C=P(u,mid,y+h-.05);
        if(lift>0){if(sg>0)mb.quad(A,Ay,By,B,stone,SURF.wall);else mb.quad(B,By,Ay,A,stone,SURF.wall);}
        if(sg>0)mb.tri(Ay,C,By,stone,SURF.wall);else mb.tri(By,C,Ay,stone,SURF.wall);}
      // claristorio: muros de la nave central por encima de las laterales
      if(lift>0)for(const v of [na,nb]){const a=P(u0,v,ye),b=P(u1,v,ye),c=P(u1,v,y+.05),d=P(u0,v,y+.05);mb.quad(a,b,c,d,stone,SURF.wall);mb.quad(b,a,d,c,stone,SURF.wall);}}
    mb.quad(P(u0,v0,ye-.02),P(u1,v0,ye-.02),P(u1,v1,ye-.02),P(u0,v1,ye-.02),shade(trim,.8),SURF.trim,[0,-1,0]);
    const cr=P(frontU,vm,ye+crown+.3);
    mb.box(cr[0],cr[1]+.9,cr[2],.08,.9,.08,0,col('#3a3a3e'),SURF.metal);
    mb.box(cr[0],cr[1]+1.3,cr[2],.08,.08,.45,-box.ang,col('#3a3a3e'),SURF.metal);
  }else if(fill>.7&&kind!=='flat'&&kind!=='dome'){
    const ov=.4,pitch=32*Math.PI/180,v0=box.v0-ov,v1=box.v1+ov,u0=box.u0-ov*.5,u1=box.u1+ov*.5,h=(v1-v0)/2*Math.tan(pitch);
    const c00=P(u0,v0,ye),c10=P(u1,v0,ye),c11=P(u1,v1,ye),c01=P(u0,v1,ye),R0=P(u0,vm,ye+h),R1=P(u1,vm,ye+h);
    mb.quad(c00,R0,R1,c10,roofC,SURF.roof);mb.quad(c11,R1,R0,c01,roofC,SURF.roof);
    // piñones de piedra en ambos extremos (frontón)
    for(const [u,s]of [[box.u0,-1],[box.u1,1]]){
      const A=P(u,box.v0,ye),B=P(u,box.v1,ye),C=P(u,vm,ye+h-.05);
      if(s>0)mb.tri(A,C,B,stone,SURF.wall);else mb.tri(B,C,A,stone,SURF.wall);
      // remate del frontón
      const Ct=P(u+s*.25,vm,ye+h+.25);
      const At=P(u+s*.25,box.v0-.3,ye),Bt=P(u+s*.25,box.v1+.3,ye);
      if(s>0){mb.quad(At,Ct,P(u-.2,vm,ye+h+.25),P(u-.2,box.v0-.3,ye),trim,SURF.trim);mb.quad(P(u-.2,box.v1+.3,ye),P(u-.2,vm,ye+h+.25),Ct,Bt,trim,SURF.trim);}
    }
    mb.quad(P(u0,v0,ye-.02),P(u1,v0,ye-.02),P(u1,v1,ye-.02),P(u0,v1,ye-.02),shade(trim,.8),SURF.trim,[0,-1,0]);
    // cruz sobre el frontón del frente
    const cr=P(frontU,vm,ye+h+.3);
    mb.box(cr[0],cr[1]+.9,cr[2],.08,.9,.08,0,col('#3a3a3e'),SURF.metal);
    mb.box(cr[0],cr[1]+1.3,cr[2],.08,.08,.45,-box.ang,col('#3a3a3e'),SURF.metal);
  }else{
    mb.polygon(outer,rings.slice(1),ye,roofColour(b,col(pick(r,ROOF.flat))),SURF.roof);
  }
  // Contrafuertes y ventanas en arco a lo largo de los costados
  const profile=b.facadeProfile??{},bays=Math.max(2,Math.floor((box.len-4)/(profile.bayWidth??4.5)));
  for(const side of [-1,1]){
    const v=side<0?box.v0:box.v1,nY=Math.atan2(vDir[0]*side,vDir[1]*side);
    for(let k=0;k<=bays;k++){
      const u=box.u0+2+k*(box.len-4)/bays;
      const p=P(u,v,0);if(!inPoly(p[0]-vDir[0]*side*.5,p[2]-vDir[1]*side*.5,rings))continue;
      mb.box(p[0]+vDir[0]*side*.45,yb+He*.4,p[2]+vDir[1]*side*.45,.35,He*.4+.6,.45,-box.ang,shade(stone,.97),SURF.wall);
      if(k<bays){const uw=u+(box.len-4)/bays/2,q=P(uw,v,yb+He*.32);
        inst.add('window',{w:profile.windowWidth??1.2,h:Math.min(profile.windowHeight??5,He*.5),arch:true,surround:{w:.22,depth:.2,color:'#'+trim.getHexString(),kind:'simple'},mullion:false,dark:true,noFanBars:true},q,nY,col('#3a3a3e'));}
    }
  }
  // Portada y rosetón en el frente
  const fp=P(frontU,vm,0),gy=ctx.groundHeightAt(fp[0]+Math.sin(yawFront)*.25,fp[2]+Math.cos(yawFront)*.25)+(b.baseOffset??0);
  inst.add('door',{kind:'church',w:profile.doorWidth??2.4,h:Math.min(profile.doorHeight??4.6,He-.5),arch:true,stoneColor:'#'+trim.getHexString()},[fp[0],gy,fp[2]],yawFront,col('#4a3426'));
  if(He>9)inst.add('rose',{r:Math.min(2.2,box.wid*.17)},[fp[0],yb+He*.72,fp[2]],yawFront,col('#3a3a3e'));
  // Fachada ancha (tres naves): portadas laterales y pilastras que marcan las naves.
  if(box.wid>22){
    for(const sv of [-1,1]){const q=P(frontU,vm+sv*box.wid*.35,0),qy=ctx.groundHeightAt(q[0]+Math.sin(yawFront)*.25,q[2]+Math.cos(yawFront)*.25)+(b.baseOffset??0);
      inst.add('door',{kind:'church',w:(profile.doorWidth??2.4)*.75,h:Math.min((profile.doorHeight??4.6)*.8,He-.5),arch:true,stoneColor:'#'+trim.getHexString()},[q[0],qy,q[2]],yawFront,col('#4a3426'));
      if(He>9)inst.add('window',{w:1.3,h:Math.min(3.2,He*.22),arch:true,surround:{w:.22,depth:.2,color:'#'+trim.getHexString(),kind:'simple'},mullion:false,dark:true,noFanBars:true},[q[0],yb+He*.62,q[2]],yawFront,col('#3a3a3e'));}
    for(const t of [-.5,-.2,.2,.5]){const q=P(frontU,vm+t*box.wid,0);mb.box(q[0],(y0+ye)/2,q[2],.3,(ye-y0)/2,.5,-box.ang,trim,SURF.trim);}
  }
  // Torre campanario en una esquina del frente
  if(appearancePolicy(b).allowInferredVolumes&&box.area>220&&r()<.85){
    const s=Math.min(6.5,Math.max(4,box.wid*.32)),side=r()<.5?-1:1;
    const tv=side<0?box.v0+s/2:box.v1-s/2,tu=frontU-sgn*s/2;
    const c=P(tu,tv,0),tH=He+range(r,8,15),yT=yb+tH;
    mb.box(c[0],(y0+yT)/2,c[2],s/2,(yT-y0)/2,s/2,-box.ang,stone,SURF.wall);
    for(const yy of [yb+He*.5,yb+He+.5,yT-4.2])mb.box(c[0],yy,c[2],s/2+.12,.18,s/2+.12,-box.ang,trim,SURF.trim);
    mb.box(c[0],yT+.15,c[2],s/2+.3,.15,s/2+.3,-box.ang,trim,SURF.trim);
    // troneras (campanas) en las 4 caras
    for(let k=0;k<4;k++){const a=-box.ang+k*Math.PI/2,nx=Math.sin(a),nz=Math.cos(a);
      inst.add('window',{w:Math.min(1.6,s*.35),h:2.8,arch:true,surround:{w:.25,depth:.18,color:'#'+trim.getHexString(),kind:'simple'},mullion:false,dark:true,sill:true,noFanBars:true},[c[0]+nx*s/2,yT-3.9,c[2]+nz*s/2],a,col('#3a3a3e'));}
    // chapitel
    const spire=r()<.55,sh=spire?s*1.6:s*.6;
    const top=[c[0],yT+.3+sh,c[2]];
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,bb])=>{const w=box.W(tu+a*(s/2+.2),tv+bb*(s/2+.2));return [w[0],yT+.3,w[1]];});
    const roofT=roofColour(b,spire?col(pick(r,ROOF.slate)):roofC);
    for(let k=0;k<4;k++){const A=corners[k],B=corners[(k+1)%4];mb.tri(B,A,top,roofT,SURF.roof);}
    mb.box(top[0],top[1]+.8,top[2],.07,.8,.07,0,col('#3a3a3e'),SURF.metal);
    mb.box(top[0],top[1]+1.15,top[2],.07,.07,.4,-box.ang,col('#3a3a3e'),SURF.metal);
  }
  // Cúpula sobre el crucero
  if(appearancePolicy(b).allowInferredVolumes&&b.area>700||b.roof.shape==='dome'){
    const cu=um+(backU-um)*.35,c=P(cu,vm,0),rd=Math.min(box.wid*.32,9),yD=ye+(fill>.7?(box.wid/2)*Math.tan(32*Math.PI/180)*.6:0);
    mb.cylinder(c[0],ye-1,c[2],rd,yD-ye+3.5,16,stone,SURF.wall);
    mb.cylinder(c[0],yD+2.5,c[2],rd+.25,.35,16,trim,SURF.trim);
    for(let k=0;k<8;k++){const a=k/8*Math.PI*2;inst.add('window',{w:.9,h:1.6,arch:true,surround:null,mullion:false,dark:true,sill:false,noFanBars:true},[c[0]+Math.cos(a)*rd,yD+.4,c[2]+Math.sin(a)*rd],Math.atan2(Math.cos(a),Math.sin(a)),col('#3a3a3e'));}
    mb.dome(c[0],yD+2.85,c[2],rd,rd*.95,18,7,roofColour(b,col(pick(r,['#7f9a9a','#b8643f','#c9c3b8','#6f8f9a']))),SURF.roof);
    mb.cylinder(c[0],yD+2.85+rd*.95-.2,c[2],rd*.16,1.6,10,trim,SURF.trim);
    mb.dome(c[0],yD+2.85+rd*.95+1.4,c[2],rd*.18,rd*.2,10,3,col('#7f9a9a'),SURF.roof);
    mb.box(c[0],yD+2.85+rd*1.15+2.1,c[2],.06,.7,.06,0,col('#3a3a3e'),SURF.metal);
  }
}
