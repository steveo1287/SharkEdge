import { projectNbaPlayerStat, type NbaPlayerStatProjection, type NbaPlayerStatProjectionInput } from "./nba-player-stat-projection";
import type { NbaStatKey } from "./nba-player-stat-profile";

export type NbaComboStatKey = "pr" | "pa" | "ra";
export type NbaFullStatKey = NbaStatKey | NbaComboStatKey;

export type NbaPropMarketLine = {
  line?: number | null;
  overOdds?: number | null;
  underOdds?: number | null;
};

export type NbaPlayerComboStatProjection = {
  playerId: string;
  playerName: string;
  statKey: NbaComboStatKey;
  mean: number;
  median: number;
  stdDev: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  marketLine: number | null;
  overProbability: number | null;
  underProbability: number | null;
  confidence: number;
  noBet: boolean;
  blockers: string[];
  warnings: string[];
  drivers: string[];
  components: NbaStatKey[];
};

export type NbaPlayerFullStatProjection = {
  playerId: string;
  playerName: string;
  team?: string | null;
  position?: string | null;
  projectedMinutes: number;
  confidence: number;
  noBet: boolean;
  blockers: string[];
  warnings: string[];
  stats: Record<NbaStatKey, NbaPlayerStatProjection>;
  combos: Record<NbaComboStatKey, NbaPlayerComboStatProjection>;
};

export type NbaPlayerFullStatProjectionInput = Omit<NbaPlayerStatProjectionInput, "statKey" | "marketLine" | "marketOddsOver" | "marketOddsUnder"> & {
  marketLinesByStat?: Partial<Record<NbaFullStatKey, NbaPropMarketLine>>;
};

const SINGLE_STAT_KEYS: NbaStatKey[] = ["points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers", "pra"];
const COMBO_COMPONENTS: Record<NbaComboStatKey, NbaStatKey[]> = {
  pr: ["points", "rebounds"],
  pa: ["points", "assists"],
  ra: ["rebounds", "assists"]
};
const COMBO_CORRELATION: Record<NbaComboStatKey, number> = {
  pr: 0.2,
  pa: 0.28,
  ra: 0.14
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x: number, mean: number, sd: number) {
  if (!Number.isFinite(sd) || sd <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / (sd * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}

function quantile(mean: number, sd: number, z: number) {
  return Math.max(0, mean + z * sd);
}

function marketFor(input: NbaPlayerFullStatProjectionInput, statKey: NbaFullStatKey) {
  return input.marketLinesByStat?.[statKey] ?? {};
}

function combineStdDev(left: NbaPlayerStatProjection, right: NbaPlayerStatProjection, correlation: number) {
  const variance = left.stdDev ** 2 + right.stdDev ** 2 + 2 * correlation * left.stdDev * right.stdDev;
  return Math.sqrt(Math.max(0.1, variance));
}

function comboProjection(args: {
  statKey: NbaComboStatKey;
  playerId: string;
  playerName: string;
  components: NbaStatKey[];
  stats: Record<NbaStatKey, NbaPlayerStatProjection>;
  market?: NbaPropMarketLine;
}): NbaPlayerComboStatProjection {
  const [leftKey, rightKey] = args.components;
  const left = args.stats[leftKey];
  const right = args.stats[rightKey];
  const rawMean = left.mean + right.mean;
  const marketLine = typeof args.market?.line === "number" && Number.isFinite(args.market.line) ? args.market.line : null;
  const marketBlend = marketLine === null ? 0 : clamp(0.22 + (1 - Math.min(left.confidence, right.confidence)) * 0.25, 0.22, 0.45);
  const mean = rawMean * (1 - marketBlend) + (marketLine ?? rawMean) * marketBlend;
  const stdDev = combineStdDev(left, right, COMBO_CORRELATION[args.statKey]);
  const overProbability = marketLine === null ? null : round(1 - normalCdf(marketLine, mean, stdDev), 4);
  const underProbability = overProbability === null ? null : round(1 - overProbability, 4);
  const blockers = [...left.blockers, ...right.blockers];
  const warnings = [...left.warnings, ...right.warnings];
  if (marketLine === null) warnings.push("missing market line");
  const confidence = clamp((left.confidence + right.confidence) / 2 - (marketLine === null ? 0.02 : 0), 0, 1);

  return {
    playerId: args.playerId,
    playerName: args.playerName,
    statKey: args.statKey,
    mean: round(mean, 3),
    median: round(mean, 3),
    stdDev: round(stdDev, 3),
    p10: round(quantile(mean, stdDev, -1.2816), 3),
    p25: round(quantile(mean, stdDev, -0.6745), 3),
    p75: round(quantile(mean, stdDev, 0.6745), 3),
    p90: round(quantile(mean, stdDev, 1.2816), 3),
    marketLine,
    overProbability,
    underProbability,
    confidence: round(confidence, 3),
    noBet: blockers.length > 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    drivers: [
      `${leftKey} mean ${left.mean}`,
      `${rightKey} mean ${right.mean}`,
      `${round(COMBO_CORRELATION[args.statKey], 3)} combo correlation`,
      `${round(marketBlend, 3)} market blend`
    ],
    components: args.components
  };
}

export function projectNbaPlayerFullStatProfile(input: NbaPlayerFullStatProjectionInput): NbaPlayerFullStatProjection {
  const stats = Object.fromEntries(
    SINGLE_STAT_KEYS.map((statKey) => {
      const market = marketFor(input, statKey);
      return [statKey, projectNbaPlayerStat({
        ...input,
        statKey,
        marketLine: market.line ?? null,
        marketOddsOver: market.overOdds ?? null,
        marketOddsUnder: market.underOdds ?? null
      })];
    })
  ) as Record<NbaStatKey, NbaPlayerStatProjection>;

  const combos = Object.fromEntries(
    (Object.keys(COMBO_COMPONENTS) as NbaComboStatKey[]).map((statKey) => [
      statKey,
      comboProjection({
        statKey,
        playerId: input.playerId,
        playerName: input.playerName,
        components: COMBO_COMPONENTS[statKey],
        stats,
        market: marketFor(input, statKey)
      })
    ])
  ) as Record<NbaComboStatKey, NbaPlayerComboStatProjection>;

  const all = [...Object.values(stats), ...Object.values(combos)];
  const blockers = [...new Set(all.flatMap((projection) => projection.blockers))];
  const warnings = [...new Set(all.flatMap((projection) => projection.warnings))];
  const projectedMinutes = stats.points.minutes.projectedMinutes;
  const confidence = all.length ? all.reduce((sum, projection) => sum + projection.confidence, 0) / all.length : 0;

  return {
    playerId: input.playerId,
    playerName: input.playerName,
    team: input.team ?? null,
    position: input.position ?? null,
    projectedMinutes: round(projectedMinutes, 3),
    confidence: round(confidence, 3),
    noBet: blockers.length > 0,
    blockers,
    warnings,
    stats,
    combos
  };
}
