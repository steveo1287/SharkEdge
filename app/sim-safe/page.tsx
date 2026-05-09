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

const INITIAL_CARD_LIMIT = 8;

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

type SafeCard = {
  id: string;
  leagueKey: string;
  awayTeam: string;
  homeTeam: string;
  leanTeam: string;
  leanPct: number;
  edge: number | null;
  confidence: number | null;
  tier: string;
  startTime: string | null;
};

function safeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safePercent(value: unknown) {
  const num = safeNumber(value, 0);
  return `${(num * 100).toFixed(1)}%`;
}

function safeDate(value: unknown) {
  if (typeof value !== "string") return "TBD";

  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "TBD";
  }
}

function normalizeRow(row: SimPriorityRow, index: number): SafeCard {
  return {
    id: safeText(row?.id, `card-${index}`),
    leagueKey: safeText(row?.leagueKey, "SIM"),
    awayTeam: safeText(row?.matchup?.away, "Away"),
    homeTeam: safeText(row?.matchup?.home, "Home"),
    leanTeam: safeText(row?.lean?.team, "Model"),
    leanPct: Math.max(0, Math.min(1, safeNumber(row?.lean?.pct, 0.5))),
    edge: Number.isFinite(row?.lean?.edge as number) ? (row?.lean?.edge as number) : null,
    confidence: Number.isFinite(row?.confidence as number) ? (row?.confidence as number) : null,
    tier: safeText(row?.tier, "WATCH"),
    startTime: typeof row?.startTime === "string" ? row.startTime : null
  };
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
      Simulation data temporarily unavailable.
    </div>
  );
}

function SimCard({ card }: { card: SafeCard }) {
  const awayProb = Math.max(0, Math.min(100, card.leanPct * 100));
  const homeProb = Math.max(0, Math.min(100, 100 - awayProb));

  return (
    <article className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] shadow-2xl shadow-black/20">
      <div className="h-1 bg-gradient-to-r from-cyan-400/80 via-violet-400/70 to-emerald-400/70" />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                {card.leagueKey}
              </span>

              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
                {card.tier}
              </span>
            </div>

            <h2 className="mt-3 truncate text-xl font-black tracking-tight text-white">
              {card.awayTeam} <span className="text-slate-600">@</span> {card.homeTeam}
            </h2>

            <div className="mt-1 text-xs text-slate-500">
              {safeDate(card.startTime)}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-slate-400">{card.awayTeam}</div>
              <div className="mt-1 font-mono text-2xl font-black text-cyan-300">
                {awayProb.toFixed(1)}%
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">{card.homeTeam}</div>
              <div className="mt-1 font-mono text-2xl font-black text-violet-300">
                {homeProb.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800/80">
            <div style={{ width: `${awayProb}%` }} className="bg-cyan-400" />
            <div style={{ width: `${homeProb}%` }} className="bg-violet-400" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="text-[9px] uppercase tracking-[0.16em] text-slate-700">Lean</div>
            <div className="mt-1 truncate text-sm font-bold text-white">{card.leanTeam}</div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="text-[9px] uppercase tracking-[0.16em] text-slate-700">Edge</div>
            <div className="mt-1 text-sm font-bold text-emerald-300">
              {card.edge == null ? "—" : safePercent(card.edge)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3">
            <div className="text-[9px] uppercase tracking-[0.16em] text-slate-700">Conf</div>
            <div className="mt-1 text-sm font-bold text-white">
              {card.confidence == null ? "—" : safePercent(card.confidence)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function SimSafePage({ searchParams }: PageProps) {
  try {
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
    const cards = rows.slice(0, limit).map(normalizeRow);

    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
                Simulation Engine
              </div>

              <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
                SimHub
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Fast stable simulation board with premium cards and lightweight rendering.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-right">
              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-600">Cards</div>
                <div className="mt-1 font-mono text-xl font-black text-white">{cards.length}</div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-600">Visible</div>
                <div className="mt-1 font-mono text-xl font-black text-white">{cards.length}</div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-600">Age</div>
                <div className="mt-1 font-mono text-xl font-black text-white">
                  {safeDate(priority?.generatedAt ?? status?.generatedAt ?? hub?.generatedAt)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {cards.length === 0
            ? <EmptyState />
            : cards.map((card) => <SimCard key={card.id} card={card} />)}
        </section>
      </main>
    );
  } catch {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <EmptyState />
      </main>
    );
  }
}
