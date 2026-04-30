import Link from "next/link";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimStatusBadge,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot,
  type SimSnapshotEnvelope
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkspaceConfig = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryMetric: string;
  secondaryMetric: string;
  action: string;
};

function formatPct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function isStale(snapshot: Pick<SimSnapshotEnvelope<Record<string, never>>, "stale"> | null | undefined) {
  return Boolean(snapshot?.stale);
}

function SnapshotNotice({
  priority,
  status
}: {
  priority: SimPrioritySnapshot | null;
  status: SimRefreshStatusSnapshot | null;
}) {
  if (!priority && !status) return null;
  const stale = isStale(priority);
  const failed = status && !status.ok;
  if (!stale && !failed) return null;

  return (
    <SimSignalCard className="border-amber-400/25 bg-amber-500/[0.07]">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
        {failed ? "Simulation snapshot unavailable" : "Showing last successful snapshot"}
      </div>
      <p className="mt-2 text-sm leading-6 text-amber-100/80">
        {failed
          ? `Last refresh failed${status.reason ? `: ${status.reason}` : "."}`
          : "The cached sim slate is stale, so SharkEdge is showing the last generated snapshot instead of blocking the page."}
      </p>
    </SimSignalCard>
  );
}

function WorkspaceCard({ config }: { config: WorkspaceConfig }) {
  return (
    <Link href={config.href} className="block h-full">
      <SimSignalCard className="group h-full transition hover:border-sky-400/35 hover:bg-sky-500/[0.055]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">{config.eyebrow}</div>
            <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">{config.title}</div>
          </div>
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">Open</span>
        </div>
        <p className="mt-4 min-h-[52px] text-sm leading-6 text-slate-400">{config.description}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <SimMetricTile label="Primary" value={config.primaryMetric} />
          <SimMetricTile label="Status" value={config.secondaryMetric} />
        </div>
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 group-hover:text-sky-100">{config.action} -&gt;</div>
      </SimSignalCard>
    </Link>
  );
}

function PriorityTable({ priority }: { priority: SimPrioritySnapshot | null }) {
  if (!priority?.rows.length) {
    return (
      <EmptyState
        eyebrow="Sim cache"
        title="Sim data has not been generated yet"
        description="The /sim hub no longer runs projection batches during page requests. The hourly sim-refresh cron will populate this snapshot cache."
      />
    );
  }

  return (
    <SimTableShell
      title="First decisions to check"
      description={priority.stale ? "Cached priority queue is stale; showing last successful snapshot." : "Cached NBA/MLB priority queue from the scheduled sim refresh."}
      right={<span className="text-xs text-slate-500">Generated {formatTime(priority.generatedAt)}</span>}
    >
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Game</th>
            <th className="px-4 py-3">Lean</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Market</th>
            <th className="px-4 py-3">Start</th>
            <th className="px-4 py-3">Open</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {priority.rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">{row.leagueKey}</span>
                  <SimStatusBadge status={row.status} />
                  <SimDecisionBadge tier={row.tier} />
                </div>
                <div className="mt-2 font-medium text-white">{row.matchup.away} @ {row.matchup.home}</div>
              </td>
              <td className="px-4 py-3 text-slate-300">
                <div className="font-medium text-white">{row.lean.team}</div>
                <div className="text-xs text-slate-500">Win {formatPct(row.lean.pct)} | Edge {formatPct(row.lean.edge)}</div>
              </td>
              <td className="px-4 py-3 text-slate-300">{formatPct(row.confidence)}</td>
              <td className="px-4 py-3 text-slate-300">{row.leagueKey === "MLB" ? (row.edgeMatched ? "Matched" : "No line") : "n/a"}</td>
              <td className="px-4 py-3 text-slate-300">{formatTime(row.startTime)}</td>
              <td className="px-4 py-3">
                <Link href={row.href} className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-300 hover:text-sky-100">
                  Detail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SimTableShell>
  );
}

export default async function SimHubPage() {
  // Cache boundary: do not call buildBoardSportSections, buildSimProjection, or buildMlbEdges here.
  // The expensive work belongs to /api/cron/sim-refresh and /api/cron/sim-market-refresh.
  const [hub, priority, market, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus)
  ]);

  const workspaces: WorkspaceConfig[] = [
    {
      href: "/sim/nba",
      eyebrow: "NBA workspace",
      title: "Player Sims + Side Queue",
      description: "Calibrated player box scores, prop drilldowns, confidence gates, and side reads in one tight board.",
      primaryMetric: String(hub?.summary.nbaCount ?? "Pending"),
      secondaryMetric: hub?.stale ? "Stale cache" : "Cached",
      action: "Open NBA desk"
    },
    {
      href: "/sim/mlb",
      eyebrow: "MLB workspace",
      title: "Sides + Totals Edge Desk",
      description: "Moneyline, total edge, pitcher/bullpen factors, market-line matching, and MLB Data API player-model status.",
      primaryMetric: String(hub?.summary.mlbCount ?? "Pending"),
      secondaryMetric: market?.stale ? "Market stale" : `${market?.lineCount ?? 0} lines`,
      action: "Open MLB desk"
    },
    {
      href: "/sim/players?league=NBA",
      eyebrow: "NBA drilldown",
      title: "Projected Player Box Scores",
      description: "Use this when the player prop board needs exact points, boards, assists, threes, PRA, floor and ceiling.",
      primaryMetric: "10k sims",
      secondaryMetric: "On demand",
      action: "Open player board"
    }
  ];

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="Simulation Command Desk"
        title="Cached sim snapshots first. Deep work only when you ask for it."
        description="The hub now reads hot-cache snapshots only, so a slow odds feed, model fetch, or projection batch cannot freeze first paint."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetricTile label="Hub cache" value={hub ? (hub.stale ? "Stale" : "Fresh") : "Missing"} sub="sim:hub:v1" emphasis={hub && !hub.stale ? "strong" : "normal"} />
          <SimMetricTile label="Priority rows" value={priority?.rows.length ?? 0} sub="sim:priority:v1" />
          <SimMetricTile label="MLB market" value={market ? (market.stale ? "Stale" : "Fresh") : "Missing"} sub="10-minute overlay" />
          <SimMetricTile label="Last refresh" value={status?.ok === false ? "Failed" : status?.running ? "Running" : "Ready"} sub={status?.generatedAt ? formatTime(status.generatedAt) : "Awaiting cron"} />
        </div>
      </SimWorkspaceHeader>

      <SnapshotNotice priority={priority} status={status} />

      <section className="grid gap-4 xl:grid-cols-3">
        {workspaces.map((workspace) => <WorkspaceCard key={workspace.href} config={workspace} />)}
      </section>

      <section className="grid gap-4">
        <SectionTitle title="First decisions to check" description="Generated by the hourly sim snapshot job, not during page render." />
        <PriorityTable priority={priority} />
      </section>
    </div>
  );
}
