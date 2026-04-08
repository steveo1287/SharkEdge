import type { LeagueKey } from "@/lib/types/domain";
import type {
  BookInfluenceTier,
  MarketEfficiencyClass,
  OpportunitySourceQuality
} from "@/lib/types/opportunity";

type MarketFamily = "spread" | "moneyline" | "total" | "prop" | "specialty";

type TierWeights = Record<BookInfluenceTier, number>;

type MarketModelConfig = {
  defaultWeights: Record<MarketFamily, TierWeights>;
  leagueOverrides?: Partial<Record<LeagueKey, Partial<Record<MarketFamily, TierWeights>>>>;
};

const MARKET_MAKER_BOOKS = [
  "pinnacle",
  "pinny",
  "circa",
  "bookmaker",
  "betcris",
  "cris",
  "lowvig",
  "heritage",
  "betonline"
];

const MAJOR_RETAIL_BOOKS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "bet365",
  "espn bet",
  "espnbet",
  "fanatics",
  "pointsbet",
  "betrivers"
];

const LOW_SIGNAL_BOOKS = [
  "bovada",
  "mybookie",
  "fliff",
  "prizepicks",
  "underdog",
  "parlayplay",
  "chalkboard"
];

const MARKET_MODEL_CONFIG: MarketModelConfig = {
  defaultWeights: {
    spread: {
      MARKET_MAKER: 1,
      MAJOR_RETAIL: 0.62,
      LOW_SIGNAL: 0.24,
      UNKNOWN: 0.42
    },
    moneyline: {
      MARKET_MAKER: 0.94,
      MAJOR_RETAIL: 0.64,
      LOW_SIGNAL: 0.26,
      UNKNOWN: 0.42
    },
    total: {
      MARKET_MAKER: 0.95,
      MAJOR_RETAIL: 0.6,
      LOW_SIGNAL: 0.24,
      UNKNOWN: 0.4
    },
    prop: {
      MARKET_MAKER: 0.48,
      MAJOR_RETAIL: 0.72,
      LOW_SIGNAL: 0.22,
      UNKNOWN: 0.36
    },
    specialty: {
      MARKET_MAKER: 0.36,
      MAJOR_RETAIL: 0.46,
      LOW_SIGNAL: 0.2,
      UNKNOWN: 0.32
    }
  },
  leagueOverrides: {
    UFC: {
      moneyline: {
        MARKET_MAKER: 0.86,
        MAJOR_RETAIL: 0.58,
        LOW_SIGNAL: 0.22,
        UNKNOWN: 0.34
      },
      specialty: {
        MARKET_MAKER: 0.34,
        MAJOR_RETAIL: 0.44,
        LOW_SIGNAL: 0.18,
        UNKNOWN: 0.28
      }
    },
    BOXING: {
      moneyline: {
        MARKET_MAKER: 0.82,
        MAJOR_RETAIL: 0.54,
        LOW_SIGNAL: 0.2,
        UNKNOWN: 0.32
      },
      specialty: {
        MARKET_MAKER: 0.32,
        MAJOR_RETAIL: 0.42,
        LOW_SIGNAL: 0.18,
        UNKNOWN: 0.26
      }
    }
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSportsbookIdentity(
  sportsbookKey: string | null | undefined,
  sportsbookName: string | null | undefined
) {
  return `${sportsbookKey ?? ""} ${sportsbookName ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getMarketFamily(marketType: string): MarketFamily {
  const normalized = marketType.toLowerCase();

  if (normalized === "spread") {
    return "spread";
  }

  if (normalized === "moneyline") {
    return "moneyline";
  }

  if (normalized === "total") {
    return "total";
  }

  if (
    normalized.startsWith("player_") ||
    normalized.includes("prop") ||
    normalized === "team_total"
  ) {
    return "prop";
  }

  return "specialty";
}

export function getBookInfluenceTier(
  sportsbookKey: string | null | undefined,
  sportsbookName: string | null | undefined
): BookInfluenceTier {
  const identity = normalizeSportsbookIdentity(sportsbookKey, sportsbookName);

  if (!identity) {
    return "UNKNOWN";
  }

  if (MARKET_MAKER_BOOKS.some((book) => identity.includes(book))) {
    return "MARKET_MAKER";
  }

  if (MAJOR_RETAIL_BOOKS.some((book) => identity.includes(book))) {
    return "MAJOR_RETAIL";
  }

  if (LOW_SIGNAL_BOOKS.some((book) => identity.includes(book))) {
    return "LOW_SIGNAL";
  }

  return "UNKNOWN";
}

export function getSportsbookInfluenceWeight(args: {
  league: LeagueKey;
  marketType: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
}) {
  const family = getMarketFamily(args.marketType);
  const tier = getBookInfluenceTier(args.sportsbookKey, args.sportsbookName);
  const leagueWeights = MARKET_MODEL_CONFIG.leagueOverrides?.[args.league]?.[family];
  const weights = leagueWeights ?? MARKET_MODEL_CONFIG.defaultWeights[family];

  return {
    tier,
    family,
    weight: weights[tier]
  };
}

export function classifyMarketEfficiency(args: {
  league: LeagueKey;
  marketType: string;
  bookCount: number;
  disagreementScore: number | null;
  lineMovement: number | null;
  sportsbookKey: string | null;
  sportsbookName: string | null;
}): MarketEfficiencyClass {
  const family = getMarketFamily(args.marketType);
  const disagreement = args.disagreementScore ?? 0;
  const movement = Math.abs(args.lineMovement ?? 0);
  const influence = getSportsbookInfluenceWeight(args);

  if (family === "prop" && args.bookCount < 4) {
    return "FRAGMENTED_PROP";
  }

  if (family === "specialty" || args.bookCount <= 1) {
    return "THIN_SPECIALTY";
  }

  if (
    influence.tier === "MARKET_MAKER" &&
    args.bookCount >= 5 &&
    disagreement <= 0.06 &&
    movement <= 10
  ) {
    return "HIGH_EFFICIENCY";
  }

  if (args.bookCount >= 5 && disagreement <= 0.08) {
    return "HIGH_EFFICIENCY";
  }

  if (args.bookCount >= 3 && disagreement <= 0.14) {
    return "MID_EFFICIENCY";
  }

  return "LOW_EFFICIENCY";
}

export function getMarketEfficiencyScore(classification: MarketEfficiencyClass) {
  switch (classification) {
    case "HIGH_EFFICIENCY":
      return 6;
    case "MID_EFFICIENCY":
      return 4;
    case "LOW_EFFICIENCY":
      return 0;
    case "FRAGMENTED_PROP":
      return -2;
    case "THIN_SPECIALTY":
      return -4;
  }
}

function formatInfluenceLabel(tier: BookInfluenceTier) {
  switch (tier) {
    case "MARKET_MAKER":
      return "Market-maker book";
    case "MAJOR_RETAIL":
      return "Major retail book";
    case "LOW_SIGNAL":
      return "Low-signal book";
    case "UNKNOWN":
      return "Unclassified book";
  }
}

export function evaluateMarketSourceQuality(args: {
  league: LeagueKey;
  marketType: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  bookCount: number;
  disagreementScore: number | null;
  bestPriceFlag: boolean;
  freshnessMinutes: number | null;
}) {
  const influence = getSportsbookInfluenceWeight(args);
  const disagreement = args.disagreementScore ?? 0;
  const freshness =
    args.freshnessMinutes === null
      ? 8
      : clamp(20 - args.freshnessMinutes * 0.8, 0, 20);
  const bookDepth = clamp(args.bookCount * 5, 0, 24);
  const influenceScore = influence.weight * 30;
  const agreementScore = clamp(20 - disagreement * 80, 0, 20);
  const bestPriceScore = args.bestPriceFlag ? 8 : 0;
  const score = Math.round(
    clamp(freshness + bookDepth + influenceScore + agreementScore + bestPriceScore, 0, 100)
  );

  const notes = [
    `${formatInfluenceLabel(influence.tier)} at ${Number(influence.weight.toFixed(2))}x market influence.`,
    `${args.bookCount} book${args.bookCount === 1 ? "" : "s"} in the comparison set.`,
    args.bestPriceFlag
      ? "Displayed number is still the best available price."
      : "Displayed number is not confirmed as the best available price."
  ];

  return {
    score,
    label:
      score >= 75
        ? "High source quality"
        : score >= 55
          ? "Usable source quality"
          : score >= 35
            ? "Thin source quality"
            : "Weak source quality",
    influenceTier: influence.tier,
    influenceWeight: Number(influence.weight.toFixed(2)),
    sharpBookPresent: influence.tier === "MARKET_MAKER",
    notes
  } satisfies OpportunitySourceQuality;
}
