import type {
  MlbProjectionRating,
  MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbPlayerMatchupEdge = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  opponentStarterId: string | null;
  opponentStarterName: string | null;
  opponentStarterHand: "L" | "R";
  hitterSkill: number;
  opponentStarterSkill: number;
  edgeScore: number;
  expectedRunContribution: number;
  primaryDriver: "POWER" | "CONTACT" | "DISCIPLINE" | "PLATOON" | "LINEUP_SLOT" | "STARTER_SUPPRESSION";
  components: {
    contact: number;
    power: number;
    discipline: number;
    split: number;
    currentForm: number;
    baserunning: number;
    lineupSlotMultiplier: number;
  };
};

export type MlbStarterMatchupDiagnostic = {
  pitcherId: string | null;
  pitcherName: string | null;
  team: string;
  roleTier: string | null;
  throws: "L" | "R";
  starterSkill: number;
  opponentOffenseSkill: number;
  edgeAgainstOpponent: number;
  runPreventionScore: number;
  strikeoutScore: number;
  powerSuppressionScore: number;
  staminaScore: number;
  volatilityRisk: number;
};

export type MlbTeamMatchupDiagnostic = {
  team: string;
  confirmedLineup: boolean;
  hitterCount: number;
  lineupSkill: number;
  opponentStarterSkill: number;
  teamEdgeScore: number;
  runDeltaSignal: number;
  confidence: number;
  topAdvantages: MlbPlayerMatchupEdge[];
  topRisks: MlbPlayerMatchupEdge[];
  starter: MlbStarterMatchupDiagnostic;
  warnings: string[];
};

export type MlbPlayerMatchupDiagnosticReport = {
  modelVersion: "mlb-player-matchup-diagnostics-v1";
  awayTeam: string;
  homeTeam: string;
  away: MlbTeamMatchupDiagnostic;
  home: MlbTeamMatchupDiagnostic;
  matchupEdge: {
    awayRunDeltaSignal: number;
    homeRunDeltaSignal: number;
    homeMinusAwayTeamEdge: number;
    lean: "AWAY" | "HOME" | "NEUTRAL";
  };
  warnings: string[];
  reasons: string[];
};

const DEFAULT_SKILL = 70;
const LINEUP_WEIGHTS = [1.08, 1.03, 1.15, 1.16, 1.08, 1, 0.94, 0.89, 0.84];
const STARTER_ROLES = new Set(["ACE", "TOP_ROTATION", "MID_ROTATION", "BACK_END", "OPENER_BULK"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown, fallback = DEFAULT_SKILL) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function normalizeJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  return [];
}

function playerKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function lineupPlayerId(entry: Record<string, unknown>) {
  return playerKey(entry.playerId ?? entry.player_id ?? entry.id ?? entry.mlbId ?? entry.mlb_id);
}

function lineupPlayerName(entry: Record<string, unknown>) {
  return playerKey(entry.playerName ?? entry.player_name ?? entry.name ?? entry.fullName ?? entry.full_name);
}

function findRatingForLineupEntry(entry: Record<string, unknown>, ratings: MlbProjectionRating[]) {
  const id = lineupPlayerId(entry);
  const name = lineupPlayerName(entry);
  return ratings.find((rating) => (id && playerKey(rating.id) === id) || (name && playerKey(rating.name) === name)) ?? null;
}

function pitcherThrows(row: MlbProjectionRating | null): "L" | "R" {
  const throwsValue = String(row?.metrics_json?.throws ?? row?.metrics_json?.handedness ?? "R").toUpperCase();
  return throwsValue.startsWith("L") ? "L" : "R";
}

function hitterSkill(row: MlbProjectionRating | null, pitcherHand: "L" | "R") {
  if (!row) return DEFAULT_SKILL;
  const split = pitcherHand === "L" ? safeNumber(row.vs_lhp) : safeNumber(row.vs_rhp);
  return clamp(
    safeNumber(row.contact) * 0.2 +
      safeNumber(row.power) * 0.22 +
      safeNumber(row.discipline) * 0.18 +
      split * 0.2 +
      safeNumber(row.current_form) * 0.12 +
      safeNumber(row.baserunning) * 0.05 +
      safeNumber(row.fielding) * 0.03,
    35,
    95
  );
}

function pitcherSkill(row: MlbProjectionRating | null) {
  if (!row) return DEFAULT_SKILL;
  return clamp(
    safeNumber(row.xera_quality) * 0.24 +
      safeNumber(row.fip_quality) * 0.2 +
      safeNumber(row.k_bb) * 0.16 +
      (100 - safeNumber(row.hr_risk, 30)) * 0.1 +
      safeNumber(row.groundball_rate) * 0.06 +
      safeNumber(row.platoon_split) * 0.08 +
      safeNumber(row.stamina) * 0.06 +
      (100 - safeNumber(row.recent_workload, 30)) * 0.04 +
      safeNumber(row.arsenal_quality) * 0.06,
    35,
    95
  );
}

export function selectMlbProbableStarter(team: MlbProjectionTeamContext | null | undefined) {
  if (!team) return null;
  const starterId = playerKey(team.lineup?.starting_pitcher_id);
  const starterName = playerKey(team.lineup?.starting_pitcher_name);
  const explicit = team.pitchers.find((pitcher) =>
    (starterId && playerKey(pitcher.id) === starterId) || (starterName && playerKey(pitcher.name) === starterName)
  );
  if (explicit) return explicit;
  const starters = team.pitchers.filter((pitcher) => STARTER_ROLES.has(String(pitcher.role_tier ?? "")));
  return starters.sort((a, b) => safeNumber(b.overall) - safeNumber(a.overall))[0] ?? team.pitchers[0] ?? null;
}

function orderedHitters(team: MlbProjectionTeamContext, opponentStarter: MlbProjectionRating | null) {
  const order = normalizeJsonArray(team.lineup?.batting_order_json);
  const mapped = order.slice(0, 9).map((entry) => findRatingForLineupEntry(entry, team.hitters));
  if (mapped.filter(Boolean).length >= 5) return mapped.slice(0, 9);

  const hand = pitcherThrows(opponentStarter);
  return team.hitters
    .slice()
    .sort((a, b) => hitterSkill(b, hand) - hitterSkill(a, hand))
    .slice(0, 9);
}

function driverForEdge(args: {
  edgeScore: number;
  contact: number;
  power: number;
  discipline: number;
  split: number;
  lineupSlotMultiplier: number;
}) : MlbPlayerMatchupEdge["primaryDriver"] {
  if (args.edgeScore < -5) return "STARTER_SUPPRESSION";
  const drivers = [
    { key: "POWER" as const, value: args.power - DEFAULT_SKILL },
    { key: "CONTACT" as const, value: args.contact - DEFAULT_SKILL },
    { key: "DISCIPLINE" as const, value: args.discipline - DEFAULT_SKILL },
    { key: "PLATOON" as const, value: args.split - DEFAULT_SKILL },
    { key: "LINEUP_SLOT" as const, value: (args.lineupSlotMultiplier - 1) * 100 }
  ];
  return drivers.sort((a, b) => b.value - a.value)[0]?.key ?? "CONTACT";
}

function playerEdge(args: {
  row: MlbProjectionRating;
  team: string;
  battingOrder: number;
  opponentStarter: MlbProjectionRating | null;
}): MlbPlayerMatchupEdge {
  const opponentHand = pitcherThrows(args.opponentStarter);
  const opponentStarterSkill = pitcherSkill(args.opponentStarter);
  const contact = safeNumber(args.row.contact);
  const power = safeNumber(args.row.power);
  const discipline = safeNumber(args.row.discipline);
  const split = opponentHand === "L" ? safeNumber(args.row.vs_lhp) : safeNumber(args.row.vs_rhp);
  const currentForm = safeNumber(args.row.current_form);
  const baserunning = safeNumber(args.row.baserunning);
  const hitterComposite = hitterSkill(args.row, opponentHand);
  const lineupSlotMultiplier = LINEUP_WEIGHTS[clamp(args.battingOrder - 1, 0, 8)] ?? 1;
  const starterKbb = safeNumber(args.opponentStarter?.k_bb);
  const starterHrRisk = safeNumber(args.opponentStarter?.hr_risk, 30);
  const powerEdge = (power - DEFAULT_SKILL) * 0.16 + (starterHrRisk - 30) * 0.22;
  const contactEdge = (contact - DEFAULT_SKILL) * 0.13 - (opponentStarterSkill - DEFAULT_SKILL) * 0.08;
  const disciplineEdge = (discipline - DEFAULT_SKILL) * 0.08 - (starterKbb - DEFAULT_SKILL) * 0.06;
  const splitEdge = (split - DEFAULT_SKILL) * 0.12;
  const slotEdge = (lineupSlotMultiplier - 1) * 10;
  const edgeScore = clamp((hitterComposite - opponentStarterSkill) * 0.75 + powerEdge + contactEdge + disciplineEdge + splitEdge + slotEdge, -45, 45);

  return {
    playerId: args.row.id,
    playerName: args.row.name,
    team: args.team,
    battingOrder: args.battingOrder,
    opponentStarterId: args.opponentStarter?.id ?? null,
    opponentStarterName: args.opponentStarter?.name ?? null,
    opponentStarterHand: opponentHand,
    hitterSkill: round(hitterComposite, 2),
    opponentStarterSkill: round(opponentStarterSkill, 2),
    edgeScore: round(edgeScore, 3),
    expectedRunContribution: round(clamp(edgeScore * 0.018 * lineupSlotMultiplier, -0.42, 0.42), 3),
    primaryDriver: driverForEdge({ edgeScore, contact, power, discipline, split, lineupSlotMultiplier }),
    components: {
      contact: round(contact, 2),
      power: round(power, 2),
      discipline: round(discipline, 2),
      split: round(split, 2),
      currentForm: round(currentForm, 2),
      baserunning: round(baserunning, 2),
      lineupSlotMultiplier: round(lineupSlotMultiplier, 3)
    }
  };
}

function lineupSkill(team: MlbProjectionTeamContext, opponentStarter: MlbProjectionRating | null) {
  const hand = pitcherThrows(opponentStarter);
  const selected = orderedHitters(team, opponentStarter);
  const weighted = selected.map((row, index) => (row ? hitterSkill(row, hand) : DEFAULT_SKILL) * (LINEUP_WEIGHTS[index] ?? 1));
  const weightTotal = selected.map((_, index) => LINEUP_WEIGHTS[index] ?? 1).reduce((sum, value) => sum + value, 0);
  return clamp(weighted.reduce((sum, value) => sum + value, 0) / Math.max(1, weightTotal), 35, 95);
}

function starterDiagnostic(args: {
  team: MlbProjectionTeamContext;
  starter: MlbProjectionRating | null;
  opponentOffenseSkill: number;
}): MlbStarterMatchupDiagnostic {
  const starter = args.starter;
  const skill = pitcherSkill(starter);
  const hrRisk = safeNumber(starter?.hr_risk, 30);
  const kbb = safeNumber(starter?.k_bb);
  const stamina = safeNumber(starter?.stamina);
  const workload = safeNumber(starter?.recent_workload, 30);
  return {
    pitcherId: starter?.id ?? null,
    pitcherName: starter?.name ?? null,
    team: args.team.team,
    roleTier: starter?.role_tier ?? null,
    throws: pitcherThrows(starter),
    starterSkill: round(skill, 2),
    opponentOffenseSkill: round(args.opponentOffenseSkill, 2),
    edgeAgainstOpponent: round(skill - args.opponentOffenseSkill, 3),
    runPreventionScore: round((safeNumber(starter?.xera_quality) + safeNumber(starter?.fip_quality)) / 2, 2),
    strikeoutScore: round(kbb, 2),
    powerSuppressionScore: round(100 - hrRisk, 2),
    staminaScore: round(stamina, 2),
    volatilityRisk: round(clamp(50 + (hrRisk - 30) * 0.5 + (workload - 25) * 0.35 - (kbb - 70) * 0.25 - (stamina - 70) * 0.2, 5, 95), 2)
  };
}

function teamDiagnostic(args: {
  team: MlbProjectionTeamContext;
  opponent: MlbProjectionTeamContext;
  teamRuns: number;
  opponentRuns: number;
}): MlbTeamMatchupDiagnostic {
  const warnings: string[] = [];
  const opponentStarter = selectMlbProbableStarter(args.opponent);
  const ownStarter = selectMlbProbableStarter(args.team);
  const selected = orderedHitters(args.team, opponentStarter);
  const edges = selected.flatMap((row, index) => row ? [playerEdge({ row, team: args.team.team, battingOrder: index + 1, opponentStarter })] : []);
  const teamLineupSkill = lineupSkill(args.team, opponentStarter);
  const opponentStarterSkill = pitcherSkill(opponentStarter);
  const teamEdgeScore = teamLineupSkill - opponentStarterSkill;
  const topAdvantages = edges.slice().sort((a, b) => b.edgeScore - a.edgeScore).slice(0, 5);
  const topRisks = edges.slice().sort((a, b) => a.edgeScore - b.edgeScore).slice(0, 5);
  const topRunContribution = topAdvantages.slice(0, 3).reduce((sum, edge) => sum + Math.max(0, edge.expectedRunContribution), 0);
  const runEnvironmentSignal = clamp((args.teamRuns - args.opponentRuns) * 0.14, -0.28, 0.28);
  const runDeltaSignal = clamp(teamEdgeScore * 0.045 + topRunContribution * 0.35 + runEnvironmentSignal, -1.1, 1.1);
  const confirmedLineup = Boolean(args.team.lineup?.confirmed);
  const hasLineup = normalizeJsonArray(args.team.lineup?.batting_order_json).length >= 5;
  const confidence = clamp(
    (confirmedLineup ? 0.24 : 0) +
      (hasLineup ? 0.18 : 0.08) +
      (args.team.hitters.length >= 9 ? 0.24 : 0.1) +
      (opponentStarter ? 0.22 : 0) +
      (ownStarter ? 0.12 : 0),
    0.22,
    0.95
  );

  if (!confirmedLineup) warnings.push(`${args.team.team} lineup is not confirmed; hitter ordering is probable.`);
  if (!opponentStarter) warnings.push(`${args.team.team} opponent starter is missing; lineup edges are shrunk toward league average.`);
  if (args.team.hitters.length < 9) warnings.push(`${args.team.team} has only ${args.team.hitters.length} hitter ratings available.`);
  if (!ownStarter) warnings.push(`${args.team.team} probable starter is missing.`);

  return {
    team: args.team.team,
    confirmedLineup,
    hitterCount: args.team.hitters.length,
    lineupSkill: round(teamLineupSkill, 2),
    opponentStarterSkill: round(opponentStarterSkill, 2),
    teamEdgeScore: round(teamEdgeScore, 3),
    runDeltaSignal: round(runDeltaSignal, 3),
    confidence: round(confidence, 3),
    topAdvantages,
    topRisks,
    starter: starterDiagnostic({ team: args.team, starter: ownStarter, opponentOffenseSkill: lineupSkill(args.opponent, ownStarter) }),
    warnings
  };
}

export function buildMlbPlayerMatchupDiagnostics(args: {
  away: MlbProjectionTeamContext;
  home: MlbProjectionTeamContext;
  awayRuns: number;
  homeRuns: number;
}): MlbPlayerMatchupDiagnosticReport {
  const away = teamDiagnostic({ team: args.away, opponent: args.home, teamRuns: args.awayRuns, opponentRuns: args.homeRuns });
  const home = teamDiagnostic({ team: args.home, opponent: args.away, teamRuns: args.homeRuns, opponentRuns: args.awayRuns });
  const homeMinusAwayTeamEdge = home.teamEdgeScore - away.teamEdgeScore;
  const lean = homeMinusAwayTeamEdge > 3 ? "HOME" : homeMinusAwayTeamEdge < -3 ? "AWAY" : "NEUTRAL";
  const warnings = [...away.warnings, ...home.warnings];

  return {
    modelVersion: "mlb-player-matchup-diagnostics-v1",
    awayTeam: args.away.team,
    homeTeam: args.home.team,
    away,
    home,
    matchupEdge: {
      awayRunDeltaSignal: away.runDeltaSignal,
      homeRunDeltaSignal: home.runDeltaSignal,
      homeMinusAwayTeamEdge: round(homeMinusAwayTeamEdge, 3),
      lean
    },
    warnings,
    reasons: [
      `${args.away.team} lineup edge ${away.teamEdgeScore.toFixed(1)} generated run-delta signal ${away.runDeltaSignal.toFixed(2)}.`,
      `${args.home.team} lineup edge ${home.teamEdgeScore.toFixed(1)} generated run-delta signal ${home.runDeltaSignal.toFixed(2)}.`,
      `Top player advantages are ranked against probable starter handedness and starter suppression.`,
      lean === "NEUTRAL" ? "No side cleared the player-matchup lean threshold." : `${lean} cleared the player-matchup lean threshold by team-edge differential.`
    ]
  };
}
