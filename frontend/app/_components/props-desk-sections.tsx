import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";

export function getCoverageTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getPropPriorityScore(prop: PropCardView) {
  const rankScore = prop.evProfile?.rankScore ?? 0;
  const confidenceScore = prop.confidenceScore ?? prop.fairPrice?.pricingConfidenceScore ?? 0;
  const qualityScore = prop.marketTruth?.qualityScore ?? 0;
  const movementScore = Math.min(10, Math.abs(prop.lineMovement ?? 0) * 2.5);
  const bestPriceBonus = prop.marketIntelligence?.bestPriceFlag ? 8 : 0;
  const bookBonus = Math.min(10, (prop.sportsbookCount ?? 1) * 1.6);

  return rankScore + confidenceScore * 0.45 + qualityScore * 0.2 + movementScore + bestPriceBonus + bookBonus;
}

export function sortPropsByPriority(props: PropCardView[]) {
  return [...props].sort((left, right) => getPropPriorityScore(right) - getPropPriorityScore(left));
}

function FeaturedPropCard({ prop }: { prop: PropCardView }) {
  const matchupHref = prop.gameHref ?? `/game/${prop.gameId}`;
  const fairLine =
    typeof prop.fairPrice?.fairOddsAmerican === "number"
      ? `${prop.fairPrice.fairOddsAmerican > 0 ? "+" : ""}${prop.fairPrice.fairOddsAmerican}`
      : "N/A";
  const confidence =
    typeof prop.fairPrice?.pricingConfidenceScore === "number"
      ? prop.fairPrice.pricingConfidenceScore
      : prop.confidenceScore ?? "N/A";
  const reason = prop.reasons?.[0]?.detail ?? prop.analyticsSummary?.reason ?? prop.supportNote;

  return (
    <Card className="surface-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {prop.leagueKey} | {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{prop.player.name}</div>
          <div className="mt-2 text-sm text-slate-400">
            {formatMarketType(prop.marketType)} {prop.side} {prop.line}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{prop.edgeScore.label}</Badge>
          {prop.fairPrice ? (
            <Badge tone="muted">{prop.fairPrice.pricingMethod.replace(/_/g, " ")}</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Best price</div>
          <div className="mt-2 text-base font-semibold text-white">
            {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
        </div>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">EV</div>
          <div className="mt-2 text-base font-semibold text-emerald-300">
            {typeof prop.expectedValuePct === "number"
              ? `${prop.expectedValuePct > 0 ? "+" : ""}${prop.expectedValuePct.toFixed(2)}%`
              : "N/A"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Rank {prop.evProfile?.rankScore ?? "--"} | Books {prop.sportsbookCount ?? 1}
          </div>
        </div>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fair line</div>
          <div className="mt-2 text-base font-semibold text-white">{fairLine}</div>
          <div className="mt-1 text-xs text-slate-500">
            Gap{" "}
            {typeof prop.evProfile?.fairLineGap === "number"
              ? `${prop.evProfile.fairLineGap > 0 ? "+" : ""}${prop.evProfile.fairLineGap}`
              : "N/A"}
          </div>
        </div>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Confidence</div>
          <div className="mt-2 text-base font-semibold text-white">{confidence}</div>
          <div className="mt-1 text-xs text-slate-500">
            Stake{" "}
            {typeof prop.evProfile?.kellyFraction === "number"
              ? `${(prop.evProfile.kellyFraction * 100).toFixed(1)}%`
              : "suppressed"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
        {reason ??
          "This prop stays visible because the current price, market shape, or matchup context still makes it worth opening."}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(prop.reasons ?? []).slice(0, 2).map((item) => (
          <Badge key={`${prop.id}-${item.label}`} tone={item.tone}>
            {item.label}
          </Badge>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={matchupHref}
          className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
        >
          Open matchup
        </Link>
        <Link
          href="#prop-board"
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-200"
        >
          Compare board
        </Link>
      </div>
    </Card>
  );
}

function WatchlistPropCard({ prop }: { prop: PropCardView }) {
  return (
    <Card className="surface-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {prop.leagueKey} | {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
          <div className="mt-2 text-xl font-semibold text-white">{prop.player.name}</div>
          <div className="mt-2 text-sm text-slate-400">
            {formatMarketType(prop.marketType)} {prop.side} {prop.line}
          </div>
        </div>
        <Badge tone={prop.edgeScore.label === "Elite" ? "success" : prop.edgeScore.label === "Strong" ? "brand" : "premium"}>
          {prop.edgeScore.label}
        </Badge>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-300">
        {prop.reasons?.[0]?.detail ??
          prop.analyticsSummary?.reason ??
          prop.supportNote ??
          "Keep this one on the desk until the price or context clarifies."}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-slate-400">
          {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          {" | "}
          {typeof prop.expectedValuePct === "number"
            ? `EV ${prop.expectedValuePct > 0 ? "+" : ""}${prop.expectedValuePct.toFixed(2)}%`
            : "EV unavailable"}
        </div>
        <Link
          href={prop.gameHref ?? `/game/${prop.gameId}`}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
        >
          Open matchup
        </Link>
      </div>
    </Card>
  );
}

export function PropsDeskSections({
  featuredProps,
  watchlistProps
}: {
  featuredProps: PropCardView[];
  watchlistProps: PropCardView[];
}) {
  return (
    <>
      <section id="open-now" className="grid gap-4">
        <SectionTitle
          eyebrow="Open now"
          title={featuredProps.length ? "Best prop entries on the desk" : "No prop entries deserve top billing yet"}
          description={
            featuredProps.length
              ? "These rows have the strongest current path into fair price, matchup context, and execution."
              : "SharkEdge keeps the top desk quiet when the current market does not justify conviction."
          }
        />

        <div className="grid gap-4 xl:grid-cols-3">
          {featuredProps.length ? (
            featuredProps.map((prop) => <FeaturedPropCard key={prop.id} prop={prop} />)
          ) : (
            <div className="xl:col-span-3">
              <EmptyState
                eyebrow="Open now"
                title="No prop has earned top billing in this scope"
                description="The prop desk stays quiet when the current numbers are thin or unconvincing. Widen the scope, check the watchlist desk, or move back to the board for stronger game-level entries."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href="/board"
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                    >
                      Open board
                    </Link>
                    <a
                      href="#watchlist"
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                    >
                      Open watchlist desk
                    </a>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </section>

      <section id="watchlist" className="grid gap-4">
        <SectionTitle
          eyebrow="Watchlist desk"
          title="Props still worth monitoring"
          description="These rows still matter. They just should not lead the product over cleaner or stronger entries."
        />

        <div className="grid gap-4 xl:grid-cols-2">
          {watchlistProps.length ? (
            watchlistProps.map((prop) => <WatchlistPropCard key={prop.id} prop={prop} />)
          ) : (
            <div className="xl:col-span-2">
              <EmptyState
                eyebrow="Watchlist desk"
                title="The prop slate is already concentrated up top"
                description="Nothing else is close enough to the top desk right now, so this secondary lane stays quiet instead of padding the page with weaker rows."
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
