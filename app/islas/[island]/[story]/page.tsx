import { notFound, redirect } from "next/navigation";
import { StoryReaderScreen } from "@/components/visual/screens/StoryReaderScreen";
import { getStoryReaderViewModel } from "@/features/story-reader/reader";
import { getA1Island, getA1Story } from "@/lib/adapters/a1-catalog";

export default async function StoryPage({ params, searchParams }: { params: Promise<{ island: string; story: string }>; searchParams: Promise<{ modo?: string; escena?: string }> }) {
  const { island, story } = await params;
  const { modo, escena } = await searchParams;
  const catalogIsland = getA1Island(island);
  if (catalogIsland === undefined || getA1Story(island, story) === undefined) notFound();
  // Una isla sin historias publicadas no debe mostrar el texto provisional del lector.
  if (!catalogIsland.published) redirect(catalogIsland.href);
  const storyModel = await getStoryReaderViewModel(island, story);
  const requestedScene = Number(escena);
  const initialScene = Number.isInteger(requestedScene) ? Math.min(Math.max(requestedScene, 1), Math.max(storyModel.scenes.length, 1)) - 1 : 0;
  return <StoryReaderScreen island={island} story={story} initialMode={modo === "ilustracion" ? "illustration" : "read"} initialScene={initialScene} storyModel={storyModel} />;
}
