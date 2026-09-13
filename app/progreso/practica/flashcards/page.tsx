import { FlashcardsScreen } from "@/components/visual/screens/FlashcardsScreen";
import { getPracticeOccurrences } from "@/lib/adapters/practice-library";

export default async function FlashcardsPage() {
  return <FlashcardsScreen occurrences={await getPracticeOccurrences()} />;
}
