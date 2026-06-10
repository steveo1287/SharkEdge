import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type BoxScoreSide = "away" | "home";

export type RatingBackedHitterProjection = {
  playerId: string;
  name: string;
  team: string;
  teamSide: BoxScoreSide;
  battingOrder: number | null;
  plateAppearances: number | null;
  hits: number | null;
  totalBases: number | null;
  homeRuns: number | null;
  runs: number | null;
  rbi: number | null;
  strikeouts: number | null;
  stolenBaseChance: number | null;
  actual: null;
};

export type RatingBackedPitcherProjection = {
  playerId: string | null;
  name: string;
  team: string;
  teamSide: BoxScoreSide;
  innings: number | null;
  outs: number | null;
  strikeouts: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  homeRuns: number | null;
  actual: null;
};

export type RatingBackedBoxScore = {
  hitters: { away: RatingBackedHitterProjection[]; home: RatingBackedHitterProjection[] };
  starters: { away: RatingBackedPitcherProjection | null; home: RatingBackedPitcherProjection | null };
  warnings: string[];
};

type HitterRow = {
  player_id: string;
  player_name: string;
  team: string;
  role_tier: string | null;
  contact: number | null;
  power: number | null;
  discipline: number | null;
  baserunning: number | null;
  current_form: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
};

type PitcherRow = {
  pitcher_id: string;
  pitcher_name: string;
  team: string;
  role_tier: string | null;
  xera_quality: number | null;
  fip_quality: number | null;
  k_bb: number | null;
  hr_risk: number | null;
  stamina: number | null;
  recent_workload: number | null;
  arsenal_quality: number | null;
  overall: number | null;
  metrics_json: Record<string, unknown> | null;
};

const TEAM_ALIASES: Record<string, string[]> = {
  "arizona diamondbacks": ["ARI", "AZ"],
  "atlanta braves": ["ATL"],
  "baltimore orioles": ["BAL"],
  "boston red sox": ["BOS"],
  "chicago cubs": ["CHC"],
  "chicago white sox": ["CHW", "CWS"],
  "cincinnati reds": ["CIN"],
  "cleveland guardians": ["CLE"],
  "colorado rockies": ["COL"],
  "detroit tigers": ["DET"],
  "houston astros": ["HOU"],
  "kansas city royals": ["KC", "KCR"],
  "los angeles angels": ["LAA", "ANA"],
  "los angeles dodgers": ["LAD", "LA"],
  "miami marlins": ["MIA", "FLA"],
  "milwaukee brewers": ["MIL"],
  "minnesota twins": ["MIN"],
  "new york mets": ["NYM"],
  "new york yankees": ["NYY"],
  "athletics": ["ATH", "OAK"],
  "oakland athletics": ["OAK", "ATH"],
  "philadelphia phillies": ["PHI"],
  "pittsburgh pirates": ["PIT"],
  "san diego padres": ["SD", "SDP"],
  "san francisco giants": ["SF", "SFG"],
  "seattle mariners": ["SEA"],
  "st. louis cardinals": ["STL"],
  "st louis cardinals": ["STL"],
  "tampa bay rays": ["TB", "TBR"],
  "texas rangers": ["TEX"],
  "toronto blue jays": ["TOR"],
  "washington nationals": ["WSH", "WAS"]
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function n(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function metric(row: { metrics_json: Record<string, unknown> | null }, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = row.metrics_json?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function optionalMetric(row: { metrics_json: Record<string, unknown> | null }, keys: string[]) {
  for (const key of keys) {
    const value = row.metrics_json?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function decimalRate(value: number | null, fallback: number, min: number, max: number) {
  if (value == null) return fallback;
  return clamp(value > 1.5 ? value / 100 : value, min, max);
}

function ratePerGame(row: HitterRow, keys: string[], pa: number, fallback: number) {
  const direct = optionalMetric(row, keys);
  if (direct != null) return direct;
  const rate = optionalMetric(row, keys.map((key) => `${key}Rate`));
  if (rate != null) return decimalRate(rate, fallback / Math.max(1, pa), 0, 1) * pa;
  return fallback;
}

function teamKeys(name: string, abbreviation?: string | null) {
  const lower = name.trim().toLowerCase();
  const direct = [name, lower, name.toUpperCase(), abbreviation ?? ""].filter(Boolean);
  const aliases = TEAM_ALIASES[lower] ?? [];
  return Array.from(new Set([...direct, ...aliases, ...aliases.map((item) => item.toLowerCase())]));
}

async function hittersFor(name: string, abbreviation?: string | null) {
  const keys = teamKeys(name, abbreviation);
  return prisma.$queryRaw<HitterRow[]>`
    SELECT DISTINCT ON (player_id)
      player_id, player_name, team, role_tier, contact, power, discipline, baserunning, current_form, overall, metrics_json
    FROM mlb_player_ratings
    WHERE team = ANY(${keys})
    ORDER BY player_id, snapshot_at DESC;
  `;
}

async function pitchersFor(name: string, abbreviation?: string | null) {
  const keys = teamKeys(name, abbreviation);
  return prisma.$queryRaw<PitcherRow[]>`
    SELECT DISTINCT ON (pitcher_id)
      pitcher_id, pitcher_name, team, role_tier, xera_quality, fip_quality, k_bb, hr_risk, stamina, recent_workload, arsenal_quality, overall, metrics_json
    FROM mlb_pitcher_ratings
    WHERE team = ANY(${keys})
    ORDER BY pitcher_id, snapshot_at DESC;
  `;
}

function hitterValue(row: HitterRow) {
  return n(row.overall, 70) * 0.42 + n(row.contact, 70) * 0.2 + n(row.power, 70) * 0.24 + n(row.discipline, 70) * 0.1 + n(row.current_form, 70) * 0.04;
}

function pitcherValue(row: PitcherRow) {
  return n(row.overall, 70) * 0.42 + n(row.xera_quality, 70) * 0.18 + n(row.fip_quality, 70) * 0.14 + n(row.k_bb, 70) * 0.14 + n(row.arsenal_quality, 70) * 0.08 + n(row.stamina, 70) * 0.04;
}

function toHitter(row: HitterRow, args: { side: BoxScoreSide; teamName: string; order: number; projectedRuns: number | null }): RatingBackedHitterProjection {
  const order = args.order;
  const pa = order <= 2 ? 4.7 : order <= 5 ? 4.35 : order <= 7 ? 4.0 : 3.75;
  const contact = n(row.contact, 70);
  const power = n(row.power, 70);
  const discipline = n(row.discipline, 70);
  const runEnv = clamp((args.projectedRuns ?? 4.35) / 4.45, 0.65, 1.55);
  const avg = optionalMetric(row, ["avg", "battingAverage", "ba"]);
  const slg = optionalMetric(row, ["slg", "slugging"]);
  const iso = optionalMetric(row, ["iso", "isolatedPower"]);
  const hitRate = decimalRate(optionalMetric(row, ["hitRate", "hitsPerPa"]), avg != null ? (avg > 1 ? avg / 1000 : avg) * 0.9 : 0.225 + (contact - 70) * 0.0018, 0.11, 0.39);
  const hrRate = decimalRate(optionalMetric(row, ["hrRate", "homeRunRate"]), iso != null ? Math.max(0.004, decimalRate(iso, 0.16, 0.02, 0.36) * 0.16) : 0.028 + (power - 70) * 0.001, 0.003, 0.105);
  const kRate = decimalRate(optionalMetric(row, ["strikeoutRate", "kRate", "soRate"]), 0.225 - (contact - 70) * 0.0015, 0.07, 0.4);
  const tbPerHit = clamp(optionalMetric(row, ["totalBasesPerHit", "tbPerHit"]) ?? (slg != null && hitRate > 0 ? decimalRate(slg, 0.405, 0.22, 0.72) / hitRate : 1.42 + Math.max(0, power - 65) * 0.009), 1.05, 2.55);
  const expectedHits = clamp(ratePerGame(row, ["hits", "expectedHits", "hitsPerGame"], pa, pa * hitRate) + (contact - 70) * 0.004, 0.35, 1.75);
  const expectedHr = clamp(ratePerGame(row, ["homeRuns", "expectedHomeRuns", "homeRunsPerGame"], pa, pa * hrRate) + (power - 70) * 0.0012, 0.01, 0.42);
  const totalBases = clamp((optionalMetric(row, ["totalBases", "expectedTotalBases", "totalBasesPerGame"]) ?? expectedHits * tbPerHit) + expectedHr * 0.65, 0.45, 3.45);
  const runShare = (args.projectedRuns ?? 4.35) / 9;
  return {
    playerId: row.player_id,
    name: row.player_name,
    team: args.teamName,
    teamSide: args.side,
    battingOrder: order,
    plateAppearances: round(pa, 1),
    hits: round(expectedHits * runEnv, 1),
    totalBases: round(totalBases * runEnv, 1),
    homeRuns: round(expectedHr * runEnv, 2),
    runs: round(runShare * (order <= 4 ? 1.1 : 0.9), 1),
    rbi: round(runShare * (order >= 3 && order <= 6 ? 1.15 : 0.88), 1),
    strikeouts: round(clamp(pa * kRate + Math.max(0, 70 - discipline) * 0.003, 0.35, 1.7), 1),
    stolenBaseChance: round(clamp((n(row.baserunning, 60) - 45) / 160, 0.01, 0.42), 2),
    actual: null
  };
}

function toStarter(row: PitcherRow, args: { side: BoxScoreSide; teamName: string; opposingRuns: number | null }): RatingBackedPitcherProjection {
  const inningsRaw = metric(row, ["inningsPerStart"], 0) || (metric(row, ["innings"], 0) && metric(row, ["starts"], 0) ? metric(row, ["innings"], 0) / Math.max(1, metric(row, ["starts"], 1)) : 5.25);
  const stamina = n(row.stamina, 70);
  const skill = pitcherValue(row);
  const innings = clamp(inningsRaw + (stamina - 70) * 0.018, 3.5, 7.4);
  const k9 = metric(row, ["strikeoutsPer9", "kPer9"], 7.6) + (n(row.k_bb, 70) - 70) * 0.045 + (n(row.arsenal_quality, 70) - 70) * 0.035;
  const bb9 = metric(row, ["walksPer9", "bbPer9"], 3.0) - (n(row.k_bb, 70) - 70) * 0.018;
  const hr9 = metric(row, ["hrPer9"], 1.05) + (n(row.hr_risk, 30) - 30) * 0.012;
  const er = clamp((args.opposingRuns ?? 4.35) * (innings / 8.8) * clamp(1 - (skill - 70) * 0.006, 0.58, 1.35), 0.3, 6.2);
  return {
    playerId: row.pitcher_id,
    name: row.pitcher_name,
    team: args.teamName,
    teamSide: args.side,
    innings: round(innings, 1),
    outs: Math.round(innings * 3),
    strikeouts: round(clamp(innings * k9 / 9, 1.2, 11.5), 1),
    earnedRuns: round(er, 1),
    hitsAllowed: round(clamp(innings * (8.5 - (skill - 70) * 0.04) / 9, 2.4, 11.5), 1),
    walks: round(clamp(innings * bb9 / 9, 0.3, 5.5), 1),
    homeRuns: round(clamp(innings * hr9 / 9, 0.05, 2.2), 1),
    actual: null
  };
}

export async function buildMlbRatingBackedBoxScore(args: {
  away: { name: string; abbreviation?: string | null; projectedRuns: number | null };
  home: { name: string; abbreviation?: string | null; projectedRuns: number | null };
}): Promise<RatingBackedBoxScore> {
  const empty: RatingBackedBoxScore = { hitters: { away: [], home: [] }, starters: { away: null, home: null }, warnings: [] };
  if (!hasUsableServerDatabaseUrl()) return { ...empty, warnings: ["Rating-backed box-score fallback skipped: database unavailable."] };
  const [awayHittersRaw, homeHittersRaw, awayPitchersRaw, homePitchersRaw] = await Promise.all([
    hittersFor(args.away.name, args.away.abbreviation).catch(() => []),
    hittersFor(args.home.name, args.home.abbreviation).catch(() => []),
    pitchersFor(args.away.name, args.away.abbreviation).catch(() => []),
    pitchersFor(args.home.name, args.home.abbreviation).catch(() => [])
  ]);
  const awayHitters = awayHittersRaw.sort((a, b) => hitterValue(b) - hitterValue(a)).slice(0, 9).map((row, index) => toHitter(row, { side: "away", teamName: args.away.name, order: index + 1, projectedRuns: args.away.projectedRuns }));
  const homeHitters = homeHittersRaw.sort((a, b) => hitterValue(b) - hitterValue(a)).slice(0, 9).map((row, index) => toHitter(row, { side: "home", teamName: args.home.name, order: index + 1, projectedRuns: args.home.projectedRuns }));
  const awayStarter = awayPitchersRaw.sort((a, b) => pitcherValue(b) - pitcherValue(a))[0];
  const homeStarter = homePitchersRaw.sort((a, b) => pitcherValue(b) - pitcherValue(a))[0];
  const warnings: string[] = [];
  if (awayHitters.length) warnings.push(`${args.away.name} hitters are using rating-backed projections because linked/cached sim hitter rows were unavailable.`);
  if (homeHitters.length) warnings.push(`${args.home.name} hitters are using rating-backed projections because linked/cached sim hitter rows were unavailable.`);
  if (awayStarter) warnings.push(`${args.away.name} starter is using rating-backed projection because linked/cached sim starter row was unavailable.`);
  if (homeStarter) warnings.push(`${args.home.name} starter is using rating-backed projection because linked/cached sim starter row was unavailable.`);
  return {
    hitters: { away: awayHitters, home: homeHitters },
    starters: {
      away: awayStarter ? toStarter(awayStarter, { side: "away", teamName: args.away.name, opposingRuns: args.home.projectedRuns }) : null,
      home: homeStarter ? toStarter(homeStarter, { side: "home", teamName: args.home.name, opposingRuns: args.away.projectedRuns }) : null
    },
    warnings
  };
}
