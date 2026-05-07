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
import { cn } from "@/lib/utils/cn";
import { readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";
import {
  readSimCache,
  refreshFullSimSnapshots,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot,
  type SimSnapshotEnvelope
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const DISPLAY_TIME_ZONE = "America/Chicago";
const SIM_REFRESH_INTERVAL_MINUTES = 10;
const SIM_MARKET_REFRESH_INTERVAL_MINUTES = 5;
const NBA_WAREHOUSE_KINDS: NbaWarehouseKind[] = ["team", "player", "history", "rating"];

type WorkspaceConfig = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  count: string;
  statusLabel: string;
  action: string;
  ready: boolean;
};

type WarehouseHealth = {
  kind: NbaWarehouseKind;
  rows: number;
  ready: boolean;
  filePath: string | null;
  warning: string | null;
};

type SimSnapshots = {
  hub: SimHubSnapshot | null;
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
};

function formatPct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
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
  if (!date) return "—";
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
  if (minutes === null) return "unknown";
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

function freshnessStatus(value: string | null | undefined, maxAgeMinutes: number) {
  const age = ageMinutes(value);
  if (age === null) return "Missing";
  return age <= maxAgeMinutes ? "Fresh" : "Stale";
}

function isStale(snapshot: Pick<SimSnapshotEnvelope<Record<string, never>>, "stale"> | null | undefined) {
  return Boolean(snapshot?.stale);
}

function needsEmergencyRepair(snapshot: SimSnapshots) {
  const priorityRows = snapshot.priority?.rows?.length ?? 0;
  const hubCount = snapshot.hub?.summary?.priorityCount ?? 0;
  const refreshRunning = snapshot.status?.running === true;
  return !refreshRunning && (priorityRows === 0 || hubCount === 0);
}

async function readSnapshots(): Promise<SimSnapshots> {
  const [hub, priority, market, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus)
  ]);
  return { hub, priority, market, status };
}

async function readSnapshotsWithRepair() {
  const first = await readSnapshots();
  if (!needsEmergencyRepair(first)) return { ...first, repairedOnRequest: false, repairWarnings: [] as string[] };

  const repair = await refreshFullSimSnapshots().catch((error) => ({
    ok: false,
    skippedSnapshotWrites: false,
    warnings: [error instanceof Error ? error.message : "Sim hub emergency repair failed."]
  }));
  const second = await readSnapshots();
  return {
    ...second,
    repairedOnRequest: true,
    repairWarnings: repair.warnings ?? []
  };
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

// ─── Inline primitives ────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        ok
          ? "bg-mint shadow-[0_0_6px_rgba(74,227,181,0.55)]"
          : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.45)]"
      )}
    />
  );
}

function StatusPill({ label, ok, sub }: { label: string; ok: boolean; sub?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot ok={ok} />
      <span className="text-[11px] text-slate-400">
        <span className="font-medium text-slate-200">{label}</span>
        {sub ? <span className="ml-1 text-slate-600">{sub}</span> : null}
      </span>
    </div>
  );
}

function EdgeValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-slate-600">—</span>;
  const pct = value * 100;
  const color = pct > 1.5 ? "text-mint" : pct < -1.5 ? "text-crimson" : "text-slate-400";
  return (
    <span className={cn("tabular-nums font-semibold", color)}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function ConfidenceValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-slate-600">—</span>;
  const pct = value * 100;
  const color = pct >= 68 ? "text-mint" : pct >= 58 ? "text-amber-300" : "text-slate-400";
  return <span className={cn("tabular-nums font-semibold", color)}>{pct.toFixed(1)}%</span>;
}

// ─── Status rail (replaces SystemHealthCard + RefreshScheduleCard) ────────────

function SimStatusRail({
  priority,
  market,
  status,
  warehouse,
  repairedOnRequest,
  repairWarnings
}: {
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
  warehouse: WarehouseHealth[];
  repairedOnRequest: boolean;
  repairWarnings: string[];
}) {
  const simGeneratedAt = status?.lastSuccessAt ?? priority?.generatedAt ?? status?.generatedAt ?? null;
  const marketGeneratedAt = market?.generatedAt ?? null;
  const nextSim = nextExpectedRefresh(simGeneratedAt, SIM_REFRESH_INTERVAL_MINUTES);
  const nextMarket = nextExpectedRefresh(marketGeneratedAt, SIM_MARKET_REFRESH_INTERVAL_MINUTES);
  const warehouseReady = warehouse.every((w) => w.ready);
  const simOk = (ageMinutes(simGeneratedAt) ?? 999) <= 20;
  const marketOk = (ageMinutes(marketGeneratedAt) ?? 999) <= 10;
  const refreshOk = status?.ok !== false;
  const hasRows = (priority?.rows.length ?? 0) > 0;
  const allGood = simOk && marketOk && warehouseReady && refreshOk && hasRows;

  return (
    <div className={cn("panel px-5 py-4", allGood ? "border-mint/[0.12]" : "border-amber-400/20")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <StatusDot ok={allGood} />
            <span className={cn("text-xs font-semibold uppercase tracking-[0.12em]", allGood ? "text-mint" : "text-amber-300")}>
              {allGood ? "System ready" : hasRows ? "Running stale" : "Degraded"}
            </span>
          </div>
          <div className="hidden h-3 w-px bg-white/10 sm:block" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusPill label="Sim" ok={simOk} sub={formatAge(simGeneratedAt)} />
            <StatusPill label="Market" ok={marketOk} sub={formatAge(marketGeneratedAt)} />
            <StatusPill label="Warehouse" ok={warehouseReady} sub={warehouseReady ? "ready" : "degraded"} />
            <StatusPill label="Cron" ok={refreshOk} sub={status?.running ? "running" : refreshOk ? "ok" : "failed"} />
          </div>
        </div>
        <div className="text-[11px] tabular-nums text-slate-600">
          Next sim {formatShortTime(nextSim)} · market {formatShortTime(nextMarket)}
        </div>
      </div>
      {repairedOnRequest ? (
        <div className="mt-3 rounded-lg border border-aqua/15 bg-aqua/[0.04] px-3 py-2 text-xs text-slate-300">
          Cache was blank — ran one guarded server-side rebuild.
          {repairWarnings.length ? ` Notes: ${repairWarnings.slice(0, 2).join(" · ")}` : " Fresh snapshots written."}
        </div>
      ) : null}
      {!warehouseReady ? (
        <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-200/80">
          NBA warehouse degraded — missing: {warehouse.filter((w) => !w.ready).map((w) => w.kind).join(", ")}. Run the NBA warehouse refresh.
        </div>
      ) : null}
    </div>
  );
}

// ─── Stale data notice ────────────────────────────────────────────────────────

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
    <SimSignalCard className="border-amber-400/25 bg-amber-500/[0.06]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            {failed ? "Snapshot protected" : "Showing cached snapshot"}
          </div>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">
            {failed
              ? `Last refresh did not replace the cached slate${status.reason ? `: ${status.reason}` : "."}`
              : `Slate is older than the freshness window. Last success: ${formatAge(priority?.generatedAt)} (${formatTime(priority?.generatedAt)}).`}
          </p>
        </div>
      </div>
    </SimSignalCard>
  );
}

// ─── Workspace cards ──────────────────────────────────────────────────────────

function WorkspaceCard({ config }: { config: WorkspaceConfig }) {
  return (
    <Link href={config.href} className="block h-full">
      <div className="panel group flex h-full flex-col p-5 transition-all hover:border-aqua/30 hover:bg-aqua/[0.015]">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aqua/75">{config.eyebrow}</span>
          <StatusDot ok={config.ready} />
        </div>
        <div className="mt-4 font-display text-4xl font-bold tabular-nums leading-none tracking-tight text-white">{config.count}</div>
        <div className="mt-2 font-display text-[17px] font-semibold leading-snug text-white">{config.title}</div>
        <p className="mt-2 flex-1 text-xs leading-5 text-slate-500">{config.description}</p>
        <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4">
          <span className="text-[10px] text-slate-600">{config.statusLabel}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-aqua/75 transition-colors group-hover:text-aqua">{config.action} →</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Priority slate table ─────────────────────────────────────────────────────

function PriorityTable({ priority }: { priority: SimPrioritySnapshot | null }) {
  if (!priority?.rows.length) {
    return (
      <EmptyState
        eyebrow="Sim cache"
        title="No games in the priority queue"
        description="The page attempted one emergency rebuild. If this stays blank, the upstream scoreboard is returning zero games or every projection is failing. Check /api/sim/health and the sim-refresh logs."
      />
    );
  }

  return (
    <SimTableShell
      title="Today's Game Slate"
      description={
        priority.stale
          ? "Showing last successful snapshot — live cron has not refreshed yet."
          : `${priority.rows.length} game${priority.rows.length === 1 ? "" : "s"} · ranked by sim priority`
      }
      right={
        <span className="text-[11px] tabular-nums text-slate-600">
          {formatAge(priority.generatedAt)}
        </span>
      }
    >
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/[0.08]">
          <tr>
            <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Matchup</th>
            <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Lean · Win%</th>
            <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Edge</th>
            <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Conf</th>
            <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Market</th>
            <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Tip-off</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {priority.rows.map((row) => (
            <tr key={row.id} className="group align-middle hover:bg-white/[0.015]">
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-sm border border-aqua/25 bg-aqua/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-aqua">
                    {row.leagueKey}
                  </span>
                  <SimStatusBadge status={row.status} />
                  <SimDecisionBadge tier={row.tier} />
                </div>
                <div className="mt-2 font-semibold leading-snug text-white">{row.matchup.away}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                  <span>vs</span>
                  <span className="text-slate-400">{row.matchup.home}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-white">{row.lean.team}</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">{formatPct(row.lean.pct)}</div>
              </td>
              <td className="px-4 py-3">
                <EdgeValue value={row.lean.edge} />
              </td>
              <td className="px-4 py-3">
                <ConfidenceValue value={row.confidence} />
              </td>
              <td className="px-4 py-3 text-[11px] text-slate-500">
                {row.leagueKey === "MLB"
                  ? row.edgeMatched
                    ? <span className="text-mint">Matched</span>
                    : "No line"
                  : <span className="text-slate-700">n/a</span>}
              </td>
              <td className="px-4 py-3 text-[11px] tabular-nums text-slate-400">{formatTime(row.startTime)}</td>
              <td className="px-4 py-3">
                <Link
                  href={row.href}
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 transition-colors hover:text-aqua group-hover:text-slate-400"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SimTableShell>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SimHubPage() {
  const [{ hub, priority, market, status, repairedOnRequest, repairWarnings }, warehouse] = await Promise.all([
    readSnapshotsWithRepair(),
    readWarehouseHealth()
  ]);

  const warehouseReady = warehouse.every((w) => w.ready);
  const playerRows = warehouse.find((w) => w.kind === "player")?.rows ?? 0;

  const workspaces: WorkspaceConfig[] = [
    {
      href: "/sim/nba",
      eyebrow: "NBA Workspace",
      title: "Player Sims + Sides",
      description: "Calibrated box scores, prop drilldowns, confidence gates, and side reads in one board.",
      count: String(hub?.summary.nbaCount ?? priority?.summary.nbaCount ?? "—"),
      statusLabel: warehouseReady ? "Warehouse ready" : "Warehouse degraded",
      action: "Open NBA desk",
      ready: warehouseReady
    },
    {
      href: "/sim/mlb",
      eyebrow: "MLB Workspace",
      title: "Sides + Totals Edge Desk",
      description: "Moneyline edge, totals, Statcast splits, Savant pitcher profiles, and live market matching.",
      count: String(hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? "—"),
      statusLabel: market?.stale ? "Market overlay stale" : `${market?.lineCount ?? 0} market lines`,
      action: "Open MLB desk",
      ready: !market?.stale && (market?.lineCount ?? 0) > 0
    },
    {
      href: "/sim/players?league=NBA",
      eyebrow: "NBA Drilldown",
      title: "Projected Player Box Scores",
      description: "Points, boards, assists, threes, PRA, floor and ceiling — exact projections for prop building.",
      count: playerRows ? String(playerRows) : "—",
      statusLabel: "Warehouse player feed",
      action: "Open player board",
      ready: playerRows > 0
    }
  ];

  return (
    <div className="space-y-5">
      <SimWorkspaceHeader
        eyebrow="Simulation Command"
        title="SharkEdge Edge Desk"
        description="Real-data MLB + NBA sim engine. Statcast splits, Savant pitcher profiles, live lineups, park factors, and market overlays — consolidated into a live priority queue."
        actions={[
          { href: "/api/sim/health", label: "Health JSON", tone: "secondary" },
          { href: "/sim/evaluation", label: "Accuracy", tone: "secondary" }
        ]}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetricTile
            label="Hub snapshot"
            value={hub ? (hub.stale ? "Stale" : "Fresh") : "Missing"}
            sub={hub ? formatAge(hub.generatedAt) : "no data"}
            emphasis={hub && !hub.stale ? "strong" : "normal"}
          />
          <SimMetricTile
            label="Priority queue"
            value={priority?.rows.length ?? 0}
            sub={`games · ${formatAge(priority?.generatedAt)}`}
            emphasis={(priority?.rows.length ?? 0) > 0 ? "strong" : "normal"}
          />
          <SimMetricTile
            label="MLB market"
            value={market ? (market.stale ? "Stale" : "Fresh") : "Missing"}
            sub={`5-min overlay · ${formatAge(market?.generatedAt)}`}
            emphasis={market && !market.stale ? "strong" : "normal"}
          />
          <SimMetricTile
            label="NBA warehouse"
            value={warehouseReady ? "Ready" : "Degraded"}
            sub={warehouse.map((w) => `${w.kind}:${w.rows}`).join(" · ")}
            emphasis={warehouseReady ? "strong" : "normal"}
          />
        </div>
      </SimWorkspaceHeader>

      <SimStatusRail
        priority={priority}
        market={market}
        status={status}
        warehouse={warehouse}
        repairedOnRequest={repairedOnRequest}
        repairWarnings={repairWarnings}
      />

      <SnapshotNotice priority={priority} status={status} />

      <section className="grid gap-4 xl:grid-cols-3">
        {workspaces.map((workspace) => (
          <WorkspaceCard key={workspace.href} config={workspace} />
        ))}
      </section>

      <section className="space-y-3">
        <PriorityTable priority={priority} />
      </section>
    </div>
  );
}
