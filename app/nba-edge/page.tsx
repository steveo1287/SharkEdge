import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getNbaSimCacheStats } from "@/services/nba/nba-batch-sim-cache";

const PIPELINE = [
  "DataBallr player context",
  "Minutes + usage model",
  "Lineup + injury engine",
  "NBA accuracy layer",
  "Adaptive player layer",
  "Market + CLV + sharp layer",
  "Bankroll sizing"
];

const ACTIONS = [
  { href: "/props?league=NBA", title: "Open NBA Props", desc: "Run the edge engine against live NBA prop markets." },
  { href: "/sim/players?league=NBA", title: "Player Sim", desc: "Deep dive into player prop distributions and model drivers." },
  { href: "/sim/validation", title: "Validation", desc: "Check hit rate, ROI, calibration, and model bucket performance." },
  { href: "/api/jobs/nba-batch-sim", title: "Refresh Batch Sims", desc: "Precompute the NBA prop board cache." },
  { href: "/api/debug/databallr?player=LeBron%20James", title: "DataBallr Debug", desc: "Verify endpoint mapping and response fields." }
];

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="surface-panel p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bone/45">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-bone/55">{sub}</div>
    </Card>
  );
}

export default function NbaEdgePage() {
  const cache = getNbaSimCacheStats();

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-kicker">NBA Edge Engine</div>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-white">
              NBA Player Prop Command Center
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-bone/65">
              Data-driven player simulation, role projection, injury impact, market intelligence, CLV, and bankroll sizing surfaced in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/props?league=NBA" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-aqua">NBA Props</Link>
            <Link href="/api/jobs/nba-batch-sim" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">Refresh Sims</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatTile label="Cache Entries" value={String(cache.size)} sub="Precomputed NBA sim rows" />
        <StatTile label="Cache TTL" value={`${Math.round(cache.ttlMs / 60000)}m`} sub="Auto-refresh window" />
        <StatTile label="Pipeline" value="7" sub="Active modeling layers" />
        <StatTile label="Data Source" value="DBR" sub="DataBallr context ready" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card className="surface-panel p-5">
          <div className="section-kicker">Live Pipeline</div>
          <div className="mt-4 grid gap-3">
            {PIPELINE.map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-bone/[0.08] bg-panel px-3 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-aqua/25 bg-aqua/10 font-mono text-xs text-aqua">{index + 1}</div>
                <div className="text-sm font-medium text-bone/80">{item}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="surface-panel p-5">
          <div className="section-kicker">Actions</div>
          <div className="mt-4 grid gap-3">
            {ACTIONS.map((action) => (
              <Link key={action.href} href={action.href} className="rounded-md border border-bone/[0.08] bg-panel p-3 transition-colors hover:border-aqua/30">
                <div className="text-sm font-semibold text-white">{action.title}</div>
                <div className="mt-1 text-xs leading-5 text-bone/55">{action.desc}</div>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <Card className="surface-panel p-5">
        <div className="section-kicker">What Surfaces Here</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-bone/[0.08] bg-panel p-4">
            <div className="font-semibold text-white">Player Role</div>
            <p className="mt-2 text-sm leading-6 text-bone/55">Projected minutes, usage, injury status, lineup redistribution, and rotation volatility.</p>
          </div>
          <div className="rounded-md border border-bone/[0.08] bg-panel p-4">
            <div className="font-semibold text-white">Market Edge</div>
            <p className="mt-2 text-sm leading-6 text-bone/55">Book depth, price delta, line movement, CLV pressure, steam, and sharp-risk flags.</p>
          </div>
          <div className="rounded-md border border-bone/[0.08] bg-panel p-4">
            <div className="font-semibold text-white">Execution</div>
            <p className="mt-2 text-sm leading-6 text-bone/55">Calibrated probability, fair odds, decision gate, risk flags, and bankroll-sized stake guidance.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
