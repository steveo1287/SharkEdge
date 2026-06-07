import type {
  MlbProjectionLineup,
  MlbProjectionRating,
  MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbHandedness = "L" | "R" | "S";

export type MlbRawHitterStatRow = {
  mlbId: string | number;
  name: string;
  team: string;
  position?: string | null;
  bats?: MlbHandedness | string | null;
  splitHand?: "L" | "R" | string | null;
  season?: number | string | null;
  plateAppearances?: number | string | null;
  atBats?: number | string | null;
  hits?: number | string | null;
  doubles?: number | string | null;
  triples?: number | string | null;
  homeRuns?: number | string | null;
  walks?: number | string | null;
  strikeouts?: number | string | null;
  stolenBases?: number | string | null;
  caughtStealing?: number | string | null;
  totalBases?: number | string | null;
  avg?: number | string | null;
  obp?: number | string | null;
  slg?: number | string | null;
  ops?: number | string | null;
  iso?: number | string | null;
  wrcPlus?: number | string | null;
  xba?: number | string | null;
  xslg?: number | string | null;
  xwoba?: number | string | null;
  barrelRate?: number | string | null;
  hardHitRate?: number | string | null;
  chaseRate?: number | string | null;
  whiffRate?: number | string | null;
  sprintSpeed?: number | string | null;
  last14Ops?: number | string | null;
  last14Woba?: number | string | null;
  raw?: Record<string, unknown> | null;
};

export type MlbRawPitcherStatRow = {
  mlbId: string | number;
  name: string;
  team: string;
  position?: string | null;
  throws?: "L" | "R" | string | null;
  role?: "starter" | "reliever" | string | null;
  splitHand?: "L" | "R" | string | null;
  season?: number | string | null;
  gamesStarted?: number | string | null;
  games?: number | string | null;
  inningsPitched?: number | string | null;
  battersFaced?: number | string | null;
  strikeouts?: number | string | null;
  walks?: number | string | null;
  hitsAllowed?: number | string | null;
  homeRunsAllowed?: number | string | null;
  earnedRuns?: number | string | null;
  era?: number | string | null;
  fip?: number | string | null;
  xera?: number | string | null;
  whip?: number | string | null;
  strikeoutsPer9?: number | string | null;
  walksPer9?: number | string | null;
  hitsPer9?: number | string | null;
  homeRunsPer9?: number | string | null;
  groundballRate?: number | string | null;
  cswRate?: number | string | null;
  swingingStrikeRate?: number | string | null;
  averageFastballVelocity?: number | string | null;
  recentPitches7d?: number | string | null;
  raw?: Record<string, unknown> | null;
};

export type MlbTheShowRatingRow = {
  mlbId?: string | number | null;
  name: string;
  team?: string | null;
  position?: string | null;
  overall?: number | string | null;
  contactL?: number | string | null;
  contactR?: number | string | null;
  powerL?: number | string | null;
  powerR?: number | string | null;
  discipline?: number | string | null;
  speed?: number | string | null;
  fielding?: number | string | null;
  stamina?: number | string | null;
  h9?: number | string | null;
  k9?: number | string | null;
  bb9?: number | string | null;
  hr9?: number | string | null;
  clutch?: number | string | null;
};

export type MlbRealPlayerRatingBuildInput = {
  hitterStats: MlbRawHitterStatRow[];
  pitcherStats: MlbRawPitcherStatRow[];
  hitterSplits?: MlbRawHitterStatRow[];
  pitcherSplits?: MlbRawPitcherStatRow[];
  theShowRatings?: MlbTheShowRatingRow[];
  season?: number | string | null;
  minHitterPlateAppearances?: number;
  minPitcherBattersFaced?: number;
  theShowPriorWeight?: number;
};

export type MlbRealPlayerRatingBuild = {
  modelVersion: "mlb-real-player-ratings-v1";
  season: number | string | null;
  generatedAt: string;
  hitters: MlbProjectionRating[];
  pitchers: MlbProjectionRating[];
  warnings: string[];
  sourceSummary: {
    hitterRows: number;
    pitcherRows: number;
    hitterSplitRows: number;
    pitcherSplitRows: number;
    showRatingRows: number;
    showPriorWeight: number;
  };
};

type Numberish = number | string | null | undefined;

type HitterDerived = {
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  walks: number;
  strikeouts: number;
  stolenBases: number;
  caughtStealing: number;
  totalBases: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  iso: number;
  hitRate: number;
  walkRate: number;
  strikeoutRate: number;
  homeRunRate: number;
  totalBasesPerHit: number;
  stealAttemptRate: number;
  stealSuccessRate: number;
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
  barrelRate: number | null;
  hardHitRate: number | null;
  chaseRate: number | null;
  whiffRate: number | null;
  sprintSpeed: number | null;
  wrcPlus: number | null;
  last14Ops: number | null;
  last14Woba: number | null;
};

type PitcherDerived = {
  ip: number;
  starts: number;
  games: number;
  battersFaced: number;
  strikeouts: number;
  walks: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  earnedRuns: number;
  era: number;
  fip: number | null;
  xera: number | null;
  whip: number;
  kRate: number;
  walkRate: number;
  kMinusBbRate: number;
  strikeoutsPer9: number;
  walksPer9: number;
  hitsPer9: number;
  homeRunsPer9: number;
  inningsPerStart: number;
  groundballRate: number | null;
  cswRate: number | null;
  swingingStrikeRate: number | null;
  averageFastballVelocity: number | null;
  recentPitches7d: number | null;
};

const HITTER_BASELINE = {
  avg: 0.245,
  obp: 0.315,
  slg: 0.41,
  ops: 0.725,
  iso: 0.165,
  hitRate: 0.225,
  walkRate: 0.085,
  strikeoutRate: 0.225,
  homeRunRate: 0.03,
  totalBasesPerHit: 1.54,
  barrelRate: 0.075,
  hardHitRate: 0.39,
  chaseRate: 0.285,
  whiffRate: 0.245,
  sprintSpeed: 27,
  wrcPlus: 100,
  xwoba: 0.32
};

const PITCHER_BASELINE = {
  era: 4.2,
  fip: 4.2,
  xera: 4.1,
  whip: 1.3,
  kRate: 0.225,
  walkRate: 0.085,
  kMinusBbRate: 0.14,
  strikeoutsPer9: 8.4,
  walksPer9: 3.2,
  hitsPer9: 8.5,
  homeRunsPer9: 1.1,
  inningsPerStart: 5.25,
  groundballRate: 0.43,
  cswRate: 0.285,
  swingingStrikeRate: 0.112,
  velocity: 93.5
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asNumber(value: Numberish): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace("%", "");
    if (cleaned.length && Number.isFinite(Number(cleaned))) return Number(cleaned);
  }
  return null;
}

function numberOr(value: Numberish, fallback: number) {
  return asNumber(value) ?? fallback;
}

function percentRate(value: Numberish): number | null {
  const parsed = asNumber(value);
  if (parsed == null) return null;
  return parsed > 1.5 ? parsed / 100 : parsed;
}

function safeDivide(numerator: number, denominator: number, fallback: number) {
  return denominator > 0 ? numerator / denominator : fallback;
}

function scoreHigher(value: number | null, baseline: number, tenPointDelta: number) {
  if (value == null || !Number.isFinite(value)) return 70;
  return clamp(70 + ((value - baseline) / tenPointDelta) * 10, 35, 95);
}

function scoreLower(value: number | null, baseline: number, tenPointDelta: number) {
  if (value == null || !Number.isFinite(value)) return 70;
  return clamp(70 + ((baseline - value) / tenPointDelta) * 10, 35, 95);
}

function mean(values: Array<number | null | undefined>, fallback = 70) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : fallback;
}

function keyFromId(value: unknown) {
  return String(value ?? "").trim();
}

function nameKey(name: unknown) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function playerLookupKey(row: { mlbId?: string | number | null; name: string }) {
  const id = keyFromId(row.mlbId);
  return id || `name:${nameKey(row.name)}`;
}

function showLookupKey(row: MlbTheShowRatingRow) {
  const id = keyFromId(row.mlbId);
  return id || `name:${nameKey(row.name)}`;
}

function normalizeHand(value: unknown, fallback: "L" | "R" | "S" = "R"): "L" | "R" | "S" {
  const hand = String(value ?? "").trim().toUpperCase();
  if (hand.startsWith("L")) return "L";
  if (hand.startsWith("S")) return "S";
  if (hand.startsWith("R")) return "R";
  return fallback;
}

function normalizePitcherHand(value: unknown, fallback: "L" | "R" = "R"): "L" | "R" {
  return normalizeHand(value, fallback) === "L" ? "L" : "R";
}

function deriveHitter(row: MlbRawHitterStatRow): HitterDerived {
  const hits = numberOr(row.hits, 0);
  const doubles = numberOr(row.doubles, 0);
  const triples = numberOr(row.triples, 0);
  const homeRuns = numberOr(row.homeRuns, 0);
  const walks = numberOr(row.walks, 0);
  const strikeouts = numberOr(row.strikeouts, 0);
  const stolenBases = numberOr(row.stolenBases, 0);
  const caughtStealing = numberOr(row.caughtStealing, 0);
  const totalBases = numberOr(row.totalBases, hits + doubles + triples * 2 + homeRuns * 3);
  const ab = numberOr(row.atBats, Math.max(0, hits / Math.max(0.001, numberOr(row.avg, HITTER_BASELINE.avg))));
  const pa = numberOr(row.plateAppearances, ab + walks);
  const avg = numberOr(row.avg, safeDivide(hits, ab, HITTER_BASELINE.avg));
  const obp = numberOr(row.obp, safeDivide(hits + walks, pa, HITTER_BASELINE.obp));
  const slg = numberOr(row.slg, safeDivide(totalBases, ab, HITTER_BASELINE.slg));
  const ops = numberOr(row.ops, obp + slg);
  const iso = numberOr(row.iso, Math.max(0, slg - avg));

  return {
    pa,
    ab,
    hits,
    doubles,
    triples,
    homeRuns,
    walks,
    strikeouts,
    stolenBases,
    caughtStealing,
    totalBases,
    avg,
    obp,
    slg,
    ops,
    iso,
    hitRate: safeDivide(hits, pa, HITTER_BASELINE.hitRate),
    walkRate: safeDivide(walks, pa, HITTER_BASELINE.walkRate),
    strikeoutRate: safeDivide(strikeouts, pa, HITTER_BASELINE.strikeoutRate),
    homeRunRate: safeDivide(homeRuns, pa, HITTER_BASELINE.homeRunRate),
    totalBasesPerHit: safeDivide(totalBases, hits, HITTER_BASELINE.totalBasesPerHit),
    stealAttemptRate: safeDivide(stolenBases + caughtStealing, pa, 0.025),
    stealSuccessRate: safeDivide(stolenBases, stolenBases + caughtStealing, 0.72),
    xba: asNumber(row.xba),
    xslg: asNumber(row.xslg),
    xwoba: asNumber(row.xwoba),
    barrelRate: percentRate(row.barrelRate),
    hardHitRate: percentRate(row.hardHitRate),
    chaseRate: percentRate(row.chaseRate),
    whiffRate: percentRate(row.whiffRate),
    sprintSpeed: asNumber(row.sprintSpeed),
    wrcPlus: asNumber(row.wrcPlus),
    last14Ops: asNumber(row.last14Ops),
    last14Woba: asNumber(row.last14Woba)
  };
}

function derivePitcher(row: MlbRawPitcherStatRow): PitcherDerived {
  const ip = numberOr(row.inningsPitched, 0);
  const starts = numberOr(row.gamesStarted, 0);
  const games = numberOr(row.games, Math.max(starts, 1));
  const battersFaced = numberOr(row.battersFaced, Math.max(1, ip * 4.25));
  const strikeouts = numberOr(row.strikeouts, 0);
  const walks = numberOr(row.walks, 0);
  const hitsAllowed = numberOr(row.hitsAllowed, 0);
  const homeRunsAllowed = numberOr(row.homeRunsAllowed, 0);
  const earnedRuns = numberOr(row.earnedRuns, numberOr(row.era, PITCHER_BASELINE.era) * ip / 9);
  const era = numberOr(row.era, safeDivide(earnedRuns * 9, ip, PITCHER_BASELINE.era));
  const whip = numberOr(row.whip, safeDivide(walks + hitsAllowed, ip, PITCHER_BASELINE.whip));
  const strikeoutsPer9 = numberOr(row.strikeoutsPer9, safeDivide(strikeouts * 9, ip, PITCHER_BASELINE.strikeoutsPer9));
  const walksPer9 = numberOr(row.walksPer9, safeDivide(walks * 9, ip, PITCHER_BASELINE.walksPer9));
  const hitsPer9 = numberOr(row.hitsPer9, safeDivide(hitsAllowed * 9, ip, PITCHER_BASELINE.hitsPer9));
  const homeRunsPer9 = numberOr(row.homeRunsPer9, safeDivide(homeRunsAllowed * 9, ip, PITCHER_BASELINE.homeRunsPer9));

  return {
    ip,
    starts,
    games,
    battersFaced,
    strikeouts,
    walks,
    hitsAllowed,
    homeRunsAllowed,
    earnedRuns,
    era,
    fip: asNumber(row.fip),
    xera: asNumber(row.xera),
    whip,
    kRate: safeDivide(strikeouts, battersFaced, PITCHER_BASELINE.kRate),
    walkRate: safeDivide(walks, battersFaced, PITCHER_BASELINE.walkRate),
    kMinusBbRate: safeDivide(strikeouts - walks, battersFaced, PITCHER_BASELINE.kMinusBbRate),
    strikeoutsPer9,
    walksPer9,
    hitsPer9,
    homeRunsPer9,
    inningsPerStart: starts > 0 ? ip / starts : Math.min(2.0, ip / Math.max(1, games)),
    groundballRate: percentRate(row.groundballRate),
    cswRate: percentRate(row.cswRate),
    swingingStrikeRate: percentRate(row.swingingStrikeRate),
    averageFastballVelocity: asNumber(row.averageFastballVelocity),
    recentPitches7d: asNumber(row.recentPitches7d)
  };
}

function splitMap<T extends { mlbId: string | number; name: string; splitHand?: string | null }>(rows: T[]) {
  const output = new Map<string, { vsL?: T; vsR?: T }>();
  for (const row of rows) {
    const key = playerLookupKey(row);
    const hand = normalizePitcherHand(row.splitHand);
    const current = output.get(key) ?? {};
    if (hand === "L") current.vsL = row;
    else current.vsR = row;
    output.set(key, current);
  }
  return output;
}

function showScore(row: MlbTheShowRatingRow | undefined, keys: Array<keyof MlbTheShowRatingRow>) {
  if (!row) return null;
  return mean(keys.map((key) => asNumber(row[key] as Numberish)), NaN);
}

function blendShow(base: number, show: number | null, weight: number) {
  if (show == null || !Number.isFinite(show)) return base;
  return clamp(base * (1 - weight) + clamp(show, 35, 99) * weight, 35, 95);
}

function buildShowMap(rows: MlbTheShowRatingRow[]) {
  const map = new Map<string, MlbTheShowRatingRow>();
  for (const row of rows) {
    map.set(showLookupKey(row), row);
    map.set(`name:${nameKey(row.name)}`, row);
  }
  return map;
}

function findShow(row: { mlbId?: string | number | null; name: string }, map: Map<string, MlbTheShowRatingRow>) {
  return map.get(playerLookupKey(row)) ?? map.get(`name:${nameKey(row.name)}`);
}

function hitterSplitScore(row: MlbRawHitterStatRow | undefined, fallback: number) {
  if (!row) return fallback;
  const d = deriveHitter(row);
  return mean([
    scoreHigher(d.avg, HITTER_BASELINE.avg, 0.035),
    scoreHigher(d.ops, HITTER_BASELINE.ops, 0.11),
    scoreHigher(d.iso, HITTER_BASELINE.iso, 0.065),
    scoreLower(d.strikeoutRate, HITTER_BASELINE.strikeoutRate, 0.055)
  ], fallback);
}

function pitcherSplitScore(row: MlbRawPitcherStatRow | undefined, fallback: number) {
  if (!row) return fallback;
  const d = derivePitcher(row);
  return mean([
    scoreLower(d.era, PITCHER_BASELINE.era, 0.8),
    scoreHigher(d.kMinusBbRate, PITCHER_BASELINE.kMinusBbRate, 0.06),
    scoreLower(d.whip, PITCHER_BASELINE.whip, 0.16),
    scoreLower(d.homeRunsPer9, PITCHER_BASELINE.homeRunsPer9, 0.35)
  ], fallback);
}

function hitterRating(row: MlbRawHitterStatRow, splits: { vsL?: MlbRawHitterStatRow; vsR?: MlbRawHitterStatRow } | undefined, show: MlbTheShowRatingRow | undefined, showWeight: number): MlbProjectionRating {
  const d = deriveHitter(row);
  const contact = mean([
    scoreHigher(d.avg, HITTER_BASELINE.avg, 0.035),
    scoreHigher(d.xba, HITTER_BASELINE.avg, 0.035),
    scoreHigher(d.hitRate, HITTER_BASELINE.hitRate, 0.035),
    scoreLower(d.strikeoutRate, HITTER_BASELINE.strikeoutRate, 0.055),
    scoreLower(d.whiffRate, HITTER_BASELINE.whiffRate, 0.055)
  ]);
  const power = mean([
    scoreHigher(d.iso, HITTER_BASELINE.iso, 0.065),
    scoreHigher(d.slg, HITTER_BASELINE.slg, 0.09),
    scoreHigher(d.xslg, HITTER_BASELINE.slg, 0.09),
    scoreHigher(d.homeRunRate, HITTER_BASELINE.homeRunRate, 0.016),
    scoreHigher(d.barrelRate, HITTER_BASELINE.barrelRate, 0.035),
    scoreHigher(d.hardHitRate, HITTER_BASELINE.hardHitRate, 0.075)
  ]);
  const discipline = mean([
    scoreHigher(d.walkRate, HITTER_BASELINE.walkRate, 0.035),
    scoreHigher(d.obp, HITTER_BASELINE.obp, 0.045),
    scoreLower(d.chaseRate, HITTER_BASELINE.chaseRate, 0.055),
    scoreLower(d.strikeoutRate, HITTER_BASELINE.strikeoutRate, 0.055),
    scoreHigher(d.xwoba, HITTER_BASELINE.xwoba, 0.045),
    scoreHigher(d.wrcPlus, HITTER_BASELINE.wrcPlus, 18)
  ]);
  const baserunning = mean([
    scoreHigher(d.sprintSpeed, HITTER_BASELINE.sprintSpeed, 1.2),
    scoreHigher(d.stealAttemptRate, 0.025, 0.025),
    scoreHigher(d.stealSuccessRate, 0.72, 0.08)
  ]);
  const currentForm = mean([
    scoreHigher(d.last14Ops, HITTER_BASELINE.ops, 0.13),
    scoreHigher(d.last14Woba, HITTER_BASELINE.xwoba, 0.055),
    mean([contact, power, discipline])
  ]);
  const baseSplit = mean([contact, power, discipline]);
  const vsLhp = hitterSplitScore(splits?.vsL, baseSplit);
  const vsRhp = hitterSplitScore(splits?.vsR, baseSplit);

  const blendedContact = blendShow(contact, showScore(show, ["contactL", "contactR"]), showWeight);
  const blendedPower = blendShow(power, showScore(show, ["powerL", "powerR"]), showWeight);
  const blendedDiscipline = blendShow(discipline, showScore(show, ["discipline", "clutch"]), showWeight);
  const blendedBaserunning = blendShow(baserunning, showScore(show, ["speed"]), showWeight);
  const blendedFielding = blendShow(70, showScore(show, ["fielding"]), showWeight);
  const blendedVsLhp = blendShow(vsLhp, showScore(show, ["contactL", "powerL"]), showWeight);
  const blendedVsRhp = blendShow(vsRhp, showScore(show, ["contactR", "powerR"]), showWeight);
  const blendedCurrentForm = blendShow(currentForm, showScore(show, ["overall"]), Math.min(0.08, showWeight));
  const overall = mean([
    blendedContact * 0.22,
    blendedPower * 0.24,
    blendedDiscipline * 0.18,
    blendedVsLhp * 0.08,
    blendedVsRhp * 0.1,
    blendedBaserunning * 0.05,
    blendedFielding * 0.03,
    blendedCurrentForm * 0.1
  ]) * 8;

  return {
    id: keyFromId(row.mlbId),
    name: row.name,
    team: row.team,
    role_tier: overall >= 84 ? "STAR" : overall >= 74 ? "STARTER" : "ROLE_PLAYER",
    contact: round(blendedContact, 2),
    power: round(blendedPower, 2),
    discipline: round(blendedDiscipline, 2),
    vs_lhp: round(blendedVsLhp, 2),
    vs_rhp: round(blendedVsRhp, 2),
    baserunning: round(blendedBaserunning, 2),
    fielding: round(blendedFielding, 2),
    current_form: round(blendedCurrentForm, 2),
    overall: round(clamp(overall, 35, 95), 2),
    metrics_json: {
      sourceKind: "REAL_STATS",
      sourceLineage: show ? "real_stats_plus_show_prior" : "real_stats_only",
      position: row.position ?? null,
      bats: normalizeHand(row.bats),
      season: row.season ?? null,
      sample: { plateAppearances: round(d.pa, 1), atBats: round(d.ab, 1) },
      hitRate: round(d.hitRate, 5),
      walkRate: round(d.walkRate, 5),
      strikeoutRate: round(d.strikeoutRate, 5),
      homeRunRate: round(d.homeRunRate, 5),
      totalBasesPerHit: round(d.totalBasesPerHit, 4),
      stealAttemptRate: round(d.stealAttemptRate, 5),
      stealSuccessRate: round(d.stealSuccessRate, 4),
      avg: round(d.avg, 3),
      obp: round(d.obp, 3),
      slg: round(d.slg, 3),
      ops: round(d.ops, 3),
      iso: round(d.iso, 3),
      xba: d.xba == null ? null : round(d.xba, 3),
      xslg: d.xslg == null ? null : round(d.xslg, 3),
      xwoba: d.xwoba == null ? null : round(d.xwoba, 3),
      barrelRate: d.barrelRate == null ? null : round(d.barrelRate, 4),
      hardHitRate: d.hardHitRate == null ? null : round(d.hardHitRate, 4),
      showPriorUsed: Boolean(show),
      showPriorWeight: show ? showWeight : 0
    }
  };
}

function pitcherRating(row: MlbRawPitcherStatRow, splits: { vsL?: MlbRawPitcherStatRow; vsR?: MlbRawPitcherStatRow } | undefined, show: MlbTheShowRatingRow | undefined, showWeight: number): MlbProjectionRating {
  const d = derivePitcher(row);
  const xeraQuality = mean([
    scoreLower(d.xera, PITCHER_BASELINE.xera, 0.8),
    scoreLower(d.era, PITCHER_BASELINE.era, 0.85),
    scoreLower(d.whip, PITCHER_BASELINE.whip, 0.16)
  ]);
  const fipQuality = mean([
    scoreLower(d.fip, PITCHER_BASELINE.fip, 0.75),
    scoreLower(d.homeRunsPer9, PITCHER_BASELINE.homeRunsPer9, 0.35),
    scoreHigher(d.kMinusBbRate, PITCHER_BASELINE.kMinusBbRate, 0.06)
  ]);
  const kBb = mean([
    scoreHigher(d.kRate, PITCHER_BASELINE.kRate, 0.055),
    scoreHigher(d.kMinusBbRate, PITCHER_BASELINE.kMinusBbRate, 0.06),
    scoreHigher(d.strikeoutsPer9, PITCHER_BASELINE.strikeoutsPer9, 1.4),
    scoreLower(d.walkRate, PITCHER_BASELINE.walkRate, 0.028),
    scoreLower(d.walksPer9, PITCHER_BASELINE.walksPer9, 0.75)
  ]);
  const hrRisk = clamp(30 + ((d.homeRunsPer9 - PITCHER_BASELINE.homeRunsPer9) / 0.35) * 10, 5, 70);
  const groundball = scoreHigher(d.groundballRate, PITCHER_BASELINE.groundballRate, 0.07);
  const splitBase = mean([xeraQuality, fipQuality, kBb]);
  const vsL = pitcherSplitScore(splits?.vsL, splitBase);
  const vsR = pitcherSplitScore(splits?.vsR, splitBase);
  const platoonSplit = clamp(90 - Math.abs(vsL - vsR) * 1.3, 35, 95);
  const stamina = scoreHigher(d.inningsPerStart, PITCHER_BASELINE.inningsPerStart, 0.75);
  const workload = d.recentPitches7d == null ? 28 : clamp(d.recentPitches7d / 2.8, 5, 85);
  const arsenal = mean([
    scoreHigher(d.cswRate, PITCHER_BASELINE.cswRate, 0.035),
    scoreHigher(d.swingingStrikeRate, PITCHER_BASELINE.swingingStrikeRate, 0.025),
    scoreHigher(d.averageFastballVelocity, PITCHER_BASELINE.velocity, 1.8),
    scoreHigher(d.strikeoutsPer9, PITCHER_BASELINE.strikeoutsPer9, 1.4)
  ]);

  const blendedXera = blendShow(xeraQuality, showScore(show, ["h9", "clutch"]), showWeight);
  const blendedFip = blendShow(fipQuality, showScore(show, ["h9", "hr9"]), showWeight);
  const blendedKBb = blendShow(kBb, showScore(show, ["k9", "bb9"]), showWeight);
  const blendedStamina = blendShow(stamina, showScore(show, ["stamina"]), showWeight);
  const blendedArsenal = blendShow(arsenal, showScore(show, ["k9", "overall"]), showWeight);
  const showHr = showScore(show, ["hr9"]);
  const blendedHrRisk = showHr == null ? hrRisk : clamp(hrRisk * (1 - showWeight) + (100 - showHr) * showWeight, 5, 70);
  const overall = clamp(
    blendedXera * 0.23 +
    blendedFip * 0.19 +
    blendedKBb * 0.17 +
    (100 - blendedHrRisk) * 0.09 +
    groundball * 0.06 +
    platoonSplit * 0.08 +
    blendedStamina * 0.06 +
    (100 - workload) * 0.04 +
    blendedArsenal * 0.08,
    35,
    95
  );

  const starterRole = d.starts >= 1 || String(row.role ?? "").toLowerCase().includes("start");

  return {
    id: keyFromId(row.mlbId),
    name: row.name,
    team: row.team,
    role_tier: starterRole ? (overall >= 84 ? "ACE" : overall >= 76 ? "TOP_ROTATION" : overall >= 68 ? "MID_ROTATION" : "BACK_END") : "RELIEVER",
    xera_quality: round(blendedXera, 2),
    fip_quality: round(blendedFip, 2),
    k_bb: round(blendedKBb, 2),
    hr_risk: round(blendedHrRisk, 2),
    groundball_rate: round(groundball, 2),
    platoon_split: round(platoonSplit, 2),
    stamina: round(blendedStamina, 2),
    recent_workload: round(workload, 2),
    arsenal_quality: round(blendedArsenal, 2),
    overall: round(overall, 2),
    metrics_json: {
      sourceKind: "REAL_STATS",
      sourceLineage: show ? "real_stats_plus_show_prior" : "real_stats_only",
      position: row.position ?? null,
      throws: normalizePitcherHand(row.throws),
      season: row.season ?? null,
      sample: { inningsPitched: round(d.ip, 1), battersFaced: round(d.battersFaced, 0), gamesStarted: round(d.starts, 0) },
      inningsPerStart: round(d.inningsPerStart, 3),
      strikeoutsPer9: round(d.strikeoutsPer9, 3),
      walksPer9: round(d.walksPer9, 3),
      hitsPer9: round(d.hitsPer9, 3),
      homeRunsPer9: round(d.homeRunsPer9, 3),
      kRate: round(d.kRate, 5),
      walkRate: round(d.walkRate, 5),
      kMinusBbRate: round(d.kMinusBbRate, 5),
      era: round(d.era, 2),
      fip: d.fip == null ? null : round(d.fip, 2),
      xera: d.xera == null ? null : round(d.xera, 2),
      whip: round(d.whip, 3),
      groundballRate: d.groundballRate == null ? null : round(d.groundballRate, 4),
      cswRate: d.cswRate == null ? null : round(d.cswRate, 4),
      swingingStrikeRate: d.swingingStrikeRate == null ? null : round(d.swingingStrikeRate, 4),
      averageFastballVelocity: d.averageFastballVelocity == null ? null : round(d.averageFastballVelocity, 1),
      showPriorUsed: Boolean(show),
      showPriorWeight: show ? showWeight : 0
    }
  };
}

function keepBestByPlayer<T extends { mlbId: string | number; name: string; plateAppearances?: Numberish; battersFaced?: Numberish }>(rows: T[], sampleKey: "plateAppearances" | "battersFaced") {
  const byPlayer = new Map<string, T>();
  for (const row of rows) {
    const key = playerLookupKey(row);
    const current = byPlayer.get(key);
    if (!current || numberOr(row[sampleKey], 0) >= numberOr(current[sampleKey], 0)) byPlayer.set(key, row);
  }
  return Array.from(byPlayer.values());
}

export function buildMlbRealPlayerRatings(input: MlbRealPlayerRatingBuildInput): MlbRealPlayerRatingBuild {
  const showWeight = clamp(input.theShowPriorWeight ?? 0.12, 0, 0.25);
  const showMap = buildShowMap(input.theShowRatings ?? []);
  const hitterSplitRows = input.hitterSplits ?? [];
  const pitcherSplitRows = input.pitcherSplits ?? [];
  const hitterSplits = splitMap(hitterSplitRows);
  const pitcherSplits = splitMap(pitcherSplitRows);
  const minHitterPa = input.minHitterPlateAppearances ?? 1;
  const minPitcherBf = input.minPitcherBattersFaced ?? 1;
  const warnings: string[] = [];

  const hitterRows = keepBestByPlayer(input.hitterStats, "plateAppearances")
    .filter((row) => numberOr(row.plateAppearances, numberOr(row.atBats, 0) + numberOr(row.walks, 0)) >= minHitterPa);
  const pitcherRows = keepBestByPlayer(input.pitcherStats, "battersFaced")
    .filter((row) => numberOr(row.battersFaced, numberOr(row.inningsPitched, 0) * 4.25) >= minPitcherBf);

  if (!hitterRows.length) warnings.push("No hitter stat rows survived the plate-appearance filter.");
  if (!pitcherRows.length) warnings.push("No pitcher stat rows survived the batters-faced filter.");
  if ((input.theShowRatings ?? []).length && showWeight > 0) {
    warnings.push("MLB The Show ratings were used only as a low-weight prior; real MLB/statcast production remains the source of truth.");
  }

  const hitters = hitterRows.map((row) => hitterRating(row, hitterSplits.get(playerLookupKey(row)), findShow(row, showMap), showWeight));
  const pitchers = pitcherRows.map((row) => pitcherRating(row, pitcherSplits.get(playerLookupKey(row)), findShow(row, showMap), showWeight));

  return {
    modelVersion: "mlb-real-player-ratings-v1",
    season: input.season ?? null,
    generatedAt: new Date().toISOString(),
    hitters,
    pitchers,
    warnings,
    sourceSummary: {
      hitterRows: input.hitterStats.length,
      pitcherRows: input.pitcherStats.length,
      hitterSplitRows: hitterSplitRows.length,
      pitcherSplitRows: pitcherSplitRows.length,
      showRatingRows: input.theShowRatings?.length ?? 0,
      showPriorWeight: showWeight
    }
  };
}

export function buildMlbTeamContextFromRealRatings(args: {
  team: string;
  ratings: MlbRealPlayerRatingBuild | { hitters: MlbProjectionRating[]; pitchers: MlbProjectionRating[] };
  battingOrder?: Array<{ playerId?: string | number | null; playerName?: string | null; name?: string | null }>;
  confirmedLineup?: boolean;
  startingPitcherId?: string | number | null;
  startingPitcherName?: string | null;
  availableRelievers?: Array<Record<string, unknown>>;
  unavailableRelievers?: Array<Record<string, unknown>>;
  source?: string;
  capturedAt?: Date | string | null;
}): MlbProjectionTeamContext {
  const key = args.team.trim().toUpperCase();
  const hitters = args.ratings.hitters.filter((row) => String(row.team ?? "").trim().toUpperCase() === key);
  const pitchers = args.ratings.pitchers.filter((row) => String(row.team ?? "").trim().toUpperCase() === key);
  const lineup: MlbProjectionLineup = {
    confirmed: args.confirmedLineup ?? false,
    batting_order_json: (args.battingOrder ?? hitters
      .slice()
      .sort((a, b) => numberOr(b.overall, 0) - numberOr(a.overall, 0))
      .slice(0, 9)
      .map((row) => ({ playerId: row.id, playerName: row.name }))).map((entry) => ({
        playerId: keyFromId(entry.playerId),
        playerName: entry.playerName ?? entry.name ?? null
      })),
    starting_pitcher_id: args.startingPitcherId == null ? null : keyFromId(args.startingPitcherId),
    starting_pitcher_name: args.startingPitcherName ?? null,
    available_relievers_json: args.availableRelievers ?? [],
    unavailable_relievers_json: args.unavailableRelievers ?? [],
    source: args.source ?? "mlb-real-player-ratings-v1",
    captured_at: args.capturedAt ?? new Date().toISOString()
  };

  return { team: key, lineup, hitters, pitchers };
}
