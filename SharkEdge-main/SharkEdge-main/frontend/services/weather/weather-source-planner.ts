import type { OpportunityView } from "@/lib/types/opportunity";
import type { WeatherJoinStatus, WeatherSourcePlanView } from "@/services/weather/provider-types";
import { inferVenueWeatherJoin } from "@/services/weather/venue-station-join";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function derivePayloadJoinStatus(
  text: string,
  applicable: boolean,
  joinedPatterns: RegExp[]
): WeatherJoinStatus {
  if (!applicable) return "NOT_APPLICABLE";
  if (hasAny(text, joinedPatterns)) return "PAYLOAD_ONLY";
  return "MISSING";
}

function isOutdoorLeague(league: OpportunityView["league"]) {
  return ["MLB", "NFL", "NCAAF"].includes(league);
}

function inferSensitivity(opportunity: OpportunityView): WeatherSourcePlanView["sensitivity"] {
  if (!isOutdoorLeague(opportunity.league)) return "NOT_APPLICABLE";

  const market = normalize(opportunity.marketType);
  const selection = normalize(opportunity.selectionLabel);
  if (
    /total|runs|points|passing|kicking|field goal|home run|hits|strikeout|longest|yard/.test(
      `${market} ${selection}`
    )
  ) {
    return "HIGH";
  }

  if (/moneyline|spread|side|first half/.test(market)) {
    return "MEDIUM";
  }

  return "LOW";
}

export function buildWeatherSourcePlan(opportunity: OpportunityView): WeatherSourcePlanView {
  const joinedVenue = inferVenueWeatherJoin(opportunity);
  const applicableFromLeague = isOutdoorLeague(opportunity.league);
  const applicable = applicableFromLeague && joinedVenue.weatherExposure !== "INDOOR";
  const sensitivity = inferSensitivity(opportunity);

  const sourceText = normalize(
    [
      opportunity.eventLabel,
      opportunity.triggerSummary,
      opportunity.killSummary,
      opportunity.sourceNote,
      opportunity.reasonSummary,
      ...opportunity.whyItShows,
      ...opportunity.whatCouldKillIt
    ].join(" | ")
  );

  const payloadStationStatus = derivePayloadJoinStatus(sourceText, applicable, [
    /metar/,
    /asos/,
    /station/,
    /airport/,
    /wx station/,
    /obs/,
    /forecast office/
  ]);

  const payloadVenueStatus = derivePayloadJoinStatus(sourceText, applicable, [
    /venue/,
    /stadium/,
    /park factor/,
    /roof open/,
    /roof closed/,
    /ballpark/,
    /altitude/
  ]);

  const stationJoinStatus =
    joinedVenue.stationJoinStatus === "JOINED" ? "JOINED" : payloadStationStatus;
  const venueJoinStatus =
    joinedVenue.venueJoinStatus === "JOINED" ? "JOINED" : payloadVenueStatus;

  const primaryObservationProvider = applicable ? "METAR" : null;
  const primaryForecastProvider =
    applicable && sensitivity === "HIGH" ? "HRRR" : applicable ? "NWS" : null;
  const visualizationProvider = applicable ? "WINDY" : null;
  const settlementProvider = applicable ? "METAR" : null;

  let confidence = 0;
  if (!applicable) {
    confidence = 0;
  } else {
    confidence =
      (stationJoinStatus === "JOINED" ? 36 : stationJoinStatus === "PAYLOAD_ONLY" ? 22 : 8) +
      (venueJoinStatus === "JOINED" ? 28 : venueJoinStatus === "PAYLOAD_ONLY" ? 16 : 6) +
      (joinedVenue.roofType === "OPEN_AIR" ? 10 : joinedVenue.roofType === "RETRACTABLE" ? 5 : 2) +
      (joinedVenue.windSensitivity === "HIGH" ? 10 : joinedVenue.windSensitivity === "MEDIUM" ? 6 : 3) +
      (sensitivity === "HIGH" ? 12 : sensitivity === "MEDIUM" ? 7 : 4);
  }

  confidence = clamp(confidence, 0, 100);

  const providerNotes: string[] = [];
  if (applicable) {
    providerNotes.push("Use METAR/ASOS as the observation truth layer when station mapping is available.");
    providerNotes.push(
      sensitivity === "HIGH"
        ? "Use HRRR near start time for short-horizon forecast updates."
        : "Use NWS as the default forecast baseline."
    );
    providerNotes.push("Use Windy as the visualization/model-comparison layer, not the sole canonical truth source.");
    providerNotes.push(...joinedVenue.notes.slice(0, 2));

    if (joinedVenue.roofType === "RETRACTABLE") {
      providerNotes.push("Roof status still needs a live game-day join to know whether weather is active or muted.");
    }
    if (stationJoinStatus !== "JOINED") {
      providerNotes.push("Station join is not fully wired yet, so weather confidence should stay capped.");
    }
  }

  const summary = !applicable
    ? joinedVenue.weatherExposure === "INDOOR"
      ? "Venue context indicates an indoor or insulated environment, so weather should be largely muted."
      : "Weather sourcing is not a primary driver for this league."
    : stationJoinStatus === "JOINED" && venueJoinStatus === "JOINED"
      ? `Weather stack is joined to ${joinedVenue.venueName ?? "the venue"} and station ${joinedVenue.stationCode ?? "n/a"}.`
      : stationJoinStatus !== "MISSING" || venueJoinStatus !== "MISSING"
        ? "Weather stack has partial context but still needs full venue/station joining."
        : "Weather stack is planned, but live station and venue joins are still missing.";

  return {
    applicable,
    sensitivity,
    primaryObservationProvider,
    primaryForecastProvider,
    visualizationProvider,
    settlementProvider,
    stationJoinStatus,
    venueJoinStatus,
    sourceConfidence: confidence,
    summary,
    providerNotes,
    venueName: joinedVenue.venueName,
    venueKey: joinedVenue.venueKey,
    stationCode: joinedVenue.stationCode,
    stationName: joinedVenue.stationName,
    roofType: joinedVenue.roofType,
    weatherExposure: joinedVenue.weatherExposure,
    altitudeFeet: joinedVenue.altitudeFeet,
    parkFactorNote: joinedVenue.parkFactorNote,
    windSensitivity: joinedVenue.windSensitivity,
    homeTeam: joinedVenue.homeTeam,
    awayTeam: joinedVenue.awayTeam,
    joinMethod: joinedVenue.joinMethod
  };
}
