import { StoryListScreen } from "@/components/visual/screens/StoryListScreen";

export default async function IslandPage({ params }: { params: Promise<{ island: string }> }) { const { island } = await params; return <StoryListScreen island={island} />; }
