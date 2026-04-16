import type { SportStatAdapterInput, SportStatAdapterResult } from "@/lib/types/advanced-stat-adapters";
import { getMlbAdvancedStats } from "@/services/modeling/adapters/mlb-stat-adapter";
import { getNflAdvancedStats } from "@/services/modeling/adapters/nfl-stat-adapter";
import { getNbaAdvancedStats } from "@/services/modeling/adapters/nba-stat-adapter";
import { getNhlAdvancedStats } from "@/services/modeling/adapters/nhl-stat-adapter";
import { getCbbAdvancedStats } from "@/services/modeling/adapters/cbb-stat-adapter";

export async function getSportAdvancedStats(input: SportStatAdapterInput): Promise<SportStatAdapterResult> {
  switch (input.sport) {
    case "MLB":
    case "BASEBALL":
      return getMlbAdvancedStats(input);
    case "NFL":
    case "CFB":
      return getNflAdvancedStats(input);
    case "NBA":
      return getNbaAdvancedStats(input);
    case "NHL":
      return getNhlAdvancedStats(input);
    case "CBB":
    case "NCAAB":
      return getCbbAdvancedStats(input);
    default:
      return {
        sport: input.sport,
        source: "fallback adapter",
        metrics: {},
        notes: [`No advanced stat adapter configured for ${input.sport}.`]
      };
  }
}
