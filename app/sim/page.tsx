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
import { readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";
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

const DISPLAY_TIME_ZONE = "America/Chicago";
const SIM_REFRESH_INTERVAL_MINUTES = 10;
const SIM_MARKET_REFRESH_INTERVAL_MINUTES = 5;
const NBA_WAREHOUSE_KINDS: NbaWarehouseKind[] = ["team", "player", "history", "rating"];

type WorkspaceConfig = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryMetric: string;
  secondaryMetric: string;
  action: string;
};

type WarehouseHealth = {
  kind: NbaWarehouseKind;
  rows: number;
  ready: boolean;
  filePath: string | null;
  warning: string | null;
};

function formatPct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function formatShortTime(date: Date | null) {
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function ageMinutes(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

function formatAge(value: string | null | undefined) {
  const minutes = ageMinutes(value);
  if (minutes === null) return "age unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
}

function nextExpectedRefresh(value: string | null | undefined, intervalMinutes: number) {
  const date = dateFrom(value);
  if (!date) return null;
  const intervalMs = intervalMinutes * 60_000;
  const elapsed = Date.now() - date.getTime();
  const steps = Math.max(1, Math.ceil(elapsed / intervalMs));
  return new Date(date.getTime() + steps * intervalMs);
}

function freshnessLabel(value: string | null | undefined, intervalMinutes: number) {
  return `${formatTime(value)} · ${formatAge(value)} · every ${intervalMinutes}m`;
}

function freshnessStatus(value: string | null | undefined, maxAgeMinutes: number) {
  const age = ageMinutes(value);
  if (age === null) return "Missing";
  return age <= maxAgeMinutes ? "Fresh" : "Stale";
}

function isStale(snapshot: Pick<SimSnapshotEnvelope<Record<string, never>>, "stale"> | null | undefined) {
  return Boolean(snapshot?.stale);
}

async function readWarehouseHealth(): Promise<WarehouseHealth[]> {
  return Promise.all(
    NBA_WAREHOUSE_KINDS.map(async (kind) => {
      const feed = await readNbaWarehouseFeed(kind).catch(() => null);
      const rows = feed?.rows.length ?? 0;
      return {
        kind,
        rows,
        ready: rows > 0,
        filePath: feed?.filePath ?? null,
        warning: feed?.warnings?.[0] ?? null
      };
    })
  );
}

function RefreshScheduleCard({ status, priority, market }: { status: SimRefreshStatusSnapshot | null; priority: SimPrioritySnapshot | null; market: SimMarketSnapshot | null }) {
  const simGeneratedAt = status?.generatedAt ?? priority?.generatedAt ?? null;
  const marketGeneratedAt = market?.generatedAt ?? null;
  const nextSim = nextExpectedRefresh(simGeneratedAt, SIM_REFRESH_INTERVAL_MINUTES);
  const nextMarket = nextExpectedRefresh(marketGeneratedAt, SIM_MARKET_REFRESH_INTERVAL_MINUTES);

  return (
    <SimSignalCard className="border-sky-400/20 bg-sky-500/[0.045]">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">Refresh schedule</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SimMetricTile
          label="Sim snapshot"
          value={formatAge(simGeneratedAt)}
          sub={`Last ${freshnessLabel(simGeneratedAt, SIM_REFRESH_INTERVAL_MINUTES)}`}
          emphasis={simGeneratedAt && ageMinutes(simGeneratedAt)! <= 15 ? "strong" : "normal"}
        />
        <SimMetricTile
          label="Market overlay"
          value={formatAge(marketGeneratedAt)}
          sub={`Last ${freshnessLabel(marketGeneratedAt, SIM_MARKET_REFRESH_INTERVAL_MINUTES)}`}
          emphasis={marketGeneratedAt && ageMinutes(marketGeneratedAt)! <= 10 ? "strong" : "normal"}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        Cron runs on UTC servers, but these timestamps are displayed in Central Time. Next expected sim refresh: {formatShortTime(nextSim)}. Next market refresh: {formatShortTime(nextMarket)}.
      </p>
    </SimSignalCard>
  );
}

function SystemHealthCard({
  priority,
  market,
  status,
  warehouse
}: {
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
  warehouse: WarehouseHealth[];
}) {
  const simGeneratedAt = priority?.generatedAt ?? status?.generatedAt ?? null;
  const marketGeneratedAt = market?.generatedAt ?? null;
  const warehouseReady = warehouse.every((item) => item.ready);
  const simFresh = freshnessStatus(simGeneratedAt, 20);
  const marketFresh = freshnessStatus(marketGeneratedAt, 10);
  const productReady = warehouseReady && simFresh === "Fresh" && marketFresh === "Fresh" && status?.ok !== false;

  return (
    <SimSignalCard className={productReady ? "border-emerald-400/20 bg-emerald-500/[0.045]" : "border-amber-400/25 bg-amber-500/[0.06]"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">System health</div>
          <div className="mt-1 font-display text-xl font-semibold tracking-tight text-white">{productReady ? "Ready" : "Degraded"}</div>
        </div>
        <Link href="/api/sim/health" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 hover:text-white">
          Open JSON
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SimMetricTile label="Sim cache" value={simFresh} sub={`${formatAge(simGeneratedAt)} · target <=20m`} emphasis={simFresh === "Fresh" ? "strong" : "normal"} />
        <SimMetricTile label="Market overlay" value={marketFresh} sub={`${formatAge(marketGeneratedAt)} · target <=10m`} emphasis={marketFresh === "Fresh" ? "strong" : "normal"} />
        <SimMetricTile label="NBA warehouse" value={warehouseReady ? "Ready" : "Degraded"} sub={warehouse.map((item) => `${item.kind}:${item.rows}`).join(" · ")} emphasis={warehouseReady ? "strong" : "normal"} />
        <SimMetricTile label="Refresh job" value={status?.running ? "Running" : status?.ok === false ? "Failed" : status ? "OK" : "Missing"} sub={status?.reason ?? `last ${formatAge(status?.generatedAt)}`} emphasis={status && status.ok !== false ? "strong" : "normal"} />
      </div>
      {!warehouseReady ? (
        <div className="mt-3 rounded-2xl border border-amber-400/15 bg-black/20 p-3 text-xs leading-5 text-amber-100/80">
          NBA warehouse is not fully ready. Missing rows: {warehouse.filter((item) => !item.ready).map((item) => item.kind).join(", ") || "none"}. Run the NBA warehouse refresh and check `/api/simulation/nba/warehouse-health` for row-shape details.
        </div>
      ) : null}
    </SimSignalCard>
  );
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
          : `The cached sim slate is older than the freshness window. Last successful snapshot was ${formatAge(priority?.generatedAt)} (${formatTime(priority?.generatedAt)}).`}
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
        description="The /sim hub no longer runs projection batches during page requests. The scheduled sim-refresh cron will populate this snapshot cache."
      />
    );
  }

  return (
    <SimTableShell
      title="First decisions to check"
      description={priority.stale ? "Cached priority queue is stale; showing last successful snapshot." : "Cached NBA/MLB priority queue from the scheduled sim refresh."}
      right={<span className="text-xs text-slate-500">Generated {formatTime(priority.generatedAt)} · {formatAge(priority.generatedAt)}</span>}
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
  const [hub, priority, market, status, warehouse] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus),
    readWarehouseHealth()
  ]);

  const workspaces: WorkspaceConfig[] = [
    {
      href: "/sim/nba",
      eyebrow: "NBA workspace",
      title: "Player Sims + Side Queue",
      description: "Calibrated player box scores, prop drilldowns, confidence gates, and side reads in one tight board.",
      primaryMetric: String(hub?.summary.nbaCount ?? "Pending"),
      secondaryMetric: warehouse.every((item) => item.ready) ? "Warehouse ready" : "Warehouse degraded",
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
      primaryMetric: warehouse.find((item) => item.kind === "player")?.rows ? `${warehouse.find((item) => item.kind === "player")?.rows} rows` : "Pending",
      secondaryMetric: "Warehouse feed",
      action: "Open player board"
    }
  ];

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="Simulation Command Desk"
        title="Cached sim snapshots first. Deep work only when you ask for it."
        description="The hub reads hot-cache snapshots only, so a slow odds feed, model fetch, or projection batch cannot freeze first paint. Refresh status now shows Central Time, cache age, and the expected cadence."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetricTile label="Hub cache" value={hub ? (hub.stale ? "Stale" : "Fresh") : "Missing"} sub={`snapshot · ${formatAge(hub?.generatedAt)}`} emphasis={hub && !hub.stale ? "strong" : "normal"} />
          <SimMetricTile label="Priority rows" value={priority?.rows.length ?? 0} sub={`generated ${formatAge(priority?.generatedAt)}`} />
          <SimMetricTile label="MLB market" value={market ? (market.stale ? "Stale" : "Fresh") : "Missing"} sub={`5-minute overlay · ${formatAge(market?.generatedAt)}`} />
          <SimMetricTile label="NBA warehouse" value={warehouse.every((item) => item.ready) ? "Ready" : "Degraded"} sub={warehouse.map((item) => `${item.kind}:${item.rows}`).join(" · ")} emphasis={warehouse.every((item) => item.ready) ? "strong" : "normal"} />
        </div>
      </SimWorkspaceHeader>

      <SystemHealthCard priority={priority} market={market} status={status} warehouse={warehouse} />
      <RefreshScheduleCard status={status} priority={priority} market={market} />
      <SnapshotNotice priority={priority} status={status} />

      <section className="grid gap-4 xl:grid-cols-3">
        {workspaces.map((workspace) => <WorkspaceCard key={workspace.href} config={workspace} />)}
      </section>

      <section className="grid gap-4">
        <SectionTitle title="First decisions to check" description="Generated by the scheduled sim snapshot job, not during page render." />
        <PriorityTable priority={priority} />
      </section>
    </div>
  );
}
