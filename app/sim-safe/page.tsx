import Link from "next/link";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimPriorityRow,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

const DISPLAY_TIME_ZONE = "America/Chicago";
const INITIAL_CARD_LIMIT = 8;

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

type SafeCard = {
  id: string;
  leagueKey: string;
  startTime: string | null;
  awayTeam: string;
  homeTeam: string;
  leanTeam: string;
  leanPct: number | null;
  edge: number | null;
  confidence: number | null;
  tier: string;
  status: string | null;
  href: string;
};

function asText(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: unknown, digits = 1) {
  const num = asNumber(value);
  return num == null ? "—" : `${(num * 100).toFixed(digits)}%`;
}

function signedPct(value: unknown, digits = 1) {
  const num = asNumber(value);
  if (num == null) return "—";
  const out = num * 100;
  return `${out > 0 ? "+" : ""}${out.toFixed(digits)}%`;
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function gameTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function age(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}

function chicagoDateKey(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")?.value ?? "0000"}-${parts.find((p) => p.type === "month")?.value ?? "00"}-${parts.find((p) => p.type === "day")?.value ?? "00"}`;
}

function relativeKey(offsetDays: number) {
  return chicagoDateKey(new Date(Date.now() + offsetDays * 86_400_000).toISOString());
}

function dateLabel(key: string) {
  if (key === relativeKey(0)) return "Today";
  if (key === relativeKey(1)) return "Tomorrow";
  if (key === relativeKey(-1)) return "Yesterday";
  if (key === "unknown") return "Unknown";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function normalizeRow(row: SimPriorityRow): SafeCard {
  return {
    id: asText(row.id, `${row.leagueKey}-${row.startTime ?? "unknown"}-${row.matchup?.away ?? "away"}-${row.matchup?.home ?? "home"}`),
    leagueKey: asText(row.leagueKey, "SIM").toUpperCase(),
    startTime: typeof row.startTime === "string" ? row.startTime : null,
    awayTeam: asText(row.matchup?.away, "Away"),
    homeTeam: asText(row.matchup?.home, "Home"),
    leanTeam: asText(row.lean?.team, "Model lean"),
    leanPct: asNumber(row.lean?.pct),
    edge: asNumber(row.lean?.edge),
    confidence: asNumber(row.confidence),
    tier: asText(row.tier, "watch").toUpperCase(),
    status: typeof row.status === "string" ? row.status : null,
    href: asText(row.href, "/sim")
  };
}

function cardRank(card: SafeCard) {
  const tier = card.tier === "ATTACK" ? 4 : card.tier === "PLAY" || card.tier === "A" ? 3 : card.tier === "LEAN" || card.tier === "B" ? 2 : 1;
  return tier * 100 + Math.abs(card.edge ?? 0) * 100 + (card.confidence ?? 0) * 10;
}

function dedupeCards(rows: SimPriorityRow[]) {
  const map = new Map<string, SafeCard>();
  for (const row of rows) {
    const card = normalizeRow(row);
    const key = [card.leagueKey, chicagoDateKey(card.startTime), card.awayTeam.toLowerCase(), card.homeTeam.toLowerCase()].join("::");
    const existing = map.get(key);
    if (!existing || cardRank(card) > cardRank(existing)) map.set(key, card);
  }
  return [...map.values()].sort((a, b) => {
    const aTime = dateFrom(a.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = dateFrom(b.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime || cardRank(b) - cardRank(a);
  });
}

function StatusBadge({ value }: { value: string }) {
  const strong = value === "ATTACK" || value === "PLAY" || value === "A";
  const watch = value === "WATCH" || value === "B" || value === "LEAN";
  return (
    <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
      strong
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
        : watch
          ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-200"
          : "border-white/10 bg-white/[0.03] text-slate-400"
    }`}>
      {value}
    </span>
  );
}

function SimCard({ card }: { card: SafeCard }) {
  const homeLean = card.leanTeam.toLowerCase() === card.homeTeam.toLowerCase();
  const awayProb = homeLean && card.leanPct != null ? Math.max(0, Math.min(100, (1 - card.leanPct) * 100)) : Math.max(0, Math.min(100, (card.leanPct ?? 0.5) * 100));
  const homeProb = Math.max(0, Math.min(100, 100 - awayProb));

  return (
    <article className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] shadow-2xl shadow-black/20 transition hover:border-cyan-400/20">
      <div className="h-1 bg-gradient-to-r from-cyan-400/80 via-violet-400/70 to-emerald-400/70" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                {card.leagueKey}
              </span>
              <StatusBadge value={card.tier} />
            </div>
            <h2 className="mt-3 truncate text-xl font-black tracking-tight text-white">
              {card.awayTeam} <span className="text-slate-600">@</span> {card.homeTeam}
            </h2>
            <div className="mt-1 text-xs tabular-nums text-slate-500">{gameTime(card.startTime)}</div>
          </div>
          <Link href={card.href} className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
            Detail
          </Link>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-400">{card.awayTeam}</div>
              <div className="mt-1 font-mono text-2xl font-black tabular-nums text-cyan-300">{awayProb.toFixed(1)}%</div>
            </div>
            <div className="text-center text-[9px] font-bold uppercase tracking-[0.22em] text-slate-700">Win Prob</div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-400">{card.homeTeam}</div>
              <div className="mt-1 font-mono text-2xl font-black tabular-nums text-violet-300">{homeProb.toFixed(1)}%</div>
            </div>
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800/80">
            <div style={{ width: `${awayProb}%` }} className="bg-gradient-to-r from-cyan-500 to-cyan-400" />
            <div style={{ width: `${homeProb}%` }} className="bg-gradient-to-r from-violet-500 to-violet-400" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700">Lean</div>
            <div className="mt-1 truncate text-sm font-bold text-white">{card.leanTeam}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700">Edge</div>
            <div className="mt-1 font-mono text-sm font-bold text-emerald-300">{signedPct(card.edge)}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700">Conf</div>
            <div className="mt-1 font-mono text-sm font-bold text-white">{pct(card.confidence)}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.04] p-8 text-center">
      <div className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">No Sim Cards</div>
      <p className="mt-3 text-sm text-slate-400">The simulation cache is empty or refreshing. Retry in a moment.</p>
      <Link href="/api/sim/refresh?force=1&source=sim-safe" className="mt-5 inline-flex rounded-2xl border border-amber-400/25 px-4 py-2 text-sm font-bold text-amber-200">
        Trigger Refresh
      </Link>
    </div>
  );
}

export default async function SimSafePage({ searchParams }: PageProps) {
  const sp: SearchParams = searchParams ? await searchParams : {};
  const limitValue = sp["limit"];
  const limitParam = Array.isArray(limitValue) ? limitValue[0] : limitValue;
  const limit = Math.max(4, Math.min(24, Number(limitParam) || INITIAL_CARD_LIMIT));

  const [hub, priority, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch(() => null),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);

  const rows = Array.isArray(priority?.rows) ? priority.rows : [];
  const cards = dedupeCards(rows);
  const visibleCards = cards.slice(0, limit);
  const hiddenCount = Math.max(0, cards.length - visibleCards.length);
  const grouped = visibleCards.reduce<Map<string, SafeCard[]>>((map, card) => {
    const key = chicagoDateKey(card.startTime);
    const list = map.get(key) ?? [];
    list.push(card);
    map.set(key, list);
    return map;
  }, new Map());

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Simulation Engine</div>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white">SimHub</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Fast safe board view: premium cards, deduped games, core model lean, confidence, and edge without the heavy detail render path.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Cards</div>
              <div className="mt-1 font-mono text-xl font-black text-white">{cards.length}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Visible</div>
              <div className="mt-1 font-mono text-xl font-black text-white">{visibleCards.length}</div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Age</div>
              <div className="mt-1 font-mono text-xl font-black text-white">{age(priority?.generatedAt ?? status?.generatedAt ?? hub?.generatedAt)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 flex flex-wrap gap-2">
        <Link href="/sim-safe?limit=8" className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">Fast 8</Link>
        <Link href="/sim-safe?limit=16" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-300">Show 16</Link>
        <Link href="/sim-fast" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Full legacy view</Link>
      </section>

      <section className="mt-6 space-y-8">
        {visibleCards.length === 0 ? <EmptyState /> : null}
        {[...grouped.entries()].map(([key, list]) => (
          <div key={key}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">{dateLabel(key)}</h2>
              <span className="text-xs text-slate-600">{list.length} game{list.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map((card) => <SimCard key={card.id} card={card} />)}
            </div>
          </div>
        ))}
      </section>

      {hiddenCount > 0 ? (
        <div className="mt-8 text-center">
          <Link href={`/sim-safe?limit=${Math.min(24, limit + 8)}`} className="inline-flex rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-200">
            Load {Math.min(8, hiddenCount)} more cards
          </Link>
        </div>
      ) : null}
    </main>
  );
}
