import { PracticeHubScreen } from "@/components/visual/screens/PracticeHubScreen";
import { getPracticeOccurrences } from "@/lib/adapters/practice-library";

export default async function PracticePage() {
  return <PracticeHubScreen occurrences={await getPracticeOccurrences()} />;
}
