import type { LeagueKey } from "@/lib/types/domain";

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
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseMatchup(label: string) {
  const atSplit = label.split(" @ ");
  if (atSplit.length === 2) {
    return {
      away: atSplit[0]?.trim() || "Away",
      home: atSplit[1]?.trim() || "Home"
    };
  }

  const vsSplit = label.split(" vs ");
  if (vsSplit.length === 2) {
    return {
      away: vsSplit[0]?.trim() || "Away",
      home: vsSplit[1]?.trim() || "Home"
    };
  }

  return {
    away: "Away",
    home: "Home"
  };
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
      return { away: 4, home: 4.3, spread: 0.4 };
    case "NHL":
      return { away: 2.8, home: 3.1, spread: 0.25 };
    case "NFL":
      return { away: 21.5, home: 23.1, spread: 1.1 };
    case "NCAAF":
      return { away: 25, home: 27, spread: 1.3 };
    case "UFC":
      return { away: 0, home: 0, spread: 0 };
    case "BOXING":
      return { away: 0, home: 0, spread: 0 };
    default:
      return { away: 10, home: 11, spread: 0.5 };
  }
}

export async function buildSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  const matchup = parseMatchup(input.label);
  const base = leagueBaseline(input.leagueKey);
  const seed = hashSeed(`${input.id}:${input.startTime}:${input.leagueKey}:${input.status}`);

  const awayJitter = (seeded(seed, 1) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const homeJitter = (seeded(seed, 2) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const spreadBias = (seeded(seed, 3) - 0.5) * 8 + base.spread;

  const avgAway = Number((base.away + awayJitter).toFixed(input.leagueKey === "NBA" ? 1 : 2));
  const avgHome = Number((base.home + homeJitter).toFixed(input.leagueKey === "NBA" ? 1 : 2));
  const homeWinPct = clamp(0.5 + spreadBias / 20, 0.05, 0.95);
  const awayWinPct = clamp(1 - homeWinPct, 0.05, 0.95);

  const volatility = seeded(seed, 4);
  const confidence = 1 - volatility;
  const read =
    homeWinPct >= 0.58
      ? `${matchup.home} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.`
      : awayWinPct >= 0.58
        ? `${matchup.away} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.`
        : `Game projects close to coin-flip. Volatility ${(volatility * 100).toFixed(0)}%.`;

  return {
    matchup,
    distribution: {
      avgAway,
      avgHome,
      homeWinPct: Number(homeWinPct.toFixed(3)),
      awayWinPct: Number(awayWinPct.toFixed(3))
    },
    read,
    nbaIntel:
      input.leagueKey === "NBA"
        ? {
            modelVersion: "nba-intel-v6",
            dataSource: "live-score-context"
          }
        : null
  };
}
