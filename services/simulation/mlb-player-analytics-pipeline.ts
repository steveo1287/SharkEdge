export type MlbPlayerAnalyticsRow = {
  playerName: string;
  teamName: string;
  playerType: "hitter" | "starter" | "reliever" | "two-way" | "unknown";
  role: string;
  bats: "L" | "R" | "S" | "unknown";
  throws: "L" | "R" | "unknown";
  status: "available" | "questionable" | "doubtful" | "out" | "unknown";
  projectedPa: number;
  projectedInnings: number;
  lineupSpot: number;
  wrcPlus: number;
  xwoba: number;
  isoPower: number;
  kRate: number;
  bbRate: number;
  hardHitRate: number;
  barrelRate: number;
  stolenBaseValue: number;
  defenseValue: number;
  pitcherEraMinus: number;
  pitcherXFip: number;
  pitcherKRate: number;
  pitcherBbRate: number;
  groundBallRate: number;
  platoonVsLhp: number;
  platoonVsRhp: number;
  fatigueRisk: number;
  leverageIndex: number;
};

type RawPlayer = Record<string, unknown>;

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function side(value: unknown, fallback: "L" | "R" | "S" | "unknown") {
  const v = String(value ?? "").toUpperCase();
  if (v === "L" || v === "R" || v === "S") return v;
  return fallback;
}

function throwsSide(value: unknown, fallback: "L" | "R" | "unknown") {
  const v = String(value ?? "").toUpperCase();
  if (v === "L" || v === "R") return v;
  return fallback;
}

function statusFrom(value: unknown): MlbPlayerAnalyticsRow["status"] {
  const v = String(value ?? "available").toLowerCase();
  if (v.includes("out") || v.includes("injured") || v.includes("il") || v.includes("inactive")) return "out";
  if (v.includes("doubt")) return "doubtful";
  if (v.includes("question")) return "questionable";
  if (v.includes("active") || v.includes("available") || v.includes("probable")) return "available";
  return "unknown";
}

function playerTypeFrom(value: unknown, innings: number, pa: number): MlbPlayerAnalyticsRow["playerType"] {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("starter") || v === "sp") return "starter";
  if (v.includes("reliever") || v === "rp" || v.includes("closer")) return "reliever";
  if (v.includes("two")) return "two-way";
  if (v.includes("hitter") || v.includes("batter") || pa > 0) return "hitter";
  if (innings >= 3) return "starter";
  if (innings > 0) return "reliever";
  return "unknown";
}

export function rowsFromMlbPlayerBody(body: any): RawPlayer[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.players)) return body.players;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.profiles)) return body.profiles;
  if (Array.isArray(body?.rosters)) return body.rosters.flatMap((team: any) => Array.isArray(team?.players) ? team.players.map((p: any) => ({ ...p, teamName: p.teamName ?? team.teamName ?? team.team })) : []);
  return [];
}

export function normalizeMlbPlayerRow(row: RawPlayer): MlbPlayerAnalyticsRow | null {
  const playerName = text(row.playerName, row.player, row.name, row.PLAYER_NAME, row.Name);
  const teamName = text(row.teamName, row.team, row.team_name, row.TEAM_NAME, row.Team);
  if (!playerName || !teamName) return null;
  const projectedPa = num(row.projectedPa ?? row.projected_pa ?? row.PA ?? row.pa, num(row.lineupSpot ?? row.battingOrder, 0) > 0 ? 4 : 0);
  const projectedInnings = num(row.projectedInnings ?? row.projected_ip ?? row.IP ?? row.ip, 0);
  const playerType = playerTypeFrom(row.playerType ?? row.type ?? row.position ?? row.POS, projectedInnings, projectedPa);
  const pitcherEra = num(row.pitcherEra ?? row.ERA, 4.2);
  const pitcherWhip = num(row.pitcherWhip ?? row.WHIP, 1.28);
  const ops = num(row.ops ?? row.OPS, 0.72);
  const obp = num(row.obp ?? row.OBP, 0.315);
  const slg = num(row.slg ?? row.SLG, 0.405);
  return {
    playerName,
    teamName,
    playerType,
    role: text(row.role, row.position, row.POS) ?? playerType,
    bats: side(row.bats ?? row.BATS, "unknown"),
    throws: throwsSide(row.throws ?? row.THROWS, "unknown"),
    status: statusFrom(row.status ?? row.injuryStatus ?? row.injury_status),
    projectedPa,
    projectedInnings,
    lineupSpot: num(row.lineupSpot ?? row.lineup_spot ?? row.battingOrder, 0),
    wrcPlus: num(row.wrcPlus ?? row.wRCPlus ?? row.wRC_plus, 100 + (ops - 0.72) * 80),
    xwoba: num(row.xwoba ?? row.xwOBA ?? row.expected_woba, 0.29 + ops * 0.045),
    isoPower: num(row.isoPower ?? row.ISO ?? row.iso, Math.max(0.08, slg - obp)),
    kRate: num(row.kRate ?? row.KRate ?? row.K_PCT ?? row.k_pct, 22.5),
    bbRate: num(row.bbRate ?? row.BBRate ?? row.BB_PCT ?? row.bb_pct, 8.2),
    hardHitRate: num(row.hardHitRate ?? row.hard_hit_rate, 40),
    barrelRate: num(row.barrelRate ?? row.barrel_rate, 8),
    stolenBaseValue: num(row.stolenBaseValue ?? row.sb_value ?? row.BsR, 0),
    defenseValue: num(row.defenseValue ?? row.defense ?? row.DRS ?? row.OAA, 0),
    pitcherEraMinus: num(row.pitcherEraMinus ?? row.ERA_MINUS, Math.max(65, Math.min(145, (pitcherEra / 4.2) * 100))),
    pitcherXFip: num(row.pitcherXFip ?? row.xFIP ?? row.xfip, Math.max(2.7, Math.min(5.9, pitcherEra + (pitcherWhip - 1.28) * 0.4))),
    pitcherKRate: num(row.pitcherKRate ?? row.pitcher_k_rate ?? row.K_PCT, 22),
    pitcherBbRate: num(row.pitcherBbRate ?? row.pitcher_bb_rate ?? row.BB_PCT, 8),
    groundBallRate: num(row.groundBallRate ?? row.gb_rate ?? row.GB_PCT, 43),
    platoonVsLhp: num(row.platoonVsLhp ?? row.vs_lhp ?? row.wrc_plus_vs_lhp, 0),
    platoonVsRhp: num(row.platoonVsRhp ?? row.vs_rhp ?? row.wrc_plus_vs_rhp, 0),
    fatigueRisk: num(row.fatigueRisk ?? row.fatigue_risk, 0),
    leverageIndex: num(row.leverageIndex ?? row.leverage_index, playerType === "reliever" ? 1.1 : 1)
  };
}

export function normalizeMlbPlayerRows(rows: RawPlayer[]) {
  return rows.map(normalizeMlbPlayerRow).filter((row): row is MlbPlayerAnalyticsRow => Boolean(row));
}
