import { NextResponse } from "next/server";

import { buildSimulationEnhancementReport } from "@/services/analytics/xfactor-engine";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const eventId = searchParams.get("eventId") ?? "demo-event";
  const sport = searchParams.get("sport") ?? "MLB";

  const report = buildSimulationEnhancementReport({
    sport,
    eventId,
    weather: {
      indoor: false,
      surface: "grass",
      altitudeFt: 650,
      travelMilesHome: 55,
      travelMilesAway: 820,
      circadianPenaltyHome: 0,
      circadianPenaltyAway: 0.08,
      providers: [
        {
          provider: "Windy",
          model: "ECMWF",
          temperatureF: 63,
          windMph: 12,
          gustMph: 19,
          humidityPct: 58,
          precipitationProbabilityPct: 22,
          cloudCoverPct: 44,
          confidence: 0.74,
          notes: ["Premium forecast source placeholder; wire to server-side fetcher with API compliance."]
        },
        {
          provider: "Open-Meteo",
          model: "ICON",
          temperatureF: 61,
          windMph: 10,
          gustMph: 16,
          humidityPct: 61,
          precipitationProbabilityPct: 28,
          cloudCoverPct: 51,
          confidence: 0.67
        },
        {
          provider: "NOAA",
          model: "NDFD",
          temperatureF: 62,
          windMph: 11,
          gustMph: 17,
          humidityPct: 60,
          precipitationProbabilityPct: 25,
          cloudCoverPct: 47,
          confidence: 0.72
        }
      ]
    },
    offenseVsDefenseGap: 0.14,
    tempoGap: 0.08,
    styleClash: 0.11,
    travelFatigueAway: 0.13,
    travelFatigueHome: 0.02,
    playerMatchups: [
      {
        player: "Lead guard / leadoff archetype",
        opponent: "Primary point-of-attack defender / starter archetype",
        edge: 0.12,
        reason: "Historical on-ball advantage and favorable coverage profile."
      }
    ],
    ratings: {
      teamOverall: 86,
      teamOffense: 84,
      teamDefense: 82,
      starPowerIndex: 0.68,
      depthIndex: 0.61
    }
  });

  return NextResponse.json(report);
}
