import Link from "next/link";

import { LeagueBadge } from "@/components/identity/league-badge";
import { TeamBadge } from "@/components/identity/team-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";

type Props = {
  games: GameCardView[];
};

function getStatusTone(status: GameCardView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getLeadMarket(game: GameCardView) {
  const marketKeys = ["spread", "moneyline", "total"] as const;

  return (
    marketKeys
      .map((marketKey) => {
        const market = game[marketKey];
        const rankScore = market.evProfile?.rankScore ?? 0;
        const confidenceScore = market.confidenceScore ?? 0;
        const movementBonus = Math.min(
          12,
          Math.abs(market.movement) * (marketKey === "moneyline" ? 0.35 : 2.5)
        );
        const qualityBonus = market.marketTruth?.qualityScore ?? 0;
        const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 8 : 0;

        return {
          marketKey,
          score:
            rankScore +
            confidenceScore * 0.45 +
            qualityBonus * 0.2 +
            movementBonus +
            bestPriceBonus
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.marketKey ?? "spread"
  );
}

function formatMovementUnit(
  marketKey: "spread" | "moneyline" | "total",
  movement: number
) {
  if (!movement) {
    return "No move";
  }

  return `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${
    marketKey === "moneyline" ? "c" : "pts"
  }`;
}

function formatMarketLabel(value: string) {
  return value.startsWith("No ") ? "-" : value;
}

function formatMarketTitle(value: "spread" | "moneyline" | "total") {
  if (value === "moneyline") {
    return "Moneyline";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatOddsValue(value: number) {
  return value ? formatAmericanOdds(value) : "-";
}

export function MarketMoversPanel({ games }: Props) {
  return (
    <section className="grid gap-4">
      <SectionTitle
        eyebrow="Market movers"
        title="Where the slate actually moved"
        description="Fast scan cards for movement worth opening, not empty volatility."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {games.map((game) => {
          const leadMarket = getLeadMarket(game);
          const leadView = game[leadMarket];

          return (
            <Card key={game.id} className="surface-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <LeagueBadge league={game.leagueKey} />
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {formatGameDateTime(game.startTime)}
                  </div>
                </div>

                <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="flex items-center gap-3">
                  <TeamBadge
                    name={game.awayTeam.name}
                    abbreviation={game.awayTeam.abbreviation}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      Away
                    </div>
                    <div className="truncate text-base font-semibold text-white">
                      {game.awayTeam.name}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <TeamBadge
                    name={game.homeTeam.name}
                    abbreviation={game.homeTeam.abbreviation}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      Home
                    </div>
                    <div className="truncate text-base font-semibold text-white">
                      {game.homeTeam.name}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[1.15rem] border border-white/8 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                    Lead market
                  </div>
                  <div className="text-sm font-medium text-slate-200">
                    {formatMarketTitle(leadMarket)}
                  </div>
                </div>

                <div className="mt-3 text-2xl font-semibold text-white">
                  {formatMovementUnit(leadMarket, leadView.movement)}
                </div>

                <div className="mt-2 text-sm text-slate-300">
                  {formatMarketLabel(leadView.label)}
                </div>

                <div className="mt-2 text-sm text-slate-400">
                  {leadView.bestBook !== "Unavailable"
                    ? formatMarketLabel(leadView.bestBook)
                    : "-"}{" "}
                  | {formatOddsValue(leadView.bestOdds)}
                </div>

                <div className="mt-3 text-sm leading-6 text-slate-300">
                  {leadView.reasons?.[0]?.detail ??
                    leadView.marketTruth?.note ??
                    "Open the matchup to see whether the move still has support."}
                </div>
              </div>

              <div className="mt-5">
                <Link
                  href={game.detailHref ?? `/game/${game.id}`}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
                >
                  Open matchup
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}