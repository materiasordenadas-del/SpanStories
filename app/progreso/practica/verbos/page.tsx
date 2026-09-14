import { ConjugationScreen } from "@/components/visual/screens/ConjugationScreen";
import { getPracticeOccurrences } from "@/lib/adapters/practice-library";

export default async function VerbsPracticePage({ searchParams }: { searchParams: Promise<{ origen?: string | string[] }> }) {
  const { origen } = await searchParams;
  return <ConjugationScreen initialSource={origen === "historias" ? "historias" : "todos"} occurrences={await getPracticeOccurrences()} />;
}
