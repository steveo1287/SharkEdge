import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { GameCardView } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import { cn } from "@/lib/utils/cn";

type InspectorMarketView = {
  key: "moneyline" | "spread" | "total";
  label: string;
  lineLabel: string;
  movementLabel: string;
  opportunity: OpportunityView;
};

type BoardInspectorProps = {
  game: GameCardView | null;
  markets: InspectorMarketView[];
  sourceLabel: string;
  updatedLabel: string;
};

function formatSignedPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSignedAmerican(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}

function InspectorMetric({ label, value, tone }: { label: string; value: string; tone?: "default" | "accent" }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={cn("mt-2 text-sm font-semibold", tone === "accent" ? "text-sky-300" : "text-white")}>{value}</div>
    </div>
  );
}

export function BoardInspector({ game, markets, sourceLabel, updatedLabel }: BoardInspectorProps) {
  if (!game) {
    return (
      <aside className="mobile-surface xl:sticky xl:top-[7.2rem]">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Inspector</div>
        <div className="mt-2 text-[1rem] font-semibold text-white">No verified game selected</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          Pick a verified board row to see the strongest market, movement context, and execution summary.
        </div>
      </aside>
    );
  }

  const bestMarket = [...markets].sort((left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore)[0];
  const leadReasons = bestMarket?.opportunity.whyItShows.slice(0, 3) ?? [];
  const killReasons = bestMarket?.opportunity.whatCouldKillIt.slice(0, 2) ?? [];

  return (
    <aside className="mobile-surface xl:sticky xl:top-[7.2rem]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Inspector</div>
          <div className="mt-1 text-[1.1rem] font-semibold tracking-tight text-white">
            {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <div className="rounded-full border border-white/8 px-3 py-1.5">{game.leagueKey}</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">{sourceLabel}</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">{updatedLabel}</div>
          </div>
        </div>

        <SharkScoreRing
          score={game.edgeScore.score}
          size="sm"
          tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {markets.map((market) => {
          const isBest = market.key === bestMarket?.key;
          return (
            <div
              key={market.key}
              className={cn(
                "rounded-[1rem] border px-3 py-3",
                isBest ? "border-sky-400/30 bg-sky-500/[0.08]" : "border-white/8 bg-white/[0.03]"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{market.label}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{market.lineLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Action</div>
                  <div className="mt-1 text-sm font-semibold text-sky-300">{market.opportunity.actionState.replaceAll("_", " ")}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <InspectorMetric label="Score" value={`${Math.round(market.opportunity.opportunityScore)}`} />
                <InspectorMetric label="Confidence" value={market.opportunity.confidenceTier} tone="accent" />
                <InspectorMetric label="EV" value={formatSignedPercent(market.opportunity.expectedValuePct)} />
                <InspectorMetric label="Delta" value={formatSignedAmerican(market.opportunity.marketDeltaAmerican)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                <div className="rounded-full border border-white/8 px-3 py-1.5">{market.movementLabel}</div>
                <div className="rounded-full border border-white/8 px-3 py-1.5">{market.opportunity.bookCount} books</div>
                <div className="rounded-full border border-white/8 px-3 py-1.5">{market.opportunity.sportsbookName ?? "Best book pending"}</div>
              </div>
            </div>
          );
        })}
      </div>

      {leadReasons.length ? (
        <div className="mt-5 rounded-[1rem] border border-white/8 bg-[#08111c] px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Why it shows</div>
          <div className="mt-2 text-sm font-semibold text-white">{bestMarket?.label ?? "Lead market"} is the lead angle right now.</div>
          <ul className="mt-3 grid gap-2 pl-4 text-sm leading-6 text-slate-300">
            {leadReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {killReasons.length ? (
        <div className="mt-4 rounded-[1rem] border border-amber-400/20 bg-amber-500/[0.05] px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Risk flags</div>
          <ul className="mt-3 grid gap-2 pl-4 text-sm leading-6 text-slate-300">
            {killReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={game.detailHref ?? `/game/${game.id}`}
          className="rounded-full border border-sky-400/30 bg-sky-500/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200 transition hover:border-sky-300/50 hover:bg-sky-500/18"
        >
          Open full game
        </Link>
        <div className="rounded-full border border-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          {game.edgeScore.label}
        </div>
      </div>
    </aside>
  );
}
