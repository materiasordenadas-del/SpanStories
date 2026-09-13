import { notFound } from "next/navigation";
import { StoryListScreen } from "@/components/visual/screens/StoryListScreen";
import { getA1Catalog, getA1IslandForReading } from "@/lib/adapters/a1-catalog";

export default async function IslandPage({ params }: { params: Promise<{ island: string }> }) {
  const { island: islandParam } = await params;
  const island = await getA1IslandForReading(islandParam);
  if (island === undefined) notFound();
  const { islands } = getA1Catalog();
  const previousIsland = islands[islands.findIndex((candidate) => candidate.id === island.id) - 1];
  return <StoryListScreen island={island} previousIsland={previousIsland} />;
}
