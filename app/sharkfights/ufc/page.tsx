import { UfcPipelineStatusPanel } from "@/components/ufc/pipeline-status-panel";
import { SharkFightsHeader, UfcCardGrid } from "@/components/ufc/sharkfights-ufc";
import { getUfcCards } from "@/services/ufc/card-feed";
import { getUfcPipelineStatus } from "@/services/ufc/pipeline-status";

export const dynamic = "force-dynamic";

export default async function SharkFightsUfcPage() {
  const [cards, status] = await Promise.all([getUfcCards({ includePast: true }), getUfcPipelineStatus()]);
  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader title="UFC SharkSim" subtitle="Choose a UFC card, then open each fight for the model pick, how the fighter wins, method probabilities, round finish distribution, and engine diagnostics." />
        <UfcPipelineStatusPanel status={status} />
        <UfcCardGrid cards={cards} />
      </div>
    </main>
  );
}
