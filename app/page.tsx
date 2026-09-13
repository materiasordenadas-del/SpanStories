import { LandingScreen } from "@/components/visual/screens/LandingScreen";
import { getA1Catalog } from "@/lib/adapters/a1-catalog";

export default function HomePage() {
  const { islands, storyCount } = getA1Catalog();
  return <LandingScreen islandNames={islands.map((island) => island.name)} storyCount={storyCount} />;
}
