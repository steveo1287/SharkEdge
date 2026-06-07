import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { getMlbPlayerMarketOpportunities, type MlbPlayerMarketOpportunity } from "@/services/simulation/mlb-player-market-opportunities";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;
type DecisionFilter = "all" | "PROMOTE" | "WATCH" | "PASS";
type GroupFilter = "all" | "hitters" | "starters" | "f5" | "nrfi";

type Filters = {
  decision: DecisionFilter;
  group: GroupFilter;
};

function firstParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function decisionParam(params: SearchParams): DecisionFilter {
  const raw = String(firstParam(params, "decision") ?? "all").toUpperCase();
  return raw === "PROMOTE" || raw === "WATCH" || raw === "PASS" ? raw : "all";
}

function groupParam(params: SearchParams): GroupFilter {
  const raw = String(firstParam(params, "group") ?? "all").toLowerCase();
  return raw === "hitters" || raw === "starters" || raw === "f5" || raw === "nrfi" ? raw : "all";
}

function marketGroup(market: MlbPlayerMarketOpportunity): GroupFilter {
  if (market.market.startsWith("hitter_")) return "hitters";
  if (market.market.startsWith("pitcher_")) return "starters";
  if (market.market === "nrfi" || market.market === "yrfi") return "nrfi";
  if (market.market.startsWith("first_five_")) return "f5";
  return "all";
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatStartTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function decisionTone(decision: MlbPlayerMarketOpportunity["decision"]) {
  if (decision === "PROMOTE") return "success" as const;
  if (decision === "WATCH") return "premium" as const;
  return "muted" as const;
}

function lineText(value: number | null) {
  if (value == null) return "ML";
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function buildHref(current: Filters, patch: Partial<Filters>) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.decision !== "all") params.set("decision", next.decision.toLowerCase());
  if (next.group !== "all") params.set("group", next.group);
  return params.size ? `/mlb/player-markets?${params.toString()}` : "/mlb/player-markets";
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={active
        ? "rounded-full border border-sky-400/35 bg-sky-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100"
        : "rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-sky-400/25 hover:text-white"}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-3">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function MarketCard({ market }: { market: MlbPlayerMarketOpportunity }) {
  return (
    <Card className="surface-panel h-full p-5 transition hover:border-emerald-300/25 hover:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.64rem] uppercase tracking-[0.2em] text-slate-500">
            {market.source === "inning_market" ? "F5 / NRFI" : "Player"}
          </div>
          <div className="mt-2 line-clamp-2 font-display text-xl font-semibold tracking-tight text-white">
            {market.label}
          </div>
        </div>
        <Badge tone={decisionTone(market.decision)}>{market.decision === "PROMOTE" ? "BEST" : market.decision}</Badge>
      </div>

      <div className="mt-4 text-sm leading-6 text-slate-400">
        <div className="font-medium text-slate-300">{market.snapshotEventLabel}</div>
        <div>{formatStartTime(market.startTime)}</div>
        {market.playerName ? <div>{market.team} · {market.playerName}</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Chance" value={pct(market.calibratedProbability)} />
        <Stat label="Conf" value={pct(market.confidence)} />
        <Stat label="Line" value={lineText(market.line)} />
      </div>

      <div className="mt-4 rounded-[1rem] border border-white/8 bg-slate-950/45 px-3 py-2 text-xs leading-5 text-slate-400">
        {market.reason}
      </div>
    </Card>
  );
}

function filterMarkets(markets: MlbPlayerMarketOpportunity[], filters: Filters) {
  return markets.filter((market) => {
    if (filters.decision !== "all" && market.decision !== filters.decision) return false;
    if (filters.group !== "all" && marketGroup(market) !== filters.group) return false;
    return true;
  });
}

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

export default async function MlbPlayerMarketsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const filters: Filters = {
    decision: decisionParam(params),
    group: groupParam(params)
  };
  const feed = await getMlbPlayerMarketOpportunities({
    limit: 150,
    lookaheadHours: 120,
    lookbackHours: 12,
    includePass: filters.decision === "PASS"
  });
  const filtered = filterMarkets(feed.opportunities, filters);
  const best = filtered.filter((market) => market.decision === "PROMOTE").length;
  const watch = filtered.filter((market) => market.decision === "WATCH").length;

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">MLB player market desk</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Simple player props, F5, NRFI and YRFI board.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Shows only the market, chance, confidence, and a short reason. Deeper model details stay out of the way.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/games" className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400">
                Back to games
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <Stat label="Shown" value={String(filtered.length)} />
            <Stat label="Best" value={String(best)} />
            <Stat label="Watch" value={String(watch)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Filters"
          title="Keep it tight"
          description="Use only the filters most people need."
        />
        <div className="grid gap-3 rounded-[1.35rem] border border-white/8 bg-white/[0.025] p-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "PROMOTE", "WATCH"] as const).map((decision) => (
              <FilterLink key={decision} href={buildHref(filters, { decision })} active={filters.decision === decision}>
                {decision === "all" ? "All" : decision === "PROMOTE" ? "Best" : "Watch"}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "hitters", "starters", "f5", "nrfi"] as const).map((group) => (
              <FilterLink key={group} href={buildHref(filters, { group })} active={filters.group === group}>
                {group === "all" ? "All markets" : group.toUpperCase()}
              </FilterLink>
            ))}
          </div>
        </div>
      </section>

      {filtered.length ? (
        <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((market) => (
            <MarketCard
              key={`${market.snapshotGameId}-${market.source}-${market.market}-${market.playerId ?? "game"}-${market.side}-${market.line ?? "ml"}`}
              market={market}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          eyebrow="MLB player markets"
          title="No markets match the current filters"
          description={feed.ok ? "The feed is online, but no saved player markets match these filters." : feed.warnings[0] || "The market feed is unavailable."}
        />
      )}
    </div>
  );
}
