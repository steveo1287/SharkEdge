import { fetchMlbGameData } from "./sources/mlb-stats-api";
import { fetchSavantData } from "./sources/savant-adapter";
import { fetchFangraphsSplits } from "./sources/fangraphs-adapter";
import { fetchWeather } from "./sources/weather-adapter";
import { fetchOpponentStrikeoutRate } from "./sources/opponent-splits-adapter";
import { buildWeightedLineupK } from "./sources/lineup-weighted-k";

function derivePA(spot?: number | null) {
  const s = spot ?? 5;
  if (s <= 2) return 4.8;
  if (s <= 5) return 4.4;
  if (s <= 7) return 4.0;
  return 3.6;
}

export async function buildMlbEliteContext(input: {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
}) {
  const game = await fetchMlbGameData(input);

  const [savant, splits, weather, opponent, lineupWeighted] = await Promise.all([
    fetchSavantData(input.playerName),
    fetchFangraphsSplits(input.playerName),
    fetchWeather(game?.venue ?? undefined),
    fetchOpponentStrikeoutRate(input.opponent),
    buildWeightedLineupK(input.opponent)
  ]);

  return {
    playerName: input.playerName,
    lineupSpot: game?.lineupSpot ?? 5,
    pitcherHand: game?.pitcherHand ?? "R",

    seasonAvg: game?.seasonAvg ?? null,
    last7Avg: game?.last7Avg ?? null,

    xwOBA: savant?.xwoba ?? null,
    barrelRate: savant?.barrel ?? null,

    vsHandWoba: splits?.wobaVsHand ?? null,
    vsHandKRate: splits?.kRateVsHand ?? null,

    pitcherKRate: game?.pitcherKRate ?? null,
    opponentKRate:
      lineupWeighted?.weightedKRate ??
      opponent?.opponentKRate ??
      null,
    weightedLineupKRate: lineupWeighted?.weightedKRate ?? null,
    pitchCount: game?.pitchCount ?? null,

    parkFactor: splits?.parkFactor ?? 1,
    windFactor: weather?.windOut ?? 1,
    tempFactor: weather?.runBoost ?? 1,

    projectedPA: derivePA(game?.lineupSpot ?? 5),

    source: "elite"
  };
}
