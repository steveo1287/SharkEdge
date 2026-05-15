import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SharkFightsPage() {
  redirect("/sim/ufc");
}
