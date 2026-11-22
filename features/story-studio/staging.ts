import type {Actor} from './model.ts';
export function snapActor(actor:Actor,step:number,rotationStep=15):Actor{
  if(!Number.isFinite(step)||step<=0||step>10||!Number.isFinite(rotationStep)||rotationStep<=0||rotationStep>180)throw Error('Paso de colocación inválido.');
  const snap=(v:number,unit:number)=>Number((Math.round(v/unit)*unit).toFixed(6));
  return {...structuredClone(actor),position:[snap(actor.position[0],step),actor.position[1],snap(actor.position[2],step)],rotation:snap(actor.rotation,rotationStep*Math.PI/180)};
}
export function alignActor(actor:Actor,target:Actor,mode:'x'|'z'|'face'):Actor{
  if(actor.id===target.id)throw Error('Elige otro personaje como referencia.');
  const copy=structuredClone(actor);
  if(mode==='face'){
    const x=target.position[0]-actor.position[0],z=target.position[2]-actor.position[2];if(Math.hypot(x,z)<.001)throw Error('Los personajes están en la misma posición.');
    copy.rotation=Math.atan2(x,z);
  }else if(mode==='x'||mode==='z'){const p=[...actor.position] as [number,number,number];p[mode==='x'?0:2]=target.position[mode==='x'?0:2];copy.position=p;}
  else throw Error('Alineación inválida.');
  return copy;
}
export const actorDistance=(a:Actor,b:Actor)=>Math.hypot(b.position[0]-a.position[0],b.position[2]-a.position[2]);
