import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { NbaPlayerProfile, NbaTeamPlayerProfileSummary } from "@/services/simulation/nba-player-profiles";
import { compareNbaProfilesReal } from "@/services/simulation/nba-team-analytics";
import { getNbaDecisionContext } from "@/services/simulation/nba-decision-context";
import { getNbaSynergyContext } from "@/services/simulation/nba-synergy-context";

type TeamSide = "home" | "away";
type PropStatKey = "points" | "rebounds" | "assists" | "threes";

type PropMarketLine = {
  playerName: string;
  stat: PropStatKey;
  line: number;
  oddsOver: number | null;
  oddsUnder: number | null;
  source: string;
};

type PropHitProbability = {
  line: number;
  overProbability: number;
  underProbability: number;
  oddsOver: number | null;
  oddsUnder: number | null;
  edgeToLine: number;
  recommendedSide: "OVER" | "UNDER" | "PASS";
  source: string;
};

type SimInput = {
  homeSummary: NbaTeamPlayerProfileSummary;
  awaySummary: NbaTeamPlayerProfileSummary;
  projectedTotal: number;
  volatilityIndex: number;
  confidence: number;
  seedKey: string;
};

export type NbaPlayerStatProjection = {
  playerName: string;
  teamName: string;
  teamSide: TeamSide;
  status: string;
  projectedMinutes: number;
  projectedPoints: number;
  projectedRebounds: number;
  projectedAssists: number;
  projectedThrees: number;
  floor: { points: number; rebounds: number; assists: number; threes: number };
  median: { points: number; rebounds: number; assists: number; threes: number };
  ceiling: { points: number; rebounds: number; assists: number; threes: number };
  confidence: number;
  simulationRuns: number;
  propHitProbabilities: Partial<Record<PropStatKey, PropHitProbability>>;
  whyLikely: string[];
  whyNotLikely: string[];
  source: string;
};

type CalibratedPlayerContext = {
  player: NbaPlayerProfile;
  teamSide: TeamSide;
  rank: number;
  minutes: number;
  scoringShare: number;
  teamProjectedPoints: number;
  projectedTotal: number;
  volatilityIndex: number;
  modelConfidence: number;
  opponentDefenseRating: number;
  paceAverage: number;
  decisionPaceBias: number;
  synergyPaceBias: number;
  teammateCreationSupport: number;
  opponentRimDeterrenceEdge: number;
  opponentPointOfAttackEdge: number;
  marketLines: Partial<Record<PropStatKey, PropMarketLine>> | undefined;
  seedKey: string;
};

const DEFAULT_RUNS = 2_000;
const PROP_CACHE_KEY = "nba:player-prop-lines:v3";
const PROP_CACHE_TTL_SECONDS = 60 * 3;

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number, digits = 1) { return Number(value.toFixed(digits)); }
function normalizeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function toNumber(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return null; }
function rowsFromBody(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["rows", "data", "props", "lines", "playerProps"]) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
  }
  return [];
}
function hashString(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function mulberry32(seed: number) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normalSample(next: () => number) { const u1 = Math.max(1e-9, next()); const u2 = Math.max(1e-9, next()); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
function quantile(values: number[], q: number) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))); return sorted[index] ?? 0; }

function toPropStatKey(value: unknown): PropStatKey | null {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("point")) return "points";
  if (text.includes("rebound")) return "rebounds";
  if (text.includes("assist")) return "assists";
  if (text.includes("three") || text.includes("3pm") || text.includes("fg3")) return "threes";
  return null;
}

function normalizeLineRow(row: Record<string, unknown>): PropMarketLine | null {
  const playerName = String(row.playerName ?? row.player ?? row.name ?? row.athlete ?? "").trim();
  if (!playerName) return null;
  const stat = toPropStatKey(row.stat ?? row.statKey ?? row.market ?? row.marketType ?? row.propType);
  const line = toNumber(row.line ?? row.marketLine ?? row.pointsLine ?? row.propLine);
  if (!stat || line == null) return null;
  return {
    playerName,
    stat,
    line,
    oddsOver: toNumber(row.oddsOver ?? row.overOdds ?? row.priceOver),
    oddsUnder: toNumber(row.oddsUnder ?? row.underOdds ?? row.priceUnder),
    source: String(row.source ?? "external_prop_feed")
  };
}

async function fetchPropLines() {
  const cached = await readHotCache<Record<string, Partial<Record<PropStatKey, PropMarketLine>>>>(PROP_CACHE_KEY);
  if (cached) return cached;
  const url = process.env.NBA_PLAYER_PROP_LINES_URL?.trim() || process.env.PLAYER_PROP_LINES_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const map: Record<string, Partial<Record<PropStatKey, PropMarketLine>>> = {};
    for (const row of rowsFromBody(await response.json())) {
      const line = normalizeLineRow(row);
      if (!line) continue;
      const key = normalizeName(line.playerName);
      map[key] = { ...(map[key] ?? {}), [line.stat]: line };
    }
    if (Object.keys(map).length) await writeHotCache(PROP_CACHE_KEY, map, PROP_CACHE_TTL_SECONDS);
    return Object.keys(map).length ? map : null;
  } catch {
    return null;
  }
}

function statusAvailability(status: string) {
  const value = status.toLowerCase();
  if (value === "out") return 0;
  if (value === "doubtful") return 0.35;
  if (value === "questionable") return 0.72;
  if (value === "unknown") return 0.88;
  return 1;
}

function rankMinuteTarget(rank: number) { return [35, 33.5, 31, 28.5, 26, 22, 18.5, 15, 11.5, 8.5, 6][rank] ?? 4; }
function rankMinuteCap(rank: number) { return [38, 37, 35, 33, 31, 27, 24, 20, 16, 12, 8][rank] ?? 6; }
function rankUsageCap(rank: number) { return [33, 29, 25, 22, 19, 16, 13, 11, 9, 7.5, 6][rank] ?? 5; }
function roleScore(player: NbaPlayerProfile) { return player.projectedMinutes * 0.7 + player.usageRate * 0.85 + player.offensiveEpm * 3 + player.assistRate * 0.08 + player.reboundRate * 0.04; }

function normalizedRotation(summary: NbaTeamPlayerProfileSummary) {
  const active = summary.players
    .filter((player) => statusAvailability(player.status) > 0)
    .sort((a, b) => roleScore(b) - roleScore(a))
    .slice(0, 11)
    .map((player, rank) => {
      const sourceBlend = player.source === "real" ? 0.62 : 0.38;
      const rawMinutes = player.projectedMinutes * sourceBlend + rankMinuteTarget(rank) * (1 - sourceBlend);
      const minutes = clamp(rawMinutes * statusAvailability(player.status), 0, rankMinuteCap(rank));
      const usageRate = clamp(player.usageRate, 3, rankUsageCap(rank));
      return { player: { ...player, usageRate }, rank, minutes };
    });

  const target = 240;
  let total = active.reduce((sum, row) => sum + row.minutes, 0);
  if (total > 0) {
    active.forEach((row) => { row.minutes = Math.min(rankMinuteCap(row.rank), row.minutes * target / total); });
    for (let pass = 0; pass < 5; pass += 1) {
      total = active.reduce((sum, row) => sum + row.minutes, 0);
      const deficit = target - total;
      if (deficit <= 0.25) break;
      const expandable = active.filter((row) => row.minutes < rankMinuteCap(row.rank) - 0.1);
      if (!expandable.length) break;
      expandable.forEach((row) => { row.minutes = Math.min(rankMinuteCap(row.rank), row.minutes + deficit / expandable.length); });
    }
  }
  return active;
}

function scoringWeight(context: CalibratedPlayerContext) {
  const p = context.player;
  const efficiency = clamp(0.88 + (p.trueShooting - 56) / 120 + p.offensiveEpm / 55, 0.76, 1.18);
  const shotProfile = clamp(1 + p.rimPressure * 0.012 + p.threePointGravity * 0.01, 0.9, 1.18);
  return Math.max(0.01, context.minutes * p.usageRate * efficiency * shotProfile);
}

function per36PointCap(context: CalibratedPlayerContext) {
  const usage = context.player.usageRate;
  const rankCap = [34, 30, 26, 22, 19, 16, 13, 11, 9, 7][context.rank] ?? 6;
  const usageCap = usage < 10 ? 8 : usage < 14 ? 11 : usage < 18 ? 15 : usage < 22 ? 20 : usage < 27 ? 26 : 33;
  const sourceCap = context.player.source === "synthetic" ? 22 : 35;
  return Math.min(rankCap, usageCap, sourceCap);
}

function buildOutcomes(mean: number, sigma: number, seed: string) {
  const next = mulberry32(hashString(seed));
  const values: number[] = [];
  for (let i = 0; i < DEFAULT_RUNS; i += 1) values.push(Math.max(0, mean + normalSample(next) * sigma));
  return values;
}

function probabilityOver(values: number[], line: number) { return values.length ? values.filter((value) => value > line).length / values.length : 0.5; }
function buildPropProb(stat: PropStatKey, outcomes: number[], projectedValue: number, marketLines: Partial<Record<PropStatKey, PropMarketLine>> | undefined): PropHitProbability | undefined {
  const market = marketLines?.[stat];
  if (!market) return undefined;
  const overProbability = clamp(probabilityOver(outcomes, market.line), 0.001, 0.999);
  const edge = projectedValue - market.line;
  const passBand = stat === "points" ? 1.35 : 0.75;
  const recommendedSide = Math.abs(edge) < passBand || Math.abs(overProbability - 0.5) < 0.07 ? "PASS" : overProbability > 0.5 ? "OVER" : "UNDER";
  return { line: market.line, overProbability: round(overProbability, 3), underProbability: round(1 - overProbability, 3), oddsOver: market.oddsOver, oddsUnder: market.oddsUnder, edgeToLine: round(edge, 2), recommendedSide, source: market.source };
}

function confidenceFor(context: CalibratedPlayerContext) {
  const dataPenalty = context.player.source === "synthetic" ? 0.14 : 0;
  const marketBoost = context.marketLines?.points ? 0.06 : 0;
  return clamp(context.modelConfidence * 0.7 + context.minutes / 220 + context.player.usageRate / 600 + marketBoost - dataPenalty - (context.volatilityIndex - 1) * 0.08, 0.2, 0.86);
}

function projectPlayer(context: CalibratedPlayerContext): NbaPlayerStatProjection {
  const rawPoints = context.scoringShare * context.teamProjectedPoints;
  const market = context.marketLines?.points?.line;
  const marketAnchored = market == null ? rawPoints : rawPoints * 0.78 + market * 0.22;
  const paceFactor = clamp((context.paceAverage / 99) * (1 + context.decisionPaceBias * 0.014) * (1 + context.synergyPaceBias * 0.018) * (1 + (context.projectedTotal - 224) / 650), 0.9, 1.1);
  const defenseFactor = clamp(1 - ((context.opponentDefenseRating - 113) / 120) + context.opponentPointOfAttackEdge * 0.012 + context.opponentRimDeterrenceEdge * 0.012, 0.9, 1.08);
  const pointCap = per36PointCap(context) * context.minutes / 36;
  const points = clamp(marketAnchored * paceFactor * defenseFactor, 0, pointCap);
  const rebounds = clamp(context.minutes / 36 * context.player.reboundRate * 0.5 * clamp(1 + context.opponentRimDeterrenceEdge * 0.015, 0.92, 1.08), 0, 17);
  const assists = clamp(context.minutes / 36 * context.player.assistRate * 0.31 * clamp(1 + context.teammateCreationSupport / 120, 0.92, 1.1), 0, 15);
  const threes = clamp(context.minutes / 36 * context.player.threePointGravity * 0.2 * clamp(1 + context.synergyPaceBias * 0.01, 0.92, 1.08), 0, 7);

  const seed = `${context.seedKey}:${context.teamSide}:${context.player.playerName}`;
  const pointOutcomes = buildOutcomes(points, clamp(2 + Math.sqrt(points) * 0.82 + (context.volatilityIndex - 1) * 0.9, 2, 8.25), `${seed}:pts`);
  const reboundOutcomes = buildOutcomes(rebounds, clamp(1 + Math.sqrt(rebounds) * 0.52, 0.9, 4.5), `${seed}:reb`);
  const assistOutcomes = buildOutcomes(assists, clamp(0.8 + Math.sqrt(assists) * 0.48, 0.75, 4), `${seed}:ast`);
  const threeOutcomes = buildOutcomes(threes, clamp(0.45 + Math.sqrt(threes) * 0.34, 0.4, 2.4), `${seed}:3pm`);
  const confidence = confidenceFor(context);
  const likely = [
    context.marketLines?.points ? `Points projection market-anchored to ${context.marketLines.points.line}.` : "Projection is team-total allocated by role, minutes, usage, and efficiency.",
    context.player.source === "real" ? "Real player profile is active." : "Fallback profile is capped and confidence-discounted.",
    context.minutes >= 31 && context.player.usageRate >= 21 ? "Minutes and usage support above-average scoring load." : "Role/usage cap prevents inflated scoring load."
  ];
  const unlikely = [
    context.player.source === "synthetic" ? "Synthetic player feed limits trust until real props/player data arrive." : null,
    context.player.usageRate < 17 && points >= 15 ? "Usage does not justify a large scoring projection without market support." : null,
    context.volatilityIndex >= 1.45 ? "Game volatility is elevated." : null,
    context.player.status !== "available" ? `Availability flag: ${context.player.status}.` : null
  ].filter((row): row is string => Boolean(row));

  return {
    playerName: context.player.playerName,
    teamName: context.player.teamName,
    teamSide: context.teamSide,
    status: context.player.status,
    projectedMinutes: round(context.minutes, 1),
    projectedPoints: round(points, 1),
    projectedRebounds: round(rebounds, 1),
    projectedAssists: round(assists, 1),
    projectedThrees: round(threes, 1),
    floor: { points: round(quantile(pointOutcomes, 0.1), 1), rebounds: round(quantile(reboundOutcomes, 0.1), 1), assists: round(quantile(assistOutcomes, 0.1), 1), threes: round(quantile(threeOutcomes, 0.1), 1) },
    median: { points: round(quantile(pointOutcomes, 0.5), 1), rebounds: round(quantile(reboundOutcomes, 0.5), 1), assists: round(quantile(assistOutcomes, 0.5), 1), threes: round(quantile(threeOutcomes, 0.5), 1) },
    ceiling: { points: round(quantile(pointOutcomes, 0.9), 1), rebounds: round(quantile(reboundOutcomes, 0.9), 1), assists: round(quantile(assistOutcomes, 0.9), 1), threes: round(quantile(threeOutcomes, 0.9), 1) },
    confidence: round(confidence, 3),
    simulationRuns: DEFAULT_RUNS,
    propHitProbabilities: { points: buildPropProb("points", pointOutcomes, points, context.marketLines), rebounds: buildPropProb("rebounds", reboundOutcomes, rebounds, context.marketLines), assists: buildPropProb("assists", assistOutcomes, assists, context.marketLines), threes: buildPropProb("threes", threeOutcomes, threes, context.marketLines) },
    whyLikely: likely.slice(0, 4),
    whyNotLikely: unlikely.length ? unlikely.slice(0, 4) : ["No major downside flags from current context stack."],
    source: context.player.source
  };
}

function distributeTeam(args: {
  summary: NbaTeamPlayerProfileSummary;
  teamSide: TeamSide;
  opponentSummary: NbaTeamPlayerProfileSummary;
  teamProjectedPoints: number;
  input: SimInput;
  opponentDefenseRating: number;
  paceAverage: number;
  decisionPaceBias: number;
  synergyPaceBias: number;
  opponentPointOfAttackEdge: number;
  opponentRimDeterrenceEdge: number;
  propLines: Record<string, Partial<Record<PropStatKey, PropMarketLine>>> | null;
}) {
  const rotation = normalizedRotation(args.summary);
  const baseContexts = rotation.map((row) => {
    const key = normalizeName(row.player.playerName);
    return {
      player: row.player,
      teamSide: args.teamSide,
      rank: row.rank,
      minutes: row.minutes,
      scoringShare: 0,
      teamProjectedPoints: args.teamProjectedPoints,
      projectedTotal: args.input.projectedTotal,
      volatilityIndex: args.input.volatilityIndex,
      modelConfidence: args.input.confidence,
      opponentDefenseRating: args.opponentDefenseRating,
      paceAverage: args.paceAverage,
      decisionPaceBias: args.decisionPaceBias,
      synergyPaceBias: args.synergyPaceBias,
      teammateCreationSupport: args.summary.creationIndex + args.summary.playmakingIndex,
      opponentRimDeterrenceEdge: args.opponentRimDeterrenceEdge,
      opponentPointOfAttackEdge: args.opponentPointOfAttackEdge,
      marketLines: args.propLines?.[key],
      seedKey: args.input.seedKey
    } satisfies CalibratedPlayerContext;
  });
  const weights = baseContexts.map(scoringWeight);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  return baseContexts.map((context, index) => ({ ...context, scoringShare: (weights[index] ?? 0) / totalWeight }));
}

export async function simulateNbaPlayerGameProjections(input: SimInput): Promise<NbaPlayerStatProjection[]> {
  const [propLines, teamComparison, decision, synergy] = await Promise.all([
    fetchPropLines(),
    compareNbaProfilesReal(input.awaySummary.teamName, input.homeSummary.teamName),
    getNbaDecisionContext(input.awaySummary.teamName, input.homeSummary.teamName),
    getNbaSynergyContext(input.awaySummary.teamName, input.homeSummary.teamName)
  ]);

  const homeTeamPoints = clamp(
    input.projectedTotal / 2 + teamComparison.offensiveEdge * 0.16 + teamComparison.efgEdge * 0.1 + decision.decisionEdge * 0.1 + synergy.synergySideEdge * 0.06,
    82,
    150
  );
  const awayTeamPoints = clamp(input.projectedTotal - homeTeamPoints, 82, 150);
  const paceAverage = teamComparison.paceAverage;

  const away = distributeTeam({
    summary: input.awaySummary,
    opponentSummary: input.homeSummary,
    teamSide: "away",
    teamProjectedPoints: awayTeamPoints,
    input,
    opponentDefenseRating: teamComparison.home.defensiveRating,
    paceAverage,
    decisionPaceBias: decision.refereePaceBias,
    synergyPaceBias: synergy.synergyTotalEdge,
    opponentPointOfAttackEdge: -synergy.opponentPointOfAttackEdge,
    opponentRimDeterrenceEdge: -synergy.opponentRimDeterrenceEdge,
    propLines
  });
  const home = distributeTeam({
    summary: input.homeSummary,
    opponentSummary: input.awaySummary,
    teamSide: "home",
    teamProjectedPoints: homeTeamPoints,
    input,
    opponentDefenseRating: teamComparison.away.defensiveRating,
    paceAverage,
    decisionPaceBias: decision.refereePaceBias,
    synergyPaceBias: synergy.synergyTotalEdge,
    opponentPointOfAttackEdge: synergy.opponentPointOfAttackEdge,
    opponentRimDeterrenceEdge: synergy.opponentRimDeterrenceEdge,
    propLines
  });

  const projected = [...away, ...home].map(projectPlayer).sort((a, b) => b.projectedPoints - a.projectedPoints).slice(0, 18);
  const teamPointAudit = projected.reduce((sum, player) => sum + player.projectedPoints, 0);
  if (teamPointAudit > input.projectedTotal * 1.18) {
    const scale = input.projectedTotal * 1.02 / teamPointAudit;
    return projected.map((player) => ({ ...player, projectedPoints: round(player.projectedPoints * scale, 1), median: { ...player.median, points: round(player.median.points * scale, 1) }, floor: { ...player.floor, points: round(player.floor.points * scale, 1) }, ceiling: { ...player.ceiling, points: round(player.ceiling.points * scale, 1) }, whyNotLikely: [...player.whyNotLikely, "Team-total audit compressed player points to prevent all-scorer inflation."].slice(0, 4) }));
  }
  return projected;
}
