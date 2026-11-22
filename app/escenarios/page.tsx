import type { Metadata } from "next";
import { PilotWorldLexicon } from "@/components/world-lexicon/PilotWorldLexicon";
import type { StudioSource } from '@/features/story-studio/model';

// Visor de escenarios (estudiante), Generador de mundos (?modo=generador), Editor de escenarios (?modo=editor) y Estudio (?modo=estudio): una sola página.
export const metadata: Metadata = { title: "Visor de escenarios", robots: { index: false, follow: false } };

export default async function EscenariosPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const query=new URLSearchParams();
  const studio=process.env.NODE_ENV==='development'&&params.modo==='estudio';
  const releaseId=params.modo==='reproducir'?(typeof params.publicacion==='string'&&params.publicacion?params.publicacion:'invalid-publication'):undefined;
  const editor=process.env.NODE_ENV==='development'&&params.modo==='editor';
  const generator=false;
  const studioSources:StudioSource[]=[];
  // El Editor también las carga: desde él se entra al Estudio sin navegar.
  if(studio||editor||generator||releaseId){
    const {getStoryOneReaderViewModel}=await import('@/features/story-reader/story-one');
    const reader=await getStoryOneReaderViewModel();
    studioSources.push({storyId:reader.storyId,storyVersionId:reader.storyVersionId,title:reader.title,status:reader.eventContext.version.status,blueprintId:reader.storyBlueprintId,sentences:reader.sentences,reader});
  }
  for(const [key,value] of Object.entries(params))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);
  return <PilotWorldLexicon query={query.toString()} generator={generator} studio={studio} releaseId={releaseId} studioSources={studioSources} development={editor} localTest={process.env.NODE_ENV==='development'&&params.prueba==='1'} draft={process.env.NODE_ENV==='development'&&params.borrador==='1'} narrative={params.historia==='1'} />;
}
