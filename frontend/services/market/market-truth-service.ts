import { americanToImplied, calculateEV, stripVig } from "@/lib/odds/index";
import type {
  ConfidenceBand,
  MarketTruthClassification,
  MarketTruthView
} from "@/lib/types/domain";

export type MarketPriceSample = {
  bookKey: string;
  bookName: string;
  price: number | null;
  line?: number | null;
  updatedAt?: string | null;
  history?: Array<{
    capturedAt: string;
    price: number | null;
    line?: number | null;
  }>;
};

type BuildMarketTruthArgs = {
  marketLabel: string;
  offeredOddsAmerican: number | null | undefined;
  consensusOddsAmerican?: number | null;
  sideSamples?: MarketPriceSample[];
  oppositeSamples?: MarketPriceSample[];
  sharpConsensusOddsAmerican?: number | null;
  lineMovement?: number | null;
  clvSupportPct?: number | null;
};

const SHARP_BOOK_KEYS = new Set([
  "pinnacle",
  "circa",
  "bookmaker",
  "cris",
  "lowvig",
  "betonline",
  "heritage"
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function toAmericanFromProbability(probability: number | null | undefined) {
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    return null;
  }

  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }

  return Math.round((100 * (1 - probability)) / probability);
}

function getAgeMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, (Date.now() - timestamp) / 60000);
}

function deriveFairProbability(
  sideSamples: MarketPriceSample[],
  oppositeSamples: MarketPriceSample[]
) {
  const oppositeByBook = new Map(
    oppositeSamples
      .filter((sample) => typeof sample.price === "number" && sample.price !== 0)
      .map((sample) => [sample.bookKey, sample] as const)
  );

  const noVigProbabilities = sideSamples
    .filter((sample) => typeof sample.price === "number" && sample.price !== 0)
    .map((sample) => {
      const samplePrice = sample.price;
      const opposite = oppositeByBook.get(sample.bookKey);
      if (typeof samplePrice !== "number" || !opposite || typeof opposite.price !== "number" || opposite.price === 0) {
        return null;
      }

      const stripped = stripVig(
        [americanToImplied(samplePrice), americanToImplied(opposite.price)].filter(
          (value): value is number => typeof value === "number"
        )
      );

      return stripped.length === 2 ? stripped[0] : null;
    })
    .filter((value): value is number => typeof value === "number");

  if (!noVigProbabilities.length) {
    return null;
  }

  return mean(noVigProbabilities);
}

function deriveSharpConsensusOdds(sideSamples: MarketPriceSample[]) {
  const sharpPrices = sideSamples
    .filter((sample) => SHARP_BOOK_KEYS.has(sample.bookKey))
    .map((sample) => sample.price)
    .filter((price): price is number => typeof price === "number" && price !== 0);

  const average = mean(sharpPrices);
  return typeof average === "number" ? Number(average.toFixed(0)) : null;
}

function deriveDisagreementPct(sideSamples: MarketPriceSample[]) {
  const impliedProbabilities = sideSamples
    .map((sample) => sample.price)
    .filter((price): price is number => typeof price === "number" && price !== 0)
    .map((price) => americanToImplied(price))
    .filter((value): value is number => typeof value === "number");

  if (impliedProbabilities.length < 2) {
    return null;
  }

  const minValue = Math.min(...impliedProbabilities);
  const maxValue = Math.max(...impliedProbabilities);
  return Number(((maxValue - minValue) * 100).toFixed(2));
}

function deriveBestAgeMinutes(sideSamples: MarketPriceSample[], offeredOddsAmerican: number | null | undefined) {
  const bestSample =
    sideSamples.find((sample) => sample.price === offeredOddsAmerican) ??
    sideSamples.find((sample) => typeof sample.price === "number");

  return getAgeMinutes(bestSample?.updatedAt);
}

function deriveQualityScore(args: {
  bookCount: number;
  staleAgeMinutes: number | null;
  disagreementPct: number | null;
  hasFairPrice: boolean;
  sharpConsensusOddsAmerican: number | null;
  lineMovement: number | null | undefined;
  clvSupportPct: number | null | undefined;
}) {
  if (args.bookCount <= 0) {
    return 0;
  }

  const bookScore = clamp(args.bookCount * 8, 8, 28);
  const freshnessScore =
    args.staleAgeMinutes === null ? 10 : clamp(24 - args.staleAgeMinutes * 1.1, 0, 24);
  const disagreementScore =
    args.disagreementPct === null ? 10 : clamp(18 - args.disagreementPct * 1.9, 0, 18);
  const fairPriceScore = args.hasFairPrice ? 14 : 4;
  const sharpScore = args.sharpConsensusOddsAmerican !== null ? 8 : 2;
  const movementScore =
    typeof args.lineMovement === "number" ? clamp(Math.abs(args.lineMovement) * 6, 0, 6) : 2;
  const clvScore =
    typeof args.clvSupportPct === "number" ? clamp((args.clvSupportPct + 8) * 0.6, 0, 8) : 3;

  return Math.round(
    clamp(
      bookScore +
        freshnessScore +
        disagreementScore +
        fairPriceScore +
        sharpScore +
        movementScore +
        clvScore,
      0,
      100
    )
  );
}

function deriveClassification(args: {
  bookCount: number;
  staleAgeMinutes: number | null;
  disagreementPct: number | null;
  qualityScore: number;
  sharpConsensusOddsAmerican: number | null;
  impliedEdgePct: number | null;
}) {
  if (args.bookCount <= 0) {
    return "unverified" as const;
  }

  if (args.bookCount < 2) {
    return "thin" as const;
  }

  if (typeof args.staleAgeMinutes === "number" && args.staleAgeMinutes >= 20) {
    return "stale" as const;
  }

  if (typeof args.disagreementPct === "number" && args.disagreementPct >= 7) {
    return "noisy" as const;
  }

  if (typeof args.impliedEdgePct === "number" && args.impliedEdgePct >= 2.5) {
    return "soft" as const;
  }

  if (
    args.sharpConsensusOddsAmerican !== null &&
    args.qualityScore >= 72 &&
    (args.disagreementPct ?? 0) <= 4.5
  ) {
    return "sharp" as const;
  }

  return "trustworthy" as const;
}

function formatClassificationLabel(classification: MarketTruthClassification) {
  switch (classification) {
    case "sharp":
      return "Sharp";
    case "trustworthy":
      return "Trustworthy";
    case "stale":
      return "Stale";
    case "thin":
      return "Thin";
    case "noisy":
      return "Noisy";
    case "soft":
      return "Soft";
    default:
      return "Unverified";
  }
}

function deriveMarketConfidence(args: {
  classification: MarketTruthClassification;
  qualityScore: number;
  impliedEdgePct: number | null;
}) {
  if (args.classification === "unverified") {
    return "pass" as const;
  }

  const weighted = args.qualityScore + clamp((args.impliedEdgePct ?? 0) * 6, -8, 20);
  if (args.classification === "stale" || args.classification === "noisy" || args.classification === "thin") {
    if (weighted >= 65) {
      return "low" as const;
    }

    return "pass" as const;
  }

  if (weighted >= 82) {
    return "high" as const;
  }

  if (weighted >= 62) {
    return "medium" as const;
  }

  if (weighted >= 42) {
    return "low" as const;
  }

  return "pass" as const;
}

function buildFlags(args: {
  classification: MarketTruthClassification;
  staleAgeMinutes: number | null;
  disagreementPct: number | null;
  impliedEdgePct: number | null;
  sharpGapAmerican: number | null;
}) {
  const flags: string[] = [];

  if (args.classification === "soft") {
    flags.push("Soft number");
  }

  if (typeof args.impliedEdgePct === "number" && args.impliedEdgePct > 0) {
    flags.push(`Fair edge +${args.impliedEdgePct.toFixed(1)}%`);
  }

  if (typeof args.sharpGapAmerican === "number" && Math.abs(args.sharpGapAmerican) >= 8) {
    flags.push(`Sharp gap ${args.sharpGapAmerican > 0 ? "+" : ""}${args.sharpGapAmerican}`);
  }

  if (typeof args.disagreementPct === "number" && args.disagreementPct >= 5) {
    flags.push(`Book disagreement ${args.disagreementPct.toFixed(1)} pts`);
  }

  if (typeof args.staleAgeMinutes === "number" && args.staleAgeMinutes >= 12) {
    flags.push(`Best line ${Math.round(args.staleAgeMinutes)}m old`);
  }

  return flags.slice(0, 3);
}

export function buildMarketTruth(args: BuildMarketTruthArgs): MarketTruthView {
  const sideSamples = (args.sideSamples ?? []).filter(
    (sample) => typeof sample.price === "number" && sample.price !== 0
  );
  const oppositeSamples = (args.oppositeSamples ?? []).filter(
    (sample) => typeof sample.price === "number" && sample.price !== 0
  );
  const bookCount = sideSamples.length;
  const fairProbability = deriveFairProbability(sideSamples, oppositeSamples);
  const fairOddsAmerican = toAmericanFromProbability(fairProbability);
  const consensusOddsAmerican =
    typeof args.consensusOddsAmerican === "number" && args.consensusOddsAmerican !== 0
      ? Number(args.consensusOddsAmerican.toFixed(0))
      : (() => {
          const average = mean(sideSamples.map((sample) => sample.price as number));
          return typeof average === "number" ? Number(average.toFixed(0)) : null;
        })();
  const sharpConsensusOddsAmerican =
    typeof args.sharpConsensusOddsAmerican === "number"
      ? args.sharpConsensusOddsAmerican
      : deriveSharpConsensusOdds(sideSamples);
  const disagreementPct = deriveDisagreementPct(sideSamples);
  const staleAgeMinutes = deriveBestAgeMinutes(sideSamples, args.offeredOddsAmerican);
  const fairProbabilityPct =
    typeof fairProbability === "number" ? Number((fairProbability * 100).toFixed(2)) : null;
  const impliedEdgePct =
    typeof fairProbability === "number" && typeof args.offeredOddsAmerican === "number"
      ? Number(
          (
            calculateEV({
              offeredOddsAmerican: args.offeredOddsAmerican,
              modelProbability: fairProbability
            }) ?? 0
          ).toFixed(2)
        )
      : null;
  const sharpGapAmerican =
    typeof args.offeredOddsAmerican === "number" && typeof sharpConsensusOddsAmerican === "number"
      ? Number((args.offeredOddsAmerican - sharpConsensusOddsAmerican).toFixed(0))
      : null;
  const qualityScore = deriveQualityScore({
    bookCount,
    staleAgeMinutes,
    disagreementPct,
    hasFairPrice: fairProbability !== null,
    sharpConsensusOddsAmerican,
    lineMovement: args.lineMovement,
    clvSupportPct: args.clvSupportPct
  });
  const classification = deriveClassification({
    bookCount,
    staleAgeMinutes,
    disagreementPct,
    qualityScore,
    sharpConsensusOddsAmerican,
    impliedEdgePct
  });
  const confidenceBand = deriveMarketConfidence({
    classification,
    qualityScore,
    impliedEdgePct
  });

  let note = `${args.marketLabel} is ${formatClassificationLabel(classification).toLowerCase()} with ${bookCount} book${bookCount === 1 ? "" : "s"} in the sample.`;
  if (classification === "soft" && typeof impliedEdgePct === "number") {
    note = `${args.marketLabel} is posting above no-vig fair by ${impliedEdgePct.toFixed(1)}%, so the number still looks soft.`;
  } else if (classification === "stale" && typeof staleAgeMinutes === "number") {
    note = `${args.marketLabel} is aging out. The best visible number is roughly ${Math.round(staleAgeMinutes)} minutes old.`;
  } else if (classification === "noisy" && typeof disagreementPct === "number") {
    note = `${args.marketLabel} is noisy right now. Books are spread by ${disagreementPct.toFixed(1)} probability points.`;
  } else if (classification === "thin") {
    note = `${args.marketLabel} is thin. There is not enough two-way pricing to trust the number as a strong lead.`;
  }

  return {
    classification,
    classificationLabel: formatClassificationLabel(classification),
    qualityScore,
    confidenceBand,
    bookCount,
    stale: classification === "stale",
    staleAgeMinutes: staleAgeMinutes === null ? null : Number(staleAgeMinutes.toFixed(1)),
    disagreementPct,
    movementStrength:
      typeof args.lineMovement === "number" ? Number(Math.abs(args.lineMovement).toFixed(2)) : null,
    clvSupportPct:
      typeof args.clvSupportPct === "number" ? Number(args.clvSupportPct.toFixed(2)) : null,
    fairOddsAmerican,
    fairProbabilityPct,
    consensusOddsAmerican,
    sharpConsensusOddsAmerican,
    sharpGapAmerican,
    impliedEdgePct,
    note,
    flags: buildFlags({
      classification,
      staleAgeMinutes,
      disagreementPct,
      impliedEdgePct,
      sharpGapAmerican
    })
  } satisfies MarketTruthView;
}

export function getConfidenceBandLabel(band: ConfidenceBand) {
  if (band === "high") {
    return "High";
  }

  if (band === "medium") {
    return "Medium";
  }

  if (band === "low") {
    return "Low";
  }

  return "Pass";
}
