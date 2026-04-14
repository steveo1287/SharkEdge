import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sim Workbench",
  description: "Monte Carlo simulation workbench — game totals, spreads, and player props",
};

export const dynamic = "force-dynamic";

export default function SimPage() {
  return (
    <div className="grid gap-6">
      <div>
        <div className="eyebrow-blue">Model Deck</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white xl:text-3xl">
          Simulation Workbench
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Monte Carlo engine · 10,000 simulations per run. Work the book mesh against the model across game markets and player props.
        </p>
      </div>
      <SimWorkbenchClient />
    </div>
  );
}

// ── CLIENT ISLAND ────────────────────────────────────────────────────────────
// We isolate the fully interactive workbench into its own client component so
// the outer page stays a server component (metadata, SEO, etc).
// The actual game/event sim (SimulationIntelligencePanel) lives at /game/[id].
// This standalone page is a general-purpose workbench with no event context.

import { SimWorkbenchClient } from "./_client";
