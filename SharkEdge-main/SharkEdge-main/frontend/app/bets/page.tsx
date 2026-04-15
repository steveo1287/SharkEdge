import Link from "next/link";

import { formatAmericanOdds, formatPercent, formatUnits } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";
import type { LedgerBetView } from "@/lib/types/ledger";
import type { OpportunityView } from "@/lib/types/opportunity";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getBetTrackerData, getPerformanceDashboard, parseBetFilters } from "@/services/bets/bets-service";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MarketKey = "moneyline" | "spread" | "total";
type PendingRow = {
  game: GameCardView;
  market: MarketKey;
  opportunity: OpportunityView;
};

function getMarketLabel(market: MarketKey) {
  return market === "moneyline" ? "Moneyline" : market === "spread" ? "Spread" : "Total";
}

function bestOpportunityForGame(game: GameCardView): PendingRow {
  const candidates = (["moneyline", "spread", "total"] as const).map((market) => ({
    game,
    market,
    opportunity: buildGameMarketOpportunity(game, market)
  }));

  return candidates.sort((left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore)[0];
}

function formatSignedPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatConfidence(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "Open";
}

function summaryCard(label: string, value: string, note: string, tone?: string) {
  return (
    <div className="edge-panel-soft rounded-[1.2rem] p-4">
      <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-3 text-[1.9rem] font-semibold ${tone ?? "text-white"}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-400">{note}</div>
    </div>
  );
}

function betResultTone(result: LedgerBetView["result"]) {
  if (result === "WIN") return "text-emerald-200";
  if (result === "LOSS") return "text-rose-200";
  if (result === "PUSH") return "text-amber-200";
  return "text-white";
}

function BetCard({ bet, compact = false }: { bet: LedgerBetView; compact?: boolean }) {
  return (
    <div className="edge-panel-soft rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{bet.eventLabel ?? bet.selection}</div>
          <div className="mt-1 text-sm text-slate-400">{bet.league} · {bet.marketLabel ?? bet.marketType} · {bet.selection}</div>
        </div>
        <div className={`text-sm font-medium ${betResultTone(bet.result)}`}>{bet.result}</div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Odds</div>
          <div className="mt-1 font-semibold text-white">{bet.oddsAmerican ? formatAmericanOdds(bet.oddsAmerican) : "--"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Stake</div>
          <div className="mt-1 font-semibold text-white">{typeof bet.stake === "number" ? `${bet.stake.toFixed(2)}u` : "--"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">CLV</div>
          <div className="mt-1 font-semibold text-white">{typeof bet.clvPercentage === "number" ? formatSignedPercent(bet.clvPercentage) : "--"}</div>
        </div>
        {!compact ? (
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Context</div>
            <div className="mt-1 font-semibold text-white">{formatConfidence(bet.context?.confidenceTier)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default async function BetsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBetFilters(resolved);
  const selection = Array.isArray(resolved.selection) ? resolved.selection[0] : resolved.selection;
  const prefill = Array.isArray(resolved.prefill) ? resolved.prefill[0] : resolved.prefill;

  const [data, performance, board] = await Promise.all([
    getBetTrackerData(filters, selection, prefill),
    getPerformanceDashboard(),
    getBoardCommandData({ league: filters.league, date: "today", market: "all", sort: "edge" })
  ]);

  const pendingIdeas = board.verifiedGames.map(bestOpportunityForGame).slice(0, 6);
  const openBets = data.openBets.slice(0, 8);
  const settledBets = data.settledBets.slice(0, 8);

  return (
    <div className="grid gap-6">
      <section className="edge-panel overflow-hidden rounded-[1.8rem] p-5 xl:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-300">Portfolio and execution</div>
            <h1 className="mt-3 max-w-4xl font-display text-[2.2rem] font-semibold tracking-tight text-white xl:text-[4rem] xl:leading-[0.98]">
              Open exposure, pending ideas, and real review in one place.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 xl:text-base">
              This is not a vanity picks page. It tracks what is open, what still qualifies on the board, and whether execution is beating the close.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="#open" className="rounded-full border border-cyan-400/30 bg-cyan-400/[0.10] px-4 py-2 text-sm font-medium text-cyan-100">Open exposure</Link>
              <Link href="#pending" className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white">Pending ideas</Link>
              <Link href="#graded" className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white">Recent grading</Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {summaryCard("Open bets", String(data.summary.openBets), "Current tracked exposure")}
            {summaryCard("Net units", formatUnits(performance.summary.netUnits ?? 0), "Tracked portfolio result", (performance.summary.netUnits ?? 0) >= 0 ? "text-emerald-200" : "text-rose-200")}
            {summaryCard("ROI", formatPercent(performance.summary.roi ?? 0), "Return on staked units")}
            {summaryCard("Beat close", performance.summary.positiveClvRate === null ? "--" : `${performance.summary.positiveClvRate.toFixed(0)}%`, "Positive CLV rate", "text-cyan-100")}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_0.85fr] xl:items-start">
        <section id="open" className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Portfolio state</div>
              <div className="mt-1 text-2xl font-semibold text-white">Open exposure</div>
            </div>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-300">
              {openBets.length} visible
            </div>
          </div>

          <div className="grid gap-3">
            {openBets.map((bet) => (
              <BetCard key={bet.id} bet={bet} />
            ))}
            {!openBets.length ? (
              <div className="edge-panel rounded-[1.45rem] p-6 text-sm leading-7 text-slate-400">
                No open bets are tracked right now. The portfolio stays clean until there is actual exposure to review.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="grid gap-4">
          <div className="edge-panel rounded-[1.45rem] p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Portfolio health</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Record</div>
                <div className="mt-1 text-lg font-semibold text-white">{performance.summary.record}</div>
              </div>
              <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Average CLV</div>
                <div className="mt-1 text-lg font-semibold text-white">{typeof performance.summary.averageClv === "number" ? formatSignedPercent(performance.summary.averageClv) : "--"}</div>
              </div>
              <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Live notes</div>
                <div className="mt-2 grid gap-2 text-sm text-slate-300">
                  {data.liveNotes.slice(0, 3).map((note) => (
                    <div key={note} className="rounded-[0.9rem] bg-white/[0.03] px-3 py-2">{note}</div>
                  ))}
                  {!data.liveNotes.length ? <div className="text-slate-500">No live portfolio notes.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section id="pending" className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Decision queue</div>
            <div className="mt-1 text-2xl font-semibold text-white">Pending opportunities</div>
          </div>
          <Link href="/board" className="rounded-full border border-cyan-400/30 bg-cyan-400/[0.10] px-4 py-2 text-sm font-medium text-cyan-100">
            Open board
          </Link>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {pendingIdeas.map((idea) => (
            <Link key={`${idea.game.id}:${idea.market}`} href={idea.game.detailHref ?? `/game/${idea.game.id}`} className="edge-panel rounded-[1.35rem] p-4 transition hover:border-white/[0.14]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{idea.game.awayTeam.abbreviation} @ {idea.game.homeTeam.abbreviation}</div>
                  <div className="mt-1 text-sm text-slate-400">{getMarketLabel(idea.market)} · {idea.opportunity.selectionLabel}</div>
                </div>
                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-1.5 text-[11px] font-medium text-cyan-100">
                  {idea.opportunity.confidenceTier}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Price</div>
                  <div className="mt-1 font-semibold text-white">{idea.game[idea.market].lineLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Odds</div>
                  <div className="mt-1 font-semibold text-white">{typeof idea.opportunity.displayOddsAmerican === "number" ? formatAmericanOdds(idea.opportunity.displayOddsAmerican) : "--"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Edge</div>
                  <div className="mt-1 font-semibold text-emerald-200">{formatSignedPercent(idea.opportunity.expectedValuePct)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Action</div>
                  <div className="mt-1 font-semibold text-white">{idea.opportunity.actionState.replace(/_/g, " ")}</div>
                </div>
              </div>
              <div className="mt-4 text-sm leading-6 text-slate-300">{idea.opportunity.reasonSummary}</div>
            </Link>
          ))}
        </div>
      </section>

      <section id="graded" className="grid gap-4">
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Review</div>
          <div className="mt-1 text-2xl font-semibold text-white">Recent grading</div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {settledBets.map((bet) => (
            <BetCard key={bet.id} bet={bet} compact />
          ))}
          {!settledBets.length ? (
            <div className="edge-panel rounded-[1.45rem] p-6 text-sm leading-7 text-slate-400">
              No settled bets are available in the current filter scope.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
