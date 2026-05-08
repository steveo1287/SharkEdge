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

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type GameWorkspace = {
  key: string;
  row: SimPriorityRow;
  rows: SimPriorityRow[];
  duplicateCount: number;
  sortScore: number;
};

function readParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function chicagoDateKeyFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function chicagoDateKey(value: string | null | undefined) {
  const date = dateFrom(value);
  return date ? chicagoDateKeyFromDate(date) : "unknown";
}

function relativeChicagoDateKey(offsetDays: number) {
  return chicagoDateKeyFromDate(new Date(Date.now() + offsetDays * 86_400_000));
}

function labelForDateKey(key: string) {
  if (key === "all") return "All dates";
  if (key === relativeChicagoDateKey(-1)) return "Yesterday";
  if (key === relativeChicagoDateKey(0)) return "Today";
  if (key === relativeChicagoDateKey(1)) return "Tomorrow";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
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

function legacyDateKey(value: string | null | undefined) {
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
  const key = chicagoDateKey(value);
  return labelForDateKey(key);
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
  return [row.leagueKey, legacyDateKey(row.startTime), normalizeTeam(row.matchup.away), normalizeTeam(row.matchup.home)].join("::");
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
    const key = chicagoDateKey(game.row.startTime);
    map.set(key, [...(map.get(key) ?? []), game]);
  }
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, games]) => ({ key, label: labelForDateKey(key), games }));
}

function dateOptions(rows: SimPriorityRow[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = chicagoDateKey(row.startTime);
    if (key !== "unknown") keys.add(key);
  }
  return [...keys].sort();
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

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
        active ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400"
      }`}
    >
      {children}
    </Link>
  );
}

function DateFilter({ selectedDate, options }: { selectedDate: string; options: string[] }) {
  const today = relativeChicagoDateKey(0);
  const yesterday = relativeChicagoDateKey(-1);
  const tomorrow = relativeChicagoDateKey(1);

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Slate filter</div>
          <h2 className="mt-1 font-display text-2xl font-semibold text-white">{labelForDateKey(selectedDate)}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Default view is today. Use All only when you want the full slate history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterLink href={`/sim?date=${yesterday}`} active={selectedDate === yesterday}>Yesterday</FilterLink>
          <FilterLink href={`/sim?date=${today}`} active={selectedDate === today}>Today</FilterLink>
          <FilterLink href={`/sim?date=${tomorrow}`} active={selectedDate === tomorrow}>Tomorrow</FilterLink>
          <FilterLink href="/sim?date=all" active={selectedDate === "all"}>All</FilterLink>
        </div>
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Specific date</span>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate === "all" ? today : selectedDate}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Apply date</button>
        {options.length ? <div className="text-xs text-slate-500">Available: {options.map(labelForDateKey).join(" · ")}</div> : null}
      </form>
    </section>
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

export default async function FastSimHubPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedDate = readParam(resolvedSearchParams, "date");
  const selectedDate = requestedDate === "all" ? "all" : requestedDate || relativeChicagoDateKey(0);
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const filteredRows = selectedDate === "all" ? rows : rows.filter((row) => chicagoDateKey(row.startTime) === selectedDate);
  const uniqueGames = filteredRows.length ? buildGameWorkspaces(filteredRows).length : 0;
  const duplicateSignals = Math.max(0, filteredRows.length - uniqueGames);
  const groups = groupGames(filteredRows);
  const availableDates = dateOptions(rows);
  const simAge = status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null;
  const simFresh = (ageMinutes(simAge) ?? 999) <= 20;
  const marketFresh = (ageMinutes(market?.generatedAt) ?? 999) <= 15;
  const refreshRunning = status?.running === true;
  const degraded = !filteredRows.length || status?.ok === false;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Simulation Command</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">SharkEdge Sim Hub</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Date-filtered, cache-first sim board. Default view is today so the page does not turn into a doomscroll.
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
          <Tile label="Visible games" value={uniqueGames} note={`${duplicateSignals} duplicate signals merged`} ok={uniqueGames > 0} />
          <Tile label="MLB games" value={hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? 0} note={`${market?.lineCount ?? 0} market lines`} ok={marketFresh || Boolean(market?.lineCount)} />
          <Tile label="Market cache" value={marketFresh ? "Fresh" : market ? "Stale" : "Missing"} note={`Generated ${formatAge(market?.generatedAt)}`} ok={marketFresh} />
          <Tile label="Refresh state" value={refreshRunning ? "Running" : status?.ok === false ? "Failed" : "Idle"} note={status?.reason ?? "Background refresh is non-blocking"} ok={!degraded || refreshRunning} />
        </div>
      </section>

      <DateFilter selectedDate={selectedDate} options={availableDates} />

      {status?.ok === false ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-4 text-sm leading-6 text-amber-100/85">
          <div className="font-semibold uppercase tracking-[0.14em] text-[10px] text-amber-200">Last refresh protected cache</div>
          <p className="mt-1">{status.reason ?? "The last sim refresh failed. Showing last readable cache instead of hanging or replacing the slate with blanks."}</p>
        </section>
      ) : null}

      {!filteredRows.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">No games for {labelForDateKey(selectedDate)}</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">No sim rows match this date.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Pick another date, switch to All, or refresh the sim cache if today’s slate has not been written yet.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionLink href="/sim?date=all">View all</ActionLink>
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
                <h2 className="mt-1 font-display text-2xl font-semibold text-white">{labelForDateKey(selectedDate)} · {uniqueGames} game{uniqueGames !== 1 ? "s" : ""}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{duplicateSignals} duplicate signal{duplicateSignals !== 1 ? "s" : ""} collapsed.</p>
              </div>
              <div className="text-xs text-slate-500">Snapshot {formatAge(priority?.generatedAt)}</div>
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.key} className="grid gap-3">
              {selectedDate === "all" ? <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.label} · {group.games.length} game{group.games.length !== 1 ? "s" : ""}</div> : null}
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
