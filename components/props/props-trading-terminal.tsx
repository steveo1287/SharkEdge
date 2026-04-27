import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { PropsTable } from "@/components/props/props-table";
import { PlayerSimExposurePanel } from "@/components/props/player-sim-exposure-panel";
import type { PropCardView } from "@/lib/types/domain";

function pct(value: number | null | undefined) {
  return typeof value === "number" ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number") return "--";
  return value > 0 ? `+${value}` : String(value);
}

function getDecision(prop: PropCardView) {
  const ev = prop.expectedValuePct ?? 0;
  const books = prop.sportsbookCount ?? 1;
  const edge = prop.edgeScore?.score ?? 0;
  if (ev >= 3 && books >= 2 && edge >= 65) return "ATTACK";
  if (ev >= 1 || edge >= 55) return "WATCH";
  return "PASS";
}

function decisionTone(decision: string) {
  if (decision === "ATTACK") return "success" as const;
  if (decision === "WATCH") return "premium" as const;
  return "muted" as const;
}

function TerminalMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="surface-panel p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bone/45">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-bone/55">{sub}</div>
    </Card>
  );
}

function TopPlayCard({ prop, rank }: { prop: PropCardView; rank: number }) {
  const decision = getDecision(prop);

  return (
    <Card className="surface-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-aqua/25 bg-aqua/10 font-mono text-xs text-aqua">#{rank}</div>
          <div>
            <div className="font-semibold text-white">{prop.player.name}</div>
            <div className="text-xs text-bone/50">{prop.team.abbreviation} vs {prop.opponent.abbreviation}</div>
          </div>
        </div>
        <Badge tone={decisionTone(decision)}>{decision}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-bone/[0.08] bg-panel p-2">
          <div className="text-bone/45">Line</div>
          <div className="mt-1 font-mono text-white">{prop.line}</div>
        </div>
        <div className="rounded-md border border-bone/[0.08] bg-panel p-2">
          <div className="text-bone/45">Best</div>
          <div className="mt-1 font-mono text-white">{odds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}</div>
        </div>
        <div className="rounded-md border border-bone/[0.08] bg-panel p-2">
          <div className="text-bone/45">EV</div>
          <div className="mt-1 font-mono text-white">{pct(prop.expectedValuePct)}</div>
        </div>
      </div>

      <div className="mt-3 text-xs leading-5 text-bone/55">
        {prop.supportNote ?? prop.analyticsSummary?.reason ?? "Market context available."}
      </div>

      <div className="mt-4 flex gap-2">
        <a href="#player-sims" className="rounded-md border border-aqua/30 bg-aqua/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-aqua">
          Sim
        </a>
        <Link href="/nba-edge" className="rounded-md border border-bone/[0.12] bg-panel px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-bone/65">
          Engine
        </Link>
      </div>
    </Card>
  );
}

export function PropsTradingTerminal({
  props,
  sourceNote,
  providerLabel,
  selectedLeagueLabel,
  realBookCount
}: {
  props: PropCardView[];
  sourceNote: string;
  providerLabel: string;
  selectedLeagueLabel: string;
  realBookCount: number;
}) {
  const attack = props.filter((prop) => getDecision(prop) === "ATTACK");
  const watch = props.filter((prop) => getDecision(prop) === "WATCH");
  const positiveEv = props.filter((prop) => (prop.expectedValuePct ?? -999) > 0);
  const top = [...props]
    .sort((a, b) => {
      const ev = (b.expectedValuePct ?? -999) - (a.expectedValuePct ?? -999);
      if (ev !== 0) return ev;
      return (b.edgeScore?.score ?? 0) - (a.edgeScore?.score ?? 0);
    })
    .slice(0, 6);

  return (
    <div className="grid gap-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="section-kicker">Props Trading Terminal</div>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-white">
              Edge board. Signal first. Noise last.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-bone/65">
              Live prop markets ranked like a trading desk: best price, EV, market depth, sim path, and execution tools surfaced before the full table.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#player-sims" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-aqua">Player Sims</a>
            <Link href="/nba-edge" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-aqua">NBA Edge</Link>
            <Link href="/api/jobs/nba-batch-sim" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">Refresh Sims</Link>
            <Badge tone="muted">{providerLabel}</Badge>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <TerminalMetric label="Scope" value={selectedLeagueLabel} sub="Active filter" />
        <TerminalMetric label="Rows" value={String(props.length)} sub="Tradable board entries" />
        <TerminalMetric label="Attack" value={String(attack.length)} sub="Cleared decision gate" />
        <TerminalMetric label="Positive EV" value={String(positiveEv.length)} sub="Market-derived EV" />
        <TerminalMetric label="Books" value={String(realBookCount)} sub="Price sources" />
      </section>

      <section className="grid gap-4">
        <SectionTitle eyebrow="Top of board" title="Best opportunities surfaced first" description="Highest EV and strongest edge rows get pulled out before the full table." />
        {top.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {top.map((prop, index) => <TopPlayCard key={prop.id} prop={prop} rank={index + 1} />)}
          </div>
        ) : (
          <Card className="surface-panel p-6 text-sm text-bone/55">No top opportunities available for this filter set.</Card>
        )}
      </section>

      <PlayerSimExposurePanel props={props} />

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="surface-panel p-5">
          <div className="section-kicker">Decision Queue</div>
          <div className="mt-4 grid gap-3">
            {[
              ["ATTACK", attack.length, "Rows with positive EV, book depth, and strong edge score"],
              ["WATCH", watch.length, "Rows close to playable but missing one gate"],
              ["PASS", Math.max(0, props.length - attack.length - watch.length), "Rows kept visible but deprioritized"]
            ].map(([label, count, desc]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-bone/[0.08] bg-panel p-3">
                <div>
                  <Badge tone={decisionTone(String(label))}>{label}</Badge>
                  <div className="mt-2 text-xs text-bone/55">{desc}</div>
                </div>
                <div className="font-mono text-2xl text-white">{count}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="surface-panel p-5">
          <div className="section-kicker">Feed Note</div>
          <p className="mt-3 text-sm leading-7 text-bone/60">{sourceNote}</p>
          <div className="mt-4 grid gap-2 text-xs text-bone/50">
            <div>Use NBA Edge to inspect the full data-driven model stack.</div>
            <div>Use Refresh Sims before slate lock to warm the batch cache.</div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4">
        <SectionTitle eyebrow="Full board" title="Trading table" description="Dense view remains available after the system surfaces the strongest opportunities." />
        <PropsTable props={props} />
      </section>
    </div>
  );
}
