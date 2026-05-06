import type { MlbSourceNativeContext } from "@/services/modeling/mlb-source-native-context";

type LockStatus = "CONFIRMED" | "PROBABLE" | "INFERRED" | "UNKNOWN";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type ThrowHand = "L" | "R" | null;

type MoneylineSnapshot = {
  bookKey?: string | null;
  bookName?: string | null;
  homePrice?: number | null;
  awayPrice?: number | null;
  updatedAt?: string | null;
};

type ConfirmedLineupInput = {
  status?: LockStatus | null;
  hitters?: string[] | null;
  missingProjectedStarters?: string[] | null;
  source?: string | null;
  updatedAt?: string | null;
};

type StarterInput = {
  status?: LockStatus | null;
  name?: string | null;
  throws?: ThrowHand;
  source?: string | null;
  updatedAt?: string | null;
};

type TeamTierInputs = {
  lineup?: ConfirmedLineupInput | null;
  starter?: StarterInput | null;
  bullpen?: {
    closerAvailable?: boolean | null;
    setupAvailable?: boolean | null;
    leverageScore?: number | null;
    longReliefCoverage?: number | null;
    lateInningRisk?: RiskLevel | null;
  } | null;
  splits?: {
    lineupVsLeftScore?: number | null;
    lineupVsRightScore?: number | null;
  } | null;
  pitchMatchup?: {
    starterPitchMix?: Record<string, number> | null;
    lineupPitchTypeRunValues?: Record<string, number> | null;
    coverageScore?: number | null;
  } | null;
  defense?: {
    defensiveRunPreventionScore?: number | null;
    infieldDefenseScore?: number | null;
    outfieldDefenseScore?: number | null;
  } | null;
  catcher?: {
    framingScore?: number | null;
    runGameScore?: number | null;
  } | null;
  fatigue?: {
    travelFatigueScore?: number | null;
    restRecoveryScore?: number | null;
  } | null;
  umpire?: {
    zoneRunImpact?: number | null;
    strikeoutImpact?: number | null;
  } | null;
  weather?: {
    trajectoryRunImpact?: number | null;
    trajectoryConfidence?: number | null;
  } | null;
};

export type MlbTierNeedsContextInput = {
  home?: TeamTierInputs | null;
  away?: TeamTierInputs | null;
  market?: {
    openingMoneyline?: MoneylineSnapshot[] | null;
    currentMoneyline?: MoneylineSnapshot[] | null;
    sharpBookKeys?: string[] | null;
    closingMoneyline?: MoneylineSnapshot[] | null;
    ensembleHomeProbability?: number | null;
    bayesianPriorHomeProbability?: number | null;
    modelAgreementScore?: number | null;
  } | null;
};

type EnrichedTeam = MlbSourceNativeContext["home"] & {
  lineupStatus: LockStatus;
  lineupLockScore: number;
  confirmedHitters: string[];
  missingProjectedStarters: string[];
  lineupSource: string | null;
  lineupUpdatedAt: string | null;
  starterStatus: LockStatus;
  starterLockScore: number;
  starterSource: string | null;
  starterUpdatedAt: string | null;
  opposingStarterThrows: ThrowHand;
  bullpenLeverageScore: number;
  closerAvailable: boolean | null;
  setupAvailable: boolean | null;
  longReliefCoverage: number;
  lateInningRisk: RiskLevel;
  lineupVsLeftScore: number | null;
  lineupVsRightScore: number | null;
  platoonEdge: number;
  starterPitchMix: Record<string, number> | null;
  lineupPitchTypeRunValues: Record<string, number> | null;
  pitchTypeMatchupEdge: number;
  pitchTypeCoverageScore: number;
  defensiveRunPreventionScore: number;
  infieldDefenseScore: number;
  outfieldDefenseScore: number;
  catcherFramingScore: number;
  catcherRunGameScore: number;
  travelFatigueScore: number;
  restRecoveryScore: number;
  umpireZoneRunImpact: number;
  umpireStrikeoutImpact: number;
  weatherTrajectoryRunImpact: number;
  weatherTrajectoryConfidence: number;
};

type EnrichedContext = MlbSourceNativeContext & {
  home: EnrichedTeam;
  away: EnrichedTeam;
  market: {
    openHomeProbability: number | null;
    currentHomeProbability: number | null;
    sharpBookHomeProbability: number | null;
    consensusHomeProbability: number | null;
    closingHomeProbability: number | null;
    marketImpliedHomeProbability: number | null;
    marketMoveEdge: number | null;
    sharpBookWeight: number | null;
    closingLineValueScore: number | null;
    steamMoveScore: number | null;
    reverseLineMoveScore: number | null;
    liquidityScore: number | null;
    modelAgreementScore: number | null;
    ensembleHomeProbability: number | null;
    bayesianPriorHomeProbability: number | null;
    marketCoverageScore: number | null;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function probability(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) return clamp(value / 100, 0.01, 0.99);
  return clamp(value, 0.01, 0.99);
}

function americanToProbability(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price) || price === 0) return null;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function deVigHomeProbability(samples: MoneylineSnapshot[] | null | undefined) {
  if (!samples?.length) return null;
  const probabilities = samples.map((sample) => {
    const home = americanToProbability(sample.homePrice);
    const away = americanToProbability(sample.awayPrice);
    if (home == null || away == null || home + away <= 0) return null;
    return home / (home + away);
  });
  return probability(average(probabilities));
}

function sharpHomeProbability(samples: MoneylineSnapshot[] | null | undefined, sharpBookKeys: string[] | null | undefined) {
  if (!samples?.length || !sharpBookKeys?.length) return null;
  const sharpSet = new Set(sharpBookKeys.map((key) => key.toLowerCase()));
  return deVigHomeProbability(samples.filter((sample) => sample.bookKey && sharpSet.has(sample.bookKey.toLowerCase())));
}

function lockScore(status: LockStatus, fallback: number) {
  if (status === "CONFIRMED") return 94;
  if (status === "PROBABLE") return 80;
  if (status === "INFERRED") return fallback;
  return 20;
}

function lineupStatusFromInput(input: ConfirmedLineupInput | null | undefined, fallbackCertainty: "HIGH" | "MEDIUM" | "LOW"): LockStatus {
  if (input?.status) return input.status;
  if (input?.hitters?.length && input.hitters.length >= 9) return "CONFIRMED";
  if (fallbackCertainty === "HIGH") return "PROBABLE";
  if (fallbackCertainty === "MEDIUM") return "INFERRED";
  return "UNKNOWN";
}

function starterStatusFromInput(input: StarterInput | null | undefined, fallbackConfidence: number): LockStatus {
  if (input?.status) return input.status;
  if (input?.name) return "PROBABLE";
  if (fallbackConfidence >= 76) return "PROBABLE";
  if (fallbackConfidence >= 35) return "INFERRED";
  return "UNKNOWN";
}

function pitchTypeEdge(input: TeamTierInputs["pitchMatchup"]) {
  const pitchMix = input?.starterPitchMix ?? null;
  const runValues = input?.lineupPitchTypeRunValues ?? null;
  if (!pitchMix || !runValues) return 0;
  let totalWeight = 0;
  let weighted = 0;
  for (const [pitchType, mixShare] of Object.entries(pitchMix)) {
    if (!Number.isFinite(mixShare)) continue;
    const runValue = runValues[pitchType];
    if (!Number.isFinite(runValue)) continue;
    const weight = Math.max(0, Number(mixShare));
    weighted += weight * Number(runValue);
    totalWeight += weight;
  }
  if (!totalWeight) return 0;
  return clamp(weighted / totalWeight / 10, -1, 1);
}

function platoonEdge(input: TeamTierInputs["splits"], opposingThrows: ThrowHand) {
  if (!opposingThrows) return 0;
  const target = opposingThrows === "L" ? input?.lineupVsLeftScore : input?.lineupVsRightScore;
  if (typeof target !== "number" || !Number.isFinite(target)) return 0;
  return clamp((target - 50) / 50, -1, 1);
}

function enrichTeam(args: {
  base: MlbSourceNativeContext["home"];
  input: TeamTierInputs | null | undefined;
  opposingStarterThrows: ThrowHand;
}): EnrichedTeam {
  const lineupStatus = lineupStatusFromInput(args.input?.lineup, args.base.lineupCertainty);
  const starterStatus = starterStatusFromInput(args.input?.starter, args.base.starterConfidence);
  const bullpenLeverageScore = clamp(args.input?.bullpen?.leverageScore ?? Math.round(args.base.bullpenFreshness * 0.55 + args.base.bullpenCoverage * 0.3 + (args.base.bullpenRisk === "LOW" ? 12 : args.base.bullpenRisk === "MEDIUM" ? 4 : -8)), 0, 100);
  const longReliefCoverage = clamp(args.input?.bullpen?.longReliefCoverage ?? Math.round(args.base.bullpenCoverage * 0.72 + args.base.bullpenFreshness * 0.28), 0, 100);
  const lateInningRisk = args.input?.bullpen?.lateInningRisk ?? (bullpenLeverageScore >= 68 ? "LOW" : bullpenLeverageScore >= 48 ? "MEDIUM" : "HIGH");
  const pitchCoverage = clamp(args.input?.pitchMatchup?.coverageScore ?? 0, 0, 100);

  return {
    ...args.base,
    lineupStatus,
    lineupLockScore: lockScore(lineupStatus, args.base.lineupCertainty === "MEDIUM" ? 58 : 48),
    confirmedHitters: args.input?.lineup?.hitters ?? [],
    missingProjectedStarters: args.input?.lineup?.missingProjectedStarters ?? [],
    lineupSource: args.input?.lineup?.source ?? null,
    lineupUpdatedAt: args.input?.lineup?.updatedAt ?? null,
    starterStatus,
    starterLockScore: lockScore(starterStatus, clamp(args.base.starterConfidence, 30, 76)),
    starterSource: args.input?.starter?.source ?? null,
    starterUpdatedAt: args.input?.starter?.updatedAt ?? null,
    opposingStarterThrows: args.opposingStarterThrows,
    bullpenLeverageScore,
    closerAvailable: args.input?.bullpen?.closerAvailable ?? null,
    setupAvailable: args.input?.bullpen?.setupAvailable ?? null,
    longReliefCoverage,
    lateInningRisk,
    lineupVsLeftScore: args.input?.splits?.lineupVsLeftScore ?? null,
    lineupVsRightScore: args.input?.splits?.lineupVsRightScore ?? null,
    platoonEdge: platoonEdge(args.input?.splits, args.opposingStarterThrows),
    starterPitchMix: args.input?.pitchMatchup?.starterPitchMix ?? null,
    lineupPitchTypeRunValues: args.input?.pitchMatchup?.lineupPitchTypeRunValues ?? null,
    pitchTypeMatchupEdge: pitchTypeEdge(args.input?.pitchMatchup),
    pitchTypeCoverageScore: pitchCoverage,
    defensiveRunPreventionScore: clamp(args.input?.defense?.defensiveRunPreventionScore ?? 50, 0, 100),
    infieldDefenseScore: clamp(args.input?.defense?.infieldDefenseScore ?? args.input?.defense?.defensiveRunPreventionScore ?? 50, 0, 100),
    outfieldDefenseScore: clamp(args.input?.defense?.outfieldDefenseScore ?? args.input?.defense?.defensiveRunPreventionScore ?? 50, 0, 100),
    catcherFramingScore: clamp(args.input?.catcher?.framingScore ?? 50, 0, 100),
    catcherRunGameScore: clamp(args.input?.catcher?.runGameScore ?? 50, 0, 100),
    travelFatigueScore: clamp(args.input?.fatigue?.travelFatigueScore ?? 50, 0, 100),
    restRecoveryScore: clamp(args.input?.fatigue?.restRecoveryScore ?? 50, 0, 100),
    umpireZoneRunImpact: clamp(args.input?.umpire?.zoneRunImpact ?? 0, -1, 1),
    umpireStrikeoutImpact: clamp(args.input?.umpire?.strikeoutImpact ?? 0, -1, 1),
    weatherTrajectoryRunImpact: clamp(args.input?.weather?.trajectoryRunImpact ?? 0, -1, 1),
    weatherTrajectoryConfidence: clamp(args.input?.weather?.trajectoryConfidence ?? 0, 0, 100)
  };
}

function buildMarketContext(input: MlbTierNeedsContextInput["market"]): EnrichedContext["market"] {
  const openHomeProbability = deVigHomeProbability(input?.openingMoneyline);
  const currentHomeProbability = deVigHomeProbability(input?.currentMoneyline);
  const sharpBookHomeProbability = sharpHomeProbability(input?.currentMoneyline, input?.sharpBookKeys);
  const consensusHomeProbability = currentHomeProbability;
  const closingHomeProbability = deVigHomeProbability(input?.closingMoneyline);
  const marketImpliedHomeProbability = currentHomeProbability ?? consensusHomeProbability;
  const marketMoveEdge = openHomeProbability != null && currentHomeProbability != null ? round(currentHomeProbability - openHomeProbability, 4) : null;
  const currentBookCount = input?.currentMoneyline?.length ?? 0;
  const sharpBookCount = input?.sharpBookKeys?.length ?? 0;
  const liquidityScore = clamp(Math.round(currentBookCount * 9 + sharpBookCount * 6), 0, 100);
  const sharpBookWeight = sharpBookHomeProbability == null ? null : clamp(0.35 + sharpBookCount * 0.08, 0.35, 0.8);
  const closingLineValueScore = closingHomeProbability != null && currentHomeProbability != null ? clamp(Math.round(50 + (closingHomeProbability - currentHomeProbability) * 500), 0, 100) : null;
  const steamMoveScore = marketMoveEdge == null ? null : clamp(Math.round(50 + marketMoveEdge * 500), 0, 100);
  const reverseLineMoveScore = marketMoveEdge == null ? null : clamp(Math.round(50 - marketMoveEdge * 400), 0, 100);
  const marketCoverageScore = clamp(
    Math.round(
      (openHomeProbability != null ? 10 : 0) +
        (currentHomeProbability != null ? 24 : 0) +
        (sharpBookHomeProbability != null ? 22 : 0) +
        (closingHomeProbability != null ? 14 : 0) +
        liquidityScore * 0.18 +
        (input?.modelAgreementScore ?? 0) * 0.12
    ),
    0,
    100
  );

  return {
    openHomeProbability,
    currentHomeProbability,
    sharpBookHomeProbability,
    consensusHomeProbability,
    closingHomeProbability,
    marketImpliedHomeProbability,
    marketMoveEdge,
    sharpBookWeight,
    closingLineValueScore,
    steamMoveScore,
    reverseLineMoveScore,
    liquidityScore,
    modelAgreementScore: input?.modelAgreementScore ?? null,
    ensembleHomeProbability: probability(input?.ensembleHomeProbability),
    bayesianPriorHomeProbability: probability(input?.bayesianPriorHomeProbability) ?? marketImpliedHomeProbability,
    marketCoverageScore
  };
}

export function enrichMlbSourceNativeContextWithTierNeeds(
  base: MlbSourceNativeContext,
  input: MlbTierNeedsContextInput = {}
): EnrichedContext {
  const homeStarterThrows = input.home?.starter?.throws ?? null;
  const awayStarterThrows = input.away?.starter?.throws ?? null;
  const home = enrichTeam({ base: base.home, input: input.home, opposingStarterThrows: awayStarterThrows });
  const away = enrichTeam({ base: base.away, input: input.away, opposingStarterThrows: homeStarterThrows });

  return {
    ...base,
    home,
    away,
    sourceSummary: [
      ...base.sourceSummary,
      `Tier needs wired: lineup ${away.lineupStatus}/${home.lineupStatus}, starters ${away.starterStatus}/${home.starterStatus}, market coverage ${buildMarketContext(input.market).marketCoverageScore}.`
    ],
    matchupFlags: [
      ...base.matchupFlags,
      home.platoonEdge || away.platoonEdge ? "Platoon split signal is available for at least one lineup." : null,
      home.pitchTypeMatchupEdge || away.pitchTypeMatchupEdge ? "Pitch-type matchup signal is available for at least one lineup." : null,
      buildMarketContext(input.market).sharpBookHomeProbability != null ? "Sharp-book market signal is available for this matchup." : null
    ].filter((value): value is string => Boolean(value)),
    market: buildMarketContext(input.market)
  };
}
