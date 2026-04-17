import type { CombatHistoryRow } from "@/services/modeling/fighter-history-service";

export type UfcOpponentGraphSnapshot = {
  fightsTracked: number;
  averageOpponentWinPct: number;
  bestWinOpponentWinPct: number;
  worstLossOpponentWinPct: number;
  qualityWinCount: number;
  weakWinCount: number;
  badLossCount: number;
  eliteOpponentCount: number;
  oppositionTier: string;
  graphQualityScore: number;
  consistencyScore: number;
};

export type UfcCommonOpponentView = {
  commonOpponentCount: number;
  fighterAEdgeScore: number;
  fighterBEdgeScore: number;
  fighterAWinPct: number;
  fighterBWinPct: number;
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseRecordWinPct(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) return 0.5;
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const total = wins + losses + draws;
  return total ? (wins + draws * 0.5) / total : 0.5;
}

function performanceScore(row: CombatHistoryRow) {
  const baseWin = row.winnerCompetitorId === row.competitorId ? 1 : row.loserCompetitorId === row.competitorId ? 0 : 0.5;
  const method = (row.method ?? "").toLowerCase();
  const round = Number((row.period ?? "").replace(/[^0-9]/g, "")) || 5;
  const finishBoost = baseWin === 1 && (method.includes("ko") || method.includes("tko") || method.includes("sub")) ? 0.22 : 0;
  const earlyBoost = baseWin === 1 ? Math.max(0, (4 - round) * 0.04) : 0;
  const badLossPenalty = baseWin === 0 ? Math.max(0, (4 - round) * 0.05) : 0;
  return clamp(baseWin + finishBoost + earlyBoost - badLossPenalty, 0, 1.3);
}

export function buildUfcOpponentGraphSnapshot(rows: CombatHistoryRow[]): UfcOpponentGraphSnapshot {
  if (!rows.length) {
    return {
      fightsTracked: 0,
      averageOpponentWinPct: 0.5,
      bestWinOpponentWinPct: 0.5,
      worstLossOpponentWinPct: 0.5,
      qualityWinCount: 0,
      weakWinCount: 0,
      badLossCount: 0,
      eliteOpponentCount: 0,
      oppositionTier: "thin",
      graphQualityScore: 5,
      consistencyScore: 5
    };
  }

  let totalOpp = 0;
  let qualityWins = 0;
  let weakWins = 0;
  let badLosses = 0;
  let eliteOpponents = 0;
  let bestWinOpp = 0.5;
  let worstLossOpp = 0.5;
  let perfTotal = 0;

  for (const row of rows) {
    const oppWinPct = parseRecordWinPct(row.opponentRecord);
    totalOpp += oppWinPct;
    if (oppWinPct >= 0.75) eliteOpponents += 1;
    if (row.winnerCompetitorId === row.competitorId) {
      if (oppWinPct >= 0.64) qualityWins += 1;
      if (oppWinPct < 0.48) weakWins += 1;
      bestWinOpp = Math.max(bestWinOpp, oppWinPct);
    } else if (row.loserCompetitorId === row.competitorId) {
      if (oppWinPct < 0.48) badLosses += 1;
      worstLossOpp = Math.min(worstLossOpp, oppWinPct);
    }
    perfTotal += performanceScore(row);
  }

  const averageOpponentWinPct = totalOpp / rows.length;
  const graphQualityScore = clamp(4.1 + averageOpponentWinPct * 5.8 + qualityWins * 0.35 - weakWins * 0.18 - badLosses * 0.22 + eliteOpponents * 0.12, 3.5, 9.8);
  const consistencyScore = clamp(4.4 + perfTotal / rows.length * 3.8 - badLosses * 0.22, 3.4, 9.8);
  const oppositionTier = averageOpponentWinPct >= 0.7 ? "deep" : averageOpponentWinPct >= 0.6 ? "solid" : averageOpponentWinPct >= 0.52 ? "mixed" : "thin";

  return {
    fightsTracked: rows.length,
    averageOpponentWinPct: round(averageOpponentWinPct, 4),
    bestWinOpponentWinPct: round(bestWinOpp, 4),
    worstLossOpponentWinPct: round(worstLossOpp, 4),
    qualityWinCount: qualityWins,
    weakWinCount: weakWins,
    badLossCount: badLosses,
    eliteOpponentCount: eliteOpponents,
    oppositionTier,
    graphQualityScore: round(graphQualityScore, 3),
    consistencyScore: round(consistencyScore, 3)
  };
}

export function buildUfcCommonOpponentView(fighterARows: CombatHistoryRow[], fighterBRows: CombatHistoryRow[]): UfcCommonOpponentView {
  const mapA = new Map(fighterARows.map((row) => [row.opponentCompetitorId ?? "", row]));
  const mapB = new Map(fighterBRows.map((row) => [row.opponentCompetitorId ?? "", row]));
  const commonKeys = [...mapA.keys()].filter((key) => key && mapB.has(key));
  if (!commonKeys.length) {
    return {
      commonOpponentCount: 0,
      fighterAEdgeScore: 0,
      fighterBEdgeScore: 0,
      fighterAWinPct: 0.5,
      fighterBWinPct: 0.5
    };
  }

  let totalA = 0;
  let totalB = 0;
  for (const key of commonKeys) {
    totalA += performanceScore(mapA.get(key)!);
    totalB += performanceScore(mapB.get(key)!);
  }
  const avgA = totalA / commonKeys.length;
  const avgB = totalB / commonKeys.length;
  const edge = clamp((avgA - avgB) * 8.5, -2.2, 2.2);

  return {
    commonOpponentCount: commonKeys.length,
    fighterAEdgeScore: round(edge, 3),
    fighterBEdgeScore: round(-edge, 3),
    fighterAWinPct: round(avgA / 1.3, 4),
    fighterBWinPct: round(avgB / 1.3, 4)
  };
}
