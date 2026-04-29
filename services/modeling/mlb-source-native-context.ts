import type { VenueWeatherJoinView } from "@/services/weather/provider-types";
import { inferVenueWeatherJoinFromContext } from "@/services/weather/venue-station-join";

type Jsonish = Record<string, unknown> | null | undefined

type PlayerRow = {
  id: string;
  teamId: string;
  name: string;
  position: string;
  status?: string | null;
  playerGameStats: Array<{
    statsJson: unknown;
    starter: boolean;
    createdAt: Date;
  }>;
};

type TeamRow = {
  id: string;
  name: string;
  abbreviation: string;
};

type StarterHint = {
  playerId: string;
  name: string;
  sampleSize: number;
  expectedOuts: number;
} | null;

export type MlbSourceNativeTeamContext = {
  teamId: string;
  teamName: string;
  abbreviation: string;
  starterName: string | null;
  starterConfidence: number;
  lineupStrength: number;
  lineupContactScore: number;
  lineupPowerScore: number;
  lineupCertainty: "HIGH" | "MEDIUM" | "LOW";
  topBats: string[];
  bullpenFreshness: number;
  bullpenRisk: "LOW" | "MEDIUM" | "HIGH";
  bullpenCoverage: number;
  notes: string[];
};

export type MlbSourceNativeContext = {
  league: "MLB";
  sourceCoverageScore: number;
  sourceSummary: string[];
  matchupFlags: string[];
  venue: {
    venueName: string | null;
    stationCode: string | null;
    stationName: string | null;
    roofType: VenueWeatherJoinView["roofType"];
    weatherExposure: VenueWeatherJoinView["weatherExposure"];
    altitudeFeet: number | null;
    windSensitivity: VenueWeatherJoinView["windSensitivity"];
    parkFactor: number;
    baselineRunFactor: number;
    notes: string[];
  };
  home: MlbSourceNativeTeamContext;
  away: MlbSourceNativeTeamContext;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
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

// Baseball innings notation: "1.2" = 1 full inning + 2 outs = 1⅔ innings (not 1.2 decimal innings).
// getNumber() would return 1.2 which over-counts usage by ~17% for a pitcher who threw 1.2 IP.
function parseBaseballInnings(stats: unknown, keys: string[]): number | null {
  const raw = getNumber(stats, keys);
  if (raw === null) return null;
  const whole = Math.floor(raw);
  const frac = Math.round((raw - whole) * 10);
  if (frac === 0) return whole;
  if (frac === 1) return whole + 1 / 3;
  if (frac === 2) return whole + 2 / 3;
  return raw; // already a proper decimal (unlikely from MLB data)
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.88) {
  let weighted = 0;
  let total = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }
    const weight = decay ** index;
    weighted += value * weight;
    total += weight;
  });
  return total ? weighted / total : null;
}

function isPitcher(position: string | null | undefined) {
  const normalized = String(position ?? "").toLowerCase();
  return normalized === "p" || normalized.includes("pitch");
}

function daysSince(date: Date, reference: Date) {
  return Math.max(0, (reference.getTime() - date.getTime()) / 86400000);
}

function buildLineupContext(team: TeamRow, players: PlayerRow[], referenceTime: Date): Pick<MlbSourceNativeTeamContext, "lineupStrength" | "lineupContactScore" | "lineupPowerScore" | "lineupCertainty" | "topBats" | "notes"> {
  const hitters = players.filter((player) => player.teamId === team.id && !isPitcher(player.position));

  const ranked = hitters.map((player) => {
    const pa = weightedAverage(
      player.playerGameStats.map((row) =>
        getNumber(row.statsJson, ["plateAppearances", "PA", "battersFaced", "atBats"])
      )
    ) ?? 0;
    const hits = weightedAverage(player.playerGameStats.map((row) => getNumber(row.statsJson, ["hits", "H"]))) ?? 0;
    const walks = weightedAverage(player.playerGameStats.map((row) => getNumber(row.statsJson, ["walks", "BB", "base_on_balls"]))) ?? 0;
    const strikeouts = weightedAverage(player.playerGameStats.map((row) => getNumber(row.statsJson, ["strikeouts", "SO", "K"]))) ?? 0;
    const totalBases = weightedAverage(player.playerGameStats.map((row) => getNumber(row.statsJson, ["totalBases", "TB"]))) ?? 0;
    const homeRuns = weightedAverage(player.playerGameStats.map((row) => getNumber(row.statsJson, ["homeRuns", "HR", "home_runs"]))) ?? 0;

    const safePa = Math.max(pa, 1);
    const obpProxy = (hits + walks) / safePa;
    const powerProxy = totalBases / safePa;
    const strikeoutRate = strikeouts / safePa;
    const recentGames = player.playerGameStats.length;
    const activePenalty = player.status && player.status !== "ACTIVE" ? 0.08 : 0;

    const score =
      pa * 0.55 +
      obpProxy * 18 +
      powerProxy * 12 +
      homeRuns * 2.4 -
      strikeoutRate * 6 -
      activePenalty;

    return {
      player,
      pa,
      obpProxy,
      powerProxy,
      strikeoutRate,
      recentGames,
      score
    };
  }).sort((left, right) => right.score - left.score);

  const topNine = ranked.slice(0, 9);
  const avgObp = weightedAverage(topNine.map((row) => row.obpProxy), 0.92) ?? 0.32;
  const avgPower = weightedAverage(topNine.map((row) => row.powerProxy), 0.92) ?? 0.43;
  const avgStrikeout = weightedAverage(topNine.map((row) => row.strikeoutRate), 0.92) ?? 0.22;
  const avgGames = weightedAverage(topNine.map((row) => row.recentGames), 0.92) ?? 0;
  const activeCount = topNine.filter((row) => row.player.status === "ACTIVE" || !row.player.status).length;

  const lineupStrength = clamp(
    Math.round(
      50 +
        ((avgObp / 0.32) - 1) * 26 +
        ((avgPower / 0.43) - 1) * 24 +
        ((topNine.length / 9) - 1) * 12 +
        ((activeCount / Math.max(1, topNine.length)) - 0.85) * 22
    ),
    20,
    92
  );

  const lineupContactScore = clamp(
    Math.round(50 + ((0.22 - avgStrikeout) / 0.22) * 32),
    18,
    88
  );

  const lineupPowerScore = clamp(
    Math.round(50 + ((avgPower / 0.43) - 1) * 36),
    18,
    92
  );

  const lineupCertainty =
    topNine.length >= 8 && avgGames >= 5 && activeCount >= 8
      ? "HIGH"
      : topNine.length >= 7 && avgGames >= 3.5
        ? "MEDIUM"
        : "LOW";

  const notes: string[] = [];
  if (lineupCertainty === "HIGH") {
    notes.push("Recent hitter usage gives a stable lineup core.");
  } else if (lineupCertainty === "MEDIUM") {
    notes.push("Lineup core is mostly stable but still carries some role uncertainty.");
  } else {
    notes.push("Lineup inference is thin; likely starters are derived from recent usage only.");
  }

  if (lineupPowerScore >= 60) {
    notes.push("Top bats show meaningful recent power.");
  }
  if (lineupContactScore <= 42) {
    notes.push("Lineup profile leans swing-and-miss, which can raise opposing strikeout ceilings.");
  } else if (lineupContactScore >= 60) {
    notes.push("Lineup profile is contact-oriented and harder to miss bats against.");
  }

  return {
    lineupStrength,
    lineupContactScore,
    lineupPowerScore,
    lineupCertainty,
    topBats: topNine.slice(0, 5).map((row) => row.player.name),
    notes
  };
}

function buildBullpenContext(team: TeamRow, players: PlayerRow[], starterHint: StarterHint, referenceTime: Date): Pick<MlbSourceNativeTeamContext, "bullpenFreshness" | "bullpenRisk" | "bullpenCoverage" | "notes"> {
  const relievers = players.filter(
    (player) => player.teamId === team.id && isPitcher(player.position) && player.id !== starterHint?.playerId
  );

  let usageLoad = 0;
  let heavyUsageArms = 0;
  let availableArms = 0;

  relievers.forEach((pitcher) => {
    const recentRows = pitcher.playerGameStats.slice(0, 4);
    const recentInnings = recentRows.map((row) =>
      parseBaseballInnings(row.statsJson, ["inningsPitched", "IP", "innings"])
    );

    const loadLastTwoDays = recentRows.reduce((sum, row, index) => {
      const age = daysSince(row.createdAt, referenceTime);
      if (age > 2.2) {
        return sum;
      }
      const innings = recentInnings[index] ?? 0;
      return sum + innings;
    }, 0);

    const pitchedLastTwoDays = recentRows.some((row) => daysSince(row.createdAt, referenceTime) <= 2.2);
    const ageNewest = recentRows.length ? daysSince(recentRows[0].createdAt, referenceTime) : 99;

    usageLoad += loadLastTwoDays;
    if (loadLastTwoDays >= 2.3) {
      heavyUsageArms += 1;
    }
    if (!pitchedLastTwoDays || ageNewest >= 1.2) {
      availableArms += 1;
    }
  });

  const bullpenCoverage = clamp(Math.round((availableArms / Math.max(1, relievers.length)) * 100), 0, 100);
  const bullpenFreshness = clamp(Math.round(76 - usageLoad * 7 - heavyUsageArms * 9 + bullpenCoverage * 0.18), 18, 96);
  const bullpenRisk = bullpenFreshness >= 68 ? "LOW" : bullpenFreshness >= 48 ? "MEDIUM" : "HIGH";

  const notes: string[] = [];
  if (bullpenRisk === "LOW") {
    notes.push("Recent bullpen usage suggests multiple fresh leverage arms are available.");
  } else if (bullpenRisk === "MEDIUM") {
    notes.push("Bullpen freshness is mixed; late-inning coverage is usable but not pristine.");
  } else {
    notes.push("Bullpen usage looks stretched, increasing late-inning run variance.");
  }

  if (starterHint && starterHint.expectedOuts >= 17) {
    notes.push("Projected starter length can shelter the bullpen workload.");
  }

  return {
    bullpenFreshness,
    bullpenRisk,
    bullpenCoverage,
    notes
  };
}

function buildStarterConfidence(starterHint: StarterHint) {
  if (!starterHint) {
    return 28;
  }
  return clamp(
    Math.round(
      42 +
        starterHint.sampleSize * 3.4 +
        (starterHint.expectedOuts - 15) * 1.5
    ),
    30,
    92
  );
}

export function buildMlbSourceNativeContext(args: {
  event: {
    name: string;
    startTime: Date;
    venue: string | null;
  };
  homeTeam: TeamRow;
  awayTeam: TeamRow;
  allPlayers: PlayerRow[];
  homeStarter: StarterHint;
  awayStarter: StarterHint;
  parkFactor: number;
}): MlbSourceNativeContext {
  const venueJoin = inferVenueWeatherJoinFromContext({
    league: "MLB",
    eventLabel: args.event.name,
    homeTeam: args.homeTeam.name,
    awayTeam: args.awayTeam.name,
    venue: args.event.venue,
    searchTexts: [args.homeTeam.abbreviation, args.awayTeam.abbreviation]
  });

  const homeLineup = buildLineupContext(args.homeTeam, args.allPlayers, args.event.startTime);
  const awayLineup = buildLineupContext(args.awayTeam, args.allPlayers, args.event.startTime);
  const homeBullpen = buildBullpenContext(args.homeTeam, args.allPlayers, args.homeStarter, args.event.startTime);
  const awayBullpen = buildBullpenContext(args.awayTeam, args.allPlayers, args.awayStarter, args.event.startTime);

  const home: MlbSourceNativeTeamContext = {
    teamId: args.homeTeam.id,
    teamName: args.homeTeam.name,
    abbreviation: args.homeTeam.abbreviation,
    starterName: args.homeStarter?.name ?? null,
    starterConfidence: buildStarterConfidence(args.homeStarter),
    lineupStrength: homeLineup.lineupStrength,
    lineupContactScore: homeLineup.lineupContactScore,
    lineupPowerScore: homeLineup.lineupPowerScore,
    lineupCertainty: homeLineup.lineupCertainty,
    topBats: homeLineup.topBats,
    bullpenFreshness: homeBullpen.bullpenFreshness,
    bullpenRisk: homeBullpen.bullpenRisk,
    bullpenCoverage: homeBullpen.bullpenCoverage,
    notes: [
      ...(args.homeStarter ? [`Starter inference centers on ${args.homeStarter.name}.`] : ["No stable probable starter was inferred from recent usage."]),
      ...homeLineup.notes.slice(0, 2),
      ...homeBullpen.notes.slice(0, 1)
    ]
  };

  const away: MlbSourceNativeTeamContext = {
    teamId: args.awayTeam.id,
    teamName: args.awayTeam.name,
    abbreviation: args.awayTeam.abbreviation,
    starterName: args.awayStarter?.name ?? null,
    starterConfidence: buildStarterConfidence(args.awayStarter),
    lineupStrength: awayLineup.lineupStrength,
    lineupContactScore: awayLineup.lineupContactScore,
    lineupPowerScore: awayLineup.lineupPowerScore,
    lineupCertainty: awayLineup.lineupCertainty,
    topBats: awayLineup.topBats,
    bullpenFreshness: awayBullpen.bullpenFreshness,
    bullpenRisk: awayBullpen.bullpenRisk,
    bullpenCoverage: awayBullpen.bullpenCoverage,
    notes: [
      ...(args.awayStarter ? [`Starter inference centers on ${args.awayStarter.name}.`] : ["No stable probable starter was inferred from recent usage."]),
      ...awayLineup.notes.slice(0, 2),
      ...awayBullpen.notes.slice(0, 1)
    ]
  };

  const altitudeBoost =
    venueJoin.altitudeFeet && venueJoin.altitudeFeet >= 3500
      ? 0.035
      : venueJoin.altitudeFeet && venueJoin.altitudeFeet >= 1200
        ? 0.012
        : 0;
  const retractableDrag = venueJoin.roofType === "RETRACTABLE" ? -0.006 : 0;
  const parkBoost = (args.parkFactor - 1) * 0.55;
  const baselineRunFactor = round(clamp(1 + altitudeBoost + retractableDrag + parkBoost, 0.92, 1.14), 3);

  const sourceCoverageScore = clamp(
    Math.round(
      (venueJoin.venueJoinStatus === "JOINED" ? 24 : venueJoin.venueJoinStatus === "PAYLOAD_ONLY" ? 12 : 4) +
      (venueJoin.stationJoinStatus === "JOINED" ? 18 : venueJoin.stationJoinStatus === "PAYLOAD_ONLY" ? 9 : 4) +
      (home.starterConfidence + away.starterConfidence) * 0.18 +
      (home.lineupCertainty === "HIGH" ? 12 : home.lineupCertainty === "MEDIUM" ? 8 : 4) +
      (away.lineupCertainty === "HIGH" ? 12 : away.lineupCertainty === "MEDIUM" ? 8 : 4) +
      (home.bullpenCoverage + away.bullpenCoverage) * 0.07
    ),
    20,
    98
  );

  const sourceSummary = [
    venueJoin.venueName ? `Venue mapped to ${venueJoin.venueName}${venueJoin.stationCode ? ` (${venueJoin.stationCode})` : ""}.` : "Venue mapping is still partial.",
    home.starterName && away.starterName
      ? `Probable starter layer inferred for both sides: ${away.starterName} vs ${home.starterName}.`
      : "Probable starter layer is incomplete on at least one side.",
    `Lineup certainty ${away.abbreviation} ${away.lineupCertainty.toLowerCase()} / ${home.abbreviation} ${home.lineupCertainty.toLowerCase()}.`,
    `Bullpen freshness ${away.abbreviation} ${away.bullpenFreshness} / ${home.abbreviation} ${home.bullpenFreshness}.`
  ];

  const matchupFlags = [
    venueJoin.windSensitivity === "HIGH" ? "Venue is one of the more weather-sensitive MLB run environments." : null,
    venueJoin.roofType === "RETRACTABLE" ? "Retractable roof status can materially swing weather relevance at this park." : null,
    venueJoin.altitudeFeet && venueJoin.altitudeFeet >= 3500 ? "Altitude materially amplifies carry and run variance." : null,
    Math.abs(home.lineupStrength - away.lineupStrength) >= 9
      ? `${home.lineupStrength > away.lineupStrength ? home.abbreviation : away.abbreviation} lineup profile is materially stronger on recent form.`
      : null,
    Math.abs(home.bullpenFreshness - away.bullpenFreshness) >= 12
      ? `${home.bullpenFreshness > away.bullpenFreshness ? home.abbreviation : away.abbreviation} bullpen looks materially fresher entering this game.`
      : null,
    away.lineupContactScore <= 42 || home.lineupContactScore <= 42
      ? "At least one lineup carries elevated swing-and-miss risk, which matters for pitcher strikeout props."
      : null
  ].filter((value): value is string => Boolean(value));

  return {
    league: "MLB",
    sourceCoverageScore,
    sourceSummary,
    matchupFlags,
    venue: {
      venueName: venueJoin.venueName ?? args.event.venue ?? null,
      stationCode: venueJoin.stationCode,
      stationName: venueJoin.stationName,
      roofType: venueJoin.roofType,
      weatherExposure: venueJoin.weatherExposure,
      altitudeFeet: venueJoin.altitudeFeet ?? null,
      windSensitivity: venueJoin.windSensitivity,
      parkFactor: round(args.parkFactor, 3),
      baselineRunFactor,
      notes: [...venueJoin.notes.slice(0, 2)]
    },
    home,
    away
  };
}
