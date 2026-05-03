import { SharkFightsHeader } from "@/components/ufc/sharkfights-ufc";

export const dynamic = "force-dynamic";

export default function SharkFightsPage() {
  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <SharkFightsHeader title="Fight intelligence" subtitle="Open UFC Fight IQ to see cached SharkSim picks, method probabilities, engine breakdowns, danger flags, and fight-by-fight reasons." />
      </div>
    </main>
  );
}
