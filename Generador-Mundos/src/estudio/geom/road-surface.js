export function sampleRoad(points,step=4){
  const out=[];let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.001)continue;
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,n=Math.max(1,Math.ceil(length/step));
    for(let k=0;k<n;k++){const t=k/n;out.push({x:a[0]+dx*length*t,z:a[1]+dz*length*t,dx,dz,s:distance+length*t});}distance+=length;
  }
  if(points.length){const last=points.at(-1),a=out.at(-1);out.push({x:last[0],z:last[1],dx:a?.dx??1,dz:a?.dz??0,s:distance});}
  return out;
}
export function roadHeightFunction(road,terrain,length){
  const h0=terrain.height(...road.points[0]),h1=terrain.height(...road.points.at(-1)),lift=road.layer>0?Math.max(0,road.layer*5.5-1):0;
  return point=>{const t=length>0?point.s/length:0,base=h0+(h1-h0)*t;
    if(road.tunnel&&road.renderTunnel)return base-(road.depth??6)*Math.sin(Math.PI*t)+.15;
    return Math.max(base,terrain.height(point.x,point.z)+.2)+lift*Math.sin(Math.PI*Math.min(1,t*1.15))+Math.sin(Math.PI*t)*(Math.min(1.2,length*.02)+(road.elevationOffset??0))+.15;
  };
}
export function surfaceHeightAt(surfaces,x,z,reference,fallback){
  let result=fallback;
  for(const surface of surfaces??[])for(let i=1;i<surface.points.length;i++){
    const a=surface.points[i-1],b=surface.points[i],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;if(!l2)continue;
    const u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2)),distance=Math.hypot(x-a.x-dx*u,z-a.z-dz*u);
    if(distance>surface.width/2-.1)continue;
    const y=a.y+(b.y-a.y)*u;
    if(surface.kind==='tunnel'){if(Math.abs(y-reference)<.8)result=y;}
    else if(y<=reference+.4&&y>=result-.1)result=y;
  }
  return result;
}
import {offsetLines,union} from './clip.js';

export function tunnelGroundHoles(model){
  const holes=[];
  for(const road of model.roads.filter(r=>r.tunnel&&r.renderTunnel)){
    const points=sampleRoad(road.points,2),length=points.at(-1)?.s??0,depth=road.depth??6;
    const mouth=Math.min(length*.3,Math.max(2,length*Math.asin(Math.min(.95,1.9/depth))/Math.PI));
    for(const samples of [points.filter(p=>p.s<=mouth),points.filter(p=>p.s>=length-mouth)])if(samples.length>=2)holes.push(...offsetLines([{points:samples.map(p=>[p.x,p.z]),width:road.width+1}]));
  }
  return holes.length?union(holes):[];
}
