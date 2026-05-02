import type { LeagueKey, SportCode, TrendFilters } from "@/lib/types/domain";
import { listSimTwins } from "@/services/sim/sim-twin";
import { buildUfcFightIqFromSimTwin, type UfcFightIqPrediction } from "@/services/ufc/fight-iq";
import type {
  TrendSystemActionability,
  TrendSystemDefinition,
  TrendSystemMatch
} from "@/services/trends/trend-system-engine";

function baseFilters(overrides: Partial<TrendFilters>): TrendFilters {
  return {
    sport: "ALL",
    league: "ALL",
    market: "ALL",
    sportsbook: "all",
    side: "ALL",
    subject: "",
    team: "",
    player: "",
    fighter: "",
    opponent: "",
    window: "90d",
    sample: 10,
    ...overrides
  } as TrendFilters;
}

export const UFC_TREND_SYSTEMS: TrendSystemDefinition[] = [
  {
    id: "ufc-fight-iq-winner-edge",
    name: "UFC Fight IQ Winner Edge",
    description: "Fight qualifies when UFC Fight IQ shows a meaningful calibrated winner gap from rating, opponent-adjusted features, cold-start logic, and Markov simulation.",
    category: "Model Edge",
    sport: "MMA" as SportCode,
    league: "UFC" as LeagueKey,
    market: "fight_winner",
    side: "FAVORITE",
    filters: baseFilters({ sport: "MMA", league: "UFC" as LeagueKey, market: "fight_winner", side: "FAVORITE", window: "365d", sample: 75 }),
    rules: [
      { key: "winnerProbabilityGap", label: "Fight IQ winner probability gap", operator: ">=", value: 0.06 },
      { key: "markovSimulation", label: "Round-by-round Markov simulation", operator: "exists", value: true },
      { key: "coldStartGuard", label: "Low-sample confidence cap", operator: "exists", value: true }
    ],
    metrics: { wins: 0, losses: 0, pushes: 0, profitUnits: 0, roiPct: 0, winRatePct: 0, sampleSize: 0, currentStreak: "NEW", last30WinRatePct: 0, clvPct: null, seasons: 0 },
    risk: "high",
    verified: false,
    source: "sim-derived-system"
  },
  {
    id: "ufc-prospect-watch-cold-start",
    name: "UFC Prospect Watch Cold-Start",
    description: "Fight qualifies when a side has limited UFC/pro sample and Fight IQ applies prospect/amateur/opponent-strength logic with confidence caps.",
    category: "Situational",
    sport: "MMA" as SportCode,
    league: "UFC" as LeagueKey,
    market: "fight_winner",
    side: "FAVORITE",
    filters: baseFilters({ sport: "MMA", league: "UFC" as LeagueKey, market: "fight_winner", side: "FAVORITE", window: "365d", sample: 50 }),
    rules: [
      { key: "coldStartActive", label: "Cold-start module active", operator: "exists", value: true },
      { key: "prospectData", label: "Prospect/amateur data required", operator: "exists", value: true }
    ],
    metrics: { wins: 0, losses: 0, pushes: 0, profitUnits: 0, roiPct: 0, winRatePct: 0, sampleSize: 0, currentStreak: "NEW", last30WinRatePct: 0, clvPct: null, seasons: 0 },
    risk: "high",
    verified: false,
    source: "sim-derived-system"
  },
  {
    id: "ufc-scenario-swing-watch",
    name: "UFC Scenario Swing Watch",
    description: "Fight qualifies when reach, grappling, cardio, five-round, or scenario context materially swings the Fight IQ output.",
    category: "Situational",
    sport: "MMA" as SportCode,
    league: "UFC" as LeagueKey,
    market: "fight_winner",
    side: "FAVORITE",
    filters: baseFilters({ sport: "MMA", league: "UFC" as LeagueKey, market: "fight_winner", side: "FAVORITE", window: "365d", sample: 50 }),
    rules: [
      { key: "scenarioSwingPct", label: "Scenario probability swing", operator: ">=", value: 4 },
      { key: "combatScenario", label: "Combat scenario", operator: "exists", value: true }
    ],
    metrics: { wins: 0, losses: 0, pushes: 0, profitUnits: 0, roiPct: 0, winRatePct: 0, sampleSize: 0, currentStreak: "NEW", last30WinRatePct: 0, clvPct: null, seasons: 0 },
    risk: "high",
    verified: false,
    source: "sim-derived-system"
  }
];

function maxScenarioSwingPct(twin: any) {
  const values = (twin.scenarios ?? []).map((scenario: any) => Math.abs(Number(scenario.deltaHomePct ?? 0) * 100));
  return values.length ? Math.max(...values) : 0;
}

function pickSide(prediction: UfcFightIqPrediction) {
  return prediction.pick.fighterId.endsWith(":A") ? "COMPETITOR_A" : "COMPETITOR_B";
}

function moneylineLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "odds needed";
  return value > 0 ? `+${value}` : String(value);
}

function pctLabel(value: number) {
  return `${Number((value * 100).toFixed(1))}%`;
}

function methodLeader(prediction: UfcFightIqPrediction) {
  return Object.entries(prediction.methodProbabilities)
    .sort((left, right) => right[1] - left[1])[0];
}

function hasColdStart(prediction: UfcFightIqPrediction) {
  return prediction.fighters.fighterA.coldStart.active || prediction.fighters.fighterB.coldStart.active;
}

function actionability(args: { verified: boolean; edgePct: number | null; price: number | null; prediction: UfcFightIqPrediction; scenarioSwingPct?: number }): TrendSystemActionability {
  if (!args.verified) {
    if (args.prediction.pick.dataQualityGrade === "D" || hasColdStart(args.prediction)) return "RESEARCH";
    return args.scenarioSwingPct != null && args.scenarioSwingPct >= 4 ? "RESEARCH" : "WATCHLIST";
  }
  if (args.price != null && args.edgePct != null && args.edgePct >= 2) return "ACTIVE";
  return "WATCHLIST";
}

function matchReasons(prediction: UfcFightIqPrediction, scenarioSwingPct: number) {
  const method = methodLeader(prediction);
  const methodText = method ? `${method[0]} ${(method[1] * 100).toFixed(1)}%` : "method TBD";
  return [
    `Fight IQ pick ${prediction.pick.fighterName} ${pctLabel(prediction.pick.winProbability)} fair ${moneylineLabel(prediction.pick.fairOddsAmerican)}`,
    `25k Markov sim states: standing, clinch, takedown, ground control, submission threat, knockdown, decision`,
    `Rating ${pctLabel(prediction.modelBreakdown.ratingProbabilityA)} · feature ${pctLabel(prediction.modelBreakdown.featureProbabilityA)} · Markov ${pctLabel(prediction.modelBreakdown.markovProbabilityA)}`,
    `Top method lane ${methodText}`,
    `Scenario swing ${scenarioSwingPct.toFixed(2)}%`,
    `Confidence ${prediction.pick.confidenceGrade} · data ${prediction.pick.dataQualityGrade}`,
    ...prediction.pathToVictory.slice(0, 3),
    ...prediction.dangerFlags.slice(0, 3),
    prediction.noFutureLeakagePolicy
  ];
}

function matchForSystem(system: TrendSystemDefinition, twin: any): TrendSystemMatch | null {
  const prediction = buildUfcFightIqFromSimTwin(twin);
  const gap = prediction.modelBreakdown.winnerProbabilityGap;
  const edgePct = Number((gap * 100).toFixed(2));
  const scenarioSwingPct = Number(maxScenarioSwingPct(twin).toFixed(2));
  const coldStartActive = hasColdStart(prediction);

  if (system.id === "ufc-fight-iq-winner-edge" && gap < 0.06) return null;
  if (system.id === "ufc-prospect-watch-cold-start" && !coldStartActive) return null;
  if (system.id === "ufc-scenario-swing-watch" && scenarioSwingPct < 4) return null;

  return {
    systemId: system.id,
    gameId: twin.gameId,
    league: "UFC" as LeagueKey,
    eventLabel: twin.eventLabel,
    startTime: twin.startTime,
    status: twin.status,
    side: prediction.pick.fighterName,
    market: "fight_winner",
    actionability: actionability({
      verified: system.verified,
      edgePct,
      price: null,
      prediction,
      scenarioSwingPct
    }),
    confidencePct: Number((prediction.pick.winProbability * 100).toFixed(1)),
    edgePct,
    price: null,
    fairProbability: prediction.pick.winProbability,
    href: `/sharktrends/ufc?fightId=${encodeURIComponent(twin.gameId)}&side=${encodeURIComponent(pickSide(prediction))}`,
    reasons: matchReasons(prediction, scenarioSwingPct)
  };
}

export async function buildUfcTrendSystems(args?: { includeInactive?: boolean }) {
  const result = await listSimTwins({ league: "UFC", limit: 24 });
  const systems = UFC_TREND_SYSTEMS.map((system) => {
    const activeMatches = result.twins
      .map((twin) => matchForSystem(system, twin))
      .filter((match): match is TrendSystemMatch => Boolean(match));
    const best = activeMatches[0];
    return {
      ...system,
      activeMatches,
      actionability: best?.actionability ?? "INACTIVE" as TrendSystemActionability
    };
  }).filter((system) => args?.includeInactive || system.activeMatches.length || system.verified);

  return {
    systems,
    cacheStatus: {
      ufc: result.count > 0,
      stale: false
    }
  };
}
