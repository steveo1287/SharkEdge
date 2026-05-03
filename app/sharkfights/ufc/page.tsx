import { SharkFightsHeader, UfcCardGrid } from "@/components/ufc/sharkfights-ufc";
import { getUfcCards } from "@/services/ufc/card-feed";

export const dynamic = "force-dynamic";

export default async function SharkFightsUfcPage() {
  const cards = await getUfcCards({ includePast: true });
  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader title="UFC SharkSim" subtitle="Choose a UFC card, then open each fight for the model pick, how the fighter wins, method probabilities, round finish distribution, and engine diagnostics." />
        <UfcCardGrid cards={cards} />
      </div>
    </main>
  );
}
