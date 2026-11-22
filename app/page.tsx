import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/escenarios?modo=estudio");
}
