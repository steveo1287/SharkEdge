import type { HitterProjection } from "@/services/simulation/mlb-franchise-game-stats";

export type FranchiseEliteBatterGrade = "A+" | "A" | "B+" | "B" | "Watch" | "Fade";

export type FranchiseEliteBatter = HitterProjection & {
  eliteScore: number;
  grade: FranchiseEliteBatterGrade;
  tags: string[];
  warning: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function gradeFranchiseEliteBatter(score: number, warning: string | null): FranchiseEliteBatterGrade {
  if (warning && score < 58) return "Fade";
  if (score >= 86) return "A+";
  if (score >= 78) return "A";
  if (score >= 68) return "B+";
  if (score >= 58) return "B";
  return warning ? "Fade" : "Watch";
}

export function buildFranchiseEliteBatterTags(row: HitterProjection, warning: string | null) {
  const tags: string[] = [];
  if ((row.homeRuns ?? 0) >= 0.18 || (row.totalBases ?? 0) >= 2.2) tags.push("Power ceiling");
  if ((row.hits ?? 0) >= 1.1 || (row.strikeouts ?? 99) <= 0.75) tags.push("Contact floor");
  if ((row.runs ?? 0) + (row.rbi ?? 0) >= 1.15) tags.push("Run/RBI engine");
  if ((row.battingOrder ?? 9) <= 4 && (row.plateAppearances ?? 0) >= 4.1) tags.push("Top-order PA");
  if (warning) tags.push("Risk trap");
  return tags.length ? tags : ["Watch list"];
}

export function scoreFranchiseEliteBatter(row: HitterProjection) {
  const order = row.battingOrder ?? 9;
  const topOrderBoost = order <= 2 ? 5 : order <= 5 ? 3 : order <= 7 ? 1 : 0;
  const contact = row.hits ?? 0;
  const bases = row.totalBases ?? 0;
  const homer = row.homeRuns ?? 0;
  const runProduction = (row.runs ?? 0) + (row.rbi ?? 0);
  const strikeouts = row.strikeouts ?? 0;
  const stolenBaseLift = Math.min(3, (row.stolenBaseChance ?? 0) * 10);
  const riskPenalty = strikeouts >= 1.35 && contact < 0.95 ? 6 : 0;

  // Keep the scale useful for ranking. The old board saturated too many strong bats at 100.
  const score = 22
    + contact * 10
    + bases * 7
    + homer * 35
    + runProduction * 6
    + (row.plateAppearances ?? 0) * 1.6
    + topOrderBoost
    + stolenBaseLift
    - strikeouts * 5.5
    - riskPenalty;

  return Number(clamp(score, 0, 100).toFixed(1));
}

export function buildFranchiseEliteBatters(rows: HitterProjection[]): FranchiseEliteBatter[] {
  return rows
    .map((row) => {
      const warning = (row.strikeouts ?? 0) >= 1.35 && (row.hits ?? 0) < 0.95
        ? "K risk / thin contact floor"
        : null;
      const eliteScore = scoreFranchiseEliteBatter(row);
      return {
        ...row,
        eliteScore,
        grade: gradeFranchiseEliteBatter(eliteScore, warning),
        tags: buildFranchiseEliteBatterTags(row, warning),
        warning
      };
    })
    .sort((left, right) => right.eliteScore - left.eliteScore || (left.battingOrder ?? 99) - (right.battingOrder ?? 99));
}
