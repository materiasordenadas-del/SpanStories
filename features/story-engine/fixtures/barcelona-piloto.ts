import { asId, assembleStoryVersion, createStory, type StorySentence } from '../index.ts';

/** Prueba técnica DRAFT sin blueprint: no inventa una historia curricular ni se publica. */
export function buildBarcelonaPilot(){
  const clock={now:()=>new Date('2026-10-21T00:00:00Z')};
  const story=createStory(asId('StoryId','story-barcelona-piloto'),null,clock);
  const id=asId('StoryVersionId','storyver-barcelona-piloto-1');
  const texts=['El paseo comienza en Barcelona. Toca el objeto que ves para escucharlo.',
    'El recorrido continúa junto a una fachada. Puedes explorar su vocabulario.',
    'Ahora observa el espacio por el que pasa la gente.',
    'El recorrido llega a un edificio destacado de Barcelona.',
    'Observa su entrada. Puedes practicar o terminar el recorrido.'];
  const sentences:StorySentence[]=texts.map((text,i)=>({id:asId('SentenceId',`sent-barcelona-${i+1}`),storyVersionId:id,order:i+1,text,tokens:[]}));
  const version=assembleStoryVersion({id,storyId:story.id,versionNumber:1,title:'Un paseo por Barcelona',sentences,status:'DRAFT',clock});
  return {story,version,sentences};
}
