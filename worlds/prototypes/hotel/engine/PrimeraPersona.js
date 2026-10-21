import * as T from './three.js';
import { DIMENSIONS as D,WALK } from './dimensions.js';

export function crearPrimeraPersona(camera,target){
  let yaw=0,pitch=0;
  const ray=new T.Raycaster(),direction=new T.Vector3(),offset=new T.Vector3();
  const solids=new Set(['muro','puerta','puerta-bano','puerta-balcon','recepcion','conserjeria','barra','buffet','cama','mesa','sofa','butaca','lavamanos','sanitario','mampara','minibar']);
  function sincronizar(){camera.getWorldDirection(direction);yaw=Math.atan2(-direction.x,-direction.z);pitch=Math.asin(T.MathUtils.clamp(direction.y,-1,1));}
  function mirar(dx,dy){yaw-=dx*WALK.lookSpeed;pitch=T.MathUtils.clamp(pitch-dy*WALK.lookSpeed,-WALK.maxPitch,WALK.maxPitch);orientar();}
  function orientar(){direction.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));target.copy(camera.position).add(direction);camera.lookAt(target);}
  function mover(forward,side,dt,root,bounds,{beforeStep=()=>false}={}){
    offset.set(-Math.sin(yaw)*forward+Math.cos(yaw)*side,0,-Math.cos(yaw)*forward-Math.sin(yaw)*side);
    if(!offset.lengthSq())return false;
    offset.normalize().multiplyScalar(WALK.speed*dt);root.updateMatrixWorld(true);
    const obstacles=root.children.filter(r=>solids.has(r.userData.tipo)&&r.visible);
    const visible=hit=>{for(let p=hit.object;p&&p!==root;p=p.parent)if(!p.visible)return false;return hit.object.material?.name!=='contorno';};
    let moved=false;
    for(const axis of ['x','z']){
      if(!offset[axis])continue;
      const next=camera.position[axis]+offset[axis],range=axis==='x'?bounds.x:bounds.z;
      const proposed=camera.position.clone();proposed[axis]=next;
      if(beforeStep(camera.position.clone(),proposed))return moved;
      if(bounds.contains?!bounds.contains(proposed):next<range[0]+D.playerRadius||next>range[1]-D.playerRadius)continue;
      direction.set(0,0,0);direction[axis]=Math.sign(offset[axis]);ray.far=Math.abs(offset[axis])+D.playerRadius;
      let blocked=false;
      for(const height of [WALK.collisionHeight,D.playerHeight])for(const lateral of [-D.playerRadius,0,D.playerRadius]){
        const origin=camera.position.clone();origin.y+=height-D.playerHeight;origin[axis==='x'?'z':'x']+=lateral;
        ray.set(origin,direction);if(ray.intersectObjects(obstacles,true).some(visible)){blocked=true;break;}
      }
      if(!blocked){camera.position[axis]=next;moved=true;}
    }
    orientar();return moved;
  }
  return {sincronizar,mirar,mover};
}
