export type ScenarioKey =
  | "PLAYER_OUT"
  | "STARTER_SCRATCHED"
  | "GOALIE_SWAP"
  | "QB_DOWNGRADE"
  | "WEATHER_WIND_UP"
  | "BULLPEN_FATIGUE"
  | "MARKET_LINE_MOVE";

export type ScenarioBase = {
  league: string;
  homeWinPct: number;
  awayWinPct: number;
  projectedSpread: number;
  projectedTotal: number;
};

export type ScenarioDelta = {
  id: ScenarioKey;
  label: string;
  description: string;
  baseHomeWinPct: number;
  adjustedHomeWinPct: number;
  deltaHomePct: number;
  baseAwayWinPct: number;
  adjustedAwayWinPct: number;
  deltaAwayPct: number;
  baseSpread: number;
  adjustedSpread: number;
  deltaSpread: number;
  baseTotal: number;
  adjustedTotal: number;
  deltaTotal: number;
  warnings: string[];
};

const SCENARIO_LABELS: Record<ScenarioKey, { label: string; description: string }> = {
  PLAYER_OUT: {
    label: "Impact player out",
    description: "Stress test for a major player downgrade or minutes removal."
  },
  STARTER_SCRATCHED: {
    label: "Starter scratched",
    description: "MLB-style starter downgrade or late pitching change."
  },
  GOALIE_SWAP: {
    label: "Goalie swap",
    description: "NHL-style confirmed starter flips to lower-rated goalie."
  },
  QB_DOWNGRADE: {
    label: "QB downgrade",
    description: "NFL-style quarterback availability or effectiveness downgrade."
  },
  WEATHER_WIND_UP: {
    label: "Weather / wind up",
    description: "Weather suppresses scoring and increases uncertainty."
  },
  BULLPEN_FATIGUE: {
    label: "Bullpen fatigue",
    description: "Late-inning pitching depth weakens and total volatility rises."
  },
  MARKET_LINE_MOVE: {
    label: "Market line move",
    description: "Market moves against the model by one to two points."
  }
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function profileFor(league: string, key: ScenarioKey) {
  const value = league.toUpperCase();
  const generic = { probability: -0.035, spread: -1.2, total: 0, warning: "Generic stress test; wire sport-specific player/context data for sharper deltas." };

  if (key === "PLAYER_OUT") {
    if (value === "NBA") return { probability: -0.065, spread: -3.8, total: -2.5, warning: "NBA player-out placeholder; connect projected minutes/on-off value for exact impact." };
    if (value === "NFL") return { probability: -0.045, spread: -2.2, total: -1.5, warning: "Player-out placeholder; QB_DOWNGRADE is stronger for quarterbacks." };
    return generic;
  }

  if (key === "STARTER_SCRATCHED") {
    if (value === "MLB") return { probability: -0.075, spread: -0.85, total: 0.9, warning: "MLB starter scratch placeholder; connect named starter projections for exact delta." };
    return { ...generic, warning: "Starter scratch is primarily an MLB scenario." };
  }

  if (key === "GOALIE_SWAP") {
    if (value === "NHL") return { probability: -0.06, spread: -0.55, total: 0.45, warning: "NHL goalie swap placeholder; connect confirmed goalie ratings for exact delta." };
    return { ...generic, warning: "Goalie swap is primarily an NHL scenario." };
  }

  if (key === "QB_DOWNGRADE") {
    if (value === "NFL" || value === "NCAAF") return { probability: -0.095, spread: -5.5, total: -3.5, warning: "QB downgrade placeholder; connect QB value/EPA and injury status for exact delta." };
    return { ...generic, warning: "QB downgrade is primarily a football scenario." };
  }

  if (key === "WEATHER_WIND_UP") {
    if (value === "MLB") return { probability: -0.015, spread: -0.15, total: -1.15, warning: "Weather placeholder; connect park-level wind, temperature, and roof state." };
    if (value === "NFL" || value === "NCAAF") return { probability: -0.02, spread: -0.75, total: -4.5, warning: "Weather placeholder; connect wind and precipitation for exact downgrade." };
    return { probability: -0.005, spread: -0.1, total: -0.4, warning: "Weather has limited impact for this league in v1." };
  }

  if (key === "BULLPEN_FATIGUE") {
    if (value === "MLB") return { probability: -0.045, spread: -0.45, total: 0.75, warning: "Bullpen fatigue placeholder; connect recent reliever workload for exact delta." };
    return { ...generic, warning: "Bullpen fatigue is primarily an MLB scenario." };
  }

  if (key === "MARKET_LINE_MOVE") {
    return { probability: -0.025, spread: -1.5, total: 0, warning: "Market move placeholder; connect requested line/price for exact market delta." };
  }

  return generic;
}

export function applyScenario(base: ScenarioBase, key: ScenarioKey): ScenarioDelta {
  const meta = SCENARIO_LABELS[key];
  const profile = profileFor(base.league, key);
  const adjustedHomeWinPct = clamp(base.homeWinPct + profile.probability, 0.02, 0.98);
  const adjustedAwayWinPct = clamp(1 - adjustedHomeWinPct, 0.02, 0.98);
  const adjustedSpread = base.projectedSpread + profile.spread;
  const adjustedTotal = Math.max(0, base.projectedTotal + profile.total);

  return {
    id: key,
    label: meta.label,
    description: meta.description,
    baseHomeWinPct: round(base.homeWinPct),
    adjustedHomeWinPct: round(adjustedHomeWinPct),
    deltaHomePct: round(adjustedHomeWinPct - base.homeWinPct),
    baseAwayWinPct: round(base.awayWinPct),
    adjustedAwayWinPct: round(adjustedAwayWinPct),
    deltaAwayPct: round(adjustedAwayWinPct - base.awayWinPct),
    baseSpread: round(base.projectedSpread, 2),
    adjustedSpread: round(adjustedSpread, 2),
    deltaSpread: round(adjustedSpread - base.projectedSpread, 2),
    baseTotal: round(base.projectedTotal, 2),
    adjustedTotal: round(adjustedTotal, 2),
    deltaTotal: round(adjustedTotal - base.projectedTotal, 2),
    warnings: [profile.warning]
  };
}

export function defaultScenarioKeysForLeague(league: string): ScenarioKey[] {
  const value = league.toUpperCase();
  if (value === "NBA") return ["PLAYER_OUT", "MARKET_LINE_MOVE"];
  if (value === "MLB") return ["STARTER_SCRATCHED", "BULLPEN_FATIGUE", "WEATHER_WIND_UP", "MARKET_LINE_MOVE"];
  if (value === "NHL") return ["GOALIE_SWAP", "MARKET_LINE_MOVE"];
  if (value === "NFL" || value === "NCAAF") return ["QB_DOWNGRADE", "WEATHER_WIND_UP", "PLAYER_OUT", "MARKET_LINE_MOVE"];
  return ["PLAYER_OUT", "MARKET_LINE_MOVE"];
}

export function buildScenarioSet(base: ScenarioBase, requested?: ScenarioKey[]) {
  const keys = requested?.length ? requested : defaultScenarioKeysForLeague(base.league);
  return keys.map((key) => applyScenario(base, key));
}

export function isScenarioKey(value: string | null | undefined): value is ScenarioKey {
  return value === "PLAYER_OUT" || value === "STARTER_SCRATCHED" || value === "GOALIE_SWAP" || value === "QB_DOWNGRADE" || value === "WEATHER_WIND_UP" || value === "BULLPEN_FATIGUE" || value === "MARKET_LINE_MOVE";
}
