import { ProgressScreen } from "@/components/visual/screens/ProgressScreen";
import { getA1CatalogForReading } from "@/lib/adapters/a1-catalog";

export default async function ProgressPage() {
  const { modules, storyCount } = await getA1CatalogForReading();
  return <ProgressScreen modules={modules} storyCount={storyCount} />;
}
