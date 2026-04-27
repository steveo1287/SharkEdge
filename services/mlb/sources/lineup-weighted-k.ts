import { fetchConfirmedLineup } from "./mlb-lineup-adapter";
import { fetchPlayerKRate } from "./player-k-rate-adapter";

export async function buildWeightedLineupK(team?: string) {
  const { lineup } = await fetchConfirmedLineup(team);

  if (!lineup.length) {
    return {
      weightedKRate: null,
      confidence: 0,
      reason: "No confirmed lineup"
    };
  }

  const weights = [
    1.15, // 1
    1.12, // 2
    1.10, // 3
    1.08, // 4
    1.05, // 5
    1.00, // 6
    0.95, // 7
    0.90, // 8
    0.85  // 9
  ];

  const results = await Promise.all(
    lineup.map(async (p) => {
      const kRate = await fetchPlayerKRate(p.playerId);
      return {
        kRate,
        weight: weights[p.battingOrder - 1] ?? 1
      };
    })
  );

  let totalWeight = 0;
  let weightedSum = 0;

  for (const r of results) {
    if (r.kRate) {
      weightedSum += r.kRate * r.weight;
      totalWeight += r.weight;
    }
  }

  return {
    weightedKRate: totalWeight ? weightedSum / totalWeight : null,
    confidence: totalWeight ? 0.9 : 0.3,
    reason: "Confirmed lineup weighted K%"
  };
}
