import { ProtectedAccount } from "@/components/accounts/ProtectedAccount";
import { TeacherTasksScreen } from "@/components/accounts/teacher/TasksScreen";
import { getPublishedStories } from "@/lib/adapters/teacher-lookup";

export default async function TeacherTasksPage() {
  return <ProtectedAccount bare role="teacher"><TeacherTasksScreen stories={await getPublishedStories()} /></ProtectedAccount>;
}
