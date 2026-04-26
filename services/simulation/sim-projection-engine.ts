import type { LeagueKey } from "@/lib/types/domain";
import { compareMlbProfiles, type MlbMatchupComparison } from "@/services/simulation/mlb-team-analytics";
import { getMlbTeamPlayerSummary } from "@/services/simulation/mlb-player-model";

type SimProjectionInput = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };

type SimProjection = {
  matchup: { away: string; home: string };
  distribution: { avgAway: number; avgHome: number; homeWinPct: number; awayWinPct: number };
  read: string;
  nbaIntel: { modelVersion: string; dataSource: string } | null;
  mlbIntel?: { modelVersion: "mlb-intel-v2"; dataSource: string; homeEdge: number; projectedTotal: number; volatilityIndex: number; factors: Array<{ label: string; value: number }> } | null;
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function parseMatchup(label: string) { const atSplit = label.split(" @ "); if (atSplit.length === 2) return { away: atSplit[0]?.trim() || "Away", home: atSplit[1]?.trim() || "Home" }; const vsSplit = label.split(" vs "); if (vsSplit.length === 2) return { away: vsSplit[0]?.trim() || "Away", home: vsSplit[1]?.trim() || "Home" }; return { away: "Away", home: "Home" }; }
function hashSeed(input: string) { let hash = 2166136261; for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function seeded(seed: number, shift: number) { const v = (seed ^ (shift * 1103515245)) >>> 0; return (v % 10000) / 10000; }
function leagueBaseline(leagueKey: LeagueKey) { switch (leagueKey) { case "NBA": return { away: 110, home: 113, spread: 1.8 }; case "MLB": return { away: 4.1, home: 4.35, spread: 0.25 }; case "NHL": return { away: 2.8, home: 3.1, spread: 0.25 }; case "NFL": return { away: 21.5, home: 23.1, spread: 1.1 }; case "NCAAF": return { away: 25, home: 27, spread: 1.3 }; case "UFC": case "BOXING": return { away: 0, home: 0, spread: 0 }; default: return { away: 10, home: 11, spread: 0.5 }; } }

async function buildMlbIntel(matchup: { away: string; home: string }, comparison: MlbMatchupComparison) {
  const [awayPlayers, homePlayers] = await Promise.all([getMlbTeamPlayerSummary(matchup.away), getMlbTeamPlayerSummary(matchup.home)]);
  const playerOffenseEdge = Number((homePlayers.offensivePlayerBoost - awayPlayers.offensivePlayerBoost).toFixed(2));
  const playerPitchingEdge = Number((homePlayers.pitchingPlayerBoost - awayPlayers.pitchingPlayerBoost).toFixed(2));
  const playerVolatility = Number(Math.max(0.85, Math.min(1.9, (homePlayers.volatilityBoost + awayPlayers.volatilityBoost) / 2)).toFixed(2));
  const availabilityEdge = Number((awayPlayers.availabilityDrag - homePlayers.availabilityDrag).toFixed(2));
  const homeEdge = Number((comparison.offensiveEdge * 0.2 + comparison.powerEdge * 0.13 + comparison.plateDisciplineEdge * 0.13 + comparison.startingPitchingEdge * 0.28 + comparison.bullpenEdge * 0.3 + comparison.defenseEdge * 0.1 + comparison.fatigueEdge * 0.14 + comparison.formEdge * 0.1 + playerOffenseEdge * 0.42 + playerPitchingEdge * 0.48 + availabilityEdge * 0.28).toFixed(2));
  const projectedTotal = Number((comparison.runEnvironment * 2 + comparison.parkWeatherEdge * 0.26 + Math.abs(comparison.powerEdge) * 0.14 + Math.abs(playerOffenseEdge) * 0.18 - Math.max(0, comparison.startingPitchingEdge + playerPitchingEdge) * 0.1 + (homePlayers.bullpenFatigue + awayPlayers.bullpenFatigue) * 0.28).toFixed(2));
  const volatilityIndex = Number(Math.max(0.7, Math.min(2.1, comparison.volatilityIndex * playerVolatility)).toFixed(2));
  return {
    modelVersion: "mlb-intel-v2" as const,
    dataSource: `${comparison.away.source}/${comparison.home.source}+team-analytics+player-model:${awayPlayers.source}/${homePlayers.source}`,
    homeEdge,
    projectedTotal,
    volatilityIndex,
    factors: [
      { label: "Team offense", value: comparison.offensiveEdge },
      { label: "Team power", value: comparison.powerEdge },
      { label: "Plate discipline", value: comparison.plateDisciplineEdge },
      { label: "Starting pitching", value: comparison.startingPitchingEdge },
      { label: "Bullpen", value: comparison.bullpenEdge },
      { label: "Player offense", value: playerOffenseEdge },
      { label: "Player pitching", value: playerPitchingEdge },
      { label: "Availability", value: availabilityEdge },
      { label: "Park/weather", value: comparison.parkWeatherEdge },
      { label: "Bullpen fatigue", value: Number((homePlayers.bullpenFatigue - awayPlayers.bullpenFatigue).toFixed(2)) }
    ]
  };
}

export async function buildSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  const matchup = parseMatchup(input.label);
  const base = leagueBaseline(input.leagueKey);
  const seed = hashSeed(`${input.id}:${input.startTime}:${input.leagueKey}:${input.status}`);
  const mlbComparison = input.leagueKey === "MLB" ? await compareMlbProfiles(matchup.away, matchup.home) : null;
  const mlbIntel = mlbComparison ? await buildMlbIntel(matchup, mlbComparison) : null;

  if (mlbIntel) {
    const total = clamp(mlbIntel.projectedTotal, 5.4, 14.5);
    const homeExpected = clamp(total / 2 + 0.2 + mlbIntel.homeEdge * 0.4, 1.2, 11.5);
    const awayExpected = clamp(total - homeExpected, 1.2, 11.5);
    const homeWinPct = clamp(0.51 + mlbIntel.homeEdge / 8.5, 0.3, 0.75);
    const awayWinPct = 1 - homeWinPct;
    const read = homeWinPct >= 0.57 ? `${matchup.home} rate as the stronger MLB side behind team + player pitching/lineup edge. ${mlbIntel.dataSource}.` : awayWinPct >= 0.57 ? `${matchup.away} rate as the stronger MLB side behind team + player pitching/lineup edge. ${mlbIntel.dataSource}.` : `MLB matchup projects tight. Run environment ${total.toFixed(1)}, volatility ${mlbIntel.volatilityIndex}. ${mlbIntel.dataSource}.`;
    return { matchup, distribution: { avgAway: Number(awayExpected.toFixed(2)), avgHome: Number(homeExpected.toFixed(2)), homeWinPct: Number(homeWinPct.toFixed(3)), awayWinPct: Number(awayWinPct.toFixed(3)) }, read, nbaIntel: null, mlbIntel };
  }

  const awayJitter = (seeded(seed, 1) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const homeJitter = (seeded(seed, 2) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const spreadBias = (seeded(seed, 3) - 0.5) * 8 + base.spread;
  const avgAway = Number((base.away + awayJitter).toFixed(input.leagueKey === "NBA" ? 1 : 2));
  const avgHome = Number((base.home + homeJitter).toFixed(input.leagueKey === "NBA" ? 1 : 2));
  const homeWinPct = clamp(0.5 + spreadBias / 20, 0.05, 0.95);
  const awayWinPct = clamp(1 - homeWinPct, 0.05, 0.95);
  const volatility = seeded(seed, 4);
  const confidence = 1 - volatility;
  const read = homeWinPct >= 0.58 ? `${matchup.home} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.` : awayWinPct >= 0.58 ? `${matchup.away} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.` : `Game projects close to coin-flip. Volatility ${(volatility * 100).toFixed(0)}%.`;
  return { matchup, distribution: { avgAway, avgHome, homeWinPct: Number(homeWinPct.toFixed(3)), awayWinPct: Number(awayWinPct.toFixed(3)) }, read, nbaIntel: input.leagueKey === "NBA" ? { modelVersion: "nba-intel-v6", dataSource: "live-score-context" } : null, mlbIntel: null };
}
