import * as T from './three.js';
import { origenDelAnfitrion } from './LexicoPuertos.js';
import { LEXICO, STORY_STUDIO } from '../routes.js';
import { fetchCityGLB } from './CityTransport.js';
import { cloneCityAvatar } from './CityAvatarClone.js';

const CHANNEL='spanstories.studio';
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<100000);
export function validStudioStage(s,zoneId){
  return !!s&&s.zoneId===zoneId&&typeof s.sceneId==='string'&&typeof s.sequenceId==='string'&&Number.isFinite(s.time)&&s.time>=0&&
    vector(s.shot?.position)&&vector(s.shot?.target)&&Number.isFinite(s.shot.fov)&&s.shot.fov>=10&&s.shot.fov<=100&&
    Array.isArray(s.actors)&&s.actors.length<=20&&s.actors.every(a=>typeof a.id==='string'&&typeof a.characterId==='string'&&vector(a.position)&&Number.isFinite(a.rotation)&&Number.isFinite(a.height)&&a.height>=.2&&a.height<=5)&&
    Array.isArray(s.performances)&&s.performances.every(p=>s.actors.some(a=>a.id===p.actorId)&&typeof p.action==='string')&&
    Array.isArray(s.entryIds)&&s.entryIds.every(v=>typeof v==='string');
}

/** The same city/canvas renders both direction and playback. No new scene or renderer. */
export async function createStoryStudioBridge({scene,camera,target,renderer,assets,style,zone,manifest,world,ground,loadNearby,navigation,lexico,pinned,win=window,fetcher=fetch}){
  const origin=origenDelAnfitrion({win,permitidos:LEXICO.hostOrigins});
  if(!origin)throw new Error('Story Studio necesita el anfitrión de SpanStories.');
  const response=await fetcher(new URL('Personajes/personajes.json',world.world.manifestUrl));
  if(!response.ok)throw new Error('No se pudo leer la biblioteca de personajes.');
  const catalog=(await response.json()).characters,templates=new Map(),actors=new Map(),templateRoots=new Set();
  let revision=0,disposed=false,playing=false,waiting=false,student=false,allowLook=true,gesture=null,lastStage=null;
  let lookYaw=0,lookPitch=0,placement=null;
  const send=(type,data={})=>win.parent.postMessage({channel:CHANNEL,version:1,type,...data},origin);
  const canvas=renderer.domElement;
  function applyLook(){
    if(!lastStage)return;
    const direction=new T.Vector3(...lastStage.shot.target).sub(new T.Vector3(...lastStage.shot.position));
    const sphere=new T.Spherical().setFromVector3(direction);
    sphere.theta+=lookYaw;sphere.phi=T.MathUtils.clamp(sphere.phi+lookPitch,.1,Math.PI-.1);
    target.copy(camera.position).add(direction.setFromSpherical(sphere));camera.lookAt(target);
  }
  async function template(id){
    if(templates.has(id))return templates.get(id);
    const character=catalog.find(c=>c.id===id);if(!character)throw new Error('Personaje fuera de la biblioteca: '+id);
    const promise=(async()=>{
      const url=new URL(character.url,response.url).href,gzipUrl=character.gzipUrl?new URL(character.gzipUrl,response.url).href:null;
      const {buffer,json,binary}=await fetchCityGLB(url,{gzipUrl,sha256:character.sha256,prepareForParse:true});
      const gltf=await assets.loader.parseAsync(json||buffer,new URL('.',url).href,binary||null);
      await style.adaptAsync(gltf.scene,gltf);
      if(character.animationLibraryUrl){
        const libraryUrl=new URL(character.animationLibraryUrl,response.url).href;
        const packed=await fetchCityGLB(libraryUrl);
        const library=await assets.loader.parseAsync(packed.buffer,new URL('.',libraryUrl).href);
        gltf.animations.push(...library.animations);gltf.studioIdleClip=character.studioIdleClip;
      }
      gltf.scene.traverse(o=>{o.userData.ignorarSeleccion=true;});
      templateRoots.add(gltf.scene);
      send('CHARACTER_READY',{characterId:id,animations:gltf.animations.map(c=>c.name)});
      return gltf;
    })();templates.set(id,promise);
    promise.catch(()=>templates.delete(id));return promise;
  }
  async function ensureActor(data){
    let actor=actors.get(data.id);if(actor?.characterId===data.characterId)return actor;
    const gltf=await template(data.characterId);
    if(disposed)return null;
    actor=actors.get(data.id);if(actor?.characterId===data.characterId)return actor;
    actor?.clone.dispose();
    const clone=cloneCityAvatar(gltf.scene),root=new T.Group(),carrier=new T.Group();
    carrier.add(clone.root);root.add(carrier);root.name='StoryActor:'+data.id;root.userData.storyActorId=data.id;
    clone.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(clone.root),size=box.getSize(new T.Vector3());
    const scale=data.height/(size.y||1);carrier.scale.setScalar(scale);carrier.position.set(-(box.min.x+box.max.x)*.5*scale,-box.min.y*scale,-(box.min.z+box.max.z)*.5*scale);
    scene.add(root);
    const mixer=new T.AnimationMixer(clone.root);
    const clips=gltf.animations.map(c=>{const clip=c.clone();for(const track of clip.tracks)if(/(hips|root).*\.position$/i.test(track.name)&&track.getValueSize()===3)for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}return clip;});
    actor={root,clone,mixer,clips,characterId:data.characterId,carrier,height:data.height,idleClip:gltf.studioIdleClip};actors.set(data.id,actor);return actor;
  }
  function performanceActor(actor,p,time){
    const specific=p?.action==='wave'?actor.clips.find(c=>/wave|greet/i.test(c.name)):p?.action==='nod'?actor.clips.find(c=>/nod|agree/i.test(c.name)):null;
    const clip=p?.clipName?actor.clips.find(c=>c.name===p.clipName):p?.action==='walk'?actor.clips.find(c=>/^Walking$/i.test(c.name)):specific||actor.clips.find(c=>c.name===actor.idleClip)||actor.clips.find(c=>/^(idle|restpose)$/i.test(c.name));
    actor.mixer.stopAllAction();
    if(clip){const action=actor.mixer.clipAction(clip);action.play();action.time=Math.max(0,time-(p?.at||0))%Math.max(clip.duration,.001);}
    if(p?.action==='talk'){const mouth=actor.clips.find(c=>/facial.*mouth/i.test(c.name));if(mouth){const action=actor.mixer.clipAction(mouth);action.play();action.time=Math.max(0,time-p.at)%Math.max(mouth.duration,.001);}}
    // Explicitly named facial channels are independent of body clips.
    if(p?.expression){const expression=actor.clips.find(c=>c.name===p.expression);if(expression){const action=actor.mixer.clipAction(expression);action.play();action.time=Math.min(Math.max(0,time-p.at),expression.duration);}}
    actor.mixer.update(0);
  }
  async function receive(e){
    if(e.origin!==origin||e.source!==win.parent)return;
    const m=e.data;if(m?.channel!==CHANNEL||m.version!==1)return;
    if(m.type==='HELLO'){ready();return;}
    if(m.type==='FOCUS_ACTOR'&&!student){
      const actor=actors.get(m.actorId),ratio=Object.hasOwn(STORY_STUDIO.shotHeight,m.shotType)?STORY_STUDIO.shotHeight[m.shotType]:null;
      if(!actor||!ratio)return;
      actor.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(actor.root),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
      const height=size.y*ratio;center.y=box.max.y-height/2;
      const distance=height*STORY_STUDIO.frameMargin/(2*Math.tan(T.MathUtils.degToRad(camera.fov)/2));
      camera.position.set(center.x+Math.sin(actor.root.rotation.y)*distance,center.y,center.z+Math.cos(actor.root.rotation.y)*distance);target.copy(center);camera.lookAt(target);
      send('FOCUSED',{shotType:m.shotType,shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,transition:0}});return;
    }
    if(m.type==='CAPTURE'){
      const position=new T.Vector3(target.x,ground(target.x,target.z),target.z);
      send('CAPTURED',{requestId:m.requestId,shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,transition:0},position:position.toArray()});return;
    }
    if(m.type==='PLACE'&&!student){placement=m.actorId;send('PLACING',{actorId:placement});return;}
    if(m.type!=='STAGE'||!validStudioStage(m.stage,zone.id))return;
    const current=++revision,s=m.stage;
    win.clearInterval(readyTimer);
    student=m.student===true;playing=m.playing===true;waiting=m.waiting===true;allowLook=m.allowLook!==false;
    navigation?.setEditorEnabled(!student);
    if(lastStage?.sequenceId!==s.sequenceId){lookYaw=0;lookPitch=0;lexico?.interaccion.cerrar('momento');}
    lastStage=s;
    camera.position.fromArray(s.shot.position);target.fromArray(s.shot.target);camera.fov=s.shot.fov;camera.updateProjectionMatrix();camera.lookAt(target);if(student)applyLook();
    lexico?.interaccion.habilitar(student?s.entryIds:[]);
    try{
      await Promise.all(s.actors.map(ensureActor));
      if(disposed||current!==revision)return;
      const activeIds=new Set(s.actors.map(a=>a.id));for(const [id,actor]of actors)if(!activeIds.has(id)){actor.root.removeFromParent();actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.clone.root);actor.clone.dispose();actors.delete(id);}
      for(const data of s.actors){const actor=actors.get(data.id);actor.root.position.fromArray(data.position);actor.root.rotation.y=data.rotation;const scale=data.height/actor.height;actor.carrier.scale.multiplyScalar(scale);actor.carrier.position.multiplyScalar(scale);actor.height=data.height;performanceActor(actor,s.performances.find(p=>p.actorId===data.id),s.time);}
      // Pin authored actor and target sectors while the scene is active.
      pinned.clear();const points=[s.shot.target,...s.actors.map(a=>a.position)];
      const required=manifest.sectors.filter(sector=>points.some(p=>p[0]>=sector.bounds.min[0]&&p[0]<=sector.bounds.max[0]&&p[2]>=sector.bounds.min[2]&&p[2]<=sector.bounds.max[2]));
      for(const sector of required)pinned.add(sector.id);
      await Promise.all(required.map(sector=>assets.load(sector,zone.manifestUrl)));
      void loadNearby();
      if(!disposed&&current===revision)send('STAGE_READY',{requestId:m.requestId,sequenceId:s.sequenceId});
    }catch(error){if(!disposed&&current===revision)send('ERROR',{message:error.message});}
  }
  function down(e){if(!student)return;gesture={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,id:e.pointerId};canvas.setPointerCapture?.(e.pointerId);}
  function move(e){if(!gesture||!student||!allowLook)return;lookYaw-=(e.clientX-gesture.lastX)*.003;lookPitch-=(e.clientY-gesture.lastY)*.003;gesture.lastX=e.clientX;gesture.lastY=e.clientY;applyLook();}
  function up(e){
    if(placement&&!student){const rect=canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=ray.intersectObjects(scene.children,true);const hit=hits.find(h=>!h.object.userData.ignorarSeleccion);if(hit){const point=hit.point;send('PLACED',{actorId:placement,position:[point.x,ground(point.x,point.z),point.z]});placement=null;}}
    gesture=null;
  }
  // Disabling navigation removes WASD and orbit in student mode; only the look gesture above remains.
  navigation?.setEditorEnabled(false);
  win.addEventListener('message',receive);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);
  const ready=()=>send('READY',{zoneId:zone.id,characters:catalog.map(c=>({id:c.id,label:c.label})),entries:lexico?.mapa.entries.map(e=>({id:e.id,label:e.speech.text}))||[]});
  const readyTimer=win.setInterval(ready,1500);ready();
  return {update(dt){if(playing||waiting)for(const actor of actors.values())if(actor.root.visible)actor.mixer.update(dt);},retainedRoots(){return [...templateRoots,...[...actors.values()].map(a=>a.root)];},destroy(){disposed=true;revision++;win.clearInterval(readyTimer);win.removeEventListener('message',receive);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);for(const actor of actors.values()){actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.clone.root);actor.root.removeFromParent();actor.clone.dispose();}pinned.clear();},setLexicalEvent(event){if(event.tipo==='abierta')send('OBJECT_TOUCHED',{entryId:event.entryId});if(event.tipo==='cerrada')send('OBJECT_CLOSED',{entryId:event.entryId});}};
}
