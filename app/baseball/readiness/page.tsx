import Link from "next/link";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimBoardSnapshot,
  type SimMarketSnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

type GateTone = "ready" | "partial" | "blocked";

type MlbReadinessSnapshot = {
  mlbBoard: SimBoardSnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
};

const ACTIVE_STATUSES = new Set(["SCHEDULED", "PRE", "PREGAME", "IN_PROGRESS", "LIVE"]);
const CLOSED_STATUSES = new Set(["FINAL", "POSTPONED", "CANCELED"]);

async function readSnapshots(): Promise<MlbReadinessSnapshot> {
  const [mlbBoard, market, status] = await Promise.all([
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);
  return { mlbBoard, market, status };
}

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

function ageLabel(value: string | null | undefined) {
  const minutes = ageMinutes(value);
  if (minutes === null) return "missing";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m ago` : `${hours}h ago`;
}

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function statusKey(value: string | null | undefined) {
  return String(value ?? "").toUpperCase();
}

function sourceLabel(value: unknown) {
  return String(value ?? "unknown");
}

function isFallbackSource(value: unknown) {
  return /fallback|synthetic|estimated/i.test(sourceLabel(value));
}

function gameSource(game: SimBoardSnapshot["games"][number]) {
  const governor = game.projection.mlbIntel?.governor as { source?: unknown } | undefined;
  return game.projection.mlbIntel?.dataSource ?? governor?.source ?? "unknown";
}

function marketGameIds(market: SimMarketSnapshot | null) {
  return new Set((market?.edges ?? []).map((edge) => edge.gameId));
}

function readinessStats(snapshot: MlbReadinessSnapshot) {
  const games = (snapshot.mlbBoard?.games ?? []).filter((game) => game.game.leagueKey === "MLB");
  const marketIds = marketGameIds(snapshot.market);
  const activeGames = games.filter((game) => {
    const key = statusKey(game.game.status);
    return ACTIVE_STATUSES.has(key) || !CLOSED_STATUSES.has(key);
  });
  const closedGames = games.filter((game) => CLOSED_STATUSES.has(statusKey(game.game.status))).length;
  const matchedMarkets = games.filter((game) => marketIds.has(game.game.id)).length;
  const activeMatchedMarkets = activeGames.filter((game) => marketIds.has(game.game.id)).length;
  const fallbackRows = games.filter((game) => isFallbackSource(gameSource(game))).length;
  const noBetRows = games.filter((game) => Boolean(game.projection.mlbIntel?.governor?.noBet)).length;
  const simAge = ageMinutes(snapshot.mlbBoard?.generatedAt);
  const marketAge = ageMinutes(snapshot.market?.generatedAt);
  const warnings = Array.from(new Set([
    ...(snapshot.mlbBoard?.warnings ?? []),
    ...(snapshot.market?.warnings ?? []),
    ...(snapshot.status?.warnings ?? [])
  ])).slice(0, 8);

  return {
    games,
    activeGames,
    closedGames,
    matchedMarkets,
    activeMatchedMarkets,
    fallbackRows,
    noBetRows,
    simAge,
    marketAge,
    warnings
  };
}

function readinessScore(snapshot: MlbReadinessSnapshot) {
  const stats = readinessStats(snapshot);
  if (!snapshot.mlbBoard || stats.games.length === 0) return 0;

  const simFresh = stats.simAge !== null && stats.simAge <= 45;
  const marketFresh = stats.marketAge !== null && stats.marketAge <= 25;
  const marketRate = stats.activeGames.length
    ? stats.activeMatchedMarkets / stats.activeGames.length
    : stats.games.length
      ? stats.matchedMarkets / stats.games.length
      : 0;

  let score = 20;
  if (stats.activeGames.length > 0) score += 15;
  if (simFresh) score += 20;
  if (marketFresh) score += 15;
  score += Math.round(Math.min(25, marketRate * 25));
  if (snapshot.status?.ok !== false) score += 5;
  score -= Math.min(20, stats.fallbackRows * 5);
  score -= Math.min(12, stats.noBetRows * 2);
  score -= Math.min(12, stats.warnings.length * 2);

  return Math.max(0, Math.min(100, score));
}

function gateTone(score: number, snapshot: MlbReadinessSnapshot): GateTone {
  const stats = readinessStats(snapshot);
  if (!snapshot.mlbBoard || stats.games.length === 0 || stats.activeGames.length === 0) return "blocked";
  if (score >= 80 && stats.fallbackRows === 0 && stats.activeMatchedMarkets > 0) return "ready";
  return "partial";
}

function gateClasses(tone: GateTone) {
  if (tone === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (tone === "partial") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function pill(tone: "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function Metric({ label, value, sub, pass }: { label: string; value: string | number; sub: string; pass: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
        <span className={pill(pass ? "green" : "amber")}>{pass ? "pass" : "watch"}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 opacity-75">{sub}</p>
    </div>
  );
}

function BlockerList({ warnings }: { warnings: string[] }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Known blockers</div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        MLB is not allowed to look actionable when the cache, market join, or input quality is weak. These blockers should be visible before any pick card.
      </p>
      <div className="mt-4 grid gap-2">
        {warnings.length ? warnings.map((warning) => (
          <div key={warning} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs leading-5 text-amber-100/80">{warning}</div>
        )) : (
          <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-xs leading-5 text-emerald-100/80">No snapshot-level warnings returned.</div>
        )}
      </div>
    </section>
  );
}

export default async function MlbReadinessPage() {
  const snapshot = await readSnapshots();
  const stats = readinessStats(snapshot);
  const score = readinessScore(snapshot);
  const tone = gateTone(score, snapshot);
  const marketRate = stats.activeGames.length
    ? pct(stats.activeMatchedMarkets, stats.activeGames.length)
    : pct(stats.matchedMarkets, stats.games.length);
  const label = tone === "ready" ? "Decision-ready MLB slate" : tone === "partial" ? "Partial-trust MLB slate" : "Pipeline-only MLB slate";
  const note = tone === "ready"
    ? "The MLB cockpit has fresh enough sim output, market context, active games, and source quality to review as a decision surface."
    : tone === "partial"
      ? "MLB has usable output, but at least one trust input is weak. Treat it as research until the blocker clears."
      : "Do not treat MLB as actionable right now. The slate is missing active rows, cache output, or enough market context.";

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-4">
        <header className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Sim Lab</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Readiness Gate</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                The baseball product should say whether the board is decision-ready before showing picks. This gate checks cache freshness, active games, market join, fallback rows, no-bet gates, and warnings.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/baseball" className={pill("cyan")}>MLB Lab</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
              <Link href="/accuracy" className={pill("slate")}>Accuracy</Link>
            </div>
          </div>
        </header>

        <section className={`rounded-[1.35rem] border p-5 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ${gateClasses(tone)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Slate decision gate</div>
              <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">{label}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{note}</p>
            </div>
            <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Readiness</div>
              <div className="font-display text-5xl font-black tracking-[-0.07em] text-white">{score}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active games" value={`${stats.activeGames.length}/${stats.games.length}`} sub={`${stats.closedGames} closed rows in cache.`} pass={stats.activeGames.length > 0} />
            <Metric label="Sim cache" value={ageLabel(snapshot.mlbBoard?.generatedAt)} sub="Fresh target is 45 minutes or less." pass={(stats.simAge ?? 999) <= 45} />
            <Metric label="Market join" value={marketRate} sub={`${stats.activeMatchedMarkets || stats.matchedMarkets} games with joined market context.`} pass={(stats.activeGames.length ? stats.activeMatchedMarkets : stats.matchedMarkets) > 0} />
            <Metric label="Odds cache" value={ageLabel(snapshot.market?.generatedAt)} sub={`${snapshot.market?.lineCount ?? 0} sportsbook line rows.`} pass={(stats.marketAge ?? 999) <= 25 && (snapshot.market?.lineCount ?? 0) > 0} />
            <Metric label="Fallback rows" value={stats.fallbackRows} sub="Synthetic/fallback rows should not produce attack picks." pass={stats.fallbackRows === 0} />
            <Metric label="No-bet gates" value={stats.noBetRows} sub="Governor protection rows on the slate." pass={stats.noBetRows === 0} />
            <Metric label="Refresh status" value={snapshot.status?.running ? "Running" : snapshot.status?.ok === false ? "Failed" : "OK"} sub={snapshot.status?.reason ?? ageLabel(snapshot.status?.lastSuccessAt)} pass={snapshot.status?.ok !== false} />
            <Metric label="Warnings" value={stats.warnings.length} sub="Cache, market, and refresh warnings." pass={stats.warnings.length === 0} />
          </div>
        </section>

        <BlockerList warnings={stats.warnings} />
      </div>
    </main>
  );
}
