import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function UfcLeaguePage() {
  redirect("/sharkfights/ufc");
}
