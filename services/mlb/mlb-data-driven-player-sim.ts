import type { PropCardView } from "@/lib/types/domain";
import { getMlbPlayerProjectionContext } from "./mlb-player-context-service";

function poissonProb(mean: number, line: number) {
  let prob = 0;
  for (let k = 0; k <= line; k++) {
    prob += Math.exp(-mean) * Math.pow(mean, k) / factorial(k);
  }
  return 1 - prob;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

export async function buildDataDrivenMlbPlayerSim(prop: PropCardView) {
  const ctx = await getMlbPlayerProjectionContext({
    playerName: prop.player.name,
    team: prop.team?.abbreviation,
    opponent: prop.opponent?.abbreviation,
    propType: prop.marketType
  });

  let mean = ctx.seasonAvg ?? prop.line;

  if (ctx.last7Avg && ctx.seasonAvg) {
    mean = (ctx.last7Avg * 0.6 + ctx.seasonAvg * 0.4);
  }

  if (ctx.pitcherKRate && prop.marketType.includes("strikeouts")) {
    mean *= 1 + (ctx.pitcherKRate - 0.22);
  }

  if (ctx.parkFactor) mean *= ctx.parkFactor;
  if (ctx.weatherRunFactor) mean *= ctx.weatherRunFactor;

  const probability = poissonProb(mean, prop.line);

  const edge = (probability - 0.5) * 100;
  const confidence = Math.min(0.9, 0.55 + Math.abs(edge) / 20);

  const decision = edge > 5 && confidence > 0.65 ? "ATTACK" : edge > 2 ? "WATCH" : "PASS";

  return {
    probability,
    edgePct: edge,
    confidence,
    decision,
    fairOdds: probability > 0.5 ? -Math.round((probability / (1 - probability)) * 100) : Math.round(((1 - probability) / probability) * 100),
    betSizing: {
      stakePct: Math.max(0, Math.min(0.05, edge / 100))
    },
    reasons: ["MLB Poisson model", `Mean ${mean.toFixed(2)}`],
    riskFlags: ctx.injuryStatus !== "ACTIVE" ? ["Injury risk"] : [],
    dataContext: ctx
  };
}
