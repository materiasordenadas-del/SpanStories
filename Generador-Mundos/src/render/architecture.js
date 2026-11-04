import * as T from 'three';
import {TRIGUN as P} from './palette.js';
// All facade pieces use local metres. The urban generator owns footprint and yaw.
export function buildArchitecture(b,emit,box,gable,material,detail=true){
 const wall=material(P.walls[b.variant%P.walls.length]),roof=material(P.roof[b.variant%P.roof.length]),stone=material('#c8bba3'),ivory=material('#f8e8cd'),dark=material('#3a4858'),glass=material('#50687a'),wood=material(b.variant%2?'#626f61':'#896452'),metal=material('#464c58');
 const sin=Math.sin(b.yaw),cos=Math.cos(b.yaw);
 const part=(name,x,y,z,w,h,d,m,rot=0,near=false,g=box)=>emit(g,m,new T.Matrix4().compose(new T.Vector3(b.x+x*cos+z*sin,b.y+y,b.z-x*sin+z*cos),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),b.yaw+rot),new T.Vector3(w,h,d)),b.id,b.x,b.z,near,name);
 const floorH=b.height/b.floors,baseH=.5,cap=.24;
 part('walls',0,b.height/2,0,b.width,b.height,b.depth,wall);
 part('plinth',0,baseH/2,0,b.width+.12,baseH,b.depth+.12,stone);
 part('cornice',0,b.height-.13,0,b.width+.38,.26,b.depth+.38,ivory);
 const roofH=b.roof==='gable'?Math.min(b.width*.29,3.7):.36;
 if(b.roof==='gable'){
  part('gable-roof',0,b.height,0,b.width+1,roofH,b.depth+1,roof,0,false,gable);
  part('roof-edge-front',0,b.height+.05,b.depth/2+.4,b.width+.9,.16,.2,wood);
  part('roof-edge-back',0,b.height+.05,-b.depth/2-.4,b.width+.9,.16,.2,wood);
  if(b.variant%3===0){part('chimney',b.width*.25,b.height+roofH*.6,b.depth*.18,.7,2,.65,stone);part('chimney-cap',b.width*.25,b.height+roofH*.6+1,.18*b.depth,.9,.15,.85,dark);}
 }else{
  part('flat-roof',0,b.height+.18,0,b.width+.5,.36,b.depth+.5,roof);
  for(const side of [-1,1]){part('parapet',0,b.height+.6,side*b.depth/2,b.width,.7,.18,stone);part('parapet',side*b.width/2,b.height+.6,0,.18,.7,b.depth,stone);}
  if(b.height>10)part('roof-room',-b.width*.18,b.height+1.7,0,b.width*.3,3,b.depth*.34,wall,0,true);
 }
 if(!detail)return {roofH};
 // Facades run around the entire building, not only the initial camera side.
 for(let face=0;face<4;face++){
  const angle=face*Math.PI/2,front=face===0,width=face%2?b.depth:b.width,depth=face%2?b.width:b.depth,columns=Math.max(2,Math.floor(width/3.1));
  const facade=(name,x,y,z,w,h,d,m,near=true)=>{const cx=Math.cos(angle),sx=Math.sin(angle);part(name,x*cx+z*sx,y,-x*sx+z*cx,w,h,d,m,angle,near);};
  facade('corner-pier',-width/2+.16,b.height/2,depth/2+.08,.32,b.height,.16,stone,false);
  for(let f=0;f<b.floors;f++){
   if(f>0)facade('floor-stringcourse',0,f*floorH,depth/2+.09,width,.14,.22,ivory);
   for(let col=0;col<columns;col++){
    const x=(col+.5)*width/columns-width/2,y=f*floorH+floorH*.55,door=front&&f===0&&col===Math.floor(columns/2),shop=b.category==='commercial'&&f===0&&!door,w=shop?width/columns*.77:1.22,h=shop?2.15:1.48,z=depth/2;
    if(door){facade('door-surround',x,1.25,z+.08,1.7,2.5,.16,stone);facade('door',x,1.17,z+.18,1.35,2.34,.13,wood);facade('door-glass',x,1.67,z+.26,.91,.88,.03,glass);facade('door-handle',x+.42,1.08,z+.29,.055,.32,.08,ivory);facade('door-step',x,.12,z+.53,2,.24,1,stone);continue;}
    facade('recess',x,y,z+.035,w+.22,h+.2,.08,dark);
    facade('glass',x,y,z+.09,w,h,.06,glass);
    for(const s of [-1,1]){facade('frame-side',x+s*(w/2+.03),y,z+.16,.09,h+.18,.16,ivory);facade('frame-horizontal',x,y+s*(h/2+.03),z+.16,w+.16,.09,.16,ivory);}
    facade('window-mullion',x,y,z+.17,.06,h,.12,ivory);
    facade('window-sill',x,y-h/2-.11,z+.26,w+.34,.14,.46,stone);
    if(!shop&&b.variant%3===1){for(const s of [-1,1])facade('shutter',x+s*(w*.5+.31),y,z+.08,.44,h,.11,wood);}
    if(front&&f>0&&(b.variant===0||b.variant===3)&&col%2===0){
      const by=f*floorH+.22;facade('balcony-slab',x,by,z+.65,w+.65,.17,1.4,stone);facade('balcony-rail',x,by+1,z+1.27,w+.58,.055,.055,metal);
      for(let k=0;k<7;k++)facade('baluster',x-w*.6+k*w*.2,by+.5,z+1.27,.035,1,.035,metal);
      for(const s of [-1,1]){facade('side-rail',x+s*(w/2+.3),by+1,z+.68,.055,.055,1.25,metal);facade('rail-post',x+s*(w/2+.3),by+.5,z+.08,.055,1,.055,metal);}
    }
   }
  }
  if(front&&b.category==='commercial'){
    facade('store-sign',0,floorH-.32,b.depth/2+.2,b.width*.83,.42,.19,wood);
    facade('awning',0,2.7,b.depth/2+.7,b.width*.88,.14,1.45,roof);
    for(let k=0;k<8;k++)facade('awning-stripe',(-.385+k*.11)*b.width,2.78,b.depth/2+.7,b.width*.05,.025,1.4,ivory);
  }
 }
 return {roofH};
}
