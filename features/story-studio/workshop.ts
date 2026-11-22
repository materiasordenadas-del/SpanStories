import type {Cue,Sequence} from './model.ts';
/** Opening a workshop from a dialogue must reuse the actor's existing action, not create a duplicate. */
export function workshopAction(sequence:Sequence,actorId:string,selectedId:string|undefined,time:number){
  const cues=sequence.cues.filter((c):c is Extract<Cue,{kind:'actor'}>=>c.kind==='actor'&&c.actorId===actorId),selected=cues.find(c=>c.id===selectedId);
  if(selected)return {cue:selected,ambiguous:false};
  const active=cues.filter(c=>c.at<=time&&time<c.at+c.duration);
  if(active.length===1)return {cue:active[0],ambiguous:false};
  if(cues.length===1)return {cue:cues[0],ambiguous:false};
  return {cue:undefined,ambiguous:cues.length>1};
}
