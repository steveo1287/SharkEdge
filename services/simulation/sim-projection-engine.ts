import type { LeagueKey } from "@/lib/types/domain";
import { compareMlbProfiles, type MlbMatchupComparison } from "@/services/simulation/mlb-team-analytics";

type SimProjectionInput = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
};

type SimProjection = {
  matchup: {
    away: string;
    home: string;
  };
  distribution: {
    avgAway: number;
    avgHome: number;
    homeWinPct: number;
    awayWinPct: number;
  };
  read: string;
  nbaIntel: {
    modelVersion: string;
    dataSource: string;
  } | null;
  mlbIntel?: {
    modelVersion: "mlb-intel-v1";
    dataSource: string;
    homeEdge: number;
    projectedTotal: number;
    volatilityIndex: number;
    factors: Array<{ label: string; value: number }>;
  } | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) {
    return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" };
  }
  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) {
    return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" };
  }
  return { away: "Away", home: "Home" };
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number, shift: number) {
  const v = (seed ^ (shift * 1103515245)) >>> 0;
  return (v % 10000) / 10000;
}

function leagueBaseline(leagueKey: LeagueKey) {
  switch (leagueKey) {
    case "NBA":
      return { away: 110, home: 113, spread: 1.8 };
    case "MLB":
      return { away: 4.1, home: 4.35, spread: 0.25 };
    case "NHL":
      return { away: 2.8, home: 3.1, spread: 0.25 };
    case "NFL":
      return { away: 21.5, home: 23.1, spread: 1.1 };
    case "NCAAF":
      return { away: 25, home: 27, spread: 1.3 };
    case "UFC":
    case "BOXING":
      return { away: 0, home: 0, spread: 0 };
    default:
      return { away: 10, home: 11, spread: 0.5 };
  }
}

function buildMlbIntel(matchup: { away: string; home: string }, comparison: MlbMatchupComparison) {
  const homeEdge = Number((
    comparison.offensiveEdge * 0.22 +
    comparison.powerEdge * 0.16 +
    comparison.plateDisciplineEdge * 0.16 +
    comparison.startingPitchingEdge * 0.34 +
    comparison.bullpenEdge * 0.36 +
    comparison.defenseEdge * 0.12 +
    comparison.fatigueEdge * 0.18 +
    comparison.formEdge * 0.12
  ).toFixed(2));

  const projectedTotal = Number((
    comparison.runEnvironment * 2 +
    comparison.parkWeatherEdge * 0.28 +
    Math.abs(comparison.powerEdge) * 0.18 -
    Math.max(0, comparison.startingPitchingEdge) * 0.12
  ).toFixed(2));

  return {
    modelVersion: "mlb-intel-v1" as const,
    dataSource: `${comparison.away.source}/${comparison.home.source}+team-analytics`,
    homeEdge,
    projectedTotal,
    volatilityIndex: comparison.volatilityIndex,
    factors: [
      { label: "Offense", value: comparison.offensiveEdge },
      { label: "Power", value: comparison.powerEdge },
      { label: "Plate discipline", value: comparison.plateDisciplineEdge },
      { label: "Starting pitching", value: comparison.startingPitchingEdge },
      { label: "Bullpen", value: comparison.bullpenEdge },
      { label: "Defense", value: comparison.defenseEdge },
      { label: "Park/weather", value: comparison.parkWeatherEdge },
      { label: "Fatigue", value: comparison.fatigueEdge },
      { label: "Form", value: comparison.formEdge }
    ]
  };
}

export async function buildSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  const matchup = parseMatchup(input.label);
  const base = leagueBaseline(input.leagueKey);
  const seed = hashSeed(`${input.id}:${input.startTime}:${input.leagueKey}:${input.status}`);
  const mlbComparison = input.leagueKey === "MLB" ? await compareMlbProfiles(matchup.away, matchup.home) : null;
  const mlbIntel = mlbComparison ? buildMlbIntel(matchup, mlbComparison) : null;

  if (mlbIntel) {
    const total = clamp(mlbIntel.projectedTotal, 5.8, 13.5);
    const homeExpected = clamp(total / 2 + 0.2 + mlbIntel.homeEdge * 0.42, 1.5, 10.5);
    const awayExpected = clamp(total - homeExpected, 1.5, 10.5);
    const homeWinPct = clamp(0.51 + mlbIntel.homeEdge / 8, 0.32, 0.72);
    const awayWinPct = 1 - homeWinPct;
    const read = homeWinPct >= 0.57
      ? `${matchup.home} rate as the stronger MLB side behind pitching/bullpen/context edge. ${mlbIntel.dataSource}.`
      : awayWinPct >= 0.57
        ? `${matchup.away} rate as the stronger MLB side behind pitching/bullpen/context edge. ${mlbIntel.dataSource}.`
        : `MLB matchup projects tight. Run environment ${total.toFixed(1)}, volatility ${mlbIntel.volatilityIndex}. ${mlbIntel.dataSource}.`;
    return {
      matchup,
      distribution: {
        avgAway: Number(awayExpected.toFixed(2)),
        avgHome: Number(homeExpected.toFixed(2)),
        homeWinPct: Number(homeWinPct.toFixed(3)),
        awayWinPct: Number(awayWinPct.toFixed(3))
      },
      read,
      nbaIntel: null,
      mlbIntel
    };
  }

  const awayJitter = (seeded(seed, 1) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const homeJitter = (seeded(seed, 2) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const spreadBias = (seeded(seed, 3) - 0.5) * 8 + base.spread;
  const avgAway = Number((base.away + awayJitter).toFixed(input.leagueKey === "NBA" ? 1 : 2));
  const avgHome = Number((base.home + homeJitter).toFixed(input.leagueKey === "NBA" ? 1 : 2));
  const homeWinPct = clamp(0.5 + spreadBias / 20, 0.05, 0.95);
  const awayWinPct = clamp(1 - homeWinPct, 0.05, 0.95);
  const volatility = seeded(seed, 4);
  const confidence = 1 - volatility;
  const read = homeWinPct >= 0.58 ? `${matchup.home} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.` : awayWinPct >= 0.58 ? `${matchup.away} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.` : `Game projects close to coin-flip. Volatility ${(volatility * 100).toFixed(0)}%.`;

  return {
    matchup,
    distribution: {
      avgAway,
      avgHome,
      homeWinPct: Number(homeWinPct.toFixed(3)),
      awayWinPct: Number(awayWinPct.toFixed(3))
    },
    read,
    nbaIntel: input.leagueKey === "NBA" ? { modelVersion: "nba-intel-v6", dataSource: "live-score-context" } : null,
    mlbIntel: null
  };
}
