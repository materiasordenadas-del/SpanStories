import { ProtectedAccount } from "@/components/accounts/ProtectedAccount";
import { TeacherStudentScreen } from "@/components/accounts/teacher/StudentScreen";
import { getPublishedStories, getSavedWordLabels } from "@/lib/adapters/teacher-lookup";

export default async function TeacherStudentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string | string[] }>;
}) {
  const [{ id }, { vista }, stories, words] = await Promise.all([params, searchParams, getPublishedStories(), getSavedWordLabels()]);
  return <ProtectedAccount bare role="teacher">
    <TeacherStudentScreen stories={stories} studentId={decodeURIComponent(id)} view={vista === "tareas" ? "tareas" : "progreso"} words={words} />
  </ProtectedAccount>;
}
