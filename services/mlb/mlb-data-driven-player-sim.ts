import { buildMlbEliteContext } from "./mlb-data-ingestion-service";

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

  const quality =
    ctx.xwOBA ??
    ctx.vsHandWoba ??
    0.32;

  const mean =
    ctx.projectedPA *
    quality *
    ctx.parkFactor *
    ctx.windFactor *
    ctx.tempFactor;

  const prob = poisson(mean, prop.line);
  const edge = (prob - 0.5) * 100;
  const confidence = Math.min(0.9, 0.55 + Math.abs(edge) / 20);

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
      `Quality ${quality.toFixed(3)}`
    ],
    dataContext: ctx
  };
}

export async function buildDataDrivenMlbPlayerSim(prop: any) {
  const ctx = await buildMlbEliteContext({
    playerName: prop.player.name,
    team: prop.team?.abbreviation,
    opponent: prop.opponent?.abbreviation
  });

  const quality =
    ctx.xwOBA ??
    ctx.vsHandWoba ??
    0.32;

  const mean =
    ctx.projectedPA *
    quality *
    ctx.parkFactor *
    ctx.windFactor *
    ctx.tempFactor;

  const prob = poisson(mean, prop.line);
  const edge = (prob - 0.5) * 100;
  const confidence = Math.min(0.9, 0.55 + Math.abs(edge) / 20);

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
      `Quality ${quality.toFixed(3)}`
    ],
>>>>>>> f4018bb (Add data-driven MLB player simulation with Poisson model)
    dataContext: ctx
  };
}
