import { fetchDataballrPlayerContext, type DataballrPlayerContext } from "./adapters/databallr-adapter";

export type NbaPlayerProjectionContext = {
  playerName: string;
  team?: string | null;
  opponent?: string | null;

  seasonAvg?: number | null;
  last5Avg?: number | null;
  last10Avg?: number | null;

  seasonMinutes?: number | null;
  last5Minutes?: number | null;
  last10Minutes?: number | null;

  seasonUsageRate?: number | null;
  last5UsageRate?: number | null;
  last10UsageRate?: number | null;

  teamPace?: number | null;
  opponentPace?: number | null;
  opponentDefRating?: number | null;
  opponentRankVsPosition?: number | null;

  projectedMinutes?: number | null;
  injuryStatus?: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | null;

  synergyPlayTypePpp?: number | null;
  synergyFrequencyPct?: number | null;
  nba2kRating?: number | null;

  source: "databallr" | "fallback";
  updatedAt: string;
};

function fallbackContext(playerName: string): NbaPlayerProjectionContext {
  return {
    playerName,
    seasonAvg: null,
    last5Avg: null,
    last10Avg: null,
    seasonMinutes: null,
    last5Minutes: null,
    last10Minutes: null,
    seasonUsageRate: null,
    last5UsageRate: null,
    last10UsageRate: null,
    teamPace: null,
    opponentPace: null,
    opponentDefRating: null,
    opponentRankVsPosition: null,
    projectedMinutes: null,
    injuryStatus: "ACTIVE",
    synergyPlayTypePpp: null,
    synergyFrequencyPct: null,
    nba2kRating: null,
    source: "fallback",
    updatedAt: new Date().toISOString()
  };
}

function mapContext(raw: DataballrPlayerContext): NbaPlayerProjectionContext {
  return {
    playerName: raw.playerName,
    team: raw.team ?? null,
    opponent: raw.opponent ?? null,

    seasonAvg: raw.seasonAvg ?? null,
    last5Avg: raw.last5Avg ?? null,
    last10Avg: raw.last10Avg ?? null,

    seasonMinutes: raw.seasonMinutes ?? null,
    last5Minutes: raw.last5Minutes ?? null,
    last10Minutes: raw.last10Minutes ?? null,

    seasonUsageRate: raw.seasonUsageRate ?? null,
    last5UsageRate: raw.last5UsageRate ?? null,
    last10UsageRate: raw.last10UsageRate ?? null,

    teamPace: raw.teamPace ?? null,
    opponentPace: raw.opponentPace ?? null,
    opponentDefRating: raw.opponentDefRating ?? null,
    opponentRankVsPosition: raw.opponentRankVsPosition ?? null,

    projectedMinutes: raw.projectedMinutes ?? null,
    injuryStatus: raw.injuryStatus ?? "ACTIVE",

    synergyPlayTypePpp: raw.synergyPlayTypePpp ?? null,
    synergyFrequencyPct: raw.synergyFrequencyPct ?? null,
    nba2kRating: raw.nba2kRating ?? null,

    source: raw.source,
    updatedAt: raw.updatedAt
  };
}

export async function getNbaPlayerProjectionContext(args: {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  propType?: string | null;
}): Promise<NbaPlayerProjectionContext> {
  try {
    const context = await fetchDataballrPlayerContext({
      playerName: args.playerName,
      team: args.team,
      opponent: args.opponent,
      propType: args.propType
    });

    if (!context) {
      return fallbackContext(args.playerName);
    }

    return mapContext(context);
  } catch {
    return fallbackContext(args.playerName);
  }
}
