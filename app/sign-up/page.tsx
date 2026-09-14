import { redirect } from "next/navigation";
export default async function SignUpPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const next=typeof params.next==="string"?`&next=${encodeURIComponent(params.next)}`:"";redirect(`/sign-in?mode=sign-up${next}`)}
