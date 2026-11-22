// «En escena» del Taller facial dentro del Estudio: el rostro se edita sobre el MISMO escenario vivo de la historia.
// Mismo contrato que el Taller de animación (src/ui/scenelive.js), por el canal del Taller facial:
//   · el visor del Taller se vuelve transparente y debajo el motor dibuja la escena y al actor
//   · la cámara la mueve el Taller y el motor la sigue (view); siempre apunta al personaje: rostro o cuerpo entero
//   · cada fotograma, huesos y pesos de las shape keys del personaje del Taller → actor de la escena (pose + w)
//     (actuación, vida, webcam y dientes: se lee el estado final del fotograma)
// Si el escenario no responde, el Taller sigue con su propio visor.

/** Encuadre fijado en el personaje: el ancla (ojos o cuerpo) se recalcula cada fotograma y la cámara la acompaña. */
export function crearEncuadre({T,camera,controls,getRoot}){
  const E={plano:'rostro',last:null};
  const tmp=new T.Vector3(),box=new T.Box3();
  let eyes=null,hips=null,head=null,rootSeen=null;
  function bones(root){
    if(root===rootSeen)return;rootSeen=root;eyes=[];hips=head=null;
    root?.traverse(o=>{if(!o.isBone)return;if(/eye[_.:]?[lr]$|eye[_.:]?(left|right)$/i.test(o.name))eyes.push(o);if(!hips&&/hips$/i.test(o.name))hips=o;if(!head&&/(^|[^a-z])head$/i.test(o.name))head=o;});
  }
  /** Punto al que se mira, en el espacio del Taller. */
  E.anchor=(out=new T.Vector3())=>{
    const root=getRoot();if(!root)return null;bones(root);root.updateMatrixWorld(true);
    if(E.plano==='rostro'){
      if(eyes.length){out.set(0,0,0);for(const b of eyes)out.add(b.getWorldPosition(tmp));return out.multiplyScalar(1/eyes.length);}
      if(head)return head.getWorldPosition(out).add(tmp.set(0,.06,0));
      box.setFromObject(root);return out.set((box.min.x+box.max.x)/2,box.max.y-(box.max.y-box.min.y)*.18,(box.min.z+box.max.z)/2);
    }
    box.setFromObject(root);const center=box.getCenter(out);
    if(hips){hips.getWorldPosition(tmp);center.x=tmp.x;center.z=tmp.z;}
    return center;
  };
  /** Encuadre frontal nuevo (al cambiar de plano o de personaje). */
  E.frame=(plano=E.plano)=>{
    E.plano=plano;const root=getRoot();if(!root)return;root.updateMatrixWorld(true);
    box.setFromObject(root);const height=box.max.y-box.min.y||1.7,a=E.anchor();if(!a)return;
    // Rostro: tele (30°) a 0,6 alturas. Cuerpo entero: 40° y la distancia justa para que quepa con margen
    // (más cerca = menos escenario que pueda interponerse).
    const fov=plano==='cuerpo'?40:30;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
    const distance=plano==='cuerpo'?height*1.15/(2*Math.tan(T.MathUtils.degToRad(fov/2))):height*.6;
    controls.target.copy(a);camera.position.set(a.x,a.y,a.z+distance);controls.update();E.last=a.clone();
  };
  /** Cada fotograma: el personaje se mueve (actuación, vida…) y la cámara lo sigue sin perder la órbita del usuario. */
  E.follow=()=>{
    const a=E.anchor(tmp.clone());if(!a)return;
    if(E.last){const d=a.clone().sub(E.last);if(d.lengthSq()>1e-10){controls.target.add(d);camera.position.add(d);}}
    else controls.target.copy(a);
    E.last=a;
  };
  return E;
}

export function montarEscenaViva({T,renderer,scene,camera,controls,viewport,getRoot,post,say=()=>{},onChange=()=>{}}){
  const L={on:false,starting:false,held:false,wanted:true,enabled:false,X:new T.Matrix4(),Xi:new T.Matrix4(),pending:new Map(),bones:[],meshes:[],lastPose:'',lastView:'',rect:'',saved:null,hidden:new Map(),materials:new Map()};
  const ghost=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false});
  let seq=1,cleared=false,retry=null,attempts=0;
  /** El escenario aún no tiene al personaje (se está montando la escena): se vuelve a intentar unas veces. */
  function retryLater(){clearTimeout(retry);if(attempts>=6)return;const wait=2000*2**attempts++;retry=setTimeout(()=>{retry=null;L.sync();},wait);}
  const ask=(op,data={},timeout=4000)=>new Promise((resolve,reject)=>{
    const requestId=`fv${seq++}`;
    const timer=setTimeout(()=>{L.pending.delete(requestId);reject(Error('El escenario no respondió'));},timeout);
    L.pending.set(requestId,reply=>{clearTimeout(timer);if(reply.type==='WORKSHOP_ERROR')reject(Error(reply.message||'El escenario rechazó la petición'));else resolve(reply);});
    post('SCENE',{op,requestId,...data});
  });
  /** Respuestas del motor, reenviadas por el Estudio (SCENE_REPLY). */
  // Canal directo con el escenario (lo reparte el Estudio al entrar en escena): vista, huesos y shape keys van de marco
  // a marco sin el viaje por el Estudio. Si el escenario deja de confirmar por él, se vuelve al camino del Estudio.
  let port=null,sentAt=0,ackAt=0,stateSeq=0;
  const dropPort=()=>{if(!port)return;try{port.close();}catch{}port=null;};
  const adoptPort=p=>{dropPort();port=p;ackAt=sentAt=performance.now();p.onmessage=ev=>{if(port!==p)return;const d=ev.data;if(d?.type==='WORKSHOP_DRAWN'||d?.type==='WORKSHOP_LOST')L.receive(d);};p.start?.();};
  const sendState=(op,data)=>{
    const now=performance.now();if(port&&ackAt<sentAt&&now-sentAt>1500)dropPort();if(ackAt>=sentAt)sentAt=now;
    data.seq=++stateSeq;
    if(port){try{port.postMessage({type:op==='view'?'WORKSHOP_VIEW':'WORKSHOP_POSE',...data});return;}catch{dropPort();}}
    post('SCENE',{op,...data});
  };
  L.receive=(reply,ports=null)=>{
    if(!reply||typeof reply.type!=='string')return;
    if(reply.type==='WORKSHOP_PORT'){if(ports?.[0])adoptPort(ports[0]);return;}
    if(reply.type==='WORKSHOP_DRAWN'){ackAt=performance.now();return;}
    const fn=L.pending.get(reply.requestId);
    if(fn){L.pending.delete(reply.requestId);fn(reply);}
    else if(reply.type==='WORKSHOP_LOST')void L.restart();
    else if(reply.type==='WORKSHOP_ERROR'&&L.on)L.stop(reply.message);
  };
  function sendRect(){
    const r=viewport.getBoundingClientRect(),key=[r.left,r.top,r.width,r.height].map(Math.round).join('|');
    if(key===L.rect)return;L.rect=key;post('SCENE',{op:'rect',rect:[r.left,r.top,r.width,r.height]});
  }
  /** Mallas del personaje: se siguen dibujando (clic para tocar, mirada al cursor) pero sin color: se ve el actor del escenario. */
  function hideOwn(hide){
    const root=getRoot();
    if(hide){
      root?.traverse(o=>{if(o.isMesh&&!L.materials.has(o)){L.materials.set(o,o.material);o.material=ghost;}});
      for(const o of scene.children)if(o!==root&&!o.isLight&&o.visible){L.hidden.set(o,true);o.visible=false;}
    }else{
      for(const [o,m] of L.materials)o.material=m;L.materials.clear();
      for(const o of L.hidden.keys())o.visible=true;L.hidden.clear();
    }
  }
  L.start=async()=>{
    const root=getRoot();
    if(L.on||L.starting||!root||!L.enabled||L.held||!L.wanted)return false;
    L.starting=true;
    try{
      L.rect='';sendRect();
      L.bones=[];root.traverse(o=>{if(o.isBone)L.bones.push(o);});
      L.meshes=[];root.traverse(o=>{if(o.isMesh&&o.morphTargetDictionary&&o.morphTargetInfluences?.length)L.meshes.push(o);});
      const meshes=L.meshes.map(o=>{const names=[];for(const [n,i] of Object.entries(o.morphTargetDictionary))names[i]=n;return {name:o.name,morphs:Array.from(names,n=>n??'')};});
      const reply=await ask('begin',{bones:L.bones.map(b=>b.name),meshes});
      if(!reply.matched)throw Error('El personaje del escenario no tiene el mismo esqueleto');
      if(L.held||!L.wanted||!L.enabled){post('SCENE',{op:'end'});return false;}
      root.updateMatrixWorld(true);
      L.X.fromArray(reply.matrix).multiply(root.matrixWorld.clone().invert());L.Xi.copy(L.X).invert();
      if(L.fixed&&reply.shot){
        camera.position.fromArray(reply.shot.position).applyMatrix4(L.Xi);
        controls.target.fromArray(reply.shot.target).applyMatrix4(L.Xi);
        camera.fov=reply.shot.fov;camera.updateProjectionMatrix();controls.update();
      }
      L.saved={bg:scene.background,pan:controls.enablePan};
      scene.background=null;renderer.setClearColor(0x000000,0);controls.enablePan=false;
      hideOwn(true);document.body.classList.add('escena-viva');
      L.on=true;L.lastPose=L.lastView=L.rect='';cleared=false;   // rect: se vuelve a mandar ya como dueño de la escena
      attempts=0;clearTimeout(retry);
      say(`En escena: estás editando el rostro sobre el escenario de la historia${reply.matchedMorphs?'':' (el actor del escenario no tiene shape keys: solo se ve el cuerpo)'}.`);
      onChange(true);return true;
    }catch(error){
      console.warn('Escena viva facial',error);post('SCENE',{op:'end'});
      const again=attempts<6&&L.enabled&&L.wanted&&!L.held;
      say(`No se pudo abrir el escenario (${error.message}). Sigues con el visor del Taller${again?'; se vuelve a intentar en unos segundos':''}.`);
      if(again)retryLater();return false;
    }finally{L.starting=false;}
  };
  L.stop=(why=null)=>{
    if(!L.on)return;L.on=false;dropPort();post('SCENE',{op:'end'});
    document.body.classList.remove('escena-viva');
    scene.background=L.saved.bg;renderer.setClearColor(0x000000,1);controls.enablePan=L.saved.pan;hideOwn(false);
    if(why)say('Escenario: '+why);onChange(false);
  };
  /** El escenario perdió la sesión (se recargó, o pasó por el Editor): se vuelve a entrar con la misma vista. */
  L.restart=async()=>{if(!L.on||L.starting)return;L.stop();await L.start();};
  /** ¿Debe estar en escena? Lo decide el modo (En la historia), si el Estudio lo muestra y si el usuario lo quiere. */
  L.sync=()=>{const want=L.enabled&&!L.held&&L.wanted&&!!getRoot();if(want&&!L.on)void L.start();else if(!want&&L.on)L.stop();};
  L.setHeld=held=>{L.held=!!held;L.sync();};
  L.setEnabled=on=>{L.enabled=!!on;document.body.classList.toggle('scene-preview',!on||!L.wanted);L.sync();};
  L.setWanted=on=>{L.wanted=!!on;document.body.classList.toggle('scene-preview',!on);attempts=0;L.sync();};
  /** Personaje recargado (otro GLB): la sesión se rehace con sus huesos y sus mallas. */
  L.rebind=()=>{if(L.on){L.stop();}L.sync();};
  const _p=new T.Vector3(),_t=new T.Vector3();
  /** Cada fotograma, después de vida, actuación, webcam y dientes: vista, huesos y pesos al escenario (solo si cambian). */
  L.tick=()=>{
    if(!L.on)return;sendRect();
    _p.copy(camera.position).applyMatrix4(L.X);_t.copy(controls.target).applyMatrix4(L.X);
    const view=`${_p.x.toFixed(4)},${_p.y.toFixed(4)},${_p.z.toFixed(4)},${_t.x.toFixed(4)},${_t.y.toFixed(4)},${_t.z.toFixed(4)},${camera.fov}`;
    if(view!==L.lastView){L.lastView=view;sendState('view',{position:_p.toArray(),target:_t.toArray(),fov:camera.fov});}
    const n=L.bones.length,q=new Float32Array(n*4),p=new Float32Array(n*3);let sum=0;
    for(let i=0;i<n;i++){const b=L.bones[i];b.quaternion.toArray(q,i*4);b.position.toArray(p,i*3);sum+=q[i*4]*(i+1)+q[i*4+1]*3+q[i*4+2]*7+q[i*4+3]+p[i*3]*11+p[i*3+1]*13+p[i*3+2]*17;}
    let size=0;for(const m of L.meshes)size+=m.morphTargetInfluences.length;
    const w=new Float32Array(size);let o=0;
    for(const m of L.meshes){const inf=m.morphTargetInfluences;for(let j=0;j<inf.length;j++){w[o]=inf[j];sum+=inf[j]*(o+19)*.37;o++;}}
    const key=sum.toFixed(5);
    if(key!==L.lastPose){L.lastPose=key;sendState('pose',L.fixed?{w}:{q,p,w});}
  };
  /** En escena el Taller no pinta su propio personaje (lo pinta el escenario): basta con dejar el lienzo transparente. */
  L.render=()=>{
    if(!L.on){renderer.render(scene,camera);return;}
    scene.updateMatrixWorld();
    if(!cleared){renderer.clear();cleared=true;}
  };
  /**
   * Si algo del escenario (un pilar, una pared) queda entre el personaje y la cámara, la cámara se acerca hasta
   * quedar por delante. El rayo sale del personaje hacia la cámara, un poco por fuera de su cuerpo.
   */
  L.despejar=async()=>{
    if(!L.on)return false;
    const t=controls.target.clone(),d=camera.position.clone().sub(t),len=d.length();if(len<.3)return false;d.normalize();
    const start=t.clone().addScaledVector(d,.45);
    const hit=await ask('ray',{origin:start.clone().applyMatrix4(L.X).toArray(),direction:d.clone().transformDirection(L.X).toArray()},1500).catch(()=>null);
    if(!hit?.point||!L.on)return false;
    const dist=new T.Vector3().fromArray(hit.point).applyMatrix4(L.Xi).distanceTo(t);
    if(dist>=len)return false;
    camera.position.copy(t).addScaledVector(d,Math.max(.45,dist-.2));controls.update();
    say('La cámara se acercó al personaje: había algo del escenario delante.');return true;
  };
  /** Los demás personajes de la escena (para «mirar a…»): [{id,name,head:Vector3 en el espacio del Taller}]. */
  L.actors=async()=>{
    if(!L.on)return [];
    const reply=await ask('actors',{},2500).catch(()=>null);
    return (reply?.items||[]).map(a=>({id:a.id,name:a.name,head:new T.Vector3().fromArray(a.head).applyMatrix4(L.Xi)}));
  };
  addEventListener('pagehide',()=>L.stop());
  // El Estudio no contestó en 20 s: se trabaja con el visor propio (nada que hacer: sin sesión no hay transparencia).
  return L;
}
