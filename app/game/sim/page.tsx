import { redirect } from "next/navigation";

export default function LegacySimRedirectPage() {
  redirect("/sim");
}
