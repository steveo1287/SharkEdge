import { getMlbLineupLock, type MlbLineupLock } from "@/services/simulation/mlb-lineup-locks";

export type MlbStarterSource = "mlb-statsapi" | "custom-feed" | "usage-inferred" | "missing";
export type MlbRoofStatus = "open" | "closed" | "unknown" | "not_applicable";

type InferredStarter = {
  playerId?: string | null;
  name: string | null;
  expectedOuts?: number | null;
  sampleSize?: number | null;
};

export type MlbGameContextAuthorityInput = {
  awayTeam: string;
  homeTeam: string;
  venue?: string | null;
  awayInferredStarter?: InferredStarter | null;
  homeInferredStarter?: InferredStarter | null;
  weatherRunFactor?: number | null;
  weatherLiveJoined?: boolean;
  weatherGameTimeForecastJoined?: boolean;
};

export type MlbCanonicalStarter = {
  name: string | null;
  playerId: string | null;
  throws: "L" | "R" | "unknown";
  confirmed: boolean;
  expectedOuts: number | null;
  source: MlbStarterSource;
};

export type MlbGameContextAuthority = {
  source: "mlb-game-context-authority-v1";
  gamePk: number | null;
  awayTeam: string;
  homeTeam: string;
  starters: {
    away: MlbCanonicalStarter;
    home: MlbCanonicalStarter;
  };
  lineups: {
    awayConfirmed: boolean;
    homeConfirmed: boolean;
    awayBattingOrder: string[];
    homeBattingOrder: string[];
    lateScratches: string[];
  };
  bullpen: {
    awayUsageL1: number;
    awayUsageL3: number;
    awayFatigueScore: number;
    homeUsageL1: number;
    homeUsageL3: number;
    homeFatigueScore: number;
  };
  weather: {
    liveJoined: boolean;
    gameTimeForecastJoined: boolean;
    roofStatus: MlbRoofStatus;
    runFactor: number;
  };
  confidence: {
    starter: number;
    lineup: number;
    bullpen: number;
    weather: number;
    total: number;
  };
  notes: string[];
  lock: MlbLineupLock;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cleanName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inferredStarterConfidence(starter: InferredStarter | null | undefined) {
  if (!starter?.name) return 0;
  const sample = typeof starter.sampleSize === "number" ? starter.sampleSize : 0;
  const outs = typeof starter.expectedOuts === "number" ? starter.expectedOuts : 15;
  return clamp(34 + sample * 3 + (outs - 15) * 1.2, 25, 72);
}

function canonicalStarter(args: {
  officialName?: string | null;
  officialThrows?: "L" | "R" | "unknown";
  officialLocked: boolean;
  lockSource: MlbLineupLock["source"];
  inferred?: InferredStarter | null;
}): MlbCanonicalStarter {
  const officialName = cleanName(args.officialName);
  const inferredName = cleanName(args.inferred?.name);

  if (officialName) {
    return {
      name: officialName,
      playerId: null,
      throws: args.officialThrows ?? "unknown",
      confirmed: args.officialLocked,
      expectedOuts: typeof args.inferred?.expectedOuts === "number" ? args.inferred.expectedOuts : null,
      source: args.lockSource === "real" ? "mlb-statsapi" : "custom-feed"
    };
  }

  if (inferredName) {
    return {
      name: inferredName,
      playerId: args.inferred?.playerId ?? null,
      throws: "unknown",
      confirmed: false,
      expectedOuts: typeof args.inferred?.expectedOuts === "number" ? args.inferred.expectedOuts : null,
      source: "usage-inferred"
    };
  }

  return {
    name: null,
    playerId: null,
    throws: "unknown",
    confirmed: false,
    expectedOuts: null,
    source: "missing"
  };
}

function confidenceFromAuthority(args: {
  lock: MlbLineupLock;
  awayStarter: MlbCanonicalStarter;
  homeStarter: MlbCanonicalStarter;
  awayInferredStarter?: InferredStarter | null;
  homeInferredStarter?: InferredStarter | null;
  weatherLiveJoined: boolean;
  weatherGameTimeForecastJoined: boolean;
}) {
  const officialStarterConfidence = args.lock.starterConfidence;
  const inferredStarterScore = Math.round(
    (inferredStarterConfidence(args.awayInferredStarter) + inferredStarterConfidence(args.homeInferredStarter)) / 2
  );
  const starter = args.awayStarter.source === "missing" || args.homeStarter.source === "missing"
    ? Math.min(officialStarterConfidence, inferredStarterScore, 35)
    : args.awayStarter.source === "usage-inferred" || args.homeStarter.source === "usage-inferred"
      ? clamp(Math.max(inferredStarterScore, 42), 35, 72)
      : clamp(officialStarterConfidence, 50, 100);

  const lineup = clamp(args.lock.lineupConfidence, 10, 100);
  const bullpen = clamp(
    100 - (args.lock.awayBullpenUsage.fatigueScore + args.lock.homeBullpenUsage.fatigueScore) * 7,
    30,
    96
  );
  const weather = args.weatherGameTimeForecastJoined ? 92 : args.weatherLiveJoined ? 78 : 48;
  const total = Math.round(starter * 0.36 + lineup * 0.28 + bullpen * 0.18 + weather * 0.18);

  return {
    starter: Math.round(starter),
    lineup: Math.round(lineup),
    bullpen: Math.round(bullpen),
    weather: Math.round(weather),
    total: clamp(total, 10, 100)
  };
}

export async function resolveMlbGameContextAuthority(
  input: MlbGameContextAuthorityInput
): Promise<MlbGameContextAuthority> {
  const lock = await getMlbLineupLock(input.awayTeam, input.homeTeam);
  const awayStarter = canonicalStarter({
    officialName: lock.awayStarterName,
    officialThrows: lock.awayStarterThrows,
    officialLocked: lock.awayStarterLocked,
    lockSource: lock.source,
    inferred: input.awayInferredStarter
  });
  const homeStarter = canonicalStarter({
    officialName: lock.homeStarterName,
    officialThrows: lock.homeStarterThrows,
    officialLocked: lock.homeStarterLocked,
    lockSource: lock.source,
    inferred: input.homeInferredStarter
  });
  const confidence = confidenceFromAuthority({
    lock,
    awayStarter,
    homeStarter,
    awayInferredStarter: input.awayInferredStarter,
    homeInferredStarter: input.homeInferredStarter,
    weatherLiveJoined: Boolean(input.weatherLiveJoined),
    weatherGameTimeForecastJoined: Boolean(input.weatherGameTimeForecastJoined)
  });
  const lateScratches = [...lock.awayLateScratches, ...lock.homeLateScratches];
  const notes = [
    awayStarter.source === "mlb-statsapi" && homeStarter.source === "mlb-statsapi"
      ? `Official MLB probable starters: ${awayStarter.name} vs ${homeStarter.name}.`
      : "At least one starter is not confirmed by the official MLB lock feed; confidence should be capped.",
    lock.awayLineupLocked && lock.homeLineupLocked
      ? "Official batting orders are posted for both teams."
      : "At least one batting order is still projected, so lineup volatility remains.",
    `Authority confidence starter/lineup/bullpen/weather: ${confidence.starter}/${confidence.lineup}/${confidence.bullpen}/${confidence.weather}.`,
    ...lock.notes.slice(0, 4)
  ];

  return {
    source: "mlb-game-context-authority-v1",
    gamePk: lock.gamePk ?? null,
    awayTeam: input.awayTeam,
    homeTeam: input.homeTeam,
    starters: {
      away: awayStarter,
      home: homeStarter
    },
    lineups: {
      awayConfirmed: lock.awayLineupLocked,
      homeConfirmed: lock.homeLineupLocked,
      awayBattingOrder: lock.awayBattingOrder,
      homeBattingOrder: lock.homeBattingOrder,
      lateScratches
    },
    bullpen: {
      awayUsageL1: lock.awayBullpenUsage.inningsLast1,
      awayUsageL3: lock.awayBullpenUsage.inningsLast3,
      awayFatigueScore: lock.awayBullpenUsage.fatigueScore,
      homeUsageL1: lock.homeBullpenUsage.inningsLast1,
      homeUsageL3: lock.homeBullpenUsage.inningsLast3,
      homeFatigueScore: lock.homeBullpenUsage.fatigueScore
    },
    weather: {
      liveJoined: Boolean(input.weatherLiveJoined),
      gameTimeForecastJoined: Boolean(input.weatherGameTimeForecastJoined),
      roofStatus: "unknown",
      runFactor: typeof input.weatherRunFactor === "number" && Number.isFinite(input.weatherRunFactor)
        ? input.weatherRunFactor
        : 1
    },
    confidence,
    notes,
    lock
  };
}
