import { LevelSelectorScreen } from "@/components/visual/screens/LevelSelectorScreen";
import { getA1Catalog } from "@/lib/adapters/a1-catalog";

export default function LevelsPage() {
  const { islands, storyCount } = getA1Catalog();
  return <LevelSelectorScreen a1IslandCount={islands.length} a1StoryCount={storyCount} />;
}
