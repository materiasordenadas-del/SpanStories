import { StoryReaderScreen } from "@/components/visual/screens/StoryReaderScreen";
import { getStoryReaderViewModel } from "@/features/story-reader/reader";

export default async function StoryPage({ params, searchParams }: { params: Promise<{ island: string; story: string }>; searchParams: Promise<{ modo?: string; escena?: string }> }) {
  const { island, story } = await params;
  const { modo, escena } = await searchParams;
  const requestedScene = Number(escena);
  const initialScene = Number.isInteger(requestedScene) ? Math.min(Math.max(requestedScene, 1), 9) - 1 : 0;
  const storyModel = await getStoryReaderViewModel(island, story);
  return <StoryReaderScreen island={island} story={story} initialMode={modo === "ilustracion" ? "illustration" : "read"} initialScene={initialScene} storyModel={storyModel} />;
}
