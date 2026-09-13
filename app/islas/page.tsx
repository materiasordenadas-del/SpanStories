import { IslandsScreen } from "@/components/visual/screens/IslandsScreen";
import { getA1Catalog } from "@/lib/adapters/a1-catalog";

export default function IslandsPage() {
  const { islands, modules } = getA1Catalog();
  return <IslandsScreen islands={islands} moduleCount={modules.length} />;
}
