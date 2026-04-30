import { SimMetricTile, SimSignalCard, SimWorkspaceHeader } from "@/components/sim/sim-ui";

export default function SimLoading() {
  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="Simulation Command Desk"
        title="Loading cached sim snapshots."
        description="The hub reads cache only; provider and projection work runs in scheduled refresh jobs."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetricTile label="Shell" value="Loading" sub="Fast route" emphasis="strong" />
          <SimMetricTile label="Priority cache" value="Reading" sub="No live projection batch" />
          <SimMetricTile label="NBA slate" value="..." sub="On demand" />
          <SimMetricTile label="MLB slate" value="..." sub="On demand" />
        </div>
      </SimWorkspaceHeader>

      <section className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SimSignalCard key={index} className="h-52 animate-pulse bg-white/[0.035]">
            <span className="sr-only">Loading workspace card</span>
          </SimSignalCard>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
        <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
        <div className="mt-4 grid gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl border border-white/10 bg-white/[0.035]" />
          ))}
        </div>
      </section>
    </div>
  );
}
