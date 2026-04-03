import type { MarketType, SportCode, LeagueKey } from "@/lib/types/domain";
import type { CanonicalMarketInput, CanonicalMarketScope, CanonicalOutcomeType, CanonicalMarketPeriod } from "@/lib/market/canonical";
import { buildNormalizedOddsSnapshot, type NormalizedOddsSnapshot } from "@/lib/market/odds-snapshot";
import { normalizeCanonicalSide } from "@/lib/market/canonical";

export type OddsPriceSample = {
  bookKey: string;
  bookName: string;
  price: number | null;
  line?: number | null;
  updatedAt?: string | null;
};

export type SnapshotNormalizationInput = {
  sport: SportCode;
  league: LeagueKey;
  eventId: string;
  providerEventId?: string | null;
  marketType: MarketType;
  marketScope: CanonicalMarketScope;
  period?: CanonicalMarketPeriod | null;
  side: string;
  line?: number | null;
  outcomeType?: CanonicalOutcomeType | null;
  participantTeamId?: string | null;
  participantPlayerId?: string | null;
  isLive: boolean;
  source: string;
  status?: CanonicalMarketInput["status"];
  sourceName: string;
  sourceType: "api" | "scraper" | "manual" | "worker" | "derived" | "mock" | string;
  staleAfterSeconds?: number;
};

function deriveFreshnessSeconds(updatedAt: string | null | undefined) {
  if (!updatedAt) {
    return null;
  }

  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

export function buildNormalizedSnapshotsFromPriceSamples(
  input: SnapshotNormalizationInput,
  samples: OddsPriceSample[]
) {
  return samples
    .map((sample) => {
      if (typeof sample.price !== "number" || !Number.isFinite(sample.price) || sample.price === 0) {
        return null;
      }

      const freshnessSeconds = deriveFreshnessSeconds(sample.updatedAt);
      const capturedAt = sample.updatedAt ?? new Date().toISOString();
      const market = {
        sport: input.sport,
        league: input.league,
        eventId: input.eventId,
        providerEventId: input.providerEventId ?? null,
        sportsbookKey: normalizeCanonicalSide(sample.bookKey),
        marketType: input.marketType,
        marketScope: input.marketScope,
        period: input.period ?? "full_game",
        side: input.side,
        line: typeof sample.line === "number" ? sample.line : null,
        outcomeType: input.outcomeType ?? "other",
        participantTeamId: input.participantTeamId ?? null,
        participantPlayerId: input.participantPlayerId ?? null,
        capturedAt,
        isLive: input.isLive,
        source: input.source,
        status: input.status ?? "active",
        freshnessSeconds,
        isStale:
          typeof freshnessSeconds === "number"
            ? freshnessSeconds > (input.staleAfterSeconds ?? (input.isLive ? 120 : 900))
            : false
      } satisfies CanonicalMarketInput;

      return buildNormalizedOddsSnapshot({
        market,
        oddsAmerican: sample.price,
        sourceName: input.sourceName,
        sourceType: input.sourceType
      });
    })
    .filter((snapshot): snapshot is NormalizedOddsSnapshot => Boolean(snapshot));
}

export function matchSnapshotsBySportsbook(
  sideSnapshots: NormalizedOddsSnapshot[],
  oppositeSnapshots: NormalizedOddsSnapshot[]
) {
  const oppositeByBook = new Map(
    oppositeSnapshots.map((snapshot) => [snapshot.sportsbookKey, snapshot] as const)
  );

  return sideSnapshots
    .map((snapshot) => {
      const opposite = oppositeByBook.get(snapshot.sportsbookKey);
      if (!opposite) {
        return null;
      }

      return {
        side: snapshot,
        opposite
      };
    })
    .filter(
      (pair): pair is { side: NormalizedOddsSnapshot; opposite: NormalizedOddsSnapshot } =>
        Boolean(pair)
    );
}
