import { ProtectedAccount } from "@/components/accounts/ProtectedAccount";
import { TeacherProgressScreen } from "@/components/accounts/teacher/ProgressScreen";
import { getPublishedStories } from "@/lib/adapters/teacher-lookup";

export default async function TeacherProgressPage() {
  return <ProtectedAccount bare role="teacher"><TeacherProgressScreen stories={await getPublishedStories()} /></ProtectedAccount>;
}
