import { ProtectedAccount } from "@/components/accounts/ProtectedAccount";
import { TeacherInviteScreen } from "@/components/accounts/teacher/InviteScreen";

export default async function TeacherInvitePage({ params, searchParams }: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ nueva?: string | string[] }>;
}) {
  const [{ code }, { nueva }] = await Promise.all([params, searchParams]);
  const value = decodeURIComponent(code).trim().toUpperCase();
  return <ProtectedAccount bare role="teacher"><TeacherInviteScreen code={value} isNew={nueva === "1"} key={value} /></ProtectedAccount>;
}
