// Explorar a pie: primera persona (ojos a 1,6 m) y tercera persona con avatar provisional.
// Colisión 2D contra huellas de edificios, troncos y muros; altura del suelo = relieve + bordillo.
import * as THREE from 'three';
import {pointInPaths,pointInRings} from '../geom/ground.js';
import {surfaceHeightAt} from '../geom/road-surface.js';
import {toExPolygons,union,difference,polygonPaths} from '../geom/clip.js';
import {createGMaterial} from './gmaterial.js';

export class Walker{
  constructor(viewer){
    this.viewer=viewer;this.active=false;this.third=false;
    this.pos=new THREE.Vector3();this.yaw=0;this.pitch=0;this.vy=0;
    this.keys=new Set();this.speed=1.6;this.eye=1.6;this.radius=.35;
    this.avatar=makeAvatar(viewer.sunDir);this.avatar.visible=false;viewer.scene.add(this.avatar);
    this.onKey=e=>{
      if(!this.active)return;const k=e.code;
      if(e.type==='keyup'){this.keys.delete(k);return;}
      if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyQ','KeyR','KeyV','KeyE','Escape','Space'].includes(k))return;
      e.preventDefault();this.keys.add(k);
      if(!e.repeat&&(k==='KeyV'||k==='KeyE'))this.setThird(!this.third);
      if(k==='Escape')this.stop();
      if(k==='Space'&&!e.repeat&&this.grounded){this.vy=3.6;this.grounded=false;}
    };
    this.onMouse=e=>{if(!this.active||document.pointerLockElement!==viewer.renderer.domElement&&!this.dragging)return;
      this.yaw-=e.movementX*.0025;this.pitch=THREE.MathUtils.clamp(this.pitch-e.movementY*.0022,-1.3,1.3);};
    this.onDown=e=>{if(!this.active||e.button!==0)return;this.dragging=true;try{viewer.renderer.domElement.requestPointerLock?.()?.catch?.(()=>{});}catch{/* Arrastrar sigue disponible sin bloqueo del puntero. */}};
    this.onUp=()=>this.dragging=false;
    this.clearInput=()=>{this.keys.clear();this.dragging=false;};
    this.onVisibility=()=>{if(document.hidden)this.clearInput();};
    this.onLock=()=>{if(document.pointerLockElement!==viewer.renderer.domElement)this.clearInput();};
    addEventListener('keydown',this.onKey);addEventListener('keyup',this.onKey);addEventListener('mousemove',this.onMouse);
    viewer.renderer.domElement.addEventListener('mousedown',this.onDown);
    addEventListener('mouseup',this.onUp);addEventListener('blur',this.clearInput);
    document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('pointerlockchange',this.onLock);
  }
  setThird(value){this.third=value;this.avatar.visible=this.active&&value;this.viewer.dirty=true;}
  // world: {model, buildings(prepared), asphalt(paths), trees[]}
  setWorld(world){
    this.world=world;
    this.asphaltEx=world.asphalt?toExPolygons(world.asphalt):[];
    const cell=20;this.cell=cell;this.grid=new Map();
    const add=(minx,minz,maxx,maxz,item)=>{for(let i=Math.floor(minx/cell);i<=Math.floor(maxx/cell);i++)for(let j=Math.floor(minz/cell);j<=Math.floor(maxz/cell);j++){const k=i+':'+j;(this.grid.get(k)??this.grid.set(k,[]).get(k)).push(item);}};
    this.interiorPlans=world.buildings.map(pb=>pb.interiorPlan).filter(Boolean);
    for(const pb of world.buildings){
      const plan=pb.interiorPlan,walls=plan?.walls??pb.rings.flatMap(ring=>ring.map((a,i)=>[a,ring[(i+1)%ring.length]]));
      const wallBottom=pb.b?.minHeight>0?pb.base:Math.min(pb.gmin??pb.base,pb.base)-.6;
      const wall=(a,b,bottom,top)=>add(Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1]),{seg:[a,b],bottom,top});
      walls.forEach(([a,b],i)=>{const partition=plan&&i>=walls.length-plan.partitions.length;wall(a,b,partition?plan.floor:wallBottom,partition?plan.ceiling:pb.top);});
      if(plan)wall(plan.doorA,plan.doorB,plan.floor+plan.doorHeight,pb.top);
    }
    for(const t of world.trees??[])add(t.x-1,t.z-1,t.x+1,t.z+1,{circle:[t.x,t.z,.35]});
    // Mar y láminas de agua: no se camina por ellos salvo sobre muelles, espigones o puentes.
    const areas=world.model.areas??[],paths=list=>union(list.flatMap(a=>polygonPaths(a.rings)));
    const wet=areas.filter(a=>a.kind==='water'),dry=areas.filter(a=>['pier','breakwater'].includes(a.kind));
    this.waterEx=wet.length?toExPolygons(dry.length?difference(paths(wet),paths(dry)):paths(wet)):[];
    for(const l of world.lines??[])for(let i=1;i<l.points.length;i++){const a=l.points[i-1],b=l.points[i];add(Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1]),{seg:[a,b]});}
  }
  groundAt(x,z,reference=this.pos?.y??0){const T=this.world.model.terrain;let y=T.height(x,z)+(this.asphaltEx.length&&pointInPaths(x,z,this.asphaltEx)?0:.15);for(const floor of this.world.interiors?.floors??[])if(pointInRings(x,z,floor.rings)&&Math.abs(reference-floor.y)<2)y=floor.y;return surfaceHeightAt(this.world.surfaces,x,z,reference,y);}
  ceilingAt(x,z,reference=this.pos?.y??0){let y=Infinity;for(const plan of this.interiorPlans??[])if(reference>=plan.floor-.35&&reference<plan.ceiling&&pointInRings(x,z,plan.rings))y=Math.min(y,plan.ceiling);return y;}
  start(at=null,yaw=null){
    if(this.active)this.stop();
    const v=this.viewer;this.active=true;v.controls.enabled=false;
    const c=v.controls.target;
    const p=at??new THREE.Vector3(c.x,0,c.z);
    this.clearInput();this.vy=0;this.grounded=true;
    const spawn=this.findSpawn(p);this.pos.set(spawn.x,this.groundAt(spawn.x,spawn.z,p.y),spawn.z);
    const dir=new THREE.Vector3();v.camera.getWorldDirection(dir);
    this.yaw=yaw??Math.atan2(-dir.x,-dir.z);this.pitch=0;
    this.saved={pos:v.camera.position.clone(),target:c.clone(),near:v.camera.near,lens:v.lens,straight:v.straightVerticals};
    v.straightVerticals=false;v.camera.near=.12;v.setLens(22);this.avatar.visible=this.third;
    v.onFrame=dt=>this.update(dt);
    this.update(0);
  }
  stop(){
    if(!this.active)return;const v=this.viewer;this.active=false;this.avatar.visible=false;
    this.clearInput();this.vy=0;document.exitPointerLock?.();v.onFrame=null;v.controls.enabled=true;
    v.camera.position.copy(this.saved.pos);v.controls.target.copy(this.saved.target);v.camera.near=this.saved.near;v.straightVerticals=this.saved.straight;v.setLens(this.saved.lens);v.controls.update();v.dirty=true;
    this.onStop?.();
  }
  collide(p){
    const r=this.radius;
    for(let iter=0;iter<2;iter++){
      const list=this.nearObstacles(p.x,p.z,r);
      for(const it of list){
        if(it.bottom!=null&&(p.y+(this.eye??1.6)+.12<it.bottom||p.y>=it.top))continue;
        if(it.seg){const [a,b]=it.seg,dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/L2));
          const qx=a[0]+dx*t,qz=a[1]+dz*t,ex=p.x-qx,ez=p.z-qz,d=Math.hypot(ex,ez);
          if(d<r){if(d>1e-6){p.x=qx+ex/d*r;p.z=qz+ez/d*r;}else{const length=Math.hypot(dx,dz)||1,nx=-dz/length,nz=dx/length,sign=((this.pos.x-qx)*nx+(this.pos.z-qz)*nz)<0?-1:1;p.x=qx+nx*r*sign;p.z=qz+nz*r*sign;}}}
        else{const [cx,cz,cr]=it.circle,ex=p.x-cx,ez=p.z-cz,d=Math.hypot(ex,ez),m=cr+r;if(d<m&&d>1e-6){p.x=cx+ex/d*m;p.z=cz+ez/d*m;}}
      }
    }
    if(this.inWater(p.x,p.z,p.y)){p.x=this.pos.x;p.z=this.pos.z;}
    const size=this.world.model.size;
    if(size){p.x=THREE.MathUtils.clamp(p.x,-size.width/2+r,size.width/2-r);p.z=THREE.MathUtils.clamp(p.z,-size.depth/2+r,size.depth/2-r);}
  }
  inWater(x,z,reference){
    if(!this.waterEx?.length||!pointInPaths(x,z,this.waterEx))return false;
    // Sobre un puente u otra superficie elevada sí se puede pasar.
    const T=this.world.model.terrain,base=T.height(x,z)+.15;return surfaceHeightAt(this.world.surfaces,x,z,reference,base)<=base+.01;
  }
  nearObstacles(x,z,r){const out=new Set();for(let i=Math.floor((x-r)/this.cell);i<=Math.floor((x+r)/this.cell);i++)for(let j=Math.floor((z-r)/this.cell);j<=Math.floor((z+r)/this.cell);j++)for(const it of this.grid.get(i+':'+j)??[])out.add(it);return out;}
  findSpawn(p){
    const size=this.world.model.size,valid=(x,z)=>{
      if(size&&(Math.abs(x)>size.width/2-this.radius||Math.abs(z)>size.depth/2-this.radius))return false;
      const y=this.groundAt(x,z,p.y);
      if(this.world.buildings.some(b=>b.base<y+this.eye&&b.top>y&&pointInRings(x,z,b.rings)&&!b.interiorPlan))return false;
      const q=new THREE.Vector3(x,y,z);this.collide(q);return Math.hypot(q.x-x,q.z-z)<.001;
    };
    if(valid(p.x,p.z))return p;
    for(let r=1;r<=40;r++)for(let i=0;i<24;i++){const a=i*Math.PI/12,x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;if(valid(x,z))return {x,z};}
    // No trasladar al usuario a un punto arbitrario si el recinto no ofrece espacio.
    this.active=false;this.viewer.controls.enabled=true;throw Error('No hay suelo libre cercano para iniciar el recorrido; coloca el marcador en una calle');
  }
  cameraDistance(origin,direction,maxDistance){
    let distance=maxDistance;
    const margin=.22,steps=Math.ceil(maxDistance/.1);
    for(let i=1;i<=steps;i++){
      const d=maxDistance*i/steps,x=origin.x+direction.x*d,y=origin.y+direction.y*d,z=origin.z+direction.z*d;
      if(y<this.groundAt(x,z,origin.y)+margin){distance=Math.max(.15,d-.15);break;}
      if(y>this.ceilingAt(x,z,origin.y)-margin){distance=Math.max(.15,d-.15);break;}
      let blocked=false;
      for(const it of this.nearObstacles(x,z,margin)){
        if(it.bottom!=null&&(y<it.bottom-margin||y>it.top+margin))continue;
        if(it.seg){const [a,b]=it.seg,dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);blocked=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<margin;}
        else blocked=Math.hypot(x-it.circle[0],z-it.circle[1])<it.circle[2]+margin;
        if(blocked)break;
      }
      if(blocked){distance=Math.max(.15,d-.15);break;}
    }
    return distance;
  }
  update(dt){
    if(!this.active)return false;
    dt=Math.max(0,Math.min(.05,dt));
    const k=this.keys,run=k.has('ShiftLeft')||k.has('ShiftRight');
    const sp=this.speed*(run?3.2:1);
    const f=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0);
    const s=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0);
    if(k.has('KeyQ'))this.yaw+=dt*1.6;if(k.has('KeyR'))this.yaw-=dt*1.6;
    const fx=-Math.sin(this.yaw),fz=-Math.cos(this.yaw),rx=Math.cos(this.yaw),rz=-Math.sin(this.yaw);
    const norm=Math.max(1,Math.hypot(f,s)),dx=(fx*f+rx*s)*sp*dt/norm,dz=(fz*f+rz*s)*sp*dt/norm;
    const next=this.pos.clone(),steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let i=0;i<steps;i++){next.x+=dx/steps;next.z+=dz/steps;this.collide(next);}
    const g=this.groundAt(next.x,next.z);
    // escalones de hasta 35 cm (bordillos); más alto bloquea
    if(g-this.pos.y>.35001&&this.grounded){next.x=this.pos.x;next.z=this.pos.z;}
    this.vy-=9.8*dt;next.y=this.pos.y+this.vy*dt;
    const ceiling=this.ceilingAt(next.x,next.z,this.pos.y),head=this.eye+.12;
    if(this.vy>0&&next.y+head>ceiling){next.y=ceiling-head;this.vy=0;}
    const gy=this.groundAt(next.x,next.z);
    if(next.y<=gy){next.y=gy;this.vy=0;this.grounded=true;}else this.grounded=false;
    this.pos.copy(next);
    const cam=this.viewer.camera;
    const look=new THREE.Vector3(fx*Math.cos(this.pitch),Math.sin(this.pitch),fz*Math.cos(this.pitch));
    if(this.third){
      this.avatar.position.copy(this.pos);this.avatar.rotation.y=this.yaw;
      const moving=f||s;this.avatar.userData.t=(this.avatar.userData.t??0)+dt*(moving?(run?11:7):0);
      animateAvatar(this.avatar,moving?this.avatar.userData.t:0);
      const origin=new THREE.Vector3(this.pos.x,this.pos.y+1.4,this.pos.z),offset=new THREE.Vector3(-fx*3.6,.5-this.pitch*1.2,-fz*3.6),length=offset.length();offset.normalize();
      cam.position.copy(origin).addScaledVector(offset,this.cameraDistance(origin,offset,length));
      this.avatar.visible=cam.position.distanceTo(origin)>.65;
      cam.lookAt(this.pos.x+look.x*4,this.pos.y+1.4+look.y*4,this.pos.z+look.z*4);
    }else{
      cam.position.set(this.pos.x,this.pos.y+this.eye,this.pos.z);
      cam.lookAt(cam.position.x+look.x,cam.position.y+look.y,cam.position.z+look.z);
    }
    return true;
  }
}

// Avatar provisional SpanStories (cuerpo y cabeza simples; el personaje definitivo vendrá del visor).
function makeAvatar(sun){
  const g=new THREE.Group();g.name='avatar';
  const mat=createGMaterial({sun});mat.uniforms.uMeshId.value=.913;
  // El material del Estudio (G-buffer) lee el color por vértice: se rellena por pieza.
  const piece=(geo,c,id)=>{const n=geo.attributes.position.count,col=new THREE.Color(c);
    geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3).map((_,i)=>[col.r,col.g,col.b][i%3]),3));
    geo.setAttribute('aSurf',new THREE.Float32BufferAttribute(new Float32Array(n),1));
    geo.setAttribute('aId',new THREE.Float32BufferAttribute(new Float32Array(n).fill(id),1));
    const m=new THREE.Mesh(geo,mat);return m;};
  const body=piece(new THREE.CapsuleGeometry(.24,.62,4,10),'#3f6db0',1);body.position.y=1.02;
  const head=piece(new THREE.SphereGeometry(.17,14,10),'#f1c8a4',2);head.position.y=1.62;
  const hair=piece(new THREE.SphereGeometry(.18,14,10,0,Math.PI*2,0,Math.PI*.55),'#3b2a22',3);hair.position.y=1.65;
  const legs=[-.1,.1].map((x,i)=>{const l=piece(new THREE.CapsuleGeometry(.08,.5,3,8),'#2b2f3a',4+i);l.position.set(x,.38,0);return l;});
  const arms=[-.32,.32].map((x,i)=>{const a=piece(new THREE.CapsuleGeometry(.065,.45,3,8),'#3f6db0',6+i);a.position.set(x,1.08,0);return a;});
  g.add(body,head,hair,...legs,...arms);g.userData={legs,arms};
  return g;
}
function animateAvatar(a,t){
  const s=Math.sin(t)*.6;
  a.userData.legs[0].rotation.x=s;a.userData.legs[1].rotation.x=-s;
  a.userData.arms[0].rotation.x=-s*.8;a.userData.arms[1].rotation.x=s*.8;
}
