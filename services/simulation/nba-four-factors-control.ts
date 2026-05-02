import { readNbaWarehouseFeed } from "@/services/data/nba/warehouse-feed";

export type NbaFourFactorKey = "shooting" | "turnovers" | "rebounding" | "freeThrows";

export type NbaFourFactorTeamProfile = {
  teamName: string;
  efgPct: number | null;
  opponentEfgPct: number | null;
  tovPct: number | null;
  opponentTovPct: number | null;
  orbPct: number | null;
  drbPct: number | null;
  ftRate: number | null;
  opponentFtRate: number | null;
  dataPoints: number;
};

export type NbaFourFactorEdge = {
  key: NbaFourFactorKey;
  label: string;
  weight: number;
  homeEdge: number;
  direction: "HOME" | "AWAY" | "NEUTRAL";
  confidence: number;
  reason: string;
};

export type NbaFourFactorsControl = {
  source: string;
  away: NbaFourFactorTeamProfile;
  home: NbaFourFactorTeamProfile;
  edges: NbaFourFactorEdge[];
  homeCompositeEdge: number;
  projectedMarginAdjustment: number;
  confidenceScore: number;
  warnings: string[];
};

type Row = Record<string, unknown>;

const FACTOR_WEIGHTS: Record<NbaFourFactorKey, number> = {
  shooting: 0.4,
  turnovers: 0.25,
  rebounding: 0.2,
  freeThrows: 0.15
};

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function teamRows(rows: Row[], teamName: string) {
  const key = normalizeName(teamName);
  return rows.filter((row) => {
    const candidates = [
      text(row.teamName), text(row.team), text(row.team_name), text(row.TEAM_NAME),
      text(row.teamAbbreviation), text(row.team_abbreviation), text(row.TEAM_ABBREVIATION)
    ].filter(Boolean) as string[];
    return candidates.some((candidate) => {
      const normalized = normalizeName(candidate);
      return normalized === key || normalized.endsWith(key) || key.endsWith(normalized);
    });
  });
}

function average(values: Array<number | null>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function rate(value: number | null) {
  if (value == null) return null;
  if (value > 1.5) return value / 100;
  return value;
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

function profileFor(teamName: string, rows: Row[]): NbaFourFactorTeamProfile {
  const selected = teamRows(rows, teamName);
  const candidates = selected.length ? selected : rows.filter((row) => text(row.teamName, row.team, row.TEAM_NAME) == null).slice(0, 0);

  const efgPct = average(candidates.map((row) => rate(num(row.efgPct, row.eFGPct, row.EFG_PCT, row.effectiveFieldGoalPct)) ?? ratio((num(row.fgm, row.FGM) ?? 0) + 0.5 * (num(row.fg3m, row.threePm, row.FG3M) ?? 0), num(row.fga, row.FGA))));
  const opponentEfgPct = average(candidates.map((row) => rate(num(row.opponentEfgPct, row.oppEfgPct, row.OPP_EFG_PCT, row.defensiveEfgPct))));
  const tovPct = average(candidates.map((row) => rate(num(row.tovPct, row.turnoverPct, row.TOV_PCT)) ?? ratio(num(row.turnovers, row.tov, row.TOV), (num(row.fga, row.FGA) ?? 0) + 0.44 * (num(row.fta, row.FTA) ?? 0) + (num(row.turnovers, row.tov, row.TOV) ?? 0))));
  const opponentTovPct = average(candidates.map((row) => rate(num(row.opponentTovPct, row.oppTovPct, row.OPP_TOV_PCT, row.defensiveTovPct))));
  const orbPct = average(candidates.map((row) => rate(num(row.orbPct, row.offRebPct, row.OREB_PCT))));
  const drbPct = average(candidates.map((row) => rate(num(row.drbPct, row.defRebPct, row.DREB_PCT))));
  const ftRate = average(candidates.map((row) => rate(num(row.ftRate, row.freeThrowRate, row.FT_RATE)) ?? ratio(num(row.ftm, row.FTM), num(row.fga, row.FGA))));
  const opponentFtRate = average(candidates.map((row) => rate(num(row.opponentFtRate, row.oppFtRate, row.OPP_FT_RATE, row.defensiveFtRate))));

  return {
    teamName,
    efgPct: efgPct == null ? null : round(efgPct),
    opponentEfgPct: opponentEfgPct == null ? null : round(opponentEfgPct),
    tovPct: tovPct == null ? null : round(tovPct),
    opponentTovPct: opponentTovPct == null ? null : round(opponentTovPct),
    orbPct: orbPct == null ? null : round(orbPct),
    drbPct: drbPct == null ? null : round(drbPct),
    ftRate: ftRate == null ? null : round(ftRate),
    opponentFtRate: opponentFtRate == null ? null : round(opponentFtRate),
    dataPoints: candidates.length
  };
}

function valueOrLeagueMean(value: number | null, mean: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : mean;
}

function edgeDirection(edge: number): NbaFourFactorEdge["direction"] {
  if (edge >= 0.004) return "HOME";
  if (edge <= -0.004) return "AWAY";
  return "NEUTRAL";
}

function factorConfidence(values: Array<number | null>, dataPoints: number) {
  const present = values.filter((value) => typeof value === "number" && Number.isFinite(value)).length / Math.max(1, values.length);
  return round(clamp(present * 0.75 + Math.min(1, dataPoints / 12) * 0.25, 0, 1), 3);
}

function buildEdges(away: NbaFourFactorTeamProfile, home: NbaFourFactorTeamProfile): NbaFourFactorEdge[] {
  const homeEfg = valueOrLeagueMean(home.efgPct, 0.545);
  const awayEfg = valueOrLeagueMean(away.efgPct, 0.545);
  const homeDefEfg = valueOrLeagueMean(home.opponentEfgPct, 0.545);
  const awayDefEfg = valueOrLeagueMean(away.opponentEfgPct, 0.545);
  const homeTov = valueOrLeagueMean(home.tovPct, 0.13);
  const awayTov = valueOrLeagueMean(away.tovPct, 0.13);
  const homeForceTov = valueOrLeagueMean(home.opponentTovPct, 0.13);
  const awayForceTov = valueOrLeagueMean(away.opponentTovPct, 0.13);
  const homeOrb = valueOrLeagueMean(home.orbPct, 0.27);
  const awayOrb = valueOrLeagueMean(away.orbPct, 0.27);
  const homeDrb = valueOrLeagueMean(home.drbPct, 0.73);
  const awayDrb = valueOrLeagueMean(away.drbPct, 0.73);
  const homeFt = valueOrLeagueMean(home.ftRate, 0.205);
  const awayFt = valueOrLeagueMean(away.ftRate, 0.205);
  const homeDefFt = valueOrLeagueMean(home.opponentFtRate, 0.205);
  const awayDefFt = valueOrLeagueMean(away.opponentFtRate, 0.205);

  const shootingEdge = ((homeEfg - awayDefEfg) - (awayEfg - homeDefEfg));
  const turnoverEdge = ((awayTov - homeForceTov) - (homeTov - awayForceTov));
  const reboundingEdge = ((homeOrb - awayDrb) - (awayOrb - homeDrb));
  const freeThrowEdge = ((homeFt - awayDefFt) - (awayFt - homeDefFt));

  return [
    {
      key: "shooting",
      label: "Shot quality / eFG matchup",
      weight: FACTOR_WEIGHTS.shooting,
      homeEdge: round(shootingEdge, 4),
      direction: edgeDirection(shootingEdge),
      confidence: factorConfidence([home.efgPct, away.efgPct, home.opponentEfgPct, away.opponentEfgPct], Math.min(home.dataPoints, away.dataPoints)),
      reason: "Compares each offense eFG profile against the opponent defensive eFG profile."
    },
    {
      key: "turnovers",
      label: "Turnover pressure matchup",
      weight: FACTOR_WEIGHTS.turnovers,
      homeEdge: round(turnoverEdge, 4),
      direction: edgeDirection(turnoverEdge),
      confidence: factorConfidence([home.tovPct, away.tovPct, home.opponentTovPct, away.opponentTovPct], Math.min(home.dataPoints, away.dataPoints)),
      reason: "Rewards the side less exposed to turnover pressure and better at creating opponent mistakes."
    },
    {
      key: "rebounding",
      label: "Rebounding possession matchup",
      weight: FACTOR_WEIGHTS.rebounding,
      homeEdge: round(reboundingEdge, 4),
      direction: edgeDirection(reboundingEdge),
      confidence: factorConfidence([home.orbPct, away.orbPct, home.drbPct, away.drbPct], Math.min(home.dataPoints, away.dataPoints)),
      reason: "Compares offensive rebounding chances against opponent defensive rebounding control."
    },
    {
      key: "freeThrows",
      label: "Free-throw pressure matchup",
      weight: FACTOR_WEIGHTS.freeThrows,
      homeEdge: round(freeThrowEdge, 4),
      direction: edgeDirection(freeThrowEdge),
      confidence: factorConfidence([home.ftRate, away.ftRate, home.opponentFtRate, away.opponentFtRate], Math.min(home.dataPoints, away.dataPoints)),
      reason: "Compares free-throw creation against opponent foul/FT prevention profile."
    }
  ];
}

export async function getNbaFourFactorsControl(awayTeam: string, homeTeam: string): Promise<NbaFourFactorsControl> {
  const feed = await readNbaWarehouseFeed("team").catch(() => ({ rows: [], warnings: ["team feed failed"] }));
  const rows = feed.rows ?? [];
  const away = profileFor(awayTeam, rows);
  const home = profileFor(homeTeam, rows);
  const edges = buildEdges(away, home);
  const weightedEdge = edges.reduce((sum, edge) => sum + edge.homeEdge * edge.weight * edge.confidence, 0);
  const confidenceScore = edges.reduce((sum, edge) => sum + edge.confidence * edge.weight, 0);
  const projectedMarginAdjustment = clamp(weightedEdge * 48, -5.5, 5.5);
  const warnings = [
    ...(feed.warnings ?? []),
    rows.length ? null : "No NBA team warehouse rows found; Four Factors control is using league-average fallbacks.",
    away.dataPoints < 3 ? `${away.teamName} Four Factors sample is thin.` : null,
    home.dataPoints < 3 ? `${home.teamName} Four Factors sample is thin.` : null,
    confidenceScore < 0.55 ? "Four Factors confidence is below preferred threshold." : null
  ].filter(Boolean) as string[];

  return {
    source: rows.length ? `nba-team-warehouse:${rows.length}` : "league-average-fallback",
    away,
    home,
    edges,
    homeCompositeEdge: round(weightedEdge, 4),
    projectedMarginAdjustment: round(projectedMarginAdjustment, 2),
    confidenceScore: round(confidenceScore, 3),
    warnings
  };
}
