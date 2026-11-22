import * as T from './three.js';
import {cloneCityAvatar} from './CityAvatarClone.js';
import {CityRoomClient} from './CityRoomClient.js';
import {CityRemoteTrack} from './CityRemoteTrack.js';

function inPlace(clip) {
  const copy=clip.clone();
  for(const track of copy.tracks)if(/(hips|root).*\.position$/i.test(track.name)&&track.getValueSize()===3)
    for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}
  return copy;
}

export class CityMultiplayer {
  constructor({scene,navigation,zone,room,template,prepare=async()=>{}}) {
    Object.assign(this,{scene,navigation,template,prepare});this.peers=new Map();this.disposed=false;this.lastPosition=navigation.position.clone();this.lastMoved=-Infinity;
    this.client=new CityRoomClient({room,zone,state:()=>({p:navigation.position.toArray(),yaw:navigation.avatarCarrier.rotation.y,active:navigation.mode!=='editor',moving:performance.now()-this.lastMoved<150&&!document.hidden}),onSnapshot:(data,now,self)=>this.receive(data,now,self)});
    this.client.start();
  }
  receive(data,now,self) {
    if(this.disposed)return;
    const present=new Set();
    for(const state of data.players){
      if(state.id===self)continue;present.add(state.id);
      let peer=this.peers.get(state.id);
      if(!peer){peer={id:state.id,track:new CityRemoteTrack(),pose:{p:[0,0,0],active:false,yaw:0,moving:false}};this.peers.set(state.id,peer);}
      peer.track.push(state,data.serverTime,now);
      if(state.active&&!peer.clone&&!peer.loading){peer.loading=this.build(peer).catch(error=>{this.remove(peer);peer.error=error.message;}).finally(()=>{peer.loading=null;});}
    }
    for(const [id,peer] of this.peers)if(!present.has(id)){this.remove(peer);this.peers.delete(id);}
  }
  async build(peer) {
    const {root,animations}=await this.template();
    if(this.disposed||this.peers.get(peer.id)!==peer)return;
    const clone=cloneCityAvatar(root);peer.clone=clone;
    const carrier=new T.Group();peer.carrier=carrier;carrier.name='RemotePlayer_'+peer.id;carrier.userData.ignorarSeleccion=true;
    carrier.add(clone.root);
    carrier.traverse(o=>{o.userData.ignorarSeleccion=true;});
    const avatar=clone.root.children[0]||clone.root;peer.animationRoot=avatar;peer.mixer=new T.AnimationMixer(avatar);
    const walk=animations.find(c=>/^Walking$/i.test(c.name))||animations.find(c=>/walk/i.test(c.name)),idle=animations.find(c=>/^(Idle|restpose)$/i.test(c.name));
    if(walk)peer.walk=peer.mixer.clipAction(inPlace(walk));if(idle)peer.idle=peer.mixer.clipAction(inPlace(idle));
    peer.preparing=true;
    try {await this.prepare(carrier);} finally {peer.preparing=false;}
    carrier.visible=false;
    if(this.disposed||this.peers.get(peer.id)!==peer){this.remove(peer);return;}
    this.scene.add(carrier);
  }
  update(now,dt) {
    const p=this.navigation.position;
    if(p.distanceToSquared(this.lastPosition)>1e-8)this.lastMoved=now;
    this.lastPosition.copy(p);
    for(const peer of this.peers.values()){
      const carrier=peer.carrier;if(!carrier?.parent)continue;
      const pose=peer.track.sample(now,peer.pose);carrier.visible=pose.active;
      if(!pose.active)continue;carrier.position.fromArray(pose.p);carrier.rotation.y=pose.yaw;
      const action=pose.moving?peer.walk:peer.idle;
      if(action&&peer.action!==action){peer.action?.fadeOut(.15);action.reset().fadeIn(.15).play();peer.action=action;}
      if(!action&&peer.action)peer.action.paused=!pose.moving;
      peer.mixer.update(dt);
    }
  }
  remove(peer){peer.carrier?.removeFromParent();if(peer.preparing)return;peer.mixer?.stopAllAction();if(peer.animationRoot)peer.mixer?.uncacheRoot(peer.animationRoot);peer.clone?.dispose();peer.clone=null;peer.carrier=null;peer.mixer=null;peer.action=null;peer.error=null;}
  snapshot(){return {...this.client.snapshot(),peers:[...this.peers.values()].map(p=>({id:p.id,visible:!!p.carrier?.visible,position:p.carrier?.position.toArray(),seq:p.track.sequence,error:p.error||null}))};}
  dispose(){this.disposed=true;this.client.dispose();for(const peer of this.peers.values())this.remove(peer);this.peers.clear();}
}
