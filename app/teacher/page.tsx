import { ProtectedAccount } from "@/components/accounts/ProtectedAccount";
import { TeacherStudentsScreen } from "@/components/accounts/teacher/StudentsScreen";
import { getPublishedStories } from "@/lib/adapters/teacher-lookup";

export default async function TeacherPage({ searchParams }: { searchParams: Promise<{ nueva?: string | string[] }> }) {
  const [{ nueva }, stories] = await Promise.all([searchParams, getPublishedStories()]);
  return <ProtectedAccount bare role="teacher"><TeacherStudentsScreen freshCode={typeof nueva === "string" ? nueva : null} stories={stories} /></ProtectedAccount>;
}
