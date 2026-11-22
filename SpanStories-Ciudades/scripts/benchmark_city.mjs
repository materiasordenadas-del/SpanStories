// Browser-only deterministic camera route. No saved edits or quality changes.
export async function measureCityPerformance({durationMs=12000,motion=true}={}) {
  const e=window.__escena;if(!e)throw Error('El visor aún no está preparado');await e.ready;await e.loadNearby();
  if(e.navigation.mode!=='editor')throw Error('La prueba de cámara requiere modo editor');
  for(const sector of e.decorations?.sectors.values()||[]){for(const entry of sector.entries)entry.lod=undefined;sector.update(e.camera,e.renderer.domElement.clientHeight,true);}
  const camera=e.camera,position=camera.position.clone(),quaternion=camera.quaternion.clone(),target=e.target.clone();
  const frames=[],renderTimes=[],calls=[],triangles=[];let started,previous;
  try {
    await new Promise(resolve=>{
      function sample(now){
        if(started===undefined){started=now;previous=now;}
        else{frames.push(now-previous);previous=now;renderTimes.push(e.metrics.renderTimes.at(-1)||0);calls.push(e.renderer.info.render.calls);triangles.push(e.renderer.info.render.triangles);}
        const progress=Math.min(1,(now-started)/durationMs),angle=progress*Math.PI*2;
        if(motion){camera.position.set(position.x+Math.sin(angle)*8,position.y+Math.sin(angle*2)*2,position.z+(Math.cos(angle)-1)*8);camera.lookAt(target);}
        if(progress<1)requestAnimationFrame(sample);else resolve();
      }
      requestAnimationFrame(sample);
    });
    const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;};
    return {scenario:motion?'inspection-orbit-8m':'inspection-static',durationMs,samples:frames.length,
      fps:frames.length*1000/frames.reduce((a,b)=>a+b,0),medianMs:percentile(frames,.5),p95Ms:percentile(frames,.95),p99Ms:percentile(frames,.99),maxMs:Math.max(...frames),
      framesOver33Ms:frames.filter(n=>n>33.5).length,framesOver50Ms:frames.filter(n=>n>50).length,
      cpuMedianMs:percentile(renderTimes,.5),cpuP95Ms:percentile(renderTimes,.95),
      calls:{min:Math.min(...calls),max:Math.max(...calls)},triangles:{min:Math.min(...triangles),max:Math.max(...triangles)},
      viewport:[e.renderer.domElement.clientWidth,e.renderer.domElement.clientHeight],dpr:e.renderer.getPixelRatio(),camera:position.toArray(),
      objects:e.objetos.entries.size,sectors:e.assets.snapshot().filter(s=>s.state==='ready').map(s=>s.id).sort(),frames};
  } finally {camera.position.copy(position);camera.quaternion.copy(quaternion);camera.updateMatrixWorld(true);}
}

export function startFrameProbe(){
  const frames=[],cpu=[],started=performance.now();let previous,stopped=false;
  function sample(now){if(stopped)return;if(previous!==undefined){frames.push(now-previous);cpu.push(window.__escena.metrics.renderTimes.at(-1)||0);}previous=now;requestAnimationFrame(sample);}
  requestAnimationFrame(sample);
  return {stop(){stopped=true;const sorted=[...frames].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;
    return {fps:frames.length*1000/frames.reduce((a,b)=>a+b,0),samples:frames.length,durationMs:performance.now()-started,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:q(1),stalls:frames.filter(n=>n>25).length,framesOver50Ms:frames.filter(n=>n>50).length,frames,cpu};}};
}

// Reproducible browser-side input workload: avoids screenshot/automation work
// between individual pointer events. It uses the real navigation listeners.
export async function measureMousePerformance({durationMs=20000,players=1,walking=false,turnRate=.7}={}){
  const e=window.__escena;if(!e||e.navigation.mode!=='third')throw Error('La prueba requiere tercera persona');
  if(![1,2].includes(players))throw Error('La prueba admite uno o dos personajes');
  await e.ready;await e.loadNearby();const gltf=await e.loadAvatar(),canvas=e.renderer.domElement,position=e.navigation.position.clone();
  let peer,mixer,observer,probe;const tasks=[],remoteCarrier=(await import('../engine/three.js')).Group;
  const originalCapture=canvas.setPointerCapture,captureDescriptor=Object.getOwnPropertyDescriptor(canvas,'setPointerCapture');let movingPointer=false;
  const restoreCapture=()=>{if(captureDescriptor)Object.defineProperty(canvas,'setPointerCapture',captureDescriptor);else delete canvas.setPointerCapture;};
  try{
    if(players===2){
      const T=await import('../engine/three.js'),{cloneCityAvatar}=await import('../engine/CityAvatarClone.js');
      peer=cloneCityAvatar(e.navigation.avatarCarrier.children[0]);const carrier=new remoteCarrier();carrier.add(peer.root);e.scene.add(carrier);peer.carrier=carrier;
      mixer=new T.AnimationMixer(peer.root);const walk=gltf.animations.find(c=>/^Walking$/i.test(c.name))?.clone();
      if(walk){for(const track of walk.tracks)if(/(hips|root).*\.position$/i.test(track.name)&&track.getValueSize()===3)for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}mixer.clipAction(walk).play();}
      carrier.position.copy(position);carrier.position.x+=1.8;carrier.updateMatrixWorld(true);await e.renderer.compileAsync(carrier,e.camera,e.scene);
    }
    canvas.focus();canvas.setPointerCapture=()=>{};
    try{canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:800,clientY:400,pointerId:99,bubbles:true}));movingPointer=true;}finally{restoreCapture();}
    if(walking)window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(t=>({start:t.startTime,duration:t.duration}))));observer.observe({type:'longtask'});
    probe=startFrameProbe();const start=performance.now();let previous=start;
    await new Promise(resolve=>{
      function sample(now){
        const dt=Math.min(.1,(now-previous)/1000);previous=now;
        window.dispatchEvent(new PointerEvent('pointermove',{clientX:800+(now-start)*turnRate/2.4,clientY:400,pointerId:99}));
        if(peer){peer.carrier.position.copy(e.navigation.position);peer.carrier.position.x+=1.8;peer.carrier.rotation.copy(e.navigation.avatarCarrier.rotation);mixer.update(dt);}
        if(now-start<durationMs)requestAnimationFrame(sample);else resolve();
      }requestAnimationFrame(sample);
    });
    return {scenario:'continuous-mouse-turn',players,walking,turnRate,probe:probe.stop(),longTasks:tasks,snapshot:e.snapshot(),transportTested:false};
  }finally{
    probe?.stop();observer?.disconnect();restoreCapture();
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));
    if(movingPointer){window.dispatchEvent(new PointerEvent('pointermove',{clientX:800,clientY:400,pointerId:99}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:99}));}
    e.navigation.teleport(position.toArray());
    if(peer){mixer?.stopAllAction();mixer?.uncacheRoot(peer.root);peer.carrier.removeFromParent();peer.dispose();}
  }
}
