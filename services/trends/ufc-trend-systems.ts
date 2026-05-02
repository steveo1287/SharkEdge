import type { LeagueKey, SportCode, TrendFilters } from "@/lib/types/domain";
import { listSimTwins } from "@/services/sim/sim-twin";
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
    id: "ufc-fight-winner-model-edge",
    name: "UFC Fight Winner Model Edge",
    description: "Fight qualifies when the UFC Sim Twin produces a meaningful winner probability gap and a current fight-card matchup is attached.",
    category: "Model Edge",
    sport: "MMA" as SportCode,
    league: "UFC" as LeagueKey,
    market: "fight_winner",
    side: "FAVORITE",
    filters: baseFilters({ sport: "MMA", league: "UFC" as LeagueKey, market: "fight_winner", side: "FAVORITE", window: "365d", sample: 75 }),
    rules: [
      { key: "winnerProbabilityGap", label: "Winner probability gap", operator: ">=", value: 0.06 },
      { key: "currentFightCard", label: "Current fight-card matchup", operator: "exists", value: true }
    ],
    metrics: { wins: 0, losses: 0, pushes: 0, profitUnits: 0, roiPct: 0, winRatePct: 0, sampleSize: 0, currentStreak: "NEW", last30WinRatePct: 0, clvPct: null, seasons: 0 },
    risk: "high",
    verified: false,
    source: "sim-derived-system"
  },
  {
    id: "ufc-scenario-swing-watch",
    name: "UFC Scenario Swing Watch",
    description: "Fight qualifies when reach, grappling, cardio, or five-round scenarios materially swing the Sim Twin output.",
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

function favoriteSide(twin: any) {
  const homePct = Number(twin.base?.homeWinPct ?? 0.5);
  const awayPct = Number(twin.base?.awayWinPct ?? 0.5);
  return homePct >= awayPct
    ? { side: "COMPETITOR_B", name: twin.matchup?.home ?? "Fighter B", pct: homePct, edge: homePct - awayPct }
    : { side: "COMPETITOR_A", name: twin.matchup?.away ?? "Fighter A", pct: awayPct, edge: awayPct - homePct };
}

function actionability(args: { verified: boolean; edgePct: number | null; price: number | null; scenarioSwingPct?: number }): TrendSystemActionability {
  if (!args.verified) return args.scenarioSwingPct != null && args.scenarioSwingPct >= 4 ? "RESEARCH" : "WATCHLIST";
  if (args.price != null && args.edgePct != null && args.edgePct >= 2) return "ACTIVE";
  return "WATCHLIST";
}

function matchForSystem(system: TrendSystemDefinition, twin: any): TrendSystemMatch | null {
  const fav = favoriteSide(twin);
  const edgePct = Number((fav.edge * 100).toFixed(2));
  const scenarioSwingPct = Number(maxScenarioSwingPct(twin).toFixed(2));

  if (system.id === "ufc-fight-winner-model-edge" && fav.edge < 0.06) return null;
  if (system.id === "ufc-scenario-swing-watch" && scenarioSwingPct < 4) return null;

  return {
    systemId: system.id,
    gameId: twin.gameId,
    league: "UFC" as LeagueKey,
    eventLabel: twin.eventLabel,
    startTime: twin.startTime,
    status: twin.status,
    side: fav.name,
    market: "fight_winner",
    actionability: actionability({
      verified: system.verified,
      edgePct,
      price: null,
      scenarioSwingPct
    }),
    confidencePct: Number((fav.pct * 100).toFixed(1)),
    edgePct,
    price: null,
    fairProbability: fav.pct,
    href: twin.href,
    reasons: [
      `Winner probability gap ${edgePct}%`,
      `Scenario swing ${scenarioSwingPct}%`,
      `Trust ${twin.trust?.grade ?? "D"}`,
      "UFC odds/props are partial; keep in research/watch until priced and ledger-verified."
    ]
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
