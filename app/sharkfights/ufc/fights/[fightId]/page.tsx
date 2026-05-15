import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ fightId: string }>;
};

export const dynamic = "force-dynamic";

export default async function LegacyUfcFightPage({ params }: PageProps) {
  const { fightId } = await params;
  redirect(`/sim/ufc/fights/${encodeURIComponent(fightId)}`);
}
