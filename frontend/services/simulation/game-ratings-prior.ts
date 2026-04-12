export type RatingSource = "EXTERNAL_VIDEO_GAME" | "DERIVED_RATING_STYLE" | "MISSING";

export type PlayerRatingSnapshotInput = {
  id: string;
  name: string;
  position: string;
  recentStats: unknown[];
};

export type TeamGameRatingsProfile = {
  source: RatingSource;
  confidence: number;
  overall: number;
  offense: number;
  defense: number;
  tempo: number;
  volatility: number;
  playerCount: number;
  notes: string[];
};

export type EventGameRatingsPrior = {
  source: RatingSource;
  blendWeight: number;
  confidence: number;
  home: TeamGameRatingsProfile;
  away: TeamGameRatingsProfile;
  deltaOverall: number;
  notes: string[];
};

type LeagueRatingConfig = {
  takePlayers: number;
  offenseKeys: string[];
  defenseKeys: string[];
  tempoKeys: string[];
  overallKeys: string[];
  offenseBaseline: number;
  defenseBaseline: number;
  tempoBaseline: number;
  offenseScale: number;
  defenseScale: number;
  tempoScale: number;
};

const LEAGUE_CONFIG: Record<string, LeagueRatingConfig> = {
  NBA: {
    takePlayers: 9,
    offenseKeys: ["points", "PTS", "assists", "AST", "threes", "FG3M", "3PM", "usage_rate"],
    defenseKeys: ["rebounds", "REB", "steals", "STL", "blocks", "BLK"],
    tempoKeys: ["minutes", "MIN", "pace", "possessions"],
    overallKeys: ["overall", "ovr", "overallRating", "rating_2k", "nba2k_overall"],
    offenseBaseline: 22,
    defenseBaseline: 8,
    tempoBaseline: 28,
    offenseScale: 1.55,
    defenseScale: 3.4,
    tempoScale: 0.95
  },
  NCAAB: {
    takePlayers: 9,
    offenseKeys: ["points", "PTS", "assists", "AST", "threes", "FG3M", "3PM"],
    defenseKeys: ["rebounds", "REB", "steals", "STL", "blocks", "BLK"],
    tempoKeys: ["minutes", "MIN", "pace", "possessions"],
    overallKeys: ["overall", "ovr", "overallRating", "rating_2k"],
    offenseBaseline: 18,
    defenseBaseline: 7,
    tempoBaseline: 26,
    offenseScale: 1.65,
    defenseScale: 3.7,
    tempoScale: 0.9
  },
  NFL: {
    takePlayers: 14,
    offenseKeys: ["passing_yards", "pass_yds", "rushing_yards", "rush_yds", "receiving_yards", "rec_yds", "touchdowns", "TD"],
    defenseKeys: ["tackles", "sacks", "interceptions", "passes_defended", "forced_fumbles"],
    tempoKeys: ["snaps", "plays", "targets", "rush_attempts", "pass_attempts"],
    overallKeys: ["overall", "ovr", "overallRating", "madden_overall", "rating_madden"],
    offenseBaseline: 48,
    defenseBaseline: 9,
    tempoBaseline: 18,
    offenseScale: 0.34,
    defenseScale: 2.8,
    tempoScale: 1.5
  },
  NCAAF: {
    takePlayers: 14,
    offenseKeys: ["passing_yards", "rushing_yards", "receiving_yards", "touchdowns", "TD"],
    defenseKeys: ["tackles", "sacks", "interceptions"],
    tempoKeys: ["snaps", "plays", "targets", "rush_attempts", "pass_attempts"],
    overallKeys: ["overall", "ovr", "overallRating", "cfb_overall", "rating_ea"],
    offenseBaseline: 45,
    defenseBaseline: 8,
    tempoBaseline: 16,
    offenseScale: 0.35,
    defenseScale: 2.9,
    tempoScale: 1.55
  },
  MLB: {
    takePlayers: 12,
    offenseKeys: ["hits", "H", "total_bases", "TB", "home_runs", "HR", "rbis", "RBI", "runs", "R"],
    defenseKeys: ["strikeouts", "SO", "outs_recorded", "outs", "fielding_pct", "putouts"],
    tempoKeys: ["plate_appearances", "PA", "innings_pitched", "IP"],
    overallKeys: ["overall", "ovr", "overallRating", "the_show_overall", "show_rating"],
    offenseBaseline: 8,
    defenseBaseline: 8,
    tempoBaseline: 6,
    offenseScale: 4.5,
    defenseScale: 2.8,
    tempoScale: 4.2
  },
  NHL: {
    takePlayers: 11,
    offenseKeys: ["goals", "G", "assists", "A", "shots", "SOG", "points", "PTS"],
    defenseKeys: ["blocked_shots", "saves", "hits", "takeaways"],
    tempoKeys: ["time_on_ice", "TOI", "shifts"],
    overallKeys: ["overall", "ovr", "overallRating", "nhl_overall"],
    offenseBaseline: 6,
    defenseBaseline: 6,
    tempoBaseline: 18,
    offenseScale: 4.2,
    defenseScale: 3.0,
    tempoScale: 1.0
  }
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function getNumber(stats: unknown, keys: string[]) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return null;
  }
  const record = stats as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const cleaned = value.replace(/[^0-9.+-]/g, "").trim();
      if (!cleaned) continue;
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function sum(values: Array<number | null | undefined>) {
  let total = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
}

function derivePlayerRatings(config: LeagueRatingConfig, input: PlayerRatingSnapshotInput) {
  const externalOverall = average(input.recentStats.map((row) => getNumber(row, config.overallKeys)));
  const offenseRaw = average(input.recentStats.map((row) => getNumber(row, config.offenseKeys))) ?? 0;
  const defenseRaw = average(input.recentStats.map((row) => getNumber(row, config.defenseKeys))) ?? 0;
  const tempoRaw = average(input.recentStats.map((row) => getNumber(row, config.tempoKeys))) ?? 0;

  const involvement = sum([
    offenseRaw,
    defenseRaw * 0.7,
    tempoRaw * 0.2
  ]);

  if (typeof externalOverall === "number") {
    const offense = clamp(
      getNumber(input.recentStats[0], ["offenseRating", "offensive_rating", "batting_rating", "throwPower", "shooting_rating"]) ??
        (externalOverall - 3),
      40,
      99
    );
    const defense = clamp(
      getNumber(input.recentStats[0], ["defenseRating", "defensive_rating", "fielding_rating", "coverage_rating", "def_rating"]) ??
        (externalOverall - 4),
      35,
      99
    );
    const tempo = clamp(
      getNumber(input.recentStats[0], ["speedRating", "speed", "quickness", "tempo_rating", "acceleration"]) ??
        (52 + tempoRaw * config.tempoScale),
      35,
      99
    );
    return {
      source: "EXTERNAL_VIDEO_GAME" as const,
      overall: clamp(externalOverall, 40, 99),
      offense,
      defense,
      tempo,
      involvement: Math.max(1, involvement)
    };
  }

  const offense = clamp(55 + (offenseRaw - config.offenseBaseline) * config.offenseScale, 40, 95);
  const defense = clamp(54 + (defenseRaw - config.defenseBaseline) * config.defenseScale, 38, 94);
  const tempo = clamp(52 + (tempoRaw - config.tempoBaseline) * config.tempoScale, 35, 95);
  const overall = clamp(offense * 0.48 + defense * 0.34 + tempo * 0.18, 40, 94);

  return {
    source: "DERIVED_RATING_STYLE" as const,
    overall: round(overall),
    offense: round(offense),
    defense: round(defense),
    tempo: round(tempo),
    involvement: Math.max(1, involvement)
  };
}

function buildTeamProfile(leagueKey: string, players: PlayerRatingSnapshotInput[]): TeamGameRatingsProfile {
  const config = LEAGUE_CONFIG[leagueKey] ?? LEAGUE_CONFIG.NBA;
  const ratedPlayers = players
    .map((player) => ({
      player,
      rating: derivePlayerRatings(config, player)
    }))
    .sort((left, right) => right.rating.involvement - left.rating.involvement)
    .slice(0, config.takePlayers);

  if (!ratedPlayers.length) {
    return {
      source: "MISSING",
      confidence: 0,
      overall: 50,
      offense: 50,
      defense: 50,
      tempo: 50,
      volatility: 60,
      playerCount: 0,
      notes: ["No roster stat history was available for ratings-style priors."]
    };
  }

  let externalCount = 0;
  let weightedOverall = 0;
  let weightedOffense = 0;
  let weightedDefense = 0;
  let weightedTempo = 0;
  let weightTotal = 0;
  const notes = new Set<string>();

  for (const entry of ratedPlayers) {
    const weight = Math.sqrt(entry.rating.involvement);
    weightedOverall += entry.rating.overall * weight;
    weightedOffense += entry.rating.offense * weight;
    weightedDefense += entry.rating.defense * weight;
    weightedTempo += entry.rating.tempo * weight;
    weightTotal += weight;
    if (entry.rating.source === "EXTERNAL_VIDEO_GAME") {
      externalCount += 1;
    }
  }

  const source: RatingSource =
    externalCount > ratedPlayers.length / 2
      ? "EXTERNAL_VIDEO_GAME"
      : "DERIVED_RATING_STYLE";

  if (source === "EXTERNAL_VIDEO_GAME") {
    notes.add("External game-style player ratings were detected and blended into the team prior.");
  } else {
    notes.add("Ratings-style priors were derived from recent player stat profiles because no external game ratings were present.");
  }

  const confidence = clamp(
    (ratedPlayers.length / Math.max(1, config.takePlayers)) * 55 +
      (externalCount / Math.max(1, ratedPlayers.length)) * 35,
    18,
    92
  );

  const overall = round(weightedOverall / Math.max(1, weightTotal));
  const offense = round(weightedOffense / Math.max(1, weightTotal));
  const defense = round(weightedDefense / Math.max(1, weightTotal));
  const tempo = round(weightedTempo / Math.max(1, weightTotal));
  const volatility = round(
    clamp(
      58 -
        (confidence - 50) * 0.35 +
        Math.abs(offense - defense) * 0.25 +
        Math.abs(tempo - 60) * 0.12,
      25,
      80
    )
  );

  return {
    source,
    confidence: round(confidence),
    overall,
    offense,
    defense,
    tempo,
    volatility,
    playerCount: ratedPlayers.length,
    notes: Array.from(notes)
  };
}

export function buildEventGameRatingsPrior(args: {
  leagueKey: string;
  homePlayers: PlayerRatingSnapshotInput[];
  awayPlayers: PlayerRatingSnapshotInput[];
}): EventGameRatingsPrior {
  const home = buildTeamProfile(args.leagueKey, args.homePlayers);
  const away = buildTeamProfile(args.leagueKey, args.awayPlayers);

  const source: RatingSource =
    home.source === "EXTERNAL_VIDEO_GAME" || away.source === "EXTERNAL_VIDEO_GAME"
      ? "EXTERNAL_VIDEO_GAME"
      : home.source === "MISSING" && away.source === "MISSING"
        ? "MISSING"
        : "DERIVED_RATING_STYLE";

  const confidence = round((home.confidence + away.confidence) / 2);
  const blendWeight = round(
    clamp(
      source === "EXTERNAL_VIDEO_GAME"
        ? 0.14 + confidence / 1000
        : source === "DERIVED_RATING_STYLE"
          ? 0.07 + confidence / 1500
          : 0,
      0,
      0.22
    ),
    3
  );

  return {
    source,
    blendWeight,
    confidence,
    home,
    away,
    deltaOverall: round(home.overall - away.overall),
    notes: Array.from(
      new Set([
        ...home.notes,
        ...away.notes,
        source === "MISSING"
          ? "No roster ratings-style prior was available, so the simulation stays fully stats-driven."
          : `Video-game-style ratings are bounded to a ${Math.round(blendWeight * 100)}% prior weight so they guide the sim without overpowering real performance data.`
      ])
    )
  };
}
