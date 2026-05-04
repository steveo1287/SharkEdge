import { sportSpecificConditions, sportSpecificFamilySummary } from "./sport-specific-trend-families";
import type {
  TrendCandidateSystem,
  TrendFactoryDepth,
  TrendFactoryGate,
  TrendFactoryLeague,
  TrendFactoryMarket,
  TrendFactoryOptions,
  TrendFactoryPreview,
  TrendFactorySide,
  TrendFilterCondition
} from "./trend-candidate-types";

const LEAGUES: TrendFactoryLeague[] = ["MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"];
const MARKETS_BY_LEAGUE: Record<TrendFactoryLeague, TrendFactoryMarket[]> = {
  MLB: ["moneyline", "spread", "total"],
  NBA: ["moneyline", "spread", "total", "player_prop"],
  NFL: ["moneyline", "spread", "total", "player_prop"],
  NHL: ["moneyline", "spread", "total"],
  NCAAF: ["moneyline", "spread", "total"],
  UFC: ["fight_winner"],
  BOXING: ["fight_winner"]
};

const SIDE_BY_MARKET: Record<TrendFactoryMarket, TrendFactorySide[]> = {
  moneyline: ["home", "away", "favorite", "underdog"],
  spread: ["home", "away", "favorite", "underdog"],
  total: ["over", "under"],
  player_prop: ["player_over", "player_under"],
  fight_winner: ["fighter", "favorite", "underdog"]
};

const PRICE_RANGES = [
  { value: "dog_100_180", label: "Underdog +100 to +180", sides: ["underdog", "away", "home", "fighter"] },
  { value: "fav_100_150", label: "Favorite -100 to -150", sides: ["favorite", "home", "away", "fighter"] },
  { value: "fav_150_220", label: "Favorite -150 to -220", sides: ["favorite", "home", "away", "fighter"] },
  { value: "any_plus_money", label: "Plus-money only", sides: ["underdog", "away", "home", "fighter"] }
];

const VENUE = [
  { value: "home", label: "Home team", sports: ["MLB", "NBA", "NFL", "NHL", "NCAAF"] },
  { value: "road", label: "Road team", sports: ["MLB", "NBA", "NFL", "NHL", "NCAAF"] },
  { value: "neutral", label: "Neutral site", sports: ["NFL", "NCAAF", "UFC", "BOXING"] }
];

const REST = [
  { value: "rest_0", label: "Zero days rest", sports: ["MLB", "NBA", "NHL"] },
  { value: "rest_1", label: "One day rest", sports: ["MLB", "NBA", "NHL", "NFL", "NCAAF"] },
  { value: "rest_2_plus", label: "Two or more days rest", sports: ["MLB", "NBA", "NHL", "NFL", "NCAAF"] },
  { value: "b2b", label: "Back-to-back spot", sports: ["NBA", "NHL"] }
];

const FORM = [
  { value: "after_win", label: "After a win" },
  { value: "after_loss", label: "After a loss" },
  { value: "won_2_plus", label: "Won two or more" },
  { value: "lost_2_plus", label: "Lost two or more" }
];

const MARKET_CONTEXT = [
  { value: "model_agrees", label: "Model agrees" },
  { value: "line_moved_for", label: "Line moved for side" },
  { value: "line_moved_against", label: "Line moved against side" },
  { value: "positive_clv", label: "Positive CLV history" }
];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function condition(family: string, key: string, label: string, value: string, operator: TrendFilterCondition["operator"] = "equals"): TrendFilterCondition {
  return { family, key, label, value, operator };
}

function appliesToLeague(item: { sports?: string[] }, league: TrendFactoryLeague) {
  return !item.sports || item.sports.includes(league);
}

function appliesToSide(item: { sides?: string[] }, side: TrendFactorySide) {
  return !item.sides || item.sides.includes(side);
}

function marketLabel(market: TrendFactoryMarket) {
  return market.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sideLabel(side: TrendFactorySide) {
  return side.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function depthLimit(depth: TrendFactoryDepth) {
  if (depth === "debug") return 2500;
  if (depth === "expanded") return 1000;
  return 400;
}

function maxConditionCount(depth: TrendFactoryDepth) {
  if (depth === "debug") return 5;
  if (depth === "expanded") return 4;
  return 3;
}

function chooseGate(candidate: Omit<TrendCandidateSystem, "qualityGate" | "gateReasons" | "blockers" | "previewTags">): Pick<TrendCandidateSystem, "qualityGate" | "gateReasons" | "blockers" | "previewTags"> {
  const keys = candidate.conditions.map((item) => item.key);
  const families = candidate.conditions.map((item) => item.family);
  const gateReasons: string[] = [];
  const blockers: string[] = [];
  const previewTags: string[] = [];

  if (keys.includes("model_agrees")) {
    gateReasons.push("Model agreement condition included.");
    previewTags.push("model");
  }
  if (keys.includes("positive_clv")) {
    gateReasons.push("CLV support condition included.");
    previewTags.push("clv");
  }
  if (keys.includes("line_moved_for")) {
    gateReasons.push("Market movement support condition included.");
    previewTags.push("movement");
  }
  if (families.includes("sport_specific")) {
    gateReasons.push("Sport-specific context condition included.");
    previewTags.push("sport-specific");
  }
  if (keys.includes("line_moved_against")) {
    blockers.push("Line movement is against the candidate side.");
    previewTags.push("hostile-move");
  }
  if (keys.includes("rest_0") || keys.includes("b2b")) {
    blockers.push("Fatigue/rest risk condition needs sport-specific validation.");
    previewTags.push("rest-risk");
  }
  if (families.includes("sport_specific") && !keys.includes("model_agrees") && !keys.includes("positive_clv") && !keys.includes("line_moved_for")) {
    blockers.push("Sport-specific condition requires source validation before promotion.");
  }
  if (candidate.conditions.length >= 5) {
    blockers.push("High condition count can overfit without backtest validation.");
    previewTags.push("overfit-risk");
  }
  if (candidate.side === "underdog" || candidate.side === "player_under" || candidate.side === "under") {
    previewTags.push("contrarian");
  }

  if (blockers.length) {
    return { qualityGate: "research_candidate", gateReasons: gateReasons.length ? gateReasons : ["Candidate needs backtest validation before promotion."], blockers, previewTags };
  }
  if (gateReasons.length >= 2) {
    return { qualityGate: "promote_candidate", gateReasons, blockers, previewTags };
  }
  if (gateReasons.length === 1 || candidate.conditions.length >= 3) {
    return { qualityGate: "watch_candidate", gateReasons: gateReasons.length ? gateReasons : ["Candidate has enough structure for preview."], blockers, previewTags };
  }
  return { qualityGate: "research_candidate", gateReasons: ["Candidate is broad and needs proof before display."], blockers, previewTags };
}

function createCandidate(league: TrendFactoryLeague, market: TrendFactoryMarket, side: TrendFactorySide, conditions: TrendFilterCondition[]): TrendCandidateSystem {
  const filters = Object.fromEntries(conditions.map((item) => [item.key, item.value]));
  const conditionNames = conditions.map((item) => item.label);
  const base = `${league} ${marketLabel(market)} ${sideLabel(side)}`;
  const name = conditionNames.length ? `${base} · ${conditionNames.join(" · ")}` : base;
  const conditionKey = conditions.map((item) => `${item.key}:${item.value}`).sort().join("|") || "base";
  const dedupeKey = `${league}:${market}:${side}:${conditionKey}`;
  const relatedKey = `${league}:${market}:${side}:${conditions.map((item) => item.family).sort().join("+") || "base"}`;
  const partial = {
    id: `factory_${slug(dedupeKey)}`,
    name,
    league,
    market,
    side,
    filters,
    conditions,
    dedupeKey,
    relatedKey,
    description: `Generated ${league} ${marketLabel(market)} candidate for ${sideLabel(side)} with ${conditionNames.length ? conditionNames.join(", ") : "base filters"}.`,
    generatedBy: "trend_factory_v1" as const
  };
  return { ...partial, ...chooseGate(partial) };
}

function conditionSets(league: TrendFactoryLeague, market: TrendFactoryMarket, side: TrendFactorySide, depth: TrendFactoryDepth) {
  const sportSpecific = sportSpecificConditions(league, market, side);
  const baseFamilies = [
    ...VENUE.filter((item) => appliesToLeague(item, league)).map((item) => condition("venue", item.value, item.label, item.value)),
    ...PRICE_RANGES.filter((item) => appliesToSide(item, side)).map((item) => condition("price", item.value, item.label, item.value, "range")),
    ...FORM.map((item) => condition("form", item.value, item.label, item.value)),
    ...REST.filter((item) => appliesToLeague(item, league)).map((item) => condition("rest", item.value, item.label, item.value)),
    ...MARKET_CONTEXT.map((item) => condition("market_context", item.value, item.label, item.value, "derived")),
    ...sportSpecific
  ];

  const sets: TrendFilterCondition[][] = [[]];
  const maxCount = maxConditionCount(depth);

  for (const primary of baseFamilies) {
    sets.push([primary]);
  }

  for (const first of baseFamilies) {
    for (const second of baseFamilies) {
      if (first.key === second.key || first.family === second.family) continue;
      sets.push([first, second]);
    }
  }

  if (maxCount >= 3) {
    const venues = baseFamilies.filter((item) => item.family === "venue");
    const forms = baseFamilies.filter((item) => item.family === "form");
    const marketContext = baseFamilies.filter((item) => item.family === "market_context");
    const prices = baseFamilies.filter((item) => item.family === "price");
    const rests = baseFamilies.filter((item) => item.family === "rest");
    const sport = baseFamilies.filter((item) => item.family === "sport_specific");

    for (const venue of venues) {
      for (const form of forms) {
        for (const context of marketContext) {
          sets.push([venue, form, context]);
        }
      }
    }
    for (const price of prices) {
      for (const form of forms) {
        for (const context of marketContext) {
          sets.push([price, form, context]);
        }
      }
    }
    for (const rest of rests) {
      for (const form of forms) {
        for (const context of marketContext) {
          sets.push([rest, form, context]);
        }
      }
    }
    for (const sportCondition of sport) {
      for (const context of marketContext) {
        sets.push([sportCondition, context]);
      }
      for (const price of prices.slice(0, 2)) {
        sets.push([sportCondition, price]);
      }
    }
  }

  if (maxCount >= 4) {
    const prices = baseFamilies.filter((item) => item.family === "price").slice(0, 3);
    const venues = baseFamilies.filter((item) => item.family === "venue").slice(0, 3);
    const forms = baseFamilies.filter((item) => item.family === "form");
    const marketContext = baseFamilies.filter((item) => item.family === "market_context");
    const sport = baseFamilies.filter((item) => item.family === "sport_specific").slice(0, 6);
    for (const price of prices) {
      for (const venue of venues) {
        for (const form of forms) {
          for (const context of marketContext) {
            sets.push([price, venue, form, context]);
          }
        }
      }
    }
    for (const sportCondition of sport) {
      for (const price of prices) {
        for (const context of marketContext) {
          sets.push([sportCondition, price, context]);
        }
      }
    }
  }

  return sets.filter((set) => set.length <= maxCount);
}

function dedupe(candidates: TrendCandidateSystem[]) {
  const bestByKey = new Map<string, TrendCandidateSystem>();
  for (const candidate of candidates) {
    const existing = bestByKey.get(candidate.dedupeKey);
    if (!existing || gateRank(candidate.qualityGate) > gateRank(existing.qualityGate) || candidate.blockers.length < existing.blockers.length) {
      bestByKey.set(candidate.dedupeKey, candidate);
    }
  }
  return Array.from(bestByKey.values());
}

function gateRank(gate: TrendFactoryGate) {
  if (gate === "promote_candidate") return 4;
  if (gate === "watch_candidate") return 3;
  if (gate === "research_candidate") return 2;
  return 1;
}

function gateCounts(candidates: TrendCandidateSystem[]): Record<TrendFactoryGate, number> {
  return candidates.reduce<Record<TrendFactoryGate, number>>((acc, candidate) => {
    acc[candidate.qualityGate] += 1;
    return acc;
  }, { promote_candidate: 0, watch_candidate: 0, research_candidate: 0, blocked_candidate: 0 });
}

function relatedGroups(candidates: TrendCandidateSystem[]) {
  const groups = new Map<string, TrendCandidateSystem[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.relatedKey) ?? [];
    group.push(candidate);
    groups.set(candidate.relatedKey, group);
  }
  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .sort(([, left], [, right]) => right.length - left.length)
    .slice(0, 20)
    .map(([key, group]) => ({ key, count: group.length, sampleIds: group.slice(0, 5).map((candidate) => candidate.id) }));
}

export function buildTrendFactoryPreview(options: TrendFactoryOptions = {}): TrendFactoryPreview {
  const depth = options.depth ?? "core";
  const selectedLeagues = options.league && options.league !== "ALL" ? [options.league] : LEAGUES;
  const selectedMarkets = options.market && options.market !== "ALL" ? [options.market] : null;
  const hardLimit = Math.min(options.limit ?? depthLimit(depth), depthLimit(depth));
  const raw: TrendCandidateSystem[] = [];

  for (const league of selectedLeagues) {
    const markets = (selectedMarkets ?? MARKETS_BY_LEAGUE[league]).filter((market) => MARKETS_BY_LEAGUE[league].includes(market));
    for (const market of markets) {
      for (const side of SIDE_BY_MARKET[market]) {
        for (const set of conditionSets(league, market, side, depth)) {
          raw.push(createCandidate(league, market, side, set));
          if (raw.length >= hardLimit * 3) break;
        }
        if (raw.length >= hardLimit * 3) break;
      }
      if (raw.length >= hardLimit * 3) break;
    }
    if (raw.length >= hardLimit * 3) break;
  }

  const candidates = dedupe(raw)
    .sort((left, right) => gateRank(right.qualityGate) - gateRank(left.qualityGate) || left.blockers.length - right.blockers.length || left.conditions.length - right.conditions.length)
    .slice(0, hardLimit);

  return {
    generatedAt: new Date().toISOString(),
    depth,
    totalCandidates: raw.length,
    returnedCandidates: candidates.length,
    leagues: selectedLeagues,
    markets: selectedMarkets ?? Array.from(new Set(selectedLeagues.flatMap((league) => MARKETS_BY_LEAGUE[league]))),
    candidates,
    gateCounts: gateCounts(candidates),
    dedupeGroups: relatedGroups(candidates),
    notes: [
      "Trend Factory v1 generates candidate systems only; it does not backtest, persist, or promote them to the main board yet.",
      "Sport-specific families are included for MLB, NBA, NFL, NHL, NCAAF, UFC, and Boxing, but source-dependent conditions still require historical/source validation.",
      `Sport-specific family coverage: ${sportSpecificFamilySummary().map((item) => `${item.league} ${item.conditions}`).join(", ")}.`,
      "Backtesting should validate sample size, ROI, win rate, units, CLV, recent form, and per-game history before any candidate becomes a verified system.",
      "Candidates include dedupeKey and relatedKey so future PRs can collapse near-duplicate systems instead of flooding the UI."
    ]
  };
}
