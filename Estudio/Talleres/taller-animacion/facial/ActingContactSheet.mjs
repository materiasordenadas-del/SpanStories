// Hoja de contacto para revisar actuaciones sin reproducirlas: varios fotogramas exactos en una sola imagen.
// Uso (consola o agente), con el Taller facial abierto y un personaje cargado:
//   const hoja=await import('./ActingContactSheet.mjs?v='+Date.now());
//   await hoja.sheet([{acting:'behavior-05',t:1.2,view:'body'},{acting:'behavior-05',t:1.2,view:'face'}]);
//   hoja.clear();
// Cada llamada vuelve a importar el motor y la biblioteca, así que refleja los archivos guardados sin recargar la página.
const API='http://127.0.0.1:5189';
let overlay=null;
export function clear(){overlay?.remove();overlay=null;}
export async function modules(v=Date.now()){
  const [engine,library,core]=await Promise.all([import(`${API}/ecosystem/body/acting.js?v=${v}`),import(`./ActingLibrary.mjs?v=${v}`),import(`./FacialCore.mjs?v=${v}`)]);
  return {engine,library,core};
}
/**
 * cells: [{label, pose:{…pose suelta del motor}, face:{canal:peso con calibración}, acting:'behavior-NN', t:segundos|'peak', intensity, view:'face'|'bust'|'body', yaw:grados, weights:{canal:valor}}]
 * `weights` escribe influencias directas (puede pasar de 1) para sondear un rig.
 */
export async function sheet(cells,{cols=4,cw=Math.floor(innerWidth/cols),ch=Math.floor(innerHeight/Math.ceil(cells.length/cols)),scale=1,background='#30333a',gain}={}){
  const tf=window.tallerFacial;if(!tf?.root)throw Error('Carga primero un personaje en el Taller facial.');
  const {T,scene,camera,controls,renderer,rig,root}=tf,{engine,library,core}=await modules();
  const player=new core.FacialPlayer(root),rows=Math.ceil(cells.length/cols);
  player.setGain(gain||tf.library?.player?.gain||core.suggestGain(player.bindings));
  clear();overlay=document.createElement('canvas');overlay.width=cols*cw*scale;overlay.height=rows*ch*scale;
  overlay.style.cssText=`position:fixed;left:0;top:0;width:${cols*cw}px;height:${rows*ch}px;z-index:9999;background:${background}`;
  const g=overlay.getContext('2d'),saved={size:renderer.getSize(new T.Vector2()),aspect:camera.aspect,position:camera.position.clone(),target:controls.target.clone(),fov:camera.fov};
  renderer.setSize(cw*scale,ch*scale,false);camera.aspect=cw/ch;
  const notes=[];
  try{
    cells.forEach((cell,index)=>{
      let label=cell.label||'';
      if(cell.acting){
        const recipe=library.ACTING_BY_ID.get(cell.style?cell.acting+'@'+cell.style:cell.acting),project=library.actingProject(cell.acting,undefined,cell.style),instance=project.instances[0];
        if(cell.intensity!==undefined){instance.intensity=cell.intensity;instance.acting.intensity=cell.intensity;}
        const time=cell.t==='peak'?recipe.duration*(recipe.peak??.45):cell.t??recipe.duration*.45;
        engine.applyActingProject(rig,project,time,library.ACTING_BY_ID);
        player.apply(core.evaluate(project.presets,project.instances,time));
        label||=`${cell.acting.slice(-2)}${cell.style||''} ${recipe.name} · ${time.toFixed(2)}s`;
        if(cell.collisions){const a=engine.armPenetration(rig),l=engine.limbPenetration?.(rig),mm=x=>Math.round(Math.abs(x)*1000);label+=` · tronco ${mm(a.L)}/${mm(a.R)} muslo ${l?mm(l.thigh.L)+'/'+mm(l.thigh.R):'-'} brazos ${l?mm(Math.max(l.arm.L,l.arm.R)):'-'} mm`;}
      }else if(cell.pose){engine.applyActingPose(rig,cell.pose);player.apply(cell.face||{});label||=cell.name||'pose';}
      else{rig.resetToRest();player.apply(cell.face||{});}
      if(cell.weights)for(const [name,value] of Object.entries(cell.weights))for(const b of player.bindings[name]||[])b.mesh.morphTargetInfluences[b.index]=value;
      root.updateMatrixWorld(true);
      const head=rig.bone('head').getWorldPosition(new T.Vector3()),hips=rig.bone('hips').getWorldPosition(new T.Vector3()),h=rig.hipsHeight,view=cell.view||'face';
      // El primer plano sigue a la cabeza (se juzga la expresión); busto y cuerpo se ven desde el frente, como el público.
      const turn=view==='face'&&!cell.front?rig.bone('head').getWorldQuaternion(new T.Quaternion()).multiply(rig.restWorldQ.head.clone().invert()):new T.Quaternion();
      const forward=rig.frame.fwd.clone().applyQuaternion(turn),up=rig.frame.up.clone().applyQuaternion(turn),left=rig.frame.left.clone().applyQuaternion(turn),yaw=(cell.yaw||0)*Math.PI/180;
      let target,distance;
      if(view==='face'){target=head.clone().addScaledVector(up,h*.065).addScaledVector(forward,h*.1);distance=h*.74*Math.max(1,.8/(cw/ch));camera.fov=20;}
      else if(view==='bust'){target=head.clone().addScaledVector(up,-h*.12);distance=h*2.2*Math.max(1,.62/(cw/ch));camera.fov=24;}
      // Cintura: manos, cadera y muslos de cerca (para ver si la mano atraviesa el pantalón).
      else if(view==='waist'){target=hips.clone().addScaledVector(up,-h*.08);distance=h*2*Math.max(1,.62/(cw/ch));camera.fov=24;}
      else {target=rig.restWorldPos.hips.clone().addScaledVector(up,h*.02);distance=h*4.6*Math.max(1,.5/(cw/ch));camera.fov=28;}
      camera.updateProjectionMatrix();
      camera.position.copy(target).addScaledVector(forward,Math.cos(yaw)*distance).addScaledVector(left,Math.sin(yaw)*distance).addScaledVector(up,view==='body'?h*.1:0);
      camera.up.copy(up);camera.lookAt(target);camera.updateMatrixWorld(true);renderer.render(scene,camera);
      const x=index%cols*cw*scale,y=Math.floor(index/cols)*ch*scale;g.drawImage(renderer.domElement,x,y,cw*scale,ch*scale);
      g.fillStyle='#000a';g.fillRect(x,y,cw*scale,15*scale);g.fillStyle='#fff';g.font=`${10.5*scale}px system-ui`;g.fillText(label,x+4*scale,y+11*scale,cw*scale-8*scale);
      notes.push(label);
    });
  }finally{
    player.restore();rig.resetToRest();camera.up.set(0,1,0);renderer.setSize(saved.size.x,saved.size.y,false);camera.aspect=saved.aspect;camera.fov=saved.fov;camera.updateProjectionMatrix();camera.position.copy(saved.position);controls.target.copy(saved.target);controls.update();
  }
  document.body.append(overlay);return notes;
}
/** Secuencia temporal de una actuación: n fotogramas repartidos por su duración. */
export async function strip(id,{n=8,view='body',intensity,style,yaw,from=0,to=1,...options}={}){
  const {library}=await modules(),recipe=library.ACTING_BY_ID.get(style?id+'@'+style:id);
  return sheet(Array.from({length:n},(_,i)=>({acting:id,style,yaw,t:recipe.duration*(from+(to-from)*(n===1?.5:i/(n-1))),view,intensity,label:`${id.slice(-2)}${style||''} · ${(recipe.duration*(from+(to-from)*(n===1?.5:i/(n-1)))).toFixed(2)}s`})),options);
}
