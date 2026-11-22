import {ARKIT,clamp,FacialPlayer} from './FacialCore.mjs';

// A hand-authored 27-channel rig is an approximation, never advertised as ARKit-52.
const legacy={
  eyeBlinkLeft:['Parpadeo.L'],eyeBlinkRight:['Parpadeo.R'],eyeWideLeft:['OjoAbierto.L'],eyeWideRight:['OjoAbierto.R'],eyeSquintLeft:['OjoEntrecerrado.L'],eyeSquintRight:['OjoEntrecerrado.R'],cheekSquintLeft:['OjoFeliz.L'],cheekSquintRight:['OjoFeliz.R'],
  browOuterUpLeft:['CejaArriba.L'],browOuterUpRight:['CejaArriba.R'],browInnerUp:['CejaTriste.L','CejaTriste.R'],browDownLeft:['CejaAbajo.L'],browDownRight:['CejaAbajo.R'],
  jawOpen:['BocaAbierta'],mouthClose:['BocaCerrada'],mouthSmileLeft:['ComisuraArriba.L','BocaSonrisa'],mouthSmileRight:['ComisuraArriba.R','BocaSonrisa'],mouthFrownLeft:['ComisuraAbajo.L','BocaTriste'],mouthFrownRight:['ComisuraAbajo.R','BocaTriste'],mouthFunnel:['BocaO'],mouthPucker:['BocaO'],mouthStretchLeft:['BocaAncha'],mouthStretchRight:['BocaAncha'],
  eyeLookOutLeft:['MirarIzquierda'],eyeLookInRight:['MirarIzquierda'],eyeLookInLeft:['MirarDerecha'],eyeLookOutRight:['MirarDerecha'],eyeLookUpLeft:['MirarArriba'],eyeLookUpRight:['MirarArriba'],eyeLookDownLeft:['MirarAbajo'],eyeLookDownRight:['MirarAbajo']
};
export function facialPlayerForRig(root,aliases={}){
  if(Object.keys(aliases).length)return new FacialPlayer(root,aliases);
  let spanish=false;root.traverse(m=>{if(m.morphTargetDictionary?.['Parpadeo.L']!==undefined)spanish=true;});
  if(!spanish)return new FacialPlayer(root);
  const bindings=Object.fromEntries(ARKIT.map(n=>[n,[]])),targets=[],functional=new Set(),measured=new Set(),meshes=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;
    const byIndex=new Map();
    for(const n of ARKIT)for(const alias of legacy[n]||[]){
      // Prefer independent mouth corners when the mesh provides them.
      if(alias==='BocaSonrisa'&&mesh.morphTargetDictionary[n.endsWith('Left')?'ComisuraArriba.L':'ComisuraArriba.R']!==undefined)continue;
      if(alias==='BocaTriste'&&mesh.morphTargetDictionary[n.endsWith('Left')?'ComisuraAbajo.L':'ComisuraAbajo.R']!==undefined)continue;
      const index=mesh.morphTargetDictionary[alias];if(!Number.isInteger(index)||index<0||index>=mesh.morphTargetInfluences.length)continue;
      bindings[n].push({mesh,index,original:alias});
      if(!byIndex.has(index)){const item={mesh,index,channels:[]};byIndex.set(index,item);targets.push(item);}byIndex.get(index).channels.push(n);
      const attr=mesh.geometry?.morphAttributes?.position?.[index],base=mesh.geometry?.attributes?.position;
      if(attr&&base){measured.add(n);for(let v=0;v<attr.count;v++){const d=Math.hypot(attr.getX(v)-(mesh.geometry.morphTargetsRelative?0:base.getX(v)),attr.getY(v)-(mesh.geometry.morphTargetsRelative?0:base.getY(v)),attr.getZ(v)-(mesh.geometry.morphTargetsRelative?0:base.getZ(v)));if(d>1e-8){functional.add(n);break;}}}
    }
    meshes.push({name:mesh.name,targetCount:mesh.morphTargetInfluences.length});
  });
  const present=ARKIT.filter(n=>bindings[n].length);let saved=null;
  return {bindings,enabled:false,gain:{},setGain(){return this;},report:{rig:'Canales españoles (adaptación aproximada)',present,functional:[...functional],unmeasured:present.filter(n=>!measured.has(n)),missing:ARKIT.filter(n=>!bindings[n].length),zeroDelta:present.filter(n=>measured.has(n)&&!functional.has(n)),meshes,visualApproval:false},
    apply(weights){if(!saved)saved=targets.map(t=>({...t,value:t.mesh.morphTargetInfluences[t.index]}));this.enabled=true;for(const t of targets)t.mesh.morphTargetInfluences[t.index]=Math.max(...t.channels.map(n=>clamp(weights[n]||0)));},
    restore(){if(saved)for(const t of saved)t.mesh.morphTargetInfluences[t.index]=t.value;saved=null;this.enabled=false;}
  };
}
