import Link from "next/link";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPriorityRow,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";

type GameWorkspace = {
  key: string;
  row: SimPriorityRow;
  rows: SimPriorityRow[];
  duplicateCount: number;
  sortScore: number;
};

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function formatTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function dateKey(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateLabel(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "Unknown date";
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const tomorrowKey = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() + 86_400_000));
  const key = dateKey(value);
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, weekday: "long", month: "short", day: "numeric" }).format(date);
}

function formatPct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function formatEdge(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function normalizeTeam(value: string | null | undefined) {
  return (value ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function gameWorkspaceKey(row: SimPriorityRow) {
  return [row.leagueKey, dateKey(row.startTime), normalizeTeam(row.matchup.away), normalizeTeam(row.matchup.home)].join("::");
}

function tierRank(tier: string | undefined) {
  const normalized = tier?.toLowerCase();
  if (normalized === "a" || normalized === "attack") return 4;
  if (normalized === "b" || normalized === "watch") return 3;
  if (normalized === "c") return 2;
  return 1;
}

function rowScore(row: SimPriorityRow) {
  return tierRank(row.tier) * 100 + Math.abs(row.lean.edge ?? 0) * 100 + (row.confidence ?? 0) * 10 + (row.edgeMatched ? 1 : 0);
}

function buildGameWorkspaces(raw: SimPriorityRow[]): GameWorkspace[] {
  const map = new Map<string, GameWorkspace>();

  for (const row of raw) {
    const key = gameWorkspaceKey(row);
    const score = rowScore(row);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { key, row, rows: [row], duplicateCount: 0, sortScore: score });
      continue;
    }

    existing.rows.push(row);
    existing.duplicateCount = existing.rows.length - 1;

    if (score > existing.sortScore) {
      existing.row = row;
      existing.sortScore = score;
    }
  }

  return [...map.values()].sort((left, right) => {
    const leftTime = dateFrom(left.row.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = dateFrom(right.row.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || right.sortScore - left.sortScore;
  });
}

function groupGames(rows: SimPriorityRow[]) {
  const map = new Map<string, GameWorkspace[]>();
  for (const game of buildGameWorkspaces(rows)) {
    const key = dateKey(game.row.startTime);
    map.set(key, [...(map.get(key) ?? []), game]);
  }
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 4)
    .map(([key, games]) => ({ key, label: dateLabel(games[0]?.row.startTime), games }));
}

async function readSnapshots() {
  const [hub, priority, market, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch(() => null),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);

  return { hub, priority, market, status };
}

function Tile({ label, value, note, ok = true }: { label: string; value: string | number; note: string; ok?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${ok ? "border-white/10 bg-white/[0.03]" : "border-amber-300/20 bg-amber-300/[0.055]"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function ActionLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
        primary
          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </Link>
  );
}

function GameCard({ game }: { game: GameWorkspace }) {
  const row = game.row;
  const edgePositive = (row.lean.edge ?? 0) > 0;

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{row.leagueKey}</span>
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">{row.tier}</span>
            {game.duplicateCount > 0 ? <span className="rounded-md border border-amber-300/20 bg-amber-300/[0.07] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">{game.duplicateCount + 1} merged</span> : null}
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-white">
            {row.matchup.away} <span className="text-slate-600">@</span> {row.matchup.home}
          </h3>
          <div className="mt-1 text-xs text-slate-500">{formatTime(row.startTime)} · {row.status}</div>
        </div>
        <ActionLink href={row.href}>Open game</ActionLink>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Lean</div>
          <div className="mt-1 text-sm font-semibold text-white">{row.lean.team}</div>
          <div className="mt-1 font-mono text-xs text-slate-400">{formatPct(row.lean.pct)} win</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Edge</div>
          <div className={`mt-1 font-mono text-sm font-semibold ${edgePositive ? "text-emerald-300" : "text-slate-300"}`}>{formatEdge(row.lean.edge)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Confidence</div>
          <div className="mt-1 font-mono text-sm font-semibold text-white">{formatPct(row.confidence)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Market</div>
          <div className={`mt-1 text-sm font-semibold ${row.edgeMatched ? "text-emerald-300" : "text-slate-500"}`}>{row.edgeMatched ? "Matched" : "No line"}</div>
        </div>
      </div>
    </article>
  );
}

export default async function FastSimHubPage() {
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const uniqueGames = rows.length ? buildGameWorkspaces(rows).length : 0;
  const duplicateSignals = Math.max(0, rows.length - uniqueGames);
  const groups = groupGames(rows);
  const simAge = status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null;
  const simFresh = (ageMinutes(simAge) ?? 999) <= 20;
  const marketFresh = (ageMinutes(market?.generatedAt) ?? 999) <= 15;
  const refreshRunning = status?.running === true;
  const degraded = !rows.length || status?.ok === false;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Simulation Command</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">SharkEdge Sim Hub</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Fast cache-first sim board. This route does not run projection rebuilds during page load.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionLink href="/api/sim/refresh?force=1" primary>Refresh Sim</ActionLink>
            <ActionLink href="/sim/accuracy">Accuracy</ActionLink>
            <ActionLink href="/api/sim/health">Health JSON</ActionLink>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Tile label="Sim cache" value={simFresh ? "Fresh" : priority ? "Stale" : "Missing"} note={`Last success ${formatAge(simAge)}`} ok={simFresh && Boolean(rows.length)} />
          <Tile label="Unique games" value={uniqueGames} note={`${duplicateSignals} duplicate signals merged`} ok={uniqueGames > 0} />
          <Tile label="MLB games" value={hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? 0} note={`${market?.lineCount ?? 0} market lines`} ok={marketFresh || Boolean(market?.lineCount)} />
          <Tile label="Market cache" value={marketFresh ? "Fresh" : market ? "Stale" : "Missing"} note={`Generated ${formatAge(market?.generatedAt)}`} ok={marketFresh} />
          <Tile label="Refresh state" value={refreshRunning ? "Running" : status?.ok === false ? "Failed" : "Idle"} note={status?.reason ?? "Background refresh is non-blocking"} ok={!degraded || refreshRunning} />
        </div>
      </section>

      {status?.ok === false ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-4 text-sm leading-6 text-amber-100/85">
          <div className="font-semibold uppercase tracking-[0.14em] text-[10px] text-amber-200">Last refresh protected cache</div>
          <p className="mt-1">{status.reason ?? "The last sim refresh failed. Showing last readable cache instead of hanging or replacing the slate with blanks."}</p>
        </section>
      ) : null}

      {!rows.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">No sim rows loaded</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">The priority snapshot is empty or missing.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Hit Refresh Sim. The request returns immediately and queues the rebuild behind the scenes.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionLink href="/api/sim/refresh?force=1" primary>Queue refresh</ActionLink>
            <ActionLink href="/api/sim/health">Open health JSON</ActionLink>
          </div>
        </section>
      ) : (
        <section className="grid gap-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Unified slate</div>
                <h2 className="mt-1 font-display text-2xl font-semibold text-white">One game card per matchup</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{uniqueGames} matchup{uniqueGames !== 1 ? "s" : ""} · {duplicateSignals} duplicate signal{duplicateSignals !== 1 ? "s" : ""} collapsed.</p>
              </div>
              <div className="text-xs text-slate-500">Snapshot {formatAge(priority?.generatedAt)}</div>
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.key} className="grid gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.label} · {group.games.length} game{group.games.length !== 1 ? "s" : ""}</div>
              <div className="grid gap-3 2xl:grid-cols-2">
                {group.games.map((game) => <GameCard key={game.key} game={game} />)}
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
