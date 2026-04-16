import type { SportStatAdapterInput, SportStatAdapterResult } from "@/lib/types/advanced-stat-adapters";

export async function getNhlAdvancedStats(input: SportStatAdapterInput): Promise<SportStatAdapterResult> {
  return {
    sport: "NHL",
    source: "provider-backed placeholder adapter",
    metrics: {
      xgoals: 0.68,
      corsi: 0.61,
      pdo: 0.49,
      high_danger_share: 0.63
    },
    notes: [
      `Event ${input.eventId}: NHL adapter ready for xG, Corsi, PDO, and danger-share inputs.`
    ]
  };
}
