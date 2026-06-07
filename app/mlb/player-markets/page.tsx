import Link from "next/link";

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
type CalibrationFilter = "all" | "LEARNED" | "SAMPLE_TOO_SMALL" | "UNTRAINED";

function firstParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(params: SearchParams, key: string, fallback: number, min: number, max: number) {
  const raw = firstParam(params, key);
  const parsed = raw == null ? fallback : Number(raw);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function decisionParam(params: SearchParams): DecisionFilter {
  const raw = String(firstParam(params, "decision") ?? "all").toUpperCase();
  return raw === "PROMOTE" || raw === "WATCH" || raw === "PASS" ? raw : "all";
}

function groupParam(params: SearchParams): GroupFilter {
  const raw = String(firstParam(params, "group") ?? "all").toLowerCase();
  return raw === "hitters" || raw === "starters" || raw === "f5" || raw === "nrfi" ? raw : "all";
}

function calibrationParam(params: SearchParams): CalibrationFilter {
  const raw = String(firstParam(params, "calibration") ?? "all").toUpperCase();
  return raw === "LEARNED" || raw === "SAMPLE_TOO_SMALL" || raw === "UNTRAINED" ? raw : "all";
}

function marketGroup(market: MlbPlayerMarketOpportunity): GroupFilter {
  if (market.market.startsWith("hitter_")) return "hitters";
  if (market.market.startsWith("pitcher_")) return "starters";
  if (market.market === "nrfi" || market.market === "yrfi") return "nrfi";
  if (market.market.startsWith("first_five_")) return "f5";
  return "all";
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function wholePct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function signedPct(value: number) {
  return `${value >= 0 ? "+" : ""}${pct(value)}`;
}

function formatStartTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function decisionTone(decision: MlbPlayerMarketOpportunity["decision"]) {
  if (decision === "PROMOTE") return "success" as const;
  if (decision === "WATCH") return "premium" as const;
  return "muted" as const;
}

function calibrationTone(status: MlbPlayerMarketOpportunity["calibrationStatus"]) {
  if (status === "LEARNED") return "success" as const;
  if (status === "SAMPLE_TOO_SMALL") return "premium" as const;
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
  if (next.calibration !== "all") params.set("calibration", next.calibration.toLowerCase());
  if (next.minConfidence > 0) params.set("minConfidence", String(next.minConfidence));
  if (next.minEdge > 0) params.set("minEdge", String(next.minEdge));
  if (next.includePass) params.set("includePass", "1");
  return params.size ? `/mlb/player-markets?${params.toString()}` : "/mlb/player-markets";
}

type Filters = {
  decision: DecisionFilter;
  group: GroupFilter;
  calibration: CalibrationFilter;
  minConfidence: number;
  minEdge: number;
  includePass: boolean;
};

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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

function MarketCard({ market }: { market: MlbPlayerMarketOpportunity }) {
  return (
    <Card className="surface-panel h-full p-5 transition hover:border-emerald-300/25 hover:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[0.64rem] uppercase tracking-[0.2em] text-slate-500">
            <span>{market.source === "inning_market" ? "F5 / NRFI" : "Player"}</span>
            <span>·</span>
            <span>{market.market.replaceAll("_", " ")}</span>
          </div>
          <div className="mt-2 line-clamp-2 font-display text-xl font-semibold tracking-tight text-white">
            {market.label}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge tone={decisionTone(market.decision)}>{market.decision}</Badge>
          <Badge tone={calibrationTone(market.calibrationStatus)}>{market.calibrationStatus.replaceAll("_", " ")}</Badge>
        </div>
      </div>

      <div className="mt-4 text-sm leading-6 text-slate-400">
        <div className="font-medium text-slate-300">{market.snapshotEventLabel}</div>
        <div>{formatStartTime(market.startTime)}</div>
        {market.playerName ? <div>{market.team} · {market.playerName}</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Cal prob" value={pct(market.calibratedProbability)} sub={`raw ${pct(market.rawProbability)}`} />
        <Metric label="Edge" value={signedPct(market.edgeVsBaseline)} sub={`min ${pct(market.minEdgeRequired)}`} />
        <Metric label="Confidence" value={wholePct(market.confidence)} sub="after cap" />
        <Metric label="Line" value={lineText(market.line)} sub={market.side} />
      </div>

      <div className="mt-4 rounded-[1rem] border border-white/8 bg-slate-950/45 px-3 py-2 text-xs leading-5 text-slate-400">
        {market.reason}
      </div>
    </Card>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-3">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      <div className="text-[0.68rem] text-slate-500">{sub}</div>
    </div>
  );
}

function filterMarkets(markets: MlbPlayerMarketOpportunity[], filters: Filters) {
  return markets.filter((market) => {
    if (filters.decision !== "all" && market.decision !== filters.decision) return false;
    if (filters.group !== "all" && marketGroup(market) !== filters.group) return false;
    if (filters.calibration !== "all" && market.calibrationStatus !== filters.calibration) return false;
    if (market.confidence < filters.minConfidence) return false;
    if (market.edgeVsBaseline < filters.minEdge) return false;
    return true;
  });
}

export default async function MlbPlayerMarketsPage({ searchParams }: { searchParams?: Promise<SearchParams> | SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const filters: Filters = {
    decision: decisionParam(params),
    group: groupParam(params),
    calibration: calibrationParam(params),
    minConfidence: numberParam(params, "minConfidence", 0, 0, 1),
    minEdge: numberParam(params, "minEdge", 0, 0, 0.5),
    includePass: firstParam(params, "includePass") === "1" || firstParam(params, "includePass") === "true"
  };
  const feed = await getMlbPlayerMarketOpportunities({ limit: 300, lookaheadHours: 120, lookbackHours: 12, includePass: filters.includePass || filters.decision === "PASS" });
  const filtered = filterMarkets(feed.opportunities, filters);
  const promoted = filtered.filter((market) => market.decision === "PROMOTE").length;
  const watch = filtered.filter((market) => market.decision === "WATCH").length;
  const pass = filtered.filter((market) => market.decision === "PASS").length;

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">MLB player market desk</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Player props, F5, NRFI and YRFI — calibrated from our own ledger.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This page promotes only markets that survived the player-stat projection, inning model, historical grading, and market-specific calibration profile.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/games" className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400">
                Back to games
              </Link>
              <Link href="/api/mlb/player-market-opportunities?includePass=1&limit=100" className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25">
                Open raw feed
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300 md:grid-cols-4 xl:grid-cols-2">
            <Metric label="Shown" value={String(filtered.length)} sub={`${feed.total} feed rows`} />
            <Metric label="Promoted" value={String(promoted)} sub="cleared gate" />
            <Metric label="Watch" value={String(watch)} sub="near threshold" />
            <Metric label="Pass" value={String(pass)} sub="debug only" />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Filters"
          title="Narrow the market board"
          description="Use these server-side filters to cut the board down by decision, market family, calibration status, confidence, and edge."
        />
        <div className="grid gap-3 rounded-[1.35rem] border border-white/8 bg-white/[0.025] p-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "PROMOTE", "WATCH", "PASS"] as const).map((decision) => (
              <FilterLink key={decision} href={buildHref(filters, { decision, includePass: decision === "PASS" ? true : filters.includePass })} active={filters.decision === decision}>
                {decision === "all" ? "All decisions" : decision}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "hitters", "starters", "f5", "nrfi"] as const).map((group) => (
              <FilterLink key={group} href={buildHref(filters, { group })} active={filters.group === group}>
                {group === "all" ? "All groups" : group}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "LEARNED", "SAMPLE_TOO_SMALL", "UNTRAINED"] as const).map((calibration) => (
              <FilterLink key={calibration} href={buildHref(filters, { calibration })} active={filters.calibration === calibration}>
                {calibration === "all" ? "All calibration" : calibration.replaceAll("_", " ")}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([0, 0.45, 0.55, 0.65] as const).map((minConfidence) => (
              <FilterLink key={minConfidence} href={buildHref(filters, { minConfidence })} active={filters.minConfidence === minConfidence}>
                {minConfidence === 0 ? "Any confidence" : `Conf ${wholePct(minConfidence)}+`}
              </FilterLink>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([0, 0.03, 0.05, 0.08] as const).map((minEdge) => (
              <FilterLink key={minEdge} href={buildHref(filters, { minEdge })} active={filters.minEdge === minEdge}>
                {minEdge === 0 ? "Any edge" : `Edge ${wholePct(minEdge)}+`}
              </FilterLink>
            ))}
            <FilterLink href={buildHref(filters, { includePass: !filters.includePass })} active={filters.includePass}>
              {filters.includePass ? "Pass included" : "Include pass"}
            </FilterLink>
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
          description={feed.ok ? "The feed is online, but no saved calibrated player markets match these filters." : feed.warnings[0] || "The market feed is unavailable."}
        />
      )}

      {feed.warnings.length ? (
        <section className="rounded-[1.1rem] border border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs leading-5 text-amber-100/80">
          {feed.warnings.slice(0, 3).join(" · ")}
        </section>
      ) : null}
    </div>
  );
}
