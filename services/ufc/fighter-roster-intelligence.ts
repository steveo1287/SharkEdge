import { evaluateActiveUfcRosterStatus, type ActiveUfcRosterStatus } from "@/services/ufc/active-roster";
import type { UfcCardDetail } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

export type UfcRosterIntelligenceGrade = "A_PLUS" | "A" | "B" | "WATCH" | "RESEARCH" | "RISK";
export type UfcRosterIntelligenceTag = "PICK_SIDE" | "FINISH_THREAT" | "DECISION_FLOOR" | "MARKET_EDGE" | "DATA_READY" | "ACTIVE_ROSTER" | "SHADOW_ONLY" | "DANGER_FLAG" | "COLD_START";

export type UfcRosterFighterIntelligence = {
  fighterId: string;
  fighterName: string;
  opponentId: string;
  opponentName: string;
  fightId: string;
  eventId: string;
  side: "A" | "B";
  cardSection: string | null;
  boutOrder: number | null;
  activeRoster: ActiveUfcRosterStatus;
  rosterScore: number;
  grade: UfcRosterIntelligenceGrade;
  confidence: number;
  tags: UfcRosterIntelligenceTag[];
  winProbability: number | null;
  pickSide: boolean;
  edgePct: number | null;
  methodProfile: {
    koTko: number | null;
    submission: number | null;
    decision: number | null;
    finishProbability: number | null;
    dominantMethod: "KO_TKO" | "SUBMISSION" | "DECISION" | null;
  };
  dataProfile: {
    dataQualityGrade: string | null;
    confidenceGrade: string | null;
    simInputScore: number | null;
    fighterAuditScore: number | null;
    marketScore: number | null;
    simulationCount: number | null;
    dangerFlagCount: number;
  };
  drivers: string[];
  blockers: string[];
  warnings: string[];
  summary: string;
};

export type UfcCardRosterIntelligence = {
  modelVersion: "ufc-fighter-roster-intelligence-v1";
  eventId: string;
  eventLabel: string;
  generatedAt: string;
  fighterCount: number;
  activeCount: number;
  dataReadyCount: number;
  riskCount: number;
  topFighters: UfcRosterFighterIntelligence[];
  pickSideFighters: UfcRosterFighterIntelligence[];
  finishThreats: UfcRosterFighterIntelligence[];
  decisionFloor: UfcRosterFighterIntelligence[];
  marketEdges: UfcRosterFighterIntelligence[];
  riskFlags: UfcRosterFighterIntelligence[];
  rows: UfcRosterFighterIntelligence[];
  summary: string;
};

function round(value: number, digits = 3) { return Number(value.toFixed(digits)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function pctToScore(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? clamp(value * 100, 0, 100) : 50; }
function gradeScore(value: string | null | undefined) {
  const normalized = value?.toUpperCase() ?? "";
  if (normalized.includes("A")) return 92;
  if (normalized.includes("B")) return 78;
  if (normalized.includes("C")) return 61;
  if (normalized.includes("D")) return 42;
  if (normalized.includes("F")) return 22;
  return 52;
}
function qualityGrade(score: number, warnings: string[]): UfcRosterIntelligenceGrade {
  if (warnings.length && score < 58) return "RISK";
  if (score >= 88) return "A_PLUS";
  if (score >= 78) return "A";
  if (score >= 66) return "B";
  if (score >= 54) return "WATCH";
  return warnings.length ? "RISK" : "RESEARCH";
}
function asArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function methodProfile(fight: UfcOperationalFeedCard) {
  const koTko = fight.methodProbabilities.KO_TKO;
  const submission = fight.methodProbabilities.SUBMISSION;
  const decision = fight.methodProbabilities.DECISION;
  const entries = [
    ["KO_TKO", koTko] as const,
    ["SUBMISSION", submission] as const,
    ["DECISION", decision] as const
  ].filter((entry): entry is ["KO_TKO" | "SUBMISSION" | "DECISION", number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
  const dominantMethod = entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const finishProbability = typeof koTko === "number" && typeof submission === "number" ? round(koTko + submission, 4) : null;
  return { koTko, submission, decision, finishProbability, dominantMethod };
}
function auditForSide(fight: UfcOperationalFeedCard, side: "A" | "B") {
  const audit = fight.simInputAudit;
  return side === "A" ? audit?.fighterA : audit?.fighterB;
}
function winProbabilityForSide(fight: UfcOperationalFeedCard, side: "A" | "B") {
  return side === "A" ? fight.fighterAWinProbability : fight.fighterBWinProbability;
}
function fighterName(fight: UfcOperationalFeedCard, side: "A" | "B") {
  return side === "A" ? fight.fighterAName ?? "Fighter A" : fight.fighterBName ?? "Fighter B";
}
function fighterId(fight: UfcOperationalFeedCard, side: "A" | "B") {
  return side === "A" ? fight.fighterAId : fight.fighterBId;
}
function opponentName(fight: UfcOperationalFeedCard, side: "A" | "B") {
  return side === "A" ? fight.fighterBName ?? "Fighter B" : fight.fighterAName ?? "Fighter A";
}
function opponentId(fight: UfcOperationalFeedCard, side: "A" | "B") {
  return side === "A" ? fight.fighterBId : fight.fighterAId;
}
function buildTags(args: { pickSide: boolean; method: ReturnType<typeof methodProfile>; edgePct: number | null; active: boolean; dataScore: number; shadowOnly: boolean; danger: number; coldStart: boolean }): UfcRosterIntelligenceTag[] {
  const tags: UfcRosterIntelligenceTag[] = [];
  if (args.pickSide) tags.push("PICK_SIDE");
  if ((args.method.finishProbability ?? 0) >= 0.55) tags.push("FINISH_THREAT");
  if ((args.method.decision ?? 0) >= 0.46) tags.push("DECISION_FLOOR");
  if ((args.edgePct ?? 0) > 0) tags.push("MARKET_EDGE");
  if (args.dataScore >= 72) tags.push("DATA_READY");
  if (args.active) tags.push("ACTIVE_ROSTER");
  if (args.shadowOnly) tags.push("SHADOW_ONLY");
  if (args.danger > 0) tags.push("DANGER_FLAG");
  if (args.coldStart) tags.push("COLD_START");
  return Array.from(new Set(tags.length ? tags : ["DATA_READY"]));
}
function buildFighterRow(fight: UfcOperationalFeedCard, side: "A" | "B", eventId: string): UfcRosterFighterIntelligence {
  const audit = auditForSide(fight, side);
  const method = methodProfile(fight);
  const winProbability = winProbabilityForSide(fight, side);
  const pickSide = fight.pickFighterId === fighterId(fight, side);
  const activeRoster = evaluateActiveUfcRosterStatus({
    payload: fight.predictionJson,
    hasUpcomingUfcFight: true,
    hasRecentUfcFight: true,
    ufcActivityCount: 1
  });
  const fighterAuditScore = audit?.score ?? null;
  const dataQuality = gradeScore(fight.dataQualityGrade);
  const confidenceGrade = gradeScore(fight.confidenceGrade);
  const simInputScore = fight.simInputAudit?.score ?? null;
  const marketScore = fight.simInputAudit?.market.score ?? null;
  const engineScore = fight.simInputAudit?.engineReadiness.score ?? null;
  const danger = fight.dangerFlags.length;
  const coldStart = Boolean(audit?.coldStartActive);
  const warnings = [
    ...asArray(fight.simInputAudit?.warnings),
    ...(audit?.missingCritical?.length ? [`missing_critical:${audit.missingCritical.length}`] : []),
    ...(danger ? [`danger_flags:${danger}`] : []),
    ...(coldStart ? ["cold_start_profile"] : []),
    ...(fight.isShadowOnly ? ["shadow_only"] : [])
  ];
  const blockers = [...asArray(fight.simInputAudit?.blockers), ...(activeRoster.blockers ?? [])];
  const dataScore = clamp((dataQuality * 0.32) + (confidenceGrade * 0.2) + ((fighterAuditScore ?? 55) * 0.22) + ((simInputScore ?? 55) * 0.18) + ((engineScore ?? 55) * 0.08), 0, 100);
  const methodScore = clamp(((method.finishProbability ?? 0.42) * 55) + ((method.decision ?? 0.25) * 18) + (pickSide ? 14 : 0), 0, 100);
  const marketEdgeScore = clamp(50 + ((fight.edgePct ?? 0) * 2.2) + ((marketScore ?? 50) - 50) * 0.2, 0, 100);
  const activityScore = activeRoster.active ? activeRoster.confidence === "high" ? 92 : 78 : 38;
  const probabilityScore = pctToScore(winProbability);
  const riskPenalty = clamp(danger * 5 + blockers.length * 4 + (coldStart ? 8 : 0) + (fight.isShadowOnly ? 9 : 0), 0, 34);
  const rosterScore = round(clamp(probabilityScore * 0.22 + dataScore * 0.24 + methodScore * 0.18 + marketEdgeScore * 0.14 + activityScore * 0.16 + (pickSide ? 6 : 0) - riskPenalty, 0, 100), 2);
  const grade = qualityGrade(rosterScore, warnings);
  const tags = buildTags({ pickSide, method, edgePct: fight.edgePct, active: activeRoster.active, dataScore, shadowOnly: Boolean(fight.isShadowOnly), danger, coldStart });
  const drivers = Array.from(new Set([
    ...activeRoster.signals,
    ...(pickSide ? ["model_pick_side"] : []),
    ...(method.dominantMethod ? [`method:${method.dominantMethod}`] : []),
    ...fight.pathSummary.slice(0, 3),
    ...(fight.marketAware?.reasonCodes ?? [])
  ])).slice(0, 8);
  return {
    fighterId: fighterId(fight, side),
    fighterName: fighterName(fight, side),
    opponentId: opponentId(fight, side),
    opponentName: opponentName(fight, side),
    fightId: fight.fightId,
    eventId,
    side,
    cardSection: fight.cardSection,
    boutOrder: fight.boutOrder,
    activeRoster,
    rosterScore,
    grade,
    confidence: round(clamp((dataScore / 100) * 0.62 + (activeRoster.confidence === "high" ? 0.24 : activeRoster.confidence === "medium" ? 0.16 : 0.08) + (pickSide ? 0.08 : 0.02), 0.12, 0.96), 3),
    tags,
    winProbability,
    pickSide,
    edgePct: fight.edgePct,
    methodProfile: method,
    dataProfile: { dataQualityGrade: fight.dataQualityGrade, confidenceGrade: fight.confidenceGrade, simInputScore, fighterAuditScore, marketScore, simulationCount: fight.simulationCount, dangerFlagCount: danger },
    drivers,
    blockers: Array.from(new Set(blockers)).slice(0, 8),
    warnings: Array.from(new Set(warnings)).slice(0, 8),
    summary: `${fighterName(fight, side)}: ${grade.replace("_", "+")} roster score ${rosterScore}; ${pickSide ? "model pick side" : "opponent/lean side"}; ${method.dominantMethod ? `method lean ${method.dominantMethod}` : "method lean unavailable"}.`
  };
}
function top(rows: UfcRosterFighterIntelligence[], predicate: (row: UfcRosterFighterIntelligence) => boolean, limit = 8) {
  return rows.filter(predicate).sort((a, b) => b.rosterScore - a.rosterScore || (a.boutOrder ?? 99) - (b.boutOrder ?? 99)).slice(0, limit);
}
export function buildUfcCardRosterIntelligence(card: Pick<UfcCardDetail, "eventId" | "eventLabel" | "fights">, generatedAt = new Date().toISOString()): UfcCardRosterIntelligence {
  const rows = card.fights.flatMap((fight) => [buildFighterRow(fight, "A", card.eventId), buildFighterRow(fight, "B", card.eventId)])
    .sort((a, b) => b.rosterScore - a.rosterScore || (a.boutOrder ?? 99) - (b.boutOrder ?? 99));
  const topFighters = rows.slice(0, 10);
  const pickSideFighters = top(rows, (row) => row.pickSide, 10);
  const finishThreats = top(rows, (row) => row.tags.includes("FINISH_THREAT"), 8);
  const decisionFloor = top(rows, (row) => row.tags.includes("DECISION_FLOOR"), 8);
  const marketEdges = top(rows, (row) => row.tags.includes("MARKET_EDGE"), 8);
  const riskFlags = rows.filter((row) => row.tags.includes("DANGER_FLAG") || row.tags.includes("COLD_START") || row.tags.includes("SHADOW_ONLY") || row.grade === "RISK").sort((a, b) => b.warnings.length - a.warnings.length || a.rosterScore - b.rosterScore).slice(0, 10);
  const activeCount = rows.filter((row) => row.activeRoster.active).length;
  const dataReadyCount = rows.filter((row) => row.tags.includes("DATA_READY")).length;
  return {
    modelVersion: "ufc-fighter-roster-intelligence-v1",
    eventId: card.eventId,
    eventLabel: card.eventLabel,
    generatedAt,
    fighterCount: rows.length,
    activeCount,
    dataReadyCount,
    riskCount: riskFlags.length,
    topFighters,
    pickSideFighters,
    finishThreats,
    decisionFloor,
    marketEdges,
    riskFlags,
    rows,
    summary: rows.length ? `Roster intelligence: ${topFighters[0]?.fighterName ?? "--"} leads the card; ${pickSideFighters.length} pick-side fighters; ${riskFlags.length} roster/data risk flags.` : "Roster intelligence unavailable because no fights are loaded."
  };
}
