import { redirect } from "next/navigation";

export default function BetsRedirectPage() {
  redirect("/saved?tab=bets");
}
