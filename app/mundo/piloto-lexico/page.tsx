import type { Metadata } from "next";
import { PilotWorldLexicon } from "@/components/world-lexicon/PilotWorldLexicon";
import type { StudioSource } from '@/features/story-studio/model';

// Piloto de interacción léxica: no se enlaza desde la navegación ni se indexa.
export const metadata: Metadata = { title: "Barcelona · Piloto de vocabulario", robots: { index: false, follow: false } };

export default async function PilotoLexicoPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const query=new URLSearchParams();
  const studio=process.env.NODE_ENV==='development'&&params.modo==='historia';
  const releaseId=params.modo==='reproducir'?(typeof params.publicacion==='string'&&params.publicacion?params.publicacion:'invalid-publication'):undefined;
  const studioSources:StudioSource[]=[];
  if(studio||releaseId){
    const {getStoryOneReaderViewModel}=await import('@/features/story-reader/story-one');
    const reader=await getStoryOneReaderViewModel();
    studioSources.push({storyId:reader.storyId,storyVersionId:reader.storyVersionId,title:reader.title,status:reader.eventContext.version.status,blueprintId:reader.storyBlueprintId,sentences:reader.sentences,reader});
  }
  for(const [key,value] of Object.entries(params))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);
  return <PilotWorldLexicon query={query.toString()} studio={studio} releaseId={releaseId} studioSources={studioSources} development={process.env.NODE_ENV==='development'&&params.modo==='desarrollo'} localTest={process.env.NODE_ENV==='development'&&params.prueba==='1'} draft={process.env.NODE_ENV==='development'&&params.borrador==='1'} narrative={params.historia==='1'} />;
}
