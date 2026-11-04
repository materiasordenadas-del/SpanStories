import type { Story, StorySentence, StoryVersion } from '../domain/model.ts';

export type NarrativeScene={readonly id:string;readonly zoneId:string;readonly sentenceId?:string;readonly entryIds:readonly string[];readonly camera:{readonly position:readonly number[];readonly target:readonly number[]}};
export type NarrativeBinding={readonly storyId:string;readonly storyVersionId:string;readonly scenes:readonly NarrativeScene[]};

/** Secuencia lineal del Story Engine. Los intentos léxicos no hacen avanzar esta sesión. */
export function createNarrativeSession(input:{story:Story;version:StoryVersion;sentences:readonly StorySentence[];binding:NarrativeBinding}){
  const {story,version,sentences,binding}=input;
  if(binding.storyId!==story.id||binding.storyVersionId!==version.id||version.storyId!==story.id||!binding.scenes.length)throw new Error('Vínculo narrativo incompatible.');
  const ids=new Set<string>();
  for(const s of binding.scenes){
    if(ids.has(s.id)||!s.zoneId||!s.entryIds.every(id=>typeof id==='string')||
      ![s.camera.position,s.camera.target].every(v=>v.length===3&&v.every(Number.isFinite))||
      (s.sentenceId&&!sentences.some(v=>v.id===s.sentenceId&&v.storyVersionId===version.id)))throw new Error('Momento narrativo inválido.');
    ids.add(s.id);
  }
  let index=0,finished=false;
  return {
    current(){return {scene:binding.scenes[index],text:sentences.find(s=>s.id===binding.scenes[index].sentenceId)?.text??'Explora los objetos de esta escena.',index,total:binding.scenes.length,finished};},
    next(){if(index<binding.scenes.length-1)index++;else finished=true;return this.current();},
    restart(){index=0;finished=false;return this.current();}
  };
}
