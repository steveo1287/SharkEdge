import type { MarketIntelligenceView, LineMovementSummaryView } from "@/lib/types/domain";
import type { NormalizedOddsSnapshot } from "@/lib/market/odds-snapshot";
import { getLatestSnapshotsBySportsbook, buildSnapshotSequences } from "@/lib/market/odds-snapshot";

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  if (mean === null || values.length < 2) {
    return 0;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function buildLineMovementSummary(args: {
  openPrice: number | null;
  currentPrice: number | null;
  openLine: number | null;
  currentLine: number | null;
  marketLabel: string;
}) {
  const priceDelta =
    typeof args.openPrice === "number" && typeof args.currentPrice === "number"
      ? round(args.currentPrice - args.openPrice, 2)
      : null;
  const lineDelta =
    typeof args.openLine === "number" && typeof args.currentLine === "number"
      ? round(args.currentLine - args.openLine, 2)
      : null;

  const summary =
    priceDelta === null && lineDelta === null
      ? `${args.marketLabel} has no open/current delta yet.`
      : `${args.marketLabel} moved ${
          lineDelta !== null ? `${lineDelta > 0 ? "+" : ""}${lineDelta} line` : ""
        }${lineDelta !== null && priceDelta !== null ? " and " : ""}${
          priceDelta !== null ? `${priceDelta > 0 ? "+" : ""}${priceDelta} price` : ""
        }.`;

  return {
    openPrice: args.openPrice,
    currentPrice: args.currentPrice,
    openLine: args.openLine,
    currentLine: args.currentLine,
    priceDelta,
    lineDelta,
    summary
  } satisfies LineMovementSummaryView;
}

export function buildMarketIntelligence(args: {
  marketLabel: string;
  sideSnapshots: NormalizedOddsSnapshot[];
  offeredSportsbookKey?: string | null;
}) {
  const latestSnapshots = getLatestSnapshotsBySportsbook(args.sideSnapshots);
  const sequences = buildSnapshotSequences(args.sideSnapshots);
  const currentLineValues = latestSnapshots
    .map((snapshot) => snapshot.line)
    .filter((line): line is number => typeof line === "number");
  const currentProbabilities = latestSnapshots.map((snapshot) => snapshot.impliedProbRaw);
  const consensusImpliedProbability = average(currentProbabilities);
  const marketDisagreementScore = round(Math.min(1, standardDeviation(currentProbabilities) * 8), 4);
  const latestByPrice = [...latestSnapshots].sort((left, right) => right.oddsAmerican - left.oddsAmerican);
  const bestAvailable = latestByPrice[0] ?? null;
  const offeredSnapshot =
    args.offeredSportsbookKey
      ? latestSnapshots.find((snapshot) => snapshot.sportsbookKey === args.offeredSportsbookKey) ?? null
      : bestAvailable;
  const sourceCount = latestSnapshots.length;
  const staleFlag = latestSnapshots.every((snapshot) => snapshot.isStale);
  const staleCount = latestSnapshots.filter((snapshot) => snapshot.isStale).length;
  const ageSeconds = offeredSnapshot?.freshnessSeconds ?? bestAvailable?.freshnessSeconds ?? null;
  const comparisonLine =
    currentLineValues.length > 0 ? average(currentLineValues) : null;
  const bestPriceFlag =
    Boolean(offeredSnapshot && bestAvailable && offeredSnapshot.snapshotId === bestAvailable.snapshotId);
  const offeredSequence = offeredSnapshot
    ? sequences.find((sequence) => sequence.sportsbookKey === offeredSnapshot.sportsbookKey) ?? null
    : null;
  const movement = buildLineMovementSummary({
    marketLabel: args.marketLabel,
    openPrice: offeredSequence?.open?.oddsAmerican ?? null,
    currentPrice: offeredSequence?.current?.oddsAmerican ?? null,
    openLine: offeredSequence?.open?.line ?? null,
    currentLine: offeredSequence?.current?.line ?? null
  });

  return {
    sourceCount,
    bestPriceFlag,
    bestAvailableSportsbookKey: bestAvailable?.sportsbookKey ?? null,
    bestAvailableOddsAmerican: bestAvailable?.oddsAmerican ?? null,
    consensusImpliedProbability:
      typeof consensusImpliedProbability === "number" ? round(consensusImpliedProbability, 6) : null,
    consensusLine: typeof comparisonLine === "number" ? round(comparisonLine, 2) : null,
    snapshotAgeSeconds: ageSeconds,
    staleFlag,
    staleCount,
    marketDisagreementScore,
    openToCurrentDelta: movement.lineDelta,
    lineMovement: movement,
    notes: [
      `${sourceCount} book${sourceCount === 1 ? "" : "s"} in the current comparison set.`,
      bestPriceFlag ? "Displayed number is the best current price in the comparison set." : "Displayed number is not the best current price in the comparison set.",
      staleFlag ? "Every compared price is stale." : staleCount ? `${staleCount} compared price rows are stale.` : "Compared prices are fresh enough for display."
    ]
  } satisfies MarketIntelligenceView;
}
