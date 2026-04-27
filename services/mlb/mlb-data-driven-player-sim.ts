import { buildMlbEliteContext } from "./mlb-data-ingestion-service";
import { buildMlbPitcherStrikeoutOutsModel } from "./mlb-pitcher-strikeout-outs-model";
import { buildMlbBullpenLateInningModel } from "./mlb-bullpen-late-inning-model";

function poisson(mean: number, line: number) {
  let prob = 0;
  for (let k = 0; k <= line; k++) {
    prob += Math.exp(-mean) * Math.pow(mean, k) / factorial(k);
  }
  return 1 - prob;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export async function buildDataDrivenMlbPlayerSim(prop: any) {
  const ctx = await buildMlbEliteContext({
    playerName: prop.player.name,
    team: prop.team?.abbreviation,
    opponent: prop.opponent?.abbreviation
  });

  const isPitcherProp =
    prop.marketType.toLowerCase().includes("strikeout") ||
    prop.marketType.toLowerCase().includes("out");

  if (isPitcherProp) {
    const pitcherModel = buildMlbPitcherStrikeoutOutsModel({
      pitcherName: prop.player.name,
      line: prop.line,
      propType: prop.marketType,
      pitcherKRate: ctx.pitcherKRate,
      opponentKRate: ctx.vsHandKRate,
      pitchCountAvg: ctx.pitchCount,
      weatherRunFactor: ctx.tempFactor
    });
    const edge = (pitcherModel.overProbability - 0.5) * 100;
    const confidence = Math.min(0.9, 0.55 + Math.abs(edge) / 20);
    return {
      probability: pitcherModel.overProbability,
      edgePct: edge,
      confidence,
      decision: edge > 5 ? "ATTACK" : edge > 2 ? "WATCH" : "PASS",
      fairOdds:
        pitcherModel.overProbability > 0.5
          ? -Math.round((pitcherModel.overProbability / (1 - pitcherModel.overProbability)) * 100)
          : Math.round(((1 - pitcherModel.overProbability) / pitcherModel.overProbability) * 100),
      betSizing: {
        stakePct: Math.min(0.05, edge / 100)
      },
      reasons: pitcherModel.reasons,
      riskFlags: pitcherModel.riskFlags,
      ladder: pitcherModel.ladder,
      dataContext: ctx
    };
  }

  const quality =
    ctx.xwOBA ??
    ctx.vsHandWoba ??
    0.32;

  let mean =
    ctx.projectedPA *
    quality *
    ctx.parkFactor *
    ctx.windFactor *
    ctx.tempFactor;

  const bullpen = buildMlbBullpenLateInningModel({
    team: prop.team?.abbreviation,
    opponent: prop.opponent?.abbreviation,
    marketType: prop.marketType,
    baseMean: mean,
    projectedPA: ctx.projectedPA
  });
  mean = bullpen.adjustedMean;

  let prob = poisson(mean, prop.line);
  prob = Math.max(0.001, Math.min(0.999, prob + bullpen.probabilityShift));
  const edge = (prob - 0.5) * 100;
  const confidence = Math.min(
    0.9,
    0.55 + Math.abs(edge) / 20 + bullpen.confidenceShift
  );

  return {
    probability: prob,
    edgePct: edge,
    confidence,
    decision: edge > 5 ? "ATTACK" : edge > 2 ? "WATCH" : "PASS",
    fairOdds:
      prob > 0.5
        ? -Math.round((prob / (1 - prob)) * 100)
        : Math.round(((1 - prob) / prob) * 100),
    betSizing: {
      stakePct: Math.min(0.05, edge / 100)
    },
    reasons: [
      `PA ${ctx.projectedPA}`,
      `Quality ${quality.toFixed(3)}`,
      ...bullpen.reasons
    ],
    riskFlags: bullpen.riskFlags,
    dataContext: ctx
  };
}
