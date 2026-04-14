import { americanToDecimalOdds, americanToImpliedProbability } from "@/lib/math";
import {
  buildCanonicalMarketFamilyKey,
  createCanonicalMarket,
  type CanonicalMarket,
  type CanonicalMarketInput
} from "@/lib/market/canonical";

export type OddsSnapshotSourceType = "api" | "scraper" | "manual" | "worker" | "derived" | "mock" | string;

export type NormalizedOddsSnapshot = CanonicalMarket & {
  snapshotId: string;
  canonicalMarketKey: string;
  canonicalFamilyKey: string;
  eventId: string;
  oddsAmerican: number;
  oddsDecimal: number;
  impliedProbRaw: number;
  sourceName: string;
  sourceType: OddsSnapshotSourceType;
};

export type NormalizedSnapshotSequence = {
  canonicalFamilyKey: string;
  sportsbookKey: string;
  open: NormalizedOddsSnapshot | null;
  current: NormalizedOddsSnapshot | null;
  close: NormalizedOddsSnapshot | null;
};

function buildSnapshotId(input: CanonicalMarketInput, oddsAmerican: number) {
  return [
    buildCanonicalMarketFamilyKey(input),
    input.sportsbookKey,
    input.capturedAt,
    oddsAmerican
  ]
    .join(":")
    .replace(/[^a-zA-Z0-9:._-]+/g, "-");
}

export function buildNormalizedOddsSnapshot(args: {
  market: CanonicalMarketInput;
  oddsAmerican: number;
  sourceName: string;
  sourceType: OddsSnapshotSourceType;
}) {
  const oddsDecimal = americanToDecimalOdds(args.oddsAmerican);
  const impliedProbRaw = americanToImpliedProbability(args.oddsAmerican);
  if (typeof oddsDecimal !== "number" || typeof impliedProbRaw !== "number") {
    return null;
  }

  const canonicalMarket = createCanonicalMarket(args.market);

  return {
    ...canonicalMarket,
    snapshotId: buildSnapshotId(args.market, args.oddsAmerican),
    canonicalMarketKey: canonicalMarket.canonicalMarketKey,
    canonicalFamilyKey: canonicalMarket.canonicalFamilyKey,
    eventId: canonicalMarket.eventId,
    oddsAmerican: args.oddsAmerican,
    oddsDecimal,
    impliedProbRaw,
    sourceName: args.sourceName,
    sourceType: args.sourceType
  } satisfies NormalizedOddsSnapshot;
}

export function groupSnapshotsBySportsbook(snapshots: NormalizedOddsSnapshot[]) {
  return snapshots.reduce<Map<string, NormalizedOddsSnapshot[]>>((map, snapshot) => {
    map.set(snapshot.sportsbookKey, [...(map.get(snapshot.sportsbookKey) ?? []), snapshot]);
    return map;
  }, new Map());
}

export function buildSnapshotSequences(snapshots: NormalizedOddsSnapshot[]) {
  const groups = groupSnapshotsBySportsbook(snapshots);

  return Array.from(groups.entries()).map(([sportsbookKey, groupedSnapshots]) => {
    const ordered = [...groupedSnapshots].sort((left, right) =>
      left.capturedAt.localeCompare(right.capturedAt)
    );

    return {
      canonicalFamilyKey: ordered[0]?.canonicalFamilyKey ?? "",
      sportsbookKey,
      open: ordered[0] ?? null,
      current: ordered[ordered.length - 1] ?? null,
      close: ordered[ordered.length - 1] ?? null
    } satisfies NormalizedSnapshotSequence;
  });
}

export function getLatestSnapshotsBySportsbook(snapshots: NormalizedOddsSnapshot[]) {
  return buildSnapshotSequences(snapshots)
    .map((sequence) => sequence.current)
    .filter((snapshot): snapshot is NormalizedOddsSnapshot => Boolean(snapshot));
}
